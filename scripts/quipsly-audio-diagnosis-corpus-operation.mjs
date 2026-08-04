#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import {
  evaluateAudioDiagnosisRun,
  parseAudioDiagnosisCorpus,
  parseAudioDiagnosisRun,
} from "../packages/quipsly-media-processing/src/audio-diagnosis-evaluation.ts";
import { FfmpegAudioSignalProfiler } from "../apps/quipsly-media-processor/src/audio-signal-profile-ffmpeg.ts";

if (process.env.QUIPSLY_AUDIO_DIAGNOSIS_CORPUS_OPERATION !== "1") {
  throw new Error("Set QUIPSLY_AUDIO_DIAGNOSIS_CORPUS_OPERATION=1 to generate and evaluate the local audio diagnosis corpus.");
}

const execFile = promisify(execFileCallback);
const CREATED_AT = "2026-08-04T23:00:00.000Z";
const LABELS = ["sample-clipping", "possible-dropout"];
const CONFIGURATION = JSON.stringify({ algorithm: "quipsly-audio-signal-window-v1", clippingAmplitude: 0.999, nearSilenceDbfs: -72, minimumDropoutSeconds: 0.25, surroundingSignalDbfs: -45 });

async function sha256(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

async function generate(root, caseId, recipe) {
  const outputPath = path.join(root, `${caseId}.wav`);
  if (recipe === "clean-tone") {
    await execFile("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=1000:duration=4:sample_rate=48000", "-af", "volume=0.2", "-c:a", "pcm_f32le", outputPath]);
  } else if (recipe === "clipped-tone") {
    await execFile("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "aevalsrc=1.2*sin(2*PI*1000*t):s=48000:d=4", "-c:a", "pcm_f32le", outputPath]);
  } else {
    await execFile("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-f", "lavfi", "-i", "sine=frequency=1000:duration=1.5:sample_rate=48000",
      "-f", "lavfi", "-i", "anullsrc=channel_layout=mono:sample_rate=48000:d=0.5",
      "-f", "lavfi", "-i", "sine=frequency=1000:duration=2:sample_rate=48000",
      "-filter_complex", "[0:a][1:a][2:a]concat=n=3:v=0:a=1[out]",
      "-map", "[out]", "-c:a", "pcm_f32le", outputPath,
    ]);
  }
  return outputPath;
}

function corpusCase(input) {
  return {
    caseId: input.caseId,
    split: "validation",
    source: { assetId: `asset_${input.caseId}`, sha256: input.sha256, durationSeconds: input.durationSeconds, provenance: "generated-by-corpus-recipe", recipeId: `recipe_${input.recipe.replaceAll("-", "_")}_001` },
    truth: input.truth,
    negativeLabels: input.negativeLabels,
  };
}

function predictionsFor(caseId, sourceSha256, observations) {
  return observations.flatMap((observation, index) => {
    if (!LABELS.includes(observation.kind)) return [];
    return [{
      predictionId: `prediction_${caseId}_${observation.kind.replaceAll("-", "_")}_${index}`,
      caseId,
      sourceSha256,
      label: observation.kind,
      startSeconds: observation.startSeconds,
      endSeconds: Math.max(observation.endSeconds, observation.startSeconds + 0.001),
      score: null,
      detail: observation.detail,
      requiresListening: true,
      changesSource: false,
    }];
  });
}

async function main() {
  const root = await mkdtemp(path.join(tmpdir(), "quipsly-audio-diagnosis-corpus-"));
  try {
    const definitions = [
      { caseId: "case_clean_tone_001", recipe: "clean-tone", truth: [], negativeLabels: ["sample-clipping", "possible-dropout"] },
      { caseId: "case_clipped_tone_001", recipe: "clipped-tone", truth: [{ eventId: "truth_sample_clipping_001", label: "sample-clipping", startSeconds: 0, endSeconds: 4, origin: "synthetic-injection", note: "The float source recipe exceeds full-scale amplitude across the tone.", reviewReceipt: null }], negativeLabels: ["possible-dropout"] },
      { caseId: "case_injected_dropout_001", recipe: "tone-dropout-tone", truth: [{ eventId: "truth_possible_dropout_001", label: "possible-dropout", startSeconds: 1.5, endSeconds: 2, origin: "synthetic-injection", note: "The recipe inserts exact digital silence between continuous tone regions.", reviewReceipt: null }], negativeLabels: ["sample-clipping"] },
      { caseId: "case_intentional_pause_001", recipe: "tone-intentional-pause-tone", truth: [], negativeLabels: ["sample-clipping", "possible-dropout"] },
    ];
    const profiler = new FfmpegAudioSignalProfiler();
    const cases = [];
    const predictions = [];
    const operations = [];
    for (const definition of definitions) {
      const sourcePath = await generate(root, definition.caseId, definition.recipe);
      const beforeSha256 = await sha256(sourcePath);
      const result = await profiler.analyze(sourcePath, { frequencyAnalysis: true });
      const afterSha256 = await sha256(sourcePath);
      assert.equal(afterSha256, beforeSha256, `Analysis changed ${definition.caseId}.`);
      cases.push(corpusCase({ ...definition, sha256: beforeSha256, durationSeconds: result.audioSignal.durationSeconds }));
      predictions.push(...predictionsFor(definition.caseId, beforeSha256, result.audioSignal.observations));
      operations.push({ caseId: definition.caseId, recipe: definition.recipe, sourceSha256: beforeSha256, durationSeconds: result.audioSignal.durationSeconds, observations: result.audioSignal.observations.map((entry) => ({ kind: entry.kind, startSeconds: entry.startSeconds, endSeconds: entry.endSeconds })), sourceUnchanged: true });
    }
    const corpus = parseAudioDiagnosisCorpus({
      kind: "quipsly-audio-diagnosis-corpus-v1",
      version: 1,
      corpusId: "quipsly_audio_diagnosis_seed_corpus_001",
      revision: 1,
      createdAt: CREATED_AT,
      cases,
      boundaries: { unlabeledDoesNotMeanNegative: true, syntheticTruthDoesNotReplaceHumanListening: true, retainedSourcesRequirePermission: true },
    });
    const run = parseAudioDiagnosisRun({
      kind: "quipsly-audio-diagnosis-run-v1",
      version: 1,
      runId: "quipsly_audio_diagnosis_seed_run_001",
      corpusId: corpus.corpusId,
      corpusRevision: corpus.revision,
      createdAt: CREATED_AT,
      detector: { detectorId: "quipsly_audio_signal_window_rules_001", version: "1.0.0", configurationSha256: createHash("sha256").update(CONFIGURATION).digest("hex") },
      predictions,
      boundaries: { predictionsAreListeningCandidates: true, noTreatmentOrEditApplied: true },
    }, corpus);
    const report = evaluateAudioDiagnosisRun({ reportId: "quipsly_audio_diagnosis_seed_report_001", evaluatedAt: CREATED_AT, corpus, run });
    const clipping = report.labels.find((entry) => entry.label === "sample-clipping");
    const dropout = report.labels.find((entry) => entry.label === "possible-dropout");
    assert.equal(clipping.truePositiveCount, 1, "The current detector missed the exact synthetic clipping source.");
    assert.equal(dropout.truePositiveCount, 1, "The current detector missed the exact synthetic dropout.");
    assert.equal(dropout.falsePositiveCount, 1, "The intentional-pause trap must remain visible as a false positive.");
    assert.equal(dropout.status, "insufficient-evidence", "A tiny synthetic corpus must not qualify the dropout detector.");
    console.log(JSON.stringify({
      ok: true,
      localOnly: true,
      generatedSources: definitions.length,
      sourceBytesChanged: false,
      externalSideEffects: false,
      corpus: { id: corpus.corpusId, revision: corpus.revision, cases: corpus.cases.length, humanReviewedEvents: corpus.cases.flatMap((entry) => entry.truth).filter((entry) => entry.origin === "human-playback-review").length },
      detector: run.detector,
      operatedCases: operations,
      metrics: [clipping, dropout].map((entry) => ({ label: entry.label, status: entry.status, truePositives: entry.truePositiveCount, falsePositives: entry.falsePositiveCount, falseNegatives: entry.falseNegativeCount, precision: entry.precision, recall: entry.recall, falsePositivesPerHour: entry.falsePositivesPerHour, shortfalls: entry.shortfalls })),
      boundaries: report.boundaries,
    }, null, 2));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

await main();
