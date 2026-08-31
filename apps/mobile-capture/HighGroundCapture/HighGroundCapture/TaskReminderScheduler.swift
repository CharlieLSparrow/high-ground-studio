import Combine
import CryptoKit
import Foundation
import UserNotifications

enum TaskReminderProjectionResult: Equatable {
    case scheduled
    case canceled
    case retainedPermissionNeeded
    case retainedPermissionDenied
    case expired
    case failed(message: String)
}

struct TaskReminderDraft: Equatable {
    let clientRequestID: String
    let ownerAccountID: String
    let remindAt: Date
    let capturedAt: Date
}

struct CanonicalTaskReminderAcknowledgement: Equatable {
    let id: String
    let actionItemID: String
    let remindAt: Date
    let status: String
    let deviceNotificationScheduled: Bool
}

struct CanonicalTaskReminderIntent: Equatable {
    let id: String
    let actionItemID: String
    let remindAt: Date
    let status: String
}

enum TaskReminderNotificationPermission: Equatable {
    case notDetermined
    case denied
    case authorized
}

@MainActor
protocol TaskReminderNotificationCenter: AnyObject {
    func permission() async -> TaskReminderNotificationPermission
    func requestAuthorization() async throws -> Bool
    func add(
        identifier: String,
        fireAt: Date,
        title: String,
        body: String,
        userInfo: [String: String]
    ) async throws
    func pendingIdentifiers() async -> Set<String>
    func removePending(identifiers: [String])
}

@MainActor
private final class AppleTaskReminderNotificationCenter: TaskReminderNotificationCenter {
    private let center = UNUserNotificationCenter.current()

    func permission() async -> TaskReminderNotificationPermission {
        switch await center.notificationSettings().authorizationStatus {
        case .authorized, .provisional, .ephemeral:
            return .authorized
        case .denied:
            return .denied
        case .notDetermined:
            return .notDetermined
        @unknown default:
            return .denied
        }
    }

    func requestAuthorization() async throws -> Bool {
        try await center.requestAuthorization(options: [.alert, .sound])
    }

    func add(
        identifier: String,
        fireAt: Date,
        title: String,
        body: String,
        userInfo: [String: String]
    ) async throws {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        content.threadIdentifier = "quipsly.tasks"
        content.userInfo = userInfo

        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0) ?? .current
        var components = calendar.dateComponents(
            [.year, .month, .day, .hour, .minute, .second],
            from: fireAt
        )
        components.calendar = calendar
        components.timeZone = calendar.timeZone
        let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: false)
        try await center.add(UNNotificationRequest(
            identifier: identifier,
            content: content,
            trigger: trigger
        ))
    }

    func pendingIdentifiers() async -> Set<String> {
        Set(await center.pendingNotificationRequests().map(\.identifier))
    }

    func removePending(identifiers: [String]) {
        guard !identifiers.isEmpty else { return }
        center.removePendingNotificationRequests(withIdentifiers: identifiers)
    }
}

#if DEBUG && targetEnvironment(simulator)
/// Deterministic notification boundary for the release UI suite.
///
/// The shipping app always uses `AppleTaskReminderNotificationCenter`. The UI
/// suite uses this implementation to prove the contextual save, protected
/// ledger, relaunch recovery, and account partition without depending on an
/// iOS-owned SpringBoard alert. The real authorization transition is covered by
/// `TaskReminderSchedulerHarness`, which asserts that an explicit reminder save
/// requests permission exactly once before scheduling.
@MainActor
private final class PreviewTaskReminderNotificationCenter: TaskReminderNotificationCenter {
    private var pending = Set<String>()

    func permission() async -> TaskReminderNotificationPermission { .authorized }

    func requestAuthorization() async throws -> Bool { true }

    func add(
        identifier: String,
        fireAt: Date,
        title: String,
        body: String,
        userInfo: [String: String]
    ) async throws {
        pending.insert(identifier)
    }

    func pendingIdentifiers() async -> Set<String> { pending }

    func removePending(identifiers: [String]) {
        pending.subtract(identifiers)
    }
}
#endif

private struct ProtectedTaskReminderIntent: Codable, Equatable, Identifiable {
    enum ProjectionState: String, Codable {
        case awaitingPermission
        case scheduled
        case permissionDenied
        case expired
        case schedulingFailed
        case canonicalCanceled
    }

    let id: String
    let ownerAccountID: String
    let actionItemID: String
    var remindAt: Date
    let createdAt: Date
    var state: ProjectionState
    var lastErrorMessage: String?
    var canonicalStatus: String?
    var canonicalAcknowledged: Bool?
}

private enum TaskReminderStoreResult {
    case success(ProtectedTaskReminderIntent)
    case failure(String)
}

/// Owns the device-local projection of canonical Task reminder intent.
///
/// The protected ledger is partitioned by the authenticated account. Notification
/// content is intentionally generic so a locked screen never reveals task text.
/// Nest remains authoritative for the reminder intent; this class reports only
/// local permission and scheduling state and never claims delivery.
@MainActor
final class TaskReminderScheduler: ObservableObject {
    static let shared = TaskReminderScheduler()

    @Published private(set) var activeReminderCount = 0
    @Published private(set) var scheduledReminderCount = 0
    @Published private(set) var statusMessage = "Task reminders are waiting for a verified account."
    @Published private(set) var permissionLabel = "Not checked"

    nonisolated private static let requestPrefix = "quipsly.task-reminder."
    private let fileManager: FileManager
    private let directoryURL: URL
    private let ledgerURL: URL
    private let lastKnownGoodURL: URL
    private let notificationCenter: TaskReminderNotificationCenter
    private let now: () -> Date
    private var storedIntents: [ProtectedTaskReminderIntent] = []
    private var activeOwnerAccountID: String?
    private var ledgerIsWritable = true
    private var reconciliationTask: Task<Void, Never>?

    init(
        fileManager: FileManager = .default,
        directoryURL: URL? = nil,
        notificationCenter: TaskReminderNotificationCenter? = nil,
        now: @escaping () -> Date = Date.init
    ) {
        self.fileManager = fileManager
        if let notificationCenter {
            self.notificationCenter = notificationCenter
        } else {
            #if DEBUG && targetEnvironment(simulator)
            if ProcessInfo.processInfo.arguments.contains("--capture-reminder-deterministic-ui-test") {
                self.notificationCenter = PreviewTaskReminderNotificationCenter()
            } else {
                self.notificationCenter = AppleTaskReminderNotificationCenter()
            }
            #else
            self.notificationCenter = AppleTaskReminderNotificationCenter()
            #endif
        }
        self.now = now
        let support = directoryURL
            ?? fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?
                .appendingPathComponent("QuipslyCapture/TaskReminders", isDirectory: true)
            ?? URL(fileURLWithPath: NSHomeDirectory())
                .appendingPathComponent("Library/Application Support/QuipslyCapture/TaskReminders", isDirectory: true)
        self.directoryURL = support
        ledgerURL = support.appendingPathComponent("task-reminders-v1.json")
        lastKnownGoodURL = support.appendingPathComponent("task-reminders-v1.last-known-good.json")

        do {
            try fileManager.createDirectory(at: support, withIntermediateDirectories: true)
            try? fileManager.setAttributes(
                [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
                ofItemAtPath: support.path
            )
            storedIntents = try loadLedger()
        } catch {
            ledgerIsWritable = false
            statusMessage = "The protected reminder ledger could not open. No alert was claimed as scheduled."
        }
        publish()
    }

    func activateOwner(_ ownerAccountID: String?) {
        activeOwnerAccountID = Self.normalizedOwnerID(ownerAccountID)
        publish()
        reconciliationTask?.cancel()
        reconciliationTask = Task { [weak self] in
            await self?.reconcileActiveOwner(requestPermissionIfNeeded: false)
        }
    }

    func reconcile(drafts: [TaskReminderDraft]) async {
        guard ledgerIsWritable else { return }
        for draft in drafts {
            if case let .failure(message) = storeIntent(for: draft) {
                statusMessage = message
                return
            }
        }
        await reconcileActiveOwner(requestPermissionIfNeeded: false)
    }

    func reconcileCanonical(
        intents: [CanonicalTaskReminderIntent],
        projectionComplete: Bool
    ) async {
        guard ledgerIsWritable, let owner = activeOwnerAccountID else { return }
        var updated = storedIntents
        var providedIDs = Set<String>()
        var identifiersToRemove: [String] = []

        for intent in intents {
            guard !intent.id.isEmpty,
                  intent.id.count <= 256,
                  !intent.actionItemID.isEmpty,
                  intent.actionItemID.count <= 256,
                  intent.status == "ACTIVE" || intent.status == "CANCELED" else {
                continue
            }
            providedIDs.insert(intent.id)
            if let index = updated.firstIndex(where: { $0.id == intent.id }) {
                guard updated[index].ownerAccountID == owner,
                      updated[index].actionItemID == intent.actionItemID else {
                    statusMessage = "A canonical reminder identity conflicted with protected device state. No local alert was changed."
                    continue
                }
                let timingChanged = abs(updated[index].remindAt.timeIntervalSince(intent.remindAt)) >= 0.5
                updated[index].remindAt = intent.remindAt
                updated[index].canonicalStatus = intent.status
                updated[index].canonicalAcknowledged = true
                updated[index].lastErrorMessage = nil
                if intent.status == "CANCELED" {
                    updated[index].state = .canonicalCanceled
                    identifiersToRemove.append(Self.notificationRequestID(updated[index]))
                } else if timingChanged || updated[index].state == .canonicalCanceled || updated[index].state == .expired {
                    updated[index].state = .awaitingPermission
                }
            } else {
                let protected = ProtectedTaskReminderIntent(
                    id: intent.id,
                    ownerAccountID: owner,
                    actionItemID: intent.actionItemID,
                    remindAt: intent.remindAt,
                    createdAt: now(),
                    state: intent.status == "ACTIVE" ? .awaitingPermission : .canonicalCanceled,
                    lastErrorMessage: nil,
                    canonicalStatus: intent.status,
                    canonicalAcknowledged: true
                )
                updated.append(protected)
                if intent.status == "CANCELED" {
                    identifiersToRemove.append(Self.notificationRequestID(protected))
                }
            }
        }

        if projectionComplete {
            for index in updated.indices where updated[index].ownerAccountID == owner {
                guard updated[index].canonicalAcknowledged == true,
                      !providedIDs.contains(updated[index].id) else { continue }
                updated[index].canonicalStatus = "CANCELED"
                updated[index].state = .canonicalCanceled
                updated[index].lastErrorMessage = nil
                identifiersToRemove.append(Self.notificationRequestID(updated[index]))
            }
        }

        do {
            try commit(updated)
            notificationCenter.removePending(identifiers: Array(Set(identifiersToRemove)))
            await reconcileActiveOwner(requestPermissionIfNeeded: false)
        } catch {
            statusMessage = "Canonical reminders were read, but the protected device projection could not be updated. Existing alerts were not claimed as reconciled."
        }
    }

    func register(
        draft: TaskReminderDraft,
        requestPermissionIfNeeded: Bool
    ) async -> TaskReminderProjectionResult {
        switch storeIntent(for: draft) {
        case let .failure(message):
            return .failed(message: message)
        case let .success(intent):
            return await project(intent, requestPermissionIfNeeded: requestPermissionIfNeeded)
        }
    }

    func stage(
        decision: PendingTaskReminderDecision,
        requestPermissionIfNeeded: Bool
    ) async -> TaskReminderProjectionResult {
        guard ledgerIsWritable else {
            return .failed(message: "The protected reminder ledger is unavailable. The decision remains in the phone outbox.")
        }
        guard let owner = Self.normalizedOwnerID(decision.ownerAccountID),
              owner == activeOwnerAccountID else {
            return .failed(message: "The reminder decision belongs to a different or unverified Quipsly account.")
        }

        let reminderID = decision.projectedReminderID
        var updated = storedIntents
        if let index = updated.firstIndex(where: { $0.id == reminderID }) {
            guard updated[index].ownerAccountID == owner,
                  updated[index].actionItemID == decision.taskID else {
                return .failed(message: "That reminder identity protects different task timing. The phone decision is held for review.")
            }
            updated[index].canonicalAcknowledged = false
            updated[index].lastErrorMessage = nil
            if let remindAt = decision.remindAt {
                updated[index].remindAt = remindAt
                updated[index].canonicalStatus = "ACTIVE"
                updated[index].state = .awaitingPermission
            } else {
                updated[index].canonicalStatus = "CANCELED"
                updated[index].state = .canonicalCanceled
            }
        } else {
            guard let remindAt = decision.remindAt else {
                return .failed(message: "Refresh Today before canceling a reminder that is not protected on \(CaptureDeviceVocabulary.thisDevice).")
            }
            updated.append(ProtectedTaskReminderIntent(
                id: reminderID,
                ownerAccountID: owner,
                actionItemID: decision.taskID,
                remindAt: remindAt,
                createdAt: decision.capturedAt,
                state: .awaitingPermission,
                lastErrorMessage: nil,
                canonicalStatus: "ACTIVE",
                canonicalAcknowledged: false
            ))
        }

        do {
            try commit(updated)
        } catch {
            return .failed(message: "The reminder decision could not be projected safely: \(error.localizedDescription)")
        }

        guard decision.remindAt != nil,
              let intent = storedIntents.first(where: { $0.id == reminderID }) else {
            notificationCenter.removePending(identifiers: updated
                .filter { $0.id == reminderID }
                .map(Self.notificationRequestID))
            statusMessage = "Reminder alert removed from \(CaptureDeviceVocabulary.thisDevice). Nest cancellation is still pending."
            return .canceled
        }
        return await project(intent, requestPermissionIfNeeded: requestPermissionIfNeeded)
    }

    func confirmCanonical(
        _ reminder: CanonicalTaskReminderAcknowledgement?,
        for draft: TaskReminderDraft
    ) -> Bool {
        guard let reminder,
              reminder.id == Self.reminderID(for: draft),
              reminder.actionItemID == Self.actionItemID(for: draft),
              reminder.status == "ACTIVE",
              reminder.deviceNotificationScheduled == false,
              abs(reminder.remindAt.timeIntervalSince(draft.remindAt)) < 0.5 else {
            return false
        }
        guard let index = storedIntents.firstIndex(where: { $0.id == reminder.id }) else {
            return false
        }
        var updated = storedIntents
        updated[index].canonicalStatus = "ACTIVE"
        updated[index].canonicalAcknowledged = true
        do {
            try commit(updated)
            return true
        } catch {
            statusMessage = "Nest acknowledged the reminder, but the protected device ledger could not record that acknowledgement. The outbox remains for safe retry."
            return false
        }
    }

    private func storeIntent(
        for draft: TaskReminderDraft
    ) -> TaskReminderStoreResult {
        guard ledgerIsWritable else {
            return .failure("The protected reminder ledger is unavailable. The task remains in the phone outbox and no alert was claimed as scheduled.")
        }
        guard let owner = Self.normalizedOwnerID(draft.ownerAccountID),
              owner == activeOwnerAccountID else {
            return .failure("The reminder belongs to a different or unverified Quipsly account. The task remains protected and no alert was scheduled.")
        }

        let id = Self.reminderID(for: draft)
        let actionItemID = Self.actionItemID(for: draft)
        if let existing = storedIntents.first(where: { $0.id == id }) {
            guard existing.ownerAccountID == owner,
                  existing.actionItemID == actionItemID,
                  abs(existing.remindAt.timeIntervalSince(draft.remindAt)) < 0.5 else {
                return .failure("That reminder identity already protects different task timing. The phone copy is held for review.")
            }
            return .success(existing)
        }

        let intent = ProtectedTaskReminderIntent(
            id: id,
            ownerAccountID: owner,
            actionItemID: actionItemID,
            remindAt: draft.remindAt,
            createdAt: draft.capturedAt,
            state: .awaitingPermission,
            lastErrorMessage: nil,
            canonicalStatus: "ACTIVE",
            canonicalAcknowledged: false
        )
        var updated = storedIntents
        updated.append(intent)
        do {
            try commit(updated)
            return .success(intent)
        } catch {
            return .failure("The reminder could not be protected on \(CaptureDeviceVocabulary.thisDevice): \(error.localizedDescription). The task remains in the outbox.")
        }
    }

    private func reconcileActiveOwner(requestPermissionIfNeeded: Bool) async {
        let pending = await notificationCenter.pendingIdentifiers()
        let activeIntents = visibleIntents
        let desiredIdentifiers = Set(activeIntents.map(Self.notificationRequestID))
        let staleQuipslyIdentifiers = pending.filter {
            $0.hasPrefix(Self.requestPrefix) && !desiredIdentifiers.contains($0)
        }
        notificationCenter.removePending(identifiers: Array(staleQuipslyIdentifiers))

        guard activeOwnerAccountID != nil else {
            permissionLabel = "Signed out"
            statusMessage = "Signed out. Quipsly removed pending task alerts from this device."
            publish()
            return
        }

        for intent in activeIntents {
            if Task.isCancelled { return }
            _ = await project(intent, requestPermissionIfNeeded: requestPermissionIfNeeded)
        }
        publish()
    }

    private func project(
        _ intent: ProtectedTaskReminderIntent,
        requestPermissionIfNeeded: Bool
    ) async -> TaskReminderProjectionResult {
        guard intent.ownerAccountID == activeOwnerAccountID else {
            return .failed(message: "The reminder account changed before scheduling. No alert was scheduled.")
        }
        let requestID = Self.notificationRequestID(intent)
        guard intent.remindAt > now() else {
            notificationCenter.removePending(identifiers: [requestID])
            update(intent.id, state: .expired, error: nil)
            statusMessage = "The reminder time has passed. The canonical task remains in Quipsly."
            return .expired
        }

        var permission = await notificationCenter.permission()
        if permission == .notDetermined, requestPermissionIfNeeded {
            do {
                _ = try await notificationCenter.requestAuthorization()
                permission = await notificationCenter.permission()
            } catch {
                update(intent.id, state: .schedulingFailed, error: error.localizedDescription)
                statusMessage = "Notification permission could not be checked. The reminder intent remains protected for retry."
                return .failed(message: statusMessage)
            }
        }

        switch permission {
        case .notDetermined:
            permissionLabel = "Not requested"
            update(intent.id, state: .awaitingPermission, error: nil)
            statusMessage = "Reminder intent is protected. Quipsly will ask for notification permission when you explicitly save a reminder."
            return .retainedPermissionNeeded
        case .denied:
            permissionLabel = "Disabled in Settings"
            notificationCenter.removePending(identifiers: [requestID])
            update(intent.id, state: .permissionDenied, error: nil)
            statusMessage = "Reminder intent is saved, but notifications are off for Quipsly. No alert was claimed as scheduled."
            return .retainedPermissionDenied
        case .authorized:
            permissionLabel = "Allowed"
        }

        do {
            try await notificationCenter.add(
                identifier: requestID,
                fireAt: intent.remindAt,
                title: "Quipsly reminder",
                body: "You have a task ready for follow-through.",
                userInfo: [
                    "schema": "quipsly-task-reminder-projection-v1",
                    "reminderId": intent.id,
                    "actionItemId": intent.actionItemID,
                ]
            )
            update(intent.id, state: .scheduled, error: nil)
            statusMessage = "Private task alert scheduled on \(CaptureDeviceVocabulary.thisDevice). Delivery is controlled by iOS and is never claimed in advance."
            return .scheduled
        } catch {
            update(intent.id, state: .schedulingFailed, error: error.localizedDescription)
            statusMessage = "The reminder intent remains protected, but iOS did not accept the alert: \(error.localizedDescription)"
            return .failed(message: statusMessage)
        }
    }

    private var visibleIntents: [ProtectedTaskReminderIntent] {
        guard let activeOwnerAccountID else { return [] }
        return storedIntents
            .filter {
                $0.ownerAccountID == activeOwnerAccountID
                    && $0.canonicalStatus != "CANCELED"
                    && $0.state != .canonicalCanceled
            }
            .sorted { $0.remindAt < $1.remindAt }
    }

    private func update(
        _ id: String,
        state: ProtectedTaskReminderIntent.ProjectionState,
        error: String?
    ) {
        guard let index = storedIntents.firstIndex(where: { $0.id == id }) else { return }
        if storedIntents[index].state == state,
           storedIntents[index].lastErrorMessage == error {
            publish()
            return
        }
        var updated = storedIntents
        updated[index].state = state
        updated[index].lastErrorMessage = error
        do {
            try commit(updated)
        } catch {
            statusMessage = "The reminder state could not be protected: \(error.localizedDescription)"
        }
    }

    private func publish() {
        let visible = visibleIntents
        activeReminderCount = visible.filter { $0.state != .expired }.count
        scheduledReminderCount = visible.filter { $0.state == .scheduled }.count
    }

    private func commit(_ updated: [ProtectedTaskReminderIntent]) throws {
        guard ledgerIsWritable else {
            throw CocoaError(.fileWriteUnknown)
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
            storedIntents = updated
            publish()
        } catch {
            ledgerIsWritable = false
            throw error
        }
    }

    private func loadLedger() throws -> [ProtectedTaskReminderIntent] {
        if fileManager.fileExists(atPath: ledgerURL.path) {
            do {
                return try decode(ledgerURL)
            } catch {
                ledgerIsWritable = false
                if fileManager.fileExists(atPath: lastKnownGoodURL.path),
                   let recovered = try? decode(lastKnownGoodURL) {
                    statusMessage = "The reminder ledger is locked read-only; a last-known-good copy remains visible."
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

    private func decode(_ url: URL) throws -> [ProtectedTaskReminderIntent] {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode([ProtectedTaskReminderIntent].self, from: Data(contentsOf: url))
    }

    nonisolated private static func reminderID(for draft: TaskReminderDraft) -> String {
        "mobile-task-reminder-\(draft.clientRequestID)"
    }

    nonisolated private static func actionItemID(for draft: TaskReminderDraft) -> String {
        "mobile-task-\(draft.clientRequestID)"
    }

    nonisolated private static func notificationRequestID(_ intent: ProtectedTaskReminderIntent) -> String {
        let ownerDigest = SHA256.hash(data: Data(intent.ownerAccountID.utf8))
            .prefix(8)
            .map { String(format: "%02x", $0) }
            .joined()
        return "\(requestPrefix)\(ownerDigest).\(intent.id)"
    }

    nonisolated private static func normalizedOwnerID(_ value: String?) -> String? {
        guard let normalized = value?.trimmingCharacters(in: .whitespacesAndNewlines),
              !normalized.isEmpty,
              normalized.count <= 256 else { return nil }
        return normalized
    }

}
