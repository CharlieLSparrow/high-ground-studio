import { hostname } from "node:os";

import pg from "pg";

const { Pool } = pg;

export const LOCAL_EXECUTION_WORKER_CAPABILITY_SCHEMA = "quipsly-execution-worker-capabilities-v1" as const;

export class LocalExecutionPresence {
  private lastWrittenAt = 0;

  constructor(
    private readonly pool: InstanceType<typeof Pool>,
    private readonly input: {
      executionId: string;
      buildId: string;
      heartbeatIntervalMs?: number;
    },
  ) {}

  async heartbeat(now = new Date(), force = false) {
    const interval = this.input.heartbeatIntervalMs ?? 10_000;
    if (!force && now.getTime() - this.lastWrittenAt < interval) return false;
    const hostName = `quipsly-media-worker:${hostname()}`.slice(0, 220);
    const capabilities = {
      schema: LOCAL_EXECUTION_WORKER_CAPABILITY_SCHEMA,
      executorKind: "local-mac",
      executionId: this.input.executionId,
      buildId: this.input.buildId,
      jobTypes: [
        "asset-proxy",
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
      ],
      renderProfiles: ["episode-edit-proof-1280x720-24fps-v1"],
      localOnly: true,
      directDatabaseLease: true,
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
      values: [`execution_worker_${stableHostId(hostName)}`, hostName, "loopback", JSON.stringify(capabilities)],
    });
    this.lastWrittenAt = now.getTime();
    return true;
  }

  async offline() {
    const hostName = `quipsly-media-worker:${hostname()}`.slice(0, 220);
    await this.pool.query({
      text: `UPDATE "AgentNode" SET "status"='offline',"updatedAt"=timezone('UTC', now()) WHERE "hostName"=$1`,
      values: [hostName],
    });
  }
}

function stableHostId(value: string) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
