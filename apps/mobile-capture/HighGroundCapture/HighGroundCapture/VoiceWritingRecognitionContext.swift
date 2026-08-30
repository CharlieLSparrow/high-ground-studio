import Foundation

/// Deliberate local context for speech recognition. Quipsly never feeds a
/// document body to the recognizer merely because it exists. A continuing
/// recording uses only the visible document title, Nest name, and explicit
/// tags, merged after phrases the person taught Quipsly themselves.
struct VoiceWritingRecognitionContext: Equatable, Sendable {
    let documentTitle: String?
    let nestName: String?
    let tagLabels: [String]

    var visiblePhrases: [String] {
        Self.mergedPhrases(
            learnedPhrases: [],
            sessionTitle: nil,
            context: self
        )
    }

    nonisolated static func mergedPhrases(
        learnedPhrases: [String],
        sessionTitle: String?,
        context: VoiceWritingRecognitionContext?,
        maximumCount: Int = 100
    ) -> [String] {
        guard maximumCount > 0 else { return [] }

        let candidates = learnedPhrases.flatMap(normalizedCandidates)
            + normalizedCandidates(context?.documentTitle)
            + normalizedCandidates(context?.nestName)
            + (context?.tagLabels ?? []).flatMap(normalizedCandidates)
            + normalizedCandidates(sessionTitle)

        var seen = Set<String>()
        var phrases: [String] = []
        for phrase in candidates where !isGeneric(phrase) {
            let key = phrase.folding(
                options: [.caseInsensitive, .diacriticInsensitive],
                locale: Locale(identifier: "en_US_POSIX")
            )
            guard seen.insert(key).inserted else { continue }
            phrases.append(phrase)
            if phrases.count == maximumCount { break }
        }
        return phrases
    }

    private nonisolated static func normalizedCandidates(_ value: String?) -> [String] {
        guard let value else { return [] }
        let clauses = value
            .components(separatedBy: CharacterSet(charactersIn: "\n,;:|"))
            .flatMap { clause -> [String] in
                let words = clause
                    .split(whereSeparator: \Character.isWhitespace)
                    .map(String.init)
                guard !words.isEmpty else { return [] }
                if words.count <= 8 { return [words.joined(separator: " ")] }
                return stride(from: 0, to: words.count, by: 4).map { start in
                    words[start..<min(start + 4, words.count)].joined(separator: " ")
                }
            }

        return clauses.compactMap { phrase in
            let normalized = phrase.trimmingCharacters(in: .whitespacesAndNewlines)
            guard (2...80).contains(normalized.count),
                  normalized.contains(where: \Character.isLetter) else { return nil }
            return normalized
        }
    }

    private nonisolated static func isGeneric(_ phrase: String) -> Bool {
        let normalized = phrase
            .folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
            .lowercased()
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if [
            "untitled",
            "my nest",
            "voice note",
            "speak to write",
            "coaching session",
            "podcast session",
            "recording",
        ].contains(normalized) {
            return true
        }
        return normalized.hasPrefix("voice note ·")
            || normalized.hasPrefix("speak to write ·")
    }
}
