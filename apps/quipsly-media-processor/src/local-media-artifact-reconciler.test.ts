import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
import test from "node:test";

import {
  inspectLocalMediaArtifact,
  LocalMediaArtifactReconciler,
} from "./local-media-artifact-reconciler.js";

const checkedAt = new Date("2026-08-08T18:45:00.000Z");

async function withWorkspace(
  run: (fixture: {
    root: string;
    file: string;
    bytes: Buffer;
  }) => Promise<void>,
) {
  const root = await mkdtemp(path.join(tmpdir(), "quipsly-reconcile-"));
  const file = path.join(root, "source-cache", "segment.lrv");
  const bytes = Buffer.from("immutable camera companion bytes");
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, bytes);
  try {
    await run({ root, file, bytes });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function sha256(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

test("reports a size-matched local artifact as available without an expensive hash", async () => {
  await withWorkspace(async ({ root, file, bytes }) => {
    const result = await inspectLocalMediaArtifact({
      localMediaRoot: root,
      locator: file,
      expectedSizeBytes: bytes.length,
      expectedSha256: sha256(bytes),
      verifyContent: false,
      checkedAt,
    });
    assert.deepEqual(result, {
      state: "ready",
      reason: "available",
      observedSizeBytes: bytes.length,
      observedSha256: null,
      checkedAt,
      contentVerifiedAt: null,
    });
  });
});

test("hash-verifies restored bytes before declaring them ready", async () => {
  await withWorkspace(async ({ root, file, bytes }) => {
    const result = await inspectLocalMediaArtifact({
      localMediaRoot: root,
      locator: file,
      expectedSizeBytes: bytes.length,
      expectedSha256: sha256(bytes),
      verifyContent: true,
      checkedAt,
    });
    assert.equal(result.state, "ready");
    assert.equal(result.observedSha256, sha256(bytes));
    assert.equal(result.contentVerifiedAt, checkedAt);
  });
});

test("detects reclaimed files and truncated placeholders", async () => {
  await withWorkspace(async ({ root, file, bytes }) => {
    await rm(file);
    const missing = await inspectLocalMediaArtifact({
      localMediaRoot: root,
      locator: file,
      expectedSizeBytes: bytes.length,
      expectedSha256: sha256(bytes),
      verifyContent: false,
      checkedAt,
    });
    assert.equal(missing.state, "missing");
    assert.equal(missing.reason, "file-missing");

    await writeFile(file, Buffer.alloc(0));
    const truncated = await inspectLocalMediaArtifact({
      localMediaRoot: root,
      locator: file,
      expectedSizeBytes: bytes.length,
      expectedSha256: sha256(bytes),
      verifyContent: false,
      checkedAt,
    });
    assert.equal(truncated.state, "invalid");
    assert.equal(truncated.reason, "size-mismatch");
    assert.equal(truncated.observedSizeBytes, 0);
  });
});

test("rejects paths outside authorized local media roots", async () => {
  await withWorkspace(async ({ root, bytes }) => {
    const outside = path.join(path.dirname(root), "not-owned-by-quipsly.lrv");
    await writeFile(outside, bytes);
    try {
      const result = await inspectLocalMediaArtifact({
        localMediaRoot: root,
        locator: outside,
        expectedSizeBytes: bytes.length,
        expectedSha256: sha256(bytes),
        verifyContent: true,
        checkedAt,
      });
      assert.equal(result.state, "invalid");
      assert.equal(result.reason, "path-outside-workspace");
    } finally {
      await rm(outside, { force: true });
    }
  });
});

test("accepts an absolute locator through the workspace root's real path", async () => {
  await withWorkspace(async ({ root, file, bytes }) => {
    const alias = `${root}-alias`;
    await symlink(root, alias);
    try {
      const result = await inspectLocalMediaArtifact({
        localMediaRoot: alias,
        locator: await realpath(file),
        expectedSizeBytes: bytes.length,
        expectedSha256: sha256(bytes),
        verifyContent: false,
        checkedAt,
      });
      assert.equal(result.state, "ready");
    } finally {
      await rm(alias, { force: true });
    }
  });
});

test("detects same-size byte corruption", async () => {
  await withWorkspace(async ({ root, file, bytes }) => {
    await writeFile(file, Buffer.alloc(bytes.length, 42));
    const result = await inspectLocalMediaArtifact({
      localMediaRoot: root,
      locator: file,
      expectedSizeBytes: bytes.length,
      expectedSha256: sha256(bytes),
      verifyContent: true,
      checkedAt,
    });
    assert.equal(result.state, "invalid");
    assert.equal(result.reason, "checksum-mismatch");
  });
});

test("reconciliation selects replicas only from its own executor storage scope", async () => {
  const queries: Array<{ text: string; values?: unknown[] }> = [];
  const pool = {
    query: async (query: { text: string; values?: unknown[] }) => {
      queries.push(query);
      return { rows: [] };
    },
  };
  const reconciler = new LocalMediaArtifactReconciler(pool as never, {
    localMediaRoot: "/tmp/quipsly-reconciler-scope-test",
    custodianNodeId: "execution_worker_12345678",
    storageScopeId: "storage_scope_12345678",
  });

  await reconciler.maybeRun(true);

  assert.match(queries[0]?.text ?? "", /"custodianNodeId"=\$2/);
  assert.match(queries[0]?.text ?? "", /"storageScopeId"=\$3/);
  assert.deepEqual(queries[0]?.values, [
    50,
    "execution_worker_12345678",
    "storage_scope_12345678",
  ]);
});
