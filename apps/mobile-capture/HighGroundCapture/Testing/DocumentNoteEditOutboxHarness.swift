import Foundation

#if DOCUMENT_NOTE_EDIT_HARNESS
enum AuthManager {
    static var ownerAccountID: String?
    static func currentStoredOwnerID() -> String? { ownerAccountID }
}

extension Notification.Name {
    static let quipslyCaptureAccountIdentityDidChange =
        Notification.Name("quipslyCaptureAccountIdentityDidChange")
}

struct MobileCaptureWorkNoteBlock {
    let id: String
    let stableId: String
    let order: Int
    let body: String
}
#endif

@main
private struct DocumentNoteEditOutboxHarness {
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
                "quipsly-document-note-edit-harness-\(UUID().uuidString)",
                isDirectory: true
            )
        defer { try? fileManager.removeItem(at: directory) }

        let ownerA = "private-owner-a"
        let ownerB = "private-owner-b"
        let revision = String(repeating: "a", count: 64)
        let capturedAt = Date(timeIntervalSince1970: 1_800_000_000)
        let blocks = [
            MobileCaptureWorkNoteBlock(
                id: "body-1",
                stableId: "stable-body-1",
                order: 1,
                body: "Keep the quiet question anchored."
            ),
        ]

        AuthManager.ownerAccountID = ownerA
        let outbox = DocumentNoteEditOutbox(
            fileManager: fileManager,
            directoryURL: directory,
            initialOwnerAccountID: ownerA,
            observeAccountChanges: false
        )
        let edit = try outbox.enqueue(
            projectID: "project-1",
            noteID: "note-1",
            title: "  Episode   opening  ",
            blocks: blocks,
            expectedContentRevision: revision,
            capturedAt: capturedAt
        )
        require(outbox.pendingCount == 1, "A protected write must precede the offline-save claim.")
        require(edit.title == "Episode opening", "Canonical title whitespace must be deterministic.")
        require(edit.blocks.first?.body == blocks.first?.body, "The exact note body must survive the protected write.")
        require(UUID(uuidString: edit.clientRequestID) != nil, "One valid UUID must remain bound to every retry.")

        do {
            _ = try outbox.enqueue(
                projectID: "project-1",
                noteID: "note-1",
                title: "Second unresolved edit",
                blocks: blocks,
                expectedContentRevision: revision,
                capturedAt: capturedAt
            )
            fatalError("One note must not accept two unresolved edits.")
        } catch DocumentNoteEditStoreError.editAlreadyPending {
            // Expected.
        }

        let relaunched = DocumentNoteEditOutbox(
            fileManager: fileManager,
            directoryURL: directory,
            initialOwnerAccountID: ownerA,
            observeAccountChanges: false
        )
        require(relaunched.pendingCount == 1, "Relaunch must recover the complete protected edit.")
        require(relaunched.entries.first == edit, "Relaunch must retain title, blocks, fingerprint, and UUID exactly.")

        do {
            _ = try relaunched.enqueue(
                projectID: "project-1",
                noteID: "note-oversize",
                title: "Oversize edit",
                blocks: [
                    MobileCaptureWorkNoteBlock(
                        id: "body-large",
                        stableId: "stable-body-large",
                        order: 1,
                        body: String(repeating: "x", count: 20_001)
                    ),
                ],
                expectedContentRevision: revision,
                capturedAt: capturedAt
            )
            fatalError("Oversize prose must fail instead of being truncated.")
        } catch DocumentNoteEditStoreError.invalidEdit {
            // Expected.
        }

        do {
            _ = try relaunched.enqueue(
                projectID: "project-1",
                noteID: "note-duplicate-block",
                title: "Duplicate stable identity",
                blocks: [
                    MobileCaptureWorkNoteBlock(
                        id: "body-a",
                        stableId: "same-stable-id",
                        order: 1,
                        body: "First."
                    ),
                    MobileCaptureWorkNoteBlock(
                        id: "body-b",
                        stableId: "same-stable-id",
                        order: 2,
                        body: "Second."
                    ),
                ],
                expectedContentRevision: revision,
                capturedAt: capturedAt
            )
            fatalError("Duplicate stable block identities must fail closed.")
        } catch DocumentNoteEditStoreError.invalidEdit {
            // Expected.
        }

        relaunched.markHeld(
            edit.id,
            code: "CONFLICT",
            message: "Changed in Nest.",
            at: capturedAt
        )
        require(
            relaunched.pendingCount == 0 && relaunched.heldCount == 1,
            "A permanent conflict must remain visible and stop automatic retries."
        )
        require(
            relaunched.entries.first?.lastErrorCode == "CONFLICT",
            "Held edits must preserve their exact conflict reason."
        )

        let replacement = try relaunched.enqueue(
            projectID: "project-1",
            noteID: "note-1",
            title: "Reviewed replacement",
            blocks: blocks,
            expectedContentRevision: String(repeating: "b", count: 64),
            replacingHeld: true,
            capturedAt: capturedAt.addingTimeInterval(1)
        )
        require(
            relaunched.entries == [replacement],
            "Explicit review may replace one held edit without retaining two intents."
        )

        relaunched.activateOwner(ownerB)
        require(relaunched.entries.isEmpty, "Another account must not see the first account's private edit.")
        AuthManager.ownerAccountID = ownerB
        let ownerBEdit = try relaunched.enqueue(
            projectID: "project-2",
            noteID: "note-2",
            title: "Other account note",
            blocks: blocks,
            expectedContentRevision: revision,
            capturedAt: capturedAt.addingTimeInterval(2)
        )
        require(relaunched.entries == [ownerBEdit], "Each account must publish only its own partition.")

        AuthManager.ownerAccountID = ownerA
        relaunched.activateOwner(ownerA)
        require(
            relaunched.entries == [replacement],
            "Switching back must restore only the first account's protected edit."
        )
        relaunched.markAcknowledged(replacement.id)
        require(relaunched.entries.isEmpty, "An exact acknowledgement must close only one account's edit.")

        AuthManager.ownerAccountID = ownerB
        relaunched.activateOwner(ownerB)
        require(
            relaunched.entries == [ownerBEdit],
            "Acknowledging one account must never remove another account's edit."
        )

        print("DocumentNoteEditOutboxHarness: PASS")
    }
}
