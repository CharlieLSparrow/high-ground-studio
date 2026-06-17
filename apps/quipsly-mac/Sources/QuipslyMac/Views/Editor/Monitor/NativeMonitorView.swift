import SwiftUI
import AVKit
import Combine

struct NativeMonitorView: View {
    @ObservedObject var sessionContext: EditorSessionContext
    @ObservedObject var playbackContext: EditorPlaybackContext
    
    @State private var player: AVPlayer?
    @State private var timeObserverToken: Any?
    @State private var isScrubbing = false

    var body: some View {
        ZStack {
            Color.black
            
            if let player {
                MacAVPlayerView(player: player)
            } else {
                Text("No Media")
                    .foregroundColor(.secondary)
            }
        }
        .onChange(of: playbackContext.playhead) { _, newValue in
            guard !playbackContext.isPlaying else { return } // Let the player drive if playing
            let time = CMTime(seconds: newValue, preferredTimescale: 600)
            player?.seek(to: time, toleranceBefore: .zero, toleranceAfter: .zero)
        }
        .onChange(of: playbackContext.isPlaying) { _, isPlaying in
            if isPlaying {
                player?.play()
            } else {
                player?.pause()
            }
        }
        .onChange(of: sessionContext.session) { _, _ in
            setupPlayer()
        }
        .onAppear {
            setupPlayer()
        }
        .onDisappear {
            removeTimeObserver()
            player?.pause()
        }
    }
    
    private func setupPlayer() {
        // For the prototype, just find the first playable video source.
        // A true NLE monitor would composite tracks using AVVideoComposition.
        guard let session = sessionContext.session,
              let firstVideoSource = session.sources.first(where: { $0.isVideoLike && $0.hasPlayableLocalMedia }),
              let url = firstVideoSource.playableLocalVideoURL else {
            self.player = nil
            return
        }
        
        let newPlayer = AVPlayer(url: url)
        self.player = newPlayer
        
        removeTimeObserver()
        let interval = CMTime(seconds: 1.0 / 60.0, preferredTimescale: 600)
        timeObserverToken = newPlayer.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak playbackContext] time in
            Task { @MainActor in
                guard let context = playbackContext else { return }
                if context.isPlaying {
                    context.playhead = time.seconds
                }
            }
        }
    }
    
    private func removeTimeObserver() {
        if let token = timeObserverToken {
            player?.removeTimeObserver(token)
            timeObserverToken = nil
        }
    }
}

struct MacAVPlayerView: NSViewRepresentable {
    var player: AVPlayer
    
    func makeNSView(context: Context) -> AVPlayerView {
        let view = AVPlayerView()
        view.player = player
        view.controlsStyle = .none // We build custom controls
        return view
    }
    
    func updateNSView(_ nsView: AVPlayerView, context: Context) {
        nsView.player = player
    }
}
