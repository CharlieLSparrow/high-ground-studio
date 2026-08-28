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

        let draftID = UUID(uuidString: "A17F4C12-0000-4000-8000-000000000033")!
        expectWriting(
            "quipsly://writing/\(draftID.uuidString.lowercased())?action=continue",
            draftID: draftID
        )
        expectWriting(
            "https://nest.quipsly.com/writing/\(draftID.uuidString.lowercased())?open=capture",
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

        print("Capture Session and writing deep-link harness passed")
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
}
