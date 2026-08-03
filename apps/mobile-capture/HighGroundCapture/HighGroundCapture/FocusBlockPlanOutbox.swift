import Combine
import Foundation

struct PendingFocusBlockPlan: Codable, Equatable, Identifiable {
    enum Disposition: String, Codable {
        case pending
        case held
    }

    let id: UUID
    let ownerAccountID: String
    let taskID: String
    let startsAtLocal: String
    let durationMinutes: Int
    let timezone: String
    let expectedTaskUpdatedAt: String
    let capturedAt: Date
    var disposition: Disposition
    var attemptCount: Int
    var lastAttemptAt: Date?
    var lastErrorCode: String?
    var lastErrorMessage: String?

    var clientRequestID: String { id.uuidString.lowercased() }
    var projectedPlanBlockID: String { "mobile-focus-create-\(clientRequestID)" }
}

enum FocusBlockPlanStoreError: LocalizedError {
    case accountIdentityUnavailable
    case invalidPlan
    case planAlreadyPending
    case ledgerUnavailable

    var errorDescription: String? {
        switch self {
        case .accountIdentityUnavailable:
            "Verify the current Quipsly account before planning private work."
        case .invalidPlan:
            "Choose a valid start time and a focus duration from 15 minutes to 12 hours."
        case .planAlreadyPending:
            "This task already has a protected focus plan waiting for Nest."
        case .ledgerUnavailable:
            "The protected focus-plan outbox is unavailable. Nothing was claimed as planned."
        }
    }
}

/// A file-protected, account-partitioned creation ledger for iPhone focus plans.
///
/// Capture writes the exact local wall-clock request and target revision before
/// network delivery. Its UUID also deterministically identifies the canonical
/// WorkPlanBlock, so a retry after a lost response cannot duplicate the plan.
@MainActor
final class FocusBlockPlanOutbox: ObservableObject {
    static let shared = FocusBlockPlanOutbox()

    @Published private(set) var entries: [PendingFocusBlockPlan] = []
    @Published private(set) var persistenceError: String?

    private let fileManager: FileManager
    private let ledgerURL: URL
    private let lastKnownGoodURL: URL
    private var storedEntries: [PendingFocusBlockPlan] = []
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
                .appendingPathComponent("QuipslyCapture/FocusBlockPlanOutbox", isDirectory: true)
            ?? URL(fileURLWithPath: NSHomeDirectory())
                .appendingPathComponent("Library/Application Support/QuipslyCapture/FocusBlockPlanOutbox", isDirectory: true)
        ledgerURL = support.appendingPathComponent("focus-block-plans-v1.json")
        lastKnownGoodURL = support.appendingPathComponent("focus-block-plans-v1.last-known-good.json")

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
            persistenceError = "The protected focus-plan outbox could not open: \(error.localizedDescription)"
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

    func plan(forTaskID taskID: String) -> PendingFocusBlockPlan? {
        entries.first { $0.taskID == taskID }
    }

    @discardableResult
    func enqueue(
        taskID: String,
        startsAtLocal: String,
        durationMinutes: Int,
        timezone: String,
        expectedTaskUpdatedAt: String,
        capturedAt: Date = Date()
    ) throws -> PendingFocusBlockPlan {
        guard ledgerIsWritable else { throw FocusBlockPlanStoreError.ledgerUnavailable }
        guard let owner = Self.normalizedOwnerID(activeOwnerAccountID),
              owner == Self.normalizedOwnerID(AuthManager.currentStoredOwnerID()) else {
            throw FocusBlockPlanStoreError.accountIdentityUnavailable
        }
        let taskID = Self.clean(taskID, max: 200)
        let startsAtLocal = Self.clean(startsAtLocal, max: 80)
        let timezone = Self.clean(timezone, max: 100)
        guard !taskID.isEmpty,
              !startsAtLocal.isEmpty,
              !timezone.isEmpty,
              !expectedTaskUpdatedAt.isEmpty,
              (15...720).contains(durationMinutes) else {
            throw FocusBlockPlanStoreError.invalidPlan
        }
        guard plan(forTaskID: taskID) == nil else {
            throw FocusBlockPlanStoreError.planAlreadyPending
        }

        let entry = PendingFocusBlockPlan(
            id: UUID(),
            ownerAccountID: owner,
            taskID: taskID,
            startsAtLocal: startsAtLocal,
            durationMinutes: durationMinutes,
            timezone: timezone,
            expectedTaskUpdatedAt: expectedTaskUpdatedAt,
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
        update(id) {
            $0.disposition = .pending
            $0.attemptCount += 1
            $0.lastAttemptAt = date
            $0.lastErrorCode = nil
            $0.lastErrorMessage = message
        }
    }

    func markHeld(_ id: UUID, code: String?, message: String, at date: Date = Date()) {
        update(id) {
            $0.disposition = .held
            $0.attemptCount += 1
            $0.lastAttemptAt = date
            $0.lastErrorCode = code
            $0.lastErrorMessage = message
        }
    }

    func releaseForRetry(_ id: UUID) {
        update(id) {
            $0.disposition = .pending
            $0.lastErrorCode = nil
            $0.lastErrorMessage = "Retry requested."
        }
    }

    private func update(_ id: UUID, change: (inout PendingFocusBlockPlan) -> Void) {
        guard entries.contains(where: { $0.id == id }),
              let index = storedEntries.firstIndex(where: { $0.id == id }) else { return }
        var updated = storedEntries
        change(&updated[index])
        commitBestEffort(updated)
    }

    private func commitBestEffort(_ updated: [PendingFocusBlockPlan]) {
        do { try commit(updated) }
        catch { persistenceError = "The protected focus-plan outbox could not save: \(error.localizedDescription)" }
    }

    private func commit(_ updated: [PendingFocusBlockPlan]) throws {
        guard ledgerIsWritable else { throw FocusBlockPlanStoreError.ledgerUnavailable }
        do {
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            encoder.outputFormatting = [.sortedKeys]
            let data = try encoder.encode(updated)
            try data.write(to: lastKnownGoodURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            try data.write(to: ledgerURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            storedEntries = updated
            persistenceError = nil
            publish()
        } catch {
            ledgerIsWritable = false
            throw error
        }
    }

    private func loadLedger() throws -> [PendingFocusBlockPlan] {
        if fileManager.fileExists(atPath: ledgerURL.path) {
            do { return try decode(ledgerURL) }
            catch {
                ledgerIsWritable = false
                if fileManager.fileExists(atPath: lastKnownGoodURL.path),
                   let recovered = try? decode(lastKnownGoodURL) {
                    persistenceError = "The focus-plan ledger is unreadable and locked read-only. A last-known-good copy remains visible."
                    return recovered
                }
                throw error
            }
        }
        if fileManager.fileExists(atPath: lastKnownGoodURL.path),
           let recovered = try? decode(lastKnownGoodURL) { return recovered }
        return []
    }

    private func decode(_ url: URL) throws -> [PendingFocusBlockPlan] {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode([PendingFocusBlockPlan].self, from: Data(contentsOf: url))
    }

    private func publish() {
        storedEntries.sort { $0.capturedAt < $1.capturedAt }
        guard let owner = activeOwnerAccountID else { entries = []; return }
        entries = storedEntries.filter { Self.normalizedOwnerID($0.ownerAccountID) == owner }
    }

    nonisolated private static func clean(_ value: String, max: Int) -> String {
        String(value.trimmingCharacters(in: .whitespacesAndNewlines).prefix(max))
    }

    nonisolated private static func normalizedOwnerID(_ value: String?) -> String? {
        guard let normalized = value?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
              !normalized.isEmpty,
              normalized.count <= 320 else { return nil }
        return normalized
    }
}
