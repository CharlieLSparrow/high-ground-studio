import AppIntents

struct StartQuipslyVoiceNoteIntent: AppIntent {
    static let title: LocalizedStringResource = "Start a Quipsly Voice Note"
    static let description = IntentDescription(
        "Opens a new private voice note, ready for you to start recording."
    )
    static let openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult {
        CaptureDeepLinkRouter.shared.requestVoiceNote()
        return .result()
    }
}

struct QuipslyCaptureShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: StartQuipslyVoiceNoteIntent(),
            phrases: [
                "Start a voice note in \(.applicationName)",
                "Record a thought in \(.applicationName)",
                "Write by voice in \(.applicationName)",
            ],
            shortTitle: "Voice Note",
            systemImageName: "waveform.circle.fill"
        )
    }
}
