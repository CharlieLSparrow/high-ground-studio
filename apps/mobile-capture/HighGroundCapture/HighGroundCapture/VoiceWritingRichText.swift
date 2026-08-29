import Foundation

enum VoiceWritingMarkKind: String, Codable, CaseIterable {
    case bold
    case italic
    case underline
    case strikethrough
}

struct VoiceWritingTextMark: Codable, Equatable {
    let kind: VoiceWritingMarkKind
    let startUtf16: Int
    let endUtf16: Int
}

enum VoiceWritingBlockKind: String, Codable, CaseIterable {
    case heading
    case subheading
}

struct VoiceWritingBlockStyle: Codable, Equatable {
    let kind: VoiceWritingBlockKind
    let startUtf16: Int
    let endUtf16: Int
}

struct VoiceWritingOutlineEntry: Identifiable, Equatable {
    let kind: VoiceWritingBlockKind
    let title: String
    let rangeUtf16: NSRange

    var id: String {
        "\(kind.rawValue):\(rangeUtf16.location):\(rangeUtf16.length)"
    }
}

/// A small, deterministic document map shared by the native writing surfaces.
/// It derives orientation from the writing itself, so a long paper gains useful
/// progress and navigation without introducing a second outline document for a
/// person to maintain.
struct VoiceWritingDocumentInsights: Equatable {
    let wordCount: Int
    let estimatedReadingMinutes: Int
    let outline: [VoiceWritingOutlineEntry]

    nonisolated init(_ source: VoiceWritingRichText) {
        wordCount = source.text.split(whereSeparator: \Character.isWhitespace).count
        estimatedReadingMinutes = wordCount == 0 ? 0 : max(1, Int(ceil(Double(wordCount) / 200.0)))

        let text = source.text as NSString
        outline = source.structures.compactMap { structure in
            let range = NSRange(
                location: structure.startUtf16,
                length: structure.endUtf16 - structure.startUtf16
            )
            guard range.location >= 0,
                  range.length > 0,
                  NSMaxRange(range) <= text.length else { return nil }
            let title = text.substring(with: range)
                .trimmingCharacters(in: .whitespacesAndNewlines)
            guard !title.isEmpty else { return nil }
            return VoiceWritingOutlineEntry(
                kind: structure.kind,
                title: title,
                rangeUtf16: range
            )
        }
    }
}

/// Cross-platform rich writing that stays independent of Apple's private
/// attributed-string encoding. UTF-16 offsets agree with both NSString and
/// JavaScript, while `text` remains the searchable Studio block projection.
struct VoiceWritingRichText: Codable, Equatable {
    let schema: String
    let text: String
    let marks: [VoiceWritingTextMark]
    let structures: [VoiceWritingBlockStyle]

    nonisolated init(
        text: String,
        marks: [VoiceWritingTextMark] = [],
        structures: [VoiceWritingBlockStyle] = []
    ) {
        schema = "quipsly-writing-runs-v1"
        self.text = text
        let limit = text.utf16.count
        var seen = Set<String>()
        let sorted = marks
            .filter { $0.startUtf16 >= 0 && $0.endUtf16 > $0.startUtf16 && $0.endUtf16 <= limit }
            .filter { seen.insert("\($0.kind.rawValue):\($0.startUtf16):\($0.endUtf16)").inserted }
            .sorted {
                $0.startUtf16 != $1.startUtf16 ? $0.startUtf16 < $1.startUtf16
                    : ($0.endUtf16 != $1.endUtf16 ? $0.endUtf16 < $1.endUtf16 : $0.kind.rawValue < $1.kind.rawValue)
            }
        var merged: [VoiceWritingTextMark] = []
        for kind in VoiceWritingMarkKind.allCases {
            for mark in sorted where mark.kind == kind {
                if let lastIndex = merged.indices.last,
                   merged[lastIndex].kind == mark.kind,
                   mark.startUtf16 <= merged[lastIndex].endUtf16 {
                    let last = merged[lastIndex]
                    merged[lastIndex] = VoiceWritingTextMark(
                        kind: mark.kind,
                        startUtf16: last.startUtf16,
                        endUtf16: max(last.endUtf16, mark.endUtf16)
                    )
                } else {
                    merged.append(mark)
                }
            }
        }
        self.marks = merged.sorted {
            $0.startUtf16 != $1.startUtf16 ? $0.startUtf16 < $1.startUtf16
                : ($0.endUtf16 != $1.endUtf16 ? $0.endUtf16 < $1.endUtf16 : $0.kind.rawValue < $1.kind.rawValue)
        }
        var structureIdentities = Set<String>()
        self.structures = structures
            .filter {
                $0.startUtf16 >= 0
                    && $0.endUtf16 > $0.startUtf16
                    && $0.endUtf16 <= limit
                    && Self.isWholeLine($0, in: text)
            }
            .filter {
                structureIdentities.insert("\($0.startUtf16):\($0.endUtf16)").inserted
            }
            .sorted {
                $0.startUtf16 != $1.startUtf16 ? $0.startUtf16 < $1.startUtf16
                    : ($0.endUtf16 != $1.endUtf16 ? $0.endUtf16 < $1.endUtf16 : $0.kind.rawValue < $1.kind.rawValue)
            }
    }

    private enum CodingKeys: String, CodingKey {
        case schema
        case text
        case marks
        case structures
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let schema = try container.decode(String.self, forKey: .schema)
        guard schema == "quipsly-writing-runs-v1" else {
            throw DecodingError.dataCorruptedError(
                forKey: .schema,
                in: container,
                debugDescription: "Unsupported Quipsly writing format."
            )
        }
        let text = try container.decode(String.self, forKey: .text)
        self.init(
            text: text,
            marks: try container.decodeIfPresent([VoiceWritingTextMark].self, forKey: .marks) ?? [],
            structures: try container.decodeIfPresent([VoiceWritingBlockStyle].self, forKey: .structures) ?? []
        )
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(schema, forKey: .schema)
        try container.encode(text, forKey: .text)
        try container.encode(marks, forKey: .marks)
        try container.encode(structures, forKey: .structures)
    }

    func appending(_ addition: String) -> VoiceWritingRichText {
        appending(VoiceWritingRichText(text: addition))
    }

    func appending(_ addition: VoiceWritingRichText) -> VoiceWritingRichText {
        let base = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let suffix = addition.text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !suffix.isEmpty else { return self }
        let separator = base.isEmpty ? "" : "\n\n"
        let offset = base.utf16.count + separator.utf16.count
        return VoiceWritingRichText(
            text: "\(base)\(separator)\(suffix)",
            marks: marks + addition.marks.map {
                VoiceWritingTextMark(
                    kind: $0.kind,
                    startUtf16: $0.startUtf16 + offset,
                    endUtf16: $0.endUtf16 + offset
                )
            },
            structures: structures + addition.structures.map {
                VoiceWritingBlockStyle(
                    kind: $0.kind,
                    startUtf16: $0.startUtf16 + offset,
                    endUtf16: $0.endUtf16 + offset
                )
            }
        )
    }

    nonisolated private static func isWholeLine(_ structure: VoiceWritingBlockStyle, in text: String) -> Bool {
        let source = text as NSString
        let beginsLine = structure.startUtf16 == 0
            || source.substring(with: NSRange(location: structure.startUtf16 - 1, length: 1)) == "\n"
        let endsLine = structure.endUtf16 == source.length
            || source.substring(with: NSRange(location: structure.endUtf16, length: 1)) == "\n"
        return beginsLine && endsLine
    }
}

enum VoiceWritingStructureKind: Equatable {
    case heading
    case subheading
    case body
    case paragraph
    case bulletedList
    case numberedList
    case checklist
    case quote
}

struct VoiceWritingStructureEditResult: Equatable {
    let richText: VoiceWritingRichText
    let selectionUtf16: NSRange
}

/// Applies familiar writing structure without introducing an Apple-only
/// document format. List prefixes remain readable plain text on every client,
/// while existing rich-text marks are shifted around the edit rather than lost.
enum VoiceWritingStructureEditor {
    static func apply(
        _ kind: VoiceWritingStructureKind,
        to source: VoiceWritingRichText,
        selection proposedSelection: NSRange
    ) -> VoiceWritingStructureEditResult {
        let text = source.text as NSString
        let selection = safe(proposedSelection, in: text)

        switch kind {
        case .heading, .subheading:
            return applyHeading(kind, to: source, selection: selection)
        case .body:
            return applyBody(to: source, selection: selection)
        case .paragraph:
            let insertionPoint = NSMaxRange(selection)
            return applying(
                edits: [.init(range: NSRange(location: insertionPoint, length: 0), replacement: "\n\n")],
                to: source,
                selection: NSRange(location: insertionPoint + 2, length: 0)
            )
        case .quote:
            if selection.length == 0 {
                return applying(
                    edits: [.init(range: selection, replacement: "“”")],
                    to: source,
                    selection: NSRange(location: selection.location + 1, length: 0)
                )
            }
            return applying(
                edits: [
                    .init(range: NSRange(location: selection.location, length: 0), replacement: "“"),
                    .init(range: NSRange(location: NSMaxRange(selection), length: 0), replacement: "”"),
                ],
                to: source,
                selection: NSRange(location: selection.location, length: selection.length + 2)
            )
        case .bulletedList, .numberedList, .checklist:
            return applyList(kind, to: source, selection: selection)
        }
    }

    private static func applyHeading(
        _ kind: VoiceWritingStructureKind,
        to source: VoiceWritingRichText,
        selection: NSRange
    ) -> VoiceWritingStructureEditResult {
        let text = source.text as NSString
        let target = text.lineRange(for: selection)
        let targetLines = lines(in: target, source: text).filter { !$0.isEmpty }
        guard !targetLines.isEmpty else {
            return .init(richText: source, selectionUtf16: selection)
        }
        let desired: VoiceWritingBlockKind = kind == .heading ? .heading : .subheading
        let targetRanges = targetLines.map {
            NSRange(location: $0.start, length: $0.contentEnd - $0.start)
        }
        var structures = source.structures.filter { structure in
            !targetRanges.contains { range in
                structure.startUtf16 < NSMaxRange(range)
                    && structure.endUtf16 > range.location
            }
        }
        structures += targetRanges.map {
            VoiceWritingBlockStyle(
                kind: desired,
                startUtf16: $0.location,
                endUtf16: NSMaxRange($0)
            )
        }
        return .init(
            richText: VoiceWritingRichText(
                text: source.text,
                marks: source.marks,
                structures: structures
            ),
            selectionUtf16: selection
        )
    }

    private static func applyBody(
        to source: VoiceWritingRichText,
        selection: NSRange
    ) -> VoiceWritingStructureEditResult {
        let text = source.text as NSString
        let target = text.lineRange(for: selection)
        let targetRanges = lines(in: target, source: text)
            .filter { !$0.isEmpty }
            .map { NSRange(location: $0.start, length: $0.contentEnd - $0.start) }
        let structures = source.structures.filter { structure in
            !targetRanges.contains { range in
                structure.startUtf16 < NSMaxRange(range)
                    && structure.endUtf16 > range.location
            }
        }
        return .init(
            richText: VoiceWritingRichText(
                text: source.text,
                marks: source.marks,
                structures: structures
            ),
            selectionUtf16: selection
        )
    }

    private struct TextEdit {
        let range: NSRange
        let replacement: String

        var replacementLength: Int { (replacement as NSString).length }
        var delta: Int { replacementLength - range.length }
    }

    private struct Line {
        let start: Int
        let contentEnd: Int
        let existingPrefix: ExistingPrefix?

        var isEmpty: Bool { start == contentEnd }
    }

    private enum ExistingPrefixKind: Equatable {
        case bullet
        case numbered
        case checklist
    }

    private struct ExistingPrefix {
        let kind: ExistingPrefixKind
        let length: Int
    }

    private static func applyList(
        _ kind: VoiceWritingStructureKind,
        to source: VoiceWritingRichText,
        selection: NSRange
    ) -> VoiceWritingStructureEditResult {
        let text = source.text as NSString
        let target = text.lineRange(for: selection)
        var lines = lines(in: target, source: text)
        if lines.isEmpty {
            lines = [.init(start: selection.location, contentEnd: selection.location, existingPrefix: nil)]
        }

        let desiredKind: ExistingPrefixKind = switch kind {
        case .bulletedList: .bullet
        case .numberedList: .numbered
        case .checklist: .checklist
        default: preconditionFailure("Only list structures reach applyList")
        }
        let contentLines = lines.filter { !$0.isEmpty }
        let togglesOff = !contentLines.isEmpty
            && contentLines.allSatisfy { $0.existingPrefix?.kind == desiredKind }

        var nextNumber = 1
        var edits: [TextEdit] = []
        for line in lines {
            guard !line.isEmpty || lines.count == 1 else { continue }
            let prefix: String
            switch kind {
            case .bulletedList: prefix = "• "
            case .numberedList:
                prefix = "\(nextNumber). "
                nextNumber += 1
            case .checklist: prefix = "☐ "
            default: preconditionFailure("Only list structures reach applyList")
            }
            let existingLength = line.existingPrefix?.length ?? 0
            edits.append(.init(
                range: NSRange(location: line.start, length: existingLength),
                replacement: togglesOff ? "" : prefix
            ))
        }

        let sortedEdits = edits.sorted { $0.range.location < $1.range.location }
        let nextSelection: NSRange
        if selection.length == 0 {
            nextSelection = NSRange(
                location: mapAfter(selection.location, through: sortedEdits),
                length: 0
            )
        } else {
            let start = mapBefore(target.location, through: sortedEdits)
            let end = mapAfter(NSMaxRange(target), through: sortedEdits)
            nextSelection = NSRange(location: start, length: max(0, end - start))
        }
        return applying(edits: sortedEdits, to: source, selection: nextSelection)
    }

    private static func lines(in target: NSRange, source: NSString) -> [Line] {
        guard source.length > 0 else { return [] }
        let targetStart = min(target.location, source.length)
        let targetEnd = min(max(targetStart, NSMaxRange(target)), source.length)
        var cursor = targetStart
        var result: [Line] = []

        repeat {
            var lineStart = 0
            var lineEnd = 0
            var contentEnd = 0
            source.getLineStart(
                &lineStart,
                end: &lineEnd,
                contentsEnd: &contentEnd,
                for: NSRange(location: min(cursor, max(0, source.length - 1)), length: 0)
            )
            result.append(.init(
                start: lineStart,
                contentEnd: contentEnd,
                existingPrefix: existingPrefix(in: source, lineStart: lineStart, contentEnd: contentEnd)
            ))
            guard lineEnd > cursor, lineEnd < targetEnd else { break }
            cursor = lineEnd
        } while cursor < targetEnd

        return result
    }

    private static func existingPrefix(
        in source: NSString,
        lineStart: Int,
        contentEnd: Int
    ) -> ExistingPrefix? {
        let length = contentEnd - lineStart
        guard length >= 2 else { return nil }
        let line = source.substring(with: NSRange(location: lineStart, length: length)) as NSString
        if line.hasPrefix("• ") {
            return .init(kind: .bullet, length: 2)
        }
        if line.hasPrefix("☐ ") || line.hasPrefix("☑ ") {
            return .init(kind: .checklist, length: 2)
        }
        var digitCount = 0
        while digitCount < line.length {
            let scalar = line.character(at: digitCount)
            guard scalar >= 48, scalar <= 57 else { break }
            digitCount += 1
        }
        if digitCount > 0,
           line.length >= digitCount + 2,
           line.character(at: digitCount) == 46,
           line.character(at: digitCount + 1) == 32 {
            return .init(kind: .numbered, length: digitCount + 2)
        }
        return nil
    }

    private static func applying(
        edits unsortedEdits: [TextEdit],
        to source: VoiceWritingRichText,
        selection: NSRange
    ) -> VoiceWritingStructureEditResult {
        let edits = unsortedEdits.sorted { $0.range.location < $1.range.location }
        let mutable = NSMutableString(string: source.text)
        for edit in edits.reversed() {
            mutable.replaceCharacters(in: edit.range, with: edit.replacement)
        }

        let shiftedMarks = source.marks.compactMap { mark -> VoiceWritingTextMark? in
            let start = mapAfter(mark.startUtf16, through: edits)
            let end = mapBefore(mark.endUtf16, through: edits)
            guard end > start else { return nil }
            return .init(kind: mark.kind, startUtf16: start, endUtf16: end)
        }
        let shiftedStructures = source.structures.compactMap { structure -> VoiceWritingBlockStyle? in
            let start = mapAfter(structure.startUtf16, through: edits)
            let end = mapBefore(structure.endUtf16, through: edits)
            guard end > start else { return nil }
            return .init(kind: structure.kind, startUtf16: start, endUtf16: end)
        }
        let richText = VoiceWritingRichText(
            text: mutable as String,
            marks: shiftedMarks,
            structures: shiftedStructures
        )
        return .init(
            richText: richText,
            selectionUtf16: safe(selection, in: richText.text as NSString)
        )
    }

    private static func mapBefore(_ position: Int, through edits: [TextEdit]) -> Int {
        var shift = 0
        for edit in edits {
            let start = edit.range.location
            let end = NSMaxRange(edit.range)
            if edit.range.length == 0 {
                if position > start { shift += edit.replacementLength }
            } else if position >= end {
                shift += edit.delta
            } else if position > start {
                return start + shift
            }
        }
        return position + shift
    }

    private static func mapAfter(_ position: Int, through edits: [TextEdit]) -> Int {
        var shift = 0
        for edit in edits {
            let start = edit.range.location
            let end = NSMaxRange(edit.range)
            if edit.range.length == 0 {
                if position >= start { shift += edit.replacementLength }
            } else if position >= end {
                shift += edit.delta
            } else if position >= start {
                return start + shift + edit.replacementLength
            }
        }
        return position + shift
    }

    private static func safe(_ range: NSRange, in text: NSString) -> NSRange {
        let location = min(max(0, range.location == NSNotFound ? text.length : range.location), text.length)
        let length = min(max(0, range.length), text.length - location)
        return NSRange(location: location, length: length)
    }
}
