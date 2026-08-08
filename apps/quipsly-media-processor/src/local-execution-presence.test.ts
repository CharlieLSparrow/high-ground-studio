import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import pg from "pg";

import {
  LocalExecutionPresence,
  resolveLocalExecutionIdentity,
} from "./local-execution-presence.js";

test("local execution presence publishes safe storage capacity without its path", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "quipsly-presence-"));
  try {
    const captured: Array<Record<string, unknown>> = [];
    const pool = {
      query: async (input: { values?: unknown[] }) => {
        captured.push(
          JSON.parse(String(input.values?.[3] ?? "{}")) as Record<
            string,
            unknown
          >,
        );
        return { rowCount: 1 };
      },
    } as unknown as InstanceType<typeof pg.Pool>;
    const identity = await resolveLocalExecutionIdentity(root);
    const presence = new LocalExecutionPresence(pool, {
      executionId: "execution_12345678",
      buildId: "build-1",
      localMediaRoot: root,
      identity,
      workspaceMode: "temporary",
      storageReserveBytes: 0,
    });
    await presence.heartbeat(new Date("2026-08-07T20:00:00.000Z"), true);
    const capabilities = captured[0];
    assert.ok(capabilities);
    const storage = capabilities.storage as Record<string, unknown>;
    assert.equal(storage.status, "measured");
    assert.equal(storage.pathWithheld, true);
    assert.equal(storage.workspaceMode, "temporary");
    assert.equal(storage.scopeId, identity.storageScopeId);
    assert.match(identity.storageScopeId, /^storage_scope_[0-9a-f]{40}$/);
    assert.equal(typeof storage.safeAvailableBytes, "number");
    assert.equal(JSON.stringify(capabilities).includes(root), false);
    assert.ok(
      (capabilities.jobTypes as string[]).includes(
        "google-drive-source-materialization",
      ),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("execution identity is stable for one workspace and distinct across workspaces", async () => {
  const firstRoot = await mkdtemp(path.join(tmpdir(), "quipsly-scope-a-"));
  const secondRoot = await mkdtemp(path.join(tmpdir(), "quipsly-scope-b-"));
  try {
    const [first, repeated, second] = await Promise.all([
      resolveLocalExecutionIdentity(firstRoot),
      resolveLocalExecutionIdentity(firstRoot),
      resolveLocalExecutionIdentity(secondRoot),
    ]);
    assert.deepEqual(first, repeated);
    assert.equal(first.nodeId, second.nodeId);
    assert.notEqual(first.storageScopeId, second.storageScopeId);
    assert.equal(JSON.stringify(first).includes(firstRoot), false);
    assert.equal(JSON.stringify(second).includes(secondRoot), false);
  } finally {
    await Promise.all([
      rm(firstRoot, { recursive: true, force: true }),
      rm(secondRoot, { recursive: true, force: true }),
    ]);
  }
});
