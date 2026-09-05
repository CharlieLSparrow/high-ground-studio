import Foundation

private enum VoiceWritingTextComposerHarnessError: Error, CustomStringConvertible {
    case failed(String)

    var description: String {
        switch self {
        case .failed(let message): message
        }
    }
}

@main
private struct VoiceWritingTextComposerHarness {
    static func main() throws {
        try exactCommandsCreateStructure()
        try inlineCommandsSurviveRecognizerChunking()
        try familiarBulletCommandsCreateAList()
        try spokenHeadingsCreatePortableStructure()
        try headingCommandsCanArriveBeforeTheirText()
        try richContinuationPreservesBothDocuments()
        try emptyKeyboardDraftCanGainAVoiceTitleWithoutRenamingRealWork()
        try machinePurposeNeverEscapesAsAWritingTitle()
        try ordinaryProseIsNotMistakenForACommand()
        try pausesStillCreateReadableParagraphs()
        print("PASS Voice writing speech structure composition")
    }

    private static func spokenHeadingsCreatePortableStructure() throws {
        let writing = VoiceWritingTextComposer.richText(from: [
            phrase("New heading. Why Courage Matters", 0, 2),
            phrase("Courage makes difficult action possible.", 2, 4),
            phrase("New subheading Evidence from experience", 4, 6),
            phrase("A concrete example belongs here.", 6, 8),
        ])
        try require(
            writing.text == "Why Courage Matters\n\nCourage makes difficult action possible.\n\nEvidence from experience\n\nA concrete example belongs here.",
            "Heading commands should leave clean editable prose."
        )
        try require(
            writing.structures == [
                .init(kind: .heading, startUtf16: 0, endUtf16: 19),
                .init(kind: .subheading, startUtf16: 63, endUtf16: 87),
            ],
            "Spoken headings should become real portable block structure."
        )
    }

    private static func headingCommandsCanArriveBeforeTheirText() throws {
        let writing = VoiceWritingTextComposer.richText(from: [
            phrase("new heading", 0, 0.5),
            phrase("Methods", 0.5, 1.2),
            phrase("This section explains the approach.", 1.2, 3),
        ])
        try require(
            writing.text == "Methods\n\nThis section explains the approach.",
            "A command recognized separately should style the next phrase only."
        )
        try require(
            writing.structures == [.init(kind: .heading, startUtf16: 0, endUtf16: 7)],
            "A separately recognized heading must keep its semantic structure."
        )
    }

    private static func richContinuationPreservesBothDocuments() throws {
        let first = VoiceWritingRichText(
            text: "Opening",
            marks: [.init(kind: .bold, startUtf16: 0, endUtf16: 7)],
            structures: [.init(kind: .heading, startUtf16: 0, endUtf16: 7)]
        )
        let next = VoiceWritingTextComposer.richText(from: [
            phrase("New subheading Next steps", 0, 1),
            phrase("Keep writing.", 1, 2),
        ])
        let combined = first.appending(next)
        try require(combined.text == "Opening\n\nNext steps\n\nKeep writing.", "Continuation text should remain readable.")
        try require(
            combined.marks == [.init(kind: .bold, startUtf16: 0, endUtf16: 7)],
            "Continuation must preserve existing inline formatting."
        )
        try require(
            combined.structures == [
                .init(kind: .heading, startUtf16: 0, endUtf16: 7),
                .init(kind: .subheading, startUtf16: 9, endUtf16: 19),
            ],
            "Continuation must preserve and offset both documents' structure."
        )
    }

    private static func emptyKeyboardDraftCanGainAVoiceTitleWithoutRenamingRealWork() throws {
        let suggested = VoiceWritingTextComposer.suggestedContinuationTitle(
            currentTitle: "Untitled",
            currentBody: "",
            combinedBody: "A practical framework for coaching conversations begins with careful listening."
        )
        try require(
            suggested == "A practical framework for coaching conversations begins with careful listening",
            "An empty keyboard-first draft should organize itself when the person switches to voice."
        )
        try require(
            VoiceWritingTextComposer.suggestedContinuationTitle(
                currentTitle: "Dissertation methods",
                currentBody: "",
                combinedBody: "New spoken material belongs here."
            ) == nil,
            "A deliberate title must never be replaced automatically."
        )
        try require(
            VoiceWritingTextComposer.suggestedContinuationTitle(
                currentTitle: "Untitled",
                currentBody: "An existing paragraph.",
                combinedBody: "An existing paragraph.\n\nA new spoken paragraph."
            ) == nil,
            "An existing document must not be renamed merely because its current title is Untitled."
        )
    }

    private static func machinePurposeNeverEscapesAsAWritingTitle() throws {
        try require(
            VoiceWritingTextComposer.presentedTitle(
                "PERSONAL_NOTE",
                body: "A practical framework for calmer coaching conversations starts here."
            ) == "A practical framework for calmer coaching conversations starts here",
            "A legacy Session-purpose token should become a useful title derived from the writing."
        )
        try require(
            VoiceWritingTextComposer.presentedTitle("field_note", body: "Too short") == "Voice note",
            "A machine-purpose token with too little prose should still have a calm human title."
        )
        try require(
            VoiceWritingTextComposer.presentedTitle("Personal note", body: "Different words") == "Personal note",
            "An ordinary deliberate title must never be mistaken for an internal enum token."
        )
    }

    private static func familiarBulletCommandsCreateAList() throws {
        let body = VoiceWritingTextComposer.body(from: [
            phrase("Three things matter.", 0, 1),
            phrase("Bullet point. Protect the source.", 1, 2),
            phrase("Bullet point keep the writing editable.", 2, 3),
            phrase("Bullet point make sharing simple.", 3, 4),
        ])
        try require(
            body == "Three things matter.\n\n• Protect the source.\n• keep the writing editable.\n• make sharing simple.",
            "A familiar bullet point command should create one compact list instead of entering command words."
        )
    }

    private static func exactCommandsCreateStructure() throws {
        let body = VoiceWritingTextComposer.body(from: [
            phrase("First idea.", 0, 1),
            phrase("new line", 1, 1.3),
            phrase("Supporting detail.", 1.3, 2),
            phrase("new paragraph", 2, 2.3),
            phrase("Second idea.", 2.3, 3),
        ])
        try require(
            body == "First idea.\nSupporting detail.\n\nSecond idea.",
            "Exact Apple dictation commands should create a line and paragraph without entering command words."
        )
    }

    private static func inlineCommandsSurviveRecognizerChunking() throws {
        let body = VoiceWritingTextComposer.body(from: [
            phrase("First point. New paragraph. Second point. New line Third detail.", 0, 5),
        ])
        try require(
            body == "First point.\n\nSecond point.\nThird detail.",
            "Sentence-boundary commands should work when SpeechTranscriber returns nearby prose in one result."
        )
    }

    private static func ordinaryProseIsNotMistakenForACommand() throws {
        let body = VoiceWritingTextComposer.body(from: [
            phrase("I need a new paragraph about courage before the conclusion.", 0, 4),
            phrase("I am heading to the library to research it.", 4, 6),
        ])
        try require(
            body == "I need a new paragraph about courage before the conclusion. I am heading to the library to research it.",
            "A dictation phrase inside an ordinary sentence must remain the author's words."
        )
    }

    private static func pausesStillCreateReadableParagraphs() throws {
        let body = VoiceWritingTextComposer.body(from: [
            phrase("Opening thought.", 0, 1),
            phrase("A later thought after reflection.", 3.4, 4.5),
        ])
        try require(
            body == "Opening thought.\n\nA later thought after reflection.",
            "A deliberate pause should continue to create a readable paragraph."
        )
    }

    private static func phrase(
        _ text: String,
        _ start: Double,
        _ end: Double
    ) -> VoiceWritingTimedPhrase {
        VoiceWritingTimedPhrase(text: text, startSeconds: start, endSeconds: end)
    }

    private static func require(
        _ condition: @autoclosure () -> Bool,
        _ message: String
    ) throws {
        guard condition() else {
            throw VoiceWritingTextComposerHarnessError.failed(message)
        }
    }
}
