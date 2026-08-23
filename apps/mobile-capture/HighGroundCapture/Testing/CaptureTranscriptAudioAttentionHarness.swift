import Foundation

@main
enum CaptureTranscriptAudioAttentionHarness {
    static func main() {
        exactAssetMapsToOnePassage()
        spanningPointMapsToTwoPassages()
        betweenPassagesRemainsVisible()
        wrongAssetFailsClosed()
        clockMismatchFailsClosed()
        malformedPointIsHeld()
        outOfRangePassageIsNotMapped()
        optionalPlaybackDurationUsesBoundedSourceClock()
        emptyEvidenceIsQualifiedButEmpty()
        print("PASS 9 transcript audio-attention tests")
    }

    private static let segments = [
        CaptureTranscriptAudioAttentionSegment(id: "segment-a", startSeconds: 0, endSeconds: 8),
        CaptureTranscriptAudioAttentionSegment(id: "segment-b", startSeconds: 8, endSeconds: 16),
    ]

    private static func exactAssetMapsToOnePassage() {
        let plan = resolve(observations: [observation(start: 3, end: 4)])
        expect(plan.status == .ready, "matching source clocks must qualify")
        expect(plan.listenPoints.first?.overlappingSegmentIDs == ["segment-a"], "point must map to exact overlapping passage")
        expect(plan.heldObservationCount == 0, "valid evidence must not be held")
    }

    private static func spanningPointMapsToTwoPassages() {
        let plan = resolve(observations: [observation(start: 7.5, end: 8.5)])
        expect(plan.listenPoints.first?.overlappingSegmentIDs == ["segment-a", "segment-b"], "boundary point must preserve both overlapping passages")
    }

    private static func betweenPassagesRemainsVisible() {
        let plan = CaptureTranscriptAudioAttentionResolver.resolve(
            expectedRecordingAssetID: "asset-1",
            actualRecordingAssetID: "asset-1",
            recordingDurationSeconds: 30,
            transcriptPlaybackDurationSeconds: 30,
            signalDurationSeconds: 30,
            observations: [observation(start: 20, end: 21)],
            segments: segments
        )
        expect(plan.listenPoints.count == 1, "valid point between passages must not disappear")
        expect(plan.listenPoints[0].overlappingSegmentIDs.isEmpty, "between-passage evidence must not invent a transcript anchor")
    }

    private static func wrongAssetFailsClosed() {
        let plan = CaptureTranscriptAudioAttentionResolver.resolve(
            expectedRecordingAssetID: "asset-1",
            actualRecordingAssetID: "asset-2",
            recordingDurationSeconds: 30,
            transcriptPlaybackDurationSeconds: 30,
            signalDurationSeconds: 30,
            observations: [observation(start: 3, end: 4)],
            segments: segments
        )
        expect(plan.status == .heldAssetMismatch, "wrong source identity must hold mapping")
        expect(plan.listenPoints.isEmpty, "wrong source identity must produce no navigation anchors")
    }

    private static func clockMismatchFailsClosed() {
        let plan = CaptureTranscriptAudioAttentionResolver.resolve(
            expectedRecordingAssetID: "asset-1",
            actualRecordingAssetID: "asset-1",
            recordingDurationSeconds: 30,
            transcriptPlaybackDurationSeconds: 26,
            signalDurationSeconds: 30,
            observations: [observation(start: 3, end: 4)],
            segments: segments
        )
        expect(plan.status == .heldClockMismatch, "incompatible clocks must hold mapping")
        expect(plan.listenPoints.isEmpty, "clock mismatch must produce no navigation anchors")
    }

    private static func malformedPointIsHeld() {
        let plan = resolve(observations: [observation(start: 4, end: 3)])
        expect(plan.status == .ready, "a qualified clock stays qualified when one observation is malformed")
        expect(plan.listenPoints.isEmpty, "malformed point must not become navigation")
        expect(plan.heldObservationCount == 1, "malformed point must remain visible in held count")
    }

    private static func outOfRangePassageIsNotMapped() {
        let plan = CaptureTranscriptAudioAttentionResolver.resolve(
            expectedRecordingAssetID: "asset-1",
            actualRecordingAssetID: "asset-1",
            recordingDurationSeconds: 30,
            transcriptPlaybackDurationSeconds: 30,
            signalDurationSeconds: 30,
            observations: [observation(start: 29, end: 30)],
            segments: [
                .init(id: "invalid-segment", startSeconds: 29, endSeconds: 45),
            ]
        )
        expect(plan.listenPoints.count == 1, "valid audio evidence must remain visible")
        expect(plan.listenPoints[0].overlappingSegmentIDs.isEmpty, "out-of-range transcript timing must not become navigation")
    }

    private static func optionalPlaybackDurationUsesBoundedSourceClock() {
        let plan = CaptureTranscriptAudioAttentionResolver.resolve(
            expectedRecordingAssetID: "asset-1",
            actualRecordingAssetID: "asset-1",
            recordingDurationSeconds: 30,
            transcriptPlaybackDurationSeconds: nil,
            signalDurationSeconds: 30,
            observations: [observation(start: 3, end: 4)],
            segments: segments
        )
        expect(plan.status == .ready, "missing optional server duration may use exact asset plus matching local clocks")
        expect(plan.listenPoints.first?.overlappingSegmentIDs == ["segment-a"], "bounded transcript timing may still navigate the exact asset")
    }

    private static func emptyEvidenceIsQualifiedButEmpty() {
        let plan = resolve(observations: [])
        expect(plan.status == .noObservations, "qualified source with no points must say so")
        expect(plan.isClockQualified, "no observations must not imply clock failure")
    }

    private static func resolve(
        observations: [CaptureTranscriptAudioAttentionObservation]
    ) -> CaptureTranscriptAudioAttentionPlan {
        CaptureTranscriptAudioAttentionResolver.resolve(
            expectedRecordingAssetID: "asset-1",
            actualRecordingAssetID: "asset-1",
            recordingDurationSeconds: 30,
            transcriptPlaybackDurationSeconds: 30,
            signalDurationSeconds: 30,
            observations: observations,
            segments: segments
        )
    }

    private static func observation(
        start: TimeInterval,
        end: TimeInterval
    ) -> CaptureTranscriptAudioAttentionObservation {
        .init(
            kind: "possible-dropout",
            severity: "review",
            startSeconds: start,
            endSeconds: end,
            detail: "Listen before deciding."
        )
    }

    private static func expect(
        _ condition: @autoclosure () -> Bool,
        _ message: String
    ) {
        guard condition() else { fatalError("FAIL \(message)") }
    }
}
