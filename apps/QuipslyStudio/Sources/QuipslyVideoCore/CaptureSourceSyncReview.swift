import Foundation

public enum CaptureSourceSyncReviewAction: String, Codable, Sendable {
    case approved
    case undone
}

public enum CaptureSourceSyncReviewerKind: String, Codable, Sendable {
    case person
    case softwareAgent = "software-agent"

    public var displayName: String {
        switch self {
        case .person: "Person"
        case .softwareAgent: "Software agent"
        }
    }
}

public enum CaptureSourceSyncDecisionBasis: String, Codable, Sendable {
    case audiovisualInspection = "audiovisual-inspection"
    case measuredCorrelation = "measured-correlation"
    case hybrid

    public var displayName: String {
        switch self {
        case .audiovisualInspection: "Audiovisual inspection"
        case .measuredCorrelation: "Measured correlation"
        case .hybrid: "Measured and inspected"
        }
    }
}

public struct CaptureSourceSyncEvidence: Codable, Equatable, Sendable {
    public let laneID: UUID
    public let sourceVideoID: UUID
    public let sourceAssetID: String
    public let sourceReceiptPath: String
    public let sourcePath: String
    public let fingerprint: String?
    public let role: String

    public init(
        laneID: UUID,
        sourceVideoID: UUID,
        sourceAssetID: String,
        sourceReceiptPath: String,
        sourcePath: String,
        fingerprint: String?,
        role: String
    ) {
        self.laneID = laneID
        self.sourceVideoID = sourceVideoID
        self.sourceAssetID = sourceAssetID
        self.sourceReceiptPath = sourceReceiptPath
        self.sourcePath = sourcePath
        self.fingerprint = fingerprint
        self.role = role
    }
}

public struct CaptureSourceSyncReviewChecks: Codable, Equatable, Sendable {
    public let waveformOrVisibleCueCompared: Bool
    public let laterDriftCompared: Bool
    public let assembledPlaybackAuditioned: Bool
    /// Kept in the wire format so version-one receipts remain readable.
    public let humanPlacementApproved: Bool
    /// Version-two receipts name the actual reviewer rather than assuming it
    /// was a person. Missing means the legacy human field is authoritative.
    public let reviewerPlacementApproved: Bool?

    public init(
        waveformOrVisibleCueCompared: Bool,
        laterDriftCompared: Bool,
        assembledPlaybackAuditioned: Bool,
        humanPlacementApproved: Bool
    ) {
        self.waveformOrVisibleCueCompared = waveformOrVisibleCueCompared
        self.laterDriftCompared = laterDriftCompared
        self.assembledPlaybackAuditioned = assembledPlaybackAuditioned
        self.humanPlacementApproved = humanPlacementApproved
        self.reviewerPlacementApproved = nil
    }

    public init(
        waveformOrVisibleCueCompared: Bool,
        laterDriftCompared: Bool,
        assembledPlaybackAuditioned: Bool,
        reviewerPlacementApproved: Bool
    ) {
        self.waveformOrVisibleCueCompared = waveformOrVisibleCueCompared
        self.laterDriftCompared = laterDriftCompared
        self.assembledPlaybackAuditioned = assembledPlaybackAuditioned
        humanPlacementApproved = false
        self.reviewerPlacementApproved = reviewerPlacementApproved
    }

    public var placementApproved: Bool {
        reviewerPlacementApproved ?? humanPlacementApproved
    }

    public var allConfirmed: Bool {
        waveformOrVisibleCueCompared
            && laterDriftCompared
            && assembledPlaybackAuditioned
            && placementApproved
    }
}

public struct CaptureSourceSyncReviewReceipt: Codable, Equatable, Sendable {
    public let protocolVersion: Int
    public let operationID: UUID
    public let action: CaptureSourceSyncReviewAction
    public let approvedReviewID: UUID
    public let captureGroupID: UUID
    public let episodeSpaceID: String
    public let reviewerActorID: String
    public let reviewerLabel: String
    public let reviewerKind: CaptureSourceSyncReviewerKind?
    public let decisionBasis: CaptureSourceSyncDecisionBasis?
    public let delegationScope: String?
    public let reviewerToolVersion: String?
    public let evidenceSummary: String?
    public let supersedesReviewID: UUID?
    public let baseline: CaptureSourceSyncEvidence
    public let target: CaptureSourceSyncEvidence
    public let previousTargetOffsetSeconds: Double
    public let reviewedTargetOffsetSeconds: Double
    public let previousAlignmentStatus: String
    public let resultingAlignmentStatus: String
    public let cueTimelineSeconds: Double
    public let laterTimelineSeconds: Double
    public let residualDriftMilliseconds: Double
    public let observedPartsPerMillion: Double
    public let checks: CaptureSourceSyncReviewChecks
    public let notes: String?
    public let reviewedAt: Date
    public let sourceBytesMutated: Bool
    public let sampleAccurateClaimed: Bool
    public let reversible: Bool
    public let truth: String

    public init(
        operationID: UUID,
        action: CaptureSourceSyncReviewAction,
        approvedReviewID: UUID,
        captureGroupID: UUID,
        episodeSpaceID: String,
        reviewerActorID: String,
        reviewerLabel: String,
        reviewerKind: CaptureSourceSyncReviewerKind = .person,
        decisionBasis: CaptureSourceSyncDecisionBasis = .audiovisualInspection,
        delegationScope: String? = nil,
        reviewerToolVersion: String? = nil,
        evidenceSummary: String? = nil,
        supersedesReviewID: UUID? = nil,
        baseline: CaptureSourceSyncEvidence,
        target: CaptureSourceSyncEvidence,
        previousTargetOffsetSeconds: Double,
        reviewedTargetOffsetSeconds: Double,
        previousAlignmentStatus: String,
        resultingAlignmentStatus: String,
        cueTimelineSeconds: Double,
        laterTimelineSeconds: Double,
        residualDriftMilliseconds: Double,
        checks: CaptureSourceSyncReviewChecks,
        notes: String?,
        reviewedAt: Date
    ) {
        protocolVersion = 2
        self.operationID = operationID
        self.action = action
        self.approvedReviewID = approvedReviewID
        self.captureGroupID = captureGroupID
        self.episodeSpaceID = episodeSpaceID
        self.reviewerActorID = reviewerActorID
        self.reviewerLabel = reviewerLabel
        self.reviewerKind = reviewerKind
        self.decisionBasis = decisionBasis
        self.delegationScope = Self.cleaned(delegationScope)
        self.reviewerToolVersion = Self.cleaned(reviewerToolVersion)
        self.evidenceSummary = Self.cleaned(evidenceSummary)
        self.supersedesReviewID = supersedesReviewID
        self.baseline = baseline
        self.target = target
        self.previousTargetOffsetSeconds = previousTargetOffsetSeconds
        self.reviewedTargetOffsetSeconds = reviewedTargetOffsetSeconds
        self.previousAlignmentStatus = previousAlignmentStatus
        self.resultingAlignmentStatus = resultingAlignmentStatus
        self.cueTimelineSeconds = cueTimelineSeconds
        self.laterTimelineSeconds = laterTimelineSeconds
        self.residualDriftMilliseconds = residualDriftMilliseconds
        self.observedPartsPerMillion = residualDriftMilliseconds * 1_000
            / max(laterTimelineSeconds - cueTimelineSeconds, 0.001)
        self.checks = checks
        let cleanNotes = notes?.trimmingCharacters(in: .whitespacesAndNewlines)
        self.notes = cleanNotes?.isEmpty == false ? cleanNotes : nil
        self.reviewedAt = reviewedAt
        sourceBytesMutated = false
        sampleAccurateClaimed = false
        reversible = true
        switch action {
        case .approved:
            switch reviewerKind {
            case .person:
                truth = "A verified person compared a real cue, checked later drift, auditioned assembled playback, and approved this reversible source placement. Original source bytes were not changed, and sample accuracy is not claimed."
            case .softwareAgent:
                truth = "An authorized software agent qualified this reversible source placement from disclosed cue, drift, and assembled-playback evidence. This is not labeled as human approval. Original source bytes were not changed, and sample accuracy is not claimed."
            }
        case .undone:
            truth = "An identified reviewer undid one exact reviewed source placement. Quipsly restored the prior offset and alignment state without changing original source bytes or erasing earlier receipts."
        }
    }

    public var effectiveReviewerKind: CaptureSourceSyncReviewerKind {
        reviewerKind ?? .person
    }

    private static func cleaned(_ value: String?) -> String? {
        let cleaned = value?.trimmingCharacters(in: .whitespacesAndNewlines)
        return cleaned?.isEmpty == false ? cleaned : nil
    }
}

public struct CaptureSourceSyncApprovalInput: Equatable, Sendable {
    public let operationID: UUID
    public let reviewerActorID: String
    public let reviewerLabel: String
    public let reviewerKind: CaptureSourceSyncReviewerKind
    public let decisionBasis: CaptureSourceSyncDecisionBasis
    public let delegationScope: String?
    public let reviewerToolVersion: String?
    public let evidenceSummary: String?
    public let supersedesReviewID: UUID?
    public let baselineLaneID: UUID
    public let targetLaneID: UUID
    public let expectedTargetOffsetSeconds: Double
    public let reviewedTargetOffsetSeconds: Double
    public let cueTimelineSeconds: Double
    public let laterTimelineSeconds: Double
    public let residualDriftMilliseconds: Double
    public let checks: CaptureSourceSyncReviewChecks
    public let notes: String?
    public let reviewedAt: Date

    public init(
        operationID: UUID,
        reviewerActorID: String,
        reviewerLabel: String,
        reviewerKind: CaptureSourceSyncReviewerKind = .person,
        decisionBasis: CaptureSourceSyncDecisionBasis = .audiovisualInspection,
        delegationScope: String? = nil,
        reviewerToolVersion: String? = nil,
        evidenceSummary: String? = nil,
        supersedesReviewID: UUID? = nil,
        baselineLaneID: UUID,
        targetLaneID: UUID,
        expectedTargetOffsetSeconds: Double,
        reviewedTargetOffsetSeconds: Double,
        cueTimelineSeconds: Double,
        laterTimelineSeconds: Double,
        residualDriftMilliseconds: Double,
        checks: CaptureSourceSyncReviewChecks,
        notes: String?,
        reviewedAt: Date = Date()
    ) {
        self.operationID = operationID
        self.reviewerActorID = reviewerActorID
        self.reviewerLabel = reviewerLabel
        self.reviewerKind = reviewerKind
        self.decisionBasis = decisionBasis
        self.delegationScope = delegationScope
        self.reviewerToolVersion = reviewerToolVersion
        self.evidenceSummary = evidenceSummary
        self.supersedesReviewID = supersedesReviewID
        self.baselineLaneID = baselineLaneID
        self.targetLaneID = targetLaneID
        self.expectedTargetOffsetSeconds = expectedTargetOffsetSeconds
        self.reviewedTargetOffsetSeconds = reviewedTargetOffsetSeconds
        self.cueTimelineSeconds = cueTimelineSeconds
        self.laterTimelineSeconds = laterTimelineSeconds
        self.residualDriftMilliseconds = residualDriftMilliseconds
        self.checks = checks
        self.notes = notes
        self.reviewedAt = reviewedAt
    }
}

public struct CaptureSourceSyncUndoInput: Equatable, Sendable {
    public let operationID: UUID
    public let approvedReviewID: UUID
    public let reviewerActorID: String
    public let reviewerLabel: String
    public let reviewerKind: CaptureSourceSyncReviewerKind
    public let delegationScope: String?
    public let reviewerToolVersion: String?
    public let targetLaneID: UUID
    public let expectedTargetOffsetSeconds: Double
    public let reviewedAt: Date

    public init(
        operationID: UUID,
        approvedReviewID: UUID,
        reviewerActorID: String,
        reviewerLabel: String,
        reviewerKind: CaptureSourceSyncReviewerKind = .person,
        delegationScope: String? = nil,
        reviewerToolVersion: String? = nil,
        targetLaneID: UUID,
        expectedTargetOffsetSeconds: Double,
        reviewedAt: Date = Date()
    ) {
        self.operationID = operationID
        self.approvedReviewID = approvedReviewID
        self.reviewerActorID = reviewerActorID
        self.reviewerLabel = reviewerLabel
        self.reviewerKind = reviewerKind
        self.delegationScope = delegationScope
        self.reviewerToolVersion = reviewerToolVersion
        self.targetLaneID = targetLaneID
        self.expectedTargetOffsetSeconds = expectedTargetOffsetSeconds
        self.reviewedAt = reviewedAt
    }
}

public enum CaptureSourceSyncReviewError: Error, Equatable, LocalizedError {
    case invalidReviewer
    case invalidTiming
    case reviewChecksIncomplete
    case laneMissing
    case sameSource
    case sourceEvidenceIncomplete
    case captureGroupMismatch
    case episodeSpaceMismatch
    case staleOffset
    case activeReviewMustBeUndone
    case invalidAgentEvidence
    case operationIdentityConflict
    case approvedReviewMissing

    public var errorDescription: String? {
        switch self {
        case .invalidReviewer:
            "A verified reviewer identity is required before approving synchronization."
        case .invalidTiming:
            "Choose a finite source offset, compare a later point after the first cue, and record bounded residual drift."
        case .reviewChecksIncomplete:
            "Compare a real cue, check later drift, audition assembled playback, and explicitly approve before saving."
        case .laneMissing:
            "The reviewed source lane is no longer present in this editor sequence."
        case .sameSource:
            "Choose two different immutable sources for synchronization review."
        case .sourceEvidenceIncomplete:
            "Both sources need stable asset, receipt, and file identities before synchronization can be approved."
        case .captureGroupMismatch:
            "Both sources must belong to the same exact capture group."
        case .episodeSpaceMismatch:
            "Both sources must belong to the same exact Episode Space."
        case .staleOffset:
            "The target source moved after this review opened. Refresh and compare the current placement."
        case .activeReviewMustBeUndone:
            "Undo the current placement or explicitly supersede its exact receipt before activating a replacement."
        case .invalidAgentEvidence:
            "Agent qualification requires a delegation scope, tool identity, decision basis, and a substantive evidence summary."
        case .operationIdentityConflict:
            "That operation identity was already used for different synchronization evidence."
        case .approvedReviewMissing:
            "The reviewed placement to undo is no longer the active placement for this source."
        }
    }
}

public enum CaptureSourceSyncReviewService {
    public static let approvedAlignmentStatus = "reviewed-alignment"
    public static let agentQualifiedAlignmentStatus =
        "agent-qualified-alignment"

    public static func activeApproval(
        for lane: VideoLane
    ) -> CaptureSourceSyncReviewReceipt? {
        guard let history = lane.metadata?.syncReviewHistory else {
            return nil
        }
        var approvals: [UUID: CaptureSourceSyncReviewReceipt] = [:]
        for receipt in history {
            switch receipt.action {
            case .approved:
                if let superseded = receipt.supersedesReviewID {
                    approvals.removeValue(forKey: superseded)
                }
                approvals[receipt.approvedReviewID] = receipt
            case .undone:
                approvals.removeValue(forKey: receipt.approvedReviewID)
                if let restoredID = receipt.supersedesReviewID,
                   let restored = history.first(where: {
                       $0.action == .approved
                           && $0.approvedReviewID == restoredID
                   }) {
                    approvals[restoredID] = restored
                }
            }
        }
        return approvals.values.sorted { $0.reviewedAt < $1.reviewedAt }.last
    }

    public static func approve(
        _ input: CaptureSourceSyncApprovalInput,
        in sequence: MediaSequence
    ) throws -> MediaSequence {
        if let replay = operationReceipt(input.operationID, in: sequence) {
            guard approvalReplayMatches(replay, input: input) else {
                throw CaptureSourceSyncReviewError.operationIdentityConflict
            }
            return sequence
        }
        let reviewerActorID = clean(input.reviewerActorID)
        let reviewerLabel = clean(input.reviewerLabel)
        guard !reviewerActorID.isEmpty, !reviewerLabel.isEmpty else {
            throw CaptureSourceSyncReviewError.invalidReviewer
        }
        let delegationScope = nonempty(input.delegationScope)
        let reviewerToolVersion = nonempty(input.reviewerToolVersion)
        let evidenceSummary = boundedEvidence(input.evidenceSummary)
        if input.reviewerKind == .softwareAgent {
            guard delegationScope != nil,
                  reviewerToolVersion != nil,
                  evidenceSummary?.count ?? 0 >= 24 else {
                throw CaptureSourceSyncReviewError.invalidAgentEvidence
            }
        }
        guard input.baselineLaneID != input.targetLaneID else {
            throw CaptureSourceSyncReviewError.sameSource
        }
        guard input.expectedTargetOffsetSeconds.isFinite,
              input.reviewedTargetOffsetSeconds.isFinite,
              input.reviewedTargetOffsetSeconds >= -86_400,
              input.reviewedTargetOffsetSeconds <= 86_400,
              input.cueTimelineSeconds.isFinite,
              input.cueTimelineSeconds >= 0,
              input.laterTimelineSeconds.isFinite,
              input.laterTimelineSeconds > input.cueTimelineSeconds,
              input.laterTimelineSeconds <= 86_400,
              input.residualDriftMilliseconds.isFinite,
              abs(input.residualDriftMilliseconds) <= 60_000 else {
            throw CaptureSourceSyncReviewError.invalidTiming
        }
        guard input.checks.allConfirmed else {
            throw CaptureSourceSyncReviewError.reviewChecksIncomplete
        }

        var result = sequence
        guard let baselineIndex = result.lanes.firstIndex(where: {
                  $0.id == input.baselineLaneID
              }),
              let targetIndex = result.lanes.firstIndex(where: {
                  $0.id == input.targetLaneID
              }) else {
            throw CaptureSourceSyncReviewError.laneMissing
        }
        let baseline = result.lanes[baselineIndex]
        let target = result.lanes[targetIndex]
        let active = activeApproval(for: target)
        if let active {
            guard input.supersedesReviewID == active.approvedReviewID else {
                throw CaptureSourceSyncReviewError.activeReviewMustBeUndone
            }
        } else if input.supersedesReviewID != nil {
            throw CaptureSourceSyncReviewError.approvedReviewMissing
        }
        guard let targetSource = target.sourceVideo,
              offsetsMatch(
                  targetSource.offset,
                  input.expectedTargetOffsetSeconds
              ) else {
            throw CaptureSourceSyncReviewError.staleOffset
        }
        let evidence = try evidencePair(
            baseline: baseline,
            target: target
        )
        let previousStatus = clean(target.metadata?.alignmentStatus)
        let resultingStatus = input.reviewerKind == .person
            ? approvedAlignmentStatus
            : agentQualifiedAlignmentStatus
        let receipt = CaptureSourceSyncReviewReceipt(
            operationID: input.operationID,
            action: .approved,
            approvedReviewID: input.operationID,
            captureGroupID: evidence.captureGroupID,
            episodeSpaceID: evidence.episodeSpaceID,
            reviewerActorID: reviewerActorID,
            reviewerLabel: reviewerLabel,
            reviewerKind: input.reviewerKind,
            decisionBasis: input.decisionBasis,
            delegationScope: delegationScope,
            reviewerToolVersion: reviewerToolVersion,
            evidenceSummary: evidenceSummary,
            supersedesReviewID: input.supersedesReviewID,
            baseline: evidence.baseline,
            target: evidence.target,
            previousTargetOffsetSeconds: targetSource.offset,
            reviewedTargetOffsetSeconds: input.reviewedTargetOffsetSeconds,
            previousAlignmentStatus: previousStatus,
            resultingAlignmentStatus: resultingStatus,
            cueTimelineSeconds: input.cueTimelineSeconds,
            laterTimelineSeconds: input.laterTimelineSeconds,
            residualDriftMilliseconds: input.residualDriftMilliseconds,
            checks: input.checks,
            notes: boundedNotes(input.notes),
            reviewedAt: input.reviewedAt
        )
        result.lanes[targetIndex].sourceVideo?.offset =
            input.reviewedTargetOffsetSeconds
        if result.lanes[targetIndex].metadata == nil {
            result.lanes[targetIndex].metadata = VideoLaneMetadata()
        }
        result.lanes[targetIndex].metadata?.alignmentStatus =
            resultingStatus
        result.lanes[targetIndex].metadata?.syncReviewHistory.append(receipt)
        return result
    }

    public static func undo(
        _ input: CaptureSourceSyncUndoInput,
        in sequence: MediaSequence
    ) throws -> MediaSequence {
        if let replay = operationReceipt(input.operationID, in: sequence) {
            guard replay.action == .undone,
                  replay.approvedReviewID == input.approvedReviewID,
                  replay.target.laneID == input.targetLaneID,
                  replay.reviewerActorID == clean(input.reviewerActorID),
                  replay.reviewerLabel == clean(input.reviewerLabel),
                  replay.effectiveReviewerKind == input.reviewerKind,
                  replay.delegationScope == nonempty(input.delegationScope),
                  replay.reviewerToolVersion == nonempty(
                      input.reviewerToolVersion
                  ),
                  offsetsMatch(
                      replay.previousTargetOffsetSeconds,
                      input.expectedTargetOffsetSeconds
                  ) else {
                throw CaptureSourceSyncReviewError.operationIdentityConflict
            }
            return sequence
        }
        let reviewerActorID = clean(input.reviewerActorID)
        let reviewerLabel = clean(input.reviewerLabel)
        guard !reviewerActorID.isEmpty, !reviewerLabel.isEmpty else {
            throw CaptureSourceSyncReviewError.invalidReviewer
        }
        if input.reviewerKind == .softwareAgent {
            guard nonempty(input.delegationScope) != nil,
                  nonempty(input.reviewerToolVersion) != nil else {
                throw CaptureSourceSyncReviewError.invalidAgentEvidence
            }
        }
        var result = sequence
        guard let targetIndex = result.lanes.firstIndex(where: {
                  $0.id == input.targetLaneID
              }),
              let targetSource = result.lanes[targetIndex].sourceVideo else {
            throw CaptureSourceSyncReviewError.laneMissing
        }
        guard offsetsMatch(
            targetSource.offset,
            input.expectedTargetOffsetSeconds
        ) else {
            throw CaptureSourceSyncReviewError.staleOffset
        }
        guard let approval = activeApproval(for: result.lanes[targetIndex]),
              approval.approvedReviewID == input.approvedReviewID else {
            throw CaptureSourceSyncReviewError.approvedReviewMissing
        }
        let undoReceipt = CaptureSourceSyncReviewReceipt(
            operationID: input.operationID,
            action: .undone,
            approvedReviewID: approval.approvedReviewID,
            captureGroupID: approval.captureGroupID,
            episodeSpaceID: approval.episodeSpaceID,
            reviewerActorID: reviewerActorID,
            reviewerLabel: reviewerLabel,
            reviewerKind: input.reviewerKind,
            decisionBasis: approval.decisionBasis
                ?? .audiovisualInspection,
            delegationScope: nonempty(input.delegationScope),
            reviewerToolVersion: nonempty(input.reviewerToolVersion),
            evidenceSummary: "Undid exact active review \(approval.approvedReviewID.uuidString.lowercased()) and restored its recorded prior placement.",
            supersedesReviewID: approval.supersedesReviewID,
            baseline: approval.baseline,
            target: approval.target,
            previousTargetOffsetSeconds: approval.reviewedTargetOffsetSeconds,
            reviewedTargetOffsetSeconds: approval.previousTargetOffsetSeconds,
            previousAlignmentStatus: approval.resultingAlignmentStatus,
            resultingAlignmentStatus: approval.previousAlignmentStatus,
            cueTimelineSeconds: approval.cueTimelineSeconds,
            laterTimelineSeconds: approval.laterTimelineSeconds,
            residualDriftMilliseconds: approval.residualDriftMilliseconds,
            checks: approval.checks,
            notes: "Undid reviewed placement \(approval.approvedReviewID.uuidString.lowercased()).",
            reviewedAt: input.reviewedAt
        )
        result.lanes[targetIndex].sourceVideo?.offset =
            approval.previousTargetOffsetSeconds
        result.lanes[targetIndex].metadata?.alignmentStatus =
            approval.previousAlignmentStatus
        result.lanes[targetIndex].metadata?.syncReviewHistory.append(
            undoReceipt
        )
        return result
    }

    private static func operationReceipt(
        _ operationID: UUID,
        in sequence: MediaSequence
    ) -> CaptureSourceSyncReviewReceipt? {
        sequence.lanes
            .compactMap(\.metadata)
            .flatMap(\.syncReviewHistory)
            .first { $0.operationID == operationID }
    }

    private static func approvalReplayMatches(
        _ receipt: CaptureSourceSyncReviewReceipt,
        input: CaptureSourceSyncApprovalInput
    ) -> Bool {
        receipt.action == .approved
            && receipt.baseline.laneID == input.baselineLaneID
            && receipt.target.laneID == input.targetLaneID
            && offsetsMatch(
                receipt.previousTargetOffsetSeconds,
                input.expectedTargetOffsetSeconds
            )
            && offsetsMatch(
                receipt.reviewedTargetOffsetSeconds,
                input.reviewedTargetOffsetSeconds
            )
            && offsetsMatch(
                receipt.cueTimelineSeconds,
                input.cueTimelineSeconds
            )
            && offsetsMatch(
                receipt.laterTimelineSeconds,
                input.laterTimelineSeconds
            )
            && offsetsMatch(
                receipt.residualDriftMilliseconds,
                input.residualDriftMilliseconds
            )
            && receipt.reviewerActorID == clean(input.reviewerActorID)
            && receipt.reviewerLabel == clean(input.reviewerLabel)
            && receipt.effectiveReviewerKind == input.reviewerKind
            && receipt.decisionBasis == input.decisionBasis
            && receipt.delegationScope == nonempty(input.delegationScope)
            && receipt.reviewerToolVersion == nonempty(
                input.reviewerToolVersion
            )
            && receipt.evidenceSummary == boundedEvidence(
                input.evidenceSummary
            )
            && receipt.supersedesReviewID == input.supersedesReviewID
            && receipt.checks == input.checks
            && receipt.notes == boundedNotes(input.notes)
    }

    private static func evidencePair(
        baseline: VideoLane,
        target: VideoLane
    ) throws -> (
        baseline: CaptureSourceSyncEvidence,
        target: CaptureSourceSyncEvidence,
        captureGroupID: UUID,
        episodeSpaceID: String
    ) {
        guard let baselineMetadata = baseline.metadata,
              let targetMetadata = target.metadata,
              let baselineGroupText = nonempty(
                  baselineMetadata.captureGroupID
              ),
              let targetGroupText = nonempty(
                  targetMetadata.captureGroupID
              ),
              let baselineGroupID = UUID(uuidString: baselineGroupText),
              let targetGroupID = UUID(uuidString: targetGroupText) else {
            throw CaptureSourceSyncReviewError.sourceEvidenceIncomplete
        }
        guard baselineGroupID == targetGroupID else {
            throw CaptureSourceSyncReviewError.captureGroupMismatch
        }
        guard let baselineEpisode = nonempty(
                  baselineMetadata.episodeSpaceID
              ),
              let targetEpisode = nonempty(
                  targetMetadata.episodeSpaceID
              ) else {
            throw CaptureSourceSyncReviewError.sourceEvidenceIncomplete
        }
        guard baselineEpisode == targetEpisode else {
            throw CaptureSourceSyncReviewError.episodeSpaceMismatch
        }
        return (
            try sourceEvidence(for: baseline),
            try sourceEvidence(for: target),
            baselineGroupID,
            baselineEpisode
        )
    }

    private static func sourceEvidence(
        for lane: VideoLane
    ) throws -> CaptureSourceSyncEvidence {
        guard let source = lane.sourceVideo,
              let metadata = lane.metadata,
              let sourceAssetID = nonempty(metadata.sourceAssetId),
              let sourceReceiptPath = nonempty(
                  metadata.sourceReceiptPath
              ),
              let sourcePath = nonempty(
                  metadata.originalPath
                    ?? metadata.sourcePath
                    ?? source.mediaURL.path
              ) else {
            throw CaptureSourceSyncReviewError.sourceEvidenceIncomplete
        }
        return CaptureSourceSyncEvidence(
            laneID: lane.id,
            sourceVideoID: source.id,
            sourceAssetID: sourceAssetID,
            sourceReceiptPath: sourceReceiptPath,
            sourcePath: sourcePath,
            fingerprint: nonempty(metadata.assetFingerprint),
            role: clean(metadata.role).isEmpty
                ? "unknown"
                : clean(metadata.role)
        )
    }

    private static func clean(_ value: String?) -> String {
        value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    }

    private static func nonempty(_ value: String?) -> String? {
        let cleaned = clean(value)
        return cleaned.isEmpty ? nil : cleaned
    }

    private static func boundedNotes(_ value: String?) -> String? {
        let cleaned = clean(value)
        guard !cleaned.isEmpty else { return nil }
        return String(cleaned.prefix(2_000))
    }

    private static func boundedEvidence(_ value: String?) -> String? {
        let cleaned = clean(value)
        guard !cleaned.isEmpty else { return nil }
        return String(cleaned.prefix(4_000))
    }

    private static func offsetsMatch(
        _ left: Double,
        _ right: Double
    ) -> Bool {
        left.isFinite
            && right.isFinite
            && abs(left - right) <= 0.000_001
    }
}
