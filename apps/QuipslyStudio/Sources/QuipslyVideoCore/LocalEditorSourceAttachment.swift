import Foundation

private func normalizedLocalAlignmentStatus(
    _ value: String
) -> String {
    switch value {
    case "capture-clock-proposed",
         "capture-clock-aligned":
        // The historical "aligned" spelling never represented
        // content-level review. Normalize it to proposal truth.
        "capture-clock-proposed"
    default:
        "needs-alignment"
    }
}

public struct VerifiedCaptureSourceAttachment: Equatable, Sendable {
    public let sourceAssetID: String
    public let captureGroupID: UUID
    public let episodeSpaceID: String
    public let mediaURL: URL
    public let originalURL: URL
    public let duration: Double
    public let name: String
    public let role: String
    public let ingestKind: String
    public let sha256: String?
    public let sourceReceiptPath: String
    public let timelineOffsetSeconds: Double
    public let alignmentStatus: String

    public init(
        sourceAssetID: String,
        captureGroupID: UUID,
        episodeSpaceID: String,
        mediaURL: URL,
        originalURL: URL,
        duration: Double,
        name: String,
        role: String,
        ingestKind: String,
        sha256: String?,
        sourceReceiptPath: String,
        timelineOffsetSeconds: Double = 0,
        alignmentStatus: String = "needs-alignment"
    ) {
        self.sourceAssetID = sourceAssetID
        self.captureGroupID = captureGroupID
        self.episodeSpaceID = episodeSpaceID
        self.mediaURL = mediaURL
        self.originalURL = originalURL
        self.duration = duration
        self.name = name
        self.role = role
        self.ingestKind = ingestKind
        self.sha256 = sha256
        self.sourceReceiptPath = sourceReceiptPath
        let safeTimelineOffset = max(
            0,
            timelineOffsetSeconds.isFinite
                ? timelineOffsetSeconds
                : 0
        )
        self.timelineOffsetSeconds = safeTimelineOffset
        self.alignmentStatus =
            normalizedLocalAlignmentStatus(alignmentStatus)
    }
}

public struct LocalEditorSourceAttachmentReceipt: Codable, Equatable, Sendable {
    public let protocolVersion: Int
    public let attachmentID: UUID
    public let sourceAssetID: String
    public let captureGroupID: UUID
    public let episodeSpaceID: String
    public let projectID: UUID
    public let sequenceID: UUID
    public let laneID: UUID
    public let mediaPath: String
    public let sourceReceiptPath: String
    public let alignmentStatus: String
    public let timelineOffsetSeconds: Double?
    public let attachedAt: Date
    public let truth: String

    public init(
        attachmentID: UUID = UUID(),
        sourceAssetID: String,
        captureGroupID: UUID,
        episodeSpaceID: String,
        projectID: UUID,
        sequenceID: UUID,
        laneID: UUID,
        mediaPath: String,
        sourceReceiptPath: String,
        alignmentStatus: String = "needs-alignment",
        timelineOffsetSeconds: Double? = nil,
        attachedAt: Date = Date()
    ) {
        protocolVersion = 1
        self.attachmentID = attachmentID
        self.sourceAssetID = sourceAssetID
        self.captureGroupID = captureGroupID
        self.episodeSpaceID = episodeSpaceID
        self.projectID = projectID
        self.sequenceID = sequenceID
        self.laneID = laneID
        self.mediaPath = mediaPath
        self.sourceReceiptPath = sourceReceiptPath
        self.alignmentStatus =
            normalizedLocalAlignmentStatus(alignmentStatus)
        self.timelineOffsetSeconds = timelineOffsetSeconds.flatMap {
            $0.isFinite && $0 >= 0 ? $0 : nil
        }
        self.attachedAt = attachedAt
        if self.alignmentStatus == "capture-clock-proposed",
           self.timelineOffsetSeconds != nil {
            truth =
                "This receipt proves that Quipsly attached the verified managed source to one local non-destructive editor lane and proposed its first placement from a shared capture-group monotonic clock. It does not prove reviewed alignment, content-level lip sync, cloud upload, proxy readiness, transcription, or publication."
        } else {
            truth =
                "This receipt proves that Quipsly attached the verified managed source to one local non-destructive editor lane. It does not prove cloud upload, proxy readiness, synchronization, transcription, or publication."
        }
    }
}

public enum LocalEditorSourceAttachmentWriter {
    public static let filename = "local-editor-attachment-receipt.json"

    @discardableResult
    public static func write(
        _ receipt: LocalEditorSourceAttachmentReceipt,
        besideSourceReceipt sourceReceiptPath: String
    ) throws -> URL {
        let sourceReceiptURL = URL(fileURLWithPath: sourceReceiptPath)
        let outputURL = sourceReceiptURL
            .deletingLastPathComponent()
            .appendingPathComponent(filename)
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        try encoder.encode(receipt).write(to: outputURL, options: [.atomic])
        return outputURL
    }
}
