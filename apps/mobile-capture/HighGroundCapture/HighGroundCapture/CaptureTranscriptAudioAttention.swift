import Foundation

struct CaptureTranscriptAudioAttentionSegment: Equatable, Sendable {
    let id: String
    let startSeconds: TimeInterval
    let endSeconds: TimeInterval
}

struct CaptureTranscriptAudioAttentionObservation: Equatable, Sendable {
    let kind: String
    let severity: String
    let startSeconds: TimeInterval
    let endSeconds: TimeInterval
    let detail: String
}

struct CaptureTranscriptAudioListenPoint: Equatable, Sendable, Identifiable {
    let id: String
    let kind: String
    let severity: String
    let startSeconds: TimeInterval
    let endSeconds: TimeInterval
    let detail: String
    let overlappingSegmentIDs: [String]
}

struct CaptureTranscriptAudioAttentionPlan: Equatable, Sendable {
    enum Status: String, Equatable, Sendable {
        case ready
        case noObservations = "no-observations"
        case heldAssetMismatch = "held-asset-mismatch"
        case heldClockMismatch = "held-clock-mismatch"
    }

    let status: Status
    let listenPoints: [CaptureTranscriptAudioListenPoint]
    let heldObservationCount: Int
    let reason: String?

    var isClockQualified: Bool {
        status == .ready || status == .noObservations
    }
}

/// Joins deterministic decoded-signal observations to transcript navigation
/// anchors only after exact asset and compatible source-clock checks.
///
/// The result intentionally has no edit, correction, defect, repair, or
/// publication operation. A listen point is bounded evidence for a person to
/// audition; it is never an automatic media or transcript decision.
enum CaptureTranscriptAudioAttentionResolver {
    static func resolve(
        expectedRecordingAssetID: String?,
        actualRecordingAssetID: String?,
        recordingDurationSeconds: TimeInterval,
        transcriptPlaybackDurationSeconds: TimeInterval?,
        signalDurationSeconds: TimeInterval,
        observations: [CaptureTranscriptAudioAttentionObservation],
        segments: [CaptureTranscriptAudioAttentionSegment]
    ) -> CaptureTranscriptAudioAttentionPlan {
        guard normalizedID(expectedRecordingAssetID) != nil,
              normalizedID(expectedRecordingAssetID) == normalizedID(actualRecordingAssetID) else {
            return .init(
                status: .heldAssetMismatch,
                listenPoints: [],
                heldObservationCount: observations.count,
                reason: "Audio listen points were not mapped because the transcript and recording asset identities do not match."
            )
        }

        guard validDuration(recordingDurationSeconds),
              validDuration(signalDurationSeconds),
              clocksMatch(recordingDurationSeconds, signalDurationSeconds),
              transcriptPlaybackDurationSeconds.map({
                  validDuration($0) && clocksMatch($0, signalDurationSeconds)
              }) ?? true else {
            return .init(
                status: .heldClockMismatch,
                listenPoints: [],
                heldObservationCount: observations.count,
                reason: "Audio listen points were not mapped because the decoded source, recording, and transcript clocks do not agree closely enough."
            )
        }

        let validSegments = segments.filter {
            finite($0.startSeconds)
                && finite($0.endSeconds)
                && $0.startSeconds >= 0
                && $0.endSeconds > $0.startSeconds
                && $0.endSeconds <= signalDurationSeconds + clockTolerance(signalDurationSeconds)
        }
        var heldObservationCount = 0
        let listenPoints: [CaptureTranscriptAudioListenPoint] = observations.enumerated().compactMap { indexedObservation in
            let (index, observation) = indexedObservation
            guard finite(observation.startSeconds),
                  finite(observation.endSeconds),
                  observation.startSeconds >= 0,
                  observation.endSeconds > observation.startSeconds,
                  observation.endSeconds <= signalDurationSeconds + clockTolerance(signalDurationSeconds) else {
                heldObservationCount += 1
                return nil
            }
            let overlappingSegmentIDs = validSegments
                .filter {
                    $0.endSeconds > observation.startSeconds
                        && $0.startSeconds < observation.endSeconds
                }
                .sorted {
                    if $0.startSeconds == $1.startSeconds { return $0.id < $1.id }
                    return $0.startSeconds < $1.startSeconds
                }
                .map(\.id)
            return CaptureTranscriptAudioListenPoint(
                id: stablePointID(index: index, observation: observation),
                kind: observation.kind,
                severity: observation.severity,
                startSeconds: observation.startSeconds,
                endSeconds: observation.endSeconds,
                detail: observation.detail,
                overlappingSegmentIDs: overlappingSegmentIDs
            )
        }

        return .init(
            status: listenPoints.isEmpty && heldObservationCount == 0 ? .noObservations : .ready,
            listenPoints: listenPoints,
            heldObservationCount: heldObservationCount,
            reason: heldObservationCount > 0
                ? "Some malformed or out-of-range signal observations were held from transcript navigation."
                : nil
        )
    }

    private static func clocksMatch(
        _ left: TimeInterval,
        _ right: TimeInterval
    ) -> Bool {
        abs(left - right) <= max(clockTolerance(left), clockTolerance(right))
    }

    private static func clockTolerance(_ duration: TimeInterval) -> TimeInterval {
        min(2, max(0.5, duration * 0.001))
    }

    private static func validDuration(_ value: TimeInterval) -> Bool {
        finite(value) && value > 0
    }

    private static func finite(_ value: TimeInterval) -> Bool {
        value.isFinite && !value.isNaN
    }

    private static func normalizedID(_ value: String?) -> String? {
        let normalized = value?.trimmingCharacters(in: .whitespacesAndNewlines)
        return normalized?.isEmpty == false ? normalized : nil
    }

    private static func stablePointID(
        index: Int,
        observation: CaptureTranscriptAudioAttentionObservation
    ) -> String {
        [
            observation.kind,
            String(format: "%.6f", observation.startSeconds),
            String(format: "%.6f", observation.endSeconds),
            String(index),
        ].joined(separator: "|")
    }
}
