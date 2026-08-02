#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

import {
  clearRenderedSession,
  loadPlaywright,
  requireLoopbackOrigin,
  signInThroughRenderedLogin,
} from "./lib/retained-qa-browser.mjs";
import { readRetainedQAPassword } from "./lib/retained-qa-keychain.mjs";

const requireFromQuipsly = createRequire(
  new URL("../apps/quipsly/package.json", import.meta.url),
);
const { PrismaClient } = requireFromQuipsly("@prisma/client");
const { PrismaPg } = requireFromQuipsly("@prisma/adapter-pg");

const KEYCHAIN_SERVICE = "com.quipsly.qa.retained-coaching";
const CLIENT_EMAIL = "quipsly-client-retained-20260731@example.test";
const ROOM_ID = "retained-coaching-follow-up-20260731";
const BOOKING_ID = "retained-coaching-booking-20260731";
const GOAL_ID = "qa-retained-offline-focus-goal-20260802";
const TASK_ID = "qa-retained-offline-focus-task-20260802";
const BLOCK_ID = "qa-retained-offline-focus-block-20260802";
const CLIENT_REQUEST_ID = "622d9f64-16a9-4b98-8f88-58b595240802";
const RECEIPT_ID = `mobile-focus-status-${CLIENT_REQUEST_ID}`;
const GOAL_TITLE = "QA Retained · Keep one coaching promise visible";
const TASK_TITLE = "QA Retained · Reconcile one protected phone focus decision";
const ACTUAL_MINUTES = 23;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

export function requireLocalDatabaseUrl(value) {
  const url = new URL(value);
  assert(
    ["postgres:", "postgresql:"].includes(url.protocol)
      && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
      && Boolean(url.pathname)
      && url.pathname !== "/",
    "Retained offline focus reconciliation requires an explicit loopback PostgreSQL database.",
  );
  return url.toString();
}

async function ensureFixture(prisma, now) {
  const client = await prisma.user.findUnique({
    where: { primaryEmail: CLIENT_EMAIL },
    select: { id: true, isActive: true, emailVerified: true },
  });
  assert(client?.id && client.isActive && client.emailVerified, "The retained client identity is not ready.");
  const room = await prisma.callRoom.findUnique({
    where: { id: ROOM_ID },
    select: { id: true, bookingId: true },
  });
  assert(room?.id && room.bookingId === BOOKING_ID, "The retained coaching room prerequisite is missing.");

  await prisma.goal.upsert({
    where: { id: GOAL_ID },
    update: {},
    create: {
      id: GOAL_ID,
      ownerUserId: client.id,
      roomId: ROOM_ID,
      bookingId: BOOKING_ID,
      title: GOAL_TITLE,
      description: "A retained client-owned goal for phone-to-Nest focus reconciliation.",
      status: "ACTIVE",
      targetAt: new Date(now.getTime() + 14 * 86_400_000),
      sourceJson: { schema: "quipsly-retained-offline-focus-v1", externalSideEffects: false },
    },
  });
  await prisma.actionItem.upsert({
    where: { id: TASK_ID },
    update: {},
    create: {
      id: TASK_ID,
      roomId: ROOM_ID,
      bookingId: BOOKING_ID,
      assignedUserId: client.id,
      title: TASK_TITLE,
      detail: "A protected phone decision must reconcile once without completing this task.",
      status: "OPEN",
      dueAt: new Date(now.getTime() + 3 * 86_400_000),
      sourceJson: { schema: "quipsly-retained-offline-focus-v1", externalSideEffects: false },
    },
  });
  await prisma.goalTaskLink.upsert({
    where: { goalId_actionItemId: { goalId: GOAL_ID, actionItemId: TASK_ID } },
    update: {},
    create: {
      goalId: GOAL_ID,
      actionItemId: TASK_ID,
      createdByUserId: client.id,
      sourceJson: { schema: "quipsly-retained-offline-focus-v1" },
    },
  });
  const existing = await prisma.workPlanBlock.findUnique({ where: { id: BLOCK_ID } });
  if (!existing) {
    await prisma.workPlanBlock.create({
      data: {
        id: BLOCK_ID,
        ownerUserId: client.id,
        actionItemId: TASK_ID,
        goalId: GOAL_ID,
        startsAt: new Date(now.getTime() - 5 * 60_000),
        endsAt: new Date(now.getTime() + 45 * 60_000),
        timezone: "America/Denver",
        status: "PLANNED",
        sourceJson: { schema: "quipsly-retained-offline-focus-v1", externalSideEffects: false },
      },
    });
  } else {
    assert(
      existing.ownerUserId === client.id
        && existing.actionItemId === TASK_ID
        && existing.goalId === GOAL_ID,
      "The retained focus fixture identity no longer matches its canonical owner and targets.",
    );
  }
  return client;
}

function expectedRevision(block) {
  const lastOperation = record(record(block.sourceJson).lastMobileFocusOperation);
  if (lastOperation.clientRequestId === CLIENT_REQUEST_ID) {
    assert(lastOperation.receiptId === undefined || lastOperation.receiptId === RECEIPT_ID,
      "The retained last-operation receipt has an unexpected identity shape.");
    return String(lastOperation.expectedUpdatedAt || "");
  }
  return block.updatedAt.toISOString();
}

async function operateRenderedReconciliation({ baseURL, expectedUpdatedAt }) {
  const password = readRetainedQAPassword({ service: KEYCHAIN_SERVICE, account: CLIENT_EMAIL });
  assert(password, "The retained client Keychain password is unavailable.");
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: "en-US",
    reducedMotion: "reduce",
  });
  const pageErrors = [];
  try {
    const page = await context.newPage();
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await signInThroughRenderedLogin({
      page,
      baseURL,
      identity: { role: "client", email: CLIENT_EMAIL },
      password,
      callbackPath: "/schedule",
    });
    await page.getByRole("heading", { name: "Time for the work you actually chose." }).waitFor();
    const operation = {
      action: "focus-status",
      id: BLOCK_ID,
      nextStatus: "COMPLETED",
      actualMinutes: ACTUAL_MINUTES,
      expectedUpdatedAt,
      clientRequestId: CLIENT_REQUEST_ID,
    };
    const responses = await page.evaluate(async (input) => {
      const invoke = async () => {
        const response = await fetch("/api/mobile/capture/today", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        return { status: response.status, body: await response.json() };
      };
      return [await invoke(), await invoke()];
    }, operation);
    const [first, replay] = responses;
    assert(first.status === 200 && first.body.ok, "The retained phone decision did not reconcile into Nest.");
    assert(replay.status === 200 && replay.body.ok && replay.body.idempotentReplay === true,
      "The identical lost-response replay was not acknowledged idempotently.");
    for (const response of [first.body, replay.body]) {
      assert(response.clientRequestId === CLIENT_REQUEST_ID, "Nest acknowledged a different client request identity.");
      assert(response.receiptId === RECEIPT_ID, "Nest acknowledged a different receipt identity.");
      assert(response.status === "COMPLETED" && response.actualMinutes === ACTUAL_MINUTES,
        "Nest did not acknowledge the exact protected focus intent.");
      assert(response.boundaries?.completingFocusBlockMutatesTarget === false,
        "Nest did not prove that linked task and goal state stayed unchanged.");
      assert(response.boundaries?.externalCalendarMutated === false,
        "Nest claimed an external calendar side effect during focus reconciliation.");
    }
    assert(first.body.updatedAt === replay.body.updatedAt,
      "An idempotent replay created a second canonical revision.");

    await page.reload({ waitUntil: "domcontentloaded" });
    const block = page.locator("article")
      .filter({ has: page.getByRole("link", { name: TASK_TITLE, exact: true }) })
      .filter({ has: page.getByText(`${ACTUAL_MINUTES} actual minutes recorded`, { exact: true }) });
    await block.waitFor({ timeout: 20_000 });
    await block.getByText(`${ACTUAL_MINUTES} actual minutes recorded`, { exact: true }).waitFor();
    const mobileReadback = await page.evaluate(async () => {
      const response = await fetch("/api/mobile/capture/today");
      return { status: response.status, body: await response.json() };
    });
    assert(mobileReadback.status === 200, "Capture Today readback did not load after reconciliation.");
    const projected = mobileReadback.body.focusBlocks?.find((block) => block.id === BLOCK_ID);
    assert(projected?.status === "COMPLETED" && projected.actualMinutes === ACTUAL_MINUTES,
      "Capture Today did not project the reconciled canonical decision.");
    await clearRenderedSession(page, baseURL, "client");
    assert(pageErrors.length === 0, `Rendered reconciliation raised browser errors: ${JSON.stringify(pageErrors)}`);
    return {
      firstWasReplay: first.body.idempotentReplay === true,
      secondWasReplay: true,
      renderedScheduleReadback: true,
      mobileProjectionReadback: true,
      browserExceptions: 0,
    };
  } finally {
    await context.close();
    await browser.close();
  }
}

export async function main() {
  const baseURL = requireLoopbackOrigin(
    process.env.QUIPSLY_RETAINED_OFFLINE_FOCUS_BASE_URL || "http://127.0.0.1:3012",
    "QUIPSLY_RETAINED_OFFLINE_FOCUS_BASE_URL",
  );
  const databaseURL = requireLocalDatabaseUrl(process.env.DATABASE_URL || "");
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseURL, max: 2 }),
    log: ["error"],
  });
  try {
    const client = await ensureFixture(prisma, new Date());
    const before = await prisma.workPlanBlock.findUnique({ where: { id: BLOCK_ID } });
    assert(before, "The retained focus fixture was not created.");
    const rendered = await operateRenderedReconciliation({
      baseURL,
      expectedUpdatedAt: expectedRevision(before),
    });
    const after = await prisma.workPlanBlock.findUnique({
      where: { id: BLOCK_ID },
      select: {
        ownerUserId: true,
        status: true,
        actualMinutes: true,
        completedAt: true,
        sourceJson: true,
      },
    });
    const task = await prisma.actionItem.findUnique({ where: { id: TASK_ID }, select: { status: true } });
    const goal = await prisma.goal.findUnique({ where: { id: GOAL_ID }, select: { status: true } });
    assert(after?.ownerUserId === client.id && after.status === "COMPLETED"
      && after.actualMinutes === ACTUAL_MINUTES && after.completedAt,
    "Canonical focus completion readback failed.");
    assert(task?.status === "OPEN" && goal?.status === "ACTIVE",
      "Focus reconciliation incorrectly completed its linked task or goal.");
    const source = record(after.sourceJson);
    const matchingReceipts = (Array.isArray(source.planReceipts) ? source.planReceipts : [])
      .map(record)
      .filter((receipt) => receipt.id === RECEIPT_ID);
    assert(matchingReceipts.length === 1,
      "The stable client request must produce exactly one canonical receipt.");
    const lastOperation = record(source.lastMobileFocusOperation);
    assert(lastOperation.id === RECEIPT_ID
      && lastOperation.clientRequestId === CLIENT_REQUEST_ID
      && lastOperation.blockId === BLOCK_ID
      && lastOperation.actualMinutes === ACTUAL_MINUTES
      && lastOperation.targetStatusMutated === false
      && lastOperation.externalCalendarMutated === false,
    "The durable last-operation receipt does not preserve the exact mobile decision boundary.");
    console.log(JSON.stringify({
      ok: true,
      localOnly: true,
      ownerHash: sha256(client.id),
      blockHash: sha256(BLOCK_ID),
      receiptHash: sha256(RECEIPT_ID),
      receiptCount: matchingReceipts.length,
      actualMinutes: after.actualMinutes,
      taskStatus: task.status,
      goalStatus: goal.status,
      ...rendered,
      artifactPreserved: true,
      externalSideEffects: false,
      secretsPrinted: false,
      screenshotsCaptured: false,
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await main();
