import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("retained native packet review stays local, source-complete, and side-effect free", async () => {
  const [operator, runner, nativeTest, transcriptView, recordShell] = await Promise.all([
    readFile(new URL("./quipsly-retained-native-transcript-packet-operation.mjs", import.meta.url), "utf8"),
    readFile(new URL(
      "../apps/mobile-capture/HighGroundCapture/scripts/run-capture-runtime-ui-smoke.sh",
      import.meta.url,
    ), "utf8"),
    readFile(new URL(
      "../apps/mobile-capture/HighGroundCapture/HighGroundCaptureUITests/CaptureRoomRuntimeSmokeTests.swift",
      import.meta.url,
    ), "utf8"),
    readFile(new URL(
      "../apps/mobile-capture/HighGroundCapture/HighGroundCapture/TranscriptCorrectionReview.swift",
      import.meta.url,
    ), "utf8"),
    readFile(new URL(
      "../apps/mobile-capture/HighGroundCapture/HighGroundCapture/CapturePhoneShell.swift",
      import.meta.url,
    ), "utf8"),
  ]);

  assert.match(operator, /requireLoopbackOrigin/);
  assert.match(operator, /readRetainedQAPassword/);
  assert.match(operator, /sideEffectFreeRead === true/);
  assert.match(operator, /packetTemplateVersion === "quipsly-session-packet-v4"/);
  assert.match(operator, /completeGoal\.segmentIds\?\.length === 3/);
  assert.match(operator, /completeGoal\.sourceSpan\?\.segments\?\.length === 3/);
  assert.match(operator, /after\.digest === before\.digest/);
  assert.match(operator, /canonicalCandidateMaterialization: \{ notes: 0, tasks: 0, goals: 0 \}/);
  assert.match(operator, /externalSideEffects: false/);
  assert.doesNotMatch(operator, /transcripts\/packet\/(?:actions|goals|notes)/);

  assert.match(runner, /transcript-packet-span\)/);
  assert.match(nativeTest, /testRetainedSessionShowsCompleteMultiSegmentPacketOnIPhone/);
  assert.match(nativeTest, /CaptureTranscriptPacketLoadedBoundary/);
  assert.match(nativeTest, /CaptureTranscriptJumpToGoals/);
  assert.match(nativeTest, /CapturePacketGoalAcceptButton/);
  assert.match(nativeTest, /Complete thought across 3 immutable transcript segments/);
  assert.match(transcriptView, /CaptureTranscriptPacketLoadedBoundary/);
  assert.match(transcriptView, /Every candidate remains a proposal/);
  assert.match(recordShell, /CaptureSessionTranscriptReviewLink_/);
  assert.match(recordShell, /Review only — exact local source unavailable/);
});
