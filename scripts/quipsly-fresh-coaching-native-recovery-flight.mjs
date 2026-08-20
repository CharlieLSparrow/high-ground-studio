#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { chmod, writeFile } from "node:fs/promises";
import path from "node:path";

import { loadFreshCoachingAcceptanceContext } from "./lib/coaching-acceptance-context.mjs";
import { readRetainedQAPassword } from "./lib/retained-qa-keychain.mjs";
import {
  clearRenderedSession,
  loadPlaywright,
  signInThroughRenderedLogin,
} from "./lib/retained-qa-browser.mjs";

assert.equal(
  process.env.QUIPSLY_FRESH_COACHING_NATIVE_RECOVERY,
  "1",
  "Set QUIPSLY_FRESH_COACHING_NATIVE_RECOVERY=1 to authorize a fresh local native-recovery flight.",
);
assert.equal(
  process.platform,
  "darwin",
  "The native-recovery flight requires macOS and Xcode.",
);

const repoRoot = process.cwd();
const baseURL = process.env.QUIPSLY_LOCAL_BASE_URL || "http://127.0.0.1:3012";
const parsedBaseURL = new URL(baseURL);
assert(
  ["127.0.0.1", "localhost", "[::1]"].includes(parsedBaseURL.hostname),
  "Fresh native recovery refuses a non-loopback Nest origin.",
);

function readGitReleaseIdentity() {
  const sourceSha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
  const trackedChanges = execFileSync(
    "git",
    ["status", "--porcelain", "--untracked-files=no"],
    { cwd: repoRoot, encoding: "utf8" },
  ).trim();
  assert.match(
    sourceSha,
    /^[a-f0-9]{40}$/,
    "Native recovery could not resolve an exact candidate commit.",
  );
  return {
    sourceSha,
    trackedWorktreeCleanAtStart: trackedChanges.length === 0,
  };
}

const releaseIdentity = readGitReleaseIdentity();

function parsePacket(output, label) {
  for (
    let cursor = output.indexOf("{");
    cursor >= 0;
    cursor = output.indexOf("{", cursor + 1)
  ) {
    try {
      const packet = JSON.parse(output.slice(cursor));
      if (packet?.ok === true) return packet;
    } catch {}
  }
  throw new Error(`${label} did not emit one machine-readable result.`);
}

async function runFreshStart() {
  const child = spawn(
    process.execPath,
    [
      "--experimental-strip-types",
      "--import",
      "./scripts/register-ts-extension-loader.mjs",
      "scripts/quipsly-fresh-coaching-start-operation.mjs",
    ],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        QUIPSLY_FRESH_COACHING_START_OPERATION: "1",
        QUIPSLY_LOCAL_BASE_URL: baseURL,
      },
      stdio: ["ignore", "pipe", "inherit"],
    },
  );
  let stdout = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  const status = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  assert.equal(
    status,
    0,
    `Fresh rendered start failed with exit ${String(status)}.`,
  );
  return parsePacket(stdout, "Fresh rendered start");
}

async function runInherited(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: repoRoot,
    env: options.env || process.env,
    stdio: "inherit",
  });
  return await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
}

async function readJSONCommand(command, args) {
  const child = spawn(command, args, {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "inherit"],
  });
  let stdout = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  const status = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  assert.equal(status, 0, `${command} failed with exit ${String(status)}.`);
  return JSON.parse(stdout);
}

async function grantClientRecordingConsent(context) {
  const password = readRetainedQAPassword({
    service: context.keychainService,
    account: context.identities.client.email,
  });
  assert(password, "Fresh client password was not found in macOS Keychain.");

  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const browserContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const page = await browserContext.newPage();
  try {
    await signInThroughRenderedLogin({
      page,
      baseURL,
      identity: context.identities.client,
      password,
      callbackPath: context.clientEntryPath,
    });
    const [response] = await Promise.all([
      page.waitForResponse(
        (candidate) =>
          candidate.request().method() === "POST" &&
          new URL(candidate.url()).pathname === "/api/mobile/capture/consent",
      ),
      page
        .getByRole("button", { name: /Agree and continue|Update choices/ })
        .click(),
    ]);
    const packet = await response.json().catch(() => null);
    assert(
      response.ok() && packet?.ok === true,
      "Fresh client consent receipt was rejected.",
    );
    assert.equal(
      packet?.session?.recordingConsentGranted,
      true,
      "Fresh client consent did not read back as recording-ready for that participant.",
    );
  } finally {
    await clearRenderedSession(
      page,
      baseURL,
      "fresh native-recovery client",
    ).catch(() => undefined);
    await browserContext.close();
    await browser.close();
  }
}

async function readCoachStudioHandoffProjection(context, password) {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const browserContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const page = await browserContext.newPage();
  try {
    await signInThroughRenderedLogin({
      page,
      baseURL,
      identity: context.identities.coach,
      password,
      callbackPath: "/coaching",
    });
    const response = await page.evaluate(async (roomId) => {
      const candidate = await fetch("/api/mobile/capture/sessions", {
        cache: "no-store",
      });
      return {
        status: candidate.status,
        packet: await candidate.json().catch(() => null),
        roomId,
      };
    }, context.roomId);
    assert.equal(response.status, 200, "Coach could not read the post-handoff Session projection.");
    assert.equal(response.packet?.ok, true, "Post-handoff Session projection was not successful.");
    const session = response.packet.sessions?.find((item) => item.id === context.roomId);
    assert(session, "Post-handoff projection omitted the exact fresh Session.");
    assert(
      typeof session.episodeProductionId === "string" && session.episodeProductionId.length > 0,
      "Studio handoff did not bind a real production destination to the Session.",
    );
    assert.equal(
      session.episodeSlug,
      context.roomId,
      "Coaching Studio destination did not retain the canonical Session identity.",
    );
    const requiredSources = (session.captureSources || []).filter(
      (source) => String(source.kind || "").toUpperCase() !== "SERVER_MIX",
    );
    assert(requiredSources.length > 0, "Studio handoff projection has no required retained source.");
    for (const source of requiredSources) {
      assert.equal(source.recordingStatus, "VERIFIED");
      assert.equal(source.exactBytesVerified, true);
      assert.equal(source.processingDisposition, "RELEASED");
      assert(
        typeof source.mediaAssetId === "string" && source.mediaAssetId.length > 0,
        `Verified source ${source.recordingAssetId} is missing its Studio media attachment.`,
      );
    }
    return {
      episodeProductionId: session.episodeProductionId,
      episodeSlug: session.episodeSlug,
      captureGroupId: session.captureGroupId,
      requiredSources: requiredSources.map((source) => ({
        recordingAssetId: source.recordingAssetId,
        mediaAssetId: source.mediaAssetId,
        recordingStatus: source.recordingStatus,
        exactBytesVerified: source.exactBytesVerified,
        processingDisposition: source.processingDisposition,
      })),
    };
  } finally {
    await clearRenderedSession(
      page,
      baseURL,
      "fresh native-recovery Studio verification",
    ).catch(() => undefined);
    await browserContext.close();
    await browser.close();
  }
}

process.stderr.write(
  "[fresh native recovery] creating a new coach, client, and Session through rendered product UI\n",
);
const start = await runFreshStart();
const context = await loadFreshCoachingAcceptanceContext({
  baseURL,
  env: { QUIPSLY_COACHING_ACCEPTANCE_CONTEXT: start.contextPath },
});
assert(
  context,
  "Fresh rendered start did not create a private continuation context.",
);
assert.equal(context.roomId, start.roomId);
assert.equal(context.sessionTitle, start.sessionTitle);

process.stderr.write(
  "[fresh native recovery] saving the invited client's ordinary recording consent\n",
);
await grantClientRecordingConsent(context);

const password = readRetainedQAPassword({
  service: context.keychainService,
  account: context.identities.coach.email,
});
assert(password, "Fresh coach password was not found in macOS Keychain.");

const artifactDirectory = path.dirname(context.contextPath);
const resultBundlePath = path.join(
  artifactDirectory,
  "native-capture-recovery.xcresult",
);
const receiptPath = path.join(
  artifactDirectory,
  "native-capture-recovery-receipt.json",
);
// DerivedData is a reusable compiler cache, not acceptance evidence. Keep one
// ignored cache across isolated runs while each run retains its own xcresult
// and receipt under artifacts/coaching-acceptance.
const derivedDataPath = path.join(
  repoRoot,
  ".tmp",
  "native-capture-recovery-derived-data",
);
const destination =
  process.env.QUIPSLY_CAPTURE_UI_TEST_DESTINATION ||
  "platform=iOS Simulator,name=iPhone 17 Pro";

process.stderr.write(
  `[fresh native recovery] operating isolated Session ${context.roomId}\n`,
);
const status = await runInherited(
  "bash",
  [
    "apps/mobile-capture/HighGroundCapture/scripts/run-capture-runtime-ui-smoke.sh",
  ],
  {
    env: {
      ...process.env,
      QUIPSLY_CAPTURE_UI_TEST_BASE_URL: baseURL,
      QUIPSLY_CAPTURE_UI_TEST_EMAIL: context.identities.coach.email,
      QUIPSLY_CAPTURE_UI_TEST_PASSWORD: password,
      QUIPSLY_CAPTURE_UI_TEST_SESSION_ID: context.roomId,
      QUIPSLY_CAPTURE_UI_TEST_SESSION_TITLE: context.sessionTitle,
      QUIPSLY_CAPTURE_UI_TEST_MODE: "capture-recovery",
      QUIPSLY_CAPTURE_UI_TEST_MICROPHONE_PERMISSION_MODE: "grant",
      QUIPSLY_CAPTURE_UI_TEST_SIMULATOR_APP_STATE_MODE: "fresh",
      QUIPSLY_CAPTURE_UI_TEST_DERIVED_DATA_PATH: derivedDataPath,
      QUIPSLY_CAPTURE_UI_TEST_DESTINATION: destination,
      QUIPSLY_CAPTURE_UI_TEST_RESULT_BUNDLE_PATH: resultBundlePath,
      QUIPSLY_CAPTURE_UI_TEST_TIMEOUT_SECONDS:
        process.env.QUIPSLY_CAPTURE_UI_TEST_TIMEOUT_SECONDS || "900",
    },
  },
);
assert.equal(
  status,
  0,
  `Native capture/recovery proof failed with exit ${String(status)}.`,
);

const summary = await readJSONCommand("xcrun", [
  "xcresulttool",
  "get",
  "test-results",
  "summary",
  "--path",
  resultBundlePath,
]);
assert.equal(summary.result, "Passed");
assert.equal(summary.passedTests, 1);
assert.equal(summary.failedTests, 0);
assert.equal(summary.skippedTests, 0);

const studioHandoff = await readCoachStudioHandoffProjection(context, password);

const receipt = {
  ok: true,
  localOnly: true,
  testLane: "fresh-native-recovery-automation",
  fixtureIdentifiersUsed: false,
  humanAcceptanceSatisfied: false,
  sourceSha: releaseIdentity.sourceSha,
  trackedWorktreeCleanAtStart: releaseIdentity.trackedWorktreeCleanAtStart,
  contextPath: context.contextPath,
  resultBundlePath,
  roomId: context.roomId,
  bookingId: context.bookingId,
  engagementId: context.engagementId,
  sessionTitle: context.sessionTitle,
  coachEmail: context.identities.coach.email,
  clientEmail: context.identities.client.email,
  xcode: {
    result: summary.result,
    passedTests: summary.passedTests,
    failedTests: summary.failedTests,
    skippedTests: summary.skippedTests,
    totalTestCount: summary.totalTestCount,
  },
  studioHandoff,
  operated: {
    publicRenderedFreshStart: true,
    clientConsentThroughRenderedUI: true,
    coachConsentThroughNativeUI: true,
    actualAVAudioRecorderTake: true,
    localPlayback: true,
    serverSizeAndSHA256Verification: true,
    processDeathDuringSecondTake: true,
    protectedOfflineRelaunch: true,
    finalizedSourceRecovered: true,
    finalizedSourcePlayableOffline: true,
    crashOpenReceiptPreserved: true,
    crashOpenBytesClaimedPlayable: false,
    reasonedAppendOnlySourceWaiver: true,
    resolvedReceiptNonBlocking: true,
    offlinePlaybackOfFinalizedSource: true,
    onlineReentry: true,
    durableStudioHandoff: true,
  },
  boundaries: {
    passwordsWrittenToArtifact: false,
    simulatorUsed: destination.includes("Simulator"),
    simulatorMicrophonePermissionPregrantedByHarness: true,
    simulatorAppContainerStartedFreshByHarness: true,
    firstRunMicrophonePermissionUXProven: false,
    physicalDeviceProven: false,
    naturalHumanSpeechProven: false,
    humanListeningProven: false,
    noviceHumanAcceptanceProven: false,
    productionScaleProven: false,
  },
};
await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, {
  mode: 0o600,
});
await chmod(receiptPath, 0o600);
console.log(JSON.stringify({ ...receipt, receiptPath }, null, 2));
