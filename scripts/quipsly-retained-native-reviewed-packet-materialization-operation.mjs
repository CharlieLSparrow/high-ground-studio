#!/usr/bin/env node

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readRetainedQAPassword } from "./lib/retained-qa-keychain.mjs";

const requireFromQuipsly = createRequire(new URL("../apps/quipsly/package.json", import.meta.url));
const { PrismaClient } = requireFromQuipsly("@prisma/client");
const { PrismaPg } = requireFromQuipsly("@prisma/adapter-pg");

const REPO_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const RUNNER = path.join(REPO_ROOT, "apps/mobile-capture/HighGroundCapture/scripts/run-capture-runtime-ui-smoke.sh");
export const KEYCHAIN_SERVICE = "com.quipsly.qa.retained-coaching";
export const COACH_EMAIL = "quipsly-coach-retained-20260731@example.test";
export const COACH_UID = "quipsly-coach-retained-20260731";
const SOURCE_ROOM_ID = "qa-retained-coaching-next-session-20260807";
const SOURCE_ASSET_ID = "cmsc8ee1j0001qyxlxdja8ho8";
const EXPECTED_SOURCE_TEXT = "The test goal is to preserve the original recording, verify the exact checksum, and hold all transcript work until every participant has consented and a human explicitly releases it.";
const DURABLE_FIXTURE_VERSION = "quipsly-synthetic-coaching-v2";
const DURABLE_FIXTURE_TEXT = "This is a synthetic Quipsly coaching workflow recording. It is test evidence, not a genuine coaching session. The test goal is to preserve the original recording, verify the exact checksum, and hold all transcript work until every participant has consented and a human explicitly releases it.";
const DURABLE_FIXTURE_PATH = path.join(REPO_ROOT, "artifacts", "retained-media", `${DURABLE_FIXTURE_VERSION}.wav`);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function loopbackHost(value) {
  return ["localhost", "127.0.0.1", "[::1]"].includes(value);
}

function requireLoopbackOrigin(value) {
  const url = new URL(String(value || ""));
  assert(url.protocol === "http:" && loopbackHost(url.hostname) && !url.username && !url.password,
    "Reviewed packet operation requires a credential-free loopback Nest origin.");
  return url.origin;
}

function requireLocalDatabase(value) {
  const url = new URL(String(value || ""));
  assert(["postgres:", "postgresql:"].includes(url.protocol) && loopbackHost(url.hostname) && url.pathname !== "/",
    "Reviewed packet operation requires an explicit loopback PostgreSQL database.");
  return url.toString();
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

async function durableSyntheticSource() {
  try {
    const bytes = await readFile(DURABLE_FIXTURE_PATH);
    return { path: DURABLE_FIXTURE_PATH, bytes, generated: false };
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await mkdir(path.dirname(DURABLE_FIXTURE_PATH), { recursive: true });
  const aiffPath = `${DURABLE_FIXTURE_PATH}.aiff`;
  const speech = spawnSync("say", ["-v", "Samantha", "-r", "205", "-o", aiffPath, DURABLE_FIXTURE_TEXT], {
    stdio: "inherit",
  });
  assert(speech.status === 0, `Could not generate ${DURABLE_FIXTURE_VERSION} speech source.`);
  const encode = spawnSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", aiffPath,
    "-af", "apad=pad_dur=2",
    "-t", "18",
    "-ar", "44100",
    "-ac", "1",
    "-c:a", "pcm_s16le",
    DURABLE_FIXTURE_PATH,
  ], { stdio: "inherit" });
  await rm(aiffPath, { force: true });
  assert(encode.status === 0, `Could not encode ${DURABLE_FIXTURE_VERSION} WAV source.`);
  const bytes = await readFile(DURABLE_FIXTURE_PATH);
  assert(bytes.length > 44, `Generated ${DURABLE_FIXTURE_VERSION} WAV is empty.`);
  return { path: DURABLE_FIXTURE_PATH, bytes, generated: true };
}

async function retainedSourceOrDurableFallback(sourcePath) {
  try {
    return { path: sourcePath, bytes: await readFile(sourcePath), generated: false, recoveredFromMissingTemporarySource: false };
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    const durable = await durableSyntheticSource();
    return { ...durable, recoveredFromMissingTemporarySource: true };
  }
}

async function authenticate(password) {
  const authOrigin = requireLoopbackOrigin(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099"}`,
  );
  const response = await fetch(`${authOrigin}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: COACH_EMAIL, password, returnSecureToken: true }),
  });
  const body = await response.json().catch(() => null);
  assert(response.status === 200 && typeof body?.idToken === "string",
    "The retained coach could not authenticate with the local Firebase emulator.");
  return body.idToken;
}

async function requestJson(url, { idToken, method = "GET", body } = {}) {
  const attempts = method === "GET" ? 3 : 1;
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
        await new Promise((resolve) => setTimeout(resolve, attempt * 250));
      }
    }
  }
  if (!response) throw lastNetworkError;
  const payload = await response.json().catch(() => null);
  assert(response.status === 200 && payload?.ok === true,
    `${method} ${new URL(url).pathname} failed with HTTP ${response.status}: ${payload?.error || "unknown error"}`);
  return payload;
}

async function readPacket(baseURL, idToken, roomID) {
  const url = new URL("/api/mobile/capture/transcripts/packet", baseURL);
  url.searchParams.set("callRoomId", roomID);
  return requestJson(url, { idToken });
}

function exactGoalCandidate(packetBody) {
  const candidates = packetBody?.packet?.goalCandidates;
  const goal = Array.isArray(candidates)
    ? candidates.find((candidate) => candidate?.sourceText === EXPECTED_SOURCE_TEXT)
    : null;
  assert(goal && goal.segmentIds?.length === 3 && goal.sourceSpan?.segments?.length === 3,
    "The fresh deterministic packet lost the complete three-segment goal evidence span.");
  return goal;
}

function exactNoteCandidate(packetBody) {
  const candidates = packetBody?.packet?.noteCandidates;
  const note = Array.isArray(candidates)
    ? candidates.find((candidate) => candidate?.sourceText === EXPECTED_SOURCE_TEXT
      && candidate?.laneId === "client-follow-up")
    : null;
  assert(note && note.segmentIds?.length === 3 && note.sourceSpan?.segments?.length === 3,
    "The fresh deterministic packet lost the complete three-segment note evidence span.");
  return note;
}

function exactTaskCandidate(packetBody) {
  const candidates = packetBody?.packet?.actionCandidates;
  const task = Array.isArray(candidates)
    ? candidates.find((candidate) => candidate?.sourceText === EXPECTED_SOURCE_TEXT)
    : null;
  assert(task && task.segmentIds?.length === 3 && task.sourceSpan?.segments?.length === 3,
    "The fresh deterministic packet lost the complete three-segment task evidence span.");
  return task;
}

export async function cloneRetainedFixture(prisma) {
  const stamp = `${Date.now()}-${randomBytes(4).toString("hex")}`;
  const roomID = `qa-reviewed-packet-${stamp}`;
  const roomTitle = `QA Retained · Reviewed packet ${stamp}`;
  const participantID = `${roomID}-coach`;
  const consentID = `${roomID}-consent`;
  const assetID = `${roomID}-asset`;
  const transcriptJobID = `${roomID}-transcript`;

  const [coach, sourceRoom, sourceAsset] = await Promise.all([
    prisma.user.findFirst({ where: { primaryEmail: COACH_EMAIL } }),
    prisma.callRoom.findUnique({
      where: { id: SOURCE_ROOM_ID },
      include: { participants: true, recordingConsents: true },
    }),
    prisma.recordingAsset.findUnique({
      where: { id: SOURCE_ASSET_ID },
      include: { transcriptJobs: { where: { status: "COMPLETED" }, include: { segments: { orderBy: { startSeconds: "asc" } } } } },
    }),
  ]);
  assert(coach?.firebaseUid === COACH_UID, "The retained coach database identity no longer matches its Firebase UID.");
  assert(sourceRoom && sourceAsset?.transcriptJobs?.length === 1, "The immutable retained source room, asset, or completed transcript is unavailable.");
  const sourceCoachParticipant = sourceRoom.participants.find((participant) => participant.userId === coach.id);
  const sourceCoachConsent = sourceRoom.recordingConsents
    .filter((consent) => consent.userId === coach.id || consent.participantId === sourceCoachParticipant?.id)
    .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())[0];
  assert(sourceCoachParticipant && sourceCoachConsent?.status === "GRANTED",
    "The immutable retained coach consent evidence is unavailable.");
  const sourceManifest = asObject(sourceAsset.localManifestJson);
  const promoted = asObject(sourceManifest.promotion);
  const sourcePath = String(promoted.providerSourceId || "");
  assert(sourcePath, "The retained asset has no exact local provider source path.");
  const retainedSource = await retainedSourceOrDurableFallback(sourcePath);
  const sourceBytes = retainedSource.bytes;
  const sourceSHA256 = createHash("sha256").update(sourceBytes).digest("hex");
  if (!retainedSource.recoveredFromMissingTemporarySource) {
    assert(sourceSHA256 === sourceAsset.checksum, "The retained source bytes no longer match their canonical checksum.");
  }

  const sourceSegments = sourceAsset.transcriptJobs[0].segments;
  let spanIndexes = null;
  for (let start = 0; start < sourceSegments.length; start += 1) {
    for (let end = start; end < sourceSegments.length; end += 1) {
      const text = sourceSegments.slice(start, end + 1).map((segment) => segment.text.trim()).join(" ");
      if (text === EXPECTED_SOURCE_TEXT) spanIndexes = [start, end];
    }
  }
  assert(spanIndexes && spanIndexes[1] - spanIndexes[0] + 1 === 3,
    "The immutable source transcript no longer contains the expected three-segment complete thought.");

  const clonedSegmentIDs = sourceSegments.map((_, index) => `${roomID}-segment-${index + 1}`);
  const goalSegmentIDs = clonedSegmentIDs.slice(spanIndexes[0], spanIndexes[1] + 1);
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.callRoom.create({ data: {
      id: roomID,
      createdByUserId: coach.id,
      projectId: sourceRoom.projectId,
      purpose: "COACHING",
      status: "ENDED",
      provider: "retained-local-operation",
      title: roomTitle,
      scheduledStart: new Date(now.getTime() - 3_600_000),
      scheduledEnd: now,
      openedAt: new Date(now.getTime() - 3_600_000),
      recordingStartedAt: new Date(now.getTime() - 3_500_000),
      endedAt: now,
      nestSlug: sourceRoom.nestSlug,
      projectSlug: sourceRoom.projectSlug,
      recordingPolicyJson: sourceRoom.recordingPolicyJson,
      transcriptPolicyJson: sourceRoom.transcriptPolicyJson,
      metadataJson: { fixture: "reviewed-packet-materialization", retained: true, sourceRoomId: SOURCE_ROOM_ID },
    } });
    await tx.callParticipant.create({ data: {
      id: participantID,
      roomId: roomID,
      userId: coach.id,
      displayName: "Retained QA Coach",
      email: COACH_EMAIL,
      role: sourceCoachParticipant.role,
      joinedAt: new Date(now.getTime() - 3_600_000),
      leftAt: now,
      deviceLabel: "Operated iOS simulator",
      connectionJson: { fixture: "reviewed-packet-materialization" },
    } });
    await tx.recordingConsent.create({ data: {
      id: consentID,
      roomId: roomID,
      participantId: participantID,
      userId: coach.id,
      status: "GRANTED",
      consentText: sourceCoachConsent.consentText,
      policyVersion: sourceCoachConsent.policyVersion,
      canRecordAudio: sourceCoachConsent.canRecordAudio,
      canRecordVideo: sourceCoachConsent.canRecordVideo,
      canTranscribe: sourceCoachConsent.canTranscribe,
      consentedAt: new Date(now.getTime() - 3_600_000),
      metadataJson: { ...asObject(sourceCoachConsent.metadataJson), fixture: "reviewed-packet-materialization" },
    } });
    await tx.recordingAsset.create({ data: {
      id: assetID,
      roomId: roomID,
      participantId: participantID,
      kind: sourceAsset.kind,
      status: sourceAsset.status,
      fileName: path.basename(retainedSource.path),
      contentType: "audio/wav",
      byteSize: BigInt(sourceBytes.length),
      durationSeconds: 18,
      storageBucket: "quipsly-retained-local-fixtures",
      storageObjectPath: `${DURABLE_FIXTURE_VERSION}/${path.basename(retainedSource.path)}`,
      localManifestJson: {
        ...sourceManifest,
        fileName: path.basename(retainedSource.path),
        callRoomId: roomID,
        participantId: participantID,
        consentId: consentID,
        recordingConsentId: consentID,
        checksumSha256: sourceSHA256,
        exactBytesVerified: true,
        retainedFixture: {
          version: DURABLE_FIXTURE_VERSION,
          generated: retainedSource.generated,
          recoveredFromMissingTemporarySource: retainedSource.recoveredFromMissingTemporarySource,
          sourcePath: retainedSource.path,
        },
        promotion: {
          ...promoted,
          providerSourceId: retainedSource.path,
          sessionContext: { ...asObject(promoted.sessionContext), roomId: roomID },
        },
      },
      segmentsJson: sourceAsset.segmentsJson,
      checksum: sourceSHA256,
      recordedStartedAt: new Date(now.getTime() - 18_000),
      recordedStoppedAt: now,
      uploadedAt: now,
      verifiedAt: now,
    } });
    await tx.transcriptJob.create({ data: {
      id: transcriptJobID,
      roomId: roomID,
      assetId: assetID,
      status: "COMPLETED",
      provider: "retained-local-operation",
      language: sourceAsset.transcriptJobs[0].language,
      requestedBy: coach.id,
      startedAt: new Date(now.getTime() - 60_000),
      completedAt: now,
      sourceSha256: sourceSHA256,
      resultJson: { fixture: "reviewed-packet-materialization", immutableSourceJobId: sourceAsset.transcriptJobs[0].id },
    } });
    await tx.transcriptSegment.createMany({ data: sourceSegments.map((segment, index) => ({
      id: clonedSegmentIDs[index],
      transcriptJobId: transcriptJobID,
      speakerLabel: segment.speakerLabel,
      speakerUserId: segment.speakerUserId,
      startSeconds: segment.startSeconds,
      endSeconds: segment.endSeconds,
      text: segment.text,
      confidence: segment.confidence,
      metadataJson: { ...asObject(segment.metadataJson), fixture: "reviewed-packet-materialization", immutableSourceSegmentId: segment.id },
    })) });
    const uploadSessionId = randomUUID();
    const captureId = randomUUID();
    await tx.mobileCaptureFinalizationReceipt.create({ data: {
      uploadSessionId,
      captureId,
      roomId: roomID,
      actorUserId: coach.id,
      processingDisposition: "RELEASED",
      transcriptDisposition: "RELEASED",
      recordingAssetId: assetID,
      transcriptJobId: transcriptJobID,
      releasedByUserId: coach.id,
      releaseReason: "Retained local acceptance fixture with current consent and exact immutable source checksum.",
      releasedAt: now,
      transcriptReleasedByUserId: coach.id,
      transcriptReleaseReason: "Retained local acceptance fixture with current consent and exact immutable source checksum.",
      transcriptReleasedAt: now,
      metadataJson: {
        fixture: "reviewed-packet-materialization",
        immutableUploadBinding: {
          uploadSessionId,
          captureId,
          actorUserId: coach.id,
          roomId: roomID,
          sha256: sourceSHA256,
          sizeBytes: sourceBytes.length,
          bucketName: "quipsly-retained-local-fixtures",
          objectName: `${DURABLE_FIXTURE_VERSION}/${path.basename(retainedSource.path)}`,
        },
      },
    } });
  });

  return {
    roomID, roomTitle, participantID, consentID, assetID, transcriptJobID,
    goalSegmentIDs,
    sourcePath: retainedSource.path,
    sourceSHA256,
    sourceGenerated: retainedSource.generated,
    recoveredFromMissingTemporarySource: retainedSource.recoveredFromMissingTemporarySource,
    coachUserID: coach.id,
  };
}

async function main() {
  assert(process.env.QUIPSLY_RETAINED_REVIEWED_PACKET_OPERATION === "1",
    "Set QUIPSLY_RETAINED_REVIEWED_PACKET_OPERATION=1 to authorize creating retained local test artifacts.");
  const baseURL = requireLoopbackOrigin(process.env.QUIPSLY_RETAINED_COACHING_BASE_URL || "http://127.0.0.1:3012");
  const databaseURL = requireLocalDatabase(process.env.DATABASE_URL || "");
  const password = readRetainedQAPassword({ service: KEYCHAIN_SERVICE, account: COACH_EMAIL });
  assert(password, "The retained coach has no Keychain password.");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseURL, max: 2 }), log: ["error"] });
  try {
    const fixture = await cloneRetainedFixture(prisma);
    const idToken = await authenticate(password);
    await requestJson(new URL("/api/mobile/capture/transcripts/packet", baseURL), {
      idToken,
      method: "POST",
      body: { transcriptJobId: fixture.transcriptJobID, force: true },
    });
    const before = await readPacket(baseURL, idToken, fixture.roomID);
    const beforeGoal = exactGoalCandidate(before);
    const beforeNote = exactNoteCandidate(before);
    const beforeTask = exactTaskCandidate(before);
    const editedNoteTitle = `Reviewed decision · ${fixture.roomID.slice(-13)}`;
    const editedNoteBody = "Preserve the original recording, verify its exact checksum, and wait for complete participant consent plus explicit human release.";
    assert(beforeGoal.committedGoalId == null && beforeGoal.transcriptReviewStatus === "provider",
      "The fresh packet must begin provider-only with no canonical goal.");
    assert(beforeNote.committedNoteId == null && beforeNote.transcriptReviewStatus === "provider",
      "The fresh packet must begin provider-only with no canonical Session note.");
    assert(beforeTask.committedActionItemId == null && beforeTask.transcriptReviewStatus === "provider",
      "The fresh packet must begin provider-only with no canonical task.");
    assert(before.packet.transcriptReview.providerOnlySegmentCount === 5,
      "The fresh packet must begin with all five immutable transcript segments provider-only.");

    const resultBundle = `/private/tmp/quipsly-reviewed-packet-materialization-${Date.now()}-${process.pid}.xcresult`;
    const operation = spawnSync("bash", [RUNNER], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        QUIPSLY_CAPTURE_UI_TEST_MODE: "transcript-packet-materialization",
        QUIPSLY_CAPTURE_UI_TEST_BASE_URL: baseURL,
        QUIPSLY_CAPTURE_UI_TEST_EMAIL: COACH_EMAIL,
        QUIPSLY_CAPTURE_UI_TEST_PASSWORD: password,
        QUIPSLY_CAPTURE_UI_TEST_SESSION_ID: fixture.roomID,
        QUIPSLY_CAPTURE_UI_TEST_SESSION_TITLE: fixture.roomTitle,
        QUIPSLY_CAPTURE_UI_TEST_TRANSCRIPT_SEGMENT_IDS: fixture.goalSegmentIDs.join(","),
        QUIPSLY_CAPTURE_UI_TEST_EXPECTED_PACKET_GOAL_TITLE: beforeGoal.suggestedTitle,
        QUIPSLY_CAPTURE_UI_TEST_EXPECTED_PACKET_TASK_TITLE: beforeTask.title,
        QUIPSLY_CAPTURE_UI_TEST_EXPECTED_PACKET_NOTE_SOURCE_TEXT: EXPECTED_SOURCE_TEXT,
        QUIPSLY_CAPTURE_UI_TEST_EXPECTED_PACKET_NOTE_LANE_ID: beforeNote.laneId,
        QUIPSLY_CAPTURE_UI_TEST_PACKET_NOTE_EDITED_TITLE: editedNoteTitle,
        QUIPSLY_CAPTURE_UI_TEST_PACKET_NOTE_EDITED_BODY: editedNoteBody,
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
    assert(operation.status === 0, `Compiled Capture reviewed-packet operation failed (exit ${String(operation.status)}).`);

    const after = await readPacket(baseURL, idToken, fixture.roomID);
    const afterGoal = exactGoalCandidate(after);
    const afterNote = exactNoteCandidate(after);
    const afterTask = exactTaskCandidate(after);
    assert(afterGoal.transcriptReviewStatus === "human-reviewed" && afterGoal.committedGoalId,
      "The rebuilt packet must correlate its fully reviewed source span to one canonical goal.");
    assert(afterNote.transcriptReviewStatus === "human-reviewed" && afterNote.committedNoteId
      && afterNote.suggestedTitle === editedNoteTitle && afterNote.suggestedBody === editedNoteBody
      && afterNote.reviewStatus === "ACCEPTED_AS_NOTE" && afterNote.lastHumanReview?.decision === "ACCEPT"
      && afterNote.lastHumanReview?.governance?.capabilityId === "quipsly.session.transcript-note.materialize",
    "The rebuilt packet must read back the edited exact-source draft as one accepted canonical Session note.");
    assert(afterTask.transcriptReviewStatus === "human-reviewed" && afterTask.committedActionItemId,
      "The rebuilt packet must correlate its fully reviewed source span to one canonical task.");
    const [verifications, transcriptSegments, goals, actions, notes, calendarLinks, governedActions] = await Promise.all([
      prisma.transcriptSegmentVerification.findMany({ where: { roomId: fixture.roomID } }),
      prisma.transcriptSegment.findMany({ where: { transcriptJobId: fixture.transcriptJobID } }),
      prisma.goal.findMany({ where: { roomId: fixture.roomID } }),
      prisma.actionItem.findMany({ where: { roomId: fixture.roomID } }),
      prisma.coachingNote.findMany({ where: { roomId: fixture.roomID } }),
      prisma.calendarEventLink.findMany({ where: { roomId: fixture.roomID } }),
      prisma.governedAction.findMany({
        where: { targetObjectType: { in: ["Goal", "ActionItem", "CoachingNote"] } },
        include: { run: true, attempts: true, receipts: true },
      }),
    ]);
    assert(verifications.length === 3, "The operated review must append exactly three playback-verification receipts.");
    for (const segmentID of fixture.goalSegmentIDs) {
      const segment = transcriptSegments.find((item) => item.id === segmentID);
      const receipt = verifications.find((item) => item.segmentId === segmentID);
      assert(segment && receipt && receipt.recordingAssetId === fixture.assetID
        && receipt.playbackPositionSeconds >= segment.endSeconds - 0.25,
      `Playback verification for ${segmentID} did not reach the immutable segment end.`);
    }
    assert(goals.length === 1 && goals[0].id === afterGoal.committedGoalId && goals[0].title === beforeGoal.suggestedTitle,
      "The operated decision must create exactly one matching canonical goal.");
    const governedGoal = governedActions.find((action) => action.targetObjectId === goals[0].id);
    const goalGovernance = asObject(asObject(goals[0].sourceJson).governance);
    assert(governedGoal
      && governedGoal.capabilityId === "quipsly.session.transcript-goal.materialize"
      && governedGoal.status === "SUCCEEDED"
      && governedGoal.decisionPolicy === "USER_INITIATED"
      && governedGoal.decisionStatus === "NOT_REQUIRED"
      && governedGoal.run.status === "SUCCEEDED"
      && governedGoal.attempts.length === 1
      && governedGoal.attempts[0].status === "SUCCEEDED"
      && governedGoal.receipts.length === 1
      && governedGoal.receipts[0].kind === "EXECUTION_SUCCEEDED"
      && goalGovernance.actionId === governedGoal.id
      && goalGovernance.receiptId === governedGoal.receipts[0].id,
    "The canonical goal did not retain one exact governed action, attempt, and execution receipt.");
    assert(actions.length === 1 && actions[0].id === afterTask.committedActionItemId
      && actions[0].title === beforeTask.title && actions[0].assignedUserId === fixture.coachUserID,
    "The operated decision must create exactly one actor-owned matching canonical task.");
    const governedTask = governedActions.find((action) => action.targetObjectId === actions[0].id);
    const taskGovernance = asObject(asObject(actions[0].sourceJson).governance);
    assert(governedTask
      && governedTask.capabilityId === "quipsly.session.transcript-task.materialize"
      && governedTask.status === "SUCCEEDED"
      && governedTask.decisionPolicy === "USER_INITIATED"
      && governedTask.decisionStatus === "NOT_REQUIRED"
      && governedTask.run.status === "SUCCEEDED"
      && governedTask.attempts.length === 1
      && governedTask.attempts[0].status === "SUCCEEDED"
      && governedTask.receipts.length === 1
      && governedTask.receipts[0].kind === "EXECUTION_SUCCEEDED"
      && taskGovernance.actionId === governedTask.id
      && taskGovernance.receiptId === governedTask.receipts[0].id,
    "The canonical task did not retain one exact governed action, attempt, and execution receipt.");
    assert(calendarLinks.length === 0, "Goal creation must not create calendar placement.");
    const canonicalNotes = notes.filter((note) => asObject(note.sourceJson).schema === "quipsly-transcript-derived-note-v1");
    assert(canonicalNotes.length === 1 && canonicalNotes[0].id === afterNote.committedNoteId
      && canonicalNotes[0].title === editedNoteTitle && canonicalNotes[0].body === editedNoteBody,
    "The operated note review must create exactly one canonical note with the reviewed draft.");
    const canonicalNoteSource = asObject(canonicalNotes[0].sourceJson);
    assert(canonicalNoteSource.packetNoteCandidateId === afterNote.id
      && canonicalNoteSource.recordingAssetId === fixture.assetID
      && JSON.stringify(canonicalNoteSource.segmentIds) === JSON.stringify(fixture.goalSegmentIDs),
    "The canonical note must retain the current packet candidate and complete immutable source span.");
    const governedNote = governedActions.find((action) => action.targetObjectId === canonicalNotes[0].id);
    const noteGovernance = asObject(canonicalNoteSource.governance);
    const initialRevision = await prisma.coachingNoteRevision.findFirst({
      where: { noteId: canonicalNotes[0].id, revision: 1 },
    });
    assert(governedNote
      && governedNote.capabilityId === "quipsly.session.transcript-note.materialize"
      && governedNote.status === "SUCCEEDED"
      && governedNote.riskLevel === "MEDIUM"
      && governedNote.run.status === "SUCCEEDED"
      && governedNote.attempts.length === 1
      && governedNote.attempts[0].status === "SUCCEEDED"
      && governedNote.receipts.length === 1
      && governedNote.receipts[0].kind === "EXECUTION_SUCCEEDED"
      && noteGovernance.actionId === governedNote.id
      && noteGovernance.receiptId === governedNote.receipts[0].id
      && asObject(asObject(initialRevision?.snapshotJson).governance).actionId === governedNote.id,
    "The canonical note, its first revision, and packet projection did not retain one matching governed materialization receipt.");
    await stat(resultBundle);

    console.log(JSON.stringify({
      ok: true,
      localOnly: true,
      retained: true,
      compiledIPhoneOperation: true,
      exactSourcePlayback: true,
      humanReviewedSegments: 3,
      appendOnlyPacketRebuild: true,
      nonCanonicalNoteDraftReviewed: true,
      canonicalMaterialization: { notes: 1, tasks: 1, goals: 1, calendarLinks: 0 },
      roomID: fixture.roomID,
      recordingAssetID: fixture.assetID,
      transcriptJobID: fixture.transcriptJobID,
      canonicalGoalID: goals[0].id,
      governedGoalActionID: governedGoal.id,
      governedGoalReceiptID: governedGoal.receipts[0].id,
      canonicalTaskID: actions[0].id,
      governedTaskActionID: governedTask.id,
      governedTaskReceiptID: governedTask.receipts[0].id,
      canonicalNoteID: canonicalNotes[0].id,
      governedNoteActionID: governedNote.id,
      governedNoteReceiptID: governedNote.receipts[0].id,
      sourceSHA256: fixture.sourceSHA256,
      durableFixtureVersion: DURABLE_FIXTURE_VERSION,
      durableFixtureGenerated: fixture.sourceGenerated,
      recoveredFromMissingTemporarySource: fixture.recoveredFromMissingTemporarySource,
      resultBundle,
      credentialsPrinted: false,
      externalSideEffects: false,
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  await main();
}
