import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("retained native coaching continuity stays local, credential-safe, and compiled", async () => {
  const [operator, runner, nativeTest, shell] = await Promise.all([
    readFile(new URL(
      "./quipsly-retained-native-coaching-continuity-operation.mjs",
      import.meta.url,
    ), "utf8"),
    readFile(new URL(
      "../apps/mobile-capture/HighGroundCapture/scripts/run-capture-runtime-ui-smoke.sh",
      import.meta.url,
    ), "utf8"),
    readFile(new URL(
      "../apps/mobile-capture/HighGroundCapture/HighGroundCaptureUITests/CaptureRoomRuntimeSmokeTests.swift",
      import.meta.url,
    ), "utf8"),
    readFile(new URL(
      "../apps/mobile-capture/HighGroundCapture/HighGroundCapture/CapturePhoneShell.swift",
      import.meta.url,
    ), "utf8"),
  ]);

  assert.match(operator, /readRetainedQAPassword/);
  assert.match(operator, /refuses non-loopback Nest origins/);
  assert.match(operator, /QUIPSLY_CAPTURE_UI_TEST_MODE: "coaching-continuity"/);
  assert.match(operator, /QUIPSLY_CAPTURE_UI_TEST_MODE: "coaching-follow-through-work"/);
  assert.match(operator, /QUIPSLY_CAPTURE_UI_TEST_TASK_ID: TASK_ID/);
  assert.match(operator, /QUIPSLY_CAPTURE_UI_TEST_GOAL_ID: GOAL_ID/);
  assert.match(operator, /passedOperations: 2/);
  assert.match(operator, /artifactPreserved: true/);
  assert.match(operator, /credentialsPrinted: false/);
  assert.doesNotMatch(operator, /deleteMany|cleanupArtifact|removeArtifact/);
  assert.match(runner, /coaching-continuity\)/);
  assert.match(runner, /coaching-follow-through-work\)/);
  assert.match(nativeTest, /testPriorCoachingContinuityProjectsIntoExactNextSession/);
  assert.match(nativeTest, /testClientOpensExactFollowThroughGoalInWork/);
  assert.match(nativeTest, /CapturePriorSessionContinuity/);
  assert.match(nativeTest, /CapturePriorSessionFollowThrough/);
  assert.match(nativeTest, /Latest check-in 75%/);
  assert.match(nativeTest, /Evidence: I used the smaller boundary/);
  assert.match(shell, /CapturePriorContinuityOpenSource/);
  assert.match(shell, /CaptureFollowThroughOpenSource/);
  assert.match(shell, /CaptureFollowThroughOpenTask_/);
  assert.match(shell, /CaptureFollowThroughOpenGoal_/);
  assert.match(shell, /proxy\.scrollTo\(request\.scrollID/);
  assert.ok(shell.includes('Text("Evidence: \\(evidence)")'));
  assert.match(shell, /New check-in since release/);
  assert.match(shell, /no copied work/);
  assert.match(shell, /current Session unchanged/);
});
