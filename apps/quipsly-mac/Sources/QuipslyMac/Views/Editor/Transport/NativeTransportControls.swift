import SwiftUI

struct NativeTransportControls: View {
    @ObservedObject var playbackContext: EditorPlaybackContext
    
    var body: some View {
        HStack(spacing: 20) {
            Spacer()
            
            Button {
                playbackContext.playhead = max(0, playbackContext.playhead - 5)
            } label: {
                Image(systemName: "gobackward.5")
                    .font(.title2)
            }
            .buttonStyle(.plain)
            
            Button {
                playbackContext.isPlaying.toggle()
            } label: {
                Image(systemName: playbackContext.isPlaying ? "pause.fill" : "play.fill")
                    .font(.largeTitle)
            }
            .buttonStyle(.plain)
            
            Button {
                playbackContext.playhead += 5
            } label: {
                Image(systemName: "goforward.5")
                    .font(.title2)
            }
            .buttonStyle(.plain)
            
            Spacer()
            
            Text(formatTime(playbackContext.playhead))
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
