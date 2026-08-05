import { GcsCaptureProxyWorkerStorage } from "./gcs-storage.js";
import { FfmpegCaptureProxyTranscoder } from "./transcoder.js";
import { runCaptureProxyWorker } from "./worker.js";
import { runEpisodeCloudProxyWorker } from "./episode-cloud-worker.js";
import { FfmpegAudioAlignmentAnalyzer } from "./audio-alignment-ffmpeg.js";
import { runAudioAlignmentCloudWorker } from "./audio-alignment-cloud-worker.js";
import { FfmpegAudioMasteringEngine } from "./audio-mastering-ffmpeg.js";
import { runAudioMasteryCloudWorker } from "./audio-mastery-cloud-worker.js";

const bucketName = requiredEnv("QUIPSLY_MEDIA_BUCKET");
const buildId = requiredEnv("QUIPSLY_WORKER_BUILD_ID");
const executionId =
  process.env.CLOUD_RUN_EXECUTION?.trim()
  || process.env.HOSTNAME?.trim()
  || "local-execution";
const imageDigest =
  process.env.QUIPSLY_WORKER_IMAGE_DIGEST?.trim() || null;
const jobLimit = boundedInteger(
  process.env.QUIPSLY_MEDIA_PROCESSOR_JOB_LIMIT,
  2,
  1,
  20,
);
const leaseDurationMs = boundedInteger(
  process.env.QUIPSLY_MEDIA_PROCESSOR_LEASE_MS,
  6 * 60 * 60 * 1_000,
  60_000,
  7 * 24 * 60 * 60 * 1_000,
);

const startedAt = Date.now();
try {
  const storage = new GcsCaptureProxyWorkerStorage(bucketName);
  const transcoder = new FfmpegCaptureProxyTranscoder();
  const captureResults = await runCaptureProxyWorker(
    storage,
    transcoder,
    {
      executionId,
      buildId,
      imageDigest,
      leaseDurationMs,
      now: () => new Date(),
    },
    jobLimit,
  );
  const episodeResults = await runEpisodeCloudProxyWorker(
    storage,
    transcoder,
    {
      executionId,
      buildId,
      imageDigest,
      leaseDurationMs,
      now: () => new Date(),
    },
    jobLimit,
  );
  const alignmentResults = await runAudioAlignmentCloudWorker(
    storage,
    new FfmpegAudioAlignmentAnalyzer(),
    {
      executionId,
      buildId,
      imageDigest,
      leaseDurationMs,
      now: () => new Date(),
    },
    jobLimit,
  );
  const masteryResults = await runAudioMasteryCloudWorker(
    storage,
    new FfmpegAudioMasteringEngine(),
    {
      executionId,
      buildId,
      imageDigest,
      leaseDurationMs,
      now: () => new Date(),
    },
    jobLimit,
  );
  console.log(JSON.stringify({
    severity: "INFO",
    message: "Quipsly capture proxy processor completed.",
    executionId,
    buildId,
    elapsedMs: Date.now() - startedAt,
    resultCount: captureResults.length + episodeResults.length + alignmentResults.length + masteryResults.length,
    captureResults,
    episodeResults,
    alignmentResults,
    masteryResults,
  }));
} catch (error) {
  console.error(JSON.stringify({
    severity: "ERROR",
    message: "Quipsly capture proxy processor needs retry.",
    executionId,
    buildId,
    elapsedMs: Date.now() - startedAt,
    reason: error instanceof Error ? error.message : "unknown",
  }));
  process.exitCode = 1;
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function boundedInteger(
  raw: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const value = raw == null || raw.trim() === "" ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`Expected an integer between ${minimum} and ${maximum}.`);
  }
  return value;
}
