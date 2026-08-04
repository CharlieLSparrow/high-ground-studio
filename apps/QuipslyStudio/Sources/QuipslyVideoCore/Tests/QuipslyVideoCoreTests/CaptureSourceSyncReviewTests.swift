import XCTest
@testable import QuipslyVideoCore

final class CaptureSourceSyncReviewTests: XCTestCase {
    private let captureGroupID = UUID(
        uuidString: "43c53e60-8d6f-466f-aed7-62ced70b110c"
    )!
    private let baselineLaneID = UUID(
        uuidString: "857f0a40-0342-42ae-90cc-61f9e9e097c7"
    )!
    private let targetLaneID = UUID(
        uuidString: "3455b54d-924c-4d14-9094-ec05f3d7f74a"
    )!

    func testSequenceDurationIncludesLateSourceOffset() {
        let sequence = makeSequence(targetOffset: 4.25)

        XCTAssertEqual(sequence.duration, 14.25, accuracy: 0.000_001)
    }

    func testSequenceDurationAccountsForSourceThatBeginsBeforeEpisodeZero() {
        var sequence = makeSequence(targetOffset: 0)
        sequence.lanes[0].sourceVideo?.offset = -2
        sequence.lanes[0].sourceVideo?.duration = 15
        sequence.lanes[1].sourceVideo?.duration = 10

        XCTAssertEqual(sequence.duration, 13, accuracy: 0.000_001)
    }

    func testApprovalIsAppendOnlyIdempotentAndReversible() throws {
        let operationID = UUID()
        let input = approvalInput(
            operationID: operationID,
            expectedOffset: 0.070_643_75,
            reviewedOffset: 0.082
        )
        let original = makeSequence(targetOffset: 0.070_643_75)

        let approved = try CaptureSourceSyncReviewService.approve(
            input,
            in: original
        )
        let replayed = try CaptureSourceSyncReviewService.approve(
            input,
            in: approved
        )

        XCTAssertEqual(approved, replayed)
        let target = try XCTUnwrap(
            approved.lanes.first { $0.id == targetLaneID }
        )
        XCTAssertEqual(
            try XCTUnwrap(target.sourceVideo).offset,
            0.082,
            accuracy: 0.000_001
        )
        XCTAssertEqual(
            target.metadata?.alignmentStatus,
            CaptureSourceSyncReviewService.approvedAlignmentStatus
        )
        XCTAssertEqual(target.metadata?.syncReviewHistory.count, 1)
        let receipt = try XCTUnwrap(
            CaptureSourceSyncReviewService.activeApproval(for: target)
        )
        XCTAssertEqual(receipt.operationID, operationID)
        XCTAssertEqual(receipt.captureGroupID, captureGroupID)
        XCTAssertEqual(receipt.sourceBytesMutated, false)
        XCTAssertEqual(receipt.sampleAccurateClaimed, false)
        XCTAssertEqual(receipt.reversible, true)

        let undone = try CaptureSourceSyncReviewService.undo(
            CaptureSourceSyncUndoInput(
                operationID: UUID(),
                approvedReviewID: operationID,
                reviewerActorID: "qa-actor",
                reviewerLabel: "Quipsly QA",
                targetLaneID: targetLaneID,
                expectedTargetOffsetSeconds: 0.082,
                reviewedAt: Date(timeIntervalSince1970: 200)
            ),
            in: approved
        )
        let restored = try XCTUnwrap(
            undone.lanes.first { $0.id == targetLaneID }
        )
        XCTAssertEqual(
            try XCTUnwrap(restored.sourceVideo).offset,
            0.070_643_75,
            accuracy: 0.000_001
        )
        XCTAssertEqual(
            restored.metadata?.alignmentStatus,
            "capture-clock-proposed"
        )
        XCTAssertEqual(restored.metadata?.syncReviewHistory.count, 2)
        XCTAssertNil(
            CaptureSourceSyncReviewService.activeApproval(for: restored)
        )
    }

    func testApprovalRejectsIncompleteHumanChecksAndWritesNothing() {
        let original = makeSequence(targetOffset: 0.070_643_75)
        let input = CaptureSourceSyncApprovalInput(
            operationID: UUID(),
            reviewerActorID: "qa-actor",
            reviewerLabel: "Quipsly QA",
            baselineLaneID: baselineLaneID,
            targetLaneID: targetLaneID,
            expectedTargetOffsetSeconds: 0.070_643_75,
            reviewedTargetOffsetSeconds: 0.082,
            cueTimelineSeconds: 1,
            laterTimelineSeconds: 8,
            residualDriftMilliseconds: 4,
            checks: CaptureSourceSyncReviewChecks(
                waveformOrVisibleCueCompared: true,
                laterDriftCompared: true,
                assembledPlaybackAuditioned: false,
                humanPlacementApproved: true
            ),
            notes: nil
        )

        XCTAssertThrowsError(
            try CaptureSourceSyncReviewService.approve(input, in: original)
        ) { error in
            XCTAssertEqual(
                error as? CaptureSourceSyncReviewError,
                .reviewChecksIncomplete
            )
        }
        XCTAssertEqual(
            original.lanes.first { $0.id == targetLaneID }?
                .metadata?.syncReviewHistory,
            []
        )
    }

    func testApprovalRejectsStaleOffsetAndChangedReplayIntent() throws {
        let operationID = UUID()
        let original = makeSequence(targetOffset: 0.070_643_75)
        let approved = try CaptureSourceSyncReviewService.approve(
            approvalInput(
                operationID: operationID,
                expectedOffset: 0.070_643_75,
                reviewedOffset: 0.082
            ),
            in: original
        )

        XCTAssertThrowsError(
            try CaptureSourceSyncReviewService.approve(
                approvalInput(
                    operationID: operationID,
                    expectedOffset: 0.070_643_75,
                    reviewedOffset: 0.09
                ),
                in: approved
            )
        ) { error in
            XCTAssertEqual(
                error as? CaptureSourceSyncReviewError,
                .operationIdentityConflict
            )
        }

        XCTAssertThrowsError(
            try CaptureSourceSyncReviewService.approve(
                approvalInput(
                    operationID: UUID(),
                    expectedOffset: 0.08,
                    reviewedOffset: 0.09
                ),
                in: original
            )
        ) { error in
            XCTAssertEqual(
                error as? CaptureSourceSyncReviewError,
                .staleOffset
            )
        }
    }

    func testApprovalAllowsSourceToBeginBeforeEpisodeZero() throws {
        let approved = try CaptureSourceSyncReviewService.approve(
            approvalInput(
                operationID: UUID(),
                expectedOffset: -0.07,
                reviewedOffset: -0.082
            ),
            in: makeSequence(targetOffset: -0.07)
        )

        XCTAssertEqual(
            try XCTUnwrap(
                approved.lanes.first { $0.id == targetLaneID }?.sourceVideo
            ).offset,
            -0.082,
            accuracy: 0.000_001
        )
    }

    func testUndoRejectsChangedReplayIdentity() throws {
        let approvedReviewID = UUID()
        let approved = try CaptureSourceSyncReviewService.approve(
            approvalInput(
                operationID: approvedReviewID,
                expectedOffset: 0.070_643_75,
                reviewedOffset: 0.082
            ),
            in: makeSequence(targetOffset: 0.070_643_75)
        )
        let undoOperationID = UUID()
        let undo = CaptureSourceSyncUndoInput(
            operationID: undoOperationID,
            approvedReviewID: approvedReviewID,
            reviewerActorID: "qa-actor",
            reviewerLabel: "Quipsly QA",
            targetLaneID: targetLaneID,
            expectedTargetOffsetSeconds: 0.082,
            reviewedAt: Date(timeIntervalSince1970: 200)
        )
        let undone = try CaptureSourceSyncReviewService.undo(
            undo,
            in: approved
        )

        XCTAssertThrowsError(
            try CaptureSourceSyncReviewService.undo(
                CaptureSourceSyncUndoInput(
                    operationID: undoOperationID,
                    approvedReviewID: approvedReviewID,
                    reviewerActorID: "different-actor",
                    reviewerLabel: "Quipsly QA",
                    targetLaneID: targetLaneID,
                    expectedTargetOffsetSeconds: 0.082,
                    reviewedAt: Date(timeIntervalSince1970: 200)
                ),
                in: undone
            )
        ) { error in
            XCTAssertEqual(
                error as? CaptureSourceSyncReviewError,
                .operationIdentityConflict
            )
        }
    }

    func testAuthorizedAgentCanQualifyReversibleAlignmentWithEvidence() throws {
        let approved = try CaptureSourceSyncReviewService.approve(
            agentApprovalInput(
                operationID: UUID(),
                expectedOffset: 0.070_643_75,
                reviewedOffset: 0.082
            ),
            in: makeSequence(targetOffset: 0.070_643_75)
        )
        let target = try XCTUnwrap(
            approved.lanes.first { $0.id == targetLaneID }
        )
        let receipt = try XCTUnwrap(
            CaptureSourceSyncReviewService.activeApproval(for: target)
        )

        XCTAssertEqual(
            target.metadata?.alignmentStatus,
            CaptureSourceSyncReviewService.agentQualifiedAlignmentStatus
        )
        XCTAssertEqual(receipt.effectiveReviewerKind, .softwareAgent)
        XCTAssertEqual(receipt.decisionBasis, .hybrid)
        XCTAssertEqual(receipt.delegationScope, "reversible-media-alignment")
        XCTAssertEqual(receipt.reviewerToolVersion, "Codex GPT-5")
        XCTAssertTrue(receipt.checks.placementApproved)
        XCTAssertFalse(receipt.checks.humanPlacementApproved)
        XCTAssertTrue(receipt.truth.contains("not labeled as human approval"))
    }

    func testVersionOnePersonReceiptStillDecodesAsPersonReviewed() throws {
        let approved = try CaptureSourceSyncReviewService.approve(
            approvalInput(
                operationID: UUID(),
                expectedOffset: 0.070_643_75,
                reviewedOffset: 0.082
            ),
            in: makeSequence(targetOffset: 0.070_643_75)
        )
        let target = try XCTUnwrap(
            approved.lanes.first { $0.id == targetLaneID }
        )
        let receipt = try XCTUnwrap(
            CaptureSourceSyncReviewService.activeApproval(for: target)
        )
        let encoded = try JSONEncoder().encode(receipt)
        var object = try XCTUnwrap(
            JSONSerialization.jsonObject(with: encoded) as? [String: Any]
        )
        object["protocolVersion"] = 1
        object.removeValue(forKey: "reviewerKind")
        object.removeValue(forKey: "decisionBasis")
        object.removeValue(forKey: "delegationScope")
        object.removeValue(forKey: "reviewerToolVersion")
        object.removeValue(forKey: "evidenceSummary")
        object.removeValue(forKey: "supersedesReviewID")
        var checks = try XCTUnwrap(object["checks"] as? [String: Any])
        checks.removeValue(forKey: "reviewerPlacementApproved")
        object["checks"] = checks

        let legacyData = try JSONSerialization.data(withJSONObject: object)
        let decoded = try JSONDecoder().decode(
            CaptureSourceSyncReviewReceipt.self,
            from: legacyData
        )

        XCTAssertEqual(decoded.protocolVersion, 1)
        XCTAssertEqual(decoded.effectiveReviewerKind, .person)
        XCTAssertEqual(decoded.decisionBasis, nil)
        XCTAssertTrue(decoded.checks.placementApproved)
    }

    func testAgentQualificationRejectsThinOrAnonymousEvidence() {
        let input = CaptureSourceSyncApprovalInput(
            operationID: UUID(),
            reviewerActorID: "software-agent:codex",
            reviewerLabel: "Codex",
            reviewerKind: .softwareAgent,
            decisionBasis: .audiovisualInspection,
            delegationScope: "reversible-media-alignment",
            reviewerToolVersion: "Codex GPT-5",
            evidenceSummary: "Looks fine.",
            baselineLaneID: baselineLaneID,
            targetLaneID: targetLaneID,
            expectedTargetOffsetSeconds: 0.070_643_75,
            reviewedTargetOffsetSeconds: 0.082,
            cueTimelineSeconds: 1,
            laterTimelineSeconds: 8,
            residualDriftMilliseconds: 4,
            checks: CaptureSourceSyncReviewChecks(
                waveformOrVisibleCueCompared: true,
                laterDriftCompared: true,
                assembledPlaybackAuditioned: true,
                reviewerPlacementApproved: true
            ),
            notes: nil
        )

        XCTAssertThrowsError(
            try CaptureSourceSyncReviewService.approve(
                input,
                in: makeSequence(targetOffset: 0.070_643_75)
            )
        ) { error in
            XCTAssertEqual(
                error as? CaptureSourceSyncReviewError,
                .invalidAgentEvidence
            )
        }
    }

    func testPersonCanSupersedeAgentAndUndoRestoresAgentReview() throws {
        let agentReviewID = UUID()
        let agentApproved = try CaptureSourceSyncReviewService.approve(
            agentApprovalInput(
                operationID: agentReviewID,
                expectedOffset: 0.070_643_75,
                reviewedOffset: 0.082
            ),
            in: makeSequence(targetOffset: 0.070_643_75)
        )
        let personReviewID = UUID()
        let personApproved = try CaptureSourceSyncReviewService.approve(
            CaptureSourceSyncApprovalInput(
                operationID: personReviewID,
                reviewerActorID: "charlie@example.test",
                reviewerLabel: "Charlie",
                supersedesReviewID: agentReviewID,
                baselineLaneID: baselineLaneID,
                targetLaneID: targetLaneID,
                expectedTargetOffsetSeconds: 0.082,
                reviewedTargetOffsetSeconds: 0.084,
                cueTimelineSeconds: 1,
                laterTimelineSeconds: 8,
                residualDriftMilliseconds: 2,
                checks: CaptureSourceSyncReviewChecks(
                    waveformOrVisibleCueCompared: true,
                    laterDriftCompared: true,
                    assembledPlaybackAuditioned: true,
                    reviewerPlacementApproved: true
                ),
                notes: "Confirmed lip movement and the closing phrase."
            ),
            in: agentApproved
        )
        let personTarget = try XCTUnwrap(
            personApproved.lanes.first { $0.id == targetLaneID }
        )
        XCTAssertEqual(
            CaptureSourceSyncReviewService.activeApproval(for: personTarget)?
                .approvedReviewID,
            personReviewID
        )
        XCTAssertEqual(personTarget.metadata?.syncReviewHistory.count, 2)

        let restored = try CaptureSourceSyncReviewService.undo(
            CaptureSourceSyncUndoInput(
                operationID: UUID(),
                approvedReviewID: personReviewID,
                reviewerActorID: "charlie@example.test",
                reviewerLabel: "Charlie",
                targetLaneID: targetLaneID,
                expectedTargetOffsetSeconds: 0.084
            ),
            in: personApproved
        )
        let restoredTarget = try XCTUnwrap(
            restored.lanes.first { $0.id == targetLaneID }
        )
        XCTAssertEqual(
            try XCTUnwrap(restoredTarget.sourceVideo).offset,
            0.082,
            accuracy: 0.000_001
        )
        XCTAssertEqual(
            restoredTarget.metadata?.alignmentStatus,
            CaptureSourceSyncReviewService.agentQualifiedAlignmentStatus
        )
        XCTAssertEqual(
            CaptureSourceSyncReviewService.activeApproval(for: restoredTarget)?
                .approvedReviewID,
            agentReviewID
        )
        XCTAssertEqual(restoredTarget.metadata?.syncReviewHistory.count, 3)
    }

    func testAgentCanIdempotentlyUndoItsExactQualifiedAlignment() throws {
        let approvedReviewID = UUID()
        let approved = try CaptureSourceSyncReviewService.approve(
            agentApprovalInput(
                operationID: approvedReviewID,
                expectedOffset: 0.070_643_75,
                reviewedOffset: 0.082
            ),
            in: makeSequence(targetOffset: 0.070_643_75)
        )
        let undo = CaptureSourceSyncUndoInput(
            operationID: UUID(),
            approvedReviewID: approvedReviewID,
            reviewerActorID: "software-agent:codex",
            reviewerLabel: "Codex",
            reviewerKind: .softwareAgent,
            delegationScope: "reversible-media-alignment",
            reviewerToolVersion: "Codex GPT-5",
            targetLaneID: targetLaneID,
            expectedTargetOffsetSeconds: 0.082
        )

        let undone = try CaptureSourceSyncReviewService.undo(
            undo,
            in: approved
        )
        let replayed = try CaptureSourceSyncReviewService.undo(
            undo,
            in: undone
        )

        XCTAssertEqual(undone, replayed)
        let target = try XCTUnwrap(
            undone.lanes.first { $0.id == targetLaneID }
        )
        XCTAssertEqual(
            try XCTUnwrap(target.sourceVideo).offset,
            0.070_643_75,
            accuracy: 0.000_001
        )
        XCTAssertNil(
            CaptureSourceSyncReviewService.activeApproval(for: target)
        )
        let receipt = try XCTUnwrap(
            target.metadata?.syncReviewHistory.last
        )
        XCTAssertEqual(receipt.action, .undone)
        XCTAssertEqual(receipt.effectiveReviewerKind, .softwareAgent)
        XCTAssertEqual(
            receipt.delegationScope,
            "reversible-media-alignment"
        )
        XCTAssertEqual(target.metadata?.syncReviewHistory.count, 2)
    }

    func testApprovalRejectsCrossGroupAndIncompleteEvidence() {
        var crossGroup = makeSequence(targetOffset: 0.070_643_75)
        crossGroup.lanes[1].metadata?.captureGroupID = UUID()
            .uuidString.lowercased()

        XCTAssertThrowsError(
            try CaptureSourceSyncReviewService.approve(
                approvalInput(
                    operationID: UUID(),
                    expectedOffset: 0.070_643_75,
                    reviewedOffset: 0.082
                ),
                in: crossGroup
            )
        ) { error in
            XCTAssertEqual(
                error as? CaptureSourceSyncReviewError,
                .captureGroupMismatch
            )
        }

        var incomplete = makeSequence(targetOffset: 0.070_643_75)
        incomplete.lanes[1].metadata?.sourceReceiptPath = nil
        XCTAssertThrowsError(
            try CaptureSourceSyncReviewService.approve(
                approvalInput(
                    operationID: UUID(),
                    expectedOffset: 0.070_643_75,
                    reviewedOffset: 0.082
                ),
                in: incomplete
            )
        ) { error in
            XCTAssertEqual(
                error as? CaptureSourceSyncReviewError,
                .sourceEvidenceIncomplete
            )
        }
    }

    private func approvalInput(
        operationID: UUID,
        expectedOffset: Double,
        reviewedOffset: Double
    ) -> CaptureSourceSyncApprovalInput {
        CaptureSourceSyncApprovalInput(
            operationID: operationID,
            reviewerActorID: "qa-actor",
            reviewerLabel: "Quipsly QA",
            baselineLaneID: baselineLaneID,
            targetLaneID: targetLaneID,
            expectedTargetOffsetSeconds: expectedOffset,
            reviewedTargetOffsetSeconds: reviewedOffset,
            cueTimelineSeconds: 1,
            laterTimelineSeconds: 8,
            residualDriftMilliseconds: 4,
            checks: CaptureSourceSyncReviewChecks(
                waveformOrVisibleCueCompared: true,
                laterDriftCompared: true,
                assembledPlaybackAuditioned: true,
                humanPlacementApproved: true
            ),
            notes: "Compared the opening hand movement and the final phrase.",
            reviewedAt: Date(timeIntervalSince1970: 100)
        )
    }

    private func agentApprovalInput(
        operationID: UUID,
        expectedOffset: Double,
        reviewedOffset: Double
    ) -> CaptureSourceSyncApprovalInput {
        CaptureSourceSyncApprovalInput(
            operationID: operationID,
            reviewerActorID: "software-agent:codex",
            reviewerLabel: "Codex",
            reviewerKind: .softwareAgent,
            decisionBasis: .hybrid,
            delegationScope: "reversible-media-alignment",
            reviewerToolVersion: "Codex GPT-5",
            evidenceSummary: "Compared the opening visible cue, inspected the later checkpoint, and auditioned the assembled immutable sources.",
            baselineLaneID: baselineLaneID,
            targetLaneID: targetLaneID,
            expectedTargetOffsetSeconds: expectedOffset,
            reviewedTargetOffsetSeconds: reviewedOffset,
            cueTimelineSeconds: 1,
            laterTimelineSeconds: 8,
            residualDriftMilliseconds: 4,
            checks: CaptureSourceSyncReviewChecks(
                waveformOrVisibleCueCompared: true,
                laterDriftCompared: true,
                assembledPlaybackAuditioned: true,
                reviewerPlacementApproved: true
            ),
            notes: "Agent-qualified reversible placement.",
            reviewedAt: Date(timeIntervalSince1970: 100)
        )
    }

    private func makeSequence(targetOffset: Double) -> MediaSequence {
        let baseline = VideoLane(
            id: baselineLaneID,
            name: "MV7i microphone master",
            sourceVideo: SourceVideo(
                id: UUID(
                    uuidString: "11111111-1111-4111-8111-111111111111"
                )!,
                mediaURL: URL(fileURLWithPath: "/captures/local-mic.wav"),
                proxyURL: URL(fileURLWithPath: "/vault/proxy/local-mic.m4a"),
                duration: 9.8,
                offset: 0
            ),
            tags: [],
            metadata: VideoLaneMetadata(
                sourceAssetId: "audio-source",
                mediaKind: "audio",
                role: "spine-audio-candidate",
                sourcePath: "/captures/local-mic.wav",
                originalPath: "/captures/local-mic.wav",
                assetFingerprint: String(repeating: "a", count: 64),
                sourceReceiptPath: "/captures/audio-receipt.json",
                captureGroupID: captureGroupID.uuidString.lowercased(),
                episodeSpaceID: "hgo-macbook-av-durable-20260730",
                ingestKind: "local-microphone-master",
                alignmentStatus: "capture-clock-proposed"
            )
        )
        let target = VideoLane(
            id: targetLaneID,
            name: "Camera reference",
            sourceVideo: SourceVideo(
                id: UUID(
                    uuidString: "22222222-2222-4222-8222-222222222222"
                )!,
                mediaURL: URL(fileURLWithPath: "/captures/camera.mov"),
                proxyURL: URL(fileURLWithPath: "/vault/proxy/camera.mp4"),
                duration: 10,
                offset: targetOffset
            ),
            tags: [],
            metadata: VideoLaneMetadata(
                sourceAssetId: "video-source",
                mediaKind: "video",
                role: "participant-camera",
                sourcePath: "/captures/camera.mov",
                originalPath: "/captures/camera.mov",
                assetFingerprint: String(repeating: "b", count: 64),
                sourceReceiptPath: "/captures/video-receipt.json",
                captureGroupID: captureGroupID.uuidString.lowercased(),
                episodeSpaceID: "hgo-macbook-av-durable-20260730",
                ingestKind: "local-camera-reference",
                alignmentStatus: "capture-clock-proposed"
            )
        )
        return MediaSequence(
            title: "Capture sync review",
            orientationTrack: OrientationTrack(),
            verticalOrientationTrack: OrientationTrack(),
            lanes: [baseline, target]
        )
    }
}
