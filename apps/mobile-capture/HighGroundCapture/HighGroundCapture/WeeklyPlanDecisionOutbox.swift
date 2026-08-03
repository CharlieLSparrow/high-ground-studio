import Combine
import Foundation

struct PendingWeeklyPlanDecision: Codable, Equatable, Identifiable {
    enum Disposition: String, Codable {
        case pending
        case held
    }

    let id: UUID
    let ownerAccountID: String
    let weekStartsOn: String
    let commitments: [String]
    let supportNeeded: String?
    let progressNotes: String?
    let clientReviewed: Bool
    let expectedUpdatedAt: String?
    let capturedAt: Date
    var disposition: Disposition
    var attemptCount: Int
    var lastAttemptAt: Date?
    var lastErrorCode: String?
    var lastErrorMessage: String?

    var clientRequestID: String { id.uuidString.lowercased() }
    var projectedReceiptID: String { "mobile-weekly-plan-\(clientRequestID)" }
}

enum WeeklyPlanDecisionStoreError: LocalizedError {
    case accountIdentityUnavailable
    case invalidDecision
    case decisionAlreadyPending
    case ledgerUnavailable

    var errorDescription: String? {
        switch self {
        case .accountIdentityUnavailable:
            "Verify the current Quipsly account before changing a private weekly plan."
        case .invalidDecision:
            "Add at least one concrete commitment and keep this weekly reflection within its limits."
        case .decisionAlreadyPending:
            "This week already has a protected change waiting for Nest."
        case .ledgerUnavailable:
            "The protected weekly-plan outbox is unavailable. Nothing was claimed as saved."
        }
    }
}

/// File-protected, account-partitioned weekly plan and reflection decisions.
///
/// Capture persists the complete desired snapshot before network delivery. The
/// stable request UUID binds ambiguous retries to one Nest receipt; optimistic
/// revision conflicts stop automatic replay for explicit human review.
@MainActor
final class WeeklyPlanDecisionOutbox: ObservableObject {
    static let shared = WeeklyPlanDecisionOutbox()

    @Published private(set) var entries: [PendingWeeklyPlanDecision] = []
    @Published private(set) var persistenceError: String?

    private let fileManager: FileManager
    private let ledgerURL: URL
    private let lastKnownGoodURL: URL
    private var storedEntries: [PendingWeeklyPlanDecision] = []
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
                .appendingPathComponent("QuipslyCapture/WeeklyPlanDecisionOutbox", isDirectory: true)
            ?? URL(fileURLWithPath: NSHomeDirectory())
                .appendingPathComponent("Library/Application Support/QuipslyCapture/WeeklyPlanDecisionOutbox", isDirectory: true)
        ledgerURL = support.appendingPathComponent("weekly-plan-decisions-v1.json")
        lastKnownGoodURL = support.appendingPathComponent("weekly-plan-decisions-v1.last-known-good.json")

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
            persistenceError = "The protected weekly-plan outbox could not open: \(error.localizedDescription)"
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

    func decision(forWeekStarting weekStartsOn: String) -> PendingWeeklyPlanDecision? {
        entries.first { $0.weekStartsOn == weekStartsOn }
    }

    @discardableResult
    func enqueue(
        weekStartsOn: String,
        commitments: [String],
        supportNeeded: String?,
        progressNotes: String?,
        clientReviewed: Bool,
        expectedUpdatedAt: String?,
        capturedAt: Date = Date()
    ) throws -> PendingWeeklyPlanDecision {
        guard ledgerIsWritable else { throw WeeklyPlanDecisionStoreError.ledgerUnavailable }
        guard let owner = Self.normalizedOwnerID(activeOwnerAccountID),
              owner == Self.normalizedOwnerID(AuthManager.currentStoredOwnerID()) else {
            throw WeeklyPlanDecisionStoreError.accountIdentityUnavailable
        }
        let weekStartsOn = Self.cleanWeek(weekStartsOn)
        let commitments = commitments.map { Self.clean($0, max: 1_000) }
        let supportNeeded = Self.optionalClean(supportNeeded, max: 3_000)
        let progressNotes = Self.optionalClean(progressNotes, max: 5_000)
        let expectedUpdatedAt = Self.optionalClean(expectedUpdatedAt, max: 80)
        guard !weekStartsOn.isEmpty,
              (1...3).contains(commitments.count),
              commitments.allSatisfy({ !$0.isEmpty }),
              decision(forWeekStarting: weekStartsOn) == nil else {
            if decision(forWeekStarting: weekStartsOn) != nil {
                throw WeeklyPlanDecisionStoreError.decisionAlreadyPending
            }
            throw WeeklyPlanDecisionStoreError.invalidDecision
        }

        let entry = PendingWeeklyPlanDecision(
            id: UUID(),
            ownerAccountID: owner,
            weekStartsOn: weekStartsOn,
            commitments: commitments,
            supportNeeded: supportNeeded,
            progressNotes: progressNotes,
            clientReviewed: clientReviewed,
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

    private func update(_ id: UUID, change: (inout PendingWeeklyPlanDecision) -> Void) {
        guard entries.contains(where: { $0.id == id }),
              let index = storedEntries.firstIndex(where: { $0.id == id }) else { return }
        var updated = storedEntries
        change(&updated[index])
        commitBestEffort(updated)
    }

    private func commitBestEffort(_ updated: [PendingWeeklyPlanDecision]) {
        do { try commit(updated) }
        catch { persistenceError = "The protected weekly-plan outbox could not save: \(error.localizedDescription)" }
    }

    private func commit(_ updated: [PendingWeeklyPlanDecision]) throws {
        guard ledgerIsWritable else { throw WeeklyPlanDecisionStoreError.ledgerUnavailable }
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

    private func loadLedger() throws -> [PendingWeeklyPlanDecision] {
        if fileManager.fileExists(atPath: ledgerURL.path) {
            do { return try decode(ledgerURL) }
            catch {
                ledgerIsWritable = false
                if fileManager.fileExists(atPath: lastKnownGoodURL.path),
                   let recovered = try? decode(lastKnownGoodURL) {
                    persistenceError = "The weekly-plan ledger is unreadable and locked read-only. A last-known-good copy remains visible."
                    return recovered
                }
                throw error
            }
        }
        if fileManager.fileExists(atPath: lastKnownGoodURL.path),
           let recovered = try? decode(lastKnownGoodURL) { return recovered }
        return []
    }

    private func decode(_ url: URL) throws -> [PendingWeeklyPlanDecision] {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode([PendingWeeklyPlanDecision].self, from: Data(contentsOf: url))
    }

    private func publish() {
        storedEntries.sort { $0.capturedAt < $1.capturedAt }
        guard let owner = activeOwnerAccountID else { entries = []; return }
        entries = storedEntries.filter { Self.normalizedOwnerID($0.ownerAccountID) == owner }
    }

    nonisolated private static func clean(_ value: String, max: Int) -> String {
        String(value.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ").prefix(max))
    }

    nonisolated private static func optionalClean(_ value: String?, max: Int) -> String? {
        guard let value else { return nil }
        let cleaned = clean(value, max: max)
        return cleaned.isEmpty ? nil : cleaned
    }

    nonisolated private static func cleanWeek(_ value: String) -> String {
        let cleaned = String(value.trimmingCharacters(in: .whitespacesAndNewlines).prefix(10))
        guard cleaned.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil else { return "" }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        formatter.calendar = calendar
        formatter.timeZone = calendar.timeZone
        formatter.dateFormat = "yyyy-MM-dd"
        guard let date = formatter.date(from: cleaned),
              formatter.string(from: date) == cleaned,
              calendar.component(.weekday, from: date) == 2 else { return "" }
        return cleaned
    }

    nonisolated private static func normalizedOwnerID(_ value: String?) -> String? {
        guard let normalized = value?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
              !normalized.isEmpty,
              normalized.count <= 320 else { return nil }
        return normalized
    }
}
