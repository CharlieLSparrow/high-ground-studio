import Combine
import Foundation

struct PendingWorkTagDecision: Codable, Equatable, Identifiable {
    enum EntityKind: String, Codable {
        case task
        case goal
        case document
    }

    enum Disposition: String, Codable {
        case pending
        case held
    }

    let id: UUID
    let ownerAccountID: String
    let entityKind: EntityKind
    let entityID: String
    let projectID: String
    let tagIDs: [String]
    let expectedUpdatedAt: String
    let expectedTagRevision: Int?
    let capturedAt: Date
    var disposition: Disposition
    var attemptCount: Int
    var lastAttemptAt: Date?
    var lastErrorCode: String?
    var lastErrorMessage: String?

    var clientRequestID: String { id.uuidString.lowercased() }
}

enum WorkTagDecisionStoreError: LocalizedError {
    case accountIdentityUnavailable
    case invalidDecision
    case decisionAlreadyPending
    case ledgerUnavailable

    var errorDescription: String? {
        switch self {
        case .accountIdentityUnavailable:
            "Verify the current Quipsly account before changing tags."
        case .invalidDecision:
            "Refresh Today before changing this record’s Nest tags."
        case .decisionAlreadyPending:
            "This record already has a protected tag change waiting for Nest."
        case .ledgerUnavailable:
            "The protected tag-change outbox is unavailable. Nothing was claimed as changed."
        }
    }
}

/// File-protected, actor-partitioned tag decisions from Today.
///
/// The outbox persists the complete desired tag set before the UI claims an
/// offline change. A stable UUID binds retries to one optimistic Nest revision.
@MainActor
final class WorkTagDecisionOutbox: ObservableObject {
    static let shared = WorkTagDecisionOutbox()

    @Published private(set) var entries: [PendingWorkTagDecision] = []
    @Published private(set) var persistenceError: String?

    private let fileManager: FileManager
    private let ledgerURL: URL
    private let lastKnownGoodURL: URL
    private var storedEntries: [PendingWorkTagDecision] = []
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
                .appendingPathComponent("QuipslyCapture/WorkTagDecisionOutbox", isDirectory: true)
            ?? URL(fileURLWithPath: NSHomeDirectory())
                .appendingPathComponent("Library/Application Support/QuipslyCapture/WorkTagDecisionOutbox", isDirectory: true)
        ledgerURL = support.appendingPathComponent("work-tag-decisions-v1.json")
        lastKnownGoodURL = support.appendingPathComponent("work-tag-decisions-v1.last-known-good.json")

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
            persistenceError = "The protected tag-change outbox could not open: \(error.localizedDescription)"
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

    func decision(
        entityKind: PendingWorkTagDecision.EntityKind,
        entityID: String
    ) -> PendingWorkTagDecision? {
        entries.first { $0.entityKind == entityKind && $0.entityID == entityID }
    }

    @discardableResult
    func enqueue(
        entityKind: PendingWorkTagDecision.EntityKind,
        entityID: String,
        projectID: String,
        tagIDs: [String],
        expectedUpdatedAt: String,
        expectedTagRevision: Int? = nil,
        capturedAt: Date = Date()
    ) throws -> PendingWorkTagDecision {
        guard ledgerIsWritable else { throw WorkTagDecisionStoreError.ledgerUnavailable }
        guard let owner = Self.normalizedOwnerID(activeOwnerAccountID),
              owner == Self.normalizedOwnerID(AuthManager.currentStoredOwnerID()) else {
            throw WorkTagDecisionStoreError.accountIdentityUnavailable
        }
        let cleanEntityID = Self.cleanID(entityID)
        let cleanProjectID = Self.cleanID(projectID)
        let cleanTagIDs = Array(Set(tagIDs.map(Self.cleanID).filter { !$0.isEmpty })).sorted()
        guard !cleanEntityID.isEmpty,
              !cleanProjectID.isEmpty,
              !expectedUpdatedAt.isEmpty,
              entityKind != .document || expectedTagRevision.map({ $0 >= 0 }) == true,
              cleanTagIDs.count == tagIDs.count,
              cleanTagIDs.count <= 24 else {
            throw WorkTagDecisionStoreError.invalidDecision
        }
        guard decision(entityKind: entityKind, entityID: cleanEntityID) == nil else {
            throw WorkTagDecisionStoreError.decisionAlreadyPending
        }

        let entry = PendingWorkTagDecision(
            id: UUID(),
            ownerAccountID: owner,
            entityKind: entityKind,
            entityID: cleanEntityID,
            projectID: cleanProjectID,
            tagIDs: cleanTagIDs,
            expectedUpdatedAt: expectedUpdatedAt,
            expectedTagRevision: expectedTagRevision,
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

    private func update(
        _ id: UUID,
        change: (inout PendingWorkTagDecision) -> Void
    ) {
        guard entries.contains(where: { $0.id == id }),
              let index = storedEntries.firstIndex(where: { $0.id == id }) else { return }
        var updated = storedEntries
        change(&updated[index])
        commitBestEffort(updated)
    }

    private func commitBestEffort(_ updated: [PendingWorkTagDecision]) {
        do { try commit(updated) }
        catch {
            persistenceError = "The protected tag-change outbox could not save: \(error.localizedDescription)"
        }
    }

    private func commit(_ updated: [PendingWorkTagDecision]) throws {
        guard ledgerIsWritable else { throw WorkTagDecisionStoreError.ledgerUnavailable }
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

    private func loadLedger() throws -> [PendingWorkTagDecision] {
        if fileManager.fileExists(atPath: ledgerURL.path) {
            do { return try decode(ledgerURL) }
            catch {
                ledgerIsWritable = false
                if fileManager.fileExists(atPath: lastKnownGoodURL.path),
                   let recovered = try? decode(lastKnownGoodURL) {
                    persistenceError = "The tag-change ledger is unreadable and locked read-only. A last-known-good copy remains visible."
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

    private func decode(_ url: URL) throws -> [PendingWorkTagDecision] {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode([PendingWorkTagDecision].self, from: Data(contentsOf: url))
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
        String(value.trimmingCharacters(in: .whitespacesAndNewlines).prefix(200))
    }

    nonisolated private static func normalizedOwnerID(_ value: String?) -> String? {
        guard let normalized = value?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
              !normalized.isEmpty,
              normalized.count <= 256 else { return nil }
        return normalized
    }
}
