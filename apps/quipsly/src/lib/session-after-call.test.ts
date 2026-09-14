import { sessionAfterCall } from "./session-after-call";

const asset = (id: string, overrides = {}) => ({ id, kind: "LOCAL_AUDIO", status: "VERIFIED", verifiedAt: new Date(), localManifestJson: { exactBytesVerified: true }, ...overrides });
const job = (assetId: string, status = "COMPLETED", segments = 5) => ({ assetId, status, _count: { segments } });

describe("shared after-call availability", () => {
  it("finds recordings from every endpoint without requiring this browser to record", () => {
    expect(sessionAfterCall("room", [asset("phone"), asset("browser"), asset("camera", { kind: "LOCAL_VIDEO" })], [job("phone"), job("browser", "RUNNING")])).toEqual({
      roomId: "room", recordings: { uploaded: 3, pending: 0, attention: 0 }, transcripts: { available: 1, processing: 1, attention: 0 }, transcriptSourceId: "phone",
    });
  });
  it("does not count derived exports, provider placeholders, unverified bytes or disconnected transcripts", () => {
    const result = sessionAfterCall("room", [asset("edit", { localManifestJson: { source: "session-recording-share" } }),
      asset("slot", { localManifestJson: { source: "provider-recording-receipt-slot" } }),
      asset("unverified", { verifiedAt: null }), asset("bad", { status: "CORRUPTED" })], [job("edit"), job("slot"), job("unverified"), job("another-room")]);
    expect(result.recordings).toEqual({ uploaded: 0, pending: 1, attention: 1 });
    expect(result.transcripts).toEqual({ available: 0, processing: 0, attention: 0 });
  });
  it("counts the latest attempt per source, keeping failures separate from processing and usable text", () => {
    const result = sessionAfterCall("room", [asset("a"), asset("b"), asset("c")], [job("a", "FAILED"), job("a"), job("b", "COMPLETED", 0), job("c", "QUEUED")]);
    expect(result.transcripts).toEqual({ available: 1, processing: 1, attention: 2 });
    expect(result.transcriptSourceId).toBe("a");
  });
  it("keeps a completed transcript available while a retry runs without counting old attempts twice", () => {
    const result = sessionAfterCall("room", [asset("a")], [job("a", "RUNNING"), job("a"), job("a"), job("a", "FAILED")]);
    expect(result.transcripts).toEqual({ available: 1, processing: 1, attention: 0 });
  });
  it("explains exact silent-source failures without exposing raw provider errors", () => {
    const message = "This recording contains no audio signal. The original recording is kept. Check the microphone before recording again.";
    const result = sessionAfterCall("room", [asset("silent"), asset("retry")], [
      {...job("silent", "FAILED", 0), provider: "openai-whisper-local", errorMessage: message},
      {...job("retry", "FAILED", 0), provider: "cloud", errorMessage: "secret provider path and credentials"},
      {...job("foreign", "FAILED", 0), provider: "cloud", errorMessage: "another session"},
    ]);
    expect(result.transcriptIssues).toEqual([
      {recordingAssetId: "silent", message, retryable: false, failureCode: "NO_AUDIO_SIGNAL"},
      {recordingAssetId: "retry", message: expect.stringContaining("could not finish"), retryable: true, failureCode: "TRANSCRIPTION_FAILED"},
    ]);
    expect(JSON.stringify(result)).not.toMatch(/secret|credentials|foreign|another session/);
  });
  it("only exposes the latest failure of a recording, not stale retry errors", () => {
    const result = sessionAfterCall("room", [asset("a")], [job("a", "RUNNING"), job("a", "FAILED")]);
    expect(result.transcriptIssues).toBeUndefined();
  });
});
