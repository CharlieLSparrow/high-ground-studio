import SwiftUI

import QuipslyVideoCore

struct NativeTransportControls: View {
    @ObservedObject var playbackEngine: PlaybackEngine
    
    var body: some View {
        HStack(spacing: 20) {
            Spacer()
            
            Button {
                playbackEngine.seek(to: max(0, playbackEngine.playhead - 5))
            } label: {
                Image(systemName: "gobackward.5")
                    .font(.title2)
            }
            .buttonStyle(.plain)
            
            Button {
                playbackEngine.togglePlayback()
            } label: {
                Image(systemName: playbackEngine.isPlaying ? "pause.fill" : "play.fill")
                    .font(.largeTitle)
            }
            .buttonStyle(.plain)
            
            Button {
                playbackEngine.seek(to: playbackEngine.playhead + 5)
            } label: {
                Image(systemName: "goforward.5")
                    .font(.title2)
            }
            .buttonStyle(.plain)
            
            Spacer()
            
            Text(formatTime(playbackEngine.playhead))
                .font(.system(.body, design: .monospaced))
        }
    }
    
    private func formatTime(_ seconds: Double) -> String {
        let mins = Int(seconds) / 60
        let secs = Int(seconds) % 60
        let ms = Int((seconds.truncatingRemainder(dividingBy: 1)) * 100)
        return String(format: "%02d:%02d.%02d", mins, secs, ms)
    }
}
