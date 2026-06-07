import AppKit
import SwiftUI
import UniformTypeIdentifiers

struct PremiereDraftEditView: View {
    @EnvironmentObject private var appState: AppState
    @EnvironmentObject private var engine: LocalEngineClient
    @State private var statusMessage: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                header

                if let statusMessage {
                    Text(statusMessage)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(10)
                        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                }

                let drafts = engine.premiereDraftEdits()
                if drafts.isEmpty {
                    emptyState
                } else {
                    ForEach(drafts) { draft in
                        draftCard(draft)
                    }
                }
            }
            .padding(24)
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Premiere Draft Edit")
                .font(.largeTitle.bold())
            Text("Turn staged Premiere packets into Quipsly-shaped draft timelines. This is local-first and non-destructive: copy/export the draft, inspect asset matching, and only send to Nest once we have an explicit backup path.")
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .panelStyle()
    }

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("No Premiere packet staged yet", systemImage: "rectangle.stack.badge.play")
                .font(.title3.bold())
            Text("Go to Import to Episode, stage `episode-1.json`, `episode-2.json`, or `episode-3.json`, then come back here. Quipsly will show timeline clips, inactive source ranges, and asset matching status.")
                .foregroundStyle(.secondary)
            Button {
                appState.selectedSection = .mediaEngine
            } label: {
                Label("Open Import to Episode", systemImage: "film.stack")
            }
            .buttonStyle(.borderedProminent)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .panelStyle()
    }

    private func draftCard(_ draft: PremiereDraftEditPacket) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("\(draft.projectSlug) / \(draft.episodeSlug)")
                        .font(.title2.bold())
                    if let primarySequenceName = draft.primarySequenceName, !primarySequenceName.isEmpty {
                        Text("Primary sequence: \(primarySequenceName)")
                            .foregroundStyle(.secondary)
                    }
                }

                Spacer()

                statusPill(text: draft.unmatchedTimelineClipCount == 0 ? "Ready to review" : "Needs asset matching", tone: draft.unmatchedTimelineClipCount == 0 ? .green : .orange)
            }

            LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 12)], alignment: .leading, spacing: 12) {
                metric("Media", "\(draft.summary.mediaCount)")
                metric("Ready", "\(draft.summary.readyMediaCount)")
                metric("Held", "\(draft.summary.heldMediaCount)")
                metric("Timeline clips", "\(draft.summary.timelineClipCount)")
                metric("Matched clips", "\(draft.summary.matchedTimelineClipCount)")
                metric("Inactive ranges", "\(draft.summary.deactivatedSourceRangeCount)")
                if let skipped = draft.summary.skippedTimelineClipCount, skipped > 0 {
                    metric("Skipped clips", "\(skipped)")
                }
            }

            nextActionPanel(for: draft)
            missingMediaRecoveryPanel(for: draft)
            timelineOverview(for: draft)
            editReviewDeck(for: draft)

            if let suggestedSpine = draft.suggestedSpine {
                VStack(alignment: .leading, spacing: 6) {
                    Label("Suggested spine audio", systemImage: "waveform.badge.magnifyingglass")
                        .font(.headline)
                    Text(suggestedSpine.originalName ?? suggestedSpine.premiereAssetId)
                    Text("Status: \(humanize(suggestedSpine.matchStatus))")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(12)
                .background(.green.opacity(0.10), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            }

            safeWorkflowCallout(for: draft)

            if !draft.warnings.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Label("Before this becomes production", systemImage: "exclamationmark.triangle")
                        .font(.headline)
                    ForEach(draft.warnings, id: \.self) { warning in
                        Text("- \(warning)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(12)
                .background(.orange.opacity(0.10), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            }

            VStack(alignment: .leading, spacing: 10) {
                Text("Asset matching")
                    .font(.headline)

                ForEach(draft.assetMatches.prefix(8)) { match in
                    HStack(spacing: 10) {
                        Image(systemName: match.kind == "audio" ? "waveform" : "film")
                            .foregroundStyle(match.status == "matched" ? .green : match.status == "held" ? .orange : .secondary)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(match.displayName)
                                .lineLimit(1)
                            Text("\(humanize(match.status)) · \(match.registeredAssetId ?? match.premiereAssetId)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                    }
                }

                if draft.assetMatches.count > 8 {
                    Text("+ \(draft.assetMatches.count - 8) more media item(s) in exported diagnostics.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            HStack {
                Button {
                    copyToPasteboard(draft.compactJSONString)
                } label: {
                    Label("Copy draft JSON", systemImage: "doc.on.doc")
                }
                .buttonStyle(.borderedProminent)

                Button {
                    saveDraftToDisk(draft)
                } label: {
                    Label("Save draft JSON", systemImage: "square.and.arrow.down")
                }

                Button {
                    copyToPasteboard(missingMediaReport(for: draft))
                } label: {
                    Label("Copy missing report", systemImage: "exclamationmark.doc")
                }

                Button {
                    appState.editorProjectSlug = draft.projectSlug
                    appState.editorEpisodeSlug = draft.episodeSlug
                    appState.selectedSection = .episodeEditor
                } label: {
                    Label("Review in Episode Editor", systemImage: "timeline.selection")
                }

                Spacer()

                if draft.canStageMatchedOnlyRescue {
                    Button {
                        confirmAndStageInNest(draft.matchedOnlyRescueDraft)
                    } label: {
                        Label("Stage matched-only rescue", systemImage: "scissors")
                    }
                    .buttonStyle(.borderedProminent)
                    .help("Stage a safe draft that skips missing/unregistered Premiere media for now.")
                }

                Button {
                    confirmAndStageInNest(draft)
                } label: {
                    Label(draft.unmatchedTimelineClipCount == 0 ? "Stage in Nest" : "Stage full diagnostic draft", systemImage: "tray.and.arrow.down")
                }
            }

            if let sendMessage = engine.premiereDraftSendMessages[draft.id] ?? engine.premiereDraftSendMessages[draft.matchedOnlyRescueDraft.id] {
                Text(sendMessage)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .textSelection(.enabled)
            }
        }
        .panelStyle()
    }

    private func nextActionPanel(for draft: PremiereDraftEditPacket) -> some View {
        let hasHeldMedia = draft.summary.heldMediaCount > 0
        let hasUnmatchedClips = draft.unmatchedTimelineClipCount > 0
        let isReadyForNestStage = !hasHeldMedia && !hasUnmatchedClips
        let title = hasHeldMedia
            ? "Recover or relink held media first"
            : hasUnmatchedClips
                ? "Register local media before promoting"
                : "Ready to stage in Nest"
        let detail = hasHeldMedia
            ? "This draft still references files that are missing, iCloud-only, or not ready. Keep the draft visible, but recover the media before trusting playback."
            : hasUnmatchedClips
                ? "The Premiere packet translated successfully, but timeline clips still point at Premiere placeholders. Start queued imports in Media Engine so Quipsly assets replace those placeholders."
                : "All draft clips have matched Quipsly assets. Stage this draft in Nest, then promote from the web editor after reviewing the backup prompt."

        return HStack(alignment: .top, spacing: 12) {
            Image(systemName: isReadyForNestStage ? "checkmark.seal.fill" : hasHeldMedia ? "externaldrive.badge.exclamationmark" : "arrow.triangle.2.circlepath.circle")
                .font(.title2)
                .foregroundStyle(isReadyForNestStage ? .green : hasHeldMedia ? .orange : .blue)

            VStack(alignment: .leading, spacing: 5) {
                Text(title)
                    .font(.headline)
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            if hasHeldMedia || hasUnmatchedClips {
                VStack(alignment: .trailing, spacing: 8) {
                    Button {
                        appState.selectedSection = .mediaEngine
                    } label: {
                        Label(hasHeldMedia ? "Open Media Engine" : "Start imports", systemImage: "film.stack")
                    }
                    .buttonStyle(.borderedProminent)

                    if draft.canStageMatchedOnlyRescue {
                        Button {
                            confirmAndStageInNest(draft.matchedOnlyRescueDraft)
                        } label: {
                            Label("Skip missing for now", systemImage: "scissors")
                        }
                        .help("Create a matched-only rescue draft now. Missing media remains recoverable later.")
                    }
                }
            } else {
                Button {
                    confirmAndStageInNest(draft)
                } label: {
                    Label("Stage in Nest", systemImage: "tray.and.arrow.down")
                }
                .buttonStyle(.borderedProminent)
            }
        }
        .padding(12)
        .background((isReadyForNestStage ? Color.green : hasHeldMedia ? Color.orange : Color.blue).opacity(0.10), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func missingMediaRecoveryPanel(for draft: PremiereDraftEditPacket) -> some View {
        let missingMatches = draft.assetMatches.filter { $0.status != "matched" }
        let suggestedFolders = suggestedSearchFolders(for: missingMatches)

        return Group {
            if !missingMatches.isEmpty {
                VStack(alignment: .leading, spacing: 12) {
                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: "externaldrive.badge.exclamationmark")
                            .font(.title2)
                            .foregroundStyle(.orange)

                        VStack(alignment: .leading, spacing: 5) {
                            Text("Recoverable missing media")
                                .font(.headline)
                            Text("\(missingMatches.count) primary-timeline media item(s) are not registered yet. They are safe to skip for a matched-only rescue draft, and still recoverable later from the original packet.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }

                        Spacer()

                        Button {
                            copyToPasteboard(missingMediaReport(for: draft))
                        } label: {
                            Label("Copy report", systemImage: "doc.on.doc")
                        }

                        Button {
                            appState.selectedSection = .mediaEngine
                        } label: {
                            Label("Open recovery tools", systemImage: "film.stack")
                        }
                        .buttonStyle(.borderedProminent)
                    }

                    if !suggestedFolders.isEmpty {
                        VStack(alignment: .leading, spacing: 5) {
                            Text("Likely places to search next")
                                .font(.caption.bold())
                            ForEach(suggestedFolders.prefix(5), id: \.self) { folder in
                                HStack(spacing: 8) {
                                    Image(systemName: FileManager.default.fileExists(atPath: folder) ? "folder" : "folder.badge.questionmark")
                                        .foregroundStyle(FileManager.default.fileExists(atPath: folder) ? .green : .secondary)
                                    Text(folder)
                                        .font(.caption2.monospaced())
                                        .lineLimit(1)
                                        .truncationMode(.middle)
                                        .textSelection(.enabled)
                                    Spacer()
                                }
                            }
                            Text("Use Import to Episode > Find missing media, then choose the folder or drive where these files actually live now.")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                        .padding(10)
                        .background(.orange.opacity(0.08), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(Array(missingMatches.prefix(10))) { match in
                            missingMediaRow(match)
                        }

                        if missingMatches.count > 10 {
                            Text("+ \(missingMatches.count - 10) more item(s) in the copied report.")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                .padding(12)
                .background(.orange.opacity(0.10), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
        }
    }

    private func missingMediaRow(_ match: PremiereDraftAssetMatch) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: match.kind == "audio" ? "waveform.badge.exclamationmark" : "film.badge.exclamationmark")
                .foregroundStyle(missingMediaStatusColor(match.status))
                .frame(width: 24)

            VStack(alignment: .leading, spacing: 3) {
                HStack {
                    Text(match.displayName)
                        .font(.caption.bold())
                        .lineLimit(1)
                    Text(humanize(match.status))
                        .font(.caption2.bold())
                        .foregroundStyle(missingMediaStatusColor(match.status))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(missingMediaStatusColor(match.status).opacity(0.12), in: Capsule())
                }

                Text(match.localPath)
                    .font(.caption2.monospaced())
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .truncationMode(.middle)
                    .textSelection(.enabled)

                if let message = match.message, !message.isEmpty {
                    Text(message)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(8)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private func missingMediaStatusColor(_ status: String) -> Color {
        switch status {
        case "held": return .orange
        case "waiting-for-registration": return .blue
        case "not-staged": return .secondary
        default: return .orange
        }
    }

    private func suggestedSearchFolders(for matches: [PremiereDraftAssetMatch]) -> [String] {
        var seen = Set<String>()
        var folders: [String] = []

        for match in matches {
            let folder = URL(fileURLWithPath: match.localPath).deletingLastPathComponent().path
            guard !folder.isEmpty, !seen.contains(folder) else { continue }
            seen.insert(folder)
            folders.append(folder)
        }

        return folders
    }

    private func timelineOverview(for draft: PremiereDraftEditPacket) -> some View {
        let duration = max(1, draft.timelineClips.map { $0.startIn + $0.duration }.max() ?? 1)
        let tracks = timelineTracks(for: draft)

        return VStack(alignment: .leading, spacing: 10) {
            HStack {
                Label("Translated edit overview", systemImage: "timeline.selection")
                    .font(.headline)
                Spacer()
                Text(timelineTimeLabel(duration))
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
            }

            Text("This is the Premiere edit as a reviewable Quipsly draft. Blue lanes are video, green lanes are audio, orange means media still needs matching/recovery.")
                .font(.caption)
                .foregroundStyle(.secondary)

            VStack(alignment: .leading, spacing: 8) {
                ForEach(tracks, id: \.id) { track in
                    HStack(alignment: .center, spacing: 10) {
                        Text(track.id)
                            .font(.caption.bold().monospaced())
                            .frame(width: 34, alignment: .leading)
                            .foregroundStyle(track.id.hasPrefix("A") ? .green : .blue)

                        GeometryReader { geometry in
                            ZStack(alignment: .leading) {
                                RoundedRectangle(cornerRadius: 5, style: .continuous)
                                    .fill(.white.opacity(0.06))

                                ForEach(Array(track.clips.prefix(260))) { clip in
                                    RoundedRectangle(cornerRadius: 4, style: .continuous)
                                        .fill(timelineClipColor(clip).opacity(0.82))
                                        .frame(
                                            width: max(1.5, geometry.size.width * clip.duration / duration),
                                            height: 14
                                        )
                                        .offset(x: geometry.size.width * clip.startIn / duration)
                                        .help("\(clip.name) · \(timelineTimeLabel(clip.startIn)) + \(timelineTimeLabel(clip.duration)) · \(clip.matchStatus)")
                                }
                            }
                        }
                        .frame(height: 18)
                    }
                }
            }

            if draft.timelineClips.count > 1_000 {
                Text("Large edit: showing a lightweight lane overview. Detailed boundary work still happens in the Nest editor after staging.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(12)
        .background(.black.opacity(0.14), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func editReviewDeck(for draft: PremiereDraftEditPacket) -> some View {
        let sourceRows = draft.assetMatches
            .map { sourceReviewRow(for: $0, draft: draft) }
            .sorted { left, right in
                if left.isSpine != right.isSpine { return left.isSpine }
                if left.kind != right.kind { return left.kind == "video" }
                return left.displayName.localizedCaseInsensitiveCompare(right.displayName) == .orderedAscending
            }
        let activeClips = draft.timelineClips.filter { !$0.deactivated }
        let deactivatedClips = draft.timelineClips.filter(\.deactivated)
        let activeDuration = activeClips.reduce(0) { $0 + $1.duration }
        let timelineDuration = max(0, draft.timelineClips.map { $0.startIn + $0.duration }.max() ?? 0)
        let inactiveRangesDuration = draft.deactivatedSourceRanges.reduce(0) { $0 + $1.duration }

        return VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "rectangle.split.3x1")
                    .font(.title2)
                    .foregroundStyle(.purple)
                    .frame(width: 34)

                VStack(alignment: .leading, spacing: 4) {
                    Text("Local edit review deck")
                        .font(.headline)
                    Text("Quipsly treats the old Premiere edit as two things: source monitors for every camera/audio file, and a program monitor for the actual cut. You can inspect all synced material, then play only the active edit when gaps are deactivated.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                statusPill(
                    text: draft.unmatchedTimelineClipCount == 0 ? "Reviewable cut" : "Media still missing",
                    tone: draft.unmatchedTimelineClipCount == 0 ? .green : .orange
                )
            }

            LazyVGrid(columns: [GridItem(.adaptive(minimum: 220), spacing: 12)], alignment: .leading, spacing: 12) {
                reviewModeCard(
                    title: "Play source material",
                    symbol: "rectangle.stack.badge.play",
                    value: "\(sourceRows.count) source\(sourceRows.count == 1 ? "" : "s")",
                    detail: "Use this when hunting through cameras/audio. Nothing is cut away; missing files stay visible as recovery work."
                )
                reviewModeCard(
                    title: "Play active edit",
                    symbol: "forward.end.fill",
                    value: timelineTimeLabel(activeDuration),
                    detail: "Use this to watch the translated cut. Deactivated clips and removed source ranges are skipped instead of deleted."
                )
                reviewModeCard(
                    title: "Program timeline",
                    symbol: "timeline.selection",
                    value: timelineTimeLabel(timelineDuration),
                    detail: "\(activeClips.count) active clip(s), \(deactivatedClips.count) deactivated clip(s), \(timelineTimeLabel(inactiveRangesDuration)) recovered inactive source range(s)."
                )
            }

            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Label("Source monitors", systemImage: "rectangle.grid.2x2")
                        .font(.subheadline.bold())
                    Spacer()
                    Text("Each source stays separately inspectable.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                if sourceRows.isEmpty {
                    Text("No source media has been translated into this draft yet.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(12)
                        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                } else {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 260), spacing: 10)], alignment: .leading, spacing: 10) {
                        ForEach(sourceRows.prefix(12)) { row in
                            sourceMonitorCard(row)
                        }
                    }

                    if sourceRows.count > 12 {
                        Text("+ \(sourceRows.count - 12) more source monitor(s) in the draft JSON.")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            HStack {
                Button {
                    appState.editorProjectSlug = draft.projectSlug
                    appState.editorEpisodeSlug = draft.episodeSlug
                    appState.selectedSection = .episodeEditor
                } label: {
                    Label("Open active edit in Episode Editor", systemImage: "play.rectangle")
                }
                .buttonStyle(.borderedProminent)

                Button {
                    copyToPasteboard(reviewDeckReport(for: draft, rows: sourceRows))
                } label: {
                    Label("Copy review deck report", systemImage: "doc.on.doc")
                }

                Spacer()
            }
        }
        .padding(12)
        .background(.purple.opacity(0.08), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private struct SourceReviewRow: Identifiable {
        var id: String
        var displayName: String
        var kind: String
        var status: String
        var path: String
        var activeClipCount: Int
        var activeDuration: Double
        var inactiveRangeCount: Int
        var inactiveDuration: Double
        var tracks: [String]
        var isSpine: Bool
    }

    private func sourceReviewRow(for match: PremiereDraftAssetMatch, draft: PremiereDraftEditPacket) -> SourceReviewRow {
        let clips = draft.timelineClips.filter { $0.premiereAssetId == match.premiereAssetId }
        let activeClips = clips.filter { !$0.deactivated }
        let inactiveRanges = draft.deactivatedSourceRanges.filter { $0.premiereAssetId == match.premiereAssetId }
        let tracks = Array(Set(clips.map(\.trackId))).sorted(by: compareTrackIds)
        let spineAssetId = draft.suggestedSpine?.premiereAssetId

        return SourceReviewRow(
            id: match.id,
            displayName: match.displayName,
            kind: match.kind,
            status: match.status,
            path: match.localPath,
            activeClipCount: activeClips.count,
            activeDuration: activeClips.reduce(0) { $0 + $1.duration },
            inactiveRangeCount: inactiveRanges.count,
            inactiveDuration: inactiveRanges.reduce(0) { $0 + $1.duration },
            tracks: tracks,
            isSpine: spineAssetId == match.premiereAssetId
        )
    }

    private func reviewModeCard(title: String, symbol: String, value: String, detail: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: symbol)
                    .foregroundStyle(.purple)
                Text(title)
                    .font(.caption.bold())
                    .foregroundStyle(.secondary)
            }

            Text(value)
                .font(.title3.bold())
                .monospacedDigit()

            Text(detail)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func sourceMonitorCard(_ row: SourceReviewRow) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 8) {
                Image(systemName: row.kind == "audio" ? "waveform" : "video")
                    .foregroundStyle(row.kind == "audio" ? .green : .blue)
                    .frame(width: 22)

                VStack(alignment: .leading, spacing: 3) {
                    HStack {
                        Text(row.displayName)
                            .font(.caption.bold())
                            .lineLimit(1)

                        if row.isSpine {
                            Text("SPINE")
                                .font(.caption2.bold())
                                .foregroundStyle(.green)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(.green.opacity(0.12), in: Capsule())
                        }
                    }

                    Text(row.tracks.isEmpty ? "Not placed on timeline yet" : row.tracks.joined(separator: ", "))
                        .font(.caption2.monospaced())
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }

                Spacer()

                Text(humanize(row.status))
                    .font(.caption2.bold())
                    .foregroundStyle(sourceReviewStatusColor(row.status))
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(sourceReviewStatusColor(row.status).opacity(0.12), in: Capsule())
            }

            HStack(spacing: 10) {
                sourceMetric("Active", "\(row.activeClipCount)")
                sourceMetric("Used", timelineTimeLabel(row.activeDuration))
                sourceMetric("Inactive", "\(row.inactiveRangeCount)")
                sourceMetric("Skipped", timelineTimeLabel(row.inactiveDuration))
            }

            Text(row.path)
                .font(.caption2.monospaced())
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .truncationMode(.middle)
                .textSelection(.enabled)
        }
        .padding(10)
        .background(sourceReviewStatusColor(row.status).opacity(0.08), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func sourceMetric(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value)
                .font(.caption.bold())
                .monospacedDigit()
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func sourceReviewStatusColor(_ status: String) -> Color {
        switch status {
        case "matched": return .green
        case "waiting-for-registration": return .blue
        case "held", "not-staged": return .orange
        default: return .secondary
        }
    }

    private func reviewDeckReport(for draft: PremiereDraftEditPacket, rows: [SourceReviewRow]) -> String {
        let activeClips = draft.timelineClips.filter { !$0.deactivated }
        let deactivatedClips = draft.timelineClips.filter(\.deactivated)
        let activeDuration = activeClips.reduce(0) { $0 + $1.duration }
        let timelineDuration = max(0, draft.timelineClips.map { $0.startIn + $0.duration }.max() ?? 0)

        let sources = rows.map { row in
            "- \(row.displayName) [\(humanize(row.status))]: \(row.activeClipCount) active clip(s), \(timelineTimeLabel(row.activeDuration)) used, \(row.inactiveRangeCount) inactive range(s), tracks \(row.tracks.joined(separator: ", "))"
        }.joined(separator: "\n")

        return """
        Quipsly local edit review deck

        Project: \(draft.projectSlug)
        Episode: \(draft.episodeSlug)
        Sequence: \(draft.primarySequenceName ?? "none")

        Program edit:
        - Timeline length: \(timelineTimeLabel(timelineDuration))
        - Active edit length: \(timelineTimeLabel(activeDuration))
        - Active clips: \(activeClips.count)
        - Deactivated clips: \(deactivatedClips.count)
        - Recovered inactive source ranges: \(draft.deactivatedSourceRanges.count)
        - Missing/unmatched timeline clips: \(draft.unmatchedTimelineClipCount)

        Source monitors:
        \(sources.isEmpty ? "- No source monitors yet." : sources)
        """
    }

    private struct TimelineTrack: Identifiable {
        var id: String
        var clips: [PremiereDraftTimelineClip]
    }

    private func timelineTracks(for draft: PremiereDraftEditPacket) -> [TimelineTrack] {
        let grouped = Dictionary(grouping: draft.timelineClips) { $0.trackId }
        return grouped.keys
            .sorted(by: compareTrackIds)
            .map { trackId in
                TimelineTrack(
                    id: trackId,
                    clips: (grouped[trackId] ?? []).sorted { left, right in
                        left.startIn < right.startIn || (left.startIn == right.startIn && left.duration > right.duration)
                    }
                )
            }
    }

    private func compareTrackIds(_ left: String, _ right: String) -> Bool {
        let leftPrefix = left.prefix(1)
        let rightPrefix = right.prefix(1)
        if leftPrefix != rightPrefix {
            return leftPrefix == "V"
        }

        let leftNumber = Int(left.dropFirst()) ?? 999
        let rightNumber = Int(right.dropFirst()) ?? 999
        return leftNumber < rightNumber
    }

    private func timelineClipColor(_ clip: PremiereDraftTimelineClip) -> Color {
        if clip.matchStatus == "held" || clip.matchStatus == "not-staged" {
            return .orange
        }

        return clip.kind == "audio" || clip.trackId.hasPrefix("A") ? .green : .blue
    }

    private func timelineTimeLabel(_ seconds: Double) -> String {
        let safeSeconds = max(0, seconds)
        let total = Int(safeSeconds.rounded())
        let hours = total / 3600
        let minutes = (total % 3600) / 60
        let secs = total % 60

        if hours > 0 {
            return String(format: "%d:%02d:%02d", hours, minutes, secs)
        }

        return String(format: "%d:%02d", minutes, secs)
    }

    private func safeWorkflowCallout(for draft: PremiereDraftEditPacket) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Safe Premiere rescue workflow", systemImage: "lifepreserver")
                .font(.headline)

            VStack(alignment: .leading, spacing: 5) {
                workflowStep("1", "Register or hold media", "\(draft.summary.readyMediaCount) ready, \(draft.summary.heldMediaCount) held. Held files stay visible so iCloud/relink work is explicit.")
                workflowStep("2", "Stage draft in Nest", "Full drafts stay diagnostic. If old files are missing, stage a matched-only rescue draft to skip those clips for now without forgetting them.")
                workflowStep("3", "Preview in the web editor", "Use the Episode Editor to inspect the translated clips and inactive ranges before promotion.")
                workflowStep("4", "Promote only when confident", "Nest creates a backup before promoting the draft to the active timeline.")
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.blue.opacity(0.10), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func workflowStep(_ number: String, _ title: String, _ detail: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Text(number)
                .font(.caption.bold())
                .foregroundStyle(.white)
                .frame(width: 22, height: 22)
                .background(.blue, in: Circle())

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.caption.bold())
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func metric(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(value)
                .font(.title2.bold())
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func statusPill(text: String, tone: Color) -> some View {
        Text(text)
            .font(.caption.bold())
            .foregroundStyle(tone)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(tone.opacity(0.12), in: Capsule())
    }

    private func copyToPasteboard(_ value: String) {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(value, forType: .string)
        statusMessage = "Copied draft data to the clipboard."
    }

    private func saveDraftToDisk(_ draft: PremiereDraftEditPacket) {
        let panel = NSSavePanel()
        panel.allowedContentTypes = [.json]
        panel.canCreateDirectories = true
        panel.nameFieldStringValue = "\(draft.episodeSlug)-premiere-draft-edit.json"
        panel.begin { response in
            guard response == .OK, let url = panel.url else { return }

            do {
                let data = Data(draft.compactJSONString.utf8)
                try data.write(to: url, options: .atomic)
                DispatchQueue.main.async {
                    statusMessage = "Saved draft edit JSON to \(url.path)."
                }
            } catch {
                DispatchQueue.main.async {
                    statusMessage = "Could not save draft edit JSON: \(error.localizedDescription)"
                }
            }
        }
    }

    private func confirmAndStageInNest(_ draft: PremiereDraftEditPacket) {
        let alert = NSAlert()
        alert.messageText = "Stage this Premiere draft in Nest?"
        if let skipped = draft.summary.skippedTimelineClipCount, skipped > 0 {
            alert.informativeText = "This saves a matched-only rescue draft for \(draft.episodeSlug). It skips \(skipped) unmatched Premiere clip(s) for now, keeps the original packet recoverable, and does not overwrite the active episode timeline."
        } else {
            alert.informativeText = "This saves the draft edit as a review artifact for \(draft.episodeSlug). It does not overwrite the active episode timeline."
        }
        alert.alertStyle = .informational
        alert.addButton(withTitle: "Stage draft")
        alert.addButton(withTitle: "Cancel")

        if alert.runModal() == .alertFirstButtonReturn {
            engine.stagePremiereDraftEditInNest(draft, nestBaseURL: appState.nestURL)
        }
    }

    private func missingMediaReport(for draft: PremiereDraftEditPacket) -> String {
        let held = draft.assetMatches.filter { $0.status != "matched" }
        let lines = held.map { match in
            "- \(match.displayName) [\(humanize(match.status))]\n  \(match.localPath)\n  \(match.message ?? "No extra message.")"
        }
        return """
        Premiere draft edit missing/held media
        Project: \(draft.projectSlug)
        Episode: \(draft.episodeSlug)
        Generated: \(draft.generatedAt)

        \(lines.joined(separator: "\n"))
        """
    }

    private func humanize(_ value: String) -> String {
        value
            .split(separator: "-")
            .map { $0.prefix(1).uppercased() + $0.dropFirst() }
            .joined(separator: " ")
    }
}
