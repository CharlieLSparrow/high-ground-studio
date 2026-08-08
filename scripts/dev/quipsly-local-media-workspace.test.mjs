import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  activateLocalMediaWorkspace,
  planLocalMediaWorkspace,
  readLocalMediaWorkspaceConfig,
} from "./quipsly-local-media-workspace.mjs";

function migrationReceipt(targetWorkerMediaRoot) {
  const mappings = [];
  return {
    schema: "quipsly-local-media-workspace-migration-v1",
    targetWorkerMediaRoot,
    verification: "complete",
    sourceBytesPreserved: true,
    migratedAt: "2026-08-08T20:00:00.000Z",
    recordCount: 0,
    copiedBytes: "0",
    manifestSha256: createHash("sha256")
      .update(JSON.stringify(mappings))
      .digest("hex"),
    mappings,
  };
}

test("plans but does not activate a dedicated workspace without a migration receipt", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "quipsly-workspace-test-"));
  const configPath = path.join(root, "config", "workspace.json");
  const workspaceRoot = path.join(root, "dedicated", "Quipsly Media");
  try {
    const planned = await planLocalMediaWorkspace({
      workspaceRoot,
      legacyReadRoots: [path.join(root, "legacy", "quipsly-media-ingest")],
      configPath,
      now: new Date("2026-08-08T20:00:00.000Z"),
    });
    assert.equal(planned.status, "planned");
    assert.equal(
      planned.workerMediaRoot,
      path.join(workspaceRoot, "worker-media"),
    );
    assert.equal(
      planned.spatialVaultRoot,
      path.join(workspaceRoot, "spatial-vault"),
    );
    assert.deepEqual(planned.legacyReadRoots, [
      path.join(root, "legacy", "quipsly-media-ingest"),
    ]);
    assert.ok(BigInt(planned.storage.availableBytes) > 0n);
    await assert.rejects(
      activateLocalMediaWorkspace({ configPath, receipt: null }),
      /migration receipt/i,
    );
    const onDisk = JSON.parse(await readFile(configPath, "utf8"));
    assert.equal(onDisk.status, "planned");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("activates only the exact mounted target and retains the old root for reads", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "quipsly-workspace-test-"));
  const configPath = path.join(root, "config", "workspace.json");
  const first = path.join(root, "first", "Quipsly Media");
  const second = path.join(root, "second", "Quipsly Media");
  try {
    const initial = await planLocalMediaWorkspace({
      workspaceRoot: first,
      configPath,
    });
    await activateLocalMediaWorkspace({
      configPath,
      receipt: migrationReceipt(initial.workerMediaRoot),
    });
    const replacement = await planLocalMediaWorkspace({
      workspaceRoot: second,
      configPath,
    });
    assert.deepEqual(replacement.legacyReadRoots, [initial.workerMediaRoot]);
    const active = await activateLocalMediaWorkspace({
      configPath,
      receipt: migrationReceipt(replacement.workerMediaRoot),
    });
    assert.equal(active.status, "active");
    assert.match(active.activationReceiptSha256, /^[a-f0-9]{64}$/);
    assert.deepEqual(active.legacyReadRoots, [initial.workerMediaRoot]);
    assert.deepEqual(
      await readLocalMediaWorkspaceConfig({ configPath, requireMounted: true }),
      active,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects broad roots and an unavailable active volume", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "quipsly-workspace-test-"));
  const configPath = path.join(root, "config", "workspace.json");
  try {
    await assert.rejects(
      planLocalMediaWorkspace({ workspaceRoot: "/", configPath }),
      /dedicated Quipsly folder/i,
    );
    await assert.rejects(
      planLocalMediaWorkspace({
        workspaceRoot: path.join(root, "nested", "Quipsly Media"),
        legacyReadRoots: [path.join(root, "nested")],
        configPath,
      }),
      /must not contain/i,
    );
    const planned = await planLocalMediaWorkspace({
      workspaceRoot: path.join(root, "removable", "Quipsly Media"),
      configPath,
    });
    await activateLocalMediaWorkspace({
      configPath,
      receipt: migrationReceipt(planned.workerMediaRoot),
    });
    await rm(path.join(root, "removable"), { recursive: true, force: true });
    await assert.rejects(
      readLocalMediaWorkspaceConfig({ configPath, requireMounted: true }),
      /unavailable/i,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a missing planned volume stays inert until activation", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "quipsly-workspace-test-"));
  const configPath = path.join(root, "config", "workspace.json");
  const workspaceRoot = path.join(root, "removable", "Quipsly Media");
  try {
    await planLocalMediaWorkspace({ workspaceRoot, configPath });
    await rm(path.join(root, "removable"), { recursive: true, force: true });
    const config = await readLocalMediaWorkspaceConfig({ configPath });
    assert.equal(config.status, "planned");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
