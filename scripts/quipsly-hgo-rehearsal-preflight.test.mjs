#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  composeRehearsalPreflight,
  parseArguments,
} from "./quipsly-hgo-rehearsal-preflight.mjs";
import { QUIPSLY_CAPTURE_RELEASE_TARGET } from "./release/quipsly-capture-release-target.mjs";

const livePreflightShell = await readFile(
  new URL("./quipsly-hgo-rehearsal-live-preflight.sh", import.meta.url),
  "utf8",
);
const captureLauncherSmokeShell = await readFile(
  new URL(
    "../apps/QuipslyStudio/script/smoke_capture_setup_launcher.sh",
    import.meta.url,
  ),
  "utf8",
);
const [studioProjectSpec, studioProjectFile, studioBuildShell, nativeAccountSmokeShell] = await Promise.all([
  readFile(new URL("../apps/QuipslyStudio/project.yml", import.meta.url), "utf8"),
  readFile(new URL("../apps/QuipslyStudio/QuipslyStudio.xcodeproj/project.pbxproj", import.meta.url), "utf8"),
  readFile(new URL("../apps/QuipslyStudio/script/build_and_run.sh", import.meta.url), "utf8"),
  readFile(new URL("../apps/QuipslyStudio/script/smoke_native_account_control.sh", import.meta.url), "utf8"),
]);

function fixture(overrides = {}) {
  const base = {
    appStore: {
      passed: true,
      app: { name: "Quipsly Capture" },
      build: {
        buildNumber: QUIPSLY_CAPTURE_RELEASE_TARGET.buildNumber,
        processingState: "VALID",
        externalBuildState: "IN_BETA_TESTING",
      },
      testers: { expectedTester: { state: "INVITED" } },
    },
    publicLink: {
      ok: true,
      open: true,
      handoffMatches: true,
      appName: "Quipsly Capture",
      canonicalUrl: "https://testflight.apple.com/join/XwRRcYUm",
    },
    rehearsal: {
      passed: true,
      baseUrl: "https://nest.quipsly.com",
      project: { slug: "high-ground-odyssey-rehearsal" },
      episode: { slug: "testflight-rehearsal" },
      room: {
        id: "room-1",
        participantCount: 2,
        providerRoomConfigured: true,
        provider: "livekit",
        hostConsentStatus: "REQUESTED",
        guestConsentStatus: "REQUESTED",
      },
      guestSignIn: {
        state: "AWAITING_FIRST_VERIFIED_GOOGLE_SIGN_IN",
        justInTimeGoogleLinkReady: true,
        verificationEmailRequired: false,
        identityAuthority: "firebase:quipsly-reef",
      },
    },
    watch: {
      passed: true,
      baseUrl: "https://nest.quipsly.com",
      release: { sourceSha: "a".repeat(40) },
      manuscript: {
        authenticatedStatus: 200,
        outsiderDenied: true,
        blockCount: 34,
        stableIdsUnique: true,
        allBodiesPresent: true,
        version: "manuscript-v1",
      },
      watch: {
        exactClipOrder: true,
        leadSelected: true,
        status: "paused",
        positionSeconds: 0,
        sessionStarted: false,
        watchedSegmentCount: 0,
        revision: 5,
        selectedClipTitle: "Ted Lasso Be Curious.mp4",
      },
      protectedMedia: [
        { outsiderDenied: true, exactBytesMatch: true },
        { outsiderDenied: true, exactBytesMatch: true },
        { outsiderDenied: true, exactBytesMatch: true },
      ],
    },
    macAppText: [
      "status=present",
      "bundleId=com.highground.QuipslyMac",
      "canonicalPids=123",
      "canonicalBundle=/private/QuipslyMac.app",
      "noncanonicalPids=",
    ].join("\n"),
    macState: {
      nativeAccount: {
        hasSavedSession: false,
        isVerified: false,
        statusMessage: "Not connected yet.",
      },
    },
    macCapture: {
      launchStage: "capture_setup_ready",
      projectionOwnership: "episode-capture-setup",
      capture: {
        episodeSpaceID: "testflight-rehearsal",
        microphoneAuthorization: "authorized",
        cameraAuthorization: "authorized",
        cameraPreviewReady: true,
        cameraSignalVerified: false,
        includeCameraReference: false,
        canStartRecording: false,
        selectedInput: {
          id: "mv7i",
          name: "Shure MV7i",
          manufacturer: "Shure Inc",
          inputChannels: 2,
          outputChannels: 2,
          sampleRate: 48_000,
        },
        selectedOutput: {
          id: "mv7i",
          name: "Shure MV7i",
          manufacturer: "Shure Inc",
          inputChannels: 2,
          outputChannels: 2,
          sampleRate: 48_000,
        },
        selectedVideo: {
          id: "eos",
          name: "EOS Webcam Utility",
        },
      },
    },
    nativeAccountSmoke: { passed: true },
    captureLauncherSmoke: { passed: true },
    iphoneSupportSnapshot: null,
    auditedAt: "2026-07-30T00:00:00.000Z",
  };
  return { ...base, ...overrides };
}

test("argument parser requires every redacted evidence input", () => {
  const parsed = parseArguments([
    "--app-store", "app-store.json",
    "--public-link", "public.json",
    "--rehearsal", "rehearsal.json",
    "--watch", "watch.json",
    "--mac-app", "mac.txt",
    "--mac-account", "mac-state.json",
    "--mac-capture", "capture.json",
    "--native-account-smoke", "account-smoke.json",
    "--capture-launcher-smoke", "capture-smoke.json",
    "--output", "receipt.json",
  ]);
  assert.equal(parsed.outputPath, "receipt.json");
  assert.equal(parsed.macCapturePath, "capture.json");
  assert.equal(parsed.captureLauncherSmokePath, "capture-smoke.json");
  assert.equal(parsed.iphoneSupportSnapshotPath, "");
});

test("pnpm argument separator reaches the live preflight harmlessly", () => {
  assert.match(
    livePreflightShell,
    /case "\$1" in\s+--\)\s+shift\s+;;/,
  );
  assert.match(
    livePreflightShell,
    /QUIPSLY_CAPTURE_IPHONE_SUPPORT_SNAPSHOT/,
  );
  assert.match(
    livePreflightShell,
    /quipsly-capture-physical-install-readback\.mjs/,
  );
});

test("canonical Mac generation and build preserve the native-account Keychain group", () => {
  assert.match(
    studioProjectSpec,
    /CODE_SIGN_ENTITLEMENTS: Sources\/QuipslyMac\/QuipslyMac\.entitlements/,
  );
  assert.equal(
    (studioProjectFile.match(/CODE_SIGN_ENTITLEMENTS = Sources\/QuipslyMac\/QuipslyMac\.entitlements;/g) ?? []).length,
    2,
  );
  assert.match(studioBuildShell, /expected_keychain_group="\$EXPECTED_TEAM_ID\.\$APP_BUNDLE_ID"/);
  assert.match(studioBuildShell, /keychain-access-groups\.0/);
  assert.match(nativeAccountSmokeShell, /dataProtectionKeychainEntitled/);
});

test("open public beta plus staged room is ready to begin human rehearsal", () => {
  const receipt = composeRehearsalPreflight(fixture());
  assert.equal(receipt.infrastructureReady, true);
  assert.equal(receipt.readyToBeginHumanRehearsal, true);
  assert.equal(receipt.readyToRecordNow, false);
  assert.equal(receipt.testFlight.expectedNamedTesterState, "INVITED");
  assert.equal(receipt.testFlight.namedTesterStateReportsInstalled, false);
  assert.ok(
    receipt.blockers.includes(
      "human:confirm-scott-physical-testflight-install",
    ),
  );
  assert.ok(
    receipt.blockers.includes(
      "human:complete-charlie-mac-google-handoff",
    ),
  );
  assert.ok(
    receipt.blockers.includes(
      "human:grant-both-recording-consents-in-session",
    ),
  );
  assert.equal(receipt.safety.physicalClaimsInvented, false);
});

test("named tester INSTALLED state remains separate from physical proof", () => {
  const input = fixture();
  input.appStore.testers.expectedTester.state = "INSTALLED";
  const receipt = composeRehearsalPreflight(input);
  assert.equal(receipt.testFlight.namedTesterStateReportsInstalled, true);
  assert.equal(receipt.humanGates.scottPhysicalInstallProven, false);
  assert.equal(receipt.readyToRecordNow, false);
});

test("a privacy-bounded exact-build iPhone receipt proves install and authentication only", () => {
  const input = fixture({
    iphoneSupportSnapshot: {
      ok: true,
      checkedAt: "2026-08-05T20:10:00Z",
      physicalInstallAndAuthenticationProven: true,
      physicalCaptureAcceptanceProven: false,
      target: {
        appId: QUIPSLY_CAPTURE_RELEASE_TARGET.appId,
        bundleId: QUIPSLY_CAPTURE_RELEASE_TARGET.bundleId,
        version: QUIPSLY_CAPTURE_RELEASE_TARGET.marketingVersion,
        build: QUIPSLY_CAPTURE_RELEASE_TARGET.buildNumber,
      },
      snapshot: {
        createdAt: "2026-08-05T20:00:00Z",
        appBuild: QUIPSLY_CAPTURE_RELEASE_TARGET.buildNumber,
        deviceModel: "iPhone17,3",
        systemVersion: "26.2",
        accountAccessMode: "online",
      },
    },
  });

  const receipt = composeRehearsalPreflight(input);

  assert.equal(receipt.humanGates.scottPhysicalInstallProven, true);
  assert.equal(receipt.testFlight.physicalInstallReadback.passed, true);
  assert.equal(
    receipt.testFlight.physicalInstallReadback.physicalCaptureAcceptanceProven,
    false,
  );
  assert.equal(receipt.humanGates.physicalRoutesAndPermissionsProven, false);
  assert.equal(receipt.readyToRecordNow, false);
  assert.ok(
    !receipt.blockers.includes("human:confirm-scott-physical-testflight-install"),
  );
  assert.ok(receipt.blockers.includes("physical:prove-iphone-and-mv7i-eos-routes"));
  assert.equal(receipt.safety.rawIPhoneSupportSnapshotRetained, false);
});

test("closed public link fails infrastructure readiness", () => {
  const input = fixture();
  input.publicLink.open = false;
  input.publicLink.ok = false;
  const receipt = composeRehearsalPreflight(input);
  assert.equal(receipt.infrastructureReady, false);
  assert.equal(receipt.readyToBeginHumanRehearsal, false);
  assert.ok(receipt.blockers.includes("infrastructure:publicLinkOpen"));
});

test("duplicate Mac bundle fails infrastructure readiness", () => {
  const input = fixture({
    macAppText: [
      "status=present",
      "bundleId=com.highground.QuipslyMac",
      "canonicalPids=123",
      "warning=duplicate_quipsly_bundle_running",
      "noncanonicalPids=456",
    ].join("\n"),
  });
  const receipt = composeRehearsalPreflight(input);
  assert.equal(receipt.infrastructureChecks.canonicalMacAppReady, false);
  assert.ok(
    receipt.blockers.includes("infrastructure:canonicalMacAppReady"),
  );
});

test("verified Mac session and exact hardware remain separate from physical proof", () => {
  const input = fixture();
  input.macState.nativeAccount = {
    hasSavedSession: true,
    isVerified: true,
    statusMessage: "Connected to Quipsly.",
  };

  const receipt = composeRehearsalPreflight(input);

  assert.equal(receipt.infrastructureChecks.macHardwareInventoryReady, true);
  assert.equal(receipt.humanGates.charlieMacSessionVerified, true);
  assert.equal(receipt.mac.capture.selectedInputName, "Shure MV7i");
  assert.equal(receipt.mac.capture.selectedOutputName, "Shure MV7i");
  assert.equal(receipt.mac.capture.selectedVideoName, "EOS Webcam Utility");
  assert.equal(receipt.mac.capture.selectedSampleRate, 48_000);
  assert.equal(receipt.mac.capture.cameraPreviewReady, true);
  assert.equal(receipt.mac.capture.cameraSignalVerified, false);
  assert.equal(receipt.mac.capture.canStartRecording, false);
  assert.equal(receipt.humanGates.physicalRoutesAndPermissionsProven, false);
  assert.equal(receipt.readyToRecordNow, false);
  assert.ok(
    !receipt.blockers.includes(
      "human:complete-charlie-mac-google-handoff",
    ),
  );
  assert.ok(
    !receipt.nextActions.some((action) =>
      action.includes("Mac Google handoff")),
  );
});

test("live preflight preserves account proof before opening capture setup", () => {
  const accountCheckIndex = livePreflightShell.indexOf(
    "run_logged mac-account-check",
  );
  const accountCheckReadyIndex = livePreflightShell.indexOf(
    "run_logged mac-account-check-ready",
  );
  const macStateIndex = livePreflightShell.indexOf("run_logged mac-state");
  const captureLauncherIndex = livePreflightShell.indexOf(
    "run_logged capture-launcher-smoke",
  );
  const macCaptureIndex = livePreflightShell.indexOf(
    "run_logged mac-capture",
  );

  assert.ok(accountCheckIndex > 0);
  assert.ok(accountCheckReadyIndex > accountCheckIndex);
  assert.ok(macStateIndex > accountCheckReadyIndex);
  assert.ok(captureLauncherIndex > macStateIndex);
  assert.ok(macCaptureIndex > captureLauncherIndex);
});

test("capture launcher smoke enters the bounded acceptance runtime itself", () => {
  const acceptanceLaunchIndex = captureLauncherSmokeShell.indexOf(
    "launch-capture-acceptance --no-build",
  );
  const openSetupIndex = captureLauncherSmokeShell.indexOf(
    "capture-open-setup",
  );

  assert.ok(acceptanceLaunchIndex > 0);
  assert.ok(openSetupIndex > acceptanceLaunchIndex);
});
