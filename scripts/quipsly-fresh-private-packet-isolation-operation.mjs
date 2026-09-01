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
  process.env.QUIPSLY_FRESH_PRIVATE_PACKET_ISOLATION_OPERATION,
  "1",
  "Set QUIPSLY_FRESH_PRIVATE_PACKET_ISOLATION_OPERATION=1 to operate private packet isolation.",
);

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const baseURL = requireLoopbackOrigin(
  process.env.QUIPSLY_LOCAL_BASE_URL || "http://127.0.0.1:3012",
  "Private packet isolation base URL",
);
const { sourceSha } = await requireCurrentLocalNestSource({ repositoryRoot, baseURL });
const target = await loadFreshCoachingAcceptanceContext({ baseURL });
assert(target, "Private packet isolation requires an exact fresh coaching context.");
const runToken = path.basename(path.dirname(target.contextPath));

const databaseURL = new URL(
  process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio",
);
assert(
  ["postgres:", "postgresql:"].includes(databaseURL.protocol)
    && ["127.0.0.1", "localhost", "[::1]"].includes(databaseURL.hostname),
  "Private packet isolation refuses non-loopback PostgreSQL.",
);
process.env.DATABASE_URL = databaseURL.toString();
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "127.0.0.1:9099";

const { getPrismaClient } = await import("../apps/quipsly/src/lib/prisma.ts");
const prisma = getPrismaClient();
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: true });
const coachContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
const clientContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
const coachPage = await coachContext.newPage();
const clientPage = await clientContext.newPage();
const transcriptPath = `/sessions/${encodeURIComponent(target.roomId)}?mode=transcript`;

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function sourceIsPacketFor(note, transcriptJobId) {
  const source = record(note.sourceJson);
  return source.source === "transcript-packet-builder"
    && source.transcriptJobId === transcriptJobId;
}

async function signIn(page, identity) {
  const password = readRetainedQAPassword({
    service: target.keychainService,
    account: identity.email,
  });
  assert(password, `Fresh ${identity.role} Keychain password is unavailable.`);
  await signInThroughRenderedLogin({ page, baseURL, identity, password, callbackPath: transcriptPath });
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

try {
  const transcript = await prisma.transcriptJob.findFirst({
    where: { roomId: target.roomId, status: "COMPLETED" },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  assert(transcript?.id, "Private packet isolation requires a completed transcript.");
  const notes = await prisma.coachingNote.findMany({
    where: {
      roomId: target.roomId,
      authorUserId: target.identities.coach.userId,
      visibility: "AUTHOR_PRIVATE",
    },
    orderBy: [{ kind: "asc" }, { createdAt: "asc" }],
    select: { id: true, kind: true, title: true, body: true, sourceJson: true },
  });
  const packetNotes = notes.filter((note) => sourceIsPacketFor(note, transcript.id));
  const summary = packetNotes.find((note) => note.kind === "SUMMARY");
  const highlights = packetNotes.filter((note) => note.kind === "HIGHLIGHT");
  assert(summary?.id, "Coach-private transcript summary is missing.");
  assert(highlights.length > 0, "Coach-private transcript highlights are missing.");

  const acceptedTasks = await prisma.actionItem.findMany({
    where: {
      roomId: target.roomId,
      noteId: summary.id,
      sourceJson: { path: ["source"], equals: "transcript-packet-builder" },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, title: true, detail: true, assignedUserId: true },
  });
  assert(acceptedTasks.length > 0, "Private packet isolation requires one reviewed canonical task.");
  assert(
    acceptedTasks.every((task) => !task.assignedUserId || task.assignedUserId === target.identities.coach.userId),
    "The retained packet includes a task assigned to an unexpected actor.",
  );
  const baseline = {
    noteCount: packetNotes.length,
    taskCount: acceptedTasks.length,
    deliveryCount: await prisma.deliveryEvent.count(),
    calendarLinkCount: await prisma.calendarEventLink.count(),
  };

  await Promise.all([
    signIn(coachPage, target.identities.coach),
    signIn(clientPage, target.identities.client),
  ]);
  await coachPage.getByText(summary.title, { exact: true }).waitFor({ timeout: 30_000 });

  const [coachRead, clientRead] = await Promise.all([
    readPacket(coachPage),
    readPacket(clientPage),
  ]);
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
  assert.equal(clientRead.payload?.packet?.summary, null);
  assert.deepEqual(clientRead.payload?.packet?.highlights, []);
  assert.deepEqual(clientRead.payload?.packet?.noteCandidates, []);
  assert.deepEqual(clientRead.payload?.packet?.actionCandidates, []);
  assert.deepEqual(clientRead.payload?.packet?.goalCandidates, []);
  const clientPacketText = JSON.stringify(clientRead.payload?.packet ?? {});
  const privateIDs = [
    summary.id,
    ...highlights.map((item) => item.id),
    ...acceptedTasks.map((item) => item.id),
  ];
  for (const privateID of privateIDs) {
    assert.equal(clientPacketText.includes(privateID), false, `Client packet exposed private ID ${privateID}.`);
  }
  assert.equal(
    await clientPage.getByText(summary.title, { exact: true }).count(),
    0,
    "Rendered client Session exposed the coach-private summary title.",
  );
  for (const task of acceptedTasks) {
    assert.equal(
      await clientPage.getByText(task.title, { exact: true }).count(),
      0,
      `Rendered client Session exposed private task ${task.id}.`,
    );
  }

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
    "private-packet-isolation-receipt.json",
  );
  await mkdir(path.dirname(receiptPath), { recursive: true });
  const receipt = {
    schema: "quipsly-fresh-private-packet-isolation-operation-v1",
    recordedAt: new Date().toISOString(),
    ok: true,
    localOnly: true,
    sourceSha,
    runtimeSourceCurrent: true,
    roomId: target.roomId,
    transcriptJobId: transcript.id,
    coachUserId: target.identities.coach.userId,
    clientUserId: target.identities.client.userId,
    packetSummaryId: summary.id,
    privateHighlightCount: highlights.length,
    privateAcceptedTaskCount: acceptedTasks.length,
    coachPositiveDirectRead: true,
    coachPositiveRenderedRead: true,
    authorizedClientRetainedSessionAccess: true,
    clientPrivateSummaryDenied: true,
    clientPrivateHighlightsDenied: true,
    clientPrivateCandidatesDenied: true,
    clientPrivateAcceptedTasksDenied: true,
    clientRenderedPrivateMarkersDenied: true,
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
  await coachContext.close();
  await clientContext.close();
  await browser.close();
  await prisma.$disconnect();
}
