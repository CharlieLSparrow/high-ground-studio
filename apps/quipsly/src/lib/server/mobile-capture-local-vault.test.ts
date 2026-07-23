/** @jest-environment node */

import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

jest.mock("server-only", () => ({}));

import {
  createLocalMobileCaptureUploadCapability,
  getMobileCaptureLocalVaultConfig,
  hashLocalMobileCaptureObject,
  loadLocalMobileCaptureManifest,
  loadLocalMobileCaptureObject,
  localUploadCapabilityMatches,
  readLocalMobileCaptureObject,
  saveLocalMobileCaptureManifest,
  writeLocalMobileCaptureObject,
} from "./mobile-capture-local-vault";

const ORIGINAL_ENV = { ...process.env };
const UPLOAD_SESSION_ID = "9d8c0c81-847f-4e16-96d0-26b494c890aa";

describe("development-only local Capture vault", () => {
  let temporaryDirectory: string;

  beforeEach(async () => {
    process.env = { ...ORIGINAL_ENV };
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "quipsly-capture-vault-test-"));
    Reflect.set(process.env, "NODE_ENV", "test");
    process.env.DATABASE_URL = "postgresql://quipsly@127.0.0.1:5432/quipsly_test";
    process.env.QUIPSLY_LOCAL_CAPTURE_VAULT_ROOT = path.join(temporaryDirectory, "vault");
    process.env.QUIPSLY_LOCAL_CAPTURE_UPLOAD_ORIGIN = "http://127.0.0.1:3012";
  });

  afterEach(async () => {
    process.env = { ...ORIGINAL_ENV };
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it("refuses production, non-loopback databases, and roots outside the OS temporary directory", () => {
    Reflect.set(process.env, "NODE_ENV", "production");
    expect(() => getMobileCaptureLocalVaultConfig()).toThrow("disabled in production");

    Reflect.set(process.env, "NODE_ENV", "test");
    process.env.DATABASE_URL = "postgresql://quipsly@example.com:5432/quipsly";
    expect(() => getMobileCaptureLocalVaultConfig()).toThrow("loopback PostgreSQL database");

    process.env.DATABASE_URL = "postgresql://quipsly@localhost:5432/quipsly_test";
    process.env.QUIPSLY_LOCAL_CAPTURE_VAULT_ROOT = path.join(process.cwd(), "capture-vault");
    expect(() => getMobileCaptureLocalVaultConfig()).toThrow("below the operating-system temporary directory");
  });

  it("issues a secret same-origin capability and stores only its SHA-256 binding", () => {
    const capability = createLocalMobileCaptureUploadCapability(UPLOAD_SESSION_ID);
    expect(capability).not.toBeNull();
    const url = new URL(capability!.url);
    expect(url.origin).toBe("http://127.0.0.1:3012");
    expect(url.pathname).toBe(`/api/mobile/capture/uploads/local/${UPLOAD_SESSION_ID}`);
    const token = url.searchParams.get("token");
    expect(token).toBeTruthy();
    expect(capability!.tokenSha256).not.toBe(token);
    expect(localUploadCapabilityMatches(capability!.tokenSha256, token)).toBe(true);
    expect(localUploadCapabilityMatches(capability!.tokenSha256, `${token}x`)).toBe(false);
  });

  it("uses generation preconditions for durable local manifests", async () => {
    const first = await saveLocalMobileCaptureManifest(UPLOAD_SESSION_ID, { status: "uploading" }, 0);
    expect(first.generation).toBe("1");
    await expect(saveLocalMobileCaptureManifest(UPLOAD_SESSION_ID, { status: "duplicate" }, 0))
      .rejects.toMatchObject({ code: 412 });

    const second = await saveLocalMobileCaptureManifest(UPLOAD_SESSION_ID, { status: "verified" }, first.generation);
    expect(second.generation).toBe("2");
    expect(await loadLocalMobileCaptureManifest(UPLOAD_SESSION_ID)).toEqual(second);
  });

  it("writes immutable source bytes, receipts their binding, and re-streams SHA-256", async () => {
    const bytes = Buffer.from("Quipsly local Capture source truth\n");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const objectName = `recordings/source/mobile/${UPLOAD_SESSION_ID}/capture.m4a`;
    const customMetadata = {
      quipslyExpectedSha256: sha256,
      quipslyUploadSessionId: UPLOAD_SESSION_ID,
    };

    const written = await writeLocalMobileCaptureObject({
      objectName,
      bytes,
      contentType: "audio/m4a",
      customMetadata,
    });
    expect(written).toMatchObject({
      sizeBytes: bytes.byteLength,
      contentType: "audio/m4a",
      customMetadata,
    });
    expect(await loadLocalMobileCaptureObject(objectName)).toMatchObject({ sizeBytes: bytes.byteLength });
    expect(await readLocalMobileCaptureObject(objectName)).toEqual(bytes);
    expect(await hashLocalMobileCaptureObject(objectName)).toEqual({ sha256, streamedBytes: bytes.byteLength });

    const replay = await writeLocalMobileCaptureObject({
      objectName,
      bytes,
      contentType: "audio/m4a",
      customMetadata,
    });
    expect(replay?.generation).toBe(written?.generation);
  });
});
