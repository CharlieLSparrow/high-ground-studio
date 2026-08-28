import Combine
import Foundation

enum VoiceWritingRecognitionProfile: String, Codable, Equatable, Sendable {
    case standard
    case speechAdaptation

    var adaptsToSpeech: Bool { self == .speechAdaptation }
}

/// A small, account-partitioned accessibility preference for finished voice
/// writing. The preference never changes or deletes source audio, and it is not
/// sent to Nest. Keeping it per Quipsly owner prevents one person's recognition
/// choice from silently following another person who signs in on the same phone.
@MainActor
final class VoiceWritingRecognitionPreferences: ObservableObject {
    static let shared = VoiceWritingRecognitionPreferences()

    @Published private(set) var activeProfile: VoiceWritingRecognitionProfile = .standard

    private let defaults: UserDefaults
    private let storageKey = "com.quipsly.capture.voiceWriting.recognitionProfiles.v1"

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        refresh()
    }

    var adaptsRecognitionToSpeech: Bool { activeProfile.adaptsToSpeech }

    func refresh(ownerAccountID: String? = AuthManager.currentStoredOwnerID()) {
        let owner = Self.normalizedOwnerID(ownerAccountID)
        activeProfile = profile(for: owner)
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
    }

    func profile(for ownerAccountID: String?) -> VoiceWritingRecognitionProfile {
        guard let owner = Self.normalizedOwnerID(ownerAccountID),
              let rawValue = storedProfiles()[owner],
              let profile = VoiceWritingRecognitionProfile(rawValue: rawValue) else {
            return .standard
        }
        return profile
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

    private static func normalizedOwnerID(_ value: String?) -> String? {
        let normalized = value?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
        return normalized.isEmpty ? nil : normalized
    }
}
