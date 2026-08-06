import {
  audibleEventDetectorReceiptMatchesSource,
  parseAudibleEventDetectorReceipt,
} from "./audible-event-analysis";

function receipt(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    analysisId: "audible_analysis_test_receipt_001",
    supersedesAnalysisId: null,
    status: "completed",
    algorithm: "apple-sound-classifier-file-v1",
    classifierIdentifier: "SNClassifierIdentifierVersion1",
    analyzedAt: "2026-08-05T18:00:00Z",
    sourceSHA256: "b".repeat(64),
    sourceByteCount: 42_000,
    durationSeconds: 10,
    requestedWindowDurationSeconds: 1.5,
    effectiveWindowDurationSeconds: 1.5,
    overlapFactor: 0.5,
    minimumCandidateConfidence: 0.35,
    knownClassificationCount: 300,
    knownClassificationsSHA256: "a".repeat(64),
    resultWindowCount: 12,
    suggestions: [{
      eventId: "audible_1234567890abcdef12345678",
      classificationIdentifier: "cough",
      displayLabel: "Cough",
      family: "dialogue",
      startSeconds: 1,
      endSeconds: 2.5,
      confidence: 0.82,
      contributingWindowCount: 2,
      detail: "Listen to the protected source context.",
    }],
    failureCode: null,
    failureDetail: null,
    boundaries: {
      classifierOutputIsListeningTriageOnly: true,
      classifierScoreIsNotAudibility: true,
      noMediaChanged: true,
      noRepairOrEditAuthorized: true,
      humanReviewRequired: true,
    },
    ...overrides,
  };
}

describe("parseAudibleEventDetectorReceipt", () => {
  it("accepts a bounded native classifier receipt", () => {
    const parsed = parseAudibleEventDetectorReceipt(receipt());
    expect(parsed?.suggestions).toEqual([expect.objectContaining({
      classificationIdentifier: "cough",
      family: "dialogue",
      confidence: 0.82,
    })]);
  });

  it("rejects source-clock escape and weakened review boundaries", () => {
    const escaped = receipt({ suggestions: [{
      ...receipt().suggestions[0],
      endSeconds: 12,
    }] });
    expect(parseAudibleEventDetectorReceipt(escaped)).toBeNull();
    expect(parseAudibleEventDetectorReceipt(receipt({ boundaries: {} }))).toBeNull();
  });

  it("preserves a failed analysis receipt without inventing suggestions", () => {
    const parsed = parseAudibleEventDetectorReceipt(receipt({
      status: "failed",
      suggestions: [],
      resultWindowCount: 0,
      failureCode: "com.apple.soundanalysis-1",
      failureDetail: "Analysis did not complete.",
    }));
    expect(parsed).toEqual(expect.objectContaining({ status: "failed", suggestions: [] }));
  });

  it("binds completed analysis to the exact upload bytes", () => {
    expect(audibleEventDetectorReceiptMatchesSource(receipt(), "b".repeat(64), 42_000)).toBe(true);
    expect(audibleEventDetectorReceiptMatchesSource(receipt(), "c".repeat(64), 42_000)).toBe(false);
    expect(audibleEventDetectorReceiptMatchesSource(receipt(), "b".repeat(64), 42_001)).toBe(false);
    expect(audibleEventDetectorReceiptMatchesSource(receipt({
      status: "failed",
      sourceSHA256: null,
      suggestions: [],
      resultWindowCount: 0,
      failureCode: "analysis-incomplete",
      failureDetail: "Analysis did not complete.",
    }), "b".repeat(64), 42_000)).toBe(true);
  });

  it("rejects missing suggestion arrays, zero-width ranges, and duplicate event identities", () => {
    expect(parseAudibleEventDetectorReceipt(receipt({ suggestions: undefined }))).toBeNull();
    const suggestion = receipt().suggestions[0];
    expect(parseAudibleEventDetectorReceipt(receipt({ suggestions: [{ ...suggestion, endSeconds: 1 }] }))).toBeNull();
    expect(parseAudibleEventDetectorReceipt(receipt({ suggestions: [suggestion, suggestion] }))).toBeNull();
  });
});
