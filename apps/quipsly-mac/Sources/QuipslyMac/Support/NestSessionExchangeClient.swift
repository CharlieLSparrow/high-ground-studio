import Foundation

struct NestSessionCredentials: Decodable {
    struct User: Decodable {
        var id: String
        var email: String
        var primaryEmail: String
        var name: String
        var roles: [String]
    }

    var accessToken: String
    var refreshToken: String
    var accessTokenExpiresAt: String
    var refreshTokenExpiresAt: String
    var deviceSessionId: String
    var user: User
}

enum NestSessionExchangeError: LocalizedError {
    case invalidBaseURL
    case invalidResponse(String)
    case serverError(String)

    var errorDescription: String? {
        switch self {
        case .invalidBaseURL:
            return "The Nest base URL is invalid."
        case .invalidResponse(let message):
            return message
        case .serverError(let message):
            return message
        }
    }
}

enum NestSessionExchangeClient {
    static func exchangeCode(nestBaseURL: String, code: String, deviceLabel: String) async throws -> NestSessionCredentials {
        try await post(
            nestBaseURL: nestBaseURL,
            path: "/api/mac/session-exchange",
            body: [
                "code": code,
                "deviceLabel": deviceLabel,
            ]
        )
    }

    static func refresh(nestBaseURL: String, refreshToken: String, deviceLabel: String) async throws -> NestSessionCredentials {
        try await post(
            nestBaseURL: nestBaseURL,
            path: "/api/mac/session-refresh",
            body: [
                "refreshToken": refreshToken,
                "deviceLabel": deviceLabel,
            ]
        )
    }

    static func webSessionLoginURL(nestBaseURL: String, returnTo: String) async throws -> URL {
        guard var components = URLComponents(string: normalizedBaseURL(nestBaseURL)) else {
            throw NestSessionExchangeError.invalidBaseURL
        }
        components.path = "/api/mac/web-session"
        components.queryItems = nil

        guard let url = components.url else {
            throw NestSessionExchangeError.invalidBaseURL
        }

        let token = NestSessionTokenStore.load()
        guard !token.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw NestSessionExchangeError.serverError("No active Nest profile is connected. Open Nest Session and sign in first.")
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 20
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "returnTo": returnTo,
        ])

        let (data, response) = try await URLSession.shared.data(for: request)
        let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0

        if !(200...299).contains(statusCode) {
            let message = parseError(data: data) ?? "Nest returned \(statusCode) while preparing the embedded editor session."
            throw NestSessionExchangeError.serverError(message)
        }

        let envelope = try JSONDecoder().decode(NestWebSessionEnvelope.self, from: data)
        guard envelope.ok, let loginUrl = URL(string: envelope.loginUrl) else {
            throw NestSessionExchangeError.invalidResponse(envelope.error ?? "Nest did not return a usable embedded editor login URL.")
        }

        return loginUrl
    }

    private static func post(nestBaseURL: String, path: String, body: [String: String]) async throws -> NestSessionCredentials {
        guard var components = URLComponents(string: normalizedBaseURL(nestBaseURL)) else {
            throw NestSessionExchangeError.invalidBaseURL
        }
        components.path = path
        components.queryItems = nil

        guard let url = components.url else {
            throw NestSessionExchangeError.invalidBaseURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 20
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)
        let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0

        if !(200...299).contains(statusCode) {
            let message = parseError(data: data) ?? "Nest returned \(statusCode). Sign in again."
            throw NestSessionExchangeError.serverError(message)
        }

        let envelope = try JSONDecoder().decode(NestSessionEnvelope.self, from: data)
        guard envelope.ok else {
            throw NestSessionExchangeError.invalidResponse(envelope.error ?? "Nest did not return a usable Mac session.")
        }

        return NestSessionCredentials(
            accessToken: envelope.accessToken,
            refreshToken: envelope.refreshToken,
            accessTokenExpiresAt: envelope.accessTokenExpiresAt,
            refreshTokenExpiresAt: envelope.refreshTokenExpiresAt,
            deviceSessionId: envelope.deviceSessionId,
            user: envelope.user
        )
    }

    private static func normalizedBaseURL(_ value: String) -> String {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? "https://nest.quipsly.com" : trimmed
    }

    private static func parseError(data: Data) -> String? {
        guard
            let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let message = root["error"] as? String
        else {
            return nil
        }
        return message
    }
}

private struct NestSessionEnvelope: Decodable {
    var ok: Bool
    var accessToken: String
    var refreshToken: String
    var accessTokenExpiresAt: String
    var refreshTokenExpiresAt: String
    var deviceSessionId: String
    var user: NestSessionCredentials.User
    var error: String?
}

private struct NestWebSessionEnvelope: Decodable {
    var ok: Bool
    var loginUrl: String
    var expiresAt: String?
    var returnTo: String?
    var error: String?
}
