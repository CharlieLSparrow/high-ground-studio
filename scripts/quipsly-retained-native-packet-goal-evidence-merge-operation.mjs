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
const EXPECTED_SOURCE_TEXT = "The test goal is to preserve the original recording, verify the exact checksum, and hold all transcript work until every participant has consented and a human explicitly releases it.";
const EDITABLE_NOTE_KINDS = ["SESSION_NOTE", "DECISION", "PRODUCTION"];

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
    "Goal-evidence merge operation requires a credential-free loopback Nest origin.");
  return url.origin;
}

function requireLocalDatabase(value) {
  const url = new URL(String(value || ""));
  assert(["postgres:", "postgresql:"].includes(url.protocol) && loopbackHost(url.hostname) && url.pathname !== "/",
    "Goal-evidence merge operation requires an explicit loopback PostgreSQL database.");
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

function exactGoalCandidate(packetBody) {
  const candidate = Array.isArray(packetBody?.packet?.goalCandidates)
    ? packetBody.packet.goalCandidates.find((item) => item?.sourceText === EXPECTED_SOURCE_TEXT)
    : null;
  assert(candidate?.segmentIds?.length === 3 && candidate?.sourceSpan?.segments?.length === 3,
    "The deterministic packet lost its exact three-segment goal candidate.");
  return candidate;
}

function goalDefinition(goal) {
  return {
    id: goal.id,
    ownerUserId: goal.ownerUserId,
    roomId: goal.roomId,
    projectId: goal.projectId,
    parentGoalId: goal.parentGoalId,
    title: goal.title,
    description: goal.description,
    status: goal.status,
    targetAt: goal.targetAt?.toISOString?.() || null,
    achievedAt: goal.achievedAt?.toISOString?.() || null,
    updatedAt: goal.updatedAt?.toISOString?.() || null,
    tagIds: (goal.tagLinks || []).map((link) => link.tagId).sort(),
    taskIds: (goal.taskLinks || []).map((link) => link.actionItemId).sort(),
  };
}

async function roomSideEffects(prisma, roomID) {
  const [goals, tasks, notes, calendarLinks, outputs, deliveries] = await Promise.all([
    prisma.goal.count({ where: { roomId: roomID } }),
    prisma.actionItem.count({ where: { roomId: roomID } }),
    prisma.coachingNote.count({ where: { roomId: roomID, kind: { in: EDITABLE_NOTE_KINDS } } }),
    prisma.calendarEventLink.count({ where: { roomId: roomID } }),
    prisma.sessionOutput.count({ where: { roomId: roomID } }),
    prisma.deliveryEvent.count({ where: { roomId: roomID } }),
  ]);
  return { goals, tasks, notes, calendarLinks, outputs, deliveries };
}

async function main() {
  assert(process.env.QUIPSLY_RETAINED_PACKET_GOAL_EVIDENCE_MERGE_OPERATION === "1",
    "Set QUIPSLY_RETAINED_PACKET_GOAL_EVIDENCE_MERGE_OPERATION=1 to authorize retained local test artifacts.");
  const baseURL = requireLoopbackOrigin(process.env.QUIPSLY_RETAINED_COACHING_BASE_URL || "http://127.0.0.1:3012");
  const databaseURL = requireLocalDatabase(process.env.DATABASE_URL || "");
  const password = readRetainedQAPassword({ service: KEYCHAIN_SERVICE, account: COACH_EMAIL });
  assert(password, "The retained coach has no Keychain password.");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseURL, max: 2 }), log: ["error"] });

  try {
    const fixture = await cloneRetainedFixture(prisma);
    const idToken = await authenticate(password);
    const stamp = `${Date.now()}-${randomBytes(3).toString("hex")}`;
    const goalTitle = `Retained evidence goal · ${stamp}`;
    const goalDescription = "Keep the goal definition stable while reviewed evidence accumulates.";
    const created = await requestJson(new URL("/api/mobile/capture/quick-entry", baseURL), {
      idToken,
      method: "POST",
      body: {
        clientRequestId: randomUUID().toLowerCase(),
        callRoomId: fixture.roomID,
        kind: "GOAL",
        title: goalTitle,
        body: goalDescription,
        capturedAt: new Date().toISOString(),
        tagIds: [],
      },
    });
    assert(created.entry?.kind === "GOAL" && created.entry?.title === goalTitle && created.entry?.status === "ACTIVE",
      "The normal Capture quick-entry boundary did not create the exact baseline goal.");
    const progress = await requestJson(new URL("/api/mobile/capture/today", baseURL), {
      idToken,
      method: "POST",
      body: {
        action: "goal-progress",
        id: created.entry.id,
        progressPercent: 35,
        note: "Baseline numeric progress remains separate from transcript evidence.",
        expectedUpdatedAt: created.entry.updatedAt,
      },
    });
    assert(progress.progressPercent === 35 && progress.status === "ACTIVE",
      "The normal Today boundary did not retain baseline numeric progress.");

    await requestJson(new URL("/api/mobile/capture/transcripts/packet", baseURL), {
      idToken,
      method: "POST",
      body: { transcriptJobId: fixture.transcriptJobID, force: true },
    });
    const before = await readPacket(baseURL, idToken, fixture.roomID);
    const beforeCandidate = exactGoalCandidate(before);
    const mergeTarget = before.packet.goalMergeTargets?.find((target) => target.id === created.entry.id);
    assert(beforeCandidate.reviewStatus !== "MERGED_INTO_GOAL" && beforeCandidate.committedGoalId == null,
      "The fresh goal candidate must begin uncommitted.");
    assert(mergeTarget?.title === goalTitle && mergeTarget?.description === goalDescription
      && mergeTarget?.status === "ACTIVE" && mergeTarget?.evidenceCount === 0,
    "The packet did not project the exact actor-owned baseline goal.");
    const canonicalBefore = await prisma.goal.findUnique({
      where: { id: created.entry.id },
      include: { tagLinks: true, taskLinks: true, progressReceipts: { orderBy: { occurredAt: "asc" } } },
    });
    assert(canonicalBefore?.progressReceipts?.length === 1 && canonicalBefore.progressReceipts[0].progressPercent === 35,
      "The baseline goal must have exactly one numeric progress receipt.");
    const definitionBefore = goalDefinition(canonicalBefore);
    const sideEffectsBefore = await roomSideEffects(prisma, fixture.roomID);
    assert(JSON.stringify(sideEffectsBefore) === JSON.stringify({ goals: 1, tasks: 0, notes: 0, calendarLinks: 0, outputs: 0, deliveries: 0 }),
      "The retained room must begin with one goal and no unrelated follow-through side effects.");

    const resultBundle = `/private/tmp/quipsly-packet-goal-evidence-merge-${Date.now()}-${process.pid}.xcresult`;
    const operation = spawnSync("bash", [RUNNER], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        QUIPSLY_CAPTURE_UI_TEST_MODE: "transcript-packet-goal-evidence-merge",
        QUIPSLY_CAPTURE_UI_TEST_BASE_URL: baseURL,
        QUIPSLY_CAPTURE_UI_TEST_EMAIL: COACH_EMAIL,
        QUIPSLY_CAPTURE_UI_TEST_PASSWORD: password,
        QUIPSLY_CAPTURE_UI_TEST_SESSION_ID: fixture.roomID,
        QUIPSLY_CAPTURE_UI_TEST_SESSION_TITLE: fixture.roomTitle,
        QUIPSLY_CAPTURE_UI_TEST_TRANSCRIPT_SEGMENT_IDS: fixture.goalSegmentIDs.join(","),
        QUIPSLY_CAPTURE_UI_TEST_EXPECTED_PACKET_GOAL_TITLE: beforeCandidate.suggestedTitle,
        QUIPSLY_CAPTURE_UI_TEST_GOAL_ID: canonicalBefore.id,
        QUIPSLY_CAPTURE_UI_TEST_GOAL_EDIT_SOURCE_TITLE: goalTitle,
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
    assert(operation.status === 0,
      `Compiled Capture goal-evidence merge operation failed (exit ${String(operation.status)}).`);

    const after = await readPacket(baseURL, idToken, fixture.roomID);
    const afterCandidate = exactGoalCandidate(after);
    assert(afterCandidate.reviewStatus === "MERGED_INTO_GOAL"
      && afterCandidate.committedGoalId === canonicalBefore.id
      && afterCandidate.lastHumanReview?.decision === "MERGE",
    "The operated candidate did not return as one terminal evidence merge into the selected goal.");
    const canonicalAfter = await prisma.goal.findUnique({
      where: { id: canonicalBefore.id },
      include: { tagLinks: true, taskLinks: true, progressReceipts: { orderBy: { occurredAt: "asc" } } },
    });
    assert(JSON.stringify(goalDefinition(canonicalAfter)) === JSON.stringify(definitionBefore),
      "Appending evidence changed the selected goal definition, status, target, tags, tasks, project, or revision.");
    assert(canonicalAfter.progressReceipts.length === 2,
      "The merge must append exactly one receipt beside existing numeric progress.");
    const numericReceipt = canonicalAfter.progressReceipts.find((receipt) => typeof receipt.progressPercent === "number");
    const evidenceReceipt = canonicalAfter.progressReceipts.find((receipt) => receipt.kind === "TRANSCRIPT_CANDIDATE_MERGED");
    const evidence = asObject(evidenceReceipt?.evidenceJson);
    const source = asObject(evidence.candidateSource);
    assert(numericReceipt?.progressPercent === 35 && evidenceReceipt?.progressPercent == null,
      "Transcript evidence must not overwrite or impersonate numeric goal progress.");
    assert(evidence.schema === "quipsly-transcript-goal-evidence-merge-v1"
      && evidence.goalCandidateId === afterCandidate.id
      && source.roomId === fixture.roomID
      && source.transcriptJobId === fixture.transcriptJobID
      && source.recordingAssetId === fixture.assetID
      && source.effectiveTextSnapshot === EXPECTED_SOURCE_TEXT,
    "The append-only receipt lost exact transcript or playback provenance.");
    const evidenceGovernance = asObject(evidence.governance);
    assert(afterCandidate.lastHumanReview?.governance?.actionId === evidenceGovernance.actionId
      && afterCandidate.lastHumanReview?.governance?.receiptId === evidenceGovernance.receiptId,
    "The reloaded Capture candidate lost the durable governed merge reference.");
    const governedAction = await prisma.governedAction.findUnique({
      where: { id: evidenceGovernance.actionId },
      include: { run: true, attempts: true, receipts: true },
    });
    const governedResult = asObject(governedAction?.resultJson);
    assert(governedAction?.capabilityId === "quipsly.session.transcript-goal-evidence.merge"
      && governedAction?.actionKind === "MERGE_TRANSCRIPT_EVIDENCE_INTO_GOAL"
      && governedAction?.targetObjectType === "Goal"
      && governedAction?.targetObjectId === canonicalBefore.id
      && governedAction?.status === "SUCCEEDED"
      && governedAction.run?.status === "SUCCEEDED"
      && governedAction.attempts?.length === 1
      && governedAction.attempts[0]?.attemptNumber === 1
      && governedAction.attempts[0]?.status === "SUCCEEDED"
      && governedAction.attempts[0]?.executorKind === "quipsly-transcript-evidence-merge-domain-service"
      && governedAction.receipts?.length === 1
      && governedAction.receipts[0]?.id === evidenceGovernance.receiptId
      && governedAction.receipts[0]?.newStatus === "SUCCEEDED"
      && governedResult.evidenceReceiptId === evidenceReceipt.id
      && JSON.stringify(governedResult.targetBefore) === JSON.stringify(governedResult.targetAfter),
    "The goal merge did not persist one successful governed action with an exact unchanged before/after target snapshot.");
    const sideEffectsAfter = await roomSideEffects(prisma, fixture.roomID);
    assert(JSON.stringify(sideEffectsAfter) === JSON.stringify(sideEffectsBefore),
      "Adding goal evidence created a goal, task, note, calendar link, output, or delivery.");

    const packetSummary = await prisma.coachingNote.findFirst({
      where: { id: after.packet.summary.id },
      select: { sourceJson: true },
    });
    const reviewReceipt = asObject(asObject(packetSummary?.sourceJson).lastGoalCandidateReview);
    const mergeTargetBefore = asObject(reviewReceipt.mergeTargetBefore);
    const mergeTargetAfter = asObject(reviewReceipt.mergeTargetAfter);
    const reviewGovernance = asObject(reviewReceipt.governance);
    assert(reviewGovernance.actionId === governedAction.id
      && reviewGovernance.receiptId === evidenceGovernance.receiptId
      && JSON.stringify(mergeTargetBefore) === JSON.stringify(mergeTargetAfter),
    "The packet review receipt lost governed identity or the unchanged merge target snapshot.");
    const replay = await requestJson(new URL("/api/mobile/capture/transcripts/packet/goals", baseURL), {
      idToken,
      method: "POST",
      body: {
        callRoomId: fixture.roomID,
        transcriptJobId: fixture.transcriptJobID,
        recordingAssetId: fixture.assetID,
        summaryNoteId: after.packet.summary.id,
        packetBuildId: after.packet.build.packetBuildId,
        goalCandidateId: afterCandidate.id,
        decision: "MERGE",
        mergeTargetGoalId: canonicalBefore.id,
        mergeExpectedUpdatedAt: mergeTargetBefore.updatedAt,
      },
    });
    assert(replay.idempotentReplay === true
      && replay.goal?.id === canonicalBefore.id
      && replay.receipt?.goalProgressReceiptId === evidenceReceipt.id,
    "An exact retry did not acknowledge the prior evidence append with stable identities.");
    const replayReceiptCount = await prisma.goalProgressReceipt.count({ where: { goalId: canonicalBefore.id } });
    assert(replayReceiptCount === 2, "The exact retry duplicated goal progress or evidence.");
    await stat(resultBundle);

    const receipt = {
      schema: "quipsly-retained-native-packet-goal-evidence-merge-v1",
      operatedAt: new Date().toISOString(),
      localOnly: true,
      accountEmail: COACH_EMAIL,
      roomID: fixture.roomID,
      recordingAssetID: fixture.assetID,
      transcriptJobID: fixture.transcriptJobID,
      sourceSHA256: fixture.sourceSHA256,
      sourceSegmentIDs: fixture.goalSegmentIDs,
      goalID: canonicalBefore.id,
      goalTitle,
      packetGoalCandidateID: afterCandidate.id,
      goalProgressReceiptID: evidenceReceipt.id,
      governedActionID: governedAction.id,
      governedReceiptID: evidenceGovernance.receiptId,
      resultBundle,
      canonicalSideEffects: sideEffectsAfter,
      receipts: { numericProgress: 1, reviewedTranscriptEvidence: 1, exactReplayDuplicated: false },
      boundaries: {
        existingGoalSelectedExplicitly: true,
        completeSourcePlaybackReviewed: true,
        goalIdentityAndDefinitionUnchanged: true,
        numericProgressPreserved: true,
        governedActionSucceededExactlyOnce: true,
        exactBeforeAfterSnapshotUnchanged: true,
        exactTranscriptReturnOperatedAfterRelaunch: true,
        taskCreated: false,
        noteCreated: false,
        calendarMutated: false,
        outputCreated: false,
        deliveryClaimed: false,
        publicationClaimed: false,
      },
    };
    const receiptPath = `/private/tmp/quipsly-packet-goal-evidence-merge-receipt-${Date.now()}-${process.pid}.json`;
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
