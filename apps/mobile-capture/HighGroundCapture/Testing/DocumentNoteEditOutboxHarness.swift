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

        let draftDirectory = directory.appendingPathComponent("new-session-notes")
        require(MobileQuickEntryDestination(selection: "NEST:uncached-project")?.projectID == "uncached-project",
                "A missing cached workspace must keep its exact ID, not fall back to the current session.")
        require(MobileQuickEntryDestination(selection: "SESSION") == .session, "Session selection must be explicit.")
        require(MobileQuickEntryDestination(selection: "HOME_NEST") == .home, "Personal filing must remain explicit.")
        require(MobileQuickEntryDestination(selection: "NEST:") == nil
                && MobileQuickEntryDestination(selection: "unknown") == nil,
                "Invalid saved destinations must not turn into a different filing choice.")
        AuthManager.ownerAccountID = ownerA
        let draftID = SessionNoteWorkingDraftStore.compositionID(
            roomID: "session-1", origin: "https://nest.quipsly.com", audience: .authorPrivate)
        let otherAudienceID = SessionNoteWorkingDraftStore.compositionID(
            roomID: "session-1", origin: "https://nest.quipsly.com", audience: .sessionShared)
        let otherOriginID = SessionNoteWorkingDraftStore.compositionID(
            roomID: "session-1", origin: "http://localhost:3012", audience: .authorPrivate)
        let otherRoomID = SessionNoteWorkingDraftStore.compositionID(
            roomID: "session-2", origin: "https://nest.quipsly.com", audience: .authorPrivate)
        require(Set([draftID, otherAudienceID, otherOriginID, otherRoomID]).count == 4,
                "Draft recovery must not cross environment, session, or initial audience.")
        let drafts = SessionNoteWorkingDraftStore(directoryURL: draftDirectory,
            initialOwnerAccountID: ownerA, observeAccountChanges: false)
        require(drafts.save(roomID: "session-1", noteID: draftID, title: "An unfinished idea",
            body: "Keep this exact text when closing the composer.", noteKind: .sessionNote,
            noteVisibility: .authorPrivate, tagIDs: ["tag-1"], baseUpdatedAt: "",
            destination: "SESSION", newTagLabels: ["Research"]), "New notes must be durable before dismissal.")
        let recovered = SessionNoteWorkingDraftStore(directoryURL: draftDirectory,
            initialOwnerAccountID: ownerA, observeAccountChanges: false)
        let recoveredDraft = recovered.draft(for: draftID)
        require(recoveredDraft?.body == "Keep this exact text when closing the composer.", "Relaunch must restore exact text.")
        require(recoveredDraft?.noteVisibility == .authorPrivate, "Relaunch must retain private sharing.")
        require(recoveredDraft?.newTagLabels == ["Research"] && recoveredDraft?.tagIDs == ["tag-1"], "Both new and canonical tags must survive.")
        require(recoveredDraft?.destination == "SESSION", "The original filing destination must survive.")

        AuthManager.ownerAccountID = ownerB
        require(!recovered.save(roomID: "session-1", noteID: draftID, title: "Wrong account",
            body: "Must not save", noteKind: .sessionNote, noteVisibility: .sessionShared,
            tagIDs: [], baseUpdatedAt: ""), "An old account's store cannot save after sign-in changes.")
        let otherOwnerDrafts = SessionNoteWorkingDraftStore(directoryURL: draftDirectory,
            initialOwnerAccountID: ownerB, observeAccountChanges: false)
        require(otherOwnerDrafts.draft(for: draftID) == nil, "A second account must not see the first account's unfinished note.")
        require(otherOwnerDrafts.save(roomID: "session-1", noteID: draftID, title: "Owner B",
            body: "A separate thought", noteKind: .sessionNote, noteVisibility: .authorPrivate,
            tagIDs: [], baseUpdatedAt: ""), "A second account can keep its own draft in the same session.")
        otherOwnerDrafts.remove(noteID: draftID)
        AuthManager.ownerAccountID = ownerA
        let afterOtherDiscard = SessionNoteWorkingDraftStore(directoryURL: draftDirectory,
            initialOwnerAccountID: ownerA, observeAccountChanges: false)
        require(afterOtherDiscard.draft(for: draftID) == recoveredDraft, "Discard must not erase another account's draft.")
        afterOtherDiscard.remove(noteID: draftID)
        require(afterOtherDiscard.draft(for: draftID) == nil, "Explicit discard must clear the current draft.")

        var textEdit = PendingSessionNoteEdit(id: UUID(), ownerAccountID: ownerA,
            roomID: "session-1", noteID: "shared-note", title: "A thought", body: "Our next step",
            noteKind: .sessionNote, noteVisibility: .sessionShared, tagIDs: [], preserveTags: true,
            expectedUpdatedAt: "2026-09-13T12:00:00.000Z", capturedAt: capturedAt,
            disposition: .pending, attemptCount: 0, lastAttemptAt: nil, lastErrorCode: nil, lastErrorMessage: nil)
        let textWire = try JSONSerialization.jsonObject(with: JSONEncoder().encode(MobileSessionNoteEditRequest(edit: textEdit))) as! [String: Any]
        require(textWire["tagIds"] == nil, "A text-only edit must not remove unseen or archived tags.")
        let restoredText = try JSONDecoder().decode(PendingSessionNoteEdit.self, from: JSONEncoder().encode(textEdit))
        require(restoredText.preserveTags == true, "Offline recovery must retain text-only intent.")
        textEdit.preserveTags = nil
        let legacyData = try JSONEncoder().encode(textEdit)
        let legacy = try JSONDecoder().decode(PendingSessionNoteEdit.self, from: legacyData)
        require(legacy.preserveTags == nil, "Existing queued edits must keep their original intent.")
        let legacyWire = try JSONSerialization.jsonObject(with: JSONEncoder().encode(MobileSessionNoteEditRequest(edit: legacy))) as! [String: Any]
        require((legacyWire["tagIds"] as? [String]) == [], "A legacy request still explicitly submits its original tags.")

        print("DocumentNoteEditOutboxHarness: PASS (document edits, Session recovery, and text-only tag preservation)")
    }
}
