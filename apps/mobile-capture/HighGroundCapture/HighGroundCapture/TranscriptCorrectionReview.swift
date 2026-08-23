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
    let speakerLabel: String?
    let providerSpeakerLabel: String?
    let startSeconds: TimeInterval
    let endSeconds: TimeInterval
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
}

struct CaptureTranscriptPlayback: Codable, Equatable {
    let sourceId: String
    let url: String
    let kind: String
    let recordingAssetId: String
    let durationSeconds: TimeInterval?
    let label: String
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

struct CaptureTranscriptCorrectionDesk: Codable, Equatable {
    let ok: Bool
    let roomId: String
    let transcriptJobId: String?
    let gate: CaptureTranscriptGate
    let playback: CaptureTranscriptPlayback?
    /// Optional keeps protected v1 caches and older compatible Nest responses
    /// readable while the native voice-identification surface rolls forward.
    let participants: [CaptureTranscriptParticipant]?
    let speakerGroups: [CaptureTranscriptSpeakerGroup]?
    let segments: [CaptureTranscriptSegment]
    let evidence: CaptureTranscriptEvidence?
    let boundaries: [String: Bool]

    static func preview(roomID: String) -> Self {
        let proposal = CaptureTranscriptCorrection(
            id: "preview-speaker-proposal",
            segmentId: "preview-segment",
            origin: "ai",
            status: "proposed",
            correctedText: nil,
            correctedSpeakerLabel: "Charlie",
            reason: "The isolated host track suggests this speaker label.",
            reviewedAt: nil,
            createdAt: "2026-07-18T00:00:00.000Z",
            updatedAt: "2026-07-18T00:00:00.000Z",
            revisions: [.init(revision: 1, operation: "ai-proposal-created", createdAt: "2026-07-18T00:00:00.000Z")]
        )
        let segment = CaptureTranscriptSegment(
            id: "preview-segment",
            speakerLabel: "Speaker",
            providerSpeakerLabel: "Speaker",
            startSeconds: 3.66,
            endSeconds: 4.84,
            text: "My goal is to publish a thoughtful first episode, and I will review the final cut this week.",
            providerText: "My goal is to publish a thoughtful first episode, and I will review the final cut this week.",
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
                    label: "Review the final cut this week",
                    status: "OPEN",
                    href: "/tasks/preview-task",
                    artifactUpdatedAt: "2026-07-18T00:00:00.000Z",
                    canAcknowledge: true,
                    state: "needs-review",
                    evidenceSnapshotCount: 1,
                    priorTextSnapshot: "I will review the final cat this week.",
                    currentTextSnapshot: "I will review the final cut this week.",
                    priorSpeakerLabelSnapshot: "Speaker",
                    currentSpeakerLabel: "Charlie",
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
            displayLabel: "Charlie",
            role: "HOST",
            isCurrentActor: true
        )
        return .init(
            ok: true,
            roomId: roomID,
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
                    providerSpeakerLabel: "Speaker",
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
                    wordCount: 17,
                    confidenceWordCount: 17,
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
                                    word: "thoughtful",
                                    confidence: 0.58,
                                    startSeconds: 4.08,
                                    endSeconds: 4.46
                                ),
                            ]
                        ),
                    ]
                )
            ),
            boundaries: [
                "providerSegmentsImmutable": true,
                "correctionOverlayVersioned": true,
                "acceptedHumanCorrectionRequiresPlaybackConfirmation": true,
                "aiOutputRequiresHumanReview": true,
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
            detail: "Source-backed commitment from the preview transcript; not open work until accepted.",
            transcriptJobId: "preview-transcript-job",
            recordingAssetId: "preview-recording-asset",
            roomId: roomID,
            packetBuildId: "preview-build",
            segmentId: "preview-segment",
            speakerLabel: "Speaker",
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
    @Published private(set) var packetReviewError: String?
    @Published private(set) var packetStatus: String?
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
    private var automaticPacketAttemptKeys: Set<String> = []
    private var packetSnapshotSHA256: String?

    private let baseURL = normalizedNestBaseURL(
        Bundle.main.object(forInfoDictionaryKey: "QUIPSLY_API_BASE_URL") as? String ?? "https://nest.quipsly.com"
    )

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
        activeRoomID = roomID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !previewOnly else {
            desk = .preview(roomID: roomID)
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
                            playbackPositionSeconds: segment.endSeconds
                        )
                    } catch {
                        errorMessage = "Transcript outbox UI proof could not stage its protected decision: \(error.localizedDescription)"
                    }
                }
            }
            publishOutboxCounts()
            packetGoalCandidates = [.preview(roomID: roomID)]
            packetGoalMergeTargets = [.preview()]
            packetNoteCandidates = [.preview(roomID: roomID)]
            packetNoteMergeTargets = [.preview()]
            packetActionCandidates = [.preview(roomID: roomID)]
            packetTaskMergeTargets = [.preview()]
            packetTaskTags = [
                .init(id: "preview-follow-through", label: "Follow-through", slug: "follow-through", selectedForSession: true),
                .init(id: "preview-coaching", label: "Coaching", slug: "coaching", selectedForSession: true),
            ]
            packetTaskProjectName = "High Ground Odyssey"
            packetGoalReviewContext = .init(summaryNoteId: "preview-summary", packetBuildId: "preview-build")
            packetReviewError = nil
            packetStatus = "READY_FOR_REVIEW"
            packetSegmentCount = 0
            packetReviewedSegmentCount = 0
            packetProviderOnlySegmentCount = 0
            packetSnapshotStale = false
            isUsingProtectedCache = false
            message = "Preview only — no recording is played and no correction can be saved."
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
            packetGoalReviewContext = nil
            packetStatus = nil
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
            await loadPacketCandidates(roomID: roomID)
            await prepareFollowUpIfNeeded(roomID: roomID)
            let synchronizedReview = await flushReviewDecisions()
            let synchronizedSpeaker = await flushSpeakerAttributions()
            if synchronizedReview || synchronizedSpeaker {
                Task { [weak self] in
                    await self?.load(roomID: roomID, previewOnly: false)
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

    func acceptHumanCorrection(
        roomID: String,
        segment: CaptureTranscriptSegment,
        correctedText: String,
        correctedSpeaker: String,
        reason: String,
        playbackPosition: TimeInterval,
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
            publishOutboxCounts()
            errorMessage = nil
            message = "Playback-reviewed correction protected on this iPhone and waiting for exact Nest acknowledgement."
            if AuthManager.shared.networkActionsAllowed {
                _ = await flushReviewDecisions()
                if reviewDecisionOutbox.decision(roomID: roomID, segmentID: segment.id) == nil {
                    await load(roomID: roomID, previewOnly: false)
                    if errorMessage == nil { message = "Playback-reviewed correction saved." }
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
            message = "As-heard confirmation protected on this iPhone and waiting for exact Nest acknowledgement."
            if AuthManager.shared.networkActionsAllowed {
                _ = await flushReviewDecisions()
                if reviewDecisionOutbox.decision(roomID: roomID, segmentID: segment.id) == nil {
                    await load(roomID: roomID, previewOnly: false)
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
            message = "Voice identity review protected on this iPhone and waiting for exact Nest acknowledgement. No words were marked reviewed."
            if AuthManager.shared.networkActionsAllowed {
                _ = await flushSpeakerAttributions()
                if pendingSpeakerAttribution(
                    roomID: roomID,
                    providerSpeakerLabel: group.providerSpeakerLabel
                ) == nil {
                    await load(roomID: roomID, previewOnly: false)
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
                ? "Reviewed against the exact retained iPhone recording asset."
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
            packetStatus = payload.packet?.status
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
            packetGoalReviewContext = nil
            packetStatus = nil
            resetPacketReviewState()
            packetReviewError = error.localizedDescription
        }
    }

    func buildCurrentPacket(roomID: String, previewOnly: Bool) async -> Bool {
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
        guard status == "PACKET_READY_TO_BUILD" || packetNeedsRebuild,
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
                ? "Your current follow-up suggestions are ready to review."
                : "Your follow-up suggestions are ready. Nothing was assigned, sent, or shared."
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
            await load(roomID: roomID, previewOnly: false)
        }
    }

    func retryHeldSpeakerAttribution(_ id: UUID, roomID: String) async {
        speakerAttributionOutbox.releaseForRetry(id)
        publishOutboxCounts()
        _ = await flushSpeakerAttributions()
        if speakerAttributionOutbox.entries.contains(where: { $0.id == id }) == false {
            await load(roomID: roomID, previewOnly: false)
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
                "confirmedAgainstPlayback": true,
                "playbackPositionSeconds": decision.playbackPositionSeconds,
            ]
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
                guard payload.boundaries?.acceptedHumanCorrectionRequiresPlaybackConfirmation == true,
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
            await load(roomID: roomID, previewOnly: false)
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
    private var activeRecordingID: UUID?
    private var activeAnchorID: String?
    private var activeSegmentEnd: TimeInterval?
    private var playedSegmentIDs = Set<String>()
    @Published private var confirmedPositionsByAnchorID: [String: TimeInterval] = [:]
    private var pauseAt: TimeInterval?
    private let audioSessionCoordinator = CaptureAudioSessionCoordinator.shared

    func play(
        segment: CaptureTranscriptSegment,
        recording: LocalRecording?,
        library: LocalRecordingLibrary,
        expectedRecordingAssetID: String?
    ) {
        play(
            anchorID: segment.id,
            startSeconds: segment.startSeconds,
            endSeconds: segment.endSeconds,
            recording: recording,
            library: library,
            expectedRecordingAssetID: expectedRecordingAssetID
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
            errorMessage = "This iPhone does not have the exact recording asset behind this transcript. Review it in Nest instead."
            return
        }
        guard let fileURL = library.fileURL(for: recording), FileManager.default.fileExists(atPath: fileURL.path) else {
            errorMessage = "The matching local original is no longer available on this iPhone."
            return
        }

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
            if let activeRecordingID, activeRecordingID != recording.id {
                confirmedPositionsByAnchorID.removeAll()
                playedSegmentIDs.removeAll()
            }
            activeRecordingID = recording.id
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
            activeRecordingID = nil
            isPlaying = false
            errorMessage = error.localizedDescription
        }
    }

    func confirmedPosition(for segment: CaptureTranscriptSegment, recording: LocalRecording?) -> TimeInterval? {
        guard recording?.id == activeRecordingID,
              playedSegmentIDs.contains(segment.id),
              let position = confirmedPositionsByAnchorID[segment.id],
              position >= max(segment.startSeconds, segment.endSeconds - 0.25),
              position <= segment.endSeconds + 3 else { return nil }
        return position
    }

    func confirmedPosition(for sample: CaptureTranscriptSpeakerSample, recording: LocalRecording?) -> TimeInterval? {
        guard recording?.id == activeRecordingID,
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
            activeRecordingID = nil
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
        case .ready: "Ready"
        case .listenFirst: "Source available"
        case .deferred: "Deferred"
        case .decided: "Decided"
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
        case .open: "Review"
        case .deferred: "Later"
        case .decided: "Done"
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

    @StateObject private var client = CaptureTranscriptCorrectionClient()
    @StateObject private var playback = CaptureTranscriptPlaybackController()
    @StateObject private var library = LocalRecordingLibrary.shared
    @State private var scrollTargetSegmentID: String?
    @State private var packetCandidateFilter = CapturePacketCandidateReviewFilter.open
    @State private var recentPacketDecisionID: String?
    @State private var previousPacketCandidateStates: [String: CapturePacketCandidateReviewState] = [:]
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
        returnLabel: String? = nil
    ) {
        self.roomID = roomID
        self.sessionTitle = sessionTitle
        self.recording = recording
        self.previewOnly = previewOnly
        self.focusSegmentID = focusSegmentID
        self.canUseProjectTeamNotes = canUseProjectTeamNotes
        self.returnLabel = returnLabel
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

                    if previewOnly {
                        reviewNotice(
                            title: "Preview data — no server actions",
                            detail: "This demonstrates the review workflow without claiming playback or saving a correction.",
                            tint: .orange,
                            icon: "hammer.fill"
                        )
                        .accessibilityIdentifier("CaptureTranscriptPreviewBoundary")
                    }

                    if let message = client.message {
                        reviewNotice(title: "Review status", detail: message, tint: .blue, icon: "info.circle.fill")
                    }
                    if client.isUsingProtectedCache {
                        reviewNotice(
                            title: "Available offline",
                            detail: "You can read the transcript and play the matching recording. Corrections are saved safely on this iPhone and sync when Quipsly reconnects; creating notes, goals, or tasks waits for reconnection.",
                            tint: .gray,
                            icon: "lock.shield.fill"
                        )
                        .accessibilityIdentifier("CaptureTranscriptProtectedCacheBoundary")
                    }
                    if client.pendingTranscriptDecisionCount > 0 || client.heldTranscriptDecisionCount > 0 {
                        reviewNotice(
                            title: client.heldTranscriptDecisionCount > 0
                                ? "Transcript change needs attention"
                                : "Transcript changes saved on this iPhone",
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
                                : "Voice labels saved on this iPhone",
                            detail: client.heldSpeakerAttributionCount > 0
                                ? "\(client.heldSpeakerAttributionCount) voice label\(client.heldSpeakerAttributionCount == 1 ? "" : "s") could not sync. Open the saved-changes button to review."
                                : "\(client.pendingSpeakerAttributionCount) voice label\(client.pendingSpeakerAttributionCount == 1 ? " is" : "s are") waiting to sync.",
                            tint: client.heldSpeakerAttributionCount > 0 ? .orange : .indigo,
                            icon: client.heldSpeakerAttributionCount > 0 ? "exclamationmark.shield.fill" : "person.wave.2.fill"
                        )
                        .id("speaker-attribution-outbox-status")
                        .accessibilityIdentifier("CaptureTranscriptSpeakerOutboxDetailBoundary")
                    }
                    if let error = client.errorMessage ?? playback.errorMessage {
                        reviewNotice(title: "Needs attention", detail: error, tint: .orange, icon: "exclamationmark.triangle.fill")
                    }

                    if client.isLoading {
                        ProgressView("Loading protected transcript…")
                            .frame(maxWidth: .infinity, minHeight: 120)
                    } else if let desk = client.desk {
                        sourceTruth(desk)
                            .id("source-truth")
                        transcriptSegments(desk, scrollProxy: scrollProxy)
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
                        } else if client.followUpPreparationFailed && !client.packetNeedsRebuild {
                            followUpRetryNotice
                        } else if packetCandidateCount > 0 {
                            reviewNotice(
                                title: "Follow-up suggestions ready",
                                detail: packetCandidateSummary,
                                tint: .green,
                                icon: "checkmark.shield.fill"
                            )
                            .accessibilityIdentifier("CaptureTranscriptPacketLoadedBoundary")
                        }
                        if client.packetSegmentCount > 0 {
                            packetTranscriptReviewBoundary
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
                if let returnLabel {
                    HStack {
                        Button {
                            dismiss()
                        } label: {
                            Label("Back to \(returnLabel.lowercased())", systemImage: "chevron.backward")
                                .frame(minHeight: 44)
                        }
                        .buttonStyle(.bordered)
                        .accessibilityIdentifier("CaptureTranscriptReturn")
                        Spacer()
                    }
                    .padding(.horizontal, 18)
                    .padding(.vertical, 8)
                    .background(.bar)
                }
            }
            .navigationTitle("Transcript review")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
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
                        .accessibilityHint("Shows transcript and voice-label changes saved on this iPhone.")
                        .accessibilityIdentifier("CaptureTranscriptReviewOutboxBoundary")
                        .accessibilityValue(
                            totalHeldOutboxCount > 0 ? "Held" : "Queued"
                        )
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        if !(client.desk?.speakerGroups ?? []).isEmpty {
                            Button {
                                withAnimation(reduceMotion ? nil : .easeOut(duration: 0.3)) {
                                    scrollTargetSegmentID = "speaker-identities"
                                    scrollProxy.scrollTo("speaker-identities", anchor: .top)
                                }
                            } label: {
                                Label("Voice identities", systemImage: "person.wave.2")
                            }
                            .accessibilityIdentifier("CaptureTranscriptJumpToSpeakerIdentities")
                        }
                        if let firstNote = packetCandidateQueue.first(where: { $0.kind == .note }) {
                            Button {
                                withAnimation(reduceMotion ? nil : .easeOut(duration: 0.3)) {
                                    scrollTargetSegmentID = firstNote.id
                                    scrollProxy.scrollTo(firstNote.id, anchor: .center)
                                }
                            } label: {
                                Label("Notes", systemImage: "note.text")
                            }
                            .accessibilityIdentifier("CaptureTranscriptJumpToNotes")
                        }
                        if let firstGoal = packetCandidateQueue.first(where: { $0.kind == .goal }) {
                            Button {
                                withAnimation(reduceMotion ? nil : .easeOut(duration: 0.3)) {
                                    scrollTargetSegmentID = firstGoal.id
                                    scrollProxy.scrollTo(firstGoal.id, anchor: .center)
                                }
                            } label: {
                                Label("Goals", systemImage: "target")
                            }
                            .accessibilityIdentifier("CaptureTranscriptJumpToGoals")
                        }
                        if let firstTask = packetCandidateQueue.first(where: { $0.kind == .task }) {
                            Button {
                                withAnimation(reduceMotion ? nil : .easeOut(duration: 0.3)) {
                                    scrollTargetSegmentID = firstTask.id
                                    scrollProxy.scrollTo(firstTask.id, anchor: .center)
                                }
                            } label: {
                                Label("Tasks", systemImage: "checklist")
                            }
                            .accessibilityIdentifier("CaptureTranscriptJumpToTasks")
                        }
                        if previewOnly || packetCandidateCount > 0 {
                            Button {
                                withAnimation(reduceMotion ? nil : .easeOut(duration: 0.3)) {
                                    scrollTargetSegmentID = nil
                                    scrollProxy.scrollTo("packet-candidate-review", anchor: .top)
                                }
                            } label: {
                                Label("Session follow-up", systemImage: "checklist.checked")
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
                    .accessibilityLabel("Jump to review section")
                    .accessibilityIdentifier("CaptureTranscriptJumpMenu")
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { await client.load(roomID: roomID, previewOnly: previewOnly) }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                    .disabled(client.isLoading || client.isMutating)
                    .accessibilityLabel("Refresh transcript review")
                }
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
    private func transcriptSegments(
        _ desk: CaptureTranscriptCorrectionDesk,
        scrollProxy: ScrollViewProxy
    ) -> some View {
        if !desk.gate.allowed {
            reviewNotice(
                title: "Transcript review held",
                detail: desk.gate.error ?? "The recording release gate has not cleared.",
                tint: .orange,
                icon: "lock.fill"
            )
        } else if desk.segments.isEmpty {
            ContentUnavailableView(
                "No transcript segments",
                systemImage: "text.badge.xmark",
                description: Text("Run the recording-backed transcript before reviewing corrections.")
            )
        } else {
            transcriptPresentationPicker
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
                            transcriptJobID: desk.transcriptJobId,
                            segment: segment,
                            recording: recording,
                            expectedRecordingAssetID: desk.playback?.recordingAssetId,
                            attention: desk.evidence?.transcript.attentionSegments.first(where: { $0.segmentId == segment.id }),
                            previewOnly: previewOnly,
                            decisionsLocked: client.isUsingProtectedCache,
                            canUseProjectTeamNotes: canUseProjectTeamNotes,
                            client: client,
                            playback: playback,
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

    private var transcriptPresentationPicker: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack {
                Label("Transcript", systemImage: transcriptPresentationMode.systemImage)
                    .font(.headline)
                Spacer()
                Text("Remembered on this iPhone")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(.secondary)
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
                    ? "Read the Session like a familiar conversation. Tap Review when a passage needs correction or follow-through."
                    : "Listen at exact timestamps, correct words or speakers, and create source-backed notes, tasks, and goals."
            )
            .font(.caption)
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
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
                    Text(segment.startSeconds.captureTranscriptTimestamp)
                        .font(.caption2.monospacedDigit().weight(.semibold))
                        .foregroundStyle(.secondary)
                }
                Text(segment.text)
                    .font(.body)
                    .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 8) {
                    Button {
                        playback.play(
                            segment: segment,
                            recording: recording,
                            library: library,
                            expectedRecordingAssetID: desk.playback?.recordingAssetId
                        )
                    } label: {
                        Label("Play", systemImage: "play.fill")
                            .frame(minHeight: 36)
                    }
                    .buttonStyle(.bordered)
                    .disabled(!hasExactLocalSource(expectedRecordingAssetID: desk.playback?.recordingAssetId) || client.isMutating)
                    Button("Review") {
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
            captureTranscriptNonempty(evidence.provider),
            captureTranscriptNonempty(evidence.providerModel),
        ]
        .compactMap { $0 }
        .joined(separator: " · ")
        return VStack(alignment: .leading, spacing: 11) {
            HStack(alignment: .firstTextBaseline) {
                Label("Transcript evidence", systemImage: "waveform.badge.magnifyingglass")
                    .font(.headline)
                    .foregroundStyle(.indigo)
                Spacer(minLength: 8)
                if !providerLabel.isEmpty {
                    Text(providerLabel)
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(.secondary)
                }
            }
            HStack(spacing: 8) {
                transcriptEvidenceMetric(
                    value: "\(evidence.reviewedSegmentCount)/\(evidence.segmentCount)",
                    label: "segments reviewed"
                )
                transcriptEvidenceMetric(
                    value: evidence.lowConfidenceWordCount.map(String.init) ?? "—",
                    label: "triage words"
                )
                transcriptEvidenceMetric(
                    value: evidence.measuredWordErrorRate.map { "\(Int(($0 * 100).rounded()))%" } ?? "—",
                    label: "measured WER"
                )
            }
            if let threshold = evidence.lowConfidenceThreshold,
               let authority = captureTranscriptNonempty(evidence.lowConfidenceThresholdAuthority) {
                Text("\(Int((threshold * 100).rounded()))% is a review-priority threshold from \(authority). Provider confidence helps order listening; it is not measured transcript accuracy.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                Text("This provider did not supply a qualified confidence-triage threshold. Quipsly will not invent one.")
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
                        "Review first of \(evidence.attentionSegments.count)",
                        systemImage: "ear.badge.exclamationmark"
                    )
                    .frame(minHeight: 44)
                }
                .buttonStyle(.borderedProminent)
                .tint(.indigo)
                .accessibilityIdentifier("CaptureTranscriptEvidenceReviewFirst")
            }
            Text("Measured WER appears only after people have reviewed source-backed words. Unreviewed provider confidence never becomes an accuracy claim.")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .reviewCard()
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("CaptureTranscriptEvidenceSummary")
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
        let groups = desk.speakerGroups ?? []
        let participants = desk.participants ?? []
        if !groups.isEmpty, let transcriptJobID = desk.transcriptJobId {
            VStack(alignment: .leading, spacing: 12) {
                Label("Identify voices once", systemImage: "person.wave.2.fill")
                    .font(.title3.weight(.bold))
                    .foregroundStyle(.indigo)
                Text("Listen to one to three representative samples, then connect the provider voice to a Session participant. This changes the displayed name across matching turns; it never marks their words playback-reviewed.")
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

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Review and correct", systemImage: "waveform.and.magnifyingglass")
                .font(.title2.weight(.bold))
            Text(sessionTitle)
                .font(.headline)
            Text("Read the conversation, play any passage, and correct words or speaker names. The original recording stays unchanged.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .reviewCard()
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
                "\(affected.count) linked work item\(affected.count == 1 ? "" : "s") need review",
                systemImage: "arrow.triangle.branch"
            )
            .font(.headline)
            .foregroundStyle(.orange)
            Text("A reviewed transcript correction changed evidence already carried into notes, tasks, goals, or follow-ups. Quipsly will not silently rewrite that work.")
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
                    Label("Review first affected source", systemImage: "waveform.and.magnifyingglass")
                        .frame(minHeight: 44)
                }
                .buttonStyle(.borderedProminent)
                .tint(.orange)
                .accessibilityIdentifier("CaptureTranscriptImpactReviewFirst")
            }
            Text("Reviewing only appends an owner-scoped receipt. The linked item's words, state, owner, dates, tags, delivery, and publication remain unchanged.")
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
        return VStack(alignment: .leading, spacing: 10) {
            Label(exactMatch ? "Recording ready to play" : "Transcript ready to review", systemImage: exactMatch ? "checkmark.circle.fill" : "text.bubble")
                .font(.headline)
                .foregroundStyle(exactMatch ? Color.green : Color.orange)
            Text(exactMatch
                ? "Quipsly found the matching recording on this iPhone."
                : "This iPhone does not have the matching recording, so playback and source-confirmed corrections remain available in Nest.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            HStack {
                Label("\(desk.segments.count) segments", systemImage: "text.alignleft")
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
        let readyCount = packetCandidateQueue.filter { $0.state == .ready }.count
        let listenCount = packetCandidateQueue.filter { $0.state == .listenFirst }.count
        let deferredCount = packetCandidateQueue.filter { $0.state == .deferred }.count
        let decidedCount = packetCandidateQueue.filter { $0.state == .decided }.count
        let handledCount = deferredCount + decidedCount
        return VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline) {
                Label("Session follow-up", systemImage: "checklist.checked")
                    .font(.title3.weight(.bold))
                Spacer(minLength: 8)
                Text("\(handledCount)/\(packetCandidateQueue.count)")
                    .font(.caption.monospacedDigit().weight(.bold))
                    .foregroundStyle(.secondary)
            }

            Text("Quipsly found possible notes, goals, and tasks. Save the useful ones, adjust the wording, or leave the rest for later.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            ProgressView(value: Double(handledCount), total: Double(max(packetCandidateQueue.count, 1)))
                .tint(.green)
                .accessibilityHidden(true)

            Text("\(readyCount) ready · \(listenCount) with source · \(deferredCount) later · \(decidedCount) done")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityLabel("Suggestion review status")
                .accessibilityValue(
                    "\(handledCount) of \(packetCandidateQueue.count) reviewed; "
                    + "\(readyCount) ready, \(listenCount) with source, \(deferredCount) later, \(decidedCount) done"
                )
                .accessibilityIdentifier("CapturePacketCandidateReviewCounts")

            if let next = packetOpenCandidates.first {
                Button {
                    packetCandidateFilter = .open
                    withAnimation(reduceMotion ? nil : .easeOut(duration: 0.3)) {
                        scrollTargetSegmentID = next.id
                    }
                    accessibilityFocusedSegmentID = next.id
                } label: {
                    Label("Review next suggestion", systemImage: "arrow.down.circle.fill")
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.borderedProminent)
                .tint(.purple)
                .disabled(client.packetNeedsRebuild || client.isUsingProtectedCache)
                .accessibilityIdentifier("CapturePacketCandidateContinueReview")
            } else if client.packetNeedsRebuild || client.isUsingProtectedCache {
                Label("Review held", systemImage: "exclamationmark.shield.fill")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.orange)
            } else {
                VStack(alignment: .leading, spacing: 9) {
                    Label("All caught up", systemImage: "checkmark.circle.fill")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(.green)
                    Text(deferredCount > 0
                        ? "You reviewed everything that needed attention. \(deferredCount) suggestion\(deferredCount == 1 ? " is" : "s are") saved for later."
                        : "Your notes, goals, and tasks are up to date. You can return to the Session whenever you are ready.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    Button {
                        dismiss()
                    } label: {
                        Label("Done reviewing", systemImage: "arrow.backward")
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.bordered)
                    .accessibilityHint("Returns to the previous screen. This creates and releases nothing.")
                    .accessibilityIdentifier("CapturePacketCandidateReviewDone")
                }
                .accessibilityIdentifier("CapturePacketCandidateReviewFinish")
            }

            Picker("Show candidates", selection: $packetCandidateFilter) {
                ForEach(CapturePacketCandidateReviewFilter.allCases) { filter in
                    Text("\(filter.label) \(packetCandidateCount(for: filter))").tag(filter)
                }
            }
            .pickerStyle(.segmented)
            .accessibilityIdentifier("CapturePacketCandidateReviewFilter")

            if visiblePacketCandidates.isEmpty {
                Text(packetCandidateFilter == .open
                    ? "No suggestions need attention."
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
                            Label("Just decided", systemImage: "checkmark.circle.fill")
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

    private var packetCandidateSummary: String {
        let notes = client.packetNoteCandidates.count
        let tasks = client.packetActionCandidates.count
        let goals = client.packetGoalCandidates.count
        return "Quipsly found \(notes) \(notes == 1 ? "note" : "notes"), \(tasks) \(tasks == 1 ? "task" : "tasks"), and \(goals) \(goals == 1 ? "goal" : "goals") to review. Nothing is shared with a client automatically."
    }

    private var packetTranscriptReviewBoundary: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(
                "\(client.packetReviewedSegmentCount) of \(client.packetSegmentCount) transcript passages checked",
                systemImage: client.packetProviderOnlySegmentCount == 0 ? "checkmark.shield.fill" : "ear.badge.checkmark"
            )
            .font(.subheadline.weight(.bold))
            .foregroundStyle(client.packetProviderOnlySegmentCount == 0 ? Color.green : Color.orange)
            .accessibilityIdentifier("CaptureTranscriptReviewProgressCount")
            Text(client.packetProviderOnlySegmentCount == 0
                ? "Every passage used by these suggestions has been checked against the recording. You still choose which suggestions to keep."
                : "Listen to and confirm \(client.packetProviderOnlySegmentCount) more passage\(client.packetProviderOnlySegmentCount == 1 ? "" : "s") before keeping the related suggestions.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            if client.packetNeedsRebuild {
                Text(client.followUpPreparationFailed
                    ? "Quipsly could not refresh the suggestions. Your transcript is safe; try again."
                    : "Your transcript changed, so Quipsly is refreshing the suggestions. The earlier version stays visible until the refreshed one is ready.")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.orange)
                    .fixedSize(horizontal: false, vertical: true)
                Button {
                    Task { _ = await client.buildCurrentPacket(roomID: roomID, previewOnly: previewOnly) }
                } label: {
                    Label(client.followUpPreparationFailed ? "Try again" : "Refreshing suggestions…", systemImage: "arrow.triangle.2.circlepath")
                        .frame(minHeight: 44)
                }
                .buttonStyle(.borderedProminent)
                .tint(.orange)
                .disabled(previewOnly || client.isMutating || client.isUsingProtectedCache)
                .accessibilityIdentifier("CaptureTranscriptBuildCurrentPacketButton")
            }
        }
        .reviewCard()
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier(client.packetNeedsRebuild
            ? "CaptureTranscriptPacketStaleBoundary"
            : "CaptureTranscriptPacketReviewProgress")
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
                Label("Source-linked Session note", systemImage: "note.text.badge.plus")
                    .font(.title2.weight(.bold))
                    .foregroundStyle(.orange)
                Text("Preview the deliberate review step. The final save stays disabled, no network request runs, and no canonical note or external side effect is created.")
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
        .navigationTitle("Review note")
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier("CapturePacketNoteReviewPreviewView")
    }
}

private struct CapturePacketNoteCandidateCard: View {
    private enum ReviewMode {
        case accept
        case edit
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
    private var sourceFullyReviewed: Bool {
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
        case "EDITED_FOR_REVIEW": "EDITED DRAFT"
        case "DEFERRED_BY_HUMAN": "DEFERRED"
        case "REJECTED_BY_HUMAN": "REJECTED"
        case "ACCEPTED_AS_NOTE": "SAVED"
        case "MERGED_INTO_NOTE": "MERGED"
        default: candidate.laneStatus.replacingOccurrences(of: "_", with: " ")
        }
    }
    private var isEditingDraft: Bool { reviewMode == .edit }
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
                Text(accepted ? "SAVED" : reviewStatusLabel)
                    .font(.caption2.weight(.black))
                    .foregroundStyle(accepted ? .green : candidate.reviewStatus == "REJECTED_BY_HUMAN" || laneRejected ? .red : .orange)
                    .multilineTextAlignment(.trailing)
            }
            Text(candidate.sourceText)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("CapturePacketNoteSourceText_\(candidate.accessibilityKey)")
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
            if !accepted && !sourceFullyReviewed {
                Label("The source is ready if you want to double-check this suggestion.", systemImage: "play.circle")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.orange)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("CapturePacketNoteSourceReviewRequired")
            }
            if let carried = candidate.carriedForwardDraft, carried.exactSourceMatch {
                Label(
                    "Your prior draft was carried into this rebuilt packet because its source span and provider evidence still match exactly. Review it again before saving.",
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
                if let governance = candidate.lastHumanReview?.governance {
                    Label("Governed receipt \(governance.shortActionID)", systemImage: "checkmark.seal")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .accessibilityIdentifier("CapturePacketNoteGovernance_\(candidate.accessibilityKey)")
                }
            } else if reviewMode != nil {
                Divider()
                Label(
                    isEditingDraft ? "Refine candidate for later review" : reviewMode == .merge ? "Merge into one existing Session note" : "Save one source-linked Session note",
                    systemImage: isEditingDraft ? "pencil.line" : reviewMode == .merge ? "arrow.triangle.merge" : "note.text.badge.plus"
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
                    Button(isEditingDraft ? "Save edited draft" : reviewMode == .merge ? "Merge as new revision" : "Save source-linked note") {
                        Task {
                            if await client.reviewPacketNote(
                                candidate: candidate,
                                decision: isEditingDraft ? "EDIT" : reviewMode == .merge ? "MERGE" : "ACCEPT",
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
                Text(isEditingDraft
                    ? "Saves this wording for review without creating or sharing a note."
                    : reviewMode == .merge
                        ? "Adds this source to the selected note. Its previous version stays recoverable."
                        : "Saves one source-linked note. Nothing is sent or shared automatically.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("CapturePacketNoteBoundary")
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    Button {
                        beginReview(.accept)
                    } label: {
                        Label(
                            sourceFullyReviewed ? "Review & save note" : "Review note details",
                            systemImage: "note.text.badge.plus"
                        )
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.orange)
                    .frame(minHeight: 44)
                    .disabled(client.isMutating || decisionsLocked || laneRejected)
                    .accessibilityIdentifier("CapturePacketReviewNoteButton_\(candidate.accessibilityKey)")
                    .accessibilityHint(
                        sourceFullyReviewed
                            ? "Creates nothing until you inspect purpose and audience and press Save source-linked note."
                            : "Inspect purpose and audience now. Saving remains unavailable until you listen through and confirm every source segment."
                    )

                    HStack {
                        Button("Add to existing note") { reviewMode = .merge }
                            .buttonStyle(.bordered)
                            .frame(minHeight: 44)
                        .disabled(client.isMutating || previewOnly || decisionsLocked || laneRejected || mergeTargets.isEmpty)
                            .accessibilityIdentifier("CapturePacketNoteMergeButton_\(candidate.accessibilityKey)")
                        Button("Edit") { beginReview(.edit) }
                            .buttonStyle(.bordered)
                            .frame(minHeight: 44)
                            .disabled(client.isMutating || decisionsLocked || laneRejected)
                            .accessibilityIdentifier("CapturePacketNoteEditButton_\(candidate.accessibilityKey)")
                        Button("Later") {
                            Task {
                                _ = await client.reviewPacketNote(
                                    candidate: candidate,
                                    decision: "DEFER",
                                    previewOnly: previewOnly
                                )
                            }
                        }
                        .buttonStyle(.bordered)
                        .frame(minHeight: 44)
                        .disabled(client.isMutating || previewOnly || decisionsLocked || laneRejected)
                        .accessibilityIdentifier("CapturePacketNoteDeferButton_\(candidate.accessibilityKey)")
                        Button("Dismiss", role: .destructive) { isConfirmingReject = true }
                            .buttonStyle(.bordered)
                            .frame(minHeight: 44)
                            .disabled(client.isMutating || previewOnly || decisionsLocked || laneRejected)
                            .accessibilityIdentifier("CapturePacketNoteRejectButton_\(candidate.accessibilityKey)")
                    }
                    Text(mergeTargets.isEmpty
                        ? "Save this as a note, edit it, keep it for later, or dismiss it."
                        : "Save this as a note, add it to an existing note, edit it, keep it for later, or dismiss it.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("CapturePacketNoteDecisionBoundary")
                }
                if laneRejected {
                    Text("This lane was rejected. Reopen it before saving one of its candidates.")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.red)
                }
            }
        }
        .padding(12)
        .background(Color.orange.opacity(0.06), in: RoundedRectangle(cornerRadius: 12))
        .accessibilityElement(children: .contain)
        .confirmationDialog(
            "Reject this note candidate?",
            isPresented: $isConfirmingReject,
            titleVisibility: .visible
        ) {
            Button("Reject candidate", role: .destructive) {
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
            Text("The source and candidate remain in packet history. No canonical note, task, calendar event, message, delivery, or publication is created.")
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

    @State private var isEditing = false
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

    private var sourceFullyReviewed: Bool {
        candidate.transcriptReviewStatus == "human-reviewed"
            && (candidate.sourceSpan?.segments.allSatisfy { $0.reviewStatus == "human-reviewed" } ?? true)
    }

    private var decisionsDisabled: Bool {
        previewOnly || decisionsLocked || client.isMutating
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
                Text(candidate.reviewStatus.replacingOccurrences(of: "_", with: " ").lowercased())
                    .font(.caption2.weight(.bold))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 5)
                    .background((accepted ? Color.green : Color.orange).opacity(0.12), in: Capsule())
            }
            Text(candidate.detail)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            if (candidate.segmentIds?.count ?? 1) > 1 {
                Label("This moment spans \(candidate.segmentIds?.count ?? 1) transcript passages", systemImage: "link")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
            Button("Play this moment", action: onOpenSource)
                .buttonStyle(.bordered)
            .frame(minHeight: 44)
            .accessibilityIdentifier("CapturePacketTaskSource_\(candidate.segmentId)")
            if !accepted && !sourceFullyReviewed {
                Label("The source is ready if you want to double-check this suggestion.", systemImage: "play.circle")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.orange)
                    .accessibilityIdentifier("CapturePacketTaskSourceReviewRequired")
            }

            if accepted {
                VStack(alignment: .leading, spacing: 5) {
                    Label(
                        candidate.reviewStatus == "MERGED_INTO_ACTION_ITEM"
                            ? "Added as reviewed evidence to one existing task"
                            : "Accepted as canonical Quipsly work",
                        systemImage: "checkmark.shield.fill"
                    )
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(.green)
                        .accessibilityIdentifier("CapturePacketTaskAccepted_\(candidate.id)")
                    if let governance = candidate.lastHumanReview?.governance {
                        Label("Governed receipt \(governance.shortActionID)", systemImage: "checkmark.seal")
                            .font(.caption.monospaced().weight(.semibold))
                            .foregroundStyle(.secondary)
                            .accessibilityIdentifier("CapturePacketTaskGovernance_\(candidate.id)")
                            .accessibilityHint("Identifies the durable governed action and receipt for this reviewed task decision.")
                    }
                }
            } else if isMerging {
                VStack(alignment: .leading, spacing: 12) {
                    Label("Add evidence to one existing task", systemImage: "link.badge.plus")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(.blue)
                    Text("Choose deliberately. Quipsly appends this reviewed transcript and playback pointer; it does not rewrite the selected task.")
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
                        Button("Add reviewed evidence") {
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
                    Text("Task identity, title, detail, status, owner, dates, reminder, recurrence, tags, goal links, and project remain unchanged. The exact transcript source remains playable.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            } else if isCreating {
                VStack(alignment: .leading, spacing: 12) {
                    Label("Create one canonical task", systemImage: "checklist.checked")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(.green)
                    Text("Review every field. Only the choices shown here become task state.")
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
                        Button("Create task") {
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
                    Text("The exact transcript segment and protected playback source stay attached. Reminder, calendar placement, delivery, and publication remain separate decisions.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            } else if isEditing {
                TextField("Task title", text: $title, axis: .vertical)
                    .lineLimit(2...4)
                    .textFieldStyle(.roundedBorder)
                    .accessibilityIdentifier("CapturePacketTaskTitleField")
                TextField("Evidence-backed detail", text: $detail, axis: .vertical)
                    .lineLimit(2...5)
                    .textFieldStyle(.roundedBorder)
                    .accessibilityIdentifier("CapturePacketTaskDetailField")
                HStack {
                    Button("Save for review") {
                        Task { _ = await client.reviewPacketAction(candidate: candidate, decision: "EDIT", title: title, detail: detail, previewOnly: previewOnly) }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(decisionsDisabled || title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    .accessibilityIdentifier("CapturePacketTaskSaveDraftButton")
                    Button("Cancel") { isEditing = false }
                        .buttonStyle(.bordered)
                        .accessibilityIdentifier("CapturePacketTaskCancelEditButton")
                }
            } else {
                HStack {
                    Button("Create task") { isCreating = true }
                    .buttonStyle(.borderedProminent)
                    .disabled(previewOnly || decisionsLocked || client.isMutating)
                    .accessibilityIdentifier("CapturePacketTaskAcceptButton")
                    Button("Edit") { isEditing = true }
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
                HStack {
                    Button("Later") {
                        Task { _ = await client.reviewPacketAction(candidate: candidate, decision: "DEFER", title: nil, detail: nil, previewOnly: previewOnly) }
                    }
                    .buttonStyle(.bordered)
                    .disabled(decisionsDisabled)
                    .accessibilityIdentifier("CapturePacketTaskDeferButton")
                    Button("Dismiss", role: .destructive) {
                        Task { _ = await client.reviewPacketAction(candidate: candidate, decision: "REJECT", title: nil, detail: nil, previewOnly: previewOnly) }
                    }
                    .buttonStyle(.bordered)
                    .disabled(decisionsDisabled)
                    .accessibilityIdentifier("CapturePacketTaskRejectButton")
                }
            }
            if !accepted && !isCreating && !isMerging {
                Text(mergeTargets.isEmpty
                    ? "Nothing changes until you choose. Create a task, edit the suggestion, keep it for later, or dismiss it."
                    : "Nothing changes until you choose. Create a task, add this source to an existing task, edit it, keep it for later, or dismiss it.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(12)
        .background(Color.blue.opacity(0.07), in: RoundedRectangle(cornerRadius: 14))
        .onChange(of: candidate.reviewStatus) { _, _ in
            title = candidate.title
            detail = candidate.detail
            isEditing = false
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

    @State private var isEditing = false
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

    private var sourceFullyReviewed: Bool {
        candidate.transcriptReviewStatus == "human-reviewed"
            && (candidate.sourceSpan?.segments.allSatisfy { $0.reviewStatus == "human-reviewed" } ?? true)
    }

    private var decisionsDisabled: Bool {
        previewOnly || decisionsLocked || client.isMutating
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
                Text(candidate.reviewStatus.replacingOccurrences(of: "_", with: " ").lowercased())
                    .font(.caption2.weight(.bold))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 5)
                    .background((accepted ? Color.green : Color.orange).opacity(0.12), in: Capsule())
            }
            Text(candidate.sourceText)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            if (candidate.segmentIds?.count ?? 1) > 1 {
                Label("This moment spans \(candidate.segmentIds?.count ?? 1) transcript passages", systemImage: "link")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
            Button("Play this moment", action: onOpenSource)
                .buttonStyle(.bordered)
            .frame(minHeight: 44)
            .accessibilityIdentifier("CapturePacketGoalSource_\(candidate.segmentId)")
            if !accepted && !sourceFullyReviewed {
                Label("The source is ready if you want to double-check this suggestion.", systemImage: "play.circle")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.orange)
                    .accessibilityIdentifier("CapturePacketGoalSourceReviewRequired")
            }

            if accepted {
                VStack(alignment: .leading, spacing: 5) {
                    Label(
                        candidate.reviewStatus == "MERGED_INTO_GOAL"
                            ? "Added as reviewed evidence to one existing goal"
                            : "Accepted as one canonical goal",
                        systemImage: "checkmark.shield.fill"
                    )
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(.green)
                        .accessibilityIdentifier("CapturePacketGoalAccepted_\(candidate.id)")
                    if let governance = candidate.lastHumanReview?.governance {
                        Label("Governed receipt \(governance.shortActionID)", systemImage: "checkmark.seal")
                            .font(.caption.monospaced().weight(.semibold))
                            .foregroundStyle(.secondary)
                            .accessibilityIdentifier("CapturePacketGoalGovernance_\(candidate.id)")
                            .accessibilityHint("Identifies the durable governed action and receipt for this reviewed goal decision.")
                    }
                }
            } else if isCreating {
                VStack(alignment: .leading, spacing: 12) {
                    Label("Create one canonical goal", systemImage: "target")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(.purple)
                    Text("Review every field. Only the choices shown here become goal state.")
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
                        Button("Create goal") {
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
                    Text("Every transcript segment in this evidence span and the protected playback source stay attached. Tasks, focus blocks, reminders, calendar placement, delivery, and publication remain separate decisions.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            } else if isMerging {
                VStack(alignment: .leading, spacing: 12) {
                    Label("Add evidence to one existing goal", systemImage: "target")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(.blue)
                    Text("Choose deliberately. Quipsly appends this reviewed transcript and playback pointer; it does not rewrite the selected goal.")
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
                        Button("Add reviewed evidence") {
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
            } else if isEditing {
                TextField("Goal title", text: $title, axis: .vertical)
                    .lineLimit(2...4)
                    .textFieldStyle(.roundedBorder)
                    .accessibilityIdentifier("CapturePacketGoalTitleField")
                TextField("Definition of progress", text: $description, axis: .vertical)
                    .lineLimit(2...5)
                    .textFieldStyle(.roundedBorder)
                    .accessibilityIdentifier("CapturePacketGoalDescriptionField")
                HStack {
                    Button("Save for review") {
                        Task {
                            _ = await client.reviewPacketGoal(
                                candidate: candidate,
                                decision: "EDIT",
                                title: title,
                                description: description,
                                previewOnly: previewOnly
                            )
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.purple)
                    .disabled(decisionsDisabled || title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    .accessibilityIdentifier("CapturePacketGoalSaveDraftButton")
                    Button("Cancel") { isEditing = false }
                        .buttonStyle(.bordered)
                        .accessibilityIdentifier("CapturePacketGoalCancelEditButton")
                }
            } else {
                HStack {
                    Button("Create goal") { isCreating = true }
                    .buttonStyle(.borderedProminent)
                    .tint(.purple)
                    .disabled(previewOnly || decisionsLocked || client.isMutating)
                    .accessibilityIdentifier("CapturePacketGoalAcceptButton")
                    Button("Edit") { isEditing = true }
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
                HStack {
                    Button("Later") {
                        Task { _ = await client.reviewPacketGoal(candidate: candidate, decision: "DEFER", title: nil, description: nil, previewOnly: previewOnly) }
                    }
                    .buttonStyle(.bordered)
                    .disabled(decisionsDisabled)
                    .accessibilityIdentifier("CapturePacketGoalDeferButton")
                    Button("Dismiss", role: .destructive) {
                        Task { _ = await client.reviewPacketGoal(candidate: candidate, decision: "REJECT", title: nil, description: nil, previewOnly: previewOnly) }
                    }
                    .buttonStyle(.bordered)
                    .disabled(decisionsDisabled)
                    .accessibilityIdentifier("CapturePacketGoalRejectButton")
                }
            }
            if !accepted && !isCreating && !isMerging {
                Text("Nothing changes until you choose. Create a goal, add this source to an existing goal, edit the suggestion, keep it for later, or dismiss it.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(12)
        .background(Color.purple.opacity(0.07), in: RoundedRectangle(cornerRadius: 14))
        .onChange(of: candidate.reviewStatus) { _, _ in
            title = candidate.suggestedTitle
            description = candidate.suggestedDescription
            isEditing = false
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
                    signalMetric(
                        value: String(format: "%.1f", signal.rmsDbfs),
                        label: "RMS dBFS"
                    )
                    signalMetric(
                        value: String(format: "%.1f", signal.samplePeakDbfs),
                        label: "peak dBFS"
                    )
                    signalMetric(
                        value: "\(signal.observations.count)",
                        label: "listen points"
                    )
                }
                Text("Measured across the decoded source. RMS is not LUFS, and listen points are review candidates—not confirmed defects.")
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
                            : "Voice identity queued on this iPhone",
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
                        || !hasExactLocalSource
                )
            }

            Text("Voice identity and word review are separate. This mapping changes display labels only; corrections and as-heard confirmations still require their own deliberate playback decision.")
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
        let livePosition = playback.confirmedPosition(for: sample, recording: recording)
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
                    playback.play(
                        sample: sample,
                        recording: recording,
                        library: library,
                        expectedRecordingAssetID: expectedRecordingAssetID
                    )
                } label: {
                    Label("Play", systemImage: "play.fill")
                        .frame(minHeight: 44)
                }
                .buttonStyle(.bordered)
                .disabled(!hasExactLocalSource || client.isMutating)
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
    @State private var confirmedImpactIDs: Set<String> = []

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 5) {
                    Text("\(segment.startSeconds.captureTranscriptTimestamp)–\(segment.endSeconds.captureTranscriptTimestamp)")
                        .font(.caption.monospacedDigit().weight(.bold))
                        .foregroundStyle(.blue)
                    Text(captureTranscriptNonempty(segment.speakerLabel) ?? "Unlabelled speaker")
                        .font(.headline)
                    Text(segment.text)
                        .font(.body)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 12)
                Button {
                    playback.play(
                        segment: segment,
                        recording: recording,
                        library: library,
                        expectedRecordingAssetID: expectedRecordingAssetID
                    )
                } label: {
                    Label("Play", systemImage: "play.fill")
                        .frame(minHeight: 44)
                }
                .buttonStyle(.bordered)
                .disabled(!hasExactLocalSource || client.isMutating)
                .accessibilityLabel("Play transcript segment from \(segment.startSeconds.captureTranscriptTimestamp)")
                .accessibilityIdentifier("CaptureTranscriptPlayButton_\(segment.id)")
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
                    Label("Reviewed correction · revision \(accepted.revisions.count)", systemImage: "checkmark.shield.fill")
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
                    Label("Reviewed as heard · provider text confirmed", systemImage: "checkmark.shield.fill")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.green)
                    Text("This exact local timestamp was played and confirmed without inventing a no-op correction.")
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
                            ? "Decision held for review"
                            : "Decision queued on this iPhone",
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
                            ?? "The exact playback position, provider evidence, and expected reviewed overlay are protected until Nest acknowledges this stable request."
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
                if segment.acceptedCorrection == nil,
                   segment.acceptedVerification == nil {
                    Button(decisionsLocked ? "Queue correct as heard" : "Confirm correct as heard") {
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
                    .buttonStyle(.borderedProminent)
                    .tint(.green)
                    .disabled(playbackPosition == nil || client.isMutating || previewOnly || pendingDecision != nil)
                    .accessibilityIdentifier("CaptureTranscriptConfirmAsIsButton_\(segment.id)")
                    .accessibilityHint("Plays no media and saves only after this exact timestamp was already played.")
                }
                Button(segment.acceptedCorrection == nil ? "Correct against playback" : "Revise reviewed correction") {
                    beginEditing()
                }
                .buttonStyle(.bordered)
                .disabled((!hasExactLocalSource && !previewOnly) || client.isMutating || pendingDecision != nil)
                .accessibilityIdentifier("CaptureTranscriptCorrectButton_\(segment.id)")
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
            Label("Linked work after transcript correction", systemImage: "arrow.triangle.branch")
                .font(.caption.weight(.bold))
                .foregroundStyle(impacts.contains(where: \.needsReview) ? Color.orange : Color.green)
            Text("These are canonical items whose saved transcript evidence points to this exact segment. Quipsly compares evidence; it never rewrites the item automatically.")
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
                    Toggle(
                        "I read the corrected source and this \(impact.kindLabel.lowercased()) still says what I intend.",
                        isOn: Binding(
                            get: { confirmedImpactIDs.contains(impact.id) },
                            set: { confirmed in
                                if confirmed {
                                    confirmedImpactIDs.insert(impact.id)
                                } else {
                                    confirmedImpactIDs.remove(impact.id)
                                }
                            }
                        )
                    )
                    .font(.caption.weight(.semibold))
                    .tint(.orange)
                    .accessibilityIdentifier("CaptureTranscriptImpactConfirm_\(impact.artifactKind)_\(impact.artifactId)")
                    Button {
                        Task {
                            guard let transcriptJobID = client.desk?.transcriptJobId else { return }
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
                        !confirmedImpactIDs.contains(impact.id)
                            || client.isMutating
                            || previewOnly
                            || decisionsLocked
                    )
                    .accessibilityIdentifier("CaptureTranscriptImpactAcknowledge_\(impact.artifactKind)_\(impact.artifactId)")
                    .accessibilityHint("Appends a review receipt without changing the linked item's content or state.")
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
        case "needs-review": "NEEDS REVIEW"
        case "snapshot-unavailable": "OLDER EVIDENCE"
        default: "CURRENT"
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
            Label(playbackPosition == nil ? "Listen through this exact segment before accepting." : "Exact local segment heard through its end and ready for confirmation.", systemImage: playbackPosition == nil ? "ear.badge.exclamationmark" : "checkmark.circle.fill")
                .font(.caption.weight(.semibold))
                .foregroundStyle(playbackPosition == nil ? Color.orange : Color.green)
            if let draftStatus {
                Label(draftStatus, systemImage: "internaldrive.fill")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .accessibilityIdentifier("CaptureTranscriptLocalDraftStatus")
            }
            VStack(alignment: .leading, spacing: 8) {
                Button(decisionsLocked ? "Queue reviewed correction" : "Accept reviewed correction") {
                    guard let playbackPosition else { return }
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
                .disabled(playbackPosition == nil || client.isMutating || previewOnly || pendingDecision != nil || correctionIsEmptyOrUnchanged)
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
            Text("The decision is protected on this iPhone first. Nest adds an audited overlay only after exact evidence and conflict checks; media time, tasks, notes, and publication remain unchanged.")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .padding(12)
        .background(Color.orange.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
    }

    private var transcriptTaskComposer: some View {
        VStack(alignment: .leading, spacing: 9) {
            if isCreatingTask {
                Label("Explicit task · source linked", systemImage: "checklist")
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
                Text("Creates one OPEN task assigned to you with this room, segment, speaker, timestamp, provider hash, current reviewed overlay, and recording asset. It creates no deadline, reminder, calendar event, message, or publication.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            } else {
                Button {
                    taskTitle = defaultTaskTitle
                    taskDetail = "From \(segment.startSeconds.captureTranscriptTimestamp)–\(segment.endSeconds.captureTranscriptTimestamp): \(segment.text)"
                    isCreatingTask = true
                } label: {
                    Label("Make this my task", systemImage: "checklist")
                }
                .buttonStyle(.bordered)
                .disabled(client.isMutating || decisionsLocked)
                .accessibilityIdentifier("CaptureTranscriptMakeTaskButton")
                .accessibilityHint("Creates nothing until you review the title and press Create my task.")
            }
        }
        .padding(12)
        .background(Color.blue.opacity(0.07), in: RoundedRectangle(cornerRadius: 12))
    }

    private var transcriptGoalComposer: some View {
        VStack(alignment: .leading, spacing: 9) {
            if isCreatingGoal {
                Label("Explicit goal · source linked", systemImage: "target")
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
                Text("Creates one ACTIVE goal owned by you with this exact transcript and recording source. It creates no task, target date, reminder, calendar event, message, or publication.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("CaptureTranscriptGoalBoundary")
            } else {
                Button {
                    goalTitle = defaultTaskTitle
                    goalDescription = "Source commitment at \(segment.startSeconds.captureTranscriptTimestamp)–\(segment.endSeconds.captureTranscriptTimestamp): \(segment.text)"
                    isCreatingGoal = true
                } label: {
                    Label("Make this my goal", systemImage: "target")
                }
                .buttonStyle(.bordered)
                .disabled(client.isMutating || decisionsLocked)
                .accessibilityIdentifier("CaptureTranscriptMakeGoalButton")
                .accessibilityHint("Creates nothing until you review the title and press Create my goal.")
            }
        }
        .padding(12)
        .background(Color.purple.opacity(0.07), in: RoundedRectangle(cornerRadius: 12))
    }

    private var transcriptNoteComposer: some View {
        VStack(alignment: .leading, spacing: 9) {
            if isCreatingNote {
                Label("Deliberate Session note · source linked", systemImage: "note.text.badge.plus")
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
                Text("Creates one revisioned canonical Session note with this exact transcript and recording source. It does not correct the transcript, create work, send, deliver, schedule, or publish anything.")
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
                .accessibilityHint("Creates nothing until you choose the purpose and audience and press Save source-linked note.")
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
        playback.confirmedPosition(for: segment, recording: recording)
    }

    private var hasExactLocalSource: Bool {
        guard !previewOnly,
              let recording,
              let expectedRecordingAssetID,
              recording.recordingAssetId == expectedRecordingAssetID,
              recording.status.isPlaybackEligible else { return false }
        return library.fileURL(for: recording) != nil
    }

    private var pendingDecision: PendingTranscriptReviewDecision? {
        client.pendingDecision(roomID: roomID, segmentID: segment.id)
    }

    private var correctionIsEmptyOrUnchanged: Bool {
        let text = correctedText.trimmingCharacters(in: .whitespacesAndNewlines)
        let speaker = correctedSpeaker.trimmingCharacters(in: .whitespacesAndNewlines)
        if text.isEmpty && speaker.isEmpty { return true }
        return text == segment.providerText && speaker == (segment.providerSpeakerLabel ?? "")
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
