import Foundation

struct EpisodeSyncDiagnosticsPacket: Codable {
    var packetVersion: Int
    var source: String
    var exportedAt: String
    var projectSlug: String
    var episodeSlug: String
    var spine: EpisodeSyncDiagnosticsSpine?
    var assets: [EpisodeSyncDiagnosticsAsset]
    var timelineClips: [EpisodeSyncDiagnosticsTimelineClip]
    var warnings: [String]

    static func build(projectSlug: String, episodeSlug: String, jobs: [EpisodeImportJob], offsetsByJobID: [String: Double]) -> EpisodeSyncDiagnosticsPacket {
        let sortedJobs = jobs.sorted { $0.queuedAt > $1.queuedAt }
        let spineJob = sortedJobs.first { $0.role == .spineAudio }
        let assets: [EpisodeSyncDiagnosticsAsset] = sortedJobs.map { diagnosticsAsset(for: $0, offsetSeconds: offsetsByJobID[$0.id]) }
        let timelineClips = sortedJobs.compactMap { job -> EpisodeSyncDiagnosticsTimelineClip? in
            guard let result = job.timelineAttachResult, result.ok else { return nil }
            return EpisodeSyncDiagnosticsTimelineClip(
                clipId: result.clipId,
                assetId: job.registration?.assetId,
                importJobId: job.id,
                trackId: result.trackId,
                startIn: result.startIn,
                duration: result.duration,
                placement: result.placement,
                alreadyAttached: result.alreadyAttached,
                kind: job.proxy?.kind ?? (job.probe?.hasVideo == true ? "video" : job.probe?.hasAudio == true ? "audio" : "unknown")
            )
        }
        let warnings = assets.flatMap { $0.warnings }

        return EpisodeSyncDiagnosticsPacket(
            packetVersion: 1,
            source: "quipsly-mac-sync-prep",
            exportedAt: Date().ISO8601Format(),
            projectSlug: projectSlug,
            episodeSlug: episodeSlug,
            spine: spineJob.map {
                EpisodeSyncDiagnosticsSpine(
                    importJobId: $0.id,
                    assetId: $0.registration?.assetId,
                    displayName: $0.displayName,
                    durationSeconds: $0.probe?.durationSeconds ?? $0.proxy?.durationSeconds,
                    recordedStartAt: $0.recordingSyncMetadata?.recordedStartAt,
                    recordedEndAt: $0.recordingSyncMetadata?.recordedEndAt,
                    deviceLabel: $0.recordingSyncMetadata?.deviceLabel
                )
            },
            assets: assets,
            timelineClips: timelineClips,
            warnings: Array(Set(warnings)).sorted()
        )
    }

    private static func diagnosticsAsset(for job: EpisodeImportJob, offsetSeconds: Double?) -> EpisodeSyncDiagnosticsAsset {
        let kind: String
        if let proxyKind = job.proxy?.kind {
            kind = proxyKind
        } else if job.probe?.hasVideo == true {
            kind = "video"
        } else if job.probe?.hasAudio == true {
            kind = "audio"
        } else {
            kind = "unknown"
        }

        var warnings: [String] = []
        warnings.append(contentsOf: job.probe?.warnings ?? [])
        warnings.append(contentsOf: job.proxy?.warnings ?? [])
        warnings.append(contentsOf: job.registration?.warnings ?? [])
        if let error = job.probe?.error { warnings.append(error) }
        if let error = job.proxy?.error { warnings.append(error) }
        if let error = job.registration?.error { warnings.append(error) }
        if let error = job.timelineAttachResult?.error { warnings.append(error) }

        return EpisodeSyncDiagnosticsAsset(
            importJobId: job.id,
            assetId: job.registration?.assetId,
            displayName: job.displayName,
            path: job.path,
            role: job.role.rawValue,
            status: job.status.rawValue,
            kind: kind,
            durationSeconds: job.probe?.durationSeconds ?? job.proxy?.durationSeconds,
            offsetSeconds: offsetSeconds,
            recordedStartAt: job.recordingSyncMetadata?.recordedStartAt,
            recordedEndAt: job.recordingSyncMetadata?.recordedEndAt,
            deviceLabel: job.recordingSyncMetadata?.deviceLabel,
            sourceDeviceClockNotes: job.recordingSyncMetadata?.sourceDeviceClockNotes,
            segmentOrder: job.recordingSyncMetadata?.segmentOrder,
            takeOrder: job.recordingSyncMetadata?.takeOrder,
            rawGcsUri: job.registration?.rawGcsUri,
            proxyGcsUri: job.registration?.proxyGcsUri,
            thumbnailGcsUri: job.registration?.thumbnailGcsUri,
            warnings: warnings
        )
    }

    var compactJSONString: String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        guard let data = try? encoder.encode(self) else {
            return "{\"packetVersion\":1,\"source\":\"quipsly-mac-sync-prep\",\"error\":\"encode-failed\"}"
        }
        return String(decoding: data, as: UTF8.self)
    }
}

struct EpisodeSyncDiagnosticsSpine: Codable {
    var importJobId: String
    var assetId: String?
    var displayName: String
    var durationSeconds: Double?
    var recordedStartAt: String?
    var recordedEndAt: String?
    var deviceLabel: String?
}

struct EpisodeSyncDiagnosticsAsset: Codable {
    var importJobId: String
    var assetId: String?
    var displayName: String
    var path: String
    var role: String
    var status: String
    var kind: String
    var durationSeconds: Double?
    var offsetSeconds: Double?
    var recordedStartAt: String?
    var recordedEndAt: String?
    var deviceLabel: String?
    var sourceDeviceClockNotes: String?
    var segmentOrder: Int?
    var takeOrder: Int?
    var rawGcsUri: String?
    var proxyGcsUri: String?
    var thumbnailGcsUri: String?
    var warnings: [String]
}

struct EpisodeSyncDiagnosticsTimelineClip: Codable {
    var clipId: String?
    var assetId: String?
    var importJobId: String
    var trackId: String?
    var startIn: Double?
    var duration: Double?
    var placement: String?
    var alreadyAttached: Bool?
    var kind: String
}
