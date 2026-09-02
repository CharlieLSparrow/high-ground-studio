import AVFoundation
import Combine
import CryptoKit
import SwiftUI

struct CaptureTranscriptCorrectionRevision: Codable, Equatable {
    let revision: Int
    let operation: String
    let createdAt: String
}

struct CaptureTranscriptCorrection: Codable, Identifiable, Equatable {
    let id: String
    let segmentId: String
    let origin: String
    let status: String
    let correctedText: String?
    let correctedSpeakerLabel: String?
    let reason: String?
    let reviewedAt: String?
    let createdAt: String
    let updatedAt: String
    let revisions: [CaptureTranscriptCorrectionRevision]
}

struct CaptureTranscriptSegmentVerification: Codable, Identifiable, Equatable {
    let id: String
    let segmentId: String
    let reviewKind: String
    let reviewedAt: String
}

struct CaptureTranscriptSpeakerAttribution: Codable, Identifiable, Equatable {
    let id: String
    let providerSpeakerLabel: String
    let participantId: String?
    let participantUserId: String?
    let attributedLabel: String
    let providerSnapshotSha256: String
    let sampleSegmentIds: [String]
    let reviewedAt: String
}

struct CaptureTranscriptParticipant: Codable, Identifiable, Equatable {
    let id: String
    let userId: String?
    let displayLabel: String
    let role: String
    let isCurrentActor: Bool
}

struct CaptureTranscriptSpeakerSample: Codable, Identifiable, Equatable {
    let segmentId: String
    let startSeconds: TimeInterval
    let endSeconds: TimeInterval
    let text: String

    var id: String { segmentId }
}

struct CaptureTranscriptSpeakerGroup: Codable, Identifiable, Equatable {
    let providerSpeakerLabel: String
    let turnCount: Int
    let providerSnapshotSha256: String
    let attribution: CaptureTranscriptSpeakerAttribution?
    let staleAttribution: Bool
    let samples: [CaptureTranscriptSpeakerSample]

    var id: String { providerSpeakerLabel }
}

struct CaptureTranscriptImpactChanges: Codable, Equatable {
    let text: String
    let speaker: String
    let correctionReceipt: String
}

struct CaptureTranscriptDownstreamImpact: Codable, Identifiable, Equatable {
    let artifactId: String
    let artifactKind: String
    let label: String
    let status: String?
    let href: String
    let artifactUpdatedAt: String
    let canAcknowledge: Bool
    let state: String
    let evidenceSnapshotCount: Int
    let priorTextSnapshot: String?
    let currentTextSnapshot: String
    let priorSpeakerLabelSnapshot: String?
    let currentSpeakerLabel: String?
    let evidenceCorrectionId: String?
    let currentCorrectionId: String?
    let changes: CaptureTranscriptImpactChanges

    var id: String { "\(artifactKind):\(artifactId)" }

    var needsReview: Bool { state == "needs-review" }

    var kindLabel: String {
        switch artifactKind {
        case "note": "Note"
        case "task": "Task"
        case "goal": "Goal"
        case "follow-up": "Follow-up"
        default: "Linked item"
        }
    }
}

struct CaptureTranscriptSegment: Codable, Identifiable, Equatable {
    let id: String
    var transcriptJobId: String? = nil
    var recordingAssetId: String? = nil
    let speakerLabel: String?
    let providerSpeakerLabel: String?
    var speakerAuthority: String? = nil
    var sourceBoundParticipantId: String? = nil
    let startSeconds: TimeInterval
    let endSeconds: TimeInterval
    var sourceStartSeconds: TimeInterval? = nil
    var sourceEndSeconds: TimeInterval? = nil
    var programStartSeconds: TimeInterval? = nil
    var programEndSeconds: TimeInterval? = nil
    let text: String
    let providerText: String
    let providerTextSha256: String
    let confidence: Double?
    let acceptedCorrection: CaptureTranscriptCorrection?
    let acceptedVerification: CaptureTranscriptSegmentVerification?
    let speakerAttribution: CaptureTranscriptSpeakerAttribution?
    let proposals: [CaptureTranscriptCorrection]
    let correctionHistory: [CaptureTranscriptCorrection]
    var downstreamImpacts: [CaptureTranscriptDownstreamImpact]? = nil
    var sourcePlayback: CaptureTranscriptPlayback? = nil

    var playbackStartSeconds: TimeInterval { sourceStartSeconds ?? startSeconds }
    var playbackEndSeconds: TimeInterval { sourceEndSeconds ?? endSeconds }
    var sessionStartSeconds: TimeInterval { programStartSeconds ?? startSeconds }
    var sessionEndSeconds: TimeInterval { programEndSeconds ?? endSeconds }
}

struct CaptureTranscriptProtectedSource: Codable, Equatable {
    let schema: String
    let sha256: String
    let byteSize: Int64
}

struct CaptureTranscriptPlayback: Codable, Equatable {
    let sourceId: String
    let url: String
    let kind: String
    let recordingAssetId: String
    let durationSeconds: TimeInterval?
    let label: String
    var protectedSource: CaptureTranscriptProtectedSource? = nil

    var mobileProtectedSource: MobileCaptureSourceSummary? {
        guard let protectedSource,
              protectedSource.schema == "quipsly-session-protected-playback-v1",
              protectedSource.byteSize > 0,
              (kind == "audio" || kind == "video"),
              protectedSource.sha256.range(
                of: #"^[0-9a-f]{64}$"#,
                options: .regularExpression
              ) != nil,
              url.range(
                of: #"^/api/sessions/[A-Za-z0-9_-]{1,240}/recordings/[A-Za-z0-9_-]{1,240}/media$"#,
                options: .regularExpression
              ) != nil,
              url.hasSuffix("/recordings/\(recordingAssetId)/media") else { return nil }
        return MobileCaptureSourceSummary(
            recordingAssetId: recordingAssetId,
            captureGroupId: nil,
            fileName: label,
            kind: kind == "video" ? "LOCAL_VIDEO" : "LOCAL_AUDIO",
            contentType: kind == "video" ? "video/mp4" : "audio/mp4",
            recordingStatus: "VERIFIED",
            exactBytesVerified: true,
            processingDisposition: "RELEASED",
            recordedStartedAt: nil,
            recordedStoppedAt: nil,
            mediaAssetId: nil,
            playbackUrl: nil,
            byteSize: String(protectedSource.byteSize),
            sha256: protectedSource.sha256,
            durationSeconds: durationSeconds,
            sourceId: recordingAssetId,
            sessionPlaybackUrl: url
        )
    }
}

struct CaptureTranscriptGate: Codable, Equatable {
    let allowed: Bool
    let error: String?
}

struct CaptureTranscriptLowConfidenceWord: Codable, Equatable {
    let word: String
    let confidence: Double
    let startSeconds: TimeInterval
    let endSeconds: TimeInterval
}

struct CaptureTranscriptAttentionSegment: Codable, Identifiable, Equatable {
    let segmentId: String
    let startSeconds: TimeInterval
    let endSeconds: TimeInterval
    let text: String
    let reviewed: Bool
    let minimumWordConfidence: Double?
    let lowConfidenceWords: [CaptureTranscriptLowConfidenceWord]

    var id: String { segmentId }
}

struct CaptureTranscriptEvidenceSummary: Codable, Equatable {
    let provider: String?
    let providerModel: String?
    let segmentCount: Int
    let wordCount: Int
    let confidenceWordCount: Int
    let meanWordConfidence: Double?
    let medianWordConfidence: Double?
    let lowConfidenceThreshold: Double?
    let lowConfidenceThresholdAuthority: String?
    let lowConfidenceWordCount: Int?
    let confidenceIsNotMeasuredAccuracy: Bool
    let reviewedSegmentCount: Int
    let correctedSegmentCount: Int
    let confirmedAsIsSegmentCount: Int
    let reviewCoverage: Double
    let measuredWordErrorRate: Double?
    let measuredWordErrorCount: Int
    let measuredReferenceWordCount: Int
    let measuredScope: String
    let attentionSegments: [CaptureTranscriptAttentionSegment]
}

struct CaptureTranscriptEvidence: Codable, Equatable {
    let schema: String
    let transcript: CaptureTranscriptEvidenceSummary
}

struct CaptureSessionTranscriptSourceRouting: Codable, Equatable {
    let sourceTopology: String?
    let participantLabel: String?
    let speakerAuthority: String?
    let provider: String?
}

struct CaptureSessionTranscriptSourceProcessing: Codable, Equatable {
    let routing: CaptureSessionTranscriptSourceRouting?
}

struct CaptureSessionTranscriptSource: Codable, Equatable, Identifiable {
    let transcriptJobId: String
    let recordingAssetId: String
    let participantId: String?
    let captureGroupId: String?
    let programOffsetSeconds: TimeInterval?
    let timingAuthority: String?
    let timingUncertaintyMilliseconds: Double?
    let timingReviewRequired: Bool?
    let sampleAccurateClaimed: Bool?
    let processing: CaptureSessionTranscriptSourceProcessing?

    var id: String { recordingAssetId }
}

struct CaptureSessionTranscriptProgramClock: Codable, Equatable {
    let schema: String
    let authority: String
    let captureGroupId: String?
    let baselineRecordingAssetId: String
    let baselineStartedAt: String
    let waveformReviewRequired: Bool
    let sampleAccurateClaimed: Bool
    let reason: String
}

struct CaptureSessionTranscriptAssembly: Codable, Equatable {
    let schema: String
    let status: String
    let reason: String
    let sourceCount: Int
    let programClock: CaptureSessionTranscriptProgramClock?
    let sources: [CaptureSessionTranscriptSource]
}

struct CaptureTranscriptCorrectionDesk: Codable, Equatable {
    let ok: Bool
    let roomId: String
    let roomPurpose: String?
    let transcriptJobId: String?
    let gate: CaptureTranscriptGate
    let playback: CaptureTranscriptPlayback?
    /// Optional keeps protected v1 caches and older compatible Nest responses
    /// readable while the native voice-identification surface rolls forward.
    let participants: [CaptureTranscriptParticipant]?
    let speakerGroups: [CaptureTranscriptSpeakerGroup]?
    let segments: [CaptureTranscriptSegment]
    let evidence: CaptureTranscriptEvidence?
    var sessionTranscript: CaptureSessionTranscriptAssembly? = nil
    let boundaries: [String: Bool]

    static func preview(roomID: String) -> Self {
        let appStorePresentation = CaptureLaunchConfiguration.usesAppStorePresentation
        let speakerLabel = appStorePresentation ? "Client" : "Speaker"
        let participantLabel = appStorePresentation ? "Client" : "Charlie"
        let transcriptText = appStorePresentation
            ? "I’ll block thirty minutes Friday to write the reflection and send you what I notice."
            : "My goal is to publish a thoughtful first episode, and I will review the final cut this week."
        let proposal = CaptureTranscriptCorrection(
            id: "preview-speaker-proposal",
            segmentId: "preview-segment",
            origin: "ai",
            status: "proposed",
            correctedText: nil,
            correctedSpeakerLabel: participantLabel,
            reason: "The isolated participant track suggests this speaker label.",
            reviewedAt: nil,
            createdAt: "2026-07-18T00:00:00.000Z",
            updatedAt: "2026-07-18T00:00:00.000Z",
            revisions: [.init(revision: 1, operation: "ai-proposal-created", createdAt: "2026-07-18T00:00:00.000Z")]
        )
        let segment = CaptureTranscriptSegment(
            id: "preview-segment",
            speakerLabel: speakerLabel,
            providerSpeakerLabel: speakerLabel,
            speakerAuthority: "source-binding",
            sourceBoundParticipantId: "preview-participant-charlie",
            startSeconds: 3.66,
            endSeconds: 4.84,
            text: transcriptText,
            providerText: transcriptText,
            providerTextSha256: "preview-provider-sha256",
            confidence: 0.58,
            acceptedCorrection: nil,
            acceptedVerification: nil,
            speakerAttribution: nil,
            proposals: [proposal],
            correctionHistory: [proposal],
            downstreamImpacts: [
                .init(
                    artifactId: "preview-task",
                    artifactKind: "task",
                    label: appStorePresentation ? "Write the reflection Friday" : "Review the final cut this week",
                    status: "OPEN",
                    href: "/tasks/preview-task",
                    artifactUpdatedAt: "2026-07-18T00:00:00.000Z",
                    canAcknowledge: true,
                    state: "needs-review",
                    evidenceSnapshotCount: 1,
                    priorTextSnapshot: transcriptText,
                    currentTextSnapshot: transcriptText,
                    priorSpeakerLabelSnapshot: speakerLabel,
                    currentSpeakerLabel: participantLabel,
                    evidenceCorrectionId: nil,
                    currentCorrectionId: "preview-accepted-correction",
                    changes: .init(
                        text: "changed",
                        speaker: "changed",
                        correctionReceipt: "changed"
                    )
                ),
            ]
        )
        let participant = CaptureTranscriptParticipant(
            id: "preview-participant-charlie",
            userId: "preview-user-charlie",
            displayLabel: participantLabel,
            role: appStorePresentation ? "GUEST" : "HOST",
            isCurrentActor: !appStorePresentation
        )
        return .init(
            ok: true,
            roomId: roomID,
            roomPurpose: "COACHING",
            transcriptJobId: "preview-transcript-job",
            gate: .init(allowed: true, error: nil),
            playback: .init(
                sourceId: "preview-source",
                url: "/api/ingest/media/preview-source",
                kind: "audio",
                recordingAssetId: "preview-recording-asset",
                durationSeconds: 60,
                label: "Preview session recording"
            ),
            participants: [participant],
            speakerGroups: [
                .init(
                    providerSpeakerLabel: speakerLabel,
                    turnCount: 1,
                    providerSnapshotSha256: String(repeating: "a", count: 64),
                    attribution: nil,
                    staleAttribution: false,
                    samples: [
                        .init(
                            segmentId: segment.id,
                            startSeconds: segment.startSeconds,
                            endSeconds: segment.endSeconds,
                            text: segment.providerText
                        ),
                    ]
                ),
            ],
            segments: [segment],
            evidence: .init(
                schema: "quipsly-audio-transcript-evidence-v1",
                transcript: .init(
                    provider: "deepgram",
                    providerModel: "nova-3",
                    segmentCount: 1,
                    wordCount: appStorePresentation ? 15 : 17,
                    confidenceWordCount: appStorePresentation ? 15 : 17,
                    meanWordConfidence: 0.86,
                    medianWordConfidence: 0.91,
                    lowConfidenceThreshold: 0.65,
                    lowConfidenceThresholdAuthority: "quipsly-deepgram-default-v1",
                    lowConfidenceWordCount: 1,
                    confidenceIsNotMeasuredAccuracy: true,
                    reviewedSegmentCount: 0,
                    correctedSegmentCount: 0,
                    confirmedAsIsSegmentCount: 0,
                    reviewCoverage: 0,
                    measuredWordErrorRate: nil,
                    measuredWordErrorCount: 0,
                    measuredReferenceWordCount: 0,
                    measuredScope: "NONE",
                    attentionSegments: [
                        .init(
                            segmentId: segment.id,
                            startSeconds: segment.startSeconds,
                            endSeconds: segment.endSeconds,
                            text: segment.text,
                            reviewed: false,
                            minimumWordConfidence: 0.58,
                            lowConfidenceWords: [
                                .init(
                                    word: appStorePresentation ? "reflection" : "thoughtful",
                                    confidence: 0.58,
                                    startSeconds: 4.08,
                                    endSeconds: 4.46
                                ),
                            ]
                        ),
                    ]
                )
            ),
            sessionTranscript: .init(
                schema: "quipsly-session-transcript-correction-desk-v1",
                status: "assembled",
                reason: "Validated capture clocks place both participant sources on one provisional Session timeline.",
                sourceCount: 2,
                programClock: .init(
                    schema: "quipsly-session-transcript-program-clock-v1",
                    authority: "capture-clock-proposal",
                    captureGroupId: "preview-capture-group",
                    baselineRecordingAssetId: "preview-recording-asset",
                    baselineStartedAt: "2026-07-18T00:00:00.000Z",
                    waveformReviewRequired: true,
                    sampleAccurateClaimed: false,
                    reason: "Capture clocks provide a reversible starting placement; waveform review can refine it."
                ),
                sources: [
                    .init(
                        transcriptJobId: "preview-transcript-job",
                        recordingAssetId: "preview-recording-asset",
                        participantId: "preview-participant-charlie",
                        captureGroupId: "preview-capture-group",
                        programOffsetSeconds: 0,
                        timingAuthority: "capture-clock-proposal",
                        timingUncertaintyMilliseconds: 18,
                        timingReviewRequired: true,
                        sampleAccurateClaimed: false,
                        processing: .init(routing: .init(
                            sourceTopology: "participant-isolated",
                            participantLabel: participantLabel,
                            speakerAuthority: "source-binding",
                            provider: "apple-speech-recognizer-service"
                        ))
                    ),
                    .init(
                        transcriptJobId: "preview-transcript-job-client",
                        recordingAssetId: "preview-recording-asset-client",
                        participantId: "preview-participant-client",
                        captureGroupId: "preview-capture-group",
                        programOffsetSeconds: 0.18,
                        timingAuthority: "capture-clock-proposal",
                        timingUncertaintyMilliseconds: 24,
                        timingReviewRequired: true,
                        sampleAccurateClaimed: false,
                        processing: .init(routing: .init(
                            sourceTopology: "participant-isolated",
                            participantLabel: appStorePresentation ? "Coach" : "Homer",
                            speakerAuthority: "source-binding",
                            provider: "apple-speech-transcriber-on-device"
                        ))
                    ),
                ]
            ),
            boundaries: [
                "providerSegmentsImmutable": true,
                "correctionOverlayVersioned": true,
                "acceptedHumanCorrectionRequiresPlaybackConfirmation": false,
                "directHumanCorrectionPreservesSourceAnchors": true,
                "aiSuggestionRequiresAcceptanceToChangeTranscript": true,
                "mediaTimeAnchorsPreserved": true,
                "speakerIdentitySeparateFromWordReview": true,
                "noTaskCreated": true,
                "noExternalDelivery": true,
                "noPublication": true,
            ]
        )
    }
}

private struct CaptureTranscriptAPIError: Codable {
    let error: String?
    let errorCode: String?
}

private struct CaptureTranscriptMutationBoundaries: Codable {
    let providerSegmentsImmutable: Bool?
    let correctionOverlayVersioned: Bool?
    let acceptedHumanCorrectionRequiresPlaybackConfirmation: Bool?
    let directHumanCorrectionPreservesSourceAnchors: Bool?
    let confirmedAsIsRequiresPlaybackConfirmation: Bool?
    let mediaTimeAnchorsPreserved: Bool?
    let speakerIdentitySeparateFromWordReview: Bool?
}

private struct CaptureTranscriptMutationResponse: Codable {
    let ok: Bool
    let idempotentReplay: Bool?
    let correction: CaptureTranscriptCorrection?
    let verification: CaptureTranscriptSegmentVerification?
    let attribution: CaptureTranscriptSpeakerAttribution?
    let boundaries: CaptureTranscriptMutationBoundaries?
}

private struct CaptureTranscriptTaskMutationResponse: Codable {
    struct TaskRecord: Codable {
        let id: String
        let title: String
        let status: String
    }
    let ok: Bool
    let error: String?
    let idempotentReplay: Bool?
    let task: TaskRecord?
}

private struct CaptureTranscriptGoalMutationResponse: Codable {
    struct GoalRecord: Codable {
        struct TagRecord: Codable {
            let id: String
            let label: String
            let slug: String
        }
        let id: String
        let title: String
        let status: String
        let targetAt: String?
        let tags: [TagRecord]?
    }
    struct ReviewReceipt: Codable {
        let id: String
        let decision: String
        let goalCandidateId: String
        let goalId: String?
        let goalProgressReceiptId: String?
    }
    struct Boundaries: Codable {
        let mergeAppendsOneActorOwnedGoalEvidenceReceipt: Bool?
        let mergeChangesNoGoalDefinitionStatusTargetOrTags: Bool?
        let taskCreated: Bool?
        let targetDateCreated: Bool?
        let projectTagsApplied: Bool?
        let reminderCreated: Bool?
        let calendarMutated: Bool?
        let externalDelivery: Bool?
        let publication: Bool?
    }
    let ok: Bool
    let error: String?
    let decision: String?
    let idempotentReplay: Bool?
    let receipt: ReviewReceipt?
    let goal: GoalRecord?
    let boundaries: Boundaries?
}

private struct CaptureTranscriptNoteMutationResponse: Codable {
    struct NoteRecord: Codable {
        let id: String
        let title: String?
        let body: String
        let kind: String
        let visibility: String
    }
    struct ReviewReceipt: Codable {
        let id: String
        let decision: String
        let packetNoteCandidateId: String
        let reviewedByUserId: String
        let noteId: String?
        var governance: MobileCaptureGovernedActionReference? = nil
    }
    struct Boundaries: Codable {
        let packetCandidateReviewed: Bool
        let packetSnapshotRechecked: Bool
        let humanReviewedSourceRequired: Bool
        let humanReviewedSourceRequiredForInternalWork: Bool?
        let sourceReviewState: String?
        let sourceReviewRecommended: Bool?
        let noteCreated: Bool
        let noteRevised: Bool?
        let taskCreated: Bool
        let goalCreated: Bool
        let calendarMutated: Bool
        let messageSent: Bool
        let externalDelivery: Bool
        let publication: Bool
    }
    let ok: Bool
    let error: String?
    let idempotentReplay: Bool?
    let decision: String?
    let reviewStatus: String?
    let receipt: ReviewReceipt?
    let note: NoteRecord?
    var governance: MobileCaptureGovernedActionReference? = nil
    let boundaries: Boundaries?
}

struct CapturePacketNoteMergeTarget: Codable, Identifiable, Equatable {
    let id: String
    let title: String?
    let body: String
    let kind: String
    let visibility: String
    let updatedAt: String
    let revisionCount: Int

    static func preview() -> Self {
        .init(
            id: "preview-existing-note",
            title: "Episode direction",
            body: "Keep the source-backed decisions together.",
            kind: MobileSessionNoteKind.sessionNote.rawValue,
            visibility: MobileSessionNoteVisibility.authorPrivate.rawValue,
            updatedAt: "2026-08-03T12:00:00.000Z",
            revisionCount: 2
        )
    }
}

private struct CapturePacketActionMutationResponse: Codable {
    struct ActionRecord: Codable {
        let id: String
        let title: String
        let status: String
        let assignedUserId: String?
        let dueAt: String?
        let tagIds: [String]?
    }
    let ok: Bool
    let error: String?
    let idempotentReplay: Bool?
    let actionItem: ActionRecord?
    let decision: String?
    let receipt: Receipt?
    let boundaries: Boundaries?

    struct Receipt: Codable {
        let decision: String?
        let actionCandidateId: String?
        let actionItemId: String?
        let taskEvidenceReceiptId: String?
    }

    struct Boundaries: Codable {
        let mergeAppendsOneActorOwnedTaskEvidenceReceipt: Bool?
        let mergeChangesNoTaskIdentityStatusOwnerDatesReminderRecurrenceTagsGoalsOrProject: Bool?
        let dueDateCreated: Bool?
        let projectTagsApplied: Bool?
    }
}

struct CapturePacketTaskTag: Codable, Identifiable, Equatable {
    let id: String
    let label: String
    let slug: String
    let selectedForSession: Bool
}

struct CapturePacketHumanReview: Codable, Equatable {
    let receiptId: String
    let decision: String
    let reviewedAt: String
    let reviewedByUserId: String
    var governance: MobileCaptureGovernedActionReference? = nil
}

struct CapturePacketActionCandidate: Codable, Identifiable, Equatable {
    let id: String
    let title: String
    let detail: String
    let transcriptJobId: String
    let recordingAssetId: String
    let roomId: String
    let packetBuildId: String
    let segmentId: String
    var segmentIds: [String]? = nil
    var sourceText: String? = nil
    var sourceTextSha256: String? = nil
    var sourceSpan: MobileCaptureTranscriptSourceSpan? = nil
    var transcriptReviewStatus: String? = nil
    let speakerLabel: String?
    var speakerAuthority: String? = nil
    let startSeconds: TimeInterval
    let endSeconds: TimeInterval
    let reviewStatus: String
    let humanApprovalRequired: Bool
    let committedActionItemId: String?
    var lastHumanReview: CapturePacketHumanReview? = nil

    static func preview(roomID: String) -> Self {
        .init(
            id: "quipsly-transcript-action-candidate-v1:preview-transcript-job:preview-segment",
            title: "Review the final cut this week",
            detail: "Optional task idea from the transcript. Add it, edit it, or leave it alone.",
            transcriptJobId: "preview-transcript-job",
            recordingAssetId: "preview-recording-asset",
            roomId: roomID,
            packetBuildId: "preview-build",
            segmentId: "preview-segment",
            speakerLabel: "Speaker",
            speakerAuthority: "source-binding",
            startSeconds: 3.66,
            endSeconds: 4.84,
            reviewStatus: "READY_FOR_HUMAN_REVIEW",
            humanApprovalRequired: true,
            committedActionItemId: nil
        )
    }
}

struct CapturePacketGoalCandidate: Codable, Identifiable, Equatable {
    let id: String
    let clientRequestId: String
    let roomId: String
    let transcriptJobId: String
    let recordingAssetId: String
    let packetBuildId: String
    let segmentId: String
    var segmentIds: [String]? = nil
    let speakerLabel: String?
    var speakerAuthority: String? = nil
    let startSeconds: TimeInterval
    let endSeconds: TimeInterval
    let sourceText: String
    var sourceTextSha256: String? = nil
    var sourceSpan: MobileCaptureTranscriptSourceSpan? = nil
    var acceptedReviewId: String? = nil
    var acceptedCorrectionId: String? = nil
    var transcriptReviewStatus: String? = nil
    let providerTextSha256: String
    let suggestedTitle: String
    let suggestedDescription: String
    let reviewStatus: String
    let humanApprovalRequired: Bool
    let committedGoalId: String?
    var lastHumanReview: CapturePacketHumanReview? = nil

    static func preview(roomID: String) -> Self {
        .init(
            id: "packet-goal-preview-build-preview-segment",
            clientRequestId: "packet-goal-preview-build-preview-segment",
            roomId: roomID,
            transcriptJobId: "preview-transcript-job",
            recordingAssetId: "preview-recording-asset",
            packetBuildId: "preview-build",
            segmentId: "preview-segment",
            speakerLabel: "Speaker",
            speakerAuthority: "source-binding",
            startSeconds: 3.66,
            endSeconds: 4.84,
            sourceText: "My goal is to publish a thoughtful first episode, and I will review the final cut this week.",
            providerTextSha256: "preview-provider-sha256",
            suggestedTitle: "Publish a thoughtful first episode",
            suggestedDescription: "Review the episode against its real source and make the release decision deliberately.",
            reviewStatus: "READY_FOR_HUMAN_REVIEW",
            humanApprovalRequired: true,
            committedGoalId: nil
        )
    }
}

struct CapturePacketGoalMergeTarget: Codable, Identifiable, Equatable {
    let id: String
    let title: String
    let description: String?
    let status: String
    let targetAt: String?
    let updatedAt: String
    let projectId: String?
    let roomId: String?
    let evidenceCount: Int

    static func preview() -> Self {
        .init(
            id: "preview-goal",
            title: "Publish a thoughtful first episode",
            description: "Review the real source and make the release decision deliberately.",
            status: "ACTIVE",
            targetAt: nil,
            updatedAt: "2026-08-03T12:00:00.000Z",
            projectId: "preview-high-ground",
            roomId: "room-preview-coaching-ready",
            evidenceCount: 1
        )
    }
}

struct CapturePacketTaskMergeTarget: Codable, Identifiable, Equatable {
    let id: String
    let title: String
    let detail: String?
    let status: String
    let dueAt: String?
    let updatedAt: String
    let projectId: String?
    let roomId: String?
    let evidenceCount: Int

    static func preview() -> Self {
        .init(id: "preview-task", title: "Review the final cut", detail: "Use the real source.", status: "OPEN", dueAt: nil, updatedAt: "2026-08-03T12:00:00.000Z", projectId: "preview-high-ground", roomId: "room-preview-coaching-ready", evidenceCount: 1)
    }
}

struct CapturePacketNoteCandidate: Codable, Identifiable, Equatable {
    struct CarriedForwardDraft: Codable, Equatable {
        let receiptId: String
        let decision: String
        let reviewedAt: String
        let reviewedByUserId: String
        let packetBuildId: String
        let exactSourceMatch: Bool
    }
    let id: String
    let clientRequestId: String
    let roomId: String
    let transcriptJobId: String
    let recordingAssetId: String
    let summaryNoteId: String
    let packetBuildId: String
    let laneId: String
    let laneLabel: String
    let laneStatus: String
    let segmentId: String
    var segmentIds: [String]? = nil
    let speakerLabel: String?
    var speakerAuthority: String? = nil
    let startSeconds: TimeInterval
    let endSeconds: TimeInterval
    let sourceText: String
    var sourceTextSha256: String? = nil
    var sourceSpan: MobileCaptureTranscriptSourceSpan? = nil
    let providerTextSha256: String
    let acceptedReviewId: String?
    let acceptedCorrectionId: String?
    let transcriptReviewStatus: String
    let suggestedTitle: String
    let suggestedBody: String
    let suggestedKind: String
    let suggestedVisibility: String
    var reviewStatus: String? = nil
    let humanApprovalRequired: Bool
    let committedNoteId: String?
    var lastHumanReview: CapturePacketHumanReview? = nil
    var carriedForwardDraft: CarriedForwardDraft? = nil

    var accessibilityKey: String {
        let digest = SHA256.hash(data: Data(id.utf8))
            .prefix(16)
            .map { String(format: "%02x", $0) }
            .joined()
        return "\(laneId.prefix(28))-\(digest)"
    }

    static func preview(roomID: String) -> Self {
        .init(
            id: "packet-note-preview-build-coaching-insights-preview-segment",
            clientRequestId: "packet-note-preview-build-coaching-insights-preview-segment",
            roomId: roomID,
            transcriptJobId: "preview-transcript-job",
            recordingAssetId: "preview-recording-asset",
            summaryNoteId: "preview-summary",
            packetBuildId: "preview-build",
            laneId: "coaching-insights",
            laneLabel: "Insights and decisions",
            laneStatus: "READY_FOR_HUMAN_REVIEW",
            segmentId: "preview-segment",
            speakerLabel: "Speaker",
            speakerAuthority: "source-binding",
            startSeconds: 3.66,
            endSeconds: 4.84,
            sourceText: "My goal is to publish a thoughtful first episode, and I will review the final cut this week.",
            providerTextSha256: "preview-provider-sha256",
            acceptedReviewId: nil,
            acceptedCorrectionId: nil,
            transcriptReviewStatus: "provider",
            suggestedTitle: "Insights and decisions",
            suggestedBody: "My goal is to publish a thoughtful first episode, and I will review the final cut this week.",
            suggestedKind: MobileSessionNoteKind.sessionNote.rawValue,
            suggestedVisibility: MobileSessionNoteVisibility.authorPrivate.rawValue,
            reviewStatus: "READY_FOR_HUMAN_REVIEW",
            humanApprovalRequired: true,
            committedNoteId: nil,
            lastHumanReview: nil,
            carriedForwardDraft: nil
        )
    }
}

private struct CapturePacketGoalReviewContext: Equatable {
    let summaryNoteId: String
    let packetBuildId: String
}

private struct CapturePacketGoalReviewEnvelope: Codable {
    struct Packet: Codable {
        struct ReviewAccess: Codable {
            let canReviewPrivatePacket: Bool
            let role: String?
            let boundary: String?
        }
        struct TranscriptReview: Codable {
            let snapshotSha256: String?
            let segmentCount: Int
            let humanReviewedSegmentCount: Int
            let providerOnlySegmentCount: Int
            let fullyHumanReviewed: Bool
            let packetStale: Bool
        }
        struct Build: Codable { let packetBuildId: String? }
        struct Summary: Codable { let id: String }
        struct TaskMaterialization: Codable {
            struct Project: Codable { let id: String; let name: String }
            let project: Project?
            let tags: [CapturePacketTaskTag]
            let defaultOwner: String
            let boundary: String
        }
        let build: Build?
        let reviewAccess: ReviewAccess?
        let status: String?
        let transcriptReview: TranscriptReview?
        let summary: Summary?
        let noteCandidates: [CapturePacketNoteCandidate]?
        let noteMergeTargets: [CapturePacketNoteMergeTarget]?
        let actionCandidates: [CapturePacketActionCandidate]?
        let taskMergeTargets: [CapturePacketTaskMergeTarget]?
        let goalCandidates: [CapturePacketGoalCandidate]?
        let goalMergeTargets: [CapturePacketGoalMergeTarget]?
        let taskMaterialization: TaskMaterialization?
        let results: MobileCaptureTranscriptResults?
    }
    let ok: Bool
    let error: String?
    let packet: Packet?
}

@MainActor
final class CaptureTranscriptCorrectionClient: ObservableObject {
    @Published private(set) var desk: CaptureTranscriptCorrectionDesk?
    @Published private(set) var isLoading = false
    @Published private(set) var isMutating = false
    @Published private(set) var isUsingProtectedCache = false
    @Published private(set) var isPreparingMentorReport = false
    @Published private(set) var mentorReportURL: URL?
    @Published private(set) var message: String?
    @Published private(set) var errorMessage: String?
    @Published private(set) var packetGoalCandidates: [CapturePacketGoalCandidate] = []
    @Published private(set) var packetGoalMergeTargets: [CapturePacketGoalMergeTarget] = []
    @Published private(set) var packetNoteCandidates: [CapturePacketNoteCandidate] = []
    @Published private(set) var packetNoteMergeTargets: [CapturePacketNoteMergeTarget] = []
    @Published private(set) var packetActionCandidates: [CapturePacketActionCandidate] = []
    @Published private(set) var packetTaskMergeTargets: [CapturePacketTaskMergeTarget] = []
    @Published private(set) var packetTaskTags: [CapturePacketTaskTag] = []
    @Published private(set) var packetTaskProjectName: String?
    @Published private(set) var packetResults: MobileCaptureTranscriptResults?
    @Published private(set) var packetReviewError: String?
    @Published private(set) var packetStatus: String?
    @Published private(set) var canReviewPrivatePacket = true
    @Published private(set) var privatePacketBoundary: String?
    @Published private(set) var packetSegmentCount = 0
    @Published private(set) var packetReviewedSegmentCount = 0
    @Published private(set) var packetProviderOnlySegmentCount = 0
    @Published private(set) var packetSnapshotStale = false
    @Published private(set) var followUpPreparationFailed = false
    @Published private(set) var pendingTranscriptDecisionCount = 0
    @Published private(set) var heldTranscriptDecisionCount = 0
    @Published private(set) var pendingSpeakerAttributionCount = 0
    @Published private(set) var heldSpeakerAttributionCount = 0

    var packetNeedsRebuild: Bool {
        packetStatus == "TRANSCRIPT_REVIEW_CHANGED" || packetSnapshotStale
    }

    private var packetGoalReviewContext: CapturePacketGoalReviewContext?
    private let reviewDecisionOutbox = TranscriptReviewDecisionOutbox.shared
    private let speakerAttributionOutbox = TranscriptSpeakerAttributionOutbox.shared
    private var isFlushingReviewDecisions = false
    private var isFlushingSpeakerAttributions = false
    private var activeRoomID: String?
    private var includesFollowUpWorkspace = true
    private var automaticPacketAttemptKeys: Set<String> = []
    private var packetSnapshotSHA256: String?

    private let baseURL = normalizedNestBaseURL(
        Bundle.main.object(forInfoDictionaryKey: "QUIPSLY_API_BASE_URL") as? String ?? "https://nest.quipsly.com"
    )

    private static var previewResults: MobileCaptureTranscriptResults {
        let source = MobileCaptureTranscriptResultSource(
            transcriptJobId: "preview-transcript-job",
            recordingAssetId: "preview-recording-asset",
            segmentId: "preview-segment",
            startSeconds: 3.66,
            endSeconds: 4.84,
            sourceStartSeconds: 3.66,
            sourceEndSeconds: 4.84,
            programStartSeconds: 4.16,
            programEndSeconds: 5.34,
            speakerLabel: "Charlie"
        )
        return MobileCaptureTranscriptResults(
            automaticallyCreated: true,
            editable: true,
            removable: true,
            summary: .init(
                id: "preview-summary",
                title: "Session recap",
                body: "The client chose one clear next move and named the support that will make it easier to follow through."
            ),
            notes: [
                .init(
                    id: "preview-note",
                    title: "What matters now",
                    body: "Protect time for the first concrete step before the next Session.",
                    source: source
                ),
            ],
            tasks: [
                .init(
                    id: "preview-task",
                    title: "Block 30 minutes for the first step",
                    detail: "Put the first attempt on the calendar this week.",
                    status: "OPEN",
                    assignedUserId: "preview-client",
                    dueAt: nil,
                    completedAt: nil,
                    source: source
                ),
            ],
            goals: [
                .init(
                    id: "preview-goal",
                    title: "Build a repeatable weekly practice",
                    description: "Start small enough to keep the commitment consistently.",
                    status: "ACTIVE",
                    ownerUserId: "preview-client",
                    targetAt: nil,
                    achievedAt: nil,
                    source: source
                ),
            ]
        )
    }

    private struct ProtectedCache: Codable {
        let schemaVersion: Int
        let ownerEmail: String
        let roomID: String
        let savedAt: Date
        let desk: CaptureTranscriptCorrectionDesk
    }

    func pendingDecision(
        roomID: String,
        segmentID: String
    ) -> PendingTranscriptReviewDecision? {
        reviewDecisionOutbox.decision(roomID: roomID, segmentID: segmentID)
    }

    func pendingSpeakerAttribution(
        roomID: String,
        providerSpeakerLabel: String
    ) -> PendingTranscriptSpeakerAttribution? {
        speakerAttributionOutbox.attribution(
            roomID: roomID,
            providerSpeakerLabel: providerSpeakerLabel
        )
    }

    func load(roomID: String, previewOnly: Bool) async {
        includesFollowUpWorkspace = true
        await loadDesk(
            roomID: roomID,
            previewOnly: previewOnly,
            includeFollowUpWorkspace: true
        )
    }

    /// Loads only the canonical, source-bound transcript and correction ledger.
    /// Voice writing uses this path so correcting ordinary dictation does not
    /// also prepare coaching packets, goals, tasks, or AI follow-through.
    func loadForDirectEditing(roomID: String, previewOnly: Bool = false) async {
        includesFollowUpWorkspace = false
        await loadDesk(
            roomID: roomID,
            previewOnly: previewOnly,
            includeFollowUpWorkspace: false
        )
    }

    private func reloadActiveDesk(roomID: String) async {
        await loadDesk(
            roomID: roomID,
            previewOnly: false,
            includeFollowUpWorkspace: includesFollowUpWorkspace
        )
    }

    private func loadDesk(
        roomID: String,
        previewOnly: Bool,
        includeFollowUpWorkspace: Bool
    ) async {
        let normalizedRoomID = roomID.trimmingCharacters(in: .whitespacesAndNewlines)
        if activeRoomID != normalizedRoomID {
            removePreparedMentorReport()
        }
        activeRoomID = normalizedRoomID
        guard !previewOnly else {
            desk = .preview(roomID: roomID)
            if !includeFollowUpWorkspace {
                clearFollowUpWorkspace()
                isUsingProtectedCache = false
                message = nil
                errorMessage = nil
                publishOutboxCounts()
                return
            }
            if CaptureLaunchConfiguration.usesTranscriptReviewOutboxUITest,
               let previewOwner = CaptureLaunchConfiguration.shareExtensionUITestOwner,
               let segment = desk?.segments.first {
                reviewDecisionOutbox.activateOwner(previewOwner)
                if reviewDecisionOutbox.decision(roomID: roomID, segmentID: segment.id) == nil {
                    do {
                        _ = try reviewDecisionOutbox.enqueueConfirmation(
                            roomID: roomID,
                            segmentID: segment.id,
                            expectedProviderText: segment.providerText,
                            expectedProviderSpeakerLabel: segment.providerSpeakerLabel,
                            expectedAcceptedCorrectionID: segment.acceptedCorrection?.id,
                            playbackPositionSeconds: segment.playbackEndSeconds
                        )
                    } catch {
                        errorMessage = "Transcript outbox UI proof could not stage its protected decision: \(error.localizedDescription)"
                    }
                }
            }
            publishOutboxCounts()
            let appStorePresentation = CaptureLaunchConfiguration.usesAppStorePresentation
            packetGoalCandidates = appStorePresentation ? [] : [.preview(roomID: roomID)]
            packetGoalMergeTargets = appStorePresentation ? [] : [.preview()]
            packetNoteCandidates = appStorePresentation ? [] : [.preview(roomID: roomID)]
            packetNoteMergeTargets = appStorePresentation ? [] : [.preview()]
            packetActionCandidates = appStorePresentation ? [] : [.preview(roomID: roomID)]
            packetTaskMergeTargets = appStorePresentation ? [] : [.preview()]
            packetTaskTags = [
                .init(id: "preview-follow-through", label: "Follow-through", slug: "follow-through", selectedForSession: true),
                .init(id: "preview-coaching", label: "Coaching", slug: "coaching", selectedForSession: true),
            ]
            packetTaskProjectName = appStorePresentation ? "My coaching practice" : "High Ground Odyssey"
            packetResults = Self.previewResults
            packetGoalReviewContext = .init(summaryNoteId: "preview-summary", packetBuildId: "preview-build")
            packetReviewError = nil
            packetStatus = "RESULTS_READY"
            canReviewPrivatePacket = true
            privatePacketBoundary = nil
            packetSegmentCount = 0
            packetReviewedSegmentCount = 0
            packetProviderOnlySegmentCount = 0
            packetSnapshotStale = false
            isUsingProtectedCache = false
            message = appStorePresentation ? nil : "Preview only — no recording is played and no correction can be saved."
            if !CaptureLaunchConfiguration.usesTranscriptReviewOutboxUITest {
                errorMessage = nil
            }
            return
        }
        publishOutboxCounts()
        guard AuthManager.shared.networkActionsAllowed else {
            packetGoalCandidates = []
            packetGoalMergeTargets = []
            packetNoteCandidates = []
            packetNoteMergeTargets = []
            packetActionCandidates = []
            packetTaskMergeTargets = []
            packetTaskTags = []
            packetTaskProjectName = nil
            packetResults = nil
            packetGoalReviewContext = nil
            packetStatus = nil
            canReviewPrivatePacket = true
            privatePacketBoundary = nil
            resetPacketReviewState()
            if restoreProtectedCache(roomID: roomID) {
                errorMessage = "Nest is unavailable. Showing a protected transcript snapshot; exact local playback-reviewed word decisions and voice identities can be queued safely, while packet and AI decisions stay locked until authority is verified."
            } else {
                errorMessage = "Sign in with a stable Quipsly account before loading transcript review."
                desk = nil
            }
            return
        }
        guard var components = URLComponents(string: "\(baseURL)/api/mobile/capture/transcripts/corrections") else {
            errorMessage = "The configured Nest URL is invalid."
            return
        }
        components.queryItems = [URLQueryItem(name: "callRoomId", value: roomID)]
        guard let url = components.url else {
            errorMessage = "The transcript review URL could not be created."
            return
        }

        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            var request = URLRequest(url: url)
            request.cachePolicy = .reloadIgnoringLocalCacheData
            request.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            guard response.statusCode < 400 else {
                throw captureTranscriptError(data: data, fallback: "Transcript review could not load.")
            }
            desk = try JSONDecoder().decode(CaptureTranscriptCorrectionDesk.self, from: data)
            isUsingProtectedCache = false
            if let desk { persist(desk, roomID: roomID) }
            message = nil
            if includeFollowUpWorkspace {
                await loadPacketCandidates(roomID: roomID)
                await prepareFollowUpIfNeeded(roomID: roomID)
            } else {
                clearFollowUpWorkspace()
            }
            let synchronizedReview = await flushReviewDecisions()
            let synchronizedSpeaker = includeFollowUpWorkspace
                ? await flushSpeakerAttributions()
                : false
            if synchronizedReview || synchronizedSpeaker {
                Task { [weak self] in
                    await self?.reloadActiveDesk(roomID: roomID)
                }
            }
        } catch {
            packetGoalCandidates = []
            packetGoalMergeTargets = []
            packetNoteCandidates = []
            packetNoteMergeTargets = []
            packetActionCandidates = []
            packetTaskMergeTargets = []
            packetTaskTags = []
            packetTaskProjectName = nil
            packetResults = nil
            packetGoalReviewContext = nil
            packetStatus = nil
            resetPacketReviewState()
            if restoreProtectedCache(roomID: roomID) {
                errorMessage = "Nest is unavailable. Showing a protected transcript snapshot; exact local playback-reviewed word decisions and voice identities can be queued safely, while packet and AI decisions stay locked until authority is verified."
            } else {
                desk = nil
                isUsingProtectedCache = false
                errorMessage = error.localizedDescription
            }
        }
    }

    private func clearFollowUpWorkspace() {
        packetGoalCandidates = []
        packetGoalMergeTargets = []
        packetNoteCandidates = []
        packetNoteMergeTargets = []
        packetActionCandidates = []
        packetTaskMergeTargets = []
        packetTaskTags = []
        packetTaskProjectName = nil
        packetResults = nil
        packetGoalReviewContext = nil
        packetReviewError = nil
        packetStatus = nil
        followUpPreparationFailed = false
        canReviewPrivatePacket = true
        privatePacketBoundary = nil
        resetPacketReviewState()
    }

    func prepareMentorReport(roomID: String, sessionTitle: String) async {
        guard !isPreparingMentorReport else { return }
        guard AuthManager.shared.networkActionsAllowed else {
            errorMessage = "Reconnect to Quipsly before preparing the private mentor report."
            return
        }
        let normalizedRoomID = roomID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedRoomID.isEmpty,
              let encodedRoomID = normalizedRoomID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed),
              let url = URL(string: "\(baseURL)/api/sessions/\(encodedRoomID)/transcript-report") else {
            errorMessage = "The mentor report URL could not be created."
            return
        }
        isPreparingMentorReport = true
        errorMessage = nil
        defer { isPreparingMentorReport = false }
        do {
            var request = URLRequest(url: url)
            request.cachePolicy = .reloadIgnoringLocalCacheData
            request.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            guard response.statusCode < 400 else {
                throw captureTranscriptError(data: data, fallback: "The mentor report could not be prepared.")
            }
            guard data.starts(with: [0x50, 0x4B]) else {
                throw captureTranscriptClientError("Quipsly did not return a valid Word report.")
            }
            removePreparedMentorReport()
            let serverName = response.suggestedFilename?.trimmingCharacters(in: .whitespacesAndNewlines)
            let fallbackTitle = sessionTitle
                .components(separatedBy: CharacterSet.alphanumerics.inverted)
                .filter { !$0.isEmpty }
                .joined(separator: " ")
                .prefix(80)
            let proposedName = serverName?.hasSuffix(".docx") == true
                ? serverName!
                : "\(fallbackTitle.isEmpty ? "Coaching Session" : String(fallbackTitle)) Transcript.docx"
            let safeName = proposedName
                .components(separatedBy: CharacterSet(charactersIn: "/\\:"))
                .joined(separator: "-")
            let reportURL = FileManager.default.temporaryDirectory
                .appendingPathComponent("quipsly-\(UUID().uuidString.lowercased())-\(safeName)")
            try data.write(to: reportURL, options: [.atomic, .completeFileProtection])
            mentorReportURL = reportURL
            message = "Mentor report ready to share. Nothing has been sent yet."
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func removePreparedMentorReport() {
        if let mentorReportURL {
            try? FileManager.default.removeItem(at: mentorReportURL)
        }
        mentorReportURL = nil
    }

    func acceptHumanCorrection(
        roomID: String,
        segment: CaptureTranscriptSegment,
        correctedText: String,
        correctedSpeaker: String,
        reason: String,
        playbackPosition: TimeInterval?,
        previewOnly: Bool
    ) async -> Bool {
        guard !previewOnly else {
            errorMessage = "Preview transcript changes are intentionally disabled."
            return false
        }
        do {
            _ = try reviewDecisionOutbox.enqueueCorrection(
                roomID: roomID,
                segmentID: segment.id,
                expectedProviderText: segment.providerText,
                expectedProviderSpeakerLabel: segment.providerSpeakerLabel,
                expectedAcceptedCorrectionID: segment.acceptedCorrection?.id,
                correctedText: correctedText,
                correctedSpeakerLabel: correctedSpeaker,
                reason: reason,
                playbackPositionSeconds: playbackPosition
            )
            VoiceWritingRecognitionPreferences.shared.learnCorrection(
                from: segment.text,
                to: correctedText
            )
            publishOutboxCounts()
            errorMessage = nil
            message = "Correction saved on \(CaptureDeviceVocabulary.thisDevice) and syncing to Nest."
            if AuthManager.shared.networkActionsAllowed {
                _ = await flushReviewDecisions()
                if reviewDecisionOutbox.decision(roomID: roomID, segmentID: segment.id) == nil {
                    await reloadActiveDesk(roomID: roomID)
                    if errorMessage == nil { message = "Transcript correction saved." }
                }
            }
            return true
        } catch {
            errorMessage = error.localizedDescription
            publishOutboxCounts()
            return false
        }
    }

    func confirmSegmentAsIs(
        roomID: String,
        segment: CaptureTranscriptSegment,
        playbackPosition: TimeInterval,
        previewOnly: Bool
    ) async -> Bool {
        guard !previewOnly else {
            errorMessage = "Preview transcript review is intentionally disabled."
            return false
        }
        do {
            _ = try reviewDecisionOutbox.enqueueConfirmation(
                roomID: roomID,
                segmentID: segment.id,
                expectedProviderText: segment.providerText,
                expectedProviderSpeakerLabel: segment.providerSpeakerLabel,
                expectedAcceptedCorrectionID: segment.acceptedCorrection?.id,
                playbackPositionSeconds: playbackPosition
            )
            publishOutboxCounts()
            errorMessage = nil
            message = "As-heard confirmation protected on \(CaptureDeviceVocabulary.thisDevice) and waiting for exact Nest acknowledgement."
            if AuthManager.shared.networkActionsAllowed {
                _ = await flushReviewDecisions()
                if reviewDecisionOutbox.decision(roomID: roomID, segmentID: segment.id) == nil {
                    await reloadActiveDesk(roomID: roomID)
                    if errorMessage == nil {
                        message = "Segment confirmed as heard. Provider evidence stayed unchanged."
                    }
                }
            }
            return true
        } catch {
            errorMessage = error.localizedDescription
            publishOutboxCounts()
            return false
        }
    }

    func identifyProviderSpeaker(
        roomID: String,
        transcriptJobID: String,
        group: CaptureTranscriptSpeakerGroup,
        participantID: String,
        samplePositions: [String: TimeInterval],
        previewOnly: Bool
    ) async -> Bool {
        guard !previewOnly else {
            errorMessage = "Preview voice identities are intentionally disabled."
            return false
        }
        let samples = group.samples.compactMap { sample -> PendingTranscriptSpeakerSample? in
            guard let position = samplePositions[sample.segmentId] else { return nil }
            return .init(segmentID: sample.segmentId, playbackPositionSeconds: position)
        }
        do {
            _ = try speakerAttributionOutbox.enqueue(
                roomID: roomID,
                transcriptJobID: transcriptJobID,
                providerSpeakerLabel: group.providerSpeakerLabel,
                participantID: participantID,
                expectedProviderSnapshotSHA256: group.providerSnapshotSha256,
                samples: samples
            )
            publishOutboxCounts()
            errorMessage = nil
            message = "Voice identity review protected on \(CaptureDeviceVocabulary.thisDevice) and waiting for exact Nest acknowledgement. No words were marked reviewed."
            if AuthManager.shared.networkActionsAllowed {
                _ = await flushSpeakerAttributions()
                if pendingSpeakerAttribution(
                    roomID: roomID,
                    providerSpeakerLabel: group.providerSpeakerLabel
                ) == nil {
                    await reloadActiveDesk(roomID: roomID)
                    if errorMessage == nil {
                        message = "Voice identified from protected playback samples. No words were marked reviewed."
                    }
                }
            }
            return true
        } catch {
            errorMessage = error.localizedDescription
            publishOutboxCounts()
            return false
        }
    }

    func reviewAIProposal(
        roomID: String,
        segment: CaptureTranscriptSegment,
        proposal: CaptureTranscriptCorrection,
        decision: String,
        playbackPosition: TimeInterval?,
        previewOnly: Bool
    ) async {
        guard !previewOnly, !isUsingProtectedCache else {
            errorMessage = isUsingProtectedCache
                ? "Reconnect to Nest before reviewing an AI proposal. The protected snapshot was not modified."
                : "Preview AI proposals cannot be accepted or rejected."
            return
        }
        var body: [String: Any] = [
            "operation": "review-ai-proposal",
            "roomId": roomID,
            "correctionId": proposal.id,
            "decision": decision,
            "expectedAcceptedCorrectionId": captureTranscriptJSONNullable(segment.acceptedCorrection?.id),
            "confirmedAgainstPlayback": decision == "accept",
            "reviewNote": decision == "accept"
                ? "Reviewed against the exact retained device recording asset."
                : "Rejected from Quipsly Capture; proposal preserved in correction history.",
        ]
        if let playbackPosition { body["playbackPositionSeconds"] = playbackPosition }
        await mutate(
            roomID: roomID,
            body: body,
            success: decision == "accept" ? "AI proposal accepted after playback review." : "AI proposal rejected and preserved."
        )
    }

    func createTask(
        roomID: String,
        segment: CaptureTranscriptSegment,
        title: String,
        detail: String,
        clientRequestID: String,
        previewOnly: Bool
    ) async -> Bool {
        guard !previewOnly, !isUsingProtectedCache, AuthManager.shared.networkActionsAllowed else {
            errorMessage = previewOnly
                ? "Preview transcript tasks are intentionally disabled."
                : "Reconnect to Nest before creating a task from transcript evidence."
            return false
        }
        guard let url = URL(string: "\(baseURL)/api/mobile/capture/transcripts/tasks") else {
            errorMessage = "The configured Nest URL is invalid."
            return false
        }
        isMutating = true
        errorMessage = nil
        defer { isMutating = false }
        do {
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: [
                "roomId": roomID,
                "segmentId": segment.id,
                "clientRequestId": clientRequestID,
                "expectedProviderTextSha256": segment.providerTextSha256,
                "title": title.trimmingCharacters(in: .whitespacesAndNewlines),
                "detail": detail.trimmingCharacters(in: .whitespacesAndNewlines),
                "surface": "ios-capture-transcript-review",
            ])
            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            let payload = try JSONDecoder().decode(CaptureTranscriptTaskMutationResponse.self, from: data)
            guard response.statusCode < 400, payload.ok, let task = payload.task else {
                throw captureTranscriptError(data: data, fallback: payload.error ?? "The task could not be created.")
            }
            message = payload.idempotentReplay == true
                ? "That source-linked task was already created."
                : "Task created in Today and Work: \(task.title)"
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func createGoal(
        roomID: String,
        segment: CaptureTranscriptSegment,
        title: String,
        description: String,
        clientRequestID: String,
        previewOnly: Bool
    ) async -> Bool {
        guard !previewOnly, !isUsingProtectedCache, AuthManager.shared.networkActionsAllowed else {
            errorMessage = previewOnly
                ? "Preview transcript goals are intentionally disabled."
                : "Reconnect to Nest before creating a goal from transcript evidence."
            return false
        }
        guard let url = URL(string: "\(baseURL)/api/mobile/capture/transcripts/goals") else {
            errorMessage = "The configured Nest URL is invalid."
            return false
        }
        isMutating = true
        errorMessage = nil
        defer { isMutating = false }
        do {
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: [
                "roomId": roomID,
                "segmentId": segment.id,
                "clientRequestId": clientRequestID,
                "expectedProviderTextSha256": segment.providerTextSha256,
                "title": title.trimmingCharacters(in: .whitespacesAndNewlines),
                "description": description.trimmingCharacters(in: .whitespacesAndNewlines),
                "surface": "ios-capture-transcript-review",
            ])
            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            let payload = try JSONDecoder().decode(CaptureTranscriptGoalMutationResponse.self, from: data)
            guard response.statusCode < 400, payload.ok, let goal = payload.goal else {
                throw captureTranscriptError(data: data, fallback: payload.error ?? "The goal could not be created.")
            }
            message = payload.idempotentReplay == true
                ? "That source-linked goal was already created."
                : "Goal created in Work: \(goal.title)"
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func createNote(
        roomID: String,
        segment: CaptureTranscriptSegment,
        title: String,
        body: String,
        kind: MobileSessionNoteKind,
        visibility: MobileSessionNoteVisibility,
        clientRequestID: String,
        previewOnly: Bool
    ) async -> Bool {
        guard !previewOnly, !isUsingProtectedCache, AuthManager.shared.networkActionsAllowed else {
            errorMessage = previewOnly
                ? "Preview transcript notes are intentionally disabled."
                : "Reconnect to Nest before saving a note from transcript evidence."
            return false
        }
        guard let url = URL(string: "\(baseURL)/api/mobile/capture/transcripts/notes") else {
            errorMessage = "The configured Nest URL is invalid."
            return false
        }
        isMutating = true
        errorMessage = nil
        defer { isMutating = false }
        do {
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: [
                "roomId": roomID,
                "segmentId": segment.id,
                "clientRequestId": clientRequestID,
                "expectedProviderTextSha256": segment.providerTextSha256,
                "title": title.trimmingCharacters(in: .whitespacesAndNewlines),
                "body": body.trimmingCharacters(in: .whitespacesAndNewlines),
                "kind": kind.rawValue,
                "visibility": visibility.rawValue,
                "surface": "ios-capture-transcript-review",
            ])
            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            let payload = try JSONDecoder().decode(CaptureTranscriptNoteMutationResponse.self, from: data)
            guard response.statusCode < 400, payload.ok, let note = payload.note else {
                throw captureTranscriptError(data: data, fallback: payload.error ?? "The source-linked Session note could not be saved.")
            }
            message = payload.idempotentReplay == true
                ? "That exact source-linked Session note was already saved."
                : "\(MobileSessionNoteKind(rawValue: note.kind)?.title ?? "Session note") saved for \(MobileSessionNoteVisibility(rawValue: note.visibility)?.title.lowercased() ?? "review"). Nothing was sent."
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func reviewPacketNote(
        candidate: CapturePacketNoteCandidate,
        decision: String,
        title: String? = nil,
        body noteBody: String? = nil,
        kind: MobileSessionNoteKind? = nil,
        visibility: MobileSessionNoteVisibility? = nil,
        mergeTarget: CapturePacketNoteMergeTarget? = nil,
        mergedTitle: String? = nil,
        mergedBody: String? = nil,
        mergedKind: MobileSessionNoteKind? = nil,
        mergedVisibility: MobileSessionNoteVisibility? = nil,
        previewOnly: Bool
    ) async -> Bool {
        guard !previewOnly, !isUsingProtectedCache, AuthManager.shared.networkActionsAllowed else {
            errorMessage = previewOnly
                ? "Preview packet notes are intentionally disabled."
                : "Reconnect to Nest before saving a packet note."
            return false
        }
        guard let url = URL(string: "\(baseURL)/api/mobile/capture/transcripts/notes") else {
            errorMessage = "The configured Nest URL is invalid."
            return false
        }
        isMutating = true
        errorMessage = nil
        defer { isMutating = false }
        do {
            let normalizedDecision = decision.uppercased()
            guard ["ACCEPT", "EDIT", "MERGE", "DEFER", "REJECT"].contains(normalizedDecision) else {
                throw captureTranscriptClientError("Choose whether to save, edit, merge, defer, or reject this note candidate.")
            }
            var requestBody: [String: Any] = [
                "roomId": candidate.roomId,
                "segmentId": candidate.segmentId,
                "clientRequestId": candidate.clientRequestId,
                "expectedProviderTextSha256": candidate.providerTextSha256,
                "decision": normalizedDecision,
                "surface": "ios-capture-session-packet-review",
                "transcriptJobId": candidate.transcriptJobId,
                "recordingAssetId": candidate.recordingAssetId,
                "summaryNoteId": candidate.summaryNoteId,
                "packetBuildId": candidate.packetBuildId,
                "packetNoteCandidateId": candidate.id,
                "packetLaneId": candidate.laneId,
            ]
            if let title { requestBody["title"] = title.trimmingCharacters(in: .whitespacesAndNewlines) }
            if let noteBody { requestBody["body"] = noteBody.trimmingCharacters(in: .whitespacesAndNewlines) }
            if let kind { requestBody["kind"] = kind.rawValue }
            if let visibility { requestBody["visibility"] = visibility.rawValue }
            if normalizedDecision == "MERGE" {
                guard let mergeTarget,
                      let mergedTitle,
                      let mergedBody,
                      !mergedBody.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                      let mergedKind,
                      let mergedVisibility else {
                    throw captureTranscriptClientError("Choose an existing note and review the complete merged note before saving.")
                }
                requestBody["mergeTargetNoteId"] = mergeTarget.id
                requestBody["mergeExpectedUpdatedAt"] = mergeTarget.updatedAt
                requestBody["mergedTitle"] = mergedTitle.trimmingCharacters(in: .whitespacesAndNewlines)
                requestBody["mergedBody"] = mergedBody.trimmingCharacters(in: .whitespacesAndNewlines)
                requestBody["mergedKind"] = mergedKind.rawValue
                requestBody["mergedVisibility"] = mergedVisibility.rawValue
            }
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: requestBody)
            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            let payload = try JSONDecoder().decode(CaptureTranscriptNoteMutationResponse.self, from: data)
            let expectedStatus = switch normalizedDecision {
            case "ACCEPT": "ACCEPTED_AS_NOTE"
            case "MERGE": "MERGED_INTO_NOTE"
            case "EDIT": "EDITED_FOR_REVIEW"
            case "REJECT": "REJECTED_BY_HUMAN"
            default: "DEFERRED_BY_HUMAN"
            }
            guard response.statusCode < 400,
                  payload.ok,
                  payload.decision == normalizedDecision,
                  payload.reviewStatus == expectedStatus,
                  let receipt = payload.receipt,
                  receipt.decision == normalizedDecision,
                  receipt.packetNoteCandidateId == candidate.id,
                  let boundaries = payload.boundaries,
                  boundaries.packetCandidateReviewed,
                  boundaries.packetSnapshotRechecked,
                  boundaries.humanReviewedSourceRequiredForInternalWork == false,
                  !boundaries.taskCreated,
                  !boundaries.goalCreated,
                  !boundaries.calendarMutated,
                  !boundaries.messageSent,
                  !boundaries.externalDelivery,
                  !boundaries.publication else {
                throw captureTranscriptError(data: data, fallback: payload.error ?? "Nest returned incomplete note-review evidence.")
            }
            if normalizedDecision == "ACCEPT" || normalizedDecision == "MERGE" {
                guard let note = payload.note, receipt.noteId == note.id else {
                    throw captureTranscriptClientError("Nest acknowledged canonical note work without one matching note.")
                }
                if normalizedDecision == "MERGE" {
                    guard !boundaries.noteCreated, boundaries.noteRevised == (payload.idempotentReplay == true ? false : true) else {
                        throw captureTranscriptClientError("Nest returned incomplete revision evidence for this merge.")
                    }
                    message = payload.idempotentReplay == true
                        ? "That exact candidate merge was already applied; no revision was duplicated."
                        : "Candidate merged into one existing Session note as a recoverable revision\(payload.governance.map { " under governed receipt \($0.shortActionID)" } ?? ""). Nothing was sent."
                } else {
                    message = payload.idempotentReplay == true
                        ? "That exact packet note choice was already accepted."
                        : "\(MobileSessionNoteKind(rawValue: note.kind)?.title ?? "Session note") saved for \(MobileSessionNoteVisibility(rawValue: note.visibility)?.title.lowercased() ?? "review")\(payload.governance.map { " under governed receipt \($0.shortActionID)" } ?? ""). Nothing was sent."
                }
            } else {
                guard payload.note == nil, receipt.noteId == nil, !boundaries.noteCreated else {
                    throw captureTranscriptClientError("Nest created a note for a non-canonical review decision. The response was rejected.")
                }
                let action = normalizedDecision == "EDIT"
                    ? "Edited draft saved for review"
                    : normalizedDecision == "DEFER"
                        ? "Candidate deferred"
                        : "Candidate rejected"
                message = payload.idempotentReplay == true
                    ? "That exact \(action.lowercased()) decision was already preserved."
                    : "\(action) in packet history. No canonical note, task, goal, calendar event, message, or delivery was created."
            }
            await loadPacketCandidates(roomID: candidate.roomId)
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func reviewPacketGoal(
        candidate: CapturePacketGoalCandidate,
        decision: String,
        title: String?,
        description: String?,
        targetAt: Date? = nil,
        tagIDs: [String]? = nil,
        mergeTarget: CapturePacketGoalMergeTarget? = nil,
        previewOnly: Bool
    ) async -> Bool {
        guard !previewOnly, !isUsingProtectedCache, AuthManager.shared.networkActionsAllowed else {
            errorMessage = previewOnly
                ? "Preview packet goal decisions are intentionally disabled."
                : "Reconnect to Nest before reviewing a packet goal candidate."
            return false
        }
        guard let context = packetGoalReviewContext,
              context.packetBuildId == candidate.packetBuildId,
              let url = URL(string: "\(baseURL)/api/mobile/capture/transcripts/packet/goals") else {
            errorMessage = "Refresh the packet before reviewing this goal candidate."
            return false
        }
        isMutating = true
        errorMessage = nil
        defer { isMutating = false }
        do {
            let normalizedDecision = decision.uppercased()
            var body: [String: Any] = [
                "callRoomId": candidate.roomId,
                "transcriptJobId": candidate.transcriptJobId,
                "recordingAssetId": candidate.recordingAssetId,
                "summaryNoteId": context.summaryNoteId,
                "packetBuildId": context.packetBuildId,
                "goalCandidateId": candidate.id,
                "decision": normalizedDecision,
            ]
            if normalizedDecision != "MERGE", let title { body["title"] = title.trimmingCharacters(in: .whitespacesAndNewlines) }
            if normalizedDecision != "MERGE", let description { body["description"] = description.trimmingCharacters(in: .whitespacesAndNewlines) }
            if normalizedDecision == "ACCEPT" {
                body["targetAt"] = targetAt.map { ISO8601DateFormatter().string(from: $0) } ?? NSNull()
                body["tagIds"] = Array(Set(tagIDs ?? [])).sorted()
            }
            if normalizedDecision == "MERGE" {
                guard let mergeTarget else {
                    throw captureTranscriptClientError("Choose one current existing goal before adding evidence.")
                }
                body["mergeTargetGoalId"] = mergeTarget.id
                body["mergeExpectedUpdatedAt"] = mergeTarget.updatedAt
            }
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            let payload = try JSONDecoder().decode(CaptureTranscriptGoalMutationResponse.self, from: data)
            let requiresGoal = normalizedDecision == "ACCEPT" || normalizedDecision == "MERGE"
            guard response.statusCode < 400,
                  payload.ok,
                  payload.decision == normalizedDecision,
                  !requiresGoal || payload.goal != nil else {
                throw captureTranscriptError(data: data, fallback: payload.error ?? "The goal review decision could not be saved.")
            }
            if normalizedDecision == "MERGE" {
                guard let target = mergeTarget,
                      let goal = payload.goal,
                      goal.id == target.id,
                      let receipt = payload.receipt,
                      receipt.decision == "MERGE",
                      receipt.goalCandidateId == candidate.id,
                      receipt.goalId == target.id,
                      receipt.goalProgressReceiptId != nil,
                      payload.boundaries?.mergeAppendsOneActorOwnedGoalEvidenceReceipt == true,
                      payload.boundaries?.mergeChangesNoGoalDefinitionStatusTargetOrTags == true,
                      payload.boundaries?.taskCreated != true,
                      payload.boundaries?.targetDateCreated != true,
                      payload.boundaries?.projectTagsApplied != true,
                      payload.boundaries?.reminderCreated != true,
                      payload.boundaries?.calendarMutated != true,
                      payload.boundaries?.externalDelivery != true,
                      payload.boundaries?.publication != true else {
                    throw captureTranscriptClientError("Nest returned incomplete or unsafe evidence-merge proof.")
                }
                message = payload.idempotentReplay == true
                    ? "That exact transcript evidence was already attached to this goal; nothing was duplicated."
                    : "Reviewed transcript evidence was added to \(goal.title). Its definition, status, target, tags, tasks, and project did not change."
            } else {
                message = normalizedDecision == "ACCEPT"
                ? (payload.idempotentReplay == true
                    ? "That exact packet goal choice was already accepted."
                    : "One source-linked goal was created\(payload.goal?.targetAt == nil ? "" : " with its target date")\((payload.goal?.tags?.isEmpty == false) ? " and project tags" : ""). No task, focus block, calendar event, message, or delivery was added.")
                : "\(normalizedDecision.capitalized) saved in packet history. No goal or task was created."
            }
            await loadPacketCandidates(roomID: candidate.roomId)
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func reviewPacketAction(
        candidate: CapturePacketActionCandidate,
        decision: String,
        title: String?,
        detail: String?,
        assignToMe: Bool? = nil,
        dueAt: Date? = nil,
        tagIDs: [String]? = nil,
        mergeTarget: CapturePacketTaskMergeTarget? = nil,
        previewOnly: Bool
    ) async -> Bool {
        guard !previewOnly, !isUsingProtectedCache, AuthManager.shared.networkActionsAllowed else {
            errorMessage = previewOnly
                ? "Preview packet task decisions are intentionally disabled."
                : "Reconnect to Nest before reviewing a packet task candidate."
            return false
        }
        guard let context = packetGoalReviewContext,
              context.packetBuildId == candidate.packetBuildId,
              let url = URL(string: "\(baseURL)/api/mobile/capture/transcripts/packet/actions") else {
            errorMessage = "Refresh the packet before reviewing this task candidate."
            return false
        }
        isMutating = true
        errorMessage = nil
        defer { isMutating = false }
        do {
            var body: [String: Any] = [
                "callRoomId": candidate.roomId,
                "transcriptJobId": candidate.transcriptJobId,
                "recordingAssetId": candidate.recordingAssetId,
                "summaryNoteId": context.summaryNoteId,
                "packetBuildId": context.packetBuildId,
                "actionCandidateId": candidate.id,
                "decision": decision,
            ]
            if let title { body["title"] = title.trimmingCharacters(in: .whitespacesAndNewlines) }
            if let detail { body["detail"] = detail.trimmingCharacters(in: .whitespacesAndNewlines) }
            if decision == "ACCEPT" {
                body["assignToMe"] = assignToMe ?? false
                body["dueAt"] = dueAt.map { ISO8601DateFormatter().string(from: $0) } ?? NSNull()
                body["tagIds"] = Array(Set(tagIDs ?? [])).sorted()
            } else if decision == "MERGE", let mergeTarget {
                body["mergeTargetTaskId"] = mergeTarget.id
                body["mergeExpectedUpdatedAt"] = mergeTarget.updatedAt
            }
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            let payload = try JSONDecoder().decode(CapturePacketActionMutationResponse.self, from: data)
            let requiresTask = decision == "ACCEPT" || decision == "MERGE"
            guard response.statusCode < 400, payload.ok, !requiresTask || payload.actionItem != nil else {
                throw captureTranscriptError(data: data, fallback: payload.error ?? "The task review decision could not be saved.")
            }
            if decision == "MERGE" {
                guard let mergeTarget,
                      payload.decision == "MERGE",
                      payload.actionItem?.id == mergeTarget.id,
                      payload.receipt?.decision == "MERGE",
                      payload.receipt?.actionCandidateId == candidate.id,
                      payload.receipt?.actionItemId == mergeTarget.id,
                      payload.receipt?.taskEvidenceReceiptId?.isEmpty == false,
                      payload.boundaries?.mergeAppendsOneActorOwnedTaskEvidenceReceipt == true,
                      payload.boundaries?.mergeChangesNoTaskIdentityStatusOwnerDatesReminderRecurrenceTagsGoalsOrProject == true,
                      payload.boundaries?.dueDateCreated != true,
                      payload.boundaries?.projectTagsApplied != true else {
                    throw NSError(domain: "QuipslyCapture.PacketTaskReview", code: 1, userInfo: [NSLocalizedDescriptionKey: "Nest returned incomplete or unsafe task evidence-merge proof."])
                }
                message = payload.idempotentReplay == true
                    ? "That exact transcript evidence was already attached to this task; nothing was duplicated."
                    : "Reviewed transcript evidence was added to \(mergeTarget.title). Its identity, status, owner, dates, reminder, recurrence, tags, goals, and project did not change."
            } else {
                message = decision == "ACCEPT"
                ? (payload.idempotentReplay == true
                    ? "That exact packet task choice was already accepted."
                    : "One \(payload.actionItem?.assignedUserId == nil ? "unassigned" : "actor-owned") source-linked task was created\(payload.actionItem?.dueAt == nil ? "" : " with a due date")\((payload.actionItem?.tagIds?.isEmpty == false) ? " and project tags" : ""). No reminder, calendar event, message, or delivery was added.")
                : "\(decision.capitalized) saved in packet history. No task was created."
            }
            await loadPacketCandidates(roomID: candidate.roomId)
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    private func loadPacketCandidates(roomID: String) async {
        guard AuthManager.shared.networkActionsAllowed,
              var components = URLComponents(string: "\(baseURL)/api/mobile/capture/transcripts/packet") else {
            packetGoalCandidates = []
            packetGoalMergeTargets = []
            packetNoteCandidates = []
            packetNoteMergeTargets = []
            packetActionCandidates = []
            packetTaskMergeTargets = []
            packetTaskTags = []
            packetTaskProjectName = nil
            packetResults = nil
            packetGoalReviewContext = nil
            packetStatus = nil
            resetPacketReviewState()
            return
        }
        components.queryItems = [URLQueryItem(name: "callRoomId", value: roomID)]
        guard let url = components.url else { return }
        do {
            var request = URLRequest(url: url)
            request.cachePolicy = .reloadIgnoringLocalCacheData
            request.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            guard response.statusCode < 400 else {
                throw captureTranscriptError(data: data, fallback: "Packet goal candidates could not load.")
            }
            let payload = try JSONDecoder().decode(CapturePacketGoalReviewEnvelope.self, from: data)
            guard payload.ok else { throw captureTranscriptError(data: data, fallback: payload.error ?? "Packet goal candidates could not load.") }
            packetGoalCandidates = payload.packet?.goalCandidates ?? []
            packetGoalMergeTargets = payload.packet?.goalMergeTargets ?? []
            packetNoteCandidates = payload.packet?.noteCandidates ?? []
            packetNoteMergeTargets = payload.packet?.noteMergeTargets ?? []
            packetActionCandidates = payload.packet?.actionCandidates ?? []
            packetTaskMergeTargets = payload.packet?.taskMergeTargets ?? []
            packetTaskTags = payload.packet?.taskMaterialization?.tags ?? []
            packetTaskProjectName = payload.packet?.taskMaterialization?.project?.name
            packetResults = payload.packet?.results
            packetStatus = payload.packet?.status
            canReviewPrivatePacket = payload.packet?.reviewAccess?.canReviewPrivatePacket
                ?? (payload.packet?.status?.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() != "PRIVATE_REVIEWER_ONLY")
            privatePacketBoundary = payload.packet?.reviewAccess?.boundary
            packetSegmentCount = payload.packet?.transcriptReview?.segmentCount ?? 0
            packetReviewedSegmentCount = payload.packet?.transcriptReview?.humanReviewedSegmentCount ?? 0
            packetProviderOnlySegmentCount = payload.packet?.transcriptReview?.providerOnlySegmentCount ?? 0
            packetSnapshotStale = payload.packet?.transcriptReview?.packetStale ?? false
            packetSnapshotSHA256 = payload.packet?.transcriptReview?.snapshotSha256
            if !packetNeedsRebuild,
               let summaryNoteId = payload.packet?.summary?.id,
               let packetBuildId = payload.packet?.build?.packetBuildId,
               !summaryNoteId.isEmpty,
               !packetBuildId.isEmpty {
                packetGoalReviewContext = .init(summaryNoteId: summaryNoteId, packetBuildId: packetBuildId)
            } else {
                packetGoalReviewContext = nil
            }
            packetReviewError = nil
            if !packetNeedsRebuild, packetStatus != "PACKET_READY_TO_BUILD" {
                followUpPreparationFailed = false
            }
        } catch {
            packetGoalCandidates = []
            packetGoalMergeTargets = []
            packetNoteCandidates = []
            packetNoteMergeTargets = []
            packetActionCandidates = []
            packetTaskMergeTargets = []
            packetTaskTags = []
            packetTaskProjectName = nil
            packetResults = nil
            packetGoalReviewContext = nil
            packetStatus = nil
            canReviewPrivatePacket = true
            privatePacketBoundary = nil
            resetPacketReviewState()
            packetReviewError = error.localizedDescription
        }
    }

    func buildCurrentPacket(roomID: String, previewOnly: Bool) async -> Bool {
        guard canReviewPrivatePacket else {
            errorMessage = "Private follow-up review stays with this Session's coach. You can keep reviewing the shared transcript."
            return false
        }
        guard !previewOnly, !isUsingProtectedCache, AuthManager.shared.networkActionsAllowed else {
            errorMessage = previewOnly
                ? "Preview packet builds are intentionally disabled."
                : "Reconnect to Nest before rebuilding this transcript packet."
            return false
        }
        return await prepareCurrentPacket(roomID: roomID, automatic: false)
    }

    private func prepareFollowUpIfNeeded(roomID: String) async {
        let status = packetStatus?.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() ?? ""
        guard canReviewPrivatePacket,
              status == "PACKET_READY_TO_BUILD" || packetNeedsRebuild,
              let transcriptJobID = desk?.transcriptJobId?.nonemptyTranscriptValue else {
            return
        }
        let attemptKey = "\(transcriptJobID):\(packetSnapshotSHA256 ?? (packetNeedsRebuild ? "stale" : "missing"))"
        guard automaticPacketAttemptKeys.insert(attemptKey).inserted else { return }
        _ = await prepareCurrentPacket(roomID: roomID, automatic: true)
    }

    private func prepareCurrentPacket(roomID: String, automatic: Bool) async -> Bool {
        guard let transcriptJobID = desk?.transcriptJobId?.nonemptyTranscriptValue,
              let url = URL(string: "\(baseURL)/api/mobile/capture/transcripts/packet") else {
            errorMessage = "A completed transcript is required before Quipsly can prepare the follow-up."
            followUpPreparationFailed = true
            return false
        }
        isMutating = true
        errorMessage = nil
        followUpPreparationFailed = false
        message = "Preparing your follow-up…"
        defer { isMutating = false }
        do {
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: [
                "transcriptJobId": transcriptJobID,
                "force": false,
            ])
            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            let payload = try JSONDecoder().decode(MobileCapturePacketBuildResponse.self, from: data)
            guard response.statusCode < 400, payload.ok else {
                throw captureTranscriptError(data: data, fallback: payload.error ?? "The current packet could not be built.")
            }
            await loadPacketCandidates(roomID: roomID)
            followUpPreparationFailed = false
            message = payload.reusedExistingPacket == true
                ? "Your Session results are ready."
                : "Quipsly created editable notes, tasks, and goals from this Session."
            return true
        } catch {
            followUpPreparationFailed = true
            errorMessage = automatic
                ? "Quipsly could not prepare the follow-up yet. Your transcript is safe; try again below."
                : error.localizedDescription
            return false
        }
    }

    private func resetPacketReviewState() {
        packetStatus = nil
        canReviewPrivatePacket = true
        privatePacketBoundary = nil
        packetSegmentCount = 0
        packetReviewedSegmentCount = 0
        packetProviderOnlySegmentCount = 0
        packetSnapshotStale = false
        packetSnapshotSHA256 = nil
    }

    func retryHeldDecision(_ id: UUID, roomID: String) async {
        reviewDecisionOutbox.releaseForRetry(id)
        publishOutboxCounts()
        _ = await flushReviewDecisions()
        if reviewDecisionOutbox.entries.contains(where: { $0.id == id }) == false {
            await reloadActiveDesk(roomID: roomID)
        }
    }

    func retryHeldSpeakerAttribution(_ id: UUID, roomID: String) async {
        speakerAttributionOutbox.releaseForRetry(id)
        publishOutboxCounts()
        _ = await flushSpeakerAttributions()
        if speakerAttributionOutbox.entries.contains(where: { $0.id == id }) == false {
            await reloadActiveDesk(roomID: roomID)
        }
    }

    @discardableResult
    private func flushReviewDecisions() async -> Bool {
        guard !isFlushingReviewDecisions,
              AuthManager.shared.networkActionsAllowed else {
            publishOutboxCounts()
            return false
        }
        isFlushingReviewDecisions = true
        isMutating = true
        defer {
            isFlushingReviewDecisions = false
            isMutating = false
            publishOutboxCounts()
        }
        var synchronizedAny = false
        for decision in reviewDecisionOutbox.entries where decision.disposition == .pending {
            if await syncReviewDecision(decision) {
                synchronizedAny = true
            }
        }
        return synchronizedAny
    }

    private func syncReviewDecision(_ decision: PendingTranscriptReviewDecision) async -> Bool {
        guard let url = URL(string: "\(baseURL)/api/mobile/capture/transcripts/corrections") else {
            let message = "The configured Nest URL is invalid."
            reviewDecisionOutbox.markHeld(decision.id, code: "INVALID_NEST_URL", message: message)
            errorMessage = message
            return false
        }
        do {
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            var body: [String: Any] = [
                "operation": decision.operation.rawValue,
                "roomId": decision.roomID,
                "segmentId": decision.segmentID,
                "clientRequestId": decision.clientRequestID,
                "expectedText": decision.expectedProviderText,
                "expectedSpeakerLabel": captureTranscriptJSONNullable(decision.expectedProviderSpeakerLabel),
                "expectedAcceptedCorrectionId": captureTranscriptJSONNullable(decision.expectedAcceptedCorrectionID),
                "confirmedAgainstPlayback": decision.playbackPositionSeconds != nil,
            ]
            if let playbackPositionSeconds = decision.playbackPositionSeconds {
                body["playbackPositionSeconds"] = playbackPositionSeconds
            }
            switch decision.operation {
            case .acceptHumanCorrection:
                body["correctedText"] = captureTranscriptJSONNullable(decision.correctedText)
                body["correctedSpeakerLabel"] = captureTranscriptJSONNullable(decision.correctedSpeakerLabel)
                body["reason"] = captureTranscriptJSONNullable(decision.reason)
            case .confirmSegmentAsIs:
                body["reviewNote"] = "Confirmed as-is in Quipsly Capture against the exact retained local recording."
            }
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            let payload = try? JSONDecoder().decode(CaptureTranscriptMutationResponse.self, from: data)
            guard response.statusCode < 400, payload?.ok == true else {
                let apiError = try? JSONDecoder().decode(CaptureTranscriptAPIError.self, from: data)
                let message = apiError?.error ?? "Nest could not reconcile this transcript decision."
                if response.statusCode == 408 || response.statusCode == 429 || response.statusCode >= 500 {
                    reviewDecisionOutbox.markRetryable(decision.id, message: message)
                    errorMessage = "Transcript decision remains protected for retry: \(message)"
                } else {
                    reviewDecisionOutbox.markHeld(
                        decision.id,
                        code: apiError?.errorCode,
                        message: message
                    )
                    errorMessage = "Transcript decision needs review before retry: \(message)"
                }
                return false
            }
            guard let payload,
                  payload.boundaries?.providerSegmentsImmutable == true,
                  payload.boundaries?.correctionOverlayVersioned == true,
                  payload.boundaries?.mediaTimeAnchorsPreserved == true else {
                let message = "Nest returned incomplete transcript safety boundaries. The protected phone decision is held for review."
                reviewDecisionOutbox.markHeld(
                    decision.id,
                    code: "ACKNOWLEDGEMENT_MISMATCH",
                    message: message
                )
                errorMessage = message
                return false
            }
            switch decision.operation {
            case .acceptHumanCorrection:
                guard payload.boundaries?.acceptedHumanCorrectionRequiresPlaybackConfirmation == false,
                      payload.boundaries?.directHumanCorrectionPreservesSourceAnchors == true,
                      let correction = payload.correction,
                      correction.segmentId == decision.segmentID,
                      correction.origin == "human",
                      correction.status == "accepted",
                      correction.correctedText == decision.correctedText,
                      correction.correctedSpeakerLabel == decision.correctedSpeakerLabel else {
                    let message = "Nest acknowledged different correction content or evidence. The protected phone decision is held for review."
                    reviewDecisionOutbox.markHeld(
                        decision.id,
                        code: "ACKNOWLEDGEMENT_MISMATCH",
                        message: message
                    )
                    errorMessage = message
                    return false
                }
            case .confirmSegmentAsIs:
                guard payload.boundaries?.confirmedAsIsRequiresPlaybackConfirmation == true,
                      let verification = payload.verification,
                      verification.segmentId == decision.segmentID,
                      verification.reviewKind == "confirmed-as-is" else {
                    let message = "Nest acknowledged different transcript verification evidence. The protected phone decision is held for review."
                    reviewDecisionOutbox.markHeld(
                        decision.id,
                        code: "ACKNOWLEDGEMENT_MISMATCH",
                        message: message
                    )
                    errorMessage = message
                    return false
                }
            }
            guard reviewDecisionOutbox.markAcknowledged(decision.id) else {
                let message = reviewDecisionOutbox.persistenceError
                    ?? "Nest acknowledged this transcript decision, but the protected phone ledger could not close it. It remains visible for safe idempotent recovery."
                errorMessage = message
                return false
            }
            publishOutboxCounts()
            return true
        } catch {
            reviewDecisionOutbox.markRetryable(decision.id, message: error.localizedDescription)
            errorMessage = "Transcript decision remains protected for retry: \(error.localizedDescription)"
            return false
        }
    }

    @discardableResult
    private func flushSpeakerAttributions() async -> Bool {
        guard !isFlushingSpeakerAttributions,
              AuthManager.shared.networkActionsAllowed else {
            publishOutboxCounts()
            return false
        }
        isFlushingSpeakerAttributions = true
        isMutating = true
        defer {
            isFlushingSpeakerAttributions = false
            isMutating = false
            publishOutboxCounts()
        }
        var synchronizedAny = false
        for attribution in speakerAttributionOutbox.entries where attribution.disposition == .pending {
            if await syncSpeakerAttribution(attribution) {
                synchronizedAny = true
            }
        }
        return synchronizedAny
    }

    private func syncSpeakerAttribution(_ decision: PendingTranscriptSpeakerAttribution) async -> Bool {
        guard let url = URL(string: "\(baseURL)/api/mobile/capture/transcripts/corrections") else {
            let message = "The configured Nest URL is invalid."
            speakerAttributionOutbox.markHeld(decision.id, code: "INVALID_NEST_URL", message: message)
            errorMessage = message
            return false
        }
        do {
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: [
                "operation": "attribute-provider-speaker",
                "roomId": decision.roomID,
                "providerSpeakerLabel": decision.providerSpeakerLabel,
                "participantId": decision.participantID,
                "clientRequestId": decision.clientRequestID,
                "expectedProviderSnapshotSha256": decision.expectedProviderSnapshotSHA256,
                "samples": decision.samples.map {
                    [
                        "segmentId": $0.segmentID,
                        "playbackPositionSeconds": $0.playbackPositionSeconds,
                    ]
                },
                "confirmedAgainstPlayback": true,
                "reviewNote": "Identified in Quipsly Capture from exact retained local recording samples. No transcript words were marked reviewed.",
            ])
            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            let payload = try? JSONDecoder().decode(CaptureTranscriptMutationResponse.self, from: data)
            guard response.statusCode < 400, payload?.ok == true else {
                let apiError = try? JSONDecoder().decode(CaptureTranscriptAPIError.self, from: data)
                let message = apiError?.error ?? "Nest could not reconcile this voice identity review."
                if response.statusCode == 408 || response.statusCode == 429 || response.statusCode >= 500 {
                    speakerAttributionOutbox.markRetryable(decision.id, message: message)
                    errorMessage = "Voice identity review remains protected for retry: \(message)"
                } else {
                    speakerAttributionOutbox.markHeld(decision.id, code: apiError?.errorCode, message: message)
                    errorMessage = "Voice identity review needs attention before retry: \(message)"
                }
                return false
            }
            guard let payload,
                  payload.boundaries?.providerSegmentsImmutable == true,
                  payload.boundaries?.mediaTimeAnchorsPreserved == true,
                  payload.boundaries?.speakerIdentitySeparateFromWordReview == true,
                  let attribution = payload.attribution,
                  attribution.providerSpeakerLabel == decision.providerSpeakerLabel,
                  attribution.participantId == decision.participantID,
                  attribution.providerSnapshotSha256 == decision.expectedProviderSnapshotSHA256,
                  attribution.sampleSegmentIds == decision.samples.map(\.segmentID) else {
                let message = "Nest returned different voice identity evidence. The protected phone review is held and no words are claimed as reviewed."
                speakerAttributionOutbox.markHeld(
                    decision.id,
                    code: "ACKNOWLEDGEMENT_MISMATCH",
                    message: message
                )
                errorMessage = message
                return false
            }
            guard speakerAttributionOutbox.markAcknowledged(decision.id) else {
                errorMessage = speakerAttributionOutbox.persistenceError
                    ?? "Nest acknowledged this voice identity, but the protected phone ledger could not close it. It remains visible for safe idempotent recovery."
                return false
            }
            publishOutboxCounts()
            return true
        } catch {
            speakerAttributionOutbox.markRetryable(decision.id, message: error.localizedDescription)
            errorMessage = "Voice identity review remains protected for retry: \(error.localizedDescription)"
            return false
        }
    }

    private func publishOutboxCounts() {
        guard let activeRoomID, !activeRoomID.isEmpty else {
            pendingTranscriptDecisionCount = 0
            heldTranscriptDecisionCount = 0
            pendingSpeakerAttributionCount = 0
            heldSpeakerAttributionCount = 0
            return
        }
        let transcriptDecisions = reviewDecisionOutbox.entries.filter { $0.roomID == activeRoomID }
        let speakerAttributions = speakerAttributionOutbox.entries.filter { $0.roomID == activeRoomID }
        pendingTranscriptDecisionCount = transcriptDecisions.filter { $0.disposition == .pending }.count
        heldTranscriptDecisionCount = transcriptDecisions.filter { $0.disposition == .held }.count
        pendingSpeakerAttributionCount = speakerAttributions.filter { $0.disposition == .pending }.count
        heldSpeakerAttributionCount = speakerAttributions.filter { $0.disposition == .held }.count
    }

    func acknowledgeDownstreamImpact(
        roomID: String,
        transcriptJobID: String,
        segment: CaptureTranscriptSegment,
        impact: CaptureTranscriptDownstreamImpact,
        previewOnly: Bool
    ) async {
        guard !previewOnly else {
            errorMessage = "Preview linked-work reviews are intentionally disabled."
            return
        }
        guard impact.needsReview, impact.canAcknowledge else {
            errorMessage = "Only the current linked-item owner can keep its content after reviewing the corrected source."
            return
        }
        let requestIdentity = [
            roomID,
            transcriptJobID,
            segment.id,
            impact.artifactKind,
            impact.artifactId,
            impact.currentCorrectionId ?? "provider",
            impact.artifactUpdatedAt,
        ].joined(separator: "|")
        let digest = SHA256.hash(data: Data(requestIdentity.utf8))
            .map { String(format: "%02x", $0) }
            .joined()
        await mutate(
            roomID: roomID,
            body: [
                "operation": "acknowledge-transcript-impact",
                "roomId": roomID,
                "transcriptJobId": transcriptJobID,
                "segmentId": segment.id,
                "artifactKind": impact.artifactKind,
                "artifactId": impact.artifactId,
                "clientRequestId": "iphone-transcript-impact-\(digest)",
                "expectedArtifactUpdatedAt": impact.artifactUpdatedAt,
                "expectedAcceptedCorrectionId": impact.currentCorrectionId ?? NSNull(),
                "expectedEffectiveText": impact.currentTextSnapshot,
                "expectedEffectiveSpeakerLabel": impact.currentSpeakerLabel ?? NSNull(),
                "confirmedContentStillValid": true,
            ],
            success: "Linked \(impact.kindLabel.lowercased()) reviewed against the corrected source. Its content stayed unchanged and Nest appended an audit receipt.",
            replay: "That exact linked-item review receipt was already saved."
        )
    }

    private func mutate(
        roomID: String,
        body: [String: Any],
        success: String,
        replay: String = "That reviewed correction was already saved."
    ) async {
        guard !isUsingProtectedCache, AuthManager.shared.networkActionsAllowed else {
            errorMessage = "Sign in with a stable Quipsly account before changing transcript review."
            return
        }
        guard let url = URL(string: "\(baseURL)/api/mobile/capture/transcripts/corrections") else {
            errorMessage = "The configured Nest URL is invalid."
            return
        }
        isMutating = true
        errorMessage = nil
        defer { isMutating = false }
        do {
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            guard response.statusCode < 400 else {
                throw captureTranscriptError(data: data, fallback: "Transcript review could not be saved.")
            }
            let payload = try JSONDecoder().decode(CaptureTranscriptMutationResponse.self, from: data)
            guard payload.ok else { throw captureTranscriptError(data: data, fallback: "Transcript review could not be saved.") }
            message = payload.idempotentReplay == true ? replay : success
            await reloadActiveDesk(roomID: roomID)
            if errorMessage == nil { message = payload.idempotentReplay == true ? replay : success }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    static func clearProtectedCache() {
        guard let directory = protectedCacheDirectoryURL() else { return }
        try? FileManager.default.removeItem(at: directory)
    }

    static func hasUsableProtectedCache(roomID: String) -> Bool {
        guard let ownerEmail = AuthManager.shared.userEmail?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased(),
              !ownerEmail.isEmpty,
              let url = protectedCacheURL(roomID: roomID),
              let data = try? Data(contentsOf: url, options: .mappedIfSafe) else {
            return false
        }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        guard let cache = try? decoder.decode(ProtectedCache.self, from: data) else {
            return false
        }
        let cacheAge = Date().timeIntervalSince(cache.savedAt)
        return cache.schemaVersion == 1
            && cache.ownerEmail == ownerEmail
            && cache.roomID == roomID
            && cacheAge >= -5 * 60
            && cacheAge <= 30 * 24 * 60 * 60
    }

    private func restoreProtectedCache(roomID: String) -> Bool {
        guard let ownerEmail = AuthManager.shared.userEmail?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
              !ownerEmail.isEmpty,
              let url = Self.protectedCacheURL(roomID: roomID),
              let data = try? Data(contentsOf: url, options: .mappedIfSafe) else { return false }
        do {
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            let cache = try decoder.decode(ProtectedCache.self, from: data)
            let cacheAge = Date().timeIntervalSince(cache.savedAt)
            guard cache.schemaVersion == 1,
                  cache.ownerEmail == ownerEmail,
                  cache.roomID == roomID,
                  cacheAge >= -5 * 60,
                  cacheAge <= 30 * 24 * 60 * 60 else {
                try? FileManager.default.removeItem(at: url)
                return false
            }
            desk = cache.desk
            isUsingProtectedCache = true
            message = nil
            return true
        } catch {
            try? FileManager.default.removeItem(at: url)
            return false
        }
    }

    private func persist(_ desk: CaptureTranscriptCorrectionDesk, roomID: String) {
        guard AuthManager.shared.networkActionsAllowed,
              let ownerEmail = AuthManager.shared.userEmail?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
              !ownerEmail.isEmpty,
              let url = Self.protectedCacheURL(roomID: roomID) else { return }
        do {
            try FileManager.default.createDirectory(
                at: url.deletingLastPathComponent(),
                withIntermediateDirectories: true,
                attributes: [.protectionKey: FileProtectionType.complete]
            )
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            encoder.outputFormatting = [.sortedKeys]
            try encoder.encode(ProtectedCache(schemaVersion: 1, ownerEmail: ownerEmail, roomID: roomID, savedAt: Date(), desk: desk))
                .write(to: url, options: [.atomic, .completeFileProtection])
            var values = URLResourceValues()
            values.isExcludedFromBackup = true
            var mutableURL = url
            try mutableURL.setResourceValues(values)
        } catch {
            print("Protected transcript cache could not be updated: \(error.localizedDescription)")
        }
    }

    nonisolated private static func protectedCacheDirectoryURL() -> URL? {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?
            .appendingPathComponent("QuipslyCapture/ProtectedTranscriptReview", isDirectory: true)
    }

    nonisolated private static func protectedCacheURL(roomID: String) -> URL? {
        let digest = SHA256.hash(data: Data(roomID.utf8)).map { String(format: "%02x", $0) }.joined()
        return protectedCacheDirectoryURL()?.appendingPathComponent("\(digest).json")
    }
}

private func captureTranscriptError(data: Data, fallback: String) -> NSError {
    let message = (try? JSONDecoder().decode(CaptureTranscriptAPIError.self, from: data).error) ?? fallback
    return NSError(domain: "CaptureTranscriptCorrection", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
}

private func captureTranscriptClientError(_ message: String) -> NSError {
    NSError(
        domain: "QuipslyCapture.TranscriptReview",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: message]
    )
}

private func captureTranscriptJSONNullable(_ value: String?) -> Any {
    value ?? NSNull()
}

private struct CaptureTranscriptCorrectionDraft: Codable {
    let schemaVersion: Int
    let ownerEmail: String
    let roomID: String
    let segmentID: String
    let providerTextSha256: String
    let correctedText: String
    let correctedSpeaker: String
    let reason: String
    let updatedAt: Date
}

@MainActor
enum CaptureTranscriptCorrectionDraftStore {
    fileprivate static func load(roomID: String, segment: CaptureTranscriptSegment) -> CaptureTranscriptCorrectionDraft? {
        guard let ownerEmail = currentOwnerEmail(),
              let url = fileURL(roomID: roomID, segmentID: segment.id),
              let data = try? Data(contentsOf: url, options: .mappedIfSafe) else { return nil }
        do {
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            let draft = try decoder.decode(CaptureTranscriptCorrectionDraft.self, from: data)
            guard draft.schemaVersion == 1,
                  draft.ownerEmail == ownerEmail,
                  draft.roomID == roomID,
                  draft.segmentID == segment.id,
                  draft.providerTextSha256 == segment.providerTextSha256,
                  Date().timeIntervalSince(draft.updatedAt) <= 30 * 24 * 60 * 60 else {
                try? FileManager.default.removeItem(at: url)
                return nil
            }
            return draft
        } catch {
            try? FileManager.default.removeItem(at: url)
            return nil
        }
    }

    static func save(
        roomID: String,
        segment: CaptureTranscriptSegment,
        correctedText: String,
        correctedSpeaker: String,
        reason: String
    ) -> Bool {
        guard let ownerEmail = currentOwnerEmail(), let url = fileURL(roomID: roomID, segmentID: segment.id) else { return false }
        do {
            try FileManager.default.createDirectory(
                at: url.deletingLastPathComponent(),
                withIntermediateDirectories: true,
                attributes: [.protectionKey: FileProtectionType.complete]
            )
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            encoder.outputFormatting = [.sortedKeys]
            let draft = CaptureTranscriptCorrectionDraft(
                schemaVersion: 1,
                ownerEmail: ownerEmail,
                roomID: roomID,
                segmentID: segment.id,
                providerTextSha256: segment.providerTextSha256,
                correctedText: correctedText,
                correctedSpeaker: correctedSpeaker,
                reason: reason,
                updatedAt: Date()
            )
            try encoder.encode(draft).write(to: url, options: [.atomic, .completeFileProtection])
            var values = URLResourceValues()
            values.isExcludedFromBackup = true
            var mutableURL = url
            try mutableURL.setResourceValues(values)
            return true
        } catch {
            return false
        }
    }

    static func remove(roomID: String, segmentID: String) {
        guard let url = fileURL(roomID: roomID, segmentID: segmentID) else { return }
        try? FileManager.default.removeItem(at: url)
    }

    static func clearAll() {
        guard let directory = directoryURL() else { return }
        try? FileManager.default.removeItem(at: directory)
    }

    private static func currentOwnerEmail() -> String? {
        let email = AuthManager.shared.userEmail?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
        return email.isEmpty ? nil : email
    }

    private static func directoryURL() -> URL? {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?
            .appendingPathComponent("QuipslyCapture/ProtectedTranscriptDrafts", isDirectory: true)
    }

    private static func fileURL(roomID: String, segmentID: String) -> URL? {
        let identity = "\(roomID)|\(segmentID)"
        let digest = SHA256.hash(data: Data(identity.utf8)).map { String(format: "%02x", $0) }.joined()
        return directoryURL()?.appendingPathComponent("\(digest).json")
    }
}

@MainActor
final class CaptureTranscriptPlaybackController: NSObject, ObservableObject {
    @Published private(set) var currentTime: TimeInterval = 0
    @Published private(set) var isPlaying = false
    @Published private(set) var errorMessage: String?

    private var player: AVAudioPlayer?
    private var playbackClock: Task<Void, Never>?
    private var activeRecordingAssetID: String?
    private var activeAnchorID: String?
    private var activeSegmentEnd: TimeInterval?
    private var playedSegmentIDs = Set<String>()
    @Published private var confirmedPositionsByAnchorID: [String: TimeInterval] = [:]
    private var pauseAt: TimeInterval?
    private let audioSessionCoordinator = CaptureAudioSessionCoordinator.shared
    private var accountCancellable: AnyCancellable?

    override init() {
        super.init()
        accountCancellable = NotificationCenter.default.publisher(
            for: .quipslyCaptureAccountIdentityDidChange
        ).sink { [weak self] _ in
            Task { @MainActor in self?.pause(resetPosition: true) }
        }
    }

    func play(
        segment: CaptureTranscriptSegment,
        recording: LocalRecording?,
        library: LocalRecordingLibrary,
        expectedRecordingAssetID: String?
    ) {
        play(
            anchorID: segment.id,
            startSeconds: segment.playbackStartSeconds,
            endSeconds: segment.playbackEndSeconds,
            recording: recording,
            library: library,
            expectedRecordingAssetID: expectedRecordingAssetID
        )
    }

    func play(
        segment: CaptureTranscriptSegment,
        recording: LocalRecording?,
        library: LocalRecordingLibrary,
        expectedRecordingAssetID: String?,
        protectedSource: CaptureTranscriptPlayback?,
        protectedController: CaptureSessionProtectedPlaybackController
    ) async {
        if let recording,
           recording.status.isPlaybackEligible,
           recording.recordingAssetId == expectedRecordingAssetID,
           library.fileURL(for: recording) != nil {
            play(
                segment: segment,
                recording: recording,
                library: library,
                expectedRecordingAssetID: expectedRecordingAssetID
            )
            return
        }
        guard let expectedRecordingAssetID,
              protectedSource?.recordingAssetId == expectedRecordingAssetID,
              let source = protectedSource?.mobileProtectedSource,
              let owner = AuthManager.shared.stableOwnerSnapshot(),
              let fileURL = await protectedController.prepareTranscriptReviewFile(
                source: source
              ),
              AuthManager.shared.matchesStableOwnerSnapshot(owner) else {
            errorMessage = protectedController.errorMessage
                ?? "The exact protected Session source could not be prepared on \(CaptureDeviceVocabulary.thisDevice)."
            return
        }
        playFile(
            anchorID: segment.id,
            startSeconds: segment.playbackStartSeconds,
            endSeconds: segment.playbackEndSeconds,
            fileURL: fileURL,
            recordingAssetID: expectedRecordingAssetID
        )
    }

    func play(
        sample: CaptureTranscriptSpeakerSample,
        recording: LocalRecording?,
        library: LocalRecordingLibrary,
        expectedRecordingAssetID: String?
    ) {
        play(
            anchorID: sample.segmentId,
            startSeconds: sample.startSeconds,
            endSeconds: sample.endSeconds,
            recording: recording,
            library: library,
            expectedRecordingAssetID: expectedRecordingAssetID
        )
    }

    func play(
        sample: CaptureTranscriptSpeakerSample,
        recording: LocalRecording?,
        library: LocalRecordingLibrary,
        expectedRecordingAssetID: String?,
        protectedSource: CaptureTranscriptPlayback?,
        protectedController: CaptureSessionProtectedPlaybackController
    ) async {
        if let recording,
           recording.status.isPlaybackEligible,
           recording.recordingAssetId == expectedRecordingAssetID,
           library.fileURL(for: recording) != nil {
            play(
                sample: sample,
                recording: recording,
                library: library,
                expectedRecordingAssetID: expectedRecordingAssetID
            )
            return
        }
        guard let expectedRecordingAssetID,
              protectedSource?.recordingAssetId == expectedRecordingAssetID,
              let source = protectedSource?.mobileProtectedSource,
              let owner = AuthManager.shared.stableOwnerSnapshot(),
              let fileURL = await protectedController.prepareTranscriptReviewFile(source: source),
              AuthManager.shared.matchesStableOwnerSnapshot(owner) else {
            errorMessage = protectedController.errorMessage
                ?? "The exact protected Session source could not be prepared on \(CaptureDeviceVocabulary.thisDevice)."
            return
        }
        playFile(
            anchorID: sample.segmentId,
            startSeconds: sample.startSeconds,
            endSeconds: sample.endSeconds,
            fileURL: fileURL,
            recordingAssetID: expectedRecordingAssetID
        )
    }

    func play(
        listenPoint: CaptureTranscriptAudioListenPoint,
        recording: LocalRecording?,
        library: LocalRecordingLibrary,
        expectedRecordingAssetID: String?
    ) {
        play(
            anchorID: listenPoint.id,
            startSeconds: listenPoint.startSeconds,
            endSeconds: listenPoint.endSeconds,
            recording: recording,
            library: library,
            expectedRecordingAssetID: expectedRecordingAssetID
        )
    }

    private func play(
        anchorID: String,
        startSeconds: TimeInterval,
        endSeconds: TimeInterval,
        recording: LocalRecording?,
        library: LocalRecordingLibrary,
        expectedRecordingAssetID: String?
    ) {
        pause(resetPosition: false)
        guard let recording,
              recording.status.isPlaybackEligible,
              let localAssetID = recording.recordingAssetId?.trimmingCharacters(in: .whitespacesAndNewlines),
              !localAssetID.isEmpty,
              localAssetID == expectedRecordingAssetID else {
            errorMessage = "\(CaptureDeviceVocabulary.thisDeviceCapitalized) does not have the exact recording asset behind this transcript. Review it in Nest instead."
            return
        }
        guard let fileURL = library.fileURL(for: recording), FileManager.default.fileExists(atPath: fileURL.path) else {
            errorMessage = "The matching local original is no longer available on \(CaptureDeviceVocabulary.thisDevice)."
            return
        }

        playFile(
            anchorID: anchorID,
            startSeconds: startSeconds,
            endSeconds: endSeconds,
            fileURL: fileURL,
            recordingAssetID: localAssetID
        )
    }

    private func playFile(
        anchorID: String,
        startSeconds: TimeInterval,
        endSeconds: TimeInterval,
        fileURL: URL,
        recordingAssetID: String
    ) {
        pause(resetPosition: false)
        do {
            try audioSessionCoordinator.beginLocalPlayback()
            let player = try AVAudioPlayer(contentsOf: fileURL)
            player.delegate = self
            guard player.prepareToPlay(), startSeconds < player.duration else {
                throw NSError(domain: "CaptureTranscriptPlayback", code: 1, userInfo: [NSLocalizedDescriptionKey: "This timestamp is outside the retained recording."])
            }
            player.currentTime = max(0, startSeconds)
            guard player.play() else {
                throw NSError(domain: "CaptureTranscriptPlayback", code: 2, userInfo: [NSLocalizedDescriptionKey: "The retained recording could not begin playback."])
            }
            self.player = player
            if let activeRecordingAssetID,
               activeRecordingAssetID != recordingAssetID {
                confirmedPositionsByAnchorID.removeAll()
                playedSegmentIDs.removeAll()
            }
            activeRecordingAssetID = recordingAssetID
            activeAnchorID = anchorID
            activeSegmentEnd = endSeconds
            currentTime = player.currentTime
            pauseAt = min(player.duration, endSeconds + 2)
            playedSegmentIDs.insert(anchorID)
            isPlaying = true
            errorMessage = nil
            startTimer()
        } catch {
            audioSessionCoordinator.endLocalPlayback()
            player = nil
            activeRecordingAssetID = nil
            isPlaying = false
            errorMessage = error.localizedDescription
        }
    }

    func confirmedPosition(
        for segment: CaptureTranscriptSegment,
        recordingAssetID: String?
    ) -> TimeInterval? {
        guard recordingAssetID == activeRecordingAssetID,
              playedSegmentIDs.contains(segment.id),
              let position = confirmedPositionsByAnchorID[segment.id],
              position >= max(segment.playbackStartSeconds, segment.playbackEndSeconds - 0.25),
              position <= segment.playbackEndSeconds + 3 else { return nil }
        return position
    }

    func confirmedPosition(
        for sample: CaptureTranscriptSpeakerSample,
        recordingAssetID: String?
    ) -> TimeInterval? {
        guard recordingAssetID == activeRecordingAssetID,
              playedSegmentIDs.contains(sample.segmentId),
              let position = confirmedPositionsByAnchorID[sample.segmentId],
              position >= max(sample.startSeconds, sample.endSeconds - 0.25),
              position <= sample.endSeconds + 3 else { return nil }
        return position
    }

    func pause(resetPosition: Bool) {
        player?.pause()
        playbackClock?.cancel()
        playbackClock = nil
        if isPlaying { audioSessionCoordinator.endLocalPlayback() }
        isPlaying = false
        if resetPosition {
            player = nil
            activeRecordingAssetID = nil
            activeAnchorID = nil
            activeSegmentEnd = nil
            currentTime = 0
            pauseAt = nil
            playedSegmentIDs.removeAll()
            confirmedPositionsByAnchorID.removeAll()
        }
    }

    private func startTimer() {
        playbackClock?.cancel()
        playbackClock = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(150))
                guard !Task.isCancelled, let self, let player = self.player else { return }
                self.currentTime = player.currentTime
                self.retainConfirmedPositionIfEligible(player.currentTime)
                if let pauseAt = self.pauseAt, player.currentTime >= pauseAt {
                    self.pause(resetPosition: false)
                    return
                }
            }
        }
    }

    private func retainConfirmedPositionIfEligible(_ position: TimeInterval) {
        guard let activeAnchorID,
              let activeSegmentEnd,
              position >= max(0, activeSegmentEnd - 0.25),
              position <= activeSegmentEnd + 3 else { return }
        confirmedPositionsByAnchorID[activeAnchorID] = max(
            confirmedPositionsByAnchorID[activeAnchorID] ?? 0,
            position
        )
    }
}

extension CaptureTranscriptPlaybackController: AVAudioPlayerDelegate {
    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in
            // AVAudioPlayer can report zero after a normal end-of-file. Keep a
            // durable terminal position so a source span near the tail does
            // not flash its confirmation control for only one timer tick.
            let terminalPosition = min(
                player.duration,
                self.activeSegmentEnd ?? player.duration
            )
            self.currentTime = max(self.currentTime, terminalPosition)
            self.retainConfirmedPositionIfEligible(terminalPosition)
            self.pause(resetPosition: false)
            if !flag { self.errorMessage = "Playback ended before iOS could finish the retained recording." }
        }
    }

    nonisolated func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) {
        Task { @MainActor in
            self.pause(resetPosition: false)
            self.errorMessage = error?.localizedDescription ?? "The retained recording could not be decoded."
        }
    }
}

private enum CapturePacketCandidateReviewKind: Int {
    case note = 0
    case goal = 1
    case task = 2

    var label: String {
        switch self {
        case .note: "Note"
        case .goal: "Goal"
        case .task: "Task"
        }
    }

    var tint: Color {
        switch self {
        case .note: .orange
        case .goal: .purple
        case .task: .blue
        }
    }
}

private enum CapturePacketCandidateReviewState: String {
    case ready
    case listenFirst
    case deferred
    case decided

    var label: String {
        switch self {
        case .ready: "Easy to add"
        case .listenFirst: "Source available"
        case .deferred: "Later"
        case .decided: "Handled"
        }
    }

    var tint: Color {
        switch self {
        case .ready: .green
        case .listenFirst: .orange
        case .deferred: .brown
        case .decided: .blue
        }
    }
}

private enum CapturePacketCandidateReviewPayload {
    case note(CapturePacketNoteCandidate)
    case goal(CapturePacketGoalCandidate)
    case task(CapturePacketActionCandidate)
}

private struct CapturePacketCandidateReviewItem: Identifiable {
    let id: String
    let kind: CapturePacketCandidateReviewKind
    let state: CapturePacketCandidateReviewState
    let startSeconds: TimeInterval
    let endSeconds: TimeInterval
    let segmentID: String
    let payload: CapturePacketCandidateReviewPayload
}

private enum CapturePacketCandidateReviewFilter: String, CaseIterable, Identifiable {
    case open
    case deferred
    case decided
    case all

    var id: String { rawValue }

    var label: String {
        switch self {
        case .open: "Open"
        case .deferred: "Later"
        case .decided: "Handled"
        case .all: "All"
        }
    }
}

private enum CaptureTranscriptPresentationMode: String, CaseIterable, Identifiable {
    case conversation
    case timeline

    var id: String { rawValue }

    var label: String {
        switch self {
        case .conversation: "Conversation"
        case .timeline: "Timeline"
        }
    }

    var systemImage: String {
        switch self {
        case .conversation: "bubble.left.and.bubble.right.fill"
        case .timeline: "waveform.and.magnifyingglass"
        }
    }
}

struct CaptureTranscriptReviewView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dismiss) private var dismiss

    let roomID: String
    let sessionTitle: String
    let recording: LocalRecording?
    let previewOnly: Bool
    let focusSegmentID: String?
    let canUseProjectTeamNotes: Bool
    let returnLabel: String?
    let onReturn: (() -> Void)?

    @StateObject private var client = CaptureTranscriptCorrectionClient()
    @StateObject private var playback = CaptureTranscriptPlaybackController()
    @StateObject private var protectedSessionPlayback = CaptureSessionProtectedPlaybackController()
    @StateObject private var library = LocalRecordingLibrary.shared
    @State private var scrollTargetSegmentID: String?
    @State private var packetCandidateFilter = CapturePacketCandidateReviewFilter.open
    @State private var showsAdditionalSuggestions = false
    @State private var recentPacketDecisionID: String?
    @State private var previousPacketCandidateStates: [String: CapturePacketCandidateReviewState] = [:]
    @State private var showsAllAudioListenPoints = false
    @State private var showsRecordingSource = false
    @State private var showsTranscriptTools = false
    private static let transcriptPresentationModeKey = "quipsly.capture.transcript.presentation-mode"
    @State private var transcriptPresentationMode = CaptureTranscriptPresentationMode(
        rawValue: UserDefaults.standard.string(forKey: transcriptPresentationModeKey) ?? ""
    ) ?? .conversation
    @AccessibilityFocusState private var accessibilityFocusedSegmentID: String?

    init(
        roomID: String,
        sessionTitle: String,
        recording: LocalRecording?,
        previewOnly: Bool,
        focusSegmentID: String? = nil,
        canUseProjectTeamNotes: Bool = false,
        returnLabel: String? = nil,
        onReturn: (() -> Void)? = nil
    ) {
        self.roomID = roomID
        self.sessionTitle = sessionTitle
        self.recording = recording
        self.previewOnly = previewOnly
        self.focusSegmentID = focusSegmentID
        self.canUseProjectTeamNotes = canUseProjectTeamNotes
        self.returnLabel = returnLabel
        self.onReturn = onReturn
    }

    var body: some View {
        ScrollViewReader { scrollProxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 16) {
                    header

                    if let focusSegmentID {
                        reviewNotice(
                            title: "Opened from linked work",
                            detail: "Quipsly returned to the exact transcript segment. Press play yourself before making any correction decision.",
                            tint: .blue,
                            icon: "link.circle.fill"
                        )
                        .accessibilityIdentifier("CaptureTranscriptSourceBoundary_\(focusSegmentID)")
                    }

                    if previewOnly && !CaptureLaunchConfiguration.usesAppStorePresentation {
                        reviewNotice(
                            title: "Preview data — no server actions",
                            detail: "This demonstrates the review workflow without claiming playback or saving a correction.",
                            tint: .orange,
                            icon: "hammer.fill"
                        )
                        .accessibilityIdentifier("CaptureTranscriptPreviewBoundary")
                    }

                    if let message = client.message {
                        reviewNotice(title: "Transcript status", detail: message, tint: .blue, icon: "info.circle.fill")
                    }
                    if client.isUsingProtectedCache {
                        reviewNotice(
                            title: "Available offline",
                            detail: "You can read the transcript and play the matching recording. Corrections are saved safely on \(CaptureDeviceVocabulary.thisDevice) and sync when Quipsly reconnects; creating notes, goals, or tasks waits for reconnection.",
                            tint: .gray,
                            icon: "lock.shield.fill"
                        )
                        .accessibilityIdentifier("CaptureTranscriptProtectedCacheBoundary")
                    }
                    if client.pendingTranscriptDecisionCount > 0 || client.heldTranscriptDecisionCount > 0 {
                        reviewNotice(
                            title: client.heldTranscriptDecisionCount > 0
                                ? "Transcript change needs attention"
                                : "Transcript changes saved on \(CaptureDeviceVocabulary.thisDevice)",
                            detail: client.heldTranscriptDecisionCount > 0
                                ? "\(client.heldTranscriptDecisionCount) change\(client.heldTranscriptDecisionCount == 1 ? "" : "s") could not sync. Open the saved-changes button to review."
                                : "\(client.pendingTranscriptDecisionCount) change\(client.pendingTranscriptDecisionCount == 1 ? " is" : "s are") waiting to sync.",
                            tint: client.heldTranscriptDecisionCount > 0 ? .orange : .blue,
                            icon: client.heldTranscriptDecisionCount > 0 ? "exclamationmark.shield.fill" : "arrow.triangle.2.circlepath"
                        )
                        .id("transcript-outbox-status")
                        .accessibilityIdentifier("CaptureTranscriptReviewOutboxDetailBoundary")
                    }
                    if client.pendingSpeakerAttributionCount > 0 || client.heldSpeakerAttributionCount > 0 {
                        reviewNotice(
                            title: client.heldSpeakerAttributionCount > 0
                                ? "Voice label needs attention"
                                : "Voice labels saved on \(CaptureDeviceVocabulary.thisDevice)",
                            detail: client.heldSpeakerAttributionCount > 0
                                ? "\(client.heldSpeakerAttributionCount) voice label\(client.heldSpeakerAttributionCount == 1 ? "" : "s") could not sync. Open the saved-changes button to review."
                                : "\(client.pendingSpeakerAttributionCount) voice label\(client.pendingSpeakerAttributionCount == 1 ? " is" : "s are") waiting to sync.",
                            tint: client.heldSpeakerAttributionCount > 0 ? .orange : .indigo,
                            icon: client.heldSpeakerAttributionCount > 0 ? "exclamationmark.shield.fill" : "person.wave.2.fill"
                        )
                        .id("speaker-attribution-outbox-status")
                        .accessibilityIdentifier("CaptureTranscriptSpeakerOutboxDetailBoundary")
                    }
                    if protectedSessionPlayback.isPreparing {
                        reviewNotice(
                            title: "Preparing exact recording",
                            detail: protectedSessionPlayback.statusMessage
                                ?? "Downloading and verifying the retained participant source before playback.",
                            tint: .blue,
                            icon: "arrow.down.circle.fill"
                        )
                        .accessibilityIdentifier("CaptureTranscriptProtectedPlaybackPreparing")
                    }
                    if let error = client.errorMessage
                        ?? playback.errorMessage
                        ?? protectedSessionPlayback.errorMessage {
                        reviewNotice(title: "Needs attention", detail: error, tint: .orange, icon: "exclamationmark.triangle.fill")
                    }

                    if client.isLoading {
                        ProgressView("Loading protected transcript…")
                            .frame(maxWidth: .infinity, minHeight: 120)
                    } else if let desk = client.desk {
                        sessionTranscriptAssemblyStatus(desk)
                        transcriptSegments(desk, scrollProxy: scrollProxy)
                        if let results = client.packetResults {
                            sessionFollowUpResults(
                                results,
                                desk: desk,
                                scrollProxy: scrollProxy
                            )
                            .id("session-follow-up")
                        }
                        sourceTruth(desk)
                            .id("source-truth")
                        if !client.canReviewPrivatePacket {
                            participantFollowUpBoundary
                                .id("shared-follow-up")
                        }
                        transcriptTools(desk, scrollProxy: scrollProxy)
                    } else if client.errorMessage == nil {
                        ContentUnavailableView("Transcript unavailable", systemImage: "text.magnifyingglass")
                    }
                }
                .scrollTargetLayout()
                .padding(.horizontal, 18)
                .padding(.vertical, 16)
                .padding(.bottom, 72)
            }
            .scrollPosition(id: $scrollTargetSegmentID, anchor: .center)
            .scrollDismissesKeyboard(.immediately)
            .background(Color(uiColor: .systemGroupedBackground))
            .safeAreaInset(edge: .top, spacing: 0) {
                if focusSegmentID != nil {
                    VStack(alignment: .leading, spacing: 2) {
                        if let focusSegmentID {
                            Label("Opened from linked work", systemImage: "link.circle.fill")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.secondary)
                                .frame(minHeight: 28)
                                .accessibilityIdentifier("CaptureTranscriptSourceBoundary_\(focusSegmentID)")
                        }
                    }
                    .padding(.horizontal, 18)
                    .padding(.vertical, 6)
                    .background(.bar)
                }
            }
            .navigationTitle("Transcript")
            .navigationBarTitleDisplayMode(.inline)
            // Transcript review is a focused destination with its own reading,
            // playback, editing, and quality controls. Keep the global tabs
            // from covering those controls; the standard Back button remains.
            .toolbar(.hidden, for: .tabBar)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    if let returnLabel {
                        Button {
                            returnToLinkedWork()
                        } label: {
                            Label(
                                "Back to \(returnLabel.lowercased())",
                                systemImage: "chevron.backward"
                            )
                        }
                        .accessibilityIdentifier("CaptureTranscriptReturn")
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    if totalOutboxCount > 0 {
                        Button {
                            withAnimation(reduceMotion ? nil : .easeOut(duration: 0.3)) {
                                let target = client.heldSpeakerAttributionCount + client.pendingSpeakerAttributionCount > 0
                                    ? "speaker-attribution-outbox-status"
                                    : "transcript-outbox-status"
                                scrollTargetSegmentID = target
                                scrollProxy.scrollTo(target, anchor: .top)
                            }
                        } label: {
                            ZStack(alignment: .topTrailing) {
                                Image(
                                    systemName: totalHeldOutboxCount > 0
                                        ? "exclamationmark.shield.fill"
                                        : "checkmark.shield.fill"
                                )
                                Text("\(totalOutboxCount)")
                                    .font(.caption2.weight(.bold))
                                    .padding(.horizontal, 4)
                                    .padding(.vertical, 1)
                                    .foregroundStyle(.white)
                                    .background(
                                        totalHeldOutboxCount > 0 ? Color.orange : Color.blue,
                                        in: Capsule()
                                    )
                                    .offset(x: 9, y: -7)
                            }
                            .frame(minWidth: 28, minHeight: 28)
                        }
                        .accessibilityLabel(
                            "Saved changes, \(totalOutboxCount - totalHeldOutboxCount) waiting to sync, \(totalHeldOutboxCount) need attention"
                        )
                        .accessibilityHint("Shows transcript and voice-label changes saved on \(CaptureDeviceVocabulary.thisDevice).")
                        .accessibilityIdentifier("CaptureTranscriptReviewOutboxBoundary")
                        .accessibilityValue(
                            totalHeldOutboxCount > 0 ? "Held" : "Queued"
                        )
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        if client.desk != nil {
                            Button {
                                showsRecordingSource = true
                            } label: {
                                Label("Recording source", systemImage: "waveform.badge.magnifyingglass")
                            }
                            .accessibilityIdentifier("CaptureTranscriptJumpToSourceTruth")
                        }
                        if !(client.desk?.speakerGroups ?? []).isEmpty {
                            Button {
                                revealTranscriptTools(
                                    at: "speaker-identities",
                                    scrollProxy: scrollProxy
                                )
                            } label: {
                                Label("Voice identities", systemImage: "person.wave.2")
                            }
                            .accessibilityIdentifier("CaptureTranscriptJumpToSpeakerIdentities")
                        }
                        if let firstNote = packetCandidateQueue.first(where: { $0.kind == .note }) {
                            Button {
                                showsAdditionalSuggestions = true
                                revealTranscriptTools(
                                    at: firstNote.id,
                                    scrollProxy: scrollProxy
                                )
                            } label: {
                                Label("Notes", systemImage: "note.text")
                            }
                            .accessibilityIdentifier("CaptureTranscriptJumpToNotes")
                        }
                        if let firstGoal = packetCandidateQueue.first(where: { $0.kind == .goal }) {
                            Button {
                                showsAdditionalSuggestions = true
                                revealTranscriptTools(
                                    at: firstGoal.id,
                                    scrollProxy: scrollProxy
                                )
                            } label: {
                                Label("Goals", systemImage: "target")
                            }
                            .accessibilityIdentifier("CaptureTranscriptJumpToGoals")
                        }
                        if let firstTask = packetCandidateQueue.first(where: { $0.kind == .task }) {
                            Button {
                                showsAdditionalSuggestions = true
                                revealTranscriptTools(
                                    at: firstTask.id,
                                    scrollProxy: scrollProxy
                                )
                            } label: {
                                Label("Tasks", systemImage: "checklist")
                            }
                            .accessibilityIdentifier("CaptureTranscriptJumpToTasks")
                        }
                        if client.packetResults != nil {
                            Button {
                                withAnimation(reduceMotion ? nil : .easeOut(duration: 0.3)) {
                                    scrollTargetSegmentID = "session-follow-up"
                                    scrollProxy.scrollTo("session-follow-up", anchor: .top)
                                }
                            } label: {
                                Label("Follow-up", systemImage: "sparkles")
                            }
                            .accessibilityIdentifier("CaptureTranscriptJumpToFollowUp")
                        }
                        if previewOnly || packetCandidateCount > 0 {
                            Button {
                                showsAdditionalSuggestions = true
                                revealTranscriptTools(
                                    at: "packet-candidate-review",
                                    scrollProxy: scrollProxy
                                )
                            } label: {
                                Label("More suggestions", systemImage: "sparkles")
                            }
                            .accessibilityIdentifier("CaptureTranscriptJumpToReviewQueue")
                        }
                        if let firstSegmentID = client.desk?.segments.first?.id {
                            Button {
                                withAnimation(reduceMotion ? nil : .easeOut(duration: 0.3)) {
                                    scrollTargetSegmentID = firstSegmentID
                                    scrollProxy.scrollTo(firstSegmentID, anchor: .top)
                                }
                            } label: {
                                Label("Transcript", systemImage: "text.bubble")
                            }
                            .accessibilityIdentifier("CaptureTranscriptJumpToTranscript")
                        }
                    } label: {
                        Image(systemName: "list.bullet.rectangle")
                    }
                    .accessibilityLabel("Jump to section")
                    .accessibilityIdentifier("CaptureTranscriptJumpMenu")
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { await client.load(roomID: roomID, previewOnly: previewOnly) }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                    .disabled(client.isLoading || client.isMutating)
                    .accessibilityLabel("Refresh transcript")
                }
            }
            .sheet(isPresented: $showsRecordingSource) {
                NavigationStack {
                    ScrollView {
                        if let desk = client.desk {
                            sourceTruth(desk)
                                .padding(18)
                        } else {
                            ProgressView("Loading recording source…")
                                .frame(maxWidth: .infinity, minHeight: 180)
                        }
                    }
                    .background(Color(uiColor: .systemGroupedBackground))
                    .navigationTitle("Recording source")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Done") { showsRecordingSource = false }
                        }
                    }
                }
                .presentationDetents([.medium, .large])
            }
            .task {
                await client.load(roomID: roomID, previewOnly: previewOnly)
                guard let focusSegmentID,
                      client.desk?.segments.contains(where: { $0.id == focusSegmentID }) == true else { return }
                transcriptPresentationMode = .timeline
                // A linked-work destination can arrive while the remembered
                // conversation view is still on screen. Let SwiftUI replace
                // that hierarchy before resolving the stable transcript-start
                // target, then drive the reader directly so the exact source
                // is visible rather than merely present below the speaker card.
                scrollTargetSegmentID = nil
                await Task.yield()
                withAnimation(
                    reduceMotion ? nil : .easeOut(duration: 0.3)
                ) {
                    scrollTargetSegmentID = linkedTranscriptScrollTargetID
                    scrollProxy.scrollTo(linkedTranscriptScrollTargetID, anchor: .top)
                }
                accessibilityFocusedSegmentID = focusSegmentID
            }
            .onChange(of: packetCandidateStateKey, initial: true) { _, _ in
                let current = Dictionary(uniqueKeysWithValues: packetCandidateQueue.map { ($0.id, $0.state) })
                if let newlyDecided = packetCandidateQueue.first(where: {
                    $0.state == .decided
                        && previousPacketCandidateStates[$0.id] != nil
                        && previousPacketCandidateStates[$0.id] != .decided
                }) {
                    recentPacketDecisionID = newlyDecided.id
                }
                previousPacketCandidateStates = current
            }
            .onDisappear { playback.pause(resetPosition: true) }
            .accessibilityIdentifier("CaptureTranscriptReviewView")
        }
    }

    @ViewBuilder
    private func sessionTranscriptAssemblyStatus(
        _ desk: CaptureTranscriptCorrectionDesk
    ) -> some View {
        if let assembly = desk.sessionTranscript {
            let onDeviceCount = assembly.sources.filter {
                $0.processing?.routing?.provider == "apple-speech-transcriber-on-device"
            }.count
            let appleSpeechServiceCount = assembly.sources.filter {
                $0.processing?.routing?.provider == "apple-speech-recognizer-service"
            }.count
            let quipslyCloudCount = assembly.sources.filter {
                guard let provider = $0.processing?.routing?.provider else { return false }
                return provider != "apple-speech-transcriber-on-device"
                    && provider != "apple-speech-recognizer-service"
            }.count
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .top, spacing: 12) {
                    Image(systemName: assembly.status == "assembled"
                        ? "person.2.wave.2.fill"
                        : "waveform.badge.exclamationmark")
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(assembly.status == "assembled" ? CapturePalette.accent : .orange)
                        .frame(width: 38, height: 38)
                        .background(
                            (assembly.status == "assembled" ? CapturePalette.accent : Color.orange)
                                .opacity(0.1),
                            in: Circle()
                        )
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(sessionTranscriptAssemblyTitle(assembly))
                            .font(.headline)
                        Text(sessionTranscriptAssemblyDetail(assembly))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }

                HStack(spacing: 8) {
                    Label("\(onDeviceCount) on-device", systemImage: "iphone.gen3.radiowaves.left.and.right")
                    if appleSpeechServiceCount > 0 {
                        Label("\(appleSpeechServiceCount) Apple service", systemImage: "apple.logo")
                    }
                    Label("\(quipslyCloudCount) Quipsly cloud ASR", systemImage: "cloud")
                }
                .font(.caption2.weight(.bold))
                .foregroundStyle(CapturePalette.accent)
                .fixedSize(horizontal: false, vertical: true)

                if let clock = assembly.programClock {
                    Label(
                        clock.waveformReviewRequired
                            ? "Provisional sync · waveform and drift review remain available"
                            : "Reviewed waveform placement",
                        systemImage: clock.waveformReviewRequired
                            ? "waveform.badge.magnifyingglass"
                            : "checkmark.seal.fill"
                    )
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(clock.waveformReviewRequired ? Color.orange : Color.green)
                    .fixedSize(horizontal: false, vertical: true)
                }
            }
            .reviewCard()
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(
                sessionTranscriptAssemblyAccessibilityLabel(
                    assembly,
                    onDeviceCount: onDeviceCount,
                    appleSpeechServiceCount: appleSpeechServiceCount,
                    quipslyCloudCount: quipslyCloudCount
                )
            )
            .accessibilityIdentifier("CaptureTranscriptAssemblyStatus")
        }
    }

    private func sessionTranscriptAssemblyAccessibilityLabel(
        _ assembly: CaptureSessionTranscriptAssembly,
        onDeviceCount: Int,
        appleSpeechServiceCount: Int,
        quipslyCloudCount: Int
    ) -> String {
        let clockStatus: String
        if let clock = assembly.programClock {
            clockStatus = clock.waveformReviewRequired
                ? "Provisional sync. Waveform and drift review remain available."
                : "Reviewed waveform placement."
        } else {
            clockStatus = ""
        }
        return [
            sessionTranscriptAssemblyTitle(assembly),
            sessionTranscriptAssemblyDetail(assembly),
            "\(onDeviceCount) on-device",
            appleSpeechServiceCount > 0 ? "\(appleSpeechServiceCount) Apple speech service" : "",
            "\(quipslyCloudCount) Quipsly cloud ASR",
            clockStatus,
        ]
        .filter { !$0.isEmpty }
        .joined(separator: ". ")
    }

    private func sessionTranscriptAssemblyTitle(
        _ assembly: CaptureSessionTranscriptAssembly
    ) -> String {
        switch assembly.status {
        case "assembled":
            return assembly.sourceCount == 1
                ? "High-quality source transcript ready"
                : "\(assembly.sourceCount) participant recordings · one Session transcript"
        case "single-source":
            return "One participant transcript ready"
        case "held", "incomplete":
            return "Joint transcript still syncing"
        default:
            return "Session transcript"
        }
    }

    private func sessionTranscriptAssemblyDetail(
        _ assembly: CaptureSessionTranscriptAssembly
    ) -> String {
        let onDeviceCount = assembly.sources.filter {
            $0.processing?.routing?.provider == "apple-speech-transcriber-on-device"
        }.count
        let appleSpeechServiceCount = assembly.sources.filter {
            $0.processing?.routing?.provider == "apple-speech-recognizer-service"
        }.count
        let quipslyCloudCount = assembly.sources.filter {
            guard let provider = $0.processing?.routing?.provider else { return false }
            return provider != "apple-speech-transcriber-on-device"
                && provider != "apple-speech-recognizer-service"
        }.count
        if assembly.status == "assembled", assembly.sourceCount > 1 {
            let recognition: String
            if onDeviceCount == assembly.sourceCount {
                recognition = "Each verified participant master arrived with on-device, source-bound timed text, so Quipsly did not run cloud ASR for these sources."
            } else if onDeviceCount + appleSpeechServiceCount == assembly.sourceCount {
                recognition = "\(onDeviceCount) source transcript\(onDeviceCount == 1 ? " was" : "s were") created on-device and \(appleSpeechServiceCount) used Apple's speech service. Quipsly did not run a separate cloud ASR job."
            } else {
                recognition = "\(onDeviceCount) source transcript\(onDeviceCount == 1 ? " was" : "s were") created on-device, \(appleSpeechServiceCount) used Apple's speech service, and \(quipslyCloudCount) used Quipsly cloud ASR."
            }
            return "Each person's high-quality recording remains its own source. Quipsly aligns the timed passages on one reversible Session timeline. \(recognition)"
        }
        return assembly.reason
    }

    @ViewBuilder
    private func transcriptTools(
        _ desk: CaptureTranscriptCorrectionDesk,
        scrollProxy: ScrollViewProxy
    ) -> some View {
        Button {
            withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.2)) {
                showsTranscriptTools.toggle()
            }
        } label: {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "waveform.badge.magnifyingglass")
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(.indigo)
                    .frame(width: 42, height: 42)
                    .background(Color.indigo.opacity(0.1), in: Circle())
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 3) {
                    Text("Audio, speakers & follow-up")
                        .font(.headline)
                        .foregroundStyle(.primary)
                    Text("Accuracy highlights, voice names, notes, tasks, goals, and recording details.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 8)
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.secondary)
                    .rotationEffect(.degrees(showsTranscriptTools ? 90 : 0))
                    .accessibilityHidden(true)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .reviewCard()
        .accessibilityValue(showsTranscriptTools ? "Expanded" : "Collapsed")
        .accessibilityHint("Shows optional transcript and audio tools without changing the recording or transcript.")
        .accessibilityIdentifier("CaptureTranscriptToolsDisclosure")

        if showsTranscriptTools {
            Group {
                audioAttentionSection(desk, scrollProxy: scrollProxy)
                    .id("audio-listen-points")
                if let evidence = desk.evidence?.transcript {
                    transcriptEvidenceSummary(evidence)
                        .id("transcript-evidence")
                }
                if desk.segments.contains(where: { segment in
                    (segment.downstreamImpacts ?? []).contains(where: \.needsReview)
                }) {
                    transcriptImpactSummary(desk)
                        .id("linked-work-impact")
                }
                if let packetReviewError = client.packetReviewError {
                    reviewNotice(
                        title: "Follow-up unavailable",
                        detail: packetReviewError,
                        tint: .orange,
                        icon: "target"
                    )
                    .accessibilityIdentifier("CaptureTranscriptPacketErrorBoundary")
                } else if client.canReviewPrivatePacket && client.followUpPreparationFailed && !client.packetNeedsRebuild {
                    followUpRetryNotice
                }
                speakerIdentitySection(desk)
                    .id("speaker-identities")
                if packetCandidateCount > 0 {
                    packetCandidateReviewQueue { segmentID in
                        withAnimation(
                            reduceMotion ? nil : .easeOut(duration: 0.3)
                        ) {
                            scrollTargetSegmentID = segmentID
                        }
                        accessibilityFocusedSegmentID = segmentID
                    }
                    .id("packet-candidate-review")
                }
            }
            .transition(.opacity.combined(with: .move(edge: .top)))
        }
    }

    private func revealTranscriptTools(
        at target: String,
        scrollProxy: ScrollViewProxy
    ) {
        showsTranscriptTools = true
        Task { @MainActor in
            // The destination is inserted only after the disclosure expands.
            // Give SwiftUI one reconciliation turn before asking the reader to
            // navigate so menu actions remain deterministic on physical iPhones.
            await Task.yield()
            withAnimation(reduceMotion ? nil : .easeOut(duration: 0.3)) {
                scrollTargetSegmentID = target
                scrollProxy.scrollTo(target, anchor: .top)
            }
        }
    }

    private func returnToLinkedWork() {
        if let onReturn {
            onReturn()
        } else {
            dismiss()
        }
    }

    @ViewBuilder
    private func transcriptSegments(
        _ desk: CaptureTranscriptCorrectionDesk,
        scrollProxy: ScrollViewProxy
    ) -> some View {
        if !desk.gate.allowed {
            reviewNotice(
                title: "Transcript unavailable",
                detail: desk.gate.error ?? "The recording release gate has not cleared.",
                tint: .orange,
                icon: "lock.fill"
            )
        } else if desk.segments.isEmpty {
            ContentUnavailableView(
                "No transcript segments",
                systemImage: "text.badge.xmark",
                description: Text("Create the recording-backed transcript to read, play, and edit it here.")
            )
        } else {
            transcriptPresentationPicker(desk, scrollProxy: scrollProxy)
                .id(linkedTranscriptScrollTargetID)
            VStack(alignment: .leading, spacing: 16) {
                if transcriptPresentationMode == .conversation {
                    let speakers = conversationSpeakerLabels(in: desk)
                    ForEach(orderedSegments(in: desk)) { segment in
                        transcriptConversationTurn(
                            segment,
                            desk: desk,
                            speakers: speakers,
                            scrollProxy: scrollProxy
                        )
                            .id(segment.id)
                            .accessibilityFocused($accessibilityFocusedSegmentID, equals: segment.id)
                    }
                } else {
                    ForEach(orderedSegments(in: desk)) { segment in
                        CaptureTranscriptSegmentCard(
                            roomID: roomID,
                            sessionTitle: sessionTitle,
                            transcriptJobID: segment.transcriptJobId ?? desk.transcriptJobId,
                            segment: segment,
                            recording: recording,
                            expectedRecordingAssetID: segment.recordingAssetId ?? desk.playback?.recordingAssetId,
                            attention: desk.evidence?.transcript.attentionSegments.first(where: { $0.segmentId == segment.id }),
                            previewOnly: previewOnly,
                            decisionsLocked: client.isUsingProtectedCache,
                            canUseProjectTeamNotes: canUseProjectTeamNotes,
                            client: client,
                            playback: playback,
                            protectedSource: segment.sourcePlayback ?? desk.playback,
                            protectedPlayback: protectedSessionPlayback,
                            library: library
                        )
                        .id(segment.id)
                        .accessibilityFocused($accessibilityFocusedSegmentID, equals: segment.id)
                    }
                }
            }
            .id(transcriptPresentationMode)
        }
    }

    private func sessionFollowUpResults(
        _ results: MobileCaptureTranscriptResults,
        desk: CaptureTranscriptCorrectionDesk,
        scrollProxy: ScrollViewProxy
    ) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "sparkles")
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(.teal)
                    .frame(width: 38, height: 38)
                    .background(Color.teal.opacity(0.1), in: Circle())
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 3) {
                    Text("Follow-up ready")
                        .font(.headline)
                    Text("\(results.notes.count) notes · \(results.tasks.count) tasks · \(results.goals.count) goals")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Text(results.summary.body)
                .font(.subheadline)
                .foregroundStyle(.primary)
                .fixedSize(horizontal: false, vertical: true)

            if !results.notes.isEmpty {
                followUpResultSection(title: "Notes", systemImage: "note.text", tint: .teal) {
                    ForEach(Array(results.notes.prefix(3))) { note in
                        followUpResultRow(
                            title: captureTranscriptNonempty(note.title) ?? "Session note",
                            detail: note.body,
                            source: note.source,
                            desk: desk,
                            scrollProxy: scrollProxy
                        )
                    }
                }
            }
            if !results.tasks.isEmpty {
                followUpResultSection(title: "Tasks", systemImage: "checklist", tint: .orange) {
                    ForEach(Array(results.tasks.prefix(3))) { task in
                        followUpResultRow(
                            title: task.title,
                            detail: task.detail,
                            source: task.source,
                            desk: desk,
                            scrollProxy: scrollProxy
                        )
                    }
                }
            }
            if !results.goals.isEmpty {
                followUpResultSection(title: "Goals", systemImage: "target", tint: .purple) {
                    ForEach(Array(results.goals.prefix(3))) { goal in
                        followUpResultRow(
                            title: goal.title,
                            detail: goal.description,
                            source: goal.source,
                            desk: desk,
                            scrollProxy: scrollProxy
                        )
                    }
                }
            }

            Text("These are ordinary editable Session work. Open Session or Work to adjust or remove them; tap a source here to return to the exact participant recording.")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .reviewCard()
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("CaptureTranscriptFollowUpResults")
    }

    private func followUpResultSection<Content: View>(
        title: String,
        systemImage: String,
        tint: Color,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(title, systemImage: systemImage)
                .font(.caption.weight(.bold))
                .foregroundStyle(tint)
            content()
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(tint.opacity(0.06), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    @ViewBuilder
    private func followUpResultRow(
        title: String,
        detail: String?,
        source: MobileCaptureTranscriptResultSource?,
        desk: CaptureTranscriptCorrectionDesk,
        scrollProxy: ScrollViewProxy
    ) -> some View {
        if let source,
           let segment = transcriptSegment(for: source, in: desk) {
            Button {
                openFollowUpSource(
                    segment,
                    scrollProxy: scrollProxy
                )
            } label: {
                followUpResultLabel(title: title, detail: detail, source: source)
            }
            .buttonStyle(.plain)
            .accessibilityHint("Opens the exact participant recording and transcript segment.")
            .accessibilityIdentifier("CaptureTranscriptFollowUpSource_\(source.segmentId ?? segment.id)")
        } else {
            followUpResultLabel(title: title, detail: detail, source: source)
        }
    }

    private func followUpResultLabel(
        title: String,
        detail: String?,
        source: MobileCaptureTranscriptResultSource?
    ) -> some View {
        HStack(alignment: .top, spacing: 8) {
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.primary)
                    .fixedSize(horizontal: false, vertical: true)
                if let detail = captureTranscriptNonempty(detail) {
                    Text(detail)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(3)
                }
                if let sourceDetail = followUpSourceDetail(source) {
                    Text(sourceDetail)
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.blue)
                }
            }
            Spacer(minLength: 4)
            if captureTranscriptNonempty(source?.segmentId) != nil {
                Image(systemName: "waveform.and.magnifyingglass")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.blue)
                    .accessibilityHidden(true)
            }
        }
        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
        .contentShape(Rectangle())
    }

    private func followUpSourceDetail(
        _ source: MobileCaptureTranscriptResultSource?
    ) -> String? {
        guard let source else { return nil }
        var parts: [String] = []
        if let speaker = captureTranscriptNonempty(source.speakerLabel) {
            parts.append(speaker)
        }
        if let start = source.effectiveProgramStartSeconds,
           let end = source.effectiveProgramEndSeconds {
            parts.append("timeline \(start.captureTranscriptTimestamp)–\(end.captureTranscriptTimestamp)")
        }
        if source.hasDistinctProgramPlacement,
           let start = source.effectiveSourceStartSeconds,
           let end = source.effectiveSourceEndSeconds {
            parts.append("source \(start.captureTranscriptTimestamp)–\(end.captureTranscriptTimestamp)")
        }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    private func transcriptSegment(
        for source: MobileCaptureTranscriptResultSource,
        in desk: CaptureTranscriptCorrectionDesk
    ) -> CaptureTranscriptSegment? {
        guard let segmentID = captureTranscriptNonempty(source.segmentId) else { return nil }
        if let transcriptJobID = captureTranscriptNonempty(source.transcriptJobId),
           let exact = desk.segments.first(where: {
               $0.id == segmentID && $0.transcriptJobId == transcriptJobID
           }) {
            return exact
        }
        return desk.segments.first(where: { $0.id == segmentID })
    }

    private func openFollowUpSource(
        _ segment: CaptureTranscriptSegment,
        scrollProxy: ScrollViewProxy
    ) {
        transcriptPresentationMode = .timeline
        UserDefaults.standard.set(
            CaptureTranscriptPresentationMode.timeline.rawValue,
            forKey: Self.transcriptPresentationModeKey
        )
        Task { @MainActor in
            await Task.yield()
            withAnimation(reduceMotion ? nil : .easeOut(duration: 0.3)) {
                scrollTargetSegmentID = segment.id
                scrollProxy.scrollTo(segment.id, anchor: .center)
            }
            accessibilityFocusedSegmentID = segment.id
        }
    }

    private func transcriptPresentationPicker(
        _ desk: CaptureTranscriptCorrectionDesk,
        scrollProxy: ScrollViewProxy
    ) -> some View {
        let voicesToName = speakerGroupsRequiringIdentity(in: desk).count
        return VStack(alignment: .leading, spacing: 9) {
            HStack {
                Label("Transcript", systemImage: transcriptPresentationMode.systemImage)
                    .font(.headline)
            }
            Picker("Transcript view", selection: $transcriptPresentationMode) {
                ForEach(CaptureTranscriptPresentationMode.allCases) { mode in
                    Text(mode.label).tag(mode)
                }
            }
            .pickerStyle(.segmented)
            .accessibilityIdentifier("CaptureTranscriptPresentationMode")
            .onChange(of: transcriptPresentationMode) { _, mode in
                UserDefaults.standard.set(mode.rawValue, forKey: Self.transcriptPresentationModeKey)
            }
            Text(
                transcriptPresentationMode == .conversation
                    ? "Read the Session like a conversation. Tap Edit to correct words, change a speaker, or make a cut."
                    : "Listen at exact timestamps, correct words or speakers, and create source-backed notes, tasks, and goals."
            )
            .font(.caption)
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
            if voicesToName > 0 {
                Button {
                    revealTranscriptTools(
                        at: "speaker-identities",
                        scrollProxy: scrollProxy
                    )
                } label: {
                    HStack(spacing: 8) {
                        Label(
                            voicesToName == 1 ? "Name voice" : "Name \(voicesToName) voices",
                            systemImage: "person.wave.2.fill"
                        )
                        Spacer(minLength: 8)
                        Text("Optional")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.bordered)
                .tint(.indigo)
                .accessibilityHint("Opens voice naming. The transcript remains usable if you skip it.")
                .accessibilityIdentifier("CaptureTranscriptNameVoicesButton")
            }
        }
        .reviewCard()
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("CaptureTranscriptPresentationControls")
    }

    private var linkedTranscriptScrollTargetID: String {
        guard let focusSegmentID else { return "transcript-presentation" }
        return "linked-transcript-\(focusSegmentID)"
    }

    private func transcriptConversationTurn(
        _ segment: CaptureTranscriptSegment,
        desk: CaptureTranscriptCorrectionDesk,
        speakers: [String],
        scrollProxy: ScrollViewProxy
    ) -> some View {
        let label = captureTranscriptNonempty(segment.speakerLabel) ?? "Unlabelled speaker"
        let trails = (speakers.firstIndex(of: label) ?? 0).isMultiple(of: 2) == false
        return HStack {
            if trails { Spacer(minLength: 40) }
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .firstTextBaseline) {
                    Text(label)
                        .font(.caption.weight(.bold))
                    Spacer(minLength: 8)
                    Text(segment.sessionStartSeconds.captureTranscriptTimestamp)
                        .font(.caption2.monospacedDigit().weight(.semibold))
                        .foregroundStyle(.secondary)
                }
                Text(segment.text)
                    .font(.body)
                    .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 8) {
                    Button {
                        let expectedRecordingAssetID = segment.recordingAssetId ?? desk.playback?.recordingAssetId
                        Task {
                            await playback.play(
                                segment: segment,
                                recording: recording,
                                library: library,
                                expectedRecordingAssetID: expectedRecordingAssetID,
                                protectedSource: segment.sourcePlayback ?? desk.playback,
                                protectedController: protectedSessionPlayback
                            )
                        }
                    } label: {
                        if protectedSessionPlayback.isPreparing
                            && !hasExactLocalSource(
                                expectedRecordingAssetID: segment.recordingAssetId
                                    ?? desk.playback?.recordingAssetId
                            ) {
                            Label("Preparing…", systemImage: "arrow.down.circle")
                                .frame(minHeight: 36)
                        } else {
                            Label("Play", systemImage: "play.fill")
                                .frame(minHeight: 36)
                        }
                    }
                    .buttonStyle(.bordered)
                    .disabled(
                        !canPlay(
                            segment: segment,
                            desk: desk
                        ) || client.isMutating || protectedSessionPlayback.isPreparing
                    )
                    Button("Edit") {
                        transcriptPresentationMode = .timeline
                        // The conversation row and precision editor intentionally
                        // share the source segment ID. Give SwiftUI one render turn
                        // to replace the row before applying the scroll/focus target;
                        // otherwise ScrollView can retain the old row position and
                        // leave the disclosed timeline editor off-screen.
                        scrollTargetSegmentID = nil
                        Task { @MainActor in
                            await Task.yield()
                            withAnimation(reduceMotion ? nil : .easeOut(duration: 0.25)) {
                                scrollTargetSegmentID = segment.id
                                scrollProxy.scrollTo(segment.id, anchor: .center)
                            }
                            accessibilityFocusedSegmentID = segment.id
                        }
                    }
                    .buttonStyle(.bordered)
                    .frame(minHeight: 36)
                    .accessibilityIdentifier("CaptureTranscriptConversationReview_\(segment.id)")
                }
            }
            .padding(13)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                trails ? Color.indigo.opacity(0.1) : Color.blue.opacity(0.09),
                in: RoundedRectangle(cornerRadius: 17, style: .continuous)
            )
            if !trails { Spacer(minLength: 40) }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("CaptureTranscriptConversationTurn_\(segment.id)")
    }

    private func conversationSpeakerLabels(in desk: CaptureTranscriptCorrectionDesk) -> [String] {
        orderedSegments(in: desk).reduce(into: [String]()) { labels, candidate in
            let label = captureTranscriptNonempty(candidate.speakerLabel) ?? "Unlabelled speaker"
            if !labels.contains(label) { labels.append(label) }
        }
    }

    private func canPlay(
        segment: CaptureTranscriptSegment,
        desk: CaptureTranscriptCorrectionDesk
    ) -> Bool {
        let expectedRecordingAssetID = segment.recordingAssetId
            ?? desk.playback?.recordingAssetId
        return !previewOnly && (
            hasExactLocalSource(expectedRecordingAssetID: expectedRecordingAssetID)
            || (segment.sourcePlayback ?? desk.playback)?.mobileProtectedSource != nil
        )
    }

    private func hasExactLocalSource(expectedRecordingAssetID: String?) -> Bool {
        guard let recording,
              recording.status.isPlaybackEligible,
              let expectedRecordingAssetID,
              recording.recordingAssetId == expectedRecordingAssetID,
              library.fileURL(for: recording) != nil else { return false }
        return true
    }

    private func orderedSegments(in desk: CaptureTranscriptCorrectionDesk) -> [CaptureTranscriptSegment] {
        guard let focusSegmentID,
              let focusedSegment = desk.segments.first(where: { $0.id == focusSegmentID }) else {
            return desk.segments
        }
        return [focusedSegment] + desk.segments.filter { $0.id != focusSegmentID }
    }

    private func transcriptEvidenceSummary(
        _ evidence: CaptureTranscriptEvidenceSummary
    ) -> some View {
        let firstAttentionSegmentID = evidence.attentionSegments.first?.segmentId
        let providerLabel = [
            transcriptProviderDisplayName(evidence.provider),
            transcriptModelDisplayName(evidence.providerModel),
        ]
        .compactMap { $0 }
        .joined(separator: " ")
        let passageLabel = evidence.segmentCount == 1 ? "timed passage" : "timed passages"
        let wordsToCheckLabel = evidence.lowConfidenceWordCount == 1 ? "word to check" : "words to check"
        return VStack(alignment: .leading, spacing: 11) {
            Label("Accuracy insights", systemImage: "waveform.badge.magnifyingglass")
                .font(.headline)
                .foregroundStyle(.indigo)
            HStack(spacing: 8) {
                transcriptEvidenceMetric(
                    value: "\(evidence.segmentCount)",
                    label: passageLabel
                )
                transcriptEvidenceMetric(
                    value: evidence.lowConfidenceWordCount.map(String.init) ?? "—",
                    label: wordsToCheckLabel
                )
                transcriptEvidenceMetric(
                    value: evidence.measuredWordErrorRate.map { "\(Int(($0 * 100).rounded()))%" } ?? "—",
                    label: "measured error"
                )
            }
            if let threshold = evidence.lowConfidenceThreshold,
               captureTranscriptNonempty(evidence.lowConfidenceThresholdAuthority) != nil {
                Text("Words below \(Int((threshold * 100).rounded()))% confidence are highlighted. Listen or correct them when it is useful.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                Text("Play any passage or edit it directly. Quipsly keeps every correction linked to its exact place in the recording.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let firstAttentionSegmentID {
                Button {
                    withAnimation(reduceMotion ? nil : .easeOut(duration: 0.3)) {
                        scrollTargetSegmentID = firstAttentionSegmentID
                    }
                    accessibilityFocusedSegmentID = firstAttentionSegmentID
                } label: {
                    Label(
                        "Go to first highlight",
                        systemImage: "ear.badge.exclamationmark"
                    )
                    .frame(minHeight: 44)
                }
                .buttonStyle(.borderedProminent)
                .tint(.indigo)
                .accessibilityIdentifier("CaptureTranscriptEvidenceReviewFirst")
            }
            VStack(alignment: .leading, spacing: 3) {
                if !providerLabel.isEmpty {
                    Text("Transcribed with \(providerLabel)")
                }
                Text("Confidence helps locate uncertain words. Measured error appears only when a reference transcript is available.")
            }
            .font(.caption2.weight(.semibold))
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
        }
        .reviewCard()
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("CaptureTranscriptEvidenceSummary")
    }

    private func transcriptProviderDisplayName(_ rawValue: String?) -> String? {
        guard let value = captureTranscriptNonempty(rawValue) else { return nil }
        switch value.lowercased() {
        case "deepgram": return "Deepgram"
        case "google": return "Google"
        case "openai": return "OpenAI"
        default: return value
        }
    }

    private func transcriptModelDisplayName(_ rawValue: String?) -> String? {
        guard let value = captureTranscriptNonempty(rawValue) else { return nil }
        if value.lowercased().hasPrefix("nova-") {
            return "Nova-\(value.dropFirst("nova-".count))"
        }
        return value
    }

    private func transcriptEvidenceMetric(value: String, label: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value)
                .font(.headline.monospacedDigit())
                .foregroundStyle(.primary)
            Text(label)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(9)
        .background(Color.indigo.opacity(0.07), in: RoundedRectangle(cornerRadius: 10))
    }

    @ViewBuilder
    private func speakerIdentitySection(_ desk: CaptureTranscriptCorrectionDesk) -> some View {
        let groups = speakerGroupsRequiringIdentity(in: desk)
        let participants = desk.participants ?? []
        if !groups.isEmpty, let transcriptJobID = desk.transcriptJobId {
            VStack(alignment: .leading, spacing: 12) {
                Label("Identify voices once", systemImage: "person.wave.2.fill")
                    .font(.title3.weight(.bold))
                    .foregroundStyle(.indigo)
                Text("Connect each detected voice to a Session participant. Updating a speaker name applies it across matching turns, and you can change it again anytime.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                ForEach(groups) { group in
                    CaptureTranscriptSpeakerGroupCard(
                        roomID: roomID,
                        transcriptJobID: transcriptJobID,
                        group: group,
                        participants: participants,
                        recording: recording,
                        expectedRecordingAssetID: desk.playback?.recordingAssetId,
                        protectedSource: desk.playback,
                        protectedPlayback: protectedSessionPlayback,
                        previewOnly: previewOnly,
                        client: client,
                        playback: playback,
                        library: library
                    )
                    .id("\(group.providerSpeakerLabel):\(group.providerSnapshotSha256)")
                }
            }
            .reviewCard()
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("CaptureTranscriptSpeakerIdentitySection")
        }
    }

    private func speakerGroupsRequiringIdentity(
        in desk: CaptureTranscriptCorrectionDesk
    ) -> [CaptureTranscriptSpeakerGroup] {
        (desk.speakerGroups ?? []).filter { group in
            let matchingSegments = desk.segments.filter {
                $0.providerSpeakerLabel == group.providerSpeakerLabel
            }
            guard !matchingSegments.isEmpty else {
                return group.attribution == nil || group.staleAttribution
            }
            return matchingSegments.contains { segment in
                switch segment.speakerAuthority {
                case "source-binding", "attribution", "correction":
                    return false
                default:
                    return true
                }
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(sessionTitle)
                .font(.title3.weight(.bold))
            Label("Transcript ready", systemImage: "checkmark.circle.fill")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.green)
            if client.desk?.roomPurpose == "COACHING", !previewOnly {
                if let reportURL = client.mentorReportURL {
                    ShareLink(
                        item: reportURL,
                        subject: Text("\(sessionTitle) transcript"),
                        message: Text("Coaching Session transcript for mentor review")
                    ) {
                        Label("Share mentor report", systemImage: "square.and.arrow.up")
                            .frame(minHeight: 44)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.orange)
                    .accessibilityHint("Opens the standard share sheet. Quipsly does not send the report until you choose a destination.")
                    .accessibilityIdentifier("CaptureTranscriptShareMentorReport")
                } else {
                    Button {
                        Task {
                            await client.prepareMentorReport(
                                roomID: roomID,
                                sessionTitle: sessionTitle
                            )
                        }
                    } label: {
                        Label(
                            client.isPreparingMentorReport ? "Preparing report…" : "Mentor report",
                            systemImage: "doc.richtext"
                        )
                        .frame(minHeight: 44)
                    }
                    .buttonStyle(.bordered)
                    .disabled(client.isPreparingMentorReport || client.isLoading || client.isUsingProtectedCache)
                    .accessibilityHint("Creates a coach-left, client-right Word transcript with timestamps and competency notes. Nothing is sent automatically.")
                    .accessibilityIdentifier("CaptureTranscriptPrepareMentorReport")
                }
            }
        }
        .padding(.horizontal, 4)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("CaptureTranscriptSessionIdentity")
    }

    private func transcriptImpactSummary(_ desk: CaptureTranscriptCorrectionDesk) -> some View {
        let affected = desk.segments.flatMap { segment in
            (segment.downstreamImpacts ?? [])
                .filter(\.needsReview)
                .map { (segment.id, $0) }
        }
        let textChanges = affected.filter { $0.1.changes.text == "changed" }.count
        let speakerChanges = affected.filter { $0.1.changes.speaker == "changed" }.count
        let firstSegmentID = affected.first?.0
        return VStack(alignment: .leading, spacing: 10) {
            Label(
                "\(affected.count) linked work item\(affected.count == 1 ? " uses" : "s use") earlier wording",
                systemImage: "arrow.triangle.branch"
            )
            .font(.headline)
            .foregroundStyle(.orange)
            Text("Your existing notes, tasks, goals, and follow-ups stay as they are. The transcript change remains visible from the linked work, and everything stays editable.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            Text("\(textChanges) wording change\(textChanges == 1 ? "" : "s") · \(speakerChanges) speaker change\(speakerChanges == 1 ? "" : "s")")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            if let firstSegmentID {
                Button {
                    withAnimation(reduceMotion ? nil : .easeOut(duration: 0.3)) {
                        scrollTargetSegmentID = firstSegmentID
                    }
                    accessibilityFocusedSegmentID = firstSegmentID
                } label: {
                    Label("Show changed passage", systemImage: "waveform.and.magnifyingglass")
                        .frame(minHeight: 44)
                }
                .buttonStyle(.borderedProminent)
                .tint(.orange)
                .accessibilityIdentifier("CaptureTranscriptImpactReviewFirst")
            }
            Text("Nothing is blocked. Open any linked item if you want to update it; otherwise keep working.")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .reviewCard()
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("CaptureTranscriptImpactSummary")
    }

    private func sourceTruth(_ desk: CaptureTranscriptCorrectionDesk) -> some View {
        let exactRecording = desk.playback?.recordingAssetId.nonemptyTranscriptValue.flatMap { expectedAssetID in
            recording.flatMap { $0.recordingAssetId == expectedAssetID ? $0 : nil }
        }
        let exactMatch = exactRecording.map { library.fileURL(for: $0) != nil } ?? false
        let appStorePresentation = CaptureLaunchConfiguration.usesAppStorePresentation
        return VStack(alignment: .leading, spacing: 10) {
            Label(
                appStorePresentation
                    ? "Recording and transcript stay linked"
                    : (exactMatch ? "Recording ready to play" : "Transcript ready"),
                systemImage: appStorePresentation ? "waveform.and.magnifyingglass" : (exactMatch ? "checkmark.circle.fill" : "text.bubble")
            )
                .font(.headline)
                .foregroundStyle(appStorePresentation || exactMatch ? Color.green : Color.orange)
            Text(
                appStorePresentation
                    ? "Play the session, correct any word, or make a basic cut from the words you said."
                    : (exactMatch
                        ? "Quipsly found the matching recording on \(CaptureDeviceVocabulary.thisDevice)."
                        : "\(CaptureDeviceVocabulary.thisDeviceCapitalized) does not have the matching recording, so playback and source-confirmed corrections remain available in Nest.")
            )
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            HStack {
                Label(
                    "\(desk.segments.count) \(desk.segments.count == 1 ? "segment" : "segments")",
                    systemImage: "text.alignleft"
                )
                if playback.currentTime > 0 {
                    Spacer()
                    Text(playback.currentTime.captureTranscriptTimestamp)
                        .font(.caption.monospacedDigit().weight(.semibold))
                }
            }
            .font(.caption.weight(.semibold))
            if let exactRecording,
               exactRecording.sourceProfile?.includesAudio == true {
                CaptureTranscriptAudioQualityCard(recording: exactRecording)
            }
        }
        .reviewCard()
        .accessibilityIdentifier(exactMatch ? "CaptureTranscriptExactSourceMatch" : "CaptureTranscriptReviewOnlyBoundary")
    }

    @ViewBuilder
    private func audioAttentionSection(
        _ desk: CaptureTranscriptCorrectionDesk,
        scrollProxy: ScrollViewProxy
    ) -> some View {
        if let plan = audioAttentionPlan(desk),
           plan.status != .noObservations {
            VStack(alignment: .leading, spacing: 11) {
                HStack(alignment: .firstTextBaseline) {
                    Label("Audio listen points", systemImage: "ear.badge.exclamationmark")
                        .font(.headline)
                        .foregroundStyle(plan.isClockQualified ? Color.indigo : Color.orange)
                    Spacer(minLength: 8)
                    Text("\(plan.listenPoints.count)")
                        .font(.caption.monospacedDigit().weight(.bold))
                        .foregroundStyle(.secondary)
                }

                if plan.isClockQualified {
                    Text("Measured source moments that may deserve a listen. They are not confirmed defects and never become transcript corrections or recording cuts automatically.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)

                    ForEach(visibleAudioListenPoints(plan)) { point in
                        audioListenPointCard(point, desk: desk, scrollProxy: scrollProxy)
                    }

                    if plan.listenPoints.count > 3 {
                        Button(showsAllAudioListenPoints ? "Show first 3" : "Show all \(plan.listenPoints.count)") {
                            showsAllAudioListenPoints.toggle()
                        }
                        .buttonStyle(.bordered)
                        .accessibilityIdentifier("CaptureTranscriptAudioAttentionShowAll")
                    }
                }

                if let reason = plan.reason {
                    Label(reason, systemImage: plan.isClockQualified ? "info.circle" : "exclamationmark.shield.fill")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(plan.isClockQualified ? Color.secondary : Color.orange)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("CaptureTranscriptAudioAttentionHold")
                }

                if plan.heldObservationCount > 0 {
                    Text("\(plan.heldObservationCount) listen point\(plan.heldObservationCount == 1 ? " was" : "s were") held from transcript navigation.")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
            }
            .reviewCard()
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("CaptureTranscriptAudioAttention")
        }
    }

    private func audioListenPointCard(
        _ point: CaptureTranscriptAudioListenPoint,
        desk: CaptureTranscriptCorrectionDesk,
        scrollProxy: ScrollViewProxy
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text("Listen at \(point.startSeconds.captureTranscriptTimestamp)")
                    .font(.subheadline.weight(.bold))
                Spacer(minLength: 8)
                Text(audioListenPointLabel(point))
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(.secondary)
            }
            Text(point.detail)
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            Text(
                point.overlappingSegmentIDs.isEmpty
                    ? "Between transcript passages"
                    : "Touches \(point.overlappingSegmentIDs.count) transcript passage\(point.overlappingSegmentIDs.count == 1 ? "" : "s")"
            )
            .font(.caption2.weight(.semibold))
            .foregroundStyle(.secondary)

            ViewThatFits(in: .horizontal) {
                HStack(spacing: 8) {
                    audioListenButton(point, desk: desk)
                    if let segmentID = point.overlappingSegmentIDs.first {
                        audioTranscriptReviewButton(
                            segmentID,
                            label: point.overlappingSegmentIDs.count > 1 ? "Review first passage" : "Review passage",
                            scrollProxy: scrollProxy
                        )
                    }
                }
                VStack(spacing: 8) {
                    audioListenButton(point, desk: desk)
                        .frame(maxWidth: .infinity)
                    if let segmentID = point.overlappingSegmentIDs.first {
                        audioTranscriptReviewButton(
                            segmentID,
                            label: point.overlappingSegmentIDs.count > 1 ? "Review first passage" : "Review passage",
                            scrollProxy: scrollProxy
                        )
                            .frame(maxWidth: .infinity)
                    }
                }
            }
        }
        .padding(10)
        .background(Color.indigo.opacity(0.06), in: RoundedRectangle(cornerRadius: 11))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("CaptureTranscriptAudioListenPoint_\(point.id)")
    }

    private func audioListenButton(
        _ point: CaptureTranscriptAudioListenPoint,
        desk: CaptureTranscriptCorrectionDesk
    ) -> some View {
        Button {
            playback.play(
                listenPoint: point,
                recording: recording,
                library: library,
                expectedRecordingAssetID: desk.playback?.recordingAssetId
            )
        } label: {
            Label("Listen", systemImage: "play.fill")
                .frame(minHeight: 44)
        }
        .buttonStyle(.borderedProminent)
        .tint(.indigo)
        .disabled(!hasExactLocalSource(expectedRecordingAssetID: desk.playback?.recordingAssetId) || client.isMutating)
        .accessibilityHint("Plays the exact local source around this measured point. It makes no correction or edit.")
    }

    private func audioTranscriptReviewButton(
        _ segmentID: String,
        label: String,
        scrollProxy: ScrollViewProxy
    ) -> some View {
        Button(label) {
            transcriptPresentationMode = .timeline
            scrollTargetSegmentID = nil
            Task { @MainActor in
                await Task.yield()
                withAnimation(reduceMotion ? nil : .easeOut(duration: 0.25)) {
                    scrollTargetSegmentID = segmentID
                    scrollProxy.scrollTo(segmentID, anchor: .center)
                }
                accessibilityFocusedSegmentID = segmentID
            }
        }
        .buttonStyle(.bordered)
        .frame(minHeight: 44)
        .accessibilityHint("Moves to the overlapping transcript passage without playing, correcting, or cutting it.")
    }

    private func audioListenPointLabel(
        _ point: CaptureTranscriptAudioListenPoint
    ) -> String {
        switch point.kind.lowercased() {
        case "possible-dropout", "dropout":
            "Signal-gap candidate"
        case "clipped", "clipping", "possible-clipping":
            "Peak candidate"
        case "silence", "quiet", "possible-silence":
            "Quiet-region candidate"
        default:
            "Measured listen point"
        }
    }

    private func visibleAudioListenPoints(
        _ plan: CaptureTranscriptAudioAttentionPlan
    ) -> [CaptureTranscriptAudioListenPoint] {
        showsAllAudioListenPoints ? plan.listenPoints : Array(plan.listenPoints.prefix(3))
    }

    private func audioAttentionPlan(
        _ desk: CaptureTranscriptCorrectionDesk
    ) -> CaptureTranscriptAudioAttentionPlan? {
        guard let recording,
              let signal = recording.sourceProfile?.audioSignal else { return nil }
        return CaptureTranscriptAudioAttentionResolver.resolve(
            expectedRecordingAssetID: desk.playback?.recordingAssetId,
            actualRecordingAssetID: recording.recordingAssetId,
            recordingDurationSeconds: recording.durationSeconds,
            transcriptPlaybackDurationSeconds: desk.playback?.durationSeconds,
            signalDurationSeconds: signal.durationSeconds,
            observations: signal.observations.map {
                .init(
                    kind: $0.kind,
                    severity: $0.severity,
                    startSeconds: $0.startSeconds,
                    endSeconds: $0.endSeconds,
                    detail: $0.detail
                )
            },
            segments: desk.segments.map {
                .init(id: $0.id, startSeconds: $0.startSeconds, endSeconds: $0.endSeconds)
            }
        )
    }

    private func packetCandidateState(
        reviewStatus: String?,
        transcriptReviewStatus: String?,
        committedID: String?
    ) -> CapturePacketCandidateReviewState {
        let status = reviewStatus?.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() ?? ""
        if committedID?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
            || status.contains("ACCEPTED")
            || status.contains("MERGED")
            || status.contains("REJECTED") {
            return .decided
        }
        if status.contains("DEFERRED") { return .deferred }
        if transcriptReviewStatus != "human-reviewed" { return .listenFirst }
        return .ready
    }

    private var packetCandidateQueue: [CapturePacketCandidateReviewItem] {
        let notes = client.packetNoteCandidates.map { candidate in
            CapturePacketCandidateReviewItem(
                id: "note:\(candidate.id)",
                kind: .note,
                state: packetCandidateState(
                    reviewStatus: candidate.reviewStatus,
                    transcriptReviewStatus: candidate.transcriptReviewStatus,
                    committedID: candidate.committedNoteId
                ),
                startSeconds: candidate.startSeconds,
                endSeconds: candidate.endSeconds,
                segmentID: candidate.segmentId,
                payload: .note(candidate)
            )
        }
        let goals = client.packetGoalCandidates.map { candidate in
            CapturePacketCandidateReviewItem(
                id: "goal:\(candidate.id)",
                kind: .goal,
                state: packetCandidateState(
                    reviewStatus: candidate.reviewStatus,
                    transcriptReviewStatus: candidate.transcriptReviewStatus,
                    committedID: candidate.committedGoalId
                ),
                startSeconds: candidate.startSeconds,
                endSeconds: candidate.endSeconds,
                segmentID: candidate.segmentId,
                payload: .goal(candidate)
            )
        }
        let tasks = client.packetActionCandidates.map { candidate in
            CapturePacketCandidateReviewItem(
                id: "task:\(candidate.id)",
                kind: .task,
                state: packetCandidateState(
                    reviewStatus: candidate.reviewStatus,
                    transcriptReviewStatus: candidate.transcriptReviewStatus,
                    committedID: candidate.committedActionItemId
                ),
                startSeconds: candidate.startSeconds,
                endSeconds: candidate.endSeconds,
                segmentID: candidate.segmentId,
                payload: .task(candidate)
            )
        }
        return (notes + goals + tasks).sorted { left, right in
            if left.startSeconds != right.startSeconds { return left.startSeconds < right.startSeconds }
            if left.endSeconds != right.endSeconds { return left.endSeconds < right.endSeconds }
            if left.kind.rawValue != right.kind.rawValue { return left.kind.rawValue < right.kind.rawValue }
            return left.id < right.id
        }
    }

    private var packetCandidateStateKey: String {
        packetCandidateQueue.map { "\($0.id):\($0.state.rawValue)" }.joined(separator: "|")
    }

    private var packetOpenCandidates: [CapturePacketCandidateReviewItem] {
        packetCandidateQueue.filter { $0.state == .ready || $0.state == .listenFirst }
    }

    private var visiblePacketCandidates: [CapturePacketCandidateReviewItem] {
        let filtered = packetCandidateQueue.filter { item in
            switch packetCandidateFilter {
            case .open: item.state == .ready || item.state == .listenFirst
            case .deferred: item.state == .deferred
            case .decided: item.state == .decided
            case .all: true
            }
        }
        guard packetCandidateFilter == .open,
              let recentPacketDecisionID,
              let recent = packetCandidateQueue.first(where: { $0.id == recentPacketDecisionID && $0.state == .decided }),
              !filtered.contains(where: { $0.id == recent.id }) else {
            return filtered
        }
        return [recent] + filtered
    }

    private func packetCandidateCount(for filter: CapturePacketCandidateReviewFilter) -> Int {
        switch filter {
        case .open: packetOpenCandidates.count
        case .deferred: packetCandidateQueue.filter { $0.state == .deferred }.count
        case .decided: packetCandidateQueue.filter { $0.state == .decided }.count
        case .all: packetCandidateQueue.count
        }
    }

    private func packetCandidateReviewQueue(onOpenSource: @escaping (String) -> Void) -> some View {
        return DisclosureGroup(isExpanded: $showsAdditionalSuggestions) {
            VStack(alignment: .leading, spacing: 14) {
                if client.packetNeedsRebuild || client.isUsingProtectedCache {
                    Label(
                        client.packetNeedsRebuild ? "Suggestions are refreshing" : "Reconnect to change suggestions",
                        systemImage: client.packetNeedsRebuild ? "arrow.triangle.2.circlepath" : "wifi.slash"
                    )
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.orange)
                }

                Picker("Show suggestions", selection: $packetCandidateFilter) {
                    ForEach(CapturePacketCandidateReviewFilter.allCases) { filter in
                        Text("\(filter.label) \(packetCandidateCount(for: filter))").tag(filter)
                    }
                }
                .pickerStyle(.segmented)
                .accessibilityIdentifier("CapturePacketCandidateReviewFilter")

                if visiblePacketCandidates.isEmpty {
                    Text(packetCandidateFilter == .open
                        ? "No additional suggestions are open."
                        : "Nothing is in this view.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                } else {
                    ForEach(visiblePacketCandidates) { item in
                        VStack(alignment: .leading, spacing: 8) {
                            HStack(spacing: 7) {
                                Label("Suggested \(item.kind.label.lowercased())", systemImage: item.kind == .note ? "note.text" : item.kind == .goal ? "target" : "checklist")
                                    .font(.caption2.weight(.bold))
                                    .foregroundStyle(item.kind.tint)
                                Text(item.state.label)
                                    .font(.caption2.weight(.bold))
                                    .foregroundStyle(item.state.tint)
                                Spacer(minLength: 4)
                                Text("\(item.startSeconds.captureTranscriptTimestamp)–\(item.endSeconds.captureTranscriptTimestamp)")
                                    .font(.caption2.monospacedDigit().weight(.semibold))
                                    .foregroundStyle(.secondary)
                            }
                            if recentPacketDecisionID == item.id, packetCandidateFilter == .open {
                                Label("Saved", systemImage: "checkmark.circle.fill")
                                    .font(.caption2.weight(.bold))
                                    .foregroundStyle(.green)
                            }
                            packetCandidateCard(item, onOpenSource: onOpenSource)
                        }
                        .id(item.id)
                        .accessibilityFocused($accessibilityFocusedSegmentID, equals: item.id)
                    }
                }
            }
            .padding(.top, 12)
        } label: {
            VStack(alignment: .leading, spacing: 3) {
                Label("More suggestions", systemImage: "sparkles")
                    .font(.headline)
                Text("\(packetOpenCandidates.count) optional idea\(packetOpenCandidates.count == 1 ? "" : "s") from the transcript")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text("Use, edit, or dismiss any idea whenever it helps.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("CapturePacketAdditionalSuggestionsDisclosure")
        }
        .reviewCard()
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("CapturePacketCandidateReviewQueue")
    }

    @ViewBuilder
    private func packetCandidateCard(
        _ item: CapturePacketCandidateReviewItem,
        onOpenSource: @escaping (String) -> Void
    ) -> some View {
        switch item.payload {
        case .note(let candidate):
            CapturePacketNoteCandidateCard(
                candidate: candidate,
                mergeTargets: client.packetNoteMergeTargets,
                canUseProjectTeamNotes: canUseProjectTeamNotes,
                previewOnly: previewOnly,
                decisionsLocked: client.isUsingProtectedCache || client.packetNeedsRebuild,
                client: client,
                onOpenSource: { onOpenSource(candidate.segmentId) }
            )
        case .goal(let candidate):
            CapturePacketGoalCandidateCard(
                candidate: candidate,
                projectName: client.packetTaskProjectName,
                availableTags: client.packetTaskTags,
                mergeTargets: client.packetGoalMergeTargets,
                previewOnly: previewOnly,
                decisionsLocked: client.isUsingProtectedCache || client.packetNeedsRebuild,
                client: client,
                onOpenSource: { onOpenSource(candidate.segmentId) }
            )
        case .task(let candidate):
            CapturePacketTaskCandidateCard(
                candidate: candidate,
                projectName: client.packetTaskProjectName,
                availableTags: client.packetTaskTags,
                mergeTargets: client.packetTaskMergeTargets,
                previewOnly: previewOnly,
                decisionsLocked: client.isUsingProtectedCache || client.packetNeedsRebuild,
                client: client,
                onOpenSource: { onOpenSource(candidate.segmentId) }
            )
        }
    }

    private var packetCandidateCount: Int {
        client.packetNoteCandidates.count
            + client.packetActionCandidates.count
            + client.packetGoalCandidates.count
    }

    private var totalOutboxCount: Int {
        client.pendingTranscriptDecisionCount
            + client.heldTranscriptDecisionCount
            + client.pendingSpeakerAttributionCount
            + client.heldSpeakerAttributionCount
    }

    private var totalHeldOutboxCount: Int {
        client.heldTranscriptDecisionCount + client.heldSpeakerAttributionCount
    }

    private var participantFollowUpBoundary: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Shared follow-up", systemImage: "person.2.fill")
                .font(.subheadline.weight(.bold))
                .foregroundStyle(Color.indigo)
            Text("Nothing has been shared yet")
                .font(.headline)
            Text("Your timed transcript remains available here. The coach's private review stays private unless they deliberately share a follow-up with you.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            if let boundary = client.privatePacketBoundary?.trimmingCharacters(in: .whitespacesAndNewlines),
               !boundary.isEmpty {
                Text(boundary)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .reviewCard()
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("CaptureTranscriptParticipantFollowUpBoundary")
    }

    private var followUpRetryNotice: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Follow-up needs attention", systemImage: "exclamationmark.triangle.fill")
                .font(.subheadline.weight(.bold))
                .foregroundStyle(.orange)
            Text("Quipsly could not prepare the suggestions. Your transcript is safe.")
                .font(.caption)
                .foregroundStyle(.secondary)
            Button {
                Task { _ = await client.buildCurrentPacket(roomID: roomID, previewOnly: previewOnly) }
            } label: {
                Label("Try again", systemImage: "arrow.triangle.2.circlepath")
                    .frame(minHeight: 44)
            }
            .buttonStyle(.borderedProminent)
            .tint(.orange)
            .disabled(previewOnly || client.isMutating || client.isUsingProtectedCache)
            .accessibilityIdentifier("CaptureTranscriptPrepareFollowUpRetry")
        }
        .reviewCard()
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("CaptureTranscriptFollowUpRetryBoundary")
    }

    private func reviewNotice(title: String, detail: String, tint: Color, icon: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon)
                .foregroundStyle(tint)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(.subheadline.weight(.bold))
                Text(detail).font(.caption).foregroundStyle(.secondary)
            }
        }
        .reviewCard()
        .accessibilityElement(children: .combine)
    }
}

struct CapturePacketNoteReviewPreviewView: View {
    @StateObject private var client = CaptureTranscriptCorrectionClient()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Label("Optional transcript idea", systemImage: "note.text.badge.plus")
                    .font(.title2.weight(.bold))
                    .foregroundStyle(.orange)
                Text("Quipsly can add this as a private note in one tap, or you can adjust it first. This preview never saves anything.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("CapturePacketNotePreviewBoundary")
                CapturePacketNoteCandidateCard(
                    candidate: .preview(roomID: "room-preview-coaching-ready"),
                    mergeTargets: [.preview()],
                    canUseProjectTeamNotes: false,
                    previewOnly: true,
                    decisionsLocked: false,
                    client: client,
                    onOpenSource: {}
                )
            }
            .padding(18)
            .padding(.bottom, 48)
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .navigationTitle("Transcript idea")
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier("CapturePacketNoteReviewPreviewView")
    }
}

struct CaptureTranscriptSpeakerEvidenceBadge: View {
    let authority: String?
    var identifier: String? = nil

    private var evidence: (label: String, detail: String, icon: String)? {
        switch authority {
        case "correction":
            ("Name reviewed", "A person reviewed this speaker name.", "checkmark.circle")
        case "attribution":
            ("Speaker reviewed", "A person matched this voice to a Session participant.", "person.crop.circle")
        case "source-binding":
            ("Participant recording", "This speaker comes from that participant's isolated recording.", "waveform")
        case "provider":
            ("Automatic speaker label", "This speaker name still comes from transcription processing.", "sparkles")
        case "unresolved":
            ("Speaker needs review", "Quipsly has not identified this speaker yet.", "questionmark.circle")
        default:
            nil
        }
    }

    @ViewBuilder
    var body: some View {
        if let evidence {
            Label(evidence.label, systemImage: evidence.icon)
                .font(.caption2.weight(.bold))
                .foregroundStyle(.blue)
                .padding(.horizontal, 9)
                .padding(.vertical, 5)
                .background(Color.blue.opacity(0.09), in: Capsule())
                .accessibilityElement(children: .combine)
                .accessibilityLabel("Speaker evidence: \(evidence.label)")
                .accessibilityHint(evidence.detail)
                .accessibilityIdentifier(identifier ?? "CapturePacketSpeakerEvidence_\(authority ?? "unknown")")
        }
    }
}

private struct CapturePacketNoteCandidateCard: View {
    private enum ReviewMode {
        case adjust
        case merge
    }

    private enum FocusedField: Hashable {
        case title
        case body
    }

    let candidate: CapturePacketNoteCandidate
    let mergeTargets: [CapturePacketNoteMergeTarget]
    let canUseProjectTeamNotes: Bool
    let previewOnly: Bool
    let decisionsLocked: Bool
    @ObservedObject var client: CaptureTranscriptCorrectionClient
    let onOpenSource: () -> Void

    @State private var reviewMode: ReviewMode?
    @State private var isConfirmingReject = false
    @State private var title: String
    @State private var noteBody: String
    @State private var kind: MobileSessionNoteKind
    @State private var visibility: MobileSessionNoteVisibility
    @State private var mergeTargetID = ""
    @FocusState private var focusedField: FocusedField?

    init(
        candidate: CapturePacketNoteCandidate,
        mergeTargets: [CapturePacketNoteMergeTarget],
        canUseProjectTeamNotes: Bool,
        previewOnly: Bool,
        decisionsLocked: Bool,
        client: CaptureTranscriptCorrectionClient,
        onOpenSource: @escaping () -> Void
    ) {
        self.candidate = candidate
        self.mergeTargets = mergeTargets
        self.canUseProjectTeamNotes = canUseProjectTeamNotes
        self.previewOnly = previewOnly
        self.decisionsLocked = decisionsLocked
        self.client = client
        self.onOpenSource = onOpenSource
        _title = State(initialValue: candidate.suggestedTitle)
        _noteBody = State(initialValue: candidate.suggestedBody)
        _kind = State(initialValue: MobileSessionNoteKind(rawValue: candidate.suggestedKind) ?? .sessionNote)
        _visibility = State(initialValue: MobileSessionNoteVisibility(rawValue: candidate.suggestedVisibility) ?? .authorPrivate)
    }

    private var accepted: Bool {
        candidate.committedNoteId?.isEmpty == false
            || candidate.reviewStatus == "ACCEPTED_AS_NOTE"
            || candidate.reviewStatus == "MERGED_INTO_NOTE"
    }
    private var laneRejected: Bool { candidate.laneStatus == "REJECTED_BY_HUMAN" }
    private var sourceWasReviewed: Bool {
        candidate.transcriptReviewStatus == "human-reviewed"
            && (candidate.sourceSpan?.segments.allSatisfy { $0.reviewStatus == "human-reviewed" } ?? true)
    }
    private var availableKinds: [MobileSessionNoteKind] {
        canUseProjectTeamNotes ? MobileSessionNoteKind.allCases : MobileSessionNoteKind.allCases.filter { $0 != .production }
    }
    private var availableVisibilities: [MobileSessionNoteVisibility] {
        canUseProjectTeamNotes ? MobileSessionNoteVisibility.allCases : MobileSessionNoteVisibility.allCases.filter { $0 != .projectTeam }
    }
    private var reviewStatusLabel: String {
        switch candidate.reviewStatus {
        case "EDITED_FOR_REVIEW": "ADJUSTED"
        case "DEFERRED_BY_HUMAN": "LATER"
        case "REJECTED_BY_HUMAN": "HIDDEN"
        case "ACCEPTED_AS_NOTE", "MERGED_INTO_NOTE": "ADDED"
        default: "IDEA"
        }
    }
    private var selectedMergeTarget: CapturePacketNoteMergeTarget? {
        mergeTargets.first { $0.id == mergeTargetID }
    }

    private func chooseMergeTarget(_ id: String) {
        mergeTargetID = id
        guard let target = mergeTargets.first(where: { $0.id == id }) else { return }
        title = target.title?.trimmingCharacters(in: .whitespacesAndNewlines).nonemptyTranscriptValue ?? candidate.suggestedTitle
        noteBody = [
            target.body.trimmingCharacters(in: .whitespacesAndNewlines),
            candidate.suggestedBody.trimmingCharacters(in: .whitespacesAndNewlines),
        ].filter { !$0.isEmpty }.joined(separator: "\n\n")
        kind = MobileSessionNoteKind(rawValue: target.kind) ?? .sessionNote
        visibility = MobileSessionNoteVisibility(rawValue: target.visibility) ?? .authorPrivate
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(candidate.laneLabel.uppercased())
                        .font(.caption2.weight(.black))
                        .foregroundStyle(.orange)
                    Text(candidate.speakerLabel ?? "Unlabelled speaker")
                        .font(.headline)
                }
                Spacer()
                Text(accepted ? "ADDED" : reviewStatusLabel)
                    .font(.caption2.weight(.black))
                    .foregroundStyle(accepted ? .green : candidate.reviewStatus == "REJECTED_BY_HUMAN" || laneRejected ? .red : .orange)
                    .multilineTextAlignment(.trailing)
            }
            Text(candidate.sourceText)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("CapturePacketNoteSourceText_\(candidate.accessibilityKey)")
            CaptureTranscriptSpeakerEvidenceBadge(authority: candidate.speakerAuthority)
            if (candidate.segmentIds?.count ?? 1) > 1 {
                Label("This moment spans \(candidate.segmentIds?.count ?? 1) transcript passages", systemImage: "link")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
            Button(action: onOpenSource) {
                Label("Play this moment · \(candidate.startSeconds.captureTranscriptTimestamp)–\(candidate.endSeconds.captureTranscriptTimestamp)", systemImage: "play.circle")
            }
            .buttonStyle(.bordered)
            .frame(minHeight: 44)
            .accessibilityIdentifier("CapturePacketNoteSourceButton_\(candidate.accessibilityKey)")
            if !accepted && !sourceWasReviewed {
                Label("Play the source whenever you want to double-check this idea.", systemImage: "play.circle")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.orange)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("CapturePacketNoteSourceReviewRequired")
            }
            if let carried = candidate.carriedForwardDraft, carried.exactSourceMatch {
                Label(
                    "Your previous wording was carried forward because its source still matches.",
                    systemImage: "arrow.triangle.2.circlepath.doc.on.clipboard"
                )
                .font(.caption.weight(.semibold))
                .foregroundStyle(.orange)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("CapturePacketNoteCarriedDraft_\(candidate.accessibilityKey)")
            }

            if accepted {
                Label(
                    candidate.reviewStatus == "MERGED_INTO_NOTE"
                        ? "Merged into one revisioned Session note"
                        : "Saved as one canonical Session note",
                    systemImage: "checkmark.circle.fill"
                )
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.green)
                    .accessibilityIdentifier("CapturePacketNoteSaved_\(candidate.accessibilityKey)")
            } else if reviewMode != nil {
                Divider()
                Label(
                    reviewMode == .merge ? "Add to an existing note" : "Adjust note",
                    systemImage: reviewMode == .merge ? "arrow.triangle.merge" : "pencil.line"
                )
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.orange)
                if reviewMode == .merge {
                    Picker("Existing note", selection: Binding(
                        get: { mergeTargetID },
                        set: { chooseMergeTarget($0) }
                    )) {
                        Text("Choose a note…").tag("")
                        ForEach(mergeTargets) { target in
                            Text("\(target.title?.nonemptyTranscriptValue ?? String(target.body.prefix(56))) · revision \(target.revisionCount)")
                                .tag(target.id)
                        }
                    }
                    .pickerStyle(.menu)
                    .accessibilityIdentifier("CapturePacketNoteMergeTargetPicker")
                    Text("The existing note's prior content remains recoverable as a revision. Review the complete combined note below before saving.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                TextField("Note title (optional)", text: $title, axis: .vertical)
                    .lineLimit(1...3)
                    .textFieldStyle(.roundedBorder)
                    .focused($focusedField, equals: .title)
                    .submitLabel(.next)
                    .onSubmit { focusedField = .body }
                    .accessibilityIdentifier("CapturePacketNoteTitleField")
                TextField("Note", text: $noteBody, axis: .vertical)
                    .lineLimit(3...7)
                    .textFieldStyle(.roundedBorder)
                    .focused($focusedField, equals: .body)
                    .submitLabel(.done)
                    .accessibilityIdentifier("CapturePacketNoteBodyField")
                Picker("Purpose", selection: $kind) {
                    ForEach(availableKinds) { value in Text(value.title).tag(value) }
                }
                .pickerStyle(.menu)
                .accessibilityIdentifier("CapturePacketNoteKindPicker")
                Picker("Audience", selection: $visibility) {
                    ForEach(availableVisibilities) { value in Text(value.title).tag(value) }
                }
                .pickerStyle(.menu)
                .accessibilityIdentifier("CapturePacketNoteVisibilityPicker")
                Text(visibility.boundary)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("CapturePacketNoteAudienceBoundary")
                HStack {
                    Button(reviewMode == .merge ? "Add to note" : "Add note") {
                        Task {
                            if await client.reviewPacketNote(
                                candidate: candidate,
                                decision: reviewMode == .merge ? "MERGE" : "ACCEPT",
                                title: title,
                                body: noteBody,
                                kind: kind,
                                visibility: visibility,
                                mergeTarget: reviewMode == .merge ? selectedMergeTarget : nil,
                                mergedTitle: reviewMode == .merge ? title : nil,
                                mergedBody: reviewMode == .merge ? noteBody : nil,
                                mergedKind: reviewMode == .merge ? kind : nil,
                                mergedVisibility: reviewMode == .merge ? visibility : nil,
                                previewOnly: previewOnly
                            ) {
                                reviewMode = nil
                            }
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.orange)
                    .frame(minHeight: 44)
                    .disabled(
                        noteBody.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                            || client.isMutating
                            || previewOnly
                            || decisionsLocked
                            || (reviewMode == .merge && selectedMergeTarget == nil)
                    )
                    .accessibilityIdentifier("CapturePacketCreateNoteButton_\(candidate.accessibilityKey)")
                    Button("Cancel") { reviewMode = nil }
                        .buttonStyle(.bordered)
                        .frame(minHeight: 44)
                        .accessibilityIdentifier("CapturePacketCancelNoteButton_\(candidate.accessibilityKey)")
                }
                Text(reviewMode == .merge
                        ? "Adds this source to the selected note. Its previous version stays recoverable."
                        : "Adds a private, editable note with this source attached. Nothing is sent or shared.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("CapturePacketNoteBoundary")
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    Button {
                        Task {
                            _ = await client.reviewPacketNote(
                                candidate: candidate,
                                decision: "ACCEPT",
                                title: candidate.suggestedTitle,
                                body: candidate.suggestedBody,
                                kind: availableKinds.contains(where: { $0.rawValue == candidate.suggestedKind })
                                    ? MobileSessionNoteKind(rawValue: candidate.suggestedKind) ?? .sessionNote
                                    : .sessionNote,
                                visibility: .authorPrivate,
                                previewOnly: previewOnly
                            )
                        }
                    } label: {
                        Label("Add private note", systemImage: "note.text.badge.plus")
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.orange)
                    .frame(minHeight: 44)
                    .disabled(client.isMutating || previewOnly || decisionsLocked || laneRejected)
                    .accessibilityIdentifier("CapturePacketReviewNoteButton_\(candidate.accessibilityKey)")
                    .accessibilityHint("Adds this idea as a private editable note. You can change or remove it afterward.")

                    HStack {
                        Button("Add to existing note") { reviewMode = .merge }
                            .buttonStyle(.bordered)
                            .frame(minHeight: 44)
                        .disabled(client.isMutating || previewOnly || decisionsLocked || laneRejected || mergeTargets.isEmpty)
                            .accessibilityIdentifier("CapturePacketNoteMergeButton_\(candidate.accessibilityKey)")
                        Button("Edit first") { beginReview(.adjust) }
                            .buttonStyle(.bordered)
                            .frame(minHeight: 44)
                            .disabled(client.isMutating || decisionsLocked || laneRejected)
                            .accessibilityIdentifier("CapturePacketNoteEditButton_\(candidate.accessibilityKey)")
                        Button("Hide", role: .destructive) { isConfirmingReject = true }
                            .buttonStyle(.bordered)
                            .frame(minHeight: 44)
                            .disabled(client.isMutating || previewOnly || decisionsLocked || laneRejected)
                            .accessibilityIdentifier("CapturePacketNoteRejectButton_\(candidate.accessibilityKey)")
                    }
                }
                if laneRejected {
                    Text("These earlier ideas are hidden. Restore them before adding one.")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.red)
                }
            }
        }
        .padding(12)
        .background(Color.orange.opacity(0.06), in: RoundedRectangle(cornerRadius: 12))
        .accessibilityElement(children: .contain)
        .confirmationDialog(
            "Hide this idea?",
            isPresented: $isConfirmingReject,
            titleVisibility: .visible
        ) {
            Button("Hide idea", role: .destructive) {
                Task {
                    _ = await client.reviewPacketNote(
                        candidate: candidate,
                        decision: "REJECT",
                        previewOnly: previewOnly
                    )
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("The idea moves to Handled. The recording and transcript remain unchanged.")
        }
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                if focusedField != nil {
                    Spacer()
                    Button("Done") { focusedField = nil }
                        .accessibilityIdentifier("CapturePacketNoteKeyboardDone")
                }
            }
        }
    }

    private func beginReview(_ mode: ReviewMode) {
        focusedField = nil
        title = candidate.suggestedTitle
        noteBody = candidate.suggestedBody
        kind = availableKinds.contains(where: { $0.rawValue == candidate.suggestedKind })
            ? MobileSessionNoteKind(rawValue: candidate.suggestedKind) ?? .sessionNote
            : .sessionNote
        visibility = availableVisibilities.contains(where: { $0.rawValue == candidate.suggestedVisibility })
            ? MobileSessionNoteVisibility(rawValue: candidate.suggestedVisibility) ?? .authorPrivate
            : .authorPrivate
        reviewMode = mode
    }
}

private struct CapturePacketTaskCandidateCard: View {
    let candidate: CapturePacketActionCandidate
    let projectName: String?
    let availableTags: [CapturePacketTaskTag]
    let mergeTargets: [CapturePacketTaskMergeTarget]
    let previewOnly: Bool
    let decisionsLocked: Bool
    @ObservedObject var client: CaptureTranscriptCorrectionClient
    let onOpenSource: () -> Void

    @State private var isCreating = false
    @State private var isMerging = false
    @State private var mergeTargetID = ""
    @State private var title: String
    @State private var detail: String
    @State private var assignToMe = true
    @State private var hasDueDate = false
    @State private var dueAt = Date().addingTimeInterval(7 * 86_400)
    @State private var selectedTagIDs: Set<String>

    init(
        candidate: CapturePacketActionCandidate,
        projectName: String?,
        availableTags: [CapturePacketTaskTag],
        mergeTargets: [CapturePacketTaskMergeTarget],
        previewOnly: Bool,
        decisionsLocked: Bool,
        client: CaptureTranscriptCorrectionClient,
        onOpenSource: @escaping () -> Void
    ) {
        self.candidate = candidate
        self.projectName = projectName
        self.availableTags = availableTags
        self.mergeTargets = mergeTargets
        self.previewOnly = previewOnly
        self.decisionsLocked = decisionsLocked
        self.client = client
        self.onOpenSource = onOpenSource
        _title = State(initialValue: candidate.title)
        _detail = State(initialValue: candidate.detail)
        _selectedTagIDs = State(initialValue: Set(availableTags.filter(\.selectedForSession).map(\.id)))
    }

    private var accepted: Bool {
        candidate.committedActionItemId != nil
            || candidate.reviewStatus == "ACCEPTED_AS_ACTION_ITEM"
            || candidate.reviewStatus == "MERGED_INTO_ACTION_ITEM"
    }

    private var sourceWasReviewed: Bool {
        candidate.transcriptReviewStatus == "human-reviewed"
            && (candidate.sourceSpan?.segments.allSatisfy { $0.reviewStatus == "human-reviewed" } ?? true)
    }

    private var decisionsDisabled: Bool {
        previewOnly || decisionsLocked || client.isMutating
    }

    private var statusLabel: String {
        switch candidate.reviewStatus {
        case "EDITED_FOR_REVIEW": "ADJUSTED"
        case "DEFERRED_BY_HUMAN": "LATER"
        case "REJECTED_BY_HUMAN": "HIDDEN"
        case "ACCEPTED_AS_ACTION_ITEM", "MERGED_INTO_ACTION_ITEM": "ADDED"
        default: "IDEA"
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("\(candidate.startSeconds.captureTranscriptTimestamp)–\(candidate.endSeconds.captureTranscriptTimestamp) · \(captureTranscriptNonempty(candidate.speakerLabel) ?? "Unlabelled speaker")")
                        .font(.caption.monospacedDigit().weight(.bold))
                        .foregroundStyle(.blue)
                    Text(candidate.title)
                        .font(.headline)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 8)
                Text(statusLabel)
                    .font(.caption2.weight(.bold))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 5)
                    .background((accepted ? Color.green : Color.orange).opacity(0.12), in: Capsule())
            }
            Text(candidate.detail)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            CaptureTranscriptSpeakerEvidenceBadge(authority: candidate.speakerAuthority)
            if (candidate.segmentIds?.count ?? 1) > 1 {
                Label("This moment spans \(candidate.segmentIds?.count ?? 1) transcript passages", systemImage: "link")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
            Button("Play this moment", action: onOpenSource)
                .buttonStyle(.bordered)
            .frame(minHeight: 44)
            .accessibilityIdentifier("CapturePacketTaskSource_\(candidate.segmentId)")
            if !accepted && !sourceWasReviewed {
                Label("Play the source whenever you want to double-check this idea.", systemImage: "play.circle")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.orange)
                    .accessibilityIdentifier("CapturePacketTaskSourceReviewRequired")
            }

            if accepted {
                VStack(alignment: .leading, spacing: 5) {
                    Label(
                        candidate.reviewStatus == "MERGED_INTO_ACTION_ITEM"
                            ? "Added to an existing task"
                            : "Added to your tasks",
                        systemImage: "checkmark.circle.fill"
                    )
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(.green)
                        .accessibilityIdentifier("CapturePacketTaskAccepted_\(candidate.id)")
                }
            } else if isMerging {
                VStack(alignment: .leading, spacing: 12) {
                    Label("Add to an existing task", systemImage: "link.badge.plus")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(.blue)
                    Text("The transcript moment will stay attached without changing the task's wording, owner, or dates.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    Picker("Existing task", selection: $mergeTargetID) {
                        Text("Choose a task…").tag("")
                        ForEach(mergeTargets) { target in
                            Text(target.title).tag(target.id)
                        }
                    }
                    .pickerStyle(.menu)
                    .accessibilityIdentifier("CapturePacketTaskMergeTargetPicker")
                    if let target = mergeTargets.first(where: { $0.id == mergeTargetID }) {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(target.title).font(.subheadline.weight(.bold))
                            Text(target.detail?.isEmpty == false ? target.detail! : "No task detail recorded.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Text("\(target.dueAt == nil ? "No due date" : "Due date preserved") · \(target.evidenceCount) existing evidence \(target.evidenceCount == 1 ? "receipt" : "receipts")")
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(.blue)
                        }
                        .padding(10)
                        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
                        .accessibilityIdentifier("CapturePacketTaskMergeTargetSummary_\(target.id)")
                    }
                    HStack {
                        Button("Add to task") {
                            guard let target = mergeTargets.first(where: { $0.id == mergeTargetID }) else { return }
                            Task {
                                _ = await client.reviewPacketAction(candidate: candidate, decision: "MERGE", title: nil, detail: nil, mergeTarget: target, previewOnly: previewOnly)
                            }
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(decisionsDisabled || mergeTargetID.isEmpty)
                        .accessibilityIdentifier("CapturePacketTaskMergeButton")
                        Button("Cancel") { isMerging = false }
                            .buttonStyle(.bordered)
                            .accessibilityIdentifier("CapturePacketTaskCancelMergeButton")
                    }
                    Text("The existing task stays editable and the exact transcript source remains playable.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            } else if isCreating {
                VStack(alignment: .leading, spacing: 12) {
                    Label("Adjust task", systemImage: "checklist.checked")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(.green)
                    Text("Change anything you want, or keep Quipsly's defaults.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    TextField("Task title", text: $title, axis: .vertical)
                        .lineLimit(2...4)
                        .textFieldStyle(.roundedBorder)
                        .accessibilityIdentifier("CapturePacketTaskCreateTitleField")
                    TextField("Detail (optional)", text: $detail, axis: .vertical)
                        .lineLimit(2...5)
                        .textFieldStyle(.roundedBorder)
                        .accessibilityIdentifier("CapturePacketTaskCreateDetailField")
                    Picker("Owner", selection: $assignToMe) {
                        Text("Me").tag(true)
                        Text("Unassigned").tag(false)
                    }
                    .pickerStyle(.segmented)
                    .accessibilityIdentifier("CapturePacketTaskOwnerPicker")
                    Toggle("Add a due date", isOn: $hasDueDate)
                        .accessibilityIdentifier("CapturePacketTaskDueDateToggle")
                    if hasDueDate {
                        DatePicker(
                            "Due",
                            selection: $dueAt,
                            in: Date()...,
                            displayedComponents: [.date, .hourAndMinute]
                        )
                        .accessibilityIdentifier("CapturePacketTaskDueDatePicker")
                    }
                    if !availableTags.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Text(projectName.map { "\($0) tags" } ?? "Project tags")
                                .font(.caption.weight(.bold))
                            ForEach(availableTags) { tag in
                                Button {
                                    if selectedTagIDs.contains(tag.id) {
                                        selectedTagIDs.remove(tag.id)
                                    } else {
                                        selectedTagIDs.insert(tag.id)
                                    }
                                } label: {
                                    Label(tag.label, systemImage: selectedTagIDs.contains(tag.id) ? "checkmark.circle.fill" : "circle")
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                }
                                .buttonStyle(.bordered)
                                .accessibilityIdentifier("CapturePacketTaskTag_\(tag.id)")
                            }
                        }
                    } else {
                        Text("This Session has no active project tags yet. Its canonical project identity will still be preserved.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    HStack {
                        Button("Add task") {
                            Task {
                                _ = await client.reviewPacketAction(
                                    candidate: candidate,
                                    decision: "ACCEPT",
                                    title: title,
                                    detail: detail,
                                    assignToMe: assignToMe,
                                    dueAt: hasDueDate ? dueAt : nil,
                                    tagIDs: Array(selectedTagIDs),
                                    previewOnly: previewOnly
                                )
                            }
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(decisionsDisabled || title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        .accessibilityIdentifier("CapturePacketTaskCreateButton")
                        Button("Cancel") { isCreating = false }
                            .buttonStyle(.bordered)
                            .accessibilityIdentifier("CapturePacketTaskCancelCreateButton")
                    }
                    Text("The transcript moment stays attached. You can edit or remove the task afterward.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            } else {
                HStack {
                    Button("Add task") {
                        Task {
                            _ = await client.reviewPacketAction(
                                candidate: candidate,
                                decision: "ACCEPT",
                                title: candidate.title,
                                detail: candidate.detail,
                                assignToMe: true,
                                dueAt: nil,
                                tagIDs: Array(Set(availableTags.filter(\.selectedForSession).map(\.id))),
                                previewOnly: previewOnly
                            )
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(previewOnly || decisionsLocked || client.isMutating)
                    .accessibilityIdentifier("CapturePacketTaskAcceptButton")
                    Button("Edit first") { isCreating = true }
                        .buttonStyle(.bordered)
                        .disabled(decisionsLocked || client.isMutating)
                        .accessibilityIdentifier("CapturePacketTaskEditButton")
                }
                Button("Add to existing task") {
                    mergeTargetID = mergeTargets.first?.id ?? ""
                    isMerging = true
                }
                .buttonStyle(.bordered)
                .disabled(decisionsDisabled || mergeTargets.isEmpty)
                .accessibilityIdentifier("CapturePacketTaskMergeModeButton")
                Button("Hide", role: .destructive) {
                    Task { _ = await client.reviewPacketAction(candidate: candidate, decision: "REJECT", title: nil, detail: nil, previewOnly: previewOnly) }
                }
                .buttonStyle(.bordered)
                .disabled(decisionsDisabled)
                .accessibilityIdentifier("CapturePacketTaskRejectButton")
            }
        }
        .padding(12)
        .background(Color.blue.opacity(0.07), in: RoundedRectangle(cornerRadius: 14))
        .onChange(of: candidate.reviewStatus) { _, _ in
            title = candidate.title
            detail = candidate.detail
            isCreating = false
            isMerging = false
            assignToMe = true
            hasDueDate = false
            selectedTagIDs = Set(availableTags.filter(\.selectedForSession).map(\.id))
        }
        .onChange(of: availableTags) { _, tags in
            guard !isCreating else { return }
            selectedTagIDs = Set(tags.filter(\.selectedForSession).map(\.id))
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("CapturePacketTaskCandidate_\(candidate.id)")
    }
}

private struct CapturePacketGoalCandidateCard: View {
    let candidate: CapturePacketGoalCandidate
    let projectName: String?
    let availableTags: [CapturePacketTaskTag]
    let mergeTargets: [CapturePacketGoalMergeTarget]
    let previewOnly: Bool
    let decisionsLocked: Bool
    @ObservedObject var client: CaptureTranscriptCorrectionClient
    let onOpenSource: () -> Void

    @State private var isCreating = false
    @State private var isMerging = false
    @State private var mergeTargetID = ""
    @State private var title: String
    @State private var description: String
    @State private var hasTargetDate = false
    @State private var targetAt = Date().addingTimeInterval(30 * 86_400)
    @State private var selectedTagIDs: Set<String>

    init(
        candidate: CapturePacketGoalCandidate,
        projectName: String?,
        availableTags: [CapturePacketTaskTag],
        mergeTargets: [CapturePacketGoalMergeTarget],
        previewOnly: Bool,
        decisionsLocked: Bool,
        client: CaptureTranscriptCorrectionClient,
        onOpenSource: @escaping () -> Void
    ) {
        self.candidate = candidate
        self.projectName = projectName
        self.availableTags = availableTags
        self.mergeTargets = mergeTargets
        self.previewOnly = previewOnly
        self.decisionsLocked = decisionsLocked
        self.client = client
        self.onOpenSource = onOpenSource
        _title = State(initialValue: candidate.suggestedTitle)
        _description = State(initialValue: candidate.suggestedDescription)
        _selectedTagIDs = State(initialValue: Set(availableTags.filter(\.selectedForSession).map(\.id)))
    }

    private var accepted: Bool {
        candidate.committedGoalId != nil
            || candidate.reviewStatus == "ACCEPTED_AS_GOAL"
            || candidate.reviewStatus == "MERGED_INTO_GOAL"
    }

    private var sourceWasReviewed: Bool {
        candidate.transcriptReviewStatus == "human-reviewed"
            && (candidate.sourceSpan?.segments.allSatisfy { $0.reviewStatus == "human-reviewed" } ?? true)
    }

    private var decisionsDisabled: Bool {
        previewOnly || decisionsLocked || client.isMutating
    }

    private var statusLabel: String {
        switch candidate.reviewStatus {
        case "EDITED_FOR_REVIEW": "ADJUSTED"
        case "DEFERRED_BY_HUMAN": "LATER"
        case "REJECTED_BY_HUMAN": "HIDDEN"
        case "ACCEPTED_AS_GOAL", "MERGED_INTO_GOAL": "ADDED"
        default: "IDEA"
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("\(candidate.startSeconds.captureTranscriptTimestamp)–\(candidate.endSeconds.captureTranscriptTimestamp) · \(captureTranscriptNonempty(candidate.speakerLabel) ?? "Unlabelled speaker")")
                        .font(.caption.monospacedDigit().weight(.bold))
                        .foregroundStyle(.purple)
                    Text(candidate.suggestedTitle)
                        .font(.headline)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 8)
                Text(statusLabel)
                    .font(.caption2.weight(.bold))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 5)
                    .background((accepted ? Color.green : Color.orange).opacity(0.12), in: Capsule())
            }
            Text(candidate.sourceText)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            CaptureTranscriptSpeakerEvidenceBadge(authority: candidate.speakerAuthority)
            if (candidate.segmentIds?.count ?? 1) > 1 {
                Label("This moment spans \(candidate.segmentIds?.count ?? 1) transcript passages", systemImage: "link")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
            Button("Play this moment", action: onOpenSource)
                .buttonStyle(.bordered)
            .frame(minHeight: 44)
            .accessibilityIdentifier("CapturePacketGoalSource_\(candidate.segmentId)")
            if !accepted && !sourceWasReviewed {
                Label("Play the source whenever you want to double-check this idea.", systemImage: "play.circle")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.orange)
                    .accessibilityIdentifier("CapturePacketGoalSourceReviewRequired")
            }

            if accepted {
                VStack(alignment: .leading, spacing: 5) {
                    Label(
                        candidate.reviewStatus == "MERGED_INTO_GOAL"
                            ? "Added to an existing goal"
                            : "Added to your goals",
                        systemImage: "checkmark.circle.fill"
                    )
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(.green)
                        .accessibilityIdentifier("CapturePacketGoalAccepted_\(candidate.id)")
                }
            } else if isCreating {
                VStack(alignment: .leading, spacing: 12) {
                    Label("Adjust goal", systemImage: "target")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(.purple)
                    Text("Change anything you want, or keep Quipsly's defaults.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    TextField("Goal title", text: $title, axis: .vertical)
                        .lineLimit(2...4)
                        .textFieldStyle(.roundedBorder)
                        .accessibilityIdentifier("CapturePacketGoalCreateTitleField")
                    TextField("Definition of progress (optional)", text: $description, axis: .vertical)
                        .lineLimit(2...5)
                        .textFieldStyle(.roundedBorder)
                        .accessibilityIdentifier("CapturePacketGoalCreateDescriptionField")
                    Toggle("Add a target date", isOn: $hasTargetDate)
                        .accessibilityIdentifier("CapturePacketGoalTargetDateToggle")
                    if hasTargetDate {
                        DatePicker(
                            "Target",
                            selection: $targetAt,
                            in: Date()...,
                            displayedComponents: [.date]
                        )
                        .accessibilityIdentifier("CapturePacketGoalTargetDatePicker")
                    }
                    if !availableTags.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Text(projectName.map { "\($0) tags" } ?? "Project tags")
                                .font(.caption.weight(.bold))
                            ForEach(availableTags) { tag in
                                Button {
                                    if selectedTagIDs.contains(tag.id) {
                                        selectedTagIDs.remove(tag.id)
                                    } else {
                                        selectedTagIDs.insert(tag.id)
                                    }
                                } label: {
                                    Label(tag.label, systemImage: selectedTagIDs.contains(tag.id) ? "checkmark.circle.fill" : "circle")
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                }
                                .buttonStyle(.bordered)
                                .accessibilityIdentifier("CapturePacketGoalTag_\(tag.id)")
                            }
                        }
                    } else {
                        Text("This Session has no active project tags yet. Its canonical project identity will still be preserved.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    HStack {
                        Button("Add goal") {
                            Task {
                                let normalizedTarget = hasTargetDate
                                    ? Calendar.current.date(bySettingHour: 12, minute: 0, second: 0, of: targetAt)
                                    : nil
                                _ = await client.reviewPacketGoal(
                                    candidate: candidate,
                                    decision: "ACCEPT",
                                    title: title,
                                    description: description,
                                    targetAt: normalizedTarget,
                                    tagIDs: Array(selectedTagIDs),
                                    previewOnly: previewOnly
                                )
                            }
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(.purple)
                        .disabled(decisionsDisabled || title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        .accessibilityIdentifier("CapturePacketGoalCreateButton")
                        Button("Cancel") { isCreating = false }
                            .buttonStyle(.bordered)
                            .accessibilityIdentifier("CapturePacketGoalCancelCreateButton")
                    }
                    Text("The transcript moment stays attached. You can edit or remove the goal afterward.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            } else if isMerging {
                VStack(alignment: .leading, spacing: 12) {
                    Label("Add to an existing goal", systemImage: "target")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(.blue)
                    Text("The transcript moment will stay attached without changing the goal's wording, status, or date.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    Picker("Existing goal", selection: $mergeTargetID) {
                        Text("Choose a goal…").tag("")
                        ForEach(mergeTargets) { target in
                            Text("\(target.title) · \(target.status.capitalized)")
                                .tag(target.id)
                        }
                    }
                    .pickerStyle(.menu)
                    .accessibilityIdentifier("CapturePacketGoalMergeTargetPicker")
                    if let target = mergeTargets.first(where: { $0.id == mergeTargetID }) {
                        VStack(alignment: .leading, spacing: 6) {
                            HStack(alignment: .top) {
                                Text(target.title)
                                    .font(.subheadline.weight(.bold))
                                    .fixedSize(horizontal: false, vertical: true)
                                Spacer()
                                Text(target.status.capitalized)
                                    .font(.caption2.weight(.bold))
                                    .padding(.horizontal, 7)
                                    .padding(.vertical, 4)
                                    .background(Color.blue.opacity(0.12), in: Capsule())
                            }
                            if let definition = target.description?.trimmingCharacters(in: .whitespacesAndNewlines), !definition.isEmpty {
                                Text(definition)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .fixedSize(horizontal: false, vertical: true)
                            } else {
                                Text("No goal definition recorded.")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Text("\(target.evidenceCount) existing evidence \(target.evidenceCount == 1 ? "receipt" : "receipts")")
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(.blue)
                        }
                        .padding(10)
                        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
                        .accessibilityIdentifier("CapturePacketGoalMergeTargetSummary_\(target.id)")
                    }
                    HStack {
                        Button("Add to goal") {
                            guard let target = mergeTargets.first(where: { $0.id == mergeTargetID }) else { return }
                            Task {
                                _ = await client.reviewPacketGoal(
                                    candidate: candidate,
                                    decision: "MERGE",
                                    title: nil,
                                    description: nil,
                                    mergeTarget: target,
                                    previewOnly: previewOnly
                                )
                            }
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(.blue)
                        .disabled(decisionsDisabled || mergeTargetID.isEmpty)
                        .accessibilityIdentifier("CapturePacketGoalMergeButton")
                        Button("Cancel") {
                            isMerging = false
                            mergeTargetID = ""
                        }
                        .buttonStyle(.bordered)
                        .accessibilityIdentifier("CapturePacketGoalCancelMergeButton")
                    }
                    Text("Adds this source to the selected goal without changing its status, date, tags, tasks, or progress.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            } else {
                HStack {
                    Button("Add goal") {
                        Task {
                            _ = await client.reviewPacketGoal(
                                candidate: candidate,
                                decision: "ACCEPT",
                                title: candidate.suggestedTitle,
                                description: candidate.suggestedDescription,
                                targetAt: nil,
                                tagIDs: Array(Set(availableTags.filter(\.selectedForSession).map(\.id))),
                                previewOnly: previewOnly
                            )
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.purple)
                    .disabled(previewOnly || decisionsLocked || client.isMutating)
                    .accessibilityIdentifier("CapturePacketGoalAcceptButton")
                    Button("Edit first") { isCreating = true }
                        .buttonStyle(.bordered)
                        .disabled(decisionsLocked || client.isMutating)
                        .accessibilityIdentifier("CapturePacketGoalEditButton")
                }
                Button("Add evidence to existing goal") { isMerging = true }
                    .buttonStyle(.bordered)
                    .tint(.blue)
                    .disabled(decisionsLocked || client.isMutating || mergeTargets.isEmpty)
                    .accessibilityIdentifier("CapturePacketGoalBeginMergeButton")
                if mergeTargets.isEmpty {
                    Text("Create an actor-owned active goal in this Nest first to add evidence without creating a duplicate.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Button("Hide", role: .destructive) {
                    Task { _ = await client.reviewPacketGoal(candidate: candidate, decision: "REJECT", title: nil, description: nil, previewOnly: previewOnly) }
                }
                .buttonStyle(.bordered)
                .disabled(decisionsDisabled)
                .accessibilityIdentifier("CapturePacketGoalRejectButton")
            }
        }
        .padding(12)
        .background(Color.purple.opacity(0.07), in: RoundedRectangle(cornerRadius: 14))
        .onChange(of: candidate.reviewStatus) { _, _ in
            title = candidate.suggestedTitle
            description = candidate.suggestedDescription
            isCreating = false
            isMerging = false
            mergeTargetID = ""
            hasTargetDate = false
            selectedTagIDs = Set(availableTags.filter(\.selectedForSession).map(\.id))
        }
        .onChange(of: availableTags) { _, tags in
            guard !isCreating else { return }
            selectedTagIDs = Set(tags.filter(\.selectedForSession).map(\.id))
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("CapturePacketGoalCandidate_\(candidate.id)")
    }
}

private struct CaptureTranscriptAudioQualityCard: View {
    let recording: LocalRecording

    @StateObject private var mastery = CaptureAudioMasteryClient()

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: statusIcon)
                    .foregroundStyle(statusTint)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 3) {
                    Text(statusTitle)
                        .font(.subheadline.weight(.bold))
                    Text(statusDetail)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
                if mastery.isLoading {
                    ProgressView()
                        .controlSize(.small)
                        .accessibilityLabel("Checking recording quality")
                }
            }

            if let signal = recording.sourceProfile?.audioSignal {
                HStack(spacing: 8) {
                    if let integrated = signal.loudness?.integratedLoudnessLufs {
                        signalMetric(
                            value: String(format: "%.1f", integrated),
                            label: "LUFS"
                        )
                    } else {
                        signalMetric(
                            value: String(format: "%.1f", signal.rmsDbfs),
                            label: "RMS dBFS"
                        )
                    }
                    signalMetric(
                        value: String(format: "%.1f", signal.samplePeakDbfs),
                        label: "peak dBFS"
                    )
                    signalMetric(
                        value: "\(signal.observations.count)",
                        label: "listen points"
                    )
                }
                Text(signal.loudness?.integratedLoudnessLufs == nil
                    ? "Measured across the decoded source. RMS is not LUFS, and listen points are review candidates—not confirmed defects."
                    : "Programme loudness uses the complete decoded source and ITU-R BS.1770-5. Listen points remain review candidates—not confirmed defects.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("CaptureTranscriptAudioSignalBoundary")
            }

            NavigationLink {
                CaptureSourceEvidenceView(recordingID: recording.id)
            } label: {
                Label("Open recording quality", systemImage: "waveform.badge.magnifyingglass")
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.bordered)
            .accessibilityHint("Opens the exact recording's waveform, source audition, improved listening copy, and technical evidence.")
            .accessibilityIdentifier("CaptureTranscriptAudioQualityOpen_\(recording.id)")

            if let notice = mastery.notice,
               mastery.snapshot?.status == "failed" || mastery.snapshot?.status == "blocked" {
                Text(notice)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.orange)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(11)
        .background(statusTint.opacity(0.07), in: RoundedRectangle(cornerRadius: 12))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("CaptureTranscriptAudioQualityCard")
        .task(id: taskID) {
            guard AuthManager.shared.networkActionsAllowed else { return }
            await mastery.open(recording: recording)
        }
        .onDisappear { mastery.stop() }
    }

    private func signalMetric(value: String, label: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(value)
                .font(.caption.monospacedDigit().weight(.bold))
            Text(label)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(7)
        .background(Color.primary.opacity(0.045), in: RoundedRectangle(cornerRadius: 8))
    }

    private var statusTitle: String {
        guard hasCloudCoordinates else { return "Recording quality after upload" }
        guard let snapshot = mastery.snapshot else {
            return mastery.isLoading ? "Checking the full recording" : "Recording quality"
        }
        switch snapshot.status {
        case "queued", "processing", "output-ready":
            return "Checking the full recording"
        case "completed" where snapshot.derivative?.playbackUrl != nil:
            return "Improved listening copy ready"
        case "completed":
            return "Recording quality checked"
        case "failed", "blocked":
            return "Recording quality needs attention"
        default:
            return "Recording quality"
        }
    }

    private var statusDetail: String {
        guard hasCloudCoordinates else {
            return "Quipsly will check the complete source after its secure upload. The original remains unchanged."
        }
        guard let snapshot = mastery.snapshot else {
            return AuthManager.shared.networkActionsAllowed
                ? "Quipsly is matching this transcript to the exact uploaded source."
                : "Reconnect to check the exact uploaded source."
        }
        switch snapshot.status {
        case "queued", "processing", "output-ready":
            return "You can keep reviewing the transcript while Quipsly prepares a separate listening copy."
        case "completed" where snapshot.derivative?.playbackUrl != nil:
            return "Compare the verified improved copy with the immutable original in Recording quality."
        case "completed":
            return "The complete source was checked; Quipsly did not create a different copy just to manufacture a result."
        case "failed", "blocked":
            return "Open Recording quality to see the exact source status and retry without changing the original."
        default:
            return "Open the exact source for waveform, sound, and improvement evidence."
        }
    }

    private var statusIcon: String {
        switch mastery.snapshot?.status {
        case "completed" where mastery.snapshot?.derivative?.playbackUrl != nil:
            return "wand.and.sparkles"
        case "completed":
            return "checkmark.circle.fill"
        case "failed", "blocked":
            return "exclamationmark.triangle.fill"
        default:
            return "waveform.badge.magnifyingglass"
        }
    }

    private var statusTint: Color {
        switch mastery.snapshot?.status {
        case "completed": .green
        case "failed", "blocked": .orange
        default: .indigo
        }
    }

    private var hasCloudCoordinates: Bool {
        recording.projectSlug?.nonemptyTranscriptValue != nil
            && recording.uploadedMediaAssetId?.nonemptyTranscriptValue != nil
            && recording.uploadedSourceId?.nonemptyTranscriptValue != nil
    }

    private var taskID: String {
        [
            recording.id.uuidString.lowercased(),
            recording.ownerAccountID ?? "",
            recording.projectSlug ?? "",
            recording.uploadedMediaAssetId ?? "",
            recording.uploadedSourceId ?? "",
        ].joined(separator: "|")
    }
}

private struct CaptureTranscriptSpeakerGroupCard: View {
    let roomID: String
    let transcriptJobID: String
    let group: CaptureTranscriptSpeakerGroup
    let participants: [CaptureTranscriptParticipant]
    let recording: LocalRecording?
    let expectedRecordingAssetID: String?
    let protectedSource: CaptureTranscriptPlayback?
    @ObservedObject var protectedPlayback: CaptureSessionProtectedPlaybackController
    let previewOnly: Bool
    @ObservedObject var client: CaptureTranscriptCorrectionClient
    @ObservedObject var playback: CaptureTranscriptPlaybackController
    let library: LocalRecordingLibrary

    @State private var selectedParticipantID = ""
    @State private var confirmedSamplePositions: [String: TimeInterval] = [:]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Provider \(group.providerSpeakerLabel)")
                        .font(.headline)
                    Text("\(group.turnCount) \(group.turnCount == 1 ? "turn" : "turns") in the current provider transcript")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                if let attribution = group.attribution {
                    Label(attribution.attributedLabel, systemImage: "checkmark.shield.fill")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.green)
                }
            }

            if group.staleAttribution {
                Label(
                    "The provider voice cluster changed after its last assignment. Listen again before replacing it.",
                    systemImage: "arrow.triangle.2.circlepath"
                )
                .font(.caption)
                .foregroundStyle(.orange)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("CaptureTranscriptSpeakerStale_\(group.providerSpeakerLabel)")
            }

            if participants.isEmpty {
                Label(
                    "Add a named Session participant before identifying this voice.",
                    systemImage: "person.crop.circle.badge.exclamationmark"
                )
                .font(.caption)
                .foregroundStyle(.orange)
            } else {
                Picker("Session participant", selection: $selectedParticipantID) {
                    ForEach(participants) { participant in
                        Text(participant.isCurrentActor
                            ? "\(participant.displayLabel) · you"
                            : participant.displayLabel
                        )
                        .tag(participant.id)
                    }
                }
                .pickerStyle(.menu)
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                .accessibilityIdentifier("CaptureTranscriptSpeakerParticipant_\(group.providerSpeakerLabel)")
            }

            VStack(alignment: .leading, spacing: 10) {
                Text("Playback evidence")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.secondary)
                ForEach(group.samples) { sample in
                    speakerSample(sample)
                }
            }

            if let pendingAttribution {
                VStack(alignment: .leading, spacing: 7) {
                    Label(
                        pendingAttribution.disposition == .held
                            ? "Voice identity held for review"
                            : "Voice identity queued on \(CaptureDeviceVocabulary.thisDevice)",
                        systemImage: pendingAttribution.disposition == .held
                            ? "exclamationmark.shield.fill"
                            : "arrow.triangle.2.circlepath"
                    )
                    .font(.caption.weight(.bold))
                    .foregroundStyle(pendingAttribution.disposition == .held ? Color.orange : Color.indigo)
                    Text(
                        pendingAttribution.lastErrorMessage
                            ?? "The participant, full provider-cluster snapshot, and playback receipts are protected until Nest acknowledges this stable request. No words are marked reviewed."
                    )
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    if pendingAttribution.disposition == .held {
                        Button("Review state and retry") {
                            Task {
                                await client.retryHeldSpeakerAttribution(
                                    pendingAttribution.id,
                                    roomID: roomID
                                )
                            }
                        }
                        .buttonStyle(.bordered)
                        .disabled(client.isMutating || !AuthManager.shared.networkActionsAllowed)
                        .frame(minHeight: 44)
                        .accessibilityIdentifier("CaptureTranscriptSpeakerRetry_\(group.providerSpeakerLabel)")
                    }
                }
                .padding(12)
                .background(
                    (pendingAttribution.disposition == .held ? Color.orange : Color.indigo)
                        .opacity(0.08),
                    in: RoundedRectangle(cornerRadius: 12)
                )
                .accessibilityIdentifier("CaptureTranscriptSpeakerPending_\(group.providerSpeakerLabel)")
            } else {
                Button {
                    Task {
                        _ = await client.identifyProviderSpeaker(
                            roomID: roomID,
                            transcriptJobID: transcriptJobID,
                            group: group,
                            participantID: selectedParticipantID,
                            samplePositions: confirmedSamplePositions,
                            previewOnly: previewOnly
                        )
                    }
                } label: {
                    Label(
                        group.attribution == nil ? "Identify this voice" : "Update voice identity",
                        systemImage: "person.wave.2.fill"
                    )
                    .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.borderedProminent)
                .tint(.indigo)
                .accessibilityHint("Saves only a provider voice to participant mapping. Transcript words remain unreviewed.")
                .accessibilityIdentifier("CaptureTranscriptIdentifySpeaker_\(group.providerSpeakerLabel)")
                .disabled(
                    previewOnly
                        || client.isMutating
                        || selectedParticipantID.isEmpty
                        || confirmedSamplePositions.isEmpty
                        || !canPlaySource
                )
            }

            Text("Voice naming changes display labels only. Editing words and the optional Mark checked action stay separate.")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("CaptureTranscriptSpeakerWordReviewBoundary_\(group.providerSpeakerLabel)")
        }
        .padding(14)
        .background(Color.indigo.opacity(0.055), in: RoundedRectangle(cornerRadius: 16))
        .overlay {
            RoundedRectangle(cornerRadius: 16)
                .stroke(Color.indigo.opacity(0.16), lineWidth: 1)
        }
        .task {
            if selectedParticipantID.isEmpty {
                selectedParticipantID = pendingAttribution?.participantID
                    ?? group.attribution?.participantId
                    ?? participants.first(where: \.isCurrentActor)?.id
                    ?? participants.first?.id
                    ?? ""
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("CaptureTranscriptSpeakerGroup_\(group.providerSpeakerLabel)")
    }

    @ViewBuilder
    private func speakerSample(_ sample: CaptureTranscriptSpeakerSample) -> some View {
        let livePosition = playback.confirmedPosition(
            for: sample,
            recordingAssetID: expectedRecordingAssetID
        )
        let chosenPosition = confirmedSamplePositions[sample.segmentId]
        VStack(alignment: .leading, spacing: 7) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("\(sample.startSeconds.captureTranscriptTimestamp)–\(sample.endSeconds.captureTranscriptTimestamp)")
                        .font(.caption.monospacedDigit().weight(.bold))
                        .foregroundStyle(.indigo)
                    Text(sample.text)
                        .font(.caption)
                        .lineLimit(3)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 10)
                Button {
                    Task {
                        await playback.play(
                            sample: sample,
                            recording: recording,
                            library: library,
                            expectedRecordingAssetID: expectedRecordingAssetID,
                            protectedSource: protectedSource,
                            protectedController: protectedPlayback
                        )
                    }
                } label: {
                    if protectedPlayback.isPreparing && !hasExactLocalSource {
                        Label("Preparing…", systemImage: "arrow.down.circle")
                            .frame(minHeight: 44)
                    } else {
                        Label("Play", systemImage: "play.fill")
                            .frame(minHeight: 44)
                    }
                }
                .buttonStyle(.bordered)
                .disabled(!canPlaySource || client.isMutating || protectedPlayback.isPreparing)
                .accessibilityLabel("Play voice sample from \(sample.startSeconds.captureTranscriptTimestamp)")
                .accessibilityIdentifier("CaptureTranscriptSpeakerPlay_\(sample.segmentId)")
            }
            if chosenPosition != nil {
                Button {
                    confirmedSamplePositions.removeValue(forKey: sample.segmentId)
                } label: {
                    Label("Heard sample selected", systemImage: "checkmark.circle.fill")
                }
                .buttonStyle(.borderless)
                .foregroundStyle(.green)
                .accessibilityHint("Removes this sample from the voice identity review.")
                .accessibilityIdentifier("CaptureTranscriptSpeakerSampleSelected_\(sample.segmentId)")
            } else if let livePosition {
                Button {
                    guard confirmedSamplePositions.count < 3 else { return }
                    confirmedSamplePositions[sample.segmentId] = livePosition
                } label: {
                    Label("Use heard sample", systemImage: "ear.badge.checkmark")
                }
                .buttonStyle(.bordered)
                .accessibilityIdentifier("CaptureTranscriptSpeakerUseSample_\(sample.segmentId)")
            } else {
                Text("Listen through this sample before it can be used.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(10)
        .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
    }

    private var pendingAttribution: PendingTranscriptSpeakerAttribution? {
        client.pendingSpeakerAttribution(
            roomID: roomID,
            providerSpeakerLabel: group.providerSpeakerLabel
        )
    }

    private var hasExactLocalSource: Bool {
        guard let recording,
              recording.status.isPlaybackEligible,
              let expectedRecordingAssetID,
              recording.recordingAssetId == expectedRecordingAssetID,
              library.fileURL(for: recording) != nil else { return false }
        return true
    }

    private var canPlaySource: Bool {
        hasExactLocalSource || (
            protectedSource?.recordingAssetId == expectedRecordingAssetID
                && protectedSource?.mobileProtectedSource != nil
        )
    }
}

private struct CaptureTranscriptSegmentCard: View {
    let roomID: String
    let sessionTitle: String
    let transcriptJobID: String?
    let segment: CaptureTranscriptSegment
    let recording: LocalRecording?
    let expectedRecordingAssetID: String?
    let attention: CaptureTranscriptAttentionSegment?
    let previewOnly: Bool
    let decisionsLocked: Bool
    let canUseProjectTeamNotes: Bool
    @ObservedObject var client: CaptureTranscriptCorrectionClient
    @ObservedObject var playback: CaptureTranscriptPlaybackController
    let protectedSource: CaptureTranscriptPlayback?
    @ObservedObject var protectedPlayback: CaptureSessionProtectedPlaybackController
    let library: LocalRecordingLibrary

    @State private var isEditing = false
    @State private var correctedText = ""
    @State private var correctedSpeaker = ""
    @State private var reason = ""
    @State private var draftSaveTask: Task<Void, Never>?
    @State private var draftStatus: String?
    @State private var isCreatingTask = false
    @State private var taskTitle = ""
    @State private var taskDetail = ""
    @State private var taskRequestID = "iphone-transcript-task-\(UUID().uuidString)"
    @State private var isCreatingGoal = false
    @State private var goalTitle = ""
    @State private var goalDescription = ""
    @State private var goalRequestID = "iphone-transcript-goal-\(UUID().uuidString)"
    @State private var isCreatingNote = false
    @State private var noteTitle = ""
    @State private var noteBody = ""
    @State private var noteKind = MobileSessionNoteKind.sessionNote
    @State private var noteVisibility = MobileSessionNoteVisibility.authorPrivate
    @State private var noteRequestID = "iphone-transcript-note-\(UUID().uuidString)"

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 5) {
                    Text("\(segment.sessionStartSeconds.captureTranscriptTimestamp)–\(segment.sessionEndSeconds.captureTranscriptTimestamp)")
                        .font(.caption.monospacedDigit().weight(.bold))
                        .foregroundStyle(.blue)
                    Text(captureTranscriptNonempty(segment.speakerLabel) ?? "Unlabelled speaker")
                        .font(.headline)
                    CaptureTranscriptSpeakerEvidenceBadge(
                        authority: segment.speakerAuthority,
                        identifier: "CaptureTranscriptSegmentSpeakerEvidence_\(segment.id)"
                    )
                    Text(segment.text)
                        .font(.body)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 12)
                Button {
                    Task {
                        await playback.play(
                            segment: segment,
                            recording: recording,
                            library: library,
                            expectedRecordingAssetID: expectedRecordingAssetID,
                            protectedSource: protectedSource,
                            protectedController: protectedPlayback
                        )
                    }
                } label: {
                    if protectedPlayback.isPreparing && !hasExactLocalSource {
                        Label("Preparing…", systemImage: "arrow.down.circle")
                            .frame(minHeight: 44)
                    } else {
                        Label("Play", systemImage: "play.fill")
                            .frame(minHeight: 44)
                    }
                }
                .buttonStyle(.bordered)
                .disabled(!canPlaySource || client.isMutating || protectedPlayback.isPreparing)
                .accessibilityLabel("Play transcript segment from Session time \(segment.sessionStartSeconds.captureTranscriptTimestamp)")
                .accessibilityIdentifier("CaptureTranscriptPlayButton_\(segment.id)")
            }

            if !hasExactLocalSource && protectedSource?.kind == "video" {
                Label(
                    "Quipsly will not download the full video just to review this sentence. Prepare an audio source or review the protected recording explicitly.",
                    systemImage: "video.badge.ellipsis"
                )
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("CaptureTranscriptVideoDownloadBoundary_\(segment.id)")
            }

            if let attention {
                transcriptConfidenceEvidence(attention)
            } else if let confidence = segment.confidence {
                Label(
                    "\(Int((confidence * 100).rounded()))% provider confidence · not measured accuracy",
                    systemImage: "waveform.badge.magnifyingglass"
                )
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
                .accessibilityIdentifier("CaptureTranscriptProviderConfidence_\(segment.id)")
            }

            if let accepted = segment.acceptedCorrection {
                VStack(alignment: .leading, spacing: 5) {
                    Label("Transcript correction · revision \(accepted.revisions.count)", systemImage: "checkmark.circle.fill")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.green)
                    Text("Provider: \(captureTranscriptNonempty(segment.providerSpeakerLabel) ?? "Unlabelled") — \(segment.providerText)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(12)
                .background(Color.green.opacity(0.09), in: RoundedRectangle(cornerRadius: 12))
            }

            if segment.acceptedCorrection == nil,
               segment.acceptedVerification != nil {
                VStack(alignment: .leading, spacing: 5) {
                    Label("Checked against the audio", systemImage: "checkmark.circle.fill")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.green)
                    Text("You listened to this passage and left the words as they are.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(12)
                .background(Color.green.opacity(0.09), in: RoundedRectangle(cornerRadius: 12))
                .accessibilityIdentifier("CaptureTranscriptVerifiedAsIs_\(segment.id)")
            }

            if segment.acceptedCorrection == nil,
               let attribution = segment.speakerAttribution {
                VStack(alignment: .leading, spacing: 5) {
                    Label("Voice identified from Session samples", systemImage: "person.wave.2.fill")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.indigo)
                    Text("Provider \(attribution.providerSpeakerLabel) is displayed as \(attribution.attributedLabel). This does not mark this turn's words playback-reviewed.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(12)
                .background(Color.indigo.opacity(0.09), in: RoundedRectangle(cornerRadius: 12))
                .accessibilityIdentifier("CaptureTranscriptSpeakerAttribution_\(segment.id)")
            }

            if let impacts = segment.downstreamImpacts, !impacts.isEmpty {
                downstreamImpactReview(impacts)
            }

            ForEach(segment.proposals) { proposal in
                proposalReview(proposal)
            }

            if let pendingDecision {
                VStack(alignment: .leading, spacing: 7) {
                    Label(
                        pendingDecision.disposition == .held
                            ? "Transcript change needs attention"
                            : "Transcript change saved on \(CaptureDeviceVocabulary.thisDevice)",
                        systemImage: pendingDecision.disposition == .held
                            ? "exclamationmark.shield.fill"
                            : "arrow.triangle.2.circlepath"
                    )
                    .font(.caption.weight(.bold))
                    .foregroundStyle(
                        pendingDecision.disposition == .held ? Color.orange : Color.blue
                    )
                    Text(
                        pendingDecision.lastErrorMessage
                            ?? "The edit and its exact transcript source are protected until Nest finishes syncing."
                    )
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    if pendingDecision.disposition == .held {
                        Button("Review state and retry") {
                            Task {
                                await client.retryHeldDecision(
                                    pendingDecision.id,
                                    roomID: roomID
                                )
                            }
                        }
                        .buttonStyle(.bordered)
                        .disabled(client.isMutating || !AuthManager.shared.networkActionsAllowed)
                        .frame(minHeight: 44)
                        .accessibilityIdentifier("CaptureTranscriptDecisionRetry_\(segment.id)")
                    }
                }
                .padding(12)
                .background(
                    (pendingDecision.disposition == .held ? Color.orange : Color.blue)
                        .opacity(0.08),
                    in: RoundedRectangle(cornerRadius: 12)
                )
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("CaptureTranscriptDecisionPending_\(segment.id)")
                .accessibilityValue(
                    pendingDecision.disposition == .held ? "Held" : "Queued"
                )
            }

            if isEditing {
                correctionEditor
            } else {
                Button(segment.acceptedCorrection == nil ? "Edit transcript" : "Revise correction") {
                    beginEditing()
                }
                .buttonStyle(.borderedProminent)
                .tint(.blue)
                .disabled(client.isMutating || pendingDecision != nil)
                .accessibilityIdentifier("CaptureTranscriptCorrectButton_\(segment.id)")

                if segment.acceptedCorrection == nil,
                   segment.acceptedVerification == nil {
                    Button("Mark checked") {
                        guard let playbackPosition else { return }
                        Task {
                            await client.confirmSegmentAsIs(
                                roomID: roomID,
                                segment: segment,
                                playbackPosition: playbackPosition,
                                previewOnly: previewOnly
                            )
                        }
                    }
                    .buttonStyle(.bordered)
                    .tint(.secondary)
                    .disabled(playbackPosition == nil || client.isMutating || previewOnly || pendingDecision != nil)
                    .accessibilityIdentifier("CaptureTranscriptConfirmAsIsButton_\(segment.id)")
                    .accessibilityHint(
                        decisionsLocked
                            ? "Optional. Saves that you checked this passage on \(CaptureDeviceVocabulary.thisDevice) and syncs when Quipsly reconnects."
                            : "Optional. Marks this passage checked after you listen to it."
                    )
                }
            }

            if !previewOnly, let transcriptJobID {
                NavigationLink {
                    CaptureRecordingEditScreen(
                        roomID: roomID,
                        sessionTitle: sessionTitle,
                        focus: CaptureRecordingEditorFocus(
                            transcriptJobID: transcriptJobID,
                            segmentID: segment.id
                        )
                    )
                } label: {
                    Label("Edit recording here", systemImage: "scissors")
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.bordered)
                .accessibilityHint("Opens this exact transcript passage in the private recording editor. It does not remove words or change the original.")
                .accessibilityIdentifier("CaptureTranscriptEditRecording_\(segment.id)")
            }

            transcriptNoteComposer
            transcriptTaskComposer
            transcriptGoalComposer

            if !segment.correctionHistory.isEmpty {
                Label("\(segment.correctionHistory.count) correction record(s) preserved", systemImage: "clock.arrow.circlepath")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .reviewCard()
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("CaptureTranscriptSegment_\(segment.id)")
        .onChange(of: correctedText) { _, _ in scheduleDraftSave() }
        .onChange(of: correctedSpeaker) { _, _ in scheduleDraftSave() }
        .onChange(of: reason) { _, _ in scheduleDraftSave() }
        .onDisappear {
            draftSaveTask?.cancel()
            persistDraftIfNeeded()
        }
    }

    private func transcriptConfidenceEvidence(
        _ attention: CaptureTranscriptAttentionSegment
    ) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            Label(
                attention.reviewed ? "Confidence triage remains after review" : "Prioritized for listening",
                systemImage: "ear.badge.exclamationmark"
            )
            .font(.caption.weight(.bold))
            .foregroundStyle(.indigo)
            if let minimum = attention.minimumWordConfidence {
                Text("Lowest provider word confidence: \(Int((minimum * 100).rounded()))%. This ranks review effort; it does not estimate whether the whole segment is correct.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                Text("This unreviewed segment has no qualified word-confidence evidence. Listen before relying on it downstream.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if !attention.lowConfidenceWords.isEmpty {
                Text(
                    "Listen around: "
                        + attention.lowConfidenceWords.map {
                            "\($0.word) (\(Int(($0.confidence * 100).rounded()))%)"
                        }.joined(separator: " · ")
                )
                .font(.caption.monospacedDigit().weight(.semibold))
                .foregroundStyle(.indigo)
                .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(11)
        .background(Color.indigo.opacity(0.075), in: RoundedRectangle(cornerRadius: 11))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("CaptureTranscriptConfidenceAttention_\(segment.id)")
    }

    private func downstreamImpactReview(
        _ impacts: [CaptureTranscriptDownstreamImpact]
    ) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Linked work", systemImage: "arrow.triangle.branch")
                .font(.caption.weight(.bold))
                .foregroundStyle(impacts.contains(where: \.needsReview) ? Color.orange : Color.green)
            Text("These notes, tasks, goals, or follow-ups link back to this transcript moment. Your correction did not overwrite them.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            ForEach(impacts) { impact in
                downstreamImpactCard(impact)
            }
        }
        .padding(12)
        .background(Color.orange.opacity(0.065), in: RoundedRectangle(cornerRadius: 12))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("CaptureTranscriptDownstreamImpacts_\(segment.id)")
    }

    @ViewBuilder
    private func downstreamImpactCard(
        _ impact: CaptureTranscriptDownstreamImpact
    ) -> some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(impact.kindLabel.uppercased())
                        .font(.caption2.weight(.black))
                        .foregroundStyle(impact.needsReview ? Color.orange : Color.green)
                    Text(impact.label)
                        .font(.subheadline.weight(.bold))
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 8)
                Text(impactStateLabel(impact))
                    .font(.caption2.weight(.black))
                    .foregroundStyle(impact.needsReview ? Color.orange : Color.green)
                    .multilineTextAlignment(.trailing)
            }

            if impact.needsReview {
                if impact.changes.text == "changed" {
                    comparisonRow(
                        title: "Words used by linked item",
                        prior: impact.priorTextSnapshot,
                        current: impact.currentTextSnapshot
                    )
                }
                if impact.changes.speaker == "changed" {
                    comparisonRow(
                        title: "Speaker used by linked item",
                        prior: impact.priorSpeakerLabelSnapshot,
                        current: impact.currentSpeakerLabel
                    )
                }
                if impact.changes.text != "changed", impact.changes.speaker != "changed" {
                    Label(
                        "The accepted correction receipt changed while the displayed wording and speaker stayed the same.",
                        systemImage: "doc.badge.clock"
                    )
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                }

                if impact.canAcknowledge {
                    Button {
                        Task {
                            guard let transcriptJobID = segment.transcriptJobId
                                ?? client.desk?.transcriptJobId else { return }
                            await client.acknowledgeDownstreamImpact(
                                roomID: roomID,
                                transcriptJobID: transcriptJobID,
                                segment: segment,
                                impact: impact,
                                previewOnly: previewOnly
                            )
                        }
                    } label: {
                        Label("Keep \(impact.kindLabel.lowercased()) as written", systemImage: "checkmark.seal")
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.orange)
                    .disabled(
                        client.isMutating
                            || previewOnly
                            || decisionsLocked
                    )
                    .accessibilityIdentifier("CaptureTranscriptImpactAcknowledge_\(impact.artifactKind)_\(impact.artifactId)")
                    .accessibilityHint("Keeps the item as written and updates its transcript source link.")
                } else {
                    Label(
                        "The current owner must review this item. You can inspect the evidence, but Capture will not broaden write authority.",
                        systemImage: "person.badge.shield.checkmark"
                    )
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                }
            } else if impact.state == "snapshot-unavailable" {
                Label(
                    "This older item lacks an exact correction snapshot, so Quipsly cannot safely mark it current.",
                    systemImage: "questionmark.diamond"
                )
                .font(.caption)
                .foregroundStyle(.orange)
                .fixedSize(horizontal: false, vertical: true)
            } else {
                Label(
                    "This linked item already carries current transcript evidence.",
                    systemImage: "checkmark.circle.fill"
                )
                .font(.caption.weight(.semibold))
                .foregroundStyle(.green)
            }
        }
        .padding(11)
        .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 11))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("CaptureTranscriptImpact_\(impact.artifactKind)_\(impact.artifactId)")
    }

    private func comparisonRow(
        title: String,
        prior: String?,
        current: String?
    ) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(title)
                .font(.caption2.weight(.bold))
                .foregroundStyle(.secondary)
            Text("Before · \(captureTranscriptNonempty(prior) ?? "Snapshot unavailable")")
                .font(.caption)
                .foregroundStyle(.red)
                .fixedSize(horizontal: false, vertical: true)
            Text("Current · \(captureTranscriptNonempty(current) ?? "Unlabelled")")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.green)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(9)
        .background(Color.primary.opacity(0.035), in: RoundedRectangle(cornerRadius: 9))
    }

    private func impactStateLabel(_ impact: CaptureTranscriptDownstreamImpact) -> String {
        switch impact.state {
        case "needs-review": "SOURCE CHANGED"
        case "snapshot-unavailable": "OLDER LINK"
        default: "UP TO DATE"
        }
    }

    private var correctionEditor: some View {
        VStack(alignment: .leading, spacing: 10) {
            TextField("Correct speaker", text: $correctedSpeaker)
                .textFieldStyle(.roundedBorder)
                .accessibilityIdentifier("CaptureTranscriptCorrectSpeakerField")
            TextField("Correct words", text: $correctedText, axis: .vertical)
                .lineLimit(3...8)
                .textFieldStyle(.roundedBorder)
                .accessibilityIdentifier("CaptureTranscriptCorrectWordsField")
            TextField("Why this changed (optional)", text: $reason, axis: .vertical)
                .lineLimit(2...4)
                .textFieldStyle(.roundedBorder)
            Label(
                playbackPosition == nil
                    ? "Save directly, or listen first when the audio will help."
                    : "This edit will retain the playback position you just heard.",
                systemImage: playbackPosition == nil ? "square.and.pencil" : "ear.fill"
            )
                .font(.caption.weight(.semibold))
                .foregroundStyle(playbackPosition == nil ? Color.secondary : Color.green)
            if let draftStatus {
                Label(draftStatus, systemImage: "internaldrive.fill")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .accessibilityIdentifier("CaptureTranscriptLocalDraftStatus")
            }
            VStack(alignment: .leading, spacing: 8) {
                Button(decisionsLocked ? "Save when reconnected" : "Save correction") {
                    Task {
                        if await client.acceptHumanCorrection(
                            roomID: roomID,
                            segment: segment,
                            correctedText: correctedText,
                            correctedSpeaker: correctedSpeaker,
                            reason: reason,
                            playbackPosition: playbackPosition,
                            previewOnly: previewOnly
                        ) {
                            CaptureTranscriptCorrectionDraftStore.remove(roomID: roomID, segmentID: segment.id)
                            draftStatus = nil
                            isEditing = false
                        }
                    }
                }
                .buttonStyle(.borderedProminent)
                .frame(maxWidth: .infinity, minHeight: 44)
                .disabled(client.isMutating || previewOnly || pendingDecision != nil || correctionIsEmptyOrUnchanged)
                .accessibilityIdentifier("CaptureTranscriptAcceptCorrectionButton_\(segment.id)")
                Button("Keep draft") {
                    persistDraftIfNeeded()
                    isEditing = false
                }
                .buttonStyle(.bordered)
                .frame(maxWidth: .infinity, minHeight: 44)
            }
            Button("Discard local draft", role: .destructive) {
                draftSaveTask?.cancel()
                CaptureTranscriptCorrectionDraftStore.remove(roomID: roomID, segmentID: segment.id)
                draftStatus = nil
                isEditing = false
            }
            .font(.caption.weight(.semibold))
            .frame(minHeight: 44)
            .contentShape(Rectangle())
            Text("Quipsly saves a versioned correction linked to this exact place in the recording. The original transcript and recording remain recoverable.")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .padding(12)
        .background(Color.orange.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
    }

    private var transcriptTaskComposer: some View {
        VStack(alignment: .leading, spacing: 9) {
            if isCreatingTask {
                Label("Task", systemImage: "checklist")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.blue)
                TextField("Task title", text: $taskTitle, axis: .vertical)
                    .lineLimit(2...4)
                    .textFieldStyle(.roundedBorder)
                    .accessibilityIdentifier("CaptureTranscriptTaskTitleField")
                TextField("Useful detail (optional)", text: $taskDetail, axis: .vertical)
                    .lineLimit(2...5)
                    .textFieldStyle(.roundedBorder)
                HStack {
                    Button("Create my task") {
                        Task {
                            let saved = await client.createTask(
                                roomID: roomID,
                                segment: segment,
                                title: taskTitle,
                                detail: taskDetail,
                                clientRequestID: taskRequestID,
                                previewOnly: previewOnly
                            )
                            if saved {
                                isCreatingTask = false
                                taskRequestID = "iphone-transcript-task-\(UUID().uuidString)"
                            }
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(minHeight: 44)
                    .disabled(taskTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || client.isMutating || previewOnly || decisionsLocked)
                    .accessibilityIdentifier("CaptureTranscriptCreateTaskButton")
                    Button("Cancel") { isCreatingTask = false }
                        .buttonStyle(.bordered)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(minHeight: 44)
                }
                Text("Assigned to you with a link back to this transcript moment.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            } else {
                Button {
                    taskTitle = defaultTaskTitle
                    taskDetail = "From \(segment.sessionStartSeconds.captureTranscriptTimestamp)–\(segment.sessionEndSeconds.captureTranscriptTimestamp) on the Session timeline: \(segment.text)"
                    isCreatingTask = true
                } label: {
                    Label("Make this my task", systemImage: "checklist")
                }
                .buttonStyle(.bordered)
                .disabled(client.isMutating || decisionsLocked)
                .accessibilityIdentifier("CaptureTranscriptMakeTaskButton")
                .accessibilityHint("Opens a task with the transcript wording ready to adjust.")
            }
        }
        .padding(12)
        .background(Color.blue.opacity(0.07), in: RoundedRectangle(cornerRadius: 12))
    }

    private var transcriptGoalComposer: some View {
        VStack(alignment: .leading, spacing: 9) {
            if isCreatingGoal {
                Label("Goal", systemImage: "target")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.purple)
                TextField("Goal title", text: $goalTitle, axis: .vertical)
                    .lineLimit(2...4)
                    .textFieldStyle(.roundedBorder)
                    .accessibilityIdentifier("CaptureTranscriptGoalTitleField")
                TextField("Definition of progress (optional)", text: $goalDescription, axis: .vertical)
                    .lineLimit(2...5)
                    .textFieldStyle(.roundedBorder)
                HStack {
                    Button("Create my goal") {
                        Task {
                            let saved = await client.createGoal(
                                roomID: roomID,
                                segment: segment,
                                title: goalTitle,
                                description: goalDescription,
                                clientRequestID: goalRequestID,
                                previewOnly: previewOnly
                            )
                            if saved {
                                isCreatingGoal = false
                                goalRequestID = "iphone-transcript-goal-\(UUID().uuidString)"
                            }
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.purple)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(minHeight: 44)
                    .disabled(goalTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || client.isMutating || previewOnly || decisionsLocked)
                    .accessibilityIdentifier("CaptureTranscriptCreateGoalButton")
                    Button("Cancel") { isCreatingGoal = false }
                        .buttonStyle(.bordered)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(minHeight: 44)
                }
                Text("Owned by you with a link back to this transcript moment.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("CaptureTranscriptGoalBoundary")
            } else {
                Button {
                    goalTitle = defaultTaskTitle
                    goalDescription = "Source commitment at \(segment.sessionStartSeconds.captureTranscriptTimestamp)–\(segment.sessionEndSeconds.captureTranscriptTimestamp) on the Session timeline: \(segment.text)"
                    isCreatingGoal = true
                } label: {
                    Label("Make this my goal", systemImage: "target")
                }
                .buttonStyle(.bordered)
                .disabled(client.isMutating || decisionsLocked)
                .accessibilityIdentifier("CaptureTranscriptMakeGoalButton")
                .accessibilityHint("Opens a goal with the transcript wording ready to adjust.")
            }
        }
        .padding(12)
        .background(Color.purple.opacity(0.07), in: RoundedRectangle(cornerRadius: 12))
    }

    private var transcriptNoteComposer: some View {
        VStack(alignment: .leading, spacing: 9) {
            if isCreatingNote {
                Label("Session note", systemImage: "note.text.badge.plus")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.orange)
                TextField("Note title (optional)", text: $noteTitle, axis: .vertical)
                    .lineLimit(1...3)
                    .textFieldStyle(.roundedBorder)
                    .accessibilityIdentifier("CaptureTranscriptNoteTitleField")
                TextField("Note", text: $noteBody, axis: .vertical)
                    .lineLimit(3...7)
                    .textFieldStyle(.roundedBorder)
                    .accessibilityIdentifier("CaptureTranscriptNoteBodyField")
                Picker("Purpose", selection: $noteKind) {
                    ForEach(availableNoteKinds) { kind in
                        Text(kind.title).tag(kind)
                    }
                }
                .pickerStyle(.menu)
                .accessibilityIdentifier("CaptureTranscriptNoteKindPicker")
                Picker("Audience", selection: $noteVisibility) {
                    ForEach(availableNoteVisibilities) { visibility in
                        Text(visibility.title).tag(visibility)
                    }
                }
                .pickerStyle(.menu)
                .accessibilityIdentifier("CaptureTranscriptNoteVisibilityPicker")
                Text(noteVisibility.boundary)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("CaptureTranscriptNoteAudienceBoundary")
                HStack {
                    Button("Save source-linked note") {
                        Task {
                            let saved = await client.createNote(
                                roomID: roomID,
                                segment: segment,
                                title: noteTitle,
                                body: noteBody,
                                kind: noteKind,
                                visibility: noteVisibility,
                                clientRequestID: noteRequestID,
                                previewOnly: previewOnly
                            )
                            if saved {
                                isCreatingNote = false
                                noteRequestID = "iphone-transcript-note-\(UUID().uuidString)"
                            }
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.orange)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(minHeight: 44)
                    .disabled(noteBody.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || client.isMutating || previewOnly || decisionsLocked)
                    .accessibilityIdentifier("CaptureTranscriptCreateNoteButton")
                    Button("Cancel") { isCreatingNote = false }
                        .buttonStyle(.bordered)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(minHeight: 44)
                        .accessibilityIdentifier("CaptureTranscriptCancelNoteButton")
                }
                Text("Saved privately by default with a link back to this transcript moment. You can change who sees it.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("CaptureTranscriptNoteBoundary")
            } else {
                Button {
                    noteTitle = "Note — \(defaultTaskTitle)"
                    noteBody = segment.text
                    noteKind = .sessionNote
                    noteVisibility = .authorPrivate
                    isCreatingNote = true
                } label: {
                    Label("Save as Session note", systemImage: "note.text.badge.plus")
                }
                .buttonStyle(.bordered)
                .disabled(client.isMutating || decisionsLocked)
                .accessibilityIdentifier("CaptureTranscriptMakeNoteButton")
                .accessibilityHint("Opens a note with this transcript moment ready to adjust.")
            }
        }
        .padding(12)
        .background(Color.orange.opacity(0.07), in: RoundedRectangle(cornerRadius: 12))
    }

    private var availableNoteKinds: [MobileSessionNoteKind] {
        canUseProjectTeamNotes
            ? MobileSessionNoteKind.allCases
            : MobileSessionNoteKind.allCases.filter { $0 != .production }
    }

    private var availableNoteVisibilities: [MobileSessionNoteVisibility] {
        canUseProjectTeamNotes
            ? MobileSessionNoteVisibility.allCases
            : MobileSessionNoteVisibility.allCases.filter { $0 != .projectTeam }
    }

    private func proposalReview(_ proposal: CaptureTranscriptCorrection) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("AI proposal · not transcript truth", systemImage: "sparkles")
                .font(.caption.weight(.bold))
                .foregroundStyle(.purple)
                .accessibilityIdentifier("CaptureTranscriptAIProposal")
            if let speaker = captureTranscriptNonempty(proposal.correctedSpeakerLabel) {
                Text("Proposed speaker: \(speaker)").font(.subheadline.weight(.semibold))
            }
            if let text = captureTranscriptNonempty(proposal.correctedText) { Text(text).font(.subheadline) }
            if let reason = captureTranscriptNonempty(proposal.reason) {
                Text("Reason: \(reason)").font(.caption).foregroundStyle(.secondary)
            }
            ViewThatFits(in: .horizontal) {
                HStack {
                    acceptAIProposalButton(proposal)
                    rejectAIProposalButton(proposal)
                }
                VStack(spacing: 8) {
                    acceptAIProposalButton(proposal)
                        .frame(maxWidth: .infinity)
                    rejectAIProposalButton(proposal)
                        .frame(maxWidth: .infinity)
                }
            }
            Text("Until accepted here, this proposal does not change the effective transcript.")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.purple)
        }
        .padding(12)
        .background(Color.purple.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
    }

    private func acceptAIProposalButton(_ proposal: CaptureTranscriptCorrection) -> some View {
        Button {
            guard let playbackPosition else { return }
            Task {
                await client.reviewAIProposal(
                    roomID: roomID,
                    segment: segment,
                    proposal: proposal,
                    decision: "accept",
                    playbackPosition: playbackPosition,
                    previewOnly: previewOnly
                )
            }
        } label: {
            Text("Accept after listening")
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .buttonStyle(.borderedProminent)
        .tint(.purple)
        .disabled(playbackPosition == nil || client.isMutating || previewOnly || decisionsLocked)
        .accessibilityIdentifier("CaptureTranscriptAcceptAIButton")
    }

    private func rejectAIProposalButton(_ proposal: CaptureTranscriptCorrection) -> some View {
        Button {
            Task {
                await client.reviewAIProposal(
                    roomID: roomID,
                    segment: segment,
                    proposal: proposal,
                    decision: "reject",
                    playbackPosition: nil,
                    previewOnly: previewOnly
                )
            }
        } label: {
            Text("Reject")
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .buttonStyle(.bordered)
        .disabled(client.isMutating || previewOnly || decisionsLocked)
        .accessibilityIdentifier("CaptureTranscriptRejectAIButton")
    }

    private var playbackPosition: TimeInterval? {
        playback.confirmedPosition(
            for: segment,
            recordingAssetID: expectedRecordingAssetID
        )
    }

    private var hasExactLocalSource: Bool {
        guard !previewOnly,
              let recording,
              let expectedRecordingAssetID,
              recording.recordingAssetId == expectedRecordingAssetID,
              recording.status.isPlaybackEligible else { return false }
        return library.fileURL(for: recording) != nil
    }

    private var canPlaySource: Bool {
        !previewOnly && (
            hasExactLocalSource
            || (
                protectedSource?.recordingAssetId == expectedRecordingAssetID
                && protectedSource?.mobileProtectedSource != nil
            )
        )
    }

    private var pendingDecision: PendingTranscriptReviewDecision? {
        client.pendingDecision(roomID: roomID, segmentID: segment.id)
    }

    private var correctionIsEmptyOrUnchanged: Bool {
        let text = correctedText.trimmingCharacters(in: .whitespacesAndNewlines)
        let speaker = correctedSpeaker.trimmingCharacters(in: .whitespacesAndNewlines)
        if text.isEmpty && speaker.isEmpty { return true }
        return text == segment.text && speaker == (segment.speakerLabel ?? "")
    }

    private var defaultTaskTitle: String {
        let speaker = captureTranscriptNonempty(segment.speakerLabel).map { "\($0): " } ?? ""
        let candidate = "\(speaker)\(segment.text)"
        return String(candidate.prefix(180))
    }

    private func beginEditing() {
        if !previewOnly, let draft = CaptureTranscriptCorrectionDraftStore.load(roomID: roomID, segment: segment) {
            correctedText = draft.correctedText
            correctedSpeaker = draft.correctedSpeaker
            reason = draft.reason
            draftStatus = "Protected local draft restored · not synced"
        } else {
            correctedText = segment.text
            correctedSpeaker = segment.speakerLabel ?? ""
            reason = ""
            draftStatus = nil
        }
        isEditing = true
    }

    private func scheduleDraftSave() {
        guard isEditing, !previewOnly else { return }
        draftSaveTask?.cancel()
        draftSaveTask = Task {
            try? await Task.sleep(for: .milliseconds(450))
            guard !Task.isCancelled else { return }
            persistDraftIfNeeded()
        }
    }

    private func persistDraftIfNeeded() {
        guard isEditing, !previewOnly else { return }
        if CaptureTranscriptCorrectionDraftStore.save(
            roomID: roomID,
            segment: segment,
            correctedText: correctedText,
            correctedSpeaker: correctedSpeaker,
            reason: reason
        ) {
            draftStatus = "Protected local draft saved · not synced"
        }
    }
}

private extension View {
    func reviewCard() -> some View {
        self
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(Color.primary.opacity(0.07)))
    }
}

private extension TimeInterval {
    var captureTranscriptTimestamp: String {
        let total = max(0, Int(self.rounded(.down)))
        return String(format: "%d:%02d", total / 60, total % 60)
    }
}

private func captureTranscriptNonempty(_ value: String?) -> String? {
    let normalized = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    return normalized.isEmpty ? nil : normalized
}

private extension String {
    var nonemptyTranscriptValue: String? {
        captureTranscriptNonempty(self)
    }
}
