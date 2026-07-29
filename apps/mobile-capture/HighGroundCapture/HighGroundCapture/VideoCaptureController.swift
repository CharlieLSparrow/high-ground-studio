import AVFoundation
import Combine
import Foundation
import UIKit

enum VideoCaptureState: String, Equatable {
    case idle
    case preparing
    case ready
    case arming
    case recording
    case finalizing
    case paused
    case saved
    case failed

    var isActive: Bool {
        [.arming, .recording, .finalizing].contains(self)
    }
}

struct VideoCaptureContext: Equatable {
    let sessionID: String
    let projectSlug: String
    let episodeSlug: String
    let callRoomID: String
    let participantID: String?
    let recordingConsentID: String
    let recordingAssetID: String?
    let capturePurpose: String
    let displayTitle: String
    let consentAllowsVideo: Bool
    let consentAllowsAudio: Bool
    let longSourceUploadEnabled: Bool
    let maximumVideoSourceBytes: Int64
}

enum VideoCaptureControllerError: LocalizedError {
    case stableOwnerUnavailable
    case ownerChanged
    case videoConsentRequired
    case audioConsentRequired
    case profileNotPrepared
    case captureAlreadyActive
    case insufficientStorage(available: Int64, required: Int64)
    case thermalStateUnsafe
    case sourceIdentityMismatch

    var errorDescription: String? {
        switch self {
        case .stableOwnerUnavailable:
            "Verify the owning Quipsly account before preparing a video source."
        case .ownerChanged:
            "The Quipsly account changed. Recording stopped and the protected source stayed with its original owner."
        case .videoConsentRequired:
            "Current video consent is required before the camera can write source bytes."
        case .audioConsentRequired:
            "Current audio consent is required before a solo video can include microphone audio."
        case .profileNotPrepared:
            "Prepare and review the resolved camera profile before recording."
        case .captureAlreadyActive:
            "Finish the current source before starting another."
        case .insufficientStorage(let available, let required):
            "Video did not start. \(Self.bytes(available)) is available; this profile requires at least \(Self.bytes(required)) of safe working space."
        case .thermalStateUnsafe:
            "Video did not start because the iPhone is too warm for a reliable high-quality source."
        case .sourceIdentityMismatch:
            "The movie callback did not match the protected source identity. Quipsly stopped without reassigning any bytes."
        }
    }

    private static func bytes(_ value: Int64) -> String {
        ByteCountFormatter.string(fromByteCount: value, countStyle: .file)
    }
}

@MainActor
final class VideoCaptureController: ObservableObject {
    @Published private(set) var state: VideoCaptureState = .idle
    @Published private(set) var cameraPosition: VideoCaptureCameraPosition = .front
    @Published private(set) var resolvedProfile: VideoCaptureResolvedProfile?
    @Published private(set) var durationSeconds: TimeInterval = 0
    @Published private(set) var availableBytes: Int64?
    @Published private(set) var estimatedAvailableMinutes: Int?
    @Published private(set) var safetyMessage: String?
    @Published private(set) var lastErrorMessage: String?
    @Published private(set) var activeRecordingID: UUID?
    @Published private(set) var activeCaptureGroupID: UUID?

    var captureSession: AVCaptureSession {
        service.captureSession
    }

    private enum StopReason {
        case user
        case pause
        case cameraSwitch
        case appBackgrounded
        case accountChanged
        case storagePressure
        case thermalPressure
        case captureSessionInterrupted
        case captureSessionRuntimeError

        var statusMessage: String? {
            switch self {
            case .user:
                nil
            case .pause:
                "Pause created an explicit source boundary. Resume will create a new movie in the same capture group."
            case .cameraSwitch:
                "Camera switch created an explicit source boundary. The next camera source remains in the same capture group."
            case .appBackgrounded:
                "Quipsly safely closed the video source when the app left the foreground."
            case .accountChanged:
                "Quipsly safely closed the source when the signed-in account changed."
            case .storagePressure:
                "Quipsly safely closed the source before storage reached the protected reserve."
            case .thermalPressure:
                "Quipsly safely closed the source because the iPhone reached critical thermal pressure."
            case .captureSessionInterrupted:
                "iOS interrupted the camera session. Quipsly closed and preserved every recoverable movie fragment instead of silently continuing with missing video."
            case .captureSessionRuntimeError:
                "The camera session reported a runtime error. Quipsly closed and preserved every recoverable movie fragment instead of claiming uninterrupted capture."
            }
        }
    }

    private struct ActiveCapture {
        let recordingID: UUID
        let captureGroupID: UUID
        let roomStartReceiptID: UUID
        let ownerSnapshot: AuthManager.StableOwnerSnapshot
        let context: VideoCaptureContext
        let includesAudio: Bool
        let fileURL: URL
        let startedAt: Date
        let monotonicStartedNanoseconds: UInt64
    }

    private struct PausedCapture {
        let captureGroupID: UUID
        let ownerSnapshot: AuthManager.StableOwnerSnapshot
        let context: VideoCaptureContext
        let includesAudio: Bool
        let cameraPosition: VideoCaptureCameraPosition
    }

    private let service = VideoCaptureService()
    private let library = LocalRecordingLibrary.shared
    private let receiptStore = CaptureRoomReceiptStore.shared
    private var eventTask: Task<Void, Never>?
    private var monitorTask: Task<Void, Never>?
    private var activeCapture: ActiveCapture?
    private var pendingStopReason: StopReason = .user
    private var stopRequestedWhileArming: StopReason?
    private var pausedCapture: PausedCapture?
    private var pendingSwitchPosition: VideoCaptureCameraPosition?
    private var observers: [NSObjectProtocol] = []

    private let storageSafetyReserveBytes: Int64 = 1_500_000_000
    private let synchronousCloudVerificationLimitBytes: Int64 =
        2 * 1_024 * 1_024 * 1_024
    private let minimumStartWindowSeconds: Int64 = 5 * 60
    private let monitorIntervalNanoseconds: UInt64 = 1_000_000_000

    init() {
        eventTask = Task { [weak self, events = service.events] in
            for await event in events {
                guard let self else { return }
                await self.handle(event)
            }
        }
        observers.append(
            NotificationCenter.default.addObserver(
                forName: UIApplication.willResignActiveNotification,
                object: nil,
                queue: .main
            ) { [weak self] _ in
                Task { @MainActor in
                    await self?.handleAppBackgrounding()
                }
            }
        )
        observers.append(
            NotificationCenter.default.addObserver(
                forName: ProcessInfo.thermalStateDidChangeNotification,
                object: nil,
                queue: .main
            ) { [weak self] _ in
                Task { @MainActor in
                    await self?.handleThermalStateChange()
                }
            }
        )
        observers.append(
            NotificationCenter.default.addObserver(
                forName: .quipslyCaptureAccountIdentityDidChange,
                object: nil,
                queue: .main
            ) { [weak self] _ in
                Task { @MainActor in
                    await self?.handleAccountChange()
                }
            }
        )
        observers.append(
            NotificationCenter.default.addObserver(
                forName: AVCaptureSession.wasInterruptedNotification,
                object: service.captureSession,
                queue: .main
            ) { [weak self] _ in
                Task { @MainActor in
                    await self?.handleCaptureSessionInterruption()
                }
            }
        )
        observers.append(
            NotificationCenter.default.addObserver(
                forName: AVCaptureSession.runtimeErrorNotification,
                object: service.captureSession,
                queue: .main
            ) { [weak self] notification in
                let detail = (
                    notification.userInfo?[AVCaptureSessionErrorKey]
                        as? NSError
                )?.localizedDescription
                Task { @MainActor in
                    await self?.handleCaptureSessionRuntimeError(detail: detail)
                }
            }
        )
        observers.append(
            NotificationCenter.default.addObserver(
                forName: AVCaptureSession.interruptionEndedNotification,
                object: service.captureSession,
                queue: .main
            ) { [weak self] _ in
                Task { @MainActor in
                    await self?.handleCaptureSessionInterruptionEnded()
                }
            }
        )
    }

    deinit {
        eventTask?.cancel()
        monitorTask?.cancel()
        observers.forEach(NotificationCenter.default.removeObserver)
    }

    func prepare(
        position: VideoCaptureCameraPosition,
        includesAudio: Bool
    ) async {
        guard !state.isActive else { return }
        guard AuthManager.shared.stableOwnerSnapshot() != nil else {
            fail(VideoCaptureControllerError.stableOwnerUnavailable)
            return
        }
        guard ProcessInfo.processInfo.thermalState != .critical else {
            fail(VideoCaptureControllerError.thermalStateUnsafe)
            return
        }

        state = .preparing
        lastErrorMessage = nil
        safetyMessage = "Quipsly is resolving the exact camera, format, codec, storage, and permission profile. No source bytes are being recorded."
        do {
            let profile = try await service.prepare(
                position: position,
                includesAudio: includesAudio
            )
            cameraPosition = position
            resolvedProfile = profile
            refreshStorageProjection(profile: profile)
            state = .ready
            safetyMessage = profile.width >= 3_840 && profile.height >= 2_160
                ? "\(profile.profileLabel) resolved on this device. Quality will not silently change during a source."
                : "\(profile.profileLabel) is the highest reliable profile this camera reported. Quipsly is not claiming 4K."
        } catch {
            fail(error)
        }
    }

    func start(
        context: VideoCaptureContext,
        includesAudio: Bool,
        captureGroupID: UUID? = nil
    ) async {
        guard !state.isActive, activeCapture == nil else {
            fail(VideoCaptureControllerError.captureAlreadyActive)
            return
        }
        guard state == .ready else {
            fail(VideoCaptureControllerError.profileNotPrepared)
            return
        }
        guard context.consentAllowsVideo else {
            fail(VideoCaptureControllerError.videoConsentRequired)
            return
        }
        if includesAudio, !context.consentAllowsAudio {
            fail(VideoCaptureControllerError.audioConsentRequired)
            return
        }
        guard let preparedProfile = resolvedProfile,
              preparedProfile.cameraPosition == cameraPosition,
              preparedProfile.includesAudio == includesAudio else {
            fail(VideoCaptureControllerError.profileNotPrepared)
            return
        }
        guard let ownerSnapshot = AuthManager.shared.stableOwnerSnapshot() else {
            fail(VideoCaptureControllerError.stableOwnerUnavailable)
            return
        }
        guard AuthManager.shared.matchesStableOwnerSnapshot(ownerSnapshot) else {
            fail(VideoCaptureControllerError.ownerChanged)
            return
        }
        guard ProcessInfo.processInfo.thermalState != .critical else {
            fail(VideoCaptureControllerError.thermalStateUnsafe)
            return
        }
        var armedRecordingID: UUID?
        var armedOwnerAccountID: String?
        var ledgerWasCreated = false
        do {
            let requiredBytes = minimumRequiredBytes(
                profile: preparedProfile
            )
            let currentAvailableBytes = try availableCapacity()
            availableBytes = currentAvailableBytes
            guard currentAvailableBytes >= requiredBytes else {
                throw VideoCaptureControllerError.insufficientStorage(
                    available: currentAvailableBytes,
                    required: requiredBytes
                )
            }

            state = .arming
            let recordingID = UUID()
            let groupID = captureGroupID ?? UUID()
            let clockSamples = await CaptureClockClient.shared.measureBurst(
                callRoomID: context.callRoomID,
                captureGroupID: groupID,
                expectedOwnerAccountID: ownerSnapshot.ownerAccountID
            )
            guard AuthManager.shared.matchesStableOwnerSnapshot(ownerSnapshot) else {
                throw VideoCaptureControllerError.ownerChanged
            }
            // Snapshot and lock the horizon-level movie transform immediately
            // before the durable source receipt. The connection keeps this
            // orientation for the immutable source rather than changing track
            // semantics if the phone moves later.
            let profile = try await service
                .lockCaptureOrientationForArming()
            resolvedProfile = profile
            let startReceipt = try receiptStore.enqueueDurably(
                captureID: recordingID,
                sessionID: context.sessionID,
                callRoomID: context.callRoomID,
                action: .start,
                ownerAccountID: ownerSnapshot.ownerAccountID
            )
            armedRecordingID = recordingID
            armedOwnerAccountID = ownerSnapshot.ownerAccountID
            let startedAt = Date()
            let monotonicStarted = DispatchTime.now().uptimeNanoseconds
            let sourceURL = try library.makeUniqueSourceURL(
                mediaKind: .video,
                fileExtension: "mov",
                startedAt: startedAt
            )
            let runtimeEvidence = CaptureRuntimeEvidence.current()
            let sourceProfile = LocalRecordingSourceProfile(
                schemaVersion: 3,
                container: "mov",
                codec: profile.codec,
                width: profile.width,
                height: profile.height,
                nominalFrameRate: profile.framesPerSecond,
                colorSpace: profile.colorSpace,
                orientation: profile.presentationOrientation,
                cameraPosition: profile.cameraPosition.rawValue,
                cameraDeviceUniqueID: profile.cameraDeviceUniqueID,
                captureRotationDegrees: profile.captureRotationDegrees,
                includesAudio: profile.includesAudio,
                audioSampleRate: profile.audioSampleRate,
                audioChannelCount: profile.audioChannelCount,
                captureAppVersion: runtimeEvidence.appVersion,
                captureAppBuild: runtimeEvidence.appBuild,
                deviceModelIdentifier: runtimeEvidence.deviceModelIdentifier,
                deviceSystemName: runtimeEvidence.systemName,
                deviceSystemVersion: runtimeEvidence.systemVersion,
                audioRouteName: profile.includesAudio
                    ? runtimeEvidence.audioRouteName
                    : nil,
                audioRoutePortType: profile.includesAudio
                    ? runtimeEvidence.audioRoutePortType
                    : nil,
                monotonicStartedNanoseconds: monotonicStarted,
                clockSamples: clockSamples.isEmpty ? nil : clockSamples
            )
            let localContext = LocalRecordingSessionContext(
                projectSlug: context.projectSlug,
                episodeSlug: context.episodeSlug,
                callRoomId: context.callRoomID,
                participantId: context.participantID,
                recordingConsentId: context.recordingConsentID,
                recordingConsentGranted: true,
                recordingAssetId: context.recordingAssetID,
                capturePurpose: context.capturePurpose
            )
            _ = try library.beginRecording(
                id: recordingID,
                at: sourceURL,
                startedAt: startedAt,
                context: localContext,
                expectedOwnerAccountID: ownerSnapshot.ownerAccountID,
                displayTitle: context.displayTitle,
                mediaKind: .video,
                captureGroupId: groupID,
                roomStartReceiptId: startReceipt.id,
                sourceProfile: sourceProfile
            )
            ledgerWasCreated = true
            guard AuthManager.shared.matchesStableOwnerSnapshot(ownerSnapshot) else {
                throw VideoCaptureControllerError.ownerChanged
            }

            activeCapture = ActiveCapture(
                recordingID: recordingID,
                captureGroupID: groupID,
                roomStartReceiptID: startReceipt.id,
                ownerSnapshot: ownerSnapshot,
                context: context,
                includesAudio: includesAudio,
                fileURL: sourceURL,
                startedAt: startedAt,
                monotonicStartedNanoseconds: monotonicStarted
            )
            activeRecordingID = recordingID
            activeCaptureGroupID = groupID
            durationSeconds = 0
            pendingStopReason = .user
            stopRequestedWhileArming = nil
            try await service.startRecording(to: sourceURL)
            safetyMessage = "Protected source and room START receipts are durable. Waiting for the movie output to confirm bytes."
        } catch {
            if ledgerWasCreated, let recordingID = armedRecordingID {
                try? library.markCaptureFailed(
                    recordingID,
                    durationSeconds: durationSeconds,
                    message: "Video did not begin cleanly. Any source bytes remain preserved."
                )
            }
            if let recordingID = armedRecordingID,
               let ownerAccountID = armedOwnerAccountID {
                try? closeRoomBoundary(
                    recordingID: recordingID,
                    context: context,
                    ownerAccountID: ownerAccountID
                )
            }
            activeCapture = nil
            activeRecordingID = nil
            activeCaptureGroupID = nil
            stopRequestedWhileArming = nil
            fail(error)
        }
    }

    func stop() async {
        if state == .paused {
            pausedCapture = nil
            activeCaptureGroupID = nil
            state = .saved
            safetyMessage = "Capture group finished. Every movie boundary and the honest pause gap remain preserved."
            return
        }
        await stopIfActive(reason: .user)
    }

    /// Waits for the delegate-confirmed movie start instead of treating the
    /// synchronous start request as proof that video bytes are flowing.
    func waitUntilRecording(timeout: TimeInterval = 8) async -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            switch state {
            case .recording:
                return true
            case .failed, .idle, .saved:
                return false
            case .preparing, .ready, .arming, .finalizing, .paused:
                try? await Task.sleep(nanoseconds: 50_000_000)
            }
        }
        lastErrorMessage = "The camera did not confirm source start in time. Quipsly is closing any partial source instead of claiming a coordinated recording."
        return false
    }

    /// Waits for AVFoundation's final callback and local validation. A caller
    /// may still time out with a preserved `.finalizing` source that needs
    /// Library review; it must not invent a successful group stop.
    func waitUntilTerminal(timeout: TimeInterval = 20) async -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            switch state {
            case .saved, .failed, .idle:
                return true
            case .preparing, .ready, .arming, .recording, .finalizing, .paused:
                try? await Task.sleep(nanoseconds: 50_000_000)
            }
        }
        lastErrorMessage = "Quipsly is still waiting for iOS to close and validate the movie. Keep the app open and review this source in Library."
        return false
    }

    /// Waits until the current movie boundary is delegate-finalized. Paused is
    /// a valid group-continuation state only after the file and durable STOP
    /// boundary both pass validation; saved/failed/idle are terminal instead.
    func waitUntilPausedOrTerminal(timeout: TimeInterval = 20) async -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            switch state {
            case .paused, .saved, .failed, .idle:
                return true
            case .preparing, .ready, .arming, .recording, .finalizing:
                try? await Task.sleep(nanoseconds: 50_000_000)
            }
        }
        lastErrorMessage = "Quipsly is still waiting for iOS to close and validate the paused movie boundary. Keep the app open and review this source in Library."
        return false
    }

    func pause() async {
        guard let activeCapture else { return }
        pausedCapture = PausedCapture(
            captureGroupID: activeCapture.captureGroupID,
            ownerSnapshot: activeCapture.ownerSnapshot,
            context: activeCapture.context,
            includesAudio: activeCapture.includesAudio,
            cameraPosition: cameraPosition
        )
        await stopIfActive(reason: .pause)
    }

    func resume() async {
        guard state == .paused, let pausedCapture else { return }
        guard AuthManager.shared.matchesStableOwnerSnapshot(pausedCapture.ownerSnapshot) else {
            self.pausedCapture = nil
            fail(VideoCaptureControllerError.ownerChanged)
            return
        }
        await prepare(
            position: pausedCapture.cameraPosition,
            includesAudio: pausedCapture.includesAudio
        )
        guard state == .ready else { return }
        let groupID = pausedCapture.captureGroupID
        let context = pausedCapture.context
        let includesAudio = pausedCapture.includesAudio
        self.pausedCapture = nil
        await start(
            context: context,
            includesAudio: includesAudio,
            captureGroupID: groupID
        )
    }

    func switchCamera() async {
        guard activeCapture != nil, state == .recording else { return }
        pendingSwitchPosition = cameraPosition.opposite
        await stopIfActive(reason: .cameraSwitch)
    }

    func shutdownPreview() async {
        guard !state.isActive else { return }
        await shutdownPreviewAndClearProfile()
    }

    private func handle(_ event: VideoCaptureServiceEvent) async {
        switch event {
        case .started(let url):
            guard let activeCapture,
                  url.standardizedFileURL == activeCapture.fileURL.standardizedFileURL else {
                fail(VideoCaptureControllerError.sourceIdentityMismatch)
                try? await service.stopRecording()
                return
            }
            do {
                try library.setInProgressFileProtection(at: url)
                try library.markRecording(activeCapture.recordingID, durationSeconds: 0)
                state = .recording
                safetyMessage = "Recording \(resolvedProfile?.profileLabel ?? "resolved video") locally. Network loss will not stop this source."
                startMonitor()
                if let requestedReason = stopRequestedWhileArming {
                    stopRequestedWhileArming = nil
                    await stopIfActive(reason: requestedReason)
                }
            } catch {
                pendingStopReason = .user
                try? await service.stopRecording()
                fail(error)
            }

        case .finished(let url, let movieError):
            await finish(url: url, movieError: movieError)
        }
    }

    private func finish(url: URL, movieError: Error?) async {
        guard let activeCapture else { return }
        monitorTask?.cancel()
        monitorTask = nil
        let stoppedAt = Date()
        let duration = max(
            durationSeconds,
            Double(
                DispatchTime.now().uptimeNanoseconds
                    - activeCapture.monotonicStartedNanoseconds
            ) / 1_000_000_000
        )
        var finalized: LocalRecording?
        do {
            guard url.standardizedFileURL == activeCapture.fileURL.standardizedFileURL else {
                throw VideoCaptureControllerError.sourceIdentityMismatch
            }
            try library.setFinalizedFileProtection(at: url)
            let boundedResult = try library.finalize(
                activeCapture.recordingID,
                stoppedAt: stoppedAt,
                durationSeconds: duration,
                recordingSegmentsJson: nil,
                statusMessage: movieError == nil
                    ? pendingStopReason.statusMessage
                    : "The movie output reported an interruption. Quipsly preserved and validated every recoverable fragment."
            )
            finalized = try await library.validateFinalizedSource(
                boundedResult.id
            )
        } catch {
            try? library.markCaptureFailed(
                activeCapture.recordingID,
                durationSeconds: duration,
                message: "Video finalization needs review: \(error.localizedDescription)"
            )
            lastErrorMessage = error.localizedDescription
        }
        var roomBoundaryClosed = false
        do {
            try closeRoomBoundary(
                recordingID: activeCapture.recordingID,
                context: activeCapture.context,
                ownerAccountID: activeCapture.ownerSnapshot.ownerAccountID
            )
            roomBoundaryClosed = true
        } catch {
            lastErrorMessage = [
                lastErrorMessage,
                "The local source is safe, but its room STOP receipt still needs durable recovery: \(error.localizedDescription)",
            ].compactMap { $0 }.joined(separator: " ")
        }

        let stopReason = pendingStopReason
        let finishedCapture = activeCapture
        self.activeCapture = nil
        activeRecordingID = nil
        stopRequestedWhileArming = nil
        durationSeconds = duration

        if let finalized, finalized.isUploadEligible {
            if finalized.byteCount <= synchronousCloudVerificationLimitBytes
                || (
                    finishedCapture.context.longSourceUploadEnabled
                        && finalized.byteCount
                            <= finishedCapture.context.maximumVideoSourceBytes
                ) {
                queueUpload(recording: finalized)
            } else {
                let limit = ByteCountFormatter.string(
                    fromByteCount: finishedCapture.context.maximumVideoSourceBytes,
                    countStyle: .file
                )
                let message = finishedCapture.context.longSourceUploadEnabled
                    ? "The complete video is safe on this iPhone. Its \(ByteCountFormatter.string(fromByteCount: finalized.byteCount, countStyle: .file)) size exceeds Nest's advertised \(limit) protected-video limit; no partial or falsely verified copy was queued."
                    : "The complete video is safe on this iPhone. Nest did not advertise its long-source verification worker, so this \(ByteCountFormatter.string(fromByteCount: finalized.byteCount, countStyle: .file)) source remains held; no partial or falsely verified copy was queued."
                do {
                    try library.markUploadHeld(finalized.id, message: message)
                } catch {
                    lastErrorMessage = [
                        lastErrorMessage,
                        "Long-source upload hold could not be written: \(error.localizedDescription)",
                    ].compactMap { $0 }.joined(separator: " ")
                }
                safetyMessage = message
            }
        }

        if stopReason == .pause {
            guard finalized?.status.isPlaybackEligible == true,
                  roomBoundaryClosed else {
                pausedCapture = nil
                activeCaptureGroupID = nil
                state = .failed
                safetyMessage = "The movie boundary was preserved, but Quipsly could not validate both the source and its durable STOP evidence. Review it in Library before starting another group."
                return
            }
            state = .paused
            safetyMessage = stopReason.statusMessage
            return
        }
        if stopReason == .cameraSwitch,
           let nextPosition = pendingSwitchPosition {
            pendingSwitchPosition = nil
            guard finalized?.status.isPlaybackEligible == true,
                  roomBoundaryClosed else {
                activeCaptureGroupID = nil
                state = .failed
                safetyMessage = "The first camera source was preserved, but its boundary did not pass every validation. Quipsly did not open the other camera."
                return
            }
            // The capture group is still open. Never publish a transient
            // `.saved` state here: downstream UI treats that as authority to
            // unlock session and provider controls, even though the next
            // immutable movie is about to be armed.
            state = .preparing
            safetyMessage = "First camera source is closed and preserved. Preparing the \(nextPosition.rawValue) camera."
            await prepare(
                position: nextPosition,
                includesAudio: finishedCapture.includesAudio
            )
            guard state == .ready else {
                return
            }
            guard AuthManager.shared.matchesStableOwnerSnapshot(
                finishedCapture.ownerSnapshot
            ) else {
                fail(VideoCaptureControllerError.ownerChanged)
                return
            }
            await start(
                context: finishedCapture.context,
                includesAudio: finishedCapture.includesAudio,
                captureGroupID: finishedCapture.captureGroupID
            )
            return
        }

        activeCaptureGroupID = nil
        state = finalized?.status.isPlaybackEligible == true
            ? .saved
            : .failed
        if safetyMessage == nil || finalized?.byteCount ?? 0 <= synchronousCloudVerificationLimitBytes {
            safetyMessage = finalized?.statusDetail
        }
        if let movieError {
            lastErrorMessage = movieError.localizedDescription
        }
    }

    private func queueUpload(recording: LocalRecording) {
        guard let fileURL = library.fileURL(for: recording),
              let projectSlug = recording.projectSlug,
              let episodeSlug = recording.episodeSlug else {
            return
        }
        do {
            try library.markUploadQueued(recording.id)
        } catch {
            lastErrorMessage = "Video is saved, but its upload could not be queued: \(error.localizedDescription)"
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
            stoppedAt: recording.stoppedAt.map {
                ISO8601DateFormatter().string(from: $0)
            },
            recordingSegmentsJson: recording.recordingSegmentsJson,
            localRecordingID: recording.id,
            ownerAccountID: recording.ownerAccountID
        )
    }

    private func stopIfActive(reason: StopReason) async {
        guard state == .recording || state == .arming else { return }
        pendingStopReason = reason
        if state == .arming {
            stopRequestedWhileArming = reason
        }
        state = .finalizing
        safetyMessage = "Closing and validating the current fragmented movie. Source bytes remain local."
        if let activeCapture {
            try? library.markFinalizing(
                activeCapture.recordingID,
                durationSeconds: durationSeconds
            )
        }
        do {
            try await service.stopRecording()
        } catch {
            // A start callback may still be in flight. The event path will close
            // the source; retain visible finalizing state rather than inventing
            // a successful stop.
            lastErrorMessage = error.localizedDescription
        }
    }

    private func closeRoomBoundary(
        recordingID: UUID,
        context: VideoCaptureContext,
        ownerAccountID: String
    ) throws {
        let stopReceipt = try receiptStore.enqueueDurably(
            captureID: recordingID,
            sessionID: context.sessionID,
            callRoomID: context.callRoomID,
            action: .stop,
            ownerAccountID: ownerAccountID
        )
        try library.markRoomStopReceiptIfPresent(
            recordingID,
            receiptID: stopReceipt.id
        )
    }

    private func startMonitor() {
        monitorTask?.cancel()
        let intervalNanoseconds = monitorIntervalNanoseconds
        monitorTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(
                    nanoseconds: intervalNanoseconds
                )
                guard let self, let activeCapture = self.activeCapture else {
                    return
                }
                self.durationSeconds = Double(
                    DispatchTime.now().uptimeNanoseconds
                        - activeCapture.monotonicStartedNanoseconds
                ) / 1_000_000_000
                do {
                    let capacity = try self.availableCapacity()
                    self.availableBytes = capacity
                    self.refreshStorageProjection(profile: self.resolvedProfile)
                    if capacity < self.storageSafetyReserveBytes {
                        await self.stopIfActive(reason: .storagePressure)
                        return
                    }
                } catch {
                    self.lastErrorMessage = "Storage capacity could not be verified while recording. Quipsly is closing this source safely."
                    await self.stopIfActive(reason: .storagePressure)
                    return
                }
                if ProcessInfo.processInfo.thermalState == .critical {
                    await self.stopIfActive(reason: .thermalPressure)
                    return
                }
            }
        }
    }

    private func handleThermalStateChange() async {
        switch ProcessInfo.processInfo.thermalState {
        case .nominal:
            if state == .ready {
                safetyMessage = "Thermal state is nominal. The resolved profile remains unchanged."
            }
        case .fair:
            safetyMessage = "The iPhone is warm. Quipsly is monitoring the current source without changing quality."
        case .serious:
            safetyMessage = "Thermal pressure is serious. Cool the iPhone; Quipsly will close the source if pressure becomes critical."
        case .critical:
            if state.isActive {
                await stopIfActive(reason: .thermalPressure)
            } else {
                await shutdownPreviewAndClearProfile()
                fail(VideoCaptureControllerError.thermalStateUnsafe)
            }
        @unknown default:
            safetyMessage = "Thermal state is unknown. Quipsly will not silently change source quality."
        }
    }

    private func handleAppBackgrounding() async {
        if state.isActive {
            await stopIfActive(reason: .appBackgrounded)
        } else {
            await shutdownPreviewAndClearProfile()
        }
    }

    private func handleAccountChange() async {
        pausedCapture = nil
        if state.isActive {
            await stopIfActive(reason: .accountChanged)
        } else {
            await shutdownPreviewAndClearProfile()
            fail(VideoCaptureControllerError.ownerChanged)
        }
    }

    private func handleCaptureSessionInterruption() async {
        let detail = "iOS interrupted the camera session."
        if state == .recording || state == .arming {
            lastErrorMessage = detail
            await stopIfActive(reason: .captureSessionInterrupted)
            return
        }
        if state == .ready || state == .preparing {
            await shutdownPreviewAndClearProfile()
            safetyMessage = "\(detail) Prepare the camera again after the interruption ends."
        }
    }

    private func handleCaptureSessionRuntimeError(detail: String?) async {
        let explanation = [
            "The camera session reported a runtime error.",
            detail,
        ].compactMap { $0 }.joined(separator: " ")
        if state == .recording || state == .arming {
            lastErrorMessage = explanation
            await stopIfActive(reason: .captureSessionRuntimeError)
            return
        }
        if state == .ready || state == .preparing {
            await shutdownPreviewAndClearProfile()
            lastErrorMessage = explanation
            safetyMessage = "Prepare the camera again. Quipsly did not silently restart or claim source continuity."
        }
    }

    private func handleCaptureSessionInterruptionEnded() async {
        guard state == .idle, resolvedProfile == nil else { return }
        safetyMessage = "The camera interruption ended. Prepare again to resolve and review a fresh source profile."
    }

    private func shutdownPreviewAndClearProfile() async {
        await service.shutdownPreview()
        resolvedProfile = nil
        estimatedAvailableMinutes = nil
        if !state.isActive {
            state = .idle
        }
    }

    private func refreshStorageProjection(profile: VideoCaptureResolvedProfile?) {
        guard let profile else {
            estimatedAvailableMinutes = nil
            return
        }
        if availableBytes == nil {
            availableBytes = try? availableCapacity()
        }
        guard let availableBytes else {
            estimatedAvailableMinutes = nil
            return
        }
        let usableBytes = max(0, availableBytes - storageSafetyReserveBytes)
        estimatedAvailableMinutes = Int(
            usableBytes / max(1, profile.estimatedBytesPerSecond) / 60
        )
    }

    private func minimumRequiredBytes(
        profile: VideoCaptureResolvedProfile
    ) -> Int64 {
        storageSafetyReserveBytes
            + profile.estimatedBytesPerSecond * minimumStartWindowSeconds
    }

    private func availableCapacity() throws -> Int64 {
        let values = try library.recordingsDirectoryURL.resourceValues(
            forKeys: [.volumeAvailableCapacityForImportantUsageKey]
        )
        guard let capacity = values.volumeAvailableCapacityForImportantUsage else {
            throw CocoaError(.fileReadUnknown)
        }
        return capacity
    }

    private func fail(_ error: Error) {
        state = .failed
        lastErrorMessage = error.localizedDescription
        safetyMessage = "No unverified success is claimed. Any local bytes and durable receipts remain preserved."
    }
}
