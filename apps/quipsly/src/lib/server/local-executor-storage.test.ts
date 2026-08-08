/** @jest-environment node */

import { mkdtemp, realpath, rm, stat } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import path from "node:path";

import {
  localExecutorHostName,
  localExecutorNodeId,
  localExecutorStorageScopeId,
} from "@high-ground/quipsly-media-processing/local-executor-identity";

import {
  localExecutorStorageShortfall,
  publicLocalExecutorStorage,
  readCurrentLocalExecutorIdentity,
  readLocalExecutorTarget,
} from "./local-executor-storage";

describe("local executor storage projection", () => {
  it("publishes capacity and durability without exposing the local path", () => {
    const storage = publicLocalExecutorStorage({
      capabilities: {
        executorKind: "local-mac",
        storage: {
          schema: "quipsly-local-media-storage-v1",
          status: "measured",
          availableBytes: 6_770_709_120,
          reserveBytes: 5_368_709_120,
          safeAvailableBytes: 1_402_000_000,
          measuredAt: "2026-08-08T20:00:00.000Z",
          workspaceMode: "temporary",
          pathWithheld: true,
          path: "/private/var/secret/quipsly-media-ingest",
        },
      },
      lastHeartbeatAt: new Date("2026-08-08T20:00:00.000Z"),
    });

    expect(storage).toEqual({
      status: "measured",
      availableBytes: "6770709120",
      reserveBytes: "5368709120",
      safeAvailableBytes: "1402000000",
      measuredAt: "2026-08-08T20:00:00.000Z",
      workspaceMode: "temporary",
      localPathWithheld: true,
    });
    expect(JSON.stringify(storage)).not.toContain("/private/var/secret");
    expect(localExecutorStorageShortfall(storage!, 1_900_000_000n)).toBe(
      498_000_000n,
    );
  });

  it("selects one exact executor and opaque storage scope", async () => {
    const target = await readLocalExecutorTarget({
      agentNode: {
        findMany: jest.fn(async () => [
          {
            id: "execution_worker_12345678",
            hostName: "quipsly-media-worker:Wall-E",
            lastHeartbeatAt: new Date("2026-08-08T20:00:00.000Z"),
            capabilities: {
              executorKind: "local-mac",
              storage: {
                schema: "quipsly-local-media-storage-v1",
                status: "measured",
                availableBytes: 20_000,
                reserveBytes: 5_000,
                safeAvailableBytes: 15_000,
                measuredAt: "2026-08-08T20:00:00.000Z",
                workspaceMode: "durable",
                scopeId: "storage_scope_12345678",
              },
            },
          },
        ]),
      },
    } as never);

    expect(target).toMatchObject({
      nodeId: "execution_worker_12345678",
      hostName: "quipsly-media-worker:Wall-E",
      storageScopeId: "storage_scope_12345678",
      storage: { safeAvailableBytes: "15000", workspaceMode: "durable" },
    });
    expect(JSON.stringify(target)).not.toContain("/Volumes/");
  });

  it("treats legacy heartbeats as unknown rather than claiming durability", () => {
    const storage = publicLocalExecutorStorage({
      capabilities: {
        executorKind: "local-mac",
        storage: {
          schema: "quipsly-local-media-storage-v1",
          status: "measured",
          availableBytes: 10_000,
          reserveBytes: 1_000,
          safeAvailableBytes: 9_000,
        },
      },
      lastHeartbeatAt: new Date("2026-08-08T20:00:00.000Z"),
    });

    expect(storage).toMatchObject({
      status: "measured",
      workspaceMode: "unknown",
      measuredAt: "2026-08-08T20:00:00.000Z",
    });
  });

  it("honors an explicitly selected online executor", async () => {
    const node = (id: string, scopeId: string) => ({
      id,
      hostName: `quipsly-media-worker:${id}`,
      lastHeartbeatAt: new Date("2026-08-08T20:00:00.000Z"),
      capabilities: {
        executorKind: "local-mac",
        storage: {
          schema: "quipsly-local-media-storage-v1",
          status: "measured",
          availableBytes: 20_000,
          reserveBytes: 5_000,
          safeAvailableBytes: 15_000,
          measuredAt: "2026-08-08T20:00:00.000Z",
          workspaceMode: "durable",
          scopeId,
        },
      },
    });
    const prisma = {
      agentNode: {
        findMany: jest.fn(async () => [
          node("execution_worker_default", "storage_scope_default"),
          node("execution_worker_homer", "storage_scope_homer"),
        ]),
      },
    } as never;

    await expect(
      readLocalExecutorTarget(prisma, "execution_worker_homer"),
    ).resolves.toMatchObject({
      nodeId: "execution_worker_homer",
      storageScopeId: "storage_scope_homer",
    });
  });

  it("does not silently substitute another executor for an unavailable selection", async () => {
    const prisma = {
      agentNode: {
        findMany: jest.fn(async () => [
          {
            id: "executor_available_123",
            hostName: "quipsly-media-worker:Available",
            lastHeartbeatAt: new Date("2026-08-08T20:00:00.000Z"),
            capabilities: {
              executorKind: "local-mac",
              storage: {
                schema: "quipsly-local-media-storage-v1",
                status: "measured",
                availableBytes: 1_000,
                reserveBytes: 100,
                safeAvailableBytes: 900,
                measuredAt: "2026-08-08T20:00:00.000Z",
                workspaceMode: "durable",
                scopeId: "storage_scope_available_123",
              },
            },
          },
        ]),
      },
    } as never;

    await expect(
      readLocalExecutorTarget(prisma, "executor_offline_123"),
    ).resolves.toBeNull();
  });

  it("derives the web process identity from the same filesystem authority as the worker", async () => {
    const originalWorkspaceRoot = process.env.QUIPSLY_LOCAL_MEDIA_WORKSPACE_ROOT;
    const root = await mkdtemp(path.join(tmpdir(), "quipsly-current-executor-test-"));
    process.env.QUIPSLY_LOCAL_MEDIA_WORKSPACE_ROOT = root;
    try {
      const [canonicalRoot, details, identity] = await Promise.all([
        realpath(root),
        stat(root),
        readCurrentLocalExecutorIdentity(),
      ]);
      const hostName = localExecutorHostName(hostname());
      expect(identity).toEqual({
        nodeId: localExecutorNodeId(hostName),
        hostName,
        storageScopeId: localExecutorStorageScopeId({
          hostName,
          canonicalRoot,
          deviceId: details.dev,
          inode: details.ino,
        }),
      });
    } finally {
      if (originalWorkspaceRoot === undefined) {
        delete process.env.QUIPSLY_LOCAL_MEDIA_WORKSPACE_ROOT;
      } else {
        process.env.QUIPSLY_LOCAL_MEDIA_WORKSPACE_ROOT = originalWorkspaceRoot;
      }
      await rm(root, { recursive: true, force: true });
    }
  });
});
