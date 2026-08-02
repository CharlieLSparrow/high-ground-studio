#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { Storage } from "@google-cloud/storage";

import {
  COLLABORATION_PROXY_PROFILE,
  EPISODE_COLLABORATION_PROXY_CLOUD_QUEUE_KIND,
  buildEpisodeCollaborationProxyCloudManifestObjectName,
  buildEpisodeCollaborationProxyCloudQueueObjectName,
  buildEpisodeCollaborationProxyCloudResultObjectName,
  buildEpisodeCollaborationProxyTargetLocator,
  newEpisodeCollaborationProxyCloudManifest,
  newEpisodeCollaborationProxyJob,
  parseEpisodeCollaborationProxyCloudManifest,
  parseEpisodeCollaborationProxyResult,
} from "../../packages/quipsly-media-processing/src/index.ts";
import { GcsCaptureProxyWorkerStorage } from "../../apps/quipsly-media-processor/src/gcs-storage.ts";
import { processEpisodeCloudProxyQueueObject } from "../../apps/quipsly-media-processor/src/episode-cloud-worker.ts";
import { FfmpegCaptureProxyTranscoder } from "../../apps/quipsly-media-processor/src/transcoder.ts";

const execute = promisify(execFile);
if (process.env.ALLOW_GCS_FIXTURE !== "1") {
  throw new Error("Set ALLOW_GCS_FIXTURE=1 to create one isolated GCS fixture.");
}
const projectId = requiredEnvironment("PROJECT_ID", /^[a-z][a-z0-9-]{4,62}$/);
const bucketName = requiredEnvironment(
  "QUIPSLY_MEDIA_BUCKET",
  /^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/,
);
const expectedBuildId = requiredEnvironment("EXPECTED_BUILD_ID", /^[0-9a-f]{40}$/);
const preserve = process.env.PRESERVE === "1";
const suffix = `${utcCompact()}-${randomBytes(6).toString("hex")}`;
const jobId = `episode-cloud-fixture-${suffix}`;
const rawAssetId = `fixture-raw-${suffix}`;
const sourceId = `fixture-source-${suffix}`;
const projectRecordId = `fixture-project-${suffix}`;
const productionId = `fixture-production-${suffix}`;
const sourceObjectName = `media-vault/raw/processor-fixtures/${jobId}/source.mov`;
const scratch = await mkdtemp(join(tmpdir(), "quipsly-episode-gcs-fixture-"));
const marker = join(scratch, ".quipsly-episode-gcs-fixture");
await writeFile(marker, jobId, { mode: 0o600 });

const storageClient = new Storage({ projectId });
const bucket = storageClient.bucket(bucketName);
const workerStorage = new GcsCaptureProxyWorkerStorage(bucketName, storageClient);
const createdObjectNames = [];

try {
  const sourcePath = join(scratch, "source.mov");
  await generateSource(sourcePath);
  const sourceBytes = await readFile(sourcePath);
  const sourceSha256 = sha256(sourceBytes);
  await bucket.upload(sourcePath, {
    destination: sourceObjectName,
    resumable: false,
    validation: "crc32c",
    metadata: {
      contentType: "video/quicktime",
      cacheControl: "private, no-store",
      metadata: {
        quipslyKind: "episode-collaboration-proxy-gcs-fixture-v1",
        quipslyFixtureJobId: jobId,
        quipslyExpectedSha256: sourceSha256,
      },
    },
    preconditionOpts: { ifGenerationMatch: 0 },
  });
  createdObjectNames.push(sourceObjectName);
  const sourceEvidence = await objectEvidence(sourceObjectName);
  assert.equal(sourceEvidence.sizeBytes, sourceBytes.byteLength);
  assert.equal(sourceEvidence.contentType, "video/quicktime");

  const queuedAt = new Date().toISOString();
  const targetObjectName = buildEpisodeCollaborationProxyTargetLocator({
    projectSlug: "processor-fixture",
    episodeSlug: "synthetic-episode",
    rawAssetId,
    sourceSha256,
  });
  const job = newEpisodeCollaborationProxyJob({
    jobId,
    projectId: projectRecordId,
    projectSlug: "processor-fixture",
    episodeProductionId: productionId,
    episodeSlug: "synthetic-episode",
    actorUserId: null,
    actorEmail: "processor-fixture@highgroundodyssey.com",
    queuedAt,
    source: {
      provider: "gcs",
      locator: gcsLocator(bucketName, sourceObjectName, sourceEvidence.generation),
      generation: sourceEvidence.generation,
      sizeBytes: sourceEvidence.sizeBytes,
      sha256: sourceSha256,
      contentType: sourceEvidence.contentType,
      rawAssetId,
      sourceId,
    },
    target: {
      provider: "gcs",
      locator: targetObjectName,
      contentType: "video/mp4",
      profile: COLLABORATION_PROXY_PROFILE,
    },
  });
  const manifestObjectName = buildEpisodeCollaborationProxyCloudManifestObjectName(jobId);
  const queueObjectName = buildEpisodeCollaborationProxyCloudQueueObjectName(jobId);
  const resultObjectName = buildEpisodeCollaborationProxyCloudResultObjectName(jobId);
  createdObjectNames.push(manifestObjectName, queueObjectName, resultObjectName, targetObjectName);
  const storedManifest = await saveJsonIfAbsent(
    manifestObjectName,
    newEpisodeCollaborationProxyCloudManifest(job),
  );
  const queueReceipt = {
    kind: EPISODE_COLLABORATION_PROXY_CLOUD_QUEUE_KIND,
    version: 1,
    jobId,
    manifestObjectName,
    manifestGeneration: storedManifest.generation,
    enqueuedAt: queuedAt,
  };
  const storedQueue = await saveJsonIfAbsent(queueObjectName, queueReceipt);
  const options = {
    executionId: `local-gcs-fixture-${suffix}`,
    buildId: expectedBuildId,
    imageDigest: null,
    leaseDurationMs: 15 * 60 * 1_000,
    now: () => new Date(),
  };
  const first = await processEpisodeCloudProxyQueueObject(
    workerStorage,
    new FfmpegCaptureProxyTranscoder(),
    options,
    { name: queueObjectName, generation: storedQueue.generation },
  );
  assert.equal(first.disposition, "completed");
  const completedStored = await loadJson(manifestObjectName);
  const completed = parseEpisodeCollaborationProxyCloudManifest(
    completedStored.value,
    jobId,
  );
  assert.equal(completed.status, "completed");
  const resultStored = await loadJson(resultObjectName);
  const result = parseEpisodeCollaborationProxyResult(resultStored.value, job);
  const outputEvidence = await objectEvidence(targetObjectName, result.output.generation);
  const sourceReadback = await downloadExact(sourceObjectName, sourceEvidence.generation);
  const outputReadback = await downloadExact(targetObjectName, result.output.generation);
  assert.equal(sha256(sourceReadback), sourceSha256);
  assert.equal(sha256(outputReadback), result.output.sha256);
  assert.equal(outputEvidence.crc32c, result.output.crc32c);
  assert.equal(outputEvidence.sizeBytes, result.output.sizeBytes);
  assert.equal(result.worker.buildId, expectedBuildId);
  assert.equal(result.worker.imageDigest, null);
  assert.equal(result.originalRemainsSourceTruth, true);
  assertFastStart(outputReadback);
  const technical = await ffprobe(writeReadbackPath(scratch, outputReadback));
  assertTechnical(technical, result.output.metadata);

  const replayQueue = await saveJsonIfAbsent(queueObjectName, {
    ...queueReceipt,
    manifestGeneration: completedStored.generation,
  });
  const second = await processEpisodeCloudProxyQueueObject(
    workerStorage,
    new FfmpegCaptureProxyTranscoder(),
    options,
    { name: queueObjectName, generation: replayQueue.generation },
  );
  assert.equal(second.disposition, "already-complete");
  const outputAfterReplay = await objectEvidence(targetObjectName, result.output.generation);
  assert.equal(outputAfterReplay.generation, result.output.generation);

  process.stdout.write(`${JSON.stringify({
    kind: "quipsly-episode-collaboration-proxy-gcs-fixture-report-v1",
    passed: true,
    projectId,
    bucketName,
    jobId,
    buildId: expectedBuildId,
    source: {
      objectName: sourceObjectName,
      generation: sourceEvidence.generation,
      sizeBytes: sourceEvidence.sizeBytes,
      sha256: sourceSha256,
      unchangedAfterWorker: true,
    },
    output: {
      objectName: targetObjectName,
      generation: result.output.generation,
      sizeBytes: result.output.sizeBytes,
      sha256: result.output.sha256,
      crc32c: result.output.crc32c,
      metadata: result.output.metadata,
      fastStart: true,
    },
    manifest: {
      objectName: manifestObjectName,
      generation: completedStored.generation,
      status: completed.status,
    },
    result: { objectName: resultObjectName, generation: resultStored.generation },
    replayWasCreateOnceNoOp: true,
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

async function saveJsonIfAbsent(objectName, value) {
  const file = bucket.file(objectName);
  await file.save(JSON.stringify(value), {
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

async function objectEvidence(objectName, generation) {
  const file = bucket.file(objectName, generation ? { generation } : undefined);
  const [metadata] = await file.getMetadata();
  return {
    objectName,
    generation: requiredGeneration(metadata.generation),
    sizeBytes: Number(metadata.size),
    contentType: String(metadata.contentType || ""),
    crc32c: String(metadata.crc32c || ""),
  };
}

async function downloadExact(objectName, generation) {
  const [bytes] = await bucket.file(objectName, { generation }).download({ validation: "crc32c" });
  return bytes;
}

async function deleteAllExactNameVersions(objectName) {
  const [files] = await bucket.getFiles({ prefix: objectName, versions: true });
  for (const file of files.filter((candidate) => candidate.name === objectName)) {
    const [metadata] = await file.getMetadata();
    const generation = requiredGeneration(metadata.generation);
    await bucket.file(objectName, { generation }).delete({ ifGenerationMatch: generation });
  }
}

async function generateSource(destination) {
  await execute("ffmpeg", [
    "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30",
    "-f", "lavfi", "-i", "sine=frequency=880:sample_rate=48000",
    "-t", "2", "-c:v", "libx264", "-preset", "veryfast",
    "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k",
    "-ar", "48000", "-movflags", "+faststart", "-y", destination,
  ], { maxBuffer: 4 * 1024 * 1024 });
}

function writeReadbackPath(scratchRoot, bytes) {
  const destination = join(scratchRoot, "proxy-readback.mp4");
  return writeFile(destination, bytes, { mode: 0o600 }).then(() => destination);
}

async function ffprobe(destinationPromise) {
  const destination = await destinationPromise;
  const { stdout } = await execute("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration:stream=codec_type,codec_name,pix_fmt,width,height,avg_frame_rate",
    "-of", "json", destination,
  ], { maxBuffer: 4 * 1024 * 1024 });
  return JSON.parse(stdout);
}

function assertTechnical(probe, expected) {
  const video = probe.streams.find((stream) => stream.codec_type === "video");
  const audio = probe.streams.find((stream) => stream.codec_type === "audio");
  assert.equal(video.codec_name, "h264");
  assert.equal(video.pix_fmt, "yuv420p");
  assert.equal(video.width, expected.width);
  assert.equal(video.height, expected.height);
  assert.equal(Boolean(audio), expected.hasAudio);
  if (audio) assert.equal(audio.codec_name, "aac");
}

function assertFastStart(bytes) {
  const head = bytes.subarray(0, Math.min(bytes.length, 4 * 1024 * 1024));
  const moov = head.indexOf(Buffer.from("moov"));
  const mdat = head.indexOf(Buffer.from("mdat"));
  assert.ok(moov > 0 && (mdat < 0 || moov < mdat), "Proxy is not fast-start MP4.");
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

function gcsLocator(bucketValue, objectName, generation) {
  return `gcs://${bucketValue}/${objectName}?generation=${generation}`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function utcCompact() {
  return new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
}
