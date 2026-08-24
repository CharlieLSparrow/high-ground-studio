/** @jest-environment node */

import { rm, writeFile } from "node:fs/promises";

import {
  assessAudioMastery,
  audioDeliveryProfile,
  buildAudioDeliveryTargetLocator,
  newAudioDeliveryJob,
  parseAudioMasteryMeasurement,
} from "@high-ground/quipsly-media-processing";

import { loadAudioMasteryReviewContext } from "@/lib/server/audio-mastery-review";
import { inspectImmutableStudioMediaSource } from "@/lib/server/episode-collaboration-proxy";
import { resolveAllowedLocalStudioMediaPath } from "@/lib/server/studio-media-location-security";
import { acquirePrismaAdvisoryTransactionLock } from "@/lib/server/prisma-advisory-lock";

import { appendAudioDeliveryReview, AudioDeliveryError, queueAudioDelivery } from "./audio-delivery";

jest.mock("@/lib/server/audio-mastery-review", () => ({
  AudioMasteryReviewError: class AudioMasteryReviewError extends Error {
    constructor(message: string, readonly status: number, readonly code: string) { super(message); }
  },
  loadAudioMasteryReviewContext: jest.fn(),
}));
jest.mock("@/lib/server/episode-collaboration-proxy", () => ({ inspectImmutableStudioMediaSource: jest.fn() }));
jest.mock("@/lib/server/studio-media-location-security", () => ({ resolveAllowedLocalStudioMediaPath: jest.fn() }));
jest.mock("@/lib/server/prisma-advisory-lock", () => ({ acquirePrismaAdvisoryTransactionLock: jest.fn() }));

const derivative = {
  provider: "local",
  locator: `media-vault/mastering/asset-delivery-1/${"a".repeat(64)}/apple-podcasts-dialogue-v1/preview-v1.wav`,
  generation: `sha256:${"b".repeat(64)}`,
  sha256: "b".repeat(64),
  sizeBytes: 480_000,
  contentType: "audio/wav",
  verification: { passes: true },
  verificationMeasurement: { durationSeconds: 120 },
};
const context = {
  project: { id: "project-delivery-1" },
  asset: { id: "asset-delivery-1", filename: "qa-master.wav" },
  source: { id: "source-delivery-1" },
  row: { id: "audio_mastery_delivery_1" },
  job: { jobId: "audio_mastery_delivery_1", profileId: "apple-podcasts-dialogue-v1", source: { sha256: "a".repeat(64), generation: `sha256:${"a".repeat(64)}` } },
  result: { derivative },
  registration: { playbackUrl: "/api/ingest/media/master-preview" },
};
const activePromotion = { id: "promotion-delivery-1", operation: "PROMOTE", masteryJobId: "audio_mastery_delivery_1", reviewReceiptId: "review-master-delivery-1", previewSha256: "b".repeat(64) };

function prisma(latestPromotion: any = activePromotion) {
  let created: any = null;
  return {
    studioAudioMasterPromotionReceipt: { findFirst: jest.fn().mockResolvedValue(latestPromotion) },
    studioAudioMasterReviewReceipt: { findFirst: jest.fn().mockResolvedValue({
      id: "review-master-delivery-1",
      decision: "APPROVED",
      previewSha256: derivative.sha256,
    }) },
    studioAssetProcessingJob: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(async ({ data }) => { created = { ...data, updatedAt: new Date("2026-08-05T20:00:00.000Z") }; return created; }),
    },
    studioAudioDeliveryReviewReceipt: {
      findFirst: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
    },
    get created() { return created; },
  };
}

describe("audio delivery queue", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(loadAudioMasteryReviewContext).mockResolvedValue(context as never);
    jest.mocked(resolveAllowedLocalStudioMediaPath).mockResolvedValue("/tmp/quipsly-media-ingest/promoted-master.wav");
    jest.mocked(inspectImmutableStudioMediaSource).mockResolvedValue({ provider: "local", locator: "/tmp/quipsly-media-ingest/promoted-master.wav", generation: derivative.generation, sha256: derivative.sha256, sizeBytes: derivative.sizeBytes, contentType: "audio/wav" });
  });

  it("queues a deterministic artifact only from the exact active promotion", async () => {
    const database = prisma();
    const status = await queueAudioDelivery({ prisma: database, projectSlug: "qa-audio-delivery", assetId: "asset-delivery-1", sourceId: "source-delivery-1", masteryJobId: "audio_mastery_delivery_1", actorEmail: "qa@example.test" });
    expect(status).toMatchObject({ status: "queued", masteryJobId: "audio_mastery_delivery_1", promotionReceiptId: "promotion-delivery-1", promotionStillActive: true });
    expect(database.studioAssetProcessingJob.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: "audio-delivery", status: "queued", inputJson: expect.objectContaining({
      source: expect.objectContaining({ promotionReceiptId: "promotion-delivery-1", sha256: derivative.sha256, locator: "/tmp/quipsly-media-ingest/promoted-master.wav" }),
      target: expect.objectContaining({ codec: "aac", codecProfile: "LC", sampleRateHz: 48_000, channels: 2, bitrateBps: 128_000, fastStartRequired: true }),
    }) }) });
  });

  it("holds encoding when the latest promotion is withdrawn", async () => {
    const database = prisma({ ...activePromotion, id: "withdrawal-delivery-1", operation: "WITHDRAW" });
    await expect(queueAudioDelivery({ prisma: database, projectSlug: "qa-audio-delivery", assetId: "asset-delivery-1", sourceId: "source-delivery-1", masteryJobId: "audio_mastery_delivery_1", actorEmail: "qa@example.test" })).rejects.toMatchObject({ code: "AUDIO_DELIVERY_ACTIVE_PROMOTION_REQUIRED", status: 409 });
    expect(database.studioAssetProcessingJob.create).not.toHaveBeenCalled();
  });

  it("holds encoding when candidate bytes drift from the promoted receipt", async () => {
    jest.mocked(inspectImmutableStudioMediaSource).mockResolvedValueOnce({ provider: "local", locator: "/tmp/quipsly-media-ingest/promoted-master.wav", generation: `sha256:${"c".repeat(64)}`, sha256: "c".repeat(64), sizeBytes: derivative.sizeBytes, contentType: "audio/wav" });
    const database = prisma();
    await expect(queueAudioDelivery({ prisma: database, projectSlug: "qa-audio-delivery", assetId: "asset-delivery-1", sourceId: "source-delivery-1", masteryJobId: "audio_mastery_delivery_1", actorEmail: "qa@example.test" })).rejects.toBeInstanceOf(AudioDeliveryError);
    expect(database.studioAssetProcessingJob.create).not.toHaveBeenCalled();
  });

  it("holds encoding when a later listening decision rejects the promoted preview", async () => {
    const database = prisma();
    database.studioAudioMasterReviewReceipt.findFirst.mockResolvedValue({
      id: "review-master-delivery-2",
      decision: "REJECTED",
      previewSha256: derivative.sha256,
    });
    await expect(queueAudioDelivery({ prisma: database, projectSlug: "qa-audio-delivery", assetId: "asset-delivery-1", sourceId: "source-delivery-1", masteryJobId: "audio_mastery_delivery_1", actorEmail: "qa@example.test" })).rejects.toMatchObject({ code: "AUDIO_DELIVERY_PROMOTION_APPROVAL_STALE", status: 409 });
    expect(database.studioAssetProcessingJob.create).not.toHaveBeenCalled();
  });
});

describe("encoded-byte review ledger", () => {
  const outputPath = "/tmp/quipsly-audio-delivery-review-test.m4a";
  const outputBytes = "verified encoded bytes";
  const outputSha = "d".repeat(64);

  afterEach(async () => { await rm(outputPath, { force: true }); });

  function reviewPrisma() {
    const job = newAudioDeliveryJob({
      jobId: "audio_delivery_review_001", projectId: "project_delivery_review_001", requestedByEmail: "qa@example.test", queuedAt: "2026-08-05T20:00:00.000Z",
      source: { assetId: "asset_delivery_review_001", provider: "local", locator: "/tmp/promoted-master.wav", generation: `sha256:${"b".repeat(64)}`, sha256: "b".repeat(64), sizeBytes: 1000, contentType: "audio/wav", durationSeconds: 10, masteryJobId: "audio_mastery_review_001", masterReviewReceiptId: "master_review_review_001", promotionReceiptId: "promotion_review_001" },
      masteryProfileId: "apple-podcasts-dialogue-v1", profileId: "apple-podcasts-aac-stereo-v1",
      target: { provider: "local", locator: buildAudioDeliveryTargetLocator({ assetId: "asset_delivery_review_001", candidateSha256: "b".repeat(64), profileId: "apple-podcasts-aac-stereo-v1" }), contentType: "audio/mp4", codec: "aac", codecProfile: "LC", sampleRateHz: 48_000, channels: 2, bitrateBps: 128_000, fastStartRequired: true, variantKind: "audio-delivery-artifact" },
    });
    const outputSource = { assetId: job.source.assetId, provider: "local", locator: job.target.locator, generation: `sha256:${outputSha}`, sha256: outputSha, sizeBytes: outputBytes.length, contentType: "audio/mp4" };
    const verificationMeasurement = parseAudioMasteryMeasurement({ kind: "quipsly-audio-measurement-v1", version: 1, measurementId: "measurement_delivery_review_001", measuredAt: "2026-08-05T20:01:00.000Z", source: outputSource, profileId: "apple-podcasts-dialogue-v1", durationSeconds: 10, channels: 2, sampleRateHz: 48_000, integratedLufs: -16, truePeakDbtp: -1.2, loudnessRangeLu: 3, thresholdLufs: -26, targetOffsetLu: 0, seriesResolutionMs: 1_000, series: [{ timeMs: 1000, momentaryLufs: -16, shortTermLufs: -16, integratedLufs: -16, truePeakDbtp: -1.2 }], analyzer: { name: "ffmpeg-loudnorm-ebur128", version: "8.1.1", standard: "ITU-R BS.1770 / EBU R128", completeDecode: true } });
    const result = { kind: "quipsly-audio-delivery-result-v1", version: 1, jobId: job.jobId, completedAt: "2026-08-05T20:02:00.000Z", source: job.source, masteryProfileId: job.masteryProfileId, profile: audioDeliveryProfile(job.profileId), output: { provider: "local", locator: job.target.locator, generation: `sha256:${outputSha}`, sha256: outputSha, sizeBytes: outputBytes.length, contentType: "audio/mp4", codec: "aac", codecProfile: "LC", container: "mov,mp4,m4a,3gp,3g2,mj2", sampleRateHz: 48_000, channels: 2, bitrateBps: 128_000, durationSeconds: 10, fastStart: true, completeDecode: true, variantKind: "audio-delivery-artifact", verificationMeasurement, verification: assessAudioMastery(verificationMeasurement, job.masteryProfileId) }, worker: { executionId: "execution_delivery_review_001", buildId: "test-build", imageDigest: null, attempt: 1, ffmpegVersion: "ffmpeg version 8.1.1" }, boundaries: { originalRemainsSourceTruth: true, promotedMasterRemainsCandidateTruth: true, outputIsUnapprovedDeliveryArtifact: true, proofListenRequiredBeforeOutputPacket: true, uploadNotStarted: true, publicationNotStarted: true } };
    let created: any = null;
    const tx = {
      studioAudioDeliveryReviewReceipt: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockImplementation(async ({ data }) => { created = { id: "delivery_review_created_001", ...data }; return created; }) },
      studioAudioMasterPromotionReceipt: { findFirst: jest.fn().mockResolvedValue({ id: job.source.promotionReceiptId, operation: "PROMOTE", reviewReceiptId: job.source.masterReviewReceiptId }) },
      studioAudioMasterReviewReceipt: { findFirst: jest.fn().mockResolvedValue({ id: job.source.masterReviewReceiptId, decision: "APPROVED" }) },
    };
    const prisma = {
      studioProject: { findFirst: jest.fn().mockResolvedValue({ id: job.projectId }) },
      studioAssetProcessingJob: { findFirst: jest.fn().mockResolvedValue({ id: job.jobId, inputJson: job, resultJson: { receipt: result, registration: { playbackUrl: "/api/ingest/media/delivery-review", providerSourceId: outputPath } } }) },
      studioAudioDeliveryReviewReceipt: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockImplementation(async () => created),
        count: jest.fn().mockImplementation(async ({ where }) => Number(created?.decision === where.decision)),
      },
      $transaction: jest.fn().mockImplementation(async (callback) => callback(tx)),
    };
    return { prisma, tx };
  }

  it("approves only sufficiently reviewed encoded bytes and still creates no output packet", async () => {
    await writeFile(outputPath, outputBytes);
    jest.mocked(inspectImmutableStudioMediaSource).mockResolvedValue({ provider: "local", locator: outputPath, generation: `sha256:${outputSha}`, sha256: outputSha, sizeBytes: outputBytes.length, contentType: "audio/mp4" });
    const { prisma, tx } = reviewPrisma();
    const result = await appendAudioDeliveryReview({ prisma, projectSlug: "qa-delivery", assetId: "asset_delivery_review_001", deliveryJobId: "audio_delivery_review_001", actor: { id: "actor_delivery_review_001", email: "qa@example.test" }, clientRequestId: "request_delivery_review_001", decision: "approved", playbackEvidence: { schema: "quipsly-audio-delivery-playback-review-v1", listenedSecondBins: [0, 1, 4, 5, 6, 8, 9], completedAt: new Date().toISOString() } });
    expect(result).toMatchObject({ ok: true, receipt: { decision: "approved" }, review: { latest: { decision: "approved" }, approvalCount: 1 } });
    expect(tx.studioAudioDeliveryReviewReceipt.create).toHaveBeenCalledWith({ data: expect.objectContaining({ evidenceJson: expect.objectContaining({ outputPacketNotCreated: true, uploadNotStarted: true, publicationNotStarted: true }) }) });
    expect(acquirePrismaAdvisoryTransactionLock).toHaveBeenCalledWith(tx, "audio-delivery-review:audio_delivery_review_001:qa@example.test");
  });

  it("rejects an approval with incomplete encoded playback coverage", async () => {
    await writeFile(outputPath, outputBytes);
    jest.mocked(inspectImmutableStudioMediaSource).mockResolvedValue({ provider: "local", locator: outputPath, generation: `sha256:${outputSha}`, sha256: outputSha, sizeBytes: outputBytes.length, contentType: "audio/mp4" });
    const { prisma, tx } = reviewPrisma();
    await expect(appendAudioDeliveryReview({ prisma, projectSlug: "qa-delivery", assetId: "asset_delivery_review_001", deliveryJobId: "audio_delivery_review_001", actor: { id: "actor_delivery_review_001", email: "qa@example.test" }, clientRequestId: "request_delivery_review_002", decision: "approved", playbackEvidence: { schema: "quipsly-audio-delivery-playback-review-v1", listenedSecondBins: [0, 1], completedAt: new Date().toISOString() } })).rejects.toMatchObject({ code: "AUDIO_DELIVERY_REVIEW_INCOMPLETE", status: 409 });
    expect(tx.studioAudioDeliveryReviewReceipt.create).not.toHaveBeenCalled();
  });

  it("holds encoded-byte review when the promoted master's approval became stale", async () => {
    await writeFile(outputPath, outputBytes);
    jest.mocked(inspectImmutableStudioMediaSource).mockResolvedValue({ provider: "local", locator: outputPath, generation: `sha256:${outputSha}`, sha256: outputSha, sizeBytes: outputBytes.length, contentType: "audio/mp4" });
    const { prisma, tx } = reviewPrisma();
    tx.studioAudioMasterReviewReceipt.findFirst.mockResolvedValue({ id: "master_review_rejected_later", decision: "REJECTED" });
    await expect(appendAudioDeliveryReview({ prisma, projectSlug: "qa-delivery", assetId: "asset_delivery_review_001", deliveryJobId: "audio_delivery_review_001", actor: { id: "actor_delivery_review_001", email: "qa@example.test" }, clientRequestId: "request_delivery_review_stale_001", decision: "rejected", playbackEvidence: { schema: "quipsly-audio-delivery-playback-review-v1", listenedSecondBins: [0], completedAt: new Date().toISOString() }, note: "Master approval changed." })).rejects.toMatchObject({ code: "AUDIO_DELIVERY_PROMOTION_APPROVAL_STALE", status: 409 });
    expect(tx.studioAudioDeliveryReviewReceipt.create).not.toHaveBeenCalled();
  });
});
