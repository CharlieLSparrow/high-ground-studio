import AVFoundation
import Combine

@MainActor
final class LocalRecordingPlaybackController: NSObject, ObservableObject {
    @Published private(set) var playingRecordingID: UUID?
    @Published private(set) var errorMessage: String?

    private var player: AVAudioPlayer?
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

        do {
            try audioSessionCoordinator.beginLocalPlayback()
            let player = try AVAudioPlayer(contentsOf: fileURL)
            player.delegate = self
            guard player.prepareToPlay(), player.play() else {
                throw NSError(
                    domain: "LocalRecordingPlayback",
                    code: 1,
                    userInfo: [NSLocalizedDescriptionKey: "The local take could not begin playback."]
                )
            }
            self.player = player
            playingRecordingID = recording.id
            errorMessage = nil
        } catch {
            audioSessionCoordinator.endLocalPlayback()
            player = nil
            playingRecordingID = nil
            errorMessage = error.localizedDescription
        }
    }

    func stop() {
        player?.stop()
        player = nil
        playingRecordingID = nil
        audioSessionCoordinator.endLocalPlayback()
    }
}

extension LocalRecordingPlaybackController: AVAudioPlayerDelegate {
    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in
            self.player = nil
            self.playingRecordingID = nil
            self.audioSessionCoordinator.endLocalPlayback()
            if !flag {
                self.errorMessage = "Playback ended before iOS could finish the local take."
            }
        }
    }

    nonisolated func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) {
        Task { @MainActor in
            self.player = nil
            self.playingRecordingID = nil
            self.audioSessionCoordinator.endLocalPlayback()
            self.errorMessage = error?.localizedDescription ?? "The local take could not be decoded."
        }
    }
}
