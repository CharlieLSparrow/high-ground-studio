import Foundation

enum AudioRoomCommand: String, CaseIterable {
    case togglePlayback
    case backTenSeconds
    case pause
    case forwardTenSeconds
    case setIn
    case setOut
    case previousMark
    case nextMark
    case nextVoice
    case firstVoice
    case nextOverlap
    case selectTenSeconds
    case selectThirtySeconds
    case zoomIn
    case zoomOut
    case fitEpisode
    case syncEditor
    case copyAgentState
}

extension Notification.Name {
    static let quipslyAudioRoomCommand = Notification.Name("quipsly.audio-room.command")
}

@MainActor
final class AudioRoomCommandRouter {
    static let shared = AudioRoomCommandRouter()

    private(set) var isAudioRoomActive = false

    private init() {}

    func setAudioRoomActive(_ isActive: Bool) {
        isAudioRoomActive = isActive
    }

    func send(_ command: AudioRoomCommand) {
        guard isAudioRoomActive else { return }
        NotificationCenter.default.post(
            name: .quipslyAudioRoomCommand,
            object: command.rawValue
        )
    }
}
