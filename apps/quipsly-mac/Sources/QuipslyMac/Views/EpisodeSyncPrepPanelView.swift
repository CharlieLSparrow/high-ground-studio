import AppKit
import SwiftUI

struct EpisodeSyncPrepPanelView: View {
    @EnvironmentObject private var appState: AppState
    @EnvironmentObject private var engine: LocalEngineClient

    @State private var offsetsByJobID: [String: Double] = [:]
    @State private var diagnosticsMessage: String?
    @State private var diagnosticsNeedsLogin = false
    @State private var isChoosingDiagnosticsPacket = false

    private var importJobs: [EpisodeImportJob] {
        engine.episodeImportJobs
    }

    private var spineAudioJob: EpisodeImportJob? {
        importJobs
            .filter { $0.role == .spineAudio }
            .sorted { lhs, rhs in
                if lhs.registration?.assetId != nil, rhs.registration?.assetId == nil { return true }
                if lhs.registration?.assetId == nil, rhs.registration?.assetId != nil { return false }
                return lhs.queuedAt > rhs.queuedAt
            }
            .first
    }

    private var targetVideoJobs: [EpisodeImportJob] {
        importJobs
            .filter { $0.role != .spineAudio }
            .filter { job in
                if job.probe?.hasVideo == true { return true }
                if job.role == .audioSource || job.role == .cameraVideo || job.role == .referenceClip || job.role == .bRoll || job.role == .youtubeSourceClip { return true }
                return videoExtensions.contains(URL(fileURLWithPath: job.path).pathExtension.lowercased())
            }
            .sorted { $0.queuedAt > $1.queuedAt }
    }

    private let videoExtensions: Set<String> = ["mov", "mp4", "m4v", "avi", "mkv", "webm", "insv"]

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            header
            syncCockpitStrip

            if importJobs.isEmpty {
                emptyState
            } else {
                spineSection
                targetsSection
                diagnosticsSection
            }
        }
        .padding(20)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(.quaternary, lineWidth: 1)
        )
    }

    private var header: some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: "waveform.path.ecg.rectangle")
                .font(.system(size: 26, weight: .semibold))
                .foregroundStyle(.blue)
                .frame(width: 42, height: 42)
                .background(.blue.opacity(0.12), in: RoundedRectangle(cornerRadius: 14, style: .continuous))

            VStack(alignment: .leading, spacing: 4) {
                Text("Episode sync prep")
                    .font(.title3.weight(.semibold))
                Text("Pick the spine audio, inspect target videos, then send a calm handoff into the Nest sync wizard.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            Text("\(targetVideoJobs.count) target\(targetVideoJobs.count == 1 ? "" : "s")")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(.thinMaterial, in: Capsule())
        }
    }

    private var syncCockpitStrip: some View {
        let registeredCount = importJobs.filter { $0.status == .registered }.count
        let heldCount = importJobs.filter { $0.status == .held || $0.status == .failed }.count
        let targetCount = targetVideoJobs.count
        let hasSpine = spineAudioJob != nil
        let nextAction: String
        if !hasSpine {
            nextAction = "Choose one clean audio file as the spine."
        } else if targetCount == 0 {
            nextAction = "Add camera video, b-roll, or reference clips."
        } else if heldCount > 0 {
            nextAction = "Recover held files or keep them visible for later."
        } else {
            nextAction = "Review offsets, then send a handoff to Nest."
        }

        return VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "slider.horizontal.below.rectangle")
                    .font(.title3)
                    .foregroundStyle(.teal)
                    .frame(width: 28)

                VStack(alignment: .leading, spacing: 4) {
                    Text("Sync cockpit")
                        .font(.headline)
                    Text(nextAction)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                Button {
                    appState.selectedSection = .premiereDraftEdit
                } label: {
                    Label("Review draft edit", systemImage: "rectangle.split.3x1")
                }
                .disabled(importJobs.isEmpty)
            }

            LazyVGrid(columns: [GridItem(.adaptive(minimum: 145), spacing: 10)], alignment: .leading, spacing: 10) {
                cockpitMetric(
                    label: "Spine",
                    value: hasSpine ? "Set" : "Needed",
                    tone: hasSpine ? .green : .orange,
                    detail: spineAudioJob?.displayName ?? "Sync anchor"
                )
                cockpitMetric(
                    label: "Targets",
                    value: "\(targetCount)",
                    tone: targetCount > 0 ? .blue : .secondary,
                    detail: "Videos/sources"
                )
                cockpitMetric(
                    label: "Registered",
                    value: "\(registeredCount)",
                    tone: registeredCount > 0 ? .green : .secondary,
                    detail: "Nest assets"
                )
                cockpitMetric(
                    label: "Held",
                    value: "\(heldCount)",
                    tone: heldCount > 0 ? .orange : .green,
                    detail: heldCount > 0 ? "Visible, not lost" : "No blockers"
                )
            }
        }
        .padding(14)
        .background(.teal.opacity(0.08), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func cockpitMetric(label: String, value: String, tone: Color, detail: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label.uppercased())
                .font(.caption2.bold())
                .foregroundStyle(.secondary)
            Text(value)
                .font(.title3.bold())
                .foregroundStyle(tone)
            Text(detail)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .truncationMode(.middle)
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("No imported episode media yet.")
                .font(.headline)
            Text("Import one audio file as the spine, then add camera video or reference clips. This panel will turn those imports into a sync-ready checklist.")
                .font(.callout)
                .foregroundStyle(.secondary)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private var spineSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Selected spine audio", systemImage: "waveform")
                .font(.headline)

            if let spineAudioJob {
                SpineAudioCard(job: spineAudioJob)
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    Text("No spine audio selected yet.")
                        .font(.subheadline.weight(.semibold))
                    Text("Use Import to Episode and mark one high-quality audio file as Spine audio. Everything else can sync against that stable recording.")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(.orange.opacity(0.10), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
        }
    }

    private var targetsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Label("Target videos", systemImage: "video")
                    .font(.headline)
                Spacer()
                if spineAudioJob == nil {
                    Text("Spine required before handoff")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.orange)
                }
            }

            if targetVideoJobs.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("No video targets queued yet.")
                        .font(.subheadline.weight(.semibold))
                    Text("Add camera video, b-roll, YouTube/source clips, or reference clips. They will appear here with duration, wall-clock hints, and offset controls.")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            } else {
                ForEach(targetVideoJobs) { target in
                    TargetVideoSyncCard(
                        target: target,
                        spine: spineAudioJob,
                        offset: Binding(
                            get: { offsetsByJobID[target.id, default: 0] },
                            set: { offsetsByJobID[target.id] = $0 }
                        ),
                        sendToNest: { sendToNestSyncWizard(target: target, spine: spineAudioJob) }
                    )
                }
            }
        }
    }

    private var diagnosticsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "doc.text.magnifyingglass")
                    .font(.title3)
                    .foregroundStyle(.indigo)
                    .frame(width: 32)

                VStack(alignment: .leading, spacing: 4) {
                    Text("Sync diagnostics packet")
                        .font(.headline)
                    Text("Export or send a compact JSON snapshot of this episode import/sync-prep state without changing timeline clips.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()
            }

            HStack {
                Button {
                    copyDiagnosticsPacket()
                } label: {
                    Label("Copy JSON", systemImage: "doc.on.doc")
                }

                Button {
                    saveDiagnosticsPacket()
                } label: {
                    Label("Save JSON", systemImage: "square.and.arrow.down")
                }

                Button {
                    isChoosingDiagnosticsPacket = true
                } label: {
                    Label("Import debug JSON", systemImage: "tray.and.arrow.down")
                }

                Spacer()

                Button {
                    sendDiagnosticsPacketToNest(makeDiagnosticsPacket())
                } label: {
                    Label("Send to Nest debug log", systemImage: "arrow.up.doc")
                }
                .buttonStyle(.borderedProminent)
            }

            if let diagnosticsMessage {
                Text(diagnosticsMessage)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            if diagnosticsNeedsLogin {
                HStack {
                    Button {
                        appState.selectedSection = .nestSession
                    } label: {
                        Label("Sign in to Nest session", systemImage: "person.crop.circle.badge.checkmark")
                    }

                    Button {
                        NestSessionActions.openEmbeddedEpisodeLogin(
                            appState: appState,
                            projectSlug: appState.editorProjectSlug,
                            episodeSlug: appState.editorEpisodeSlug
                        )
                    } label: {
                        Label("Open editor login", systemImage: "macwindow")
                    }
                }
            }
        }
        .padding(14)
        .background(.indigo.opacity(0.08), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .fileImporter(isPresented: $isChoosingDiagnosticsPacket, allowedContentTypes: [.json], allowsMultipleSelection: false) { result in
            importDiagnosticsPacket(result)
        }
    }

    private func sendToNestSyncWizard(target: EpisodeImportJob, spine: EpisodeImportJob?) {
        let base = URL(string: target.nestBaseURL.isEmpty ? appState.nestURL : target.nestBaseURL) ?? URL(string: "https://nest.quipsly.com")!
        var components = URLComponents(url: base, resolvingAgainstBaseURL: false) ?? URLComponents()
        components.scheme = components.scheme ?? "https"
        components.path = "/editor"
        components.queryItems = [
            URLQueryItem(name: "project", value: target.projectSlug),
            URLQueryItem(name: "episode", value: target.episodeSlug),
            URLQueryItem(name: "sync", value: "1"),
            URLQueryItem(name: "source", value: "mac-sync-prep"),
            URLQueryItem(name: "targetImportJobId", value: target.id),
            URLQueryItem(name: "targetAssetId", value: target.registration?.assetId),
            URLQueryItem(name: "spineImportJobId", value: spine?.id),
            URLQueryItem(name: "spineAssetId", value: spine?.registration?.assetId),
            URLQueryItem(name: "offsetSeconds", value: String(format: "%.3f", offsetsByJobID[target.id, default: 0]))
        ].filter { $0.value != nil }

        appState.editorProjectSlug = target.projectSlug
        appState.editorEpisodeSlug = target.episodeSlug
        appState.selectedSection = .episodeEditor

        if let url = components.url {
            NSWorkspace.shared.open(url)
        }
    }

    private func makeDiagnosticsPacket() -> EpisodeSyncDiagnosticsPacket {
        EpisodeSyncDiagnosticsPacket.build(
            projectSlug: appState.editorProjectSlug,
            episodeSlug: appState.editorEpisodeSlug,
            jobs: importJobs,
            offsetsByJobID: offsetsByJobID
        )
    }

    private func copyDiagnosticsPacket() {
        let json = makeDiagnosticsPacket().compactJSONString
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(json, forType: .string)
        diagnosticsMessage = "Copied compact sync diagnostics JSON."
    }

    private func saveDiagnosticsPacket() {
        let panel = NSSavePanel()
        panel.allowedContentTypes = [.json]
        panel.nameFieldStringValue = "\(appState.editorProjectSlug)-\(appState.editorEpisodeSlug)-sync-diagnostics.json"
        panel.canCreateDirectories = true

        guard panel.runModal() == .OK, let url = panel.url else { return }

        do {
            try makeDiagnosticsPacket().compactJSONString.write(to: url, atomically: true, encoding: .utf8)
            diagnosticsMessage = "Saved sync diagnostics to \(url.lastPathComponent)."
        } catch {
            diagnosticsMessage = "Could not save diagnostics: \(error.localizedDescription)"
        }
    }

    private func importDiagnosticsPacket(_ result: Result<[URL], Error>) {
        guard case .success(let urls) = result, let url = urls.first else {
            diagnosticsMessage = "No diagnostics packet selected."
            return
        }

        do {
            let data = try Data(contentsOf: url)
            let packet = try JSONDecoder().decode(EpisodeSyncDiagnosticsPacket.self, from: data)
            sendDiagnosticsPacketToNest(packet)
        } catch {
            diagnosticsMessage = "Could not import diagnostics JSON: \(error.localizedDescription)"
        }
    }

    private func sendDiagnosticsPacketToNest(_ packet: EpisodeSyncDiagnosticsPacket) {
        let base = URL(string: appState.nestURL) ?? URL(string: "https://nest.quipsly.com")!
        var components = URLComponents(url: base, resolvingAgainstBaseURL: false) ?? URLComponents()
        components.path = "/api/episode-production/sync-diagnostics"
        components.queryItems = nil

        guard let url = components.url else {
            diagnosticsMessage = "Could not build Nest diagnostics endpoint."
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        do {
            request.httpBody = try JSONEncoder().encode(["packet": packet])
        } catch {
            diagnosticsMessage = "Could not encode diagnostics packet: \(error.localizedDescription)"
            return
        }

        diagnosticsNeedsLogin = false
        diagnosticsMessage = "Sending diagnostics to Nest..."
        NestCookieBridge.addCookies(to: request) { authenticatedRequest in
            URLSession.shared.dataTask(with: authenticatedRequest) { data, response, error in
                DispatchQueue.main.async {
                    if let error {
                        diagnosticsMessage = "Nest diagnostics import failed safely: \(error.localizedDescription)"
                        return
                    }

                    let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
                    guard (200...299).contains(statusCode) else {
                        let body = data.map { String(decoding: $0, as: UTF8.self) } ?? ""
                        diagnosticsNeedsLogin = statusCode == 401 || NestSessionActions.isAuthIssue(code: nil, message: body)
                        diagnosticsMessage = diagnosticsNeedsLogin
                            ? "Nest needs you to sign in inside Quipsly Mac before saving sync diagnostics. Open the embedded editor login, then retry."
                            : "Nest diagnostics returned \(statusCode). \(body)"
                        return
                    }

                    diagnosticsNeedsLogin = false
                    diagnosticsMessage = "Sent diagnostics to Nest debug log."
                }
            }.resume()
        }
    }
}

private struct SpineAudioCard: View {
    let job: EpisodeImportJob

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: job.registration?.spineAudioSet == true ? "checkmark.seal.fill" : "waveform.circle")
                    .foregroundStyle(job.registration?.spineAudioSet == true ? .green : .blue)
                    .font(.title3)

                VStack(alignment: .leading, spacing: 4) {
                    Text(job.displayName)
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)
                    Text("\(formatDuration(job.durationSeconds)) · \(job.status.rawValue.capitalized)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                if let assetID = job.registration?.assetId {
                    Text("Asset \(assetID)")
                        .font(.caption2.monospaced())
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                } else {
                    Text("Not registered yet")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.orange)
                }
            }

            WaveformPlaceholder(tint: .blue)

            Text(job.registration?.spineAudioSet == true ? "This audio is saved as the episode spine in Nest." : "Queued as spine audio. It will become the sync anchor after registration succeeds.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.blue.opacity(0.08), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

private struct TargetVideoSyncCard: View {
    let target: EpisodeImportJob
    let spine: EpisodeImportJob?
    @Binding var offset: Double
    let sendToNest: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: iconName)
                    .font(.title3)
                    .foregroundStyle(statusTint)
                    .frame(width: 30)

                VStack(alignment: .leading, spacing: 4) {
                    Text(target.displayName)
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)
                    Text(metadataLine)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }

                Spacer()

                Text(statusLabel)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(statusTint)
                    .padding(.horizontal, 9)
                    .padding(.vertical, 5)
                    .background(statusTint.opacity(0.12), in: Capsule())
            }

            WaveformPlaceholder(tint: statusTint)

            LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), alignment: .leading)], alignment: .leading, spacing: 10) {
                Metric(label: "Duration", value: formatDuration(target.durationSeconds))
                Metric(label: "Current offset", value: formatSignedSeconds(offset))
                Metric(label: "Start wall-clock", value: wallClockStart)
                Metric(label: "End wall-clock", value: wallClockEnd)
                Metric(label: "Device", value: target.recordingSyncMetadata?.deviceLabel ?? "Unknown")
                Metric(label: "Take order", value: target.recordingSyncMetadata?.takeOrder.map(String.init) ?? "Unknown")
            }

            if let notes = target.recordingSyncMetadata?.sourceDeviceClockNotes, !notes.isEmpty {
                Text("Device clock note: \(notes)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 7)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(.orange.opacity(0.09), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            }

            HStack(spacing: 8) {
                OffsetButton(label: "-10s") { offset -= 10 }
                OffsetButton(label: "-1s") { offset -= 1 }
                OffsetButton(label: "-0.1s") { offset -= 0.1 }
                OffsetButton(label: "+0.1s") { offset += 0.1 }
                OffsetButton(label: "+1s") { offset += 1 }
                OffsetButton(label: "+10s") { offset += 10 }
                Spacer()
                Button {
                    sendToNest()
                } label: {
                    Label("Send to Nest sync wizard", systemImage: "arrow.up.forward.app")
                }
                .buttonStyle(.borderedProminent)
                .disabled(spine == nil)
                .help(spine == nil ? "Choose a spine audio import first." : "Open Nest with this spine, target, and offset preselected.")
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private var iconName: String {
        target.registration?.assetId == nil ? "video.badge.exclamationmark" : "video.fill"
    }

    private var statusTint: Color {
        if target.registration?.assetId == nil { return .orange }
        return .green
    }

    private var statusLabel: String {
        target.registration?.assetId == nil ? "Needs registration" : "Ready to sync"
    }

    private var metadataLine: String {
        let video = target.probe?.hasVideo == true ? "video" : "video target"
        let audio = target.probe?.hasAudio == true ? " + audio" : ""
        return "\(roleLabel(target.role)) · \(video)\(audio) · \(target.status.rawValue.capitalized)"
    }

    private var wallClockStart: String {
        if let formatted = formatSyncDate(target.recordingSyncMetadata?.recordedStartAt) {
            return formatted
        }

        guard let date = sourceWallClockDate(for: target) else { return "Unknown" }
        return DateFormatter.episodeSyncWallClock.string(from: date)
    }

    private var wallClockEnd: String {
        if let formatted = formatSyncDate(target.recordingSyncMetadata?.recordedEndAt) {
            return formatted
        }

        guard
            let start = sourceWallClockDate(for: target),
            let duration = target.durationSeconds,
            duration > 0
        else { return "Unknown" }
        return DateFormatter.episodeSyncWallClock.string(from: start.addingTimeInterval(duration))
    }
}

private struct WaveformPlaceholder: View {
    let tint: Color

    private let bars: [Double] = [0.25, 0.55, 0.35, 0.85, 0.45, 0.72, 0.28, 0.64, 0.38, 0.78, 0.50, 0.30, 0.67, 0.42, 0.88, 0.34, 0.60, 0.26]

    var body: some View {
        HStack(alignment: .center, spacing: 3) {
            ForEach(Array(bars.enumerated()), id: \.offset) { _, value in
                RoundedRectangle(cornerRadius: 2, style: .continuous)
                    .fill(tint.opacity(0.45))
                    .frame(width: 5, height: 32 * value + 6)
            }
            Spacer(minLength: 0)
            Text("waveform pending")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.secondary)
                .textCase(.uppercase)
                .tracking(0.8)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(tint.opacity(0.07), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

private struct Metric: View {
    let label: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.secondary)
                .textCase(.uppercase)
                .tracking(0.7)
            Text(value)
                .font(.caption.monospacedDigit())
                .foregroundStyle(.primary)
        }
    }
}

private struct OffsetButton: View {
    let label: String
    let action: () -> Void

    var body: some View {
        Button(label, action: action)
            .font(.caption.monospacedDigit())
            .buttonStyle(.bordered)
            .controlSize(.small)
    }
}

private func roleLabel(_ role: EpisodeImportRole) -> String {
    switch role {
    case .spineAudio:
        return "Spine audio"
    case .audioSource:
        return "Audio source"
    case .cameraVideo:
        return "Camera video"
    case .referenceClip:
        return "Reference clip"
    case .bRoll:
        return "B-roll"
    case .youtubeSourceClip:
        return "YouTube/source"
    }
}

private func sourceWallClockDate(for job: EpisodeImportJob) -> Date? {
    let url = URL(fileURLWithPath: job.path)
    guard let attributes = try? FileManager.default.attributesOfItem(atPath: url.path) else {
        return nil
    }

    return attributes[.creationDate] as? Date ?? attributes[.modificationDate] as? Date
}

private func formatSyncDate(_ value: String?) -> String? {
    guard let value, !value.isEmpty else { return nil }
    let formatter = ISO8601DateFormatter()
    guard let date = formatter.date(from: value) else { return value }
    return DateFormatter.episodeSyncWallClock.string(from: date)
}

private func formatDuration(_ seconds: Double?) -> String {
    guard let seconds, seconds.isFinite, seconds >= 0 else { return "Unknown" }
    let total = Int(seconds.rounded())
    let hours = total / 3600
    let minutes = (total % 3600) / 60
    let secs = total % 60

    if hours > 0 {
        return String(format: "%d:%02d:%02d", hours, minutes, secs)
    }

    return String(format: "%d:%02d", minutes, secs)
}

private func formatSignedSeconds(_ seconds: Double) -> String {
    let sign = seconds >= 0 ? "+" : "-"
    return "\(sign)\(String(format: "%.1f", abs(seconds)))s"
}

private extension EpisodeImportJob {
    var durationSeconds: Double? {
        probe?.durationSeconds ?? proxy?.durationSeconds
    }
}

private extension DateFormatter {
    static let episodeSyncWallClock: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .medium
        return formatter
    }()
}
