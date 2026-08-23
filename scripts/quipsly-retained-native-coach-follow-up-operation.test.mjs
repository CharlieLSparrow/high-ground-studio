import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("native coach follow-up operation is local, reversible, and actor-separated", async () => {
  const [operator, runner, nativeTest, bridge, components] = await Promise.all([
    readFile(new URL("./quipsly-retained-native-coach-follow-up-operation.mjs", import.meta.url), "utf8"),
    readFile(new URL("../apps/mobile-capture/HighGroundCapture/scripts/run-capture-runtime-ui-smoke.sh", import.meta.url), "utf8"),
    readFile(new URL("../apps/mobile-capture/HighGroundCapture/HighGroundCaptureUITests/CaptureRoomRuntimeSmokeTests.swift", import.meta.url), "utf8"),
    readFile(new URL("../apps/mobile-capture/HighGroundCapture/HighGroundCapture/BridgeModels.swift", import.meta.url), "utf8"),
    readFile(new URL("../apps/mobile-capture/HighGroundCapture/HighGroundCapture/QuipslyMobileComponents.swift", import.meta.url), "utf8"),
  ]);

  assert.match(operator, /refuses non-loopback Nest origins/);
  assert.match(operator, /requireLoopbackDatabaseUrl/);
  assert.match(operator, /coach-follow-up-authoring/);
  assert.match(operator, /client-follow-up/);
  assert.match(operator, /DRAFT_CREATED\|DRAFT_UPDATED\|RELEASED_IN_APP/);
  assert.match(operator, /RELEASED_IN_APP\|OPENED_IN_APP/);
  assert.match(operator, /externalMessageSent === false/);
  assert.match(operator, /providerCalendarMutated === false/);
  assert.match(operator, /publicationPerformed === false/);
  assert.match(operator, /sessionOutput\.delete/);
  assert.match(operator, /credentialsPrinted: false/);
  assert.match(runner, /coach-follow-up-authoring\)/);
  assert.match(nativeTest, /testAssignedCoachCreatesRevisesAndReleasesClientFollowUpInCapture/);
  assert.match(nativeTest, /testReleasedClientFollowUpAppearsAndAutomaticallyAcknowledgesInCapture/);
  assert.match(bridge, /func saveClientFollowUpDraft/);
  assert.match(bridge, /func releaseClientFollowUp/);
  assert.match(bridge, /clientFollowUpStableUUID/);
  assert.ok(components.includes('Share with \\(output.recipientLabel)'));
  assert.match(components, /CaptureClientFollowUpOpenState_/);
  assert.match(components, /It does not send an email or message/);
});
