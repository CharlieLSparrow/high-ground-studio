import { transcriptFailurePresentation } from "./transcript-failure-presentation";

test("reports verified digital silence without offering the same failed work again", () => {
  const result = transcriptFailurePresentation({ status: "FAILED", provider: "openai-whisper-local",
    errorMessage: "This recording contains no audio signal. The original recording is kept. Check the microphone before recording again." });
  expect(result).toMatchObject({ failureCode: "NO_AUDIO_SIGNAL", retryable: false });
  expect(result.errorMessage).toContain("Check the microphone");
});

test("does not confuse quiet audio or provider failures with verified digital silence", () => {
  for (const errorMessage of ["near digital silence", "No speech detected", "secret-token private-bucket /private/customer.wav", null]) {
    const result = transcriptFailurePresentation({ status: "FAILED", provider: "openai-whisper-local", errorMessage });
    expect(result).toMatchObject({ failureCode: "TRANSCRIPTION_FAILED", retryable: true });
    expect(result.errorMessage).not.toContain("secret-token");
    expect(result.errorMessage).not.toContain("private-bucket");
  }
});

test.each(["COMPLETED", "QUEUED", "RUNNING"])("does not surface stale failure text for %s", status => {
  expect(transcriptFailurePresentation({ status, errorMessage: "old error" })).toEqual({ failureCode: null, retryable: false, errorMessage: null });
});
