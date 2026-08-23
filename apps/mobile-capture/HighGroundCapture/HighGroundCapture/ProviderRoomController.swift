import Combine
import AVFoundation
import CallKit
import Foundation
import SwiftUI

#if canImport(LiveKit)
@preconcurrency import LiveKit

private final class ProviderRoomVideoFrameBridge: VideoCaptureFrameConsumer,
    @unchecked Sendable {
    let capturer: BufferCapturer

    init(capturer: BufferCapturer) {
        self.capturer = capturer
    }

    nonisolated func consumeVideoSampleBuffer(_ sampleBuffer: CMSampleBuffer) {
        capturer.capture(sampleBuffer)
    }
}
#endif

private enum ProviderRoomRuntime {
    static let liveKitSDKAvailable: Bool = {
        #if canImport(LiveKit)
        return true
        #else
        return false
        #endif
    }()

    static var liveKitLabel: String {
        liveKitSDKAvailable ? "LiveKit SDK linked" : "LiveKit SDK missing"
    }

    static var liveKitDetail: String {
        if liveKitSDKAvailable {
            return "This build can use Nest-issued LiveKit join packets for real provider-room media."
        }
        return "Nest can prepare short-lived room keys, but this app build cannot join media until the LiveKit Swift package and binary artifacts are linked."
    }
}

@MainActor
final class ProviderRoomController: NSObject, ObservableObject {
    @Published var statusText = "Provider room idle"
    @Published var connectionStateLabel = "Disconnected"
    @Published var isConnecting = false
    @Published var isConnected = false
    @Published var isReconnecting = false
    @Published var isMuted = true
    @Published private(set) var usesCallAudio = false
    @Published var isNativeCallPresentationActive = false
    @Published var nativeCallPresentationLabel = "CallKit ready"
    @Published var remoteParticipantCount = 0
    @Published private(set) var hasRemoteVideo = false
    @Published private(set) var remoteVideoParticipantLabel: String?
    @Published private(set) var isLocalVideoPublished = false
    @Published private(set) var isChangingLocalVideo = false
    @Published private(set) var localVideoStatus = "Camera off"
    @Published var activeRoomName: String?
    @Published var activeCallUUIDString: String?
    @Published var lastError: String?
    @Published var lastTechnicalError: String?
    @Published var providerRuntimeAvailable = ProviderRoomRuntime.liveKitSDKAvailable
    @Published var providerRuntimeLabel = ProviderRoomRuntime.liveKitLabel
    @Published var providerRuntimeDetail = ProviderRoomRuntime.liveKitDetail
    @Published var isCallAudioSessionActive = false
    @Published var callAudioSessionLabel = "Call audio idle"
    @Published private(set) var callAudioHealth: ProviderRoomCallAudioHealth = .checking
    @Published private(set) var callAudioAveragePowerDBFS: Float = -160
    @Published private(set) var callAudioPeakPowerDBFS: Float = -160
    @Published private(set) var callAudioReceivedPCMAt: Date?
    @Published private(set) var latestEpisodeWatchHint: MobileEpisodeWatchLiveHint?
    @Published private(set) var latestChatPersistedHint: MobileChatPersistedLiveHint?

    /// CallKit can end a call from the system UI, a headset, or the lock
    /// screen. CaptureExperienceModel installs this endpoint-local protection
    /// boundary so that action cannot strand an active retained source.
    var protectLocalSourceBeforeNativeCallEnd: (() async -> Bool)?

    private let callKitProvider: CXProvider
    private let callController = CXCallController()
    private let audioSessionCoordinator = CaptureAudioSessionCoordinator.shared
    private var activeCallUUID: UUID?
    private var activeOwnerSnapshot: AuthManager.StableOwnerSnapshot?
    private var accountObserver: NSObjectProtocol?
    private var activeCallRoomID: String?
    private var lastPublishedEpisodeWatchReceiptID: String?
    private var lastPublishedChatMessageID: String?
    private var activeChatThreadKeys: Set<String> = []

    #if canImport(LiveKit)
    private let room = Room()
    @Published fileprivate var remoteVideoTrack: VideoTrack?
    private var localVideoTrack: LocalVideoTrack?
    private var localVideoPublication: LocalTrackPublication?
    private var localVideoFrameBridge: ProviderRoomVideoFrameBridge?
    private weak var localVideoSource: VideoCaptureController?
    private var callAudioMeter: ProviderRoomCallAudioMeter?
    private var callAudioWatchdogTask: Task<Void, Never>?
    #endif

    override init() {
        let configuration = CXProviderConfiguration()
        configuration.supportsVideo = true
        configuration.maximumCallGroups = 1
        configuration.maximumCallsPerCallGroup = 1
        configuration.supportedHandleTypes = [.generic]
        callKitProvider = CXProvider(configuration: configuration)
        super.init()
        callKitProvider.setDelegate(self, queue: nil)
        #if canImport(LiveKit)
        room.add(delegate: self)
        callAudioMeter = ProviderRoomCallAudioMeter { [weak self] levels, receivedAt in
            Task { @MainActor [weak self] in
                self?.receiveCallAudioLevels(levels, receivedAt: receivedAt)
            }
        }
        #endif
        accountObserver = NotificationCenter.default.addObserver(
            forName: .quipslyCaptureAccountIdentityDidChange,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self,
                      let ownerSnapshot = self.activeOwnerSnapshot,
                      !AuthManager.shared.matchesStableOwnerSnapshot(ownerSnapshot) else { return }
                await self.abortForAccountChange()
            }
        }
    }

    /// iOS remembers this system decision. Quipsly asks only from the person's
    /// Join action, before minting a short-lived room token or opening CallKit.
    func prepareMicrophonePermissionForJoin() async -> Bool {
        switch AVAudioApplication.shared.recordPermission {
        case .granted:
            lastError = nil
            lastTechnicalError = nil
            return true
        case .denied:
            fail("Allow microphone access in Settings to join the call.")
            return false
        case .undetermined:
            isConnecting = true
            lastError = nil
            connectionStateLabel = "Checking microphone"
            statusText = "Allow microphone access to join the call. Quipsly will remember the iPhone setting."
            let allowed = await withCheckedContinuation { continuation in
                AVAudioApplication.requestRecordPermission { granted in
                    continuation.resume(returning: granted)
                }
            }
            isConnecting = false
            if allowed {
                connectionStateLabel = "Ready"
                statusText = "Microphone ready."
                lastTechnicalError = nil
                return true
            }
            fail("Allow microphone access in Settings to join the call.")
            return false
        @unknown default:
            fail("Microphone access is unavailable. Check Quipsly in Settings, then try again.")
            return false
        }
    }

    func connect(
        using join: MobileCaptureRoomJoinResponse?,
        session: MobileCaptureSession,
        expectedOwnerSnapshot: AuthManager.StableOwnerSnapshot,
        useCallAudio: Bool = true
    ) async {
        #if canImport(LiveKit)
        guard AuthManager.shared.matchesStableOwnerSnapshot(expectedOwnerSnapshot) else {
            fail(
                "Your Quipsly account changed. Join again with the current account.",
                technical: accountChangedMessage
            )
            return
        }
        guard let join else {
            fail("This call isn't ready yet. Refresh the Session and try again.", technical: "No prepared provider-room join response was available.")
            return
        }

        guard join.canJoin == true else {
            fail(
                "This call isn't ready yet. Refresh the Session and try again, or record without joining.",
                technical: join.nextAction ?? "The provider-room join response held access."
            )
            return
        }

        guard let serverUrl = join.serverUrl, !serverUrl.isEmpty,
              let participantToken = join.participantToken, !participantToken.isEmpty else {
            fail("This call couldn't start. Refresh the Session and try again.", technical: "Nest returned an incomplete provider-room join packet.")
            return
        }
        activeOwnerSnapshot = expectedOwnerSnapshot
        activeCallRoomID = session.callRoomId
        activeChatThreadKeys = Set([
            MobileChatPersistedLiveHint.sessionThreadKey(session.callRoomId),
            MobileChatPersistedLiveHint.episodeThreadKey(session.episodeSlug),
        ].compactMap { $0 })
        usesCallAudio = useCallAudio

        if useCallAudio {
            do {
                try audioSessionCoordinator.providerWillConnect()
            } catch {
                usesCallAudio = false
                fail("Your microphone couldn't be prepared. Check the selected input and try again.", technical: error.localizedDescription)
                return
            }
        }

        isConnecting = true
        isReconnecting = false
        lastError = nil
        lastTechnicalError = nil
        statusText = "Connecting to \(join.provider ?? session.providerLabel)..."
        connectionStateLabel = "Connecting"
        nativeCallPresentationLabel = useCallAudio
            ? "Preparing native call surface"
            : "Call audio on another device"

        let callKitStarted = useCallAudio
            ? await startNativeCallPresentation(session: session, join: join)
            : true
        guard AuthManager.shared.matchesStableOwnerSnapshot(expectedOwnerSnapshot) else {
            await abortForAccountChange()
            return
        }
        if useCallAudio && !callKitStarted {
            audioSessionCoordinator.providerDidDisconnect()
            usesCallAudio = false
            fail("Call audio couldn't start. Try again, or record without joining.", technical: lastTechnicalError ?? "The native call presentation could not start.")
            return
        }

        let callAudioActivated = useCallAudio
            ? await waitForCallAudioActivation(expectedOwnerSnapshot: expectedOwnerSnapshot)
            : true
        guard AuthManager.shared.matchesStableOwnerSnapshot(expectedOwnerSnapshot) else {
            await abortForAccountChange()
            return
        }
        guard !useCallAudio || callAudioActivated else {
            await endNativeCallPresentation(reason: .failed)
            try? audioSessionCoordinator.callKitDidDeactivate()
            audioSessionCoordinator.providerDidDisconnect()
            usesCallAudio = false
            fail("Call audio couldn't start. Try again, or record without joining.", technical: "CallKit did not activate the room audio session before timeout.")
            return
        }

        do {
            guard AuthManager.shared.matchesStableOwnerSnapshot(expectedOwnerSnapshot) else {
                await abortForAccountChange()
                return
            }
            try await room.connect(
                url: serverUrl,
                token: participantToken,
                connectOptions: ConnectOptions(autoSubscribe: useCallAudio)
            )
            guard AuthManager.shared.matchesStableOwnerSnapshot(expectedOwnerSnapshot) else {
                await abortForAccountChange()
                return
            }
            // A companion endpoint neither publishes nor subscribes to call
            // media. It stays in the room for presence, Session data, shared
            // Watch, and synchronized local capture without claiming the
            // microphone or creating speaker echo.
            try await room.localParticipant.setMicrophone(enabled: useCallAudio)
            guard AuthManager.shared.matchesStableOwnerSnapshot(expectedOwnerSnapshot) else {
                await abortForAccountChange()
                return
            }
            isMuted = !useCallAudio
            isConnected = true
            isReconnecting = false
            lastTechnicalError = nil
            activeRoomName = room.name ?? join.roomName ?? session.displayTitle
            remoteParticipantCount = room.remoteParticipants.count
            refreshRemoteVideoTrack()
            connectionStateLabel = "\(room.connectionState)".capitalized
            if useCallAudio {
                reportNativeCallConnected()
            }
            refreshCallAudioMeterLifecycle()
            statusText = useCallAudio
                ? "Joined the call. Recording still starts separately."
                : "Joined as a second device. Call audio stays on your other device."
        } catch {
            stopCallAudioMeter()
            await room.disconnect()
            await endNativeCallPresentation(reason: .failed)
            audioSessionCoordinator.providerDidDisconnect()
            activeOwnerSnapshot = nil
            clearEpisodeWatchBridge()
            isConnected = false
            isReconnecting = false
            isMuted = true
            usesCallAudio = false
            remoteParticipantCount = 0
            activeRoomName = nil
            fail("The call couldn't connect. Check your internet connection and try again.", technical: error.localizedDescription)
        }

        isConnecting = false
        isReconnecting = false
        #else
        fail("Calls aren't available in this build. You can still record on this iPhone.", technical: "The LiveKit SDK is not linked into this app build.")
        #endif
    }

    func setMuted(_ muted: Bool) async {
        #if canImport(LiveKit)
        guard usesCallAudio else {
            fail("Call audio is on your other device.", technical: "A companion endpoint cannot publish a provider microphone.")
            return
        }
        guard isConnected,
              let activeOwnerSnapshot,
              AuthManager.shared.matchesStableOwnerSnapshot(activeOwnerSnapshot) else {
            if let ownerSnapshot = self.activeOwnerSnapshot,
               !AuthManager.shared.matchesStableOwnerSnapshot(ownerSnapshot) {
                await abortForAccountChange()
                return
            }
            fail("Join the call before changing your microphone.", technical: "Mute was requested without an active provider room.")
            return
        }

        do {
            try await room.localParticipant.setMicrophone(enabled: !muted)
            guard AuthManager.shared.matchesStableOwnerSnapshot(activeOwnerSnapshot) else {
                await abortForAccountChange()
                return
            }
            isMuted = muted
            refreshCallAudioMeterLifecycle()
            statusText = muted ? "Provider microphone muted." : "Provider microphone live. Quipsly recording is still separate."
        } catch {
            fail("Your microphone couldn't change. Try again.", technical: error.localizedDescription)
        }
        #else
        fail("Microphone controls aren't available in this build.", technical: "Mute controls require the LiveKit SDK build.")
        #endif
    }

    /// Publishes the same camera frames that feed Quipsly's local preview and
    /// retained movie. This deliberately does not call LiveKit's `setCamera`:
    /// that convenience API would open a second AVCaptureSession and compete
    /// with the production master for the physical camera.
    func publishSharedCamera(
        from source: VideoCaptureController,
        profile: VideoCaptureResolvedProfile
    ) async {
        #if canImport(LiveKit)
        guard isConnected,
              let ownerSnapshot = activeOwnerSnapshot,
              AuthManager.shared.matchesStableOwnerSnapshot(ownerSnapshot) else {
            fail("Join the call before turning on your camera.", technical: "Shared camera publication was requested without an authenticated provider room.")
            return
        }
        guard !isChangingLocalVideo else { return }
        if isLocalVideoPublished { return }

        isChangingLocalVideo = true
        lastError = nil
        lastTechnicalError = nil
        localVideoStatus = "Starting camera…"
        defer { isChangingLocalVideo = false }

        let presentationIsPortrait = profile.presentationOrientation == "portrait"
        let liveDimensions = Dimensions(
            width: presentationIsPortrait ? 720 : 1_280,
            height: presentationIsPortrait ? 1_280 : 720
        )
        let options = BufferCaptureOptions(
            dimensions: liveDimensions,
            fps: min(24, max(15, Int(profile.framesPerSecond.rounded())))
        )
        let track = LocalVideoTrack.createBufferTrack(
            name: "quipsly-camera",
            source: .camera,
            options: options,
            reportStatistics: true
        )
        guard let capturer = track.capturer as? BufferCapturer else {
            fail("Your camera couldn't start. Try again.", technical: "LiveKit did not expose the custom BufferCapturer for the Quipsly camera track.")
            localVideoStatus = "Camera needs attention"
            return
        }
        let bridge = ProviderRoomVideoFrameBridge(capturer: capturer)
        localVideoTrack = track
        localVideoFrameBridge = bridge
        localVideoSource = source
        source.setLiveVideoFrameConsumer(bridge)

        do {
            let publication = try await room.localParticipant.publish(
                videoTrack: track,
                options: VideoPublishOptions(
                    name: "quipsly-camera",
                    simulcast: true,
                    degradationPreference: .maintainFramerate
                )
            )
            guard AuthManager.shared.matchesStableOwnerSnapshot(ownerSnapshot),
                  room.connectionState == .connected || room.connectionState == .reconnecting else {
                source.setLiveVideoFrameConsumer(nil)
                try? await room.localParticipant.unpublish(publication: publication)
                clearLocalVideoBridge()
                return
            }
            localVideoPublication = publication
            isLocalVideoPublished = true
            localVideoStatus = "Camera on · local master stays separate"
            statusText = "Camera is live. Recording still starts separately."
        } catch {
            source.setLiveVideoFrameConsumer(nil)
            clearLocalVideoBridge()
            localVideoStatus = "Camera needs attention"
            fail("Your camera couldn't start. Try again.", technical: error.localizedDescription)
        }
        #else
        fail("Camera calls aren't available in this build.", technical: "LiveKit is not linked into this app build.")
        #endif
    }

    func unpublishSharedCamera() async {
        #if canImport(LiveKit)
        guard !isChangingLocalVideo else { return }
        isChangingLocalVideo = true
        localVideoStatus = "Turning camera off…"
        localVideoSource?.setLiveVideoFrameConsumer(nil)
        let publication = localVideoPublication
        clearLocalVideoBridge(finishesTransition: false)
        if let publication, room.connectionState != .disconnected {
            do {
                try await room.localParticipant.unpublish(publication: publication)
            } catch {
                lastTechnicalError = "Camera unpublish failed after the local frame bridge was safely detached: \(error.localizedDescription)"
            }
        }
        isChangingLocalVideo = false
        localVideoStatus = "Camera off"
        if isConnected {
            statusText = "Camera off. You are still in the call."
        }
        #else
        isLocalVideoPublished = false
        isChangingLocalVideo = false
        localVideoStatus = "Camera off"
        #endif
    }

    func publishEpisodeWatchHint(_ hint: MobileEpisodeWatchLiveHint) async {
        #if canImport(LiveKit)
        guard isConnected,
              hint.hasValidShape,
              hint.callRoomId == activeCallRoomID,
              hint.receiptId != lastPublishedEpisodeWatchReceiptID,
              let ownerSnapshot = activeOwnerSnapshot,
              AuthManager.shared.matchesStableOwnerSnapshot(ownerSnapshot),
              let data = try? JSONEncoder().encode(hint) else { return }
        do {
            let options = DataPublishOptions(
                topic: MobileEpisodeWatchLiveHint.topic,
                reliable: true
            )
            try await room.localParticipant.publish(data: data, options: options)
            lastPublishedEpisodeWatchReceiptID = hint.receiptId
        } catch {
            // HTTPS room polling remains authoritative when transient room data fails.
        }
        #endif
    }

    func publishChatPersistedHint(_ hint: MobileChatPersistedLiveHint) async {
        #if canImport(LiveKit)
        guard isConnected,
              hint.hasValidShape,
              activeChatThreadKeys.contains(hint.threadKey),
              hint.messageId != lastPublishedChatMessageID,
              let ownerSnapshot = activeOwnerSnapshot,
              AuthManager.shared.matchesStableOwnerSnapshot(ownerSnapshot),
              let data = try? JSONEncoder().encode(hint),
              data.count <= 2_048 else { return }
        do {
            let options = DataPublishOptions(
                topic: MobileChatPersistedLiveHint.topic,
                reliable: true
            )
            try await room.localParticipant.publish(data: data, options: options)
            lastPublishedChatMessageID = hint.messageId
        } catch {
            // Authenticated Nest polling remains authoritative.
        }
        #endif
    }

    func disconnect() async {
        #if canImport(LiveKit)
        await unpublishSharedCamera()
        guard isConnected || isConnecting else {
            stopCallAudioMeter()
            statusText = "Provider room already disconnected."
            await endNativeCallPresentation(reason: .remoteEnded)
            audioSessionCoordinator.providerDidDisconnect()
            usesCallAudio = false
            activeOwnerSnapshot = nil
            clearEpisodeWatchBridge()
            return
        }

        stopCallAudioMeter()
        await room.disconnect()
        clearLocalVideoBridge()
        await endNativeCallPresentation(reason: .remoteEnded)
        audioSessionCoordinator.providerDidDisconnect()
        isConnecting = false
        isConnected = false
        isReconnecting = false
        isMuted = true
        usesCallAudio = false
        remoteParticipantCount = 0
        clearRemoteVideoTrack()
        activeRoomName = nil
        activeOwnerSnapshot = nil
        clearEpisodeWatchBridge()
        connectionStateLabel = "Disconnected"
        statusText = "Provider room disconnected. Local upload and transcript work can continue."
        #else
        await endNativeCallPresentation(reason: .remoteEnded)
        audioSessionCoordinator.providerDidDisconnect()
        isConnected = false
        isConnecting = false
        isReconnecting = false
        isMuted = true
        usesCallAudio = false
        activeOwnerSnapshot = nil
        clearEpisodeWatchBridge()
        connectionStateLabel = "Disconnected"
        statusText = "Provider SDK unavailable. Local upload and transcript work can continue."
        #endif
    }

    func refreshState() {
        #if canImport(LiveKit)
        isConnected = room.connectionState == .connected || room.connectionState == .reconnecting
        isReconnecting = room.connectionState == .reconnecting
        connectionStateLabel = "\(room.connectionState)".capitalized
        remoteParticipantCount = room.remoteParticipants.count
        refreshRemoteVideoTrack()
        activeRoomName = room.name ?? activeRoomName
        #else
        isConnected = false
        isReconnecting = false
        connectionStateLabel = "SDK unavailable"
        remoteParticipantCount = 0
        providerRuntimeAvailable = ProviderRoomRuntime.liveKitSDKAvailable
        providerRuntimeLabel = ProviderRoomRuntime.liveKitLabel
        providerRuntimeDetail = ProviderRoomRuntime.liveKitDetail
        #endif
    }

    private func fail(_ message: String, technical: String? = nil) {
        isConnecting = false
        if !isConnected {
            stopCallAudioMeter()
            isReconnecting = false
            usesCallAudio = false
            activeOwnerSnapshot = nil
            clearEpisodeWatchBridge()
            clearRemoteVideoTrack()
            clearLocalVideoBridge()
        }
        lastError = message
        lastTechnicalError = technical
        statusText = message
        connectionStateLabel = isConnected ? "Connected" : "Needs attention"
    }

    private func startNativeCallPresentation(session: MobileCaptureSession, join: MobileCaptureRoomJoinResponse) async -> Bool {
        if activeCallUUID != nil {
            nativeCallPresentationLabel = "CallKit active"
            return true
        }

        let uuid = UUID()
        let handleValue = join.roomName ?? session.displayTitle
        let handle = CXHandle(type: .generic, value: handleValue)
        let action = CXStartCallAction(call: uuid, handle: handle)
        action.isVideo = false
        let transaction = CXTransaction(action: action)

        do {
            try await requestCallKitTransaction(transaction)
            activeCallUUID = uuid
            activeCallUUIDString = uuid.uuidString
            isNativeCallPresentationActive = true
            nativeCallPresentationLabel = "CallKit connecting"
            callKitProvider.reportOutgoingCall(with: uuid, startedConnectingAt: Date())
            return true
        } catch {
            nativeCallPresentationLabel = "CallKit unavailable"
            lastTechnicalError = "Native call presentation failed: \(error.localizedDescription)"
            return false
        }
    }

    private func reportNativeCallConnected() {
        guard let activeCallUUID else {
            nativeCallPresentationLabel = "Provider connected without CallKit"
            return
        }
        callKitProvider.reportOutgoingCall(with: activeCallUUID, connectedAt: Date())
        nativeCallPresentationLabel = "CallKit live"
        isNativeCallPresentationActive = true
    }

    private func endNativeCallPresentation(reason: CXCallEndedReason) async {
        guard let uuid = activeCallUUID else {
            isNativeCallPresentationActive = false
            activeCallUUIDString = nil
            nativeCallPresentationLabel = "CallKit ready"
            return
        }

        let action = CXEndCallAction(call: uuid)
        let transaction = CXTransaction(action: action)
        _ = try? await requestCallKitTransaction(transaction)
        callKitProvider.reportCall(with: uuid, endedAt: Date(), reason: reason)
        clearNativeCallPresentation()
    }

    private func clearNativeCallPresentation() {
        activeCallUUID = nil
        activeCallUUIDString = nil
        isNativeCallPresentationActive = false
        nativeCallPresentationLabel = "CallKit ready"
    }

    private func clearEpisodeWatchBridge() {
        activeCallRoomID = nil
        lastPublishedEpisodeWatchReceiptID = nil
        latestEpisodeWatchHint = nil
        lastPublishedChatMessageID = nil
        latestChatPersistedHint = nil
        activeChatThreadKeys = []
    }

    #if canImport(LiveKit)
    private func clearLocalVideoBridge(finishesTransition: Bool = true) {
        localVideoSource?.setLiveVideoFrameConsumer(nil)
        localVideoSource = nil
        localVideoPublication = nil
        localVideoTrack = nil
        localVideoFrameBridge = nil
        isLocalVideoPublished = false
        if finishesTransition {
            isChangingLocalVideo = false
        }
        localVideoStatus = "Camera off"
    }
    #else
    private func clearLocalVideoBridge(finishesTransition: Bool = true) {
        isLocalVideoPublished = false
        if finishesTransition {
            isChangingLocalVideo = false
        }
        localVideoStatus = "Camera off"
    }
    #endif

    #if canImport(LiveKit)
    private func refreshRemoteVideoTrack() {
        for participant in room.remoteParticipants.values {
            if let track = participant.trackPublications.values
                .compactMap({ $0.track as? VideoTrack })
                .first {
                remoteVideoTrack = track
                let participantName = participant.name?
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                remoteVideoParticipantLabel = participantName?.isEmpty == false
                    ? participantName
                    : "Participant"
                hasRemoteVideo = true
                return
            }
        }
        clearRemoteVideoTrack()
    }

    private func clearRemoteVideoTrack() {
        remoteVideoTrack = nil
        remoteVideoParticipantLabel = nil
        hasRemoteVideo = false
    }
    #else
    private func clearRemoteVideoTrack() {
        remoteVideoParticipantLabel = nil
        hasRemoteVideo = false
    }
    #endif

    private func requestCallKitTransaction(_ transaction: CXTransaction) async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            callController.request(transaction) { error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume()
                }
            }
        }
    }

    private func waitForCallAudioActivation(
        expectedOwnerSnapshot: AuthManager.StableOwnerSnapshot,
        timeout: TimeInterval = 8
    ) async -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while activeCallUUID != nil,
              !isCallAudioSessionActive,
              Date() < deadline,
              AuthManager.shared.matchesStableOwnerSnapshot(expectedOwnerSnapshot) {
            try? await Task.sleep(nanoseconds: 100_000_000)
        }
        return activeCallUUID != nil
            && isCallAudioSessionActive
            && AuthManager.shared.matchesStableOwnerSnapshot(expectedOwnerSnapshot)
    }

    /// Keeps one transient confidence signal attached to the exact LiveKit
    /// microphone path. This lifecycle is independent from retained recording
    /// and never writes or uploads PCM.
    private func refreshCallAudioMeterLifecycle() {
        #if canImport(LiveKit)
        guard isConnected, !isMuted else {
            stopCallAudioMeter()
            callAudioHealth = isConnected && isMuted ? .muted : .checking
            return
        }

        callAudioAveragePowerDBFS = -160
        callAudioPeakPowerDBFS = -160
        callAudioReceivedPCMAt = nil
        callAudioHealth = .checking
        callAudioMeter?.start()
        callAudioWatchdogTask?.cancel()
        callAudioWatchdogTask = Task { @MainActor [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 500_000_000)
                guard !Task.isCancelled, let self else { return }
                self.refreshCallAudioHealth(now: Date())
            }
        }
        #else
        callAudioHealth = isMuted ? .muted : .checking
        #endif
    }

    private func receiveCallAudioLevels(
        _ levels: ProviderAudioPCMLevelSnapshot,
        receivedAt: Date
    ) {
        guard isConnected, !isMuted else { return }
        callAudioAveragePowerDBFS = levels.averagePowerDBFS
        callAudioPeakPowerDBFS = levels.peakPowerDBFS
        callAudioReceivedPCMAt = receivedAt
        refreshCallAudioHealth(now: receivedAt)
    }

    private func refreshCallAudioHealth(now: Date) {
        callAudioHealth = ProviderRoomCallAudioEvidence.resolve(
            isConnected: isConnected,
            isMuted: isMuted,
            averagePowerDBFS: callAudioAveragePowerDBFS,
            peakPowerDBFS: callAudioPeakPowerDBFS,
            receivedPCMAt: callAudioReceivedPCMAt,
            now: now
        )
    }

    private func stopCallAudioMeter() {
        #if canImport(LiveKit)
        callAudioWatchdogTask?.cancel()
        callAudioWatchdogTask = nil
        callAudioMeter?.stop()
        #endif
        callAudioAveragePowerDBFS = -160
        callAudioPeakPowerDBFS = -160
        callAudioReceivedPCMAt = nil
        callAudioHealth = isConnected && isMuted ? .muted : .checking
    }

    private var accountChangedMessage: String {
        "The Quipsly account changed while the provider room was connecting. Quipsly left the room so another account cannot inherit its join token."
    }

    private func abortForAccountChange() async {
        stopCallAudioMeter()
        #if canImport(LiveKit)
        localVideoSource?.setLiveVideoFrameConsumer(nil)
        await room.disconnect()
        clearLocalVideoBridge()
        #endif
        await endNativeCallPresentation(reason: .failed)
        try? audioSessionCoordinator.callKitDidDeactivate()
        audioSessionCoordinator.providerDidDisconnect()
        activeOwnerSnapshot = nil
        clearEpisodeWatchBridge()
        isCallAudioSessionActive = false
        callAudioSessionLabel = "Call audio idle"
        isConnecting = false
        isConnected = false
        isReconnecting = false
        isMuted = true
        usesCallAudio = false
        remoteParticipantCount = 0
        clearRemoteVideoTrack()
        activeRoomName = nil
        connectionStateLabel = "Disconnected"
        lastError = "Your Quipsly account changed, so the call ended safely. Join again with the current account."
        lastTechnicalError = accountChangedMessage
        statusText = lastError ?? "The call ended safely."
    }

    private func abortAfterCallAudioActivationFailure(_ error: Error) async {
        let technicalMessage = "Provider audio could not activate safely, so Quipsly left the room instead of showing a silent connection: \(error.localizedDescription)"
        stopCallAudioMeter()
        #if canImport(LiveKit)
        localVideoSource?.setLiveVideoFrameConsumer(nil)
        await room.disconnect()
        clearLocalVideoBridge()
        #endif
        await endNativeCallPresentation(reason: .failed)
        try? audioSessionCoordinator.callKitDidDeactivate()
        audioSessionCoordinator.providerDidDisconnect()
        isCallAudioSessionActive = false
        callAudioSessionLabel = "Call audio needs attention"
        isConnecting = false
        isConnected = false
        isReconnecting = false
        isMuted = true
        usesCallAudio = false
        remoteParticipantCount = 0
        clearRemoteVideoTrack()
        activeRoomName = nil
        activeOwnerSnapshot = nil
        clearEpisodeWatchBridge()
        connectionStateLabel = "Needs attention"
        lastError = "Call audio stopped working, so Quipsly left the call. Try joining again."
        lastTechnicalError = technicalMessage
        statusText = lastError ?? "The call ended safely."
    }

    deinit {
        #if canImport(LiveKit)
        callAudioWatchdogTask?.cancel()
        callAudioMeter?.stop()
        #endif
        if let accountObserver {
            NotificationCenter.default.removeObserver(accountObserver)
        }
    }
}

extension ProviderRoomController: CXProviderDelegate {
    nonisolated func providerDidReset(_ provider: CXProvider) {
        Task { @MainActor in
            #if canImport(LiveKit)
            self.localVideoSource?.setLiveVideoFrameConsumer(nil)
            if self.isConnected || self.isConnecting {
                await self.room.disconnect()
            }
            self.clearLocalVideoBridge()
            #endif
            self.stopCallAudioMeter()
            self.clearNativeCallPresentation()
            try? self.audioSessionCoordinator.callKitDidDeactivate()
            self.audioSessionCoordinator.providerDidDisconnect()
            self.isConnected = false
            self.isConnecting = false
            self.isReconnecting = false
            self.isMuted = true
            self.usesCallAudio = false
            self.isCallAudioSessionActive = false
            self.callAudioSessionLabel = "Call audio idle"
            self.connectionStateLabel = "Disconnected"
            self.activeOwnerSnapshot = nil
            self.clearEpisodeWatchBridge()
            self.statusText = "CallKit reset the native call surface. Quipsly recording truth remains separate."
        }
    }

    nonisolated func provider(_ provider: CXProvider, perform action: CXStartCallAction) {
        action.fulfill()
    }

    nonisolated func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        Task { @MainActor in
            // Fulfill the system-owned action promptly. Local source protection
            // starts before provider disconnect; CallKit may deactivate its
            // audio lease independently while the already-issued recorder stop
            // finishes closing durable bytes.
            action.fulfill()
            let localSourceProtected = await self.protectLocalSourceBeforeNativeCallEnd?() ?? true
            #if canImport(LiveKit)
            self.localVideoSource?.setLiveVideoFrameConsumer(nil)
            if self.isConnected || self.isConnecting {
                await self.room.disconnect()
            }
            self.clearLocalVideoBridge()
            #endif
            self.stopCallAudioMeter()
            self.clearNativeCallPresentation()
            self.audioSessionCoordinator.providerDidDisconnect()
            self.isConnected = false
            self.isConnecting = false
            self.isReconnecting = false
            self.isMuted = true
            self.usesCallAudio = false
            self.activeOwnerSnapshot = nil
            self.clearEpisodeWatchBridge()
            self.connectionStateLabel = "Disconnected"
            self.statusText = localSourceProtected
                ? "Native call ended. This iPhone's local source is protected; upload and transcript work can continue."
                : "Native call ended. This iPhone is still closing its local source; keep Quipsly open until Library shows the result."
        }
    }

    nonisolated func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
        Task { @MainActor in
            guard self.activeCallUUID != nil else {
                try? self.audioSessionCoordinator.callKitDidDeactivate()
                self.isCallAudioSessionActive = false
                self.callAudioSessionLabel = "Call audio idle"
                return
            }
            do {
                try self.audioSessionCoordinator.callKitDidActivate(audioSession)
                self.isCallAudioSessionActive = true
                self.callAudioSessionLabel = "Call audio active"
                self.statusText = self.isConnected
                    ? "Provider room audio is active. Recording remains a separate explicit Quipsly action."
                    : "CallKit audio is active while provider media connects."
            } catch {
                await self.abortAfterCallAudioActivationFailure(error)
            }
        }
    }

    nonisolated func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
        Task { @MainActor in
            do {
                try self.audioSessionCoordinator.callKitDidDeactivate()
            } catch {
                self.lastTechnicalError = "Provider audio could not deactivate cleanly: \(error.localizedDescription)"
            }
            self.isCallAudioSessionActive = false
            self.callAudioSessionLabel = "Call audio idle"
        }
    }
}

#if canImport(LiveKit)
extension ProviderRoomController: RoomDelegate {
    nonisolated func room(
        _ room: Room,
        didUpdateConnectionState connectionState: ConnectionState,
        from oldConnectionState: ConnectionState
    ) {
        Task { @MainActor in
            self.connectionStateLabel = "\(connectionState)".capitalized
            self.remoteParticipantCount = room.remoteParticipants.count
            self.activeRoomName = room.name ?? self.activeRoomName

            switch connectionState {
            case .connected:
                guard let ownerSnapshot = self.activeOwnerSnapshot,
                      AuthManager.shared.matchesStableOwnerSnapshot(ownerSnapshot) else {
                    await self.abortForAccountChange()
                    return
                }
                let recovered = self.isReconnecting
                self.isConnecting = false
                self.isConnected = true
                self.isReconnecting = false
                self.lastError = nil
                self.lastTechnicalError = nil
                if recovered {
                    self.statusText = "Reconnected."
                }
                self.refreshCallAudioMeterLifecycle()
            case .reconnecting:
                self.isConnecting = false
                self.isConnected = true
                self.isReconnecting = true
                self.lastError = nil
                self.lastTechnicalError = nil
                self.connectionStateLabel = "Reconnecting"
                self.statusText = "Reconnecting…"
            case .disconnected:
                self.stopCallAudioMeter()
                self.clearLocalVideoBridge()
                self.isConnecting = false
                self.isConnected = false
                self.isReconnecting = false
                self.isMuted = true
                self.usesCallAudio = false
                self.remoteParticipantCount = 0
                self.audioSessionCoordinator.providerDidDisconnect()
                await self.endNativeCallPresentation(reason: .remoteEnded)
                self.activeOwnerSnapshot = nil
                self.clearEpisodeWatchBridge()
                self.clearRemoteVideoTrack()
                self.statusText = "Provider room disconnected. Local recording and preserved uploads remain separate."
            default:
                self.isConnecting = true
                self.isReconnecting = false
            }
        }
    }

    nonisolated func room(_ room: Room, participantDidConnect participant: RemoteParticipant) {
        Task { @MainActor in
            self.remoteParticipantCount = room.remoteParticipants.count
            self.refreshRemoteVideoTrack()
        }
    }

    nonisolated func room(_ room: Room, participantDidDisconnect participant: RemoteParticipant) {
        Task { @MainActor in
            self.remoteParticipantCount = room.remoteParticipants.count
            self.refreshRemoteVideoTrack()
        }
    }

    nonisolated func room(
        _ room: Room,
        participant: RemoteParticipant,
        didSubscribeTrack publication: RemoteTrackPublication
    ) {
        Task { @MainActor in
            self.remoteParticipantCount = room.remoteParticipants.count
            self.refreshRemoteVideoTrack()
        }
    }

    nonisolated func room(
        _ room: Room,
        participant: RemoteParticipant,
        didUnsubscribeTrack publication: RemoteTrackPublication
    ) {
        Task { @MainActor in
            self.remoteParticipantCount = room.remoteParticipants.count
            self.refreshRemoteVideoTrack()
        }
    }

    nonisolated func room(
        _ room: Room,
        participant: RemoteParticipant?,
        didReceiveData data: Data,
        forTopic topic: String,
        encryptionType: EncryptionType
    ) {
        if topic == MobileChatPersistedLiveHint.topic {
            Task { @MainActor in
                guard let hint = MobileChatPersistedLiveHint.decodeStrict(data),
                      self.activeChatThreadKeys.contains(hint.threadKey) else { return }
                self.latestChatPersistedHint = hint
            }
            return
        }
        guard topic == "quipsly.episode-watch.authority.v1" else { return }
        Task { @MainActor in
            guard let hint = try? JSONDecoder().decode(
                MobileEpisodeWatchLiveHint.self,
                from: data
            ), hint.hasValidShape else { return }
            guard hint.callRoomId == self.activeCallRoomID else { return }
            self.latestEpisodeWatchHint = hint
        }
    }
}
#endif

struct ProviderRemoteVideoSurface: View {
    @ObservedObject var controller: ProviderRoomController

    var body: some View {
        #if canImport(LiveKit)
        if let track = controller.remoteVideoTrack {
            ZStack(alignment: .bottomLeading) {
                SwiftUIVideoView(track, layoutMode: .fill)
                    .background(Color.black)

                Text(controller.remoteVideoParticipantLabel ?? "Participant")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 7)
                    .background(.black.opacity(0.62), in: Capsule())
                    .padding(10)
            }
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Video from \(controller.remoteVideoParticipantLabel ?? "participant")")
            .accessibilityIdentifier("CaptureRemoteCallVideo")
        }
        #else
        EmptyView()
        #endif
    }
}
