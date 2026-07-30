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

public enum ClipFocusPlacement: String, Codable, CaseIterable, Identifiable, Sendable {
    case cornerSquares
    case clipAbove
    case sideRail
    case hostWings

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .cornerSquares: return "Corners"
        case .clipAbove: return "Clip Above"
        case .sideRail: return "Side Rail"
        case .hostWings: return "Host Wings"
        }
    }
}

public enum ClipFocusContentMode: String, Codable, CaseIterable, Identifiable, Sendable {
    case fit
    case fill

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .fit: return "Whole Clip"
        case .fill: return "Crop to Fill"
        }
    }
}

public struct ClipFocusLayoutSettings: Codable, Equatable, Sendable {
    public var placement: ClipFocusPlacement
    public var reactionSize: Double
    public var clipContentMode: ClipFocusContentMode
    /// Normalized point in the source clip that should remain emphasized when
    /// zoom or Crop to Fill creates overflow. -1 is left/top; +1 is right/bottom.
    public var focusX: Double
    public var focusY: Double

    public init(
        placement: ClipFocusPlacement = .clipAbove,
        reactionSize: Double = 0.18,
        clipContentMode: ClipFocusContentMode = .fit,
        focusX: Double = 0,
        focusY: Double = 0
    ) {
        self.placement = placement
        self.reactionSize = reactionSize
        self.clipContentMode = clipContentMode
        self.focusX = focusX
        self.focusY = focusY
    }

    private enum CodingKeys: String, CodingKey {
        case placement
        case reactionSize
        case clipContentMode
        case focusX
        case focusY
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        placement = try container.decodeIfPresent(ClipFocusPlacement.self, forKey: .placement) ?? .clipAbove
        reactionSize = try container.decodeIfPresent(Double.self, forKey: .reactionSize) ?? 0.18
        clipContentMode = try container.decodeIfPresent(ClipFocusContentMode.self, forKey: .clipContentMode) ?? .fit
        focusX = try container.decodeIfPresent(Double.self, forKey: .focusX) ?? 0
        focusY = try container.decodeIfPresent(Double.self, forKey: .focusY) ?? 0
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(placement, forKey: .placement)
        try container.encode(reactionSize, forKey: .reactionSize)
        try container.encode(clipContentMode, forKey: .clipContentMode)
        try container.encode(focusX, forKey: .focusX)
        try container.encode(focusY, forKey: .focusY)
    }

    public static let horizontalDefault = ClipFocusLayoutSettings(
        placement: .cornerSquares,
        reactionSize: 0.28,
        clipContentMode: .fit
    )

    public static let verticalDefault = ClipFocusLayoutSettings(
        placement: .clipAbove,
        reactionSize: 0.22,
        clipContentMode: .fit
    )

    public func normalized() -> ClipFocusLayoutSettings {
        ClipFocusLayoutSettings(
            placement: placement,
            reactionSize: min(0.40, max(0.10, reactionSize)),
            clipContentMode: clipContentMode,
            focusX: min(1, max(-1, focusX)),
            focusY: min(1, max(-1, focusY))
        )
    }
}

public struct MediaSequence: Identifiable, Codable, Equatable {
    public let id: UUID
    public var title: String
    public var orientationTrack: OrientationTrack
    public var verticalOrientationTrack: OrientationTrack
    public var lanes: [VideoLane]
    public var programDecisions: [ProgramDecisionEvent]
    public var shortClipQueue: [ShortClipCandidate]
    public var transcriptSegments: [TranscriptSegment]
    public var transcriptJobs: [TranscriptJobRecord]
    public var editCorrectionNotes: [EditCorrectionNoteRecord]
    public var editActionLedger: [EditActionLedgerRecord]
    public var publishReceipts: [PublishReceiptRecord]
    public var editPassContext: EditPassContext
    public var branchMetadata: EditBranchMetadata
    public var audioSpineRegistryPath: String
    public var audioSpineCandidates: [AudioSpineCandidate]
    public var selectedAudioSpineCandidateID: String?
    public var audioSpineBranchRenderingLocked: Bool
    public var clipFocusLayout16x9: ClipFocusLayoutSettings
    public var clipFocusLayout9x16: ClipFocusLayoutSettings

    public var duration: Double {
        lanes.map { $0.duration }.max() ?? 0
    }

    public var selectedAudioSpineCandidate: AudioSpineCandidate? {
        guard let selectedAudioSpineCandidateID, !selectedAudioSpineCandidateID.isEmpty else { return nil }
        return audioSpineCandidates.first { $0.id == selectedAudioSpineCandidateID }
    }

    public var selectedFullSourceAudioSpineCandidate: AudioSpineCandidate? {
        guard let candidate = selectedAudioSpineCandidate, candidate.isFullSourceMaster else { return nil }
        return candidate
    }

    public var selectedAudioSpineRequiresHumanListenBeforeBranchRendering: Bool {
        audioSpineBranchRenderingLocked || (selectedAudioSpineCandidate?.requiresHumanListenBeforeBranchRendering ?? false)
    }

    public init(id: UUID = UUID(), title: String, orientationTrack: OrientationTrack = OrientationTrack(), verticalOrientationTrack: OrientationTrack = OrientationTrack(), lanes: [VideoLane] = [], programDecisions: [ProgramDecisionEvent] = [], shortClipQueue: [ShortClipCandidate] = [], transcriptSegments: [TranscriptSegment] = [], transcriptJobs: [TranscriptJobRecord] = [], editCorrectionNotes: [EditCorrectionNoteRecord] = [], editActionLedger: [EditActionLedgerRecord] = [], publishReceipts: [PublishReceiptRecord] = [], editPassContext: EditPassContext = EditPassContext(), branchMetadata: EditBranchMetadata = EditBranchMetadata(), audioSpineRegistryPath: String = "", audioSpineCandidates: [AudioSpineCandidate] = [], selectedAudioSpineCandidateID: String? = nil, audioSpineBranchRenderingLocked: Bool = false, clipFocusLayout16x9: ClipFocusLayoutSettings = .horizontalDefault, clipFocusLayout9x16: ClipFocusLayoutSettings = .verticalDefault) {
        self.id = id
        self.title = title
        self.orientationTrack = orientationTrack
        self.verticalOrientationTrack = verticalOrientationTrack
        self.lanes = lanes
        self.programDecisions = programDecisions
        self.shortClipQueue = shortClipQueue
        self.transcriptSegments = transcriptSegments
        self.transcriptJobs = transcriptJobs
        self.editCorrectionNotes = editCorrectionNotes
        self.editActionLedger = editActionLedger
        self.publishReceipts = publishReceipts
        self.editPassContext = editPassContext
        self.branchMetadata = branchMetadata
        self.audioSpineRegistryPath = audioSpineRegistryPath
        self.audioSpineCandidates = audioSpineCandidates
        self.selectedAudioSpineCandidateID = selectedAudioSpineCandidateID
        self.audioSpineBranchRenderingLocked = audioSpineBranchRenderingLocked
        self.clipFocusLayout16x9 = clipFocusLayout16x9.normalized()
        self.clipFocusLayout9x16 = clipFocusLayout9x16.normalized()
    }

    enum CodingKeys: String, CodingKey {
        case id
        case title
        case orientationTrack
        case verticalOrientationTrack
        case lanes
        case programDecisions
        case shortClipQueue
        case transcriptSegments
        case transcriptJobs
        case editCorrectionNotes
        case editActionLedger
        case publishReceipts
        case editPassContext
        case branchMetadata
        case audioSpineRegistryPath
        case audioSpineCandidates
        case selectedAudioSpineCandidateID
        case audioSpineBranchRenderingLocked
        case clipFocusLayout16x9
        case clipFocusLayout9x16
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decodeIfPresent(UUID.self, forKey: .id) ?? UUID()
        title = try container.decodeIfPresent(String.self, forKey: .title) ?? "Recovered sequence"
        orientationTrack = try container.decodeIfPresent(OrientationTrack.self, forKey: .orientationTrack) ?? OrientationTrack()
        verticalOrientationTrack = try container.decodeIfPresent(OrientationTrack.self, forKey: .verticalOrientationTrack) ?? OrientationTrack()
        lanes = try container.decodeIfPresent([VideoLane].self, forKey: .lanes) ?? []
        programDecisions = try container.decodeIfPresent([ProgramDecisionEvent].self, forKey: .programDecisions) ?? []
        shortClipQueue = try container.decodeIfPresent([ShortClipCandidate].self, forKey: .shortClipQueue) ?? []
        transcriptSegments = try container.decodeIfPresent([TranscriptSegment].self, forKey: .transcriptSegments) ?? []
        transcriptJobs = try container.decodeIfPresent([TranscriptJobRecord].self, forKey: .transcriptJobs) ?? []
        editCorrectionNotes = try container.decodeIfPresent([EditCorrectionNoteRecord].self, forKey: .editCorrectionNotes) ?? []
        editActionLedger = try container.decodeIfPresent([EditActionLedgerRecord].self, forKey: .editActionLedger) ?? []
        publishReceipts = try container.decodeIfPresent([PublishReceiptRecord].self, forKey: .publishReceipts) ?? []
        editPassContext = try container.decodeIfPresent(EditPassContext.self, forKey: .editPassContext) ?? EditPassContext()
        branchMetadata = try container.decodeIfPresent(EditBranchMetadata.self, forKey: .branchMetadata) ?? EditBranchMetadata(branchName: title)
        audioSpineRegistryPath = try container.decodeIfPresent(String.self, forKey: .audioSpineRegistryPath) ?? ""
        audioSpineCandidates = try container.decodeIfPresent([AudioSpineCandidate].self, forKey: .audioSpineCandidates) ?? []
        selectedAudioSpineCandidateID = try container.decodeIfPresent(String.self, forKey: .selectedAudioSpineCandidateID)
        audioSpineBranchRenderingLocked = try container.decodeIfPresent(Bool.self, forKey: .audioSpineBranchRenderingLocked) ?? false
        clipFocusLayout16x9 = (try container.decodeIfPresent(ClipFocusLayoutSettings.self, forKey: .clipFocusLayout16x9) ?? .horizontalDefault).normalized()
        clipFocusLayout9x16 = (try container.decodeIfPresent(ClipFocusLayoutSettings.self, forKey: .clipFocusLayout9x16) ?? .verticalDefault).normalized()
    }

    /// Applies an array of imported VideoTags to a specific lane, replacing existing tags.
    public mutating func importTags(_ newTags: [VideoTag], toLaneWithID laneID: UUID) {
        guard let index = lanes.firstIndex(where: { $0.id == laneID }) else { return }
        lanes[index].tags = newTags
    }

    /// Attaches a normalized audio-spine registry without changing approval,
    /// rendering, upload, publication, or source-media state.
    public mutating func attachAudioSpineRegistry(_ registry: AudioSpineRegistry, registryPath: String = "") {
        audioSpineRegistryPath = registryPath
        audioSpineCandidates = registry.candidates
        selectedAudioSpineCandidateID = registry.selectionPolicy.fullSourceDefault
        audioSpineBranchRenderingLocked = registry.selectionPolicy.branchRenderingLockedUntilHumanListenApproval
    }
}

public struct EditBranchProgramRange: Codable, Equatable, Sendable {
    public var startTime: Double
    public var endTime: Double
    public var reason: String

    public init(startTime: Double, endTime: Double, reason: String = "") {
        self.startTime = startTime
        self.endTime = endTime
        self.reason = reason
    }

    public var duration: Double {
        max(0, endTime - startTime)
    }
}

public struct EditBranchMetadata: Codable, Equatable, Sendable {
    public var branchId: UUID
    public var branchName: String
    public var branchRole: String
    public var parentSequenceId: UUID?
    public var sourceBaselineSequenceId: UUID?
    public var branchStatus: String
    public var branchPurpose: String
    public var createdBy: String
    public var createdAt: Date
    public var updatedAt: Date
    public var programKeepRanges: [EditBranchProgramRange]?
    public var renderManifestPath: String?
    public var renderArtifactPaths: [String]?
    public var renderVersion: String?
    public var renderTarget: String?
    public var renderEditorialTradeoff: String?

    public init(
        branchId: UUID = UUID(),
        branchName: String = "Working edit",
        branchRole: String = "episode-edit",
        parentSequenceId: UUID? = nil,
        sourceBaselineSequenceId: UUID? = nil,
        branchStatus: String = "active",
        branchPurpose: String = "",
        createdBy: String = "Quipsly Studio",
        createdAt: Date = Date(),
        updatedAt: Date = Date(),
        programKeepRanges: [EditBranchProgramRange]? = nil,
        renderManifestPath: String? = nil,
        renderArtifactPaths: [String]? = nil,
        renderVersion: String? = nil,
        renderTarget: String? = nil,
        renderEditorialTradeoff: String? = nil
    ) {
        self.branchId = branchId
        self.branchName = branchName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Working edit" : branchName
        self.branchRole = branchRole.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "episode-edit" : branchRole
        self.parentSequenceId = parentSequenceId
        self.sourceBaselineSequenceId = sourceBaselineSequenceId
        self.branchStatus = branchStatus.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "active" : branchStatus
        self.branchPurpose = branchPurpose
        self.createdBy = createdBy.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Quipsly Studio" : createdBy
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.programKeepRanges = programKeepRanges
        self.renderManifestPath = renderManifestPath
        self.renderArtifactPaths = renderArtifactPaths
        self.renderVersion = renderVersion
        self.renderTarget = renderTarget
        self.renderEditorialTradeoff = renderEditorialTradeoff
    }

    public func renamed(_ name: String, status: String? = nil, purpose: String? = nil, at date: Date = Date()) -> EditBranchMetadata {
        var copy = self
        let cleanName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        if !cleanName.isEmpty {
            copy.branchName = cleanName
        }
        if let status {
            let cleanStatus = status.trimmingCharacters(in: .whitespacesAndNewlines)
            if !cleanStatus.isEmpty {
                copy.branchStatus = cleanStatus
            }
        }
        if let purpose {
            copy.branchPurpose = purpose
        }
        copy.updatedAt = date
        return copy
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
    public var sourceExternalID: String?
    public var sourceTranscriptJobID: String?
    public var speaker: String
    public var startTime: Double
    public var endTime: Double
    public var text: String
    public var providerText: String?
    public var words: [TranscriptWordTiming]
    public var confidence: Double?
    public var reviewStatus: String
    public var createdAt: Date
    public var updatedAt: Date

    public init(
        id: UUID = UUID(),
        sourceAssetId: UUID? = nil,
        sourceExternalID: String? = nil,
        sourceTranscriptJobID: String? = nil,
        speaker: String = "Speaker",
        startTime: Double,
        endTime: Double,
        text: String,
        providerText: String? = nil,
        words: [TranscriptWordTiming] = [],
        confidence: Double? = nil,
        reviewStatus: String = "draft",
        createdAt: Date = Date(),
        updatedAt: Date = Date()
    ) {
        self.id = id
        self.sourceAssetId = sourceAssetId
        self.sourceExternalID = sourceExternalID
        self.sourceTranscriptJobID = sourceTranscriptJobID
        self.speaker = speaker
        self.startTime = max(0, startTime)
        self.endTime = max(max(0, startTime), endTime)
        self.text = text
        self.providerText = providerText
        self.words = words
        self.confidence = confidence
        self.reviewStatus = reviewStatus
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    enum CodingKeys: String, CodingKey {
        case id
        case sourceAssetId
        case sourceExternalID
        case sourceTranscriptJobID
        case speaker
        case startTime
        case endTime
        case text
        case providerText
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
        sourceExternalID = try container.decodeIfPresent(String.self, forKey: .sourceExternalID)
        sourceTranscriptJobID = try container.decodeIfPresent(String.self, forKey: .sourceTranscriptJobID)
        speaker = try container.decodeIfPresent(String.self, forKey: .speaker) ?? "Speaker"
        let decodedStart = try container.decodeIfPresent(Double.self, forKey: .startTime) ?? 0
        let decodedEnd = try container.decodeIfPresent(Double.self, forKey: .endTime) ?? decodedStart
        startTime = max(0, decodedStart)
        endTime = max(startTime, decodedEnd)
        text = try container.decodeIfPresent(String.self, forKey: .text) ?? ""
        providerText = try container.decodeIfPresent(String.self, forKey: .providerText)
        words = try container.decodeIfPresent([TranscriptWordTiming].self, forKey: .words) ?? []
        confidence = try container.decodeIfPresent(Double.self, forKey: .confidence)
        reviewStatus = try container.decodeIfPresent(String.self, forKey: .reviewStatus) ?? "draft"
        createdAt = try container.decodeIfPresent(Date.self, forKey: .createdAt) ?? Date()
        updatedAt = try container.decodeIfPresent(Date.self, forKey: .updatedAt) ?? createdAt
    }
}

public struct TranscriptWordTiming: Identifiable, Codable, Equatable, Sendable {
    public let id: UUID
    public var sourceExternalID: String?
    public var providerWordIndex: Int?
    public var word: String
    public var startTime: Double
    public var endTime: Double
    public var confidence: Double?
    public var source: String

    public init(
        id: UUID = UUID(),
        sourceExternalID: String? = nil,
        providerWordIndex: Int? = nil,
        word: String,
        startTime: Double,
        endTime: Double,
        confidence: Double? = nil,
        source: String = "estimated"
    ) {
        self.id = id
        self.sourceExternalID = sourceExternalID
        self.providerWordIndex = providerWordIndex
        self.word = word
        self.startTime = max(0, startTime)
        self.endTime = max(max(0, startTime), endTime)
        self.confidence = confidence
        self.source = source.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "estimated" : source
    }

    enum CodingKeys: String, CodingKey {
        case id
        case sourceExternalID
        case providerWordIndex
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
            sourceExternalID: try container.decodeIfPresent(String.self, forKey: .sourceExternalID),
            providerWordIndex: try container.decodeIfPresent(Int.self, forKey: .providerWordIndex),
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
    public var sourceExternalID: String?
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
        sourceExternalID: String? = nil,
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
        self.sourceExternalID = sourceExternalID
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
        case sourceExternalID
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
            sourceExternalID: try container.decodeIfPresent(String.self, forKey: .sourceExternalID),
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
    public var reviewEvents: [ShortReviewEventRecord]
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
        reviewEvents: [ShortReviewEventRecord] = [],
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
        self.reviewEvents = reviewEvents
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
        case reviewEvents
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
        reviewEvents = try container.decodeIfPresent([ShortReviewEventRecord].self, forKey: .reviewEvents) ?? []
        createdAt = try container.decodeIfPresent(Date.self, forKey: .createdAt) ?? Date()
        updatedAt = try container.decodeIfPresent(Date.self, forKey: .updatedAt) ?? createdAt
    }
}

public struct ShortReviewEventRecord: Identifiable, Codable, Equatable {
    public let id: UUID
    public var status: String
    public var note: String
    public var actor: String
    public var actorType: String
    public var reviewRead: String
    public var primaryQuestion: String
    public var signals: [String: String]
    public var createdAt: Date

    public init(
        id: UUID = UUID(),
        status: String,
        note: String = "",
        actor: String = "Codex",
        actorType: String = "agent",
        reviewRead: String = "",
        primaryQuestion: String = "",
        signals: [String: String] = [:],
        createdAt: Date = Date()
    ) {
        self.id = id
        self.status = status
        self.note = note
        self.actor = actor
        self.actorType = actorType
        self.reviewRead = reviewRead
        self.primaryQuestion = primaryQuestion
        self.signals = signals
        self.createdAt = createdAt
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
    public var sourceReceiptPath: String?
    public var captureGroupID: String?
    public var episodeSpaceID: String?
    public var ingestKind: String?
    public var alignmentStatus: String?
    public var declaredExists: Bool?
    public var sourceLabel: String?
    public var isPremiereRescue: Bool
    public var ignoreForProduction: Bool?
    public var sourceVideoTrackDuration: Double?
    public var proxyVideoTrackDuration: Double?
    public var proxyDurationValidatedAt: Date?
    public var proxyDurationValidationBasis: String?
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
        sourceReceiptPath: String? = nil,
        captureGroupID: String? = nil,
        episodeSpaceID: String? = nil,
        ingestKind: String? = nil,
        alignmentStatus: String? = nil,
        declaredExists: Bool? = nil,
        sourceLabel: String? = nil,
        isPremiereRescue: Bool = false,
        ignoreForProduction: Bool? = nil,
        sourceVideoTrackDuration: Double? = nil,
        proxyVideoTrackDuration: Double? = nil,
        proxyDurationValidatedAt: Date? = nil,
        proxyDurationValidationBasis: String? = nil,
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
        self.sourceReceiptPath = sourceReceiptPath
        self.captureGroupID = captureGroupID
        self.episodeSpaceID = episodeSpaceID
        self.ingestKind = ingestKind
        self.alignmentStatus = alignmentStatus
        self.declaredExists = declaredExists
        self.sourceLabel = sourceLabel
        self.isPremiereRescue = isPremiereRescue
        self.ignoreForProduction = ignoreForProduction
        self.sourceVideoTrackDuration = sourceVideoTrackDuration
        self.proxyVideoTrackDuration = proxyVideoTrackDuration
        self.proxyDurationValidatedAt = proxyDurationValidatedAt
        self.proxyDurationValidationBasis = proxyDurationValidationBasis
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
        case sourceReceiptPath
        case captureGroupID
        case episodeSpaceID
        case ingestKind
        case alignmentStatus
        case declaredExists
        case sourceLabel
        case isPremiereRescue
        case ignoreForProduction
        case sourceVideoTrackDuration
        case proxyVideoTrackDuration
        case proxyDurationValidatedAt
        case proxyDurationValidationBasis
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
            sourceReceiptPath: try container.decodeIfPresent(String.self, forKey: .sourceReceiptPath),
            captureGroupID: try container.decodeIfPresent(String.self, forKey: .captureGroupID),
            episodeSpaceID: try container.decodeIfPresent(String.self, forKey: .episodeSpaceID),
            ingestKind: try container.decodeIfPresent(String.self, forKey: .ingestKind),
            alignmentStatus: try container.decodeIfPresent(String.self, forKey: .alignmentStatus),
            declaredExists: try container.decodeIfPresent(Bool.self, forKey: .declaredExists),
            sourceLabel: try container.decodeIfPresent(String.self, forKey: .sourceLabel),
            isPremiereRescue: try container.decodeIfPresent(Bool.self, forKey: .isPremiereRescue) ?? false,
            ignoreForProduction: try container.decodeIfPresent(Bool.self, forKey: .ignoreForProduction),
            sourceVideoTrackDuration: try container.decodeIfPresent(Double.self, forKey: .sourceVideoTrackDuration),
            proxyVideoTrackDuration: try container.decodeIfPresent(Double.self, forKey: .proxyVideoTrackDuration),
            proxyDurationValidatedAt: try container.decodeIfPresent(Date.self, forKey: .proxyDurationValidatedAt),
            proxyDurationValidationBasis: try container.decodeIfPresent(String.self, forKey: .proxyDurationValidationBasis),
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

public struct EditDecisionRevision: Codable, Equatable, Sendable, Identifiable {
    public var id: UUID
    public var createdAt: Date
    public var actor: String
    public var actorType: String
    public var action: String
    public var note: String
    public var evidence: [String]
    public var previousStatus: String
    public var nextStatus: String
    public var confidenceBefore: Double?
    public var confidenceAfter: Double?

    public init(
        id: UUID = UUID(),
        createdAt: Date = Date(),
        actor: String = "Codex",
        actorType: String = "agent",
        action: String,
        note: String,
        evidence: [String] = [],
        previousStatus: String = "",
        nextStatus: String = "",
        confidenceBefore: Double? = nil,
        confidenceAfter: Double? = nil
    ) {
        self.id = id
        self.createdAt = createdAt
        self.actor = actor.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Unknown" : actor
        self.actorType = actorType.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "unknown" : actorType
        self.action = action.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "noted" : action
        self.note = note.trimmingCharacters(in: .whitespacesAndNewlines)
        self.evidence = evidence
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        self.previousStatus = previousStatus.trimmingCharacters(in: .whitespacesAndNewlines)
        self.nextStatus = nextStatus.trimmingCharacters(in: .whitespacesAndNewlines)
        self.confidenceBefore = confidenceBefore
        self.confidenceAfter = confidenceAfter
    }

    public var agentPayload: [String: Any] {
        [
            "id": id.uuidString,
            "createdAt": ISO8601DateFormatter().string(from: createdAt),
            "actor": actor,
            "actorType": actorType,
            "action": action,
            "note": note,
            "evidence": evidence,
            "previousStatus": previousStatus,
            "nextStatus": nextStatus,
            "confidenceBefore": confidenceBefore ?? NSNull(),
            "confidenceAfter": confidenceAfter ?? NSNull(),
            "truth": "Structured review provenance. This records why a decision changed; it does not mutate source media."
        ]
    }
}

public struct EditDecisionIntent: Codable, Equatable, Sendable {
    public var cutStyle: String
    public var audioLeadSeconds: Double
    public var audioTailSeconds: Double
    public var coverStrategy: String
    public var reactionCoverLaneId: UUID?
    public var reactionCoverLaneName: String
    public var cadenceMode: String
    public var humanRhythmNote: String
    public var whyThisCutExists: String
    public var tradeoffExplanation: String
    public var confidence: Double
    public var revisionHistory: [String]
    public var revisionLedger: [EditDecisionRevision]
    public var humanAgentNotes: [String]
    public var reviewEvidence: [String]
    public var nextReviewAction: String
    public var risk: String
    public var status: String
    public var createdAt: Date
    public var updatedAt: Date

    public init(
        cutStyle: String = "straight-cut",
        audioLeadSeconds: Double = 0,
        audioTailSeconds: Double = 0,
        coverStrategy: String = "none",
        reactionCoverLaneId: UUID? = nil,
        reactionCoverLaneName: String = "",
        cadenceMode: String = "warm-conversation",
        humanRhythmNote: String = "",
        whyThisCutExists: String = "",
        tradeoffExplanation: String = "",
        confidence: Double = 0,
        revisionHistory: [String] = [],
        revisionLedger: [EditDecisionRevision] = [],
        humanAgentNotes: [String] = [],
        reviewEvidence: [String] = [],
        nextReviewAction: String = "",
        risk: String = "unknown",
        status: String = "suggested",
        createdAt: Date = Date(),
        updatedAt: Date = Date()
    ) {
        self.cutStyle = cutStyle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "straight-cut" : cutStyle
        self.audioLeadSeconds = max(-5, min(5, audioLeadSeconds.isFinite ? audioLeadSeconds : 0))
        self.audioTailSeconds = max(-5, min(5, audioTailSeconds.isFinite ? audioTailSeconds : 0))
        self.coverStrategy = coverStrategy.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "none" : coverStrategy
        self.reactionCoverLaneId = reactionCoverLaneId
        self.reactionCoverLaneName = reactionCoverLaneName
        self.cadenceMode = cadenceMode.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "warm-conversation" : cadenceMode
        self.humanRhythmNote = humanRhythmNote
        self.whyThisCutExists = whyThisCutExists
        self.tradeoffExplanation = tradeoffExplanation
        self.confidence = min(1, max(0, confidence.isFinite ? confidence : 0))
        self.revisionHistory = revisionHistory
        self.revisionLedger = revisionLedger
        self.humanAgentNotes = humanAgentNotes
        self.reviewEvidence = reviewEvidence
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        self.nextReviewAction = nextReviewAction.trimmingCharacters(in: .whitespacesAndNewlines)
        self.risk = risk.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "unknown" : risk
        self.status = status.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "suggested" : status
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    enum CodingKeys: String, CodingKey {
        case cutStyle
        case audioLeadSeconds
        case audioTailSeconds
        case coverStrategy
        case reactionCoverLaneId
        case reactionCoverLaneName
        case cadenceMode
        case humanRhythmNote
        case whyThisCutExists
        case tradeoffExplanation
        case confidence
        case revisionHistory
        case revisionLedger
        case humanAgentNotes
        case reviewEvidence
        case nextReviewAction
        case risk
        case status
        case createdAt
        case updatedAt
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let created = try container.decodeIfPresent(Date.self, forKey: .createdAt) ?? Date()
        self.init(
            cutStyle: try container.decodeIfPresent(String.self, forKey: .cutStyle) ?? "straight-cut",
            audioLeadSeconds: try container.decodeIfPresent(Double.self, forKey: .audioLeadSeconds) ?? 0,
            audioTailSeconds: try container.decodeIfPresent(Double.self, forKey: .audioTailSeconds) ?? 0,
            coverStrategy: try container.decodeIfPresent(String.self, forKey: .coverStrategy) ?? "none",
            reactionCoverLaneId: try container.decodeIfPresent(UUID.self, forKey: .reactionCoverLaneId),
            reactionCoverLaneName: try container.decodeIfPresent(String.self, forKey: .reactionCoverLaneName) ?? "",
            cadenceMode: try container.decodeIfPresent(String.self, forKey: .cadenceMode) ?? "warm-conversation",
            humanRhythmNote: try container.decodeIfPresent(String.self, forKey: .humanRhythmNote) ?? "",
            whyThisCutExists: try container.decodeIfPresent(String.self, forKey: .whyThisCutExists) ?? "",
            tradeoffExplanation: try container.decodeIfPresent(String.self, forKey: .tradeoffExplanation) ?? "",
            confidence: try container.decodeIfPresent(Double.self, forKey: .confidence) ?? 0,
            revisionHistory: try container.decodeIfPresent([String].self, forKey: .revisionHistory) ?? [],
            revisionLedger: try container.decodeIfPresent([EditDecisionRevision].self, forKey: .revisionLedger) ?? [],
            humanAgentNotes: try container.decodeIfPresent([String].self, forKey: .humanAgentNotes) ?? [],
            reviewEvidence: try container.decodeIfPresent([String].self, forKey: .reviewEvidence) ?? [],
            nextReviewAction: try container.decodeIfPresent(String.self, forKey: .nextReviewAction) ?? "",
            risk: try container.decodeIfPresent(String.self, forKey: .risk) ?? "unknown",
            status: try container.decodeIfPresent(String.self, forKey: .status) ?? "suggested",
            createdAt: created,
            updatedAt: try container.decodeIfPresent(Date.self, forKey: .updatedAt) ?? created
        )
    }

    public var agentPayload: [String: Any] {
        let hasSplitEditTiming = abs(audioLeadSeconds) > 0.03 || abs(audioTailSeconds) > 0.03
        let hasCover = coverStrategy.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() != "none"
        let confidenceInterpretation = confidence >= 0.75
            ? "strong-candidate"
            : (confidence >= 0.50 ? "needs-listening-pass" : "low-confidence-review")
        let storedEvidence = reviewEvidence
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        var generatedEvidence: [String] = []
        if !whyThisCutExists.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            generatedEvidence.append("Reason: \(whyThisCutExists)")
        }
        if !tradeoffExplanation.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            generatedEvidence.append("Tradeoff: \(tradeoffExplanation)")
        }
        if hasSplitEditTiming {
            generatedEvidence.append(String(format: "Split edit timing: audio lead %+.2fs, tail %+.2fs.", audioLeadSeconds, audioTailSeconds))
        }
        if hasCover {
            generatedEvidence.append(reactionCoverLaneName.isEmpty
                ? "Cover strategy: \(coverStrategy)."
                : "Cover strategy: \(coverStrategy) using \(reactionCoverLaneName).")
        }
        if confidence < 0.50 {
            generatedEvidence.append("Low confidence: this needs human or agent listen-through before it becomes training-quality evidence.")
        } else if confidence < 0.75 {
            generatedEvidence.append("Medium confidence: review cadence, reaction timing, and jump-cut feel before export.")
        }
        let reviewEvidencePacket = Array((storedEvidence + generatedEvidence).prefix(8))
        let resolvedNextReviewAction: String
        if !nextReviewAction.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            resolvedNextReviewAction = nextReviewAction
        } else if confidence < 0.50 || risk.lowercased().contains("high") {
            resolvedNextReviewAction = "Listen through this boundary, then mark Hold or Refine before using it as training evidence."
        } else if hasSplitEditTiming || hasCover {
            resolvedNextReviewAction = "Review whether the cover or J/L timing feels human, then mark Keep, Refine, or Hold."
        } else {
            resolvedNextReviewAction = "Listen for cadence and visual jumpiness, then mark Keep, Refine, or Hold."
        }
        let normalizedCutStyle = cutStyle.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let normalizedCoverStrategy = coverStrategy.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let recommendedTechnique: String
        let timingIntent: String
        let visualTreatment: String
        let audioTreatment: String
        let reviewQuestion: String
        let doNotAutomate: String
        if normalizedCutStyle.contains("j-cut") || audioLeadSeconds > 0.03 {
            recommendedTechnique = "j-cut"
            timingIntent = "Let the next speaker's audio lead the visual cut by a small amount."
            visualTreatment = "Keep the visual change at the decision boundary unless the reaction reads better slightly later."
            audioTreatment = String(format: "Try next-speaker audio lead around %.2fs; keep it subtle.", max(0.12, abs(audioLeadSeconds)))
            reviewQuestion = "Does the reply gain momentum, or does it feel like the next speaker is stepping on the previous thought?"
            doNotAutomate = "Do not increase the lead just to remove silence; protect interruption timing and emotional beats."
        } else if normalizedCutStyle.contains("l-cut") || audioTailSeconds > 0.03 {
            recommendedTechnique = "l-cut"
            timingIntent = "Let the previous speaker's audio tail continue under the next visual source."
            visualTreatment = hasCover ? "Use the cover/reaction only while it clarifies the moment." : "Try a reaction or alternate source while the prior thought lands."
            audioTreatment = String(format: "Try previous-speaker audio tail around %.2fs; review by ear.", max(0.18, abs(audioTailSeconds)))
            reviewQuestion = "Does the audio tail preserve warmth and thought, or does it hide a timing problem too neatly?"
            doNotAutomate = "Do not smooth every boundary; some straight cuts and pauses should stay honest."
        } else if normalizedCoverStrategy.contains("reaction") {
            recommendedTechnique = "reaction-cover"
            timingIntent = "Hold the conversation timing while covering a visual jump with a reaction or listening shot."
            visualTreatment = reactionCoverLaneName.isEmpty ? "Find the best listening/reaction source at this sequence time." : "Try \(reactionCoverLaneName) as the cover source."
            audioTreatment = "Keep source audio continuous unless a tiny J/L offset makes the exchange feel more natural."
            reviewQuestion = "Does the reaction add human context, or is it only hiding a cut?"
            doNotAutomate = "Do not use a reaction cover if it distracts from the speaker or feels emotionally false."
        } else if normalizedCoverStrategy.contains("b-roll") || normalizedCoverStrategy.contains("clip") || normalizedCutStyle.contains("b-roll") {
            recommendedTechnique = "b-roll-or-clip-cover"
            timingIntent = "Use a relevant clip or B-roll span as reversible visual cover while preserving the dialogue spine."
            visualTreatment = reactionCoverLaneName.isEmpty ? "Choose a source clip that clarifies the sentence being spoken." : "Try \(reactionCoverLaneName) only if it supports the spoken point."
            audioTreatment = "Keep the podcast dialogue as the spine unless the inserted clip's audio is explicitly part of the story."
            reviewQuestion = "Does this insert teach, clarify, or delight, or is it just busy wallpaper?"
            doNotAutomate = "Do not insert clips simply because a cut is awkward; the clip must earn its place."
        } else if normalizedCutStyle.contains("pause") || normalizedCutStyle.contains("over-tightened") || normalizedCutStyle.contains("cadence") {
            recommendedTechnique = "preserve-or-gently-shape-air"
            timingIntent = "Classify the pause before deleting it."
            visualTreatment = "Leave the visual source stable unless a reaction or reframe helps the pause read as intentional."
            audioTreatment = "Preserve breath, laugh, thinking, comic timing, or emotional reset when it carries meaning."
            reviewQuestion = "Is this dead air, or is it doing social, comic, or emotional work?"
            doNotAutomate = "Do not treat silence as waste until transcript, listening, and reaction context agree."
        } else {
            recommendedTechnique = "straight-cut-review"
            timingIntent = "Start with a straight cut and only add split timing if the boundary feels stiff."
            visualTreatment = "Use the selected source decision as-is unless the monitor wall reveals a better reaction."
            audioTreatment = "Keep audio aligned unless a small lead/tail improves human flow."
            reviewQuestion = "Does the boundary disappear, or does it need a tiny timing or cover adjustment?"
            doNotAutomate = "Do not decorate clean cuts; invisible is often better than clever."
        }
        let splitEditRecommendation: [String: Any] = [
            "recommendedTechnique": recommendedTechnique,
            "timingIntent": timingIntent,
            "audioLeadSeconds": audioLeadSeconds,
            "audioTailSeconds": audioTailSeconds,
            "visualTreatment": visualTreatment,
            "audioTreatment": audioTreatment,
            "coverStrategy": coverStrategy,
            "reactionCoverLaneName": reactionCoverLaneName,
            "reviewQuestion": reviewQuestion,
            "doNotAutomate": doNotAutomate,
            "safeToTryAsMetadata": confidence >= 0.45 && !risk.lowercased().contains("blocked"),
            "truth": "This is a reversible edit-intent recommendation over whole source lanes. It is not an instruction to cut source media."
        ]
        let normalizedCadenceMode = cadenceMode.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        var preserveAirTriggers: [String] = []
        if normalizedCutStyle.contains("pause")
            || normalizedCutStyle.contains("cadence")
            || normalizedCutStyle.contains("over-tightened")
            || normalizedCoverStrategy.contains("pause")
            || normalizedCoverStrategy.contains("skip") {
            preserveAirTriggers.append("This decision touches silence, pause, cadence, or a quiet gap.")
        }
        if hasSplitEditTiming {
            preserveAirTriggers.append("This decision changes audio/visual timing, so proof-listen for stepped-on speech or lost breath.")
        }
        if hasCover {
            preserveAirTriggers.append("This decision uses cover strategy; confirm the cover adds meaning instead of hiding an awkward seam.")
        }
        if normalizedCadenceMode.contains("warm") || normalizedCadenceMode.contains("documentary") || normalizedCadenceMode.contains("thoughtful") {
            preserveAirTriggers.append("Cadence mode favors human warmth; speed is not the only success metric.")
        }
        if preserveAirTriggers.isEmpty {
            preserveAirTriggers.append("No explicit preserve-air trigger is attached yet. Listen before treating this as training-quality cleanup.")
        }
        let preserveAirProtocol: [String: Any] = [
            "title": "Preserve air before tightening",
            "stance": "Useful silence, breath, laughter, hesitation, awkward warmth, and reaction timing are content until review proves otherwise.",
            "triggers": preserveAirTriggers,
            "listenFor": [
                "breath before a reply",
                "laugh timing or joke landing",
                "thinking pause that makes the next line feel intentional",
                "emotional reset",
                "listener reaction that carries meaning",
                "jump-cut harshness that needs an honest cover rather than more shaving"
            ],
            "safeAction": "Compare Play Through and Play Edit at normal speed, then mark Keep, Refine, Hold, or needs-listen with a note.",
            "doNot": [
                "Do not compress silence only because it is visible in a gap.",
                "Do not use reaction or B-roll cover if it feels emotionally false.",
                "Do not let a clean-looking waveform override human cadence.",
                "Do not turn this into training evidence until the tradeoff is written down."
            ],
            "metadataOnly": true,
            "truth": "This protocol guides reversible decision metadata. It never deletes, trims, or mutates source media."
        ]

        return [
            "cutStyle": cutStyle,
            "audioLeadSeconds": audioLeadSeconds,
            "audioTailSeconds": audioTailSeconds,
            "coverStrategy": coverStrategy,
            "reactionCoverLaneId": reactionCoverLaneId?.uuidString ?? "",
            "reactionCoverLaneName": reactionCoverLaneName,
            "cadenceMode": cadenceMode,
            "humanRhythmNote": humanRhythmNote,
            "whyThisCutExists": whyThisCutExists,
            "tradeoffExplanation": tradeoffExplanation,
            "confidence": confidence,
            "revisionHistory": revisionHistory,
            "revisionLedger": revisionLedger.map(\.agentPayload),
            "reviewProvenance": [
                "structuredRevisionCount": revisionLedger.count,
                "legacyRevisionCount": revisionHistory.count,
                "latestStructuredRevision": revisionLedger.last?.agentPayload ?? [:],
                "truth": "Use revisionLedger for machine-readable review history. revisionHistory remains a legacy human-readable trail."
            ],
            "humanAgentNotes": humanAgentNotes,
            "splitEditRecommendation": splitEditRecommendation,
            "preserveAirProtocol": preserveAirProtocol,
            "reviewEvidence": reviewEvidencePacket.isEmpty
                ? ["No concrete review evidence yet. Listen before treating this cut as approved or training-quality."]
                : reviewEvidencePacket,
            "nextReviewAction": resolvedNextReviewAction,
            "risk": risk,
            "status": status,
            "cutCraftReview": [
                "humanRhythm": humanRhythmNote.isEmpty
                    ? "No cadence note yet. Listen for breath, laugh, hesitation, and whether the pause is doing useful work."
                    : humanRhythmNote,
                "splitEditTiming": [
                    "hasSplitEditTiming": hasSplitEditTiming,
                    "audioLeadSeconds": audioLeadSeconds,
                    "audioTailSeconds": audioTailSeconds,
                    "reviewInstruction": hasSplitEditTiming
                        ? "Review for J/L-cut smoothness without making the exchange feel fake."
                        : "If the visual switch feels stiff, consider a small audio lead or tail instead of chopping harder."
                ],
                "coverStrategyReview": [
                    "hasCover": hasCover,
                    "coverStrategy": coverStrategy,
                    "reactionCoverLaneName": reactionCoverLaneName,
                    "reviewInstruction": hasCover
                        ? "Check whether the cover clarifies the moment or becomes visual noise."
                        : "If this is a same-speaker jump, look for reaction, reframing, b-roll, or let the jump stand if it feels honest."
                ],
                "confidenceInterpretation": confidenceInterpretation,
                "truth": "This is edit-review metadata over whole source lanes. It does not approve, publish, export, or mutate source media."
            ],
            "createdAt": ISO8601DateFormatter().string(from: createdAt),
            "updatedAt": ISO8601DateFormatter().string(from: updatedAt)
        ]
    }
}

public struct VideoTag: Identifiable, Codable, Equatable {
    public let id: UUID
    public var type: TagType
    public var startTime: Double
    public var duration: Double
    public var editIntent: EditDecisionIntent?

    public init(
        id: UUID = UUID(),
        type: TagType = .highlight,
        startTime: Double,
        duration: Double,
        editIntent: EditDecisionIntent? = nil
    ) {
        self.id = id
        self.type = type
        self.startTime = startTime
        self.duration = duration
        self.editIntent = editIntent
    }

    enum CodingKeys: String, CodingKey {
        case id
        case type
        case startTime
        case duration
        case editIntent
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.init(
            id: try container.decodeIfPresent(UUID.self, forKey: .id) ?? UUID(),
            type: try container.decodeIfPresent(TagType.self, forKey: .type) ?? .highlight,
            startTime: try container.decodeIfPresent(Double.self, forKey: .startTime) ?? 0,
            duration: try container.decodeIfPresent(Double.self, forKey: .duration) ?? 0,
            editIntent: try container.decodeIfPresent(EditDecisionIntent.self, forKey: .editIntent)
        )
    }
}
