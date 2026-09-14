import Foundation

enum CaptureRecordingTrimPosition {
    static func programTime(sourceSeconds: TimeInterval, sourceDuration: TimeInterval,
                            offset: TimeInterval, programDuration: TimeInterval) -> TimeInterval? {
        guard sourceSeconds.isFinite, sourceDuration.isFinite, offset.isFinite, programDuration.isFinite,
              sourceDuration > 0, programDuration > 0, sourceSeconds >= 0, sourceSeconds <= sourceDuration else { return nil }
        return min(programDuration, max(0, sourceSeconds + offset))
    }
}
