import Foundation
import SwiftUI

struct ShortsTranscriptConfidencePanel: View {
    let activeSessionName: String
    var onCopyText: (String, String) -> Void

    @State private var snapshot = ShortsTranscriptConfidenceSnapshot.loading

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
                    QuipslyStudioTheme.sage.opacity(0.12),
                    QuipslyStudioTheme.panelLift.opacity(0.30),
                    QuipslyStudioTheme.night.opacity(0.24)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            ),
            in: RoundedRectangle(cornerRadius: 16, style: .continuous)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(snapshot.tint.opacity(0.18), lineWidth: 1)
        )
        .task(id: activeSessionName) {
            await refreshConfidence()
        }
        .accessibilityIdentifier("quipsly.workbench.shorts.transcriptConfidence")
    }

    private var header: some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: snapshot.iconName)
                .font(.caption)
                .foregroundStyle(snapshot.tint)
                .frame(width: 18)

            VStack(alignment: .leading, spacing: 2) {
                Text("Transcript confidence")
                    .font(.caption)
                    .fontWeight(.black)
                Text("Checks current short transcript excerpts for rough ASR, repeated phrases, missing speaker labels, and missing context. Read-only.")
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
            Text("Reading transcript evidence from the running shorts queue...")
                .font(.caption2)
                .foregroundStyle(.secondary)
        case .failed(let message):
            VStack(alignment: .leading, spacing: 7) {
                Text("Transcript confidence unavailable")
                    .font(.caption)
                    .fontWeight(.black)
                Text(message)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                Text("Terminal fallback: `script/agentctl.sh shorts-transcript-confidence-board --save --markdown`")
                    .font(.caption2.monospaced())
                    .foregroundStyle(QuipslyStudioTheme.moonMilk.opacity(0.78))
                    .textSelection(.enabled)
            }
        case .ready:
            VStack(alignment: .leading, spacing: 9) {
                summaryGrid

                if snapshot.items.isEmpty {
                    Text("No queued shorts are visible yet. Add or select a short recipe, then this panel will explain whether its transcript context is safe enough for captions, hooks, and quote claims.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                } else {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Lowest-confidence evidence")
                            .font(.caption2)
                            .fontWeight(.black)
                            .tracking(0.7)
                            .foregroundStyle(.secondary)

                        ForEach(Array(snapshot.lowestConfidenceItems.prefix(2))) { item in
                            confidenceItemRow(item)
                        }
                    }

                    transcriptActionLine(
                        icon: "ear.and.waveform",
                        title: "Next safest action",
                        value: snapshot.nextSafeAction,
                        color: snapshot.tint
                    )
                }

                Text(snapshot.truth)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var summaryGrid: some View {
        LazyVGrid(
            columns: [
                GridItem(.flexible(), spacing: 6),
                GridItem(.flexible(), spacing: 6)
            ],
            spacing: 6
        ) {
            statPill("Usable", snapshot.summary.usableContext, QuipslyStudioTheme.moss)
            statPill("Caution", snapshot.summary.useWithCaution, QuipslyStudioTheme.honey)
            statPill("Review", snapshot.summary.needsTranscriptReview, QuipslyStudioTheme.clay)
            statPill("Missing", snapshot.summary.missingTranscript, QuipslyStudioTheme.creek)
        }
    }

    private var commandRow: some View {
        HStack(spacing: 6) {
            Button {
                Task { await refreshConfidence() }
            } label: {
                Label("Refresh", systemImage: "arrow.clockwise")
                    .frame(maxWidth: .infinity)
            }

            Button {
                onCopyText(
                    "script/agentctl.sh shorts-transcript-confidence-board --save --markdown",
                    "Copied transcript confidence board command"
                )
            } label: {
                Label("Copy board", systemImage: "doc.on.doc")
                    .frame(maxWidth: .infinity)
            }

            Button {
                onCopyText(
                    "script/agentctl.sh studio-shorts-transcript-workorders --all",
                    "Copied transcript workorders command"
                )
            } label: {
                Label("Workorders", systemImage: "list.clipboard")
                    .frame(maxWidth: .infinity)
            }
        }
        .buttonStyle(.bordered)
        .controlSize(.small)
    }

    private func statPill(_ title: String, _ value: Int, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("\(value)")
                .font(.caption.monospacedDigit())
                .fontWeight(.black)
                .foregroundStyle(color)
            Text(title)
                .font(.caption2)
                .fontWeight(.bold)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(color.opacity(0.10), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private func confidenceItemRow(_ item: ShortsTranscriptConfidenceItem) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack(alignment: .top, spacing: 8) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.title)
                        .font(.caption)
                        .fontWeight(.black)
                        .lineLimit(2)
                    Text("\(item.classificationLabel) · \(item.confidenceScore)% · \(item.speakers.isEmpty ? "unknown speaker" : item.speakers)")
                        .font(.caption2.monospacedDigit())
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
                Spacer(minLength: 6)
                Text(item.status.uppercased())
                    .font(.caption2)
                    .fontWeight(.black)
                    .foregroundStyle(item.tint)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 3)
                    .background(item.tint.opacity(0.13), in: Capsule())
            }

            if !item.warningSummary.isEmpty {
                Text(item.warningSummary)
                    .font(.caption2)
                    .fontWeight(.semibold)
                    .foregroundStyle(item.tint)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if !item.excerpt.isEmpty {
                Text(item.excerpt)
                    .font(.caption2)
                    .foregroundStyle(QuipslyStudioTheme.moonMilk.opacity(0.78))
                    .lineLimit(4)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(9)
        .background(item.tint.opacity(0.075), in: RoundedRectangle(cornerRadius: 13, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 13, style: .continuous)
                .stroke(item.tint.opacity(0.16), lineWidth: 1)
        )
    }

    private func transcriptActionLine(icon: String, title: String, value: String, color: Color) -> some View {
        HStack(alignment: .top, spacing: 6) {
            Image(systemName: icon)
                .font(.caption2)
                .foregroundStyle(color)
            VStack(alignment: .leading, spacing: 1) {
                Text(title)
                    .font(.caption2)
                    .fontWeight(.black)
                    .foregroundStyle(color)
                Text(value.isEmpty ? "No transcript action recorded yet." : value)
                    .font(.caption2)
                    .foregroundStyle(QuipslyStudioTheme.moonMilk.opacity(0.78))
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .background(color.opacity(0.10), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private func refreshConfidence() async {
        guard let url = URL(string: "http://127.0.0.1:8080/shorts_queue") else {
            snapshot = .failed("The local shorts queue endpoint URL could not be built.")
            return
        }

        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            let json = try JSONSerialization.jsonObject(with: data)
            await MainActor.run {
                snapshot = ShortsTranscriptConfidenceSnapshot(json: json, activeSessionName: activeSessionName)
            }
        } catch {
            await MainActor.run {
                snapshot = .failed(error.localizedDescription)
            }
        }
    }
}

private struct ShortsTranscriptConfidenceSummary {
    let total: Int
    let usableContext: Int
    let useWithCaution: Int
    let needsTranscriptReview: Int
    let missingTranscript: Int
}

private struct ShortsTranscriptConfidenceSnapshot {
    enum LoadState {
        case loading
        case ready
        case failed(String)
    }

    let state: LoadState
    let activeSessionName: String
    let items: [ShortsTranscriptConfidenceItem]
    let summary: ShortsTranscriptConfidenceSummary
    let truth: String

    static let loading = ShortsTranscriptConfidenceSnapshot(
        state: .loading,
        activeSessionName: "",
        items: [],
        summary: ShortsTranscriptConfidenceSummary(total: 0, usableContext: 0, useWithCaution: 0, needsTranscriptReview: 0, missingTranscript: 0),
        truth: "Reading current shorts queue transcript excerpts only."
    )

    static func failed(_ message: String) -> ShortsTranscriptConfidenceSnapshot {
        ShortsTranscriptConfidenceSnapshot(
            state: .failed(message),
            activeSessionName: "",
            items: [],
            summary: ShortsTranscriptConfidenceSummary(total: 0, usableContext: 0, useWithCaution: 0, needsTranscriptReview: 0, missingTranscript: 0),
            truth: "No edit, export, approval, publication, transcript generation, or source-media mutation was attempted."
        )
    }

    init(json: Any, activeSessionName: String) {
        let rows = Self.queueItems(from: json)
        let items = rows.enumerated().map { index, row in
            ShortsTranscriptConfidenceItem(row: row, index: index + 1)
        }
        self.init(
            state: .ready,
            activeSessionName: activeSessionName,
            items: items,
            summary: ShortsTranscriptConfidenceSummary(
                total: items.count,
                usableContext: items.filter { $0.classification == .usableContext }.count,
                useWithCaution: items.filter { $0.classification == .useWithCaution }.count,
                needsTranscriptReview: items.filter { $0.classification == .needsTranscriptReview }.count,
                missingTranscript: items.filter { $0.classification == .missingTranscript }.count
            ),
            truth: "Transcript confidence reads current queue excerpts as evidence, not source truth. Listen before using words for captions, quote claims, or final cut decisions."
        )
    }

    private init(
        state: LoadState,
        activeSessionName: String,
        items: [ShortsTranscriptConfidenceItem],
        summary: ShortsTranscriptConfidenceSummary,
        truth: String
    ) {
        self.state = state
        self.activeSessionName = activeSessionName
        self.items = items
        self.summary = summary
        self.truth = truth
    }

    var lowestConfidenceItems: [ShortsTranscriptConfidenceItem] {
        items.sorted { left, right in
            if left.confidenceScore == right.confidenceScore {
                return left.index < right.index
            }
            return left.confidenceScore < right.confidenceScore
        }
    }

    var nextSafeAction: String {
        guard let first = lowestConfidenceItems.first else {
            return "No queued shorts are visible yet. Add a short recipe, then review transcript evidence here."
        }
        return first.nextSafeAction
    }

    var iconName: String {
        switch state {
        case .loading:
            return "hourglass"
        case .ready:
            if summary.needsTranscriptReview > 0 || summary.missingTranscript > 0 {
                return "waveform.badge.magnifyingglass"
            }
            return summary.useWithCaution > 0 ? "ear.badge.waveform" : "checkmark.seal.fill"
        case .failed:
            return "exclamationmark.triangle.fill"
        }
    }

    var tint: Color {
        switch state {
        case .loading:
            return QuipslyStudioTheme.sage
        case .ready:
            if summary.needsTranscriptReview > 0 || summary.missingTranscript > 0 {
                return QuipslyStudioTheme.clay
            }
            return summary.useWithCaution > 0 ? QuipslyStudioTheme.honey : QuipslyStudioTheme.moss
        case .failed:
            return QuipslyStudioTheme.clay
        }
    }

    var badgeText: String {
        switch state {
        case .loading:
            return "READING"
        case .ready:
            if summary.total == 0 { return "NO SHORTS" }
            if summary.needsTranscriptReview + summary.missingTranscript > 0 {
                return "\(summary.needsTranscriptReview + summary.missingTranscript) REVIEW"
            }
            if summary.useWithCaution > 0 { return "\(summary.useWithCaution) CAUTION" }
            return "CLEAR"
        case .failed:
            return "CHECK"
        }
    }

    private static func queueItems(from json: Any) -> [[String: Any]] {
        if let rows = json as? [[String: Any]] {
            return rows
        }
        guard let root = json as? [String: Any] else {
            return []
        }
        for key in ["clips", "shorts", "items"] {
            if let rows = root[key] as? [[String: Any]] {
                return rows
            }
        }
        return []
    }
}

private struct ShortsTranscriptConfidenceItem: Identifiable {
    enum Classification {
        case usableContext
        case useWithCaution
        case needsTranscriptReview
        case missingTranscript
    }

    let id: String
    let index: Int
    let title: String
    let status: String
    let classification: Classification
    let confidenceScore: Int
    let speakers: String
    let segmentCount: Int
    let wordCount: Int
    let adjacentRepeatCount: Int
    let bigramRepeatCount: Int
    let fillerRatio: Double
    let excerpt: String
    let warnings: [String]
    let nextSafeAction: String

    init(row: [String: Any], index: Int) {
        let context = Self.transcriptContext(row)
        let excerpt = Self.string(context["excerpt"]).trimmingCharacters(in: .whitespacesAndNewlines)
        let status = Self.transcriptStatus(context: context, excerpt: excerpt)
        let speakers = Self.string(context["speakers"], fallback: "unknown")
        let segmentCount = Self.int(context["segmentCount"])
        let words = Self.tokens(excerpt)
        let adjacent = Self.repeatedAdjacentTokens(words)
        let bigramRepeats = Self.repeatedBigrams(words)
        let fillerRatio = Self.fillerRatio(words)
        let unknownSpeaker = speakers.isEmpty || ["unknown", "speaker", "speakers"].contains(speakers.lowercased())

        var score = 100
        var warnings: [String] = []
        var actions: [String] = []

        if status == "missing" || excerpt.isEmpty {
            score -= 70
            warnings.append("missing transcript excerpt")
            actions.append("Create or link transcript evidence before using words for edit decisions.")
        }

        if words.count < 18 && status != "missing" {
            score -= 20
            warnings.append("short excerpt may not explain the idea")
            actions.append("Open longer transcript context or watch the export before judging hook/payoff.")
        }

        let repeatedRatio = Double(adjacent + bigramRepeats) / Double(max(words.count, 1))
        if adjacent >= 4 || bigramRepeats >= 5 || repeatedRatio > 0.12 {
            score -= 25
            warnings.append("repeated words/phrases suggest rough ASR or overlap duplication")
            actions.append("Proof-listen or rerun transcript cleanup before quoting this directly.")
        }

        if fillerRatio > 0.18 {
            score -= 12
            warnings.append("high filler ratio")
            actions.append("Use transcript for context only; judge cadence by listening.")
        }

        if unknownSpeaker {
            score -= 15
            warnings.append("speaker label uncertain")
            actions.append("Review or assign speaker before speaker-aware captions or reaction cuts.")
        }

        if segmentCount <= 0 && status != "missing" {
            score -= 10
            warnings.append("segment count unavailable")
        }

        score = min(100, max(0, score))
        let classification: Classification
        if score >= 80 {
            classification = .usableContext
            actions.append("Transcript can guide context, but verify quotes by ear before publishing.")
        } else if score >= 55 {
            classification = .useWithCaution
            actions.append("Use transcript to orient review, not as caption or quote truth.")
        } else if status == "missing" {
            classification = .missingTranscript
        } else {
            classification = .needsTranscriptReview
        }

        self.id = Self.string(row["id"], fallback: "queue-index-\(index)")
        self.index = index
        self.title = Self.string(row["title"], fallback: "Short \(index)")
        self.status = status
        self.classification = classification
        self.confidenceScore = score
        self.speakers = speakers
        self.segmentCount = segmentCount
        self.wordCount = words.count
        self.adjacentRepeatCount = adjacent
        self.bigramRepeatCount = bigramRepeats
        self.fillerRatio = fillerRatio
        self.excerpt = excerpt
        self.warnings = warnings
        self.nextSafeAction = actions.first ?? "Transcript evidence looks usable for orientation; still proof-listen before publication."
    }

    var classificationLabel: String {
        switch classification {
        case .usableContext:
            return "usable context"
        case .useWithCaution:
            return "use with caution"
        case .needsTranscriptReview:
            return "needs transcript review"
        case .missingTranscript:
            return "missing transcript"
        }
    }

    var tint: Color {
        switch classification {
        case .usableContext:
            return QuipslyStudioTheme.moss
        case .useWithCaution:
            return QuipslyStudioTheme.honey
        case .needsTranscriptReview, .missingTranscript:
            return QuipslyStudioTheme.clay
        }
    }

    var warningSummary: String {
        warnings.isEmpty ? "No obvious transcript confidence warnings." : warnings.prefix(3).joined(separator: "; ")
    }

    private static func transcriptContext(_ row: [String: Any]) -> [String: Any] {
        if let context = row["transcriptContext"] as? [String: Any] {
            return context
        }
        if let evidence = row["reviewEvidence"] as? [String: Any],
           let context = evidence["transcriptContext"] as? [String: Any] {
            return context
        }
        return [:]
    }

    private static func transcriptStatus(context: [String: Any], excerpt: String) -> String {
        let status = string(context["status"]).lowercased()
        if !status.isEmpty { return status }
        return excerpt.isEmpty ? "missing" : "available"
    }

    private static func tokens(_ value: String) -> [String] {
        value
            .lowercased()
            .components(separatedBy: CharacterSet.alphanumerics.inverted)
            .filter { !$0.isEmpty }
    }

    private static func repeatedAdjacentTokens(_ words: [String]) -> Int {
        guard words.count > 1 else { return 0 }
        var count = 0
        for index in 1..<words.count where words[index] == words[index - 1] {
            count += 1
        }
        return count
    }

    private static func repeatedBigrams(_ words: [String]) -> Int {
        guard words.count > 2 else { return 0 }
        var counts: [String: Int] = [:]
        for index in 0..<(words.count - 1) {
            counts["\(words[index]) \(words[index + 1])", default: 0] += 1
        }
        return counts.values.reduce(0) { partial, count in
            count > 1 ? partial + count - 1 : partial
        }
    }

    private static func fillerRatio(_ words: [String]) -> Double {
        guard !words.isEmpty else { return 0 }
        let fillers: Set<String> = ["um", "uh", "like", "you", "know", "so", "and", "but", "okay"]
        let fillerCount = words.filter { fillers.contains($0) }.count
        return Double(fillerCount) / Double(words.count)
    }

    private static func string(_ value: Any?, fallback: String = "") -> String {
        if let value = value as? String { return value }
        if let value { return "\(value)" }
        return fallback
    }

    private static func int(_ value: Any?) -> Int {
        if let value = value as? Int { return value }
        if let value = value as? Double { return Int(value) }
        if let value = value as? String, let parsed = Int(value) { return parsed }
        return 0
    }
}
