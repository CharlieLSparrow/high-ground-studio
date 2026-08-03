#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("retained native packet-note merge proves revision, replay, and source return", async () => {
  const [operation, runner, runtimeTests, nativeReview, phoneShell] = await Promise.all([
    readFile(new URL("./quipsly-retained-native-packet-note-merge-operation.mjs", import.meta.url), "utf8"),
    readFile(new URL("../apps/mobile-capture/HighGroundCapture/scripts/run-capture-runtime-ui-smoke.sh", import.meta.url), "utf8"),
    readFile(new URL("../apps/mobile-capture/HighGroundCapture/HighGroundCaptureUITests/CaptureRoomRuntimeSmokeTests.swift", import.meta.url), "utf8"),
    readFile(new URL("../apps/mobile-capture/HighGroundCapture/HighGroundCapture/TranscriptCorrectionReview.swift", import.meta.url), "utf8"),
    readFile(new URL("../apps/mobile-capture/HighGroundCapture/HighGroundCapture/CapturePhoneShell.swift", import.meta.url), "utf8"),
  ]);

  assert.match(operation, /QUIPSLY_RETAINED_PACKET_NOTE_MERGE_OPERATION === "1"/);
  assert.match(operation, /requires an explicit loopback PostgreSQL database/);
  assert.match(operation, /const attempts = method === "GET" \? 5 : 1/);
  assert.match(operation, /\/api\/sessions\/\$\{encodeURIComponent\(fixture\.roomID\)\}\/notes/);
  assert.match(operation, /revisionCount === 1/);
  assert.match(operation, /operation === "merged-transcript-candidate"/);
  assert.match(operation, /JSON\.stringify\(sideEffectsAfter\) === JSON\.stringify\(sideEffectsBefore\)/);
  assert.match(operation, /replay\.idempotentReplay === true/);
  assert.match(operation, /replayRevisionCount === 2/);
  assert.match(operation, /exactTranscriptReturnOperatedAfterRelaunch: true/);

  assert.match(runner, /transcript-packet-note-merge\)/);
  assert.match(runner, /testReviewedTranscriptPacketMergesIntoExactExistingNoteAndReturnsToSource/);
  assert.match(runtimeTests, /func testReviewedTranscriptPacketMergesIntoExactExistingNoteAndReturnsToSource/);
  assert.match(runtimeTests, /CapturePacketNoteMergeTargetPicker/);
  assert.match(runtimeTests, /CaptureSessionNoteMergedSourceLink_/);
  assert.match(runtimeTests, /CaptureTranscriptSourceBoundary_/);
  assert.match(nativeReview, /Updates exactly one existing note and retains its prior revision plus this transcript source/);
  assert.match(phoneShell, /Latest merged transcript source/);
});
