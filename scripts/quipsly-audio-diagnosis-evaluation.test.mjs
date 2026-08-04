import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateAudioDiagnosisRun,
  parseAudioDiagnosisCorpus,
  parseAudioDiagnosisEvaluationReport,
  parseAudioDiagnosisRun,
} from "../packages/quipsly-media-processing/src/audio-diagnosis-evaluation.ts";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);

function corpus() {
  return {
    kind: "quipsly-audio-diagnosis-corpus-v1",
    version: 1,
    corpusId: "audio_diagnosis_corpus_001",
    revision: 1,
    createdAt: "2026-08-04T22:00:00.000Z",
    cases: [
      {
        caseId: "case_positive_001",
        split: "validation",
        source: { assetId: "asset_positive_001", sha256: HASH_A, durationSeconds: 4, provenance: "participant-consented-recording", recipeId: null },
        truth: [{ eventId: "truth_dropout_001", label: "possible-dropout", startSeconds: 1, endSeconds: 2, origin: "human-playback-review", note: "Reviewer confirmed the injected interruption against playback.", reviewReceipt: { reviewerId: "reviewer_audio_001", reviewedAt: "2026-08-04T22:01:00.000Z", playbackStartSeconds: 0.5, playbackEndSeconds: 2.5 } }],
        negativeLabels: ["sample-clipping"],
      },
      {
        caseId: "case_negative_001",
        split: "validation",
        source: { assetId: "asset_negative_001", sha256: HASH_B, durationSeconds: 4, provenance: "generated-by-corpus-recipe", recipeId: "recipe_clean_tone_001" },
        truth: [],
        negativeLabels: ["possible-dropout", "sample-clipping"],
      },
      {
        caseId: "case_unlabeled_001",
        split: "retained-challenge",
        source: { assetId: "asset_unlabeled_001", sha256: HASH_C, durationSeconds: 6, provenance: "licensed-source", recipeId: null },
        truth: [],
        negativeLabels: [],
      },
    ],
    boundaries: { unlabeledDoesNotMeanNegative: true, syntheticTruthDoesNotReplaceHumanListening: true, retainedSourcesRequirePermission: true },
  };
}

function run(predictions) {
  return {
    kind: "quipsly-audio-diagnosis-run-v1",
    version: 1,
    runId: "audio_diagnosis_run_001",
    corpusId: "audio_diagnosis_corpus_001",
    corpusRevision: 1,
    createdAt: "2026-08-04T22:02:00.000Z",
    detector: { detectorId: "quipsly_window_rule_001", version: "1.0.0", configurationSha256: "d".repeat(64) },
    predictions,
    boundaries: { predictionsAreListeningCandidates: true, noTreatmentOrEditApplied: true },
  };
}

function prediction(input) {
  return { predictionId: input.id, caseId: input.caseId, sourceSha256: input.sha256, label: input.label ?? "possible-dropout", startSeconds: input.start, endSeconds: input.end, score: null, detail: "Listening candidate only.", requiresListening: true, changesSource: false };
}

test("intersection scoring reports matched, false-positive, missed, and explicitly unscored evidence", () => {
  const evaluated = evaluateAudioDiagnosisRun({
    reportId: "audio_diagnosis_report_001",
    evaluatedAt: "2026-08-04T22:03:00.000Z",
    corpus: corpus(),
    run: run([
      prediction({ id: "prediction_true_001", caseId: "case_positive_001", sha256: HASH_A, start: 1.1, end: 1.9 }),
      prediction({ id: "prediction_false_001", caseId: "case_negative_001", sha256: HASH_B, start: 1, end: 1.5 }),
      prediction({ id: "prediction_unscored_001", caseId: "case_unlabeled_001", sha256: HASH_C, start: 2, end: 3 }),
    ]),
  });
  const dropout = evaluated.labels.find((entry) => entry.label === "possible-dropout");
  assert.equal(dropout.truePositiveCount, 1);
  assert.equal(dropout.falsePositiveCount, 1);
  assert.equal(dropout.falseNegativeCount, 0);
  assert.equal(dropout.precision, 0.5);
  assert.equal(dropout.recall, 1);
  assert.equal(dropout.f1, 0.666667);
  assert.equal(dropout.status, "insufficient-evidence");
  assert.deepEqual(evaluated.unscoredPredictionIds, ["prediction_unscored_001"]);
  assert.equal(evaluated.boundaries.qualificationNeverAuthorizesAutomaticTreatment, true);
  assert.doesNotThrow(() => parseAudioDiagnosisEvaluationReport(evaluated));
});

test("a permissive policy can qualify listening triage but never treatment", () => {
  const evaluated = evaluateAudioDiagnosisRun({
    reportId: "audio_diagnosis_report_qualified_001",
    evaluatedAt: "2026-08-04T22:03:00.000Z",
    corpus: corpus(),
    run: run([prediction({ id: "prediction_true_002", caseId: "case_positive_001", sha256: HASH_A, start: 1, end: 2 })]),
    policy: { policyId: "test_policy_qualified_001", minimumPositiveEvents: 1, minimumPositiveCases: 1, minimumNegativeHours: 0.001, minimumHumanReviewedEvents: 1, minimumPrecision: 0.9, minimumRecall: 0.9, maximumFalsePositivesPerHour: 1 },
  });
  const dropout = evaluated.labels.find((entry) => entry.label === "possible-dropout");
  assert.equal(dropout.status, "qualified-for-listening-triage");
  assert.equal(dropout.precision, 1);
  assert.equal(dropout.falsePositivesPerHour, 0);
  assert.equal(evaluated.boundaries.qualificationAllowsListeningTriageOnly, true);
});

test("intersection matching rejects a prediction that swallows too much unrelated time", () => {
  const evaluated = evaluateAudioDiagnosisRun({
    reportId: "audio_diagnosis_report_wide_001",
    evaluatedAt: "2026-08-04T22:03:00.000Z",
    corpus: corpus(),
    run: run([prediction({ id: "prediction_wide_001", caseId: "case_positive_001", sha256: HASH_A, start: 0, end: 4 })]),
  });
  const dropout = evaluated.labels.find((entry) => entry.label === "possible-dropout");
  assert.equal(dropout.truePositiveCount, 0);
  assert.equal(dropout.falsePositiveCount, 1);
  assert.equal(dropout.falseNegativeCount, 1);
});

test("contracts fail closed on source drift, unlabeled-as-negative shortcuts, and false side-effect claims", () => {
  assert.doesNotThrow(() => parseAudioDiagnosisCorpus(corpus()));
  assert.throws(() => parseAudioDiagnosisCorpus({
    ...corpus(),
    cases: [{ ...corpus().cases[0], negativeLabels: ["possible-dropout"] }],
  }), /truth and negative labels conflict/i);
  assert.throws(() => parseAudioDiagnosisRun(run([
    prediction({ id: "prediction_drift_001", caseId: "case_positive_001", sha256: HASH_B, start: 1, end: 2 }),
  ]), corpus()), /exact corpus source/i);
  assert.throws(() => parseAudioDiagnosisRun({ ...run([]), boundaries: { predictionsAreListeningCandidates: true, noTreatmentOrEditApplied: false } }, corpus()), /contract is invalid/i);
});
