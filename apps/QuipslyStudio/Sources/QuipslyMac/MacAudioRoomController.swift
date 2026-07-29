import Combine
import Foundation
import QuipslyVideoCore

@preconcurrency import LiveKit

private struct MacAudioRoomJoinResponse: Decodable {
    let ok: Bool
    let error: String?
    let canJoin: Bool?
    let provider: String?
    let serverUrl: String?
    let roomName: String?
    let participantToken: String?
    let callRoomId: String?
    let participantId: String?
    let nextAction: String?
}

private struct ActiveMacAudioRoomContext {
    let captureGroupID: UUID
    let episodeSpaceID: String
    let callRoomID: String
    let providerRoomName: String?
    let participantID: String
    let coreAudioInputUID: String
    let coreAudioOutputUID: String
    let providerInputDeviceID: String
    let providerOutputDeviceID: String
    let directPhysicalMV7iClaimed: Bool
    let usesSystemDefaultInputProxy: Bool
    let usesSystemDefaultOutputProxy: Bool
    let captureRoot: URL
}

@MainActor
final class MacAudioRoomController: NSObject, ObservableObject {
    @Published private(set) var providerInputs: [ProviderAudioDeviceSnapshot] = []
    @Published private(set) var providerOutputs: [ProviderAudioDeviceSnapshot] = []
    @Published private(set) var statusText =
        "Refresh provider routes, then join the audio-only episode room."
    @Published private(set) var connectionStateLabel = "Disconnected"
    @Published private(set) var isRefreshingDevices = false
    @Published private(set) var isConnecting = false
    @Published private(set) var isConnected = false
    @Published private(set) var isMuted = true
    @Published private(set) var remoteParticipantCount = 0
    @Published private(set) var activeRoomName: String?
    @Published private(set) var routeIntegrityLabel = "Not locked"
    @Published private(set) var lastError: String?
    @Published private(set) var lastReceiptURL: URL?

    private let room = Room()
    private var activeContext: ActiveMacAudioRoomContext?
    private var routeLossIsBeingHandled = false

    override init() {
        super.init()
        room.add(delegate: self)
        AudioManager.prepare()
        AudioManager.shared.onDeviceUpdate = { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.providerDevicesDidUpdate()
            }
        }
        readProviderDevices()
    }

    var isActive: Bool {
        isConnecting || isConnected
    }

    func refreshProviderDevices() {
        guard !isActive else {
            statusText =
                "Leave the episode room before changing its exact audio route."
            return
        }
        isRefreshingDevices = true
        AudioManager.prepare()
        readProviderDevices()
        isRefreshingDevices = false
    }

    func makeSelectedDevicesSystemCallRoute(
        coreAudioInput: CaptureAudioDeviceSnapshot?,
        coreAudioOutput: CaptureAudioDeviceSnapshot?
    ) -> Bool {
        guard !isActive else {
            fail("Leave the episode room before changing the macOS call route.")
            return false
        }
        guard let coreAudioInput, coreAudioInput.hasInput else {
            fail("Select a connected microphone before changing the macOS call route.")
            return false
        }
        guard let coreAudioOutput, coreAudioOutput.hasOutput else {
            fail("Select a connected headphone output before changing the macOS call route.")
            return false
        }

        do {
            let route = try MacAudioSystemRouteController.makeSystemDefault(
                inputUID: coreAudioInput.id,
                outputUID: coreAudioOutput.id
            )
            lastError = nil
            AudioManager.prepare()
            readProviderDevices(updateStatus: false)
            statusText =
                "macOS verified \(coreAudioInput.name) as the system microphone and \(coreAudioOutput.name) as the system output. LiveKit will follow those exact UIDs through its default-device proxies."
            return route.inputUID == coreAudioInput.id
                && route.outputUID == coreAudioOutput.id
        } catch {
            fail(error.localizedDescription)
            return false
        }
    }

    func routeResolution(
        coreAudioInput: CaptureAudioDeviceSnapshot?,
        coreAudioOutput: CaptureAudioDeviceSnapshot?
    ) -> MacAudioRoomRouteResolution {
        MacAudioRoomRoutePolicy.resolve(
            coreAudioInput: coreAudioInput,
            coreAudioOutput: coreAudioOutput,
            providerInputs: providerInputs,
            providerOutputs: providerOutputs
        )
    }

    func join(
        callRoomID: String,
        captureGroupID: UUID,
        episodeSpaceID: String,
        fallbackParticipantID: String,
        coreAudioInput: CaptureAudioDeviceSnapshot?,
        coreAudioOutput: CaptureAudioDeviceSnapshot?,
        accountStore: QuipslyNativeAccountStore,
        captureRoot: URL
    ) async {
        guard !isActive else {
            fail("Leave the current episode room before joining another one.")
            return
        }

        let cleanRoomID = callRoomID.trimmingCharacters(
            in: .whitespacesAndNewlines
        )
        let cleanEpisodeID = episodeSpaceID.trimmingCharacters(
            in: .whitespacesAndNewlines
        )
        let cleanParticipantID = fallbackParticipantID.trimmingCharacters(
            in: .whitespacesAndNewlines
        )
        guard !cleanRoomID.isEmpty else {
            fail("Paste the Nest call-room ID before joining.")
            return
        }
        guard !cleanEpisodeID.isEmpty, !cleanParticipantID.isEmpty else {
            fail("Enter both the episode space and participant identity.")
            return
        }
        guard accountStore.hasSavedSession else {
            fail(
                "Connect the native Quipsly account in the Workspace before joining."
            )
            return
        }

        let resolution = routeResolution(
            coreAudioInput: coreAudioInput,
            coreAudioOutput: coreAudioOutput
        )
        guard resolution.status != .blocked,
              let coreAudioInput,
              let coreAudioOutput,
              let providerInput = resolution.providerInput,
              let providerOutput = resolution.providerOutput else {
            fail(resolution.truth)
            return
        }
        guard
            let liveKitInput = AudioManager.shared.inputDevices.first(where: {
                $0.deviceId == providerInput.id
            }),
            let liveKitOutput = AudioManager.shared.outputDevices.first(where: {
                $0.deviceId == providerOutput.id
            })
        else {
            fail(
                "The verified LiveKit route changed before join. Refresh provider routes and verify it again."
            )
            return
        }

        isConnecting = true
        isMuted = true
        lastError = nil
        statusText = "Requesting a short-lived audio-room join packet from Nest…"
        connectionStateLabel = "Preparing"

        var receiptContext = ActiveMacAudioRoomContext(
            captureGroupID: captureGroupID,
            episodeSpaceID: cleanEpisodeID,
            callRoomID: cleanRoomID,
            providerRoomName: nil,
            participantID: cleanParticipantID,
            coreAudioInputUID: coreAudioInput.id,
            coreAudioOutputUID: coreAudioOutput.id,
            providerInputDeviceID: providerInput.id,
            providerOutputDeviceID: providerOutput.id,
            directPhysicalMV7iClaimed: resolution.directPhysicalMV7iClaimed,
            usesSystemDefaultInputProxy:
                resolution.usesSystemDefaultInputProxy,
            usesSystemDefaultOutputProxy:
                resolution.usesSystemDefaultOutputProxy,
            captureRoot: captureRoot
        )

        do {
            AudioManager.shared.inputDevice = liveKitInput
            AudioManager.shared.outputDevice = liveKitOutput
            let selectedRoute = activeProviderRouteIntegrity(
                expectedInputDeviceID: providerInput.id,
                expectedOutputDeviceID: providerOutput.id,
                expectedCoreAudioInputUID:
                    resolution.usesSystemDefaultInputProxy
                        ? coreAudioInput.id
                        : nil,
                expectedCoreAudioOutputUID:
                    resolution.usesSystemDefaultOutputProxy
                        ? coreAudioOutput.id
                        : nil
            )
            guard selectedRoute.status == .verified else {
                throw roomError(selectedRoute.truth, code: 4)
            }

            guard let baseURL = accountStore.normalizedBaseURL else {
                throw roomError(
                    "The configured Nest base URL is not valid.",
                    code: 1
                )
            }
            var request = URLRequest(
                url: baseURL.appending(
                    path: "/api/mobile/capture/rooms/join"
                )
            )
            request.httpMethod = "POST"
            request.setValue(
                "application/json",
                forHTTPHeaderField: "content-type"
            )
            request.httpBody = try JSONSerialization.data(
                withJSONObject: ["callRoomId": cleanRoomID]
            )

            let (data, response) = try await accountStore.authenticatedData(
                for: request
            )
            let join = try JSONDecoder().decode(
                MacAudioRoomJoinResponse.self,
                from: data
            )
            guard (200 ..< 300).contains(response.statusCode), join.ok else {
                throw roomError(
                    join.error
                        ?? join.nextAction
                        ?? "Nest refused the episode-room join request.",
                    code: response.statusCode
                )
            }
            guard join.canJoin == true else {
                throw roomError(
                    join.nextAction
                        ?? "This episode room is not ready for an audio call.",
                    code: 2
                )
            }
            guard join.provider?.lowercased() == "livekit",
                  let serverURL = join.serverUrl, !serverURL.isEmpty,
                  let participantToken = join.participantToken,
                  !participantToken.isEmpty else {
                throw roomError(
                    "Nest did not return a complete LiveKit audio-room packet.",
                    code: 3
                )
            }

            receiptContext = ActiveMacAudioRoomContext(
                captureGroupID: captureGroupID,
                episodeSpaceID: cleanEpisodeID,
                callRoomID: join.callRoomId ?? cleanRoomID,
                providerRoomName: join.roomName,
                participantID: join.participantId ?? cleanParticipantID,
                coreAudioInputUID: coreAudioInput.id,
                coreAudioOutputUID: coreAudioOutput.id,
                providerInputDeviceID: providerInput.id,
                providerOutputDeviceID: providerOutput.id,
                directPhysicalMV7iClaimed:
                    resolution.directPhysicalMV7iClaimed,
                usesSystemDefaultInputProxy:
                    resolution.usesSystemDefaultInputProxy,
                usesSystemDefaultOutputProxy:
                    resolution.usesSystemDefaultOutputProxy,
                captureRoot: captureRoot
            )
            activeContext = receiptContext
            routeIntegrityLabel = "Verifying"
            statusText =
                "Joining \(join.roomName ?? cleanRoomID) with audio only…"
            connectionStateLabel = "Connecting"

            try await room.connect(
                url: serverURL,
                token: participantToken
            )
            let connectedRoute = activeProviderRouteIntegrity(
                context: receiptContext
            )
            guard connectedRoute.status == .verified else {
                throw roomError(connectedRoute.truth, code: 5)
            }
            try await room.localParticipant.setMicrophone(enabled: true)
            let liveRoute = activeProviderRouteIntegrity(
                context: receiptContext
            )
            guard liveRoute.status == .verified else {
                throw roomError(liveRoute.truth, code: 6)
            }

            isConnecting = false
            isConnected = true
            isMuted = false
            routeIntegrityLabel = "Locked"
            activeRoomName = room.name ?? join.roomName
            remoteParticipantCount = room.remoteParticipants.count
            connectionStateLabel = "Connected"
            statusText =
                resolution.status == .rehearsalOnly
                    ? "Audio room joined through a verified virtual rehearsal route. Local master recording remains separate."
                    : "Audio room joined. The call feed is live; local master recording remains a separate explicit action."
            writeReceipt(event: .joined, context: receiptContext)
        } catch {
            activeContext = nil
            await room.disconnect()
            isConnecting = false
            isConnected = false
            isMuted = true
            routeIntegrityLabel = "Not locked"
            remoteParticipantCount = 0
            activeRoomName = nil
            connectionStateLabel = "Needs attention"
            fail(error.localizedDescription)
            writeReceipt(
                event: .failed,
                context: receiptContext,
                failure: error.localizedDescription
            )
        }
    }

    func setMuted(_ muted: Bool) async {
        guard isConnected, let context = activeContext else {
            fail("Join the audio-only room before changing mute state.")
            return
        }
        let integrity = activeProviderRouteIntegrity(context: context)
        guard integrity.status == .verified else {
            holdForRouteLoss(context: context, integrity: integrity)
            return
        }
        do {
            try await room.localParticipant.setMicrophone(enabled: !muted)
            isMuted = muted
            statusText =
                muted
                    ? "Call microphone muted. The local master recorder is independent."
                    : "Call microphone live. The local master recorder is independent."
            writeReceipt(
                event: muted ? .muted : .unmuted,
                context: context
            )
        } catch {
            fail(error.localizedDescription)
        }
    }

    func disconnect() async {
        guard isActive else {
            statusText = "Audio room already disconnected."
            return
        }
        let context = activeContext
        activeContext = nil
        await room.disconnect()
        if let context {
            writeReceipt(event: .left, context: context)
        }
        clearConnectedState(
            message:
                "Audio room left. Local masters and editor attachments remain available."
        )
    }

    private func readProviderDevices(updateStatus: Bool = true) {
        providerInputs = AudioManager.shared.inputDevices.map {
            ProviderAudioDeviceSnapshot(
                id: $0.deviceId,
                name: $0.name,
                isDefault: $0.isDefault
            )
        }
        providerOutputs = AudioManager.shared.outputDevices.map {
            ProviderAudioDeviceSnapshot(
                id: $0.deviceId,
                name: $0.name,
                isDefault: $0.isDefault
            )
        }
        if updateStatus, !isActive {
            statusText =
                "\(providerInputs.count) LiveKit input route(s) · \(providerOutputs.count) output route(s). Exact Core Audio UID agreement is required."
        }
    }

    private func providerDevicesDidUpdate() {
        readProviderDevices()
        guard let context = activeContext, isActive else { return }
        let integrity = activeProviderRouteIntegrity(context: context)
        if integrity.status == .verified {
            routeIntegrityLabel = "Locked"
        } else {
            holdForRouteLoss(context: context, integrity: integrity)
        }
    }

    private func activeProviderRouteIntegrity(
        context: ActiveMacAudioRoomContext
    ) -> MacAudioRoomRouteIntegrity {
        activeProviderRouteIntegrity(
            expectedInputDeviceID: context.providerInputDeviceID,
            expectedOutputDeviceID: context.providerOutputDeviceID,
            expectedCoreAudioInputUID:
                context.usesSystemDefaultInputProxy
                    ? context.coreAudioInputUID
                    : nil,
            expectedCoreAudioOutputUID:
                context.usesSystemDefaultOutputProxy
                    ? context.coreAudioOutputUID
                    : nil
        )
    }

    private func activeProviderRouteIntegrity(
        expectedInputDeviceID: String,
        expectedOutputDeviceID: String,
        expectedCoreAudioInputUID: String? = nil,
        expectedCoreAudioOutputUID: String? = nil
    ) -> MacAudioRoomRouteIntegrity {
        let currentDefaults = MacAudioSystemRouteController
            .currentDefaultRoute()
        return MacAudioRoomRoutePolicy.verifyActiveProviderRoute(
            expectedInputDeviceID: expectedInputDeviceID,
            expectedOutputDeviceID: expectedOutputDeviceID,
            providerInputs: providerInputs,
            providerOutputs: providerOutputs,
            activeInputDeviceID:
                AudioManager.shared.inputDevice.deviceId,
            activeOutputDeviceID:
                AudioManager.shared.outputDevice.deviceId,
            expectedCoreAudioInputUID: expectedCoreAudioInputUID,
            expectedCoreAudioOutputUID: expectedCoreAudioOutputUID,
            observedDefaultCoreAudioInputUID: currentDefaults.inputUID,
            observedDefaultCoreAudioOutputUID: currentDefaults.outputUID
        )
    }

    private func holdForRouteLoss(
        context: ActiveMacAudioRoomContext,
        integrity: MacAudioRoomRouteIntegrity
    ) {
        guard !routeLossIsBeingHandled,
              activeContext != nil else { return }

        routeLossIsBeingHandled = true
        AudioManager.shared.isMicrophoneMuted = true
        isMuted = true
        isConnecting = true
        isConnected = false
        remoteParticipantCount = 0
        activeRoomName = nil
        connectionStateLabel = "Route safety hold"
        routeIntegrityLabel = "Lost"
        lastError = integrity.truth
        statusText =
            "\(integrity.truth) A healthy local WAV master is not stopped or rewritten by this call-route hold."
        activeContext = nil
        writeReceipt(
            event: .routeLost,
            context: context,
            failure: integrity.truth,
            observedProviderInputDeviceID:
                integrity.observedInputDeviceID,
            observedProviderOutputDeviceID:
                integrity.observedOutputDeviceID,
            routeIntegrity: .lost
        )

        Task {
            _ = try? await room.localParticipant.setMicrophone(
                enabled: false
            )
            await room.disconnect()
            routeLossIsBeingHandled = false
            isConnecting = false
            isConnected = false
            isMuted = true
            remoteParticipantCount = 0
            activeRoomName = nil
            connectionStateLabel = "Route safety hold"
            routeIntegrityLabel = "Lost"
        }
    }

    private func writeReceipt(
        event: MacAudioRoomEvent,
        context: ActiveMacAudioRoomContext,
        failure: String? = nil,
        observedProviderInputDeviceID: String? = nil,
        observedProviderOutputDeviceID: String? = nil,
        routeIntegrity: MacAudioRoomRouteIntegrityStatus = .verified
    ) {
        do {
            let observedInput = routeIntegrity == .lost
                ? observedProviderInputDeviceID
                : observedProviderInputDeviceID
                    ?? AudioManager.shared.inputDevice.deviceId
            let observedOutput = routeIntegrity == .lost
                ? observedProviderOutputDeviceID
                : observedProviderOutputDeviceID
                    ?? AudioManager.shared.outputDevice.deviceId
            lastReceiptURL = try MacAudioRoomReceiptWriter.write(
                MacAudioRoomEventReceipt(
                    event: event,
                    captureGroupID: context.captureGroupID,
                    episodeSpaceID: context.episodeSpaceID,
                    callRoomID: context.callRoomID,
                    providerRoomName: context.providerRoomName,
                    participantID: context.participantID,
                    coreAudioInputUID: context.coreAudioInputUID,
                    coreAudioOutputUID: context.coreAudioOutputUID,
                    providerInputDeviceID:
                        context.providerInputDeviceID,
                    providerOutputDeviceID:
                        context.providerOutputDeviceID,
                    directPhysicalMV7iClaimed:
                        context.directPhysicalMV7iClaimed,
                    remoteParticipantCount: remoteParticipantCount,
                    failure: failure,
                    observedProviderInputDeviceID:
                        observedInput,
                    observedProviderOutputDeviceID:
                        observedOutput,
                    routeIntegrity: routeIntegrity
                ),
                root: context.captureRoot
            )
        } catch {
            lastError =
                "Room state changed, but its local event receipt could not be written: \(error.localizedDescription)"
        }
    }

    private func fail(_ message: String) {
        lastError = message
        statusText = message
        if !isConnected {
            isConnecting = false
            connectionStateLabel = "Needs attention"
        }
    }

    private func clearConnectedState(message: String) {
        activeContext = nil
        isConnecting = false
        isConnected = false
        isMuted = true
        remoteParticipantCount = 0
        activeRoomName = nil
        connectionStateLabel = "Disconnected"
        routeIntegrityLabel = "Not locked"
        statusText = message
    }

    private func roomError(_ message: String, code: Int) -> NSError {
        NSError(
            domain: "QuipslyMacAudioRoom",
            code: code,
            userInfo: [NSLocalizedDescriptionKey: message]
        )
    }
}

extension MacAudioRoomController: RoomDelegate {
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
                guard !self.routeLossIsBeingHandled else {
                    AudioManager.shared.isMicrophoneMuted = true
                    self.isConnected = false
                    self.isMuted = true
                    return
                }
                self.isConnecting = false
                self.isConnected = true
                self.lastError = nil
            case .disconnected:
                if self.routeLossIsBeingHandled {
                    self.isConnected = false
                    self.isMuted = true
                    self.remoteParticipantCount = 0
                    self.activeRoomName = nil
                    return
                }
                if let context = self.activeContext {
                    self.writeReceipt(event: .left, context: context)
                }
                self.clearConnectedState(
                    message:
                        "Audio room disconnected. The independent local recorder and preserved sources were not changed."
                )
            default:
                if !self.isConnected {
                    self.isConnecting = true
                }
            }
        }
    }

    nonisolated func room(
        _ room: Room,
        participantDidConnect participant: RemoteParticipant
    ) {
        Task { @MainActor in
            self.remoteParticipantCount = room.remoteParticipants.count
        }
    }

    nonisolated func room(
        _ room: Room,
        participantDidDisconnect participant: RemoteParticipant
    ) {
        Task { @MainActor in
            self.remoteParticipantCount = room.remoteParticipants.count
        }
    }
}
