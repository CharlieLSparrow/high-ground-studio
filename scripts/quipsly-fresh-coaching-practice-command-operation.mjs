#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { loadFreshCoachingAcceptanceContext } from "./lib/coaching-acceptance-context.mjs";
import { readRetainedQAPassword } from "./lib/retained-qa-keychain.mjs";
import {
  assertNoHorizontalOverflow,
  clearRenderedSession,
  loadPlaywright,
  requireLoopbackOrigin,
  signInThroughRenderedLogin,
} from "./lib/retained-qa-browser.mjs";

assert.equal(
  process.env.QUIPSLY_FRESH_COACHING_PRACTICE_COMMAND_OPERATION,
  "1",
  "Set QUIPSLY_FRESH_COACHING_PRACTICE_COMMAND_OPERATION=1 to operate the fresh coaching practice command.",
);

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const trackedStatus = execFileSync(
  "git",
  ["status", "--short", "--untracked-files=no"],
  { cwd: repositoryRoot, encoding: "utf8" },
).trim();
assert.equal(
  trackedStatus,
  "",
  "Fresh coaching practice command requires a clean tracked worktree.",
);
const sourceSha = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: repositoryRoot,
  encoding: "utf8",
}).trim();
const baseURL = requireLoopbackOrigin(
  process.env.QUIPSLY_LOCAL_BASE_URL || "http://127.0.0.1:3012",
  "Fresh coaching practice command base URL",
);
const target = await loadFreshCoachingAcceptanceContext({ baseURL });
assert(target, "Fresh coaching practice command requires an exact coaching context.");
const neighborPath = process.env.QUIPSLY_COACHING_ACCEPTANCE_NEIGHBOR_CONTEXT;
assert(neighborPath, "Fresh coaching practice command requires a neighboring control context.");
const neighbor = await loadFreshCoachingAcceptanceContext({
  baseURL,
  env: {
    ...process.env,
    QUIPSLY_COACHING_ACCEPTANCE_CONTEXT: neighborPath,
  },
});
assert(neighbor, "The neighboring coaching context is unavailable.");
assert.notEqual(neighbor.roomId, target.roomId);

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: true });
const contexts = {
  coach: await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  }),
  client: await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  }),
  neighbor: await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion: "reduce",
  }),
};
const pages = {
  coach: await contexts.coach.newPage(),
  client: await contexts.client.newPage(),
  neighbor: await contexts.neighbor.newPage(),
};

function passwordFor(context, identity) {
  const password = readRetainedQAPassword({
    service: context.keychainService,
    account: identity.email,
  });
  assert(password, `${identity.role} Keychain password is unavailable.`);
  return password;
}

async function signIn(page, context, identity, callbackPath = "/coaching") {
  await signInThroughRenderedLogin({
    page,
    baseURL,
    identity,
    password: passwordFor(context, identity),
    callbackPath,
  });
}

async function readCommand(page) {
  return page.evaluate(async () => {
    const response = await fetch("/api/coaching/runway", { cache: "no-store" });
    return { status: response.status, payload: await response.json() };
  });
}

try {
  await signIn(pages.coach, target, target.identities.coach);
  const commandSurface = pages.coach.getByTestId("coaching-practice-command");
  await commandSurface.waitFor({ timeout: 30_000 });
  await commandSurface
    .getByText("Your practice today", { exact: true })
    .waitFor({ timeout: 20_000 });
  await assertNoHorizontalOverflow(
    commandSurface,
    "coach practice command at phone width",
  );
  const coachReadback = await readCommand(pages.coach);
  assert.equal(coachReadback.status, 200);
  assert.equal(coachReadback.payload?.user?.isCoach, true);
  assert.equal(
    coachReadback.payload?.practiceCommand?.schema,
    "quipsly-coaching-practice-command-v1",
  );
  assert.equal(coachReadback.payload?.practiceCommand?.deterministic, true);
  assert.equal(coachReadback.payload?.practiceCommand?.externalSideEffects, false);
  const targetItem = coachReadback.payload.practiceCommand.items.find(
    (item) => item.roomId === target.roomId || item.bookingId === target.bookingId,
  );
  assert(targetItem, "The exact coach command omitted the fresh Session.");
  assert.equal(
    coachReadback.payload.practiceCommand.items.some(
      (item) => item.roomId === neighbor.roomId || item.bookingId === neighbor.bookingId,
    ),
    false,
    "The exact coach command included the neighboring practice.",
  );

  const targetAction = commandSurface.locator(`a[href="${targetItem.href}"]`);
  await targetAction.waitFor({ timeout: 20_000 });
  await targetAction.click();
  await pages.coach.waitForURL(
    (url) => url.pathname === `/sessions/${target.roomId}`,
    { timeout: 30_000 },
  );
  await pages.coach.goBack({ waitUntil: "domcontentloaded" });
  await commandSurface.waitFor({ timeout: 30_000 });

  await signIn(pages.client, target, target.identities.client);
  const clientReadback = await readCommand(pages.client);
  assert.equal(clientReadback.status, 200);
  assert.equal(clientReadback.payload?.practiceCommand, null);
  assert.equal(
    await pages.client.getByTestId("coaching-practice-command").count(),
    0,
    "A client received the coach practice command surface.",
  );

  await signIn(pages.neighbor, neighbor, neighbor.identities.coach);
  const neighborReadback = await readCommand(pages.neighbor);
  assert.equal(neighborReadback.status, 200);
  assert.equal(neighborReadback.payload?.user?.isCoach, true);
  assert.equal(
    neighborReadback.payload?.practiceCommand?.items?.some(
      (item) => item.roomId === target.roomId || item.bookingId === target.bookingId,
    ),
    false,
    "The neighboring coach command exposed the target practice.",
  );
  assert(
    neighborReadback.payload?.practiceCommand?.items?.some(
      (item) => item.roomId === neighbor.roomId || item.bookingId === neighbor.bookingId,
    ),
    "The neighboring coach command did not preserve its own exact Session.",
  );

  const runToken = path.basename(path.dirname(target.contextPath));
  const receiptPath = path.join(
    repositoryRoot,
    "artifacts",
    "coaching-acceptance",
    runToken,
    "practice-command-receipt.json",
  );
  await mkdir(path.dirname(receiptPath), { recursive: true });
  const receipt = {
    schema: "quipsly-fresh-coaching-practice-command-operation-v1",
    recordedAt: new Date().toISOString(),
    ok: true,
    localOnly: true,
    sourceSha,
    trackedWorktreeCleanAtStart: true,
    testLane: target.testLane,
    fixtureIdentifiersUsed: target.fixtureIdentifiersUsed,
    humanAcceptanceSatisfied: false,
    roomId: target.roomId,
    bookingId: target.bookingId,
    engagementId: target.engagementId,
    renderedPhoneWidthCommand: true,
    renderedNextActionOpenedExactSession: true,
    exactCoachProjectionOperated: true,
    clientCoachCommandAbsent: true,
    neighboringPracticeAbsent: true,
    neighboringCoachOwnPracticePreserved: true,
    deterministicProjection: true,
    externalSideEffects: false,
    secretsPrinted: false,
    receiptPath,
  };
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, {
    mode: 0o600,
  });
  await chmod(receiptPath, 0o600);
  console.log(JSON.stringify(receipt, null, 2));
} finally {
  await Promise.all([
    clearRenderedSession(pages.coach, baseURL, "fresh coach").catch(() => undefined),
    clearRenderedSession(pages.client, baseURL, "fresh client").catch(() => undefined),
    clearRenderedSession(pages.neighbor, baseURL, "neighbor coach").catch(() => undefined),
  ]);
  await Promise.all(Object.values(contexts).map((context) => context.close()));
  await browser.close();
}
