import Foundation

@MainActor
private final class MockReminderNotificationCenter: TaskReminderNotificationCenter {
    struct Added: Equatable {
        let identifier: String
        let fireAt: Date
        let title: String
        let body: String
        let userInfo: [String: String]
    }

    var currentPermission: TaskReminderNotificationPermission
    var requestCount = 0
    var added: [Added] = []
    var pending = Set<String>()
    var removed: [String] = []

    init(permission: TaskReminderNotificationPermission) {
        currentPermission = permission
    }

    func permission() async -> TaskReminderNotificationPermission {
        currentPermission
    }

    func requestAuthorization() async throws -> Bool {
        requestCount += 1
        currentPermission = .authorized
        return true
    }

    func add(
        identifier: String,
        fireAt: Date,
        title: String,
        body: String,
        userInfo: [String: String]
    ) async throws {
        added.append(Added(
            identifier: identifier,
            fireAt: fireAt,
            title: title,
            body: body,
            userInfo: userInfo
        ))
        pending.insert(identifier)
    }

    func pendingIdentifiers() async -> Set<String> {
        pending
    }

    func removePending(identifiers: [String]) {
        removed.append(contentsOf: identifiers)
        pending.subtract(identifiers)
    }
}

@main
private struct TaskReminderSchedulerHarness {
    static func require(
        _ condition: @autoclosure () -> Bool,
        _ message: String
    ) {
        guard condition() else {
            fatalError(message)
        }
    }

    @MainActor
    static func main() async throws {
        let fileManager = FileManager.default
        let directory = fileManager.temporaryDirectory
            .appendingPathComponent("quipsly-reminder-harness-\(UUID().uuidString)", isDirectory: true)
        defer { try? fileManager.removeItem(at: directory) }

        let capturedAt = Date(timeIntervalSince1970: 1_800_000_000)
        let remindAt = capturedAt.addingTimeInterval(3_600)
        let draft = TaskReminderDraft(
            clientRequestID: "018f4f2a-7b61-7d3c-8a55-90d799e0d5f4",
            ownerAccountID: "private-owner-a",
            remindAt: remindAt,
            capturedAt: capturedAt
        )
        let center = MockReminderNotificationCenter(permission: .notDetermined)
        let scheduler = TaskReminderScheduler(
            fileManager: fileManager,
            directoryURL: directory,
            notificationCenter: center,
            now: { capturedAt }
        )
        scheduler.activateOwner(draft.ownerAccountID)
        let first = await scheduler.register(
            draft: draft,
            requestPermissionIfNeeded: true
        )
        require(first == .scheduled, "Explicit save should schedule after contextual permission.")
        require(center.requestCount == 1, "Permission should be requested exactly once.")
        require(center.added.count == 1, "One notification request should be added.")
        require(scheduler.activeReminderCount == 1, "The protected owner partition should expose one intent.")
        require(scheduler.scheduledReminderCount == 1, "The local projection should report one scheduled request.")

        let request = center.added[0]
        require(!request.identifier.contains(draft.ownerAccountID), "Notification identifiers must not reveal account identity.")
        require(request.title == "Quipsly reminder", "Lock-screen title should remain generic.")
        require(request.body == "You have a task ready for follow-through.", "Lock-screen body should not reveal task text.")
        require(request.userInfo["reminderId"] == "mobile-task-reminder-\(draft.clientRequestID)", "The private payload should preserve canonical identity.")

        let retry = await scheduler.register(
            draft: draft,
            requestPermissionIfNeeded: false
        )
        require(retry == .scheduled, "An exact offline retry should reconcile the same reminder.")
        require(Set(center.added.map(\.identifier)).count == 1, "Offline retry must reuse one notification identifier.")

        let exactAcknowledgement = CanonicalTaskReminderAcknowledgement(
            id: "mobile-task-reminder-\(draft.clientRequestID)",
            actionItemID: "mobile-task-\(draft.clientRequestID)",
            remindAt: remindAt,
            status: "ACTIVE",
            deviceNotificationScheduled: false
        )
        require(scheduler.confirmCanonical(exactAcknowledgement, for: draft), "Exact canonical readback should close the outbox boundary.")
        require(!scheduler.confirmCanonical(
            CanonicalTaskReminderAcknowledgement(
                id: exactAcknowledgement.id,
                actionItemID: exactAcknowledgement.actionItemID,
                remindAt: remindAt.addingTimeInterval(60),
                status: "ACTIVE",
                deviceNotificationScheduled: false
            ),
            for: draft
        ), "Changed canonical timing must be held as an identity conflict.")
        require(!scheduler.confirmCanonical(
            CanonicalTaskReminderAcknowledgement(
                id: exactAcknowledgement.id,
                actionItemID: exactAcknowledgement.actionItemID,
                remindAt: remindAt,
                status: "ACTIVE",
                deviceNotificationScheduled: true
            ),
            for: draft
        ), "Nest must never claim that the device scheduled a notification.")

        let deniedCenter = MockReminderNotificationCenter(permission: .denied)
        let deniedDirectory = directory.appendingPathComponent("denied", isDirectory: true)
        let deniedScheduler = TaskReminderScheduler(
            fileManager: fileManager,
            directoryURL: deniedDirectory,
            notificationCenter: deniedCenter,
            now: { capturedAt }
        )
        deniedScheduler.activateOwner(draft.ownerAccountID)
        let denied = await deniedScheduler.register(
            draft: draft,
            requestPermissionIfNeeded: true
        )
        require(denied == .retainedPermissionDenied, "Denied permission should retain intent without claiming an alert.")
        require(deniedCenter.added.isEmpty, "Denied permission must not enqueue a notification.")
        require(deniedScheduler.activeReminderCount == 1, "Denied permission must not discard canonical intent.")

        scheduler.activateOwner("private-owner-b")
        await scheduler.reconcile(drafts: [])
        require(center.pending.isEmpty, "Switching accounts should remove the prior owner's pending alerts.")
        require(scheduler.activeReminderCount == 0, "The new account must not see the prior owner's reminder ledger.")

        let relaunchCenter = MockReminderNotificationCenter(permission: .authorized)
        let relaunched = TaskReminderScheduler(
            fileManager: fileManager,
            directoryURL: directory,
            notificationCenter: relaunchCenter,
            now: { capturedAt }
        )
        relaunched.activateOwner(draft.ownerAccountID)
        await relaunched.reconcile(drafts: [draft])
        require(relaunched.activeReminderCount == 1, "Relaunch should recover the protected reminder intent.")
        require(relaunchCenter.added.count == 1, "Relaunch should restore a missing authorized notification request.")

        let movedAt = remindAt.addingTimeInterval(7_200)
        await relaunched.reconcileCanonical(
            intents: [CanonicalTaskReminderIntent(
                id: exactAcknowledgement.id,
                actionItemID: exactAcknowledgement.actionItemID,
                remindAt: movedAt,
                status: "ACTIVE"
            )],
            projectionComplete: true
        )
        require(relaunchCenter.added.last?.fireAt == movedAt, "A canonical Nest reschedule should replace the local fire time.")
        require(relaunched.activeReminderCount == 1, "A reschedule should preserve one canonical reminder intent.")

        await relaunched.reconcileCanonical(
            intents: [CanonicalTaskReminderIntent(
                id: exactAcknowledgement.id,
                actionItemID: exactAcknowledgement.actionItemID,
                remindAt: movedAt,
                status: "CANCELED"
            )],
            projectionComplete: true
        )
        require(relaunchCenter.pending.isEmpty, "A canonical Nest cancellation should remove the local alert.")
        require(relaunched.activeReminderCount == 0, "A canceled canonical reminder should leave the active projection.")

        await deniedScheduler.reconcileCanonical(intents: [], projectionComplete: true)
        require(deniedScheduler.activeReminderCount == 1, "A complete server list must not discard an unacknowledged offline outbox reminder.")

        let webDirectory = directory.appendingPathComponent("web-created", isDirectory: true)
        let webCenter = MockReminderNotificationCenter(permission: .authorized)
        let webScheduler = TaskReminderScheduler(
            fileManager: fileManager,
            directoryURL: webDirectory,
            notificationCenter: webCenter,
            now: { capturedAt }
        )
        webScheduler.activateOwner(draft.ownerAccountID)
        await webScheduler.reconcileCanonical(
            intents: [CanonicalTaskReminderIntent(
                id: "task-reminder-created-in-nest",
                actionItemID: "task-created-in-nest",
                remindAt: movedAt,
                status: "ACTIVE"
            )],
            projectionComplete: true
        )
        require(webCenter.added.last?.fireAt == movedAt, "A reminder created in Nest should project onto an authorized signed-in iPhone.")
        await webScheduler.reconcileCanonical(intents: [], projectionComplete: true)
        require(webCenter.pending.isEmpty, "An acknowledged reminder missing from a complete canonical list should be removed.")
        require(webScheduler.activeReminderCount == 0, "A complete canonical deletion boundary should not leave a stale active alert.")

        print("TaskReminderSchedulerHarness: PASS")
    }
}
