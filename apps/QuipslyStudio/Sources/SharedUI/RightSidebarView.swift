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
    @State private var showParkedRecoverySources = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            sidebarHeader

            if let sequence = projectStore.activeSequence, !sequence.lanes.isEmpty {
                sidebarStatusPanel(for: sequence)
                sourceScroll(for: sequence)
            } else {
                emptyState
            }
        }
        .padding(12)
        .background(sidebarBackground)
        .onDrop(of: [UTType.fileURL.identifier], isTargeted: $isTargeted, perform: handleDrop(providers:))
        .accessibilityIdentifier("quipsly.sourceWall")
        .accessibilityLabel("Source Grove. Every synced source stays visible while Program Output decides what the edit shows.")
    }

    private var sidebarHeader: some View {
        QuipslySectionHeader(
            eyebrow: "Source Grove",
            title: "Every source stays visible",
            detail: "Every source follows the shared playhead. Pick a lane, then write reversible SHOW/SKIP decisions without chopping media.",
            systemImage: "tree.fill",
            tint: QuipslyStudioTheme.moss
        )
        .padding(.bottom, 4)
    }

    private var sidebarBackground: some ShapeStyle {
        isTargeted
            ? LinearGradient(
                colors: [
                    QuipslyStudioTheme.creek.opacity(0.22),
                    QuipslyStudioTheme.panel.opacity(0.96),
                    QuipslyStudioTheme.forest.opacity(0.58)
                ],
                startPoint: .top,
                endPoint: .bottom
            )
            : QuipslyStudioTheme.sourceGroveGradient
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Spacer()
            Image(systemName: "video.badge.plus")
                .font(.system(size: 34, weight: .semibold))
                .foregroundStyle(QuipslyStudioTheme.sage)
            Text("No sources yet")
                .font(.subheadline)
                .fontWeight(.semibold)
            Text("Import whole video or audio sources. Originals stay protected, proxies do the heavy lifting, and every source remains visible for camera choices.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 12)
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    private func sourceScroll(for sequence: MediaSequence) -> some View {
        let focused = focusedSourceLanes(in: sequence)
        let parked = parkedRecoveryLanes(in: sequence, excluding: focused)

        return ScrollView(.vertical) {
            VStack(spacing: 12) {
                ForEach(focused) { lane in
                    sourceCard(for: lane)
                }

                parkedRecoverySection(for: parked)
                supportSection(for: supportLanes(in: sequence))
            }
            .padding(.trailing, 8)
            .padding(.bottom, 18)
        }
    }

    private func sourceCard(for lane: VideoLane) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            sourceCardHeader(lane)
            sourceSelectionCue(lane)
            sourceSafetyStrip(lane)
            sourcePreview(lane)
            sourceIntentBar(lane)
            sourceMetricsRow(lane)
            sourceStopControls(lane)
            sourceDecisionButtons(lane)
            missingMediaActions(lane)
        }
        .frame(maxWidth: .infinity)
        .padding(9)
        .background(cardBackground(for: lane))
        .overlay(sourceCardStroke(lane))
        .shadow(color: selectedLaneId == lane.id ? QuipslyStudioTheme.honey.opacity(0.20) : QuipslyStudioTheme.softShadow.opacity(0.34), radius: selectedLaneId == lane.id ? 16 : 4, y: 5)
        .clipShape(RoundedRectangle(cornerRadius: 20))
        .contentShape(RoundedRectangle(cornerRadius: 20))
        .onTapGesture { onSelectLane?(lane.id) }
        .accessibilityIdentifier("quipsly.sourceWall.card.\(lane.id.uuidString)")
        .accessibilityLabel("Source Grove card \(lane.name). \(laneStatusText(lane)). \(playheadPresenceText(for: lane)). \(decisionState(for: lane).label) at playhead. Whole source lane remains intact.")
    }

    private func sourceSafetyStrip(_ lane: VideoLane) -> some View {
        let ready = playbackEngine.sourcePlayers[lane.id] != nil
        let status = laneStatusText(lane)
        let state = decisionState(for: lane)
        let tint = ready ? QuipslyStudioTheme.moss : (status.localizedCaseInsensitiveContains("relink") ? QuipslyStudioTheme.clay : QuipslyStudioTheme.honey)

        return HStack(spacing: 7) {
            Label(ready ? "proxy-safe" : "needs proxy", systemImage: ready ? "checkmark.shield.fill" : "wrench.and.screwdriver.fill")
                .font(.caption2)
                .fontWeight(.black)
                .foregroundStyle(tint)
                .lineLimit(1)
            Text("whole lane")
                .font(.caption2)
                .fontWeight(.bold)
                .foregroundStyle(QuipslyStudioTheme.creekMist)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(QuipslyStudioTheme.creek.opacity(0.10))
                .clipShape(Capsule())
            Spacer(minLength: 4)
            Text(state.detail)
                .font(.caption2)
                .fontWeight(.semibold)
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .truncationMode(.middle)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 5)
        .background(tint.opacity(0.075))
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(tint.opacity(0.15), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .accessibilityIdentifier("quipsly.sourceWall.safety.\(lane.id.uuidString)")
        .accessibilityLabel("Source safety. \(ready ? "Playable proxy-safe." : "Needs proxy or recovery attachment."). Whole source lane remains intact.")
    }

    private func sourceIntentBar(_ lane: VideoLane) -> some View {
        let state = decisionState(for: lane)
        return HStack(spacing: 8) {
            Label(state.label, systemImage: state.label == "SHOW" ? "eye.fill" : (state.label == "SKIP" ? "forward.end.fill" : "circle.dashed"))
                .font(.caption2)
                .fontWeight(.black)
                .foregroundStyle(state.color)
                .padding(.horizontal, 7)
                .padding(.vertical, 4)
                .background(state.color.opacity(0.12))
                .clipShape(Capsule())

            VStack(alignment: .leading, spacing: 1) {
                Text(playheadPresenceText(for: lane))
                    .font(.caption2)
                    .fontWeight(.semibold)
                    .foregroundStyle(.primary.opacity(0.88))
                    .lineLimit(1)
                Text("spine \(String(format: "%.2fs", playbackEngine.playhead)) · source \(sourceTimeText(lane))")
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.78)
            }

            Spacer(minLength: 0)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .background(state.color.opacity(0.075))
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(state.color.opacity(0.16), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .accessibilityIdentifier("quipsly.sourceWall.intent.\(lane.id.uuidString)")
    }

    private func sourceCardHeader(_ lane: VideoLane) -> some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 2) {
                Text(lane.name)
                    .font(.caption)
                    .fontWeight(.black)
                    .lineLimit(2)
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
    private func sourceSelectionCue(_ lane: VideoLane) -> some View {
        if selectedLaneId == lane.id {
            HStack(spacing: 7) {
                Image(systemName: "scope")
                    .font(.caption2)
                    .foregroundStyle(QuipslyStudioTheme.creek)
                VStack(alignment: .leading, spacing: 1) {
                    Text("Selected source")
                        .fontWeight(.black)
                        .foregroundStyle(QuipslyStudioTheme.creek)
                    Text("Frame, SHOW/SKIP, and source-stop tools target this whole lane.")
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
                Spacer(minLength: 4)
                Text(syncTimeText(lane))
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(.secondary)
            }
            .font(.caption2)
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .background(QuipslyStudioTheme.creek.opacity(0.10))
            .overlay(
                RoundedRectangle(cornerRadius: 9)
                    .stroke(QuipslyStudioTheme.creek.opacity(0.24), lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 9))
        }
    }

    @ViewBuilder
    private func sourcePreview(_ lane: VideoLane) -> some View {
        if let player = playbackEngine.sourcePlayers[lane.id] {
            PlayerView(player: player)
                .aspectRatio(16/9, contentMode: .fit)
                .background(Color.black)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay(previewStroke)
                .overlay(alignment: .bottomLeading) { laneSyncOverlay(lane) }
        } else {
            placeholderPreview(lane)
        }
    }

    private func placeholderPreview(_ lane: VideoLane) -> some View {
        ZStack {
            Rectangle()
                .fill(QuipslyStudioTheme.quietInsetGradient)
                .aspectRatio(16/9, contentMode: .fit)
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .overlay(previewStroke)

            VStack(spacing: 8) {
                if isAudioLane(lane) {
                    Image(systemName: "waveform")
                        .font(.largeTitle)
                        .foregroundStyle(QuipslyStudioTheme.creek)
                    Text("Audio source")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else {
                    Image(systemName: "video.slash")
                        .font(.largeTitle)
                        .foregroundStyle(QuipslyStudioTheme.sage.opacity(0.72))
                    Text(String(format: "T: %.2f s", playbackEngine.playhead))
                        .font(.system(.caption, design: .monospaced))
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(QuipslyStudioTheme.night.opacity(0.58))
                        .clipShape(RoundedRectangle(cornerRadius: 4))
                }
            }
        }
        .overlay(alignment: .bottomLeading) { laneSyncOverlay(lane) }
    }

    private var previewStroke: some View {
        RoundedRectangle(cornerRadius: 14, style: .continuous)
            .stroke(QuipslyStudioTheme.sage.opacity(0.16), lineWidth: 1)
    }

    private func sourceMetricsRow(_ lane: VideoLane) -> some View {
        HStack(spacing: 6) {
            countPill("show", lane.tags.filter { $0.type == .active }.count, QuipslyStudioTheme.honey)
            countPill("skip", lane.tags.filter { $0.type == .cut }.count, QuipslyStudioTheme.clay)
            if let count = sourceStopCount?(lane), count > 0 {
                countPill("source stops", count, QuipslyStudioTheme.creek)
            }
            Spacer(minLength: 6)
            Text(syncTimeText(lane))
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
    }

    private func sourceDecisionButtons(_ lane: VideoLane) -> some View {
        HStack(spacing: 7) {
            sourceActionButton(
                title: "Show 10s",
                subtitle: "Program uses this source",
                systemImage: "eye.fill",
                tint: QuipslyStudioTheme.honey,
                prominent: true
            ) {
                onShowLaneWindow?(lane.id)
            }
            .accessibilityIdentifier("quipsly.sourceWall.showNext10.\(lane.id.uuidString)")

            sourceActionButton(
                title: "Quiet 10s",
                subtitle: "Play Edit skips this source",
                systemImage: "forward.end.fill",
                tint: QuipslyStudioTheme.clay,
                prominent: false
            ) {
                onCutLaneWindow?(lane.id)
            }
            .accessibilityIdentifier("quipsly.sourceWall.skipNext10.\(lane.id.uuidString)")
        }
    }

    private func sourceActionButton(
        title: String,
        subtitle: String,
        systemImage: String,
        tint: Color,
        prominent: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 2) {
                Label(title, systemImage: systemImage)
                    .font(.caption2)
                    .fontWeight(.black)
                    .lineLimit(1)
                Text(subtitle)
                    .font(.caption2)
                    .fontWeight(.semibold)
                    .foregroundStyle(prominent ? QuipslyStudioTheme.night.opacity(0.70) : .secondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.78)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 8)
            .padding(.vertical, 7)
            .foregroundStyle(prominent ? QuipslyStudioTheme.night : tint)
            .background(prominent ? tint.opacity(0.78) : tint.opacity(0.10))
            .overlay(
                RoundedRectangle(cornerRadius: 11, style: .continuous)
                    .stroke(tint.opacity(prominent ? 0.68 : 0.22), lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
        }
        .buttonStyle(.plain)
        .help("\(title). \(subtitle). Writes metadata at the shared playhead; source media remains untouched.")
    }

    @ViewBuilder
    private func missingMediaActions(_ lane: VideoLane) -> some View {
        if playbackEngine.sourcePlayers[lane.id] == nil {
            HStack(spacing: 6) {
                Button {
                    onAttachProxy?(lane.id)
                } label: {
                    Label("Attach proxy", systemImage: "link.badge.plus")
                        .font(.caption)
                        .fontWeight(.bold)
                }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                    .help("Attach a proxy file for fast safe preview without touching the original.")
                    .accessibilityIdentifier("quipsly.sourceWall.attachProxy.\(lane.id.uuidString)")

                Button {
                    onRelinkLane?(lane.id)
                } label: {
                    Label("Relink", systemImage: "folder.badge.questionmark")
                        .font(.caption)
                        .fontWeight(.bold)
                }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                    .help("Relink this lane to its source media or proxy.")
                    .accessibilityIdentifier("quipsly.sourceWall.relink.\(lane.id.uuidString)")

                Spacer()
            }
        }
    }

    private func sourceCardStroke(_ lane: VideoLane) -> some View {
        RoundedRectangle(cornerRadius: 18)
            .stroke(selectedLaneId == lane.id ? QuipslyStudioTheme.honey.opacity(0.85) : QuipslyStudioTheme.sage.opacity(0.12), lineWidth: selectedLaneId == lane.id ? 2 : 1)
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

    @ViewBuilder
    private func parkedRecoverySection(for lanes: [VideoLane]) -> some View {
        if !lanes.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    Label("\(lanes.count) parked source\(lanes.count == 1 ? "" : "s")", systemImage: "archivebox")
                        .font(.caption)
                        .fontWeight(.black)
                        .foregroundStyle(QuipslyStudioTheme.lichen)
                    Spacer(minLength: 4)
                    Button(showParkedRecoverySources ? "Hide" : "Review") {
                        withAnimation(.easeInOut(duration: 0.18)) {
                            showParkedRecoverySources.toggle()
                        }
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                    .help("Parked lanes are preserved for recovery, but they are not the main editing path while usable sources exist.")
                }

                Text("These look like short placeholders, missing fragments, or recovery evidence. They stay attached, but they should not steal attention from usable Charlie/Homer editing unless the picture visibly needs them.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)

                if showParkedRecoverySources {
                    ForEach(lanes) { lane in
                        parkedRecoveryRow(lane)
                    }
                } else {
                    VStack(alignment: .leading, spacing: 4) {
                        ForEach(lanes.prefix(3)) { lane in
                            HStack(spacing: 6) {
                                Image(systemName: laneParkingReason(lane).icon)
                                    .foregroundStyle(laneParkingReason(lane).color)
                                Text(lane.name)
                                    .lineLimit(1)
                                    .truncationMode(.middle)
                                Spacer()
                                Text(laneParkingReason(lane).label)
                                    .foregroundStyle(laneParkingReason(lane).color)
                            }
                            .font(.caption2)
                        }

                        if lanes.count > 3 {
                            Text("+\(lanes.count - 3) more preserved recovery lanes")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(8)
                    .background(QuipslyStudioTheme.lichen.opacity(0.07))
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                }
            }
            .padding(9)
            .background(QuipslyStudioTheme.peat.opacity(0.50))
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(QuipslyStudioTheme.lichen.opacity(0.18), lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .accessibilityIdentifier("quipsly.sourceWall.parkedRecovery")
            .accessibilityLabel("\(lanes.count) parked recovery source lanes. They are preserved but not part of the main editing path.")
        }
    }

    private func parkedRecoveryRow(_ lane: VideoLane) -> some View {
        let reason = laneParkingReason(lane)

        return HStack(alignment: .top, spacing: 8) {
            Image(systemName: reason.icon)
                .foregroundStyle(reason.color)
                .frame(width: 18)
            VStack(alignment: .leading, spacing: 2) {
                Text(lane.name)
                    .font(.caption)
                    .fontWeight(.semibold)
                    .lineLimit(2)
                Text(reason.detail)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
                Text(laneStatusText(lane))
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(reason.color.opacity(0.92))
                    .lineLimit(1)
            }
            Spacer(minLength: 4)
            Button {
                onSelectLane?(lane.id)
            } label: {
                Text("Inspect")
                    .font(.caption2)
                    .fontWeight(.bold)
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
            .help("Select this preserved lane for recovery inspection. This does not make it production-ready.")
        }
        .padding(8)
        .background(reason.color.opacity(0.07))
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private func supportRow(_ lane: VideoLane) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "waveform")
                .foregroundStyle(QuipslyStudioTheme.creek)
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
            countPill("show", lane.tags.filter { $0.type == .active }.count, QuipslyStudioTheme.honey)
            Text(syncTimeText(lane))
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .padding(8)
        .background(QuipslyStudioTheme.creek.opacity(0.07))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private func sidebarStatusPanel(for sequence: MediaSequence) -> some View {
        let video = videoLanes(in: sequence)
        let live = video.filter { playbackEngine.sourcePlayers[$0.id] != nil }.count
        let blocked = max(0, video.count - live)
        let parked = parkedRecoveryLanes(in: sequence, excluding: focusedSourceLanes(in: sequence)).count
        let showing = video.filter { decisionAtPlayhead(for: $0)?.type == .active }.count

        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                statPill("\(live)", "proxy-safe", QuipslyStudioTheme.moss)
                statPill("\(blocked)", "needs proxy", blocked == 0 ? QuipslyStudioTheme.sage : QuipslyStudioTheme.clay)
                statPill("\(showing)", "showing", QuipslyStudioTheme.honey)
                statPill("\(parked)", "parked", parked == 0 ? QuipslyStudioTheme.sage : QuipslyStudioTheme.lichen)
            }
        Text("Moss means proxy-safe, honey means Program can show it, lichen means preserved recovery evidence. Parked sources stay findable without hijacking the edit.")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(9)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(QuipslyStudioTheme.mossGlassGradient)
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(QuipslyStudioTheme.quietStroke, lineWidth: 1)
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

    private func focusedSourceLanes(in sequence: MediaSequence) -> [VideoLane] {
        let lanes = videoLanes(in: sequence)
        let focused = lanes.filter { lane in
            if selectedLaneId == lane.id { return true }
            if playbackEngine.sourcePlayers[lane.id] != nil { return true }
            if lane.metadata?.ignoreForProduction == true { return false }
            return laneLooksLikePrimarySource(lane) && !laneLooksLikeParkedRecovery(lane)
        }
        return focused.isEmpty ? lanes : focused
    }

    private func parkedRecoveryLanes(in sequence: MediaSequence, excluding focused: [VideoLane]) -> [VideoLane] {
        let focusedIds = Set(focused.map(\.id))
        return videoLanes(in: sequence).filter { lane in
            !focusedIds.contains(lane.id) && laneLooksLikeParkedRecovery(lane)
        }
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

    private func laneLooksLikePrimarySource(_ lane: VideoLane) -> Bool {
        let text = [
            lane.name,
            lane.metadata?.role ?? "",
            lane.metadata?.sourceLabel ?? "",
            lane.metadata?.originalPath ?? "",
            lane.sourceVideo?.mediaURL.lastPathComponent ?? ""
        ]
        .joined(separator: " ")
        .lowercased()
        let sourceDuration = lane.sourceVideo?.duration ?? lane.duration
        let isLongEnough = sourceDuration >= 120
        let namedHost = text.contains("charlie") || text.contains("homer")
        let cameraLike = text.contains("camera") || text.contains("cam") || text.contains("mvi_") || text.contains("mp4") || text.contains("mov")
        return (namedHost && sourceDuration >= 30) || (cameraLike && isLongEnough)
    }

    private func laneLooksLikeParkedRecovery(_ lane: VideoLane) -> Bool {
        if lane.metadata?.ignoreForProduction == true { return true }
        if playbackEngine.sourcePlayers[lane.id] != nil { return false }

        let text = [
            lane.name,
            lane.metadata?.role ?? "",
            lane.metadata?.sourceLabel ?? "",
            lane.metadata?.originalPath ?? "",
            lane.sourceVideo?.mediaURL.path ?? ""
        ]
        .joined(separator: " ")
        .lowercased()
        let duration = lane.sourceVideo?.duration ?? lane.duration
        let isMissingSentinel = lane.sourceVideo?.mediaURL.path.contains("__quipsly_missing_media__") == true
        let soundsUnresolved = text.contains("unresolved")
            || text.contains("missing")
            || text.contains("temp_video")
            || text.contains("video clip")
            || text.contains("placeholder")
        let isVeryShortFragment = duration > 0 && duration < 45 && soundsUnresolved

        return isMissingSentinel || soundsUnresolved || isVeryShortFragment
    }

    private func laneParkingReason(_ lane: VideoLane) -> (label: String, detail: String, icon: String, color: Color) {
        if lane.metadata?.ignoreForProduction == true {
            return (
                "held",
                "Held out of production by metadata. Keep it for recovery, but do not let it block editing.",
                "archivebox",
                QuipslyStudioTheme.lichen
            )
        }

        if lane.sourceVideo?.mediaURL.path.contains("__quipsly_missing_media__") == true {
            return (
                "missing",
                "This is a missing-media placeholder. Relink only if the actual picture needs it.",
                "questionmark.folder",
                QuipslyStudioTheme.clay
            )
        }

        let duration = lane.sourceVideo?.duration ?? lane.duration
        if duration > 0 && duration < 45 {
            return (
                "fragment",
                "Short camera fragment. Useful as recovery evidence, not a main host lane.",
                "film.stack",
                QuipslyStudioTheme.honey
            )
        }

        return (
            "recovery",
            "Unresolved source evidence preserved for later investigation.",
            "tray.full",
            QuipslyStudioTheme.lichen
        )
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
            case .some(true): proxy = "proxy-safe"
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
        .background(QuipslyStudioTheme.night.opacity(0.72))
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
                    .foregroundStyle(QuipslyStudioTheme.creek)
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
            .background(QuipslyStudioTheme.creek.opacity(0.09))
            .clipShape(RoundedRectangle(cornerRadius: 8))
        }
    }

    private func decisionState(for lane: VideoLane) -> (label: String, detail: String, icon: String, color: Color) {
        guard let source = lane.sourceVideo else {
            return ("NO SOURCE", "Nothing linked", "video.slash", QuipslyStudioTheme.sage)
        }

        let mediaTime = playbackEngine.playhead - source.offset
        guard mediaTime >= 0, mediaTime <= max(source.duration, 0) else {
            return ("OUT OF RANGE", "Not present at this playhead", "arrow.left.and.right", QuipslyStudioTheme.sage)
        }

        guard let tag = decisionAtPlayhead(for: lane) else {
            return ("REVIEW", "Synced and visible here; not currently chosen by Play Edit", "circle.dotted", QuipslyStudioTheme.creek)
        }

        switch tag.type {
        case .active:
            return ("SHOW", "Program may use this lane now", "eye.fill", QuipslyStudioTheme.honey)
        case .cut:
            return ("SKIP", "Play Edit jumps this region", "forward.end.fill", QuipslyStudioTheme.clay)
        default:
            return (tag.type.rawValue.uppercased(), "Tagged at this playhead", "tag.fill", QuipslyStudioTheme.lichen)
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
        String(format: "spine %.2fs · source %@", playbackEngine.playhead, sourceTimeText(lane))
    }

    private func sourceTimeText(_ lane: VideoLane) -> String {
        guard let source = lane.sourceVideo else { return "--" }
        let mediaTime = playbackEngine.playhead - source.offset
        if mediaTime < 0 { return String(format: "-%.2fs", abs(mediaTime)) }
        if source.duration > 0, mediaTime > source.duration { return String(format: "%.2fs+", source.duration) }
        return String(format: "%.2fs", mediaTime)
    }

    private func playheadPresenceText(for lane: VideoLane) -> String {
        guard let source = lane.sourceVideo else { return "No source attached yet" }
        let mediaTime = playbackEngine.playhead - source.offset
        if mediaTime < 0 { return "Not reached yet on this source" }
        if source.duration > 0, mediaTime > source.duration { return "Past the end of this source" }
        if decisionAtPlayhead(for: lane)?.type == .active { return "Program can show this source now" }
        if decisionAtPlayhead(for: lane)?.type == .cut { return "Play Edit skips this span" }
        return "Available for review at this playhead"
    }

    private func sourceBadge(_ lane: VideoLane) -> some View {
        let hasPlayer = playbackEngine.sourcePlayers[lane.id] != nil
        let source = lane.sourceVideo
        let isMissing = source?.mediaURL.path.contains("__quipsly_missing_media__") == true
        let proxyReady = source?.proxyURL.flatMap { ExternalMediaAccess.shared.fileExistsWithoutPrompt(at: $0) } == true
        let isProtected = source.map { isProtectedOriginal($0.mediaURL) } == true
        let label = hasPlayer ? "LIVE" : (isMissing ? "MISSING" : (proxyReady ? "PROXY" : (isProtected ? "PROTECTED" : "HELD")))
        let color = hasPlayer ? QuipslyStudioTheme.moss : (isMissing ? QuipslyStudioTheme.clay : (proxyReady ? QuipslyStudioTheme.honey : (isProtected ? QuipslyStudioTheme.honey : QuipslyStudioTheme.honey)))
        return Text(label)
            .font(.caption2)
            .fontWeight(.black)
            .foregroundStyle(color)
            .padding(.horizontal, 6)
            .padding(.vertical, 3)
            .background(color.opacity(0.12))
            .overlay(
                Capsule()
                    .stroke(color.opacity(0.18), lineWidth: 1)
            )
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
                .lineLimit(1)
                .minimumScaleFactor(0.72)
        }
        .foregroundStyle(color)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 5)
        .background(color.opacity(0.10))
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(color.opacity(0.14), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private func cardBackground(for lane: VideoLane) -> LinearGradient {
        if selectedLaneId == lane.id { return QuipslyStudioTheme.selectedSourceCardGradient }
        if playbackEngine.sourcePlayers[lane.id] != nil { return QuipslyStudioTheme.mossGlassGradient }
        if lane.sourceVideo?.mediaURL.path.contains("__quipsly_missing_media__") == true {
            return LinearGradient(
                colors: [QuipslyStudioTheme.clay.opacity(0.16), QuipslyStudioTheme.panelWarm.opacity(0.50)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        }
        if let source = lane.sourceVideo, isProtectedOriginal(source.mediaURL) {
            return LinearGradient(
                colors: [QuipslyStudioTheme.cedar.opacity(0.20), QuipslyStudioTheme.panelWarm.opacity(0.48)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        }
        return QuipslyStudioTheme.sourceCardGradient
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
        .overlay(
            Capsule()
                .stroke(color.opacity(0.14), lineWidth: 1)
        )
        .clipShape(Capsule())
    }
}
