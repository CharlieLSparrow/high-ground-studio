import SwiftUI
import AVKit
import QuipslyVideoCore

struct DualViewers: View {
    @ObservedObject var playbackEngine: PlaybackEngine
    
    var body: some View {
        HSplitView {
            // 16:9 Source Viewer
            VStack(spacing: 8) {
                Text("16:9 Source")
                    .font(.caption)
                    .foregroundColor(.secondary)
                
                if let player = playbackEngine.player {
                    PlayerView(player: player)
                        .aspectRatio(16/9, contentMode: .fit)
                        .background(Color.black)
                        .cornerRadius(8)
                } else {
                    Rectangle()
                        .fill(Color.black.opacity(0.8))
                        .aspectRatio(16/9, contentMode: .fit)
                        .cornerRadius(8)
                        .overlay(Text("No Source").foregroundColor(.gray))
                }
            }
            .padding()
            .frame(minWidth: 200, maxWidth: .infinity, minHeight: 200, maxHeight: .infinity)
            
            // 9:16 Reframed Viewer
            VStack(spacing: 8) {
                Text("9:16 Reframed Output")
                    .font(.caption)
                    .foregroundColor(.secondary)
                
                if let player = playbackEngine.player {
                    PlayerView(player: player)
                        .aspectRatio(9/16, contentMode: .fit)
                        .background(Color.black)
                        .cornerRadius(8)
                } else {
                    Rectangle()
                        .fill(Color.black.opacity(0.8))
                        .aspectRatio(9/16, contentMode: .fit)
                        .cornerRadius(8)
                        .overlay(Text("No Output").foregroundColor(.gray))
                }
            }
            .padding()
            .frame(minWidth: 200, maxWidth: .infinity, minHeight: 200, maxHeight: .infinity)
        }
    }
}

struct PlayerView: NSViewRepresentable {
    var player: AVPlayer
    
    func makeNSView(context: Context) -> AVPlayerView {
        let view = AVPlayerView()
        view.player = player
        view.controlsStyle = .none
        view.videoGravity = .resizeAspect
        return view
    }
    
    func updateNSView(_ nsView: AVPlayerView, context: Context) {
        nsView.player = player
    }
}
