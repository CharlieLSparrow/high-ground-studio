import Foundation

@main
enum CaptureAttentionPresentationTests {
    static func main() {
        expect(
            "Microphone permission denied. Enable microphone access in Settings to record.",
            title: "Microphone access is off",
            opensSettings: true
        )
        expect(
            "No microphone is available after activating the audio session.",
            title: "Check your microphone",
            actionTitle: "Try again",
            recovery: .retryMicrophone
        )
        expect(
            "Camera permission denied. Allow camera access in Settings.",
            title: "Camera access is off",
            opensSettings: true
        )
        expect(
            "The selected camera could not start.",
            title: "Check your camera",
            actionTitle: "Try again",
            recovery: .retryCamera
        )
        expect(
            "That Space is not available on this device yet.",
            title: "Check this Session"
        )
        expect(
            "This device does not have enough free storage to start recording.",
            title: "More storage is needed"
        )
        expect(
            "The live room could not connect.",
            title: "Call couldn't connect"
        )
        expect(
            "Quipsly is offline and cannot reach Nest.",
            title: "Connection interrupted"
        )
        expect(
            "Verify the current Quipsly account before recording.",
            title: "Check your account"
        )
        expect(
            "The upload could not be queued.",
            title: "Upload needs attention"
        )
        expect(
            "The local recorder did not start. Nothing was recorded.",
            title: "Recording couldn't finish"
        )
        expect(
            "An unexpected response was returned.",
            title: "Quipsly couldn't finish that"
        )
        print("PASS 12 capture attention presentation tests")
    }

    private static func expect(
        _ message: String,
        title: String,
        opensSettings: Bool = false,
        actionTitle: String? = nil,
        recovery: CaptureAttentionRecovery? = nil
    ) {
        let presentation = CaptureAttentionDiagnostics.presentation(for: message)
        guard presentation.title == title else {
            fail("Expected \"\(title)\" for \"\(message)\", got \"\(presentation.title)\".")
        }
        guard presentation.offersSettingsRecovery == opensSettings else {
            fail("Unexpected Settings recovery for \"\(message)\".")
        }
        if let actionTitle,
           presentation.actionTitle != actionTitle {
            fail("Expected action \"\(actionTitle)\" for \"\(message)\", got \"\(presentation.actionTitle)\".")
        }
        if let recovery,
           presentation.recovery != recovery {
            fail("Unexpected recovery for \"\(message)\".")
        }
    }

    private static func fail(_ message: String) -> Never {
        FileHandle.standardError.write(Data("FAIL: \(message)\n".utf8))
        Foundation.exit(1)
    }
}
