import Combine
import Foundation

struct PendingSourceAnnotationDraftDecision: Codable, Equatable, Identifiable {
    enum Disposition: String, Codable {
        case pending
        case held
    }

    let id: UUID
    let ownerAccountID: String
    let annotationID: String
    let projectSlug: String
    let sourceTitle: String
    let expectedAnnotationUpdatedAt: String
    let capturedAt: Date
    var disposition: Disposition
    var attemptCount: Int
    var lastAttemptAt: Date?
    var lastErrorCode: String?
    var lastErrorMessage: String?

    var clientRequestID: String { id.uuidString.lowercased() }
}

enum SourceAnnotationDraftDecisionStoreError: LocalizedError {
    case accountIdentityUnavailable
    case invalidDecision
    case decisionAlreadyPending
    case ledgerUnavailable

    var errorDescription: String? {
        switch self {
        case .accountIdentityUnavailable:
            "Verify the current Quipsly account before starting a private draft."
        case .invalidDecision:
            "Refresh Research before starting this private draft."
        case .decisionAlreadyPending:
            "This source note already has a protected writing handoff waiting for Nest."
        case .ledgerUnavailable:
            "The protected writing-handoff outbox is unavailable. Nothing was claimed as drafted."
        }
    }
}

/// File-protected, actor-partitioned source-to-writing decisions.
///
/// Enqueueing is the offline success boundary. The stable UUID, annotation,
/// Nest slug, and optimistic annotation revision are retained together until
/// Nest acknowledges the exact private document and citation block.
@MainActor
final class SourceAnnotationDraftOutbox: ObservableObject {
    static let shared = SourceAnnotationDraftOutbox()

    @Published private(set) var entries: [PendingSourceAnnotationDraftDecision] = []
    @Published private(set) var persistenceError: String?

    private let fileManager: FileManager
    private let ledgerURL: URL
    private let lastKnownGoodURL: URL
    private var storedEntries: [PendingSourceAnnotationDraftDecision] = []
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
                .appendingPathComponent(
                    "QuipslyCapture/SourceAnnotationDraftOutbox",
                    isDirectory: true
                )
            ?? URL(fileURLWithPath: NSHomeDirectory())
                .appendingPathComponent(
                    "Library/Application Support/QuipslyCapture/SourceAnnotationDraftOutbox",
                    isDirectory: true
                )
        ledgerURL = support.appendingPathComponent("source-annotation-drafts-v1.json")
        lastKnownGoodURL = support.appendingPathComponent(
            "source-annotation-drafts-v1.last-known-good.json"
        )

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
            persistenceError = "The protected writing-handoff outbox could not open: \(error.localizedDescription)"
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

    func decision(for annotationID: String) -> PendingSourceAnnotationDraftDecision? {
        entries.first { $0.annotationID == annotationID }
    }

    @discardableResult
    func enqueue(
        annotationID: String,
        projectSlug: String,
        sourceTitle: String,
        expectedAnnotationUpdatedAt: String,
        capturedAt: Date = Date()
    ) throws -> PendingSourceAnnotationDraftDecision {
        guard ledgerIsWritable else {
            throw SourceAnnotationDraftDecisionStoreError.ledgerUnavailable
        }
        guard let owner = Self.normalizedOwnerID(activeOwnerAccountID),
              owner == Self.normalizedOwnerID(AuthManager.currentStoredOwnerID()) else {
            throw SourceAnnotationDraftDecisionStoreError.accountIdentityUnavailable
        }
        let cleanAnnotationID = Self.clean(annotationID, max: 200)
        let cleanProjectSlug = Self.clean(projectSlug, max: 200)
        let cleanSourceTitle = Self.clean(sourceTitle, max: 500)
        guard !cleanAnnotationID.isEmpty,
              !cleanProjectSlug.isEmpty,
              !cleanSourceTitle.isEmpty,
              Self.isoDate(expectedAnnotationUpdatedAt) != nil else {
            throw SourceAnnotationDraftDecisionStoreError.invalidDecision
        }
        guard decision(for: cleanAnnotationID) == nil else {
            throw SourceAnnotationDraftDecisionStoreError.decisionAlreadyPending
        }

        let entry = PendingSourceAnnotationDraftDecision(
            id: UUID(),
            ownerAccountID: owner,
            annotationID: cleanAnnotationID,
            projectSlug: cleanProjectSlug,
            sourceTitle: cleanSourceTitle,
            expectedAnnotationUpdatedAt: expectedAnnotationUpdatedAt,
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

    func markAcknowledged(_ id: UUID) {
        var updated = storedEntries
        updated.removeAll { $0.id == id }
        commitBestEffort(updated)
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
            entry.lastErrorCode = code
            entry.lastErrorMessage = message
        }
    }

    func releaseForRetry(_ id: UUID) {
        update(id) { entry in
            entry.disposition = .pending
            entry.lastErrorCode = nil
            entry.lastErrorMessage = nil
        }
    }

    private func update(
        _ id: UUID,
        change: (inout PendingSourceAnnotationDraftDecision) -> Void
    ) {
        guard entries.contains(where: { $0.id == id }),
              let index = storedEntries.firstIndex(where: { $0.id == id }) else { return }
        var updated = storedEntries
        change(&updated[index])
        commitBestEffort(updated)
    }

    private func commitBestEffort(_ updated: [PendingSourceAnnotationDraftDecision]) {
        do {
            try commit(updated)
        } catch {
            persistenceError = "The protected writing-handoff outbox could not save: \(error.localizedDescription)"
        }
    }

    private func commit(_ updated: [PendingSourceAnnotationDraftDecision]) throws {
        guard ledgerIsWritable else {
            throw SourceAnnotationDraftDecisionStoreError.ledgerUnavailable
        }
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

    private func loadLedger() throws -> [PendingSourceAnnotationDraftDecision] {
        if fileManager.fileExists(atPath: ledgerURL.path) {
            do {
                return try decode(ledgerURL)
            } catch {
                ledgerIsWritable = false
                if fileManager.fileExists(atPath: lastKnownGoodURL.path),
                   let recovered = try? decode(lastKnownGoodURL) {
                    persistenceError = "The writing-handoff ledger is unreadable and locked read-only. A last-known-good copy remains visible."
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

    private func decode(_ url: URL) throws -> [PendingSourceAnnotationDraftDecision] {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(
            [PendingSourceAnnotationDraftDecision].self,
            from: Data(contentsOf: url)
        )
    }

    private func publish() {
        storedEntries.sort { $0.capturedAt < $1.capturedAt }
        guard let owner = activeOwnerAccountID else {
            entries = []
            return
        }
        entries = storedEntries.filter {
            Self.normalizedOwnerID($0.ownerAccountID) == owner
        }
    }

    nonisolated private static func clean(_ value: String, max: Int) -> String {
        String(value.trimmingCharacters(in: .whitespacesAndNewlines).prefix(max))
    }

    nonisolated private static func isoDate(_ value: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }

    nonisolated private static func normalizedOwnerID(_ value: String?) -> String? {
        guard let normalized = value?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
              !normalized.isEmpty,
              normalized.count <= 256 else { return nil }
        return normalized
    }
}
