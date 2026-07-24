/** @jest-environment node */

import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { getMediaBucket } from "@/lib/server/gcs";

import {
  MOBILE_CAPTURE_LOCAL_VAULT_BUCKET,
  readMobileCaptureObjectBytes,
} from "./mobile-capture-object-reader";

jest.mock("@/lib/server/gcs", () => ({ getMediaBucket: jest.fn() }));

describe("immutable mobile Capture object reader", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalVaultRoot = process.env.QUIPSLY_LOCAL_CAPTURE_VAULT_ROOT;
  let root = "";

  beforeEach(async () => {
    jest.clearAllMocks();
    root = await mkdtemp(path.join(os.tmpdir(), "quipsly-object-reader-"));
    process.env.DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:5432/quipsly";
    process.env.QUIPSLY_LOCAL_CAPTURE_VAULT_ROOT = root;
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    if (originalVaultRoot === undefined) delete process.env.QUIPSLY_LOCAL_CAPTURE_VAULT_ROOT;
    else process.env.QUIPSLY_LOCAL_CAPTURE_VAULT_ROOT = originalVaultRoot;
  });

  it("reads a confined local object only when size and hash receipts match", async () => {
    const objectName = "capture/user/room/take.m4a";
    const objectPath = path.join(root, "objects", objectName);
    const bytes = Buffer.from("immutable local capture");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    await mkdir(path.dirname(objectPath), { recursive: true });
    await writeFile(objectPath, bytes);
    await writeFile(`${objectPath}.quipsly.json`, JSON.stringify({
      sizeBytes: bytes.byteLength,
      customMetadata: { quipslyExpectedSha256: sha256 },
    }));

    await expect(readMobileCaptureObjectBytes({
      bucketName: MOBILE_CAPTURE_LOCAL_VAULT_BUCKET,
      objectName,
      expectedByteSize: bytes.byteLength,
      expectedSha256: sha256,
      maxBytes: 1024,
    })).resolves.toEqual(bytes);
  });

  it("rejects local traversal and a tampered immutable source", async () => {
    await expect(readMobileCaptureObjectBytes({
      bucketName: MOBILE_CAPTURE_LOCAL_VAULT_BUCKET,
      objectName: "../outside.m4a",
      maxBytes: 1024,
    })).rejects.toThrow(/escaped/i);

    const objectName = "capture/tampered.m4a";
    const objectPath = path.join(root, "objects", objectName);
    await mkdir(path.dirname(objectPath), { recursive: true });
    await writeFile(objectPath, "changed");
    await writeFile(`${objectPath}.quipsly.json`, JSON.stringify({
      sizeBytes: 7,
      customMetadata: { quipslyExpectedSha256: "0".repeat(64) },
    }));

    await expect(readMobileCaptureObjectBytes({
      bucketName: MOBILE_CAPTURE_LOCAL_VAULT_BUCKET,
      objectName,
      maxBytes: 1024,
    })).rejects.toThrow(/hash/i);
  });

  it("checks remote metadata before downloading a GCS object", async () => {
    const download = jest.fn();
    const getMetadata = jest.fn().mockResolvedValue([{ size: "2048", metadata: {} }]);
    jest.mocked(getMediaBucket).mockReturnValue({
      file: jest.fn(() => ({ getMetadata, download })),
    } as any);

    await expect(readMobileCaptureObjectBytes({
      bucketName: "capture-production",
      objectName: "raw/take.m4a",
      expectedByteSize: 2048,
      maxBytes: 1024,
    })).rejects.toThrow(/too large/i);
    expect(download).not.toHaveBeenCalled();
  });
});
