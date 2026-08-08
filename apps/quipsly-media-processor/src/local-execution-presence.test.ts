import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import pg from "pg";

import { LocalExecutionPresence } from "./local-execution-presence.js";

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
    const presence = new LocalExecutionPresence(pool, {
      executionId: "execution_12345678",
      buildId: "build-1",
      localMediaRoot: root,
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
