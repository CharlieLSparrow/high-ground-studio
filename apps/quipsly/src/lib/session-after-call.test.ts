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
});
