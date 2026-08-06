#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [operation, runner, library, runtimeTests, capturePhoneShell] = await Promise.all([
  readFile(new URL("./quipsly-retained-native-reviewed-packet-materialization-operation.mjs", import.meta.url), "utf8"),
  readFile(new URL("../apps/mobile-capture/HighGroundCapture/scripts/run-capture-runtime-ui-smoke.sh", import.meta.url), "utf8"),
  readFile(new URL("../apps/mobile-capture/HighGroundCapture/HighGroundCapture/LocalRecordingLibrary.swift", import.meta.url), "utf8"),
  readFile(new URL("../apps/mobile-capture/HighGroundCapture/HighGroundCaptureUITests/CaptureRoomRuntimeSmokeTests.swift", import.meta.url), "utf8"),
  readFile(new URL("../apps/mobile-capture/HighGroundCapture/HighGroundCapture/CapturePhoneShell.swift", import.meta.url), "utf8"),
]);

assert.match(operation, /QUIPSLY_RETAINED_REVIEWED_PACKET_OPERATION === "1"/);
assert.match(operation, /requires an explicit loopback PostgreSQL database/);
assert.match(operation, /const attempts = method === "GET" \? 3 : 1/);
assert.match(operation, /sourceSHA256 === sourceAsset\.checksum/);
assert.match(operation, /recoveredFromMissingTemporarySource/);
assert.match(operation, /quipsly-synthetic-coaching-v2/);
assert.match(operation, /providerSourceId: retainedSource\.path/);
assert.match(operation, /transcriptSegmentVerification\.findMany/);
assert.match(operation, /playbackPositionSeconds >= segment\.endSeconds - 0\.25/);
assert.match(operation, /quipsly\.session\.transcript-goal\.materialize/);
assert.match(operation, /quipsly\.session\.transcript-task\.materialize/);
assert.match(operation, /governedGoal\.attempts\.length === 1/);
assert.match(operation, /governedTask\.attempts\.length === 1/);
assert.match(operation, /goalGovernance\.actionId === governedGoal\.id/);
assert.match(operation, /taskGovernance\.actionId === governedTask\.id/);
assert.match(operation, /nonCanonicalNoteDraftReviewed: true/);
assert.match(operation, /canonicalMaterialization: \{ notes: 1, tasks: 1, goals: 1, calendarLinks: 0 \}/);
assert.match(runner, /transcript-packet-materialization\)/);
assert.match(runner, /TEST_CASE="testReviewedTranscriptPacketMaterializesCanonicalNoteGoalAndTask"/);
assert.match(runner, /quipsly-capture-runtime-playback-fixture-/);
assert.match(library, /#if DEBUG[\s\S]*installRuntimeSmokePlaybackFixtureIfRequested/);
assert.match(library, /ownerAccountID == AuthManager\.currentStoredOwnerID\(\)/);
assert.match(library, /actualSHA256 == expectedSHA256/);
assert.match(runtimeTests, /testReviewedTranscriptPacketMaterializesCanonicalNoteGoalAndTask/);
assert.match(runtimeTests, /CaptureTranscriptConfirmAsIsButton_/);
assert.match(runtimeTests, /CaptureTranscriptBuildCurrentPacketButton/);
assert.match(runtimeTests, /CapturePacketNoteEditButton_/);
assert.match(runtimeTests, /CapturePacketNoteSaved_/);
assert.match(runtimeTests, /CapturePacketGoalCreateButton/);
assert.match(runtimeTests, /CapturePacketTaskCreateButton/);
assert.match(capturePhoneShell, /tab == \.today[\s\S]*todayClient\.load\(\)/,
  "entering Today must refresh cross-surface canonical work instead of showing the launch snapshot");

console.log("PASS retained native reviewed-packet materialization operation contract");
