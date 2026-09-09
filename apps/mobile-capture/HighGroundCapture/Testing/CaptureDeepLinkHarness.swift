import Foundation

@main
struct CaptureDeepLinkHarness {
    @MainActor
    static func main() {
        try! exerciseConversationDraftRecovery()
        expect(
            "quipsly://session/room-safe_42?mode=live",
            roomID: "room-safe_42",
            mode: .live
        )
        expect(
            "quipsly://session/episode-8?mode=record",
            roomID: "episode-8",
            mode: .record
        )
        expect(
            "https://nest.quipsly.com/sessions/coaching_7?open=capture&mode=review",
            roomID: "coaching_7",
            mode: .review
        )
        expectRejected("https://nest.quipsly.com/sessions/coaching_7")
        expectRejected("https://evil.example/sessions/coaching_7?open=capture")
        expectRejected("quipsly://session/room-safe?token=secret")
        expectRejected("quipsly://session/room-safe?participantToken=secret")
        expectRejected("quipsly://session/../../private?mode=live")
        expectRejected("quipsly://session/room%2Fprivate?mode=live")
        expectRejected("quipsly://session/røøm?mode=live")
        expectRejected("quipsly://other/room-safe?mode=live")

        for seconds in [0.0, 3.66, 86_400.0] {
            let link = CaptureTranscriptWorkLink(href: "/sessions/room-1?mode=transcript&source=asset-1&at=\(seconds)")
            precondition(link?.roomID == "room-1" && link?.recordingAssetID == "asset-1" && link?.sourceSeconds == seconds,
                         "A work link must retain its source-local timestamp, including zero.")
        }
        let recap = CaptureTranscriptWorkLink(href: "/sessions/room-1?mode=transcript")
        precondition(recap?.roomID == "room-1" && recap?.recordingAssetID == nil && recap?.sourceSeconds == nil)
        let workspaceJSON = #"""
        {"id":"space-1","title":"Our coaching space","status":"ACTIVE","canWrite":false,
         "currentUserId":"client-1","members":[],"entries":[
           {"id":"note-1","kind":"NOTE","title":null,"body":"My words","visibility":"SHARED","canEdit":false,
            "createdAt":"2026-09-07T00:00:00Z","updatedAt":"2026-09-07T00:00:00Z"},
           {"id":"task-1","kind":"TASK","title":"Next step","status":"DONE","visibility":"SHARED","canEdit":true,
            "tags":[{"id":"research","label":"Research","hexColor":"#23543a","isActive":true}],
            "sourceHref":"/sessions/room-1?mode=transcript&source=asset-1&at=3.66",
            "createdAt":"2026-09-07T00:00:00Z","updatedAt":"2026-09-07T00:00:00Z"}]
        }
        """#
        do {
            let workspace = try JSONDecoder().decode(MobileCoachingEngagementWorkspace.self, from: Data(workspaceJSON.utf8))
            precondition(workspace.entries.count == 2 && !workspace.canWrite)
            precondition(workspace.entries[0].displayTitle == "Untitled note" && workspace.entries[0].sourceLink == nil,
                         "An untitled or source-less note must not break the whole workspace.")
            precondition(workspace.entries[1].sourceLink?.sourceSeconds == 3.66 && workspace.entries[1].isComplete,
                         "API source links must survive native decoding.")
            precondition(workspace.entries[0].tags == nil && workspace.entries[1].tags == [
                MobileWorkTagLabel(id: "research", label: "Research", hexColor: "#23543a", isActive: true)
            ], "Canonical tag identity, labels, and colors must survive native decoding.")
            let roundTrip = try JSONDecoder().decode(MobileCoachingEngagementWorkspace.self, from: JSONEncoder().encode(workspace))
            precondition(roundTrip == workspace)
        } catch { fatalError("Canonical client-space response failed to decode: \(error)") }
        precondition(CaptureTagColor(hex: "#23543a")?.usesWhiteText == true)
        let messageJSON = ##"{"id":"message-1","body":"  Outline\n chapter one  ","createdAt":"2026-09-08T12:00:00Z","linkedTasks":[{"id":"task-1","title":"Outline chapter one","status":"DONE","tags":[{"id":"research","label":"Research","hexColor":"#23543a","isActive":true}]}]}"##
        let message = try! JSONDecoder().decode(NestChatMessage.self, from: Data(messageJSON.utf8))
        precondition(message.suggestedTaskTitle == "Outline chapter one")
        precondition(message.linkedTasks?.first?.tags?.first?.hexColor == "#23543a")
        precondition(message.linkedTasks?.first?.status == "DONE")
        precondition(try! JSONDecoder().decode(NestChatMessage.self, from: JSONEncoder().encode(message)) == message)
        let plainMessage = NestChatMessage(id: "plain", authorEmail: nil, authorName: nil,
            body: String(repeating: "a", count: 500), gifUrl: nil, createdAt: "now")
        precondition(plainMessage.suggestedTaskTitle.count == 160 && plainMessage.linkedTasks == nil)
        let taskCommand = NestConversationTaskCommand(projectSlug: "writing", messageID: "idea-1",
            title: "  Gather\n examples  ", tagIDs: ["research", "chapter", "research"])
        precondition(taskCommand.title == "Gather examples" && taskCommand.tags.tagIds == ["chapter", "research"])
        let retry = NestConversationTaskCommand(projectSlug: "writing", messageID: "idea-1",
            title: "Gather examples", tagIDs: ["research", "chapter"], previous: taskCommand)
        precondition(retry == taskCommand)
        let edited = NestConversationTaskCommand(projectSlug: "writing", messageID: "idea-1",
            title: "Gather better examples", tagIDs: ["research", "chapter"], previous: taskCommand)
        precondition(edited.clientRequestId != taskCommand.clientRequestId)
        let elsewhere = NestConversationTaskCommand(projectSlug: "other", messageID: "idea-1",
            title: "Gather examples", tagIDs: ["research", "chapter"], previous: taskCommand)
        precondition(elsewhere.clientRequestId != taskCommand.clientRequestId)
        let taskBody = try! JSONSerialization.jsonObject(with: JSONEncoder().encode(taskCommand)) as! [String: Any]
        precondition(taskBody["sourceMessageId"] as? String == "idea-1")
        precondition((taskBody["tags"] as? [String: [String]])?["tagIds"] == ["chapter", "research"])
        precondition(CaptureTagColor(hex: "#f2e4c5")?.usesWhiteText == false)
        precondition(CaptureTagColor(hex: "#aBc") == CaptureTagColor(hex: "#aabbcc"))
        precondition(CaptureTagColor(hex: "#aBc")?.hexString == "#aabbcc")
        precondition(CaptureTagColor(red: 0.5, green: 0, blue: 1)?.hexString == "#8000ff")
        precondition(CaptureTagColor(red: -0.1, green: 1.1, blue: 0.5)?.hexString == "#00ff80")
        precondition(CaptureTagColor(red: .nan, green: 0, blue: 0) == nil)
        precondition(CaptureTagColor(red: 0, green: .infinity, blue: 0) == nil)
        for invalid: String? in [nil, "", "red", "#12345", "#12345678", "#ggg", "url(https://example.test)"] {
            precondition(CaptureTagColor(hex: invalid) == nil, "Unspecified or invalid colors should inherit the app theme.")
        }
        for red in stride(from: 0, through: 255, by: 17) {
            for green in stride(from: 0, through: 255, by: 17) {
                for blue in stride(from: 0, through: 255, by: 17) {
                    let hex = String(format: "#%02x%02x%02x", red, green, blue)
                    precondition(CaptureTagColor(hex: hex)?.hexString == hex,
                                 "Saved RGB values must round-trip without changing shared colors.")
                    precondition(CaptureTagColor(hex: hex)!.textContrastRatio >= 4.5,
                                 "Every saved color must retain readable text: \(hex)")
                }
            }
        }
        for invalid in [
            "https://evil.example/sessions/room-1?mode=transcript",
            "//evil.example/sessions/room-1?mode=transcript",
            "/sessions/room%2Fprivate?mode=transcript",
            "/sessions/room-1?mode=live",
            "/sessions/room-1?mode=transcript&token=secret",
            "/sessions/room-1?mode=transcript&source=asset-1",
            "/sessions/room-1?mode=transcript&at=2",
            "/sessions/room-1?mode=transcript&source=asset-1&at=-1",
            "/sessions/room-1?mode=transcript&source=asset-1&at=nan",
            "/sessions/room-1?mode=transcript&source=asset-1&at=inf",
            "/sessions/room-1?mode=transcript&source=asset-1&at=86401",
            "/sessions/room-1?mode=transcript&source=asset-1&at=1&at=5",
            "/sessions/room-1?mode=transcript#wrong",
        ] {
            precondition(CaptureTranscriptWorkLink(href: invalid) == nil, "Malformed work link must not choose another destination: \(invalid)")
        }

        let draftID = UUID(uuidString: "A17F4C12-0000-4000-8000-000000000033")!
        expectWriting(
            "quipsly://writing/\(draftID.uuidString.lowercased())?action=continue",
            draftID: draftID
        )
        expectWriting(
            "https://nest.quipsly.com/writing/\(draftID.uuidString.lowercased())?open=capture",
            draftID: draftID
        )
        expectWriting(
            "https://quipsly.com/open/capture/writing/\(draftID.uuidString.lowercased())",
            draftID: draftID
        )
        expectWritingRejected(
            "https://nest.quipsly.com/writing/\(draftID.uuidString.lowercased())"
        )
        expectWritingRejected(
            "https://evil.example/writing/\(draftID.uuidString.lowercased())?open=capture"
        )
        expectWritingRejected(
            "quipsly://writing/\(draftID.uuidString.lowercased())?action=continue&token=secret"
        )
        expectWritingRejected("quipsly://writing/not-a-uuid?action=continue")

        expectNewWriting("quipsly://write")
        expectNewWriting("quipsly://voice-note")
        expectNewWriting("https://nest.quipsly.com/write?open=capture")
        expectNewWriting("https://quipsly.com/open/capture/write")
        expectNewWritingRejected("https://nest.quipsly.com/write")
        expectNewWritingRejected("https://evil.example/write?open=capture")
        expectNewWritingRejected("quipsly://write?draftId=private-document")
        expectNewWritingRejected("quipsly://write?token=secret")

        let router = CaptureDeepLinkRouter.shared
        guard let writingURL = URL(
            string: "quipsly://writing/\(draftID.uuidString.lowercased())?action=continue"
        ), router.receive(writingURL),
           let requestID = router.pendingVoiceNoteRequestID,
           router.pendingVoiceNoteDraftID == draftID,
           router.pendingSession == nil else {
            fatalError("The router did not retain the inert writing continuation request.")
        }
        router.consumeVoiceNoteRequest(requestID)
        guard router.pendingVoiceNoteRequestID == nil,
              router.pendingVoiceNoteDraftID == nil else {
            fatalError("The router did not consume the complete writing request.")
        }

        guard let newWritingURL = URL(string: "quipsly://write"),
              router.receive(newWritingURL),
              let newWritingRequestID = router.pendingVoiceNoteRequestID,
              router.pendingVoiceNoteDraftID == nil,
              router.pendingSession == nil else {
            fatalError("The router did not retain a new private voice-writing request.")
        }
        router.consumeVoiceNoteRequest(newWritingRequestID)
        guard router.pendingVoiceNoteRequestID == nil else {
            fatalError("The router did not consume the new writing request.")
        }

        var history = MobileCoachingWorkHistory()
        guard history.request(search: nil, including: nil) == [nil] else { fatalError("History must start at its first page") }
        history.didLoad(history.request(search: nil, including: "older-page"))
        guard history.request(search: nil, including: nil) == [nil, "older-page"],
              history.request(search: nil, including: "older-page") == [nil, "older-page"] else {
            fatalError("Refresh must retain loaded history without duplicating a page")
        }
        _ = history.request(search: "  listening  ", including: nil)
        // Simulate a network failure: didLoad is intentionally not called.
        guard history.query == "listening", history.request(search: nil, including: nil) == [nil] else {
            fatalError("A failed search must not reuse cursors from a different query")
        }
        history.didLoad(history.request(search: nil, including: "search-page"))
        guard history.request(search: "", including: nil) == [nil] else { fatalError("Clearing search must reset history") }
        history.didLoad(history.request(search: nil, including: "all-kind-page"))
        guard history.request(search: nil, kind: "TASK", including: nil) == [nil], history.kind == "TASK" else {
            fatalError("Changing the work type must not reuse the all-work cursor")
        }
        history.didLoad(history.request(search: nil, including: "tasks-page"))
        guard history.request(search: nil, tag: "research", including: nil) == [nil], history.tag == "research" else {
            fatalError("Selecting a tag must reset the unfiltered page history")
        }
        history.didLoad(history.request(search: nil, including: "research-page"))
        guard history.request(search: nil, including: nil) == [nil, "research-page"],
              history.request(search: nil, tag: "", including: nil) == [nil], history.tag.isEmpty else {
            fatalError("Refreshing retains the tag; clearing it resets its page history")
        }
        let historyWorkspaceJSON = #"{"id":"space","title":"Our work","status":"ACTIVE","canWrite":true,"currentUserId":"client","members":[],"entries":[]}"#
        do {
            let old = try JSONDecoder().decode(MobileCoachingEngagementWorkspace.self, from: Data(historyWorkspaceJSON.utf8))
            guard old.page == nil else { fatalError("Existing responses need no page metadata") }
            let page = MobileCoachingWorkPage(nextCursor: "next-page", pageSize: 100, query: "listening", kind: "ALL")
            var current = old
            current.page = page
            let roundTrip = try JSONDecoder().decode(MobileCoachingEngagementWorkspace.self, from: JSONEncoder().encode(current))
            guard roundTrip.page == page, roundTrip.id == "space" else { fatalError("Native history metadata was lost") }
        } catch { fatalError("Native workspace decoding failed: \(error)") }

        print("Capture Session, writing, transcript work-link, and coaching history harness passed")
    }

    private static func expect(
        _ value: String,
        roomID: String,
        mode: CaptureDeepLinkMode
    ) {
        guard let url = URL(string: value),
              let parsed = CaptureSessionDeepLink(url: url),
              parsed.roomID == roomID,
              parsed.mode == mode else {
            fatalError("Expected a valid Session link: \(value)")
        }
    }

    private static func exerciseConversationDraftRecovery() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("conversation-drafts-\(UUID())")
        defer { try? FileManager.default.removeItem(at: directory) }
        let key = CaptureConversationDraftKey(ownerAccountID: "owner-A", origin: "http://localhost:3012", context: "nest|writing|default")
        let store = CaptureConversationDraftStore(directory: directory)
        var draft = CaptureConversationDraft()
        draft.body = "  My unfinished thought\n"
        let send = draft.prepareSend(body: draft.body, schedulingEvidence: "-|-" )
        try store.save(draft, for: key)
        let savedFiles = try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
        precondition(savedFiles.count == 1 && !savedFiles[0].lastPathComponent.contains("owner-A"))
        let attributes = try FileManager.default.attributesOfItem(atPath: savedFiles[0].path)
        precondition((attributes[.posixPermissions] as? NSNumber)?.intValue == 0o600)
        var restored = try CaptureConversationDraftStore(directory: directory).load(key)
        precondition(restored == draft, "Relaunch must retain exact text and send identity")
        precondition(restored.prepareSend(body: restored.body, schedulingEvidence: "-|-") == send)
        for otherKey in [
            CaptureConversationDraftKey(ownerAccountID: "owner-B", origin: key.origin, context: key.context),
            CaptureConversationDraftKey(ownerAccountID: key.ownerAccountID, origin: "https://nest.quipsly.com", context: key.context),
            CaptureConversationDraftKey(ownerAccountID: key.ownerAccountID, origin: key.origin, context: "engagement|writing|private"),
        ] {
            let isolated = try store.load(otherKey)
            precondition(isolated == CaptureConversationDraft(), "Never expose another account, server, or conversation draft")
        }
        restored.body = "The next thought typed during the send"
        restored.acknowledge(send)
        precondition(restored.pending == nil && restored.body == "The next thought typed during the send")
        let nextSend = restored.prepareSend(body: restored.body, schedulingEvidence: "-|-")
        precondition(nextSend.id != send.id)
        restored.acknowledge(send)
        precondition(restored.pending == nextSend, "A late acknowledgement cannot clear a newer attempt")
        restored.acknowledge(nextSend)
        try store.save(restored, for: key)
        let cleared = try store.load(key)
        precondition(cleared == CaptureConversationDraft(), "A confirmed send remains cleared after relaunch")
        let blocked = directory.appendingPathComponent("not-a-directory")
        try Data("fixture".utf8).write(to: blocked)
        do {
            try CaptureConversationDraftStore(directory: blocked).save(draft, for: key)
            preconditionFailure("Storage failure must not be reported as a saved draft")
        } catch { }
        precondition(draft.body == "  My unfinished thought\n")
    }

    private static func expectRejected(_ value: String) {
        guard let url = URL(string: value), CaptureSessionDeepLink(url: url) == nil else {
            fatalError("Expected Session link rejection: \(value)")
        }
    }

    private static func expectWriting(_ value: String, draftID: UUID) {
        guard let url = URL(string: value),
              let parsed = CaptureVoiceWritingDeepLink(url: url),
              parsed.draftID == draftID else {
            fatalError("Expected a valid private-writing link: \(value)")
        }
    }

    private static func expectWritingRejected(_ value: String) {
        guard let url = URL(string: value), CaptureVoiceWritingDeepLink(url: url) == nil else {
            fatalError("Expected private-writing link rejection: \(value)")
        }
    }

    private static func expectNewWriting(_ value: String) {
        guard let url = URL(string: value),
              CaptureStartVoiceWritingDeepLink(url: url) != nil else {
            fatalError("Expected a valid new voice-writing link: \(value)")
        }
    }

    private static func expectNewWritingRejected(_ value: String) {
        guard let url = URL(string: value), CaptureStartVoiceWritingDeepLink(url: url) == nil else {
            fatalError("Expected new voice-writing link rejection: \(value)")
        }
    }
}
