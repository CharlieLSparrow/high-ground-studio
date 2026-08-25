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
  process.env.QUIPSLY_FRESH_SESSION_CONVERSATION_OPERATION,
  "1",
  "Set QUIPSLY_FRESH_SESSION_CONVERSATION_OPERATION=1 to operate the fresh Session conversation.",
);
const repositoryRoot = path.resolve(import.meta.dirname, "..");
const trackedStatus = execFileSync("git", ["status", "--short", "--untracked-files=no"], {
  cwd: repositoryRoot,
  encoding: "utf8",
}).trim();
assert.equal(trackedStatus, "", "Fresh Session conversation requires a clean tracked worktree.");
const sourceSha = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: repositoryRoot,
  encoding: "utf8",
}).trim();
const baseURL = requireLoopbackOrigin(
  process.env.QUIPSLY_LOCAL_BASE_URL || "http://127.0.0.1:3012",
  "Fresh Session conversation base URL",
);
const target = await loadFreshCoachingAcceptanceContext({ baseURL });
assert(target, "Fresh Session conversation requires an exact private coaching context.");
const runToken = path.basename(path.dirname(target.contextPath));

const databaseURL = new URL(
  process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio",
);
assert(
  ["postgres:", "postgresql:"].includes(databaseURL.protocol)
    && ["127.0.0.1", "localhost", "[::1]"].includes(databaseURL.hostname),
  "Fresh Session conversation refuses non-loopback PostgreSQL.",
);
process.env.DATABASE_URL = databaseURL.toString();
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "127.0.0.1:9099";

const [{ getPrismaClient }, { sessionConversationActorAccessWhere }] = await Promise.all([
  import("../apps/quipsly/src/lib/prisma.ts"),
  import("../apps/quipsly/src/lib/server/session-access.ts"),
]);
const prisma = getPrismaClient();
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: true });
const coachContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
const clientContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
const coachPage = await coachContext.newPage();
const clientPage = await clientContext.newPage();
const conversationPath = `/sessions/${encodeURIComponent(target.roomId)}?mode=conversation`;
const nonce = `${runToken}-${Date.now().toString(36)}`;
const originalBody = `Session agenda ${nonce}: choose one useful next step.`;
const correctedBody = `Session agenda ${nonce}: choose one clear next step.`;
const replyBody = `Reply ${nonce}: I want to practice it before Friday.`;
const retryBody = `Retry identity ${nonce}: keep this exactly once.`;

async function signIn(page, identity) {
  const password = readRetainedQAPassword({
    service: target.keychainService,
    account: identity.email,
  });
  assert(password, `Fresh ${identity.role} Keychain password is unavailable.`);
  await signInThroughRenderedLogin({ page, baseURL, identity, password, callbackPath: conversationPath });
  await page.getByRole("heading", { name: "Session conversation", exact: true }).waitFor({ timeout: 30_000 });
  await assertNoHorizontalOverflow(page.locator("main").last(), `${identity.role} Session conversation at phone width`);
}

async function refresh(page) {
  await page.getByRole("button", { name: "Refresh conversation", exact: true }).click();
}

function messageArticle(page, body) {
  return page
    .locator("p.whitespace-pre-wrap", { hasText: body })
    .filter({ hasText: body })
    .locator("xpath=ancestor::article");
}

try {
  await Promise.all([
    signIn(coachPage, target.identities.coach),
    signIn(clientPage, target.identities.client),
  ]);

  const coachComposer = coachPage.getByRole("textbox", { name: "Message everyone in this Session" });
  await coachComposer.fill(originalBody);
  await coachPage.getByRole("button", { name: "Send message", exact: true }).click();
  await coachPage.getByText(originalBody, { exact: true }).waitFor({ timeout: 20_000 });

  await refresh(clientPage);
  const clientOriginal = messageArticle(clientPage, originalBody);
  await clientOriginal.waitFor({ timeout: 20_000 });
  assert.equal(await clientOriginal.getByRole("button", { name: "Edit", exact: true }).count(), 0, "Client could edit the coach's message.");
  await clientOriginal.getByRole("button", { name: "Reply", exact: true }).click();
  const clientComposer = clientPage.getByRole("textbox", { name: "Message everyone in this Session" });
  await clientComposer.fill(replyBody);
  await clientPage.getByRole("button", { name: "Send message", exact: true }).click();
  await clientPage.getByText(replyBody, { exact: true }).waitFor({ timeout: 20_000 });

  await refresh(coachPage);
  const coachReply = messageArticle(coachPage, replyBody);
  await coachReply.waitFor({ timeout: 20_000 });

  const coachOriginal = messageArticle(coachPage, originalBody);
  await coachOriginal.getByRole("button", { name: "Edit", exact: true }).click();
  const editor = coachPage.getByRole("textbox").first();
  await editor.fill(correctedBody);
  await coachPage.getByRole("button", { name: "Save", exact: true }).click();
  await messageArticle(coachPage, correctedBody).waitFor({ timeout: 20_000 });
  await refresh(clientPage);
  await messageArticle(clientPage, correctedBody).waitFor({ timeout: 20_000 });

  const raceRequestID = crypto.randomUUID();
  const raceResults = await coachPage.evaluate(async ({ roomId, clientRequestId, body }) => {
    const request = () => fetch(`/api/sessions/${encodeURIComponent(roomId)}/conversation`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientRequestId, body }),
    }).then(async (response) => ({ status: response.status, payload: await response.json() }));
    return Promise.all([request(), request()]);
  }, { roomId: target.roomId, clientRequestId: raceRequestID, body: retryBody });
  assert(raceResults.every((result) => result.payload?.ok === true), `Concurrent retry did not converge: ${JSON.stringify(raceResults)}`);
  assert.equal(new Set(raceResults.map((result) => result.payload.message?.id)).size, 1, "Concurrent retry returned different message identities.");

  await refresh(clientPage);
  await clientPage.getByText(retryBody, { exact: true }).waitFor({ timeout: 20_000 });

  const clientReply = messageArticle(clientPage, replyBody);
  await clientReply.getByRole("button", { name: "Remove", exact: true }).click();
  await clientReply.getByRole("button", { name: "Remove", exact: true }).click();
  await clientPage.getByText("Message removed", { exact: true }).last().waitFor({ timeout: 20_000 });
  await refresh(coachPage);
  await coachPage.locator("article").filter({ hasText: "Message removed" }).waitFor({ timeout: 20_000 });

  const opaqueRoomCandidates = await prisma.callRoom.findMany({
    where: { id: { not: target.roomId } },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true },
  });
  const coachAccessActor = {
    id: target.identities.coach.userId,
    primaryEmail: target.identities.coach.email,
    isStaff: false,
  };
  const clientAccessActor = {
    id: target.identities.client.userId,
    primaryEmail: target.identities.client.email,
    isStaff: false,
  };
  let unrelatedRoom = null;
  for (const candidate of opaqueRoomCandidates) {
    const [coachAccess, clientAccess] = await Promise.all([
      prisma.callRoom.findFirst({
        where: { id: candidate.id, ...sessionConversationActorAccessWhere(coachAccessActor) },
        select: { id: true },
      }),
      prisma.callRoom.findFirst({
        where: { id: candidate.id, ...sessionConversationActorAccessWhere(clientAccessActor) },
        select: { id: true },
      }),
    ]);
    if (!coachAccess && !clientAccess) {
      unrelatedRoom = candidate;
      break;
    }
  }
  assert(unrelatedRoom?.id, "No unrelated retained room was available for direct-route isolation proof.");
  const isolation = await clientPage.evaluate(async (roomId) => {
    const response = await fetch(`/api/sessions/${encodeURIComponent(roomId)}/conversation`, { cache: "no-store" });
    return { status: response.status, payload: await response.json() };
  }, unrelatedRoom.id);
  assert.equal(isolation.status, 404);
  assert.equal(isolation.payload?.code, "NOT_FOUND");
  assert.equal("messages" in isolation.payload, false, "Unauthorized response exposed a message collection.");

  const [canonicalMessages, revisions, cursors] = await Promise.all([
    prisma.sessionConversationMessage.findMany({
      where: { roomId: target.roomId, body: { in: [correctedBody, replyBody, retryBody] } },
      select: { id: true, body: true, revision: true, deletedAt: true, authorUserId: true },
    }),
    prisma.sessionConversationMessageRevision.findMany({
      where: { message: { roomId: target.roomId, body: { in: [correctedBody, replyBody, retryBody] } } },
      select: { messageId: true, revision: true, operation: true },
    }),
    prisma.sessionConversationReadCursor.findMany({
      where: { roomId: target.roomId, userId: { in: [target.identities.coach.userId, target.identities.client.userId] } },
      select: { userId: true, lastReadMessageId: true, lastReadAt: true },
    }),
  ]);
  assert.equal(canonicalMessages.filter((message) => message.body === retryBody).length, 1, "Retry flight persisted a duplicate message.");
  const corrected = canonicalMessages.find((message) => message.body === correctedBody);
  assert.equal(corrected?.revision, 2);
  const removed = canonicalMessages.find((message) => message.body === replyBody);
  assert.equal(removed?.revision, 2);
  assert(removed?.deletedAt, "Removed message has no durable tombstone.");
  assert(revisions.some((revision) => revision.messageId === corrected.id && revision.operation === "EDITED"));
  assert(revisions.some((revision) => revision.messageId === removed.id && revision.operation === "DELETED"));
  assert.equal(cursors.length, 2, "Both participants did not persist personal read continuity.");

  const receiptPath = path.join(repositoryRoot, "artifacts", "coaching-acceptance", runToken, "session-conversation-receipt.json");
  await mkdir(path.dirname(receiptPath), { recursive: true });
  const receipt = {
    schema: "quipsly-fresh-session-conversation-operation-v1",
    recordedAt: new Date().toISOString(),
    ok: true,
    localOnly: true,
    sourceSha,
    trackedWorktreeCleanAtStart: true,
    roomId: target.roomId,
    coachUserId: target.identities.coach.userId,
    clientUserId: target.identities.client.userId,
    renderedCoachSend: true,
    renderedClientReadback: true,
    renderedReplyRoundTrip: true,
    renderedCorrectionReadback: true,
    renderedRemovalTombstoneReadback: true,
    concurrentRetryConverged: true,
    retryMessageCount: 1,
    immutableRevisionEvidence: true,
    twoPersonalReadCursors: true,
    directUnrelatedRoomDenied: true,
    phoneWidthOverflow: false,
    externalSideEffects: false,
    humanAcceptanceSatisfied: false,
    secretsPrinted: false,
    receiptPath,
  };
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  await chmod(receiptPath, 0o600);
  console.log(JSON.stringify(receipt, null, 2));
} finally {
  await clearRenderedSession(coachPage, baseURL, "fresh coach").catch(() => undefined);
  await clearRenderedSession(clientPage, baseURL, "fresh client").catch(() => undefined);
  await coachContext.close();
  await clientContext.close();
  await browser.close();
  await prisma.$disconnect();
}
