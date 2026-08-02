import Combine
import Foundation

struct PendingFocusBlockDecision: Codable, Equatable, Identifiable {
    enum Disposition: String, Codable {
        case pending
        case held
    }

    let id: UUID
    let ownerAccountID: String
    let blockID: String
    let nextStatus: String
    let actualMinutes: Int?
    let expectedUpdatedAt: String
    let capturedAt: Date
    var disposition: Disposition
    var attemptCount: Int
    var lastAttemptAt: Date?
    var lastErrorCode: String?
    var lastErrorMessage: String?

    var clientRequestID: String { id.uuidString.lowercased() }
}

enum FocusBlockDecisionStoreError: LocalizedError {
    case accountIdentityUnavailable
    case invalidDecision
    case decisionAlreadyPending
    case ledgerUnavailable

    var errorDescription: String? {
        switch self {
        case .accountIdentityUnavailable:
            "Verify the current Quipsly account before recording this work."
        case .invalidDecision:
            "Refresh Today and record valid actual time before changing this focus block."
        case .decisionAlreadyPending:
            "This focus block already has a protected phone decision waiting for Nest."
        case .ledgerUnavailable:
            "The protected focus-decision outbox is unavailable. Nothing was claimed as changed."
        }
    }
}

/// File-protected, account-partitioned focus decisions from Today.
///
/// The exact status, explicit actual time, optimistic Nest revision, and stable
/// request UUID are durable before Capture claims an offline save. Replaying
/// that UUID can acknowledge an already-applied operation after a lost response
/// without guessing time or completing the linked Task or Goal.
@MainActor
final class FocusBlockDecisionOutbox: ObservableObject {
    static let shared = FocusBlockDecisionOutbox()

    @Published private(set) var entries: [PendingFocusBlockDecision] = []
    @Published private(set) var persistenceError: String?

    private let fileManager: FileManager
    private let ledgerURL: URL
    private let lastKnownGoodURL: URL
    private var storedEntries: [PendingFocusBlockDecision] = []
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
                .appendingPathComponent("QuipslyCapture/FocusBlockDecisionOutbox", isDirectory: true)
            ?? URL(fileURLWithPath: NSHomeDirectory())
                .appendingPathComponent("Library/Application Support/QuipslyCapture/FocusBlockDecisionOutbox", isDirectory: true)
        ledgerURL = support.appendingPathComponent("focus-block-decisions-v1.json")
        lastKnownGoodURL = support.appendingPathComponent("focus-block-decisions-v1.last-known-good.json")

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
            persistenceError = "The protected focus-decision outbox could not open: \(error.localizedDescription)"
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

    func decision(forBlockID blockID: String) -> PendingFocusBlockDecision? {
        entries.first { $0.blockID == blockID }
    }

    @discardableResult
    func enqueue(
        blockID: String,
        nextStatus: String,
        actualMinutes: Int?,
        expectedUpdatedAt: String,
        capturedAt: Date = Date()
    ) throws -> PendingFocusBlockDecision {
        guard ledgerIsWritable else { throw FocusBlockDecisionStoreError.ledgerUnavailable }
        guard let owner = Self.normalizedOwnerID(activeOwnerAccountID),
              owner == Self.normalizedOwnerID(AuthManager.currentStoredOwnerID()) else {
            throw FocusBlockDecisionStoreError.accountIdentityUnavailable
        }
        let cleanBlockID = Self.cleanID(blockID)
        let cleanStatus = nextStatus.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        let statuses = Set(["PLANNED", "COMPLETED", "SKIPPED", "CANCELED"])
        guard !cleanBlockID.isEmpty,
              !expectedUpdatedAt.isEmpty,
              statuses.contains(cleanStatus),
              cleanStatus == "COMPLETED"
                ? actualMinutes.map({ (1...1_440).contains($0) }) == true
                : actualMinutes == nil else {
            throw FocusBlockDecisionStoreError.invalidDecision
        }
        guard decision(forBlockID: cleanBlockID) == nil else {
            throw FocusBlockDecisionStoreError.decisionAlreadyPending
        }

        let entry = PendingFocusBlockDecision(
            id: UUID(),
            ownerAccountID: owner,
            blockID: cleanBlockID,
            nextStatus: cleanStatus,
            actualMinutes: actualMinutes,
            expectedUpdatedAt: expectedUpdatedAt,
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
            entry.lastErrorMessage = "Retry requested."
        }
    }

    private func update(_ id: UUID, change: (inout PendingFocusBlockDecision) -> Void) {
        guard entries.contains(where: { $0.id == id }),
              let index = storedEntries.firstIndex(where: { $0.id == id }) else { return }
        var updated = storedEntries
        change(&updated[index])
        commitBestEffort(updated)
    }

    private func commitBestEffort(_ updated: [PendingFocusBlockDecision]) {
        do { try commit(updated) }
        catch {
            persistenceError = "The protected focus-decision outbox could not save: \(error.localizedDescription)"
        }
    }

    private func commit(_ updated: [PendingFocusBlockDecision]) throws {
        guard ledgerIsWritable else { throw FocusBlockDecisionStoreError.ledgerUnavailable }
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

    private func loadLedger() throws -> [PendingFocusBlockDecision] {
        if fileManager.fileExists(atPath: ledgerURL.path) {
            do { return try decode(ledgerURL) }
            catch {
                ledgerIsWritable = false
                if fileManager.fileExists(atPath: lastKnownGoodURL.path),
                   let recovered = try? decode(lastKnownGoodURL) {
                    persistenceError = "The focus-decision ledger is unreadable and locked read-only. A last-known-good copy remains visible."
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

    private func decode(_ url: URL) throws -> [PendingFocusBlockDecision] {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode([PendingFocusBlockDecision].self, from: Data(contentsOf: url))
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
              normalized.count <= 320 else { return nil }
        return normalized
    }
}
