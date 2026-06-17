import AVFoundation
import Foundation

public class ReframingCompositionInstruction: NSObject, AVVideoCompositionInstructionProtocol {
    public var timeRange: CMTimeRange
    public var enablePostProcessing: Bool = false
    public var containsTweening: Bool = true
    public var requiredSourceTrackIDs: [NSValue]?
    public var passthroughTrackID: CMPersistentTrackID = kCMPersistentTrackID_Invalid

    public let sourceTrackID: CMPersistentTrackID
    public let keyframes: [FramingKeyframe]

    public init(timeRange: CMTimeRange, sourceTrackID: CMPersistentTrackID, keyframes: [FramingKeyframe]) {
        self.timeRange = timeRange
        self.sourceTrackID = sourceTrackID
        self.requiredSourceTrackIDs = [NSNumber(value: sourceTrackID)]
        self.keyframes = keyframes.sorted(by: { $0.time < $1.time })
        super.init()
    }
}
