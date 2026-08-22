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
    let endpointReceipts: [CaptureRecordingEndpointReceipt]?
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

    private let baseURL = normalizedNestBaseURL(
        ProcessInfo.processInfo.environment["QUIPSLY_API_BASE_URL"]
            ?? (Bundle.main.object(forInfoDictionaryKey: "QUIPSLY_API_BASE_URL") as? String)
            ?? "https://nest.quipsly.com"
    )
    private var observedRoomID: String?
    private var baselineEstablished = false
    private var handledStates: [String: CaptureRecordingEndpointState] = [:]

    func reset(roomID: String?) {
        guard observedRoomID != roomID else { return }
        observedRoomID = roomID
        baselineEstablished = false
        handledStates = [:]
        currentDirective = nil
        joinConfirmationRequired = false
        statusMessage = nil
    }

    /// Returns only a new command that this endpoint should act on now. The
    /// first active START observed after entering a room is deliberately held
    /// for one explicit late-join confirmation; entering a room never starts
    /// recording by itself.
    func poll(
        roomID: String,
        localRecordingActive: Bool
    ) async -> CaptureRecordingDirective? {
        reset(roomID: roomID)
        do {
            let directive = try await read(roomID: roomID)
            if !baselineEstablished {
                baselineEstablished = true
                currentDirective = directive
                if directive?.action == .start, !localRecordingActive {
                    joinConfirmationRequired = true
                    statusMessage = "Recording is already in progress. Join it when you are ready."
                    return nil
                }
                if directive?.action == .stop, localRecordingActive {
                    return directive
                }
                return nil
            }

            currentDirective = directive
            guard let directive else { return nil }
            if joinConfirmationRequired, directive.action == .start {
                return nil
            }
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
        statusMessage = "Starting this iPhone's recording…"
        return currentDirective
    }

    func markHandled(
        _ directive: CaptureRecordingDirective,
        state: CaptureRecordingEndpointState
    ) {
        handledStates[directive.id] = state
        if state == .started {
            statusMessage = "Recording on this iPhone"
        } else if state == .stopped {
            statusMessage = "Recording stopped · source stays protected on this iPhone"
        }
    }

    func acknowledge(
        roomID: String,
        directive: CaptureRecordingDirective,
        state: CaptureRecordingEndpointState,
        captureID: UUID? = nil,
        detail: String? = nil
    ) async {
        do {
            var request = try request(roomID: roomID)
            request.httpMethod = "PATCH"
            request.setValue("application/json", forHTTPHeaderField: "content-type")
            var body: [String: Any] = [
                "receiptId": receiptID(
                    roomID: roomID,
                    directiveID: directive.id,
                    state: state
                ),
                "directiveId": directive.id,
                "state": state.rawValue,
                "clientInstanceId": CaptureClientInstallation.id,
                "clientKind": "ios",
                "deviceLabel": deviceLabel,
            ]
            if let captureID { body["captureId"] = captureID.uuidString.lowercased() }
            if let detail, !detail.isEmpty { body["detail"] = detail }
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
            let response: CaptureRecordingEndpointResponse = try await send(request)
            guard response.ok else {
                throw CoordinatorError.server(response.error ?? "The recording status receipt needs a retry.")
            }
        } catch {
            // The local media state remains authoritative and protected. A
            // receipt failure is visible, but never rewrites capture success.
            statusMessage = "Recording is safe locally; room status will retry. \(error.localizedDescription)"
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
        roomID: String,
        directiveID: String,
        state: CaptureRecordingEndpointState
    ) -> String {
        let key = "quipsly.capture.recording-directive-receipt.v1.\(roomID).\(directiveID).\(state.rawValue)"
        if let existing = UserDefaults.standard.string(forKey: key), UUID(uuidString: existing) != nil {
            return existing.lowercased()
        }
        let created = UUID().uuidString.lowercased()
        UserDefaults.standard.set(created, forKey: key)
        return created
    }

    private var deviceLabel: String {
        let name = UIDevice.current.name.trimmingCharacters(in: .whitespacesAndNewlines)
        return name.isEmpty ? "Quipsly Capture · iPhone" : "Quipsly Capture · \(name)"
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
