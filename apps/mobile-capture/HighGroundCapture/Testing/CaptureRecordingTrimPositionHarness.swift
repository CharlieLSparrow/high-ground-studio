import Foundation

@main
enum CaptureRecordingTrimPositionHarness {
    static func main() {
        precondition(CaptureRecordingTrimPosition.programTime(sourceSeconds: 2.125, sourceDuration: 30, offset: 5, programDuration: 35) == 7.125)
        precondition(CaptureRecordingTrimPosition.programTime(sourceSeconds: 20.375, sourceDuration: 30, offset: 5, programDuration: 35) == 25.375)
        precondition(CaptureRecordingTrimPosition.programTime(sourceSeconds: 0, sourceDuration: 30, offset: -2, programDuration: 28) == 0)
        for value in [Double.nan, Double.infinity, -1, 31] {
            precondition(CaptureRecordingTrimPosition.programTime(sourceSeconds: value, sourceDuration: 30, offset: 0, programDuration: 30) == nil)
        }
        precondition(CaptureRecordingTrimPosition.programTime(sourceSeconds: 1, sourceDuration: 30, offset: .infinity, programDuration: 30) == nil)
        precondition(CaptureRecordingTrimPosition.programTime(sourceSeconds: 0, sourceDuration: 0, offset: 0, programDuration: 0) == nil)
        print("PASS native trim mapping: exact participant offsets, fractional marks, bounded placement, invalid clocks")
    }
}
