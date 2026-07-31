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
    @Published private(set) var activeVideoCaptureSession: MobileCaptureSession?
    @Published private(set) var activeVideoCaptureMode: CaptureRecordingMode?
    @Published private(set) var activeCoordinatedCaptureGroupID: UUID?
    @Published private(set) var isCoordinatingPodcastCapture = false
    @Published private(set) var activeRoomSession: MobileCaptureSession?
    @Published private(set) var captureReceiptNotice: String?
    @Published private(set) var captureSafetyNotice: String?
    @Published private(set) var isSyncingQuickEntries = false
    @Published private(set) var quickEntrySyncMessage: String?
    @Published private(set) var isSyncingSessionNoteEdits = false
    @Published private(set) var sessionNoteEditMessage: String?
    @Published private(set) var sessionNoteEditMessageRoomID: String?
    @Published private(set) var isPromotingRecordingToStudio = false

    let sessionClient = CaptureSessionClient()
    let todayClient = CaptureTodayClient()
    let workClient = CaptureWorkClient()
    let sourceInboxClient = CaptureSourceInboxClient()
    let providerRoom = ProviderRoomController()
    let readinessClient = CaptureReadinessClient()
    let uploadManager = UploadManager.shared
    let receiptStore = CaptureRoomReceiptStore.shared
    let quickEntryOutbox = MobileQuickEntryOutbox.shared
    let sessionNoteEditOutbox = SessionNoteEditOutbox.shared
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
    private var consentMonitorTask: Task<Void, Never>?
    private var videoConsentMonitorTask: Task<Void, Never>?
    private var isStoppingCoordinatedCapture = false
    private var didReconcileReceiptOutbox = false
    private var observedReceiptOwnerAccountID: String?
    private var cancellables = Set<AnyCancellable>()

    init(usesPreviewData: Bool? = nil) {
        self.usesPreviewData = usesPreviewData ?? CaptureLaunchConfiguration.usesPreviewData
        observedReceiptOwnerAccountID = normalizedOwnerAccountID(AuthManager.currentStoredOwnerID())
        sessionClient.objectWillChange
            .sink { [weak self] _ in self?.objectWillChange.send() }
            .store(in: &cancellables)
        todayClient.objectWillChange
            .sink { [weak self] _ in self?.objectWillChange.send() }
            .store(in: &cancellables)
        workClient.objectWillChange
            .sink { [weak self] _ in self?.objectWillChange.send() }
            .store(in: &cancellables)
        sourceInboxClient.objectWillChange
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
        sessionNoteEditOutbox.objectWillChange
            .sink { [weak self] _ in self?.objectWillChange.send() }
            .store(in: &cancellables)
        taskReminderScheduler.objectWillChange
            .sink { [weak self] _ in self?.objectWillChange.send() }
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
    }

    var sessions: [MobileCaptureSession] {
        sessionClient.sessions
    }

    var captureProjects: [MobileCaptureProjectDestination] {
        sessionClient.captureProjects
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
        "Live room controls are locked while a local audio-bearing take or coordinated podcast group is recording, paused, or saving. Stop and save it before changing provider audio. Podcast camera mode remains video-only so it can coexist with the room."
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
        defer { isRefreshing = false }
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
            todayClient.loadPreview()
            workClient.loadPreview()
            sourceInboxClient.loadPreview()
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
        async let todayLoad: Void = todayClient.load()
        async let workLoad: Void = workClient.load(projectID: workClient.selectedProjectID)
        async let sourceInboxLoad: Void = sourceInboxClient.load()
        async let readinessLoad: Void = readinessClient.load()
        _ = await (sessionLoad, todayLoad, workLoad, sourceInboxLoad, readinessLoad)
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
            if kind == .source {
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
                    ? "No protected Session-note edits need retry."
                    : "A protected Session-note edit needs deliberate review beside Nest's current revision."
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
            sessionNoteEditMessage = "Nest is offline. The complete Session-note edit remains protected on this iPhone."
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
        selectedSessionID = session.id
        preparedRoomJoin = nil
        message = nil
        errorMessage = nil
        guard !usesPreviewData else { return }
        Task { [weak self] in
            await self?.sessionClient.refreshClientFollowUp(forSessionID: session.id)
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
            return
        }
        guard activeCaptureSession == nil, activeVideoCaptureSession == nil else {
            errorMessage = "Stop and save the active take before attaching its verified recording to Studio."
            return
        }
        if session.recordingPromotedToStudioMedia {
            errorMessage = nil
            message = "This complete capture group is already available in Studio. Every original remains preserved."
            return
        }
        guard session.canPromoteRecordingToStudioMedia else {
            errorMessage = session.recordingMediaVaultLine
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
        let sourceCount = session.studioHandoffSources.count
        message = sourceCount > 1
            ? "Studio handoff complete for all \(sourceCount) capture-group sources. Every immutable original and server receipt remains preserved."
            : "Studio media ready. The immutable local source and server recording evidence remain preserved."
    }

    func prepareVideoCapture(
        using videoCapture: VideoCaptureController,
        mode: CaptureRecordingMode,
        position: VideoCaptureCameraPosition
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
        errorMessage = nil
        message = nil
        await videoCapture.prepare(
            position: position,
            includesAudio: mode.movieIncludesAudio
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
            captureGroupID: captureGroupID
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

        let captureGroupID = UUID()
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
        let resolvedCaptureGroupID = captureGroupID ?? captureID
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
        [
            capturePreview(
                id: "preview-coaching-ready",
                title: "Demo coaching session",
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
                    : nil
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
                    : nil
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
        captureSources: [MobileCaptureSourceSummary] = []
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
            scheduledStart: scheduledStart,
            scheduledEnd: nil,
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
                    updatedAt: "2026-07-24T16:00:00.000Z"
                ),
            ],
            afterCaptureNextAction: "Record a local source, then verify upload.",
            nextAction: readiness.nextAction
        )
    }
}
