import Combine
import Foundation

enum CaptureRootTab: String, CaseIterable, Identifiable {
    case today
    case record
    case work
    case library
    case account

    var id: String { rawValue }

    var title: String {
        switch self {
        case .today: "Today"
        case .record: "Record"
        case .work: "Work"
        case .library: "Library"
        case .account: "Account"
        }
    }

    var systemImage: String {
        switch self {
        case .today: "sun.max"
        case .record: "record.circle"
        case .work: "square.grid.2x2"
        case .library: "waveform"
        case .account: "person.crop.circle"
        }
    }
}

enum CaptureWorkEntityKind: String, Equatable {
    case task
    case goal
}

enum CaptureDeepLinkFocusResult: Equatable {
    case opened(CaptureRootTab)
    case retryWhenOnline
    case rejected
}

struct CaptureWorkNavigationRequest: Identifiable, Equatable {
    let id = UUID()
    let kind: CaptureWorkEntityKind
    let entityID: String
    let title: String
    let projectID: String

    var scrollID: String {
        switch kind {
        case .task: "CaptureWorkTask_\(entityID)"
        case .goal: "CaptureWorkGoal_\(entityID)"
        }
    }
}

enum CaptureRecordingMode: String, CaseIterable, Identifiable {
    case audio
    case podcastAV
    case soloVideo
    case podcastCamera

    var id: String { rawValue }

    var title: String {
        switch self {
        case .audio: "Audio"
        case .podcastAV: "Podcast audio + video"
        case .soloVideo: "Solo video"
        case .podcastCamera: "Podcast camera"
        }
    }

    var shortTitle: String {
        switch self {
        case .audio: "Audio"
        case .podcastAV: "A/V"
        case .soloVideo: "Solo"
        case .podcastCamera: "Camera"
        }
    }

    var systemImage: String {
        switch self {
        case .audio: "waveform"
        case .podcastAV: "waveform.and.camera"
        case .soloVideo: "person.crop.rectangle"
        case .podcastCamera: "video"
        }
    }

    var recordsVideo: Bool { self != .audio }
    var movieIncludesAudio: Bool { self == .soloVideo }
    var usesStandaloneAudioRecorder: Bool {
        self == .audio || self == .podcastAV
    }
    var requiresAudioConsent: Bool {
        self != .podcastCamera
    }
    var isCoordinatedPodcastCapture: Bool {
        self == .podcastAV
    }

    var detail: String {
        switch self {
        case .audio:
            "A high-quality local microphone source. The live room remains a separate call."
        case .podcastAV:
            "Two local masters: the selected microphone plus a video-only camera file in one capture group. The live room remains the call."
        case .soloVideo:
            "Camera and microphone in one local movie for a solo episode, short, or YouTube recording."
        case .podcastCamera:
            "A video-only camera master while the LiveKit room carries conversation audio. Quipsly aligns the sources later."
        }
    }
}

enum CaptureLaunchConfiguration {
    nonisolated private static let shareOwnerPreviewPrefix = "--capture-share-owner-ui-preview="
    nonisolated private static let previewSessionPrefix = "--capture-ui-preview-session="

    static var usesLoginPreview: Bool {
        #if DEBUG
        ProcessInfo.processInfo.arguments.contains("--capture-login-ui-preview")
        #else
        false
        #endif
    }

    static var usesPreviewData: Bool {
        #if DEBUG
        ProcessInfo.processInfo.arguments.contains("--capture-ui-preview")
        #else
        false
        #endif
    }

    /// The compiled simulator acceptance flight exercises the real recorder,
    /// file, upload, playback, and recovery paths. It intentionally suppresses
    /// only the 10 Hz presentation timer so XCTest can reach quiescence between
    /// controls; source timestamps and finalized media duration remain real.
    static var usesRuntimeSmoke: Bool {
        #if DEBUG && targetEnvironment(simulator)
        ProcessInfo.processInfo.arguments.contains(
            "--quipsly-capture-runtime-smoke"
        )
        #else
        false
        #endif
    }

    /// A DEBUG-only presentation layer for deterministic App Store layout
    /// drafts. It uses the same mutation-free preview model, but removes
    /// engineering boundary labels and substitutes clearly fictional account
    /// data so the captured product story matches the shipping experience.
    /// The release build can never enable this branch.
    static var usesAppStorePresentation: Bool {
        #if DEBUG
        usesPreviewData
            && ProcessInfo.processInfo.arguments.contains(
                "--capture-app-store-presentation"
            )
        #else
        false
        #endif
    }

    static var usesConsentNeededNextPreview: Bool {
        #if DEBUG && targetEnvironment(simulator)
        usesPreviewData
            && ProcessInfo.processInfo.arguments.contains(
                "--capture-consent-needed-next-preview"
            )
        #else
        false
        #endif
    }

    static var usesReminderDeterministicUITest: Bool {
        #if DEBUG && targetEnvironment(simulator)
        ProcessInfo.processInfo.arguments.contains("--capture-reminder-deterministic-ui-test")
        #else
        false
        #endif
    }

    static var usesFocusOutboxUITest: Bool {
        #if DEBUG && targetEnvironment(simulator)
        usesPreviewData
            && ProcessInfo.processInfo.arguments.contains(
                "--capture-focus-outbox-ui-test"
            )
        #else
        false
        #endif
    }

    static var usesTranscriptReviewOutboxUITest: Bool {
        #if DEBUG && targetEnvironment(simulator)
        usesPreviewData
            && ProcessInfo.processInfo.arguments.contains(
                "--capture-transcript-review-outbox-ui-test"
            )
        #else
        false
        #endif
    }

    static var usesSessionPreflightOutboxUITest: Bool {
        #if DEBUG && targetEnvironment(simulator)
        usesPreviewData
            && ProcessInfo.processInfo.arguments.contains(
                "--capture-session-preflight-outbox-ui-test"
            )
        #else
        false
        #endif
    }

    static var usesRecordingReceiptOutboxUITest: Bool {
        #if DEBUG && targetEnvironment(simulator)
        usesPreviewData
            && ProcessInfo.processInfo.arguments.contains(
                "--capture-recording-receipt-outbox-ui-test"
            )
        #else
        false
        #endif
    }

    static var usesWaitingForHostDeterministicUITest: Bool {
        #if DEBUG && targetEnvironment(simulator)
        usesPreviewData
            && ProcessInfo.processInfo.arguments.contains(
                "--capture-waiting-for-host-ui-test"
            )
        #else
        false
        #endif
    }

    static var usesStaleFollowUpPreview: Bool {
        #if DEBUG && targetEnvironment(simulator)
        usesPreviewData
            && ProcessInfo.processInfo.arguments.contains(
                "--capture-follow-up-source-changed-preview"
            )
        #else
        false
        #endif
    }

    static var previewTab: CaptureRootTab? {
        #if DEBUG
        let prefix = "--capture-ui-preview-tab="
        guard let argument = ProcessInfo.processInfo.arguments.first(where: { $0.hasPrefix(prefix) }) else {
            return nil
        }
        return CaptureRootTab(rawValue: String(argument.dropFirst(prefix.count)))
        #else
        return nil
        #endif
    }

    /// Selects one explicit deterministic fixture for a simulator acceptance
    /// flight. Keeping the fixture identity in the launch contract prevents a
    /// podcast test from silently exercising whichever coaching Session
    /// happens to sort first as preview dates move forward.
    static var previewSessionID: String? {
        #if DEBUG && targetEnvironment(simulator)
        guard usesPreviewData,
              let argument = ProcessInfo.processInfo.arguments.first(
                  where: { $0.hasPrefix(previewSessionPrefix) }
              ) else { return nil }
        let value = String(argument.dropFirst(previewSessionPrefix.count))
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return value.isEmpty ? nil : value
        #else
        return nil
        #endif
    }

    /// A simulator-only owner used to exercise the real Share Extension and
    /// protected handoff without a production account or network mutation.
    nonisolated static var shareExtensionUITestOwner: String? {
        #if DEBUG && targetEnvironment(simulator)
        guard let argument = ProcessInfo.processInfo.arguments.first(where: { $0.hasPrefix(shareOwnerPreviewPrefix) }) else {
            return nil
        }
        let value = String(argument.dropFirst(shareOwnerPreviewPrefix.count))
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard value != "none", !value.isEmpty, value.count <= 256 else { return nil }
        return value
        #else
        return nil
        #endif
    }
}

struct CaptureStudioHandoffFeedback: Equatable {
    let sessionID: String
    let message: String
    let isError: Bool
}

struct CaptureSessionEntryNotice: Equatable {
    let sessionID: String
    let message: String
}

@MainActor
final class CaptureExperienceModel: ObservableObject {
    @Published var selectedSessionID: String?
    @Published var isRefreshing = false
    @Published private(set) var hasCompletedInitialSessionAuthorityLoad = false
    @Published var isCreatingSession = false
    @Published var isChangingConsent = false
    @Published var isChangingCapture = false
    @Published var isChangingRoom = false
    @Published var newSessionTitle = ""
    @Published var newSessionPurpose = "COACHING"
    @Published var newSessionCoachingEngagementID = ""
    @Published var message: String?
    @Published var errorMessage: String?
    @Published private(set) var sessionEntryNotice: CaptureSessionEntryNotice?
    @Published private(set) var workNavigationRequest: CaptureWorkNavigationRequest?
    @Published var preparedRoomJoin: MobileCaptureRoomJoinResponse?
    @Published private(set) var activeCaptureSession: MobileCaptureSession?
    @Published private(set) var activeVideoCaptureSession: MobileCaptureSession?
    @Published private(set) var activeVideoCaptureMode: CaptureRecordingMode?
    @Published private(set) var activeCoordinatedCaptureGroupID: UUID?
    @Published private(set) var isCoordinatingPodcastCapture = false
    @Published private(set) var activeRoomSession: MobileCaptureSession?
    @Published private(set) var ownsRoomCameraPreview = false
    @Published private(set) var captureReceiptNotice: String?
    @Published private(set) var captureSafetyNotice: String?
    @Published private(set) var isSyncingQuickEntries = false
    @Published private(set) var quickEntrySyncMessage: String?
    @Published private(set) var isSyncingSessionNoteEdits = false
    @Published private(set) var sessionNoteEditMessage: String?
    @Published private(set) var sessionNoteEditMessageRoomID: String?
    @Published private(set) var isPromotingRecordingToStudio = false
    @Published private(set) var studioHandoffFeedback: CaptureStudioHandoffFeedback?

    let sessionClient = CaptureSessionClient()
    let todayClient = CaptureTodayClient()
    let workClient = CaptureWorkClient()
    let calendarSubscriptionClient = CaptureCalendarSubscriptionClient()
    let coachingRunwayClient = MobileCoachingRunwayClient()
    let coachingFormsClient = MobileCoachingFormsClient()
    let sourceInboxClient = CaptureSourceInboxClient()
    let providerRoom = ProviderRoomController.shared
    let recordingCoordinator = CaptureRecordingCoordinator()
    let readinessClient = CaptureReadinessClient()
    let reviewDigestClient = CaptureReviewDigestClient()
    let uploadManager = UploadManager.shared
    let receiptStore = CaptureRoomReceiptStore.shared
    let endpointQueueOutbox = CaptureEndpointQueueOutbox.shared
    let sourcePlanOutbox = CaptureSourcePlanOutbox.shared
    let quickEntryOutbox = MobileQuickEntryOutbox.shared
    let sessionNoteEditOutbox = SessionNoteEditOutbox.shared
    // Reminder status is observed by its small projection view. Forwarding its
    // changes through this root model relays out the entire recorder surface
    // while sheets dismiss and can make accessibility traversal unresponsive.
    let taskReminderScheduler = TaskReminderScheduler.shared

    private(set) var usesPreviewData: Bool
    private var activeCaptureID: UUID?
    private var activeCaptureOwnerSnapshot: AuthManager.StableOwnerSnapshot?
    private var activeVideoCaptureOwnerSnapshot: AuthManager.StableOwnerSnapshot?
    private weak var activeAudioCapture: AudioCaptureController?
    private weak var activeVideoCapture: VideoCaptureController?
    private var captureRequiresNewTake = false
    private var receiptFlushTask: Task<Void, Never>?
    private var receiptFlushTaskID: UUID?
    private var sourceExitMonitorTask: Task<Void, Never>?
    private var sourceExitMonitorTaskID: UUID?
    private var consentMonitorTask: Task<Void, Never>?
    private var videoConsentMonitorTask: Task<Void, Never>?
    private var isStoppingCoordinatedCapture = false
    private var didReconcileReceiptOutbox = false
    private var initialSessionAuthorityVerifiedAt: Date?
    private var observedReceiptOwnerAccountID: String?
    private var automaticallyQueuedRecoveredRecordingIDs = Set<UUID>()
    private var isChildModelRefreshScheduled = false
    private var suppressesChildModelRefreshesUntilInitialLoadCompletes = true
    private var cancellables = Set<AnyCancellable>()

    init(usesPreviewData: Bool? = nil) {
        self.usesPreviewData = usesPreviewData ?? CaptureLaunchConfiguration.usesPreviewData
        observedReceiptOwnerAccountID = normalizedOwnerAccountID(AuthManager.currentStoredOwnerID())
        sessionClient.objectWillChange
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.scheduleChildModelRefresh() }
            .store(in: &cancellables)
        todayClient.objectWillChange
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.scheduleChildModelRefresh() }
            .store(in: &cancellables)
        workClient.objectWillChange
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.scheduleChildModelRefresh() }
            .store(in: &cancellables)
        calendarSubscriptionClient.objectWillChange
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.scheduleChildModelRefresh() }
            .store(in: &cancellables)
        coachingRunwayClient.objectWillChange
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.scheduleChildModelRefresh() }
            .store(in: &cancellables)
        coachingFormsClient.objectWillChange
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.scheduleChildModelRefresh() }
            .store(in: &cancellables)
        sourceInboxClient.objectWillChange
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.scheduleChildModelRefresh() }
            .store(in: &cancellables)
        providerRoom.objectWillChange
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.scheduleChildModelRefresh() }
            .store(in: &cancellables)
        recordingCoordinator.objectWillChange
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.scheduleChildModelRefresh() }
            .store(in: &cancellables)
        readinessClient.objectWillChange
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.scheduleChildModelRefresh() }
            .store(in: &cancellables)
        reviewDigestClient.objectWillChange
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.scheduleChildModelRefresh() }
            .store(in: &cancellables)
        uploadManager.objectWillChange
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.scheduleChildModelRefresh() }
            .store(in: &cancellables)
        receiptStore.objectWillChange
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.scheduleChildModelRefresh() }
            .store(in: &cancellables)
        // Endpoint/source-plan outboxes are durable background coordinators.
        // Their narrow status UI observes them directly; forwarding every
        // ledger reconciliation through this root model needlessly rebuilds
        // the entire Capture shell and can re-enter SwiftUI during launch.
        LocalRecordingLibrary.shared.$recordings
            .debounce(for: .milliseconds(350), scheduler: RunLoop.main)
            .sink { [weak self] recordings in
                guard let self else { return }
                self.endpointQueueOutbox.reconcile(recordings: recordings, client: self.sessionClient)
                self.sourcePlanOutbox.reconcile(recordings: recordings, client: self.sessionClient)
                self.queueRecoveredUploadsWhenSafe(recordings)
            }
            .store(in: &cancellables)
        sessionNoteEditOutbox.objectWillChange
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.scheduleChildModelRefresh() }
            .store(in: &cancellables)
        taskReminderScheduler.activateOwner(observedReceiptOwnerAccountID)
        sessionNoteEditOutbox.activateOwner(observedReceiptOwnerAccountID)
        NotificationCenter.default.publisher(for: .quipslyCaptureAccountIdentityDidChange)
            .sink { [weak self] notification in
                self?.handleReceiptAccountIdentityChange(notification.object as? String)
            }
            .store(in: &cancellables)
        providerRoom.$isConnected
            .combineLatest(providerRoom.$isConnecting)
            .dropFirst()
            .sink { [weak self] state in
                let (isConnected, isConnecting) = state
                guard !isConnected, !isConnecting else { return }
                self?.activeRoomSession = nil
                self?.preparedRoomJoin = nil
            }
            .store(in: &cancellables)
        providerRoom.protectLocalSourceBeforeNativeCallEnd = { [weak self] in
            guard let self else { return false }
            return await self.protectLocalSourceForNativeCallEnd()
        }
        providerRoom.onCallTransportInterrupted = { [weak self] date in
            self?.activeAudioCapture?.noteProviderCallTransportInterrupted(at: date)
        }
        providerRoom.onCallTransportRestored = { [weak self] date in
            self?.activeAudioCapture?.noteProviderCallTransportRestored(at: date)
        }
    }

    /// Child stores often finish authentication and recovery together while
    /// SwiftUI is replacing the signed-in shell. Coalesce those notifications
    /// into one refresh on the next run-loop turn instead of recursively
    /// invalidating the root recorder surface from inside a view update.
    private func scheduleChildModelRefresh() {
        guard !suppressesChildModelRefreshesUntilInitialLoadCompletes else { return }
        guard !isChildModelRefreshScheduled else { return }
        isChildModelRefreshScheduled = true
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.isChildModelRefreshScheduled = false
            self.objectWillChange.send()
        }
    }

    var sessions: [MobileCaptureSession] {
        sessionClient.sessions
    }

    var captureProjects: [MobileCaptureProjectDestination] {
        sessionClient.captureProjects
    }

    var coachingEngagements: [MobileCaptureCoachingEngagement] {
        sessionClient.coachingEngagements
    }

    var selectedNewSessionCoachingEngagement: MobileCaptureCoachingEngagement? {
        guard newSessionPurpose == "COACHING",
              !newSessionCoachingEngagementID.isEmpty else { return nil }
        return coachingEngagements.first { $0.id == newSessionCoachingEngagementID }
    }

    var selectedSession: MobileCaptureSession? {
        if let activeCaptureSession { return activeCaptureSession }
        if let activeVideoCaptureSession { return activeVideoCaptureSession }
        if let activeRoomSession { return activeRoomSession }
        if let selectedSessionID,
           let selected = sessions.first(where: { $0.id == selectedSessionID }) {
            return selected
        }
        return sessions.first
    }

    var selectedSessionSourceExitReadiness: MobileCaptureSourceExitReadiness? {
        guard let roomID = selectedSession?.callRoomId else { return nil }
        if let readiness = reviewDigestClient.response?.digest?.sessions?
            .first(where: { $0.callRoomId == roomID })?
            .sourceExitReadiness {
            return readiness
        }
        return reviewDigestClient.response?.digest?.finishActions?
            .first(where: { $0.callRoomId == roomID })?
            .sourceExitReadiness
    }

    var nextSession: MobileCaptureSession? {
        let activeSessions = sessions.filter {
            !["ENDED", "CANCELED", "FAILED"].contains(($0.status ?? "").uppercased())
        }
        return activeSessions.min { left, right in
            switch (left.scheduledStart, right.scheduledStart) {
            case let (leftDate?, rightDate?):
                return leftDate < rightDate
            case (_?, nil):
                return true
            case (nil, _?):
                return false
            case (nil, nil):
                return left.id < right.id
            }
        } ?? sessions.first
    }

    var isProviderConnected: Bool {
        providerRoom.isConnected
    }

    /// Provider audio transitions are intentionally serialized outside a v1
    /// local take. The local source must not inherit route or engine changes
    /// from join, leave, or mute actions while it is recording or being saved.
    var providerControlsLockedForLocalCapture: Bool {
        if isChangingCapture { return true }
        if activeCoordinatedCaptureGroupID != nil { return true }
        if activeVideoCaptureMode == .soloVideo,
           let state = activeVideoCapture?.state,
           state.isActive || state == .paused {
            return true
        }
        guard let state = activeAudioCapture?.captureState else { return false }
        switch state {
        case .recording, .paused, .finalizing:
            return true
        default:
            return false
        }
    }

    var providerControlsLockMessage: String {
        "Joining, leaving, and source-owning room changes are locked while a local audio-bearing take or coordinated podcast group is recording, paused, or saving. Ordinary Mute and Speaker controls remain available when safe."
    }

    /// Muting the outbound call track is safe while a provider-owned local
    /// master observes the same still-running input. Other provider changes
    /// remain serialized outside the take because they can reconfigure the
    /// audio session or end the room entirely.
    var providerMuteControlLockedForLocalCapture: Bool {
        if isChangingCapture { return true }
        if activeCoordinatedCaptureGroupID != nil {
            return activeAudioCapture?.isUsingProviderAudioMaster != true
        }
        if activeVideoCaptureMode == .soloVideo,
           let state = activeVideoCapture?.state,
           state.isActive || state == .paused {
            return true
        }
        guard let state = activeAudioCapture?.captureState else { return false }
        switch state {
        case .recording, .paused:
            return activeAudioCapture?.isUsingProviderAudioMaster != true
        case .finalizing:
            return true
        default:
            return false
        }
    }

    var providerMuteControlLockMessage: String {
        "Mute is briefly unavailable while Quipsly starts or protects the local recording. Try again when the recording status settles."
    }

    var isSessionContextLocked: Bool {
        activeCaptureSession != nil
            || activeVideoCaptureSession != nil
            || activeRoomSession != nil
            || providerRoom.isConnected
            || providerRoom.isConnecting
            || isChangingCapture
            || isChangingRoom
            || isChangingConsent
    }

    func load() async {
        guard !isRefreshing else { return }
        isRefreshing = true
        defer {
            suppressesChildModelRefreshesUntilInitialLoadCompletes = false
            isRefreshing = false
        }
        errorMessage = nil

        if usesPreviewData {
            if let previewOwner = CaptureLaunchConfiguration.shareExtensionUITestOwner {
                quickEntryOutbox.activateOwner(previewOwner)
                sessionNoteEditOutbox.activateOwner(previewOwner)
                let importedSharedSources = quickEntryOutbox.importShareExtensionCaptures()
                if importedSharedSources > 0 {
                    quickEntrySyncMessage = "Imported \(importedSharedSources) protected Share Sheet source\(importedSharedSources == 1 ? "" : "s") into this account's outbox."
                }
            }
            await taskReminderScheduler.reconcile(
                drafts: quickEntryOutbox.entries.compactMap(\.taskReminderDraft)
            )
            sessionClient.sessions = MobileCaptureSession.capturePreviewFixtures
            sessionClient.captureProjects = [
                MobileCaptureProjectDestination(
                    id: "preview-home",
                    slug: "preview-home",
                    name: "Charlie Home Nest",
                    role: "OWNER",
                    isHomeNest: true,
                    availableTags: [
                        MobileCaptureTag(id: "preview-home-personal", slug: "personal", label: "Personal"),
                    ]
                ),
                MobileCaptureProjectDestination(
                    id: "preview-high-ground",
                    slug: "preview-high-ground",
                    name: "High Ground Odyssey",
                    role: "EDITOR",
                    isHomeNest: false,
                    availableTags: [
                        MobileCaptureTag(id: "preview-episode-4", slug: "episode-4", label: "Episode 4"),
                        MobileCaptureTag(id: "preview-proof-listen", slug: "proof-listen", label: "Proof listen"),
                    ]
                ),
            ]
            let previewCoachingSession = sessionClient.sessions.first {
                $0.coachingEngagementId == "preview-engagement"
            }
            sessionClient.coachingEngagements = [
                MobileCaptureCoachingEngagement(
                    id: "preview-engagement",
                    title: "Coaching with Homer",
                    status: "ACTIVE",
                    projectId: "preview-high-ground",
                    projectSlug: "preview-high-ground",
                    projectName: "High Ground Odyssey",
                    clientLabel: "Homer",
                    coachLabel: "Charlie Sparrow",
                    priority: MobileCaptureCoachingClientPriority(
                        schema: MobileCaptureCoachingClientPriority.schemaVersion,
                        kind: "PREPARE_UPCOMING_SESSION",
                        tone: "upcoming",
                        rank: 2,
                        roomId: previewCoachingSession?.callRoomId,
                        roomTitle: previewCoachingSession?.title,
                        scheduledStart: previewCoachingSession?.scheduledStart,
                        overdueCommitmentCount: 0,
                        deterministic: true,
                        externalSideEffects: false
                    )
                ),
            ]
            todayClient.loadPreview()
            workClient.loadPreview()
            calendarSubscriptionClient.loadPreview()
            coachingRunwayClient.loadPreview()
            let configuredCoachingRole = ProcessInfo.processInfo.environment[
                "CAPTURE_COACHING_PREVIEW_ROLE"
            ]?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            let explicitCoachPreview = configuredCoachingRole == "coach"
                || ProcessInfo.processInfo.arguments.contains(
                "--capture-coach-booking-preview"
            ) || ProcessInfo.processInfo.arguments.contains(
                "--capture-coaching-forms-coach-preview"
            )
            coachingFormsClient.loadPreview(
                isCoach: configuredCoachingRole != "client"
                    && (explicitCoachPreview
                        || !ProcessInfo.processInfo.arguments.contains(
                        "--capture-client-booking-preview"
                    ))
            )
            sourceInboxClient.loadPreview()
            reviewDigestClient.loadPreview()
            sessionClient.status = "Preview ready"
            let requestedPreviewSessionID = CaptureLaunchConfiguration
                .previewSessionID
                .flatMap { requestedID in
                    sessionClient.sessions.contains(where: {
                        $0.id == requestedID
                    }) ? requestedID : nil
                }
            selectedSessionID = selectedSessionID
                ?? requestedPreviewSessionID
                ?? sessionClient.sessions.first?.id
            hasCompletedInitialSessionAuthorityLoad = true
            return
        }

        if !didReconcileReceiptOutbox {
            receiptStore.closeOrphanedStarts()
            didReconcileReceiptOutbox = true
        }
        if let rejection = receiptStore.latestTerminalRejectionMessage {
            captureReceiptNotice = "Nest preserved a capture receipt but held the room-state change: \(rejection)"
        }
        scheduleReceiptFlush()
        let importedSharedSources = quickEntryOutbox.importShareExtensionCaptures()
        if importedSharedSources > 0 {
            quickEntrySyncMessage = "Imported \(importedSharedSources) protected Share Sheet source\(importedSharedSources == 1 ? "" : "s") into this account's outbox."
        }
        async let sessionLoad = loadInitialSessionAuthority()
        async let todayLoad: Void = todayClient.load()
        async let workLoad: Void = workClient.load(projectID: workClient.selectedProjectID)
        async let calendarLoad: Void = calendarSubscriptionClient.load()
        async let coachingLoad: Void = coachingRunwayClient.load()
        async let coachingFormsLoad: Void = coachingFormsClient.load()
        async let sourceInboxLoad: Void = sourceInboxClient.load()
        async let readinessLoad: Void = readinessClient.load()
        async let reviewDigestLoad: Void = reviewDigestClient.load()
        async let recordingReceiptFlush: Void = recordingCoordinator
            .flushPendingReceipts()
        _ = await (
            sessionLoad,
            todayLoad,
            workLoad,
            calendarLoad,
            coachingLoad,
            coachingFormsLoad,
            sourceInboxLoad,
            readinessLoad,
            reviewDigestLoad,
            recordingReceiptFlush
        )
        // The Library can finish crash validation before Nest has restored
        // network authority. Re-evaluate recovered sources after the signed-in
        // product load so an early protected/offline emission is not the only
        // chance to resume its durable upload.
        queueRecoveredUploadsWhenSafe(LocalRecordingLibrary.shared.recordings)
        sourcePlanOutbox.resume(client: sessionClient)
        await taskReminderScheduler.reconcile(
            drafts: quickEntryOutbox.entries.compactMap(\.taskReminderDraft)
        )
        await retryQuickEntries(automatic: true)
        await retrySessionNoteEdits(automatic: true)
        if selectedSessionID == nil || !sessions.contains(where: { $0.id == selectedSessionID }) {
            selectedSessionID = nextSession?.id
        }
        errorMessage = sessionClient.errorMessage
    }

    /// Session links are the shortest path into a live call. Publish this
    /// narrow readiness barrier as soon as the canonical Session collection
    /// returns; Today, Work, Calendar, review, and outbox refreshes can finish
    /// independently without holding the requested room behind a dashboard.
    private func loadInitialSessionAuthority() async -> CaptureSessionLoadOutcome {
        let outcome = await sessionClient.load()
        initialSessionAuthorityVerifiedAt = outcome == .loaded
            && !sessionClient.sessionsAreStale
            ? Date()
            : nil
        hasCompletedInitialSessionAuthorityLoad = true
        return outcome
    }

    /// Refreshes the narrow, authoritative Session projection when Record
    /// becomes visible or Capture returns to the foreground. This keeps remote
    /// participant consent and room readiness current without turning the
    /// phone's idle lobby into a permanent polling client. Active recording
    /// coordination has its own tighter monitor and remains the safety owner
    /// once a take starts.
    func refreshSelectedSessionEntryReadiness() async {
        guard !usesPreviewData,
              !isRefreshing,
              AuthManager.shared.networkActionsAllowed else { return }

        isRefreshing = true
        defer { isRefreshing = false }
        let selectedID = selectedSession?.id
        let outcome = await sessionClient.load(authoritativeSessionID: selectedID)

        if let selectedID,
           sessionClient.sessions.contains(where: { $0.id == selectedID }) {
            selectedSessionID = selectedID
        }

        switch outcome {
        case .loaded, .transportUnavailable:
            // Preserve the last protected projection during a transient outage.
            // The inline authority status already communicates stale state.
            break
        case .forbidden, .authoritativeAbsent, .invalidResponse:
            errorMessage = sessionClient.errorMessage
        }
    }

    @discardableResult
    func saveQuickEntry(
        kind: MobileQuickEntryKind,
        title: String?,
        body: String,
        saveToHomeNest: Bool = false,
        destinationProjectID: String? = nil,
        destinationProjectName: String? = nil,
        noteKind: MobileSessionNoteKind? = nil,
        noteVisibility: MobileSessionNoteVisibility? = nil,
        tagIDs: [String] = [],
        newTagLabels: [String] = [],
        dueAt: Date? = nil,
        reminderAt: Date? = nil,
        recurrence: MobileQuickEntryRecurrence? = nil
    ) -> Bool {
        let session = kind == .source || saveToHomeNest || destinationProjectID != nil
            ? nil
            : selectedSession
        if usesPreviewData && !CaptureLaunchConfiguration.usesReminderDeterministicUITest {
            quickEntrySyncMessage = "Preview only — no note, task, goal, or source was saved."
            return true
        }

        do {
            let entry = try quickEntryOutbox.enqueue(
                kind: kind,
                session: session,
                title: title,
                body: body,
                destinationProjectID: destinationProjectID,
                destinationProjectName: destinationProjectName,
                noteKind: noteKind,
                noteVisibility: noteVisibility,
                tagIDs: tagIDs,
                newTagLabels: newTagLabels,
                dueAt: dueAt,
                reminderAt: reminderAt,
                recurrence: recurrence
            )
            if usesPreviewData {
                quickEntrySyncMessage = nil
            } else if kind == .source {
                quickEntrySyncMessage = "Source saved on this iPhone. Nest sync will place the same private ID in Inbox."
            } else if let destinationProjectName {
                quickEntrySyncMessage = "\(kind.title) saved on this iPhone for \(destinationProjectName). Nest sync will keep that exact project and retry-safe ID."
            } else if session == nil {
                quickEntrySyncMessage = "\(kind.title) saved on this iPhone. Nest sync will create the same private Home Nest record."
            } else if kind == .note, let noteVisibility {
                quickEntrySyncMessage = "\(noteKind?.title ?? "Session note") saved on this iPhone as \(noteVisibility.title.lowercased()). \(noteVisibility.boundary) Nest sync keeps the same retry-safe ID."
            } else if !newTagLabels.isEmpty {
                quickEntrySyncMessage = "\(kind.title) and \(newTagLabels.count) new tag name\(newTagLabels.count == 1 ? "" : "s") saved on this iPhone. Nest will create or reuse the same private vocabulary on sync."
            } else {
                quickEntrySyncMessage = "\(kind.title) saved on this iPhone. Nest sync uses the same retry-safe ID."
            }
            Task { [weak self] in
                if let reminderDraft = entry.taskReminderDraft {
                    guard let self else { return }
                    let projection = await self.taskReminderScheduler.register(
                        draft: reminderDraft,
                        requestPermissionIfNeeded: true
                    )
                    if case let .failed(message) = projection {
                        self.quickEntryOutbox.markHeld(
                            entry.id,
                            code: "LOCAL_REMINDER_LEDGER_UNAVAILABLE",
                            message: message
                        )
                        self.quickEntrySyncMessage = message
                        return
                    }
                    if self.usesPreviewData { return }
                }
                if self?.usesPreviewData == true { return }
                await self?.syncQuickEntry(entry)
            }
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func clearQuickEntrySyncMessage() {
        quickEntrySyncMessage = nil
    }

    func retryQuickEntries(automatic: Bool = false) async {
        guard !usesPreviewData, !isSyncingQuickEntries else { return }
        if !automatic { quickEntryOutbox.releaseHeldEntriesForRetry() }
        let candidates = quickEntryOutbox.entries.filter { !automatic || $0.disposition == .pending }
        guard !candidates.isEmpty else {
            if !automatic { quickEntrySyncMessage = "No protected quick captures need retry." }
            return
        }

        isSyncingQuickEntries = true
        defer { isSyncingQuickEntries = false }
        var acknowledged = 0
        for entry in candidates {
            let before = quickEntryOutbox.entries.count
            await syncQuickEntry(entry, refreshToday: false)
            if quickEntryOutbox.entries.count < before { acknowledged += 1 }
        }
        if acknowledged > 0 {
            await todayClient.load()
            await workClient.load(projectID: workClient.selectedProjectID)
            await sourceInboxClient.load()
            // A single retry already carries the most useful server-authored
            // acknowledgement (for example, the exact Home Nest note
            // destination). Preserve that message so reconnect does not turn a
            // specific success into a vague batch receipt.
            if acknowledged > 1 {
                quickEntrySyncMessage = "Synced \(acknowledged) quick captures to canonical Nest records."
            }
        }
    }

    private func syncQuickEntry(_ entry: PendingMobileQuickEntry, refreshToday: Bool = true) async {
        guard quickEntryOutbox.entries.contains(where: { $0.id == entry.id }) else { return }
        if let reminderDraft = entry.taskReminderDraft {
            let projection = await taskReminderScheduler.register(
                draft: reminderDraft,
                requestPermissionIfNeeded: false
            )
            if case let .failed(message) = projection {
                quickEntryOutbox.markHeld(
                    entry.id,
                    code: "LOCAL_REMINDER_LEDGER_UNAVAILABLE",
                    message: message
                )
                quickEntrySyncMessage = message
                return
            }
        }
        switch await sessionClient.syncQuickEntry(entry) {
        case let .acknowledged(_, idempotentReplay, message, reminder):
            if let reminderDraft = entry.taskReminderDraft,
               !taskReminderScheduler.confirmCanonical(
                    reminder?.canonicalAcknowledgement,
                    for: reminderDraft
               ) {
                let mismatch = "Nest returned a different reminder identity. The protected phone copy is held for review; no duplicate notification was scheduled."
                quickEntryOutbox.markHeld(entry.id, code: "REMINDER_IDENTITY_CONFLICT", message: mismatch)
                quickEntrySyncMessage = mismatch
                return
            }
            quickEntryOutbox.markAcknowledged(entry.id)
            quickEntrySyncMessage = idempotentReplay
                ? "Nest already had this exact \(entry.kind.title.lowercased()); nothing was duplicated."
                : message
            if entry.kind == .note, let sessionID = entry.sessionID {
                _ = await sessionClient.load(authoritativeSessionID: sessionID)
            }
            if refreshToday {
                await todayClient.load()
                await workClient.load(projectID: entry.destinationProjectID ?? workClient.selectedProjectID)
                if entry.kind == .source {
                    await sourceInboxClient.load()
                }
            }
        case let .retryable(message):
            quickEntryOutbox.markRetryable(entry.id, message: message)
            quickEntrySyncMessage = message
        case let .held(code, message):
            quickEntryOutbox.markHeld(entry.id, code: code, message: message)
            quickEntrySyncMessage = message
        }
    }

    func pendingSessionNoteEdit(for noteID: String) -> PendingSessionNoteEdit? {
        sessionNoteEditOutbox.edit(for: noteID)
    }

    @discardableResult
    func saveSessionNoteEdit(
        note: MobileCaptureSessionNote,
        roomID: String,
        title: String?,
        body: String,
        noteKind: MobileSessionNoteKind,
        noteVisibility: MobileSessionNoteVisibility,
        tagIDs: [String],
        replacingHeld: Bool
    ) -> Bool {
        if usesPreviewData {
            sessionNoteEditMessage = "Preview only — no canonical Session note or revision was changed."
            sessionNoteEditMessageRoomID = roomID
            return true
        }
        guard let expectedUpdatedAt = note.updatedAt, !expectedUpdatedAt.isEmpty else {
            errorMessage = "Refresh this Session before editing its canonical note."
            return false
        }
        do {
            let edit = try sessionNoteEditOutbox.enqueue(
                roomID: roomID,
                noteID: note.id,
                title: title,
                body: body,
                noteKind: noteKind,
                noteVisibility: noteVisibility,
                tagIDs: tagIDs,
                expectedUpdatedAt: expectedUpdatedAt,
                replacingHeld: replacingHeld
            )
            sessionNoteEditMessage = "The complete note edit is protected on this iPhone. Nest will recheck authorship, Session access, audience, tags, and revision before applying it."
            sessionNoteEditMessageRoomID = roomID
            Task { [weak self] in
                await self?.syncSessionNoteEdit(edit)
            }
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func retrySessionNoteEdits(automatic: Bool = false) async {
        guard !usesPreviewData, !isSyncingSessionNoteEdits else { return }
        let candidates = sessionNoteEditOutbox.entries.filter { $0.disposition == .pending }
        guard !candidates.isEmpty else {
            if !automatic {
                let held = sessionNoteEditOutbox.entries.first { $0.disposition == .held }
                sessionNoteEditMessage = held == nil
                    ? "No note changes are waiting."
                    : "A note changed elsewhere. Review your changes before saving."
                sessionNoteEditMessageRoomID = held?.roomID
            }
            return
        }
        isSyncingSessionNoteEdits = true
        defer { isSyncingSessionNoteEdits = false }
        for edit in candidates {
            await syncSessionNoteEdit(edit, refreshSession: false)
        }
        _ = await sessionClient.load()
    }

    func discardSessionNoteEdit(noteID: String) async {
        let roomID = sessionNoteEditOutbox.edit(for: noteID)?.roomID
        sessionNoteEditOutbox.discard(noteID: noteID)
        sessionNoteEditMessage = "The protected iPhone draft was discarded. The canonical Nest note was not changed."
        sessionNoteEditMessageRoomID = roomID
        _ = await sessionClient.load()
    }

    private func syncSessionNoteEdit(
        _ edit: PendingSessionNoteEdit,
        refreshSession: Bool = true
    ) async {
        guard sessionNoteEditOutbox.entries.contains(where: { $0.id == edit.id }) else { return }
        guard AuthManager.shared.networkActionsAllowed else {
            sessionNoteEditMessage = "You're offline. Your changes are saved on this iPhone and will sync when you reconnect."
            sessionNoteEditMessageRoomID = edit.roomID
            return
        }
        switch await sessionClient.syncSessionNoteEdit(edit) {
        case let .acknowledged(idempotentReplay, message):
            sessionNoteEditOutbox.markAcknowledged(edit.id)
            sessionNoteEditMessage = idempotentReplay
                ? "Nest had already applied this exact protected note edit; no revision was duplicated."
                : message
            sessionNoteEditMessageRoomID = edit.roomID
            if refreshSession {
                _ = await sessionClient.load(authoritativeSessionID: edit.roomID)
            }
        case let .retryable(message):
            sessionNoteEditOutbox.markRetryable(edit.id, message: message)
            sessionNoteEditMessage = message
            sessionNoteEditMessageRoomID = edit.roomID
        case let .held(code, message):
            sessionNoteEditOutbox.markHeld(edit.id, code: code, message: message)
            sessionNoteEditMessage = message
            sessionNoteEditMessageRoomID = edit.roomID
            if refreshSession {
                _ = await sessionClient.load(authoritativeSessionID: edit.roomID)
            }
        }
    }

    func select(_ session: MobileCaptureSession) {
        if isSessionContextLocked, selectedSession?.id != session.id {
            errorMessage = "Stop and save the active recording or leave the live room before changing sessions."
            return
        }
        if selectedSessionID != session.id {
            if let selectedSessionID {
                CaptureDeepLinkRouter.shared.clearOpenedSessionReceipt(
                    for: selectedSessionID
                )
            }
            sessionEntryNotice = nil
        }
        selectedSessionID = session.id
        preparedRoomJoin = nil
        message = nil
        errorMessage = nil
        guard !usesPreviewData else { return }
        Task { [weak self] in
            await self?.sessionClient.refreshClientFollowUp(forSessionID: session.id)
        }
    }

    func focusSession(
        from deepLink: CaptureSessionDeepLink
    ) async -> CaptureDeepLinkFocusResult {
        guard !usesPreviewData else {
            errorMessage = "App links are disabled in preview mode. Nothing was opened or changed."
            return .rejected
        }
        guard !isSessionContextLocked || selectedSession?.id == deepLink.roomID else {
            errorMessage = "Stop and save the active recording or leave the live room before opening another Session. The app link remains pending."
            return .retryWhenOnline
        }
        guard AuthManager.shared.networkActionsAllowed else {
            errorMessage = "Reconnect and verify this Quipsly account before opening the linked Session. Protected local sources remain available."
            return .retryWhenOnline
        }

        let initialAuthorityIsFresh = initialSessionAuthorityVerifiedAt.map {
            Date().timeIntervalSince($0) <= 15
        } == true
        let initialAuthorityIncludesRoom = initialAuthorityIsFresh
            && !sessionClient.sessionsAreStale
            && sessions.contains(where: { $0.id == deepLink.roomID })
        if !initialAuthorityIncludesRoom {
            let outcome = await sessionClient.load(
                authoritativeSessionID: deepLink.roomID
            )
            switch outcome {
            case .loaded:
                break
            case .transportUnavailable:
                errorMessage = sessionClient.errorMessage
                    ?? "Nest is temporarily unavailable. The Session app link remains pending for retry."
                return .retryWhenOnline
            case .forbidden, .authoritativeAbsent:
                errorMessage = sessionClient.errorMessage
                    ?? "This account cannot open the linked Session. No access was granted."
                return .rejected
            case .invalidResponse:
                errorMessage = sessionClient.errorMessage
                    ?? "Nest could not verify the linked Session. Nothing was opened or changed."
                return .rejected
            }
        }
        guard let session = sessions.first(where: { $0.id == deepLink.roomID }) else {
            errorMessage = "Nest did not return the linked Session for this account. No access was granted."
            return .rejected
        }

        select(session)
        sessionEntryNotice = CaptureSessionEntryNotice(
            sessionID: session.id,
            message: deepLink.mode == .live
                ? "Session opened. Nothing joined or recorded yet."
                : "Session opened. Nothing started automatically."
        )
        let destinationTab: CaptureRootTab = deepLink.mode == .review ? .library : .record
        return .opened(destinationTab)
    }

    func clearSessionEntryNotice(for sessionID: String) {
        if sessionEntryNotice?.sessionID == sessionID {
            sessionEntryNotice = nil
        }
        CaptureDeepLinkRouter.shared.clearOpenedSessionReceipt(for: sessionID)
    }

    func requestWorkNavigation(
        kind: CaptureWorkEntityKind,
        entityID: String,
        title: String,
        projectID: String
    ) {
        workNavigationRequest = CaptureWorkNavigationRequest(
            kind: kind,
            entityID: entityID,
            title: title,
            projectID: projectID
        )
    }

    func finishWorkNavigation(_ request: CaptureWorkNavigationRequest) {
        guard workNavigationRequest?.id == request.id else { return }
        workNavigationRequest = nil
    }

    func createSession() async -> Bool {
        guard !isSessionContextLocked else {
            errorMessage = "Finish the active recording or live room before creating another session."
            return false
        }
        let title = newSessionTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else {
            errorMessage = "Give this session a short title."
            return false
        }
        guard !isCreatingSession else { return false }
        if newSessionPurpose == "COACHING",
           !newSessionCoachingEngagementID.isEmpty,
           selectedNewSessionCoachingEngagement == nil {
            errorMessage = "That Coaching Engagement is no longer available. Refresh Sessions and choose it again."
            return false
        }
        isCreatingSession = true
        defer { isCreatingSession = false }
        errorMessage = nil

        if usesPreviewData {
            let created = MobileCaptureSession.capturePreview(
                id: "preview-\(UUID().uuidString)",
                title: title,
                purpose: newSessionPurpose,
                consentGranted: false,
                scheduledStart: ISO8601DateFormatter().string(from: Date())
            )
            sessionClient.sessions.insert(created, at: 0)
            selectedSessionID = created.id
            newSessionTitle = ""
            message = "Session created. Confirm consent when everyone is ready."
            return true
        }

        guard let created = await sessionClient.createQuickSession(
            title: title,
            purpose: newSessionPurpose,
            projectSlug: selectedNewSessionCoachingEngagement?.projectSlug,
            coachingEngagementId: selectedNewSessionCoachingEngagement?.id
        ) else {
            errorMessage = sessionClient.errorMessage ?? "Quipsly could not create the session."
            return false
        }

        selectedSessionID = created.id
        newSessionTitle = ""
        if let engagement = selectedNewSessionCoachingEngagement {
            message = "Session created in \(engagement.title). Confirm consent when everyone is ready."
        } else {
            message = "Session created. Confirm consent when everyone is ready."
        }
        return true
    }

    @discardableResult
    func grantConsent(
        for expectedSessionID: String,
        canRecordAudio: Bool,
        canRecordVideo: Bool,
        canTranscribe: Bool,
        allAudibleParticipantsNotifiedAndAgreed: Bool,
        presentedAt: Date
    ) async -> Bool {
        guard !isChangingConsent else { return false }
        guard let session = selectedSession,
              session.id == expectedSessionID else {
            errorMessage = "The selected Quipsly session changed. Review the consent choices again before saving."
            return false
        }
        guard activeCaptureSession == nil, activeVideoCaptureSession == nil else {
            errorMessage = "Consent cannot change while this iPhone is recording. Stop and save the take first."
            return false
        }
        guard canRecordAudio || canRecordVideo else {
            errorMessage = "Choose audio, video, or both before saving consent. Transcription remains a separate choice."
            return false
        }
        guard allAudibleParticipantsNotifiedAndAgreed else {
            errorMessage = "Confirm that everyone nearby who may be seen or heard was told and agreed before saving consent."
            return false
        }
        let ownerSnapshot = usesPreviewData ? nil : AuthManager.shared.stableOwnerSnapshot()
        guard usesPreviewData || ownerSnapshot != nil else {
            errorMessage = "Verify the current Quipsly account before saving consent."
            return false
        }
        isChangingConsent = true
        defer { isChangingConsent = false }
        errorMessage = nil

        if usesPreviewData {
            replacePreviewSession(
                session,
                consentGranted: true,
                canRecordAudio: canRecordAudio,
                canRecordVideo: canRecordVideo,
                canTranscribe: canTranscribe
            )
            message = consentSavedMessage(
                canRecordAudio: canRecordAudio,
                canRecordVideo: canRecordVideo,
                canTranscribe: canTranscribe,
                preview: true
            )
            return true
        }

        let attestation = MobileCaptureConsentGrantAttestation(
            canRecordAudio: canRecordAudio,
            canRecordVideo: canRecordVideo,
            canTranscribe: canTranscribe,
            allAudibleParticipantsNotifiedAndAgreed: allAudibleParticipantsNotifiedAndAgreed,
            presentedAt: presentedAt
        )
        let consentUpdate = await sessionClient.grantRecordingConsent(
            for: session,
            attestation: attestation
        )
        guard let ownerSnapshot,
              AuthManager.shared.matchesStableOwnerSnapshot(ownerSnapshot) else {
            errorMessage = "The Quipsly account changed while consent was being saved. Review the current account and its session before continuing."
            return false
        }
        guard consentUpdate != nil else {
            errorMessage = sessionClient.errorMessage ?? "Consent could not be recorded."
            return false
        }
        await sessionClient.load()
        guard AuthManager.shared.matchesStableOwnerSnapshot(ownerSnapshot) else {
            errorMessage = "The Quipsly account changed while consent was being refreshed. Review the current account before recording."
            return false
        }
        selectedSessionID = session.id
        message = consentSavedMessage(
            canRecordAudio: canRecordAudio,
            canRecordVideo: canRecordVideo,
            canTranscribe: canTranscribe,
            preview: false
        )
        return true
    }

    private func consentSavedMessage(
        canRecordAudio: Bool,
        canRecordVideo: Bool,
        canTranscribe: Bool,
        preview: Bool
    ) -> String {
        let sourceChoice = canRecordAudio && canRecordVideo
            ? "Audio and video recording"
            : canRecordVideo ? "Video recording" : "Audio recording"
        let transcriptChoice = canTranscribe
            ? " Transcription is also authorized."
            : " Transcription remains off."
        let readiness = preview
            ? " This preview does not contact Nest."
            : " Capture can start when every required participant has agreed to the selected source type."
        return "\(sourceChoice) consent is saved.\(transcriptChoice)\(readiness)"
    }

    @discardableResult
    func declineConsent(for expectedSessionID: String) async -> Bool {
        guard !isChangingConsent else { return false }
        guard let session = selectedSession,
              session.id == expectedSessionID else {
            errorMessage = "The selected Quipsly session changed. Review the recording choice again before saving."
            return false
        }
        guard activeCaptureSession == nil, activeVideoCaptureSession == nil else {
            errorMessage = "The recording choice cannot change while this iPhone is recording. Stop and save the take first."
            return false
        }
        let ownerSnapshot = usesPreviewData ? nil : AuthManager.shared.stableOwnerSnapshot()
        guard usesPreviewData || ownerSnapshot != nil else {
            errorMessage = "Verify the current Quipsly account before saving this recording choice."
            return false
        }
        isChangingConsent = true
        defer { isChangingConsent = false }
        errorMessage = nil

        if usesPreviewData {
            replacePreviewSession(session, consentGranted: false)
            message = "You chose not to be recorded in this preview Session. You can still join the call."
            return true
        }

        let consentUpdate = await sessionClient.declineRecordingConsent(for: session)
        guard let ownerSnapshot,
              AuthManager.shared.matchesStableOwnerSnapshot(ownerSnapshot) else {
            errorMessage = "The Quipsly account changed while the recording choice was being saved. Review the current account before continuing."
            return false
        }
        guard consentUpdate != nil else {
            errorMessage = sessionClient.errorMessage ?? "The recording choice could not be saved."
            return false
        }
        await sessionClient.load()
        guard AuthManager.shared.matchesStableOwnerSnapshot(ownerSnapshot) else {
            errorMessage = "The Quipsly account changed while the recording choice was being refreshed. Review the current account before continuing."
            return false
        }
        selectedSessionID = session.id
        message = "You won't be recorded in this Session. You can still join the call and change this choice later."
        return true
    }

    func revokeConsent() async {
        guard let session = selectedSession, !isChangingConsent else { return }
        guard activeCaptureSession == nil, activeVideoCaptureSession == nil else {
            errorMessage = "Stop and save the active recording before revoking consent."
            return
        }
        isChangingConsent = true
        defer { isChangingConsent = false }
        errorMessage = nil

        if usesPreviewData {
            replacePreviewSession(session, consentGranted: false)
            message = "Consent revoked for this preview session."
            return
        }

        guard let ownerSnapshot = AuthManager.shared.stableOwnerSnapshot() else {
            errorMessage = "Verify the current Quipsly account before revoking consent."
            return
        }

        let consentUpdate = await sessionClient.revokeRecordingConsent(for: session)
        guard AuthManager.shared.matchesStableOwnerSnapshot(ownerSnapshot) else {
            errorMessage = "The Quipsly account changed while consent was being revoked. Review the current account before continuing."
            return
        }
        guard consentUpdate != nil else {
            errorMessage = sessionClient.errorMessage ?? "Consent could not be revoked."
            return
        }
        await sessionClient.load()
        guard AuthManager.shared.matchesStableOwnerSnapshot(ownerSnapshot) else {
            errorMessage = "The Quipsly account changed while consent was being refreshed. Review the current account before recording."
            return
        }
        selectedSessionID = session.id
        message = "Consent revoked. Recording remains stopped."
    }

    func promoteSelectedRecordingToStudio() async {
        guard !isPromotingRecordingToStudio else { return }
        guard let session = selectedSession else {
            errorMessage = "Choose a session before attaching recording media to Studio."
            studioHandoffFeedback = nil
            return
        }
        guard activeCaptureSession == nil, activeVideoCaptureSession == nil else {
            let feedback = "Stop and save the active take before attaching its verified recording to Studio."
            errorMessage = feedback
            studioHandoffFeedback = .init(sessionID: session.id, message: feedback, isError: true)
            return
        }
        if session.recordingPromotedToStudioMedia {
            errorMessage = nil
            let feedback = "This complete capture group is already available in Studio. Every original remains preserved."
            message = feedback
            studioHandoffFeedback = .init(sessionID: session.id, message: feedback, isError: false)
            return
        }
        guard session.canPromoteRecordingToStudioMedia else {
            errorMessage = session.recordingMediaVaultLine
            studioHandoffFeedback = .init(
                sessionID: session.id,
                message: session.recordingMediaVaultLine,
                isError: true
            )
            return
        }
        guard !usesPreviewData else {
            let feedback = "Preview mode shows the Studio handoff without changing media."
            message = feedback
            studioHandoffFeedback = .init(sessionID: session.id, message: feedback, isError: false)
            return
        }
        guard let ownerSnapshot = AuthManager.shared.stableOwnerSnapshot() else {
            let feedback = "Verify the current Quipsly account before attaching recording media to Studio."
            errorMessage = feedback
            studioHandoffFeedback = .init(sessionID: session.id, message: feedback, isError: true)
            return
        }

        isPromotingRecordingToStudio = true
        errorMessage = nil
        studioHandoffFeedback = nil
        defer { isPromotingRecordingToStudio = false }

        let promoted = await sessionClient.promoteRecordingToStudioMedia(for: session)
        guard AuthManager.shared.matchesStableOwnerSnapshot(ownerSnapshot) else {
            let feedback = "The Quipsly account changed during the Studio handoff. Review the current account and session before continuing."
            errorMessage = feedback
            studioHandoffFeedback = .init(sessionID: session.id, message: feedback, isError: true)
            return
        }
        guard promoted else {
            let feedback = sessionClient.errorMessage ?? "The verified recording could not be attached to Studio media."
            errorMessage = feedback
            studioHandoffFeedback = .init(sessionID: session.id, message: feedback, isError: true)
            return
        }

        selectedSessionID = session.id
        let sourceCount = session.studioHandoffSources.count
        let feedback = sourceCount > 1
            ? "Studio handoff complete for all \(sourceCount) capture-group sources. Every immutable original and server receipt remains preserved."
            : "Studio media ready. The immutable local source and server recording evidence remain preserved."
        message = feedback
        studioHandoffFeedback = .init(sessionID: session.id, message: feedback, isError: false)
    }

    func refreshSelectedSessionTruthAfterSourcePlanChange() async {
        guard !usesPreviewData else { return }
        let selectedID = selectedSessionID
        await sessionClient.load()
        await reviewDigestClient.load()
        if let selectedID, sessionClient.sessions.contains(where: { $0.id == selectedID }) {
            selectedSessionID = selectedID
        }
        errorMessage = sessionClient.errorMessage ?? reviewDigestClient.errorMessage
    }

    /// Reconciles ordinary post-call status without making the person operate
    /// a refresh loop. The cadence backs off quickly so long video uploads do
    /// not become a noisy or expensive polling path. Exact source and endpoint
    /// evidence remains available in Recording details.
    func monitorSourceExitReadiness(roomID: String) {
        guard !usesPreviewData,
              AuthManager.shared.networkActionsAllowed else { return }
        sourceExitMonitorTask?.cancel()
        let taskID = UUID()
        sourceExitMonitorTaskID = taskID
        sourceExitMonitorTask = Task { @MainActor [weak self] in
            guard let self else { return }
            defer {
                if self.sourceExitMonitorTaskID == taskID {
                    self.sourceExitMonitorTask = nil
                    self.sourceExitMonitorTaskID = nil
                }
            }
            var retryDelay: UInt64 = 2_000_000_000
            let expiresAt = Date().addingTimeInterval(60 * 60)
            while !Task.isCancelled, Date() < expiresAt {
                guard self.selectedSession?.callRoomId == roomID,
                      !self.providerRoom.isConnected else { return }
                await self.reviewDigestClient.load()
                guard !Task.isCancelled else { return }
                if let readiness = self.selectedSessionSourceExitReadiness {
                    if readiness.safeToLeaveAllEndpoints {
                        self.message = "Safe to close. Every expected recording is verified in Quipsly and each recording device has finished its queue."
                        return
                    }
                    self.message = "\(readiness.experience.title). \(readiness.experience.detail)"
                }
                do {
                    try await Task.sleep(nanoseconds: retryDelay)
                } catch {
                    return
                }
                retryDelay = min(retryDelay * 2, 60_000_000_000)
            }
        }
    }

    func prepareVideoCapture(
        using videoCapture: VideoCaptureController,
        mode: CaptureRecordingMode,
        position: VideoCaptureCameraPosition,
        qualityIntent: VideoCaptureQualityIntent = .production4K24
    ) async {
        guard mode.recordsVideo else { return }
        guard !usesPreviewData else {
            errorMessage = "The camera journey requires a physical iPhone. Preview mode never invents camera permissions, formats, or source bytes."
            return
        }
        guard selectedSession != nil else {
            errorMessage = "Choose or create a session before preparing the camera."
            return
        }
        guard activeCaptureSession == nil,
              activeVideoCaptureSession == nil,
              !isChangingCapture else { return }
        guard !isChangingRoom else {
            errorMessage = "Wait for the live room transition to finish before preparing the camera."
            return
        }
        if mode == .soloVideo, providerRoom.isConnected || providerRoom.isConnecting {
            errorMessage = "Solo video owns the local microphone. Leave the live room first, or use Podcast camera for a video-only master beside room audio."
            return
        }
        guard AuthManager.shared.stableOwnerSnapshot() != nil else {
            errorMessage = "Verify the current Quipsly account before preparing a camera source."
            return
        }

        isChangingCapture = true
        if !providerRoom.isConnected {
            ownsRoomCameraPreview = false
        }
        errorMessage = nil
        message = nil
        await videoCapture.prepare(
            position: position,
            includesAudio: mode.movieIncludesAudio,
            qualityIntent: qualityIntent
        )
        isChangingCapture = false
        if videoCapture.state == .ready {
            message = "Camera ready. Review the exact profile, framing, consent, storage estimate, and source mode before recording."
        } else {
            errorMessage = videoCapture.lastErrorMessage ?? "The selected camera could not be prepared."
        }
    }

    func startVideoCapture(
        using videoCapture: VideoCaptureController,
        mode: CaptureRecordingMode,
        captureGroupID: UUID? = nil
    ) async {
        guard mode.recordsVideo else { return }
        guard var session = selectedSession else {
            errorMessage = "Choose or create a session before recording video."
            return
        }
        guard videoCapture.state == .ready else {
            errorMessage = "Prepare and review the camera profile before recording."
            return
        }
        guard activeCaptureSession == nil,
              activeVideoCaptureSession == nil,
              !isChangingCapture else { return }
        guard !isChangingRoom else {
            errorMessage = "Wait for the live room transition to finish before starting the camera source."
            return
        }
        if let activeRoomSession, activeRoomSession.id != session.id {
            errorMessage = "Leave the active live room before recording a different session."
            return
        }
        if mode == .soloVideo, providerRoom.isConnected || providerRoom.isConnecting {
            errorMessage = "Solo video includes microphone audio and cannot take over the audio session during a live room. Use Podcast camera or leave the room."
            return
        }
        guard let ownerSnapshot = AuthManager.shared.stableOwnerSnapshot() else {
            errorMessage = "Verify the current Quipsly account before recording. Nothing was recorded."
            return
        }

        isChangingCapture = true
        errorMessage = nil
        message = nil
        captureReceiptNotice = nil
        captureSafetyNotice = nil

        let loadOutcome = await sessionClient.load(authoritativeSessionID: session.id)
        guard AuthManager.shared.matchesStableOwnerSnapshot(ownerSnapshot) else {
            isChangingCapture = false
            errorMessage = captureOwnerChangedBeforeStartMessage
            return
        }
        guard loadOutcome == .loaded,
              let refreshed = sessionClient.sessions.first(where: { $0.id == session.id }) else {
            isChangingCapture = false
            errorMessage = captureStartVerificationMessage(for: loadOutcome)
            return
        }
        session = refreshed
        selectedSessionID = refreshed.id
        guard refreshed.recordingConsentCanRecordVideo == true,
              refreshed.recordingConsentVideoGranted == true,
              refreshed.canRecordVideoNow == true else {
            isChangingCapture = false
            errorMessage = videoCaptureReadinessMessage(for: refreshed)
            return
        }
        if mode.requiresAudioConsent {
            guard refreshed.recordingConsentCanRecordAudio == true,
                  refreshed.recordingConsentGranted,
                  refreshed.canRecordAudioNow ?? refreshed.canRecordNow else {
                isChangingCapture = false
                errorMessage = mode == .soloVideo
                    ? "Solo video includes microphone audio. Save current audio and video consent for every required participant before starting."
                    : "Podcast audio + video creates a separate microphone master. Save current audio and video consent for every required participant before starting."
                return
            }
        }
        guard let recordingConsentID = refreshed.recordingConsentId?.trimmingCharacters(in: .whitespacesAndNewlines),
              !recordingConsentID.isEmpty else {
            isChangingCapture = false
            errorMessage = "Nest did not return the exact recording-consent receipt. Nothing was recorded."
            return
        }

        let contextSlugs = MobileContextManager.shared.getTargetSlugs()
        let uploadReadiness = readinessClient.readiness?.uploadAndTranscriptReadiness
        let context = VideoCaptureContext(
            sessionID: refreshed.id,
            projectSlug: refreshed.projectSlug ?? contextSlugs.projectSlug ?? "capture-inbox",
            episodeSlug: refreshed.episodeSlug ?? contextSlugs.episodeSlug ?? "session-capture",
            callRoomID: refreshed.callRoomId,
            participantID: refreshed.participantId,
            recordingConsentID: recordingConsentID,
            recordingAssetID: nil,
            capturePurpose: "\(refreshed.purpose ?? "capture")-\(mode.rawValue)",
            displayTitle: "\(refreshed.displayTitle) · \(mode.title)",
            consentAllowsVideo: true,
            consentAllowsAudio: refreshed.recordingConsentCanRecordAudio == true,
            longSourceUploadEnabled: uploadReadiness?.longSourceVerifierEnabled == true,
            maximumVideoSourceBytes:
                uploadReadiness?.maximumVideoSourceBytes ?? 2_147_483_648
        )
        await videoCapture.start(
            context: context,
            includesAudio: mode.movieIncludesAudio,
            captureGroupID: captureGroupID ?? refreshed.captureGroupId
        )
        guard [.arming, .recording, .finalizing].contains(videoCapture.state) else {
            isChangingCapture = false
            errorMessage = videoCapture.lastErrorMessage ?? "The camera source did not start. No successful recording is being claimed."
            scheduleReceiptFlush()
            return
        }

        activeVideoCapture = videoCapture
        activeVideoCaptureSession = refreshed
        activeVideoCaptureMode = mode
        activeVideoCaptureOwnerSnapshot = ownerSnapshot
        isChangingCapture = false
        clearSessionEntryNotice(for: refreshed.id)
        switch mode {
        case .podcastCamera:
            message = "Recording a video-only camera master. The live room remains the conversation path; Quipsly will align their clocks after upload."
        case .podcastAV:
            message = "Camera master is armed video-only. Quipsly is preparing the separate microphone master in the same capture group."
        case .soloVideo:
            message = "Recording camera and microphone locally as one protected movie source."
        case .audio:
            message = nil
        }
        scheduleReceiptFlush()
        startVideoConsentMonitor(videoCapture: videoCapture)
    }

    /// Starts two independently durable local sources under one capture-group
    /// identity. The video callback must confirm first; audio then starts with
    /// its own clock evidence under the same group. Any partial source is
    /// closed and preserved.
    func startCoordinatedPodcastCapture(
        using audioCapture: AudioCaptureController,
        videoCapture: VideoCaptureController
    ) async {
        guard activeCoordinatedCaptureGroupID == nil,
              activeCaptureSession == nil,
              activeVideoCaptureSession == nil,
              !isChangingCapture,
              !isCoordinatingPodcastCapture else {
            return
        }
        isCoordinatingPodcastCapture = true
        defer { isCoordinatingPodcastCapture = false }
        guard videoCapture.state == .ready,
              videoCapture.resolvedProfile?.includesAudio == false else {
            errorMessage = "Prepare the video-only camera profile before starting two local podcast masters."
            return
        }

        let captureGroupID = selectedSession?.captureGroupId ?? UUID()
        activeCoordinatedCaptureGroupID = captureGroupID
        await startVideoCapture(
            using: videoCapture,
            mode: .podcastAV,
            captureGroupID: captureGroupID
        )
        guard activeVideoCaptureSession != nil,
              videoCapture.activeCaptureGroupID == captureGroupID else {
            activeCoordinatedCaptureGroupID = nil
            return
        }

        guard await videoCapture.waitUntilRecording() else {
            let startFailure = videoCapture.lastErrorMessage
                ?? "The camera did not confirm its source start."
            await videoCapture.stop()
            _ = await videoCapture.waitUntilTerminal()
            reconcileVideoCaptureState(videoCapture.state, using: videoCapture)
            activeCoordinatedCaptureGroupID = nil
            errorMessage = "\(startFailure) No two-source recording is being claimed."
            return
        }

        await startCapture(
            using: audioCapture,
            captureGroupID: captureGroupID,
            permitActiveCoordinatedVideo: true
        )
        guard audioCapture.captureState == .recording,
              activeCaptureSession != nil,
              videoCapture.state == .recording,
              activeVideoCaptureSession != nil,
              videoCapture.activeCaptureGroupID == captureGroupID else {
            let startFailure = errorMessage
                ?? audioCapture.lastErrorMessage
                ?? videoCapture.lastErrorMessage
                ?? "Both local sources did not remain active through coordinated startup."
            if audioCapture.captureState == .recording {
                await stopCapture(using: audioCapture)
            }
            await videoCapture.stop()
            _ = await videoCapture.waitUntilTerminal()
            reconcileVideoCaptureState(videoCapture.state, using: videoCapture)
            activeCoordinatedCaptureGroupID = nil
            errorMessage = "\(startFailure) Every partial source was closed and preserved."
            return
        }

        message = "Recording two local masters: \(audioCapture.inputRouteName) audio plus a video-only \(videoCapture.cameraPosition.rawValue) camera source. Each keeps its own clock evidence under one capture-group identity."
        errorMessage = nil
    }

    func stopCoordinatedPodcastCapture(
        using audioCapture: AudioCaptureController,
        videoCapture: VideoCaptureController
    ) async {
        guard activeCoordinatedCaptureGroupID != nil else { return }
        guard !isStoppingCoordinatedCapture,
              !isCoordinatingPodcastCapture else { return }
        isCoordinatingPodcastCapture = true
        isStoppingCoordinatedCapture = true
        defer {
            isStoppingCoordinatedCapture = false
            isCoordinatingPodcastCapture = false
        }
        var failures: [String] = []

        if activeCaptureSession != nil {
            await stopCapture(using: audioCapture)
            if audioCapture.captureState != .saved {
                failures.append(
                    audioCapture.lastErrorMessage
                        ?? "The microphone source still needs Library review."
                )
            }
        }
        if activeVideoCaptureSession != nil {
            await stopVideoCapture(using: videoCapture)
            if !(await videoCapture.waitUntilTerminal()) {
                failures.append(
                    videoCapture.lastErrorMessage
                        ?? "The camera source is still finalizing."
                )
            }
            reconcileVideoCaptureState(videoCapture.state, using: videoCapture)
            if videoCapture.state != .saved {
                failures.append(
                    videoCapture.lastErrorMessage
                        ?? "The camera source still needs Library review."
                )
            }
        }

        activeCoordinatedCaptureGroupID = nil
        if failures.isEmpty {
            errorMessage = nil
            message = "Both local podcast masters are saved on this iPhone. Their independent uploads can continue without changing either original."
        } else {
            message = nil
            errorMessage = "The coordinated take stopped with preserved source evidence. \(failures.joined(separator: " "))"
        }
    }

    func toggleCoordinatedPodcastPause(
        using audioCapture: AudioCaptureController,
        videoCapture: VideoCaptureController
    ) async {
        guard activeCoordinatedCaptureGroupID != nil,
              !isCoordinatingPodcastCapture,
              !isStoppingCoordinatedCapture else { return }
        isCoordinatingPodcastCapture = true
        defer { isCoordinatingPodcastCapture = false }

        if audioCapture.captureState == .recording,
           videoCapture.state == .recording {
            await togglePause(using: audioCapture)
            guard audioCapture.captureState == .paused else {
                errorMessage = audioCapture.lastErrorMessage
                    ?? "The microphone master did not pause. The camera remains recording."
                return
            }
            await toggleVideoPause(using: videoCapture)
            _ = await videoCapture.waitUntilPausedOrTerminal()
            guard audioCapture.captureState == .paused,
                  videoCapture.state == .paused else {
                errorMessage = videoCapture.lastErrorMessage
                    ?? "The movie boundary did not validate as paused. Quipsly will preserve both sources for Library review."
                return
            }
            message = "Both local masters are paused. The microphone file retains its pause gap; the movie was safely closed."
            return
        }

        if audioCapture.captureState == .paused,
           videoCapture.state == .paused {
            await toggleVideoPause(using: videoCapture)
            guard await videoCapture.waitUntilRecording() else {
                errorMessage = videoCapture.lastErrorMessage
                    ?? "The camera source did not resume. The microphone remains paused."
                return
            }
            await togglePause(using: audioCapture)
            guard audioCapture.captureState == .recording,
                  videoCapture.state == .recording else {
                let resumeFailure = errorMessage
                    ?? audioCapture.lastErrorMessage
                    ?? videoCapture.lastErrorMessage
                    ?? "The microphone master did not resume."
                if audioCapture.captureState == .recording {
                    await stopCapture(using: audioCapture)
                }
                if videoCapture.state == .recording {
                    await videoCapture.pause()
                    _ = await videoCapture.waitUntilPausedOrTerminal()
                }
                errorMessage = "\(resumeFailure) Every restarted partial source was closed and preserved."
                return
            }
            message = "Both local masters resumed under the same capture-group identity."
            return
        }

        errorMessage = "The two local sources are not in the same pause state. Stop and preserve the group before retrying."
    }

    func stopVideoCapture(using videoCapture: VideoCaptureController) async {
        guard !isChangingCapture else { return }
        isChangingCapture = true
        errorMessage = nil
        message = "Closing and validating the current movie source…"
        await videoCapture.stop()
        isChangingCapture = false
        scheduleReceiptFlush()
        reconcileVideoCaptureState(videoCapture.state, using: videoCapture)
    }

    func toggleVideoPause(using videoCapture: VideoCaptureController) async {
        guard !isChangingCapture else { return }
        if videoCapture.state == .paused {
            guard let sessionID = activeVideoCaptureSession?.id,
                  let ownerSnapshot = activeVideoCaptureOwnerSnapshot,
                  AuthManager.shared.matchesStableOwnerSnapshot(ownerSnapshot) else {
                errorMessage = "This capture group belongs to the account generation that started it. Finish the paused take before starting another."
                return
            }
            isChangingCapture = true
            let loadOutcome = await sessionClient.load(authoritativeSessionID: sessionID)
            guard AuthManager.shared.matchesStableOwnerSnapshot(ownerSnapshot),
                  loadOutcome == .loaded,
                  let refreshed = sessionClient.sessions.first(where: { $0.id == sessionID }),
                  let mode = activeVideoCaptureMode,
                  videoAuthorityIsCurrent(for: refreshed, mode: mode) else {
                isChangingCapture = false
                errorMessage = loadOutcome == .loaded
                    ? videoCaptureReadinessMessage(
                        for: sessionClient.sessions.first(where: { $0.id == sessionID })
                    )
                    : captureResumeVerificationMessage(for: loadOutcome)
                return
            }
            activeVideoCaptureSession = refreshed
            await videoCapture.resume()
            isChangingCapture = false
            if [.arming, .recording, .finalizing].contains(videoCapture.state) {
                message = "Resuming with a new immutable movie in the same capture group. The honest pause gap remains on the timeline."
                startVideoConsentMonitor(videoCapture: videoCapture)
            } else {
                errorMessage = videoCapture.lastErrorMessage ?? "The paused camera source did not resume."
            }
            scheduleReceiptFlush()
        } else {
            await videoCapture.pause()
            message = "Closing this movie before pausing. Resume will create a new source in the same capture group."
        }
    }

    func switchVideoCamera(using videoCapture: VideoCaptureController) async {
        guard videoCapture.state == .recording,
              !isChangingCapture,
              let sessionID = activeVideoCaptureSession?.id,
              let ownerSnapshot = activeVideoCaptureOwnerSnapshot,
              let mode = activeVideoCaptureMode,
              AuthManager.shared.matchesStableOwnerSnapshot(ownerSnapshot) else {
            return
        }
        isChangingCapture = true
        errorMessage = nil
        message = "Closing the current camera source before switching lenses…"
        let loadOutcome = await sessionClient.load(
            authoritativeSessionID: sessionID
        )
        guard AuthManager.shared.matchesStableOwnerSnapshot(ownerSnapshot),
              loadOutcome == .loaded,
              let refreshed = sessionClient.sessions.first(where: { $0.id == sessionID }),
              videoAuthorityIsCurrent(for: refreshed, mode: mode) else {
            isChangingCapture = false
            errorMessage = loadOutcome == .loaded
                ? videoCaptureReadinessMessage(
                    for: sessionClient.sessions.first(where: { $0.id == sessionID })
                )
                : captureResumeVerificationMessage(for: loadOutcome)
            return
        }
        activeVideoCaptureSession = refreshed
        await videoCapture.switchCamera()
        isChangingCapture = false
    }

    func reconcileVideoCaptureState(
        _ state: VideoCaptureState,
        using videoCapture: VideoCaptureController
    ) {
        guard activeVideoCapture === videoCapture || activeVideoCaptureSession != nil else { return }
        let coordinatedGroupID = activeCoordinatedCaptureGroupID
        let closeAudioPartner =
            coordinatedGroupID != nil
            && !isStoppingCoordinatedCapture
            && activeCaptureSession != nil
            && [.saved, .failed, .idle].contains(state)
        let audioPartner = activeAudioCapture
        switch state {
        case .recording:
            switch activeVideoCaptureMode {
            case .podcastAV:
                message = activeCaptureSession == nil
                    ? "Video-only camera source confirmed. Preparing the separate microphone master."
                    : "Two local podcast masters are recording with independent clock evidence under one capture-group identity."
            case .podcastCamera:
                message = "Video-only camera master is recording locally beside room audio."
            case .soloVideo:
                message = "Solo camera and microphone source is recording locally."
            case .audio, .none:
                message = "Camera source is recording locally."
            }
            startVideoConsentMonitor(videoCapture: videoCapture)
        case .paused:
            videoConsentMonitorTask?.cancel()
            videoConsentMonitorTask = nil
            message = "Camera paused after safely closing and validating the current movie."
        case .saved:
            finishActiveVideoCaptureContext()
            message = videoCapture.safetyMessage
                ?? "Video saved on this iPhone. Upload can continue without changing the local original."
        case .failed:
            let failure = videoCapture.lastErrorMessage
                ?? "The video source needs review in Library before Quipsly can call it saved."
            finishActiveVideoCaptureContext()
            errorMessage = failure
        case .idle:
            finishActiveVideoCaptureContext()
        case .preparing, .ready, .arming, .finalizing:
            break
        }
        if closeAudioPartner, let coordinatedGroupID, let audioPartner {
            Task { [weak self] in
                guard let self,
                      self.activeCoordinatedCaptureGroupID == coordinatedGroupID,
                      !self.isStoppingCoordinatedCapture else {
                    return
                }
                self.isStoppingCoordinatedCapture = true
                while self.isChangingCapture {
                    try? await Task.sleep(nanoseconds: 50_000_000)
                }
                guard self.activeCoordinatedCaptureGroupID == coordinatedGroupID,
                      self.activeCaptureSession != nil else {
                    self.isStoppingCoordinatedCapture = false
                    return
                }
                await self.stopCapture(using: audioPartner)
                self.isStoppingCoordinatedCapture = false
                self.message = nil
                if [.saved, .failed, .idle].contains(audioPartner.captureState) {
                    self.activeCoordinatedCaptureGroupID = nil
                    self.errorMessage = "The camera source ended before the coordinated take completed. Quipsly closed and preserved the microphone partner; review both sources in Library."
                } else {
                    self.errorMessage = "The camera source ended before the coordinated take completed. The microphone partner is still closing; keep Quipsly open until Library shows its final state."
                }
            }
        }
        if let coordinatedGroupID,
           !isStoppingCoordinatedCapture,
           activeCaptureSession == nil,
           [.saved, .failed, .idle].contains(state),
           activeCoordinatedCaptureGroupID == coordinatedGroupID {
            activeCoordinatedCaptureGroupID = nil
            message = nil
            errorMessage = "The camera source ended without an active microphone partner. Quipsly preserved the partial group for Library review."
        }
    }

    func startCapture(
        using audioCapture: AudioCaptureController,
        captureGroupID: UUID? = nil,
        permitActiveCoordinatedVideo: Bool = false
    ) async {
        guard var session = selectedSession else {
            errorMessage = "Choose or create a session before recording."
            return
        }
        guard session.recordingConsentGranted else {
            errorMessage = "Save the recorder consent attestation before recording starts."
            return
        }
        guard usesPreviewData || session.canRecordNow else {
            errorMessage = session.captureReadinessNextAction
            return
        }
        let coordinatedVideoMayRemainActive =
            permitActiveCoordinatedVideo
            && activeVideoCaptureMode == .podcastAV
            && activeVideoCaptureSession?.id == session.id
            && activeCoordinatedCaptureGroupID == captureGroupID
            && activeVideoCapture?.state == .recording
        if permitActiveCoordinatedVideo,
           !coordinatedVideoMayRemainActive {
            errorMessage = "The camera source ended before microphone startup. Quipsly did not open an audio-only remainder."
            return
        }
        guard activeCaptureSession == nil,
              (activeVideoCaptureSession == nil || coordinatedVideoMayRemainActive),
              !isChangingCapture else { return }
        guard !isChangingRoom else {
            errorMessage = "Wait for the live room to finish connecting before starting the local recorder."
            return
        }
        if let activeRoomSession, activeRoomSession.id != session.id {
            errorMessage = "Leave the active live room before recording a different session."
            return
        }
        if providerRoom.isConnected, providerRoom.isMuted {
            errorMessage = "Unmute the live-room microphone before starting the local master. Quipsly records that same owned input pipeline so the call and file cannot disagree about the active microphone."
            return
        }
        guard let ownerSnapshot = AuthManager.shared.stableOwnerSnapshot() else {
            errorMessage = "Verify the current Quipsly account before recording. Nothing was recorded."
            return
        }

        isChangingCapture = true
        errorMessage = nil
        message = nil
        captureReceiptNotice = nil
        captureSafetyNotice = nil
        captureRequiresNewTake = false

        // Starting a new capture is an online-authority action. Refresh
        // immediately before opening AVAudioRecorder so cached consent or
        // readiness can never be mistaken for current permission to record.
        if !usesPreviewData {
            let loadOutcome = await sessionClient.load(authoritativeSessionID: session.id)
            guard AuthManager.shared.matchesStableOwnerSnapshot(ownerSnapshot) else {
                isChangingCapture = false
                errorMessage = captureOwnerChangedBeforeStartMessage
                return
            }
            guard loadOutcome == .loaded,
                  let refreshed = sessionClient.sessions.first(where: { $0.id == session.id }) else {
                isChangingCapture = false
                errorMessage = captureStartVerificationMessage(for: loadOutcome)
                return
            }
            guard refreshed.recordingConsentGranted, refreshed.canRecordNow else {
                isChangingCapture = false
                selectedSessionID = refreshed.id
                errorMessage = refreshed.recordingConsentGranted
                    ? refreshed.captureReadinessNextAction
                    : "Save the recorder consent attestation before recording starts."
                return
            }
            session = refreshed
            selectedSessionID = refreshed.id
        }

        let microphonePrepared = await audioCapture.prepareForRecording()
        guard AuthManager.shared.matchesStableOwnerSnapshot(ownerSnapshot) else {
            isChangingCapture = false
            errorMessage = captureOwnerChangedBeforeStartMessage
            return
        }
        guard microphonePrepared else {
            isChangingCapture = false
            errorMessage = audioCapture.lastErrorMessage ?? "The microphone is not ready."
            return
        }

        let contextSlugs = MobileContextManager.shared.getTargetSlugs()
        let captureID = UUID()
        let resolvedCaptureGroupID = captureGroupID ?? session.captureGroupId ?? captureID
        let clockSamples = usesPreviewData
            ? []
            : await CaptureClockClient.shared.measureBurst(
                callRoomID: session.callRoomId,
                captureGroupID: resolvedCaptureGroupID,
                expectedOwnerAccountID: ownerSnapshot.ownerAccountID
            )
        guard AuthManager.shared.matchesStableOwnerSnapshot(ownerSnapshot) else {
            isChangingCapture = false
            errorMessage = captureOwnerChangedBeforeStartMessage
            return
        }
        do {
            try audioCapture.armNextCapture(
                captureID: captureID,
                captureGroupID: resolvedCaptureGroupID,
                sessionID: session.id,
                callRoomID: session.callRoomId,
                requiresDurableRoomReceipt: !usesPreviewData,
                expectedOwnerSnapshot: ownerSnapshot,
                clockSamples: clockSamples
            )
        } catch {
            isChangingCapture = false
            errorMessage = "Quipsly could not durably journal the recording start. Nothing was recorded: \(error.localizedDescription)"
            return
        }
        if permitActiveCoordinatedVideo {
            guard activeCoordinatedCaptureGroupID == captureGroupID,
                  activeVideoCaptureMode == .podcastAV,
                  activeVideoCaptureSession?.id == session.id,
                  activeVideoCapture?.state == .recording else {
                audioCapture.abortArmedCaptureBeforeRecording()
                isChangingCapture = false
                errorMessage = "The camera source ended while the microphone boundary was being armed. Quipsly closed the durable audio START without opening microphone bytes."
                if !usesPreviewData { scheduleReceiptFlush() }
                return
            }
        }
        guard AuthManager.shared.matchesStableOwnerSnapshot(ownerSnapshot) else {
            audioCapture.abortArmedCaptureBeforeRecording()
            isChangingCapture = false
            errorMessage = captureOwnerChangedBeforeStartMessage
            if !usesPreviewData { scheduleReceiptFlush() }
            return
        }
        let command = RecorderCommand(
            action: .start,
            projectSlug: session.projectSlug ?? contextSlugs.projectSlug ?? "capture-inbox",
            episodeSlug: session.episodeSlug ?? contextSlugs.episodeSlug ?? "session-capture",
            callRoomId: session.callRoomId,
            participantId: session.participantId,
            recordingConsentId: session.recordingConsentId,
            recordingConsentGranted: true,
            capturePurpose: session.purpose ?? "capture"
        )
        audioCapture.handleCommand(command)

        let audioStarted = await audioCapture.waitUntilRecordingOrTerminal()
        guard audioStarted, audioCapture.captureState == .recording else {
            isChangingCapture = false
            errorMessage = audioCapture.lastErrorMessage ?? "The local recorder did not start. Nothing was recorded."
            if !usesPreviewData {
                scheduleReceiptFlush()
            }
            return
        }

        guard audioCapture.activeLocalRecordingID == captureID else {
            _ = await audioCapture.stopAndFinalize()
            isChangingCapture = false
            errorMessage = "The take was saved locally, but Quipsly could not bind its source ID to the room receipt. Review it in Library before retrying."
            return
        }
        activeCaptureID = captureID
        activeCaptureOwnerSnapshot = ownerSnapshot
        activeAudioCapture = audioCapture
        activeCaptureSession = session
        selectedSessionID = session.id
        isChangingCapture = false
        clearSessionEntryNotice(for: session.id)

        if usesPreviewData {
            message = "Recording this iPhone's microphone. Preview mode does not contact Nest."
            return
        }

        if let persistenceError = receiptStore.persistenceError {
            captureReceiptNotice = persistenceError
        }
        message = "Recording this iPhone's microphone. Nest receipt sync runs separately."
        scheduleReceiptFlush()
        startConsentMonitor(captureID: captureID, audioCapture: audioCapture)
    }

    func stopCapture(using audioCapture: AudioCaptureController) async {
        guard !isChangingCapture else { return }
        isChangingCapture = true
        errorMessage = nil
        message = nil

        let stoppedAt = Date()
        let savedLocally = await audioCapture.stopAndFinalize()
        if savedLocally {
            message = "Saved on this iPhone. Upload can continue in the background."
        } else {
            errorMessage = audioCapture.lastErrorMessage ?? "The local take needs review before Quipsly can call it saved."
        }
        isChangingCapture = false

        if savedLocally || audioCapture.captureState != .finalizing {
            finishActiveCaptureContext(stoppedAt: stoppedAt)
        }
    }

    /// Reconciles recorder-driven terminal states such as an audio-services
    /// reset or a delegate finalization that completed after a UI timeout.
    func reconcileCaptureState(_ state: AudioCaptureState) {
        guard activeCaptureSession != nil else { return }
        if state == .paused,
           activeCoordinatedCaptureGroupID != nil,
           !isCoordinatingPodcastCapture,
           !isStoppingCoordinatedCapture,
           let videoPartner = activeVideoCapture,
           videoPartner.state == .recording {
            isCoordinatingPodcastCapture = true
            Task { [weak self] in
                guard let self else { return }
                await videoPartner.pause()
                _ = await videoPartner.waitUntilPausedOrTerminal()
                self.isCoordinatingPodcastCapture = false
                if videoPartner.state == .paused {
                    self.message = nil
                    self.errorMessage = "The microphone source paused unexpectedly, so Quipsly safely closed the current movie boundary too. Verify the route and consent before resuming both sources."
                } else {
                    self.message = nil
                    self.errorMessage = videoPartner.lastErrorMessage
                        ?? "The microphone paused, but the camera boundary still needs Library review. Stop and preserve the coordinated group."
                }
            }
            return
        }
        guard state == .saved || state == .failed || state == .idle else { return }
        if isChangingCapture {
            Task { [weak self] in
                guard let self else { return }
                while self.isChangingCapture {
                    try? await Task.sleep(nanoseconds: 50_000_000)
                }
                self.reconcileCaptureState(state)
            }
            return
        }
        let coordinatedGroupID = activeCoordinatedCaptureGroupID
        let closeVideoPartner =
            coordinatedGroupID != nil
            && !isStoppingCoordinatedCapture
            && activeVideoCaptureSession != nil
        let videoPartner = activeVideoCapture
        if state == .saved {
            message = activeAudioCapture?.automaticStopReason
                ?? "Saved on this iPhone. Upload can continue in the background."
        } else if state == .failed,
                  let recorderError = activeAudioCapture?.lastErrorMessage {
            errorMessage = recorderError
        }
        finishActiveCaptureContext(stoppedAt: Date())
        if closeVideoPartner, let coordinatedGroupID, let videoPartner {
            Task { [weak self] in
                guard let self,
                      self.activeCoordinatedCaptureGroupID == coordinatedGroupID,
                      !self.isStoppingCoordinatedCapture else {
                    return
                }
                self.isStoppingCoordinatedCapture = true
                await videoPartner.stop()
                _ = await videoPartner.waitUntilTerminal()
                self.reconcileVideoCaptureState(
                    videoPartner.state,
                    using: videoPartner
                )
                self.isStoppingCoordinatedCapture = false
                self.message = nil
                if [.saved, .failed, .idle].contains(videoPartner.state) {
                    self.activeCoordinatedCaptureGroupID = nil
                    self.errorMessage = "The microphone source ended before the coordinated take completed. Quipsly closed and preserved the camera partner; review both sources in Library."
                } else {
                    self.errorMessage = "The microphone source ended before the coordinated take completed. The camera partner is still closing; keep Quipsly open until Library shows its final state."
                }
            }
        } else if let coordinatedGroupID,
                  !isStoppingCoordinatedCapture,
                  activeCoordinatedCaptureGroupID == coordinatedGroupID {
            activeCoordinatedCaptureGroupID = nil
            message = nil
            errorMessage = "The microphone source ended without an active camera partner. Quipsly preserved the partial group for Library review."
        }
    }

    func togglePause(using audioCapture: AudioCaptureController) async {
        if audioCapture.captureState == .paused {
            guard let ownerSnapshot = activeCaptureOwnerSnapshot,
                  AuthManager.shared.matchesStableOwnerSnapshot(ownerSnapshot),
                  audioCapture.captureOwnerIsCurrent else {
                captureRequiresNewTake = true
                errorMessage = "This preserved take belongs to the account generation that started it. Stop and save it; Quipsly will not resume under a different account."
                return
            }
            if captureRequiresNewTake {
                errorMessage = "Nest rejected the start boundary. Stop and save this local take, resolve the session blocker, then start a new take so Quipsly can create a fresh receipt."
                return
            }
            if captureSafetyNotice != nil, let sessionID = activeCaptureSession?.id {
                let loadOutcome = await sessionClient.load(authoritativeSessionID: sessionID)
                guard AuthManager.shared.matchesStableOwnerSnapshot(ownerSnapshot),
                      audioCapture.captureOwnerIsCurrent else {
                    captureRequiresNewTake = true
                    errorMessage = "The Quipsly account changed while resume authority was being checked. Recording remains paused and preserved."
                    return
                }
                guard loadOutcome == .loaded,
                      let refreshed = sessionClient.sessions.first(where: { $0.id == sessionID }),
                      refreshed.recordingConsentGranted,
                      refreshed.canRecordNow else {
                    errorMessage = captureResumeVerificationMessage(for: loadOutcome)
                    return
                }
                activeCaptureSession = refreshed
                captureSafetyNotice = nil
                if let captureID = activeCaptureID {
                    startConsentMonitor(captureID: captureID, audioCapture: audioCapture)
                }
            }
            guard AuthManager.shared.matchesStableOwnerSnapshot(ownerSnapshot),
                  audioCapture.captureOwnerIsCurrent else {
                captureRequiresNewTake = true
                errorMessage = "The Quipsly account changed before resume. Recording remains paused and preserved."
                return
            }
            audioCapture.handleCommand(.resume)
            let resumed = await audioCapture.waitUntilRecordingOrTerminal()
            if resumed, audioCapture.captureState == .recording {
                message = "Recording resumed."
            } else {
                message = nil
                errorMessage = audioCapture.lastErrorMessage ?? "Recording remains paused. Verify the microphone route, then try again or stop and save the take."
            }
        } else if audioCapture.captureState == .recording {
            audioCapture.handleCommand(.pause)
            message = "Recording paused. Nothing was deleted."
        }
    }

    func markMoment(using audioCapture: AudioCaptureController) {
        guard audioCapture.captureState == .recording else { return }
        audioCapture.handleCommand(.markBreak)
        message = "Moment marked in the source timeline."
    }

    func joinRoom(
        useCallAudio: Bool = true,
        joinMuted: Bool = false
    ) async {
        guard let session = selectedSession, !isChangingRoom else { return }
        guard !providerRoom.isPermanentlyClosed(callRoomID: session.callRoomId) else {
            errorMessage = "This call has ended. Your local recording remains available to stop, save, upload, or recover."
            return
        }
        // An exhausted provider reconnect is the one safe exception to the
        // ordinary route-change lock. The coordinator preserves the active
        // local-capture lease while source evidence records the call-transport
        // span without guessing what the independent local microphone retained.
        if !providerRoom.canRejoin(callRoomID: session.callRoomId) {
            guard providerControlsAreAvailable() else { return }
        }
        guard let ownerSnapshot = AuthManager.shared.stableOwnerSnapshot() else {
            errorMessage = "Verify the current Quipsly account before joining the live room."
            return
        }
        isChangingRoom = true
        defer { isChangingRoom = false }
        errorMessage = nil

        guard !usesPreviewData else {
            message = "Room join is disabled in preview mode."
            return
        }
        var effectiveJoinMuted = joinMuted
        if useCallAudio && !joinMuted {
            // A declined or previously denied microphone choice must not lock
            // someone out of the conversation. iOS retains the permission;
            // Quipsly joins muted and lets the ordinary Unmute/Settings path
            // recover it without a second pre-join ritual.
            if !(await providerRoom.prepareMicrophonePermissionForJoin()) {
                effectiveJoinMuted = true
            }
        }
        guard AuthManager.shared.matchesStableOwnerSnapshot(ownerSnapshot) else {
            errorMessage = providerRoomOwnerChangedMessage
            return
        }
        activeRoomSession = session
        selectedSessionID = session.id
        let preparedJoin = await sessionClient.prepareRoomJoin(
            for: session,
            endpointRole: useCallAudio ? "primary" : "companion"
        )
        guard AuthManager.shared.matchesStableOwnerSnapshot(ownerSnapshot) else {
            activeRoomSession = nil
            preparedRoomJoin = nil
            errorMessage = providerRoomOwnerChangedMessage
            return
        }
        guard let join = preparedJoin else {
            if providerRoom.canRejoin(callRoomID: session.callRoomId),
               sessionClient.roomJoinFailureCode == "ROOM_NOT_OPEN" {
                providerRoom.markCallPermanentlyClosed(
                    callRoomID: session.callRoomId
                )
            }
            activeRoomSession = nil
            errorMessage = sessionClient.errorMessage ?? "The room could not be prepared. Local recording remains available."
            return
        }
        preparedRoomJoin = join
        guard AuthManager.shared.matchesStableOwnerSnapshot(ownerSnapshot) else {
            activeRoomSession = nil
            preparedRoomJoin = nil
            errorMessage = providerRoomOwnerChangedMessage
            return
        }
        await providerRoom.connect(
            using: join,
            session: session,
            expectedOwnerSnapshot: ownerSnapshot,
            useCallAudio: useCallAudio,
            joinMuted: effectiveJoinMuted
        )
        guard AuthManager.shared.matchesStableOwnerSnapshot(ownerSnapshot) else {
            await providerRoom.disconnect()
            activeRoomSession = nil
            preparedRoomJoin = nil
            errorMessage = providerRoomOwnerChangedMessage
            return
        }
        errorMessage = providerRoom.lastError
        if providerRoom.isConnected {
            clearSessionEntryNotice(for: session.id)
        } else {
            activeRoomSession = nil
            preparedRoomJoin = nil
        }
    }

    func leaveRoom() async {
        guard !isChangingRoom else { return }
        guard providerControlsAreAvailable() else { return }
        isChangingRoom = true
        defer { isChangingRoom = false }
        await providerRoom.disconnect()
        activeRoomSession = nil
        preparedRoomJoin = nil
    }

    /// Protects only this device's source when CallKit ends the conversation
    /// outside Quipsly's own Leave button. This is deliberately not a room-wide
    /// STOP command: every participant owns an independent local master.
    private func protectLocalSourceForNativeCallEnd() async -> Bool {
        let sourceWasActive = localSourceIsActive
        guard sourceWasActive else { return true }

        message = "The call ended. Protecting this iPhone's recording…"
        let session = activeRoomSession ?? selectedSession
        let captureID = activeVideoCapture?.activeRecordingID
            ?? activeAudioCapture?.activeLocalRecordingID
        let activeStartDirective = recordingCoordinator.currentDirective.flatMap {
            $0.action == .start ? $0 : nil
        }
        if let activeStartDirective {
            recordingCoordinator.markHandled(activeStartDirective, state: .stopping)
        }

        if activeCoordinatedCaptureGroupID != nil,
           let activeAudioCapture,
           let activeVideoCapture {
            await stopCoordinatedPodcastCapture(
                using: activeAudioCapture,
                videoCapture: activeVideoCapture
            )
        } else {
            if activeCaptureSession != nil, let activeAudioCapture {
                await stopCapture(using: activeAudioCapture)
            }
            if activeVideoCaptureSession != nil, let activeVideoCapture {
                await stopVideoCapture(using: activeVideoCapture)
                if activeVideoCapture.state == .finalizing {
                    _ = await activeVideoCapture.waitUntilTerminal()
                    reconcileVideoCaptureState(
                        activeVideoCapture.state,
                        using: activeVideoCapture
                    )
                }
            }
        }

        let protected = !localSourceIsActive
        if let session, let activeStartDirective {
            let state: CaptureRecordingEndpointState = protected ? .stopped : .stopFailed
            recordingCoordinator.markHandled(activeStartDirective, state: state)
            Task {
                await recordingCoordinator.acknowledge(
                    roomID: session.callRoomId,
                    directive: activeStartDirective,
                    state: state,
                    captureID: captureID,
                    detail: protected
                        ? "The native system call ended; this iPhone stopped and protected its retained source."
                        : "The native system call ended while this iPhone's retained source was still closing."
                )
            }
        }
        if protected {
            message = "Call ended. Your recording is protected on this iPhone. Keep Quipsly open until this Session says Safe to close."
            if let roomID = session?.callRoomId {
                monitorSourceExitReadiness(roomID: roomID)
            }
        } else {
            errorMessage = "The call ended while this iPhone was still closing its recording. Keep Quipsly open until Library shows the protected source."
        }
        return protected
    }

    func toggleRoomMute() async {
        guard !providerMuteControlLockedForLocalCapture else {
            errorMessage = providerMuteControlLockMessage
            return
        }
        guard providerRoom.isConnected, providerRoom.usesCallAudio else { return }
        let targetMuted = !providerRoom.isMuted
        let retainedRecordingContinues =
            localSourceIsActive
            && activeAudioCapture?.isUsingProviderAudioMaster == true
        await providerRoom.setMuted(
            targetMuted,
            retainedRecordingContinues: retainedRecordingContinues
        )
        guard providerRoom.isMuted == targetMuted else { return }
        errorMessage = nil
        if retainedRecordingContinues {
            message = targetMuted
                ? "Call muted. Your protected local recording continues."
                : "Call microphone live. Your protected local recording continues."
        }
    }

    func toggleRoomSpeaker() {
        guard providerRoom.isConnected,
              providerRoom.usesCallAudio,
              !providerRoom.isReconnecting else { return }
        do {
            try CaptureAudioSessionCoordinator.shared.toggleBuiltInSpeaker()
            errorMessage = nil
            let speakerIsActive = CaptureAudioSessionCoordinator.shared.isBuiltInSpeakerActive
            if activeAudioCapture?.isUsingProviderAudioMaster == true {
                message = speakerIsActive
                    ? "Speaker on. Your protected local recording continues; headphones keep call audio out of your master."
                    : "Speaker off. Your protected local recording continues."
            } else {
                message = speakerIsActive ? "Speaker on." : "Speaker off."
            }
        } catch {
            errorMessage = "The iPhone audio route couldn't change. Use Audio to choose another device, then try again."
        }
    }

    func prepareRoomCameraPreview(
        using videoCapture: VideoCaptureController,
        position: VideoCaptureCameraPosition,
        qualityIntent: VideoCaptureQualityIntent = .production4K24
    ) async {
        await prepareVideoCapture(
            using: videoCapture,
            mode: .podcastCamera,
            position: position,
            qualityIntent: qualityIntent
        )
        ownsRoomCameraPreview = videoCapture.state == .ready
            && videoCapture.resolvedProfile?.includesAudio == false
        if ownsRoomCameraPreview {
            message = "Camera ready. Recording still starts separately."
        }
    }

    /// Closes a pre-join camera preview without creating, deleting, or
    /// finalizing a retained source. An active movie or published call camera
    /// remains owned by its explicit recording/call controls instead.
    func dismissRoomCameraPreview(
        using videoCapture: VideoCaptureController
    ) async {
        guard !providerRoom.isLocalVideoPublished,
              !videoCapture.state.isActive,
              !isChangingCapture,
              !isChangingRoom else { return }
        isChangingCapture = true
        await videoCapture.shutdownPreview()
        ownsRoomCameraPreview = false
        isChangingCapture = false
        if videoCapture.state == .idle {
            errorMessage = nil
            message = "Camera off."
        }
    }

    /// A conventional call-camera toggle backed by Quipsly's existing camera
    /// owner. Preparing the source starts preview/live frames only; retained
    /// recording remains a separate, explicit action with its own consent and
    /// durable receipts.
    func toggleRoomCamera(
        using videoCapture: VideoCaptureController,
        position: VideoCaptureCameraPosition,
        qualityIntent: VideoCaptureQualityIntent = .production4K24
    ) async {
        guard providerRoom.isConnected, !isChangingRoom else { return }
        if providerRoom.isLocalVideoPublished {
            await providerRoom.unpublishSharedCamera()
            if !providerRoom.isLocalVideoPublished {
                await dismissRoomCameraPreview(using: videoCapture)
            }
            errorMessage = providerRoom.lastError
            return
        }
        guard !providerRoom.isChangingLocalVideo else { return }

        let needsVideoOnlyProfile = videoCapture.resolvedProfile == nil
            || videoCapture.resolvedProfile?.includesAudio == true
            || [.idle, .saved, .failed].contains(videoCapture.state)
        if needsVideoOnlyProfile {
            await prepareVideoCapture(
                using: videoCapture,
                mode: .podcastCamera,
                position: position,
                qualityIntent: qualityIntent
            )
        }
        guard let profile = videoCapture.resolvedProfile,
              profile.includesAudio == false,
              [.ready, .arming, .recording, .finalizing, .paused]
                .contains(videoCapture.state) else {
            errorMessage = videoCapture.lastErrorMessage
                ?? "The camera couldn't start while another local source is changing. Try again when it is ready."
            return
        }

        await providerRoom.publishSharedCamera(
            from: videoCapture,
            profile: profile
        )
        if providerRoom.isLocalVideoPublished {
            ownsRoomCameraPreview = true
        }
        errorMessage = providerRoom.lastError
    }

    /// Restores the person's remembered live-camera choice after a fresh join
    /// or an exhausted reconnect. Unlike a generic toggle, this can never turn
    /// an already-published camera off. `toggleRoomCamera` deliberately accepts
    /// an active video-only local master, so rejoining republishes those exact
    /// frames without reopening the camera or replacing retained-source truth.
    func restoreRoomCameraAfterJoin(
        using videoCapture: VideoCaptureController,
        position: VideoCaptureCameraPosition,
        qualityIntent: VideoCaptureQualityIntent = .production4K24
    ) async {
        guard providerRoom.isConnected,
              !providerRoom.isLocalVideoPublished else { return }
        await toggleRoomCamera(
            using: videoCapture,
            position: position,
            qualityIntent: qualityIntent
        )
    }

    func switchRoomCamera(
        using videoCapture: VideoCaptureController,
        qualityIntent: VideoCaptureQualityIntent = .production4K24
    ) async {
        guard providerRoom.isConnected,
              providerRoom.isLocalVideoPublished,
              !providerRoom.isChangingLocalVideo,
              !isChangingRoom,
              !isChangingCapture else { return }
        switch videoCapture.state {
        case .recording:
            await switchVideoCamera(using: videoCapture)
        case .ready:
            isChangingCapture = true
            errorMessage = nil
            await videoCapture.prepare(
                position: videoCapture.cameraPosition.opposite,
                includesAudio: false,
                qualityIntent: qualityIntent
            )
            isChangingCapture = false
            if videoCapture.state == .ready {
                message = "Camera switched. Your live video and future local master still share one source."
            } else {
                errorMessage = videoCapture.lastErrorMessage
                    ?? "The other camera couldn't start."
            }
        case .idle, .preparing, .arming, .finalizing, .paused, .saved, .failed:
            errorMessage = "Wait for the current camera change or recording boundary to finish, then switch cameras."
        }
    }

    func retryUploads() {
        uploadManager.retryRecoverableUploads()
    }

    private func queueRecoveredUploadsWhenSafe(_ recordings: [LocalRecording]) {
        guard !usesPreviewData,
              AuthManager.shared.networkActionsAllowed,
              let activeOwnerAccountID = normalizedOwnerAccountID(
                AuthManager.currentStoredOwnerID()
              ) else {
            return
        }

        for recording in recordings where recording.status == .recovered {
            guard normalizedOwnerAccountID(recording.ownerAccountID) == activeOwnerAccountID,
                  recording.isUploadEligible,
                  recording.recordingConsentGranted,
                  recording.stoppedAt != nil,
                  recording.projectSlug?.isEmpty == false,
                  recording.episodeSlug?.isEmpty == false,
                  recording.callRoomId?.isEmpty == false,
                  recording.recordingConsentId?.isEmpty == false,
                  automaticallyQueuedRecoveredRecordingIDs.insert(recording.id).inserted else {
                continue
            }

            // Crash recovery is not complete while the only safe copy remains
            // stranded on one phone. Reuse the same durable, idempotent upload
            // path as an explicit Library retry after EOF validation proves the
            // source playable and Nest has re-established account authority.
            retryUpload(for: recording)
        }
    }

    func retryUpload(for recording: LocalRecording) {
        guard recording.isUploadEligible else {
            if recording.status == .validatingRecovery {
                errorMessage = "Quipsly is still validating this preserved source through its end. Upload will unlock only after that check is durably saved."
            } else if recording.status == .needsRepair {
                errorMessage = "This source needs repair before Quipsly can upload it. The original bytes remain on this iPhone."
            } else if let holdReason = recording.sourceIntegrityHoldReason {
                errorMessage = holdReason
            } else {
                errorMessage = "Finish and validate this local source before uploading it."
            }
            return
        }
        guard !recording.status.isVerified else {
            message = "This recording already has a verified Quipsly receipt. The local original remains available."
            return
        }
        if uploadManager.retryUpload(localRecordingID: recording.id) {
            message = "Retrying this recording. The local original remains on this iPhone."
            return
        }

        guard let projectSlug = recording.projectSlug,
              let episodeSlug = recording.episodeSlug else {
            errorMessage = "This recovered source needs a project and episode before it can upload. The file remains local."
            return
        }

        let library = LocalRecordingLibrary.shared
        guard let fileURL = library.fileURL(for: recording) else {
            errorMessage = "This protected source is not available to the current Quipsly account."
            return
        }
        do {
            try library.markUploadQueued(recording.id)
        } catch {
            errorMessage = "The upload could not be queued: \(error.localizedDescription)"
            return
        }

        uploadManager.startUpload(
            fileUrl: fileURL,
            projectSlug: projectSlug,
            episodeSlug: episodeSlug,
            callRoomId: recording.callRoomId,
            participantId: recording.participantId,
            recordingConsentId: recording.recordingConsentId,
            recordingConsentGranted: recording.recordingConsentGranted,
            recordingAssetId: recording.recordingAssetId,
            capturePurpose: recording.capturePurpose,
            sourceType: recording.effectiveMediaKind.uploadSourceType,
            captureGroupId: recording.captureGroupId,
            sourceProfileJson: recording.encodedSourceProfileJSON,
            startedAt: ISO8601DateFormatter().string(from: recording.startedAt),
            stoppedAt: recording.stoppedAt.map { ISO8601DateFormatter().string(from: $0) },
            recordingSegmentsJson: recording.recordingSegmentsJson,
            localRecordingID: recording.id,
            ownerAccountID: recording.ownerAccountID
        )
        message = "Upload queued for this recording. The local original remains on this iPhone."
    }

    /// Coordinates the two protected local ledgers involved in an explicit
    /// deletion. Upload ownership is checked without mutation, the Library then
    /// records its tombstone before removing bytes, and only afterward is any
    /// dormant held upload job retired. Server-side recording, consent, and
    /// verification evidence is not mutated.
    @discardableResult
    func deleteLocalOriginal(
        for recording: LocalRecording,
        from library: LocalRecordingLibrary
    ) throws -> LocalRecording {
        guard let ownerAccountID = normalizedOwnerAccountID(recording.ownerAccountID),
              let fileURL = library.fileURL(for: recording) else {
            throw NSError(
                domain: "QuipslyLocalDeletion",
                code: 2,
                userInfo: [NSLocalizedDescriptionKey: "Quipsly could not verify this account-owned source path, so the local original was left untouched."]
            )
        }
        if let blockedReason = uploadManager.localDeletionBlocker(
            localRecordingID: recording.id,
            ownerAccountID: ownerAccountID,
            fileURL: fileURL
        ) {
            throw NSError(
                domain: "QuipslyLocalDeletion",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: blockedReason]
            )
        }

        let tombstone = try library.deleteLocalOriginal(recording.id)
        if let cleanupWarning = uploadManager.retireDormantUploadAfterConfirmedLocalDeletion(
            localRecordingID: recording.id,
            ownerAccountID: ownerAccountID,
            fileURL: fileURL
        ) {
            message = "Local original deleted from this iPhone. Quipsly retained its protected audit row and left server/account evidence untouched. \(cleanupWarning)"
        } else {
            message = "Local original deleted from this iPhone. Quipsly retained its protected audit row and left server/account evidence untouched."
        }
        return tombstone
    }

    func clearMessages() {
        message = nil
        errorMessage = nil
    }

    private func finishActiveCaptureContext(stoppedAt: Date) {
        guard let session = activeCaptureSession else { return }
        let captureID = activeCaptureID ?? UUID()
        let captureOwnerAccountID = activeCaptureOwnerSnapshot?.ownerAccountID

        if !usesPreviewData {
            _ = receiptStore.enqueue(
                captureID: captureID,
                sessionID: session.id,
                callRoomID: session.callRoomId,
                action: .stop,
                occurredAt: stoppedAt,
                ownerAccountID: captureOwnerAccountID
            )
            if let persistenceError = receiptStore.persistenceError {
                captureReceiptNotice = persistenceError
            }
        }

        selectedSessionID = session.id
        consentMonitorTask?.cancel()
        consentMonitorTask = nil
        activeCaptureSession = nil
        activeCaptureID = nil
        activeCaptureOwnerSnapshot = nil
        activeAudioCapture = nil
        captureRequiresNewTake = false
        captureSafetyNotice = nil
        scheduleReceiptFlush()
    }

    private func scheduleReceiptFlush() {
        guard !usesPreviewData, receiptStore.hasPendingReceipts, receiptFlushTask == nil else { return }
        let taskID = UUID()
        receiptFlushTaskID = taskID
        receiptFlushTask = Task { [weak self] in
            guard let self else { return }
            defer {
                if self.receiptFlushTaskID == taskID {
                    self.receiptFlushTask = nil
                    self.receiptFlushTaskID = nil
                }
            }
            var retryDelay: UInt64 = 5_000_000_000
            while !Task.isCancelled, self.receiptStore.hasPendingReceipts {
                await self.flushReceiptOutboxPass()
                guard !Task.isCancelled, self.receiptStore.hasPendingReceipts else { break }
                try? await Task.sleep(nanoseconds: retryDelay)
                retryDelay = min(retryDelay * 2, 60_000_000_000)
            }
        }
    }

    private func handleReceiptAccountIdentityChange(_ ownerAccountID: String?) {
        let ownerAccountID = normalizedOwnerAccountID(ownerAccountID)
        guard ownerAccountID != observedReceiptOwnerAccountID else { return }
        observedReceiptOwnerAccountID = ownerAccountID
        taskReminderScheduler.activateOwner(ownerAccountID)
        sessionNoteEditOutbox.activateOwner(ownerAccountID)
        reviewDigestClient.clear()

        sourceExitMonitorTask?.cancel()
        sourceExitMonitorTask = nil
        sourceExitMonitorTaskID = nil

        receiptFlushTask?.cancel()
        receiptFlushTask = nil
        receiptFlushTaskID = nil

        if let activeCaptureOwnerSnapshot,
           !AuthManager.shared.matchesStableOwnerSnapshot(activeCaptureOwnerSnapshot) {
            consentMonitorTask?.cancel()
            consentMonitorTask = nil
            captureRequiresNewTake = true
            if let activeAudioCapture,
               activeAudioCapture.captureState == .recording {
                activeAudioCapture.handleCommand(.pause)
            }
            captureSafetyNotice = "The Quipsly account changed. This take is paused and preserved under its original owner; stop and save it before starting another."
        }
        if let activeVideoCaptureOwnerSnapshot,
           !AuthManager.shared.matchesStableOwnerSnapshot(activeVideoCaptureOwnerSnapshot) {
            videoConsentMonitorTask?.cancel()
            videoConsentMonitorTask = nil
            captureSafetyNotice = "The Quipsly account changed. The camera controller is closing the protected source under its original owner; review it in Library before another take."
        }

        // ReceiptStore owns the partition switch on the same notification. Defer
        // restart one actor turn so observer ordering cannot select the prior
        // account's rows. The expected-owner auth binding remains the final guard.
        Task { @MainActor [weak self] in
            await Task.yield()
            self?.scheduleReceiptFlush()
            if let self {
                self.sourcePlanOutbox.resume(client: self.sessionClient)
            }
        }
    }

    private func normalizedOwnerAccountID(_ value: String?) -> String? {
        guard let value = value?.trimmingCharacters(in: .whitespacesAndNewlines),
              !value.isEmpty,
              value.count <= 256 else { return nil }
        return value
    }

    private func startConsentMonitor(captureID: UUID, audioCapture: AudioCaptureController) {
        guard !usesPreviewData else { return }
        guard let ownerSnapshot = activeCaptureOwnerSnapshot else { return }
        consentMonitorTask?.cancel()
        consentMonitorTask = Task { [weak self, weak audioCapture] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 10_000_000_000)
                guard !Task.isCancelled,
                      let self,
                      let audioCapture,
                      AuthManager.shared.matchesStableOwnerSnapshot(ownerSnapshot),
                      audioCapture.captureOwnerIsCurrent,
                      self.activeCaptureID == captureID,
                      let sessionID = self.activeCaptureSession?.id else {
                    return
                }

                let loadOutcome = await self.sessionClient.load(authoritativeSessionID: sessionID)
                guard self.activeCaptureID == captureID else { return }
                guard AuthManager.shared.matchesStableOwnerSnapshot(ownerSnapshot),
                      audioCapture.captureOwnerIsCurrent else {
                    self.captureRequiresNewTake = true
                    self.pauseCaptureForAuthorityLoss(
                        "The Quipsly account changed while capture authority was being checked.",
                        audioCapture: audioCapture
                    )
                    return
                }

                if case .transportUnavailable = loadOutcome {
                    // Transport ambiguity does not revoke authority. Keep the
                    // local take running and retry; local source remains truth.
                    continue
                }

                guard loadOutcome == .loaded,
                      let refreshed = self.sessionClient.sessions.first(where: { $0.id == sessionID }) else {
                    self.pauseCaptureForAuthorityLoss(
                        loadOutcome.message
                            ?? "Nest could not confirm that this capture session still exists and is allowed.",
                        audioCapture: audioCapture
                    )
                    return
                }

                self.activeCaptureSession = refreshed
                guard !refreshed.recordingConsentGranted || !refreshed.canRecordNow else { continue }

                self.pauseCaptureForAuthorityLoss(
                    "Consent or session readiness changed in Nest.",
                    audioCapture: audioCapture
                )
                return
            }
        }
    }

    private func startVideoConsentMonitor(videoCapture: VideoCaptureController) {
        guard !usesPreviewData,
              let ownerSnapshot = activeVideoCaptureOwnerSnapshot,
              let mode = activeVideoCaptureMode else { return }
        videoConsentMonitorTask?.cancel()
        videoConsentMonitorTask = Task { [weak self, weak videoCapture] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 10_000_000_000)
                guard !Task.isCancelled,
                      let self,
                      let videoCapture,
                      AuthManager.shared.matchesStableOwnerSnapshot(ownerSnapshot),
                      let sessionID = self.activeVideoCaptureSession?.id,
                      [.arming, .recording].contains(videoCapture.state) else {
                    return
                }

                let loadOutcome = await self.sessionClient.load(
                    authoritativeSessionID: sessionID
                )
                guard self.activeVideoCapture === videoCapture else { return }
                guard AuthManager.shared.matchesStableOwnerSnapshot(ownerSnapshot) else {
                    self.captureSafetyNotice = "The Quipsly account changed while video authority was being checked. The protected camera source is closing under its original owner."
                    await videoCapture.pause()
                    return
                }
                if case .transportUnavailable = loadOutcome {
                    continue
                }
                guard loadOutcome == .loaded,
                      let refreshed = self.sessionClient.sessions.first(where: { $0.id == sessionID }) else {
                    self.captureSafetyNotice = "\(loadOutcome.message ?? "Nest could not confirm this video session.") The camera source is closing and will remain preserved."
                    await videoCapture.pause()
                    return
                }
                self.activeVideoCaptureSession = refreshed
                let videoAllowed =
                    refreshed.recordingConsentVideoGranted == true
                    && refreshed.canRecordVideoNow == true
                let audioAllowed =
                    !mode.requiresAudioConsent
                    || (
                        refreshed.recordingConsentGranted
                        && (refreshed.canRecordAudioNow ?? refreshed.canRecordNow)
                    )
                guard videoAllowed, audioAllowed else {
                    self.captureSafetyNotice = "Consent or session readiness changed in Nest. Quipsly is closing this movie; the source remains preserved and resume requires a fresh authority check."
                    await videoCapture.pause()
                    return
                }
            }
        }
    }

    private func finishActiveVideoCaptureContext() {
        let sessionID = activeVideoCaptureSession?.id
        videoConsentMonitorTask?.cancel()
        videoConsentMonitorTask = nil
        activeVideoCaptureSession = nil
        activeVideoCaptureMode = nil
        activeVideoCaptureOwnerSnapshot = nil
        activeVideoCapture = nil
        if let sessionID {
            selectedSessionID = sessionID
        }
        scheduleReceiptFlush()
    }

    private func providerControlsAreAvailable() -> Bool {
        guard !providerControlsLockedForLocalCapture else {
            errorMessage = providerControlsLockMessage
            return false
        }
        return true
    }

    private var localSourceIsActive: Bool {
        if activeCoordinatedCaptureGroupID != nil { return true }
        if let state = activeVideoCapture?.state,
           state.isActive || state == .paused {
            return true
        }
        guard let state = activeAudioCapture?.captureState else { return false }
        switch state {
        case .recording, .paused, .finalizing:
            return true
        default:
            return false
        }
    }

    private func pauseCaptureForAuthorityLoss(
        _ reason: String,
        audioCapture: AudioCaptureController
    ) {
        if audioCapture.captureState == .recording {
            audioCapture.handleCommand(.pause)
        }
        captureSafetyNotice = "\(reason) Recording is paused and preserved; verify authority and everyone's consent before resuming, or stop and save the take."
    }

    private func captureStartVerificationMessage(for outcome: CaptureSessionLoadOutcome) -> String {
        switch outcome {
        case .loaded:
            return "Quipsly could not find the verified session after refresh. Nothing was recorded."
        case .transportUnavailable:
            return "Nest is temporarily unreachable, so Quipsly could not verify current session and consent authority. Nothing was recorded; reconnect and try again."
        case let .forbidden(message),
             let .authoritativeAbsent(message),
             let .invalidResponse(message):
            return "\(message) Nothing was recorded."
        }
    }

    private var captureOwnerChangedBeforeStartMessage: String {
        "The Quipsly account changed while recording permission was being verified. Nothing was recorded; review the current account and try again."
    }

    private func videoAuthorityIsCurrent(
        for session: MobileCaptureSession,
        mode: CaptureRecordingMode
    ) -> Bool {
        guard session.recordingConsentCanRecordVideo == true,
              session.recordingConsentVideoGranted == true,
              session.canRecordVideoNow == true else {
            return false
        }
        guard mode.requiresAudioConsent else { return true }
        return session.recordingConsentCanRecordAudio == true
            && session.recordingConsentGranted
            && (session.canRecordAudioNow ?? session.canRecordNow)
    }

    private func videoCaptureReadinessMessage(
        for session: MobileCaptureSession?
    ) -> String {
        guard let session else {
            return "Nest did not return the selected session while video authority was being refreshed. No new movie source was started."
        }
        if session.recordingConsentCanRecordVideo != true {
            return "Video is not included in your current consent receipt. Open Consent choices, turn on Record video, and save again."
        }
        if session.recordingConsentVideoGranted != true {
            return "Nest could not validate current-policy video consent for this participant. Review and resave the consent choices."
        }
        if session.allRegisteredParticipantVideoConsentGranted != true {
            let granted = session.videoConsentGrantedParticipantCount ?? 0
            let required = session.consentRequiredParticipantCount ?? 0
            return "Video is waiting for every signed-in participant to agree (\(granted) of \(required) ready). No camera source was started."
        }
        if let nextAction = session.videoCaptureReadiness?.nextAction?
            .trimmingCharacters(in: .whitespacesAndNewlines),
           !nextAction.isEmpty {
            return nextAction
        }
        return session.captureReadinessNextAction
    }

    private var providerRoomOwnerChangedMessage: String {
        "The Quipsly account changed while the live room was being prepared. Quipsly canceled the join so the new account cannot inherit the prior account's room token."
    }

    private func captureResumeVerificationMessage(for outcome: CaptureSessionLoadOutcome) -> String {
        switch outcome {
        case .loaded:
            return "Recording remains paused because Nest has not confirmed current session readiness and consent. You can always stop and save the local take."
        case .transportUnavailable:
            return "Recording remains paused while Nest is unreachable. Reconnect to verify authority before resuming, or stop and save the local take."
        case let .forbidden(message),
             let .authoritativeAbsent(message),
             let .invalidResponse(message):
            return "\(message) Recording remains paused and preserved; stop and save the take or resolve the authority blocker."
        }
    }

    private func flushReceiptOutboxPass() async {
        var terminalRejectionNotice: String?
        var deferredCaptureIDs = Set<UUID>()
        while !Task.isCancelled,
              let receipt = receiptStore.nextDeliverableReceipt(
                excludingCaptureIDs: deferredCaptureIDs
              ) {
            guard let receiptOwnerAccountID = normalizedOwnerAccountID(receipt.ownerAccountID),
                  receiptOwnerAccountID == normalizedOwnerAccountID(AuthManager.currentStoredOwnerID()) else {
                return
            }
            let delivery = await sessionClient.sendRoomStateReceipt(
                receipt,
                expectedOwnerAccountID: receiptOwnerAccountID
            )
            guard !Task.isCancelled,
                  receiptOwnerAccountID == normalizedOwnerAccountID(AuthManager.currentStoredOwnerID()) else {
                return
            }
            switch delivery {
            case let .retryable(message):
                // Never infer that a local STOP made an ambiguous START
                // unnecessary. The START is idempotently replayed until Nest
                // acknowledges or terminally rejects it; only then may its STOP
                // advance. Defer this capture for the rest of the pass so one
                // outage cannot head-of-line block unrelated safety closures.
                deferredCaptureIDs.insert(receipt.captureID)
                captureReceiptNotice = "Nest receipt waiting: \(message) Local recording remains authoritative and the outbox will retry."
                continue
            case let .terminallyRejected(message, errorCode):
                receiptStore.markRejectedByNest(
                    receipt.id,
                    errorCode: errorCode,
                    message: message
                )
                if receipt.action == .start,
                   receipt.captureID == activeCaptureID {
                    if activeAudioCapture?.captureState == .recording {
                        activeAudioCapture?.handleCommand(.pause)
                    }
                    consentMonitorTask?.cancel()
                    consentMonitorTask = nil
                    captureRequiresNewTake = true
                    captureSafetyNotice = "Nest rejected the recording start boundary: \(message) The local take is paused and preserved. Stop and save it, resolve the blocker, then start a new take."
                }
                if receipt.action == .start,
                   receipt.captureID == activeVideoCapture?.activeRecordingID,
                   let activeVideoCapture {
                    videoConsentMonitorTask?.cancel()
                    videoConsentMonitorTask = nil
                    captureSafetyNotice = "Nest rejected the video start boundary: \(message) Quipsly is closing and preserving the movie. Resolve the blocker before resuming or starting another source."
                    await activeVideoCapture.pause()
                }
                terminalRejectionNotice = "Nest preserved the receipt but held the room-state change: \(message)"
            case .acknowledged:
                if receipt.action == .start {
                    // Keep an acknowledged START until its STOP is acknowledged.
                    // A force-quit between those events can then close the server
                    // boundary on the next launch.
                    receiptStore.markAcknowledged(receipt.id)
                } else {
                    receiptStore.completeCapture(receipt.captureID)
                }
            }
        }

        if !receiptStore.hasPendingReceipts {
            captureReceiptNotice = receiptStore.persistenceError
                ?? terminalRejectionNotice
                ?? receiptStore.latestTerminalRejectionMessage.map {
                    "Nest preserved a capture receipt but held the room-state change: \($0)"
                }
                ?? "Nest recording receipts synchronized."
        }
    }

    private func replacePreviewSession(
        _ session: MobileCaptureSession,
        consentGranted: Bool,
        canRecordAudio: Bool = false,
        canRecordVideo: Bool = false,
        canTranscribe: Bool = false
    ) {
        let replacement = MobileCaptureSession.capturePreview(
            id: session.id,
            title: session.title,
            purpose: session.purpose ?? "COACHING",
            consentGranted: consentGranted,
            canRecordAudio: canRecordAudio,
            canRecordVideo: canRecordVideo,
            canTranscribe: canTranscribe,
            scheduledStart: session.scheduledStart
        )
        if let index = sessionClient.sessions.firstIndex(where: { $0.id == session.id }) {
            sessionClient.sessions[index] = replacement
        }
        selectedSessionID = replacement.id
    }
}

extension MobileCaptureSession {
    static var capturePreviewFixtures: [MobileCaptureSession] {
        let consentNeededIsNext =
            CaptureLaunchConfiguration
                .usesConsentNeededNextPreview
        let coachingStart = Date().addingTimeInterval(
            consentNeededIsNext ? 24 * 60 * 60 : 35 * 60
        )
        let podcastStart = Date().addingTimeInterval(
            consentNeededIsNext ? 10 * 60 : 24 * 60 * 60
        )
        return [
            capturePreview(
                id: "preview-coaching-ready",
                title: "Coaching session",
                purpose: "COACHING",
                consentGranted: true,
                scheduledStart: ISO8601DateFormatter().string(from: coachingStart),
                scheduledEnd: ISO8601DateFormatter().string(from: coachingStart.addingTimeInterval(50 * 60)),
                packetReviewLanes: capturePreviewPacketReviewLanes,
                clientFollowUpWorkspace: capturePreviewClientFollowUpWorkspace
            ),
            capturePreview(
                id: "preview-podcast-consent",
                title: "High Ground pre-show",
                purpose: "PODCAST",
                consentGranted: false,
                scheduledStart: ISO8601DateFormatter().string(from: podcastStart),
                scheduledEnd: ISO8601DateFormatter().string(from: podcastStart.addingTimeInterval(90 * 60))
            ),
            capturePreview(
                id: "preview-studio-group-ready",
                title: "Studio group ready",
                purpose: "PODCAST",
                consentGranted: true,
                scheduledStart: nil,
                captureSources: captureGroupPreviewSources(
                    captureGroupID: "preview-take-ready",
                    promotedSourceCount: 0
                )
            ),
            capturePreview(
                id: "preview-studio-group-partial",
                title: "Studio group retry",
                purpose: "PODCAST",
                consentGranted: true,
                scheduledStart: nil,
                captureSources: captureGroupPreviewSources(
                    captureGroupID: "preview-take-partial",
                    promotedSourceCount: 1
                )
            ),
            capturePreview(
                id: "preview-studio-group-complete",
                title: "Studio group complete",
                purpose: "PODCAST",
                consentGranted: true,
                scheduledStart: nil,
                captureSources: captureGroupPreviewSources(
                    captureGroupID: "preview-take-complete",
                    promotedSourceCount: 2
                )
            ),
        ]
    }

    private static func captureGroupPreviewSources(
        captureGroupID: String,
        promotedSourceCount: Int
    ) -> [MobileCaptureSourceSummary] {
        [
            MobileCaptureSourceSummary(
                recordingAssetId: "\(captureGroupID)-audio",
                captureGroupId: captureGroupID,
                fileName: "audio-master.m4a",
                kind: "LOCAL_AUDIO",
                contentType: "audio/mp4",
                recordingStatus: "VERIFIED",
                exactBytesVerified: true,
                processingDisposition: "RELEASED",
                recordedStartedAt: "2026-07-30T15:00:00.000Z",
                recordedStoppedAt: "2026-07-30T15:30:00.000Z",
                mediaAssetId: promotedSourceCount >= 1
                    ? "\(captureGroupID)-audio-media"
                    : nil,
                playbackUrl: promotedSourceCount >= 1
                    ? "/api/ingest/media/\(captureGroupID)-audio"
                    : nil,
                byteSize: "288000000",
                sha256: String(repeating: "a", count: 64),
                durationSeconds: 1_800,
                sourceId: promotedSourceCount >= 1
                    ? "\(captureGroupID)-audio"
                    : nil,
                sessionPlaybackUrl:
                    "/api/sessions/preview-studio-group-complete/recordings/\(captureGroupID)-audio/media"
            ),
            MobileCaptureSourceSummary(
                recordingAssetId: "\(captureGroupID)-video",
                captureGroupId: captureGroupID,
                fileName: "camera-front.mov",
                kind: "LOCAL_VIDEO",
                contentType: "video/quicktime",
                recordingStatus: "VERIFIED",
                exactBytesVerified: true,
                processingDisposition: "RELEASED",
                recordedStartedAt: "2026-07-30T15:00:00.080Z",
                recordedStoppedAt: "2026-07-30T15:30:00.080Z",
                mediaAssetId: promotedSourceCount >= 2
                    ? "\(captureGroupID)-video-media"
                    : nil,
                playbackUrl: promotedSourceCount >= 2
                    ? "/api/ingest/media/\(captureGroupID)-video"
                    : nil,
                byteSize: "4000000000",
                sha256: String(repeating: "b", count: 64),
                durationSeconds: 1_800,
                sourceId: promotedSourceCount >= 2
                    ? "\(captureGroupID)-video"
                    : nil,
                sessionPlaybackUrl:
                    "/api/sessions/preview-studio-group-complete/recordings/\(captureGroupID)-video/media"
            ),
        ]
    }

    static func capturePreview(
        id: String,
        title: String,
        purpose: String,
        consentGranted: Bool,
        canRecordAudio: Bool? = nil,
        canRecordVideo: Bool? = nil,
        canTranscribe: Bool = false,
        scheduledStart: String?,
        scheduledEnd: String? = nil,
        captureSources: [MobileCaptureSourceSummary] = [],
        packetReviewLanes: [MobileCapturePacketReviewLane] = [],
        clientFollowUpWorkspace: MobileCaptureClientFollowUpWorkspace? = nil
    ) -> MobileCaptureSession {
        let audioConsentGranted = consentGranted && (canRecordAudio ?? true)
        let videoConsentGranted = consentGranted && (canRecordVideo ?? true)
        let readiness = MobileCaptureReadinessVerdict(
            status: audioConsentGranted ? "READY" : "NEEDS_CONSENT",
            label: audioConsentGranted ? "Ready to record" : "Audio consent needed",
            tone: audioConsentGranted ? "green" : "orange",
            safeToRecordLocally: audioConsentGranted,
            providerCanJoin: true,
            detail: audioConsentGranted
                ? "Local source recording is ready on this iPhone."
                : "Confirm audio consent and attest that everyone who may be heard was told and agreed.",
            nextAction: audioConsentGranted
                ? "Open the recorder when everyone is ready."
                : "Save audio consent before starting an audio source.",
            blockers: audioConsentGranted ? [] : ["Audio recording consent is required."],
            evidence: audioConsentGranted ? ["Audio consent saved", "Local audio capture available"] : ["Session created"]
        )
        let videoReadiness = MobileCaptureReadinessVerdict(
            status: videoConsentGranted ? "READY" : "NEEDS_CONSENT",
            label: videoConsentGranted ? "Ready to record video" : "Video consent needed",
            tone: videoConsentGranted ? "green" : "orange",
            safeToRecordLocally: videoConsentGranted,
            providerCanJoin: true,
            detail: videoConsentGranted
                ? "Local video source recording is ready on this iPhone."
                : "Confirm video consent for everyone who may be captured.",
            nextAction: videoConsentGranted
                ? "Prepare the camera when everyone is ready."
                : "Save video consent before starting a camera source.",
            blockers: videoConsentGranted ? [] : ["Video recording consent is required."],
            evidence: videoConsentGranted ? ["Video consent saved", "Local video capture available"] : ["Session created"]
        )

        return MobileCaptureSession(
            id: id,
            callRoomId: "room-\(id)",
            title: title,
            purpose: purpose,
            status: "PLANNED",
            updatedAt: ISO8601DateFormatter().string(from: Date()),
            provider: "livekit",
            providerRoomId: "provider-\(id)",
            providerCanJoin: true,
            providerReadiness: "ready",
            providerNextAction: "Join only when the other participant is ready.",
            projectId: "preview-high-ground",
            projectSlug: "high-ground-odyssey",
            projectName: "High Ground Odyssey",
            availableTags: [
                MobileCaptureTag(id: "preview-production", slug: "production", label: "Production"),
                MobileCaptureTag(id: "preview-coaching", slug: "coaching", label: "Coaching"),
            ],
            projectBindingSource: "canonical-session-project",
            projectLegacySlugDrift: false,
            episodeSlug: "session-capture",
            episodeProductionId: "preview-session-capture",
            coachingEngagementId: purpose == "COACHING" ? "preview-engagement" : nil,
            coachingEngagementTitle: purpose == "COACHING" ? "Coaching with Homer" : nil,
            coachingEngagementStatus: purpose == "COACHING" ? "ACTIVE" : nil,
            scheduledStart: scheduledStart,
            scheduledEnd: scheduledEnd,
            participantId: "preview-host",
            recordingConsentId: "consent-\(id)",
            recordingConsentStatus: consentGranted ? "GRANTED" : "REQUESTED",
            recordingConsentGranted: audioConsentGranted,
            recordingConsentCanRecordAudio: audioConsentGranted,
            recordingConsentCanRecordVideo: videoConsentGranted,
            recordingConsentCanTranscribe: consentGranted && canTranscribe,
            recordingConsentVideoGranted: videoConsentGranted,
            canRecordNow: audioConsentGranted,
            canRecordAudioNow: audioConsentGranted,
            canRecordVideoNow: videoConsentGranted,
            consentRequiredParticipantCount: 1,
            consentGrantedParticipantCount: audioConsentGranted ? 1 : 0,
            allRegisteredParticipantConsentGranted: audioConsentGranted,
            videoConsentGrantedParticipantCount: videoConsentGranted ? 1 : 0,
            allRegisteredParticipantVideoConsentGranted: videoConsentGranted,
            captureReadiness: readiness,
            videoCaptureReadiness: videoReadiness,
            journeySummary: nil,
            lifecycle: nil,
            actionPacket: nil,
            clientLabel: "Homer",
            coachLabel: "Charlie",
            offeringTitle: nil,
            bookingStatus: "CONFIRMED",
            paymentPolicy: "NOT_REQUIRED",
            paymentStatus: "NOT_REQUIRED",
            calendarStatus: "READY",
            recordingCount: captureSources.count,
            captureSources: captureSources.isEmpty ? nil : captureSources,
            providerRecordingReceiptSlotId: nil,
            providerRecordingReceiptStatus: nil,
            providerRecordingReceiptNextAction: nil,
            transcriptJobCount: 0,
            latestRecordingAssetId: captureSources.first?.recordingAssetId,
            latestRecordingAssetStatus: captureSources.first?.recordingStatus,
            latestRecordingFileName: captureSources.first?.fileName,
            latestRecordingMediaAssetId: captureSources.first?.mediaAssetId,
            latestRecordingPlaybackUrl: captureSources.first?.playbackUrl,
            latestRecordingPromotionStatus: captureSources.isEmpty
                ? nil
                : captureSources.allSatisfy(\.isPromotedToStudio)
                    ? "promoted"
                    : "ready-to-promote",
            latestTranscriptJobId: packetReviewLanes.isEmpty ? nil : "preview-transcript-job",
            latestTranscriptStatus: packetReviewLanes.isEmpty ? nil : "COMPLETED",
            latestTranscriptProvider: packetReviewLanes.isEmpty ? nil : "preview-provider",
            latestTranscriptSegmentCount: packetReviewLanes.isEmpty ? nil : 3,
            coachingPacketSummaryNoteId: packetReviewLanes.isEmpty ? nil : "preview-packet-summary",
            coachingPacketTitle: packetReviewLanes.isEmpty ? nil : "Source-grounded Session brief",
            coachingPacketPreview: packetReviewLanes.isEmpty ? nil : "Review each purpose lane before creating canonical work.",
            coachingPacketHighlightCount: packetReviewLanes.isEmpty ? nil : 1,
            coachingPacketActionItemCount: packetReviewLanes.isEmpty ? nil : 0,
            coachingPacketLatestActivityAt: packetReviewLanes.isEmpty ? nil : ISO8601DateFormatter().string(from: Date()),
            coachingPacketFirstOpenActionItemId: nil,
            coachingPacketStatus: packetReviewLanes.isEmpty ? nil : "RESULTS_READY",
            coachingPacketReviewLanes: packetReviewLanes.isEmpty ? nil : packetReviewLanes,
            clientFollowUpWorkspace: clientFollowUpWorkspace,
            canUseProjectTeamNotes: true,
            sessionNotes: [
                MobileCaptureSessionNote(
                    id: "preview-session-note",
                    title: "Opening question",
                    body: "Ask what would make this session genuinely useful.",
                    kind: "DECISION",
                    visibility: "CLIENT_SAFE",
                    authorLabel: "Charlie",
                    isMine: true,
                    canEdit: true,
                    origin: "iPhone Capture",
                    revisionCount: 1,
                    tags: [
                        MobileCaptureTag(id: "preview-coaching", slug: "coaching", label: "Coaching"),
                    ],
                    createdAt: "2026-07-24T16:00:00.000Z",
                    updatedAt: "2026-07-24T16:00:00.000Z",
                    sourceAnchor: MobileCaptureTodayTranscriptSourceAnchor(
                        schema: "quipsly-transcript-derived-note-v1",
                        roomId: "room-preview-coaching-ready",
                        transcriptJobId: "preview-transcript-job",
                        segmentId: "preview-segment",
                        startSeconds: 3.66,
                        endSeconds: 4.84,
                        providerTextSha256: String(repeating: "a", count: 64),
                        providerSpeakerLabel: "Speaker",
                        effectiveTextSnapshot: "Ask what would make this session genuinely useful.",
                        effectiveSpeakerLabelSnapshot: "Charlie",
                        speakerAuthority: "source-binding",
                        sourceBoundParticipantId: "preview-participant-charlie",
                        acceptedCorrectionId: nil,
                        recordingAssetId: "preview-recording-asset",
                        playbackSourceId: "preview-playback-source"
                    )
                ),
            ],
            afterCaptureNextAction: "Record a local source, then verify upload.",
            nextAction: readiness.nextAction
        )
    }

    private static var capturePreviewPacketReviewLanes: [MobileCapturePacketReviewLane] {
        [
            MobileCapturePacketReviewLane(
                id: "client-follow-up",
                label: "Client follow-up notes",
                status: "READY_FOR_HUMAN_REVIEW",
                itemCount: 1,
                meaning: "Candidate recap material for the client or coachee.",
                sourceTruth: "Derived from transcript packet summary evidence only.",
                reviewRule: "Human approval is required before client delivery.",
                humanApprovalRequired: true,
                externalSideEffects: false,
                humanReview: nil
            ),
            MobileCapturePacketReviewLane(
                id: "goals-and-tasks",
                label: "Goals and tasks",
                status: "NEEDS_REVISION",
                itemCount: 1,
                meaning: "Candidate commitments that may become tasks, goals, or next-session prep.",
                sourceTruth: "Derived from transcript-backed candidates that are not committed work.",
                reviewRule: "Review candidate by candidate before assigning or promising work.",
                humanApprovalRequired: true,
                externalSideEffects: false,
                humanReview: MobileCapturePacketLaneHumanReview(
                    status: "NEEDS_REVISION",
                    note: "Clarify ownership before committing anything.",
                    reviewedAt: "2026-08-01T12:00:00Z",
                    reviewedByUserId: "preview-reviewer",
                    externalSideEffects: false,
                    deliveryClaimed: false,
                    publicationClaimed: false
                )
            ),
            MobileCapturePacketReviewLane(
                id: "podcast-production",
                label: "Podcast production",
                status: "READY_FOR_HUMAN_REVIEW",
                itemCount: 1,
                meaning: "Candidate clips, beats, and production notes for an episode.",
                sourceTruth: "Derived from the same transcript packet; no edit or publication is implied.",
                reviewRule: "A producer must review before routing anything into Studio.",
                humanApprovalRequired: true,
                externalSideEffects: false,
                humanReview: nil
            ),
            MobileCapturePacketReviewLane(
                id: "empty-quotes",
                label: "Quote candidates",
                status: "EMPTY",
                itemCount: 0,
                meaning: "Candidate quotes for deliberate editorial review.",
                sourceTruth: "No source-linked quote candidates were found.",
                reviewRule: "Empty categories have no decision controls.",
                humanApprovalRequired: true,
                externalSideEffects: false,
                humanReview: nil
            ),
        ]
    }

    private static var capturePreviewClientFollowUpWorkspace: MobileCaptureClientFollowUpWorkspace {
        let sourceChanged = CaptureLaunchConfiguration.usesStaleFollowUpPreview
        let anchor = MobileCaptureTodayTranscriptSourceAnchor(
            schema: "quipsly-transcript-derived-note-v1",
            roomId: "room-preview-coaching-ready",
            transcriptJobId: "preview-transcript-job",
            segmentId: "preview-segment",
            startSeconds: 3.66,
            endSeconds: 4.84,
            providerTextSha256: String(repeating: "a", count: 64),
            providerSpeakerLabel: "Speaker",
            effectiveTextSnapshot: "Ask what would make this session genuinely useful.",
            effectiveSpeakerLabelSnapshot: "Charlie",
            speakerAuthority: "source-binding",
            sourceBoundParticipantId: "preview-participant-charlie",
            acceptedCorrectionId: nil,
            recordingAssetId: "preview-recording-asset",
            playbackSourceId: "preview-playback-source"
        )
        let note = MobileCaptureClientFollowUpNote(
            id: "preview-follow-up-note",
            title: "Opening question",
            body: "Ask what would make this session genuinely useful.",
            kind: "DECISION",
            sourceAnchor: anchor
        )
        let output = MobileCaptureClientFollowUp(
            id: "preview-client-follow-up",
            status: "DRAFT",
            title: "Follow-up — Coaching session",
            intro: "A private draft assembled from the reviewed Session records.",
            nextSessionFocus: "Return to the question after trying one concrete change.",
            contentSha256: String(repeating: "c", count: 64),
            revision: 1,
            releasedAt: nil,
            recipientLabel: "Homer",
            openedAt: nil,
            canAcknowledge: false,
            notes: [note],
            goals: [],
            tasks: []
        )
        return MobileCaptureClientFollowUpWorkspace(
            role: "COACH",
            room: MobileCaptureClientFollowUpRoom(
                id: "room-preview-coaching-ready",
                title: "Coaching session",
                scheduledStart: nil,
                coach: MobileCaptureClientFollowUpParty(id: "preview-coach", label: "Charlie"),
                client: MobileCaptureClientFollowUpParty(id: "preview-client", label: "Homer")
            ),
            eligible: MobileCaptureClientFollowUpEligible(notes: [note], goals: [], tasks: []),
            output: output,
            readiness: MobileCaptureClientFollowUpReadiness(
                status: sourceChanged ? "SOURCE_CHANGED" : "READY",
                releaseAllowed: !sourceChanged,
                checkedRevision: 1,
                selectedCount: 1,
                changedCount: sourceChanged ? 1 : 0,
                changes: sourceChanged ? [
                    MobileCaptureClientFollowUpReadinessChange(
                        kind: "NOTE",
                        id: note.id,
                        label: note.title ?? "Session note",
                        reason: "CONTENT_CHANGED"
                    ),
                ] : []
            )
        )
    }
}
