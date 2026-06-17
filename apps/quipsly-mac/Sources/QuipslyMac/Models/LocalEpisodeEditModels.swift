import Foundation
import Darwin

func quipslyFileExists(atPath path: String) -> Bool {
    path.withCString { pointer in
        access(pointer, F_OK) == 0
    }
}

struct LocalEpisodeEditSession: Codable, Identifiable, Equatable {
    var id: String
    var projectSlug: String
    var episodeSlug: String
    var sourceDraftId: String
    var sourceDraftGeneratedAt: String
    var createdAt: String
    var updatedAt: String
    var sources: [LocalEpisodeSource]
    var editDecisions: [LocalEpisodeEditDecision]
    var textOverlays: [LocalEpisodeTextOverlay]?
    var notes: String

    init(draft: PremiereDraftEditPacket) {
        let now = Date().ISO8601Format()
        self.id = "\(draft.projectSlug)-\(draft.episodeSlug)"
        self.projectSlug = draft.projectSlug
        self.episodeSlug = draft.episodeSlug
        self.sourceDraftId = draft.id
        self.sourceDraftGeneratedAt = draft.generatedAt
        self.createdAt = now
        self.updatedAt = now
        
        let matchesByPremiereAssetId = Dictionary(uniqueKeysWithValues: draft.assetMatches.map { ($0.premiereAssetId, $0) })
        
        // 1. Build sources
        var generatedSources: [LocalEpisodeSource] = []
        if let graph = draft.editGraph, let graphSources = graph.sources, !graphSources.isEmpty {
            generatedSources = graphSources.compactMap { source in
                let id = (source.sourceAssetId ?? source.id ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
                guard !id.isEmpty else { return nil }
                return LocalEpisodeSource(
                    id: id,
                    sourceAssetId: id,
                    displayName: source.displayName ?? id,
                    kind: source.kind ?? "unknown",
                    trackIDs: source.trackIds ?? [],
                    duration: max(0, source.duration ?? 0),
                    programStart: 0,
                    programEnd: max(0, graph.duration ?? source.duration ?? 0),
                    localMediaPath: source.localPath,
                    playbackMediaPath: nil,
                    mediaKind: source.kind,
                    mediaExists: source.localPath.map { quipslyFileExists(atPath: $0) } ?? false,
                    generatedFrom: source.generatedFrom ?? "quipsly-edit-graph"
                )
            }
        } else {
            // Fallback: derive sources from timeline clips
            let grouped = Dictionary(grouping: draft.timelineClips) { "\($0.premiereAssetId)|\($0.kind.lowercased())" }
            generatedSources = grouped.values.compactMap { clips -> LocalEpisodeSource? in
                guard let first = clips.first else { return nil }
                let match = matchesByPremiereAssetId[first.premiereAssetId]
                let usedTrackIDs = Array(Set(clips.map(\.trackId))).sorted(by: LocalEpisodeEditSession.compareTrackIDsForModel)
                let sourceDuration = clips.map(\.sourceEnd).max() ?? 0
                let programStart = clips.map(\.startIn).min() ?? 0
                let programEnd = clips.map { $0.startIn + $0.duration }.max() ?? programStart
                let localPath = match?.localPath
                
                return LocalEpisodeSource(
                    id: first.premiereAssetId,
                    sourceAssetId: first.premiereAssetId,
                    displayName: match?.displayName ?? first.name,
                    kind: first.kind,
                    trackIDs: usedTrackIDs,
                    duration: max(sourceDuration, clips.reduce(0) { $0 + $1.duration }),
                    programStart: max(0, programStart),
                    programEnd: max(programStart, programEnd),
                    localMediaPath: localPath,
                    playbackMediaPath: nil,
                    mediaKind: match?.kind ?? first.kind,
                    mediaExists: localPath.map { quipslyFileExists(atPath: $0) } ?? false,
                    generatedFrom: "quipsly-source-from-import-backing-store"
                )
            }
        }
        self.sources = generatedSources.sorted { left, right in
            if left.programStart != right.programStart {
                return left.programStart < right.programStart
            }
            return left.displayName < right.displayName
        }
        
        // 2. Build decisions
        var generatedDecisions: [LocalEpisodeEditDecision] = []
        if let graph = draft.editGraph, let graphDecisions = graph.editDecisions, !graphDecisions.isEmpty {
            generatedDecisions = graphDecisions.compactMap { decision in
                guard let id = decision.id?.trimmingCharacters(in: .whitespacesAndNewlines), !id.isEmpty,
                      let sourceAssetId = decision.sourceAssetId?.trimmingCharacters(in: .whitespacesAndNewlines), !sourceAssetId.isEmpty
                else { return nil }

                let timelineStart = max(0, decision.timelineStart ?? 0)
                let duration = max(0.05, decision.duration ?? 0.05)
                let sourceStart = max(0, decision.sourceStart ?? 0)

                return LocalEpisodeEditDecision(
                    id: id,
                    sourceAssetId: sourceAssetId,
                    outputId: decision.outputId ?? "program-16x9",
                    trackId: decision.trackId ?? "V1",
                    timelineStart: timelineStart,
                    duration: duration,
                    sourceStart: sourceStart,
                    sourceEnd: max(sourceStart + duration, decision.sourceEnd ?? (sourceStart + duration)),
                    isActive: decision.isActive ?? true,
                    kind: decision.kind ?? "video",
                    label: decision.label ?? (decision.isActive == false ? "Inactive edit decision" : "Edit decision"),
                    generatedFrom: decision.generatedFrom ?? "quipsly-edit-graph"
                )
            }
        } else {
            // Fallback: derive decisions from timeline clips
            let activeDecisions = draft.timelineClips.map { clip in
                LocalEpisodeEditDecision(
                    id: clip.id,
                    sourceAssetId: clip.premiereAssetId,
                    outputId: "program-16x9",
                    trackId: clip.trackId,
                    timelineStart: clip.startIn,
                    duration: clip.duration,
                    sourceStart: clip.sourceStart,
                    sourceEnd: clip.sourceEnd,
                    isActive: !clip.deactivated,
                    kind: clip.kind,
                    label: clip.name,
                    generatedFrom: clip.generatedFrom
                )
            }
            
            let inactiveGapDecisions = draft.deactivatedSourceRanges.compactMap { range -> LocalEpisodeEditDecision? in
                guard range.deactivated, range.confidence?.lowercased() != "low" else { return nil }
                let sameAssetClips = draft.timelineClips.filter { clip in
                    clip.premiereAssetId == range.premiereAssetId && clip.kind.lowercased() == range.kind.lowercased()
                }
                guard !sameAssetClips.isEmpty else { return nil }
                
                let trackId = LocalEpisodeEditSession.dominantTrackID(in: sameAssetClips, fallbackKind: range.kind)
                let previousClip = sameAssetClips.filter { $0.sourceEnd <= range.sourceStart + 0.001 }.max { $0.sourceEnd < $1.sourceEnd }
                let nextClip = sameAssetClips.filter { $0.sourceStart >= range.sourceEnd - 0.001 }.min { $0.sourceStart < $1.sourceStart }
                
                guard previousClip != nil || nextClip != nil else { return nil }
                
                let inferredStartIn = previousClip.map { $0.startIn + $0.duration } ?? max(0, (nextClip?.startIn ?? 0) - range.duration)
                
                return LocalEpisodeEditDecision(
                    id: "inactive-\(range.id)",
                    sourceAssetId: range.premiereAssetId,
                    outputId: "program-16x9",
                    trackId: trackId,
                    timelineStart: max(0, inferredStartIn),
                    duration: max(0.05, range.duration),
                    sourceStart: range.sourceStart,
                    sourceEnd: range.sourceEnd,
                    isActive: false,
                    kind: range.kind,
                    label: "Omitted source range",
                    generatedFrom: "quipsly-mac-premiere-deactivated-source-range"
                )
            }
            
            generatedDecisions = activeDecisions + inactiveGapDecisions
        }
        
        let sourcesByAssetID = Dictionary(grouping: self.sources, by: \.sourceAssetId)
        self.editDecisions = generatedDecisions.map { decision in
            var enriched = decision
            if let source = sourcesByAssetID[decision.sourceAssetId]?.first {
                enriched.localMediaPath = source.localMediaPath
                enriched.playbackMediaPath = source.playbackMediaPath
                enriched.mediaDisplayName = source.displayName
                enriched.mediaKind = source.mediaKind ?? source.kind
                enriched.mediaExists = source.mediaExists
            }
            return enriched
        }
        .sorted(by: LocalEpisodeEditSession.editDecisionSortForModel)
        self.textOverlays = []
        self.notes = "Local Quipsly edit session generated from the recovered Premiere packet."
    }

    mutating func refreshMediaLinks(from draft: PremiereDraftEditPacket) -> Bool {
        let matchesByPremiereAssetId = Dictionary(uniqueKeysWithValues: draft.assetMatches.map { ($0.premiereAssetId, $0) })
        var changed = false

        for index in sources.indices {
            let match = matchesByPremiereAssetId[sources[index].sourceAssetId]
            changed = sources[index].refreshMediaLink(assetMatch: match) || changed
        }

        if changed {
            updatedAt = Date().ISO8601Format()
        }

        return changed
    }

    var activeEditDecisions: [LocalEpisodeEditDecision] {
        editDecisions.filter { $0.isActive }
    }

    var inactiveEditDecisions: [LocalEpisodeEditDecision] {
        editDecisions.filter { !$0.isActive }
    }

    var activeClips: [LocalEpisodeEditDecision] {
        activeEditDecisions
    }

    var inactiveClips: [LocalEpisodeEditDecision] {
        inactiveEditDecisions
    }

    var activeDecisions: [LocalEpisodeEditDecision] {
        activeEditDecisions
    }

    var inactiveDecisions: [LocalEpisodeEditDecision] {
        inactiveEditDecisions
    }

    var inactiveGapDecisionCount: Int {
        inactiveEditDecisions.filter { $0.isPremiereImportedSkip }.count
    }

    var inactiveGapClipCount: Int {
        inactiveGapDecisionCount
    }

    var activeDuration: Double {
        activeEditDecisions.reduce(0) { $0 + $1.duration }
    }

    var programDuration: Double {
        editDecisions.map { $0.timelineStart + $0.duration }.max() ?? 0
    }

    var videoDecisionCount: Int {
        editDecisions.filter { $0.trackId.hasPrefix("V") || $0.kind == "video" }.count
    }

    var audioDecisionCount: Int {
        editDecisions.filter { $0.trackId.hasPrefix("A") || $0.kind == "audio" }.count
    }

    var sourcesWithMediaPathCount: Int {
        sources.filter { $0.hasMediaPath }.count
    }

    var playableLocalMediaCount: Int {
        sources.filter { $0.hasPlayableLocalMedia }.count
    }

    var playableLocalVideoCount: Int {
        sources.filter { $0.isVideoLike && $0.hasPlayableLocalMedia }.count
    }

    var linkedUncachedVideoCount: Int {
        sources.filter { $0.isVideoLike && $0.hasMediaPath && !$0.hasPlayableLocalMedia }.count
    }

    var missingUniqueMediaPathCount: Int {
        let uniquePaths = Set(
            sources.compactMap(\.localMediaPath)
                .filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        )
        let missingPaths = uniquePaths.filter { !quipslyFileExists(atPath: $0) }
        return missingPaths.count
    }

    var linkedEditDecisionMediaPathCount: Int {
        editDecisions.filter { $0.hasMediaPath }.count
    }

    var playableLocalDecisionMediaCount: Int {
        editDecisions.filter { $0.hasPlayableLocalMedia }.count
    }

    var playableLocalDecisionVideoCount: Int {
        editDecisions.filter { $0.isVideoLike && $0.hasPlayableLocalMedia }.count
    }

    private static func dominantTrackID(in clips: [PremiereDraftTimelineClip], fallbackKind: String) -> String {
        let grouped = Dictionary(grouping: clips, by: \.trackId)
        if let dominant = grouped.max(by: { left, right in left.value.count < right.value.count })?.key {
            return dominant
        }
        return fallbackKind.lowercased() == "audio" ? "A1" : "V1"
    }

    static func editDecisionSortForModel(_ left: LocalEpisodeEditDecision, _ right: LocalEpisodeEditDecision) -> Bool {
        if abs(left.timelineStart - right.timelineStart) > 0.001 {
            return left.timelineStart < right.timelineStart
        }
        if left.trackId != right.trackId {
            return compareTrackIDsForModel(left.trackId, right.trackId)
        }
        if left.isActive != right.isActive {
            return left.isActive && !right.isActive
        }
        return left.id < right.id
    }

    static func compareTrackIDsForModel(_ left: String, _ right: String) -> Bool {
        modelTrackSortKey(left) < modelTrackSortKey(right)
    }

    private static func modelTrackSortKey(_ trackID: String) -> Int {
        let upper = trackID.uppercased()
        let prefixWeight: Int
        if upper.hasPrefix("V") { prefixWeight = 0 }
        else if upper.hasPrefix("A") { prefixWeight = 10_000 }
        else { prefixWeight = 20_000 }
        let number = Int(upper.dropFirst().filter { $0.isNumber }) ?? 0
        return prefixWeight + number
    }
}

struct LocalEpisodeTextOverlay: Codable, Identifiable, Equatable {
    var id: String
    var title: String
    var startSec: Double
    var endSec: Double
}

struct LocalEpisodeSource: Codable, Identifiable, Equatable {
    var id: String
    var sourceAssetId: String
    var displayName: String
    var kind: String
    var trackIDs: [String]
    var duration: Double
    var programStart: Double
    var programEnd: Double
    var localMediaPath: String?
    var playbackMediaPath: String?
    var mediaKind: String?
    var mediaExists: Bool?
    var generatedFrom: String

    var isVideoLike: Bool {
        trackIDs.contains { $0.uppercased().hasPrefix("V") } || kind.lowercased() == "video" || mediaKind?.lowercased() == "video"
    }

    var hasMediaPath: Bool {
        !(localMediaPath ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var hasPlayableLocalMedia: Bool {
        if let playbackMediaPath, !playbackMediaPath.isEmpty, quipslyFileExists(atPath: playbackMediaPath) {
            return true
        }
        return false
    }

    var playableLocalVideoURL: URL? {
        guard isVideoLike, let path = preferredPlayablePath else { return nil }
        return URL(fileURLWithPath: path)
    }

    var preferredPlayablePath: String? {
        if let playbackMediaPath, !playbackMediaPath.isEmpty, quipslyFileExists(atPath: playbackMediaPath) {
            return playbackMediaPath
        }
        return nil
    }

    var mediaReadinessLabel: String {
        if let playbackMediaPath, !playbackMediaPath.isEmpty, quipslyFileExists(atPath: playbackMediaPath) {
            return "Playable cached file"
        }
        if hasPlayableLocalMedia { return "Playable local file" }
        if hasMediaPath { return "Source path known; cache needed" }
        return "No local media linked"
    }
    
    var sourceGapGroupLabel: String {
        "\(trackIDs.first ?? "U") \(displayName)"
    }
    
    mutating func refreshMediaLink(assetMatch: PremiereDraftAssetMatch?) -> Bool {
        let nextDisplayName = assetMatch?.displayName ?? displayName
        let draftPath = assetMatch?.localPath
        let nextKind = assetMatch?.kind ?? mediaKind
        let currentPath = localMediaPath
        let currentPathExists = currentPath.map { quipslyFileExists(atPath: $0) } ?? false
        let draftPathExists = draftPath.map { quipslyFileExists(atPath: $0) } ?? false
        let shouldKeepCurrentPath = currentPathExists && (!draftPathExists || currentPath != draftPath)
        let nextPath = shouldKeepCurrentPath ? currentPath : draftPath
        let nextExists = nextPath.map { quipslyFileExists(atPath: $0) }

        let changed = displayName != nextDisplayName
            || localMediaPath != nextPath
            || mediaKind != nextKind
            || mediaExists != nextExists

        displayName = nextDisplayName
        localMediaPath = nextPath
        mediaKind = nextKind
        mediaExists = nextExists

        return changed
    }
}

struct LocalEpisodeEditDecision: Codable, Identifiable, Equatable {
    var id: String
    var sourceAssetId: String
    var outputId: String
    var trackId: String
    var timelineStart: Double
    var duration: Double
    var sourceStart: Double
    var sourceEnd: Double
    var isActive: Bool
    var kind: String
    var label: String
    var generatedFrom: String
    var motion: LocalEpisodeClipMotionEnvelope?
    var volume: Double?
    var isShortsIncluded: Bool?
    var localMediaPath: String?
    var playbackMediaPath: String?
    var mediaDisplayName: String?
    var mediaKind: String?
    var mediaExists: Bool?

    var timelineEnd: Double {
        timelineStart + duration
    }

    var isVideoLike: Bool {
        trackId.uppercased().hasPrefix("V") || kind.lowercased() == "video"
    }

    var isPremiereImportedSkip: Bool {
        !isActive && generatedFrom.lowercased().contains("premiere")
    }

    var isPremiereInactiveGap: Bool {
        isPremiereImportedSkip
    }

    var hasMediaPath: Bool {
        !(localMediaPath ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var countsForRequiredMediaRelink: Bool {
        isActive && (trackId.uppercased().hasPrefix("V") || trackId.uppercased().hasPrefix("A"))
    }
    
    var primaryMotionKeyframe: LocalEpisodeClipMotionKeyframe {
        motion?.keyframes?.first ?? LocalEpisodeClipMotionKeyframe(
            time: 0, scale: 1, x: 0, y: 0, cropTop: nil, cropRight: nil, cropBottom: nil, cropLeft: nil, opacity: 1
        )
    }

    var hasMotionEnvelope: Bool {
        motion?.keyframes?.isEmpty == false
    }

    var motionSummaryLabel: String {
        let keyframe = primaryMotionKeyframe
        let scale = keyframe.scale ?? 1
        let x = keyframe.x ?? 0
        let y = keyframe.y ?? 0
        let opacity = keyframe.opacity ?? 1

        if !hasMotionEnvelope { return "Motion: default framing" }
        return String(format: "Motion: %.2fx, pan %.0f/%.0f, opacity %.0f%%", scale, x, y, opacity * 100)
    }

    var localMediaExists: Bool {
        guard let localMediaPath, !localMediaPath.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return false
        }
        return quipslyFileExists(atPath: localMediaPath)
    }

    var playbackMediaExists: Bool {
        guard let playbackMediaPath, !playbackMediaPath.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return false
        }
        return quipslyFileExists(atPath: playbackMediaPath)
    }

    var hasPlayableLocalMedia: Bool {
        playbackMediaExists
    }

    var preferredPlayablePath: String? {
        if playbackMediaExists {
            return playbackMediaPath
        }
        return nil
    }

    var playableLocalVideoURL: URL? {
        guard isVideoLike, let path = preferredPlayablePath else { return nil }
        return URL(fileURLWithPath: path)
    }

    var mediaReadinessLabel: String {
        if playbackMediaExists { return "Playable cached file" }
        if localMediaExists { return "Source path known; cache needed" }
        if hasMediaPath { return "Source path missing on this Mac" }
        return "No local media linked"
    }

    var sourceGapGroupLabel: String {
        "\(trackId) \(mediaDisplayName ?? label)"
    }
}

struct LocalEpisodeClipMotionEnvelope: Codable, Equatable {
    var schemaVersion: Int?
    var keyframes: [LocalEpisodeClipMotionKeyframe]?
    var notes: String?
}

struct LocalEpisodeClipMotionKeyframe: Codable, Equatable {
    var time: Double?
    var scale: Double?
    var x: Double?
    var y: Double?
    var cropTop: Double?
    var cropRight: Double?
    var cropBottom: Double?
    var cropLeft: Double?
    var opacity: Double?
}

struct LocalEpisodeRenderPrepManifest: Codable, Equatable {
    var schemaVersion: Int
    var generatedAt: String
    var projectSlug: String
    var episodeSlug: String
    var sessionId: String
    var sessionUpdatedAt: String
    var readiness: String
    var programDuration: Double
    var activeEditDuration: Double
    var decisionCount: Int
    var activeDecisionCount: Int
    var inactiveDecisionCount: Int
    var videoTrackIds: [String]
    var audioTrackIds: [String]
    var decisions: [LocalEpisodeRenderPrepDecision]
    var loopClips: [LocalEpisodeTextOverlay]?
    var blockers: [String]
    var warnings: [String]
    var outputPlan: LocalEpisodeRenderOutputPlan
}

struct LocalEpisodeRenderOutputPlan: Codable, Equatable {
    var mode: String
    var inactivePolicy: String
    var sourcePolicy: String
    var motionPolicy: String
    var rendererStatus: String
    var notes: String
}

struct LocalEpisodeRenderPrepDecision: Codable, Equatable {
    var id: String
    var sourceAssetId: String
    var name: String
    var kind: String
    var isVideoLike: Bool
    var trackId: String
    var editStart: Double
    var editEnd: Double
    var duration: Double
    var sourceStart: Double
    var sourceEnd: Double
    var isActive: Bool
    var renderDisposition: String
    var generatedFrom: String
    var motion: LocalEpisodeClipMotionEnvelope?
    var volume: Double
    var localMediaExists: Bool
    var playbackMediaExists: Bool

    init(decision: LocalEpisodeEditDecision) {
        self.id = decision.id
        self.sourceAssetId = decision.sourceAssetId
        self.name = decision.label
        self.kind = decision.kind
        self.isVideoLike = decision.isVideoLike
        self.trackId = decision.trackId
        self.editStart = decision.timelineStart
        self.editEnd = decision.timelineStart + decision.duration
        self.duration = decision.duration
        self.sourceStart = decision.sourceStart
        self.sourceEnd = decision.sourceEnd
        self.isActive = decision.isActive
        self.renderDisposition = decision.isActive ? "play-edit-included" : "preserved-skipped"
        self.generatedFrom = decision.generatedFrom
        self.motion = decision.motion
        self.volume = decision.volume ?? 1.0
        self.localMediaExists = decision.localMediaExists
        self.playbackMediaExists = decision.playbackMediaExists
    }
}
