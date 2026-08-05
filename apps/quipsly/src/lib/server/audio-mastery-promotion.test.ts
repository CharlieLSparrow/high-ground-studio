/** @jest-environment node */

import {
  AudioMasteryReviewError,
  loadAudioMasteryReviewContext,
} from "@/lib/server/audio-mastery-review";
import { acquirePrismaAdvisoryTransactionLock } from "@/lib/server/prisma-advisory-lock";

import {
  appendAudioMasterPromotion,
  AudioMasteryPromotionError,
  readAudioMasterPromotionSummary,
} from "./audio-mastery-promotion";

jest.mock("@/lib/server/audio-mastery-review", () => ({
  AudioMasteryReviewError: class AudioMasteryReviewError extends Error {
    constructor(message: string, readonly status: number, readonly code: string) { super(message); }
  },
  loadAudioMasteryReviewContext: jest.fn(),
}));
jest.mock("@/lib/server/prisma-advisory-lock", () => ({
  acquirePrismaAdvisoryTransactionLock: jest.fn(),
}));

const context = {
  project: { id: "project-1" },
  asset: { id: "asset-1", filename: "episode.wav" },
  source: { id: "source-1" },
  row: { id: "job-1" },
  job: {
    jobId: "job-1",
    profileId: "apple-podcasts-dialogue-v1",
    source: {
      sha256: "a".repeat(64),
      generation: "generation-1",
    },
  },
  result: {
    proposal: {
      profile: {
        id: "apple-podcasts-dialogue-v1",
        label: "Apple Podcasts dialogue",
        integratedLufs: -16,
        maximumTruePeakDbtp: -1,
        renderTruePeakDbtp: -1.5,
      },
    },
    derivative: {
      sha256: "b".repeat(64),
      sizeBytes: 4_096,
      verification: { passes: true },
      verificationMeasurement: { durationSeconds: 120, integratedLufs: -16, truePeakDbtp: -1.5 },
    },
  },
  registration: { playbackUrl: "/api/ingest/media/mastered-source" },
};

const baseInput = {
  projectSlug: "high-ground-odyssey",
  assetId: "asset-1",
  sourceId: "source-1",
  jobId: "job-1",
  actor: { id: "actor-1", email: "Editor@Example.test" },
};

function review(overrides: Record<string, unknown> = {}) {
  return {
    id: "review-1",
    projectId: "project-1",
    assetId: "asset-1",
    masteryJobId: "job-1",
    decision: "APPROVED",
    sourceSha256: "a".repeat(64),
    sourceGeneration: "generation-1",
    previewSha256: "b".repeat(64),
    occurredAt: new Date("2026-08-05T12:00:00.000Z"),
    ...overrides,
  };
}

function promotion(overrides: Record<string, unknown> = {}) {
  return {
    id: "promotion-1",
    projectId: "project-1",
    assetId: "asset-1",
    masteryJobId: "job-1",
    reviewReceiptId: "review-1",
    actorEmail: "editor@example.test",
    clientRequestId: "request-1",
    operation: "PROMOTE",
    profileId: "apple-podcasts-dialogue-v1",
    sourceSha256: "a".repeat(64),
    sourceGeneration: "generation-1",
    previewSha256: "b".repeat(64),
    requestSha256: "request-hash",
    evidenceJson: { candidatePlaybackUrl: "/api/ingest/media/mastered-source" },
    reason: null,
    occurredAt: new Date("2026-08-05T12:05:00.000Z"),
    ...overrides,
  };
}

function prismaFor(input: {
  latestReview?: any;
  latestPromotion?: any;
}) {
  let createdPromotion: any = null;
  const tx = {
    studioAssetProcessingJob: {
      findFirst: jest.fn().mockResolvedValue({ id: "job-1" }),
    },
    studioAudioMasterPromotionReceipt: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockImplementation(async () => input.latestPromotion ?? createdPromotion),
      create: jest.fn().mockImplementation(async ({ data }) => {
        createdPromotion = promotion({
          id: data.operation === "PROMOTE" ? "promotion-created" : "withdrawal-created",
          ...data,
        });
        return createdPromotion;
      }),
    },
    studioAudioMasterReviewReceipt: {
      findFirst: jest.fn().mockResolvedValue(input.latestReview ?? null),
    },
    studioAssetVariant: { upsert: jest.fn().mockResolvedValue({ id: "candidate-variant" }) },
  };
  const prisma = {
    studioAudioMasterPromotionReceipt: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockImplementation(async () => createdPromotion ?? input.latestPromotion ?? null),
      count: jest.fn().mockImplementation(async ({ where }) => where.operation === "PROMOTE"
        ? Number((createdPromotion ?? input.latestPromotion)?.operation === "PROMOTE")
        : Number((createdPromotion ?? input.latestPromotion)?.operation === "WITHDRAW")),
    },
    $transaction: jest.fn().mockImplementation(async (callback) => callback(tx)),
  };
  return { prisma, tx };
}

describe("audio master promotion ledger", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(loadAudioMasteryReviewContext).mockResolvedValue(context as never);
  });

  it("promotes only the latest exact approved preview and registers a non-publishing candidate", async () => {
    const { prisma, tx } = prismaFor({ latestReview: review() });
    const result = await appendAudioMasterPromotion({
      prisma,
      ...baseInput,
      clientRequestId: "request-promote",
      operation: "promote",
      reviewReceiptId: "review-1",
    });

    expect(result).toMatchObject({
      ok: true,
      idempotentReplay: false,
      receipt: { id: "promotion-created", operation: "promote" },
      promotion: {
        active: true,
        candidatePlaybackUrl: "/api/ingest/media/mastered-source",
      },
    });
    expect(tx.studioAssetVariant.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        kind: "audio-master-candidate",
        url: "/api/ingest/media/mastered-source",
        metadataJson: expect.objectContaining({
          originalRemainsSourceTruth: true,
          episodeSpineUnchanged: true,
          deliveryEncodingNotCreated: true,
          publicationNotStarted: true,
        }),
      }),
    }));
    expect(acquirePrismaAdvisoryTransactionLock).toHaveBeenCalledWith(
      tx,
      "audio-master-promotion:project-1:asset-1",
    );
  });

  it("preserves bounded source and preview verification failures", async () => {
    jest.mocked(loadAudioMasteryReviewContext).mockRejectedValueOnce(
      new AudioMasteryReviewError(
        "The mastering preview no longer matches its verified receipt.",
        409,
        "AUDIO_MASTER_PREVIEW_DRIFT",
      ),
    );
    const { prisma } = prismaFor({ latestReview: review() });
    await expect(appendAudioMasterPromotion({
      prisma,
      ...baseInput,
      clientRequestId: "request-drifted-preview",
      operation: "promote",
      reviewReceiptId: "review-1",
    })).rejects.toMatchObject({
      status: 409,
      code: "AUDIO_MASTER_PREVIEW_DRIFT",
    });
  });

  it("rejects a stale or superseded listening decision", async () => {
    const { prisma, tx } = prismaFor({
      latestReview: review({ id: "review-new", decision: "REJECTED" }),
    });
    await expect(appendAudioMasterPromotion({
      prisma,
      ...baseInput,
      clientRequestId: "request-stale",
      operation: "promote",
      reviewReceiptId: "review-1",
    })).rejects.toMatchObject({
      code: "AUDIO_MASTER_PROMOTION_APPROVAL_STALE",
      status: 409,
    });
    expect(tx.studioAudioMasterPromotionReceipt.create).not.toHaveBeenCalled();
    expect(tx.studioAssetVariant.upsert).not.toHaveBeenCalled();
  });

  it("rejects an older mastery job even when its old approval still exists", async () => {
    const { prisma, tx } = prismaFor({ latestReview: review() });
    tx.studioAssetProcessingJob.findFirst.mockResolvedValue({ id: "job-new" });
    await expect(appendAudioMasterPromotion({
      prisma,
      ...baseInput,
      clientRequestId: "request-old-job",
      operation: "promote",
      reviewReceiptId: "review-1",
    })).rejects.toMatchObject({
      code: "AUDIO_MASTER_PROMOTION_JOB_STALE",
      status: 409,
    });
    expect(tx.studioAudioMasterPromotionReceipt.create).not.toHaveBeenCalled();
  });

  it("withdraws explicitly without deleting candidate bytes or history", async () => {
    const active = promotion();
    const { prisma, tx } = prismaFor({ latestPromotion: active });
    const result = await appendAudioMasterPromotion({
      prisma,
      ...baseInput,
      clientRequestId: "request-withdraw",
      operation: "withdraw",
      reviewReceiptId: "review-1",
      reason: "Audible pumping near the ending.",
    });
    expect(result).toMatchObject({
      receipt: {
        id: "withdrawal-created",
        operation: "withdraw",
        reason: "Audible pumping near the ending.",
      },
      promotion: { active: false },
    });
    expect(tx.studioAssetVariant.upsert).not.toHaveBeenCalled();
  });

  it("requires a reason and an active promotion before withdrawal", async () => {
    const { prisma } = prismaFor({});
    await expect(appendAudioMasterPromotion({
      prisma,
      ...baseInput,
      clientRequestId: "request-withdraw",
      operation: "withdraw",
      reason: "",
    })).rejects.toBeInstanceOf(AudioMasteryPromotionError);
    await expect(appendAudioMasterPromotion({
      prisma,
      ...baseInput,
      clientRequestId: "request-withdraw-2",
      operation: "withdraw",
      reason: "Needs another pass.",
    })).rejects.toMatchObject({ code: "AUDIO_MASTER_NOT_PROMOTED" });
  });

  it("projects current state from append-only events", async () => {
    const latest = promotion({
      id: "withdrawal-1",
      operation: "WITHDRAW",
      reason: "Recheck the ending.",
    });
    const prisma = {
      studioAudioMasterPromotionReceipt: {
        findFirst: jest.fn().mockResolvedValue(latest),
        count: jest.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(1),
      },
    };
    await expect(readAudioMasterPromotionSummary({ prisma, jobId: "job-1" }))
      .resolves.toMatchObject({
        active: false,
        latest: { operation: "withdraw", reason: "Recheck the ending." },
        activePromotion: null,
        promoteCount: 2,
        withdrawalCount: 1,
      });
  });
});
