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
    let proposals: [CaptureTranscriptCorrection]
    let correctionHistory: [CaptureTranscriptCorrection]
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

struct CaptureTranscriptCorrectionDesk: Codable, Equatable {
    let ok: Bool
    let roomId: String
    let transcriptJobId: String?
    let gate: CaptureTranscriptGate
    let playback: CaptureTranscriptPlayback?
    let segments: [CaptureTranscriptSegment]
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
            confidence: 0.94,
            acceptedCorrection: nil,
            acceptedVerification: nil,
            proposals: [proposal],
            correctionHistory: [proposal]
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
            segments: [segment],
            boundaries: [
                "providerSegmentsImmutable": true,
                "correctionOverlayVersioned": true,
                "acceptedHumanCorrectionRequiresPlaybackConfirmation": true,
                "aiOutputRequiresHumanReview": true,
                "mediaTimeAnchorsPreserved": true,
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
}

private struct CaptureTranscriptMutationResponse: Codable {
    let ok: Bool
    let idempotentReplay: Bool?
    let correction: CaptureTranscriptCorrection?
    let verification: CaptureTranscriptSegmentVerification?
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
    let ok: Bool
    let error: String?
    let idempotentReplay: Bool?
    let goal: GoalRecord?
}

private struct CaptureTranscriptNoteMutationResponse: Codable {
    struct NoteRecord: Codable {
        let id: String
        let title: String?
        let body: String
        let kind: String
        let visibility: String
    }
    let ok: Bool
    let error: String?
    let idempotentReplay: Bool?
    let note: NoteRecord?
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
}

struct CapturePacketTaskTag: Codable, Identifiable, Equatable {
    let id: String
    let label: String
    let slug: String
    let selectedForSession: Bool
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

struct CapturePacketNoteCandidate: Codable, Identifiable, Equatable {
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
    let humanApprovalRequired: Bool
    let committedNoteId: String?

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
            humanApprovalRequired: true,
            committedNoteId: nil
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
        let actionCandidates: [CapturePacketActionCandidate]?
        let goalCandidates: [CapturePacketGoalCandidate]?
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
    @Published private(set) var packetNoteCandidates: [CapturePacketNoteCandidate] = []
    @Published private(set) var packetActionCandidates: [CapturePacketActionCandidate] = []
    @Published private(set) var packetTaskTags: [CapturePacketTaskTag] = []
    @Published private(set) var packetTaskProjectName: String?
    @Published private(set) var packetReviewError: String?
    @Published private(set) var packetStatus: String?
    @Published private(set) var packetSegmentCount = 0
    @Published private(set) var packetReviewedSegmentCount = 0
    @Published private(set) var packetProviderOnlySegmentCount = 0
    @Published private(set) var packetSnapshotStale = false
    @Published private(set) var pendingTranscriptDecisionCount = 0
    @Published private(set) var heldTranscriptDecisionCount = 0

    var packetNeedsRebuild: Bool {
        packetStatus == "TRANSCRIPT_REVIEW_CHANGED" || packetSnapshotStale
    }

    private var packetGoalReviewContext: CapturePacketGoalReviewContext?
    private let reviewDecisionOutbox = TranscriptReviewDecisionOutbox.shared
    private var isFlushingReviewDecisions = false

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

    func load(roomID: String, previewOnly: Bool) async {
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
            publishReviewDecisionCounts()
            packetGoalCandidates = [.preview(roomID: roomID)]
            packetNoteCandidates = [.preview(roomID: roomID)]
            packetActionCandidates = [.preview(roomID: roomID)]
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
        publishReviewDecisionCounts()
        guard AuthManager.shared.networkActionsAllowed else {
            packetGoalCandidates = []
            packetNoteCandidates = []
            packetActionCandidates = []
            packetTaskTags = []
            packetTaskProjectName = nil
            packetGoalReviewContext = nil
            packetStatus = nil
            resetPacketReviewState()
            if restoreProtectedCache(roomID: roomID) {
                errorMessage = "Nest is unavailable. Showing a protected transcript snapshot; exact local playback-reviewed corrections can be queued safely, while packet and AI decisions stay locked until authority is verified."
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
            let synchronizedReview = await flushReviewDecisions()
            if synchronizedReview {
                Task { [weak self] in
                    await self?.load(roomID: roomID, previewOnly: false)
                }
            }
        } catch {
            packetGoalCandidates = []
            packetNoteCandidates = []
            packetActionCandidates = []
            packetTaskTags = []
            packetTaskProjectName = nil
            packetGoalReviewContext = nil
            packetStatus = nil
            resetPacketReviewState()
            if restoreProtectedCache(roomID: roomID) {
                errorMessage = "Nest is unavailable. Showing a protected transcript snapshot; exact local playback-reviewed corrections can be queued safely, while packet and AI decisions stay locked until authority is verified."
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
            publishReviewDecisionCounts()
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
            publishReviewDecisionCounts()
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
            publishReviewDecisionCounts()
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
            publishReviewDecisionCounts()
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

    func createPacketNote(
        candidate: CapturePacketNoteCandidate,
        title: String,
        body noteBody: String,
        kind: MobileSessionNoteKind,
        visibility: MobileSessionNoteVisibility,
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
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: [
                "roomId": candidate.roomId,
                "segmentId": candidate.segmentId,
                "clientRequestId": candidate.clientRequestId,
                "expectedProviderTextSha256": candidate.providerTextSha256,
                "title": title.trimmingCharacters(in: .whitespacesAndNewlines),
                "body": noteBody.trimmingCharacters(in: .whitespacesAndNewlines),
                "kind": kind.rawValue,
                "visibility": visibility.rawValue,
                "surface": "ios-capture-session-packet-review",
                "transcriptJobId": candidate.transcriptJobId,
                "recordingAssetId": candidate.recordingAssetId,
                "summaryNoteId": candidate.summaryNoteId,
                "packetBuildId": candidate.packetBuildId,
                "packetNoteCandidateId": candidate.id,
                "packetLaneId": candidate.laneId,
            ])
            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            let payload = try JSONDecoder().decode(CaptureTranscriptNoteMutationResponse.self, from: data)
            guard response.statusCode < 400, payload.ok, let note = payload.note else {
                throw captureTranscriptError(data: data, fallback: payload.error ?? "The packet note could not be saved.")
            }
            message = payload.idempotentReplay == true
                ? "That exact packet note was already saved."
                : "\(MobileSessionNoteKind(rawValue: note.kind)?.title ?? "Session note") saved for \(MobileSessionNoteVisibility(rawValue: note.visibility)?.title.lowercased() ?? "review"). Nothing was sent."
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
            var body: [String: Any] = [
                "callRoomId": candidate.roomId,
                "transcriptJobId": candidate.transcriptJobId,
                "recordingAssetId": candidate.recordingAssetId,
                "summaryNoteId": context.summaryNoteId,
                "packetBuildId": context.packetBuildId,
                "goalCandidateId": candidate.id,
                "decision": decision,
            ]
            if let title { body["title"] = title.trimmingCharacters(in: .whitespacesAndNewlines) }
            if let description { body["description"] = description.trimmingCharacters(in: .whitespacesAndNewlines) }
            if decision == "ACCEPT" {
                body["targetAt"] = targetAt.map { ISO8601DateFormatter().string(from: $0) } ?? NSNull()
                body["tagIds"] = Array(Set(tagIDs ?? [])).sorted()
            }
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            let payload = try JSONDecoder().decode(CaptureTranscriptGoalMutationResponse.self, from: data)
            let requiresGoal = decision == "ACCEPT"
            guard response.statusCode < 400, payload.ok, !requiresGoal || payload.goal != nil else {
                throw captureTranscriptError(data: data, fallback: payload.error ?? "The goal review decision could not be saved.")
            }
            message = decision == "ACCEPT"
                ? (payload.idempotentReplay == true
                    ? "That exact packet goal choice was already accepted."
                    : "One source-linked goal was created\(payload.goal?.targetAt == nil ? "" : " with its target date")\((payload.goal?.tags?.isEmpty == false) ? " and project tags" : ""). No task, focus block, calendar event, message, or delivery was added.")
                : "\(decision.capitalized) saved in packet history. No goal or task was created."
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
            }
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            let payload = try JSONDecoder().decode(CapturePacketActionMutationResponse.self, from: data)
            let requiresTask = decision == "ACCEPT"
            guard response.statusCode < 400, payload.ok, !requiresTask || payload.actionItem != nil else {
                throw captureTranscriptError(data: data, fallback: payload.error ?? "The task review decision could not be saved.")
            }
            message = decision == "ACCEPT"
                ? (payload.idempotentReplay == true
                    ? "That exact packet task choice was already accepted."
                    : "One \(payload.actionItem?.assignedUserId == nil ? "unassigned" : "actor-owned") source-linked task was created\(payload.actionItem?.dueAt == nil ? "" : " with a due date")\((payload.actionItem?.tagIds?.isEmpty == false) ? " and project tags" : ""). No reminder, calendar event, message, or delivery was added.")
                : "\(decision.capitalized) saved in packet history. No task was created."
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
            packetNoteCandidates = []
            packetActionCandidates = []
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
            packetNoteCandidates = payload.packet?.noteCandidates ?? []
            packetActionCandidates = payload.packet?.actionCandidates ?? []
            packetTaskTags = payload.packet?.taskMaterialization?.tags ?? []
            packetTaskProjectName = payload.packet?.taskMaterialization?.project?.name
            packetStatus = payload.packet?.status
            packetSegmentCount = payload.packet?.transcriptReview?.segmentCount ?? 0
            packetReviewedSegmentCount = payload.packet?.transcriptReview?.humanReviewedSegmentCount ?? 0
            packetProviderOnlySegmentCount = payload.packet?.transcriptReview?.providerOnlySegmentCount ?? 0
            packetSnapshotStale = payload.packet?.transcriptReview?.packetStale ?? false
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
        } catch {
            packetGoalCandidates = []
            packetNoteCandidates = []
            packetActionCandidates = []
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
        guard let transcriptJobID = desk?.transcriptJobId?.nonemptyTranscriptValue,
              let url = URL(string: "\(baseURL)/api/mobile/capture/transcripts/packet") else {
            errorMessage = "A completed transcript job is required before rebuilding this packet."
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
                "transcriptJobId": transcriptJobID,
                "force": true,
            ])
            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            let payload = try JSONDecoder().decode(MobileCapturePacketBuildResponse.self, from: data)
            guard response.statusCode < 400, payload.ok else {
                throw captureTranscriptError(data: data, fallback: payload.error ?? "The current packet could not be built.")
            }
            await load(roomID: roomID, previewOnly: false)
            if errorMessage == nil {
                message = payload.reusedExistingPacket == true
                    ? "The current reviewed transcript already has this packet."
                    : "Current packet built from the latest reviewed transcript. Candidates still require explicit decisions."
            }
            return errorMessage == nil
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    private func resetPacketReviewState() {
        packetStatus = nil
        packetSegmentCount = 0
        packetReviewedSegmentCount = 0
        packetProviderOnlySegmentCount = 0
        packetSnapshotStale = false
    }

    func retryHeldDecision(_ id: UUID, roomID: String) async {
        reviewDecisionOutbox.releaseForRetry(id)
        publishReviewDecisionCounts()
        _ = await flushReviewDecisions()
        if reviewDecisionOutbox.entries.contains(where: { $0.id == id }) == false {
            await load(roomID: roomID, previewOnly: false)
        }
    }

    @discardableResult
    private func flushReviewDecisions() async -> Bool {
        guard !isFlushingReviewDecisions,
              AuthManager.shared.networkActionsAllowed else {
            publishReviewDecisionCounts()
            return false
        }
        isFlushingReviewDecisions = true
        isMutating = true
        defer {
            isFlushingReviewDecisions = false
            isMutating = false
            publishReviewDecisionCounts()
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
            publishReviewDecisionCounts()
            return true
        } catch {
            reviewDecisionOutbox.markRetryable(decision.id, message: error.localizedDescription)
            errorMessage = "Transcript decision remains protected for retry: \(error.localizedDescription)"
            return false
        }
    }

    private func publishReviewDecisionCounts() {
        pendingTranscriptDecisionCount = reviewDecisionOutbox.pendingCount
        heldTranscriptDecisionCount = reviewDecisionOutbox.heldCount
    }

    private func mutate(roomID: String, body: [String: Any], success: String) async {
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
            message = payload.idempotentReplay == true ? "That reviewed correction was already saved." : success
            await load(roomID: roomID, previewOnly: false)
            if errorMessage == nil { message = payload.idempotentReplay == true ? "That reviewed correction was already saved." : success }
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
    private var activeSegmentEnd: TimeInterval?
    private var playedSegmentIDs = Set<String>()
    private var pauseAt: TimeInterval?
    private let audioSessionCoordinator = CaptureAudioSessionCoordinator.shared

    func play(
        segment: CaptureTranscriptSegment,
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
            guard player.prepareToPlay(), segment.startSeconds < player.duration else {
                throw NSError(domain: "CaptureTranscriptPlayback", code: 1, userInfo: [NSLocalizedDescriptionKey: "This timestamp is outside the retained recording."])
            }
            player.currentTime = max(0, segment.startSeconds)
            guard player.play() else {
                throw NSError(domain: "CaptureTranscriptPlayback", code: 2, userInfo: [NSLocalizedDescriptionKey: "The retained recording could not begin playback."])
            }
            self.player = player
            activeRecordingID = recording.id
            activeSegmentEnd = segment.endSeconds
            currentTime = player.currentTime
            pauseAt = min(player.duration, segment.endSeconds + 2)
            playedSegmentIDs.insert(segment.id)
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
              currentTime >= max(segment.startSeconds, segment.endSeconds - 0.25),
              currentTime <= segment.endSeconds + 3 else { return nil }
        return currentTime
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
            activeSegmentEnd = nil
            currentTime = 0
            pauseAt = nil
            playedSegmentIDs.removeAll()
        }
    }

    private func startTimer() {
        playbackClock?.cancel()
        playbackClock = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(150))
                guard !Task.isCancelled, let self, let player = self.player else { return }
                self.currentTime = player.currentTime
                if let pauseAt = self.pauseAt, player.currentTime >= pauseAt {
                    self.pause(resetPosition: false)
                    return
                }
            }
        }
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

struct CaptureTranscriptReviewView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    let roomID: String
    let sessionTitle: String
    let recording: LocalRecording?
    let previewOnly: Bool
    let focusSegmentID: String?
    let canUseProjectTeamNotes: Bool

    @StateObject private var client = CaptureTranscriptCorrectionClient()
    @StateObject private var playback = CaptureTranscriptPlaybackController()
    @StateObject private var library = LocalRecordingLibrary.shared
    @State private var scrollTargetSegmentID: String?
    @AccessibilityFocusState private var accessibilityFocusedSegmentID: String?

    init(
        roomID: String,
        sessionTitle: String,
        recording: LocalRecording?,
        previewOnly: Bool,
        focusSegmentID: String? = nil,
        canUseProjectTeamNotes: Bool = false
    ) {
        self.roomID = roomID
        self.sessionTitle = sessionTitle
        self.recording = recording
        self.previewOnly = previewOnly
        self.focusSegmentID = focusSegmentID
        self.canUseProjectTeamNotes = canUseProjectTeamNotes
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
                            title: "Protected offline snapshot",
                            detail: "You can inspect the transcript and play the exact retained local source. A playback-reviewed correction or as-heard confirmation can wait in the protected phone outbox; packet, task, goal, note, and AI-proposal decisions stay locked until Nest verifies this account again.",
                            tint: .gray,
                            icon: "lock.shield.fill"
                        )
                        .accessibilityIdentifier("CaptureTranscriptProtectedCacheBoundary")
                    }
                    if client.pendingTranscriptDecisionCount > 0 || client.heldTranscriptDecisionCount > 0 {
                        reviewNotice(
                            title: client.heldTranscriptDecisionCount > 0
                                ? "Transcript decision needs review"
                                : "Transcript review protected on this iPhone",
                            detail: "\(client.pendingTranscriptDecisionCount) waiting · \(client.heldTranscriptDecisionCount) held. Provider evidence and media time remain unchanged until Nest acknowledges the exact decision.",
                            tint: client.heldTranscriptDecisionCount > 0 ? .orange : .blue,
                            icon: client.heldTranscriptDecisionCount > 0 ? "exclamationmark.shield.fill" : "arrow.triangle.2.circlepath"
                        )
                        .id("transcript-outbox-status")
                        .accessibilityIdentifier("CaptureTranscriptReviewOutboxDetailBoundary")
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
                        if focusSegmentID != nil {
                            transcriptSegments(desk)
                        }
                        if let packetReviewError = client.packetReviewError {
                            reviewNotice(
                                title: "Packet follow-through unavailable",
                                detail: packetReviewError,
                                tint: .orange,
                                icon: "target"
                            )
                            .accessibilityIdentifier("CaptureTranscriptPacketErrorBoundary")
                        } else if packetCandidateCount > 0 {
                            reviewNotice(
                                title: "Review packet loaded",
                                detail: packetCandidateSummary,
                                tint: .green,
                                icon: "checkmark.shield.fill"
                            )
                            .accessibilityIdentifier("CaptureTranscriptPacketLoadedBoundary")
                        }
                        if client.packetSegmentCount > 0 {
                            packetTranscriptReviewBoundary
                        }
                        if !previewOnly, !client.packetNoteCandidates.isEmpty {
                            packetNoteReviewSection(
                                candidates: client.packetNoteCandidates
                            ) { segmentID in
                                withAnimation(
                                    reduceMotion ? nil : .easeOut(duration: 0.3)
                                ) {
                                    scrollTargetSegmentID = segmentID
                                }
                                accessibilityFocusedSegmentID = segmentID
                            }
                            .id("packet-note-review")
                        }
                        if !client.packetActionCandidates.isEmpty {
                            packetTaskReviewSection { segmentID in
                                withAnimation(
                                    reduceMotion ? nil : .easeOut(duration: 0.3)
                                ) {
                                    scrollTargetSegmentID = segmentID
                                }
                                accessibilityFocusedSegmentID = segmentID
                            }
                            .id("packet-task-review")
                        }
                        if !client.packetGoalCandidates.isEmpty {
                            packetGoalReviewSection { segmentID in
                                withAnimation(
                                    reduceMotion ? nil : .easeOut(duration: 0.3)
                                ) {
                                    scrollTargetSegmentID = segmentID
                                }
                                accessibilityFocusedSegmentID = segmentID
                            }
                            .id("packet-goal-review")
                        }
                        if focusSegmentID == nil {
                            transcriptSegments(desk)
                        }
                        if previewOnly {
                            packetNoteReviewSection(
                                candidates: [.preview(roomID: roomID)],
                                onOpenSource: { segmentID in
                                    withAnimation(
                                        reduceMotion ? nil : .easeOut(duration: 0.3)
                                    ) {
                                        scrollTargetSegmentID = segmentID
                                    }
                                    accessibilityFocusedSegmentID = segmentID
                                }
                            )
                            .id("packet-note-review")
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
            .background(Color(uiColor: .systemGroupedBackground))
            .navigationTitle("Transcript review")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    if client.pendingTranscriptDecisionCount > 0 || client.heldTranscriptDecisionCount > 0 {
                        Button {
                            withAnimation(reduceMotion ? nil : .easeOut(duration: 0.3)) {
                                scrollTargetSegmentID = "transcript-outbox-status"
                                scrollProxy.scrollTo("transcript-outbox-status", anchor: .top)
                            }
                        } label: {
                            ZStack(alignment: .topTrailing) {
                                Image(
                                    systemName: client.heldTranscriptDecisionCount > 0
                                        ? "exclamationmark.shield.fill"
                                        : "checkmark.shield.fill"
                                )
                                Text("\(client.pendingTranscriptDecisionCount + client.heldTranscriptDecisionCount)")
                                    .font(.caption2.weight(.bold))
                                    .padding(.horizontal, 4)
                                    .padding(.vertical, 1)
                                    .foregroundStyle(.white)
                                    .background(
                                        client.heldTranscriptDecisionCount > 0 ? Color.orange : Color.blue,
                                        in: Capsule()
                                    )
                                    .offset(x: 9, y: -7)
                            }
                            .frame(minWidth: 28, minHeight: 28)
                        }
                        .accessibilityLabel(
                            "Transcript review outbox, \(client.pendingTranscriptDecisionCount) waiting, \(client.heldTranscriptDecisionCount) held"
                        )
                        .accessibilityHint("Shows the protected decisions saved on this iPhone.")
                        .accessibilityIdentifier("CaptureTranscriptReviewOutboxBoundary")
                        .accessibilityValue(
                            client.heldTranscriptDecisionCount > 0 ? "Held" : "Queued"
                        )
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        if previewOnly || !client.packetNoteCandidates.isEmpty {
                            Button {
                                withAnimation(reduceMotion ? nil : .easeOut(duration: 0.3)) {
                                    scrollTargetSegmentID = "packet-note-review"
                                    scrollProxy.scrollTo("packet-note-review", anchor: .top)
                                }
                            } label: {
                                Label("Notes", systemImage: "note.text")
                            }
                            .accessibilityIdentifier("CaptureTranscriptJumpToNotes")
                        }
                        if !client.packetActionCandidates.isEmpty {
                            Button {
                                withAnimation(reduceMotion ? nil : .easeOut(duration: 0.3)) {
                                    scrollTargetSegmentID = "packet-task-review"
                                    scrollProxy.scrollTo("packet-task-review", anchor: .top)
                                }
                            } label: {
                                Label("Tasks", systemImage: "checklist")
                            }
                            .accessibilityIdentifier("CaptureTranscriptJumpToTasks")
                        }
                        if !client.packetGoalCandidates.isEmpty {
                            Button {
                                withAnimation(reduceMotion ? nil : .easeOut(duration: 0.3)) {
                                    scrollTargetSegmentID = "packet-goal-review"
                                    scrollProxy.scrollTo("packet-goal-review", anchor: .top)
                                }
                            } label: {
                                Label("Goals", systemImage: "target")
                            }
                            .accessibilityIdentifier("CaptureTranscriptJumpToGoals")
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
                withAnimation(
                    reduceMotion ? nil : .easeOut(duration: 0.3)
                ) {
                    scrollTargetSegmentID = focusSegmentID
                }
                accessibilityFocusedSegmentID = focusSegmentID
            }
            .onDisappear { playback.pause(resetPosition: true) }
            .accessibilityIdentifier("CaptureTranscriptReviewView")
        }
    }

    @ViewBuilder
    private func transcriptSegments(_ desk: CaptureTranscriptCorrectionDesk) -> some View {
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
            ForEach(orderedSegments(in: desk)) { segment in
                CaptureTranscriptSegmentCard(
                    roomID: roomID,
                    segment: segment,
                    recording: recording,
                    expectedRecordingAssetID: desk.playback?.recordingAssetId,
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

    private func orderedSegments(in desk: CaptureTranscriptCorrectionDesk) -> [CaptureTranscriptSegment] {
        guard let focusSegmentID,
              let focusedSegment = desk.segments.first(where: { $0.id == focusSegmentID }) else {
            return desk.segments
        }
        return [focusedSegment] + desk.segments.filter { $0.id != focusSegmentID }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Listen before changing truth", systemImage: "waveform.and.magnifyingglass")
                .font(.title2.weight(.bold))
            Text(sessionTitle)
                .font(.headline)
            Text("Provider words and timestamps stay immutable. Reviewed corrections are versioned overlays; AI suggestions remain proposals until a person accepts them against playback.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .reviewCard()
    }

    private func sourceTruth(_ desk: CaptureTranscriptCorrectionDesk) -> some View {
        let exactMatch = desk.playback?.recordingAssetId.nonemptyTranscriptValue.map { expectedAssetID in
            recording.map {
                $0.recordingAssetId == expectedAssetID && library.fileURL(for: $0) != nil
            } ?? false
        } ?? false
        return VStack(alignment: .leading, spacing: 10) {
            Label(exactMatch ? "Exact local source matched" : "Review-only on this iPhone", systemImage: exactMatch ? "checkmark.shield.fill" : "iphone.slash")
                .font(.headline)
                .foregroundStyle(exactMatch ? Color.green : Color.orange)
            Text(exactMatch
                ? "Playback uses the retained local original for recording asset \(desk.playback?.recordingAssetId ?? "unknown")."
                : "Acceptance stays locked unless this iPhone holds the exact recording asset backing the transcript. You can review remote-only media in Nest.")
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
        }
        .reviewCard()
        .accessibilityIdentifier(exactMatch ? "CaptureTranscriptExactSourceMatch" : "CaptureTranscriptReviewOnlyBoundary")
    }

    private func packetGoalReviewSection(onOpenSource: @escaping (String) -> Void) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Goals suggested by this session", systemImage: "target")
                .font(.title3.weight(.bold))
                .foregroundStyle(.purple)
            Text("Each suggestion stays outside your goals until you accept it. Edit, defer, and reject are saved as review history without creating work.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            ForEach(client.packetGoalCandidates) { candidate in
                CapturePacketGoalCandidateCard(
                    candidate: candidate,
                    projectName: client.packetTaskProjectName,
                    availableTags: client.packetTaskTags,
                    previewOnly: previewOnly,
                    decisionsLocked: client.isUsingProtectedCache || client.packetNeedsRebuild,
                    client: client,
                    onOpenSource: { onOpenSource(candidate.segmentId) }
                )
            }
        }
        .reviewCard()
        .accessibilityIdentifier("CapturePacketGoalReviewSection")
    }

    private var packetCandidateCount: Int {
        client.packetNoteCandidates.count
            + client.packetActionCandidates.count
            + client.packetGoalCandidates.count
    }

    private var packetCandidateSummary: String {
        let notes = client.packetNoteCandidates.count
        let tasks = client.packetActionCandidates.count
        let goals = client.packetGoalCandidates.count
        return "\(notes) \(notes == 1 ? "note" : "notes") · \(tasks) \(tasks == 1 ? "task" : "tasks") · \(goals) \(goals == 1 ? "goal" : "goals"). Every candidate remains a proposal until a person reviews its source and explicitly creates canonical work."
    }

    private var packetTranscriptReviewBoundary: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(
                "\(client.packetReviewedSegmentCount) of \(client.packetSegmentCount) transcript segments reviewed",
                systemImage: client.packetProviderOnlySegmentCount == 0 ? "checkmark.shield.fill" : "ear.badge.checkmark"
            )
            .font(.subheadline.weight(.bold))
            .foregroundStyle(client.packetProviderOnlySegmentCount == 0 ? Color.green : Color.orange)
            .accessibilityIdentifier("CaptureTranscriptReviewProgressCount")
            Text(client.packetProviderOnlySegmentCount == 0
                ? "Every segment in this packet has a current playback-review receipt. Each candidate still needs its own deliberate create decision."
                : "\(client.packetProviderOnlySegmentCount) segment\(client.packetProviderOnlySegmentCount == 1 ? " remains" : "s remain") provider-only. A candidate cannot become canonical work until every segment in its source span is heard and confirmed.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            if client.packetNeedsRebuild {
                Text("Transcript review changed after this packet was built. The saved packet remains inspectable, but decisions are locked until a new append-only packet snapshots the current review state.")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.orange)
                    .fixedSize(horizontal: false, vertical: true)
                Button {
                    Task { _ = await client.buildCurrentPacket(roomID: roomID, previewOnly: previewOnly) }
                } label: {
                    Label("Build current packet", systemImage: "arrow.triangle.2.circlepath")
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

    private func packetNoteReviewSection(
        candidates: [CapturePacketNoteCandidate],
        onOpenSource: @escaping (String) -> Void
    ) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Notes suggested by this session", systemImage: "note.text.badge.plus")
                .font(.title3.weight(.bold))
                .foregroundStyle(.orange)
            Text("Each candidate keeps an exact transcript moment. Review its wording, purpose, and audience before it becomes a canonical Session note; nothing is sent automatically.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            ForEach(candidates) { candidate in
                CapturePacketNoteCandidateCard(
                    candidate: candidate,
                    canUseProjectTeamNotes: canUseProjectTeamNotes,
                    previewOnly: previewOnly,
                    decisionsLocked: client.isUsingProtectedCache || client.packetNeedsRebuild,
                    client: client,
                    onOpenSource: { onOpenSource(candidate.segmentId) }
                )
            }
        }
        .reviewCard()
        .accessibilityIdentifier("CapturePacketNoteReviewSection")
    }

    private func packetTaskReviewSection(onOpenSource: @escaping (String) -> Void) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Tasks suggested by this session", systemImage: "checklist")
                .font(.title3.weight(.bold))
                .foregroundStyle(.blue)
            Text("Suggestions are not open work. Review owner, due date, and project tags before creating one canonical task; edit, defer, and reject stay in packet history.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            ForEach(client.packetActionCandidates) { candidate in
                CapturePacketTaskCandidateCard(
                    candidate: candidate,
                    projectName: client.packetTaskProjectName,
                    availableTags: client.packetTaskTags,
                    previewOnly: previewOnly,
                    decisionsLocked: client.isUsingProtectedCache || client.packetNeedsRebuild,
                    client: client,
                    onOpenSource: { onOpenSource(candidate.segmentId) }
                )
            }
        }
        .reviewCard()
        .accessibilityIdentifier("CapturePacketTaskReviewSection")
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
    let candidate: CapturePacketNoteCandidate
    let canUseProjectTeamNotes: Bool
    let previewOnly: Bool
    let decisionsLocked: Bool
    @ObservedObject var client: CaptureTranscriptCorrectionClient
    let onOpenSource: () -> Void

    @State private var isReviewing = false
    @State private var title: String
    @State private var noteBody: String
    @State private var kind: MobileSessionNoteKind
    @State private var visibility: MobileSessionNoteVisibility

    init(
        candidate: CapturePacketNoteCandidate,
        canUseProjectTeamNotes: Bool,
        previewOnly: Bool,
        decisionsLocked: Bool,
        client: CaptureTranscriptCorrectionClient,
        onOpenSource: @escaping () -> Void
    ) {
        self.candidate = candidate
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

    private var accepted: Bool { candidate.committedNoteId?.isEmpty == false }
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
                Text(accepted ? "SAVED" : candidate.laneStatus.replacingOccurrences(of: "_", with: " "))
                    .font(.caption2.weight(.black))
                    .foregroundStyle(accepted ? .green : laneRejected ? .red : .orange)
                    .multilineTextAlignment(.trailing)
            }
            Text(candidate.sourceText)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            if (candidate.segmentIds?.count ?? 1) > 1 {
                Label("Complete thought across \(candidate.segmentIds?.count ?? 1) immutable transcript segments", systemImage: "link")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
            Button(action: onOpenSource) {
                Label("Review exact source · \(candidate.startSeconds.captureTranscriptTimestamp)–\(candidate.endSeconds.captureTranscriptTimestamp)", systemImage: "play.circle")
            }
            .buttonStyle(.bordered)
            .frame(minHeight: 44)
            .accessibilityIdentifier("CapturePacketNoteSourceButton_\(candidate.id)")
            if !accepted && !sourceFullyReviewed {
                Label("Listen through every source segment and confirm it before saving this candidate.", systemImage: "ear.badge.exclamationmark")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.orange)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("CapturePacketNoteSourceReviewRequired")
            }

            if accepted {
                Label("Saved as one canonical Session note", systemImage: "checkmark.circle.fill")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.green)
                    .accessibilityIdentifier("CapturePacketNoteSaved_\(candidate.id)")
            } else if isReviewing {
                Divider()
                Label("Save one source-linked Session note", systemImage: "note.text.badge.plus")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.orange)
                TextField("Note title (optional)", text: $title, axis: .vertical)
                    .lineLimit(1...3)
                    .textFieldStyle(.roundedBorder)
                    .accessibilityIdentifier("CapturePacketNoteTitleField")
                TextField("Note", text: $noteBody, axis: .vertical)
                    .lineLimit(3...7)
                    .textFieldStyle(.roundedBorder)
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
                    Button("Save source-linked note") {
                        Task {
                            if await client.createPacketNote(
                                candidate: candidate,
                                title: title,
                                body: noteBody,
                                kind: kind,
                                visibility: visibility,
                                previewOnly: previewOnly
                            ) {
                                isReviewing = false
                            }
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.orange)
                    .frame(minHeight: 44)
                    .disabled(noteBody.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || client.isMutating || previewOnly || decisionsLocked || !sourceFullyReviewed)
                    .accessibilityIdentifier("CapturePacketCreateNoteButton")
                    Button("Cancel") { isReviewing = false }
                        .buttonStyle(.bordered)
                        .frame(minHeight: 44)
                        .accessibilityIdentifier("CapturePacketCancelNoteButton")
                }
                Text("Creates one revisioned canonical note. It creates no task, goal, reminder, calendar event, message, client delivery, Studio edit, or publication.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("CapturePacketNoteBoundary")
            } else {
                Button {
                    title = candidate.suggestedTitle
                    noteBody = candidate.suggestedBody
                    kind = availableKinds.contains(where: { $0.rawValue == candidate.suggestedKind })
                        ? MobileSessionNoteKind(rawValue: candidate.suggestedKind) ?? .sessionNote
                        : .sessionNote
                    visibility = availableVisibilities.contains(where: { $0.rawValue == candidate.suggestedVisibility })
                        ? MobileSessionNoteVisibility(rawValue: candidate.suggestedVisibility) ?? .authorPrivate
                        : .authorPrivate
                    isReviewing = true
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
                .accessibilityIdentifier("CapturePacketReviewNoteButton")
                .accessibilityHint(
                    sourceFullyReviewed
                        ? "Creates nothing until you inspect purpose and audience and press Save source-linked note."
                        : "Inspect purpose and audience now. Saving remains unavailable until you listen through and confirm every source segment."
                )
                if laneRejected {
                    Text("This lane was rejected. Reopen it before saving one of its candidates.")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.red)
                }
            }
        }
        .padding(12)
        .background(Color.orange.opacity(0.06), in: RoundedRectangle(cornerRadius: 12))
    }
}

private struct CapturePacketTaskCandidateCard: View {
    let candidate: CapturePacketActionCandidate
    let projectName: String?
    let availableTags: [CapturePacketTaskTag]
    let previewOnly: Bool
    let decisionsLocked: Bool
    @ObservedObject var client: CaptureTranscriptCorrectionClient
    let onOpenSource: () -> Void

    @State private var isEditing = false
    @State private var isCreating = false
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
        previewOnly: Bool,
        decisionsLocked: Bool,
        client: CaptureTranscriptCorrectionClient,
        onOpenSource: @escaping () -> Void
    ) {
        self.candidate = candidate
        self.projectName = projectName
        self.availableTags = availableTags
        self.previewOnly = previewOnly
        self.decisionsLocked = decisionsLocked
        self.client = client
        self.onOpenSource = onOpenSource
        _title = State(initialValue: candidate.title)
        _detail = State(initialValue: candidate.detail)
        _selectedTagIDs = State(initialValue: Set(availableTags.filter(\.selectedForSession).map(\.id)))
    }

    private var accepted: Bool {
        candidate.committedActionItemId != nil || candidate.reviewStatus == "ACCEPTED_AS_ACTION_ITEM"
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
                Label("Complete thought across \(candidate.segmentIds?.count ?? 1) immutable transcript segments", systemImage: "link")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
            Button("Review exact transcript source", action: onOpenSource)
                .buttonStyle(.bordered)
            .frame(minHeight: 44)
            .accessibilityIdentifier("CapturePacketTaskSource_\(candidate.segmentId)")
            if !accepted && !sourceFullyReviewed {
                Label("Source review required before this proposal can become a task.", systemImage: "ear.badge.exclamationmark")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.orange)
                    .accessibilityIdentifier("CapturePacketTaskSourceReviewRequired")
            }

            if accepted {
                Label("Accepted as canonical Quipsly work", systemImage: "checkmark.shield.fill")
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(.green)
                    .accessibilityIdentifier("CapturePacketTaskAccepted_\(candidate.id)")
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
                        .disabled(decisionsDisabled || !sourceFullyReviewed || title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
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
                    Button("Review & create task") { isCreating = true }
                    .buttonStyle(.borderedProminent)
                    .disabled(decisionsLocked || client.isMutating || !sourceFullyReviewed)
                    .accessibilityIdentifier("CapturePacketTaskAcceptButton")
                    Button("Edit") { isEditing = true }
                        .buttonStyle(.bordered)
                        .disabled(decisionsLocked || client.isMutating)
                        .accessibilityIdentifier("CapturePacketTaskEditButton")
                }
                HStack {
                    Button("Defer") {
                        Task { _ = await client.reviewPacketAction(candidate: candidate, decision: "DEFER", title: nil, detail: nil, previewOnly: previewOnly) }
                    }
                    .buttonStyle(.bordered)
                    .disabled(decisionsDisabled)
                    .accessibilityIdentifier("CapturePacketTaskDeferButton")
                    Button("Reject", role: .destructive) {
                        Task { _ = await client.reviewPacketAction(candidate: candidate, decision: "REJECT", title: nil, detail: nil, previewOnly: previewOnly) }
                    }
                    .buttonStyle(.bordered)
                    .disabled(decisionsDisabled)
                    .accessibilityIdentifier("CapturePacketTaskRejectButton")
                }
            }
            if !accepted && !isCreating {
                Text("Only Review & create task can write one canonical OPEN ActionItem after owner, due date, and tags are inspected. Every other decision creates no task, assignment, date, reminder, calendar event, message, delivery, or publication.")
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
    let previewOnly: Bool
    let decisionsLocked: Bool
    @ObservedObject var client: CaptureTranscriptCorrectionClient
    let onOpenSource: () -> Void

    @State private var isEditing = false
    @State private var isCreating = false
    @State private var title: String
    @State private var description: String
    @State private var hasTargetDate = false
    @State private var targetAt = Date().addingTimeInterval(30 * 86_400)
    @State private var selectedTagIDs: Set<String>

    init(
        candidate: CapturePacketGoalCandidate,
        projectName: String?,
        availableTags: [CapturePacketTaskTag],
        previewOnly: Bool,
        decisionsLocked: Bool,
        client: CaptureTranscriptCorrectionClient,
        onOpenSource: @escaping () -> Void
    ) {
        self.candidate = candidate
        self.projectName = projectName
        self.availableTags = availableTags
        self.previewOnly = previewOnly
        self.decisionsLocked = decisionsLocked
        self.client = client
        self.onOpenSource = onOpenSource
        _title = State(initialValue: candidate.suggestedTitle)
        _description = State(initialValue: candidate.suggestedDescription)
        _selectedTagIDs = State(initialValue: Set(availableTags.filter(\.selectedForSession).map(\.id)))
    }

    private var accepted: Bool {
        candidate.committedGoalId != nil || candidate.reviewStatus == "ACCEPTED_AS_GOAL"
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
                Label("Complete thought across \(candidate.segmentIds?.count ?? 1) immutable transcript segments", systemImage: "link")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
            Button("Review exact transcript source", action: onOpenSource)
                .buttonStyle(.bordered)
            .frame(minHeight: 44)
            .accessibilityIdentifier("CapturePacketGoalSource_\(candidate.segmentId)")
            if !accepted && !sourceFullyReviewed {
                Label("Source review required before this proposal can become a goal.", systemImage: "ear.badge.exclamationmark")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.orange)
                    .accessibilityIdentifier("CapturePacketGoalSourceReviewRequired")
            }

            if accepted {
                Label("Accepted as one canonical goal", systemImage: "checkmark.shield.fill")
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(.green)
                    .accessibilityIdentifier("CapturePacketGoalAccepted_\(candidate.id)")
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
                        .disabled(decisionsDisabled || !sourceFullyReviewed || title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
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
                    Button("Review & create goal") { isCreating = true }
                    .buttonStyle(.borderedProminent)
                    .tint(.purple)
                    .disabled(decisionsLocked || client.isMutating || !sourceFullyReviewed)
                    .accessibilityIdentifier("CapturePacketGoalAcceptButton")
                    Button("Edit") { isEditing = true }
                        .buttonStyle(.bordered)
                        .disabled(decisionsLocked || client.isMutating)
                        .accessibilityIdentifier("CapturePacketGoalEditButton")
                }
                HStack {
                    Button("Defer") {
                        Task { _ = await client.reviewPacketGoal(candidate: candidate, decision: "DEFER", title: nil, description: nil, previewOnly: previewOnly) }
                    }
                    .buttonStyle(.bordered)
                    .disabled(decisionsDisabled)
                    .accessibilityIdentifier("CapturePacketGoalDeferButton")
                    Button("Reject", role: .destructive) {
                        Task { _ = await client.reviewPacketGoal(candidate: candidate, decision: "REJECT", title: nil, description: nil, previewOnly: previewOnly) }
                    }
                    .buttonStyle(.bordered)
                    .disabled(decisionsDisabled)
                    .accessibilityIdentifier("CapturePacketGoalRejectButton")
                }
            }
            if !accepted && !isCreating {
                Text("Only Review & create goal can write one actor-owned ACTIVE Goal after its wording, target date, and tags are inspected. Every other decision creates no goal, task, date, focus block, reminder, calendar event, message, delivery, or publication.")
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

private struct CaptureTranscriptSegmentCard: View {
    let roomID: String
    let segment: CaptureTranscriptSegment
    let recording: LocalRecording?
    let expectedRecordingAssetID: String?
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
