import Combine
import Foundation
import UIKit

enum CaptureRecordingDirectiveAction: String, Codable {
    case start = "START"
    case stop = "STOP"
}

enum CaptureRecordingEndpointState: String, Codable {
    case observed = "OBSERVED"
    case started = "STARTED"
    case startFailed = "START_FAILED"
    case stopping = "STOPPING"
    case stopped = "STOPPED"
    case stopFailed = "STOP_FAILED"
}

struct CaptureRecordingDirective: Codable, Equatable, Identifiable {
    let id: String
    let sequence: String
    let action: CaptureRecordingDirectiveAction
    let captureGroupId: String
    let issuedAt: String
    let shouldRecord: Bool
    let participantStatuses: [CaptureRecordingParticipantStatus]?
    let recordingHealth: CaptureRecordingHealth?
    let endpointReceipts: [CaptureRecordingEndpointReceipt]?
}

enum CaptureRecordingParticipantState: String, Codable {
    case recording = "RECORDING"
    case gettingReady = "GETTING_READY"
    case needsAttention = "NEEDS_ATTENTION"
    case stopping = "STOPPING"
    case stoppedSafely = "STOPPED_SAFELY"
    case waiting = "WAITING"
}

struct CaptureRecordingParticipantStatus: Codable, Equatable, Identifiable {
    let id: String
    let participantLabel: String
    let state: CaptureRecordingParticipantState
    let endpointCount: Int
    let recordingEndpointCount: Int
    let attentionEndpointCount: Int
}

struct CaptureRecordingHealth: Codable, Equatable {
    let expectedParticipantCount: Int
    let participantWithEndpointCount: Int
    let recordingParticipantCount: Int
    let attentionParticipantCount: Int
    let waitingParticipantCount: Int
    let allParticipantsRecording: Bool
    let allParticipantsStoppedSafely: Bool
}

struct CaptureRecordingEndpointReceipt: Codable, Equatable, Identifiable {
    let id: String
    let clientKind: String
    let deviceLabel: String
    let participantLabel: String
    let state: CaptureRecordingEndpointState
    let captureId: String?
    let detail: String?
    let occurredAt: String
    let receivedAt: String
}

private struct CaptureRecordingDirectiveResponse: Decodable {
    let ok: Bool
    let error: String?
    let directive: CaptureRecordingDirective?
}

private struct CaptureRecordingEndpointResponse: Decodable {
    let ok: Bool
    let error: String?
    let errorCode: String?
}

private enum CaptureRecordingReceiptDelivery {
    case acknowledged
    case retry(String)
    case rejected(String)
}

/// Coordinates a room-level Record/Stop intent without confusing it with media
/// evidence. The directive says what the host requested; the local recorder,
/// append-only room receipts, upload ledger, and verified RecordingAsset still
/// decide whether this exact iPhone retained any bytes.
@MainActor
final class CaptureRecordingCoordinator: ObservableObject {
    @Published private(set) var currentDirective: CaptureRecordingDirective?
    @Published private(set) var joinConfirmationRequired = false
    @Published private(set) var isSending = false
    @Published private(set) var statusMessage: String?

    let receiptOutbox: CaptureRecordingReceiptOutbox

    private let baseURL = normalizedNestBaseURL(
        ProcessInfo.processInfo.environment["QUIPSLY_API_BASE_URL"]
            ?? (Bundle.main.object(forInfoDictionaryKey: "QUIPSLY_API_BASE_URL") as? String)
            ?? "https://nest.quipsly.com"
    )
    private var observedRoomID: String?
    private var baselineEstablished = false
    private var handledStates: [String: CaptureRecordingEndpointState] = [:]
    private var isFlushingReceipts = false
    private var retryTask: Task<Void, Never>?
    private var outboxObservation: AnyCancellable?

    init(receiptOutbox: CaptureRecordingReceiptOutbox? = nil) {
        let receiptOutbox = receiptOutbox ?? .shared
        self.receiptOutbox = receiptOutbox
        outboxObservation = receiptOutbox.objectWillChange.sink { [weak self] _ in
            self?.objectWillChange.send()
        }
    }

    #if DEBUG && targetEnvironment(simulator)
    /// Stages one network-disabled receipt through the shipping protected
    /// store so an operated relaunch can prove identity and account isolation.
    func stageRecordingReceiptOutboxUITestReceipt(
        roomID: String,
        ownerAccountID: String
    ) throws -> PendingCaptureRecordingReceipt {
        if let existing = receiptOutbox.latest(roomID: roomID) {
            return existing
        }
        let payload = CaptureRecordingReceiptPayload(
            receiptId: UUID(),
            directiveId: "operated-recording-directive",
            state: .started,
            captureId: UUID(),
            clientInstanceId: "ios-operated-outbox",
            clientKind: "ios",
            deviceLabel: "Quipsly Capture · operated simulator",
            detail: "Protected recording-status outbox relaunch evidence.",
            occurredAt: ISO8601DateFormatter().string(from: Date())
        )
        return try receiptOutbox.enqueue(
            roomID: roomID,
            ownerAccountID: ownerAccountID,
            payload: payload
        )
    }
    #endif

    func reset(roomID: String?) {
        guard observedRoomID != roomID else { return }
        observedRoomID = roomID
        baselineEstablished = false
        handledStates = [:]
        currentDirective = nil
        joinConfirmationRequired = false
        statusMessage = nil
    }

    /// Returns only a new command that this endpoint should act on now. A
    /// participant with current Session consent and already-granted system
    /// access joins an active recording without another ceremonial tap. An
    /// endpoint that still needs consent or an iOS permission waits for the
    /// person's ordinary Record action.
    func poll(
        roomID: String,
        localRecordingActive: Bool,
        localRecordingReady: Bool
    ) async -> CaptureRecordingDirective? {
        reset(roomID: roomID)
        await flushPendingReceipts()
        do {
            let directive = try await read(roomID: roomID)
            if !baselineEstablished {
                baselineEstablished = true
                currentDirective = directive
                if directive?.action == .start, !localRecordingActive {
                    if localRecordingReady {
                        joinConfirmationRequired = false
                        statusMessage = "Starting \(CaptureDeviceVocabulary.thisDevicePossessive) recording…"
                        return directive
                    }
                    joinConfirmationRequired = true
                    statusMessage = "Recording is already in progress. Quipsly will start \(CaptureDeviceVocabulary.thisDevice) after your Session choice and iOS access are ready."
                    return nil
                }
                if directive?.action == .stop, localRecordingActive {
                    return directive
                }
                return nil
            }

            currentDirective = directive
            guard let directive else {
                joinConfirmationRequired = false
                return nil
            }
            if joinConfirmationRequired, directive.action == .start {
                guard localRecordingReady,
                      handledStates[directive.id] == nil else { return nil }
                joinConfirmationRequired = false
                statusMessage = "Starting \(CaptureDeviceVocabulary.thisDevicePossessive) recording…"
                return directive
            }
            if directive.action == .stop { joinConfirmationRequired = false }
            if handledStates[directive.id] != nil {
                return nil
            }
            return directive
        } catch {
            // A coordination read failure never stops, deletes, or relabels a
            // local source. The next poll retries without interrupting capture.
            statusMessage = error.localizedDescription
            return nil
        }
    }

    func issue(
        roomID: String,
        action: CaptureRecordingDirectiveAction
    ) async -> CaptureRecordingDirective? {
        guard !isSending else { return nil }
        reset(roomID: roomID)
        baselineEstablished = true
        isSending = true
        defer { isSending = false }
        do {
            var request = try request(roomID: roomID)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "content-type")
            request.httpBody = try JSONSerialization.data(withJSONObject: [
                "requestId": UUID().uuidString.lowercased(),
                "action": action.rawValue,
            ])
            let response: CaptureRecordingDirectiveResponse = try await send(request)
            guard response.ok, let directive = response.directive else {
                throw CoordinatorError.server(response.error ?? "Recording coordination is temporarily unavailable.")
            }
            currentDirective = directive
            joinConfirmationRequired = false
            statusMessage = action == .start
                ? "Starting recording on each ready device…"
                : "Stopping recording on each device…"
            return directive
        } catch {
            statusMessage = error.localizedDescription
            return nil
        }
    }

    func acceptActiveRecording() -> CaptureRecordingDirective? {
        guard joinConfirmationRequired,
              currentDirective?.action == .start else { return nil }
        joinConfirmationRequired = false
        statusMessage = "Starting \(CaptureDeviceVocabulary.thisDevicePossessive) recording…"
        return currentDirective
    }

    func markHandled(
        _ directive: CaptureRecordingDirective,
        state: CaptureRecordingEndpointState
    ) {
        handledStates[directive.id] = state
        if state == .started {
            joinConfirmationRequired = false
        } else if state == .startFailed {
            joinConfirmationRequired = true
        } else if state == .stopped {
            joinConfirmationRequired = false
        }
        statusMessage = handledStatusMessage(for: state)
    }

    /// Atomically claims a directive before an async local start/stop crosses
    /// actor suspension points. The shell observer and a visible host control
    /// can discover the same command at nearly the same time; only one may
    /// operate the endpoint. A failed attempt remains explicitly retryable.
    func claim(_ directive: CaptureRecordingDirective) -> Bool {
        let priorState = handledStates[directive.id]
        switch directive.action {
        case .start:
            guard priorState == nil || priorState == .startFailed else { return false }
            handledStates[directive.id] = .observed
            statusMessage = handledStatusMessage(for: .observed)
        case .stop:
            guard priorState == nil || priorState == .stopFailed else { return false }
            handledStates[directive.id] = .stopping
            statusMessage = handledStatusMessage(for: .stopping)
        }
        return true
    }

    func acknowledge(
        roomID: String,
        directive: CaptureRecordingDirective,
        state: CaptureRecordingEndpointState,
        captureID: UUID? = nil,
        detail: String? = nil
    ) async {
        guard let ownerAccountID = AuthManager.currentStoredOwnerID() else {
            statusMessage = "Recording is safe locally, but Quipsly could not bind its room status to the signed-in account."
            return
        }
        let payload = CaptureRecordingReceiptPayload(
            receiptId: receiptID(
                ownerAccountID: ownerAccountID,
                roomID: roomID,
                directiveID: directive.id,
                state: state
            ),
            directiveId: directive.id,
            state: state,
            captureId: captureID,
            clientInstanceId: CaptureClientInstallation.id,
            clientKind: "ios",
            deviceLabel: deviceLabel,
            detail: normalizedDetail(detail),
            occurredAt: ISO8601DateFormatter().string(from: Date())
        )
        do {
            _ = try receiptOutbox.enqueue(
                roomID: roomID,
                ownerAccountID: ownerAccountID,
                payload: payload
            )
        } catch {
            statusMessage = "Recording is safe locally, but its protected room-status receipt could not be queued. \(error.localizedDescription)"
            return
        }
        await flushPendingReceipts()
    }

    /// Delivers every status transition for the current account with its
    /// original idempotency identity. Process death or a short network outage
    /// can delay collaboration truth, but cannot fabricate or lose a local
    /// capture result.
    func flushPendingReceipts() async {
        guard !isFlushingReceipts else { return }
        guard AuthManager.shared.networkActionsAllowed else {
            if receiptOutbox.pendingCount > 0 {
                statusMessage = "Recording is safe locally; room status is waiting securely on \(CaptureDeviceVocabulary.thisDevice)."
            }
            return
        }
        isFlushingReceipts = true
        defer { isFlushingReceipts = false }

        for receipt in receiptOutbox.pendingReceipts {
            guard receipt.ownerAccountID == AuthManager.currentStoredOwnerID() else {
                return
            }
            switch await deliver(receipt) {
            case .acknowledged:
                receiptOutbox.markAcknowledged(receipt.id)
            case .retry(let message):
                statusMessage = "Recording is safe locally; room status is waiting securely on \(CaptureDeviceVocabulary.thisDevice). \(message)"
                scheduleRetry()
                return
            case .rejected(let message):
                receiptOutbox.markRejected(receipt.id, message: message)
                statusMessage = "Recording is safe locally; Nest rejected one coordination status. \(message)"
            }
        }
        if receiptOutbox.pendingCount == 0 {
            retryTask?.cancel()
            retryTask = nil
            if statusMessage?.hasPrefix(
                "Recording is safe locally; room status is waiting securely"
            ) == true {
                if let directive = currentDirective,
                   let state = handledStates[directive.id] {
                    statusMessage = handledStatusMessage(for: state)
                } else {
                    statusMessage = "Room recording status synchronized."
                }
            }
        }
    }

    private func deliver(
        _ receipt: PendingCaptureRecordingReceipt
    ) async -> CaptureRecordingReceiptDelivery {
        do {
            var request = try request(roomID: receipt.roomID)
            request.httpMethod = "PATCH"
            request.setValue("application/json", forHTTPHeaderField: "content-type")
            let encoder = JSONEncoder()
            request.httpBody = try encoder.encode(receipt.payload)
            let (data, response) = try await AuthManager.shared.authenticatedData(
                for: request
            )
            let packet = try JSONDecoder().decode(
                CaptureRecordingEndpointResponse.self,
                from: data
            )
            if (200..<300).contains(response.statusCode), packet.ok {
                return .acknowledged
            }
            let message = packet.error
                ?? "Recording coordination returned \(response.statusCode)."
            if response.statusCode == 400
                || response.statusCode == 404
                || (response.statusCode == 409
                    && packet.errorCode == "RECEIPT_ID_CONFLICT")
                || response.statusCode == 422 {
                return .rejected(message)
            }
            return .retry(message)
        } catch {
            return .retry(error.localizedDescription)
        }
    }

    private func scheduleRetry() {
        retryTask?.cancel()
        retryTask = Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(30))
            guard !Task.isCancelled else { return }
            await self?.flushPendingReceipts()
        }
    }

    private func read(roomID: String) async throws -> CaptureRecordingDirective? {
        let response: CaptureRecordingDirectiveResponse = try await send(
            try request(roomID: roomID)
        )
        guard response.ok else {
            throw CoordinatorError.server(response.error ?? "Recording coordination is temporarily unavailable.")
        }
        return response.directive
    }

    private func request(roomID: String) throws -> URLRequest {
        guard let encodedRoomID = roomID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed),
              let url = URL(string: "\(baseURL)/api/sessions/\(encodedRoomID)/recording-directive") else {
            throw CoordinatorError.invalidURL
        }
        var request = URLRequest(url: url)
        request.timeoutInterval = 20
        request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        return request
    }

    private func send<Response: Decodable>(_ request: URLRequest) async throws -> Response {
        let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
        let decoded = try JSONDecoder().decode(Response.self, from: data)
        guard (200..<300).contains(response.statusCode) else {
            if let envelope = decoded as? CaptureRecordingDirectiveResponse {
                throw CoordinatorError.server(envelope.error ?? "Recording coordination returned \(response.statusCode).")
            }
            if let envelope = decoded as? CaptureRecordingEndpointResponse {
                throw CoordinatorError.server(envelope.error ?? "Recording coordination returned \(response.statusCode).")
            }
            throw CoordinatorError.server("Recording coordination returned \(response.statusCode).")
        }
        return decoded
    }

    private func receiptID(
        ownerAccountID: String,
        roomID: String,
        directiveID: String,
        state: CaptureRecordingEndpointState
    ) -> UUID {
        let key = "quipsly.capture.recording-directive-receipt.v1.\(ownerAccountID).\(roomID).\(directiveID).\(state.rawValue)"
        if let existing = UserDefaults.standard.string(forKey: key),
           let id = UUID(uuidString: existing) {
            return id
        }
        let created = UUID()
        UserDefaults.standard.set(created.uuidString.lowercased(), forKey: key)
        return created
    }

    private var deviceLabel: String {
        let name = UIDevice.current.name.trimmingCharacters(in: .whitespacesAndNewlines)
        return name.isEmpty ? "Quipsly Capture · \(CaptureDeviceVocabulary.deviceName)" : "Quipsly Capture · \(name)"
    }

    private func normalizedDetail(_ value: String?) -> String? {
        let normalized = value?.trimmingCharacters(in: .whitespacesAndNewlines)
        return normalized?.isEmpty == false ? normalized : nil
    }

    private func handledStatusMessage(
        for state: CaptureRecordingEndpointState
    ) -> String {
        switch state {
        case .observed:
            "Starting \(CaptureDeviceVocabulary.thisDevicePossessive) recording…"
        case .started:
            "Recording on \(CaptureDeviceVocabulary.thisDevice)"
        case .startFailed:
            "Recording couldn’t start on \(CaptureDeviceVocabulary.thisDevice). Your call is still connected; try again."
        case .stopping:
            "Saving \(CaptureDeviceVocabulary.thisDevicePossessive) recording…"
        case .stopped:
            "Recording stopped · source stays protected on \(CaptureDeviceVocabulary.thisDevice)"
        case .stopFailed:
            "\(CaptureDeviceVocabulary.thisDeviceCapitalized) is still protecting its recording. Keep Quipsly open and try again."
        }
    }
}

private enum CoordinatorError: LocalizedError {
    case invalidURL
    case server(String)

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            "Quipsly could not build the private recording-control address."
        case .server(let message):
            message
        }
    }
}
