import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { requireCurrentLocalNestSource } from "./local-nest-source-boundary.mjs";

async function fixture({ recordedRoot = null, recordedRevision = "source-1" } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "quipsly-source-boundary-"));
  const state = path.join(root, "state");
  await mkdir(state);
  await Promise.all([
    writeFile(path.join(state, "repo-root"), `${recordedRoot || root}\n`),
    writeFile(path.join(state, "source-revision"), `${recordedRevision}\n`),
    writeFile(path.join(state, "nest-env-path"), `${path.join(root, ".env.local")}\n`),
  ]);
  return { root, state };
}

test("accepts dirty source when the running Nest is bound to the exact current closure", async () => {
  const subject = await fixture();
  const result = await requireCurrentLocalNestSource({
    repositoryRoot: subject.root,
    baseURL: "http://127.0.0.1:3012",
    stateDirectory: subject.state,
    currentSourceRevision: "source-1",
    fetchImpl: async () => ({ ok: true, status: 200 }),
  });
  assert.equal(result.sourceSha, "source-1");
});

test("rejects a stale runtime without requiring an unrelated clean worktree", async () => {
  const subject = await fixture({ recordedRevision: "old-source" });
  await assert.rejects(() => requireCurrentLocalNestSource({
    repositoryRoot: subject.root,
    baseURL: "http://127.0.0.1:3012",
    stateDirectory: subject.state,
    currentSourceRevision: "current-source",
    fetchImpl: async () => ({ ok: true, status: 200 }),
  }), /not serving the current executable source closure/);
});

test("rejects another worktree and non-loopback runtimes", async () => {
  const subject = await fixture({ recordedRoot: "/tmp/another-quipsly-worktree" });
  await assert.rejects(() => requireCurrentLocalNestSource({
    repositoryRoot: subject.root,
    baseURL: "http://127.0.0.1:3012",
    stateDirectory: subject.state,
    currentSourceRevision: "source-1",
    fetchImpl: async () => ({ ok: true, status: 200 }),
  }), /Local Nest is running from/);
  await assert.rejects(() => requireCurrentLocalNestSource({
    repositoryRoot: subject.root,
    baseURL: "https://nest.quipsly.com",
    stateDirectory: subject.state,
    currentSourceRevision: "source-1",
    fetchImpl: async () => ({ ok: true, status: 200 }),
  }), /non-loopback/);
});
