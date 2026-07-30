import Combine
import Foundation

#if SOURCE_INBOX_FILING_HARNESS
@MainActor
final class AuthManager: ObservableObject {
    static var ownerAccountID: String?
    static let shared = AuthManager()

    var networkActionsAllowed = true

    static func currentStoredOwnerID() -> String? { ownerAccountID }

    func authenticatedData(
        for request: URLRequest,
        allowOfflineRecovery: Bool = false
    ) async throws -> (Data, HTTPURLResponse) {
        fatalError("Network access is outside the source-filing outbox harness.")
    }
}

extension Notification.Name {
    static let quipslyCaptureAccountIdentityDidChange =
        Notification.Name("quipslyCaptureAccountIdentityDidChange")
}

func normalizedNestBaseURL(_ value: String) -> String {
    value.trimmingCharacters(in: .whitespacesAndNewlines)
}
#endif

@main
private struct SourceInboxFilingOutboxHarness {
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
                "quipsly-source-inbox-harness-\(UUID().uuidString)",
                isDirectory: true
            )
        defer { try? fileManager.removeItem(at: directory) }

        let ownerA = "private-owner-a"
        let ownerB = "private-owner-b"
        AuthManager.ownerAccountID = ownerA
        let capturedAt = Date(timeIntervalSince1970: 1_800_000_000)
        let source = MobileSourceInboxSource(
            id: "snippet-1",
            captureType: .snippet,
            title: "Curiosity",
            excerpt: "Be curious, not judgmental.",
            sourceUrl: "https://example.com/curiosity",
            captureCount: 2,
            capturedAt: "2027-01-15T00:00:00Z",
            updatedAt: "2027-01-15T00:00:02.123Z"
        )
        let destination = MobileSourceInboxDestination(
            id: "project-1",
            slug: "episode",
            name: "High Ground Odyssey",
            role: "EDITOR"
        )
        let outbox = SourceInboxFilingOutbox(
            fileManager: fileManager,
            directoryURL: directory,
            initialOwnerAccountID: ownerA,
            observeAccountChanges: false
        )
        let decision = try outbox.enqueue(
            source: source,
            destination: destination,
            annotationKind: "question",
            annotationVisibility: "project",
            annotationBody: "Could this frame the episode opening?",
            annotationTagIDs: ["tag-curiosity", "tag-episode"],
            capturedAt: capturedAt
        )

        require(
            outbox.pendingCount == 1,
            "A filing decision must appear only after its protected write."
        )
        require(
            decision.captureID == source.id
                && decision.projectID == destination.id
                && decision.captureType == .snippet,
            "The protected entry must bind the exact capture and Research Nest."
        )
        require(
            decision.expectedCaptureUpdatedAt == source.updatedAt,
            "Offline retries must preserve the reviewed capture revision."
        )
        require(
            UUID(uuidString: decision.clientRequestID) != nil,
            "Every filing retry must retain one valid UUID identity."
        )
        require(
            decision.annotationRequestID != nil
                && decision.annotationKind == "question"
                && decision.annotationVisibility == "project"
                && decision.annotationBody == "Could this frame the episode opening?"
                && decision.annotationTagIDs == ["tag-curiosity", "tag-episode"],
            "The protected filing decision must retain the complete annotation and canonical tag intent."
        )

        do {
            _ = try outbox.enqueue(
                source: source,
                destination: destination,
                capturedAt: capturedAt
            )
            fatalError("One private source must not accept two unresolved filing decisions.")
        } catch SourceInboxFilingStoreError.decisionAlreadyPending {
            // Expected.
        }

        let relaunched = SourceInboxFilingOutbox(
            fileManager: fileManager,
            directoryURL: directory,
            initialOwnerAccountID: ownerA,
            observeAccountChanges: false
        )
        require(
            relaunched.pendingCount == 1
                && relaunched.entries.first?.id == decision.id
                && relaunched.entries.first?.annotationRequestID
                    == decision.annotationRequestID
                && relaunched.entries.first?.annotationTagIDs
                    == decision.annotationTagIDs,
            "Relaunch must recover the exact unresolved filing and annotation identity."
        )

        relaunched.markHeld(
            decision.id,
            code: "CONFLICT",
            message: "The source changed in Nest.",
            at: capturedAt
        )
        require(
            relaunched.pendingCount == 0 && relaunched.heldCount == 1,
            "A revision conflict must remain visible and stop automatic retries."
        )
        require(
            relaunched.entries.first?.lastErrorCode == "CONFLICT",
            "Held filing decisions must preserve their conflict reason."
        )
        relaunched.releaseHeldEntriesForRetry()
        require(
            relaunched.pendingCount == 1 && relaunched.heldCount == 0,
            "A deliberate retry must release the same stable filing identity."
        )

        relaunched.activateOwner(ownerB)
        require(
            relaunched.entries.isEmpty,
            "Another account must not see the first account's private source decision."
        )
        AuthManager.ownerAccountID = ownerB
        let ownerBSource = MobileSourceInboxSource(
            id: "bookmark-2",
            captureType: .bookmark,
            title: "Private link",
            excerpt: "https://example.com/private",
            sourceUrl: "https://example.com/private",
            captureCount: 1,
            capturedAt: "2027-01-16T00:00:00Z",
            updatedAt: "2027-01-16T00:00:01Z"
        )
        let ownerBDecision = try relaunched.enqueue(
            source: ownerBSource,
            destination: MobileSourceInboxDestination(
                id: "project-2",
                slug: "coaching",
                name: "Coaching",
                role: "OWNER"
            ),
            capturedAt: capturedAt.addingTimeInterval(1)
        )
        require(
            relaunched.entries == [ownerBDecision],
            "Each verified account must publish only its own outbox partition."
        )

        AuthManager.ownerAccountID = ownerA
        relaunched.activateOwner(ownerA)
        require(
            relaunched.entries.first?.id == decision.id,
            "Switching back must restore the first account's exact decision."
        )
        relaunched.markAcknowledged(decision.id)
        require(
            relaunched.entries.isEmpty,
            "An exact Nest acknowledgement must close only that filing decision."
        )

        AuthManager.ownerAccountID = ownerB
        relaunched.activateOwner(ownerB)
        require(
            relaunched.entries.first?.id == ownerBDecision.id,
            "Acknowledging one account must not remove another account's decision."
        )

        print("SourceInboxFilingOutboxHarness: PASS")
    }
}
