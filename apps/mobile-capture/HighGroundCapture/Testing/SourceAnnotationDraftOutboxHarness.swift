import Foundation

#if SOURCE_ANNOTATION_DRAFT_HARNESS
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
private struct SourceAnnotationDraftOutboxHarness {
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
            .appendingPathComponent(
                "quipsly-source-draft-harness-\(UUID().uuidString)",
                isDirectory: true
            )
        defer { try? fileManager.removeItem(at: directory) }

        let ownerA = "private-owner-a"
        let ownerB = "private-owner-b"
        let capturedAt = Date(timeIntervalSince1970: 1_800_000_000)
        AuthManager.ownerAccountID = ownerA
        let outbox = SourceAnnotationDraftOutbox(
            fileManager: fileManager,
            directoryURL: directory,
            initialOwnerAccountID: ownerA,
            observeAccountChanges: false
        )
        let decision = try outbox.enqueue(
            annotationID: "annotation-1",
            projectSlug: "high-ground",
            sourceTitle: "Production philosophy",
            expectedAnnotationUpdatedAt: "2027-01-15T00:00:02.123Z",
            capturedAt: capturedAt
        )

        require(outbox.pendingCount == 1, "A writing handoff must appear only after its protected write.")
        require(UUID(uuidString: decision.clientRequestID) != nil, "Every retry must retain one valid UUID identity.")
        require(decision.annotationID == "annotation-1", "The exact annotation identity must be durable.")
        require(decision.projectSlug == "high-ground", "The exact Nest identity must be durable.")
        require(decision.expectedAnnotationUpdatedAt == "2027-01-15T00:00:02.123Z", "The optimistic source-note revision must be durable.")

        do {
            _ = try outbox.enqueue(
                annotationID: "annotation-1",
                projectSlug: "high-ground",
                sourceTitle: "Production philosophy",
                expectedAnnotationUpdatedAt: "2027-01-15T00:00:02.123Z",
                capturedAt: capturedAt
            )
            fatalError("One annotation must not accept two unresolved writing handoffs.")
        } catch SourceAnnotationDraftDecisionStoreError.decisionAlreadyPending {
            // Expected.
        }

        let relaunched = SourceAnnotationDraftOutbox(
            fileManager: fileManager,
            directoryURL: directory,
            initialOwnerAccountID: ownerA,
            observeAccountChanges: false
        )
        require(relaunched.pendingCount == 1, "Relaunch must recover the protected writing handoff.")
        require(relaunched.entries.first?.id == decision.id, "Relaunch must preserve the exact replay UUID.")

        relaunched.markHeld(
            decision.id,
            code: "CONFLICT",
            message: "The annotation changed.",
            at: capturedAt
        )
        require(relaunched.pendingCount == 0 && relaunched.heldCount == 1, "A permanent mismatch must stop automatic retries.")
        require(relaunched.entries.first?.lastErrorCode == "CONFLICT", "Held decisions must preserve their conflict reason.")

        relaunched.releaseForRetry(decision.id)
        require(relaunched.pendingCount == 1 && relaunched.heldCount == 0, "A deliberate retry must preserve the same identity.")
        require(relaunched.entries.first?.id == decision.id, "Retry must not mint a second request identity.")

        relaunched.activateOwner(ownerB)
        require(relaunched.entries.isEmpty, "Another account must not see the first account's writing decisions.")
        AuthManager.ownerAccountID = ownerB
        let ownerBDecision = try relaunched.enqueue(
            annotationID: "annotation-2",
            projectSlug: "coaching",
            sourceTitle: "Coaching source",
            expectedAnnotationUpdatedAt: "2027-01-16T00:00:00Z",
            capturedAt: capturedAt.addingTimeInterval(1)
        )
        require(relaunched.entries == [ownerBDecision], "Each account must publish only its own partition.")

        AuthManager.ownerAccountID = ownerA
        relaunched.activateOwner(ownerA)
        require(relaunched.entries.first?.id == decision.id, "Switching back must restore the original protected decision.")
        relaunched.markAcknowledged(decision.id)
        require(relaunched.entries.isEmpty, "Exact Nest acknowledgement must close only that decision.")

        AuthManager.ownerAccountID = ownerB
        relaunched.activateOwner(ownerB)
        require(relaunched.entries.first?.id == ownerBDecision.id, "Acknowledging one account must not remove another account's decision.")

        do {
            _ = try relaunched.enqueue(
                annotationID: "",
                projectSlug: "coaching",
                sourceTitle: "Invalid",
                expectedAnnotationUpdatedAt: "not-a-date",
                capturedAt: capturedAt
            )
            fatalError("Invalid source identity or revision must fail closed.")
        } catch SourceAnnotationDraftDecisionStoreError.invalidDecision {
            // Expected.
        }

        let ledgerURL = directory.appendingPathComponent(
            "source-annotation-drafts-v1.json"
        )
        try Data("{broken".utf8).write(to: ledgerURL, options: .atomic)
        let recoveredReadOnly = SourceAnnotationDraftOutbox(
            fileManager: fileManager,
            directoryURL: directory,
            initialOwnerAccountID: ownerB,
            observeAccountChanges: false
        )
        require(
            recoveredReadOnly.entries.first?.id == ownerBDecision.id,
            "A corrupt primary ledger must recover the last-known-good account partition."
        )
        require(
            recoveredReadOnly.persistenceError != nil,
            "A corrupt primary ledger must remain visibly degraded rather than appearing healthy."
        )
        do {
            _ = try recoveredReadOnly.enqueue(
                annotationID: "annotation-3",
                projectSlug: "coaching",
                sourceTitle: "Must not write through corruption",
                expectedAnnotationUpdatedAt: "2027-01-16T00:00:01Z",
                capturedAt: capturedAt.addingTimeInterval(2)
            )
            fatalError("A recovered corrupt ledger must remain read-only.")
        } catch SourceAnnotationDraftDecisionStoreError.ledgerUnavailable {
            // Expected.
        }

        print("SourceAnnotationDraftOutboxHarness: PASS")
    }
}
