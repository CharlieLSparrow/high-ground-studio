import Foundation
import AVFoundation
import MediaPlayer

class AudioCaptureController: NSObject, AVAudioRecorderDelegate {
    private var audioRecorder: AVAudioRecorder?
    private var currentRecordingURL: URL?
    private var state: RecorderState = .stopped
    private var startTime: Date?
    private var accumulatedDuration: TimeInterval = 0
    private var overallStartTimestamp: Date?

    private var activeProjectSlug: String?
    private var activeEpisodeSlug: String?

    private var segments: [RecordingSegment] = []
    private var currentSegmentStart: Date?

    // Callback to notify WebView of state changes
    var onStateChange: ((RecorderEvent) -> Void)?

    override init() {
        super.init()
        cleanupOldRecordings()
        setupInterruptionHandling()
        setupUploadObservers()
        setupRemoteCommands()
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
              let success = userInfo["success"] as? Bool else { return }

        if success, let sourceId = userInfo["sourceId"] as? String {
            let detail = EventDetail(mediaAssetId: sourceId)
            let event = RecorderEvent(type: .uploadComplete, detail: detail)
            onStateChange?(event)
        } else {
            let error = userInfo["error"] as? String ?? "Upload failed"
            let detail = EventDetail(errorMessage: error)
            let event = RecorderEvent(type: .error, detail: detail)
            onStateChange?(event)
        }
    }

    @objc private func handleUploadProgress(notification: Notification) {
        guard let userInfo = notification.userInfo,
              let progress = userInfo["progress"] as? Double else { return }

        let detail = EventDetail(progress: progress)
        let event = RecorderEvent(type: .uploadProgress, detail: detail)
        onStateChange?(event)
    }

    private func setupInterruptionHandling() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleInterruption),
            name: AVAudioSession.interruptionNotification,
            object: nil
        )
    }

    @objc private func handleInterruption(notification: Notification) {
        guard let userInfo = notification.userInfo,
              let typeValue = userInfo[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: typeValue) else {
            return
        }

        if type == .began {
            // Audio interrupted (e.g. phone call). Pause recording safely.
            if state == .recording {
                pauseRecording()
                print("Audio session interrupted. Auto-paused recording.")
            }
        }
    }

    private func cleanupOldRecordings() {
        let fileManager = FileManager.default
        let documentPath = fileManager.urls(for: .documentDirectory, in: .userDomainMask)[0]

        do {
            let files = try fileManager.contentsOfDirectory(at: documentPath, includingPropertiesForKeys: [.creationDateKey])
            let now = Date()

            for file in files where file.pathExtension == "m4a" {
                if let attrs = try? fileManager.attributesOfItem(atPath: file.path),
                   let creationDate = attrs[.creationDate] as? Date {
                    // Purge anything older than 24 hours to prevent storage leaks
                    if now.timeIntervalSince(creationDate) > 86400 {
                        try fileManager.removeItem(at: file)
                        print("Cleaned up orphaned recording: \(file.lastPathComponent)")
                    }
                }
            }
        } catch {
            print("Failed to cleanup old recordings: \(error)")
        }
    }

    func setupAudioSession() {
        let audioSession = AVAudioSession.sharedInstance()
        do {
            // mixWithOthers is critical to prevent silent suspension by the OS
            try audioSession.setCategory(.playAndRecord, mode: .videoRecording, options: [.defaultToSpeaker, .allowBluetooth, .mixWithOthers])
            try audioSession.setActive(true)
        } catch {
            print("Failed to set up audio session: \(error)")
        }
    }

    func handleCommand(_ command: RecorderCommand) {
        switch command.action {
        case .start:
            if let projectSlug = command.projectSlug, let episodeSlug = command.episodeSlug {
                activeProjectSlug = projectSlug
                activeEpisodeSlug = episodeSlug
            }
            startRecording()
        case .stop:
            stopRecording()
        case .pause:
            pauseRecording()
        case .resume:
            resumeRecording()
        case .markBreak:
            markBreak()
        }
    }

    private func endCurrentSegment(reason: RecordingStopReason) {
        guard let start = currentSegmentStart else { return }
        let now = Date()
        let durationSec = now.timeIntervalSince(start)

        let segment = RecordingSegment(
            id: "seg-\(Int(now.timeIntervalSince1970 * 1000))",
            sessionId: "native-ios-session",
            participantId: "local-user",
            deviceKind: "ios-app",
            status: "local-ready",
            startedAt: ISO8601DateFormatter().string(from: start),
            stoppedAt: ISO8601DateFormatter().string(from: now),
            durationSeconds: durationSec,
            stopReason: reason
        )
        segments.append(segment)
        currentSegmentStart = nil
    }

    private func startNewSegment() {
        currentSegmentStart = Date()
    }

    private func markBreak() {
        if state == .recording {
            endCurrentSegment(reason: .interruption)
            startNewSegment()
        }
    }

    private func startRecording() {
        let audioSession = AVAudioSession.sharedInstance()
        switch audioSession.recordPermission {
        case .granted:
            beginActualRecording()
        case .denied:
            broadcastError(message: "Microphone permission denied. Please enable it in Settings.")
        case .undetermined:
            audioSession.requestRecordPermission { [weak self] allowed in
                DispatchQueue.main.async {
                    if allowed {
                        self?.beginActualRecording()
                    } else {
                        self?.broadcastError(message: "Microphone permission denied. Please enable it in Settings.")
                    }
                }
            }
        @unknown default:
            broadcastError(message: "Unknown microphone permission state.")
        }
    }

    private func beginActualRecording() {
        setupAudioSession()

        let documentPath = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let fileName = "quipsly_recording_\(Date().timeIntervalSince1970).m4a"
        let audioFilename = documentPath.appendingPathComponent(fileName)
        currentRecordingURL = audioFilename

        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 44100.0,
            AVNumberOfChannelsKey: 1,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
        ]

        do {
            audioRecorder = try AVAudioRecorder(url: audioFilename, settings: settings)
            audioRecorder?.delegate = self
            audioRecorder?.record()

            state = .recording
            let now = Date()
            startTime = now
            overallStartTimestamp = now
            accumulatedDuration = 0
            segments = []
            startNewSegment()

            broadcastState()
            updateNowPlayingInfo()
        } catch {
            print("Could not start recording: \(error)")
            broadcastError(message: error.localizedDescription)
        }
    }

    private func stopRecording() {
        if state == .recording {
            endCurrentSegment(reason: .userStop)
        }
        audioRecorder?.stop()
        audioRecorder = nil

        if state == .recording, let start = startTime {
            accumulatedDuration += Date().timeIntervalSince(start)
        }

        state = .stopped
        broadcastState()
        clearNowPlayingInfo()

        guard let fileUrl = currentRecordingURL,
              let projectSlug = activeProjectSlug,
              let episodeSlug = activeEpisodeSlug,
              let overallStart = overallStartTimestamp else {
            return
        }

        let startedAtString = ISO8601DateFormatter().string(from: overallStart)
        let stoppedAtString = ISO8601DateFormatter().string(from: Date())

        var segmentsJson: String? = nil
        if let data = try? JSONEncoder().encode(segments) {
            segmentsJson = String(data: data, encoding: .utf8)
        }

        UploadManager.shared.startUpload(
            fileUrl: fileUrl,
            projectSlug: projectSlug,
            episodeSlug: episodeSlug,
            startedAt: startedAtString,
            stoppedAt: stoppedAtString,
            recordingSegmentsJson: segmentsJson
        )
    }

    private func pauseRecording() {
        audioRecorder?.pause()
        endCurrentSegment(reason: .pause)
        if let start = startTime {
            accumulatedDuration += Date().timeIntervalSince(start)
        }
        startTime = nil
        state = .paused
        broadcastState()
        updateNowPlayingInfo()
    }

    private func resumeRecording() {
        setupAudioSession()
        audioRecorder?.record()
        startTime = Date()
        startNewSegment()
        state = .recording
        broadcastState()
        updateNowPlayingInfo()
    }

    private func broadcastState() {
        var currentDuration = accumulatedDuration
        if state == .recording, let start = startTime {
            currentDuration += Date().timeIntervalSince(start)
        }
        let durationMs = Int(currentDuration * 1000)

        let detail = EventDetail(state: state, durationMs: durationMs)
        let event = RecorderEvent(type: .stateChange, detail: detail)
        onStateChange?(event)
    }

    private func broadcastError(message: String) {
        let detail = EventDetail(errorMessage: message)
        let event = RecorderEvent(type: .error, detail: detail)
        onStateChange?(event)
    }

    // MARK: - Lock Screen Controls (MPNowPlayingInfoCenter)
    private func setupRemoteCommands() {
        let commandCenter = MPRemoteCommandCenter.shared()

        commandCenter.pauseCommand.addTarget { [weak self] event in
            guard let self = self, self.state == .recording else { return .commandFailed }
            self.pauseRecording()
            return .success
        }

        commandCenter.playCommand.addTarget { [weak self] event in
            guard let self = self, self.state == .paused else { return .commandFailed }
            self.resumeRecording()
            return .success
        }
    }

    private func updateNowPlayingInfo() {
        let center = MPNowPlayingInfoCenter.default()
        var nowPlayingInfo = [String: Any]()

        nowPlayingInfo[MPMediaItemPropertyTitle] = "Recording Quipsly Episode"
        if let episodeSlug = activeEpisodeSlug {
            nowPlayingInfo[MPMediaItemPropertyArtist] = episodeSlug
        }

        // Duration properties so the lock screen timer runs
        var currentDuration = accumulatedDuration
        if state == .recording, let start = startTime {
            currentDuration += Date().timeIntervalSince(start)
        }

        nowPlayingInfo[MPNowPlayingInfoPropertyElapsedPlaybackTime] = currentDuration
        nowPlayingInfo[MPNowPlayingInfoPropertyPlaybackRate] = state == .recording ? 1.0 : 0.0

        // Prevent scrubbing
        let commandCenter = MPRemoteCommandCenter.shared()
        commandCenter.changePlaybackPositionCommand.isEnabled = false

        center.nowPlayingInfo = nowPlayingInfo
    }

    private func clearNowPlayingInfo() {
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }
}
