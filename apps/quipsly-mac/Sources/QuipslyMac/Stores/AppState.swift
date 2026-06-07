import Foundation

@MainActor
final class AppState: ObservableObject {
    @Published var selectedSection: AppSection? = .dashboard
    @Published var engineURL: String {
        didSet { defaults.set(engineURL, forKey: Keys.engineURL) }
    }
    @Published var nestURL: String {
        didSet { defaults.set(nestURL, forKey: Keys.nestURL) }
    }
    @Published var nestChatProjectSlug: String {
        didSet { defaults.set(nestChatProjectSlug, forKey: Keys.nestChatProjectSlug) }
    }
    @Published var editorProjectSlug: String {
        didSet { defaults.set(editorProjectSlug, forKey: Keys.editorProjectSlug) }
    }
    @Published var editorEpisodeSlug: String {
        didSet { defaults.set(editorEpisodeSlug, forKey: Keys.editorEpisodeSlug) }
    }
    @Published var homeNestSlug: String {
        didSet { defaults.set(homeNestSlug, forKey: Keys.homeNestSlug) }
    }
    @Published var lastNestSessionEmail: String {
        didSet { defaults.set(lastNestSessionEmail, forKey: Keys.lastNestSessionEmail) }
    }
    @Published var lastNestSessionCheckLabel: String {
        didSet { defaults.set(lastNestSessionCheckLabel, forKey: Keys.lastNestSessionCheckLabel) }
    }
    @Published var nestSessionToken: String {
        didSet { NestSessionTokenStore.save(nestSessionToken) }
    }
    @Published var nestSessionProfiles: [NestSessionProfile]
    @Published var activeNestSessionProfileEmail: String
    @Published var pendingNestNativeAuthState: String {
        didSet { defaults.set(pendingNestNativeAuthState, forKey: Keys.pendingNestNativeAuthState) }
    }
    @Published var showExperimentalModules: Bool {
        didSet { defaults.set(showExperimentalModules, forKey: Keys.showExperimentalModules) }
    }
    @Published var selectedDatasetPath = ""

    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        self.engineURL = defaults.string(forKey: Keys.engineURL) ?? "ws://localhost:4000"
        self.nestURL = defaults.string(forKey: Keys.nestURL) ?? "https://nest.quipsly.com/projects"
        self.nestChatProjectSlug = defaults.string(forKey: Keys.nestChatProjectSlug) ?? "high-ground-odyssey-manuscript"
        self.editorProjectSlug = defaults.string(forKey: Keys.editorProjectSlug) ?? "high-ground-odyssey-manuscript"
        self.editorEpisodeSlug = defaults.string(forKey: Keys.editorEpisodeSlug) ?? "episode-4"
        self.homeNestSlug = defaults.string(forKey: Keys.homeNestSlug) ?? "home-charlie-at-highgroundodyssey-com"
        self.lastNestSessionEmail = defaults.string(forKey: Keys.lastNestSessionEmail) ?? ""
        self.lastNestSessionCheckLabel = defaults.string(forKey: Keys.lastNestSessionCheckLabel) ?? "Never checked"
        self.nestSessionToken = NestSessionTokenStore.load()
        self.nestSessionProfiles = NestSessionTokenStore.profiles()
        self.activeNestSessionProfileEmail = NestSessionTokenStore.activeProfileEmail() ?? ""
        self.pendingNestNativeAuthState = defaults.string(forKey: Keys.pendingNestNativeAuthState) ?? ""
        self.showExperimentalModules = defaults.object(forKey: Keys.showExperimentalModules) as? Bool ?? true
    }

    func beginNestNativeAuthState() -> String {
        let state = "qmac_\(UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased())"
        pendingNestNativeAuthState = state
        return state
    }

    @discardableResult
    func handleNativeSessionCallback(_ url: URL) async -> Bool {
        guard let result = NestMacSessionCallback.parse(url) else {
            return false
        }

        selectedSection = .nestSession

        guard !pendingNestNativeAuthState.isEmpty, result.state == pendingNestNativeAuthState else {
            lastNestSessionCheckLabel = "Rejected callback \(Date.now.formatted(date: .abbreviated, time: .shortened))"
            return true
        }

        pendingNestNativeAuthState = ""

        do {
            let credentials = try await NestSessionExchangeClient.exchangeCode(
                nestBaseURL: nestURL,
                code: result.code,
                deviceLabel: deviceLabel
            )
            saveNestSession(credentials: credentials)
            lastNestSessionCheckLabel = "Connected \(Date.now.formatted(date: .abbreviated, time: .shortened))"
        } catch {
            lastNestSessionEmail = result.email
            lastNestSessionCheckLabel = "Exchange failed \(Date.now.formatted(date: .abbreviated, time: .shortened)): \(error.localizedDescription)"
        }

        return true
    }

    func saveNestSession(credentials: NestSessionCredentials) {
        if let profile = NestSessionTokenStore.saveProfile(credentials: credentials) {
            activeNestSessionProfileEmail = profile.email
            nestSessionProfiles = NestSessionTokenStore.profiles()
            nestSessionToken = credentials.accessToken
            lastNestSessionEmail = profile.email
            lastNestSessionCheckLabel = Date.now.formatted(date: .abbreviated, time: .shortened)
        } else {
            nestSessionToken = credentials.accessToken
        }
    }

    func saveNestSession(
        token: String,
        email: String,
        name: String? = nil,
        expiresAt: String? = nil,
        verifiedLabel: String = Date.now.formatted(date: .abbreviated, time: .shortened)
    ) {
        nestSessionToken = token
        lastNestSessionEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        lastNestSessionCheckLabel = verifiedLabel
    }

    func recordVerifiedNestSession(email: String, name: String? = nil) {
        let normalizedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !normalizedEmail.isEmpty else { return }

        NestSessionTokenStore.recordVerification(email: normalizedEmail, name: name)
        activeNestSessionProfileEmail = NestSessionTokenStore.activeProfileEmail() ?? activeNestSessionProfileEmail
        nestSessionProfiles = NestSessionTokenStore.profiles()
        lastNestSessionEmail = normalizedEmail
        lastNestSessionCheckLabel = Date.now.formatted(date: .abbreviated, time: .shortened)
    }

    @discardableResult
    func refreshActiveNestSessionIfNeeded(force: Bool = false) async -> Bool {
        if !force, NestSessionTokenStore.accessTokenLooksFresh(NestSessionTokenStore.activeProfile()) {
            nestSessionToken = NestSessionTokenStore.load()
            return true
        }

        guard let refreshToken = NestSessionTokenStore.activeRefreshToken(), !refreshToken.isEmpty else {
            return !nestSessionToken.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }

        do {
            let credentials = try await NestSessionExchangeClient.refresh(
                nestBaseURL: nestURL,
                refreshToken: refreshToken,
                deviceLabel: deviceLabel
            )
            saveNestSession(credentials: credentials)
            return true
        } catch {
            lastNestSessionCheckLabel = "Refresh failed \(Date.now.formatted(date: .abbreviated, time: .shortened)): \(error.localizedDescription)"
            return false
        }
    }

    @discardableResult
    func exchangeRecoveryCode(_ code: String) async -> Bool {
        let trimmedCode = code.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedCode.isEmpty else { return false }

        do {
            let credentials = try await NestSessionExchangeClient.exchangeCode(
                nestBaseURL: nestURL,
                code: trimmedCode,
                deviceLabel: deviceLabel
            )
            saveNestSession(credentials: credentials)
            return true
        } catch {
            lastNestSessionCheckLabel = "Recovery exchange failed \(Date.now.formatted(date: .abbreviated, time: .shortened)): \(error.localizedDescription)"
            return false
        }
    }

    @discardableResult
    func switchNestSessionProfile(email: String) -> Bool {
        guard let result = NestSessionTokenStore.switchActiveProfile(email: email) else {
            return false
        }

        nestSessionToken = result.token
        activeNestSessionProfileEmail = result.profile.email
        nestSessionProfiles = NestSessionTokenStore.profiles()
        lastNestSessionEmail = result.profile.email
        lastNestSessionCheckLabel = "Profile selected \(Date.now.formatted(date: .abbreviated, time: .shortened))"
        return true
    }

    func removeNestSessionProfile(email: String) {
        NestSessionTokenStore.removeProfile(email: email)
        nestSessionProfiles = NestSessionTokenStore.profiles()
        activeNestSessionProfileEmail = NestSessionTokenStore.activeProfileEmail() ?? ""
        nestSessionToken = NestSessionTokenStore.load()

        if let activeProfile = nestSessionProfiles.first(where: { $0.email == activeNestSessionProfileEmail }) {
            lastNestSessionEmail = activeProfile.email
            lastNestSessionCheckLabel = "Profile selected \(Date.now.formatted(date: .abbreviated, time: .shortened))"
        } else {
            lastNestSessionEmail = ""
            lastNestSessionCheckLabel = "Never checked"
        }
    }

    func clearActiveNestSession() {
        NestSessionTokenStore.clearActiveProfile()
        nestSessionProfiles = NestSessionTokenStore.profiles()
        activeNestSessionProfileEmail = NestSessionTokenStore.activeProfileEmail() ?? ""
        nestSessionToken = NestSessionTokenStore.load()
        lastNestSessionEmail = ""
        lastNestSessionCheckLabel = "Never checked"
    }

    func visibleSections(capabilities: LocalEngineCapabilities) -> [AppSection] {
        AppSection.allCases.filter { section in
            if section == .visionLab {
                return capabilities.visionLab || showExperimentalModules
            }

            return true
        }
    }

    private var deviceLabel: String {
        Host.current().localizedName ?? "Quipsly Mac"
    }
}

private enum Keys {
    static let engineURL = "quipslyMac.engineURL"
    static let nestURL = "quipslyMac.nestURL"
    static let nestChatProjectSlug = "quipslyMac.nestChatProjectSlug"
    static let editorProjectSlug = "quipslyMac.editorProjectSlug"
    static let editorEpisodeSlug = "quipslyMac.editorEpisodeSlug"
    static let homeNestSlug = "quipslyMac.homeNestSlug"
    static let lastNestSessionEmail = "quipslyMac.lastNestSessionEmail"
    static let lastNestSessionCheckLabel = "quipslyMac.lastNestSessionCheckLabel"
    static let pendingNestNativeAuthState = "quipslyMac.pendingNestNativeAuthState"
    static let showExperimentalModules = "quipslyMac.showExperimentalModules"
}
