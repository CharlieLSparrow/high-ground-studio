import Foundation

#if FOCUS_BLOCK_DECISION_HARNESS
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
private struct FocusBlockDecisionOutboxHarness {
    static func require(_ condition: @autoclosure () -> Bool, _ message: String) {
        guard condition() else { fatalError(message) }
    }

    @MainActor
    static func main() throws {
        let fileManager = FileManager.default
        let directory = fileManager.temporaryDirectory
            .appendingPathComponent("quipsly-focus-decision-harness-\(UUID().uuidString)", isDirectory: true)
        defer { try? fileManager.removeItem(at: directory) }

        let ownerA = "private-owner-a"
        let ownerB = "private-owner-b"
        let capturedAt = Date(timeIntervalSince1970: 1_800_000_000)
        AuthManager.ownerAccountID = ownerA
        let outbox = FocusBlockDecisionOutbox(
            fileManager: fileManager,
            directoryURL: directory,
            initialOwnerAccountID: ownerA,
            observeAccountChanges: false
        )
        let decision = try outbox.enqueue(
            blockID: "focus-1",
            nextStatus: "completed",
            actualMinutes: 37,
            expectedUpdatedAt: "2027-01-15T00:00:00.000Z",
            capturedAt: capturedAt
        )
        require(outbox.pendingCount == 1, "The phone must publish a decision only after its protected write.")
        require(decision.nextStatus == "COMPLETED" && decision.actualMinutes == 37, "The ledger must preserve explicit actual time and normalized status.")
        require(UUID(uuidString: decision.clientRequestID) != nil, "Every retry must retain one valid UUID identity.")

        do {
            _ = try outbox.enqueue(
                blockID: "focus-1",
                nextStatus: "COMPLETED",
                actualMinutes: 40,
                expectedUpdatedAt: decision.expectedUpdatedAt,
                capturedAt: capturedAt
            )
            fatalError("One block must not accept two unresolved decisions.")
        } catch FocusBlockDecisionStoreError.decisionAlreadyPending {
            // Expected.
        }

        for invalid in [0, 1_441] {
            do {
                _ = try outbox.enqueue(
                    blockID: "invalid-\(invalid)",
                    nextStatus: "COMPLETED",
                    actualMinutes: invalid,
                    expectedUpdatedAt: decision.expectedUpdatedAt,
                    capturedAt: capturedAt
                )
                fatalError("Invalid actual time must never enter the protected ledger.")
            } catch FocusBlockDecisionStoreError.invalidDecision {
                // Expected.
            }
        }

        let relaunched = FocusBlockDecisionOutbox(
            fileManager: fileManager,
            directoryURL: directory,
            initialOwnerAccountID: ownerA,
            observeAccountChanges: false
        )
        require(relaunched.entries.first?.id == decision.id, "Relaunch must preserve the exact replay identity.")
        require(relaunched.entries.first?.actualMinutes == 37, "Relaunch must preserve the exact actual-time claim.")

        relaunched.markRetryable(decision.id, message: "Connection interrupted.", at: capturedAt)
        require(relaunched.entries.first?.attemptCount == 1, "Retry evidence must survive in the ledger.")
        relaunched.markHeld(decision.id, code: "CONFLICT", message: "Changed in Nest.", at: capturedAt)
        require(relaunched.heldCount == 1 && relaunched.pendingCount == 0, "A conflict must stop automatic retry and remain visible.")
        relaunched.releaseForRetry(decision.id)
        require(relaunched.pendingCount == 1 && relaunched.heldCount == 0, "Explicit retry must preserve the same decision identity.")

        relaunched.activateOwner(ownerB)
        require(relaunched.entries.isEmpty, "Another account must not see the first account's focus decision.")
        AuthManager.ownerAccountID = ownerB
        let ownerBDecision = try relaunched.enqueue(
            blockID: "focus-2",
            nextStatus: "SKIPPED",
            actualMinutes: nil,
            expectedUpdatedAt: "2027-01-16T00:00:00.000Z",
            capturedAt: capturedAt.addingTimeInterval(1)
        )
        require(relaunched.entries == [ownerBDecision], "Each account must publish only its own partition.")

        AuthManager.ownerAccountID = ownerA
        relaunched.activateOwner(ownerA)
        require(relaunched.entries.first?.id == decision.id, "Switching back must restore the first account's exact decision.")
        relaunched.markAcknowledged(decision.id)
        require(relaunched.entries.isEmpty, "An exact Nest acknowledgement must close only that operation.")

        AuthManager.ownerAccountID = ownerB
        relaunched.activateOwner(ownerB)
        require(relaunched.entries.first?.id == ownerBDecision.id, "Acknowledging one account must not remove another account's decision.")

        print("FocusBlockDecisionOutboxHarness: PASS")
    }
}
