import Combine
import Foundation

enum CaptureSourcePlanDelivery {
    case acknowledged(expectationID: String, revision: Int)
    case retry(String)
    case held(String)
}

/// Durable intent for every Nest-backed source armed on this iPhone.
///
/// The local recording ledger remains the capture authority and recording never
/// waits for this network outbox. The declaration makes absence explicit in the
/// Session recording plan, while the matching capture UUID lets verified upload
/// finalization fulfill that exact expectation without filename heuristics.
@MainActor
final class CaptureSourcePlanOutbox: ObservableObject {
    static let shared = CaptureSourcePlanOutbox()

    @Published private(set) var pendingCount = 0
    @Published private(set) var heldCount = 0
    @Published private(set) var statusLine: String?

    private enum Disposition: String, Codable {
        case pending
        case acknowledged
        case held
    }

    private struct Entry: Codable {
        let ownerAccountID: String
        let roomID: String
        let payload: CaptureSourcePlanPayload
        let createdAt: Date
        var disposition: Disposition
        var expectationID: String?
        var expectationRevision: Int?
        var lastAttemptAt: Date?
        var acknowledgedAt: Date?
        var holdReason: String?
    }

    private struct Ledger: Codable {
        let schemaVersion: Int
        var entries: [String: Entry]
    }

    private var ledger: Ledger
    private let ledgerURL: URL
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder
    private var deliveryTask: Task<Void, Never>?
    private var retryTask: Task<Void, Never>?

    private init(fileManager: FileManager = .default) {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        self.encoder = encoder

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        self.decoder = decoder

        let support = fileManager.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        ).first?
            .appendingPathComponent(
                "QuipslyCapture/SourcePlanOutbox",
                isDirectory: true
            )
            ?? URL(fileURLWithPath: NSHomeDirectory())
                .appendingPathComponent(
                    "Library/Application Support/QuipslyCapture/SourcePlanOutbox",
                    isDirectory: true
                )
        try? fileManager.createDirectory(
            at: support,
            withIntermediateDirectories: true
        )
        try? fileManager.setAttributes(
            [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
            ofItemAtPath: support.path
        )
        ledgerURL = support.appendingPathComponent("source-plan-v1.json")

        if fileManager.fileExists(atPath: ledgerURL.path) {
            do {
                let data = try Data(contentsOf: ledgerURL)
                ledger = try decoder.decode(Ledger.self, from: data)
            } catch {
                ledger = Ledger(schemaVersion: 1, entries: [:])
                statusLine = "The protected source-plan journal could not be read. Local recordings remain preserved, but Nest must not call this iPhone complete."
            }
        } else {
            ledger = Ledger(schemaVersion: 1, entries: [:])
        }
        publishCounts()
    }

    /// Reconstructs missing outbox rows from the protected recording ledger.
    /// A durable room START receipt is required so preview and standalone local
    /// recordings cannot accidentally change a Session plan.
    func reconcile(
        recordings: [LocalRecording],
        client: CaptureSessionClient
    ) {
        guard let ownerAccountID = normalizedOwnerID(
            AuthManager.currentStoredOwnerID()
        ) else { return }

        var changed = false
        let candidates = recordings
            .filter {
                normalizedOwnerID($0.ownerAccountID) == ownerAccountID
                    && $0.recordingConsentGranted
                    && $0.roomStartReceiptId != nil
                    && normalizedRoomID($0.callRoomId) != nil
            }
            .sorted { $0.startedAt < $1.startedAt }

        for recording in candidates {
            changed = insertIfNeeded(
                recording: recording,
                ownerAccountID: ownerAccountID
            ) || changed
        }

        if changed, !persist() { return }
        if changed || hasRetryableEntries(for: ownerAccountID) {
            flush(client: client)
        }
    }

    /// Materializes the outbox row synchronously after LocalRecordingLibrary
    /// commits its source identity and before an AV recorder is asked for bytes.
    /// Failure does not discard the take: the authoritative local ledger can
    /// reconstruct this row on the next model pass or relaunch.
    @discardableResult
    func stageDurably(recording: LocalRecording) -> Bool {
        guard recording.recordingConsentGranted,
              recording.roomStartReceiptId != nil,
              normalizedRoomID(recording.callRoomId) != nil else {
            return true
        }
        guard let ownerAccountID = normalizedOwnerID(recording.ownerAccountID),
              ownerAccountID == normalizedOwnerID(
                AuthManager.currentStoredOwnerID()
              ) else {
            statusLine = "The source plan could not be staged because the owning Quipsly account changed. The local recording ledger remains preserved."
            return false
        }
        guard insertIfNeeded(
            recording: recording,
            ownerAccountID: ownerAccountID
        ) else { return true }
        statusLine = "Required iPhone \(recording.effectiveMediaKind == .video ? "video" : "audio") master staged locally; waiting for Nest acknowledgement. Recording does not wait on the network."
        return persist()
    }

    /// Re-attempts held declarations after account access or Session ownership
    /// has been repaired. It is called on an explicit app/session reload, not on
    /// every recording-duration mutation.
    func resume(client: CaptureSessionClient) {
        guard let ownerAccountID = normalizedOwnerID(
            AuthManager.currentStoredOwnerID()
        ) else { return }
        publishCounts()
        retryTask?.cancel()
        retryTask = nil
        var changed = false
        for key in ledger.entries.keys.sorted() {
            guard var entry = ledger.entries[key],
                  entry.ownerAccountID == ownerAccountID,
                  entry.disposition == .held else { continue }
            entry.disposition = .pending
            entry.holdReason = nil
            ledger.entries[key] = entry
            changed = true
        }
        if changed { _ = persist() }
        flush(client: client)
    }

    func flush(client: CaptureSessionClient) {
        guard deliveryTask == nil,
              retryTask == nil,
              let ownerAccountID = normalizedOwnerID(
                AuthManager.currentStoredOwnerID()
              ),
              hasRetryableEntries(for: ownerAccountID) else { return }
        retryTask?.cancel()
        retryTask = nil
        deliveryTask = Task { @MainActor [weak self] in
            guard let self else { return }
            defer { self.deliveryTask = nil }
            for key in self.ledger.entries.keys.sorted() {
                guard !Task.isCancelled,
                      var entry = self.ledger.entries[key],
                      entry.ownerAccountID == ownerAccountID,
                      entry.disposition == .pending else { continue }
                entry.lastAttemptAt = Date()
                self.ledger.entries[key] = entry
                _ = self.persist()

                let result = await client.sendSourcePlanDeclaration(
                    entry.payload,
                    roomID: entry.roomID,
                    expectedOwnerAccountID: entry.ownerAccountID
                )
                guard !Task.isCancelled,
                      var latest = self.ledger.entries[key] else { return }
                switch result {
                case .acknowledged(let expectationID, let revision):
                    latest.disposition = .acknowledged
                    latest.expectationID = expectationID
                    latest.expectationRevision = revision
                    latest.acknowledgedAt = Date()
                    latest.holdReason = nil
                    self.ledger.entries[key] = latest
                    _ = self.persist()
                    self.statusLine = "Nest acknowledged this iPhone’s required \(entry.payload.sourceKind.lowercased()) master. Verified upload must still fulfill it."
                case .held(let message):
                    latest.disposition = .held
                    latest.holdReason = message
                    self.ledger.entries[key] = latest
                    _ = self.persist()
                    self.statusLine = "Source plan needs review: \(message) The local source remains preserved."
                case .retry(let message):
                    latest.disposition = .pending
                    latest.holdReason = nil
                    self.ledger.entries[key] = latest
                    _ = self.persist()
                    self.statusLine = "Source plan waiting for Nest: \(message) The local source remains preserved."
                    self.scheduleRetry(client: client)
                    return
                }
            }
        }
    }

    private func scheduleRetry(client: CaptureSessionClient) {
        retryTask?.cancel()
        retryTask = Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(30))
            guard !Task.isCancelled else { return }
            self?.retryTask = nil
            self?.flush(client: client)
        }
    }

    @discardableResult
    private func persist() -> Bool {
        do {
            let data = try encoder.encode(ledger)
            try data.write(
                to: ledgerURL,
                options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication]
            )
            publishCounts()
            return true
        } catch {
            statusLine = "The protected source-plan journal could not be saved. Local recordings remain preserved, but Nest must not call this iPhone complete."
            return false
        }
    }

    private func publishCounts() {
        let currentOwner = normalizedOwnerID(AuthManager.currentStoredOwnerID())
        let visible = ledger.entries.values.filter {
            currentOwner != nil && $0.ownerAccountID == currentOwner
        }
        pendingCount = visible.filter { $0.disposition != .acknowledged }.count
        heldCount = visible.filter { $0.disposition == .held }.count
    }

    private func hasRetryableEntries(for ownerAccountID: String) -> Bool {
        ledger.entries.values.contains {
            $0.ownerAccountID == ownerAccountID && $0.disposition == .pending
        }
    }

    private func insertIfNeeded(
        recording: LocalRecording,
        ownerAccountID: String
    ) -> Bool {
        let key = entryKey(
            ownerAccountID: ownerAccountID,
            captureID: recording.id
        )
        guard ledger.entries[key] == nil,
              let roomID = normalizedRoomID(recording.callRoomId) else {
            return false
        }
        ledger.entries[key] = Entry(
            ownerAccountID: ownerAccountID,
            roomID: roomID,
            payload: Self.payload(for: recording),
            createdAt: recording.startedAt,
            disposition: .pending,
            expectationID: nil,
            expectationRevision: nil,
            lastAttemptAt: nil,
            acknowledgedAt: nil,
            holdReason: nil
        )
        return true
    }

    private func entryKey(ownerAccountID: String, captureID: UUID) -> String {
        "\(ownerAccountID)\u{0}\(captureID.uuidString.lowercased())"
    }

    private func normalizedOwnerID(_ value: String?) -> String? {
        guard let value = value?.trimmingCharacters(in: .whitespacesAndNewlines),
              !value.isEmpty,
              value.count <= 256 else { return nil }
        return value
    }

    private func normalizedRoomID(_ value: String?) -> String? {
        guard let value = value?.trimmingCharacters(in: .whitespacesAndNewlines),
              !value.isEmpty,
              value.count <= 256 else { return nil }
        return value
    }

    private static func payload(for recording: LocalRecording) -> CaptureSourcePlanPayload {
        CaptureSourcePlanProjection.payload(
            captureID: recording.id,
            participantID: recording.participantId,
            sourceKind: recording.effectiveMediaKind == .video ? "VIDEO" : "AUDIO",
            deviceModelIdentifier: recording.sourceProfile?.deviceModelIdentifier
        )
    }
}
