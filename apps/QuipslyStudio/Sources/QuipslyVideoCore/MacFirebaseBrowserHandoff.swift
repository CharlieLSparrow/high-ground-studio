import Foundation

public struct MacFirebaseBrowserHandoff: Equatable, Sendable {
    public let code: String
    public let state: String
    public let expiresAt: Date

    public init(code: String, state: String, expiresAt: Date) {
        self.code = code
        self.state = state
        self.expiresAt = expiresAt
    }
}

public enum MacFirebaseBrowserHandoffError: LocalizedError, Equatable {
    case wrongCallback
    case malformedFragment
    case invalidCode
    case invalidState
    case invalidExpiration
    case expired

    public var errorDescription: String? {
        switch self {
        case .wrongCallback:
            return "That link was not a Quipsly Studio sign-in callback."
        case .malformedFragment:
            return "The browser returned an incomplete Quipsly Studio sign-in."
        case .invalidCode:
            return "The one-time Quipsly Studio code is malformed."
        case .invalidState:
            return "The browser returned an invalid sign-in state."
        case .invalidExpiration:
            return "The browser returned an invalid sign-in expiration."
        case .expired:
            return "That Quipsly Studio sign-in response expired. Start again."
        }
    }
}

public enum MacFirebaseBrowserHandoffParser {
    public static func parse(
        _ url: URL,
        expectedScheme: String = "quipslymac",
        now: Date = Date()
    ) throws -> MacFirebaseBrowserHandoff {
        guard
            url.scheme?.lowercased() == expectedScheme.lowercased(),
            url.host?.lowercased() == "auth",
            url.path == "/session",
            url.query == nil,
            let fragment = url.fragment,
            !fragment.isEmpty
        else {
            throw MacFirebaseBrowserHandoffError.wrongCallback
        }

        guard
            let components = URLComponents(string: "https://callback.invalid/?\(fragment)"),
            let items = components.queryItems
        else {
            throw MacFirebaseBrowserHandoffError.malformedFragment
        }

        let grouped = Dictionary(grouping: items, by: \.name)
        guard
            items.count == 3,
            Set(grouped.keys) == Set(["code", "state", "expiresAt"]),
            grouped["code"]?.count == 1,
            grouped["state"]?.count == 1,
            grouped["expiresAt"]?.count == 1,
            let code = grouped["code"]?.first?.value,
            let state = grouped["state"]?.first?.value,
            let expiresAtRaw = grouped["expiresAt"]?.first?.value
        else {
            throw MacFirebaseBrowserHandoffError.malformedFragment
        }

        guard
            code.hasPrefix("qmac_"),
            isBase64URL(String(code.dropFirst("qmac_".count)), length: 43 ... 128)
        else {
            throw MacFirebaseBrowserHandoffError.invalidCode
        }
        guard isBase64URL(state, length: 43 ... 128) else {
            throw MacFirebaseBrowserHandoffError.invalidState
        }

        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let expiresAt =
            formatter.date(from: expiresAtRaw)
            ?? ISO8601DateFormatter().date(from: expiresAtRaw)
        guard let expiresAt else {
            throw MacFirebaseBrowserHandoffError.invalidExpiration
        }
        guard expiresAt > now else {
            throw MacFirebaseBrowserHandoffError.expired
        }

        return MacFirebaseBrowserHandoff(
            code: code,
            state: state,
            expiresAt: expiresAt
        )
    }

    private static func isBase64URL(
        _ value: String,
        length: ClosedRange<Int>
    ) -> Bool {
        guard length.contains(value.count) else { return false }
        let allowed = CharacterSet(
            charactersIn:
                "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
        )
        return value.unicodeScalars.allSatisfy(allowed.contains)
    }
}
