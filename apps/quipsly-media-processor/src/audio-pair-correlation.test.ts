import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  AUDIO_PAIR_CORRELATION_RESULT_KIND,
  newAudioPairCorrelationJob,
  parseAudioPairCorrelationResult,
} from "@high-ground/quipsly-media-processing";

import { analyzeAudioPairCorrelation } from "./audio-pair-correlation.js";
import { FfmpegAudioPairCorrelationAnalyzer } from "./audio-pair-correlation-ffmpeg.js";
import { runOneLocalAudioPairCorrelationJob } from "./local-audio-pair-correlation-worker.js";

const SAMPLE_RATE = 16_000;

test("finds a delayed attenuated copy without classifying its cause", () => {
  const reference = patternedSignal(5, 7);
  const observation = new Float32Array(reference.length);
  const delaySamples = Math.round(SAMPLE_RATE * 0.12);
  for (let index = 0; index < reference.length - delaySamples; index += 1) observation[index + delaySamples] = reference[index] * 0.25;

  const analysis = analyzeAudioPairCorrelation(reference, observation);

  assert.equal(analysis.measurement.bestLagMilliseconds, 120);
  assert.ok(analysis.measurement.peakPowerCorrelation > 0.98);
  assert.ok(analysis.measurement.waveformCorrelationAtBestLag > 0.99);
  assert.ok(Math.abs(analysis.measurement.observationToReferenceLevelDb + 12.04) < 0.2);
  assert.ok(analysis.measurement.reliability > 0.9);
  assert.equal(analysis.segments.length, 1);
});

test("keeps independently varying overlap low-correlation", () => {
  const reference = randomEnvelopeSignal(5, 11);
  const observation = randomEnvelopeSignal(5, 41);
  const analysis = analyzeAudioPairCorrelation(reference, observation);

  assert.ok(analysis.measurement.peakAbsolutePowerCorrelation < 0.5);
  assert.ok(Math.abs(analysis.measurement.waveformCorrelationAtBestLag) < 0.1);
});

test("binds a result to exact sources, program decisions, and analyzer settings", () => {
  const job = correlationJob();
  const reference = patternedSignal(2, 7);
  const observation = patternedSignal(2, 41);
  const analysis = analyzeAudioPairCorrelation(reference, observation);
  const receipt = {
    kind: AUDIO_PAIR_CORRELATION_RESULT_KIND,
    version: 1,
    jobId: job.jobId,
    completedAt: "2026-08-06T15:01:00.000Z",
    analysisReceiptId: job.analysisReceiptId,
    activityMomentId: job.activityMomentId,
    programFingerprintSha256: job.programFingerprintSha256,
    activeDecisionReceiptIds: job.activeDecisionReceiptIds,
    reference: job.reference,
    observation: job.observation,
    measurement: analysis.measurement,
    segments: analysis.segments.map((segment) => ({ programStartSeconds: job.reference.range.programStartSeconds + segment.startSeconds, programEndSeconds: job.reference.range.programStartSeconds + segment.endSeconds, measurement: segment.measurement })),
    analyzer: { ...job.analyzer, ffmpegVersion: "ffmpeg test fixture", completeRangeDecode: true },
    worker: { executionId: "correlation_execution_0001", buildId: "correlation-test", imageDigest: null, attempt: 1 },
    boundaries: { ...job.boundaries, exactSourcesVerifiedBeforeAndAfter: true, resultIsMeasurementNotMixAuthorization: true },
  };

  assert.equal(parseAudioPairCorrelationResult(receipt, job).measurement.sampleRate, 16_000);
  assert.throws(() => parseAudioPairCorrelationResult({ ...receipt, programFingerprintSha256: "9".repeat(64) }, job), /does not match/);
  assert.throws(() => parseAudioPairCorrelationResult({ ...receipt, analyzer: { ...receipt.analyzer, maximumLagMilliseconds: 500 } }, job), /analyzer contract/);
});

test("decodes two exact bounded WAV ranges through FFmpeg", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "quipsly-audio-pair-test-"));
  try {
    const reference = patternedSignal(2, 7);
    const observation = new Float32Array(reference.length);
    const delaySamples = Math.round(SAMPLE_RATE * 0.08);
    for (let index = 0; index < reference.length - delaySamples; index += 1) observation[index + delaySamples] = reference[index] * 0.5;
    const referencePath = path.join(root, "reference.wav");
    const observationPath = path.join(root, "observation.wav");
    await Promise.all([writeFile(referencePath, pcm16Wav(reference)), writeFile(observationPath, pcm16Wav(observation))]);
    const analyzer = new FfmpegAudioPairCorrelationAnalyzer();
    const programClockRange = { programStartSeconds: 10, programEndSeconds: 12, sourceStartSeconds: 0, sourceEndSeconds: 2, alignment: "program-clock" as const, alignmentEvidenceJobId: null };
    const result = await analyzer.analyze({
      referencePath,
      referenceRange: programClockRange,
      observationPath,
      observationRange: { ...programClockRange, alignment: "qualified-candidate", alignmentEvidenceJobId: "alignment_job_0001" },
    });
    assert.equal(result.measurement.bestLagMilliseconds, 80);
    assert.ok(result.measurement.waveformCorrelationAtBestLag > 0.99);
    assert.match(result.ffmpegVersion, /^ffmpeg version/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("worker verifies both retained sources before publishing an output-ready receipt", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "quipsly-audio-pair-worker-test-"));
  try {
    const referenceBytes = pcm16Wav(patternedSignal(2, 7));
    const observationBytes = pcm16Wav(patternedSignal(2, 41));
    const referencePath = path.join(root, "reference.wav");
    const observationPath = path.join(root, "observation.wav");
    await Promise.all([writeFile(referencePath, referenceBytes), writeFile(observationPath, observationBytes)]);
    const source = (assetId: string, locator: string, bytes: Buffer) => {
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      return { assetId, provider: "local" as const, locator, generation: `sha256:${sha256}`, sha256, sizeBytes: bytes.length, contentType: "audio/wav" };
    };
    const job = newAudioPairCorrelationJob({
      ...correlationJob(),
      jobId: "correlation_worker_job_0001",
      reference: { ...correlationJob().reference, source: source("reference_worker_asset_0001", referencePath, referenceBytes), range: { ...correlationJob().reference.range, programStartSeconds: 0, programEndSeconds: 2, sourceStartSeconds: 0, sourceEndSeconds: 2 } },
      observation: { ...correlationJob().observation, source: source("observation_worker_asset_0001", observationPath, observationBytes), range: { ...correlationJob().observation.range, programStartSeconds: 0, programEndSeconds: 2, sourceStartSeconds: 0, sourceEndSeconds: 2 } },
    });
    let completedReceipt: unknown = null;
    const store = {
      claim: async () => ({ id: job.jobId, inputJson: job, attempt: 1, executionId: "correlation_worker_execution_0001" }),
      complete: async (input: { receipt: unknown }) => { completedReceipt = input.receipt; return true; },
      retry: async () => { throw new Error("unexpected retry"); },
      fail: async () => { throw new Error("unexpected failure"); },
    };
    const result = await runOneLocalAudioPairCorrelationJob(store, new FfmpegAudioPairCorrelationAnalyzer(), { executionId: "correlation_worker_execution_0001", buildId: "worker-test", imageDigest: null, leaseMs: 60_000, localMediaRoot: root, now: () => new Date("2026-08-06T15:02:00.000Z") });

    assert.equal(result.disposition, "completed");
    assert.equal(parseAudioPairCorrelationResult(completedReceipt, job).boundaries.exactSourcesVerifiedBeforeAndAfter, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function patternedSignal(seconds: number, seed: number) {
  const samples = new Float32Array(seconds * SAMPLE_RATE);
  let state = seed >>> 0;
  for (let index = 0; index < samples.length; index += 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const noise = (state / 0xffffffff) * 2 - 1;
    const time = index / SAMPLE_RATE;
    const envelope = (Math.floor(time * 4 + seed) % 5) < 3 ? 0.35 + 0.15 * Math.sin(time * 2.1 + seed) : 0.015;
    samples[index] = envelope * (0.75 * Math.sin(2 * Math.PI * (170 + seed) * time) + 0.25 * noise);
  }
  return samples;
}

function randomEnvelopeSignal(seconds: number, seed: number) {
  const samples = new Float32Array(seconds * SAMPLE_RATE);
  let state = seed >>> 0;
  let envelope = 0;
  for (let index = 0; index < samples.length; index += 1) {
    if (index % 160 === 0) {
      state = (state * 1664525 + 1013904223) >>> 0;
      envelope = 0.01 + 0.45 * (state / 0xffffffff);
    }
    state = (state * 1664525 + 1013904223) >>> 0;
    const noise = (state / 0xffffffff) * 2 - 1;
    samples[index] = envelope * noise;
  }
  return samples;
}

function correlationJob() {
  const source = (assetId: string, sha: string) => ({ assetId, provider: "local" as const, locator: `/retained/${assetId}.wav`, generation: `generation-${assetId}`, sha256: sha.repeat(64), sizeBytes: 320_000, contentType: "audio/wav" });
  return newAudioPairCorrelationJob({
    jobId: "correlation_job_0001",
    projectId: "project_0001",
    episodeProductionId: "episode_production_0001",
    analysisReceiptId: "analysis_receipt_0001",
    activityMomentId: "possible-participant-overlap-100-120",
    programFingerprintSha256: "f".repeat(64),
    activeDecisionReceiptIds: ["decision_receipt_0001"],
    requestedByEmail: "producer@example.com",
    queuedAt: "2026-08-06T15:00:00.000Z",
    reference: {
      role: "reference",
      productionRole: "primary-dialogue",
      participantId: "participant_0001",
      source: source("reference_asset_0001", "a"),
      range: { programStartSeconds: 20, programEndSeconds: 22, sourceStartSeconds: 20, sourceEndSeconds: 22, alignment: "program-clock", alignmentEvidenceJobId: null },
    },
    observation: {
      role: "observation",
      productionRole: "camera-scratch",
      participantId: "participant_0001",
      source: source("observation_asset_0001", "b"),
      range: { programStartSeconds: 20, programEndSeconds: 22, sourceStartSeconds: 19.8, sourceEndSeconds: 21.8, alignment: "qualified-candidate", alignmentEvidenceJobId: "alignment_job_0001" },
    },
  });
}

function pcm16Wav(samples: Float32Array) {
  const dataBytes = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVEfmt ", 8, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataBytes, 40);
  for (let index = 0; index < samples.length; index += 1) buffer.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[index] * 32767))), 44 + index * 2);
  return buffer;
}
