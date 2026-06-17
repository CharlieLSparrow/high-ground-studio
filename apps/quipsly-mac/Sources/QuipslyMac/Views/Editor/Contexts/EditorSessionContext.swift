import Combine
import Foundation
import SwiftUI

@MainActor
final class EditorSessionContext: ObservableObject {
    @Published var session: LocalEpisodeEditSession?
    @Published var cachedTracks: [NativeEpisodeTimelineTrack] = []
    @Published var cachedContinuityTracks: [NativeTimelineSourceContinuity] = []
    
    func refresh(with newSession: LocalEpisodeEditSession?) {
        guard session != newSession else { return }
        self.session = newSession
        
        guard let session else {
            cachedTracks = []
            cachedContinuityTracks = []
            return
        }

        let grouped = Dictionary(grouping: session.editDecisions) { $0.trackId }
        cachedTracks = grouped.keys
            .sorted(by: LocalEpisodeEditSession.compareTrackIDsForModel)
            .map { trackID in
                NativeEpisodeTimelineTrack(
                    id: trackID,
                    editDecisions: (grouped[trackID] ?? []).sorted { left, right in
                        left.timelineStart < right.timelineStart || (left.timelineStart == right.timelineStart && left.duration > right.duration)
                    }
                )
            }

        let decisions = session.editDecisions.filter(\.isVideoLike)
        let sourcesByAssetID = Dictionary(grouping: session.sources, by: \.sourceAssetId)
            .compactMapValues { sources in
                sources.sorted { left, right in
                    if left.isVideoLike != right.isVideoLike {
                        return left.isVideoLike && !right.isVideoLike
                    }
                    return left.programStart < right.programStart
                }.first
            }

        let continuityGrouped = Dictionary(grouping: decisions) { decision in
            "\(decision.trackId)|\(decision.sourceAssetId)"
        }

        cachedContinuityTracks = continuityGrouped.values
            .compactMap { decisions -> NativeTimelineSourceContinuity? in
                guard let first = decisions.sorted(by: LocalEpisodeEditSession.editDecisionSortForModel).first else { return nil }
                let sortedDecisions = decisions.sorted(by: LocalEpisodeEditSession.editDecisionSortForModel)
                let source = sourcesByAssetID[first.sourceAssetId]
                return NativeTimelineSourceContinuity(
                    id: "\(first.trackId)-\(first.sourceAssetId)",
                    trackID: first.trackId,
                    sourceAssetID: first.sourceAssetId,
                    title: source?.displayName ?? first.label,
                    sourceDuration: source?.duration ?? sortedDecisions.map(\.sourceEnd).max() ?? 0,
                    decisions: sortedDecisions
                )
            }
            .sorted { left, right in
                if left.trackID != right.trackID {
                    return LocalEpisodeEditSession.compareTrackIDsForModel(left.trackID, right.trackID)
                }
                return left.firstStart < right.firstStart
            }
    }
}
