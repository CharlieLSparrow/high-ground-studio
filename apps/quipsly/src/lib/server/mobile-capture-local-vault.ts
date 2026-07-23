import "server-only";

import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, open, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { isSafeMobileCaptureUploadSessionId } from "@/lib/server/mobile-capture-security";

export const MOBILE_CAPTURE_LOCAL_VAULT_BUCKET = "quipsly-local-development-vault";

type LocalManifestEnvelope<T> = { generation: string; manifest: T };
type LocalObjectMetadata = {
  generation: string;
  sizeBytes: number;
  contentType: string;
  customMetadata: Record<string, string>;
  createdAt: string;
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

export function getMobileCaptureLocalVaultConfig() {
  const configuredRoot = process.env.QUIPSLY_LOCAL_CAPTURE_VAULT_ROOT?.trim();
  const configuredOrigin = process.env.QUIPSLY_LOCAL_CAPTURE_UPLOAD_ORIGIN?.trim();
  if (!configuredRoot && !configuredOrigin) return null;
  if (process.env.NODE_ENV === "production") {
    throw new Error("The local Capture vault is disabled in production.");
  }
  if (!configuredRoot || !configuredOrigin || !localDatabaseConfigured()) {
    throw new Error("Local Capture vault requires an explicit root, loopback HTTP origin, and loopback PostgreSQL database.");
  }
  const root = path.resolve(configuredRoot);
  const temporaryRoot = path.resolve(os.tmpdir());
  const relativeToTemporaryRoot = path.relative(temporaryRoot, root);
  if (!relativeToTemporaryRoot || relativeToTemporaryRoot.startsWith("..") || path.isAbsolute(relativeToTemporaryRoot)) {
    throw new Error("Local Capture vault root must be a dedicated directory below the operating-system temporary directory.");
  }
  const origin = new URL(configuredOrigin);
  if (
    origin.protocol !== "http:"
    || !loopbackHost(origin.hostname)
    || origin.username
    || origin.password
    || origin.pathname !== "/"
    || origin.search
    || origin.hash
  ) {
    throw new Error("Local Capture upload origin must be a credential-free loopback HTTP origin with no path, query, or fragment.");
  }
  return { root, origin: origin.origin, bucketName: MOBILE_CAPTURE_LOCAL_VAULT_BUCKET };
}

function confinedPath(root: string, ...segments: string[]) {
  const resolvedRoot = path.resolve(root);
  const candidate = path.resolve(resolvedRoot, ...segments);
  const relative = path.relative(resolvedRoot, candidate);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Local Capture vault path escaped its configured root.");
  }
  return candidate;
}

function manifestPath(root: string, uploadSessionId: string) {
  if (!isSafeMobileCaptureUploadSessionId(uploadSessionId)) throw new Error("Upload session ID must be a UUID.");
  return confinedPath(root, "manifests", `${uploadSessionId.toLowerCase()}.json`);
}

export function localMobileCaptureObjectPath(objectName: string) {
  const config = getMobileCaptureLocalVaultConfig();
  if (!config) return null;
  return confinedPath(config.root, "objects", objectName);
}

async function readEnvelope<T>(filePath: string): Promise<LocalManifestEnvelope<T> | null> {
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as LocalManifestEnvelope<T>;
    return typeof parsed.generation === "string" && parsed.manifest ? parsed : null;
  } catch (error: any) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function withLock<T>(lockPath: string, operation: () => Promise<T>) {
  await mkdir(path.dirname(lockPath), { recursive: true });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    let lock;
    try {
      lock = await open(lockPath, "wx", 0o600);
      try {
        return await operation();
      } finally {
        await lock.close();
        await unlink(lockPath).catch(() => undefined);
      }
    } catch (error: any) {
      if (error?.code !== "EEXIST") throw error;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }
  throw Object.assign(new Error("Local Capture vault manifest is busy."), { code: 409 });
}

export async function loadLocalMobileCaptureManifest<T>(uploadSessionId: string) {
  const config = getMobileCaptureLocalVaultConfig();
  if (!config) return null;
  return readEnvelope<T>(manifestPath(config.root, uploadSessionId));
}

export async function saveLocalMobileCaptureManifest<T>(
  uploadSessionId: string,
  manifest: T,
  ifGenerationMatch: string | number,
) {
  const config = getMobileCaptureLocalVaultConfig();
  if (!config) throw new Error("Local Capture vault is not configured.");
  const target = manifestPath(config.root, uploadSessionId);
  return withLock(`${target}.lock`, async () => {
    const existing = await readEnvelope<T>(target);
    const expected = String(ifGenerationMatch);
    if ((expected === "0" && existing) || (expected !== "0" && existing?.generation !== expected)) {
      throw Object.assign(new Error("Local Capture manifest generation precondition failed."), { code: 412 });
    }
    const generation = String(Number(existing?.generation ?? 0) + 1);
    const envelope = { generation, manifest };
    await mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(envelope), { mode: 0o600 });
    await rename(temporary, target);
    return envelope;
  });
}

export function createLocalMobileCaptureUploadCapability(uploadSessionId: string) {
  const config = getMobileCaptureLocalVaultConfig();
  if (!config) return null;
  const token = randomBytes(32).toString("base64url");
  const url = new URL(`/api/mobile/capture/uploads/local/${uploadSessionId.toLowerCase()}`, config.origin);
  url.searchParams.set("token", token);
  return { url: url.toString(), tokenSha256: createHash("sha256").update(token).digest("hex") };
}

export function localUploadCapabilityMatches(expectedSha256: string | null | undefined, suppliedToken: string | null) {
  if (!expectedSha256 || !suppliedToken) return false;
  const expected = Buffer.from(expectedSha256, "hex");
  const actual = createHash("sha256").update(suppliedToken).digest();
  return expected.byteLength === actual.byteLength && timingSafeEqual(expected, actual);
}

function metadataPath(objectPath: string) {
  return `${objectPath}.quipsly.json`;
}

export async function writeLocalMobileCaptureObject(args: {
  objectName: string;
  bytes: Buffer;
  contentType: string;
  customMetadata: Record<string, string>;
}) {
  const objectPath = localMobileCaptureObjectPath(args.objectName);
  if (!objectPath) throw new Error("Local Capture vault is not configured.");
  return withLock(`${objectPath}.lock`, async () => {
    const existing = await loadLocalMobileCaptureObject(args.objectName);
    if (existing) return existing;

    await mkdir(path.dirname(objectPath), { recursive: true });
    let handle;
    try {
      handle = await open(objectPath, "wx", 0o600);
      await handle.writeFile(args.bytes);
      await handle.sync();
    } catch (error: any) {
      if (error?.code !== "EEXIST") throw error;
      const existingBytes = await readFile(objectPath);
      const expectedSha256 = args.customMetadata.quipslyExpectedSha256;
      const existingSha256 = createHash("sha256").update(existingBytes).digest("hex");
      if (
        existingBytes.byteLength !== args.bytes.byteLength
        || !expectedSha256
        || existingSha256 !== expectedSha256
      ) {
        throw new Error("Existing local Capture object does not match the immutable upload binding.");
      }
    } finally {
      await handle?.close();
    }

    const metadata: LocalObjectMetadata = {
      generation: Date.now().toString(),
      sizeBytes: args.bytes.byteLength,
      contentType: args.contentType,
      customMetadata: args.customMetadata,
      createdAt: new Date().toISOString(),
    };
    try {
      await writeFile(metadataPath(objectPath), JSON.stringify(metadata), { mode: 0o600, flag: "wx" });
    } catch (error: any) {
      if (error?.code !== "EEXIST") throw error;
    }
    return loadLocalMobileCaptureObject(args.objectName);
  });
}

export async function loadLocalMobileCaptureObject(objectName: string) {
  const objectPath = localMobileCaptureObjectPath(objectName);
  if (!objectPath) return null;
  try {
    const [metadata, objectStat] = await Promise.all([
      readFile(metadataPath(objectPath), "utf8").then((value) => JSON.parse(value) as LocalObjectMetadata),
      stat(objectPath),
    ]);
    if (!objectStat.isFile() || objectStat.size !== metadata.sizeBytes) {
      throw new Error("Local Capture object does not match its immutable metadata receipt.");
    }
    return { ...metadata, objectPath };
  } catch (error: any) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export async function hashLocalMobileCaptureObject(objectName: string) {
  const object = await loadLocalMobileCaptureObject(objectName);
  if (!object) throw new Error("Local Capture object is missing.");
  const hash = createHash("sha256");
  let streamedBytes = 0;
  for await (const chunk of createReadStream(object.objectPath)) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    streamedBytes += bytes.byteLength;
    hash.update(bytes);
  }
  return { sha256: hash.digest("hex"), streamedBytes };
}

export async function readLocalMobileCaptureObject(objectName: string) {
  const object = await loadLocalMobileCaptureObject(objectName);
  if (!object) throw new Error("Local Capture object is missing.");
  return readFile(object.objectPath);
}
