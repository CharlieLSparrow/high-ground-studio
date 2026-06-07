import AppKit
import Foundation

enum NestSessionActions {
    static func loginURL(nestBaseURL: String, callbackPath: String = "/projects") -> URL {
        let fallback = "https://nest.quipsly.com"
        let base = nestBaseURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? fallback : nestBaseURL
        var components = URLComponents(string: base) ?? URLComponents(string: fallback)!
        components.path = "/api/auth/signin"
        components.queryItems = [
            URLQueryItem(name: "callbackUrl", value: callbackPath)
        ]
        return components.url ?? URL(string: "\(fallback)/api/auth/signin?callbackUrl=/projects")!
    }

    static func handoffURL(nestBaseURL: String) -> URL {
        let fallback = "https://nest.quipsly.com"
        let base = nestBaseURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? fallback : nestBaseURL
        var components = URLComponents(string: base) ?? URLComponents(string: fallback)!
        components.path = "/api/mac/session-handoff"
        components.queryItems = nil
        return components.url ?? URL(string: "\(fallback)/api/mac/session-handoff")!
    }

    static func nativeHandoffURL(nestBaseURL: String, callbackScheme: String = "quipslymac", state: String = "", deviceLabel: String = "Quipsly Mac") -> URL {
        let fallback = "https://nest.quipsly.com"
        let base = nestBaseURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? fallback : nestBaseURL
        var components = URLComponents(string: base) ?? URLComponents(string: fallback)!
        components.path = "/api/mac/session-handoff"
        components.queryItems = [
            URLQueryItem(name: "native", value: "1"),
            URLQueryItem(name: "callbackScheme", value: callbackScheme),
            URLQueryItem(name: "state", value: state),
            URLQueryItem(name: "deviceLabel", value: deviceLabel),
        ]
        return components.url ?? URL(string: "\(fallback)/api/mac/session-handoff?native=1&callbackScheme=\(callbackScheme)")!
    }

    static func accountSwitchURL(nestBaseURL: String, callbackScheme: String = "quipslymac", state: String = "", deviceLabel: String = "Quipsly Mac") -> URL {
        let fallback = "https://nest.quipsly.com"
        let base = nestBaseURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? fallback : nestBaseURL
        let handoffPath = "/api/mac/session-handoff?native=1&callbackScheme=\(callbackScheme)&state=\(state)&deviceLabel=\(deviceLabel.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? deviceLabel)"
        var components = URLComponents(string: base) ?? URLComponents(string: fallback)!
        components.path = "/account/switch"
        components.queryItems = [
            URLQueryItem(name: "callbackUrl", value: handoffPath)
        ]
        return components.url ?? URL(string: "\(fallback)/account/switch?callbackUrl=/api/mac/session-handoff")!
    }

    static func callbackPath(for url: URL?) -> String {
        guard let url else { return "/projects" }
        var path = url.path.isEmpty ? "/projects" : url.path
        if let query = url.query, !query.isEmpty {
            path += "?\(query)"
        }
        return path
    }

    static func openExternalLogin(nestBaseURL: String, callbackPath: String = "/projects") {
        NSWorkspace.shared.open(loginURL(nestBaseURL: nestBaseURL, callbackPath: callbackPath))
    }

    static func openExternalHandoff(nestBaseURL: String) {
        NSWorkspace.shared.open(handoffURL(nestBaseURL: nestBaseURL))
    }

    @MainActor
    static func openEmbeddedEpisodeLogin(appState: AppState, projectSlug: String, episodeSlug: String) {
        appState.editorProjectSlug = projectSlug
        appState.editorEpisodeSlug = episodeSlug
        appState.selectedSection = .episodeEditor
    }

    static func isAuthIssue(code: String?, message: String?) -> Bool {
        let normalizedCode = (code ?? "").lowercased()
        let normalizedMessage = (message ?? "").lowercased()

        return normalizedCode == "nest-auth-required"
            || normalizedMessage.contains("sign in")
            || normalizedMessage.contains("sign-in")
            || normalizedMessage.contains("login")
            || normalizedMessage.contains("unauthorized")
            || normalizedMessage.contains("401")
    }
}
