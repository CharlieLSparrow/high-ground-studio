#!/usr/bin/env node

import assert from "node:assert/strict";
import test from "node:test";

import {
  composeRehearsalPreflight,
  parseArguments,
} from "./quipsly-hgo-rehearsal-preflight.mjs";
import { QUIPSLY_CAPTURE_RELEASE_TARGET } from "./release/quipsly-capture-release-target.mjs";

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
    nativeAccountSmoke: { passed: true },
    captureLauncherSmoke: { passed: true },
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
    "--native-account-smoke", "account-smoke.json",
    "--capture-launcher-smoke", "capture-smoke.json",
    "--output", "receipt.json",
  ]);
  assert.equal(parsed.outputPath, "receipt.json");
  assert.equal(parsed.captureLauncherSmokePath, "capture-smoke.json");
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
