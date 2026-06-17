import SwiftUI

struct NativeTimelineView: View {
    @ObservedObject var sessionContext: EditorSessionContext
    @ObservedObject var playbackContext: EditorPlaybackContext
    
    let pixelsPerSecond: Double = 100.0 // Zoom level

    var body: some View {
        ScrollView(.horizontal) {
            ZStack(alignment: .topLeading) {
                // 1. Static Tracks (Evaluated rarely)
                VStack(alignment: .leading, spacing: 2) {
                    ForEach(sessionContext.cachedTracks) { track in
                        NativeTimelineTrackView(track: track, pixelsPerSecond: pixelsPerSecond)
                    }
                }
                .padding(.vertical, 20)
                
                // 2. Playhead Cursor (Evaluated 60fps)
                TimelinePlayheadCursor(playbackContext: playbackContext, pixelsPerSecond: pixelsPerSecond)
            }
            .frame(minWidth: calculateTimelineWidth(), alignment: .leading)
        }
        .background(Color(NSColor.windowBackgroundColor))
    }
    
    private func calculateTimelineWidth() -> CGFloat {
        let duration = sessionContext.session?.programDuration ?? 0
        return CGFloat(duration * pixelsPerSecond) + 100 // Extra padding
    }
}

struct NativeTimelineTrackView: View {
    let track: NativeEpisodeTimelineTrack
    let pixelsPerSecond: Double
    
    var body: some View {
        ZStack(alignment: .leading) {
            // Track Background
            Rectangle()
                .fill(Color.gray.opacity(0.1))
                .frame(height: 30)
            
            // Clips
            ForEach(track.editDecisions) { decision in
                NativeTimelineClipView(decision: decision, pixelsPerSecond: pixelsPerSecond)
                    .offset(x: CGFloat(decision.timelineStart * pixelsPerSecond))
            }
        }
        .frame(height: 30)
    }
}

struct NativeTimelineClipView: View {
    let decision: LocalEpisodeEditDecision
    let pixelsPerSecond: Double
    
    var body: some View {
        Rectangle()
            .fill(decision.isActive ? (decision.isVideoLike ? Color.blue : Color.green) : Color.gray.opacity(0.5))
            .frame(width: CGFloat(decision.duration * pixelsPerSecond), height: 28)
            .overlay(
                Text(decision.label)
                    .font(.caption2)
                    .lineLimit(1)
                    .padding(.horizontal, 4)
                    .foregroundColor(.white),
                alignment: .leading
            )
            .cornerRadius(4)
    }
}

struct TimelinePlayheadCursor: View {
    @ObservedObject var playbackContext: EditorPlaybackContext
    let pixelsPerSecond: Double
    
    var body: some View {
        Rectangle()
            .fill(Color.red)
            .frame(width: 2)
            .offset(x: CGFloat(playbackContext.playhead * pixelsPerSecond))
            // ZIndex ensures it stays on top of tracks
            .zIndex(100)
    }
}
