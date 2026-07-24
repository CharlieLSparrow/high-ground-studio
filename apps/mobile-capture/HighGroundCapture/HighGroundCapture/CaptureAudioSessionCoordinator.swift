import AVFoundation
import Combine

#if canImport(LiveKit)
@preconcurrency import LiveKit
#endif

/// Owns the process-wide AVAudioSession policy for Capture.
///
/// AVAudioRecorder, CallKit, and the provider SDK all share one system audio
/// session. Keeping their leases here prevents a local-recorder stop from
/// deactivating a connected room and makes the recorded scope explicit: the
/// local file contains this iPhone's selected microphone, not provider egress.
@MainActor
final class CaptureAudioSessionCoordinator: ObservableObject {
    static let shared = CaptureAudioSessionCoordinator()

    @Published private(set) var isLocalCaptureActive = false
    @Published private(set) var isProviderRoomActive = false
    @Published private(set) var isCallKitAudioActive = false
    @Published private(set) var isLocalPlaybackActive = false

    private let audioSession = AVAudioSession.sharedInstance()

    private init() {
        #if canImport(LiveKit)
        // CallKit, not the provider SDK, owns activation timing. LiveKit's
        // engine stays unavailable until CXProvider tells us the system audio
        // session is active.
        AudioManager.shared.audioSession.isAutomaticConfigurationEnabled = false
        try? AudioManager.shared.setEngineAvailability(.none)
        #endif
    }

    func prepareLocalCaptureRoute() throws {
        try applySharedCategory()
        try audioSession.setPreferredSampleRate(48_000)
    }

    func activateLocalCapture() throws {
        isLocalPlaybackActive = false
        isLocalCaptureActive = true
        do {
            try applySharedCategory()
            try audioSession.setPreferredSampleRate(48_000)
            if !isCallKitAudioActive {
                try audioSession.setActive(true)
            }
        } catch {
            isLocalCaptureActive = false
            throw error
        }
    }

    func releaseLocalCapture() {
        isLocalCaptureActive = false
        reconcileAfterLeaseChange()
    }

    func providerWillConnect() throws {
        isProviderRoomActive = true
        do {
            try applySharedCategory()
            #if canImport(LiveKit)
            AudioManager.shared.audioSession.isAutomaticConfigurationEnabled = false
            try AudioManager.shared.setEngineAvailability(.none)
            #endif
            if isLocalCaptureActive {
                try audioSession.setActive(true)
            }
        } catch {
            isProviderRoomActive = false
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
            options: [.mixWithOthers, .defaultToSpeaker, .allowBluetoothHFP]
        )
        #if canImport(LiveKit)
        try AudioManager.shared.setEngineAvailability(.default)
        #endif
        isCallKitAudioActive = true
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
            try AudioManager.shared.setEngineAvailability(.none)
        } catch {
            cleanupFailures.append("provider engine: \(error.localizedDescription)")
        }
        #endif

        do {
            if isLocalCaptureActive {
                try applySharedCategory()
                try audioSession.setPreferredSampleRate(48_000)
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
        guard !isLocalCaptureActive, !isProviderRoomActive, !isCallKitAudioActive else {
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

    private func applySharedCategory() throws {
        let mode: AVAudioSession.Mode = (isProviderRoomActive || isCallKitAudioActive) ? .voiceChat : .videoRecording
        try audioSession.setCategory(
            .playAndRecord,
            mode: mode,
            options: [.defaultToSpeaker, .allowBluetoothHFP, .mixWithOthers]
        )
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
