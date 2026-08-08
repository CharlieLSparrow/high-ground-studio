import { mkdir, realpath, stat, statfs } from "node:fs/promises";
import { hostname } from "node:os";
import path from "node:path";

import {
  localExecutorHostName,
  localExecutorNodeId,
  localExecutorStorageScopeId,
} from "@high-ground/quipsly-media-processing/local-executor-identity";
import pg from "pg";

const { Pool } = pg;

export const LOCAL_EXECUTION_WORKER_CAPABILITY_SCHEMA =
  "quipsly-execution-worker-capabilities-v1" as const;

export type LocalExecutionIdentity = {
  nodeId: string;
  hostName: string;
  storageScopeId: string;
};

export async function resolveLocalExecutionIdentity(
  localMediaRoot: string,
): Promise<LocalExecutionIdentity> {
  const resolved = path.resolve(localMediaRoot);
  await mkdir(resolved, { recursive: true, mode: 0o700 });
  const [canonicalRoot, details] = await Promise.all([
    realpath(resolved),
    stat(resolved),
  ]);
  const hostName = localExecutorHostName(hostname());
  return {
    nodeId: localExecutorNodeId(hostName),
    hostName,
    storageScopeId: localExecutorStorageScopeId({
      hostName,
      canonicalRoot,
      deviceId: details.dev,
      inode: details.ino,
    }),
  };
}

export class LocalExecutionPresence {
  private lastWrittenAt = 0;

  constructor(
    private readonly pool: InstanceType<typeof Pool>,
    private readonly input: {
      executionId: string;
      buildId: string;
      localMediaRoot: string;
      identity: LocalExecutionIdentity;
      workspaceMode: "durable" | "temporary";
      storageReserveBytes?: number;
      heartbeatIntervalMs?: number;
    },
  ) {}

  async heartbeat(now = new Date(), force = false) {
    const interval = this.input.heartbeatIntervalMs ?? 10_000;
    if (!force && now.getTime() - this.lastWrittenAt < interval) return false;
    const storage = await this.storageSnapshot(now);
    const capabilities = {
      schema: LOCAL_EXECUTION_WORKER_CAPABILITY_SCHEMA,
      executorKind: "local-mac",
      executionId: this.input.executionId,
      buildId: this.input.buildId,
      jobTypes: [
        "asset-proxy",
        "external-source-proxy",
        "audio-mastery",
        "audio-delivery",
        "episode-program-delivery",
        "audio-treatment-preview",
        "dialogue-repair-preview",
        "audio-signal-profile",
        "audio-spectral-evidence",
        "source-transcript",
        "audio-alignment",
        "audio-pair-correlation",
        "episode-audio-mix",
        "episode-render-proof",
        "episode-program-render",
        "google-drive-source-materialization",
        "source-visual-overview",
        "source-audio-navigation",
      ],
      renderProfiles: [
        "episode-edit-proof-1280x720-24fps-v1",
        "episode-section-review-1280x720-24fps-v1",
        "episode-program-review-1280x720-24fps-v1",
      ],
      localOnly: true,
      directDatabaseLease: true,
      storage,
    };
    await this.pool.query({
      text: `
        INSERT INTO "AgentNode" ("id","hostName","ipAddress","status","capabilities","lastHeartbeatAt","createdAt","updatedAt")
        VALUES ($1,$2,$3,'online',$4::jsonb,timezone('UTC', now()),timezone('UTC', now()),timezone('UTC', now()))
        ON CONFLICT ("hostName") DO UPDATE SET
          "ipAddress"=EXCLUDED."ipAddress",
          "status"='online',
          "capabilities"=EXCLUDED."capabilities",
          "lastHeartbeatAt"=EXCLUDED."lastHeartbeatAt",
          "updatedAt"=EXCLUDED."updatedAt"
      `,
      values: [
        this.input.identity.nodeId,
        this.input.identity.hostName,
        "loopback",
        JSON.stringify(capabilities),
      ],
    });
    this.lastWrittenAt = now.getTime();
    return true;
  }

  async offline() {
    await this.pool.query({
      text: `UPDATE "AgentNode" SET "status"='offline',"updatedAt"=timezone('UTC', now()) WHERE "hostName"=$1`,
      values: [this.input.identity.hostName],
    });
  }

  private async storageSnapshot(now: Date) {
    const reserveBytes = Math.max(
      0,
      this.input.storageReserveBytes ?? 5 * 1024 * 1024 * 1024,
    );
    try {
      const details = await statfs(this.input.localMediaRoot);
      const availableBytes = details.bavail * details.bsize;
      return {
        schema: "quipsly-local-media-storage-v1",
        status: "measured",
        availableBytes,
        reserveBytes,
        safeAvailableBytes: Math.max(0, availableBytes - reserveBytes),
        measuredAt: now.toISOString(),
        workspaceMode: this.input.workspaceMode,
        scopeId: this.input.identity.storageScopeId,
        pathWithheld: true,
      };
    } catch {
      return {
        schema: "quipsly-local-media-storage-v1",
        status: "unavailable",
        availableBytes: null,
        reserveBytes,
        safeAvailableBytes: null,
        measuredAt: now.toISOString(),
        workspaceMode: this.input.workspaceMode,
        scopeId: this.input.identity.storageScopeId,
        pathWithheld: true,
      };
    }
  }
}
