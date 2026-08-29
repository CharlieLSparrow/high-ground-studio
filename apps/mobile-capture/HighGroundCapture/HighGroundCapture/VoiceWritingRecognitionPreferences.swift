import Combine
import Foundation

enum VoiceWritingRecognitionProfile: String, Codable, Equatable, Sendable {
    case standard
    case speechAdaptation

    var adaptsToSpeech: Bool { self == .speechAdaptation }
}

struct VoiceWritingRecognitionSyncedPhrase: Equatable, Sendable {
    let text: String
    let count: Int
    let updatedAt: Date
}

/// A small, account-partitioned accessibility preference for finished voice
/// writing. The preference never changes or deletes source audio. Its local
/// projection is partitioned by Quipsly owner and synchronized independently,
/// so it follows that person without bleeding into another account or Nest.
@MainActor
final class VoiceWritingRecognitionPreferences: ObservableObject {
    static let shared = VoiceWritingRecognitionPreferences()

    @Published private(set) var activeProfile: VoiceWritingRecognitionProfile = .standard
    @Published private(set) var activeLearnedPhrases: [String] = []

    private let defaults: UserDefaults
    private let storageKey = "com.quipsly.capture.voiceWriting.recognitionProfiles.v1"
    private let vocabularyStorageKey = "com.quipsly.capture.voiceWriting.learnedPhrases.v1"
    private let maximumPhraseCount = 100

    private struct LearnedPhrase: Codable, Equatable {
        var text: String
        var count: Int
        var updatedAt: Date
    }

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        refresh()
    }

    var adaptsRecognitionToSpeech: Bool { activeProfile.adaptsToSpeech }

    func refresh(ownerAccountID: String? = AuthManager.currentStoredOwnerID()) {
        let owner = Self.normalizedOwnerID(ownerAccountID)
        activeProfile = profile(for: owner)
        activeLearnedPhrases = self.learnedPhrases(for: owner)
    }

    func setAdaptsRecognitionToSpeech(
        _ enabled: Bool,
        ownerAccountID: String? = AuthManager.currentStoredOwnerID()
    ) {
        guard let owner = Self.normalizedOwnerID(ownerAccountID) else {
            activeProfile = enabled ? .speechAdaptation : .standard
            return
        }
        var profiles = storedProfiles()
        let profile: VoiceWritingRecognitionProfile = enabled ? .speechAdaptation : .standard
        if profile == .standard {
            profiles.removeValue(forKey: owner)
        } else {
            profiles[owner] = profile.rawValue
        }
        persist(profiles)
        activeProfile = profile
        VoiceWritingRecognitionSyncClient.shared.enqueueAdaptation(
            enabled,
            ownerAccountID: owner
        )
    }

    func profile(for ownerAccountID: String?) -> VoiceWritingRecognitionProfile {
        guard let owner = Self.normalizedOwnerID(ownerAccountID),
              let rawValue = storedProfiles()[owner],
              let profile = VoiceWritingRecognitionProfile(rawValue: rawValue) else {
            return .standard
        }
        return profile
    }

    func learnedPhrases(for ownerAccountID: String?) -> [String] {
        guard let owner = Self.normalizedOwnerID(ownerAccountID) else { return [] }
        return (storedVocabulary()[owner] ?? [])
            .sorted(by: Self.phrasePriority)
            .prefix(maximumPhraseCount)
            .map(\.text)
    }

    /// Learns only the words or short phrases that a person actually inserted
    /// while correcting speech recognition. Ordinary transcript text is never
    /// harvested into the recognition context, which keeps adaptation useful
    /// without silently biasing it toward every sentence someone has written.
    func learnCorrection(
        from originalText: String,
        to correctedText: String,
        ownerAccountID: String? = AuthManager.currentStoredOwnerID()
    ) {
        guard let owner = Self.normalizedOwnerID(ownerAccountID) else { return }
        let phrases = Self.insertedPhrases(from: originalText, to: correctedText)
        guard !phrases.isEmpty else { return }

        var vocabulary = storedVocabulary()
        var records = vocabulary[owner] ?? []
        let now = Date()
        for phrase in phrases {
            if let index = records.firstIndex(where: {
                $0.text.compare(phrase, options: [.caseInsensitive, .diacriticInsensitive]) == .orderedSame
            }) {
                records[index].text = phrase
                records[index].count += 1
                records[index].updatedAt = now
            } else {
                records.append(LearnedPhrase(text: phrase, count: 1, updatedAt: now))
            }
        }
        vocabulary[owner] = Array(records.sorted(by: Self.phrasePriority).prefix(maximumPhraseCount))
        persistVocabulary(vocabulary)
        refreshActiveVocabularyIfNeeded(owner: owner)
        for phrase in phrases {
            VoiceWritingRecognitionSyncClient.shared.enqueueLearnedPhrase(
                phrase,
                weight: 1,
                ownerAccountID: owner
            )
        }
    }

    func addLearnedPhrase(
        _ value: String,
        ownerAccountID: String? = AuthManager.currentStoredOwnerID()
    ) {
        guard let owner = Self.normalizedOwnerID(ownerAccountID),
              let phrase = Self.normalizedPhrase(value) else { return }
        var vocabulary = storedVocabulary()
        var records = vocabulary[owner] ?? []
        let now = Date()
        if let index = records.firstIndex(where: {
            $0.text.compare(phrase, options: [.caseInsensitive, .diacriticInsensitive]) == .orderedSame
        }) {
            records[index].text = phrase
            records[index].count += 3
            records[index].updatedAt = now
        } else {
            records.append(LearnedPhrase(text: phrase, count: 3, updatedAt: now))
        }
        vocabulary[owner] = Array(records.sorted(by: Self.phrasePriority).prefix(maximumPhraseCount))
        persistVocabulary(vocabulary)
        refreshActiveVocabularyIfNeeded(owner: owner)
        VoiceWritingRecognitionSyncClient.shared.enqueueLearnedPhrase(
            phrase,
            weight: 3,
            ownerAccountID: owner
        )
    }

    func removeLearnedPhrase(
        _ value: String,
        ownerAccountID: String? = AuthManager.currentStoredOwnerID()
    ) {
        guard let owner = Self.normalizedOwnerID(ownerAccountID) else { return }
        var vocabulary = storedVocabulary()
        var records = vocabulary[owner] ?? []
        records.removeAll {
            $0.text.compare(value, options: [.caseInsensitive, .diacriticInsensitive]) == .orderedSame
        }
        if records.isEmpty {
            vocabulary.removeValue(forKey: owner)
        } else {
            vocabulary[owner] = records
        }
        persistVocabulary(vocabulary)
        refreshActiveVocabularyIfNeeded(owner: owner)
        VoiceWritingRecognitionSyncClient.shared.enqueueForgottenPhrase(
            value,
            ownerAccountID: owner
        )
    }

    /// Replaces the local account projection only after the outbox has drained.
    /// Recording and editing never wait for this reconciliation; the server
    /// copy simply lets the same person keep their speech help on another
    /// signed-in device.
    func applySyncedProfile(
        adaptationEnabled: Bool,
        learnedPhrases: [VoiceWritingRecognitionSyncedPhrase],
        ownerAccountID: String
    ) {
        guard let owner = Self.normalizedOwnerID(ownerAccountID) else { return }

        var profiles = storedProfiles()
        if adaptationEnabled {
            profiles[owner] = VoiceWritingRecognitionProfile.speechAdaptation.rawValue
        } else {
            profiles.removeValue(forKey: owner)
        }
        persist(profiles)

        var vocabulary = storedVocabulary()
        let records = learnedPhrases.prefix(maximumPhraseCount).compactMap { phrase -> LearnedPhrase? in
            guard let text = Self.normalizedPhrase(phrase.text) else { return nil }
            return LearnedPhrase(
                text: text,
                count: max(0, phrase.count),
                updatedAt: phrase.updatedAt
            )
        }
        if records.isEmpty {
            vocabulary.removeValue(forKey: owner)
        } else {
            vocabulary[owner] = records
        }
        persistVocabulary(vocabulary)

        guard owner == Self.normalizedOwnerID(AuthManager.currentStoredOwnerID()) else { return }
        activeProfile = adaptationEnabled ? .speechAdaptation : .standard
        activeLearnedPhrases = self.learnedPhrases(for: owner)
    }

    private func storedProfiles() -> [String: String] {
        guard let data = defaults.data(forKey: storageKey),
              let profiles = try? JSONDecoder().decode([String: String].self, from: data) else {
            return [:]
        }
        return profiles
    }

    private func persist(_ profiles: [String: String]) {
        guard let data = try? JSONEncoder().encode(profiles) else { return }
        defaults.set(data, forKey: storageKey)
    }

    private func storedVocabulary() -> [String: [LearnedPhrase]] {
        guard let data = defaults.data(forKey: vocabularyStorageKey),
              let vocabulary = try? JSONDecoder().decode([String: [LearnedPhrase]].self, from: data) else {
            return [:]
        }
        return vocabulary
    }

    private func persistVocabulary(_ vocabulary: [String: [LearnedPhrase]]) {
        guard let data = try? JSONEncoder().encode(vocabulary) else { return }
        defaults.set(data, forKey: vocabularyStorageKey)
    }

    private func refreshActiveVocabularyIfNeeded(owner: String) {
        guard owner == Self.normalizedOwnerID(AuthManager.currentStoredOwnerID()) else { return }
        activeLearnedPhrases = learnedPhrases(for: owner)
    }

    private static func phrasePriority(_ left: LearnedPhrase, _ right: LearnedPhrase) -> Bool {
        if left.count != right.count { return left.count > right.count }
        if left.updatedAt != right.updatedAt { return left.updatedAt > right.updatedAt }
        return left.text.localizedCaseInsensitiveCompare(right.text) == .orderedAscending
    }

    private static func insertedPhrases(from original: String, to corrected: String) -> [String] {
        let originalWords = words(in: original)
        let correctedWords = words(in: corrected)
        guard originalWords != correctedWords else { return [] }

        let insertions = correctedWords.difference(from: originalWords).compactMap {
            change -> (Int, String)? in
            guard case let .insert(offset, word, _) = change else { return nil }
            return (offset, word)
        }.sorted { $0.0 < $1.0 }

        var groups: [[String]] = []
        var active: [String] = []
        var previousOffset: Int?
        for (offset, word) in insertions {
            if let previousOffset, offset != previousOffset + 1, !active.isEmpty {
                groups.append(active)
                active = []
            }
            active.append(word)
            previousOffset = offset
        }
        if !active.isEmpty { groups.append(active) }

        var seen = Set<String>()
        return groups.flatMap { group -> [String] in
            // Recognition context works best with short, specific phrases.
            // Long rewrites are split into useful windows instead of teaching
            // the recognizer an entire paragraph.
            stride(from: 0, to: group.count, by: 4).compactMap { start in
                let phrase = group[start..<min(start + 4, group.count)].joined(separator: " ")
                return normalizedPhrase(phrase)
            }
        }.filter { phrase in
            let key = phrase.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
            return seen.insert(key).inserted
        }
    }

    private static func words(in text: String) -> [String] {
        text.split { character in
            !(character.isLetter || character.isNumber || character == "'" || character == "-")
        }.map(String.init)
    }

    private static func normalizedPhrase(_ value: String) -> String? {
        let phrase = value
            .split(whereSeparator: { $0.isWhitespace })
            .joined(separator: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard (2...80).contains(phrase.count),
              phrase.contains(where: { $0.isLetter }),
              phrase.split(separator: " ").count <= 8 else { return nil }
        return phrase
    }

    private static func normalizedOwnerID(_ value: String?) -> String? {
        let normalized = value?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
        return normalized.isEmpty ? nil : normalized
    }
}
