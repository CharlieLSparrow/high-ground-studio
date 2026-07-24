#!/usr/bin/env node

import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import {
  createTranscriptCorrection,
  readTranscriptCorrectionDesk,
} from "../apps/quipsly/src/lib/server/transcript-corrections.ts";

const DATABASE_URL = process.env.DATABASE_URL;
const APPLY = process.argv.includes("--apply");
const FIXTURE_ACTOR_EMAIL = "dev@quipsly.com";
const OPERATOR_EMAIL = String(process.env.QUIPSLY_DOGFOOD_ACTOR_EMAIL || FIXTURE_ACTOR_EMAIL)
  .trim()
  .toLowerCase();
const PROJECT_SLUG = "quipsly-local-dogfood";
const ROOM_ID = "local-transcript-dogfood-episode-4";
const ASSET_ID = "local-transcript-asset-episode-4";
const JOB_ID = "local-transcript-job-episode-4";
const SOURCE_ID = "local-transcript-source-episode-4";
const MEDIA_ASSET_ID = "local-transcript-media-episode-4";
const UPLOAD_SESSION_ID = "73a7b32a-f1cc-4a83-883e-e64132ebfc10";
const CAPTURE_ID = "75461430-c470-4447-96d0-4eb50cf4da29";
const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));
const SOURCE_AUDIO = path.join(REPO_ROOT, "apps/QuipslyStudio/.transcript-smoke/charlie-680-740.wav");
const SOURCE_TRANSCRIPT = path.join(REPO_ROOT, "apps/QuipslyStudio/.transcript-smoke/charlie-680-740.json");
const LOCAL_MEDIA_ROOT = path.join(tmpdir(), "quipsly-media-ingest", "transcript-dogfood");
const LOCAL_AUDIO = path.join(LOCAL_MEDIA_ROOT, "episode-4-charlie-680-740.wav");

function assertLocalDatabase(connectionString) {
  if (!connectionString) throw new Error("DATABASE_URL is required.");
  const url = new URL(connectionString);
  if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    throw new Error(`Refusing to dogfood against non-local database host ${url.hostname}.`);
  }
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function publicSegment(segment, index) {
  return {
    id: `local-transcript-segment-episode-4-${index + 1}`,
    transcriptJobId: JOB_ID,
    speakerLabel: segment.speaker || null,
    startSeconds: Number(segment.start),
    endSeconds: Number(segment.end),
    text: String(segment.text || "").trim(),
    confidence: typeof segment.confidence === "number" ? segment.confidence : null,
    metadataJson: {
      source: "quipsly-local-transcript-correction-dogfood",
      provider: "mlx-whisper-local",
      model: "mlx-community/whisper-large-v3-turbo",
      reviewStatus: segment.reviewStatus || "asr-draft",
      sourceWindowSeconds: { start: 680, end: 740 },
      sourceMutated: false,
    },
  };
}

async function main() {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(OPERATOR_EMAIL)) {
    throw new Error("QUIPSLY_DOGFOOD_ACTOR_EMAIL must be a valid email address.");
  }
  if (!APPLY) {
    console.log(JSON.stringify({
      ready: true,
      applyRequired: true,
      localOnly: true,
      actorEmail: OPERATOR_EMAIL,
      sourceAudio: SOURCE_AUDIO,
      sourceTranscript: SOURCE_TRANSCRIPT,
      effect: "Creates one Episode 4 playback/correction fixture and one quarantined AI speaker proposal. It does not accept the proposal or claim a human listen.",
    }, null, 2));
    return;
  }

  assertLocalDatabase(DATABASE_URL);

  const [audioBytes, transcriptBytes] = await Promise.all([readFile(SOURCE_AUDIO), readFile(SOURCE_TRANSCRIPT)]);
  const transcript = JSON.parse(transcriptBytes.toString("utf8"));
  const segments = Array.isArray(transcript.segments)
    ? transcript.segments.map(publicSegment).filter((segment) => segment.text && Number.isFinite(segment.startSeconds) && Number.isFinite(segment.endSeconds))
    : [];
  if (!segments.length) throw new Error("Episode 4 transcript fixture has no usable segments.");

  await mkdir(LOCAL_MEDIA_ROOT, { recursive: true });
  await copyFile(SOURCE_AUDIO, LOCAL_AUDIO);
  const copied = await stat(LOCAL_AUDIO);
  const checksum = sha256(audioBytes);

  const prisma = new PrismaClient({ adapter: new PrismaPg(DATABASE_URL), log: ["error"] });
  try {
    const actor = await prisma.user.upsert({
      where: { primaryEmail: FIXTURE_ACTOR_EMAIL },
      update: {},
      create: { primaryEmail: FIXTURE_ACTOR_EMAIL, name: "Quipsly local dogfood fixture", emailVerified: new Date() },
    });
    const operator = OPERATOR_EMAIL === FIXTURE_ACTOR_EMAIL
      ? actor
      : await prisma.user.upsert({
          where: { primaryEmail: OPERATOR_EMAIL },
          update: {},
          create: { primaryEmail: OPERATOR_EMAIL, name: "Quipsly local dogfood operator", emailVerified: new Date() },
        });
    const project = await prisma.studioProject.findFirstOrThrow({ where: { slug: PROJECT_SLUG } });
    await prisma.studioProjectAccessGrant.upsert({
      where: { projectId_email: { projectId: project.id, email: OPERATOR_EMAIL } },
      update: { role: "OWNER", status: "ACTIVE" },
      create: {
        projectId: project.id,
        email: OPERATOR_EMAIL,
        role: "OWNER",
        status: "ACTIVE",
        createdByUserId: operator.id,
        createdByEmail: OPERATOR_EMAIL,
        note: "Local-only transcript correction dogfood access.",
      },
    });
    await prisma.callRoom.upsert({
      where: { id: ROOM_ID },
      update: {
        createdByUserId: actor.id,
        projectId: project.id,
        nestSlug: project.slug,
        projectSlug: project.slug,
      },
      create: {
        id: ROOM_ID,
        createdByUserId: actor.id,
        projectId: project.id,
        purpose: "PODCAST",
        status: "ENDED",
        provider: "local-immutable-fixture",
        title: "Episode 4 transcript correction proof window (680–740s)",
        nestSlug: PROJECT_SLUG,
        projectSlug: PROJECT_SLUG,
        openedAt: new Date("2026-07-18T23:00:00.000Z"),
        recordingStartedAt: new Date("2026-07-18T23:00:00.000Z"),
        endedAt: new Date("2026-07-18T23:01:00.000Z"),
        metadataJson: {
          source: "quipsly-local-transcript-correction-dogfood",
          sourceWindowSeconds: { start: 680, end: 740 },
          localOnly: true,
          notAProductionRecordingReceipt: true,
        },
      },
    });
    await prisma.studioVideoSource.upsert({
      where: { id: SOURCE_ID },
      update: { providerSourceId: LOCAL_AUDIO, url: `/api/ingest/media/${SOURCE_ID}` },
      create: {
        id: SOURCE_ID,
        provider: "capture-recording",
        providerSourceId: LOCAL_AUDIO,
        url: `/api/ingest/media/${SOURCE_ID}`,
        title: "Quipsly Capture local Episode 4 proof window",
      },
    });
    await prisma.studioMediaAsset.upsert({
      where: { id: MEDIA_ASSET_ID },
      update: { url: `/api/ingest/media/${SOURCE_ID}`, sizeBytes: BigInt(copied.size) },
      create: {
        id: MEDIA_ASSET_ID,
        filename: path.basename(LOCAL_AUDIO),
        url: `/api/ingest/media/${SOURCE_ID}`,
        mimeType: "audio/wav",
        sizeBytes: BigInt(copied.size),
        duration: 60,
        isProxy: false,
        cloudProvider: "local-dogfood",
        isGlobal: false,
      },
    });
    await prisma.studioAssetAttachment.upsert({
      where: { projectId_assetId: { projectId: project.id, assetId: MEDIA_ASSET_ID } },
      update: {
        metadataJson: {
          callRoomId: ROOM_ID,
          recordingAssetId: ASSET_ID,
          sourceId: SOURCE_ID,
          playbackUrl: `/api/ingest/media/${SOURCE_ID}`,
          localOnly: true,
        },
      },
      create: {
        projectId: project.id,
        assetId: MEDIA_ASSET_ID,
        role: "spine-audio-candidate",
        source: "quipsly-local-transcript-correction-dogfood",
        createdByEmail: FIXTURE_ACTOR_EMAIL,
        metadataJson: {
          callRoomId: ROOM_ID,
          recordingAssetId: ASSET_ID,
          sourceId: SOURCE_ID,
          playbackUrl: `/api/ingest/media/${SOURCE_ID}`,
          localOnly: true,
        },
      },
    });
    await prisma.recordingAsset.upsert({
      where: { id: ASSET_ID },
      update: {
        roomId: ROOM_ID,
        kind: "LOCAL_AUDIO",
        status: "VERIFIED",
        fileName: path.basename(LOCAL_AUDIO),
        contentType: "audio/wav",
        byteSize: BigInt(copied.size),
        durationSeconds: 60,
        storageBucket: "local-dogfood",
        storageObjectPath: "episode-4/charlie-680-740.wav",
        checksum,
        uploadedAt: new Date("2026-07-18T23:01:05.000Z"),
        verifiedAt: new Date("2026-07-18T23:01:06.000Z"),
        localManifestJson: {
          source: "quipsly-local-transcript-correction-dogfood",
          processingDisposition: "RELEASED",
          transcriptionDisposition: "RELEASED",
          promotion: {
            status: "promoted-to-studio-media",
            mediaAssetId: MEDIA_ASSET_ID,
            sourceId: SOURCE_ID,
            playbackUrl: `/api/ingest/media/${SOURCE_ID}`,
            mediaKind: "audio",
            projectId: project.id,
            nestSlug: project.slug,
            localOnly: true,
          },
        },
      },
      create: {
        id: ASSET_ID,
        roomId: ROOM_ID,
        kind: "LOCAL_AUDIO",
        status: "VERIFIED",
        fileName: path.basename(LOCAL_AUDIO),
        contentType: "audio/wav",
        byteSize: BigInt(copied.size),
        durationSeconds: 60,
        storageBucket: "local-dogfood",
        storageObjectPath: "episode-4/charlie-680-740.wav",
        checksum,
        uploadedAt: new Date("2026-07-18T23:01:05.000Z"),
        verifiedAt: new Date("2026-07-18T23:01:06.000Z"),
        localManifestJson: {
          source: "quipsly-local-transcript-correction-dogfood",
          processingDisposition: "RELEASED",
          transcriptionDisposition: "RELEASED",
          promotion: {
            status: "promoted-to-studio-media",
            mediaAssetId: MEDIA_ASSET_ID,
            sourceId: SOURCE_ID,
            playbackUrl: `/api/ingest/media/${SOURCE_ID}`,
            mediaKind: "audio",
            projectId: project.id,
            nestSlug: project.slug,
            localOnly: true,
          },
        },
      },
    });
    await prisma.mobileCaptureFinalizationReceipt.upsert({
      where: { uploadSessionId: UPLOAD_SESSION_ID },
      update: {
        captureId: CAPTURE_ID,
        roomId: ROOM_ID,
        actorUserId: actor.id,
        processingDisposition: "RELEASED",
        transcriptDisposition: "RELEASED",
        recordingAssetId: ASSET_ID,
        sourceId: SOURCE_ID,
        mediaAssetId: MEDIA_ASSET_ID,
        transcriptJobId: JOB_ID,
        releasedByUserId: actor.id,
        releaseReason: "Local immutable fixture only; source already existed in repository.",
        releasedAt: new Date("2026-07-18T23:01:06.000Z"),
        transcriptReleasedByUserId: actor.id,
        transcriptReleaseReason: "Local immutable transcript fixture only.",
        transcriptReleasedAt: new Date("2026-07-18T23:01:06.000Z"),
        metadataJson: {
          immutableUploadBinding: {
            uploadSessionId: UPLOAD_SESSION_ID,
            roomId: ROOM_ID,
            sha256: checksum,
            bucketName: "local-dogfood",
            objectName: "episode-4/charlie-680-740.wav",
            sizeBytes: copied.size,
          },
          localOnly: true,
        },
      },
      create: {
        uploadSessionId: UPLOAD_SESSION_ID,
        captureId: CAPTURE_ID,
        roomId: ROOM_ID,
        actorUserId: actor.id,
        processingDisposition: "RELEASED",
        transcriptDisposition: "RELEASED",
        sourceId: SOURCE_ID,
        mediaAssetId: MEDIA_ASSET_ID,
        recordingAssetId: ASSET_ID,
        transcriptJobId: JOB_ID,
        releasedByUserId: actor.id,
        releaseReason: "Local immutable fixture only; source already existed in repository.",
        releasedAt: new Date("2026-07-18T23:01:06.000Z"),
        transcriptReleasedByUserId: actor.id,
        transcriptReleaseReason: "Local immutable transcript fixture only.",
        transcriptReleasedAt: new Date("2026-07-18T23:01:06.000Z"),
        metadataJson: {
          immutableUploadBinding: {
            uploadSessionId: UPLOAD_SESSION_ID,
            roomId: ROOM_ID,
            sha256: checksum,
            bucketName: "local-dogfood",
            objectName: "episode-4/charlie-680-740.wav",
            sizeBytes: copied.size,
          },
          localOnly: true,
        },
      },
    });
    await prisma.transcriptJob.upsert({
      where: { id: JOB_ID },
      update: {
        assetId: ASSET_ID,
        roomId: ROOM_ID,
        status: "COMPLETED",
        provider: transcript.provider || "mlx-whisper-local",
        language: transcript.language || "en",
        requestedBy: actor.id,
        startedAt: new Date("2026-07-18T23:01:07.000Z"),
        completedAt: new Date("2026-07-18T23:01:20.000Z"),
        resultJson: {
          source: "quipsly-local-transcript-correction-dogfood",
          model: transcript.model,
          sourceTranscriptSha256: sha256(transcriptBytes),
          truth: transcript.truth,
        },
      },
      create: {
        id: JOB_ID,
        roomId: ROOM_ID,
        assetId: ASSET_ID,
        status: "COMPLETED",
        provider: transcript.provider || "mlx-whisper-local",
        language: transcript.language || "en",
        requestedBy: actor.id,
        startedAt: new Date("2026-07-18T23:01:07.000Z"),
        completedAt: new Date("2026-07-18T23:01:20.000Z"),
        resultJson: {
          source: "quipsly-local-transcript-correction-dogfood",
          model: transcript.model,
          sourceTranscriptSha256: sha256(transcriptBytes),
          truth: transcript.truth,
        },
      },
    });
    for (const segment of segments) {
      await prisma.transcriptSegment.upsert({
        where: { id: segment.id },
        update: {
          transcriptJobId: segment.transcriptJobId,
          speakerLabel: segment.speakerLabel,
          startSeconds: segment.startSeconds,
          endSeconds: segment.endSeconds,
          text: segment.text,
          confidence: segment.confidence,
          metadataJson: segment.metadataJson,
        },
        create: segment,
      });
    }

    const operatorActor = { id: operator.id, email: OPERATOR_EMAIL, isStaff: false };
    const deskBefore = await readTranscriptCorrectionDesk({
      prisma,
      roomId: ROOM_ID,
      actor: operatorActor,
    });
    const first = deskBefore.segments[0];
    if (!first) throw new Error("Correction desk did not return transcript segments.");
    const proposal = await createTranscriptCorrection({
      prisma,
      actor: { id: actor.id, email: FIXTURE_ACTOR_EMAIL, isStaff: true },
      roomId: ROOM_ID,
      segmentId: first.id,
      clientRequestId: `local-ai-speaker-proposal-${sha256(transcriptBytes).slice(0, 16)}`,
      origin: "ai",
      expectedText: first.providerText,
      expectedSpeakerLabel: first.providerSpeakerLabel,
      expectedAcceptedCorrectionId: first.acceptedCorrection?.id ?? null,
      correctedText: first.providerText,
      correctedSpeakerLabel: "Charlie",
      reason: "The immutable source filename identifies this as Charlie's isolated Episode 4 track. Listen before accepting the speaker assignment.",
      aiReceipt: {
        provider: "local-rule",
        model: "isolated-track-filename-proposal-v1",
        sourcePath: path.relative(REPO_ROOT, SOURCE_AUDIO),
        humanListenPerformed: false,
      },
    });
    const deskAfter = await readTranscriptCorrectionDesk({
      prisma,
      roomId: ROOM_ID,
      actor: operatorActor,
    });

    console.log(JSON.stringify({
      ok: true,
      localOnly: true,
      actorEmail: OPERATOR_EMAIL,
      roomId: ROOM_ID,
      reviewPath: `/sessions/${ROOM_ID}`,
      playback: deskAfter.playback,
      transcriptJobId: deskAfter.transcriptJobId,
      segmentCount: deskAfter.segments.length,
      firstSegment: {
        id: first.id,
        mediaTime: [first.startSeconds, first.endSeconds],
        providerText: first.providerText,
        providerSpeakerLabel: first.providerSpeakerLabel,
      },
      proposal: proposal.correction,
      proposalAccepted: false,
      humanListenPerformed: false,
      nextAction: "Open the signed-in session review, play the timestamp, then accept or reject the speaker proposal. No script is allowed to claim that listen.",
      sourceEvidence: {
        repositoryAudio: path.relative(REPO_ROOT, SOURCE_AUDIO),
        repositoryTranscript: path.relative(REPO_ROOT, SOURCE_TRANSCRIPT),
        audioSha256: checksum,
        transcriptSha256: sha256(transcriptBytes),
        copiedPlaybackPath: LOCAL_AUDIO,
      },
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
