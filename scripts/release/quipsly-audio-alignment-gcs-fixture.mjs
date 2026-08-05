#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { Storage } from "@google-cloud/storage";

import {
  AUDIO_ALIGNMENT_CLOUD_QUEUE_KIND,
  buildAudioAlignmentCloudManifestObjectName,
  buildAudioAlignmentCloudQueueObjectName,
  buildAudioAlignmentCloudResultObjectName,
  newAudioAlignmentCloudManifest,
  newAudioAlignmentJob,
  parseAudioAlignmentCloudManifest,
  parseAudioAlignmentResult,
} from "../../packages/quipsly-media-processing/src/index.ts";
import { FfmpegAudioAlignmentAnalyzer } from "../../apps/quipsly-media-processor/src/audio-alignment-ffmpeg.ts";
import { processAudioAlignmentCloudQueueObject } from "../../apps/quipsly-media-processor/src/audio-alignment-cloud-worker.ts";
import { GcsCaptureProxyWorkerStorage } from "../../apps/quipsly-media-processor/src/gcs-storage.ts";

const execute = promisify(execFile);
if (process.env.ALLOW_GCS_FIXTURE !== "1") {
  throw new Error("Set ALLOW_GCS_FIXTURE=1 to create one isolated audio-alignment GCS fixture.");
}
const projectId = requiredEnvironment("PROJECT_ID", /^[a-z][a-z0-9-]{4,62}$/);
const bucketName = requiredEnvironment("QUIPSLY_MEDIA_BUCKET", /^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/);
const expectedBuildId = requiredEnvironment("EXPECTED_BUILD_ID", /^[0-9a-f]{40}$/);
const preserve = process.env.PRESERVE === "1";
const suffix = `${utcCompact()}-${randomBytes(6).toString("hex")}`;
const jobId = `audio-alignment-gcs-fixture-${suffix}`;
const scratch = await mkdtemp(path.join(tmpdir(), "quipsly-audio-alignment-gcs-fixture-"));
const marker = path.join(scratch, ".quipsly-audio-alignment-gcs-fixture");
await writeFile(marker, jobId, { mode: 0o600 });

const spineObjectName = `media-vault/raw/processor-fixtures/${jobId}/spine.wav`;
const targetObjectName = `media-vault/raw/processor-fixtures/${jobId}/target.m4a`;
const storageClient = new Storage({ projectId });
const bucket = storageClient.bucket(bucketName);
const workerStorage = new GcsCaptureProxyWorkerStorage(bucketName, storageClient);
const createdObjectNames = [];

try {
  const spinePath = path.join(scratch, "spine.wav");
  const targetPath = path.join(scratch, "target.m4a");
  await generateSources(spinePath, targetPath);
  const [spine, target] = await Promise.all([
    uploadSource("fixture-spine", spinePath, spineObjectName, "audio/wav"),
    uploadSource("fixture-target", targetPath, targetObjectName, "audio/mp4"),
  ]);
  const queuedAt = new Date().toISOString();
  const job = newAudioAlignmentJob({
    jobId,
    projectId: `project-${suffix}`,
    projectSlug: "processor-fixture",
    episodeProductionId: `production-${suffix}`,
    episodeSlug: "synthetic-audio-alignment",
    requestedByUserId: null,
    requestedByEmail: "processor-fixture@highgroundodyssey.com",
    queuedAt,
    spine,
    target,
    proposal: {
      initialOffsetSeconds: -0.3,
      openingTargetSeconds: 3,
      laterTargetSeconds: 18,
      windowSeconds: 3,
      searchRadiusSeconds: 0.5,
      sampleRate: 8_000,
      minimumCorrelation: 0.75,
      minimumPeakMargin: 0.03,
    },
  });
  const manifestObjectName = buildAudioAlignmentCloudManifestObjectName(jobId);
  const queueObjectName = buildAudioAlignmentCloudQueueObjectName(jobId);
  const resultObjectName = buildAudioAlignmentCloudResultObjectName(jobId);
  createdObjectNames.push(manifestObjectName, queueObjectName, resultObjectName);
  const manifestStored = await saveJsonIfAbsent(manifestObjectName, newAudioAlignmentCloudManifest(job));
  const queueStored = await saveJsonIfAbsent(queueObjectName, {
    kind: AUDIO_ALIGNMENT_CLOUD_QUEUE_KIND,
    version: 1,
    jobId,
    manifestObjectName,
    manifestGeneration: manifestStored.generation,
    enqueuedAt: queuedAt,
  });
  const options = {
    executionId: `local-gcs-fixture-${suffix}`,
    buildId: expectedBuildId,
    imageDigest: null,
    leaseDurationMs: 15 * 60 * 1_000,
    now: () => new Date(),
  };
  const first = await processAudioAlignmentCloudQueueObject(
    workerStorage,
    new FfmpegAudioAlignmentAnalyzer(),
    options,
    { name: queueObjectName, generation: queueStored.generation },
  );
  assert.equal(first.disposition, "completed");

  const completedStored = await loadJson(manifestObjectName);
  const completed = parseAudioAlignmentCloudManifest(completedStored.value, jobId);
  assert.equal(completed.status, "completed");
  const resultStored = await loadJson(resultObjectName);
  const result = parseAudioAlignmentResult(resultStored.value, job);
  assert.equal(result.boundaries.placementApplied, false);
  assert.equal(result.boundaries.sourceBytesImmutable, true);
  assert.equal(result.evidence.qualification.qualifiedForAuthorizedAgentReview, true);
  assert.ok(Math.abs(result.evidence.opening.measuredOffsetSeconds + 0.35) <= 0.004);
  assert.ok(Math.abs(result.evidence.later.measuredOffsetSeconds + 0.35) <= 0.004);
  assert.ok(Math.abs(result.evidence.drift.residualDriftMilliseconds) <= 1);
  await assertExactSource(spine, spinePath);
  await assertExactSource(target, targetPath);

  const replayQueue = await saveJsonIfAbsent(queueObjectName, {
    kind: AUDIO_ALIGNMENT_CLOUD_QUEUE_KIND,
    version: 1,
    jobId,
    manifestObjectName,
    manifestGeneration: completedStored.generation,
    enqueuedAt: queuedAt,
  });
  const second = await processAudioAlignmentCloudQueueObject(
    workerStorage,
    new FfmpegAudioAlignmentAnalyzer(),
    options,
    { name: queueObjectName, generation: replayQueue.generation },
  );
  assert.equal(second.disposition, "already-complete");
  const resultAfterReplay = await loadJson(resultObjectName);
  assert.equal(resultAfterReplay.generation, resultStored.generation);

  process.stdout.write(`${JSON.stringify({
    kind: "quipsly-audio-alignment-gcs-fixture-report-v1",
    passed: true,
    projectId,
    bucketName,
    jobId,
    buildId: expectedBuildId,
    sourceBindings: [spine, target],
    evidence: {
      openingOffsetSeconds: result.evidence.opening.measuredOffsetSeconds,
      laterOffsetSeconds: result.evidence.later.measuredOffsetSeconds,
      residualDriftMilliseconds: result.evidence.drift.residualDriftMilliseconds,
      openingCorrelation: result.evidence.opening.normalizedCorrelation,
      laterCorrelation: result.evidence.later.normalizedCorrelation,
      qualifiedForAuthorizedAgentReview: true,
    },
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
    }
  }
  const markerValue = await readFile(marker, "utf8").catch(() => "");
  if (markerValue === jobId) await rm(scratch, { recursive: true, force: true });
}

async function generateSources(spinePath, targetPath) {
  await execute("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", "aevalsrc=0.32*sin(2*PI*(180+11*t)*t)+0.12*sin(2*PI*(731+3*t)*t):s=48000:d=28",
    "-c:a", "pcm_s24le", spinePath,
  ]);
  await execute("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y", "-i", spinePath,
    "-af", "adelay=350|350", "-c:a", "aac", "-b:a", "192k", targetPath,
  ]);
}

async function uploadSource(assetLabel, localPath, objectName, contentType) {
  const bytes = await readFile(localPath);
  const sha256 = digest(bytes);
  await bucket.upload(localPath, {
    destination: objectName,
    resumable: false,
    validation: "crc32c",
    metadata: {
      contentType,
      cacheControl: "private, no-store",
      metadata: {
        quipslyKind: "audio-alignment-gcs-fixture-v1",
        quipslyFixtureJobId: jobId,
        quipslyExpectedSha256: sha256,
      },
    },
    preconditionOpts: { ifGenerationMatch: 0 },
  });
  createdObjectNames.push(objectName);
  const evidence = await objectEvidence(objectName);
  assert.equal(evidence.sizeBytes, bytes.byteLength);
  assert.equal(evidence.contentType, contentType);
  return {
    assetId: `${assetLabel}-${suffix}`,
    provider: "gcs",
    locator: `gcs://${bucketName}/${objectName}?generation=${evidence.generation}`,
    generation: evidence.generation,
    sha256,
    sizeBytes: evidence.sizeBytes,
    contentType,
  };
}

async function assertExactSource(binding, localPath) {
  const expected = await fileDigest(localPath);
  const [bytes] = await bucket.file(objectNameFromLocator(binding.locator), { generation: binding.generation }).download({ validation: "crc32c" });
  assert.equal(digest(bytes), expected);
  assert.equal(digest(bytes), binding.sha256);
}

async function saveJsonIfAbsent(objectName, value) {
  await bucket.file(objectName).save(JSON.stringify(value), {
    resumable: false,
    validation: "crc32c",
    contentType: "application/json; charset=utf-8",
    metadata: { cacheControl: "private, no-store" },
    preconditionOpts: { ifGenerationMatch: 0 },
  });
  return loadJson(objectName);
}

async function loadJson(objectName) {
  const file = bucket.file(objectName);
  const [metadata] = await file.getMetadata();
  const generation = requiredGeneration(metadata.generation);
  const [raw] = await bucket.file(objectName, { generation }).download({ validation: "crc32c" });
  return { value: JSON.parse(raw.toString("utf8")), generation };
}

async function objectEvidence(objectName) {
  const [metadata] = await bucket.file(objectName).getMetadata();
  return {
    generation: requiredGeneration(metadata.generation),
    sizeBytes: Number(metadata.size),
    contentType: String(metadata.contentType || ""),
  };
}

async function deleteAllExactNameVersions(objectName) {
  const [files] = await bucket.getFiles({ prefix: objectName, versions: true });
  for (const file of files.filter((candidate) => candidate.name === objectName)) {
    const [metadata] = await file.getMetadata();
    const generation = requiredGeneration(metadata.generation);
    await bucket.file(objectName, { generation }).delete({ ifGenerationMatch: generation });
  }
}

async function fileDigest(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

function objectNameFromLocator(locator) {
  const prefix = `gcs://${bucketName}/`;
  assert.ok(locator.startsWith(prefix));
  return locator.slice(prefix.length).split("?generation=")[0];
}

function requiredEnvironment(name, pattern) {
  const value = String(process.env[name] || "").trim();
  if (!pattern.test(value)) throw new Error(`${name} is missing or invalid.`);
  return value;
}

function requiredGeneration(value) {
  const generation = String(value || "");
  if (!/^[1-9][0-9]*$/.test(generation)) throw new Error("GCS generation is invalid.");
  return generation;
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function utcCompact() {
  return new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
}
