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
const IDENTITIES = {
  coach: "quipsly-coach-retained-20260731@example.test",
  client: "quipsly-client-retained-20260731@example.test",
  outsider: "quipsly-followup-outsider-retained-20260731@example.test",
};
const ROOM_ID = "retained-coaching-follow-up-20260731";
const BOOKING_ID = "retained-coaching-booking-20260731";
const GOAL_ID = "qa-retained-evidence-weekly-review-goal-20260802";
const TASK_ID = "qa-retained-evidence-weekly-review-task-20260802";
const BLOCK_ID = "qa-retained-evidence-weekly-review-block-20260802";
const RECEIPT_ID = "qa-retained-evidence-weekly-review-receipt-20260802";
const GOAL_TITLE = "QA Retained · Make next week's coaching promise evidence-backed";
const TASK_TITLE = "QA Retained · Draft the one-page coaching follow-through";
const ACTUAL_MINUTES = 37;

function assert(condition, message) {
  if (!condition) throw new Error(message);
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
    "Retained weekly review requires an explicit loopback PostgreSQL database.",
  );
  return url.toString();
}

export function currentWeekStartsAt(now = new Date()) {
  const day = now.getUTCDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  return new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - daysSinceMonday,
    12,
  ));
}

async function ensureFixture(prisma, now) {
  const users = await prisma.user.findMany({
    where: { primaryEmail: { in: Object.values(IDENTITIES) } },
    select: { id: true, primaryEmail: true, isActive: true, emailVerified: true },
  });
  const byEmail = new Map(users.map((user) => [user.primaryEmail, user]));
  const client = byEmail.get(IDENTITIES.client);
  const coach = byEmail.get(IDENTITIES.coach);
  const outsider = byEmail.get(IDENTITIES.outsider);
  for (const [role, user] of [["client", client], ["coach", coach], ["outsider", outsider]]) {
    assert(user?.id && user.isActive && user.emailVerified, `The retained ${role} database identity is not ready.`);
  }
  const room = await prisma.callRoom.findUnique({ where: { id: ROOM_ID }, select: { id: true, title: true, bookingId: true } });
  assert(room?.id && room.bookingId === BOOKING_ID, "The retained private coaching room prerequisite is missing.");

  await prisma.goal.upsert({
    where: { id: GOAL_ID },
    update: {},
    create: {
      id: GOAL_ID,
      ownerUserId: client.id,
      roomId: ROOM_ID,
      bookingId: BOOKING_ID,
      title: GOAL_TITLE,
      description: "A durable client-owned goal used to operate weekly evidence review across Capture and Nest.",
      status: "ACTIVE",
      targetAt: new Date(now.getTime() + 14 * 86_400_000),
      sourceJson: { schema: "quipsly-retained-weekly-review-v1", externalSideEffects: false },
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
      detail: "Turn the reviewed coaching evidence into one editable follow-through page.",
      status: "OPEN",
      dueAt: new Date(now.getTime() + 3 * 86_400_000),
      sourceJson: { schema: "quipsly-retained-weekly-review-v1", externalSideEffects: false },
    },
  });
  await prisma.goalTaskLink.upsert({
    where: { goalId_actionItemId: { goalId: GOAL_ID, actionItemId: TASK_ID } },
    update: {},
    create: { goalId: GOAL_ID, actionItemId: TASK_ID, createdByUserId: client.id, sourceJson: { schema: "quipsly-retained-weekly-review-v1" } },
  });
  await prisma.goalProgressReceipt.upsert({
    where: { id: RECEIPT_ID },
    update: {},
    create: {
      id: RECEIPT_ID,
      goalId: GOAL_ID,
      actorUserId: client.id,
      kind: "PROGRESS",
      progressPercent: 25,
      note: "QA Retained · The coach and client agreed on one concrete follow-through artifact.",
      evidenceJson: { schema: "quipsly-retained-weekly-review-evidence-v1", externalSideEffects: false },
      occurredAt: now,
    },
  });
  const weekStartsAt = currentWeekStartsAt(now);
  await prisma.weeklyCommitment.upsert({
    where: { clientUserId_weekStartsAt: { clientUserId: client.id, weekStartsAt } },
    update: {
      reviewedByUserId: coach.id,
      commitmentOne: "Draft and review the one-page coaching follow-through",
      commitmentTwo: "Bring one uncertainty to the next coaching Session",
      supportNeeded: "Coach review of whether the follow-through is concrete enough",
      progressNotes: "The decision is clear; actual focused work still needs an honest receipt.",
      status: "ACTIVE",
    },
    create: {
      clientUserId: client.id,
      weekStartsAt,
      commitmentOne: "Draft and review the one-page coaching follow-through",
      commitmentTwo: "Bring one uncertainty to the next coaching Session",
      supportNeeded: "Coach review of whether the follow-through is concrete enough",
      progressNotes: "The decision is clear; actual focused work still needs an honest receipt.",
      status: "ACTIVE",
      reviewedByUserId: coach.id,
      sourceJson: { schema: "quipsly-retained-weekly-review-v1", externalSideEffects: false },
    },
  });
  const existingBlock = await prisma.workPlanBlock.findUnique({ where: { id: BLOCK_ID } });
  if (!existingBlock) {
    await prisma.workPlanBlock.create({
      data: {
        id: BLOCK_ID,
        ownerUserId: client.id,
        actionItemId: TASK_ID,
        goalId: GOAL_ID,
        startsAt: new Date(now.getTime() - 30 * 60_000),
        endsAt: new Date(now.getTime() + 15 * 60_000),
        timezone: "America/Denver",
        status: "PLANNED",
        sourceJson: { schema: "quipsly-retained-weekly-review-v1", externalSideEffects: false },
      },
    });
  }
  return { client, coach, outsider, room, weekStartsAt };
}

async function openSignedInPage({ page, baseURL, role, callbackPath }) {
  const email = IDENTITIES[role];
  const password = readRetainedQAPassword({ service: KEYCHAIN_SERVICE, account: email });
  assert(password, `The retained ${role} Keychain password is unavailable.`);
  await signInThroughRenderedLogin({ page, baseURL, identity: { role, email }, password, callbackPath });
}

async function operateRenderedReview({ baseURL, alreadyCompleted }) {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const pageErrors = [];
  try {
    const clientContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "en-US", reducedMotion: "reduce" });
    try {
      const page = await clientContext.newPage();
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await openSignedInPage({ page, baseURL, role: "client", callbackPath: "/schedule" });
      await page.getByRole("heading", { name: "Time for the work you actually chose." }).waitFor();
      if (!alreadyCompleted) {
        const block = page.locator("article")
          .filter({ has: page.getByRole("heading", { name: TASK_TITLE, exact: true }) })
          .filter({ has: page.getByRole("button", { name: "Record done", exact: true }) });
        await block.waitFor({ timeout: 20_000 });
        await block.getByLabel("Actual minutes worked", { exact: true }).fill(String(ACTUAL_MINUTES));
        await block.getByRole("button", { name: "Record done", exact: true }).click();
        await block.getByRole("status").filter({ hasText: `${ACTUAL_MINUTES} actual minutes recorded.` }).waitFor({ timeout: 20_000 });
      }
      await page.goto(`${baseURL}/work`, { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: "Weekly review", exact: true }).waitFor();
      const clientReview = page.locator("article").filter({ hasText: "Your evidence-backed week" }).filter({ hasText: GOAL_TITLE });
      await clientReview.waitFor({ timeout: 20_000 });
      await clientReview.getByText(`${ACTUAL_MINUTES}m`, { exact: true }).waitFor();
      await clientReview.getByText(TASK_TITLE, { exact: true }).waitFor();
      const mobileReadback = await page.evaluate(async () => {
        const response = await fetch("/api/mobile/capture/today");
        return { status: response.status, body: await response.json() };
      });
      assert(mobileReadback.status === 200, "The signed-in Capture Today projection did not load.");
      assert(mobileReadback.body.weeklyReview?.actualMinutes >= ACTUAL_MINUTES, "Capture Today did not expose the explicit actual-time receipt.");
      assert(mobileReadback.body.weeklyReview?.goals?.some((goal) => goal.id === GOAL_ID), "Capture Today did not expose the retained canonical goal.");
      await clearRenderedSession(page, baseURL, "client");
    } finally {
      await clientContext.close();
    }

    const coachContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "en-US", reducedMotion: "reduce" });
    try {
      const page = await coachContext.newPage();
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await openSignedInPage({ page, baseURL, role: "coach", callbackPath: "/work" });
      const coachReview = page.locator("article").filter({ hasText: "Coach view · Quipsly Retained Client" }).filter({ hasText: GOAL_TITLE });
      await coachReview.waitFor({ timeout: 20_000 });
      await coachReview.getByText(`${ACTUAL_MINUTES}m`, { exact: true }).waitFor();
      await coachReview.getByText("Coach review of whether the follow-through is concrete enough", { exact: true }).waitFor();
      await clearRenderedSession(page, baseURL, "coach");
    } finally {
      await coachContext.close();
    }

    const outsiderContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "en-US", reducedMotion: "reduce" });
    try {
      const page = await outsiderContext.newPage();
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await openSignedInPage({ page, baseURL, role: "outsider", callbackPath: "/work" });
      await page.getByRole("heading", { name: "Weekly review", exact: true }).waitFor();
      assert(await page.getByText(GOAL_TITLE, { exact: true }).count() === 0, "An outsider could read the private retained goal.");
      assert(await page.getByText("Coach view · Quipsly Retained Client", { exact: true }).count() === 0, "An outsider could read the private client review.");
      await clearRenderedSession(page, baseURL, "outsider");
    } finally {
      await outsiderContext.close();
    }
    assert(pageErrors.length === 0, `Rendered weekly review raised browser errors: ${JSON.stringify(pageErrors)}`);
    return { browserExceptions: 0, clientProjection: true, coachProjection: true, outsiderDenied: true, mobileProjection: true };
  } finally {
    await browser.close();
  }
}

export async function main() {
  const baseURL = requireLoopbackOrigin(process.env.QUIPSLY_RETAINED_WEEKLY_REVIEW_BASE_URL || "http://127.0.0.1:3012", "QUIPSLY_RETAINED_WEEKLY_REVIEW_BASE_URL");
  const databaseURL = requireLocalDatabaseUrl(process.env.DATABASE_URL || "");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseURL, max: 2 }), log: ["error"] });
  try {
    const now = new Date();
    const fixture = await ensureFixture(prisma, now);
    const before = await prisma.workPlanBlock.findUnique({ where: { id: BLOCK_ID }, select: { status: true, actualMinutes: true } });
    const rendered = await operateRenderedReview({ baseURL, alreadyCompleted: before?.status === "COMPLETED" && before.actualMinutes === ACTUAL_MINUTES });
    const after = await prisma.workPlanBlock.findUnique({ where: { id: BLOCK_ID }, select: { ownerUserId: true, status: true, actualMinutes: true, completedAt: true, sourceJson: true } });
    const task = await prisma.actionItem.findUnique({ where: { id: TASK_ID }, select: { status: true } });
    const goal = await prisma.goal.findUnique({ where: { id: GOAL_ID }, select: { status: true } });
    assert(after?.ownerUserId === fixture.client.id && after.status === "COMPLETED" && after.actualMinutes === ACTUAL_MINUTES && after.completedAt, "Canonical actual-time completion readback failed.");
    assert(task?.status === "OPEN" && goal?.status === "ACTIVE", "Completing the focus block incorrectly completed its task or goal.");
    const receipts = Array.isArray(after.sourceJson?.planReceipts) ? after.sourceJson.planReceipts : [];
    assert(receipts.some((receipt) => receipt.actualMinutes === ACTUAL_MINUTES && receipt.targetStatusMutated === false), "The canonical completion receipt is missing its no-target-mutation boundary.");
    console.log(JSON.stringify({
      ok: true,
      localOnly: true,
      weekStartsAt: fixture.weekStartsAt.toISOString(),
      goalHash: sha256(GOAL_ID),
      taskHash: sha256(TASK_ID),
      blockHash: sha256(BLOCK_ID),
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
