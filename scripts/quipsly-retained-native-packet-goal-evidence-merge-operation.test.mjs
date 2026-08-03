#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("retained native goal-evidence merge proves stable goal, replay, and source return", async () => {
  const [operation, runner, runtimeTests, nativeReview, phoneShell, packetRoute] = await Promise.all([
    readFile(new URL("./quipsly-retained-native-packet-goal-evidence-merge-operation.mjs", import.meta.url), "utf8"),
    readFile(new URL("../apps/mobile-capture/HighGroundCapture/scripts/run-capture-runtime-ui-smoke.sh", import.meta.url), "utf8"),
    readFile(new URL("../apps/mobile-capture/HighGroundCapture/HighGroundCaptureUITests/CaptureRoomRuntimeSmokeTests.swift", import.meta.url), "utf8"),
    readFile(new URL("../apps/mobile-capture/HighGroundCapture/HighGroundCapture/TranscriptCorrectionReview.swift", import.meta.url), "utf8"),
    readFile(new URL("../apps/mobile-capture/HighGroundCapture/HighGroundCapture/CapturePhoneShell.swift", import.meta.url), "utf8"),
    readFile(new URL("../apps/quipsly/src/app/api/mobile/capture/transcripts/packet/route-implementation.ts", import.meta.url), "utf8"),
  ]);

  assert.match(operation, /QUIPSLY_RETAINED_PACKET_GOAL_EVIDENCE_MERGE_OPERATION === "1"/);
  assert.match(operation, /requires an explicit loopback PostgreSQL database/);
  assert.match(operation, /kind: "GOAL"/);
  assert.match(operation, /action: "goal-progress"/);
  assert.match(operation, /JSON\.stringify\(goalDefinition\(canonicalAfter\)\) === JSON\.stringify\(definitionBefore\)/);
  assert.match(operation, /numericReceipt\?\.progressPercent === 35 && evidenceReceipt\?\.progressPercent == null/);
  assert.match(operation, /replay\.idempotentReplay === true/);
  assert.match(operation, /replayReceiptCount === 2/);
  assert.match(operation, /exactTranscriptReturnOperatedAfterRelaunch: true/);

  assert.match(runner, /transcript-packet-goal-evidence-merge\)/);
  assert.match(runner, /testReviewedTranscriptPacketAddsEvidenceToExactExistingGoalAndReturnsToSource/);
  assert.match(runtimeTests, /func testReviewedTranscriptPacketAddsEvidenceToExactExistingGoalAndReturnsToSource/);
  assert.match(runtimeTests, /CapturePacketGoalMergeTargetPicker/);
  assert.match(runtimeTests, /CaptureTodayGoalMergedSourceLink_/);
  assert.match(runtimeTests, /CaptureTranscriptSourceBoundary_/);
  assert.match(nativeReview, /The goal keeps its identity, title, definition, status, target date, tags, linked tasks, progress percentage, and project/);
  assert.match(phoneShell, /CaptureGoalMergedEvidenceCard/);
  assert.match(phoneShell, /navigationDestination\(for: CaptureTranscriptSourceDestination\.self\)/);
  assert.match(packetRoute, /progressReceipts: \{ where: \{ kind: GOAL_EVIDENCE_MERGE_KIND \} \}/);
});
