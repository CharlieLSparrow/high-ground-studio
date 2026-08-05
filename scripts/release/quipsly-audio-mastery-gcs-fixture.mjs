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
  AUDIO_MASTERY_CLOUD_QUEUE_KIND,
  buildAudioMasteryCloudManifestObjectName,
  buildAudioMasteryCloudQueueObjectName,
  buildAudioMasteryCloudResultObjectName,
  buildAudioMasteryTargetLocator,
  newAudioMasteryCloudManifest,
  newAudioMasteryJob,
  parseAudioMasteryCloudManifest,
  parseAudioMasteryResult,
} from "../../packages/quipsly-media-processing/src/index.ts";
import { FfmpegAudioMasteringEngine } from "../../apps/quipsly-media-processor/src/audio-mastering-ffmpeg.ts";
import { processAudioMasteryCloudQueueObject } from "../../apps/quipsly-media-processor/src/audio-mastery-cloud-worker.ts";
import { GcsCaptureProxyWorkerStorage } from "../../apps/quipsly-media-processor/src/gcs-storage.ts";

const execute = promisify(execFile);
if (process.env.ALLOW_GCS_FIXTURE !== "1") throw new Error("Set ALLOW_GCS_FIXTURE=1 to create one isolated audio-mastery GCS fixture.");
const projectId = requiredEnvironment("PROJECT_ID", /^[a-z][a-z0-9-]{4,62}$/);
const bucketName = requiredEnvironment("QUIPSLY_MEDIA_BUCKET", /^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/);
const expectedBuildId = requiredEnvironment("EXPECTED_BUILD_ID", /^[0-9a-f]{40}$/);
const preserve = process.env.PRESERVE === "1";
const suffix = `${utcCompact()}-${randomBytes(6).toString("hex")}`;
const jobId = `audio-mastery-gcs-fixture-${suffix}`;
const assetId = `fixture-mastery-${suffix}`;
const sourceObjectName = `media-vault/raw/processor-fixtures/${jobId}/source.wav`;
const scratch = await mkdtemp(path.join(tmpdir(), "quipsly-audio-mastery-gcs-fixture-"));
const marker = path.join(scratch, ".quipsly-audio-mastery-gcs-fixture");
await writeFile(marker, jobId, { mode: 0o600 });

const storageClient = new Storage({ projectId });
const bucket = storageClient.bucket(bucketName);
const workerStorage = new GcsCaptureProxyWorkerStorage(bucketName, storageClient);
const createdObjectNames = [];

try {
  const sourcePath = path.join(scratch, "source.wav");
  await execute("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", "aevalsrc=0.018*sin(2*PI*(170+9*t)*t)+0.006*sin(2*PI*(690+2*t)*t):s=48000:d=12",
    "-c:a", "pcm_s24le", sourcePath,
  ]);
  const sourceBytes = await readFile(sourcePath);
  const sourceSha256 = digest(sourceBytes);
  await bucket.upload(sourcePath, {
    destination: sourceObjectName,
    resumable: false,
    validation: "crc32c",
    metadata: {
      contentType: "audio/wav",
      cacheControl: "private, no-store",
      metadata: { quipslyKind: "audio-mastery-gcs-fixture-v1", quipslyFixtureJobId: jobId, quipslyExpectedSha256: sourceSha256 },
    },
    preconditionOpts: { ifGenerationMatch: 0 },
  });
  createdObjectNames.push(sourceObjectName);
  const sourceEvidence = await objectEvidence(sourceObjectName);
  const source = {
    assetId,
    provider: "gcs",
    locator: gcsLocator(sourceObjectName, sourceEvidence.generation),
    generation: sourceEvidence.generation,
    sha256: sourceSha256,
    sizeBytes: sourceEvidence.sizeBytes,
    contentType: "audio/wav",
  };
  const targetObjectName = buildAudioMasteryTargetLocator({ assetId, sourceSha256, profileId: "apple-podcasts-dialogue-v1" });
  const queuedAt = new Date().toISOString();
  const job = newAudioMasteryJob({
    jobId,
    projectId: `project-${suffix}`,
    requestedByEmail: "processor-fixture@highgroundodyssey.com",
    queuedAt,
    source,
    profileId: "apple-podcasts-dialogue-v1",
    target: { provider: "gcs", locator: targetObjectName, contentType: "audio/wav", codec: "pcm_s24le", sampleRateHz: 48_000, variantKind: "audio-master-preview" },
  });
  const manifestObjectName = buildAudioMasteryCloudManifestObjectName(jobId);
  const queueObjectName = buildAudioMasteryCloudQueueObjectName(jobId);
  const resultObjectName = buildAudioMasteryCloudResultObjectName(jobId);
  createdObjectNames.push(targetObjectName, manifestObjectName, queueObjectName, resultObjectName);
  const manifestStored = await saveJsonIfAbsent(manifestObjectName, newAudioMasteryCloudManifest(job));
  const queueStored = await saveJsonIfAbsent(queueObjectName, {
    kind: AUDIO_MASTERY_CLOUD_QUEUE_KIND,
    version: 1,
    jobId,
    manifestObjectName,
    manifestGeneration: manifestStored.generation,
    enqueuedAt: queuedAt,
  });
  const options = { executionId: `local-gcs-fixture-${suffix}`, buildId: expectedBuildId, imageDigest: null, leaseDurationMs: 15 * 60 * 1_000, now: () => new Date() };
  const first = await processAudioMasteryCloudQueueObject(workerStorage, new FfmpegAudioMasteringEngine(), options, { name: queueObjectName, generation: queueStored.generation });
  assert.equal(first.disposition, "completed");
  assert.equal(first.rendered, true);
  const completedStored = await loadJson(manifestObjectName);
  assert.equal(parseAudioMasteryCloudManifest(completedStored.value, jobId).status, "completed");
  const resultStored = await loadJson(resultObjectName);
  const result = parseAudioMasteryResult(resultStored.value, job);
  assert.equal(result.proposal.action, "render-loudness-master");
  assert.equal(result.derivative.verification.passes, true);
  assert.equal(result.derivative.provider, "gcs");
  assert.equal(result.boundaries.outputIsUnpromotedPreview, true);
  const outputEvidence = await objectEvidence(targetObjectName, result.derivative.generation);
  const [sourceReadback] = await bucket.file(sourceObjectName, { generation: source.generation }).download({ validation: "crc32c" });
  const [outputReadback] = await bucket.file(targetObjectName, { generation: result.derivative.generation }).download({ validation: "crc32c" });
  assert.equal(digest(sourceReadback), sourceSha256);
  assert.equal(digest(outputReadback), result.derivative.sha256);
  assert.equal(outputEvidence.sizeBytes, result.derivative.sizeBytes);

  const replayQueue = await saveJsonIfAbsent(queueObjectName, {
    kind: AUDIO_MASTERY_CLOUD_QUEUE_KIND,
    version: 1,
    jobId,
    manifestObjectName,
    manifestGeneration: completedStored.generation,
    enqueuedAt: queuedAt,
  });
  const second = await processAudioMasteryCloudQueueObject(workerStorage, new FfmpegAudioMasteringEngine(), options, { name: queueObjectName, generation: replayQueue.generation });
  assert.equal(second.disposition, "already-complete");
  assert.equal((await loadJson(resultObjectName)).generation, resultStored.generation);

  process.stdout.write(`${JSON.stringify({
    kind: "quipsly-audio-mastery-gcs-fixture-report-v1",
    passed: true,
    projectId,
    bucketName,
    jobId,
    buildId: expectedBuildId,
    source: { ...source, unchangedAfterWorker: true },
    measurement: { integratedLufs: result.sourceMeasurement.integratedLufs, truePeakDbtp: result.sourceMeasurement.truePeakDbtp, completeDecode: result.sourceMeasurement.analyzer.completeDecode },
    proposal: { action: result.proposal.action, targetIntegratedLufs: result.proposal.profile.integratedLufs, renderTruePeakDbtp: result.proposal.profile.renderTruePeakDbtp },
    derivative: { locator: result.derivative.locator, generation: result.derivative.generation, sha256: result.derivative.sha256, sizeBytes: result.derivative.sizeBytes, integratedLufs: result.derivative.verificationMeasurement.integratedLufs, truePeakDbtp: result.derivative.verificationMeasurement.truePeakDbtp, passes: true },
    boundaries: result.boundaries,
    replayWasCreateOnceNoOp: true,
    preserved: preserve,
    completedAt: new Date().toISOString(),
  }, null, 2)}\n`);
} finally {
  if (!preserve) for (const objectName of [...new Set(createdObjectNames)]) await deleteAllExactNameVersions(objectName);
  if ((await readFile(marker, "utf8").catch(() => "")) === jobId) await rm(scratch, { recursive: true, force: true });
}

async function saveJsonIfAbsent(objectName, value) {
  await bucket.file(objectName).save(JSON.stringify(value), { resumable: false, validation: "crc32c", contentType: "application/json; charset=utf-8", metadata: { cacheControl: "private, no-store" }, preconditionOpts: { ifGenerationMatch: 0 } });
  return loadJson(objectName);
}
async function loadJson(objectName) {
  const [metadata] = await bucket.file(objectName).getMetadata();
  const generation = requiredGeneration(metadata.generation);
  const [raw] = await bucket.file(objectName, { generation }).download({ validation: "crc32c" });
  return { value: JSON.parse(raw.toString("utf8")), generation };
}
async function objectEvidence(objectName, generation) {
  const [metadata] = await bucket.file(objectName, generation ? { generation } : undefined).getMetadata();
  return { generation: requiredGeneration(metadata.generation), sizeBytes: Number(metadata.size), contentType: String(metadata.contentType || "") };
}
async function deleteAllExactNameVersions(objectName) {
  const [files] = await bucket.getFiles({ prefix: objectName, versions: true });
  for (const file of files.filter((candidate) => candidate.name === objectName)) {
    const [metadata] = await file.getMetadata();
    const generation = requiredGeneration(metadata.generation);
    await bucket.file(objectName, { generation }).delete({ ifGenerationMatch: generation });
  }
}
function requiredEnvironment(name, pattern) { const value = String(process.env[name] || "").trim(); if (!pattern.test(value)) throw new Error(`${name} is missing or invalid.`); return value; }
function requiredGeneration(value) { const generation = String(value || ""); if (!/^[1-9][0-9]*$/.test(generation)) throw new Error("GCS generation is invalid."); return generation; }
function gcsLocator(objectName, generation) { return `gcs://${bucketName}/${objectName}?generation=${generation}`; }
function digest(value) { return createHash("sha256").update(value).digest("hex"); }
function utcCompact() { return new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14); }
