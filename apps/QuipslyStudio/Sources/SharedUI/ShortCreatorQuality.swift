import Foundation
import QuipslyVideoCore

struct ShortCreatorQualityAction {
    let title: String
    let detail: String
}

struct ShortCreatorPlatformFit {
    let platform: String
    let score: Int
    let label: String
    let rationale: String
    let nextAction: String
}

enum ShortCreatorQualityCommand: String, CaseIterable {
    case fillHook = "fill-hook"
    case draftCopy = "draft-copy"
    case draftPlatformPack = "draft-platform-pack"
    case copyPlatformPackJSON = "copy-platform-pack-json"
    case savePlatformPackJSON = "save-platform-pack-json"
    case copyPolishPrompt = "copy-polish-prompt"
    case needsRefine = "needs-refine"

    var aliases: [String] {
        switch self {
        case .fillHook:
            return ["fill-hook", "hook"]
        case .draftCopy:
            return ["draft-copy", "platform-copy", "caption", "copy"]
        case .draftPlatformPack:
            return ["draft-platform-pack", "platform-pack", "draft-all-platforms", "all-platforms"]
        case .copyPlatformPackJSON:
            return ["copy-platform-pack-json", "platform-pack-json", "copy-platform-pack", "copy-pack-json"]
        case .savePlatformPackJSON:
            return ["save-platform-pack-json", "save-platform-pack", "write-platform-pack", "export-platform-pack-json"]
        case .copyPolishPrompt:
            return ["copy-polish-prompt", "polish-prompt", "prompt"]
        case .needsRefine:
            return ["needs-refine", "mark-refine", "refine"]
        }
    }

    var label: String {
        switch self {
        case .fillHook:
            return "Fill hook"
        case .draftCopy:
            return "Draft copy"
        case .draftPlatformPack:
            return "Draft platform pack"
        case .copyPlatformPackJSON:
            return "Copy platform pack JSON"
        case .savePlatformPackJSON:
            return "Save platform pack JSON"
        case .copyPolishPrompt:
            return "Copy polish prompt"
        case .needsRefine:
            return "Needs refine"
        }
    }

    var effect: String {
        switch self {
        case .fillHook:
            return "Fills a missing hook or preserves the existing hook and records the suggestion in notes."
        case .draftCopy:
            return "Drafts platform/caption metadata and preserves existing copy instead of overwriting it."
        case .draftPlatformPack:
            return "Creates or completes destination presets for the strongest platform fits without overwriting human-written fields."
        case .copyPlatformPackJSON:
            return "Copies the exact platform-pack preview payload for agents, Tower, or manual publishing review."
        case .savePlatformPackJSON:
            return "Writes the exact platform-pack payload as a local handoff JSON artifact and copies its path."
        case .copyPolishPrompt:
            return "Copies an agent-safe polishing prompt to the pasteboard."
        case .needsRefine:
            return "Marks the selected short refine and records the current risks in publish notes."
        }
    }

    var agentRoute: String {
        "GET /shorts_quality_action?action=\(rawValue)"
    }

    var payload: [String: Any] {
        [
            "id": rawValue,
            "label": label,
            "route": agentRoute,
            "effect": effect,
            "safety": "metadata-only"
        ]
    }

    static var safeActionCommands: [String] {
        allCases.map(\.agentRoute)
    }

    static func parse(_ rawAction: String?) -> ShortCreatorQualityCommand? {
        let normalized = (rawAction ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
            .replacingOccurrences(of: "_", with: "-")
        return allCases.first { command in
            command.aliases.contains(normalized)
        }
    }
}

struct ShortCreatorQualityBrief {
    let summary: String
    let firstDestination: String
    let durationBand: String
    let exportProofLabel: String
    let exportProofReady: Bool
    let score: Int
    let readinessLabel: String
    let recommendedReviewStatus: String
    let platformFits: [ShortCreatorPlatformFit]
    let strengths: [String]
    let risks: [String]
    let actions: [ShortCreatorQualityAction]
    let humanPrompt: String
    let agentPrompt: String

    var isReadyForPackaging: Bool {
        risks.isEmpty && exportProofReady
    }

    var primaryPlatformFit: ShortCreatorPlatformFit? {
        platformFits.first
    }

    var primaryPlatform: String {
        primaryPlatformFit?.platform ?? firstDestination
    }
}

enum ShortCreatorQuality {
    static func makeBrief(
        for clip: ShortClipCandidate,
        exportDuration: Double,
        exportExists: Bool,
        presets: [ShortDestinationPreset]
    ) -> ShortCreatorQualityBrief {
        let hook = clip.hookText.trimmingCharacters(in: .whitespacesAndNewlines)
        let caption = clip.captionDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        let overlay = clip.primaryOverlayText.trimmingCharacters(in: .whitespacesAndNewlines)
        let firstDestination = firstDestination(for: clip, presets: presets, duration: exportDuration)
        let durationBand = durationBand(exportDuration)
        let review = clip.reviewStatus.lowercased()

        var strengths: [String] = []
        var risks: [String] = []
        var actions: [ShortCreatorQualityAction] = []

        if exportExists {
            strengths.append("A real exported derivative exists, so this can be watched instead of imagined.")
        } else {
            risks.append("No local export proof yet.")
            actions.append(ShortCreatorQualityAction(
                title: "Export proof",
                detail: "Render the 9:16 short, then judge the real file for pacing, audio, and crop."
            ))
        }

        if !hook.isEmpty {
            strengths.append("Hook text exists: \(hook)")
        } else {
            risks.append("The opening promise is blank.")
            actions.append(ShortCreatorQualityAction(
                title: "Write the first-second promise",
                detail: "Draft a clear hook that says why a stranger should stop scrolling."
            ))
        }

        if !caption.isEmpty || !overlay.isEmpty {
            strengths.append("Sound-off viewing has caption/overlay metadata to work from.")
        } else {
            risks.append("No caption or overlay plan yet.")
            actions.append(ShortCreatorQualityAction(
                title: "Add sound-off support",
                detail: "Create caption/platform copy as metadata first; do not burn text over faces without review."
            ))
        }

        if (18...60).contains(exportDuration) {
            strengths.append("Duration sits in a strong test range for vertical feeds.")
        } else if (60...90).contains(exportDuration) {
            risks.append("This is a deeper short; it needs a stronger retention arc.")
            actions.append(ShortCreatorQualityAction(
                title: "Check pacing",
                detail: "Find one sentence or dead-air beat that can be tightened before export."
            ))
        } else if exportDuration > 90 {
            risks.append("This may be too long for the first short-form test.")
            actions.append(ShortCreatorQualityAction(
                title: "Split or sharpen",
                detail: "Consider turning this into two shorter clips unless the payoff is unusually strong."
            ))
        } else if exportDuration > 0 {
            risks.append("Very short clip; make sure it contains a complete idea, not just a moment.")
        } else {
            risks.append("No renderable SHOW range found for this recipe.")
            actions.append(ShortCreatorQualityAction(
                title: "Repair recipe",
                detail: "Add at least one SHOW segment before quality review."
            ))
        }

        if clip.segments.count > 1 {
            strengths.append("Multi-segment recipe can collapse multiple good moments into one coherent short.")
        }

        switch review {
        case "keep":
            strengths.append("Human review is marked Keep; this can move toward queueing after proof checks.")
        case "refine":
            risks.append("Marked Refine, so it should stay out of publishing until another edit pass.")
        case "reject":
            risks.append("Marked Reject; preserve it as learning data, not a publish candidate.")
        default:
            risks.append("No Keep/Refine/Reject decision yet.")
        }

        if presets.isEmpty {
            risks.append("No destination presets are attached.")
        } else {
            strengths.append("Destination metadata exists for \(presets.map(\.platform).joined(separator: ", ")).")
        }

        if actions.isEmpty {
            actions.append(ShortCreatorQualityAction(
                title: "Watch like a stranger",
                detail: "Confirm the first 3 seconds, payoff, crop, captions, and ending all earn the viewer's attention."
            ))
            actions.append(ShortCreatorQualityAction(
                title: "Package native",
                detail: "Write platform copy for \(firstDestination) and preserve receipts after posting."
            ))
        }

        let score = qualityScore(
            exportDuration: exportDuration,
            exportExists: exportExists,
            hookReady: !hook.isEmpty,
            soundOffReady: !caption.isEmpty || !overlay.isEmpty,
            reviewStatus: review,
            presetsReady: !presets.isEmpty,
            segmentCount: clip.segments.count
        )
        let readinessLabel = readinessLabel(score: score, reviewStatus: review, exportExists: exportExists)
        let recommendedReviewStatus = recommendedReviewStatus(score: score, reviewStatus: review, exportExists: exportExists)
        let platformFits = platformFits(
            for: clip,
            exportDuration: exportDuration,
            exportExists: exportExists,
            hookReady: !hook.isEmpty,
            soundOffReady: !caption.isEmpty || !overlay.isEmpty,
            presets: presets
        )
        let primaryPlatform = platformFits.first?.platform ?? firstDestination

        let summary = risks.isEmpty
            ? "Strong candidate. Watch the proof file, then package it natively for \(primaryPlatform)."
            : "\(readinessLabel). \(risks.count) quality check\(risks.count == 1 ? "" : "s") should be handled before this becomes a real post."

        return ShortCreatorQualityBrief(
            summary: summary,
            firstDestination: firstDestination,
            durationBand: durationBand,
            exportProofLabel: exportExists ? "Exported" : "Needs export",
            exportProofReady: exportExists,
            score: score,
            readinessLabel: readinessLabel,
            recommendedReviewStatus: recommendedReviewStatus,
            platformFits: platformFits,
            strengths: strengths,
            risks: risks,
            actions: actions,
            humanPrompt: "Would I stop scrolling, understand the point without context, and feel rewarded by the ending?",
            agentPrompt: "Inspect proof if present. Improve hook, captions, crop notes, \(primaryPlatform) copy, and receipt path without publishing."
        )
    }

    static func hookDraft(for clip: ShortClipCandidate) -> String {
        let title = clip.title.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanTitle = title.isEmpty ? "This moment" : title
        let text = "\(clip.title) \(clip.captionDraft) \(clip.primaryOverlayText) \(clip.notes)".lowercased()

        if text.contains("work") || text.contains("leadership") || text.contains("mentor") {
            return "The hidden rule that changes how you show up at work"
        }
        if text.contains("why") {
            return "The reason this matters is easier to miss than you think"
        }
        if text.contains("read") || text.contains("book") {
            return "This is the line I could not stop thinking about"
        }
        return cleanTitle
    }

    static func platformCaptionDraft(for clip: ShortClipCandidate, firstDestination: String) -> String {
        let hook = clip.hookText.trimmingCharacters(in: .whitespacesAndNewlines)
        let title = clip.title.trimmingCharacters(in: .whitespacesAndNewlines)
        let opener = hook.isEmpty ? (title.isEmpty ? "A quick High Ground Odyssey thought" : title) : hook
        let destination = firstDestination.lowercased()

        if destination.contains("linkedin") {
            return "\(opener)\n\nThe useful part is not just the idea. It is what it asks us to notice, practice, and carry into the next conversation.\n\n#Leadership #Coaching #HighGroundOdyssey"
        }
        if destination.contains("patreon") {
            return "\(opener)\n\nThis is one of the moments from the episode that deserves a second look. Full context and behind-the-scenes notes live with the High Ground Odyssey community."
        }
        return "\(opener)\n\nOne short moment from High Ground Odyssey. Save this if it gives you something useful to think about.\n\n#HighGroundOdyssey #Wisdom #Podcast"
    }

    static func platformTitleDraft(for clip: ShortClipCandidate, firstDestination: String) -> String {
        let hook = clip.hookText.trimmingCharacters(in: .whitespacesAndNewlines)
        let title = clip.title.trimmingCharacters(in: .whitespacesAndNewlines)
        let base = hook.isEmpty ? (title.isEmpty ? "High Ground Odyssey short" : title) : hook
        let destination = firstDestination.lowercased()

        if destination.contains("linkedin") {
            return base.count > 78 ? String(base.prefix(75)).trimmingCharacters(in: .whitespacesAndNewlines) + "..." : base
        }
        if destination.contains("patreon") {
            return title.isEmpty ? "High Ground Odyssey teaser" : title
        }
        return base.count > 60 ? String(base.prefix(57)).trimmingCharacters(in: .whitespacesAndNewlines) + "..." : base
    }

    static func platformHashtags(for clip: ShortClipCandidate, firstDestination: String) -> [String] {
        let destination = firstDestination.lowercased()
        let text = "\(clip.title) \(clip.hookText) \(clip.captionDraft) \(clip.primaryOverlayText) \(clip.notes)".lowercased()
        var tags: [String] = ["HighGroundOdyssey"]

        if text.contains("leadership") || text.contains("work") || text.contains("mentor") || text.contains("coach") {
            tags.append(contentsOf: ["Leadership", "Coaching"])
        }
        if text.contains("book") || text.contains("read") || text.contains("wisdom") {
            tags.append(contentsOf: ["Wisdom", "Books"])
        }

        if destination.contains("linkedin") {
            tags.append(contentsOf: ["Reflection", "ProfessionalDevelopment"])
        } else if destination.contains("instagram") || destination.contains("facebook") {
            tags.append(contentsOf: ["Reels", "PodcastClips"])
        } else if destination.contains("youtube") {
            tags.append(contentsOf: ["Shorts", "Podcast"])
        } else if destination.contains("patreon") {
            tags.append(contentsOf: ["BehindTheScenes", "Community"])
        }

        var seen = Set<String>()
        return tags.filter { tag in
            let key = tag.lowercased()
            guard !seen.contains(key) else { return false }
            seen.insert(key)
            return true
        }
    }

    static func destinationPresetDraft(for clip: ShortClipCandidate, platform: String) -> ShortDestinationPreset {
        ShortDestinationPreset(
            platform: platform,
            title: platformTitleDraft(for: clip, firstDestination: platform),
            caption: platformCaptionDraft(for: clip, firstDestination: platform),
            hashtags: platformHashtags(for: clip, firstDestination: platform),
            status: "drafted"
        )
    }

    static func platformPresetDrafts(
        for clip: ShortClipCandidate,
        brief: ShortCreatorQualityBrief,
        minimumScore: Int = 45,
        limit: Int = 5
    ) -> [ShortDestinationPreset] {
        var seen = Set<String>()
        return brief.platformFits
            .filter { fit in
                fit.score >= minimumScore || fit.platform == brief.primaryPlatform
            }
            .filter { fit in
                let key = fit.platform.lowercased()
                guard !seen.contains(key) else { return false }
                seen.insert(key)
                return true
            }
            .prefix(limit)
            .map { fit in
                destinationPresetDraft(for: clip, platform: fit.platform)
            }
    }

    static func agentPolishPrompt(for clip: ShortClipCandidate, brief: ShortCreatorQualityBrief, exportPath: String) -> String {
        let platformLines = brief.platformFits.prefix(5).map { fit in
            "- \(fit.platform): \(fit.score)/100 \(fit.label). \(fit.nextAction)"
        }.joined(separator: "\n")

        return """
        Polish this Quipsly short candidate without changing source media or publishing.

        Short: \(clip.title)
        Primary platform: \(brief.primaryPlatform)
        Original first destination guess: \(brief.firstDestination)
        Duration band: \(brief.durationBand)
        Export proof: \(exportPath)
        Review status: \(clip.reviewStatus)
        Export status: \(clip.exportStatus)
        Current hook: \(clip.hookText)
        Caption draft: \(clip.captionDraft)
        Overlay metadata: \(clip.primaryOverlayText)
        Quality risks: \(brief.risks.joined(separator: " | "))
        Platform fit:
        \(platformLines)

        Return safe metadata suggestions only:
        1. Three stronger hook options.
        2. One platform-native caption for \(brief.primaryPlatform).
        3. Crop/framing risks to inspect.
        4. Caption or overlay risks.
        5. Whether this should be Keep, Refine, or Reject, and why.

        Do not publish. Do not mutate timeline decisions. Do not touch source media.
        """
    }

    private static func firstDestination(
        for clip: ShortClipCandidate,
        presets: [ShortDestinationPreset],
        duration: Double
    ) -> String {
        let text = "\(clip.title) \(clip.hookText) \(clip.captionDraft) \(clip.primaryOverlayText)"
            .lowercased()
        if text.contains("leadership") || text.contains("work") || text.contains("coach") || text.contains("mentor") {
            return "LinkedIn"
        }
        if duration > 60,
           presets.contains(where: { $0.platform.lowercased().contains("patreon") }) {
            return "Patreon teaser"
        }
        if let youtube = presets.first(where: { $0.platform.lowercased().contains("youtube") }) {
            return youtube.platform
        }
        return presets.first?.platform ?? "YouTube Shorts"
    }

    private static func durationBand(_ duration: Double) -> String {
        switch duration {
        case ...0:
            return "Needs SHOW"
        case ...20:
            return "Quick punch"
        case ...45:
            return "Standard short"
        case ...90:
            return "Deep short"
        case ...180:
            return "Long short"
        default:
            return "Too long"
        }
    }

    private static func qualityScore(
        exportDuration: Double,
        exportExists: Bool,
        hookReady: Bool,
        soundOffReady: Bool,
        reviewStatus: String,
        presetsReady: Bool,
        segmentCount: Int
    ) -> Int {
        var score = 0
        if exportExists { score += 25 }
        if hookReady { score += 18 }
        if soundOffReady { score += 16 }
        if (18...60).contains(exportDuration) { score += 16 }
        if (60...90).contains(exportDuration) { score += 8 }
        if presetsReady { score += 10 }
        if segmentCount > 1 { score += 5 }

        switch reviewStatus {
        case "keep":
            score += 10
        case "refine":
            score -= 8
        case "reject":
            score -= 35
        default:
            break
        }

        if exportDuration <= 0 { score -= 30 }
        if exportDuration > 90 { score -= 14 }
        return min(100, max(0, score))
    }

    private static func readinessLabel(score: Int, reviewStatus: String, exportExists: Bool) -> String {
        if reviewStatus == "reject" {
            return "Learning sample"
        }
        if score >= 82 && exportExists {
            return "Ready to watch-package"
        }
        if score >= 62 {
            return "Promising candidate"
        }
        if score >= 40 {
            return "Needs refinement"
        }
        return "Needs construction"
    }

    private static func recommendedReviewStatus(score: Int, reviewStatus: String, exportExists: Bool) -> String {
        if reviewStatus == "reject" {
            return "reject"
        }
        if score >= 82 && exportExists {
            return "keep"
        }
        if score >= 40 {
            return "refine"
        }
        return "draft"
    }

    private static func platformFits(
        for clip: ShortClipCandidate,
        exportDuration: Double,
        exportExists: Bool,
        hookReady: Bool,
        soundOffReady: Bool,
        presets: [ShortDestinationPreset]
    ) -> [ShortCreatorPlatformFit] {
        let destinationText = (clip.destinations + presets.map(\.platform)).joined(separator: " ").lowercased()
        let contentText = "\(clip.title) \(clip.hookText) \(clip.captionDraft) \(clip.primaryOverlayText) \(clip.notes)".lowercased()
        let isWorkOrLeadership = contentText.contains("work")
            || contentText.contains("leadership")
            || contentText.contains("coach")
            || contentText.contains("mentor")
        let hasCompleteIdea = exportDuration >= 18
        let isFastVertical = exportDuration > 0 && exportDuration <= 60
        let isDeepContext = exportDuration > 45
        let multiSegment = clip.segments.count > 1

        let coreBonus = (exportExists ? 12 : 0)
            + (hookReady ? 10 : 0)
            + (soundOffReady ? 10 : 0)
            + (hasCompleteIdea ? 8 : -8)

        let youtubeScore = clampPlatformScore(
            42 + coreBonus
                + (isFastVertical ? 16 : -8)
                + (destinationText.contains("youtube") ? 6 : 0)
                + (multiSegment ? 4 : 0)
        )
        let reelsScore = clampPlatformScore(
            40 + coreBonus
                + (isFastVertical ? 15 : -10)
                + (soundOffReady ? 6 : -6)
                + (destinationText.contains("instagram") || destinationText.contains("facebook") ? 6 : 0)
        )
        let linkedInScore = clampPlatformScore(
            30 + coreBonus
                + (isWorkOrLeadership ? 22 : -6)
                + (isDeepContext ? 8 : 0)
                + (destinationText.contains("linkedin") ? 8 : 0)
        )
        let patreonScore = clampPlatformScore(
            32 + coreBonus
                + (isDeepContext ? 14 : 0)
                + (exportDuration > 90 ? 5 : 0)
                + (destinationText.contains("patreon") ? 8 : 0)
        )
        let hgoScore = clampPlatformScore(
            44 + coreBonus
                + (hasCompleteIdea ? 10 : -5)
                + (clip.captionDraft.isEmpty ? -3 : 5)
        )

        return [
            ShortCreatorPlatformFit(
                platform: "YouTube Shorts",
                score: youtubeScore,
                label: platformLabel(for: youtubeScore),
                rationale: isFastVertical ? "Best if the first second is clear and the payoff lands quickly." : "May need tightening before it behaves like a strong Shorts candidate.",
                nextAction: hookReady ? "Watch the first 3 seconds, then package title and caption." : "Write the first-second promise before exporting."
            ),
            ShortCreatorPlatformFit(
                platform: "Instagram/Facebook Reels",
                score: reelsScore,
                label: platformLabel(for: reelsScore),
                rationale: soundOffReady ? "Caption/overlay metadata gives it a chance in sound-off feeds." : "Needs sound-off support before this belongs in Reels.",
                nextAction: soundOffReady ? "Check face-safe crop and caption placement." : "Draft caption or overlay metadata, then review crop."
            ),
            ShortCreatorPlatformFit(
                platform: "LinkedIn",
                score: linkedInScore,
                label: platformLabel(for: linkedInScore),
                rationale: isWorkOrLeadership ? "The topic maps naturally to leadership, coaching, or work reflection." : "Only use here if the caption frames the practical lesson clearly.",
                nextAction: "Frame the lesson as one useful professional reflection, not a generic promo."
            ),
            ShortCreatorPlatformFit(
                platform: "Patreon teaser",
                score: patreonScore,
                label: platformLabel(for: patreonScore),
                rationale: isDeepContext ? "Deeper context can work as a community teaser." : "Might be too slight unless it points to a larger member-only conversation.",
                nextAction: "Add a clear reason supporters get more context or behind-the-scenes value."
            ),
            ShortCreatorPlatformFit(
                platform: "HighGroundOdyssey.com",
                score: hgoScore,
                label: platformLabel(for: hgoScore),
                rationale: "The website can preserve context better than vertical feeds, so complete ideas matter more than raw speed.",
                nextAction: "Pair the embed with book/episode context and a clean title."
            )
        ].sorted { lhs, rhs in
            lhs.score == rhs.score ? lhs.platform < rhs.platform : lhs.score > rhs.score
        }
    }

    private static func clampPlatformScore(_ score: Int) -> Int {
        min(100, max(0, score))
    }

    private static func platformLabel(for score: Int) -> String {
        switch score {
        case 82...:
            return "Strong fit"
        case 64...:
            return "Good test"
        case 45...:
            return "Needs framing"
        default:
            return "Hold for now"
        }
    }
}
