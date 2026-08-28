import AppIntents

struct StartQuipslyVoiceNoteIntent: AppIntent {
    static let title: LocalizedStringResource = "Speak to Write in Quipsly"
    static let description = IntentDescription(
        "Opens a private speech-to-writing draft, ready for you to start talking."
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
                "Start writing by voice in \(.applicationName)",
                "Start a paper in \(.applicationName)",
                "Record a voice note in \(.applicationName)",
                "Write by voice in \(.applicationName)",
            ],
            shortTitle: "Speak to Write",
            systemImageName: "waveform.circle.fill"
        )
    }
}
