import {
  buildTranscriptEvaluationBoardFromRows,
  readTranscriptEvaluationBoard,
  type TranscriptEvaluationBoardRow,
} from "./transcript-evaluation-board";
import { transcriptProviderComparisonConfigSha256 } from "./transcript-evaluation-candidates";

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);
const D = "d".repeat(64);
const PRIVATE_PHRASE = "private reference words must never leave the server";
const PRIVATE_REVIEWER = "private-reviewer-user-id";
const PRIVATE_POLICY_URL = "https://provider.example/private-account-policy";

function row(overrides: Partial<TranscriptEvaluationBoardRow> = {}): TranscriptEvaluationBoardRow {
  return {
    id: "window-001",
    roomId: "room-001",
    workload: "podcast",
    conditionsJson: ["clean-charlie-speech"],
    sourceDurationSeconds: 60,
    sourceSha256: A,
    consentVersionSha256: B,
    referenceRevisionId: "reference-revision-001",
    referenceContentSha256: C,
    referenceWordsJson: [{
      text: PRIVATE_PHRASE,
      startSeconds: 0,
      endSeconds: 1,
      speakerId: "charlie",
    }],
    approvedByUserId: PRIVATE_REVIEWER,
    approvedAt: "2026-08-03T18:00:00.000Z",
    room: {
      title: "Retained podcast rehearsal",
      purpose: "PODCAST",
      project: { name: "High Ground Odyssey", slug: "high-ground-odyssey" },
    },
    candidates: [],
    ...overrides,
  };
}

function successfulCandidate(overrides: Record<string, unknown> = {}) {
  return {
    id: "candidate-001",
    providerKey: "provider-one",
    providerName: "Provider One",
    model: "model-2026-08-01",
    adapterVersion: "adapter-v1",
    requestConfigSha256: D,
    requestConfigJson: { provider: { model: "model-2026-08-01" } },
    metricsJson: {
      words: { referenceWordCount: 7, wordErrorCount: 0 },
      terminology: null,
    },
    speakerAttribution: "word",
    timingGranularity: "word",
    outcome: "succeeded",
    providerReceiptSha256: A,
    normalizedWordsJson: [{
      text: PRIVATE_PHRASE,
      startSeconds: 0.025,
      endSeconds: 1,
      speakerId: "charlie",
    }],
    elapsedMilliseconds: 2_500,
    estimatedCostUsd: 0.002,
    errorCode: null,
    retryable: null,
    completedAt: "2026-08-03T18:02:00.000Z",
    policy: {
      receiptSha256: B,
      capturedAt: "2026-08-03T17:55:00.000Z",
      policyJson: {
        sourceUrl: PRIVATE_POLICY_URL,
        trainingUsage: "opted-out",
        retentionMode: "time-limited",
        retentionDays: 30,
        processingRegion: "us",
      },
    },
    corrections: [{
      reviewerUserId: PRIVATE_REVIEWER,
      elapsedMilliseconds: 42_000,
      operationCount: 3,
      observedAt: "2026-08-03T18:05:00.000Z",
    }],
    ...overrides,
  };
}

describe("transcript evaluation board", () => {
  it("makes missing real-work conditions and the next evidence visible without synthetic scores", () => {
    const board = buildTranscriptEvaluationBoardFromRows([
      row(),
      row({
        id: "window-002",
        roomId: "room-002",
        workload: "coaching",
        conditionsJson: ["commitments-and-dates"],
        sourceSha256: D,
        referenceRevisionId: "reference-revision-002",
        approvedAt: "2026-08-03T19:00:00.000Z",
        room: {
          title: "Retained coaching follow-up",
          purpose: "COACHING",
          project: { name: "Coaching", slug: "coaching" },
        },
      }),
    ], "2026-08-04T00:00:00.000Z");

    expect(board.summary).toMatchObject({
      windowCount: 2,
      coveredConditionCount: 2,
      requiredConditionCount: 12,
      candidateAttemptCount: 0,
      correctionPassCount: 0,
      corpusCoverageComplete: false,
    });
    expect(board.workloads.find((workload) => workload.id === "podcast")?.conditions)
      .toContainEqual(expect.objectContaining({ id: "clean-charlie-speech", covered: true }));
    expect(board.workloads.find((workload) => workload.id === "coaching")?.conditions)
      .toContainEqual(expect.objectContaining({ id: "quiet-or-distant-voice", covered: false }));
    expect(board.nextEvidence).toContainEqual(expect.objectContaining({
      kind: "condition",
      workload: "podcast",
      label: "clean-homer-speech",
    }));
    expect(board.nextEvidence).toContainEqual(expect.objectContaining({
      kind: "provider",
      workload: "coaching",
    }));
  });

  it("reports exact provider evidence and human correction effort while excluding private payloads", () => {
    const board = buildTranscriptEvaluationBoardFromRows([
      row({ candidates: [successfulCandidate()] }),
    ], "2026-08-04T00:00:00.000Z");
    const provider = board.workloads[0]?.providers[0];

    expect(provider).toMatchObject({
      providerName: "Provider One",
      model: "model-2026-08-01",
      attemptedWindowCount: 1,
      succeededWindowCount: 1,
      cleanWordErrorRate: 0,
      speakerErrorRate: 0,
      correctionPassCount: 1,
      correctionElapsedMilliseconds: 42_000,
      correctionOperationCount: 3,
      status: "insufficient-evidence",
    });
    expect(provider?.timingP95Milliseconds).toBe(25);
    expect(JSON.stringify(board)).not.toContain(PRIVATE_PHRASE);
    expect(JSON.stringify(board)).not.toContain(PRIVATE_REVIEWER);
    expect(JSON.stringify(board)).not.toContain(PRIVATE_POLICY_URL);
    expect(JSON.stringify(board)).not.toContain(A);
    expect(board.boundaries).toEqual({
      transcriptTextExposed: false,
      reviewerIdentityExposed: false,
      sourcePathExposed: false,
      universalProviderWinner: false,
      productionDefaultChanged: false,
      readOnly: true,
    });
  });

  it("scopes the database projection through the shared Session access boundary", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    await readTranscriptEvaluationBoard({
      prisma: { transcriptEvaluationWindow: { findMany } },
      actor: { id: "actor-001", primaryEmail: "editor@example.test", isStaff: false },
      generatedAt: "2026-08-04T00:00:00.000Z",
    });

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0]?.[0]?.where?.room?.OR).toEqual(expect.arrayContaining([
      { createdByUserId: "actor-001" },
      expect.objectContaining({ project: expect.any(Object) }),
    ]));
    expect(findMany.mock.calls[0]?.[0]?.take).toBe(500);
  });

  it("keeps provider comparison identity stable while exact input receipts differ", () => {
    const provider = { model: "pinned-v1", language: "en", diarization: "word" };
    const first = transcriptProviderComparisonConfigSha256({
      provider,
      inputMedia: { sha256: A, startSeconds: 0, endSeconds: 60 },
    });
    const second = transcriptProviderComparisonConfigSha256({
      provider,
      inputMedia: { sha256: B, startSeconds: 60, endSeconds: 120 },
    });

    expect(first).toBe(second);
    expect(() => transcriptProviderComparisonConfigSha256({
      inputMedia: { sha256: A },
    })).toThrow("non-empty provider object");
  });

  it("compares terminology only when both arms share a window, base provider config, and frozen term receipt", () => {
    const termsSha256 = "e".repeat(64);
    const config = (arm: "baseline" | "project-terminology") => ({
      provider: {
        model: "model-2026-08-01",
        language: "en",
        terminology: arm === "baseline"
          ? { mode: "none", snapshotSha256: termsSha256, termCount: 0 }
          : { mode: "project-snapshot", snapshotSha256: termsSha256, termCount: 3, promptSha256: "f".repeat(64) },
      },
      terminologyExperiment: {
        schema: "quipsly-transcript-terminology-experiment-v1",
        comparisonKey: "hgo-terms-v1",
        arm,
        termsSha256,
      },
    });
    const metrics = (errors: number, matched: number, falsePositive: number) => ({
      words: { referenceWordCount: 100, wordErrorCount: errors },
      terminology: {
        referenceOccurrenceCount: 4,
        candidateMentionCount: matched + falsePositive,
        matchedOccurrenceCount: matched,
        falsePositiveMentionCount: falsePositive,
        canonicalCandidateMentionCount: matched,
      },
    });
    const board = buildTranscriptEvaluationBoardFromRows([row({ candidates: [
      successfulCandidate({
        id: "candidate-baseline",
        requestConfigSha256: "1".repeat(64),
        requestConfigJson: config("baseline"),
        metricsJson: metrics(12, 2, 0),
      }),
      successfulCandidate({
        id: "candidate-terminology",
        requestConfigSha256: "2".repeat(64),
        requestConfigJson: config("project-terminology"),
        metricsJson: metrics(8, 4, 0),
      }),
    ] })], "2026-08-04T00:00:00.000Z");

    expect(board.summary.matchedTerminologyPairCount).toBe(1);
    expect(board.terminologyComparisons).toHaveLength(1);
    expect(board.terminologyComparisons[0]).toMatchObject({
      comparisonKey: "hgo-terms-v1",
      pairCount: 1,
      baselineWordErrorRate: 0.12,
      terminologyWordErrorRate: 0.08,
      baselineCriticalTermRecall: 0.5,
      terminologyCriticalTermRecall: 1,
      baselineFalsePositiveCount: 0,
      terminologyFalsePositiveCount: 0,
      verdict: "improved",
    });
    expect(JSON.stringify(board)).not.toContain(PRIVATE_PHRASE);
  });
});
