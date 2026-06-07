import Foundation

struct KnownPremiereImportRunResult: Codable, Equatable {
    var ok: Bool
    var status: String
    var message: String
    var stdout: String?
    var stderr: String?
    var summaries: [KnownPremiereImportSummary]
}

struct KnownPremiereImportSummary: Codable, Identifiable, Equatable {
    var episodeSlug: String
    var outputPath: String
    var ok: Bool
    var message: String?
    var projectSlug: String?
    var mediaCount: Int?
    var importMediaCount: Int?
    var projectMediaCount: Int?
    var skippedProjectMediaCount: Int?
    var missingMediaCount: Int?
    var projectMissingMediaCount: Int?
    var iCloudHistoryCount: Int?
    var projectICloudHistoryCount: Int?
    var primarySequenceName: String?
    var primaryTimelineClipCount: Int?
    var deactivatedCandidateCount: Int?
    var topSpineName: String?
    var topSpineExists: Bool?
    var topSpineUsedTimelineSeconds: Double?
    var topSpineRecommendation: String?

    var id: String { episodeSlug }

    var healthLabel: String {
        guard ok else { return "Missing packet" }
        if (missingMediaCount ?? 0) > 0 { return "Needs recovery" }
        return "Ready to stage"
    }
}

struct PremiereMediaRelinkRunResult: Codable, Equatable {
    var ok: Bool
    var status: String?
    var message: String?
    var packetPath: String?
    var outputPath: String?
    var applied: Bool?
    var searchRoots: [String]?
    var scannedFiles: Int?
    var scannedDirs: Int?
    var missingBefore: Int?
    var missingAfter: Int?
    var relinkedCount: Int?
    var unresolvedCount: Int?
    var ambiguousCount: Int?
    var results: [PremiereMediaRelinkItemResult]?
    var warnings: [String]?
    var summary: KnownPremiereImportSummary?

    var plainEnglishSummary: String {
        if ok {
            return message ?? "Media recovery scan finished."
        }

        return message ?? "Media recovery scan failed safely."
    }
}

struct PremiereMediaRelinkItemResult: Codable, Identifiable, Equatable {
    var assetId: String
    var originalName: String?
    var oldPath: String?
    var kind: String?
    var status: String?
    var selectedPath: String?
    var candidateCount: Int?
    var candidates: [PremiereMediaRelinkCandidate]?

    var id: String { assetId }
}

struct PremiereMediaRelinkCandidate: Codable, Equatable {
    var path: String
    var size: Int?
    var modifiedAt: String?
    var score: Int?
}

struct PremiereImportPacket: Codable {
    var projectSlug: String
    var episodeSlug: String
    var summary: PremiereImportSummary?
    var media: [PremierePacketMedia]
    var quipslyEpisodeProductionPatch: PremierePacketProductionPatch?

    var availableMedia: [PremierePacketMedia] {
        media.filter(\.isLocallyAvailable)
    }

    var heldMedia: [PremierePacketMedia] {
        media.filter { !$0.isLocallyAvailable }
    }

    var recommendedSpineAssetId: String? {
        let availableIds = Set(availableMedia.map(\.id))
        return quipslyEpisodeProductionPatch?
            .premiereSuggestedSpineAudioCandidates?
            .first { candidate in
                candidate.exists == true && availableIds.contains(candidate.assetId)
            }?
            .assetId
    }

    func role(for media: PremierePacketMedia) -> EpisodeImportRole {
        if media.id == recommendedSpineAssetId {
            return .spineAudio
        }

        switch media.kind.lowercased() {
        case "audio":
            return .audioSource
        case "video":
            return media.isProxy == true ? .referenceClip : .cameraVideo
        default:
            return .referenceClip
        }
    }
}

struct PremiereImportSummary: Codable {
    var importMediaCount: Int?
    var mediaCount: Int?
    var primarySequenceMediaCount: Int?
    var projectMediaCount: Int?
    var skippedProjectMediaCount: Int?
    var missingMediaCount: Int?
    var projectMissingMediaCount: Int?
    var iCloudHistoryCount: Int?
    var projectICloudHistoryCount: Int?
    var clipCount: Int?
    var primarySequenceName: String?
}

struct PremierePacketMedia: Codable, Identifiable, Equatable {
    var id: String
    var title: String?
    var originalName: String?
    var filePath: String
    var actualMediaFilePath: String?
    var kind: String
    var durationSeconds: Double?
    var isProxy: Bool?
    var health: PremierePacketMediaHealth?

    var localPath: String {
        if let actualMediaFilePath, !actualMediaFilePath.isEmpty {
            return actualMediaFilePath
        }
        return filePath
    }

    var displayName: String {
        if let originalName, !originalName.isEmpty {
            return originalName
        }
        if let title, !title.isEmpty {
            return title
        }
        return URL(fileURLWithPath: filePath).lastPathComponent
    }

    var isLocallyAvailable: Bool {
        health?.exists == true
    }

    var holdReason: String {
        if health?.iCloudHistory == true {
            return "Premiere only gave us an iCloud history path. Download or relink the original media locally, then retry."
        }

        if health?.needsLocalDownload == true {
            return "This file needs to be downloaded locally before Quipsly can probe or proxy it."
        }

        if health?.exists == false {
            return "The file was referenced by Premiere but is not currently present at this path."
        }

        return "Quipsly could not confirm the local file yet."
    }
}

struct PremierePacketMediaHealth: Codable, Equatable {
    var exists: Bool?
    var iCloudHistory: Bool?
    var needsLocalDownload: Bool?
    var downloadHints: [String]?
}

struct PremierePacketProductionPatch: Codable {
    var timelineClips: [PremierePacketTimelineClip]?
    var premiereDeactivatedSourceCandidates: [PremierePacketDeactivatedRange]?
    var premiereSuggestedSpineAudioCandidates: [PremiereSpineCandidate]?
}

struct PremierePacketTimelineClip: Codable {
    var id: String?
    var assetId: String?
    var sourceId: String?
    var kind: String?
    var trackId: String?
    var startIn: Double?
    var duration: Double?
    var sourceStart: Double?
    var sourceEnd: Double?
    var name: String?
    var color: String?
    var deactivated: Bool?
    var generatedFrom: String?
}

struct PremierePacketDeactivatedRange: Codable {
    var id: String?
    var assetId: String?
    var kind: String?
    var sourceStart: Double?
    var sourceEnd: Double?
    var duration: Double?
    var deactivated: Bool?
    var confidence: String?
    var reason: String?
}

struct PremiereSpineCandidate: Codable {
    var assetId: String
    var originalName: String?
    var exists: Bool?
    var usedTimelineSeconds: Double?
    var sourceDurationSeconds: Double?
    var recommendation: String?
}

struct PremierePacketStageRecord: Codable, Identifiable, Equatable {
    var id: String
    var projectSlug: String
    var episodeSlug: String
    var primarySequenceName: String?
    var stagedAt: String
    var mediaCount: Int
    var readyCount: Int
    var heldCount: Int
    var timelineClipCount: Int
    var inactiveRangeCount: Int
    var suggestedSpineName: String?

    init(packet: PremiereImportPacket, readyCount: Int, heldCount: Int) {
        self.id = "\(packet.projectSlug)-\(packet.episodeSlug)"
        self.projectSlug = packet.projectSlug
        self.episodeSlug = packet.episodeSlug
        self.primarySequenceName = packet.summary?.primarySequenceName
        self.stagedAt = Date().ISO8601Format()
        self.mediaCount = packet.media.count
        self.readyCount = readyCount
        self.heldCount = heldCount
        self.timelineClipCount = packet.quipslyEpisodeProductionPatch?.timelineClips?.count ?? 0
        self.inactiveRangeCount = packet.quipslyEpisodeProductionPatch?.premiereDeactivatedSourceCandidates?.count ?? 0
        self.suggestedSpineName = packet.quipslyEpisodeProductionPatch?
            .premiereSuggestedSpineAudioCandidates?
            .first(where: { $0.assetId == packet.recommendedSpineAssetId })?
            .originalName
    }
}

struct PremiereDraftEditPacket: Codable, Identifiable, Equatable {
    var id: String
    var packetVersion: Int
    var source: String
    var generatedAt: String
    var projectSlug: String
    var episodeSlug: String
    var primarySequenceName: String?
    var summary: PremiereDraftSummary
    var assetMatches: [PremiereDraftAssetMatch]
    var timelineClips: [PremiereDraftTimelineClip]
    var deactivatedSourceRanges: [PremiereDraftDeactivatedRange]
    var suggestedSpine: PremiereDraftSuggestedSpine?
    var warnings: [String]

    var matchedTimelineClipCount: Int {
        timelineClips.filter { $0.assetMatched }.count
    }

    var unmatchedTimelineClipCount: Int {
        timelineClips.count - matchedTimelineClipCount
    }

    var compactJSONString: String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        guard let data = try? encoder.encode(self) else {
            return "{\"packetVersion\":1,\"source\":\"quipsly-mac-premiere-draft-edit\",\"error\":\"encode-failed\"}"
        }
        return String(decoding: data, as: UTF8.self)
    }

    var canStageMatchedOnlyRescue: Bool {
        matchedTimelineClipCount > 0 && unmatchedTimelineClipCount > 0
    }

    var matchedOnlyRescueDraft: PremiereDraftEditPacket {
        var draft = self
        let originalTimelineClipCount = timelineClips.count
        let originalInactiveRangeCount = deactivatedSourceRanges.count
        let skippedMediaCount = assetMatches.filter { $0.status != "matched" }.count

        draft.id = "\(id)-matched-only-rescue"
        draft.source = "quipsly-mac-premiere-matched-only-rescue-draft-edit"
        draft.timelineClips = timelineClips.filter(\.assetMatched)
        draft.deactivatedSourceRanges = deactivatedSourceRanges.filter(\.assetMatched)
        draft.summary = PremiereDraftSummary(
            mediaCount: summary.mediaCount,
            readyMediaCount: summary.readyMediaCount,
            heldMediaCount: summary.heldMediaCount,
            timelineClipCount: draft.timelineClips.count,
            matchedTimelineClipCount: draft.timelineClips.count,
            deactivatedSourceRangeCount: draft.deactivatedSourceRanges.count,
            skippedTimelineClipCount: originalTimelineClipCount - draft.timelineClips.count,
            skippedMediaCount: skippedMediaCount,
            skippedDeactivatedSourceRangeCount: originalInactiveRangeCount - draft.deactivatedSourceRanges.count
        )
        draft.warnings.append(
            "Matched-only rescue draft: skipped \(unmatchedTimelineClipCount) unmatched Premiere timeline clip(s) so the edit can be reviewed now. Missing media remains recoverable from the original packet."
        )
        if skippedMediaCount > 0 {
            draft.warnings.append(
                "Skipped \(skippedMediaCount) media item(s) that are not registered as Quipsly assets yet. Import/relink them later, then regenerate the full draft."
            )
        }

        return draft
    }

    static func build(packet: PremiereImportPacket, importJobs: [EpisodeImportJob]) -> PremiereDraftEditPacket {
        let jobPrefix = "premiere-\(packet.projectSlug)-\(packet.episodeSlug)-"
        let jobsByPremiereAssetId = Dictionary(uniqueKeysWithValues: importJobs.compactMap { job -> (String, EpisodeImportJob)? in
            guard job.id.hasPrefix(jobPrefix) else { return nil }
            return (String(job.id.dropFirst(jobPrefix.count)), job)
        })

        let assetMatches = packet.media.map { media in
            PremiereDraftAssetMatch(media: media, job: jobsByPremiereAssetId[media.id])
        }

        let clips = (packet.quipslyEpisodeProductionPatch?.timelineClips ?? []).map { clip in
            PremiereDraftTimelineClip(clip: clip, job: jobsByPremiereAssetId[clip.assetId ?? ""])
        }

        let ranges = (packet.quipslyEpisodeProductionPatch?.premiereDeactivatedSourceCandidates ?? []).map { range in
            PremiereDraftDeactivatedRange(range: range, job: jobsByPremiereAssetId[range.assetId ?? ""])
        }

        let suggestedSpine = packet.quipslyEpisodeProductionPatch?
            .premiereSuggestedSpineAudioCandidates?
            .first(where: { $0.assetId == packet.recommendedSpineAssetId })
            .map { PremiereDraftSuggestedSpine(candidate: $0, job: jobsByPremiereAssetId[$0.assetId]) }

        let unmatchedClips = clips.filter { !$0.assetMatched }.count
        let heldAssets = assetMatches.filter { $0.status == "held" }.count
        var warnings: [String] = []
        if unmatchedClips > 0 {
            warnings.append("\(unmatchedClips) timeline clip(s) still point to Premiere media that has not been registered as a Quipsly asset.")
        }
        if heldAssets > 0 {
            warnings.append("\(heldAssets) media item(s) are held because the local file is missing, iCloud-only, or not ready yet.")
        }
        if suggestedSpine == nil {
            warnings.append("No available spine audio has been confirmed. Choose one before treating this as a production edit.")
        }

        return PremiereDraftEditPacket(
            id: "\(packet.projectSlug)-\(packet.episodeSlug)",
            packetVersion: 1,
            source: "quipsly-mac-premiere-draft-edit",
            generatedAt: Date().ISO8601Format(),
            projectSlug: packet.projectSlug,
            episodeSlug: packet.episodeSlug,
            primarySequenceName: packet.summary?.primarySequenceName,
            summary: PremiereDraftSummary(
                mediaCount: packet.media.count,
                readyMediaCount: packet.availableMedia.count,
                heldMediaCount: packet.heldMedia.count,
                timelineClipCount: clips.count,
                matchedTimelineClipCount: clips.filter { $0.assetMatched }.count,
                deactivatedSourceRangeCount: ranges.count,
                skippedTimelineClipCount: 0,
                skippedMediaCount: 0,
                skippedDeactivatedSourceRangeCount: 0
            ),
            assetMatches: assetMatches,
            timelineClips: clips,
            deactivatedSourceRanges: ranges,
            suggestedSpine: suggestedSpine,
            warnings: warnings
        )
    }
}

struct PremiereDraftSummary: Codable, Equatable {
    var mediaCount: Int
    var readyMediaCount: Int
    var heldMediaCount: Int
    var timelineClipCount: Int
    var matchedTimelineClipCount: Int
    var deactivatedSourceRangeCount: Int
    var skippedTimelineClipCount: Int?
    var skippedMediaCount: Int?
    var skippedDeactivatedSourceRangeCount: Int?
}

struct PremiereDraftAssetMatch: Codable, Identifiable, Equatable {
    var id: String
    var premiereAssetId: String
    var displayName: String
    var kind: String
    var localPath: String
    var importJobId: String?
    var registeredAssetId: String?
    var status: String
    var message: String?

    init(media: PremierePacketMedia, job: EpisodeImportJob?) {
        self.id = media.id
        self.premiereAssetId = media.id
        self.displayName = media.displayName
        self.kind = media.kind
        self.localPath = media.localPath
        self.importJobId = job?.id
        self.registeredAssetId = job?.registration?.assetId

        if job?.registration?.assetId != nil {
            self.status = "matched"
        } else if job?.status == .held || !media.isLocallyAvailable {
            self.status = "held"
        } else if job != nil {
            self.status = "waiting-for-registration"
        } else {
            self.status = "not-staged"
        }

        self.message = job?.message ?? (!media.isLocallyAvailable ? media.holdReason : nil)
    }
}

struct PremiereDraftTimelineClip: Codable, Identifiable, Equatable {
    var id: String
    var assetId: String
    var premiereAssetId: String
    var importJobId: String?
    var sourceId: String?
    var kind: String
    var trackId: String
    var startIn: Double
    var duration: Double
    var sourceStart: Double
    var sourceEnd: Double
    var name: String
    var color: String?
    var deactivated: Bool
    var generatedFrom: String
    var assetMatched: Bool
    var matchStatus: String

    init(clip: PremierePacketTimelineClip, job: EpisodeImportJob?) {
        let premiereAssetId = clip.assetId ?? clip.sourceId ?? "unknown-premiere-asset"
        let duration = max(0.05, clip.duration ?? 0.05)
        let sourceStart = max(0, clip.sourceStart ?? 0)

        self.id = clip.id ?? "premiere-draft-clip-\(UUID().uuidString)"
        self.assetId = job?.registration?.assetId ?? premiereAssetId
        self.premiereAssetId = premiereAssetId
        self.importJobId = job?.id
        self.sourceId = clip.sourceId
        self.kind = clip.kind ?? (clip.trackId?.hasPrefix("A") == true ? "audio" : "video")
        self.trackId = clip.trackId ?? (self.kind == "audio" ? "A1" : "V1")
        self.startIn = max(0, clip.startIn ?? 0)
        self.duration = duration
        self.sourceStart = sourceStart
        self.sourceEnd = max(sourceStart + duration, clip.sourceEnd ?? (sourceStart + duration))
        self.name = clip.name ?? "Premiere clip"
        self.color = clip.color
        self.deactivated = clip.deactivated ?? false
        self.generatedFrom = "quipsly-mac-premiere-draft-edit"
        self.assetMatched = job?.registration?.assetId != nil

        if job?.registration?.assetId != nil {
            self.matchStatus = "matched"
        } else if job?.status == .held {
            self.matchStatus = "held"
        } else if job != nil {
            self.matchStatus = "waiting-for-registration"
        } else {
            self.matchStatus = "not-staged"
        }
    }
}

struct PremiereDraftDeactivatedRange: Codable, Identifiable, Equatable {
    var id: String
    var assetId: String
    var premiereAssetId: String
    var importJobId: String?
    var kind: String
    var sourceStart: Double
    var sourceEnd: Double
    var duration: Double
    var deactivated: Bool
    var confidence: String?
    var reason: String?
    var assetMatched: Bool
    var matchStatus: String

    init(range: PremierePacketDeactivatedRange, job: EpisodeImportJob?) {
        let premiereAssetId = range.assetId ?? "unknown-premiere-asset"
        let duration = max(0.05, range.duration ?? 0.05)
        let sourceStart = max(0, range.sourceStart ?? 0)

        self.id = range.id ?? "premiere-draft-range-\(UUID().uuidString)"
        self.assetId = job?.registration?.assetId ?? premiereAssetId
        self.premiereAssetId = premiereAssetId
        self.importJobId = job?.id
        self.kind = range.kind ?? "unknown"
        self.sourceStart = sourceStart
        self.sourceEnd = max(sourceStart + duration, range.sourceEnd ?? (sourceStart + duration))
        self.duration = duration
        self.deactivated = true
        self.confidence = range.confidence
        self.reason = range.reason
        self.assetMatched = job?.registration?.assetId != nil

        if job?.registration?.assetId != nil {
            self.matchStatus = "matched"
        } else if job?.status == .held {
            self.matchStatus = "held"
        } else if job != nil {
            self.matchStatus = "waiting-for-registration"
        } else {
            self.matchStatus = "not-staged"
        }
    }
}

struct PremiereDraftSuggestedSpine: Codable, Equatable {
    var premiereAssetId: String
    var registeredAssetId: String?
    var importJobId: String?
    var originalName: String?
    var usedTimelineSeconds: Double?
    var sourceDurationSeconds: Double?
    var recommendation: String?
    var matchStatus: String

    init(candidate: PremiereSpineCandidate, job: EpisodeImportJob?) {
        self.premiereAssetId = candidate.assetId
        self.registeredAssetId = job?.registration?.assetId
        self.importJobId = job?.id
        self.originalName = candidate.originalName
        self.usedTimelineSeconds = candidate.usedTimelineSeconds
        self.sourceDurationSeconds = candidate.sourceDurationSeconds
        self.recommendation = candidate.recommendation

        if job?.registration?.assetId != nil {
            self.matchStatus = "matched"
        } else if job?.status == .held {
            self.matchStatus = "held"
        } else if job != nil {
            self.matchStatus = "waiting-for-registration"
        } else {
            self.matchStatus = "not-staged"
        }
    }
}
