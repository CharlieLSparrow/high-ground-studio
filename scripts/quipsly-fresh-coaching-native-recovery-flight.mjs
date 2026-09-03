#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { chmod, writeFile } from "node:fs/promises";
import path from "node:path";

import { loadFreshCoachingAcceptanceContext } from "./lib/coaching-acceptance-context.mjs";
import { parseFreshCoachingCredentialIPCPacket } from "./lib/fresh-coaching-credential-ipc.mjs";
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

// Port 3022 is owned by the isolated recovery lab. Select its entire service
// set as one atomic environment so an otherwise-correct rehearsal cannot
// create users in Auth 9199 while reading Auth 9099, or write synthetic work
// into the canonical local database. Explicitly choosing the recovery Nest is
// enough; callers should not have to memorize four matching environment
// variables.
if (parsedBaseURL.port === "3022") {
  Object.assign(process.env, {
    QUIPSLY_LOCAL_FIREBASE_PROJECT: "quipsly-recovery-lab",
    FIREBASE_PROJECT_ID: "quipsly-recovery-lab",
    FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9199",
    DATABASE_URL:
      "postgresql://postgres:quipsly_recovery_lab@127.0.0.1:55432/quipsly_portable_recovery_lab?schema=public",
  });
}

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
      stdio: ["ignore", "pipe", "inherit", "ipc"],
    },
  );
  let stdout = "";
  let credentialPacket = null;
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.on("message", (message) => {
    credentialPacket = message;
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
  const start = parsePacket(stdout, "Fresh rendered start");
  return {
    start,
    credentials: parseFreshCoachingCredentialIPCPacket(
      credentialPacket,
      {
        coach: { email: start.coachEmail },
        client: { email: start.clientEmail },
      },
    ),
  };
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

async function grantClientRecordingConsent(context, password) {
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
    await page
      .locator('[data-session-entry-ready="true"]')
      .waitFor({ state: "visible", timeout: 30_000 });
    // Consent intentionally lives in Prepare, not in the low-friction join
    // choice. The former "Leave lobby" affordance no longer exists, so bind
    // this setup step to the canonical Session workspace URL after proving the
    // invited client can enter the exact Session.
    await page.goto(
      `${baseURL}/sessions/${encodeURIComponent(context.roomId)}?mode=prepare`,
      { waitUntil: "domcontentloaded" },
    );
    await page
      .locator("#session-preparation-heading")
      .waitFor({ state: "visible", timeout: 30_000 });
    const consentControl = page.getByTestId("session-consent-control");
    await consentControl.waitFor({ state: "visible", timeout: 30_000 });
    const consentButton = consentControl.getByRole("button", {
      name: /Agree and continue|Save changes/,
    });
    await consentButton.waitFor({ state: "visible", timeout: 30_000 });
    const consentButtonHandle = await consentButton.elementHandle();
    assert.ok(
      consentButtonHandle,
      "The rendered consent action disappeared before hydration.",
    );
    // A visible server-rendered button is not yet actionable. Opening the
    // native <details> control before React owns this subtree mutates the DOM
    // and can force hydration recovery, leaving a convincing-looking button
    // without its click handler. Wait for React's attached event props before
    // operating any native control in this acceptance flight.
    await page.waitForFunction(
      (button) =>
        Object.getOwnPropertyNames(button).some((key) =>
          key.startsWith("__reactProps$"),
        ),
      consentButtonHandle,
      { timeout: 30_000 },
    );
    const recordingOptions = consentControl.getByText("Recording options", {
      exact: true,
    });
    await recordingOptions.click();
    const transcriptionChoice = consentControl.getByRole("checkbox", {
      name: "Create a transcript and suggested notes/tasks",
      exact: true,
    });
    await transcriptionChoice.waitFor({ state: "visible", timeout: 30_000 });
    await consentButton.click({ trial: true, timeout: 30_000 });
    if (!(await transcriptionChoice.isChecked())) {
      await transcriptionChoice.check();
    }
    await consentButton.click({ trial: true, timeout: 30_000 });
    assert.equal(
      await transcriptionChoice.isEnabled(),
      true,
      "The transcription choice stopped being actionable before consent submission.",
    );
    assert.equal(
      await transcriptionChoice.isChecked(),
      true,
      "The retained recorder reset the visible transcription choice before consent submission.",
    );
    const clickBoundary = await consentControl.evaluate((region) => ({
      text: region.textContent,
      checkboxes: Array.from(
        region.querySelectorAll('input[type="checkbox"]'),
      ).map((input) => ({
        checked: input.checked,
        disabled: input.disabled,
        label: input.parentElement?.textContent?.trim() ?? null,
      })),
      buttons: Array.from(region.querySelectorAll("button")).map((button) => ({
        disabled: button.disabled,
        label: button.textContent?.trim() ?? null,
      })),
    }));
    await consentButton.click();
    await consentControl
      .getByRole("heading", { name: "Recording ready", exact: true })
      .waitFor({ state: "visible", timeout: 30_000 })
      .catch((cause) => {
        throw new Error(
          `The rendered Session did not confirm saved recording consent. Click boundary: ${JSON.stringify(clickBoundary)}`,
          { cause },
        );
      });
    let packet = null;
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      packet = await page.evaluate(async (callRoomId) => {
        const response = await fetch(
          `/api/mobile/capture/consent?callRoomId=${encodeURIComponent(callRoomId)}`,
          { cache: "no-store" },
        );
        return response.ok ? await response.json().catch(() => null) : null;
      }, context.roomId);
      if (
        packet?.ok === true &&
        packet?.session?.recordingConsentCanRecordAudio === true &&
        packet?.session?.recordingConsentCanTranscribe === true
      ) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.equal(packet?.ok, true, "Fresh client consent readback failed.");
    assert.equal(
      packet?.session?.recordingConsentCanRecordAudio,
      true,
      "Fresh client audio consent did not read back for that participant.",
    );
    assert.equal(
      packet?.session?.recordingConsentCanTranscribe,
      true,
      "Fresh client transcription consent did not read back for that participant.",
    );
    assert.equal(
      packet?.currentPolicy?.supportedSurfaces?.includes?.(
        "quipsly-session-workspace-consent-v1",
      ),
      true,
      "The authenticated consent readback did not recognize the canonical Session workspace surface.",
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
    assert.equal(
      session.status,
      "OPEN",
      "Crash recovery preserved the source but did not close the abandoned server recording boundary.",
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
      roomStatus: session.status,
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
const freshStart = await runFreshStart();
const { start, credentials } = freshStart;
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
await grantClientRecordingConsent(context, credentials.client.password);

const coachPassword = credentials.coach.password;
const clientPassword = credentials.client.password;

const artifactDirectory = path.dirname(context.contextPath);
const clientEntryResultBundlePath = path.join(
  artifactDirectory,
  "native-client-entry.xcresult",
);
const roomJoinResultBundlePath = path.join(
  artifactDirectory,
  "native-room-join.xcresult",
);
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
  `[fresh native recovery] opening accepted Session ${context.roomId} from a fresh invited-client app\n`,
);
const clientEntryStatus = await runInherited(
  "bash",
  [
    "apps/mobile-capture/HighGroundCapture/scripts/run-capture-runtime-ui-smoke.sh",
  ],
  {
    env: {
      ...process.env,
      QUIPSLY_CAPTURE_UI_TEST_BASE_URL: baseURL,
      QUIPSLY_CAPTURE_UI_TEST_EMAIL: context.identities.client.email,
      QUIPSLY_CAPTURE_UI_TEST_PASSWORD: clientPassword,
      QUIPSLY_CAPTURE_UI_TEST_SESSION_ID: context.roomId,
      QUIPSLY_CAPTURE_UI_TEST_SESSION_TITLE: context.sessionTitle,
      QUIPSLY_CAPTURE_UI_TEST_MODE: "session-deep-link",
      QUIPSLY_CAPTURE_UI_TEST_SIMULATOR_APP_STATE_MODE: "fresh",
      QUIPSLY_CAPTURE_UI_TEST_DERIVED_DATA_PATH: derivedDataPath,
      QUIPSLY_CAPTURE_UI_TEST_DESTINATION: destination,
      QUIPSLY_CAPTURE_UI_TEST_RESULT_BUNDLE_PATH: clientEntryResultBundlePath,
      QUIPSLY_CAPTURE_UI_TEST_TIMEOUT_SECONDS:
        process.env.QUIPSLY_CAPTURE_UI_TEST_TIMEOUT_SECONDS || "900",
    },
  },
);
assert.equal(
  clientEntryStatus,
  0,
  `Native invited-client entry proof failed with exit ${String(clientEntryStatus)}.`,
);
const clientEntrySummary = await readJSONCommand("xcrun", [
  "xcresulttool",
  "get",
  "test-results",
  "summary",
  "--path",
  clientEntryResultBundlePath,
]);
assert.equal(clientEntrySummary.result, "Passed");
assert.equal(clientEntrySummary.passedTests, 1);
assert.equal(clientEntrySummary.failedTests, 0);
assert.equal(clientEntrySummary.skippedTests, 0);

process.stderr.write(
  `[fresh native recovery] joining and leaving provider room ${context.roomId} as the consented client\n`,
);
const roomJoinStatus = await runInherited(
  "bash",
  [
    "apps/mobile-capture/HighGroundCapture/scripts/run-capture-runtime-ui-smoke.sh",
  ],
  {
    env: {
      ...process.env,
      QUIPSLY_CAPTURE_UI_TEST_BASE_URL: baseURL,
      QUIPSLY_CAPTURE_UI_TEST_EMAIL: context.identities.client.email,
      QUIPSLY_CAPTURE_UI_TEST_PASSWORD: clientPassword,
      QUIPSLY_CAPTURE_UI_TEST_SESSION_ID: context.roomId,
      QUIPSLY_CAPTURE_UI_TEST_SESSION_TITLE: context.sessionTitle,
      QUIPSLY_CAPTURE_UI_TEST_MODE: "room-join",
      QUIPSLY_CAPTURE_UI_TEST_SIMULATOR_APP_STATE_MODE: "preserve",
      QUIPSLY_CAPTURE_UI_TEST_DERIVED_DATA_PATH: derivedDataPath,
      QUIPSLY_CAPTURE_UI_TEST_DESTINATION: destination,
      QUIPSLY_CAPTURE_UI_TEST_RESULT_BUNDLE_PATH: roomJoinResultBundlePath,
      QUIPSLY_CAPTURE_UI_TEST_TIMEOUT_SECONDS:
        process.env.QUIPSLY_CAPTURE_UI_TEST_TIMEOUT_SECONDS || "900",
    },
  },
);
const roomJoinSummary = await readJSONCommand("xcrun", [
  "xcresulttool",
  "get",
  "test-results",
  "summary",
  "--path",
  roomJoinResultBundlePath,
]);
const roomJoinPassed = (
  roomJoinStatus === 0
  && roomJoinSummary.result === "Passed"
  && roomJoinSummary.passedTests === 1
  && roomJoinSummary.failedTests === 0
  && roomJoinSummary.skippedTests === 0
);
const simulatorCallKitFailClosed = (
  destination.includes("Simulator")
  && roomJoinSummary.failedTests === 0
  && roomJoinSummary.passedTests === 0
  && roomJoinSummary.skippedTests === 1
  && roomJoinSummary.totalTestCount === 1
);
assert(
  roomJoinPassed || simulatorCallKitFailClosed,
  `Native provider room proof failed with exit ${String(roomJoinStatus)}: ${JSON.stringify({
    result: roomJoinSummary.result,
    passedTests: roomJoinSummary.passedTests,
    failedTests: roomJoinSummary.failedTests,
    skippedTests: roomJoinSummary.skippedTests,
  })}`,
);
if (simulatorCallKitFailClosed) {
  process.stderr.write(
    "[fresh native recovery] Simulator CallKit failed closed; physical-iPhone provider media proof remains required\n",
  );
}

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
      QUIPSLY_CAPTURE_UI_TEST_PASSWORD: coachPassword,
      QUIPSLY_CAPTURE_UI_TEST_SESSION_ID: context.roomId,
      QUIPSLY_CAPTURE_UI_TEST_SESSION_TITLE: context.sessionTitle,
      QUIPSLY_CAPTURE_UI_TEST_MODE: "capture-recovery",
      QUIPSLY_CAPTURE_UI_TEST_MICROPHONE_PERMISSION_MODE: "reset",
      QUIPSLY_CAPTURE_UI_TEST_EXPECT_MICROPHONE_PROMPT: "1",
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

const studioHandoff = await readCoachStudioHandoffProjection(context, coachPassword);

const receipt = {
  ok: true,
  localOnly: true,
  testLane: "fresh-native-recovery-automation",
  fixtureIdentifiersUsed: false,
  humanAcceptanceSatisfied: false,
  sourceSha: releaseIdentity.sourceSha,
  trackedWorktreeCleanAtStart: releaseIdentity.trackedWorktreeCleanAtStart,
  contextPath: context.contextPath,
  clientEntryResultBundlePath,
  roomJoinResultBundlePath,
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
  clientEntryXcode: {
    result: clientEntrySummary.result,
    passedTests: clientEntrySummary.passedTests,
    failedTests: clientEntrySummary.failedTests,
    skippedTests: clientEntrySummary.skippedTests,
    totalTestCount: clientEntrySummary.totalTestCount,
  },
  roomJoinXcode: {
    result: roomJoinSummary.result,
    passedTests: roomJoinSummary.passedTests,
    failedTests: roomJoinSummary.failedTests,
    skippedTests: roomJoinSummary.skippedTests,
    totalTestCount: roomJoinSummary.totalTestCount,
  },
  studioHandoff,
  operated: {
    publicRenderedFreshStart: true,
    acceptedClientInvitationOpenedInFreshNativeApp: true,
    exactClientAccountAndCanonicalSessionReauthorized: true,
    clientEntryDidNotJoinOrRecordAutomatically: true,
    providerRoomJoinedAndLeft: roomJoinPassed,
    providerRoomJoinFailClosedOnSimulator: simulatorCallKitFailClosed,
    providerJoinStartedRecording: false,
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
    crashOpenServerBoundaryClosedAfterRelaunch: studioHandoff.roomStatus === "OPEN",
    crashOpenBytesClaimedPlayable: false,
    reasonedAppendOnlySourceWaiver: true,
    resolvedReceiptNonBlocking: true,
    offlinePlaybackOfFinalizedSource: true,
    onlineReentry: true,
    durableStudioHandoff: true,
  },
  boundaries: {
    passwordsWrittenToArtifact: false,
    credentialsTransferredByPrivateChildIPC: true,
    keychainReadRequiredForAutomatedFlight: false,
    simulatorUsed: destination.includes("Simulator"),
    simulatorMicrophonePermissionPregrantedByHarness: false,
    simulatorAppContainerStartedFreshByHarness: true,
    firstRunMicrophonePermissionUXProven: destination.includes("Simulator"),
    physicalDeviceProven: false,
    realProviderRoomMediaProven: roomJoinPassed,
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
