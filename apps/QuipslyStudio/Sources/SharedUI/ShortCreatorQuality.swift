import Foundation
import QuipslyVideoCore

struct ShortCreatorQualityAction {
    let title: String
    let detail: String
}

struct ShortCreatorCreativeReadiness {
    let score: Int
    let label: String
    let summary: String
    let nextAction: String
    let primaryBlocker: String
    let agentInstruction: String
    let hookStatus: String
    let pacingStatus: String
    let captionStatus: String
    let framingStatus: String
    let proofStatus: String
    let platformStatus: String
    let strengths: [String]
    let risks: [String]

    var payload: [String: Any] {
        [
            "score": score,
            "label": label,
            "summary": summary,
            "nextAction": nextAction,
            "primaryBlocker": primaryBlocker,
            "agentInstruction": agentInstruction,
            "hookStatus": hookStatus,
            "pacingStatus": pacingStatus,
            "captionStatus": captionStatus,
            "framingStatus": framingStatus,
            "proofStatus": proofStatus,
            "platformStatus": platformStatus,
            "strengths": strengths,
            "risks": risks,
            "truth": "Creative readiness is an explainable heuristic for review focus. It is not publication approval and does not mutate media."
        ]
    }
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

struct ShortCreatorQualityDimension {
    let id: String
    let name: String
    let score: Int
    let weight: Double
    let label: String
    let rationale: String
    let nextAction: String
    let evidence: [String]
}

struct ShortCreatorCutIntelligenceEvidence {
    let overlappedFindingCount: Int
    let highSeverityCount: Int
    let cadenceWarningCount: Int
    let jumpCutRiskCount: Int
    let reactionOpportunityCount: Int
    let nearestFindingLabels: [String]
    let summary: String
    let nextAction: String

    static let empty = ShortCreatorCutIntelligenceEvidence(
        overlappedFindingCount: 0,
        highSeverityCount: 0,
        cadenceWarningCount: 0,
        jumpCutRiskCount: 0,
        reactionOpportunityCount: 0,
        nearestFindingLabels: [],
        summary: "not-evaluated",
        nextAction: "Open Cut Intelligence if the edit feels odd; no selected-short overlap has been computed yet."
    )

    var hasRisk: Bool {
        highSeverityCount > 0 || cadenceWarningCount > 0 || jumpCutRiskCount > 0
    }

    var hasOpportunity: Bool {
        reactionOpportunityCount > 0
    }

    var payload: [String: Any] {
        [
            "overlappedFindingCount": overlappedFindingCount,
            "highSeverityCount": highSeverityCount,
            "cadenceWarningCount": cadenceWarningCount,
            "jumpCutRiskCount": jumpCutRiskCount,
            "reactionOpportunityCount": reactionOpportunityCount,
            "nearestFindingLabels": nearestFindingLabels,
            "summary": summary,
            "nextAction": nextAction,
            "hasRisk": hasRisk,
            "hasOpportunity": hasOpportunity
        ]
    }
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
    let creativeReadinessScore: Int
    let creativeReadinessLabel: String
    let creativeReadinessNextAction: String
    let reviewClass: String
    let reviewClassLabel: String
    let reviewClassExplanation: String
    let reviewPriority: Int
    let reason: String
    let safeActionLabel: String
    let nextSafeAction: String
    let agentInstruction: String
}

enum ShortCreatorQualityCommand: String, CaseIterable {
    case fillHook = "fill-hook"
    case sharpenHook = "sharpen-hook"
    case draftCopy = "draft-copy"
    case draftPlatformPack = "draft-platform-pack"
    case draftAllPlatformPacks = "draft-all-platform-packs"
    case copyPlatformPackJSON = "copy-platform-pack-json"
    case savePlatformPackJSON = "save-platform-pack-json"
    case copyPolishPrompt = "copy-polish-prompt"
    case needsRefine = "needs-refine"

    var aliases: [String] {
        switch self {
        case .fillHook:
            return ["fill-hook", "hook"]
        case .sharpenHook:
            return ["sharpen-hook", "stronger-hook", "improve-hook", "hook-sharpen"]
        case .draftCopy:
            return ["draft-copy", "platform-copy", "caption", "copy"]
        case .draftPlatformPack:
            return ["draft-platform-pack", "platform-pack", "draft-all-platforms", "all-platforms"]
        case .draftAllPlatformPacks:
            return ["draft-all-platform-packs", "draft-platform-packs-all", "platform-pack-all", "all-short-platform-packs", "batch-platform-pack"]
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
        case .sharpenHook:
            return "Sharpen hook"
        case .draftCopy:
            return "Draft copy"
        case .draftPlatformPack:
            return "Draft native variants"
        case .draftAllPlatformPacks:
            return "Draft all native variants"
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
        case .sharpenHook:
            return "Rewrites a label-like hook into a stronger stop-scroll promise while preserving the previous hook in notes."
        case .draftCopy:
            return "Drafts platform/caption metadata and preserves existing copy instead of overwriting it."
        case .draftPlatformPack:
            return "Creates or completes required native platform variants without overwriting human-written titles, captions, hashtags, or notes."
        case .draftAllPlatformPacks:
            return "Creates or completes required native variants for every short in the active sequence without overwriting human-written fields."
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
    let dimensions: [ShortCreatorQualityDimension]
    let publishReadiness: ShortCreatorPublishReadiness
    let platformFits: [ShortCreatorPlatformFit]
    let platformVariantTargets: [String]
    let missingPlatformVariantTargets: [String]
    let reviewClass: String
    let reviewClassLabel: String
    let reviewClassExplanation: String
    let reviewPriority: Int
    let nextReviewAction: String
    let creativeReadiness: ShortCreatorCreativeReadiness
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
        presets: [ShortDestinationPreset],
        cutEvidence: ShortCreatorCutIntelligenceEvidence = .empty
    ) -> ShortCreatorQualityBrief {
        let hook = clip.hookText.trimmingCharacters(in: .whitespacesAndNewlines)
        let caption = clip.captionDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        let overlay = clip.primaryOverlayText.trimmingCharacters(in: .whitespacesAndNewlines)
        let firstDestination = firstDestination(for: clip, presets: presets, duration: exportDuration)
        let durationBand = durationBand(exportDuration)
        let review = clip.reviewStatus.lowercased()
        let variantTargets = platformVariantTargets(for: clip, presets: presets)
        let missingVariantTargets = missingPlatformVariantTargets(for: clip, presets: presets)

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
            actions.append(ShortCreatorQualityAction(
                title: "Check the bridge",
                detail: "Watch the segment join as a viewer, not as an editor. If the thought jumps too hard, add a breath, reaction cover, caption bridge, or split it into separate shorts."
            ))
        } else if exportDuration >= 20 {
            actions.append(ShortCreatorQualityAction(
                title: "Prove the mini-arc",
                detail: "Name the hook, middle turn, and payoff. If the clip is only a good quote with no turn, tighten or add context before posting."
            ))
        }
        actions.append(ShortCreatorQualityAction(
            title: "Name the short-form story contract",
            detail: "Before platform handoff, write the opening promise, the middle turn, and the payoff. If one is missing, refine the recipe instead of trusting a clever quote."
        ))

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

        if missingVariantTargets.isEmpty {
            strengths.append("Native platform variants are covered for \(variantTargets.joined(separator: ", ")).")
        } else {
            risks.append("Missing native platform variants for \(missingVariantTargets.joined(separator: ", ")).")
            actions.append(ShortCreatorQualityAction(
                title: "Draft native variants",
                detail: "Create platform-specific title, caption, hashtag, and posting note variants before this becomes a real cross-post candidate."
            ))
        }

        if cutEvidence.hasRisk {
            risks.append("Cut Intelligence found \(cutEvidence.overlappedFindingCount) timing/cut issue(s) inside this short recipe.")
            actions.append(ShortCreatorQualityAction(
                title: "Review cut craft",
                detail: cutEvidence.nextAction
            ))
        } else if cutEvidence.hasOpportunity {
            strengths.append("Cut Intelligence found \(cutEvidence.reactionOpportunityCount) reaction/J-L opportunity inside this short.")
            actions.append(ShortCreatorQualityAction(
                title: "Use the reaction wisely",
                detail: "A reaction or J/L move can make this feel alive. Keep it only if it clarifies the thought or makes the transition feel human."
            ))
        } else if cutEvidence.summary == "clear" {
            strengths.append("No selected-short overlap with current Cut Intelligence warnings.")
        }

        actions.append(ShortCreatorQualityAction(
            title: "Platform-native check",
            detail: "Review the first frame, first spoken beat, caption placement, ending, and loop/replay value for \(firstDestination). Preserve receipts separately from readiness."
        ))

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
        let dimensions = qualityDimensions(
            for: clip,
            exportDuration: exportDuration,
            exportExists: exportExists,
            hook: hook,
            caption: caption,
            overlay: overlay,
            reviewStatus: review,
            presets: presets,
            attentionSignals: attentionSignals,
            cutEvidence: cutEvidence
        )
        let score = weightedQualityScore(for: dimensions)
        let publishReadiness = publishReadiness(
            score: score,
            attentionScore: attentionScore,
            exportExists: exportExists,
            reviewStatus: review,
            hookReady: !hook.isEmpty,
            soundOffReady: !caption.isEmpty || !overlay.isEmpty,
            presetsReady: !presets.isEmpty,
            exportDuration: exportDuration,
            missingVariantTargets: missingVariantTargets
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
        let reviewClass = shortReviewClass(
            score: score,
            attentionScore: attentionScore,
            exportExists: exportExists,
            reviewStatus: review,
            hookReady: !hook.isEmpty,
            soundOffReady: !caption.isEmpty || !overlay.isEmpty,
            missingVariantTargets: missingVariantTargets,
            cutEvidence: cutEvidence,
            exportDuration: exportDuration
        )
        let creativeReadiness = creativeReadiness(
            for: clip,
            exportDuration: exportDuration,
            exportExists: exportExists,
            hook: hook,
            caption: caption,
            overlay: overlay,
            reviewStatus: review,
            missingVariantTargets: missingVariantTargets,
            cutEvidence: cutEvidence
        )

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
            dimensions: dimensions,
            publishReadiness: publishReadiness,
            platformFits: platformFits,
            platformVariantTargets: variantTargets,
            missingPlatformVariantTargets: missingVariantTargets,
            reviewClass: reviewClass.id,
            reviewClassLabel: reviewClass.label,
            reviewClassExplanation: reviewClass.explanation,
            reviewPriority: reviewClass.priority,
            nextReviewAction: reviewClass.nextAction,
            creativeReadiness: creativeReadiness,
            strengths: strengths,
            risks: risks,
            actions: actions,
            humanPrompt: weakestAttentionSignal.map { signal in
                "Would I stop scrolling, understand the point without context, and feel rewarded by the ending? First check: \(signal.name.lowercased()) - \(signal.nextAction) Then name the mini-arc: hook, turn, payoff. Publish state: \(publishReadiness.label). Missing variants: \(missingVariantTargets.isEmpty ? "none" : missingVariantTargets.joined(separator: ", "))."
            } ?? "Would I stop scrolling, understand the point without context, and feel rewarded by the ending? Name the mini-arc: hook, turn, payoff.",
            agentPrompt: weakestAttentionSignal.map { signal in
                "Inspect proof if present. First improve \(signal.name.lowercased()): \(signal.nextAction) Then verify hook -> turn -> payoff, face-safe captions, crop notes, \(primaryPlatform) copy, missing native variants (\(missingVariantTargets.isEmpty ? "none" : missingVariantTargets.joined(separator: ", "))), and receipt path without publishing. Preserve whole source media and keep edits as metadata. Publish readiness: \(publishReadiness.summary)"
            } ?? "Inspect proof if present. Verify hook -> turn -> payoff, captions, crop notes, \(primaryPlatform) copy, missing native variants, and receipt path without publishing. Preserve whole source media and keep edits as metadata."
        )
    }

    private static func shortReviewClass(
        score: Int,
        attentionScore: Int,
        exportExists: Bool,
        reviewStatus: String,
        hookReady: Bool,
        soundOffReady: Bool,
        missingVariantTargets: [String],
        cutEvidence: ShortCreatorCutIntelligenceEvidence,
        exportDuration: Double
    ) -> (id: String, label: String, explanation: String, priority: Int, nextAction: String) {
        let review = reviewStatus.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()

        if review == "reject" {
            return (
                id: "learning_data_only",
                label: "Learning data only",
                explanation: "This short is marked Reject. Keep it as useful edit feedback, not a publication candidate.",
                priority: 10,
                nextAction: "Preserve the recipe and notes as learning data; do not move it toward publishing."
            )
        }

        if exportDuration <= 0 {
            return (
                id: "repair_recipe_first",
                label: "Repair recipe first",
                explanation: "The short does not currently have a renderable SHOW range, so quality review would be imaginary.",
                priority: 95,
                nextAction: "Add or repair the SHOW segment before judging hook, pacing, caption, or platform fit."
            )
        }

        if cutEvidence.hasRisk {
            return (
                id: "cut_craft_review",
                label: "Cut craft review",
                explanation: "Cut Intelligence found jump-cut, cadence, or high-severity timing risk inside this short.",
                priority: 88,
                nextAction: cutEvidence.nextAction
            )
        }

        if review == "refine" {
            return (
                id: "needs_refinement",
                label: "Needs refinement",
                explanation: "A human or agent marked this short Refine, so keep improving it before proof or platform handoff.",
                priority: 84,
                nextAction: "Resolve the latest review note, then re-watch the proof before changing to Keep."
            )
        }

        if !exportExists {
            return (
                id: "needs_export_proof",
                label: "Needs export proof",
                explanation: "The recipe may be promising, but nobody should judge publishability without watching the actual rendered 9:16 file.",
                priority: 76,
                nextAction: "Render a proof export, then review pacing, crop, captions, and ending from the real file."
            )
        }

        if !hookReady {
            return (
                id: "needs_hook",
                label: "Needs hook",
                explanation: "The short needs a clearer first-second promise before it can compete in a feed.",
                priority: 72,
                nextAction: "Write a concrete hook that names the tension, question, mistake, or payoff."
            )
        }

        if !soundOffReady {
            return (
                id: "needs_caption_framing",
                label: "Needs caption/framing",
                explanation: "The short needs face-safe caption or overlay metadata so it can work without sound.",
                priority: 68,
                nextAction: "Draft sound-off caption/overlay metadata and verify text will not land on faces."
            )
        }

        if !missingVariantTargets.isEmpty {
            return (
                id: "needs_platform_variants",
                label: "Needs platform variants",
                explanation: "The core short is close, but native posting packets are missing for one or more destinations.",
                priority: 60,
                nextAction: "Draft native title, caption, hashtags, and posting note variants for \(missingVariantTargets.joined(separator: ", "))."
            )
        }

        if exportDuration > 90 {
            return (
                id: "too_long_for_first_test",
                label: "Too long for first test",
                explanation: "This may still be useful, but it is long for a first vertical-feed experiment and needs a retention check.",
                priority: 58,
                nextAction: "Watch for a natural split point or tighten one section unless the payoff clearly earns the runtime."
            )
        }

        if score >= 78 && attentionScore >= 75 && review == "keep" {
            return (
                id: "ready_for_human_posting_review",
                label: "Ready for human posting review",
                explanation: "The short has proof, Keep review, decent attention score, and no currently attached cut-craft warning.",
                priority: 40,
                nextAction: "Do a final human watch, then hand it to Tower/manual publishing with receipts tracked separately."
            )
        }

        if score >= 68 && attentionScore >= 65 {
            return (
                id: "promising_review_candidate",
                label: "Promising review candidate",
                explanation: "The short has enough structure to be worth a human watch, but it is not yet a confident handoff.",
                priority: 52,
                nextAction: "Watch once like a stranger and decide Keep, Refine, or Reject with a short note."
            )
        }

        return (
            id: "needs_watch_pass",
            label: "Needs watch pass",
            explanation: "The short has a recipe, but its attention and quality signals are not strong enough to trust without review.",
            priority: 55,
            nextAction: "Watch the candidate, then improve the weakest hook, pacing, caption, crop, or payoff signal."
        )
    }

    private static func creativeReadiness(
        for clip: ShortClipCandidate,
        exportDuration: Double,
        exportExists: Bool,
        hook: String,
        caption: String,
        overlay: String,
        reviewStatus: String,
        missingVariantTargets: [String],
        cutEvidence: ShortCreatorCutIntelligenceEvidence
    ) -> ShortCreatorCreativeReadiness {
        var score = 0
        var strengths: [String] = []
        var risks: [String] = []

        let hookStatus: String
        if hook.isEmpty {
            hookStatus = "missing"
            risks.append("Hook is missing.")
            score += 8
        } else if containsHookCue(hook) {
            hookStatus = "specific"
            strengths.append("Hook has a concrete stop signal.")
            score += 22
        } else {
            hookStatus = "soft"
            risks.append("Hook exists but may read like a label.")
            score += 15
        }

        let pacingStatus: String
        if exportDuration <= 0 {
            pacingStatus = "no-renderable-range"
            risks.append("Recipe has no renderable SHOW duration.")
        } else if exportDuration < 12 {
            pacingStatus = "too-short"
            risks.append("Duration may be too short for a complete idea.")
            score += 8
        } else if exportDuration <= 45 {
            pacingStatus = "strong-feed-window"
            strengths.append("Duration is in a strong first-test short range.")
            score += 18
        } else if exportDuration <= 75 {
            pacingStatus = "deeper-short"
            strengths.append("Duration can work if payoff and retention are strong.")
            risks.append("Longer short needs a clear arc and payoff.")
            score += 13
        } else {
            pacingStatus = "long-retention-risk"
            risks.append("Long for a first vertical-feed test.")
            score += 7
        }

        let captionStatus: String
        if !caption.isEmpty && !overlay.isEmpty {
            captionStatus = "caption-and-overlay"
            strengths.append("Caption and overlay metadata support muted viewing.")
            score += 18
        } else if !caption.isEmpty || !overlay.isEmpty {
            captionStatus = "partial-sound-off"
            strengths.append("Some sound-off support exists.")
            risks.append("Sound-off support needs one more pass.")
            score += 12
        } else {
            captionStatus = "missing"
            risks.append("No caption or overlay plan yet.")
            score += 4
        }

        let visualText = "\(clip.notes) \(clip.publishNotes) \(overlay) \(caption)"
            .lowercased()
        let visualCueWords = ["crop", "framing", "face", "face-safe", "headroom", "9:16", "vertical", "caption-safe", "text-safe", "visual proof", "proof watched"]
        let hasVisualCue = visualCueWords.contains { visualText.contains($0) }
        let framingStatus: String
        if hasVisualCue {
            framingStatus = "review-evidence"
            strengths.append("Visual/framing evidence is present in notes or copy metadata.")
            score += 14
        } else if !overlay.isEmpty || !caption.isEmpty {
            framingStatus = "needs-face-safe-check"
            risks.append("Text exists, but face-safe placement still needs review.")
            score += 9
        } else {
            framingStatus = "needs-visual-plan"
            risks.append("No explicit framing or face-safe text plan yet.")
            score += 5
        }

        let proofStatus: String
        if exportExists {
            proofStatus = "export-proof-exists"
            strengths.append("A rendered proof exists.")
            score += 16
        } else {
            proofStatus = "metadata-only"
            risks.append("No rendered proof yet.")
            score += 4
        }

        let platformStatus: String
        if missingVariantTargets.isEmpty {
            platformStatus = "native-variants-covered"
            strengths.append("Native platform variant targets are covered.")
            score += 12
        } else {
            platformStatus = "missing-native-variants"
            risks.append("Missing native variants for \(missingVariantTargets.joined(separator: ", ")).")
            score += 5
        }

        if cutEvidence.hasRisk {
            risks.append("Cut craft risk overlaps this short.")
            score -= 10
        } else if cutEvidence.hasOpportunity {
            strengths.append("Cut Intelligence found a possible reaction/J-L opportunity.")
            score += 3
        }

        if reviewStatus == "reject" {
            risks.append("Marked Reject; preserve as learning data.")
            score = min(score, 28)
        } else if reviewStatus == "refine" {
            risks.append("Marked Refine; improve before handoff.")
            score = min(score, 68)
        } else if reviewStatus == "keep" {
            strengths.append("Marked Keep, pending proof/platform truth.")
            score += 4
        }

        let boundedScore = min(100, max(0, score))
        let label: String
        if boundedScore >= 80 {
            label = "Creative-ready"
        } else if boundedScore >= 65 {
            label = "Promising, needs polish"
        } else if boundedScore >= 45 {
            label = "Needs creative pass"
        } else {
            label = "Repair before judging"
        }

        let nextAction = risks.first.map { risk in
            switch risk {
            case let text where text.lowercased().contains("hook"):
                return "Sharpen the first-second hook into a concrete promise, tension, or question."
            case let text where text.lowercased().contains("caption") || text.lowercased().contains("overlay") || text.lowercased().contains("sound-off"):
                return "Add face-safe caption/overlay metadata before judging feed readiness."
            case let text where text.lowercased().contains("rendered proof") || text.lowercased().contains("proof"):
                return "Create or locate a rendered 9:16 proof, then watch it like a stranger."
            case let text where text.lowercased().contains("long"):
                return "Find a natural split or tighten one beat unless the payoff clearly earns the runtime."
            case let text where text.lowercased().contains("cut craft"):
                return cutEvidence.nextAction
            default:
                return "Resolve: \(risk)"
            }
        } ?? "Do a final watch for hook, pacing, crop, captions, payoff, and platform-native copy."

        let summary = risks.isEmpty
            ? "Creative-ready enough for a human watch and platform handoff prep."
            : "\(label). \(risks.count) creative readiness issue\(risks.count == 1 ? "" : "s") should be handled before this feels publication-real."
        let primaryBlocker = risks.first ?? "none"
        let agentInstruction = primaryBlocker == "none"
            ? "Do a final human-feeling watch pass, then preserve platform-native metadata and receipt boundaries."
            : "Fix the creative blocker first: \(nextAction) Preserve the source media and short recipe; update metadata only."

        return ShortCreatorCreativeReadiness(
            score: boundedScore,
            label: label,
            summary: summary,
            nextAction: nextAction,
            primaryBlocker: primaryBlocker,
            agentInstruction: agentInstruction,
            hookStatus: hookStatus,
            pacingStatus: pacingStatus,
            captionStatus: captionStatus,
            framingStatus: framingStatus,
            proofStatus: proofStatus,
            platformStatus: platformStatus,
            strengths: strengths,
            risks: risks
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

    static func sharpenedHookDraft(for clip: ShortClipCandidate) -> String {
        let title = clip.title.trimmingCharacters(in: .whitespacesAndNewlines)
        let existing = clip.hookText.trimmingCharacters(in: .whitespacesAndNewlines)
        let text = "\(clip.title) \(clip.hookText) \(clip.captionDraft) \(clip.primaryOverlayText) \(clip.notes) \(clip.publishNotes)"
            .lowercased()

        if text.contains("opening") || text.contains("rhythm") {
            return "The first minute of a conversation can decide whether anyone feels safe enough to keep going"
        }
        if text.contains("work") || text.contains("leadership") || text.contains("mentor") || text.contains("coach") {
            return "The leadership habit that makes hard conversations feel less scary"
        }
        if text.contains("why") {
            return "The reason this matters is hiding in the part most people skip"
        }
        if text.contains("read") || text.contains("book") || text.contains("wisdom") {
            return "One book line that changed how I want to show up for people"
        }
        if !existing.isEmpty, !containsHookCue(existing) {
            return "The useful part of this moment is not obvious until you slow down"
        }
        if !title.isEmpty, !containsHookCue(title) {
            return "This quiet moment has more going on than it looks like"
        }
        return existing.isEmpty ? hookDraft(for: clip) : existing
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
        let lowerOpener = opener.lowercased()
        if lowerOpener.contains("first minute") || lowerOpener.contains("conversation") || lowerOpener.contains("safe") {
            return "\(opener)\n\nIf people do not feel safe early, they stop bringing you the truth. This moment is about slowing down enough to make room for the real conversation.\n\n#HighGroundOdyssey #Conversation #Leadership"
        }
        if lowerOpener.contains("lead") || lowerOpener.contains("work") || lowerOpener.contains("coach") {
            return "\(opener)\n\nThe hard part of leadership is not having the perfect answer. It is creating enough trust that the real conversation can happen.\n\n#HighGroundOdyssey #Leadership #Coaching"
        }
        return "\(opener)\n\nOne short moment from High Ground Odyssey. Save this if it gives you something useful to think about.\n\n#HighGroundOdyssey #Wisdom #Podcast"
    }

    static func isGenericCaptionDraft(_ caption: String) -> Bool {
        let normalized = caption.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalized.isEmpty else { return false }
        return normalized.contains("one short moment from high ground odyssey")
            || normalized.contains("save this if it gives you something useful to think about")
            || normalized.hasPrefix("episode ") && normalized.contains("rough short")
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

    static func overlayDraft(for clip: ShortClipCandidate) -> String {
        let hook = clip.hookText.trimmingCharacters(in: .whitespacesAndNewlines)
        let title = clip.title.trimmingCharacters(in: .whitespacesAndNewlines)
        let text = "\(clip.title) \(clip.hookText) \(clip.captionDraft) \(clip.notes)".lowercased()

        if text.contains("first minute") || text.contains("opening") || text.contains("conversation") {
            return "The first minute matters"
        }
        if text.contains("work") || text.contains("leadership") || text.contains("coach") || text.contains("mentor") {
            return "Lead with less fear"
        }
        if text.contains("why") {
            return "The why is hiding here"
        }
        let base = hook.isEmpty ? (title.isEmpty ? "A useful moment" : title) : hook
        return base.count > 34 ? String(base.prefix(31)).trimmingCharacters(in: .whitespacesAndNewlines) + "..." : base
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
        var platforms: [String] = []

        func addPlatform(_ platform: String) {
            let key = platformVariantKey(platform)
            guard !key.isEmpty, seen.insert(key).inserted else { return }
            platforms.append(platform)
        }

        brief.platformFits
            .filter { fit in
                fit.score >= minimumScore || fit.platform == brief.primaryPlatform
            }
            .forEach { fit in
                addPlatform(fit.platform)
            }

        brief.platformVariantTargets.forEach(addPlatform)

        return platforms
            .prefix(limit)
            .map { platform in
                destinationPresetDraft(for: clip, platform: platform)
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
        let visualReviewRecorded = hasVisualReviewEvidence(in: clip)
        let editFlowEvidence = editFlowEvidence(in: clip)
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
                id: "edit-flow",
                platform: platform,
                label: "Audio and edit flow",
                detail: "Shorts need human cadence, not just clean metadata.",
                status: editFlowEvidence.listenRecorded
                    ? (editFlowEvidence.hasConcern ? "needs-refine" : "listened")
                    : (editFlowEvidence.scanRecorded ? "technical-scan-only" : "needs-listen"),
                nextAction: editFlowEvidence.listenRecorded
                    ? (editFlowEvidence.hasConcern ? "Refine the awkward timing note before Keep." : "Preserve the listen-through note and move to final review.")
                    : (editFlowEvidence.scanRecorded ? "Technical scan exists. Still listen before Keep/Refine/Reject." : "Listen for rushed cuts, robotic pacing, awkward jumps, missing reaction cover, or sync drift.")
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
                nextAction: platformPackReady ? "Review title, caption, hashtags, and platform fit." : "Draft native variants before queueing this short."
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
                status: visualReviewRecorded ? "visual-proof-recorded" : "inspect",
                nextAction: visualReviewRecorded
                    ? "Visual contact-sheet proof exists. Continue to listen-through and final Keep/Refine/Reject."
                    : "Inspect 9:16 framing for face position, lower-third collisions, and caption placement."
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
        let creativeNextAction = brief.creativeReadiness.nextAction.trimmingCharacters(in: .whitespacesAndNewlines)
        let resolvedNextSafeAction = brief.creativeReadiness.score < 80 && !creativeNextAction.isEmpty
            ? creativeNextAction
            : nextSafeAction
        let agentInstruction: String
        if brief.creativeReadiness.score < 65 {
            agentInstruction = "Do not publish or schedule. First resolve creative readiness: \(brief.creativeReadiness.agentInstruction) Then regenerate the native variant pack after changes."
        } else if brief.publishReadiness.canQueue {
            agentInstruction = "Do not publish directly. Verify proof playback, crop, captions, ending, and native platform copy; then hand off to Tower scheduling."
        } else {
            agentInstruction = "Do not publish or schedule. Improve the weakest item first, preserve metadata provenance, and regenerate the native variant pack after changes. Creative focus: \(brief.creativeReadiness.nextAction)"
        }

        return ShortCreatorQualityPacketSummary(
            headline: "\(shortName): \(brief.publishReadiness.label)",
            status: status,
            evidenceLevel: evidenceLevel,
            creativeReadinessScore: brief.creativeReadiness.score,
            creativeReadinessLabel: brief.creativeReadiness.label,
            creativeReadinessNextAction: brief.creativeReadiness.nextAction,
            reviewClass: brief.reviewClass,
            reviewClassLabel: brief.reviewClassLabel,
            reviewClassExplanation: brief.reviewClassExplanation,
            reviewPriority: brief.reviewPriority,
            reason: reason,
            safeActionLabel: safeActionLabel,
            nextSafeAction: resolvedNextSafeAction,
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
        Creative readiness: \(brief.creativeReadiness.label) (\(brief.creativeReadiness.score)/100). \(brief.creativeReadiness.summary)
        Creative next action: \(brief.creativeReadiness.nextAction)
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

    private static func weightedQualityScore(for dimensions: [ShortCreatorQualityDimension]) -> Int {
        let totalWeight = dimensions.reduce(0.0) { $0 + max(0, $1.weight) }
        guard totalWeight > 0 else { return 0 }
        let weighted = dimensions.reduce(0.0) { partial, dimension in
            partial + (Double(max(0, min(100, dimension.score))) * max(0, dimension.weight))
        }
        let normalized = max(0.0, min(100.0, weighted / totalWeight))
        return Int(round(normalized))
    }

    private static func qualityDimensions(
        for clip: ShortClipCandidate,
        exportDuration: Double,
        exportExists: Bool,
        hook: String,
        caption: String,
        overlay: String,
        reviewStatus: String,
        presets: [ShortDestinationPreset],
        attentionSignals: [ShortCreatorAttentionSignal],
        cutEvidence: ShortCreatorCutIntelligenceEvidence = .empty
    ) -> [ShortCreatorQualityDimension] {
        let hasHook = !hook.isEmpty
        let hasCaption = !caption.isEmpty
        let hasOverlay = !overlay.isEmpty
        let hasSoundOffPlan = hasCaption || hasOverlay
        let hasPreset = !presets.isEmpty || !clip.destinations.isEmpty
        let variantTargets = platformVariantTargets(for: clip, presets: presets)
        let missingVariantTargets = missingPlatformVariantTargets(for: clip, presets: presets)
        let review = reviewStatus.lowercased()
        let segmentCount = max(1, clip.segments.count)
        let durationLabel = durationBand(exportDuration)
        let hookSignal = attentionSignals.first { $0.id == "hook" }
        let soundOffSignal = attentionSignals.first { $0.id == "sound-off" }
        let visualReviewRecorded = hasVisualReviewEvidence(in: clip)
        let editFlowEvidence = editFlowEvidence(in: clip)

        let proofScore: Int
        let proofLabel: String
        let proofNext: String
        if exportExists && review == "keep" {
            proofScore = 92
            proofLabel = "Proof watched path"
            proofNext = "Do one final watch for crop, audio, captions, ending, and platform native copy."
        } else if exportExists {
            proofScore = 72
            proofLabel = "Export proof exists"
            proofNext = "Watch the exported file and mark Keep, Refine, or Reject."
        } else {
            proofScore = 30
            proofLabel = "Metadata only"
            proofNext = "Export a local proof before making a publishing decision."
        }

        let durationScore: Int
        let durationNext: String
        switch exportDuration {
        case 18...42:
            durationScore = 94
            durationNext = "Keep the promise tight; this is a strong vertical-short window."
        case 8..<18:
            durationScore = 76
            durationNext = "Confirm the idea still has enough context to stand alone."
        case 42...65:
            durationScore = 70
            durationNext = "Tighten any slow setup unless the payoff is clearly worth it."
        case 65...90:
            durationScore = 52
            durationNext = "Treat this as a deep short and make sure the arc earns the length."
        case let value where value <= 0:
            durationScore = 12
            durationNext = "Repair the short recipe so it has at least one renderable SHOW range."
        default:
            durationScore = 32
            durationNext = "Split the recipe or sharpen it into a shorter, clearer idea."
        }

        let platformScore = hasPreset ? 78 : 34
        let platformVariantScore: Int = {
            guard !variantTargets.isEmpty else { return 44 }
            if missingVariantTargets.isEmpty { return 88 }
            let covered = max(0, variantTargets.count - missingVariantTargets.count)
            return max(32, min(82, 38 + Int((Double(covered) / Double(variantTargets.count)) * 44)))
        }()
        let editFlowScore: Int
        let editFlowLabel: String
        let editFlowNext: String
        if editFlowEvidence.listenRecorded && editFlowEvidence.hasConcern {
            editFlowScore = 46
            editFlowLabel = "Listen found a flow concern"
            editFlowNext = "Refine the timing, reaction cover, J-cut/L-cut, or jump-cut handling named in the listen note."
        } else if editFlowEvidence.listenRecorded {
            editFlowScore = 84
            editFlowLabel = "Flow listened"
            editFlowNext = "Preserve the listen-through evidence and make the final Keep/Refine/Reject call."
        } else if cutEvidence.hasRisk {
            editFlowScore = cutEvidence.highSeverityCount > 0 ? 42 : 52
            editFlowLabel = "Cut craft needs review"
            editFlowNext = cutEvidence.nextAction
        } else if editFlowEvidence.scanRecorded && editFlowEvidence.hasConcern {
            editFlowScore = 44
            editFlowLabel = "Technical scan found a flow concern"
            editFlowNext = "Review the scan note, refine the suspected timing issue, then listen before Keep."
        } else if editFlowEvidence.scanRecorded {
            editFlowScore = cutEvidence.summary == "clear" ? 68 : 62
            editFlowLabel = cutEvidence.summary == "clear" ? "Technical scan clear" : "Technical scan only"
            editFlowNext = cutEvidence.summary == "clear"
                ? "No current selected-short Cut Intelligence warnings. Still listen once for cadence before Keep/Refine/Reject."
                : "Use the scan as triage only. Listen for cadence and awkward cuts before Keep/Refine/Reject."
        } else if cutEvidence.hasOpportunity {
            editFlowScore = 58
            editFlowLabel = "Craft opportunity"
            editFlowNext = cutEvidence.nextAction
        } else if exportExists {
            editFlowScore = 50
            editFlowLabel = "Needs listen-through"
            editFlowNext = "Listen for cadence, awkward jumps, over-tight silence, sync drift, and whether a reaction cover would help."
        } else {
            editFlowScore = 28
            editFlowLabel = "No audio proof"
            editFlowNext = "Export a derivative before judging audio flow."
        }

        let reviewScore: Int
        let reviewLabel: String
        let reviewNext: String
        switch review {
        case "keep":
            reviewScore = 90
            reviewLabel = "Human keep"
            reviewNext = "Preserve the reason it earned Keep and route through Tower when proof checks pass."
        case "refine":
            reviewScore = 48
            reviewLabel = "Needs refine"
            reviewNext = "Keep it out of publishing queues until the next edit pass."
        case "reject":
            reviewScore = 12
            reviewLabel = "Learning only"
            reviewNext = "Preserve as edit-learning data; do not promote."
        default:
            reviewScore = 42
            reviewLabel = "Unreviewed"
            reviewNext = "Watch the proof and choose Keep, Refine, or Reject."
        }

        let coherenceScore: Int
        let coherenceLabel: String
        let coherenceNext: String
        if segmentCount == 1 {
            coherenceScore = 78
            coherenceLabel = "Single idea path"
            coherenceNext = "Confirm the clip has setup, turn, and payoff without outside context."
        } else if segmentCount <= 3 {
            coherenceScore = 70
            coherenceLabel = "Multi-moment recipe"
            coherenceNext = "Check that the stitched moments feel intentional, not like a highlight pile."
        } else {
            coherenceScore = 50
            coherenceLabel = "Complex recipe"
            coherenceNext = "Consider splitting into simpler shorts unless the combined arc is obvious."
        }

        return [
            ShortCreatorQualityDimension(
                id: "proof",
                name: "Proof and review",
                score: proofScore,
                weight: 0.18,
                label: proofLabel,
                rationale: exportExists
                    ? "A real derivative exists, so quality can be judged from evidence instead of imagination."
                    : "The candidate is still only timeline metadata. That is useful, but not enough for publishing.",
                nextAction: proofNext,
                evidence: [
                    "exportExists=\(exportExists)",
                    "reviewStatus=\(reviewStatus.isEmpty ? "draft" : reviewStatus)"
                ]
            ),
            ShortCreatorQualityDimension(
                id: "hook",
                name: "Opening hook",
                score: hookSignal?.score ?? (hasHook ? 62 : 24),
                weight: 0.17,
                label: hookSignal?.label ?? (hasHook ? "Hook present" : "Missing stop signal"),
                rationale: hookSignal?.rationale ?? "The first second decides whether a stranger gives the clip a chance.",
                nextAction: hookSignal?.nextAction ?? (hasHook ? "Watch the first 3 seconds and make the promise concrete." : "Write one concrete promise, tension, or question."),
                evidence: hasHook ? ["hook=\(hook)"] : ["hook=missing"]
            ),
            ShortCreatorQualityDimension(
                id: "sound-off",
                name: "Sound-off clarity",
                score: soundOffSignal?.score ?? (hasSoundOffPlan ? 68 : 28),
                weight: 0.14,
                label: soundOffSignal?.label ?? (hasSoundOffPlan ? "Text plan present" : "Needs text plan"),
                rationale: soundOffSignal?.rationale ?? "Many viewers encounter vertical video muted or distracted.",
                nextAction: soundOffSignal?.nextAction ?? "Add caption copy or a short face-safe on-screen phrase.",
                evidence: [
                    "caption=\(hasCaption ? "present" : "missing")",
                    "overlay=\(hasOverlay ? "present" : "missing")"
                ]
            ),
            ShortCreatorQualityDimension(
                id: "duration",
                name: "Pacing window",
                score: durationScore,
                weight: 0.12,
                label: durationLabel,
                rationale: "Duration is not a rule, but it controls how much setup and payoff a feed viewer will tolerate.",
                nextAction: durationNext,
                evidence: [String(format: "duration=%.1fs", exportDuration)]
            ),
            ShortCreatorQualityDimension(
                id: "platform-pack",
                name: "Native platform pack",
                score: platformScore,
                weight: 0.10,
                label: hasPreset ? "Destination metadata present" : "No platform pack",
                rationale: "The same clip needs different framing for Shorts, Reels, Facebook, LinkedIn, Patreon, and the site.",
                nextAction: hasPreset ? "Review title, caption, hashtags, and destination-specific note." : "Draft at least one native destination pack.",
                evidence: [
                    "destinations=\((clip.destinations + presets.map(\.platform)).joined(separator: ", "))"
                ]
            ),
            ShortCreatorQualityDimension(
                id: "platform-variants",
                name: "Platform variants",
                score: platformVariantScore,
                weight: 0.08,
                label: missingVariantTargets.isEmpty ? "Native variants covered" : "Variant gaps",
                rationale: "Cross-posting should adapt the same short to each destination instead of pretending one generic caption is native everywhere.",
                nextAction: missingVariantTargets.isEmpty
                    ? "Review each variant for platform tone, then keep receipts separate from readiness."
                    : "Draft missing variants for \(missingVariantTargets.joined(separator: ", ")).",
                evidence: [
                    "targets=\(variantTargets.joined(separator: ", "))",
                    "missing=\(missingVariantTargets.isEmpty ? "none" : missingVariantTargets.joined(separator: ", "))"
                ]
            ),
            ShortCreatorQualityDimension(
                id: "edit-flow",
                name: "Audio and edit flow",
                score: editFlowScore,
                weight: 0.10,
                label: editFlowLabel,
                rationale: "Good podcast shorts should keep human cadence. The app should not reward robotic silence chopping, awkward jumps, or missing reaction cover just because the export exists.",
                nextAction: editFlowNext,
                evidence: [
                    "listenThrough=\(editFlowEvidence.listenRecorded ? "recorded" : "missing")",
                    "technicalScan=\(editFlowEvidence.scanRecorded ? "recorded" : "missing")",
                    "cutOverlap=\(cutEvidence.overlappedFindingCount)",
                    "cutRisk=\(cutEvidence.hasRisk ? "true" : "false")",
                    "cutSummary=\(cutEvidence.summary)",
                    "flowConcern=\(editFlowEvidence.hasConcern ? "true" : "false")",
                    "summary=\(editFlowEvidence.summary)"
                ]
            ),
            ShortCreatorQualityDimension(
                id: "human-review",
                name: "Human review state",
                score: reviewScore,
                weight: 0.13,
                label: reviewLabel,
                rationale: "Quality scoring should guide review, not silently approve publishing.",
                nextAction: reviewNext,
                evidence: ["reviewStatus=\(reviewStatus.isEmpty ? "draft" : reviewStatus)"]
            ),
            ShortCreatorQualityDimension(
                id: "coherence",
                name: "Self-contained idea",
                score: coherenceScore,
                weight: 0.08,
                label: coherenceLabel,
                rationale: "A good short should feel like one complete mini-thought even when it uses multiple recipe segments.",
                nextAction: coherenceNext,
                evidence: ["segmentCount=\(segmentCount)"]
            ),
            ShortCreatorQualityDimension(
                id: "framing",
                name: "Crop and caption safety",
                score: visualReviewRecorded ? 82 : (exportExists ? 66 : 45),
                weight: 0.05,
                label: visualReviewRecorded ? "Visual proof recorded" : (exportExists ? "Inspect visually" : "Needs export proof"),
                rationale: "Framing, faces, lower thirds, captions, and platform UI cannot be trusted from metadata alone.",
                nextAction: visualReviewRecorded
                    ? "Do not re-litigate crop from metadata. Continue to listen-through, hook polish, and Keep/Refine/Reject."
                    : (exportExists ? "Generate or inspect contact-sheet/proof frames for face and text collisions." : "Export a 9:16 proof before judging visual safety."),
                evidence: [
                    "format=\(clip.format.rawValue)",
                    "visualReview=\(visualReviewRecorded ? "recorded" : "missing")"
                ]
            )
        ]
    }

    private static func hasVisualReviewEvidence(in clip: ShortClipCandidate) -> Bool {
        let text = "\(clip.notes) \(clip.publishNotes)".lowercased()
        return text.contains("visual review")
            || text.contains("contact sheet inspected")
            || text.contains("visual proof recorded")
            || text.contains("face-safe")
    }

    private static func editFlowEvidence(in clip: ShortClipCandidate) -> (listenRecorded: Bool, scanRecorded: Bool, hasConcern: Bool, summary: String) {
        let text = "\(clip.notes) \(clip.publishNotes)".lowercased()
        let lines = text
            .components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        let listenRecorded = text.contains("listen-through:")
            || text.contains("listen-through-ok:")
            || text.contains("listened-through:")
            || text.contains("audio-reviewed:")
            || text.contains("audio-review-ok:")
        let scanRecorded = text.contains("edit-flow-scan:")
            || text.contains("edit-flow-scan-ok:")
            || text.contains("edit-flow-scan-concern:")
            || text.contains("technical-flow-scan:")
        let hasConcern = lines.contains { line in
            line.contains("edit-flow-scan-concern:")
                || line.contains("listen-through-concern:")
                || line.contains("audio-review-concern:")
                || line.contains("flow-concern:")
                || line.contains("needs-refine:")
                || line.contains("refine-required:")
                || (line.contains("flow concern") && !line.contains("no obvious") && !line.contains("still listen"))
        }
        let summary: String
        if listenRecorded && hasConcern {
            summary = "listen-recorded-with-concern"
        } else if listenRecorded {
            summary = "listen-recorded"
        } else if scanRecorded && hasConcern {
            summary = "technical-scan-with-concern"
        } else if scanRecorded {
            summary = "technical-scan-recorded"
        } else {
            summary = "missing"
        }
        return (listenRecorded, scanRecorded, hasConcern, summary)
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
                nextAction: "Draft native platform variants before calling this publish-ready."
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
        exportDuration: Double,
        missingVariantTargets: [String]
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
        if !missingVariantTargets.isEmpty {
            missing.append("native platform variants: \(missingVariantTargets.joined(separator: ", "))")
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
                summary: "The short has proof, Keep review, hook, sound-off support, native platform variants, and healthy attention signals.",
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
            nextAction: missing.first.map { nextPrepAction(forMissingItem: $0) } ?? "Regenerate the native variant pack after the next edit pass.",
            handoffMode: "production-prep",
            towerInstruction: "Do not schedule. Route back to Studio for export, hook, caption, review, or platform-pack work."
        )
    }

    private static func nextPrepAction(forMissingItem item: String) -> String {
        switch item.lowercased() {
        case "local proof export":
            return "Export a local proof, watch the real derivative, then regenerate the native variant pack."
        case "keep review decision":
            return "Choose Keep, Refine, or Reject after watching the proof."
        case "first-second hook":
            return "Write the first-second hook, then regenerate the native variant pack."
        case "caption or overlay plan":
            return "Add caption or face-safe overlay metadata before packaging."
        case "platform-native destination pack":
            return "Draft the platform-native destination pack."
        case let value where value.hasPrefix("native platform variants"):
            return "Draft the missing native variants, then regenerate the native variant pack."
        case "attention signal pass":
            return "Improve the weakest attention signal, then re-check the short."
        case "renderable show segment":
            return "Add or move a visible recipe segment before export."
        default:
            return "Add \(item), then regenerate the native variant pack."
        }
    }

    private static func attentionScore(for signals: [ShortCreatorAttentionSignal]) -> Int {
        guard !signals.isEmpty else { return 0 }
        let total = signals.reduce(0) { $0 + $1.score }
        return min(100, max(0, Int((Double(total) / Double(signals.count)).rounded())))
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
            "one thing", "never", "always", "stop", "start", "you", "?",
            "decide", "decides", "decision", "safe", "safety", "conversation",
            "change", "changes", "feel", "notice", "miss", "hard", "scary",
            "keep going", "show up", "matters", "practice"
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

    private static func platformVariantTargets(for clip: ShortClipCandidate, presets: [ShortDestinationPreset]) -> [String] {
        let contentText = "\(clip.title) \(clip.hookText) \(clip.captionDraft) \(clip.primaryOverlayText) \(clip.notes)".lowercased()
        let destinationText = (clip.destinations + presets.map(\.platform)).joined(separator: " ").lowercased()
        var targets: [String] = ["YouTube Shorts", "Instagram/Facebook Reels", "HighGroundOdyssey.com"]

        let leadershipOrWork = contentText.contains("work")
            || contentText.contains("leadership")
            || contentText.contains("coach")
            || contentText.contains("mentor")
            || destinationText.contains("linkedin")
        if leadershipOrWork {
            targets.append("LinkedIn")
        }

        if destinationText.contains("patreon")
            || contentText.contains("supporter")
            || contentText.contains("behind the scenes")
            || contentText.contains("extra context") {
            targets.append("Patreon teaser")
        }

        return uniquePlatformNames(targets)
    }

    private static func missingPlatformVariantTargets(for clip: ShortClipCandidate, presets: [ShortDestinationPreset]) -> [String] {
        let existingKeys = Set((clip.destinations + presets.map(\.platform)).map(platformVariantKey))
        return platformVariantTargets(for: clip, presets: presets).filter { target in
            !existingKeys.contains(platformVariantKey(target))
        }
    }

    private static func uniquePlatformNames(_ platforms: [String]) -> [String] {
        var seen = Set<String>()
        var ordered: [String] = []
        for platform in platforms {
            let key = platformVariantKey(platform)
            if seen.insert(key).inserted {
                ordered.append(platform)
            }
        }
        return ordered
    }

    private static func platformVariantKey(_ platform: String) -> String {
        let normalized = platform
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        if normalized.contains("youtube") || normalized.contains("short") {
            return "youtube-shorts"
        }
        if normalized.contains("instagram") || normalized.contains("facebook") || normalized.contains("reel") {
            return "reels"
        }
        if normalized.contains("linkedin") {
            return "linkedin"
        }
        if normalized.contains("patreon") {
            return "patreon"
        }
        if normalized.contains("highground") || normalized.contains("high ground") || normalized.contains("hgo") || normalized.contains("website") {
            return "hgo-site"
        }
        return normalized.replacingOccurrences(of: " ", with: "-")
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
