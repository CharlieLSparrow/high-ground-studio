import Combine
import Foundation
import UIKit

struct CaptureSessionPreflightAudioEvidence: Codable, Equatable {
    let state: String
    let rmsDbfs: Float
    let samplePeakDbfs: Float
    let peakHoldDbfs: Float
    let clippedSampleCountSinceStart: Int
    let sampleRateHz: Int
    let channelCount: Int
}

struct CaptureSessionPreflightCameraEvidence: Codable, Equatable {
    let width: Int?
    let height: Int?
    let frameRate: Double?
}

struct CaptureSessionPreflightPayload: Codable, Equatable {
    let requestId: UUID
    let clientInstanceId: String
    let clientKind: String
    let deviceLabel: String
    let microphoneLabel: String
    let cameraLabel: String?
    let outputLabel: String
    let cameraWanted: Bool
    let privateSampleDurationSeconds: TimeInterval
    let privateSamplePlaybackComplete: Bool
    let playbackDecision: CaptureAudioSoundCheckPlaybackDecision
    let clientReportedAt: String
    let audioEvidence: CaptureSessionPreflightAudioEvidence
    let cameraEvidence: CaptureSessionPreflightCameraEvidence
}

struct PendingCaptureSessionPreflightReceipt: Codable, Identifiable, Equatable {
    enum DeliveryState: String, Codable {
        case pending
        case acknowledged
        case rejected
    }

    let id: UUID
    let ownerAccountID: String
    let roomID: String
    let payload: CaptureSessionPreflightPayload
    let createdAt: Date
    var deliveryState: DeliveryState
    var deliveredAt: Date?
    var serverStatus: String?
    var serverCurrent: Bool?
    var serverIssueCodes: [String]
    var serverExpiresAt: Date?
    var serverError: String?

    var isCurrentReady: Bool {
        deliveryState == .acknowledged
            && serverStatus == "READY"
            && serverCurrent == true
            && (serverExpiresAt?.timeIntervalSinceNow ?? -1) > 0
    }
}

/// Protected, account-partitioned evidence that a person completed a private
/// iPhone listen-back. Source audio is deliberately absent from this journal.
/// A Nest outage can delay collaboration truth without delaying or deleting a
/// healthy local recording.
@MainActor
final class CaptureSessionPreflightStore: ObservableObject {
    static let shared = CaptureSessionPreflightStore()

    @Published private(set) var receipts: [PendingCaptureSessionPreflightReceipt] = []
    @Published private(set) var persistenceError: String?

    private let fileManager: FileManager
    private let ledgerURL: URL
    private var storedReceipts: [PendingCaptureSessionPreflightReceipt] = []
    private var activeOwnerAccountID: String?
    private var ledgerIsWritable = true
    private var accountObserver: NSObjectProtocol?

    init(fileManager: FileManager = .default) {
        self.fileManager = fileManager
        activeOwnerAccountID = Self.normalized(AuthManager.currentStoredOwnerID())
        let applicationSupport = fileManager.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        ).first ?? URL(fileURLWithPath: NSHomeDirectory())
            .appendingPathComponent("Library/Application Support", isDirectory: true)
        let directory = applicationSupport
            .appendingPathComponent("QuipslyCapture/Preflight", isDirectory: true)
        ledgerURL = directory
            .appendingPathComponent("session-preflight-outbox.json", isDirectory: false)

        do {
            try fileManager.createDirectory(
                at: directory,
                withIntermediateDirectories: true,
                attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication]
            )
            if fileManager.fileExists(atPath: ledgerURL.path) {
                let data = try Data(contentsOf: ledgerURL)
                let decoder = JSONDecoder()
                decoder.dateDecodingStrategy = .iso8601
                storedReceipts = try decoder.decode(
                    [PendingCaptureSessionPreflightReceipt].self,
                    from: data
                )
            }
            pruneAndPublish()
        } catch {
            ledgerIsWritable = false
            persistenceError = "The protected setup-check journal is unreadable and will not be overwritten: \(error.localizedDescription)"
            receipts = []
        }

        accountObserver = NotificationCenter.default.addObserver(
            forName: .quipslyCaptureAccountIdentityDidChange,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            MainActor.assumeIsolated { [weak self] in
                self?.activeOwnerAccountID = Self.normalized(notification.object as? String)
                self?.pruneAndPublish()
            }
        }
    }

    deinit {
        if let accountObserver {
            NotificationCenter.default.removeObserver(accountObserver)
        }
    }

    var pendingReceipts: [PendingCaptureSessionPreflightReceipt] {
        guard ledgerIsWritable else { return [] }
        return receipts.filter { $0.deliveryState == .pending }
    }

    func latest(roomID: String, checkID: UUID? = nil) -> PendingCaptureSessionPreflightReceipt? {
        receipts
            .filter { receipt in
                receipt.roomID == roomID
                    && (checkID == nil || receipt.id == checkID)
            }
            .sorted { $0.createdAt > $1.createdAt }
            .first
    }

    @discardableResult
    func enqueue(
        roomID: String,
        ownerAccountID: String,
        payload: CaptureSessionPreflightPayload,
        createdAt: Date
    ) throws -> PendingCaptureSessionPreflightReceipt {
        guard ledgerIsWritable else { throw StoreError.readOnly }
        guard let normalizedOwner = Self.normalized(ownerAccountID),
              normalizedOwner == activeOwnerAccountID else {
            throw StoreError.ownerMismatch
        }
        if let existing = storedReceipts.first(where: { $0.id == payload.requestId }) {
            guard existing.ownerAccountID == normalizedOwner,
                  existing.roomID == roomID,
                  existing.payload == payload else {
                throw StoreError.requestIdentityConflict
            }
            return existing
        }
        let receipt = PendingCaptureSessionPreflightReceipt(
            id: payload.requestId,
            ownerAccountID: normalizedOwner,
            roomID: roomID,
            payload: payload,
            createdAt: createdAt,
            deliveryState: .pending,
            deliveredAt: nil,
            serverStatus: nil,
            serverCurrent: nil,
            serverIssueCodes: [],
            serverExpiresAt: nil,
            serverError: nil
        )
        var updated = storedReceipts
        updated.append(receipt)
        try persist(updated)
        storedReceipts = updated
        pruneAndPublish()
        return receipt
    }

    func markAcknowledged(
        _ id: UUID,
        status: String,
        current: Bool,
        issueCodes: [String],
        expiresAt: Date?,
        at date: Date = Date()
    ) {
        update(id) { receipt in
            receipt.deliveryState = .acknowledged
            receipt.deliveredAt = date
            receipt.serverStatus = status
            receipt.serverCurrent = current
            receipt.serverIssueCodes = issueCodes
            receipt.serverExpiresAt = expiresAt
            receipt.serverError = nil
        }
    }

    func markRejected(_ id: UUID, message: String, at date: Date = Date()) {
        update(id) { receipt in
            receipt.deliveryState = .rejected
            receipt.deliveredAt = date
            receipt.serverError = message
        }
    }

    private func update(
        _ id: UUID,
        mutation: (inout PendingCaptureSessionPreflightReceipt) -> Void
    ) {
        guard ledgerIsWritable,
              let index = storedReceipts.firstIndex(where: { $0.id == id }) else { return }
        var updated = storedReceipts
        mutation(&updated[index])
        do {
            try persist(updated)
            storedReceipts = updated
            pruneAndPublish()
        } catch {
            persistenceError = "The setup-check result could not be preserved: \(error.localizedDescription)"
        }
    }

    private func pruneAndPublish() {
        let cutoff = Date().addingTimeInterval(-24 * 60 * 60)
        let pruned = storedReceipts.filter {
            $0.deliveryState == .pending || $0.createdAt >= cutoff
        }
        if ledgerIsWritable, pruned != storedReceipts {
            do {
                try persist(pruned)
                storedReceipts = pruned
            } catch {
                persistenceError = "Old setup-check receipts could not be pruned: \(error.localizedDescription)"
            }
        }
        guard let activeOwnerAccountID else {
            receipts = []
            return
        }
        receipts = storedReceipts.filter { $0.ownerAccountID == activeOwnerAccountID }
    }

    private func persist(_ value: [PendingCaptureSessionPreflightReceipt]) throws {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(value)
        try data.write(to: ledgerURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    private static func normalized(_ value: String?) -> String? {
        let normalized = value?.trimmingCharacters(in: .whitespacesAndNewlines)
        return normalized?.isEmpty == false ? normalized : nil
    }

    enum StoreError: LocalizedError {
        case readOnly
        case ownerMismatch
        case requestIdentityConflict

        var errorDescription: String? {
            switch self {
            case .readOnly:
                "The protected setup-check journal is read-only. Its existing bytes were preserved."
            case .ownerMismatch:
                "The sound check does not belong to the currently verified Quipsly account."
            case .requestIdentityConflict:
                "That sound-check identity already belongs to different evidence. Run a fresh check."
            }
        }
    }
}

@MainActor
final class CaptureSessionPreflightClient: ObservableObject {
    @Published private(set) var status = "No shared setup receipt yet"
    @Published private(set) var errorMessage: String?
    @Published private(set) var isSyncing = false

    let store: CaptureSessionPreflightStore
    private let baseURL: String
    private var storeObservation: AnyCancellable?

    init() {
        store = .shared
        baseURL = normalizedNestBaseURL(
            Bundle.main.object(forInfoDictionaryKey: "QUIPSLY_API_BASE_URL") as? String
                ?? "https://nest.quipsly.com"
        )
        storeObservation = store.objectWillChange.sink { [weak self] _ in
            self?.objectWillChange.send()
        }
    }

    init(store: CaptureSessionPreflightStore, baseURL: String) {
        self.store = store
        self.baseURL = baseURL
        storeObservation = store.objectWillChange.sink { [weak self] _ in
            self?.objectWillChange.send()
        }
    }

    func receipt(roomID: String, checkID: UUID? = nil) -> PendingCaptureSessionPreflightReceipt? {
        store.latest(roomID: roomID, checkID: checkID)
    }

    #if DEBUG && targetEnvironment(simulator)
    /// Stages one synthetic, network-disabled receipt through the shipping
    /// protected outbox. Relaunches recover the existing random identity; they
    /// do not create a deterministic replacement that could fake persistence.
    func stageSessionPreflightOutboxUITestReceipt(
        roomID: String,
        ownerAccountID: String
    ) throws -> PendingCaptureSessionPreflightReceipt {
        if let existing = store.latest(roomID: roomID) {
            return existing
        }
        let createdAt = Date()
        let payload = CaptureSessionPreflightPayload(
            requestId: UUID(),
            clientInstanceId: "ios-ui-outbox-\(UUID().uuidString.lowercased())",
            clientKind: "ios",
            deviceLabel: "Quipsly Capture · operated simulator",
            microphoneLabel: "Protected outbox test microphone",
            cameraLabel: nil,
            outputLabel: "Protected outbox test headphones",
            cameraWanted: false,
            privateSampleDurationSeconds: 6.25,
            privateSamplePlaybackComplete: true,
            playbackDecision: .heardClear,
            clientReportedAt: ISO8601DateFormatter().string(from: createdAt),
            audioEvidence: CaptureSessionPreflightAudioEvidence(
                state: "ready",
                rmsDbfs: -24,
                samplePeakDbfs: -8,
                peakHoldDbfs: -8,
                clippedSampleCountSinceStart: 0,
                sampleRateHz: 48_000,
                channelCount: 1
            ),
            cameraEvidence: CaptureSessionPreflightCameraEvidence(
                width: nil,
                height: nil,
                frameRate: nil
            )
        )
        return try store.enqueue(
            roomID: roomID,
            ownerAccountID: ownerAccountID,
            payload: payload,
            createdAt: createdAt
        )
    }
    #endif

    func save(
        soundCheck: CaptureAudioSoundCheckController,
        session: MobileCaptureSession,
        mode: CaptureRecordingMode,
        videoProfile: VideoCaptureResolvedProfile?
    ) async {
        guard let ownerAccountID = AuthManager.currentStoredOwnerID(),
              let checkID = soundCheck.checkID,
              let summary = soundCheck.summary,
              soundCheck.playbackCompleted,
              let outputLabel = soundCheck.playbackOutputRouteName,
              let decision = soundCheck.playbackDecision else {
            errorMessage = "Complete the private playback and record what you heard before sharing setup evidence."
            return
        }

        let payload = CaptureSessionPreflightPayload(
            requestId: checkID,
            clientInstanceId: CaptureClientInstallation.id,
            clientKind: "ios",
            deviceLabel: Self.deviceLabel(),
            microphoneLabel: summary.routeName,
            cameraLabel: mode.recordsVideo ? videoProfile?.cameraLocalizedName : nil,
            outputLabel: outputLabel,
            cameraWanted: mode.recordsVideo,
            privateSampleDurationSeconds: summary.duration,
            privateSamplePlaybackComplete: true,
            playbackDecision: decision,
            clientReportedAt: ISO8601DateFormatter().string(from: summary.createdAt),
            audioEvidence: CaptureSessionPreflightAudioEvidence(
                state: Self.signalState(summary.health),
                rmsDbfs: summary.averagePowerDBFS,
                samplePeakDbfs: summary.peakPowerDBFS,
                peakHoldDbfs: summary.peakPowerDBFS,
                clippedSampleCountSinceStart: summary.nearFullScaleObservationCount,
                sampleRateHz: summary.sampleRateHz,
                channelCount: summary.channelCount
            ),
            cameraEvidence: CaptureSessionPreflightCameraEvidence(
                width: mode.recordsVideo ? videoProfile?.width : nil,
                height: mode.recordsVideo ? videoProfile?.height : nil,
                frameRate: mode.recordsVideo ? videoProfile?.framesPerSecond : nil
            )
        )

        do {
            _ = try store.enqueue(
                roomID: session.callRoomId,
                ownerAccountID: ownerAccountID,
                payload: payload,
                createdAt: summary.createdAt
            )
            status = "Setup receipt saved on \(CaptureDeviceVocabulary.thisDevice)"
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
            return
        }
        await flushPending()
    }

    func flushPending() async {
        guard !isSyncing else { return }
        guard AuthManager.shared.networkActionsAllowed else {
            if !store.pendingReceipts.isEmpty {
                status = "Setup receipt waiting safely on \(CaptureDeviceVocabulary.thisDevice)"
            }
            return
        }
        isSyncing = true
        defer { isSyncing = false }

        for receipt in store.pendingReceipts {
            guard receipt.ownerAccountID == AuthManager.currentStoredOwnerID() else { continue }
            let result = await deliver(receipt)
            switch result {
            case .acknowledged(let packet):
                store.markAcknowledged(
                    receipt.id,
                    status: packet.status,
                    current: packet.current,
                    issueCodes: packet.issueCodes,
                    expiresAt: Self.isoDate(packet.expiresAt)
                )
                status = packet.status == "READY"
                    ? "Nest verified \(CaptureDeviceVocabulary.thisDevice) setup"
                    : "Nest saved the setup concerns"
                errorMessage = nil
            case .retry(let message):
                status = "Setup receipt waiting safely on \(CaptureDeviceVocabulary.thisDevice)"
                errorMessage = message
                return
            case .rejected(let message):
                store.markRejected(receipt.id, message: message)
                status = "Setup receipt needs a fresh check"
                errorMessage = message
            }
        }
    }

    private func deliver(_ receipt: PendingCaptureSessionPreflightReceipt) async -> DeliveryResult {
        guard let url = URL(string: "\(baseURL.trimmingCharacters(in: .whitespacesAndNewlines))/api/sessions/\(receipt.roomID)/preflight") else {
            return .rejected("The configured Nest URL is invalid.")
        }
        do {
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            let encoder = JSONEncoder()
            request.httpBody = try encoder.encode(receipt.payload)
            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            let packet = try AuthResponseDecoder.decode(
                ServerResponse.self,
                from: data,
                response: response,
                errorDomain: "QuipslyCapture.SessionPreflight",
                malformedResponseMessage: "Nest could not confirm this setup check. Your microphone and camera choices are unchanged; try again."
            ).payload
            guard response.statusCode < 400,
                  packet.ok,
                  let preflight = packet.preflight else {
                let message = packet.error ?? "Nest did not acknowledge the exact setup-check receipt."
                if response.statusCode == 401 || response.statusCode == 403
                    || response.statusCode == 408 || response.statusCode == 425
                    || response.statusCode == 429 || response.statusCode >= 500 {
                    return .retry(message)
                }
                return .rejected(message)
            }
            guard preflight.requestId.lowercased() == receipt.id.uuidString.lowercased(),
                  preflight.clientKind == "ios",
                  preflight.clientInstanceId == receipt.payload.clientInstanceId else {
                return .rejected("Nest returned a different endpoint or request receipt. Run a fresh setup check.")
            }
            return .acknowledged(preflight)
        } catch {
            return .retry(error.localizedDescription)
        }
    }

    private static func signalState(_ health: CaptureAudioSoundCheckHealth) -> String {
        switch health {
        case .noSignal: "no-signal"
        case .tooQuiet: "low"
        case .healthy: "ready"
        case .hot: "hot"
        case .clippingRisk: "clipping-risk"
        }
    }

    private static func deviceLabel() -> String {
        let runtime = CaptureRuntimeEvidence.current()
        return "Quipsly Capture · \(runtime.deviceModelIdentifier) · \(runtime.systemName) \(runtime.systemVersion) · build \(runtime.appBuild)"
    }

    private static func isoDate(_ value: String) -> Date? {
        ISO8601DateFormatter().date(from: value)
    }

    private enum DeliveryResult {
        case acknowledged(ServerPreflight)
        case retry(String)
        case rejected(String)
    }

    private struct ServerResponse: Codable {
        let ok: Bool
        let error: String?
        let preflight: ServerPreflight?
    }

    private struct ServerPreflight: Codable {
        let requestId: String
        let clientInstanceId: String
        let clientKind: String
        let status: String
        let current: Bool
        let issueCodes: [String]
        let expiresAt: String
    }
}
