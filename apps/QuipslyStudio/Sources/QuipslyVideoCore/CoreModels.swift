import Foundation

public enum ExportFormat: String, Codable, Equatable, CaseIterable, Hashable {
    case horizontal16x9 = "16:9"
    case vertical9x16 = "9:16"
}

public struct MediaItem: Identifiable, Codable, Equatable {
    public let id: UUID
    public let url: URL
    public var proxyURL: URL?
    public let name: String
    
    public init(id: UUID = UUID(), url: URL, proxyURL: URL? = nil, name: String) {
        self.id = id
        self.url = url
        self.proxyURL = proxyURL
        self.name = name
    }
}

public enum PlaybackMode: String, Codable, Equatable, CaseIterable, Hashable {
    case playEdit = "Play Edit"
    case playThrough = "Play Through"
}

public struct VideoProject: Identifiable, Codable, Equatable {
    public let id: UUID
    public var title: String
    public var mediaBin: [MediaItem]
    public var sequences: [MediaSequence]
    
    public init(id: UUID = UUID(), title: String, mediaBin: [MediaItem] = [], sequences: [MediaSequence] = []) {
        self.id = id
        self.title = title
        self.mediaBin = mediaBin
        self.sequences = sequences
    }
}

public struct MediaSequence: Identifiable, Codable, Equatable {
    public let id: UUID
    public var title: String
    public var orientationTrack: OrientationTrack
    public var verticalOrientationTrack: OrientationTrack
    public var lanes: [VideoLane]
    public var shortClipQueue: [ShortClipCandidate]
    public var transcriptSegments: [TranscriptSegment]
    public var transcriptJobs: [TranscriptJobRecord]
    public var publishReceipts: [PublishReceiptRecord]
    
    public var duration: Double {
        lanes.map { $0.duration }.max() ?? 0
    }
    
    public init(id: UUID = UUID(), title: String, orientationTrack: OrientationTrack = OrientationTrack(), verticalOrientationTrack: OrientationTrack = OrientationTrack(), lanes: [VideoLane] = [], shortClipQueue: [ShortClipCandidate] = [], transcriptSegments: [TranscriptSegment] = [], transcriptJobs: [TranscriptJobRecord] = [], publishReceipts: [PublishReceiptRecord] = []) {
        self.id = id
        self.title = title
        self.orientationTrack = orientationTrack
        self.verticalOrientationTrack = verticalOrientationTrack
        self.lanes = lanes
        self.shortClipQueue = shortClipQueue
        self.transcriptSegments = transcriptSegments
        self.transcriptJobs = transcriptJobs
        self.publishReceipts = publishReceipts
    }

    enum CodingKeys: String, CodingKey {
        case id
        case title
        case orientationTrack
        case verticalOrientationTrack
        case lanes
        case shortClipQueue
        case transcriptSegments
        case transcriptJobs
        case publishReceipts
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(UUID.self, forKey: .id)
        title = try container.decode(String.self, forKey: .title)
        orientationTrack = try container.decodeIfPresent(OrientationTrack.self, forKey: .orientationTrack) ?? OrientationTrack()
        verticalOrientationTrack = try container.decodeIfPresent(OrientationTrack.self, forKey: .verticalOrientationTrack) ?? OrientationTrack()
        lanes = try container.decodeIfPresent([VideoLane].self, forKey: .lanes) ?? []
        shortClipQueue = try container.decodeIfPresent([ShortClipCandidate].self, forKey: .shortClipQueue) ?? []
        transcriptSegments = try container.decodeIfPresent([TranscriptSegment].self, forKey: .transcriptSegments) ?? []
        transcriptJobs = try container.decodeIfPresent([TranscriptJobRecord].self, forKey: .transcriptJobs) ?? []
        publishReceipts = try container.decodeIfPresent([PublishReceiptRecord].self, forKey: .publishReceipts) ?? []
    }
    
    /// Applies an array of imported VideoTags to a specific lane, replacing existing tags.
    public mutating func importTags(_ newTags: [VideoTag], toLaneWithID laneID: UUID) {
        guard let index = lanes.firstIndex(where: { $0.id == laneID }) else { return }
        lanes[index].tags = newTags
    }
}

public struct TranscriptSegment: Identifiable, Codable, Equatable, Sendable {
    public let id: UUID
    public var sourceAssetId: UUID?
    public var speaker: String
    public var startTime: Double
    public var endTime: Double
    public var text: String
    public var confidence: Double?
    public var reviewStatus: String
    public var createdAt: Date
    public var updatedAt: Date

    public init(
        id: UUID = UUID(),
        sourceAssetId: UUID? = nil,
        speaker: String = "Speaker",
        startTime: Double,
        endTime: Double,
        text: String,
        confidence: Double? = nil,
        reviewStatus: String = "draft",
        createdAt: Date = Date(),
        updatedAt: Date = Date()
    ) {
        self.id = id
        self.sourceAssetId = sourceAssetId
        self.speaker = speaker
        self.startTime = max(0, startTime)
        self.endTime = max(max(0, startTime), endTime)
        self.text = text
        self.confidence = confidence
        self.reviewStatus = reviewStatus
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

public struct TranscriptJobRecord: Identifiable, Codable, Equatable, Sendable {
    public let id: UUID
    public var sourceLaneId: UUID?
    public var sourceLaneName: String
    public var sourcePath: String
    public var provider: String
    public var commandPath: String?
    public var status: String
    public var startedAt: Date
    public var completedAt: Date?
    public var error: String
    public var segmentCount: Int

    public init(
        id: UUID = UUID(),
        sourceLaneId: UUID? = nil,
        sourceLaneName: String = "",
        sourcePath: String = "",
        provider: String = "local-command",
        commandPath: String? = nil,
        status: String = "queued",
        startedAt: Date = Date(),
        completedAt: Date? = nil,
        error: String = "",
        segmentCount: Int = 0
    ) {
        self.id = id
        self.sourceLaneId = sourceLaneId
        self.sourceLaneName = sourceLaneName
        self.sourcePath = sourcePath
        self.provider = provider
        self.commandPath = commandPath
        self.status = status
        self.startedAt = startedAt
        self.completedAt = completedAt
        self.error = error
        self.segmentCount = segmentCount
    }
}

public struct PublishReceiptRecord: Identifiable, Codable, Equatable, Sendable {
    public let id: UUID
    public var platform: String
    public var deliveryLaneId: String
    public var artifactType: String
    public var format: String
    public var artifactPath: String
    public var artifactStatus: String
    public var publishStatus: String
    public var title: String
    public var description: String
    public var scheduledAt: Date?
    public var publishedAt: Date?
    public var providerReceiptId: String
    public var publicURL: String
    public var receiptJson: String
    public var metadataJson: String
    public var metadataStatus: String
    public var uploadJobKind: String
    public var uploadJobStatus: String
    public var uploadJobJson: String
    public var lastUploadAttemptAt: Date?
    public var notes: String
    public var createdAt: Date
    public var updatedAt: Date

    public init(
        id: UUID = UUID(),
        platform: String,
        deliveryLaneId: String,
        artifactType: String,
        format: String,
        artifactPath: String,
        artifactStatus: String,
        publishStatus: String = "not-started",
        title: String = "",
        description: String = "",
        scheduledAt: Date? = nil,
        publishedAt: Date? = nil,
        providerReceiptId: String = "",
        publicURL: String = "",
        receiptJson: String = "",
        metadataJson: String = "",
        metadataStatus: String = "draft",
        uploadJobKind: String = "",
        uploadJobStatus: String = "integration-needed",
        uploadJobJson: String = "",
        lastUploadAttemptAt: Date? = nil,
        notes: String = "",
        createdAt: Date = Date(),
        updatedAt: Date = Date()
    ) {
        self.id = id
        self.platform = platform
        self.deliveryLaneId = deliveryLaneId
        self.artifactType = artifactType
        self.format = format
        self.artifactPath = artifactPath
        self.artifactStatus = artifactStatus
        self.publishStatus = publishStatus
        self.title = title
        self.description = description
        self.scheduledAt = scheduledAt
        self.publishedAt = publishedAt
        self.providerReceiptId = providerReceiptId
        self.publicURL = publicURL
        self.receiptJson = receiptJson
        self.metadataJson = metadataJson
        self.metadataStatus = metadataStatus
        self.uploadJobKind = uploadJobKind
        self.uploadJobStatus = uploadJobStatus
        self.uploadJobJson = uploadJobJson
        self.lastUploadAttemptAt = lastUploadAttemptAt
        self.notes = notes
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    enum CodingKeys: String, CodingKey {
        case id
        case platform
        case deliveryLaneId
        case artifactType
        case format
        case artifactPath
        case artifactStatus
        case publishStatus
        case title
        case description
        case scheduledAt
        case publishedAt
        case providerReceiptId
        case publicURL
        case receiptJson
        case metadataJson
        case metadataStatus
        case uploadJobKind
        case uploadJobStatus
        case uploadJobJson
        case lastUploadAttemptAt
        case notes
        case createdAt
        case updatedAt
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let decodedCreatedAt = try container.decodeIfPresent(Date.self, forKey: .createdAt) ?? Date()
        id = try container.decodeIfPresent(UUID.self, forKey: .id) ?? UUID()
        platform = try container.decodeIfPresent(String.self, forKey: .platform) ?? ""
        deliveryLaneId = try container.decodeIfPresent(String.self, forKey: .deliveryLaneId) ?? ""
        artifactType = try container.decodeIfPresent(String.self, forKey: .artifactType) ?? ""
        format = try container.decodeIfPresent(String.self, forKey: .format) ?? ""
        artifactPath = try container.decodeIfPresent(String.self, forKey: .artifactPath) ?? ""
        artifactStatus = try container.decodeIfPresent(String.self, forKey: .artifactStatus) ?? ""
        publishStatus = try container.decodeIfPresent(String.self, forKey: .publishStatus) ?? "not-started"
        title = try container.decodeIfPresent(String.self, forKey: .title) ?? ""
        description = try container.decodeIfPresent(String.self, forKey: .description) ?? ""
        scheduledAt = try container.decodeIfPresent(Date.self, forKey: .scheduledAt)
        publishedAt = try container.decodeIfPresent(Date.self, forKey: .publishedAt)
        providerReceiptId = try container.decodeIfPresent(String.self, forKey: .providerReceiptId) ?? ""
        publicURL = try container.decodeIfPresent(String.self, forKey: .publicURL) ?? ""
        receiptJson = try container.decodeIfPresent(String.self, forKey: .receiptJson) ?? ""
        metadataJson = try container.decodeIfPresent(String.self, forKey: .metadataJson) ?? ""
        metadataStatus = try container.decodeIfPresent(String.self, forKey: .metadataStatus) ?? "draft"
        uploadJobKind = try container.decodeIfPresent(String.self, forKey: .uploadJobKind) ?? ""
        uploadJobStatus = try container.decodeIfPresent(String.self, forKey: .uploadJobStatus) ?? "integration-needed"
        uploadJobJson = try container.decodeIfPresent(String.self, forKey: .uploadJobJson) ?? ""
        lastUploadAttemptAt = try container.decodeIfPresent(Date.self, forKey: .lastUploadAttemptAt)
        notes = try container.decodeIfPresent(String.self, forKey: .notes) ?? ""
        createdAt = decodedCreatedAt
        updatedAt = try container.decodeIfPresent(Date.self, forKey: .updatedAt) ?? decodedCreatedAt
    }
}

public enum TranscriptParseError: Error, LocalizedError {
    case emptyTranscript
    case unsupportedFormat(String)

    public var errorDescription: String? {
        switch self {
        case .emptyTranscript:
            return "No transcript segments were found."
        case .unsupportedFormat(let format):
            return "Unsupported transcript format: \(format)"
        }
    }
}

public enum TranscriptParser {
    public static func parse(text: String, filename: String = "", format rawFormat: String = "auto") throws -> [TranscriptSegment] {
        let format = normalizedFormat(rawFormat, filename: filename, text: text)
        let segments: [TranscriptSegment]
        switch format {
        case "srt":
            segments = parseSRT(text)
        case "vtt":
            segments = parseVTT(text)
        default:
            throw TranscriptParseError.unsupportedFormat(format)
        }
        let sorted = segments
            .filter { !$0.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && $0.endTime > $0.startTime }
            .sorted { $0.startTime < $1.startTime }
        guard !sorted.isEmpty else { throw TranscriptParseError.emptyTranscript }
        return sorted
    }

    private static func normalizedFormat(_ rawFormat: String, filename: String, text: String) -> String {
        let requested = rawFormat.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        if requested == "srt" || requested == "vtt" { return requested }
        let ext = (filename as NSString).pathExtension.lowercased()
        if ext == "srt" || ext == "vtt" { return ext }
        if text.trimmingCharacters(in: .whitespacesAndNewlines).hasPrefix("WEBVTT") { return "vtt" }
        return "srt"
    }

    private static func parseSRT(_ text: String) -> [TranscriptSegment] {
        splitBlocks(text)
            .compactMap { block in
                let lines = block
                    .components(separatedBy: .newlines)
                    .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                    .filter { !$0.isEmpty }
                guard let timingIndex = lines.firstIndex(where: { $0.contains("-->") }) else { return nil }
                let timeParts = lines[timingIndex].components(separatedBy: "-->")
                guard timeParts.count >= 2,
                      let start = parseTimestamp(timeParts[0]),
                      let end = parseTimestamp(timeParts[1]) else {
                    return nil
                }
                let transcriptLines = Array(lines.dropFirst(timingIndex + 1))
                let parsed = parseSpeakerAndText(transcriptLines.joined(separator: " "))
                return TranscriptSegment(
                    speaker: parsed.speaker,
                    startTime: start,
                    endTime: end,
                    text: parsed.text,
                    confidence: nil,
                    reviewStatus: "imported"
                )
            }
    }

    private static func parseVTT(_ text: String) -> [TranscriptSegment] {
        let withoutHeader = text
            .components(separatedBy: .newlines)
            .filter { line in
                let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
                return trimmed != "WEBVTT" && !trimmed.hasPrefix("NOTE")
            }
            .joined(separator: "\n")
        return parseSRT(withoutHeader)
    }

    private static func splitBlocks(_ text: String) -> [String] {
        text
            .replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
            .components(separatedBy: "\n\n")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }

    private static func parseTimestamp(_ raw: String) -> Double? {
        let cleaned = raw
            .components(separatedBy: .whitespaces)
            .first(where: { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty })?
            .replacingOccurrences(of: ",", with: ".")
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let parts = cleaned.split(separator: ":").map(String.init)
        guard parts.count >= 2 else { return nil }
        let secondsPart = parts.last ?? "0"
        guard let seconds = Double(secondsPart) else { return nil }
        let minutes = Double(parts.dropLast().last ?? "0") ?? 0
        let hours = parts.count >= 3 ? (Double(parts.dropLast(2).last ?? "0") ?? 0) : 0
        return hours * 3600 + minutes * 60 + seconds
    }

    private static func parseSpeakerAndText(_ rawText: String) -> (speaker: String, text: String) {
        let text = rawText
            .replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard let colon = text.firstIndex(of: ":") else {
            return ("Speaker", text)
        }
        let possibleSpeaker = String(text[..<colon]).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !possibleSpeaker.isEmpty && possibleSpeaker.count <= 32 else {
            return ("Speaker", text)
        }
        let body = String(text[text.index(after: colon)...]).trimmingCharacters(in: .whitespacesAndNewlines)
        return (possibleSpeaker, body.isEmpty ? text : body)
    }
}

public struct ShortClipCandidate: Identifiable, Codable, Equatable {
    public let id: UUID
    public var title: String
    public var startTime: Double
    public var duration: Double
    public var format: ExportFormat
    public var destinations: [String]
    public var status: String
    public var reviewStatus: String
    public var exportStatus: String
    public var hookText: String
    public var captionDraft: String
    public var primaryOverlayText: String
    public var publishNotes: String
    public var destinationPresets: [ShortDestinationPreset]
    public var sourceLaneId: UUID?
    public var sourceTagId: UUID?
    public var notes: String
    public var createdAt: Date
    public var updatedAt: Date

    public init(
        id: UUID = UUID(),
        title: String,
        startTime: Double,
        duration: Double,
        format: ExportFormat = .vertical9x16,
        destinations: [String] = ["YouTube Shorts", "Instagram", "Facebook", "LinkedIn"],
        status: String = "queued",
        reviewStatus: String = "draft",
        exportStatus: String = "not-exported",
        hookText: String = "",
        captionDraft: String = "",
        primaryOverlayText: String = "",
        publishNotes: String = "",
        destinationPresets: [ShortDestinationPreset] = [],
        sourceLaneId: UUID? = nil,
        sourceTagId: UUID? = nil,
        notes: String = "",
        createdAt: Date = Date(),
        updatedAt: Date = Date()
    ) {
        self.id = id
        self.title = title
        self.startTime = startTime
        self.duration = duration
        self.format = format
        self.destinations = destinations
        self.status = status
        self.reviewStatus = reviewStatus
        self.exportStatus = exportStatus
        self.hookText = hookText
        self.captionDraft = captionDraft
        self.primaryOverlayText = primaryOverlayText
        self.publishNotes = publishNotes
        let materializedDestinationPresets = destinationPresets.isEmpty
            ? destinations.map { ShortDestinationPreset(platform: $0, title: title) }
            : destinationPresets
        self.destinationPresets = materializedDestinationPresets
        self.sourceLaneId = sourceLaneId
        self.sourceTagId = sourceTagId
        self.notes = notes
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    enum CodingKeys: String, CodingKey {
        case id
        case title
        case startTime
        case duration
        case format
        case destinations
        case status
        case reviewStatus
        case exportStatus
        case hookText
        case captionDraft
        case primaryOverlayText
        case publishNotes
        case destinationPresets
        case sourceLaneId
        case sourceTagId
        case notes
        case createdAt
        case updatedAt
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decodeIfPresent(UUID.self, forKey: .id) ?? UUID()
        let decodedTitle = try container.decodeIfPresent(String.self, forKey: .title) ?? "Untitled short"
        title = decodedTitle
        startTime = try container.decodeIfPresent(Double.self, forKey: .startTime) ?? 0
        duration = try container.decodeIfPresent(Double.self, forKey: .duration) ?? 0
        format = try container.decodeIfPresent(ExportFormat.self, forKey: .format) ?? .vertical9x16
        let decodedDestinations = try container.decodeIfPresent([String].self, forKey: .destinations) ?? ["YouTube Shorts", "Instagram", "Facebook", "LinkedIn"]
        destinations = decodedDestinations
        status = try container.decodeIfPresent(String.self, forKey: .status) ?? "queued"
        reviewStatus = try container.decodeIfPresent(String.self, forKey: .reviewStatus) ?? "draft"
        exportStatus = try container.decodeIfPresent(String.self, forKey: .exportStatus) ?? "not-exported"
        hookText = try container.decodeIfPresent(String.self, forKey: .hookText) ?? ""
        captionDraft = try container.decodeIfPresent(String.self, forKey: .captionDraft) ?? ""
        primaryOverlayText = try container.decodeIfPresent(String.self, forKey: .primaryOverlayText) ?? ""
        publishNotes = try container.decodeIfPresent(String.self, forKey: .publishNotes) ?? ""
        let decodedPresets = try container.decodeIfPresent([ShortDestinationPreset].self, forKey: .destinationPresets) ?? []
        destinationPresets = decodedPresets.isEmpty
            ? decodedDestinations.map { ShortDestinationPreset(platform: $0, title: decodedTitle) }
            : decodedPresets
        sourceLaneId = try container.decodeIfPresent(UUID.self, forKey: .sourceLaneId)
        sourceTagId = try container.decodeIfPresent(UUID.self, forKey: .sourceTagId)
        notes = try container.decodeIfPresent(String.self, forKey: .notes) ?? ""
        createdAt = try container.decodeIfPresent(Date.self, forKey: .createdAt) ?? Date()
        updatedAt = try container.decodeIfPresent(Date.self, forKey: .updatedAt) ?? createdAt
    }
}

public struct ShortDestinationPreset: Identifiable, Codable, Equatable {
    public let id: UUID
    public var platform: String
    public var title: String
    public var caption: String
    public var hashtags: [String]
    public var status: String

    public init(
        id: UUID = UUID(),
        platform: String,
        title: String = "",
        caption: String = "",
        hashtags: [String] = [],
        status: String = "draft"
    ) {
        self.id = id
        self.platform = platform
        self.title = title
        self.caption = caption
        self.hashtags = hashtags
        self.status = status
    }
}

public struct OrientationTrack: Identifiable, Codable, Equatable {
    public let id: UUID
    public var keyframes: [FramingKeyframe]
    
    public init(id: UUID = UUID(), keyframes: [FramingKeyframe] = []) {
        self.id = id
        self.keyframes = keyframes
    }
    
    public func interpolatedFrame(at time: Double) -> FramingKeyframe {
        guard !keyframes.isEmpty else {
            return FramingKeyframe(time: time, yaw: 0, pitch: 0, roll: 0, fov: 90.0)
        }
        
        let sorted = keyframes.sorted { $0.time < $1.time }
        
        if time <= sorted.first!.time { return sorted.first! }
        if time >= sorted.last!.time { return sorted.last! }
        
        for i in 0..<(sorted.count - 1) {
            let k1 = sorted[i]
            let k2 = sorted[i+1]
            if time >= k1.time && time < k2.time {
                if k1.interpolation == .hold {
                    var heldFrame = k1
                    heldFrame.time = time
                    return heldFrame
                }
                
                // Currently implementing basic linear interpolation for both linear and bezier as fallback
                let progress = (time - k1.time) / (k2.time - k1.time)
                let yaw = k1.yaw + (k2.yaw - k1.yaw) * progress
                let pitch = k1.pitch + (k2.pitch - k1.pitch) * progress
                let roll = k1.roll + (k2.roll - k1.roll) * progress
                let fov = k1.fov + (k2.fov - k1.fov) * progress
                
                return FramingKeyframe(time: time, yaw: yaw, pitch: pitch, roll: roll, fov: fov, interpolation: k1.interpolation)
            }
        }
        
        return sorted.last!
    }
}

public enum InterpolationMode: String, Codable, Equatable, CaseIterable {
    case linear = "Linear"
    case bezier = "Bezier"
    case hold = "Hold"
}

public struct FramingKeyframe: Identifiable, Codable, Equatable {
    public let id: UUID
    public var time: Double
    public var yaw: Double // Degrees (-180 to 180)
    public var pitch: Double // Degrees (-90 to 90)
    public var roll: Double // Degrees (-180 to 180)
    public var fov: Double // Degrees (30 to 150)
    public var interpolation: InterpolationMode
    
    public init(id: UUID = UUID(), time: Double, yaw: Double = 0, pitch: Double = 0, roll: Double = 0, fov: Double = 90.0, interpolation: InterpolationMode = .linear) {
        self.id = id
        self.time = time
        self.yaw = yaw
        self.pitch = pitch
        self.roll = roll
        self.fov = fov
        self.interpolation = interpolation
    }
}

public struct VideoLane: Identifiable, Codable, Equatable {
    public let id: UUID
    public var name: String
    public var sourceVideo: SourceVideo?
    public var tags: [VideoTag]
    public var metadata: VideoLaneMetadata?
    
    public var duration: Double {
        sourceVideo?.duration ?? 0
    }
    
    public init(id: UUID = UUID(), name: String, sourceVideo: SourceVideo? = nil, tags: [VideoTag] = [], metadata: VideoLaneMetadata? = nil) {
        self.id = id
        self.name = name
        self.sourceVideo = sourceVideo
        self.tags = tags
        self.metadata = metadata
    }
}

public struct VideoLaneMetadata: Codable, Equatable {
    public var sourceAssetId: String?
    public var mediaKind: String
    public var role: String
    public var trackIds: [String]
    public var sourcePath: String?
    public var originalPath: String?
    public var vaultRawPath: String?
    public var vaultProxyPath: String?
    public var assetFingerprint: String?
    public var declaredExists: Bool?
    public var sourceLabel: String?
    public var isPremiereRescue: Bool
    public var programCrop16x9: ProgramCropAdjustment?
    public var programCrop9x16: ProgramCropAdjustment?
    public var programCropKeyframes16x9: [ProgramCropKeyframe]?
    public var programCropKeyframes9x16: [ProgramCropKeyframe]?

    public init(
        sourceAssetId: String? = nil,
        mediaKind: String = "unknown",
        role: String = "unknown",
        trackIds: [String] = [],
        sourcePath: String? = nil,
        originalPath: String? = nil,
        vaultRawPath: String? = nil,
        vaultProxyPath: String? = nil,
        assetFingerprint: String? = nil,
        declaredExists: Bool? = nil,
        sourceLabel: String? = nil,
        isPremiereRescue: Bool = false,
        programCrop16x9: ProgramCropAdjustment? = nil,
        programCrop9x16: ProgramCropAdjustment? = nil,
        programCropKeyframes16x9: [ProgramCropKeyframe]? = nil,
        programCropKeyframes9x16: [ProgramCropKeyframe]? = nil
    ) {
        self.sourceAssetId = sourceAssetId
        self.mediaKind = mediaKind
        self.role = role
        self.trackIds = trackIds
        self.sourcePath = sourcePath
        self.originalPath = originalPath
        self.vaultRawPath = vaultRawPath
        self.vaultProxyPath = vaultProxyPath
        self.assetFingerprint = assetFingerprint
        self.declaredExists = declaredExists
        self.sourceLabel = sourceLabel
        self.isPremiereRescue = isPremiereRescue
        self.programCrop16x9 = programCrop16x9
        self.programCrop9x16 = programCrop9x16
        self.programCropKeyframes16x9 = programCropKeyframes16x9
        self.programCropKeyframes9x16 = programCropKeyframes9x16
    }
}

public struct ProgramCropAdjustment: Codable, Equatable {
    public var panX: Double
    public var panY: Double
    public var zoom: Double

    public init(panX: Double = 0, panY: Double = 0, zoom: Double = 1) {
        self.panX = min(1, max(-1, panX.isFinite ? panX : 0))
        self.panY = min(1, max(-1, panY.isFinite ? panY : 0))
        self.zoom = min(4, max(1, zoom.isFinite ? zoom : 1))
    }

    public func adjusted(panXDelta: Double = 0, panYDelta: Double = 0, zoomDelta: Double = 0) -> ProgramCropAdjustment {
        ProgramCropAdjustment(
            panX: panX + panXDelta,
            panY: panY + panYDelta,
            zoom: zoom + zoomDelta
        )
    }

    public static func interpolated(
        baseline: ProgramCropAdjustment,
        keyframes: [ProgramCropKeyframe],
        at sequenceTime: Double
    ) -> ProgramCropAdjustment {
        let sorted = keyframes.sorted { $0.time < $1.time }
        guard !sorted.isEmpty else { return baseline }
        if let first = sorted.first, sequenceTime <= first.time {
            return first.time <= 0.25 ? first.cropAdjustment : baseline
        }
        if let last = sorted.last, sequenceTime >= last.time {
            return last.cropAdjustment
        }
        for index in 0..<(sorted.count - 1) {
            let lhs = sorted[index]
            let rhs = sorted[index + 1]
            guard sequenceTime >= lhs.time && sequenceTime <= rhs.time else { continue }
            if lhs.interpolation == .hold || rhs.time <= lhs.time {
                return lhs.cropAdjustment
            }
            let progress = max(0, min(1, (sequenceTime - lhs.time) / (rhs.time - lhs.time)))
            return ProgramCropAdjustment(
                panX: lhs.panX + ((rhs.panX - lhs.panX) * progress),
                panY: lhs.panY + ((rhs.panY - lhs.panY) * progress),
                zoom: lhs.zoom + ((rhs.zoom - lhs.zoom) * progress)
            )
        }
        return baseline
    }
}

public struct ProgramCropKeyframe: Identifiable, Codable, Equatable {
    public let id: UUID
    public var time: Double
    public var panX: Double
    public var panY: Double
    public var zoom: Double
    public var interpolation: InterpolationMode

    public init(
        id: UUID = UUID(),
        time: Double,
        panX: Double = 0,
        panY: Double = 0,
        zoom: Double = 1,
        interpolation: InterpolationMode = .linear
    ) {
        self.id = id
        self.time = max(0, time.isFinite ? time : 0)
        let crop = ProgramCropAdjustment(panX: panX, panY: panY, zoom: zoom)
        self.panX = crop.panX
        self.panY = crop.panY
        self.zoom = crop.zoom
        self.interpolation = interpolation
    }

    public var cropAdjustment: ProgramCropAdjustment {
        ProgramCropAdjustment(panX: panX, panY: panY, zoom: zoom)
    }
}

public struct NativeEditorSession: Codable, Equatable {
    public var savedAt: Date
    public var activeSequenceId: UUID?
    public var project: VideoProject

    public init(savedAt: Date = Date(), activeSequenceId: UUID?, project: VideoProject) {
        self.savedAt = savedAt
        self.activeSequenceId = activeSequenceId
        self.project = project
    }
}

public struct SourceVideo: Identifiable, Codable, Equatable {
    public let id: UUID
    public var mediaURL: URL
    public var proxyURL: URL?
    public var duration: Double
    public var offset: Double
    public var is360: Bool
    
    public init(id: UUID = UUID(), mediaURL: URL, proxyURL: URL? = nil, duration: Double, offset: Double = 0, is360: Bool = false) {
        self.id = id
        self.mediaURL = mediaURL
        self.proxyURL = proxyURL
        self.duration = duration
        self.offset = offset
        self.is360 = is360
    }
}

public enum TagType: String, Codable, Equatable, CaseIterable {
    case highlight = "Highlight"
    case meme = "Meme"
    case keep = "Keep"
    case cut = "Cut"
    case active = "Active"
    case focus = "Focus"
}

public struct VideoTag: Identifiable, Codable, Equatable {
    public let id: UUID
    public var type: TagType
    public var startTime: Double
    public var duration: Double
    
    public init(id: UUID = UUID(), type: TagType = .highlight, startTime: Double, duration: Double) {
        self.id = id
        self.type = type
        self.startTime = startTime
        self.duration = duration
    }
}
