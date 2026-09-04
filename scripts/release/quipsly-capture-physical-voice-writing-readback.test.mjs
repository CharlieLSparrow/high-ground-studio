import assert from "node:assert/strict";
import test from "node:test";

import {
  assertRequiredProof,
  inspectTranscriptSidecar,
  inspectPhysicalVoiceWritingReceipt,
  inspectVolumeDetectOutput,
  parseArguments,
} from "./quipsly-capture-physical-voice-writing-readback.mjs";

const now = new Date("2026-09-03T18:40:00Z");
const attemptID = "8C3D7ABE-B8BC-4B13-949A-F52D8ED5D517";
const recordingID = "B9C77BE4-30CF-4CF2-A2B8-C135A3B30EBE";
const transcriptRequestID = "F8076CB6-2A38-4EC4-B5A9-C32180285C52";
const sourceSHA256 = "a".repeat(64);

function receipt(overrides = {}) {
  return {
    schema: "quipsly-physical-voice-writing-acceptance-v1",
    appBuild: "69",
    attemptID,
    captureState: "idle",
    phase: "requested",
    recordedAt: "2026-09-03T18:39:00Z",
    saved: false,
    sessionID: "local-voice-note-acceptance",
    ...overrides,
  };
}

test("requires exactly one device or previously pulled receipt", () => {
  assert.equal(parseArguments(["--device", "Morbo"]).device, "Morbo");
  assert.equal(parseArguments(["--receipt", "/tmp/latest.json"]).receiptPath, "/tmp/latest.json");
  assert.throws(() => parseArguments([]), /exactly one/);
  assert.throws(
    () => parseArguments(["--device", "Morbo", "--receipt", "/tmp/latest.json"]),
    /exactly one/,
  );
  assert.equal(
    parseArguments(["--device", "Morbo", "--require-transcript-proof"]).requireCaptureProof,
    true,
  );
  assert.equal(
    parseArguments(["--device", "Morbo", "--require-transcript-proof"]).requireTranscriptProof,
    true,
  );
  assert.throws(
    () => parseArguments(["--receipt", "/tmp/latest.json", "--require-capture-proof"]),
    /requires --device/,
  );
});

test("strict modes reject valid pending receipts instead of returning false confidence", () => {
  const pending = inspectPhysicalVoiceWritingReceipt(receipt(), {
    auditedAt: now,
    expectedBuild: "69",
  });
  assert.throws(
    () => assertRequiredProof(pending, { requireCaptureProof: true }),
    /capture proof is incomplete/,
  );
});

test("distinguishes an effectively silent source from ordinary recorded speech", () => {
  assert.deepEqual(
    inspectVolumeDetectOutput("mean_volume: -72.8 dB\nmax_volume: -58.9 dB"),
    {
      sourceAudioMeanVolumeDbfs: -72.8,
      sourceAudioPeakVolumeDbfs: -58.9,
      sourceAudioLikelySilent: true,
    },
  );
  assert.deepEqual(
    inspectVolumeDetectOutput("mean_volume: -28.2 dB\nmax_volume: -8.4 dB"),
    {
      sourceAudioMeanVolumeDbfs: -28.2,
      sourceAudioPeakVolumeDbfs: -8.4,
      sourceAudioLikelySilent: false,
    },
  );
});

test("strict transcript proof requires exact-source on-device content", () => {
  const sourceProof = {
    captureAcceptanceProven: true,
    sourceAudioRead: true,
    sourceAudioPlayable: true,
    sourceAudioSHA256: sourceSHA256,
    sourceBoundTranscriptProven: false,
    transcriptContentRead: false,
    transcriptionRanOnDevice: false,
    transcriptCharacterCount: null,
  };
  assert.equal(
    assertRequiredProof(sourceProof, { requireCaptureProof: true }),
    sourceProof,
  );
  assert.throws(
    () => assertRequiredProof(sourceProof, { requireTranscriptProof: true }),
    /transcript proof is incomplete/,
  );
  assert.equal(
    assertRequiredProof({
      ...sourceProof,
      sourceBoundTranscriptProven: true,
      transcriptContentRead: true,
      transcriptionRanOnDevice: true,
      transcriptCharacterCount: 42,
    }, { requireCaptureProof: true, requireTranscriptProof: true }).transcriptCharacterCount,
    42,
  );
});

test("reports a fresh requested permission boundary without inventing capture proof", () => {
  const result = inspectPhysicalVoiceWritingReceipt(receipt(), {
    auditedAt: now,
    expectedBuild: "69",
  });
  assert.equal(result.ok, true);
  assert.equal(result.phase, "requested");
  assert.equal(result.observedPhase, "requested");
  assert.equal(result.phaseContractValid, true);
  assert.equal(result.recordingPhaseObserved, false);
  assert.equal(result.terminalPhaseObserved, false);
  assert.equal(result.terminal, false);
  assert.equal(result.captureAcceptanceProven, false);
  assert.equal(result.sourceAudioRead, false);
  assert.equal(result.sourceAudioPlayable, false);
  assert.equal(result.sourceAudioSHA256, null);
  assert.equal(result.transcriptContentRead, false);
});

test("proves a finished playable local source with exact identifiers", () => {
  const result = inspectPhysicalVoiceWritingReceipt(receipt({
    phase: "finished",
    captureState: "saved",
    recordingID,
    durationSeconds: 7.14,
    localStatus: "saved",
    sourceFileName: "20260903-123456-b9c77be4.m4a",
    sourceByteCount: 123_456,
    saved: true,
  }), { auditedAt: now, expectedBuild: "69" });
  assert.equal(result.captureAcceptanceProven, true);
  assert.equal(result.observedPhase, "finished");
  assert.equal(result.phaseContractValid, true);
  assert.equal(result.recordingPhaseObserved, false);
  assert.equal(result.terminalPhaseObserved, true);
  assert.equal(result.terminal, true);
  assert.equal(result.recordingID, recordingID);
  assert.equal(result.durationSeconds, 7.14);
  assert.equal(result.sourceFileName, "20260903-123456-b9c77be4.m4a");
  assert.equal(result.sourceByteCount, 123_456);
  assert.equal(result.transcriptAcceptanceReady, false);
});

test("proves non-disclosing source-bound transcript metadata against independently read audio", () => {
  const result = inspectPhysicalVoiceWritingReceipt(receipt({
    phase: "finished",
    captureState: "saved",
    recordingID,
    durationSeconds: 7.14,
    localStatus: "saved",
    sourceFileName: "20260903-123456-b9c77be4.m4a",
    sourceByteCount: 123_456,
    transcriptState: "saved-locally",
    transcriptClientRequestID: transcriptRequestID,
    transcriptSegmentCount: 2,
    transcriptSourceSHA256: sourceSHA256,
    transcriptSourceByteCount: 123_456,
    transcriptRecognitionExecution: "on-device",
    saved: true,
  }), { auditedAt: now, expectedBuild: "69" });
  assert.equal(result.transcriptAcceptanceReady, true);

  const evidence = inspectTranscriptSidecar({
    schemaVersion: 1,
    clientRequestId: transcriptRequestID,
    localRecordingId: recordingID,
    ownerAccountId: "private-owner-not-returned",
    sourceSha256: sourceSHA256,
    sourceByteCount: 123_456,
    recognitionExecution: "on-device",
    segments: [
      { startSeconds: 0.2, endSeconds: 2.4, text: "private first phrase" },
      { startSeconds: 3.1, endSeconds: 6.9, text: "private second phrase" },
    ],
  }, result, {
    sourceAudioSHA256: sourceSHA256,
    sourceAudioByteCount: 123_456,
    sourceAudioDurationSeconds: 7.14,
  });
  assert.deepEqual(evidence, {
    transcriptContentRead: true,
    sourceBoundTranscriptProven: true,
    transcriptCharacterCount: 41,
    transcriptRecognitionExecution: "on-device",
    transcriptionRanOnDevice: true,
  });
  assert.equal(JSON.stringify(evidence).includes("private"), false);
});

test("rejects stale, wrong-build, malformed, and contradictory evidence", () => {
  assert.throws(
    () => inspectPhysicalVoiceWritingReceipt(receipt(), { auditedAt: now, expectedBuild: "70" }),
    /Expected app build 70/,
  );
  assert.throws(
    () => inspectPhysicalVoiceWritingReceipt(receipt({ recordedAt: "2026-09-03T16:00:00Z" }), { auditedAt: now }),
    /stale/,
  );
  assert.throws(
    () => inspectPhysicalVoiceWritingReceipt(receipt({ attemptID: "not-a-uuid" }), { auditedAt: now }),
    /attempt ID is invalid/,
  );
  assert.throws(
    () => inspectPhysicalVoiceWritingReceipt(receipt({
      phase: "finished",
      captureState: "saved",
      recordingID,
      durationSeconds: 0,
      localStatus: "saved",
      sourceFileName: "20260903-123456-b9c77be4.m4a",
      sourceByteCount: 123_456,
      saved: true,
    }), { auditedAt: now }),
    /contradicts its recording evidence/,
  );
  assert.throws(
    () => inspectPhysicalVoiceWritingReceipt(receipt({
      phase: "finished",
      captureState: "saved",
      recordingID,
      durationSeconds: 7,
      localStatus: "captureFailed",
      sourceFileName: "20260903-123456-b9c77be4.m4a",
      sourceByteCount: 123_456,
      saved: true,
    }), { auditedAt: now }),
    /contradicts its recording evidence/,
  );
  assert.throws(
    () => inspectPhysicalVoiceWritingReceipt(receipt({
      phase: "finished",
      captureState: "saved",
      recordingID,
      durationSeconds: 7,
      localStatus: "saved",
      sourceFileName: "../escaped.m4a",
      sourceByteCount: 123_456,
      saved: true,
    }), { auditedAt: now }),
    /source file name is invalid/,
  );
  assert.throws(
    () => inspectPhysicalVoiceWritingReceipt(receipt({
      phase: "finished",
      captureState: "saved",
      recordingID,
      durationSeconds: 7,
      localStatus: "saved",
      sourceFileName: "valid.m4a",
      sourceByteCount: 123_456,
      transcriptState: "saved-locally",
      transcriptClientRequestID: transcriptRequestID,
      transcriptSegmentCount: 0,
      transcriptSourceSHA256: sourceSHA256,
      transcriptSourceByteCount: 123_456,
      transcriptRecognitionExecution: "on-device",
      saved: true,
    }), { auditedAt: now }),
    /transcript metadata is incomplete or contradictory/,
  );
});
