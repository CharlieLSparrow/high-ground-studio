import Foundation

/// Records why Quipsly was allowed to open a protected local source. This is
/// evidence, not a server authorization token: Nest always revalidates access
/// and consent before accepting upload, transcription, sharing, or release.
enum CaptureRecordingAuthorityBasis: String, Codable, Equatable, Sendable {
    case authoritativeRefresh = "authoritative-refresh"
    case recentDeviceConsent = "recent-device-consent"
    case localDraft = "local-draft"
    case preview = "preview"
}

struct CaptureOfflineRecordingAuthorityInput: Equatable, Sendable {
    let lastAuthoritativeRefreshAt: Date?
    let evaluatedAt: Date
    let sessionsAreFromProtectedCache: Bool
    let recordingIsReady: Bool
    let hasRecordingConsentID: Bool
}

enum CaptureOfflineRecordingAuthorityDecision: Equatable, Sendable {
    case allow(CaptureRecordingAuthorityBasis)
    case deny
}

/// A short network interruption must not destroy a prepared recording moment.
/// Quipsly may keep capturing locally only when this running app recently read
/// the authoritative Session list and still holds the complete consent tuple.
/// A cold-launch disk cache is intentionally never sufficient.
enum CaptureOfflineRecordingAuthorityPolicy {
    nonisolated static let maximumAuthoritativeAge: TimeInterval = 15 * 60

    nonisolated static func decide(
        _ input: CaptureOfflineRecordingAuthorityInput
    ) -> CaptureOfflineRecordingAuthorityDecision {
        guard !input.sessionsAreFromProtectedCache,
              input.recordingIsReady,
              input.hasRecordingConsentID,
              let refreshedAt = input.lastAuthoritativeRefreshAt else {
            return .deny
        }

        let age = input.evaluatedAt.timeIntervalSince(refreshedAt)
        guard age >= 0, age <= maximumAuthoritativeAge else {
            return .deny
        }
        return .allow(.recentDeviceConsent)
    }
}

/// Canonical control requests do not move media bytes. A 425 response means
/// Nest is still reconciling a durable room/consent receipt, so retrying the
/// control plane is safe while the original source remains local.
enum CaptureCanonicalControlRetryPolicy {
    nonisolated static func isRetryable(
        statusCode: Int,
        serverMarkedRetryable: Bool,
        retryOnConflict: Bool
    ) -> Bool {
        serverMarkedRetryable
            || statusCode == 408
            || statusCode == 425
            || statusCode == 429
            || statusCode >= 500
            || (retryOnConflict && statusCode == 409)
    }
}
