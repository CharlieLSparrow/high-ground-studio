import SwiftUI
import QuipslyVideoCore

struct TimelineEditorView: View {
    @ObservedObject var playbackEngine: PlaybackEngine
    @ObservedObject var projectStore: ProjectStore
    
    @State var pixelsPerSecond: Double = 10.0
    
    var body: some View {
        VStack {
            HStack {
                Button("Zoom In") { pixelsPerSecond *= 1.5 }
                Button("Zoom Out") { pixelsPerSecond /= 1.5 }
                Spacer()
            }
            .padding(.horizontal)
            
            HStack(spacing: 0) {
                // Left Sidebar
                VStack(alignment: .leading, spacing: 2) {
                    if let sequence = projectStore.activeSequence {
                        ForEach(sequence.lanes, id: \.id) { lane in
                            TimelineSidebarLaneView(lane: lane)
                        }
                    }
                }
                .padding(.vertical, 20)
                .frame(width: 150)
                .background(Color(NSColor.controlBackgroundColor))
                
                Divider()
                
                // Timeline
                ScrollView(.horizontal) {
                    ZStack(alignment: .topLeading) {
                        // Tracks
                        VStack(alignment: .leading, spacing: 2) {
                            if let sequence = projectStore.activeSequence {
                                ForEach(sequence.lanes, id: \.id) { lane in
                                    TimelineLaneView(lane: lane, pixelsPerSecond: pixelsPerSecond)
                                }
                            }
                        }
                        .padding(.vertical, 20)
                        
                        // Playhead
                        Rectangle()
                            .fill(Color.red)
                            .frame(width: 2)
                            .offset(x: CGFloat(playbackEngine.playhead * pixelsPerSecond))
                            .zIndex(100)
                    }
                    .frame(minWidth: calculateTimelineWidth(), alignment: .leading)
                    .contentShape(Rectangle())
                    .gesture(
                        DragGesture(minimumDistance: 0)
                            .onChanged { value in
                                let time = Double(value.location.x) / pixelsPerSecond
                                playbackEngine.seek(to: max(0, time))
                            }
                    )
                }
            }
        .background(Color(NSColor.windowBackgroundColor))
        }
    }
    
    private func calculateTimelineWidth() -> CGFloat {
        let duration = projectStore.activeSequence?.duration ?? 0
        return CGFloat(duration * pixelsPerSecond) + 100
    }
}

struct TimelineLaneView: View {
    let lane: VideoLane
    let pixelsPerSecond: Double
    
    var body: some View {
        ZStack(alignment: .leading) {
            // Track Background
            Rectangle()
                .fill(Color.gray.opacity(0.1))
                .frame(height: 40)
            
            if let sv = lane.sourceVideo {
                // Clip
                Rectangle()
                    .fill(Color.blue.opacity(0.8))
                    .frame(width: CGFloat(sv.duration * pixelsPerSecond), height: 36)
                    .cornerRadius(4)
                    .offset(x: CGFloat(sv.offset * pixelsPerSecond))
                
                // Tags
                ForEach(lane.tags) { tag in
                    if tag.type == .cut {
                        Rectangle()
                            .fill(Color.red.opacity(0.5))
                            .frame(width: CGFloat(tag.duration * pixelsPerSecond), height: 36)
                            .offset(x: CGFloat((sv.offset + tag.startTime) * pixelsPerSecond))
                    } else if tag.type == .active {
                        Rectangle()
                            .fill(Color.green.opacity(0.5))
                            .frame(width: CGFloat(tag.duration * pixelsPerSecond), height: 36)
                            .offset(x: CGFloat((sv.offset + tag.startTime) * pixelsPerSecond))
                    } else if tag.type == .focus {
                        Rectangle()
                            .stroke(Color.yellow, lineWidth: 2)
                            .frame(width: CGFloat(tag.duration * pixelsPerSecond), height: 36)
                            .offset(x: CGFloat((sv.offset + tag.startTime) * pixelsPerSecond))
                    }
                }
            }
        }
        .frame(height: 40)
    }
}

struct TimelineSidebarLaneView: View {
    let lane: VideoLane
    
    var body: some View {
        HStack {
            Text(lane.name)
                .font(.caption)
                .lineLimit(1)
                .truncationMode(.tail)
            Spacer()
        }
        .padding(.horizontal, 8)
        .frame(height: 40)
        .background(Color.gray.opacity(0.1))
        .cornerRadius(4)
    }
}
