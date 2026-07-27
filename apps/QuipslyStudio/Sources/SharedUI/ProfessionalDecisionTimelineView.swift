import SwiftUI
import QuipslyVideoCore

struct ProfessionalDecisionTimelineView: View {
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
    var onSelectProgramDecision: ((Double) -> Void)?
    var onSwitchSelectedProgramDecision: ((Double, ProgramDecisionKind) -> Void)?
    var onSetSelectedProgramClipMotion: ((Double, ProgramClipMotion, Double?) -> Void)? = nil
    var onSelectAdjacentDecision: ((Int) -> Void)?
    var onSelectReviewBoundary: ((TimelineReviewBoundary) -> Void)?
    var onZoomChanged: ((Double, Bool, String) -> Void)?
    var onTimelineHitboxChange: ((CGRect) -> Void)?
    var allowExternalOriginalMedia: Bool = false
    @Binding var pixelsPerSecond: Double
    @Binding var fitToWindow: Bool

    @State private var magnificationStart = 1.0
    @State private var selectedProgramDecisionStartTime: Double? = nil
    private let labelWidth: CGFloat = 82
    private let rowHeight: CGFloat = 52
    private let rulerHeight: CGFloat = 28
    private let timelineRowCount: CGFloat = 4

    var body: some View {
        VStack(spacing: 8) {
            timelineHeader
            timelineCanvas
            selectedDecisionControls
        }
        .padding(12)
        .background(QuipslyStudioTheme.night.opacity(0.98))
        .overlay(RoundedRectangle(cornerRadius: 18).stroke(QuipslyStudioTheme.quietStroke, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .accessibilityIdentifier("quipsly.timeline.root")
        .accessibilityLabel("Program decision timeline with one authoritative Program row plus whole Charlie, Homer, and clip source lanes")
    }

    private var timelineHeader: some View {
        HStack(spacing: 10) {
            Text("EDIT TIMELINE")
                .font(.system(size: 10, weight: .black, design: .rounded))
                .tracking(1.3)
                .foregroundStyle(QuipslyStudioTheme.honey)
                Text("Program truth: source colors play; rust skips")
                .font(.caption2)
                .foregroundStyle(.secondary)
            Spacer()
            Button { zoom(by: 0.72) } label: { Image(systemName: "plus.magnifyingglass") }
                .help("Zoom in around the shared playhead")
            Button { zoom(by: 1.38) } label: { Image(systemName: "minus.magnifyingglass") }
                .help("Zoom out around the shared playhead")
            Button { fitToWindow = true; onZoomChanged?(pixelsPerSecond, true, "Fit episode") } label: {
                Image(systemName: "arrow.left.and.right")
            }
            .help("Fit whole episode")
            Text(formatTime(playbackEngine.playhead))
                .font(.caption.monospacedDigit().weight(.bold))
                .foregroundStyle(QuipslyStudioTheme.creekMist)
        }
        .buttonStyle(.borderless)
    }

    private var timelineCanvas: some View {
        GeometryReader { geometry in
            let viewport = max(geometry.size.width - labelWidth, 1)
            let scale = fitToWindow ? viewport / max(sequenceDuration, 1) : max(pixelsPerSecond, 0.08)
            let width = max(viewport, sequenceDuration * scale)

            HStack(spacing: 0) {
                VStack(spacing: 4) {
                    Color.clear.frame(height: rulerHeight)
                    rowLabel("Program", color: QuipslyStudioTheme.honey)
                    rowLabel("Charlie", color: QuipslyStudioTheme.creek)
                    rowLabel("Homer", color: QuipslyStudioTheme.moss)
                    rowLabel("Clips", color: QuipslyStudioTheme.honey)
                }
                .frame(width: labelWidth)

                ScrollViewReader { proxy in
                    ScrollView(.horizontal, showsIndicators: true) {
                        VStack(spacing: 4) {
                            scrollAnchorRow(scale: scale)
                            ruler(width: width, scale: scale)
                            programDecisionRow(width: width, scale: scale)
                            decisionRow(role: .charlie, width: width, scale: scale)
                            decisionRow(role: .homer, width: width, scale: scale)
                            decisionRow(role: .clips, width: width, scale: scale)
                        }
                        .frame(width: width, alignment: .leading)
                        .overlay(alignment: .topLeading) {
                            Rectangle()
                                .fill(Color.red)
                                .frame(width: 2, height: rulerHeight + (rowHeight + 4) * timelineRowCount)
                                .offset(x: min(max(playbackEngine.playhead * scale, 0), width - 2))
                                .allowsHitTesting(false)
                        }
                        .contentShape(Rectangle())
                        .gesture(
                            DragGesture(minimumDistance: 0)
                                .onChanged { value in
                                    playbackEngine.seek(to: min(max(value.location.x / scale, 0), sequenceDuration))
                                }
                        )
                        .simultaneousGesture(
                            MagnificationGesture()
                                .onChanged { value in
                                    if magnificationStart == 1 { magnificationStart = pixelsPerSecond }
                                    fitToWindow = false
                                    pixelsPerSecond = min(max(magnificationStart * value, 0.08), 320)
                                }
                                .onEnded { _ in
                                    magnificationStart = 1
                                    onZoomChanged?(pixelsPerSecond, false, "Timeline zoom")
                                }
                        )
                    }
                    .onChange(of: selectedTagId) { _, tagId in
                        guard tagId != nil else { return }
                        withAnimation(.easeInOut(duration: 0.2)) {
                            proxy.scrollTo(timelineAnchorID(for: playbackEngine.playhead), anchor: .center)
                        }
                    }
                    .onChange(of: pixelsPerSecond) { _, _ in
                        centerPlayhead(in: proxy)
                    }
                    .onChange(of: fitToWindow) { _, _ in
                        centerPlayhead(in: proxy)
                    }
                    .onAppear {
                        centerPlayhead(in: proxy)
                    }
                }
            }
        }
        .frame(height: rulerHeight + (rowHeight + 4) * timelineRowCount + 18)
    }

    private func centerPlayhead(in proxy: ScrollViewProxy) {
        let anchorID = timelineAnchorID(for: playbackEngine.playhead)
        DispatchQueue.main.async {
            proxy.scrollTo(anchorID, anchor: .center)
        }
    }

    private func timelineAnchorID(for time: Double) -> String {
        "timeline-anchor-\(Int((max(time, 0) / 5).rounded()))"
    }

    private func scrollAnchorRow(scale: CGFloat) -> some View {
        HStack(spacing: 0) {
            ForEach(0...Int(ceil(sequenceDuration / 5)), id: \.self) { index in
                Color.clear
                    .frame(width: 5 * scale, height: 1)
                    .id("timeline-anchor-\(index)")
            }
        }
        .frame(height: 1)
        .allowsHitTesting(false)
    }

    private enum Role { case charlie, homer, clips }

    private func programDecisionRow(width: CGFloat, scale: CGFloat) -> some View {
        let sequence = projectStore.activeSequence
        return ZStack(alignment: .leading) {
            RoundedRectangle(cornerRadius: 6)
                .fill(QuipslyStudioTheme.panel.opacity(0.95))

            ForEach(sequence?.resolvedProgramDecisionSpans() ?? [], id: \.event.id) { span in
                programDecisionBlock(span: span, sequence: sequence, scale: scale)
                    .offset(x: span.startTime * scale)
            }

            ForEach(Array(playEditSkippedRanges().enumerated()), id: \.offset) { _, range in
                Rectangle()
                    .fill(QuipslyStudioTheme.clay.opacity(0.94))
                    .frame(
                        width: max((range.upperBound - range.lowerBound) * scale, 0),
                        height: rowHeight - 10
                    )
                    .offset(x: range.lowerBound * scale)
                    .contentShape(Rectangle())
                    .onTapGesture {
                        playbackEngine.seek(to: range.lowerBound)
                    }
                    .help("Play Edit skips exactly \(formatTime(range.lowerBound)) to \(formatTime(range.upperBound))")
            }
        }
        .frame(width: width, height: rowHeight)
        .accessibilityIdentifier("quipsly.timeline.programTrack")
        .accessibilityLabel("Complete Program truth. Charlie, Homer, and clip colors play; rust intervals are skipped by Play Edit.")
    }

    private func programDecisionBlock(
        span: ProgramDecisionSpan,
        sequence: MediaSequence?,
        scale: CGFloat
    ) -> some View {
        let blockWidth = max(span.duration * scale, 0)
        let displayKind = effectiveDisplayKind(for: span)
        let color = programColor(displayKind)
        let playableRanges = sequence.map {
            branchVisibleProgramRanges(in: span, sequence: $0)
        } ?? []
        let playableDuration = playableRanges.reduce(0) { total, range in
            total + max(range.upperBound - range.lowerBound, 0)
        }
        let blankDuration = max(span.duration - playableDuration, 0)
        let isSelected = selectedProgramSpan?.event.id == span.event.id

        return Button {
            selectedProgramDecisionStartTime = span.startTime
            onSelectProgramDecision?(span.startTime)
            playbackEngine.seek(to: span.startTime)
        } label: {
            ZStack(alignment: .leading) {
                ForEach(Array(playableRanges.indices), id: \.self) { index in
                    let range = playableRanges[index]
                    let sliceWidth = max((range.upperBound - range.lowerBound) * scale, 0)
                    Rectangle()
                        .fill(color.opacity(0.90))
                        .frame(width: sliceWidth, height: rowHeight - 10)
                        .offset(x: (range.lowerBound - span.startTime) * scale)
                }
            }
            .frame(width: blockWidth, height: rowHeight - 10)
            .overlay {
                if isSelected {
                    RoundedRectangle(cornerRadius: 5)
                        .stroke(Color.white, lineWidth: 2)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("quipsly.timeline.programDecision.\(span.event.id.uuidString)")
        .accessibilityLabel("Program decision \(programLabel(displayKind)) at \(formatTime(span.startTime))")
        .help(
            span.event.kind == .skip
                ? "SKIP from \(formatTime(span.startTime)) until the next Program decision"
                : "\(programLabel(displayKind)) intent from \(formatTime(span.startTime)); \(compactDuration(playableDuration)) source-backed, \(compactDuration(blankDuration)) blank"
        )
    }

    private func compactDuration(_ seconds: Double) -> String {
        String(format: "%.1fs", max(seconds, 0))
    }

    private func branchVisibleProgramRanges(
        in span: ProgramDecisionSpan,
        sequence: MediaSequence
    ) -> [ClosedRange<Double>] {
        let playable = sequence.programPlayableRanges(in: span)
        let keepRanges = (sequence.branchMetadata.programKeepRanges ?? []).compactMap { range -> ClosedRange<Double>? in
            let start = max(range.startTime, 0)
            let end = min(range.endTime, sequence.duration)
            guard end > start else { return nil }
            return start...end
        }
        guard !keepRanges.isEmpty else { return playable }

        return playable.flatMap { sourceRange in
            keepRanges.compactMap { keepRange -> ClosedRange<Double>? in
                let start = max(sourceRange.lowerBound, keepRange.lowerBound)
                let end = min(sourceRange.upperBound, keepRange.upperBound)
                guard end > start else { return nil }
                return start...end
            }
        }
    }

    private func programLabel(_ kind: ProgramDecisionKind) -> String {
        switch kind {
        case .primary: return "CHARLIE"
        case .secondary: return "HOMER"
        case .both: return "BOTH"
        case .skip: return "SKIP"
        case .primaryWithClip: return "CHARLIE + CLIP"
        case .secondaryWithClip: return "HOMER + CLIP"
        case .bothWithClip: return "BOTH + CLIP"
        case .custom: return "CLIP ONLY"
        }
    }

    private func programColor(_ kind: ProgramDecisionKind) -> Color {
        switch kind {
        case .primary: return QuipslyStudioTheme.creek
        case .secondary: return QuipslyStudioTheme.moss
        case .both: return QuipslyStudioTheme.honey
        case .skip: return QuipslyStudioTheme.clay
        case .primaryWithClip: return QuipslyStudioTheme.cedar
        case .secondaryWithClip: return QuipslyStudioTheme.fern
        case .bothWithClip: return QuipslyStudioTheme.honey
        case .custom: return QuipslyStudioTheme.lichen
        }
    }

    private struct Decision: Identifiable {
        let lane: VideoLane
        let tag: VideoTag
        let start: Double
        let end: Double
        var id: UUID { tag.id }
    }

    private func decisionRow(role: Role, width: CGFloat, scale: CGFloat) -> some View {
        ZStack(alignment: .leading) {
            RoundedRectangle(cornerRadius: 6)
                .fill(QuipslyStudioTheme.panel.opacity(0.95))

            ForEach(availability(for: role)) { range in
                RoundedRectangle(cornerRadius: 4)
                    .fill(color(for: role).opacity(0.10))
                    .frame(width: max((range.end - range.start) * scale, 0), height: rowHeight - 8)
                    .offset(x: range.start * scale)
            }

            ForEach(decisions(for: role)) { decision in
                let blockWidth = max((decision.end - decision.start) * scale, 0)
                RoundedRectangle(cornerRadius: 5)
                    .fill(color(for: role).opacity(0.88))
                    .frame(width: blockWidth, height: rowHeight - 10)
                    .overlay(
                        RoundedRectangle(cornerRadius: 5)
                            .stroke(selectedTagId == decision.tag.id ? Color.white : color(for: role).opacity(0.8), lineWidth: selectedTagId == decision.tag.id ? 2 : 1)
                    )
                    .overlay {
                        if blockWidth > 44 {
                            Image(systemName: "eye.fill")
                                .font(.caption2)
                                .foregroundStyle(QuipslyStudioTheme.night)
                        }
                    }
                    .offset(x: decision.start * scale)
                    .contentShape(Rectangle())
                    .onTapGesture {
                        onSelectTag?(decision.lane.id, decision.tag.id)
                        playbackEngine.seek(to: decision.start)
                    }
            }

        }
        .frame(width: width, height: rowHeight)
    }

    /// Program paints only these source-backed ranges. Their exact complement is
    /// therefore the authoritative set of intervals that Play Edit jumps over.
    private func playEditSkippedRanges() -> [Range<Double>] {
        guard let sequence = projectStore.activeSequence else { return [] }
        let playableRanges = PlaybackEngine.computeValidRanges(for: sequence)
            .map { max($0.lowerBound, 0)..<min($0.upperBound, sequenceDuration) }
            .filter { $0.upperBound > $0.lowerBound }
            .sorted { $0.lowerBound < $1.lowerBound }

        var skipped: [Range<Double>] = []
        var playableEnd = 0.0

        for range in playableRanges {
            if range.lowerBound > playableEnd {
                skipped.append(playableEnd..<range.lowerBound)
            }
            playableEnd = max(playableEnd, range.upperBound)
        }

        if playableEnd < sequenceDuration {
            skipped.append(playableEnd..<sequenceDuration)
        }
        return skipped
    }

    private struct Availability: Identifiable {
        let id: UUID
        let start: Double
        let end: Double
    }

    private func availability(for role: Role) -> [Availability] {
        lanes(for: role).compactMap { lane in
            guard let source = lane.sourceVideo else { return nil }
            return Availability(id: lane.id, start: max(source.offset, 0), end: min(source.offset + source.duration, sequenceDuration))
        }
    }

    private func decisions(for role: Role) -> [Decision] {
        lanes(for: role).flatMap { lane -> [Decision] in
            guard let source = lane.sourceVideo else { return [] }
            return lane.tags.compactMap { tag in
                guard tag.type == .active else { return nil }
                let start = source.offset + tag.startTime
                return Decision(lane: lane, tag: tag, start: max(start, 0), end: min(start + tag.duration, sequenceDuration))
            }
        }
        .filter { $0.end > $0.start }
        .sorted { $0.start < $1.start }
    }

    private var videoLanes: [VideoLane] {
        projectStore.activeSequence?.lanes.filter { lane in
            let role = lane.metadata?.role.lowercased() ?? ""
            let kind = lane.metadata?.mediaKind.lowercased() ?? ""
            let ext = lane.sourceVideo?.mediaURL.pathExtension.lowercased() ?? ""
            return !role.contains("audio") && kind != "audio" && !["wav", "mp3", "m4a", "aac", "aif", "aiff", "flac"].contains(ext)
        } ?? []
    }

    private func lanes(for role: Role) -> [VideoLane] {
        videoLanes.filter { lane in
            let text = [lane.name, lane.metadata?.role ?? "", lane.metadata?.sourceLabel ?? ""]
                .joined(separator: " ").lowercased()
            switch role {
            case .charlie: return text.contains("charlie")
            case .homer: return text.contains("homer") || text.contains("scott")
            case .clips: return !text.contains("charlie") && !text.contains("homer") && !text.contains("scott")
            }
        }
    }

    private var sequenceDuration: Double {
        max(videoLanes.compactMap { lane in lane.sourceVideo.map { $0.offset + $0.duration } }.max() ?? 1, 1)
    }

    @ViewBuilder
    private var selectedDecisionControls: some View {
        if let span = selectedProgramSpan {
            HStack(spacing: 8) {
                Circle()
                    .fill(programColor(effectiveDisplayKind(for: span)))
                    .frame(width: 8, height: 8)
                Text("Program")
                    .font(.caption.weight(.bold))
                Text("\(formatTime(span.startTime)) – \(formatTime(span.endTime))")
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
                displayDecisionMenu(for: span)
                if decisionUsesClip(span) {
                    clipMotionMenu(for: span)
                }
                Spacer()
                if let decision = selectedDecision {
                    nudgeButton("Start −", deltaStart: -0.1, deltaEnd: 0, decision: decision)
                    nudgeButton("Start +", deltaStart: 0.1, deltaEnd: 0, decision: decision)
                    nudgeButton("End −", deltaStart: 0, deltaEnd: -0.1, decision: decision)
                    nudgeButton("End +", deltaStart: 0, deltaEnd: 0.1, decision: decision)
                }
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
        } else {
            HStack {
                Text("Select a colored decision to tune its boundaries.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
                Text("Drag anywhere to scrub · pinch to zoom")
                    .font(.caption2)
                    .foregroundStyle(QuipslyStudioTheme.sage)
            }
        }
    }

    private var selectedProgramSpan: ProgramDecisionSpan? {
        guard let sequence = projectStore.activeSequence else { return nil }
        if let selectedProgramDecisionStartTime {
            return sequence.resolvedProgramDecisionSpans().first { span in
                abs(span.startTime - selectedProgramDecisionStartTime) < 0.000_1
            }
        }
        guard let decision = selectedDecision else { return nil }
        let probeTime = min(max(decision.start + 0.000_1, 0), sequence.duration)
        return sequence.resolvedProgramDecisionSpans().first { span in
            probeTime >= span.startTime && probeTime < span.endTime
        }
    }

    private func displayDecisionMenu(for span: ProgramDecisionSpan) -> some View {
        let current = effectiveDisplayKind(for: span)
        return Menu {
            displayDecisionButton("Charlie", systemImage: "person.crop.rectangle", kind: .primary, current: current)
            displayDecisionButton("Homer", systemImage: "person.crop.rectangle", kind: .secondary, current: current)
            displayDecisionButton("Both", systemImage: "person.2.crop.square.stack", kind: .both, current: current)
            displayDecisionButton("Skip", systemImage: "forward.end.fill", kind: .skip, current: current)
            Divider()
            displayDecisionButton("Charlie + Clip", systemImage: "rectangle.inset.filled.and.person.filled", kind: .primaryWithClip, current: current)
            displayDecisionButton("Homer + Clip", systemImage: "rectangle.inset.filled.and.person.filled", kind: .secondaryWithClip, current: current)
            displayDecisionButton("Both + Clip", systemImage: "rectangle.stack.badge.person.crop", kind: .bothWithClip, current: current)
            displayDecisionButton("Clip Only", systemImage: "play.rectangle.fill", kind: .custom, current: current)
        } label: {
            Label("Show: \(displayDecisionTitle(current))", systemImage: "rectangle.3.group")
                .font(.caption.weight(.bold))
        }
        .menuStyle(.borderlessButton)
        .fixedSize()
        .help("Change what Program shows for this exact segment. Timing, audio policy, and source media stay unchanged.")
        .accessibilityIdentifier("quipsly.timeline.selectedProgramDisplay")
    }

    private func clipMotionMenu(for span: ProgramDecisionSpan) -> some View {
        let motion = span.event.resolvedClipMotion
        return Menu {
            Button {
                onSetSelectedProgramClipMotion?(span.startTime, .playing, nil)
            } label: {
                Label(
                    "Play Clip" + (motion == .playing ? " (Current)" : ""),
                    systemImage: "play.fill"
                )
            }
            .disabled(motion == .playing)

            Button {
                onSetSelectedProgramClipMotion?(
                    span.startTime,
                    .holdFrame,
                    selectedClipLocalTime(for: span)
                )
            } label: {
                Label(
                    "Hold Frame Here" + (motion == .holdFrame ? " (Current)" : ""),
                    systemImage: "pause.rectangle.fill"
                )
            }
        } label: {
            Label(
                motion == .holdFrame ? "Clip: Held" : "Clip: Plays",
                systemImage: motion == .holdFrame ? "pause.rectangle.fill" : "play.rectangle.fill"
            )
            .font(.caption.weight(.bold))
        }
        .menuStyle(.borderlessButton)
        .fixedSize()
        .help("Choose whether the watched clip advances or holds the current frame while the hosts continue live.")
        .accessibilityIdentifier("quipsly.timeline.selectedProgramClipMotion")
    }

    private func decisionUsesClip(_ span: ProgramDecisionSpan) -> Bool {
        let kind = effectiveDisplayKind(for: span)
        return kind == .primaryWithClip
            || kind == .secondaryWithClip
            || kind == .bothWithClip
            || kind == .custom
    }

    private func selectedClipLocalTime(for span: ProgramDecisionSpan) -> Double? {
        guard let clipLaneID = span.event.clipLaneID,
              let source = videoLanes.first(where: { $0.id == clipLaneID })?.sourceVideo else {
            return nil
        }
        return min(
            max(0, playbackEngine.playhead - source.offset),
            max(0, source.duration)
        )
    }

    private func displayDecisionButton(
        _ title: String,
        systemImage: String,
        kind: ProgramDecisionKind,
        current: ProgramDecisionKind
    ) -> some View {
        Button {
            guard let startTime = selectedProgramSpan?.startTime else { return }
            onSwitchSelectedProgramDecision?(startTime, kind)
        } label: {
            Label(title + (kind == current ? " (Current)" : ""), systemImage: systemImage)
        }
        .disabled(kind == current)
    }

    private func displayDecisionTitle(_ kind: ProgramDecisionKind) -> String {
        switch kind {
        case .primary: return "Charlie"
        case .secondary: return "Homer"
        case .both: return "Both"
        case .skip: return "Skip"
        case .primaryWithClip: return "Charlie + Clip"
        case .secondaryWithClip: return "Homer + Clip"
        case .bothWithClip: return "Both + Clip"
        case .custom: return "Clip Only"
        }
    }

    private func effectiveDisplayKind(for span: ProgramDecisionSpan) -> ProgramDecisionKind {
        let selectedIDs = Set(span.event.sourceLaneIDs + (span.event.clipLaneID.map { [$0] } ?? []))
        guard !selectedIDs.isEmpty else { return span.event.kind }
        let selectedLanes = videoLanes.filter { selectedIDs.contains($0.id) }
        guard !selectedLanes.isEmpty,
              selectedLanes.allSatisfy({ lane in
                  let text = [lane.name, lane.metadata?.role ?? "", lane.metadata?.mediaKind ?? ""]
                      .joined(separator: " ")
                      .lowercased()
                  return text.contains("clip") || text.contains("reference") || text.contains("stinger") || text.contains("continued")
              }) else { return span.event.kind }
        return .custom
    }

    private var selectedDecision: Decision? {
        guard let selectedTagId else { return nil }
        return videoLanes.compactMap { lane -> Decision? in
            guard let source = lane.sourceVideo,
                  let tag = lane.tags.first(where: { $0.id == selectedTagId }) else { return nil }
            let start = source.offset + tag.startTime
            return Decision(lane: lane, tag: tag, start: start, end: start + tag.duration)
        }.first
    }

    private func nudgeButton(_ title: String, deltaStart: Double, deltaEnd: Double, decision: Decision) -> some View {
        Button(title) {
            var tag = decision.tag
            if deltaStart != 0 {
                let newStart = max(tag.startTime + deltaStart, 0)
                let consumed = newStart - tag.startTime
                tag.startTime = newStart
                tag.duration = max(tag.duration - consumed, 0.05)
            }
            if deltaEnd != 0 { tag.duration = max(tag.duration + deltaEnd, 0.05) }
            onUpdateTag?(decision.lane.id, tag)
        }
    }

    private func roleColor(for lane: VideoLane) -> Color {
        let text = [lane.name, lane.metadata?.role ?? ""].joined(separator: " ").lowercased()
        if text.contains("charlie") { return QuipslyStudioTheme.creek }
        if text.contains("homer") || text.contains("scott") { return QuipslyStudioTheme.moss }
        return QuipslyStudioTheme.honey
    }

    private func color(for role: Role) -> Color {
        switch role {
        case .charlie: return QuipslyStudioTheme.creek
        case .homer: return QuipslyStudioTheme.moss
        case .clips: return QuipslyStudioTheme.honey
        }
    }

    private func rowLabel(_ title: String, color: Color) -> some View {
        HStack(spacing: 6) {
            Circle().fill(color).frame(width: 7, height: 7)
            Text(title).font(.caption.weight(.bold))
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 8)
        .frame(height: rowHeight)
        .background(color.opacity(0.08), in: RoundedRectangle(cornerRadius: 6))
    }

    private func ruler(width: CGFloat, scale: CGFloat) -> some View {
        Canvas { context, size in
            let step = tickStep(for: scale)
            var time = 0.0
            while time <= sequenceDuration {
                let x = time * scale
                var path = Path()
                path.move(to: CGPoint(x: x, y: size.height - 9))
                path.addLine(to: CGPoint(x: x, y: size.height))
                context.stroke(path, with: .color(QuipslyStudioTheme.sage.opacity(0.45)), lineWidth: 1)
                context.draw(Text(formatTime(time)).font(.system(size: 9, design: .monospaced)).foregroundColor(QuipslyStudioTheme.sage), at: CGPoint(x: x + 3, y: 8), anchor: .topLeading)
                time += step
            }
        }
        .frame(width: width, height: rulerHeight)
    }

    private func tickStep(for scale: CGFloat) -> Double {
        if scale >= 80 { return 1 }
        if scale >= 25 { return 5 }
        if scale >= 8 { return 15 }
        if scale >= 2 { return 60 }
        if scale >= 0.5 { return 300 }
        return 600
    }

    private func zoom(by factor: Double) {
        fitToWindow = false
        pixelsPerSecond = min(max(pixelsPerSecond / factor, 0.08), 320)
        onZoomChanged?(pixelsPerSecond, false, "Timeline zoom")
    }

    private func formatTime(_ seconds: Double) -> String {
        let total = max(Int(seconds), 0)
        return String(format: "%02d:%02d:%02d", total / 3600, (total % 3600) / 60, total % 60)
    }
}
