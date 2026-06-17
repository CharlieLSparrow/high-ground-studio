import Foundation
import AVFoundation
import Combine

@MainActor
public final class PlaybackEngine: ObservableObject {
    @Published public var playhead: Double = 0
    @Published public var isPlaying: Bool = false
    
    public var player: AVPlayer? {
        willSet {
            if let token = timeObserverToken {
                player?.removeTimeObserver(token)
                timeObserverToken = nil
            }
        }
        didSet {
            setupTimeObserver()
        }
    }
    
    private var timeObserverToken: Any?
    
    public init() {}
    
    public func togglePlayback() {
        guard let player = player else { return }
        if isPlaying {
            player.pause()
            isPlaying = false
        } else {
            player.play()
            isPlaying = true
        }
    }
    
    public func seek(to timeInSeconds: Double) {
        guard let player = player else { return }
        let time = CMTime(seconds: timeInSeconds, preferredTimescale: 600)
        player.seek(to: time, toleranceBefore: .zero, toleranceAfter: .zero)
        playhead = timeInSeconds
    }
    
    private func setupTimeObserver() {
        guard let player = player else { return }
        
        let interval = CMTime(seconds: 1.0 / 60.0, preferredTimescale: 600)
        timeObserverToken = player.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
            Task { @MainActor in
                guard let self = self else { return }
                if self.isPlaying {
                    self.playhead = time.seconds
                }
            }
        }
    }
}
