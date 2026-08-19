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
  const originalWorkspace = process.env.QUIPSLY_LOCAL_MEDIA_WORKSPACE_ROOT;
  const originalLegacy = process.env.QUIPSLY_LOCAL_MEDIA_LEGACY_ROOTS_JSON;
  let root = "";

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "quipsly-media-roots-test-"));
    delete process.env.QUIPSLY_LOCAL_MEDIA_WORKSPACE_ROOT;
    delete process.env.QUIPSLY_LOCAL_MEDIA_LEGACY_ROOTS_JSON;
  });

  afterEach(async () => {
    if (originalWorkspace === undefined)
      delete process.env.QUIPSLY_LOCAL_MEDIA_WORKSPACE_ROOT;
    else process.env.QUIPSLY_LOCAL_MEDIA_WORKSPACE_ROOT = originalWorkspace;
    if (originalLegacy === undefined)
      delete process.env.QUIPSLY_LOCAL_MEDIA_LEGACY_ROOTS_JSON;
    else process.env.QUIPSLY_LOCAL_MEDIA_LEGACY_ROOTS_JSON = originalLegacy;
    await rm(root, { recursive: true, force: true });
  });

  it("authorizes active and legacy media roots without authorizing broad roots", async () => {
    const active = path.join(root, "active", "worker-media");
    const legacy = path.join(root, "legacy", "quipsly-media-ingest");
    const activeFile = path.join(active, "proxy.mp4");
    const legacyFile = path.join(legacy, "waveform.json");
    await mkdir(active, { recursive: true });
    await mkdir(legacy, { recursive: true });
    await writeFile(activeFile, "proxy");
    await writeFile(legacyFile, "waveform");
    process.env.QUIPSLY_LOCAL_MEDIA_WORKSPACE_ROOT = active;
    process.env.QUIPSLY_LOCAL_MEDIA_LEGACY_ROOTS_JSON = JSON.stringify([
      legacy,
      "/",
      "/Volumes",
    ]);

    expect(
      configuredLocalStudioMediaRoots(["QUIPSLY_LOCAL_MEDIA_WORKSPACE_ROOT"]),
    ).toEqual(expect.arrayContaining([active, legacy]));
    expect(
      configuredLocalStudioMediaRoots(["QUIPSLY_LOCAL_MEDIA_WORKSPACE_ROOT"]),
    ).not.toEqual(expect.arrayContaining(["/", "/Volumes"]));
    await expect(
      resolveAllowedLocalStudioMediaPath(activeFile, [
        "QUIPSLY_LOCAL_MEDIA_WORKSPACE_ROOT",
      ]),
    ).resolves.toBe(await realpath(activeFile));
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
