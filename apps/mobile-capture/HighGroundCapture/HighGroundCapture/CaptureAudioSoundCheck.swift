import AVFoundation
import Combine
import Foundation
import UIKit

@MainActor
final class CaptureAudioSoundCheckController: NSObject, ObservableObject,
    AVAudioPlayerDelegate
{
    enum State: Equatable {
        case idle
        case requestingPermission
        case recording
        case ready
        case playing
        case failed

        var isBusy: Bool {
            self == .requestingPermission || self == .recording
        }
    }

    @Published private(set) var state: State = .idle
    @Published private(set) var elapsed: TimeInterval = 0
    @Published private(set) var liveAveragePowerDBFS: Float = -160
    @Published private(set) var livePeakPowerDBFS: Float = -160
    @Published private(set) var summary: CaptureAudioSoundCheckSummary?
    @Published private(set) var checkID: UUID?
    @Published private(set) var playbackCompleted = false
    @Published private(set) var playbackOutputRouteName: String?
    @Published private(set) var playbackDecision: CaptureAudioSoundCheckPlaybackDecision?
    @Published private(set) var message: String?

    let maximumDuration: TimeInterval = 10
    let minimumUsefulDuration: TimeInterval = 3

    private let audioSession = AVAudioSession.sharedInstance()
    private let coordinator = CaptureAudioSessionCoordinator.shared
    private var recorder: AVAudioRecorder?
    private var player: AVAudioPlayer?
    private var meterTask: Task<Void, Never>?
    private var automaticStopTask: Task<Void, Never>?
    private var startedAt: Date?
    private var soundCheckURL: URL?
    private var routeName = "Unknown microphone"
    private var powerSum = 0.0
    private var observationCount = 0
    private var maximumPeakDBFS: Float = -160
    private var nearFullScaleObservationCount = 0
    private var interruptionTask: Task<Void, Never>?
    private var routeChangeTask: Task<Void, Never>?
    private var backgroundTask: Task<Void, Never>?

    override init() {
        super.init()
        purgeAbandonedChecks()
        let observedAudioSession = audioSession
        interruptionTask = Task { @MainActor [weak self] in
            for await _ in NotificationCenter.default.notifications(
                named: AVAudioSession.interruptionNotification,
                object: observedAudioSession
            ) {
                guard let self else { return }
                self.finishRecording(
                    note: "The sound check stopped when iOS interrupted audio. Review the preserved local check or run it again."
                )
            }
        }
        routeChangeTask = Task { @MainActor [weak self] in
            for await _ in NotificationCenter.default.notifications(
                named: AVAudioSession.routeChangeNotification,
                object: observedAudioSession
            ) {
                guard let self else { return }
                if self.state == .recording {
                    self.finishRecording(
                        note: "The sound check stopped because the audio route changed. Run a new check on the current microphone."
                    )
                } else if self.state == .playing {
                    self.stopPlayback()
                    self.invalidatePlaybackEvidence(
                        "The listening route changed before playback completed. Listen to the full check again on the current output."
                    )
                }
            }
        }
        backgroundTask = Task { @MainActor [weak self] in
            for await _ in NotificationCenter.default.notifications(
                named: UIApplication.didEnterBackgroundNotification
            ) {
                guard let self else { return }
                guard self.state == .recording else { continue }
                self.finishRecording(
                    note: "The sound check stopped when Quipsly moved to the background. Review the preserved local check or run it again in the foreground."
                )
            }
        }
    }

    deinit {
        interruptionTask?.cancel()
        routeChangeTask?.cancel()
        backgroundTask?.cancel()
        automaticStopTask?.cancel()
        meterTask?.cancel()
    }

    func start(currentRouteName: String) async {
        guard state != .recording, state != .requestingPermission else { return }
        stopPlayback()
        discardFile(resetState: false)
        state = .requestingPermission
        message = nil
        summary = nil
        checkID = nil
        playbackCompleted = false
        playbackOutputRouteName = nil
        playbackDecision = nil

        let permissionGranted = await resolveMicrophonePermission()
        guard permissionGranted else {
            fail("Microphone access is off. Enable it in Settings before running a sound check.")
            return
        }

        do {
            try coordinator.activateLocalCapture()
            // Activation may interrupt another app and select a different port
            // or built-in microphone data source. Bind the saved check to the
            // route that actually receives PCM, not the pre-activation label.
            routeName = normalizedRouteName(
                coordinator.currentInputRouteName == "No microphone active"
                    ? currentRouteName
                    : coordinator.currentInputRouteName
            )
            let url = try makeSoundCheckURL()
            let settings: [String: Any] = [
                AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
                AVSampleRateKey: 48_000.0,
                AVNumberOfChannelsKey: 1,
                AVEncoderBitRateKey: 192_000,
                AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue,
            ]
            let nextRecorder = try AVAudioRecorder(url: url, settings: settings)
            nextRecorder.isMeteringEnabled = true
            guard nextRecorder.prepareToRecord(), nextRecorder.record() else {
                throw NSError(
                    domain: "QuipslyCaptureSoundCheck",
                    code: 1,
                    userInfo: [NSLocalizedDescriptionKey: "The microphone recorder did not start."]
                )
            }
            try FileManager.default.setAttributes(
                [.protectionKey: FileProtectionType.complete],
                ofItemAtPath: url.path
            )
            recorder = nextRecorder
            soundCheckURL = url
            startedAt = Date()
            elapsed = 0
            liveAveragePowerDBFS = -160
            livePeakPowerDBFS = -160
            powerSum = 0
            observationCount = 0
            maximumPeakDBFS = -160
            nearFullScaleObservationCount = 0
            state = .recording
            startMeterTimer()
            automaticStopTask?.cancel()
            automaticStopTask = Task { [weak self] in
                try? await Task.sleep(for: .seconds(10))
                guard !Task.isCancelled else { return }
                await MainActor.run {
                    self?.finishRecording()
                }
            }
        } catch {
            coordinator.releaseLocalCapture()
            fail("The sound check could not start: \(error.localizedDescription)")
        }
    }

    func finishRecording(note: String? = nil) {
        guard state == .recording else { return }
        automaticStopTask?.cancel()
        automaticStopTask = nil
        collectMeterObservation()
        let recorderSettings = recorder?.settings ?? [:]
        let sampleRateHz = Int(
            (recorderSettings[AVSampleRateKey] as? NSNumber)?.doubleValue
                ?? 48_000
        )
        let channelCount =
            (recorderSettings[AVNumberOfChannelsKey] as? NSNumber)?.intValue
                ?? 1
        recorder?.stop()
        recorder = nil
        meterTask?.cancel()
        meterTask = nil
        coordinator.releaseLocalCapture()

        let duration = startedAt.map { Date().timeIntervalSince($0) } ?? elapsed
        elapsed = min(maximumDuration, max(0, duration))
        let average = combinedAveragePowerDBFS()
        summary = CaptureAudioSoundCheckSummary.evaluate(
            duration: elapsed,
            averagePowerDBFS: average,
            peakPowerDBFS: maximumPeakDBFS,
            nearFullScaleObservationCount: nearFullScaleObservationCount,
            observationCount: observationCount,
            sampleRateHz: sampleRateHz,
            channelCount: channelCount,
            routeName: routeName
        )
        checkID = UUID()
        playbackCompleted = false
        playbackOutputRouteName = nil
        playbackDecision = nil
        liveAveragePowerDBFS = average
        livePeakPowerDBFS = maximumPeakDBFS
        state = .ready
        message = note ?? (elapsed < minimumUsefulDuration
            ? "That check was short. Listen back, then run at least three seconds of normal speech for a stronger level reading."
            : nil)
    }

    func play() {
        guard state == .ready, let soundCheckURL else { return }
        do {
            playbackCompleted = false
            playbackDecision = nil
            try coordinator.beginLocalPlayback()
            playbackOutputRouteName = currentOutputRouteName()
            let nextPlayer = try AVAudioPlayer(contentsOf: soundCheckURL)
            nextPlayer.delegate = self
            guard nextPlayer.play() else {
                throw NSError(
                    domain: "QuipslyCaptureSoundCheck",
                    code: 2,
                    userInfo: [NSLocalizedDescriptionKey: "The protected local check did not begin playback."]
                )
            }
            player = nextPlayer
            state = .playing
            message = "Listen for mouth clicks, plosives, room echo, clothing rub, and reference-audio bleed. Level measurements cannot judge those by themselves."
        } catch {
            coordinator.endLocalPlayback()
            player = nil
            state = .ready
            message = "The local check could not play: \(error.localizedDescription)"
        }
    }

    func stopPlayback() {
        guard player != nil || state == .playing else { return }
        player?.stop()
        player = nil
        coordinator.endLocalPlayback()
        if summary != nil { state = .ready }
    }

    func recordPlaybackDecision(_ decision: CaptureAudioSoundCheckPlaybackDecision) {
        guard playbackCompleted, summary != nil else {
            message = "Listen to the complete private sample before saving what you heard."
            return
        }
        playbackDecision = decision
        message = decision == .heardClear
            ? "Your full listen-back decision is ready to share as a receipt. The private audio stays on \(CaptureDeviceVocabulary.thisDevice)."
            : "Your concern is ready to share as a needs-adjustment receipt. The private audio stays on \(CaptureDeviceVocabulary.thisDevice)."
    }

    #if DEBUG && targetEnvironment(simulator)
    /// Reprojects an already-persisted synthetic receipt into the ephemeral
    /// sound-check UI. It exists only so an operated UI test can prove that
    /// the protected receipt survives process death without retaining audio.
    func installSessionPreflightOutboxUITestFixture(
        id: UUID,
        createdAt: Date,
        routeName: String,
        outputRouteName: String
    ) {
        stopPlayback()
        discardFile(resetState: false)
        summary = CaptureAudioSoundCheckSummary.evaluate(
            duration: 6.25,
            averagePowerDBFS: -24,
            peakPowerDBFS: -8,
            nearFullScaleObservationCount: 0,
            observationCount: 78,
            routeName: routeName,
            createdAt: createdAt
        )
        checkID = id
        playbackCompleted = true
        playbackOutputRouteName = outputRouteName
        playbackDecision = .heardClear
        state = .ready
        message = "Protected setup receipt recovered without retaining its private sample."
    }
    #endif

    func discard() {
        if state == .recording {
            finishRecording()
        }
        stopPlayback()
        discardFile(resetState: true)
    }

    func audioPlayerDidFinishPlaying(
        _ player: AVAudioPlayer,
        successfully flag: Bool
    ) {
        self.player = nil
        coordinator.endLocalPlayback()
        state = summary == nil ? .idle : .ready
        if flag {
            playbackCompleted = true
            playbackOutputRouteName = currentOutputRouteName()
            playbackDecision = nil
            message = "Full listen-back completed. Record whether this setup sounded clear or needs adjustment."
        } else {
            playbackCompleted = false
            playbackDecision = nil
            message = "Playback ended before iOS reported a complete listen-back. The local check remains available."
        }
    }

    private func startMeterTimer() {
        meterTask?.cancel()
        meterTask = Task { @MainActor [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(80))
                guard !Task.isCancelled, let self else { return }
                self.collectMeterObservation()
            }
        }
    }

    private func collectMeterObservation() {
        guard let recorder, recorder.isRecording else { return }
        recorder.updateMeters()
        let channelCount = max(
            1,
            recorder.settings[AVNumberOfChannelsKey] as? Int ?? 1
        )
        let average = (0..<channelCount)
            .map { recorder.averagePower(forChannel: $0) }
            .max() ?? -160
        let peak = (0..<channelCount)
            .map { recorder.peakPower(forChannel: $0) }
            .max() ?? -160
        liveAveragePowerDBFS = normalizedDecibels(average)
        livePeakPowerDBFS = normalizedDecibels(peak)
        maximumPeakDBFS = max(maximumPeakDBFS, livePeakPowerDBFS)
        if livePeakPowerDBFS >= CaptureAudioSoundCheckSummary.clippingRiskPeakDBFS {
            nearFullScaleObservationCount += 1
        }
        powerSum += pow(10, Double(liveAveragePowerDBFS) / 10)
        observationCount += 1
        if let startedAt {
            elapsed = min(maximumDuration, Date().timeIntervalSince(startedAt))
        }
    }

    private func combinedAveragePowerDBFS() -> Float {
        guard observationCount > 0, powerSum > 0 else { return -160 }
        return normalizedDecibels(
            Float(10 * log10(powerSum / Double(observationCount)))
        )
    }

    private func resolveMicrophonePermission() async -> Bool {
        switch AVAudioApplication.shared.recordPermission {
        case .granted:
            return true
        case .denied:
            return false
        case .undetermined:
            return await withCheckedContinuation { continuation in
                AVAudioApplication.requestRecordPermission { granted in
                    continuation.resume(returning: granted)
                }
            }
        @unknown default:
            return false
        }
    }

    private func makeSoundCheckURL() throws -> URL {
        let directory = try soundCheckDirectory()
        let url = directory.appendingPathComponent(
            "sound-check-\(UUID().uuidString.lowercased()).m4a",
            isDirectory: false
        )
        return url
    }

    private func soundCheckDirectory() throws -> URL {
        let caches = try FileManager.default.url(
            for: .cachesDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        let directory = caches
            .appendingPathComponent("Quipsly", isDirectory: true)
            .appendingPathComponent("SoundChecks", isDirectory: true)
        try FileManager.default.createDirectory(
            at: directory,
            withIntermediateDirectories: true,
            attributes: [.protectionKey: FileProtectionType.complete]
        )
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var mutableDirectory = directory
        try mutableDirectory.setResourceValues(values)
        return directory
    }

    private func purgeAbandonedChecks() {
        guard let directory = try? soundCheckDirectory(),
              let contents = try? FileManager.default.contentsOfDirectory(
                at: directory,
                includingPropertiesForKeys: nil
              ) else { return }
        for url in contents where url.pathExtension.lowercased() == "m4a" {
            try? FileManager.default.removeItem(at: url)
        }
    }

    private func discardFile(resetState: Bool) {
        if let soundCheckURL {
            try? FileManager.default.removeItem(at: soundCheckURL)
        }
        soundCheckURL = nil
        summary = nil
        checkID = nil
        playbackCompleted = false
        playbackOutputRouteName = nil
        playbackDecision = nil
        startedAt = nil
        elapsed = 0
        liveAveragePowerDBFS = -160
        livePeakPowerDBFS = -160
        if resetState {
            message = "The temporary sound check was deleted from \(CaptureDeviceVocabulary.thisDevice)."
            state = .idle
        }
    }

    private func fail(_ detail: String) {
        automaticStopTask?.cancel()
        automaticStopTask = nil
        meterTask?.cancel()
        meterTask = nil
        recorder?.stop()
        recorder = nil
        coordinator.releaseLocalCapture()
        state = .failed
        message = detail
    }

    private func normalizedRouteName(_ value: String) -> String {
        let normalized = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return normalized.isEmpty ? "Unknown microphone" : normalized
    }

    private func normalizedDecibels(_ value: Float) -> Float {
        guard value.isFinite else { return -160 }
        return min(0, max(-160, value))
    }

    private func invalidatePlaybackEvidence(_ detail: String) {
        playbackCompleted = false
        playbackOutputRouteName = nil
        playbackDecision = nil
        message = detail
    }

    private func currentOutputRouteName() -> String {
        let outputs = audioSession.currentRoute.outputs
            .map { output -> String in
                let name = output.portName.trimmingCharacters(in: .whitespacesAndNewlines)
                return name.isEmpty ? output.portType.rawValue : name
            }
            .filter { !$0.isEmpty }
        return outputs.isEmpty ? "\(CaptureDeviceVocabulary.deviceName) system output" : outputs.joined(separator: " + ")
    }
}
