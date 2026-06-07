import AppKit
import SwiftUI
import UniformTypeIdentifiers

struct VisionLabView: View {
    @EnvironmentObject private var appState: AppState
    @EnvironmentObject private var engine: LocalEngineClient
    @State private var isChoosingFolder = false

    var body: some View {
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
        .background(QuipslyBackground())
        .fileImporter(isPresented: $isChoosingFolder, allowedContentTypes: [.folder], allowsMultipleSelection: false) { result in
            switch result {
            case .success(let urls):
                appState.selectedDatasetPath = urls.first?.path ?? ""
                if !appState.selectedDatasetPath.isEmpty {
                    engine.registerVisionDataset(path: appState.selectedDatasetPath)
                }
            case .failure:
                appState.selectedDatasetPath = ""
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
