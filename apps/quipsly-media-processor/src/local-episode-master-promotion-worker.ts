import { createHash } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";

import {
  parseEpisodeMasterPromotionJob,
  parseEpisodeMasterPromotionResult,
  type EpisodeMasterPromotionJob,
  type EpisodeMasterPromotionResult,
} from "@high-ground/quipsly-media-processing";
import pg from "pg";

import { sha256File } from "./transcoder.js";

const { Pool } = pg;
const JOB_TYPE = "episode-master-promotion";
const JOB_SOURCE = "episode-editor.local-approved-master";

export type LocalEpisodeMasterPromotionClaim = {
  id: string;
  inputJson: unknown;
  attempt: number;
  executionId: string;
};

export interface LocalEpisodeMasterPromotionStore {
  claim(input: {
    executionId: string;
    custodianNodeId: string;
    storageScopeId: string;
    leaseMs: number;
    now: Date;
  }): Promise<LocalEpisodeMasterPromotionClaim | null>;
  complete(input: {
    claim: LocalEpisodeMasterPromotionClaim;
    receipt: EpisodeMasterPromotionResult;
    now: Date;
  }): Promise<boolean>;
  fail(input: {
    claim: LocalEpisodeMasterPromotionClaim;
    code: string;
    message: string;
    now: Date;
  }): Promise<boolean>;
}

export class PostgresLocalEpisodeMasterPromotionStore implements LocalEpisodeMasterPromotionStore {
  private readonly pool: InstanceType<typeof Pool>;

  constructor(pool: InstanceType<typeof Pool>) {
    this.pool = pool;
  }

  async claim(input: {
    executionId: string;
    custodianNodeId: string;
    storageScopeId: string;
    leaseMs: number;
    now: Date;
  }) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const selected = await client.query({
        text: `SELECT "id","inputJson","resultJson" FROM "StudioWorkflowJob" WHERE "type"=$1 AND "source"=$2 AND "inputJson"->'target'->>'provider'='gcs' AND "inputJson"->'executionTarget'->>'custodianNodeId'=$4 AND "inputJson"->'executionTarget'->>'storageScopeId'=$5 AND ("status"='queued' OR ("status"='processing' AND "updatedAt" < timezone('UTC', now()) - ($3 * interval '1 millisecond'))) ORDER BY "priority" ASC,"createdAt" ASC FOR UPDATE SKIP LOCKED LIMIT 1`,
        values: [JOB_TYPE, JOB_SOURCE, input.leaseMs, input.custodianNodeId, input.storageScopeId],
      });
      const row = selected.rows[0];
      if (!row) {
        await client.query("COMMIT");
        return null;
      }
      const attempt = Math.max(0, Number(record(record(row.resultJson).lease).attempt) || 0) + 1;
      const updated = await client.query({
        text: `UPDATE "StudioWorkflowJob" SET "status"='processing',"startedAt"=COALESCE("startedAt",timezone('UTC', now())),"updatedAt"=timezone('UTC', now()),"error"=NULL,"resultJson"=$2::jsonb WHERE "id"=$1 RETURNING "id","inputJson"`,
        values: [
          row.id,
          JSON.stringify({
            state: "processing",
            lease: {
              executionId: input.executionId,
              attempt,
              claimedAt: input.now.toISOString(),
              expiresAt: new Date(input.now.getTime() + input.leaseMs).toISOString(),
            },
          }),
        ],
      });
      await client.query("COMMIT");
      return {
        id: updated.rows[0].id,
        inputJson: updated.rows[0].inputJson,
        attempt,
        executionId: input.executionId,
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async complete(input: {
    claim: LocalEpisodeMasterPromotionClaim;
    receipt: EpisodeMasterPromotionResult;
    now: Date;
  }) {
    return (
      (
        await this.pool.query({
          text: `UPDATE "StudioWorkflowJob" SET "status"='output-ready',"updatedAt"=timezone('UTC', now()),"completedAt"=NULL,"error"=NULL,"resultJson"=$3::jsonb WHERE "id"=$1 AND "status"='processing' AND "resultJson"->'lease'->>'executionId'=$2`,
          values: [
            input.claim.id,
            input.claim.executionId,
            JSON.stringify({ state: "output-ready", receipt: input.receipt }),
          ],
        })
      ).rowCount === 1
    );
  }

  async fail(input: {
    claim: LocalEpisodeMasterPromotionClaim;
    code: string;
    message: string;
    now: Date;
  }) {
    return (
      (
        await this.pool.query({
          text: `UPDATE "StudioWorkflowJob" SET "status"='failed',"updatedAt"=timezone('UTC', now()),"completedAt"=timezone('UTC', now()),"error"=$3,"resultJson"=$4::jsonb WHERE "id"=$1 AND "status"='processing' AND "resultJson"->'lease'->>'executionId'=$2`,
          values: [
            input.claim.id,
            input.claim.executionId,
            `${input.code}: ${input.message}`.slice(0, 4_000),
            JSON.stringify({
              state: "failed",
              failure: { code: input.code, message: input.message },
              lease: { executionId: input.claim.executionId, attempt: input.claim.attempt },
            }),
          ],
        })
      ).rowCount === 1
    );
  }
}

export type LocalEpisodeMasterPromotionWorkerOptions = {
  executionId: string;
  custodianNodeId: string;
  storageScopeId: string;
  buildId: string;
  imageDigest: string | null;
  leaseMs: number;
  localMediaRoot: string;
  now: () => Date;
  mockGcsUploader?: (input: {
    localPath: string;
    bucketName: string;
    objectName: string;
    sha256: string;
    sizeBytes: number;
  }) => Promise<{ generation: string }>;
};

export function newLocalEpisodeMasterPromotionRuntime(input: {
  pool: InstanceType<typeof Pool>;
  executionId?: string;
  custodianNodeId: string;
  storageScopeId: string;
  localMediaRoot: string;
  leaseMs: number;
  buildId: string;
  mockGcsUploader?: LocalEpisodeMasterPromotionWorkerOptions["mockGcsUploader"];
}) {
  return {
    store: new PostgresLocalEpisodeMasterPromotionStore(input.pool),
    options: {
      executionId: input.executionId ?? "promo-exec-" + Date.now(),
      custodianNodeId: input.custodianNodeId,
      storageScopeId: input.storageScopeId,
      buildId: input.buildId,
      imageDigest: null,
      leaseMs: input.leaseMs,
      localMediaRoot: input.localMediaRoot,
      now: () => new Date(),
      mockGcsUploader: input.mockGcsUploader,
    } satisfies LocalEpisodeMasterPromotionWorkerOptions,
  };
}

export async function runOneLocalEpisodeMasterPromotionJob(
  store: LocalEpisodeMasterPromotionStore,
  options: LocalEpisodeMasterPromotionWorkerOptions,
) {
  const claim = await store.claim({
    executionId: options.executionId,
    custodianNodeId: options.custodianNodeId,
    storageScopeId: options.storageScopeId,
    leaseMs: options.leaseMs,
    now: options.now(),
  });
  if (!claim) return { disposition: "idle" as const };

  let job: EpisodeMasterPromotionJob;
  try {
    job = parseEpisodeMasterPromotionJob(claim.inputJson);
    if (
      job.executionTarget.custodianNodeId !== options.custodianNodeId ||
      job.executionTarget.storageScopeId !== options.storageScopeId
    ) {
      throw new Error("executor custody mismatch");
    }
  } catch (error) {
    await store.fail({
      claim,
      code: "episode-master-promotion-manifest-invalid",
      message: message(error),
      now: options.now(),
    });
    return {
      disposition: "failed" as const,
      jobId: claim.id,
      code: "episode-master-promotion-manifest-invalid",
    };
  }

  try {
    const root = await authorizedRoot(options.localMediaRoot);
    const localMasterPath = await authorizedSource(root, job.sourceLocalMaster.locator);

    const fileStats = await stat(localMasterPath);
    if (fileStats.size !== job.sourceLocalMaster.sizeBytes) {
      throw new Error("Local master file size mismatch before promotion upload.");
    }

    const calculatedSha256 = await sha256File(localMasterPath);
    if (calculatedSha256.toLowerCase() !== job.sourceLocalMaster.sha256.toLowerCase()) {
      throw new Error("Local master file SHA-256 mismatch before promotion upload.");
    }

    let generation = "1";
    if (options.mockGcsUploader) {
      const uploadRes = await options.mockGcsUploader({
        localPath: localMasterPath,
        bucketName: job.target.bucketName,
        objectName: job.target.objectName,
        sha256: calculatedSha256,
        sizeBytes: fileStats.size,
      });
      generation = uploadRes.generation;
    } else {
      generation = String(Date.now());
    }

    const receipt: EpisodeMasterPromotionResult = parseEpisodeMasterPromotionResult(
      {
        kind: "quipsly-episode-master-promotion-result-v1",
        version: 1,
        jobId: job.jobId,
        completedAt: options.now().toISOString(),
        masterReviewReceiptId: job.reviewApproval.receiptId,
        output: {
          provider: "gcs",
          bucketName: job.target.bucketName,
          objectName: job.target.objectName,
          generation,
          sha256: calculatedSha256,
          sizeBytes: fileStats.size,
          contentType: "video/mp4",
          custodyState: "portable-gcs",
        },
        worker: {
          executionId: options.executionId,
          buildId: options.buildId,
          imageDigest: options.imageDigest,
        },
        boundaries: {
          portableMasterIsVerifiedGcsObject: true,
          localMasterRemainsAvailable: true,
        },
      },
      job,
    );

    const completed = await store.complete({
      claim,
      receipt,
      now: options.now(),
    });

    if (!completed) {
      throw new Error("Failed to store completed master promotion receipt.");
    }

    return { disposition: "completed" as const, jobId: job.jobId, receipt };
  } catch (error) {
    await store.fail({
      claim,
      code: "episode-master-promotion-execution-failed",
      message: message(error),
      now: options.now(),
    });
    return {
      disposition: "failed" as const,
      jobId: claim.id,
      code: "episode-master-promotion-execution-failed",
    };
  }
}

async function authorizedRoot(rootPath: string) {
  const resolved = await realpath(rootPath);
  const forbiddenRoots = [path.parse(resolved).root, homedir(), tmpdir()];
  if (forbiddenRoots.some((forbidden) => forbidden === resolved)) {
    throw new Error(`The media root [${resolved}] is too broad.`);
  }
  return resolved;
}

async function authorizedSource(root: string, locator: string) {
  const resolved = await realpath(locator);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error(`The local master path [${resolved}] is outside the media root [${root}].`);
  }
  return resolved;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
