#!/usr/bin/env node

import { randomBytes, randomUUID } from "node:crypto";
import { chmod, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readRetainedQAPassword } from "./lib/retained-qa-keychain.mjs";
import {
  cloneRetainedFixture,
  COACH_EMAIL,
  KEYCHAIN_SERVICE,
} from "./quipsly-retained-native-reviewed-packet-materialization-operation.mjs";

const requireFromQuipsly = createRequire(new URL("../apps/quipsly/package.json", import.meta.url));
const { PrismaClient } = requireFromQuipsly("@prisma/client");
const { PrismaPg } = requireFromQuipsly("@prisma/adapter-pg");
const REPO_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const RUNNER = path.join(REPO_ROOT, "apps/mobile-capture/HighGroundCapture/scripts/run-capture-runtime-ui-smoke.sh");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function loopbackHost(value) {
  return ["localhost", "127.0.0.1", "[::1]"].includes(value);
}

function requireLoopbackOrigin(value) {
  const url = new URL(String(value || ""));
  assert(url.protocol === "http:" && loopbackHost(url.hostname) && !url.username && !url.password,
    "Task-evidence merge operation requires a credential-free loopback Nest origin.");
  return url.origin;
}

function requireLocalDatabase(value) {
  const url = new URL(String(value || ""));
  assert(["postgres:", "postgresql:"].includes(url.protocol) && loopbackHost(url.hostname) && url.pathname !== "/",
    "Task-evidence merge operation requires an explicit loopback PostgreSQL database.");
  return url.toString();
}

async function authenticate(password) {
  const authOrigin = requireLoopbackOrigin(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099"}`);
  const response = await fetch(`${authOrigin}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: COACH_EMAIL, password, returnSecureToken: true }),
  });
  const payload = await response.json().catch(() => null);
  assert(response.status === 200 && typeof payload?.idToken === "string",
    "The retained coach could not authenticate with the local Firebase emulator.");
  return payload.idToken;
}

async function requestJson(url, { idToken, method = "GET", body } = {}) {
  const attempts = method === "GET" ? 5 : 1;
  let response;
  let lastNetworkError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      response = await fetch(url, {
        method,
        headers: {
          authorization: `Bearer ${idToken}`,
          "cache-control": "no-cache",
          ...(body ? { "content-type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      break;
    } catch (error) {
      lastNetworkError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 400));
    }
  }
  if (!response) throw lastNetworkError;
  const payload = await response.json().catch(() => null);
  assert(response.ok && payload?.ok === true,
    `${method} ${new URL(url).pathname} failed with HTTP ${response.status}: ${payload?.errorCode || payload?.error || "unknown error"}`);
  return payload;
}

async function readPacket(baseURL, idToken, roomID) {
  const url = new URL("/api/mobile/capture/transcripts/packet", baseURL);
  url.searchParams.set("callRoomId", roomID);
  return requestJson(url, { idToken });
}

function chooseActionCandidate(packetBody, sourceText) {
  const candidates = Array.isArray(packetBody?.packet?.actionCandidates)
    ? packetBody.packet.actionCandidates
    : [];
  const candidate = sourceText
    ? candidates.find((item) => item?.sourceText === sourceText)
    : candidates.find((item) => item?.segmentId && item?.title);
  assert(candidate, "The deterministic packet did not contain a transcript-backed task candidate.");
  const segmentIDs = Array.isArray(candidate.segmentIds) && candidate.segmentIds.length
    ? candidate.segmentIds
    : [candidate.segmentId];
  assert(segmentIDs.every(Boolean), "The task candidate lost its immutable transcript segment identity.");
  return { candidate, segmentIDs };
}

function taskDefinition(task) {
  return {
    id: task.id,
    roomId: task.roomId,
    projectId: task.projectId,
    assignedUserId: task.assignedUserId,
    title: task.title,
    detail: task.detail,
    status: task.status,
    dueAt: task.dueAt?.toISOString?.() || null,
    completedAt: task.completedAt?.toISOString?.() || null,
    updatedAt: task.updatedAt?.toISOString?.() || null,
    tagIds: (task.tagLinks || []).map((link) => link.tagId).sort(),
    goalLinks: (task.goalLinks || []).map((link) => ({ goalId: link.goalId, relationship: link.relationship }))
      .sort((left, right) => left.goalId.localeCompare(right.goalId)),
    reminder: task.reminder ? {
      id: task.reminder.id,
      remindAt: task.reminder.remindAt.toISOString(),
      status: task.reminder.status,
      updatedAt: task.reminder.updatedAt.toISOString(),
    } : null,
    recurrence: task.recurrenceOccurrence ? {
      id: task.recurrenceOccurrence.id,
      seriesId: task.recurrenceOccurrence.seriesId,
      occurrenceKey: task.recurrenceOccurrence.occurrenceKey,
      scheduledLocalDate: task.recurrenceOccurrence.scheduledLocalDate,
      scheduledFor: task.recurrenceOccurrence.scheduledFor.toISOString(),
      status: task.recurrenceOccurrence.status,
      seriesStatus: task.recurrenceOccurrence.series.status,
      seriesUpdatedAt: task.recurrenceOccurrence.series.updatedAt.toISOString(),
    } : null,
  };
}

async function readTask(prisma, id) {
  return prisma.actionItem.findUnique({
    where: { id },
    include: {
      tagLinks: true,
      goalLinks: true,
      reminder: true,
      recurrenceOccurrence: { include: { series: true } },
      evidenceReceipts: { orderBy: [{ occurredAt: "asc" }, { id: "asc" }] },
    },
  });
}

async function main() {
  assert(process.env.QUIPSLY_RETAINED_PACKET_TASK_EVIDENCE_MERGE_OPERATION === "1",
    "Set QUIPSLY_RETAINED_PACKET_TASK_EVIDENCE_MERGE_OPERATION=1 to authorize retained local test artifacts.");
  const baseURL = requireLoopbackOrigin(process.env.QUIPSLY_RETAINED_COACHING_BASE_URL || "http://127.0.0.1:3012");
  const databaseURL = requireLocalDatabase(process.env.DATABASE_URL || "");
  const password = readRetainedQAPassword({ service: KEYCHAIN_SERVICE, account: COACH_EMAIL });
  assert(password, "The retained coach has no Keychain password.");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseURL, max: 2 }), log: ["error"] });

  try {
    const fixture = await cloneRetainedFixture(prisma);
    const idToken = await authenticate(password);
    const stamp = `${Date.now()}-${randomBytes(3).toString("hex")}`;
    const taskID = `qa-task-evidence-${stamp}`;
    const goalID = `qa-task-evidence-goal-${stamp}`;
    const reminderID = `qa-task-evidence-reminder-${stamp}`;
    const recurrenceID = `qa-task-evidence-series-${stamp}`;
    const occurrenceID = `qa-task-evidence-occurrence-${stamp}`;
    const taskTitle = `Retained evidence task · ${stamp}`;
    const taskDetail = "Keep every canonical task control stable while reviewed evidence accumulates.";
    const now = new Date();
    // Keep this retained operation in the actual Today contract. A task due a
    // week from now can be correctly omitted once a busy test account exceeds
    // the bounded 20-task Today projection.
    const dueAt = new Date(now.getTime() + 18 * 3_600_000);
    const remindAt = new Date(now.getTime() + 12 * 3_600_000);
    const scheduledLocalDate = dueAt.toISOString().slice(0, 10);
    const project = await prisma.callRoom.findUnique({ where: { id: fixture.roomID }, select: { projectId: true } });
    const tag = project?.projectId ? await prisma.studioTag.findFirst({
      where: { projectId: project.projectId, isActive: true, mergedIntoTagId: null },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    }) : null;
    assert(project?.projectId, "The retained Session needs a canonical Nest project.");

    await prisma.$transaction(async (tx) => {
      await tx.actionItem.create({ data: {
        id: taskID,
        roomId: fixture.roomID,
        projectId: project.projectId,
        assignedUserId: fixture.coachUserID,
        title: taskTitle,
        detail: taskDetail,
        status: "OPEN",
        dueAt,
        sourceJson: { schema: "quipsly-retained-task-evidence-baseline-v1", externalSideEffects: false },
      } });
      if (tag) await tx.actionItemTagLink.create({ data: {
        actionItemId: taskID,
        tagId: tag.id,
        createdByUserId: fixture.coachUserID,
        sourceJson: { source: "retained-task-evidence-baseline", externalSideEffects: false },
      } });
      await tx.taskReminder.create({ data: {
        id: reminderID,
        actionItemId: taskID,
        ownerUserId: fixture.coachUserID,
        remindAt,
        status: "ACTIVE",
        sourceJson: { source: "retained-task-evidence-baseline", notificationScheduled: false },
      } });
      await tx.taskRecurrenceSeries.create({ data: {
        id: recurrenceID,
        ownerUserId: fixture.coachUserID,
        projectId: project.projectId,
        title: taskTitle,
        detail: taskDetail,
        cadence: "FIXED",
        frequency: "WEEKLY",
        interval: 1,
        timezone: "America/Denver",
        localTimeMinutes: 600,
        anchorLocalDate: scheduledLocalDate,
        anchorDayOfMonth: Number(scheduledLocalDate.slice(-2)),
        status: "ACTIVE",
        sourceJson: { source: "retained-task-evidence-baseline", externalSideEffects: false },
      } });
      await tx.taskOccurrence.create({ data: {
        id: occurrenceID,
        seriesId: recurrenceID,
        actionItemId: taskID,
        occurrenceKey: `${scheduledLocalDate}T10:00[America/Denver]`,
        scheduledLocalDate,
        scheduledFor: dueAt,
        status: "MATERIALIZED",
        sourceJson: { source: "retained-task-evidence-baseline", externalSideEffects: false },
      } });
      await tx.goal.create({ data: {
        id: goalID,
        ownerUserId: fixture.coachUserID,
        roomId: fixture.roomID,
        projectId: project.projectId,
        title: `Protect task state · ${stamp}`,
        status: "ACTIVE",
        sourceJson: { source: "retained-task-evidence-baseline", externalSideEffects: false },
      } });
      await tx.goalTaskLink.create({ data: {
        goalId: goalID,
        actionItemId: taskID,
        relationship: "CONTRIBUTES",
        createdByUserId: fixture.coachUserID,
        sourceJson: { source: "retained-task-evidence-baseline", externalSideEffects: false },
      } });
    });

    await requestJson(new URL("/api/mobile/capture/transcripts/packet", baseURL), {
      idToken,
      method: "POST",
      body: { transcriptJobId: fixture.transcriptJobID, force: true },
    });
    const before = await readPacket(baseURL, idToken, fixture.roomID);
    const { candidate: beforeCandidate, segmentIDs } = chooseActionCandidate(before);
    const mergeTarget = before.packet.taskMergeTargets?.find((target) => target.id === taskID);
    assert(mergeTarget?.title === taskTitle && mergeTarget?.status === "OPEN" && mergeTarget?.evidenceCount === 0,
      "The packet did not project the exact actor-owned baseline task.");
    const canonicalBefore = await readTask(prisma, taskID);
    assert(canonicalBefore && canonicalBefore.evidenceReceipts.length === 0,
      "The baseline task must begin without transcript evidence receipts.");
    const definitionBefore = taskDefinition(canonicalBefore);

    const resultBundle = `/private/tmp/quipsly-packet-task-evidence-merge-${Date.now()}-${process.pid}.xcresult`;
    const operation = spawnSync("bash", [RUNNER], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        QUIPSLY_CAPTURE_UI_TEST_MODE: "transcript-packet-task-evidence-merge",
        QUIPSLY_CAPTURE_UI_TEST_BASE_URL: baseURL,
        QUIPSLY_CAPTURE_UI_TEST_EMAIL: COACH_EMAIL,
        QUIPSLY_CAPTURE_UI_TEST_PASSWORD: password,
        QUIPSLY_CAPTURE_UI_TEST_SESSION_ID: fixture.roomID,
        QUIPSLY_CAPTURE_UI_TEST_SESSION_TITLE: fixture.roomTitle,
        QUIPSLY_CAPTURE_UI_TEST_TRANSCRIPT_SEGMENT_IDS: segmentIDs.join(","),
        QUIPSLY_CAPTURE_UI_TEST_EXPECTED_PACKET_TASK_TITLE: beforeCandidate.title,
        QUIPSLY_CAPTURE_UI_TEST_TASK_ID: taskID,
        QUIPSLY_CAPTURE_UI_TEST_TASK_EDIT_SOURCE_TITLE: taskTitle,
        QUIPSLY_CAPTURE_UI_TEST_RECORDING_FIXTURE_PATH: fixture.sourcePath,
        QUIPSLY_CAPTURE_UI_TEST_RECORDING_FIXTURE_LOCAL_ID: randomUUID(),
        QUIPSLY_CAPTURE_UI_TEST_RECORDING_FIXTURE_ASSET_ID: fixture.assetID,
        QUIPSLY_CAPTURE_UI_TEST_RECORDING_FIXTURE_ROOM_ID: fixture.roomID,
        QUIPSLY_CAPTURE_UI_TEST_RECORDING_FIXTURE_PARTICIPANT_ID: fixture.participantID,
        QUIPSLY_CAPTURE_UI_TEST_RECORDING_FIXTURE_CONSENT_ID: fixture.consentID,
        QUIPSLY_CAPTURE_UI_TEST_RECORDING_FIXTURE_OWNER_ACCOUNT_ID: fixture.coachUserID,
        QUIPSLY_CAPTURE_UI_TEST_RECORDING_FIXTURE_SHA256: fixture.sourceSHA256,
        QUIPSLY_CAPTURE_UI_TEST_RECORDING_FIXTURE_TITLE: fixture.roomTitle,
        QUIPSLY_CAPTURE_UI_TEST_RESULT_BUNDLE_PATH: resultBundle,
      },
      stdio: "inherit",
    });
    assert(operation.status === 0, `Compiled Capture task-evidence merge operation failed (exit ${String(operation.status)}).`);

    const after = await readPacket(baseURL, idToken, fixture.roomID);
    const { candidate: afterCandidate } = chooseActionCandidate(after, beforeCandidate.sourceText);
    assert(afterCandidate.reviewStatus === "MERGED_INTO_ACTION_ITEM"
      && afterCandidate.committedActionItemId === taskID
      && afterCandidate.lastHumanReview?.decision === "MERGE",
    "The operated candidate did not return as one terminal evidence merge into the selected task.");
    const canonicalAfter = await readTask(prisma, taskID);
    assert(JSON.stringify(taskDefinition(canonicalAfter)) === JSON.stringify(definitionBefore),
      "Appending evidence changed task identity, content, status, owner, dates, reminder, recurrence, tags, goals, project, or updatedAt.");
    assert(canonicalAfter.evidenceReceipts.length === 1,
      "The merge must append exactly one task evidence receipt.");
    const evidenceReceipt = canonicalAfter.evidenceReceipts[0];
    const evidence = asObject(evidenceReceipt.evidenceJson);
    const source = asObject(evidence.candidateSource);
    assert(evidenceReceipt.kind === "TRANSCRIPT_CANDIDATE_MERGED"
      && evidence.schema === "quipsly-transcript-task-evidence-merge-v1"
      && evidence.actionCandidateId === afterCandidate.id
      && source.roomId === fixture.roomID
      && source.transcriptJobId === fixture.transcriptJobID
      && source.recordingAssetId === fixture.assetID
      && source.segmentId === segmentIDs[0],
    "The append-only receipt lost exact transcript or playback provenance.");

    const packetSummary = await prisma.coachingNote.findFirst({
      where: { id: after.packet.summary.id },
      select: { sourceJson: true },
    });
    const reviewReceipt = asObject(asObject(packetSummary?.sourceJson).lastActionCandidateReview);
    const mergeTargetBefore = asObject(reviewReceipt.mergeTargetBefore);
    const replay = await requestJson(new URL("/api/mobile/capture/transcripts/packet/actions", baseURL), {
      idToken,
      method: "POST",
      body: {
        callRoomId: fixture.roomID,
        transcriptJobId: fixture.transcriptJobID,
        recordingAssetId: fixture.assetID,
        summaryNoteId: after.packet.summary.id,
        packetBuildId: after.packet.build.packetBuildId,
        actionCandidateId: afterCandidate.id,
        decision: "MERGE",
        mergeTargetTaskId: taskID,
        mergeExpectedUpdatedAt: mergeTargetBefore.updatedAt,
      },
    });
    assert(replay.idempotentReplay === true
      && replay.actionItem?.id === taskID
      && replay.receipt?.taskEvidenceReceiptId === evidenceReceipt.id,
    "An exact retry did not acknowledge the prior evidence append with stable identities.");
    assert(await prisma.actionItemEvidenceReceipt.count({ where: { actionItemId: taskID } }) === 1,
      "The exact retry duplicated task evidence.");
    await stat(resultBundle);

    const receipt = {
      schema: "quipsly-retained-native-packet-task-evidence-merge-v1",
      operatedAt: new Date().toISOString(),
      localOnly: true,
      accountEmail: COACH_EMAIL,
      roomID: fixture.roomID,
      recordingAssetID: fixture.assetID,
      transcriptJobID: fixture.transcriptJobID,
      sourceSHA256: fixture.sourceSHA256,
      sourceSegmentIDs: segmentIDs,
      taskID,
      taskTitle,
      packetActionCandidateID: afterCandidate.id,
      taskEvidenceReceiptID: evidenceReceipt.id,
      resultBundle,
      boundaries: {
        existingTaskSelectedExplicitly: true,
        sourcePlaybackReviewed: true,
        taskIdentityStatusOwnerDatesReminderRecurrenceTagsGoalsAndProjectUnchanged: true,
        exactTranscriptReturnOperatedAfterRelaunch: true,
        exactReplayDuplicated: false,
        calendarMutated: false,
        deliveryClaimed: false,
        publicationClaimed: false,
      },
    };
    const receiptPath = `/private/tmp/quipsly-packet-task-evidence-merge-receipt-${Date.now()}-${process.pid}.json`;
    await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
    await chmod(receiptPath, 0o600);
    process.stdout.write(`${JSON.stringify({ ok: true, receiptPath, ...receipt }, null, 2)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`FAIL ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
