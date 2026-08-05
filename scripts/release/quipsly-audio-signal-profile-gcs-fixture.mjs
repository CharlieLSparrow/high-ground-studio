#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { Storage } from "@google-cloud/storage";

import {
  AUDIO_SIGNAL_PROFILE_CLOUD_QUEUE_KIND,
  buildAudioSignalProfileCloudManifestObjectName,
  buildAudioSignalProfileCloudQueueObjectName,
  buildAudioSignalProfileCloudResultObjectName,
  newAudioSignalProfileCloudManifest,
  newAudioSignalProfileJob,
  parseAudioSignalProfileCloudManifest,
  parseAudioSignalProfileResult,
} from "../../packages/quipsly-media-processing/src/index.ts";
import { FfmpegAudioSignalProfiler } from "../../apps/quipsly-media-processor/src/audio-signal-profile-ffmpeg.ts";
import { processAudioSignalProfileCloudQueueObject } from "../../apps/quipsly-media-processor/src/audio-signal-profile-cloud-worker.ts";
import { GcsCaptureProxyWorkerStorage } from "../../apps/quipsly-media-processor/src/gcs-storage.ts";

const execute = promisify(execFile);
if (process.env.ALLOW_GCS_FIXTURE !== "1") throw new Error("Set ALLOW_GCS_FIXTURE=1 to create one isolated audio-signal-profile GCS fixture.");
const projectId = requiredEnvironment("PROJECT_ID", /^[a-z][a-z0-9-]{4,62}$/);
const bucketName = requiredEnvironment("QUIPSLY_MEDIA_BUCKET", /^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/);
const expectedBuildId = requiredEnvironment("EXPECTED_BUILD_ID", /^[0-9a-f]{40}$/);
const preserve = process.env.PRESERVE === "1";
const suffix = `${utcCompact()}-${randomBytes(6).toString("hex")}`;
const jobId = `audio-signal-gcs-fixture-${suffix}`;
const sourceObjectName = `media-vault/raw/processor-fixtures/${jobId}/source.wav`;
const scratch = await mkdtemp(path.join(tmpdir(), "quipsly-audio-signal-gcs-fixture-"));
const marker = path.join(scratch, ".quipsly-audio-signal-gcs-fixture");
await writeFile(marker, jobId, { mode: 0o600 });

const storageClient = new Storage({ projectId });
const bucket = storageClient.bucket(bucketName);
const workerStorage = new GcsCaptureProxyWorkerStorage(bucketName, storageClient);
const createdObjectNames = [];

try {
  const sourcePath = path.join(scratch, "source.wav");
  await execute("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", "sine=frequency=160:duration=4:sample_rate=48000",
    "-f", "lavfi", "-i", "sine=frequency=4000:duration=4:sample_rate=48000",
    "-filter_complex", "[0:a]volume=0.16[a0];[1:a]volume=0.10[a1];[a0][a1]concat=n=2:v=0:a=1[out]",
    "-map", "[out]", "-c:a", "pcm_s24le", sourcePath,
  ]);
  const sourceBytes = await readFile(sourcePath);
  const sourceSha256 = digest(sourceBytes);
  await bucket.upload(sourcePath, {
    destination: sourceObjectName,
    resumable: false,
    validation: "crc32c",
    metadata: { contentType: "audio/wav", cacheControl: "private, no-store", metadata: { quipslyKind: "audio-signal-gcs-fixture-v1", quipslyFixtureJobId: jobId, quipslyExpectedSha256: sourceSha256 } },
    preconditionOpts: { ifGenerationMatch: 0 },
  });
  createdObjectNames.push(sourceObjectName);
  const sourceEvidence = await objectEvidence(sourceObjectName);
  const source = {
    assetId: `fixture-signal-${suffix}`,
    provider: "gcs",
    locator: `gcs://${bucketName}/${sourceObjectName}?generation=${sourceEvidence.generation}`,
    generation: sourceEvidence.generation,
    sha256: sourceSha256,
    sizeBytes: sourceEvidence.sizeBytes,
    contentType: "audio/wav",
  };
  const queuedAt = new Date().toISOString();
  const job = newAudioSignalProfileJob({ jobId, projectId: `project-${suffix}`, requestedByEmail: "processor-fixture@highgroundodyssey.com", queuedAt, source });
  const manifestObjectName = buildAudioSignalProfileCloudManifestObjectName(jobId);
  const queueObjectName = buildAudioSignalProfileCloudQueueObjectName(jobId);
  const resultObjectName = buildAudioSignalProfileCloudResultObjectName(jobId);
  createdObjectNames.push(manifestObjectName, queueObjectName, resultObjectName);
  const manifestStored = await saveJsonIfAbsent(manifestObjectName, newAudioSignalProfileCloudManifest(job));
  const queueStored = await saveJsonIfAbsent(queueObjectName, { kind: AUDIO_SIGNAL_PROFILE_CLOUD_QUEUE_KIND, version: 1, jobId, manifestObjectName, manifestGeneration: manifestStored.generation, enqueuedAt: queuedAt });
  const options = { executionId: `local-gcs-fixture-${suffix}`, buildId: expectedBuildId, imageDigest: null, leaseDurationMs: 15 * 60 * 1_000, now: () => new Date() };
  const first = await processAudioSignalProfileCloudQueueObject(workerStorage, new FfmpegAudioSignalProfiler(), options, { name: queueObjectName, generation: queueStored.generation });
  assert.equal(first.disposition, "completed");

  const completedStored = await loadJson(manifestObjectName);
  assert.equal(parseAudioSignalProfileCloudManifest(completedStored.value, jobId).status, "completed");
  const resultStored = await loadJson(resultObjectName);
  const result = parseAudioSignalProfileResult(resultStored.value, job);
  assert.equal(result.analyzer.completeDecode, true);
  assert.equal(result.analyzer.frequencyAnalysis.completeDecode, true);
  assert.ok(result.audioSignal.waveform.length > 0 && result.audioSignal.waveform.length <= 1_200);
  assert.equal(result.audioSignal.frequencyProfile.bands.length, 6);
  assert.ok(result.audioSignal.frequencyProfile.windows.length > 0 && result.audioSignal.frequencyProfile.windows.length <= 1_200);
  assert.equal(result.boundaries.analysisDoesNotChangeMedia, true);
  const [sourceReadback] = await bucket.file(sourceObjectName, { generation: source.generation }).download({ validation: "crc32c" });
  assert.equal(digest(sourceReadback), sourceSha256);

  const replayQueue = await saveJsonIfAbsent(queueObjectName, { kind: AUDIO_SIGNAL_PROFILE_CLOUD_QUEUE_KIND, version: 1, jobId, manifestObjectName, manifestGeneration: completedStored.generation, enqueuedAt: queuedAt });
  const second = await processAudioSignalProfileCloudQueueObject(workerStorage, new FfmpegAudioSignalProfiler(), options, { name: queueObjectName, generation: replayQueue.generation });
  assert.equal(second.disposition, "already-complete");
  assert.equal((await loadJson(resultObjectName)).generation, resultStored.generation);

  process.stdout.write(`${JSON.stringify({
    kind: "quipsly-audio-signal-profile-gcs-fixture-report-v1",
    passed: true,
    projectId,
    bucketName,
    jobId,
    buildId: expectedBuildId,
    source: { ...source, unchangedAfterWorker: true },
    profile: { durationSeconds: result.audioSignal.durationSeconds, waveformWindows: result.audioSignal.waveform.length, frequencyWindows: result.audioSignal.frequencyProfile.windows.length, frequencyBands: result.audioSignal.frequencyProfile.bands.map((band) => band.id), completeDecode: true },
    boundaries: result.boundaries,
    replayWasCreateOnceNoOp: true,
    providerRecordingRequired: false,
    preserved: preserve,
    completedAt: new Date().toISOString(),
  }, null, 2)}\n`);
} finally {
  if (!preserve) {
    for (const objectName of [...new Set(createdObjectNames)]) {
      await deleteAllExactNameVersions(objectName);
      assert.equal((await exactNameVersions(objectName)).length, 0, `Fixture cleanup retained ${objectName}.`);
    }
  }
  if ((await readFile(marker, "utf8").catch(() => "")) === jobId) await rm(scratch, { recursive: true, force: true });
}

async function saveJsonIfAbsent(objectName, value) {
  try { await bucket.file(objectName).save(JSON.stringify(value), { resumable: false, validation: "crc32c", contentType: "application/json; charset=utf-8", metadata: { cacheControl: "private, no-store" }, preconditionOpts: { ifGenerationMatch: 0 } }); }
  catch (error) { if (![409, 412].includes(Number(error?.code ?? error?.status))) throw error; }
  return loadJson(objectName);
}
async function loadJson(objectName) { const [metadata] = await bucket.file(objectName).getMetadata(); const generation = requiredGeneration(metadata.generation); const [raw] = await bucket.file(objectName, { generation }).download({ validation: "crc32c" }); return { value: JSON.parse(raw.toString("utf8")), generation }; }
async function objectEvidence(objectName) { const [metadata] = await bucket.file(objectName).getMetadata(); return { generation: requiredGeneration(metadata.generation), sizeBytes: Number(metadata.size), contentType: String(metadata.contentType || "") }; }
async function exactNameVersions(objectName) { const [files] = await bucket.getFiles({ prefix: objectName, versions: true }); return files.filter((file) => file.name === objectName); }
async function deleteAllExactNameVersions(objectName) { for (const file of await exactNameVersions(objectName)) { const [metadata] = await file.getMetadata(); const generation = requiredGeneration(metadata.generation); await bucket.file(objectName, { generation }).delete({ ifGenerationMatch: generation }); } }
function requiredEnvironment(name, pattern) { const value = String(process.env[name] || "").trim(); if (!pattern.test(value)) throw new Error(`${name} is missing or invalid.`); return value; }
function requiredGeneration(value) { const generation = String(value || ""); if (!/^[1-9][0-9]*$/.test(generation)) throw new Error("GCS generation is invalid."); return generation; }
function digest(value) { return createHash("sha256").update(value).digest("hex"); }
function utcCompact() { return new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14); }
