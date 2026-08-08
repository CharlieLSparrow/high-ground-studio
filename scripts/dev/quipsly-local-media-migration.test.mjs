import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertLocalMediaMigrationQuiescent,
  migrateLocalMediaRecords,
  rebindPrismaLocators,
} from "./quipsly-local-media-migration.mjs";
import {
  activateLocalMediaWorkspace,
  planLocalMediaWorkspace,
  readLocalMediaWorkspaceConfig,
} from "./quipsly-local-media-workspace.mjs";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

test("copies exact media, preserves its source, and emits an activation receipt", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "quipsly-migration-test-"));
  const legacy = path.join(root, "legacy");
  const workspace = path.join(root, "mounted", "Quipsly Media");
  const configPath = path.join(root, "config", "workspace.json");
  const source = path.join(legacy, "camera", "VID_001.insv");
  const bytes = Buffer.from("immutable camera bytes");
  try {
    await mkdir(path.dirname(source), { recursive: true });
    await writeFile(source, bytes);
    await planLocalMediaWorkspace({
      workspaceRoot: workspace,
      legacyReadRoots: [legacy],
      configPath,
    });
    const receipt = await migrateLocalMediaRecords({
      records: [
        {
          table: "sourceReplica",
          id: "replica-1",
          locator: source,
          contentSha256: sha256(bytes),
          sizeBytes: BigInt(bytes.length),
        },
      ],
      configPath,
      reserveBytes: 0n,
      now: new Date("2026-08-08T21:00:00.000Z"),
    });
    assert.equal(receipt.verification, "complete");
    assert.equal(receipt.sourceBytesPreserved, true);
    assert.equal(receipt.recordCount, 1);
    assert.equal(receipt.copiedBytes, String(bytes.length));
    assert.deepEqual(await readFile(source), bytes);
    assert.deepEqual(await readFile(receipt.mappings[0].targetLocator), bytes);
    const second = await migrateLocalMediaRecords({
      records: [
        {
          table: "sourceReplica",
          id: "replica-1",
          locator: source,
          contentSha256: sha256(bytes),
          sizeBytes: BigInt(bytes.length),
        },
      ],
      configPath,
      reserveBytes: 0n,
    });
    assert.equal(second.copiedBytes, "0");
    await activateLocalMediaWorkspace({ receipt, configPath });
    assert.equal(
      (await readLocalMediaWorkspaceConfig({ configPath })).status,
      "active",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects an escaped source and a hash mismatch before copying", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "quipsly-migration-test-"));
  const legacy = path.join(root, "legacy");
  const workspace = path.join(root, "mounted", "Quipsly Media");
  const configPath = path.join(root, "config", "workspace.json");
  const outside = path.join(root, "outside.mov");
  const inside = path.join(legacy, "inside.mov");
  try {
    await mkdir(legacy, { recursive: true });
    await writeFile(outside, "outside");
    await writeFile(inside, "inside");
    await planLocalMediaWorkspace({
      workspaceRoot: workspace,
      legacyReadRoots: [legacy],
      configPath,
    });
    await assert.rejects(
      migrateLocalMediaRecords({
        records: [
          {
            table: "derivative",
            id: "escaped",
            locator: outside,
            contentSha256: sha256("outside"),
            sizeBytes: 7n,
          },
        ],
        configPath,
        reserveBytes: 0n,
      }),
      /outside the planned legacy roots/i,
    );
    await assert.rejects(
      migrateLocalMediaRecords({
        records: [
          {
            table: "derivative",
            id: "bad-hash",
            locator: inside,
            contentSha256: "f".repeat(64),
            sizeBytes: 6n,
          },
        ],
        configPath,
        reserveBytes: 0n,
      }),
      /SHA-256 mismatch/i,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rebinds canonical locators transactionally and tolerates a verified rerun", async () => {
  const calls = [];
  const model = {
    updateMany: async (value) => {
      calls.push(value);
      return { count: 1 };
    },
  };
  const prisma = {
    $transaction: async (operation) =>
      operation({
        studioMediaSourceReplica: model,
        studioMediaDerivative: model,
      }),
  };
  const receipt = {
    schema: "quipsly-local-media-workspace-migration-v1",
    mappings: [
      {
        table: "derivative",
        id: "derivative-1",
        priorLocator: "/old/file.mp4",
        targetLocator: "/new/file.mp4",
        contentSha256: "a".repeat(64),
        sizeBytes: "42",
      },
    ],
  };
  assert.equal(await rebindPrismaLocators(prisma, receipt), 1);
  assert.deepEqual(calls[0].where.locator.in, [
    "/old/file.mp4",
    "/new/file.mp4",
  ]);
  assert.equal(calls[0].data.locator, "/new/file.mp4");
});

test("refuses migration while the local Nest can observe canonical locators", async () => {
  await assert.rejects(
    assertLocalMediaMigrationQuiescent({
      isNestPortOpen: async () => true,
      isMediaWorkerRunning: async () => false,
    }),
    /stop the Quipsly local lifecycle/i,
  );
  await assert.doesNotReject(
    assertLocalMediaMigrationQuiescent({
      isNestPortOpen: async () => false,
      isMediaWorkerRunning: async () => false,
    }),
  );
  await assert.rejects(
    assertLocalMediaMigrationQuiescent({
      isNestPortOpen: async () => false,
      isMediaWorkerRunning: async () => true,
    }),
    /stop the Quipsly local lifecycle/i,
  );
});
