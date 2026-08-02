#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

import { readRetainedQAPassword } from "./lib/retained-qa-keychain.mjs";
import {
  assertNoHorizontalOverflow,
  clearRenderedSession,
  loadPlaywright,
  requireLoopbackOrigin,
  signInThroughRenderedLogin,
} from "./lib/retained-qa-browser.mjs";

const requireFromQuipsly = createRequire(new URL("../apps/quipsly/package.json", import.meta.url));
const { PrismaClient } = requireFromQuipsly("@prisma/client");
const { PrismaPg } = requireFromQuipsly("@prisma/adapter-pg");

const KEYCHAIN_SERVICE = "com.quipsly.qa.retained-coaching";
const PRIOR_ROOM_ID = "retained-coaching-follow-up-20260731";
const NEXT_ROOM_ID = "qa-retained-coaching-next-session-20260807";
const TASK_ID = "retained-follow-up-client-task-20260731";
const GOAL_ID = "retained-follow-up-client-goal-20260731";
const TASK_TITLE = "Run one protected rehearsal";
const GOAL_TITLE = "Use a sustainable boundary";
const GOAL_PROGRESS_PERCENT = 75;
const GOAL_PROGRESS_NOTE = "I used the smaller boundary in one difficult conversation and recovered before overcommitting.";
const CLIENT_EMAIL = "quipsly-client-retained-20260731@example.test";
const COACH_EMAIL = "quipsly-coach-retained-20260731@example.test";
const OUTSIDER_EMAIL = "quipsly-followup-outsider-retained-20260731@example.test";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requireLocalDatabase(value) {
  const url = new URL(String(value || ""));
  assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Follow-through operation refuses non-local databases.");
  return url.toString();
}

function stamp() {
  return new Date().toISOString().replace(/[-:.]/g, "").replace("Z", "Z");
}

async function databaseSnapshot(prisma) {
  const [task, goal, goalProgressCount, sourceOutput, nextTasks, nextGoals, deliveryCount, calendarCount, outputCount] = await Promise.all([
    prisma.actionItem.findUniqueOrThrow({ where: { id: TASK_ID }, select: { id: true, roomId: true, assignedUserId: true, status: true, completedAt: true, updatedAt: true } }),
    prisma.goal.findUniqueOrThrow({
      where: { id: GOAL_ID },
      select: {
        id: true,
        roomId: true,
        ownerUserId: true,
        status: true,
        updatedAt: true,
        progressReceipts: {
          orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
          take: 1,
          select: { id: true, kind: true, progressPercent: true, note: true, occurredAt: true },
        },
      },
    }),
    prisma.goalProgressReceipt.count({ where: { goalId: GOAL_ID } }),
    prisma.sessionOutput.findFirstOrThrow({ where: { roomId: PRIOR_ROOM_ID, kind: "CLIENT_FOLLOW_UP", status: "RELEASED" }, orderBy: [{ releasedAt: "desc" }, { revision: "desc" }], select: { id: true, contentSha256: true, revision: true, status: true, recipientUserId: true, createdByUserId: true } }),
    prisma.actionItem.count({ where: { roomId: NEXT_ROOM_ID } }),
    prisma.goal.count({ where: { roomId: NEXT_ROOM_ID } }),
    prisma.deliveryEvent.count(),
    prisma.calendarEventLink.count(),
    prisma.sessionOutput.count(),
  ]);
  return {
    task: { ...task, completedAt: task.completedAt?.toISOString() ?? null, updatedAt: task.updatedAt.toISOString() },
    goal: {
      ...goal,
      updatedAt: goal.updatedAt.toISOString(),
      latestProgress: goal.progressReceipts[0]
        ? { ...goal.progressReceipts[0], occurredAt: goal.progressReceipts[0].occurredAt.toISOString() }
        : null,
      progressReceipts: undefined,
    },
    goalProgressCount,
    sourceOutput,
    nextTasks,
    nextGoals,
    deliveryCount,
    calendarCount,
    outputCount,
  };
}

async function followThroughSurface(page) {
  const label = page.getByText("Follow-through for this Session", { exact: true });
  await label.waitFor({ timeout: 25_000 });
  return label.locator("xpath=ancestor::section[1]");
}

async function captureWholeSurface(page, surface, screenshotPath) {
  const viewport = page.viewportSize();
  const box = await surface.boundingBox();
  if (viewport && box && box.height + 240 > viewport.height) {
    await page.setViewportSize({
      width: viewport.width,
      height: Math.min(2600, Math.ceil(box.height + 240)),
    });
  }
  await surface.scrollIntoViewIfNeeded();
  await surface.screenshot({ path: screenshotPath });
}

async function operateClient(browser, baseURL, artifactDirectory) {
  const identity = { role: "client", email: CLIENT_EMAIL };
  const password = readRetainedQAPassword({ service: KEYCHAIN_SERVICE, account: identity.email });
  assert(password, "The retained client Keychain password is unavailable.");
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "light", locale: "en-US", reducedMotion: "reduce" });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  try {
    await signInThroughRenderedLogin({ page, baseURL, identity, password, callbackPath: `/sessions/${NEXT_ROOM_ID}?mode=prepare` });
    let surface = await followThroughSurface(page);
    await surface.getByText(TASK_TITLE, { exact: true }).waitFor();
    await surface.getByText(GOAL_TITLE, { exact: true }).waitFor();
    const taskLink = surface.getByRole("link", { name: new RegExp(TASK_TITLE, "i") });
    assert(await taskLink.getAttribute("href") === `/work?task=${TASK_ID}`, "Client follow-through did not link the exact canonical task identity.");
    const goalLink = surface.getByRole("link", { name: new RegExp(GOAL_TITLE, "i") });
    assert(await goalLink.getAttribute("href") === `/work?goal=${GOAL_ID}`, "Client follow-through did not link the exact canonical goal identity.");
    await assertNoHorizontalOverflow(surface, identity.role);
    await captureWholeSurface(page, surface, path.join(artifactDirectory, "client-before.png"));

    await taskLink.click();
    const taskHeading = page.getByRole("heading", { name: TASK_TITLE, exact: true });
    await taskHeading.waitFor({ timeout: 20_000 });
    const taskCard = taskHeading.locator("xpath=ancestor::article[1]");
    const reopen = taskCard.getByRole("button", { name: "Reopen", exact: true });
    if (await reopen.count()) {
      await reopen.click();
      await taskCard.getByText(/Reopened\. A private status receipt was saved\./i).waitFor({ timeout: 20_000 });
    }
    const markDone = taskCard.getByRole("button", { name: "Mark done", exact: true });
    await markDone.waitFor({ timeout: 20_000 });
    await markDone.click();
    await taskCard.getByText(/Marked done\. A private status receipt was saved\./i).waitFor({ timeout: 20_000 });

    await page.goto(`${baseURL}/sessions/${NEXT_ROOM_ID}?mode=prepare`, { waitUntil: "domcontentloaded" });
    surface = await followThroughSurface(page);
    const currentTask = surface.getByText(TASK_TITLE, { exact: true }).locator("xpath=ancestor::*[self::a or self::div][1]");
    await currentTask.getByText("Done", { exact: true }).waitFor({ timeout: 20_000 });
    await currentTask.getByText(/Updated since release · was Open/i).waitFor();

    const currentGoalLink = surface.getByRole("link", { name: new RegExp(GOAL_TITLE, "i") });
    await currentGoalLink.click();
    const goalHeading = page.getByRole("heading", { name: GOAL_TITLE, exact: true });
    await goalHeading.waitFor({ timeout: 20_000 });
    const goalCard = goalHeading.locator("xpath=ancestor::article[1]");
    await goalCard.getByRole("combobox", { name: "Progress", exact: true }).selectOption(String(GOAL_PROGRESS_PERCENT));
    await goalCard.getByRole("textbox", { name: "Evidence note", exact: true }).fill(GOAL_PROGRESS_NOTE);
    await goalCard.getByRole("button", { name: "Save progress", exact: true }).click();
    await goalCard.getByText(/Progress evidence saved\. Goal status did not change automatically\./i).waitFor({ timeout: 20_000 });

    await page.goto(`${baseURL}/sessions/${NEXT_ROOM_ID}?mode=prepare`, { waitUntil: "domcontentloaded" });
    surface = await followThroughSurface(page);
    const currentGoal = surface.getByText(GOAL_TITLE, { exact: true }).locator("xpath=ancestor::*[self::a or self::div][1]");
    await currentGoal.getByText(`${GOAL_PROGRESS_PERCENT}% at latest check-in`, { exact: false }).waitFor({ timeout: 20_000 });
    await currentGoal.getByText(GOAL_PROGRESS_NOTE, { exact: false }).waitFor();
    await currentGoal.getByText("New check-in since release", { exact: true }).waitFor();
    await surface.getByText("2 updated", { exact: true }).waitFor();
    await surface.getByText(/same canonical IDs · no copied work/i).waitFor();
    await assertNoHorizontalOverflow(surface, identity.role);
    await captureWholeSurface(page, surface, path.join(artifactDirectory, "client-after.png"));
    assert(pageErrors.length === 0, `Client follow-through operation raised ${pageErrors.length} browser exception(s).`);
    await clearRenderedSession(page, baseURL, identity.role);
    return {
      role: identity.role,
      exactTaskLink: true,
      exactGoalLink: true,
      taskDecision: "DONE",
      goalProgress: GOAL_PROGRESS_PERCENT,
      goalEvidenceVisible: true,
      liveProjection: "DONE_AND_PROGRESS_CHECK_IN",
      browserExceptions: 0,
      sessionClear: "passed",
    };
  } finally {
    await context.close();
  }
}

async function verifyCoach(browser, baseURL, artifactDirectory) {
  const identity = { role: "coach", email: COACH_EMAIL };
  const password = readRetainedQAPassword({ service: KEYCHAIN_SERVICE, account: identity.email });
  assert(password, "The retained coach Keychain password is unavailable.");
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: "light", locale: "en-US", reducedMotion: "reduce" });
  const page = await context.newPage();
  try {
    await signInThroughRenderedLogin({ page, baseURL, identity, password, callbackPath: `/sessions/${NEXT_ROOM_ID}?mode=prepare` });
    const surface = await followThroughSurface(page);
    const taskText = surface.getByText(TASK_TITLE, { exact: true });
    await taskText.waitFor();
    const taskContainer = taskText.locator("xpath=ancestor::div[1]");
    await taskContainer.getByText("Done", { exact: true }).waitFor();
    const goalText = surface.getByText(GOAL_TITLE, { exact: true });
    await goalText.waitFor();
    const goalContainer = goalText.locator("xpath=ancestor::div[1]");
    await goalContainer.getByText(`${GOAL_PROGRESS_PERCENT}% at latest check-in`, { exact: false }).waitFor();
    await goalContainer.getByText(GOAL_PROGRESS_NOTE, { exact: false }).waitFor();
    await goalContainer.getByText("New check-in since release", { exact: true }).waitFor();
    assert(await surface.getByRole("link", { name: new RegExp(TASK_TITLE, "i") }).count() === 0, "Coach received a client-owned Work mutation link.");
    const source = surface.getByRole("link", { name: "Open release source", exact: true });
    assert(await source.getAttribute("href") === `/sessions/${PRIOR_ROOM_ID}?mode=outputs`, "Coach lost the exact released-output source route.");
    await assertNoHorizontalOverflow(surface, identity.role);
    await captureWholeSurface(page, surface, path.join(artifactDirectory, "coach-readback.png"));
    await clearRenderedSession(page, baseURL, identity.role);
    return { role: identity.role, liveProjection: "DONE_AND_PROGRESS_CHECK_IN", clientMutationLink: "denied", goalEvidenceVisible: true, exactSourceLink: true, sessionClear: "passed" };
  } finally {
    await context.close();
  }
}

async function verifyOutsider(browser, baseURL, artifactDirectory) {
  const identity = { role: "outsider", email: OUTSIDER_EMAIL };
  const password = readRetainedQAPassword({ service: KEYCHAIN_SERVICE, account: identity.email });
  assert(password, "The retained outsider Keychain password is unavailable.");
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "light", locale: "en-US", reducedMotion: "reduce" });
  const page = await context.newPage();
  try {
    await signInThroughRenderedLogin({ page, baseURL, identity, password, callbackPath: `/sessions/${NEXT_ROOM_ID}?mode=prepare` });
    await page.getByRole("heading", { name: "QA Retained · Coaching continuity Session 2", exact: true }).waitFor({ timeout: 20_000 });
    assert(await page.getByText("Follow-through for this Session", { exact: true }).count() === 0, "Session producer received coach/client follow-through.");
    assert(await page.getByText(TASK_TITLE, { exact: true }).count() === 0, "Session producer learned the client commitment title.");
    assert(await page.getByText(GOAL_TITLE, { exact: true }).count() === 0, "Session producer learned the client goal title.");
    await page.screenshot({ path: path.join(artifactDirectory, "outsider-denial.png"), fullPage: true });
    await clearRenderedSession(page, baseURL, identity.role);
    return { role: identity.role, sharedFollowThrough: "denied", taskTitle: "concealed", goalTitle: "concealed", sessionClear: "passed" };
  } finally {
    await context.close();
  }
}

async function main() {
  const baseURL = requireLoopbackOrigin(process.env.QUIPSLY_RETAINED_COACHING_BASE_URL || "http://127.0.0.1:3012", "QUIPSLY_RETAINED_COACHING_BASE_URL");
  const databaseURL = requireLocalDatabase(process.env.DATABASE_URL);
  const artifactRoot = process.env.QUIPSLY_RETAINED_FOLLOW_THROUGH_ARTIFACT_ROOT || "/Volumes/My Passport/Quipsly QA Artifacts/Coaching Follow Through";
  const artifactDirectory = path.join(artifactRoot, stamp());
  await mkdir(artifactDirectory, { recursive: true });
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseURL }), log: ["error"] });
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  try {
    const before = await databaseSnapshot(prisma);
    const identities = [
      await operateClient(browser, baseURL, artifactDirectory),
      await verifyCoach(browser, baseURL, artifactDirectory),
      await verifyOutsider(browser, baseURL, artifactDirectory),
    ];
    const after = await databaseSnapshot(prisma);
    assert(after.task.status === "DONE" && after.task.completedAt, "Canonical client task was not completed through Work.");
    assert(after.goal.id === before.goal.id && after.goal.status === before.goal.status, "Progress check-in changed the canonical goal definition or status.");
    assert(after.goalProgressCount === before.goalProgressCount + 1, "Rendered progress check-in did not append exactly one canonical receipt.");
    assert(after.goal.latestProgress?.progressPercent === GOAL_PROGRESS_PERCENT, "The latest canonical goal receipt lost the operated progress percentage.");
    assert(after.goal.latestProgress?.note === GOAL_PROGRESS_NOTE, "The latest canonical goal receipt lost the operated evidence note.");
    assert(after.nextTasks === 0 && after.nextGoals === 0, "Follow-through projection copied canonical work into the next Session.");
    assert(after.sourceOutput.id === before.sourceOutput.id && after.sourceOutput.contentSha256 === before.sourceOutput.contentSha256, "Live status operation rewrote the released follow-up.");
    assert(after.deliveryCount === before.deliveryCount, "Follow-through operation created a delivery event.");
    assert(after.calendarCount === before.calendarCount, "Follow-through operation changed Calendar evidence.");
    assert(after.outputCount === before.outputCount, "Follow-through operation created or removed a Session output.");
    const receipt = {
      ok: true,
      localOnly: true,
      retained: true,
      renderedProduct: true,
      artifactDirectory,
      screenshotsCaptured: 4,
      secretsPrinted: false,
      identities,
      canonical: {
        taskId: after.task.id,
        taskStatus: after.task.status,
        taskCompletedAt: after.task.completedAt,
        goalId: after.goal.id,
        goalStatus: after.goal.status,
        goalProgressReceiptId: after.goal.latestProgress.id,
        goalProgressPercent: after.goal.latestProgress.progressPercent,
        goalProgressNote: after.goal.latestProgress.note,
        goalProgressReceiptCountBefore: before.goalProgressCount,
        goalProgressReceiptCountAfter: after.goalProgressCount,
        releasedOutputId: after.sourceOutput.id,
        releasedContentSha256: after.sourceOutput.contentSha256,
        copiedTaskCount: after.nextTasks,
        copiedGoalCount: after.nextGoals,
      },
      boundaries: {
        canonicalTaskMutatedByClient: true,
        canonicalGoalDefinitionOrStatusMutated: false,
        canonicalGoalProgressReceiptAppendedByClient: true,
        releasedOutputMutated: false,
        currentSessionMutated: false,
        externalDeliveryEventCreated: false,
        calendarEvidenceChanged: false,
      },
    };
    await writeFile(path.join(artifactDirectory, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
    console.log(JSON.stringify(receipt, null, 2));
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
}

await main();
