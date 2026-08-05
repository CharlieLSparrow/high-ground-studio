import AVFoundation
import AudioToolbox
import Foundation

#if os(macOS)
import CoreAudio

public enum ProductionAudioSoundCheckPlaybackError:
    LocalizedError,
    Equatable
{
    case outputDeviceUnavailable(String)
    case outputDeviceHasNoChannels(String)
    case unableToSelectOutputDevice(OSStatus)
    case outputRouteMismatch(expected: String, observed: String?)

    public var errorDescription: String? {
        switch self {
        case .outputDeviceUnavailable(let name):
            "The selected headphone/output route is no longer available: \(name)."
        case .outputDeviceHasNoChannels(let name):
            "The selected route cannot play audio: \(name)."
        case .unableToSelectOutputDevice(let status):
            "Core Audio could not select the requested output route (OSStatus \(status))."
        case .outputRouteMismatch(let expected, let observed):
            "Playback was held because the output route did not lock. Expected \(expected); observed \(observed ?? "none")."
        }
    }
}

@MainActor
public final class ProductionAudioSoundCheckPlayer {
    public private(set) var isPlaying = false
    public private(set) var observedOutputUID: String?

    private let engine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    private var completion: (@MainActor () -> Void)?

    public init() {
        engine.attach(player)
    }

    deinit {
        player.stop()
        engine.stop()
    }

    public func play(
        fileURL: URL,
        outputDevice: CaptureAudioDeviceSnapshot,
        completion: @escaping @MainActor () -> Void
    ) throws {
        stop()
        guard outputDevice.hasOutput else {
            throw ProductionAudioSoundCheckPlaybackError
                .outputDeviceHasNoChannels(outputDevice.name)
        }
        guard let deviceID = MacAudioHardwareProbe.deviceID(
            forUID: outputDevice.id
        ) else {
            throw ProductionAudioSoundCheckPlaybackError
                .outputDeviceUnavailable(outputDevice.name)
        }
        let file = try AVAudioFile(forReading: fileURL)
        try selectOutputDevice(deviceID)

        engine.disconnectNodeOutput(player)
        engine.connect(
            player,
            to: engine.mainMixerNode,
            format: file.processingFormat
        )
        engine.prepare()
        try engine.start()

        let observed = currentOutputDeviceUID()
        observedOutputUID = observed
        guard observed == outputDevice.id else {
            engine.stop()
            throw ProductionAudioSoundCheckPlaybackError
                .outputRouteMismatch(
                    expected: outputDevice.id,
                    observed: observed
                )
        }

        self.completion = completion
        isPlaying = true
        player.scheduleFile(
            file,
            at: nil,
            completionCallbackType: .dataPlayedBack
        ) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self else { return }
                self.isPlaying = false
                self.engine.stop()
                let completion = self.completion
                self.completion = nil
                completion?()
            }
        }
        player.play()
    }

    public func stop() {
        player.stop()
        engine.stop()
        isPlaying = false
        completion = nil
    }

    private func selectOutputDevice(
        _ deviceID: AudioDeviceID
    ) throws {
        guard let audioUnit = engine.outputNode.audioUnit else {
            throw ProductionAudioSoundCheckPlaybackError
                .outputDeviceUnavailable("Core Audio output unit")
        }
        var mutableDeviceID = deviceID
        let status = AudioUnitSetProperty(
            audioUnit,
            kAudioOutputUnitProperty_CurrentDevice,
            kAudioUnitScope_Global,
            0,
            &mutableDeviceID,
            UInt32(MemoryLayout<AudioDeviceID>.size)
        )
        guard status == noErr else {
            throw ProductionAudioSoundCheckPlaybackError
                .unableToSelectOutputDevice(status)
        }
    }

    private func currentOutputDeviceUID() -> String? {
        guard let audioUnit = engine.outputNode.audioUnit else {
            return nil
        }
        var deviceID = AudioDeviceID(0)
        var byteCount = UInt32(MemoryLayout<AudioDeviceID>.size)
        let status = AudioUnitGetProperty(
            audioUnit,
            kAudioOutputUnitProperty_CurrentDevice,
            kAudioUnitScope_Global,
            0,
            &deviceID,
            &byteCount
        )
        guard status == noErr, deviceID != 0 else {
            return nil
        }
        return MacAudioHardwareProbe.deviceUID(for: deviceID)
    }
}

#endif
