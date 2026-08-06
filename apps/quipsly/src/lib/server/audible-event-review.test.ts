/** @jest-environment node */

import { acquirePrismaAdvisoryTransactionLock } from "@/lib/server/prisma-advisory-lock";
import { loadDialogueRepairContext } from "./dialogue-repair";

import { appendAudibleEventReview, AudibleEventReviewError, readAudibleEventReviewStatus, selectSourceBoundAnalysis } from "./audible-event-review";

jest.mock("server-only", () => ({}));
jest.mock("@/lib/server/prisma-advisory-lock", () => ({ acquirePrismaAdvisoryTransactionLock: jest.fn() }));
jest.mock("./dialogue-repair", () => ({ loadDialogueRepairContext: jest.fn() }));

const sha256 = "b".repeat(64);
const coordinates = { projectSlug: "high-ground-odyssey", assetId: "asset_audible_server_001", sourceId: "source_audible_server_001" };
const actor = { id: "actor_audible_server_001", email: "Editor@Example.test" };
const analysis = {
  schemaVersion: 1,
  analysisId: "audible_analysis_server_test_001",
  supersedesAnalysisId: null,
  status: "completed",
  algorithm: "apple-sound-classifier-file-v1",
  classifierIdentifier: "SNClassifierIdentifierVersion1",
  analyzedAt: "2026-08-05T18:00:00.000Z",
  sourceSHA256: sha256,
  sourceByteCount: 42_000,
  durationSeconds: 10,
  requestedWindowDurationSeconds: 1.5,
  effectiveWindowDurationSeconds: 1.5,
  overlapFactor: 0.5,
  minimumCandidateConfidence: 0.35,
  knownClassificationCount: 300,
  knownClassificationsSHA256: "a".repeat(64),
  resultWindowCount: 12,
  suggestions: [{ eventId: "audible_cough_server_test_001", classificationIdentifier: "cough", displayLabel: "Cough", family: "dialogue", startSeconds: 8, endSeconds: 8.75, confidence: 0.82, contributingWindowCount: 2, detail: "Listen to the protected source context." }],
  failureCode: null,
  failureDetail: null,
  boundaries: { classifierOutputIsListeningTriageOnly: true, classifierScoreIsNotAudibility: true, noMediaChanged: true, noRepairOrEditAuthorized: true, humanReviewRequired: true },
};
const productionJson = { importedMedia: [{ id: coordinates.assetId, sourceId: coordinates.sourceId, metadata: { recordingSync: { reportedSourceProfile: { audibleEventAnalysis: analysis } } } }] };
const context = {
  project: { id: "project_audible_server_001", slug: coordinates.projectSlug },
  asset: { id: coordinates.assetId },
  source: { id: coordinates.sourceId },
  sourceBinding: { assetId: coordinates.assetId, sha256, sizeBytes: 42_000, generation: `sha256:${sha256}`, provider: "local", locator: "/tmp/source.wav", contentType: "audio/wav" },
};

function createPrisma() {
  const reviews = new Map<string, any>();
  const models = {
    studioEpisodeProduction: { findMany: jest.fn().mockResolvedValue([{ productionJson, updatedAt: new Date() }]) },
    studioAudibleEventReviewReceipt: {
      findMany: jest.fn().mockImplementation(async ({ where }) => [...reviews.values()].filter((row) => row.analysisId === where.analysisId).reverse()),
      findUnique: jest.fn().mockImplementation(async ({ where }) => {
        const key = where.projectId_actorEmail_clientRequestId;
        return [...reviews.values()].find((row) => row.projectId === key.projectId && row.actorEmail === key.actorEmail && row.clientRequestId === key.clientRequestId) ?? null;
      }),
      create: jest.fn().mockImplementation(async ({ data }) => { const row = { ...data, createdAt: new Date() }; reviews.set(row.id, row); return row; }),
    },
  };
  return { ...models, $transaction: jest.fn().mockImplementation(async (callback) => callback(models)), reviews };
}

describe("audible-event append-only review evidence", () => {
  beforeEach(() => { jest.clearAllMocks(); jest.mocked(loadDialogueRepairContext).mockResolvedValue(context as never); });

  it("selects only the newest exact asset, source, SHA, and byte-bound completed receipt", () => {
    const older = { ...analysis, analysisId: "audible_analysis_server_test_000", analyzedAt: "2026-08-04T18:00:00.000Z" };
    const wrongSha = { ...analysis, analysisId: "audible_analysis_wrong_sha_001", sourceSHA256: "c".repeat(64), analyzedAt: "2026-08-06T18:00:00.000Z" };
    expect(selectSourceBoundAnalysis({
      productions: [
        { productionJson: { importedMedia: [{ id: coordinates.assetId, sourceId: coordinates.sourceId, sync: { recordingSync: { reportedSourceProfile: { audibleEventAnalysis: older } } } }] } },
        { productionJson },
        { productionJson: { importedMedia: [{ id: coordinates.assetId, sourceId: coordinates.sourceId, reportedSourceProfile: { audibleEventAnalysis: wrongSha } }] } },
      ],
      assetId: coordinates.assetId,
      sourceId: coordinates.sourceId,
      sourceSha256: sha256,
      sourceByteCount: 42_000,
    })?.analysisId).toBe(analysis.analysisId);
  });

  it("appends a source-context-bound review, replays idempotently, and projects current state", async () => {
    const prisma = createPrisma();
    const input = {
      prisma, ...coordinates, actor,
      analysisId: analysis.analysisId,
      eventId: analysis.suggestions[0].eventId,
      clientRequestId: "audible_review_request_001",
      decision: "confirmed" as const,
      playbackEvidence: { protectedPlaybackSourceId: coordinates.sourceId, contextStartSeconds: 7, contextEndSeconds: 9.75, listenedSecondBins: [7, 8, 9], clientTrackedPlaybackIsNotProofOfAudibility: true as const },
    };
    const first = await appendAudibleEventReview(input);
    const replay = await appendAudibleEventReview(input);
    expect(first).toMatchObject({ ok: true, idempotentReplay: false, receipt: { decision: "confirmed", eventId: analysis.suggestions[0].eventId }, status: { summary: { confirmedSuggestionCount: 1, pendingSuggestionCount: 0 } } });
    expect(replay).toMatchObject({ ok: true, idempotentReplay: true, receipt: { id: first.receipt.id } });
    expect(prisma.reviews.size).toBe(1);
    expect(acquirePrismaAdvisoryTransactionLock).toHaveBeenCalledWith(expect.anything(), `audible-event-review:${analysis.analysisId}:${analysis.suggestions[0].eventId}:editor@example.test`);
    expect((await readAudibleEventReviewStatus({ prisma, ...coordinates })).boundaries.surfacedSuggestionsAloneCannotMeasureRecall).toBe(true);
  });

  it("holds incomplete playback, stale analysis, and unexplained non-confirmation", async () => {
    const prisma = createPrisma();
    const base = { prisma, ...coordinates, actor, analysisId: analysis.analysisId, eventId: analysis.suggestions[0].eventId, clientRequestId: "audible_review_request_002", decision: "confirmed" as const, playbackEvidence: { protectedPlaybackSourceId: coordinates.sourceId, contextStartSeconds: 7, contextEndSeconds: 9.75, listenedSecondBins: [7, 8], clientTrackedPlaybackIsNotProofOfAudibility: true as const } };
    await expect(appendAudibleEventReview(base)).rejects.toMatchObject({ code: "AUDIBLE_EVENT_REVIEW_INCOMPLETE" });
    await expect(appendAudibleEventReview({ ...base, clientRequestId: "audible_review_request_003", analysisId: "audible_analysis_stale_001", playbackEvidence: { ...base.playbackEvidence, listenedSecondBins: [7, 8, 9] } })).rejects.toMatchObject({ code: "AUDIBLE_EVENT_ANALYSIS_STALE" });
    await expect(appendAudibleEventReview({ ...base, clientRequestId: "audible_review_request_004", decision: "false-positive", playbackEvidence: { ...base.playbackEvidence, listenedSecondBins: [7, 8, 9] } })).rejects.toBeInstanceOf(AudibleEventReviewError);
    expect(prisma.reviews.size).toBe(0);
  });
});
