import Foundation

public enum VideoProxyDurationStatus: String, Equatable, Sendable {
    case ready
    case blocked
}

public struct VideoProxyDurationAssessment: Equatable, Sendable {
    public let status: VideoProxyDurationStatus
    public let storedLaneDuration: Double
    public let sourceVideoTrackDuration: Double?
    public let proxyVideoTrackDuration: Double
    public let canonicalLaneDuration: Double?
    public let toleranceSeconds: Double
    public let detail: String

    public var isReady: Bool {
        status == .ready
    }

    public init(
        status: VideoProxyDurationStatus,
        storedLaneDuration: Double,
        sourceVideoTrackDuration: Double?,
        proxyVideoTrackDuration: Double,
        canonicalLaneDuration: Double?,
        toleranceSeconds: Double,
        detail: String
    ) {
        self.status = status
        self.storedLaneDuration = storedLaneDuration
        self.sourceVideoTrackDuration = sourceVideoTrackDuration
        self.proxyVideoTrackDuration = proxyVideoTrackDuration
        self.canonicalLaneDuration = canonicalLaneDuration
        self.toleranceSeconds = toleranceSeconds
        self.detail = detail
    }
}

public enum VideoProxyDurationPolicy {
    public static let toleranceSeconds = 0.5

    public static func assess(
        storedLaneDuration: Double,
        sourceVideoTrackDuration: Double?,
        proxyVideoTrackDuration: Double
    ) -> VideoProxyDurationAssessment {
        guard proxyVideoTrackDuration.isFinite,
              proxyVideoTrackDuration > 0 else {
            return blocked(
                storedLaneDuration: storedLaneDuration,
                sourceVideoTrackDuration: sourceVideoTrackDuration,
                proxyVideoTrackDuration: proxyVideoTrackDuration,
                detail: "The proxy video-track duration is missing or invalid."
            )
        }

        if let sourceVideoTrackDuration {
            guard sourceVideoTrackDuration.isFinite,
                  sourceVideoTrackDuration > 0 else {
                return blocked(
                    storedLaneDuration: storedLaneDuration,
                    sourceVideoTrackDuration: sourceVideoTrackDuration,
                    proxyVideoTrackDuration: proxyVideoTrackDuration,
                    detail: "The source video-track duration is missing or invalid."
                )
            }

            let delta = abs(
                proxyVideoTrackDuration - sourceVideoTrackDuration
            )
            guard delta <= toleranceSeconds else {
                return blocked(
                    storedLaneDuration: storedLaneDuration,
                    sourceVideoTrackDuration: sourceVideoTrackDuration,
                    proxyVideoTrackDuration: proxyVideoTrackDuration,
                    detail: String(
                        format: "Proxy video track %.3fs does not cover source video track %.3fs (delta %.3fs).",
                        proxyVideoTrackDuration,
                        sourceVideoTrackDuration,
                        delta
                    )
                )
            }

            return VideoProxyDurationAssessment(
                status: .ready,
                storedLaneDuration: storedLaneDuration,
                sourceVideoTrackDuration: sourceVideoTrackDuration,
                proxyVideoTrackDuration: proxyVideoTrackDuration,
                canonicalLaneDuration: sourceVideoTrackDuration,
                toleranceSeconds: toleranceSeconds,
                detail: String(
                    format: "Proxy video track %.3fs matches source video track %.3fs.",
                    proxyVideoTrackDuration,
                    sourceVideoTrackDuration
                )
            )
        }

        guard storedLaneDuration.isFinite,
              storedLaneDuration > 0 else {
            return blocked(
                storedLaneDuration: storedLaneDuration,
                sourceVideoTrackDuration: nil,
                proxyVideoTrackDuration: proxyVideoTrackDuration,
                detail: "The stored lane duration is invalid and the source video track is unavailable for verification."
            )
        }

        let delta = abs(proxyVideoTrackDuration - storedLaneDuration)
        guard delta <= toleranceSeconds else {
            return blocked(
                storedLaneDuration: storedLaneDuration,
                sourceVideoTrackDuration: nil,
                proxyVideoTrackDuration: proxyVideoTrackDuration,
                detail: String(
                    format: "Proxy video track %.3fs differs from stored lane %.3fs by %.3fs; grant source access to distinguish a truncated proxy from a container audio tail.",
                    proxyVideoTrackDuration,
                    storedLaneDuration,
                    delta
                )
            )
        }

        return VideoProxyDurationAssessment(
            status: .ready,
            storedLaneDuration: storedLaneDuration,
            sourceVideoTrackDuration: nil,
            proxyVideoTrackDuration: proxyVideoTrackDuration,
            canonicalLaneDuration: proxyVideoTrackDuration,
            toleranceSeconds: toleranceSeconds,
            detail: String(
                format: "Proxy video track %.3fs is within tolerance of stored lane %.3fs and is the available playable-duration evidence.",
                proxyVideoTrackDuration,
                storedLaneDuration
            )
        )
    }

    private static func blocked(
        storedLaneDuration: Double,
        sourceVideoTrackDuration: Double?,
        proxyVideoTrackDuration: Double,
        detail: String
    ) -> VideoProxyDurationAssessment {
        VideoProxyDurationAssessment(
            status: .blocked,
            storedLaneDuration: storedLaneDuration,
            sourceVideoTrackDuration: sourceVideoTrackDuration,
            proxyVideoTrackDuration: proxyVideoTrackDuration,
            canonicalLaneDuration: nil,
            toleranceSeconds: toleranceSeconds,
            detail: detail
        )
    }
}
