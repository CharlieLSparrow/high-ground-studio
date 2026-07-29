import Foundation
import AVFoundation
import Combine
import MediaPlayer
import UIKit

enum AudioCaptureState: String, Codable, CaseIterable {
    case idle
    case preparing
    case recording
    case paused
    case finalizing
    case saved
    case failed
}

enum MicrophonePreflightState: String, Codable {
    case undetermined
    case granted
    case denied
}

@MainActor
final class AudioCaptureController: NSObject, ObservableObject {
    @Published private(set) var captureState: AudioCaptureState = .idle
    @Published private(set) var microphonePreflightState: MicrophonePreflightState = .undetermined
    @Published private(set) var isRecording: Bool = false
    @Published private(set) var currentDuration: TimeInterval = 0
    @Published private(set) var currentTakeOrder: Int = 1
    @Published private(set) var currentSegmentOrder: Int = 1
    @Published private(set) var userMarkOffsets: [TimeInterval] = []
    @Published private(set) var inputLevelDB: Float = -160
    @Published private(set) var normalizedInputLevel: Double = 0
    @Published private(set) var peakInputLevelDB: Float = -160
    @Published private(set) var inputRouteName: String = "No microphone selected"
    @Published private(set) var inputRoutePortType: String?
    @Published private(set) var failureMessage: String?
    @Published private(set) var lastErrorMessage: String?
    @Published private(set) var automaticStopReason: String?
    @Published private(set) var availableCaptureCapacityBytes: Int64?
    @Published private(set) var recordingConsentGranted: Bool = false
    @Published private(set) var activeCallRoomLabel: String = "No coaching/podcast room selected"
    @Published private(set) var localRecordingRecoveryNote: String = "Local recordings are preserved until Quipsly verifies upload."

    let localRecordingLibrary = LocalRecordingLibrary.shared

    // Callback retained for the existing WebView bridge contract.
    var onStateChange: ((RecorderEvent) -> Void)?

    private let audioSession = AVAudioSession.sharedInstance()
    private let audioSessionCoordinator = CaptureAudioSessionCoordinator.shared
    private let receiptStore = CaptureRoomReceiptStore.shared
    private let hardStorageReserveBytes: Int64 = 256 * 1024 * 1024
    private let projectedFinalizeOverheadBytes: Int64 = 8 * 1024 * 1024
    private let estimatedEncodedBytesPerSecond: Int64 = 30_000
    private let storageProjectionWindowSeconds: Int64 = 180
    private let storageCheckInterval: TimeInterval = 2
    private var audioRecorder: AVAudioRecorder?
    #if canImport(LiveKit)
    private var providerAudioMaster: ProviderAudioMasterRecorder?
    #endif
    private var displayDurationTimer: Timer?
    private var startTask: Task<Void, Never>?
    private var providerAudioStartWatchdogTask: Task<Void, Never>?
    private var accountObserver: NSObjectProtocol?

    private var currentRecordingURL: URL?
    private(set) var activeLocalRecordingID: UUID?
    private var pendingUploadRecordingID: UUID?
    private var startTime: Date?
    private var accumulatedDuration: TimeInterval = 0
    private var overallStartTimestamp: Date?
    private var pendingFinalizationStoppedAt: Date?
    private var pendingFinalizationDuration: TimeInterval = 0
    private var localFallbackSessionId: String?
    private var pausedByInterruption = false
    private var lastStorageCheckAt: Date = .distantPast
    private var storageCapacityProbeFailed = false
    private var pendingFinalizationMessage: String?
    private var pendingProviderSegmentStart: Date?

    var capturePipelineLabel: String {
        #if canImport(LiveKit)
        if providerAudioMaster != nil {
            return "Same microphone as the live room"
        }
        if audioSessionCoordinator.isProviderRoomActive {
            return "Will use the live-room microphone"
        }
        #endif
        return "Recorded directly on this iPhone"
    }

    private struct CaptureIntent {
        let captureID: UUID
        let captureGroupID: UUID
        let sessionID: String?
        let callRoomID: String?
        let requiresDurableRoomReceipt: Bool
        let startReceiptID: UUID?
        let ownerSnapshot: AuthManager.StableOwnerSnapshot
        let clockSamples: [LocalRecordingClockSample]
    }

    private var pendingCaptureIntent: CaptureIntent?
    private var activeCaptureIntent: CaptureIntent?
    private var captureOwnerAuthorityLost = false

    private var activeProjectSlug: String?
    private var activeEpisodeSlug: String?
    private var activeCallRoomId: String?
    private var activeParticipantId: String?
    private var activeRecordingConsentId: String?
    private var activeRecordingAssetId: String?
    private var activeCapturePurpose: String?

    private var segments: [RecordingSegment] = []
    private var currentSegmentStart: Date?

    private var localFallbackParticipantId: String {
        let deviceId = UIDevice.current.identifierForVendor?.uuidString ?? UIDevice.current.name
        return "device-\(deviceId)"
    }

    override init() {
        super.init()
        localRecordingRecoveryNote = recoverySummary()
        setupInterruptionHandling()
        setupRouteChangeHandling()
        setupAccountIdentityHandling()
        setupUploadObservers()
        setupRemoteCommands()
        refreshInputRoute()
    }

    /// Preallocates one immutable source identity and, when this is a Nest-backed
    /// session, commits its START boundary before any local audio bytes may begin.
    /// Callers must treat a thrown error as "nothing was recorded."
    func armNextCapture(
        captureID: UUID,
        captureGroupID: UUID? = nil,
        sessionID: String?,
        callRoomID: String?,
        requiresDurableRoomReceipt: Bool,
        expectedOwnerSnapshot: AuthManager.StableOwnerSnapshot,
        clockSamples: [LocalRecordingClockSample] = []
    ) throws {
        guard !captureState.isCaptureActive, captureState != .preparing,
              pendingCaptureIntent == nil else {
            throw CaptureError.captureAlreadyArmed
        }
        guard AuthManager.shared.matchesStableOwnerSnapshot(expectedOwnerSnapshot) else {
            throw CaptureError.captureOwnerChanged
        }

        let normalizedSessionID = normalized(sessionID)
        let normalizedCallRoomID = normalized(callRoomID)
        var startReceiptID: UUID?
        if requiresDurableRoomReceipt {
            guard let normalizedSessionID, let normalizedCallRoomID else {
                throw CaptureError.missingRoomReceiptContext
            }
            let receipt = try receiptStore.enqueueDurably(
                captureID: captureID,
                sessionID: normalizedSessionID,
                callRoomID: normalizedCallRoomID,
                action: .start,
                ownerAccountID: expectedOwnerSnapshot.ownerAccountID
            )
            startReceiptID = receipt.id
        }

        pendingCaptureIntent = CaptureIntent(
            captureID: captureID,
            captureGroupID: captureGroupID ?? captureID,
            sessionID: normalizedSessionID,
            callRoomID: normalizedCallRoomID,
            requiresDurableRoomReceipt: requiresDurableRoomReceipt,
            startReceiptID: startReceiptID,
            ownerSnapshot: expectedOwnerSnapshot,
            clockSamples: clockSamples
        )
        captureOwnerAuthorityLost = false
    }

    /// The account-generation that armed this take must remain current. This is
    /// intentionally stronger than comparing account IDs so A -> B -> A cannot
    /// revive an intent created before the switch.
    var captureOwnerIsCurrent: Bool {
        guard !captureOwnerAuthorityLost,
              let intent = activeCaptureIntent ?? pendingCaptureIntent else {
            return false
        }
        return AuthManager.shared.matchesStableOwnerSnapshot(intent.ownerSnapshot)
    }

    /// Cancels a permission/preflight-gated take before source bytes begin and
    /// durably closes any START boundary that was already armed.
    func abortArmedCaptureBeforeRecording(
        message: String = "The Quipsly account changed before recording began. Nothing was recorded."
    ) {
        guard activeLocalRecordingID == nil,
              pendingCaptureIntent != nil || captureState == .preparing else { return }
        startTask?.cancel()
        startTask = nil
        let receiptFailure = closeStartBoundaryAfterFailedArm()
        captureOwnerAuthorityLost = true
        failureMessage = message
        lastErrorMessage = combining(message, with: receiptFailure)
        stopDurationAndMeterTimer()
        deactivateAudioSession()
        transition(to: .failed)
        broadcastError(message: lastErrorMessage ?? message)
    }

    @discardableResult
    func prepareForRecording() async -> Bool {
        guard !captureState.isCaptureActive else {
            return captureState == .recording || captureState == .paused
        }

        transition(to: .preparing)
        failureMessage = nil
        lastErrorMessage = nil

        let permissionGranted = await resolveMicrophonePermission()
        guard !Task.isCancelled else {
            transition(to: .idle)
            return false
        }
        guard permissionGranted else {
            failCapture("Microphone permission denied. Enable microphone access in Settings to record.")
            return false
        }

        guard hasCaptureStorageHeadroom() else {
            failCapture(storageStartFailureMessage)
            return false
        }

        do {
            try configureAudioSession()
            refreshInputRoute()
            guard !audioSession.currentRoute.inputs.isEmpty else {
                failCapture("No microphone input is available. Connect or enable a microphone, then try again.")
                return false
            }
            transition(to: .idle)
            return true
        } catch {
            failCapture("Quipsly could not prepare the microphone: \(error.localizedDescription)")
            return false
        }
    }

    func handleCommand(_ command: RecorderCommand) {
        switch command.action {
        case .start:
            guard !captureState.isCaptureActive, captureState != .preparing else {
                broadcastError(message: "A recording is already active or being prepared.")
                return
            }
            applySessionContext(from: command)
            startRecording()
        case .stop:
            if captureState == .preparing, activeLocalRecordingID != nil {
                stopRecording()
            } else if captureState == .preparing {
                startTask?.cancel()
                startTask = nil
                if let receiptFailure = closeStartBoundaryAfterFailedArm() {
                    lastErrorMessage = receiptFailure
                    broadcastError(message: receiptFailure)
                }
                transition(to: .idle)
                deactivateAudioSession()
            } else {
                stopRecording()
            }
        case .pause:
            if captureState == .paused {
                // A user pause always wins over a pending automatic interruption resume.
                pausedByInterruption = false
            } else {
                pauseRecording(reason: .pause, causedByInterruption: false)
            }
        case .resume:
            resumeRecording()
        case .markBreak:
            markBreak()
        }
    }

    func resetToIdle() {
        guard !captureState.isCaptureActive, captureState != .preparing else { return }
        failureMessage = nil
        lastErrorMessage = nil
        transition(to: .idle)
        deactivateAudioSession()
    }

    /// Requests stop and waits for AVAudioRecorder's delegate-confirmed file close.
    /// Callers must not describe a take as saved while the controller is still finalizing.
    func stopAndFinalize(timeout: TimeInterval = 10) async -> Bool {
        handleCommand(.stop)
        let deadline = Date().addingTimeInterval(timeout)

        while Date() < deadline {
            switch captureState {
            case .saved:
                return true
            case .failed, .idle:
                return false
            case .preparing, .recording, .paused, .finalizing:
                try? await Task.sleep(nanoseconds: 50_000_000)
            }
        }

        lastErrorMessage = "Quipsly is still waiting for iOS to finish the local audio file. Keep the app open and review the take in Library."
        return false
    }

    /// Waits for the real media callback, not merely recorder construction.
    /// The LiveKit-backed path remains preparing until its first local-input
    /// PCM buffer arrives.
    func waitUntilRecordingOrTerminal(timeout: TimeInterval = 4) async -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            switch captureState {
            case .recording:
                return true
            case .failed, .idle, .saved:
                return false
            case .preparing, .paused, .finalizing:
                try? await Task.sleep(nanoseconds: 25_000_000)
            }
        }
        if captureState == .preparing, activeLocalRecordingID != nil {
            finishCaptureFailure(
                "The provider microphone pipeline did not deliver local PCM in time. Quipsly closed and preserved the armed source instead of claiming a recording."
            )
        }
        return false
    }

    private func setupUploadObservers() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleUploadFinished),
            name: Notification.Name("BackgroundUploadFinished"),
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleUploadProgress),
            name: Notification.Name("BackgroundUploadProgress"),
            object: nil
        )
    }

    @objc private func handleUploadFinished(notification: Notification) {
        guard let userInfo = notification.userInfo,
              let success = userInfo["success"] as? Bool,
              let ownerAccountID = userInfo["ownerAccountID"] as? String,
              ownerAccountID == AuthManager.currentStoredOwnerID() else { return }

        let recordingID = (userInfo["localRecordingID"] as? String).flatMap(UUID.init(uuidString:))
            ?? pendingUploadRecordingID
            ?? localRecordingLibrary.recordings.first(where: { [.queued, .uploading].contains($0.status) })?.id

        if success {
            let sourceId = userInfo["sourceId"] as? String
            if let recordingID {
                do {
                    try localRecordingLibrary.markUploadFinished(
                        recordingID,
                        sourceId: sourceId,
                        mediaAssetId: userInfo["mediaAssetId"] as? String,
                        transcriptJobId: userInfo["transcriptJobId"] as? String,
                        serverVerificationStatus: UploadManager.shared.lastServerVerificationStatus,
                        sourceSHA256: userInfo["sourceSHA256"] as? String,
                        verifiedCloudSHA256: userInfo["verifiedCloudSHA256"] as? String,
                        verifiedCloudSizeBytes: (userInfo["verifiedCloudSizeBytes"] as? NSNumber)?.int64Value,
                        verifiedCloudGeneration: userInfo["verifiedCloudGeneration"] as? String,
                        verifiedCloudAt: userInfo["verifiedCloudAt"] as? Date,
                        canonicalObjectPath: userInfo["canonicalObjectPath"] as? String,
                        processingDisposition: userInfo["processingDisposition"] as? String,
                        processingHoldReason: userInfo["processingHoldReason"] as? String,
                        transcriptDisposition: userInfo["transcriptDisposition"] as? String,
                        detail: UploadManager.shared.lastServerVerificationDetail
                    )
                } catch {
                    print("Could not update local upload receipt: \(error.localizedDescription)")
                }
            }

            let detail = EventDetail(mediaAssetId: sourceId)
            onStateChange?(RecorderEvent(type: .uploadComplete, detail: detail))
        } else {
            let error = userInfo["error"] as? String ?? "Upload failed"
            if let recordingID {
                do {
                    try localRecordingLibrary.markUploadHeld(recordingID, message: error)
                } catch {
                    print("Could not update held upload in local ledger: \(error.localizedDescription)")
                }
            }
            broadcastError(message: error)
        }

        pendingUploadRecordingID = nil
        localRecordingRecoveryNote = recoverySummary()
    }

    @objc private func handleUploadProgress(notification: Notification) {
        guard let userInfo = notification.userInfo,
              let progress = userInfo["progress"] as? Double,
              let ownerAccountID = userInfo["ownerAccountID"] as? String,
              ownerAccountID == AuthManager.currentStoredOwnerID() else { return }

        let recordingID = (userInfo["localRecordingID"] as? String).flatMap(UUID.init(uuidString:))
            ?? pendingUploadRecordingID
            ?? localRecordingLibrary.recordings.first(where: { [.queued, .uploading].contains($0.status) })?.id
        if let recordingID {
            do {
                try localRecordingLibrary.markUploading(recordingID, progress: progress)
                pendingUploadRecordingID = recordingID
            } catch {
                print("Could not persist local upload progress: \(error.localizedDescription)")
            }
        }

        let detail = EventDetail(progress: progress)
        onStateChange?(RecorderEvent(type: .uploadProgress, detail: detail))
    }

    private func setupInterruptionHandling() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleInterruption),
            name: AVAudioSession.interruptionNotification,
            object: audioSession
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleMediaServicesReset),
            name: AVAudioSession.mediaServicesWereResetNotification,
            object: audioSession
        )
    }

    private func setupRouteChangeHandling() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleRouteChange),
            name: AVAudioSession.routeChangeNotification,
            object: audioSession
        )
    }

    private func setupAccountIdentityHandling() {
        accountObserver = NotificationCenter.default.addObserver(
            forName: .quipslyCaptureAccountIdentityDidChange,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated { [weak self] in
                self?.handleAccountIdentityChange()
            }
        }
    }

    private func handleAccountIdentityChange() {
        guard let intent = activeCaptureIntent ?? pendingCaptureIntent,
              !AuthManager.shared.matchesStableOwnerSnapshot(intent.ownerSnapshot) else { return }

        captureOwnerAuthorityLost = true
        let message = "The Quipsly account changed. Recording cannot continue under a different owner."
        if activeLocalRecordingID == nil {
            abortArmedCaptureBeforeRecording(message: "\(message) Nothing was recorded.")
            return
        }
        if captureState == .recording {
            pauseRecording(reason: .pause, causedByInterruption: false)
        }
        lastErrorMessage = "\(message) The local source is paused and preserved; stop and save this take before starting another."
        broadcastError(message: lastErrorMessage ?? message)
    }

    @objc private func handleInterruption(notification: Notification) {
        guard let userInfo = notification.userInfo,
              let typeValue = userInfo[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: typeValue) else {
            return
        }

        switch type {
        case .began:
            if captureState == .recording {
                pauseRecording(reason: .interruption, causedByInterruption: true)
            }
        case .ended:
            guard pausedByInterruption, captureState == .paused else { return }
            let optionValue = userInfo[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
            let options = AVAudioSession.InterruptionOptions(rawValue: optionValue)
            if options.contains(.shouldResume) {
                // A phone call, alarm, or Siri ending must not silently restart capture.
                // iOS's shouldResume flag means the route is available; the person still
                // makes the recording decision from Quipsly's visible Resume control.
                pausedByInterruption = false
                refreshInputRoute()
                lastErrorMessage = "The interruption ended. Tap Resume when everyone is ready to continue recording."
                broadcastState()
                broadcastError(message: lastErrorMessage ?? "Recording remains paused.")
            } else {
                pausedByInterruption = false
                lastErrorMessage = "Recording remains paused because the microphone route is not ready to resume."
                broadcastState()
                broadcastError(message: lastErrorMessage ?? "Recording remains paused.")
            }
        @unknown default:
            break
        }
    }

    @objc private func handleRouteChange(notification: Notification) {
        refreshInputRoute()

        guard captureState == .recording,
              let reasonValue = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
              let reason = AVAudioSession.RouteChangeReason(rawValue: reasonValue),
              reason == .oldDeviceUnavailable else {
            return
        }

        pauseRecording(reason: .interruption, causedByInterruption: true)
        broadcastError(message: "The active microphone changed or disconnected. Recording is paused so you can verify the new route before explicitly resuming.")
    }

    @objc private func handleMediaServicesReset() {
        refreshInputRoute()
        guard captureState == .recording || captureState == .paused else { return }
        finishCaptureFailure("iOS reset its audio services. The local source was preserved; start a new take after reviewing it.")
    }

    private func applySessionContext(from command: RecorderCommand) {
        activeProjectSlug = normalized(command.projectSlug)
        activeEpisodeSlug = normalized(command.episodeSlug)
        activeCallRoomId = normalized(command.callRoomId)
        activeParticipantId = normalized(command.participantId)
        activeRecordingConsentId = normalized(command.recordingConsentId)
        activeRecordingAssetId = normalized(command.recordingAssetId)
        activeCapturePurpose = normalized(command.capturePurpose)
        recordingConsentGranted = command.recordingConsentGranted == true

        activeCallRoomLabel = activeEpisodeSlug
            ?? activeProjectSlug
            ?? activeCapturePurpose
            ?? activeCallRoomId
            ?? "Local recording"
    }

    private func startRecording() {
        guard recordingConsentGranted else {
            let baseMessage = "Recording needs explicit consent before capture starts."
            failCapture(combining(baseMessage, with: closeStartBoundaryAfterFailedArm()))
            return
        }

        do {
            try ensurePendingCaptureIntent()
        } catch {
            failCapture(combining(error.localizedDescription, with: closeStartBoundaryAfterFailedArm()))
            return
        }

        if AVAudioApplication.shared.recordPermission == .granted {
            microphonePreflightState = .granted
            guard hasCaptureStorageHeadroom() else {
                failCapture(combining(storageStartFailureMessage, with: closeStartBoundaryAfterFailedArm()))
                return
            }
            transition(to: .preparing)
            failureMessage = nil
            lastErrorMessage = nil
            do {
                try activateAudioSessionAndBeginRecording()
            } catch {
                handleStartFailure(error)
            }
            return
        }

        transition(to: .preparing)
        failureMessage = nil
        lastErrorMessage = nil
        startTask?.cancel()
        startTask = Task { [weak self] in
            guard let self else { return }
            await self.beginRecordingAfterPreflight()
            self.startTask = nil
        }
    }

    private func beginRecordingAfterPreflight() async {
        guard !Task.isCancelled else {
            if let receiptFailure = closeStartBoundaryAfterFailedArm() {
                lastErrorMessage = receiptFailure
                broadcastError(message: receiptFailure)
            }
            transition(to: .idle)
            return
        }
        transition(to: .preparing)
        failureMessage = nil
        lastErrorMessage = nil

        let permissionGranted = await resolveMicrophonePermission()
        guard !Task.isCancelled else {
            if let receiptFailure = closeStartBoundaryAfterFailedArm() {
                lastErrorMessage = receiptFailure
                broadcastError(message: receiptFailure)
            }
            transition(to: .idle)
            return
        }
        guard pendingCaptureOwnerIsCurrent else {
            abortArmedCaptureBeforeRecording()
            return
        }
        guard permissionGranted else {
            let baseMessage = "Microphone permission denied. Enable microphone access in Settings to record."
            failCapture(combining(baseMessage, with: closeStartBoundaryAfterFailedArm()))
            return
        }
        guard hasCaptureStorageHeadroom() else {
            failCapture(combining(storageStartFailureMessage, with: closeStartBoundaryAfterFailedArm()))
            return
        }

        do {
            try activateAudioSessionAndBeginRecording()
        } catch {
            handleStartFailure(error)
        }
    }

    private func handleStartFailure(_ error: Error) {
        let message = "Could not start recording: \(error.localizedDescription)"
        if activeLocalRecordingID != nil {
            // A source ledger exists, so use the terminal media cleanup path.
            // This is especially important for the provider-backed recorder:
            // an SDK start failure must never leave its renderer or writer
            // attached to LiveKit.
            finishCaptureFailure(message)
            return
        }
        failCapture(combining(message, with: closeStartBoundaryAfterFailedArm()))
    }

    private func ensurePendingCaptureIntent() throws {
        if let pendingCaptureIntent {
            guard AuthManager.shared.matchesStableOwnerSnapshot(pendingCaptureIntent.ownerSnapshot) else {
                throw CaptureError.captureOwnerChanged
            }
            return
        }
        guard activeCallRoomId == nil else {
            throw CaptureError.startReceiptNotDurable
        }
        guard let ownerSnapshot = AuthManager.shared.stableOwnerSnapshot() else {
            throw CaptureError.captureOwnerChanged
        }
        let captureID = UUID()
        pendingCaptureIntent = CaptureIntent(
            captureID: captureID,
            captureGroupID: captureID,
            sessionID: nil,
            callRoomID: nil,
            requiresDurableRoomReceipt: false,
            startReceiptID: nil,
            ownerSnapshot: ownerSnapshot,
            clockSamples: []
        )
        captureOwnerAuthorityLost = false
    }

    private var pendingCaptureOwnerIsCurrent: Bool {
        guard let pendingCaptureIntent else { return false }
        return !captureOwnerAuthorityLost
            && AuthManager.shared.matchesStableOwnerSnapshot(pendingCaptureIntent.ownerSnapshot)
    }

    @discardableResult
    private func closeStartBoundaryAfterFailedArm(at date: Date = Date()) -> String? {
        let intent = activeCaptureIntent ?? pendingCaptureIntent
        guard let intent,
              intent.requiresDurableRoomReceipt,
              let sessionID = intent.sessionID,
              let callRoomID = intent.callRoomID else {
            pendingCaptureIntent = nil
            activeCaptureIntent = nil
            return nil
        }
        var receiptFailure: String?
        do {
            try receiptStore.enqueueDurably(
                captureID: intent.captureID,
                sessionID: sessionID,
                callRoomID: callRoomID,
                action: .stop,
                occurredAt: date,
                ownerAccountID: intent.ownerSnapshot.ownerAccountID
            )
        } catch {
            receiptFailure = "Quipsly preserved the START journal, but could not append its matching STOP boundary: \(error.localizedDescription) Relaunch before recording again so the protected outbox can reconcile."
        }
        pendingCaptureIntent = nil
        activeCaptureIntent = nil
        return receiptFailure
    }

    private func resolveMicrophonePermission() async -> Bool {
        switch AVAudioApplication.shared.recordPermission {
        case .granted:
            microphonePreflightState = .granted
            return true
        case .denied:
            microphonePreflightState = .denied
            return false
        case .undetermined:
            let allowed = await withCheckedContinuation { continuation in
                AVAudioApplication.requestRecordPermission { granted in
                    continuation.resume(returning: granted)
                }
            }
            microphonePreflightState = allowed ? .granted : .denied
            return allowed
        @unknown default:
            microphonePreflightState = .denied
            return false
        }
    }

    private func hasCaptureStorageHeadroom() -> Bool {
        guard let available = availableCapacityBytes() else {
            storageCapacityProbeFailed = true
            availableCaptureCapacityBytes = nil
            return false
        }
        storageCapacityProbeFailed = false
        availableCaptureCapacityBytes = available
        return available >= projectedSafeCapacityFloorBytes
    }

    private var projectedSafeCapacityFloorBytes: Int64 {
        hardStorageReserveBytes
            + projectedFinalizeOverheadBytes
            + (estimatedEncodedBytesPerSecond * storageProjectionWindowSeconds)
    }

    private var storageStartFailureMessage: String {
        if storageCapacityProbeFailed {
            return "Quipsly could not verify available storage, so recording stayed off to protect the local original. Unlock the iPhone or make storage available, then try again."
        }
        let required = ByteCountFormatter.string(
            fromByteCount: projectedSafeCapacityFloorBytes,
            countStyle: .file
        )
        return "Quipsly needs at least \(required) free to preserve its hard storage reserve and safely finalize a local recording. Free storage, then try again."
    }

    private func availableCapacityBytes() -> Int64? {
        do {
            let values = try localRecordingLibrary.recordingsDirectoryURL.resourceValues(
                forKeys: [.volumeAvailableCapacityForImportantUsageKey, .volumeAvailableCapacityKey]
            )
            return values.volumeAvailableCapacityForImportantUsage
                ?? values.volumeAvailableCapacity.map(Int64.init)
        } catch {
            return nil
        }
    }

    private func configureAudioSession() throws {
        try audioSessionCoordinator.prepareLocalCaptureRoute()
    }

    private func activateAudioSessionAndBeginRecording() throws {
        try audioSessionCoordinator.activateLocalCapture()
        refreshInputRoute()
        try beginActualRecording()
    }

    private func beginActualRecording() throws {
        let startedAt = Date()
        if activeCallRoomId != nil, pendingCaptureIntent == nil {
            throw CaptureError.startReceiptNotDurable
        }
        guard let captureIntent = pendingCaptureIntent,
              AuthManager.shared.matchesStableOwnerSnapshot(captureIntent.ownerSnapshot),
              !captureOwnerAuthorityLost else {
            throw CaptureError.captureOwnerChanged
        }
        if captureIntent.requiresDurableRoomReceipt, captureIntent.startReceiptID == nil {
            throw CaptureError.startReceiptNotDurable
        }
        if captureIntent.requiresDurableRoomReceipt,
           captureIntent.callRoomID != activeCallRoomId {
            throw CaptureError.armedRoomMismatch
        }
        let audioFilename = try localRecordingLibrary.makeUniqueRecordingURL(startedAt: startedAt)
        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 48_000.0,
            AVNumberOfChannelsKey: 1,
            AVEncoderBitRateKey: 192_000,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
        ]

        var directRecorder: AVAudioRecorder?
        #if canImport(LiveKit)
        var providerRecorder: ProviderAudioMasterRecorder?
        if audioSessionCoordinator.isProviderRoomActive {
            guard audioSessionCoordinator.providerInputObservationAvailable else {
                throw CaptureError.providerInputUnavailable
            }
            providerRecorder = try ProviderAudioMasterRecorder(
                fileURL: audioFilename,
                audioSettings: settings
            )
        } else {
            let recorder = try AVAudioRecorder(url: audioFilename, settings: settings)
            recorder.delegate = self
            recorder.isMeteringEnabled = true
            guard recorder.prepareToRecord() else {
                throw CaptureError.couldNotPrepareRecorder
            }
            directRecorder = recorder
        }
        #else
        let recorder = try AVAudioRecorder(url: audioFilename, settings: settings)
        recorder.delegate = self
        recorder.isMeteringEnabled = true
        guard recorder.prepareToRecord() else {
            throw CaptureError.couldNotPrepareRecorder
        }
        directRecorder = recorder
        #endif
        try localRecordingLibrary.setInProgressFileProtection(at: audioFilename)
        #if canImport(LiveKit)
        let usesProviderPCM = providerRecorder != nil
        #else
        let usesProviderPCM = false
        #endif
        let runtimeEvidence = CaptureRuntimeEvidence.current(
            audioSession: audioSession
        )

        localFallbackSessionId = "local-recording-\(UUID().uuidString.lowercased())"
        let context = LocalRecordingSessionContext(
            projectSlug: activeProjectSlug,
            episodeSlug: activeEpisodeSlug,
            callRoomId: activeCallRoomId,
            participantId: activeParticipantId ?? localFallbackParticipantId,
            recordingConsentId: activeRecordingConsentId,
            recordingConsentGranted: recordingConsentGranted,
            recordingAssetId: activeRecordingAssetId,
            capturePurpose: activeCapturePurpose
        )
        let ledgerEntry = try localRecordingLibrary.beginRecording(
            id: captureIntent.captureID,
            at: audioFilename,
            startedAt: startedAt,
            context: context,
            expectedOwnerAccountID: captureIntent.ownerSnapshot.ownerAccountID,
            displayTitle: activeCallRoomLabel,
            mediaKind: .audio,
            captureGroupId: captureIntent.captureGroupID,
            roomStartReceiptId: captureIntent.startReceiptID,
            sourceProfile: LocalRecordingSourceProfile(
                container: "m4a",
                codec: "aac-lc",
                includesAudio: true,
                audioSampleRate: 48_000,
                audioChannelCount: 1,
                audioCapturePipeline: usesProviderPCM
                    ? "livekit-local-input-pcm"
                    : "av-audio-recorder-direct-input",
                pauseTimelinePolicy: usesProviderPCM
                    ? "silence-preserves-wall-clock"
                    : "recorder-native-pause",
                captureAppVersion: runtimeEvidence.appVersion,
                captureAppBuild: runtimeEvidence.appBuild,
                deviceModelIdentifier: runtimeEvidence.deviceModelIdentifier,
                deviceSystemName: runtimeEvidence.systemName,
                deviceSystemVersion: runtimeEvidence.systemVersion,
                audioRouteName: runtimeEvidence.audioRouteName,
                audioRoutePortType: runtimeEvidence.audioRoutePortType,
                monotonicStartedNanoseconds: DispatchTime.now().uptimeNanoseconds,
                clockSamples: captureIntent.clockSamples.isEmpty
                    ? nil
                    : captureIntent.clockSamples
            )
        )

        currentRecordingURL = audioFilename
        activeLocalRecordingID = ledgerEntry.id
        activeCaptureIntent = captureIntent
        pendingCaptureIntent = nil
        overallStartTimestamp = startedAt
        startTime = startedAt
        accumulatedDuration = 0
        currentDuration = 0
        segments = []
        userMarkOffsets = []
        currentSegmentOrder = 1
        pendingFinalizationStoppedAt = nil
        pendingFinalizationDuration = 0
        pendingFinalizationMessage = nil
        automaticStopReason = nil
        lastStorageCheckAt = .distantPast
        pausedByInterruption = false
        pendingProviderSegmentStart = nil

        guard AuthManager.shared.matchesStableOwnerSnapshot(captureIntent.ownerSnapshot),
              !captureOwnerAuthorityLost else {
            throw CaptureError.captureOwnerChanged
        }

        #if canImport(LiveKit)
        if let providerRecorder {
            providerAudioMaster = providerRecorder
            pendingProviderSegmentStart = startedAt
            providerRecorder.onFirstPCMBuffer = { [weak self] in
                Task { @MainActor [weak self] in
                    self?.confirmProviderAudioInput(
                        recordingID: ledgerEntry.id
                    )
                }
            }
            try providerRecorder.start(at: startedAt)
            startProviderAudioWatchdog(recordingID: ledgerEntry.id)
            updateNowPlayingInfo()
            return
        }
        #endif

        guard let directRecorder else {
            throw CaptureError.couldNotPrepareRecorder
        }
        guard directRecorder.record() else {
            throw CaptureError.couldNotBeginRecorder
        }
        audioRecorder = directRecorder
        do {
            try localRecordingLibrary.markRecording(ledgerEntry.id, durationSeconds: 0)
        } catch {
            directRecorder.stop()
            audioRecorder = nil
            throw error
        }
        startNewSegment(at: startedAt)
        startDurationAndMeterTimer()
        transition(to: .recording)
        updateNowPlayingInfo()
    }

    #if canImport(LiveKit)
    private func confirmProviderAudioInput(recordingID: UUID) {
        guard activeLocalRecordingID == recordingID,
              captureState == .preparing,
              providerAudioMaster?.isReceivingPCM == true,
              captureOwnerIsCurrent else {
            return
        }

        providerAudioStartWatchdogTask?.cancel()
        providerAudioStartWatchdogTask = nil
        let segmentStartedAt = pendingProviderSegmentStart ?? Date()
        pendingProviderSegmentStart = nil
        startTime = segmentStartedAt

        do {
            try localRecordingLibrary.markRecording(
                recordingID,
                durationSeconds: sourceTimelineDuration()
            )
        } catch {
            finishCaptureFailure(
                "The live-room microphone reached Quipsly, but its local journal could not enter recording state: \(error.localizedDescription)"
            )
            return
        }

        startNewSegment(at: segmentStartedAt)
        startDurationAndMeterTimer()
        transition(to: .recording)
        updateNowPlayingInfo()
    }

    private func startProviderAudioWatchdog(recordingID: UUID) {
        providerAudioStartWatchdogTask?.cancel()
        providerAudioStartWatchdogTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 3_000_000_000)
            guard !Task.isCancelled, let self,
                  self.activeLocalRecordingID == recordingID,
                  self.captureState == .preparing else {
                return
            }
            self.finishCaptureFailure(
                "The live-room microphone pipeline opened but delivered no local PCM. Quipsly closed and preserved the source instead of claiming a recording."
            )
        }
    }
    #endif

    private func stopRecording(finalizationMessage: String? = nil) {
        guard captureState == .recording
                || captureState == .paused
                || (captureState == .preparing && activeLocalRecordingID != nil) else {
            return
        }

        #if canImport(LiveKit)
        if captureState == .preparing,
           providerAudioMaster?.isReceivingPCM != true,
           segments.isEmpty {
            finishCaptureFailure(
                "The live-room microphone had not delivered a confirmed PCM buffer. Quipsly preserved the armed evidence but will not label silence as a saved recording."
            )
            return
        }
        #endif

        let stoppedAt = Date()
        if captureState == .recording {
            endCurrentSegment(reason: .userStop, at: stoppedAt)
            accumulateActiveDuration(until: stoppedAt)
        }

        startTime = nil
        currentDuration = sourceTimelineDuration(at: stoppedAt)
        pendingFinalizationStoppedAt = stoppedAt
        pendingFinalizationDuration = currentDuration
        pendingFinalizationMessage = normalized(finalizationMessage)
        pausedByInterruption = false
        pendingProviderSegmentStart = nil
        providerAudioStartWatchdogTask?.cancel()
        providerAudioStartWatchdogTask = nil
        stopDurationAndMeterTimer()

        if let activeLocalRecordingID {
            do {
                try localRecordingLibrary.markFinalizing(
                    activeLocalRecordingID,
                    durationSeconds: pendingFinalizationDuration
                )
            } catch {
                print("Could not mark recording as finalizing: \(error.localizedDescription)")
            }
        }

        transition(to: .finalizing)
        updateNowPlayingInfo()

        #if canImport(LiveKit)
        if let providerAudioMaster {
            providerAudioMaster.stop(at: stoppedAt)
            self.providerAudioMaster = nil
            finalizeSuccessfulRecording()
            return
        }
        #endif

        guard let audioRecorder else {
            finishCaptureFailure("The recorder became unavailable while Quipsly was finalizing the file.")
            return
        }
        audioRecorder.stop()
    }

    private func pauseRecording(reason: RecordingStopReason, causedByInterruption: Bool) {
        guard captureState == .recording else { return }

        let pausedAt = Date()
        #if canImport(LiveKit)
        if let providerAudioMaster {
            providerAudioMaster.pause()
        } else {
            audioRecorder?.pause()
        }
        #else
        audioRecorder?.pause()
        #endif
        endCurrentSegment(reason: reason, at: pausedAt)
        accumulateActiveDuration(until: pausedAt)
        startTime = nil
        currentDuration = sourceTimelineDuration(at: pausedAt)
        pausedByInterruption = causedByInterruption
        #if canImport(LiveKit)
        if providerAudioMaster == nil {
            stopDurationAndMeterTimer()
        } else {
            // The provider-backed master writes silence while detached so its
            // clock remains aligned with the room and camera. Keep the storage
            // watchdog active while making the input meter visibly quiet.
            inputLevelDB = -160
            peakInputLevelDB = -160
            normalizedInputLevel = 0
        }
        #else
        stopDurationAndMeterTimer()
        #endif

        if let activeLocalRecordingID {
            do {
                try localRecordingLibrary.markPaused(
                    activeLocalRecordingID,
                    durationSeconds: accumulatedDuration,
                    interruption: causedByInterruption
                )
            } catch {
                print("Could not persist paused recording state: \(error.localizedDescription)")
            }
        }

        transition(to: .paused)
        updateNowPlayingInfo()
    }

    private func resumeRecording() {
        guard captureState == .paused else { return }

        guard captureOwnerIsCurrent else {
            captureOwnerAuthorityLost = true
            lastErrorMessage = "The take belongs to a different account generation. Stop and save it; Quipsly will not resume capture under the current account."
            broadcastError(message: lastErrorMessage ?? "Recording remains paused.")
            return
        }

        guard let available = availableCapacityBytes() else {
            stopForStorageSafety(availableBytes: nil)
            return
        }
        availableCaptureCapacityBytes = available
        guard available > projectedSafetyFloorDuringCapture() else {
            stopForStorageSafety(availableBytes: available)
            return
        }

        do {
            try audioSessionCoordinator.activateLocalCapture()
            let resumedAt = Date()
            pausedByInterruption = false
            lastErrorMessage = nil
            refreshInputRoute()

            #if canImport(LiveKit)
            if let providerAudioMaster {
                guard let activeLocalRecordingID else {
                    throw CaptureError.missingLocalRecordingIdentity
                }
                pendingProviderSegmentStart = resumedAt
                providerAudioMaster.resume()
                transition(to: .preparing)
                startProviderAudioWatchdog(recordingID: activeLocalRecordingID)
                updateNowPlayingInfo()
                return
            }
            #endif

            guard let audioRecorder, audioRecorder.record() else {
                throw CaptureError.couldNotResumeRecorder
            }
            startTime = resumedAt
            startNewSegment(at: resumedAt)

            if let activeLocalRecordingID {
                try localRecordingLibrary.markRecording(
                    activeLocalRecordingID,
                    durationSeconds: accumulatedDuration
                )
            }

            startDurationAndMeterTimer()
            transition(to: .recording)
            updateNowPlayingInfo()
        } catch {
            audioRecorder?.pause()
            #if canImport(LiveKit)
            providerAudioMaster?.pause()
            #endif
            pausedByInterruption = false
            lastErrorMessage = "Recording is still paused: \(error.localizedDescription)"
            transition(to: .paused)
            broadcastError(message: lastErrorMessage ?? "Recording remains paused.")
        }
    }

    private func markBreak() {
        guard captureState == .recording else { return }
        let breakAt = Date()
        let offset = sourceTimelineDuration(at: breakAt)
        endCurrentSegment(reason: .userMark, at: breakAt)
        userMarkOffsets.append(max(0, offset))
        startNewSegment(at: breakAt)
    }

    private func startNewSegment(at date: Date = Date()) {
        currentSegmentStart = date
    }

    private func endCurrentSegment(reason: RecordingStopReason, at stoppedAt: Date) {
        guard let startedAt = currentSegmentStart else { return }

        let segment = RecordingSegment(
            id: "seg-\(UUID().uuidString.lowercased())",
            sessionId: activeCallRoomId
                ?? activeEpisodeSlug
                ?? localFallbackSessionId
                ?? "local-recording-\(UUID().uuidString.lowercased())",
            participantId: activeParticipantId ?? localFallbackParticipantId,
            deviceKind: UIDevice.current.name,
            status: "local-ready",
            startedAt: ISO8601DateFormatter().string(from: startedAt),
            stoppedAt: ISO8601DateFormatter().string(from: stoppedAt),
            durationSeconds: max(0, stoppedAt.timeIntervalSince(startedAt)),
            stopReason: reason
        )
        segments.append(segment)
        currentSegmentOrder += 1
        currentSegmentStart = nil
    }

    private func accumulateActiveDuration(until date: Date) {
        guard let startTime else { return }
        accumulatedDuration += max(0, date.timeIntervalSince(startTime))
    }

    private func sourceTimelineDuration(at date: Date = Date()) -> TimeInterval {
        #if canImport(LiveKit)
        if let providerAudioMaster {
            return providerAudioMaster.currentTime
        }
        #endif
        if let audioRecorder {
            return max(accumulatedDuration, audioRecorder.currentTime)
        }
        if let overallStartTimestamp {
            return max(accumulatedDuration, date.timeIntervalSince(overallStartTimestamp))
        }
        return max(0, accumulatedDuration)
    }

    private func startDurationAndMeterTimer() {
        displayDurationTimer?.invalidate()
        displayDurationTimer = Timer.scheduledTimer(
            timeInterval: 0.1,
            target: self,
            selector: #selector(handleDurationAndMeterTimer),
            userInfo: nil,
            repeats: true
        )
        displayDurationTimer?.tolerance = 0.02
    }

    @objc private func handleDurationAndMeterTimer() {
        #if canImport(LiveKit)
        if captureState == .paused, providerAudioMaster != nil {
            currentDuration = sourceTimelineDuration()
            updateMeters()
            checkStorageHeadroomDuringCapture()
            return
        }
        #endif
        guard captureState == .recording else { return }
        currentDuration = sourceTimelineDuration()
        updateMeters()
        checkStorageHeadroomDuringCapture()
    }

    private func checkStorageHeadroomDuringCapture(at date: Date = Date()) {
        guard date.timeIntervalSince(lastStorageCheckAt) >= storageCheckInterval else { return }
        lastStorageCheckAt = date
        guard let available = availableCapacityBytes() else {
            stopForStorageSafety(availableBytes: nil)
            return
        }
        availableCaptureCapacityBytes = available

        // Keep enough room to close the current container plus a short projected
        // capture window. The current source size contributes a bounded mux/index
        // allowance so a long take gets more finalization headroom without making
        // the reserve unbounded.
        let required = projectedSafetyFloorDuringCapture()
        guard available <= required else { return }

        stopForStorageSafety(availableBytes: available)
    }

    private func projectedSafetyFloorDuringCapture() -> Int64 {
        let currentFileBytes = currentRecordingURL.map(fileByteCount) ?? 0
        let projectedContainerOverhead = min(max(currentFileBytes / 100, 1 * 1024 * 1024), 32 * 1024 * 1024)
        return hardStorageReserveBytes
            + projectedFinalizeOverheadBytes
            + projectedContainerOverhead
            + (estimatedEncodedBytesPerSecond * storageProjectionWindowSeconds)
    }

    private func stopForStorageSafety(availableBytes: Int64?) {
        guard captureState == .recording || captureState == .paused else { return }
        let message: String
        if let availableBytes {
            let availableLabel = ByteCountFormatter.string(fromByteCount: availableBytes, countStyle: .file)
            message = "Quipsly stopped automatically with \(availableLabel) available so iOS could finalize the local original before storage reached the hard reserve. The take remains on this iPhone."
        } else {
            message = "Quipsly stopped automatically because iOS could no longer verify available storage. The app finalized early rather than risk the local original."
        }
        automaticStopReason = message
        lastErrorMessage = message
        broadcastError(message: message)
        stopRecording(finalizationMessage: message)
    }

    private func stopDurationAndMeterTimer() {
        displayDurationTimer?.invalidate()
        displayDurationTimer = nil
        inputLevelDB = -160
        peakInputLevelDB = -160
        normalizedInputLevel = 0
    }

    private func updateMeters() {
        #if canImport(LiveKit)
        if let providerAudioMaster {
            guard captureState == .recording else {
                inputLevelDB = -160
                peakInputLevelDB = -160
                normalizedInputLevel = 0
                return
            }
            let snapshot = providerAudioMaster.meterSnapshot
            inputLevelDB = snapshot.averagePowerDB
            peakInputLevelDB = snapshot.peakPowerDB
            let floorDB: Float = -60
            normalizedInputLevel = Double(
                min(max((snapshot.averagePowerDB - floorDB) / -floorDB, 0), 1)
            )
            if let receivedPCMAt = snapshot.receivedPCMAt,
               Date().timeIntervalSince(receivedPCMAt) > 1.5 {
                pauseRecording(
                    reason: .interruption,
                    causedByInterruption: true
                )
                lastErrorMessage = "The live-room microphone stopped delivering local PCM. Recording is paused and its timeline evidence is preserved; reconnect or stop the take."
                broadcastError(message: lastErrorMessage ?? "Recording remains paused.")
            }
            return
        }
        #endif
        guard let audioRecorder, audioRecorder.isRecording else {
            inputLevelDB = -160
            peakInputLevelDB = -160
            normalizedInputLevel = 0
            return
        }

        audioRecorder.updateMeters()
        let configuredChannels = audioRecorder.settings[AVNumberOfChannelsKey] as? Int ?? 1
        let channelCount = max(1, configuredChannels)
        let average = (0..<channelCount)
            .map { audioRecorder.averagePower(forChannel: $0) }
            .max() ?? -160
        let peak = (0..<channelCount)
            .map { audioRecorder.peakPower(forChannel: $0) }
            .max() ?? -160

        inputLevelDB = average
        peakInputLevelDB = peak
        let floorDB: Float = -60
        normalizedInputLevel = Double(min(max((average - floorDB) / -floorDB, 0), 1))
    }

    private func refreshInputRoute() {
        guard let input = audioSession.currentRoute.inputs.first ?? audioSession.availableInputs?.first else {
            inputRouteName = "No microphone selected"
            inputRoutePortType = nil
            return
        }

        inputRoutePortType = input.portType.rawValue
        let systemName = input.portName.trimmingCharacters(in: .whitespacesAndNewlines)
        switch input.portType {
        case .builtInMic:
            inputRouteName = "iPhone microphone"
        case .headsetMic:
            inputRouteName = systemName == input.portType.rawValue ? "Headset microphone" : systemName
        case .bluetoothHFP, .bluetoothLE:
            inputRouteName = systemName == input.portType.rawValue ? "Bluetooth microphone" : systemName
        case .usbAudio:
            inputRouteName = systemName == input.portType.rawValue ? "USB microphone" : systemName
        case .carAudio:
            inputRouteName = systemName == input.portType.rawValue ? "Car microphone" : systemName
        default:
            inputRouteName = systemName.isEmpty || systemName == input.portType.rawValue
                ? "External microphone"
                : systemName
        }
    }

    private func transition(to newState: AudioCaptureState) {
        captureState = newState
        isRecording = newState.isCaptureActive

        let commandCenter = MPRemoteCommandCenter.shared()
        commandCenter.pauseCommand.isEnabled = newState == .recording
        // Resume stays inside Quipsly so consent revocation, route changes,
        // and interruption safety can be revalidated before capture restarts.
        commandCenter.playCommand.isEnabled = false
        broadcastState()
    }

    private func bridgeState(for state: AudioCaptureState) -> RecorderState {
        switch state {
        case .recording:
            return .recording
        case .paused:
            return .paused
        case .idle, .preparing, .finalizing, .saved, .failed:
            return .stopped
        }
    }

    private func broadcastState() {
        var duration = max(currentDuration, accumulatedDuration)
        #if canImport(LiveKit)
        if providerAudioMaster != nil {
            duration = max(duration, sourceTimelineDuration())
        } else if captureState == .recording, let startTime {
            duration = max(duration, accumulatedDuration + Date().timeIntervalSince(startTime))
        }
        #else
        if captureState == .recording, let startTime {
            duration += Date().timeIntervalSince(startTime)
        }
        #endif

        let detail = EventDetail(
            state: bridgeState(for: captureState),
            durationMs: Int(max(0, duration) * 1000),
            localFilePath: currentRecordingURL?.path,
            callRoomId: activeCallRoomId,
            consentStatus: recordingConsentGranted ? "granted" : "missing"
        )
        onStateChange?(RecorderEvent(type: .stateChange, detail: detail))
    }

    private func broadcastError(message: String) {
        let detail = EventDetail(errorMessage: message)
        onStateChange?(RecorderEvent(type: .error, detail: detail))
    }

    private func finalizeSuccessfulRecording() {
        guard let fileURL = currentRecordingURL,
              let recordingID = activeLocalRecordingID else {
            finishCaptureFailure("Quipsly finalized audio but could not find its local ledger identity.")
            return
        }

        let stoppedAt = pendingFinalizationStoppedAt ?? Date()
        let duration = max(pendingFinalizationDuration, accumulatedDuration)
        let segmentsJson = encodeSegments()

        do {
            try localRecordingLibrary.setFinalizedFileProtection(at: fileURL)
            let finalized = try localRecordingLibrary.finalize(
                recordingID,
                stoppedAt: stoppedAt,
                durationSeconds: duration,
                recordingSegmentsJson: segmentsJson,
                statusMessage: pendingFinalizationMessage
            )
            guard finalized.status == .saved else {
                finishCaptureFailure(
                    finalized.statusDetail,
                    preserveExistingLibraryStatus: true
                )
                return
            }

            currentDuration = duration
            accumulatedDuration = duration
            currentTakeOrder += 1
            failureMessage = nil
            if automaticStopReason == nil {
                lastErrorMessage = nil
            }
            stopDurationAndMeterTimer()
            clearNowPlayingInfo()
            deactivateAudioSession()
            closeActiveRoomBoundaryAfterTerminalCapture(at: stoppedAt)
            transition(to: .saved)

            queueUploadIfPossible(recording: finalized, stoppedAt: stoppedAt, segmentsJson: segmentsJson)
            localRecordingRecoveryNote = recoverySummary()
            activeLocalRecordingID = nil
            activeCaptureIntent = nil
            localFallbackSessionId = nil
            providerAudioStartWatchdogTask?.cancel()
            providerAudioStartWatchdogTask = nil
            pendingProviderSegmentStart = nil
            pendingFinalizationStoppedAt = nil
            pendingFinalizationDuration = 0
            pendingFinalizationMessage = nil
        } catch {
            finishCaptureFailure("The audio source remains local, but Quipsly could not finish its ledger: \(error.localizedDescription)")
        }
    }

    private func queueUploadIfPossible(
        recording: LocalRecording,
        stoppedAt: Date,
        segmentsJson: String?
    ) {
        guard let projectSlug = recording.projectSlug,
              let episodeSlug = recording.episodeSlug,
              let fileURL = localRecordingLibrary.fileURL(for: recording) else {
            return
        }

        do {
            try localRecordingLibrary.markUploadQueued(recording.id)
            pendingUploadRecordingID = recording.id
        } catch {
            broadcastError(message: "Recording was saved locally, but its upload could not be queued: \(error.localizedDescription)")
            return
        }

        UploadManager.shared.startUpload(
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
            stoppedAt: ISO8601DateFormatter().string(from: stoppedAt),
            recordingSegmentsJson: segmentsJson,
            localRecordingID: recording.id,
            ownerAccountID: recording.ownerAccountID
        )

        guard UploadManager.shared.hasDurableUpload(localRecordingID: recording.id) else {
            try? localRecordingLibrary.markUploadHeld(
                recording.id,
                message: "Upload held until Quipsly can save its protected background job. The local original remains preserved."
            )
            return
        }

        do {
            try localRecordingLibrary.markUploading(recording.id, progress: 0)
        } catch {
            print("Could not persist initial upload state: \(error.localizedDescription)")
        }
    }

    private func finishCaptureFailure(
        _ message: String,
        preserveExistingLibraryStatus: Bool = false
    ) {
        let duration = max(
            currentDuration,
            accumulatedDuration,
            sourceTimelineDuration()
        )
        providerAudioStartWatchdogTask?.cancel()
        providerAudioStartWatchdogTask = nil
        audioRecorder?.stop()
        audioRecorder = nil
        #if canImport(LiveKit)
        providerAudioMaster?.stop()
        providerAudioMaster = nil
        #endif

        if let fileURL = currentRecordingURL {
            try? localRecordingLibrary.setFinalizedFileProtection(at: fileURL)
        }
        if let activeLocalRecordingID, !preserveExistingLibraryStatus {
            try? localRecordingLibrary.markCaptureFailed(
                activeLocalRecordingID,
                durationSeconds: duration,
                message: message
            )
        }
        closeActiveRoomBoundaryAfterTerminalCapture()

        currentDuration = duration
        startTime = nil
        currentSegmentStart = nil
        pendingProviderSegmentStart = nil
        pausedByInterruption = false
        failureMessage = message
        lastErrorMessage = message
        stopDurationAndMeterTimer()
        clearNowPlayingInfo()
        deactivateAudioSession()
        transition(to: .failed)
        broadcastError(message: message)
        localRecordingRecoveryNote = recoverySummary()
    }

    private func closeActiveRoomBoundaryAfterTerminalCapture(at date: Date = Date()) {
        guard let intent = activeCaptureIntent else { return }
        defer { activeCaptureIntent = nil }
        guard intent.requiresDurableRoomReceipt,
              let sessionID = intent.sessionID,
              let callRoomID = intent.callRoomID else { return }
        do {
            let stopReceipt = try receiptStore.enqueueDurably(
                captureID: intent.captureID,
                sessionID: sessionID,
                callRoomID: callRoomID,
                action: .stop,
                occurredAt: date,
                ownerAccountID: intent.ownerSnapshot.ownerAccountID
            )
            try localRecordingLibrary.markRoomStopReceipt(
                intent.captureID,
                receiptID: stopReceipt.id
            )
        } catch {
            let message = "The local source is preserved, but Quipsly could not finish its protected Nest STOP evidence: \(error.localizedDescription)"
            lastErrorMessage = [lastErrorMessage, message]
                .compactMap { $0 }
                .joined(separator: " ")
            broadcastError(message: message)
        }
    }

    private func failCapture(_ message: String) {
        failureMessage = message
        lastErrorMessage = message
        startTime = nil
        pausedByInterruption = false
        stopDurationAndMeterTimer()
        clearNowPlayingInfo()
        deactivateAudioSession()
        transition(to: .failed)
        broadcastError(message: message)
    }

    private func encodeSegments() -> String? {
        guard let data = try? JSONEncoder().encode(segments) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private func deactivateAudioSession() {
        audioSessionCoordinator.releaseLocalCapture()
        refreshInputRoute()
    }

    private func normalized(_ value: String?) -> String? {
        guard let value = value?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty else {
            return nil
        }
        return value
    }

    private func combining(_ primary: String, with secondary: String?) -> String {
        guard let secondary = normalized(secondary) else { return primary }
        return "\(primary) \(secondary)"
    }

    private func fileByteCount(at url: URL) -> Int64 {
        guard let attributes = try? FileManager.default.attributesOfItem(atPath: url.path),
              let size = attributes[.size] as? NSNumber else {
            return 0
        }
        return size.int64Value
    }

    private func recoverySummary() -> String {
        // Production capture rule: never silently delete local recordings.
        let pending = localRecordingLibrary.recordings.filter {
            [.saved, .queued, .uploading, .awaitingVerification, .uploadHeld, .recovered, .validatingRecovery, .needsRepair, .captureFailed].contains($0.status)
        }.count
        if pending == 0 {
            return "Local recordings are preserved until Quipsly verifies upload."
        }
        return "\(pending) local recording\(pending == 1 ? "" : "s") preserved on this iPhone."
    }

    // MARK: - Lock Screen Controls

    private func setupRemoteCommands() {
        let commandCenter = MPRemoteCommandCenter.shared()
        commandCenter.pauseCommand.addTarget { [weak self] _ in
            guard let self, self.captureState == .recording else { return .commandFailed }
            self.pauseRecording(reason: .pause, causedByInterruption: false)
            return .success
        }
        commandCenter.changePlaybackPositionCommand.isEnabled = false
        commandCenter.pauseCommand.isEnabled = false
        commandCenter.playCommand.isEnabled = false
    }

    private func updateNowPlayingInfo() {
        var info = [String: Any]()
        info[MPMediaItemPropertyTitle] = activeCallRoomLabel
        info[MPMediaItemPropertyArtist] = "Quipsly local recording"
        info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = currentDuration
        info[MPNowPlayingInfoPropertyPlaybackRate] = captureState == .recording ? 1.0 : 0.0
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }

    private func clearNowPlayingInfo() {
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    }

    deinit {
        startTask?.cancel()
        displayDurationTimer?.invalidate()
        NotificationCenter.default.removeObserver(self)
        if let accountObserver {
            NotificationCenter.default.removeObserver(accountObserver)
        }
    }

    private enum CaptureError: LocalizedError {
        case couldNotPrepareRecorder
        case couldNotBeginRecorder
        case couldNotResumeRecorder
        case emptyRecording
        case captureAlreadyArmed
        case missingRoomReceiptContext
        case startReceiptNotDurable
        case armedRoomMismatch
        case captureOwnerChanged
        case providerInputUnavailable
        case missingLocalRecordingIdentity

        var errorDescription: String? {
            switch self {
            case .couldNotPrepareRecorder:
                return "The audio recorder could not prepare the local file."
            case .couldNotBeginRecorder:
                return "The audio recorder did not begin writing."
            case .couldNotResumeRecorder:
                return "The audio recorder could not resume."
            case .emptyRecording:
                return "The finalized recording file is empty."
            case .captureAlreadyArmed:
                return "Another capture identity is already armed."
            case .missingRoomReceiptContext:
                return "The Nest-backed capture is missing its session or room identity."
            case .startReceiptNotDurable:
                return "The Nest START receipt was not durably committed, so recording did not begin."
            case .armedRoomMismatch:
                return "The armed Nest receipt does not match the selected call room, so recording did not begin."
            case .captureOwnerChanged:
                return "The Quipsly account changed before recording could safely begin. Nothing was recorded."
            case .providerInputUnavailable:
                return "The live room owns the microphone, but its local PCM stream is not active. Reconnect room audio before recording."
            case .missingLocalRecordingIdentity:
                return "The protected local recording identity is missing, so capture cannot resume."
            }
        }
    }
}

extension AudioCaptureController: @preconcurrency AVAudioRecorderDelegate {
    func audioRecorderDidFinishRecording(_ recorder: AVAudioRecorder, successfully flag: Bool) {
        guard recorder.url == currentRecordingURL, captureState == .finalizing else { return }
        audioRecorder = nil
        if flag {
            finalizeSuccessfulRecording()
        } else {
            finishCaptureFailure("iOS could not finish the audio file cleanly. Any local source bytes remain preserved for review.")
        }
    }

    func audioRecorderEncodeErrorDidOccur(_ recorder: AVAudioRecorder, error: Error?) {
        guard recorder.url == currentRecordingURL else { return }
        finishCaptureFailure(error?.localizedDescription ?? "iOS reported an audio encoding failure.")
    }
}

private extension AudioCaptureState {
    var isCaptureActive: Bool {
        switch self {
        case .recording, .paused, .finalizing:
            return true
        case .idle, .preparing, .saved, .failed:
            return false
        }
    }
}
