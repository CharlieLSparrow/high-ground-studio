import Foundation

private enum VoiceWritingStructureEditorHarnessError: Error, CustomStringConvertible {
    case failed(String)

    var description: String {
        switch self {
        case .failed(let message): message
        }
    }
}

@main
private struct VoiceWritingStructureEditorHarness {
    static func main() throws {
        try selectedLinesBecomeBulletsWithoutLosingMarks()
        try listStylesReplaceAndToggleInsteadOfStacking()
        try numberingPreservesEmojiUtf16Marks()
        try paragraphAndQuoteKeepFormattingOnOriginalWords()
        try anEmptyLineCanStartAList()
        try headingsStayStructuralAndToggleCleanly()
        try listConversionRemovesIncompatibleHeadingStyle()
        try longWritingProducesProgressAndAnOutline()
        try outlineRangesStayCorrectAroundEmoji()
        try spokenContinuationLandsAfterTheCaretParagraph()
        try spokenContinuationAtTheEndKeepsTheExistingAppendContract()
        try existingWritingDecodesWithoutMigrationWork()
        print("PASS Voice writing structure and rich-text portability")
    }

    private static func selectedLinesBecomeBulletsWithoutLosingMarks() throws {
        let source = VoiceWritingRichText(
            text: "alpha\nbeta",
            marks: [.init(kind: .bold, startUtf16: 0, endUtf16: 5)]
        )
        let result = VoiceWritingStructureEditor.apply(
            .bulletedList,
            to: source,
            selection: NSRange(location: 0, length: (source.text as NSString).length)
        )

        try require(result.richText.text == "• alpha\n• beta", "Bullets should prefix every selected line.")
        try require(
            result.richText.marks == [.init(kind: .bold, startUtf16: 2, endUtf16: 7)],
            "A list prefix must shift rather than erase the selected words' bold mark."
        )
        try require(
            result.selectionUtf16 == NSRange(location: 0, length: 14),
            "The transformed list should remain selected for a follow-up style change."
        )
    }

    private static func listStylesReplaceAndToggleInsteadOfStacking() throws {
        let bullets = VoiceWritingRichText(text: "• alpha\n• beta")
        let checklist = VoiceWritingStructureEditor.apply(
            .checklist,
            to: bullets,
            selection: NSRange(location: 0, length: (bullets.text as NSString).length)
        )
        try require(
            checklist.richText.text == "☐ alpha\n☐ beta",
            "Changing list style should replace existing bullets instead of stacking symbols."
        )

        let plain = VoiceWritingStructureEditor.apply(
            .checklist,
            to: checklist.richText,
            selection: checklist.selectionUtf16
        )
        try require(
            plain.richText.text == "alpha\nbeta",
            "Applying the current list style again should toggle it off."
        )
    }

    private static func numberingPreservesEmojiUtf16Marks() throws {
        let source = VoiceWritingRichText(
            text: "😀 alpha\nbeta",
            marks: [.init(kind: .italic, startUtf16: 0, endUtf16: 2)]
        )
        let result = VoiceWritingStructureEditor.apply(
            .numberedList,
            to: source,
            selection: NSRange(location: 0, length: (source.text as NSString).length)
        )

        try require(result.richText.text == "1. 😀 alpha\n2. beta", "Numbering should be stable across multiple lines.")
        try require(
            result.richText.marks == [.init(kind: .italic, startUtf16: 3, endUtf16: 5)],
            "UTF-16 offsets must preserve formatting around non-BMP characters such as emoji."
        )
    }

    private static func paragraphAndQuoteKeepFormattingOnOriginalWords() throws {
        let source = VoiceWritingRichText(
            text: "first second",
            marks: [.init(kind: .underline, startUtf16: 6, endUtf16: 12)]
        )
        let paragraph = VoiceWritingStructureEditor.apply(
            .paragraph,
            to: source,
            selection: NSRange(location: 5, length: 0)
        )
        try require(paragraph.richText.text == "first\n\n second", "Paragraph should split at the caret.")
        try require(
            paragraph.richText.marks == [.init(kind: .underline, startUtf16: 8, endUtf16: 14)],
            "Paragraph insertion must preserve formatting after the caret."
        )

        let quotedSource = VoiceWritingRichText(
            text: "quoted",
            marks: [.init(kind: .bold, startUtf16: 0, endUtf16: 6)]
        )
        let quote = VoiceWritingStructureEditor.apply(
            .quote,
            to: quotedSource,
            selection: NSRange(location: 0, length: 6)
        )
        try require(quote.richText.text == "“quoted”", "Quote should wrap selected words.")
        try require(
            quote.richText.marks == [.init(kind: .bold, startUtf16: 1, endUtf16: 7)],
            "Quote punctuation should not accidentally inherit or erase word formatting."
        )
    }

    private static func anEmptyLineCanStartAList() throws {
        let result = VoiceWritingStructureEditor.apply(
            .checklist,
            to: VoiceWritingRichText(text: ""),
            selection: NSRange(location: 0, length: 0)
        )
        try require(result.richText.text == "☐ ", "Checklist should work in a brand-new document.")
        try require(
            result.selectionUtf16 == NSRange(location: 2, length: 0),
            "The caret should land after the inserted checklist marker."
        )
    }

    private static func headingsStayStructuralAndToggleCleanly() throws {
        let source = VoiceWritingRichText(text: "Opening\nContext")
        let heading = VoiceWritingStructureEditor.apply(
            .heading,
            to: source,
            selection: NSRange(location: 0, length: 7)
        )
        try require(
            heading.richText.text == source.text,
            "A heading should style the writing instead of adding markup characters to Homer's paper."
        )
        try require(
            heading.richText.structures == [
                .init(kind: .heading, startUtf16: 0, endUtf16: 7),
            ],
            "A heading should persist as a portable whole-line structure."
        )

        let subheading = VoiceWritingStructureEditor.apply(
            .subheading,
            to: heading.richText,
            selection: NSRange(location: 0, length: 7)
        )
        try require(
            subheading.richText.structures == [
                .init(kind: .subheading, startUtf16: 0, endUtf16: 7),
            ],
            "Choosing a different heading level should replace the current level instead of stacking styles."
        )

        let unchanged = VoiceWritingStructureEditor.apply(
            .subheading,
            to: subheading.richText,
            selection: NSRange(location: 0, length: 7)
        )
        try require(
            unchanged.richText.structures == subheading.richText.structures,
            "Choosing the active heading level again should be idempotent."
        )

        let plain = VoiceWritingStructureEditor.apply(
            .body,
            to: unchanged.richText,
            selection: NSRange(location: 0, length: 7)
        )
        try require(plain.richText.structures.isEmpty, "Choosing Body should return a heading to ordinary writing.")
    }

    private static func listConversionRemovesIncompatibleHeadingStyle() throws {
        let source = VoiceWritingRichText(
            text: "Heading\nBody",
            structures: [.init(kind: .heading, startUtf16: 0, endUtf16: 7)]
        )
        let result = VoiceWritingStructureEditor.apply(
            .bulletedList,
            to: source,
            selection: NSRange(location: 0, length: 7)
        )
        try require(
            result.richText.structures.isEmpty,
            "Turning a heading into a list should remove the incompatible heading style instead of retaining a malformed partial-line range."
        )
    }

    private static func longWritingProducesProgressAndAnOutline() throws {
        let body = (1...401).map { "word\($0)" }.joined(separator: " ")
        let text = "Introduction\n\(body)\nWhat this means\nClosing thought"
        let source = VoiceWritingRichText(
            text: text,
            structures: [
                .init(kind: .heading, startUtf16: 0, endUtf16: 12),
                .init(
                    kind: .subheading,
                    startUtf16: ("Introduction\n\(body)\n" as NSString).length,
                    endUtf16: ("Introduction\n\(body)\nWhat this means" as NSString).length
                ),
            ]
        )
        let insights = VoiceWritingDocumentInsights(source)

        try require(insights.wordCount == 407, "Progress should count the actual words in the writing.")
        try require(insights.estimatedReadingMinutes == 3, "Read time should round a partial minute up.")
        try require(
            insights.outline.map(\.title) == ["Introduction", "What this means"],
            "The outline should use the person's heading text in document order."
        )
        try require(
            insights.outline.map(\.kind) == [.heading, .subheading],
            "The outline should preserve heading hierarchy without another user-maintained model."
        )
    }

    private static func outlineRangesStayCorrectAroundEmoji() throws {
        let text = "😀 Opening\nBody\nNext section"
        let nextStart = ("😀 Opening\nBody\n" as NSString).length
        let source = VoiceWritingRichText(
            text: text,
            structures: [
                .init(kind: .heading, startUtf16: 0, endUtf16: ("😀 Opening" as NSString).length),
                .init(kind: .heading, startUtf16: nextStart, endUtf16: (text as NSString).length),
            ]
        )
        let outline = VoiceWritingDocumentInsights(source).outline

        try require(
            outline.map(\.title) == ["😀 Opening", "Next section"],
            "Outline extraction should use the same UTF-16 coordinate system as iOS and the web."
        )
        try require(
            outline.last?.rangeUtf16.location == nextStart,
            "A non-BMP character in an earlier heading must not shift a later jump target."
        )
    }

    private static func spokenContinuationLandsAfterTheCaretParagraph() throws {
        let text = "Opening story\n\nExisting middle\n\nClosing thought"
        let closingStart = ("Opening story\n\nExisting middle\n\n" as NSString).length
        let source = VoiceWritingRichText(
            text: text,
            marks: [
                .init(kind: .bold, startUtf16: closingStart, endUtf16: (text as NSString).length),
            ],
            structures: [
                .init(kind: .heading, startUtf16: 0, endUtf16: ("Opening story" as NSString).length),
                .init(kind: .subheading, startUtf16: closingStart, endUtf16: (text as NSString).length),
            ]
        )
        let spoken = VoiceWritingRichText(
            text: "A new idea from speech.",
            marks: [.init(kind: .italic, startUtf16: 2, endUtf16: 10)]
        )
        let result = source.insertingSpokenParagraph(spoken, afterUtf16: 4)

        try require(
            result.text == "Opening story\n\nA new idea from speech.\n\nExisting middle\n\nClosing thought",
            "Speech should become a paragraph immediately below the section containing the caret."
        )
        let delta = ("A new idea from speech.\n\n" as NSString).length
        try require(
            result.structures == [
                .init(kind: .heading, startUtf16: 0, endUtf16: 13),
                .init(kind: .subheading, startUtf16: closingStart + delta, endUtf16: (text as NSString).length + delta),
            ],
            "Headings after inserted speech should move with their original words."
        )
        try require(
            result.marks.contains(.init(kind: .italic, startUtf16: 17, endUtf16: 25)),
            "Formatting created by the speech composer should move into the inserted paragraph."
        )
        try require(
            result.marks.contains(.init(kind: .bold, startUtf16: closingStart + delta, endUtf16: (text as NSString).length + delta)),
            "Formatting after the insertion should remain attached to the same words."
        )
    }

    private static func spokenContinuationAtTheEndKeepsTheExistingAppendContract() throws {
        let source = VoiceWritingRichText(text: "Existing thought")
        let result = source.insertingSpokenParagraph(
            VoiceWritingRichText(text: "Continued by voice"),
            afterUtf16: (source.text as NSString).length
        )
        try require(
            result.text == "Existing thought\n\nContinued by voice",
            "Speech at the end should retain the familiar two-paragraph continuation."
        )
    }

    private static func existingWritingDecodesWithoutMigrationWork() throws {
        let legacy = #"{"schema":"quipsly-writing-runs-v1","text":"Existing note","marks":[]}"#
        let decoded = try JSONDecoder().decode(
            VoiceWritingRichText.self,
            from: Data(legacy.utf8)
        )
        try require(
            decoded == VoiceWritingRichText(text: "Existing note"),
            "Existing iPhone and Nest drafts should gain an empty structure list without a migration or user action."
        )
    }

    private static func require(
        _ condition: @autoclosure () -> Bool,
        _ message: String
    ) throws {
        guard condition() else {
            throw VoiceWritingStructureEditorHarnessError.failed(message)
        }
    }
}
