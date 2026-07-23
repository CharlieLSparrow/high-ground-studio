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

    @State private var isDropTargeted = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("MONITORS")
                        .font(.system(size: 10, weight: .black, design: .rounded))
                        .tracking(1.5)
                        .foregroundStyle(QuipslyStudioTheme.honey)
                    Text("Every angle. One playhead.")
                        .font(.headline.weight(.bold))
                }
                Spacer()
                Circle()
                    .fill(QuipslyStudioTheme.moss)
                    .frame(width: 8, height: 8)
            }

            if let sequence = projectStore.activeSequence {
                monitorCard(role: .charlie, lane: bestLane(for: .charlie, in: sequence))
                monitorCard(role: .homer, lane: bestLane(for: .homer, in: sequence))
                monitorCard(role: .clips, lane: bestLane(for: .clips, in: sequence))
            } else {
                emptyMonitorWall
            }

            Spacer(minLength: 0)
        }
        .padding(12)
        .background(QuipslyStudioTheme.night)
        .onDrop(of: [UTType.fileURL.identifier], isTargeted: $isDropTargeted, perform: handleDrop(providers:))
        .overlay(alignment: .leading) {
            if isDropTargeted { Rectangle().fill(QuipslyStudioTheme.creek).frame(width: 3) }
        }
        .accessibilityIdentifier("quipsly.sourceWall")
        .accessibilityLabel("Synchronized Charlie, Homer, and clips monitor wall")
    }

    private enum MonitorRole: String {
        case charlie = "Charlie"
        case homer = "Homer"
        case clips = "Clips"

        var tint: Color {
            switch self {
            case .charlie: return QuipslyStudioTheme.creek
            case .homer: return QuipslyStudioTheme.moss
            case .clips: return QuipslyStudioTheme.honey
            }
        }

        var key: String {
            switch self {
            case .charlie: return "1"
            case .homer: return "2"
            case .clips: return "C"
            }
        }
    }

    @ViewBuilder
    private func monitorCard(role: MonitorRole, lane: VideoLane?) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(spacing: 8) {
                Circle().fill(role.tint).frame(width: 8, height: 8)
                Text(role.rawValue)
                    .font(.subheadline.weight(.bold))
                Spacer()
                Text(role.key)
                    .font(.caption.monospaced().weight(.black))
                    .padding(.horizontal, 7)
                    .padding(.vertical, 3)
                    .background(role.tint.opacity(0.14), in: RoundedRectangle(cornerRadius: 6))
            }

            ZStack {
                Color.black
                if let lane, let player = playbackEngine.sourcePlayers[lane.id] {
                    PlayerView(player: player)
                        .aspectRatio(16.0 / 9.0, contentMode: .fit)
                } else {
                    VStack(spacing: 7) {
                        Image(systemName: role == .clips ? "film.stack" : "video.slash")
                            .font(.title2)
                        Text(role == .clips ? "No clip at playhead" : "Source unavailable here")
                            .font(.caption)
                    }
                    .foregroundStyle(QuipslyStudioTheme.sage)
                }
            }
            .aspectRatio(16.0 / 9.0, contentMode: .fit)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(selectedLaneId == lane?.id ? role.tint : QuipslyStudioTheme.quietStroke, lineWidth: selectedLaneId == lane?.id ? 2 : 1)
            )
            .overlay(alignment: .bottomLeading) {
                if let lane {
                    Text(sourceTime(for: lane))
                        .font(.caption2.monospacedDigit().weight(.bold))
                        .padding(.horizontal, 7)
                        .padding(.vertical, 4)
                        .background(.black.opacity(0.74), in: Capsule())
                        .padding(7)
                }
            }
            .contentShape(Rectangle())
            .onTapGesture { if let lane { onSelectLane?(lane.id) } }

            HStack(spacing: 7) {
                if let lane {
                    Text(lane.name)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                    Spacer(minLength: 4)
                    Button("Show") { onShowLaneWindow?(lane.id) }
                        .buttonStyle(.borderedProminent)
                        .tint(role.tint)
                    Button("Quiet") { onCutLaneWindow?(lane.id) }
                        .buttonStyle(.bordered)
                } else {
                    Text(role == .clips ? "Watched media appears here when it overlaps the playhead." : "The monitor stays blank outside this host segment.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            .controlSize(.small)
        }
        .padding(10)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(selectedLaneId == lane?.id ? role.tint.opacity(0.12) : QuipslyStudioTheme.panel.opacity(0.90))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(role.tint.opacity(selectedLaneId == lane?.id ? 0.55 : 0.18), lineWidth: 1)
        )
        .accessibilityIdentifier("quipsly.monitor.\(role.rawValue.lowercased())")
    }

    private var emptyMonitorWall: some View {
        VStack(spacing: 10) {
            Image(systemName: "video.badge.plus").font(.largeTitle)
            Text("Import synchronized host sources")
                .font(.headline)
        }
        .foregroundStyle(QuipslyStudioTheme.sage)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func bestLane(for role: MonitorRole, in sequence: MediaSequence) -> VideoLane? {
        let candidates = sequence.lanes.filter { lane in
            guard isVideoLane(lane), lane.metadata?.ignoreForProduction != true else { return false }
            let text = laneText(lane)
            switch role {
            case .charlie: return text.contains("charlie")
            case .homer: return text.contains("homer") || text.contains("scott")
            case .clips: return !text.contains("charlie") && !text.contains("homer") && !text.contains("scott")
            }
        }
        return candidates.sorted { lhs, rhs in
            let leftPresent = isPresent(lhs)
            let rightPresent = isPresent(rhs)
            if leftPresent != rightPresent { return leftPresent }
            let leftPlayable = playbackEngine.sourcePlayers[lhs.id] != nil
            let rightPlayable = playbackEngine.sourcePlayers[rhs.id] != nil
            if leftPlayable != rightPlayable { return leftPlayable }
            return (lhs.sourceVideo?.duration ?? lhs.duration) > (rhs.sourceVideo?.duration ?? rhs.duration)
        }.first
    }

    private func laneText(_ lane: VideoLane) -> String {
        [lane.name, lane.metadata?.role ?? "", lane.metadata?.sourceLabel ?? "", lane.sourceVideo?.mediaURL.lastPathComponent ?? ""]
            .joined(separator: " ").lowercased()
    }

    private func isVideoLane(_ lane: VideoLane) -> Bool {
        let role = lane.metadata?.role.lowercased() ?? ""
        let kind = lane.metadata?.mediaKind.lowercased() ?? ""
        if role.contains("audio") || kind == "audio" { return false }
        let ext = lane.sourceVideo?.mediaURL.pathExtension.lowercased() ?? ""
        return !["wav", "mp3", "m4a", "aac", "aif", "aiff", "flac"].contains(ext)
    }

    private func isPresent(_ lane: VideoLane) -> Bool {
        guard let source = lane.sourceVideo else { return false }
        let local = playbackEngine.playhead - source.offset
        return local >= 0 && local <= source.duration
    }

    private func sourceTime(for lane: VideoLane) -> String {
        guard let source = lane.sourceVideo else { return "--:--" }
        let local = playbackEngine.playhead - source.offset
        guard local >= 0, local <= source.duration else { return "OUT" }
        let total = Int(local)
        return String(format: "%02d:%02d", total / 60, total % 60)
    }

    private func handleDrop(providers: [NSItemProvider]) -> Bool {
        guard let provider = providers.first else { return false }
        provider.loadItem(forTypeIdentifier: UTType.fileURL.identifier, options: nil) { item, _ in
            guard let data = item as? Data,
                  let url = URL(dataRepresentation: data, relativeTo: nil) else { return }
            DispatchQueue.main.async { onDropVideo?(url) }
        }
        return true
    }
}
