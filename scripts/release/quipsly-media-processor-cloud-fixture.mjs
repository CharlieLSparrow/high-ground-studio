#!/usr/bin/env node

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { Storage } from "@google-cloud/storage";

import {
  CAPTURE_PROXY_QUEUE_KIND,
  buildCaptureProxyManifestObjectName,
  buildCaptureProxyQueueObjectName,
  buildCaptureProxyResultObjectName,
  buildCaptureProxyTargetObjectName,
  newCaptureProxyManifest,
  parseCaptureProxyManifest,
  parseCaptureProxyResult,
} from "../../packages/quipsly-media-processing/src/index.ts";

const execute = promisify(execFile);
const projectId = requiredEnvironment("PROJECT_ID", /^[a-z][a-z0-9-]{4,62}$/);
const bucketName = requiredEnvironment(
  "QUIPSLY_MEDIA_BUCKET",
  /^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/,
);
const expectedBuildId = requiredEnvironment(
  "EXPECTED_BUILD_ID",
  /^[0-9a-f]{40}$/,
);
const region = optionalEnvironment("REGION", "us-central1");
const jobName = optionalEnvironment(
  "JOB_NAME",
  "quipsly-media-processor",
);
const cleanupRequested = process.env.CLEANUP === "1";
assertSafeName(region, "region");
assertSafeName(jobName, "job name");

const suffix = `${utcCompact()}-${randomBytes(6).toString("hex")}`;
const jobId = `fixture-${suffix}`;
const rawAssetId = `fixture-raw-${suffix}`;
const sourceId = `fixture-source-${suffix}`;
const recordingAssetId = `fixture-recording-${suffix}`;
const uploadSessionId = randomUUID();
const captureId = randomUUID();
const captureGroupId = randomUUID();
const sourceObjectName =
  `media-vault/recordings/processor-fixtures/${jobId}/source.mov`;
const targetObjectName = buildCaptureProxyTargetObjectName({
  projectSlug: "processor-fixture",
  episodeSlug: "synthetic-video",
  rawAssetId,
  jobId,
});
const manifestObjectName = buildCaptureProxyManifestObjectName(jobId);
const queueObjectName = buildCaptureProxyQueueObjectName(jobId);
const resultObjectName = buildCaptureProxyResultObjectName(jobId);
const scratch = await mkdtemp(
  join(tmpdir(), "quipsly-media-processor-cloud-fixture-"),
);
const marker = join(scratch, ".quipsly-cloud-fixture");
await writeFile(marker, jobId, { mode: 0o600 });

const storage = new Storage({ projectId });
const bucket = storage.bucket(bucketName);
const fixtureObjectNames = [
  queueObjectName,
  resultObjectName,
  manifestObjectName,
  targetObjectName,
  sourceObjectName,
];

try {
  const jobContract = await readJobContract();
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
        quipslyKind: "capture-proxy-cloud-fixture-v1",
        quipslyFixtureJobId: jobId,
        quipslyExpectedSha256: sourceSha256,
      },
    },
    preconditionOpts: { ifGenerationMatch: 0 },
  });
  const sourceEvidence = await objectEvidence(sourceObjectName);
  assert(
    sourceEvidence.sizeBytes === sourceBytes.byteLength,
    "Uploaded source size does not match its local fixture.",
  );
  assert(
    sourceEvidence.contentType === "video/quicktime",
    "Uploaded source content type drifted.",
  );

  const queuedAt = new Date().toISOString();
  const manifest = newCaptureProxyManifest({
    jobId,
    projectId: `fixture-project-${suffix}`,
    projectSlug: "processor-fixture",
    episodeSlug: "synthetic-video",
    actorUserId: `fixture-actor-${suffix}`,
    actorEmail: "processor-fixture@highgroundodyssey.com",
    captureId,
    captureGroupId,
    source: {
      bucketName,
      objectName: sourceObjectName,
      generation: sourceEvidence.generation,
      sizeBytes: sourceEvidence.sizeBytes,
      sha256: sourceSha256,
      contentType: sourceEvidence.contentType,
      rawAssetId,
      sourceId,
      recordingAssetId,
      uploadSessionId,
    },
    target: {
      bucketName,
      objectName: targetObjectName,
      contentType: "video/mp4",
      profile: "collaboration-1080p-h264-aac-v1",
    },
    queuedAt,
    updatedAt: queuedAt,
  });
  const storedManifest = await saveJsonIfAbsent(
    manifestObjectName,
    manifest,
    {
      quipslyKind: manifest.kind,
      quipslyProxyJobId: jobId,
      quipslyFixture: "true",
    },
  );

  const queueReceipt = {
    kind: CAPTURE_PROXY_QUEUE_KIND,
    version: 1,
    jobId,
    manifestObjectName,
    manifestGeneration: storedManifest.evidence.generation,
    enqueuedAt: queuedAt,
  };
  await saveJsonIfAbsent(
    queueObjectName,
    queueReceipt,
    {
      quipslyKind: CAPTURE_PROXY_QUEUE_KIND,
      quipslyProxyJobId: jobId,
      quipslyFixture: "true",
    },
  );

  const firstExecution = await executeJob();
  const completedManifestStored = await loadJson(manifestObjectName);
  const completedManifest = parseCaptureProxyManifest(
    completedManifestStored.value,
    jobId,
  );
  assert(
    completedManifest.status === "completed",
    `Fixture manifest ended in ${completedManifest.status}, not completed.`,
  );
  assert(
    completedManifestStored.generation
      !== storedManifest.evidence.generation,
    "Worker did not advance the manifest generation.",
  );

  const resultStored = await loadJson(resultObjectName);
  const result = parseCaptureProxyResult(
    resultStored.value,
    completedManifest,
  );
  const outputEvidence = await objectEvidence(
    targetObjectName,
    result.output.generation,
  );
  const remoteSourcePath = join(scratch, "source-readback.mov");
  const outputPath = join(scratch, "proxy-readback.mp4");
  await downloadGeneration(sourceEvidence, remoteSourcePath);
  await downloadGeneration(outputEvidence, outputPath);
  const remoteSourceBytes = await readFile(remoteSourcePath);
  const outputBytes = await readFile(outputPath);
  const outputSha256 = sha256(outputBytes);
  assert(
    sha256(remoteSourceBytes) === sourceSha256,
    "The immutable source generation changed during processing.",
  );
  assert(
    outputSha256 === result.output.sha256,
    "Downloaded output SHA-256 does not match the worker result.",
  );
  assert(
    outputEvidence.crc32c === result.output.crc32c,
    "Stored output CRC32C does not match the worker result.",
  );
  assertOutputMetadata(outputEvidence, result);
  assert(
    result.worker.buildId === expectedBuildId,
    "Worker result does not identify the expected committed source.",
  );
  assert(
    result.worker.imageDigest === jobContract.imageDigest,
    "Worker result image digest does not match the deployed job image.",
  );

  const technical = await ffprobe(outputPath);
  assertTechnicalEvidence(technical, result.output.metadata);
  assertFastStart(outputBytes);

  const firstOutputGeneration = outputEvidence.generation;
  const firstResultGeneration = resultStored.generation;
  const firstCompletedManifestGeneration = completedManifestStored.generation;
  const secondExecution = await executeJob();
  const secondOutput = await objectEvidence(
    targetObjectName,
    firstOutputGeneration,
  );
  const secondResult = await loadJson(resultObjectName);
  const secondManifest = await loadJson(manifestObjectName);
  assert(
    secondOutput.generation === firstOutputGeneration,
    "No-op retry replaced the immutable proxy output.",
  );
  assert(
    secondResult.generation === firstResultGeneration,
    "No-op retry replaced the immutable result receipt.",
  );
  assert(
    secondManifest.generation === firstCompletedManifestGeneration,
    "No-op retry rewrote a completed manifest.",
  );
  const [queueExists] = await bucket.file(queueObjectName).exists();
  assert(!queueExists, "Completed worker left its queue receipt behind.");

  const report = {
    kind: "quipsly-media-processor-cloud-fixture-report-v1",
    passed: true,
    projectId,
    region,
    jobName,
    jobId,
    expectedBuildId,
    imageDigest: jobContract.imageDigest,
    executions: [firstExecution, secondExecution],
    source: {
      objectName: sourceObjectName,
      generation: sourceEvidence.generation,
      sizeBytes: sourceEvidence.sizeBytes,
      sha256: sourceSha256,
      unchangedAfterWorker: true,
    },
    manifest: {
      objectName: manifestObjectName,
      initialGeneration: storedManifest.evidence.generation,
      completedGeneration: completedManifestStored.generation,
      status: completedManifest.status,
    },
    result: {
      objectName: resultObjectName,
      generation: resultStored.generation,
    },
    output: {
      objectName: targetObjectName,
      generation: outputEvidence.generation,
      sizeBytes: outputEvidence.sizeBytes,
      sha256: outputSha256,
      crc32c: outputEvidence.crc32c,
      technical: result.output.metadata,
      fastStart: true,
    },
    retryWasCreateOnceNoOp: true,
    cleanupRequested,
    completedAt: new Date().toISOString(),
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  if (cleanupRequested) {
    for (const objectName of fixtureObjectNames) {
      const evidence = await objectEvidence(objectName).catch((error) => {
        if (Number(error?.code) === 404) return null;
        throw error;
      });
      if (evidence) await deleteExactGeneration(evidence);
    }
  }
  const markerValue = await readFile(marker, "utf8").catch(() => "");
  if (markerValue === jobId) {
    await rm(scratch, { recursive: true, force: true });
  }
}

async function readJobContract() {
  const { stdout } = await execute(
    "gcloud",
    [
      "run",
      "jobs",
      "describe",
      jobName,
      `--project=${projectId}`,
      `--region=${region}`,
      "--format=json",
    ],
    { maxBuffer: 4 * 1024 * 1024 },
  );
  const job = JSON.parse(stdout);
  const template =
    job.template?.template
    || job.spec?.template?.spec?.template?.spec;
  const container = template?.containers?.[0];
  const environment = Object.fromEntries(
    (container?.env || []).map((entry) => [entry.name, entry.value]),
  );
  const image = String(container?.image || "");
  const digestMatch = image.match(/@(sha256:[0-9a-f]{64})$/);
  assert(digestMatch, "Cloud Run Job does not use an immutable image digest.");
  assert(
    environment.QUIPSLY_MEDIA_BUCKET === bucketName,
    "Cloud Run Job media bucket does not match the fixture bucket.",
  );
  assert(
    environment.QUIPSLY_WORKER_BUILD_ID === expectedBuildId,
    "Cloud Run Job build ID does not match EXPECTED_BUILD_ID.",
  );
  return { image, imageDigest: digestMatch[1] };
}

async function generateSource(destination) {
  await execute(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=720x1280:rate=30",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=880:sample_rate=48000",
      "-t",
      "2",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "160k",
      "-ar",
      "48000",
      "-movflags",
      "+faststart",
      "-y",
      destination,
    ],
    { maxBuffer: 4 * 1024 * 1024 },
  );
}

async function executeJob() {
  const { stdout, stderr } = await execute(
    "gcloud",
    [
      "run",
      "jobs",
      "execute",
      jobName,
      `--project=${projectId}`,
      `--region=${region}`,
      "--wait",
      "--quiet",
      "--format=value(metadata.name)",
    ],
    { maxBuffer: 8 * 1024 * 1024 },
  );
  const executionName = stdout.trim()
    || stderr.match(/executions\/([A-Za-z0-9-]+)/)?.[1]
    || "completed-execution-name-not-returned";
  return { executionName };
}

async function saveJsonIfAbsent(objectName, value, customMetadata) {
  const file = bucket.file(objectName);
  await file.save(JSON.stringify(value), {
    resumable: false,
    validation: "crc32c",
    contentType: "application/json; charset=utf-8",
    metadata: {
      cacheControl: "private, no-store",
      metadata: customMetadata,
    },
    preconditionOpts: { ifGenerationMatch: 0 },
  });
  return loadJson(objectName);
}

async function loadJson(objectName) {
  const evidence = await objectEvidence(objectName);
  const [bytes] = await bucket.file(
    objectName,
    { generation: evidence.generation },
  ).download({ validation: "crc32c" });
  return {
    value: JSON.parse(bytes.toString("utf8")),
    generation: evidence.generation,
    evidence,
  };
}

async function objectEvidence(objectName, generation) {
  const file = bucket.file(
    objectName,
    generation ? { generation } : undefined,
  );
  const [metadata] = await file.getMetadata();
  const resolvedGeneration = String(metadata.generation || "");
  assert(
    /^[1-9][0-9]*$/.test(resolvedGeneration),
    `Object ${objectName} has no immutable generation.`,
  );
  return {
    bucketName,
    objectName,
    generation: resolvedGeneration,
    sizeBytes: Number(metadata.size),
    contentType: String(metadata.contentType || ""),
    crc32c: metadata.crc32c ? String(metadata.crc32c) : null,
    customMetadata: Object.fromEntries(
      Object.entries(metadata.metadata || {}).map(([key, value]) => [
        key,
        String(value),
      ]),
    ),
  };
}

async function downloadGeneration(evidence, destination) {
  await bucket.file(
    evidence.objectName,
    { generation: evidence.generation },
  ).download({
    destination,
    validation: "crc32c",
  });
}

async function deleteExactGeneration(evidence) {
  try {
    await bucket.file(
      evidence.objectName,
      { generation: evidence.generation },
    ).delete({ ifGenerationMatch: evidence.generation });
  } catch (error) {
    if (Number(error?.code) !== 404) throw error;
  }
}

async function ffprobe(filePath) {
  const { stdout } = await execute(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_streams",
      "-show_format",
      "-of",
      "json",
      filePath,
    ],
    { maxBuffer: 4 * 1024 * 1024 },
  );
  return JSON.parse(stdout);
}

function assertOutputMetadata(evidence, result) {
  const metadata = evidence.customMetadata;
  const expected = {
    quipslyProxyJobId: jobId,
    quipslyRawAssetId: rawAssetId,
    quipslySourceGeneration: result.source.generation,
    quipslySourceSha256: result.source.sha256,
    quipslyOutputSha256: result.output.sha256,
    quipslyOutputSizeBytes: String(result.output.sizeBytes),
    quipslyProfile: result.output.profile,
    quipslyFastStart: "true",
  };
  for (const [key, value] of Object.entries(expected)) {
    assert(
      metadata[key] === value,
      `Stored output metadata ${key} does not match its result receipt.`,
    );
  }
}

function assertTechnicalEvidence(probe, expected) {
  const video = (probe.streams || []).find(
    (stream) => stream.codec_type === "video",
  );
  const audio = (probe.streams || []).find(
    (stream) => stream.codec_type === "audio",
  );
  const duration = Number(probe.format?.duration);
  const [fpsNumerator, fpsDenominator] = String(
    video?.avg_frame_rate || video?.r_frame_rate || "0/1",
  ).split("/").map(Number);
  const fps = fpsDenominator > 0
    ? fpsNumerator / fpsDenominator
    : Number.NaN;
  assert(video?.codec_name === "h264", "Proxy video codec is not H.264.");
  assert(audio?.codec_name === "aac", "Proxy audio codec is not AAC.");
  assert(video?.pix_fmt === "yuv420p", "Proxy pixel format is not yuv420p.");
  assert(expected.hasAudio === true, "Worker result omitted fixture audio.");
  assert(
    Number(video?.width) === expected.width
      && Number(video?.height) === expected.height,
    "FFprobe dimensions do not match the worker result.",
  );
  assert(
    Number.isFinite(fps) && Math.abs(fps - expected.fps) < 0.01,
    "FFprobe frame rate does not match the worker result.",
  );
  assert(
    Number.isFinite(duration)
      && Math.abs(duration - expected.durationSeconds) < 0.1,
    "FFprobe duration does not match the worker result.",
  );
}

function assertFastStart(bytes) {
  const moov = bytes.indexOf(Buffer.from("moov"));
  const mdat = bytes.indexOf(Buffer.from("mdat"));
  assert(
    moov > 0 && mdat > 0 && moov < mdat,
    "Proxy MP4 does not place moov before mdat.",
  );
}

function requiredEnvironment(name, pattern) {
  const value = String(process.env[name] || "").trim();
  if (!pattern.test(value)) {
    throw new Error(`${name} is missing or unsafe.`);
  }
  return value;
}

function optionalEnvironment(name, fallback) {
  return String(process.env[name] || fallback).trim();
}

function assertSafeName(value, label) {
  if (!/^[a-z][a-z0-9-]{0,62}$/.test(value)) {
    throw new Error(`Unsafe ${label}: ${value || "<missing>"}.`);
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function utcCompact() {
  return new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
