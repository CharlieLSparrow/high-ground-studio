import Foundation

public enum ExportFormat: String, Codable, Equatable, CaseIterable, Hashable {
    case horizontal16x9 = "16:9"
    case vertical9x16 = "9:16"

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = (try? container.decode(String.self)) ?? ""
        switch raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "9:16", "9x16", "vertical", "vertical9x16":
            self = .vertical9x16
        case "16:9", "16x9", "horizontal", "horizontal16x9":
            self = .horizontal16x9
        default:
            self = .vertical9x16
        }
    }
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

    enum CodingKeys: String, CodingKey {
        case id
        case url
        case proxyURL
        case name
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let decodedURL = try container.decodeIfPresent(URL.self, forKey: .url)
            ?? URL(fileURLWithPath: "/missing-media")
        id = try container.decodeIfPresent(UUID.self, forKey: .id) ?? UUID()
        url = decodedURL
        proxyURL = try container.decodeIfPresent(URL.self, forKey: .proxyURL)
        let decodedName = try container.decodeIfPresent(String.self, forKey: .name)
            ?? decodedURL.lastPathComponent
            .trimmingCharacters(in: .whitespacesAndNewlines)
        name = decodedName.isEmpty ? "Unnamed media" : decodedName
    }
}

public enum PlaybackMode: String, Codable, Equatable, CaseIterable, Hashable {
    case playEdit = "Play Edit"
    case playThrough = "Play Through"

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = (try? container.decode(String.self)) ?? ""
        switch raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "play through", "playthrough", "through", "all", "play all":
            self = .playThrough
        default:
            self = .playEdit
        }
    }
}

public struct VideoProject: Identifiable, Codable, Equatable {
    public let id: UUID
    public var title: String
    public var mediaBin: [MediaItem]
    public var sequences: [MediaSequence]
    public var nestDocuments: [NestDocument]

    public init(id: UUID = UUID(), title: String, mediaBin: [MediaItem] = [], sequences: [MediaSequence] = [], nestDocuments: [NestDocument] = []) {
        self.id = id
        self.title = title
        self.mediaBin = mediaBin
        self.sequences = sequences
        self.nestDocuments = nestDocuments
    }

    enum CodingKeys: String, CodingKey {
        case id
        case title
        case mediaBin
        case sequences
        case nestDocuments
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decodeIfPresent(UUID.self, forKey: .id) ?? UUID()
        title = try container.decodeIfPresent(String.self, forKey: .title) ?? "Untitled Quipsly Project"
        mediaBin = try container.decodeIfPresent([MediaItem].self, forKey: .mediaBin) ?? []
        sequences = try container.decodeIfPresent([MediaSequence].self, forKey: .sequences) ?? []
        nestDocuments = try container.decodeIfPresent([NestDocument].self, forKey: .nestDocuments) ?? []
    }
}

public struct NestDocument: Identifiable, Codable, Equatable, Sendable {
    public let id: UUID
    public var title: String
    public var kind: String
    public var status: String
    public var source: String
    public var tags: [String]
    public var blocks: [NestBlock]
    public var notes: String
    public var createdAt: Date
    public var updatedAt: Date

    public init(
        id: UUID = UUID(),
        title: String,
        kind: String = "writing",
        status: String = "draft",
        source: String = "human-authored",
        tags: [String] = [],
        blocks: [NestBlock] = [],
        notes: String = "",
        createdAt: Date = Date(),
        updatedAt: Date = Date()
    ) {
        self.id = id
        self.title = title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Untitled Nest Document" : title
        self.kind = kind.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "writing" : kind
        self.status = status.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "draft" : status
        self.source = source.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "human-authored" : source
        self.tags = tags
        self.blocks = blocks
        self.notes = notes
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

public struct NestBlock: Identifiable, Codable, Equatable, Sendable {
    public let id: UUID
    public var role: String
    public var text: String
    public var tags: [String]
    public var authorship: String
    public var provenanceNote: String
    public var episodeSlug: String
    public var chapterSlug: String
    public var sourcePath: String
    public var sourceURL: String
    public var reviewStatus: String
    public var sortIndex: Int
    public var createdAt: Date
    public var updatedAt: Date

    public init(
        id: UUID = UUID(),
        role: String = "note",
        text: String,
        tags: [String] = [],
        authorship: String = "human-authored",
        provenanceNote: String = "",
        episodeSlug: String = "",
        chapterSlug: String = "",
        sourcePath: String = "",
        sourceURL: String = "",
        reviewStatus: String = "needs-human-review",
        sortIndex: Int = 0,
        createdAt: Date = Date(),
        updatedAt: Date = Date()
    ) {
        self.id = id
        self.role = role.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "note" : role
        self.text = text
        self.tags = tags
        self.authorship = authorship.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "human-authored" : authorship
        self.provenanceNote = provenanceNote
        self.episodeSlug = episodeSlug
        self.chapterSlug = chapterSlug
        self.sourcePath = sourcePath
        self.sourceURL = sourceURL
        self.reviewStatus = reviewStatus.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "needs-human-review" : reviewStatus
        self.sortIndex = sortIndex
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    enum CodingKeys: String, CodingKey {
        case id
        case role
        case text
        case tags
        case authorship
        case provenanceNote
        case episodeSlug
        case chapterSlug
        case sourcePath
        case sourceURL
        case reviewStatus
        case sortIndex
        case createdAt
        case updatedAt
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let decodedCreatedAt = try container.decodeIfPresent(Date.self, forKey: .createdAt) ?? Date()
        id = try container.decodeIfPresent(UUID.self, forKey: .id) ?? UUID()
        role = try container.decodeIfPresent(String.self, forKey: .role) ?? "note"
        text = try container.decodeIfPresent(String.self, forKey: .text) ?? ""
        tags = try container.decodeIfPresent([String].self, forKey: .tags) ?? []
        authorship = try container.decodeIfPresent(String.self, forKey: .authorship) ?? "unknown-authorship"
        provenanceNote = try container.decodeIfPresent(String.self, forKey: .provenanceNote) ?? "Legacy block created before block-level authorship was tracked."
        episodeSlug = try container.decodeIfPresent(String.self, forKey: .episodeSlug) ?? ""
        chapterSlug = try container.decodeIfPresent(String.self, forKey: .chapterSlug) ?? ""
        sourcePath = try container.decodeIfPresent(String.self, forKey: .sourcePath) ?? ""
        sourceURL = try container.decodeIfPresent(String.self, forKey: .sourceURL) ?? ""
        reviewStatus = try container.decodeIfPresent(String.self, forKey: .reviewStatus) ?? "needs-human-review"
        sortIndex = try container.decodeIfPresent(Int.self, forKey: .sortIndex) ?? 0
        createdAt = decodedCreatedAt
        updatedAt = try container.decodeIfPresent(Date.self, forKey: .updatedAt) ?? decodedCreatedAt
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
    public var editCorrectionNotes: [EditCorrectionNoteRecord]
    public var editActionLedger: [EditActionLedgerRecord]
    public var publishReceipts: [PublishReceiptRecord]
    public var editPassContext: EditPassContext

    public var duration: Double {
        lanes.map { $0.duration }.max() ?? 0
    }

    public init(id: UUID = UUID(), title: String, orientationTrack: OrientationTrack = OrientationTrack(), verticalOrientationTrack: OrientationTrack = OrientationTrack(), lanes: [VideoLane] = [], shortClipQueue: [ShortClipCandidate] = [], transcriptSegments: [TranscriptSegment] = [], transcriptJobs: [TranscriptJobRecord] = [], editCorrectionNotes: [EditCorrectionNoteRecord] = [], editActionLedger: [EditActionLedgerRecord] = [], publishReceipts: [PublishReceiptRecord] = [], editPassContext: EditPassContext = EditPassContext()) {
        self.id = id
        self.title = title
        self.orientationTrack = orientationTrack
        self.verticalOrientationTrack = verticalOrientationTrack
        self.lanes = lanes
        self.shortClipQueue = shortClipQueue
        self.transcriptSegments = transcriptSegments
        self.transcriptJobs = transcriptJobs
        self.editCorrectionNotes = editCorrectionNotes
        self.editActionLedger = editActionLedger
        self.publishReceipts = publishReceipts
        self.editPassContext = editPassContext
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
        case editCorrectionNotes
        case editActionLedger
        case publishReceipts
        case editPassContext
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decodeIfPresent(UUID.self, forKey: .id) ?? UUID()
        title = try container.decodeIfPresent(String.self, forKey: .title) ?? "Recovered sequence"
        orientationTrack = try container.decodeIfPresent(OrientationTrack.self, forKey: .orientationTrack) ?? OrientationTrack()
        verticalOrientationTrack = try container.decodeIfPresent(OrientationTrack.self, forKey: .verticalOrientationTrack) ?? OrientationTrack()
        lanes = try container.decodeIfPresent([VideoLane].self, forKey: .lanes) ?? []
        shortClipQueue = try container.decodeIfPresent([ShortClipCandidate].self, forKey: .shortClipQueue) ?? []
        transcriptSegments = try container.decodeIfPresent([TranscriptSegment].self, forKey: .transcriptSegments) ?? []
        transcriptJobs = try container.decodeIfPresent([TranscriptJobRecord].self, forKey: .transcriptJobs) ?? []
        editCorrectionNotes = try container.decodeIfPresent([EditCorrectionNoteRecord].self, forKey: .editCorrectionNotes) ?? []
        editActionLedger = try container.decodeIfPresent([EditActionLedgerRecord].self, forKey: .editActionLedger) ?? []
        publishReceipts = try container.decodeIfPresent([PublishReceiptRecord].self, forKey: .publishReceipts) ?? []
        editPassContext = try container.decodeIfPresent(EditPassContext.self, forKey: .editPassContext) ?? EditPassContext()
    }

    /// Applies an array of imported VideoTags to a specific lane, replacing existing tags.
    public mutating func importTags(_ newTags: [VideoTag], toLaneWithID laneID: UUID) {
        guard let index = lanes.firstIndex(where: { $0.id == laneID }) else { return }
        lanes[index].tags = newTags
    }
}

public struct EditPassContext: Codable, Equatable, Sendable {
    public var label: String
    public var actor: String
    public var actorType: String
    public var passNumber: Int
    public var goal: String
    public var status: String
    public var startedAt: Date
    public var updatedAt: Date

    public init(
        label: String = "Unlabeled editing pass",
        actor: String = "Codex",
        actorType: String = "agent",
        passNumber: Int = 1,
        goal: String = "Create a useful edit while improving the editor.",
        status: String = "active",
        startedAt: Date = Date(),
        updatedAt: Date = Date()
    ) {
        self.label = label.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Unlabeled editing pass" : label
        self.actor = actor.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Codex" : actor
        self.actorType = actorType.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "agent" : actorType
        self.passNumber = max(1, passNumber)
        self.goal = goal.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Create a useful edit while improving the editor." : goal
        self.status = status.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "active" : status
        self.startedAt = startedAt
        self.updatedAt = updatedAt
    }

    enum CodingKeys: String, CodingKey {
        case label
        case actor
        case actorType
        case passNumber
        case goal
        case status
        case startedAt
        case updatedAt
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let decodedStartedAt = try container.decodeIfPresent(Date.self, forKey: .startedAt) ?? Date()
        self.init(
            label: try container.decodeIfPresent(String.self, forKey: .label) ?? "Unlabeled editing pass",
            actor: try container.decodeIfPresent(String.self, forKey: .actor) ?? "Codex",
            actorType: try container.decodeIfPresent(String.self, forKey: .actorType) ?? "agent",
            passNumber: try container.decodeIfPresent(Int.self, forKey: .passNumber) ?? 1,
            goal: try container.decodeIfPresent(String.self, forKey: .goal) ?? "Create a useful edit while improving the editor.",
            status: try container.decodeIfPresent(String.self, forKey: .status) ?? "active",
            startedAt: decodedStartedAt,
            updatedAt: try container.decodeIfPresent(Date.self, forKey: .updatedAt) ?? decodedStartedAt
        )
    }
}

public struct TranscriptSegment: Identifiable, Codable, Equatable, Sendable {
    public let id: UUID
    public var sourceAssetId: UUID?
    public var speaker: String
    public var startTime: Double
    public var endTime: Double
    public var text: String
    public var words: [TranscriptWordTiming]
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
        words: [TranscriptWordTiming] = [],
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
        self.words = words
        self.confidence = confidence
        self.reviewStatus = reviewStatus
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    enum CodingKeys: String, CodingKey {
        case id
        case sourceAssetId
        case speaker
        case startTime
        case endTime
        case text
        case words
        case confidence
        case reviewStatus
        case createdAt
        case updatedAt
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decodeIfPresent(UUID.self, forKey: .id) ?? UUID()
        sourceAssetId = try container.decodeIfPresent(UUID.self, forKey: .sourceAssetId)
        speaker = try container.decodeIfPresent(String.self, forKey: .speaker) ?? "Speaker"
        let decodedStart = try container.decodeIfPresent(Double.self, forKey: .startTime) ?? 0
        let decodedEnd = try container.decodeIfPresent(Double.self, forKey: .endTime) ?? decodedStart
        startTime = max(0, decodedStart)
        endTime = max(startTime, decodedEnd)
        text = try container.decodeIfPresent(String.self, forKey: .text) ?? ""
        words = try container.decodeIfPresent([TranscriptWordTiming].self, forKey: .words) ?? []
        confidence = try container.decodeIfPresent(Double.self, forKey: .confidence)
        reviewStatus = try container.decodeIfPresent(String.self, forKey: .reviewStatus) ?? "draft"
        createdAt = try container.decodeIfPresent(Date.self, forKey: .createdAt) ?? Date()
        updatedAt = try container.decodeIfPresent(Date.self, forKey: .updatedAt) ?? createdAt
    }
}

public struct TranscriptWordTiming: Identifiable, Codable, Equatable, Sendable {
    public let id: UUID
    public var word: String
    public var startTime: Double
    public var endTime: Double
    public var confidence: Double?
    public var source: String

    public init(
        id: UUID = UUID(),
        word: String,
        startTime: Double,
        endTime: Double,
        confidence: Double? = nil,
        source: String = "estimated"
    ) {
        self.id = id
        self.word = word
        self.startTime = max(0, startTime)
        self.endTime = max(max(0, startTime), endTime)
        self.confidence = confidence
        self.source = source.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "estimated" : source
    }

    enum CodingKeys: String, CodingKey {
        case id
        case word
        case startTime
        case endTime
        case confidence
        case source
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let decodedStart = try container.decodeIfPresent(Double.self, forKey: .startTime) ?? 0
        self.init(
            id: try container.decodeIfPresent(UUID.self, forKey: .id) ?? UUID(),
            word: try container.decodeIfPresent(String.self, forKey: .word) ?? "",
            startTime: decodedStart,
            endTime: try container.decodeIfPresent(Double.self, forKey: .endTime) ?? decodedStart,
            confidence: try container.decodeIfPresent(Double.self, forKey: .confidence),
            source: try container.decodeIfPresent(String.self, forKey: .source) ?? "estimated"
        )
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

    enum CodingKeys: String, CodingKey {
        case id
        case sourceLaneId
        case sourceLaneName
        case sourcePath
        case provider
        case commandPath
        case status
        case startedAt
        case completedAt
        case error
        case segmentCount
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.init(
            id: try container.decodeIfPresent(UUID.self, forKey: .id) ?? UUID(),
            sourceLaneId: try container.decodeIfPresent(UUID.self, forKey: .sourceLaneId),
            sourceLaneName: try container.decodeIfPresent(String.self, forKey: .sourceLaneName) ?? "",
            sourcePath: try container.decodeIfPresent(String.self, forKey: .sourcePath) ?? "",
            provider: try container.decodeIfPresent(String.self, forKey: .provider) ?? "local-command",
            commandPath: try container.decodeIfPresent(String.self, forKey: .commandPath),
            status: try container.decodeIfPresent(String.self, forKey: .status) ?? "queued",
            startedAt: try container.decodeIfPresent(Date.self, forKey: .startedAt) ?? Date(),
            completedAt: try container.decodeIfPresent(Date.self, forKey: .completedAt),
            error: try container.decodeIfPresent(String.self, forKey: .error) ?? "",
            segmentCount: try container.decodeIfPresent(Int.self, forKey: .segmentCount) ?? 0
        )
    }
}

public struct EditCorrectionNoteRecord: Identifiable, Codable, Equatable, Sendable {
    public let id: UUID
    public var actor: String
    public var actorType: String
    public var category: String
    public var note: String
    public var sequenceTime: Double
    public var sourceTime: Double?
    public var laneId: UUID?
    public var laneName: String
    public var tagId: UUID?
    public var tagType: String
    public var beforeJson: String
    public var afterJson: String
    public var reviewStatus: String
    public var createdAt: Date
    public var updatedAt: Date

    public init(
        id: UUID = UUID(),
        actor: String = "Unknown editor",
        actorType: String = "human",
        category: String = "edit-note",
        note: String,
        sequenceTime: Double,
        sourceTime: Double? = nil,
        laneId: UUID? = nil,
        laneName: String = "",
        tagId: UUID? = nil,
        tagType: String = "",
        beforeJson: String = "",
        afterJson: String = "",
        reviewStatus: String = "open",
        createdAt: Date = Date(),
        updatedAt: Date = Date()
    ) {
        self.id = id
        self.actor = actor.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Unknown editor" : actor
        self.actorType = actorType.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "human" : actorType
        self.category = category.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "edit-note" : category
        self.note = note
        self.sequenceTime = max(0, sequenceTime.isFinite ? sequenceTime : 0)
        self.sourceTime = sourceTime
        self.laneId = laneId
        self.laneName = laneName
        self.tagId = tagId
        self.tagType = tagType
        self.beforeJson = beforeJson
        self.afterJson = afterJson
        self.reviewStatus = reviewStatus.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "open" : reviewStatus
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    enum CodingKeys: String, CodingKey {
        case id
        case actor
        case actorType
        case category
        case note
        case sequenceTime
        case sourceTime
        case laneId
        case laneName
        case tagId
        case tagType
        case beforeJson
        case afterJson
        case reviewStatus
        case createdAt
        case updatedAt
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let created = try container.decodeIfPresent(Date.self, forKey: .createdAt) ?? Date()
        self.init(
            id: try container.decodeIfPresent(UUID.self, forKey: .id) ?? UUID(),
            actor: try container.decodeIfPresent(String.self, forKey: .actor) ?? "Unknown editor",
            actorType: try container.decodeIfPresent(String.self, forKey: .actorType) ?? "human",
            category: try container.decodeIfPresent(String.self, forKey: .category) ?? "edit-note",
            note: try container.decodeIfPresent(String.self, forKey: .note) ?? "",
            sequenceTime: try container.decodeIfPresent(Double.self, forKey: .sequenceTime) ?? 0,
            sourceTime: try container.decodeIfPresent(Double.self, forKey: .sourceTime),
            laneId: try container.decodeIfPresent(UUID.self, forKey: .laneId),
            laneName: try container.decodeIfPresent(String.self, forKey: .laneName) ?? "",
            tagId: try container.decodeIfPresent(UUID.self, forKey: .tagId),
            tagType: try container.decodeIfPresent(String.self, forKey: .tagType) ?? "",
            beforeJson: try container.decodeIfPresent(String.self, forKey: .beforeJson) ?? "",
            afterJson: try container.decodeIfPresent(String.self, forKey: .afterJson) ?? "",
            reviewStatus: try container.decodeIfPresent(String.self, forKey: .reviewStatus) ?? "open",
            createdAt: created,
            updatedAt: try container.decodeIfPresent(Date.self, forKey: .updatedAt) ?? created
        )
    }
}

public struct EditActionLedgerRecord: Identifiable, Codable, Equatable, Sendable {
    public let id: UUID
    public var actor: String
    public var actorType: String
    public var actionId: String
    public var actionLabel: String
    public var category: String
    public var endpoint: String
    public var sequenceTime: Double
    public var sourceTime: Double?
    public var laneId: UUID?
    public var laneName: String
    public var tagId: UUID?
    public var tagType: String
    public var beforeJson: String
    public var afterJson: String
    public var note: String
    public var createdAt: Date

    public init(
        id: UUID = UUID(),
        actor: String = "Codex",
        actorType: String = "agent",
        actionId: String,
        actionLabel: String,
        category: String = "edit-action",
        endpoint: String = "",
        sequenceTime: Double,
        sourceTime: Double? = nil,
        laneId: UUID? = nil,
        laneName: String = "",
        tagId: UUID? = nil,
        tagType: String = "",
        beforeJson: String = "",
        afterJson: String = "",
        note: String = "",
        createdAt: Date = Date()
    ) {
        self.id = id
        self.actor = actor.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Codex" : actor
        self.actorType = actorType.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "agent" : actorType
        self.actionId = actionId
        self.actionLabel = actionLabel
        self.category = category.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "edit-action" : category
        self.endpoint = endpoint
        self.sequenceTime = max(0, sequenceTime.isFinite ? sequenceTime : 0)
        self.sourceTime = sourceTime
        self.laneId = laneId
        self.laneName = laneName
        self.tagId = tagId
        self.tagType = tagType
        self.beforeJson = beforeJson
        self.afterJson = afterJson
        self.note = note
        self.createdAt = createdAt
    }

    enum CodingKeys: String, CodingKey {
        case id
        case actor
        case actorType
        case actionId
        case actionLabel
        case category
        case endpoint
        case sequenceTime
        case sourceTime
        case laneId
        case laneName
        case tagId
        case tagType
        case beforeJson
        case afterJson
        case note
        case createdAt
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.init(
            id: try container.decodeIfPresent(UUID.self, forKey: .id) ?? UUID(),
            actor: try container.decodeIfPresent(String.self, forKey: .actor) ?? "Codex",
            actorType: try container.decodeIfPresent(String.self, forKey: .actorType) ?? "agent",
            actionId: try container.decodeIfPresent(String.self, forKey: .actionId) ?? UUID().uuidString,
            actionLabel: try container.decodeIfPresent(String.self, forKey: .actionLabel) ?? "Recovered edit action",
            category: try container.decodeIfPresent(String.self, forKey: .category) ?? "edit-action",
            endpoint: try container.decodeIfPresent(String.self, forKey: .endpoint) ?? "",
            sequenceTime: try container.decodeIfPresent(Double.self, forKey: .sequenceTime) ?? 0,
            sourceTime: try container.decodeIfPresent(Double.self, forKey: .sourceTime),
            laneId: try container.decodeIfPresent(UUID.self, forKey: .laneId),
            laneName: try container.decodeIfPresent(String.self, forKey: .laneName) ?? "",
            tagId: try container.decodeIfPresent(UUID.self, forKey: .tagId),
            tagType: try container.decodeIfPresent(String.self, forKey: .tagType) ?? "",
            beforeJson: try container.decodeIfPresent(String.self, forKey: .beforeJson) ?? "",
            afterJson: try container.decodeIfPresent(String.self, forKey: .afterJson) ?? "",
            note: try container.decodeIfPresent(String.self, forKey: .note) ?? "",
            createdAt: try container.decodeIfPresent(Date.self, forKey: .createdAt) ?? Date()
        )
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

public enum PublishOutputFamily: String, Codable, CaseIterable, Equatable, Hashable, Sendable {
    case episode16x9
    case short9x16
    case podcastAudio
    case platformPublication

    public var title: String {
        switch self {
        case .episode16x9:
            return "16:9 episode"
        case .short9x16:
            return "9:16 short"
        case .podcastAudio:
            return "Podcast audio"
        case .platformPublication:
            return "Platform publication"
        }
    }

    public var defaultDestinations: [String] {
        switch self {
        case .episode16x9:
            return ["YouTube", "Patreon"]
        case .short9x16:
            return ["YouTube Shorts", "Instagram", "Facebook", "LinkedIn"]
        case .podcastAudio:
            return ["Spotify", "Apple Podcasts"]
        case .platformPublication:
            return ["YouTube", "Patreon", "Instagram", "Facebook", "LinkedIn", "Spotify", "Apple Podcasts"]
        }
    }
}

public enum PublishReadinessState: String, Codable, CaseIterable, Equatable, Hashable, Sendable {
    case draft
    case readyToReview
    case readyToExport
    case exported
    case published
    case needsAttention

    public var label: String {
        switch self {
        case .draft:
            return "Draft"
        case .readyToReview:
            return "Ready to review"
        case .readyToExport:
            return "Ready to export"
        case .exported:
            return "Exported"
        case .published:
            return "Published"
        case .needsAttention:
            return "Needs attention"
        }
    }

    public var plainEnglishMeaning: String {
        switch self {
        case .draft:
            return "Useful idea, not ready for export."
        case .readyToReview:
            return "Playable and understandable, needs human check."
        case .readyToExport:
            return "Enough media and metadata exist to build the artifact."
        case .exported:
            return "A local output file exists."
        case .published:
            return "A destination receipt or public URL exists."
        case .needsAttention:
            return "Blocked by missing media, metadata, credentials, export failure, or missing receipt."
        }
    }
}

public struct PublishDeliverableReadiness: Identifiable, Codable, Equatable, Sendable {
    public var id: String
    public var family: PublishOutputFamily
    public var destination: String
    public var deliveryLaneId: String
    public var artifactType: String
    public var format: String
    public var status: PublishReadinessState
    public var artifactPath: String
    public var publicURL: String
    public var providerReceiptId: String
    public var blocker: String
    public var nextAction: String
    public var updatedAt: Date

    public init(
        id: String,
        family: PublishOutputFamily,
        destination: String,
        deliveryLaneId: String,
        artifactType: String,
        format: String,
        status: PublishReadinessState,
        artifactPath: String = "",
        publicURL: String = "",
        providerReceiptId: String = "",
        blocker: String = "",
        nextAction: String = "",
        updatedAt: Date = Date()
    ) {
        self.id = id
        self.family = family
        self.destination = destination
        self.deliveryLaneId = deliveryLaneId
        self.artifactType = artifactType
        self.format = format
        self.status = status
        self.artifactPath = artifactPath
        self.publicURL = publicURL
        self.providerReceiptId = providerReceiptId
        self.blocker = blocker
        self.nextAction = nextAction
        self.updatedAt = updatedAt
    }
}

public extension PublishReceiptRecord {
    var outputFamily: PublishOutputFamily {
        let lane = deliveryLaneId.lowercased()
        let platformText = platform.lowercased()
        let formatText = format.lowercased()
        let artifactText = artifactType.lowercased()

        if lane.contains("social") || lane.contains("short") || platformText.contains("shorts") || platformText.contains("instagram") || platformText.contains("facebook") || platformText.contains("linkedin") || formatText.contains("9:16") || formatText.contains("9x16") {
            return .short9x16
        }

        if lane.contains("podcast") || platformText.contains("spotify") || platformText.contains("apple") || artifactText.contains("audio") || formatText == "audio" {
            return .podcastAudio
        }

        if lane.contains("channel") || artifactText.contains("upload") || artifactText.contains("schedule") {
            return .platformPublication
        }

        return .episode16x9
    }

    func readinessState(artifactExists: Bool? = nil) -> PublishReadinessState {
        let normalizedPublishStatus = publishStatus.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let normalizedArtifactStatus = artifactStatus.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let normalizedMetadataStatus = metadataStatus.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let normalizedUploadStatus = uploadJobStatus.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let hasReceipt = !publicURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            || !providerReceiptId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            || !receiptJson.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            || publishedAt != nil

        if normalizedPublishStatus == "published" || hasReceipt {
            return .published
        }

        if normalizedPublishStatus == "failed"
            || normalizedUploadStatus == "failed"
            || normalizedArtifactStatus == "failed"
            || normalizedArtifactStatus == "missing"
            || normalizedArtifactStatus == "blocked" {
            return .needsAttention
        }

        if artifactExists == true || normalizedArtifactStatus == "exported" || normalizedArtifactStatus == "ready" || normalizedArtifactStatus == "artifact-ready" {
            if normalizedMetadataStatus == "ready" || normalizedMetadataStatus == "custom" || normalizedMetadataStatus == "approved" || !title.isEmpty || !description.isEmpty {
                return .readyToExport
            }
            return .exported
        }

        if normalizedArtifactStatus == "export-needed" || normalizedArtifactStatus == "ready-to-export" {
            return .readyToExport
        }

        if normalizedPublishStatus == "ready-to-upload"
            || normalizedPublishStatus == "uploaded"
            || normalizedPublishStatus == "scheduled"
            || normalizedUploadStatus == "dry-run-passed" {
            return .readyToReview
        }

        return .draft
    }

    func deliverableReadiness(artifactExists: Bool? = nil, now: Date = Date()) -> PublishDeliverableReadiness {
        let state = readinessState(artifactExists: artifactExists)
        return PublishDeliverableReadiness(
            id: "\(deliveryLaneId):\(platform):\(id.uuidString)",
            family: outputFamily,
            destination: platform,
            deliveryLaneId: deliveryLaneId,
            artifactType: artifactType,
            format: format,
            status: state,
            artifactPath: artifactPath,
            publicURL: publicURL,
            providerReceiptId: providerReceiptId,
            blocker: readinessBlocker(state: state, artifactExists: artifactExists),
            nextAction: readinessNextAction(state: state),
            updatedAt: updatedAt > createdAt ? updatedAt : now
        )
    }

    private func readinessBlocker(state: PublishReadinessState, artifactExists: Bool?) -> String {
        guard state == .needsAttention else { return "" }
        if artifactPath.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return "No artifact path is attached to this publish target."
        }
        if artifactExists == false {
            return "The referenced artifact file does not exist locally."
        }
        if publishStatus.lowercased() == "failed" || uploadJobStatus.lowercased() == "failed" {
            return notes.isEmpty ? "Publish or upload worker reported failure." : notes
        }
        return "This target needs human review before export or publication."
    }

    private func readinessNextAction(state: PublishReadinessState) -> String {
        switch state {
        case .draft:
            return "Add artifact, title, description, destination, and export plan."
        case .readyToReview:
            return "Review playback, copy, and destination metadata."
        case .readyToExport:
            return "Export or hand off the artifact, then capture receipt details."
        case .exported:
            return "Review the local file and prepare the destination upload."
        case .published:
            return "Keep receipt URL/id attached for future agents and analytics."
        case .needsAttention:
            return "Resolve the blocker before treating this publish target as ready."
        }
    }
}

public extension MediaSequence {
    func publishDeliverableReadiness(
        artifactExists: ((String) -> Bool)? = nil,
        now: Date = Date()
    ) -> [PublishDeliverableReadiness] {
        publishReceipts.map { record in
            let exists: Bool?
            if record.artifactPath.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                exists = nil
            } else {
                exists = artifactExists?(record.artifactPath)
            }
            return record.deliverableReadiness(artifactExists: exists, now: now)
        }
    }

    func publishReadinessCounts(
        artifactExists: ((String) -> Bool)? = nil,
        now: Date = Date()
    ) -> [PublishReadinessState: Int] {
        var counts: [PublishReadinessState: Int] = [:]
        for row in publishDeliverableReadiness(artifactExists: artifactExists, now: now) {
            counts[row.status, default: 0] += 1
        }
        return counts
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
        case "json":
            segments = try parseJSON(text)
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
        if requested == "srt" || requested == "vtt" || requested == "json" { return requested }
        let ext = (filename as NSString).pathExtension.lowercased()
        if ext == "srt" || ext == "vtt" || ext == "json" { return ext }
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.hasPrefix("{") || trimmed.hasPrefix("[") { return "json" }
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
                    words: estimatedWordTimings(
                        text: parsed.text,
                        startTime: start,
                        endTime: end,
                        source: "segment-estimated"
                    ),
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
                return trimmed != "WEBVTT"
                    && !trimmed.hasPrefix("NOTE")
                    && !trimmed.hasPrefix("STYLE")
                    && !trimmed.hasPrefix("REGION")
                    && !trimmed.hasPrefix("Kind:")
                    && !trimmed.hasPrefix("Language:")
            }
            .joined(separator: "\n")

        return splitBlocks(withoutHeader)
            .compactMap { block in
                let lines = block
                    .components(separatedBy: .newlines)
                    .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                    .filter { !$0.isEmpty }
                guard let timingIndex = lines.firstIndex(where: { $0.contains("-->") }) else { return nil }
                let timeParts = lines[timingIndex].components(separatedBy: "-->")
                guard timeParts.count >= 2,
                      let start = parseTimestamp(timeParts[0]),
                      let end = parseTimestamp(timeParts[1]),
                      end > start else {
                    return nil
                }

                let rawCaption = Array(lines.dropFirst(timingIndex + 1)).joined(separator: " ")
                let hasInlineWordTiming = rawCaption.range(
                    of: #"<\d{2}:\d{2}(?::\d{2})?\.\d{3}>"#,
                    options: .regularExpression
                ) != nil
                let duration = end - start

                // YouTube auto-caption VTT often includes tiny duplicate display cues
                // immediately after word-timed cues. Keep normal VTT cues, but drop
                // near-zero non-word-timed echoes so the transcript spine stays usable.
                if !hasInlineWordTiming && duration <= 0.05 {
                    return nil
                }

                let cleanedCaption = cleanTranscriptText(rawCaption)
                let parsed = parseSpeakerAndText(cleanedCaption)
                guard !parsed.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                    return nil
                }

                let inlineWords = hasInlineWordTiming
                    ? vttInlineWordTimings(rawCaption, startTime: start, endTime: end)
                    : []

                return TranscriptSegment(
                    speaker: parsed.speaker,
                    startTime: start,
                    endTime: end,
                    text: parsed.text,
                    words: inlineWords.isEmpty
                        ? estimatedWordTimings(
                            text: parsed.text,
                            startTime: start,
                            endTime: end,
                            source: "vtt-segment-estimated"
                        )
                        : inlineWords,
                    confidence: nil,
                    reviewStatus: "imported"
                )
            }
    }

    private static func splitBlocks(_ text: String) -> [String] {
        text
            .replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
            .components(separatedBy: "\n\n")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }

    private static func parseJSON(_ text: String) throws -> [TranscriptSegment] {
        let data = Data(text.utf8)
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase

        if let envelope = try? decoder.decode(TranscriptJSONEnvelope.self, from: data) {
            return envelope.segments.compactMap(transcriptSegment(from:))
        }
        if let segments = try? decoder.decode([TranscriptJSONSegment].self, from: data) {
            return segments.compactMap(transcriptSegment(from:))
        }
        throw TranscriptParseError.unsupportedFormat("json")
    }

    private static func transcriptSegment(from json: TranscriptJSONSegment) -> TranscriptSegment? {
        guard let start = json.startTime ?? json.start,
              let end = json.endTime ?? json.end,
              end > start else {
            return nil
        }
        let text = (json.text ?? json.transcript ?? json.caption ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return nil }

        let importedWords = (json.words ?? json.wordTimings ?? [])
            .compactMap { word -> TranscriptWordTiming? in
                let label = (word.word ?? word.text ?? "")
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                guard !label.isEmpty,
                      let wordStart = word.startTime ?? word.start,
                      let wordEnd = word.endTime ?? word.end,
                      wordEnd > wordStart else {
                    return nil
                }
                return TranscriptWordTiming(
                    word: label,
                    startTime: wordStart,
                    endTime: wordEnd,
                    confidence: word.confidence,
                    source: word.source ?? "json-word-timing"
                )
            }
            .sorted { $0.startTime < $1.startTime }

        return TranscriptSegment(
            speaker: json.speaker ?? json.channel ?? "Speaker",
            startTime: start,
            endTime: end,
            text: text,
            words: importedWords.isEmpty
                ? estimatedWordTimings(
                    text: text,
                    startTime: start,
                    endTime: end,
                    source: "json-segment-estimated"
                )
                : importedWords,
            confidence: json.confidence,
            reviewStatus: json.reviewStatus ?? "imported"
        )
    }

    private static func estimatedWordTimings(
        text: String,
        startTime: Double,
        endTime: Double,
        source: String
    ) -> [TranscriptWordTiming] {
        let tokens = text
            .split(whereSeparator: { $0.isWhitespace || $0.isNewline })
            .map { String($0) }
        guard !tokens.isEmpty else { return [] }
        let duration = max(0.01, endTime - startTime)
        let step = duration / Double(tokens.count)
        return tokens.enumerated().map { index, word in
            let start = startTime + (Double(index) * step)
            return TranscriptWordTiming(
                word: word,
                startTime: start,
                endTime: min(endTime, start + step),
                confidence: nil,
                source: source
            )
        }
    }

    private static func vttInlineWordTimings(
        _ rawCaption: String,
        startTime: Double,
        endTime: Double
    ) -> [TranscriptWordTiming] {
        let pattern = #"<(\d{2}:\d{2}(?::\d{2})?\.\d{3})>"#
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return [] }
        let nsCaption = rawCaption as NSString
        let fullRange = NSRange(location: 0, length: nsCaption.length)
        let matches = regex.matches(in: rawCaption, range: fullRange)
        guard !matches.isEmpty else { return [] }

        var words: [TranscriptWordTiming] = []
        var currentStart = startTime
        var cursor = 0

        for match in matches {
            if match.range.location > cursor {
                let chunk = nsCaption.substring(with: NSRange(location: cursor, length: match.range.location - cursor))
                words.append(
                    contentsOf: chunkWordTimings(
                        chunk,
                        startTime: currentStart,
                        endTime: min(endTime, parseTimestamp(nsCaption.substring(with: match.range(at: 1))) ?? endTime),
                        source: "vtt-word-timing"
                    )
                )
            }

            if let timestamp = parseTimestamp(nsCaption.substring(with: match.range(at: 1))) {
                currentStart = min(max(startTime, timestamp), endTime)
            }
            cursor = match.range.location + match.range.length
        }

        if cursor < nsCaption.length {
            let chunk = nsCaption.substring(with: NSRange(location: cursor, length: nsCaption.length - cursor))
            words.append(contentsOf: chunkWordTimings(chunk, startTime: currentStart, endTime: endTime, source: "vtt-word-timing"))
        }

        return words
            .filter { !$0.word.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && $0.endTime > $0.startTime }
            .sorted { $0.startTime < $1.startTime }
    }

    private static func chunkWordTimings(
        _ rawChunk: String,
        startTime: Double,
        endTime: Double,
        source: String
    ) -> [TranscriptWordTiming] {
        let cleaned = cleanTranscriptText(rawChunk)
        let tokens = cleaned
            .split(whereSeparator: { $0.isWhitespace || $0.isNewline })
            .map { String($0) }
        guard !tokens.isEmpty, endTime > startTime else { return [] }

        let step = (endTime - startTime) / Double(tokens.count)
        return tokens.enumerated().map { index, token in
            let start = startTime + (Double(index) * step)
            return TranscriptWordTiming(
                word: token,
                startTime: start,
                endTime: min(endTime, start + step),
                confidence: nil,
                source: source
            )
        }
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
        let text = cleanTranscriptText(rawText)
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

    private static func cleanTranscriptText(_ rawText: String) -> String {
        rawText
            .replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression)
            .replacingOccurrences(of: "&gt;", with: ">")
            .replacingOccurrences(of: "&lt;", with: "<")
            .replacingOccurrences(of: "&amp;", with: "&")
            .replacingOccurrences(of: "&quot;", with: "\"")
            .replacingOccurrences(of: "&#39;", with: "'")
            .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private struct TranscriptJSONEnvelope: Decodable {
        var segments: [TranscriptJSONSegment]
    }

    private struct TranscriptJSONSegment: Decodable {
        var speaker: String?
        var channel: String?
        var startTime: Double?
        var start: Double?
        var endTime: Double?
        var end: Double?
        var text: String?
        var transcript: String?
        var caption: String?
        var confidence: Double?
        var reviewStatus: String?
        var words: [TranscriptJSONWord]?
        var wordTimings: [TranscriptJSONWord]?
    }

    private struct TranscriptJSONWord: Decodable {
        var word: String?
        var text: String?
        var startTime: Double?
        var start: Double?
        var endTime: Double?
        var end: Double?
        var confidence: Double?
        var source: String?
    }
}

public struct ShortClipCandidate: Identifiable, Codable, Equatable {
    public let id: UUID
    public var title: String
    public var startTime: Double
    public var duration: Double
    public var segments: [ShortClipSegment]
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
        segments: [ShortClipSegment] = [],
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
        self.segments = segments.isEmpty
            ? [ShortClipSegment(
                title: "Segment 1",
                startTime: startTime,
                duration: duration,
                sourceLaneId: sourceLaneId,
                sourceTagId: sourceTagId
            )]
            : segments
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
        case segments
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
        let decodedSegments = try container.decodeIfPresent([ShortClipSegment].self, forKey: .segments) ?? []
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
        segments = decodedSegments.isEmpty
            ? [ShortClipSegment(
                title: "Segment 1",
                startTime: startTime,
                duration: duration,
                sourceLaneId: sourceLaneId,
                sourceTagId: sourceTagId
            )]
            : decodedSegments
        notes = try container.decodeIfPresent(String.self, forKey: .notes) ?? ""
        createdAt = try container.decodeIfPresent(Date.self, forKey: .createdAt) ?? Date()
        updatedAt = try container.decodeIfPresent(Date.self, forKey: .updatedAt) ?? createdAt
    }
}

public struct ShortClipSegment: Identifiable, Codable, Equatable {
    public let id: UUID
    public var title: String
    public var startTime: Double
    public var duration: Double
    public var sourceLaneId: UUID?
    public var sourceTagId: UUID?
    public var notes: String
    public var createdAt: Date
    public var updatedAt: Date

    public init(
        id: UUID = UUID(),
        title: String = "Segment",
        startTime: Double,
        duration: Double,
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
        case sourceLaneId
        case sourceTagId
        case notes
        case createdAt
        case updatedAt
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let decodedStart = try container.decodeIfPresent(Double.self, forKey: .startTime) ?? 0
        let created = try container.decodeIfPresent(Date.self, forKey: .createdAt) ?? Date()
        self.init(
            id: try container.decodeIfPresent(UUID.self, forKey: .id) ?? UUID(),
            title: try container.decodeIfPresent(String.self, forKey: .title) ?? "Segment",
            startTime: decodedStart,
            duration: try container.decodeIfPresent(Double.self, forKey: .duration) ?? 0,
            sourceLaneId: try container.decodeIfPresent(UUID.self, forKey: .sourceLaneId),
            sourceTagId: try container.decodeIfPresent(UUID.self, forKey: .sourceTagId),
            notes: try container.decodeIfPresent(String.self, forKey: .notes) ?? "",
            createdAt: created,
            updatedAt: try container.decodeIfPresent(Date.self, forKey: .updatedAt) ?? created
        )
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

    enum CodingKeys: String, CodingKey {
        case id
        case platform
        case title
        case caption
        case hashtags
        case status
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.init(
            id: try container.decodeIfPresent(UUID.self, forKey: .id) ?? UUID(),
            platform: try container.decodeIfPresent(String.self, forKey: .platform) ?? "Unassigned",
            title: try container.decodeIfPresent(String.self, forKey: .title) ?? "",
            caption: try container.decodeIfPresent(String.self, forKey: .caption) ?? "",
            hashtags: try container.decodeIfPresent([String].self, forKey: .hashtags) ?? [],
            status: try container.decodeIfPresent(String.self, forKey: .status) ?? "draft"
        )
    }
}

public struct OrientationTrack: Identifiable, Codable, Equatable {
    public let id: UUID
    public var keyframes: [FramingKeyframe]

    public init(id: UUID = UUID(), keyframes: [FramingKeyframe] = []) {
        self.id = id
        self.keyframes = keyframes
    }

    enum CodingKeys: String, CodingKey {
        case id
        case keyframes
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.init(
            id: try container.decodeIfPresent(UUID.self, forKey: .id) ?? UUID(),
            keyframes: try container.decodeIfPresent([FramingKeyframe].self, forKey: .keyframes) ?? []
        )
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

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = (try? container.decode(String.self)) ?? ""
        switch raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "bezier", "ease", "eased":
            self = .bezier
        case "hold", "step":
            self = .hold
        default:
            self = .linear
        }
    }
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

    enum CodingKeys: String, CodingKey {
        case id
        case time
        case yaw
        case pitch
        case roll
        case fov
        case interpolation
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.init(
            id: try container.decodeIfPresent(UUID.self, forKey: .id) ?? UUID(),
            time: try container.decodeIfPresent(Double.self, forKey: .time) ?? 0,
            yaw: try container.decodeIfPresent(Double.self, forKey: .yaw) ?? 0,
            pitch: try container.decodeIfPresent(Double.self, forKey: .pitch) ?? 0,
            roll: try container.decodeIfPresent(Double.self, forKey: .roll) ?? 0,
            fov: try container.decodeIfPresent(Double.self, forKey: .fov) ?? 90,
            interpolation: try container.decodeIfPresent(InterpolationMode.self, forKey: .interpolation) ?? .linear
        )
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

    enum CodingKeys: String, CodingKey {
        case id
        case name
        case sourceVideo
        case tags
        case metadata
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.init(
            id: try container.decodeIfPresent(UUID.self, forKey: .id) ?? UUID(),
            name: try container.decodeIfPresent(String.self, forKey: .name) ?? "Recovered lane",
            sourceVideo: try container.decodeIfPresent(SourceVideo.self, forKey: .sourceVideo),
            tags: try container.decodeIfPresent([VideoTag].self, forKey: .tags) ?? [],
            metadata: try container.decodeIfPresent(VideoLaneMetadata.self, forKey: .metadata)
        )
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
    public var ignoreForProduction: Bool?
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
        ignoreForProduction: Bool? = nil,
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
        self.ignoreForProduction = ignoreForProduction
        self.programCrop16x9 = programCrop16x9
        self.programCrop9x16 = programCrop9x16
        self.programCropKeyframes16x9 = programCropKeyframes16x9
        self.programCropKeyframes9x16 = programCropKeyframes9x16
    }

    enum CodingKeys: String, CodingKey {
        case sourceAssetId
        case mediaKind
        case role
        case trackIds
        case sourcePath
        case originalPath
        case vaultRawPath
        case vaultProxyPath
        case assetFingerprint
        case declaredExists
        case sourceLabel
        case isPremiereRescue
        case ignoreForProduction
        case programCrop16x9
        case programCrop9x16
        case programCropKeyframes16x9
        case programCropKeyframes9x16
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.init(
            sourceAssetId: try container.decodeIfPresent(String.self, forKey: .sourceAssetId),
            mediaKind: try container.decodeIfPresent(String.self, forKey: .mediaKind) ?? "unknown",
            role: try container.decodeIfPresent(String.self, forKey: .role) ?? "unknown",
            trackIds: try container.decodeIfPresent([String].self, forKey: .trackIds) ?? [],
            sourcePath: try container.decodeIfPresent(String.self, forKey: .sourcePath),
            originalPath: try container.decodeIfPresent(String.self, forKey: .originalPath),
            vaultRawPath: try container.decodeIfPresent(String.self, forKey: .vaultRawPath),
            vaultProxyPath: try container.decodeIfPresent(String.self, forKey: .vaultProxyPath),
            assetFingerprint: try container.decodeIfPresent(String.self, forKey: .assetFingerprint),
            declaredExists: try container.decodeIfPresent(Bool.self, forKey: .declaredExists),
            sourceLabel: try container.decodeIfPresent(String.self, forKey: .sourceLabel),
            isPremiereRescue: try container.decodeIfPresent(Bool.self, forKey: .isPremiereRescue) ?? false,
            ignoreForProduction: try container.decodeIfPresent(Bool.self, forKey: .ignoreForProduction),
            programCrop16x9: try container.decodeIfPresent(ProgramCropAdjustment.self, forKey: .programCrop16x9),
            programCrop9x16: try container.decodeIfPresent(ProgramCropAdjustment.self, forKey: .programCrop9x16),
            programCropKeyframes16x9: try container.decodeIfPresent([ProgramCropKeyframe].self, forKey: .programCropKeyframes16x9),
            programCropKeyframes9x16: try container.decodeIfPresent([ProgramCropKeyframe].self, forKey: .programCropKeyframes9x16)
        )
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

    enum CodingKeys: String, CodingKey {
        case panX
        case panY
        case zoom
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.init(
            panX: try container.decodeIfPresent(Double.self, forKey: .panX) ?? 0,
            panY: try container.decodeIfPresent(Double.self, forKey: .panY) ?? 0,
            zoom: try container.decodeIfPresent(Double.self, forKey: .zoom) ?? 1
        )
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

    enum CodingKeys: String, CodingKey {
        case id
        case time
        case panX
        case panY
        case zoom
        case interpolation
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.init(
            id: try container.decodeIfPresent(UUID.self, forKey: .id) ?? UUID(),
            time: try container.decodeIfPresent(Double.self, forKey: .time) ?? 0,
            panX: try container.decodeIfPresent(Double.self, forKey: .panX) ?? 0,
            panY: try container.decodeIfPresent(Double.self, forKey: .panY) ?? 0,
            zoom: try container.decodeIfPresent(Double.self, forKey: .zoom) ?? 1,
            interpolation: try container.decodeIfPresent(InterpolationMode.self, forKey: .interpolation) ?? .linear
        )
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

    enum CodingKeys: String, CodingKey {
        case savedAt
        case activeSequenceId
        case project
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.init(
            savedAt: try container.decodeIfPresent(Date.self, forKey: .savedAt) ?? Date(),
            activeSequenceId: try container.decodeIfPresent(UUID.self, forKey: .activeSequenceId),
            project: try container.decodeIfPresent(VideoProject.self, forKey: .project) ?? VideoProject(title: "Recovered Quipsly Session")
        )
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

    enum CodingKeys: String, CodingKey {
        case id
        case mediaURL
        case proxyURL
        case duration
        case offset
        case is360
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.init(
            id: try container.decodeIfPresent(UUID.self, forKey: .id) ?? UUID(),
            mediaURL: try container.decodeIfPresent(URL.self, forKey: .mediaURL) ?? URL(fileURLWithPath: "/missing-media"),
            proxyURL: try container.decodeIfPresent(URL.self, forKey: .proxyURL),
            duration: try container.decodeIfPresent(Double.self, forKey: .duration) ?? 0,
            offset: try container.decodeIfPresent(Double.self, forKey: .offset) ?? 0,
            is360: try container.decodeIfPresent(Bool.self, forKey: .is360) ?? false
        )
    }
}

public enum TagType: String, Codable, Equatable, CaseIterable {
    case highlight = "Highlight"
    case meme = "Meme"
    case keep = "Keep"
    case cut = "Cut"
    case active = "Active"
    case focus = "Focus"

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = (try? container.decode(String.self)) ?? ""
        switch raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "active", "show", "visible", "program":
            self = .active
        case "cut", "skip", "quiet", "gap", "inactive":
            self = .cut
        case "keep":
            self = .keep
        case "meme":
            self = .meme
        case "focus":
            self = .focus
        default:
            self = .highlight
        }
    }
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

    enum CodingKeys: String, CodingKey {
        case id
        case type
        case startTime
        case duration
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.init(
            id: try container.decodeIfPresent(UUID.self, forKey: .id) ?? UUID(),
            type: try container.decodeIfPresent(TagType.self, forKey: .type) ?? .highlight,
            startTime: try container.decodeIfPresent(Double.self, forKey: .startTime) ?? 0,
            duration: try container.decodeIfPresent(Double.self, forKey: .duration) ?? 0
        )
    }
}
