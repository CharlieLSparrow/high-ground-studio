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
