/** @jest-environment node */

import { acquirePrismaAdvisoryTransactionLock } from "@/lib/server/prisma-advisory-lock";
import { audibleEventDetectorConfigurationHash, loadAudibleEventContext } from "./audible-event-review";

import { appendAudibleEventTruth, AudibleEventCorpusError, readAudibleEventCorpusStatus } from "./audible-event-corpus";

jest.mock("server-only", () => ({}));
jest.mock("@/lib/server/prisma-advisory-lock", () => ({ acquirePrismaAdvisoryTransactionLock: jest.fn() }));
jest.mock("./audible-event-review", () => ({ loadAudibleEventContext: jest.fn(), audibleEventDetectorConfigurationHash: jest.fn() }));

const SOURCE_SHA = "a".repeat(64);
const CONFIG_SHA = "b".repeat(64);
const coordinates = { projectSlug: "high-ground-odyssey", assetId: "asset_truth_server_001", sourceId: "source_truth_server_001" };
const actor = { id: "actor_truth_server_001", email: "Editor@Example.test" };
const analysis = {
  schemaVersion: 1,
  analysisId: "audible_analysis_truth_server_001",
  supersedesAnalysisId: null,
  status: "completed",
  algorithm: "apple-sound-classifier-file-v1",
  classifierIdentifier: "SNClassifierIdentifierVersion1",
  analyzedAt: "2026-08-06T03:00:00.000Z",
  sourceSHA256: SOURCE_SHA,
  sourceByteCount: 10_000,
  durationSeconds: 8,
  requestedWindowDurationSeconds: 1.5,
  effectiveWindowDurationSeconds: 1.5,
  overlapFactor: 0.5,
  minimumCandidateConfidence: 0.35,
  knownClassificationCount: 300,
  knownClassificationsSHA256: "c".repeat(64),
  resultWindowCount: 10,
  suggestions: [{ eventId: "audible_beep_truth_server_001", classificationIdentifier: "beep", displayLabel: "Beep", family: "capture", startSeconds: 1, endSeconds: 2, confidence: 0.8, contributingWindowCount: 2, detail: "Listen to protected source context." }],
  failureCode: null,
  failureDetail: null,
  boundaries: { classifierOutputIsListeningTriageOnly: true, classifierScoreIsNotAudibility: true, noMediaChanged: true, noRepairOrEditAuthorized: true, humanReviewRequired: true },
};
const context = { project: { id: "project_truth_server_001", slug: coordinates.projectSlug }, asset: { id: coordinates.assetId }, source: { id: coordinates.sourceId }, sourceBinding: { assetId: coordinates.assetId, sha256: SOURCE_SHA, sizeBytes: 10_000, generation: `sha256:${SOURCE_SHA}`, provider: "local", locator: "/tmp/source.wav", contentType: "audio/wav" }, analysis };

function createPrisma() {
  const receipts = new Map<string, any>();
  const model = {
    findMany: jest.fn().mockImplementation(async ({ where }) => [...receipts.values()].filter((row) => row.projectId === where.projectId && (!where.sourceId || row.sourceId === where.sourceId) && (!where.classificationIdentifier || row.classificationIdentifier === where.classificationIdentifier))),
    findUnique: jest.fn().mockImplementation(async ({ where }) => {
      const key = where.projectId_actorEmail_clientRequestId;
      return [...receipts.values()].find((row) => row.projectId === key.projectId && row.actorEmail === key.actorEmail && row.clientRequestId === key.clientRequestId) ?? null;
    }),
    create: jest.fn().mockImplementation(async ({ data }) => { const row = { ...data, createdAt: new Date() }; receipts.set(row.id, row); return row; }),
  };
  const models = { studioAudibleEventTruthReceipt: model };
  return { ...models, $transaction: jest.fn().mockImplementation(async (callback) => callback(models)), receipts };
}

describe("audible-event independent ground truth", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(loadAudibleEventContext).mockResolvedValue(context as never);
    jest.mocked(audibleEventDetectorConfigurationHash).mockReturnValue(CONFIG_SHA);
  });

  it("appends playback-complete truth, replays idempotently, and measures current detector evidence", async () => {
    const prisma = createPrisma();
    const input = { prisma, ...coordinates, actor, clientRequestId: "truth_request_server_001", verdict: "positive" as const, workload: "podcast" as const, split: "retained-challenge" as const, classificationIdentifier: "Beep", displayLabel: "Beep", family: "capture", reviewStartSeconds: 0, reviewEndSeconds: 4, eventStartSeconds: 1, eventEndSeconds: 2, playbackEvidence: { protectedPlaybackSourceId: coordinates.sourceId, contextStartSeconds: 0, contextEndSeconds: 4, listenedSecondBins: [0, 1, 2, 3], clientTrackedPlaybackIsNotProofOfAudibility: true }, note: "Clearly audible beep." };
    const first = await appendAudibleEventTruth(input);
    const replay = await appendAudibleEventTruth(input);
    expect(first).toMatchObject({ ok: true, idempotentReplay: false, receipt: { verdict: "positive", classificationIdentifier: "beep" }, status: { projectQualification: { metrics: [{ truePositiveCount: 1, falseNegativeCount: 0, status: "insufficient-evidence" }] } } });
    expect(replay).toMatchObject({ ok: true, idempotentReplay: true, receipt: { id: first.receipt.id } });
    expect(prisma.receipts.size).toBe(1);
    expect(acquirePrismaAdvisoryTransactionLock).toHaveBeenCalledWith(expect.anything(), expect.stringContaining(":beep"));
    expect((await readAudibleEventCorpusStatus({ prisma, ...coordinates })).boundaries.unlabeledTimeIsExcluded).toBe(true);
  });

  it("rejects incomplete playback and contradictory active labels", async () => {
    const prisma = createPrisma();
    const base = { prisma, ...coordinates, actor, clientRequestId: "truth_request_server_002", verdict: "positive" as const, workload: "podcast" as const, split: "validation" as const, classificationIdentifier: "beep", displayLabel: "Beep", family: "capture", reviewStartSeconds: 0, reviewEndSeconds: 4, eventStartSeconds: 1, eventEndSeconds: 2, playbackEvidence: { protectedPlaybackSourceId: coordinates.sourceId, contextStartSeconds: 0, contextEndSeconds: 4, listenedSecondBins: [0, 1], clientTrackedPlaybackIsNotProofOfAudibility: true }, note: "Clearly audible beep." };
    await expect(appendAudibleEventTruth(base)).rejects.toMatchObject({ code: "AUDIBLE_EVENT_TRUTH_PLAYBACK_INCOMPLETE" });
    await appendAudibleEventTruth({ ...base, playbackEvidence: { ...base.playbackEvidence, listenedSecondBins: [0, 1, 2, 3] } });
    await expect(appendAudibleEventTruth({ ...base, clientRequestId: "truth_request_server_duplicate_003", playbackEvidence: { ...base.playbackEvidence, listenedSecondBins: [0, 1, 2, 3] } })).rejects.toMatchObject({ code: "AUDIBLE_EVENT_TRUTH_DUPLICATE" });
    await expect(appendAudibleEventTruth({ ...base, clientRequestId: "truth_request_server_003", verdict: "absent", eventStartSeconds: null, eventEndSeconds: null, playbackEvidence: { ...base.playbackEvidence, listenedSecondBins: [0, 1, 2, 3] }, note: "No beep is audible." })).rejects.toBeInstanceOf(AudibleEventCorpusError);
    expect(prisma.receipts.size).toBe(1);
  });
});
