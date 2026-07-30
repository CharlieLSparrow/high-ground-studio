import { DeepgramTranscriptProvider } from "./deepgram.js";
import { GcsCaptureTranscriptWorkerStorage } from "./gcs-storage.js";
import { runCaptureTranscriptWorker } from "./worker.js";

const bucketName = requiredEnv("QUIPSLY_MEDIA_BUCKET");
const buildId = requiredEnv("QUIPSLY_WORKER_BUILD_ID");
const deepgramApiKey = requiredEnv("DEEPGRAM_API_KEY");
const executionId =
  process.env.CLOUD_RUN_EXECUTION?.trim()
  || process.env.HOSTNAME?.trim()
  || "local-execution";
const imageDigest =
  process.env.QUIPSLY_WORKER_IMAGE_DIGEST?.trim() || null;
const jobLimit = boundedInteger(
  process.env.QUIPSLY_TRANSCRIPT_WORKER_JOB_LIMIT,
  1,
  1,
  20,
);
const leaseDurationMs = boundedInteger(
  process.env.QUIPSLY_TRANSCRIPT_WORKER_LEASE_MS,
  6 * 60 * 60 * 1_000,
  60_000,
  7 * 24 * 60 * 60 * 1_000,
);
const signedUrlDurationMs = boundedInteger(
  process.env.QUIPSLY_TRANSCRIPT_SIGNED_URL_MS,
  6 * 60 * 60 * 1_000,
  5 * 60 * 1_000,
  7 * 24 * 60 * 60 * 1_000,
);

const startedAt = Date.now();
try {
  const results = await runCaptureTranscriptWorker(
    new GcsCaptureTranscriptWorkerStorage(bucketName),
    new DeepgramTranscriptProvider(deepgramApiKey),
    {
      executionId,
      buildId,
      imageDigest,
      leaseDurationMs,
      signedUrlDurationMs,
      now: () => new Date(),
    },
    jobLimit,
  );
  console.log(JSON.stringify({
    severity: "INFO",
    message: "Quipsly transcript worker completed.",
    executionId,
    buildId,
    elapsedMs: Date.now() - startedAt,
    resultCount: results.length,
    results,
  }));
} catch (error) {
  console.error(JSON.stringify({
    severity: "ERROR",
    message: "Quipsly transcript worker needs retry.",
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
