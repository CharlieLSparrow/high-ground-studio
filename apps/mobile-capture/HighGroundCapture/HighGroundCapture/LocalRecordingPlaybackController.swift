import AVFoundation
import Combine

@MainActor
final class LocalRecordingPlaybackController: NSObject, ObservableObject {
    @Published private(set) var playingRecordingID: UUID?
    @Published private(set) var videoPlayer: AVPlayer?
    @Published private(set) var errorMessage: String?

    private var audioPlayer: AVAudioPlayer?
    private var videoCompletionObserver: NSObjectProtocol?
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
            stop()
            return
        }

        play(recording: recording, library: library, from: 0)
    }

    func play(
        recording: LocalRecording,
        library: LocalRecordingLibrary,
        from startSeconds: TimeInterval
    ) {
        stop()
        guard recording.status.isPlaybackEligible else {
            if recording.status == .validatingRecovery {
                errorMessage = "Quipsly is still validating this preserved source through its end. Playback will unlock only after that check is durably saved."
            } else if recording.status == .needsRepair {
                errorMessage = "Quipsly preserved this source, but it needs repair before playback can be trusted."
            } else {
                errorMessage = "Finish and validate this local source before playback."
            }
            return
        }
        guard let fileURL = library.fileURL(for: recording) else {
            errorMessage = "This source belongs to a different or unverified Quipsly account."
            return
        }
        guard FileManager.default.fileExists(atPath: fileURL.path) else {
            errorMessage = "The local source file is not currently available."
            return
        }

        recording.effectiveMediaKind == .video
            ? beginVideoPlayback(
                recordingID: recording.id,
                fileURL: fileURL,
                startSeconds: startSeconds
            )
            : beginAudioPlayback(
                recordingID: recording.id,
                fileURL: fileURL,
                startSeconds: startSeconds
            )
    }

    func stop() {
        audioPlayer?.stop()
        audioPlayer = nil
        videoPlayer?.pause()
        videoPlayer = nil
        if let videoCompletionObserver {
            NotificationCenter.default.removeObserver(videoCompletionObserver)
            self.videoCompletionObserver = nil
        }
        playingRecordingID = nil
        audioSessionCoordinator.endLocalPlayback()
    }

    private func beginAudioPlayback(
        recordingID: UUID,
        fileURL: URL,
        startSeconds: TimeInterval
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
            guard player.play() else {
                throw NSError(
                    domain: "LocalRecordingPlayback",
                    code: 2,
                    userInfo: [NSLocalizedDescriptionKey: "The local audio take could not begin playback."]
                )
            }
            audioPlayer = player
            playingRecordingID = recordingID
            errorMessage = nil
        } catch {
            audioSessionCoordinator.endLocalPlayback()
            audioPlayer = nil
            playingRecordingID = nil
            errorMessage = error.localizedDescription
        }
    }

    private func beginVideoPlayback(
        recordingID: UUID,
        fileURL: URL,
        startSeconds: TimeInterval
    ) {
        do {
            try audioSessionCoordinator.beginLocalPlayback()
            let item = AVPlayerItem(url: fileURL)
            let player = AVPlayer(playerItem: item)
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
            errorMessage = nil
            player.seek(
                to: CMTime(seconds: max(startSeconds, 0), preferredTimescale: 600),
                toleranceBefore: .zero,
                toleranceAfter: .zero
            )
            player.play()
        } catch {
            audioSessionCoordinator.endLocalPlayback()
            videoPlayer = nil
            playingRecordingID = nil
            errorMessage = error.localizedDescription
        }
    }
}

extension LocalRecordingPlaybackController: AVAudioPlayerDelegate {
    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in
            self.audioPlayer = nil
            self.playingRecordingID = nil
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
            self.audioSessionCoordinator.endLocalPlayback()
            self.errorMessage = error?.localizedDescription ?? "The local take could not be decoded."
        }
    }
}
