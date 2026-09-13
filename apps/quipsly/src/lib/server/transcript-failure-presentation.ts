const NO_AUDIO_SIGNAL = "This recording contains no audio signal. The original recording is kept. Check the microphone before recording again.";

/** Known operational diagnoses can be useful without exposing raw provider
 * errors, paths, credentials, or private infrastructure in the app. */
export function transcriptFailurePresentation(job: { status?: string | null; provider?: string | null; errorMessage?: string | null } | null | undefined) {
  const status = job?.status?.toUpperCase();
  if (status === "FAILED") {
    // This message is emitted only after the local worker fully decodes the
    // source and verifies that every sample is zero, not a loudness heuristic.
    if (job?.provider === "openai-whisper-local" && job.errorMessage === NO_AUDIO_SIGNAL) {
      return { failureCode: "NO_AUDIO_SIGNAL", retryable: false, errorMessage: NO_AUDIO_SIGNAL };
    }
    return { failureCode: "TRANSCRIPTION_FAILED", retryable: true,
      errorMessage: "Quipsly could not finish this transcript. The exact recording remains safe and can be tried again." };
  }
  if (status === "HELD") return { failureCode: "TRANSCRIPTION_HELD", retryable: true,
    errorMessage: "This transcript is paused until the Session's current recording and transcription permissions allow processing." };
  return { failureCode: null, retryable: false, errorMessage: null };
}
