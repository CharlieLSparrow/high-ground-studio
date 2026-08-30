import Foundation

private enum VoiceWritingRecognitionContextHarnessError: Error, CustomStringConvertible {
    case failed(String)

    var description: String {
        switch self {
        case .failed(let message): message
        }
    }
}

@main
private struct VoiceWritingRecognitionContextHarness {
    static func main() throws {
        try learnedCorrectionsStayFirst()
        try documentContextAddsNoBodyText()
        try genericCaptureTitlesDoNotBiasRecognition()
        try duplicatesCollapseWithoutLosingPreferredSpelling()
        try longTitlesBecomeBoundedPhrases()
        try maximumCountIsEnforced()
        print("PASS Voice writing recognition context")
    }

    private static func learnedCorrectionsStayFirst() throws {
        let phrases = VoiceWritingRecognitionContext.mergedPhrases(
            learnedPhrases: ["Homer Sparrow", "Parkinson's"],
            sessionTitle: "Dissertation reflection",
            context: .init(
                documentTitle: "Coaching identity paper",
                nestName: "Doctoral work",
                tagLabels: ["Leadership"]
            )
        )
        try require(
            Array(phrases.prefix(2)) == ["Homer Sparrow", "Parkinson's"],
            "Words the person taught Quipsly must outrank inferred document context."
        )
    }

    private static func documentContextAddsNoBodyText() throws {
        let context = VoiceWritingRecognitionContext(
            documentTitle: "Moral injury and leadership",
            nestName: "Doctoral work",
            tagLabels: ["Veteran identity", "Transformational learning"]
        )
        try require(
            context.visiblePhrases == [
                "Moral injury and leadership",
                "Doctoral work",
                "Veteran identity",
                "Transformational learning",
            ],
            "Only explicit document metadata should become automatic context."
        )
    }

    private static func genericCaptureTitlesDoNotBiasRecognition() throws {
        let phrases = VoiceWritingRecognitionContext.mergedPhrases(
            learnedPhrases: [],
            sessionTitle: "Speak to write · August 29",
            context: .init(documentTitle: "Untitled", nestName: "My Nest", tagLabels: [])
        )
        try require(phrases.isEmpty, "Generic UI labels must not become speech-recognition hints.")
    }

    private static func duplicatesCollapseWithoutLosingPreferredSpelling() throws {
        let phrases = VoiceWritingRecognitionContext.mergedPhrases(
            learnedPhrases: ["Quipsly"],
            sessionTitle: "QUIPSLY",
            context: .init(documentTitle: "quipsly", nestName: nil, tagLabels: ["Quipsly"])
        )
        try require(phrases == ["Quipsly"], "A learned spelling should win case-insensitive deduplication.")
    }

    private static func longTitlesBecomeBoundedPhrases() throws {
        let phrases = VoiceWritingRecognitionContext.mergedPhrases(
            learnedPhrases: [],
            sessionTitle: nil,
            context: .init(
                documentTitle: "How veterans transform moral injury into service through reflective coaching practice",
                nestName: nil,
                tagLabels: []
            )
        )
        try require(!phrases.isEmpty, "A meaningful long title should still supply context.")
        try require(
            phrases.allSatisfy { $0.split(separator: " ").count <= 4 },
            "Long metadata should be split into compact recognition phrases."
        )
    }

    private static func maximumCountIsEnforced() throws {
        let learned = (1...120).map { "Term \($0)" }
        let phrases = VoiceWritingRecognitionContext.mergedPhrases(
            learnedPhrases: learned,
            sessionTitle: "A specific session",
            context: nil,
            maximumCount: 100
        )
        try require(phrases.count == 100, "Recognition context must keep a deterministic upper bound.")
        try require(phrases.last == "Term 100", "The highest-priority learned phrases should survive the cap.")
    }

    private static func require(
        _ condition: @autoclosure () -> Bool,
        _ message: String
    ) throws {
        guard condition() else {
            throw VoiceWritingRecognitionContextHarnessError.failed(message)
        }
    }
}
