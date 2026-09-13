import Foundation

/// A projection of the canonical transcript job, never a second job lifecycle.
struct CaptureTranscriptProgressSource: Codable, Equatable, Identifiable {
  let recordingAssetId: String
  let participantLabel: String
  let transcriptJobId: String?
  let status: String?
  let error: String?
  let failureCode: String?
  let retryable: Bool?

  var id: String { recordingAssetId }
  var isProcessing: Bool { ["QUEUED", "RUNNING", "PROCESSING"].contains(status ?? "") }
  var isComplete: Bool { status == "COMPLETED" }
  var actionTitle: String? {
    guard failureCode != "NO_AUDIO_SIGNAL", retryable != false else { return nil }
    if status == nil { return "Transcribe recording" }
    if ["FAILED", "HELD", "CANCELED", "CANCELLED"].contains(status ?? "") { return "Try again" }
    return nil
  }
  var title: String {
    if failureCode == "NO_AUDIO_SIGNAL" { return "No audio was captured" }
    switch status {
    case "QUEUED": return "Waiting to transcribe"
    case "RUNNING", "PROCESSING": return "Transcribing"
    case "FAILED": return "Transcription failed"
    case "HELD": return "Transcription needs attention"
    case "CANCELED", "CANCELLED": return "Transcription stopped"
    case "COMPLETED": return "Transcript ready"
    case nil: return "Ready to transcribe"
    default: return "Checking transcription"
    }
  }
  var detail: String {
    if failureCode == "NO_AUDIO_SIGNAL" {
      return
        "This recording contains no audio signal. The original is kept. Check the microphone before recording again."
    }
    if let error, !error.isEmpty { return error }
    if isProcessing {
      return
        "Your recording is saved. You can keep working or leave this screen while the transcript finishes."
    }
    if isComplete { return "Read, play, and edit the transcript below." }
    return "Your original recording is saved and unchanged."
  }
}

struct CaptureTranscriptRecordingSummary: Codable, Equatable {
  let id: String
  let fileName: String?
}

struct CaptureTranscriptProcessingSummary: Codable, Equatable {
  let message: String?
  let failureCode: String?
  let retryable: Bool?
}

enum CaptureTranscriptRecordingLabel {
  static func title(fileName: String?, isVideo: Bool = false) -> String {
    guard let fileName, !fileName.isEmpty else {
      return isVideo ? "Video recording" : "Audio recording"
    }
    if fileName.range(
      of: #"^quipsly-\d{8}-\d{6}-[0-9A-Fa-f-]{36}\.[A-Za-z0-9]+$"#, options: .regularExpression)
      != nil
    {
      return isVideo ? "Video recording" : "Audio recording"
    }
    return fileName
  }
}
