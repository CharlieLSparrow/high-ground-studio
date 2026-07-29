import Foundation

#if WORK_TAG_DECISION_HARNESS
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
private struct WorkTagDecisionOutboxHarness {
    static func require(
        _ condition: @autoclosure () -> Bool,
        _ message: String
    ) {
        guard condition() else { fatalError(message) }
    }

    @MainActor
    static func main() throws {
        let fileManager = FileManager.default
        let directory = fileManager.temporaryDirectory
            .appendingPathComponent("quipsly-work-tag-harness-\(UUID().uuidString)", isDirectory: true)
        defer { try? fileManager.removeItem(at: directory) }

        let ownerA = "private-owner-a"
        let ownerB = "private-owner-b"
        AuthManager.ownerAccountID = ownerA
        let capturedAt = Date(timeIntervalSince1970: 1_800_000_000)
        let outbox = WorkTagDecisionOutbox(
            fileManager: fileManager,
            directoryURL: directory,
            initialOwnerAccountID: ownerA,
            observeAccountChanges: false
        )
        let decision = try outbox.enqueue(
            entityKind: .task,
            entityID: "task-1",
            projectID: "project-1",
            tagIDs: ["tag-b", "tag-a"],
            expectedUpdatedAt: "2027-01-15T00:00:00.000Z",
            capturedAt: capturedAt
        )
        require(outbox.pendingCount == 1, "A tag decision must be visible only after its protected write.")
        require(decision.tagIDs == ["tag-a", "tag-b"], "Stable replay payloads must sort canonical tag IDs.")
        require(UUID(uuidString: decision.clientRequestID) != nil, "Every retry must retain one valid UUID identity.")

        do {
            _ = try outbox.enqueue(
                entityKind: .task,
                entityID: "task-1",
                projectID: "project-1",
                tagIDs: [],
                expectedUpdatedAt: "2027-01-15T00:00:00.000Z",
                capturedAt: capturedAt
            )
            fatalError("One entity must not accept two unresolved tag decisions.")
        } catch WorkTagDecisionStoreError.decisionAlreadyPending {
            // Expected.
        }

        let relaunched = WorkTagDecisionOutbox(
            fileManager: fileManager,
            directoryURL: directory,
            initialOwnerAccountID: ownerA,
            observeAccountChanges: false
        )
        require(relaunched.pendingCount == 1, "Relaunch must recover an unresolved protected decision.")
        require(relaunched.entries.first?.id == decision.id, "Relaunch must preserve the exact replay identity.")

        let documentDecision = try relaunched.enqueue(
            entityKind: .document,
            entityID: "document-1",
            projectID: "project-1",
            tagIDs: ["tag-a"],
            expectedUpdatedAt: "2027-01-15T00:00:00.000Z",
            expectedTagRevision: 4,
            capturedAt: capturedAt
        )
        require(documentDecision.expectedTagRevision == 4, "Document tag retries must preserve the optimistic tag revision.")
        relaunched.markAcknowledged(documentDecision.id)

        relaunched.markHeld(decision.id, code: "CONFLICT", message: "Changed in Nest.", at: capturedAt)
        require(relaunched.pendingCount == 0 && relaunched.heldCount == 1, "A permanent conflict must remain visible and stop automatic retries.")
        require(relaunched.entries.first?.lastErrorCode == "CONFLICT", "Held decisions must preserve their conflict reason.")

        relaunched.activateOwner(ownerB)
        require(relaunched.entries.isEmpty, "Another account must not see the first account's private decisions.")
        AuthManager.ownerAccountID = ownerB
        let ownerBDecision = try relaunched.enqueue(
            entityKind: .goal,
            entityID: "goal-1",
            projectID: "project-2",
            tagIDs: [],
            expectedUpdatedAt: "2027-01-16T00:00:00.000Z",
            capturedAt: capturedAt.addingTimeInterval(1)
        )
        require(relaunched.entries == [ownerBDecision], "Each account must publish only its own partition.")

        AuthManager.ownerAccountID = ownerA
        relaunched.activateOwner(ownerA)
        require(relaunched.heldCount == 1 && relaunched.entries.first?.id == decision.id, "Switching back must restore the first account's held decision.")
        relaunched.markAcknowledged(decision.id)
        require(relaunched.entries.isEmpty, "An exact Nest acknowledgement must close only that account's decision.")

        AuthManager.ownerAccountID = ownerB
        relaunched.activateOwner(ownerB)
        require(relaunched.entries.first?.id == ownerBDecision.id, "Acknowledging one account must not remove another account's decision.")

        print("WorkTagDecisionOutboxHarness: PASS")
    }
}
