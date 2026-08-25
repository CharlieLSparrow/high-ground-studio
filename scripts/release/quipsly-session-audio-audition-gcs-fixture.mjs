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
  SESSION_AUDIO_AUDITION_PROFILE,
  SESSION_AUDIO_AUDITION_QUEUE_KIND,
  buildSessionAudioAuditionManifestObjectName,
  buildSessionAudioAuditionQueueObjectName,
  buildSessionAudioAuditionResultObjectName,
  buildSessionAudioAuditionTargetObjectName,
  newSessionAudioAuditionManifest,
  parseSessionAudioAuditionManifest,
  parseSessionAudioAuditionResult,
} from "../../packages/quipsly-media-processing/src/index.ts";
import { GcsCaptureProxyWorkerStorage } from "../../apps/quipsly-media-processor/src/gcs-storage.ts";
import { FfmpegSessionAudioAuditionEngine } from "../../apps/quipsly-media-processor/src/session-audio-audition-ffmpeg.ts";
import { processSessionAudioAuditionQueueObject } from "../../apps/quipsly-media-processor/src/session-audio-audition-worker.ts";

const execute = promisify(execFile);
if (process.env.ALLOW_GCS_FIXTURE !== "1")
  throw new Error(
    "Set ALLOW_GCS_FIXTURE=1 to create one isolated Session audio-audition GCS fixture.",
  );
const projectId = required("PROJECT_ID", /^[a-z][a-z0-9-]{4,62}$/);
const bucketName = required(
  "QUIPSLY_MEDIA_BUCKET",
  /^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/,
);
const expectedBuildId = required("EXPECTED_BUILD_ID", /^[0-9a-f]{40}$/);
const preserve = process.env.PRESERVE === "1";
const suffix = `${compactUtc()}-${randomBytes(6).toString("hex")}`;
const roomId = `fixture-room-${suffix}`;
const jobId = `session-audition-gcs-fixture-${suffix}`;
const recordingAssetId = `fixture-camera-recording-${suffix}`;
const sourceObjectName = `media-vault/recordings/processor-fixtures/${jobId}/camera.mov`;
const targetObjectName = buildSessionAudioAuditionTargetObjectName({
  roomId,
  recordingAssetId,
  jobId,
});
const scratch = await mkdtemp(
  path.join(tmpdir(), "quipsly-session-audition-gcs-fixture-"),
);
const marker = path.join(scratch, ".quipsly-session-audition-gcs-fixture");
await writeFile(marker, jobId, { mode: 0o600 });
const storageClient = new Storage({ projectId });
const bucket = storageClient.bucket(bucketName);
const workerStorage = new GcsCaptureProxyWorkerStorage(
  bucketName,
  storageClient,
);
const created = new Set();

try {
  const sourcePath = path.join(scratch, "camera.mov");
  await execute("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=1280x720:rate=24:duration=8",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=263:sample_rate=48000:duration=8",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-shortest",
    sourcePath,
  ]);
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
        quipslyKind: "session-audio-audition-gcs-fixture-v1",
        quipslyFixtureJobId: jobId,
        quipslyExpectedSha256: sourceSha256,
      },
    },
    preconditionOpts: { ifGenerationMatch: 0 },
  });
  created.add(sourceObjectName);
  const [sourceMetadata] = await bucket.file(sourceObjectName).getMetadata();
  const sourceGeneration = String(sourceMetadata.generation);
  assert.match(sourceGeneration, /^[1-9][0-9]*$/);
  assert.equal(Number(sourceMetadata.size), sourceBytes.byteLength);
  const queuedAt = new Date().toISOString();
  const manifest = newSessionAudioAuditionManifest({
    jobId,
    roomId,
    requestedByUserId: `fixture-user-${suffix}`,
    requestedByEmail: "processor-fixture@highgroundodyssey.com",
    source: {
      bucketName,
      objectName: sourceObjectName,
      generation: sourceGeneration,
      sizeBytes: sourceBytes.byteLength,
      sha256: sourceSha256,
      contentType: "video/quicktime",
      durationSeconds: 8,
      roomId,
      recordingAssetId,
      finalizationUploadSessionId: `fixture-upload-${suffix}`,
    },
    target: {
      bucketName,
      objectName: targetObjectName,
      contentType: "audio/mp4",
      profile: SESSION_AUDIO_AUDITION_PROFILE,
    },
    queuedAt,
    updatedAt: queuedAt,
  });
  const manifestObjectName = buildSessionAudioAuditionManifestObjectName(jobId);
  const queueObjectName = buildSessionAudioAuditionQueueObjectName(jobId);
  const resultObjectName = buildSessionAudioAuditionResultObjectName(jobId);
  for (const name of [
    manifestObjectName,
    queueObjectName,
    resultObjectName,
    targetObjectName,
  ])
    created.add(name);
  const storedManifest = await workerStorage.saveJsonIfAbsent(
    manifestObjectName,
    manifest,
  );
  const storedQueue = await workerStorage.saveJsonIfAbsent(queueObjectName, {
    kind: SESSION_AUDIO_AUDITION_QUEUE_KIND,
    version: 1,
    jobId,
    manifestObjectName,
    manifestGeneration: storedManifest.generation,
    enqueuedAt: queuedAt,
  });
  const options = {
    executionId: `local-gcs-fixture-${suffix}`,
    buildId: expectedBuildId,
    imageDigest: null,
    leaseDurationMs: 15 * 60 * 1_000,
    now: () => new Date(),
  };
  const first = await processSessionAudioAuditionQueueObject(
    workerStorage,
    new FfmpegSessionAudioAuditionEngine(),
    options,
    { name: queueObjectName, generation: storedQueue.generation },
  );
  assert.equal(first.disposition, "completed");
  const completedStored = await workerStorage.loadJson(manifestObjectName);
  const completed = parseSessionAudioAuditionManifest(
    completedStored.value,
    jobId,
  );
  assert.equal(completed.status, "completed");
  const resultStored = await workerStorage.loadJson(resultObjectName);
  const result = parseSessionAudioAuditionResult(resultStored.value, manifest);
  assert.equal(result.output.metadata.hasVideo, false);
  assert.equal(result.output.metadata.decodedToEnd, true);
  assert.equal(result.output.metadata.sampleRateHz, 48_000);
  const [retainedSource] = await bucket
    .file(sourceObjectName, { generation: sourceGeneration })
    .download({ validation: "crc32c" });
  assert.equal(sha256(retainedSource), sourceSha256);
  const replayQueue = await workerStorage.saveJsonIfAbsent(queueObjectName, {
    kind: SESSION_AUDIO_AUDITION_QUEUE_KIND,
    version: 1,
    jobId,
    manifestObjectName,
    manifestGeneration: completedStored.generation,
    enqueuedAt: queuedAt,
  });
  const replay = await processSessionAudioAuditionQueueObject(
    workerStorage,
    new FfmpegSessionAudioAuditionEngine(),
    options,
    { name: queueObjectName, generation: replayQueue.generation },
  );
  assert.equal(replay.disposition, "already-complete");
  assert.equal(
    (await workerStorage.loadJson(resultObjectName)).generation,
    resultStored.generation,
  );
  process.stdout.write(
    `${JSON.stringify(
      {
        kind: "quipsly-session-audio-audition-gcs-fixture-report-v1",
        passed: true,
        projectId,
        bucketName,
        jobId,
        buildId: expectedBuildId,
        source: manifest.source,
        output: result.output,
        originalRemainsSourceTruth: true,
        replayWasCreateOnceNoOp: true,
        syntheticMediaOnly: true,
        preserved: preserve,
        completedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  );
} finally {
  if (!preserve)
    for (const objectName of created)
      await deleteExactFixtureObject(objectName);
  const markerValue = await readFile(marker, "utf8").catch(() => "");
  if (markerValue === jobId)
    await rm(scratch, { recursive: true, force: true });
}

async function deleteExactFixtureObject(objectName) {
  assert.ok(objectName.includes(jobId));
  const [files] = await bucket.getFiles({
    prefix: objectName,
    versions: true,
    autoPaginate: true,
  });
  for (const file of files.filter((candidate) => candidate.name === objectName))
    await file.delete({ ignoreNotFound: true });
}
function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
function required(name, pattern) {
  const value = process.env[name]?.trim() || "";
  if (!pattern.test(value)) throw new Error(`${name} is missing or unsafe.`);
  return value;
}
function compactUtc() {
  return new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .slice(0, 14);
}
