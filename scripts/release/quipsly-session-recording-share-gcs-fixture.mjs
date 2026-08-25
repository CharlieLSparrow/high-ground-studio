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
  SESSION_RECORDING_SHARE_CLOUD_QUEUE_KIND,
  assertSessionRecordingShareCloudResult,
  buildSessionRecordingShareCloudManifestObjectName,
  buildSessionRecordingShareCloudQueueObjectName,
  buildSessionRecordingShareCloudResultObjectName,
  newSessionRecordingShareCloudManifest,
  newSessionRecordingShareJob,
  parseSessionRecordingShareCloudManifest,
} from "../../packages/quipsly-media-processing/src/index.ts";
import { GcsCaptureProxyWorkerStorage } from "../../apps/quipsly-media-processor/src/gcs-storage.ts";
import { FfmpegSessionRecordingShareRenderer } from "../../apps/quipsly-media-processor/src/session-recording-share-ffmpeg.ts";
import { processSessionRecordingShareCloudQueueObject } from "../../apps/quipsly-media-processor/src/session-recording-share-cloud-worker.ts";

const execute = promisify(execFile);
if (process.env.ALLOW_GCS_FIXTURE !== "1") {
  throw new Error(
    "Set ALLOW_GCS_FIXTURE=1 to create one isolated Session recording-share GCS fixture.",
  );
}
const projectId = required("PROJECT_ID", /^[a-z][a-z0-9-]{4,62}$/);
const bucketName = required(
  "QUIPSLY_MEDIA_BUCKET",
  /^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/,
);
const expectedBuildId = required("EXPECTED_BUILD_ID", /^[0-9a-f]{40}$/);
const preserve = process.env.PRESERVE === "1";
const suffix = `${compactUtc()}-${randomBytes(6).toString("hex")}`;
const roomId = `fixture-room-${suffix}`;
const jobId = `session-share-gcs-fixture-${suffix}`;
const outputId = `fixture-output-${suffix}`;
const scratch = await mkdtemp(
  path.join(tmpdir(), "quipsly-session-share-gcs-fixture-"),
);
const marker = path.join(scratch, ".quipsly-session-share-gcs-fixture");
await writeFile(marker, jobId, { mode: 0o600 });

const storageClient = new Storage({ projectId });
const bucket = storageClient.bucket(bucketName);
const workerStorage = new GcsCaptureProxyWorkerStorage(
  bucketName,
  storageClient,
);
const created = new Set();

try {
  const sourcePaths = [
    path.join(scratch, "coach.wav"),
    path.join(scratch, "client.wav"),
  ];
  await Promise.all([
    generateSource(sourcePaths[0], 211, 0),
    generateSource(sourcePaths[1], 337, 250),
  ]);
  const sources = await Promise.all(
    sourcePaths.map((sourcePath, index) =>
      uploadSource(sourcePath, index === 0 ? "coach" : "client", index),
    ),
  );
  const sourceSetSha256 = sha256(
    Buffer.from(
      JSON.stringify(
        sources.map((source) => ({
          recordingAssetId: source.recordingAssetId,
          generation: source.generation,
          sha256: source.sha256,
          programOffsetSeconds: source.programOffsetSeconds,
        })),
      ),
    ),
  );
  const targetObjectName = `media-vault/derived/session-recording-share/${roomId}/${jobId}.m4a`;
  const job = newSessionRecordingShareJob({
    jobId,
    roomId,
    outputId,
    outputRevision: 1,
    requestedAt: new Date().toISOString(),
    sourceSetSha256,
    edit: {
      startSeconds: 1,
      endSeconds: 9,
      keptRanges: [
        { id: `fixture-range-a-${suffix}`, startSeconds: 1, endSeconds: 4 },
        { id: `fixture-range-b-${suffix}`, startSeconds: 5, endSeconds: 9 },
      ],
      transcriptExclusions: [],
      joinCrossfadeSeconds: 0.01,
    },
    sources,
    target: {
      provider: "gcs",
      bucketName,
      objectName: targetObjectName,
      locator: targetObjectName,
      contentType: "audio/mp4",
      codec: "aac-lc",
      sampleRateHz: 48_000,
      channels: 2,
    },
  });
  const manifestObjectName =
    buildSessionRecordingShareCloudManifestObjectName(jobId);
  const queueObjectName = buildSessionRecordingShareCloudQueueObjectName(jobId);
  const resultObjectName =
    buildSessionRecordingShareCloudResultObjectName(jobId);
  for (const name of [
    manifestObjectName,
    queueObjectName,
    resultObjectName,
    targetObjectName,
  ])
    created.add(name);
  const storedManifest = await workerStorage.saveJsonIfAbsent(
    manifestObjectName,
    newSessionRecordingShareCloudManifest(job),
  );
  const queuedAt = new Date().toISOString();
  const storedQueue = await workerStorage.saveJsonIfAbsent(queueObjectName, {
    kind: SESSION_RECORDING_SHARE_CLOUD_QUEUE_KIND,
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
  const first = await processSessionRecordingShareCloudQueueObject(
    workerStorage,
    new FfmpegSessionRecordingShareRenderer(),
    options,
    { name: queueObjectName, generation: storedQueue.generation },
  );
  assert.equal(first.disposition, "completed");
  const completedStored = await workerStorage.loadJson(manifestObjectName);
  const completed = parseSessionRecordingShareCloudManifest(
    completedStored.value,
    jobId,
  );
  assert.equal(completed.status, "completed");
  const resultStored = await workerStorage.loadJson(resultObjectName);
  const result = assertSessionRecordingShareCloudResult(
    resultStored.value,
    job,
  );
  assert.equal(result.output.completeDecode, true);
  assert.equal(result.boundaries.originalSourcesRemainImmutable, true);
  assert.equal(result.boundaries.outputRemainsPrivateUntilRelease, true);
  assert.ok(Math.abs(result.output.durationSeconds - 6.99) < 0.15);
  await Promise.all(
    sources.map((source, index) =>
      assertExactSource(source, sourcePaths[index]),
    ),
  );

  const replayQueue = await workerStorage.saveJsonIfAbsent(queueObjectName, {
    kind: SESSION_RECORDING_SHARE_CLOUD_QUEUE_KIND,
    version: 1,
    jobId,
    manifestObjectName,
    manifestGeneration: completedStored.generation,
    enqueuedAt: queuedAt,
  });
  const replay = await processSessionRecordingShareCloudQueueObject(
    workerStorage,
    new FfmpegSessionRecordingShareRenderer(),
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
        kind: "quipsly-session-recording-share-gcs-fixture-report-v1",
        passed: true,
        projectId,
        bucketName,
        jobId,
        buildId: expectedBuildId,
        sourceBindings: sources,
        output: result.output,
        boundaries: result.boundaries,
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
  if (!preserve) {
    for (const objectName of created)
      await deleteExactFixtureObject(objectName);
  }
  const markerValue = await readFile(marker, "utf8").catch(() => "");
  if (markerValue === jobId)
    await rm(scratch, { recursive: true, force: true });
}

async function generateSource(destination, frequency, delayMs) {
  const filter = delayMs
    ? `sine=frequency=${frequency}:sample_rate=48000:duration=12,adelay=${delayMs}|${delayMs}`
    : `sine=frequency=${frequency}:sample_rate=48000:duration=12`;
  await execute("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    filter,
    "-c:a",
    "pcm_s24le",
    destination,
  ]);
}

async function uploadSource(localPath, label, index) {
  const recordingAssetId = `fixture-recording-${label}-${suffix}`;
  const objectName = `media-vault/recordings/processor-fixtures/${jobId}/${label}.wav`;
  const bytes = await readFile(localPath);
  const digest = sha256(bytes);
  await bucket.upload(localPath, {
    destination: objectName,
    resumable: false,
    validation: "crc32c",
    metadata: {
      contentType: "audio/wav",
      cacheControl: "private, no-store",
      metadata: {
        quipslyKind: "session-recording-share-gcs-fixture-v1",
        quipslyFixtureJobId: jobId,
        quipslyExpectedSha256: digest,
      },
    },
    preconditionOpts: { ifGenerationMatch: 0 },
  });
  created.add(objectName);
  const [metadata] = await bucket.file(objectName).getMetadata();
  const generation = String(metadata.generation);
  assert.match(generation, /^[1-9][0-9]*$/);
  assert.equal(Number(metadata.size), bytes.byteLength);
  return {
    recordingAssetId,
    participantId: `fixture-participant-${label}-${suffix}`,
    participantLabel:
      label === "coach" ? "Synthetic Coach" : "Synthetic Client",
    provider: "gcs",
    bucketName,
    objectName,
    locator: `gcs://${bucketName}/${objectName}?generation=${generation}`,
    generation,
    sha256: digest,
    sizeBytes: bytes.byteLength,
    contentType: "audio/wav",
    programOffsetSeconds: index === 0 ? 0 : 0.25,
  };
}

async function assertExactSource(source, localPath) {
  const [bytes] = await bucket
    .file(source.objectName, { generation: source.generation })
    .download({ validation: "crc32c" });
  assert.equal(sha256(bytes), sha256(await readFile(localPath)));
}

async function deleteExactFixtureObject(objectName) {
  assert.ok(
    objectName.includes(jobId),
    "Fixture cleanup refused an object outside its generated job identity.",
  );
  const [files] = await bucket.getFiles({
    prefix: objectName,
    versions: true,
    autoPaginate: true,
  });
  for (const file of files.filter(
    (candidate) => candidate.name === objectName,
  )) {
    await file.delete({ ignoreNotFound: true });
  }
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
