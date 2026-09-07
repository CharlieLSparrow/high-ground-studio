import { recordingContentReadiness } from "./mobile-capture-content-readiness";

const recording = { kind: "LOCAL_AUDIO", status: "VERIFIED", verifiedAt: "2026-09-07T12:00:00Z",
  durationSeconds: 5.32, localManifestJson: { exactBytesVerified: true } };

describe("uploaded recording summary", () => {
  it.each([0.2, 5.32, 59.9, 60, 3600])("accepts verified recordings lasting %s seconds", durationSeconds => {
    const result = recordingContentReadiness([{ ...recording, durationSeconds }], "COACHING");
    expect(result).toMatchObject({ status: "uploaded", uploadedRecordingCount: 1, knownDurationSeconds: durationSeconds });
    expect(result).not.toHaveProperty("substantialThresholdSeconds");
    expect(result.detail).not.toMatch(/not usable|proof only|physical device/i);
  });
  it("does not judge content value by the device label", () => {
    expect(recordingContentReadiness([{ ...recording, localManifestJson: { exactBytesVerified: true, simulator: true } }]))
      .toMatchObject({ status: "uploaded", uploadedRecordingCount: 1 });
  });
  it("keeps uploaded bytes available when duration is still unknown", () => {
    expect(recordingContentReadiness([{ ...recording, durationSeconds: null }]))
      .toMatchObject({ status: "uploaded", unknownDurationCount: 1, knownDurationSeconds: 0 });
  });
  it("does not mistake a partial segment duration for the whole recording", () => {
    expect(recordingContentReadiness([{ ...recording, durationSeconds: null, segmentsJson: [{ durationSeconds: 5 }, {}] }]))
      .toMatchObject({ unknownDurationCount: 1, knownDurationSeconds: 0 });
    expect(recordingContentReadiness([{ ...recording, durationSeconds: null, segmentsJson: [{ durationSeconds: 5 }, { durationSeconds: 2 }] }]))
      .toMatchObject({ unknownDurationCount: 0, knownDurationSeconds: 7 });
  });
  it("retains upload and processing problems without hiding usable recordings", () => {
    const result = recordingContentReadiness([recording, { ...recording, status: "HELD" }, { kind: "LOCAL_AUDIO", status: "LOCAL_READY" }]);
    expect(result).toMatchObject({ status: "uploaded", uploadedRecordingCount: 1, attentionRecordingCount: 1, pendingRecordingCount: 1, verifiedCaptureCount: 2 });
    expect(result.detail).toMatch(/1 more need attention/);
    expect(recordingContentReadiness([{ ...recording, status: "HELD" }])).toMatchObject({ status: "attention", uploadedRecordingCount: 0 });
  });
  it("does not promote local metadata, missing byte verification, or a failed upload", () => {
    expect(recordingContentReadiness([{ ...recording, verifiedAt: null }])).toMatchObject({ status: "uploading", uploadedRecordingCount: 0 });
    expect(recordingContentReadiness([{ ...recording, localManifestJson: {} }])).toMatchObject({ status: "uploading", uploadedRecordingCount: 0 });
    expect(recordingContentReadiness([{ ...recording, status: "FAILED" }])).toMatchObject({ status: "attention", uploadedRecordingCount: 0 });
  });
  it("excludes empty provider slots and transcript metadata", () => {
    expect(recordingContentReadiness([{ kind: "SERVER_MIX", localManifestJson: { source: "provider-recording-receipt-slot" } }, { kind: "TRANSCRIPT_SOURCE" }]))
      .toMatchObject({ status: "none", captureAssetCount: 0 });
  });
  it("does not count a derived private share output as an original recording", () => {
    expect(recordingContentReadiness([{ ...recording, kind: "SERVER_MIX", localManifestJson: {
      exactBytesVerified: true, source: "session-recording-share",
    } }])).toMatchObject({ status: "none", uploadedRecordingCount: 0 });
  });
});
