import assert from "node:assert/strict";
import test from "node:test";

import {
  inspectPhysicalVoiceWritingReceipt,
  parseArguments,
} from "./quipsly-capture-physical-voice-writing-readback.mjs";

const now = new Date("2026-09-03T18:40:00Z");
const attemptID = "8C3D7ABE-B8BC-4B13-949A-F52D8ED5D517";
const recordingID = "B9C77BE4-30CF-4CF2-A2B8-C135A3B30EBE";

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
});
