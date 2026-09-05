import AVFoundation
import Combine

#if canImport(LiveKit)
@preconcurrency import LiveKit
#endif

/// Owns the process-wide AVAudioSession policy for Capture.
///
/// Local recording, CallKit, and the provider SDK all share one system audio
/// session. Keeping their leases here prevents a local-capture stop from
/// deactivating a connected room and makes the recorded scope explicit: the
/// local file contains this device's selected microphone, not provider egress.
@MainActor
final class CaptureAudioSessionCoordinator: ObservableObject {
    static let shared = CaptureAudioSessionCoordinator()

    @Published private(set) var isLocalCaptureActive = false
    @Published private(set) var isProviderRoomActive = false
    @Published private(set) var isCallKitAudioActive = false
    @Published private(set) var isProviderInputRetentionActive = false
    @Published private(set) var isLocalPlaybackActive = false
    @Published private(set) var isSharedWatchPlaybackActive = false
    @Published private(set) var sharedWatchRouteFailureMessage: String?
    @Published private(set) var privateListeningRouteAvailable = false
    @Published private(set) var currentInputRouteName = "No microphone active"
    @Published private(set) var currentOutputRouteName = CaptureDeviceVocabulary.audioRoute
    @Published private(set) var isBuiltInSpeakerActive = false

    private let audioSession = AVAudioSession.sharedInstance()
    private var routeChangeObserver: NSObjectProtocol?

    private init() {
        #if canImport(LiveKit)
        // CallKit, not the provider SDK, owns activation timing. LiveKit's
        // engine stays unavailable until CXProvider tells us the system audio
        // session is active.
        AudioManager.shared.audioSession.isAutomaticConfigurationEnabled = false
        try? AudioManager.shared.setEngineAvailability(.none)
        #endif
        routeChangeObserver = NotificationCenter.default.addObserver(
            forName: AVAudioSession.routeChangeNotification,
            object: audioSession,
            queue: .main
        ) { _ in
            Task { @MainActor [weak self] in
                self?.refreshRouteSnapshot()
                self?.holdSharedWatchForUnsafeRoute()
            }
        }
        refreshRouteSnapshot()
    }

    /// A connected room already owns the hardware microphone through
    /// LiveKit. Local master recording must observe that exact PCM stream
    /// rather than ask AVAudioRecorder to open a competing input client.
    var providerInputObservationAvailable: Bool {
        #if canImport(LiveKit)
        isProviderRoomActive
            && isCallKitAudioActive
            && AudioManager.shared.isEngineRunning
        #else
        false
        #endif
    }

    func prepareLocalCaptureRoute() throws {
        try applySharedCategory()
        try audioSession.setPreferredSampleRate(48_000)
    }

    func activateLocalCapture() throws {
        do {
            try beginLocalCaptureActivation()
            try requireActiveInputRoute()
            try requirePrivateRouteDuringCapture()
        } catch {
            rollBackLocalCaptureActivation()
            throw error
        }
    }

    /// Activating a non-mixing recording session conventionally interrupts
    /// an audiobook, podcast, or music app. On some physical devices the
    /// category and activation calls return a fraction of a second before the
    /// replacement input is published in `currentRoute`. A fresh recording
    /// must wait for that route transition instead of turning a transient
    /// empty route into a false "no microphone" failure.
    func activateLocalCaptureAwaitingInput(
        timeout: Duration = .seconds(1.5)
    ) async throws {
        do {
            try beginLocalCaptureActivation()
            let clock = ContinuousClock()
            let deadline = clock.now.advanced(by: timeout)
            refreshRouteSnapshot()
            while audioSession.currentRoute.inputs.isEmpty,
                  clock.now < deadline {
                try await Task.sleep(for: .milliseconds(50))
                refreshRouteSnapshot()
            }
            try Task.checkCancellation()
            try requireActiveInputRoute()
            try requirePrivateRouteDuringCapture()
        } catch {
            rollBackLocalCaptureActivation()
            throw error
        }
    }

    private func beginLocalCaptureActivation() throws {
        isLocalPlaybackActive = false
        isLocalCaptureActive = true
        try applySharedCategory()
        try audioSession.setPreferredSampleRate(48_000)
        if !isCallKitAudioActive {
            try audioSession.setActive(true)
        }
        refreshRouteSnapshot()
    }

    private func requireActiveInputRoute() throws {
        guard !audioSession.currentRoute.inputs.isEmpty else {
            throw NSError(
                domain: "CaptureAudioSession",
                code: 5,
                userInfo: [
                    NSLocalizedDescriptionKey:
                        "No microphone became active. Check Quipsly microphone access or reconnect the selected audio device, then try again."
                ]
            )
        }
    }

    private func rollBackLocalCaptureActivation() {
        isLocalCaptureActive = false
        reconcileAfterLeaseChange()
    }

    func releaseLocalCapture() {
        isLocalCaptureActive = false
        releaseProviderInputRetention()
        reconcileAfterLeaseChange()
    }

    /// A provider-backed master observes LiveKit's local input and must keep
    /// that engine request alive across a room reconnect or CallKit
    /// deactivation. This lease never publishes audio and never grants a
    /// permission; it only preserves an input the participant already opened
    /// for an explicit recording.
    func retainProviderInputForLocalCapture() throws {
        #if canImport(LiveKit)
        guard isLocalCaptureActive,
              isProviderRoomActive,
              isCallKitAudioActive else {
            throw NSError(
                domain: "CaptureAudioSession",
                code: 4,
                userInfo: [
                    NSLocalizedDescriptionKey:
                        "The live-room microphone is not active enough to protect a local master."
                ]
            )
        }
        isProviderInputRetentionActive = true
        do {
            try AudioManager.shared.setEngineAvailability(.default)
        } catch {
            isProviderInputRetentionActive = false
            throw error
        }
        #else
        throw NSError(
            domain: "CaptureAudioSession",
            code: 4,
            userInfo: [NSLocalizedDescriptionKey: "Provider microphone retention requires the LiveKit build."]
        )
        #endif
    }

    func providerWillConnect() throws {
        isProviderRoomActive = true
        do {
            try applySharedCategory()
            #if canImport(LiveKit)
            AudioManager.shared.audioSession.isAutomaticConfigurationEnabled = false
            try AudioManager.shared.setEngineAvailability(
                isProviderInputRetentionActive ? .default : .none
            )
            #endif
            if isLocalCaptureActive {
                try audioSession.setActive(true)
            }
            try requirePrivateRouteDuringCapture()
        } catch {
            isProviderRoomActive = false
            reconcileAfterLeaseChange()
            throw error
        }
    }

    func providerDidDisconnect() {
        isProviderRoomActive = false
        reconcileAfterLeaseChange()
    }

    func callKitDidActivate(_ activatedSession: AVAudioSession) throws {
        try activatedSession.setCategory(
            .playAndRecord,
            mode: .voiceChat,
            options: [.defaultToSpeaker, .allowBluetoothHFP]
        )
        #if canImport(LiveKit)
        try AudioManager.shared.setEngineAvailability(.default)
        #endif
        isCallKitAudioActive = true
        refreshRouteSnapshot()
        // providerWillConnect already required a private route. If the route
        // changed during CallKit activation, preserve the call and hold Watch
        // immediately instead of allowing reference audio onto the microphone.
        holdSharedWatchForUnsafeRoute()
    }

    func callKitDidDeactivate() throws {
        // Drop the CallKit lease first and collect cleanup failures instead of
        // letting a provider-engine error skip local-recorder reconciliation.
        // A local take must regain an active, capture-safe route even when
        // LiveKit cannot finish shutting its engine down cleanly.
        isCallKitAudioActive = false
        var cleanupFailures: [String] = []

        #if canImport(LiveKit)
        do {
            try AudioManager.shared.setEngineAvailability(
                isProviderInputRetentionActive ? .default : .none
            )
        } catch {
            cleanupFailures.append("provider engine: \(error.localizedDescription)")
        }
        #endif

        do {
            if isLocalCaptureActive {
                try applySharedCategory()
                try audioSession.setPreferredSampleRate(48_000)
                try audioSession.setActive(true)
            } else if isSharedWatchPlaybackActive {
                try applySharedCategory()
                try audioSession.setActive(true)
            } else if !isLocalPlaybackActive {
                try audioSession.setActive(false, options: .notifyOthersOnDeactivation)
            }
        } catch {
            cleanupFailures.append("audio session: \(error.localizedDescription)")
        }

        if !cleanupFailures.isEmpty {
            throw NSError(
                domain: "CaptureAudioSession",
                code: 2,
                userInfo: [
                    NSLocalizedDescriptionKey:
                        "Call audio ended, but cleanup needs attention (\(cleanupFailures.joined(separator: "; "))).",
                ]
            )
        }
    }

    func beginLocalPlayback() throws {
        guard !isLocalCaptureActive,
              !isProviderRoomActive,
              !isCallKitAudioActive,
              !isSharedWatchPlaybackActive else {
            throw NSError(
                domain: "CaptureAudioSession",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "Stop recording or leave the live room before playing a local take."]
            )
        }
        isLocalPlaybackActive = true
        do {
            try audioSession.setCategory(.playback, mode: .spokenAudio, options: [])
            try audioSession.setActive(true)
        } catch {
            isLocalPlaybackActive = false
            throw error
        }
    }

    func endLocalPlayback() {
        isLocalPlaybackActive = false
        reconcileAfterLeaseChange()
    }

    /// Shared Watch is allowed beside LiveKit and local capture. Every
    /// participant plays the separately preserved reference source through the
    /// current route; headphones keep that source out of the microphone master.
    func beginSharedWatchPlayback() throws {
        if (isLocalCaptureActive || isProviderRoomActive || isCallKitAudioActive),
           !hasPrivateListeningRoute {
            throw NSError(
                domain: "CaptureAudioSession",
                code: 2,
                userInfo: [
                    NSLocalizedDescriptionKey:
                        "Connect headphones before shared Watch playback so the clip stays out of the microphone master."
                ]
            )
        }
        sharedWatchRouteFailureMessage = nil
        isSharedWatchPlaybackActive = true
        do {
            try applySharedCategory()
            if !isCallKitAudioActive {
                try audioSession.setActive(true)
            }
            try requirePrivateRouteDuringCapture()
        } catch {
            isSharedWatchPlaybackActive = false
            throw error
        }
    }

    private var hasPrivateListeningRoute: Bool {
        privateListeningRouteAvailable
    }

    private func refreshPrivateListeningRoute() {
        privateListeningRouteAvailable = audioSession.currentRoute.outputs.contains { output in
            switch output.portType {
            case .headphones,
                 .bluetoothA2DP,
                 .bluetoothHFP,
                 .bluetoothLE,
                 .usbAudio:
                true
            default:
                false
            }
        }
    }

    private func refreshRouteSnapshot() {
        refreshPrivateListeningRoute()
        isBuiltInSpeakerActive = audioSession.currentRoute.outputs.contains {
            $0.portType == .builtInSpeaker
        }
        currentInputRouteName = routeNames(
            audioSession.currentRoute.inputs,
            fallback: "No microphone active",
            builtInFallback: CaptureDeviceVocabulary.builtInMicrophone,
            includeSelectedDataSource: true
        )
        currentOutputRouteName = routeNames(
            audioSession.currentRoute.outputs,
            fallback: CaptureDeviceVocabulary.audioRoute,
            builtInFallback: "\(CaptureDeviceVocabulary.deviceName) speaker",
            includeSelectedDataSource: false
        )
    }

    private func routeNames(
        _ ports: [AVAudioSessionPortDescription],
        fallback: String,
        builtInFallback: String,
        includeSelectedDataSource: Bool
    ) -> String {
        let names = ports.map { port -> String in
            let systemName = port.portName.trimmingCharacters(in: .whitespacesAndNewlines)
            let portName = switch port.portType {
            case .builtInMic, .builtInReceiver, .builtInSpeaker:
                systemName.isEmpty || systemName == port.portType.rawValue
                    ? builtInFallback
                    : systemName
            case .headphones, .headsetMic:
                systemName.isEmpty || systemName == port.portType.rawValue
                    ? "Headphones"
                    : systemName
            case .bluetoothA2DP, .bluetoothHFP, .bluetoothLE:
                systemName.isEmpty || systemName == port.portType.rawValue
                    ? "Bluetooth audio"
                    : systemName
            case .usbAudio:
                systemName.isEmpty || systemName == port.portType.rawValue
                    ? "USB audio"
                    : systemName
            default:
                systemName.isEmpty ? port.portType.rawValue : systemName
            }
            guard includeSelectedDataSource else { return portName }
            let dataSourceName = port.selectedDataSource?.dataSourceName
                .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            guard !dataSourceName.isEmpty,
                  dataSourceName.caseInsensitiveCompare(portName) != .orderedSame else {
                return portName
            }
            return "\(portName) · \(dataSourceName)"
        }
        .filter { !$0.isEmpty }
        return names.isEmpty ? fallback : names.joined(separator: " + ")
    }

    func endSharedWatchPlayback() {
        isSharedWatchPlaybackActive = false
        reconcileAfterLeaseChange()
    }

    /// The system route picker owns external destinations. This conventional
    /// call control only toggles the iPhone speaker override; clearing it lets
    /// iOS restore the receiver or the selected wired/Bluetooth route.
    func toggleBuiltInSpeaker() throws {
        guard isProviderRoomActive || isCallKitAudioActive else {
            throw NSError(
                domain: "CaptureAudioSession",
                code: 3,
                userInfo: [NSLocalizedDescriptionKey: "Join the call before changing the device speaker."]
            )
        }
        try audioSession.overrideOutputAudioPort(
            isBuiltInSpeakerActive ? .none : .speaker
        )
        refreshRouteSnapshot()
    }

    private func requirePrivateRouteDuringCapture() throws {
        // A private output is a Shared Watch requirement, not a blanket
        // recording requirement. Standalone audio/video capture has no
        // reference playback to leak into its microphone and must remain
        // usable without headphones.
        guard isSharedWatchPlaybackActive else {
            return
        }
        guard isLocalCaptureActive || isProviderRoomActive || isCallKitAudioActive else {
            return
        }
        guard hasPrivateListeningRoute else {
            throw NSError(
                domain: "CaptureAudioSession",
                code: 2,
                userInfo: [
                    NSLocalizedDescriptionKey:
                        "Shared Watch paused because its private headphone route is no longer available."
                ]
            )
        }
    }

    private func holdSharedWatchForUnsafeRoute() {
        guard isSharedWatchPlaybackActive else { return }
        do {
            try requirePrivateRouteDuringCapture()
        } catch {
            isSharedWatchPlaybackActive = false
            sharedWatchRouteFailureMessage = error.localizedDescription
            reconcileAfterLeaseChange()
        }
    }

    private func applySharedCategory() throws {
        let mode = Self.preferredMode(
            providerRoomActive: isProviderRoomActive,
            callKitAudioActive: isCallKitAudioActive
        )
        var options: AVAudioSession.CategoryOptions = [
            .defaultToSpeaker,
            .allowBluetoothHFP,
        ]
        if #available(iOS 26.0, *), mode == .default {
            // Apple's creator-focused Bluetooth path can provide full-bandwidth
            // input on supported AirPods. HFP remains the automatic fallback,
            // and real-time call audio deliberately stays on voiceChat because
            // the high-quality mode adds latency and only supports `.default`.
            options.insert(.bluetoothHighQualityRecording)
        }
        try audioSession.setCategory(
            .playAndRecord,
            mode: mode,
            // Capture is primary audio. A book, podcast, or music app should
            // yield when Record/Join activates this session, just as it does
            // for Voice Memos or a call. Mixing can also prevent aggregated
            // input/output from becoming available when another app already
            // owns a non-mixable audio session. Deactivation below uses
            // notifyOthersOnDeactivation so the interrupted app may resume.
            options: options
        )
    }

    /// Conversation transport needs Apple's voice-processing route. A local
    /// participant master or spoken draft uses the ordinary recording route so
    /// iOS can select a usable built-in microphone for the current device. Do
    /// not force a built-in data source here: its physical orientation is not a
    /// reliable proxy for speech level, and the current route plus selected
    /// data source are retained as source evidence for diagnosis.
    /// `measurement` is deliberately avoided here: Apple specifies that it
    /// forces the primary microphone on multi-microphone devices, and physical
    /// iPad acceptance proved that route can resolve to an effectively silent
    /// top data source. `videoRecording` is not an audio-quality synonym either:
    /// Apple defines it as a movie mode that selects the microphone nearest the
    /// camera, which can silently move an audio-only take onto a camera-facing
    /// data source.
    nonisolated static func preferredMode(
        providerRoomActive: Bool,
        callKitAudioActive: Bool
    ) -> AVAudioSession.Mode {
        providerRoomActive || callKitAudioActive ? .voiceChat : .default
    }

    private func releaseProviderInputRetention() {
        guard isProviderInputRetentionActive else { return }
        isProviderInputRetentionActive = false
        #if canImport(LiveKit)
        if !isCallKitAudioActive {
            try? AudioManager.shared.setEngineAvailability(.none)
        }
        #endif
    }

    private func reconcileAfterLeaseChange() {
        do {
            if isLocalCaptureActive || isCallKitAudioActive {
                try applySharedCategory()
                // CallKit owns activation while its lease is active. Calling
                // setActive here is safe for the recorder/provider-only cases.
                if isLocalCaptureActive && !isCallKitAudioActive {
                    try audioSession.setActive(true)
                }
            } else if isSharedWatchPlaybackActive {
                try applySharedCategory()
                try audioSession.setActive(true)
            } else if isProviderRoomActive {
                // A connected provider room may stay signaled between CallKit
                // activation windows, but its audio engine must remain held.
                try applySharedCategory()
            } else if !isLocalPlaybackActive {
                try audioSession.setActive(false, options: .notifyOthersOnDeactivation)
            }
        } catch {
            // Callers own user-facing errors for start/join. Cleanup is best
            // effort because media preservation is safer than throwing here.
            print("Could not reconcile Capture audio session: \(error.localizedDescription)")
        }
    }
}
