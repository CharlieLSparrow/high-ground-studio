import SwiftUI
import QuipslyVideoCore
import AVKit
import UniformTypeIdentifiers

struct RightSidebarView: View {
    @ObservedObject var playbackEngine: PlaybackEngine
    @ObservedObject var projectStore: ProjectStore
    var selectedLaneId: UUID?
    var onDropVideo: ((URL) -> Void)?
    var onSelectLane: ((UUID) -> Void)?
    var onRelinkLane: ((UUID) -> Void)?
    var onAttachProxy: ((UUID) -> Void)?
    var onShowLaneWindow: ((UUID) -> Void)?
    var onCutLaneWindow: ((UUID) -> Void)?
    var sourceStopCount: ((VideoLane) -> Int)?
    var onSourceStopNavigate: ((UUID, Int) -> Void)?

    @State private var isTargeted = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            sidebarHeader

            if let sequence = projectStore.activeSequence, !sequence.lanes.isEmpty {
                sidebarStatusPanel(for: sequence)
                sourceScroll(for: sequence)
            } else {
                emptyState
            }
        }
        .padding(16)
        .background(sidebarBackground)
        .onDrop(of: [UTType.fileURL.identifier], isTargeted: $isTargeted, perform: handleDrop(providers:))
    }

    private var sidebarHeader: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text("SOURCE WALL")
                .font(.caption2)
                .fontWeight(.black)
                .tracking(1.8)
                .foregroundStyle(Color.yellow.opacity(0.82))
            Text("Synced source monitors")
                .font(.headline)
                .fontWeight(.black)
            Text("Every synced source stays visible. The program monitor decides what the edit shows.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.bottom, 4)
    }

    private var sidebarBackground: some ShapeStyle {
        LinearGradient(
            colors: [
                Color.black.opacity(0.34),
                (isTargeted ? Color.blue.opacity(0.18) : Color(red: 0.05, green: 0.06, blue: 0.06).opacity(0.92))
            ],
            startPoint: .top,
            endPoint: .bottom
        )
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Spacer()
            Image(systemName: "video.badge.plus")
                .font(.system(size: 34, weight: .semibold))
                .foregroundStyle(.secondary)
            Text("No sources imported")
                .font(.subheadline)
                .fontWeight(.semibold)
            Text("Drop proxy-safe video or audio here. Originals stay protected; this wall shows what is ready to scrub.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 12)
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    private func sourceScroll(for sequence: MediaSequence) -> some View {
        ScrollView(.vertical) {
            VStack(spacing: 16) {
                ForEach(videoLanes(in: sequence)) { lane in
                    sourceCard(for: lane)
                }

                supportSection(for: supportLanes(in: sequence))
            }
            .padding(.trailing, 8)
            .padding(.bottom, 18)
        }
    }

    private func sourceCard(for lane: VideoLane) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            sourceCardHeader(lane)
            laneDecisionRibbon(lane)
            sourcePreview(lane)
            sourceMetricsRow(lane)
            sourceStopControls(lane)
            sourceDecisionButtons(lane)
            missingMediaActions(lane)
        }
        .frame(maxWidth: .infinity)
        .padding(10)
        .background(cardBackground(for: lane))
        .overlay(sourceCardStroke(lane))
        .shadow(color: selectedLaneId == lane.id ? Color.cyan.opacity(0.18) : Color.black.opacity(0.18), radius: selectedLaneId == lane.id ? 10 : 4, y: 4)
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .contentShape(RoundedRectangle(cornerRadius: 14))
        .onTapGesture { onSelectLane?(lane.id) }
    }

    private func sourceCardHeader(_ lane: VideoLane) -> some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 2) {
                Text(lane.name)
                    .font(.caption)
                    .fontWeight(.semibold)
                    .lineLimit(1)
                    .truncationMode(.tail)
                Text(laneStatusText(lane))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            sourceBadge(lane)
        }
    }

    @ViewBuilder
    private func sourcePreview(_ lane: VideoLane) -> some View {
        if let player = playbackEngine.sourcePlayers[lane.id] {
            PlayerView(player: player)
                .aspectRatio(16/9, contentMode: .fit)
                .background(Color.black)
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .overlay(previewStroke)
                .overlay(alignment: .bottomLeading) { laneSyncOverlay(lane) }
        } else {
            placeholderPreview(lane)
        }
    }

    private func placeholderPreview(_ lane: VideoLane) -> some View {
        ZStack {
            Rectangle()
                .fill(Color(white: 0.15))
                .aspectRatio(16/9, contentMode: .fit)
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .overlay(previewStroke)

            VStack(spacing: 8) {
                if isAudioLane(lane) {
                    Image(systemName: "waveform")
                        .font(.largeTitle)
                        .foregroundColor(.blue)
                    Text("Audio Track")
                        .font(.caption)
                        .foregroundColor(.gray)
                } else {
                    Image(systemName: "video.slash")
                        .font(.largeTitle)
                        .foregroundColor(.gray)
                    Text(String(format: "T: %.2f s", playbackEngine.playhead))
                        .font(.system(.caption, design: .monospaced))
                        .foregroundColor(.gray)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.black.opacity(0.5))
                        .clipShape(RoundedRectangle(cornerRadius: 4))
                }
            }
        }
        .overlay(alignment: .bottomLeading) { laneSyncOverlay(lane) }
    }

    private var previewStroke: some View {
        RoundedRectangle(cornerRadius: 10)
            .stroke(Color.white.opacity(0.10), lineWidth: 1)
    }

    private func sourceMetricsRow(_ lane: VideoLane) -> some View {
        HStack(spacing: 6) {
            countPill("show", lane.tags.filter { $0.type == .active }.count, .yellow)
            countPill("skip", lane.tags.filter { $0.type == .cut }.count, .red)
            if let count = sourceStopCount?(lane), count > 0 {
                countPill("source stops", count, .mint)
            }
            Spacer(minLength: 6)
            Text(syncTimeText(lane))
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
    }

    private func sourceDecisionButtons(_ lane: VideoLane) -> some View {
        HStack(spacing: 6) {
            Button("Show 10s") { onShowLaneWindow?(lane.id) }
                .buttonStyle(.borderedProminent)
                .controlSize(.small)
                .help("Drop a ten-second SHOW decision on this source at the playhead.")

            Button("Cut 10s") { onCutLaneWindow?(lane.id) }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .help("Drop a ten-second SKIP decision on this source at the playhead.")

            Spacer()
        }
    }

    @ViewBuilder
    private func missingMediaActions(_ lane: VideoLane) -> some View {
        if playbackEngine.sourcePlayers[lane.id] == nil {
            HStack(spacing: 6) {
                Button("Attach proxy") { onAttachProxy?(lane.id) }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                    .help("Attach a proxy file for fast safe preview without touching the original.")

                Button("Relink") { onRelinkLane?(lane.id) }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                    .help("Relink this lane to its source media or proxy.")

                Spacer()
            }
        }
    }

    private func sourceCardStroke(_ lane: VideoLane) -> some View {
        RoundedRectangle(cornerRadius: 14)
            .stroke(selectedLaneId == lane.id ? Color.cyan.opacity(0.85) : Color.white.opacity(0.06), lineWidth: selectedLaneId == lane.id ? 2 : 1)
    }

    @ViewBuilder
    private func supportSection(for lanes: [VideoLane]) -> some View {
        if !lanes.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Label("Audio and sync support", systemImage: "waveform")
                    .font(.caption)
                    .fontWeight(.bold)
                    .foregroundStyle(.secondary)

                ForEach(lanes) { lane in
                    supportRow(lane)
                }
            }
            .padding(.top, 4)
        }
    }

    private func supportRow(_ lane: VideoLane) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "waveform")
                .foregroundStyle(Color.blue)
            VStack(alignment: .leading, spacing: 1) {
                Text(lane.name)
                    .font(.caption2)
                    .fontWeight(.semibold)
                    .lineLimit(1)
                Text(laneStatusText(lane))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer()
            countPill("show", lane.tags.filter { $0.type == .active }.count, .yellow)
            Text(syncTimeText(lane))
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .padding(8)
        .background(Color.blue.opacity(0.06))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private func sidebarStatusPanel(for sequence: MediaSequence) -> some View {
        let video = videoLanes(in: sequence)
        let live = video.filter { playbackEngine.sourcePlayers[$0.id] != nil }.count
        let blocked = max(0, video.count - live)
        let showing = video.filter { decisionAtPlayhead(for: $0)?.type == .active }.count
        let skipping = video.filter { decisionAtPlayhead(for: $0)?.type == .cut }.count

        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                statPill("\(live)", "live", .green)
                statPill("\(blocked)", "blocked", blocked == 0 ? .secondary : .orange)
                statPill("\(showing)", "showing", .yellow)
                statPill("\(skipping)", "skip", skipping == 0 ? .secondary : .red)
            }
            Text("Every card is synced to the same sequence playhead. Green cards can preview now; protected/missing cards stay visible as recovery work, not hidden failure.")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(8)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(.thinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(Color.white.opacity(0.08), lineWidth: 1)
                )
        )
    }

    private func handleDrop(providers: [NSItemProvider]) -> Bool {
        for provider in providers {
            provider.loadItem(forTypeIdentifier: UTType.fileURL.identifier, options: nil) { item, _ in
                if let data = item as? Data, let url = URL(dataRepresentation: data, relativeTo: nil) {
                    DispatchQueue.main.async { onDropVideo?(url) }
                } else if let url = item as? URL {
                    DispatchQueue.main.async { onDropVideo?(url) }
                }
            }
        }
        return true
    }

    private func videoLanes(in sequence: MediaSequence) -> [VideoLane] {
        sequence.lanes.filter { !isSupportOnlyLane($0) }
    }

    private func supportLanes(in sequence: MediaSequence) -> [VideoLane] {
        sequence.lanes.filter { isSupportOnlyLane($0) }
    }

    private func isSupportOnlyLane(_ lane: VideoLane) -> Bool {
        let role = lane.metadata?.role.lowercased() ?? ""
        let kind = lane.metadata?.mediaKind.lowercased() ?? ""
        if role.contains("audio") || kind == "audio" { return true }
        return isAudioLane(lane)
    }

    private func isAudioLane(_ lane: VideoLane) -> Bool {
        guard let path = lane.sourceVideo?.mediaURL.path.lowercased() else { return false }
        return ["wav", "mp3", "m4a", "aac", "aif", "aiff", "flac"].contains((path as NSString).pathExtension)
    }

    private func laneStatusText(_ lane: VideoLane) -> String {
        guard let source = lane.sourceVideo else { return "No source attached" }
        if source.mediaURL.path.contains("__quipsly_missing_media__") {
            return String(format: "%.1fs · relink source", source.duration)
        }

        let proxy: String
        if let proxyURL = source.proxyURL {
            switch ExternalMediaAccess.shared.fileExistsWithoutPrompt(at: proxyURL) {
            case .some(true): proxy = "proxy ready"
            case .some(false): proxy = "proxy missing"
            case .none: proxy = "protected proxy"
            }
        } else if isProtectedOriginal(source.mediaURL) {
            proxy = "original protected · attach proxy"
        } else {
            proxy = "proxy required"
        }
        return String(format: "%.1fs · %@", source.duration, proxy)
    }

    private func laneDecisionRibbon(_ lane: VideoLane) -> some View {
        let state = decisionState(for: lane)
        return HStack(spacing: 6) {
            Image(systemName: state.icon)
                .foregroundStyle(state.color)
            Text(state.label)
                .fontWeight(.bold)
                .foregroundStyle(state.color)
            Spacer(minLength: 4)
            Text(state.detail)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .font(.caption2)
        .padding(.horizontal, 7)
        .padding(.vertical, 5)
        .background(state.color.opacity(0.10))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private func laneSyncOverlay(_ lane: VideoLane) -> some View {
        let state = decisionState(for: lane)
        return HStack(spacing: 6) {
            Label(sourceTimeText(lane), systemImage: "clock")
            Text(state.label)
                .fontWeight(.bold)
                .foregroundStyle(state.color)
        }
        .font(.caption2.monospacedDigit())
        .padding(.horizontal, 7)
        .padding(.vertical, 4)
        .background(Color.black.opacity(0.68))
        .clipShape(Capsule())
        .padding(6)
    }

    @ViewBuilder
    private func sourceStopControls(_ lane: VideoLane) -> some View {
        let stopCount = sourceStopCount?(lane) ?? 0
        if stopCount > 0 {
            HStack(spacing: 6) {
                Label("\(stopCount) stops", systemImage: "scope")
                    .font(.caption2)
                    .fontWeight(.semibold)
                    .foregroundStyle(.mint)
                    .lineLimit(1)

                Spacer(minLength: 4)

                Button { onSourceStopNavigate?(lane.id, -1) } label: {
                    Label("Prev", systemImage: "chevron.left")
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .disabled(onSourceStopNavigate == nil)
                .help("Move the playhead to the previous SHOW/SKIP decision on this source lane.")

                Button { onSourceStopNavigate?(lane.id, 1) } label: {
                    Label("Next", systemImage: "chevron.right")
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .disabled(onSourceStopNavigate == nil)
                .help("Move the playhead to the next SHOW/SKIP decision on this source lane.")
            }
            .padding(.horizontal, 7)
            .padding(.vertical, 5)
            .background(Color.mint.opacity(0.09))
            .clipShape(RoundedRectangle(cornerRadius: 8))
        }
    }

    private func decisionState(for lane: VideoLane) -> (label: String, detail: String, icon: String, color: Color) {
        guard let source = lane.sourceVideo else {
            return ("NO SOURCE", "Nothing linked", "video.slash", .secondary)
        }

        let mediaTime = playbackEngine.playhead - source.offset
        guard mediaTime >= 0, mediaTime <= max(source.duration, 0) else {
            return ("OUT OF RANGE", "Not present at this playhead", "arrow.left.and.right", .secondary)
        }

        guard let tag = decisionAtPlayhead(for: lane) else {
            return ("STANDBY", "Synced, not selected by edit metadata", "circle.dotted", .blue)
        }

        switch tag.type {
        case .active:
            return ("SHOW", "Program may use this lane now", "eye.fill", .yellow)
        case .cut:
            return ("SKIP", "Play Edit jumps this region", "forward.end.fill", .red)
        default:
            return (tag.type.rawValue.uppercased(), "Tagged at this playhead", "tag.fill", .purple)
        }
    }

    private func decisionAtPlayhead(for lane: VideoLane) -> VideoTag? {
        let mediaTime = playbackEngine.playhead - (lane.sourceVideo?.offset ?? 0)
        return lane.tags.first { tag in
            guard tag.type == .active || tag.type == .cut else { return false }
            let start = tag.startTime
            let end = tag.startTime + tag.duration
            return mediaTime >= start && mediaTime <= end
        }
    }

    private func syncTimeText(_ lane: VideoLane) -> String {
        String(format: "seq %.2fs · src %@", playbackEngine.playhead, sourceTimeText(lane))
    }

    private func sourceTimeText(_ lane: VideoLane) -> String {
        guard let source = lane.sourceVideo else { return "--" }
        let mediaTime = playbackEngine.playhead - source.offset
        if mediaTime < 0 { return String(format: "-%.2fs", abs(mediaTime)) }
        if source.duration > 0, mediaTime > source.duration { return String(format: "%.2fs+", source.duration) }
        return String(format: "%.2fs", mediaTime)
    }

    private func sourceBadge(_ lane: VideoLane) -> some View {
        let hasPlayer = playbackEngine.sourcePlayers[lane.id] != nil
        let source = lane.sourceVideo
        let isMissing = source?.mediaURL.path.contains("__quipsly_missing_media__") == true
        let proxyReady = source?.proxyURL.flatMap { ExternalMediaAccess.shared.fileExistsWithoutPrompt(at: $0) } == true
        let isProtected = source.map { isProtectedOriginal($0.mediaURL) } == true
        let label = hasPlayer ? "LIVE" : (isMissing ? "MISSING" : (proxyReady ? "PROXY" : (isProtected ? "PROTECTED" : "HELD")))
        let color = hasPlayer ? Color.green : (isMissing ? Color.red : (proxyReady ? Color.yellow : (isProtected ? Color.orange : Color.orange)))
        return Text(label)
            .font(.caption2)
            .fontWeight(.bold)
            .foregroundStyle(color)
            .padding(.horizontal, 6)
            .padding(.vertical, 3)
            .background(color.opacity(0.12))
            .clipShape(Capsule())
    }

    private func statPill(_ value: String, _ label: String, _ color: Color) -> some View {
        VStack(spacing: 1) {
            Text(value)
                .font(.caption)
                .fontWeight(.heavy)
                .monospacedDigit()
            Text(label)
                .font(.caption2)
                .fontWeight(.semibold)
        }
        .foregroundStyle(color)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 5)
        .background(color.opacity(0.10))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private func cardBackground(for lane: VideoLane) -> Color {
        if selectedLaneId == lane.id { return Color.blue.opacity(0.12) }
        if playbackEngine.sourcePlayers[lane.id] != nil { return Color.green.opacity(0.07) }
        if lane.sourceVideo?.mediaURL.path.contains("__quipsly_missing_media__") == true { return Color.red.opacity(0.08) }
        if let source = lane.sourceVideo, isProtectedOriginal(source.mediaURL) { return Color.orange.opacity(0.08) }
        return Color.secondary.opacity(0.08)
    }

    private func isProtectedOriginal(_ url: URL) -> Bool {
        ExternalMediaAccess.isProtectedUserMediaPath(url.standardizedFileURL.path)
            && !ExternalMediaAccess.shared.canProbeWithoutPrompt(url)
    }

    private func countPill(_ label: String, _ count: Int, _ color: Color) -> some View {
        HStack(spacing: 3) {
            Circle()
                .fill(color)
                .frame(width: 6, height: 6)
            Text("\(count) \(label)")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 3)
        .background(color.opacity(0.10))
        .clipShape(Capsule())
    }
}
