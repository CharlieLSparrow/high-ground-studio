/** @jest-environment node */

import { queueEpisodeAudioPairCorrelation } from "./episode-audio-pair-correlation";

const loadActivity = jest.fn();
const inspectSource = jest.fn();
const projectDecisions = jest.fn();

jest.mock("server-only", () => ({}));
jest.mock("@/lib/server/episode-audio-activity-analysis", () => ({ loadEpisodeAudioActivityAnalysisContext: (...args: unknown[]) => loadActivity(...args) }));
jest.mock("@/lib/server/episode-collaboration-proxy", () => ({ inspectImmutableStudioMediaSource: (...args: unknown[]) => inspectSource(...args) }));
jest.mock("@/lib/server/episode-audio-track-decisions", () => ({ projectEpisodeAudioTrackDecisions: (...args: unknown[]) => projectDecisions(...args) }));
jest.mock("@/lib/server/prisma-advisory-lock", () => ({ acquirePrismaAdvisoryTransactionLock: jest.fn() }));

describe("Episode audio pair correlation server boundary", () => {
  it("queues one exact-source, analysis-bound pair under the decision lock", async () => {
    const fingerprint = "f".repeat(64);
    const sourceSha = (assetId: string) => assetId === "asset-clock" ? "a".repeat(64) : "b".repeat(64);
    const tracks = [
      { assetId: "asset-clock", sourceId: "source-clock", role: "primary-dialogue", participantId: "participant-charlie", processing: { alignment: { jobId: null } } },
      { assetId: "asset-observed", sourceId: "source-observed", role: "camera-scratch", participantId: "participant-homer", processing: { alignment: { jobId: "alignment-job-1" } } },
    ];
    loadActivity.mockResolvedValue({
      project: { id: "project-1", slug: "project-one" }, episode: { id: "episode-1" },
      program: { fingerprintSha256: fingerprint, activeDecisions: [{ id: "decision-1" }], summary: { hasProgramClock: true }, tracks },
      map: {
        programClock: { assetId: "asset-clock", sourceId: "source-clock" }, programDurationSeconds: 30,
        lanes: [
          { assetId: "asset-clock", sourceId: "source-clock", title: "Charlie mic", kind: "dialogue", role: "primary-dialogue", participantId: "participant-charlie", participantLabel: "Charlie", mixDisposition: "include", alignment: "program-clock", programOffsetSeconds: 0, sourceDurationSeconds: 30 },
          { assetId: "asset-observed", sourceId: "source-observed", title: "Homer camera", kind: "dialogue", role: "camera-scratch", participantId: "participant-homer", participantLabel: "Homer", mixDisposition: "include", alignment: "qualified-candidate", programOffsetSeconds: 0.2, sourceDurationSeconds: 30 },
        ],
        moments: [{ id: "possible-participant-overlap-300-330", kind: "possible-participant-overlap", startSeconds: 10, endSeconds: 11, label: "Possible participant overlap", detail: "Listen.", assetIds: ["asset-clock", "asset-observed"], requiresListening: true }],
      },
    });
    inspectSource.mockImplementation(async (providerSourceId: string) => {
      const assetId = providerSourceId.includes("clock") ? "asset-clock" : "asset-observed";
      const sha256 = sourceSha(assetId);
      return { provider: "local", locator: `/tmp/${assetId}.wav`, generation: `sha256:${sha256}`, sha256, sizeBytes: 48_000, contentType: "audio/wav" };
    });
    projectDecisions.mockReturnValue({ active: [{ id: "decision-1" }] });
    const created: any[] = [];
    const prisma: any = {
      studioEpisodeAudioAnalysisReceipt: { findFirst: jest.fn(async () => ({ id: "analysis-1", programFingerprintSha256: fingerprint, inputJson: { activeDecisionReceiptIds: ["decision-1"] } })) },
      studioMediaAsset: { findUnique: jest.fn(async ({ where }: any) => ({ id: where.id, isProxy: false, url: `/api/ingest/media/${where.id === "asset-clock" ? "source-clock" : "source-observed"}`, mimeType: "audio/wav", assetAttachments: [] })) },
      studioVideoSource: { findUnique: jest.fn(async ({ where }: any) => ({ id: where.id, url: `/api/ingest/media/${where.id}`, providerSourceId: `/retained/${where.id}.wav` })) },
      studioEpisodeAudioTrackDecisionReceipt: { findMany: jest.fn(async () => [{ id: "decision-1" }]) },
      studioAssetProcessingJob: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(async ({ data }: any) => { const row = { ...data, updatedAt: new Date("2026-08-06T16:00:00.000Z") }; created.push(row); return row; }),
      },
    };
    prisma.$transaction = jest.fn(async (operation: (tx: any) => Promise<unknown>) => operation(prisma));

    const result = await queueEpisodeAudioPairCorrelation({ prisma, projectSlug: "project-one", episodeProductionId: "episode-1", analysisReceiptId: "analysis-1", activityMomentId: "possible-participant-overlap-300-330", referenceAssetId: "asset-clock", observationAssetId: "asset-observed", actorEmail: "editor@example.test" });

    expect(result).toMatchObject({ status: "queued", analysisReceiptId: "analysis-1", activityMomentId: "possible-participant-overlap-300-330", referenceAssetId: "asset-clock", observationAssetId: "asset-observed" });
    expect(created).toHaveLength(1);
    expect(created[0].inputJson).toMatchObject({ programFingerprintSha256: fingerprint, activeDecisionReceiptIds: ["decision-1"], reference: { range: { alignment: "program-clock", alignmentEvidenceJobId: null } }, observation: { range: { alignment: "qualified-candidate", alignmentEvidenceJobId: "alignment-job-1" } } });
  });
});
