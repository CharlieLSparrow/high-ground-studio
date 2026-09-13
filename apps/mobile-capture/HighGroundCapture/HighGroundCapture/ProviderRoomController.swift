import Combine
import AVFoundation
import CallKit
import Foundation
import OSLog
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

struct ProviderCallParticipant: Identifiable, Equatable {
    let id: String
    let name: String
    let microphoneEnabled: Bool
    let isSpeaking: Bool
    let hasVideo: Bool
    var endpoint: ProviderRoomEndpointIdentity? = nil
    var isLocal = false

    var personKey: String { endpoint?.personKey ?? "endpoint:\(id)" }
}

struct ProviderCallPerson: Identifiable {
    let id: String
    let name: String
    let devices: [ProviderCallParticipant]
}

@MainActor
final class ProviderRoomController: NSObject, ObservableObject {
    private static let callLog = Logger(subsystem: "com.highgroundodyssey.HighGroundCapture", category: "CallLifecycle")
    /// CallKit represents one process-level calling endpoint. SwiftUI may
    /// reconstruct view models while authenticated/offline roots transition;
    /// sharing this controller prevents disposable CXProvider registrations
    /// from occurring inside a view update and keeps one authoritative call.
    static let shared = ProviderRoomController()

    @Published var statusText = "Provider room idle"
    @Published var connectionStateLabel = "Disconnected"
    @Published var isConnecting = false
    @Published var isConnected = false
    @Published var isReconnecting = false
    @Published private(set) var rejoinableCallRoomID: String?
    @Published private(set) var permanentlyClosedCallRoomID: String?
    @Published var isMuted = true
    @Published private(set) var usesCallAudio = false
    @Published var isNativeCallPresentationActive = false
    @Published var nativeCallPresentationLabel = "CallKit ready"
    @Published var remoteParticipantCount = 0 {
        didSet {
            if remoteParticipantCount == 0 { remoteParticipants = [] }
        }
    }
    @Published private(set) var remoteParticipants: [ProviderCallParticipant] = []
    @Published private(set) var localEndpoint: ProviderRoomEndpointIdentity?

    var peopleInCall: [ProviderCallPerson] {
        let local = ProviderCallParticipant(id: "local", name: "You",
            microphoneEnabled: usesCallAudio && !isMuted, isSpeaking: false,
            hasVideo: isLocalVideoPublished, endpoint: localEndpoint, isLocal: true)
        return Dictionary(grouping: remoteParticipants + [local], by: \.personKey)
            .map { key, devices in
                ProviderCallPerson(id: key, name: devices.contains(where: \.isLocal) ? "You" : devices[0].name,
                    devices: devices.sorted { $0.id < $1.id })
            }.sorted { $0.name == $1.name ? $0.id < $1.id : $0.name.localizedStandardCompare($1.name) == .orderedAscending }
    }

    var participantPresenceLabel: String {
        ProviderRoomParticipantPresence.label(personKeys:
            [localEndpoint?.personKey ?? "local"] + remoteParticipants.map(\.personKey))
    }

    func participantDisplayName(_ participant: ProviderCallParticipant) -> String {
        let ownDevice = participant.personKey == localEndpoint?.personKey
        let count = remoteParticipants.filter { $0.personKey == participant.personKey }.count + (ownDevice ? 1 : 0)
        let name = ownDevice ? "You" : participant.name
        return count > 1 ? "\(name) · \(participant.endpoint?.deviceLabel ?? "Device")" : name
    }
    @Published private(set) var hasRemoteVideo = false
    @Published private(set) var remoteVideoReceiveError: String?
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
    var onCallTransportInterrupted: ((Date) -> Void)?
    var onCallTransportRestored: ((Date) -> Void)?

    func isPermanentlyClosed(callRoomID: String) -> Bool {
        permanentlyClosedCallRoomID == callRoomID
    }

    func canRejoin(callRoomID: String) -> Bool {
        rejoinableCallRoomID == callRoomID
    }

    func markCallPermanentlyClosed(callRoomID: String) {
        rejoinableCallRoomID = nil
        permanentlyClosedCallRoomID = callRoomID
        connectionStateLabel = "Call ended"
        statusText = "This Session is closed. Your local recording remains separate and protected."
    }

    #if DEBUG && targetEnvironment(simulator)
    func loadRejoinPreview(callRoomID: String) {
        activeCallRoomID = callRoomID
        rejoinableCallRoomID = callRoomID
        permanentlyClosedCallRoomID = nil
        isConnecting = false
        isConnected = false
        isReconnecting = false
        isMuted = true
        usesCallAudio = false
        connectionStateLabel = "Disconnected"
        statusText = "The call disconnected. Your recording is still protected on \(CaptureDeviceVocabulary.thisDevice). Tap Rejoin call when ready."
        lastError = nil
        lastTechnicalError = nil
    }
    #endif

    private let callKitProvider: CXProvider
    private let callController = CXCallController()
    private let audioSessionCoordinator = CaptureAudioSessionCoordinator.shared
    private var activeCallUUID: UUID?
    private var callLifecycle = CaptureCallLifecycle()
    private var intentionalProviderDisconnect = false
    private var activeOwnerSnapshot: AuthManager.StableOwnerSnapshot?
    private var accountObserver: NSObjectProtocol?
    private var activeCallRoomID: String?
    private var lastFailureWasMicrophonePermission = false
    private var lastPublishedEpisodeWatchReceiptID: String?
    private var lastPublishedChatMessageID: String?
    private var activeChatThreadKeys: Set<String> = []

    #if canImport(LiveKit)
    private let room = Room()
    @Published fileprivate var remoteVideoTrack: VideoTrack?
    fileprivate var remoteVideoTracks: [String: VideoTrack] = [:]
    private var localVideoTrack: LocalVideoTrack?
    private var localVideoPublication: LocalTrackPublication?
    private var localVideoFrameBridge: ProviderRoomVideoFrameBridge?
    private weak var localVideoSource: VideoCaptureController?
    private var callAudioMeter: ProviderRoomCallAudioMeter?
    private var callAudioWatchdogTask: Task<Void, Never>?
    #endif

    private override init() {
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

    /// iOS remembers this system decision. Quipsly asks only from an explicit
    /// action that will publish the microphone. Joining muted can subscribe to
    /// call audio without prompting; Unmute becomes the permission boundary.
    private func prepareMicrophonePermission(action: String) async -> Bool {
        switch AVAudioApplication.shared.recordPermission {
        case .granted:
            lastFailureWasMicrophonePermission = false
            lastError = nil
            lastTechnicalError = nil
            return true
        case .denied:
            failMicrophonePermission(
                "Allow microphone access in Settings to \(action)."
            )
            return false
        case .undetermined:
            let wasConnected = isConnected
            isConnecting = true
            lastError = nil
            connectionStateLabel = "Checking microphone"
            statusText = "Allow microphone access to \(action). Quipsly will remember the device setting."
            let allowed = await withCheckedContinuation { continuation in
                AVAudioApplication.requestRecordPermission { granted in
                    continuation.resume(returning: granted)
                }
            }
            isConnecting = false
            if allowed {
                lastFailureWasMicrophonePermission = false
                connectionStateLabel = wasConnected ? "Connected" : "Ready"
                statusText = wasConnected ? "Microphone ready to unmute." : "Microphone ready."
                lastTechnicalError = nil
                return true
            }
            failMicrophonePermission(
                "Allow microphone access in Settings to \(action)."
            )
            return false
        @unknown default:
            failMicrophonePermission(
                "Microphone access is unavailable. Check Quipsly in Settings, then try again."
            )
            return false
        }
    }

    func prepareMicrophonePermissionForJoin() async -> Bool {
        await prepareMicrophonePermission(action: "join with your microphone on")
    }

    /// Reconciles the call's visible microphone truth after iOS Settings
    /// changes without joining, leaving, or touching a retained local source.
    /// Only a permission-specific error is cleared after recovery.
    func refreshPermissionReadinessSnapshot() async {
        switch AVAudioApplication.shared.recordPermission {
        case .granted:
            guard lastFailureWasMicrophonePermission else { return }
            lastFailureWasMicrophonePermission = false
            lastError = nil
            lastTechnicalError = nil
            if isConnected {
                connectionStateLabel = isReconnecting ? "Reconnecting" : "Connected"
                statusText = isMuted
                    ? "Microphone ready. Tap Unmute when you want to speak."
                    : "Call microphone live. Recording still starts separately."
            } else if !isConnecting {
                connectionStateLabel = "Ready"
                statusText = "Microphone ready."
            }
        case .denied:
            guard isConnected, usesCallAudio, !isMuted else { return }
            #if canImport(LiveKit)
            _ = try? await room.localParticipant.setMicrophone(enabled: false)
            #endif
            isMuted = true
            refreshCallAudioMeterLifecycle()
            connectionStateLabel = isReconnecting ? "Reconnecting" : "Connected"
            statusText = "Microphone off. You are still in the call."
        case .undetermined:
            break
        @unknown default:
            break
        }
    }

    func connect(
        using join: MobileCaptureRoomJoinResponse?,
        session: MobileCaptureSession,
        expectedOwnerSnapshot: AuthManager.StableOwnerSnapshot,
        useCallAudio: Bool = true,
        joinMuted: Bool = false
    ) async {
        #if canImport(LiveKit)
        guard !isConnecting, !isConnected else { return }
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
        guard let connectionID = callLifecycle.beginConnection() else { return }
        defer { callLifecycle.finishConnection(connectionID) }
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
        rejoinableCallRoomID = nil
        intentionalProviderDisconnect = false
        if permanentlyClosedCallRoomID != session.callRoomId {
            permanentlyClosedCallRoomID = nil
        }
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
        guard callLifecycle.isCurrentConnection(connectionID) else { return }
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
        guard callLifecycle.isCurrentConnection(connectionID) else { return }
        guard AuthManager.shared.matchesStableOwnerSnapshot(expectedOwnerSnapshot) else {
            await abortForAccountChange()
            return
        }
        guard !useCallAudio || callAudioActivated else {
            // A rejected start action or failed activation may already explain
            // this result. Keep that cause instead of replacing it with a
            // misleading timeout after teardown clears the active call.
            let activationFailure = lastTechnicalError
                ?? "CallKit did not activate the room audio session before timeout."
            Self.callLog.error("Call audio did not become available; ending outgoing call")
            await endNativeCallPresentation(reason: .failed)
            try? audioSessionCoordinator.callKitDidDeactivate()
            audioSessionCoordinator.providerDidDisconnect()
            usesCallAudio = false
            fail("Call audio couldn't start. Try again, or record without joining.", technical: activationFailure)
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
            guard callLifecycle.isCurrentConnection(connectionID) else { return }
            guard AuthManager.shared.matchesStableOwnerSnapshot(expectedOwnerSnapshot) else {
                await abortForAccountChange()
                return
            }
            // A companion never sends or receives call audio. Selective video
            // subscription below still lets it see the conversation without
            // claiming the microphone or creating speaker echo.
            try await room.localParticipant.setMicrophone(
                enabled: useCallAudio && !joinMuted
            )
            guard callLifecycle.isCurrentConnection(connectionID) else { return }
            guard AuthManager.shared.matchesStableOwnerSnapshot(expectedOwnerSnapshot) else {
                await abortForAccountChange()
                return
            }
            isMuted = !useCallAudio || joinMuted
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
                ? joinMuted
                    ? "Joined muted. Recording still starts separately."
                    : "Joined the call. Recording still starts separately."
                : "Joined as a second device. Call audio stays on your other device."
            // Keep all connection-state commits before this suspension point;
            // signing out while a subscription is in flight must not revive UI
            // state from the previous account when it returns.
            await receiveCompanionVideo()
            guard callLifecycle.isCurrentConnection(connectionID) else { return }
        } catch {
            guard callLifecycle.isCurrentConnection(connectionID) else { return }
            let teardownID = callLifecycle.beginTeardown()
            defer { callLifecycle.finishTeardown(teardownID) }
            stopCallAudioMeter()
            rejoinableCallRoomID = nil
            intentionalProviderDisconnect = true
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
            fail("The call couldn't connect. Try joining again.", technical: error.localizedDescription)
        }

        isConnecting = false
        isReconnecting = false
        #else
        fail("Calls aren't available in this build. You can still record on \(CaptureDeviceVocabulary.thisDevice).", technical: "The LiveKit SDK is not linked into this app build.")
        #endif
    }

    func setMuted(
        _ muted: Bool,
        retainedRecordingContinues: Bool = false
    ) async {
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

        if !muted {
            guard await prepareMicrophonePermission(action: "speak in the call") else { return }
            guard AuthManager.shared.matchesStableOwnerSnapshot(activeOwnerSnapshot) else {
                await abortForAccountChange()
                return
            }
        }

        do {
            try await room.localParticipant.setMicrophone(enabled: !muted)
            guard AuthManager.shared.matchesStableOwnerSnapshot(activeOwnerSnapshot) else {
                await abortForAccountChange()
                return
            }
            isMuted = muted
            refreshCallAudioMeterLifecycle()
            if retainedRecordingContinues {
                statusText = muted
                    ? "Microphone muted in the call and recording."
                    : "Microphone live in the call and recording."
            } else {
                statusText = muted
                    ? "Call muted."
                    : "Call microphone live. Recording still starts separately."
            }
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
        let teardownID = callLifecycle.beginTeardown()
        defer { callLifecycle.finishTeardown(teardownID) }
        rejoinableCallRoomID = nil
        intentionalProviderDisconnect = true
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
        lastFailureWasMicrophonePermission = false
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

    private func failMicrophonePermission(_ message: String) {
        fail(message)
        lastFailureWasMicrophonePermission = true
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

        // CallKit may perform/activate the call before request completion is
        // resumed. Reserve its identity first so that callback is not mistaken
        // for stale audio and immediately deactivated.
        activeCallUUID = uuid
        activeCallUUIDString = uuid.uuidString
        Self.callLog.info("Requesting outgoing call")
        do {
            try await requestCallKitTransaction(transaction)
            guard activeCallUUID == uuid else {
                callKitProvider.reportCall(with: uuid, endedAt: Date(), reason: .failed)
                return false
            }
            isNativeCallPresentationActive = true
            nativeCallPresentationLabel = "CallKit connecting"
            callKitProvider.reportOutgoingCall(with: uuid, startedConnectingAt: Date())
            Self.callLog.info("Outgoing call transaction accepted")
            return true
        } catch {
            guard activeCallUUID == uuid else { return false }
            clearNativeCallPresentation()
            nativeCallPresentationLabel = "CallKit unavailable"
            lastTechnicalError = "Native call presentation failed: \(error.localizedDescription)"
            Self.callLog.error("Outgoing call transaction rejected: \(error.localizedDescription, privacy: .public)")
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

    private func endNativeCallPresentation(
        reason: CXCallEndedReason,
        protectLocalSource: Bool = false
    ) async {
        let teardownID = callLifecycle.beginTeardown()
        defer { callLifecycle.finishTeardown(teardownID) }
        // Protection is app-owned work, not dependent on delivery of a future
        // CallKit action. It also applies to companion devices without a UUID.
        if protectLocalSource { _ = await protectLocalSourceBeforeNativeCallEnd?() }
        guard let uuid = activeCallUUID else {
            clearNativeCallPresentation()
            return
        }

        // The provider has already ended or failed. Report that fact, rather
        // than request a second end action that could arrive during rejoin.
        callKitProvider.reportCall(with: uuid, endedAt: Date(), reason: reason)
        clearNativeCallPresentation()
    }

    private func clearNativeCallPresentation() {
        activeCallUUID = nil
        activeCallUUIDString = nil
        isNativeCallPresentationActive = false
        nativeCallPresentationLabel = "CallKit ready"
        // A later join must wait for its own activation, not inherit the prior
        // call's true flag while CallKit's deactivation callback is in flight.
        isCallAudioSessionActive = false
        callAudioSessionLabel = "Call audio idle"
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
    /// Keep the phone/iPad useful beside another call-audio device. Never
    /// subscribe to audio here: received audio is played automatically by the
    /// SDK and would create echo even with this device's microphone muted.
    func receiveCompanionVideo() async {
        guard !usesCallAudio, isConnected, let callID = activeCallRoomID,
              let owner = activeOwnerSnapshot else { return }
        remoteVideoReceiveError = nil
        let publications = room.remoteParticipants.values.flatMap { $0.trackPublications.values }
            .compactMap { $0 as? RemoteTrackPublication }
            .filter { $0.kind == .video && !$0.isSubscribed }
        for publication in publications {
            guard !usesCallAudio, isConnected, activeCallRoomID == callID,
                  AuthManager.shared.matchesStableOwnerSnapshot(owner) else { return }
            do {
                try await publication.set(subscribed: true)
            } catch {
                guard activeCallRoomID == callID, AuthManager.shared.matchesStableOwnerSnapshot(owner) else { return }
                remoteVideoReceiveError = "Some live video couldn’t load."
                lastTechnicalError = "Companion video subscription: \(error.localizedDescription)"
            }
        }
    }

    private func refreshRemoteVideoTrack() {
        let local = ProviderRoomEndpointIdentity(endpointID: room.localParticipant.identity?.stringValue ?? "local",
            metadata: room.localParticipant.metadata)
        if localEndpoint != local { localEndpoint = local }
        // Names come from the authenticated room participants, never from the
        // list of invitees: an invitation is not proof someone has joined.
        var tracks: [String: VideoTrack] = [:]
        let participants = room.remoteParticipants.values.compactMap { participant -> ProviderCallParticipant? in
            guard let id = participant.identity?.stringValue ?? participant.sid?.stringValue else { return nil }
            let name = participant.name?.trimmingCharacters(in: .whitespacesAndNewlines)
            let track = participant.trackPublications.values
                .filter { !$0.isMuted }
                .sorted { $0.sid.stringValue < $1.sid.stringValue }
                .compactMap { $0.track as? VideoTrack }.first
            tracks[id] = track
            return ProviderCallParticipant(id: id, name: name.flatMap { $0.isEmpty ? nil : $0 } ?? "Participant",
                microphoneEnabled: participant.isMicrophoneEnabled(), isSpeaking: participant.isSpeaking,
                hasVideo: track != nil, endpoint: ProviderRoomEndpointIdentity(endpointID: id, metadata: participant.metadata))
        }.sorted { lhs, rhs in
            let order = lhs.name.localizedStandardCompare(rhs.name)
            return order == .orderedSame ? lhs.id < rhs.id : order == .orderedAscending
        }
        // Track identity and tile identity survive speaking/mute updates. A
        // dictionary's iteration order must never decide which person is seen.
        remoteVideoTracks = tracks
        if remoteParticipants != participants { remoteParticipants = participants }
        let firstVideo = participants.first(where: \.hasVideo)
        remoteVideoTrack = firstVideo.flatMap { tracks[$0.id] }
        remoteVideoParticipantLabel = firstVideo?.name
        hasRemoteVideo = firstVideo != nil
    }

    private func clearRemoteVideoTrack() {
        localEndpoint = nil
        remoteVideoReceiveError = nil
        remoteVideoTracks = [:]
        remoteVideoTrack = nil
        remoteVideoParticipantLabel = nil
        hasRemoteVideo = false
    }
    #else
    func receiveCompanionVideo() async {}

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
        let teardownID = callLifecycle.beginTeardown()
        defer { callLifecycle.finishTeardown(teardownID) }
        stopCallAudioMeter()
        rejoinableCallRoomID = nil
        intentionalProviderDisconnect = true
        #if canImport(LiveKit)
        localVideoSource?.setLiveVideoFrameConsumer(nil)
        await room.disconnect()
        clearLocalVideoBridge()
        #endif
        await endNativeCallPresentation(reason: .failed, protectLocalSource: true)
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
        let teardownID = callLifecycle.beginTeardown()
        defer { callLifecycle.finishTeardown(teardownID) }
        let technicalMessage = "Provider audio could not activate safely, so Quipsly left the room instead of showing a silent connection: \(error.localizedDescription)"
        stopCallAudioMeter()
        rejoinableCallRoomID = nil
        intentionalProviderDisconnect = true
        #if canImport(LiveKit)
        localVideoSource?.setLiveVideoFrameConsumer(nil)
        await room.disconnect()
        clearLocalVideoBridge()
        #endif
        await endNativeCallPresentation(reason: .failed, protectLocalSource: true)
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
            let teardownID = self.callLifecycle.beginTeardown()
            defer { self.callLifecycle.finishTeardown(teardownID) }
            let resetCallRoomID = self.activeCallRoomID
            let shouldAllowRejoin = resetCallRoomID != nil
                && self.permanentlyClosedCallRoomID != resetCallRoomID
            // Treat the SDK disconnect as cleanup for this known CallKit
            // reset. The room delegate must not independently infer a second
            // reconnect outcome while this path owns recovery state.
            self.intentionalProviderDisconnect = true
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
            self.rejoinableCallRoomID = shouldAllowRejoin ? resetCallRoomID : nil
            self.statusText = shouldAllowRejoin
                ? "The call surface restarted. Your local recording remains protected; tap Rejoin call when ready."
                : "CallKit reset the native call surface. Quipsly recording truth remains separate."
        }
    }

    nonisolated func provider(_ provider: CXProvider, perform action: CXStartCallAction) {
        Task { @MainActor in
            guard self.activeCallUUID == action.callUUID, self.usesCallAudio,
                  let owner = self.activeOwnerSnapshot,
                  AuthManager.shared.matchesStableOwnerSnapshot(owner) else {
                Self.callLog.notice("Ignoring superseded outgoing call action")
                action.fail()
                return
            }
            do {
                // Configure immediately before fulfillment; only didActivate
                // is allowed to start the provider audio engine.
                try self.audioSessionCoordinator.prepareCallKitStart()
                Self.callLog.info("Outgoing call configured; fulfilling start action")
                action.fulfill()
            } catch {
                self.lastTechnicalError = "Call audio preparation failed: \(error.localizedDescription)"
                self.clearNativeCallPresentation()
                Self.callLog.error("Outgoing call configuration failed: \(error.localizedDescription, privacy: .public)")
                action.fail()
            }
        }
    }

    nonisolated func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        Task { @MainActor in
            guard self.activeCallUUID == action.callUUID else {
                Self.callLog.notice("Ignoring superseded end-call action")
                action.fulfill()
                return
            }
            let teardownID = self.callLifecycle.beginTeardown()
            defer { self.callLifecycle.finishTeardown(teardownID) }
            // Consume this identity before suspending: a duplicate callback
            // must not close the same recorder twice.
            self.clearNativeCallPresentation()
            // Fulfill the system-owned action promptly. Local source protection
            // starts before provider disconnect; CallKit may deactivate its
            // audio lease independently while the already-issued recorder stop
            // finishes closing durable bytes.
            action.fulfill()
            self.intentionalProviderDisconnect = true
            self.rejoinableCallRoomID = nil
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
                    ? "Native call ended. \(CaptureDeviceVocabulary.thisDevicePossessive) local source is protected; upload and transcript work can continue."
                    : "Native call ended. \(CaptureDeviceVocabulary.thisDeviceCapitalized) is still closing its local source; keep Quipsly open until Library shows the result."
        }
    }

    nonisolated func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
        Task { @MainActor in
            Self.callLog.info("CallKit activated audio; active call exists: \(self.activeCallUUID != nil)")
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
            Self.callLog.info("CallKit deactivated audio")
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
            guard room === self.room, room.connectionState == connectionState else { return }
            self.connectionStateLabel = "\(connectionState)".capitalized
            self.remoteParticipantCount = room.remoteParticipants.count
            self.refreshRemoteVideoTrack()
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
                self.rejoinableCallRoomID = nil
                self.permanentlyClosedCallRoomID = nil
                self.onCallTransportRestored?(Date())
                self.lastError = nil
                self.lastTechnicalError = nil
                if recovered {
                    self.statusText = "Reconnected."
                }
                self.refreshCallAudioMeterLifecycle()
                await self.receiveCompanionVideo()
            case .reconnecting:
                self.isConnecting = false
                self.isConnected = true
                self.isReconnecting = true
                self.rejoinableCallRoomID = nil
                self.onCallTransportInterrupted?(Date())
                self.lastError = nil
                self.lastTechnicalError = nil
                self.connectionStateLabel = "Reconnecting"
                self.statusText = "Reconnecting…"
            case .disconnected:
                let teardownID = self.callLifecycle.beginTeardown()
                defer { self.callLifecycle.finishTeardown(teardownID) }
                let disconnectedCallRoomID = self.activeCallRoomID
                let ownedLiveRoomState = disconnectedCallRoomID != nil
                    || self.isConnected
                    || self.isConnecting
                    || self.isReconnecting
                guard ownedLiveRoomState else {
                    // CallKit reset can finish its explicit teardown before a
                    // redundant SDK-disconnected callback arrives. That stale
                    // callback must not erase the room-scoped recovery result.
                    return
                }
                let reconnectWasExhausted = !self.intentionalProviderDisconnect
                    && disconnectedCallRoomID != nil
                if reconnectWasExhausted {
                    // Some provider/server terminations move directly from
                    // connected to disconnected without a reconnecting event.
                    // The recorder de-duplicates an already-open span.
                    self.onCallTransportInterrupted?(Date())
                }
                self.stopCallAudioMeter()
                self.clearLocalVideoBridge()
                self.isConnecting = false
                self.isConnected = false
                self.isReconnecting = false
                self.isMuted = true
                self.usesCallAudio = false
                self.remoteParticipantCount = 0
                self.audioSessionCoordinator.providerDidDisconnect()
                await self.endNativeCallPresentation(reason: reconnectWasExhausted ? .failed : .remoteEnded)
                self.activeOwnerSnapshot = nil
                self.clearEpisodeWatchBridge()
                self.clearRemoteVideoTrack()
                if reconnectWasExhausted {
                    self.rejoinableCallRoomID = disconnectedCallRoomID
                } else if let disconnectedCallRoomID,
                          self.rejoinableCallRoomID == disconnectedCallRoomID {
                    self.rejoinableCallRoomID = nil
                }
                self.statusText = reconnectWasExhausted
                    ? "The call disconnected. Your recording is still protected on \(CaptureDeviceVocabulary.thisDevice). Tap Rejoin call when ready."
                    : "Provider room disconnected. Local recording and preserved uploads remain separate."
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

    nonisolated func room(_ room: Room, didUpdateSpeakingParticipants participants: [Participant]) {
        Task { @MainActor in self.refreshRemoteVideoTrack() }
    }

    nonisolated func room(_ room: Room, participant: Participant, didUpdateName name: String) {
        Task { @MainActor in self.refreshRemoteVideoTrack() }
    }

    nonisolated func room(_ room: Room, participant: Participant, didUpdateMetadata metadata: String?) {
        Task { @MainActor in self.refreshRemoteVideoTrack() }
    }

    nonisolated func room(_ room: Room, participant: Participant,
                          trackPublication: TrackPublication, didUpdateIsMuted isMuted: Bool) {
        Task { @MainActor in self.refreshRemoteVideoTrack() }
    }

    nonisolated func room(_ room: Room, participant: RemoteParticipant, didPublishTrack publication: RemoteTrackPublication) {
        Task { @MainActor in
            self.refreshRemoteVideoTrack()
            await self.receiveCompanionVideo()
        }
    }

    nonisolated func room(_ room: Room, participant: RemoteParticipant, didUnpublishTrack publication: RemoteTrackPublication) {
        Task { @MainActor in self.refreshRemoteVideoTrack() }
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
    var participantID: String? = nil

    private var participant: ProviderCallParticipant? {
        if let participantID {
            return controller.remoteParticipants.first { $0.id == participantID }
        }
        return controller.remoteParticipants.first(where: \.hasVideo)
    }

    private var name: String {
        participant.map { controller.participantDisplayName($0) } ?? controller.remoteVideoParticipantLabel ?? "Participant"
    }

    var body: some View {
        #if canImport(LiveKit)
        if let track = participantID.flatMap({ controller.remoteVideoTracks[$0] }) ?? (participantID == nil ? controller.remoteVideoTrack : nil) {
            ZStack(alignment: .bottomLeading) {
                SwiftUIVideoView(track, layoutMode: .fit)
                    .background(Color.black)

                Label(name, systemImage: participant?.microphoneEnabled == true ? "mic.fill" : "mic.slash.fill")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 7)
                    .background(.black.opacity(0.62), in: Capsule())
                    .padding(10)
            }
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Video from \(name)")
            .accessibilityIdentifier("CaptureRemoteCallVideo")
        }
        #else
        EmptyView()
        #endif
    }
}
