#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const subject = await readFile(
  new URL("./quipsly-fresh-coaching-native-task-operation.mjs", import.meta.url),
  "utf8",
);
const runner = await readFile(
  new URL("../apps/mobile-capture/HighGroundCapture/scripts/run-capture-runtime-ui-smoke.sh", import.meta.url),
  "utf8",
);
const uiTests = await readFile(
  new URL("../apps/mobile-capture/HighGroundCapture/HighGroundCaptureUITests/CaptureRoomRuntimeSmokeTests.swift", import.meta.url),
  "utf8",
);

assert.match(subject, /loadFreshCoachingAcceptanceContext/);
assert.match(subject, /refuses non-loopback PostgreSQL/);
assert.match(subject, /transcript-task-readback/);
assert.match(subject, /transcript-task-isolation/);
assert.match(subject, /QUIPSLY_CAPTURE_UI_TEST_DERIVED_DATA_PATH/);
assert.match(subject, /taskMutated: false/);
assert.match(subject, /duplicateTaskCreated: false/);
assert.match(subject, /otherParticipantPrivatePacketIsolationProven: true/);
assert.match(subject, /participantSharedFollowUpBoundaryRendered: true/);
assert.match(subject, /explicitLocalSourceAvailabilityBoundaryProven: true/);
assert.match(subject, /mode: 0o600/);
assert.match(subject, /secretsPrinted: false/);
assert.match(runner, /testReviewedTranscriptTaskAppearsInTodayAndReturnsToExactSourceOnIPhone/);
assert.match(runner, /testAssignedTranscriptTaskStaysOutOfAnotherParticipantsTodayButAppearsInSharedSession/);
assert.match(uiTests, /CaptureTodayTaskSourceLink_/);
assert.match(uiTests, /CaptureTodayFollowThroughBoundary/);
assert.match(uiTests, /CaptureTranscriptParticipantFollowUpBoundary/);
assert.match(uiTests, /CaptureTranscriptBuildCurrentPacketButton/);

// Catch stale selectors before invoking Xcode. Checking only that the runner
// contains an expected string previously let a renamed XCTest go unnoticed.
const testDirectory = new URL("../apps/mobile-capture/HighGroundCapture/HighGroundCaptureUITests/", import.meta.url);
const testSources = await Promise.all((await readdir(testDirectory))
  .filter((file) => file.endsWith(".swift"))
  .map((file) => readFile(new URL(file, testDirectory), "utf8")));
const testMethods = new Set(testSources.flatMap((source) =>
  [...source.matchAll(/func\s+(test\w+)\s*\(/g)].map((match) => match[1])));
const selectedMethods = [...runner.matchAll(/TEST_CASE="(test\w+)"/g)].map((match) => match[1]);
assert.ok(selectedMethods.length > 0, "The runtime runner must select executable XCTest methods.");
for (const method of selectedMethods) {
  assert.ok(testMethods.has(method), `Runtime selector has no XCTest method: ${method}`);
}

console.log(JSON.stringify({ ok: true, sourceWiringOnly: true, runtimeSelectorsChecked: selectedMethods.length }));
