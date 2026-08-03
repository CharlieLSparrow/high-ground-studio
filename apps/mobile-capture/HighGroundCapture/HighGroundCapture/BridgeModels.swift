import Foundation
import Combine
import CryptoKit

func normalizedNestBaseURL(_ value: String) -> String {
    #if DEBUG
    let launchOverride = ProcessInfo.processInfo.environment["QUIPSLY_API_BASE_URL"]?
        .trimmingCharacters(in: .whitespacesAndNewlines)
    if let launchOverride, !launchOverride.isEmpty {
        return normalizeNestBaseURLValue(launchOverride)
    }
    #endif

    return normalizeNestBaseURLValue(value)
}

private func normalizeNestBaseURLValue(_ value: String) -> String {
    var trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    while trimmed.hasSuffix("/") {
        trimmed.removeLast()
    }
    if trimmed.hasSuffix("/api") {
        trimmed.removeLast(4)
    }
    return trimmed.isEmpty ? "https://nest.quipsly.com" : trimmed
}

func normalizedNestAPIBaseURL(_ value: String) -> String {
    "\(normalizedNestBaseURL(value))/api"
}

struct RecorderCommand: Codable {
    let action: ActionType
    let projectSlug: String?
    let episodeSlug: String?
    let callRoomId: String?
    let participantId: String?
    let recordingConsentId: String?
    let recordingAssetId: String?
    let recordingConsentGranted: Bool?
    let capturePurpose: String?

    init(
        action: ActionType,
        projectSlug: String? = nil,
        episodeSlug: String? = nil,
        callRoomId: String? = nil,
        participantId: String? = nil,
        recordingConsentId: String? = nil,
        recordingAssetId: String? = nil,
        recordingConsentGranted: Bool? = nil,
        capturePurpose: String? = nil
    ) {
        self.action = action
        self.projectSlug = projectSlug
        self.episodeSlug = episodeSlug
        self.callRoomId = callRoomId
        self.participantId = participantId
        self.recordingConsentId = recordingConsentId
        self.recordingAssetId = recordingAssetId
        self.recordingConsentGranted = recordingConsentGranted
        self.capturePurpose = capturePurpose
    }

    static let stop = RecorderCommand(action: .stop)
    static let pause = RecorderCommand(action: .pause)
    static let resume = RecorderCommand(action: .resume)
    static let markBreak = RecorderCommand(action: .markBreak)

    enum ActionType: String, Codable {
        case start = "START"
        case stop = "STOP"
        case pause = "PAUSE"
        case resume = "RESUME"
        case markBreak = "MARK_BREAK"
    }
}

struct RecorderEvent: Codable {
    let type: EventType
    let detail: EventDetail

    enum EventType: String, Codable {
        case stateChange = "STATE_CHANGE"
        case uploadProgress = "UPLOAD_PROGRESS"
        case uploadComplete = "UPLOAD_COMPLETE"
        case error = "ERROR"
    }
}

struct EventDetail: Codable {
    let state: RecorderState?
    let durationMs: Int?
    let progress: Double?
    let mediaAssetId: String?
    let errorMessage: String?
    let localFilePath: String?
    let callRoomId: String?
    let consentStatus: String?

    init(
        state: RecorderState? = nil,
        durationMs: Int? = nil,
        progress: Double? = nil,
        mediaAssetId: String? = nil,
        errorMessage: String? = nil,
        localFilePath: String? = nil,
        callRoomId: String? = nil,
        consentStatus: String? = nil
    ) {
        self.state = state
        self.durationMs = durationMs
        self.progress = progress
        self.mediaAssetId = mediaAssetId
        self.errorMessage = errorMessage
        self.localFilePath = localFilePath
        self.callRoomId = callRoomId
        self.consentStatus = consentStatus
    }
}

enum RecorderState: String, Codable {
    case recording = "RECORDING"
    case paused = "PAUSED"
    case stopped = "STOPPED"
}

// MARK: - Native Capture Contract

struct NativeCaptureMode: Codable, Identifiable, Hashable {
    let id: String
    let label: String
    let purpose: String
    let nextAction: String

    var systemImage: String {
        if id == "coaching" { return "person.2.wave.2" }
        if id == "podcast" { return "mic.and.signal.meter" }
        if id == "research-interview" { return "quote.bubble" }
        return "record.circle"
    }
}

struct NativeCaptureContract: Codable, Hashable {
    let productionFirst: Bool
    let appSurface: String
    let primaryCallPath: String?
    let nativeCallPresentation: String?
    let fallbackCallImport: String?
    let phoneCallBoundary: String?
    let pstnBridgeCandidate: String?
    let localSourceTruth: String
    let uploadRule: String
    let verificationRule: String
    let deletionRule: String
    let modes: [NativeCaptureMode]

    static let production = NativeCaptureContract(
        productionFirst: true,
        appSurface: "Quipsly native capture",
        primaryCallPath: "Quipsly-owned in-app session rooms are the production call path for coaching, podcast, and research capture.",
        nativeCallPresentation: "Start CallKit integration from the first native-room workflow so Quipsly calls feel native on iOS, while LiveKit/WebRTC or another approved provider carries the actual room media.",
        fallbackCallImport: "Normal Phone or FaceTime calls are fallback/import sources only; users may manually import recordings or transcripts, but Quipsly should not depend on Apple Phone calls as the production capture path.",
        phoneCallBoundary: "Starting a regular phone call is not the same as joining a Quipsly capture room.",
        pstnBridgeCandidate: "A Twilio or similar PSTN bridge can be evaluated later for dial-in clients.",
        localSourceTruth: "Local recording files remain source truth until Nest verifies durable server storage.",
        uploadRule: "Uploads are resumable, receipt-backed, and recoverable; a failed upload holds the local recording instead of pretending it succeeded.",
        verificationRule: "Nest verifies byte presence, transcript repair state, consent, and packet readiness before treating capture as reusable.",
        deletionRule: "Original recordings are never silently deleted; cleanup requires server verification and an explicit retention rule.",
        modes: [
            NativeCaptureMode(
                id: "coaching",
                label: "One-to-one coaching",
                purpose: "Consent-aware coaching sessions with payment evidence, notes, action items, transcript review, and follow-up packets.",
                nextAction: "Create or open a coaching booking, confirm consent, then join from the native capture app."
            ),
            NativeCaptureMode(
                id: "podcast",
                label: "Podcast capture",
                purpose: "Double-ended or local-first podcast recording where durable audio becomes the spine for episodes and shorts.",
                nextAction: "Open the podcast or capture room, record local tracks, and let Quipsly assemble transcript and production assets."
            ),
            NativeCaptureMode(
                id: "research-interview",
                label: "Research interview",
                purpose: "Interviews, oral histories, and expert calls become searchable source material instead of disappearing into a meeting app.",
                nextAction: "Start from a Nest research session, capture with explicit consent, then review transcript segments and source notes."
            ),
        ]
    )
}

// MARK: - Segment Tracking

enum RecordingStopReason: String, Codable {
    case userStop = "user-stop"
    case pause = "pause"
    case interruption = "interruption"
    case userMark = "user-mark"
    case appBackgrounded = "app-backgrounded"
}

struct RecordingSegment: Codable {
    let id: String
    let sessionId: String
    let participantId: String
    let deviceKind: String
    let status: String
    let startedAt: String
    let stoppedAt: String?
    let durationSeconds: Double?
    let stopReason: RecordingStopReason?
}

// MARK: - Capture Sessions

struct MobileCaptureReadinessVerdict: Codable, Hashable {
    let status: String?
    let label: String?
    let tone: String?
    let safeToRecordLocally: Bool?
    let providerCanJoin: Bool?
    let detail: String?
    let nextAction: String?
    let blockers: [String]?
    let evidence: [String]?
}

struct MobileCaptureContentReadiness: Codable, Hashable {
    let status: String?
    let label: String?
    let tone: String?
    let detail: String?
    let nextAction: String?
    let captureAssetCount: Int?
    let knownDurationSeconds: Double?
    let longestKnownDurationSeconds: Double?
    let shortCaptureCount: Int?
    let simulatorCaptureCount: Int?
    let unknownDurationCount: Int?
    let verifiedCaptureCount: Int?
    let substantialRecordingCount: Int?
    let substantialThresholdSeconds: Double?

    var isSubstantial: Bool {
        status?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "substantial"
    }

    var evidenceLine: String {
        let duration = knownDurationSeconds.map { seconds in
            if seconds < 60 { return String(format: "%.1f sec known", seconds) }
            return String(format: "%.1f min known", seconds / 60)
        } ?? "duration unknown"
        return "\(captureAssetCount ?? 0) source media · \(verifiedCaptureCount ?? 0) verified · \(duration) · \(simulatorCaptureCount ?? 0) simulator · \(shortCaptureCount ?? 0) short"
    }
}

struct MobileCaptureJourneySummary: Codable, Hashable {
    let stage: String?
    let paymentStage: String?
    let providerStage: String?
    let packetStage: String?
    let evidence: [String: Bool]?
    let blockers: [String]?
    let nextAction: String?
}

struct MobileCaptureLifecycleCheck: Codable, Hashable, Identifiable {
    let id: String
    let label: String
    let status: String
    let meaning: String

    var isReceiptPresent: Bool {
        status.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "present"
    }

    var needsAttention: Bool {
        let normalized = status.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return normalized == "attention" || normalized == "missing"
    }
}

struct MobileCaptureLifecycleSafeAction: Codable, Hashable, Identifiable {
    let id: String
    let label: String
    let enabled: Bool
    let risk: String
    let why: String
    let boundary: String

    var statusLabel: String {
        enabled ? "safe next" : "waiting"
    }

    var riskLabel: String {
        let normalized = risk.trimmingCharacters(in: .whitespacesAndNewlines)
        return normalized.isEmpty ? "review" : normalized.replacingOccurrences(of: "-", with: " ")
    }
}

struct MobileCaptureLifecycle: Codable, Hashable {
    let kind: String?
    let stage: String?
    let readyForCapture: Bool?
    let readyForTranscript: Bool?
    let readyForPacket: Bool?
    let readyForReview: Bool?
    let checks: [MobileCaptureLifecycleCheck]?
    let safeActions: [MobileCaptureLifecycleSafeAction]?
    let nextAction: String?
}

struct MobileCaptureActionCapabilities: Codable, Hashable {
    let canJoin: Bool?
    let canStartLocalRecording: Bool?
    let canStartProviderRecording: Bool?
    let canPrepareProviderRecordingReceipt: Bool?
    let canPromoteRecordingToMedia: Bool?
    let canRunTranscript: Bool?
    let canBuildPacket: Bool?
    let canReviewPacket: Bool?
}

struct MobileCaptureActionBoundaries: Codable, Hashable {
    let stripeIsEvidenceOnly: Bool?
    let externalProviderMutation: Bool?
    let localRecordingFallbackAllowed: Bool?
    let providerRecordingRequiresReceipt: Bool?
    let recordingPromotionRequiresVerifiedEvidence: Bool?
    let providerRecordingStartAvailable: Bool?
    let noHiddenRecording: Bool?
    let reviewOnlyUntilUserActs: Bool?
}

struct MobileCaptureActionPacket: Codable, Hashable {
    let packetKind: String?
    let roomId: String?
    let bookingId: String?
    let stage: String?
    let capabilities: MobileCaptureActionCapabilities?
    let blockers: [String]?
    let nextAction: String?
    let boundaries: MobileCaptureActionBoundaries?
}

struct MobileCaptureSessionNote: Codable, Identifiable, Hashable {
    struct LastMergedSource: Codable, Hashable {
        let receiptId: String
        let packetNoteCandidateId: String
        let mergedAt: String
        let sourceAnchor: MobileCaptureTodayTranscriptSourceAnchor
    }
    let id: String
    let title: String?
    let body: String
    let kind: String
    let visibility: String
    let authorLabel: String
    let isMine: Bool
    let canEdit: Bool
    let origin: String
    let revisionCount: Int
    let tags: [MobileCaptureTag]
    let createdAt: String?
    let updatedAt: String?
    let sourceAnchor: MobileCaptureTodayTranscriptSourceAnchor?
    var lastMergedSource: LastMergedSource? = nil

    var purposeLabel: String {
        switch kind.uppercased() {
        case "FOLLOW_UP": "Continuity brief"
        case "DECISION": "Decision"
        case "PRODUCTION": "Production note"
        default: "Session note"
        }
    }

    var audienceLabel: String {
        switch visibility.uppercased() {
        case "SESSION_SHARED": "Session"
        case "CLIENT_SAFE": "Client-safe"
        case "PROJECT_TEAM": "Project team"
        default: "Only me"
        }
    }

    var audienceBoundary: String {
        switch visibility.uppercased() {
        case "SESSION_SHARED":
            "Visible to people with access to this Session."
        case "CLIENT_SAFE":
            "Ready for reviewed client follow-up. It has not been sent."
        case "PROJECT_TEAM":
            "Visible to the production-capable Nest team. It is not published."
        default:
            "Visible only to the author, including against staff access."
        }
    }
}

struct MobileCaptureTodayTaskTranscriptEvidence: Codable, Hashable {
    let receiptId: String
    let actionCandidateId: String
    let mergedAt: String
    let sourceAnchor: MobileCaptureTodayTranscriptSourceAnchor
}

private struct MobileSessionNoteEditRequest: Encodable {
    let clientRequestId: String
    let title: String?
    let body: String
    let kind: String
    let visibility: String
    let tagIds: [String]
    let expectedUpdatedAt: String

    init(edit: PendingSessionNoteEdit) {
        clientRequestId = edit.clientRequestID
        title = edit.title
        body = edit.body
        kind = edit.noteKind.rawValue
        visibility = edit.noteVisibility.rawValue
        tagIds = edit.tagIDs
        expectedUpdatedAt = edit.expectedUpdatedAt
    }
}

struct MobileSessionNoteEditResponse: Decodable {
    struct Note: Decodable {
        let id: String
        let title: String?
        let body: String
        let kind: String
        let visibility: String
        let updatedAt: String
        let revisionCount: Int
        let tags: [MobileCaptureTag]
    }

    let ok: Bool
    let code: String?
    let error: String?
    let note: Note?
    let current: Note?
    let receiptId: String?
    let idempotentReplay: Bool?
    let appliedRevision: Int?
}

enum MobileSessionNoteEditSyncResult {
    case acknowledged(idempotentReplay: Bool, message: String)
    case retryable(message: String)
    case held(code: String?, message: String)
}

struct MobileCaptureSourceSummary: Codable, Identifiable, Hashable {
    let recordingAssetId: String
    let captureGroupId: String?
    let fileName: String?
    let kind: String?
    let contentType: String?
    let recordingStatus: String?
    let exactBytesVerified: Bool?
    let processingDisposition: String?
    let recordedStartedAt: String?
    let recordedStoppedAt: String?
    let mediaAssetId: String?
    let playbackUrl: String?

    var id: String { recordingAssetId }

    var isVerifiedForStudio: Bool {
        recordingStatus?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .uppercased() == "VERIFIED"
            && exactBytesVerified == true
            && processingDisposition?
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .uppercased() == "RELEASED"
    }

    var isPromotedToStudio: Bool {
        mediaAssetId?.trimmingCharacters(in: .whitespacesAndNewlines)
            .isEmpty == false
    }
}

struct MobileCaptureClientFollowUpNote: Codable, Identifiable, Hashable {
    let id: String
    let title: String?
    let body: String
    let kind: String
    let sourceAnchor: MobileCaptureTodayTranscriptSourceAnchor?
}

struct MobileCaptureClientFollowUpGoal: Codable, Identifiable, Hashable {
    let id: String
    let title: String
    let description: String?
    let status: String
    let targetAt: String?
    let sourceAnchor: MobileCaptureTodayTranscriptSourceAnchor?
}

struct MobileCaptureClientFollowUpTask: Codable, Identifiable, Hashable {
    let id: String
    let title: String
    let detail: String?
    let status: String
    let dueAt: String?
    let sourceAnchor: MobileCaptureTodayTranscriptSourceAnchor?
}

struct MobileCaptureClientFollowUp: Codable, Identifiable, Hashable {
    let id: String
    let status: String
    let title: String
    let intro: String?
    let nextSessionFocus: String?
    let contentSha256: String
    let revision: Int
    let releasedAt: String?
    let recipientLabel: String
    let openedAt: String?
    let canAcknowledge: Bool
    let notes: [MobileCaptureClientFollowUpNote]
    let goals: [MobileCaptureClientFollowUpGoal]
    let tasks: [MobileCaptureClientFollowUpTask]
}

struct MobileCaptureClientFollowUpRoom: Codable, Hashable {
    let id: String
    let title: String
    let scheduledStart: String?
    let coach: MobileCaptureClientFollowUpParty?
    let client: MobileCaptureClientFollowUpParty
}

struct MobileCaptureClientFollowUpParty: Codable, Hashable {
    let id: String
    let label: String
}

struct MobileCaptureClientFollowUpEligible: Codable, Hashable {
    let notes: [MobileCaptureClientFollowUpNote]
    let goals: [MobileCaptureClientFollowUpGoal]
    let tasks: [MobileCaptureClientFollowUpTask]
}

struct MobileCaptureClientFollowUpWorkspace: Codable, Hashable {
    let role: String
    let room: MobileCaptureClientFollowUpRoom
    let eligible: MobileCaptureClientFollowUpEligible?
    let output: MobileCaptureClientFollowUp?

    var isCoach: Bool { role == "COACH" }
}

struct MobileCaptureClientFollowUpDraft: Hashable {
    var title: String
    var intro: String
    var nextSessionFocus: String
    var noteIDs: Set<String>
    var goalIDs: Set<String>
    var taskIDs: Set<String>

    var selectedCount: Int { noteIDs.count + goalIDs.count + taskIDs.count }

    var isValid: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && (selectedCount > 0
                || !intro.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                || !nextSessionFocus.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
    }

    static func make(from workspace: MobileCaptureClientFollowUpWorkspace) -> Self {
        let eligibleNoteIDs = Set(workspace.eligible?.notes.map(\.id) ?? [])
        let eligibleGoalIDs = Set(workspace.eligible?.goals.map(\.id) ?? [])
        let eligibleTaskIDs = Set(workspace.eligible?.tasks.map(\.id) ?? [])
        guard let output = workspace.output, output.status == "DRAFT" else {
            return Self(
                title: "Follow-up — \(workspace.room.title)",
                intro: "",
                nextSessionFocus: "",
                noteIDs: eligibleNoteIDs,
                goalIDs: eligibleGoalIDs,
                taskIDs: eligibleTaskIDs
            )
        }
        return Self(
            title: output.title,
            intro: output.intro ?? "",
            nextSessionFocus: output.nextSessionFocus ?? "",
            noteIDs: Set(output.notes.map(\.id)).intersection(eligibleNoteIDs),
            goalIDs: Set(output.goals.map(\.id)).intersection(eligibleGoalIDs),
            taskIDs: Set(output.tasks.map(\.id)).intersection(eligibleTaskIDs)
        )
    }
}

struct MobileCapturePriorContinuityRoom: Codable, Hashable {
    let id: String
    let title: String
    let purpose: String
    let projectId: String
    let scheduledStart: String?
    let endedAt: String?
}

struct MobileCapturePriorContinuityBrief: Codable, Hashable {
    let id: String
    let title: String
    let body: String
    let snapshotSha256: String
    let createdAt: String
    var taskEvidence: [MobileCapturePriorContinuityTaskEvidence]? = nil
}

struct MobileCapturePriorContinuityTaskEvidence: Codable, Hashable, Identifiable {
    let taskId: String
    let taskTitle: String
    let evidence: MobileCaptureTodayTaskTranscriptEvidence

    var id: String { "\(taskId)-\(evidence.receiptId)" }
}

struct MobileCapturePriorContinuity: Codable, Hashable {
    let sourceRoom: MobileCapturePriorContinuityRoom
    let brief: MobileCapturePriorContinuityBrief
    let relationship: String
    let currentSessionMutated: Bool
    let externalSideEffects: Bool
}

struct MobileCaptureFollowThroughTask: Codable, Identifiable, Hashable {
    let id: String
    let title: String
    let detail: String?
    let status: String
    let dueAt: String?
    let completedAt: String?
    let updatedAt: String?
    let availability: String
    let changedSinceRelease: Bool
    let releasedStatus: String
    let releasedContentSha256: String
}

struct MobileCaptureFollowThroughProgress: Codable, Identifiable, Hashable {
    let id: String
    let kind: String
    let progressPercent: Int?
    let note: String?
    let occurredAt: String
}

struct MobileCaptureFollowThroughGoal: Codable, Identifiable, Hashable {
    let id: String
    let title: String
    let description: String?
    let status: String
    let targetAt: String?
    let achievedAt: String?
    let updatedAt: String?
    let availability: String
    let changedSinceRelease: Bool
    let progressedSinceRelease: Bool?
    let releasedStatus: String
    let releasedContentSha256: String
    let latestProgress: MobileCaptureFollowThroughProgress?
}

struct MobileCaptureFollowThroughSourceRoom: Codable, Hashable {
    let id: String
    let title: String
    let projectId: String
    let scheduledStart: String?
}

struct MobileCaptureFollowThroughOutput: Codable, Hashable {
    let id: String
    let title: String
    let intro: String?
    let nextSessionFocus: String?
    let contentSha256: String
    let revision: Int
    let releasedAt: String
    let recipientLabel: String
}

struct MobileCaptureFollowThroughSummary: Codable, Hashable {
    let openTaskCount: Int
    let completedTaskCount: Int
    let activeGoalCount: Int
    let achievedGoalCount: Int
    let changedSinceReleaseCount: Int
    let unavailableCount: Int
}

struct MobileCapturePriorFollowThrough: Codable, Hashable {
    let schema: String
    let viewerRole: String
    let sourceRoom: MobileCaptureFollowThroughSourceRoom
    let output: MobileCaptureFollowThroughOutput
    let tasks: [MobileCaptureFollowThroughTask]
    let goals: [MobileCaptureFollowThroughGoal]
    let summary: MobileCaptureFollowThroughSummary
    let relationship: String
    let canOpenWork: Bool
    let canonicalRecordsMutated: Bool
    let currentSessionMutated: Bool
    let externalSideEffects: Bool
}

struct MobileCaptureSession: Codable, Identifiable, Hashable {
    let id: String
    let callRoomId: String
    let title: String
    let purpose: String?
    let status: String?
    let updatedAt: String?
    let provider: String?
    let providerRoomId: String?
    let providerCanJoin: Bool?
    let providerReadiness: String?
    let providerNextAction: String?
    let projectId: String?
    let projectSlug: String?
    let projectName: String?
    var availableTags: [MobileCaptureTag]? = nil
    let projectBindingSource: String?
    let projectLegacySlugDrift: Bool?
    let episodeSlug: String?
    let scheduledStart: String?
    let scheduledEnd: String?
    let participantId: String?
    let recordingConsentId: String?
    let recordingConsentStatus: String?
    let recordingConsentGranted: Bool
    var recordingConsentCanRecordAudio: Bool? = nil
    var recordingConsentCanRecordVideo: Bool? = nil
    var recordingConsentCanTranscribe: Bool? = nil
    var recordingConsentVideoGranted: Bool? = nil
    let canRecordNow: Bool
    var canRecordAudioNow: Bool? = nil
    var canRecordVideoNow: Bool? = nil
    var consentRequiredParticipantCount: Int? = nil
    var consentGrantedParticipantCount: Int? = nil
    var allRegisteredParticipantConsentGranted: Bool? = nil
    var videoConsentGrantedParticipantCount: Int? = nil
    var allRegisteredParticipantVideoConsentGranted: Bool? = nil
    let captureReadiness: MobileCaptureReadinessVerdict?
    var videoCaptureReadiness: MobileCaptureReadinessVerdict? = nil
    let journeySummary: MobileCaptureJourneySummary?
    var contentReadiness: MobileCaptureContentReadiness? = nil
    let lifecycle: MobileCaptureLifecycle?
    let actionPacket: MobileCaptureActionPacket?
    let clientLabel: String?
    let coachLabel: String?
    let offeringTitle: String?
    let bookingStatus: String?
    let paymentPolicy: String?
    let paymentStatus: String?
    let calendarStatus: String?
    let recordingCount: Int
    var captureSources: [MobileCaptureSourceSummary]? = nil
    let providerRecordingReceiptSlotId: String?
    let providerRecordingReceiptStatus: String?
    let providerRecordingReceiptNextAction: String?
    let transcriptJobCount: Int
    let latestRecordingAssetId: String?
    let latestRecordingAssetStatus: String?
    let latestRecordingFileName: String?
    let latestRecordingMediaAssetId: String?
    let latestRecordingPlaybackUrl: String?
    let latestRecordingPromotionStatus: String?
    let latestTranscriptJobId: String?
    let latestTranscriptStatus: String?
    let latestTranscriptProvider: String?
    let latestTranscriptSegmentCount: Int?
    let coachingPacketSummaryNoteId: String?
    let coachingPacketTitle: String?
    let coachingPacketPreview: String?
    let coachingPacketHighlightCount: Int?
    let coachingPacketActionItemCount: Int?
    let coachingPacketLatestActivityAt: String?
    let coachingPacketFirstOpenActionItemId: String?
    let coachingPacketStatus: String?
    var coachingPacketReviewLanes: [MobileCapturePacketReviewLane]? = nil
    var clientFollowUp: MobileCaptureClientFollowUp? = nil
    var clientFollowUpWorkspace: MobileCaptureClientFollowUpWorkspace? = nil
    var priorContinuity: MobileCapturePriorContinuity? = nil
    var priorFollowThrough: MobileCapturePriorFollowThrough? = nil
    var canUseProjectTeamNotes: Bool? = nil
    var sessionNotes: [MobileCaptureSessionNote]? = nil
    let afterCaptureNextAction: String?
    let nextAction: String?

    var displayTitle: String {
        if let offeringTitle, !offeringTitle.isEmpty {
            return offeringTitle
        }
        return title
    }

    var detailLine: String {
        var parts: [String] = []
        if let purpose, !purpose.isEmpty { parts.append(purpose.lowercased()) }
        if let bookingStatus, !bookingStatus.isEmpty { parts.append("booking \(bookingStatus.lowercased())") }
        if let status, !status.isEmpty { parts.append(status.lowercased()) }
        if let provider, !provider.isEmpty { parts.append("provider \(provider.lowercased())") }
        if let paymentStatus, !paymentStatus.isEmpty { parts.append("payment \(paymentStatus.lowercased())") }
        if let scheduledStart, !scheduledStart.isEmpty { parts.append(scheduledStart) }
        return parts.isEmpty ? "Quipsly capture session" : parts.joined(separator: " · ")
    }

    var providerLabel: String {
        let normalized = provider?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
        if normalized == "livekit" { return "LiveKit room" }
        if normalized == "planned" || normalized.isEmpty { return "Planned room" }
        return "\(normalized.capitalized) room"
    }

    var bookingBadgeLabel: String {
        let normalized = bookingStatus?.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() ?? ""
        if normalized == "CONFIRMED" { return "Booking confirmed" }
        if normalized == "HOLDING_PAYMENT" { return "Payment hold" }
        if normalized == "REQUESTED" { return "Booking requested" }
        if normalized == "CANCELED" { return "Canceled" }
        if normalized == "COMPLETED" { return "Complete" }
        return "Planned room"
    }

    var scheduleEvidenceLine: String {
        let calendar = calendarStatus?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let payment = paymentPolicy?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let calendarLabel = calendar?.isEmpty == false ? "calendar \(calendar!)" : "calendar receipt slot"
        let paymentLabel = payment?.isEmpty == false ? "payment \(payment!)" : "payment not required"
        return "\(calendarLabel) · \(paymentLabel)"
    }

    private func journeyDisplayLabel(_ value: String?) -> String {
        let raw = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if raw.isEmpty { return "Session prep" }
        let separated = raw
            .replacingOccurrences(of: "_", with: " ")
            .replacingOccurrences(of: "-", with: " ")
        return separated.capitalized
    }

    var journeyStageLabel: String {
        journeyDisplayLabel(journeySummary?.stage)
    }

    var journeyNextAction: String {
        let next = journeySummary?.nextAction?.trimmingCharacters(in: .whitespacesAndNewlines)
        if let next, !next.isEmpty { return next }
        return captureReadinessNextAction
    }

    var journeyEvidenceChips: [(String, Bool)] {
        let evidence = journeySummary?.evidence ?? [:]
        let preferredKeys = [
            "appOwnedRoom",
            "participantLinked",
            "bookingAttached",
            "paymentResolved",
            "consentGranted",
            "providerJoinReady",
            "localFallbackReady",
            "capturePlumbingEvidence",
            "substantialRecordingEvidence",
            "transcriptCompleted",
            "packetEvidence",
        ]

        return preferredKeys.compactMap { key in
            guard let value = evidence[key] else { return nil }
            return (journeyDisplayLabel(key), value)
        }
    }

    var lifecycleStageLabel: String {
        journeyDisplayLabel(lifecycle?.stage)
    }

    var lifecycleNextAction: String {
        let next = lifecycle?.nextAction?.trimmingCharacters(in: .whitespacesAndNewlines)
        if let next, !next.isEmpty { return next }
        return journeyNextAction
    }

    var lifecycleReceiptChips: [(String, Bool, Bool)] {
        let preferredIds = [
            "booking",
            "payment",
            "calendar-receipt",
            "room",
            "participants",
            "consent",
            "capture-route",
            "recording",
            "server-recording",
            "transcript",
            "packet",
        ]
        let checks = lifecycle?.checks ?? []
        let byId = Dictionary(uniqueKeysWithValues: checks.map { ($0.id, $0) })

        return preferredIds.compactMap { id in
            guard let check = byId[id] else { return nil }
            let normalized = check.status.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            if normalized == "not-required" { return nil }
            return (check.label, check.isReceiptPresent, check.needsAttention)
        }
    }

    var lifecycleReceiptLine: String {
        let chips = lifecycleReceiptChips
        if chips.isEmpty { return "Receipt slots waiting for Nest lifecycle data." }
        let present = chips.filter { $0.1 }.count
        return "\(present)/\(chips.count) lifecycle receipts present"
    }

    var lifecycleSafeActions: [MobileCaptureLifecycleSafeAction] {
        let actions = lifecycle?.safeActions ?? []
        return actions.sorted { lhs, rhs in
            if lhs.enabled != rhs.enabled { return lhs.enabled && !rhs.enabled }
            return lhs.label.localizedCaseInsensitiveCompare(rhs.label) == .orderedAscending
        }
    }

    var bookingTintIsReady: Bool {
        let normalized = bookingStatus?.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() ?? ""
        return normalized == "CONFIRMED" || normalized == "COMPLETED"
    }

    var captureReadinessLabel: String {
        let label = captureReadiness?.label?.trimmingCharacters(in: .whitespacesAndNewlines)
        if let label, !label.isEmpty { return label }
        return recordingConsentGranted ? "Ready locally" : "Consent needed"
    }

    var hasCurrentRecordingConsent: Bool {
        recordingConsentGranted || recordingConsentVideoGranted == true
    }

    var captureReadinessDetail: String {
        let detail = captureReadiness?.detail?.trimmingCharacters(in: .whitespacesAndNewlines)
        if let detail, !detail.isEmpty { return detail }
        return nextAction ?? "Choose a Quipsly session, grant consent, then start capture."
    }

    var captureReadinessNextAction: String {
        let next = captureReadiness?.nextAction?.trimmingCharacters(in: .whitespacesAndNewlines)
        if let next, !next.isEmpty { return next }
        return nextAction ?? afterCaptureLine
    }

    var captureReadinessIsSafeToRecord: Bool {
        captureReadiness?.safeToRecordLocally == true
    }

    var captureReadinessTone: String {
        captureReadiness?.tone?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
    }

    var providerReadinessLine: String {
        let normalized = provider?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
        if normalized == "livekit" {
            return providerNextAction ?? "Provider room can be prepared. Recording still requires explicit consent."
        }
        return providerNextAction ?? "Local capture is available. Team can prepare a LiveKit room from the coaching runway."
    }

    var providerBadgeLabel: String {
        if providerCanJoin == true { return "Join ready" }
        let readiness = providerReadiness?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
        if readiness.contains("livekit") { return "Needs setup" }
        return "Local fallback"
    }

    var hasProviderRecordingReceiptSlot: Bool {
        providerRecordingReceiptSlotId?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
    }

    var providerReceiptStatusLabel: String {
        let status = providerRecordingReceiptStatus?.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let status, !status.isEmpty else {
            return hasProviderRecordingReceiptSlot ? "receipt slot prepared" : "none"
        }
        return status
            .replacingOccurrences(of: "_", with: " ")
            .replacingOccurrences(of: "-", with: " ")
            .lowercased()
    }

    var providerReceiptActionLabel: String {
        let action = providerRecordingReceiptNextAction?.trimmingCharacters(in: .whitespacesAndNewlines)
        if let action, !action.isEmpty { return action }
        return "Provider recording receipt slots are not recordings yet. Attach verified provider media before transcription."
    }

    var afterCaptureLine: String {
        if let afterCaptureNextAction, !afterCaptureNextAction.isEmpty {
            return afterCaptureNextAction
        }
        if hasProviderRecordingReceiptSlot, recordingCount == 0 {
            return providerReceiptActionLabel
        }
        if recordingCount == 0 { return "No recordings attached yet." }
        if let latestTranscriptStatus, !latestTranscriptStatus.isEmpty {
            return "Latest transcript job: \(latestTranscriptStatus.lowercased())."
        }
        return "Recording evidence exists. Refresh after upload to continue."
    }

    var transcriptBadgeLabel: String {
        let status = latestTranscriptStatus?.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() ?? ""
        if status == "COMPLETED" { return "Transcript ready" }
        if status == "RUNNING" { return "Transcribing" }
        if status == "HELD" || status == "FAILED" { return "Needs review" }
        if status == "QUEUED" { return "Queued" }
        return transcriptJobCount > 0 ? "Transcript pending" : "No transcript"
    }

    var packetBadgeLabel: String {
        if coachingPacketSummaryNoteId != nil { return "Packet ready" }
        let status = coachingPacketStatus?.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() ?? ""
        if status == "PACKET_READY_TO_BUILD" { return "Can build packet" }
        return "No packet yet"
    }

    var canRunTranscript: Bool {
        let status = latestTranscriptStatus?.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() ?? ""
        if ["COMPLETED", "RUNNING"].contains(status) {
            return false
        }

        if latestTranscriptJobId != nil {
            return true
        }

        guard latestRecordingAssetId != nil else {
            return false
        }

        let assetStatus = latestRecordingAssetStatus?.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() ?? ""
        return ["UPLOADED", "VERIFIED"].contains(assetStatus)
    }

    var studioHandoffCaptureGroupID: String? {
        captureSources?
            .compactMap(\.captureGroupId)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .first { !$0.isEmpty }
    }

    var studioHandoffSources: [MobileCaptureSourceSummary] {
        guard let captureGroupID = studioHandoffCaptureGroupID else {
            return []
        }
        return (captureSources ?? []).filter {
            $0.captureGroupId?
                .trimmingCharacters(in: .whitespacesAndNewlines)
                == captureGroupID
        }
    }

    func studioCaptureReviewURL(baseURLString: String) -> URL? {
        guard let projectSlug = projectSlug?
            .trimmingCharacters(in: .whitespacesAndNewlines),
              !projectSlug.isEmpty,
              let episodeSlug = episodeSlug?
                .trimmingCharacters(in: .whitespacesAndNewlines),
              !episodeSlug.isEmpty,
              let captureGroupID = studioHandoffCaptureGroupID,
              !captureGroupID.isEmpty,
              let baseURL = URL(
                string: normalizedNestBaseURL(baseURLString)
              ),
              var components = URLComponents(
                url: baseURL,
                resolvingAgainstBaseURL: false
              ) else { return nil }
        components.path = "/editor"
        components.queryItems = [
            URLQueryItem(name: "project", value: projectSlug),
            URLQueryItem(name: "episode", value: episodeSlug),
            URLQueryItem(name: "captureGroup", value: captureGroupID),
        ]
        components.fragment = "guided-sync-wizard"
        return components.url
    }

    var recordingPromotedToStudioMedia: Bool {
        let sources = studioHandoffSources
        if !sources.isEmpty {
            return sources.allSatisfy(\.isPromotedToStudio)
        }
        return latestRecordingMediaAssetId?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .isEmpty == false
    }

    var canPromoteRecordingToStudioMedia: Bool {
        guard projectSlug?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false else { return false }
        let sources = studioHandoffSources
        if !sources.isEmpty {
            return sources.allSatisfy(\.isVerifiedForStudio)
                && sources.contains { !$0.isPromotedToStudio }
        }
        if actionPacket?.capabilities?.canPromoteRecordingToMedia == true { return true }
        guard latestRecordingAssetId != nil, !recordingPromotedToStudioMedia else { return false }
        let assetStatus = latestRecordingAssetStatus?.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() ?? ""
        return assetStatus == "VERIFIED"
    }

    var recordingPromotionBadgeLabel: String {
        let sources = studioHandoffSources
        if !sources.isEmpty {
            let promotedCount = sources.filter(\.isPromotedToStudio).count
            if promotedCount == sources.count {
                return "\(sources.count) \(sources.count == 1 ? "source" : "sources") in Studio"
            }
            if promotedCount > 0 {
                return "\(promotedCount) of \(sources.count) in Studio"
            }
            if sources.allSatisfy(\.isVerifiedForStudio) {
                return "\(sources.count) \(sources.count == 1 ? "source" : "sources") ready"
            }
            let verifiedCount = sources.filter(\.isVerifiedForStudio).count
            return "\(verifiedCount) of \(sources.count) verified"
        }
        if recordingPromotedToStudioMedia { return "Studio media ready" }
        if latestRecordingAssetId != nil && projectSlug?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty != false {
            return "Choose a Nest"
        }
        let status = latestRecordingPromotionStatus?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
        if status.contains("ready") || canPromoteRecordingToStudioMedia { return "Ready for Studio" }
        if latestRecordingAssetId != nil { return "Studio media pending" }
        return "No media handoff"
    }

    var recordingMediaVaultLine: String {
        let sources = studioHandoffSources
        if !sources.isEmpty {
            let promotedCount = sources.filter(\.isPromotedToStudio).count
            if promotedCount == sources.count {
                return "The complete \(sources.count)-source capture group is attached to Studio. Every original remains immutable capture evidence."
            }
            if promotedCount > 0 {
                return "\(promotedCount) of \(sources.count) capture-group sources reached Studio. Retry safely to continue the exact same handoff."
            }
            if sources.allSatisfy(\.isVerifiedForStudio) {
                return "All \(sources.count) sources in this capture group passed exact-byte verification and can move to Studio together."
            }
            let verifiedCount = sources.filter(\.isVerifiedForStudio).count
            return "\(verifiedCount) of \(sources.count) capture-group sources are verified. Studio handoff waits for the complete group."
        }
        if let mediaAssetId = latestRecordingMediaAssetId, !mediaAssetId.isEmpty {
            return "Promoted to Studio media: \(mediaAssetId). The original recording remains capture evidence."
        }
        if latestRecordingAssetId != nil && projectSlug?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty != false {
            return "This Session is unfiled. Choose a Nest in Quipsly before attaching its recording to Studio."
        }
        if canPromoteRecordingToStudioMedia {
            return "Verified recording can be attached to the Nest media vault for editor use."
        }
        if latestRecordingAssetId != nil {
            return "Recording exists, but Studio media promotion waits for server verification."
        }
        return "Record first; then Quipsly can attach verified media to the Nest/editor workflow."
    }

    var canBuildPacket: Bool {
        guard latestTranscriptJobId != nil else { return false }
        let status = latestTranscriptStatus?.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() ?? ""
        return status == "COMPLETED"
    }
}

struct MobileCaptureTag: Codable, Identifiable, Hashable {
    let id: String
    let slug: String
    let label: String
    var isActive: Bool? = nil
}

struct MobileCaptureProjectDestination: Codable, Identifiable, Hashable {
    let id: String
    let slug: String
    let name: String
    let role: String
    let isHomeNest: Bool?
    let availableTags: [MobileCaptureTag]?

    var isHome: Bool { isHomeNest == true }
    var tags: [MobileCaptureTag] { availableTags ?? [] }
}

struct MobileCaptureSessionsResponse: Codable {
    let ok: Bool
    let error: String?
    let captureProjects: [MobileCaptureProjectDestination]?
    let sessions: [MobileCaptureSession]?
}

private struct MobileCaptureClientFollowUpMutationResponse: Codable {
    let ok: Bool
    let error: String?
    let idempotentReplay: Bool?
}

private struct MobileCaptureClientFollowUpReadResponse: Decodable {
    struct Party: Decodable {
        let id: String
        let label: String
    }

    struct Room: Decodable {
        let id: String
        let title: String
        let scheduledStart: String?
        let coach: Party?
        let client: Party
    }

    struct Delivery: Decodable {
        let kind: String
        let occurredAt: String
    }

    struct Body: Decodable {
        let notes: [MobileCaptureClientFollowUpNote]
        let goals: [MobileCaptureClientFollowUpGoal]
        let tasks: [MobileCaptureClientFollowUpTask]
    }

    struct Output: Decodable {
        let id: String
        let status: String
        let title: String
        let intro: String?
        let nextSessionFocus: String?
        let contentSha256: String
        let revision: Int
        let releasedAt: String?
        let recipient: Party
        let body: Body
        let deliveryEvents: [Delivery]
    }

    let ok: Bool
    let error: String?
    let role: String?
    let room: Room?
    let eligible: MobileCaptureClientFollowUpEligible?
    let output: Output?

    private var mappedOutput: MobileCaptureClientFollowUp? {
        guard let output else { return nil }
        return MobileCaptureClientFollowUp(
            id: output.id,
            status: output.status,
            title: output.title,
            intro: output.intro,
            nextSessionFocus: output.nextSessionFocus,
            contentSha256: output.contentSha256,
            revision: output.revision,
            releasedAt: output.releasedAt,
            recipientLabel: output.recipient.label,
            openedAt: output.deliveryEvents.last(where: { $0.kind == "OPENED_IN_APP" })?.occurredAt,
            canAcknowledge: role == "CLIENT",
            notes: output.body.notes,
            goals: output.body.goals,
            tasks: output.body.tasks
        )
    }

    var workspace: MobileCaptureClientFollowUpWorkspace? {
        guard let role, let room else { return nil }
        return MobileCaptureClientFollowUpWorkspace(
            role: role,
            room: MobileCaptureClientFollowUpRoom(
                id: room.id,
                title: room.title,
                scheduledStart: room.scheduledStart,
                coach: room.coach.map { MobileCaptureClientFollowUpParty(id: $0.id, label: $0.label) },
                client: MobileCaptureClientFollowUpParty(id: room.client.id, label: room.client.label)
            ),
            eligible: eligible,
            output: mappedOutput
        )
    }

    var releasedClientFollowUp: MobileCaptureClientFollowUp? {
        guard role == "CLIENT", mappedOutput?.status == "RELEASED" else { return nil }
        return mappedOutput
    }
}

struct MobileCaptureTranscriptSourceSpanSegment: Codable, Hashable {
    let segmentId: String
    let startSeconds: TimeInterval
    let endSeconds: TimeInterval
    let providerTextSha256: String
    let providerSpeakerLabel: String?
    let effectiveTextSnapshot: String
    let effectiveSpeakerLabelSnapshot: String?
    let acceptedReviewId: String?
    let acceptedCorrectionId: String?
    let reviewStatus: String
}

struct MobileCaptureTranscriptSourceSpan: Codable, Hashable {
    let schema: String
    let primarySegmentId: String
    let segmentIds: [String]
    let startSeconds: TimeInterval
    let endSeconds: TimeInterval
    let effectiveTextSnapshot: String
    let segments: [MobileCaptureTranscriptSourceSpanSegment]
}

struct MobileCaptureTodayTranscriptSourceAnchor: Codable, Hashable, Identifiable {
    let schema: String
    let roomId: String
    let transcriptJobId: String
    let segmentId: String
    let startSeconds: TimeInterval
    let endSeconds: TimeInterval
    let providerTextSha256: String
    let providerSpeakerLabel: String?
    let effectiveTextSnapshot: String
    let effectiveSpeakerLabelSnapshot: String?
    let acceptedCorrectionId: String?
    let recordingAssetId: String
    let playbackSourceId: String
    var sourceSpan: MobileCaptureTranscriptSourceSpan? = nil

    var id: String { "\(roomId)|\(transcriptJobId)|\(segmentId)" }
}

struct MobileCaptureTodayProject: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let slug: String
}

struct MobileCaptureTodayRecurrence: Codable, Hashable {
    let seriesId: String
    let occurrenceKey: String
    let scheduledLocalDate: String
    let cadence: String
    let frequency: String
    let interval: Int
    let timezone: String
    let localTimeMinutes: Int
    let status: String
    let updatedAt: String
    let ownerCanManage: Bool
}

struct MobileCaptureTodayReminderIntent: Codable, Identifiable, Hashable {
    let id: String
    let actionItemId: String
    let remindAt: String
    let status: String
    let updatedAt: String

    var canonicalProjection: CanonicalTaskReminderIntent? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = fractional.date(from: remindAt)
                ?? ISO8601DateFormatter().date(from: remindAt) else { return nil }
        return CanonicalTaskReminderIntent(
            id: id,
            actionItemID: actionItemId,
            remindAt: date,
            status: status
        )
    }
}

struct MobileCaptureTodayTask: Codable, Identifiable, Hashable {
    let id: String
    let title: String
    let detail: String?
    let status: String
    let isOverdue: Bool?
    let dueAt: String?
    let updatedAt: String
    let roomId: String?
    let sessionTitle: String?
    let project: MobileCaptureTodayProject?
    let canEditTags: Bool?
    let tagIds: [String]?
    let tagLabels: [String]?
    let sourceAnchor: MobileCaptureTodayTranscriptSourceAnchor?
    let lastMergedTranscriptEvidence: MobileCaptureTodayTaskTranscriptEvidence?
    let todayReason: String?
    let recurrence: MobileCaptureTodayRecurrence?
    let reminder: MobileCaptureTodayReminderIntent?
}

struct MobileCaptureTodayGoal: Codable, Identifiable, Hashable {
    let id: String
    let title: String
    let description: String?
    let status: String
    let targetAt: String?
    let progressPercent: Int?
    let progressNote: String?
    let updatedAt: String
    let roomId: String?
    let sessionTitle: String?
    let project: MobileCaptureTodayProject?
    let canEditTags: Bool?
    let tagIds: [String]?
    let tagLabels: [String]?
    let sourceAnchor: MobileCaptureTodayTranscriptSourceAnchor?
    let lastMergedTranscriptEvidence: MobileCaptureTodayGoalTranscriptEvidence?
}

struct MobileCaptureTodayGoalTranscriptEvidence: Codable, Hashable {
    let receiptId: String
    let goalCandidateId: String
    let mergedAt: String
    let sourceAnchor: MobileCaptureTodayTranscriptSourceAnchor
}

struct MobileCaptureTodayFocusBlock: Codable, Identifiable, Hashable {
    let id: String
    let targetType: String
    let targetId: String
    let title: String
    let targetStatus: String
    let startsAt: String
    let endsAt: String
    let timezone: String
    let status: String
    let completedAt: String?
    let actualMinutes: Int?
    let updatedAt: String
}

struct MobileCaptureTodayWeeklyPlan: Codable, Hashable {
    let id: String
    let weekStartsAt: String
    let commitments: [String]
    let supportNeeded: String?
    let progressNotes: String?
    let clientReviewedAt: String?
    let updatedAt: String
}

struct MobileCaptureWeeklyReviewNextTask: Codable, Identifiable, Hashable {
    let id: String
    let title: String
    let dueAt: String?
}

struct MobileCaptureWeeklyReviewGoal: Codable, Identifiable, Hashable {
    let id: String
    let title: String
    let status: String
    let health: String
    let healthLabel: String
    let progressPercent: Int?
    let latestEvidence: String?
    let latestEvidenceAt: String?
    let plannedMinutes: Int
    let actualMinutes: Int
    let completedBlocksWithoutActualMinutes: Int
    let linkedTaskCount: Int
    let completedTaskCount: Int
    let openTaskCount: Int
    let overdueTaskCount: Int
    let blockers: [String]
    let nextTask: MobileCaptureWeeklyReviewNextTask?
}

struct MobileCaptureWeeklyReviewCommitment: Codable, Identifiable, Hashable {
    let kind: String
    let id: String
    let title: String
    let dueAt: String?
}

struct MobileCaptureWeeklyReviewSession: Codable, Identifiable, Hashable {
    var id: String { roomId }
    let roomId: String
    let title: String
    let evidenceCount: Int
}

struct MobileCaptureWeeklyReview: Codable, Hashable {
    let schema: String
    let subjectUserId: String
    let subjectLabel: String?
    let relationship: String
    let weekStartsAt: String
    let weekEndsAt: String
    let generatedAt: String
    let reviewState: String
    let plannedMinutes: Int
    let actualMinutes: Int
    let completedBlocksWithoutActualMinutes: Int
    let goals: [MobileCaptureWeeklyReviewGoal]
    let blockers: [String]
    let nextCommitments: [MobileCaptureWeeklyReviewCommitment]
    let sessionContributions: [MobileCaptureWeeklyReviewSession]
    let reflection: String?
}

struct MobileCaptureTodaySourceAnnotation: Codable, Identifiable, Hashable {
    let id: String
    let kind: String
    let body: String
    let exactText: String?
    let status: String
    let visibility: String
    let createdByMe: Bool
    let canChangeStatus: Bool?
    let canStartWriting: Bool?
    let sourceTitle: String
    let projectName: String
    let projectSlug: String
    let writingDraftHref: String?
    let tagLabels: [String]
    let updatedAt: String
}

struct MobileCaptureTodayTranscriptReview: Codable, Identifiable, Hashable {
    let id: String
    let roomId: String
    let sessionTitle: String
    let segmentId: String
    let startSeconds: TimeInterval
    let endSeconds: TimeInterval
    let providerText: String
    let providerSpeakerLabel: String?
    let proposedText: String?
    let proposedSpeakerLabel: String?
    let reason: String?
    let recordingAssetId: String?
    let playbackAvailable: Bool
    let updatedAt: String
}

struct MobileCaptureTodayBoundaries: Codable, Hashable {
    let appOwnedRecords: Bool?
    let transcriptCandidatesExcluded: Bool?
    let externalCalendarMutated: Bool?
    let providerMutated: Bool?
    let recordingMutated: Bool?
    let sourceMutated: Bool?
    let immutableSourceAnchors: Bool?
    let completingFocusBlockMutatesTarget: Bool?
    let focusBlockActualTimeExplicitOnly: Bool?
    let focusBlockPlanningAvailable: Bool?
    let planningFocusBlockMutatesTarget: Bool?
    let planningFocusBlockCreatesAppointment: Bool?
    let planningFocusBlockSchedulesReminder: Bool?
    let aiOutputRequiresHumanReview: Bool?
    let transcriptReviewMutatesWork: Bool?
    let transcriptReviewRequiresReleasedPlayback: Bool?
    let goalCheckInMutatesStatus: Bool?
    let recurrenceAppOwned: Bool?
    let recurrenceNotificationsScheduled: Bool?
    let canonicalReminderIntents: Bool?
    let taskReminderIntentProjectionComplete: Bool?
    let deviceNotificationsReconciled: Bool?
    let reminderDeliveryClaimed: Bool?
    let canonicalProjectTags: Bool?
    let tagMutationExternalSideEffects: Bool?
    let annotationResolveReopenAvailable: Bool?
    let annotationReviewMutatesSource: Bool?
    let annotationWritingDraftAvailable: Bool?
    let writingDraftPrivate: Bool?
    let writingDraftSourceMutated: Bool?
    let writingDraftExternalSideEffects: Bool?
}

struct MobileCaptureTodayTag: Codable, Identifiable, Hashable {
    let id: String
    let projectId: String
    let slug: String
    let label: String
    let isActive: Bool
}

struct MobileCaptureTodayResponse: Codable, Hashable {
    let ok: Bool
    let error: String?
    let briefKind: String?
    let generatedAt: String?
    let tasks: [MobileCaptureTodayTask]?
    let goals: [MobileCaptureTodayGoal]?
    let focusBlocks: [MobileCaptureTodayFocusBlock]?
    let weeklyReview: MobileCaptureWeeklyReview?
    let transcriptReviews: [MobileCaptureTodayTranscriptReview]?
    let sourceAnnotations: [MobileCaptureTodaySourceAnnotation]?
    let weeklyPlan: MobileCaptureTodayWeeklyPlan?
    let taskReminderIntents: [MobileCaptureTodayReminderIntent]?
    let tagCatalog: [MobileCaptureTodayTag]?
    let boundaries: MobileCaptureTodayBoundaries?
}

struct MobileCaptureResolvedWorkTag: Codable, Hashable {
    let id: String
    let requestedLabel: String
    let label: String
    let slug: String
    let created: Bool
}

struct MobileCaptureWorkTagMutationResponse: Codable {
    let ok: Bool
    let code: String?
    let error: String?
    let entityKind: String?
    let entityId: String?
    let projectId: String?
    let tagIds: [String]?
    let requestedTagIds: [String]?
    let newTagLabels: [String]?
    let resolvedTags: [MobileCaptureResolvedWorkTag]?
    let updatedAt: String?
    let tagRevision: Int?
    let receiptId: String?
    let idempotentReplay: Bool?
}

struct MobileCaptureTodayMutationResponse: Codable {
    let ok: Bool
    let error: String?
    let code: String?
    let action: String?
    let id: String?
    let status: String?
    let actualMinutes: Int?
    let updatedAt: String?
    let receiptId: String?
    let planBlockId: String?
    let startsAt: String?
    let endsAt: String?
    let idempotentReplay: Bool?
    let title: String?
    let detail: String?
    let dueAt: String?
    let description: String?
    let targetAt: String?
    let nextOccurrenceTaskId: String?
    let materializedCount: Int?
    let reminder: MobileCaptureTodayReminderIntent?
    let clientRequestId: String?
    let documentId: String?
    let documentStableId: String?
    let blockId: String?
    let blockStableId: String?
    let responseBlockId: String?
    let responseBlockStableId: String?
    let href: String?
    let reused: Bool?
    let boundaries: MobileCaptureTodayBoundaries?
}

struct MobileCaptureWorkProject: Codable, Identifiable, Hashable {
    let id: String
    let slug: String
    let name: String
    let role: String
    let canWrite: Bool
    let isHomeNest: Bool
    let updatedAt: String
}

struct MobileCaptureCreatedProject: Codable, Identifiable, Hashable {
    let id: String
    let slug: String
    let name: String
    let role: String
    let canWrite: Bool
    let isHomeNest: Bool
    let kind: String
}

struct MobileCaptureProjectCreateResponse: Codable {
    let ok: Bool
    let code: String?
    let error: String?
    let schema: String?
    let idempotentReplay: Bool?
    let receiptId: String?
    let project: MobileCaptureCreatedProject?
}

struct MobileCaptureWorkNote: Codable, Identifiable, Hashable {
    let id: String
    let stableId: String
    let title: String
    let excerpt: String
    let tagRevision: Int?
    let updatedAt: String
    let canEditTags: Bool?
    let canEditContent: Bool?
    let contentRevision: String?
    let contentEditBoundary: String?
    let blocks: [MobileCaptureWorkNoteBlock]?
    let tagIds: [String]
    let tagLabels: [String]
    let webPath: String
}

struct MobileCaptureWorkNoteBlock: Codable, Identifiable, Hashable {
    let id: String
    let stableId: String
    let order: Int
    let body: String
}

private struct MobileCaptureWorkNoteEditRequest: Encodable {
    struct Block: Encodable {
        let id: String
        let stableId: String
        let body: String
    }

    let clientRequestId: String
    let expectedContentRevision: String
    let title: String
    let blocks: [Block]

    init(edit: PendingDocumentNoteEdit) {
        clientRequestId = edit.clientRequestID
        expectedContentRevision = edit.expectedContentRevision
        title = edit.title
        blocks = edit.blocks.map {
            Block(id: $0.id, stableId: $0.stableId, body: $0.body)
        }
    }
}

struct MobileCaptureWorkNoteEditResponse: Decodable {
    struct Note: Decodable {
        let id: String
        let stableId: String
        let projectId: String
        let projectSlug: String
        let title: String
        let blocks: [MobileCaptureWorkNoteBlock]
        let contentRevision: String
        let updatedAt: String
        let canEditContent: Bool
        let contentEditBoundary: String
    }

    let ok: Bool
    let code: String?
    let error: String?
    let schema: String?
    let note: Note?
    let current: Note?
    let receiptId: String?
    let idempotentReplay: Bool?
    let changedBlockIds: [String]?
}

enum MobileCaptureWorkNoteEditSyncResult {
    case acknowledged(idempotentReplay: Bool, message: String)
    case retryable(message: String)
    case held(code: String?, message: String)
}

struct MobileCaptureWorkTag: Codable, Identifiable, Hashable {
    let id: String
    let projectId: String
    let slug: String
    let label: String
    let isActive: Bool
    let usageCount: Int
    let archivedAt: String?
    let updatedAt: String?
    let mergedInto: MobileCaptureWorkTagRedirect?
    let aliases: [MobileCaptureWorkTagAlias]?
}

struct MobileCaptureWorkTagAlias: Codable, Identifiable, Hashable {
    let id: String
    let label: String
    let slug: String
}

struct MobileCaptureWorkTagRedirect: Codable, Identifiable, Hashable {
    let id: String
    let label: String
    let slug: String
}

struct MobileCaptureWorkTagTaxonomyResponse: Codable {
    struct Tag: Codable {
        let id: String
        let label: String
        let slug: String
        let isActive: Bool
        let archivedAt: String?
        let updatedAt: String
        let aliases: [MobileCaptureWorkTagAlias]
    }

    let ok: Bool
    let code: String?
    let error: String?
    let operation: String?
    let projectId: String?
    let tag: Tag?
    let aliases: [MobileCaptureWorkTagAlias]?
    let revision: Int?
    let receiptId: String?
}

struct MobileCaptureWorkTagCreateResponse: Codable {
    struct Tag: Codable {
        let id: String
        let label: String
        let slug: String
        let isActive: Bool
        let archivedAt: String?
        let updatedAt: String
        let aliases: [MobileCaptureWorkTagAlias]
    }

    let ok: Bool
    let code: String?
    let error: String?
    let projectId: String?
    let tag: Tag?
    let aliases: [MobileCaptureWorkTagAlias]?
    let created: Bool?
    let revision: Int?
    let receiptId: String?
}

struct MobileCaptureWorkWorkspace: Codable, Hashable {
    let project: MobileCaptureWorkProject
    let tasks: [MobileCaptureTodayTask]
    let goals: [MobileCaptureTodayGoal]
    let notes: [MobileCaptureWorkNote]
    let tags: [MobileCaptureWorkTag]
}

struct MobileCaptureWorkBoundaries: Codable, Hashable {
    let actorScoped: Bool?
    let ownedGoalsOnly: Bool?
    let explicitProjectGrantRequired: Bool?
    let protectedOfflineSnapshotSupported: Bool?
    let canonicalProjectRecords: Bool?
    let canonicalProjectTags: Bool?
    let onlineVocabularyManagement: Bool?
    let unreviewedTranscriptCandidatesExcluded: Bool?
    let mutationsUseExistingProtectedOutboxes: Bool?
    let sourceMutated: Bool?
    let externalSideEffects: Bool?
}

struct MobileCaptureWorkResponse: Codable, Hashable {
    let ok: Bool
    let code: String?
    let error: String?
    let workspaceKind: String?
    let generatedAt: String?
    let projects: [MobileCaptureWorkProject]?
    let selectedProjectId: String?
    let workspace: MobileCaptureWorkWorkspace?
    let boundaries: MobileCaptureWorkBoundaries?
}

enum MobileCalendarFeedPurpose: String, Codable, CaseIterable, Hashable, Identifiable {
    case personalCommitments = "PERSONAL_COMMITMENTS"
    case coaching = "COACHING"
    case podcastProduction = "PODCAST_PRODUCTION"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .personalCommitments: "My commitments"
        case .coaching: "My coaching sessions"
        case .podcastProduction: "Podcast production"
        }
    }

    var detail: String {
        switch self {
        case .personalCommitments:
            "Focus blocks plus transparent task due dates and goal targets."
        case .coaching:
            "Appointments you coach or attend, without notes or transcript text."
        case .podcastProduction:
            "Scheduled podcast rooms from one Nest, without manuscripts, chat, or media."
        }
    }
}

struct MobileCalendarFeedStatus: Codable, Identifiable, Hashable {
    let id: String
    let purpose: MobileCalendarFeedPurpose
    let displayName: String
    let projectId: String?
    let status: String
    let createdAt: String
    let revokedAt: String?
    let lastGeneratedAt: String?
    let subscriptionUrlRecoverable: Bool
}

struct MobileCalendarFeedListResponse: Decodable {
    let ok: Bool
    let error: String?
    let feeds: [MobileCalendarFeedStatus]?
}

struct MobileCalendarFeedCreated: Decodable, Hashable {
    let id: String
    let purpose: MobileCalendarFeedPurpose
    let displayName: String
    let subscriptionUrl: String
    let webcalUrl: String
    let shownOnce: Bool
    let priorFeedRevoked: Bool
}

struct MobileCalendarFeedMutationResponse: Decodable {
    let ok: Bool
    let error: String?
    let feed: MobileCalendarFeedCreated?
    let revoked: Int?
}

struct MobileGoogleCalendarConnectionSnapshot: Decodable, Hashable {
    let id: String
    let status: String
    let accountLabel: String
    let verifiedAt: String?
    let lastCheckedAt: String?
}

struct MobileGoogleCalendarLiveUpdateSnapshot: Decodable, Hashable {
    let status: String
    let expiresAt: String?
    let lastNotificationAt: String?
}

struct MobileGoogleCalendarCursorSnapshot: Decodable, Hashable {
    let lastFullSyncAt: String?
    let lastIncrementalSyncAt: String?
}

struct MobileGoogleCalendarSelectionSnapshot: Decodable, Identifiable, Hashable {
    let id: String
    let purpose: MobileCalendarFeedPurpose
    let displayName: String
    let nestId: String?
    let timezone: String?
    let liveUpdatesEnabled: Bool
    let liveUpdates: MobileGoogleCalendarLiveUpdateSnapshot?
    let cursor: MobileGoogleCalendarCursorSnapshot?
}

struct MobileGoogleCalendarSummaryResponse: Decodable {
    let ok: Bool
    let error: String?
    let connection: MobileGoogleCalendarConnectionSnapshot?
    let selections: [MobileGoogleCalendarSelectionSnapshot]?
    let providerChecked: Bool?
}

struct MobileCaptureSessionCreateResponse: Codable {
    let ok: Bool
    let error: String?
    let created: Bool?
    let session: MobileCaptureSession?
}

struct MobileCaptureConsentUpdate: Codable {
    let id: String?
    let callRoomId: String?
    let status: String?
    let participantId: String?
    let recordingConsentId: String?
    let recordingConsentStatus: String?
    let recordingConsentGranted: Bool?
    let recordingConsentCanRecordAudio: Bool?
    let recordingConsentCanRecordVideo: Bool?
    let recordingConsentCanTranscribe: Bool?
    let recordingConsentVideoGranted: Bool?
    let consentRequiredParticipantCount: Int?
    let consentGrantedParticipantCount: Int?
    let allRegisteredParticipantConsentGranted: Bool?
    let videoConsentGrantedParticipantCount: Int?
    let allRegisteredParticipantVideoConsentGranted: Bool?
    let nextAction: String?
}

struct MobileCaptureConsentResponse: Codable {
    let ok: Bool
    let error: String?
    let session: MobileCaptureConsentUpdate?
}

struct MobileCaptureRoomStateResponse: Codable {
    let ok: Bool
    let error: String?
    let session: MobileCaptureConsentUpdate?
    let receiptPersisted: Bool?
    let stateApplied: Bool?
    let idempotentReplay: Bool?
    let errorCode: String?

    var roomStateTruthLine: String {
        let status = session?.status?.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() ?? ""
        if status == "RECORDING" {
            return "Nest marked the Quipsly CallRoom as recording. Keep the native recording indicator visible and preserve local source media."
        }
        if status == "ENDED" {
            return "Nest marked the Quipsly CallRoom ended. Upload, transcript, packet, and review work can continue without changing the source recording."
        }
        if status == "OPEN" {
            return "Nest marked the Quipsly CallRoom open. Joining and recording are still separate consent-gated actions."
        }
        return "Nest updated app-owned CallRoom state without mutating provider media, transcripts, packets, or external systems."
    }

    var roomStateNextActionLine: String {
        let action = session?.nextAction?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !action.isEmpty {
            return action
        }
        if session?.recordingConsentGranted == true {
            return "Consent is present. Continue with visible local recording or provider-room work as appropriate."
        }
        return "Confirm explicit recording consent before starting local or provider recording."
    }
}

enum CaptureRoomReceiptDeliveryResult {
    case acknowledged
    case terminallyRejected(message: String, errorCode: String?)
    case retryable(message: String)
}

struct MobileCaptureTranscriptRunResponse: Codable {
    let ok: Bool
    let error: String?
    let transcriptJobId: String?
    let status: String?
    let segmentCount: Int?
    let alreadyCompleted: Bool?
    let ensuredFromRecording: Bool?

    var transcriptTruthLine: String {
        if ensuredFromRecording == true {
            return "Quipsly created or repaired the transcript job from uploaded recording evidence."
        }
        if alreadyCompleted == true {
            return "The transcript was already complete; Quipsly reused existing transcript evidence."
        }
        return "Quipsly ran the linked transcript job from verified recording evidence."
    }

    var transcriptNextActionLine: String {
        let normalizedStatus = status?.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() ?? ""
        if normalizedStatus == "COMPLETED" {
            let count = segmentCount ?? 0
            return count > 0
                ? "Transcript is complete with \(count) segment\(count == 1 ? "" : "s"). Build a review packet next."
                : "Transcript is complete. Build a review packet next."
        }
        if ensuredFromRecording == true {
            return "Transcript job is linked to the uploaded recording. Refresh session evidence, then build a packet after completion."
        }
        return "Refresh session evidence and review transcript status before building a packet."
    }
}

struct MobileCaptureTranscriptPacketBoundaries: Codable, Hashable {
    let sideEffectFreeRead: Bool?
    let buildCreatesReviewArtifactsOnly: Bool?
    let noRecordingStarted: Bool?
    let noTranscriptProviderRunFromPacketRead: Bool?
    let noExternalDelivery: Bool?
    let noPublicationClaim: Bool?
    let recordingSourceTruth: String?
    let reviewRule: String?

    var safetyLine: String {
        let sourceTruth = recordingSourceTruth?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !sourceTruth.isEmpty {
            return sourceTruth
        }
        if sideEffectFreeRead == true
            && buildCreatesReviewArtifactsOnly == true
            && noRecordingStarted == true
            && noTranscriptProviderRunFromPacketRead == true
            && noExternalDelivery == true
            && noPublicationClaim == true {
            return "Packet build is review-only: recordings stay source truth, transcripts stay derived evidence, and nothing is delivered or published."
        }
        return "Packet boundary needs review before treating this as safe reviewer evidence."
    }

    var reviewLine: String {
        let rule = reviewRule?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !rule.isEmpty {
            return rule
        }
        return "Packet output waits for human review before client delivery, publication, or canonical use."
    }
}

struct MobileCapturePacketLaneHumanReview: Codable, Hashable {
    let status: String?
    let note: String?
    let reviewedAt: String?
    let reviewedByUserId: String?
    let externalSideEffects: Bool?
    let deliveryClaimed: Bool?
    let publicationClaimed: Bool?
}

struct MobileCapturePacketReviewLane: Codable, Hashable, Identifiable {
    let id: String
    let label: String?
    let status: String?
    let itemCount: Int?
    let meaning: String?
    let sourceTruth: String?
    let reviewRule: String?
    let humanApprovalRequired: Bool?
    let externalSideEffects: Bool?
    let humanReview: MobileCapturePacketLaneHumanReview?

    var titleLabel: String {
        let trimmed = label?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? id : trimmed
    }

    var displayStatus: String {
        let count = itemCount ?? 0
        let normalized = status?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? "review"
        if count > 0 {
            return "\(count) item\(count == 1 ? "" : "s") · \(normalized.replacingOccurrences(of: "_", with: " "))"
        }
        return normalized.replacingOccurrences(of: "_", with: " ")
    }

    var boundaryLine: String {
        if let review = humanReview {
            let status = review.status?.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "_", with: " ").lowercased() ?? "reviewed"
            if review.externalSideEffects == false && review.deliveryClaimed == false && review.publicationClaimed == false {
                return "Human marked this lane \(status) inside Quipsly only. No client delivery, publication, or external action was claimed."
            }
        }
        let source = sourceTruth?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !source.isEmpty { return source }
        if humanApprovalRequired == true && externalSideEffects == false {
            return "Derived transcript lane; human approval required before delivery, publication, or task assignment."
        }
        return "Review this lane before acting on it."
    }
}

struct MobileCapturePacketBuildResponse: Codable {
    let ok: Bool
    let error: String?
    let packetKind: String?
    let generatedAt: String?
    let boundaries: MobileCaptureTranscriptPacketBoundaries?
    let nextAction: String?
    let transcriptJobId: String?
    let roomId: String?
    let summaryNoteId: String?
    let highlightCount: Int?
    let actionItemCount: Int?
    let reviewLanes: [MobileCapturePacketReviewLane]?
    let reviewLaneCount: Int?
    let reviewLaneReadyCount: Int?
    let reviewLaneId: String?
    let reviewLaneStatus: String?
    let reviewLane: MobileCapturePacketReviewLane?
    let reusedExistingPacket: Bool?

    var packetTruthLine: String {
        boundaries?.safetyLine ?? "Packet build returned without explicit source-truth boundaries. Review before relying on it."
    }

    var packetReviewLine: String {
        boundaries?.reviewLine ?? "Packet output waits for human review before delivery or publication."
    }

    var packetNextActionLine: String {
        let action = nextAction?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !action.isEmpty {
            return action
        }
        return reusedExistingPacket == true ? "Open the existing packet for review." : "Open the new packet for review."
    }

    var reviewLaneSummaryLine: String {
        let total = reviewLaneCount ?? reviewLanes?.count ?? 0
        let ready = reviewLaneReadyCount ?? reviewLanes?.filter { $0.status == "READY_FOR_HUMAN_REVIEW" }.count ?? 0
        if let laneStatus = reviewLaneStatus?.trimmingCharacters(in: .whitespacesAndNewlines), !laneStatus.isEmpty {
            let label = reviewLane?.titleLabel ?? reviewLaneId ?? "packet lane"
            return "\(label) marked \(laneStatus.replacingOccurrences(of: "_", with: " ").lowercased()) inside Quipsly."
        }
        if total > 0 {
            return "\(ready) of \(total) review lanes have candidate material for human approval."
        }
        return "No review lanes were returned. Open packet details before relying on this output."
    }
}

struct MobileCaptureRoutes: Codable, Hashable {
    let readiness: String?
    let sessions: String?
    let consent: String?
    let roomJoin: String?
    let roomJoinDiagnostics: String?
    let roomState: String?
    let clockSample: String?
    let providerRecording: String?
    let promoteRecording: String?
    let transcriptRun: String?
    let transcriptPacket: String?
    let uploadsChunk: String?
    let reviewDigest: String?
}

struct MobileCaptureMediaVaultRoutes: Codable, Hashable {
    let readiness: String?
    let inventory: String?
    let episodeInventory: String?
    let uploadPresigned: String?
    let registerProxy: String?
    let promoteRecording: String?
}

struct MobileCaptureMediaVaultReadiness: Codable, Hashable {
    let configured: Bool?
    let configuredEnvName: String?
    let bucketNameVisibleForOps: String?
    let bucketValueIsSecret: Bool?
    let primaryPolicyBucket: String?
    let policyBucketMatchesConfigured: Bool?
    let configuredBucketWarning: String?
    let root: String?
    let prefixes: [String: String]?
    let directUploadDirectories: [String]?
    let sourceOfTruth: String?
    let proxyPolicy: String?
    let recordingPolicy: String?
    let bucketConsolidationPolicy: String?
    let editorAttachmentPolicy: String?
}

struct MobileCapturePromotedMediaAsset: Codable, Hashable {
    let id: String?
    let filename: String?
    let url: String?
    let mimeType: String?
    let isProxy: Bool?
    let cloudProvider: String?
}

struct MobileCaptureRecordingPromotionResponse: Codable {
    struct SourceResult: Codable, Hashable {
        let recordingAssetId: String
        let ok: Bool
        let status: String?
        let message: String?
        let mediaAssetId: String?
    }

    let ok: Bool
    let error: String?
    let status: String?
    let message: String?
    let recordingAssetId: String?
    let mediaAsset: MobileCapturePromotedMediaAsset?
    let sourceId: String?
    let playbackUrl: String?
    let targetNestSlug: String?
    let targetResolvedFrom: String?
    let episodeSlug: String?
    let mediaKind: String?
    let importRole: String?
    let captureGroupId: String?
    let expectedSourceCount: Int?
    let promotedSourceCount: Int?
    let alreadyPromotedSourceCount: Int?
    let failedSourceCount: Int?
    let results: [SourceResult]?

    var statusLine: String {
        if let message, !message.isEmpty { return message }
        if let status, !status.isEmpty { return status.replacingOccurrences(of: "-", with: " ") }
        return ok ? "Recording promoted into Quipsly media." : "Recording promotion needs attention."
    }
}

struct MobileCaptureReadinessResponse: Codable {
    let ok: Bool
    let signedIn: Bool?
    let user: MobileCaptureReadinessUser?
    let captureRoutes: MobileCaptureRoutes?
    let mediaVaultRoutes: MobileCaptureMediaVaultRoutes?
    let policyUrls: MobileCapturePolicyURLs?
    let nativeCapture: NativeCaptureContract?
    let recordingPolicy: MobileCaptureRecordingPolicy?
    let providerReadiness: MobileCaptureProviderReadiness?
    let mediaVaultReadiness: MobileCaptureMediaVaultReadiness?
    let calendarReadiness: MobileCaptureCalendarReadiness?
    let uploadAndTranscriptReadiness: MobileCaptureUploadTranscriptReadiness?
    let paymentBoundary: MobileCapturePaymentBoundary?
    let appStoreReadiness: MobileCaptureAppStoreReadiness?

    var signedInLabel: String {
        signedIn == true ? "Signed in" : "Sign in needed"
    }

    var providerLabel: String {
        guard let providerReadiness else { return "Provider unknown" }
        if appStoreReadiness?.nativeProviderRoomUiReady != true {
            if providerReadiness.liveKitJoinConfigured == true {
                return "LiveKit server ready, app held"
            }
            return "Local fallback first"
        }
        if providerReadiness.liveKitJoinConfigured == true && providerReadiness.liveKitEgressConfigured == true {
            return "LiveKit join + egress ready"
        }
        if providerReadiness.liveKitJoinConfigured == true {
            return "LiveKit join ready"
        }
        return "Local fallback first"
    }

    var providerEgressLabel: String {
        guard let providerReadiness else { return "Server recording unknown" }
        if providerReadiness.liveKitEgressStartEnabled == true {
            return "Server recording enabled"
        }
        if providerReadiness.liveKitEgressConfigured == true {
            return "Server recording held"
        }
        if providerReadiness.liveKitJoinConfigured == true {
            return "Join ready, recording held"
        }
        return "Local recording first"
    }

    var providerEgressDetail: String {
        guard let providerReadiness else {
            return "Nest has not returned provider recording readiness yet."
        }

        let prefix = providerReadiness.storagePrefix?.trimmingCharacters(in: .whitespacesAndNewlines)
        let bucketEnv = providerReadiness.configuredBucketEnvName?.trimmingCharacters(in: .whitespacesAndNewlines)
        let missing = providerReadiness.missing?.filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty } ?? []

        if providerReadiness.liveKitEgressStartEnabled == true {
            return [
                bucketEnv?.isEmpty == false ? "bucket env \(bucketEnv!)" : nil,
                prefix?.isEmpty == false ? prefix : nil,
                "explicit operator gate open",
            ].compactMap { $0 }.joined(separator: " · ")
        }

        if providerReadiness.liveKitEgressConfigured == true && providerReadiness.operatorEgressEnabled != true {
            return "Configured, but held until LIVEKIT_EGRESS_ENABLED=true. Joining is not recording."
        }

        if !missing.isEmpty {
            return "Missing: \(missing.prefix(3).joined(separator: ", "))"
        }

        return providerReadiness.nextAction ?? "Provider recording is separate from joining the room."
    }

    var providerEgressReady: Bool {
        providerReadiness?.liveKitEgressStartEnabled == true
    }

    var uploadTranscriptLabel: String {
        let uploadReady = uploadAndTranscriptReadiness?.cloudStorageConfigured == true
        let transcriptReady = uploadAndTranscriptReadiness?.transcriptConfigured == true
        if uploadReady && transcriptReady { return "Upload + transcript ready" }
        if uploadReady { return "Upload ready, transcript held" }
        if transcriptReady { return "Transcript ready, upload held" }
        return "Upload/transcript setup needed"
    }

    var mediaVaultLabel: String {
        if let mediaVaultReadiness {
            if mediaVaultReadiness.configured == true && mediaVaultReadiness.policyBucketMatchesConfigured == true {
                return "Media vault aligned"
            }
            if mediaVaultReadiness.configured == true {
                return "Media vault warning"
            }
            return "Media vault not configured"
        }

        if mediaVaultRoutes?.inventory?.isEmpty == false
            && mediaVaultRoutes?.registerProxy?.isEmpty == false
            && mediaVaultRoutes?.promoteRecording?.isEmpty == false {
            return "Media vault ready"
        }
        if mediaVaultRoutes?.promoteRecording?.isEmpty == false {
            return "Recording handoff ready"
        }
        return "Media vault setup needed"
    }

    var mediaVaultDetail: String {
        if let mediaVaultReadiness {
            if let warning = mediaVaultReadiness.configuredBucketWarning, !warning.isEmpty {
                return warning
            }

            let bucket = mediaVaultReadiness.bucketNameVisibleForOps?.trimmingCharacters(in: .whitespacesAndNewlines)
            let policy = mediaVaultReadiness.primaryPolicyBucket?.trimmingCharacters(in: .whitespacesAndNewlines)
            let proxyPrefix = mediaVaultReadiness.prefixes?["proxy"]?.trimmingCharacters(in: .whitespacesAndNewlines)
            let recordingPrefix = mediaVaultReadiness.prefixes?["mobileRecording"]?.trimmingCharacters(in: .whitespacesAndNewlines)

            let pieces = [
                bucket?.isEmpty == false ? "bucket \(bucket!)" : nil,
                policy?.isEmpty == false ? "policy \(policy!)" : nil,
                proxyPrefix?.isEmpty == false ? "proxy \(proxyPrefix!)" : nil,
                recordingPrefix?.isEmpty == false ? "mobile \(recordingPrefix!)" : nil,
            ].compactMap { $0 }

            if !pieces.isEmpty {
                return pieces.joined(separator: " · ")
            }

            return mediaVaultReadiness.sourceOfTruth ?? "Media vault readiness was returned without route details."
        }

        let pieces = [
            mediaVaultRoutes?.readiness?.isEmpty == false ? "readiness" : nil,
            mediaVaultRoutes?.inventory?.isEmpty == false ? "inventory" : nil,
            mediaVaultRoutes?.episodeInventory?.isEmpty == false ? "episode inventory" : nil,
            mediaVaultRoutes?.uploadPresigned?.isEmpty == false ? "upload" : nil,
            mediaVaultRoutes?.registerProxy?.isEmpty == false ? "proxy register" : nil,
            mediaVaultRoutes?.promoteRecording?.isEmpty == false ? "recording promote" : nil,
        ].compactMap { $0 }
        return pieces.isEmpty
            ? "Nest needs media-vault routes before Capture can hand recordings to Studio."
            : "Routes: \(pieces.joined(separator: ", "))."
    }

    var mediaVaultReady: Bool {
        if let mediaVaultReadiness {
            return mediaVaultReadiness.configured == true
                && mediaVaultReadiness.policyBucketMatchesConfigured == true
                && mediaVaultRoutes?.readiness?.isEmpty == false
                && mediaVaultRoutes?.inventory?.isEmpty == false
                && mediaVaultRoutes?.uploadPresigned?.isEmpty == false
                && mediaVaultRoutes?.registerProxy?.isEmpty == false
                && mediaVaultRoutes?.promoteRecording?.isEmpty == false
        }

        return mediaVaultRoutes?.inventory?.isEmpty == false
            && mediaVaultRoutes?.uploadPresigned?.isEmpty == false
            && mediaVaultRoutes?.registerProxy?.isEmpty == false
            && mediaVaultRoutes?.promoteRecording?.isEmpty == false
    }

    var calendarLabel: String {
        guard let calendarReadiness else { return "Calendar unknown" }
        if calendarReadiness.accessOk == true { return "Calendar access verified" }
        if calendarReadiness.metadataTokenCandidate == true { return "Calendar verify needed" }
        if calendarReadiness.configured == true { return "Calendar evidence candidate" }
        if calendarReadiness.calendarIdConfigured == true { return "Calendar credentials held" }
        return "Calendar setup needed"
    }

    var calendarDetail: String {
        guard let calendarReadiness else {
            return "Nest should expose calendar readiness before scheduling proof."
        }
        let timezone = calendarReadiness.defaultTimezone?.trimmingCharacters(in: .whitespacesAndNewlines)
        let credentialPath = calendarReadiness.credentialPath?.trimmingCharacters(in: .whitespacesAndNewlines)
        let configurationStatus = calendarReadiness.configurationStatus?.trimmingCharacters(in: .whitespacesAndNewlines)
        let updates = calendarReadiness.sendUpdates?.trimmingCharacters(in: .whitespacesAndNewlines)
        let verify = calendarReadiness.verificationRecommended == true ? "verify before sync" : nil
        return [
            timezone?.isEmpty == false ? "default \(timezone!)" : nil,
            configurationStatus?.isEmpty == false ? configurationStatus : nil,
            credentialPath?.isEmpty == false ? credentialPath : nil,
            updates?.isEmpty == false ? "updates \(updates!)" : nil,
            verify,
        ]
        .compactMap { $0 }
        .joined(separator: " · ")
    }

    var appStoreRiskLine: String {
        if appStoreReadiness?.nativeProviderRoomUiReady == true && appStoreReadiness?.deviceValidationRequired == false {
            return "Submission posture is close. Keep reviewer notes honest."
        }
        return "Not submission-ready yet. Device validation and provider room UI still matter."
    }

    var nativeCaptureContract: NativeCaptureContract {
        nativeCapture ?? .production
    }
}

struct MobileCaptureReadinessUser: Codable {
    let id: String?
    let email: String?
    let name: String?
    let isStaff: Bool?
}

struct MobileCapturePolicyURLs: Codable {
    let privacy: String?
    let accountDeletion: String?
}

struct MobileCaptureRecordingPolicy: Codable {
    let requiresExplicitConsent: Bool?
    let defaultConsentMode: String?
    let visibleRecordingIndicatorRequired: Bool?
    let consentStates: [String]?
    let localFallback: String?
}

struct MobileCaptureProviderReadiness: Codable {
    let preferredProvider: String?
    let liveKitJoinConfigured: Bool?
    let liveKitEgressConfigured: Bool?
    let liveKitEgressStartEnabled: Bool?
    let operatorEgressEnabled: Bool?
    let liveKitControlConfigured: Bool?
    let mediaVaultBucketConfigured: Bool?
    let storageCredentialConfigured: Bool?
    let configuredBucketEnvName: String?
    let storagePrefix: String?
    let missing: [String]?
    let sourceOfTruth: String?
    let providerSecretsExposed: Bool?
    let nextAction: String?
}

struct MobileCaptureCalendarReadiness: Codable {
    let provider: String?
    let configured: Bool?
    let calendarIdConfigured: Bool?
    let calendarIdVisibleForOps: String?
    let credentialConfigured: Bool?
    let metadataTokenCandidate: Bool?
    let configurationStatus: String?
    let verificationRecommended: Bool?
    let credentialPath: String?
    let defaultTimezone: String?
    let sendUpdates: String?
    let attendeesIncluded: Bool?
    let accessOk: Bool?
    let accessStatus: String?
    let message: String?
    let sourceOfTruth: String?
    let nextAction: String?
}

struct MobileCaptureUploadTranscriptReadiness: Codable {
    let cloudStorageConfigured: Bool?
    let longSourceVerifierEnabled: Bool?
    let synchronousVerificationLimitBytes: Int64?
    let maximumVideoSourceBytes: Int64?
    let longSourceVerificationBoundary: String?
    let transcriptConfigured: Bool?
    let transcriptBoundary: String?
}

struct MobileCapturePaymentBoundary: Codable {
    let stripeConfigured: Bool?
    let stripeLiveAllowed: Bool?
    let stripeScope: String?
}

struct MobileCaptureAppStoreReadiness: Codable {
    let accountDeletionInitiation: String?
    let privacyPolicyRoute: String?
    let microphonePurposeStringRequired: Bool?
    let hiddenRecordingAllowed: Bool?
    let testAccountNeeded: Bool?
    let nativeProviderRoomUiReady: Bool?
    let deviceValidationRequired: Bool?
}

struct MobileCaptureReviewDigestResponse: Codable {
    let ok: Bool
    let error: String?
    let packetKind: String?
    let generatedAt: String?
    let user: MobileCaptureReadinessUser?
    let boundaries: MobileCaptureReviewDigestBoundaries?
    let links: MobileCaptureReviewDigestLinks?
    let digest: MobileCaptureReviewDigest?

    var packetLabel: String {
        packetKind ?? "mobile capture review digest"
    }

    var generatedLabel: String {
        generatedAt ?? "not generated"
    }
}

struct MobileCaptureReviewDigestBoundaries: Codable {
    let sideEffectFree: Bool?
    let noRecordingStarted: Bool?
    let noExternalMeetingJoined: Bool?
    let noPaymentMutation: Bool?
    let sourceOfTruth: String?

    var safetyLine: String {
        if sideEffectFree == true
            && noRecordingStarted == true
            && noExternalMeetingJoined == true
            && noPaymentMutation == true {
            return "Review only: no recording, meeting, payment, or publish side effects."
        }
        return "Needs review: the digest boundary is missing one or more safety flags."
    }
}

struct MobileCaptureReviewDigestLinks: Codable {
    let readiness: String?
    let sessions: String?
    let consent: String?
    let roomJoin: String?
    let providerRecording: String?
    let transcriptRun: String?
    let transcriptPacket: String?
}

struct MobileCaptureReviewDigest: Codable {
    let sessionCount: Int?
    let readyToCapture: Int?
    let needsConsent: Int?
    let paymentHold: Int?
    let providerJoinReady: Int?
    let localFallbackReady: Int?
    let recordingEvidence: Int?
    let capturePlumbingEvidence: Int?
    let substantialRecordingEvidence: Int?
    let transcriptNeeded: Int?
    let packetReady: Int?
    let reviewReady: Int?
    let blockers: [MobileCaptureReviewDigestBlocker]?
    let nextActions: [MobileCaptureReviewDigestNextAction]?
    let sessions: [MobileCaptureReviewDigestSession]?
    let actionPackets: [MobileCaptureActionPacket]?

    var hasVisibleWork: Bool {
        (sessionCount ?? 0) > 0
    }
}

struct MobileCaptureReviewDigestBlocker: Codable, Identifiable {
    let id: String
    let count: Int?

    var displayLine: String {
        let countText = count.map { " x\($0)" } ?? ""
        return "\(id)\(countText)"
    }
}

struct MobileCaptureReviewDigestNextAction: Codable, Identifiable {
    let callRoomId: String?
    let title: String?
    let stage: String?
    let nextAction: String?

    var id: String {
        "\(callRoomId ?? title ?? "action")-\(stage ?? "stage")-\(nextAction ?? "next")"
    }

    var titleLabel: String {
        title?.isEmpty == false ? title! : callRoomId ?? "Capture session"
    }
}

struct MobileCaptureReviewDigestSession: Codable, Identifiable {
    let id: String
    let callRoomId: String?
    let title: String?
    let stage: String?
    let status: String?
    let purpose: String?
    let scheduledStart: String?
    let provider: String?
    let providerReadiness: String?
    let providerCanJoin: Bool?
    let localFallbackReady: Bool?
    let canRecordNow: Bool?
    let recordingConsentStatus: String?
    let recordingConsentGranted: Bool?
    let paymentPolicy: String?
    let paymentStatus: String?
    let bookingStatus: String?
    let recordingCount: Int?
    let latestRecordingAssetStatus: String?
    let latestTranscriptStatus: String?
    let latestTranscriptSegmentCount: Int?
    let coachingPacketStatus: String?
    let coachingPacketHighlightCount: Int?
    let coachingPacketActionItemCount: Int?
    let providerRecordingReceiptSlotId: String?
    let blockers: [String]?
    let attentionChecks: [MobileCaptureReviewDigestAttentionCheck]?
    let actionPacket: MobileCaptureActionPacket?
    let nextAction: String?

    var titleLabel: String {
        title?.isEmpty == false ? title! : callRoomId ?? "Capture session"
    }

    var stageLabel: String {
        stage?.isEmpty == false ? stage! : status ?? "unknown"
    }

    var isReviewReady: Bool {
        coachingPacketStatus == "READY_FOR_REVIEW"
    }
}

struct MobileCaptureReviewDigestAttentionCheck: Codable, Identifiable {
    let id: String
    let label: String?
    let status: String?
    let meaning: String?
}

@MainActor
final class CaptureReadinessClient: ObservableObject {
    @Published var readiness: MobileCaptureReadinessResponse?
    @Published var status: String = "Checking capture readiness..."
    @Published var errorMessage: String?
    @Published var isLoading = false

    private let baseURL = normalizedNestBaseURL(Bundle.main.object(forInfoDictionaryKey: "QUIPSLY_API_BASE_URL") as? String ?? "https://nest.quipsly.com")

    func load() async {
        guard !isLoading else { return }
        isLoading = true
        errorMessage = nil
        status = "Checking Nest capture readiness..."

        guard let url = URL(string: "\(baseURL.trimmingCharacters(in: .whitespacesAndNewlines))/api/mobile/capture/readiness") else {
            errorMessage = "Invalid Nest URL."
            status = "Readiness check failed"
            isLoading = false
            return
        }

        do {
            var request = URLRequest(url: url)
            request.httpMethod = "GET"
            request.setValue("application/json", forHTTPHeaderField: "Accept")

            let (data, http) = try await AuthManager.shared.authenticatedData(for: request)
            guard http.statusCode < 400 else {
                if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                   let error = json["error"] as? String {
                    throw NSError(domain: "CaptureReadiness", code: http.statusCode, userInfo: [NSLocalizedDescriptionKey: error])
                }
                throw NSError(domain: "CaptureReadiness", code: http.statusCode, userInfo: [NSLocalizedDescriptionKey: "Nest returned HTTP \(http.statusCode)."])
            }

            let decoded = try JSONDecoder().decode(MobileCaptureReadinessResponse.self, from: data)
            readiness = decoded
            status = decoded.providerLabel
        } catch {
            errorMessage = error.localizedDescription
            status = "Readiness check failed"
        }

        isLoading = false
    }
}

@MainActor
final class CaptureReviewDigestClient: ObservableObject {
    @Published var response: MobileCaptureReviewDigestResponse?
    @Published var status: String = "Review digest not loaded"
    @Published var errorMessage: String?
    @Published var isLoading = false

    private let baseURL = normalizedNestBaseURL(Bundle.main.object(forInfoDictionaryKey: "QUIPSLY_API_BASE_URL") as? String ?? "https://nest.quipsly.com")

    func load() async {
        guard !isLoading else { return }
        guard AuthManager.currentStoredOwnerID() != nil else {
            status = "Needs sign in"
            errorMessage = "Sign in before loading the Quipsly review digest."
            return
        }

        guard let url = URL(string: "\(baseURL.trimmingCharacters(in: .whitespacesAndNewlines))/api/mobile/capture/review-digest") else {
            status = "Bad Nest URL"
            errorMessage = "The configured Nest URL is not valid."
            return
        }

        isLoading = true
        status = "Loading review digest"
        errorMessage = nil

        do {
            var request = URLRequest(url: url)
            request.httpMethod = "GET"
            request.setValue("application/json", forHTTPHeaderField: "Accept")

            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            let payload = try JSONDecoder().decode(MobileCaptureReviewDigestResponse.self, from: data)

            guard response.statusCode < 400, payload.ok else {
                throw NSError(
                    domain: "CaptureReviewDigest",
                    code: 1,
                    userInfo: [NSLocalizedDescriptionKey: payload.error ?? "Capture review digest could not load."]
                )
            }

            self.response = payload
            let count = payload.digest?.sessionCount ?? 0
            status = count == 0 ? "No visible sessions" : "\(count) session\(count == 1 ? "" : "s") summarized"
        } catch {
            status = "Needs attention"
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }
}

struct MobileCaptureRoomJoinResponse: Codable {
    struct TokenBoundary: Codable {
        let shortLived: Bool?
        let tokenRoomScoped: Bool?
        let expiresAt: String?
        let expiresInSeconds: Int?
        let providerCredentialExposed: Bool?
        let providerSecretsExposed: Bool?
        let startsRecording: Bool?
        let joiningStartsRecording: Bool?
        let recordingRequiresConsent: Bool?
        let providerRecordingRequiresExplicitAction: Bool?
        let reusableAcrossRooms: Bool?
        let roomStateOwner: String?
    }

    struct Effects: Codable {
        let sideEffectFree: Bool?
        let participantCreated: Bool?
        let providerJoined: Bool?
        let recordingStarted: Bool?
        let providerRecordingStarted: Bool?
        let tokenMinted: Bool?
        let tokenReturned: Bool?
        let externalMutated: Bool?
        let stripeMutated: Bool?
        let calendarMutated: Bool?
        let mediaMutated: Bool?
        let storageMutated: Bool?
        let secretExposed: Bool?
        let nextAction: String?
    }

    struct ProviderJoin: Codable {
        let canJoin: Bool?
        let provider: String?
        let providerReadiness: String?
        let serverUrl: String?
        let roomName: String?
        let participantToken: String?
        let tokenIssuedAt: String?
        let tokenExpiresInSeconds: Int?
        let tokenExpiresAt: String?
        let tokenBoundary: TokenBoundary?
        let effects: Effects?
    }

    struct RecordingBoundary: Codable {
        let joiningStartsRecording: Bool?
        let localRecordingRequiresConsent: Bool?
        let providerRecordingRequiresAllParticipantConsent: Bool?
        let visibleRecordingIndicatorRequired: Bool?
        let recordingConsentId: String?
        let recordingConsentStatus: String?
        let recordingConsentGranted: Bool?
        let nextAction: String?
    }

    struct ProviderRecording: Codable {
        let startsWithJoin: Bool?
        let requiresExplicitStart: Bool?
        let requiresAllParticipantConsent: Bool?
        let visibleRecordingIndicatorRequired: Bool?
        let receiptRequiredBeforeTranscript: Bool?
        let currentStatus: String?
        let evidenceSource: String?
        let nextAction: String?
    }

    struct LocalFallback: Codable {
        let available: Bool?
        let safeToRecordLocally: Bool?
        let reason: String?
        let nextAction: String?
    }

    let ok: Bool
    let error: String?
    let canJoin: Bool?
    let provider: String?
    let providerReadiness: String?
    let serverUrl: String?
    let roomName: String?
    let participantToken: String?
    let callRoomId: String?
    let participantId: String?
    let recordingConsentId: String?
    let recordingConsentStatus: String?
    let recordingConsentGranted: Bool?
    let tokenIssuedAt: String?
    let tokenExpiresInSeconds: Int?
    let tokenExpiresAt: String?
    let tokenBoundary: TokenBoundary?
    let effects: Effects?
    let joinEffects: Effects?
    let providerJoin: ProviderJoin?
    let recordingBoundary: RecordingBoundary?
    let providerRecording: ProviderRecording?
    let localFallback: LocalFallback?
    let nextAction: String?

    var readinessLine: String {
        if providerJoin?.canJoin == true || canJoin == true {
            return "Provider room ready: \(providerJoin?.provider ?? provider ?? "provider") \(providerJoin?.roomName ?? roomName ?? "")"
        }
        if localFallback?.safeToRecordLocally == true {
            return localFallback?.nextAction ?? "Provider room is not ready. Local recording is available because consent is granted."
        }
        if let boundaryAction = recordingBoundary?.nextAction, !(recordingBoundary?.recordingConsentGranted ?? recordingConsentGranted ?? false) {
            return boundaryAction
        }
        return nextAction ?? localFallback?.nextAction ?? "Provider room is not ready yet. Local recording can still be used if consent is granted."
    }

    var visibleTokenBoundary: TokenBoundary? {
        tokenBoundary ?? providerJoin?.tokenBoundary
    }

    var tokenExpiryLabel: String {
        let seconds = visibleTokenBoundary?.expiresInSeconds ?? providerJoin?.tokenExpiresInSeconds ?? tokenExpiresInSeconds
        if let seconds, seconds > 0 {
            return "expires in \(seconds / 60)m \(seconds % 60)s"
        }

        let expiresAt = visibleTokenBoundary?.expiresAt ?? providerJoin?.tokenExpiresAt ?? tokenExpiresAt
        if let expiresAt, !expiresAt.isEmpty {
            return "expires \(expiresAt)"
        }

        return "expiry unknown"
    }

    var tokenBoundaryLine: String {
        guard let boundary = visibleTokenBoundary else {
            return "Prepare the room to receive a short-lived provider key."
        }

        let notRecording = boundary.startsRecording == false
        let noSecrets = boundary.providerCredentialExposed == false || boundary.providerSecretsExposed == false
        let notReusable = boundary.reusableAcrossRooms == false || boundary.tokenRoomScoped == true
        let shortLived = boundary.shortLived == true
        var parts: [String] = []
        if shortLived { parts.append("short-lived") }
        if notReusable { parts.append("room-scoped") }
        if noSecrets { parts.append("no provider secret") }
        if notRecording { parts.append("join is not recording") }
        if boundary.recordingRequiresConsent == true { parts.append("consent before recording") }
        return parts.isEmpty ? "Provider key boundary needs review." : parts.joined(separator: " • ")
    }

    var joinEffectsLine: String {
        let visibleEffects = effects ?? joinEffects ?? providerJoin?.effects
        guard let visibleEffects else {
            return "Join effects unknown until the room is prepared."
        }

        var parts: [String] = []
        if visibleEffects.participantCreated == true { parts.append("participant record created") }
        if visibleEffects.providerJoined == false { parts.append("provider not joined by server") }
        if visibleEffects.recordingStarted == false { parts.append("recording not started") }
        if visibleEffects.secretExposed == false { parts.append("no secret exposed") }
        if visibleEffects.stripeMutated == false { parts.append("no Stripe mutation") }
        if visibleEffects.calendarMutated == false { parts.append("no Calendar mutation") }
        if visibleEffects.mediaMutated == false { parts.append("no media mutation") }
        return parts.isEmpty ? visibleEffects.nextAction ?? "Join effects need review." : parts.joined(separator: " • ")
    }
}

struct MobileCaptureRoomJoinDiagnosticResponse: Codable {
    struct Effects: Codable {
        let sideEffectFree: Bool?
        let externalMutated: Bool?
        let participantCreated: Bool?
        let providerJoined: Bool?
        let recordingStarted: Bool?
        let tokenMinted: Bool?
        let tokenReturned: Bool?
        let stripeMutated: Bool?
        let calendarMutated: Bool?
        let mediaMutated: Bool?
    }

    struct ParticipantBoundary: Codable {
        let participantPresent: Bool?
        let participantWouldBeCreatedOnJoin: Bool?
        let role: String?
        let displayName: String?
        let email: String?
    }

    struct RecordingBoundary: Codable {
        let joiningStartsRecording: Bool?
        let localRecordingRequiresConsent: Bool?
        let providerRecordingRequiresAllParticipantConsent: Bool?
        let visibleRecordingIndicatorRequired: Bool?
        let recordingConsentId: String?
        let recordingConsentStatus: String?
        let recordingConsentGranted: Bool?
        let nextAction: String?
    }

    struct PaymentBoundary: Codable {
        let blocked: Bool?
        let paymentPolicy: String?
        let paymentStatus: String?
        let bookingStatus: String?
        let stripeIsEvidenceOnly: Bool?
        let noPaymentMutation: Bool?
    }

    struct LocalFallback: Codable {
        let available: Bool?
        let safeToRecordLocally: Bool?
        let reason: String?
        let nextAction: String?
    }

    struct MediaBoundary: Codable {
        let sourceOfTruth: String?
        let proxyFilesAreDerivatives: Bool?
        let originalsMutable: Bool?
    }

    let ok: Bool
    let error: String?
    let diagnosticOnly: Bool?
    let callRoomId: String?
    let provider: String?
    let providerReadiness: String?
    let canJoin: Bool?
    let canMintJoinToken: Bool?
    let serverUrlReturned: Bool?
    let tokenReturned: Bool?
    let tokenWouldBeShortLived: Bool?
    let tokenWouldBeRoomScoped: Bool?
    let effects: Effects?
    let participantBoundary: ParticipantBoundary?
    let recordingBoundary: RecordingBoundary?
    let paymentBoundary: PaymentBoundary?
    let localFallback: LocalFallback?
    let mediaBoundary: MediaBoundary?
    let nextAction: String?

    var noSideEffectsLine: String {
        let effects = effects
        if effects?.sideEffectFree == true
            && effects?.participantCreated == false
            && effects?.providerJoined == false
            && effects?.recordingStarted == false
            && effects?.tokenMinted == false
            && effects?.tokenReturned == false {
            return "Safe inspection only: no participant, provider join, token, recording, Stripe, Calendar, or media mutation."
        }
        return "Diagnostic boundary needs review before trusting this as a safe inspection."
    }

    var readinessLine: String {
        if let nextAction, !nextAction.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return nextAction
        }
        if paymentBoundary?.blocked == true {
            return "Payment evidence is still holding this room."
        }
        if canJoin == true {
            return "Provider room can be prepared from the Join room action. This inspection did not mint a token."
        }
        if localFallback?.safeToRecordLocally == true {
            return localFallback?.nextAction ?? "Local recording is safe after consent."
        }
        return recordingBoundary?.nextAction ?? "Room readiness inspected. Review consent, payment, and provider state."
    }

    var providerBadge: String {
        providerReadiness?.replacingOccurrences(of: "-", with: " ").uppercased() ?? "ROOM CHECK"
    }

    var mediaTruthLine: String {
        mediaBoundary?.sourceOfTruth ?? "Buckets store bytes. Quipsly records own meaning, access, review, and publishing truth."
    }
}

struct MobileProviderRecordingResponse: Codable {
    struct ProviderRecording: Codable {
        let startsWithJoin: Bool?
        let requiresExplicitStart: Bool?
        let requiresAllParticipantConsent: Bool?
        let visibleRecordingIndicatorRequired: Bool?
        let receiptRequiredBeforeTranscript: Bool?
        let currentStatus: String?
        let externalRecordingStarted: Bool?
        let receiptSlotRecordingAssetId: String?
        let nextAction: String?
    }

    struct RecordingAsset: Codable {
        let id: String?
        let kind: String?
        let status: String?
        let fileName: String?
    }

    let ok: Bool
    let error: String?
    let reusedExistingSlot: Bool?
    let recordingAsset: RecordingAsset?
    let providerRecording: ProviderRecording?
    let nextAction: String?
}

struct MobileCaptureSessionContextEntry: Codable, Equatable {
    var id: String?
    var kind: String?
    var text: String
    var position: Int
    var projectionId: String?
    var createdAt: String?
    var updatedAt: String?
    var source: String?
}

struct MobileCaptureSessionContextEntries: Codable, Equatable {
    var note: MobileCaptureSessionContextEntry?
    var goals: [MobileCaptureSessionContextEntry]
    var tasks: [MobileCaptureSessionContextEntry]
}

struct MobileCaptureSessionContextResponse: Codable {
    struct Context: Codable {
        let note: String?
        let goals: [String]?
        let tasks: [String]?
        let schemaVersion: Int?
        let revisionId: String?
        let revisionNumber: Int?
        let parentRevisionId: String?
        let entries: MobileCaptureSessionContextEntries?
        let updatedAt: String?
        let updatedByUserId: String?
        let source: String?
    }

    let ok: Bool
    let error: String?
    let sourceOfTruth: String?
    let localDraftAllowed: Bool?
    let externalSideEffects: Bool?
    let callRoomId: String?
    let revisionId: String?
    let schemaVersion: Int?
    let context: Context?
    let conflict: Bool?
    let code: String?
    let submittedRevisionId: String?
    let remoteContext: Context?
    let localContext: Context?
    let saved: Bool?
    let unchanged: Bool?
    let nextAction: String?

    var statusLine: String {
        if saved == true { return "Nest context saved" }
        if ok { return "Nest context loaded" }
        return error ?? "Session context needs attention"
    }

    private func draft(
        from context: Context?,
        fallback: CaptureSessionContextDraft = CaptureSessionContextDraft()
    ) -> CaptureSessionContextDraft {
        var date = fallback.updatedAt
        if let updatedAt = context?.updatedAt,
           let parsed = ISO8601DateFormatter().date(from: updatedAt) {
            date = parsed
        }

        return CaptureSessionContextDraft(
            note: context?.note ?? fallback.note,
            goals: context?.goals ?? fallback.goals,
            tasks: context?.tasks ?? fallback.tasks,
            updatedAt: date,
            revisionId: context?.revisionId ?? fallback.revisionId,
            entries: context?.entries ?? fallback.entries
        )
    }

    func draft(fallback: CaptureSessionContextDraft = CaptureSessionContextDraft()) -> CaptureSessionContextDraft {
        draft(from: context, fallback: fallback)
    }

    func remoteDraft(fallback: CaptureSessionContextDraft) -> CaptureSessionContextDraft? {
        guard remoteContext != nil else { return nil }
        return draft(from: remoteContext, fallback: fallback)
    }

    func preservedLocalDraft(fallback: CaptureSessionContextDraft) -> CaptureSessionContextDraft {
        guard localContext != nil else { return fallback }
        return draft(from: localContext, fallback: fallback)
    }
}

private struct MobileQuickEntrySaveRequest: Encodable {
    let clientRequestId: String
    let callRoomId: String?
    let projectId: String?
    let kind: String
    let noteKind: String?
    let noteVisibility: String?
    let title: String?
    let body: String
    let sourceUrl: String?
    let tagIds: [String]
    let newTagLabels: [String]
    let dueAt: String?
    let reminderAt: String?
    let recurrence: MobileQuickEntryRecurrence?
    let capturedAt: String

    init(entry: PendingMobileQuickEntry) {
        clientRequestId = entry.clientRequestID
        callRoomId = entry.callRoomID
        projectId = entry.destinationProjectID
        kind = entry.kind.rawValue
        noteKind = entry.noteKind?.rawValue
        noteVisibility = entry.noteVisibility?.rawValue
        title = entry.title
        body = entry.body
        sourceUrl = entry.sourceURL
        tagIds = entry.tagIDs ?? []
        newTagLabels = entry.newTagLabels ?? []
        dueAt = entry.dueAt.map { ISO8601DateFormatter().string(from: $0) }
        reminderAt = entry.reminderAt.map { ISO8601DateFormatter().string(from: $0) }
        recurrence = entry.recurrence
        capturedAt = ISO8601DateFormatter().string(from: entry.capturedAt)
    }
}

struct MobileQuickEntrySaveResponse: Decodable {
    struct Reminder: Decodable, Equatable {
        let id: String
        let actionItemId: String
        let remindAt: String
        let status: String
        let deviceNotificationScheduled: Bool

        var canonicalAcknowledgement: CanonicalTaskReminderAcknowledgement? {
            let fractional = ISO8601DateFormatter()
            fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            guard let date = fractional.date(from: remindAt)
                ?? ISO8601DateFormatter().date(from: remindAt) else { return nil }
            return CanonicalTaskReminderAcknowledgement(
                id: id,
                actionItemID: actionItemId,
                remindAt: date,
                status: status,
                deviceNotificationScheduled: deviceNotificationScheduled
            )
        }
    }

    struct Entry: Decodable {
        let id: String
        let kind: String
        let noteKind: String?
        let noteVisibility: String?
        let title: String?
        let body: String?
        let status: String?
        let callRoomId: String?
        let sessionTitle: String?
        let projectId: String?
        let projectName: String?
        let destination: String?
        let tags: [MobileCaptureTag]?
        let dueAt: String?
        let recurrence: MobileQuickEntryRecurrence?
        let reminder: Reminder?
        let createdAt: String?
        let updatedAt: String?
    }

    let ok: Bool
    let code: String?
    let error: String?
    let idempotentReplay: Bool?
    let entry: Entry?
    let nextAction: String?
}

enum MobileQuickEntrySyncResult {
    case acknowledged(serverRecordID: String, idempotentReplay: Bool, message: String, reminder: MobileQuickEntrySaveResponse.Reminder?)
    case retryable(message: String)
    case held(code: String?, message: String)
}

enum CaptureSessionContextSaveResult {
    case saved(CaptureSessionContextDraft)
    case conflict(remote: CaptureSessionContextDraft, local: CaptureSessionContextDraft, message: String)
    case failed(message: String)
}

private struct CaptureSessionContextSaveRequest: Encodable {
    let callRoomId: String
    let note: String
    let goals: [String]
    let tasks: [String]
    let revisionId: String?
    let entries: MobileCaptureSessionContextEntries?

    init(callRoomId: String, draft: CaptureSessionContextDraft) {
        self.callRoomId = callRoomId
        note = draft.note
        goals = draft.goals
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        tasks = draft.tasks
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        revisionId = draft.revisionId
        entries = draft.entries
    }
}

enum ProviderRecordingAction {
    static let prepareReceiptSlot = "PREPARE_RECEIPT_SLOT"
    static let startEgress = "START_EGRESS"
    static let stopEgress = "STOP_EGRESS"
    static let reconcileProviderFile = "RECONCILE_PROVIDER_FILE"
}

struct AccountDeletionRequestPayload: Codable {
    let id: String?
    let status: String?
    let statusLabel: String?
    let statusDetail: String?
    let requestedAt: String?
    let targetCompletionAt: String?
    let reviewedAt: String?
    let completedAt: String?
    let canceledAt: String?
    let updatedAt: String?
    let active: Bool?
    let nextAction: String?
    let reusedExistingRequest: Bool?
}

struct AccountDeletionPolicyPayload: Codable {
    let version: String?
    let targetDays: Int?
    let supportEmail: String?
    let timing: String?
    let completionConfirmation: String?
}

struct AccountDeletionRequestResponse: Codable {
    let ok: Bool
    let error: String?
    let request: AccountDeletionRequestPayload?
    let policy: AccountDeletionPolicyPayload?
    let nextAction: String?
}

/// Typed result for refreshing the authoritative Nest session list.
///
/// Capture uses this distinction as a safety boundary: a transient transport
/// failure is ambiguous and may be retried without changing an active local
/// take, while access loss, removal from the authoritative list, or an invalid
/// server response must never be mistaken for continued recording authority.
enum CaptureSessionLoadOutcome: Equatable {
    case loaded
    case transportUnavailable(message: String)
    case forbidden(message: String)
    case authoritativeAbsent(message: String)
    case invalidResponse(message: String)

    var message: String? {
        switch self {
        case .loaded:
            nil
        case let .transportUnavailable(message),
             let .forbidden(message),
             let .authoritativeAbsent(message),
             let .invalidResponse(message):
            message
        }
    }
}

@MainActor
final class AccountDeletionClient: ObservableObject {
    @Published var status = "No deletion request"
    @Published var errorMessage: String?
    @Published var latestRequestId: String?
    @Published var latestNextAction: String?
    @Published var latestRequest: AccountDeletionRequestPayload?
    @Published var policy: AccountDeletionPolicyPayload?
    @Published var isLoading = false
    @Published var isSubmitting = false

    private let baseURL = normalizedNestBaseURL(Bundle.main.object(forInfoDictionaryKey: "QUIPSLY_API_BASE_URL") as? String ?? "https://nest.quipsly.com")

    func loadStatus() async {
        guard let url = endpointURL else {
            status = "Bad Nest URL"
            errorMessage = "The configured Nest URL is not valid."
            return
        }

        isLoading = true
        errorMessage = nil

        do {
            var request = URLRequest(url: url)
            request.httpMethod = "GET"
            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            let payload = try JSONDecoder().decode(AccountDeletionRequestResponse.self, from: data)

            guard response.statusCode < 400, payload.ok else {
                throw NSError(
                    domain: "AccountDeletion",
                    code: 2,
                    userInfo: [NSLocalizedDescriptionKey: payload.error ?? "Deletion request status could not be loaded."]
                )
            }

            apply(payload)
            status = payload.request?.statusLabel ?? "No deletion request"
        } catch {
            status = "Status unavailable"
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    func requestDeletion(reason: String) async {
        guard let url = endpointURL else {
            status = "Bad Nest URL"
            errorMessage = "The configured Nest URL is not valid."
            return
        }

        isSubmitting = true
        status = "Submitting"
        errorMessage = nil

        do {
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: [
                "reason": reason.trimmingCharacters(in: .whitespacesAndNewlines),
                "source": "ios-capture",
                "appSurface": "HighGroundCapture",
            ])

            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            let payload = try JSONDecoder().decode(AccountDeletionRequestResponse.self, from: data)

            guard response.statusCode < 400, payload.ok else {
                throw NSError(
                    domain: "AccountDeletion",
                    code: 1,
                    userInfo: [NSLocalizedDescriptionKey: payload.error ?? "Deletion request could not be submitted."]
                )
            }

            apply(payload)
            status = payload.request?.statusLabel
                ?? (payload.request?.reusedExistingRequest == true ? "Request already recorded" : "Request recorded")
        } catch {
            status = "Needs attention"
            errorMessage = error.localizedDescription
        }

        isSubmitting = false
    }

    private var endpointURL: URL? {
        URL(string: "\(baseURL.trimmingCharacters(in: .whitespacesAndNewlines))/api/account/deletion-request")
    }

    private func apply(_ payload: AccountDeletionRequestResponse) {
        latestRequest = payload.request
        latestRequestId = payload.request?.id
        latestNextAction = payload.request?.nextAction ?? payload.nextAction
        policy = payload.policy
    }
}

struct MobileCaptureConsentGrantAttestation: Equatable, Sendable {
    static let policyVersion = "2026-07-18.capture-consent-v2"
    static let policyText = "I consent to Quipsly recording audio from my participation. Video recording and transcription are separate choices. Recording will not start until every signed-in participant has consented, and I confirm anyone else who may be heard has been told and agreed before recording starts."
    static let policyTextHash = "379380cecf3bc1b3a1614334e247e6795f09f3eb1c85bf3918daf612b9929ff9"
    static let presentationSurface = "quipsly-capture-consent-v2"

    let canRecordAudio: Bool
    let canRecordVideo: Bool
    let canTranscribe: Bool
    let allAudibleParticipantsNotifiedAndAgreed: Bool
    let presentedAt: Date

    var isCompleteForCapture: Bool {
        (canRecordAudio || canRecordVideo)
            && allAudibleParticipantsNotifiedAndAgreed
    }
}

@MainActor
final class CaptureTodayClient: ObservableObject {
    @Published private(set) var brief: MobileCaptureTodayResponse?
    @Published private(set) var isLoading = false
    @Published private(set) var isMutating = false
    @Published private(set) var isUsingProtectedCache = false
    @Published private(set) var pendingFocusDecisionCount = 0
    @Published private(set) var heldFocusDecisionCount = 0
    @Published private(set) var pendingFocusPlanCount = 0
    @Published private(set) var heldFocusPlanCount = 0
    @Published private(set) var pendingReminderDecisionCount = 0
    @Published private(set) var heldReminderDecisionCount = 0
    @Published private(set) var pendingWorkTagDecisionCount = 0
    @Published private(set) var heldWorkTagDecisionCount = 0
    @Published private(set) var pendingWritingDraftDecisionCount = 0
    @Published private(set) var heldWritingDraftDecisionCount = 0
    @Published var errorMessage: String?

    private let baseURL = normalizedNestBaseURL(Bundle.main.object(forInfoDictionaryKey: "QUIPSLY_API_BASE_URL") as? String ?? "https://nest.quipsly.com")
    private let focusDecisionOutbox = FocusBlockDecisionOutbox.shared
    private let focusPlanOutbox = FocusBlockPlanOutbox.shared
    private let reminderDecisionOutbox = TaskReminderDecisionOutbox.shared
    private let workTagDecisionOutbox = WorkTagDecisionOutbox.shared
    private let writingDraftOutbox = SourceAnnotationDraftOutbox.shared
    private var isFlushingFocusDecisions = false
    private var isFlushingFocusPlans = false
    private var isFlushingReminderDecisions = false
    private var isFlushingWorkTagDecisions = false
    private var isFlushingWritingDraftDecisions = false
    private var latestWritingDraftURLs: [String: URL] = [:]

    private struct ProtectedCache: Codable {
        let schemaVersion: Int
        let ownerEmail: String
        let savedAt: Date
        let brief: MobileCaptureTodayResponse
    }

    var tasks: [MobileCaptureTodayTask] { brief?.tasks ?? [] }
    var goals: [MobileCaptureTodayGoal] { brief?.goals ?? [] }
    var focusBlocks: [MobileCaptureTodayFocusBlock] { brief?.focusBlocks ?? [] }
    var focusDecisions: [PendingFocusBlockDecision] { focusDecisionOutbox.entries }
    var focusPlans: [PendingFocusBlockPlan] { focusPlanOutbox.entries }
    var weeklyReview: MobileCaptureWeeklyReview? { brief?.weeklyReview }
    var transcriptReviews: [MobileCaptureTodayTranscriptReview] { brief?.transcriptReviews ?? [] }
    var sourceAnnotations: [MobileCaptureTodaySourceAnnotation] { brief?.sourceAnnotations ?? [] }
    var weeklyPlan: MobileCaptureTodayWeeklyPlan? { brief?.weeklyPlan }

    func pendingFocusDecision(for blockID: String) -> PendingFocusBlockDecision? {
        focusDecisionOutbox.decision(forBlockID: blockID)
    }

    func pendingFocusPlan(for taskID: String) -> PendingFocusBlockPlan? {
        focusPlanOutbox.plan(forTaskID: taskID)
    }

    func pendingReminderDecision(for taskID: String) -> PendingTaskReminderDecision? {
        reminderDecisionOutbox.decision(forTaskID: taskID)
    }

    func pendingWritingDraftDecision(
        for annotationID: String
    ) -> PendingSourceAnnotationDraftDecision? {
        writingDraftOutbox.decision(for: annotationID)
    }

    func writingDraftURL(for annotation: MobileCaptureTodaySourceAnnotation) -> URL? {
        if let latest = latestWritingDraftURLs[annotation.id] {
            return latest
        }
        guard let href = annotation.writingDraftHref else { return nil }
        return safeWritingDraftURL(
            href: href,
            expectedProjectSlug: annotation.projectSlug,
            expectedDocumentID: nil
        )
    }

    func tags(for projectID: String) -> [MobileCaptureTodayTag] {
        (brief?.tagCatalog ?? [])
            .filter { $0.projectId == projectID }
            .sorted {
                $0.label.localizedCaseInsensitiveCompare($1.label) == .orderedAscending
            }
    }

    func pendingWorkTagDecision(
        kind: PendingWorkTagDecision.EntityKind,
        entityID: String
    ) -> PendingWorkTagDecision? {
        workTagDecisionOutbox.decision(entityKind: kind, entityID: entityID)
    }

    func effectiveTagIDs(
        kind: PendingWorkTagDecision.EntityKind,
        entityID: String,
        canonicalTagIDs: [String]
    ) -> [String] {
        pendingWorkTagDecision(kind: kind, entityID: entityID)?.tagIDs ?? canonicalTagIDs
    }

    func tagLabels(projectID: String, tagIDs: [String]) -> [String] {
        let labels = Dictionary(uniqueKeysWithValues: tags(for: projectID).map { ($0.id, $0.label) })
        return tagIDs.compactMap { labels[$0] }
    }

    func effectiveTagLabels(
        kind: PendingWorkTagDecision.EntityKind,
        entityID: String,
        projectID: String,
        canonicalTagIDs: [String],
        canonicalTagLabels: [String]
    ) -> [String] {
        guard let pending = pendingWorkTagDecision(kind: kind, entityID: entityID) else {
            return canonicalTagLabels
        }
        let effectiveIDs = effectiveTagIDs(
            kind: kind,
            entityID: entityID,
            canonicalTagIDs: canonicalTagIDs
        )
        var seen = Set<String>()
        return (tagLabels(projectID: projectID, tagIDs: effectiveIDs) + pending.requestedNewTagLabels)
            .filter {
                seen.insert($0.lowercased(with: Locale(identifier: "en_US_POSIX"))).inserted
            }
    }

    func loadPreview() {
        let now = Date()
        if CaptureLaunchConfiguration.usesFocusOutboxUITest,
           let previewOwner = CaptureLaunchConfiguration.shareExtensionUITestOwner {
            // The App installs the simulator credential before SwiftUI builds
            // this client. Activate the same explicit partition here as well
            // so the test proves relaunch recovery instead of depending on an
            // observer having existed when the identity notification fired.
            focusDecisionOutbox.activateOwner(previewOwner)
            if focusDecisionOutbox.decision(forBlockID: "preview-block") == nil {
                do {
                    _ = try focusDecisionOutbox.enqueue(
                        blockID: "preview-block",
                        nextStatus: "COMPLETED",
                        actualMinutes: 35,
                        expectedUpdatedAt: ISO8601DateFormatter().string(from: now),
                        capturedAt: now
                    )
                } catch {
                    errorMessage = "Focus outbox UI proof could not stage its protected decision: \(error.localizedDescription)"
                }
            }
        }
        publishFocusDecisionCounts()
        publishFocusPlanCounts()
        publishReminderDecisionCounts()
        publishWorkTagDecisionCounts()
        publishWritingDraftDecisionCounts()
        let start = ISO8601DateFormatter().string(from: now.addingTimeInterval(1_800))
        let end = ISO8601DateFormatter().string(from: now.addingTimeInterval(4_800))
        brief = MobileCaptureTodayResponse(
            ok: true,
            error: nil,
            briefKind: "quipsly-mobile-today-v1-preview",
            generatedAt: ISO8601DateFormatter().string(from: now),
            tasks: [MobileCaptureTodayTask(
                id: "preview-task",
                title: "Proof-listen the coaching recap",
                detail: "Check the source audio against the corrected transcript.",
                status: "OPEN",
                isOverdue: true,
                dueAt: nil,
                updatedAt: ISO8601DateFormatter().string(from: now),
                roomId: "room-preview-coaching-ready",
                sessionTitle: "Leadership coaching session",
                project: MobileCaptureTodayProject(id: "preview-high-ground", name: "High Ground Odyssey", slug: "preview-high-ground"),
                canEditTags: false,
                tagIds: ["preview-proof-listen", "preview-episode-4"],
                tagLabels: ["Proof listen", "Episode 4"],
                sourceAnchor: MobileCaptureTodayTranscriptSourceAnchor(
                    schema: "quipsly-transcript-derived-task-v1",
                    roomId: "room-preview-coaching-ready",
                    transcriptJobId: "preview-job",
                    segmentId: "preview-segment",
                    startSeconds: 3.66,
                    endSeconds: 4.84,
                    providerTextSha256: String(repeating: "a", count: 64),
                    providerSpeakerLabel: "Speaker",
                    effectiveTextSnapshot: "Welcome, everybody.",
                    effectiveSpeakerLabelSnapshot: "Charlie",
                    acceptedCorrectionId: nil,
                    recordingAssetId: "preview-recording-asset",
                    playbackSourceId: "preview-playback-source"
                ),
                lastMergedTranscriptEvidence: MobileCaptureTodayTaskTranscriptEvidence(
                    receiptId: "preview-task-merge-receipt",
                    actionCandidateId: "preview-task-candidate",
                    mergedAt: ISO8601DateFormatter().string(from: now),
                    sourceAnchor: MobileCaptureTodayTranscriptSourceAnchor(
                        schema: "quipsly-transcript-derived-task-v1",
                        roomId: "room-preview-coaching-ready",
                        transcriptJobId: "preview-job",
                        segmentId: "preview-task-evidence-segment",
                        startSeconds: 8.4,
                        endSeconds: 12.2,
                        providerTextSha256: String(repeating: "b", count: 64),
                        providerSpeakerLabel: "Speaker",
                        effectiveTextSnapshot: "The client confirmed the proof-listen action in their own words.",
                        effectiveSpeakerLabelSnapshot: "Coach",
                        acceptedCorrectionId: nil,
                        recordingAssetId: "preview-recording-asset",
                        playbackSourceId: "preview-playback-source"
                    )
                ),
                todayReason: "Planned focus · reviewed transcript",
                recurrence: MobileCaptureTodayRecurrence(
                    seriesId: "preview-series",
                    occurrenceKey: "2026-07-20T09:00[America/Denver]",
                    scheduledLocalDate: "2026-07-20",
                    cadence: "FIXED",
                    frequency: "WEEKLY",
                    interval: 1,
                    timezone: "America/Denver",
                    localTimeMinutes: 540,
                    status: "ACTIVE",
                    updatedAt: ISO8601DateFormatter().string(from: now),
                    ownerCanManage: true
                ),
                reminder: nil
            )],
            goals: [MobileCaptureTodayGoal(id: "preview-goal", title: "Leave the client with one clear next move", description: nil, status: "ACTIVE", targetAt: nil, progressPercent: 50, progressNote: "Session notes are captured.", updatedAt: ISO8601DateFormatter().string(from: now), roomId: "room-preview-coaching-ready", sessionTitle: "Leadership coaching session", project: MobileCaptureTodayProject(id: "preview-high-ground", name: "High Ground Odyssey", slug: "preview-high-ground"), canEditTags: false, tagIds: ["preview-coaching", "preview-follow-through"], tagLabels: ["Coaching", "Follow-through"], sourceAnchor: MobileCaptureTodayTranscriptSourceAnchor(schema: "quipsly-transcript-derived-goal-v1", roomId: "room-preview-coaching-ready", transcriptJobId: "preview-job", segmentId: "preview-segment", startSeconds: 3.66, endSeconds: 4.84, providerTextSha256: String(repeating: "a", count: 64), providerSpeakerLabel: "Speaker", effectiveTextSnapshot: "Leave the client with one clear next move.", effectiveSpeakerLabelSnapshot: "Guest", acceptedCorrectionId: nil, recordingAssetId: "preview-recording-asset", playbackSourceId: "preview-playback-source"), lastMergedTranscriptEvidence: MobileCaptureTodayGoalTranscriptEvidence(receiptId: "preview-merge-receipt", goalCandidateId: "preview-goal-candidate", mergedAt: ISO8601DateFormatter().string(from: now), sourceAnchor: MobileCaptureTodayTranscriptSourceAnchor(schema: "quipsly-transcript-derived-goal-v1", roomId: "room-preview-coaching-ready", transcriptJobId: "preview-job", segmentId: "preview-evidence-segment", startSeconds: 8.4, endSeconds: 12.2, providerTextSha256: String(repeating: "b", count: 64), providerSpeakerLabel: "Speaker", effectiveTextSnapshot: "The client chose the next move in their own words.", effectiveSpeakerLabelSnapshot: "Coach", acceptedCorrectionId: nil, recordingAssetId: "preview-recording-asset", playbackSourceId: "preview-playback-source")))],
            focusBlocks: [MobileCaptureTodayFocusBlock(id: "preview-block", targetType: "task", targetId: "preview-task", title: "Proof-listen the coaching recap", targetStatus: "OPEN", startsAt: start, endsAt: end, timezone: TimeZone.current.identifier, status: "PLANNED", completedAt: nil, actualMinutes: nil, updatedAt: ISO8601DateFormatter().string(from: now))],
            weeklyReview: MobileCaptureWeeklyReview(
                schema: "quipsly-weekly-review-v1",
                subjectUserId: "preview-user",
                subjectLabel: "Preview client",
                relationship: "self",
                weekStartsAt: ISO8601DateFormatter().string(from: now),
                weekEndsAt: ISO8601DateFormatter().string(from: now.addingTimeInterval(7 * 86_400)),
                generatedAt: ISO8601DateFormatter().string(from: now),
                reviewState: "draft",
                plannedMinutes: 50,
                actualMinutes: 35,
                completedBlocksWithoutActualMinutes: 0,
                goals: [MobileCaptureWeeklyReviewGoal(id: "preview-goal", title: "Leave the client with one clear next move", status: "ACTIVE", health: "moving", healthLabel: "Moving with evidence", progressPercent: 50, latestEvidence: "Session notes are captured.", latestEvidenceAt: ISO8601DateFormatter().string(from: now), plannedMinutes: 50, actualMinutes: 35, completedBlocksWithoutActualMinutes: 0, linkedTaskCount: 1, completedTaskCount: 0, openTaskCount: 1, overdueTaskCount: 1, blockers: [], nextTask: MobileCaptureWeeklyReviewNextTask(id: "preview-task", title: "Proof-listen the coaching recap", dueAt: nil))],
                blockers: ["A second listener for the final recap"],
                nextCommitments: [MobileCaptureWeeklyReviewCommitment(kind: "weekly-plan", id: "preview-week:1", title: "Proof-listen one real session", dueAt: nil)],
                sessionContributions: [MobileCaptureWeeklyReviewSession(roomId: "room-preview-coaching-ready", title: "Leadership coaching session", evidenceCount: 2)],
                reflection: nil
            ),
            transcriptReviews: [MobileCaptureTodayTranscriptReview(id: "preview-transcript-proposal", roomId: "room-preview-coaching-ready", sessionTitle: "Leadership coaching session", segmentId: "preview-segment", startSeconds: 3.66, endSeconds: 4.84, providerText: "Welcome, everybody.", providerSpeakerLabel: "Speaker", proposedText: nil, proposedSpeakerLabel: "Host", reason: "The isolated host track suggests this speaker label.", recordingAssetId: "preview-recording-asset", playbackAvailable: true, updatedAt: ISO8601DateFormatter().string(from: now))],
            sourceAnnotations: [
                MobileCaptureTodaySourceAnnotation(id: "preview-annotation", kind: "question", body: "Does this distinction give us the episode's opening tension?", exactText: "Keep the source intact and let decisions live around it.", status: "active", visibility: "private", createdByMe: true, canChangeStatus: true, canStartWriting: true, sourceTitle: "Preview production philosophy", projectName: "High Ground Odyssey", projectSlug: "preview-high-ground", writingDraftHref: nil, tagLabels: ["Episode seed"], updatedAt: ISO8601DateFormatter().string(from: now)),
                MobileCaptureTodaySourceAnnotation(id: "preview-resolved-annotation", kind: "note", body: "The production boundary is settled, but the same annotation remains reopenable.", exactText: "let decisions live around it", status: "resolved", visibility: "project", createdByMe: true, canChangeStatus: true, canStartWriting: true, sourceTitle: "Preview production philosophy", projectName: "High Ground Odyssey", projectSlug: "preview-high-ground", writingDraftHref: "/create?project=preview-high-ground&document=preview-evidence-draft", tagLabels: ["Decision"], updatedAt: ISO8601DateFormatter().string(from: now.addingTimeInterval(-3_600))),
            ],
            weeklyPlan: MobileCaptureTodayWeeklyPlan(id: "preview-week", weekStartsAt: ISO8601DateFormatter().string(from: now), commitments: ["Proof-listen one real session", "Send one source-linked follow-up"], supportNeeded: "A second listener for the final recap", progressNotes: nil, clientReviewedAt: nil, updatedAt: ISO8601DateFormatter().string(from: now)),
            taskReminderIntents: [],
            tagCatalog: [
                MobileCaptureTodayTag(id: "preview-proof-listen", projectId: "preview-high-ground", slug: "proof-listen", label: "Proof listen", isActive: true),
                MobileCaptureTodayTag(id: "preview-episode-4", projectId: "preview-high-ground", slug: "episode-4", label: "Episode 4", isActive: true),
                MobileCaptureTodayTag(id: "preview-coaching", projectId: "preview-high-ground", slug: "coaching", label: "Coaching", isActive: true),
                MobileCaptureTodayTag(id: "preview-follow-through", projectId: "preview-high-ground", slug: "follow-through", label: "Follow-through", isActive: true),
            ],
            boundaries: MobileCaptureTodayBoundaries(appOwnedRecords: true, transcriptCandidatesExcluded: true, externalCalendarMutated: false, providerMutated: false, recordingMutated: false, sourceMutated: false, immutableSourceAnchors: true, completingFocusBlockMutatesTarget: false, focusBlockActualTimeExplicitOnly: true, focusBlockPlanningAvailable: true, planningFocusBlockMutatesTarget: false, planningFocusBlockCreatesAppointment: false, planningFocusBlockSchedulesReminder: false, aiOutputRequiresHumanReview: true, transcriptReviewMutatesWork: false, transcriptReviewRequiresReleasedPlayback: true, goalCheckInMutatesStatus: false, recurrenceAppOwned: true, recurrenceNotificationsScheduled: false, canonicalReminderIntents: true, taskReminderIntentProjectionComplete: true, deviceNotificationsReconciled: false, reminderDeliveryClaimed: false, canonicalProjectTags: true, tagMutationExternalSideEffects: false, annotationResolveReopenAvailable: true, annotationReviewMutatesSource: false, annotationWritingDraftAvailable: true, writingDraftPrivate: true, writingDraftSourceMutated: false, writingDraftExternalSideEffects: false)
        )
        isUsingProtectedCache = false
        if !CaptureLaunchConfiguration.usesFocusOutboxUITest
            || focusDecisionOutbox.decision(forBlockID: "preview-block") != nil {
            errorMessage = nil
        }
    }

    func load() async {
        guard !isLoading, let url = URL(string: "\(baseURL)/api/mobile/capture/today") else { return }
        publishFocusDecisionCounts()
        publishFocusPlanCounts()
        publishReminderDecisionCounts()
        publishWorkTagDecisionCounts()
        publishWritingDraftDecisionCounts()
        if brief == nil {
            _ = restoreProtectedCache()
        }
        isLoading = true
        defer { isLoading = false }
        errorMessage = nil
        do {
            var request = URLRequest(url: url)
            request.httpMethod = "GET"
            let (data, response) = try await AuthManager.shared.authenticatedData(for: request, allowOfflineRecovery: true)
            let payload = try JSONDecoder().decode(MobileCaptureTodayResponse.self, from: data)
            guard response.statusCode < 400, payload.ok else {
                throw NSError(domain: "CaptureToday", code: response.statusCode, userInfo: [NSLocalizedDescriptionKey: payload.error ?? "Today work could not be loaded."])
            }
            brief = payload
            isUsingProtectedCache = false
            persist(payload)
            await TaskReminderScheduler.shared.reconcileCanonical(
                intents: (payload.taskReminderIntents ?? []).compactMap(\.canonicalProjection),
                projectionComplete: payload.boundaries?.taskReminderIntentProjectionComplete == true
            )
            for decision in reminderDecisionOutbox.entries where decision.disposition == .pending {
                _ = await TaskReminderScheduler.shared.stage(
                    decision: decision,
                    requestPermissionIfNeeded: false
                )
            }
            let synchronizedFocus = await flushFocusDecisions()
            let synchronizedFocusPlans = await flushFocusPlans()
            let synchronizedReminders = await flushReminderDecisions()
            let synchronizedTags = await flushWorkTagDecisions()
            let synchronizedWritingDrafts = await flushWritingDraftDecisions()
            if synchronizedFocus || synchronizedFocusPlans || synchronizedReminders || synchronizedTags || synchronizedWritingDrafts {
                Task { [weak self] in
                    await self?.load()
                }
            }
        } catch {
            if brief == nil { _ = restoreProtectedCache() }
            errorMessage = isUsingProtectedCache
                ? "Nest is unavailable. Showing a protected Today snapshot; focus plans and completion, reminders, tags, and source-to-writing handoffs can be queued safely, while other online work decisions stay disabled."
                : error.localizedDescription
        }
    }

    func setTaskReminder(_ task: MobileCaptureTodayTask, remindAt: Date?) async -> Bool {
        guard task.recurrence == nil else {
            errorMessage = "Repeating work keeps its schedule separate from one-time reminders."
            return false
        }
        let timezone = TimeZone.current.identifier
        let localValue = remindAt.map { Self.localReminderString($0, timezone: timezone) }
        do {
            let decision = try reminderDecisionOutbox.enqueue(
                taskID: task.id,
                currentReminderID: task.reminder?.id,
                remindAt: remindAt,
                timezone: timezone,
                requestedLocalDateTime: localValue,
                expectedTaskUpdatedAt: task.updatedAt,
                expectedReminderUpdatedAt: task.reminder?.updatedAt
            )
            publishReminderDecisionCounts()
            let projection = await TaskReminderScheduler.shared.stage(
                decision: decision,
                requestPermissionIfNeeded: remindAt != nil
            )
            if case let .failed(message) = projection {
                reminderDecisionOutbox.markHeld(decision.id, code: "DEVICE_PROJECTION_FAILED", message: message)
                publishReminderDecisionCounts()
                errorMessage = message
                return false
            }
            guard AuthManager.shared.networkActionsAllowed else {
                errorMessage = remindAt == nil
                    ? "Reminder removed on this iPhone and queued for Nest. Reconnect to finish canonical cancellation."
                    : "Reminder protected on this iPhone and queued for Nest. iOS controls alert delivery."
                return true
            }
            isMutating = true
            defer { isMutating = false }
            let synchronized = await syncReminderDecision(decision)
            if synchronized {
                errorMessage = nil
                await load()
            }
            return synchronized
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func retryHeldReminderDecisions() async {
        reminderDecisionOutbox.releaseHeldEntriesForRetry()
        publishReminderDecisionCounts()
        _ = await flushReminderDecisions()
        await load()
    }

    func discardHeldReminderDecision(for taskID: String) async {
        guard let decision = reminderDecisionOutbox.decision(forTaskID: taskID),
              decision.disposition == .held else { return }
        reminderDecisionOutbox.markAcknowledged(decision.id)
        publishReminderDecisionCounts()
        errorMessage = nil
        await load()
    }

    func setWorkTags(
        kind: PendingWorkTagDecision.EntityKind,
        entityID: String,
        projectID: String,
        tagIDs: [String],
        newTagLabels: [String] = [],
        expectedUpdatedAt: String,
        expectedTagRevision: Int? = nil,
        availableTagIDs: Set<String>? = nil
    ) async -> Bool {
        let allowedTagIDs = availableTagIDs
            ?? Set(tags(for: projectID).filter(\.isActive).map(\.id))
        let normalized = Array(Set(tagIDs)).sorted()
        guard normalized.count == tagIDs.count,
              normalized.count + newTagLabels.count <= 24,
              normalized.allSatisfy(allowedTagIDs.contains) else {
            errorMessage = "Choose up to 24 active tags from this record’s Nest."
            return false
        }
        do {
            let decision = try workTagDecisionOutbox.enqueue(
                entityKind: kind,
                entityID: entityID,
                projectID: projectID,
                tagIDs: normalized,
                newTagLabels: newTagLabels,
                expectedUpdatedAt: expectedUpdatedAt,
                expectedTagRevision: expectedTagRevision
            )
            publishWorkTagDecisionCounts()
            guard AuthManager.shared.networkActionsAllowed else {
                errorMessage = "Tag choices are protected on this iPhone and queued for Nest."
                return true
            }
            isMutating = true
            defer { isMutating = false }
            let synchronized = await syncWorkTagDecision(decision)
            if synchronized {
                errorMessage = nil
                await load()
            }
            return synchronized
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func retryHeldWorkTagDecisions() async {
        for decision in workTagDecisionOutbox.entries where decision.disposition == .held {
            workTagDecisionOutbox.markRetryable(decision.id, message: "Retry requested.")
        }
        publishWorkTagDecisionCounts()
        _ = await flushWorkTagDecisions()
        await load()
    }

    func discardHeldWorkTagDecision(
        kind: PendingWorkTagDecision.EntityKind,
        entityID: String
    ) async {
        guard let decision = workTagDecisionOutbox.decision(entityKind: kind, entityID: entityID),
              decision.disposition == .held else { return }
        workTagDecisionOutbox.markAcknowledged(decision.id)
        publishWorkTagDecisionCounts()
        errorMessage = nil
        await load()
    }

    func setTaskStatus(_ task: MobileCaptureTodayTask, status: String, decisionReason: String? = nil) async -> Bool {
        await mutate(
            action: "task-status",
            id: task.id,
            nextStatus: status,
            expectedUpdatedAt: task.updatedAt,
            additionalFields: decisionReason.map { ["decisionReason": $0] } ?? [:]
        )
    }

    func editTask(
        _ task: MobileCaptureTodayTask,
        title: String,
        detail: String,
        dueAt: Date?,
        timezone: String
    ) async -> Bool {
        guard task.recurrence == nil else {
            errorMessage = "Use the repeating-task editor so Quipsly can preserve the series history."
            return false
        }
        let normalizedTitle = Self.normalizedTaskText(title)
        let normalizedDetail = Self.normalizedTaskText(detail)
        guard !normalizedTitle.isEmpty,
              normalizedTitle.count <= 500,
              normalizedDetail.count <= 5_000,
              TimeZone(identifier: timezone) != nil else {
            errorMessage = "Add a task title under 500 characters, keep detail under 5,000 characters, and choose a valid timezone."
            return false
        }
        guard !isUsingProtectedCache,
              AuthManager.shared.networkActionsAllowed,
              !isMutating,
              let url = URL(string: "\(baseURL)/api/mobile/capture/today") else {
            errorMessage = "Reconnect to Nest before editing this task. The protected snapshot was not modified."
            return false
        }

        isMutating = true
        defer { isMutating = false }
        errorMessage = nil
        do {
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            var requestBody: [String: Any] = [
                "action": "task-edit",
                "id": task.id,
                "expectedUpdatedAt": task.updatedAt,
                "title": normalizedTitle,
                "detail": normalizedDetail,
                "timezone": timezone,
            ]
            let requestedDueLocal = dueAt.map {
                Self.localTaskDateString($0, timezone: timezone)
            }
            requestBody["dueLocal"] = requestedDueLocal ?? NSNull()
            request.httpBody = try JSONSerialization.data(withJSONObject: requestBody)
            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            let payload = try JSONDecoder().decode(MobileCaptureTodayMutationResponse.self, from: data)
            guard response.statusCode < 400, payload.ok else {
                throw NSError(
                    domain: "CaptureToday",
                    code: response.statusCode,
                    userInfo: [NSLocalizedDescriptionKey: payload.error ?? "This task could not be edited."]
                )
            }
            let acknowledgedDueLocal = payload.dueAt
                .flatMap(Self.isoDate)
                .map { Self.localTaskDateString($0, timezone: timezone) }
            guard payload.action == "task-edit",
                  payload.id == task.id,
                  payload.title == normalizedTitle,
                  payload.detail == (normalizedDetail.isEmpty ? nil : normalizedDetail),
                  acknowledgedDueLocal == requestedDueLocal,
                  payload.updatedAt != nil,
                  payload.receiptId != nil else {
                throw NSError(
                    domain: "CaptureToday",
                    code: 409,
                    userInfo: [NSLocalizedDescriptionKey: "Nest returned a different task edit acknowledgement. Refresh before trying again."]
                )
            }
            await load()
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func editGoal(
        _ goal: MobileCaptureTodayGoal,
        title: String,
        description: String,
        targetDecision: String,
        targetAt: Date?,
        timezone: String
    ) async -> Bool {
        guard goal.status == "ACTIVE" || goal.status == "PAUSED" else {
            errorMessage = "Make this goal active or paused before editing its definition or target."
            return false
        }
        let normalizedTitle = Self.normalizedTaskText(title)
        let normalizedDescription = Self.normalizedTaskText(description)
        let allowedTargetDecisions = Set(["KEEP", "SET", "CLEAR"])
        guard !normalizedTitle.isEmpty,
              normalizedTitle.count <= 500,
              normalizedDescription.count <= 5_000,
              allowedTargetDecisions.contains(targetDecision),
              targetDecision == "SET" ? TimeZone(identifier: timezone) != nil && targetAt != nil : targetAt == nil else {
            errorMessage = "Add a goal title under 500 characters, keep its definition under 5,000 characters, and choose a valid timezone."
            return false
        }
        guard !isUsingProtectedCache,
              AuthManager.shared.networkActionsAllowed,
              !isMutating,
              let url = URL(string: "\(baseURL)/api/mobile/capture/today") else {
            errorMessage = "Reconnect to Nest before editing this goal. The protected snapshot was not modified."
            return false
        }

        isMutating = true
        defer { isMutating = false }
        errorMessage = nil
        do {
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            var requestBody: [String: Any] = [
                "action": "goal-edit",
                "id": goal.id,
                "expectedUpdatedAt": goal.updatedAt,
                "title": normalizedTitle,
                "description": normalizedDescription,
                "targetDecision": targetDecision,
                "timezone": timezone,
            ]
            let requestedTargetLocalDate = targetDecision == "SET" ? targetAt.map {
                Self.localGoalDateString($0, timezone: timezone)
            } : nil
            requestBody["targetLocalDate"] = requestedTargetLocalDate ?? NSNull()
            request.httpBody = try JSONSerialization.data(withJSONObject: requestBody)
            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            let payload = try JSONDecoder().decode(MobileCaptureTodayMutationResponse.self, from: data)
            guard response.statusCode < 400, payload.ok else {
                throw NSError(
                    domain: "CaptureToday",
                    code: response.statusCode,
                    userInfo: [NSLocalizedDescriptionKey: payload.error ?? "This goal could not be edited."]
                )
            }
            let acknowledgedTarget = payload.targetAt.flatMap(Self.isoDate)
            let targetAcknowledged: Bool
            switch targetDecision {
            case "KEEP":
                let originalTarget = goal.targetAt.flatMap(Self.isoDate)
                targetAcknowledged = acknowledgedTarget == originalTarget
            case "CLEAR":
                targetAcknowledged = acknowledgedTarget == nil
            default:
                let acknowledgedTargetLocalDate = acknowledgedTarget.map {
                    Self.localGoalDateString($0, timezone: timezone)
                }
                targetAcknowledged = acknowledgedTargetLocalDate == requestedTargetLocalDate
            }
            guard payload.action == "goal-edit",
                  payload.id == goal.id,
                  payload.title == normalizedTitle,
                  payload.description == (normalizedDescription.isEmpty ? nil : normalizedDescription),
                  targetAcknowledged,
                  payload.updatedAt != nil,
                  payload.receiptId != nil else {
                throw NSError(
                    domain: "CaptureToday",
                    code: 409,
                    userInfo: [NSLocalizedDescriptionKey: "Nest returned a different goal edit acknowledgement. Refresh before trying again."]
                )
            }
            await load()
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func setRecurrenceStatus(_ recurrence: MobileCaptureTodayRecurrence, status: String) async -> Bool {
        await mutate(action: "recurrence-status", id: recurrence.seriesId, nextStatus: status, expectedUpdatedAt: recurrence.updatedAt)
    }

    func editRecurrence(
        _ task: MobileCaptureTodayTask,
        scope: String,
        title: String,
        detail: String,
        recurrence: MobileQuickEntryRecurrence?,
        clientRequestID: UUID
    ) async -> Bool {
        guard let current = task.recurrence else {
            errorMessage = "This task is not attached to a repeat."
            return false
        }
        var fields: [String: Any] = [
            "scope": scope,
            "title": title,
            "detail": detail,
            "seriesId": current.seriesId,
            "expectedSeriesUpdatedAt": current.updatedAt,
            "clientRequestId": clientRequestID.uuidString.lowercased(),
        ]
        if let recurrence {
            fields["recurrence"] = [
                "cadence": recurrence.cadence,
                "frequency": recurrence.frequency,
                "interval": recurrence.interval,
                "timezone": recurrence.timezone,
                "localTimeMinutes": recurrence.localTimeMinutes,
                "anchorLocalDate": recurrence.anchorLocalDate,
            ]
        }
        return await mutate(
            action: "recurrence-edit",
            id: task.id,
            nextStatus: nil,
            expectedUpdatedAt: task.updatedAt,
            additionalFields: fields
        )
    }

    func setFocusStatus(_ block: MobileCaptureTodayFocusBlock, status: String, actualMinutes: Int? = nil) async -> Bool {
        do {
            let decision = try focusDecisionOutbox.enqueue(
                blockID: block.id,
                nextStatus: status,
                actualMinutes: actualMinutes,
                expectedUpdatedAt: block.updatedAt
            )
            publishFocusDecisionCounts()
            guard AuthManager.shared.networkActionsAllowed else {
                errorMessage = "Actual time is protected on this iPhone and queued for Nest. The linked task and goal remain unchanged."
                return true
            }
            isMutating = true
            defer { isMutating = false }
            let synchronized = await syncFocusDecision(decision)
            if synchronized {
                errorMessage = nil
                await load()
            }
            // The durable phone ledger is the offline success boundary even
            // when delivery is retryable or held for conflict review.
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func planFocusBlock(
        for task: MobileCaptureTodayTask,
        startsAt: Date,
        durationMinutes: Int
    ) async -> Bool {
        guard task.status == "OPEN" else {
            errorMessage = "Choose an open committed task before planning focus time."
            return false
        }
        guard brief?.boundaries?.focusBlockPlanningAvailable == true else {
            errorMessage = "This Nest does not yet advertise safe iPhone focus planning."
            return false
        }
        let timezone = TimeZone.current.identifier
        do {
            let plan = try focusPlanOutbox.enqueue(
                taskID: task.id,
                startsAtLocal: Self.localTaskDateString(startsAt, timezone: timezone),
                durationMinutes: durationMinutes,
                timezone: timezone,
                expectedTaskUpdatedAt: task.updatedAt
            )
            publishFocusPlanCounts()
            guard AuthManager.shared.networkActionsAllowed else {
                errorMessage = "Focus plan protected on this iPhone and queued for Nest. No deadline, reminder, appointment, or external calendar changed."
                return true
            }
            isMutating = true
            defer { isMutating = false }
            let synchronized = await syncFocusPlan(plan)
            if synchronized {
                errorMessage = nil
                await load()
            }
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func retryFocusPlan(for taskID: String) async {
        guard let plan = focusPlanOutbox.plan(forTaskID: taskID) else { return }
        if plan.disposition == .held { focusPlanOutbox.releaseForRetry(plan.id) }
        publishFocusPlanCounts()
        guard AuthManager.shared.networkActionsAllowed else {
            errorMessage = "The focus plan remains protected for retry when Nest reconnects."
            return
        }
        isMutating = true
        defer { isMutating = false }
        _ = await syncFocusPlan(focusPlanOutbox.plan(forTaskID: taskID) ?? plan)
        await load()
    }

    func discardHeldFocusPlan(for taskID: String) async {
        guard let plan = focusPlanOutbox.plan(forTaskID: taskID),
              plan.disposition == .held else { return }
        focusPlanOutbox.markAcknowledged(plan.id)
        publishFocusPlanCounts()
        errorMessage = nil
    }

    func retryFocusDecision(for blockID: String) async {
        guard let decision = focusDecisionOutbox.decision(forBlockID: blockID) else { return }
        if decision.disposition == .held {
            focusDecisionOutbox.releaseForRetry(decision.id)
        }
        publishFocusDecisionCounts()
        guard AuthManager.shared.networkActionsAllowed else {
            errorMessage = "The focus decision remains protected for retry when Nest reconnects."
            return
        }
        isMutating = true
        defer { isMutating = false }
        _ = await syncFocusDecision(focusDecisionOutbox.decision(forBlockID: blockID) ?? decision)
        await load()
    }

    func discardHeldFocusDecision(for blockID: String) async {
        guard let decision = focusDecisionOutbox.decision(forBlockID: blockID),
              decision.disposition == .held else { return }
        focusDecisionOutbox.markAcknowledged(decision.id)
        publishFocusDecisionCounts()
        errorMessage = nil
    }

    func setSourceAnnotationStatus(_ annotation: MobileCaptureTodaySourceAnnotation, status: String) async -> Bool {
        await mutate(action: "source-annotation-status", id: annotation.id, nextStatus: status, expectedUpdatedAt: annotation.updatedAt)
    }

    func startWritingDraft(
        from annotation: MobileCaptureTodaySourceAnnotation
    ) async -> URL? {
        if let existing = writingDraftURL(for: annotation) {
            return existing
        }
        guard annotation.canStartWriting == true,
              brief?.boundaries?.annotationWritingDraftAvailable == true else {
            errorMessage = "This source note is not inside a writable Research Nest."
            return nil
        }
        do {
            let decision = try writingDraftOutbox.enqueue(
                annotationID: annotation.id,
                projectSlug: annotation.projectSlug,
                sourceTitle: annotation.sourceTitle,
                expectedAnnotationUpdatedAt: annotation.updatedAt
            )
            publishWritingDraftDecisionCounts()
            guard AuthManager.shared.networkActionsAllowed else {
                errorMessage = "Private writing handoff protected on this iPhone and queued for Nest."
                return nil
            }
            isMutating = true
            defer { isMutating = false }
            let url = await syncWritingDraftDecision(decision)
            if url != nil {
                errorMessage = nil
                await load()
            }
            return url
        } catch {
            errorMessage = error.localizedDescription
            return nil
        }
    }

    func retryWritingDraft(
        for annotationID: String
    ) async -> URL? {
        guard let decision = writingDraftOutbox.decision(for: annotationID),
              decision.disposition == .held else { return nil }
        writingDraftOutbox.releaseForRetry(decision.id)
        publishWritingDraftDecisionCounts()
        guard AuthManager.shared.networkActionsAllowed else {
            errorMessage = "Writing handoff remains protected for retry when Nest reconnects."
            return nil
        }
        isMutating = true
        defer { isMutating = false }
        let retried = writingDraftOutbox.decision(for: annotationID) ?? decision
        let url = await syncWritingDraftDecision(retried)
        if url != nil {
            errorMessage = nil
            await load()
        }
        return url
    }

    func discardHeldWritingDraft(for annotationID: String) async {
        guard let decision = writingDraftOutbox.decision(for: annotationID),
              decision.disposition == .held else { return }
        writingDraftOutbox.markAcknowledged(decision.id)
        publishWritingDraftDecisionCounts()
        errorMessage = nil
    }

    func recordGoalProgress(_ goal: MobileCaptureTodayGoal, progressPercent: Int, note: String) async -> Bool {
        await mutate(
            action: "goal-progress",
            id: goal.id,
            nextStatus: nil,
            expectedUpdatedAt: goal.updatedAt,
            additionalFields: ["progressPercent": progressPercent, "note": note]
        )
    }

    private func mutate(
        action: String,
        id: String,
        nextStatus: String?,
        expectedUpdatedAt: String,
        additionalFields: [String: Any] = [:]
    ) async -> Bool {
        guard !isUsingProtectedCache,
              AuthManager.shared.networkActionsAllowed,
              !isMutating,
              let url = URL(string: "\(baseURL)/api/mobile/capture/today") else {
            errorMessage = "Reconnect to Nest before changing Today work. The protected snapshot was not modified."
            return false
        }
        isMutating = true
        defer { isMutating = false }
        errorMessage = nil
        do {
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            var requestBody: [String: Any] = ["action": action, "id": id, "expectedUpdatedAt": expectedUpdatedAt]
            if let nextStatus { requestBody["nextStatus"] = nextStatus }
            additionalFields.forEach { requestBody[$0.key] = $0.value }
            request.httpBody = try JSONSerialization.data(withJSONObject: requestBody)
            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            let payload = try JSONDecoder().decode(MobileCaptureTodayMutationResponse.self, from: data)
            guard response.statusCode < 400, payload.ok else {
                throw NSError(domain: "CaptureToday", code: response.statusCode, userInfo: [NSLocalizedDescriptionKey: payload.error ?? "Today work could not be changed."])
            }
            await load()
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    @discardableResult
    private func flushWritingDraftDecisions() async -> Bool {
        guard !isFlushingWritingDraftDecisions,
              AuthManager.shared.networkActionsAllowed else {
            publishWritingDraftDecisionCounts()
            return false
        }
        isFlushingWritingDraftDecisions = true
        defer {
            isFlushingWritingDraftDecisions = false
            publishWritingDraftDecisionCounts()
        }
        var synchronizedAny = false
        for decision in writingDraftOutbox.entries where decision.disposition == .pending {
            if await syncWritingDraftDecision(decision) != nil {
                synchronizedAny = true
            }
        }
        return synchronizedAny
    }

    private func syncWritingDraftDecision(
        _ decision: PendingSourceAnnotationDraftDecision
    ) async -> URL? {
        guard let url = URL(string: "\(baseURL)/api/mobile/capture/today") else {
            return nil
        }
        do {
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: [
                "action": "source-annotation-draft",
                "id": decision.annotationID,
                "projectSlug": decision.projectSlug,
                "clientRequestId": decision.clientRequestID,
                "expectedUpdatedAt": decision.expectedAnnotationUpdatedAt,
            ])
            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            let payload = try JSONDecoder().decode(
                MobileCaptureTodayMutationResponse.self,
                from: data
            )
            guard response.statusCode < 400, payload.ok else {
                let message = payload.error ?? "Nest could not create this private writing draft."
                if response.statusCode == 408 || response.statusCode == 429 || response.statusCode >= 500 {
                    writingDraftOutbox.markRetryable(decision.id, message: message)
                } else {
                    writingDraftOutbox.markHeld(
                        decision.id,
                        code: payload.code,
                        message: message
                    )
                }
                errorMessage = message
                publishWritingDraftDecisionCounts()
                return nil
            }
            guard payload.action == "source-annotation-draft",
                  payload.id == decision.annotationID,
                  payload.clientRequestId == decision.clientRequestID,
                  let documentID = payload.documentId,
                  !documentID.isEmpty,
                  payload.documentStableId?.isEmpty == false,
                  payload.blockId?.isEmpty == false,
                  payload.blockStableId?.isEmpty == false,
                  let responseBlockID = payload.responseBlockId,
                  !responseBlockID.isEmpty,
                  payload.responseBlockStableId?.isEmpty == false,
                  payload.reused != nil,
                  payload.boundaries?.writingDraftPrivate == true,
                  payload.boundaries?.writingDraftSourceMutated == false,
                  payload.boundaries?.writingDraftExternalSideEffects == false,
                  let href = payload.href,
                  let draftURL = safeWritingDraftURL(
                    href: href,
                    expectedProjectSlug: decision.projectSlug,
                    expectedDocumentID: documentID,
                    expectedResponseBlockID: responseBlockID
                  ) else {
                let message = "Nest returned a different draft identity or safety boundary. The protected phone decision is held for review."
                writingDraftOutbox.markHeld(
                    decision.id,
                    code: "ACKNOWLEDGEMENT_MISMATCH",
                    message: message
                )
                errorMessage = message
                publishWritingDraftDecisionCounts()
                return nil
            }
            latestWritingDraftURLs[decision.annotationID] = draftURL
            writingDraftOutbox.markAcknowledged(decision.id)
            publishWritingDraftDecisionCounts()
            return draftURL
        } catch {
            writingDraftOutbox.markRetryable(decision.id, message: error.localizedDescription)
            errorMessage = "Writing handoff remains protected for retry: \(error.localizedDescription)"
            publishWritingDraftDecisionCounts()
            return nil
        }
    }

    private func safeWritingDraftURL(
        href: String,
        expectedProjectSlug: String,
        expectedDocumentID: String?,
        expectedResponseBlockID: String? = nil
    ) -> URL? {
        guard let components = URLComponents(string: href),
              components.scheme == nil,
              components.host == nil,
              components.path == "/create",
              let queryItems = components.queryItems,
              (queryItems.count == 2 || queryItems.count == 3) else { return nil }
        var query: [String: String] = [:]
        for item in queryItems {
            guard let value = item.value, query[item.name] == nil else { return nil }
            query[item.name] = value
        }
        guard query.count == queryItems.count,
              query["project"] == expectedProjectSlug,
              let documentID = query["document"],
              !documentID.isEmpty,
              expectedDocumentID == nil || documentID == expectedDocumentID,
              expectedResponseBlockID == nil || query["block"] == expectedResponseBlockID,
              query.keys.allSatisfy({ ["project", "document", "block"].contains($0) }),
              let nestURL = URL(string: baseURL),
              let absolute = URL(string: href, relativeTo: nestURL)?.absoluteURL,
              absolute.scheme == nestURL.scheme,
              absolute.host == nestURL.host else { return nil }
        return absolute
    }

    private func publishWritingDraftDecisionCounts() {
        pendingWritingDraftDecisionCount = writingDraftOutbox.pendingCount
        heldWritingDraftDecisionCount = writingDraftOutbox.heldCount
    }

    @discardableResult
    private func flushFocusPlans() async -> Bool {
        guard !isFlushingFocusPlans,
              AuthManager.shared.networkActionsAllowed else {
            publishFocusPlanCounts()
            return false
        }
        isFlushingFocusPlans = true
        defer {
            isFlushingFocusPlans = false
            publishFocusPlanCounts()
        }
        var synchronizedAny = false
        for plan in focusPlanOutbox.entries where plan.disposition == .pending {
            if await syncFocusPlan(plan) { synchronizedAny = true }
        }
        return synchronizedAny
    }

    private func syncFocusPlan(_ plan: PendingFocusBlockPlan) async -> Bool {
        guard let url = URL(string: "\(baseURL)/api/mobile/capture/today") else { return false }
        do {
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: [
                "action": "focus-create",
                "id": plan.taskID,
                "startsAtLocal": plan.startsAtLocal,
                "durationMinutes": plan.durationMinutes,
                "timezone": plan.timezone,
                "expectedUpdatedAt": plan.expectedTaskUpdatedAt,
                "clientRequestId": plan.clientRequestID,
            ])
            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            let payload = try JSONDecoder().decode(MobileCaptureTodayMutationResponse.self, from: data)
            guard response.statusCode < 400, payload.ok else {
                let message = payload.error ?? "Nest could not reconcile this focus plan."
                if response.statusCode == 408 || response.statusCode == 429 || response.statusCode >= 500 {
                    focusPlanOutbox.markRetryable(plan.id, message: message)
                } else {
                    focusPlanOutbox.markHeld(plan.id, code: payload.code, message: message)
                }
                errorMessage = message
                publishFocusPlanCounts()
                return false
            }
            guard payload.action == "focus-create",
                  payload.id == plan.taskID,
                  payload.clientRequestId == plan.clientRequestID,
                  payload.planBlockId == plan.projectedPlanBlockID,
                  payload.receiptId == plan.projectedPlanBlockID,
                  payload.startsAt?.isEmpty == false,
                  payload.endsAt?.isEmpty == false,
                  payload.updatedAt?.isEmpty == false,
                  payload.idempotentReplay != nil,
                  payload.boundaries?.focusBlockPlanningAvailable == true,
                  payload.boundaries?.planningFocusBlockMutatesTarget == false,
                  payload.boundaries?.planningFocusBlockCreatesAppointment == false,
                  payload.boundaries?.planningFocusBlockSchedulesReminder == false,
                  payload.boundaries?.externalCalendarMutated == false,
                  payload.boundaries?.providerMutated == false else {
                let message = "Nest returned a different focus-plan identity or safety boundary. The protected phone plan is held for review."
                focusPlanOutbox.markHeld(plan.id, code: "ACKNOWLEDGEMENT_MISMATCH", message: message)
                errorMessage = message
                publishFocusPlanCounts()
                return false
            }
            focusPlanOutbox.markAcknowledged(plan.id)
            publishFocusPlanCounts()
            return true
        } catch {
            focusPlanOutbox.markRetryable(plan.id, message: error.localizedDescription)
            errorMessage = "Focus plan remains protected for retry: \(error.localizedDescription)"
            publishFocusPlanCounts()
            return false
        }
    }

    private func publishFocusPlanCounts() {
        pendingFocusPlanCount = focusPlanOutbox.pendingCount
        heldFocusPlanCount = focusPlanOutbox.heldCount
    }

    @discardableResult
    private func flushFocusDecisions() async -> Bool {
        guard !isFlushingFocusDecisions,
              AuthManager.shared.networkActionsAllowed else {
            publishFocusDecisionCounts()
            return false
        }
        isFlushingFocusDecisions = true
        defer {
            isFlushingFocusDecisions = false
            publishFocusDecisionCounts()
        }
        var synchronizedAny = false
        for decision in focusDecisionOutbox.entries where decision.disposition == .pending {
            if await syncFocusDecision(decision) {
                synchronizedAny = true
            }
        }
        return synchronizedAny
    }

    private func syncFocusDecision(_ decision: PendingFocusBlockDecision) async -> Bool {
        guard let url = URL(string: "\(baseURL)/api/mobile/capture/today") else { return false }
        do {
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            var requestBody: [String: Any] = [
                "action": "focus-status",
                "id": decision.blockID,
                "nextStatus": decision.nextStatus,
                "expectedUpdatedAt": decision.expectedUpdatedAt,
                "clientRequestId": decision.clientRequestID,
            ]
            if let actualMinutes = decision.actualMinutes {
                requestBody["actualMinutes"] = actualMinutes
            }
            request.httpBody = try JSONSerialization.data(withJSONObject: requestBody)
            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            let payload = try JSONDecoder().decode(MobileCaptureTodayMutationResponse.self, from: data)
            guard response.statusCode < 400, payload.ok else {
                let message = payload.error ?? "Nest could not reconcile this focus decision."
                if response.statusCode == 408 || response.statusCode == 429 || response.statusCode >= 500 {
                    focusDecisionOutbox.markRetryable(decision.id, message: message)
                } else {
                    focusDecisionOutbox.markHeld(decision.id, code: payload.code, message: message)
                }
                errorMessage = message
                publishFocusDecisionCounts()
                return false
            }
            guard payload.action == "focus-status",
                  payload.id == decision.blockID,
                  payload.status == decision.nextStatus,
                  payload.actualMinutes == decision.actualMinutes,
                  payload.clientRequestId == decision.clientRequestID,
                  payload.receiptId == "mobile-focus-status-\(decision.clientRequestID)",
                  payload.updatedAt?.isEmpty == false,
                  payload.boundaries?.focusBlockActualTimeExplicitOnly == true,
                  payload.boundaries?.completingFocusBlockMutatesTarget == false,
                  payload.boundaries?.externalCalendarMutated == false else {
                let message = "Nest returned different focus time, identity, or safety boundaries. The protected phone decision is held for review."
                focusDecisionOutbox.markHeld(decision.id, code: "ACKNOWLEDGEMENT_MISMATCH", message: message)
                errorMessage = message
                publishFocusDecisionCounts()
                return false
            }
            focusDecisionOutbox.markAcknowledged(decision.id)
            publishFocusDecisionCounts()
            return true
        } catch {
            focusDecisionOutbox.markRetryable(decision.id, message: error.localizedDescription)
            errorMessage = "Focus decision remains protected for retry: \(error.localizedDescription)"
            publishFocusDecisionCounts()
            return false
        }
    }

    private func publishFocusDecisionCounts() {
        pendingFocusDecisionCount = focusDecisionOutbox.pendingCount
        heldFocusDecisionCount = focusDecisionOutbox.heldCount
    }

    @discardableResult
    private func flushReminderDecisions() async -> Bool {
        guard !isFlushingReminderDecisions,
              AuthManager.shared.networkActionsAllowed else {
            publishReminderDecisionCounts()
            return false
        }
        isFlushingReminderDecisions = true
        defer {
            isFlushingReminderDecisions = false
            publishReminderDecisionCounts()
        }
        var synchronizedAny = false
        for decision in reminderDecisionOutbox.entries where decision.disposition == .pending {
            if await syncReminderDecision(decision) {
                synchronizedAny = true
            }
        }
        return synchronizedAny
    }

    private func syncReminderDecision(_ decision: PendingTaskReminderDecision) async -> Bool {
        guard let url = URL(string: "\(baseURL)/api/mobile/capture/today") else { return false }
        do {
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            var body: [String: Any] = [
                "action": "task-reminder",
                "id": decision.taskID,
                "timezone": decision.timezone,
                "expectedUpdatedAt": decision.expectedTaskUpdatedAt,
                "clientRequestId": decision.clientRequestID,
            ]
            body["remindAtLocal"] = decision.requestedLocalDateTime ?? NSNull()
            body["expectedReminderUpdatedAt"] = decision.expectedReminderUpdatedAt ?? NSNull()
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            let payload = try JSONDecoder().decode(MobileCaptureTodayMutationResponse.self, from: data)
            guard response.statusCode < 400, payload.ok else {
                let message = payload.error ?? "Nest could not reconcile this reminder change."
                if response.statusCode == 408 || response.statusCode == 429 || response.statusCode >= 500 {
                    reminderDecisionOutbox.markRetryable(decision.id, message: message)
                } else {
                    reminderDecisionOutbox.markHeld(decision.id, code: payload.code, message: message)
                }
                errorMessage = message
                publishReminderDecisionCounts()
                return false
            }
            guard let canonical = payload.reminder?.canonicalProjection,
                  canonical.id == decision.projectedReminderID,
                  canonical.actionItemID == decision.taskID,
                  (decision.remindAt == nil
                    ? canonical.status == "CANCELED"
                    : canonical.status == "ACTIVE"
                        && abs(canonical.remindAt.timeIntervalSince(decision.remindAt!)) < 0.5) else {
                let message = "Nest returned a different reminder identity or time. The protected phone decision is held for review."
                reminderDecisionOutbox.markHeld(decision.id, code: "ACKNOWLEDGEMENT_MISMATCH", message: message)
                errorMessage = message
                publishReminderDecisionCounts()
                return false
            }
            await TaskReminderScheduler.shared.reconcileCanonical(
                intents: [canonical],
                projectionComplete: false
            )
            reminderDecisionOutbox.markAcknowledged(decision.id)
            publishReminderDecisionCounts()
            return true
        } catch {
            reminderDecisionOutbox.markRetryable(decision.id, message: error.localizedDescription)
            errorMessage = "Reminder change remains protected for retry: \(error.localizedDescription)"
            publishReminderDecisionCounts()
            return false
        }
    }

    private func publishReminderDecisionCounts() {
        pendingReminderDecisionCount = reminderDecisionOutbox.pendingCount
        heldReminderDecisionCount = reminderDecisionOutbox.heldCount
    }

    @discardableResult
    private func flushWorkTagDecisions() async -> Bool {
        guard !isFlushingWorkTagDecisions,
              AuthManager.shared.networkActionsAllowed else {
            publishWorkTagDecisionCounts()
            return false
        }
        isFlushingWorkTagDecisions = true
        defer {
            isFlushingWorkTagDecisions = false
            publishWorkTagDecisionCounts()
        }
        var synchronizedAny = false
        for decision in workTagDecisionOutbox.entries where decision.disposition == .pending {
            if await syncWorkTagDecision(decision) {
                synchronizedAny = true
            }
        }
        return synchronizedAny
    }

    private func syncWorkTagDecision(_ decision: PendingWorkTagDecision) async -> Bool {
        guard let url = URL(string: "\(baseURL)/api/work/tags") else { return false }
        do {
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            var body: [String: Any] = [
                "entityKind": decision.entityKind.rawValue,
                "entityId": decision.entityID,
                "tagIds": decision.tagIDs,
                "newTagLabels": decision.requestedNewTagLabels,
                "expectedUpdatedAt": decision.expectedUpdatedAt,
                "clientRequestId": decision.clientRequestID,
            ]
            if let expectedTagRevision = decision.expectedTagRevision {
                body["expectedTagRevision"] = expectedTagRevision
            }
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            let payload = try JSONDecoder().decode(MobileCaptureWorkTagMutationResponse.self, from: data)
            guard response.statusCode < 400, payload.ok else {
                let message = payload.error ?? "Nest could not reconcile this tag change."
                if response.statusCode == 408 || response.statusCode == 429 || response.statusCode >= 500 {
                    workTagDecisionOutbox.markRetryable(decision.id, message: message)
                } else {
                    workTagDecisionOutbox.markHeld(decision.id, code: payload.code, message: message)
                }
                errorMessage = message
                publishWorkTagDecisionCounts()
                return false
            }
            let documentRevisionMatches: Bool = {
                guard decision.entityKind == .document else { return true }
                guard let expectedTagRevision = decision.expectedTagRevision,
                      let acknowledgedTagRevision = payload.tagRevision else {
                    return false
                }
                return acknowledgedTagRevision == expectedTagRevision
                    || acknowledgedTagRevision == expectedTagRevision + 1
            }()
            let resolvedTags = payload.resolvedTags ?? []
            let acknowledgedFinalTagIDs = Set(payload.tagIds ?? [])
            let expectedFinalTagIDs = Set(decision.tagIDs + resolvedTags.map(\.id))
            guard payload.entityKind == decision.entityKind.rawValue,
                  payload.entityId == decision.entityID,
                  payload.projectId == decision.projectID,
                  payload.requestedTagIds?.sorted() == decision.tagIDs,
                  payload.newTagLabels == decision.requestedNewTagLabels,
                  resolvedTags.count == decision.requestedNewTagLabels.count,
                  resolvedTags.map(\.requestedLabel) == decision.requestedNewTagLabels,
                  !resolvedTags.contains(where: {
                      $0.id.isEmpty || $0.requestedLabel.isEmpty || $0.label.isEmpty || $0.slug.isEmpty
                  }),
                  acknowledgedFinalTagIDs == expectedFinalTagIDs,
                  documentRevisionMatches,
                  payload.receiptId == "work-tags-\(decision.clientRequestID)" else {
                let message = "Nest returned a different tag identity or selection. The protected phone decision is held for review."
                workTagDecisionOutbox.markHeld(decision.id, code: "ACKNOWLEDGEMENT_MISMATCH", message: message)
                errorMessage = message
                publishWorkTagDecisionCounts()
                return false
            }
            workTagDecisionOutbox.markAcknowledged(decision.id)
            publishWorkTagDecisionCounts()
            return true
        } catch {
            workTagDecisionOutbox.markRetryable(decision.id, message: error.localizedDescription)
            errorMessage = "Tag change remains protected for retry: \(error.localizedDescription)"
            publishWorkTagDecisionCounts()
            return false
        }
    }

    private func publishWorkTagDecisionCounts() {
        pendingWorkTagDecisionCount = workTagDecisionOutbox.pendingCount
        heldWorkTagDecisionCount = workTagDecisionOutbox.heldCount
    }

    nonisolated private static func localTaskDateString(_ date: Date, timezone: String) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = TimeZone(identifier: timezone)
        formatter.dateFormat = "yyyy-MM-dd'T'HH:mm"
        return formatter.string(from: date)
    }

    nonisolated private static func localGoalDateString(_ date: Date, timezone: String) -> String {
        String(localTaskDateString(date, timezone: timezone).prefix(10))
    }

    nonisolated private static func normalizedTaskText(_ value: String) -> String {
        value
            .split(whereSeparator: \.isWhitespace)
            .joined(separator: " ")
    }

    nonisolated private static func isoDate(_ value: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }

    nonisolated private static func localReminderString(_ date: Date, timezone: String) -> String {
        localTaskDateString(date, timezone: timezone)
    }

    static func clearProtectedCache() {
        guard let url = protectedCacheURL() else { return }
        try? FileManager.default.removeItem(at: url)
    }

    private func restoreProtectedCache() -> Bool {
        guard let ownerEmail = AuthManager.shared.userEmail?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
              !ownerEmail.isEmpty,
              let url = Self.protectedCacheURL(),
              let data = try? Data(contentsOf: url, options: .mappedIfSafe) else { return false }
        do {
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            let cache = try decoder.decode(ProtectedCache.self, from: data)
            guard cache.schemaVersion == 1, cache.ownerEmail == ownerEmail, Date().timeIntervalSince(cache.savedAt) <= 30 * 24 * 60 * 60 else {
                Self.clearProtectedCache()
                return false
            }
            brief = cache.brief
            isUsingProtectedCache = true
            return true
        } catch {
            // A protected file can be temporarily unavailable while iOS is
            // transitioning lock state. Keep the last known-good snapshot so
            // the next unlocked launch can try it again.
            return false
        }
    }

    private func persist(_ brief: MobileCaptureTodayResponse) {
        guard AuthManager.shared.networkActionsAllowed,
              let ownerEmail = AuthManager.shared.userEmail?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
              !ownerEmail.isEmpty,
              let url = Self.protectedCacheURL() else { return }
        do {
            try FileManager.default.createDirectory(
                at: url.deletingLastPathComponent(),
                withIntermediateDirectories: true,
                attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication]
            )
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            encoder.outputFormatting = [.sortedKeys]
            try encoder.encode(
                ProtectedCache(schemaVersion: 1, ownerEmail: ownerEmail, savedAt: Date(), brief: brief)
            ).write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            var values = URLResourceValues()
            values.isExcludedFromBackup = true
            var mutableURL = url
            try mutableURL.setResourceValues(values)
        } catch {
            print("Protected Today cache could not be updated: \(error.localizedDescription)")
        }
    }

    nonisolated private static func protectedCacheURL() -> URL? {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?
            .appendingPathComponent("QuipslyCapture/ProtectedTodayCache", isDirectory: true)
            .appendingPathComponent("mobile-today-v1.json")
    }
}

@MainActor
final class CaptureCalendarSubscriptionClient: ObservableObject {
    @Published private(set) var feeds: [MobileCalendarFeedStatus] = []
    @Published private(set) var oneTimeFeed: MobileCalendarFeedCreated?
    @Published private(set) var googleConnection: MobileGoogleCalendarConnectionSnapshot?
    @Published private(set) var googleSelections: [MobileGoogleCalendarSelectionSnapshot] = []
    @Published private(set) var hasLoadedGoogleSummary = false
    @Published private(set) var isLoading = false
    @Published private(set) var isMutating = false
    @Published var statusMessage: String?
    @Published var errorMessage: String?
    @Published var googleErrorMessage: String?

    private struct MutationRequest: Encodable {
        let purpose: String
        let timezone: String?
        let projectId: String?
        let displayName: String?
    }

    private let baseURL = normalizedNestBaseURL(
        Bundle.main.object(forInfoDictionaryKey: "QUIPSLY_API_BASE_URL") as? String
            ?? "https://nest.quipsly.com"
    )

    var googleCalendarManagementURL: URL? {
        URL(string: "\(baseURL)/schedule#google-calendar-connection-heading")
    }

    func activeFeed(
        purpose: MobileCalendarFeedPurpose,
        projectID: String? = nil
    ) -> MobileCalendarFeedStatus? {
        feeds.first {
            $0.status.uppercased() == "ACTIVE"
                && $0.purpose == purpose
                && (purpose != .podcastProduction || $0.projectId == projectID)
        }
    }

    func loadPreview() {
        let now = ISO8601DateFormatter().string(from: Date())
        feeds = [
            MobileCalendarFeedStatus(
                id: "preview-personal-calendar",
                purpose: .personalCommitments,
                displayName: "My commitments",
                projectId: nil,
                status: "ACTIVE",
                createdAt: now,
                revokedAt: nil,
                lastGeneratedAt: now,
                subscriptionUrlRecoverable: false
            ),
            MobileCalendarFeedStatus(
                id: "preview-coaching-calendar",
                purpose: .coaching,
                displayName: "My coaching sessions",
                projectId: nil,
                status: "ACTIVE",
                createdAt: now,
                revokedAt: nil,
                lastGeneratedAt: nil,
                subscriptionUrlRecoverable: false
            ),
        ]
        oneTimeFeed = nil
        googleConnection = nil
        googleSelections = []
        hasLoadedGoogleSummary = true
        statusMessage = "Preview subscriptions are read-only. No private link was created or exposed."
        errorMessage = nil
        googleErrorMessage = nil
    }

    func load() async {
        guard !isLoading else { return }
        isLoading = true
        defer { isLoading = false }
        async let feedLoad: Void = loadFeeds()
        async let googleLoad: Void = loadGoogleCalendarSummary()
        _ = await (feedLoad, googleLoad)
    }

    func refreshGoogleCalendarSummary() async {
        guard !isLoading, !isMutating else { return }
        await loadGoogleCalendarSummary()
    }

    private func loadFeeds() async {
        guard let url = URL(string: "\(baseURL)/api/calendar/feeds") else { return }
        errorMessage = nil
        do {
            var request = URLRequest(url: url)
            request.cachePolicy = .reloadIgnoringLocalCacheData
            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            let payload = try JSONDecoder().decode(MobileCalendarFeedListResponse.self, from: data)
            guard response.statusCode < 400, payload.ok else {
                throw NSError(
                    domain: "CaptureCalendarSubscriptions",
                    code: response.statusCode,
                    userInfo: [NSLocalizedDescriptionKey: payload.error ?? "Calendar subscriptions could not be loaded."]
                )
            }
            feeds = payload.feeds ?? []
        } catch {
            errorMessage = "Calendar subscriptions are unavailable: \(error.localizedDescription)"
        }
    }

    private func loadGoogleCalendarSummary() async {
        guard let url = URL(
            string: "\(baseURL)/api/calendar/connections/google?view=summary"
        ) else { return }
        googleErrorMessage = nil
        defer { hasLoadedGoogleSummary = true }
        do {
            var request = URLRequest(url: url)
            request.cachePolicy = .reloadIgnoringLocalCacheData
            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            let payload = try JSONDecoder().decode(
                MobileGoogleCalendarSummaryResponse.self,
                from: data
            )
            guard response.statusCode < 400, payload.ok else {
                throw NSError(
                    domain: "CaptureGoogleCalendarSummary",
                    code: response.statusCode,
                    userInfo: [
                        NSLocalizedDescriptionKey:
                            payload.error ?? "Google Calendar status could not be loaded."
                    ]
                )
            }
            googleConnection = payload.connection
            googleSelections = payload.selections ?? []
        } catch {
            googleErrorMessage = "Google Calendar status is unavailable: \(error.localizedDescription)"
        }
    }

    @discardableResult
    func rotate(
        purpose: MobileCalendarFeedPurpose,
        projectID: String? = nil,
        displayName: String? = nil
    ) async -> Bool {
        guard !isMutating, AuthManager.shared.networkActionsAllowed,
              let url = URL(string: "\(baseURL)/api/calendar/feeds") else {
            errorMessage = "Reconnect to Nest before changing a calendar subscription."
            return false
        }
        if purpose == .podcastProduction,
           projectID?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty != false {
            errorMessage = "Choose a podcast Nest before creating its calendar subscription."
            return false
        }
        isMutating = true
        oneTimeFeed = nil
        statusMessage = nil
        errorMessage = nil
        defer { isMutating = false }
        do {
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(
                MutationRequest(
                    purpose: purpose.rawValue,
                    timezone: TimeZone.current.identifier,
                    projectId: purpose == .podcastProduction ? projectID : nil,
                    displayName: displayName
                )
            )
            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            let payload = try JSONDecoder().decode(MobileCalendarFeedMutationResponse.self, from: data)
            guard response.statusCode < 400, payload.ok, let feed = payload.feed else {
                throw NSError(
                    domain: "CaptureCalendarSubscriptions",
                    code: response.statusCode,
                    userInfo: [NSLocalizedDescriptionKey: payload.error ?? "The private calendar link could not be created."]
                )
            }
            oneTimeFeed = feed
            statusMessage = "Private link created. Add or share it now; Quipsly stores only its digest and cannot show this exact link again."
            await load()
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    @discardableResult
    func revoke(
        purpose: MobileCalendarFeedPurpose,
        projectID: String? = nil
    ) async -> Bool {
        guard !isMutating, AuthManager.shared.networkActionsAllowed,
              let url = URL(string: "\(baseURL)/api/calendar/feeds") else {
            errorMessage = "Reconnect to Nest before revoking a calendar subscription."
            return false
        }
        isMutating = true
        statusMessage = nil
        errorMessage = nil
        defer { isMutating = false }
        do {
            var request = URLRequest(url: url)
            request.httpMethod = "DELETE"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(
                MutationRequest(
                    purpose: purpose.rawValue,
                    timezone: nil,
                    projectId: purpose == .podcastProduction ? projectID : nil,
                    displayName: nil
                )
            )
            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            let payload = try JSONDecoder().decode(MobileCalendarFeedMutationResponse.self, from: data)
            guard response.statusCode < 400, payload.ok else {
                throw NSError(
                    domain: "CaptureCalendarSubscriptions",
                    code: response.statusCode,
                    userInfo: [NSLocalizedDescriptionKey: payload.error ?? "The calendar subscription could not be revoked."]
                )
            }
            if oneTimeFeed?.purpose == purpose { oneTimeFeed = nil }
            statusMessage = (payload.revoked ?? 0) > 0
                ? "Subscription revoked. The old private link now returns not found."
                : "No active subscription needed revocation."
            await load()
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func dismissOneTimeFeed() {
        oneTimeFeed = nil
    }
}

@MainActor
final class CaptureWorkClient: ObservableObject {
    @Published private(set) var brief: MobileCaptureWorkResponse?
    @Published private(set) var isLoading = false
    @Published private(set) var isCreatingProject = false
    @Published private(set) var isUsingProtectedCache = false
    @Published private(set) var isSyncingDocumentNoteEdits = false
    @Published private(set) var isMutatingTagVocabulary = false
    @Published private(set) var pendingDocumentNoteEditCount = 0
    @Published private(set) var heldDocumentNoteEditCount = 0
    @Published var documentNoteEditMessage: String?
    @Published var tagVocabularyMessage: String?
    @Published var errorMessage: String?

    private let baseURL = normalizedNestBaseURL(Bundle.main.object(forInfoDictionaryKey: "QUIPSLY_API_BASE_URL") as? String ?? "https://nest.quipsly.com")
    private let documentNoteEditOutbox = DocumentNoteEditOutbox.shared

    private struct ProtectedCache: Codable {
        let schemaVersion: Int
        let ownerEmail: String
        let savedAt: Date
        let brief: MobileCaptureWorkResponse
    }

    var projects: [MobileCaptureWorkProject] { brief?.projects ?? [] }
    var workspace: MobileCaptureWorkWorkspace? { brief?.workspace }
    var selectedProjectID: String? { brief?.selectedProjectId }

    func pendingDocumentNoteEdit(for noteID: String) -> PendingDocumentNoteEdit? {
        documentNoteEditOutbox.edit(for: noteID)
    }

    @discardableResult
    func saveDocumentNoteEdit(
        note: MobileCaptureWorkNote,
        projectID: String,
        title: String,
        blocks: [MobileCaptureWorkNoteBlock],
        replacingHeld: Bool
    ) -> Bool {
        if note.id.hasPrefix("preview-") {
            documentNoteEditMessage = "Preview only — no canonical document note or revision was changed."
            return true
        }
        guard note.canEditContent == true,
              let expectedContentRevision = note.contentRevision,
              expectedContentRevision.count == 64,
              let canonicalBlocks = note.blocks,
              !canonicalBlocks.isEmpty,
              canonicalBlocks.map(\.id) == blocks.map(\.id) else {
            errorMessage = "Refresh this project note before protecting an edit."
            return false
        }
        let normalizedTitle = title
            .split(whereSeparator: \.isWhitespace)
            .joined(separator: " ")
        let normalizedBlocks = blocks.map {
            MobileCaptureWorkNoteBlock(
                id: $0.id,
                stableId: $0.stableId,
                order: $0.order,
                body: $0.body
                    .replacingOccurrences(of: "\r\n", with: "\n")
                    .replacingOccurrences(of: "\r", with: "\n")
            )
        }
        guard normalizedTitle != note.title
                || normalizedBlocks.map(\.body) != canonicalBlocks.map(\.body) else {
            errorMessage = "Change the note title or body before saving."
            return false
        }
        do {
            let edit = try documentNoteEditOutbox.enqueue(
                projectID: projectID,
                noteID: note.id,
                title: normalizedTitle,
                blocks: normalizedBlocks,
                expectedContentRevision: expectedContentRevision,
                replacingHeld: replacingHeld
            )
            publishDocumentNoteEditCounts()
            documentNoteEditMessage = "The complete note edit is protected on this iPhone. Nest will recheck access, stable blocks, anchors, and the exact content revision before applying it."
            Task { [weak self] in
                await self?.syncDocumentNoteEdit(edit, refreshWork: true)
            }
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func retryDocumentNoteEdits() async {
        let synchronized = await flushDocumentNoteEdits()
        if synchronized {
            await load(projectID: selectedProjectID)
        } else if let held = documentNoteEditOutbox.entries.first(where: { $0.disposition == .held }) {
            documentNoteEditMessage = held.lastErrorMessage
                ?? "A protected project-note edit needs review beside Nest's current revision."
        } else if documentNoteEditOutbox.pendingCount == 0 {
            documentNoteEditMessage = "No protected project-note edits need retry."
        }
    }

    func discardDocumentNoteEdit(noteID: String) async {
        documentNoteEditOutbox.discard(noteID: noteID)
        publishDocumentNoteEditCounts()
        documentNoteEditMessage = "The protected iPhone draft was discarded. The canonical Nest note was not changed."
        await load(projectID: selectedProjectID)
    }

    func createProject(
        name: String,
        nestKind: String,
        description: String,
        clientRequestID: UUID
    ) async -> MobileCaptureCreatedProject? {
        guard !isCreatingProject,
              !isUsingProtectedCache,
              AuthManager.shared.networkActionsAllowed,
              let url = URL(string: "\(baseURL)/api/mobile/capture/projects") else {
            errorMessage = "Reconnect to Nest before creating a canonical project."
            return nil
        }
        isCreatingProject = true
        defer { isCreatingProject = false }
        errorMessage = nil

        do {
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: [
                "name": name,
                "nestKind": nestKind,
                "description": description,
                "clientRequestId": clientRequestID.uuidString.lowercased(),
            ])
            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            let payload = try JSONDecoder().decode(MobileCaptureProjectCreateResponse.self, from: data)
            guard response.statusCode < 400,
                  payload.ok,
                  payload.schema == "quipsly-mobile-project-create-v1",
                  let project = payload.project,
                  project.role == "OWNER",
                  project.canWrite,
                  !project.id.isEmpty,
                  !project.slug.isEmpty else {
                throw NSError(
                    domain: "CaptureWork",
                    code: response.statusCode,
                    userInfo: [NSLocalizedDescriptionKey: payload.error ?? "The project could not be created safely."]
                )
            }
            await load(projectID: project.id)
            guard selectedProjectID == project.id else {
                throw NSError(
                    domain: "CaptureWork",
                    code: 409,
                    userInfo: [NSLocalizedDescriptionKey: "Nest created the project, but the canonical Work readback did not select the same identity."]
                )
            }
            return project
        } catch {
            errorMessage = error.localizedDescription
            return nil
        }
    }

    @discardableResult
    func createTagVocabulary(
        projectID: String,
        label: String
    ) async -> Bool {
        guard !isMutatingTagVocabulary else { return false }
        guard !projectID.hasPrefix("preview-") else {
            tagVocabularyMessage = "Preview only — no canonical tag or assignment was created."
            return false
        }
        guard !isUsingProtectedCache,
              AuthManager.shared.networkActionsAllowed,
              workspace?.project.id == projectID,
              workspace?.project.canWrite == true,
              brief?.boundaries?.onlineVocabularyManagement == true else {
            tagVocabularyMessage = "Reconnect to Nest before creating shared vocabulary. This change requires a live editor grant and is never queued offline."
            return false
        }
        let normalizedLabel = label
            .precomposedStringWithCompatibilityMapping
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(
                of: #"^#+\s*"#,
                with: "",
                options: .regularExpression
            )
            .replacingOccurrences(
                of: #"\s+"#,
                with: " ",
                options: .regularExpression
            )
        guard !normalizedLabel.isEmpty,
              normalizedLabel.utf16.count <= 80,
              let url = URL(string: "\(baseURL)/api/work/tags") else {
            tagVocabularyMessage = "Enter a reusable tag name of 80 characters or fewer."
            return false
        }

        isMutatingTagVocabulary = true
        defer { isMutatingTagVocabulary = false }
        errorMessage = nil
        tagVocabularyMessage = nil

        do {
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: [
                "operation": "CREATE",
                "projectId": projectID,
                "label": normalizedLabel,
            ])
            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            let payload = try JSONDecoder().decode(
                MobileCaptureWorkTagCreateResponse.self,
                from: data
            )
            guard response.statusCode < 400,
                  payload.ok,
                  payload.projectId == projectID,
                  let savedTag = payload.tag,
                  savedTag.isActive,
                  !savedTag.id.isEmpty,
                  !savedTag.label.isEmpty,
                  !savedTag.slug.isEmpty,
                  payload.created != nil else {
                tagVocabularyMessage = payload.error
                    ?? "Nest did not acknowledge this canonical tag. Refresh before trying again."
                if response.statusCode == 409 {
                    await load(projectID: selectedProjectID)
                }
                return false
            }
            if payload.created == true {
                guard let receiptID = payload.receiptId,
                      !receiptID.isEmpty,
                      payload.revision == 1 else {
                    tagVocabularyMessage = "Nest created a tag without complete history evidence. Refresh before using it."
                    await load(projectID: projectID)
                    return false
                }
                tagVocabularyMessage = "Created #\(savedTag.label) in \(workspace?.project.name ?? "this Nest"). It is not attached to any record until you choose it."
            } else {
                tagVocabularyMessage = "Reused existing #\(savedTag.label). No duplicate tag or record assignment was created."
            }
            await load(projectID: projectID)
            return true
        } catch {
            tagVocabularyMessage = "Nest could not verify this vocabulary creation. Nothing is queued offline and no assignment was changed."
            return false
        }
    }

    @discardableResult
    func changeTagVocabulary(
        tag: MobileCaptureWorkTag,
        operation: String,
        label: String? = nil
    ) async -> Bool {
        let canonicalOperation = operation.uppercased()
        guard !isMutatingTagVocabulary else { return false }
        guard !tag.id.hasPrefix("preview-") else {
            tagVocabularyMessage = "Preview only — no canonical tag or assignment was changed."
            return false
        }
        guard !isUsingProtectedCache,
              AuthManager.shared.networkActionsAllowed,
              workspace?.project.canWrite == true,
              brief?.boundaries?.onlineVocabularyManagement == true else {
            tagVocabularyMessage = "Reconnect to Nest before changing shared vocabulary. These changes require a live revision and are never queued offline."
            return false
        }
        guard tag.mergedInto == nil else {
            tagVocabularyMessage = "This historical name redirects to #\(tag.mergedInto?.label ?? "another tag") and cannot be changed."
            return false
        }
        guard let expectedUpdatedAt = tag.updatedAt, !expectedUpdatedAt.isEmpty else {
            tagVocabularyMessage = "Refresh this project before changing its shared vocabulary."
            return false
        }
        let normalizedLabel = label?
            .split(whereSeparator: \.isWhitespace)
            .joined(separator: " ") ?? ""
        guard ["RENAME", "ARCHIVE", "RESTORE"].contains(canonicalOperation),
              canonicalOperation != "RENAME" || !normalizedLabel.isEmpty,
              let url = URL(string: "\(baseURL)/api/work/tags") else {
            tagVocabularyMessage = "Choose a valid vocabulary change and name."
            return false
        }

        isMutatingTagVocabulary = true
        defer { isMutatingTagVocabulary = false }
        errorMessage = nil
        tagVocabularyMessage = nil

        do {
            var request = URLRequest(url: url)
            request.httpMethod = "PATCH"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            var body: [String: Any] = [
                "tagId": tag.id,
                "operation": canonicalOperation,
                "expectedUpdatedAt": expectedUpdatedAt,
            ]
            if canonicalOperation == "RENAME" {
                body["label"] = normalizedLabel
            }
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            let payload = try JSONDecoder().decode(MobileCaptureWorkTagTaxonomyResponse.self, from: data)
            guard response.statusCode < 400,
                  payload.ok,
                  payload.operation == canonicalOperation,
                  payload.projectId == workspace?.project.id,
                  let savedTag = payload.tag,
                  savedTag.id == tag.id,
                  let receiptID = payload.receiptId,
                  !receiptID.isEmpty else {
                tagVocabularyMessage = payload.error
                    ?? "Nest did not acknowledge this vocabulary change. Refresh before trying again."
                if response.statusCode == 409 {
                    await load(projectID: selectedProjectID)
                }
                return false
            }

            switch canonicalOperation {
            case "RENAME":
                tagVocabularyMessage = "Renamed to #\(savedTag.label). #\(tag.label) remains an alias, so existing links and older language still resolve."
            case "ARCHIVE":
                tagVocabularyMessage = "Archived #\(savedTag.label). Existing assignments remain preserved for history."
            default:
                tagVocabularyMessage = "Restored #\(savedTag.label) to this project's active vocabulary."
            }
            await load(projectID: payload.projectId)
            return true
        } catch {
            tagVocabularyMessage = "Nest could not verify this shared vocabulary change. Nothing is queued offline; refresh and try again."
            return false
        }
    }

    func loadPreview(projectID: String? = nil) {
        let now = ISO8601DateFormatter().string(from: Date())
        let projects = [
            MobileCaptureWorkProject(
                id: "preview-home",
                slug: "preview-home",
                name: "Charlie Home Nest",
                role: "OWNER",
                canWrite: true,
                isHomeNest: true,
                updatedAt: now
            ),
            MobileCaptureWorkProject(
                id: "preview-high-ground",
                slug: "preview-high-ground",
                name: "High Ground Odyssey",
                role: "EDITOR",
                canWrite: true,
                isHomeNest: false,
                updatedAt: now
            ),
        ]
        let selected = projects.first { $0.id == projectID } ?? projects[1]
        let project = MobileCaptureTodayProject(id: selected.id, name: selected.name, slug: selected.slug)
        brief = MobileCaptureWorkResponse(
            ok: true,
            code: nil,
            error: nil,
            workspaceKind: "quipsly-mobile-work-v1-preview",
            generatedAt: now,
            projects: projects,
            selectedProjectId: selected.id,
            workspace: MobileCaptureWorkWorkspace(
                project: selected,
                tasks: [
                    MobileCaptureTodayTask(
                        id: "preview-work-task",
                        title: "Proof-listen the episode opening",
                        detail: "Compare the first two minutes against the corrected transcript.",
                        status: "OPEN",
                        isOverdue: false,
                        dueAt: now,
                        updatedAt: now,
                        roomId: nil,
                        sessionTitle: nil,
                        project: project,
                        canEditTags: true,
                        tagIds: ["preview-episode-4", "preview-proof-listen"],
                        tagLabels: ["Episode 4", "Proof listen"],
                        sourceAnchor: nil,
                        lastMergedTranscriptEvidence: nil,
                        todayReason: nil,
                        recurrence: nil,
                        reminder: nil
                    ),
                    MobileCaptureTodayTask(
                        id: "preview-work-task-complete",
                        title: "Lock the audio spine",
                        detail: nil,
                        status: "COMPLETED",
                        isOverdue: false,
                        dueAt: nil,
                        updatedAt: now,
                        roomId: nil,
                        sessionTitle: nil,
                        project: project,
                        canEditTags: true,
                        tagIds: ["preview-episode-4"],
                        tagLabels: ["Episode 4"],
                        sourceAnchor: nil,
                        lastMergedTranscriptEvidence: nil,
                        todayReason: nil,
                        recurrence: nil,
                        reminder: nil
                    ),
                ],
                goals: [
                    MobileCaptureTodayGoal(
                        id: "preview-work-goal",
                        title: "Publish an episode we trust",
                        description: "Complete the human proof loop before delivery.",
                        status: "ACTIVE",
                        targetAt: nil,
                        progressPercent: 60,
                        progressNote: "The first proof-listen is complete.",
                        updatedAt: now,
                        roomId: nil,
                        sessionTitle: nil,
                        project: project,
                        canEditTags: true,
                        tagIds: ["preview-episode-4"],
                        tagLabels: ["Episode 4"],
                        sourceAnchor: nil,
                        lastMergedTranscriptEvidence: nil
                    ),
                ],
                notes: [
                    MobileCaptureWorkNote(
                        id: "preview-work-note",
                        stableId: "preview-work-note",
                        title: "Opening idea",
                        excerpt: "Begin with the moment the obvious answer stopped being obvious.",
                        tagRevision: 0,
                        updatedAt: now,
                        canEditTags: true,
                        canEditContent: true,
                        contentRevision: String(repeating: "a", count: 64),
                        contentEditBoundary: "Preview only — a real save would update this same private Nest document without sending or publishing anything.",
                        blocks: [
                            MobileCaptureWorkNoteBlock(
                                id: "preview-work-note-body",
                                stableId: "preview-work-note-body",
                                order: 0,
                                body: "Begin with the moment the obvious answer stopped being obvious."
                            ),
                        ],
                        tagIds: ["preview-episode-4"],
                        tagLabels: ["Episode 4"],
                        webPath: "/create?project=preview-high-ground&document=preview-work-note"
                    ),
                ],
                tags: [
                    MobileCaptureWorkTag(
                        id: "preview-episode-4",
                        projectId: selected.id,
                        slug: "episode-4",
                        label: "Episode 4",
                        isActive: true,
                        usageCount: 4,
                        archivedAt: nil,
                        updatedAt: now,
                        mergedInto: nil,
                        aliases: [
                            MobileCaptureWorkTagAlias(
                                id: "preview-alias-episode-four",
                                label: "Episode four",
                                slug: "episode-four"
                            ),
                        ]
                    ),
                    MobileCaptureWorkTag(
                        id: "preview-proof-listen",
                        projectId: selected.id,
                        slug: "proof-listen",
                        label: "Proof listen",
                        isActive: true,
                        usageCount: 1,
                        archivedAt: nil,
                        updatedAt: now,
                        mergedInto: nil,
                        aliases: []
                    ),
                    MobileCaptureWorkTag(
                        id: "preview-retired",
                        projectId: selected.id,
                        slug: "retired",
                        label: "Retired tag",
                        isActive: false,
                        usageCount: 0,
                        archivedAt: now,
                        updatedAt: now,
                        mergedInto: nil,
                        aliases: []
                    ),
                ]
            ),
            boundaries: MobileCaptureWorkBoundaries(
                actorScoped: true,
                ownedGoalsOnly: true,
                explicitProjectGrantRequired: true,
                protectedOfflineSnapshotSupported: true,
                canonicalProjectRecords: true,
                canonicalProjectTags: true,
                onlineVocabularyManagement: true,
                unreviewedTranscriptCandidatesExcluded: true,
                mutationsUseExistingProtectedOutboxes: true,
                sourceMutated: false,
                externalSideEffects: false
            )
        )
        isUsingProtectedCache = false
        errorMessage = nil
    }

    func load(projectID: String? = nil) async {
        guard !isLoading else { return }
        if brief == nil {
            _ = restoreProtectedCache()
        }
        isLoading = true
        defer { isLoading = false }
        errorMessage = nil

        var components = URLComponents(string: "\(baseURL)/api/mobile/capture/work")
        if let projectID, !projectID.isEmpty {
            components?.queryItems = [URLQueryItem(name: "projectId", value: projectID)]
        }
        guard let url = components?.url else {
            errorMessage = "The Nest Work URL is not valid."
            return
        }

        do {
            var request = URLRequest(url: url)
            request.httpMethod = "GET"
            let (data, response) = try await AuthManager.shared.authenticatedData(for: request, allowOfflineRecovery: true)
            let payload = try JSONDecoder().decode(MobileCaptureWorkResponse.self, from: data)
            guard response.statusCode < 400, payload.ok else {
                throw NSError(
                    domain: "CaptureWork",
                    code: response.statusCode,
                    userInfo: [NSLocalizedDescriptionKey: payload.error ?? "Project work could not be loaded."]
                )
            }
            brief = payload
            isUsingProtectedCache = false
            persist(payload)
            publishDocumentNoteEditCounts()
            if await flushDocumentNoteEdits() {
                isLoading = false
                await load(projectID: projectID)
                return
            }
        } catch {
            if brief == nil { _ = restoreProtectedCache() }
            isUsingProtectedCache = brief != nil
            errorMessage = isUsingProtectedCache
                ? "Nest is unavailable. Showing the last protected project snapshot; changes stay disabled until the canonical records can be verified."
                : error.localizedDescription
        }
    }

    @discardableResult
    private func flushDocumentNoteEdits() async -> Bool {
        guard !isSyncingDocumentNoteEdits,
              AuthManager.shared.networkActionsAllowed else {
            publishDocumentNoteEditCounts()
            return false
        }
        let candidates = documentNoteEditOutbox.entries.filter {
            $0.disposition == .pending
        }
        guard !candidates.isEmpty else {
            publishDocumentNoteEditCounts()
            return false
        }
        isSyncingDocumentNoteEdits = true
        defer {
            isSyncingDocumentNoteEdits = false
            publishDocumentNoteEditCounts()
        }
        var synchronizedAny = false
        for edit in candidates {
            if await syncDocumentNoteEdit(edit, refreshWork: false) {
                synchronizedAny = true
            }
        }
        return synchronizedAny
    }

    @discardableResult
    private func syncDocumentNoteEdit(
        _ edit: PendingDocumentNoteEdit,
        refreshWork: Bool
    ) async -> Bool {
        guard documentNoteEditOutbox.entries.contains(where: { $0.id == edit.id }) else {
            return false
        }
        guard AuthManager.shared.networkActionsAllowed else {
            documentNoteEditMessage = "Nest is offline. The complete project-note edit remains protected on this iPhone."
            return false
        }
        let encodedNoteID = edit.noteID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed)
            ?? edit.noteID
        guard let url = URL(string: "\(baseURL)/api/mobile/capture/work/notes/\(encodedNoteID)") else {
            let message = "The configured Nest URL is invalid. The protected note draft remains on this iPhone."
            documentNoteEditOutbox.markHeld(edit.id, code: "BAD_NEST_URL", message: message)
            documentNoteEditMessage = message
            return false
        }

        do {
            var request = URLRequest(url: url)
            request.httpMethod = "PATCH"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(
                MobileCaptureWorkNoteEditRequest(edit: edit)
            )
            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            let payload = try JSONDecoder().decode(
                MobileCaptureWorkNoteEditResponse.self,
                from: data
            )
            if response.statusCode >= 500
                || response.statusCode == 408
                || response.statusCode == 429 {
                let message = payload.error
                    ?? "Nest is temporarily unavailable. The complete note draft remains protected for retry."
                documentNoteEditOutbox.markRetryable(edit.id, message: message)
                documentNoteEditMessage = message
                return false
            }
            guard response.statusCode < 400,
                  payload.ok,
                  payload.schema == "quipsly-mobile-document-note-edit-v1",
                  let saved = payload.note else {
                let message = payload.error
                    ?? "Nest held this note edit. Review the protected iPhone draft beside the canonical note."
                documentNoteEditOutbox.markHeld(edit.id, code: payload.code, message: message)
                documentNoteEditMessage = message
                return false
            }

            let expectedReceipt = Self.documentNoteEditReceiptID(
                ownerID: edit.ownerAccountID,
                noteID: edit.noteID,
                requestID: edit.clientRequestID
            )
            let expectedBlocks = edit.blocks
                .sorted { $0.order == $1.order ? $0.id < $1.id : $0.order < $1.order }
            let acknowledgedBlocks = saved.blocks
                .sorted { $0.order == $1.order ? $0.id < $1.id : $0.order < $1.order }
            let blocksMatch = zip(expectedBlocks, acknowledgedBlocks).allSatisfy { pair in
                pair.0.id == pair.1.id
                    && pair.0.stableId == pair.1.stableId
                    && pair.0.order == pair.1.order
                    && pair.0.body == pair.1.body
            } && expectedBlocks.count == acknowledgedBlocks.count
            guard saved.id == edit.noteID,
                  saved.projectId == edit.projectID,
                  saved.title == edit.title,
                  blocksMatch,
                  saved.contentRevision.range(
                    of: "^[0-9a-f]{64}$",
                    options: .regularExpression
                  ) != nil,
                  payload.receiptId == expectedReceipt else {
                let message = "Nest returned a different note, stable block set, content, or revision receipt. The protected iPhone draft is held for review."
                documentNoteEditOutbox.markHeld(
                    edit.id,
                    code: "DOCUMENT_NOTE_EDIT_ACKNOWLEDGEMENT_MISMATCH",
                    message: message
                )
                documentNoteEditMessage = message
                return false
            }

            documentNoteEditOutbox.markAcknowledged(edit.id)
            publishDocumentNoteEditCounts()
            documentNoteEditMessage = payload.idempotentReplay == true
                ? "Nest already applied this exact protected note edit; no revision was duplicated."
                : "The canonical project note is updated. Stable blocks and safe anchors were preserved; nothing was sent or published."
            if refreshWork {
                await load(projectID: edit.projectID)
            }
            return true
        } catch {
            let message = "\(error.localizedDescription) The complete note draft remains protected for retry."
            documentNoteEditOutbox.markRetryable(edit.id, message: message)
            documentNoteEditMessage = message
            publishDocumentNoteEditCounts()
            return false
        }
    }

    private func publishDocumentNoteEditCounts() {
        pendingDocumentNoteEditCount = documentNoteEditOutbox.pendingCount
        heldDocumentNoteEditCount = documentNoteEditOutbox.heldCount
    }

    nonisolated private static func documentNoteEditReceiptID(
        ownerID: String,
        noteID: String,
        requestID: String
    ) -> String {
        let digest = SHA256.hash(data: Data("\(ownerID)|\(noteID)|\(requestID)".utf8))
            .map { String(format: "%02x", $0) }
            .joined()
            .prefix(32)
        return "document-note-edit-\(digest)"
    }

    static func clearProtectedCache() {
        guard let url = protectedCacheURL() else { return }
        try? FileManager.default.removeItem(at: url)
    }

    private func restoreProtectedCache() -> Bool {
        guard let ownerEmail = AuthManager.shared.userEmail?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased(),
              !ownerEmail.isEmpty,
              let url = Self.protectedCacheURL(),
              let data = try? Data(contentsOf: url, options: .mappedIfSafe) else { return false }
        do {
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            let cache = try decoder.decode(ProtectedCache.self, from: data)
            let age = Date().timeIntervalSince(cache.savedAt)
            guard cache.schemaVersion == 1,
                  cache.ownerEmail == ownerEmail,
                  age >= 0,
                  age <= 30 * 24 * 60 * 60 else {
                Self.clearProtectedCache()
                return false
            }
            brief = cache.brief
            isUsingProtectedCache = true
            return true
        } catch {
            return false
        }
    }

    private func persist(_ brief: MobileCaptureWorkResponse) {
        guard AuthManager.shared.networkActionsAllowed,
              let ownerEmail = AuthManager.shared.userEmail?
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .lowercased(),
              !ownerEmail.isEmpty,
              let url = Self.protectedCacheURL() else { return }
        do {
            try FileManager.default.createDirectory(
                at: url.deletingLastPathComponent(),
                withIntermediateDirectories: true,
                attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication]
            )
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            encoder.outputFormatting = [.sortedKeys]
            try encoder.encode(
                ProtectedCache(schemaVersion: 1, ownerEmail: ownerEmail, savedAt: Date(), brief: brief)
            ).write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            var values = URLResourceValues()
            values.isExcludedFromBackup = true
            var mutableURL = url
            try mutableURL.setResourceValues(values)
        } catch {
            print("Protected Work cache could not be updated: \(error.localizedDescription)")
        }
    }

    nonisolated private static func protectedCacheURL() -> URL? {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?
            .appendingPathComponent("QuipslyCapture/ProtectedWorkCache", isDirectory: true)
            .appendingPathComponent("mobile-work-v1.json")
    }
}

@MainActor
final class CaptureSessionClient: ObservableObject {
    @Published var sessions: [MobileCaptureSession] = []
    @Published var captureProjects: [MobileCaptureProjectDestination] = []
    @Published var status = "Not loaded"
    @Published var errorMessage: String?
    @Published private(set) var isUsingCachedSessions = false
    @Published private(set) var cachedSessionsSavedAt: Date?
    @Published var latestRoomStateResponse: MobileCaptureRoomStateResponse?
    @Published var latestTranscriptRunResponse: MobileCaptureTranscriptRunResponse?
    @Published var latestPacketBuildResponse: MobileCapturePacketBuildResponse?

    private let baseURL = normalizedNestBaseURL(Bundle.main.object(forInfoDictionaryKey: "QUIPSLY_API_BASE_URL") as? String ?? "https://nest.quipsly.com")

    /// Compatibility state for older direct room controls. The production
    /// recorder uses CaptureRoomReceiptStore's protected durable outbox; these
    /// IDs simply keep an ambiguous in-process retry bound to the same request.
    private struct EphemeralRoomStateReceipt {
        let receiptID: UUID
        let captureID: UUID?
        let occurredAt: Date
    }
    private var pendingDirectRoomStateReceipts: [String: EphemeralRoomStateReceipt] = [:]
    private var activeDirectCaptureIDsByRoom: [String: UUID] = [:]

    private struct ProtectedSessionCache: Codable {
        let schemaVersion: Int
        let ownerEmail: String
        let savedAt: Date
        let sessions: [MobileCaptureSession]
        let captureProjects: [MobileCaptureProjectDestination]?
    }

    nonisolated private static let cacheLifetime: TimeInterval = 30 * 24 * 60 * 60
    nonisolated private static let cacheDirectoryName = "ProtectedSessionCache"
    nonisolated private static let cacheFileName = "mobile-sessions-v1.json"

    var sessionsAreStale: Bool {
        isUsingCachedSessions
    }

    var cachedSessionStatusLine: String? {
        guard isUsingCachedSessions, let cachedSessionsSavedAt else { return nil }
        return "Offline snapshot saved \(cachedSessionsSavedAt.formatted(date: .abbreviated, time: .shortened)). Network actions are disabled."
    }

    @discardableResult
    func load(authoritativeSessionID: String? = nil) async -> CaptureSessionLoadOutcome {
        guard let url = URL(string: "\(baseURL.trimmingCharacters(in: .whitespacesAndNewlines))/api/mobile/capture/sessions") else {
            let message = "The configured Nest URL is not valid."
            status = "Bad Nest URL"
            errorMessage = message
            return .invalidResponse(message: message)
        }

        status = "Loading"
        errorMessage = nil

        do {
            var request = URLRequest(url: url)
            request.httpMethod = "GET"

            let (data, response) = try await AuthManager.shared.authenticatedData(
                for: request,
                allowOfflineRecovery: true
            )
            let decodedPayload = try? JSONDecoder().decode(MobileCaptureSessionsResponse.self, from: data)

            if response.statusCode == 401 || response.statusCode == 403 {
                let message = decodedPayload?.error
                    ?? "This Quipsly account is no longer allowed to use the requested capture sessions."
                clearSessionsAfterAuthorityFailure()
                status = "Access unavailable"
                errorMessage = message
                return .forbidden(message: message)
            }

            if isTransportAmbiguousSessionCollectionStatus(response.statusCode) {
                let message = decodedPayload?.error
                    ?? "Nest could not return the authoritative capture-session list (HTTP \(response.statusCode))."
                status = "Nest temporarily unavailable"
                errorMessage = message
                return .transportUnavailable(message: message)
            }

            guard response.statusCode < 400,
                  let payload = decodedPayload,
                  payload.ok else {
                let message = decodedPayload?.error
                    ?? "Nest returned an invalid capture-session response."
                clearSessionsAfterAuthorityFailure()
                status = "Needs attention"
                errorMessage = message
                return .invalidResponse(message: message)
            }

            sessions = payload.sessions ?? []
            captureProjects = payload.captureProjects ?? []
            isUsingCachedSessions = false
            cachedSessionsSavedAt = Date()
            if let selectedSessionID = authoritativeSessionID ?? sessions.first?.id {
                await refreshClientFollowUp(forSessionID: selectedSessionID)
            }
            persistProtectedSessionCache()
            status = sessions.isEmpty ? "No sessions yet" : "Ready"

            if let authoritativeSessionID,
               !sessions.contains(where: { $0.id == authoritativeSessionID }) {
                let message = "This capture session is no longer present in the authoritative Nest session list."
                status = "Session unavailable"
                errorMessage = message
                return .authoritativeAbsent(message: message)
            }

            return .loaded
        } catch {
            let message = error.localizedDescription
            if isTransportUnavailable(error) {
                // Keep an already-loaded authoritative list in place during a
                // transient outage. Cache restoration is only a launch fallback.
                let restoredCache = sessions.isEmpty && restoreProtectedSessionCacheIfAvailable()
                AuthManager.shared.suspendNetworkActionsForCachedFallback(
                    reason: message
                )
                if restoredCache {
                    status = "Offline · cached sessions"
                    errorMessage = cachedSessionStatusLine
                        ?? "Nest is unavailable. Showing a protected offline session snapshot; network actions are disabled."
                } else {
                    status = "Nest unavailable"
                    errorMessage = "Nest is temporarily unreachable. Protected local recordings remain available."
                }
                return .transportUnavailable(message: message)
            }

            if AuthManager.shared.accessMode == .signedOut {
                clearSessionsAfterAuthorityFailure()
                status = "Access unavailable"
                errorMessage = message
                return .forbidden(message: message)
            } else {
                clearSessionsAfterAuthorityFailure()
                status = "Needs attention"
                errorMessage = message
                return .invalidResponse(message: message)
            }
        }
    }

    private func clearSessionsAfterAuthorityFailure() {
        sessions = []
        captureProjects = []
        isUsingCachedSessions = false
        cachedSessionsSavedAt = nil
    }

    private func isTransportUnavailable(_ error: Error) -> Bool {
        if AuthManager.shared.hasProtectedOfflineAccess {
            return true
        }

        let nsError = error as NSError
        guard nsError.domain == NSURLErrorDomain else { return false }
        let transportCodes: Set<Int> = [
            URLError.notConnectedToInternet.rawValue,
            URLError.networkConnectionLost.rawValue,
            URLError.cannotConnectToHost.rawValue,
            URLError.cannotFindHost.rawValue,
            URLError.dnsLookupFailed.rawValue,
            URLError.timedOut.rawValue,
            URLError.internationalRoamingOff.rawValue,
            URLError.dataNotAllowed.rawValue,
            URLError.secureConnectionFailed.rawValue,
            URLError.cannotLoadFromNetwork.rawValue,
            URLError.resourceUnavailable.rawValue,
            URLError.badServerResponse.rawValue,
        ]
        return transportCodes.contains(nsError.code)
    }

    private func isTransportAmbiguousSessionCollectionStatus(_ statusCode: Int) -> Bool {
        // A 404/410 here describes the collection route/deployment, not the
        // pinned session. Only a successful decoded list missing that ID is
        // authoritative absence. The other statuses are explicitly retryable.
        [404, 408, 410, 425, 429].contains(statusCode) || (500...599).contains(statusCode)
    }

    func createQuickSession(title: String, purpose: String, provider: String = "livekit") async -> MobileCaptureSession? {
        guard let url = URL(string: "\(baseURL.trimmingCharacters(in: .whitespacesAndNewlines))/api/mobile/capture/sessions") else {
            status = "Bad Nest URL"
            errorMessage = "The configured Nest URL is not valid."
            return nil
        }

        status = "Creating session"
        errorMessage = nil
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedTitle = trimmedTitle.isEmpty ? "Quipsly capture session" : trimmedTitle

        do {
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: [
                "title": normalizedTitle,
                "purpose": purpose,
                "provider": provider,
                "deviceLabel": "Quipsly iOS Capture",
            ])

            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            let payload = try JSONDecoder().decode(MobileCaptureSessionCreateResponse.self, from: data)

            guard response.statusCode < 400, payload.ok, let created = payload.session else {
                throw NSError(
                    domain: "CaptureSessions",
                    code: 0,
                    userInfo: [NSLocalizedDescriptionKey: payload.error ?? "Capture session could not be created."]
                )
            }

            if let index = sessions.firstIndex(where: { $0.id == created.id }) {
                sessions[index] = created
            } else {
                sessions.insert(created, at: 0)
            }
            persistProtectedSessionCache()
            status = "Session created"
            return created
        } catch {
            status = "Needs attention"
            errorMessage = error.localizedDescription
            return nil
        }
    }

    func updateRecordingConsent(
        for session: MobileCaptureSession,
        consentAction: String,
        grantAttestation: MobileCaptureConsentGrantAttestation? = nil
    ) async -> MobileCaptureSession? {
        guard let url = URL(string: "\(baseURL.trimmingCharacters(in: .whitespacesAndNewlines))/api/mobile/capture/consent") else {
            status = "Bad Nest URL"
            errorMessage = "The configured Nest URL is not valid."
            return nil
        }

        status = "Updating consent"
        errorMessage = nil

        do {
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            var requestBody: [String: Any] = [
                "callRoomId": session.callRoomId,
                "consentAction": consentAction,
                "canRecordAudio": false,
                "canRecordVideo": false,
                "canTranscribe": false,
                "allAudibleParticipantsNotifiedAndAgreed": false,
            ]
            if consentAction.uppercased() == "GRANT" {
                guard let grantAttestation,
                      grantAttestation.isCompleteForCapture else {
                    throw NSError(
                        domain: "CaptureSessions",
                        code: 3,
                        userInfo: [NSLocalizedDescriptionKey: "Recording consent is incomplete. Choose audio, video, or both and confirm the nearby-participant safety attestation; transcription remains a separate choice."]
                    )
                }
                requestBody["canRecordAudio"] = grantAttestation.canRecordAudio
                requestBody["canRecordVideo"] = grantAttestation.canRecordVideo
                requestBody["canTranscribe"] = grantAttestation.canTranscribe
                requestBody["allAudibleParticipantsNotifiedAndAgreed"] = grantAttestation.allAudibleParticipantsNotifiedAndAgreed
                requestBody["consentPolicyVersion"] = MobileCaptureConsentGrantAttestation.policyVersion
                requestBody["consentText"] = MobileCaptureConsentGrantAttestation.policyText
                requestBody["consentTextHash"] = MobileCaptureConsentGrantAttestation.policyTextHash
                requestBody["presentationEvidence"] = [
                    "version": 1,
                    "surface": MobileCaptureConsentGrantAttestation.presentationSurface,
                    "presentedAt": ISO8601DateFormatter().string(from: grantAttestation.presentedAt),
                    "recordingChoicePresented": true,
                    "transcriptionChoicePresented": true,
                    "audibleParticipantAttestationPresented": true,
                ]
            }
            if let participantId = session.participantId {
                requestBody["participantId"] = participantId
            }
            request.httpBody = try JSONSerialization.data(withJSONObject: requestBody)

            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            let payload = try JSONDecoder().decode(MobileCaptureConsentResponse.self, from: data)

            guard response.statusCode < 400, payload.ok else {
                throw NSError(
                    domain: "CaptureSessions",
                    code: 2,
                    userInfo: [NSLocalizedDescriptionKey: payload.error ?? "Recording consent could not be saved."]
                )
            }

            let update = payload.session
            let merged = MobileCaptureSession(
                id: update?.id ?? session.id,
                callRoomId: update?.callRoomId ?? session.callRoomId,
                title: session.title,
                purpose: session.purpose,
                status: session.status,
                updatedAt: session.updatedAt,
                provider: session.provider,
                providerRoomId: session.providerRoomId,
                providerCanJoin: session.providerCanJoin,
                providerReadiness: session.providerReadiness,
                providerNextAction: session.providerNextAction,
                projectId: session.projectId,
                projectSlug: session.projectSlug,
                projectName: session.projectName,
                availableTags: session.availableTags,
                projectBindingSource: session.projectBindingSource,
                projectLegacySlugDrift: session.projectLegacySlugDrift,
                episodeSlug: session.episodeSlug,
                scheduledStart: session.scheduledStart,
                scheduledEnd: session.scheduledEnd,
                participantId: update?.participantId ?? session.participantId,
                recordingConsentId: update?.recordingConsentId ?? session.recordingConsentId,
                recordingConsentStatus: update?.recordingConsentStatus ?? session.recordingConsentStatus,
                recordingConsentGranted: update?.recordingConsentGranted ?? session.recordingConsentGranted,
                recordingConsentCanRecordAudio: update?.recordingConsentCanRecordAudio ?? session.recordingConsentCanRecordAudio,
                recordingConsentCanRecordVideo: update?.recordingConsentCanRecordVideo ?? session.recordingConsentCanRecordVideo,
                recordingConsentCanTranscribe: update?.recordingConsentCanTranscribe ?? session.recordingConsentCanTranscribe,
                recordingConsentVideoGranted: update?.recordingConsentVideoGranted ?? session.recordingConsentVideoGranted,
                canRecordNow: session.canRecordNow && (update?.recordingConsentGranted ?? session.recordingConsentGranted),
                canRecordAudioNow: session.canRecordAudioNow,
                canRecordVideoNow: session.canRecordVideoNow,
                consentRequiredParticipantCount: update?.consentRequiredParticipantCount ?? session.consentRequiredParticipantCount,
                consentGrantedParticipantCount: update?.consentGrantedParticipantCount ?? session.consentGrantedParticipantCount,
                allRegisteredParticipantConsentGranted: update?.allRegisteredParticipantConsentGranted ?? session.allRegisteredParticipantConsentGranted,
                videoConsentGrantedParticipantCount: update?.videoConsentGrantedParticipantCount ?? session.videoConsentGrantedParticipantCount,
                allRegisteredParticipantVideoConsentGranted: update?.allRegisteredParticipantVideoConsentGranted ?? session.allRegisteredParticipantVideoConsentGranted,
                captureReadiness: session.captureReadiness,
                videoCaptureReadiness: session.videoCaptureReadiness,
                journeySummary: session.journeySummary,
                contentReadiness: session.contentReadiness,
                lifecycle: session.lifecycle,
                actionPacket: session.actionPacket,
                clientLabel: session.clientLabel,
                coachLabel: session.coachLabel,
                offeringTitle: session.offeringTitle,
                bookingStatus: session.bookingStatus,
                paymentPolicy: session.paymentPolicy,
                paymentStatus: session.paymentStatus,
                calendarStatus: session.calendarStatus,
                recordingCount: session.recordingCount,
                providerRecordingReceiptSlotId: session.providerRecordingReceiptSlotId,
                providerRecordingReceiptStatus: session.providerRecordingReceiptStatus,
                providerRecordingReceiptNextAction: session.providerRecordingReceiptNextAction,
                transcriptJobCount: session.transcriptJobCount,
                latestRecordingAssetId: session.latestRecordingAssetId,
                latestRecordingAssetStatus: session.latestRecordingAssetStatus,
                latestRecordingFileName: session.latestRecordingFileName,
                latestRecordingMediaAssetId: session.latestRecordingMediaAssetId,
                latestRecordingPlaybackUrl: session.latestRecordingPlaybackUrl,
                latestRecordingPromotionStatus: session.latestRecordingPromotionStatus,
                latestTranscriptJobId: session.latestTranscriptJobId,
                latestTranscriptStatus: session.latestTranscriptStatus,
                latestTranscriptProvider: session.latestTranscriptProvider,
                latestTranscriptSegmentCount: session.latestTranscriptSegmentCount,
                coachingPacketSummaryNoteId: session.coachingPacketSummaryNoteId,
                coachingPacketTitle: session.coachingPacketTitle,
                coachingPacketPreview: session.coachingPacketPreview,
                coachingPacketHighlightCount: session.coachingPacketHighlightCount,
                coachingPacketActionItemCount: session.coachingPacketActionItemCount,
                coachingPacketLatestActivityAt: session.coachingPacketLatestActivityAt,
                coachingPacketFirstOpenActionItemId: session.coachingPacketFirstOpenActionItemId,
                coachingPacketStatus: session.coachingPacketStatus,
                coachingPacketReviewLanes: session.coachingPacketReviewLanes,
                afterCaptureNextAction: session.afterCaptureNextAction,
                nextAction: update?.nextAction ?? session.nextAction
            )

            if let index = sessions.firstIndex(where: { $0.id == session.id }) {
                sessions[index] = merged
            }
            persistProtectedSessionCache()

            if update?.recordingConsentGranted == true {
                status = "Consent granted"
            } else {
                status = update?.recordingConsentStatus ?? "Consent updated"
            }
            return merged
        } catch {
            status = "Needs attention"
            errorMessage = error.localizedDescription
            return nil
        }
    }

    func grantRecordingConsent(
        for session: MobileCaptureSession,
        attestation: MobileCaptureConsentGrantAttestation
    ) async -> MobileCaptureSession? {
        await updateRecordingConsent(
            for: session,
            consentAction: "GRANT",
            grantAttestation: attestation
        )
    }

    func declineRecordingConsent(for session: MobileCaptureSession) async -> MobileCaptureSession? {
        await updateRecordingConsent(for: session, consentAction: "DECLINE")
    }

    func revokeRecordingConsent(for session: MobileCaptureSession) async -> MobileCaptureSession? {
        await updateRecordingConsent(for: session, consentAction: "REVOKE")
    }

    func updateRoomState(for session: MobileCaptureSession, action: String) async -> MobileCaptureSession? {
        guard let url = URL(string: "\(baseURL.trimmingCharacters(in: .whitespacesAndNewlines))/api/mobile/capture/rooms/state") else {
            status = "Bad Nest URL"
            errorMessage = "The configured Nest URL is not valid."
            return nil
        }

        status = "Updating room"
        errorMessage = nil
        latestRoomStateResponse = nil

        let normalizedAction = action.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        let receiptKey = "\(session.callRoomId)|\(normalizedAction)"
        let roomStateReceipt: EphemeralRoomStateReceipt
        if let pending = pendingDirectRoomStateReceipts[receiptKey] {
            roomStateReceipt = pending
        } else {
            let captureID: UUID?
            if normalizedAction == "START_RECORDING" {
                captureID = activeDirectCaptureIDsByRoom[session.callRoomId] ?? UUID()
            } else if normalizedAction == "STOP_RECORDING" {
                captureID = activeDirectCaptureIDsByRoom[session.callRoomId]
                    ?? pendingDirectRoomStateReceipts["\(session.callRoomId)|START_RECORDING"]?.captureID
                    ?? UUID()
            } else {
                captureID = nil
            }
            roomStateReceipt = EphemeralRoomStateReceipt(
                receiptID: UUID(),
                captureID: captureID,
                occurredAt: Date()
            )
            pendingDirectRoomStateReceipts[receiptKey] = roomStateReceipt
        }

        do {
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            var requestBody: [String: Any] = [
                "callRoomId": session.callRoomId,
                "action": normalizedAction,
                "receiptId": roomStateReceipt.receiptID.uuidString.lowercased(),
                "occurredAt": ISO8601DateFormatter().string(from: roomStateReceipt.occurredAt),
                "source": "ios-direct-room-control",
            ]
            if let captureID = roomStateReceipt.captureID {
                requestBody["captureId"] = captureID.uuidString.lowercased()
            }
            request.httpBody = try JSONSerialization.data(withJSONObject: requestBody)

            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            let payload = try JSONDecoder().decode(MobileCaptureRoomStateResponse.self, from: data)

            guard response.statusCode < 400, payload.ok else {
                throw NSError(
                    domain: "CaptureSessions",
                    code: 4,
                    userInfo: [NSLocalizedDescriptionKey: payload.error ?? "Room state could not be updated."]
                )
            }

            pendingDirectRoomStateReceipts.removeValue(forKey: receiptKey)
            if normalizedAction == "START_RECORDING", let captureID = roomStateReceipt.captureID {
                activeDirectCaptureIDsByRoom[session.callRoomId] = captureID
            } else if normalizedAction == "STOP_RECORDING" || normalizedAction == "END" {
                activeDirectCaptureIDsByRoom.removeValue(forKey: session.callRoomId)
            }

            latestRoomStateResponse = payload
            let update = payload.session
            let merged = MobileCaptureSession(
                id: update?.id ?? session.id,
                callRoomId: update?.callRoomId ?? session.callRoomId,
                title: session.title,
                purpose: session.purpose,
                status: update?.status ?? session.status,
                updatedAt: session.updatedAt,
                provider: session.provider,
                providerRoomId: session.providerRoomId,
                providerCanJoin: session.providerCanJoin,
                providerReadiness: session.providerReadiness,
                providerNextAction: session.providerNextAction,
                projectId: session.projectId,
                projectSlug: session.projectSlug,
                projectName: session.projectName,
                availableTags: session.availableTags,
                projectBindingSource: session.projectBindingSource,
                projectLegacySlugDrift: session.projectLegacySlugDrift,
                episodeSlug: session.episodeSlug,
                scheduledStart: session.scheduledStart,
                scheduledEnd: session.scheduledEnd,
                participantId: update?.participantId ?? session.participantId,
                recordingConsentId: update?.recordingConsentId ?? session.recordingConsentId,
                recordingConsentStatus: update?.recordingConsentStatus ?? session.recordingConsentStatus,
                recordingConsentGranted: update?.recordingConsentGranted ?? session.recordingConsentGranted,
                recordingConsentCanRecordAudio: update?.recordingConsentCanRecordAudio ?? session.recordingConsentCanRecordAudio,
                recordingConsentCanRecordVideo: update?.recordingConsentCanRecordVideo ?? session.recordingConsentCanRecordVideo,
                recordingConsentCanTranscribe: update?.recordingConsentCanTranscribe ?? session.recordingConsentCanTranscribe,
                recordingConsentVideoGranted: update?.recordingConsentVideoGranted ?? session.recordingConsentVideoGranted,
                canRecordNow: session.canRecordNow && ["PLANNED", "OPEN", "RECORDING"].contains(update?.status ?? session.status ?? ""),
                canRecordAudioNow: session.canRecordAudioNow,
                canRecordVideoNow: session.canRecordVideoNow,
                consentRequiredParticipantCount: update?.consentRequiredParticipantCount ?? session.consentRequiredParticipantCount,
                consentGrantedParticipantCount: update?.consentGrantedParticipantCount ?? session.consentGrantedParticipantCount,
                allRegisteredParticipantConsentGranted: update?.allRegisteredParticipantConsentGranted ?? session.allRegisteredParticipantConsentGranted,
                videoConsentGrantedParticipantCount: update?.videoConsentGrantedParticipantCount ?? session.videoConsentGrantedParticipantCount,
                allRegisteredParticipantVideoConsentGranted: update?.allRegisteredParticipantVideoConsentGranted ?? session.allRegisteredParticipantVideoConsentGranted,
                captureReadiness: session.captureReadiness,
                videoCaptureReadiness: session.videoCaptureReadiness,
                journeySummary: session.journeySummary,
                contentReadiness: session.contentReadiness,
                lifecycle: session.lifecycle,
                actionPacket: session.actionPacket,
                clientLabel: session.clientLabel,
                coachLabel: session.coachLabel,
                offeringTitle: session.offeringTitle,
                bookingStatus: session.bookingStatus,
                paymentPolicy: session.paymentPolicy,
                paymentStatus: session.paymentStatus,
                calendarStatus: session.calendarStatus,
                recordingCount: session.recordingCount,
                providerRecordingReceiptSlotId: session.providerRecordingReceiptSlotId,
                providerRecordingReceiptStatus: session.providerRecordingReceiptStatus,
                providerRecordingReceiptNextAction: session.providerRecordingReceiptNextAction,
                transcriptJobCount: session.transcriptJobCount,
                latestRecordingAssetId: session.latestRecordingAssetId,
                latestRecordingAssetStatus: session.latestRecordingAssetStatus,
                latestRecordingFileName: session.latestRecordingFileName,
                latestRecordingMediaAssetId: session.latestRecordingMediaAssetId,
                latestRecordingPlaybackUrl: session.latestRecordingPlaybackUrl,
                latestRecordingPromotionStatus: session.latestRecordingPromotionStatus,
                latestTranscriptJobId: session.latestTranscriptJobId,
                latestTranscriptStatus: session.latestTranscriptStatus,
                latestTranscriptProvider: session.latestTranscriptProvider,
                latestTranscriptSegmentCount: session.latestTranscriptSegmentCount,
                coachingPacketSummaryNoteId: session.coachingPacketSummaryNoteId,
                coachingPacketTitle: session.coachingPacketTitle,
                coachingPacketPreview: session.coachingPacketPreview,
                coachingPacketHighlightCount: session.coachingPacketHighlightCount,
                coachingPacketActionItemCount: session.coachingPacketActionItemCount,
                coachingPacketLatestActivityAt: session.coachingPacketLatestActivityAt,
                coachingPacketFirstOpenActionItemId: session.coachingPacketFirstOpenActionItemId,
                coachingPacketStatus: session.coachingPacketStatus,
                coachingPacketReviewLanes: session.coachingPacketReviewLanes,
                afterCaptureNextAction: session.afterCaptureNextAction,
                nextAction: update?.nextAction ?? session.nextAction
            )

            if let index = sessions.firstIndex(where: { $0.id == session.id }) {
                sessions[index] = merged
            }
            persistProtectedSessionCache()

            status = update?.nextAction ?? "Room updated"
            return merged
        } catch {
            status = "Needs attention"
            errorMessage = error.localizedDescription
            return nil
        }
    }

    /// Replays a durable local outbox receipt without depending on the current
    /// session selection. The server can use the immutable IDs and occurredAt
    /// timestamp for idempotency/audit while local media remains independent.
    func sendRoomStateReceipt(
        _ receipt: PendingCaptureRoomReceipt,
        expectedOwnerAccountID: String
    ) async -> CaptureRoomReceiptDeliveryResult {
        let expectedOwnerAccountID = expectedOwnerAccountID.trimmingCharacters(in: .whitespacesAndNewlines)
        let receiptOwnerAccountID = receipt.ownerAccountID?.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !expectedOwnerAccountID.isEmpty,
              receiptOwnerAccountID == expectedOwnerAccountID else {
            let message = "The protected capture receipt is not bound to the current Quipsly account. It was not sent."
            status = "Capture receipt waiting"
            errorMessage = message
            return .retryable(message: message)
        }
        guard let url = URL(string: "\(baseURL.trimmingCharacters(in: .whitespacesAndNewlines))/api/mobile/capture/rooms/state") else {
            status = "Bad Nest URL"
            let message = "The configured Nest URL is not valid."
            errorMessage = message
            return .retryable(message: message)
        }

        status = "Syncing capture receipt"
        errorMessage = nil

        do {
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: [
                "callRoomId": receipt.callRoomID,
                "action": receipt.action.rawValue,
                "receiptId": receipt.id.uuidString.lowercased(),
                "captureId": receipt.captureID.uuidString.lowercased(),
                "occurredAt": ISO8601DateFormatter().string(from: receipt.occurredAt),
                "source": "ios-capture-outbox",
            ])

            let (data, response) = try await AuthManager.shared.authenticatedData(
                for: request,
                expectedOwnerAccountID: expectedOwnerAccountID
            )
            let payload = try JSONDecoder().decode(MobileCaptureRoomStateResponse.self, from: data)
            latestRoomStateResponse = payload
            if payload.receiptPersisted == true, !payload.ok {
                let message = payload.error ?? "Nest preserved the receipt but held the requested room-state change."
                status = "Capture receipt preserved · state held"
                errorMessage = message
                return .terminallyRejected(message: message, errorCode: payload.errorCode)
            }
            guard response.statusCode < 400, payload.ok else {
                throw NSError(
                    domain: "CaptureSessions",
                    code: 5,
                    userInfo: [NSLocalizedDescriptionKey: payload.error ?? "Capture receipt could not be synchronized."]
                )
            }

            status = "Capture receipt synchronized"
            return .acknowledged
        } catch {
            status = "Capture receipt waiting"
            errorMessage = error.localizedDescription
            return .retryable(message: error.localizedDescription)
        }
    }

    func prepareRoomJoin(for session: MobileCaptureSession) async -> MobileCaptureRoomJoinResponse? {
        guard let url = URL(string: "\(baseURL.trimmingCharacters(in: .whitespacesAndNewlines))/api/mobile/capture/rooms/join") else {
            status = "Bad Nest URL"
            errorMessage = "The configured Nest URL is not valid."
            return nil
        }

        status = "Preparing room"
        errorMessage = nil

        do {
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: [
                "callRoomId": session.callRoomId,
            ])

            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            let payload = try JSONDecoder().decode(MobileCaptureRoomJoinResponse.self, from: data)

            guard response.statusCode < 400, payload.ok else {
                throw NSError(
                    domain: "CaptureSessions",
                    code: 3,
                    userInfo: [NSLocalizedDescriptionKey: payload.error ?? "Room join could not be prepared."]
                )
            }

            status = payload.canJoin == true ? "Room ready" : "Room not ready"
            errorMessage = payload.canJoin == true ? nil : payload.nextAction
            return payload
        } catch {
            status = "Needs attention"
            errorMessage = error.localizedDescription
            return nil
        }
    }

    func inspectRoomJoin(for session: MobileCaptureSession) async -> MobileCaptureRoomJoinDiagnosticResponse? {
        var components = URLComponents(string: "\(baseURL.trimmingCharacters(in: .whitespacesAndNewlines))/api/mobile/capture/rooms/join/diagnostics")
        components?.queryItems = [URLQueryItem(name: "callRoomId", value: session.callRoomId)]

        guard let url = components?.url else {
            status = "Bad Nest URL"
            errorMessage = "The configured Nest URL is not valid."
            return nil
        }

        status = "Inspecting room"
        errorMessage = nil

        do {
            var request = URLRequest(url: url)
            request.httpMethod = "GET"
            request.setValue("application/json", forHTTPHeaderField: "Accept")

            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            let payload = try JSONDecoder().decode(MobileCaptureRoomJoinDiagnosticResponse.self, from: data)

            guard response.statusCode < 400, payload.ok else {
                throw NSError(
                    domain: "CaptureSessions",
                    code: 30,
                    userInfo: [NSLocalizedDescriptionKey: payload.error ?? "Room diagnostics could not load."]
                )
            }

            status = payload.canJoin == true ? "Room can join" : "Room inspected"
            errorMessage = nil
            return payload
        } catch {
            status = "Needs attention"
            errorMessage = error.localizedDescription
            return nil
        }
    }

    func prepareProviderRecordingReceiptSlot(for session: MobileCaptureSession) async -> Bool {
        guard let payload = await providerRecordingAction(for: session, action: ProviderRecordingAction.prepareReceiptSlot) else {
            return false
        }

        status = payload.reusedExistingSlot == true ? "Provider receipt already ready" : "Provider receipt slot ready"
        errorMessage = payload.nextAction
        await load()
        return true
    }

    func loadSessionContext(for session: MobileCaptureSession) async -> CaptureSessionContextDraft? {
        var components = URLComponents(string: "\(baseURL.trimmingCharacters(in: .whitespacesAndNewlines))/api/mobile/capture/sessions/context")
        components?.queryItems = [URLQueryItem(name: "callRoomId", value: session.callRoomId)]

        guard let url = components?.url else {
            status = "Bad Nest URL"
            errorMessage = "The configured Nest URL is not valid."
            return nil
        }

        status = "Loading session context"
        errorMessage = nil

        do {
            var request = URLRequest(url: url)
            request.httpMethod = "GET"
            request.setValue("application/json", forHTTPHeaderField: "Accept")

            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            let payload = try JSONDecoder().decode(MobileCaptureSessionContextResponse.self, from: data)

            guard response.statusCode < 400, payload.ok else {
                throw NSError(
                    domain: "CaptureSessionContext",
                    code: 1,
                    userInfo: [NSLocalizedDescriptionKey: payload.error ?? "Shared session context could not load."]
                )
            }

            status = payload.statusLine
            errorMessage = payload.nextAction
            return payload.draft()
        } catch {
            status = "Needs attention"
            errorMessage = error.localizedDescription
            return nil
        }
    }

    func saveSessionContext(
        for session: MobileCaptureSession,
        draft: CaptureSessionContextDraft
    ) async -> CaptureSessionContextSaveResult {
        guard let url = URL(string: "\(baseURL.trimmingCharacters(in: .whitespacesAndNewlines))/api/mobile/capture/sessions/context") else {
            status = "Bad Nest URL"
            errorMessage = "The configured Nest URL is not valid."
            return .failed(message: errorMessage ?? "The configured Nest URL is not valid.")
        }

        status = "Saving session context"
        errorMessage = nil

        do {
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(
                CaptureSessionContextSaveRequest(callRoomId: session.callRoomId, draft: draft)
            )

            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            let payload = try JSONDecoder().decode(MobileCaptureSessionContextResponse.self, from: data)

            if response.statusCode == 409,
               payload.conflict == true,
               let remote = payload.remoteDraft(fallback: draft) {
                let local = payload.preservedLocalDraft(fallback: draft)
                let message = payload.error ?? "Nest changed elsewhere. Your phone draft was kept."
                status = "Review context conflict"
                errorMessage = message
                return .conflict(remote: remote, local: local, message: message)
            }

            guard response.statusCode < 400, payload.ok else {
                throw NSError(
                    domain: "CaptureSessionContext",
                    code: 2,
                    userInfo: [NSLocalizedDescriptionKey: payload.error ?? "Shared session context could not save."]
                )
            }

            status = payload.statusLine
            errorMessage = payload.nextAction
            return .saved(payload.draft(fallback: draft))
        } catch {
            status = "Needs attention"
            errorMessage = error.localizedDescription
            return .failed(message: error.localizedDescription)
        }
    }

    func syncQuickEntry(_ entry: PendingMobileQuickEntry) async -> MobileQuickEntrySyncResult {
        guard let url = URL(string: "\(baseURL.trimmingCharacters(in: .whitespacesAndNewlines))/api/mobile/capture/quick-entry") else {
            return .held(code: "BAD_NEST_URL", message: "The configured Nest URL is not valid. The protected phone copy remains queued.")
        }

        do {
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(MobileQuickEntrySaveRequest(entry: entry))
            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            let payload = try JSONDecoder().decode(MobileQuickEntrySaveResponse.self, from: data)

            if response.statusCode >= 500 || response.statusCode == 408 || response.statusCode == 429 {
                return .retryable(message: payload.error ?? "Nest is temporarily unavailable. The protected phone copy remains queued.")
            }
            guard response.statusCode < 400, payload.ok, let saved = payload.entry else {
                return .held(
                    code: payload.code,
                    message: payload.error ?? "Nest held this quick capture. The protected phone copy remains available for review."
                )
            }
            if let destinationProjectID = entry.destinationProjectID,
               saved.projectId != destinationProjectID {
                return .held(
                    code: "QUICK_ENTRY_DESTINATION_ACKNOWLEDGEMENT_MISMATCH",
                    message: "Nest acknowledged a different destination. The protected phone copy remains available for review."
                )
            }
            return .acknowledged(
                serverRecordID: saved.id,
                idempotentReplay: payload.idempotentReplay == true,
                message: payload.nextAction ?? "\(entry.kind.title) saved to Nest.",
                reminder: saved.reminder
            )
        } catch {
            return .retryable(message: "\(error.localizedDescription) The protected phone copy remains queued.")
        }
    }

    func syncSessionNoteEdit(_ edit: PendingSessionNoteEdit) async -> MobileSessionNoteEditSyncResult {
        let encodedNoteID = edit.noteID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed)
            ?? edit.noteID
        guard let url = URL(string: "\(baseURL.trimmingCharacters(in: .whitespacesAndNewlines))/api/notes/\(encodedNoteID)") else {
            return .held(
                code: "BAD_NEST_URL",
                message: "The configured Nest URL is not valid. The protected note draft remains on this iPhone."
            )
        }

        do {
            var request = URLRequest(url: url)
            request.httpMethod = "PATCH"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(MobileSessionNoteEditRequest(edit: edit))
            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            let payload = try JSONDecoder().decode(MobileSessionNoteEditResponse.self, from: data)
            if response.statusCode >= 500 || response.statusCode == 408 || response.statusCode == 429 {
                return .retryable(
                    message: payload.error ?? "Nest is temporarily unavailable. The complete note draft remains protected for retry."
                )
            }
            guard response.statusCode < 400,
                  payload.ok,
                  let saved = payload.note else {
                return .held(
                    code: payload.code,
                    message: payload.error ?? "Nest held this note edit. Review the protected iPhone draft beside the canonical note."
                )
            }
            let receiptMatches = payload.receiptId == "session-note-edit-\(Self.sessionNoteEditDigest(ownerID: edit.ownerAccountID, requestID: edit.clientRequestID))"
                && payload.appliedRevision != nil
            let intentMatchesCurrent = saved.title == edit.title
                && saved.body == edit.body
                && saved.kind == edit.noteKind.rawValue
                && saved.visibility == edit.noteVisibility.rawValue
                && saved.tags.map(\.id).sorted() == edit.tagIDs
            guard saved.id == edit.noteID,
                  receiptMatches,
                  payload.idempotentReplay == true || intentMatchesCurrent else {
                return .held(
                    code: "SESSION_NOTE_EDIT_ACKNOWLEDGEMENT_MISMATCH",
                    message: "Nest returned a different note, audience, tag set, or revision receipt. The protected iPhone draft is held for review."
                )
            }
            return .acknowledged(
                idempotentReplay: payload.idempotentReplay == true,
                message: payload.idempotentReplay == true
                    ? "Nest already applied this exact protected note edit; no revision was duplicated."
                    : "The canonical Session note, audience, and tags are updated with a new revision. Nothing was sent or published."
            )
        } catch {
            return .retryable(
                message: "\(error.localizedDescription) The complete note draft remains protected for retry."
            )
        }
    }

    nonisolated private static func sessionNoteEditDigest(ownerID: String, requestID: String) -> String {
        SHA256.hash(data: Data("\(ownerID)|\(requestID)".utf8))
            .map { String(format: "%02x", $0) }
            .joined()
            .prefix(32)
            .description
    }

    func providerRecordingAction(
        for session: MobileCaptureSession,
        action: String,
        recordingAssetId: String? = nil
    ) async -> MobileProviderRecordingResponse? {
        guard let url = URL(string: "\(baseURL.trimmingCharacters(in: .whitespacesAndNewlines))/api/mobile/capture/rooms/provider-recording") else {
            status = "Bad Nest URL"
            errorMessage = "The configured Nest URL is not valid."
            return nil
        }

        let normalizedAction = action.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        let actionLabel = normalizedAction
            .replacingOccurrences(of: "_", with: " ")
            .capitalized
        status = actionLabel.isEmpty ? "Updating provider recording" : actionLabel
        errorMessage = nil

        do {
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            var requestBody: [String: String] = [
                "callRoomId": session.callRoomId,
                "action": normalizedAction,
            ]
            if let recordingAssetId, !recordingAssetId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                requestBody["recordingAssetId"] = recordingAssetId.trimmingCharacters(in: .whitespacesAndNewlines)
            }
            request.httpBody = try JSONSerialization.data(withJSONObject: requestBody)

            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            let payload = try JSONDecoder().decode(MobileProviderRecordingResponse.self, from: data)

            guard response.statusCode < 400, payload.ok else {
                throw NSError(
                    domain: "CaptureSessions",
                    code: 8,
                    userInfo: [NSLocalizedDescriptionKey: payload.error ?? "Provider recording action could not be completed."]
                )
            }

            status = payload.providerRecording?.nextAction ?? payload.nextAction ?? "Provider recording action complete"
            errorMessage = nil
            await load()
            return payload
        } catch {
            status = "Needs attention"
            errorMessage = error.localizedDescription
            return nil
        }
    }

    func promoteRecordingToStudioMedia(for session: MobileCaptureSession) async -> Bool {
        let captureGroupID = session.studioHandoffCaptureGroupID
        let captureGroupSources = session.studioHandoffSources
        let recordingAssetID = session.latestRecordingAssetId
        guard captureGroupID != nil || recordingAssetID != nil else {
            status = "No verified recording"
            errorMessage = "Record and upload before promoting media into Studio."
            return false
        }
        if session.recordingPromotedToStudioMedia {
            status = "Studio media already ready"
            errorMessage = nil
            return true
        }
        guard session.canPromoteRecordingToStudioMedia else {
            status = "Recording not verified"
            errorMessage = session.recordingMediaVaultLine
            return false
        }
        guard let url = URL(string: "\(baseURL.trimmingCharacters(in: .whitespacesAndNewlines))/api/mobile/capture/recordings/promote") else {
            status = "Bad Nest URL"
            errorMessage = "The configured Nest URL is not valid."
            return false
        }

        status = "Attaching Studio media"
        errorMessage = nil

        do {
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            var requestBody: [String: Any] = [:]
            if let captureGroupID, !captureGroupSources.isEmpty {
                requestBody["roomId"] = session.callRoomId
                requestBody["captureGroupId"] = captureGroupID
                requestBody["expectedRecordingAssetIds"] =
                    captureGroupSources.map(\.recordingAssetId)
            } else if let recordingAssetID {
                requestBody["recordingAssetId"] = recordingAssetID
            }
            if session.projectId?.isEmpty != false,
               let projectSlug = session.projectSlug,
               !projectSlug.isEmpty {
                requestBody["nestSlug"] = projectSlug
            }
            if let episodeSlug = session.episodeSlug, !episodeSlug.isEmpty {
                requestBody["episodeSlug"] = episodeSlug
            }
            request.httpBody = try JSONSerialization.data(withJSONObject: requestBody)

            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            let payload = try JSONDecoder().decode(MobileCaptureRecordingPromotionResponse.self, from: data)

            guard response.statusCode < 400, payload.ok else {
                throw NSError(
                    domain: "CaptureSessions",
                    code: 9,
                    userInfo: [NSLocalizedDescriptionKey: payload.error ?? payload.message ?? "Recording could not be attached to Studio media."]
                )
            }

            status = payload.statusLine
            errorMessage = nil
            await load()
            return true
        } catch {
            status = "Needs attention"
            errorMessage = error.localizedDescription
            return false
        }
    }

    func runTranscript(for session: MobileCaptureSession) async -> Bool {
        let transcriptJobId = session.latestTranscriptJobId
        let recordingAssetId = session.latestRecordingAssetId
        guard transcriptJobId != nil || recordingAssetId != nil else {
            status = "No recording"
            errorMessage = session.hasProviderRecordingReceiptSlot
                ? "Provider receipt slot is evidence only. Attach verified provider media before transcription."
                : "Upload a recording before running transcription."
            return false
        }
        guard let url = URL(string: "\(baseURL.trimmingCharacters(in: .whitespacesAndNewlines))/api/mobile/capture/transcripts/run") else {
            status = "Bad Nest URL"
            errorMessage = "The configured Nest URL is not valid."
            return false
        }

        status = "Running transcript"
        errorMessage = nil
        latestTranscriptRunResponse = nil
        latestPacketBuildResponse = nil

        do {
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            var requestBody: [String: String] = [:]
            if let transcriptJobId {
                requestBody["transcriptJobId"] = transcriptJobId
            }
            if let recordingAssetId {
                requestBody["recordingAssetId"] = recordingAssetId
            }
            request.httpBody = try JSONSerialization.data(withJSONObject: requestBody)

            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            let payload = try JSONDecoder().decode(MobileCaptureTranscriptRunResponse.self, from: data)

            guard response.statusCode < 400, payload.ok else {
                throw NSError(
                    domain: "CaptureSessions",
                    code: 5,
                    userInfo: [NSLocalizedDescriptionKey: payload.error ?? "Transcript could not run."]
                )
            }

            if payload.alreadyCompleted == true {
                status = "Transcript already complete"
            } else if payload.ensuredFromRecording == true {
                status = "Transcript repaired"
            } else {
                status = "Transcript complete"
            }
            latestTranscriptRunResponse = payload
            await load()
            return true
        } catch {
            status = "Needs attention"
            errorMessage = error.localizedDescription
            return false
        }
    }

    func buildCoachingPacket(for session: MobileCaptureSession, force: Bool = false) async -> Bool {
        guard let transcriptJobId = session.latestTranscriptJobId else {
            status = "No transcript job"
            errorMessage = "Complete transcription before building a packet."
            return false
        }
        guard let url = URL(string: "\(baseURL.trimmingCharacters(in: .whitespacesAndNewlines))/api/mobile/capture/transcripts/packet") else {
            status = "Bad Nest URL"
            errorMessage = "The configured Nest URL is not valid."
            return false
        }

        status = "Building packet"
        errorMessage = nil

        do {
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: [
                "transcriptJobId": transcriptJobId,
                "force": force,
            ])

            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            let payload = try JSONDecoder().decode(MobileCapturePacketBuildResponse.self, from: data)

            guard response.statusCode < 400, payload.ok else {
                throw NSError(
                    domain: "CaptureSessions",
                    code: 6,
                    userInfo: [NSLocalizedDescriptionKey: payload.error ?? "Coaching packet could not be built."]
                )
            }

            latestPacketBuildResponse = payload
            status = payload.reusedExistingPacket == true ? "Packet already exists" : "Packet built"
            errorMessage = payload.packetNextActionLine
            await load()
            return true
        } catch {
            status = "Needs attention"
            errorMessage = error.localizedDescription
            return false
        }
    }

    func acknowledgeClientFollowUp(for session: MobileCaptureSession) async -> Bool {
        guard let followUp = session.clientFollowUp else {
            status = "No released follow-up"
            errorMessage = "The assigned coach has not released a client follow-up to this account."
            return false
        }
        guard let encodedRoomID = session.callRoomId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed),
              let url = URL(
                string: "\(baseURL.trimmingCharacters(in: .whitespacesAndNewlines))/api/sessions/\(encodedRoomID)/client-follow-up"
              ) else {
            status = "Bad Nest URL"
            errorMessage = "The configured Nest URL is not valid."
            return false
        }

        status = "Confirming follow-up open"
        errorMessage = nil
        do {
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: [
                "action": "ACKNOWLEDGE_OPEN",
                "outputId": followUp.id,
                "clientRequestId": Self.clientFollowUpOpenRequestID(outputID: followUp.id),
            ])
            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            let payload = try JSONDecoder().decode(MobileCaptureClientFollowUpMutationResponse.self, from: data)
            guard response.statusCode < 400, payload.ok else {
                throw NSError(
                    domain: "CaptureSessions",
                    code: 34,
                    userInfo: [
                        NSLocalizedDescriptionKey:
                            payload.error ?? "The client follow-up open receipt was not confirmed.",
                    ]
                )
            }
            status = payload.idempotentReplay == true ? "Follow-up open already confirmed" : "Follow-up open confirmed"
            errorMessage = nil
            await refreshClientFollowUp(forSessionID: session.id)
            return true
        } catch {
            status = "Needs attention"
            errorMessage = error.localizedDescription
            return false
        }
    }

    func saveClientFollowUpDraft(
        for session: MobileCaptureSession,
        draft: MobileCaptureClientFollowUpDraft
    ) async -> Bool {
        guard AuthManager.shared.networkActionsAllowed else {
            status = "Offline snapshot"
            errorMessage = "Reconnect to Nest before saving this recipient-bound private draft. No local release is inferred."
            return false
        }
        guard let workspace = session.clientFollowUpWorkspace, workspace.isCoach else {
            status = "Coach access required"
            errorMessage = "Only the currently assigned coach can prepare this client follow-up."
            return false
        }
        guard draft.isValid else {
            status = "Draft needs content"
            errorMessage = "Add a title and at least one client-safe record, opening note, or next-Session focus."
            return false
        }
        guard let encodedRoomID = session.callRoomId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed),
              let url = URL(
                string: "\(baseURL.trimmingCharacters(in: .whitespacesAndNewlines))/api/sessions/\(encodedRoomID)/client-follow-up"
              ) else {
            status = "Bad Nest URL"
            errorMessage = "The configured Nest URL is not valid."
            return false
        }

        let currentDraft = workspace.output?.status == "DRAFT" ? workspace.output : nil
        let action = currentDraft == nil ? "CREATE_DRAFT" : "UPDATE_DRAFT"
        let requestID = Self.clientFollowUpMutationRequestID(
            action: action,
            roomID: session.callRoomId,
            outputID: workspace.output?.id,
            expectedRevision: workspace.output?.revision,
            draft: draft
        )
        var body: [String: Any] = [
            "action": action,
            "clientRequestId": requestID,
            "title": draft.title,
            "intro": draft.intro,
            "nextSessionFocus": draft.nextSessionFocus,
            "noteIds": draft.noteIDs.sorted(),
            "goalIds": draft.goalIDs.sorted(),
            "taskIds": draft.taskIDs.sorted(),
        ]
        if let currentDraft {
            body["outputId"] = currentDraft.id
            body["expectedRevision"] = currentDraft.revision
        }

        status = currentDraft == nil ? "Creating private follow-up" : "Saving private follow-up revision"
        errorMessage = nil
        do {
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            let payload = try JSONDecoder().decode(MobileCaptureClientFollowUpMutationResponse.self, from: data)
            guard response.statusCode < 400, payload.ok else {
                throw NSError(
                    domain: "CaptureSessions",
                    code: 36,
                    userInfo: [
                        NSLocalizedDescriptionKey:
                            payload.error ?? "The private client follow-up revision was not confirmed.",
                    ]
                )
            }
            status = payload.idempotentReplay == true
                ? "Private follow-up already saved"
                : currentDraft == nil
                    ? "Private follow-up created"
                    : "Private follow-up revised"
            errorMessage = "The client still cannot see this draft. Inspect the exact server snapshot before release."
            await refreshClientFollowUp(forSessionID: session.id)
            return true
        } catch {
            status = "Needs attention"
            errorMessage = error.localizedDescription
            await refreshClientFollowUp(forSessionID: session.id)
            return false
        }
    }

    func releaseClientFollowUp(for session: MobileCaptureSession) async -> Bool {
        guard AuthManager.shared.networkActionsAllowed else {
            status = "Offline snapshot"
            errorMessage = "Reconnect to Nest before changing client visibility. Nothing was released."
            return false
        }
        guard let workspace = session.clientFollowUpWorkspace,
              workspace.isCoach,
              let output = workspace.output,
              output.status == "DRAFT" else {
            status = "Private draft required"
            errorMessage = "Save and inspect one current private draft before releasing it."
            return false
        }
        guard let encodedRoomID = session.callRoomId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed),
              let url = URL(
                string: "\(baseURL.trimmingCharacters(in: .whitespacesAndNewlines))/api/sessions/\(encodedRoomID)/client-follow-up"
              ) else {
            status = "Bad Nest URL"
            errorMessage = "The configured Nest URL is not valid."
            return false
        }

        status = "Releasing inside Quipsly"
        errorMessage = nil
        do {
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: [
                "action": "RELEASE",
                "outputId": output.id,
                "expectedRevision": output.revision,
                "clientRequestId": Self.clientFollowUpVisibilityRequestID(
                    action: "RELEASE",
                    outputID: output.id,
                    revision: output.revision
                ),
            ])
            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            let payload = try JSONDecoder().decode(MobileCaptureClientFollowUpMutationResponse.self, from: data)
            guard response.statusCode < 400, payload.ok else {
                throw NSError(
                    domain: "CaptureSessions",
                    code: 37,
                    userInfo: [
                        NSLocalizedDescriptionKey:
                            payload.error ?? "The in-app client release was not confirmed.",
                    ]
                )
            }
            status = payload.idempotentReplay == true ? "Follow-up already released" : "Follow-up released in Quipsly"
            errorMessage = "No email, message, calendar event, or publication action occurred."
            await refreshClientFollowUp(forSessionID: session.id)
            return true
        } catch {
            status = "Needs attention"
            errorMessage = error.localizedDescription
            await refreshClientFollowUp(forSessionID: session.id)
            return false
        }
    }

    func refreshClientFollowUp(forSessionID sessionID: String) async {
        guard let requestedSession = sessions.first(where: { $0.id == sessionID }) else { return }
        let roomID = requestedSession.callRoomId
        guard let encodedRoomID = roomID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed),
              let url = URL(
                string: "\(baseURL.trimmingCharacters(in: .whitespacesAndNewlines))/api/sessions/\(encodedRoomID)/client-follow-up"
              ) else {
            return
        }

        do {
            var request = URLRequest(
                url: url,
                cachePolicy: .reloadIgnoringLocalAndRemoteCacheData
            )
            request.httpMethod = "GET"
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            let payload = try JSONDecoder().decode(MobileCaptureClientFollowUpReadResponse.self, from: data)
            if response.statusCode == 404 {
                guard let currentIndex = sessions.firstIndex(where: { $0.id == sessionID }) else { return }
                var refreshedSession = sessions[currentIndex]
                refreshedSession.clientFollowUp = nil
                refreshedSession.clientFollowUpWorkspace = nil
                sessions[currentIndex] = refreshedSession
                persistProtectedSessionCache()
                return
            }
            guard response.statusCode < 400, payload.ok else {
                throw NSError(
                    domain: "CaptureSessions",
                    code: 35,
                    userInfo: [
                        NSLocalizedDescriptionKey:
                            payload.error ?? "The client follow-up could not be refreshed.",
                    ]
                )
            }
            // The authoritative Session collection may finish loading while
            // this focused request is in flight. Re-resolve by stable ID after
            // the suspension so an older cached value cannot overwrite newer
            // Session fields (including prior-session continuity) or a
            // different row after list reordering.
            guard let currentIndex = sessions.firstIndex(where: { $0.id == sessionID }) else { return }
            var refreshedSession = sessions[currentIndex]
            refreshedSession.clientFollowUp = payload.releasedClientFollowUp
            refreshedSession.clientFollowUpWorkspace = payload.workspace
            sessions[currentIndex] = refreshedSession
            persistProtectedSessionCache()
        } catch {
            errorMessage = "Session loaded, but its private follow-up could not be refreshed: \(error.localizedDescription)"
        }
    }

    private static func clientFollowUpOpenRequestID(outputID: String) -> String {
        let owner = AuthManager.shared.userEmail?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased() ?? "signed-in-account"
        return clientFollowUpStableUUID("client-follow-up-open|\(owner)|\(outputID)")
    }

    private static func clientFollowUpMutationRequestID(
        action: String,
        roomID: String,
        outputID: String?,
        expectedRevision: Int?,
        draft: MobileCaptureClientFollowUpDraft
    ) -> String {
        let owner = AuthManager.shared.userEmail?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased() ?? "signed-in-account"
        let fields = [
            "client-follow-up-draft-v1",
            owner,
            action,
            roomID,
            outputID ?? "none",
            expectedRevision.map(String.init) ?? "none",
            draft.title.trimmingCharacters(in: .whitespacesAndNewlines),
            draft.intro.trimmingCharacters(in: .whitespacesAndNewlines),
            draft.nextSessionFocus.trimmingCharacters(in: .whitespacesAndNewlines),
            draft.noteIDs.sorted().joined(separator: "\u{001E}"),
            draft.goalIDs.sorted().joined(separator: "\u{001E}"),
            draft.taskIDs.sorted().joined(separator: "\u{001E}"),
        ]
        return clientFollowUpStableUUID(fields.joined(separator: "\u{001F}"))
    }

    private static func clientFollowUpVisibilityRequestID(
        action: String,
        outputID: String,
        revision: Int
    ) -> String {
        let owner = AuthManager.shared.userEmail?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased() ?? "signed-in-account"
        return clientFollowUpStableUUID("client-follow-up-visibility-v1|\(owner)|\(action)|\(outputID)|\(revision)")
    }

    private static func clientFollowUpStableUUID(_ material: String) -> String {
        var bytes = Array(SHA256.hash(data: Data(material.utf8)).prefix(16))
        bytes[6] = (bytes[6] & 0x0F) | 0x50
        bytes[8] = (bytes[8] & 0x3F) | 0x80
        let uuid = UUID(uuid: (
            bytes[0], bytes[1], bytes[2], bytes[3],
            bytes[4], bytes[5], bytes[6], bytes[7],
            bytes[8], bytes[9], bytes[10], bytes[11],
            bytes[12], bytes[13], bytes[14], bytes[15]
        ))
        return uuid.uuidString.lowercased()
    }

    func reviewPacketLane(for session: MobileCaptureSession, laneId: String, reviewStatus: String, note: String? = nil) async -> Bool {
        guard let url = URL(string: "\(baseURL.trimmingCharacters(in: .whitespacesAndNewlines))/api/mobile/capture/transcripts/packet") else {
            status = "Bad Nest URL"
            errorMessage = "The configured Nest URL is not valid."
            return false
        }

        status = "Reviewing packet lane"
        errorMessage = nil

        do {
            var body: [String: Any] = [
                "callRoomId": session.callRoomId,
                "laneId": laneId,
                "status": reviewStatus,
            ]
            if let note, !note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                body["note"] = note
            }
            if let summaryNoteId = session.coachingPacketSummaryNoteId {
                body["summaryNoteId"] = summaryNoteId
            }
            if let transcriptJobId = session.latestTranscriptJobId {
                body["transcriptJobId"] = transcriptJobId
            }

            var request = URLRequest(url: url)
            request.httpMethod = "PATCH"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)

            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            let payload = try JSONDecoder().decode(MobileCapturePacketBuildResponse.self, from: data)

            guard response.statusCode < 400, payload.ok else {
                throw NSError(
                    domain: "CaptureSessions",
                    code: 7,
                    userInfo: [NSLocalizedDescriptionKey: payload.error ?? "Packet lane review state could not be updated."]
                )
            }

            latestPacketBuildResponse = payload
            status = "Packet lane reviewed"
            errorMessage = payload.packetNextActionLine
            await load()
            return true
        } catch {
            status = "Needs attention"
            errorMessage = error.localizedDescription
            return false
        }
    }

    static func clearProtectedSessionCache() {
        guard let cacheURL = protectedSessionCacheURL() else { return }
        try? FileManager.default.removeItem(at: cacheURL)
    }

    @discardableResult
    private func restoreProtectedSessionCacheIfAvailable() -> Bool {
        guard let ownerEmail = AuthManager.shared.userEmail?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased(),
              !ownerEmail.isEmpty,
              let cacheURL = Self.protectedSessionCacheURL(),
              FileManager.default.fileExists(atPath: cacheURL.path) else {
            return false
        }

        do {
            let data = try Data(contentsOf: cacheURL, options: .mappedIfSafe)
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            let cache = try decoder.decode(ProtectedSessionCache.self, from: data)
            let age = Date().timeIntervalSince(cache.savedAt)
            guard cache.schemaVersion == 1,
                  cache.ownerEmail == ownerEmail,
                  age >= 0,
                  age <= Self.cacheLifetime else {
                Self.clearProtectedSessionCache()
                return false
            }

            sessions = cache.sessions
            captureProjects = cache.captureProjects ?? []
            cachedSessionsSavedAt = cache.savedAt
            isUsingCachedSessions = true
            status = "Cached · verifying Nest"
            errorMessage = cachedSessionStatusLine
            return true
        } catch {
            Self.clearProtectedSessionCache()
            return false
        }
    }

    private func persistProtectedSessionCache() {
        guard AuthManager.shared.networkActionsAllowed,
              let ownerEmail = AuthManager.shared.userEmail?
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .lowercased(),
              !ownerEmail.isEmpty,
              let cacheURL = Self.protectedSessionCacheURL() else {
            return
        }

        let savedAt = Date()
        let cache = ProtectedSessionCache(
            schemaVersion: 1,
            ownerEmail: ownerEmail,
            savedAt: savedAt,
            sessions: sessions,
            captureProjects: captureProjects
        )

        do {
            let fileManager = FileManager.default
            let directoryURL = cacheURL.deletingLastPathComponent()
            try fileManager.createDirectory(
                at: directoryURL,
                withIntermediateDirectories: true,
                attributes: [.protectionKey: FileProtectionType.complete]
            )
            try fileManager.setAttributes(
                [.protectionKey: FileProtectionType.complete],
                ofItemAtPath: directoryURL.path
            )

            let encoder = JSONEncoder()
            encoder.outputFormatting = [.sortedKeys]
            encoder.dateEncodingStrategy = .iso8601
            let data = try encoder.encode(cache)
            try data.write(to: cacheURL, options: [.atomic, .completeFileProtection])
            try fileManager.setAttributes(
                [.protectionKey: FileProtectionType.complete],
                ofItemAtPath: cacheURL.path
            )
            var resourceValues = URLResourceValues()
            resourceValues.isExcludedFromBackup = true
            var mutableCacheURL = cacheURL
            try mutableCacheURL.setResourceValues(resourceValues)

            cachedSessionsSavedAt = savedAt
            isUsingCachedSessions = false
        } catch {
            // A cache write failure must never replace or delete live session truth.
            print("Protected mobile session cache could not be updated: \(error.localizedDescription)")
        }
    }

    nonisolated private static func protectedSessionCacheURL() -> URL? {
        guard let applicationSupport = FileManager.default.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        ).first else {
            return nil
        }
        return applicationSupport
            .appendingPathComponent("QuipslyCapture", isDirectory: true)
            .appendingPathComponent(cacheDirectoryName, isDirectory: true)
            .appendingPathComponent(cacheFileName, isDirectory: false)
    }
}

// MARK: - Reframing Engine Models

struct TransformKeyframe: Codable, Identifiable {
    var id: String
    var timeOffset: Double // Seconds from the start of the clip
    var scale: Double?     // Zoom (2D) or FOV (360)
    var x: Double?         // Pan X (2D) or Yaw (360)
    var y: Double?         // Pan Y (2D) or Pitch (360)
    var rotation: Double?  // Roll
    var easing: String?    // "linear" or "ease-in-out"
}
