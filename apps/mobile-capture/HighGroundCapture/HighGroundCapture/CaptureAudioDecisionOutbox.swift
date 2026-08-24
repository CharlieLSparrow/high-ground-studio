import Combine
import Foundation

struct PendingCaptureAudioDeliveryReview: Codable, Equatable, Identifiable {
    enum Decision: String, Codable {
        case approved
        case rejected
    }

    enum Disposition: String, Codable {
        case pending
        case held
    }

    let id: UUID
    let ownerAccountID: String
    let projectSlug: String
    let assetID: String
    let sourceID: String
    let deliveryJobID: String
    let deliverySHA256: String
    let deliverySizeBytes: Int64
    let decision: Decision
    let listenedSecondBins: [Int]
    let completedAt: Date
    let note: String?
    var disposition: Disposition
    var attemptCount: Int
    var lastAttemptAt: Date?
    var lastErrorCode: String?
    var lastErrorMessage: String?

    var clientRequestID: String {
        "iphone-audio-delivery-review-\(id.uuidString.lowercased())"
    }
}

enum CaptureAudioDecisionStoreError: LocalizedError {
    case accountIdentityUnavailable
    case invalidDecision
    case decisionAlreadyPending
    case ledgerUnavailable

    var errorDescription: String? {
        switch self {
        case .accountIdentityUnavailable:
            "Verify the current Quipsly account before preserving the audio decision."
        case .invalidDecision:
            "The audio decision is incomplete or no longer matches the reviewed file."
        case .decisionAlreadyPending:
            "This encoded file already has a protected phone decision waiting for Nest."
        case .ledgerUnavailable:
            "The protected audio-decision outbox is unavailable. Nothing was claimed as reviewed."
        }
    }
}

/// A crash-safe journal for proof-listening decisions made against one exact
/// encoded delivery artifact. The immutable request is written before network
/// transmission and is removed only after Nest returns its idempotent receipt.
/// Entries are visible only to the account that created them.
@MainActor
final class CaptureAudioDecisionOutbox: ObservableObject {
    static let shared = CaptureAudioDecisionOutbox()

    @Published private(set) var entries: [PendingCaptureAudioDeliveryReview] = []
    @Published private(set) var persistenceError: String?

    private let fileManager: FileManager
    private let ledgerURL: URL
    private let lastKnownGoodURL: URL
    private var storedEntries: [PendingCaptureAudioDeliveryReview] = []
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
                .appendingPathComponent("QuipslyCapture/CaptureAudioDecisionOutbox", isDirectory: true)
            ?? URL(fileURLWithPath: NSHomeDirectory())
                .appendingPathComponent("Library/Application Support/QuipslyCapture/CaptureAudioDecisionOutbox", isDirectory: true)
        ledgerURL = support.appendingPathComponent("audio-delivery-review-decisions-v1.json")
        lastKnownGoodURL = support.appendingPathComponent("audio-delivery-review-decisions-v1.last-known-good.json")

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
            persistenceError = "The protected audio-decision outbox could not open: \(error.localizedDescription)"
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

    func decision(projectSlug: String, assetID: String) -> PendingCaptureAudioDeliveryReview? {
        let project = Self.cleanID(projectSlug)
        let asset = Self.cleanID(assetID)
        return entries.first { $0.projectSlug == project && $0.assetID == asset }
    }

    @discardableResult
    func enqueueDeliveryReview(
        projectSlug: String,
        assetID: String,
        sourceID: String,
        deliveryJobID: String,
        deliverySHA256: String,
        deliverySizeBytes: Int64,
        decision: PendingCaptureAudioDeliveryReview.Decision,
        listenedSecondBins: [Int],
        note: String?,
        completedAt: Date = Date()
    ) throws -> PendingCaptureAudioDeliveryReview {
        guard ledgerIsWritable else { throw CaptureAudioDecisionStoreError.ledgerUnavailable }
        guard let owner = Self.normalizedOwnerID(activeOwnerAccountID),
              owner == Self.normalizedOwnerID(AuthManager.currentStoredOwnerID()) else {
            throw CaptureAudioDecisionStoreError.accountIdentityUnavailable
        }
        let project = Self.cleanID(projectSlug)
        let asset = Self.cleanID(assetID)
        let source = Self.cleanID(sourceID)
        let job = Self.cleanID(deliveryJobID)
        let sha256 = deliverySHA256.lowercased()
        let bins = Array(Set(listenedSecondBins.filter { $0 >= 0 })).sorted()
        let cleanNote = Self.optionalText(note)
        let stableCompletedAt = Date(timeIntervalSince1970: floor(completedAt.timeIntervalSince1970))
        guard !project.isEmpty,
              !asset.isEmpty,
              !source.isEmpty,
              !job.isEmpty,
              sha256.range(of: "^[0-9a-f]{64}$", options: .regularExpression) != nil,
              deliverySizeBytes > 0,
              !bins.isEmpty,
              completedAt.timeIntervalSince1970.isFinite,
              decision != .rejected || cleanNote != nil else {
            throw CaptureAudioDecisionStoreError.invalidDecision
        }
        guard self.decision(projectSlug: project, assetID: asset) == nil else {
            throw CaptureAudioDecisionStoreError.decisionAlreadyPending
        }

        let entry = PendingCaptureAudioDeliveryReview(
            id: UUID(),
            ownerAccountID: owner,
            projectSlug: project,
            assetID: asset,
            sourceID: source,
            deliveryJobID: job,
            deliverySHA256: sha256,
            deliverySizeBytes: deliverySizeBytes,
            decision: decision,
            listenedSecondBins: bins,
            completedAt: stableCompletedAt,
            note: cleanNote,
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

    func markAttempting(_ id: UUID, at date: Date = Date()) {
        update(id) { entry in
            entry.attemptCount += 1
            entry.lastAttemptAt = date
            entry.lastErrorCode = nil
            entry.lastErrorMessage = nil
        }
    }

    @discardableResult
    func markAcknowledged(_ id: UUID) -> Bool {
        guard entries.contains(where: { $0.id == id }) else { return false }
        var updated = storedEntries
        updated.removeAll { $0.id == id }
        return commitBestEffort(updated)
    }

    func markRetryable(_ id: UUID, message: String) {
        update(id) { entry in
            entry.disposition = .pending
            entry.lastErrorCode = nil
            entry.lastErrorMessage = Self.optionalText(message)
        }
    }

    func markHeld(_ id: UUID, code: String?, message: String) {
        update(id) { entry in
            entry.disposition = .held
            entry.lastErrorCode = Self.optionalText(code)
            entry.lastErrorMessage = Self.optionalText(message)
        }
    }

    func releaseForRetry(_ id: UUID) {
        update(id) { entry in
            entry.disposition = .pending
            entry.lastErrorCode = nil
            entry.lastErrorMessage = "Retry requested after review."
        }
    }

    private func update(_ id: UUID, change: (inout PendingCaptureAudioDeliveryReview) -> Void) {
        guard entries.contains(where: { $0.id == id }),
              let index = storedEntries.firstIndex(where: { $0.id == id }) else { return }
        var updated = storedEntries
        change(&updated[index])
        commitBestEffort(updated)
    }

    @discardableResult
    private func commitBestEffort(_ updated: [PendingCaptureAudioDeliveryReview]) -> Bool {
        do {
            try commit(updated)
            return true
        } catch {
            persistenceError = "The protected audio-decision outbox could not save: \(error.localizedDescription)"
            return false
        }
    }

    private func commit(_ updated: [PendingCaptureAudioDeliveryReview]) throws {
        guard ledgerIsWritable else { throw CaptureAudioDecisionStoreError.ledgerUnavailable }
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

    private func loadLedger() throws -> [PendingCaptureAudioDeliveryReview] {
        if fileManager.fileExists(atPath: ledgerURL.path) {
            do { return try decode(ledgerURL) }
            catch {
                ledgerIsWritable = false
                if fileManager.fileExists(atPath: lastKnownGoodURL.path),
                   let recovered = try? decode(lastKnownGoodURL) {
                    persistenceError = "The audio-decision ledger is unreadable and locked read-only. A last-known-good copy remains visible."
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

    private func decode(_ url: URL) throws -> [PendingCaptureAudioDeliveryReview] {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode([PendingCaptureAudioDeliveryReview].self, from: Data(contentsOf: url))
    }

    private func publish() {
        storedEntries.sort { $0.completedAt < $1.completedAt }
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
        return String(clean.prefix(4_000))
    }

    nonisolated private static func normalizedOwnerID(_ value: String?) -> String? {
        guard let normalized = value?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
              !normalized.isEmpty,
              normalized.count <= 320 else { return nil }
        return normalized
    }
}
