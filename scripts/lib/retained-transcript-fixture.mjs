// Retained audio fixture used by the separate offline recovery rehearsal.
// Historical spoken text is fixture content, not current product policy.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
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
