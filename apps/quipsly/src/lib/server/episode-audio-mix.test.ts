import { parseEpisodeAudioMixProposal } from "@high-ground/quipsly-media-processing";

const loadContext = jest.fn();
const inspectSource = jest.fn();

jest.mock("@/lib/server/episode-audio-activity-analysis", () => ({ loadEpisodeAudioActivityAnalysisContext: (...args: unknown[]) => loadContext(...args) }));
jest.mock("@/lib/server/episode-collaboration-proxy", () => ({ inspectImmutableStudioMediaSource: (...args: unknown[]) => inspectSource(...args) }));
jest.mock("@/lib/server/prisma-advisory-lock", () => ({ acquirePrismaAdvisoryTransactionLock: jest.fn(async () => undefined) }));

import { queueEpisodeAudioMix } from "./episode-audio-mix";

describe("Episode audio mix server boundary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    loadContext.mockResolvedValue({
      project: { id: "project_0001", slug: "nest-one" },
      episode: { id: "episode_0001", slug: "episode-one" },
      program: {
        fingerprintSha256: "f".repeat(64),
        summary: { hasProgramClock: true },
        activeDecisions: [{ id: "decision_0001" }],
        tracks: [
          { assetId: "asset_primary", sourceId: "source_primary", title: "Primary", role: "dialogue-primary", participantId: "participant_primary", participantLabel: "Charlie", processing: { alignment: { jobId: null } } },
          { assetId: "asset_scratch", sourceId: "source_scratch", title: "Scratch", role: "camera-scratch", participantId: "participant_scratch", participantLabel: "Camera", processing: { alignment: { jobId: "alignment_0001" } } },
        ],
      },
      map: { lanes: [
        { assetId: "asset_primary", sourceId: "source_primary", title: "Primary", participantId: "participant_primary", participantLabel: "Charlie", mixDisposition: "include", alignment: "program-clock", programOffsetSeconds: 0, sourceDurationSeconds: 60 },
        { assetId: "asset_scratch", sourceId: "source_scratch", title: "Scratch", participantId: "participant_scratch", participantLabel: "Camera", mixDisposition: "include", alignment: "qualified-candidate", programOffsetSeconds: 0.2, sourceDurationSeconds: 60 },
      ] },
    });
    inspectSource.mockImplementation(async (locator: string) => ({ provider: "local", locator, generation: `sha256:${locator.includes("primary") ? "a".repeat(64) : "b".repeat(64)}`, sha256: locator.includes("primary") ? "a".repeat(64) : "b".repeat(64), sizeBytes: locator.includes("primary") ? 1_024 : 2_048, contentType: "audio/wav" }));
  });

  it("queues one exact-source, review-derived proposal under the program clock", async () => {
    let created: any = null;
    const asset = (id: string) => ({ id, filename: `${id}.wav`, mimeType: "audio/wav", isProxy: false, url: `/api/ingest/media/source_${id === "asset_primary" ? "primary" : "scratch"}`, assetAttachments: [] });
    const source = (id: string) => ({ id, url: `/api/ingest/media/${id}`, providerSourceId: `/tmp/quipsly-media-ingest/${id}.wav` });
    const prisma: any = {
      studioMediaAsset: { findUnique: jest.fn(async ({ where }: any) => asset(where.id)) },
      studioVideoSource: { findUnique: jest.fn(async ({ where }: any) => source(where.id)) },
      studioEpisodeAudioAnalysisReceipt: { findFirst: jest.fn(async () => ({ id: "analysis_0001" })) },
      studioEpisodeAudioReviewReceipt: { findMany: jest.fn(async () => [{ id: "review_0001", analysisId: "analysis_0001", eventId: "event_0001", decision: "MIC_BLEED", startSeconds: 12, endSeconds: 15, involvedAssetIdsJson: ["asset_primary", "asset_scratch"], playbackEvidenceJson: { schema: "heard" }, occurredAt: new Date() }]) },
      studioAssetProcessingJob: { findFirst: jest.fn(async () => null), create: jest.fn(async ({ data }: any) => { created = { ...data, updatedAt: new Date() }; return created; }) },
      $transaction: jest.fn(async (callback: any) => callback(prisma)),
    };
    const status = await queueEpisodeAudioMix({ prisma, projectSlug: "nest-one", episodeProductionId: "episode_0001", actorEmail: "Editor@Example.test" });
    expect(status.status).toBe("queued");
    expect(status.actionCount).toBe(1);
    expect(created.assetId).toBe("asset_primary");
    const proposal = parseEpisodeAudioMixProposal(created.inputJson);
    expect(proposal.tracks).toHaveLength(2);
    expect(proposal.actions[0]).toMatchObject({ targetAssetId: "asset_scratch", reason: "mic-bleed", gainDb: -18 });
    expect(proposal.output.locator).toContain("media-vault/mixes/episode_0001/");
    expect(proposal.boundaries.correlationNeverAuthorizesAutomation).toBe(true);
  });
});
