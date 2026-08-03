import Foundation

public enum CaptureSourceSyncReviewAction: String, Codable, Sendable {
    case approved
    case undone
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
    public let humanPlacementApproved: Bool

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
    }

    public var allConfirmed: Bool {
        waveformOrVisibleCueCompared
            && laterDriftCompared
            && assembledPlaybackAuditioned
            && humanPlacementApproved
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
        protocolVersion = 1
        self.operationID = operationID
        self.action = action
        self.approvedReviewID = approvedReviewID
        self.captureGroupID = captureGroupID
        self.episodeSpaceID = episodeSpaceID
        self.reviewerActorID = reviewerActorID
        self.reviewerLabel = reviewerLabel
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
            truth = "An authenticated human compared a real cue, checked later drift, auditioned assembled playback, and approved this reversible source placement. Original source bytes were not changed, and sample accuracy is not claimed."
        case .undone:
            truth = "An authenticated human undid one exact reviewed source placement. Quipsly restored the prior offset and alignment state without changing original source bytes or erasing the approval receipt."
        }
    }
}

public struct CaptureSourceSyncApprovalInput: Equatable, Sendable {
    public let operationID: UUID
    public let reviewerActorID: String
    public let reviewerLabel: String
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
    public let targetLaneID: UUID
    public let expectedTargetOffsetSeconds: Double
    public let reviewedAt: Date

    public init(
        operationID: UUID,
        approvedReviewID: UUID,
        reviewerActorID: String,
        reviewerLabel: String,
        targetLaneID: UUID,
        expectedTargetOffsetSeconds: Double,
        reviewedAt: Date = Date()
    ) {
        self.operationID = operationID
        self.approvedReviewID = approvedReviewID
        self.reviewerActorID = reviewerActorID
        self.reviewerLabel = reviewerLabel
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
            "Undo the current reviewed placement before approving a replacement."
        case .operationIdentityConflict:
            "That operation identity was already used for different synchronization evidence."
        case .approvedReviewMissing:
            "The reviewed placement to undo is no longer the active placement for this source."
        }
    }
}

public enum CaptureSourceSyncReviewService {
    public static let approvedAlignmentStatus = "reviewed-alignment"

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
                approvals[receipt.approvedReviewID] = receipt
            case .undone:
                approvals.removeValue(forKey: receipt.approvedReviewID)
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
        guard activeApproval(for: target) == nil else {
            throw CaptureSourceSyncReviewError.activeReviewMustBeUndone
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
        let receipt = CaptureSourceSyncReviewReceipt(
            operationID: input.operationID,
            action: .approved,
            approvedReviewID: input.operationID,
            captureGroupID: evidence.captureGroupID,
            episodeSpaceID: evidence.episodeSpaceID,
            reviewerActorID: reviewerActorID,
            reviewerLabel: reviewerLabel,
            baseline: evidence.baseline,
            target: evidence.target,
            previousTargetOffsetSeconds: targetSource.offset,
            reviewedTargetOffsetSeconds: input.reviewedTargetOffsetSeconds,
            previousAlignmentStatus: previousStatus,
            resultingAlignmentStatus: approvedAlignmentStatus,
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
            approvedAlignmentStatus
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

    private static func offsetsMatch(
        _ left: Double,
        _ right: Double
    ) -> Bool {
        left.isFinite
            && right.isFinite
            && abs(left - right) <= 0.000_001
    }
}
