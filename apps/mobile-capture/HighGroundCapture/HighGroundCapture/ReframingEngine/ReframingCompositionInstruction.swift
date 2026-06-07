import AVFoundation
import Foundation

class ReframingCompositionInstruction: NSObject, AVVideoCompositionInstructionProtocol {
    var timeRange: CMTimeRange
    var enablePostProcessing: Bool = false
    var containsTweening: Bool = true
    var requiredSourceTrackIDs: [NSValue]?
    var passthroughTrackID: CMPersistentTrackID = kCMPersistentTrackID_Invalid

    let sourceTrackID: CMPersistentTrackID
    let keyframes: [TransformKeyframe]

    init(timeRange: CMTimeRange, sourceTrackID: CMPersistentTrackID, keyframes: [TransformKeyframe]) {
        self.timeRange = timeRange
        self.sourceTrackID = sourceTrackID
        self.requiredSourceTrackIDs = [NSNumber(value: sourceTrackID)]
        self.keyframes = keyframes.sorted(by: { $0.timeOffset < $1.timeOffset })
        super.init()
    }
}
