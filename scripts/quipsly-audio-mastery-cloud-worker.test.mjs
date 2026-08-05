import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import test from "node:test";

import {
  AUDIO_MASTERY_CLOUD_QUEUE_KIND,
  buildAudioMasteryCloudManifestObjectName,
  buildAudioMasteryCloudQueueObjectName,
  buildAudioMasteryCloudResultObjectName,
  buildAudioMasteryTargetLocator,
  newAudioMasteryCloudManifest,
  newAudioMasteryJob,
  parseAudioMasteryCloudManifest,
  parseAudioMasteryResult,
} from "../packages/quipsly-media-processing/src/audio-mastery.ts";
import { processAudioMasteryCloudQueueObject } from "../apps/quipsly-media-processor/src/audio-mastery-cloud-worker.ts";

const digest = (value) => createHash("sha256").update(value).digest("hex");
const bucketName = "quipsly-test-bucket";
const sourceBytes = Buffer.from("cloud-source-audio");
const outputBytes = Buffer.from("verified-master-preview");
const sourceBinding = {
  assetId: "asset_mastery_cloud",
  provider: "gcs",
  locator: `gcs://${bucketName}/media-vault/raw/mastery.wav?generation=101`,
  generation: "101",
  sha256: digest(sourceBytes),
  sizeBytes: sourceBytes.length,
  contentType: "audio/wav",
};
const job = newAudioMasteryJob({
  jobId: "audio_mastery_cloud123",
  projectId: "project_mastery_cloud",
  requestedByEmail: "mastery@example.test",
  queuedAt: "2026-08-05T13:00:00.000Z",
  source: sourceBinding,
  profileId: "apple-podcasts-dialogue-v1",
  target: {
    provider: "gcs",
    locator: buildAudioMasteryTargetLocator({ assetId: sourceBinding.assetId, sourceSha256: sourceBinding.sha256, profileId: "apple-podcasts-dialogue-v1" }),
    contentType: "audio/wav",
    codec: "pcm_s24le",
    sampleRateHz: 48_000,
    variantKind: "audio-master-preview",
  },
});

function measurement(source, measuredAt, lufs, peak) {
  return {
    kind: "quipsly-audio-measurement-v1",
    version: 1,
    measurementId: `measurement_${digest(`${source.sha256}:${lufs}`).slice(0, 24)}`,
    measuredAt,
    source,
    profileId: "apple-podcasts-dialogue-v1",
    durationSeconds: 12,
    channels: 1,
    sampleRateHz: 48_000,
    integratedLufs: lufs,
    truePeakDbtp: peak,
    loudnessRangeLu: 4,
    thresholdLufs: lufs - 10,
    targetOffsetLu: -16 - lufs,
    seriesResolutionMs: 1_000,
    series: [{ timeMs: 1_000, momentaryLufs: lufs, shortTermLufs: lufs, integratedLufs: lufs, truePeakDbtp: peak }],
    analyzer: { name: "ffmpeg-loudnorm-ebur128", version: "ffmpeg cloud fixture", standard: "ITU-R BS.1770 / EBU R128", completeDecode: true },
  };
}

class MemoryStorage {
  objects = new Map();
  media = new Map([["media-vault/raw/mastery.wav@101", { bytes: sourceBytes, contentType: "audio/wav", customMetadata: {} }]]);
  generation = 10;
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
  const manifestName = buildAudioMasteryCloudManifestObjectName(job.jobId);
  const manifestGeneration = storage.put(manifestName, newAudioMasteryCloudManifest(job));
  const queueName = buildAudioMasteryCloudQueueObjectName(job.jobId);
  const queueGeneration = storage.put(queueName, {
    kind: AUDIO_MASTERY_CLOUD_QUEUE_KIND,
    version: 1,
    jobId: job.jobId,
    manifestObjectName: manifestName,
    manifestGeneration,
    enqueuedAt: job.queuedAt,
  });
  return { manifestName, queueName, queueGeneration };
}

test("cloud mastery worker renders, independently verifies, and retains an unpromoted preview", async () => {
  const storage = new MemoryStorage();
  const control = queued(storage);
  const engine = {
    measure: async (_path, input) => measurement(input.source, input.measuredAt, input.source.sha256 === sourceBinding.sha256 ? -24 : -16, -2),
    diagnose: async () => null,
    renderLoudnessMaster: async (_source, outputPath) => {
      await writeFile(outputPath, outputBytes);
      return { outputPath, sizeBytes: outputBytes.length, sha256: digest(outputBytes), contentType: "audio/wav", sampleRateHz: 48_000, codec: "pcm_s24le", originalRemainsSourceTruth: true };
    },
  };
  const result = await processAudioMasteryCloudQueueObject(storage, engine, {
    executionId: "execution_mastery_cloud",
    buildId: "cloud-test-build",
    imageDigest: "sha256:test",
    leaseDurationMs: 60_000,
    now: () => new Date("2026-08-05T13:00:02.000Z"),
  }, { name: control.queueName, generation: control.queueGeneration });
  assert.equal(result.disposition, "completed");
  assert.equal(result.rendered, true);
  const manifest = parseAudioMasteryCloudManifest((await storage.loadJson(control.manifestName)).value, job.jobId);
  assert.equal(manifest.status, "completed");
  const receipt = parseAudioMasteryResult((await storage.loadJson(buildAudioMasteryCloudResultObjectName(job.jobId))).value, job);
  assert.equal(receipt.derivative.provider, "gcs");
  assert.equal(receipt.derivative.verification.passes, true);
  assert.equal(receipt.boundaries.outputIsUnpromotedPreview, true);
  assert.equal(storage.objects.has(control.queueName), false);
});

test("cloud mastery worker fails closed when its immutable source generation disappears", async () => {
  const storage = new MemoryStorage();
  storage.media.clear();
  const control = queued(storage);
  const result = await processAudioMasteryCloudQueueObject(storage, {}, {
    executionId: "execution_mastery_missing",
    buildId: "cloud-test-build",
    imageDigest: null,
    leaseDurationMs: 60_000,
    now: () => new Date("2026-08-05T13:00:02.000Z"),
  }, { name: control.queueName, generation: control.queueGeneration });
  assert.deepEqual(result, { disposition: "terminal", jobId: job.jobId, code: "audio-mastery-source-generation-mismatch" });
});
