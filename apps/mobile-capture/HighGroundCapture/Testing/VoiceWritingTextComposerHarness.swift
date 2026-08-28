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
        try ordinaryProseIsNotMistakenForACommand()
        try pausesStillCreateReadableParagraphs()
        print("PASS Voice writing speech structure composition")
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
        ])
        try require(
            body == "I need a new paragraph about courage before the conclusion.",
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
