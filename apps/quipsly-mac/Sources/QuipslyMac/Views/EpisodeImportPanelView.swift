import AppKit
import SwiftUI
import UniformTypeIdentifiers

struct EpisodeImportPanelView: View {
    @EnvironmentObject private var appState: AppState
    @EnvironmentObject private var engine: LocalEngineClient

    @State private var selectedRole: EpisodeImportRole = .spineAudio
    @State private var isChoosingFiles = false
    @State private var isChoosingFolder = false
    @State private var isChoosingPremierePacket = false
    @State private var isChoosingPremiereRelinkRoot = false
    @State private var autoStartPremiereMedia = false
    @State private var applyPremiereRelinks = true
    @State private var premiereRelinkPacketPath = ""
    @State private var premierePacketMessage: String?
    @State private var deviceLabel = ""
    @State private var sourceDeviceClockNotes = ""
    @State private var recordedStartOverride = ""
    @State private var recordedEndOverride = ""
    @State private var nextSegmentOrder = 1
    @State private var nextTakeOrder = 1

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Import to Episode")
                        .font(.title2.bold())
                    Text("Choose local audio, video, or folders, tag the intent, and queue non-destructive local processing. Files stay exactly where they are.")
                        .foregroundStyle(.secondary)
                }

                Spacer()

                Label("Non-destructive", systemImage: "shield.checkered")
                    .font(.caption.bold())
                    .foregroundStyle(.green)
            }

            LazyVGrid(columns: [GridItem(.adaptive(minimum: 240), spacing: 12)], alignment: .leading, spacing: 12) {
                TextField("Project slug", text: $appState.editorProjectSlug)
                    .textFieldStyle(.roundedBorder)
                TextField("Episode slug", text: $appState.editorEpisodeSlug)
                    .textFieldStyle(.roundedBorder)
                TextField("Home Nest slug", text: $appState.homeNestSlug)
                    .textFieldStyle(.roundedBorder)
            }

            Picker("Import role", selection: $selectedRole) {
                ForEach(EpisodeImportRole.allCases) { role in
                    Text(role.label).tag(role)
                }
            }
            .pickerStyle(.segmented)

            Text(selectedRole.detail)
                .font(.caption)
                .foregroundStyle(.secondary)

            DisclosureGroup("Sync clues for this import") {
                VStack(alignment: .leading, spacing: 12) {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 220), spacing: 12)], alignment: .leading, spacing: 12) {
                        TextField("Device label, e.g. Charlie iPhone", text: $deviceLabel)
                            .textFieldStyle(.roundedBorder)
                        TextField("Recorded start override", text: $recordedStartOverride)
                            .textFieldStyle(.roundedBorder)
                        TextField("Recorded end override", text: $recordedEndOverride)
                            .textFieldStyle(.roundedBorder)
                        TextField("Segment order", value: $nextSegmentOrder, format: .number)
                            .textFieldStyle(.roundedBorder)
                        TextField("Next take order", value: $nextTakeOrder, format: .number)
                            .textFieldStyle(.roundedBorder)
                    }

                    TextField("Device clock notes, e.g. iPhone clock looked 18s fast", text: $sourceDeviceClockNotes, axis: .vertical)
                        .textFieldStyle(.roundedBorder)
                        .lineLimit(2...4)

                    Text("Quipsly will preserve file creation/modification times as recordedStartAt clues, derive recordedEndAt after probing duration, and keep take order so broken recordings can be stacked safely later.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(.top, 8)
            }

            if selectedRole == .spineAudio {
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: "waveform.badge.magnifyingglass")
                        .foregroundStyle(.green)
                    VStack(alignment: .leading, spacing: 4) {
                        Text("This will become the episode spine")
                            .font(.headline)
                        Text("Pick the cleanest audio recording for the session. After upload and Nest registration, Quipsly will mark that asset as the sync anchor for this episode.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(.green.opacity(0.10), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            }

            HStack {
                Button {
                    isChoosingFiles = true
                } label: {
                    Label("Choose audio/video files", systemImage: "film.stack")
                }
                .buttonStyle(.borderedProminent)

                Button {
                    isChoosingFolder = true
                } label: {
                    Label("Choose folder", systemImage: "folder.badge.plus")
                }

                Spacer()

                Text(engine.connectionState.isOnline ? "Engine online" : "Engine offline: jobs will sit here until it reconnects")
                    .font(.caption)
                    .foregroundStyle(engine.connectionState.isOnline ? .green : .orange)
            }

            VStack(alignment: .leading, spacing: 10) {
                Divider()

                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Premiere project rescue")
                            .font(.headline)
                        Text("Stage a translated `.prproj` packet from Episodes 1-3. Missing/iCloud media is held safely; existing media can optionally start local processing.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    Spacer()

                    Button {
                        isChoosingPremierePacket = true
                    } label: {
                        Label("Stage Premiere packet", systemImage: "doc.badge.gearshape")
                    }
                    .buttonStyle(.bordered)

                    Button {
                        engine.runKnownPremiereImports(projectSlug: appState.editorProjectSlug)
                    } label: {
                        Label("Refresh E1-E3 packets", systemImage: "arrow.triangle.2.circlepath")
                    }
                    .buttonStyle(.bordered)

                    Button {
                        engine.runKnownPremiereImports(projectSlug: appState.editorProjectSlug, only: "episode-2")
                    } label: {
                        Label("Refresh Episode 2", systemImage: "2.circle")
                    }
                    .buttonStyle(.borderedProminent)
                }

                Toggle("Start available media immediately after staging", isOn: $autoStartPremiereMedia)
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Toggle("Apply unambiguous missing-media relinks after search", isOn: $applyPremiereRelinks)
                    .font(.caption)
                    .foregroundStyle(.secondary)

                if engine.premiereRelinkStatus != "No recovery scan yet" {
                    Text(engine.premiereRelinkStatus)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                }

                if let result = engine.lastPremiereRelinkResult {
                    PremiereRelinkResultSummaryView(result: result)
                }

                VStack(alignment: .leading, spacing: 8) {
                    Text("Quick stage generated packets")
                        .font(.caption.bold())
                        .foregroundStyle(.secondary)

                    HStack {
                        ForEach(knownPremierePackets, id: \.episodeSlug) { packet in
                            Button {
                                handlePremierePacketURL(packet.url)
                            } label: {
                                Label(packet.label, systemImage: packet.exists ? "doc.badge.gearshape" : "doc.badge.clock")
                            }
                            .disabled(!packet.exists)
                            .help(packet.exists ? packet.url.path : "Generate this packet first with scripts/quipsly/import-known-premiere-projects.mjs")
                        }

                        Spacer()
                    }
                }

                if let premierePacketMessage {
                    Text(premierePacketMessage)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                }

                if engine.knownPremiereImportStatus != "Not refreshed yet" {
                    Text(engine.knownPremiereImportStatus)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                }

                if !engine.knownPremiereImportSummaries.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Premiere packet health")
                            .font(.caption.bold())
                            .foregroundStyle(.secondary)

                        ForEach(engine.knownPremiereImportSummaries) { summary in
                            HStack(alignment: .top, spacing: 10) {
                                Image(systemName: summary.ok ? "doc.text.magnifyingglass" : "doc.badge.clock")
                                    .foregroundStyle(summary.ok ? ((summary.missingMediaCount ?? 0) > 0 ? .orange : .green) : .secondary)

                                VStack(alignment: .leading, spacing: 3) {
                                    Text("\(summary.episodeSlug): \(summary.healthLabel)")
                                        .font(.caption.bold())
                                    Text("\(summary.primaryTimelineClipCount ?? 0) clips · \(summary.mediaCount ?? 0) needed media · \(summary.skippedProjectMediaCount ?? 0) skipped project refs · \(summary.missingMediaCount ?? 0) missing needed · spine: \(summary.topSpineName ?? "none")")
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                    if let projectMediaCount = summary.projectMediaCount, projectMediaCount > (summary.mediaCount ?? 0) {
                                        Text("Only primary-timeline media is staged. \(projectMediaCount) total Premiere references stay as diagnostics.")
                                            .font(.caption2)
                                            .foregroundStyle(.secondary)
                                    }
                                    if let recommendation = summary.topSpineRecommendation, !recommendation.isEmpty {
                                        Text(recommendation)
                                            .font(.caption2)
                                            .foregroundStyle(.secondary)
                                    }
                                }

                                Spacer()

                                if summary.ok {
                                    VStack(alignment: .trailing, spacing: 6) {
                                        Button {
                                            handlePremierePacketURL(URL(fileURLWithPath: summary.outputPath))
                                        } label: {
                                            Label("Stage", systemImage: "tray.and.arrow.down")
                                        }

                                        Button {
                                            handlePremierePacketURL(URL(fileURLWithPath: summary.outputPath))
                                            appState.selectedSection = .premiereDraftEdit
                                        } label: {
                                            Label("Stage + review", systemImage: "timeline.selection")
                                        }
                                        .buttonStyle(.borderedProminent)

                                        if (summary.missingMediaCount ?? 0) > 0 {
                                            Button {
                                                premiereRelinkPacketPath = summary.outputPath
                                                isChoosingPremiereRelinkRoot = true
                                            } label: {
                                                Label("Find missing media", systemImage: "folder.badge.questionmark")
                                            }
                                        }
                                    }
                                    .controlSize(.small)
                                }
                            }
                            .padding(10)
                            .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        }
                    }
                }
            }

            if !engine.stagedPremierePackets.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Staged Premiere packets")
                        .font(.headline)

                    ForEach(engine.stagedPremierePackets) { packet in
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                Text("\(packet.projectSlug) / \(packet.episodeSlug)")
                                    .font(.subheadline.bold())
                                Spacer()
                                Text("\(packet.readyCount) ready · \(packet.heldCount) held")
                                    .font(.caption.bold())
                                    .foregroundStyle(packet.heldCount > 0 ? .orange : .green)
                            }

                            if let primarySequenceName = packet.primarySequenceName, !primarySequenceName.isEmpty {
                                Text("Primary sequence: \(primarySequenceName)")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }

                            Text("\(packet.mediaCount) media item(s), \(packet.timelineClipCount) timeline clips, \(packet.inactiveRangeCount) inactive source ranges.")
                                .font(.caption)
                                .foregroundStyle(.secondary)

                            if let suggestedSpineName = packet.suggestedSpineName {
                                Label("Suggested spine: \(suggestedSpineName)", systemImage: "waveform.badge.magnifyingglass")
                                    .font(.caption)
                                    .foregroundStyle(.green)
                            }
                        }
                        .padding(12)
                        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }
                }
            }

            if engine.episodeImportJobs.isEmpty {
                emptyQueue
            } else {
                importQueue
            }
        }
        .panelStyle()
        .fileImporter(isPresented: $isChoosingFiles, allowedContentTypes: [.item], allowsMultipleSelection: true) { result in
            handleImportSelection(result, isFolder: false)
        }
        .fileImporter(isPresented: $isChoosingFolder, allowedContentTypes: [.folder], allowsMultipleSelection: false) { result in
            handleImportSelection(result, isFolder: true)
        }
        .fileImporter(isPresented: $isChoosingPremierePacket, allowedContentTypes: [.json], allowsMultipleSelection: false) { result in
            handlePremierePacketSelection(result)
        }
        .fileImporter(isPresented: $isChoosingPremiereRelinkRoot, allowedContentTypes: [.folder], allowsMultipleSelection: false) { result in
            handlePremiereRelinkRootSelection(result)
        }
    }

    private var emptyQueue: some View {
        HStack(spacing: 12) {
            Image(systemName: "tray")
                .foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: 4) {
                Text("No episode imports queued yet.")
                    .font(.headline)
                Text("Start with spine audio if you have it. Add camera video and reference clips after that.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private var importQueue: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Local processing queue")
                        .font(.headline)
                    Text("\(queuedImportCount) queued · \(registeredImportCount) registered · \(heldImportCount) held")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                Button {
                    engine.startQueuedEpisodeImports(
                        projectSlug: appState.editorProjectSlug,
                        episodeSlug: appState.editorEpisodeSlug
                    )
                } label: {
                    Label("Start queued imports", systemImage: "play.circle")
                }
                .buttonStyle(.borderedProminent)
                .disabled(queuedImportCount == 0)
            }

            ForEach(engine.episodeImportJobs) { job in
                EpisodeImportJobRow(
                    job: job,
                    onRetry: {
                        engine.retryEpisodeImport(job)
                    },
                    onRevealInFinder: {
                        NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: job.path)])
                    },
                    onCopyDiagnostics: {
                        NSPasteboard.general.clearContents()
                        NSPasteboard.general.setString(job.diagnosticJSON, forType: .string)
                    },
                    onAddAtPlayhead: {
                        engine.attachEpisodeImportToTimeline(job, placement: .atPlayhead)
                        appState.editorProjectSlug = job.projectSlug
                        appState.editorEpisodeSlug = job.episodeSlug
                        appState.selectedSection = .episodeEditor
                    },
                    onAddAfterLastClip: {
                        engine.attachEpisodeImportToTimeline(job, placement: .afterLast)
                    },
                    onOpenNestLogin: {
                        appState.selectedSection = .nestSession
                    },
                    onOpenEmbeddedLogin: {
                        NestSessionActions.openEmbeddedEpisodeLogin(
                            appState: appState,
                            projectSlug: job.projectSlug,
                            episodeSlug: job.episodeSlug
                        )
                    },
                    onOpenEditor: {
                        appState.editorProjectSlug = job.projectSlug
                        appState.editorEpisodeSlug = job.episodeSlug
                        appState.selectedSection = .episodeEditor
                    }
                )
            }
        }
    }

    private var queuedImportCount: Int {
        engine.episodeImportJobs.filter { $0.status == .queued }.count
    }

    private var registeredImportCount: Int {
        engine.episodeImportJobs.filter { $0.status == .registered }.count
    }

    private var heldImportCount: Int {
        engine.episodeImportJobs.filter { $0.status == .held || $0.status == .failed }.count
    }

    private func handleImportSelection(_ result: Result<[URL], Error>, isFolder: Bool) {
        guard case .success(let urls) = result else { return }

        for (index, url) in urls.enumerated() {
            engine.queueEpisodeImport(
                path: url.path,
                isFolder: isFolder,
                projectSlug: appState.editorProjectSlug,
                episodeSlug: appState.editorEpisodeSlug,
                homeNestSlug: appState.homeNestSlug,
                nestBaseURL: appState.nestURL,
                role: selectedRole,
                recordingSyncMetadata: makeRecordingSyncMetadata(for: url, takeOffset: index)
            )
        }

        nextTakeOrder = max(1, nextTakeOrder + urls.count)
    }

    private func handlePremierePacketSelection(_ result: Result<[URL], Error>) {
        switch result {
        case .success(let urls):
            guard let url = urls.first else { return }

            handlePremierePacketURL(url)
        case .failure(let error):
            premierePacketMessage = "Could not choose Premiere packet: \(error.localizedDescription)"
        }
    }

    private var knownPremierePackets: [(episodeSlug: String, label: String, url: URL, exists: Bool)] {
        let root = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Dev/high-ground-studio/content/quipsly/premiere-imports", isDirectory: true)

        return [
            ("episode-1", "Episode 1 packet"),
            ("episode-2", "Episode 2 packet"),
            ("episode-3", "Episode 3 packet"),
        ].map { episodeSlug, label in
            let url = root.appendingPathComponent("\(episodeSlug).json")
            return (episodeSlug, label, url, FileManager.default.fileExists(atPath: url.path))
        }
    }

    private func handlePremierePacketURL(_ url: URL) {
        let didAccess = url.startAccessingSecurityScopedResource()
        defer {
            if didAccess {
                url.stopAccessingSecurityScopedResource()
            }
        }

        do {
            let data = try Data(contentsOf: url)
            let packet = try JSONDecoder().decode(PremiereImportPacket.self, from: data)
            appState.editorProjectSlug = packet.projectSlug
            appState.editorEpisodeSlug = packet.episodeSlug

            let summary = engine.stagePremiereImportPacket(
                packet,
                homeNestSlug: appState.homeNestSlug,
                nestBaseURL: appState.nestURL,
                autoStartAvailableMedia: autoStartPremiereMedia
            )

            let timelineClipCount = packet.quipslyEpisodeProductionPatch?.timelineClips?.count ?? 0
            let inactiveRangeCount = packet.quipslyEpisodeProductionPatch?.premiereDeactivatedSourceCandidates?.count ?? 0
            premierePacketMessage = "Staged \(summary.staged) media item(s) for \(packet.projectSlug) / \(packet.episodeSlug): \(summary.ready) ready, \(summary.held) held, \(timelineClipCount) timeline clips, \(inactiveRangeCount) inactive source ranges."
        } catch {
            premierePacketMessage = "Could not read Premiere packet at \(url.path): \(error.localizedDescription)"
        }
    }

    private func handlePremiereRelinkRootSelection(_ result: Result<[URL], Error>) {
        switch result {
        case .success(let urls):
            guard let url = urls.first else { return }
            let didAccess = url.startAccessingSecurityScopedResource()
            defer {
                if didAccess {
                    url.stopAccessingSecurityScopedResource()
                }
            }

            engine.relinkPremierePacketMedia(
                packetPath: premiereRelinkPacketPath,
                searchRoot: url.path,
                apply: applyPremiereRelinks
            )
        case .failure(let error):
            premierePacketMessage = "Could not choose media recovery folder: \(error.localizedDescription)"
        }
    }

    private func makeRecordingSyncMetadata(for url: URL, takeOffset: Int) -> EpisodeRecordingSyncMetadata {
        let attributes = (try? FileManager.default.attributesOfItem(atPath: url.path)) ?? [:]
        let createdAt = attributes[.creationDate] as? Date
        let modifiedAt = attributes[.modificationDate] as? Date
        let recordedStartAt = createdAt ?? modifiedAt

        return EpisodeRecordingSyncMetadata(
            recordedStartAt: trimmedOrNil(recordedStartOverride) ?? recordedStartAt?.ISO8601Format(),
            recordedEndAt: trimmedOrNil(recordedEndOverride),
            deviceLabel: trimmedOrNil(deviceLabel),
            sourceDeviceClockNotes: trimmedOrNil(sourceDeviceClockNotes),
            segmentOrder: max(1, nextSegmentOrder),
            takeOrder: max(1, nextTakeOrder + takeOffset),
            sourceFileCreatedAt: createdAt?.ISO8601Format(),
            sourceFileModifiedAt: modifiedAt?.ISO8601Format()
        )
    }

    private func trimmedOrNil(_ value: String) -> String? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}

private struct PremiereRelinkResultSummaryView: View {
    let result: PremiereMediaRelinkRunResult

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: result.ok ? "folder.badge.gearshape" : "exclamationmark.triangle")
                    .foregroundStyle(result.ok ? .teal : .orange)

                VStack(alignment: .leading, spacing: 4) {
                    Text(result.ok ? "Missing media recovery scan" : "Recovery scan needs attention")
                        .font(.caption.bold())
                    Text(result.plainEnglishSummary)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            HStack(spacing: 12) {
                recoveryMetric("Relinked", result.relinkedCount ?? 0, color: .green)
                recoveryMetric("Still missing", result.missingAfter ?? 0, color: (result.missingAfter ?? 0) > 0 ? .orange : .green)
                recoveryMetric("Ambiguous", result.ambiguousCount ?? 0, color: (result.ambiguousCount ?? 0) > 0 ? .orange : .secondary)
                recoveryMetric("Scanned", result.scannedFiles ?? 0, color: .secondary)
            }

            if let results = result.results, !results.isEmpty {
                ForEach(results.prefix(5)) { item in
                    HStack(alignment: .top, spacing: 8) {
                        Image(systemName: item.status == "relinked" ? "checkmark.circle" : item.status == "ambiguous" ? "questionmark.circle" : "xmark.circle")
                            .foregroundStyle(item.status == "relinked" ? .green : item.status == "ambiguous" ? .orange : .secondary)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.originalName ?? item.assetId)
                                .font(.caption.bold())
                            Text(item.selectedPath ?? item.oldPath ?? "No path")
                                .font(.caption2.monospaced())
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                                .truncationMode(.middle)
                        }
                    }
                }
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.teal.opacity(0.08), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func recoveryMetric(_ label: String, _ value: Int, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("\(value)")
                .font(.caption.bold())
                .foregroundStyle(color)
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
    }
}

private struct EpisodeImportJobRow: View {
    let job: EpisodeImportJob
    let onRetry: () -> Void
    let onRevealInFinder: () -> Void
    let onCopyDiagnostics: () -> Void
    let onAddAtPlayhead: () -> Void
    let onAddAfterLastClip: () -> Void
    let onOpenNestLogin: () -> Void
    let onOpenEmbeddedLogin: () -> Void
    let onOpenEditor: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
            Image(systemName: job.isFolder ? "folder" : job.role == .spineAudio ? "waveform" : "film")
                .font(.title3)
                .foregroundStyle(.teal)
                    .frame(width: 28)

                VStack(alignment: .leading, spacing: 5) {
                    HStack {
                        Text(job.displayName)
                            .font(.headline)
                            .lineLimit(1)
                        Text(job.status.label)
                            .font(.caption.bold())
                            .foregroundStyle(statusColor(job.status))
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(statusColor(job.status).opacity(0.12), in: Capsule())
                    }

                    Text(job.path)
                        .font(.system(.caption, design: .monospaced))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .truncationMode(.middle)

                    HStack {
                    Text(job.role.label)
                    Text(job.projectSlug)
                    Text(job.episodeSlug)
                    if job.role == .spineAudio {
                        Text("Episode spine")
                            .foregroundStyle(.green)
                    }
                }
                .font(.caption.bold())
                .foregroundStyle(.secondary)

                    if let message = job.message, !message.isEmpty {
                        Text(message)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                Spacer()
            }

            if let probe = job.probe {
                ProbeSummaryView(probe: probe)
            }

            if let proxy = job.proxy {
                ProxySummaryView(proxy: proxy)
            }

            if let recordingSyncMetadata = job.recordingSyncMetadata {
                RecordingSyncMetadataSummaryView(metadata: recordingSyncMetadata)
            }

            if let registration = job.registration {
                RegistrationSummaryView(registration: registration)
            }

            if let issue = calmJobIssue(job) {
                CalmJobIssueView(
                    issue: issue,
                    onOpenNestLogin: onOpenNestLogin,
                    onOpenEmbeddedLogin: onOpenEmbeddedLogin
                )
            }

            if let timelineAttachResult = job.timelineAttachResult {
                TimelineAttachSummaryView(result: timelineAttachResult)
            }

            HStack {
                Button {
                    onRetry()
                } label: {
                    Label("Retry", systemImage: "arrow.clockwise")
                }

                Button {
                    onRevealInFinder()
                } label: {
                    Label("Reveal in Finder", systemImage: "folder")
                }

                Button {
                    onCopyDiagnostics()
                } label: {
                    Label("Copy diagnostics", systemImage: "doc.on.doc")
                }

                Spacer()

                if job.registration?.assetId != nil {
                    Button {
                        onAddAtPlayhead()
                    } label: {
                        Label("Add at playhead / open editor", systemImage: "plus.rectangle.on.rectangle")
                    }

                    Button {
                        onAddAfterLastClip()
                    } label: {
                        Label("Add after last clip", systemImage: "text.append")
                    }
                }

                Button {
                    onOpenEditor()
                } label: {
                    Label("Open in Episode Editor", systemImage: "timeline.selection")
                }
                .buttonStyle(.borderedProminent)
            }
        }
        .padding(12)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func statusColor(_ status: EpisodeImportJobStatus) -> Color {
        switch status {
        case .queued: .blue
        case .probing: .cyan
        case .proxying: .orange
        case .uploading: .purple
        case .registered: .green
        case .failed: .red
        case .held: .secondary
        }
    }
}

private struct TimelineAttachSummaryView: View {
    let result: EpisodeTimelineAttachResult

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: result.ok ? "timeline.selection" : "exclamationmark.triangle")
                .foregroundStyle(result.ok ? .green : .orange)

            VStack(alignment: .leading, spacing: 4) {
                Text(result.ok ? "Timeline attach ready" : "Timeline attach needs review")
                    .font(.caption.bold())
                Text(summary)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background((result.ok ? Color.green : Color.orange).opacity(0.08), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private var summary: String {
        if let error = result.error, !result.ok {
            return error
        }

        let track = result.trackId ?? "timeline"
        let start = result.startIn.map { String(format: "%.1fs", $0) } ?? "the requested time"
        let duration = result.duration.map { String(format: "%.1fs", $0) } ?? "unknown duration"
        let duplicate = result.alreadyAttached == true ? " Existing clip reused." : ""
        return "Clip \(result.clipId ?? "unknown") on \(track), starts at \(start), duration \(duration).\(duplicate)"
    }
}

private struct CalmJobIssue: Equatable {
    var title: String
    var message: String
    var code: String?
    var recoverable: Bool?
}

private struct CalmJobIssueView: View {
    let issue: CalmJobIssue
    let onOpenNestLogin: () -> Void
    let onOpenEmbeddedLogin: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: issue.recoverable == false ? "xmark.octagon" : "exclamationmark.triangle")
                    .foregroundStyle(issue.recoverable == false ? .red : .orange)

                VStack(alignment: .leading, spacing: 4) {
                    Text(issue.title)
                        .font(.caption.bold())
                    Text(issue.message)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    if let code = issue.code, !code.isEmpty {
                        Text(code)
                            .font(.caption2.monospaced())
                            .foregroundStyle(.secondary)
                    }
                }
            }

            if NestSessionActions.isAuthIssue(code: issue.code, message: issue.message) {
                HStack {
                    Button {
                        onOpenNestLogin()
                    } label: {
                        Label("Sign in to Nest session", systemImage: "person.crop.circle.badge.checkmark")
                    }

                    Button {
                        onOpenEmbeddedLogin()
                    } label: {
                        Label("Open editor login", systemImage: "macwindow")
                    }
                }
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.orange.opacity(0.09), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

private func calmJobIssue(_ job: EpisodeImportJob) -> CalmJobIssue? {
    if let result = job.timelineAttachResult, !result.ok, let error = result.error {
        return CalmJobIssue(
            title: "Nest timeline update needs attention",
            message: error,
            code: result.errorCode,
            recoverable: result.recoverable
        )
    }

    if let error = job.registration?.error {
        return CalmJobIssue(
            title: "Upload or Nest registration needs attention",
            message: error,
            code: job.registration?.errorCode,
            recoverable: job.registration?.recoverable
        )
    }

    if let error = job.proxy?.error {
        return CalmJobIssue(
            title: "Proxy generation was held safely",
            message: error,
            code: job.proxy?.errorCode,
            recoverable: job.proxy?.recoverable
        )
    }

    if let error = job.probe?.error {
        return CalmJobIssue(
            title: "Media probe was held safely",
            message: error,
            code: job.probe?.errorCode,
            recoverable: job.probe?.recoverable
        )
    }

    return nil
}

private struct RecordingSyncMetadataSummaryView: View {
    let metadata: EpisodeRecordingSyncMetadata

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Label("Recording sync clues", systemImage: "clock.badge.checkmark")
                .font(.caption.bold())
                .foregroundStyle(.blue)

            LazyVGrid(columns: [GridItem(.adaptive(minimum: 160), alignment: .leading)], alignment: .leading, spacing: 8) {
                MetadataPill(label: "Device", value: metadata.deviceLabel ?? "Unknown")
                MetadataPill(label: "Start", value: metadata.recordedStartAt ?? "Unknown")
                MetadataPill(label: "End", value: metadata.recordedEndAt ?? "After probe")
                MetadataPill(label: "Segment", value: metadata.segmentOrder.map(String.init) ?? "Unknown")
                MetadataPill(label: "Take", value: metadata.takeOrder.map(String.init) ?? "Unknown")
            }

            if let notes = metadata.sourceDeviceClockNotes, !notes.isEmpty {
                Text(notes)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(10)
        .background(.blue.opacity(0.08), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

private struct MetadataPill: View {
    let label: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.caption2.bold())
                .foregroundStyle(.secondary)
            Text(value)
                .font(.caption.monospacedDigit())
                .lineLimit(1)
                .truncationMode(.middle)
        }
    }
}

private struct RegistrationSummaryView: View {
    let registration: EpisodeMediaRegistration

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Label(registration.ok ? "Registered with Nest" : "Upload/register held", systemImage: registration.ok ? "icloud.and.arrow.up.fill" : "pause.circle")
                .font(.caption.bold())
                .foregroundStyle(registration.ok ? .green : .orange)

            if let bucketName = registration.bucketName, !bucketName.isEmpty {
                Text("Bucket: \(bucketName)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            if let assetId = registration.assetId, !assetId.isEmpty {
                Text("Asset: \(assetId)")
                    .font(.system(.caption2, design: .monospaced))
                    .foregroundStyle(.secondary)
            }

            if registration.spineAudioSet == true {
                Label("Episode spine audio is set", systemImage: "waveform.badge.checkmark")
                    .font(.caption.bold())
                    .foregroundStyle(.green)
            } else if let spineAudioAssetId = registration.spineAudioAssetId, !spineAudioAssetId.isEmpty {
                Text("Spine target: \(spineAudioAssetId)")
                    .font(.system(.caption2, design: .monospaced))
                    .foregroundStyle(.secondary)
            }

            ForEach([
                registration.rawGcsUri,
                registration.proxyGcsUri,
                registration.thumbnailGcsUri,
            ].compactMap { $0 }.filter { !$0.isEmpty }, id: \.self) { uri in
                Text(uri)
                    .font(.system(.caption2, design: .monospaced))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .truncationMode(.middle)
            }

            if let error = registration.error, !error.isEmpty {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.orange)
            }

            ForEach(registration.warnings.prefix(3), id: \.self) { warning in
                Text(warning)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(10)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

private struct ProxySummaryView: View {
    let proxy: EpisodeMediaProxy

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack {
                Label(proxy.error == nil ? "Proxy cache ready" : "Proxy needs attention", systemImage: proxy.error == nil ? "rectangle.stack.badge.play" : "exclamationmark.triangle")
                    .foregroundStyle(proxy.error == nil ? .green : .orange)

                Text(proxy.kind.capitalized)

                if let durationSeconds = proxy.durationSeconds {
                    Text(formatDuration(durationSeconds))
                }
            }
            .font(.caption.bold())

            Text("Raw: \(proxy.rawPath)")
                .font(.system(.caption2, design: .monospaced))
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .truncationMode(.middle)

            if let proxyPath = proxy.proxyPath {
                Text("Proxy: \(proxyPath)")
                    .font(.system(.caption2, design: .monospaced))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .truncationMode(.middle)
            }

            if let thumbnailPath = proxy.thumbnailPath {
                Text("Thumb: \(thumbnailPath)")
                    .font(.system(.caption2, design: .monospaced))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .truncationMode(.middle)
            }

            if let error = proxy.error, !error.isEmpty {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.orange)
            }

            ForEach(proxy.warnings.prefix(2), id: \.self) { warning in
                Text(warning)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(10)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func formatDuration(_ seconds: Double) -> String {
        let total = max(0, Int(seconds.rounded()))
        let hours = total / 3600
        let minutes = (total % 3600) / 60
        let secs = total % 60

        if hours > 0 {
            return "\(hours):\(String(format: "%02d", minutes)):\(String(format: "%02d", secs))"
        }

        return "\(minutes):\(String(format: "%02d", secs))"
    }
}

private struct ProbeSummaryView: View {
    let probe: EpisodeMediaProbe

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack {
                Label(probe.ok ? "Probe complete" : "Probe needs attention", systemImage: probe.ok ? "waveform.path.ecg.rectangle" : "exclamationmark.triangle")
                    .foregroundStyle(probe.ok ? .green : .orange)

                if let durationSeconds = probe.durationSeconds {
                    Text(formatDuration(durationSeconds))
                }

                if probe.hasAudio {
                    Text("Audio")
                }

                if probe.hasVideo {
                    Text("Video")
                }
            }
            .font(.caption.bold())

            ForEach(probe.streams.prefix(3)) { stream in
                Text(stream.summary)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            if let error = probe.error, !error.isEmpty {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.orange)
            }

            ForEach(probe.warnings.prefix(2), id: \.self) { warning in
                Text(warning)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(10)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func formatDuration(_ seconds: Double) -> String {
        let total = max(0, Int(seconds.rounded()))
        let hours = total / 3600
        let minutes = (total % 3600) / 60
        let secs = total % 60

        if hours > 0 {
            return "\(hours):\(String(format: "%02d", minutes)):\(String(format: "%02d", secs))"
        }

        return "\(minutes):\(String(format: "%02d", secs))"
    }
}
