import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import test from "node:test";

import {
  AUDIO_ALIGNMENT_CLOUD_QUEUE_KIND,
  buildAudioAlignmentCloudManifestObjectName,
  buildAudioAlignmentCloudQueueObjectName,
  buildAudioAlignmentCloudResultObjectName,
  newAudioAlignmentCloudManifest,
  newAudioAlignmentJob,
  parseAudioAlignmentCloudManifest,
  parseAudioAlignmentResult,
} from "../packages/quipsly-media-processing/src/audio-alignment-job.ts";
import { parseAudioAlignmentEvidence } from "../packages/quipsly-media-processing/src/audio-alignment-evidence.ts";
import { processAudioAlignmentCloudQueueObject } from "../apps/quipsly-media-processor/src/audio-alignment-cloud-worker.ts";

const digest = (value) => createHash("sha256").update(value).digest("hex");
const bucketName = "quipsly-test-bucket";
const spineBytes = Buffer.from("spine-source-bytes");
const targetBytes = Buffer.from("target-source-bytes");
const source = (assetId, objectName, generation, bytes) => ({
  assetId,
  provider: "gcs",
  locator: `gcs://${bucketName}/${objectName}?generation=${generation}`,
  generation,
  sha256: digest(bytes),
  sizeBytes: bytes.length,
  contentType: "audio/wav",
});
const job = newAudioAlignmentJob({
  jobId: "audio_alignment_cloud123",
  projectId: "project_cloud123",
  projectSlug: "high-ground-odyssey",
  episodeProductionId: "production_cloud123",
  episodeSlug: "episode-9",
  requestedByUserId: null,
  requestedByEmail: "cloud@example.test",
  queuedAt: "2026-08-05T12:00:00.000Z",
  spine: source("asset_spine_cloud", "media-vault/raw/spine.wav", "101", spineBytes),
  target: source("asset_target_cloud", "media-vault/raw/target.wav", "202", targetBytes),
  proposal: {
    initialOffsetSeconds: 0.35,
    openingTargetSeconds: 10,
    laterTargetSeconds: 70,
    windowSeconds: 6,
    searchRadiusSeconds: 1,
    sampleRate: 12_000,
    minimumCorrelation: 0.78,
    minimumPeakMargin: 0.04,
  },
});

function alignmentEvidence() {
  return parseAudioAlignmentEvidence({
    kind: "quipsly-audio-alignment-evidence-v1",
    createdAt: "2026-08-05T12:00:01.000Z",
    spine: job.spine,
    target: job.target,
    analyzer: { algorithm: "normalized-fft-cross-correlation-v1", sampleRate: 12_000, windowSeconds: 6, searchRadiusSeconds: 1, ffmpegVersion: "ffmpeg cloud test" },
    opening: { targetStartSeconds: 10, expectedSpineStartSeconds: 10.35, measuredSpineStartSeconds: 10.351, measuredOffsetSeconds: 0.351, normalizedCorrelation: 0.97, secondBestCorrelation: 0.2, peakMargin: 0.77 },
    later: { targetStartSeconds: 70, expectedSpineStartSeconds: 70.35, measuredSpineStartSeconds: 70.352, measuredOffsetSeconds: 0.352, normalizedCorrelation: 0.96, secondBestCorrelation: 0.18, peakMargin: 0.78 },
    drift: { observationIntervalSeconds: 60, residualDriftMilliseconds: 1, observedPartsPerMillion: 16.666667 },
    qualification: { minimumCorrelation: 0.78, minimumPeakMargin: 0.04, qualifiedForAuthorizedAgentReview: true, reason: "Cloud fixture has two distinct exact-source peaks." },
    boundaries: { sampleAccurateClaimed: false, sourceBytesMutated: false, timelinePlacementApplied: false, personOrDelegatedApprovalStillRequired: true },
  });
}

class MemoryStorage {
  objects = new Map();
  sourceEvidence = new Map([
    ["media-vault/raw/spine.wav@101", { bytes: spineBytes, contentType: "audio/wav" }],
    ["media-vault/raw/target.wav@202", { bytes: targetBytes, contentType: "audio/wav" }],
  ]);
  generation = 10;
  put(name, value) { const generation = String(++this.generation); this.objects.set(name, { value, generation }); return generation; }
  async listQueueObjects() { return []; }
  async listQueueObjectsUnder() { return []; }
  async loadJson(name, generation) { const row = this.objects.get(name); if (!row || (generation && row.generation !== generation)) throw Object.assign(new Error("missing"), { code: 404 }); return structuredClone(row); }
  async saveJson(name, value, ifGenerationMatch) { const current = this.objects.get(name); if (!current || current.generation !== ifGenerationMatch) throw Object.assign(new Error("precondition"), { code: 412 }); this.put(name, value); return this.loadJson(name); }
  async saveJsonIfAbsent(name, value) { if (!this.objects.has(name)) this.put(name, value); return this.loadJson(name); }
  async objectEvidence(name, generation) { const row = this.sourceEvidence.get(`${name}@${generation}`); return row ? { bucketName, objectName: name, generation, sizeBytes: row.bytes.length, contentType: row.contentType, crc32c: null, customMetadata: {} } : null; }
  async materializeObject(name, generation, destination) { const row = this.sourceEvidence.get(`${name}@${generation}`); if (!row) throw new Error("source missing"); await writeFile(destination, row.bytes); return { sizeBytes: row.bytes.length, sha256: digest(row.bytes) }; }
  async uploadProxy() { throw new Error("not used"); }
  async deleteObject(name, generation) { const row = this.objects.get(name); if (row?.generation === generation) this.objects.delete(name); }
  async writeDeadLetter(name, value) { if (!this.objects.has(name)) this.put(name, value); }
}

function queued(storage) {
  const manifestName = buildAudioAlignmentCloudManifestObjectName(job.jobId);
  const manifestGeneration = storage.put(manifestName, newAudioAlignmentCloudManifest(job));
  const queueName = buildAudioAlignmentCloudQueueObjectName(job.jobId);
  const queueGeneration = storage.put(queueName, {
    kind: AUDIO_ALIGNMENT_CLOUD_QUEUE_KIND,
    version: 1,
    jobId: job.jobId,
    manifestObjectName: manifestName,
    manifestGeneration,
    enqueuedAt: job.queuedAt,
  });
  return { manifestName, queueName, queueGeneration };
}

test("cloud worker materializes two generations and commits evidence without media output", async () => {
  const storage = new MemoryStorage();
  const control = queued(storage);
  const result = await processAudioAlignmentCloudQueueObject(storage, { analyze: async () => alignmentEvidence() }, {
    executionId: "execution_cloud123",
    buildId: "cloud-test-build",
    imageDigest: "sha256:test",
    leaseDurationMs: 60_000,
    now: () => new Date("2026-08-05T12:00:02.000Z"),
  }, { name: control.queueName, generation: control.queueGeneration });
  assert.deepEqual(result, { disposition: "completed", jobId: job.jobId, qualified: true });
  const manifest = parseAudioAlignmentCloudManifest((await storage.loadJson(control.manifestName)).value, job.jobId);
  assert.equal(manifest.status, "completed");
  const receipt = parseAudioAlignmentResult((await storage.loadJson(buildAudioAlignmentCloudResultObjectName(job.jobId))).value, job);
  assert.equal(receipt.boundaries.placementApplied, false);
  assert.equal(storage.objects.has(control.queueName), false);
});

test("cloud worker fails closed when a generation-bound source no longer exists", async () => {
  const storage = new MemoryStorage();
  storage.sourceEvidence.delete("media-vault/raw/target.wav@202");
  const control = queued(storage);
  const result = await processAudioAlignmentCloudQueueObject(storage, { analyze: async () => { throw new Error("must not analyze"); } }, {
    executionId: "execution_cloud456",
    buildId: "cloud-test-build",
    imageDigest: null,
    leaseDurationMs: 60_000,
    now: () => new Date("2026-08-05T12:00:02.000Z"),
  }, { name: control.queueName, generation: control.queueGeneration });
  assert.deepEqual(result, { disposition: "terminal", jobId: job.jobId, code: "audio-alignment-source-generation-mismatch" });
  const manifest = parseAudioAlignmentCloudManifest((await storage.loadJson(control.manifestName)).value, job.jobId);
  assert.equal(manifest.status, "failed-terminal");
});
