/** @jest-environment node */

import { createHash } from "node:crypto";

import type { EpisodeAudioComparisonPlan } from "@/lib/episode-audio-comparison";
import { buildEpisodeAudioReviewPlaybackEvidence } from "@/lib/episode-audio-review";

import { registerEpisodeAudioActivityReview } from "./episode-audio-activity-review";

jest.mock("server-only", () => ({}));
jest.mock("@/lib/server/prisma-advisory-lock", () => ({ acquirePrismaAdvisoryTransactionLock: jest.fn() }));

const loadContext = jest.fn();
jest.mock("@/lib/server/episode-audio-activity-analysis", () => ({ loadEpisodeAudioActivityAnalysisContext: (...args: unknown[]) => loadContext(...args) }));

function stableJson(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object") {
    const row = value as Record<string, unknown>;
    return `{${Object.keys(row).sort().map((key) => `${JSON.stringify(key)}:${stableJson(row[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

const plan: EpisodeAudioComparisonPlan = {
  schema: "quipsly-episode-audio-comparison-plan-v1",
  momentId: "possible-participant-overlap-40-44",
  momentKind: "possible-participant-overlap",
  label: "Possible participant overlap",
  detail: "Listen.",
  programStartSeconds: 8.5,
  programEndSeconds: 12.5,
  durationSeconds: 4,
  sources: [
    { assetId: "asset-a", sourceId: "source-a", title: "A", participantLabel: "A", role: "dialogue-primary", alignment: "program-clock", programOffsetSeconds: 0, sourceStartSeconds: 8.5, sourceEndSeconds: 12.5, playbackUrl: "/a" },
    { assetId: "asset-b", sourceId: "source-b", title: "B", participantLabel: "B", role: "dialogue-primary", alignment: "qualified-candidate", programOffsetSeconds: 0.25, sourceStartSeconds: 8.25, sourceEndSeconds: 12.25, playbackUrl: "/b" },
  ],
  omitted: [],
  boundaries: { protectedSourcePlaybackOnly: true, monitorGainDoesNotChangeMedia: true, playbackDoesNotConfirmClassification: true, candidateAlignmentDoesNotMoveTimeline: true },
};

function fixture() {
  const analysisInput = { schema: "quipsly-episode-audio-activity-analysis-input-v1", programFingerprintSha256: "f".repeat(64), activeDecisionReceiptIds: ["decision-1"], tracks: [] };
  const analysis = {
    id: "analysis-1",
    projectId: "project-1",
    episodeProductionId: "episode-1",
    programFingerprintSha256: "f".repeat(64),
    analyzedAt: new Date(Date.now() - 60_000),
    inputSha256: sha256(analysisInput),
    inputJson: analysisInput,
    analysisJson: {
      programDurationSeconds: 30,
      moments: [{ id: plan.momentId, kind: plan.momentKind, startSeconds: 10, endSeconds: 11, assetIds: ["asset-a", "asset-b"] }],
      lanes: [
        { assetId: "asset-a", sourceId: "source-a", title: "A", participantLabel: "A", alignment: "program-clock", kind: "dialogue", mixDisposition: "include", programOffsetSeconds: 0, sourceDurationSeconds: 30 },
        { assetId: "asset-b", sourceId: "source-b", title: "B", participantLabel: "B", alignment: "qualified-candidate", kind: "dialogue", mixDisposition: "include", programOffsetSeconds: 0.25, sourceDurationSeconds: 30 },
      ],
    },
  };
  loadContext.mockResolvedValue({ project: { id: "project-1" }, episode: { id: "episode-1" }, programFingerprintSha256: "f".repeat(64), analysisInput, program: { activeDecisions: [{ id: "decision-1" }] } });
  const rows: any[] = [];
  const prisma: any = {
    studioEpisodeAudioAnalysisReceipt: {
      findFirst: jest.fn(async () => analysis),
      findUnique: jest.fn(async () => ({ inputSha256: analysis.inputSha256, programFingerprintSha256: analysis.programFingerprintSha256 })),
    },
    studioEpisodeAudioReviewReceipt: {
      findUnique: jest.fn(async ({ where }: any) => rows.find((row) => row.projectId === where.projectId_actorEmail_clientRequestId.projectId && row.actorEmail === where.projectId_actorEmail_clientRequestId.actorEmail && row.clientRequestId === where.projectId_actorEmail_clientRequestId.clientRequestId) ?? null),
      create: jest.fn(async ({ data }: any) => { const row = { id: `review-${rows.length + 1}`, ...data }; rows.push(row); return row; }),
    },
    studioEpisodeAudioTrackDecisionReceipt: { findMany: jest.fn(async () => [{ id: "decision-1", operation: "SET", decisionKind: "PROGRAM_CLOCK", assetId: "asset-a", sourceId: "source-a", decisionValue: "primary", decisionLabel: "Program clock", targetReceiptId: null, programFingerprintSha256: "f".repeat(64), sourceSha256: "a".repeat(64), sourceGeneration: "generation-1", sourceSizeBytes: BigInt(1024), actorEmail: "editor@example.test", occurredAt: new Date(Date.now() - 120_000) }]) },
  };
  prisma.$transaction = jest.fn(async (operation: (tx: any) => Promise<unknown>) => operation(prisma));
  return { prisma, analysis, rows };
}

function completeEvidence() {
  return buildEpisodeAudioReviewPlaybackEvidence({
    analysisId: "analysis-1",
    plan,
    allMonitorBins: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    soloMonitorBinsByAsset: new Map([["asset-a", new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])], ["asset-b", new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])]]),
    completedAt: new Date(Date.now() - 1_000).toISOString(),
  });
}

describe("Episode audio activity review ledger", () => {
  beforeEach(() => jest.clearAllMocks());

  it("records and idempotently replays a conclusion only after matched listening", async () => {
    const { prisma, rows } = fixture();
    const input = { prisma, actor: { id: "actor-1", email: "Editor@Example.test" }, projectSlug: "project-one", episodeProductionId: "episode-1", analysisId: "analysis-1", eventId: plan.momentId, decision: "confirmed-overlap" as const, note: "Distinct voices are simultaneously audible.", playbackEvidence: completeEvidence(), clientRequestId: "review-request-1" };
    const first = await registerEpisodeAudioActivityReview(input);
    const replay = await registerEpisodeAudioActivityReview(input);
    expect(first).toMatchObject({ ok: true, idempotentReplay: false, review: { id: "review-1", decision: "confirmed-overlap", involvedAssetIds: ["asset-a", "asset-b"] } });
    expect(replay).toMatchObject({ ok: true, idempotentReplay: true, review: { id: "review-1" } });
    expect(rows).toHaveLength(1);
  });

  it("rejects a definitive conclusion when submitted coverage is incomplete", async () => {
    const { prisma } = fixture();
    const evidence = buildEpisodeAudioReviewPlaybackEvidence({ analysisId: "analysis-1", plan, allMonitorBins: [0], soloMonitorBinsByAsset: new Map(), completedAt: new Date(Date.now() - 1_000).toISOString() });
    await expect(registerEpisodeAudioActivityReview({ prisma, actor: { id: "actor-1", email: "editor@example.test" }, projectSlug: "project-one", episodeProductionId: "episode-1", analysisId: "analysis-1", eventId: plan.momentId, decision: "confirmed-overlap", playbackEvidence: evidence, clientRequestId: "review-request-2" })).rejects.toMatchObject({ code: "EPISODE_AUDIO_REVIEW_LISTENING_INCOMPLETE", status: 409 });
  });

  it("rejects source-clock evidence that does not reproduce the immutable mapping", async () => {
    const { prisma } = fixture();
    const evidence = completeEvidence();
    evidence.sources[1].sourceStartSeconds = 9;
    await expect(registerEpisodeAudioActivityReview({ prisma, actor: { id: "actor-1", email: "editor@example.test" }, projectSlug: "project-one", episodeProductionId: "episode-1", analysisId: "analysis-1", eventId: plan.momentId, decision: "confirmed-overlap", playbackEvidence: evidence, clientRequestId: "review-request-3" })).rejects.toMatchObject({ code: "EPISODE_AUDIO_REVIEW_SOURCE_MAPPING_INVALID", status: 409 });
  });
});
