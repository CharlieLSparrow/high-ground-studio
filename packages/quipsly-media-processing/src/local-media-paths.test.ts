import assert from "node:assert/strict";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { mkdtemp, rm, symlink, realpath } from "node:fs/promises";
import { dedicatedLocalMediaRoot, defaultLocalMediaRoot, prepareLocalMediaRoot } from "./local-media-paths.js";

test("original media defaults to persistent application data", () => {
  const root = defaultLocalMediaRoot();
  assert.equal(root, path.join(homedir(), "Library", "Application Support", "Quipsly", "local-media"));
  assert.equal(dedicatedLocalMediaRoot(root), root);
  assert.ok(!root.startsWith(`${tmpdir()}${path.sep}`));
});

test("explicit workspaces and isolated temporary test roots remain supported", () => {
  for (const root of ["/Volumes/Media/Quipsly", path.join(tmpdir(), "quipsly-test-vault")]) {
    assert.equal(dedicatedLocalMediaRoot(root), path.resolve(root));
  }
});

test("broad filesystem roots and relative paths cannot become media vaults", () => {
  for (const root of ["/", homedir(), tmpdir(), "/Users", "/Volumes", "relative", ""]) {
    assert.throws(() => dedicatedLocalMediaRoot(root), /dedicated directory/);
  }
});

test("workers create dedicated directories and reject symlinks to broad roots", async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), "quipsly-root-contract-"));
  try {
    const output = path.join(fixture, "durable workspace");
    assert.equal(await prepareLocalMediaRoot(output), await realpath(output));
    const link = path.join(fixture, "broad-link");
    await symlink(homedir(), link);
    await assert.rejects(prepareLocalMediaRoot(link), /dedicated directory/);
  } finally { await rm(fixture, {recursive:true, force:true}); }
});
