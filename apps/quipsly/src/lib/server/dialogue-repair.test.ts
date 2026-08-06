/** @jest-environment node */

import { inspectImmutableStudioMediaSource } from "@/lib/server/episode-collaboration-proxy";
import { acquirePrismaAdvisoryTransactionLock } from "@/lib/server/prisma-advisory-lock";
import { parseAudioMasteryJob, parseAudioMasteryResult } from "@high-ground/quipsly-media-processing";

import { appendDialogueRepairReview, createDialogueRepairCandidate, DialogueRepairError, queueDialogueRepairExperiment, readDialogueRepairStatus } from "./dialogue-repair";

jest.mock("server-only", () => ({}));
jest.mock("@/lib/server/episode-collaboration-proxy", () => ({ inspectImmutableStudioMediaSource: jest.fn() }));
jest.mock("@/lib/server/prisma-advisory-lock", () => ({ acquirePrismaAdvisoryTransactionLock: jest.fn() }));
jest.mock("@high-ground/quipsly-media-processing", () => {
  const actual = jest.requireActual("@high-ground/quipsly-media-processing");
  return { ...actual, parseAudioMasteryJob: jest.fn(), parseAudioMasteryResult: jest.fn() };
});

const source = {
  assetId: "asset_dialogue_server_001",
  provider: "local" as const,
  locator: "/tmp/dialogue-server-source.wav",
  generation: `sha256:${"a".repeat(64)}`,
  sha256: "a".repeat(64),
  sizeBytes: 48_000,
  contentType: "audio/wav",
};
const coordinates = { projectSlug: "high-ground-odyssey", assetId: source.assetId, sourceId: "source_dialogue_server_001" };
const actor = { id: "actor_dialogue_server_001", email: "Editor@Example.test" };

function createPrisma() {
  const candidates = new Map<string, any>();
  const reviews = new Map<string, any>();
  const jobs = new Map<string, any>();
  const withReviews = (candidate: any) => candidate ? { ...candidate, reviews: [...reviews.values()].filter((review) => review.candidateId === candidate.id).reverse() } : null;
  const models = {
    studioProject: { findFirst: jest.fn().mockResolvedValue({ id: "project_dialogue_server_001", slug: coordinates.projectSlug }) },
    studioMediaAsset: { findUnique: jest.fn().mockResolvedValue({ id: source.assetId, filename: "source.wav", url: `/api/ingest/media/${coordinates.sourceId}`, mimeType: "audio/wav", isProxy: false, assetAttachments: [{ metadataJson: { sourceId: coordinates.sourceId } }] }) },
    studioVideoSource: { findUnique: jest.fn().mockResolvedValue({ id: coordinates.sourceId, url: `/api/ingest/media/${coordinates.sourceId}`, providerSourceId: source.locator }) },
    studioAssetProcessingJob: {
      findFirst: jest.fn().mockImplementation(async ({ where }) => where.type === "audio-mastery"
        ? { id: "audio_mastery_dialogue_server_001", inputJson: {}, resultJson: {}, status: "completed" }
        : [...jobs.values()].find((job) => (!where.id || job.id === where.id) && job.type === where.type) ?? null),
      findMany: jest.fn().mockImplementation(async ({ where }) => [...jobs.values()].filter((job) => job.projectId === where.projectId && job.assetId === where.assetId && job.type === where.type).reverse()),
      create: jest.fn().mockImplementation(async ({ data }) => { const row = { ...data, createdAt: new Date(), updatedAt: new Date(), resultJson: null, error: null }; jobs.set(row.id, row); return row; }),
    },
    transcriptJob: { findFirst: jest.fn().mockResolvedValue(null) },
    transcriptWord: { findMany: jest.fn().mockResolvedValue([]) },
    studioDialogueRepairCandidate: {
      findUnique: jest.fn().mockImplementation(async ({ where }) => {
        const key = where.projectId_createdByEmail_clientRequestId;
        const row = [...candidates.values()].find((candidate) => !key || (candidate.projectId === key.projectId && candidate.createdByEmail === key.createdByEmail && candidate.clientRequestId === key.clientRequestId));
        return withReviews(row ?? null);
      }),
      findFirst: jest.fn().mockImplementation(async ({ where }) => withReviews(candidates.get(where.id) ?? null)),
      findMany: jest.fn().mockImplementation(async () => [...candidates.values()].map(withReviews)),
      create: jest.fn().mockImplementation(async ({ data }) => { const row = { ...data, reviews: [], createdAt: new Date() }; candidates.set(row.id, row); return row; }),
    },
    studioDialogueRepairReviewReceipt: {
      findUnique: jest.fn().mockImplementation(async ({ where }) => {
        const key = where.projectId_actorEmail_clientRequestId;
        return [...reviews.values()].find((review) => !key || (review.projectId === key.projectId && review.actorEmail === key.actorEmail && review.clientRequestId === key.clientRequestId)) ?? null;
      }),
      create: jest.fn().mockImplementation(async ({ data }) => { const row = { ...data, createdAt: new Date() }; reviews.set(row.id, row); return row; }),
    },
  };
  return { ...models, $transaction: jest.fn().mockImplementation(async (callback) => callback(models)), candidates, reviews, jobs };
}

describe("dialogue repair append-only evidence", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(parseAudioMasteryJob).mockReturnValue({ jobId: "audio_mastery_dialogue_server_001", source } as never);
    jest.mocked(parseAudioMasteryResult).mockReturnValue({ sourceMeasurement: { durationSeconds: 10 } } as never);
    jest.mocked(inspectImmutableStudioMediaSource).mockResolvedValue(source as never);
  });

  it("creates an immutable candidate, replays idempotently, and never creates a review", async () => {
    const prisma = createPrisma();
    const input = { prisma, ...coordinates, actor, clientRequestId: "candidate_request_001", label: "mouth-click" as const, startSeconds: 4, endSeconds: 4.03 };
    const first = await createDialogueRepairCandidate(input);
    const replay = await createDialogueRepairCandidate(input);
    expect(first).toMatchObject({ ok: true, idempotentReplay: false, candidate: { label: "mouth-click", range: { startSeconds: 4, endSeconds: 4.03 }, boundaries: { candidateDoesNotAuthorizeTreatment: true } } });
    expect(replay).toMatchObject({ ok: true, idempotentReplay: true, candidate: { candidateId: first.candidate.candidateId } });
    expect(prisma.candidates.size).toBe(1);
    expect(prisma.reviews.size).toBe(0);
    expect(acquirePrismaAdvisoryTransactionLock).toHaveBeenCalledWith(expect.anything(), "dialogue-candidate:project_dialogue_server_001:editor@example.test");
  });

  it("appends a source-playback-bound confirmation and projects current state without rewriting the candidate", async () => {
    const prisma = createPrisma();
    const created = await createDialogueRepairCandidate({ prisma, ...coordinates, actor, clientRequestId: "candidate_request_002", label: "mouth-click", startSeconds: 4, endSeconds: 4.03 });
    const candidateSnapshot = JSON.stringify(prisma.candidates.get(created.candidate.candidateId).candidateJson);
    const reviewInput = {
      prisma, ...coordinates, actor,
      candidateId: created.candidate.candidateId,
      clientRequestId: "review_request_001",
      decision: "confirmed" as const,
      playbackEvidence: { protectedPlaybackSourceId: coordinates.sourceId, contextStartSeconds: 2.5, contextEndSeconds: 5.53, listenedSecondBins: [2, 3, 4, 5], clientTrackedPlaybackIsNotProofOfAudibility: true as const },
    };
    const first = await appendDialogueRepairReview(reviewInput);
    const replay = await appendDialogueRepairReview(reviewInput);
    expect(first).toMatchObject({ ok: true, idempotentReplay: false, receipt: { decision: "confirmed" }, status: { candidates: [{ latestReview: { decision: "confirmed" }, reviewCounts: { confirmed: 1 } }] } });
    expect(replay).toMatchObject({ ok: true, idempotentReplay: true, receipt: { id: first.receipt.id } });
    expect(JSON.stringify(prisma.candidates.get(created.candidate.candidateId).candidateJson)).toBe(candidateSnapshot);
    expect(prisma.reviews.size).toBe(1);
    const status = await readDialogueRepairStatus({ prisma, ...coordinates });
    expect(status.boundaries.candidateStateComesFromAppendOnlyReceipts).toBe(true);
  });

  it("holds forged playback identity and unexplained non-confirmation decisions", async () => {
    const prisma = createPrisma();
    const created = await createDialogueRepairCandidate({ prisma, ...coordinates, actor, clientRequestId: "candidate_request_003", label: "mouth-click", startSeconds: 4, endSeconds: 4.03 });
    const base = { prisma, ...coordinates, actor, candidateId: created.candidate.candidateId, clientRequestId: "review_request_002", decision: "confirmed" as const, playbackEvidence: { protectedPlaybackSourceId: "source_forged_001", contextStartSeconds: 2.5, contextEndSeconds: 5.53, listenedSecondBins: [2, 3, 4, 5], clientTrackedPlaybackIsNotProofOfAudibility: true as const } };
    await expect(appendDialogueRepairReview(base)).rejects.toMatchObject({ code: "DIALOGUE_REPAIR_PLAYBACK_SOURCE_MISMATCH" });
    await expect(appendDialogueRepairReview({ ...base, clientRequestId: "review_request_003", decision: "false-positive", playbackEvidence: { ...base.playbackEvidence, protectedPlaybackSourceId: coordinates.sourceId } })).rejects.toBeInstanceOf(DialogueRepairError);
    expect(prisma.reviews.size).toBe(0);
  });

  it("queues one source-bound experiment only while the latest append-only review is confirmed", async () => {
    const prisma = createPrisma();
    const created = await createDialogueRepairCandidate({ prisma, ...coordinates, actor, clientRequestId: "candidate_request_004", label: "mouth-click", startSeconds: 4, endSeconds: 4.03 });
    const playbackEvidence = { protectedPlaybackSourceId: coordinates.sourceId, contextStartSeconds: 2.5, contextEndSeconds: 5.53, listenedSecondBins: [2, 3, 4, 5], clientTrackedPlaybackIsNotProofOfAudibility: true as const };
    await appendDialogueRepairReview({ prisma, ...coordinates, actor, candidateId: created.candidate.candidateId, clientRequestId: "review_request_004", decision: "confirmed", playbackEvidence });
    const first = await queueDialogueRepairExperiment({ prisma, ...coordinates, actor, candidateId: created.candidate.candidateId });
    const replay = await queueDialogueRepairExperiment({ prisma, ...coordinates, actor, candidateId: created.candidate.candidateId });
    expect(first).toMatchObject({ ok: true, idempotentReplay: false, experiment: { status: "queued" } });
    expect(replay).toMatchObject({ ok: true, idempotentReplay: true, experiment: { jobId: first.experiment.jobId } });
    expect(prisma.jobs.size).toBe(1);

    await appendDialogueRepairReview({ prisma, ...coordinates, actor, candidateId: created.candidate.candidateId, clientRequestId: "review_request_005", decision: "false-positive", playbackEvidence, note: "On a second listen this is an intentional consonant." });
    await expect(queueDialogueRepairExperiment({ prisma, ...coordinates, actor, candidateId: created.candidate.candidateId })).rejects.toMatchObject({ code: "DIALOGUE_REPAIR_CONFIRMATION_REQUIRED" });
    expect(prisma.jobs.size).toBe(1);
  });
});
