import "server-only";

import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { getMediaBucket } from "@/lib/server/gcs";

export const MOBILE_CAPTURE_LOCAL_VAULT_BUCKET = "quipsly-local-development-vault";

type ReadMobileCaptureObjectArgs = {
  bucketName: string;
  objectName: string;
  expectedByteSize?: number | null;
  expectedSha256?: string | null;
  maxBytes: number;
};

type LocalObjectMetadata = {
  sizeBytes?: number;
  customMetadata?: Record<string, string>;
};

function loopbackHost(value: string) {
  return value === "localhost" || value === "127.0.0.1" || value === "::1";
}

function localDatabaseConfigured() {
  try {
    const value = process.env.DATABASE_URL;
    return Boolean(value && loopbackHost(new URL(value).hostname));
  } catch {
    return false;
  }
}

function localVaultRoot() {
  const configuredRoot = process.env.QUIPSLY_LOCAL_CAPTURE_VAULT_ROOT?.trim();
  if (!configuredRoot) throw new Error("Local Capture vault is not configured.");
  if (process.env.NODE_ENV === "production") {
    throw new Error("Local Capture vault reads are disabled in production.");
  }
  if (!localDatabaseConfigured()) {
    throw new Error("Local Capture vault reads require loopback PostgreSQL.");
  }

  const root = path.resolve(configuredRoot);
  const temporaryRoot = path.resolve(os.tmpdir());
  const relative = path.relative(temporaryRoot, root);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Local Capture vault root must be a dedicated directory below the operating-system temporary directory.");
  }
  return root;
}

function confinedLocalObjectPath(root: string, objectName: string) {
  const objectsRoot = path.resolve(root, "objects");
  const candidate = path.resolve(objectsRoot, objectName);
  const relative = path.relative(objectsRoot, candidate);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Capture object path escaped its configured storage root.");
  }
  return candidate;
}

function positiveInteger(value: unknown) {
  const parsed = typeof value === "bigint" ? Number(value) : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function normalizedSha256(value: unknown) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return /^[a-f0-9]{64}$/.test(normalized) ? normalized : null;
}

function assertExpectedSize(actual: number, expected: number | null) {
  if (expected !== null && actual !== expected) {
    throw new Error("Capture source size does not match its immutable recording receipt.");
  }
}

function assertWithinRouteLimit(actual: number, maxBytes: number) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || actual > maxBytes) {
    throw new Error("Capture source is too large for in-request transcription.");
  }
}

function assertExpectedHash(bytes: Buffer, expectedSha256: string | null) {
  if (!expectedSha256) return;
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== expectedSha256) {
    throw new Error("Capture source hash does not match its immutable recording receipt.");
  }
}

async function readLocalObject(args: ReadMobileCaptureObjectArgs) {
  const objectPath = confinedLocalObjectPath(localVaultRoot(), args.objectName);
  const [metadataValue, objectStat] = await Promise.all([
    readFile(`${objectPath}.quipsly.json`, "utf8"),
    stat(objectPath),
  ]);
  if (!objectStat.isFile()) throw new Error("Local Capture source is not a regular file.");

  const metadata = JSON.parse(metadataValue) as LocalObjectMetadata;
  const metadataSize = positiveInteger(metadata.sizeBytes);
  if (metadataSize === null || metadataSize !== objectStat.size) {
    throw new Error("Local Capture source does not match its immutable metadata receipt.");
  }

  const expectedByteSize = positiveInteger(args.expectedByteSize);
  assertExpectedSize(objectStat.size, expectedByteSize);
  assertWithinRouteLimit(objectStat.size, args.maxBytes);

  const bytes = await readFile(objectPath);
  const expectedSha256 =
    normalizedSha256(args.expectedSha256) ||
    normalizedSha256(metadata.customMetadata?.quipslyExpectedSha256);
  assertExpectedHash(bytes, expectedSha256);
  return bytes;
}

async function readGcsObject(args: ReadMobileCaptureObjectArgs) {
  const file = getMediaBucket(args.bucketName).file(args.objectName);
  const [metadata] = await file.getMetadata();
  const metadataSize = positiveInteger(metadata.size);
  if (metadataSize === null) {
    throw new Error("Capture source storage metadata does not include a trustworthy size.");
  }

  const expectedByteSize = positiveInteger(args.expectedByteSize);
  assertExpectedSize(metadataSize, expectedByteSize);
  assertWithinRouteLimit(metadataSize, args.maxBytes);

  const [bytes] = await file.download();
  if (bytes.byteLength !== metadataSize) {
    throw new Error("Capture source bytes changed while they were being read.");
  }
  const expectedSha256 =
    normalizedSha256(args.expectedSha256) ||
    normalizedSha256(metadata.metadata?.quipslyExpectedSha256);
  assertExpectedHash(bytes, expectedSha256);
  return bytes;
}

/**
 * Reads only the immutable object named by a RecordingAsset receipt.
 * Local-vault access is development-only and confined below the configured
 * temporary root; production reads stay on the configured GCS object.
 */
export async function readMobileCaptureObjectBytes(args: ReadMobileCaptureObjectArgs) {
  if (!args.bucketName.trim() || !args.objectName.trim()) {
    throw new Error("Capture source storage identity is incomplete.");
  }
  return args.bucketName === MOBILE_CAPTURE_LOCAL_VAULT_BUCKET
    ? readLocalObject(args)
    : readGcsObject(args);
}
