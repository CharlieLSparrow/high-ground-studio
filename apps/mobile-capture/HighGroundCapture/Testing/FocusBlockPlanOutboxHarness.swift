import Foundation

#if FOCUS_BLOCK_PLAN_HARNESS
enum AuthManager {
    static var ownerAccountID: String?
    static func currentStoredOwnerID() -> String? { ownerAccountID }
}

extension Notification.Name {
    static let quipslyCaptureAccountIdentityDidChange =
        Notification.Name("quipslyCaptureAccountIdentityDidChange")
}
#endif

@main
private struct FocusBlockPlanOutboxHarness {
    static func require(_ condition: @autoclosure () -> Bool, _ message: String) {
        guard condition() else { fatalError(message) }
    }

    @MainActor
    static func main() throws {
        let fileManager = FileManager.default
        let directory = fileManager.temporaryDirectory
            .appendingPathComponent("quipsly-focus-plan-harness-\(UUID().uuidString)", isDirectory: true)
        defer { try? fileManager.removeItem(at: directory) }

        let ownerA = "private-owner-a"
        let ownerB = "private-owner-b"
        let capturedAt = Date(timeIntervalSince1970: 1_800_000_000)
        AuthManager.ownerAccountID = ownerA
        let outbox = FocusBlockPlanOutbox(
            fileManager: fileManager,
            directoryURL: directory,
            initialOwnerAccountID: ownerA,
            observeAccountChanges: false
        )
        let plan = try outbox.enqueue(
            taskID: "task-1",
            startsAtLocal: "2027-01-15T09:30",
            durationMinutes: 50,
            timezone: "America/Denver",
            expectedTaskUpdatedAt: "2027-01-15T00:00:00.000Z",
            capturedAt: capturedAt
        )
        require(outbox.pendingCount == 1, "The iPhone must publish a plan only after its protected write.")
        require(plan.projectedPlanBlockID == "mobile-focus-create-\(plan.clientRequestID)", "The canonical block identity must derive from the durable request UUID.")
        require(plan.startsAtLocal == "2027-01-15T09:30" && plan.durationMinutes == 50, "The ledger must preserve exact wall-clock intent.")

        do {
            _ = try outbox.enqueue(
                taskID: "task-1",
                startsAtLocal: "2027-01-16T09:30",
                durationMinutes: 50,
                timezone: "America/Denver",
                expectedTaskUpdatedAt: plan.expectedTaskUpdatedAt
            )
            fatalError("One task must not accept two unresolved focus plans.")
        } catch FocusBlockPlanStoreError.planAlreadyPending {
            // Expected.
        }

        let relaunched = FocusBlockPlanOutbox(
            fileManager: fileManager,
            directoryURL: directory,
            initialOwnerAccountID: ownerA,
            observeAccountChanges: false
        )
        require(relaunched.entries.first == plan, "Relaunch must preserve the exact plan and retry identity.")
        relaunched.markRetryable(plan.id, message: "Connection interrupted.", at: capturedAt)
        require(relaunched.entries.first?.attemptCount == 1, "Retry evidence must survive in the ledger.")
        relaunched.markHeld(plan.id, code: "CONFLICT", message: "Task changed in Nest.", at: capturedAt)
        require(relaunched.heldCount == 1 && relaunched.pendingCount == 0, "A conflict must stop automatic retry and remain visible.")

        relaunched.activateOwner(ownerB)
        require(relaunched.entries.isEmpty, "Another account must not see the first account's focus plan.")
        AuthManager.ownerAccountID = ownerB
        let otherPlan = try relaunched.enqueue(
            taskID: "task-2",
            startsAtLocal: "2027-01-16T10:00",
            durationMinutes: 25,
            timezone: "America/Denver",
            expectedTaskUpdatedAt: "2027-01-16T00:00:00.000Z"
        )
        require(relaunched.entries == [otherPlan], "Each account must publish only its own partition.")

        AuthManager.ownerAccountID = ownerA
        relaunched.activateOwner(ownerA)
        relaunched.markAcknowledged(plan.id)
        require(relaunched.entries.isEmpty, "An exact Nest acknowledgement must close only that plan.")

        print("FocusBlockPlanOutboxHarness: PASS")
    }
}
