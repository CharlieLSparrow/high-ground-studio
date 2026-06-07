import Foundation

struct RecorderCommand: Codable {
    let action: ActionType
    let projectSlug: String?
    let episodeSlug: String?

    enum ActionType: String, Codable {
        case start = "START"
        case stop = "STOP"
        case pause = "PAUSE"
        case resume = "RESUME"
        case markBreak = "MARK_BREAK"
    }
}

struct RecorderEvent: Codable {
    let type: EventType
    let detail: EventDetail

    enum EventType: String, Codable {
        case stateChange = "STATE_CHANGE"
        case uploadProgress = "UPLOAD_PROGRESS"
        case uploadComplete = "UPLOAD_COMPLETE"
        case error = "ERROR"
    }
}

struct EventDetail: Codable {
    let state: RecorderState?
    let durationMs: Int?
    let progress: Double?
    let mediaAssetId: String?
    let errorMessage: String?

    init(state: RecorderState? = nil, durationMs: Int? = nil, progress: Double? = nil, mediaAssetId: String? = nil, errorMessage: String? = nil) {
        self.state = state
        self.durationMs = durationMs
        self.progress = progress
        self.mediaAssetId = mediaAssetId
        self.errorMessage = errorMessage
    }
}

enum RecorderState: String, Codable {
    case recording = "RECORDING"
    case paused = "PAUSED"
    case stopped = "STOPPED"
}

// MARK: - Segment Tracking

enum RecordingStopReason: String, Codable {
    case userStop = "user-stop"
    case pause = "pause"
    case interruption = "interruption"
    case appBackgrounded = "app-backgrounded"
}

struct RecordingSegment: Codable {
    let id: String
    let sessionId: String
    let participantId: String
    let deviceKind: String
    let status: String
    let startedAt: String
    let stoppedAt: String?
    let durationSeconds: Double?
    let stopReason: RecordingStopReason?
}

// MARK: - Reframing Engine Models

struct TransformKeyframe: Codable, Identifiable {
    var id: String
    var timeOffset: Double // Seconds from the start of the clip
    var scale: Double?     // Zoom (2D) or FOV (360)
    var x: Double?         // Pan X (2D) or Yaw (360)
    var y: Double?         // Pan Y (2D) or Pitch (360)
    var rotation: Double?  // Roll
    var easing: String?    // "linear" or "ease-in-out"
}
