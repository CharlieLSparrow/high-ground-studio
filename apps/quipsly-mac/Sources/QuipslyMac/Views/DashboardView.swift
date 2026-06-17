import AppKit
import SwiftUI

struct DashboardView: View {
    @EnvironmentObject private var engine: LocalEngineClient
    @EnvironmentObject private var appState: AppState

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                HeroPanel(
                    title: "Quipsly Mac",
                    eyebrow: "Native local cockpit",
                    description: "A Mac-first control room for files, video, proxies, local AI jobs, and research workflows that should not depend on browser sandcastles."
                )

                LazyVGrid(columns: [GridItem(.adaptive(minimum: 220), spacing: 16)], spacing: 16) {
                    CapabilityCard(title: "Media editing", enabled: engine.capabilities.mediaEditing, detail: "Timeline, proxies, render prep")
                    CapabilityCard(title: "Local ingest", enabled: engine.capabilities.localIngest, detail: "SD cards, watched folders, camera dumps")
                    CapabilityCard(title: "Cloud sync", enabled: engine.capabilities.cloudSync, detail: "Vault push and verification")
                    CapabilityCard(title: "Safe offload", enabled: engine.capabilities.safeOffload, detail: "Checksum-first delete confidence")
                    CapabilityCard(title: "AI logging", enabled: engine.capabilities.aiLogging, detail: "Gemini-assisted file triage")
                    CapabilityCard(title: "Vision Lab", enabled: engine.capabilities.visionLab, detail: "Research image identification")
                    CapabilityCard(title: "ML training", enabled: engine.capabilities.mlTraining, detail: "Local model jobs, gated")
                    CapabilityCard(title: "Marine biology", enabled: engine.capabilities.marineBiologyWorkflow, detail: "Species and individual ID workflow")
                }

                SmokeReportPanel()

                VStack(alignment: .leading, spacing: 12) {
                    Text("Local-first product split")
                        .font(.title2.bold())
                    Text("Nest owns collaboration, permissions, publishing, and project memory. The Mac app owns local files, media horsepower, proxies, training jobs, and anything that benefits from native OS access.")
                        .foregroundStyle(.secondary)
                }
                .panelStyle()
            }
            .padding(28)
        }
        .background(QuipslyBackground())
    }
}

private struct SmokeReportPanel: View {
    @State private var status = "Latest report is the fastest way to prove what the Mac app actually did."
    @State private var reportSummary = SmokeReportSummary.empty

    private var reportRoot: URL {
        FileManager.default
            .homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Application Support/QuipslyMac/smoke/episode-local-suite", isDirectory: true)
    }

    private var latestReportURL: URL {
        reportRoot.appendingPathComponent("latest", isDirectory: true)
    }

    private var suiteLogURL: URL {
        latestReportURL.appendingPathComponent("suite.log")
    }

    private var latestReportExists: Bool {
        var isDirectory: ObjCBool = false
        return FileManager.default.fileExists(atPath: latestReportURL.path, isDirectory: &isDirectory) && isDirectory.boolValue
    }

    private var latestLogExists: Bool {
        FileManager.default.fileExists(atPath: suiteLogURL.path)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 14) {
                Image(systemName: "checkmark.seal.fill")
                    .font(.title)
                    .foregroundStyle(latestReportExists ? .green : .secondary)

                VStack(alignment: .leading, spacing: 6) {
                    Text("Proof trail")
                        .font(.title2.bold())
                    Text(latestReportExists ? "The latest Mac smoke run left screenshots, JSON results, and the full suite transcript here." : "No local smoke report is available yet. Run the Episode Editor suite to create one.")
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(status)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }

                Spacer()
            }

            HStack(spacing: 12) {
                SmokeSummaryPill(
                    title: "Last suite",
                    value: reportSummary.stateLabel,
                    color: reportSummary.stateColor
                )
                SmokeSummaryPill(
                    title: "Screenshots",
                    value: "\(reportSummary.episodeScreenshotCount)",
                    color: reportSummary.episodeScreenshotCount >= 3 ? .green : .orange
                )
                SmokeSummaryPill(
                    title: "Result files",
                    value: "\(reportSummary.resultFileCount)",
                    color: reportSummary.resultFileCount > 0 ? .green : .secondary
                )
                SmokeSummaryPill(
                    title: "Updated",
                    value: reportSummary.updatedLabel,
                    color: .quipslyClayTeal
                )
            }

            Text(reportSummary.lastLogLine)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(2)
                .frame(maxWidth: .infinity, alignment: .leading)

            HStack(spacing: 10) {
                Button {
                    openLatestReport()
                } label: {
                    Label("Open latest report", systemImage: "folder")
                }
                .disabled(!latestReportExists)
                .accessibilityLabel("Open latest report")
                .accessibilityIdentifier("dashboard-open-latest-smoke-report")

                Button {
                    openSuiteLog()
                } label: {
                    Label("Open suite log", systemImage: "doc.text.magnifyingglass")
                }
                .disabled(!latestLogExists)
                .accessibilityLabel("Open suite log")
                .accessibilityIdentifier("dashboard-open-latest-suite-log")

                Button {
                    copyReportPath()
                } label: {
                    Label("Copy path", systemImage: "doc.on.doc")
                }
                .disabled(!latestReportExists)
                .accessibilityLabel("Copy report path")
                .accessibilityIdentifier("dashboard-copy-latest-smoke-report-path")
            }
            .buttonStyle(.borderedProminent)
        }
        .panelStyle()
        .onAppear {
            refreshSummary()
            runSmokeIfRequested()
        }
    }

    private func openLatestReport() {
        refreshSummary()
        guard latestReportExists else {
            status = "No report folder exists yet."
            return
        }
        NSWorkspace.shared.open(latestReportURL)
        status = "Opened latest smoke report in Finder."
    }

    private func openSuiteLog() {
        refreshSummary()
        guard latestLogExists else {
            status = "No suite.log exists yet."
            return
        }
        NSWorkspace.shared.open(suiteLogURL)
        status = "Opened the latest suite transcript."
    }

    private func copyReportPath() {
        refreshSummary()
        guard latestReportExists else {
            status = "No report path to copy yet."
            return
        }
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(latestReportURL.path, forType: .string)
        status = "Copied latest smoke report path."
    }

    private func refreshSummary() {
        reportSummary = SmokeReportSummary.load(reportURL: latestReportURL, suiteLogURL: suiteLogURL)
    }

    private func runSmokeIfRequested() {
        refreshSummary()
        let defaults = UserDefaults.standard
        let requestID = defaults.string(forKey: "quipslyMac.smokeDashboardProofTrailRequestId")?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let resultPath = defaults.string(forKey: "quipslyMac.smokeDashboardProofTrailResultPath")?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !requestID.isEmpty, !resultPath.isEmpty else { return }

        defaults.removeObject(forKey: "quipslyMac.smokeDashboardProofTrailRequestId")
        copyReportPath()

        let payload: [String: Any] = [
            "requestId": requestID,
            "view": "DashboardView",
            "proofTrailPanel": "visible",
            "latestReportExists": latestReportExists,
            "latestLogExists": latestLogExists,
            "latestReportPath": latestReportURL.path,
            "suiteLogPath": suiteLogURL.path,
            "copiedPasteboardPath": NSPasteboard.general.string(forType: .string) ?? "",
            "suiteStatus": reportSummary.stateLabel,
            "episodeScreenshotCount": reportSummary.episodeScreenshotCount,
            "resultFileCount": reportSummary.resultFileCount,
            "lastLogLine": reportSummary.lastLogLine,
            "buttonLabels": [
                "Open latest report",
                "Open suite log",
                "Copy path"
            ],
            "wroteAt": ISO8601DateFormatter().string(from: Date())
        ]

        do {
            let file = URL(fileURLWithPath: resultPath)
            try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
            let data = try JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted, .sortedKeys])
            try data.write(to: file, options: [.atomic])
            status = "Dashboard proof smoke wrote its result."
        } catch {
            status = "Dashboard proof smoke could not write result: \(error.localizedDescription)"
        }
    }
}

private struct SmokeSummaryPill: View {
    var title: String
    var value: String
    var color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.caption2.bold())
                .foregroundStyle(.secondary)
            Text(value)
                .font(.headline)
                .foregroundStyle(color)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

private struct SmokeReportSummary {
    enum State {
        case missing
        case passed
        case failed
        case incomplete
    }

    var state: State
    var episodeScreenshotCount: Int
    var resultFileCount: Int
    var lastLogLine: String
    var updatedAt: Date?

    static let empty = SmokeReportSummary(
        state: .missing,
        episodeScreenshotCount: 0,
        resultFileCount: 0,
        lastLogLine: "No suite report has been written yet.",
        updatedAt: nil
    )

    var stateLabel: String {
        switch state {
        case .missing: "Missing"
        case .passed: "Passed"
        case .failed: "Failed"
        case .incomplete: "Incomplete"
        }
    }

    var stateColor: Color {
        switch state {
        case .missing: .secondary
        case .passed: .green
        case .failed: .red
        case .incomplete: .orange
        }
    }

    var updatedLabel: String {
        guard let updatedAt else { return "Never" }
        return updatedAt.formatted(date: .omitted, time: .shortened)
    }

    static func load(reportURL: URL, suiteLogURL: URL) -> SmokeReportSummary {
        let fileManager = FileManager.default
        let resolvedReportURL = reportURL.resolvingSymlinksInPath()
        let resolvedSuiteLogURL = suiteLogURL.resolvingSymlinksInPath()
        var isDirectory: ObjCBool = false
        guard fileManager.fileExists(atPath: reportURL.path, isDirectory: &isDirectory), isDirectory.boolValue else {
            return .empty
        }

        let files = (try? fileManager.contentsOfDirectory(at: resolvedReportURL, includingPropertiesForKeys: [.contentModificationDateKey], options: [])) ?? []
        let screenshots = files.filter { url in
            url.pathExtension.lowercased() == "png" && url.lastPathComponent.hasPrefix("episode-editor-")
        }
        let results = files.filter { url in
            url.pathExtension.lowercased() == "json"
        }

        let logText = (try? String(contentsOf: resolvedSuiteLogURL, encoding: .utf8)) ?? ""
        let logLines = logText
            .components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        let lastLine = logLines.reversed().first { line in
            line.contains("PASS:") || line.contains("FAIL:")
        } ?? logLines.last ?? "suite.log is missing or empty."

        let state: State
        if !fileManager.fileExists(atPath: suiteLogURL.path) {
            state = .incomplete
        } else if logText.contains("FAIL:") {
            state = .failed
        } else if logText.contains("PASS: Quipsly Mac local Episode Editor suite completed.") {
            state = .passed
        } else {
            state = .incomplete
        }

        let newestDate = files.compactMap { url in
            try? url.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate
        }.max()

        return SmokeReportSummary(
            state: state,
            episodeScreenshotCount: screenshots.count,
            resultFileCount: results.count,
            lastLogLine: lastLine,
            updatedAt: newestDate
        )
    }
}

struct HeroPanel: View {
    var title: String
    var eyebrow: String
    var description: String

    var bodyView: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(eyebrow.uppercased())
                .font(.caption.bold())
                .foregroundStyle(.quipslyClayTeal)
                .tracking(1.2)
            Text(title)
                .font(.system(size: 44, weight: .black, design: .rounded))
            Text(description)
                .font(.title3)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(28)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay(alignment: .topTrailing) {
            Image(systemName: "sparkles.rectangle.stack.fill")
                .font(.system(size: 72))
                .foregroundStyle(.quipslyClayTeal.opacity(0.28))
                .padding(28)
        }
    }

    var body: some View {
        bodyView
    }
}

struct CapabilityCard: View {
    var title: String
    var enabled: Bool
    var detail: String

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Circle()
                    .fill(enabled ? .green : .secondary.opacity(0.35))
                    .frame(width: 10, height: 10)
                Text(enabled ? "Available" : "Off")
                    .font(.caption.bold())
                    .foregroundStyle(enabled ? .green : .secondary)
            }
            Text(title)
                .font(.headline)
            Text(detail)
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}


