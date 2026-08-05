import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import test from "node:test";

import {
  AUDIO_SPECTRAL_CLOUD_QUEUE_KIND,
  AUDIO_SPECTRAL_TILE_BYTES,
  buildAudioSpectralCloudManifestObjectName,
  buildAudioSpectralCloudQueueObjectName,
  buildAudioSpectralCloudResultObjectName,
  newAudioSpectralCloudManifest,
  newAudioSpectralEvidenceJob,
  parseAudioSpectralCloudManifest,
  parseAudioSpectralEvidenceResult,
} from "../packages/quipsly-media-processing/src/audio-spectral-evidence.ts";
import { processAudioSpectralCloudQueueObject } from "../apps/quipsly-media-processor/src/audio-spectral-cloud-worker.ts";

const digest = (value) => createHash("sha256").update(value).digest("hex");
const bucketName = "quipsly-test-bucket";
const sourceBytes = Buffer.from("immutable-cloud-spectral-source");
const source = { assetId: "asset_spectral_cloud", provider: "gcs", locator: `gcs://${bucketName}/media-vault/raw/spectral.wav?generation=101`, generation: "101", sha256: digest(sourceBytes), sizeBytes: sourceBytes.length, contentType: "audio/wav" };
const job = newAudioSpectralEvidenceJob({ jobId: "audio_spectral_cloud123", projectId: "project_spectral_cloud", requestedByEmail: "spectral@example.test", queuedAt: "2026-08-05T15:00:00.000Z", source });

class MemoryStorage {
  objects = new Map();
  media = new Map([["media-vault/raw/spectral.wav@101", { bytes: sourceBytes, contentType: "audio/wav", customMetadata: {} }]]);
  generation = 10;
  put(name, value) { const generation = String(++this.generation); this.objects.set(name, { value, generation }); return generation; }
  async listQueueObjects() { return []; }
  async listQueueObjectsUnder() { return []; }
  async loadJson(name, generation) { const row = this.objects.get(name); if (!row || (generation && row.generation !== generation)) throw Object.assign(new Error("missing"), { code: 404 }); return structuredClone(row); }
  async saveJson(name, value, expected) { const row = this.objects.get(name); if (!row || row.generation !== expected) throw Object.assign(new Error("precondition"), { code: 412 }); this.put(name, value); return this.loadJson(name); }
  async saveJsonIfAbsent(name, value) { if (!this.objects.has(name)) this.put(name, value); return this.loadJson(name); }
  async objectEvidence(name, generation) { const row = this.media.get(`${name}@${generation}`); return row ? { bucketName, objectName: name, generation, sizeBytes: row.bytes.length, contentType: row.contentType, crc32c: null, customMetadata: row.customMetadata } : null; }
  async materializeObject(name, generation, destination) { const row = this.media.get(`${name}@${generation}`); if (!row) throw new Error("missing source"); await writeFile(destination, row.bytes); return { sizeBytes: row.bytes.length, sha256: digest(row.bytes) }; }
  async uploadProxy(sourcePath, objectName, contentType, customMetadata) { const bytes = await readFile(sourcePath); const existing = [...this.media.entries()].find(([key]) => key.startsWith(`${objectName}@`)); if (existing) { const generation = existing[0].slice(objectName.length + 1); return this.objectEvidence(objectName, generation); } const generation = String(++this.generation); this.media.set(`${objectName}@${generation}`, { bytes, contentType, customMetadata }); return this.objectEvidence(objectName, generation); }
  async deleteObject(name, generation) { const row = this.objects.get(name); if (row?.generation === generation) this.objects.delete(name); }
  async writeDeadLetter(name, value) { if (!this.objects.has(name)) this.put(name, value); }
}

function queued(storage) { const manifestName = buildAudioSpectralCloudManifestObjectName(job.jobId); const manifestGeneration = storage.put(manifestName, newAudioSpectralCloudManifest(job)); const queueName = buildAudioSpectralCloudQueueObjectName(job.jobId); const queueGeneration = storage.put(queueName, { kind: AUDIO_SPECTRAL_CLOUD_QUEUE_KIND, version: 1, jobId: job.jobId, manifestObjectName: manifestName, manifestGeneration, enqueuedAt: job.queuedAt }); return { manifestName, queueName, queueGeneration }; }
const options = { executionId: "execution_spectral_cloud", buildId: "cloud-test-build", imageDigest: "sha256:test", leaseDurationMs: 60_000, now: () => new Date("2026-08-05T15:00:02.000Z") };

test("cloud spectral worker stores and independently verifies an immutable generation-bound tile pack", async () => {
  const storage = new MemoryStorage();
  const control = queued(storage);
  const analyzer = { analyze: async (_sourcePath, outputPath) => {
    const bytes = Buffer.alloc(3 * AUDIO_SPECTRAL_TILE_BYTES, 17);
    await writeFile(outputPath, bytes);
    const sha256 = digest(bytes);
    return { media: { sampleRate: 48_000, channelCount: 1, durationSeconds: 5, minimumFrequencyHz: 20, maximumFrequencyHz: 22_800 }, pyramid: { algorithm: "quipsly-log-stft-tile-pyramid-v1", pixelFormat: "gray8-ffmpeg-intensity-v1", tileWidth: 512, tileHeight: 192, tileByteLength: AUDIO_SPECTRAL_TILE_BYTES, frequencyScale: "logarithmic", frequencyOrientation: "high-to-low", magnitudeScale: "logarithmic-dbfs", dynamicRangeDb: 120, upperLimitDbfs: 0, levels: [{ id: "overview", tileSpanSeconds: 300, tileCount: 1, byteOffset: 0 }, { id: "browse", tileSpanSeconds: 30, tileCount: 1, byteOffset: AUDIO_SPECTRAL_TILE_BYTES }, { id: "detail", tileSpanSeconds: 5, tileCount: 1, byteOffset: 2 * AUDIO_SPECTRAL_TILE_BYTES }], pack: { provider: "local", locator: outputPath, sha256, sizeBytes: bytes.length, generation: `sha256:${sha256}`, contentType: "application/vnd.quipsly.spectral-tile-pack" } }, ffmpegVersion: "ffmpeg fixture", detailFrameCount: 1 };
  } };
  const result = await processAudioSpectralCloudQueueObject(storage, analyzer, options, { name: control.queueName, generation: control.queueGeneration });
  assert.deepEqual(result, { disposition: "completed", jobId: job.jobId, tileCount: 3, packSizeBytes: 3 * AUDIO_SPECTRAL_TILE_BYTES });
  assert.equal(parseAudioSpectralCloudManifest((await storage.loadJson(control.manifestName)).value, job.jobId).status, "completed");
  const receipt = parseAudioSpectralEvidenceResult((await storage.loadJson(buildAudioSpectralCloudResultObjectName(job.jobId))).value, job);
  assert.equal(receipt.pyramid.pack.provider, "gcs");
  assert.match(receipt.pyramid.pack.locator, /\?generation=[1-9][0-9]*$/);
  assert.equal(receipt.boundaries.visualEvidenceIsNotAnEqDecision, true);
  assert.equal(storage.objects.has(control.queueName), false);
});

test("cloud spectral worker fails closed when its immutable source generation disappears", async () => {
  const storage = new MemoryStorage();
  storage.media.clear();
  const control = queued(storage);
  const result = await processAudioSpectralCloudQueueObject(storage, {}, options, { name: control.queueName, generation: control.queueGeneration });
  assert.deepEqual(result, { disposition: "terminal", jobId: job.jobId, code: "audio-spectral-source-generation-mismatch" });
});
