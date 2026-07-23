import Foundation

public enum CutIntelligenceMode: String, Codable, CaseIterable, Sendable {
    case warmConversation = "warm-conversation"
    case tightYouTube = "tight-youtube"
    case shortsEnergy = "shorts-energy"
    case documentaryThoughtful = "documentary-thoughtful"
    case chaoticFunButLegible = "chaotic-fun-but-legible"
}

public struct CutIntelligenceReport: Codable, Equatable, Sendable {
    public var model: String
    public var version: String
    public var generatedAt: Date
    public var sequenceId: UUID
    public var sequenceTitle: String
    public var sequenceDuration: Double
    public var cadenceMode: CutIntelligenceMode
    public var status: String
    public var summary: CutIntelligenceSummary
    public var cutTypeCounts: [String: Int]
    public var findings: [CutIntelligenceFinding]
    public var reactionOpportunities: [CutIntelligenceFinding]
    public var jumpCutRisks: [CutIntelligenceFinding]
    public var cadenceWarnings: [CutIntelligenceFinding]
    public var recipes: [CutIntelligenceRecipe]
    public var craftProfile: CutIntelligenceCraftProfile
    public var nextActions: [String]
    public var truth: String

    public init(
        model: String = "quipsly-cut-intelligence-report",
        version: String = "2026-07-17.v5",
        generatedAt: Date = Date(),
        sequenceId: UUID,
        sequenceTitle: String,
        sequenceDuration: Double,
        cadenceMode: CutIntelligenceMode = .warmConversation,
        status: String,
        summary: CutIntelligenceSummary,
        cutTypeCounts: [String: Int],
        findings: [CutIntelligenceFinding],
        reactionOpportunities: [CutIntelligenceFinding],
        jumpCutRisks: [CutIntelligenceFinding],
        cadenceWarnings: [CutIntelligenceFinding],
        recipes: [CutIntelligenceRecipe],
        craftProfile: CutIntelligenceCraftProfile,
        nextActions: [String],
        truth: String = "Read-only analysis over whole synced source lanes, transcript timing, and SHOW/SKIP metadata. It does not mutate media or edit decisions."
    ) {
        self.model = model
        self.version = version
        self.generatedAt = generatedAt
        self.sequenceId = sequenceId
        self.sequenceTitle = sequenceTitle
        self.sequenceDuration = sequenceDuration
        self.cadenceMode = cadenceMode
        self.status = status
        self.summary = summary
        self.cutTypeCounts = cutTypeCounts
        self.findings = findings
        self.reactionOpportunities = reactionOpportunities
        self.jumpCutRisks = jumpCutRisks
        self.cadenceWarnings = cadenceWarnings
        self.recipes = recipes
        self.craftProfile = craftProfile
        self.nextActions = nextActions
        self.truth = truth
    }

    public var agentPayload: [String: Any] {
        [
            "model": model,
            "version": version,
            "generatedAt": ISO8601DateFormatter().string(from: generatedAt),
            "sequenceId": sequenceId.uuidString,
            "sequenceTitle": sequenceTitle,
            "sequenceDuration": sequenceDuration,
            "cadenceMode": cadenceMode.rawValue,
            "status": status,
            "summary": summary.agentPayload,
            "cutTypeCounts": cutTypeCounts,
            "findings": findings.map(\.agentPayload),
            "reactionOpportunities": reactionOpportunities.map(\.agentPayload),
            "jumpCutRisks": jumpCutRisks.map(\.agentPayload),
            "cadenceWarnings": cadenceWarnings.map(\.agentPayload),
            "recipeCount": recipes.count,
            "recipes": recipes.map(\.agentPayload),
            "recipeReviewClassCounts": Dictionary(grouping: recipes, by: { $0.reviewClass }).mapValues { $0.count },
            "recipeReviewQueue": recipes
                .sorted { left, right in
                    if left.reviewPriority == right.reviewPriority {
                        return left.sequenceTime < right.sequenceTime
                    }
                    return left.reviewPriority > right.reviewPriority
                }
                .map(\.reviewQueuePayload),
            "craftProfile": craftProfile.agentPayload,
            "nextActions": nextActions,
            "truth": truth
        ]
    }
}

public struct CutIntelligenceSummary: Codable, Equatable, Sendable {
    public var visualDecisionCount: Int
    public var visualBoundaryCount: Int
    public var transcriptSegmentCount: Int
    public var estimatedCutsPerMinute: Double
    public var reactionOpportunityCount: Int
    public var jumpCutRiskCount: Int
    public var cadenceWarningCount: Int
    public var humanRhythmStatus: String
    public var humanRhythmExplanation: String

    public var agentPayload: [String: Any] {
        [
            "visualDecisionCount": visualDecisionCount,
            "visualBoundaryCount": visualBoundaryCount,
            "transcriptSegmentCount": transcriptSegmentCount,
            "estimatedCutsPerMinute": estimatedCutsPerMinute,
            "reactionOpportunityCount": reactionOpportunityCount,
            "jumpCutRiskCount": jumpCutRiskCount,
            "cadenceWarningCount": cadenceWarningCount,
            "humanRhythmStatus": humanRhythmStatus,
            "humanRhythmExplanation": humanRhythmExplanation
        ]
    }
}

public struct CutTechniqueGuidance: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var title: String
    public var bestUse: String
    public var avoidWhen: String
    public var audioMove: String
    public var visualMove: String
    public var reviewQuestion: String
    public var agentRule: String

    public init(
        id: String,
        title: String,
        bestUse: String,
        avoidWhen: String,
        audioMove: String,
        visualMove: String,
        reviewQuestion: String,
        agentRule: String
    ) {
        self.id = id
        self.title = title
        self.bestUse = bestUse
        self.avoidWhen = avoidWhen
        self.audioMove = audioMove
        self.visualMove = visualMove
        self.reviewQuestion = reviewQuestion
        self.agentRule = agentRule
    }

    public var agentPayload: [String: Any] {
        [
            "id": id,
            "title": title,
            "bestUse": bestUse,
            "avoidWhen": avoidWhen,
            "audioMove": audioMove,
            "visualMove": visualMove,
            "reviewQuestion": reviewQuestion,
            "agentRule": agentRule,
            "truth": "Craft guidance only. It helps explain or review metadata decisions; it does not mutate media, timing, exports, or publication state."
        ]
    }

    public static func defaultPlaybook() -> [CutTechniqueGuidance] {
        [
            CutTechniqueGuidance(
                id: "reaction-cover",
                title: "Reaction cover",
                bestUse: "Hide a visually harsh same-person cut when the listener's face adds warmth, context, humor, tension, or comprehension.",
                avoidWhen: "The reaction is neutral wallpaper, emotionally false, or distracts from the speaker's actual delivery.",
                audioMove: "Usually keep the speaker's audio continuous; do not add a split edit unless the handoff feels stiff.",
                visualMove: "Cut to the reaction only for the beat that clarifies the moment, then return to the speaker or next source.",
                reviewQuestion: "Does the reaction make the exchange feel more human, or is it only hiding a seam?",
                agentRule: "Prefer reaction covers for jump-cut risk, but write why the reaction belongs before treating the decision as training-quality."
            ),
            CutTechniqueGuidance(
                id: "j-cut",
                title: "J-cut",
                bestUse: "Let the next speaker's audio begin slightly before the visual change when a reply needs momentum or interruption energy.",
                avoidWhen: "The lead makes the next speaker sound like they are stepping on a thought that needed room to land.",
                audioMove: "Lead the incoming audio by a few frames first; only grow the lead if the conversation still feels natural.",
                visualMove: "Hold the listener or previous speaker visually until the incoming thought has earned the cut.",
                reviewQuestion: "Does hearing the next voice early make the response feel alive, or just rushed?",
                agentRule: "Treat J-cuts as ear-first timing metadata. Never use them as generic silence compression."
            ),
            CutTechniqueGuidance(
                id: "l-cut",
                title: "L-cut",
                bestUse: "Let a speaker's audio tail continue under a reaction, clip, or next visual when the thought or laugh should linger.",
                avoidWhen: "The tail hides that the speaker actually changed topic, restarted, or needed a cleaner break.",
                audioMove: "Preserve the outgoing audio tail briefly while the visual changes to reaction or context.",
                visualMove: "Use the new visual to show listening, evidence, or emotional consequence while the old thought lands.",
                reviewQuestion: "Does the audio tail help the idea land, or does it muddy the handoff?",
                agentRule: "Use L-cuts to preserve meaning-bearing air, not to smear every transition smooth."
            ),
            CutTechniqueGuidance(
                id: "quiet-gap",
                title: "Quiet-gap proof",
                bestUse: "Remove true dead air, reset noise, repeated setup, or waiting time that does not carry story, warmth, or reaction.",
                avoidWhen: "The gap contains breath, laughter, thinking, awkward warmth, comic timing, emotional reset, or useful listener reaction.",
                audioMove: "Classify the removed span by ear before shrinking it further.",
                visualMove: "Keep source monitors visible during review so a removed reaction beat can be recovered.",
                reviewQuestion: "Is this absence making the episode better, or only shorter?",
                agentRule: "Do not expand quiet gaps automatically. Hold or annotate uncertainty instead of pretending silence is waste."
            ),
            CutTechniqueGuidance(
                id: "context-cover",
                title: "Context cover",
                bestUse: "Use B-roll, a watched clip, source material, or reference media when the visual teaches or clarifies what the speaker means.",
                avoidWhen: "The insert is generic wallpaper, rights-uncertain filler, or weaker than the speaker's facial delivery.",
                audioMove: "Keep podcast audio as the spine unless the clip's own audio is explicitly part of the story.",
                visualMove: "Show only the portion that supports the sentence, then return to the human conversation.",
                reviewQuestion: "Would a viewer understand more because this visual appears here?",
                agentRule: "Tie context covers to transcript ideas or review notes. Preserve them as reversible metadata recipes."
            )
        ]
    }
}

public struct CutIntelligenceCraftProfile: Codable, Equatable, Sendable {
    public var splitEditOpportunityCount: Int
    public var coverNeededCount: Int
    public var pauseReviewCount: Int
    public var straightCutCount: Int
    public var transcriptCoverageStatus: String
    public var humanFlowStance: String
    public var branchAdvice: String
    public var shortsAdvice: String
    public var reviewerPrompt: String
    public var agentInstruction: String
    public var craftWarnings: [String]
    public var doNotCutSignals: [String]
    public var automationGuardrails: [String]
    public var pauseReviewSignals: [String]
    public var techniquePlaybook: [CutTechniqueGuidance]

    public init(
        splitEditOpportunityCount: Int,
        coverNeededCount: Int,
        pauseReviewCount: Int,
        straightCutCount: Int,
        transcriptCoverageStatus: String,
        humanFlowStance: String,
        branchAdvice: String,
        shortsAdvice: String,
        reviewerPrompt: String,
        agentInstruction: String,
        craftWarnings: [String],
        doNotCutSignals: [String] = [],
        automationGuardrails: [String] = [],
        pauseReviewSignals: [String] = [],
        techniquePlaybook: [CutTechniqueGuidance] = CutTechniqueGuidance.defaultPlaybook()
    ) {
        self.splitEditOpportunityCount = splitEditOpportunityCount
        self.coverNeededCount = coverNeededCount
        self.pauseReviewCount = pauseReviewCount
        self.straightCutCount = straightCutCount
        self.transcriptCoverageStatus = transcriptCoverageStatus
        self.humanFlowStance = humanFlowStance
        self.branchAdvice = branchAdvice
        self.shortsAdvice = shortsAdvice
        self.reviewerPrompt = reviewerPrompt
        self.agentInstruction = agentInstruction
        self.craftWarnings = craftWarnings
        self.doNotCutSignals = doNotCutSignals
        self.automationGuardrails = automationGuardrails
        self.pauseReviewSignals = pauseReviewSignals
        self.techniquePlaybook = techniquePlaybook
    }

    private enum CodingKeys: String, CodingKey {
        case splitEditOpportunityCount
        case coverNeededCount
        case pauseReviewCount
        case straightCutCount
        case transcriptCoverageStatus
        case humanFlowStance
        case branchAdvice
        case shortsAdvice
        case reviewerPrompt
        case agentInstruction
        case craftWarnings
        case doNotCutSignals
        case automationGuardrails
        case pauseReviewSignals
        case techniquePlaybook
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.splitEditOpportunityCount = try container.decodeIfPresent(Int.self, forKey: .splitEditOpportunityCount) ?? 0
        self.coverNeededCount = try container.decodeIfPresent(Int.self, forKey: .coverNeededCount) ?? 0
        self.pauseReviewCount = try container.decodeIfPresent(Int.self, forKey: .pauseReviewCount) ?? 0
        self.straightCutCount = try container.decodeIfPresent(Int.self, forKey: .straightCutCount) ?? 0
        self.transcriptCoverageStatus = try container.decodeIfPresent(String.self, forKey: .transcriptCoverageStatus) ?? "unknown"
        self.humanFlowStance = try container.decodeIfPresent(String.self, forKey: .humanFlowStance) ?? "Review by ear before changing timing."
        self.branchAdvice = try container.decodeIfPresent(String.self, forKey: .branchAdvice) ?? "Use branches for meaningful rhythm experiments."
        self.shortsAdvice = try container.decodeIfPresent(String.self, forKey: .shortsAdvice) ?? "Keep shorts focused, human, and proof-listened before queueing."
        self.reviewerPrompt = try container.decodeIfPresent(String.self, forKey: .reviewerPrompt) ?? "Does this cut preserve the thought, reaction, and breath that make the moment feel human?"
        self.agentInstruction = try container.decodeIfPresent(String.self, forKey: .agentInstruction) ?? "Use this as craft guidance only; source media remains untouched."
        self.craftWarnings = try container.decodeIfPresent([String].self, forKey: .craftWarnings) ?? []
        self.doNotCutSignals = try container.decodeIfPresent([String].self, forKey: .doNotCutSignals) ?? []
        self.automationGuardrails = try container.decodeIfPresent([String].self, forKey: .automationGuardrails) ?? []
        self.pauseReviewSignals = try container.decodeIfPresent([String].self, forKey: .pauseReviewSignals) ?? []
        self.techniquePlaybook = try container.decodeIfPresent([CutTechniqueGuidance].self, forKey: .techniquePlaybook) ?? CutTechniqueGuidance.defaultPlaybook()
    }

    public var agentPayload: [String: Any] {
        [
            "splitEditOpportunityCount": splitEditOpportunityCount,
            "coverNeededCount": coverNeededCount,
            "pauseReviewCount": pauseReviewCount,
            "straightCutCount": straightCutCount,
            "transcriptCoverageStatus": transcriptCoverageStatus,
            "humanFlowStance": humanFlowStance,
            "branchAdvice": branchAdvice,
            "shortsAdvice": shortsAdvice,
            "reviewerPrompt": reviewerPrompt,
            "agentInstruction": agentInstruction,
            "craftWarnings": craftWarnings,
            "doNotCutSignals": doNotCutSignals,
            "automationGuardrails": automationGuardrails,
            "pauseReviewSignals": pauseReviewSignals,
            "techniquePlaybook": techniquePlaybook.map(\.agentPayload)
        ]
    }
}

public struct CutIntelligenceFinding: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var kind: String
    public var label: String
    public var severity: String
    public var sequenceTime: Double
    public var sourceLaneId: UUID?
    public var sourceLaneName: String
    public var targetLaneId: UUID?
    public var targetLaneName: String
    public var cutStyle: String
    public var audioLeadSeconds: Double
    public var audioTailSeconds: Double
    public var reason: String
    public var suggestedAction: String
    public var evidence: [String]

    public init(
        id: String,
        kind: String,
        label: String,
        severity: String,
        sequenceTime: Double,
        sourceLaneId: UUID? = nil,
        sourceLaneName: String = "",
        targetLaneId: UUID? = nil,
        targetLaneName: String = "",
        cutStyle: String,
        audioLeadSeconds: Double = 0,
        audioTailSeconds: Double = 0,
        reason: String,
        suggestedAction: String,
        evidence: [String] = []
    ) {
        self.id = id
        self.kind = kind
        self.label = label
        self.severity = severity
        self.sequenceTime = max(0, sequenceTime.isFinite ? sequenceTime : 0)
        self.sourceLaneId = sourceLaneId
        self.sourceLaneName = sourceLaneName
        self.targetLaneId = targetLaneId
        self.targetLaneName = targetLaneName
        self.cutStyle = cutStyle
        self.audioLeadSeconds = max(-5, min(5, audioLeadSeconds.isFinite ? audioLeadSeconds : 0))
        self.audioTailSeconds = max(-5, min(5, audioTailSeconds.isFinite ? audioTailSeconds : 0))
        self.reason = reason
        self.suggestedAction = suggestedAction
        self.evidence = evidence
    }

    public var agentPayload: [String: Any] {
        [
            "id": id,
            "kind": kind,
            "label": label,
            "severity": severity,
            "sequenceTime": sequenceTime,
            "sourceLaneId": sourceLaneId?.uuidString ?? "",
            "sourceLaneName": sourceLaneName,
            "targetLaneId": targetLaneId?.uuidString ?? "",
            "targetLaneName": targetLaneName,
            "cutStyle": cutStyle,
            "audioLeadSeconds": audioLeadSeconds,
            "audioTailSeconds": audioTailSeconds,
            "reason": reason,
            "suggestedAction": suggestedAction,
            "evidence": evidence
        ]
    }
}

public struct CutIntelligenceRecipe: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var label: String
    public var status: String
    public var sequenceTime: Double
    public var targetLaneId: UUID?
    public var targetLaneName: String
    public var sourceFindingId: String
    public var intent: EditDecisionIntent
    public var explanation: String
    public var safety: String
    public var applyLaterCommand: String

    public init(
        id: String,
        label: String,
        status: String = "suggestion-only",
        sequenceTime: Double,
        targetLaneId: UUID?,
        targetLaneName: String,
        sourceFindingId: String,
        intent: EditDecisionIntent,
        explanation: String,
        safety: String = "This recipe is metadata-only until explicitly applied. It does not mutate media, cut sources, export, or publish.",
        applyLaterCommand: String = "GET /cut_recipe_apply?id=<recipe-id>&confirm=true"
    ) {
        self.id = id
        self.label = label
        self.status = status
        self.sequenceTime = max(0, sequenceTime.isFinite ? sequenceTime : 0)
        self.targetLaneId = targetLaneId
        self.targetLaneName = targetLaneName
        self.sourceFindingId = sourceFindingId
        self.intent = intent
        self.explanation = explanation
        self.safety = safety
        self.applyLaterCommand = applyLaterCommand
    }

    public var recommendedTechnique: String {
        let text = editorialSearchText
        if text.contains("jump") { return "jump-cut-cover" }
        if text.contains("reaction") { return "reaction-cover" }
        if text.contains("j-cut") { return "j-cut" }
        if text.contains("l-cut") { return "l-cut" }
        if text.contains("b-roll") || text.contains("clip") { return "b-roll-or-clip-cover" }
        if text.contains("pause") || text.contains("cadence") || text.contains("breath") || text.contains("laugh") || text.contains("air") || text.contains("over-tight") {
            return "preserve-or-shape-air"
        }
        return "straight-cut-review"
    }

    public var techniqueGuidance: CutTechniqueGuidance? {
        let guidanceId: String?
        switch recommendedTechnique {
        case "jump-cut-cover", "reaction-cover":
            guidanceId = "reaction-cover"
        case "j-cut":
            guidanceId = "j-cut"
        case "l-cut":
            guidanceId = "l-cut"
        case "b-roll-or-clip-cover":
            guidanceId = "context-cover"
        case "preserve-or-shape-air":
            guidanceId = "quiet-gap"
        default:
            guidanceId = nil
        }

        guard let guidanceId else { return nil }
        return CutTechniqueGuidance.defaultPlaybook().first { $0.id == guidanceId }
    }

    public var reviewClass: String {
        let text = editorialSearchText
        let risk = intent.risk.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if risk.contains("high") || text.contains("jump") {
            return "cover_or_hold_before_tightening"
        }
        if text.contains("pause") || text.contains("cadence") || text.contains("breath") || text.contains("laugh") || text.contains("air") || text.contains("over-tight") {
            return "listen_for_human_air"
        }
        if text.contains("reaction") || text.contains("j-cut") || text.contains("l-cut") || text.contains("split") || text.contains("cover") {
            return "preview_split_edit_by_ear"
        }
        if intent.confidence < 0.50 {
            return "low_confidence_listen_first"
        }
        return "safe_preview_candidate"
    }

    public var reviewClassExplanation: String {
        switch reviewClass {
        case "cover_or_hold_before_tightening":
            return "Same-speaker jumps, high-risk cuts, or visually awkward boundaries need cover, reframing, preserved air, or an explicit hold before tightening."
        case "listen_for_human_air":
            return "This recipe touches pauses, breaths, laughs, thinking time, or cadence. Classify the silence before deleting it."
        case "preview_split_edit_by_ear":
            return "This recipe involves J-cuts, L-cuts, reactions, or covers. Preview the rhythm by ear before applying metadata."
        case "low_confidence_listen_first":
            return "The signal is useful but weak. Listen first, then mark Hold, Refine, or Keep."
        default:
            return "Lower-risk candidate. Still cue and listen before treating it as approved."
        }
    }

    public var techniqueTradeoffExplanation: String {
        if let techniqueGuidance {
            return "\(techniqueGuidance.title): best when \(techniqueGuidance.bestUse) Avoid when \(techniqueGuidance.avoidWhen)"
        }
        if !intent.tradeoffExplanation.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return intent.tradeoffExplanation
        }
        return reviewClassExplanation
    }

    public var techniqueReviewQuestion: String {
        if let techniqueGuidance {
            return techniqueGuidance.reviewQuestion
        }
        if !intent.nextReviewAction.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return intent.nextReviewAction
        }
        return "Does this edit make the conversation clearer and more human, or only shorter?"
    }

    public var agentTechniqueRule: String {
        if let techniqueGuidance {
            return techniqueGuidance.agentRule
        }
        return "Cue, listen at normal speed, and explain the human benefit before applying metadata."
    }

    public var humanReviewChecklist: [String] {
        var checklist = [
            "Cue the boundary and listen at normal speed.",
            techniqueReviewQuestion,
            "Confirm the change protects meaning, warmth, timing, or clarity rather than only making the episode shorter."
        ]
        if let techniqueGuidance {
            checklist.append("Best use: \(techniqueGuidance.bestUse)")
            checklist.append("Avoid when: \(techniqueGuidance.avoidWhen)")
        }
        if reviewClass == "cover_or_hold_before_tightening" {
            checklist.append("If no reaction, context cover, reframing, or preserved-air option feels honest, hold the recipe instead of forcing a cover.")
        } else if reviewClass == "listen_for_human_air" {
            checklist.append("If the pause carries thought, laugh timing, awkward warmth, or emotional reset, keep it or shorten gently.")
        } else if reviewClass == "preview_split_edit_by_ear" {
            checklist.append("Preview the split edit by ear; reject it if the audio handoff feels engineered.")
        }
        return checklist
    }

    public var preservationWarning: String {
        let text = editorialSearchText
        if reviewClass == "listen_for_human_air" {
            return "This recipe may touch meaning-bearing air. Preserve pauses, breaths, laughter, awkward warmth, thought, or emotional reset unless review proves the absence is dead time."
        }
        if reviewClass == "cover_or_hold_before_tightening" {
            return "Do not tighten this boundary just because it looks like a jump. Find an honest cover, reframe, preserve air, or hold for human review."
        }
        if text.contains("laugh") || text.contains("breath") || text.contains("thinking") || text.contains("awkward") || text.contains("comic timing") {
            return "Human rhythm signal detected. Listen before shortening, and prefer gentle shaping over deletion."
        }
        return ""
    }

    public var reviewPriority: Int {
        let text = editorialSearchText
        let risk = intent.risk.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        var score: Int
        switch reviewClass {
        case "cover_or_hold_before_tightening":
            score = 90
        case "preview_split_edit_by_ear":
            score = 72
        case "listen_for_human_air":
            score = 64
        case "low_confidence_listen_first":
            score = 58
        default:
            score = 42
        }
        if risk.contains("high") { score += 18 }
        if text.contains("jump") { score += 12 }
        if text.contains("reaction") || text.contains("cover") { score += 8 }
        if text.contains("j-cut") || text.contains("l-cut") || text.contains("split") { score += 6 }
        if !preservationWarning.isEmpty { score += 10 }
        score += Int((intent.confidence * 20).rounded())
        return score
    }

    public var reviewQueuePayload: [String: Any] {
        [
            "id": id,
            "label": label,
            "sequenceTime": sequenceTime,
            "targetLaneId": targetLaneId?.uuidString ?? "",
            "targetLaneName": targetLaneName,
            "recommendedTechnique": recommendedTechnique,
            "techniqueGuidance": techniqueGuidance?.agentPayload ?? [:],
            "techniqueTradeoffExplanation": techniqueTradeoffExplanation,
            "techniqueReviewQuestion": techniqueReviewQuestion,
            "agentTechniqueRule": agentTechniqueRule,
            "humanReviewChecklist": humanReviewChecklist,
            "preservationWarning": preservationWarning,
            "reviewClass": reviewClass,
            "reviewClassExplanation": reviewClassExplanation,
            "reviewPriority": reviewPriority,
            "risk": intent.risk,
            "confidence": intent.confidence,
            "cutStyle": intent.cutStyle,
            "coverStrategy": intent.coverStrategy,
            "nextReviewAction": intent.nextReviewAction.isEmpty
                ? "Cue this recipe, listen at normal speed, then mark Keep, Refine, or Hold."
                : intent.nextReviewAction,
            "previewCommand": "GET /cut_recipe_preview?id=\(id)",
            "applyLaterCommand": applyLaterCommand,
            "truth": "Queue entry only. Preview and listen before applying metadata; source media stays untouched."
        ]
    }

    private var editorialSearchText: String {
        [
            label,
            explanation,
            intent.cutStyle,
            intent.coverStrategy,
            intent.risk,
            intent.nextReviewAction,
            intent.humanRhythmNote,
            intent.tradeoffExplanation,
            intent.reviewEvidence.joined(separator: " ")
        ]
        .joined(separator: " ")
        .lowercased()
    }

    public var agentPayload: [String: Any] {
        [
            "id": id,
            "label": label,
            "status": status,
            "sequenceTime": sequenceTime,
            "targetLaneId": targetLaneId?.uuidString ?? "",
            "targetLaneName": targetLaneName,
            "sourceFindingId": sourceFindingId,
            "intent": intent.agentPayload,
            "recommendedTechnique": recommendedTechnique,
            "techniqueGuidance": techniqueGuidance?.agentPayload ?? [:],
            "techniqueTradeoffExplanation": techniqueTradeoffExplanation,
            "techniqueReviewQuestion": techniqueReviewQuestion,
            "agentTechniqueRule": agentTechniqueRule,
            "humanReviewChecklist": humanReviewChecklist,
            "preservationWarning": preservationWarning,
            "reviewClass": reviewClass,
            "reviewClassExplanation": reviewClassExplanation,
            "reviewPriority": reviewPriority,
            "reviewQueueEntry": reviewQueuePayload,
            "explanation": explanation,
            "safety": safety,
            "previewCommand": "GET /cut_recipe_preview?id=\(id)",
            "applyLaterCommand": applyLaterCommand,
            "recommendedWorkflow": [
                "Preview the recipe and split-edit recommendation first.",
                "Cue the boundary and listen at normal speed.",
                "Apply intent metadata only if the cut still feels human.",
                "Re-read selected decision evidence after applying."
            ],
            "truth": "Recipe payloads are suggestion-first. Previewing is read-only; applying attaches metadata intent and still does not mutate source media."
        ]
    }
}

public enum CutIntelligenceAnalyzer {
    public static func analyze(
        sequence: MediaSequence,
        playhead: Double = 0,
        cadenceMode: CutIntelligenceMode = .warmConversation
    ) -> CutIntelligenceReport {
        let visualLanes = sequence.lanes.filter(isVisualLane)
        let bRollCoverCandidate = firstBrollCoverCandidate(in: visualLanes)
        let decisions = visualDecisions(in: visualLanes)
        let boundaries = boundaryFindings(
            decisions: decisions,
            transcriptSegments: sequence.transcriptSegments,
            cadenceMode: cadenceMode
        )
        let reactionOpportunities = boundaries.filter { $0.kind == "reaction-opportunity" }
        let jumpCutRisks = boundaries.filter { $0.kind == "jump-cut-risk" }
        let cadenceWarnings = cadenceFindings(
            decisions: decisions,
            transcriptSegments: sequence.transcriptSegments,
            sequenceDuration: sequence.duration,
            cadenceMode: cadenceMode
        )
        let allFindings = (boundaries + cadenceWarnings).sorted {
            if $0.sequenceTime == $1.sequenceTime { return $0.kind < $1.kind }
            return $0.sequenceTime < $1.sequenceTime
        }
        let cappedFindings = Array(allFindings.prefix(40))
        let recipes = suggestedRecipes(
            from: cappedFindings,
            cadenceMode: cadenceMode,
            bRollCoverCandidate: bRollCoverCandidate
        )
        let typeCounts = Dictionary(grouping: cappedFindings, by: \.cutStyle).mapValues(\.count)
        let boundaryCount = max(0, decisions.count - 1)
        let cutsPerMinute = sequence.duration > 0 ? Double(boundaryCount) / max(1, sequence.duration / 60) : 0
        let rhythm = humanRhythmStatus(
            cutsPerMinute: cutsPerMinute,
            jumpCutRiskCount: jumpCutRisks.count,
            cadenceWarningCount: cadenceWarnings.count,
            cadenceMode: cadenceMode
        )
        let summary = CutIntelligenceSummary(
            visualDecisionCount: decisions.count,
            visualBoundaryCount: boundaryCount,
            transcriptSegmentCount: sequence.transcriptSegments.count,
            estimatedCutsPerMinute: rounded(cutsPerMinute),
            reactionOpportunityCount: reactionOpportunities.count,
            jumpCutRiskCount: jumpCutRisks.count,
            cadenceWarningCount: cadenceWarnings.count,
            humanRhythmStatus: rhythm.status,
            humanRhythmExplanation: rhythm.explanation
        )
        let status: String
        if decisions.isEmpty {
            status = "needs-show-skip-decisions"
        } else if sequence.transcriptSegments.isEmpty {
            status = "decision-only-transcript-needed"
        } else if jumpCutRisks.count + cadenceWarnings.count > 0 {
            status = "needs-human-rhythm-review"
        } else {
            status = "cut-intelligence-ready"
        }
        let craftProfile = editorialCraftProfile(
            status: status,
            findings: cappedFindings,
            recipes: recipes,
            transcriptSegments: sequence.transcriptSegments,
            sequenceDuration: sequence.duration,
            cadenceMode: cadenceMode
        )

        return CutIntelligenceReport(
            sequenceId: sequence.id,
            sequenceTitle: sequence.title,
            sequenceDuration: sequence.duration,
            cadenceMode: cadenceMode,
            status: status,
            summary: summary,
            cutTypeCounts: typeCounts,
            findings: cappedFindings,
            reactionOpportunities: Array(reactionOpportunities.prefix(16)),
            jumpCutRisks: Array(jumpCutRisks.prefix(16)),
            cadenceWarnings: Array(cadenceWarnings.prefix(16)),
            recipes: recipes,
            craftProfile: craftProfile,
            nextActions: nextActions(
                status: status,
                hasTranscript: !sequence.transcriptSegments.isEmpty,
                reactionOpportunityCount: reactionOpportunities.count,
                jumpCutRiskCount: jumpCutRisks.count,
                cadenceWarningCount: cadenceWarnings.count
            )
        )
    }

    private struct VisualDecision {
        var laneId: UUID
        var laneName: String
        var laneSpeaker: String
        var type: TagType
        var start: Double
        var end: Double
        var duration: Double
    }

    private struct CoverCandidate {
        var laneId: UUID
        var laneName: String
        var strategy: String
    }

    private static func visualDecisions(in lanes: [VideoLane]) -> [VisualDecision] {
        lanes.flatMap { lane in
            lane.tags
                .filter { ($0.type == .active || $0.type == .cut) && $0.duration > 0.04 }
                .map { tag in
                    let sequenceStart = (lane.sourceVideo?.offset ?? 0) + tag.startTime
                    let duration = max(0.04, tag.duration)
                    return VisualDecision(
                        laneId: lane.id,
                        laneName: lane.name,
                        laneSpeaker: speakerHint(for: lane),
                        type: tag.type,
                        start: sequenceStart,
                        end: sequenceStart + duration,
                        duration: duration
                    )
                }
        }
        .filter { $0.start.isFinite && $0.end.isFinite && $0.end > 0 }
        .sorted {
            if abs($0.start - $1.start) < 0.001 { return $0.laneName < $1.laneName }
            return $0.start < $1.start
        }
    }

    private static func editorialCraftProfile(
        status: String,
        findings: [CutIntelligenceFinding],
        recipes: [CutIntelligenceRecipe],
        transcriptSegments: [TranscriptSegment],
        sequenceDuration: Double,
        cadenceMode: CutIntelligenceMode
    ) -> CutIntelligenceCraftProfile {
        let splitEditCount = findings.filter {
            $0.cutStyle == "j-cut-opportunity"
                || $0.cutStyle == "l-cut-opportunity"
                || $0.cutStyle == "reaction-cover"
        }.count
        let coverNeededCount = findings.filter {
            $0.cutStyle == "jump-cut-risk"
                || $0.cutStyle == "b-roll-cover"
        }.count
        let pauseReviewCount = findings.filter {
            $0.cutStyle == "pause-preservation-review"
                || $0.cutStyle == "over-tightened"
                || $0.cutStyle == "cadence-compression"
        }.count
        let straightCutCount = findings.filter { $0.cutStyle == "straight-cut" }.count
        let transcriptCoverage = transcriptCoverageStatus(
            transcriptSegments: transcriptSegments,
            sequenceDuration: sequenceDuration
        )

        var warnings: [String] = []
        if transcriptSegments.isEmpty {
            warnings.append("Transcript timing is missing, so split-edit advice is based mostly on visual metadata.")
        }
        if coverNeededCount > 0 {
            warnings.append("Same-person jump cut or cover-needed boundaries exist; avoid making them cleaner but uglier.")
        }
        if pauseReviewCount > 0 {
            warnings.append("Some pauses may be personality, tension, warmth, or comic timing. Review by ear before deleting.")
        }
        if recipes.count > 10 {
            warnings.append("Many suggestions exist. Apply one branch experiment first instead of spreading half-tested edits across the whole timeline.")
        }

        var doNotCutSignals: [String] = []
        if transcriptSegments.isEmpty {
            doNotCutSignals.append("Do not auto-compress silence until transcript timing exists. Silent-looking gaps may be breath, reaction, laughter, or speaker turn setup.")
        }
        if pauseReviewCount > 0 {
            doNotCutSignals.append("Do not delete long pauses until they are classified as dead air, thinking time, comic timing, emotional weight, or awkwardness worth preserving.")
        }
        if coverNeededCount > 0 {
            doNotCutSignals.append("Do not solve same-person jumps by shaving harder. Try reaction cover, B-roll, reframing, or preserved air before tightening more.")
        }
        if cadenceMode == .warmConversation || cadenceMode == .documentaryThoughtful {
            doNotCutSignals.append("Do not optimize only for speed in this cadence mode. Preserve the human rhythm unless a reviewer explicitly asks for a tighter branch.")
        }
        if doNotCutSignals.isEmpty {
            doNotCutSignals.append("Do not turn a clean-looking boundary into an automatic cut. Review by ear before approving metadata that changes the episode rhythm.")
        }

        var automationGuardrails: [String] = [
            "Create reversible edit-intent metadata before changing SHOW/SKIP decisions.",
            "Prefer branch experiments for rhythm changes that affect more than one boundary.",
            "Keep original media and synced lanes untouched; cuts, covers, pauses, and shorts recipes live as metadata."
        ]
        if transcriptCoverage != "strong" {
            automationGuardrails.append("Treat transcript-aware cut suggestions as provisional until transcript coverage is strong.")
        }
        if pauseReviewCount > 0 || coverNeededCount > 0 {
            automationGuardrails.append("Require a human or agent proof-listen before approving aggressive cleanup near flagged pauses or jump-cut covers.")
        }

        let pauseReviewSignals = findings
            .filter { $0.cutStyle == "pause-preservation-review" }
            .prefix(5)
            .map { finding -> String in
                let pauseClass = finding.evidence
                    .first(where: { $0.hasPrefix("pauseClass=") })?
                    .replacingOccurrences(of: "pauseClass=", with: "") ?? "unclassified-pause"
                return "\(formatSeconds(finding.sequenceTime)) \(pauseClass): \(finding.suggestedAction)"
            }

        let humanFlowStance: String
        if status == "needs-show-skip-decisions" {
            humanFlowStance = "Build the visible edit spine first; craft analysis needs SHOW/SKIP decisions before it can judge flow."
        } else if transcriptSegments.isEmpty {
            humanFlowStance = "Do not auto-tighten yet. Generate transcript timing so Quipsly can hear speaker turns, pauses, and sentence boundaries."
        } else if coverNeededCount > 0 {
            humanFlowStance = "Prioritize invisible covers over aggressive cleanup. Reaction shots, B-roll, or reframing should hide ugly jumps while preserving conversational air."
        } else if pauseReviewCount > 0 {
            humanFlowStance = "Listen before compressing. The current edit has places where human timing may matter more than speed."
        } else if splitEditCount > 0 {
            humanFlowStance = "Try small split edits where they add flow, but keep them reversible and compare against straight cuts."
        } else {
            humanFlowStance = "The current metadata does not show major craft risks. Review by ear and use branches for experiments rather than automatic cleanup."
        }

        let branchAdvice: String
        if coverNeededCount > 0 || splitEditCount > 0 {
            branchAdvice = "Create a branch for the next craft pass: one experiment for reaction/J/L covers, another for a tighter short-form pass if needed."
        } else {
            branchAdvice = "Use the current branch as the baseline and branch only when testing a meaningfully different rhythm or clip-weave option."
        }

        let shortsAdvice: String
        switch cadenceMode {
        case .shortsEnergy:
            shortsAdvice = "For shorts, favor one clean idea with an immediate hook; use tighter pacing, but protect the one pause that makes the payoff land."
        case .tightYouTube, .chaoticFunButLegible:
            shortsAdvice = "For social variants, test faster openings and reaction covers, then watch the export for robotic pacing before queueing."
        case .documentaryThoughtful:
            shortsAdvice = "For thoughtful cuts, keep more air and let reactions or B-roll carry transitions instead of forcing a hard cadence."
        case .warmConversation:
            shortsAdvice = "For podcast clips, keep warmth first: remove dead air, not humanity. The best short should feel discovered, not machine-shaved."
        }

        return CutIntelligenceCraftProfile(
            splitEditOpportunityCount: splitEditCount,
            coverNeededCount: coverNeededCount,
            pauseReviewCount: pauseReviewCount,
            straightCutCount: straightCutCount,
            transcriptCoverageStatus: transcriptCoverage,
            humanFlowStance: humanFlowStance,
            branchAdvice: branchAdvice,
            shortsAdvice: shortsAdvice,
            reviewerPrompt: "Does this cut preserve the thought, reaction, and breath that make the moment feel human?",
            agentInstruction: "Use this as craft guidance only. Prefer branch experiments and reversible metadata recipes; do not mutate source media or overwrite exports.",
            craftWarnings: warnings,
            doNotCutSignals: doNotCutSignals,
            automationGuardrails: automationGuardrails,
            pauseReviewSignals: Array(pauseReviewSignals)
        )
    }

    private static func transcriptCoverageStatus(
        transcriptSegments: [TranscriptSegment],
        sequenceDuration: Double
    ) -> String {
        guard !transcriptSegments.isEmpty else {
            return "missing"
        }
        let coveredSeconds = transcriptSegments.reduce(0) { partial, segment in
            partial + max(0, segment.endTime - segment.startTime)
        }
        guard sequenceDuration > 0 else {
            return "present-duration-unknown"
        }
        let ratio = coveredSeconds / sequenceDuration
        if ratio >= 0.65 {
            return "strong"
        }
        if ratio >= 0.25 {
            return "partial"
        }
        return "thin"
    }

    private static func boundaryFindings(
        decisions: [VisualDecision],
        transcriptSegments: [TranscriptSegment],
        cadenceMode: CutIntelligenceMode
    ) -> [CutIntelligenceFinding] {
        let active = decisions.filter { $0.type == .active }.sorted { $0.start < $1.start }
        guard active.count > 1 else { return [] }
        var findings: [CutIntelligenceFinding] = []

        for index in 1..<active.count {
            let previous = active[index - 1]
            let current = active[index]
            let gap = current.start - previous.end
            let boundary = current.start
            let beforeSpeaker = transcriptSpeaker(at: max(0, boundary - 0.25), segments: transcriptSegments)
            let afterSpeaker = transcriptSpeaker(at: boundary + 0.25, segments: transcriptSegments)
            let crossingSegment = transcriptSegments.first { segment in
                segment.startTime <= boundary && segment.endTime >= boundary
            }
            let sameLane = previous.laneId == current.laneId
            let sourceChange = previous.laneId != current.laneId

            if sameLane && gap < 0 {
                findings.append(CutIntelligenceFinding(
                    id: "overlap-\(index)-\(current.laneId.uuidString.prefix(8))",
                    kind: "jump-cut-risk",
                    label: "Overlapping same-source decisions",
                    severity: "high",
                    sequenceTime: boundary,
                    sourceLaneId: previous.laneId,
                    sourceLaneName: previous.laneName,
                    targetLaneId: current.laneId,
                    targetLaneName: current.laneName,
                    cutStyle: "jump-cut-risk",
                    reason: "Two adjacent SHOW decisions on \(current.laneName) overlap by \(formatSeconds(abs(gap))). This may be intentional, but it is hard to review as a human-feeling cut.",
                    suggestedAction: "Resolve the overlap into one visible span, a reaction cover, or a small preserved pause before using it as training evidence.",
                    evidence: [
                        "previousEnd=\(formatSeconds(previous.end))",
                        "currentStart=\(formatSeconds(current.start))",
                        "overlap=\(formatSeconds(abs(gap)))",
                        "reviewLens=overlapping-metadata"
                    ]
                ))
            } else if sameLane && gap > (1.0 / 240.0) && gap < 0.35 {
                findings.append(CutIntelligenceFinding(
                    id: "jump-\(index)-\(current.laneId.uuidString.prefix(8))",
                    kind: "jump-cut-risk",
                    label: "Same-person jump cut risk",
                    severity: gap < 0.12 ? "high" : "medium",
                    sequenceTime: boundary,
                    sourceLaneId: previous.laneId,
                    sourceLaneName: previous.laneName,
                    targetLaneId: current.laneId,
                    targetLaneName: current.laneName,
                    cutStyle: "jump-cut-risk",
                    reason: "Two adjacent SHOW decisions stay on \(current.laneName) after removing \(formatSeconds(gap)) of that source.",
                    suggestedAction: "Cover with the other camera reaction, B-roll, a wide/two-shot, or preserve a slightly longer pause.",
                    evidence: [
                        "previousEnd=\(formatSeconds(previous.end))",
                        "currentStart=\(formatSeconds(current.start))",
                        "gap=\(formatSeconds(gap))",
                        "reviewLens=same-person-continuity"
                    ]
                ))
            } else if sourceChange && crossingSegment != nil {
                let segment = crossingSegment!
                let segmentSpeaker = normalizedSpeaker(segment.speaker)
                let style = previous.laneSpeaker == segmentSpeaker ? "l-cut-opportunity" : "reaction-cover"
                findings.append(CutIntelligenceFinding(
                    id: "reaction-\(index)-\(current.laneId.uuidString.prefix(8))",
                    kind: "reaction-opportunity",
                    label: style == "l-cut-opportunity" ? "Possible L-cut / reaction cover" : "Reaction cover opportunity",
                    severity: "low",
                    sequenceTime: boundary,
                    sourceLaneId: previous.laneId,
                    sourceLaneName: previous.laneName,
                    targetLaneId: current.laneId,
                    targetLaneName: current.laneName,
                    cutStyle: style,
                    audioTailSeconds: min(1.25, max(0, segment.endTime - boundary)),
                    reason: "The visual source changes while transcript audio appears to continue through the boundary.",
                    suggestedAction: "Let the previous speaker's audio tail continue under the new reaction shot if it feels conversational.",
                    evidence: [
                        "speaker=\(segment.speaker)",
                        "segment=\(formatSeconds(segment.startTime))-\(formatSeconds(segment.endTime))",
                        "beforeSpeaker=\(beforeSpeaker)",
                        "afterSpeaker=\(afterSpeaker)",
                        "reviewLens=audio-continuity-through-visual-change"
                    ]
                ))
            } else if sourceChange && beforeSpeaker != afterSpeaker && afterSpeaker == current.laneSpeaker {
                findings.append(CutIntelligenceFinding(
                    id: "jcut-\(index)-\(current.laneId.uuidString.prefix(8))",
                    kind: "split-edit-opportunity",
                    label: "Possible J-cut",
                    severity: "low",
                    sequenceTime: boundary,
                    sourceLaneId: previous.laneId,
                    sourceLaneName: previous.laneName,
                    targetLaneId: current.laneId,
                    targetLaneName: current.laneName,
                    cutStyle: "j-cut-opportunity",
                    audioLeadSeconds: 0.18,
                    reason: "Transcript speaker changes near the same time as the visual source change.",
                    suggestedAction: "Try starting \(current.laneSpeaker)'s audio a few frames before the visual cut if the response needs momentum.",
                    evidence: [
                        "beforeSpeaker=\(beforeSpeaker)",
                        "afterSpeaker=\(afterSpeaker)",
                        "reviewLens=reply-momentum"
                    ]
                ))
            } else if sourceChange {
                findings.append(CutIntelligenceFinding(
                    id: "straight-\(index)-\(current.laneId.uuidString.prefix(8))",
                    kind: "cut-classification",
                    label: "Straight source cut",
                    severity: "info",
                    sequenceTime: boundary,
                    sourceLaneId: previous.laneId,
                    sourceLaneName: previous.laneName,
                    targetLaneId: current.laneId,
                    targetLaneName: current.laneName,
                    cutStyle: "straight-cut",
                    reason: "The visual source changes without enough transcript evidence yet to recommend a split edit.",
                    suggestedAction: "Leave it if it feels invisible; otherwise test a small J/L offset or reaction hold.",
                    evidence: [
                        "gap=\(formatSeconds(gap))",
                        "beforeSpeaker=\(beforeSpeaker)",
                        "afterSpeaker=\(afterSpeaker)",
                        "reviewLens=straight-cut-baseline"
                    ]
                ))
            }
        }

        return findings
    }

    private static func cadenceFindings(
        decisions _: [VisualDecision],
        transcriptSegments: [TranscriptSegment],
        sequenceDuration: Double,
        cadenceMode: CutIntelligenceMode
    ) -> [CutIntelligenceFinding] {
        var findings: [CutIntelligenceFinding] = []

        // SHOW decisions are picture choices over one shared sequence clock.
        // Adjacent picture decisions should normally be frame-contiguous, so
        // their zero-second boundary says nothing about whether dialogue,
        // breaths, laughter, or reflective air were removed. Cadence findings
        // must come from transcript/audio timing (and, in the future, explicit
        // program keep-range edits), never from camera-switch continuity.

        if !transcriptSegments.isEmpty {
            let sorted = transcriptSegments.sorted { $0.startTime < $1.startTime }
            if sorted.count > 1 {
                for index in 1..<sorted.count {
                let previousSegment = sorted[index - 1]
                let nextSegment = sorted[index]
                let pause = sorted[index].startTime - sorted[index - 1].endTime
                if pause > longPauseThreshold(for: cadenceMode) {
                    let pauseReview = pauseReviewCue(
                        previous: previousSegment,
                        next: nextSegment,
                        pause: pause,
                        cadenceMode: cadenceMode
                    )
                    findings.append(CutIntelligenceFinding(
                        id: "cadence-pause-\(index)-\(Int(sorted[index].startTime * 10))",
                        kind: "cadence-warning",
                        label: "Long pause needs intent",
                        severity: pause > 3.5 ? "medium" : "low",
                        sequenceTime: previousSegment.endTime,
                        cutStyle: "pause-preservation-review",
                        reason: "Transcript gap is \(formatSeconds(pause)). Pause lens: \(pauseReview.label).",
                        suggestedAction: pauseReview.action,
                        evidence: [
                            "previousSpeaker=\(previousSegment.speaker)",
                            "nextSpeaker=\(nextSegment.speaker)",
                            "pause=\(formatSeconds(pause))",
                            "pauseClass=\(pauseReview.label)",
                            "reviewLens=do-not-cut-until-classified"
                        ] + pauseReview.evidence
                    ))
                }
            }
            }
        }

        return Array(findings.prefix(24))
    }

    private static func suggestedRecipes(
        from findings: [CutIntelligenceFinding],
        cadenceMode: CutIntelligenceMode,
        bRollCoverCandidate: CoverCandidate?
    ) -> [CutIntelligenceRecipe] {
        findings.flatMap { finding -> [CutIntelligenceRecipe] in
            switch finding.cutStyle {
            case "l-cut-opportunity", "reaction-cover":
                return [CutIntelligenceRecipe(
                    id: "recipe-\(finding.id)",
                    label: "Try reaction cover / L-cut",
                    sequenceTime: finding.sequenceTime,
                    targetLaneId: finding.targetLaneId,
                    targetLaneName: finding.targetLaneName,
                    sourceFindingId: finding.id,
                    intent: EditDecisionIntent(
                        cutStyle: finding.cutStyle,
                        audioLeadSeconds: 0,
                        audioTailSeconds: max(0.18, min(1.25, finding.audioTailSeconds == 0 ? 0.45 : finding.audioTailSeconds)),
                        coverStrategy: "reaction-cover",
                        reactionCoverLaneId: finding.targetLaneId,
                        reactionCoverLaneName: finding.targetLaneName,
                        cadenceMode: cadenceMode.rawValue,
                        humanRhythmNote: "Let the previous speaker breathe through the visual change if it sounds conversational.",
                        whyThisCutExists: finding.reason,
                        tradeoffExplanation: "A reaction cover can make a cut feel human, but too much split-edit smoothing can hide real timing or make the exchange feel engineered. Review by ear.",
                        confidence: finding.severity == "high" ? 0.78 : 0.62,
                        revisionHistory: ["Suggested by Cut Intelligence from \(finding.kind) at \(formatSeconds(finding.sequenceTime))."],
                        revisionLedger: [EditDecisionRevision(
                            action: "suggested-cut-intelligence",
                            note: "Suggested reaction/L-cut recipe from \(finding.kind) at \(formatSeconds(finding.sequenceTime)).",
                            evidence: recipeEvidence(for: finding),
                            previousStatus: "",
                            nextStatus: "suggested",
                            confidenceAfter: finding.severity == "high" ? 0.78 : 0.62
                        )],
                        humanAgentNotes: [finding.suggestedAction],
                        reviewEvidence: recipeEvidence(for: finding),
                        nextReviewAction: "Compare Play Edit and Play Through at this boundary; keep the cover only if it preserves the thought and makes the visual change feel natural.",
                        risk: finding.severity,
                        status: "suggested"
                    ),
                    explanation: "Represent this as split-edit intent: keep the source lanes whole, let audio tail under the reaction, and review by ear."
                )]
            case "j-cut-opportunity":
                return [CutIntelligenceRecipe(
                    id: "recipe-\(finding.id)",
                    label: "Try small J-cut lead",
                    sequenceTime: finding.sequenceTime,
                    targetLaneId: finding.targetLaneId,
                    targetLaneName: finding.targetLaneName,
                    sourceFindingId: finding.id,
                    intent: EditDecisionIntent(
                        cutStyle: "j-cut",
                        audioLeadSeconds: max(0.12, min(0.45, finding.audioLeadSeconds == 0 ? 0.18 : finding.audioLeadSeconds)),
                        audioTailSeconds: 0,
                        coverStrategy: "audio-lead",
                        reactionCoverLaneId: finding.targetLaneId,
                        reactionCoverLaneName: finding.targetLaneName,
                        cadenceMode: cadenceMode.rawValue,
                        humanRhythmNote: "Use a short audio lead only if it gives the reply momentum without stepping on the previous thought.",
                        whyThisCutExists: finding.reason,
                        tradeoffExplanation: "A J-cut can make the reply feel alive, but too much lead can make speakers interrupt each other. Keep the lead small and listen before approving.",
                        confidence: finding.severity == "high" ? 0.74 : 0.58,
                        revisionHistory: ["Suggested by Cut Intelligence from \(finding.kind) at \(formatSeconds(finding.sequenceTime))."],
                        revisionLedger: [EditDecisionRevision(
                            action: "suggested-cut-intelligence",
                            note: "Suggested J-cut recipe from \(finding.kind) at \(formatSeconds(finding.sequenceTime)).",
                            evidence: recipeEvidence(for: finding),
                            previousStatus: "",
                            nextStatus: "suggested",
                            confidenceAfter: finding.severity == "high" ? 0.74 : 0.58
                        )],
                        humanAgentNotes: [finding.suggestedAction],
                        reviewEvidence: recipeEvidence(for: finding),
                        nextReviewAction: "Preview a tiny audio lead; reject it if the next speaker feels like they are stepping on the previous thought.",
                        risk: finding.severity,
                        status: "suggested"
                    ),
                    explanation: "Represent this as next-speaker audio beginning slightly before the visual cut."
                )]
            case "jump-cut-risk":
                var recipes: [CutIntelligenceRecipe] = [
                    CutIntelligenceRecipe(
                    id: "recipe-\(finding.id)",
                    label: "Cover same-person jump cut",
                    sequenceTime: finding.sequenceTime,
                    targetLaneId: finding.targetLaneId,
                    targetLaneName: finding.targetLaneName,
                    sourceFindingId: finding.id,
                    intent: EditDecisionIntent(
                        cutStyle: "jump-cut-cover-needed",
                        audioLeadSeconds: 0,
                        audioTailSeconds: 0,
                        coverStrategy: "reaction-or-broll-or-reframe",
                        reactionCoverLaneId: nil,
                        reactionCoverLaneName: "",
                        cadenceMode: cadenceMode.rawValue,
                        humanRhythmNote: "Do not over-clean this boundary. Find a human-feeling cover or keep enough air for the edit to breathe.",
                        whyThisCutExists: finding.reason,
                        tradeoffExplanation: "Covering a same-person jump can protect visual continuity, but a forced cover can be more distracting than the jump. Prefer reaction, B-roll, or reframing only when it adds clarity.",
                        confidence: finding.severity == "high" ? 0.82 : 0.66,
                        revisionHistory: ["Suggested by Cut Intelligence from \(finding.kind) at \(formatSeconds(finding.sequenceTime))."],
                        revisionLedger: [EditDecisionRevision(
                            action: "suggested-cut-intelligence",
                            note: "Suggested same-person jump-cover recipe from \(finding.kind) at \(formatSeconds(finding.sequenceTime)).",
                            evidence: recipeEvidence(for: finding),
                            previousStatus: "",
                            nextStatus: "suggested",
                            confidenceAfter: finding.severity == "high" ? 0.82 : 0.66
                        )],
                        humanAgentNotes: [finding.suggestedAction],
                        reviewEvidence: recipeEvidence(for: finding),
                        nextReviewAction: "Find a reaction, B-roll, reframing, or preserved air option; if every cover feels fake, let the jump stand and document why.",
                        risk: finding.severity,
                        status: "suggested"
                    ),
                    explanation: "Flag this boundary for a reaction shot, B-roll insert, wide/two-shot, or slight reframing before tightening more."
                    )
                ]
                if let bRollCoverCandidate {
                    recipes.append(CutIntelligenceRecipe(
                        id: "recipe-broll-\(finding.id)",
                        label: "Try B-roll / clip cover",
                        sequenceTime: finding.sequenceTime,
                        targetLaneId: bRollCoverCandidate.laneId,
                        targetLaneName: bRollCoverCandidate.laneName,
                        sourceFindingId: finding.id,
                        intent: EditDecisionIntent(
                            cutStyle: "b-roll-cover",
                            audioLeadSeconds: 0,
                            audioTailSeconds: 0,
                            coverStrategy: bRollCoverCandidate.strategy,
                            reactionCoverLaneId: bRollCoverCandidate.laneId,
                            reactionCoverLaneName: bRollCoverCandidate.laneName,
                            cadenceMode: cadenceMode.rawValue,
                            humanRhythmNote: "Use this only if the clip adds context or hides a visually ugly jump without distracting from the conversation.",
                            whyThisCutExists: finding.reason,
                            tradeoffExplanation: "B-roll should clarify or cover an ugly boundary; it should not become visual noise just because a clip exists.",
                            confidence: 0.64,
                            revisionHistory: ["Suggested by Cut Intelligence from \(finding.kind) using \(bRollCoverCandidate.laneName) as a possible cover."],
                            revisionLedger: [EditDecisionRevision(
                                action: "suggested-cut-intelligence",
                                note: "Suggested B-roll/context cover from \(finding.kind) using \(bRollCoverCandidate.laneName).",
                                evidence: recipeEvidence(for: finding) + ["Candidate cover lane: \(bRollCoverCandidate.laneName)."],
                                previousStatus: "",
                                nextStatus: "suggested",
                                confidenceAfter: 0.64
                            )],
                            humanAgentNotes: [finding.suggestedAction],
                            reviewEvidence: recipeEvidence(for: finding) + ["Candidate cover lane: \(bRollCoverCandidate.laneName)."],
                            nextReviewAction: "Preview the B-roll/clip cover against the dialogue. Keep it only if it clarifies the moment or hides a truly ugly jump.",
                            risk: "medium",
                            status: "suggested"
                        ),
                        explanation: "Treat a synced reference/B-roll lane as a reversible cover over the jump. The source clip stays whole; the cover is edit metadata."
                    ))
                }
                return recipes
            case "cadence-compression", "over-tightened", "pause-preservation-review":
                return [CutIntelligenceRecipe(
                    id: "recipe-\(finding.id)",
                    label: finding.cutStyle == "over-tightened" ? "Restore human air" : "Review human rhythm before tightening",
                    sequenceTime: finding.sequenceTime,
                    targetLaneId: finding.targetLaneId,
                    targetLaneName: finding.targetLaneName,
                    sourceFindingId: finding.id,
                    intent: EditDecisionIntent(
                        cutStyle: finding.cutStyle,
                        audioLeadSeconds: 0,
                        audioTailSeconds: 0,
                        coverStrategy: "pause-preservation-review",
                        cadenceMode: cadenceMode.rawValue,
                        humanRhythmNote: finding.suggestedAction,
                        whyThisCutExists: finding.reason,
                        tradeoffExplanation: "The fastest cut is not always the best cut. This recipe asks for a listening pass before tightening pauses, laughs, breaths, or comic timing.",
                        confidence: finding.severity == "high" ? 0.76 : 0.60,
                        revisionHistory: ["Suggested by Cut Intelligence from \(finding.kind) at \(formatSeconds(finding.sequenceTime))."],
                        revisionLedger: [EditDecisionRevision(
                            action: "suggested-cut-intelligence",
                            note: "Suggested human-rhythm preservation recipe from \(finding.kind) at \(formatSeconds(finding.sequenceTime)).",
                            evidence: recipeEvidence(for: finding),
                            previousStatus: "",
                            nextStatus: "suggested",
                            confidenceAfter: finding.severity == "high" ? 0.76 : 0.60
                        )],
                        humanAgentNotes: [finding.suggestedAction],
                        reviewEvidence: recipeEvidence(for: finding),
                        nextReviewAction: "Listen at normal speed. If the pause carries warmth, thought, laugh timing, or tension, preserve or shorten gently rather than deleting.",
                        risk: finding.severity,
                        status: "suggested"
                    ),
                    explanation: "This is a listening recipe, not an auto-delete instruction. Preserve warmth, breaths, laughs, and comic timing when useful."
                )]
            default:
                return []
            }
        }
        .prefix(24)
        .map { $0 }
    }

    private static func recipeEvidence(for finding: CutIntelligenceFinding) -> [String] {
        var evidence = finding.evidence
        evidence.insert("Finding: \(finding.label) at \(formatSeconds(finding.sequenceTime)).", at: 0)
        evidence.append("Reason: \(finding.reason)")
        evidence.append("Suggested action: \(finding.suggestedAction)")
        return Array(evidence.prefix(10))
    }

    private static func firstBrollCoverCandidate(in lanes: [VideoLane]) -> CoverCandidate? {
        for lane in lanes {
            let text = "\(lane.name) \(lane.metadata?.role ?? "") \(lane.metadata?.sourceLabel ?? "")".lowercased()
            let looksLikeCover = text.contains("b-roll")
                || text.contains("broll")
                || text.contains("reference")
                || text.contains("clip")
                || text.contains("source")
            let speaker = speakerHint(for: lane)
            if looksLikeCover && speaker == "unknown" {
                return CoverCandidate(
                    laneId: lane.id,
                    laneName: lane.name,
                    strategy: text.contains("reference") ? "reference-clip-cover" : "b-roll-cover"
                )
            }
        }
        return nil
    }

    private static func isVisualLane(_ lane: VideoLane) -> Bool {
        let mediaKind = (lane.metadata?.mediaKind ?? "").lowercased()
        let role = (lane.metadata?.role ?? "").lowercased()
        if mediaKind.contains("audio") || role.contains("audio") || role.contains("podcast") {
            return false
        }
        if let source = lane.sourceVideo {
            return source.duration > 0
        }
        return mediaKind.contains("video") || role.contains("camera") || role.contains("clip")
    }

    private static func speakerHint(for lane: VideoLane) -> String {
        let text = "\(lane.name) \(lane.metadata?.role ?? "") \(lane.metadata?.sourceLabel ?? "")".lowercased()
        if text.contains("charlie") { return "charlie" }
        if text.contains("homer") || text.contains("scott") { return "homer" }
        if text.contains("both") || text.contains("two") { return "both" }
        return "unknown"
    }

    private static func transcriptSpeaker(at time: Double, segments: [TranscriptSegment]) -> String {
        guard let segment = segments.first(where: { $0.startTime <= time && $0.endTime >= time }) else {
            return "unknown"
        }
        return normalizedSpeaker(segment.speaker)
    }

    private static func normalizedSpeaker(_ raw: String) -> String {
        let lowered = raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if lowered.contains("charlie") { return "charlie" }
        if lowered.contains("homer") || lowered.contains("scott") { return "homer" }
        if lowered.contains("both") { return "both" }
        return lowered.isEmpty ? "unknown" : lowered
    }

    private static func pauseReviewCue(
        previous: TranscriptSegment,
        next: TranscriptSegment,
        pause: Double,
        cadenceMode: CutIntelligenceMode
    ) -> (label: String, action: String, evidence: [String]) {
        let previousText = previous.text.trimmingCharacters(in: .whitespacesAndNewlines)
        let nextText = next.text.trimmingCharacters(in: .whitespacesAndNewlines)
        let previousLower = previousText.lowercased()
        let nextLower = nextText.lowercased()
        let speakerChanged = normalizedSpeaker(previous.speaker) != normalizedSpeaker(next.speaker)
        let previousLooksLikeQuestion = previousText.hasSuffix("?")
            || previousLower.hasPrefix("why ")
            || previousLower.hasPrefix("how ")
            || previousLower.hasPrefix("what ")
            || previousLower.hasPrefix("where ")
            || previousLower.hasPrefix("when ")
        let laughterCue = previousLower.contains("laugh")
            || nextLower.contains("laugh")
            || previousLower.contains("haha")
            || nextLower.contains("haha")
        let nextResetCue = nextLower.hasPrefix("so ")
            || nextLower.hasPrefix("but ")
            || nextLower.hasPrefix("and ")
            || nextLower.hasPrefix("okay")
            || nextLower.hasPrefix("well")

        let label: String
        let action: String
        if laughterCue {
            label = "comic-or-laughter-timing"
            action = "Listen for laugh timing before cutting. Preserve the pause if it lets the joke, reaction, or warmth land."
        } else if previousLooksLikeQuestion && speakerChanged {
            label = "answer-setup-pause"
            action = "Treat this as possible answer setup. Shorten gently only if the listener feels abandoned before the reply."
        } else if speakerChanged && pause < 2.6 {
            label = "speaker-handoff-breath"
            action = "Protect the handoff breath unless it clearly drags. A tiny pause can make the reply feel human instead of snapped in."
        } else if pause > 4.0 {
            label = "dead-air-candidate"
            action = "This may be true dead air. Try a branch that shortens it, then proof-listen for lost tension, joke timing, or thoughtfulness."
        } else if nextResetCue {
            label = "thought-reset-pause"
            action = "This may be a thought reset. Preserve or shorten gently if it helps the next idea feel intentional."
        } else if cadenceMode == .documentaryThoughtful || cadenceMode == .warmConversation {
            label = "human-reflection-pause"
            action = "In this cadence mode, do not delete this by default. Listen for reflection, emotional weight, or conversational warmth."
        } else {
            label = "needs-ear-classification"
            action = "Classify by ear before compressing. If it is only dead air, shorten; if it carries personality, preserve some of it."
        }

        return (
            label,
            action,
            [
                "speakerChanged=\(speakerChanged)",
                "previousLooksLikeQuestion=\(previousLooksLikeQuestion)",
                "nextResetCue=\(nextResetCue)",
                "previousText=\(transcriptSnippet(previousText))",
                "nextText=\(transcriptSnippet(nextText))"
            ]
        )
    }

    private static func transcriptSnippet(_ text: String, limit: Int = 92) -> String {
        let collapsed = text
            .replacingOccurrences(of: "\n", with: " ")
            .replacingOccurrences(of: "\t", with: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard collapsed.count > limit else { return collapsed }
        let end = collapsed.index(collapsed.startIndex, offsetBy: max(0, limit - 1))
        return "\(collapsed[..<end])…"
    }

    private static func minimumHumanPause(for mode: CutIntelligenceMode) -> Double {
        switch mode {
        case .warmConversation: return 0.24
        case .tightYouTube: return 0.14
        case .shortsEnergy: return 0.08
        case .documentaryThoughtful: return 0.34
        case .chaoticFunButLegible: return 0.10
        }
    }

    private static func longPauseThreshold(for mode: CutIntelligenceMode) -> Double {
        switch mode {
        case .warmConversation: return 1.6
        case .tightYouTube: return 1.1
        case .shortsEnergy: return 0.8
        case .documentaryThoughtful: return 2.2
        case .chaoticFunButLegible: return 1.0
        }
    }

    private static func humanRhythmStatus(
        cutsPerMinute: Double,
        jumpCutRiskCount: Int,
        cadenceWarningCount: Int,
        cadenceMode: CutIntelligenceMode
    ) -> (status: String, explanation: String) {
        let denseCuttingThreshold: Double
        switch cadenceMode {
        case .warmConversation: denseCuttingThreshold = 10
        case .tightYouTube: denseCuttingThreshold = 16
        case .shortsEnergy: denseCuttingThreshold = 28
        case .documentaryThoughtful: denseCuttingThreshold = 7
        case .chaoticFunButLegible: denseCuttingThreshold = 22
        }
        if jumpCutRiskCount > 0 {
            return (
                "needs-jump-cut-review",
                "Same-person cut risks are present. Use reaction covers, B-roll, reframing, or preserved air before tightening further."
            )
        }
        if cutsPerMinute > denseCuttingThreshold || cadenceWarningCount > 8 {
            return (
                "possibly-over-tight",
                "The current edit may be efficient, but this cadence mode should review breaths, laughs, and thinking pauses before more compression."
            )
        }
        return (
            "human-rhythm-plausible",
            "No major rhythm red flags found from metadata. This still needs ears; the report is guidance, not a grade."
        )
    }

    private static func nextActions(
        status: String,
        hasTranscript: Bool,
        reactionOpportunityCount: Int,
        jumpCutRiskCount: Int,
        cadenceWarningCount: Int
    ) -> [String] {
        var actions: [String] = []
        if !hasTranscript {
            actions.append("Import or generate transcript timing so Quipsly can distinguish straight cuts from J/L/reaction opportunities.")
        }
        if jumpCutRiskCount > 0 {
            actions.append("Review same-person jump-cut risks first; cover them with reaction shots, B-roll, wide/two-shot, or preserved pause.")
        }
        if reactionOpportunityCount > 0 {
            actions.append("Try one reaction-cover or L-cut on a low-risk boundary and compare the flow before applying broadly.")
        }
        if cadenceWarningCount > 0 {
            actions.append("Listen through cadence warnings before silence compression. Preserve personality pauses unless they clearly drag.")
        }
        if actions.isEmpty {
            actions.append("Use this report as the baseline; next pass can create reversible edit recipes with why-this-cut-exists metadata.")
        }
        return actions
    }

    private static func rounded(_ value: Double) -> Double {
        guard value.isFinite else { return 0 }
        return (value * 100).rounded() / 100
    }

    private static func formatSeconds(_ value: Double) -> String {
        guard value.isFinite else { return "0.00s" }
        return String(format: "%.2fs", max(0, value))
    }
}
