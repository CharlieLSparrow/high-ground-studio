import Foundation

#if WEEKLY_PLAN_DECISION_HARNESS
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
private struct WeeklyPlanDecisionOutboxHarness {
    static func require(_ condition: @autoclosure () -> Bool, _ message: String) {
        guard condition() else { fatalError(message) }
    }

    @MainActor
    static func main() throws {
        let fileManager = FileManager.default
        let directory = fileManager.temporaryDirectory
            .appendingPathComponent("quipsly-weekly-plan-harness-\(UUID().uuidString)", isDirectory: true)
        defer { try? fileManager.removeItem(at: directory) }
        let ownerA = "client-a@example.test"
        let ownerB = "client-b@example.test"
        let capturedAt = Date(timeIntervalSince1970: 1_800_000_000)
        AuthManager.ownerAccountID = ownerA
        let outbox = WeeklyPlanDecisionOutbox(
            fileManager: fileManager,
            directoryURL: directory,
            initialOwnerAccountID: ownerA,
            observeAccountChanges: false
        )
        let decision = try outbox.enqueue(
            weekStartsOn: "2027-01-11",
            commitments: ["Practice once", "Write down what changed"],
            supportNeeded: "Review one example together",
            progressNotes: "The first attempt felt awkward.",
            clientReviewed: true,
            expectedUpdatedAt: "2027-01-11T18:00:00.000Z",
            capturedAt: capturedAt
        )
        require(outbox.pendingCount == 1, "A weekly plan must publish only after its protected write.")
        require(decision.projectedReceiptID == "mobile-weekly-plan-\(decision.clientRequestID)", "The receipt must derive from the durable UUID.")
        require(decision.commitments.count == 2 && decision.clientReviewed, "The ledger must retain the complete reflection intent.")

        do {
            _ = try outbox.enqueue(
                weekStartsOn: decision.weekStartsOn,
                commitments: ["Different plan"],
                supportNeeded: nil,
                progressNotes: nil,
                clientReviewed: false,
                expectedUpdatedAt: decision.expectedUpdatedAt
            )
            fatalError("One week must not accept two unresolved decisions.")
        } catch WeeklyPlanDecisionStoreError.decisionAlreadyPending {
            // Expected.
        }

        let relaunched = WeeklyPlanDecisionOutbox(
            fileManager: fileManager,
            directoryURL: directory,
            initialOwnerAccountID: ownerA,
            observeAccountChanges: false
        )
        require(relaunched.entries.first == decision, "Relaunch must preserve exact intent and retry identity.")
        relaunched.markHeld(decision.id, code: "CONFLICT", message: "Changed in Nest.", at: capturedAt)
        require(relaunched.heldCount == 1, "A conflict must remain visible and stop automatic retry.")

        relaunched.activateOwner(ownerB)
        require(relaunched.entries.isEmpty, "Another account must not see the first client's plan.")
        AuthManager.ownerAccountID = ownerB
        let other = try relaunched.enqueue(
            weekStartsOn: "2027-01-11",
            commitments: ["Independent plan"],
            supportNeeded: nil,
            progressNotes: nil,
            clientReviewed: false,
            expectedUpdatedAt: nil
        )
        require(relaunched.entries == [other], "Each account must publish only its own partition.")

        AuthManager.ownerAccountID = ownerA
        relaunched.activateOwner(ownerA)
        relaunched.markAcknowledged(decision.id)
        require(relaunched.entries.isEmpty, "An exact Nest acknowledgement must close only that decision.")
        print("WeeklyPlanDecisionOutboxHarness: PASS")
    }
}
