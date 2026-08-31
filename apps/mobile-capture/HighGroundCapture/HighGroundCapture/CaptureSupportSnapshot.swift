import Foundation

/// A deliberately redacted, user-visible support snapshot.
///
/// Keep this type independent from authentication, session, source, and file
/// models. Its initializer is the privacy boundary: callers can provide only
/// coarse runtime and recovery state that is useful for TestFlight support.
struct CaptureSupportSnapshot {
    let generatedAt: Date
    let surface: String
    let appVersion: String
    let appBuild: String
    let deviceModelIdentifier: String
    let systemName: String
    let systemVersion: String
    let accountAccessMode: String
    let nestHost: String
    let audioCaptureState: String
    let videoCaptureState: String
    let roomState: String
    let audioRoutePortType: String?
    let localOriginalCount: Int?
    let recoverableUploadCount: Int?
    let captureAttentionCount: Int?
    let latestCaptureAttentionAt: Date?
    let latestCaptureAttentionCategory: String?
    let latestCaptureTransitionState: String?
    let latestCaptureSelectedSessionWasLocal: Bool?
    let latestCaptureCanonicalSessionCount: Int?
    let latestCaptureLocalDraftSessionCount: Int?
    let previewMode: Bool

    var captureAttentionLine: String {
        guard let captureAttentionCount else { return "not inspected" }
        guard captureAttentionCount > 0 else { return "none recorded" }
        let category = Self.clean(latestCaptureAttentionCategory ?? "unknown")
        let timestamp = latestCaptureAttentionAt.map(Self.timestamp) ?? "unknown time"
        return "\(captureAttentionCount) recorded · latest \(category) · \(timestamp)"
    }

    var shareText: String {
        [
            "Quipsly Capture support snapshot",
            "Created: \(Self.timestamp(generatedAt))",
            "Surface: \(Self.clean(surface))",
            "App: \(Self.clean(appVersion)) (\(Self.clean(appBuild)))",
            "Device: \(Self.clean(deviceModelIdentifier))",
            "System: \(Self.clean(systemName)) \(Self.clean(systemVersion))",
            "Account access: \(Self.clean(accountAccessMode))",
            "Nest host: \(Self.clean(nestHost))",
            "Audio capture: \(Self.clean(audioCaptureState))",
            "Video capture: \(Self.clean(videoCaptureState))",
            "Live room: \(Self.clean(roomState))",
            "Audio route type: \(Self.clean(audioRoutePortType ?? "none"))",
            "Local originals: \(Self.count(localOriginalCount))",
            "Recoverable uploads: \(Self.count(recoverableUploadCount))",
            "Capture attention events: \(captureAttentionLine)",
            "Latest capture transition: \(Self.clean(latestCaptureTransitionState ?? "not inspected"))",
            "Latest selected Session was local: \(Self.boolean(latestCaptureSelectedSessionWasLocal))",
            "Canonical Sessions at latest attention: \(Self.count(latestCaptureCanonicalSessionCount))",
            "Local drafts at latest attention: \(Self.count(latestCaptureLocalDraftSessionCount))",
            "Preview mode: \(previewMode ? "yes" : "no")",
            "",
            Self.privacyBoundary,
        ]
        .joined(separator: "\n")
    }

    static let privacyBoundary =
        "Privacy boundary: no email, account ID, session or recording ID, source text, filename, file path, credential, access token, or refresh token is included."

    nonisolated private static func clean(_ value: String) -> String {
        let collapsed = value
            .components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
            .joined(separator: " ")
        return collapsed.isEmpty
            ? "unknown"
            : String(collapsed.prefix(256))
    }

    nonisolated private static func count(_ value: Int?) -> String {
        guard let value else {
            return "not inspected"
        }
        return String(max(0, value))
    }

    nonisolated private static func boolean(_ value: Bool?) -> String {
        guard let value else { return "not inspected" }
        return value ? "yes" : "no"
    }

    nonisolated private static func timestamp(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [
            .withInternetDateTime,
            .withDashSeparatorInDate,
            .withColonSeparatorInTime,
        ]
        return formatter.string(from: date)
    }
}
