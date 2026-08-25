#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { loadFreshCoachingAcceptanceContext } from "./lib/coaching-acceptance-context.mjs";
import { readRetainedQAPassword } from "./lib/retained-qa-keychain.mjs";
import {
  clearRenderedSession,
  loadPlaywright,
  requireLoopbackOrigin,
  signInThroughRenderedLogin,
} from "./lib/retained-qa-browser.mjs";

assert.equal(
  process.env.QUIPSLY_FRESH_SESSION_NATIVE_CONVERSATION_OPERATION,
  "1",
  "Set QUIPSLY_FRESH_SESSION_NATIVE_CONVERSATION_OPERATION=1 to operate the native Session conversation flight.",
);
assert.equal(process.platform, "darwin", "Native Session conversation qualification requires macOS and Xcode.");

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const baseURL = requireLoopbackOrigin(
  process.env.QUIPSLY_LOCAL_BASE_URL || "http://127.0.0.1:3012",
  "Fresh native Session conversation base URL",
);
const target = await loadFreshCoachingAcceptanceContext({ baseURL });
assert(target, "Fresh native Session conversation requires an exact private coaching context.");
const runToken = path.basename(path.dirname(target.contextPath));
const sourceSha = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: repositoryRoot,
  encoding: "utf8",
}).trim();
const trackedStatus = execFileSync("git", ["status", "--short", "--untracked-files=no"], {
  cwd: repositoryRoot,
  encoding: "utf8",
}).trim();
assert.equal(trackedStatus, "", "Fresh native Session conversation requires a clean tracked worktree.");

const databaseURL = new URL(
  process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio",
);
assert(
  ["postgres:", "postgresql:"].includes(databaseURL.protocol)
    && ["127.0.0.1", "localhost", "[::1]"].includes(databaseURL.hostname),
  "Fresh native Session conversation refuses non-loopback PostgreSQL.",
);
process.env.DATABASE_URL = databaseURL.toString();
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "127.0.0.1:9099";

const coachPassword = readRetainedQAPassword({
  service: target.keychainService,
  account: target.identities.coach.email,
});
const clientPassword = readRetainedQAPassword({
  service: target.keychainService,
  account: target.identities.client.email,
});
assert(coachPassword, "Fresh coach Keychain password is unavailable.");
assert(clientPassword, "Fresh client Keychain password is unavailable.");

const nonce = `${runToken}-${Date.now().toString(36)}`;
const browserBody = `Browser message ${nonce} for native readback.`;
const nativeBody = `iPhone reply ${nonce} read back in browser.`;
const conversationPath = `/sessions/${encodeURIComponent(target.roomId)}?mode=conversation`;
const artifactDirectory = path.dirname(target.contextPath);
const resultBundlePath = path.join(artifactDirectory, "native-session-conversation.xcresult");
const receiptPath = path.join(artifactDirectory, "native-session-conversation-receipt.json");
const derivedDataPath = path.join(repositoryRoot, ".tmp", "native-session-conversation-derived-data");
const destination = process.env.QUIPSLY_CAPTURE_UI_TEST_DESTINATION
  || "platform=iOS Simulator,name=iPhone 17 Pro";

async function runInherited(command, args, env) {
  const child = spawn(command, args, {
    cwd: repositoryRoot,
    env,
    stdio: "inherit",
  });
  return await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
}

function readResultSummary() {
  return JSON.parse(execFileSync(
    "xcrun",
    ["xcresulttool", "get", "test-results", "summary", "--path", resultBundlePath],
    { cwd: repositoryRoot, encoding: "utf8" },
  ));
}

const { getPrismaClient } = await import("../apps/quipsly/src/lib/prisma.ts");
const prisma = getPrismaClient();
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: true });
const browserContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  reducedMotion: "reduce",
});
const coachPage = await browserContext.newPage();

try {
  await signInThroughRenderedLogin({
    page: coachPage,
    baseURL,
    identity: target.identities.coach,
    password: coachPassword,
    callbackPath: conversationPath,
  });
  await coachPage.getByRole("heading", { name: "Session conversation", exact: true })
    .waitFor({ timeout: 30_000 });
  const composer = coachPage.getByRole("textbox", { name: "Message everyone in this Session" });
  await composer.fill(browserBody);
  await coachPage.getByRole("button", { name: "Send message", exact: true }).click();
  await coachPage.getByText(browserBody, { exact: true }).waitFor({ timeout: 20_000 });

  const nativeStatus = await runInherited(
    "bash",
    ["apps/mobile-capture/HighGroundCapture/scripts/run-capture-runtime-ui-smoke.sh"],
    {
      ...process.env,
      QUIPSLY_CAPTURE_UI_TEST_BASE_URL: baseURL,
      QUIPSLY_CAPTURE_UI_TEST_EMAIL: target.identities.client.email,
      QUIPSLY_CAPTURE_UI_TEST_PASSWORD: clientPassword,
      QUIPSLY_CAPTURE_UI_TEST_SESSION_ID: target.roomId,
      QUIPSLY_CAPTURE_UI_TEST_SESSION_TITLE: target.sessionTitle,
      QUIPSLY_CAPTURE_UI_TEST_SESSION_CONVERSATION_EXPECTED_BODY: browserBody,
      QUIPSLY_CAPTURE_UI_TEST_SESSION_CONVERSATION_REPLY_BODY: nativeBody,
      QUIPSLY_CAPTURE_UI_TEST_MODE: "session-conversation",
      QUIPSLY_CAPTURE_UI_TEST_SIMULATOR_APP_STATE_MODE: "fresh",
      QUIPSLY_CAPTURE_UI_TEST_DERIVED_DATA_PATH: derivedDataPath,
      QUIPSLY_CAPTURE_UI_TEST_DESTINATION: destination,
      QUIPSLY_CAPTURE_UI_TEST_RESULT_BUNDLE_PATH: resultBundlePath,
      QUIPSLY_CAPTURE_UI_TEST_TIMEOUT_SECONDS:
        process.env.QUIPSLY_CAPTURE_UI_TEST_TIMEOUT_SECONDS || "900",
    },
  );
  assert.equal(nativeStatus, 0, `Native Session conversation proof failed with exit ${String(nativeStatus)}.`);
  const xcode = readResultSummary();
  assert.equal(xcode.result, "Passed");
  assert.equal(xcode.passedTests, 1);
  assert.equal(xcode.failedTests, 0);
  assert.equal(xcode.skippedTests, 0);

  await coachPage.getByRole("button", { name: "Refresh conversation", exact: true }).click();
  await coachPage.getByText(nativeBody, { exact: true }).waitFor({ timeout: 20_000 });

  const [browserMessage, nativeMessage] = await Promise.all([
    prisma.sessionConversationMessage.findFirst({
      where: {
        roomId: target.roomId,
        body: browserBody,
        authorUserId: target.identities.coach.userId,
      },
      select: { id: true, revision: true, deletedAt: true },
    }),
    prisma.sessionConversationMessage.findFirst({
      where: {
        roomId: target.roomId,
        body: nativeBody,
        authorUserId: target.identities.client.userId,
      },
      select: { id: true, revision: true, deletedAt: true },
    }),
  ]);
  assert(browserMessage?.id && browserMessage.revision === 1 && !browserMessage.deletedAt);
  assert(nativeMessage?.id && nativeMessage.revision === 1 && !nativeMessage.deletedAt);

  await mkdir(artifactDirectory, { recursive: true });
  const receipt = {
    schema: "quipsly-fresh-session-native-conversation-operation-v1",
    recordedAt: new Date().toISOString(),
    ok: true,
    localOnly: true,
    sourceSha,
    trackedWorktreeCleanAtStart: true,
    roomId: target.roomId,
    coachUserId: target.identities.coach.userId,
    clientUserId: target.identities.client.userId,
    renderedBrowserAuthoredMessage: true,
    renderedNativeReadback: true,
    renderedNativeAuthoredMessage: true,
    renderedBrowserReadback: true,
    canonicalDistinctActorPersistence: true,
    nativeConversationDidNotJoinProviderMedia: true,
    nativeConversationDidNotStartRecording: true,
    xcode: {
      result: xcode.result,
      passedTests: xcode.passedTests,
      failedTests: xcode.failedTests,
      skippedTests: xcode.skippedTests,
      totalTestCount: xcode.totalTestCount,
    },
    resultBundlePath,
    externalSideEffects: false,
    humanAcceptanceSatisfied: false,
    physicalDeviceProven: false,
    secretsPrinted: false,
    receiptPath,
  };
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  await chmod(receiptPath, 0o600);
  console.log(JSON.stringify(receipt, null, 2));
} finally {
  await clearRenderedSession(coachPage, baseURL, "fresh native conversation coach")
    .catch(() => undefined);
  await browserContext.close();
  await browser.close();
  await prisma.$disconnect();
}
