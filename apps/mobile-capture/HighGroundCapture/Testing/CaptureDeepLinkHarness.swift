import Foundation

@main
struct CaptureDeepLinkHarness {
    @MainActor
    static func main() {
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
            let roundTrip = try JSONDecoder().decode(MobileCoachingEngagementWorkspace.self, from: JSONEncoder().encode(workspace))
            precondition(roundTrip == workspace)
        } catch { fatalError("Canonical client-space response failed to decode: \(error)") }
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

        print("Capture Session, writing, and transcript work-link harness passed")
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
