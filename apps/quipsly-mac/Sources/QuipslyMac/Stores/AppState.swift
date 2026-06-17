import Foundation
import SwiftUI

@MainActor
final class AppState: ObservableObject {
    @Published var selectedSection: AppSection? {
        didSet { defaults.set(selectedSection?.rawValue ?? "", forKey: Keys.selectedSection) }
    }
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
    @Published var pendingMacCallbackDiagnosticState = ""
    @Published var lastMacCallbackDiagnosticLabel = "Not tested yet."
    @Published var shouldOpenVisionLabWorkbench = false
    @Published var showExperimentalModules: Bool {
        didSet { defaults.set(showExperimentalModules, forKey: Keys.showExperimentalModules) }
    }
    @Published var visionLabWorkbenchRequestID = UUID()
    @Published var selectedDatasetPath = ""

    @AppStorage(Keys.mediaWorkspacePath)
    var mediaWorkspacePath: String = QuipslyMediaWorkspace.defaultRootURL.path

    @AppStorage(Keys.smokeEpisodeEditorSnapshotPath)
    var smokeEpisodeEditorSnapshotPath: String = ""

    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        self.selectedSection = AppSection(rawValue: defaults.string(forKey: Keys.selectedSection) ?? "") ?? .dashboard
        self.engineURL = defaults.string(forKey: Keys.engineURL) ?? "ws://localhost:4000"
        self.nestURL = AppState.normalizedNestBaseURL(defaults.string(forKey: Keys.nestURL) ?? "https://nest.quipsly.com")
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

    func normalizeEditorRoute() {
        let project = editorProjectSlug.trimmingCharacters(in: .whitespacesAndNewlines)
        let episode = editorEpisodeSlug.trimmingCharacters(in: .whitespacesAndNewlines)
        editorProjectSlug = project.isEmpty ? Defaults.editorProjectSlug : project
        editorEpisodeSlug = episode.isEmpty ? Defaults.editorEpisodeSlug : episode
    }

    func applySmokeEditorRouteIfNeeded() {
        let project = defaults.string(forKey: Keys.smokeEpisodeEditorProjectSlug)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let episode = defaults.string(forKey: Keys.smokeEpisodeEditorEpisodeSlug)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

        var changed = false
        if !project.isEmpty, project != editorProjectSlug {
            editorProjectSlug = project
            changed = true
        }
        if !episode.isEmpty, episode != editorEpisodeSlug {
            editorEpisodeSlug = episode
            changed = true
        }

        if changed {
            normalizeEditorRoute()
        }
    }

    func beginNestNativeAuthState() -> String {
        let state = "qmac_\(UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased())"
        pendingNestNativeAuthState = state
        return state
    }

    @discardableResult
    func beginMacCallbackDiagnosticState() -> String {
        let state = "qdiag_\(UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased())"
        pendingMacCallbackDiagnosticState = state
        lastMacCallbackDiagnosticLabel = "Waiting for macOS to route a diagnostic callback..."
        return state
    }

    func handleIncomingQuipslyURL(_ url: URL) async -> Bool {
        guard url.scheme?.lowercased() == "quipslymac" else {
            return false
        }

        if handleMacCallbackDiagnosticURL(url) {
            selectedSection = .nestSession
            return true
        }

        return await handleNativeSessionCallback(url)
    }

    @discardableResult
    func handleNativeSessionCallback(_ url: URL) async -> Bool {
        guard let result = NestMacSessionCallback.parse(url) else {
            if url.scheme?.lowercased() == "quipslymac" {
                lastMacCallbackDiagnosticLabel = "Quipsly Mac received a URL, but it was not a usable session callback."
            }
            return false
        }

        selectedSection = .nestSession
        return await handleNativeAuthResult(result)
    }

    @discardableResult
    func handleNativeAuthResult(_ result: NestNativeAuthResult) async -> Bool {
        guard !pendingNestNativeAuthState.isEmpty, result.state == pendingNestNativeAuthState else {
            lastNestSessionCheckLabel = "Rejected callback \(Date.now.formatted(date: .abbreviated, time: .shortened))"
            return false
        }

        pendingNestNativeAuthState = ""

        do {
            let credentials = try await NestSessionExchangeClient.exchangeCode(
                nestBaseURL: nestURL,
                code: result.code,
                deviceLabel: deviceLabel
            )
            saveNestSession(credentials: credentials)
            lastMacCallbackDiagnosticLabel = "Received browser callback and exchanged the one-time code."
            lastNestSessionCheckLabel = "Connected \(Date.now.formatted(date: .abbreviated, time: .shortened))"
            return true
        } catch {
            lastNestSessionEmail = result.email
            lastNestSessionCheckLabel = "Exchange failed \(Date.now.formatted(date: .abbreviated, time: .shortened)): \(error.localizedDescription)"
            return false
        }
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

    func recordVerifiedNestSession(email: String, label: String? = nil) {
        let normalizedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !normalizedEmail.isEmpty else { return }

        NestSessionTokenStore.recordVerification(email: normalizedEmail, name: label)
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
            nestSessionToken = ""
            lastNestSessionCheckLabel = "Refresh needed \(Date.now.formatted(date: .abbreviated, time: .shortened)): sign in again."
            return false
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
            if
                let sessionError = error as? NestSessionExchangeError,
                ["invalid-refresh-token", "refresh-token-expired"].contains(sessionError.serverCode ?? "")
            {
                let staleEmail = activeNestSessionProfileEmail
                if !staleEmail.isEmpty {
                    NestSessionTokenStore.removeProfile(email: staleEmail)
                }
                nestSessionProfiles = NestSessionTokenStore.profiles()
                activeNestSessionProfileEmail = NestSessionTokenStore.activeProfileEmail() ?? ""
                nestSessionToken = NestSessionTokenStore.load()
            }
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

    private func handleMacCallbackDiagnosticURL(_ url: URL) -> Bool {
        let isDiagnosticHost = url.host?.lowercased() == "diagnostics"
        let isDiagnosticPath = url.path.lowercased() == "/ping"
        guard isDiagnosticHost, isDiagnosticPath else {
            return false
        }

        let state = URLComponents(url: url, resolvingAgainstBaseURL: false)?
            .queryItems?
            .first(where: { $0.name == "state" })?
            .value?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

        guard !pendingMacCallbackDiagnosticState.isEmpty, state == pendingMacCallbackDiagnosticState else {
            lastMacCallbackDiagnosticLabel = "Quipsly Mac received a diagnostic callback, but the state did not match. Try again."
            return true
        }

        pendingMacCallbackDiagnosticState = ""
        lastMacCallbackDiagnosticLabel = "macOS opened Quipsly Mac through quipslymac:// successfully."
        return true
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

    var mediaWorkspaceURL: URL {
        QuipslyMediaWorkspace.rootURL(rootPath: mediaWorkspacePath)
    }

    func resetMediaWorkspacePath() {
        mediaWorkspacePath = QuipslyMediaWorkspace.defaultRootURL.path
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

    private static func normalizedNestBaseURL(_ value: String) -> String {
        let fallback = "https://nest.quipsly.com"
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard var components = URLComponents(string: trimmed.isEmpty ? fallback : trimmed) else {
            return fallback
        }

        components.path = ""
        components.queryItems = nil
        components.fragment = nil
        return components.url?.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/")) ?? fallback
    }

    private static func normalizedSlug(_ value: String?, fallback: String) -> String {
        let trimmed = (value ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? fallback : trimmed
    }

    private static func normalizedSectionTarget(_ value: String) -> String {
        value
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
            .replacingOccurrences(of: "-", with: "")
            .replacingOccurrences(of: "_", with: "")
            .replacingOccurrences(of: " ", with: "")
    }

    func requestVisionLabWorkbench() {
        shouldOpenVisionLabWorkbench = true
        visionLabWorkbenchRequestID = UUID()
    }

    func consumeVisionLabWorkbenchRequest() -> Bool {
        guard shouldOpenVisionLabWorkbench else { return false }
        shouldOpenVisionLabWorkbench = false
        return true
    }

    private static func isVisionLabWorkbenchRequest(_ url: URL) -> Bool {
        let pathTargets = url.pathComponents
            .filter { $0 != "/" }
            .map(normalizedSectionTarget)
        let queryTargets = URLComponents(url: url, resolvingAgainstBaseURL: false)?
            .queryItems?
            .compactMap { item -> String? in
                guard ["mode", "open", "target"].contains(item.name.lowercased()) else { return nil }
                return item.value.map(normalizedSectionTarget)
            } ?? []

        return (pathTargets + queryTargets).contains { target in
            target == "workbench" ||
                target == "reefball" ||
                target == "reefballworkbench"
        }
    }
}

private enum Keys {
    static let selectedSection = "quipslyMac.selectedSection"
    static let engineURL = "quipslyMac.engineURL"
    static let nestURL = "quipslyMac.nestURL"
    static let nestChatProjectSlug = "quipslyMac.nestChatProjectSlug"
    static let editorProjectSlug = "quipslyMac.editorProjectSlug"
    static let editorEpisodeSlug = "quipslyMac.editorEpisodeSlug"
    static let homeNestSlug = "quipslyMac.homeNestSlug"
    static let mediaWorkspacePath = "quipslyMac.mediaWorkspacePath"
    static let lastNestSessionEmail = "quipslyMac.lastNestSessionEmail"
    static let lastNestSessionCheckLabel = "quipslyMac.lastNestSessionCheckLabel"
    static let pendingNestNativeAuthState = "quipslyMac.pendingNestNativeAuthState"
    static let showExperimentalModules = "quipslyMac.showExperimentalModules"
    static let selectedDatasetPath = "quipslyMac.selectedDatasetPath"
    static let smokeEpisodeEditorSnapshotPath = "quipslyMac.smokeEpisodeEditorSnapshotPath"
    static let smokeEpisodeEditorProjectSlug = "quipslyMac.smokeEpisodeEditorProjectSlug"
    static let smokeEpisodeEditorEpisodeSlug = "quipslyMac.smokeEpisodeEditorEpisodeSlug"
}

private enum Defaults {
    static let editorProjectSlug = "high-ground-odyssey-manuscript"
    static let editorEpisodeSlug = "episode-4"
}
