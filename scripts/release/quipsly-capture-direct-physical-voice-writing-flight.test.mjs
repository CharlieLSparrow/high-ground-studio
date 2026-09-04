import assert from "node:assert/strict";
import test from "node:test";

import {
  parseArguments,
  physicalFlightIsComplete,
  physicalFlightStateMessage,
} from "./quipsly-capture-direct-physical-voice-writing-flight.mjs";

test("requires explicit device, signed app, and retained evidence path", () => {
  assert.deepEqual(
    parseArguments([
      "--device", "Morbo",
      "--app", "/tmp/HighGroundCapture.app",
      "--output", "/tmp/evidence.json",
    ]),
    {
      device: "Morbo",
      appPath: "/tmp/HighGroundCapture.app",
      expectedBuild: "",
      outputPath: "/tmp/evidence.json",
      timeoutSeconds: 180,
      pollSeconds: 2,
      skipInstall: false,
      help: false,
    },
  );
  assert.throws(() => parseArguments([]), /--device is required/);
  assert.throws(
    () => parseArguments(["--device", "Morbo", "--output", "/tmp/evidence.json"]),
    /--app is required/,
  );
  assert.throws(
    () => parseArguments(["--device", "Morbo", "--skip-install"]),
    /--output is required/,
  );
});

test("reports actionable device states without disclosing transcript content", () => {
  assert.match(physicalFlightStateMessage(null), /protected acceptance receipt/);
  assert.match(physicalFlightStateMessage({ phase: "requested" }), /microphone permission/);
  assert.match(physicalFlightStateMessage({ phase: "recording" }), /speak/);
  assert.match(
    physicalFlightStateMessage({
      phase: "finished",
      captureAcceptanceProven: true,
      transcriptAcceptanceReady: false,
    }),
    /Audio is saved and playable/,
  );
  assert.match(
    physicalFlightStateMessage({
      phase: "finished",
      captureAcceptanceProven: true,
      sourceAudioLikelySilent: true,
      transcriptAcceptanceReady: false,
    }),
    /effectively silent/,
  );
  assert.doesNotMatch(
    physicalFlightStateMessage({
      phase: "finished",
      captureAcceptanceProven: true,
      transcriptAcceptanceReady: true,
      sourceBoundTranscriptProven: true,
      detail: "private spoken words",
    }),
    /private spoken words/,
  );
});

test("completion requires playable exact-source on-device text", () => {
  const complete = {
    captureAcceptanceProven: true,
    sourceAudioRead: true,
    sourceAudioPlayable: true,
    transcriptContentRead: true,
    sourceBoundTranscriptProven: true,
    transcriptionRanOnDevice: true,
    transcriptCharacterCount: 42,
  };
  assert.equal(physicalFlightIsComplete(complete), true);
  for (const key of [
    "captureAcceptanceProven",
    "sourceAudioRead",
    "sourceAudioPlayable",
    "transcriptContentRead",
    "sourceBoundTranscriptProven",
    "transcriptionRanOnDevice",
  ]) {
    assert.equal(physicalFlightIsComplete({ ...complete, [key]: false }), false);
  }
  assert.equal(physicalFlightIsComplete({ ...complete, transcriptCharacterCount: 0 }), false);
});
