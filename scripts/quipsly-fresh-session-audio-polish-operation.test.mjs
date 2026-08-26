import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const subject = readFileSync(
  fileURLToPath(new URL("./quipsly-fresh-session-audio-polish-operation.mjs", import.meta.url)),
  "utf8",
);

test("fresh Session audio polish operation protects source truth and acceptance boundaries", () => {
  assert.match(subject, /QUIPSLY_FRESH_SESSION_AUDIO_POLISH === "1"/);
  assert.match(subject, /Fresh Session audio polish refuses a non-local PostgreSQL database/);
  assert.match(subject, /Fresh Session audio polish requires the loopback Firebase Auth emulator/);
  assert.match(subject, /QUIPSLY_COACHING_ACCEPTANCE_CONTEXT/);
  assert.match(subject, /QUIPSLY_LOCAL_FIREBASE_PROJECT/);
  assert.match(subject, /Fresh Session audio polish Firebase project is invalid/);
  assert.match(subject, /freshCoachAuthRestoredToEphemeralEmulator: true/);
  assert.match(subject, /Your recordings are safe and ready/);
  assert.match(subject, /name: \/\^\(Check audio now\|Try again\)\$\//);
  assert.match(subject, /original stays untouched/i);
  assert.match(subject, /name: "Compare original and improved"/);
  assert.match(subject, /Audio quality did not expose a truthful starting or completed state/);
  assert.match(subject, /originalSourceAndCaptureManifestUnchanged: true/);
  assert.match(subject, /automaticProcessingResumed: initialState === "automatic-processing"/);
  assert.match(subject, /completedStateRecognizedAtEntry: initialState === "completed"/);
  assert.match(subject, /name: "Recording \+ transcript"/);
  assert.match(subject, /recordingAndTranscriptRenderedSideBySide: true/);
  assert.match(subject, /correctionPlaybackStartedAutomatically: true/);
  assert.match(subject, /repeatedPlaybackAttestationAbsent: true/);
  assert.match(subject, /humanAcceptanceSatisfied: false/);
  assert.match(subject, /physicalDeviceProven: false/);
  assert.match(subject, /humanListeningProven: false/);
  assert.match(subject, /mode: 0o600/);
  assert.match(subject, /chmod\(receiptPath, 0o600\)/);
});
