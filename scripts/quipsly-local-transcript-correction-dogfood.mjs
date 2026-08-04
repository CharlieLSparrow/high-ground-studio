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
import {
  MOBILE_CAPTURE_CONSENT_EVIDENCE_VERSION,
  MOBILE_CAPTURE_CONSENT_POLICY_VERSION,
  MOBILE_CAPTURE_CONSENT_TEXT,
  MOBILE_CAPTURE_CONSENT_TEXT_SHA256,
} from "../apps/quipsly/src/lib/mobile-capture-consent-policy.js";
import { analyzeAudioSignalFile } from "./lib/audio-signal-window-profile.mjs";

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
const PARTICIPANT_ID = "local-transcript-participant-episode-4-charlie";
const CONSENT_ID = "local-transcript-consent-episode-4-charlie";
const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));
const DEFAULT_SOURCE_AUDIO = path.join(REPO_ROOT, "apps/QuipslyStudio/.transcript-smoke/charlie-680-740.wav");
const DEFAULT_SOURCE_TRANSCRIPT = path.join(REPO_ROOT, "apps/QuipslyStudio/.transcript-smoke/charlie-680-740.json");
const SOURCE_AUDIO = path.resolve(process.env.QUIPSLY_DOGFOOD_SOURCE_AUDIO || DEFAULT_SOURCE_AUDIO);
const SOURCE_TRANSCRIPT = path.resolve(process.env.QUIPSLY_DOGFOOD_SOURCE_TRANSCRIPT || DEFAULT_SOURCE_TRANSCRIPT);
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

async function inspectSource(pathname) {
  try {
    const source = await stat(pathname);
    return {
      exists: source.isFile(),
      sizeBytes: source.isFile() ? source.size : null,
    };
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return { exists: false, sizeBytes: null };
    }
    throw error;
  }
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

function publicWords(sourceSegments) {
  const words = [];
  for (const [segmentIndex, segment] of sourceSegments.entries()) {
    for (const word of Array.isArray(segment.words) ? segment.words : []) {
      const startSeconds = Number(word.start);
      const endSeconds = Number(word.end);
      const text = String(word.word || "").trim();
      if (!text || !Number.isFinite(startSeconds) || !Number.isFinite(endSeconds)) continue;
      const providerWordIndex = words.length;
      words.push({
        id: `local-transcript-word-episode-4-${providerWordIndex + 1}`,
        transcriptJobId: JOB_ID,
        segmentId: `local-transcript-segment-episode-4-${segmentIndex + 1}`,
        providerWordIndex,
        startSeconds,
        endSeconds,
        word: text.replace(/[.,!?;:]+$/u, "") || text,
        punctuatedWord: text,
        confidence: typeof word.confidence === "number" ? word.confidence : null,
        speakerLabel: segment.speaker || null,
        channel: null,
        metadataJson: {
          source: "quipsly-local-transcript-correction-dogfood",
          provider: "mlx-whisper-local",
          model: "mlx-community/whisper-large-v3-turbo",
          providerTimingSource: word.source || null,
          sourceWindowSeconds: { start: 680, end: 740 },
          immutableProviderEvidence: true,
        },
      });
    }
  }
  return words;
}

async function main() {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(OPERATOR_EMAIL)) {
    throw new Error("QUIPSLY_DOGFOOD_ACTOR_EMAIL must be a valid email address.");
  }
  const [audioSource, transcriptSource] = await Promise.all([
    inspectSource(SOURCE_AUDIO),
    inspectSource(SOURCE_TRANSCRIPT),
  ]);
  if (!APPLY) {
    const sourceReady = audioSource.exists && transcriptSource.exists;
    console.log(JSON.stringify({
      ready: sourceReady,
      applyRequired: true,
      localOnly: true,
      actorEmail: OPERATOR_EMAIL,
      sources: {
        audio: { path: SOURCE_AUDIO, ...audioSource },
        transcript: { path: SOURCE_TRANSCRIPT, ...transcriptSource },
      },
      effect: "Creates one Episode 4 playback/correction fixture and one quarantined AI speaker proposal. It does not accept the proposal or claim a human listen.",
      nextAction: sourceReady
        ? "Run again with --apply after confirming the local database target."
        : "Provide QUIPSLY_DOGFOOD_SOURCE_AUDIO and QUIPSLY_DOGFOOD_SOURCE_TRANSCRIPT paths to an authorized local fixture before using --apply.",
    }, null, 2));
    if (!sourceReady) process.exitCode = 2;
    return;
  }

  assertLocalDatabase(DATABASE_URL);
  if (!audioSource.exists || !transcriptSource.exists) {
    throw new Error(
      "Transcript dogfood source is unavailable. Set QUIPSLY_DOGFOOD_SOURCE_AUDIO and "
      + "QUIPSLY_DOGFOOD_SOURCE_TRANSCRIPT to authorized local fixture files.",
    );
  }

  const [audioBytes, transcriptBytes] = await Promise.all([readFile(SOURCE_AUDIO), readFile(SOURCE_TRANSCRIPT)]);
  const transcript = JSON.parse(transcriptBytes.toString("utf8"));
  const sourceSegments = Array.isArray(transcript.segments) ? transcript.segments : [];
  const segments = sourceSegments.length
    ? sourceSegments.map(publicSegment).filter((segment) => segment.text && Number.isFinite(segment.startSeconds) && Number.isFinite(segment.endSeconds))
    : [];
  const words = publicWords(sourceSegments);
  if (!segments.length) throw new Error("Episode 4 transcript fixture has no usable segments.");

  await mkdir(LOCAL_MEDIA_ROOT, { recursive: true });
  await copyFile(SOURCE_AUDIO, LOCAL_AUDIO);
  const copied = await stat(LOCAL_AUDIO);
  const checksum = sha256(audioBytes);
  const decodedSignal = await analyzeAudioSignalFile(LOCAL_AUDIO);
  const reportedSourceProfile = {
    kind: "quipsly-local-decoded-source-profile-v1",
    source: "quipsly-local-transcript-correction-dogfood",
    container: decodedSignal.media.container,
    codec: decodedSignal.media.codec,
    audioSampleRate: decodedSignal.media.sampleRate,
    audioChannelCount: decodedSignal.media.channelCount,
    recordedMedia: {
      videoTrackCount: 0,
      audioTrackCount: 1,
      audioSampleRate: decodedSignal.media.sampleRate,
      audioChannelCount: decodedSignal.media.channelCount,
      durationSeconds: decodedSignal.media.durationSeconds,
    },
    audioCapturePipeline: "authorized-local-source-complete-ffmpeg-decode",
    pauseTimelinePolicy: "source-window-preserved-without-reconstruction",
    sourceSha256: checksum,
    immutableSource: true,
    audioSignal: decodedSignal.audioSignal,
  };

  const prisma = new PrismaClient({ adapter: new PrismaPg(DATABASE_URL), log: ["error"] });
  try {
    const existingTranscriptJob = await prisma.transcriptJob.findUnique({
      where: { id: JOB_ID },
      select: { resultJson: true },
    });
    const existingTranscriptSha256 = existingTranscriptJob?.resultJson
      && typeof existingTranscriptJob.resultJson === "object"
      && !Array.isArray(existingTranscriptJob.resultJson)
      ? existingTranscriptJob.resultJson.sourceTranscriptSha256
      : null;
    if (existingTranscriptSha256 && existingTranscriptSha256 !== sha256(transcriptBytes)) {
      throw new Error(
        "Refusing to rewrite immutable provider transcript evidence. Use new fixture identities for a different source transcript.",
      );
    }
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
    await prisma.callParticipant.upsert({
      where: { id: PARTICIPANT_ID },
      update: {
        roomId: ROOM_ID,
        userId: actor.id,
        displayName: "Charlie",
        email: FIXTURE_ACTOR_EMAIL,
        role: "HOST",
        deviceLabel: "Authorized local transcript fixture",
      },
      create: {
        id: PARTICIPANT_ID,
        roomId: ROOM_ID,
        userId: actor.id,
        displayName: "Charlie",
        email: FIXTURE_ACTOR_EMAIL,
        role: "HOST",
        deviceLabel: "Authorized local transcript fixture",
        joinedAt: new Date("2026-07-18T23:00:00.000Z"),
        leftAt: new Date("2026-07-18T23:01:00.000Z"),
      },
    });
    await prisma.recordingConsent.upsert({
      where: { id: CONSENT_ID },
      update: {
        roomId: ROOM_ID,
        participantId: PARTICIPANT_ID,
        userId: actor.id,
        status: "GRANTED",
        consentText: MOBILE_CAPTURE_CONSENT_TEXT,
        policyVersion: MOBILE_CAPTURE_CONSENT_POLICY_VERSION,
        canRecordAudio: true,
        canRecordVideo: false,
        canTranscribe: true,
        consentedAt: new Date("2026-07-18T23:00:00.000Z"),
        declinedAt: null,
        revokedAt: null,
        metadataJson: {
          source: "quipsly-local-transcript-correction-dogfood",
          localOnly: true,
          consentEvidenceVersion: MOBILE_CAPTURE_CONSENT_EVIDENCE_VERSION,
          consentTextHash: MOBILE_CAPTURE_CONSENT_TEXT_SHA256,
          recordingChoiceExplicit: true,
          transcriptionChoiceExplicit: true,
          allAudibleParticipantsNotifiedAndAgreed: true,
          presentationEvidence: {
            version: 1,
            surface: "quipsly-capture-consent-v2",
          },
        },
      },
      create: {
        id: CONSENT_ID,
        roomId: ROOM_ID,
        participantId: PARTICIPANT_ID,
        userId: actor.id,
        status: "GRANTED",
        consentText: MOBILE_CAPTURE_CONSENT_TEXT,
        policyVersion: MOBILE_CAPTURE_CONSENT_POLICY_VERSION,
        canRecordAudio: true,
        canRecordVideo: false,
        canTranscribe: true,
        consentedAt: new Date("2026-07-18T23:00:00.000Z"),
        metadataJson: {
          source: "quipsly-local-transcript-correction-dogfood",
          localOnly: true,
          consentEvidenceVersion: MOBILE_CAPTURE_CONSENT_EVIDENCE_VERSION,
          consentTextHash: MOBILE_CAPTURE_CONSENT_TEXT_SHA256,
          recordingChoiceExplicit: true,
          transcriptionChoiceExplicit: true,
          allAudibleParticipantsNotifiedAndAgreed: true,
          presentationEvidence: {
            version: 1,
            surface: "quipsly-capture-consent-v2",
          },
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
      update: { url: `/api/ingest/media/${SOURCE_ID}`, sizeBytes: BigInt(copied.size), duration: decodedSignal.media.durationSeconds },
      create: {
        id: MEDIA_ASSET_ID,
        filename: path.basename(LOCAL_AUDIO),
        url: `/api/ingest/media/${SOURCE_ID}`,
        mimeType: "audio/wav",
        sizeBytes: BigInt(copied.size),
        duration: decodedSignal.media.durationSeconds,
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
        participantId: PARTICIPANT_ID,
        kind: "LOCAL_AUDIO",
        status: "VERIFIED",
        fileName: path.basename(LOCAL_AUDIO),
        contentType: "audio/wav",
        byteSize: BigInt(copied.size),
        durationSeconds: decodedSignal.media.durationSeconds,
        storageBucket: "local-dogfood",
        storageObjectPath: "episode-4/charlie-680-740.wav",
        checksum,
        uploadedAt: new Date("2026-07-18T23:01:05.000Z"),
        verifiedAt: new Date("2026-07-18T23:01:06.000Z"),
        localManifestJson: {
          source: "quipsly-local-transcript-correction-dogfood",
          reportedSourceProfile,
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
        participantId: PARTICIPANT_ID,
        kind: "LOCAL_AUDIO",
        status: "VERIFIED",
        fileName: path.basename(LOCAL_AUDIO),
        contentType: "audio/wav",
        byteSize: BigInt(copied.size),
        durationSeconds: decodedSignal.media.durationSeconds,
        storageBucket: "local-dogfood",
        storageObjectPath: "episode-4/charlie-680-740.wav",
        checksum,
        uploadedAt: new Date("2026-07-18T23:01:05.000Z"),
        verifiedAt: new Date("2026-07-18T23:01:06.000Z"),
        localManifestJson: {
          source: "quipsly-local-transcript-correction-dogfood",
          reportedSourceProfile,
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
    for (const word of words) {
      await prisma.transcriptWord.upsert({
        where: {
          transcriptJobId_providerWordIndex: {
            transcriptJobId: word.transcriptJobId,
            providerWordIndex: word.providerWordIndex,
          },
        },
        update: {
          segmentId: word.segmentId,
          startSeconds: word.startSeconds,
          endSeconds: word.endSeconds,
          word: word.word,
          punctuatedWord: word.punctuatedWord,
          confidence: word.confidence,
          speakerLabel: word.speakerLabel,
          channel: word.channel,
          metadataJson: word.metadataJson,
        },
        create: word,
      });
    }

    const operatorActor = { id: operator.id, email: OPERATOR_EMAIL, isStaff: false };
    const deskBefore = await readTranscriptCorrectionDesk({
      prisma,
      roomId: ROOM_ID,
      actor: operatorActor,
    });
    const first = deskBefore.segments[0];
    if (!first) {
      throw new Error(
        `Correction desk did not return transcript segments: ${
          deskBefore.gate?.error || deskBefore.transcriptStatus || "unknown transcript gate"
        }`,
      );
    }
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
    const reviewedProposal = deskAfter.segments[0]?.correctionHistory.find((correction) => (
      correction.origin === "ai"
      && correction.status !== "proposed"
      && correction.correctedText === proposal.correction.correctedText
      && correction.correctedSpeakerLabel === proposal.correction.correctedSpeakerLabel
      && correction.reason === proposal.correction.reason
    )) ?? null;
    const visibleProposal = deskAfter.segments[0]?.proposals.find((correction) => (
      correction.correctedText === proposal.correction.correctedText
      && correction.correctedSpeakerLabel === proposal.correction.correctedSpeakerLabel
      && correction.reason === proposal.correction.reason
    )) ?? null;
    const proposalState = reviewedProposal ?? visibleProposal ?? proposal.correction;

    console.log(JSON.stringify({
      ok: true,
      localOnly: true,
      actorEmail: OPERATOR_EMAIL,
      roomId: ROOM_ID,
      reviewPath: `/sessions/${ROOM_ID}`,
      playback: deskAfter.playback,
      transcriptJobId: deskAfter.transcriptJobId,
      segmentCount: deskAfter.segments.length,
      wordCount: deskAfter.segments.reduce((total, segment) => total + segment.words.length, 0),
      firstSegment: {
        id: first.id,
        mediaTime: [first.startSeconds, first.endSeconds],
        providerText: first.providerText,
        providerSpeakerLabel: first.providerSpeakerLabel,
      },
      proposalRequestReceipt: proposal.correction,
      proposalState,
      proposalAccepted: proposalState.status === "accepted",
      proposalPending: Boolean(visibleProposal),
      humanListenPerformed: false,
      nextAction: visibleProposal
        ? "Open the signed-in session review, play the timestamp, then accept or reject the speaker proposal. No script is allowed to claim that listen."
        : "The prior proposal decision remains preserved. This script will not revive an identical decided proposal or claim a new human listen.",
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
