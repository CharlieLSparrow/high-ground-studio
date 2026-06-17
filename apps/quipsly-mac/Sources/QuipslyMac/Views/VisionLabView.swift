import AppKit
import SwiftUI
import UniformTypeIdentifiers

struct VisionLabView: View {
    @EnvironmentObject private var appState: AppState
    @EnvironmentObject private var engine: LocalEngineClient
    @EnvironmentObject private var mediaAccess: MediaAccessStore
    @State private var isChoosingFolder = false
    @State private var showsEmbeddedWorkbench = false
    @State private var showsEmbeddedNestLab = false
    @State private var nestBridgeStatus = "Local packet not checked yet."
    @State private var nestBridgeStats: [NestBridgeMetric] = []
    @State private var isReadingNestPacket = false
    @State private var isCheckingNestPacket = false
    @State private var isImportingNestPacket = false
    private let reefBallDatasetPath = "/Volumes/My Passport/MarineBiology/tile-media/2026-06-09-text-import"
    private let reefBallWorkbenchURL = URL(string: "http://127.0.0.1:8765/")!
    private let reefBallPacketSummaryURL = URL(string: "http://127.0.0.1:8765/api/nest-packet?summary=1")!

    var body: some View {
        Group {
            if showsEmbeddedNestLab {
                embeddedNestVisualResearchLab
            } else if showsEmbeddedWorkbench {
                embeddedReefBallWorkbench
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 24) {
                        HeroPanel(
                            title: "Vision Lab",
                            eyebrow: "Research image identification",
                            description: "A calm local dashboard for turning folders of research photos into reviewed datasets, annotations, model jobs, and publishable findings."
                        )

                        if !engine.capabilities.visionLab {
                            lockedPanel
                        }

                        HStack(alignment: .top, spacing: 16) {
                            MetricTile(label: "Datasets", value: "\(engine.visionLabStatus.datasetCount)")
                            MetricTile(label: "Images", value: "\(engine.visionLabStatus.imageCount)")
                            MetricTile(label: "Annotations", value: "\(engine.visionLabStatus.annotationCount)")
                            MetricTile(label: "Training jobs", value: "\(engine.visionLabStatus.trainingJobCount)")
                        }

                        reefBallWorkspacePanel

                        VStack(alignment: .leading, spacing: 14) {
                            Text("Start safely")
                                .font(.title2.bold())
                            Text("Choose a folder first. Quipsly will create a manifest before it moves, renames, trains, or uploads anything.")
                                .foregroundStyle(.secondary)

                            HStack {
                                Button {
                                    isChoosingFolder = true
                                } label: {
                                    Label("Choose research photo folder", systemImage: "folder.badge.plus")
                                }
                                .buttonStyle(.borderedProminent)

                                Button {
                                    engine.refreshStatus()
                                } label: {
                                    Label("Refresh engine status", systemImage: "arrow.clockwise")
                                }
                            }

                            if !appState.selectedDatasetPath.isEmpty {
                                Text(appState.selectedDatasetPath)
                                    .font(.system(.caption, design: .monospaced))
                                    .foregroundStyle(.secondary)
                                    .textSelection(.enabled)
                            }

                            if let activePath = engine.visionLabStatus.activeDatasetPath {
                                Label("Engine active dataset: \(activePath)", systemImage: "checkmark.seal")
                                    .font(.caption)
                                    .foregroundStyle(.green)
                                    .textSelection(.enabled)
                            }
                        }
                        .panelStyle()

                        VStack(alignment: .leading, spacing: 14) {
                            Text("Next actions")
                                .font(.title2.bold())
                            ForEach(engine.visionLabStatus.nextActions, id: \.self) { action in
                                Label(action, systemImage: "checklist")
                                    .foregroundStyle(.primary)
                            }
                        }
                        .panelStyle()

                        VStack(alignment: .leading, spacing: 14) {
                            Text("Local training")
                                .font(.title2.bold())
                            Text(engine.capabilities.mlTraining ? "Training commands are enabled in this local engine." : "Training is intentionally gated for now. The dashboard can prepare datasets before any model job is allowed to run.")
                                .foregroundStyle(.secondary)

                            HStack {
                                Button("Build dataset manifest") {
                                    engine.buildVisionManifest(path: appState.selectedDatasetPath)
                                }
                                    .disabled(appState.selectedDatasetPath.isEmpty)
                                Button("Compute full hashes") {
                                    engine.computeVisionContentHashes()
                                }
                                    .disabled(engine.visionLabStatus.manifest == nil || engine.visionLabStatus.manifest?.safety.contentHashesComputed == true)
                                Button("Queue training job") {}
                                    .disabled(!engine.capabilities.mlTraining)
                            }
                        }
                        .panelStyle()

                        if let manifest = engine.visionLabStatus.manifest {
                            manifestPanel(manifest)
                        }

                        if !engine.savedVisionManifests.isEmpty {
                            savedManifestsPanel(engine.savedVisionManifests)
                        }

                        if !engine.visionLabStatus.jobs.isEmpty {
                            VStack(alignment: .leading, spacing: 12) {
                                Text("Recent local jobs")
                                    .font(.title2.bold())

                                ForEach(engine.visionLabStatus.jobs) { job in
                                    HStack(alignment: .top) {
                                        Image(systemName: job.status == "complete" ? "checkmark.circle.fill" : job.status == "failed" ? "exclamationmark.triangle.fill" : "clock")
                                            .foregroundStyle(job.status == "complete" ? .green : job.status == "failed" ? .orange : .secondary)
                                        VStack(alignment: .leading, spacing: 4) {
                                            Text(job.label)
                                                .font(.headline)
                                            if let summary = job.summary {
                                                Text(summary)
                                                    .foregroundStyle(.secondary)
                                            }
                                        }
                                        Spacer()
                                        Text(job.status)
                                            .font(.caption.bold())
                                            .foregroundStyle(.secondary)
                                    }
                                    .padding(.vertical, 4)
                                }
                            }
                            .panelStyle()
                        }

                        if !engine.visionLabStatus.notes.isEmpty {
                            VStack(alignment: .leading, spacing: 10) {
                                Text("Notes")
                                    .font(.headline)
                                ForEach(engine.visionLabStatus.notes, id: \.self) { note in
                                    Text(note)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            .panelStyle()
                        }
                    }
                    .padding(28)
                }
            }
        }
        .background(QuipslyBackground())
        .onAppear {
            openRequestedWorkbenchIfNeeded()
        }
        .onChange(of: appState.visionLabWorkbenchRequestID) { _, _ in
            openRequestedWorkbenchIfNeeded()
        }
        .fileImporter(isPresented: $isChoosingFolder, allowedContentTypes: [.folder], allowsMultipleSelection: false) { result in
            switch result {
            case .success(let urls):
                if let url = urls.first {
                    mediaAccess.addRoot(url, label: "Vision dataset")
                }
                appState.selectedDatasetPath = urls.first?.path ?? ""
                if !appState.selectedDatasetPath.isEmpty {
                    engine.registerVisionDataset(path: appState.selectedDatasetPath)
                }
            case .failure:
                appState.selectedDatasetPath = ""
            }
        }
    }

    private var embeddedReefBallWorkbench: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Button {
                    showsEmbeddedWorkbench = false
                } label: {
                    Label("Vision Lab", systemImage: "chevron.left")
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text("Reef Ball Image Workbench")
                        .font(.headline)
                    Text(reefBallWorkbenchURL.absoluteString)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                }

                Spacer()

                Button {
                    NSWorkspace.shared.open(reefBallWorkbenchURL)
                } label: {
                    Label("Open in Browser", systemImage: "safari")
                }
            }
            .padding(.horizontal)
            .padding(.vertical, 10)
            .background(.bar)

            Divider()

            QuipslyWebRouteView(
                url: reefBallWorkbenchURL,
                title: "Reef Ball Workbench",
                subtitle: "Local annotations, masks, workbook ties, and tile composition",
                showsSessionGuidance: false,
                useMacWebSession: false
            )
        }
    }

    private var embeddedNestVisualResearchLab: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Button {
                    showsEmbeddedNestLab = false
                } label: {
                    Label("Vision Lab", systemImage: "chevron.left")
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text("Marine Biology Nest Lab")
                        .font(.headline)
                    Text(nestVisualResearchLabURL?.absoluteString ?? appState.nestURL)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                }

                Spacer()

                if !hasConnectedNestProfile {
                    Button {
                        appState.selectedSection = .nestSession
                    } label: {
                        Label("Nest Session", systemImage: "person.badge.key")
                    }
                }

                Button {
                    openNestVisualResearchLab()
                } label: {
                    Label("Open in Browser", systemImage: "safari")
                }
            }
            .padding(.horizontal)
            .padding(.vertical, 10)
            .background(.bar)

            Divider()

            if let url = nestVisualResearchLabURL {
                QuipslyWebRouteView(
                    url: url,
                    title: "Marine Biology Nest Lab",
                    subtitle: "Shared reef-ball evidence, packet import, and review queues",
                    showsSessionGuidance: true,
                    useMacWebSession: true
                )
            } else {
                ContentUnavailableView(
                    "Nest URL unavailable",
                    systemImage: "network.slash",
                    description: Text("Check Settings and set the Nest URL before opening the embedded lab.")
                )
            }
        }
    }

    private var lockedPanel: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Vision Lab is visible but not enabled by this engine.", systemImage: "lock")
                .font(.headline)
            Text("This is how account or workspace entitlements should feel: the module can exist without cluttering every user's workflow.")
                .foregroundStyle(.secondary)
        }
        .panelStyle()
    }

    private var reefBallWorkspacePanel: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 16) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Chula Vista Reef Ball Workspace")
                        .font(.title2.bold())
                    Text("Use the HDD photo set as the local source for manifests, masks, workbook matching, and later model jobs.")
                        .foregroundStyle(.secondary)
                }

                Spacer()

                Label(reefBallDatasetExists ? "HDD folder found" : "HDD folder not mounted", systemImage: reefBallDatasetExists ? "externaldrive.fill" : "externaldrive.badge.xmark")
                    .font(.caption.bold())
                    .foregroundStyle(reefBallDatasetExists ? .green : .orange)
            }

            Text(reefBallDatasetPath)
                .font(.system(.caption, design: .monospaced))
                .foregroundStyle(.secondary)
                .textSelection(.enabled)

            LazyVGrid(columns: [GridItem(.adaptive(minimum: 180), spacing: 10)], alignment: .leading, spacing: 10) {
                Button {
                    useReefBallDataset()
                } label: {
                    Label("Use reef-ball dataset", systemImage: "externaldrive.connected.to.line.below")
                }
                .buttonStyle(.borderedProminent)
                .disabled(!reefBallDatasetExists)

                Button {
                    useReefBallDataset(buildManifest: true)
                } label: {
                    Label("Build manifest", systemImage: "doc.badge.gearshape")
                }
                .disabled(!reefBallDatasetExists)

                Button {
                    showInFinder(reefBallDatasetPath)
                } label: {
                    Label("Reveal folder", systemImage: "finder")
                }
                .disabled(!reefBallDatasetExists)

                Button {
                    showsEmbeddedWorkbench = true
                } label: {
                    Label("Open in Mac app", systemImage: "macwindow")
                }

                Button {
                    NSWorkspace.shared.open(reefBallWorkbenchURL)
                } label: {
                    Label("Open in browser", systemImage: "safari")
                }

                Button {
                    showsEmbeddedNestLab = true
                } label: {
                    Label("Open Nest in Mac app", systemImage: "macwindow.and.cursorarrow")
                }

                Button {
                    openNestVisualResearchLab()
                } label: {
                    Label("Open Nest in browser", systemImage: "network")
                }
            }

            nestBridgePanel

            if !reefBallDatasetExists {
                Text("Mount My Passport or choose the folder manually to register the dataset.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .panelStyle()
    }

    private var nestBridgePanel: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: hasConnectedNestProfile ? "checkmark.icloud.fill" : "icloud.slash")
                    .font(.title2)
                    .foregroundStyle(hasConnectedNestProfile ? .green : .orange)

                VStack(alignment: .leading, spacing: 4) {
                    Text("Nest Bridge")
                        .font(.headline)
                    Text(nestBridgeStatus)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                }

                Spacer()

                if hasConnectedNestProfile {
                    Text(appState.activeNestSessionProfileEmail)
                        .font(.caption.bold())
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                } else {
                    Button {
                        appState.selectedSection = .nestSession
                    } label: {
                        Label("Sign in", systemImage: "person.badge.key")
                    }
                    .font(.caption)
                }
            }

            if !nestBridgeStats.isEmpty {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 92), spacing: 8)], alignment: .leading, spacing: 8) {
                    ForEach(nestBridgeStats) { metric in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(metric.value)
                                .font(.title3.bold())
                            Text(metric.label.uppercased())
                                .font(.caption2.bold())
                                .foregroundStyle(.secondary)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(10)
                        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                }
            }

            HStack {
                Button {
                    readLocalNestPacket()
                } label: {
                    Label(isReadingNestPacket ? "Reading..." : "Read packet", systemImage: "doc.text.magnifyingglass")
                }
                .disabled(isReadingNestPacket || isCheckingNestPacket || isImportingNestPacket)

                Button {
                    checkNestPacket()
                } label: {
                    Label(isCheckingNestPacket ? "Checking..." : "Check Nest", systemImage: "icloud.and.arrow.down")
                }
                .disabled(!hasConnectedNestProfile || isReadingNestPacket || isCheckingNestPacket || isImportingNestPacket)

                Button {
                    importLocalNestPacket()
                } label: {
                    Label(isImportingNestPacket ? "Importing..." : "Import to Nest", systemImage: "square.and.arrow.up")
                }
                .buttonStyle(.borderedProminent)
                .disabled(!hasConnectedNestProfile || isReadingNestPacket || isCheckingNestPacket || isImportingNestPacket)

                Button {
                    showsEmbeddedNestLab = true
                } label: {
                    Label("Open Nest", systemImage: "network")
                }
            }
            .font(.caption.bold())
        }
        .padding(14)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func manifestPanel(_ manifest: VisionDatasetManifest) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Dataset manifest")
                        .font(.title2.bold())
                    Text(manifest.datasetName)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Label("Nothing moved", systemImage: "shield.checkered")
                    .font(.caption.bold())
                    .foregroundStyle(.green)
            }

            HStack(alignment: .top, spacing: 16) {
                MetricTile(label: "Total", value: "\(manifest.fileCount)")
                MetricTile(label: "Images", value: "\(manifest.imageCount)")
                MetricTile(label: "Video", value: "\(manifest.videoCount)")
                MetricTile(label: "Other", value: "\(manifest.otherCount)")
            }

            Text(manifest.safety.note)
                .font(.callout)
                .foregroundStyle(.secondary)

            Label(manifest.safety.contentHashesComputed ? "Full SHA-256 content hashes computed" : "Quick fingerprints only; full hashes are optional", systemImage: manifest.safety.contentHashesComputed ? "checkmark.seal.fill" : "number")
                .font(.caption.bold())
                .foregroundStyle(manifest.safety.contentHashesComputed ? .green : .secondary)

            if let savedManifestPath = manifest.savedManifestPath {
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text("Saved manifest")
                            .font(.headline)
                        Spacer()
                        Button("Show in Finder") {
                            showInFinder(savedManifestPath)
                        }
                    }
                    Text(savedManifestPath)
                        .font(.system(.caption, design: .monospaced))
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                }
            }

            if !manifest.extensionCounts.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("File types")
                        .font(.headline)
                    FlowLayout(items: manifest.extensionCounts.sorted { $0.key < $1.key }.map { "\($0.key): \($0.value)" })
                }
            }

            if !manifest.warnings.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(manifest.warnings, id: \.self) { warning in
                        Label(warning, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.orange)
                    }
                }
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("First files")
                    .font(.headline)

                ForEach(manifest.files.prefix(12)) { file in
                    HStack {
                        Image(systemName: file.kind == "image" ? "photo" : file.kind == "video" ? "film" : "doc")
                            .foregroundStyle(.secondary)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(file.relativePath)
                                .lineLimit(1)
                            Text("\(file.kind) · \(file.extension) · \(byteString(file.sizeBytes)) · \(file.contentSha256 ?? file.quickFingerprint)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                    }
                    .font(.caption)
                }
            }
        }
        .panelStyle()
    }

    private func savedManifestsPanel(_ manifests: [VisionDatasetManifestSummary]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Saved manifests")
                .font(.title2.bold())
            Text("These are local JSON manifests already written by Vision Lab. They are safe review artifacts, not copied research data.")
                .foregroundStyle(.secondary)

            ForEach(manifests.prefix(8)) { manifest in
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(manifest.datasetName)
                            .font(.headline)
                        Spacer()
                        Text("\(manifest.fileCount) files")
                            .font(.caption.bold())
                            .foregroundStyle(.secondary)
                    }

                    Text("\(manifest.imageCount) images · \(manifest.videoCount) videos · \(byteString(manifest.totalBytes))")
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    if let savedManifestPath = manifest.savedManifestPath {
                        HStack {
                            Text(savedManifestPath)
                                .font(.system(.caption2, design: .monospaced))
                                .foregroundStyle(.secondary)
                                .textSelection(.enabled)
                            Spacer()
                            Button("Reveal") {
                                showInFinder(savedManifestPath)
                            }
                            .font(.caption)
                        }
                    }
                }
                .padding(.vertical, 6)
            }
        }
        .panelStyle()
    }

    private func byteString(_ bytes: Int) -> String {
        let formatter = ByteCountFormatter()
        formatter.allowedUnits = [.useKB, .useMB, .useGB]
        formatter.countStyle = .file
        return formatter.string(fromByteCount: Int64(bytes))
    }

    private func showInFinder(_ path: String) {
        NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: path)])
    }

    private var reefBallDatasetURL: URL {
        URL(fileURLWithPath: reefBallDatasetPath, isDirectory: true)
    }

    private var reefBallDatasetExists: Bool {
        FileManager.default.fileExists(atPath: reefBallDatasetPath)
    }

    private func useReefBallDataset(buildManifest: Bool = false) {
        guard reefBallDatasetExists else { return }

        mediaAccess.addRoot(reefBallDatasetURL, label: "Chula Vista reef-ball dataset")
        appState.selectedDatasetPath = reefBallDatasetPath
        engine.registerVisionDataset(path: reefBallDatasetPath)

        if buildManifest {
            engine.buildVisionManifest(path: reefBallDatasetPath)
        }
    }

    private func openNestVisualResearchLab() {
        guard let url = nestVisualResearchLabURL else { return }
        NSWorkspace.shared.open(url)
    }

    private var hasConnectedNestProfile: Bool {
        !appState.activeNestSessionProfileEmail.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func readLocalNestPacket() {
        Task {
            await runNestPacketBridge(importToNest: false)
        }
    }

    private func importLocalNestPacket() {
        Task {
            await runNestPacketBridge(importToNest: true)
        }
    }

    private func checkNestPacket() {
        Task {
            await runNestPacketStatusCheck()
        }
    }

    @MainActor
    private func runNestPacketBridge(importToNest: Bool) async {
        if importToNest {
            isImportingNestPacket = true
            nestBridgeStatus = "Reading local packet before Nest import..."
        } else {
            isReadingNestPacket = true
            nestBridgeStatus = "Reading local packet..."
        }

        defer {
            isReadingNestPacket = false
            isImportingNestPacket = false
        }

        do {
            let packetData = try await readReefBallPacketData()
            let packet = try parseNestPacket(data: packetData)
            nestBridgeStats = packet.metrics

            if !importToNest {
                nestBridgeStatus = "Local packet ready: \(packet.generatedAt)."
                return
            }

            guard let importURL = nestVisualResearchPacketURL else {
                nestBridgeStatus = "Nest packet endpoint URL is invalid."
                return
            }

            guard await appState.refreshActiveNestSessionIfNeeded(), !NestSessionTokenStore.load().isEmpty else {
                nestBridgeStatus = "Open Nest Session and sign in before importing."
                return
            }

            let result = try await postReefBallPacket(data: packetData, to: importURL)
            nestBridgeStatus = "Imported to Nest as \(result)."
        } catch {
            nestBridgeStatus = error.localizedDescription
        }
    }

    @MainActor
    private func runNestPacketStatusCheck() async {
        isCheckingNestPacket = true
        nestBridgeStatus = "Checking the shared Nest packet..."

        defer {
            isCheckingNestPacket = false
        }

        do {
            guard let packetURL = nestVisualResearchPacketURL else {
                nestBridgeStatus = "Nest packet endpoint URL is invalid."
                return
            }

            guard await appState.refreshActiveNestSessionIfNeeded(), !NestSessionTokenStore.load().isEmpty else {
                nestBridgeStatus = "Open Nest Session and sign in before checking the Nest."
                return
            }

            let packet = try await getStoredReefBallPacket(from: packetURL)
            nestBridgeStats = packet.metrics
            nestBridgeStatus = "Nest packet ready: \(packet.generatedAt)."
        } catch {
            nestBridgeStatus = error.localizedDescription
        }
    }

    private func readReefBallPacketData() async throws -> Data {
        let (data, response) = try await URLSession.shared.data(from: reefBallPacketSummaryURL)
        let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200...299).contains(statusCode) else {
            throw NestPacketBridgeError.message("Local workbench returned \(statusCode). Start the reef-ball workbench first.")
        }
        return data
    }

    private func parseNestPacket(data: Data) throws -> NestPacketSnapshot {
        guard
            let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
            root["schema"] as? String == "quipsly.reefball.nest-packet.v1"
        else {
            throw NestPacketBridgeError.message("Local workbench did not return a reef-ball Nest packet.")
        }

        let summary = root["summary"] as? [String: Any] ?? [:]
        let generatedAt = root["generatedAt"] as? String ?? "unknown time"
        return NestPacketSnapshot(
            generatedAt: generatedAt,
            metrics: [
                NestBridgeMetric(label: "Images", value: bridgeNumber(summary["imageCount"])),
                NestBridgeMetric(label: "Tied", value: bridgeNumber(summary["imagesExplicitlyTied"])),
                NestBridgeMetric(label: "Rows", value: bridgeNumber(summary["workbookRowsExplicitlyTied"])),
                NestBridgeMetric(label: "Reviews", value: bridgeNumber(summary["rowReviewNeededCount"])),
            ]
        )
    }

    private func getStoredReefBallPacket(from url: URL) async throws -> NestPacketSnapshot {
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = 30
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(NestSessionTokenStore.load())", forHTTPHeaderField: "Authorization")

        let (data, response) = try await URLSession.shared.data(for: request)
        let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200...299).contains(statusCode) else {
            let message = bridgeErrorMessage(data: data) ?? "Nest returned \(statusCode) while checking the packet."
            throw NestPacketBridgeError.message(message)
        }

        guard
            let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
            root["ok"] as? Bool == true
        else {
            throw NestPacketBridgeError.message("Nest did not return a packet status response.")
        }

        guard let latest = root["latest"] as? [String: Any] else {
            throw NestPacketBridgeError.message("No reef-ball packet has been imported into this Nest yet.")
        }

        let summary = latest["summary"] as? [String: Any] ?? [:]
        let generatedAt = latest["generatedAt"] as? String
            ?? latest["capturedAt"] as? String
            ?? latest["updatedAt"] as? String
            ?? "unknown time"
        return NestPacketSnapshot(
            generatedAt: generatedAt,
            metrics: [
                NestBridgeMetric(label: "Images", value: bridgeNumber(summary["imageCount"])),
                NestBridgeMetric(label: "Tied", value: bridgeNumber(summary["imagesExplicitlyTied"])),
                NestBridgeMetric(label: "Rows", value: bridgeNumber(summary["workbookRowsExplicitlyTied"])),
                NestBridgeMetric(label: "Reviews", value: bridgeNumber(summary["rowReviewNeededCount"])),
            ]
        )
    }

    private func postReefBallPacket(data: Data, to url: URL) async throws -> String {
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 45
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(NestSessionTokenStore.load())", forHTTPHeaderField: "Authorization")
        request.httpBody = data

        let (responseData, response) = try await URLSession.shared.data(for: request)
        let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200...299).contains(statusCode) else {
            let message = bridgeErrorMessage(data: responseData) ?? "Nest returned \(statusCode) during packet import."
            throw NestPacketBridgeError.message(message)
        }

        guard
            let root = try JSONSerialization.jsonObject(with: responseData) as? [String: Any],
            root["ok"] as? Bool == true
        else {
            throw NestPacketBridgeError.message("Nest did not return a successful packet import response.")
        }

        let units = root["sourceUnits"] as? [String: Any]
        let latest = units?["latest"] as? [String: Any]
        return latest?["slug"] as? String ?? "latest reef-ball packet"
    }

    private func bridgeErrorMessage(data: Data) -> String? {
        guard
            let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let error = root["error"] as? String
        else {
            return nil
        }

        return error
    }

    private func bridgeNumber(_ value: Any?) -> String {
        if let number = value as? NSNumber {
            return number.intValue.formatted()
        }

        if let string = value as? String, let intValue = Int(string) {
            return intValue.formatted()
        }

        return "0"
    }

    private func openRequestedWorkbenchIfNeeded() {
        if appState.consumeVisionLabWorkbenchRequest() {
            showsEmbeddedWorkbench = true
        }
    }

    private var nestVisualResearchLabURL: URL? {
        let base = appState.nestURL.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        return URL(string: "\(base)/nests/marine-biology-research/visual-research")
    }

    private var nestVisualResearchPacketURL: URL? {
        let base = appState.nestURL.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        return URL(string: "\(base)/api/nests/marine-biology-research/visual-research/packet")
    }
}

private struct NestBridgeMetric: Identifiable {
    var id: String { label }
    var label: String
    var value: String
}

private struct NestPacketSnapshot {
    var generatedAt: String
    var metrics: [NestBridgeMetric]
}

private enum NestPacketBridgeError: LocalizedError {
    case message(String)

    var errorDescription: String? {
        switch self {
        case .message(let message):
            return message
        }
    }
}

private struct MetricTile: View {
    var label: String
    var value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label.uppercased())
                .font(.caption.bold())
                .foregroundStyle(.secondary)
            Text(value)
                .font(.system(size: 34, weight: .black, design: .rounded))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

private struct FlowLayout: View {
    var items: [String]

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 96), spacing: 8)], alignment: .leading, spacing: 8) {
            ForEach(items, id: \.self) { item in
                Text(item)
                    .font(.caption.bold())
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(.thinMaterial, in: Capsule())
            }
        }
    }
}
