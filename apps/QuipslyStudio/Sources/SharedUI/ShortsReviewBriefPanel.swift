import Foundation
import SwiftUI

struct ShortsReviewBriefPanel: View {
    let activeSessionName: String
    var onCopyText: (String, String) -> Void

    @State private var snapshot = ShortsReviewBriefSnapshot.loading

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            header
            content
            commandRow
        }
        .padding(10)
        .background(
            LinearGradient(
                colors: [
                    QuipslyStudioTheme.honey.opacity(0.14),
                    QuipslyStudioTheme.panelLift.opacity(0.30),
                    QuipslyStudioTheme.night.opacity(0.22)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            ),
            in: RoundedRectangle(cornerRadius: 16, style: .continuous)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(QuipslyStudioTheme.honey.opacity(0.22), lineWidth: 1)
        )
        .task(id: activeSessionName) {
            await refreshBrief()
        }
        .accessibilityIdentifier("quipsly.workbench.shorts.reviewBrief")
    }

    private var header: some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: snapshot.iconName)
                .font(.caption)
                .foregroundStyle(snapshot.tint)
                .frame(width: 18)

            VStack(alignment: .leading, spacing: 2) {
                Text("Current short brief")
                    .font(.caption)
                    .fontWeight(.black)
                Text("One calm readback for what this short is, what is missing, and what to do next. It reads app state only.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: 8)

            Text(snapshot.badgeText)
                .font(.caption2)
                .fontWeight(.black)
                .tracking(0.7)
                .foregroundStyle(snapshot.tint)
                .padding(.horizontal, 7)
                .padding(.vertical, 3)
                .background(snapshot.tint.opacity(0.13), in: Capsule())
        }
    }

    @ViewBuilder
    private var content: some View {
        switch snapshot.state {
        case .loading:
            Text("Reading selected-short quality from the running editor...")
                .font(.caption2)
                .foregroundStyle(.secondary)
        case .failed(let message):
            VStack(alignment: .leading, spacing: 7) {
                Text("Brief unavailable")
                    .font(.caption)
                    .fontWeight(.black)
                Text(message)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                Text("Run `script/agentctl.sh shorts-review-brief --markdown` if you need a terminal readback.")
                    .font(.caption2.monospaced())
                    .foregroundStyle(QuipslyStudioTheme.moonMilk.opacity(0.75))
                    .textSelection(.enabled)
            }
        case .ready:
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .top, spacing: 8) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(snapshot.title.isEmpty ? "No selected short" : snapshot.title)
                            .font(.caption)
                            .fontWeight(.black)
                            .lineLimit(2)
                        Text(snapshot.subtitle)
                            .font(.caption2.monospacedDigit())
                            .foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 8)
                    reviewStatusPill(snapshot.reviewClassLabel.isEmpty ? snapshot.reviewStatus : snapshot.reviewClassLabel)
                }

                briefLine(
                    icon: "arrow.right.circle.fill",
                    title: "Next review",
                    value: snapshot.nextReviewAction.isEmpty ? snapshot.nextSafeAction : snapshot.nextReviewAction,
                    color: QuipslyStudioTheme.honey
                )

                if !snapshot.blockers.isEmpty {
                    VStack(alignment: .leading, spacing: 5) {
                        Text("Before platform handoff")
                            .font(.caption2)
                            .fontWeight(.black)
                            .tracking(0.6)
                            .foregroundStyle(.secondary)
                        ForEach(snapshot.blockers.prefix(3)) { blocker in
                            briefLine(
                                icon: "exclamationmark.triangle.fill",
                                title: blocker.label,
                                value: blocker.nextAction,
                                color: QuipslyStudioTheme.clay
                            )
                        }
                    }
                }

                Text(snapshot.truth)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var commandRow: some View {
        HStack(spacing: 6) {
            Button {
                Task { await refreshBrief() }
            } label: {
                Label("Refresh", systemImage: "arrow.clockwise")
                    .frame(maxWidth: .infinity)
            }

            Button {
                onCopyText("script/agentctl.sh shorts-review-brief --markdown", "Copied selected-short brief command")
            } label: {
                Label("Copy brief", systemImage: "doc.on.doc")
                    .frame(maxWidth: .infinity)
            }

            Button {
                onCopyText("script/agentctl.sh selected-short-platform-packet --all", "Copied platform packet command")
            } label: {
                Label("Platform packet", systemImage: "paperplane")
                    .frame(maxWidth: .infinity)
            }
        }
        .buttonStyle(.bordered)
        .controlSize(.small)
    }

    private func briefLine(icon: String, title: String, value: String, color: Color) -> some View {
        HStack(alignment: .top, spacing: 6) {
            Image(systemName: icon)
                .font(.caption2)
                .foregroundStyle(color)
            VStack(alignment: .leading, spacing: 1) {
                Text(title)
                    .font(.caption2)
                    .fontWeight(.black)
                    .foregroundStyle(color)
                Text(value.isEmpty ? "No note recorded yet." : value)
                    .font(.caption2)
                    .foregroundStyle(QuipslyStudioTheme.moonMilk.opacity(0.78))
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .background(color.opacity(0.10), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private func reviewStatusPill(_ value: String) -> some View {
        Text(value.isEmpty ? "REVIEW" : value.uppercased())
            .font(.caption2)
            .fontWeight(.black)
            .lineLimit(1)
            .foregroundStyle(QuipslyStudioTheme.creek)
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .background(QuipslyStudioTheme.creek.opacity(0.13), in: Capsule())
    }

    private func refreshBrief() async {
        guard let url = URL(string: "http://127.0.0.1:8080/selected_short_quality") else {
            snapshot = .failed("The local selected-short endpoint URL could not be built.")
            return
        }

        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
            await MainActor.run {
                snapshot = ShortsReviewBriefSnapshot(json: json ?? [:])
            }
        } catch {
            await MainActor.run {
                snapshot = .failed(error.localizedDescription)
            }
        }
    }
}

private struct ShortsReviewBriefSnapshot {
    enum LoadState {
        case loading
        case ready
        case failed(String)
    }

    let state: LoadState
    let title: String
    let durationSeconds: Double
    let reviewStatus: String
    let exportStatus: String
    let reviewClassLabel: String
    let nextSafeAction: String
    let nextReviewAction: String
    let blockers: [ShortsReviewBriefBlocker]
    let truth: String

    static let loading = ShortsReviewBriefSnapshot(
        state: .loading,
        title: "",
        durationSeconds: 0,
        reviewStatus: "",
        exportStatus: "",
        reviewClassLabel: "",
        nextSafeAction: "",
        nextReviewAction: "",
        blockers: [],
        truth: "Reading selected-short state only."
    )

    static func failed(_ message: String) -> ShortsReviewBriefSnapshot {
        ShortsReviewBriefSnapshot(
            state: .failed(message),
            title: "",
            durationSeconds: 0,
            reviewStatus: "",
            exportStatus: "",
            reviewClassLabel: "",
            nextSafeAction: "",
            nextReviewAction: "",
            blockers: [],
            truth: "No edit, export, approval, publication, or media mutation was attempted."
        )
    }

    init(json: [String: Any]) {
        let checklist = json["reviewChecklist"] as? [[String: Any]] ?? []
        let blockers = checklist.compactMap(ShortsReviewBriefBlocker.init(json:))

        self.init(
            state: .ready,
            title: Self.string(json["title"]),
            durationSeconds: Self.double(json["recipeDuration"]),
            reviewStatus: Self.string(json["reviewStatus"]),
            exportStatus: Self.string(json["exportStatus"]),
            reviewClassLabel: Self.string(json["reviewClassLabel"]),
            nextSafeAction: Self.string(json["nextSafeAction"]),
            nextReviewAction: Self.string(json["nextReviewAction"]),
            blockers: blockers,
            truth: Self.string(json["truth"], fallback: "Selected-short quality readback. No media or publication state was changed.")
        )
    }

    private init(
        state: LoadState,
        title: String,
        durationSeconds: Double,
        reviewStatus: String,
        exportStatus: String,
        reviewClassLabel: String,
        nextSafeAction: String,
        nextReviewAction: String,
        blockers: [ShortsReviewBriefBlocker],
        truth: String
    ) {
        self.state = state
        self.title = title
        self.durationSeconds = durationSeconds
        self.reviewStatus = reviewStatus
        self.exportStatus = exportStatus
        self.reviewClassLabel = reviewClassLabel
        self.nextSafeAction = nextSafeAction
        self.nextReviewAction = nextReviewAction
        self.blockers = blockers
        self.truth = truth
    }

    var iconName: String {
        switch state {
        case .loading:
            return "hourglass"
        case .ready:
            return blockers.isEmpty ? "checkmark.seal.fill" : "list.bullet.clipboard.fill"
        case .failed:
            return "exclamationmark.triangle.fill"
        }
    }

    var tint: Color {
        switch state {
        case .loading:
            return QuipslyStudioTheme.sage
        case .ready:
            return blockers.isEmpty ? QuipslyStudioTheme.creek : QuipslyStudioTheme.honey
        case .failed:
            return QuipslyStudioTheme.clay
        }
    }

    var badgeText: String {
        switch state {
        case .loading:
            return "READING"
        case .ready:
            return blockers.isEmpty ? "CLEAR" : "\(blockers.count) NEXT"
        case .failed:
            return "CHECK"
        }
    }

    var subtitle: String {
        let duration = durationSeconds > 0 ? String(format: "%.1fs", durationSeconds) : "unknown duration"
        let review = reviewStatus.isEmpty ? "review unknown" : reviewStatus.replacingOccurrences(of: "-", with: " ")
        let export = exportStatus.isEmpty ? "export unknown" : exportStatus.replacingOccurrences(of: "-", with: " ")
        return "\(duration) · \(review) · \(export)"
    }

    private static func string(_ value: Any?, fallback: String = "") -> String {
        if let value = value as? String { return value }
        if let value { return "\(value)" }
        return fallback
    }

    private static func double(_ value: Any?) -> Double {
        if let value = value as? Double { return value }
        if let value = value as? Int { return Double(value) }
        if let value = value as? String, let parsed = Double(value) { return parsed }
        return 0
    }
}

private struct ShortsReviewBriefBlocker: Identifiable {
    let id: String
    let label: String
    let status: String
    let nextAction: String

    init?(json: [String: Any]) {
        let status = Self.string(json["status"]).lowercased()
        let isBlocker = ["needs_work", "needs_metadata", "missing", "not_proven", "unknown", "review_long"].contains(status)
        guard isBlocker else { return nil }

        self.id = Self.string(json["id"], fallback: UUID().uuidString)
        self.label = Self.string(json["label"], fallback: id)
        self.status = status
        self.nextAction = Self.string(json["nextAction"], fallback: "Review before platform handoff.")
    }

    private static func string(_ value: Any?, fallback: String = "") -> String {
        if let value = value as? String { return value }
        if let value { return "\(value)" }
        return fallback
    }
}
