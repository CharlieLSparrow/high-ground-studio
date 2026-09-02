#!/usr/bin/env node

import assert from "node:assert/strict";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { loadFreshCoachingAcceptanceContext } from "./lib/coaching-acceptance-context.mjs";
import { requireCurrentLocalNestSource } from "./lib/local-nest-source-boundary.mjs";
import { readRetainedQAPassword } from "./lib/retained-qa-keychain.mjs";
import {
  assertNoHorizontalOverflow,
  clearRenderedSession,
  loadPlaywright,
  requireLoopbackOrigin,
  signInThroughRenderedLogin,
} from "./lib/retained-qa-browser.mjs";

assert.equal(
  process.env.QUIPSLY_FRESH_SESSION_PREPARATION_OPERATION,
  "1",
  "Set QUIPSLY_FRESH_SESSION_PREPARATION_OPERATION=1 to operate fresh Session planning.",
);

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const baseURL = requireLoopbackOrigin(
  process.env.QUIPSLY_LOCAL_BASE_URL || "http://127.0.0.1:3012",
  "Fresh Session preparation base URL",
);
const { sourceSha } = await requireCurrentLocalNestSource({ repositoryRoot, baseURL });
const target = await loadFreshCoachingAcceptanceContext({ baseURL });
assert(target, "Fresh Session preparation requires an exact coaching context.");
const neighborPath = process.env.QUIPSLY_COACHING_ACCEPTANCE_NEIGHBOR_CONTEXT;
assert(neighborPath, "Fresh Session preparation requires a neighboring control context.");
const neighbor = await loadFreshCoachingAcceptanceContext({
  baseURL,
  env: {
    ...process.env,
    QUIPSLY_COACHING_ACCEPTANCE_CONTEXT: neighborPath,
  },
});
assert(neighbor, "The neighboring control context is unavailable.");
assert.notEqual(neighbor.roomId, target.roomId);

const databaseURL = new URL(
  process.env.DATABASE_URL
    || "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio",
);
assert(
  ["postgres:", "postgresql:"].includes(databaseURL.protocol)
    && ["127.0.0.1", "localhost", "[::1]"].includes(databaseURL.hostname),
  "Fresh Session preparation refuses non-loopback PostgreSQL.",
);
process.env.DATABASE_URL = databaseURL.toString();
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "127.0.0.1:9099";

const { getPrismaClient } = await import("../apps/quipsly/src/lib/prisma.ts");
const prisma = getPrismaClient();
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: true });
const contexts = {
  client: await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  }),
  coach: await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion: "reduce",
  }),
  neighbor: await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  }),
};
const pages = {
  client: await contexts.client.newPage(),
  coach: await contexts.coach.newPage(),
  neighbor: await contexts.neighbor.newPage(),
};
const sessionPath = `/sessions/${encodeURIComponent(target.roomId)}`;
const focus = "Choose the certification coaching practice I should complete next.";
const desiredOutcome = "Leave with one clear practice plan.";
const successMeasure = "I can explain the next action and when I will do it.";
const update = "I completed the reflection exercise and found one recurring obstacle.";
const privateNote = "Invite the client to define their own evidence of progress.";
const retryFocus = "Use the final ten minutes to confirm one owned next action.";

function passwordFor(context, identity) {
  const password = readRetainedQAPassword({
    service: context.keychainService,
    account: identity.email,
  });
  assert(password, `${identity.role} Keychain password is unavailable.`);
  return password;
}

async function signIn(page, context, identity, callbackPath = sessionPath) {
  await signInThroughRenderedLogin({
    page,
    baseURL,
    identity,
    password: passwordFor(context, identity),
    callbackPath,
  });
}

async function openSessionPlan(page) {
  const prepare = page.getByRole("link", { name: "Prepare", exact: true });
  await prepare.waitFor({ timeout: 30_000 });
  await prepare.click();
  await page.waitForURL(
    (url) =>
      url.pathname === sessionPath && url.searchParams.get("mode") === "prepare",
    { timeout: 30_000 },
  );
  const optionalPlan = page.getByText("Plan this session", { exact: true });
  await optionalPlan.waitFor({ timeout: 30_000 });
  await optionalPlan.click();
  await page
    .getByRole("heading", {
      name: "What would make this session useful?",
      exact: true,
    })
    .waitFor({ timeout: 30_000 });
}

async function snapshotSideEffects() {
  const [messages, tasks, goals, notes] = await Promise.all([
    prisma.sessionConversationMessage.count({ where: { roomId: target.roomId } }),
    prisma.actionItem.count({ where: { roomId: target.roomId } }),
    prisma.goal.count({ where: { roomId: target.roomId } }),
    prisma.coachingNote.count({ where: { roomId: target.roomId } }),
  ]);
  return { messages, tasks, goals, notes };
}

const before = await snapshotSideEffects();

try {
  await signIn(pages.client, target, target.identities.client);
  await openSessionPlan(pages.client);
  await assertNoHorizontalOverflow(
    pages.client.locator("main").last(),
    "client Session plan at phone width",
  );
  await pages.client
    .getByLabel("What would make this Session useful?")
    .fill(focus);
  await pages.client
    .getByLabel("What would you like to leave with?")
    .fill(desiredOutcome);
  await pages.client
    .getByLabel("How will you know the Session helped?")
    .fill(successMeasure);
  await pages.client
    .getByLabel("What has changed since last time?")
    .fill(update);
  await pages.client.getByLabel("Progress (optional)").selectOption("7");
  await pages.client
    .getByRole("button", { name: "Save Session plan", exact: true })
    .click();
  await pages.client
    .getByText("Your Session plan is saved. You can change it anytime.", {
      exact: true,
    })
    .waitFor({ timeout: 20_000 });
  assert.equal(
    await pages.client.getByText("Private coach prep", { exact: true }).count(),
    0,
    "Client UI exposed the coach-private lane.",
  );

  await signIn(pages.coach, target, target.identities.coach);
  await openSessionPlan(pages.coach);
  await pages.coach.getByText(focus, { exact: true }).waitFor({ timeout: 20_000 });
  await pages.coach.getByText(desiredOutcome, { exact: true }).waitFor();
  const privatePrep = pages.coach.getByLabel("Private coach prep");
  await privatePrep.fill(privateNote);
  assert.equal(
    await privatePrep.inputValue(),
    privateNote,
    "The visible coach preparation changed before save.",
  );
  const coachSaveRequest = pages.coach.waitForRequest(
    (request) =>
      request.method() === "PUT"
      && new URL(request.url()).pathname
        === `/api/sessions/${encodeURIComponent(target.roomId)}/preparation`
      && request.postDataJSON()?.operation === "SAVE_COACH",
    { timeout: 20_000 },
  );
  await pages.coach
    .getByRole("button", { name: "Save private prep", exact: true })
    .click();
  assert.equal(
    (await coachSaveRequest).postDataJSON()?.note,
    privateNote,
    "The coach preparation request did not contain the text visible at save time.",
  );
  await pages.coach
    .getByText("Private coach prep saved.", { exact: true })
    .waitFor({ timeout: 20_000 });

  const clientReadback = await pages.client.evaluate(async (roomId) => {
    const response = await fetch(
      `/api/sessions/${encodeURIComponent(roomId)}/preparation`,
      { cache: "no-store" },
    );
    return { status: response.status, payload: await response.json() };
  }, target.roomId);
  assert.equal(clientReadback.status, 200);
  assert.equal(clientReadback.payload?.preparation?.role, "client");
  assert.equal(clientReadback.payload?.preparation?.coachPrivate, null);
  assert.equal(
    JSON.stringify(clientReadback.payload).includes(privateNote),
    false,
    "Client API projection exposed private coach preparation.",
  );

  const retryRequestId = crypto.randomUUID();
  const retry = await pages.client.evaluate(
    async ({ roomId, requestId, retryFocus }) => {
      const body = {
        operation: "SAVE_CLIENT",
        requestId,
        focus: retryFocus,
        desiredOutcome: "Finish with a concrete commitment.",
        successMeasure: "The commitment has an owner and time.",
        progressScore: 8,
        update: "The original plan is still moving.",
      };
      const send = (nextBody = body) => fetch(
        `/api/sessions/${encodeURIComponent(roomId)}/preparation`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(nextBody),
        },
      ).then(async (response) => ({
        status: response.status,
        payload: await response.json(),
      }));
      const first = await send();
      const replay = await send();
      const collision = await send({ ...body, focus: `${retryFocus} Changed` });
      return { first, replay, collision };
    },
    { roomId: target.roomId, requestId: retryRequestId, retryFocus },
  );
  assert.equal(retry.first.status, 200);
  assert.equal(retry.first.payload?.idempotentReplay, false);
  assert.equal(retry.replay.status, 200);
  assert.equal(retry.replay.payload?.idempotentReplay, true);
  assert.equal(retry.replay.payload?.savedRevision, retry.first.payload?.savedRevision);
  assert.equal(retry.collision.status, 409);
  assert.equal(retry.collision.payload?.code, "PREPARATION_REQUEST_COLLISION");

  await signIn(
    pages.neighbor,
    neighbor,
    neighbor.identities.coach,
    `/sessions/${encodeURIComponent(neighbor.roomId)}`,
  );
  const denied = await pages.neighbor.evaluate(async (roomId) => {
    const response = await fetch(
      `/api/sessions/${encodeURIComponent(roomId)}/preparation`,
      { cache: "no-store" },
    );
    return { status: response.status, payload: await response.json() };
  }, target.roomId);
  assert.equal(denied.status, 404);
  assert.equal(denied.payload?.code, "PREPARATION_NOT_FOUND");
  assert.equal("preparation" in denied.payload, false);

  const [preparation, revisions, after] = await Promise.all([
    prisma.coachingSessionPreparation.findUnique({
      where: { bookingId: target.bookingId },
      select: {
        revision: true,
        clientFocus: true,
        clientProgressScore: true,
        coachPrivateNote: true,
      },
    }),
    prisma.coachingSessionPreparationRevision.findMany({
      where: { preparation: { bookingId: target.bookingId } },
      orderBy: { revision: "asc" },
      select: { requestId: true, lane: true, revision: true, inputSha256: true },
    }),
    snapshotSideEffects(),
  ]);
  assert.equal(preparation?.revision, 3);
  assert.equal(preparation?.clientFocus, retryFocus);
  assert.equal(preparation?.clientProgressScore, 8);
  assert.equal(preparation?.coachPrivateNote, privateNote);
  assert.deepEqual(
    revisions.map(({ lane }) => lane),
    ["CLIENT_SHARED", "COACH_PRIVATE", "CLIENT_SHARED"],
  );
  assert.equal(
    revisions.filter(({ requestId }) => requestId === retryRequestId).length,
    1,
    "Exact retry persisted a duplicate immutable revision.",
  );
  assert(revisions.every(({ inputSha256 }) => /^[0-9a-f]{64}$/.test(inputSha256)));
  assert.deepEqual(
    after,
    before,
    "Optional preparation created a message, task, goal, or coaching note side effect.",
  );

  const runToken = path.basename(path.dirname(target.contextPath));
  const receiptPath = path.join(
    repositoryRoot,
    "artifacts",
    "coaching-acceptance",
    runToken,
    "session-preparation-receipt.json",
  );
  await mkdir(path.dirname(receiptPath), { recursive: true });
  const receipt = {
    schema: "quipsly-fresh-session-preparation-operation-v1",
    recordedAt: new Date().toISOString(),
    ok: true,
    localOnly: true,
    sourceSha,
    runtimeSourceCurrent: true,
    testLane: target.testLane,
    fixtureIdentifiersUsed: target.fixtureIdentifiersUsed,
    humanAcceptanceSatisfied: false,
    roomId: target.roomId,
    bookingId: target.bookingId,
    renderedClientPlanSaved: true,
    renderedCoachSharedReadback: true,
    renderedCoachPrivatePlanSaved: true,
    clientPrivateProjectionAbsent: true,
    neighboringCoachDirectRouteDenied: true,
    exactRetryConverged: true,
    requestCollisionRejected: true,
    immutableRevisionCount: revisions.length,
    unrelatedSideEffectsAbsent: true,
    phoneWidthOverflow: false,
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
    clearRenderedSession(pages.client, baseURL, "fresh client").catch(() => undefined),
    clearRenderedSession(pages.coach, baseURL, "fresh coach").catch(() => undefined),
    clearRenderedSession(pages.neighbor, baseURL, "neighbor coach").catch(() => undefined),
  ]);
  await Promise.all(Object.values(contexts).map((context) => context.close()));
  await browser.close();
  await prisma.$disconnect();
}
