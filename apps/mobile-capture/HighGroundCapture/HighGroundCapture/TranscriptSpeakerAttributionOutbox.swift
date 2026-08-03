import Combine
import Foundation

struct PendingTranscriptSpeakerSample: Codable, Equatable {
    let segmentID: String
    let playbackPositionSeconds: TimeInterval
}

struct PendingTranscriptSpeakerAttribution: Codable, Equatable, Identifiable {
    enum Disposition: String, Codable {
        case pending
        case held
    }

    let id: UUID
    let ownerAccountID: String
    let roomID: String
    let transcriptJobID: String
    let providerSpeakerLabel: String
    let participantID: String
    let expectedProviderSnapshotSHA256: String
    let samples: [PendingTranscriptSpeakerSample]
    let capturedAt: Date
    var disposition: Disposition
    var attemptCount: Int
    var lastAttemptAt: Date?
    var lastErrorCode: String?
    var lastErrorMessage: String?

    var clientRequestID: String {
        "iphone-transcript-speaker-\(id.uuidString.lowercased())"
    }
}

enum TranscriptSpeakerAttributionStoreError: LocalizedError {
    case accountIdentityUnavailable
    case invalidAttribution
    case attributionAlreadyPending
    case ledgerUnavailable

    var errorDescription: String? {
        switch self {
        case .accountIdentityUnavailable:
            "Verify the current Quipsly account before preserving a voice identity review."
        case .invalidAttribution:
            "The voice identity review is incomplete or no longer matches its playback evidence."
        case .attributionAlreadyPending:
            "This provider voice already has a protected identity review waiting for Nest."
        case .ledgerUnavailable:
            "The protected voice-review outbox is unavailable. Nothing was claimed as identified."
        }
    }
}

/// Account-partitioned, file-protected voice identity decisions made against
/// exact local recording samples. A queued entry is only review intent: Nest
/// rechecks the participant, full provider-cluster snapshot, release gate, and
/// each playback position before it can become canonical attribution.
@MainActor
final class TranscriptSpeakerAttributionOutbox: ObservableObject {
    static let shared = TranscriptSpeakerAttributionOutbox()

    @Published private(set) var entries: [PendingTranscriptSpeakerAttribution] = []
    @Published private(set) var persistenceError: String?

    private let fileManager: FileManager
    private let ledgerURL: URL
    private let lastKnownGoodURL: URL
    private var storedEntries: [PendingTranscriptSpeakerAttribution] = []
    private var activeOwnerAccountID: String?
    private var ledgerIsWritable = true
    private var accountObserver: NSObjectProtocol?

    init(
        fileManager: FileManager = .default,
        directoryURL: URL? = nil,
        initialOwnerAccountID: String? = nil,
        observeAccountChanges: Bool = true
    ) {
        self.fileManager = fileManager
        activeOwnerAccountID = Self.normalizedOwnerID(
            initialOwnerAccountID ?? AuthManager.currentStoredOwnerID()
        )
        let support = directoryURL
            ?? fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?
                .appendingPathComponent("QuipslyCapture/TranscriptSpeakerAttributionOutbox", isDirectory: true)
            ?? URL(fileURLWithPath: NSHomeDirectory())
                .appendingPathComponent("Library/Application Support/QuipslyCapture/TranscriptSpeakerAttributionOutbox", isDirectory: true)
        ledgerURL = support.appendingPathComponent("transcript-speaker-attributions-v1.json")
        lastKnownGoodURL = support.appendingPathComponent("transcript-speaker-attributions-v1.last-known-good.json")

        do {
            try fileManager.createDirectory(at: support, withIntermediateDirectories: true)
            try? fileManager.setAttributes(
                [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
                ofItemAtPath: support.path
            )
            storedEntries = try loadLedger()
            publish()
        } catch {
            ledgerIsWritable = false
            persistenceError = "The protected voice-review outbox could not open: \(error.localizedDescription)"
        }

        if observeAccountChanges {
            accountObserver = NotificationCenter.default.addObserver(
                forName: .quipslyCaptureAccountIdentityDidChange,
                object: nil,
                queue: .main
            ) { [weak self] notification in
                MainActor.assumeIsolated {
                    self?.activateOwner(notification.object as? String)
                }
            }
        }
    }

    var pendingCount: Int { entries.filter { $0.disposition == .pending }.count }
    var heldCount: Int { entries.filter { $0.disposition == .held }.count }

    func activateOwner(_ ownerAccountID: String?) {
        activeOwnerAccountID = Self.normalizedOwnerID(ownerAccountID)
        publish()
    }

    func attribution(roomID: String, providerSpeakerLabel: String) -> PendingTranscriptSpeakerAttribution? {
        let cleanRoomID = Self.cleanID(roomID)
        let cleanLabel = Self.cleanLabel(providerSpeakerLabel)
        return entries.first { $0.roomID == cleanRoomID && $0.providerSpeakerLabel == cleanLabel }
    }

    @discardableResult
    func enqueue(
        roomID: String,
        transcriptJobID: String,
        providerSpeakerLabel: String,
        participantID: String,
        expectedProviderSnapshotSHA256: String,
        samples: [PendingTranscriptSpeakerSample],
        capturedAt: Date = Date()
    ) throws -> PendingTranscriptSpeakerAttribution {
        guard ledgerIsWritable else { throw TranscriptSpeakerAttributionStoreError.ledgerUnavailable }
        guard let owner = Self.normalizedOwnerID(activeOwnerAccountID),
              owner == Self.normalizedOwnerID(AuthManager.currentStoredOwnerID()) else {
            throw TranscriptSpeakerAttributionStoreError.accountIdentityUnavailable
        }
        let cleanRoomID = Self.cleanID(roomID)
        let cleanJobID = Self.cleanID(transcriptJobID)
        let cleanLabel = Self.cleanLabel(providerSpeakerLabel)
        let cleanParticipantID = Self.cleanID(participantID)
        let cleanSHA = expectedProviderSnapshotSHA256.lowercased()
        let cleanSamples = samples.map {
            PendingTranscriptSpeakerSample(
                segmentID: Self.cleanID($0.segmentID),
                playbackPositionSeconds: $0.playbackPositionSeconds
            )
        }
        guard !cleanRoomID.isEmpty,
              !cleanJobID.isEmpty,
              !cleanLabel.isEmpty,
              !cleanParticipantID.isEmpty,
              cleanSHA.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil,
              (1...3).contains(cleanSamples.count),
              Set(cleanSamples.map(\.segmentID)).count == cleanSamples.count,
              cleanSamples.allSatisfy({ !$0.segmentID.isEmpty && $0.playbackPositionSeconds.isFinite && $0.playbackPositionSeconds >= 0 }) else {
            throw TranscriptSpeakerAttributionStoreError.invalidAttribution
        }
        guard attribution(roomID: cleanRoomID, providerSpeakerLabel: cleanLabel) == nil else {
            throw TranscriptSpeakerAttributionStoreError.attributionAlreadyPending
        }

        let entry = PendingTranscriptSpeakerAttribution(
            id: UUID(),
            ownerAccountID: owner,
            roomID: cleanRoomID,
            transcriptJobID: cleanJobID,
            providerSpeakerLabel: cleanLabel,
            participantID: cleanParticipantID,
            expectedProviderSnapshotSHA256: cleanSHA,
            samples: cleanSamples,
            capturedAt: capturedAt,
            disposition: .pending,
            attemptCount: 0,
            lastAttemptAt: nil,
            lastErrorCode: nil,
            lastErrorMessage: nil
        )
        var updated = storedEntries
        updated.append(entry)
        try commit(updated)
        return entry
    }

    @discardableResult
    func markAcknowledged(_ id: UUID) -> Bool {
        var updated = storedEntries
        updated.removeAll { $0.id == id }
        return commitBestEffort(updated)
    }

    func markRetryable(_ id: UUID, message: String, at date: Date = Date()) {
        update(id) { entry in
            entry.disposition = .pending
            entry.attemptCount += 1
            entry.lastAttemptAt = date
            entry.lastErrorCode = nil
            entry.lastErrorMessage = message
        }
    }

    func markHeld(_ id: UUID, code: String?, message: String, at date: Date = Date()) {
        update(id) { entry in
            entry.disposition = .held
            entry.attemptCount += 1
            entry.lastAttemptAt = date
            entry.lastErrorCode = Self.optionalText(code)
            entry.lastErrorMessage = message
        }
    }

    func releaseForRetry(_ id: UUID) {
        update(id) { entry in
            entry.disposition = .pending
            entry.lastErrorCode = nil
            entry.lastErrorMessage = "Retry requested after review."
        }
    }

    private func update(_ id: UUID, change: (inout PendingTranscriptSpeakerAttribution) -> Void) {
        guard entries.contains(where: { $0.id == id }),
              let index = storedEntries.firstIndex(where: { $0.id == id }) else { return }
        var updated = storedEntries
        change(&updated[index])
        commitBestEffort(updated)
    }

    @discardableResult
    private func commitBestEffort(_ updated: [PendingTranscriptSpeakerAttribution]) -> Bool {
        do {
            try commit(updated)
            return true
        } catch {
            persistenceError = "The protected voice-review outbox could not save: \(error.localizedDescription)"
            return false
        }
    }

    private func commit(_ updated: [PendingTranscriptSpeakerAttribution]) throws {
        guard ledgerIsWritable else { throw TranscriptSpeakerAttributionStoreError.ledgerUnavailable }
        do {
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            encoder.outputFormatting = [.sortedKeys]
            let data = try encoder.encode(updated)
            try data.write(
                to: lastKnownGoodURL,
                options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication]
            )
            try data.write(
                to: ledgerURL,
                options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication]
            )
            storedEntries = updated
            persistenceError = nil
            publish()
        } catch {
            ledgerIsWritable = false
            throw error
        }
    }

    private func loadLedger() throws -> [PendingTranscriptSpeakerAttribution] {
        if fileManager.fileExists(atPath: ledgerURL.path) {
            do { return try decode(ledgerURL) }
            catch {
                ledgerIsWritable = false
                if fileManager.fileExists(atPath: lastKnownGoodURL.path),
                   let recovered = try? decode(lastKnownGoodURL) {
                    persistenceError = "The voice-review ledger is unreadable and locked read-only. A last-known-good copy remains visible."
                    return recovered
                }
                throw error
            }
        }
        if fileManager.fileExists(atPath: lastKnownGoodURL.path),
           let recovered = try? decode(lastKnownGoodURL) {
            return recovered
        }
        return []
    }

    private func decode(_ url: URL) throws -> [PendingTranscriptSpeakerAttribution] {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode([PendingTranscriptSpeakerAttribution].self, from: Data(contentsOf: url))
    }

    private func publish() {
        storedEntries.sort { $0.capturedAt < $1.capturedAt }
        guard let owner = activeOwnerAccountID else {
            entries = []
            return
        }
        entries = storedEntries.filter { Self.normalizedOwnerID($0.ownerAccountID) == owner }
    }

    nonisolated private static func cleanID(_ value: String) -> String {
        String(value.trimmingCharacters(in: .whitespacesAndNewlines).prefix(240))
    }

    nonisolated private static func cleanLabel(_ value: String) -> String {
        String(value.trimmingCharacters(in: .whitespacesAndNewlines).prefix(160))
    }

    nonisolated private static func optionalText(_ value: String?) -> String? {
        guard let clean = value?.trimmingCharacters(in: .whitespacesAndNewlines), !clean.isEmpty else { return nil }
        return String(clean.prefix(2_000))
    }

    nonisolated private static func normalizedOwnerID(_ value: String?) -> String? {
        guard let normalized = value?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
              !normalized.isEmpty,
              normalized.count <= 320 else { return nil }
        return normalized
    }
}
