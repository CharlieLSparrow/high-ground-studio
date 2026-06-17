import Combine
import Foundation
import SwiftUI

enum LocalMonitorPlaybackMode: String, Codable {
    case edit
    case original
}

@MainActor
final class EditorPlaybackContext: ObservableObject {
    @AppStorage("quipslyMac.editorMonitorMode") var playbackModeRaw = LocalMonitorPlaybackMode.edit.rawValue
    
    @Published var playhead: Double = 0
    @Published var isPlaying = false
    
    var mode: LocalMonitorPlaybackMode {
        LocalMonitorPlaybackMode(rawValue: playbackModeRaw) ?? .edit
    }
}
