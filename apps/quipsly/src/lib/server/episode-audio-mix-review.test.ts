import { EPISODE_AUDIO_MIX_REVIEW_EVIDENCE_SCHEMA, newAutomaticEpisodeAudioMixProposal } from "@high-ground/quipsly-media-processing";

const loadContext = jest.fn();
jest.mock("@/lib/server/episode-audio-mix", () => ({
  EpisodeAudioMixError: class EpisodeAudioMixError extends Error { constructor(message: string, readonly status: number, readonly code: string) { super(message); } },
  loadEpisodeAudioMixReviewContext: (...args: unknown[]) => loadContext(...args),
}));
jest.mock("@/lib/server/prisma-advisory-lock", () => ({ acquirePrismaAdvisoryTransactionLock: jest.fn(async () => undefined) }));

import { appendEpisodeAudioMixPromotion, appendEpisodeAudioMixReview } from "./episode-audio-mix-review";

describe("Episode audio mix listening and promotion ledger", () => {
  beforeEach(() => { jest.clearAllMocks(); loadContext.mockResolvedValue(context()); });

  it("rejects approval without a same-clock A/B comparison", async () => {
    const prisma = ledgerPrisma();
    await expect(appendEpisodeAudioMixReview({ prisma, projectSlug: "nest-one", episodeProductionId: "episode_0001", jobId: "mix_job_0001", actor: { email: "Editor@Example.test" }, clientRequestId: "review_request_0001", decision: "approved", playbackEvidence: evidence([], [2, 30, 58], [2, 30, 58]), note: null })).rejects.toMatchObject({ code: "EPISODE_MIX_REVIEW_INCOMPLETE" });
    expect(prisma.studioEpisodeAudioMixReviewReceipt.create).not.toHaveBeenCalled();
  });

  it("appends approval first, then separately promotes the exact approved bytes", async () => {
    const prisma = ledgerPrisma();
    const review = await appendEpisodeAudioMixReview({ prisma, projectSlug: "nest-one", episodeProductionId: "episode_0001", jobId: "mix_job_0001", actor: { email: "Editor@Example.test" }, clientRequestId: "review_request_0002", decision: "approved", playbackEvidence: evidence([{ from: "proposal", to: "baseline", atSecond: 30 }], [2, 30, 58], [2, 30, 58]), note: "The proposal keeps the dialogue intact." });
    expect(review.receipt.decision).toBe("approved");
    expect(prisma.studioEpisodeAudioMixPromotionReceipt.create).not.toHaveBeenCalled();
    const promotion = await appendEpisodeAudioMixPromotion({ prisma, projectSlug: "nest-one", episodeProductionId: "episode_0001", jobId: "mix_job_0001", actor: { email: "Editor@Example.test" }, clientRequestId: "promotion_request_0001", operation: "promote", reviewReceiptId: review.receipt.id });
    expect(promotion.receipt.operation).toBe("promote");
    expect(prisma.studioEpisodeAudioMixPromotionReceipt.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ operation: "PROMOTE", reviewReceiptId: review.receipt.id, previewSha256: "d".repeat(64), baselineSha256: "c".repeat(64) }) }));
  });
});

function context() {
  const source = { assetId: "asset_primary", provider: "local" as const, locator: "/tmp/quipsly/primary.wav", generation: `sha256:${"a".repeat(64)}`, sha256: "a".repeat(64), sizeBytes: 1_024, contentType: "audio/wav" };
  const proposal = newAutomaticEpisodeAudioMixProposal({ proposalId: "mix_job_0001", createdAt: "2026-08-06T12:00:00.000Z", projectId: "project_0001", episodeProductionId: "episode_0001", programFingerprintSha256: "f".repeat(64), activeDecisionReceiptIds: ["decision_0001"], tracks: [{ assetId: "asset_primary", sourceId: "source_primary", title: "Primary", participantId: "participant_0001", participantLabel: "Charlie", role: "dialogue-primary", mixDisposition: "include", alignment: "program-clock", programOffsetSeconds: 0, sourceDurationSeconds: 60, alignmentEvidenceJobId: null, source }], evidenceReviews: [], output: { assetId: "mix_preview_0001", provider: "local", locator: "preview.wav", contentType: "audio/wav", codec: "pcm_s24le", sampleRateHz: 48_000, channelCount: 2, variantKind: "episode-mix-preview", masteryProfileId: "apple-podcasts-dialogue-v1" }, baselineOutput: { assetId: "mix_baseline_0001", provider: "local", locator: "baseline.wav", contentType: "audio/wav", codec: "pcm_s24le", sampleRateHz: 48_000, channelCount: 2, variantKind: "episode-mix-baseline", masteryProfileId: "apple-podcasts-dialogue-v1" } });
  return { project: { id: "project_0001" }, episode: { id: "episode_0001" }, row: { id: "mix_job_0001" }, proposal, result: { derivative: { sha256: "d".repeat(64), durationSeconds: 60 }, baselineDerivative: { sha256: "c".repeat(64), durationSeconds: 60 } }, registration: { playbackUrl: "/api/ingest/media/proposal" } };
}

function evidence(switches: Array<{ from: "baseline" | "proposal"; to: "baseline" | "proposal"; atSecond: number }>, baselineListenedSecondBins: number[], proposalListenedSecondBins: number[]) { return { schema: EPISODE_AUDIO_MIX_REVIEW_EVIDENCE_SCHEMA, baselineListenedSecondBins, proposalListenedSecondBins, switches, completedAt: "2026-08-06T12:10:00.000Z" }; }

function ledgerPrisma() {
  let review: any = null;
  let promotion: any = null;
  const prisma: any = {
    studioEpisodeAudioMixReviewReceipt: {
      findUnique: jest.fn(async () => null),
      findFirst: jest.fn(async () => review),
      count: jest.fn(async ({ where }: any) => review && review.decision === where.decision ? 1 : 0),
      create: jest.fn(async ({ data }: any) => { review = { id: "mix_review_0001", ...data, occurredAt: data.occurredAt }; return review; }),
    },
    studioEpisodeAudioMixPromotionReceipt: {
      findUnique: jest.fn(async () => null),
      findFirst: jest.fn(async () => promotion),
      count: jest.fn(async ({ where }: any) => promotion && promotion.operation === where.operation ? 1 : 0),
      create: jest.fn(async ({ data }: any) => { promotion = { id: "mix_promotion_0001", ...data, occurredAt: data.occurredAt }; return promotion; }),
    },
    studioAssetProcessingJob: { findFirst: jest.fn(async () => ({ id: "mix_job_0001" })) },
  };
  prisma.$transaction = jest.fn(async (callback: any) => callback(prisma));
  return prisma;
}
