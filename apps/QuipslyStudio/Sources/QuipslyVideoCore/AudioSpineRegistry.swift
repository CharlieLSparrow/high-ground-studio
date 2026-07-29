import Foundation

public struct AudioSpineRegistry: Codable, Equatable, Sendable {
    public var schema: String
    public var generatedAt: String
    public var episodeSlug: String
    public var baselineDir: String
    public var readyDir: String
    public var candidates: [AudioSpineCandidate]
    public var selectionPolicy: AudioSpineSelectionPolicy

    public init(
        schema: String,
        generatedAt: String,
        episodeSlug: String,
        baselineDir: String,
        readyDir: String,
        candidates: [AudioSpineCandidate],
        selectionPolicy: AudioSpineSelectionPolicy
    ) {
        self.schema = schema
        self.generatedAt = generatedAt
        self.episodeSlug = episodeSlug
        self.baselineDir = baselineDir
        self.readyDir = readyDir
        self.candidates = candidates
        self.selectionPolicy = selectionPolicy
    }

    public static func load(from url: URL, decoder: JSONDecoder = JSONDecoder()) throws -> AudioSpineRegistry {
        let data = try Data(contentsOf: url)
        return try decoder.decode(AudioSpineRegistry.self, from: data)
    }

    public var defaultFullSourceCandidate: AudioSpineCandidate? {
        candidate(id: selectionPolicy.fullSourceDefault)
    }

    public var defaultDeadlineUploadCandidate: AudioSpineCandidate? {
        candidate(id: selectionPolicy.deadlineUploadDefault)
    }

    public func candidate(id: String?) -> AudioSpineCandidate? {
        guard let id, !id.isEmpty else { return nil }
        return candidates.first { $0.id == id }
    }
}

public struct AudioSpineSelectionPolicy: Codable, Equatable, Sendable {
    public var fullSourceDefault: String?
    public var deadlineUploadDefault: String?
    public var selectionMustBeExplicit: Bool
    public var branchRenderingLockedUntilHumanListenApproval: Bool

    public init(
        fullSourceDefault: String? = nil,
        deadlineUploadDefault: String? = nil,
        selectionMustBeExplicit: Bool = true,
        branchRenderingLockedUntilHumanListenApproval: Bool = true
    ) {
        self.fullSourceDefault = fullSourceDefault
        self.deadlineUploadDefault = deadlineUploadDefault
        self.selectionMustBeExplicit = selectionMustBeExplicit
        self.branchRenderingLockedUntilHumanListenApproval = branchRenderingLockedUntilHumanListenApproval
    }
}

public struct AudioSpineCandidate: Codable, Equatable, Identifiable, Sendable {
    public var id: String
    public var label: String
    public var episodeSlug: String
    public var kind: AudioSpineCandidateKind
    public var scope: AudioSpineCandidateScope
    public var status: String
    public var sourceBaselineId: String?
    public var sourceBaselineVersion: String?
    public var selectedProfile: String?
    public var selectedProfileIntent: String?
    public var timelineMapping: AudioSpineTimelineMapping
    public var artifacts: [String: AudioSpineArtifact?]
    public var sourceAwareStemSet: AudioSpineStemSet?
    public var reports: [String: String?]
    public var safeFor: [String]
    public var notSafeFor: [String]
    public var notes: String

    public var isFullSourceMaster: Bool {
        kind == .fullSourceMaster
    }

    public var isBranchRemaster: Bool {
        kind == .branchRemaster
    }

    public var sourceAwareStemRoles: [AudioSpineStemRole] {
        sourceAwareStemSet?.roles ?? []
    }

    public var isSourceAwareEditable: Bool {
        isFullSourceMaster
            && sourceAwareStemRoles.contains { $0.roleId == "charlie" }
            && sourceAwareStemRoles.contains { $0.roleId == "homer" }
            && sourceAwareStemRoles.contains { $0.roleId == "clip-source" }
            && (sourceAwareStemSet?.readyStemCount ?? 0) >= 3
    }

    public var requiresHumanListenBeforeBranchRendering: Bool {
        status.contains("human-listen") || notSafeFor.contains("publication-without-human-listen-approval")
    }
}

public enum AudioSpineCandidateKind: String, Codable, Equatable, Sendable {
    case fullSourceMaster
    case branchRemaster
    case unknown

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = (try? container.decode(String.self)) ?? ""
        self = AudioSpineCandidateKind(rawValue: raw) ?? .unknown
    }
}

public enum AudioSpineCandidateScope: String, Codable, Equatable, Sendable {
    case fullSyncSourceLayer = "full-sync-source-layer"
    case renderedFinalEditBranch = "rendered-final-edit-branch"
    case unknown

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = (try? container.decode(String.self)) ?? ""
        self = AudioSpineCandidateScope(rawValue: raw) ?? .unknown
    }
}

public struct AudioSpineTimelineMapping: Codable, Equatable, Sendable {
    public var clock: String
    public var timelineStartSeconds: Double
    public var sourceOffsetSeconds: Double
    public var durationPolicy: String
}

public struct AudioSpineStemSet: Codable, Equatable, Sendable {
    public var status: String?
    public var manifestPath: String?
    public var editorAudioTruthRule: String?
    public var sequenceClock: AudioSpineSequenceClock?
    public var requiredStemCount: Int?
    public var resolvedStemCount: Int?
    public var readyStemCount: Int?
    public var missingRequiredRoles: [String]
    public var roles: [AudioSpineStemRole]
    public var mixRecipe: AudioSpineMixRecipe?
    public var safety: [String: Bool]?
}

public struct AudioSpineStemRole: Codable, Equatable, Identifiable, Sendable {
    public var id: String { roleId }
    public var roleId: String
    public var speaker: String?
    public var label: String?
    public var purpose: String?
    public var status: String?
    public var sequenceClockPolicy: String?
    public var doNotDo: String?
    public var alignedSourceStem: AudioSpineArtifact?
    public var selectedRefinedStem: AudioSpineArtifact?
    public var alignedSummary: AudioSpineActivitySummary?
    public var contributionSummary: AudioSpineActivitySummary?
}

public struct AudioSpineMixRecipe: Codable, Equatable, Sendable {
    public var canonicalEditorTruth: String?
    public var recipe: String?
    public var masterM4a: AudioSpineArtifact?
    public var masterWav: AudioSpineArtifact?
}

public struct AudioSpineSequenceClock: Codable, Equatable, Sendable {
    public var clock: String?
    public var expectedDurationSeconds: Double?
    public var rule: String?
    public var startsAtSeconds: Double?
}

public struct AudioSpineActivitySummary: Codable, Equatable, Sendable {
    public var activePercent: Double?
    public var activeSeconds: Double?
    public var activeWindowCount: Int?
    public var meanDbfs: Double?
    public var medianActiveDbfs: Double?
    public var peakDbfs: Double?
    public var thresholdDbfs: Double?
    public var windowCount: Int?
}

public struct AudioSpineArtifact: Codable, Equatable, Sendable {
    public var exists: Bool
    public var path: String
    public var durationSeconds: Double?
    public var sizeBytes: Int?
    public var codec: String?
    public var sampleRate: FlexibleString?
    public var channels: Int?
    public var streams: [AudioSpineStreamInfo]?
}

public struct FlexibleString: Codable, Equatable, Sendable, CustomStringConvertible {
    public var value: String
    public var description: String { value }

    public init(_ value: String = "") {
        self.value = value
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let string = try? container.decode(String.self) {
            value = string
        } else if let int = try? container.decode(Int.self) {
            value = String(int)
        } else if let double = try? container.decode(Double.self) {
            value = String(double)
        } else {
            value = ""
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(value)
    }
}

public struct AudioSpineStreamInfo: Codable, Equatable, Sendable {
    public var index: Int?
    public var codecType: String?
    public var codecName: String?
    public var width: Int?
    public var height: Int?
    public var sampleRate: String?
    public var channels: Int?

    enum CodingKeys: String, CodingKey {
        case index
        case codecType = "codec_type"
        case codecName = "codec_name"
        case width
        case height
        case sampleRate = "sample_rate"
        case channels
    }
}
