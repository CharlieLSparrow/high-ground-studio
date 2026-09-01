import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("./quipsly-fresh-coaching-native-recovery-flight.mjs", import.meta.url),
  "utf8",
);

test("fresh native flight keeps credentials private while operating client entry, room join, and recovery", () => {
  assert.match(source, /stdio: \["ignore", "pipe", "inherit", "ipc"\]/);
  assert.match(source, /parseFreshCoachingCredentialIPCPacket/);
  assert.doesNotMatch(source, /security[^\n]+find-generic-password/);
  assert.match(source, /QUIPSLY_CAPTURE_UI_TEST_MODE: "session-deep-link"/);
  assert.match(source, /QUIPSLY_CAPTURE_UI_TEST_MODE: "room-join"/);
  assert.match(source, /QUIPSLY_CAPTURE_UI_TEST_MODE: "capture-recovery"/);
  assert.match(source, /QUIPSLY_CAPTURE_UI_TEST_MICROPHONE_PERMISSION_MODE: "reset"/);
  assert.match(source, /QUIPSLY_CAPTURE_UI_TEST_EXPECT_MICROPHONE_PROMPT: "1"/);
  assert.match(source, /\?mode=prepare/);
  assert.match(source, /#session-preparation-heading/);
  assert.match(source, /__reactProps\$/);
  assert.match(source, /getByRole\("heading", \{ name: "Recording ready"/);
  assert.match(source, /recordingConsentCanRecordAudio/);
  assert.match(source, /recordingConsentCanTranscribe/);
  assert.match(source, /quipsly-session-workspace-consent-v1/);
  assert.match(source, /passwordsWrittenToArtifact: false/);
  assert.match(source, /keychainReadRequiredForAutomatedFlight: false/);
});

test("Simulator CallKit skip is explicit evidence, never a provider-media pass", () => {
  assert.match(source, /const roomJoinPassed =/);
  assert.match(source, /const simulatorCallKitFailClosed =/);
  assert.match(source, /providerRoomJoinedAndLeft: roomJoinPassed/);
  assert.match(
    source,
    /providerRoomJoinFailClosedOnSimulator: simulatorCallKitFailClosed/,
  );
  assert.match(source, /realProviderRoomMediaProven: roomJoinPassed/);
});
