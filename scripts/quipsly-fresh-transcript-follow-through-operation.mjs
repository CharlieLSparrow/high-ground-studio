#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { loadFreshCoachingAcceptanceContext } from "./lib/coaching-acceptance-context.mjs";

assert.equal(
  process.env.QUIPSLY_FRESH_TRANSCRIPT_FOLLOW_THROUGH_OPERATION,
  "1",
  "Set QUIPSLY_FRESH_TRANSCRIPT_FOLLOW_THROUGH_OPERATION=1 to operate fresh automatic follow-through.",
);

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const trackedStatus = execFileSync("git", ["status", "--short", "--untracked-files=no"], {
  cwd: repositoryRoot,
  encoding: "utf8",
}).trim();
assert.equal(trackedStatus, "", "Fresh automatic follow-through requires a clean tracked worktree.");
const sourceSha = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: repositoryRoot,
  encoding: "utf8",
}).trim();

const baseURL = new URL(process.env.QUIPSLY_LOCAL_BASE_URL || "http://127.0.0.1:3012");
assert(
  ["127.0.0.1", "localhost", "[::1]"].includes(baseURL.hostname),
  "Fresh automatic follow-through refuses a non-loopback Nest origin.",
);
const freshContext = await loadFreshCoachingAcceptanceContext({ baseURL: baseURL.origin });
assert(freshContext, "Fresh automatic follow-through requires an exact private context.");
const runToken = path.basename(path.dirname(freshContext.contextPath));
assert.match(runToken, /^[a-z0-9_-]{4,80}$/i, "Fresh automatic follow-through context folder is unsafe.");

const databaseURL = new URL(
  process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio",
);
assert(
  ["postgres:", "postgresql:"].includes(databaseURL.protocol)
    && ["127.0.0.1", "localhost", "[::1]"].includes(databaseURL.hostname),
  "Fresh automatic follow-through refuses non-loopback PostgreSQL.",
);
process.env.DATABASE_URL = databaseURL.toString();

const [{ getPrismaClient }, { reconcileCaptureTranscriptFollowThrough }] = await Promise.all([
  import("../apps/quipsly/src/lib/prisma.ts"),
  import("../apps/quipsly/src/lib/server/capture-transcript-follow-through.ts"),
]);
const prisma = getPrismaClient();

try {
  const room = await prisma.callRoom.findUnique({
    where: { id: freshContext.roomId },
    select: {
      id: true,
      booking: { select: { coachUserId: true } },
    },
  });
  assert.equal(room?.booking?.coachUserId, freshContext.identities.coach.userId);
  const transcript = await prisma.transcriptJob.findFirst({
    where: { roomId: room.id, status: "COMPLETED" },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  assert(transcript?.id, "Fresh automatic follow-through requires a completed transcript.");

  const packetWhere = {
    roomId: room.id,
    authorUserId: room.booking.coachUserId,
    kind: "SUMMARY",
    sourceJson: { path: ["transcriptJobId"], equals: transcript.id },
  };
  const highlightWhere = {
    roomId: room.id,
    authorUserId: room.booking.coachUserId,
    kind: "HIGHLIGHT",
    sourceJson: { path: ["transcriptJobId"], equals: transcript.id },
  };
  const before = await snapshot({ prisma, roomId: room.id, packetWhere, highlightWhere });
  assert.equal(before.summaryCount, 1, "The exact fresh transcript should already have one shared recap.");

  const results = await Promise.all([
    reconcileCaptureTranscriptFollowThrough({ prisma, transcriptJobId: transcript.id }),
    reconcileCaptureTranscriptFollowThrough({ prisma, transcriptJobId: transcript.id }),
  ]);
  assert(results.every((result) => result.packetStatus === "ready"));
  assert.equal(results[0]?.packetBuildId, results[1]?.packetBuildId);

  const after = await snapshot({ prisma, roomId: room.id, packetWhere, highlightWhere });
  assert.equal(after.summaryCount, before.summaryCount, "Concurrent reconciliation duplicated the shared recap.");
  assert.equal(after.highlightCount, before.highlightCount, "Concurrent reconciliation duplicated shared highlights.");
  assert.equal(after.actionItemCount, before.actionItemCount, "Automatic follow-through created or changed canonical tasks.");
  assert.equal(after.deliveryCount, before.deliveryCount, "Automatic follow-through changed delivery state.");
  assert.equal(after.calendarLinkCount, before.calendarLinkCount, "Automatic follow-through changed calendar state.");

  const persisted = await prisma.transcriptJob.findUnique({
    where: { id: transcript.id },
    select: { resultJson: true },
  });
  const resultJson = record(persisted?.resultJson);
  const followThrough = record(resultJson.followThrough);
  assert.equal(followThrough.packetStatus, "ready");
  assert.equal(followThrough.packetBuildId, results[0]?.packetBuildId);
  assert.equal(followThrough.candidateOnly, false);
  assert.equal(followThrough.authorPrivate, false);
  assert.equal(followThrough.automaticAssignment, true);
  assert.equal(followThrough.automaticSharing, true);
  assert.equal(followThrough.externalSideEffects, false);

  const stillNeedsMaintenance = await prisma.transcriptJob.findFirst({
    where: {
      id: transcript.id,
      status: "COMPLETED",
      NOT: { resultJson: { path: ["followThrough", "packetStatus"], equals: "ready" } },
    },
    select: { id: true },
  });
  assert.equal(stillNeedsMaintenance, null, "Ready follow-through remained eligible for scheduler rebuilding.");

  const receiptPath = path.join(
    repositoryRoot,
    "artifacts",
    "coaching-acceptance",
    runToken,
    "automatic-follow-through-receipt.json",
  );
  await mkdir(path.dirname(receiptPath), { recursive: true });
  const receipt = {
    schema: "quipsly-fresh-transcript-follow-through-operation-v1",
    recordedAt: new Date().toISOString(),
    ok: true,
    localOnly: true,
    sourceSha,
    trackedWorktreeCleanAtStart: true,
    roomId: room.id,
    transcriptJobId: transcript.id,
    authorUserId: room.booking.coachUserId,
    packetBuildId: results[0]?.packetBuildId || null,
    concurrentReconciliationSerialized: true,
    sharedRecapCount: after.summaryCount,
    sharedHighlightCount: after.highlightCount,
    canonicalTaskCountUnchanged: true,
    deliveryCountUnchanged: true,
    calendarLinkCountUnchanged: true,
    schedulerReadyMarkerProven: true,
    schedulerRebuildExcluded: true,
    candidateOnly: false,
    authorPrivate: false,
    automaticAssignment: true,
    automaticSharing: true,
    externalSideEffects: false,
    humanAcceptanceSatisfied: false,
    secretsPrinted: false,
    receiptPath,
  };
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  await chmod(receiptPath, 0o600);
  console.log(JSON.stringify(receipt, null, 2));
} finally {
  await prisma.$disconnect();
}

async function snapshot({ prisma, roomId, packetWhere, highlightWhere }) {
  const [summaryCount, highlightCount, actionItemCount, deliveryCount, calendarLinkCount] = await Promise.all([
    prisma.coachingNote.count({ where: packetWhere }),
    prisma.coachingNote.count({ where: highlightWhere }),
    prisma.actionItem.count({ where: { roomId } }),
    prisma.deliveryEvent.count(),
    prisma.calendarEventLink.count(),
  ]);
  return { summaryCount, highlightCount, actionItemCount, deliveryCount, calendarLinkCount };
}

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
