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

/// A writing link is only an inert request to continue a draft that the
/// signed-in person can already read. The UUID carries no document content,
/// project identity, source hash, or authorization; Capture refreshes the
/// actor-partitioned writing store before it creates a new local recording.
struct CaptureVoiceWritingDeepLink: Equatable {
    let draftID: UUID

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
        let queryItems = components.queryItems ?? []
        let prohibitedNames = Set(["token", "invitetoken", "participanttoken"])
        guard !queryItems.contains(where: {
            prohibitedNames.contains($0.name.lowercased())
        }) else { return nil }

        let rawDraftID: String?
        switch (scheme, host, pathParts) {
        case ("quipsly", "writing", let parts) where parts.count == 1:
            guard queryItems.contains(where: {
                $0.name.lowercased() == "action"
                    && $0.value?.lowercased() == "continue"
            }) else { return nil }
            rawDraftID = parts[0]
        case ("https", "nest.quipsly.com", let parts)
            where parts.count == 2 && parts[0] == "writing":
            guard queryItems.contains(where: {
                $0.name.lowercased() == "open"
                    && $0.value?.lowercased() == "capture"
            }) else { return nil }
            rawDraftID = parts[1]
        default:
            return nil
        }

        guard let rawDraftID,
              let decoded = rawDraftID.removingPercentEncoding,
              let draftID = UUID(uuidString: decoded) else { return nil }
        self.draftID = draftID
    }
}

/// Starts a new private voice-writing draft without carrying identity, Nest,
/// document, or recording authority in the URL. The signed-in Capture shell
/// creates the local-first draft through the same path as its Home action.
struct CaptureStartVoiceWritingDeepLink: Equatable {
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
        let queryItems = components.queryItems ?? []
        let prohibitedNames = Set(["token", "invitetoken", "participanttoken", "draftid"])
        guard !queryItems.contains(where: {
            prohibitedNames.contains($0.name.lowercased())
        }) else { return nil }

        switch (scheme, host, pathParts) {
        case ("quipsly", "write", let parts) where parts.isEmpty,
             ("quipsly", "voice-note", let parts) where parts.isEmpty:
            break
        case ("https", "nest.quipsly.com", let parts)
            where parts == ["write"]:
            guard queryItems.contains(where: {
                $0.name.lowercased() == "open"
                    && $0.value?.lowercased() == "capture"
            }) else { return nil }
        default:
            return nil
        }
    }
}

@MainActor
final class CaptureDeepLinkRouter: ObservableObject {
    static let shared = CaptureDeepLinkRouter()

    @Published private(set) var pendingSession: CaptureSessionDeepLink?
    @Published private(set) var openedSession: CaptureSessionDeepLink?
    @Published private(set) var rejectedLinkNotice: String?
    @Published private(set) var pendingVoiceNoteRequestID: UUID?
    private(set) var pendingVoiceNoteDraftID: UUID?
    private var inspectedConfiguredLaunchLink = false

    @discardableResult
    func receive(_ url: URL) -> Bool {
        if let request = CaptureSessionDeepLink(url: url) {
            rejectedLinkNotice = nil
            openedSession = nil
            pendingVoiceNoteDraftID = nil
            pendingVoiceNoteRequestID = nil
            pendingSession = request
            return true
        }
        if let request = CaptureVoiceWritingDeepLink(url: url) {
            rejectedLinkNotice = nil
            openedSession = nil
            pendingSession = nil
            requestVoiceNote(continuingDraftID: request.draftID)
            return true
        }
        if CaptureStartVoiceWritingDeepLink(url: url) != nil {
            rejectedLinkNotice = nil
            openedSession = nil
            pendingSession = nil
            requestVoiceNote()
            return true
        }

        // Never retain the raw URL: malformed links can contain private or
        // attacker-controlled query material that does not belong in app
        // state, diagnostics, crash reports, or accessibility output.
        rejectedLinkNotice = "Quipsly ignored an invalid or unsupported app link. Nothing was opened or changed."
        return false
    }

    func consume(_ request: CaptureSessionDeepLink) {
        guard pendingSession == request else { return }
        pendingSession = nil
    }

    /// Retains the inert navigation receipt until the person deliberately
    /// joins or records. The authenticated SwiftUI shell can be rebuilt while
    /// identity restoration settles; the safety explanation must survive that
    /// ordinary lifecycle transition even though the URL itself is consumed.
    func markOpened(_ request: CaptureSessionDeepLink) {
        guard pendingSession == request else { return }
        openedSession = request
        pendingSession = nil
    }

    func clearOpenedSessionReceipt(for sessionID: String) {
        guard openedSession?.roomID == sessionID else { return }
        openedSession = nil
    }

    func consumeRejectedLinkNotice() -> String? {
        defer { rejectedLinkNotice = nil }
        return rejectedLinkNotice
    }

    func requestVoiceNote(continuingDraftID: UUID? = nil) {
        pendingVoiceNoteDraftID = continuingDraftID
        pendingVoiceNoteRequestID = UUID()
    }

    func consumeVoiceNoteRequest(_ requestID: UUID) {
        guard pendingVoiceNoteRequestID == requestID else { return }
        pendingVoiceNoteDraftID = nil
        pendingVoiceNoteRequestID = nil
    }

    func receiveConfiguredLaunchLinkIfNeeded() {
#if DEBUG
        guard !inspectedConfiguredLaunchLink else { return }
        let prefixes = [
            "--capture-runtime-session-link=",
            "--capture-runtime-writing-link=",
        ]
        guard let (argument, prefix) = prefixes.compactMap({ prefix in
            ProcessInfo.processInfo.arguments.first(where: {
                $0.hasPrefix(prefix)
            }).map { ($0, prefix) }
        }).first else { return }
        inspectedConfiguredLaunchLink = true
        guard let url = URL(
            string: String(argument.dropFirst(prefix.count))
        ) else { return }
        receive(url)
#endif
    }
}
