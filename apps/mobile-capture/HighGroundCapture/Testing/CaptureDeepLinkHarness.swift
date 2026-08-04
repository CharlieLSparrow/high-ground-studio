import Foundation

@main
struct CaptureDeepLinkHarness {
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

        print("Capture Session deep-link harness passed")
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
}
