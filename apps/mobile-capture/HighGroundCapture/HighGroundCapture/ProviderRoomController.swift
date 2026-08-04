import Combine
import AVFoundation
import CallKit
import Foundation
import SwiftUI

#if canImport(LiveKit)
@preconcurrency import LiveKit
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
    @Published var isMuted = true
    @Published var isNativeCallPresentationActive = false
    @Published var nativeCallPresentationLabel = "CallKit ready"
    @Published var remoteParticipantCount = 0
    @Published var activeRoomName: String?
    @Published var activeCallUUIDString: String?
    @Published var lastError: String?
    @Published var providerRuntimeAvailable = ProviderRoomRuntime.liveKitSDKAvailable
    @Published var providerRuntimeLabel = ProviderRoomRuntime.liveKitLabel
    @Published var providerRuntimeDetail = ProviderRoomRuntime.liveKitDetail
    @Published var isCallAudioSessionActive = false
    @Published var callAudioSessionLabel = "Call audio idle"
    @Published private(set) var latestEpisodeWatchHint: MobileEpisodeWatchLiveHint?

    private let callKitProvider: CXProvider
    private let callController = CXCallController()
    private let audioSessionCoordinator = CaptureAudioSessionCoordinator.shared
    private var activeCallUUID: UUID?
    private var activeOwnerSnapshot: AuthManager.StableOwnerSnapshot?
    private var accountObserver: NSObjectProtocol?
    private var activeCallRoomID: String?
    private var lastPublishedEpisodeWatchReceiptID: String?

    #if canImport(LiveKit)
    private let room = Room()
    #endif

    override init() {
        let configuration = CXProviderConfiguration()
        configuration.supportsVideo = false
        configuration.maximumCallGroups = 1
        configuration.maximumCallsPerCallGroup = 1
        configuration.supportedHandleTypes = [.generic]
        callKitProvider = CXProvider(configuration: configuration)
        super.init()
        callKitProvider.setDelegate(self, queue: nil)
        #if canImport(LiveKit)
        room.add(delegate: self)
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

    func connect(
        using join: MobileCaptureRoomJoinResponse?,
        session: MobileCaptureSession,
        expectedOwnerSnapshot: AuthManager.StableOwnerSnapshot
    ) async {
        #if canImport(LiveKit)
        guard AuthManager.shared.matchesStableOwnerSnapshot(expectedOwnerSnapshot) else {
            fail(accountChangedMessage)
            return
        }
        guard let join else {
            fail("Prepare the provider room before joining.")
            return
        }

        guard join.canJoin == true else {
            fail(join.nextAction ?? "This session is not ready for provider-room joining. Local capture fallback remains available after consent.")
            return
        }

        guard let serverUrl = join.serverUrl, !serverUrl.isEmpty,
              let participantToken = join.participantToken, !participantToken.isEmpty else {
            fail("Nest did not return a complete provider-room join packet.")
            return
        }
        activeOwnerSnapshot = expectedOwnerSnapshot
        activeCallRoomID = session.callRoomId

        do {
            try audioSessionCoordinator.providerWillConnect()
        } catch {
            fail("The live-room audio route could not be prepared: \(error.localizedDescription)")
            return
        }

        isConnecting = true
        lastError = nil
        statusText = "Connecting to \(join.provider ?? session.providerLabel)..."
        connectionStateLabel = "Connecting"
        nativeCallPresentationLabel = "Preparing native call surface"

        let callKitStarted = await startNativeCallPresentation(session: session, join: join)
        guard AuthManager.shared.matchesStableOwnerSnapshot(expectedOwnerSnapshot) else {
            await abortForAccountChange()
            return
        }
        if !callKitStarted {
            audioSessionCoordinator.providerDidDisconnect()
            fail("The native call audio session could not start, so Quipsly did not join a silent provider room. Local recording remains available.")
            return
        }

        let callAudioActivated = await waitForCallAudioActivation(
            expectedOwnerSnapshot: expectedOwnerSnapshot
        )
        guard AuthManager.shared.matchesStableOwnerSnapshot(expectedOwnerSnapshot) else {
            await abortForAccountChange()
            return
        }
        guard callAudioActivated else {
            await endNativeCallPresentation(reason: .failed)
            try? audioSessionCoordinator.callKitDidDeactivate()
            audioSessionCoordinator.providerDidDisconnect()
            fail("CallKit did not activate room audio, so Quipsly did not join a silent provider room. Try again or keep the local source only.")
            return
        }

        do {
            guard AuthManager.shared.matchesStableOwnerSnapshot(expectedOwnerSnapshot) else {
                await abortForAccountChange()
                return
            }
            try await room.connect(url: serverUrl, token: participantToken)
            guard AuthManager.shared.matchesStableOwnerSnapshot(expectedOwnerSnapshot) else {
                await abortForAccountChange()
                return
            }
            try await room.localParticipant.setMicrophone(enabled: true)
            guard AuthManager.shared.matchesStableOwnerSnapshot(expectedOwnerSnapshot) else {
                await abortForAccountChange()
                return
            }
            isMuted = false
            isConnected = true
            activeRoomName = room.name ?? join.roomName ?? session.displayTitle
            remoteParticipantCount = room.remoteParticipants.count
            connectionStateLabel = "\(room.connectionState)".capitalized
            reportNativeCallConnected()
            statusText = "Joined provider room. Recording still requires explicit Quipsly consent."
        } catch {
            await room.disconnect()
            await endNativeCallPresentation(reason: .failed)
            audioSessionCoordinator.providerDidDisconnect()
            activeOwnerSnapshot = nil
            clearEpisodeWatchBridge()
            isConnected = false
            isMuted = true
            remoteParticipantCount = 0
            activeRoomName = nil
            fail(error.localizedDescription)
        }

        isConnecting = false
        #else
        fail("LiveKit SDK is not linked into this app build yet. Nest room keys may be ready, but real provider media is held. Local consented recording is still available.")
        #endif
    }

    func setMuted(_ muted: Bool) async {
        #if canImport(LiveKit)
        guard isConnected,
              let activeOwnerSnapshot,
              AuthManager.shared.matchesStableOwnerSnapshot(activeOwnerSnapshot) else {
            if let ownerSnapshot = self.activeOwnerSnapshot,
               !AuthManager.shared.matchesStableOwnerSnapshot(ownerSnapshot) {
                await abortForAccountChange()
                return
            }
            fail("Join the provider room before changing mute state.")
            return
        }

        do {
            try await room.localParticipant.setMicrophone(enabled: !muted)
            guard AuthManager.shared.matchesStableOwnerSnapshot(activeOwnerSnapshot) else {
                await abortForAccountChange()
                return
            }
            isMuted = muted
            statusText = muted ? "Provider microphone muted." : "Provider microphone live. Quipsly recording is still separate."
        } catch {
            fail(error.localizedDescription)
        }
        #else
        fail("Mute controls require the LiveKit SDK build.")
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

    func disconnect() async {
        #if canImport(LiveKit)
        guard isConnected || isConnecting else {
            statusText = "Provider room already disconnected."
            await endNativeCallPresentation(reason: .remoteEnded)
            audioSessionCoordinator.providerDidDisconnect()
            activeOwnerSnapshot = nil
            clearEpisodeWatchBridge()
            return
        }

        await room.disconnect()
        await endNativeCallPresentation(reason: .remoteEnded)
        audioSessionCoordinator.providerDidDisconnect()
        isConnecting = false
        isConnected = false
        isMuted = true
        remoteParticipantCount = 0
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
        isMuted = true
        activeOwnerSnapshot = nil
        clearEpisodeWatchBridge()
        connectionStateLabel = "Disconnected"
        statusText = "Provider SDK unavailable. Local upload and transcript work can continue."
        #endif
    }

    func refreshState() {
        #if canImport(LiveKit)
        isConnected = room.connectionState == .connected
        connectionStateLabel = "\(room.connectionState)".capitalized
        remoteParticipantCount = room.remoteParticipants.count
        activeRoomName = room.name ?? activeRoomName
        #else
        isConnected = false
        connectionStateLabel = "SDK unavailable"
        remoteParticipantCount = 0
        providerRuntimeAvailable = ProviderRoomRuntime.liveKitSDKAvailable
        providerRuntimeLabel = ProviderRoomRuntime.liveKitLabel
        providerRuntimeDetail = ProviderRoomRuntime.liveKitDetail
        #endif
    }

    private func fail(_ message: String) {
        isConnecting = false
        if !isConnected {
            activeOwnerSnapshot = nil
            clearEpisodeWatchBridge()
        }
        lastError = message
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
            lastError = "Native call presentation failed: \(error.localizedDescription)"
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
    }

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

    private var accountChangedMessage: String {
        "The Quipsly account changed while the provider room was connecting. Quipsly left the room so another account cannot inherit its join token."
    }

    private func abortForAccountChange() async {
        #if canImport(LiveKit)
        await room.disconnect()
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
        isMuted = true
        remoteParticipantCount = 0
        activeRoomName = nil
        connectionStateLabel = "Disconnected"
        lastError = accountChangedMessage
        statusText = accountChangedMessage
    }

    private func abortAfterCallAudioActivationFailure(_ error: Error) async {
        let message = "Provider audio could not activate safely, so Quipsly left the room instead of showing a silent connection: \(error.localizedDescription)"
        #if canImport(LiveKit)
        await room.disconnect()
        #endif
        await endNativeCallPresentation(reason: .failed)
        try? audioSessionCoordinator.callKitDidDeactivate()
        audioSessionCoordinator.providerDidDisconnect()
        isCallAudioSessionActive = false
        callAudioSessionLabel = "Call audio needs attention"
        isConnecting = false
        isConnected = false
        isMuted = true
        remoteParticipantCount = 0
        activeRoomName = nil
        activeOwnerSnapshot = nil
        clearEpisodeWatchBridge()
        connectionStateLabel = "Needs attention"
        lastError = message
        statusText = message
    }

    deinit {
        if let accountObserver {
            NotificationCenter.default.removeObserver(accountObserver)
        }
    }
}

extension ProviderRoomController: CXProviderDelegate {
    nonisolated func providerDidReset(_ provider: CXProvider) {
        Task { @MainActor in
            #if canImport(LiveKit)
            if self.isConnected || self.isConnecting {
                await self.room.disconnect()
            }
            #endif
            self.clearNativeCallPresentation()
            try? self.audioSessionCoordinator.callKitDidDeactivate()
            self.audioSessionCoordinator.providerDidDisconnect()
            self.isConnected = false
            self.isConnecting = false
            self.isMuted = true
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
            #if canImport(LiveKit)
            if self.isConnected || self.isConnecting {
                await self.room.disconnect()
            }
            #endif
            self.clearNativeCallPresentation()
            self.audioSessionCoordinator.providerDidDisconnect()
            self.isConnected = false
            self.isConnecting = false
            self.isMuted = true
            self.activeOwnerSnapshot = nil
            self.clearEpisodeWatchBridge()
            self.connectionStateLabel = "Disconnected"
            self.statusText = "Native call ended. Local upload and transcript work can continue."
            action.fulfill()
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
                self.lastError = "Provider audio could not deactivate cleanly: \(error.localizedDescription)"
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
                self.isConnecting = false
                self.isConnected = true
                self.lastError = nil
            case .disconnected:
                self.isConnecting = false
                self.isConnected = false
                self.isMuted = true
                self.remoteParticipantCount = 0
                self.audioSessionCoordinator.providerDidDisconnect()
                await self.endNativeCallPresentation(reason: .remoteEnded)
                self.activeOwnerSnapshot = nil
                self.clearEpisodeWatchBridge()
                self.statusText = "Provider room disconnected. Local recording and preserved uploads remain separate."
            default:
                self.isConnecting = true
            }
        }
    }

    nonisolated func room(_ room: Room, participantDidConnect participant: RemoteParticipant) {
        Task { @MainActor in
            self.remoteParticipantCount = room.remoteParticipants.count
        }
    }

    nonisolated func room(_ room: Room, participantDidDisconnect participant: RemoteParticipant) {
        Task { @MainActor in
            self.remoteParticipantCount = room.remoteParticipants.count
        }
    }

    nonisolated func room(
        _ room: Room,
        participant: RemoteParticipant?,
        didReceiveData data: Data,
        forTopic topic: String,
        encryptionType: EncryptionType
    ) {
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
