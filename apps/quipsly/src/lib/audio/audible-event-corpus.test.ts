import { activeAudibleEventTruthReceipts, evaluateAudibleEventTruth, type AudibleEventTruthEvaluationInput } from "./audible-event-corpus";

const HASH = "a".repeat(64);
const CONFIG = "b".repeat(64);
function row(input: Partial<AudibleEventTruthEvaluationInput> & Pick<AudibleEventTruthEvaluationInput, "id" | "verdict">): AudibleEventTruthEvaluationInput {
  return {
    id: input.id,
    sourceId: input.sourceId ?? "source_001",
    detectorAnalysisId: "analysis_001",
    classificationIdentifier: input.classificationIdentifier ?? "beep",
    displayLabel: "Beep",
    family: "capture",
    verdict: input.verdict,
    workload: input.workload ?? "podcast",
    split: input.split ?? "validation",
    reviewStartSeconds: input.reviewStartSeconds ?? 0,
    reviewEndSeconds: input.reviewEndSeconds ?? 10,
    eventStartSeconds: input.verdict === "positive" ? input.eventStartSeconds ?? 2 : null,
    eventEndSeconds: input.verdict === "positive" ? input.eventEndSeconds ?? 3 : null,
    supersedesReceiptId: input.supersedesReceiptId ?? null,
    note: "Playback-reviewed fixture.",
    occurredAt: "2026-08-06T03:30:00.000Z",
    sourceSha256: HASH,
    sourceDurationSeconds: 10,
    detectorConfigurationSha256: CONFIG,
    analysis: input.analysis ?? {
      schemaVersion: 1,
      analysisId: "analysis_001",
      status: "completed",
      analyzedAt: "2026-08-06T03:00:00.000Z",
      sourceSHA256: HASH,
      sourceByteCount: 1_000,
      durationSeconds: 10,
      algorithm: "apple-sound-classifier-file-v1",
      classifierIdentifier: "SNClassifierIdentifierVersion1",
      requestedWindowDurationSeconds: 1.5,
      effectiveWindowDurationSeconds: 1.5,
      overlapFactor: 0.5,
      minimumCandidateConfidence: 0.5,
      knownClassificationCount: 300,
      knownClassificationsSHA256: "c".repeat(64),
      resultWindowCount: 4,
      suggestions: input.verdict === "positive" ? [{ eventId: "prediction_001", classificationIdentifier: "beep", displayLabel: "Beep", family: "capture", startSeconds: 2.1, endSeconds: 2.9, confidence: 0.91, contributingWindowCount: 2, detail: "Test prediction." }] : [],
      failureCode: null,
      failureDetail: null,
      supersedesAnalysisId: null,
      boundaries: { classifierOutputIsListeningTriageOnly: true, classifierScoreIsNotAudibility: true, noMediaChanged: true, noRepairOrEditAuthorized: true, humanReviewRequired: true },
    },
  };
}

test("qualification scores independently labeled positive and absent windows", () => {
  const positive = row({ id: "truth_positive_001", verdict: "positive" });
  const absent = row({ id: "truth_absent_001", verdict: "absent", sourceId: "source_002", workload: "coaching", analysis: { ...positive.analysis, analysisId: "analysis_002", suggestions: [{ ...positive.analysis.suggestions[0], eventId: "prediction_false_001", startSeconds: 6, endSeconds: 7 }] } });
  const metric = evaluateAudibleEventTruth({ receipts: [positive, absent], detectorConfigurationSha256: CONFIG })[0];
  expect(metric).toMatchObject({ truePositiveCount: 1, falsePositiveCount: 1, falseNegativeCount: 0, precision: 0.5, recall: 1, workloadCoverage: { podcast: 1, coaching: 1 }, status: "insufficient-evidence" });
  expect(metric.falsePositivesPerLabeledHour).toBe(180);
});

test("unlabeled predictions are excluded instead of becoming false positives", () => {
  const positive = row({ id: "truth_positive_002", verdict: "positive", reviewStartSeconds: 0, reviewEndSeconds: 4, analysis: { ...row({ id: "seed_truth_001", verdict: "positive" }).analysis, suggestions: [{ eventId: "prediction_outside_001", classificationIdentifier: "beep", displayLabel: "Beep", family: "capture", startSeconds: 8, endSeconds: 9, confidence: 0.9, contributingWindowCount: 1, detail: "Outside the independently labeled window." }] } });
  const metric = evaluateAudibleEventTruth({ receipts: [positive], detectorConfigurationSha256: CONFIG })[0];
  expect(metric).toMatchObject({ truePositiveCount: 0, falsePositiveCount: 0, falseNegativeCount: 1, precision: null, recall: 0 });
});

test("append-only supersession removes the earlier truth from the active projection", () => {
  const first = row({ id: "truth_superseded_001", verdict: "positive" });
  const replacement = row({ id: "truth_replacement_001", verdict: "absent", supersedesReceiptId: first.id });
  expect(activeAudibleEventTruthReceipts([first, replacement])).toEqual([replacement]);
});

test("calibration labels remain visible but cannot qualify their tuned detector", () => {
  const calibration = row({ id: "truth_calibration_001", verdict: "positive", split: "calibration" });
  const metric = evaluateAudibleEventTruth({ receipts: [calibration], detectorConfigurationSha256: CONFIG })[0];
  expect(metric).toMatchObject({ calibrationReceiptCount: 1, positiveEventCount: 0, truePositiveCount: 0, status: "insufficient-evidence" });
});
