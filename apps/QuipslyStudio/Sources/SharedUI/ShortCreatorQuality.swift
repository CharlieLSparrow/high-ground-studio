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

struct ShortCreatorAttentionSignal {
    let id: String
    let name: String
    let score: Int
    let label: String
    let rationale: String
    let nextAction: String
}

struct ShortCreatorPlatformAttentionFix {
    let platform: String
    let priority: String
    let title: String
    let rationale: String
    let nextAction: String
}

struct ShortCreatorPublishReadiness {
    let label: String
    let summary: String
    let canQueue: Bool
    let missing: [String]
    let blockerSummary: String
    let nextAction: String
    let handoffMode: String
    let towerInstruction: String
}

struct ShortCreatorPlatformChecklistItem {
    let id: String
    let platform: String
    let label: String
    let detail: String
    let status: String
    let nextAction: String
}

struct ShortCreatorQualityPacketSummary {
    let headline: String
    let status: String
    let evidenceLevel: String
    let reason: String
    let safeActionLabel: String
    let nextSafeAction: String
    let agentInstruction: String
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
    let attentionScore: Int
    let attentionLabel: String
    let attentionSignals: [ShortCreatorAttentionSignal]
    let publishReadiness: ShortCreatorPublishReadiness
    let platformFits: [ShortCreatorPlatformFit]
    let strengths: [String]
    let risks: [String]
    let actions: [ShortCreatorQualityAction]
    let humanPrompt: String
    let agentPrompt: String

    var isReadyForPackaging: Bool {
        publishReadiness.canQueue
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

        let baseScore = qualityScore(
            exportDuration: exportDuration,
            exportExists: exportExists,
            hookReady: !hook.isEmpty,
            soundOffReady: !caption.isEmpty || !overlay.isEmpty,
            reviewStatus: review,
            presetsReady: !presets.isEmpty,
            segmentCount: clip.segments.count
        )
        let attentionSignals = attentionSignals(
            for: clip,
            exportDuration: exportDuration,
            exportExists: exportExists,
            hook: hook,
            caption: caption,
            overlay: overlay,
            reviewStatus: review,
            presets: presets
        )
        let attentionScore = attentionScore(for: attentionSignals)
        let attentionLabel = attentionLabel(for: attentionScore)
        let score = blendedQualityScore(baseScore: baseScore, attentionScore: attentionScore)
        let publishReadiness = publishReadiness(
            score: score,
            attentionScore: attentionScore,
            exportExists: exportExists,
            reviewStatus: review,
            hookReady: !hook.isEmpty,
            soundOffReady: !caption.isEmpty || !overlay.isEmpty,
            presetsReady: !presets.isEmpty,
            exportDuration: exportDuration
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
            ? "Strong candidate. \(attentionLabel). Watch the proof file, then package it natively for \(primaryPlatform)."
            : "\(readinessLabel). \(attentionLabel). \(risks.count) quality check\(risks.count == 1 ? "" : "s") should be handled before this becomes a real post."
        let weakestAttentionSignal = attentionSignals.min { lhs, rhs in
            lhs.score == rhs.score ? lhs.name < rhs.name : lhs.score < rhs.score
        }

        return ShortCreatorQualityBrief(
            summary: summary,
            firstDestination: firstDestination,
            durationBand: durationBand,
            exportProofLabel: exportExists ? "Exported" : "Needs export",
            exportProofReady: exportExists,
            score: score,
            readinessLabel: readinessLabel,
            recommendedReviewStatus: recommendedReviewStatus,
            attentionScore: attentionScore,
            attentionLabel: attentionLabel,
            attentionSignals: attentionSignals,
            publishReadiness: publishReadiness,
            platformFits: platformFits,
            strengths: strengths,
            risks: risks,
            actions: actions,
            humanPrompt: weakestAttentionSignal.map { signal in
                "Would I stop scrolling, understand the point without context, and feel rewarded by the ending? First check: \(signal.name.lowercased()) - \(signal.nextAction) Publish state: \(publishReadiness.label)."
            } ?? "Would I stop scrolling, understand the point without context, and feel rewarded by the ending?",
            agentPrompt: weakestAttentionSignal.map { signal in
                "Inspect proof if present. First improve \(signal.name.lowercased()): \(signal.nextAction) Then improve hook, captions, crop notes, \(primaryPlatform) copy, and receipt path without publishing. Publish readiness: \(publishReadiness.summary)"
            } ?? "Inspect proof if present. Improve hook, captions, crop notes, \(primaryPlatform) copy, and receipt path without publishing."
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

    static func platformAttentionFixes(
        for clip: ShortClipCandidate,
        brief: ShortCreatorQualityBrief,
        limit: Int = 6
    ) -> [ShortCreatorPlatformAttentionFix] {
        let weakSignalIds = Set(brief.attentionSignals.filter { $0.score < 68 }.map(\.id))
        let topPlatforms = Array(brief.platformFits.prefix(4).map(\.platform))
        let platforms = topPlatforms.isEmpty ? [brief.primaryPlatform] : topPlatforms
        var fixes: [ShortCreatorPlatformAttentionFix] = []

        for platform in platforms {
            let key = platform.lowercased()
            let platformPriority = platform == brief.primaryPlatform ? "primary" : "secondary"

            if weakSignalIds.contains("hook") {
                if key.contains("linkedin") {
                    fixes.append(ShortCreatorPlatformAttentionFix(
                        platform: platform,
                        priority: platformPriority,
                        title: "Frame the professional lesson first",
                        rationale: "LinkedIn needs the point of usefulness immediately, not a vague episode label.",
                        nextAction: "Rewrite the first line as: problem, insight, or practice a working adult can use today."
                    ))
                } else if key.contains("patreon") {
                    fixes.append(ShortCreatorPlatformAttentionFix(
                        platform: platform,
                        priority: platformPriority,
                        title: "Promise extra context",
                        rationale: "A Patreon teaser should make the deeper conversation feel worth joining.",
                        nextAction: "Open with what supporters get beyond the public clip: context, notes, or behind-the-scenes reasoning."
                    ))
                } else {
                    fixes.append(ShortCreatorPlatformAttentionFix(
                        platform: platform,
                        priority: platformPriority,
                        title: "Sharpen the first-second hook",
                        rationale: "Fast vertical feeds need an immediate stop signal before viewers understand the episode context.",
                        nextAction: "Turn the hook into a concrete question, tension, mistake, or promise."
                    ))
                }
            }

            if weakSignalIds.contains("sound-off") {
                fixes.append(ShortCreatorPlatformAttentionFix(
                    platform: platform,
                    priority: platformPriority,
                    title: "Make it work muted",
                    rationale: key.contains("highgroundodyssey")
                        ? "Website embeds can carry more context, but captions still make the clip easier to skim and quote."
                        : "Short-form feeds often begin muted, and current best tools treat captions as first-class packaging.",
                    nextAction: "Add platform caption copy and one face-safe on-screen phrase before publishing."
                ))
            }

            if weakSignalIds.contains("duration") {
                fixes.append(ShortCreatorPlatformAttentionFix(
                    platform: platform,
                    priority: platformPriority,
                    title: "Tighten the pacing window",
                    rationale: key.contains("patreon") || key.contains("linkedin")
                        ? "Longer clips can work here, but only if they feel like a complete mini-lesson."
                        : "Shorts/Reels-style feeds reward fast setup and a clean payoff.",
                    nextAction: "Cut preamble or split the recipe unless the payoff is strong enough to justify the length."
                ))
            }

            if weakSignalIds.contains("platform-pack") {
                fixes.append(ShortCreatorPlatformAttentionFix(
                    platform: platform,
                    priority: platformPriority,
                    title: "Package natively",
                    rationale: "Cross-posting the same title/caption everywhere leaves reach on the table.",
                    nextAction: "Generate platform-specific title, caption, hashtags, and posting note for this destination."
                ))
            }

            if weakSignalIds.contains("proof-review") {
                fixes.append(ShortCreatorPlatformAttentionFix(
                    platform: platform,
                    priority: platformPriority,
                    title: "Watch the proof",
                    rationale: "Metadata can find candidates, but the real exported file decides whether the crop, audio, captions, and ending work.",
                    nextAction: "Export locally, watch once like a stranger, then mark Keep, Refine, or Reject."
                ))
            }
        }

        if fixes.isEmpty {
            fixes.append(ShortCreatorPlatformAttentionFix(
                platform: brief.primaryPlatform,
                priority: "primary",
                title: "Final native polish",
                rationale: "The core attention checks look healthy; now the post should feel native to the destination.",
                nextAction: "Do one last pass on title, caption, crop, ending, and receipt path before handoff."
            ))
        }

        return Array(fixes.prefix(limit))
    }

    static func platformChecklistItems(
        for clip: ShortClipCandidate,
        brief: ShortCreatorQualityBrief,
        limit: Int = 8
    ) -> [ShortCreatorPlatformChecklistItem] {
        let platform = brief.primaryPlatform
        let hookReady = !clip.hookText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        let captionReady = !clip.captionDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        let overlayReady = !clip.primaryOverlayText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        let missing = Set(brief.publishReadiness.missing.map { $0.lowercased() })
        let platformPackReady = !missing.contains("platform-native destination pack")
        let reviewReady = !missing.contains("keep review decision")

        var items: [ShortCreatorPlatformChecklistItem] = [
            ShortCreatorPlatformChecklistItem(
                id: "proof-watch",
                platform: platform,
                label: "Proof watch",
                detail: "Judge the real exported file, not just the timeline metadata.",
                status: brief.exportProofReady ? "ready" : "missing",
                nextAction: brief.exportProofReady ? "Watch once for pacing, crop, audio, and ending." : "Export the 9:16 proof before any publish decision."
            ),
            ShortCreatorPlatformChecklistItem(
                id: "hook",
                platform: platform,
                label: "First-second hook",
                detail: "Make the first line tell a stranger why this moment is worth their attention.",
                status: hookReady ? "ready" : "missing",
                nextAction: hookReady ? "Confirm the first frame and caption support the hook." : "Write a concrete hook before package handoff."
            ),
            ShortCreatorPlatformChecklistItem(
                id: "sound-off",
                platform: platform,
                label: "Sound-off clarity",
                detail: "Captions and overlays make the short understandable before audio starts.",
                status: (captionReady || overlayReady) ? "ready" : "missing",
                nextAction: (captionReady || overlayReady) ? "Check that text is face-safe and readable." : "Add caption copy or one short on-screen phrase."
            ),
            ShortCreatorPlatformChecklistItem(
                id: "native-copy",
                platform: platform,
                label: "Native platform copy",
                detail: "Each destination needs its own title/caption/hashtag framing.",
                status: platformPackReady ? "ready" : "missing",
                nextAction: platformPackReady ? "Review title, caption, hashtags, and platform fit." : "Generate or draft the platform pack."
            ),
            ShortCreatorPlatformChecklistItem(
                id: "review-state",
                platform: platform,
                label: "Keep / Refine / Reject",
                detail: "A clear review decision prevents candidates from silently becoming posts.",
                status: reviewReady ? "ready" : "missing",
                nextAction: reviewReady ? "Keep status is present; preserve why it earned the queue." : "Watch the proof and choose Keep, Refine, or Reject."
            ),
            ShortCreatorPlatformChecklistItem(
                id: "crop-captions",
                platform: platform,
                label: "Crop and caption safe zone",
                detail: "Vertical clips need readable text and faces clear of platform UI.",
                status: "inspect",
                nextAction: "Inspect 9:16 framing for face position, lower-third collisions, and caption placement."
            ),
            ShortCreatorPlatformChecklistItem(
                id: "tower-handoff",
                platform: platform,
                label: "Tower handoff",
                detail: brief.publishReadiness.summary,
                status: brief.publishReadiness.canQueue ? "ready" : "hold",
                nextAction: brief.publishReadiness.towerInstruction
            )
        ]

        if platform.lowercased().contains("linkedin") {
            items.append(ShortCreatorPlatformChecklistItem(
                id: "linkedin-lesson",
                platform: platform,
                label: "Professional lesson",
                detail: "LinkedIn needs a clear practical takeaway, not just a podcast promo.",
                status: brief.primaryPlatformFit?.score ?? 0 >= 64 ? "ready" : "needs-framing",
                nextAction: "Frame the caption around one useful practice, leadership lesson, or coaching reflection."
            ))
        } else if platform.lowercased().contains("patreon") {
            items.append(ShortCreatorPlatformChecklistItem(
                id: "patreon-extra-context",
                platform: platform,
                label: "Supporter value",
                detail: "Patreon teasers should explain why the deeper version is worth joining.",
                status: "inspect",
                nextAction: "Add a line about what extra context, notes, or behind-the-scenes value supporters get."
            ))
        } else if platform.lowercased().contains("youtube") || platform.lowercased().contains("reels") || platform.lowercased().contains("instagram") || platform.lowercased().contains("facebook") {
            items.append(ShortCreatorPlatformChecklistItem(
                id: "vertical-feed-payoff",
                platform: platform,
                label: "Fast-feed payoff",
                detail: "Shorts/Reels need a clean payoff before the viewer's attention leaks away.",
                status: brief.attentionScore >= 68 ? "ready" : "needs-framing",
                nextAction: "Confirm the ending rewards the hook and does not trail off."
            ))
        }

        return Array(items.prefix(limit))
    }

    static func qualityPacketSummary(
        for clip: ShortClipCandidate,
        brief: ShortCreatorQualityBrief
    ) -> ShortCreatorQualityPacketSummary {
        let weakestSignal = brief.attentionSignals.min { lhs, rhs in
            lhs.score == rhs.score ? lhs.name < rhs.name : lhs.score < rhs.score
        }
        let title = clip.title.trimmingCharacters(in: .whitespacesAndNewlines)
        let shortName = title.isEmpty ? "Selected short" : title
        let status = brief.publishReadiness.canQueue ? "queue-candidate" : brief.publishReadiness.handoffMode
        let reviewStatus = clip.reviewStatus.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let evidenceLevel: String
        if brief.publishReadiness.canQueue {
            evidenceLevel = "queue-ready-proof"
        } else if brief.exportProofReady && reviewStatus == "keep" {
            evidenceLevel = "proof-with-keep-review"
        } else if brief.exportProofReady {
            evidenceLevel = "proof-backed"
        } else {
            evidenceLevel = "metadata-only"
        }
        let reason = brief.publishReadiness.canQueue
            ? "\(shortName) is a \(brief.attentionLabel.lowercased()) for \(brief.primaryPlatform), pending final watch."
            : brief.publishReadiness.blockerSummary
        let safeActionLabel: String
        switch brief.publishReadiness.handoffMode {
        case "ready-for-tower-queue":
            safeActionLabel = "Final watch, then Tower queue"
        case "review-before-queue":
            safeActionLabel = "Watch proof and review"
        case "learning-only":
            safeActionLabel = "Preserve as learning data"
        default:
            safeActionLabel = "Improve in Studio"
        }
        let nextSafeAction = weakestSignal?.nextAction ?? brief.publishReadiness.nextAction
        let agentInstruction = brief.publishReadiness.canQueue
            ? "Do not publish directly. Verify proof playback, crop, captions, ending, and native platform copy; then hand off to Tower scheduling."
            : "Do not publish or schedule. Improve the weakest item first, preserve metadata provenance, and regenerate the platform pack after changes."

        return ShortCreatorQualityPacketSummary(
            headline: "\(shortName): \(brief.publishReadiness.label)",
            status: status,
            evidenceLevel: evidenceLevel,
            reason: reason,
            safeActionLabel: safeActionLabel,
            nextSafeAction: nextSafeAction,
            agentInstruction: agentInstruction
        )
    }

    static func agentPolishPrompt(for clip: ShortClipCandidate, brief: ShortCreatorQualityBrief, exportPath: String) -> String {
        let platformLines = brief.platformFits.prefix(5).map { fit in
            "- \(fit.platform): \(fit.score)/100 \(fit.label). \(fit.nextAction)"
        }.joined(separator: "\n")
        let attentionLines = brief.attentionSignals.map { signal in
            "- \(signal.name): \(signal.score)/100 \(signal.label). \(signal.nextAction)"
        }.joined(separator: "\n")
        let platformFixLines = platformAttentionFixes(for: clip, brief: brief).map { fix in
            "- \(fix.platform) [\(fix.priority)]: \(fix.title). \(fix.nextAction)"
        }.joined(separator: "\n")
        let checklistLines = platformChecklistItems(for: clip, brief: brief).map { item in
            "- \(item.label) [\(item.status)]: \(item.nextAction)"
        }.joined(separator: "\n")
        let packetSummary = qualityPacketSummary(for: clip, brief: brief)

        return """
        Polish this Quipsly short candidate without changing source media or publishing.

        Short: \(clip.title)
        Packet summary: \(packetSummary.headline)
        Packet reason: \(packetSummary.reason)
        Next safe action: \(packetSummary.nextSafeAction)
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
        Attention signals:
        \(attentionLines)
        Platform-specific fixes:
        \(platformFixLines)
        Platform checklist:
        \(checklistLines)
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

    private static func attentionSignals(
        for clip: ShortClipCandidate,
        exportDuration: Double,
        exportExists: Bool,
        hook: String,
        caption: String,
        overlay: String,
        reviewStatus: String,
        presets: [ShortDestinationPreset]
    ) -> [ShortCreatorAttentionSignal] {
        let hasCaption = !caption.isEmpty
        let hasOverlay = !overlay.isEmpty
        let hookLooksSpecific = containsHookCue(hook)
        let platformCount = Set((clip.destinations + presets.map(\.platform)).map { $0.lowercased() }).count

        let hookSignal: ShortCreatorAttentionSignal = {
            if hook.isEmpty {
                return ShortCreatorAttentionSignal(
                    id: "hook",
                    name: "Opening hook",
                    score: 24,
                    label: "Missing stop signal",
                    rationale: "Most vertical tools optimize around the first second. This short has no explicit reason for a stranger to pause yet.",
                    nextAction: "Write one concrete promise, tension, or question before judging the clip."
                )
            }
            if hookLooksSpecific {
                return ShortCreatorAttentionSignal(
                    id: "hook",
                    name: "Opening hook",
                    score: 88,
                    label: "Clear stop signal",
                    rationale: "The hook has enough specificity or tension to test in a fast feed.",
                    nextAction: "Watch the first 3 seconds and make sure the video/caption supports the promise."
                )
            }
            return ShortCreatorAttentionSignal(
                id: "hook",
                name: "Opening hook",
                score: 62,
                label: "Usable but soft",
                rationale: "The short has hook text, but it may still read like a label instead of a reason to keep watching.",
                nextAction: "Make the first line more concrete: what changes, what hurts, what surprises, or what the viewer gets."
            )
        }()

        let soundOffSignal: ShortCreatorAttentionSignal = {
            if hasCaption && hasOverlay {
                return ShortCreatorAttentionSignal(
                    id: "sound-off",
                    name: "Sound-off clarity",
                    score: 86,
                    label: "Caption-ready",
                    rationale: "Caption and overlay metadata are both present, so the short has material for muted feeds.",
                    nextAction: "Check placement so text does not cover faces or important gestures."
                )
            }
            if hasCaption || hasOverlay {
                return ShortCreatorAttentionSignal(
                    id: "sound-off",
                    name: "Sound-off clarity",
                    score: 68,
                    label: "Partly ready",
                    rationale: "There is some sound-off metadata, but the platform packet still needs a cleaner caption/overlay pass.",
                    nextAction: "Add either platform caption copy or a short face-safe on-screen line."
                )
            }
            return ShortCreatorAttentionSignal(
                id: "sound-off",
                name: "Sound-off clarity",
                score: 28,
                label: "Needs text plan",
                rationale: "Vertical feeds often start muted. This short currently depends too much on audio-only context.",
                nextAction: "Draft caption text and one optional on-screen phrase before packaging."
            )
        }()

        let durationSignal: ShortCreatorAttentionSignal = {
            switch exportDuration {
            case ...0:
                return ShortCreatorAttentionSignal(
                    id: "duration",
                    name: "Pacing window",
                    score: 0,
                    label: "No SHOW range",
                    rationale: "There is no renderable short yet.",
                    nextAction: "Add or repair at least one SHOW segment."
                )
            case ..<18:
                return ShortCreatorAttentionSignal(
                    id: "duration",
                    name: "Pacing window",
                    score: 48,
                    label: "Very quick",
                    rationale: "This can work as a punchy moment, but it may not carry a complete idea.",
                    nextAction: "Confirm the payoff is understandable without surrounding episode context."
                )
            case ...45:
                return ShortCreatorAttentionSignal(
                    id: "duration",
                    name: "Pacing window",
                    score: 92,
                    label: "Native short",
                    rationale: "The length is strong for Shorts/Reels-style attention testing.",
                    nextAction: "Tighten only if the first sentence or ending drags."
                )
            case ...60:
                return ShortCreatorAttentionSignal(
                    id: "duration",
                    name: "Pacing window",
                    score: 80,
                    label: "Full short",
                    rationale: "This length can work if the payoff is clear and the middle does not sag.",
                    nextAction: "Watch for one removable breath, preamble, or repeated point."
                )
            case ...90:
                return ShortCreatorAttentionSignal(
                    id: "duration",
                    name: "Pacing window",
                    score: 58,
                    label: "Deep short",
                    rationale: "This is closer to a mini-lesson than a quick social hit.",
                    nextAction: "Use it for LinkedIn/Patreon or split it unless the story arc is excellent."
                )
            default:
                return ShortCreatorAttentionSignal(
                    id: "duration",
                    name: "Pacing window",
                    score: 34,
                    label: "Likely too long",
                    rationale: "The clip may be asking short-form feeds to do long-form work.",
                    nextAction: "Split it into smaller ideas or move it to a teaser/article embed."
                )
            }
        }()

        let platformSignal: ShortCreatorAttentionSignal = {
            if platformCount >= 3 {
                return ShortCreatorAttentionSignal(
                    id: "platform-pack",
                    name: "Platform-native pack",
                    score: 86,
                    label: "Ready to tailor",
                    rationale: "Multiple destination targets exist, so this can be packaged natively instead of cross-posted blindly.",
                    nextAction: "Review the top platform fit and adjust title/caption for that audience."
                )
            }
            if platformCount > 0 {
                return ShortCreatorAttentionSignal(
                    id: "platform-pack",
                    name: "Platform-native pack",
                    score: 64,
                    label: "Single-lane pack",
                    rationale: "At least one destination is known, but the short may need platform-specific variants.",
                    nextAction: "Generate presets for YouTube Shorts, Reels, LinkedIn, Patreon, and HGO before publication."
                )
            }
            return ShortCreatorAttentionSignal(
                id: "platform-pack",
                name: "Platform-native pack",
                score: 30,
                label: "No destination plan",
                rationale: "The short has not been translated into a native platform package yet.",
                nextAction: "Draft a platform pack before calling this publish-ready."
            )
        }()

        let proofSignal: ShortCreatorAttentionSignal = {
            if reviewStatus == "reject" {
                return ShortCreatorAttentionSignal(
                    id: "proof-review",
                    name: "Proof and review",
                    score: 12,
                    label: "Learning sample",
                    rationale: "Rejected clips are useful training data, not publishing candidates.",
                    nextAction: "Keep the metadata as a lesson and move to the next candidate."
                )
            }
            if exportExists && reviewStatus == "keep" {
                return ShortCreatorAttentionSignal(
                    id: "proof-review",
                    name: "Proof and review",
                    score: 92,
                    label: "Watched candidate",
                    rationale: "The short has both local proof and a Keep review state.",
                    nextAction: "Do a final caption/crop pass, then hand off to publishing."
                )
            }
            if exportExists {
                return ShortCreatorAttentionSignal(
                    id: "proof-review",
                    name: "Proof and review",
                    score: 72,
                    label: "Proof exists",
                    rationale: "A real file can be watched, but the human/agent review state is not Keep yet.",
                    nextAction: "Watch the proof and choose Keep, Refine, or Reject."
                )
            }
            return ShortCreatorAttentionSignal(
                id: "proof-review",
                name: "Proof and review",
                score: 36,
                label: "Needs proof watch",
                rationale: "The app should not trust metadata alone for a publishable short.",
                nextAction: "Export locally and inspect the real video before packaging."
            )
        }()

        return [hookSignal, soundOffSignal, durationSignal, platformSignal, proofSignal]
    }

    private static func publishReadiness(
        score: Int,
        attentionScore: Int,
        exportExists: Bool,
        reviewStatus: String,
        hookReady: Bool,
        soundOffReady: Bool,
        presetsReady: Bool,
        exportDuration: Double
    ) -> ShortCreatorPublishReadiness {
        var missing: [String] = []
        if exportDuration <= 0 {
            missing.append("renderable SHOW segment")
        }
        if !exportExists {
            missing.append("local proof export")
        }
        if reviewStatus != "keep" {
            missing.append("Keep review decision")
        }
        if !hookReady {
            missing.append("first-second hook")
        }
        if !soundOffReady {
            missing.append("caption or overlay plan")
        }
        if !presetsReady {
            missing.append("platform-native destination pack")
        }
        if attentionScore < 68 {
            missing.append("attention signal pass")
        }

        if reviewStatus == "reject" {
            return ShortCreatorPublishReadiness(
                label: "Do not queue",
                summary: "Rejected shorts stay useful as learning data, not publishing candidates.",
                canQueue: false,
                missing: missing.isEmpty ? ["selected short is rejected"] : missing,
                blockerSummary: "This short has been rejected. Keep it as useful learning data, but do not let it drift into the publishing queue.",
                nextAction: "Preserve the reason for rejection, then move to a stronger candidate.",
                handoffMode: "learning-only",
                towerInstruction: "Do not schedule. Keep this packet as rejected training/review evidence."
            )
        }

        if missing.isEmpty && score >= 82 {
            return ShortCreatorPublishReadiness(
                label: "Queue-ready after final watch",
                summary: "The short has proof, Keep review, hook, sound-off support, platform pack, and healthy attention signals.",
                canQueue: true,
                missing: [],
                blockerSummary: "No blocking production gaps are known. It still deserves one final watch because the viewer sees pixels and sound, not metadata.",
                nextAction: "Do one final watch for crop, captions, ending, and platform copy, then hand off to Tower.",
                handoffMode: "ready-for-tower-queue",
                towerInstruction: "Accept for scheduling only after the final human/agent watch confirms crop, captions, audio, ending, and platform copy."
            )
        }

        if exportExists && hookReady && soundOffReady && presetsReady {
            return ShortCreatorPublishReadiness(
                label: "Review-ready",
                summary: "The short has enough packaging to judge, but still needs review or attention cleanup before queueing.",
                canQueue: false,
                missing: missing,
                blockerSummary: missing.isEmpty
                    ? "This short has enough to review, but it has not earned a queue-ready state yet."
                    : "This short is close enough to review, but queueing should wait on: \(missing.prefix(3).joined(separator: ", ")).",
                nextAction: "Watch the proof file and resolve the missing items before publishing.",
                handoffMode: "review-before-queue",
                towerInstruction: "Keep visible in the review queue. Do not schedule until missing items are resolved and review status is Keep."
            )
        }

        return ShortCreatorPublishReadiness(
            label: "Prep-needed",
            summary: "This is still a production candidate, not a publishing candidate.",
            canQueue: false,
            missing: missing,
            blockerSummary: missing.isEmpty
                ? "This short still needs a production pass before it becomes safe to schedule."
                : "This short should stay in Studio until these pieces exist: \(missing.prefix(3).joined(separator: ", ")).",
            nextAction: missing.first.map { nextPrepAction(forMissingItem: $0) } ?? "Regenerate the platform pack after the next edit pass.",
            handoffMode: "production-prep",
            towerInstruction: "Do not schedule. Route back to Studio for export, hook, caption, review, or platform-pack work."
        )
    }

    private static func nextPrepAction(forMissingItem item: String) -> String {
        switch item.lowercased() {
        case "local proof export":
            return "Export a local proof, watch the real derivative, then regenerate the platform pack."
        case "keep review decision":
            return "Choose Keep, Refine, or Reject after watching the proof."
        case "first-second hook":
            return "Write the first-second hook, then regenerate the platform pack."
        case "caption or overlay plan":
            return "Add caption or face-safe overlay metadata before packaging."
        case "platform-native destination pack":
            return "Draft the platform-native destination pack."
        case "attention signal pass":
            return "Improve the weakest attention signal, then re-check the short."
        case "renderable show segment":
            return "Add or move a visible recipe segment before export."
        default:
            return "Add \(item), then regenerate the platform pack."
        }
    }

    private static func attentionScore(for signals: [ShortCreatorAttentionSignal]) -> Int {
        guard !signals.isEmpty else { return 0 }
        let total = signals.reduce(0) { $0 + $1.score }
        return min(100, max(0, Int((Double(total) / Double(signals.count)).rounded())))
    }

    private static func blendedQualityScore(baseScore: Int, attentionScore: Int) -> Int {
        let blended = (Double(baseScore) * 0.74) + (Double(attentionScore) * 0.26)
        return min(100, max(0, Int(blended.rounded())))
    }

    private static func attentionLabel(for score: Int) -> String {
        switch score {
        case 84...:
            return "Strong attention setup"
        case 68...:
            return "Good attention test"
        case 48...:
            return "Needs sharper packaging"
        default:
            return "Needs attention work"
        }
    }

    private static func containsHookCue(_ hook: String) -> Bool {
        let normalized = hook.lowercased()
        guard !normalized.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
        let cues = [
            "why", "how", "what", "when", "because", "before", "after",
            "rule", "mistake", "hidden", "truth", "secret", "lesson",
            "one thing", "never", "always", "stop", "start", "you", "?"
        ]
        return cues.contains { normalized.contains($0) }
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
