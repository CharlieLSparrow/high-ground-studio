import Combine
import Foundation

enum CaptureRootTab: String, CaseIterable, Identifiable {
    case today
    case record
    case library
    case account

    var id: String { rawValue }

    var title: String {
        switch self {
        case .today: "Today"
        case .record: "Record"
        case .library: "Library"
        case .account: "Account"
        }
    }

    var systemImage: String {
        switch self {
        case .today: "sun.max"
        case .record: "record.circle"
        case .library: "waveform"
        case .account: "person.crop.circle"
        }
    }
}

enum CaptureLaunchConfiguration {
    private static let shareOwnerPreviewPrefix = "--capture-share-owner-ui-preview="

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

    static var usesReminderSystemUITest: Bool {
        #if DEBUG && targetEnvironment(simulator)
        ProcessInfo.processInfo.arguments.contains("--capture-reminder-system-ui-test")
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

    /// A simulator-only owner used to exercise the real Share Extension and
    /// protected handoff without a production account or network mutation.
    static var shareExtensionUITestOwner: String? {
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

@MainActor
final class CaptureExperienceModel: ObservableObject {
    @Published var selectedTab: CaptureRootTab = .today
    @Published var selectedSessionID: String?
    @Published var isRefreshing = false
    @Published var isCreatingSession = false
    @Published var isChangingConsent = false
    @Published var isChangingCapture = false
    @Published var isChangingRoom = false
    @Published var newSessionTitle = ""
    @Published var newSessionPurpose = "COACHING"
    @Published var message: String?
    @Published var errorMessage: String?
    @Published var preparedRoomJoin: MobileCaptureRoomJoinResponse?
    @Published private(set) var activeCaptureSession: MobileCaptureSession?
    @Published private(set) var activeRoomSession: MobileCaptureSession?
    @Published private(set) var captureReceiptNotice: String?
    @Published private(set) var captureSafetyNotice: String?
    @Published private(set) var isSyncingQuickEntries = false
    @Published private(set) var quickEntrySyncMessage: String?
    @Published private(set) var isPromotingRecordingToStudio = false

    let sessionClient = CaptureSessionClient()
    let todayClient = CaptureTodayClient()
    let providerRoom = ProviderRoomController()
    let readinessClient = CaptureReadinessClient()
    let uploadManager = UploadManager.shared
    let receiptStore = CaptureRoomReceiptStore.shared
    let quickEntryOutbox = MobileQuickEntryOutbox.shared
    let taskReminderScheduler = TaskReminderScheduler.shared

    private(set) var usesPreviewData: Bool
    private var activeCaptureID: UUID?
    private var activeCaptureOwnerSnapshot: AuthManager.StableOwnerSnapshot?
    private weak var activeAudioCapture: AudioCaptureController?
    private var captureRequiresNewTake = false
    private var receiptFlushTask: Task<Void, Never>?
    private var receiptFlushTaskID: UUID?
    private var consentMonitorTask: Task<Void, Never>?
    private var didReconcileReceiptOutbox = false
    private var observedReceiptOwnerAccountID: String?
    private var cancellables = Set<AnyCancellable>()

    init(usesPreviewData: Bool? = nil) {
        self.usesPreviewData = usesPreviewData ?? CaptureLaunchConfiguration.usesPreviewData
        observedReceiptOwnerAccountID = normalizedOwnerAccountID(AuthManager.currentStoredOwnerID())
        if self.usesPreviewData, let previewTab = CaptureLaunchConfiguration.previewTab {
            selectedTab = previewTab
        }

        sessionClient.objectWillChange
            .sink { [weak self] _ in self?.objectWillChange.send() }
            .store(in: &cancellables)
        todayClient.objectWillChange
            .sink { [weak self] _ in self?.objectWillChange.send() }
            .store(in: &cancellables)
        providerRoom.objectWillChange
            .sink { [weak self] _ in self?.objectWillChange.send() }
            .store(in: &cancellables)
        readinessClient.objectWillChange
            .sink { [weak self] _ in self?.objectWillChange.send() }
            .store(in: &cancellables)
        uploadManager.objectWillChange
            .sink { [weak self] _ in self?.objectWillChange.send() }
            .store(in: &cancellables)
        receiptStore.objectWillChange
            .sink { [weak self] _ in self?.objectWillChange.send() }
            .store(in: &cancellables)
        quickEntryOutbox.objectWillChange
            .sink { [weak self] _ in self?.objectWillChange.send() }
            .store(in: &cancellables)
        taskReminderScheduler.objectWillChange
            .sink { [weak self] _ in self?.objectWillChange.send() }
            .store(in: &cancellables)
        taskReminderScheduler.activateOwner(observedReceiptOwnerAccountID)
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
    }

    var sessions: [MobileCaptureSession] {
        sessionClient.sessions
    }

    var selectedSession: MobileCaptureSession? {
        if let activeCaptureSession { return activeCaptureSession }
        if let activeRoomSession { return activeRoomSession }
        if let selectedSessionID,
           let selected = sessions.first(where: { $0.id == selectedSessionID }) {
            return selected
        }
        return sessions.first
    }

    var nextSession: MobileCaptureSession? {
        sessions.first(where: { !["ENDED", "CANCELED", "FAILED"].contains(($0.status ?? "").uppercased()) })
            ?? sessions.first
    }

    var isProviderConnected: Bool {
        providerRoom.isConnected
    }

    /// Provider audio transitions are intentionally serialized outside a v1
    /// local take. The local source must not inherit route or engine changes
    /// from join, leave, or mute actions while it is recording or being saved.
    var providerControlsLockedForLocalCapture: Bool {
        if isChangingCapture { return true }
        guard let state = activeAudioCapture?.captureState else { return false }
        switch state {
        case .recording, .paused, .finalizing:
            return true
        default:
            return false
        }
    }

    var providerControlsLockMessage: String {
        "Live room controls are locked while the local take is recording, paused, or saving. Stop and save the take before changing provider audio; the local source stays preserved."
    }

    var isSessionContextLocked: Bool {
        activeCaptureSession != nil
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
        defer { isRefreshing = false }
        errorMessage = nil

        if usesPreviewData {
            if let previewOwner = CaptureLaunchConfiguration.shareExtensionUITestOwner {
                quickEntryOutbox.activateOwner(previewOwner)
                let importedSharedSources = quickEntryOutbox.importShareExtensionCaptures()
                if importedSharedSources > 0 {
                    quickEntrySyncMessage = "Imported \(importedSharedSources) protected Share Sheet source\(importedSharedSources == 1 ? "" : "s") into this account's outbox."
                }
            }
            await taskReminderScheduler.reconcile(
                drafts: quickEntryOutbox.entries.compactMap(\.taskReminderDraft)
            )
            sessionClient.sessions = MobileCaptureSession.capturePreviewFixtures
            todayClient.loadPreview()
            sessionClient.status = "Preview ready"
            selectedSessionID = selectedSessionID ?? sessionClient.sessions.first?.id
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
        async let sessionLoad = sessionClient.load()
        async let todayLoad = todayClient.load()
        async let readinessLoad = readinessClient.load()
        _ = await (sessionLoad, todayLoad, readinessLoad)
        await taskReminderScheduler.reconcile(
            drafts: quickEntryOutbox.entries.compactMap(\.taskReminderDraft)
        )
        await retryQuickEntries(automatic: true)
        if selectedSessionID == nil || !sessions.contains(where: { $0.id == selectedSessionID }) {
            selectedSessionID = nextSession?.id
        }
        errorMessage = sessionClient.errorMessage
    }

    @discardableResult
    func saveQuickEntry(
        kind: MobileQuickEntryKind,
        title: String?,
        body: String,
        saveNoteToHomeNest: Bool = false,
        tagIDs: [String] = [],
        newTagLabels: [String] = [],
        dueAt: Date? = nil,
        reminderAt: Date? = nil,
        recurrence: MobileQuickEntryRecurrence? = nil
    ) -> Bool {
        let session = kind == .note && saveNoteToHomeNest ? nil : selectedSession
        guard kind == .source || kind == .note || session != nil else {
            errorMessage = "Choose a Session before saving a task or goal."
            return false
        }
        if usesPreviewData && !CaptureLaunchConfiguration.usesReminderSystemUITest {
            quickEntrySyncMessage = "Preview only — no note, task, goal, or source was saved."
            return true
        }

        do {
            let entry = try quickEntryOutbox.enqueue(
                kind: kind,
                session: session,
                title: title,
                body: body,
                tagIDs: tagIDs,
                newTagLabels: newTagLabels,
                dueAt: dueAt,
                reminderAt: reminderAt,
                recurrence: recurrence
            )
            quickEntrySyncMessage = kind == .source
                ? "Source saved on this iPhone. Nest sync will place the same private ID in Inbox."
                : kind == .note && session == nil
                    ? "Note saved on this iPhone. Nest sync will create the same private Home Nest document."
                : !newTagLabels.isEmpty
                    ? "\(kind.title) and \(newTagLabels.count) new tag name\(newTagLabels.count == 1 ? "" : "s") saved on this iPhone. Nest will create or reuse the same private vocabulary on sync."
                : "\(kind.title) saved on this iPhone. Nest sync uses the same retry-safe ID."
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
                    if self.usesPreviewData {
                        self.quickEntrySyncMessage = self.taskReminderScheduler.statusMessage
                        return
                    }
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
            quickEntrySyncMessage = "Synced \(acknowledged) quick capture\(acknowledged == 1 ? "" : "s") to canonical Nest records."
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
            if refreshToday { await todayClient.load() }
        case let .retryable(message):
            quickEntryOutbox.markRetryable(entry.id, message: message)
            quickEntrySyncMessage = message
        case let .held(code, message):
            quickEntryOutbox.markHeld(entry.id, code: code, message: message)
            quickEntrySyncMessage = message
        }
    }

    func select(_ session: MobileCaptureSession, openRecorder: Bool = false) {
        if isSessionContextLocked, selectedSession?.id != session.id {
            errorMessage = "Stop and save the active recording or leave the live room before changing sessions."
            return
        }
        selectedSessionID = session.id
        preparedRoomJoin = nil
        message = nil
        errorMessage = nil
        if openRecorder {
            selectedTab = .record
        }
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
            selectedTab = .record
            message = "Session created. Confirm consent when everyone is ready."
            return true
        }

        guard let created = await sessionClient.createQuickSession(
            title: title,
            purpose: newSessionPurpose
        ) else {
            errorMessage = sessionClient.errorMessage ?? "Quipsly could not create the session."
            return false
        }

        selectedSessionID = created.id
        newSessionTitle = ""
        selectedTab = .record
        message = "Session created. Confirm consent when everyone is ready."
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
        guard activeCaptureSession == nil else {
            errorMessage = "Consent cannot change while this iPhone is recording. Stop and save the take first."
            return false
        }
        guard canRecordAudio else {
            errorMessage = "Turn on Record audio before saving consent. Transcription remains a separate choice."
            return false
        }
        guard !canRecordVideo else {
            errorMessage = "Video must remain off in this audio-only Capture flow. Review the choices before continuing."
            return false
        }
        guard allAudibleParticipantsNotifiedAndAgreed else {
            errorMessage = "Confirm that everyone nearby who may be heard was told and agreed before saving consent."
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
            replacePreviewSession(session, consentGranted: true)
            message = canTranscribe
                ? "Recording and transcription choices saved for this preview session."
                : "Recording consent saved for this preview session. Transcription remains off."
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
        message = canTranscribe
            ? "Audio recording consent and transcription opt-in are saved. Capture can start when every required participant has agreed."
            : "Audio recording consent is saved; transcription is off. Capture can start when every required participant has agreed."
        return true
    }

    func revokeConsent() async {
        guard let session = selectedSession, !isChangingConsent else { return }
        guard activeCaptureSession == nil else {
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
            return
        }
        guard activeCaptureSession == nil else {
            errorMessage = "Stop and save the active take before attaching its verified recording to Studio."
            return
        }
        guard !usesPreviewData else {
            message = "Preview mode shows the Studio handoff without changing media."
            return
        }
        guard let ownerSnapshot = AuthManager.shared.stableOwnerSnapshot() else {
            errorMessage = "Verify the current Quipsly account before attaching recording media to Studio."
            return
        }

        isPromotingRecordingToStudio = true
        errorMessage = nil
        defer { isPromotingRecordingToStudio = false }

        let promoted = await sessionClient.promoteRecordingToStudioMedia(for: session)
        guard AuthManager.shared.matchesStableOwnerSnapshot(ownerSnapshot) else {
            errorMessage = "The Quipsly account changed during the Studio handoff. Review the current account and session before continuing."
            return
        }
        guard promoted else {
            errorMessage = sessionClient.errorMessage ?? "The verified recording could not be attached to Studio media."
            return
        }

        selectedSessionID = session.id
        message = "Studio media ready. The immutable local source and server recording evidence remain preserved."
    }

    func startCapture(using audioCapture: AudioCaptureController) async {
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
        guard activeCaptureSession == nil, !isChangingCapture else { return }
        guard !isChangingRoom else {
            errorMessage = "Wait for the live room to finish connecting before starting the local recorder."
            return
        }
        if let activeRoomSession, activeRoomSession.id != session.id {
            errorMessage = "Leave the active live room before recording a different session."
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
        do {
            try audioCapture.armNextCapture(
                captureID: captureID,
                sessionID: session.id,
                callRoomID: session.callRoomId,
                requiresDurableRoomReceipt: !usesPreviewData,
                expectedOwnerSnapshot: ownerSnapshot
            )
        } catch {
            isChangingCapture = false
            errorMessage = "Quipsly could not durably journal the recording start. Nothing was recorded: \(error.localizedDescription)"
            return
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

        guard audioCapture.captureState == .recording else {
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
        guard activeCaptureSession != nil, !isChangingCapture else { return }
        guard state == .saved || state == .failed || state == .idle else { return }
        if state == .saved {
            message = activeAudioCapture?.automaticStopReason
                ?? "Saved on this iPhone. Upload can continue in the background."
        } else if state == .failed,
                  let recorderError = activeAudioCapture?.lastErrorMessage {
            errorMessage = recorderError
        }
        finishActiveCaptureContext(stoppedAt: Date())
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
            if audioCapture.captureState == .recording {
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

    func joinRoom() async {
        guard let session = selectedSession, !isChangingRoom else { return }
        guard providerControlsAreAvailable() else { return }
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
        activeRoomSession = session
        selectedSessionID = session.id
        let preparedJoin = await sessionClient.prepareRoomJoin(for: session)
        guard AuthManager.shared.matchesStableOwnerSnapshot(ownerSnapshot) else {
            activeRoomSession = nil
            preparedRoomJoin = nil
            errorMessage = providerRoomOwnerChangedMessage
            return
        }
        guard let join = preparedJoin else {
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
            expectedOwnerSnapshot: ownerSnapshot
        )
        guard AuthManager.shared.matchesStableOwnerSnapshot(ownerSnapshot) else {
            await providerRoom.disconnect()
            activeRoomSession = nil
            preparedRoomJoin = nil
            errorMessage = providerRoomOwnerChangedMessage
            return
        }
        errorMessage = providerRoom.lastError
        if !providerRoom.isConnected {
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

    func toggleRoomMute() async {
        guard providerControlsAreAvailable() else { return }
        await providerRoom.setMuted(!providerRoom.isMuted)
    }

    func retryUploads() {
        uploadManager.retryRecoverableUploads()
    }

    func retryUpload(for recording: LocalRecording) {
        guard recording.status.isUploadEligible else {
            if recording.status == .validatingRecovery {
                errorMessage = "Quipsly is still validating this preserved source through its end. Upload will unlock only after that check is durably saved."
            } else if recording.status == .needsRepair {
                errorMessage = "This source needs repair before Quipsly can upload it. The original bytes remain on this iPhone."
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

        // ReceiptStore owns the partition switch on the same notification. Defer
        // restart one actor turn so observer ordering cannot select the prior
        // account's rows. The expected-owner auth binding remains the final guard.
        Task { @MainActor [weak self] in
            await Task.yield()
            self?.scheduleReceiptFlush()
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

    private func providerControlsAreAvailable() -> Bool {
        guard !providerControlsLockedForLocalCapture else {
            errorMessage = providerControlsLockMessage
            return false
        }
        return true
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

    private func replacePreviewSession(_ session: MobileCaptureSession, consentGranted: Bool) {
        let replacement = MobileCaptureSession.capturePreview(
            id: session.id,
            title: session.title,
            purpose: session.purpose ?? "COACHING",
            consentGranted: consentGranted,
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
        [
            capturePreview(
                id: "preview-coaching-ready",
                title: "Homer coaching session",
                purpose: "COACHING",
                consentGranted: true,
                scheduledStart: ISO8601DateFormatter().string(from: Date().addingTimeInterval(35 * 60))
            ),
            capturePreview(
                id: "preview-podcast-consent",
                title: "High Ground pre-show",
                purpose: "PODCAST",
                consentGranted: false,
                scheduledStart: ISO8601DateFormatter().string(from: Date().addingTimeInterval(24 * 60 * 60))
            ),
        ]
    }

    static func capturePreview(
        id: String,
        title: String,
        purpose: String,
        consentGranted: Bool,
        scheduledStart: String?
    ) -> MobileCaptureSession {
        let readiness = MobileCaptureReadinessVerdict(
            status: consentGranted ? "READY" : "NEEDS_CONSENT",
            label: consentGranted ? "Ready to record" : "Consent needed",
            tone: consentGranted ? "green" : "orange",
            safeToRecordLocally: consentGranted,
            providerCanJoin: true,
            detail: consentGranted
                ? "Local source recording is ready on this iPhone."
                : "Confirm your consent and attest that everyone who may be heard was told and agreed.",
            nextAction: consentGranted
                ? "Open the recorder when everyone is ready."
                : "Save the recorder consent attestation.",
            blockers: consentGranted ? [] : ["Recording consent is required."],
            evidence: consentGranted ? ["Recorder attestation saved", "Local capture available"] : ["Session created"]
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
            scheduledStart: scheduledStart,
            scheduledEnd: nil,
            participantId: "preview-host",
            recordingConsentId: "consent-\(id)",
            recordingConsentStatus: consentGranted ? "GRANTED" : "REQUESTED",
            recordingConsentGranted: consentGranted,
            canRecordNow: consentGranted,
            captureReadiness: readiness,
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
            recordingCount: 0,
            providerRecordingReceiptSlotId: nil,
            providerRecordingReceiptStatus: nil,
            providerRecordingReceiptNextAction: nil,
            transcriptJobCount: 0,
            latestRecordingAssetId: nil,
            latestRecordingAssetStatus: nil,
            latestRecordingFileName: nil,
            latestRecordingMediaAssetId: nil,
            latestRecordingPlaybackUrl: nil,
            latestRecordingPromotionStatus: nil,
            latestTranscriptJobId: nil,
            latestTranscriptStatus: nil,
            latestTranscriptProvider: nil,
            latestTranscriptSegmentCount: nil,
            coachingPacketSummaryNoteId: nil,
            coachingPacketTitle: nil,
            coachingPacketPreview: nil,
            coachingPacketHighlightCount: nil,
            coachingPacketActionItemCount: nil,
            coachingPacketLatestActivityAt: nil,
            coachingPacketFirstOpenActionItemId: nil,
            coachingPacketStatus: nil,
            afterCaptureNextAction: "Record a local source, then verify upload.",
            nextAction: readiness.nextAction
        )
    }
}
