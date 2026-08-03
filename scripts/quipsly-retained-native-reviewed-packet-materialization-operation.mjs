#!/usr/bin/env node

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
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
const KEYCHAIN_SERVICE = "com.quipsly.qa.retained-coaching";
const COACH_EMAIL = "quipsly-coach-retained-20260731@example.test";
const COACH_UID = "quipsly-coach-retained-20260731";
const SOURCE_ROOM_ID = "qa-retained-coaching-next-session-20260807";
const SOURCE_ASSET_ID = "cmsc8ee1j0001qyxlxdja8ho8";
const EXPECTED_SOURCE_TEXT = "The test goal is to preserve the original recording, verify the exact checksum, and hold all transcript work until every participant has consented and a human explicitly releases it.";

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
  const response = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${idToken}`,
      "cache-control": "no-cache",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
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

async function cloneRetainedFixture(prisma) {
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
  const sourceBytes = await readFile(sourcePath);
  const sourceSHA256 = createHash("sha256").update(sourceBytes).digest("hex");
  assert(sourceSHA256 === sourceAsset.checksum, "The retained source bytes no longer match their canonical checksum.");

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
      fileName: sourceAsset.fileName,
      contentType: sourceAsset.contentType,
      byteSize: sourceAsset.byteSize,
      durationSeconds: sourceAsset.durationSeconds,
      storageBucket: sourceAsset.storageBucket,
      storageObjectPath: sourceAsset.storageObjectPath,
      localManifestJson: {
        ...sourceManifest,
        callRoomId: roomID,
        participantId: participantID,
        consentId: consentID,
        recordingConsentId: consentID,
        promotion: { ...promoted, sessionContext: { ...asObject(promoted.sessionContext), roomId: roomID } },
      },
      segmentsJson: sourceAsset.segmentsJson,
      checksum: sourceSHA256,
      recordedStartedAt: new Date(now.getTime() - Number(sourceAsset.durationSeconds || 20) * 1000),
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
          sizeBytes: Number(sourceAsset.byteSize),
          bucketName: sourceAsset.storageBucket,
          objectName: sourceAsset.storageObjectPath,
        },
      },
    } });
  });

  return {
    roomID, roomTitle, participantID, consentID, assetID, transcriptJobID,
    goalSegmentIDs, sourcePath, sourceSHA256, coachUserID: coach.id,
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
    assert(beforeGoal.committedGoalId == null && beforeGoal.transcriptReviewStatus === "provider",
      "The fresh packet must begin provider-only with no canonical goal.");
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
    assert(afterGoal.transcriptReviewStatus === "human-reviewed" && afterGoal.committedGoalId,
      "The rebuilt packet must correlate its fully reviewed source span to one canonical goal.");
    const [verifications, transcriptSegments, goals, actions, notes, calendarLinks] = await Promise.all([
      prisma.transcriptSegmentVerification.findMany({ where: { roomId: fixture.roomID } }),
      prisma.transcriptSegment.findMany({ where: { transcriptJobId: fixture.transcriptJobID } }),
      prisma.goal.findMany({ where: { roomId: fixture.roomID } }),
      prisma.actionItem.findMany({ where: { roomId: fixture.roomID } }),
      prisma.coachingNote.findMany({ where: { roomId: fixture.roomID } }),
      prisma.calendarEventLink.findMany({ where: { roomId: fixture.roomID } }),
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
    assert(actions.length === 0, "Goal creation must not create a task.");
    assert(calendarLinks.length === 0, "Goal creation must not create calendar placement.");
    const canonicalNotes = notes.filter((note) => asObject(note.sourceJson).schema === "quipsly-transcript-derived-note-v1");
    assert(canonicalNotes.length === 0, "Goal creation must not materialize a packet note.");
    await stat(resultBundle);

    console.log(JSON.stringify({
      ok: true,
      localOnly: true,
      retained: true,
      compiledIPhoneOperation: true,
      exactSourcePlayback: true,
      humanReviewedSegments: 3,
      appendOnlyPacketRebuild: true,
      canonicalMaterialization: { notes: 0, tasks: 0, goals: 1, calendarLinks: 0 },
      roomID: fixture.roomID,
      recordingAssetID: fixture.assetID,
      transcriptJobID: fixture.transcriptJobID,
      canonicalGoalID: goals[0].id,
      sourceSHA256: fixture.sourceSHA256,
      resultBundle,
      credentialsPrinted: false,
      externalSideEffects: false,
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

await main();
