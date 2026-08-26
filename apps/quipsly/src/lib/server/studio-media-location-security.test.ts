/** @jest-environment node */

import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  classifyLocalStudioMediaPath,
  configuredLocalStudioMediaRoots,
  resolveAllowedLocalStudioMediaPath,
} from "./studio-media-location-security";

describe("local media workspace authorization", () => {
  const originalUploadRoot = process.env.QUIPSLY_LOCAL_MEDIA_UPLOAD_ROOT;
  const originalWorkspace = process.env.QUIPSLY_LOCAL_MEDIA_WORKSPACE_ROOT;
  const originalCaptureVault = process.env.QUIPSLY_LOCAL_CAPTURE_VAULT_ROOT;
  const originalLegacy = process.env.QUIPSLY_LOCAL_MEDIA_LEGACY_ROOTS_JSON;
  let root = "";

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "quipsly-media-roots-test-"));
    delete process.env.QUIPSLY_LOCAL_MEDIA_UPLOAD_ROOT;
    delete process.env.QUIPSLY_LOCAL_MEDIA_WORKSPACE_ROOT;
    delete process.env.QUIPSLY_LOCAL_CAPTURE_VAULT_ROOT;
    delete process.env.QUIPSLY_LOCAL_MEDIA_LEGACY_ROOTS_JSON;
  });

  afterEach(async () => {
    if (originalUploadRoot === undefined)
      delete process.env.QUIPSLY_LOCAL_MEDIA_UPLOAD_ROOT;
    else process.env.QUIPSLY_LOCAL_MEDIA_UPLOAD_ROOT = originalUploadRoot;
    if (originalWorkspace === undefined)
      delete process.env.QUIPSLY_LOCAL_MEDIA_WORKSPACE_ROOT;
    else process.env.QUIPSLY_LOCAL_MEDIA_WORKSPACE_ROOT = originalWorkspace;
    if (originalCaptureVault === undefined)
      delete process.env.QUIPSLY_LOCAL_CAPTURE_VAULT_ROOT;
    else process.env.QUIPSLY_LOCAL_CAPTURE_VAULT_ROOT = originalCaptureVault;
    if (originalLegacy === undefined)
      delete process.env.QUIPSLY_LOCAL_MEDIA_LEGACY_ROOTS_JSON;
    else process.env.QUIPSLY_LOCAL_MEDIA_LEGACY_ROOTS_JSON = originalLegacy;
    await rm(root, { recursive: true, force: true });
  });

  it("authorizes active, Capture, and legacy media roots without authorizing broad roots", async () => {
    const active = path.join(root, "active", "worker-media");
    const capture = path.join(root, "active", "capture-vault");
    const legacy = path.join(root, "legacy", "quipsly-media-ingest");
    const activeFile = path.join(active, "proxy.mp4");
    const captureFile = path.join(capture, "participant.webm");
    const legacyFile = path.join(legacy, "waveform.json");
    await mkdir(active, { recursive: true });
    await mkdir(capture, { recursive: true });
    await mkdir(legacy, { recursive: true });
    await writeFile(activeFile, "proxy");
    await writeFile(captureFile, "participant");
    await writeFile(legacyFile, "waveform");
    process.env.QUIPSLY_LOCAL_MEDIA_WORKSPACE_ROOT = active;
    process.env.QUIPSLY_LOCAL_CAPTURE_VAULT_ROOT = capture;
    process.env.QUIPSLY_LOCAL_MEDIA_LEGACY_ROOTS_JSON = JSON.stringify([
      legacy,
      "/",
      "/Volumes",
    ]);

    expect(
      configuredLocalStudioMediaRoots(),
    ).toEqual(expect.arrayContaining([active, capture, legacy]));
    expect(
      configuredLocalStudioMediaRoots(["QUIPSLY_LOCAL_MEDIA_WORKSPACE_ROOT"]),
    ).not.toEqual(expect.arrayContaining(["/", "/Volumes"]));
    await expect(
      resolveAllowedLocalStudioMediaPath(activeFile),
    ).resolves.toBe(await realpath(activeFile));
    await expect(resolveAllowedLocalStudioMediaPath(captureFile)).resolves.toBe(
      await realpath(captureFile),
    );
    await expect(resolveAllowedLocalStudioMediaPath(legacyFile)).resolves.toBe(
      await realpath(legacyFile),
    );
  });

  it("denies a symlink escape and malformed legacy JSON", async () => {
    const active = path.join(root, "active", "worker-media");
    const outside = path.join(root, "outside.mov");
    const linked = path.join(active, "linked.mov");
    await mkdir(active, { recursive: true });
    await writeFile(outside, "outside");
    await symlink(outside, linked);
    process.env.QUIPSLY_LOCAL_MEDIA_WORKSPACE_ROOT = active;
    process.env.QUIPSLY_LOCAL_MEDIA_LEGACY_ROOTS_JSON = "not-json";

    await expect(
      resolveAllowedLocalStudioMediaPath(linked, [
        "QUIPSLY_LOCAL_MEDIA_WORKSPACE_ROOT",
      ]),
    ).resolves.toBeNull();
  });

  it("distinguishes missing retained media from rejected paths", async () => {
    const missing = path.join(root, "missing", "retained.wav");

    await expect(classifyLocalStudioMediaPath(missing)).resolves.toEqual({
      kind: "missing",
    });
    await expect(
      classifyLocalStudioMediaPath("relative/retained.wav"),
    ).resolves.toEqual({ kind: "rejected" });
  });
});
