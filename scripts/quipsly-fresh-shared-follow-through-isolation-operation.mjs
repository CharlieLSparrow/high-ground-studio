#!/usr/bin/env node

import assert from "node:assert/strict";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { loadFreshCoachingAcceptanceContext } from "./lib/coaching-acceptance-context.mjs";
import { requireCurrentLocalNestSource } from "./lib/local-nest-source-boundary.mjs";
import { readRetainedQAPassword } from "./lib/retained-qa-keychain.mjs";
import {
  clearRenderedSession,
  loadPlaywright,
  requireLoopbackOrigin,
  signInThroughRenderedLogin,
} from "./lib/retained-qa-browser.mjs";

assert.equal(
  process.env.QUIPSLY_FRESH_SHARED_FOLLOW_THROUGH_ISOLATION_OPERATION,
  "1",
  "Set QUIPSLY_FRESH_SHARED_FOLLOW_THROUGH_ISOLATION_OPERATION=1 to operate shared follow-through isolation.",
);

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const baseURL = requireLoopbackOrigin(
  process.env.QUIPSLY_LOCAL_BASE_URL || "http://127.0.0.1:3012",
  "Shared follow-through isolation base URL",
);
const { sourceSha } = await requireCurrentLocalNestSource({ repositoryRoot, baseURL });
const target = await loadFreshCoachingAcceptanceContext({ baseURL });
assert(target, "Shared follow-through isolation requires an exact fresh coaching context.");
const neighborContextPath = process.env.QUIPSLY_COACHING_ACCEPTANCE_NEIGHBOR_CONTEXT;
assert(
  neighborContextPath,
  "Shared follow-through isolation requires a separately created neighboring coaching context.",
);
const neighbor = await loadFreshCoachingAcceptanceContext({
  baseURL,
  env: {
    ...process.env,
    QUIPSLY_COACHING_ACCEPTANCE_CONTEXT: neighborContextPath,
  },
});
assert(neighbor, "The neighboring coaching context is unavailable.");
assert.notEqual(neighbor.roomId, target.roomId);
const runToken = path.basename(path.dirname(target.contextPath));

const databaseURL = new URL(
  process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio",
);
assert(
  ["postgres:", "postgresql:"].includes(databaseURL.protocol)
    && ["127.0.0.1", "localhost", "[::1]"].includes(databaseURL.hostname),
  "Shared follow-through isolation refuses non-loopback PostgreSQL.",
);
process.env.DATABASE_URL = databaseURL.toString();
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "127.0.0.1:9099";

const { getPrismaClient } = await import("../apps/quipsly/src/lib/prisma.ts");
const prisma = getPrismaClient();
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: true });
const coachContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
const clientContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
const neighborContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
const coachPage = await coachContext.newPage();
const clientPage = await clientContext.newPage();
const neighborPage = await neighborContext.newPage();
const followThroughPath = `/sessions/${encodeURIComponent(target.roomId)}?mode=transcript`;

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function sourceIsPacketFor(note, packetBuildId) {
  const source = record(note.sourceJson);
  return source.source === "transcript-packet-builder"
    && source.packetBuildId === packetBuildId;
}

async function signIn(page, acceptanceContext, identity, callbackPath = followThroughPath) {
  const password = readRetainedQAPassword({
    service: acceptanceContext.keychainService,
    account: identity.email,
  });
  assert(password, `Fresh ${identity.role} Keychain password is unavailable.`);
  await signInThroughRenderedLogin({ page, baseURL, identity, password, callbackPath });
}

async function readPacket(page) {
  return page.evaluate(async (roomId) => {
    const response = await fetch(
      `/api/mobile/capture/transcripts/packet?callRoomId=${encodeURIComponent(roomId)}`,
      { cache: "no-store" },
    );
    return { status: response.status, payload: await response.json() };
  }, target.roomId);
}

async function waitForRendered(page, locator, label, context = {}) {
  try {
    await locator.scrollIntoViewIfNeeded({ timeout: 30_000 });
    await locator.waitFor({ timeout: 30_000 });
  } catch (error) {
    const body = await page.locator("body").innerText().catch(() => "");
    const diagnostic = {
      label,
      url: page.url(),
      title: await page.title().catch(() => ""),
      context,
      visibleText: body.slice(0, 2_000),
    };
    throw new Error(`Rendered follow-through checkpoint failed: ${JSON.stringify(diagnostic)}`, {
      cause: error,
    });
  }
}

async function loadSharedFollowThrough() {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const summary = await prisma.coachingNote.findFirst({
      where: {
        roomId: target.roomId,
        authorUserId: target.identities.coach.userId,
        visibility: "SESSION_SHARED",
        kind: "SUMMARY",
        sourceJson: { path: ["source"], equals: "transcript-packet-builder" },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      select: { id: true, kind: true, title: true, body: true, sourceJson: true },
    });
    const source = record(summary?.sourceJson);
    const packetBuildId = String(source.packetBuildId || "");
    const transcriptJobId = String(source.transcriptJobId || "");
    if (summary?.id && packetBuildId && transcriptJobId) {
      const notes = await prisma.coachingNote.findMany({
        where: {
          roomId: target.roomId,
          authorUserId: target.identities.coach.userId,
          visibility: "SESSION_SHARED",
          sourceJson: { path: ["source"], equals: "transcript-packet-builder" },
        },
        orderBy: [{ kind: "asc" }, { createdAt: "asc" }],
        select: { id: true, kind: true, title: true, body: true, sourceJson: true },
      });
      const packetNotes = notes.filter((note) => sourceIsPacketFor(note, packetBuildId));
      const highlights = packetNotes.filter((note) => note.kind === "HIGHLIGHT");
      const acceptedTasks = await prisma.actionItem.findMany({
        where: {
          roomId: target.roomId,
          noteId: summary.id,
          sourceJson: { path: ["origin"], equals: "quipsly-session-follow-through" },
        },
        orderBy: { createdAt: "asc" },
        select: { id: true, title: true, detail: true, assignedUserId: true },
      });
      if (highlights.length > 0 && acceptedTasks.length > 0) {
        return { packetBuildId, transcriptJobId, summary, packetNotes, highlights, acceptedTasks };
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Shared editable transcript follow-through did not become available within 90 seconds.");
}

let createdPrivateNoteID = null;
try {
  const { packetBuildId, transcriptJobId, summary, packetNotes, highlights, acceptedTasks } = await loadSharedFollowThrough();
  const transcript = await prisma.transcriptJob.findUnique({
    where: { id: transcriptJobId },
    select: { id: true, status: true },
  });
  assert.equal(transcript?.status, "COMPLETED", "Shared follow-through must remain bound to a completed transcript.");
  assert(
    acceptedTasks.every((task) => !task.assignedUserId || [
      target.identities.coach.userId,
      target.identities.client.userId,
    ].includes(task.assignedUserId)),
    "Shared follow-through includes a task assigned outside the coaching relationship.",
  );
  const expectedTaskTitle = process.env.QUIPSLY_EXPECTED_SHARED_TASK_TITLE?.trim();
  if (expectedTaskTitle) {
    assert(
      acceptedTasks.some((task) => task.title === expectedTaskTitle),
      `Expected shared task was not created: ${expectedTaskTitle}`,
    );
  }
  let privateNote = await prisma.coachingNote.findFirst({
    where: { roomId: target.roomId, visibility: "AUTHOR_PRIVATE" },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    select: { id: true, title: true, body: true, authorUserId: true },
  });
  if (!privateNote) {
    privateNote = await prisma.coachingNote.create({
      data: {
        roomId: target.roomId,
        engagementId: target.engagementId,
        authorUserId: target.identities.coach.userId,
        kind: "SESSION_NOTE",
        visibility: "AUTHOR_PRIVATE",
        title: `Private isolation check ${runToken}`,
        body: "Local acceptance-only private note.",
        sourceJson: {
          source: "quipsly-local-acceptance-negative-control",
          runToken,
          externalSideEffects: false,
        },
      },
      select: { id: true, title: true, body: true, authorUserId: true },
    });
    createdPrivateNoteID = privateNote.id;
  }
  assert(privateNote?.id, "The fresh Session needs one private-note negative control.");
  const baseline = {
    noteCount: packetNotes.length,
    taskCount: acceptedTasks.length,
    deliveryCount: await prisma.deliveryEvent.count(),
    calendarLinkCount: await prisma.calendarEventLink.count(),
  };

  await Promise.all([
    signIn(coachPage, target, target.identities.coach),
    signIn(clientPage, target, target.identities.client),
    signIn(neighborPage, neighbor, neighbor.identities.coach, "/coaching"),
  ]);
  const [coachRead, clientRead, neighborRead] = await Promise.all([
    readPacket(coachPage),
    readPacket(clientPage),
    readPacket(neighborPage),
  ]);
  await Promise.all([
    coachPage.getByText("Session results and status", { exact: true }).click(),
    clientPage.getByText("Session results and status", { exact: true }).click(),
  ]);
  const renderedFollowThrough = { name: "Follow-through is ready" };
  await waitForRendered(
    coachPage,
    coachPage.getByRole("heading", renderedFollowThrough),
    "coach follow-through",
    {
      status: coachRead.status,
      packetStatus: coachRead.payload?.packet?.status,
      reviewAccess: coachRead.payload?.packet?.reviewAccess,
      summaryID: coachRead.payload?.packet?.summary?.id,
      resultTaskCount: coachRead.payload?.packet?.results?.tasks?.length ?? null,
      actionItemCount: coachRead.payload?.packet?.actionItems?.length ?? null,
    },
  );
  await waitForRendered(
    clientPage,
    clientPage.getByText(
      "Shared Session notes, tasks, and goals are ready to use.",
      { exact: true },
    ),
    "client shared follow-up",
  );

  assert.equal(coachRead.status, 200);
  assert.equal(coachRead.payload?.ok, true);
  assert.equal(coachRead.payload?.packet?.summary?.id, summary.id);
  assert.deepEqual(
    new Set(coachRead.payload?.packet?.highlights?.map((item) => item.id)),
    new Set(highlights.map((item) => item.id)),
  );
  assert.deepEqual(
    new Set(coachRead.payload?.packet?.actionItems?.map((item) => item.id)),
    new Set(acceptedTasks.map((item) => item.id)),
  );

  assert.equal(clientRead.status, 200, "The authorized client lost ordinary Session access.");
  assert.equal(clientRead.payload?.ok, true);
  assert.equal(clientRead.payload?.room?.id, target.roomId);
  assert.equal(clientRead.payload?.packet?.summary?.id, summary.id);
  assert.deepEqual(
    new Set(clientRead.payload?.packet?.highlights?.map((item) => item.id)),
    new Set(highlights.map((item) => item.id)),
  );
  assert.deepEqual(
    new Set(clientRead.payload?.packet?.actionItems?.map((item) => item.id)),
    new Set(acceptedTasks.map((item) => item.id)),
  );
  assert.deepEqual(clientRead.payload?.packet?.noteCandidates, []);
  assert.deepEqual(clientRead.payload?.packet?.actionCandidates, []);
  assert.deepEqual(clientRead.payload?.packet?.goalCandidates, []);
  assert.equal(neighborRead.status, 404, "A neighboring coach read another relationship's follow-through.");
  const neighborPacketText = JSON.stringify(neighborRead.payload ?? {});
  for (const sharedID of [summary.id, ...highlights.map((item) => item.id), ...acceptedTasks.map((item) => item.id)]) {
    assert.equal(neighborPacketText.includes(sharedID), false, `Neighbor response exposed shared-work ID ${sharedID}.`);
  }
  const otherParticipantPage = privateNote.authorUserId === target.identities.coach.userId
    ? clientPage
    : coachPage;
  const otherParticipantPacket = privateNote.authorUserId === target.identities.coach.userId
    ? clientRead.payload
    : coachRead.payload;
  assert.equal(
    JSON.stringify(otherParticipantPacket ?? {}).includes(privateNote.id),
    false,
    "Another participant's packet exposed a private-note ID.",
  );
  if (privateNote.title) assert.equal(
    await otherParticipantPage.getByText(privateNote.title, { exact: true }).count(),
    0,
    "Another participant's rendered Session exposed a private note.",
  );

  const after = {
    noteCount: await prisma.coachingNote.count({ where: { id: { in: packetNotes.map((note) => note.id) } } }),
    taskCount: await prisma.actionItem.count({ where: { id: { in: acceptedTasks.map((task) => task.id) } } }),
    deliveryCount: await prisma.deliveryEvent.count(),
    calendarLinkCount: await prisma.calendarEventLink.count(),
  };
  assert.deepEqual(after, baseline, "Read-only isolation proof changed packet, work, delivery, or calendar state.");

  const receiptPath = path.join(
    repositoryRoot,
    "artifacts",
    "coaching-acceptance",
    runToken,
    "shared-follow-through-isolation-receipt.json",
  );
  await mkdir(path.dirname(receiptPath), { recursive: true });
  const receipt = {
    schema: "quipsly-fresh-shared-follow-through-isolation-operation-v1",
    recordedAt: new Date().toISOString(),
    ok: true,
    localOnly: true,
    sourceSha,
    runtimeSourceCurrent: true,
    roomId: target.roomId,
    transcriptJobId: transcript.id,
    packetBuildId,
    coachUserId: target.identities.coach.userId,
    clientUserId: target.identities.client.userId,
    packetSummaryId: summary.id,
    sharedHighlightCount: highlights.length,
    sharedTaskCount: acceptedTasks.length,
    expectedSharedTaskTitle: expectedTaskTitle || null,
    coachPositiveDirectRead: true,
    coachPositiveRenderedRead: true,
    clientPositiveDirectRead: true,
    clientPositiveRenderedRead: true,
    sharedSummaryAndHighlightsVisibleToBoth: true,
    sharedTasksVisibleToBoth: true,
    optionalCandidatesAbsent: true,
    unrelatedCoachDirectReadDenied: true,
    participantPrivateNoteBoundaryPreserved: true,
    packetStateUnchanged: true,
    canonicalWorkUnchanged: true,
    deliveryStateUnchanged: true,
    calendarStateUnchanged: true,
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
  await clearRenderedSession(neighborPage, baseURL, "neighbor coach").catch(() => undefined);
  await coachContext.close();
  await clientContext.close();
  await neighborContext.close();
  await browser.close();
  if (createdPrivateNoteID) {
    await prisma.coachingNote.deleteMany({
      where: {
        id: createdPrivateNoteID,
        sourceJson: { path: ["source"], equals: "quipsly-local-acceptance-negative-control" },
      },
    }).catch(() => undefined);
  }
  await prisma.$disconnect();
}
