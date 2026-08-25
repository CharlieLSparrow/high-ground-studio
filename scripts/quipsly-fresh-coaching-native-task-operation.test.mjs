#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

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
assert.match(subject, /taskMutated: false/);
assert.match(subject, /duplicateTaskCreated: false/);
assert.match(subject, /mode: 0o600/);
assert.match(subject, /secretsPrinted: false/);
assert.match(runner, /testReviewedTranscriptTaskAppearsInTodayAndReturnsToExactSourceOnIPhone/);
assert.match(runner, /testReviewedTranscriptTaskStaysPrivateFromOtherSessionParticipant/);
assert.match(uiTests, /CaptureTodayTaskSourceLink_/);
assert.match(uiTests, /CaptureTodayFollowThroughBoundary/);

console.log(JSON.stringify({ ok: true, assertions: 12 }));
