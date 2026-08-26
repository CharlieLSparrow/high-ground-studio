import Combine
import Foundation

struct PendingTranscriptReviewDecision: Codable, Equatable, Identifiable {
    enum Operation: String, Codable {
        case acceptHumanCorrection = "accept-human-correction"
        case confirmSegmentAsIs = "confirm-segment-as-is"
    }

    enum Disposition: String, Codable {
        case pending
        case held
    }

    let id: UUID
    let ownerAccountID: String
    let operation: Operation
    let roomID: String
    let segmentID: String
    let expectedProviderText: String
    let expectedProviderSpeakerLabel: String?
    let expectedAcceptedCorrectionID: String?
    let correctedText: String?
    let correctedSpeakerLabel: String?
    let reason: String?
    let playbackPositionSeconds: TimeInterval?
    let capturedAt: Date
    var disposition: Disposition
    var attemptCount: Int
    var lastAttemptAt: Date?
    var lastErrorCode: String?
    var lastErrorMessage: String?

    var clientRequestID: String {
        let prefix = operation == .acceptHumanCorrection
            ? "iphone-transcript-correction"
            : "iphone-transcript-verification"
        return "\(prefix)-\(id.uuidString.lowercased())"
    }
}

enum TranscriptReviewDecisionStoreError: LocalizedError {
    case accountIdentityUnavailable
    case invalidDecision
    case decisionAlreadyPending
    case ledgerUnavailable

    var errorDescription: String? {
        switch self {
        case .accountIdentityUnavailable:
            "Verify the current Quipsly account before preserving transcript review."
        case .invalidDecision:
            "The playback-reviewed transcript decision is incomplete or no longer matches its source."
        case .decisionAlreadyPending:
            "This transcript segment already has a protected phone decision waiting for Nest."
        case .ledgerUnavailable:
            "The protected transcript-review outbox is unavailable. Nothing was claimed as reviewed."
        }
    }
}

/// Protected, account-partitioned transcript decisions made against an exact
/// retained local recording.
///
/// Quipsly writes the immutable provider expectation, current overlay identity,
/// playback position, and stable request UUID before it claims that an offline
/// correction or as-is confirmation is queued. Nest can then acknowledge an
/// idempotent replay or reject stale evidence without a last-write-wins merge.
@MainActor
final class TranscriptReviewDecisionOutbox: ObservableObject {
    static let shared = TranscriptReviewDecisionOutbox()

    @Published private(set) var entries: [PendingTranscriptReviewDecision] = []
    @Published private(set) var persistenceError: String?

    private let fileManager: FileManager
    private let ledgerURL: URL
    private let lastKnownGoodURL: URL
    private var storedEntries: [PendingTranscriptReviewDecision] = []
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
                .appendingPathComponent("QuipslyCapture/TranscriptReviewDecisionOutbox", isDirectory: true)
            ?? URL(fileURLWithPath: NSHomeDirectory())
                .appendingPathComponent("Library/Application Support/QuipslyCapture/TranscriptReviewDecisionOutbox", isDirectory: true)
        ledgerURL = support.appendingPathComponent("transcript-review-decisions-v1.json")
        lastKnownGoodURL = support.appendingPathComponent("transcript-review-decisions-v1.last-known-good.json")

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
            persistenceError = "The protected transcript-review outbox could not open: \(error.localizedDescription)"
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

    func decision(roomID: String, segmentID: String) -> PendingTranscriptReviewDecision? {
        let cleanRoomID = Self.cleanID(roomID)
        let cleanSegmentID = Self.cleanID(segmentID)
        return entries.first { $0.roomID == cleanRoomID && $0.segmentID == cleanSegmentID }
    }

    @discardableResult
    func enqueueCorrection(
        roomID: String,
        segmentID: String,
        expectedProviderText: String,
        expectedProviderSpeakerLabel: String?,
        expectedAcceptedCorrectionID: String?,
        correctedText: String,
        correctedSpeakerLabel: String,
        reason: String,
        playbackPositionSeconds: TimeInterval?,
        capturedAt: Date = Date()
    ) throws -> PendingTranscriptReviewDecision {
        let cleanText = correctedText.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanSpeaker = correctedSpeakerLabel.trimmingCharacters(in: .whitespacesAndNewlines)
        let providerSpeaker = Self.optionalText(expectedProviderSpeakerLabel)
        guard !cleanText.isEmpty || !cleanSpeaker.isEmpty,
              cleanText != expectedProviderText || Self.optionalText(cleanSpeaker) != providerSpeaker else {
            throw TranscriptReviewDecisionStoreError.invalidDecision
        }
        return try enqueue(
            operation: .acceptHumanCorrection,
            roomID: roomID,
            segmentID: segmentID,
            expectedProviderText: expectedProviderText,
            expectedProviderSpeakerLabel: providerSpeaker,
            expectedAcceptedCorrectionID: expectedAcceptedCorrectionID,
            correctedText: cleanText,
            correctedSpeakerLabel: cleanSpeaker,
            reason: reason,
            playbackPositionSeconds: playbackPositionSeconds,
            capturedAt: capturedAt
        )
    }

    @discardableResult
    func enqueueConfirmation(
        roomID: String,
        segmentID: String,
        expectedProviderText: String,
        expectedProviderSpeakerLabel: String?,
        expectedAcceptedCorrectionID: String?,
        playbackPositionSeconds: TimeInterval,
        capturedAt: Date = Date()
    ) throws -> PendingTranscriptReviewDecision {
        try enqueue(
            operation: .confirmSegmentAsIs,
            roomID: roomID,
            segmentID: segmentID,
            expectedProviderText: expectedProviderText,
            expectedProviderSpeakerLabel: expectedProviderSpeakerLabel,
            expectedAcceptedCorrectionID: expectedAcceptedCorrectionID,
            correctedText: nil,
            correctedSpeakerLabel: nil,
            reason: nil,
            playbackPositionSeconds: playbackPositionSeconds,
            capturedAt: capturedAt
        )
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

    private func enqueue(
        operation: PendingTranscriptReviewDecision.Operation,
        roomID: String,
        segmentID: String,
        expectedProviderText: String,
        expectedProviderSpeakerLabel: String?,
        expectedAcceptedCorrectionID: String?,
        correctedText: String?,
        correctedSpeakerLabel: String?,
        reason: String?,
        playbackPositionSeconds: TimeInterval?,
        capturedAt: Date
    ) throws -> PendingTranscriptReviewDecision {
        guard ledgerIsWritable else { throw TranscriptReviewDecisionStoreError.ledgerUnavailable }
        guard let owner = Self.normalizedOwnerID(activeOwnerAccountID),
              owner == Self.normalizedOwnerID(AuthManager.currentStoredOwnerID()) else {
            throw TranscriptReviewDecisionStoreError.accountIdentityUnavailable
        }
        let cleanRoomID = Self.cleanID(roomID)
        let cleanSegmentID = Self.cleanID(segmentID)
        guard !cleanRoomID.isEmpty,
              !cleanSegmentID.isEmpty,
              !expectedProviderText.isEmpty,
              expectedProviderText.count <= 100_000 else {
            throw TranscriptReviewDecisionStoreError.invalidDecision
        }
        if operation == .confirmSegmentAsIs {
            guard let playbackPositionSeconds,
                  playbackPositionSeconds.isFinite,
                  playbackPositionSeconds >= 0 else {
                throw TranscriptReviewDecisionStoreError.invalidDecision
            }
        } else if let playbackPositionSeconds,
                  (!playbackPositionSeconds.isFinite || playbackPositionSeconds < 0) {
            throw TranscriptReviewDecisionStoreError.invalidDecision
        }
        guard decision(roomID: cleanRoomID, segmentID: cleanSegmentID) == nil else {
            throw TranscriptReviewDecisionStoreError.decisionAlreadyPending
        }

        let entry = PendingTranscriptReviewDecision(
            id: UUID(),
            ownerAccountID: owner,
            operation: operation,
            roomID: cleanRoomID,
            segmentID: cleanSegmentID,
            expectedProviderText: expectedProviderText,
            expectedProviderSpeakerLabel: Self.optionalText(expectedProviderSpeakerLabel),
            expectedAcceptedCorrectionID: Self.optionalText(expectedAcceptedCorrectionID),
            correctedText: Self.optionalText(correctedText),
            correctedSpeakerLabel: Self.optionalText(correctedSpeakerLabel),
            reason: Self.optionalText(reason),
            playbackPositionSeconds: playbackPositionSeconds,
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

    private func update(_ id: UUID, change: (inout PendingTranscriptReviewDecision) -> Void) {
        guard entries.contains(where: { $0.id == id }),
              let index = storedEntries.firstIndex(where: { $0.id == id }) else { return }
        var updated = storedEntries
        change(&updated[index])
        commitBestEffort(updated)
    }

    @discardableResult
    private func commitBestEffort(_ updated: [PendingTranscriptReviewDecision]) -> Bool {
        do {
            try commit(updated)
            return true
        }
        catch {
            persistenceError = "The protected transcript-review outbox could not save: \(error.localizedDescription)"
            return false
        }
    }

    private func commit(_ updated: [PendingTranscriptReviewDecision]) throws {
        guard ledgerIsWritable else { throw TranscriptReviewDecisionStoreError.ledgerUnavailable }
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

    private func loadLedger() throws -> [PendingTranscriptReviewDecision] {
        if fileManager.fileExists(atPath: ledgerURL.path) {
            do { return try decode(ledgerURL) }
            catch {
                ledgerIsWritable = false
                if fileManager.fileExists(atPath: lastKnownGoodURL.path),
                   let recovered = try? decode(lastKnownGoodURL) {
                    persistenceError = "The transcript-review ledger is unreadable and locked read-only. A last-known-good copy remains visible."
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

    private func decode(_ url: URL) throws -> [PendingTranscriptReviewDecision] {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode([PendingTranscriptReviewDecision].self, from: Data(contentsOf: url))
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

    nonisolated private static func optionalText(_ value: String?) -> String? {
        guard let clean = value?.trimmingCharacters(in: .whitespacesAndNewlines), !clean.isEmpty else {
            return nil
        }
        return String(clean.prefix(100_000))
    }

    nonisolated private static func normalizedOwnerID(_ value: String?) -> String? {
        guard let normalized = value?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
              !normalized.isEmpty,
              normalized.count <= 320 else { return nil }
        return normalized
    }
}
