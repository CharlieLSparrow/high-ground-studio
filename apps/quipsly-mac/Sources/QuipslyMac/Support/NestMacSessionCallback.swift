import Foundation

struct NestNativeAuthResult {
    var code: String
    var expiresAt: String
    var email: String
    var name: String
    var state: String
}

enum NestMacSessionCallback {
    static func parse(_ callbackURL: URL) -> NestNativeAuthResult? {
        guard callbackURL.scheme?.lowercased() == "quipslymac" else {
            return nil
        }

        let fragmentItems = URLComponents(string: "quipslymac://callback?\(callbackURL.fragment ?? "")")?.queryItems ?? []
        let queryItems = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false)?.queryItems ?? []
        let allItems = fragmentItems + queryItems

        func value(_ name: String) -> String {
            allItems.first { $0.name == name }?.value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        }

        let code = value("code")
        guard !code.isEmpty else { return nil }

        return NestNativeAuthResult(
            code: code,
            expiresAt: value("expiresAt"),
            email: value("email"),
            name: value("name"),
            state: value("state")
        )
    }
}
