import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import test from "node:test";

import {
  AUDIO_TREATMENT_CLOUD_QUEUE_KIND,
  buildAudioTreatmentCloudManifestObjectName,
  buildAudioTreatmentCloudQueueObjectName,
  buildAudioTreatmentCloudResultObjectName,
  buildAudioTreatmentTargetLocator,
  newAudioTreatmentCloudManifest,
  newAudioTreatmentJob,
  parseAudioTreatmentCloudManifest,
  parseAudioTreatmentResult,
} from "../packages/quipsly-media-processing/src/audio-treatment.ts";
import { processAudioTreatmentCloudQueueObject } from "../apps/quipsly-media-processor/src/audio-treatment-cloud-worker.ts";

const digest = (value) => createHash("sha256").update(value).digest("hex");
const bucketName = "quipsly-test-bucket";
const sourceBytes = Buffer.from("cloud-treatment-source-audio");
const outputBytes = Buffer.from("verified-treatment-preview");
const source = {
  assetId: "asset_treatment_cloud",
  provider: "gcs",
  locator: `gcs://${bucketName}/media-vault/raw/treatment.wav?generation=301`,
  generation: "301",
  sha256: digest(sourceBytes),
  sizeBytes: sourceBytes.length,
  contentType: "audio/wav",
};
const job = newAudioTreatmentJob({
  jobId: "audio_treatment_cloud123",
  projectId: "project_treatment_cloud",
  requestedByEmail: "engineer@example.test",
  queuedAt: "2026-08-25T15:00:00.000Z",
  source,
  triggerDiagnosisId: "diagnosis_treatment_cloud",
  profileId: "dc-rumble-correction-v1",
  target: { provider: "gcs", locator: buildAudioTreatmentTargetLocator({ assetId: source.assetId, sourceSha256: source.sha256, profileId: "dc-rumble-correction-v1" }), contentType: "audio/wav", codec: "pcm_s24le", sampleRateHz: 48_000, variantKind: "audio-treatment-preview" },
});

function measurement(binding, measuredAt) {
  return { kind: "quipsly-audio-measurement-v1", version: 1, measurementId: `measurement_${digest(`${binding.sha256}:${measuredAt}`).slice(0, 24)}`, measuredAt, source: binding, profileId: "apple-podcasts-dialogue-v1", durationSeconds: 12, channels: 1, sampleRateHz: 48_000, integratedLufs: -18, truePeakDbtp: -2, loudnessRangeLu: 4, thresholdLufs: -28, targetOffsetLu: 2, seriesResolutionMs: 1_000, series: [{ timeMs: 1_000, momentaryLufs: -18, shortTermLufs: -18, integratedLufs: -18, truePeakDbtp: -2 }], analyzer: { name: "ffmpeg-loudnorm-ebur128", version: "ffmpeg cloud fixture", standard: "ITU-R BS.1770 / EBU R128", completeDecode: true } };
}
function diagnosis(binding, analyzedAt, dcOffset) {
  const statistics = (channel) => ({ channel, dcOffset, peakDbfs: -2, rmsDbfs: -18, rmsPeakDbfs: -16, rmsTroughDbfs: -22, crestFactor: 4, flatFactor: 0, peakCount: 1, noiseFloorDbfs: -60, dynamicRangeDb: 20, zeroCrossingRate: 0.1, nanCount: 0, infCount: 0, denormalCount: 0 });
  return { kind: "quipsly-audio-signal-diagnosis-v1", version: 1, diagnosisId: binding.sha256 === source.sha256 ? job.triggerDiagnosisId : `diagnosis_${digest(binding.sha256).slice(0, 24)}`, analyzedAt, source: binding, durationSeconds: 12, sampleRateHz: 48_000, channelCount: 1, overall: statistics(null), channels: [statistics(1)], nearSilenceSpans: [], observations: [], thresholds: { nearFullScaleDbfs: -0.05, nearSilenceDbfs: -55, nearSilenceMinimumSeconds: 0.25, dcOffsetAmplitude: 0.01, channelImbalanceDb: 6 }, analyzer: { name: "ffmpeg-astats-silencedetect", version: "ffmpeg cloud fixture", completeDecode: true, statisticsAreNotListeningJudgments: true, nearSilenceIsNotAutomaticallyADropout: true, noiseFloorIsAnEstimate: true } };
}

class MemoryStorage {
  objects = new Map();
  media = new Map([["media-vault/raw/treatment.wav@301", { bytes: sourceBytes, contentType: "audio/wav", customMetadata: {} }]]);
  generation = 30;
  put(name, value) { const generation = String(++this.generation); this.objects.set(name, { value, generation }); return generation; }
  async listQueueObjects() { return []; }
  async listQueueObjectsUnder() { return []; }
  async loadJson(name, generation) { const row = this.objects.get(name); if (!row || (generation && row.generation !== generation)) throw Object.assign(new Error("missing"), { code: 404 }); return structuredClone(row); }
  async saveJson(name, value, expected) { const row = this.objects.get(name); if (!row || row.generation !== expected) throw Object.assign(new Error("precondition"), { code: 412 }); this.put(name, value); return this.loadJson(name); }
  async saveJsonIfAbsent(name, value) { if (!this.objects.has(name)) this.put(name, value); return this.loadJson(name); }
  async objectEvidence(name, generation) { const row = this.media.get(`${name}@${generation}`); return row ? { bucketName, objectName: name, generation, sizeBytes: row.bytes.length, contentType: row.contentType, crc32c: "fixture-crc", customMetadata: row.customMetadata } : null; }
  async materializeObject(name, generation, destination) { const row = this.media.get(`${name}@${generation}`); if (!row) throw new Error("missing source"); await writeFile(destination, row.bytes); return { sizeBytes: row.bytes.length, sha256: digest(row.bytes) }; }
  async uploadProxy(sourcePath, objectName, contentType, customMetadata) { const bytes = await readFile(sourcePath); const generation = String(++this.generation); this.media.set(`${objectName}@${generation}`, { bytes, contentType, customMetadata }); return { bucketName, objectName, generation, sizeBytes: bytes.length, contentType, crc32c: "fixture-crc", customMetadata }; }
  async deleteObject(name, generation) { const row = this.objects.get(name); if (row?.generation === generation) this.objects.delete(name); }
  async writeDeadLetter(name, value) { if (!this.objects.has(name)) this.put(name, value); }
}
function queued(storage) {
  const manifestName = buildAudioTreatmentCloudManifestObjectName(job.jobId);
  const manifestGeneration = storage.put(manifestName, newAudioTreatmentCloudManifest(job));
  const queueName = buildAudioTreatmentCloudQueueObjectName(job.jobId);
  const queueGeneration = storage.put(queueName, { kind: AUDIO_TREATMENT_CLOUD_QUEUE_KIND, version: 1, jobId: job.jobId, manifestObjectName: manifestName, manifestGeneration, enqueuedAt: job.queuedAt });
  return { manifestName, queueName, queueGeneration };
}

test("cloud audio treatment renders and independently verifies an unpromoted exact-generation preview", async () => {
  const storage = new MemoryStorage();
  const control = queued(storage);
  const engine = {
    measure: async (_path, input) => measurement(input.source, input.measuredAt),
    diagnose: async (_path, input) => diagnosis(input.source, input.analyzedAt, input.source.sha256 === source.sha256 ? 0.02 : 0.001),
    renderTreatmentExperiment: async (_sourcePath, outputPath) => { await writeFile(outputPath, outputBytes); return { outputPath, sizeBytes: outputBytes.length, sha256: digest(outputBytes), contentType: "audio/wav", sampleRateHz: 48_000, codec: "pcm_s24le", originalRemainsSourceTruth: true, outputIsUnpromotedExperiment: true }; },
  };
  const result = await processAudioTreatmentCloudQueueObject(storage, engine, { executionId: "execution_treatment_cloud", buildId: "cloud-test-build", imageDigest: "sha256:test", leaseDurationMs: 60_000, now: () => new Date("2026-08-25T15:00:02.000Z") }, { name: control.queueName, generation: control.queueGeneration });
  assert.equal(result.disposition, "completed");
  const manifest = parseAudioTreatmentCloudManifest((await storage.loadJson(control.manifestName)).value, job.jobId);
  assert.equal(manifest.status, "completed");
  const receipt = parseAudioTreatmentResult((await storage.loadJson(buildAudioTreatmentCloudResultObjectName(job.jobId))).value, job);
  assert.equal(receipt.derivative.provider, "gcs");
  assert.equal(receipt.verification.passes, true);
  assert.equal(receipt.boundaries.outputIsUnpromotedExperiment, true);
  assert.equal(storage.objects.has(control.queueName), false);
});

test("cloud audio treatment fails closed when its immutable source generation disappears", async () => {
  const storage = new MemoryStorage();
  storage.media.clear();
  const control = queued(storage);
  const result = await processAudioTreatmentCloudQueueObject(storage, {}, { executionId: "execution_treatment_missing", buildId: "cloud-test-build", imageDigest: null, leaseDurationMs: 60_000, now: () => new Date("2026-08-25T15:00:02.000Z") }, { name: control.queueName, generation: control.queueGeneration });
  assert.deepEqual(result, { disposition: "terminal", jobId: job.jobId, code: "audio-treatment-source-generation-mismatch" });
});
