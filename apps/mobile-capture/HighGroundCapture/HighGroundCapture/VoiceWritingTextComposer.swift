import Foundation

struct VoiceWritingTimedPhrase: Equatable {
    let text: String
    let startSeconds: Double
    let endSeconds: Double
}

/// Turns immutable timed speech into an editable first draft. Speech timing
/// supplies sensible paragraph breaks. Apple's ordinary dictation phrases
/// ("new line" and "new paragraph") and the familiar "bullet point" phrase
/// remain useful even when the recognizer returns a command and nearby prose
/// in the same result.
enum VoiceWritingTextComposer {
    private enum SpokenPiece: Equatable {
        case text(String)
        case lineBreak
        case paragraphBreak
        case bulletPoint
    }

    private enum BreakKind {
        case line
        case paragraph
        case bullet
    }

    nonisolated static func body(from phrases: [VoiceWritingTimedPhrase]) -> String {
        var paragraphs: [String] = []
        var current = ""
        var previousEnd: Double?

        func flush() {
            let paragraph = current.trimmingCharacters(in: .whitespacesAndNewlines)
            if !paragraph.isEmpty { paragraphs.append(paragraph) }
            current = ""
        }

        func append(_ text: String) {
            guard !text.isEmpty else { return }
            if current.isEmpty || current.last == "\n" || current.last == " " {
                current += text
            } else {
                current += " \(text)"
            }
        }

        func startBullet() {
            let trimmed = current.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else {
                current = "• "
                return
            }
            let finalLine = trimmed.components(separatedBy: "\n").last ?? ""
            if finalLine.hasPrefix("• ") {
                current = trimmed + "\n• "
            } else {
                flush()
                current = "• "
            }
        }

        for phrase in phrases.sorted(by: phraseOrder) {
            let pieces = spokenPieces(in: phrase.text)
            guard !pieces.isEmpty else { continue }
            var consideredTimedPause = false

            for piece in pieces {
                switch piece {
                case .paragraphBreak:
                    flush()
                case .lineBreak:
                    let trimmed = current.trimmingCharacters(in: .whitespacesAndNewlines)
                    if !trimmed.isEmpty {
                        current = trimmed + "\n"
                    }
                case .bulletPoint:
                    startBullet()
                case .text(let text):
                    if !consideredTimedPause {
                        let pause = previousEnd.map { max(0, phrase.startSeconds - $0) } ?? 0
                        let endsSentence = current.last.map { ".!?".contains($0) } == true
                        let startsNewParagraph = !current.isEmpty && (
                            pause >= 2.2
                                || (pause >= 1.25 && current.count >= 180)
                                || (current.count >= 700 && endsSentence)
                        )
                        if startsNewParagraph { flush() }
                        consideredTimedPause = true
                    }
                    append(text)
                }
            }
            previousEnd = phrase.endSeconds
        }
        flush()
        return paragraphs.joined(separator: "\n\n")
    }

    nonisolated static func suggestedTitle(from body: String) -> String? {
        let firstParagraph = body
            .components(separatedBy: "\n")
            .first?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !firstParagraph.isEmpty else { return nil }
        let words = firstParagraph.split(whereSeparator: { $0.isWhitespace })
        guard words.count >= 3 else { return nil }
        let candidate = words.prefix(10).joined(separator: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines.union(.punctuationCharacters))
        guard candidate.count >= 8 else { return nil }
        return String(candidate.prefix(80))
    }

    nonisolated private static func spokenPieces(in rawValue: String) -> [SpokenPiece] {
        let value = normalized(rawValue)
        guard !value.isEmpty else { return [] }
        if let exact = breakKind(for: value) {
            return [piece(for: exact)]
        }

        let fullRange = NSRange(value.startIndex..<value.endIndex, in: value)
        let inlineCommandPattern = try! NSRegularExpression(
            pattern: #"\b(new paragraph|next paragraph|new line|bullet point)\b[.!?]?"#,
            options: [.caseInsensitive]
        )
        let matches = inlineCommandPattern.matches(in: value, range: fullRange)
        guard !matches.isEmpty else { return [.text(value)] }

        var pieces: [SpokenPiece] = []
        var cursor = value.startIndex
        for match in matches {
            guard let range = Range(match.range, in: value),
                  let commandRange = Range(match.range(at: 1), in: value),
                  commandMayStart(at: range.lowerBound, in: value),
                  let kind = breakKind(for: String(value[commandRange])) else { continue }

            let before = normalized(String(value[cursor..<range.lowerBound]))
            if !before.isEmpty { pieces.append(.text(before)) }
            pieces.append(piece(for: kind))
            cursor = range.upperBound
        }

        let remainder = normalized(String(value[cursor...]))
        if !remainder.isEmpty { pieces.append(.text(remainder)) }
        return pieces.isEmpty ? [.text(value)] : pieces
    }

    nonisolated private static func commandMayStart(
        at index: String.Index,
        in value: String
    ) -> Bool {
        guard index != value.startIndex else { return true }
        let prefix = value[..<index].trimmingCharacters(in: .whitespaces)
        return prefix.last.map { ".!?".contains($0) } == true
    }

    nonisolated private static func breakKind(for value: String) -> BreakKind? {
        let command = value.lowercased()
            .trimmingCharacters(in: .whitespacesAndNewlines.union(.punctuationCharacters))
        switch command {
        case "new line": return .line
        case "new paragraph", "next paragraph": return .paragraph
        case "bullet point": return .bullet
        default: return nil
        }
    }

    nonisolated private static func piece(for kind: BreakKind) -> SpokenPiece {
        switch kind {
        case .line: .lineBreak
        case .paragraph: .paragraphBreak
        case .bullet: .bulletPoint
        }
    }

    nonisolated private static func normalized(_ value: String) -> String {
        value.replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    nonisolated private static func phraseOrder(
        _ left: VoiceWritingTimedPhrase,
        _ right: VoiceWritingTimedPhrase
    ) -> Bool {
        if left.startSeconds == right.startSeconds { return left.endSeconds < right.endSeconds }
        return left.startSeconds < right.startSeconds
    }
}
