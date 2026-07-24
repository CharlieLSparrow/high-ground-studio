import Combine
import Foundation

struct PendingTaskReminderDecision: Codable, Equatable, Identifiable {
    enum Disposition: String, Codable {
        case pending
        case held
    }

    let id: UUID
    let ownerAccountID: String
    let taskID: String
    let currentReminderID: String?
    let remindAt: Date?
    let timezone: String
    let requestedLocalDateTime: String?
    let expectedTaskUpdatedAt: String
    let expectedReminderUpdatedAt: String?
    let capturedAt: Date
    var disposition: Disposition
    var attemptCount: Int
    var lastAttemptAt: Date?
    var lastErrorCode: String?
    var lastErrorMessage: String?

    var clientRequestID: String { id.uuidString.lowercased() }
    var projectedReminderID: String {
        currentReminderID ?? "mobile-task-reminder-decision-\(clientRequestID)"
    }
}

enum TaskReminderDecisionStoreError: LocalizedError {
    case accountIdentityUnavailable
    case invalidTask
    case invalidTime
    case decisionAlreadyPending
    case ledgerUnavailable

    var errorDescription: String? {
        switch self {
        case .accountIdentityUnavailable:
            "Verify the current Quipsly account before changing this reminder."
        case .invalidTask:
            "Refresh Today before changing this task reminder."
        case .invalidTime:
            "Choose a valid future reminder time."
        case .decisionAlreadyPending:
            "This reminder already has a protected phone change waiting for Nest."
        case .ledgerUnavailable:
            "The protected reminder-change outbox is unavailable. Nothing was claimed as changed."
        }
    }
}

/// Durable, account-partitioned decisions made from Today.
///
/// Enqueueing is the phone's offline success boundary. Nest remains canonical,
/// while the stable UUID makes every replay idempotent across timeouts and
/// process death.
@MainActor
final class TaskReminderDecisionOutbox: ObservableObject {
    static let shared = TaskReminderDecisionOutbox()

    @Published private(set) var entries: [PendingTaskReminderDecision] = []
    @Published private(set) var persistenceError: String?

    private let fileManager: FileManager
    private let ledgerURL: URL
    private let lastKnownGoodURL: URL
    private var storedEntries: [PendingTaskReminderDecision] = []
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
                .appendingPathComponent("QuipslyCapture/TaskReminderDecisionOutbox", isDirectory: true)
            ?? URL(fileURLWithPath: NSHomeDirectory())
                .appendingPathComponent("Library/Application Support/QuipslyCapture/TaskReminderDecisionOutbox", isDirectory: true)
        ledgerURL = support.appendingPathComponent("task-reminder-decisions-v1.json")
        lastKnownGoodURL = support.appendingPathComponent("task-reminder-decisions-v1.last-known-good.json")

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
            persistenceError = "The protected reminder-change outbox could not open: \(error.localizedDescription)"
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

    func decision(forTaskID taskID: String) -> PendingTaskReminderDecision? {
        entries.first { $0.taskID == taskID }
    }

    @discardableResult
    func enqueue(
        taskID: String,
        currentReminderID: String?,
        remindAt: Date?,
        timezone: String,
        requestedLocalDateTime: String?,
        expectedTaskUpdatedAt: String,
        expectedReminderUpdatedAt: String?,
        capturedAt: Date = Date()
    ) throws -> PendingTaskReminderDecision {
        guard ledgerIsWritable else { throw TaskReminderDecisionStoreError.ledgerUnavailable }
        guard let owner = Self.normalizedOwnerID(activeOwnerAccountID),
              owner == Self.normalizedOwnerID(AuthManager.currentStoredOwnerID()) else {
            throw TaskReminderDecisionStoreError.accountIdentityUnavailable
        }
        let cleanTaskID = taskID.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanTimezone = timezone.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanTaskID.isEmpty,
              cleanTaskID.count <= 256,
              !expectedTaskUpdatedAt.isEmpty,
              cleanTimezone.count <= 100,
              TimeZone(identifier: cleanTimezone) != nil else {
            throw TaskReminderDecisionStoreError.invalidTask
        }
        guard remindAt == nil || remindAt! > capturedAt,
              remindAt == nil || requestedLocalDateTime?.isEmpty == false else {
            throw TaskReminderDecisionStoreError.invalidTime
        }
        guard !entries.contains(where: { $0.taskID == cleanTaskID }) else {
            throw TaskReminderDecisionStoreError.decisionAlreadyPending
        }

        let cleanReminderID = currentReminderID?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let entry = PendingTaskReminderDecision(
            id: UUID(),
            ownerAccountID: owner,
            taskID: cleanTaskID,
            currentReminderID: cleanReminderID?.isEmpty == false ? cleanReminderID : nil,
            remindAt: remindAt,
            timezone: cleanTimezone,
            requestedLocalDateTime: requestedLocalDateTime,
            expectedTaskUpdatedAt: expectedTaskUpdatedAt,
            expectedReminderUpdatedAt: expectedReminderUpdatedAt,
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

    func releaseHeldEntriesForRetry() {
        let visibleIDs = Set(entries.map(\.id))
        var updated = storedEntries
        for index in updated.indices where visibleIDs.contains(updated[index].id) {
            updated[index].disposition = .pending
        }
        commitBestEffort(updated)
    }

    private func update(
        _ id: UUID,
        change: (inout PendingTaskReminderDecision) -> Void
    ) {
        guard entries.contains(where: { $0.id == id }),
              let index = storedEntries.firstIndex(where: { $0.id == id }) else { return }
        var updated = storedEntries
        change(&updated[index])
        commitBestEffort(updated)
    }

    private func commitBestEffort(_ updated: [PendingTaskReminderDecision]) {
        do { try commit(updated) }
        catch {
            persistenceError = "The protected reminder-change outbox could not save: \(error.localizedDescription)"
        }
    }

    private func commit(_ updated: [PendingTaskReminderDecision]) throws {
        guard ledgerIsWritable else { throw TaskReminderDecisionStoreError.ledgerUnavailable }
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

    private func loadLedger() throws -> [PendingTaskReminderDecision] {
        if fileManager.fileExists(atPath: ledgerURL.path) {
            do { return try decode(ledgerURL) }
            catch {
                ledgerIsWritable = false
                if fileManager.fileExists(atPath: lastKnownGoodURL.path),
                   let recovered = try? decode(lastKnownGoodURL) {
                    persistenceError = "The reminder-change ledger is unreadable and locked read-only. A last-known-good copy remains visible."
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

    private func decode(_ url: URL) throws -> [PendingTaskReminderDecision] {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode([PendingTaskReminderDecision].self, from: Data(contentsOf: url))
    }

    private func publish() {
        storedEntries.sort { $0.capturedAt < $1.capturedAt }
        guard let owner = activeOwnerAccountID else {
            entries = []
            return
        }
        entries = storedEntries.filter { Self.normalizedOwnerID($0.ownerAccountID) == owner }
    }

    nonisolated private static func normalizedOwnerID(_ value: String?) -> String? {
        guard let normalized = value?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
              !normalized.isEmpty,
              normalized.count <= 256 else { return nil }
        return normalized
    }
}
