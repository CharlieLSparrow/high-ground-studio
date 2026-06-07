import AppKit
import SwiftUI

struct EpisodeCollaborationView: View {
    @EnvironmentObject private var appState: AppState
    @StateObject private var client = NestEpisodeCollaborationClient()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                header
                controls
                statusStrip
                collaboratorSection
                assetSection
                guidanceSection
            }
            .padding(24)
            .frame(maxWidth: 1180, alignment: .leading)
        }
        .task {
            await refreshLoop()
        }
    }

    private var header: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 8) {
                Text("Episode Sync")
                    .font(.largeTitle.bold())
                Text("Remote edit cockpit for Mako, Charlie, and anyone else cutting the same episode from their Mac.")
                    .foregroundStyle(.secondary)
                Text("Nest owns the timeline truth. The Mac app helps each editor fetch the right assets, claim edit focus, and open the live web editor without guessing.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            Button {
                appState.selectedSection = .episodeEditor
            } label: {
                Label("Open Episode Editor", systemImage: "timeline.selection")
            }
            .buttonStyle(.borderedProminent)
        }
    }

    private var controls: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                TextField("Project / Nest slug", text: $appState.editorProjectSlug)
                    .textFieldStyle(.roundedBorder)
                TextField("Episode slug", text: $appState.editorEpisodeSlug)
                    .textFieldStyle(.roundedBorder)
                Button {
                    Task {
                        await refreshCollaborationAndAvailability()
                    }
                } label: {
                    Label("Refresh", systemImage: "arrow.clockwise")
                }

                Button {
                    client.refreshLocalAssetAvailability(
                        projectSlug: appState.editorProjectSlug,
                        episodeSlug: appState.editorEpisodeSlug
                    )
                } label: {
                    Label("Check local files", systemImage: "externaldrive.badge.checkmark")
                }

                Button {
                    if let url = episodeEditorURL() {
                        NSWorkspace.shared.open(url)
                    }
                } label: {
                    Label("Browser fallback", systemImage: "safari")
                }
            }

            HStack {
                Button {
                    Task {
                        await client.heartbeat(
                            baseURL: appState.nestURL,
                            projectSlug: appState.editorProjectSlug,
                            episodeSlug: appState.editorEpisodeSlug
                        )
                    }
                } label: {
                    Label("Mark me active", systemImage: "dot.radiowaves.left.and.right")
                }

                Button {
                    Task {
                        await client.claimEditLease(
                            baseURL: appState.nestURL,
                            projectSlug: appState.editorProjectSlug,
                            episodeSlug: appState.editorEpisodeSlug
                        )
                    }
                } label: {
                    Label("Claim edit focus", systemImage: "cursorarrow.rays")
                }

                Button {
                    Task {
                        await client.releaseEditLease(
                            baseURL: appState.nestURL,
                            projectSlug: appState.editorProjectSlug,
                            episodeSlug: appState.editorEpisodeSlug
                        )
                    }
                } label: {
                    Label("Release focus", systemImage: "hand.raised")
                }

                Button {
                    client.copyDiagnostics()
                } label: {
                    Label("Copy diagnostics", systemImage: "doc.on.doc")
                }

                Button {
                    client.copyMakoHandoffNote(
                        baseURL: appState.nestURL,
                        projectSlug: appState.editorProjectSlug,
                        episodeSlug: appState.editorEpisodeSlug
                    )
                } label: {
                    Label("Copy Mako handoff", systemImage: "person.crop.circle.badge.plus")
                }
            }
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private var statusStrip: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Label(client.status, systemImage: client.errorMessage == nil ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                    .foregroundStyle(client.errorMessage == nil ? .green : .orange)
                if let copiedMessage = client.copiedMessage {
                    Text(copiedMessage)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Text("Role: \(client.state.role ?? "unknown")")
                    .font(.caption.bold())
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(.thinMaterial, in: Capsule())
            }

            if let errorMessage = client.errorMessage {
                HStack {
                    Text(errorMessage)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Button {
                        appState.selectedSection = .nestSession
                    } label: {
                        Label("Open Nest Session", systemImage: "person.crop.circle.badge.checkmark")
                    }
                }
            }

            HStack(spacing: 12) {
                metric("Clips", value: "\(client.state.timelineClipCount ?? 0)")
                metric("Assets", value: "\(client.state.assetManifest?.totalAssets ?? 0)")
                metric("Active editors", value: "\(max(client.state.activeCollaborators.count, client.state.ok ? 1 : 0))")
                metric("Fingerprint", value: String((client.state.timelineFingerprint ?? "missing").prefix(10)))
            }
        }
        .padding()
        .background(.bar, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private var collaboratorSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Editors here now")
                .font(.title2.bold())

            if let lease = client.state.editLease {
                Label("Edit focus is currently held by \(lease.name). This is a soft hand-raise, not a lock.", systemImage: "cursorarrow.rays")
                    .foregroundStyle(.orange)
            } else {
                Label("No one has claimed edit focus. Claim it when you are doing timeline surgery.", systemImage: "hand.wave")
                    .foregroundStyle(.secondary)
            }

            if client.state.activeCollaborators.isEmpty {
                Text("No recent collaborator heartbeats yet. Open the editor or click Mark me active to appear here.")
                    .foregroundStyle(.secondary)
            } else {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 240), spacing: 12)], alignment: .leading, spacing: 12) {
                    ForEach(client.state.activeCollaborators) { collaborator in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(collaborator.name)
                                .font(.headline)
                            Text(collaborator.email)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            HStack {
                                Text(collaborator.app)
                                Text(collaborator.route)
                                if collaborator.editing {
                                    Text("editing")
                                        .foregroundStyle(.orange)
                                }
                            }
                            .font(.caption.bold())
                        }
                        .padding()
                        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    }
                }
            }
        }
    }

    private var assetSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Assets Mako needs")
                .font(.title2.bold())
            Text("This list comes from the current Nest timeline and imported media. Green means the source looks usable; yellow means the editor can open but the source needs download/relink attention.")
                .foregroundStyle(.secondary)

            if client.state.assetManifest?.assets.isEmpty ?? true {
                VStack(alignment: .leading, spacing: 8) {
                    Label("No timeline assets reported yet", systemImage: "externaldrive.badge.questionmark")
                        .font(.headline)
                    Text("Import or attach episode media in Nest, then refresh this panel.")
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding()
                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            } else {
                LazyVStack(spacing: 10) {
                    ForEach(client.state.assetManifest?.assets ?? []) { asset in
                        assetRow(asset)
                    }
                }
            }
        }
    }

    private var guidanceSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("How we avoid stepping on each other")
                .font(.title2.bold())
            Text(client.state.guidance?.editSync ?? "Editors poll Nest for timeline changes. Clean editors auto-pull; dirty editors get a warning instead of being overwritten.")
            Text(client.state.guidance?.conflicts ?? "If two people save competing cuts, Nest keeps the newer timeline and asks the other editor to refresh before continuing.")
            Text(client.state.guidance?.assets ?? "Assets are listed as a manifest first. Managed background downloads are the next layer; for now each editor can open or copy source URLs safely.")
        }
        .foregroundStyle(.secondary)
        .padding()
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private func assetRow(_ asset: EpisodeCollaborationAsset) -> some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: asset.kind == "audio" ? "waveform" : asset.kind == "video" ? "video.fill" : "questionmark.folder")
                .font(.title2)
                .foregroundStyle(assetStatusColor(asset.status))
                .frame(width: 32)

            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text(asset.name)
                        .font(.headline)
                    Text(asset.status.replacingOccurrences(of: "-", with: " "))
                        .font(.caption.bold())
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(assetStatusColor(asset.status).opacity(0.16), in: Capsule())
                        .foregroundStyle(assetStatusColor(asset.status))
                }

                HStack(spacing: 10) {
                    if let role = asset.role {
                        Text(role)
                    }
                    if let trackId = asset.trackId {
                        Text(trackId)
                    }
                    if let durationSeconds = asset.durationSeconds {
                        Text(formatDuration(durationSeconds))
                    }
                    if let gcsUri = asset.gcsUri {
                        Text(gcsUri)
                            .lineLimit(1)
                            .truncationMode(.middle)
                    }
                }
                .font(.caption)
                .foregroundStyle(.secondary)

                if let availability = client.localAssetAvailability[asset.id] {
                    VStack(alignment: .leading, spacing: 3) {
                        Label(availability.label, systemImage: localAvailabilitySymbol(availability.status))
                            .font(.caption.bold())
                            .foregroundStyle(localAvailabilityColor(availability.status))
                        Text(localAvailabilityDetail(availability))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                            .truncationMode(.middle)
                            .textSelection(.enabled)
                    }
                }

                if let message = client.assetDownloadMessages[asset.id] {
                    Text(message)
                        .font(.caption)
                        .foregroundStyle(message.localizedCaseInsensitiveContains("failed") ? .red : .secondary)
                        .textSelection(.enabled)
                }
            }

            Spacer()

            if client.localAssetAvailability[asset.id]?.filePath != nil {
                Button {
                    client.openCachedAsset(
                        asset,
                        projectSlug: appState.editorProjectSlug,
                        episodeSlug: appState.editorEpisodeSlug
                    )
                } label: {
                    Label("Open cached", systemImage: "play.rectangle")
                }
            }

            if let urlString = asset.bestURL, let url = URL(string: urlString) {
                Button {
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(urlString, forType: .string)
                    client.copiedMessage = "Copied asset URL."
                } label: {
                    Label("Copy URL", systemImage: "doc.on.doc")
                }

                Button {
                    NSWorkspace.shared.open(url)
                } label: {
                    Label("Open", systemImage: "arrow.up.right.square")
                }

                Button {
                    Task {
                        await client.downloadAsset(
                            asset,
                            projectSlug: appState.editorProjectSlug,
                            episodeSlug: appState.editorEpisodeSlug
                        )
                    }
                } label: {
                    Label(client.localAssetAvailability[asset.id]?.status == .cached ? "Retry download" : "Download", systemImage: "arrow.down.circle")
                }

                Button {
                    client.revealAssetCacheFolder(
                        asset,
                        projectSlug: appState.editorProjectSlug,
                        episodeSlug: appState.editorEpisodeSlug
                    )
                } label: {
                    Label("Reveal", systemImage: "folder")
                }
            } else {
                Text("No source URL yet")
                    .font(.caption.bold())
                    .foregroundStyle(.orange)
            }
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func metric(_ label: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.headline)
                .lineLimit(1)
        }
        .frame(minWidth: 110, alignment: .leading)
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func episodeEditorURL() -> URL? {
        guard var components = URLComponents(string: appState.nestURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "https://nest.quipsly.com" : appState.nestURL) else {
            return nil
        }
        components.path = "/editor"
        components.queryItems = [
            URLQueryItem(name: "project", value: appState.editorProjectSlug.trimmingCharacters(in: .whitespacesAndNewlines)),
            URLQueryItem(name: "episode", value: appState.editorEpisodeSlug.trimmingCharacters(in: .whitespacesAndNewlines)),
        ]
        return components.url
    }

    private func assetStatusColor(_ status: String) -> Color {
        switch status {
        case "ready":
            return .green
        case "held", "needs-download":
            return .orange
        case "missing-source":
            return .red
        default:
            return .secondary
        }
    }

    private func formatDuration(_ seconds: Double) -> String {
        let safeSeconds = max(0, seconds)
        let minutes = Int(safeSeconds) / 60
        let remainder = Int(safeSeconds) % 60
        return "\(minutes)m \(remainder)s"
    }

    private func refreshLoop() async {
        await refreshCollaborationAndAvailability()

        while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(12))
            if Task.isCancelled { return }
            await client.heartbeat(
                baseURL: appState.nestURL,
                projectSlug: appState.editorProjectSlug,
                episodeSlug: appState.editorEpisodeSlug
            )
            await refreshCollaborationAndAvailability()
        }
    }

    private func refreshCollaborationAndAvailability() async {
        await client.load(
            baseURL: appState.nestURL,
            projectSlug: appState.editorProjectSlug,
            episodeSlug: appState.editorEpisodeSlug
        )
        client.refreshLocalAssetAvailability(
            projectSlug: appState.editorProjectSlug,
            episodeSlug: appState.editorEpisodeSlug
        )
    }

    private func localAvailabilitySymbol(_ status: EpisodeLocalAssetAvailability.Status) -> String {
        switch status {
        case .cached:
            return "checkmark.circle.fill"
        case .missing:
            return "arrow.down.circle"
        case .sourceUnavailable:
            return "link.badge.plus"
        case .needsRelink:
            return "link.badge.plus"
        case .error:
            return "exclamationmark.triangle.fill"
        }
    }

    private func localAvailabilityColor(_ status: EpisodeLocalAssetAvailability.Status) -> Color {
        switch status {
        case .cached:
            return .green
        case .missing:
            return .orange
        case .sourceUnavailable, .needsRelink:
            return .yellow
        case .error:
            return .red
        }
    }

    private func localAvailabilityDetail(_ availability: EpisodeLocalAssetAvailability) -> String {
        var pieces = [availability.detail]
        if let fileSizeBytes = availability.fileSizeBytes {
            pieces.append(formatBytes(fileSizeBytes))
        }
        if let filePath = availability.filePath {
            pieces.append(filePath)
        } else if let folderPath = availability.folderPath {
            pieces.append(folderPath)
        }
        return pieces.joined(separator: " · ")
    }

    private func formatBytes(_ bytes: Int64) -> String {
        let formatter = ByteCountFormatter()
        formatter.allowedUnits = [.useKB, .useMB, .useGB]
        formatter.countStyle = .file
        return formatter.string(fromByteCount: bytes)
    }
}
