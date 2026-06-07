import Foundation

enum EpisodeImportRole: String, CaseIterable, Codable, Identifiable {
    case spineAudio = "spine-audio"
    case audioSource = "audio-source"
    case cameraVideo = "camera-video"
    case referenceClip = "reference-clip"
    case bRoll = "b-roll"
    case youtubeSourceClip = "youtube-source-clip"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .spineAudio: "Spine audio"
        case .audioSource: "Audio source"
        case .cameraVideo: "Camera video"
        case .referenceClip: "Reference clip"
        case .bRoll: "B-roll"
        case .youtubeSourceClip: "YouTube/source clip"
        }
    }

    var detail: String {
        switch self {
        case .spineAudio: "The main audio track everything else syncs to."
        case .audioSource: "Extra audio to preserve, compare, or sync later."
        case .cameraVideo: "A camera or screen recording to align with the spine."
        case .referenceClip: "A clip to watch, discuss, quote, or compare."
        case .bRoll: "Reusable visual material for the episode edit."
        case .youtubeSourceClip: "A source URL or local download to reference in the episode."
        }
    }
}

enum EpisodeImportJobStatus: String, Codable {
    case queued
    case probing
    case proxying
    case uploading
    case registered
    case failed
    case held

    var label: String {
        switch self {
        case .queued: "Queued"
        case .probing: "Probing"
        case .proxying: "Proxying"
        case .uploading: "Uploading"
        case .registered: "Registered"
        case .failed: "Failed"
        case .held: "Held"
        }
    }
}

enum EpisodeTimelineAttachPlacement: String, Codable {
    case atPlayhead = "playhead"
    case afterLast = "after-last"
}

struct EpisodeRecordingSyncMetadata: Codable, Equatable {
    var recordedStartAt: String?
    var recordedEndAt: String?
    var deviceLabel: String?
    var sourceDeviceClockNotes: String?
    var segmentOrder: Int?
    var takeOrder: Int?
    var sourceFileCreatedAt: String?
    var sourceFileModifiedAt: String?

    var dictionaryValue: [String: Any] {
        var value: [String: Any] = [:]

        if let recordedStartAt { value["recordedStartAt"] = recordedStartAt }
        if let recordedEndAt { value["recordedEndAt"] = recordedEndAt }
        if let deviceLabel { value["deviceLabel"] = deviceLabel }
        if let sourceDeviceClockNotes { value["sourceDeviceClockNotes"] = sourceDeviceClockNotes }
        if let segmentOrder { value["segmentOrder"] = segmentOrder }
        if let takeOrder { value["takeOrder"] = takeOrder }
        if let sourceFileCreatedAt { value["sourceFileCreatedAt"] = sourceFileCreatedAt }
        if let sourceFileModifiedAt { value["sourceFileModifiedAt"] = sourceFileModifiedAt }

        return value
    }

    func withDerivedRecordedEnd(durationSeconds: Double?) -> EpisodeRecordingSyncMetadata {
        guard recordedEndAt == nil, let recordedStartAt, let durationSeconds, durationSeconds.isFinite, durationSeconds > 0 else {
            return self
        }

        let formatter = ISO8601DateFormatter()
        guard let startDate = formatter.date(from: recordedStartAt) else {
            return self
        }

        var updated = self
        updated.recordedEndAt = formatter.string(from: startDate.addingTimeInterval(durationSeconds))
        return updated
    }
}

struct EpisodeImportJob: Codable, Identifiable, Equatable {
    var id: String
    var path: String
    var displayName: String
    var isFolder: Bool
    var projectSlug: String
    var episodeSlug: String
    var homeNestSlug: String
    var nestBaseURL: String
    var role: EpisodeImportRole
    var status: EpisodeImportJobStatus
    var queuedAt: String
    var message: String?
    var probe: EpisodeMediaProbe?
    var proxy: EpisodeMediaProxy?
    var registration: EpisodeMediaRegistration?
    var recordingSyncMetadata: EpisodeRecordingSyncMetadata?
    var timelineAttachResult: EpisodeTimelineAttachResult?

    init(
        id: String = UUID().uuidString,
        path: String,
        isFolder: Bool,
        projectSlug: String,
        episodeSlug: String,
        homeNestSlug: String,
        nestBaseURL: String,
        role: EpisodeImportRole,
        status: EpisodeImportJobStatus = .queued,
        queuedAt: String = Date().ISO8601Format(),
        message: String? = nil,
        probe: EpisodeMediaProbe? = nil,
        proxy: EpisodeMediaProxy? = nil,
        registration: EpisodeMediaRegistration? = nil,
        recordingSyncMetadata: EpisodeRecordingSyncMetadata? = nil,
        timelineAttachResult: EpisodeTimelineAttachResult? = nil
    ) {
        self.id = id
        self.path = path
        self.displayName = URL(fileURLWithPath: path).lastPathComponent
        self.isFolder = isFolder
        self.projectSlug = projectSlug
        self.episodeSlug = episodeSlug
        self.homeNestSlug = homeNestSlug
        self.nestBaseURL = nestBaseURL
        self.role = role
        self.status = status
        self.queuedAt = queuedAt
        self.message = message
        self.probe = probe
        self.proxy = proxy
        self.registration = registration
        self.recordingSyncMetadata = recordingSyncMetadata
        self.timelineAttachResult = timelineAttachResult
    }

    var enginePayload: [String: Any] {
        var payload: [String: Any] = [
            "id": id,
            "path": path,
            "displayName": displayName,
            "isFolder": isFolder,
            "projectSlug": projectSlug,
            "episodeSlug": episodeSlug,
            "homeNestSlug": homeNestSlug,
            "nestBaseURL": nestBaseURL,
            "role": role.rawValue,
            "status": status.rawValue,
            "queuedAt": queuedAt,
            "message": message ?? "",
        ]

        if let recordingSyncMetadata {
            payload["recordingSyncMetadata"] = recordingSyncMetadata.dictionaryValue
        }

        return payload
    }

    var registrationPayload: [String: Any] {
        var payload = enginePayload

        if let probe {
            payload["probe"] = probe.dictionaryValue
        }

        if let proxy {
            payload["proxy"] = proxy.dictionaryValue
        }

        return payload
    }

    func withDerivedRecordingEnd() -> EpisodeImportJob {
        var updated = self
        updated.recordingSyncMetadata = recordingSyncMetadata?.withDerivedRecordedEnd(
            durationSeconds: probe?.durationSeconds ?? proxy?.durationSeconds
        )
        return updated
    }

    var diagnosticJSON: String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]

        guard let data = try? encoder.encode(self) else {
            return "{\"error\":\"Could not encode episode import diagnostic.\"}"
        }

        return String(decoding: data, as: UTF8.self)
    }
}

struct EpisodeMediaProbe: Codable, Equatable {
    var ok: Bool
    var source: String
    var path: String
    var durationSeconds: Double?
    var formatName: String?
    var sizeBytes: Int?
    var bitrate: Int?
    var hasAudio: Bool
    var hasVideo: Bool
    var streams: [EpisodeMediaProbeStream]
    var warnings: [String]
    var error: String?
    var errorCode: String?
    var errorDetail: String?
    var recoverable: Bool?
}

struct EpisodeMediaProbeStream: Codable, Equatable, Identifiable {
    var index: Int
    var kind: String
    var codec: String?
    var width: Int?
    var height: Int?
    var fps: Double?
    var sampleRate: Int?
    var channels: Int?

    var id: Int { index }

    var summary: String {
        var pieces = [kind]
        if let codec, !codec.isEmpty { pieces.append(codec) }
        if let width, let height { pieces.append("\(width)x\(height)") }
        if let fps { pieces.append("\(String(format: "%.2f", fps)) fps") }
        if let sampleRate { pieces.append("\(sampleRate) Hz") }
        if let channels { pieces.append("\(channels) ch") }
        return pieces.joined(separator: " · ")
    }
}

struct EpisodeMediaProxy: Codable, Equatable {
    var rawPath: String
    var proxyPath: String?
    var thumbnailPath: String?
    var durationSeconds: Double?
    var kind: String
    var fingerprint: String
    var cacheDir: String
    var warnings: [String]
    var error: String?
    var errorCode: String?
    var errorDetail: String?
    var recoverable: Bool?

    var dictionaryValue: [String: Any] {
        var value: [String: Any] = [
            "rawPath": rawPath,
            "kind": kind,
            "fingerprint": fingerprint,
            "cacheDir": cacheDir,
            "warnings": warnings,
        ]

        if let proxyPath { value["proxyPath"] = proxyPath }
        if let thumbnailPath { value["thumbnailPath"] = thumbnailPath }
        if let durationSeconds { value["durationSeconds"] = durationSeconds }
        if let error { value["error"] = error }
        if let errorCode { value["errorCode"] = errorCode }
        if let errorDetail { value["errorDetail"] = errorDetail }
        if let recoverable { value["recoverable"] = recoverable }
        return value
    }
}

struct EpisodeMediaRegistration: Codable, Equatable {
    var ok: Bool
    var source: String
    var assetId: String?
    var spineAudioSet: Bool?
    var spineAudioAssetId: String?
    var bucketName: String?
    var rawGcsUri: String?
    var proxyGcsUri: String?
    var thumbnailGcsUri: String?
    var rawUrl: String?
    var proxyUrl: String?
    var thumbnailUrl: String?
    var registeredAt: String?
    var warnings: [String]
    var error: String?
    var errorCode: String?
    var errorDetail: String?
    var recoverable: Bool?
}

struct EpisodeTimelineAttachResult: Codable, Equatable {
    var ok: Bool
    var clipId: String?
    var trackId: String?
    var startIn: Double?
    var duration: Double?
    var placement: String?
    var alreadyAttached: Bool?
    var updatedAt: String?
    var error: String?
    var errorCode: String?
    var errorDetail: String?
    var recoverable: Bool?
}

private extension EpisodeMediaProbe {
    var dictionaryValue: [String: Any] {
        var value: [String: Any] = [
            "ok": ok,
            "source": source,
            "path": path,
            "hasAudio": hasAudio,
            "hasVideo": hasVideo,
            "streams": streams.map { $0.dictionaryValue },
            "warnings": warnings,
        ]

        if let durationSeconds { value["durationSeconds"] = durationSeconds }
        if let formatName { value["formatName"] = formatName }
        if let sizeBytes { value["sizeBytes"] = sizeBytes }
        if let bitrate { value["bitrate"] = bitrate }
        if let error { value["error"] = error }
        if let errorCode { value["errorCode"] = errorCode }
        if let errorDetail { value["errorDetail"] = errorDetail }
        if let recoverable { value["recoverable"] = recoverable }
        return value
    }
}

private extension EpisodeMediaProbeStream {
    var dictionaryValue: [String: Any] {
        var value: [String: Any] = [
            "index": index,
            "kind": kind,
        ]

        if let codec { value["codec"] = codec }
        if let width { value["width"] = width }
        if let height { value["height"] = height }
        if let fps { value["fps"] = fps }
        if let sampleRate { value["sampleRate"] = sampleRate }
        if let channels { value["channels"] = channels }
        return value
    }
}
