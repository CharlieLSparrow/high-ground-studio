/** @jest-environment node */

import { randomUUID } from "node:crypto";

import {
  buildCaptureTranscriptManifestObjectName,
  buildCaptureTranscriptRawObjectName,
  buildCaptureTranscriptResultObjectName,
  claimCaptureTranscriptManifest,
  completeCaptureTranscriptManifest,
  newCaptureTranscriptManifest,
  type CaptureTranscriptResult,
} from "@high-ground/quipsly-media-processing";

import { getPrismaClient } from "@/lib/prisma";
import { getMediaBucket } from "@/lib/server/gcs";
import {
  MOBILE_CAPTURE_CONSENT_EVIDENCE_VERSION,
  MOBILE_CAPTURE_CONSENT_POLICY_VERSION,
  MOBILE_CAPTURE_CONSENT_TEXT,
  MOBILE_CAPTURE_CONSENT_TEXT_SHA256,
} from "@/lib/server/mobile-capture-consent-readiness.js";

import { reconcileCaptureTranscriptJob } from "./capture-transcript-reconciliation";
import { readTranscriptCorrectionDesk } from "./transcript-corrections";

jest.mock("@/lib/server/gcs", () => ({
  getMediaBucket: jest.fn(),
}));

const runLocalDatabaseSmoke =
  process.env.QUIPSLY_LOCAL_DB_SMOKE === "1" ? describe : describe.skip;
if (process.env.QUIPSLY_LOCAL_DB_SMOKE === "1") {
  if (!process.env.QUIPSLY_LOCAL_DATABASE_URL) {
    throw new Error(
      "QUIPSLY_LOCAL_DATABASE_URL is required for transcript privacy proof.",
    );
  }
  process.env.DATABASE_URL = process.env.QUIPSLY_LOCAL_DATABASE_URL;
}

runLocalDatabaseSmoke("transcript consent quarantine local database proof", () => {
  const prisma = getPrismaClient();
  const nonce = randomUUID().slice(0, 8);
  const bucketObjects = new Map<string, unknown>();
  let userId = "";
  let roomId = "";
  let participantId = "";
  let consentId = "";
  let recordingAssetId = "";
  let transcriptJobId = "";
  let uploadSessionId = "";

  beforeAll(async () => {
    jest.mocked(getMediaBucket).mockReturnValue({
      file: (objectName: string) => ({
        download: async () => {
          if (!bucketObjects.has(objectName)) {
            throw Object.assign(new Error("not found"), { code: 404 });
          }
          return [Buffer.from(JSON.stringify(bucketObjects.get(objectName)))];
        },
      }),
    } as any);
    const user = await prisma.user.create({
      data: {
        primaryEmail: `transcript-privacy-${nonce}@example.test`,
        name: "Transcript privacy proof",
      },
    });
    userId = user.id;
    const room = await prisma.callRoom.create({
      data: {
        title: "Transcript consent quarantine proof",
        createdByUserId: userId,
      },
    });
    roomId = room.id;
    const participant = await prisma.callParticipant.create({
      data: {
        roomId,
        userId,
        displayName: "Transcript privacy proof",
        role: "HOST",
      },
    });
    participantId = participant.id;
    const consent = await prisma.recordingConsent.create({
      data: currentConsentData(),
    });
    consentId = consent.id;
    const sourceSha256 = "a".repeat(64);
    const asset = await prisma.recordingAsset.create({
      data: {
        roomId,
        participantId,
        kind: "LOCAL_AUDIO",
        status: "VERIFIED",
        fileName: "authorized-speech.wav",
        contentType: "audio/wav",
        byteSize: 4096n,
        durationSeconds: 2.5,
        storageBucket: "quipsly-test-bucket",
        storageObjectPath:
          `media-vault/recordings/privacy-proof/${nonce}/source.wav`,
        checksum: sourceSha256,
        verifiedAt: new Date(),
      },
    });
    recordingAssetId = asset.id;
    uploadSessionId = randomUUID();
    await prisma.mobileCaptureFinalizationReceipt.create({
      data: {
        uploadSessionId,
        captureId: randomUUID(),
        roomId,
        actorUserId: userId,
        processingDisposition: "RELEASED",
        transcriptDisposition: "RELEASED",
        recordingAssetId,
        metadataJson: {
          immutableUploadBinding: {
            uploadSessionId,
            roomId,
            sha256: sourceSha256,
            bucketName: asset.storageBucket,
            objectName: asset.storageObjectPath,
            sizeBytes: 4096,
          },
        },
      },
    });
    const job = await prisma.transcriptJob.create({
      data: {
        roomId,
        assetId: recordingAssetId,
        status: "RUNNING",
        provider: "deepgram",
        requestedBy: userId,
        sourceGeneration: "1730000000000001",
        sourceSha256,
      },
    });
    transcriptJobId = job.id;
    const receipts = completedReceipts({
      jobId: transcriptJobId,
      roomId,
      recordingAssetId,
      sourceObjectName: asset.storageObjectPath!,
      sourceSha256,
    });
    bucketObjects.set(
      buildCaptureTranscriptManifestObjectName(transcriptJobId),
      receipts.manifest,
    );
    bucketObjects.set(
      buildCaptureTranscriptResultObjectName(transcriptJobId),
      receipts.result,
    );
    await prisma.transcriptJob.update({
      where: { id: transcriptJobId },
      data: {
        processingManifestObject:
          buildCaptureTranscriptManifestObjectName(transcriptJobId),
      },
    });
  });

  afterAll(async () => {
    try {
      if (recordingAssetId) {
        await prisma.mobileCaptureFinalizationReceipt.deleteMany({
          where: { recordingAssetId },
        });
      }
      if (roomId) {
        await prisma.callRoom.deleteMany({ where: { id: roomId } });
      }
      if (userId) {
        await prisma.user.deleteMany({ where: { id: userId } });
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  it("quarantines completed text on revoke and restores the same rows after re-consent", async () => {
    await expect(reconcileCaptureTranscriptJob({
      prisma,
      transcriptJobId,
    })).resolves.toMatchObject({
      status: "completed",
      segmentCount: 1,
      wordCount: 1,
      alreadyCompleted: false,
    });
    const originalSegments = await prisma.transcriptSegment.findMany({
      where: { transcriptJobId },
      select: { id: true, text: true },
    });
    const originalWords = await prisma.transcriptWord.findMany({
      where: { transcriptJobId },
      select: { id: true, providerWordIndex: true, word: true },
    });

    await prisma.recordingConsent.update({
      where: { id: consentId },
      data: {
        status: "REVOKED",
        canRecordAudio: false,
        canRecordVideo: false,
        canTranscribe: false,
        revokedAt: new Date(),
      },
    });
    await expect(reconcileCaptureTranscriptJob({
      prisma,
      transcriptJobId,
    })).resolves.toMatchObject({ status: "held" });
    const heldJob = await prisma.transcriptJob.findUniqueOrThrow({
      where: { id: transcriptJobId },
      include: { _count: { select: { segments: true, words: true } } },
    });
    expect(heldJob).toMatchObject({
      status: "HELD",
      provider: "processing-hold",
      _count: { segments: 1, words: 1 },
      resultJson: {
        hold: {
          projectedRowsPreservedButQuarantined: true,
          explicitReleaseRequired: true,
        },
      },
    });

    await prisma.recordingConsent.update({
      where: { id: consentId },
      data: currentConsentData(),
    });
    await expect(reconcileCaptureTranscriptJob({
      prisma,
      transcriptJobId,
    })).resolves.toMatchObject({
      status: "completed",
      segmentCount: 1,
      wordCount: 1,
      alreadyCompleted: true,
    });
    const [releasedJob, releasedSegments, releasedWords] = await Promise.all([
      prisma.transcriptJob.findUniqueOrThrow({
        where: { id: transcriptJobId },
      }),
      prisma.transcriptSegment.findMany({
        where: { transcriptJobId },
        select: { id: true, text: true },
      }),
      prisma.transcriptWord.findMany({
        where: { transcriptJobId },
        select: { id: true, providerWordIndex: true, word: true },
      }),
    ]);
    expect(releasedJob).toMatchObject({
      status: "COMPLETED",
      resultJson: {
        consentHoldRelease: {
          currentAllPartyConsentRechecked: true,
          providerEvidenceRewritten: false,
          transcriptRowsRewritten: false,
        },
      },
    });
    expect(releasedSegments).toEqual(originalSegments);
    expect(releasedWords).toEqual(originalWords);

    await expect(readTranscriptCorrectionDesk({
      prisma,
      roomId,
      actor: {
        id: userId,
        email: `transcript-privacy-${nonce}@example.test`,
        isStaff: false,
      },
    })).resolves.toMatchObject({
      gate: { allowed: true },
      playback: null,
      segments: [{
        text: "Private proof.",
        startSeconds: 0.25,
        endSeconds: 0.8,
      }],
    });
  });

  function currentConsentData() {
    return {
      roomId,
      participantId,
      userId,
      status: "GRANTED" as const,
      consentText: MOBILE_CAPTURE_CONSENT_TEXT,
      policyVersion: MOBILE_CAPTURE_CONSENT_POLICY_VERSION,
      canRecordAudio: true,
      canRecordVideo: false,
      canTranscribe: true,
      consentedAt: new Date(),
      declinedAt: null,
      revokedAt: null,
      metadataJson: {
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
    };
  }
});

function completedReceipts(input: {
  jobId: string;
  roomId: string;
  recordingAssetId: string;
  sourceObjectName: string;
  sourceSha256: string;
}) {
  const source = {
    bucketName: "quipsly-test-bucket",
    objectName: input.sourceObjectName,
    generation: "1730000000000001",
    sizeBytes: 4096,
    sha256: input.sourceSha256,
    contentType: "audio/wav",
    roomId: input.roomId,
    recordingAssetId: input.recordingAssetId,
  };
  const queuedAt = "2026-07-30T20:00:00.000Z";
  const queued = newCaptureTranscriptManifest({
    jobId: input.jobId,
    actorUserId: "privacy-proof-actor",
    actorEmail: "privacy-proof@example.test",
    source,
    provider: {
      name: "deepgram",
      model: "nova-3",
      language: "en-US",
      smartFormat: true,
      punctuate: true,
      diarize: true,
      diarizeModel: "latest",
      multichannel: false,
      utterances: true,
      paragraphs: true,
    },
    queuedAt,
    updatedAt: queuedAt,
  });
  const processing = claimCaptureTranscriptManifest({
    manifest: queued,
    leaseId: "privacy-proof-lease",
    executionId: "privacy-proof-execution",
    now: new Date("2026-07-30T20:00:01.000Z"),
    leaseDurationMs: 60_000,
  })!;
  const result: CaptureTranscriptResult = {
    kind: "quipsly-capture-transcript-result-v1",
    version: 1,
    jobId: input.jobId,
    manifestObjectName:
      buildCaptureTranscriptManifestObjectName(input.jobId),
    source,
    provider: {
      name: "deepgram",
      model: "nova-3",
      requestId: "privacy-proof-provider-request",
      durationSeconds: 2.5,
      channels: 1,
    },
    rawProviderResponse: {
      bucketName: source.bucketName,
      objectName: buildCaptureTranscriptRawObjectName(input.jobId),
      generation: "1730000000000002",
      sizeBytes: 1024,
      sha256: "b".repeat(64),
      contentType: "application/json",
    },
    segments: [{
      ordinal: 0,
      startSeconds: 0.25,
      endSeconds: 0.8,
      text: "Private proof.",
      confidence: 0.98,
      speakerLabel: "speaker_0",
      channel: 0,
      providerShape: "deepgram-word-group",
      wordStartIndex: 0,
      wordEndIndexExclusive: 1,
    }],
    words: [{
      index: 0,
      startSeconds: 0.25,
      endSeconds: 0.8,
      word: "proof",
      punctuatedWord: "Proof.",
      confidence: 0.98,
      speakerLabel: "speaker_0",
      channel: 0,
    }],
    worker: {
      executionId: "privacy-proof-execution",
      buildId: "privacy-proof-build",
      imageDigest: "sha256:privacy-proof",
    },
    completedAt: "2026-07-30T20:00:10.000Z",
  };
  return {
    result,
    manifest: completeCaptureTranscriptManifest({
      manifest: processing,
      leaseId: "privacy-proof-lease",
      result,
      now: new Date(result.completedAt),
    }),
  };
}
