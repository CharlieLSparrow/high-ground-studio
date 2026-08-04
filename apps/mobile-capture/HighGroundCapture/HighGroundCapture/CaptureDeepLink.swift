import Combine
import Foundation

enum CaptureDeepLinkMode: String, Equatable {
    case live
    case record
    case review
}

struct CaptureSessionDeepLink: Equatable {
    let roomID: String
    let mode: CaptureDeepLinkMode

    /// Deep links are navigation hints, never bearer authority. Quipsly accepts
    /// only a bounded canonical room identifier and an inert destination mode;
    /// Capture must re-read that room through the signed-in Nest API before it
    /// displays private context or prepares provider media.
    init?(url: URL) {
        guard let components = URLComponents(
            url: url,
            resolvingAgainstBaseURL: false
        ) else { return nil }

        let scheme = (components.scheme ?? "").lowercased()
        let host = (components.host ?? "").lowercased()
        let pathParts = components.path
            .split(separator: "/", omittingEmptySubsequences: true)
            .map(String.init)

        let rawRoomID: String?
        switch (scheme, host, pathParts) {
        case ("quipsly", "session", let parts) where parts.count == 1:
            rawRoomID = parts[0]
        case ("https", "nest.quipsly.com", let parts)
            where parts.count == 2 && parts[0] == "sessions":
            guard components.queryItems?.contains(where: {
                $0.name == "open" && $0.value?.lowercased() == "capture"
            }) == true else { return nil }
            rawRoomID = parts[1]
        default:
            return nil
        }

        guard let roomID = Self.validatedRoomID(rawRoomID) else { return nil }
        let queryItems = components.queryItems ?? []
        // Invitation and provider tokens must never cross this handoff. The web
        // app accepts the invitation first; the native app receives identity
        // only and obtains a fresh, actor-bound provider token from Nest later.
        let prohibitedNames = Set(["token", "invitetoken", "participanttoken"])
        guard !queryItems.contains(where: {
            prohibitedNames.contains($0.name.lowercased())
        }) else { return nil }
        let modeValue = queryItems.first(where: { $0.name.lowercased() == "mode" })?
            .value?.lowercased()
        let mode = CaptureDeepLinkMode(rawValue: modeValue ?? "live")
            ?? .live
        self.roomID = roomID
        self.mode = mode
    }

    static func validatedRoomID(_ value: String?) -> String? {
        guard let value else { return nil }
        let decoded = value.removingPercentEncoding ?? value
        let trimmed = decoded.trimmingCharacters(in: .whitespacesAndNewlines)
        let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_")
        guard !trimmed.isEmpty,
              trimmed.utf8.count <= 240,
              trimmed.unicodeScalars.allSatisfy({ allowed.contains($0) }) else { return nil }
        return trimmed
    }
}

@MainActor
final class CaptureDeepLinkRouter: ObservableObject {
    static let shared = CaptureDeepLinkRouter()

    @Published private(set) var pendingSession: CaptureSessionDeepLink?
    @Published private(set) var rejectedLinkNotice: String?
    private var inspectedConfiguredLaunchLink = false

    @discardableResult
    func receive(_ url: URL) -> Bool {
        guard let request = CaptureSessionDeepLink(url: url) else {
            // Never retain the raw URL: malformed links can contain private or
            // attacker-controlled query material that does not belong in app
            // state, diagnostics, crash reports, or accessibility output.
            rejectedLinkNotice = "Quipsly ignored an invalid or unsupported app link. Nothing was opened or changed."
            return false
        }
        rejectedLinkNotice = nil
        pendingSession = request
        return true
    }

    func consume(_ request: CaptureSessionDeepLink) {
        guard pendingSession == request else { return }
        pendingSession = nil
    }

    func consumeRejectedLinkNotice() -> String? {
        defer { rejectedLinkNotice = nil }
        return rejectedLinkNotice
    }

    func receiveConfiguredLaunchLinkIfNeeded() {
#if DEBUG
        guard !inspectedConfiguredLaunchLink else { return }
        inspectedConfiguredLaunchLink = true
        let prefix = "--capture-runtime-session-link="
        guard let argument = ProcessInfo.processInfo.arguments.first(where: {
            $0.hasPrefix(prefix)
        }),
        let url = URL(string: String(argument.dropFirst(prefix.count))) else { return }
        receive(url)
#endif
    }
}
