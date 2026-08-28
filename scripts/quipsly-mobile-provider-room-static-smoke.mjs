#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const files = {
  controller: path.join(
    root,
    "apps/mobile-capture/HighGroundCapture/HighGroundCapture/ProviderRoomController.swift",
  ),
  phoneShell: path.join(
    root,
    "apps/mobile-capture/HighGroundCapture/HighGroundCapture/CapturePhoneShell.swift",
  ),
  bridge: path.join(
    root,
    "apps/mobile-capture/HighGroundCapture/HighGroundCapture/BridgeModels.swift",
  ),
  runtimeUISmokeRunner: path.join(
    root,
    "apps/mobile-capture/HighGroundCapture/scripts/run-capture-runtime-ui-smoke.sh",
  ),
  joinRoute: path.join(root, "apps/quipsly/src/app/api/mobile/capture/rooms/join/route.ts"),
  recordingRoute: path.join(root, "apps/quipsly/src/app/api/mobile/capture/rooms/provider-recording/route.ts"),
  mediaVaultPolicy: path.join(root, "docs/quipsly/media-vault-policy.md"),
};

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function assertIncludes(name, haystack, needle, explanation) {
  if (!haystack.includes(needle)) {
    throw new Error(`${name} missing ${JSON.stringify(needle)}: ${explanation}`);
  }
}

function assertMatches(name, haystack, regex, explanation) {
  if (!regex.test(haystack)) {
    throw new Error(`${name} missing ${regex}: ${explanation}`);
  }
}

const controller = read(files.controller);
const phoneShell = read(files.phoneShell);
const bridge = read(files.bridge);
const runtimeUISmokeRunner = read(files.runtimeUISmokeRunner);
const joinRoute = read(files.joinRoute);
const recordingRoute = read(files.recordingRoute);
const mediaVaultPolicy = read(files.mediaVaultPolicy);

assertIncludes("ProviderRoomController", controller, "import CallKit", "native iPhone call surface must be explicit");
assertIncludes("ProviderRoomController", controller, "import AVFoundation", "CallKit audio activation needs AVAudioSession visibility");
assertIncludes("ProviderRoomController", controller, "#if canImport(LiveKit)", "LiveKit linkage must be compile-time explicit until the SDK is attached");
assertIncludes("ProviderRoomController", controller, "providerRuntimeAvailable", "native SDK readiness must be a visible app fact");
assertIncludes("ProviderRoomController", controller, "didActivate audioSession", "CallKit audio activation should not be ignored");
assertIncludes("ProviderRoomController", controller, "didDeactivate audioSession", "CallKit audio cleanup should be visible");
assertIncludes("ProviderRoomController", controller, "ConnectOptions(autoSubscribe: useCallAudio)", "a second-device endpoint must not subscribe to remote call media");
assertIncludes("ProviderRoomController", controller, "enabled: useCallAudio && !joinMuted", "a muted or second-device endpoint must not publish a provider microphone");
assertIncludes("ProviderRoomController", controller, "retainedRecordingContinues: Bool = false", "call mute explicitly distinguishes a continuing local master");
assertIncludes("ProviderRoomController", controller, "Call muted. Protected local recording continues.", "call mute explains that outbound silence does not stop the protected master");

for (const needle of [
  'accessibilityIdentifier("CaptureRecorderView")',
  'accessibilityIdentifier("CaptureSessionTruthPanel")',
  'accessibilityIdentifier("CaptureProviderRoomControls")',
  'accessibilityIdentifier("CaptureCallInputRoute")',
  'accessibilityIdentifier("CaptureUseCallAudioToggle")',
  'accessibilityIdentifier("ProviderJoinRoomButton")',
  'accessibilityIdentifier("CapturePrepareProviderRecordingReceipt")',
  'accessibilityIdentifier("CaptureRecordWithoutJoiningButton")',
  'accessibilityIdentifier: "ProviderToggleMuteButton"',
  'accessibilityIdentifier: "ProviderLeaveRoomButton"',
  'accessibilityIdentifier("CapturePersistentCallDock")',
  "model.providerRoom.providerRuntimeLabel",
  "model.providerRoom.providerRuntimeAvailable",
  "model.providerRoom.providerRuntimeDetail",
  "readiness.providerEgressLabel",
  "readiness.providerEgressDetail",
]) {
  assertIncludes("CapturePhoneShell", phoneShell, needle, "the shipping Session workflow must distinguish app runtime, server egress, receipt, live-room, and local-recording truth");
}

assertIncludes(
  "CapturePhoneShell",
  phoneShell,
  "await model.joinRoom(",
  "joining the conversation must remain an explicit action",
);
assertIncludes(
  "CapturePhoneShell",
  phoneShell,
  "Task { await prepareProviderRecordingReceipt() }",
  "preparing a server recording receipt must remain separate from joining the conversation",
);
assertIncludes(
  "CapturePhoneShell",
  phoneShell,
  "Button(action: onToggleLocalRecordingWorkspace)",
  "opening local recording must remain separate from joining the conversation",
);

for (const forbidden of ["Operator start", "Operator stop", "START_EGRESS", "STOP_EGRESS"]) {
  if (phoneShell.includes(forbidden)) {
    throw new Error(`CapturePhoneShell should not expose ${JSON.stringify(forbidden)}: staff-gated provider egress remains a Nest operator action`);
  }
}

assertIncludes("BridgeModels", bridge, "providerRecordingAction", "native app should call the shared provider-recording route");
assertIncludes("BridgeModels", bridge, "ProcessInfo.processInfo.environment[\"QUIPSLY_API_BASE_URL\"]", "DEBUG simulator/UI proof should target the intended Nest backend");
assertIncludes("BridgeModels", bridge, "#if DEBUG", "runtime backend override must not be a release auth bypass");
assertIncludes("BridgeModels", bridge, "PREPARE_RECEIPT_SLOT", "receipt slot preparation must remain first-class");
assertIncludes("BridgeModels", bridge, "START_EGRESS", "staff/operator start route should be reachable from the client seam");
assertIncludes("BridgeModels", bridge, "STOP_EGRESS", "staff/operator stop route should be reachable from the client seam");

assertIncludes("runtime UI smoke", runtimeUISmokeRunner, "QUIPSLY_CAPTURE_UI_TEST_BASE_URL", "runtime UI smoke should target the intended Nest backend");
assertIncludes("runtime UI smoke", runtimeUISmokeRunner, 'TEST_CASE="testSignedInCaptureRoomSurfacesAreVisible"', "runtime UI smoke should retain the focused room surface proof");
assertIncludes("runtime UI smoke", runtimeUISmokeRunner, 'TEST_CASE="testConsentedCapturePlaybackAndCrashRecovery"', "runtime UI smoke should expose the opt-in real capture recovery proof");
assertIncludes("runtime UI smoke", runtimeUISmokeRunner, '-only-testing:"HighGroundCaptureUITests/$TEST_CLASS/$TEST_CASE"', "runtime UI smoke should focus every proof to one selected class and test");
assertIncludes("runtime UI smoke", runtimeUISmokeRunner, "does not bypass auth", "runtime UI smoke must keep auth truth explicit");

assertIncludes("room join route", joinRoute, "createLiveKitJoinToken", "Nest, not iOS, should mint provider room tokens");
assertIncludes("room join route", joinRoute, "joiningStartsRecording: false", "joining a room must not imply recording");
assertIncludes("provider recording route", recordingRoute, "START_EGRESS", "server must own provider recording start");
assertIncludes("provider recording route", recordingRoute, "STOP_EGRESS", "server must own provider recording stop");
assertIncludes("provider recording route", recordingRoute, "staff-only", "provider egress remains operator-gated until UX is mature");

assertMatches(
  "media vault policy",
  mediaVaultPolicy,
  /media-vault\/proxy\/.+media-vault\/recordings\/livekit/s,
  "proxy files and provider recordings must share the one media-vault policy",
);
assertIncludes(
  "media vault policy",
  mediaVaultPolicy,
  "Buckets are storage; Nests decide who can see and use assets.",
  "storage must not become the product source of truth",
);

console.log(JSON.stringify({
  ok: true,
  checked: Object.keys(files).length,
  facts: [
    "CallKit surface is explicit",
    "LiveKit SDK linkage is visible and not faked",
    "provider recording actions use the Nest route",
    "joining and recording are separate",
    "proxy and recording bucket policy stays centralized",
  ],
}, null, 2));
