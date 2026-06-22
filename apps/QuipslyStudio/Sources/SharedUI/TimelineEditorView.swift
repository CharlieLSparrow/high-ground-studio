import SwiftUI
import QuipslyVideoCore
import AVFoundation
#if os(macOS)
import AppKit
#endif

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

struct TimelineShortRecipeSegment: Identifiable, Equatable {
    let id: UUID
    let title: String
    let start: Double
    let end: Double
    let duration: Double
    let index: Int
}

struct TimelineEditorView: View {
    @ObservedObject var playbackEngine: PlaybackEngine
    @ObservedObject var projectStore: ProjectStore
    var selectedLaneId: UUID?
    var selectedTagId: UUID?
    var visualReviewBoundaries: [TimelineReviewBoundary] = []
    var focusedSourceReviewBoundaries: [TimelineReviewBoundary] = []
    var selectedShortTitle: String? = nil
    var selectedShortSegments: [TimelineShortRecipeSegment] = []
    var onSelectTag: ((UUID, UUID?) -> Void)?
    var onAddTag: ((UUID, VideoTag) -> Void)?
    var onRemoveTag: ((UUID, UUID) -> Void)?
    var onUpdateTag: ((UUID, VideoTag) -> Void)?
    var onSelectAdjacentDecision: ((Int) -> Void)?
    var onSelectReviewBoundary: ((TimelineReviewBoundary) -> Void)?
    var onZoomChanged: ((Double, Bool, String) -> Void)?
    var onTimelineHitboxChange: ((CGRect) -> Void)?
    var allowExternalOriginalMedia: Bool = false

    @Binding var pixelsPerSecond: Double
    @Binding var fitToWindow: Bool
    @State private var playheadDragStart: Double? = nil
    @State private var zoomGestureStartScale: Double? = nil
    @State private var zoomGestureStartedFromFit = false
    private let minTimelinePixelsPerSecond = 0.08
    private let maxTimelinePixelsPerSecond = 320.0

    var body: some View {
        AnyView(timelineRoot)
    }

    private var timelineRoot: some View {
        VStack(spacing: 10) {
            timelineHeader
            timelineTruthLegend
            timelineZoomFocusControls
            timelineOperatorHintStrip
            timelineGeometry
                .frame(minHeight: timelineViewportHeight)
            selectedShortRecipeSummaryStrip
            selectedDecisionSummaryStrip
            selectedDecisionPrecisionStrip
        }
        .padding(12)
        .background(
            ZStack {
                QuipslyStudioTheme.timelineMapGradient
                QuipslyStudioTheme.clearingGlowGradient.opacity(0.58)
            }
        )
        .overlay(
            RoundedRectangle(cornerRadius: 22)
            .stroke(QuipslyStudioTheme.honey.opacity(0.12), lineWidth: 1)
        )
            .clipShape(RoundedRectangle(cornerRadius: 22))
        .accessibilityIdentifier("quipsly.timeline.root")
        .accessibilityLabel("Episode Spine. Whole source lanes stay intact; visible and quiet decisions shape Play Edit without touching originals.")
    }

    @ViewBuilder
    private var selectedDecisionSummaryStrip: some View {
        if let context = selectedDecisionContext {
            let color = decisionColor(for: context.tag.type)
            let sequenceStart = context.sourceVideo.offset + context.tag.startTime
            let sequenceEnd = sequenceStart + context.tag.duration
            let isShow = context.tag.type == .active

            HStack(alignment: .top, spacing: 12) {
                Image(systemName: isShow ? "eye.fill" : "forward.end.fill")
                    .font(.title3)
                    .foregroundStyle(color)
                    .frame(width: 34, height: 34)
                    .background(color.opacity(0.12))
                    .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))

                VStack(alignment: .leading, spacing: 3) {
                    Text(isShow ? "Selected visible span" : "Selected quiet gap")
                        .font(.subheadline)
                        .fontWeight(.black)
                        .foregroundStyle(color)
                    Text("\(context.lane.name) · \(formatPreciseTime(sequenceStart)) → \(formatPreciseTime(sequenceEnd)) · \(String(format: "%.2fs", context.tag.duration))")
                        .font(.caption.monospacedDigit())
                        .fontWeight(.semibold)
                        .foregroundStyle(.primary.opacity(0.88))
                        .lineLimit(1)
                        .truncationMode(.middle)
                    Text(isShow
                         ? "Play Edit may show this whole source lane during this span. Tune the marker edges; the source media stays untouched."
                         : "Play Edit jumps this span as a blank gap. Play Through and the Source Grove still reveal the underlying synced media.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer(minLength: 8)

                VStack(alignment: .trailing, spacing: 4) {
                    Text(isShow ? "PROGRAM TRUTH" : "GAP TRUTH")
                        .font(.caption2)
                        .fontWeight(.black)
                        .tracking(0.8)
                        .foregroundStyle(color.opacity(0.92))
                    Text("metadata, not media")
                        .font(.caption2)
                        .fontWeight(.bold)
                        .foregroundStyle(QuipslyStudioTheme.sage)
                }
            }
            .padding(12)
            .background(
                LinearGradient(
                    colors: [
                        color.opacity(0.13),
                        QuipslyStudioTheme.panelLift.opacity(0.46),
                        QuipslyStudioTheme.night.opacity(0.30)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(color.opacity(0.28), lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .padding(.horizontal)
            .accessibilityIdentifier("quipsly.timeline.selectedDecisionSummary")
            .accessibilityLabel(isShow ? "Selected visible decision summary" : "Selected quiet decision summary")
            .accessibilityValue("\(context.lane.name), starts \(formatPreciseTime(sequenceStart)), duration \(String(format: "%.2f seconds", context.tag.duration)). Metadata only; source media remains untouched.")
        }
    }

    @ViewBuilder
    private var selectedShortRecipeSummaryStrip: some View {
        if !selectedShortSegments.isEmpty {
            let title = selectedShortTitle?.trimmingCharacters(in: .whitespacesAndNewlines)
            let safeTitle = title?.isEmpty == false ? title! : "Selected short recipe"
            let totalDuration = selectedShortSegments.reduce(0) { $0 + max(0, $1.duration) }
            let isMultiSegment = selectedShortSegments.count > 1

            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .top, spacing: 12) {
                    Image(systemName: isMultiSegment ? "square.stack.3d.up.fill" : "rectangle.portrait.fill")
                        .font(.title3)
                        .foregroundStyle(QuipslyStudioTheme.moss)
                        .frame(width: 34, height: 34)
                        .background(QuipslyStudioTheme.moss.opacity(0.12))
                        .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))

                    VStack(alignment: .leading, spacing: 3) {
                        Text("Selected short recipe")
                            .font(.subheadline)
                            .fontWeight(.black)
                            .foregroundStyle(QuipslyStudioTheme.moss)
                        Text(safeTitle)
                            .font(.caption)
                            .fontWeight(.bold)
                            .lineLimit(1)
                            .truncationMode(.middle)
                        Text(isMultiSegment
                             ? "This 9:16 recipe gathers ordered moments for Shorts, Reels, and social posts. Source media stays intact."
                             : "This 9:16 recipe is one continuous social clip from the episode spine. Source media stays intact.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    Spacer(minLength: 8)

                    VStack(alignment: .trailing, spacing: 4) {
                        recipeMetric("segments", "\(selectedShortSegments.count)")
                        recipeMetric("total", String(format: "%.1fs", totalDuration))
                    }
                }

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 7) {
                        ForEach(selectedShortSegments) { segment in
                            shortRecipeSegmentPill(segment)
                        }
                    }
                }

                shortRecipePullOutMap(title: safeTitle, segments: selectedShortSegments)
            }
            .padding(12)
            .background(
                LinearGradient(
                    colors: [
                        QuipslyStudioTheme.moss.opacity(0.13),
                        QuipslyStudioTheme.fern.opacity(0.10),
                        QuipslyStudioTheme.panelLift.opacity(0.44),
                        QuipslyStudioTheme.night.opacity(0.28)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(QuipslyStudioTheme.moss.opacity(0.28), lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .padding(.horizontal)
            .accessibilityIdentifier("quipsly.timeline.selectedShortRecipeSummary")
            .accessibilityLabel("Selected short recipe summary")
            .accessibilityValue("\(safeTitle). \(selectedShortSegments.count) segment\(selectedShortSegments.count == 1 ? "" : "s"), total duration \(String(format: "%.1f seconds", totalDuration)).")
        }
    }

    @ViewBuilder
    private func shortRecipePullOutMap(title: String, segments: [TimelineShortRecipeSegment]) -> some View {
        let orderedSegments = segments.sorted { lhs, rhs in
            if lhs.start == rhs.start { return lhs.index < rhs.index }
            return lhs.start < rhs.start
        }
        let mapStart = orderedSegments.map(\.start).min() ?? 0
        let mapEnd = orderedSegments.map(\.end).max() ?? mapStart
        let mapDuration = max(0.001, mapEnd - mapStart)

        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Label("Short pull-out map", systemImage: orderedSegments.count > 1 ? "point.3.connected.trianglepath.dotted" : "timeline.selection")
                    .font(.caption2)
                    .fontWeight(.black)
                    .tracking(0.6)
                    .foregroundStyle(QuipslyStudioTheme.moss)
                Spacer()
                Text("\(formatPreciseTime(mapStart)) → \(formatPreciseTime(mapEnd))")
                    .font(.caption2.monospacedDigit())
                    .fontWeight(.bold)
                    .foregroundStyle(QuipslyStudioTheme.sage)
            }

            GeometryReader { proxy in
                let width = max(proxy.size.width, 1)
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .fill(QuipslyStudioTheme.night.opacity(0.42))
                        .overlay(
                            RoundedRectangle(cornerRadius: 8, style: .continuous)
                                .stroke(QuipslyStudioTheme.sage.opacity(0.12), lineWidth: 1)
                        )

                    ForEach(orderedSegments) { segment in
                        let startFraction = min(1, max(0, (segment.start - mapStart) / mapDuration))
                        let endFraction = min(1, max(startFraction, (segment.end - mapStart) / mapDuration))
                        let segmentWidth = max(10, CGFloat(endFraction - startFraction) * width)
                        let segmentOffset = CGFloat(startFraction) * width

                        RoundedRectangle(cornerRadius: 7, style: .continuous)
                            .fill(
                                LinearGradient(
                                    colors: [
                                        QuipslyStudioTheme.moss.opacity(0.92),
                                        QuipslyStudioTheme.honey.opacity(0.86),
                                        QuipslyStudioTheme.creek.opacity(0.62)
                                    ],
                                    startPoint: .leading,
                                    endPoint: .trailing
                                )
                            )
                            .overlay(alignment: .leading) {
                                Text("\(segment.index)")
                                    .font(.caption2.monospacedDigit())
                                    .fontWeight(.black)
                                    .foregroundStyle(QuipslyStudioTheme.night.opacity(0.88))
                                    .padding(.horizontal, 5)
                            }
                            .frame(width: segmentWidth, height: 20)
                            .offset(x: segmentOffset)
                            .shadow(color: QuipslyStudioTheme.moss.opacity(0.20), radius: 6, y: 2)
                            .accessibilityLabel("Short segment \(segment.index)")
                            .accessibilityValue("\(segment.title), \(formatPreciseTime(segment.start)) to \(formatPreciseTime(segment.end)), duration \(String(format: "%.1f seconds", segment.duration)).")
                    }
                }
            }
            .frame(height: 28)

            Text(orderedSegments.count > 1
                 ? "This short is an ordered recipe. Segments can come from separate episode moments without creating chopped media files."
                 : "This short is one continuous pull-out from the episode spine.")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(2)
        }
        .padding(10)
        .background(QuipslyStudioTheme.night.opacity(0.22))
        .overlay(
            RoundedRectangle(cornerRadius: 13, style: .continuous)
                .stroke(QuipslyStudioTheme.moss.opacity(0.22), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
        .accessibilityIdentifier("quipsly.timeline.shortPullOutMap")
        .accessibilityLabel("Short pull-out map for \(title)")
    }

    private var timelineZoomFocusControls: some View {
        HStack(spacing: 8) {
            Label("Timeline zoom", systemImage: "leaf.arrow.triangle.circlepath")
                .font(.caption)
                .fontWeight(.black)
                .foregroundStyle(QuipslyStudioTheme.honey)

            Button {
                zoomTimeline(by: 1.5, label: "Timeline zoomed in")
            } label: {
                Label("In", systemImage: "plus.magnifyingglass")
            }
            .help("Zoom detail timeline in. Shortcut: = or +")

            Button {
                zoomTimeline(by: 1.0 / 1.5, label: "Timeline zoomed out")
            } label: {
                Label("Out", systemImage: "minus.magnifyingglass")
            }
            .help("Zoom detail timeline out. Shortcut: -")

            Button {
                setTimelineZoomDetail(80, label: "Timeline set to cut-edit zoom")
            } label: {
                Label("Cut view", systemImage: "line.3.horizontal.decrease.circle")
            }
            .help("Jump to a readable decision-editing scale for visible and quiet edges.")

            Button {
                setTimelineZoomDetail(240, label: "Timeline set to frame-level zoom")
            } label: {
                Label("Fine tune", systemImage: "scope")
            }
            .help("Jump into frame-level precision where decision edges are easier to tune. Shortcut: backslash.")

            Button {
                fitTimelineToWindow(label: "Timeline zoom set to fit overview")
            } label: {
                Label("Whole map", systemImage: "arrow.left.and.right")
            }
            .help("Fit the full sequence across the visible timeline. Shortcut: 0")

                Text(timelineZoomFocusLabel)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .minimumScaleFactor(0.78)
            Spacer()
        }
        .padding(10)
        .background(
            LinearGradient(
                colors: [
                    QuipslyStudioTheme.night.opacity(0.50),
                    QuipslyStudioTheme.panelLift.opacity(0.44)
                ],
                startPoint: .leading,
                endPoint: .trailing
            )
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(QuipslyStudioTheme.warmGlassStroke.opacity(0.82), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .padding(.horizontal)
        .accessibilityIdentifier("quipsly.timeline.zoomControls")
        .accessibilityLabel("Timeline zoom controls. Pinch on the Episode Spine or use buttons for overview, edit edges, and fine cut precision.")
        .accessibilityValue(timelineZoomFocusLabel)
    }

    private var timelineGeometry: some View {
        GeometryReader { geometry in
            let sidebarWidth: CGFloat = 220
            let trackViewportWidth = max(500, geometry.size.width - sidebarWidth - 1)
            let timelineScale = effectivePixelsPerSecond(trackViewportWidth: trackViewportWidth)

            HStack(spacing: 0) {
                timelineLaneSidebar(sidebarWidth: sidebarWidth)
                Divider()
                timelineScroll(scale: timelineScale, viewportWidth: trackViewportWidth)
            }
            .background(
                LinearGradient(
                    colors: [
                        QuipslyStudioTheme.night.opacity(0.70),
                        QuipslyStudioTheme.panel.opacity(0.58),
                        QuipslyStudioTheme.soil.opacity(0.20)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .overlay(
                RoundedRectangle(cornerRadius: 18)
                    .stroke(QuipslyStudioTheme.sage.opacity(0.12), lineWidth: 1)
            )
            .background(TimelineHitboxReporter(onChange: onTimelineHitboxChange))
            .clipShape(RoundedRectangle(cornerRadius: 18))
        }
    }

    private func timelineLaneSidebar(sidebarWidth: CGFloat) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            if let sequence = projectStore.activeSequence, !sequence.lanes.isEmpty {
                if sequence.lanes.first?.sourceVideo?.is360 == true {
                    HStack {
                        Image(systemName: "camera.aperture")
                            .foregroundStyle(QuipslyStudioTheme.lichen)
                        Text("Reframing")
                            .font(.caption)
                            .bold()
                            .foregroundStyle(.primary)
                        Spacer()
                    }
                    .padding(.horizontal, 4)
                    .frame(height: 30)
                    .background(QuipslyStudioTheme.lichen.opacity(0.1))
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
        .padding(.top, selectedShortSegments.isEmpty ? 20 : 56)
        .padding(.bottom, 20)
        .frame(width: sidebarWidth)
        .background(QuipslyStudioTheme.dusk.opacity(0.56))
    }

    private func timelineScroll(scale timelineScale: Double, viewportWidth trackViewportWidth: CGFloat) -> some View {
        ScrollViewReader { scrollProxy in
            ScrollView(.horizontal) {
                ZStack(alignment: .topLeading) {
                    timelineRuler(scale: timelineScale)
                    visualReviewBoundaryRail(timelineScale: timelineScale)
                        .offset(y: 22)
                        .zIndex(90)
                    selectedShortRecipeRail(timelineScale: timelineScale)
                        .offset(y: 54)
                        .zIndex(95)
                    timelineTracks(scale: timelineScale)
                    selectedDecisionScrollTarget(scale: timelineScale)
                        .zIndex(102)
                    timelinePlayhead(scale: timelineScale)
                    playheadSharedPlayheadHandle(timelineScale: timelineScale)
                        .offset(x: CGFloat(playbackEngine.playhead * timelineScale) - playheadSharedPlayheadHandleWidth(timelineScale) / 2)
                        .zIndex(101)
                }
                .frame(
                    minWidth: calculateTimelineWidth(pixelsPerSecond: timelineScale, minimumWidth: trackViewportWidth),
                    alignment: .leading
                )
                .simultaneousGesture(timelineMagnificationGesture(currentScale: timelineScale))
                    .background(QuipslyStudioTheme.night.opacity(0.26))
                .help("Drag the red playhead to scrub the shared episode spine. Pinch on the timeline to zoom. Use -, =/+, backslash, or 0 for keyboard zoom.")
                .accessibilityIdentifier("quipsly.timeline.scrollCanvas")
                .accessibilityLabel("Scrollable Episode Spine canvas. Drag the playhead to scrub; pinch to zoom for precision.")
                .accessibilityValue("Playhead \(formatPreciseTime(playbackEngine.playhead)). \(timelineZoomFocusLabel)")
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
        .frame(height: 32, alignment: .topLeading)
        .contentShape(Rectangle())
        .highPriorityGesture(timelineScrubGesture(timelineScale: timelineScale))
        .help("Drag this ruler to scrub the shared episode spine. Program Output and every source monitor follow the same playhead.")
        .accessibilityIdentifier("quipsly.timeline.rulerScrubSurface")
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
        .padding(.top, selectedShortSegments.isEmpty ? 26 : 62)
        .padding(.bottom, 20)
    }

    private func timelinePlayhead(scale timelineScale: Double) -> some View {
        Rectangle()
            .fill(QuipslyStudioTheme.clay)
            .frame(width: 2)
            .frame(maxHeight: .infinity)
            .offset(x: CGFloat(playbackEngine.playhead * timelineScale))
            .zIndex(100)
            .animation(.linear(duration: 1.0/60.0), value: playbackEngine.playhead)
    }

    private var timelineHeader: some View {
        HStack(alignment: .top, spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
            Text("EPISODE SPINE")
                    .font(.caption2)
                    .fontWeight(.black)
                    .tracking(1.9)
                    .foregroundStyle(QuipslyStudioTheme.honey.opacity(0.88))
                Text("Whole synced source lanes stay intact. Honey is visible in Play Edit, clay becomes quiet space, and moss rails mark selected short recipes.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            timelineStat("lanes", "\(projectStore.activeSequence?.lanes.count ?? 0)", QuipslyStudioTheme.creek)
            timelineStat("visible", "\(activeTagCount)", QuipslyStudioTheme.honey)
            timelineStat("quiet", "\(cutTagCount)", QuipslyStudioTheme.clay)
            timelineStat("duration", formatDuration(projectStore.activeSequence?.duration ?? 0), QuipslyStudioTheme.moss)
        }
        .padding(.horizontal)
        .padding(.top, 4)
    }

    private var timelineTruthLegend: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                legendPill(
                    title: "Whole source",
                    detail: "creek = synced source",
                    color: QuipslyStudioTheme.creek,
                    systemImage: "rectangle.stack"
                )
                legendPill(
                    title: "Visible",
                    detail: "honey = Program shows",
                    color: QuipslyStudioTheme.honey,
                    systemImage: "eye.fill"
                )
                legendPill(
                    title: "Quiet gaps",
                    detail: "clay = Play Edit skips",
                    color: QuipslyStudioTheme.clay,
                    systemImage: "forward.end.fill"
                )
                legendPill(
                    title: "Review marks",
                    detail: "thin edit boundaries",
                    color: QuipslyStudioTheme.fern,
                    systemImage: "scope"
                )
                legendPill(
                    title: "Short recipe",
                    detail: "moss = shorts recipe",
                    color: QuipslyStudioTheme.moss,
                    systemImage: "rectangle.portrait.on.rectangle.portrait.angled"
                )
            }
        }
        .padding(.horizontal)
    }

    private var timelineOperatorHintStrip: some View {
        HStack(spacing: 8) {
            operatorHint(
                title: "Shared playhead",
                detail: "drag red line",
                systemImage: "timeline.selection",
                tint: QuipslyStudioTheme.clay
            )
            operatorHint(
                title: "Zoom detail",
                detail: "pinch or buttons",
                systemImage: "plus.magnifyingglass",
                tint: QuipslyStudioTheme.creek
            )
            operatorHint(
                title: "Tune decision",
                detail: "click marker",
                systemImage: "slider.horizontal.3",
                tint: QuipslyStudioTheme.honey
            )
            operatorHint(
                title: "Source safe",
                detail: "metadata, not media",
                systemImage: "lock.open.display",
                tint: QuipslyStudioTheme.moss
            )
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(
            LinearGradient(
                colors: [
                    QuipslyStudioTheme.panelLift.opacity(0.34),
                    QuipslyStudioTheme.fernGlass.opacity(0.14),
                    QuipslyStudioTheme.night.opacity(0.28)
                ],
                startPoint: .leading,
                endPoint: .trailing
            )
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(QuipslyStudioTheme.warmGlassStroke.opacity(0.82), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .padding(.horizontal)
        .accessibilityIdentifier("quipsly.timeline.operatorHints")
        .accessibilityLabel("Timeline operator hints. Shared playhead by dragging the red spine, zoom by pinching or using plus and minus, tune by selecting honey or clay decisions, and source media stays safe.")
    }

    private func operatorHint(title: String, detail: String, systemImage: String, tint: Color) -> some View {
        HStack(spacing: 6) {
            Image(systemName: systemImage)
                .font(.caption)
                .fontWeight(.black)
                .foregroundStyle(tint)
                .frame(width: 18)
            VStack(alignment: .leading, spacing: 0) {
                Text(title.uppercased())
                    .font(.caption2)
                    .fontWeight(.black)
                    .tracking(0.6)
                    .foregroundStyle(tint)
                Text(detail)
                    .font(.caption2)
                    .fontWeight(.semibold)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 5)
        .background(tint.opacity(0.075))
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(tint.opacity(0.14), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private func visualReviewBoundaryRail(timelineScale: Double) -> some View {
        ZStack(alignment: .topLeading) {
            Rectangle()
                .fill(QuipslyStudioTheme.creek.opacity(0.07))
                .frame(height: 18)
                .overlay(alignment: .leading) {
                    Text("review stops")
                        .font(.caption2)
                        .fontWeight(.bold)
                        .foregroundStyle(QuipslyStudioTheme.creek.opacity(0.8))
                        .padding(.horizontal, 6)
                }

            ForEach(visualReviewBoundaries) { boundary in
                let isSelected = selectedTagId == boundary.tagId
                let color = boundary.type == .active ? QuipslyStudioTheme.creek : QuipslyStudioTheme.clay.opacity(0.9)

                Button {
                    onSelectReviewBoundary?(boundary)
                } label: {
                    VStack(spacing: 1) {
                        RoundedRectangle(cornerRadius: 2)
                            .fill(isSelected ? QuipslyStudioTheme.lichen : color)
                            .frame(width: isSelected ? 5 : 3, height: isSelected ? 26 : 18)
                            .shadow(color: isSelected ? QuipslyStudioTheme.lichen.opacity(0.6) : Color.clear, radius: 4)
                        if isSelected && pixelsPerSecond >= 8 {
                            Text("selected")
                                .font(.caption2)
                                .fontWeight(.black)
                                .foregroundStyle(QuipslyStudioTheme.night)
                                .padding(.horizontal, 5)
                                .padding(.vertical, 1)
                                .background(QuipslyStudioTheme.lichen.opacity(0.82))
                                .clipShape(Capsule())
                        }
                    }
                    .frame(width: max(16, isSelected ? 36 : 18), height: 32, alignment: .top)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Select visual review stop at \(formatPreciseTime(boundary.sequenceTime))")
                .help("Select this grouped visual edit boundary. It chooses the representative lane-level honey or clay metadata tag for precision editing.")
                .offset(x: CGFloat(boundary.sequenceTime * timelineScale) - 2, y: 0)
            }

            ForEach(focusedSourceReviewBoundaries) { boundary in
                let isSelected = selectedTagId == boundary.tagId
                Button {
                    onSelectReviewBoundary?(boundary)
                } label: {
                    ZStack {
                        Circle()
                            .stroke(isSelected ? QuipslyStudioTheme.lichen : QuipslyStudioTheme.creek, lineWidth: isSelected ? 3 : 2)
                            .background(Circle().fill(QuipslyStudioTheme.creek.opacity(isSelected ? 0.35 : 0.16)))
                            .frame(width: isSelected ? 18 : 14, height: isSelected ? 18 : 14)
                        Rectangle()
                            .fill(boundary.type == .active ? QuipslyStudioTheme.honey : QuipslyStudioTheme.clay)
                            .frame(width: 3, height: isSelected ? 28 : 20)
                    }
                    .frame(width: 28, height: 32)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Select focused source review stop at \(formatPreciseTime(boundary.sequenceTime))")
                .help("Select this source lane's own honey or clay metadata decision without hiding the full timeline.")
                .offset(x: CGFloat(boundary.sequenceTime * timelineScale) - 14, y: 0)
                .zIndex(2)
            }
        }
        .frame(height: 32, alignment: .topLeading)
        .help("Review marks are grouped visual edit boundaries. They are navigation targets, distinct from the lane-level visible/quiet metadata below.")
    }

    @ViewBuilder
    private func selectedShortRecipeRail(timelineScale: Double) -> some View {
        if !selectedShortSegments.isEmpty {
            let railWidth = calculateTimelineWidth(pixelsPerSecond: timelineScale, minimumWidth: 500)
            ZStack(alignment: .topLeading) {
                RoundedRectangle(cornerRadius: 9)
                    .fill(QuipslyStudioTheme.moss.opacity(0.10))
                    .frame(width: railWidth, height: 30)
                    .overlay(alignment: .leading) {
                        HStack(spacing: 6) {
                            Image(systemName: "rectangle.portrait.on.rectangle.portrait.angled")
                            Text("SHORT RECIPE")
                            Text("·")
                                .foregroundStyle(QuipslyStudioTheme.moss.opacity(0.45))
                            Text((selectedShortTitle?.isEmpty == false ? selectedShortTitle! : "Selected short").uppercased())
                                .lineLimit(1)
                        }
                        .font(.caption2)
                        .fontWeight(.black)
                        .foregroundStyle(QuipslyStudioTheme.moss.opacity(0.95))
                        .padding(.horizontal, 8)
                    }
                    .overlay(alignment: .trailing) {
                        Text(selectedShortSegments.count == 1 ? "1 SEGMENT" : "\(selectedShortSegments.count) SEGMENTS")
                            .font(.caption2)
                            .fontWeight(.black)
                            .foregroundStyle(QuipslyStudioTheme.moss.opacity(0.92))
                            .padding(.horizontal, 8)
                    }

                ForEach(selectedShortSegments) { segment in
                    let x = max(0, CGFloat(segment.start * timelineScale))
                    let width = max(18, CGFloat(segment.duration * timelineScale))
                    RoundedRectangle(cornerRadius: 8)
                        .fill(
                            LinearGradient(
                                colors: [QuipslyStudioTheme.moss.opacity(0.65), QuipslyStudioTheme.honey.opacity(0.55)],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 8)
                                .stroke(Color.white.opacity(0.50), lineWidth: 1)
                        )
                        .overlay(alignment: .leading) {
                            if width > 54 {
                                Text(width > 120 ? "\(segment.index + 1) \(segment.title)" : "\(segment.index + 1)")
                                    .font(.caption2)
                                    .fontWeight(.black)
                                    .foregroundStyle(.black.opacity(0.82))
                                    .lineLimit(1)
                                    .padding(.horizontal, 7)
                            }
                        }
                        .frame(width: width, height: 24)
                        .offset(x: x, y: 3)
                        .help(String(format: "Short recipe segment %d: %.2fs -> %.2fs. This is output metadata over the episode spine.", segment.index + 1, segment.start, segment.end))
                }
            }
            .frame(height: 32, alignment: .topLeading)
            .help("Selected short pull-out rail. Moss/honey blocks are the ordered episode moments that collapse into the derivative 9:16 short. Multiple blocks become one exported social clip.")
        }
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

            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .top, spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        Label(isShow ? "Selected visible span" : "Selected quiet gap", systemImage: isShow ? "eye.fill" : "forward.end.fill")
                            .font(.headline)
                            .fontWeight(.black)
                            .foregroundStyle(color)

                        Text(isShow ? "This source appears in Play Edit for this span." : "Play Edit jumps over this span; Play Through still shows the source.")
                            .font(.caption)
                            .fontWeight(.semibold)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)

                        Text(context.lane.name)
                            .font(.caption)
                            .fontWeight(.semibold)
                            .foregroundStyle(QuipslyStudioTheme.sage)
                            .lineLimit(1)

                        Label(isShow ? "Affects Program Output in Play Edit" : "Affects Play Edit only; Play Through still sees it", systemImage: "point.3.connected.trianglepath.dotted")
                            .font(.caption2)
                            .fontWeight(.black)
                            .foregroundStyle(color.opacity(0.95))
                            .padding(.horizontal, 7)
                            .padding(.vertical, 4)
                            .background(color.opacity(0.10))
                            .clipShape(Capsule())
                    }

                    Spacer(minLength: 8)

                    HStack(spacing: 6) {
                        precisionMetric("start", formatPreciseTime(sequenceStart))
                        precisionMetric("end", formatPreciseTime(sequenceEnd))
                        precisionMetric("duration", String(format: "%.2fs", tag.duration))
                    }
                }

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(alignment: .top, spacing: 10) {
                        precisionActionGroup("Find decision") {
                            precisionActionButton("Prev", "Select the previous visible or quiet visual decision") {
                                onSelectAdjacentDecision?(-1)
                            }
                            precisionActionButton("Next", "Select the next visible or quiet visual decision") {
                                onSelectAdjacentDecision?(1)
                            }
                        }

                        precisionActionGroup("Move segment") {
                            precisionActionButton("-1s", "Nudge selected decision earlier by 1 second") {
                                nudgeSelectedDecision(by: -1.0)
                            }
                            precisionActionButton(",-0.1", "Nudge selected decision earlier by one tenth of a second. Shortcut: ,") {
                                nudgeSelectedDecision(by: -0.1)
                            }
                            precisionActionButton(".+0.1", "Nudge selected decision later by one tenth of a second. Shortcut: .") {
                                nudgeSelectedDecision(by: 0.1)
                            }
                            precisionActionButton("+1s", "Nudge selected decision later by 1 second") {
                                nudgeSelectedDecision(by: 1.0)
                            }
                        }

                        precisionActionGroup("Tune decision edges") {
                            precisionActionButton("Q start -0.1", "Extend the selected decision earlier by one tenth of a second. Shortcut: Q") {
                                trimSelectedDecisionStart(by: -0.1)
                            }
                            precisionActionButton("W start +0.1", "Move the selected decision start later by one tenth of a second. Shortcut: W") {
                                trimSelectedDecisionStart(by: 0.1)
                            }
                            precisionActionButton("O end -0.1", "Move the selected decision end earlier by one tenth of a second. Shortcut: O") {
                                trimSelectedDecisionEnd(by: -0.1)
                            }
                            precisionActionButton("P end +0.1", "Extend the selected decision later by one tenth of a second. Shortcut: P") {
                                trimSelectedDecisionEnd(by: 0.1)
                            }
                        }

                        precisionActionGroup("Source safe remove") {
                            Button(role: .destructive) {
                                onRemoveTag?(context.lane.id, tag.id)
                            } label: {
                                Label("Delete metadata", systemImage: "trash")
                                    .font(.caption)
                                    .fontWeight(.bold)
                            }
                            .buttonStyle(.bordered)
                            .controlSize(.small)
                            .help("Remove this metadata decision. The whole source lane and original media remain untouched.")
                            .accessibilityIdentifier("quipsly.timeline.precision.deleteMetadata")
                        }
                    }
                }

                Text("Shortcut map: ,/. moves the decision. Q/W trims the start. O/P trims the end. White edge handles are roll edits. This edits metadata, never source media.")
                    .font(.caption2)
                    .fontWeight(.semibold)
                    .foregroundStyle(.secondary)
            }
            .padding(12)
        .background(
            LinearGradient(
                colors: [
                    color.opacity(0.14),
                    QuipslyStudioTheme.panelLift.opacity(0.72),
                    QuipslyStudioTheme.panelWarm.opacity(0.64)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
                )
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(color.opacity(0.48), lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .padding(.horizontal)
        } else {
            noSelectionTimelineGuide
        }
    }

    private var noSelectionTimelineGuide: some View {
        HStack(alignment: .center, spacing: 12) {
            Image(systemName: "hand.point.up.left.fill")
                .font(.title3)
                .foregroundStyle(QuipslyStudioTheme.honey)
                .frame(width: 32, height: 32)
                .background(QuipslyStudioTheme.honey.opacity(0.12))
                .clipShape(RoundedRectangle(cornerRadius: 10))

            VStack(alignment: .leading, spacing: 3) {
                Text("Select a visible span or quiet gap to shape it")
                    .font(.subheadline)
                    .fontWeight(.black)
                Text("Click a honey span or clay gap, or use Prev/Next from the Cedar Grove. Whole sources stay visible; only the decision layer changes.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: 8)

            HStack(spacing: 6) {
                guideChip("VISIBLE", "\(activeTagCount)", QuipslyStudioTheme.honey)
                guideChip("QUIET", "\(cutTagCount)", QuipslyStudioTheme.clay)
                guideChip("ZOOM", timelineZoomFocusLabel.components(separatedBy: " · ").first ?? timelineZoomFocusLabel, QuipslyStudioTheme.creek)
            }
        }
        .padding(12)
        .background(
            LinearGradient(
                colors: [
                    QuipslyStudioTheme.panelLift.opacity(0.64),
                    QuipslyStudioTheme.panelWarm.opacity(0.52)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(QuipslyStudioTheme.warmGlassStroke.opacity(0.82), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal)
        .accessibilityIdentifier("quipsly.timeline.noSelectionGuide")
    }

    private func guideChip(_ label: String, _ value: String, _ color: Color) -> some View {
        VStack(spacing: 1) {
            Text(value)
                .font(.caption)
                .fontWeight(.black)
                .lineLimit(1)
                .minimumScaleFactor(0.74)
            Text(label)
                .font(.caption2)
                .fontWeight(.bold)
                .foregroundStyle(.secondary)
        }
        .foregroundStyle(color)
        .frame(minWidth: 52)
        .padding(.horizontal, 7)
        .padding(.vertical, 5)
        .background(color.opacity(0.10))
        .overlay(
            RoundedRectangle(cornerRadius: 9)
                .stroke(color.opacity(0.15), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 9))
    }

    private func recipeMetric(_ label: String, _ value: String) -> some View {
        HStack(spacing: 5) {
            Text(value)
                .font(.caption.monospacedDigit())
                .fontWeight(.black)
                .foregroundStyle(QuipslyStudioTheme.moss)
            Text(label.uppercased())
                .font(.caption2)
                .fontWeight(.bold)
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(QuipslyStudioTheme.moss.opacity(0.10))
        .overlay(
            Capsule()
                .stroke(QuipslyStudioTheme.moss.opacity(0.18), lineWidth: 1)
        )
        .clipShape(Capsule())
    }

    private func shortRecipeSegmentPill(_ segment: TimelineShortRecipeSegment) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 5) {
                Text("\(segment.index)")
                    .font(.caption2.monospacedDigit())
                    .fontWeight(.black)
                    .foregroundStyle(QuipslyStudioTheme.night)
                    .frame(width: 18, height: 18)
                    .background(QuipslyStudioTheme.moss)
                    .clipShape(Circle())
                Text(segment.title.isEmpty ? "Moment \(segment.index)" : segment.title)
                    .font(.caption2)
                    .fontWeight(.black)
                    .lineLimit(1)
                    .truncationMode(.tail)
            }
            Text("\(formatPreciseTime(segment.start)) → \(formatPreciseTime(segment.end)) · \(String(format: "%.1fs", segment.duration))")
                .font(.caption2.monospacedDigit())
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .frame(minWidth: 148, maxWidth: 220, alignment: .leading)
        .padding(.horizontal, 8)
        .padding(.vertical, 7)
        .background(QuipslyStudioTheme.moss.opacity(0.085))
        .overlay(
            RoundedRectangle(cornerRadius: 11, style: .continuous)
                .stroke(QuipslyStudioTheme.moss.opacity(0.20), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
        .accessibilityLabel("Short recipe segment \(segment.index), \(formatPreciseTime(segment.start)) to \(formatPreciseTime(segment.end)), duration \(String(format: "%.1f seconds", segment.duration)).")
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
        .background(QuipslyStudioTheme.night.opacity(0.30))
        .overlay(
            RoundedRectangle(cornerRadius: 7)
                .stroke(QuipslyStudioTheme.warmGlassStroke.opacity(0.82), lineWidth: 1)
        )
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
        .accessibilityIdentifier("quipsly.timeline.precision.\(precisionIdentifierToken(label))")
    }

    private func precisionIdentifierToken(_ label: String) -> String {
        let normalized = label
            .lowercased()
            .replacingOccurrences(of: "+", with: "plus")
            .replacingOccurrences(of: "-", with: "minus")
            .replacingOccurrences(of: ".", with: "point")
            .replacingOccurrences(of: ",", with: "comma")
            .replacingOccurrences(of: "/", with: "slash")
            .replacingOccurrences(of: " ", with: "")
        let safeString = normalized.unicodeScalars.map { scalar -> String in
            CharacterSet.alphanumerics.contains(scalar) ? String(scalar) : "_"
        }.joined()
        let token = safeString
            .split(separator: "_", omittingEmptySubsequences: true)
            .joined(separator: "_")
        return token.isEmpty ? "action" : token
    }

    private func precisionActionGroup<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title.uppercased())
                .font(.caption2)
                .fontWeight(.black)
                .tracking(0.6)
                .foregroundStyle(QuipslyStudioTheme.sage.opacity(0.92))
            HStack(spacing: 6) {
                content()
            }
        }
        .padding(8)
        .background(QuipslyStudioTheme.night.opacity(0.34))
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(QuipslyStudioTheme.warmGlassStroke.opacity(0.82), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 10))
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
            return QuipslyStudioTheme.honey
        case .cut:
            return QuipslyStudioTheme.clay
        case .focus:
            return QuipslyStudioTheme.lichen
        default:
            return QuipslyStudioTheme.creek
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
        let selectedShortRailHeight = selectedShortSegments.isEmpty ? 0 : 36
        return CGFloat(laneCount * 112 + keyframeHeight + 48 + selectedShortRailHeight)
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

    private var timelineZoomFocusLabel: String {
        if fitToWindow {
            return "whole episode overview · pinch to zoom, drag the red thread, click honey or clay"
        }

        if pixelsPerSecond >= 220 {
            return String(format: "frame zoom %.0f px/sec · tune edges and tiny gaps", pixelsPerSecond)
        }

        if pixelsPerSecond >= 70 {
            return String(format: "cut zoom %.0f px/sec · decision edges are editable", pixelsPerSecond)
        }

        return String(format: "timeline zoom %.1f px/sec · pinch in for fine cuts; Fit returns to the full forest", pixelsPerSecond)
    }

    private func fitTimelineToWindow(label: String) {
        fitToWindow = true
        zoomGestureStartScale = nil
        zoomGestureStartedFromFit = false
        onZoomChanged?(pixelsPerSecond, true, label)
    }

    private func setTimelineZoomDetail(_ scale: Double, label: String) {
        fitToWindow = false
        pixelsPerSecond = boundedTimelineScale(scale)
        zoomGestureStartScale = nil
        zoomGestureStartedFromFit = false
        onZoomChanged?(pixelsPerSecond, false, label)
    }

    private func zoomTimeline(by multiplier: Double, label: String) {
        fitToWindow = false
        pixelsPerSecond = boundedTimelineScale(pixelsPerSecond * multiplier)
        zoomGestureStartScale = nil
        zoomGestureStartedFromFit = false
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
                    zoomGestureStartedFromFit = fitToWindow
                }
                fitToWindow = false
                let startScale = zoomGestureStartScale ?? currentScale
                let boundedGesture = max(0.20, min(5.0, Double(value)))
                pixelsPerSecond = boundedTimelineScale(startScale * boundedGesture)
            }
            .onEnded { _ in
                let label = zoomGestureStartedFromFit
                    ? String(format: "Timeline pinch left overview at %.1f px/sec", pixelsPerSecond)
                    : String(format: "Timeline pinch zoom set to %.1f px/sec", pixelsPerSecond)
                onZoomChanged?(pixelsPerSecond, false, label)
                zoomGestureStartScale = nil
                zoomGestureStartedFromFit = false
            }
    }

    private func timelineScrubGesture(timelineScale: Double) -> some Gesture {
        DragGesture(minimumDistance: 0, coordinateSpace: .local)
            .onChanged { value in
                let time = boundedSequenceTime(Double(value.location.x) / timelineScale)
                playbackEngine.scrub(to: time)
            }
            .onEnded { value in
                let time = boundedSequenceTime(Double(value.location.x) / timelineScale)
                playbackEngine.seek(to: time)
            }
    }

    private func playheadSharedPlayheadHandleWidth(_ timelineScale: Double) -> CGFloat {
        if fitToWindow || timelineScale < 2 { return 34 }
        if timelineScale < 10 { return 26 }
        return 18
    }

    private func playheadSharedPlayheadHandle(timelineScale: Double) -> some View {
        let handleWidth = playheadSharedPlayheadHandleWidth(timelineScale)
        return Rectangle()
            .fill(Color.red.opacity(0.001))
            .frame(width: handleWidth)
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
                        .foregroundStyle(QuipslyStudioTheme.clay)
                    Spacer(minLength: 0)
                }
                .allowsHitTesting(false)
            }
            .help("Drag to scrub sequence time. Program Output and Source Grove monitors follow this shared playhead.")
            .accessibilityIdentifier("quipsly.timeline.playheadSharedPlayheadHandle")
            .accessibilityLabel("Shared playhead scrub handle")
            .accessibilityValue(formatPreciseTime(playbackEngine.playhead))
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
            RoundedRectangle(cornerRadius: 10)
                .fill(
                    LinearGradient(
                        colors: [
                            QuipslyStudioTheme.creek.opacity(0.050),
                            QuipslyStudioTheme.panelWarm.opacity(0.18),
                            QuipslyStudioTheme.night.opacity(0.30)
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(height: 104)
                .overlay(
                    RoundedRectangle(cornerRadius: 10)
                        .stroke(QuipslyStudioTheme.sage.opacity(0.08), lineWidth: 1)
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

                    RoundedRectangle(cornerRadius: 8)
                        .stroke(QuipslyStudioTheme.creek.opacity(0.32), style: StrokeStyle(lineWidth: 1, dash: [10, 7]))
                    sourceLaneTruthOverlay(sourceVideo: sv)
                }
                .frame(width: CGFloat(sv.duration * pixelsPerSecond), height: 100)
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
                        .frame(width: CGFloat(sv.duration * pixelsPerSecond), height: 100)
                        .offset(x: CGFloat(sv.offset * pixelsPerSecond))
                        .allowsHitTesting(false)
                        .zIndex(18)
                    denseDecisionBadge
                        .offset(x: CGFloat(sv.offset * pixelsPerSecond) + 10, y: 68)
                        .zIndex(22)
                } else {
                    ForEach(lane.tags) { tag in
                        interactiveDecisionOverlay(tag: tag, sourceVideo: sv)
                    }
                }

                decisionCoverageRail(sourceVideo: sv)
                    .frame(width: CGFloat(sv.duration * pixelsPerSecond), height: 14)
                    .offset(x: CGFloat(sv.offset * pixelsPerSecond), y: 86)
                    .allowsHitTesting(false)
                    .zIndex(24)

                // Temporary Highlight while dragging
                if let start = dragStartTime, let current = dragCurrentTime {
                    let minT = min(start, current)
                    let dur = abs(current - start)
                    Rectangle()
                        .fill(color(for: dragTagType ?? .active).opacity(0.4))
                        .frame(width: CGFloat(dur * pixelsPerSecond), height: 100)
                        .offset(x: CGFloat((sv.offset + minT) * pixelsPerSecond))
                        .overlay(
                            Rectangle()
                                .stroke(color(for: dragTagType ?? .active).opacity(0.95), style: StrokeStyle(lineWidth: 1, dash: [5]))
                                .frame(width: CGFloat(dur * pixelsPerSecond), height: 100)
                                .offset(x: CGFloat((sv.offset + minT) * pixelsPerSecond))
                        )
                }
            }
        }
        .frame(height: 104)
    }

    #if os(macOS)
    private func decisionDrawingLayer(sourceVideo sv: SourceVideo, tagType: TagType, modifiers: EventModifiers) -> some View {
        Rectangle()
            .fill(Color.clear)
            .frame(width: CGFloat(sv.duration * pixelsPerSecond), height: 100)
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
            .frame(width: CGFloat(sv.duration * pixelsPerSecond), height: 100)
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
            return QuipslyStudioTheme.honey
        case .cut:
            return QuipslyStudioTheme.clay
        case .focus:
            return QuipslyStudioTheme.lichen
        case .highlight:
            return QuipslyStudioTheme.fern
        case .meme:
            return QuipslyStudioTheme.clay
        case .keep:
            return QuipslyStudioTheme.moss
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
                            QuipslyStudioTheme.creek.opacity(0.045),
                            QuipslyStudioTheme.moss.opacity(0.024),
                            QuipslyStudioTheme.soil.opacity(0.040)
                        ],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )

            Canvas { context, size in
                let spacing: CGFloat = 22
                var x: CGFloat = -size.height
                while x < size.width {
                    var path = Path()
                    path.move(to: CGPoint(x: x, y: size.height))
                    path.addLine(to: CGPoint(x: x + size.height, y: 0))
                    context.stroke(path, with: .color(QuipslyStudioTheme.creek.opacity(0.018)), lineWidth: 1)
                    x += spacing
                }
            }
        }
        .overlay(alignment: .center) {
            if showDecisionCount == 0 && skipDecisionCount == 0 {
                Text("WHOLE SOURCE · QUIET UNTIL SHOW")
                    .font(.caption2)
                    .fontWeight(.black)
                    .tracking(1.2)
                    .foregroundStyle(QuipslyStudioTheme.creek.opacity(0.58))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(.thinMaterial)
                    .clipShape(Capsule())
                    .allowsHitTesting(false)
            }
        }
    }

    private func laneDecisionGlyphCount(count: Int, systemImage: String, color: Color, help: String) -> some View {
        HStack(spacing: 4) {
            Image(systemName: systemImage)
                .font(.caption2)
            Text("\(count)")
                .font(.caption2.monospacedDigit())
                .fontWeight(.black)
        }
        .foregroundStyle(color.opacity(0.95))
        .padding(.horizontal, 5)
        .padding(.vertical, 2)
        .background(color.opacity(0.13))
        .clipShape(Capsule())
        .help(help)
    }

    private func sourceLaneTruthOverlay(sourceVideo sv: SourceVideo) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 6) {
                Label("Whole source lane", systemImage: laneKindIcon)
                    .font(.caption2)
                    .fontWeight(.bold)
                    .foregroundStyle(QuipslyStudioTheme.creek.opacity(0.92))

                if sv.proxyURL != nil {
                    Text("PROXY")
                        .font(.caption2)
                        .fontWeight(.black)
                        .foregroundStyle(QuipslyStudioTheme.moss.opacity(0.95))
                        .padding(.horizontal, 5)
                        .padding(.vertical, 2)
                        .background(QuipslyStudioTheme.moss.opacity(0.14))
                        .clipShape(Capsule())
                }

                laneDecisionGlyphCount(
                    count: showDecisionCount,
                    systemImage: "eye.fill",
                    color: QuipslyStudioTheme.honey,
                    help: "Honey count: visible Play Edit decisions on this whole source lane."
                )

                laneDecisionGlyphCount(
                    count: skipDecisionCount,
                    systemImage: "forward.end.fill",
                    color: QuipslyStudioTheme.clay,
                    help: "Clay count: quiet gap decisions on this whole source lane."
                )

                Spacer(minLength: 0)
            }
            .padding(.horizontal, 8)
            .padding(.top, 6)

            Spacer()

            HStack(spacing: 6) {
                Text("full source: \(formatDuration(sv.duration))")
                    .font(.caption2)
                    .fontWeight(.semibold)
                    .foregroundStyle(QuipslyStudioTheme.creek.opacity(0.92))
                Text("base media is never cut")
                    .font(.caption2)
                    .fontWeight(.semibold)
                    .foregroundStyle(.secondary)
                Text("edits live as overlays")
                    .font(.caption2)
                    .fontWeight(.semibold)
                    .foregroundStyle(QuipslyStudioTheme.lichen.opacity(0.92))
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 8)
            .padding(.bottom, 6)
        }
        .opacity(CGFloat(sv.duration * pixelsPerSecond) > 360 ? 1 : 0)
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
        Text("map view · \(showDecisionCount) honey · \(skipDecisionCount) clay")
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
                let insetRect = rect.insetBy(dx: 0, dy: 12)
                let color: Color = tag.type == .active ? QuipslyStudioTheme.honey.opacity(0.050) : QuipslyStudioTheme.clay.opacity(0.062)
                context.fill(Path(roundedRect: insetRect, cornerRadius: 5), with: .color(color))
            }
        }
        .overlay(
            RoundedRectangle(cornerRadius: 4)
                .stroke(QuipslyStudioTheme.creek.opacity(0.10), lineWidth: 1)
        )
    }

    private func decisionCoverageRail(sourceVideo sv: SourceVideo) -> some View {
        ZStack(alignment: .leading) {
            RoundedRectangle(cornerRadius: 7)
                .fill(QuipslyStudioTheme.creek.opacity(0.12))

            Canvas { context, size in
                for tag in lane.tags where tag.type == .active || tag.type == .cut {
                    let x = max(0, CGFloat(tag.startTime * pixelsPerSecond))
                    let width = max(1, CGFloat(tag.duration * pixelsPerSecond))
                    let boundedWidth = min(width, max(1, size.width - x))
                    let rect = CGRect(x: x, y: 0, width: boundedWidth, height: size.height)
                    let color: Color = tag.type == .active
                        ? QuipslyStudioTheme.honey.opacity(0.62)
                        : QuipslyStudioTheme.clay.opacity(0.42)
                    context.fill(Path(roundedRect: rect, cornerRadius: 3), with: .color(color))
                }
            }
        }
        .overlay(
            RoundedRectangle(cornerRadius: 7)
                .stroke(QuipslyStudioTheme.sage.opacity(0.16), lineWidth: 1)
        )
        .help("Creek is the whole synced source. Honey appears in Play Edit. Clay marks quiet gaps. None of this cuts the source file.")
    }

    @ViewBuilder
    private func interactiveDecisionOverlay(tag: VideoTag, sourceVideo sv: SourceVideo) -> some View {
        if tag.type == .cut {
            interactiveResizableDecisionOverlay(tag: tag, sourceVideo: sv, label: "SKIP", color: QuipslyStudioTheme.clay)
        } else if tag.type == .active {
            interactiveResizableDecisionOverlay(tag: tag, sourceVideo: sv, label: "SHOW", color: QuipslyStudioTheme.honey)
        } else if tag.type == .focus {
            Rectangle()
                .stroke(QuipslyStudioTheme.lichen, lineWidth: 2)
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
            .frame(width: decisionWidth, height: 100)
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
                .frame(width: handleHitWidth, height: 100)
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
                .frame(width: handleHitWidth, height: 100)
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
                .frame(width: isSelected ? 7 : 3, height: isSelected ? 98 : 70)
                .shadow(color: isSelected ? color.opacity(0.70) : Color.black.opacity(0.45), radius: isSelected ? 7 : 3)

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
                .fill(color.opacity(label == "SKIP" ? (isSelected ? 0.22 : 0.080) : (isSelected ? 0.21 : 0.082)))
            decisionTextureOverlay(label: label, color: color, isSelected: isSelected)
                .allowsHitTesting(false)
            if isSelected {
                RoundedRectangle(cornerRadius: 7)
                    .fill(QuipslyStudioTheme.panelLift.opacity(0.14))
                    .padding(3)
                    .allowsHitTesting(false)
            }
            if width > 44 {
                HStack(spacing: 0) {
                    Image(systemName: label == "SKIP" ? "forward.end.fill" : "eye.fill")
                        .font(.caption2)
                }
                .foregroundStyle(label == "SKIP" ? Color.white.opacity(0.94) : QuipslyStudioTheme.night.opacity(0.88))
                .frame(width: isSelected ? 24 : 19, height: isSelected ? 22 : 18)
                .background(label == "SKIP" ? QuipslyStudioTheme.clay.opacity(0.72) : QuipslyStudioTheme.honey.opacity(0.78))
                .clipShape(Capsule())
                .padding(6)
            }
            if isSelected, width > 104, let startTime, let duration {
                VStack {
                    Spacer()
                    Text(String(format: "%.2fs → %.2fs  ·  %.2fs", startTime, startTime + duration, duration))
                        .font(.caption2)
                        .fontWeight(.semibold)
                        .foregroundStyle(label == "SKIP" ? Color.white.opacity(0.92) : QuipslyStudioTheme.night.opacity(0.82))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 3)
                        .background(.black.opacity(label == "SKIP" ? 0.35 : 0.10))
                        .clipShape(Capsule())
                        .padding(6)
                }
            }
            if isSelected {
                HStack {
                    Spacer()
                    Label("selected", systemImage: "slider.horizontal.3")
                        .font(.caption2)
                        .fontWeight(.black)
                        .foregroundStyle(label == "SKIP" ? Color.white : QuipslyStudioTheme.night.opacity(0.82))
                        .padding(.horizontal, 7)
                        .padding(.vertical, 3)
                        .background(Color.white.opacity(label == "SKIP" ? 0.18 : 0.68))
                        .clipShape(Capsule())
                        .padding(6)
                }
            }
        }
        .frame(width: width, height: 100)
        .overlay(
            RoundedRectangle(cornerRadius: 5)
                .stroke(isSelected ? QuipslyStudioTheme.lichen.opacity(0.88) : Color.clear, lineWidth: 3)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 5)
                    .stroke(color.opacity(isSelected ? 0.64 : 0.08), lineWidth: isSelected ? 2 : 1)
        )
        .shadow(color: isSelected ? color.opacity(0.42) : Color.clear, radius: 10)
        .accessibilityLabel("\(label) decision\(isSelected ? ", selected" : ""). \(startTime.map { String(format: "%.2fs", $0) } ?? "no start")")
    }

    @ViewBuilder
    private func decisionTextureOverlay(label: String, color: Color, isSelected: Bool) -> some View {
        if label == "SKIP" {
            Canvas { context, size in
                let spacing: CGFloat = 14
                let lineWidth: CGFloat = isSelected ? 2.2 : 1.4
                var x = -size.height
                while x < size.width + size.height {
                    var path = Path()
                    path.move(to: CGPoint(x: x, y: size.height))
                    path.addLine(to: CGPoint(x: x + size.height, y: 0))
                    context.stroke(path, with: .color(Color.white.opacity(isSelected ? 0.22 : 0.13)), lineWidth: lineWidth)
                    x += spacing
                }
            }
        } else {
            VStack(spacing: 0) {
                Spacer()
                Rectangle()
                    .fill(color.opacity(isSelected ? 0.55 : 0.34))
                    .frame(height: isSelected ? 4 : 3)
                Spacer()
            }
        }
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
                    .fontWeight(.black)
                    .lineLimit(2)
                Spacer()
            }

            HStack(spacing: 5) {
                Label(roleLabel, systemImage: "rectangle.stack")
                    .font(.caption2)
                    .fontWeight(.black)
                    .foregroundStyle(roleColor)
                    .labelStyle(.titleOnly)
                Spacer()
                Text(readinessLabel)
                    .font(.caption2)
                    .fontWeight(.bold)
                    .foregroundStyle(readinessColor)
                    .padding(.horizontal, 5)
                    .padding(.vertical, 1)
                    .background(readinessColor.opacity(0.11))
                    .clipShape(Capsule())
            }

            HStack(spacing: 5) {
                laneCountChip(
                    "\(lane.tags.filter { $0.type == .active }.count)",
                    systemImage: "eye.fill",
                    color: QuipslyStudioTheme.honey,
                    help: "Honey count: visible Play Edit decisions."
                )
                laneCountChip(
                    "\(lane.tags.filter { $0.type == .cut }.count)",
                    systemImage: "forward.end.fill",
                    color: QuipslyStudioTheme.clay,
                    help: "Clay count: quiet gap decisions."
                )
                if let tracks = lane.metadata?.trackIds, !tracks.isEmpty {
                    Text(tracks.joined(separator: ","))
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }

            Label("whole lane", systemImage: "lock.open.display")
                .font(.caption2)
                .fontWeight(.bold)
                .foregroundStyle(QuipslyStudioTheme.creek.opacity(0.9))
                .padding(.horizontal, 7)
                .padding(.vertical, 3)
                .background(QuipslyStudioTheme.creek.opacity(0.10))
                .clipShape(Capsule())

            GeometryReader { proxy in
                HStack(spacing: 1) {
                    Rectangle()
                        .fill(QuipslyStudioTheme.honey.opacity(0.62))
                        .frame(width: max(1, proxy.size.width * activeDecisionRatio))
                    Rectangle()
                        .fill(QuipslyStudioTheme.clay.opacity(0.44))
                        .frame(width: max(1, proxy.size.width * cutDecisionRatio))
                    Rectangle()
                        .fill(QuipslyStudioTheme.creek.opacity(0.20))
                }
            }
            .frame(height: 7)
            .clipShape(Capsule())
        }
        .padding(7)
        .frame(height: 104)
        .background(
            LinearGradient(
                colors: [
                    roleColor.opacity(0.075),
                    QuipslyStudioTheme.panelWarm.opacity(0.28),
                    QuipslyStudioTheme.panel.opacity(0.46)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(roleColor.opacity(0.16), lineWidth: 1)
        )
        .cornerRadius(8)
    }

    private func laneCountChip(_ value: String, systemImage: String, color: Color, help: String) -> some View {
        HStack(spacing: 3) {
            Image(systemName: systemImage)
                .font(.caption2)
            Text(value)
                .font(.caption2.monospacedDigit())
                .fontWeight(.black)
        }
        .foregroundStyle(color)
        .padding(.horizontal, 5)
        .padding(.vertical, 2)
        .background(color.opacity(0.10))
        .clipShape(Capsule())
        .help(help)
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
        case "charlie_camera", "charlie_audio": return QuipslyStudioTheme.clay
        case "homer_camera", "homer_audio": return QuipslyStudioTheme.creek
        case "reference_clip", "source_clip": return QuipslyStudioTheme.fern
        case "unresolved_camera": return QuipslyStudioTheme.honey
        default: return QuipslyStudioTheme.sage
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
        case "source ready", "proxy ready": return QuipslyStudioTheme.moss
        case "missing": return QuipslyStudioTheme.clay
        default: return QuipslyStudioTheme.clay
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
                .fill(QuipslyStudioTheme.lichen.opacity(0.1))
                .frame(height: 30)
                .frame(width: CGFloat(duration * pixelsPerSecond))

            // Keyframes
            ForEach(track.keyframes) { keyframe in
                DiamondShape()
                    .fill(QuipslyStudioTheme.lichen)
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

#if os(macOS)
private struct TimelineHitboxReporter: NSViewRepresentable {
    var onChange: ((CGRect) -> Void)?

    func makeNSView(context: Context) -> TimelineHitboxReporterView {
        let view = TimelineHitboxReporterView()
        view.onChange = onChange
        return view
    }

    func updateNSView(_ nsView: TimelineHitboxReporterView, context: Context) {
        nsView.onChange = onChange
        nsView.publishWindowFrame()
    }
}

private final class TimelineHitboxReporterView: NSView {
    var onChange: ((CGRect) -> Void)?

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        publishWindowFrame()
    }

    override func layout() {
        super.layout()
        publishWindowFrame()
    }

    override func setFrameSize(_ newSize: NSSize) {
        super.setFrameSize(newSize)
        publishWindowFrame()
    }

    override func setFrameOrigin(_ newOrigin: NSPoint) {
        super.setFrameOrigin(newOrigin)
        publishWindowFrame()
    }

    func publishWindowFrame() {
        guard window != nil else { return }
        let visibleBounds = visibleRect.isEmpty ? bounds : visibleRect
        let frame = convert(visibleBounds, to: nil)
        guard frame.isNull == false, frame.width > 0, frame.height > 0 else { return }
        DispatchQueue.main.async { [weak self] in
            self?.onChange?(frame)
        }
    }
}
#else
private struct TimelineHitboxReporter: View {
    var onChange: ((CGRect) -> Void)?

    var body: some View {
        Color.clear
    }
}
#endif
