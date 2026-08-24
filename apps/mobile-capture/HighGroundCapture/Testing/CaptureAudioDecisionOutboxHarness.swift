import Foundation

#if CAPTURE_AUDIO_DECISION_HARNESS
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
private struct CaptureAudioDecisionOutboxHarness {
    static func require(_ condition: @autoclosure () -> Bool, _ message: String) {
        guard condition() else { fatalError(message) }
    }

    @MainActor
    static func main() throws {
        let fileManager = FileManager.default
        let directory = fileManager.temporaryDirectory
            .appendingPathComponent("quipsly-audio-decision-harness-\(UUID().uuidString)", isDirectory: true)
        defer { try? fileManager.removeItem(at: directory) }
        let ownerA = "coach-a@example.test"
        let ownerB = "coach-b@example.test"
        let completedAt = Date(timeIntervalSince1970: 1_800_000_000)
        let sha256 = String(repeating: "a", count: 64)

        AuthManager.ownerAccountID = ownerA
        let outbox = CaptureAudioDecisionOutbox(
            fileManager: fileManager,
            directoryURL: directory,
            initialOwnerAccountID: ownerA,
            observeAccountChanges: false
        )
        let decision = try outbox.enqueueDeliveryReview(
            projectSlug: "coaching",
            assetID: "asset-001",
            sourceID: "source-001",
            deliveryJobID: "delivery-001",
            deliverySHA256: sha256,
            deliverySizeBytes: 42_000,
            decision: .approved,
            listenedSecondBins: [9, 0, 5, 5],
            note: "Exact file heard.",
            completedAt: completedAt
        )
        require(outbox.pendingCount == 1, "A decision must publish only after its protected write.")
        require(decision.listenedSecondBins == [0, 5, 9], "Playback bins must be normalized before persistence.")
        require(decision.clientRequestID.hasSuffix(decision.id.uuidString.lowercased()), "The request identity must derive from the durable UUID.")

        do {
            _ = try outbox.enqueueDeliveryReview(
                projectSlug: decision.projectSlug,
                assetID: decision.assetID,
                sourceID: decision.sourceID,
                deliveryJobID: decision.deliveryJobID,
                deliverySHA256: decision.deliverySHA256,
                deliverySizeBytes: decision.deliverySizeBytes,
                decision: .rejected,
                listenedSecondBins: [0],
                note: "Different decision."
            )
            fatalError("One artifact must not accept two unresolved decisions.")
        } catch CaptureAudioDecisionStoreError.decisionAlreadyPending {
            // Expected.
        }

        let relaunched = CaptureAudioDecisionOutbox(
            fileManager: fileManager,
            directoryURL: directory,
            initialOwnerAccountID: ownerA,
            observeAccountChanges: false
        )
        require(relaunched.entries.first == decision, "Relaunch must preserve the exact payload, timestamp, and retry identity.")
        relaunched.markAttempting(decision.id, at: completedAt.addingTimeInterval(5))
        relaunched.markRetryable(decision.id, message: "Connection dropped after send.")
        require(relaunched.entries.first?.attemptCount == 1, "Ambiguous delivery must retain attempt evidence.")
        require(relaunched.entries.first?.clientRequestID == decision.clientRequestID, "Retry metadata must not change the server request identity.")
        relaunched.markHeld(decision.id, code: "STALE", message: "Delivery lineage changed.")
        require(relaunched.heldCount == 1, "A semantic conflict must stop automatic retry.")

        relaunched.activateOwner(ownerB)
        require(relaunched.entries.isEmpty, "Another account must not see the first account's audio decision.")
        AuthManager.ownerAccountID = ownerB
        let other = try relaunched.enqueueDeliveryReview(
            projectSlug: "coaching",
            assetID: "asset-001",
            sourceID: "source-002",
            deliveryJobID: "delivery-002",
            deliverySHA256: String(repeating: "b", count: 64),
            deliverySizeBytes: 84_000,
            decision: .rejected,
            listenedSecondBins: [1],
            note: "Audible clipping."
        )
        require(relaunched.entries == [other], "Each account must publish only its own protected partition.")

        AuthManager.ownerAccountID = ownerA
        relaunched.activateOwner(ownerA)
        require(relaunched.markAcknowledged(decision.id), "An exact Nest acknowledgement must close the matching entry.")
        require(relaunched.entries.isEmpty, "Acknowledgement must remove only the current account's exact decision.")
        relaunched.activateOwner(ownerB)
        require(relaunched.entries == [other], "Acknowledging another account's decision must not remove this partition.")

        let ledger = directory.appendingPathComponent("audio-delivery-review-decisions-v1.json")
        try Data("not-json".utf8).write(to: ledger, options: .atomic)
        let recovered = CaptureAudioDecisionOutbox(
            fileManager: fileManager,
            directoryURL: directory,
            initialOwnerAccountID: ownerB,
            observeAccountChanges: false
        )
        require(
            recovered.entries == [other],
            "A corrupt primary ledger must expose the last-known-good decision read-only. recovered=\(recovered.entries) error=\(recovered.persistenceError ?? "none")"
        )
        require(recovered.persistenceError?.contains("last-known-good") == true, "Recovery must disclose the read-only last-known-good boundary.")
        print("CaptureAudioDecisionOutboxHarness: PASS")
    }
}
