import Foundation

struct TimelineState: Codable {
    var clips: [TimelineClip]
}

struct TimelineClip: Codable, Identifiable {
    var id: String
    var mediaAssetId: String
    var startTime: Double
    var duration: Double
    var deactivated: Bool
    var transcript: Transcript?
    var transforms: [TransformKeyframe]?
    var mediaOffset: Double = 0.0
}

struct Transcript: Codable {
    var blocks: [TranscriptBlock]
}

struct TranscriptBlock: Codable, Identifiable {
    var id: String
    var text: String
    var startTime: Double
    var endTime: Double
    var deactivated: Bool
}
