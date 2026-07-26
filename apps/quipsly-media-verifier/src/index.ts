import { GcsLongSourceWorkerStorage } from "./gcs-storage.js";
import { runLongSourceWorker } from "./worker.js";

const bucketName = requiredEnv("QUIPSLY_MEDIA_BUCKET");
const buildId = requiredEnv("QUIPSLY_WORKER_BUILD_ID");
const executionId =
  process.env.CLOUD_RUN_EXECUTION?.trim() ||
  process.env.HOSTNAME?.trim() ||
  "local-execution";
const imageDigest = process.env.QUIPSLY_WORKER_IMAGE_DIGEST?.trim() || null;
const receiptLimit = boundedInteger(
  process.env.QUIPSLY_VERIFIER_RECEIPT_LIMIT,
  8,
  1,
  100,
);
const leaseDurationMs = boundedInteger(
  process.env.QUIPSLY_VERIFIER_LEASE_MS,
  24 * 60 * 60 * 1000,
  60_000,
  7 * 24 * 60 * 60 * 1000,
);

const startedAt = Date.now();
const storage = new GcsLongSourceWorkerStorage(bucketName);
try {
  const results = await runLongSourceWorker(
    storage,
    {
      executionId,
      buildId,
      imageDigest,
      leaseDurationMs,
      now: () => new Date(),
    },
    receiptLimit,
  );
  console.log(
    JSON.stringify({
      severity: "INFO",
      message: "Quipsly long-source verifier completed.",
      executionId,
      buildId,
      elapsedMs: Date.now() - startedAt,
      resultCount: results.length,
      results,
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      severity: "ERROR",
      message: "Quipsly long-source verifier needs retry.",
      executionId,
      buildId,
      elapsedMs: Date.now() - startedAt,
      reason: error instanceof Error ? error.message : "unknown",
    }),
  );
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
