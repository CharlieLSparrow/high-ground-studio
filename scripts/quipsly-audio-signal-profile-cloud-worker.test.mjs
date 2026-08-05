import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import test from "node:test";

import {
  AUDIO_SIGNAL_PROFILE_CLOUD_QUEUE_KIND,
  buildAudioSignalProfileCloudManifestObjectName,
  buildAudioSignalProfileCloudQueueObjectName,
  buildAudioSignalProfileCloudResultObjectName,
  newAudioSignalProfileCloudManifest,
  newAudioSignalProfileJob,
  parseAudioSignalProfileCloudManifest,
  parseAudioSignalProfileResult,
} from "../packages/quipsly-media-processing/src/audio-signal-profile.ts";
import { processAudioSignalProfileCloudQueueObject } from "../apps/quipsly-media-processor/src/audio-signal-profile-cloud-worker.ts";

const digest = (value) => createHash("sha256").update(value).digest("hex");
const bucketName = "quipsly-test-bucket";
const sourceBytes = Buffer.from("immutable-cloud-signal-source");
const source = {
  assetId: "asset_signal_cloud",
  provider: "gcs",
  locator: `gcs://${bucketName}/media-vault/raw/signal.wav?generation=101`,
  generation: "101",
  sha256: digest(sourceBytes),
  sizeBytes: sourceBytes.length,
  contentType: "audio/wav",
};
const job = newAudioSignalProfileJob({
  jobId: "audio_signal_cloud123",
  projectId: "project_signal_cloud",
  requestedByEmail: "signal@example.test",
  queuedAt: "2026-08-05T14:00:00.000Z",
  source,
});

function profile() {
  return {
    schemaVersion: 1,
    algorithm: "quipsly-audio-signal-window-v1",
    sampleRate: 48_000,
    channelCount: 1,
    analyzedFrameCount: 48_000,
    durationSeconds: 1,
    windowDurationSeconds: 0.5,
    rmsDbfs: -18,
    samplePeakDbfs: -3,
    clippedFrameCount: 0,
    clippedFrameFraction: 0,
    nearSilentFrameFraction: 0,
    leftRmsDbfs: -18,
    rightRmsDbfs: null,
    stereoBalanceDb: null,
    signalStatus: "signal-present",
    thresholds: { clippingAmplitude: 0.999, nearSilenceDbfs: -72, possibleDropoutMinimumSeconds: 0.25, surroundingSignalDbfs: -45, stereoImbalanceDb: 12 },
    waveform: [
      { startSeconds: 0, durationSeconds: 0.5, rmsDbfs: -18, samplePeakDbfs: -3, clippedFrameCount: 0 },
      { startSeconds: 0.5, durationSeconds: 0.5, rmsDbfs: -19, samplePeakDbfs: -4, clippedFrameCount: 0 },
    ],
    frequencyProfile: {
      algorithm: "quipsly-audio-broad-band-rms-v1",
      completeDecode: true,
      downmixPolicy: "ffmpeg-default-mono-v1",
      windowDurationSeconds: 0.5,
      analyzedFrameCount: 48_000,
      bands: [{ id: "speech", label: "Speech", minimumHz: 500, maximumHz: 2_000 }],
      overallBandRmsDbfs: [-20],
      windows: [
        { startSeconds: 0, durationSeconds: 0.5, bandRmsDbfs: [-19] },
        { startSeconds: 0.5, durationSeconds: 0.5, bandRmsDbfs: [-21] },
      ],
      boundaries: { broadBandsAreNotARepairSpectrogram: true, measurementsAreNotEqDecisions: true, stereoIsDownmixedForFrequencyOverview: true },
    },
    observations: [],
  };
}

class MemoryStorage {
  objects = new Map();
  media = new Map([["media-vault/raw/signal.wav@101", { bytes: sourceBytes, contentType: "audio/wav" }]]);
  generation = 10;
  put(name, value) { const generation = String(++this.generation); this.objects.set(name, { value, generation }); return generation; }
  async listQueueObjects() { return []; }
  async listQueueObjectsUnder() { return []; }
  async loadJson(name, generation) { const row = this.objects.get(name); if (!row || (generation && row.generation !== generation)) throw Object.assign(new Error("missing"), { code: 404 }); return structuredClone(row); }
  async saveJson(name, value, expected) { const row = this.objects.get(name); if (!row || row.generation !== expected) throw Object.assign(new Error("precondition"), { code: 412 }); this.put(name, value); return this.loadJson(name); }
  async saveJsonIfAbsent(name, value) { if (!this.objects.has(name)) this.put(name, value); return this.loadJson(name); }
  async objectEvidence(name, generation) { const row = this.media.get(`${name}@${generation}`); return row ? { bucketName, objectName: name, generation, sizeBytes: row.bytes.length, contentType: row.contentType, crc32c: null, customMetadata: {} } : null; }
  async materializeObject(name, generation, destination) { const row = this.media.get(`${name}@${generation}`); if (!row) throw new Error("missing source"); await writeFile(destination, row.bytes); return { sizeBytes: row.bytes.length, sha256: digest(row.bytes) }; }
  async uploadProxy() { throw new Error("not used"); }
  async deleteObject(name, generation) { const row = this.objects.get(name); if (row?.generation === generation) this.objects.delete(name); }
  async writeDeadLetter(name, value) { if (!this.objects.has(name)) this.put(name, value); }
}

function queued(storage) {
  const manifestName = buildAudioSignalProfileCloudManifestObjectName(job.jobId);
  const manifestGeneration = storage.put(manifestName, newAudioSignalProfileCloudManifest(job));
  const queueName = buildAudioSignalProfileCloudQueueObjectName(job.jobId);
  const queueGeneration = storage.put(queueName, { kind: AUDIO_SIGNAL_PROFILE_CLOUD_QUEUE_KIND, version: 1, jobId: job.jobId, manifestObjectName: manifestName, manifestGeneration, enqueuedAt: job.queuedAt });
  return { manifestName, queueName, queueGeneration };
}

const options = { executionId: "execution_signal_cloud", buildId: "cloud-test-build", imageDigest: "sha256:test", leaseDurationMs: 60_000, now: () => new Date("2026-08-05T14:00:02.000Z") };

test("cloud signal worker binds complete waveform and frequency evidence to one immutable generation", async () => {
  const storage = new MemoryStorage();
  const control = queued(storage);
  const result = await processAudioSignalProfileCloudQueueObject(storage, { analyze: async () => ({ media: { container: "wav", codec: "pcm_s24le", sampleRate: 48_000, channelCount: 1, durationSeconds: 1 }, audioSignal: profile(), ffmpegVersion: "ffmpeg fixture" }) }, options, { name: control.queueName, generation: control.queueGeneration });
  assert.deepEqual(result, { disposition: "completed", jobId: job.jobId, windowCount: 2 });
  assert.equal(parseAudioSignalProfileCloudManifest((await storage.loadJson(control.manifestName)).value, job.jobId).status, "completed");
  const receipt = parseAudioSignalProfileResult((await storage.loadJson(buildAudioSignalProfileCloudResultObjectName(job.jobId))).value, job);
  assert.equal(receipt.source.sha256, source.sha256);
  assert.equal(receipt.audioSignal.frequencyProfile.completeDecode, true);
  assert.equal(receipt.boundaries.analysisDoesNotChangeMedia, true);
  assert.equal(storage.objects.has(control.queueName), false);
});

test("cloud signal worker fails closed when its immutable generation disappears", async () => {
  const storage = new MemoryStorage();
  storage.media.clear();
  const control = queued(storage);
  const result = await processAudioSignalProfileCloudQueueObject(storage, {}, options, { name: control.queueName, generation: control.queueGeneration });
  assert.deepEqual(result, { disposition: "terminal", jobId: job.jobId, code: "audio-signal-source-generation-mismatch" });
});
