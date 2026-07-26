/** @jest-environment node */

import { readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

jest.mock("server-only", () => ({}));

import {
  getLocalMediaIngestRoot,
  localMediaUploadsAllowed,
  uploadMediaBuffer,
} from "./gcs";

const ORIGINAL_ENV = { ...process.env };

describe("development-only local episode media vault", () => {
  const testRoot = path.join(
    os.tmpdir(),
    `quipsly-media-upload-test-${process.pid}`,
  );

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    Reflect.set(process.env, "NODE_ENV", "test");
    process.env.DATABASE_URL =
      "postgresql://quipsly@127.0.0.1:5432/quipsly_test";
    process.env.QUIPSLY_LOCAL_MEDIA_UPLOADS = "true";
    process.env.QUIPSLY_LOCAL_MEDIA_UPLOAD_ROOT = testRoot;
    delete process.env.QUIPSLY_MEDIA_BUCKET;
    delete process.env.QUIPSLY_GCS_BUCKET;
    delete process.env.MEDIA_VAULT_BUCKET;
  });

  afterEach(async () => {
    process.env = { ...ORIGINAL_ENV };
    await rm(testRoot, { recursive: true, force: true });
  });

  it("stores exact bytes under a private temporary root", async () => {
    const bytes = Buffer.from("episode-room-local-media\n");
    const uploaded = await uploadMediaBuffer({
      objectName: "media-vault/raw/project/episode/request/clip.mp4",
      buffer: bytes,
      contentType: "video/mp4",
    });

    expect(uploaded).toMatchObject({
      bucketName: "",
      contentType: "video/mp4",
      localOnly: true,
      sizeBytes: bytes.byteLength,
    });
    expect(uploaded.objectName).toBe(
      path.join(
        testRoot,
        "media-vault/raw/project/episode/request/clip.mp4",
      ),
    );
    expect(await readFile(uploaded.objectName)).toEqual(bytes);
    expect((await stat(uploaded.objectName)).mode & 0o777).toBe(0o600);
  });

  it("fails closed for production, remote databases, and unsafe roots", () => {
    Reflect.set(process.env, "NODE_ENV", "production");
    expect(localMediaUploadsAllowed()).toBe(false);
    expect(() => getLocalMediaIngestRoot()).toThrow(
      "Local media uploads are disabled",
    );

    Reflect.set(process.env, "NODE_ENV", "test");
    process.env.DATABASE_URL =
      "postgresql://quipsly@database.example.test:5432/quipsly";
    expect(() => getLocalMediaIngestRoot()).toThrow(
      "loopback PostgreSQL database",
    );

    process.env.DATABASE_URL =
      "postgresql://quipsly@localhost:5432/quipsly_test";
    process.env.QUIPSLY_LOCAL_MEDIA_UPLOAD_ROOT = path.join(
      process.cwd(),
      "media-vault",
    );
    expect(() => getLocalMediaIngestRoot()).toThrow(
      "below the operating-system temporary directory",
    );
  });

  it("rejects traversal outside the configured local vault", async () => {
    await expect(
      uploadMediaBuffer({
        objectName: "../escape.mp4",
        buffer: Buffer.from("no"),
        contentType: "video/mp4",
      }),
    ).rejects.toThrow("escaped the authorized ingest root");
  });
});
