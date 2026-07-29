import Foundation
import SwiftUI

struct ShortsRecipeRepairProofPanel: View {
    let activeSessionName: String
    var onSeek: (Double) -> Void
    var onOpenPath: (String, String) -> Void
    var onCopyText: (String, String) -> Void

    @State private var snapshot = ShortsRecipeRepairProofSnapshot.load()

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            header
            content
        }
        .padding(10)
        .background(
            LinearGradient(
                colors: [
                    QuipslyStudioTheme.honey.opacity(0.13),
                    QuipslyStudioTheme.panelLift.opacity(0.32),
                    QuipslyStudioTheme.night.opacity(0.24)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            ),
            in: RoundedRectangle(cornerRadius: 16, style: .continuous)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(snapshot.tint.opacity(0.20), lineWidth: 1)
        )
        .task(id: activeSessionName) {
            snapshot = ShortsRecipeRepairProofSnapshot.load()
        }
        .help("Reads \(ShortsRecipeRepairProofSnapshot.markdownPath). Seeking only moves the shared Studio playhead.")
        .accessibilityIdentifier("quipsly.workbench.shorts.recipeRepairProof")
    }

    private var header: some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: snapshot.isLoaded ? "scope" : "tray")
                .font(.caption)
                .foregroundStyle(snapshot.tint)
                .frame(width: 18)

            VStack(alignment: .leading, spacing: 2) {
                Text("Proof-watch repair")
                    .font(.caption)
                    .fontWeight(.black)
                Text("Compare the current short recipe against the transcript-backed candidate in the same monitor wall before changing metadata.")
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
        if snapshot.isLoaded {
            VStack(alignment: .leading, spacing: 10) {
                titleBlock
                rangeComparison
                storyPreview
                watchPlan
                actionRow
            }
        } else {
            missingPacketCard
        }
    }

    private var titleBlock: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack(alignment: .top, spacing: 8) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(snapshot.title.isEmpty ? "Short repair candidate" : snapshot.title)
                        .font(.caption)
                        .fontWeight(.black)
                        .lineLimit(2)
                    Text(snapshot.sequence.isEmpty ? "Episode repair packet" : snapshot.sequence)
                        .font(.caption2.monospacedDigit())
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                Spacer(minLength: 6)
                Text(snapshot.statusLabel)
                    .font(.caption2)
                    .fontWeight(.black)
                    .foregroundStyle(snapshot.tint)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 3)
                    .background(snapshot.tint.opacity(0.13), in: Capsule())
            }

            if !snapshot.diagnosis.isEmpty {
                Label(snapshot.diagnosis.replacingOccurrences(of: "-", with: " "), systemImage: "stethoscope")
                    .font(.caption2)
                    .fontWeight(.semibold)
                    .foregroundStyle(QuipslyStudioTheme.honey)
            }

            Text("Truth: read-only proof-watch packet. It can move the playhead, copy commands, and open evidence; it does not edit, export, approve, upload, publish, or rewrite short recipes.")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var rangeComparison: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(spacing: 6) {
                rangeCard(
                    title: "Current",
                    rangeText: snapshot.currentRangeText,
                    alignment: snapshot.currentAlignment,
                    time: snapshot.currentStart,
                    tint: QuipslyStudioTheme.clay,
                    systemImage: "exclamationmark.magnifyingglass"
                )
                rangeCard(
                    title: "Candidate",
                    rangeText: snapshot.candidateRangeText,
                    alignment: snapshot.candidateAlignment,
                    time: snapshot.candidateStart,
                    tint: QuipslyStudioTheme.moss,
                    systemImage: "checkmark.seal"
                )
            }

            if !snapshot.globalOffset.isEmpty {
                Label("Global offset: \(snapshot.globalOffset)", systemImage: "point.topleft.down.curvedto.point.bottomright.up")
                    .font(.caption2)
                    .foregroundStyle(QuipslyStudioTheme.honey)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private func rangeCard(
        title: String,
        rangeText: String,
        alignment: String,
        time: Double?,
        tint: Color,
        systemImage: String
    ) -> some View {
        Button {
            if let time {
                onSeek(time)
            }
        } label: {
            VStack(alignment: .leading, spacing: 4) {
                Label(title, systemImage: systemImage)
                    .font(.caption2)
                    .fontWeight(.black)
                    .foregroundStyle(tint)
                Text(rangeText)
                    .font(.caption2.monospacedDigit())
                    .fontWeight(.semibold)
                    .foregroundStyle(.primary)
                    .lineLimit(2)
                if !alignment.isEmpty {
                    Text(alignment)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(3)
                }
                Text(time.map { "Jump to \(Self.timecode($0))" } ?? "No seek time")
                    .font(.caption2)
                    .fontWeight(.bold)
                    .foregroundStyle(tint)
            }
            .padding(8)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(tint.opacity(0.09), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(tint.opacity(0.18), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .disabled(time == nil)
        .help(time.map { "Seek the shared Studio playhead to \(Self.timecode($0))." } ?? "No seek time is available.")
    }

    @ViewBuilder
    private var storyPreview: some View {
        if snapshot.hasStoryPreview {
            VStack(alignment: .leading, spacing: 6) {
                Label("Candidate story preview", systemImage: "text.bubble.fill")
                    .font(.caption2)
                    .fontWeight(.black)
                    .foregroundStyle(QuipslyStudioTheme.creek)
                previewLine("Hook", snapshot.hook)
                previewLine("Turn", snapshot.turn)
                previewLine("Payoff", snapshot.payoff)
                previewLine("Overlay", snapshot.overlay)
            }
            .padding(8)
            .background(QuipslyStudioTheme.creek.opacity(0.075), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
    }

    private func previewLine(_ label: String, _ value: String) -> some View {
        HStack(alignment: .top, spacing: 6) {
            Text(label)
                .font(.caption2)
                .fontWeight(.black)
                .foregroundStyle(QuipslyStudioTheme.creek)
                .frame(width: 44, alignment: .leading)
            Text(value.isEmpty ? "Not provided" : value)
                .font(.caption2)
                .foregroundStyle(value.isEmpty ? .secondary : QuipslyStudioTheme.moonMilk.opacity(0.86))
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var watchPlan: some View {
        VStack(alignment: .leading, spacing: 6) {
            Label("Watch decision", systemImage: "eye.fill")
                .font(.caption2)
                .fontWeight(.black)
                .foregroundStyle(QuipslyStudioTheme.honey)

            ForEach(snapshot.allowedOutcomes.prefix(4), id: \.self) { outcome in
                HStack(alignment: .top, spacing: 6) {
                    Image(systemName: "arrow.turn.down.right")
                        .font(.caption2)
                        .foregroundStyle(QuipslyStudioTheme.honey)
                    Text(outcome.replacingOccurrences(of: "-", with: " "))
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }

            if !snapshot.primaryRisk.isEmpty {
                Text(snapshot.primaryRisk)
                    .font(.caption2)
                    .fontWeight(.semibold)
                    .foregroundStyle(QuipslyStudioTheme.clay)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var actionRow: some View {
        HStack(spacing: 6) {
            Button {
                onOpenPath(ShortsRecipeRepairProofSnapshot.markdownPath, "Short repair proof packet")
            } label: {
                Label("Open packet", systemImage: "rectangle.and.text.magnifyingglass")
                    .frame(maxWidth: .infinity)
            }

            Button {
                onCopyText(snapshot.commandSummary, "Copied proof-watch repair commands")
            } label: {
                Label("Copy commands", systemImage: "terminal")
                    .frame(maxWidth: .infinity)
            }
        }
        .buttonStyle(.bordered)
        .controlSize(.small)
    }

    private var missingPacketCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Repair packet missing")
                .font(.caption)
                .fontWeight(.black)
            Text("Generate the next read-only shorts repair packet, then return here to proof-watch current vs candidate ranges in the monitor wall.")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            Text(ShortsRecipeRepairProofSnapshot.regenerateCommand)
                .font(.caption2.monospaced())
                .foregroundStyle(QuipslyStudioTheme.moonMilk.opacity(0.82))
                .textSelection(.enabled)
                .lineLimit(4)
            Button {
                onCopyText(
                    ShortsRecipeRepairProofSnapshot.regenerateCommand,
                    "Copied shorts repair proof packet command"
                )
            } label: {
                Label("Copy packet command", systemImage: "doc.on.doc")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
        }
        .padding(9)
        .background(QuipslyStudioTheme.panelLift.opacity(0.22), in: RoundedRectangle(cornerRadius: 13, style: .continuous))
    }

    private static func timecode(_ seconds: Double) -> String {
        let safe = max(0, seconds)
        let minutes = Int(safe / 60)
        let remaining = safe - Double(minutes * 60)
        return String(format: "%02d:%05.2f", minutes, remaining)
    }
}

private struct ShortsRecipeRepairProofSnapshot {
    static let markdownPath = "/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/docs/quipsly/current-state/episode-1-shorts-recipe-repair-next.md"
    static let regenerateCommand = "script/agentctl.sh shorts-recipe-repair-next --markdown --save docs/quipsly/current-state/episode-1-shorts-recipe-repair-next.md"

    let markdownText: String
    let sequence: String
    let shortId: String
    let rank: String
    let title: String
    let status: String
    let diagnosis: String
    let scoreImprovement: String
    let globalOffset: String
    let currentStart: Double?
    let currentEnd: Double?
    let candidateStart: Double?
    let candidateEnd: Double?
    let currentAlignment: String
    let candidateAlignment: String
    let hook: String
    let turn: String
    let payoff: String
    let caption: String
    let overlay: String
    let risks: [String]
    let allowedOutcomes: [String]
    let safeCommands: [String: String]

    var isLoaded: Bool { !markdownText.isEmpty }
    var tint: Color { isLoaded ? QuipslyStudioTheme.honey : QuipslyStudioTheme.clay }
    var badgeText: String { isLoaded ? statusLabel.uppercased() : "MISSING" }
    var statusLabel: String { status.isEmpty ? "proof watch" : status.replacingOccurrences(of: "-", with: " ") }
    var currentRangeText: String { rangeText(start: currentStart, end: currentEnd) }
    var candidateRangeText: String { rangeText(start: candidateStart, end: candidateEnd) }
    var hasStoryPreview: Bool { !hook.isEmpty || !turn.isEmpty || !payoff.isEmpty || !overlay.isEmpty }
    var primaryRisk: String { risks.first ?? "" }

    var commandSummary: String {
        if safeCommands.isEmpty {
            return Self.regenerateCommand
        }
        return safeCommands
            .sorted { $0.key < $1.key }
            .map { "\($0.key): \($0.value)" }
            .joined(separator: "\n")
    }

    static func load(path: String = markdownPath) -> ShortsRecipeRepairProofSnapshot {
        guard let data = FileManager.default.contents(atPath: path),
              let text = String(data: data, encoding: .utf8),
              !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return missing
        }

        let currentRange = rangeValue(text, prefix: "- Current range:")
        let candidateRange = rangeValue(text, prefix: "- Candidate range:")

        return ShortsRecipeRepairProofSnapshot(
            markdownText: text,
            sequence: lineValue(text, prefix: "- Sequence:"),
            shortId: lineValue(text, prefix: "- Short:"),
            rank: lineValue(text, prefix: "- Rank:"),
            title: lineValue(text, prefix: "- Title:"),
            status: lineValue(text, prefix: "- Status:"),
            diagnosis: lineValue(text, prefix: "- Diagnosis:"),
            scoreImprovement: lineValue(text, prefix: "- Score improvement:"),
            globalOffset: lineValue(text, prefix: "- Global offset:"),
            currentStart: currentRange?.start,
            currentEnd: currentRange?.end,
            candidateStart: candidateRange?.start,
            candidateEnd: candidateRange?.end,
            currentAlignment: lineValue(text, prefix: "- Current alignment:"),
            candidateAlignment: lineValue(text, prefix: "- Candidate alignment:"),
            hook: lineValue(text, prefix: "- Hook:"),
            turn: lineValue(text, prefix: "- Turn:"),
            payoff: lineValue(text, prefix: "- Payoff:"),
            caption: lineValue(text, prefix: "- Caption:"),
            overlay: lineValue(text, prefix: "- Overlay:"),
            risks: sectionBullets(text, heading: "## Risks"),
            allowedOutcomes: sectionBullets(text, heading: "## Allowed outcomes"),
            safeCommands: commandDictionary(text)
        )
    }

    private static var missing: ShortsRecipeRepairProofSnapshot {
        ShortsRecipeRepairProofSnapshot(
            markdownText: "",
            sequence: "",
            shortId: "",
            rank: "",
            title: "",
            status: "missing",
            diagnosis: "",
            scoreImprovement: "",
            globalOffset: "",
            currentStart: nil,
            currentEnd: nil,
            candidateStart: nil,
            candidateEnd: nil,
            currentAlignment: "",
            candidateAlignment: "",
            hook: "",
            turn: "",
            payoff: "",
            caption: "",
            overlay: "",
            risks: [],
            allowedOutcomes: [],
            safeCommands: [:]
        )
    }

    private func rangeText(start: Double?, end: Double?) -> String {
        guard let start, let end else { return "No range" }
        return String(format: "%.2fs -> %.2fs", start, end)
    }

    private static func lineValue(_ text: String, prefix: String) -> String {
        guard let line = text
            .components(separatedBy: .newlines)
            .first(where: { $0.trimmingCharacters(in: .whitespaces).hasPrefix(prefix) }) else {
            return ""
        }
        let value = line.dropFirst(prefix.count)
        return clean(String(value))
    }

    private static func rangeValue(_ text: String, prefix: String) -> (start: Double, end: Double)? {
        let value = lineValue(text, prefix: prefix)
        let parts = value.components(separatedBy: "->")
        guard parts.count == 2,
              let start = Double(clean(parts[0])),
              let end = Double(clean(parts[1])) else {
            return nil
        }
        return (start, end)
    }

    private static func sectionBullets(_ text: String, heading: String) -> [String] {
        let lines = text.components(separatedBy: .newlines)
        guard let start = lines.firstIndex(where: { $0.trimmingCharacters(in: .whitespaces) == heading }) else {
            return []
        }

        var bullets: [String] = []
        for line in lines.dropFirst(start + 1) {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.hasPrefix("## ") { break }
            if trimmed.hasPrefix("- ") {
                bullets.append(clean(String(trimmed.dropFirst(2))))
            }
        }
        return bullets
    }

    private static func commandDictionary(_ text: String) -> [String: String] {
        sectionBullets(text, heading: "## Safe commands").reduce(into: [String: String]()) { partial, bullet in
            let pieces = bullet.components(separatedBy: ":")
            guard let key = pieces.first?.trimmingCharacters(in: .whitespacesAndNewlines),
                  !key.isEmpty else {
                return
            }
            let command = bullet.dropFirst(key.count + 1)
            partial[key] = clean(String(command))
        }
    }

    private static func clean(_ raw: String) -> String {
        raw
            .replacingOccurrences(of: "`", with: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
