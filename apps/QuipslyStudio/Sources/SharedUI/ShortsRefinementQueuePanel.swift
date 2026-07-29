import Foundation
import SwiftUI

struct ShortsRefinementQueuePanel: View {
    var activeSessionName: String = ""
    var onOpenPath: (String, String) -> Void
    var onCopyText: (String, String) -> Void

    var body: some View {
        let snapshot = ShortsRefinementQueueSnapshot.load()
        let activeEpisode = Self.activeEpisodeNumber(from: activeSessionName)
        let matchingItems = snapshot.items.filter { item in
            guard let activeEpisode else { return false }
            return item.episode == activeEpisode
        }
        let isShowingScopedItems = !matchingItems.isEmpty
        let visibleItems = isShowingScopedItems ? matchingItems : snapshot.items
        let topItems = Array(visibleItems.prefix(3))
        let hasItems = !topItems.isEmpty

        return VStack(alignment: .leading, spacing: 9) {
            HStack(alignment: .top, spacing: 8) {
                Image(systemName: hasItems ? "wand.and.stars.inverse" : "tray")
                    .font(.caption)
                    .foregroundStyle(hasItems ? QuipslyStudioTheme.creek : QuipslyStudioTheme.honey)
                    .frame(width: 18)

                VStack(alignment: .leading, spacing: 2) {
                    Text("Refinement queue")
                        .font(.caption)
                        .fontWeight(.black)
                    Text("Local short-craft recommendations from review packets. This is evidence routing only: it does not edit, export, approve, upload, or publish.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer(minLength: 8)

                Text(hasItems ? queueBadgeText(activeEpisode: activeEpisode, isScoped: isShowingScopedItems, total: snapshot.items.count) : "MISSING")
                    .font(.caption2)
                    .fontWeight(.black)
                    .tracking(0.7)
                    .foregroundStyle(hasItems ? QuipslyStudioTheme.creek : QuipslyStudioTheme.honey)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 3)
                    .background((hasItems ? QuipslyStudioTheme.creek : QuipslyStudioTheme.honey).opacity(0.13))
                    .clipShape(Capsule())
            }

            Text(hasItems ? snapshot.nextSafestAction : "Run the refinement queue when the external review-board drive is mounted, then this panel will point to the next watch/listen target.")
                .font(.caption2)
                .fontWeight(.semibold)
                .foregroundStyle(hasItems ? QuipslyStudioTheme.sage : QuipslyStudioTheme.honey)
                .fixedSize(horizontal: false, vertical: true)

            if hasItems {
                queueScopeBanner(
                    activeEpisode: activeEpisode,
                    isScoped: isShowingScopedItems,
                    visibleCount: visibleItems.count,
                    totalCount: snapshot.items.count
                )

                ForEach(topItems) { item in
                    ShortsRefinementQueueItemCard(
                        item: item,
                        onOpenPath: onOpenPath,
                        onCopyText: onCopyText
                    )
                }
            } else {
                missingQueueCommandCard
            }
        }
        .padding(10)
        .background(
            LinearGradient(
                colors: [
                    QuipslyStudioTheme.creek.opacity(0.10),
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
                .stroke(QuipslyStudioTheme.creek.opacity(0.18), lineWidth: 1)
        )
        .help("Reads \(ShortsRefinementQueueSnapshot.latestPath). If it is missing, mount the external drive or regenerate the queue.")
        .accessibilityIdentifier("quipsly.workbench.shorts.refinementQueue")
    }

    private func queueBadgeText(activeEpisode: Int?, isScoped: Bool, total: Int) -> String {
        guard let activeEpisode else { return "\(total) TARGETS" }
        return isScoped ? "EP \(activeEpisode) TARGETS" : "GLOBAL QUEUE"
    }

    private func queueScopeBanner(activeEpisode: Int?, isScoped: Bool, visibleCount: Int, totalCount: Int) -> some View {
        let message: String
        let color: Color
        if let activeEpisode, isScoped {
            message = "Showing \(visibleCount) Episode \(activeEpisode) target\(visibleCount == 1 ? "" : "s") first from the global queue."
            color = QuipslyStudioTheme.creek
        } else if let activeEpisode {
            message = "No Episode \(activeEpisode) targets are in the queue yet, so these are global next-best refinement targets."
            color = QuipslyStudioTheme.honey
        } else {
            message = "Showing the global refinement queue. Load or name a session like episode-1 to scope this panel."
            color = QuipslyStudioTheme.sage
        }

        return HStack(alignment: .top, spacing: 6) {
            Image(systemName: isScoped ? "scope" : "map")
                .font(.caption2)
                .foregroundStyle(color)
            Text(message)
                .font(.caption2)
                .fontWeight(.semibold)
                .foregroundStyle(color)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
            Text("\(totalCount) total")
                .font(.caption2.monospacedDigit())
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .background(color.opacity(0.10), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .accessibilityIdentifier("quipsly.workbench.shorts.refinementQueue.scope")
    }

    private static func activeEpisodeNumber(from sessionName: String) -> Int? {
        let lower = sessionName.lowercased()
        let pattern = #"episode[-_ ]?0*([0-9]+)"#
        guard let regex = try? NSRegularExpression(pattern: pattern),
              let match = regex.firstMatch(in: lower, range: NSRange(lower.startIndex..., in: lower)),
              match.numberOfRanges > 1,
              let range = Range(match.range(at: 1), in: lower),
              let episode = Int(lower[range]) else {
            return nil
        }
        return episode
    }

    private var missingQueueCommandCard: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text("Safe command")
                .font(.caption2)
                .fontWeight(.black)
                .tracking(0.7)
                .foregroundStyle(.secondary)
            Text(ShortsRefinementQueueSnapshot.regenerateCommand)
                .font(.caption2.monospaced())
                .foregroundStyle(QuipslyStudioTheme.moonMilk.opacity(0.82))
                .textSelection(.enabled)
                .lineLimit(3)

            Button {
                onCopyText(
                    ShortsRefinementQueueSnapshot.regenerateCommand,
                    "Copied shorts refinement queue command"
                )
            } label: {
                Label("Copy queue command", systemImage: "doc.on.doc")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
        }
        .padding(9)
        .background(QuipslyStudioTheme.panelLift.opacity(0.22), in: RoundedRectangle(cornerRadius: 13, style: .continuous))
    }
}

private struct ShortsRefinementQueueItemCard: View {
    let item: ShortsRefinementQueueItem
    var onOpenPath: (String, String) -> Void
    var onCopyText: (String, String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            titleRow
            craftFocusRow
            Text(item.craftStance.isEmpty ? item.nextSafestAction : item.craftStance)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            questionRows
            actionRow
        }
        .padding(9)
        .background(QuipslyStudioTheme.creek.opacity(0.075), in: RoundedRectangle(cornerRadius: 13, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 13, style: .continuous)
                .stroke(QuipslyStudioTheme.creek.opacity(0.16), lineWidth: 1)
        )
        .accessibilityLabel("Short refinement target \(item.title). Episode \(item.episode), score \(item.score), lane \(item.lane).")
    }

    private var titleRow: some View {
        HStack(alignment: .top, spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                Text(item.title)
                    .font(.caption)
                    .fontWeight(.black)
                    .lineLimit(2)
                Text("Episode \(item.episode) · \(item.lane.replacingOccurrences(of: "-", with: " ")) · score \(item.score)")
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 6)
            Text(item.readinessLevel.replacingOccurrences(of: "-", with: " ").uppercased())
                .font(.caption2)
                .fontWeight(.black)
                .foregroundStyle(QuipslyStudioTheme.creek)
                .padding(.horizontal, 7)
                .padding(.vertical, 3)
                .background(QuipslyStudioTheme.creek.opacity(0.12), in: Capsule())
        }
    }

    @ViewBuilder
    private var craftFocusRow: some View {
        if !item.craftFocus.isEmpty {
            HStack(spacing: 5) {
                ForEach(item.craftFocus, id: \.self) { focus in
                    focusPill(focus.replacingOccurrences(of: "-", with: " "))
                }
            }
        }
    }

    private var questionRows: some View {
        VStack(alignment: .leading, spacing: 5) {
            ForEach(Array(item.editorQuestions.prefix(2).enumerated()), id: \.offset) { _, question in
                HStack(alignment: .top, spacing: 6) {
                    Image(systemName: "questionmark.circle.fill")
                        .font(.caption2)
                        .foregroundStyle(QuipslyStudioTheme.sage)
                    Text(question)
                        .font(.caption2)
                        .foregroundStyle(QuipslyStudioTheme.moonMilk.opacity(0.78))
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }

    private var actionRow: some View {
        HStack(spacing: 6) {
            Button {
                onOpenPath(item.reviewPacketHtml, "\(item.title) review packet")
            } label: {
                Label("Open packet", systemImage: "rectangle.and.text.magnifyingglass")
                    .frame(maxWidth: .infinity)
            }
            .disabled(item.reviewPacketHtml.isEmpty)
            .help("Open the local visual/audio review packet. This does not mark review status.")

            Menu {
                Button("Copy polish workorder command") {
                    onCopyText(item.command("makePolishWorkorder"), "Copied polish workorder command for \(item.shortId)")
                }
                Button("Copy polish notes preview command") {
                    onCopyText(item.command("previewPolishNotes"), "Copied polish notes preview command for \(item.shortId)")
                }
                Button("Copy evidence preview command") {
                    onCopyText(item.command("previewEvidenceDraft"), "Copied evidence preview command for \(item.shortId)")
                }
                Button("Copy hook note template") {
                    onCopyText(item.command("recordHookNoteTemplate"), "Copied hook note template for \(item.shortId)")
                }
                Button("Copy cadence note template") {
                    onCopyText(item.command("recordCadenceNoteTemplate"), "Copied cadence note template for \(item.shortId)")
                }
                Button("Copy caption note template") {
                    onCopyText(item.command("recordCaptionNoteTemplate"), "Copied caption note template for \(item.shortId)")
                }
            } label: {
                Label("Commands", systemImage: "terminal")
                    .frame(maxWidth: .infinity)
            }
            .help("Copy safe local commands for workorders, note previews, evidence previews, and review-note templates.")
        }
        .buttonStyle(.bordered)
        .controlSize(.small)
    }

    private func focusPill(_ value: String) -> some View {
        HStack(spacing: 4) {
            Text("Focus")
                .font(.caption2)
                .fontWeight(.black)
                .foregroundStyle(QuipslyStudioTheme.honey.opacity(0.84))
            Text(value)
                .font(.caption2)
                .fontWeight(.bold)
                .foregroundStyle(QuipslyStudioTheme.moonMilk.opacity(0.86))
                .lineLimit(1)
        }
        .padding(.horizontal, 7)
        .padding(.vertical, 3)
        .background(QuipslyStudioTheme.honey.opacity(0.12), in: Capsule())
    }
}

private struct ShortsRefinementQueueSnapshot {
    static let latestPath = "/Volumes/My Passport/Episode_and_Shorts_Test/shorts-command-room/cut-quality-refinement-queue/quipsly-studio-shorts-cut-quality-refinement-queue.json"
    static let regenerateCommand = "script/agentctl.sh studio-shorts-cut-quality-refinement-queue --all"

    let generatedAt: String
    let nextSafestAction: String
    let truth: String
    let items: [ShortsRefinementQueueItem]

    static func load(path: String = latestPath) -> ShortsRefinementQueueSnapshot {
        let missing = ShortsRefinementQueueSnapshot(
            generatedAt: "",
            nextSafestAction: "Create the refinement queue with \(regenerateCommand).",
            truth: "Missing local refinement queue. No edit, export, approval, upload, publication, or receipt state is implied.",
            items: []
        )

        guard let data = FileManager.default.contents(atPath: path),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return missing
        }

        let rows = json["items"] as? [[String: Any]] ?? []
        return ShortsRefinementQueueSnapshot(
            generatedAt: stringValue(json["generatedAt"]),
            nextSafestAction: stringValue(json["nextSafestAction"], fallback: missing.nextSafestAction),
            truth: stringValue(json["truth"], fallback: missing.truth),
            items: rows.compactMap(ShortsRefinementQueueItem.init(json:))
        )
    }

    private static func stringValue(_ value: Any?, fallback: String = "") -> String {
        if let value = value as? String { return value }
        if let value { return "\(value)" }
        return fallback
    }
}

private struct ShortsRefinementQueueItem: Identifiable {
    let id: String
    let shortId: String
    let title: String
    let episode: Int
    let lane: String
    let readinessLevel: String
    let score: Int
    let reviewPacketHtml: String
    let nextSafestAction: String
    let craftStance: String
    let craftFocus: [String]
    let editorQuestions: [String]
    let safeCommands: [String: String]

    init?(json: [String: Any]) {
        let shortId = Self.stringValue(json["shortId"])
        let title = Self.stringValue(json["title"], fallback: shortId)
        guard !shortId.isEmpty || !title.isEmpty else { return nil }

        self.shortId = shortId.isEmpty ? title : shortId
        self.id = self.shortId
        self.title = title.isEmpty ? self.shortId : title
        self.episode = Self.intValue(json["episode"])
        self.lane = Self.stringValue(json["lane"], fallback: "review")
        self.readinessLevel = Self.stringValue(json["readinessLevel"], fallback: "review")
        self.score = Self.intValue(json["score"])
        self.reviewPacketHtml = Self.stringValue(json["reviewPacketHtml"])
        self.nextSafestAction = Self.stringValue(json["nextSafestAction"], fallback: "Watch/listen before recording review intent.")
        self.craftStance = Self.stringValue(json["craftStance"])
        self.craftFocus = Self.stringArray(json["craftFocus"])
        self.editorQuestions = Self.questionArray(json["editorQuestions"])
        self.safeCommands = Self.stringDictionary(json["safeCommands"])
    }

    func command(_ key: String) -> String {
        safeCommands[key] ?? ShortsRefinementQueueSnapshot.regenerateCommand
    }

    private static func stringValue(_ value: Any?, fallback: String = "") -> String {
        if let value = value as? String { return value }
        if let value { return "\(value)" }
        return fallback
    }

    private static func intValue(_ value: Any?) -> Int {
        if let value = value as? Int { return value }
        if let value = value as? Double { return Int(value) }
        if let value = value as? String, let parsed = Int(value) { return parsed }
        return 0
    }

    private static func stringArray(_ value: Any?) -> [String] {
        if let values = value as? [String] { return values }
        if let values = value as? [Any] {
            return values.compactMap { element in
                let string = stringValue(element).trimmingCharacters(in: .whitespacesAndNewlines)
                return string.isEmpty ? nil : string
            }
        }
        return []
    }

    private static func questionArray(_ value: Any?) -> [String] {
        if let values = value as? [[String: Any]] {
            return values.compactMap { row in
                let dimension = stringValue(row["dimension"])
                let question = stringValue(row["question"])
                if question.isEmpty { return nil }
                return dimension.isEmpty ? question : "\(dimension): \(question)"
            }
        }
        return stringArray(value)
    }

    private static func stringDictionary(_ value: Any?) -> [String: String] {
        guard let dictionary = value as? [String: Any] else { return [:] }
        return dictionary.reduce(into: [String: String]()) { partial, pair in
            let string = stringValue(pair.value).trimmingCharacters(in: .whitespacesAndNewlines)
            if !string.isEmpty {
                partial[pair.key] = string
            }
        }
    }
}
