import SwiftUI
import QuipslyVideoCore
import AVFoundation

private enum TimelineScrollTarget {
    static let selectedDecision = "timeline-selected-decision-center-target"
}

struct TimelineReviewBoundary: Identifiable, Equatable {
    let id: String
    let laneId: UUID
    let tagId: UUID
    let type: TagType
    let sequenceTime: Double
    let laneName: String

    init(laneId: UUID, tagId: UUID, type: TagType, sequenceTime: Double, laneName: String) {
        self.id = "\(laneId.uuidString)-\(tagId.uuidString)"
        self.laneId = laneId
        self.tagId = tagId
        self.type = type
        self.sequenceTime = sequenceTime
        self.laneName = laneName
    }
}

struct TimelineEditorView: View {
    @ObservedObject var playbackEngine: PlaybackEngine
    @ObservedObject var projectStore: ProjectStore
    var selectedLaneId: UUID?
    var selectedTagId: UUID?
    var visualReviewBoundaries: [TimelineReviewBoundary] = []
    var focusedSourceReviewBoundaries: [TimelineReviewBoundary] = []
    var onSelectTag: ((UUID, UUID?) -> Void)?
    var onAddTag: ((UUID, VideoTag) -> Void)?
    var onRemoveTag: ((UUID, UUID) -> Void)?
    var onUpdateTag: ((UUID, VideoTag) -> Void)?
    var onSelectAdjacentDecision: ((Int) -> Void)?
    var onSelectReviewBoundary: ((TimelineReviewBoundary) -> Void)?
    var onZoomChanged: ((Double, Bool, String) -> Void)?
    var allowExternalOriginalMedia: Bool = false
    
    @Binding var pixelsPerSecond: Double
    @Binding var fitToWindow: Bool
    @State private var playheadDragStart: Double? = nil
    @State private var zoomGestureStartScale: Double? = nil
    private let minTimelinePixelsPerSecond = 0.08
    private let maxTimelinePixelsPerSecond = 320.0
    
    var body: some View {
        AnyView(timelineRoot)
    }

    private var timelineRoot: some View {
        VStack(spacing: 12) {
            timelineHeader
            timelineTruthLegend
            selectedDecisionPrecisionStrip
            timelineZoomControls
            timelineGeometry
            .frame(minHeight: timelineViewportHeight)
        }
        .padding(12)
        .background(
            LinearGradient(
                colors: [
                    Color(red: 0.070, green: 0.082, blue: 0.084).opacity(0.98),
                    Color(red: 0.040, green: 0.045, blue: 0.048).opacity(0.98)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
        .overlay(
            RoundedRectangle(cornerRadius: 22)
                .stroke(Color.white.opacity(0.08), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 22))
    }

    private var timelineZoomControls: some View {
        HStack(spacing: 10) {
            Button {
                zoomTimeline(by: 1.5, label: "Timeline zoomed in")
            } label: {
                Label("= Zoom In", systemImage: "plus.magnifyingglass")
            }
            .help("Zoom timeline in. Shortcut: = or +")

            Button {
                zoomTimeline(by: 1.0 / 1.5, label: "Timeline zoomed out")
            } label: {
                Label("- Zoom Out", systemImage: "minus.magnifyingglass")
            }
            .help("Zoom timeline out. Shortcut: -")

            Button {
                setTimelineZoom(80, label: "Timeline set to cut-edit zoom")
            } label: {
                Label("Cut", systemImage: "line.3.horizontal.decrease.circle")
            }
            .help("Jump to a readable cut-editing scale for SHOW/SKIP decisions.")

            Button {
                setTimelineZoom(240, label: "Timeline set to frame-level zoom")
            } label: {
                Label("\\ Frame", systemImage: "scope")
            }
            .help("Jump into frame-level precision where decision edges are easier to tune. Shortcut: \\")

            Button {
                fitTimelineToWindow(label: "Timeline zoom set to fit overview")
            } label: {
                Label("0 Fit", systemImage: "arrow.left.and.right")
            }
            .help("Fit the full sequence across the visible timeline. Shortcut: 0")

            Text(timelineZoomLabel)
                .font(.caption)
                .foregroundStyle(.secondary)
            Spacer()
        }
        .padding(10)
        .background(Color.black.opacity(0.20))
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(Color.white.opacity(0.07), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .padding(.horizontal)
    }

    private var timelineGeometry: some View {
        GeometryReader { geometry in
            let sidebarWidth: CGFloat = 213
            let trackViewportWidth = max(500, geometry.size.width - sidebarWidth - 1)
            let timelineScale = effectivePixelsPerSecond(trackViewportWidth: trackViewportWidth)

            HStack(spacing: 0) {
                timelineLaneSidebar(sidebarWidth: sidebarWidth)
                Divider()
                timelineScroll(scale: timelineScale, viewportWidth: trackViewportWidth)
            }
            .background(Color.black.opacity(0.22))
            .overlay(
                RoundedRectangle(cornerRadius: 18)
                    .stroke(Color.white.opacity(0.08), lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 18))
        }
    }

    private func timelineLaneSidebar(sidebarWidth: CGFloat) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            if let sequence = projectStore.activeSequence, !sequence.lanes.isEmpty {
                if sequence.lanes.first?.sourceVideo?.is360 == true {
                    HStack {
                        Image(systemName: "camera.aperture")
                            .foregroundColor(.purple)
                        Text("Reframing")
                            .font(.caption)
                            .bold()
                            .foregroundColor(.primary)
                        Spacer()
                    }
                    .padding(.horizontal, 4)
                    .frame(height: 30)
                    .background(Color.purple.opacity(0.1))
                    .cornerRadius(4)
                }
                ForEach(sequence.lanes, id: \.id) { lane in
                    TimelineSidebarLaneView(lane: lane, player: playbackEngine.sourcePlayers[lane.id])
                        .contentShape(Rectangle())
                        .onTapGesture { onSelectTag?(lane.id, nil) }
                }
            } else {
                ForEach(0..<3, id: \.self) { _ in
                    HStack { Spacer() }
                        .frame(height: 40)
                        .background(Color.gray.opacity(0.1))
                        .cornerRadius(4)
                }
            }
        }
        .padding(.vertical, 20)
        .frame(width: sidebarWidth)
        .background(Color.black.opacity(0.26))
    }

    private func timelineScroll(scale timelineScale: Double, viewportWidth trackViewportWidth: CGFloat) -> some View {
        ScrollViewReader { scrollProxy in
            ScrollView(.horizontal) {
                ZStack(alignment: .topLeading) {
                    timelineRuler(scale: timelineScale)
                    visualReviewBoundaryRail(timelineScale: timelineScale)
                        .offset(y: 22)
                        .zIndex(90)
                    timelineTracks(scale: timelineScale)
                    selectedDecisionScrollTarget(scale: timelineScale)
                        .zIndex(102)
                    timelinePlayhead(scale: timelineScale)
                    playheadScrubHandle(timelineScale: timelineScale)
                        .offset(x: CGFloat(playbackEngine.playhead * timelineScale) - 8)
                        .zIndex(101)
                }
                .frame(
                    minWidth: calculateTimelineWidth(pixelsPerSecond: timelineScale, minimumWidth: trackViewportWidth),
                    alignment: .leading
                )
                .simultaneousGesture(timelineMagnificationGesture(currentScale: timelineScale))
                .background(Color.black.opacity(0.22))
                .help("Drag the red playhead to scrub. Pinch on the timeline to zoom. Use -, =/+, \\, or 0 for keyboard zoom.")
            }
            .onAppear { centerSelectedDecision(using: scrollProxy) }
            .onChange(of: selectedTagId) { _ in centerSelectedDecision(using: scrollProxy) }
            .onChange(of: selectedLaneId) { _ in centerSelectedDecision(using: scrollProxy) }
            .onChange(of: pixelsPerSecond) { _ in centerSelectedDecision(using: scrollProxy) }
            .onChange(of: fitToWindow) { _ in centerSelectedDecision(using: scrollProxy) }
        }
    }

    @ViewBuilder
    private func selectedDecisionScrollTarget(scale timelineScale: Double) -> some View {
        if let targetTime = selectedDecisionSequenceTime {
            let targetX = max(0, CGFloat(targetTime * timelineScale))
            HStack(spacing: 0) {
                Color.clear
                    .frame(width: targetX)
                RoundedRectangle(cornerRadius: 2)
                    .fill(Color.white.opacity(0.001))
                    .frame(width: 2, height: timelineViewportHeight)
                    .id(TimelineScrollTarget.selectedDecision)
                    .accessibilityHidden(true)
                Spacer(minLength: 0)
            }
            .frame(height: timelineViewportHeight, alignment: .topLeading)
            .allowsHitTesting(false)
        }
    }

    private func centerSelectedDecision(using proxy: ScrollViewProxy) {
        guard selectedDecisionSequenceTime != nil else { return }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
            withAnimation(.easeInOut(duration: 0.18)) {
                proxy.scrollTo(TimelineScrollTarget.selectedDecision, anchor: .center)
            }
        }
    }

    private func timelineRuler(scale timelineScale: Double) -> some View {
        TimelineRulerView(
            duration: projectStore.activeSequence?.duration ?? 0,
            pixelsPerSecond: timelineScale
        )
        .padding(.top, 0)
        .contentShape(Rectangle())
        .gesture(
            DragGesture(minimumDistance: 0)
                .onChanged { value in
                    let time = boundedSequenceTime(Double(value.location.x) / timelineScale)
                    playbackEngine.scrub(to: time)
                }
                .onEnded { value in
                    let time = boundedSequenceTime(Double(value.location.x) / timelineScale)
                    playbackEngine.seek(to: time)
                }
        )
    }

    @ViewBuilder
    private func timelineTracks(scale timelineScale: Double) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            if let sequence = projectStore.activeSequence, !sequence.lanes.isEmpty {
                if sequence.lanes.first?.sourceVideo?.is360 == true {
                    TimelineKeyframeTrackView(
                        track: playbackEngine.playbackFormat == .vertical9x16 ? sequence.verticalOrientationTrack : sequence.orientationTrack,
                        pixelsPerSecond: timelineScale,
                        duration: sequence.duration
                    )
                }
                ForEach(sequence.lanes, id: \.id) { lane in
                    TimelineLaneView(
                        lane: lane,
                        pixelsPerSecond: timelineScale,
                        selectedTagId: selectedLaneId == lane.id ? selectedTagId : nil,
                        onSelectTag: onSelectTag,
                        onAddTag: onAddTag,
                        onRemoveTag: onRemoveTag,
                        onUpdateTag: onUpdateTag,
                        allowExternalOriginalMedia: allowExternalOriginalMedia
                    )
                }
            } else {
                ForEach(0..<3, id: \.self) { _ in
                    Rectangle()
                        .fill(Color.gray.opacity(0.1))
                        .frame(height: 40)
                        .frame(minWidth: 500)
                }
            }
        }
        .padding(.top, 26)
        .padding(.bottom, 20)
    }

    private func timelinePlayhead(scale timelineScale: Double) -> some View {
        Rectangle()
            .fill(Color.red)
            .frame(width: 2)
            .frame(maxHeight: .infinity)
            .offset(x: CGFloat(playbackEngine.playhead * timelineScale))
            .zIndex(100)
            .animation(.linear(duration: 1.0/60.0), value: playbackEngine.playhead)
    }
    
    private var timelineHeader: some View {
        HStack(alignment: .top, spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                Text("EDIT MAP")
                    .font(.caption2)
                    .fontWeight(.black)
                    .tracking(1.9)
                    .foregroundStyle(Color.yellow.opacity(0.84))
                Text("Whole sources stay intact. Yellow SHOW appears in Play Edit; red SKIP is jumped over.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            timelineStat("lanes", "\(projectStore.activeSequence?.lanes.count ?? 0)", .blue)
            timelineStat("review stops", "\(visualReviewBoundaries.count)", .cyan)
            if !focusedSourceReviewBoundaries.isEmpty {
                timelineStat("source stops", "\(focusedSourceReviewBoundaries.count)", .mint)
            }
            timelineStat("show", "\(activeTagCount)", .yellow)
            timelineStat("skip", "\(cutTagCount)", .red)
            timelineStat("decisions", "\(activeTagCount + cutTagCount)", .orange)
            timelineStat("duration", formatDuration(projectStore.activeSequence?.duration ?? 0), .green)
        }
        .padding(.horizontal)
        .padding(.top, 4)
    }

    private var timelineTruthLegend: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
            legendPill(
                title: "Whole synced lanes",
                detail: "blue = review context, not chopped clips",
                color: .blue,
                systemImage: "rectangle.stack"
            )
            legendPill(
                title: "Play Edit output",
                detail: "yellow SHOW is what appears",
                color: .yellow,
                systemImage: "eye.fill"
            )
            legendPill(
                title: "Review stops",
                detail: "cyan = grouped edit boundary",
                color: .cyan,
                systemImage: "point.3.connected.trianglepath.dotted"
            )
            legendPill(
                title: "Source stops",
                detail: "green = selected source boundary",
                color: .mint,
                systemImage: "scope"
            )
            legendPill(
                title: "Skipped gaps",
                detail: "red SKIP is jumped over",
                color: .red,
                systemImage: "forward.end.fill"
            )
            legendPill(
                title: "Proxy-first",
                detail: "originals stay untouched",
                color: .green,
                systemImage: "bolt.shield"
            )
            }
        }
        .padding(.horizontal)
    }

    private func visualReviewBoundaryRail(timelineScale: Double) -> some View {
        ZStack(alignment: .topLeading) {
            Rectangle()
                .fill(Color.cyan.opacity(0.07))
                .frame(height: 18)
                .overlay(alignment: .leading) {
                    Text("review stops")
                        .font(.caption2)
                        .fontWeight(.bold)
                        .foregroundStyle(Color.cyan.opacity(0.8))
                        .padding(.horizontal, 6)
                }

            ForEach(visualReviewBoundaries) { boundary in
                let isSelected = selectedTagId == boundary.tagId
                let color = boundary.type == .active ? Color.cyan : Color.red.opacity(0.9)

                Button {
                    onSelectReviewBoundary?(boundary)
                } label: {
                    VStack(spacing: 1) {
                        RoundedRectangle(cornerRadius: 2)
                            .fill(isSelected ? Color.white : color)
                            .frame(width: isSelected ? 5 : 3, height: isSelected ? 26 : 18)
                            .shadow(color: isSelected ? Color.white.opacity(0.6) : Color.clear, radius: 4)
                        if isSelected && pixelsPerSecond >= 8 {
                            Text("selected")
                                .font(.caption2)
                                .fontWeight(.black)
                                .foregroundStyle(Color.white)
                                .padding(.horizontal, 5)
                                .padding(.vertical, 1)
                                .background(Color.cyan.opacity(0.75))
                                .clipShape(Capsule())
                        }
                    }
                    .frame(width: max(16, isSelected ? 36 : 18), height: 32, alignment: .top)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Select visual review stop at \(formatPreciseTime(boundary.sequenceTime))")
                .help("Select this grouped visual edit boundary. It chooses the representative lane-level SHOW/SKIP metadata tag for precision editing.")
                .offset(x: CGFloat(boundary.sequenceTime * timelineScale) - 2, y: 0)
            }

            ForEach(focusedSourceReviewBoundaries) { boundary in
                let isSelected = selectedTagId == boundary.tagId
                Button {
                    onSelectReviewBoundary?(boundary)
                } label: {
                    ZStack {
                        Circle()
                            .stroke(isSelected ? Color.white : Color.mint, lineWidth: isSelected ? 3 : 2)
                            .background(Circle().fill(Color.mint.opacity(isSelected ? 0.35 : 0.16)))
                            .frame(width: isSelected ? 18 : 14, height: isSelected ? 18 : 14)
                        Rectangle()
                            .fill(boundary.type == .active ? Color.yellow : Color.red)
                            .frame(width: 3, height: isSelected ? 28 : 20)
                    }
                    .frame(width: 28, height: 32)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Select focused source review stop at \(formatPreciseTime(boundary.sequenceTime))")
                .help("Select this source lane's own SHOW/SKIP metadata decision without hiding the full timeline.")
                .offset(x: CGFloat(boundary.sequenceTime * timelineScale) - 14, y: 0)
                .zIndex(2)
            }
        }
        .frame(height: 32, alignment: .topLeading)
        .help("Cyan review stops are grouped visual edit boundaries. They are navigation targets, distinct from the lane-level SHOW/SKIP metadata below.")
    }

    @ViewBuilder
    private var selectedDecisionPrecisionStrip: some View {
        if let context = selectedDecisionContext {
            let tag = context.tag
            let source = context.sourceVideo
            let sequenceStart = source.offset + tag.startTime
            let sequenceEnd = sequenceStart + tag.duration
            let color = decisionColor(for: tag.type)
            let isShow = tag.type == .active

            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Label(isShow ? "Selected SHOW decision" : "Selected SKIP decision", systemImage: isShow ? "eye.fill" : "forward.end.fill")
                        .font(.caption)
                        .fontWeight(.heavy)
                        .foregroundStyle(color)

                    Text(context.lane.name)
                        .font(.caption)
                        .fontWeight(.semibold)
                        .lineLimit(1)

                    Spacer(minLength: 8)

                    precisionMetric("start", formatPreciseTime(sequenceStart))
                    precisionMetric("end", formatPreciseTime(sequenceEnd))
                    precisionMetric("duration", String(format: "%.2fs", tag.duration))
                }

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        precisionActionButton("Prev visual", "Select the previous visual SHOW/SKIP decision") {
                            onSelectAdjacentDecision?(-1)
                        }
                        precisionActionButton("Next visual", "Select the next visual SHOW/SKIP decision") {
                            onSelectAdjacentDecision?(1)
                        }

                        Divider()
                            .frame(height: 22)

                        precisionActionButton("-1s", "Nudge selected decision earlier by 1 second") {
                            nudgeSelectedDecision(by: -1.0)
                        }
                        precisionActionButton(", -0.1s", "Nudge selected decision earlier by one tenth of a second. Shortcut: ,") {
                            nudgeSelectedDecision(by: -0.1)
                        }
                        precisionActionButton(". +0.1s", "Nudge selected decision later by one tenth of a second. Shortcut: .") {
                            nudgeSelectedDecision(by: 0.1)
                        }
                        precisionActionButton("+1s", "Nudge selected decision later by 1 second") {
                            nudgeSelectedDecision(by: 1.0)
                        }

                        Divider()
                            .frame(height: 22)

                        precisionActionButton("Q Start -0.1", "Extend the selected decision earlier by one tenth of a second. Shortcut: Q") {
                            trimSelectedDecisionStart(by: -0.1)
                        }
                        precisionActionButton("W Start +0.1", "Move the selected decision start later by one tenth of a second. Shortcut: W") {
                            trimSelectedDecisionStart(by: 0.1)
                        }
                        precisionActionButton("O End -0.1", "Move the selected decision end earlier by one tenth of a second. Shortcut: O") {
                            trimSelectedDecisionEnd(by: -0.1)
                        }
                        precisionActionButton("P End +0.1", "Extend the selected decision later by one tenth of a second. Shortcut: P") {
                            trimSelectedDecisionEnd(by: 0.1)
                        }

                        Divider()
                            .frame(height: 22)

                        Button(role: .destructive) {
                            onRemoveTag?(context.lane.id, tag.id)
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                        .help("Remove this metadata decision. The whole source lane and original media remain untouched.")
                    }
                }

                Text("Keyboard micro-edits: ,/. nudge by 0.1s. Q/W move the start edge. O/P move the end edge. Precision controls edit metadata only; source media remains whole.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            .padding(10)
            .background(color.opacity(0.10))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(color.opacity(0.26), lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .padding(.horizontal)
        }
    }

    private func precisionMetric(_ label: String, _ value: String) -> some View {
        VStack(alignment: .trailing, spacing: 1) {
            Text(value)
                .font(.caption.monospacedDigit())
                .fontWeight(.bold)
            Text(label.uppercased())
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 7)
        .padding(.vertical, 4)
        .background(Color.secondary.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 7))
    }

    private func precisionActionButton(_ label: String, _ help: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(.caption)
                .fontWeight(.bold)
                .monospacedDigit()
        }
        .buttonStyle(.bordered)
        .controlSize(.small)
        .help(help)
    }

    private func legendPill(title: String, detail: String, color: Color, systemImage: String) -> some View {
        HStack(spacing: 7) {
            Image(systemName: systemImage)
                .foregroundStyle(color)
            VStack(alignment: .leading, spacing: 1) {
                Text(title.uppercased())
                    .font(.caption2)
                    .fontWeight(.black)
                Text(detail)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 9)
        .padding(.vertical, 6)
        .background(color.opacity(0.10))
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(color.opacity(0.22), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }
    
    private var activeTagCount: Int {
        projectStore.activeSequence?.lanes.reduce(0) { $0 + $1.tags.filter { $0.type == .active }.count } ?? 0
    }
    
    private var cutTagCount: Int {
        projectStore.activeSequence?.lanes.reduce(0) { $0 + $1.tags.filter { $0.type == .cut }.count } ?? 0
    }

    private var selectedDecisionContext: (lane: VideoLane, tag: VideoTag, sourceVideo: SourceVideo)? {
        guard let selectedLaneId,
              let selectedTagId,
              let sequence = projectStore.activeSequence,
              let lane = sequence.lanes.first(where: { $0.id == selectedLaneId }),
              let tag = lane.tags.first(where: { $0.id == selectedTagId }),
              tag.type == .active || tag.type == .cut,
              let sourceVideo = lane.sourceVideo else {
            return nil
        }

        return (lane, tag, sourceVideo)
    }

    private var selectedDecisionSequenceTime: Double? {
        guard let context = selectedDecisionContext else { return nil }
        return context.sourceVideo.offset + context.tag.startTime
    }
    
    private func timelineStat(_ label: String, _ value: String, _ color: Color) -> some View {
        VStack(alignment: .trailing, spacing: 1) {
            Text(value)
                .font(.system(.headline, design: .rounded))
                .foregroundStyle(color)
            Text(label.uppercased())
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 5)
        .background(color.opacity(0.10))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
    
    private func formatDuration(_ seconds: Double) -> String {
        let mins = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return String(format: "%d:%02d", mins, secs)
    }

    private func formatPreciseTime(_ seconds: Double) -> String {
        let safeSeconds = max(0, seconds)
        let minutes = Int(safeSeconds) / 60
        let remaining = safeSeconds - Double(minutes * 60)
        return String(format: "%d:%05.2f", minutes, remaining)
    }

    private func decisionColor(for tagType: TagType) -> Color {
        switch tagType {
        case .active:
            return .yellow
        case .cut:
            return .red
        case .focus:
            return .orange
        default:
            return .blue
        }
    }

    private func nudgeSelectedDecision(by delta: Double) {
        guard let context = selectedDecisionContext else { return }
        var tag = context.tag
        let maxStart = max(0, context.sourceVideo.duration - tag.duration)
        tag.startTime = min(max(0, tag.startTime + delta), maxStart)
        onUpdateTag?(context.lane.id, tag)
    }

    private func trimSelectedDecisionStart(by delta: Double) {
        guard let context = selectedDecisionContext else { return }
        var tag = context.tag
        let originalEnd = tag.startTime + tag.duration
        let maxStart = max(0, originalEnd - 0.1)
        let newStart = min(max(0, tag.startTime + delta), maxStart)
        tag.startTime = newStart
        tag.duration = max(0.1, originalEnd - newStart)
        onUpdateTag?(context.lane.id, tag)
    }

    private func trimSelectedDecisionEnd(by delta: Double) {
        guard let context = selectedDecisionContext else { return }
        var tag = context.tag
        let maxDuration = max(0.1, context.sourceVideo.duration - tag.startTime)
        tag.duration = min(max(0.1, tag.duration + delta), maxDuration)
        onUpdateTag?(context.lane.id, tag)
    }
    
    private var timelineViewportHeight: CGFloat {
        let laneCount = max(projectStore.activeSequence?.lanes.count ?? 3, 3)
        let keyframeHeight = projectStore.activeSequence?.lanes.first?.sourceVideo?.is360 == true ? 32 : 0
        return CGFloat(laneCount * 122 + keyframeHeight + 48)
    }

    private func effectivePixelsPerSecond(trackViewportWidth: CGFloat) -> Double {
        guard fitToWindow, let duration = projectStore.activeSequence?.duration, duration > 0 else {
            return pixelsPerSecond
        }

        let fitted = Double((trackViewportWidth - 24) / CGFloat(duration))
        return min(maxTimelinePixelsPerSecond, max(minTimelinePixelsPerSecond, fitted))
    }

    private func calculateTimelineWidth(pixelsPerSecond scale: Double, minimumWidth: CGFloat) -> CGFloat {
        let duration = projectStore.activeSequence?.duration ?? 0
        return max(minimumWidth, CGFloat(duration * scale) + 24)
    }

    private func boundedSequenceTime(_ seconds: Double) -> Double {
        let duration = projectStore.activeSequence?.duration ?? 0
        guard duration > 0 else { return max(0, seconds) }
        return min(max(0, seconds), duration)
    }

    private var timelineZoomLabel: String {
        if fitToWindow {
            return "whole episode overview · pinch timeline or use Precision for cut editing"
        }

        if pixelsPerSecond >= 220 {
            return String(format: "frame zoom %.0f px/sec · tune edges and tiny gaps", pixelsPerSecond)
        }

        if pixelsPerSecond >= 70 {
            return String(format: "cut zoom %.0f px/sec · SHOW/SKIP decisions are editable", pixelsPerSecond)
        }

        return String(format: "timeline zoom %.1f px/sec · pinch in for fine cuts", pixelsPerSecond)
    }

    private func fitTimelineToWindow(label: String) {
        fitToWindow = true
        zoomGestureStartScale = nil
        onZoomChanged?(pixelsPerSecond, true, label)
    }

    private func setTimelineZoom(_ scale: Double, label: String) {
        fitToWindow = false
        pixelsPerSecond = boundedTimelineScale(scale)
        zoomGestureStartScale = nil
        onZoomChanged?(pixelsPerSecond, false, label)
    }

    private func zoomTimeline(by multiplier: Double, label: String) {
        fitToWindow = false
        pixelsPerSecond = boundedTimelineScale(pixelsPerSecond * multiplier)
        zoomGestureStartScale = nil
        onZoomChanged?(pixelsPerSecond, false, label)
    }

    private func boundedTimelineScale(_ scale: Double) -> Double {
        min(maxTimelinePixelsPerSecond, max(minTimelinePixelsPerSecond, scale))
    }

    private func timelineMagnificationGesture(currentScale: Double) -> some Gesture {
        MagnificationGesture()
            .onChanged { value in
                if zoomGestureStartScale == nil {
                    zoomGestureStartScale = currentScale
                }
                fitToWindow = false
                let startScale = zoomGestureStartScale ?? currentScale
                pixelsPerSecond = boundedTimelineScale(startScale * Double(value))
            }
            .onEnded { _ in
                onZoomChanged?(pixelsPerSecond, false, String(format: "Timeline pinch zoom set to %.1f px/sec", pixelsPerSecond))
                zoomGestureStartScale = nil
            }
    }

    private func playheadScrubHandle(timelineScale: Double) -> some View {
        Rectangle()
            .fill(Color.red.opacity(0.001))
            .frame(width: 16)
            .frame(maxHeight: .infinity)
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { value in
                        if playheadDragStart == nil {
                            playheadDragStart = playbackEngine.playhead
                        }
                        let start = playheadDragStart ?? playbackEngine.playhead
                        let time = boundedSequenceTime(start + Double(value.translation.width) / timelineScale)
                        playbackEngine.scrub(to: time)
                    }
                    .onEnded { value in
                        let start = playheadDragStart ?? playbackEngine.playhead
                        let time = boundedSequenceTime(start + Double(value.translation.width) / timelineScale)
                        playheadDragStart = nil
                        playbackEngine.seek(to: time)
                    }
            )
            .overlay(alignment: .top) {
                VStack(spacing: 0) {
                    Image(systemName: "arrowtriangle.down.fill")
                        .font(.caption2)
                        .foregroundStyle(Color.red)
                    Spacer(minLength: 0)
                }
                .allowsHitTesting(false)
            }
            .help("Drag to scrub sequence time. Program and source monitors follow this playhead.")
    }
}

struct TimelineLaneView: View {
    let lane: VideoLane
    let pixelsPerSecond: Double
    let selectedTagId: UUID?
    var onSelectTag: ((UUID, UUID?) -> Void)?
    var onAddTag: ((UUID, VideoTag) -> Void)?
    var onRemoveTag: ((UUID, UUID) -> Void)?
    var onUpdateTag: ((UUID, VideoTag) -> Void)?
    var allowExternalOriginalMedia: Bool = false
    
    enum ResizeEdge { case left, right }
    @State private var dragStartTime: Double? = nil
    @State private var dragCurrentTime: Double? = nil
    @State private var dragTagType: TagType? = nil
    @State private var resizingTagId: UUID? = nil
    @State private var resizeEdge: ResizeEdge? = nil
    @State private var resizeDelta: Double = 0.0
    
    var body: some View {
        ZStack(alignment: .leading) {
            // Track Background
            RoundedRectangle(cornerRadius: 7)
                .fill(Color.white.opacity(0.035))
                .frame(height: 120)
                .overlay(
                    RoundedRectangle(cornerRadius: 7)
                        .stroke(Color.white.opacity(0.06), lineWidth: 1)
                )
                .onTapGesture {
                    onSelectTag?(lane.id, nil)
                }
            
            if let sv = lane.sourceVideo {
                // Clip (Base opacity to represent inactive default, or full opacity for play-through visual)
                ZStack(alignment: .leading) {
                    sourceInactiveBackdrop()
                    
                    if sv.mediaURL.pathExtension.lowercased() != "mp4" {
                        WaveformView(sourceVideo: sv, allowExternalOriginalMedia: allowExternalOriginalMedia)
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                    } else {
                        // Attempt to extract audio from video too
                        WaveformView(sourceVideo: sv, allowExternalOriginalMedia: allowExternalOriginalMedia)
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                    }
                    
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(Color.blue.opacity(0.40), style: StrokeStyle(lineWidth: 1, dash: [8, 6]))
                    sourceLaneTruthOverlay(sourceVideo: sv)
                }
                .frame(width: CGFloat(sv.duration * pixelsPerSecond), height: 116)
                .cornerRadius(4)
                .offset(x: CGFloat(sv.offset * pixelsPerSecond))
                .contentShape(Rectangle())
                #if os(macOS)
                .gesture(
                    DragGesture(minimumDistance: 5)
                        .modifiers(.option)
                        .onChanged { value in
                            let time = Double(value.location.x) / pixelsPerSecond - sv.offset
                            if dragStartTime == nil {
                                dragStartTime = time
                            }
                            dragCurrentTime = time
                        }
                        .onEnded { value in
                            guard let start = dragStartTime else { return }
                            let end = Double(value.location.x) / pixelsPerSecond - sv.offset
                            
                            let minTime = min(start, end)
                            let maxTime = max(start, end)
                            let duration = maxTime - minTime
                            
                            if duration > 0.1 {
                                let tag = VideoTag(id: UUID(), type: .active, startTime: minTime, duration: duration)
                                onAddTag?(lane.id, tag)
                            }
                            
                            dragStartTime = nil
                            dragCurrentTime = nil
                        }
                )
                #else
                .gesture(
                    DragGesture(minimumDistance: 5)
                        .onChanged { value in
                            let time = Double(value.location.x) / pixelsPerSecond - sv.offset
                            if dragStartTime == nil {
                                dragStartTime = time
                            }
                            dragCurrentTime = time
                        }
                        .onEnded { value in
                            guard let start = dragStartTime else { return }
                            let end = Double(value.location.x) / pixelsPerSecond - sv.offset
                            
                            let minTime = min(start, end)
                            let maxTime = max(start, end)
                            let duration = maxTime - minTime
                            
                            if duration > 0.1 {
                                let tag = VideoTag(id: UUID(), type: .active, startTime: minTime, duration: duration)
                                onAddTag?(lane.id, tag)
                            }
                            
                            dragStartTime = nil
                            dragCurrentTime = nil
                        }
                )
                #endif
                .allowsHitTesting(false)
                
                // Hit layers for drawing metadata decisions on top of whole
                // source lanes. These create SHOW/SKIP overlays; they never
                // slice media or replace the underlying source.
                #if os(macOS)
                decisionDrawingLayer(sourceVideo: sv, tagType: .active, modifiers: .option)
                    .zIndex(12)
                decisionDrawingLayer(sourceVideo: sv, tagType: .cut, modifiers: [.command, .option])
                    .zIndex(13)
                #else
                decisionDrawingLayer(sourceVideo: sv, tagType: .active)
                    .zIndex(12)
                #endif
                
                // Decision overlays. Dense Premiere rescues can contain hundreds
                // of decisions per lane, so the overview path uses a lightweight
                // canvas instead of hundreds of live SwiftUI buttons.
                if usesDenseDecisionRendering {
                    denseDecisionCanvas(sourceVideo: sv)
                        .frame(width: CGFloat(sv.duration * pixelsPerSecond), height: 116)
                        .offset(x: CGFloat(sv.offset * pixelsPerSecond))
                        .allowsHitTesting(false)
                        .zIndex(18)
                    denseDecisionBadge
                        .offset(x: CGFloat(sv.offset * pixelsPerSecond) + 8, y: 83)
                        .zIndex(22)
                } else {
                    ForEach(lane.tags) { tag in
                        interactiveDecisionOverlay(tag: tag, sourceVideo: sv)
                    }
                }

                decisionCoverageRail(sourceVideo: sv)
                    .frame(width: CGFloat(sv.duration * pixelsPerSecond), height: 14)
                    .offset(x: CGFloat(sv.offset * pixelsPerSecond), y: 98)
                    .allowsHitTesting(false)
                    .zIndex(24)
                
                // Temporary Highlight while dragging
                if let start = dragStartTime, let current = dragCurrentTime {
                    let minT = min(start, current)
                    let dur = abs(current - start)
                    Rectangle()
                        .fill(color(for: dragTagType ?? .active).opacity(0.4))
                        .frame(width: CGFloat(dur * pixelsPerSecond), height: 116)
                        .offset(x: CGFloat((sv.offset + minT) * pixelsPerSecond))
                        .overlay(
                            Rectangle()
                                .stroke(color(for: dragTagType ?? .active).opacity(0.95), style: StrokeStyle(lineWidth: 1, dash: [5]))
                                .frame(width: CGFloat(dur * pixelsPerSecond), height: 116)
                                .offset(x: CGFloat((sv.offset + minT) * pixelsPerSecond))
                        )
                }
            }
        }
        .frame(height: 120)
    }

    #if os(macOS)
    private func decisionDrawingLayer(sourceVideo sv: SourceVideo, tagType: TagType, modifiers: EventModifiers) -> some View {
        Rectangle()
            .fill(Color.clear)
            .frame(width: CGFloat(sv.duration * pixelsPerSecond), height: 116)
            .offset(x: CGFloat(sv.offset * pixelsPerSecond))
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 5)
                    .modifiers(modifiers)
                    .onChanged { value in
                        updateDecisionDrag(value, sourceVideo: sv, tagType: tagType)
                    }
                    .onEnded { value in
                        finishDecisionDrag(value, sourceVideo: sv, tagType: tagType)
                    }
            )
    }
    #else
    private func decisionDrawingLayer(sourceVideo sv: SourceVideo, tagType: TagType) -> some View {
        Rectangle()
            .fill(Color.clear)
            .frame(width: CGFloat(sv.duration * pixelsPerSecond), height: 116)
            .offset(x: CGFloat(sv.offset * pixelsPerSecond))
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 5)
                    .onChanged { value in
                        updateDecisionDrag(value, sourceVideo: sv, tagType: tagType)
                    }
                    .onEnded { value in
                        finishDecisionDrag(value, sourceVideo: sv, tagType: tagType)
                    }
            )
    }
    #endif

    private func updateDecisionDrag(_ value: DragGesture.Value, sourceVideo sv: SourceVideo, tagType: TagType) {
        let time = boundedSourceTime(from: value.location.x, sourceVideo: sv)
        if dragStartTime == nil {
            dragStartTime = time
        }
        dragTagType = tagType
        dragCurrentTime = time
    }

    private func finishDecisionDrag(_ value: DragGesture.Value, sourceVideo sv: SourceVideo, tagType: TagType) {
        guard let start = dragStartTime else {
            resetDecisionDrag()
            return
        }

        let end = boundedSourceTime(from: value.location.x, sourceVideo: sv)
        let minTime = min(start, end)
        let maxTime = max(start, end)
        let duration = maxTime - minTime

        if duration > 0.1 {
            onAddTag?(lane.id, VideoTag(id: UUID(), type: tagType, startTime: minTime, duration: duration))
        }

        resetDecisionDrag()
    }

    private func resetDecisionDrag() {
        dragStartTime = nil
        dragCurrentTime = nil
        dragTagType = nil
    }

    private func boundedSourceTime(from locationX: CGFloat, sourceVideo sv: SourceVideo) -> Double {
        let rawTime = Double(locationX) / pixelsPerSecond - sv.offset
        return min(max(0, rawTime), sv.duration)
    }

    private func color(for tagType: TagType) -> Color {
        switch tagType {
        case .active:
            return .yellow
        case .cut:
            return .red
        case .focus:
            return .purple
        case .highlight:
            return .orange
        case .meme:
            return .pink
        case .keep:
            return .green
        }
    }

    private var usesDenseDecisionRendering: Bool {
        if pixelsPerSecond < 1.25 {
            return true
        }
        if pixelsPerSecond < 8, lane.tags.count > 160 {
            return true
        }
        if pixelsPerSecond < 24, lane.tags.count > 320 {
            return true
        }
        return false
    }

    private var showDecisionCount: Int {
        lane.tags.filter { $0.type == .active }.count
    }

    private var skipDecisionCount: Int {
        lane.tags.filter { $0.type == .cut }.count
    }

    private func sourceInactiveBackdrop() -> some View {
        ZStack {
            Rectangle()
                .fill(
                    LinearGradient(
                        colors: [
                            Color.blue.opacity(0.085),
                            Color.cyan.opacity(0.035)
                        ],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )

            Canvas { context, size in
                let spacing: CGFloat = 16
                var x: CGFloat = -size.height
                while x < size.width {
                    var path = Path()
                    path.move(to: CGPoint(x: x, y: size.height))
                    path.addLine(to: CGPoint(x: x + size.height, y: 0))
                    context.stroke(path, with: .color(Color.blue.opacity(0.08)), lineWidth: 1)
                    x += spacing
                }
            }
        }
        .overlay(alignment: .center) {
            if showDecisionCount == 0 && skipDecisionCount == 0 {
                Text("FULL SOURCE LANE · INACTIVE IN PLAY EDIT UNTIL SHOW")
                    .font(.caption2)
                    .fontWeight(.black)
                    .tracking(1.2)
                    .foregroundStyle(Color.blue.opacity(0.48))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(.thinMaterial)
                    .clipShape(Capsule())
                    .allowsHitTesting(false)
            }
        }
    }

    private func sourceLaneTruthOverlay(sourceVideo sv: SourceVideo) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 6) {
                Label("Whole source lane", systemImage: laneKindIcon)
                    .font(.caption2)
                    .fontWeight(.bold)
                    .foregroundStyle(Color.blue.opacity(0.92))

                if sv.proxyURL != nil {
                    Text("PROXY")
                        .font(.caption2)
                        .fontWeight(.black)
                        .foregroundStyle(Color.green.opacity(0.95))
                        .padding(.horizontal, 5)
                        .padding(.vertical, 2)
                        .background(Color.green.opacity(0.14))
                        .clipShape(Capsule())
                }

                Text("\(showDecisionCount) SHOW")
                    .font(.caption2)
                    .fontWeight(.black)
                    .foregroundStyle(Color.yellow.opacity(0.95))
                    .padding(.horizontal, 5)
                    .padding(.vertical, 2)
                    .background(Color.yellow.opacity(0.15))
                    .clipShape(Capsule())

                Text("\(skipDecisionCount) SKIP")
                    .font(.caption2)
                    .fontWeight(.black)
                    .foregroundStyle(Color.red.opacity(0.95))
                    .padding(.horizontal, 5)
                    .padding(.vertical, 2)
                    .background(Color.red.opacity(0.13))
                    .clipShape(Capsule())

                Spacer(minLength: 0)
            }
            .padding(.horizontal, 8)
            .padding(.top, 6)

            Spacer()

            HStack(spacing: 6) {
                Text("full source: \(formatDuration(sv.duration))")
                    .font(.caption2)
                    .fontWeight(.semibold)
                    .foregroundStyle(Color.blue.opacity(0.92))
                Text("base media is never cut")
                    .font(.caption2)
                    .fontWeight(.semibold)
                    .foregroundStyle(.secondary)
                Text("edits live as overlays")
                    .font(.caption2)
                    .fontWeight(.semibold)
                    .foregroundStyle(Color.orange.opacity(0.92))
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 8)
            .padding(.bottom, 6)
        }
        .opacity(CGFloat(sv.duration * pixelsPerSecond) > 210 ? 1 : 0)
    }

    private var laneKindIcon: String {
        let role = lane.metadata?.role.lowercased() ?? ""
        let kind = lane.metadata?.mediaKind.lowercased() ?? ""
        if kind == "audio" || role.contains("audio") {
            return "waveform"
        }
        if role.contains("reference") || role.contains("clip") {
            return "play.rectangle"
        }
        return "video"
    }

    private var denseDecisionBadge: some View {
        Text("continuous lane · \(showDecisionCount) SHOW · \(skipDecisionCount) SKIP")
            .font(.caption2)
            .fontWeight(.bold)
            .foregroundStyle(.primary)
            .padding(.horizontal, 7)
            .padding(.vertical, 4)
            .background(.thinMaterial)
            .clipShape(Capsule())
    }

    private func denseDecisionCanvas(sourceVideo sv: SourceVideo) -> some View {
        Canvas { context, size in
            for tag in lane.tags where tag.type == .active || tag.type == .cut {
                let x = max(0, CGFloat(tag.startTime * pixelsPerSecond))
                let width = max(1, CGFloat(tag.duration * pixelsPerSecond))
                let rect = CGRect(x: x, y: 0, width: min(width, max(1, size.width - x)), height: size.height)
                let color: Color = tag.type == .active ? .yellow.opacity(0.30) : .red.opacity(0.34)
                context.fill(Path(rect), with: .color(color))
            }
        }
        .overlay(
            RoundedRectangle(cornerRadius: 4)
                .stroke(Color.white.opacity(0.08), lineWidth: 1)
        )
    }

    private func decisionCoverageRail(sourceVideo sv: SourceVideo) -> some View {
        ZStack(alignment: .leading) {
            RoundedRectangle(cornerRadius: 7)
                .fill(Color.blue.opacity(0.20))

            Canvas { context, size in
                for tag in lane.tags where tag.type == .active || tag.type == .cut {
                    let x = max(0, CGFloat(tag.startTime * pixelsPerSecond))
                    let width = max(1, CGFloat(tag.duration * pixelsPerSecond))
                    let boundedWidth = min(width, max(1, size.width - x))
                    let rect = CGRect(x: x, y: 0, width: boundedWidth, height: size.height)
                    let color: Color = tag.type == .active
                        ? Color.yellow.opacity(0.92)
                        : Color.red.opacity(0.82)
                    context.fill(Path(roundedRect: rect, cornerRadius: 3), with: .color(color))
                }
            }
        }
        .overlay(
            RoundedRectangle(cornerRadius: 7)
                .stroke(Color.white.opacity(0.18), lineWidth: 1)
        )
        .help("Blue is the whole synced source. Yellow SHOW appears in Play Edit. Red SKIP is removed from Play Edit. None of this cuts the source file.")
    }

    @ViewBuilder
    private func interactiveDecisionOverlay(tag: VideoTag, sourceVideo sv: SourceVideo) -> some View {
        if tag.type == .cut {
            interactiveResizableDecisionOverlay(tag: tag, sourceVideo: sv, label: "SKIP", color: .red)
        } else if tag.type == .active {
            interactiveResizableDecisionOverlay(tag: tag, sourceVideo: sv, label: "SHOW", color: .yellow)
        } else if tag.type == .focus {
            Rectangle()
                .stroke(Color.yellow, lineWidth: 2)
                .frame(width: CGFloat(tag.duration * pixelsPerSecond), height: 36)
                .offset(x: CGFloat((sv.offset + tag.startTime) * pixelsPerSecond))
        }
    }

    private func interactiveResizableDecisionOverlay(tag: VideoTag, sourceVideo sv: SourceVideo, label: String, color: Color) -> some View {
        let isResizing = resizingTagId == tag.id
        let effectiveStartTime = tag.startTime + (isResizing && resizeEdge == .left ? resizeDelta : 0)
        let effectiveDuration = max(0.1, tag.duration + (isResizing ? (resizeEdge == .left ? -resizeDelta : resizeDelta) : 0))
        let decisionWidth = CGFloat(effectiveDuration * pixelsPerSecond)
        let handleHitWidth = max(38, min(74, max(decisionWidth * 0.45, pixelsPerSecond * 0.18)))

        return ZStack(alignment: .leading) {
            Button {
                onSelectTag?(lane.id, tag.id)
            } label: {
                tagOverlay(
                    label: label,
                    color: color,
                    width: decisionWidth,
                    isSelected: selectedTagId == tag.id,
                    startTime: effectiveStartTime,
                    duration: effectiveDuration
                )
            }
            .buttonStyle(.plain)
            .frame(width: decisionWidth, height: 116)
            .position(
                x: CGFloat((sv.offset + effectiveStartTime) * pixelsPerSecond) + decisionWidth / 2,
                y: 58
            )
            .contextMenu {
                Button(role: .destructive) {
                    onRemoveTag?(lane.id, tag.id)
                } label: {
                    Label("Delete Show Decision", systemImage: "trash")
                }
            }
            #if os(macOS)
            .accessibilityLabel("Select \(label.lowercased()) decision")
            #endif
            .zIndex(20)

            decisionResizeHandle(edge: .left, color: color, isSelected: selectedTagId == tag.id)
                .frame(width: handleHitWidth, height: 116)
                .offset(x: CGFloat((sv.offset + effectiveStartTime) * pixelsPerSecond) - handleHitWidth / 2)
                .zIndex(30)
                .gesture(
                    DragGesture()
                        .onChanged { value in
                            resizingTagId = tag.id
                            resizeEdge = .left
                            let delta = Double(value.translation.width) / pixelsPerSecond
                            let minimumDelta = -tag.startTime
                            let maximumDelta = tag.duration - 0.1
                            resizeDelta = min(max(delta, minimumDelta), maximumDelta)
                        }
                        .onEnded { _ in
                            var newTag = tag
                            newTag.startTime += resizeDelta
                            newTag.duration -= resizeDelta
                            onUpdateTag?(lane.id, newTag)
                            resizingTagId = nil
                            resizeEdge = nil
                            resizeDelta = 0
                        }
                )

            decisionResizeHandle(edge: .right, color: color, isSelected: selectedTagId == tag.id)
                .frame(width: handleHitWidth, height: 116)
                .offset(x: CGFloat((sv.offset + effectiveStartTime + effectiveDuration) * pixelsPerSecond) - handleHitWidth / 2)
                .zIndex(30)
                .gesture(
                    DragGesture()
                        .onChanged { value in
                            resizingTagId = tag.id
                            resizeEdge = .right
                            let delta = Double(value.translation.width) / pixelsPerSecond
                            let minimumDelta = -tag.duration + 0.1
                            let maximumDelta = max(0, sv.duration - (tag.startTime + tag.duration))
                            resizeDelta = min(max(delta, minimumDelta), maximumDelta)
                        }
                        .onEnded { _ in
                            var newTag = tag
                            newTag.duration += resizeDelta
                            onUpdateTag?(lane.id, newTag)
                            resizingTagId = nil
                            resizeEdge = nil
                            resizeDelta = 0
                        }
                )
        }
    }
    
    private func decisionResizeHandle(edge: ResizeEdge, color: Color, isSelected: Bool) -> some View {
        HStack(spacing: 0) {
            if edge == .right {
                Spacer(minLength: 0)
            }

            RoundedRectangle(cornerRadius: 2)
                .fill(isSelected ? Color.white : color.opacity(0.88))
                .frame(width: isSelected ? 5 : 3, height: isSelected ? 92 : 70)
                .shadow(color: Color.black.opacity(0.45), radius: 3)

            if edge == .left {
                Spacer(minLength: 0)
            }
        }
        .contentShape(Rectangle())
        #if os(macOS)
        .onHover { hovering in
            if hovering {
                NSCursor.resizeLeftRight.push()
            } else {
                NSCursor.pop()
            }
        }
        #endif
        .help(edge == .left ? "Drag to adjust the decision start." : "Drag to adjust the decision end.")
    }

    private func tagOverlay(label: String, color: Color, width: CGFloat, isSelected: Bool, startTime: Double? = nil, duration: Double? = nil) -> some View {
        ZStack(alignment: .topLeading) {
            Rectangle()
                .fill(color.opacity(label == "SKIP" ? 0.32 : 0.20))
            if width > 28 {
                Text(label)
                    .font(.caption2)
                    .fontWeight(.black)
                    .foregroundStyle(label == "SKIP" ? Color.white : Color.black.opacity(0.78))
                    .padding(.horizontal, 6)
                    .padding(.vertical, 3)
                    .background(label == "SKIP" ? Color.red.opacity(0.82) : Color.yellow.opacity(0.92))
                    .clipShape(Capsule())
                    .padding(6)
            }
            if isSelected, width > 104, let startTime, let duration {
                VStack {
                    Spacer()
                    Text(String(format: "%.2fs → %.2fs  ·  %.2fs", startTime, startTime + duration, duration))
                        .font(.caption2)
                        .fontWeight(.semibold)
                        .foregroundStyle(label == "SKIP" ? Color.white.opacity(0.92) : Color.black.opacity(0.78))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 3)
                        .background(.black.opacity(label == "SKIP" ? 0.35 : 0.10))
                        .clipShape(Capsule())
                        .padding(6)
                }
            }
        }
        .frame(width: width, height: 116)
        .overlay(
            RoundedRectangle(cornerRadius: 5)
                .stroke(isSelected ? Color.white : Color.clear, lineWidth: 3)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 5)
                .stroke(color.opacity(isSelected ? 0.70 : 0.24), lineWidth: 1)
        )
        .shadow(color: isSelected ? Color.white.opacity(0.35) : Color.clear, radius: 6)
    }
}

struct TimelineSidebarLaneView: View {
    let lane: VideoLane
    let player: AVPlayer?
    
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Image(systemName: roleIcon)
                    .foregroundStyle(roleColor)
                    .frame(width: 18)
                Text(lane.name)
                    .font(.caption)
                    .fontWeight(.bold)
                    .lineLimit(2)
                Spacer()
            }

            HStack(spacing: 5) {
                Text(roleLabel)
                    .font(.caption2)
                    .fontWeight(.semibold)
                    .foregroundStyle(roleColor)
                Spacer()
                Text(readinessLabel)
                    .font(.caption2)
                    .foregroundStyle(readinessColor)
            }

            HStack(spacing: 5) {
                Text("\(lane.tags.filter { $0.type == .active }.count) show")
                Text("\(lane.tags.filter { $0.type == .cut }.count) skip")
                if let tracks = lane.metadata?.trackIds, !tracks.isEmpty {
                    Text(tracks.joined(separator: ","))
                }
            }
            .font(.caption2)
            .foregroundStyle(.secondary)

            Text("whole source lane")
                .font(.caption2)
                .fontWeight(.bold)
                .foregroundStyle(Color.blue.opacity(0.84))
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(Color.blue.opacity(0.10))
                .clipShape(Capsule())

            GeometryReader { proxy in
                HStack(spacing: 1) {
                    Rectangle()
                        .fill(Color.yellow.opacity(0.75))
                        .frame(width: max(1, proxy.size.width * activeDecisionRatio))
                    Rectangle()
                        .fill(Color.red.opacity(0.60))
                        .frame(width: max(1, proxy.size.width * cutDecisionRatio))
                    Rectangle()
                        .fill(Color.blue.opacity(0.22))
                }
            }
            .frame(height: 7)
            .clipShape(Capsule())
        }
        .padding(8)
        .frame(height: 120)
        .background(roleColor.opacity(0.08))
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(roleColor.opacity(0.22), lineWidth: 1)
        )
        .cornerRadius(8)
    }

    private var role: String {
        lane.metadata?.role.lowercased() ?? ""
    }

    private var roleLabel: String {
        switch role {
        case "charlie_camera": return "Charlie camera"
        case "homer_camera": return "Homer camera"
        case "unresolved_camera": return "Unresolved camera"
        case "reference_clip": return "Reference clip"
        case "source_clip": return "Source clip"
        case "charlie_audio": return "Charlie audio"
        case "homer_audio": return "Homer audio"
        case "audio": return "Audio"
        default: return lane.metadata?.mediaKind.capitalized ?? "Source"
        }
    }

    private var roleIcon: String {
        switch role {
        case "charlie_audio", "homer_audio", "audio": return "waveform"
        case "reference_clip", "source_clip": return "film.stack"
        case "unresolved_camera": return "questionmark.video"
        default: return "video"
        }
    }

    private var roleColor: Color {
        switch role {
        case "charlie_camera", "charlie_audio": return .red
        case "homer_camera", "homer_audio": return .blue
        case "reference_clip", "source_clip": return .green
        case "unresolved_camera": return .orange
        default: return .secondary
        }
    }

    private var readinessLabel: String {
        guard let source = lane.sourceVideo else { return "no source" }
        if player != nil { return source.proxyURL == nil ? "source ready" : "proxy ready" }
        if source.mediaURL.path.contains("__quipsly_missing_media__") || lane.metadata?.declaredExists == false {
            return "missing"
        }
        return "held"
    }

    private var readinessColor: Color {
        switch readinessLabel {
        case "source ready", "proxy ready": return .green
        case "missing": return .red
        default: return .orange
        }
    }

    private var activeDecisionRatio: CGFloat {
        decisionRatio(for: .active)
    }

    private var cutDecisionRatio: CGFloat {
        decisionRatio(for: .cut)
    }

    private func decisionRatio(for type: TagType) -> CGFloat {
        let activeCount = lane.tags.filter { $0.type == .active }.count
        let cutCount = lane.tags.filter { $0.type == .cut }.count
        let total = max(activeCount + cutCount, 1)
        let count = lane.tags.filter { $0.type == type }.count
        return CGFloat(count) / CGFloat(total)
    }
}

private func formatDuration(_ seconds: Double) -> String {
    let safeSeconds = max(0, Int(seconds.rounded()))
    let hours = safeSeconds / 3600
    let minutes = (safeSeconds % 3600) / 60
    let remainingSeconds = safeSeconds % 60
    if hours > 0 {
        return String(format: "%d:%02d:%02d", hours, minutes, remainingSeconds)
    }
    return String(format: "%d:%02d", minutes, remainingSeconds)
}

struct TimelineRulerView: View {
    let duration: Double
    let pixelsPerSecond: Double
    
    var body: some View {
        ZStack(alignment: .topLeading) {
            Rectangle()
                .fill(Color.secondary.opacity(0.06))
                .frame(width: CGFloat(max(duration, 1) * pixelsPerSecond), height: 22)
            
            ForEach(tickValues, id: \.self) { second in
                VStack(alignment: .leading, spacing: 1) {
                    Rectangle()
                        .fill(Color.secondary.opacity(second.truncatingRemainder(dividingBy: majorTickEvery) == 0 ? 0.70 : 0.35))
                        .frame(width: 1, height: second.truncatingRemainder(dividingBy: majorTickEvery) == 0 ? 18 : 10)
                    if second.truncatingRemainder(dividingBy: majorTickEvery) == 0 {
                        Text(format(second))
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
                .offset(x: CGFloat(second * pixelsPerSecond))
            }
        }
        .frame(height: 26)
    }
    
    private var majorTickEvery: Double {
        if pixelsPerSecond < 5 { return 30 }
        if pixelsPerSecond < 12 { return 10 }
        return 5
    }
    
    private var minorTickEvery: Double {
        if pixelsPerSecond < 5 { return 10 }
        if pixelsPerSecond < 12 { return 5 }
        return 1
    }
    
    private var tickValues: [Double] {
        stride(from: 0.0, through: max(duration, 0), by: minorTickEvery).map { $0 }
    }
    
    private func format(_ seconds: Double) -> String {
        let mins = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return String(format: "%d:%02d", mins, secs)
    }
}

struct TimelineKeyframeTrackView: View {
    let track: OrientationTrack
    let pixelsPerSecond: Double
    let duration: Double
    
    var body: some View {
        ZStack(alignment: .leading) {
            // Background
            Rectangle()
                .fill(Color.purple.opacity(0.1))
                .frame(height: 30)
                .frame(width: CGFloat(duration * pixelsPerSecond))
            
            // Keyframes
            ForEach(track.keyframes) { keyframe in
                DiamondShape()
                    .fill(Color.purple)
                    .frame(width: 10, height: 10)
                    .offset(x: CGFloat(keyframe.time * pixelsPerSecond) - 5)
            }
        }
        .frame(height: 30)
    }
}

struct DiamondShape: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.midX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
        path.addLine(to: CGPoint(x: rect.midX, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.midY))
        path.closeSubpath()
        return path
    }
}
