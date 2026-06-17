import Foundation

struct NativeEpisodeTimelineTrack: Identifiable, Equatable {
    var id: String
    var editDecisions: [LocalEpisodeEditDecision]
}

struct NativeTimelineSourceContinuity: Identifiable, Equatable {
    var id: String
    var trackID: String
    var sourceAssetID: String
    var title: String
    var sourceDuration: Double
    var decisions: [LocalEpisodeEditDecision]

    var firstStart: Double {
        decisions.first?.timelineStart ?? 0
    }
}
