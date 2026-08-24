/** @jest-environment node */

import {
  buildCaptureTranscriptManifestObjectName,
  buildCaptureTranscriptRawObjectName,
  buildCaptureTranscriptResultObjectName,
  claimCaptureTranscriptManifest,
  completeCaptureTranscriptManifest,
  newCaptureTranscriptManifest,
  type CaptureTranscriptResult,
} from "@high-ground/quipsly-media-processing";

import { getMediaBucket } from "@/lib/server/gcs";
import { mobileCaptureTranscriptProcessingGate } from "@/lib/server/mobile-capture-processing-gates";

import { reconcileCaptureTranscriptJob } from "./capture-transcript-reconciliation";

jest.mock("@/lib/server/gcs", () => ({
  getMediaBucket: jest.fn(),
}));
jest.mock("@/lib/server/mobile-capture-processing-gates", () => ({
  mobileCaptureTranscriptProcessingGate: jest.fn(),
}));

const jobId = "transcript-job-0001";
const roomId = "episode-room-0001";
const recordingAssetId = "recording-asset-0001";
const source = {
  bucketName: "quipsly-test-bucket",
  objectName: "media-vault/recordings/test/source.wav",
  generation: "1730000000000001",
  sizeBytes: 4096,
  sha256: "a".repeat(64),
  contentType: "audio/wav",
  roomId,
  recordingAssetId,
};
const queuedAt = "2026-07-30T18:00:00.000Z";

function completedReceipts(receiptSource = source) {
  const queued = newCaptureTranscriptManifest({
    jobId,
    actorUserId: "user-0001",
    actorEmail: "producer@example.com",
    source: receiptSource,
    provider: {
      name: "deepgram",
      model: "nova-3",
      language: "en-US",
      smartFormat: true,
      punctuate: true,
      diarize: true,
      diarizeModel: "v2",
      multichannel: false,
      utterances: true,
      paragraphs: true,
    },
    queuedAt,
    updatedAt: queuedAt,
  });
  const processing = claimCaptureTranscriptManifest({
    manifest: queued,
    leaseId: "lease-0001",
    executionId: "execution-0001",
    now: new Date("2026-07-30T18:00:01.000Z"),
    leaseDurationMs: 60_000,
  })!;
  const result: CaptureTranscriptResult = {
    kind: "quipsly-capture-transcript-result-v1",
    version: 1,
    jobId,
    manifestObjectName:
      buildCaptureTranscriptManifestObjectName(jobId),
    source: receiptSource,
    provider: {
      name: "deepgram",
      model: "nova-3",
      requestId: "deepgram-request-0001",
      durationSeconds: 2.5,
      channels: 1,
    },
    rawProviderResponse: {
      bucketName: receiptSource.bucketName,
      objectName: buildCaptureTranscriptRawObjectName(jobId),
      generation: "1730000000000002",
      sizeBytes: 1024,
      sha256: "b".repeat(64),
      contentType: "application/json",
    },
    segments: [
      {
        ordinal: 0,
        startSeconds: 1.25,
        endSeconds: 1.7,
        text: "Hello.",
        confidence: 0.98,
        speakerLabel: "speaker_0",
        channel: 0,
        providerShape: "deepgram-utterance",
        wordStartIndex: 0,
        wordEndIndexExclusive: 1,
      },
    ],
    words: [
      {
        index: 0,
        startSeconds: 1.25,
        endSeconds: 1.7,
        word: "hello",
        punctuatedWord: "Hello.",
        confidence: 0.98,
        speakerLabel: "speaker_0",
        channel: 0,
      },
    ],
    worker: {
      executionId: "execution-0001",
      buildId: "build-0001",
      imageDigest: "sha256:worker",
    },
    completedAt: "2026-07-30T18:00:10.000Z",
  };
  const manifest = completeCaptureTranscriptManifest({
    manifest: processing,
    leaseId: "lease-0001",
    result,
    now: new Date(result.completedAt),
  });
  return { manifest, result };
}

function installBucketObjects(objects: Record<string, unknown>) {
  jest.mocked(getMediaBucket).mockReturnValue({
    file: (objectName: string) => ({
      download: jest.fn(async () => {
        if (!(objectName in objects)) {
          throw Object.assign(new Error("not found"), { code: 404 });
        }
        return [Buffer.from(JSON.stringify(objects[objectName]))];
      }),
    }),
  } as any);
}

function canonicalJob() {
  return {
    id: jobId,
    roomId,
    status: "RUNNING",
    errorMessage: null,
    resultJson: {},
    processingManifestObject:
      buildCaptureTranscriptManifestObjectName(jobId),
    sourceGeneration: source.generation,
    sourceSha256: source.sha256,
    asset: {
      id: recordingAssetId,
      roomId,
      storageBucket: source.bucketName,
      storageObjectPath: source.objectName,
    },
    _count: { segments: 0, words: 0 },
  };
}

describe("capture transcript reconciliation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("rechecks consent after worker completion and projects no text when held", async () => {
    const { manifest, result } = completedReceipts();
    installBucketObjects({
      [buildCaptureTranscriptManifestObjectName(jobId)]: manifest,
      [buildCaptureTranscriptResultObjectName(jobId)]: result,
    });
    jest.mocked(mobileCaptureTranscriptProcessingGate).mockResolvedValue({
      allowed: false,
      error: "Recording consent was revoked.",
      errorCode: "TRANSCRIPT_CONSENT_REVOKED",
    } as any);
    const update = jest.fn().mockResolvedValue({});
    const transaction = jest.fn();
    const prisma = {
      transcriptJob: {
        findUnique: jest.fn().mockResolvedValue(canonicalJob()),
        update,
      },
      $transaction: transaction,
    };

    const reconciliation = await reconcileCaptureTranscriptJob({
      prisma,
      transcriptJobId: jobId,
    });

    expect(reconciliation).toMatchObject({
      status: "held",
      transcriptJobId: jobId,
    });
    expect(transaction).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: jobId },
      data: expect.objectContaining({
        status: "HELD",
        processingResultObject:
          buildCaptureTranscriptResultObjectName(jobId),
        resultJson: expect.objectContaining({
          hold: expect.objectContaining({
            workerResultPreservedPrivately: true,
            transcriptTextProjected: false,
            explicitReleaseRequired: true,
          }),
        }),
      }),
    }));
  });

  it("reconciles a verified interruption-repair derivative against original RecordingAsset lineage", async () => {
    const repairedSource = {
      ...source,
      bucketName: "quipsly-repair-bucket",
      objectName: "media-vault/repair/repaired.webm",
      generation: "1730000000000052",
      sizeBytes: 4_128,
      sha256: "b".repeat(64),
      contentType: "video/webm",
    };
    const { manifest, result } = completedReceipts(repairedSource);
    installBucketObjects({
      [buildCaptureTranscriptManifestObjectName(jobId)]: manifest,
      [buildCaptureTranscriptResultObjectName(jobId)]: result,
    });
    jest.mocked(mobileCaptureTranscriptProcessingGate).mockResolvedValue({
      allowed: false,
      error: "Recording consent was revoked after processing.",
      errorCode: "TRANSCRIPT_CONSENT_REVOKED",
    } as any);
    const original = {
      bucketName: source.bucketName,
      objectName: source.objectName,
      generation: source.generation,
      sizeBytes: source.sizeBytes,
      sha256: source.sha256,
    };
    const job = {
      ...canonicalJob(),
      sourceGeneration: repairedSource.generation,
      sourceSha256: repairedSource.sha256,
      asset: {
        ...canonicalJob().asset,
        byteSize: BigInt(source.sizeBytes),
        checksum: source.sha256,
        contentType: "video/webm",
        localManifestJson: {
          storageGeneration: source.generation,
          interruptionRepair: {
            status: "verified",
            originalRemainsSourceTruth: true,
            original,
            derivative: repairedSource,
          },
        },
      },
    };
    const update = jest.fn().mockResolvedValue({});
    const prisma = {
      transcriptJob: {
        findUnique: jest.fn().mockResolvedValue(job),
        update,
      },
      $transaction: jest.fn(),
    };

    await expect(reconcileCaptureTranscriptJob({
      prisma,
      transcriptJobId: jobId,
    })).resolves.toMatchObject({ status: "held", transcriptJobId: jobId });
    expect(getMediaBucket).toHaveBeenCalledWith("quipsly-repair-bucket");
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "HELD" }),
    }));
  });

  it("atomically appends segments and stable word anchors once", async () => {
    const { manifest, result } = completedReceipts();
    installBucketObjects({
      [buildCaptureTranscriptManifestObjectName(jobId)]: manifest,
      [buildCaptureTranscriptResultObjectName(jobId)]: result,
    });
    jest.mocked(mobileCaptureTranscriptProcessingGate).mockResolvedValue({
      allowed: true,
    } as any);
    const segmentCreate = jest.fn().mockResolvedValue({
      id: "segment-db-0001",
    });
    const wordCreateMany = jest.fn().mockResolvedValue({ count: 1 });
    const jobUpdate = jest.fn().mockResolvedValue({});
    const tx = {
      transcriptJob: {
        findUnique: jest.fn().mockResolvedValue(canonicalJob()),
        update: jobUpdate,
      },
      transcriptSegment: { create: segmentCreate },
      transcriptWord: { createMany: wordCreateMany },
    };
    const transaction = jest.fn(
      async (operation: (client: typeof tx) => unknown) => operation(tx),
    );
    const prisma = {
      transcriptJob: {
        findUnique: jest.fn().mockResolvedValue(canonicalJob()),
      },
      $transaction: transaction,
    };

    const reconciliation = await reconcileCaptureTranscriptJob({
      prisma,
      transcriptJobId: jobId,
    });

    expect(reconciliation).toEqual({
      status: "completed",
      transcriptJobId: jobId,
      segmentCount: 1,
      wordCount: 1,
      alreadyCompleted: false,
    });
    expect(transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: "Serializable" },
    );
    expect(segmentCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        transcriptJobId: jobId,
        metadataJson: expect.objectContaining({
          providerSegmentOrdinal: 0,
          wordStartIndex: 0,
          wordEndIndexExclusive: 1,
        }),
      }),
    }));
    expect(wordCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          transcriptJobId: jobId,
          segmentId: "segment-db-0001",
          providerWordIndex: 0,
          startSeconds: 1.25,
          endSeconds: 1.7,
          word: "hello",
          punctuatedWord: "Hello.",
        }),
      ],
    });
    expect(jobUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: jobId },
      data: expect.objectContaining({
        status: "COMPLETED",
        providerRequestId: "deepgram-request-0001",
        providerResponseObject:
          buildCaptureTranscriptRawObjectName(jobId),
        workerBuildId: "build-0001",
      }),
    }));
  });

  it("rechecks consent inside the serializable write and projects no text after a racing revocation", async () => {
    const { manifest, result } = completedReceipts();
    installBucketObjects({
      [buildCaptureTranscriptManifestObjectName(jobId)]: manifest,
      [buildCaptureTranscriptResultObjectName(jobId)]: result,
    });
    jest.mocked(mobileCaptureTranscriptProcessingGate)
      .mockResolvedValueOnce({ allowed: true } as any)
      .mockResolvedValueOnce({
        allowed: false,
        error: "Current transcription consent was revoked.",
        errorCode: "CURRENT_ALL_PARTY_TRANSCRIPTION_CONSENT_REQUIRED",
      } as any);
    const jobUpdate = jest.fn().mockResolvedValue({});
    const segmentCreate = jest.fn();
    const wordCreateMany = jest.fn();
    const tx = {
      transcriptJob: {
        findUnique: jest.fn().mockResolvedValue(canonicalJob()),
        update: jobUpdate,
      },
      transcriptSegment: { create: segmentCreate },
      transcriptWord: { createMany: wordCreateMany },
      mobileCaptureFinalizationReceipt: { findMany: jest.fn() },
      callRoom: { findUnique: jest.fn() },
    };
    const prisma = {
      transcriptJob: {
        findUnique: jest.fn().mockResolvedValue(canonicalJob()),
      },
      $transaction: jest.fn(
        async (operation: (client: typeof tx) => unknown) => operation(tx),
      ),
    };

    await expect(reconcileCaptureTranscriptJob({
      prisma,
      transcriptJobId: jobId,
    })).resolves.toMatchObject({
      status: "held",
      transcriptJobId: jobId,
    });
    expect(segmentCreate).not.toHaveBeenCalled();
    expect(wordCreateMany).not.toHaveBeenCalled();
    expect(jobUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: "HELD",
        resultJson: expect.objectContaining({
          hold: expect.objectContaining({
            transcriptTextProjected: false,
            projectedRowsPreservedButQuarantined: false,
          }),
        }),
      }),
    }));
  });

  it("quarantines an already-completed transcript when current consent is revoked", async () => {
    const completed = {
      ...canonicalJob(),
      status: "COMPLETED",
      provider: "deepgram",
      processingResultObject: buildCaptureTranscriptResultObjectName(jobId),
      _count: { segments: 1, words: 1 },
    };
    jest.mocked(mobileCaptureTranscriptProcessingGate).mockResolvedValue({
      allowed: false,
      error: "Current transcription consent was revoked.",
      errorCode: "CURRENT_ALL_PARTY_TRANSCRIPTION_CONSENT_REQUIRED",
    } as any);
    const update = jest.fn().mockResolvedValue({});
    const tx = {
      transcriptJob: {
        findUnique: jest.fn().mockResolvedValue(completed),
        update,
      },
      mobileCaptureFinalizationReceipt: { findMany: jest.fn() },
      callRoom: { findUnique: jest.fn() },
    };
    const prisma = {
      transcriptJob: {
        findUnique: jest.fn().mockResolvedValue(completed),
        update,
      },
      $transaction: jest.fn(
        async (operation: (client: typeof tx) => unknown) => operation(tx),
      ),
    };

    await expect(reconcileCaptureTranscriptJob({
      prisma,
      transcriptJobId: jobId,
    })).resolves.toMatchObject({
      status: "held",
      transcriptJobId: jobId,
    });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: "HELD",
        resultJson: expect.objectContaining({
          hold: expect.objectContaining({
            transcriptTextProjected: true,
            projectedRowsPreservedButQuarantined: true,
          }),
        }),
      }),
    }));
  });

  it("releases matching quarantined provider rows without rewriting them", async () => {
    const { manifest, result } = completedReceipts();
    installBucketObjects({
      [buildCaptureTranscriptManifestObjectName(jobId)]: manifest,
      [buildCaptureTranscriptResultObjectName(jobId)]: result,
    });
    jest.mocked(mobileCaptureTranscriptProcessingGate).mockResolvedValue({
      allowed: true,
    } as any);
    const held = {
      ...canonicalJob(),
      status: "HELD",
      provider: "processing-hold",
      completedAt: new Date(result.completedAt),
      processingResultObject: buildCaptureTranscriptResultObjectName(jobId),
      providerRequestId: result.provider.requestId,
      providerResponseObject: result.rawProviderResponse.objectName,
      workerBuildId: result.worker.buildId,
      _count: { segments: 1, words: 1 },
      resultJson: { hold: { explicitReleaseRequired: true } },
    };
    const update = jest.fn().mockResolvedValue({});
    const segmentCreate = jest.fn();
    const wordCreateMany = jest.fn();
    const tx = {
      transcriptJob: {
        findUnique: jest.fn().mockResolvedValue(held),
        update,
      },
      transcriptSegment: { create: segmentCreate },
      transcriptWord: { createMany: wordCreateMany },
      mobileCaptureFinalizationReceipt: { findMany: jest.fn() },
      callRoom: { findUnique: jest.fn() },
    };
    const prisma = {
      transcriptJob: {
        findUnique: jest.fn().mockResolvedValue(held),
      },
      $transaction: jest.fn(
        async (operation: (client: typeof tx) => unknown) => operation(tx),
      ),
    };

    await expect(reconcileCaptureTranscriptJob({
      prisma,
      transcriptJobId: jobId,
    })).resolves.toEqual({
      status: "completed",
      transcriptJobId: jobId,
      segmentCount: 1,
      wordCount: 1,
      alreadyCompleted: true,
    });
    expect(segmentCreate).not.toHaveBeenCalled();
    expect(wordCreateMany).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: "COMPLETED",
        resultJson: expect.objectContaining({
          consentHoldRelease: expect.objectContaining({
            currentAllPartyConsentRechecked: true,
            providerEvidenceRewritten: false,
            transcriptRowsRewritten: false,
          }),
        }),
      }),
    }));
  });
});
