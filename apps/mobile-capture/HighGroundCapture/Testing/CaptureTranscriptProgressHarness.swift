import Foundation

@main
enum CaptureTranscriptProgressHarness {
  static func main() throws {
    let decoder = JSONDecoder()
    let source = try decoder.decode(
      CaptureTranscriptProgressSource.self,
      from: Data(#"{"recordingAssetId":"source-a","participantLabel":"Casey","status":null}"#.utf8))
    precondition(source.actionTitle == "Transcribe recording" && !source.isProcessing)
    for status in ["QUEUED", "RUNNING", "PROCESSING"] {
      let pending = make(status)
      precondition(pending.isProcessing && pending.actionTitle == nil)
    }
    for status in ["FAILED", "HELD", "CANCELLED", "CANCELED"] {
      precondition(make(status).actionTitle == "Try again")
    }
    let silent = make("FAILED", failureCode: "NO_AUDIO_SIGNAL", retryable: false)
    precondition(
      silent.title == "No audio was captured" && silent.actionTitle == nil && !silent.isProcessing)
    precondition(make("FAILED", failureCode: "NO_AUDIO_SIGNAL").actionTitle == nil)
    precondition(make("FAILED", retryable: false).actionTitle == nil)
    precondition(make("COMPLETED").isComplete && make("COMPLETED").actionTitle == nil)
    precondition(make("FUTURE_STATUS").actionTitle == nil && !make("FUTURE_STATUS").isProcessing)
    let summary = try decoder.decode(
      CaptureTranscriptProcessingSummary.self,
      from: Data(
        #"{"message":"Your recording is saved.","failureCode":"TRANSCRIPTION_FAILED","retryable":true}"#
          .utf8))
    precondition(summary.message == "Your recording is saved." && summary.retryable == true)
    let roundTrip = try decoder.decode(
      CaptureTranscriptProgressSource.self, from: JSONEncoder().encode(silent))
    precondition(roundTrip == silent)
    precondition(
      CaptureTranscriptRecordingLabel.title(
        fileName: "quipsly-20260913-190345-4eab9b36-0eb9-49ed-a15a-0a271e47e8db.caf")
        == "Audio recording")
    precondition(
      CaptureTranscriptRecordingLabel.title(
        fileName: "quipsly-20260913-190345-4eab9b36-0eb9-49ed-a15a-0a271e47e8db.mov", isVideo: true)
        == "Video recording")
    precondition(
      CaptureTranscriptRecordingLabel.title(fileName: "My coaching practice.wav")
        == "My coaching practice.wav")
    precondition(
      CaptureTranscriptRecordingLabel.title(fileName: "quipsly-my-ideas.wav")
        == "quipsly-my-ideas.wav")
    print(
      "PASS transcript progress: saved source, pending states, retries, silent source, completion, future states, and canonical decoding"
    )
  }

  private static func make(_ status: String, failureCode: String? = nil, retryable: Bool? = nil)
    -> CaptureTranscriptProgressSource
  {
    .init(
      recordingAssetId: "source-a", participantLabel: "Casey", transcriptJobId: "job-a",
      status: status, error: nil, failureCode: failureCode, retryable: retryable)
  }
}
