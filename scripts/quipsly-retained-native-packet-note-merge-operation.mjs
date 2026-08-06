#!/usr/bin/env node

import { randomBytes, randomUUID } from "node:crypto";
import { chmod, writeFile } from "node:fs/promises";
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
const RUNNER = path.join(
  REPO_ROOT,
  "apps/mobile-capture/HighGroundCapture/scripts/run-capture-runtime-ui-smoke.sh",
);
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
  assert(
    url.protocol === "http:" && loopbackHost(url.hostname) && !url.username && !url.password,
    "Packet-note merge operation requires a credential-free loopback Nest origin.",
  );
  return url.origin;
}

function requireLocalDatabase(value) {
  const url = new URL(String(value || ""));
  assert(
    ["postgres:", "postgresql:"].includes(url.protocol)
      && loopbackHost(url.hostname)
      && url.pathname !== "/",
    "Packet-note merge operation requires an explicit loopback PostgreSQL database.",
  );
  return url.toString();
}

async function authenticate(password) {
  const authOrigin = requireLoopbackOrigin(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099"}`,
  );
  const response = await fetch(
    `${authOrigin}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: COACH_EMAIL, password, returnSecureToken: true }),
    },
  );
  const payload = await response.json().catch(() => null);
  assert(
    response.status === 200 && typeof payload?.idToken === "string",
    "The retained coach could not authenticate with the local Firebase emulator.",
  );
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
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 400));
      }
    }
  }
  if (!response) throw lastNetworkError;
  const payload = await response.json().catch(() => null);
  assert(
    response.ok && payload?.ok === true,
    `${method} ${new URL(url).pathname} failed with HTTP ${response.status}: ${payload?.code || payload?.error || "unknown error"}`,
  );
  return payload;
}

async function readPacket(baseURL, idToken, roomID) {
  const url = new URL("/api/mobile/capture/transcripts/packet", baseURL);
  url.searchParams.set("callRoomId", roomID);
  return requestJson(url, { idToken });
}

function exactNoteCandidate(packetBody) {
  const candidates = packetBody?.packet?.noteCandidates;
  const candidate = Array.isArray(candidates)
    ? candidates.find((item) => item?.sourceText === EXPECTED_SOURCE_TEXT
      && item?.laneId === "client-follow-up")
    : null;
  assert(
    candidate?.segmentIds?.length === 3 && candidate?.sourceSpan?.segments?.length === 3,
    "The deterministic packet lost its exact three-segment client-follow-up candidate.",
  );
  return candidate;
}

async function sideEffectCounts(prisma, roomID, actorUserID) {
  const [editableNotes, goals, tasks, calendarLinks, outputs, deliveries] = await Promise.all([
    prisma.coachingNote.count({
      where: { roomId: roomID, authorUserId: actorUserID, kind: { in: EDITABLE_NOTE_KINDS } },
    }),
    prisma.goal.count({ where: { roomId: roomID } }),
    prisma.actionItem.count({ where: { roomId: roomID } }),
    prisma.calendarEventLink.count({ where: { roomId: roomID } }),
    prisma.sessionOutput.count({ where: { roomId: roomID } }),
    prisma.deliveryEvent.count({ where: { roomId: roomID } }),
  ]);
  return { editableNotes, goals, tasks, calendarLinks, outputs, deliveries };
}

async function main() {
  assert(
    process.env.QUIPSLY_RETAINED_PACKET_NOTE_MERGE_OPERATION === "1",
    "Set QUIPSLY_RETAINED_PACKET_NOTE_MERGE_OPERATION=1 to authorize retained local test artifacts.",
  );
  const baseURL = requireLoopbackOrigin(
    process.env.QUIPSLY_RETAINED_COACHING_BASE_URL || "http://127.0.0.1:3012",
  );
  const databaseURL = requireLocalDatabase(process.env.DATABASE_URL || "");
  const password = readRetainedQAPassword({ service: KEYCHAIN_SERVICE, account: COACH_EMAIL });
  assert(password, "The retained coach has no Keychain password.");
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseURL, max: 2 }),
    log: ["error"],
  });

  try {
    const fixture = await cloneRetainedFixture(prisma);
    const idToken = await authenticate(password);
    const stamp = `${Date.now()}-${randomBytes(3).toString("hex")}`;
    const sourceTitle = `Existing coaching note · ${stamp}`;
    const sourceBody = "Coach-authored baseline: retain the original observation and decide what evidence belongs in follow-through.";
    const mergedTitle = `Reviewed coaching decision · ${stamp}`;
    const mergedBody = `${sourceBody}\n\nReviewed transcript evidence: preserve the original recording, verify its exact checksum, and wait for complete participant consent plus explicit human release.`;

    const created = await requestJson(
      new URL(`/api/sessions/${encodeURIComponent(fixture.roomID)}/notes`, baseURL),
      {
        idToken,
        method: "POST",
        body: {
          clientRequestId: randomUUID().toLowerCase(),
          title: sourceTitle,
          body: sourceBody,
          kind: "SESSION_NOTE",
          visibility: "AUTHOR_PRIVATE",
        },
      },
    );
    assert(
      created.note?.revisionCount === 1 && created.note?.title === sourceTitle,
      "The normal Session-note API did not create the exact revision-one merge target.",
    );

    await requestJson(new URL("/api/mobile/capture/transcripts/packet", baseURL), {
      idToken,
      method: "POST",
      body: { transcriptJobId: fixture.transcriptJobID, force: true },
    });
    const before = await readPacket(baseURL, idToken, fixture.roomID);
    const beforeCandidate = exactNoteCandidate(before);
    const mergeTarget = before.packet.noteMergeTargets?.find(
      (target) => target.id === created.note.id,
    );
    assert(
      beforeCandidate.reviewStatus !== "MERGED_INTO_NOTE"
        && beforeCandidate.committedNoteId == null,
      "The fresh packet candidate must not already be canonical.",
    );
    assert(
      mergeTarget?.title === sourceTitle
        && mergeTarget?.body === sourceBody
        && mergeTarget?.revisionCount === 1,
      "The packet did not project the exact actor-owned revision-one merge target.",
    );
    const sideEffectsBefore = await sideEffectCounts(
      prisma,
      fixture.roomID,
      fixture.coachUserID,
    );
    assert(
      JSON.stringify(sideEffectsBefore) === JSON.stringify({
        editableNotes: 1,
        goals: 0,
        tasks: 0,
        calendarLinks: 0,
        outputs: 0,
        deliveries: 0,
      }),
      "The retained room must begin with exactly one editable note and no follow-through side effects.",
    );

    const resultBundle = `/private/tmp/quipsly-packet-note-merge-${Date.now()}-${process.pid}.xcresult`;
    const operation = spawnSync("bash", [RUNNER], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        QUIPSLY_CAPTURE_UI_TEST_MODE: "transcript-packet-note-merge",
        QUIPSLY_CAPTURE_UI_TEST_BASE_URL: baseURL,
        QUIPSLY_CAPTURE_UI_TEST_EMAIL: COACH_EMAIL,
        QUIPSLY_CAPTURE_UI_TEST_PASSWORD: password,
        QUIPSLY_CAPTURE_UI_TEST_SESSION_ID: fixture.roomID,
        QUIPSLY_CAPTURE_UI_TEST_SESSION_TITLE: fixture.roomTitle,
        QUIPSLY_CAPTURE_UI_TEST_TRANSCRIPT_SEGMENT_IDS: fixture.goalSegmentIDs.join(","),
        QUIPSLY_CAPTURE_UI_TEST_EXPECTED_PACKET_NOTE_SOURCE_TEXT: EXPECTED_SOURCE_TEXT,
        QUIPSLY_CAPTURE_UI_TEST_EXPECTED_PACKET_NOTE_LANE_ID: beforeCandidate.laneId,
        QUIPSLY_CAPTURE_UI_TEST_NOTE_ID: created.note.id,
        QUIPSLY_CAPTURE_UI_TEST_NOTE_EDIT_SOURCE_TITLE: sourceTitle,
        QUIPSLY_CAPTURE_UI_TEST_NOTE_EDIT_UPDATED_TITLE: mergedTitle,
        QUIPSLY_CAPTURE_UI_TEST_NOTE_EDIT_SOURCE_BODY: sourceBody,
        QUIPSLY_CAPTURE_UI_TEST_NOTE_EDIT_UPDATED_BODY: mergedBody,
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
    assert(
      operation.status === 0,
      `Compiled Capture packet-note merge operation failed (exit ${String(operation.status)}).`,
    );

    const after = await readPacket(baseURL, idToken, fixture.roomID);
    const afterCandidate = exactNoteCandidate(after);
    assert(
      afterCandidate.reviewStatus === "MERGED_INTO_NOTE"
        && afterCandidate.committedNoteId === created.note.id
        && afterCandidate.lastHumanReview?.decision === "MERGE"
        && afterCandidate.lastHumanReview?.governance?.capabilityId === "quipsly.session.transcript-note.merge",
      "The operated candidate did not return as one terminal merge into the selected note.",
    );

    const mergedNote = await prisma.coachingNote.findUnique({
      where: { id: created.note.id },
      include: { revisions: { orderBy: { revision: "asc" } } },
    });
    assert(
      mergedNote?.title === mergedTitle
        && mergedNote?.body === mergedBody
        && mergedNote?.kind === "SESSION_NOTE"
        && mergedNote?.visibility === "AUTHOR_PRIVATE"
        && mergedNote?.revisions?.length === 2,
      "The merge must update the exact existing note and append exactly one revision.",
    );
    assert(
      mergedNote.revisions[0].operation === "created"
        && mergedNote.revisions[1].operation === "merged-transcript-candidate",
      "The existing note must retain its creation revision before the transcript merge revision.",
    );
    const originalSource = asObject(mergedNote.sourceJson);
    const mergeReceipt = asObject(originalSource.lastTranscriptCandidateMerge);
    const revisionSnapshot = asObject(mergedNote.revisions[1].snapshotJson);
    const revisionPrevious = asObject(revisionSnapshot.previous);
    const revisionNext = asObject(revisionSnapshot.next);
    const candidateSource = asObject(mergeReceipt.candidateSource);
    const governance = asObject(mergeReceipt.governance);
    const revisionGovernance = asObject(revisionSnapshot.governance);
    assert(
      originalSource.schema === "quipsly-session-note-v1"
        && mergeReceipt.kind === "quipsly-note-candidate-review-receipt-v1"
        && mergeReceipt.decision === "MERGE"
        && mergeReceipt.noteId === mergedNote.id
        && mergeReceipt.noteRevisionId === mergedNote.revisions[1].id,
      "The updated note must retain its original identity and expose the latest merge receipt.",
    );
    assert(
      governance.schema === "quipsly-governed-action-reference-v1"
        && governance.capabilityId === "quipsly.session.transcript-note.merge"
        && governance.actionId === afterCandidate.lastHumanReview.governance.actionId
        && revisionGovernance.actionId === governance.actionId,
      "The note, packet projection, and immutable revision must expose one matching governed action.",
    );
    assert(
      revisionPrevious.title === sourceTitle
        && revisionPrevious.body === sourceBody
        && asObject(revisionPrevious.sourceJson).schema === "quipsly-session-note-v1"
        && revisionNext.title === mergedTitle
        && revisionNext.body === mergedBody,
      "The append-only merge revision must retain the complete prior note and reviewed next content.",
    );
    assert(
      candidateSource.roomId === fixture.roomID
        && candidateSource.transcriptJobId === fixture.transcriptJobID
        && candidateSource.recordingAssetId === fixture.assetID
        && JSON.stringify(candidateSource.segmentIds) === JSON.stringify(fixture.goalSegmentIDs)
        && candidateSource.effectiveTextSnapshot === EXPECTED_SOURCE_TEXT,
      "The merge receipt must preserve the complete immutable recording-backed source span.",
    );

    const governedAction = await prisma.governedAction.findFirst({
      where: {
        id: governance.actionId,
        capabilityId: "quipsly.session.transcript-note.merge",
        targetObjectType: "CoachingNote",
        targetObjectId: mergedNote.id,
        idempotencyKey: mergeReceipt.id,
      },
      include: {
        run: true,
        attempts: { orderBy: { attemptNumber: "asc" } },
        receipts: { orderBy: { createdAt: "asc" } },
      },
    });
    const governedResult = asObject(governedAction?.resultJson);
    const governedRecovery = asObject(governedAction?.recoveryJson);
    const governedConsequence = asObject(governedAction?.consequenceJson);
    const governedBoundaries = asObject(governedConsequence.boundaries);
    assert(
      governedAction?.status === "SUCCEEDED"
        && governedAction?.riskLevel === "HIGH"
        && governedAction?.run?.status === "SUCCEEDED"
        && governedAction?.attempts?.length === 1
        && governedAction.attempts[0].status === "SUCCEEDED"
        && governedAction?.receipts?.length === 1
        && governedAction.receipts[0].id === governance.receiptId
        && governedRecovery.method === "append-a-compensating-note-revision-and-supersede-this-decision"
        && asObject(governedResult.targetBefore).body === sourceBody
        && asObject(governedResult.targetAfter).body === mergedBody
        && governedBoundaries.priorContentRetainedInRevision === true
        && governedBoundaries.externalDelivery === false,
      "The governed ledger must prove the high-risk note revision, exact before/after state, recovery, and no delivery.",
    );

    const sideEffectsAfter = await sideEffectCounts(
      prisma,
      fixture.roomID,
      fixture.coachUserID,
    );
    assert(
      JSON.stringify(sideEffectsAfter) === JSON.stringify(sideEffectsBefore),
      "Merging a note candidate must create no note, goal, task, calendar, output, or delivery side effect.",
    );

    const candidateDraftAfter = asObject(mergeReceipt.candidateDraftAfter);
    const mergeTargetAfter = asObject(mergeReceipt.mergeTargetAfter);
    const replay = await requestJson(
      new URL("/api/mobile/capture/transcripts/notes", baseURL),
      {
        idToken,
        method: "POST",
        body: {
          roomId: fixture.roomID,
          segmentId: mergeReceipt.segmentId,
          clientRequestId: mergeReceipt.clientRequestId,
          expectedProviderTextSha256: mergeReceipt.providerTextSha256,
          title: candidateDraftAfter.title,
          body: candidateDraftAfter.body,
          kind: candidateDraftAfter.kind,
          visibility: candidateDraftAfter.visibility,
          decision: "MERGE",
          transcriptJobId: mergeReceipt.transcriptJobId,
          recordingAssetId: mergeReceipt.recordingAssetId,
          summaryNoteId: mergeReceipt.summaryNoteId,
          packetBuildId: mergeReceipt.packetBuildId,
          packetNoteCandidateId: mergeReceipt.packetNoteCandidateId,
          packetLaneId: mergeReceipt.packetLaneId,
          mergeTargetNoteId: mergedNote.id,
          mergeExpectedUpdatedAt: mergeReceipt.mergeExpectedUpdatedAt,
          mergedTitle: mergeTargetAfter.title,
          mergedBody: mergeTargetAfter.body,
          mergedKind: mergeTargetAfter.kind,
          mergedVisibility: mergeTargetAfter.visibility,
        },
      },
    );
    assert(
      replay.idempotentReplay === true
        && replay.note?.id === mergedNote.id
        && replay.note?.revisionCount === 2
        && replay.boundaries?.noteCreated === false
        && replay.boundaries?.noteRevised === false,
      "An exact retry must acknowledge the prior merge without creating a note or revision.",
    );
    const replayRevisionCount = await prisma.coachingNoteRevision.count({
      where: { noteId: mergedNote.id },
    });
    assert(replayRevisionCount === 2, "The exact retry duplicated the merge revision.");

    const receipt = {
      schema: "quipsly-retained-native-packet-note-merge-v1",
      operatedAt: new Date().toISOString(),
      localOnly: true,
      accountEmail: COACH_EMAIL,
      roomID: fixture.roomID,
      recordingAssetID: fixture.assetID,
      transcriptJobID: fixture.transcriptJobID,
      sourceSHA256: fixture.sourceSHA256,
      sourceSegmentIDs: fixture.goalSegmentIDs,
      noteID: mergedNote.id,
      noteRevisionID: mergedNote.revisions[1].id,
      governedRunID: governance.runId,
      governedActionID: governance.actionId,
      governedAttemptID: governance.attemptId,
      governedReceiptID: governance.receiptId,
      governedCapabilityID: governance.capabilityId,
      revisionCount: replayRevisionCount,
      packetNoteCandidateID: mergeReceipt.packetNoteCandidateId,
      resultBundle,
      canonicalSideEffects: sideEffectsAfter,
      exactReplay: {
        acknowledged: true,
        noteCreated: false,
        noteRevised: false,
        revisionDuplicated: false,
      },
      boundaries: {
        existingNoteSelectedExplicitly: true,
        completeSourcePlaybackReviewed: true,
        priorContentRecoverable: true,
        beforeAndAfterAudienceRecorded: true,
        governedCompensationAvailable: true,
        exactTranscriptReturnOperatedAfterRelaunch: true,
        taskCreated: false,
        goalCreated: false,
        calendarMutated: false,
        outputCreated: false,
        deliveryClaimed: false,
        publicationClaimed: false,
      },
    };
    const receiptPath = `/private/tmp/quipsly-packet-note-merge-receipt-${Date.now()}-${process.pid}.json`;
    await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
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
