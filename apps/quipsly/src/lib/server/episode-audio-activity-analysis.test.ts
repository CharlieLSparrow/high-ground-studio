/** @jest-environment node */

import { episodeAudioProgramFingerprint } from "./episode-audio-track-decisions";
import { registerEpisodeAudioActivityAnalysis } from "./episode-audio-activity-analysis";

jest.mock("server-only", () => ({}));
jest.mock("@/lib/server/prisma-advisory-lock", () => ({ acquirePrismaAdvisoryTransactionLock: jest.fn() }));

function prismaFixture() {
  const importedMedia = [{ id: "asset-analysis-1", sourceId: "source-analysis-1", originalName: "retained.wav", kind: "audio", contentType: "audio/wav", importRole: "dialogue-primary" }];
  const fingerprint = episodeAudioProgramFingerprint({ episodeProductionId: "episode-analysis-1", importedMedia });
  const decisionRows = [{ id: "decision-clock-1", operation: "SET", decisionKind: "PROGRAM_CLOCK", assetId: "asset-analysis-1", sourceId: "source-analysis-1", decisionValue: "primary", decisionLabel: "Program clock", targetReceiptId: null, programFingerprintSha256: fingerprint, sourceSha256: "a".repeat(64), sourceGeneration: "generation-1", sourceSizeBytes: BigInt(1024), actorEmail: "editor@example.test", occurredAt: new Date("2026-08-06T20:00:00.000Z") }];
  const rows: any[] = [];
  const prisma: any = {
    studioProject: { findFirst: jest.fn(async () => ({ id: "project-analysis-1", slug: "project-analysis" })) },
    studioEpisodeProduction: {
      findFirst: jest.fn(async () => ({ id: "episode-analysis-1", slug: "episode-analysis", projectId: "project-analysis-1", productionJson: { importedMedia }, timelineJson: {} })),
      findUnique: jest.fn(async () => ({ productionJson: { importedMedia }, timelineJson: {} })),
    },
    studioEpisodeAudioTrackDecisionReceipt: { findMany: jest.fn(async () => decisionRows) },
    callParticipant: { findMany: jest.fn(async () => []) },
    studioMediaAsset: { findMany: jest.fn(async () => [{ id: "asset-analysis-1", filename: "retained.wav", url: "/api/ingest/media/source-analysis-1", mimeType: "audio/wav", duration: 12, isProxy: false, assetAttachments: [], processingJobs: [] }]) },
    studioVideoSource: { findMany: jest.fn(async () => [{ id: "source-analysis-1", url: "/api/ingest/media/source-analysis-1", providerSourceId: "/retained/source-analysis-1.wav" }]) },
    recordingAsset: { findMany: jest.fn(async () => []) },
    studioEpisodeAudioAnalysisReceipt: {
      findUnique: jest.fn(async (query: any) => {
        const request = query.where?.projectId_actorEmail_clientRequestId;
        if (request) return rows.find((row) => row.projectId === request.projectId && row.actorEmail === request.actorEmail && row.clientRequestId === request.clientRequestId) ?? null;
        const input = query.where?.episodeProductionId_inputSha256;
        if (input) return rows.find((row) => row.episodeProductionId === input.episodeProductionId && row.inputSha256 === input.inputSha256) ?? null;
        return null;
      }),
      findFirst: jest.fn(async () => rows.at(-1) ?? null),
      create: jest.fn(async ({ data }: any) => {
        const created = { id: `analysis-${rows.length + 1}`, createdAt: new Date(), ...data };
        rows.push(created);
        return created;
      }),
    },
  };
  prisma.$transaction = jest.fn(async (operation: (tx: any) => Promise<unknown>) => operation(prisma));
  return { prisma, importedMedia, fingerprint, rows };
}

describe("Episode audio activity analysis ledger", () => {
  it("persists one immutable analysis and replays the same request id", async () => {
    const fixture = prismaFixture();
    const fingerprint = fixture.fingerprint;
    const input = { prisma: fixture.prisma, actor: { id: "editor-analysis-1", email: "Editor@Example.test" }, projectSlug: "project-analysis", episodeProductionId: "episode-analysis-1", programFingerprintSha256: fingerprint, clientRequestId: "analysis-request-1" };

    const first = await registerEpisodeAudioActivityAnalysis(input);
    const retry = await registerEpisodeAudioActivityAnalysis(input);

    expect(first).toMatchObject({ ok: true, idempotentReplay: false, reusedInput: false, analysis: { id: "analysis-1", stale: false, momentCount: 0 } });
    expect(retry).toMatchObject({ ok: true, idempotentReplay: true, reusedInput: false, analysis: { id: "analysis-1" } });
    expect(fixture.prisma.studioEpisodeAudioAnalysisReceipt.create).toHaveBeenCalledTimes(1);
    expect(fixture.rows[0].inputJson).toMatchObject({ schema: "quipsly-episode-audio-activity-analysis-input-v1", algorithm: "quipsly-shared-clock-energy-topology-v1", programFingerprintSha256: fingerprint });
    expect(fixture.rows[0].analysisJson.boundaries).toMatchObject({ suggestionsRequireProtectedListening: true, analysisDoesNotAuthorizeReviewDecision: true });
  });

  it("reuses an identical canonical input instead of minting duplicate machine evidence", async () => {
    const fixture = prismaFixture();
    const fingerprint = fixture.fingerprint;
    const base = { prisma: fixture.prisma, actor: { id: "editor-analysis-1", email: "editor@example.test" }, projectSlug: "project-analysis", episodeProductionId: "episode-analysis-1", programFingerprintSha256: fingerprint };
    const first = await registerEpisodeAudioActivityAnalysis({ ...base, clientRequestId: "analysis-request-1" });
    const reused = await registerEpisodeAudioActivityAnalysis({ ...base, clientRequestId: "analysis-request-2" });
    expect(first.analysis.id).toBe("analysis-1");
    expect(reused).toMatchObject({ idempotentReplay: true, reusedInput: true, analysis: { id: "analysis-1" } });
    expect(fixture.prisma.studioEpisodeAudioAnalysisReceipt.create).toHaveBeenCalledTimes(1);
  });
});
