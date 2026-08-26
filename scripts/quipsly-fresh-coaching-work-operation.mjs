#!/usr/bin/env node

import assert from "node:assert/strict";

import { loadFreshCoachingAcceptanceContext } from "./lib/coaching-acceptance-context.mjs";
import { readRetainedQAPassword } from "./lib/retained-qa-keychain.mjs";
import {
  assertNoHorizontalOverflow,
  clearRenderedSession,
  loadPlaywright,
  requireLoopbackOrigin,
  signInThroughRenderedLogin,
} from "./lib/retained-qa-browser.mjs";

assert.equal(process.env.QUIPSLY_FRESH_COACHING_WORK_OPERATION, "1", "Set QUIPSLY_FRESH_COACHING_WORK_OPERATION=1 to operate fresh relationship work.");
const baseURL = requireLoopbackOrigin(process.env.QUIPSLY_LOCAL_BASE_URL || "http://127.0.0.1:3012", "Fresh coaching work base URL");
const target = await loadFreshCoachingAcceptanceContext({ baseURL });
assert(target, "QUIPSLY_COACHING_ACCEPTANCE_CONTEXT is required; relationship work must continue an operated fresh start.");

const databaseURL = new URL(process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio");
assert(["postgres:", "postgresql:"].includes(databaseURL.protocol) && ["127.0.0.1", "localhost", "[::1]"].includes(databaseURL.hostname), "Fresh coaching work refuses non-loopback PostgreSQL.");
process.env.DATABASE_URL = databaseURL.toString();
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "127.0.0.1:9099";

const { getPrismaClient } = await import("../apps/quipsly/src/lib/prisma.ts");
const prisma = getPrismaClient();
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: true });
const clientContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
const coachContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
const clientPage = await clientContext.newPage();
const coachPage = await coachContext.newPage();
const engagementPath = `/coaching/engagements/${encodeURIComponent(target.engagementId)}`;
const nonce = target.roomId.slice(-8);
const titles = {
  sharedNote: `Shared reflection ${nonce}`,
  privateNote: `Private client reflection ${nonce}`,
  task: `Between-session practice ${nonce}`,
  goal: `Coaching relationship goal ${nonce}`,
};

async function openCreateForm(page) {
  const work = page.getByRole("region", { name: "Notes, tasks, and goals" });
  await work.waitFor({ timeout: 30_000 });
  const disclosure = work.locator("details").filter({ hasText: "Add note, task, or goal" });
  if (!(await disclosure.evaluate((element) => element.open))) await disclosure.locator("summary").click();
  return { work, form: disclosure.locator("form") };
}

async function createWork(page, { kind, title, body, visibility = "SHARED" }) {
  const { work, form } = await openCreateForm(page);
  const existing = work.getByText(title, { exact: true });
  if (!(await existing.count())) {
    await form.locator('select[name="kind"]').selectOption(kind);
    if (kind === "NOTE") await form.locator('select[name="visibility"]').selectOption(visibility);
    await form.locator('input[name="title"]').fill(title);
    await form.locator('textarea[name="body"]').fill(body);
    await form.getByRole("button", { name: "Save to coaching home", exact: true }).click();
    await work.getByText(title, { exact: true }).waitFor({ timeout: 30_000 }).catch(async (error) => {
      const notices = await work.getByRole("status").allInnerTexts();
      throw new Error(`${kind} did not appear after rendered save. Notices: ${JSON.stringify(notices)}. ${error.message}`);
    });
  }
  const row = kind === "NOTE"
    ? await prisma.coachingNote.findFirst({ where: { engagementId: target.engagementId, title, authorUserId: target.identities.client.userId }, select: { id: true } })
    : kind === "TASK"
      ? await prisma.actionItem.findFirst({ where: { engagementId: target.engagementId, title }, select: { id: true } })
      : await prisma.goal.findFirst({ where: { engagementId: target.engagementId, title }, select: { id: true } });
  assert(row?.id, `${kind} rendered but its canonical persistence record was unavailable.`);
  return row.id;
}

try {
  const clientPassword = readRetainedQAPassword({ service: target.keychainService, account: target.identities.client.email });
  assert(clientPassword, "Fresh client Keychain password is unavailable.");
  await signInThroughRenderedLogin({ page: clientPage, baseURL, identity: target.identities.client, password: clientPassword, callbackPath: engagementPath });
  await clientPage.getByText("Private to the people shown here", { exact: true }).waitFor({ timeout: 30_000 });
  await clientPage.getByRole("heading", { name: "Session history", exact: true }).waitFor();
  await clientPage.getByRole("link", { name: /^(Prepare|Join|Review) session$/ }).first().waitFor();
  await assertNoHorizontalOverflow(clientPage.locator("main").last(), "fresh client coaching home at phone width");

  const sharedNoteId = await createWork(clientPage, { kind: "NOTE", title: titles.sharedNote, body: "Keep this reflection visible to both people across Sessions." });
  const privateNoteId = await createWork(clientPage, { kind: "NOTE", title: titles.privateNote, body: "This must remain visible only to its author.", visibility: "PRIVATE" });
  const taskId = await createWork(clientPage, { kind: "TASK", title: titles.task, body: "Practice once and bring the result to the next Session." });
  const goalId = await createWork(clientPage, { kind: "GOAL", title: titles.goal, body: "Keep one durable outcome visible across the relationship." });

  const chatMessage = `Fresh relationship message ${nonce}: keep the next step visible.`;
  const clientConversation = clientPage.getByRole("region", { name: "Conversation" });
  const clientMessage = clientConversation.locator("article").filter({ hasText: chatMessage });
  if (!(await clientMessage.count())) {
    await clientConversation.getByPlaceholder("Write to everyone here…").fill(chatMessage);
    await clientConversation.getByRole("button", { name: "Send collaboration message", exact: true }).click();
  }
  await clientMessage.first().waitFor({ timeout: 20_000 });

  const coachPassword = readRetainedQAPassword({ service: target.keychainService, account: target.identities.coach.email });
  assert(coachPassword, "Fresh coach Keychain password is unavailable.");
  await signInThroughRenderedLogin({ page: coachPage, baseURL, identity: target.identities.coach, password: coachPassword, callbackPath: engagementPath });
  const coachWork = coachPage.getByRole("region", { name: "Notes, tasks, and goals" });
  await coachWork.waitFor({ timeout: 30_000 });
  await coachWork.getByText(titles.sharedNote, { exact: true }).waitFor();
  await coachWork.getByText(titles.task, { exact: true }).waitFor();
  await coachWork.getByText(titles.goal, { exact: true }).waitFor();
  assert.equal(await coachWork.getByText(titles.privateNote, { exact: true }).count(), 0, "Coach saw the client's private note.");
  await coachPage.getByRole("region", { name: "Conversation" }).locator("article").filter({ hasText: chatMessage }).first().waitFor();
  await assertNoHorizontalOverflow(coachPage.locator("main").last(), "fresh coach coaching home at phone width");

  const taskCard = coachWork.locator("article").filter({ hasText: titles.task });
  const completeButton = taskCard.getByRole("button", { name: "Complete", exact: true });
  if (await completeButton.count()) {
    const [completeResponse] = await Promise.all([
      coachPage.waitForResponse((candidate) => candidate.request().method() === "PATCH" && new URL(candidate.url()).pathname === `/api/coaching/engagements/${target.engagementId}/work`),
      completeButton.click(),
    ]);
    const completePacket = await completeResponse.json().catch(() => null);
    assert(completeResponse.ok() && completePacket?.ok === true, `Cross-account task completion failed: ${JSON.stringify(completePacket)}`);
  }
  await taskCard.getByText("done", { exact: true }).waitFor();
  await clientPage.reload({ waitUntil: "domcontentloaded" });
  const refreshedClientWork = clientPage.getByRole("region", { name: "Notes, tasks, and goals" });
  await refreshedClientWork.locator("article").filter({ hasText: titles.task }).getByText("done", { exact: true }).waitFor({ timeout: 20_000 });
  await refreshedClientWork.getByText(titles.privateNote, { exact: true }).waitFor();

  const readback = await prisma.coachingEngagement.findUniqueOrThrow({
    where: { id: target.engagementId },
    select: {
      notes: { where: { id: { in: [sharedNoteId, privateNoteId] } }, select: { id: true, visibility: true, authorUserId: true } },
      actionItems: { where: { id: taskId }, select: { id: true, status: true, assignedUserId: true } },
      goals: { where: { id: goalId }, select: { id: true, status: true, ownerUserId: true } },
    },
  });
  assert.equal(readback.notes.find((note) => note.id === sharedNoteId)?.visibility, "SESSION_SHARED");
  assert.equal(readback.notes.find((note) => note.id === privateNoteId)?.visibility, "AUTHOR_PRIVATE");
  assert.equal(readback.actionItems[0]?.status, "DONE");
  assert.equal(readback.goals[0]?.status, "ACTIVE");
  assert.equal(readback.notes.every((note) => note.authorUserId === target.identities.client.userId), true);

  console.log(JSON.stringify({
    ok: true,
    localOnly: true,
    testLane: target.testLane,
    fixtureIdentifiersUsed: target.fixtureIdentifiersUsed,
    humanAcceptanceSatisfied: false,
    contextPath: target.contextPath,
    engagementId: target.engagementId,
    roomId: target.roomId,
    clientCreatedSharedNote: true,
    clientCreatedPrivateNote: true,
    privateNoteHiddenFromCoach: true,
    clientCreatedTask: true,
    clientCreatedGoal: true,
    coachCompletedClientTask: true,
    clientObservedCoachCompletion: true,
    collaborationMessageRoundTrip: true,
    phoneWidthOverflow: false,
    workIds: { sharedNoteId, privateNoteId, taskId, goalId },
    boundaries: { productFormsOnlyForWrites: true, directDatabaseWrites: false, externalSideEffects: false, humanNoviceAcceptanceProven: false },
  }, null, 2));
} finally {
  await clearRenderedSession(clientPage, baseURL, "fresh client").catch(() => undefined);
  await clearRenderedSession(coachPage, baseURL, "fresh coach").catch(() => undefined);
  await clientContext.close();
  await coachContext.close();
  await browser.close();
  await prisma.$disconnect();
}
