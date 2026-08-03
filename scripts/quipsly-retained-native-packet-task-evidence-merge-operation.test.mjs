#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("retained native task-evidence merge proves immutable task state, replay, and source return", async () => {
  const [operation, runner, runtimeTests, nativeReview, phoneShell, packetRoute] = await Promise.all([
    readFile(new URL("./quipsly-retained-native-packet-task-evidence-merge-operation.mjs", import.meta.url), "utf8"),
    readFile(new URL("../apps/mobile-capture/HighGroundCapture/scripts/run-capture-runtime-ui-smoke.sh", import.meta.url), "utf8"),
    readFile(new URL("../apps/mobile-capture/HighGroundCapture/HighGroundCaptureUITests/CaptureRoomRuntimeSmokeTests.swift", import.meta.url), "utf8"),
    readFile(new URL("../apps/mobile-capture/HighGroundCapture/HighGroundCapture/TranscriptCorrectionReview.swift", import.meta.url), "utf8"),
    readFile(new URL("../apps/mobile-capture/HighGroundCapture/HighGroundCapture/CapturePhoneShell.swift", import.meta.url), "utf8"),
    readFile(new URL("../apps/quipsly/src/app/api/mobile/capture/transcripts/packet/actions/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(operation, /QUIPSLY_RETAINED_PACKET_TASK_EVIDENCE_MERGE_OPERATION === "1"/);
  assert.match(operation, /requires an explicit loopback PostgreSQL database/);
  assert.match(operation, /taskReminder\.create/);
  assert.match(operation, /taskRecurrenceSeries\.create/);
  assert.match(operation, /goalTaskLink\.create/);
  assert.match(operation, /JSON\.stringify\(taskDefinition\(canonicalAfter\)\) === JSON\.stringify\(definitionBefore\)/);
  assert.match(operation, /canonicalAfter\.evidenceReceipts\.length === 1/);
  assert.match(operation, /replay\.idempotentReplay === true/);
  assert.match(operation, /exactTranscriptReturnOperatedAfterRelaunch: true/);

  assert.match(runner, /transcript-packet-task-evidence-merge\)/);
  assert.match(runner, /testReviewedTranscriptPacketAddsEvidenceToExactExistingTaskAndReturnsToSource/);
  assert.match(runtimeTests, /func testReviewedTranscriptPacketAddsEvidenceToExactExistingTaskAndReturnsToSource/);
  assert.match(runtimeTests, /CapturePacketTaskMergeTargetPicker/);
  assert.match(runtimeTests, /CaptureTodayTaskMergedEvidenceSource_/);
  assert.match(runtimeTests, /CaptureTranscriptSourceBoundary_/);
  assert.match(nativeReview, /Task identity, title, detail, status, owner, dates, reminder, recurrence, tags, goal links, and project remain unchanged/);
  assert.match(phoneShell, /CaptureTodayTaskMergedEvidenceSource_/);
  assert.match(packetRoute, /actionItemEvidenceReceipt\.create/);
  assert.match(packetRoute, /mergeChangesNoTaskIdentityStatusOwnerDatesReminderRecurrenceTagsGoalsOrProject/);
});
