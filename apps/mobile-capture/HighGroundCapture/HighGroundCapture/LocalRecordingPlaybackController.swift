import AVFoundation
import Combine

@MainActor
final class LocalRecordingPlaybackController: NSObject, ObservableObject {
    @Published private(set) var playingRecordingID: UUID?
    @Published private(set) var videoPlayer: AVPlayer?
    @Published private(set) var errorMessage: String?
    @Published private(set) var currentTime: TimeInterval = 0
    @Published private(set) var isPlaying = false

    private var audioPlayer: AVAudioPlayer?
    private var videoCompletionObserver: NSObjectProtocol?
    private var boundedStopTask: Task<Void, Never>?
    private var progressTimer: Timer?
    private let audioSessionCoordinator = CaptureAudioSessionCoordinator.shared
    private var accountCancellable: AnyCancellable?

    override init() {
        super.init()
        accountCancellable = NotificationCenter.default.publisher(
            for: .quipslyCaptureAccountIdentityDidChange
        ).sink { [weak self] _ in
            Task { @MainActor in self?.stop() }
        }
    }

    func toggle(recording: LocalRecording, library: LocalRecordingLibrary) {
        if playingRecordingID == recording.id {
            isPlaying ? pause() : resume()
            return
        }

        play(recording: recording, library: library, from: 0)
    }

    func isPlaying(recordingID: UUID) -> Bool {
        playingRecordingID == recordingID && isPlaying
    }

    func pause() {
        guard playingRecordingID != nil else { return }
        boundedStopTask?.cancel()
        boundedStopTask = nil
        stopProgressTimer()
        audioPlayer?.pause()
        videoPlayer?.pause()
        isPlaying = false
        audioSessionCoordinator.endLocalPlayback()
    }

    func resume() {
        guard let recordingID = playingRecordingID,
              audioPlayer != nil || videoPlayer != nil else { return }
        do {
            try audioSessionCoordinator.beginLocalPlayback()
            if let audioPlayer {
                guard audioPlayer.play() else {
                    throw NSError(
                        domain: "LocalRecordingPlayback",
                        code: 3,
                        userInfo: [NSLocalizedDescriptionKey: "The local audio take could not resume playback."]
                    )
                }
            } else {
                videoPlayer?.play()
            }
            isPlaying = true
            startProgressTimer(recordingID: recordingID)
            errorMessage = nil
        } catch {
            audioSessionCoordinator.endLocalPlayback()
            isPlaying = false
            errorMessage = error.localizedDescription
        }
    }

    func seek(to requestedSeconds: TimeInterval) {
        guard playingRecordingID != nil else { return }
        let duration = audioPlayer?.duration
            ?? videoPlayer?.currentItem?.duration.seconds
            ?? requestedSeconds
        let finiteDuration = duration.isFinite ? max(duration, 0) : max(requestedSeconds, 0)
        let seconds = min(max(requestedSeconds.isFinite ? requestedSeconds : 0, 0), finiteDuration)
        boundedStopTask?.cancel()
        boundedStopTask = nil
        if let audioPlayer {
            audioPlayer.currentTime = seconds
        } else {
            videoPlayer?.seek(
                to: CMTime(seconds: seconds, preferredTimescale: 600),
                toleranceBefore: .zero,
                toleranceAfter: .zero
            )
        }
        currentTime = seconds
    }

    func skip(by deltaSeconds: TimeInterval) {
        seek(to: currentTime + deltaSeconds)
    }

    func prepare(
        recording: LocalRecording,
        library: LocalRecordingLibrary,
        at requestedSeconds: TimeInterval
    ) {
        if playingRecordingID == recording.id {
            seek(to: requestedSeconds)
            return
        }
        stop()
        guard let fileURL = playbackFileURL(for: recording, library: library) else { return }
        let seconds = min(max(requestedSeconds.isFinite ? requestedSeconds : 0, 0), recording.durationSeconds)
        do {
            if recording.effectiveMediaKind == .video {
                let item = AVPlayerItem(url: fileURL)
                let player = AVPlayer(playerItem: item)
                videoCompletionObserver = NotificationCenter.default.addObserver(
                    forName: .AVPlayerItemDidPlayToEndTime,
                    object: item,
                    queue: .main
                ) { [weak self] _ in
                    MainActor.assumeIsolated { self?.stop() }
                }
                player.seek(
                    to: CMTime(seconds: seconds, preferredTimescale: 600),
                    toleranceBefore: .zero,
                    toleranceAfter: .zero
                )
                videoPlayer = player
            } else {
                let player = try AVAudioPlayer(contentsOf: fileURL)
                player.delegate = self
                guard player.prepareToPlay() else {
                    throw NSError(
                        domain: "LocalRecordingPlayback",
                        code: 1,
                        userInfo: [NSLocalizedDescriptionKey: "The local audio take could not prepare for playback."]
                    )
                }
                player.currentTime = min(seconds, player.duration)
                audioPlayer = player
            }
            playingRecordingID = recording.id
            currentTime = seconds
            isPlaying = false
            errorMessage = nil
        } catch {
            audioPlayer = nil
            videoPlayer = nil
            playingRecordingID = nil
            currentTime = 0
            isPlaying = false
            errorMessage = error.localizedDescription
        }
    }

    func play(
        recording: LocalRecording,
        library: LocalRecordingLibrary,
        from startSeconds: TimeInterval,
        until endSeconds: TimeInterval? = nil,
        volume: Float = 1
    ) {
        stop()
        guard let fileURL = playbackFileURL(for: recording, library: library) else { return }

        recording.effectiveMediaKind == .video
            ? beginVideoPlayback(
                recordingID: recording.id,
                fileURL: fileURL,
                startSeconds: startSeconds,
                volume: volume
            )
            : beginAudioPlayback(
                recordingID: recording.id,
                fileURL: fileURL,
                startSeconds: startSeconds,
                volume: volume
            )
        scheduleBoundedStop(
            recordingID: recording.id,
            startSeconds: startSeconds,
            endSeconds: endSeconds
        )
    }

    func stop() {
        boundedStopTask?.cancel()
        boundedStopTask = nil
        stopProgressTimer()
        audioPlayer?.stop()
        audioPlayer = nil
        videoPlayer?.pause()
        videoPlayer = nil
        if let videoCompletionObserver {
            NotificationCenter.default.removeObserver(videoCompletionObserver)
            self.videoCompletionObserver = nil
        }
        playingRecordingID = nil
        isPlaying = false
        currentTime = 0
        audioSessionCoordinator.endLocalPlayback()
    }

    func setVolume(_ requestedVolume: Float) {
        let volume = min(max(requestedVolume.isFinite ? requestedVolume : 1, 0), 1)
        audioPlayer?.volume = volume
        videoPlayer?.volume = volume
    }

    private func playbackFileURL(
        for recording: LocalRecording,
        library: LocalRecordingLibrary
    ) -> URL? {
        guard recording.status.isPlaybackEligible else {
            if recording.status == .validatingRecovery {
                errorMessage = "Quipsly is still validating this preserved source through its end. Playback will unlock only after that check is durably saved."
            } else if recording.status == .needsRepair {
                errorMessage = "Quipsly preserved this source, but it needs repair before playback can be trusted."
            } else {
                errorMessage = "Finish and validate this local source before playback."
            }
            return nil
        }
        guard let fileURL = library.fileURL(for: recording) else {
            errorMessage = "This source belongs to a different or unverified Quipsly account."
            return nil
        }
        guard FileManager.default.fileExists(atPath: fileURL.path) else {
            errorMessage = "The local source file is not currently available."
            return nil
        }
        return fileURL
    }

    private func scheduleBoundedStop(
        recordingID: UUID,
        startSeconds: TimeInterval,
        endSeconds: TimeInterval?
    ) {
        guard playingRecordingID == recordingID,
              let endSeconds,
              endSeconds.isFinite,
              endSeconds > startSeconds else { return }
        let duration = min(max(endSeconds - max(startSeconds, 0), 0.05), 30)
        boundedStopTask = Task { [weak self] in
            try? await Task.sleep(
                nanoseconds: UInt64((duration * 1_000_000_000).rounded())
            )
            guard !Task.isCancelled,
                  let self,
                  self.playingRecordingID == recordingID else { return }
            self.seek(to: endSeconds)
            self.pause()
        }
    }

    private func beginAudioPlayback(
        recordingID: UUID,
        fileURL: URL,
        startSeconds: TimeInterval,
        volume: Float
    ) {
        do {
            try audioSessionCoordinator.beginLocalPlayback()
            let player = try AVAudioPlayer(contentsOf: fileURL)
            player.delegate = self
            guard player.prepareToPlay() else {
                throw NSError(
                    domain: "LocalRecordingPlayback",
                    code: 1,
                    userInfo: [NSLocalizedDescriptionKey: "The local audio take could not prepare for playback."]
                )
            }
            player.currentTime = min(max(startSeconds, 0), player.duration)
            player.volume = min(max(volume.isFinite ? volume : 1, 0), 1)
            guard player.play() else {
                throw NSError(
                    domain: "LocalRecordingPlayback",
                    code: 2,
                    userInfo: [NSLocalizedDescriptionKey: "The local audio take could not begin playback."]
                )
            }
            audioPlayer = player
            playingRecordingID = recordingID
            isPlaying = true
            currentTime = player.currentTime
            startProgressTimer(recordingID: recordingID)
            errorMessage = nil
        } catch {
            audioSessionCoordinator.endLocalPlayback()
            audioPlayer = nil
            playingRecordingID = nil
            isPlaying = false
            errorMessage = error.localizedDescription
        }
    }

    private func beginVideoPlayback(
        recordingID: UUID,
        fileURL: URL,
        startSeconds: TimeInterval,
        volume: Float
    ) {
        do {
            try audioSessionCoordinator.beginLocalPlayback()
            let item = AVPlayerItem(url: fileURL)
            let player = AVPlayer(playerItem: item)
            player.volume = min(max(volume.isFinite ? volume : 1, 0), 1)
            videoCompletionObserver = NotificationCenter.default.addObserver(
                forName: .AVPlayerItemDidPlayToEndTime,
                object: item,
                queue: .main
            ) { [weak self] _ in
                MainActor.assumeIsolated {
                    self?.stop()
                }
            }
            videoPlayer = player
            playingRecordingID = recordingID
            isPlaying = true
            currentTime = max(startSeconds, 0)
            errorMessage = nil
            player.seek(
                to: CMTime(seconds: max(startSeconds, 0), preferredTimescale: 600),
                toleranceBefore: .zero,
                toleranceAfter: .zero
            )
            player.play()
            startProgressTimer(recordingID: recordingID)
        } catch {
            audioSessionCoordinator.endLocalPlayback()
            videoPlayer = nil
            playingRecordingID = nil
            isPlaying = false
            errorMessage = error.localizedDescription
        }
    }


    private func startProgressTimer(recordingID: UUID) {
        stopProgressTimer()
        let timer = Timer(timeInterval: 0.2, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self, self.playingRecordingID == recordingID else { return }
                if let audioPlayer = self.audioPlayer {
                    self.currentTime = audioPlayer.currentTime
                } else if let videoPlayer = self.videoPlayer {
                    let seconds = videoPlayer.currentTime().seconds
                    if seconds.isFinite { self.currentTime = max(seconds, 0) }
                }
            }
        }
        progressTimer = timer
        RunLoop.main.add(timer, forMode: .common)
    }

    private func stopProgressTimer() {
        progressTimer?.invalidate()
        progressTimer = nil
    }
}

extension LocalRecordingPlaybackController: AVAudioPlayerDelegate {
    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in
            self.audioPlayer = nil
            self.playingRecordingID = nil
            self.isPlaying = false
            self.stopProgressTimer()
            self.audioSessionCoordinator.endLocalPlayback()
            if !flag {
                self.errorMessage = "Playback ended before iOS could finish the local take."
            }
        }
    }

    nonisolated func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) {
        Task { @MainActor in
            self.audioPlayer = nil
            self.playingRecordingID = nil
            self.isPlaying = false
            self.stopProgressTimer()
            self.audioSessionCoordinator.endLocalPlayback()
            self.errorMessage = error?.localizedDescription ?? "The local take could not be decoded."
        }
    }
}
