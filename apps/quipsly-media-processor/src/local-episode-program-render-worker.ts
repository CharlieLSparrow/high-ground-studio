import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, realpath, rename, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  episodeProgramRenderManifestCanonicalJson,
  newEpisodeProgramRenderResult,
  parseEpisodeProgramRenderJob,
  type EpisodeProgramRenderJob,
  type EpisodeProgramRenderResult,
} from "@high-ground/quipsly-media-processing";
import pg from "pg";

import {
  EpisodeProgramRenderFfmpegError,
  FfmpegEpisodeProgramRenderer,
  type EpisodeProgramRenderTechnical,
} from "./episode-program-render-ffmpeg.js";
import { sha256File } from "./transcoder.js";

const { Pool } = pg;
const JOB_TYPE = "episode-program-render";
const JOB_SOURCE = "episode-editor.local-program-review";

export type LocalEpisodeProgramRenderClaim = {
  id: string;
  inputJson: unknown;
  attempt: number;
  executionId: string;
};

export interface LocalEpisodeProgramRenderStore {
  claim(input: {
    executionId: string;
    custodianNodeId: string;
    storageScopeId: string;
    leaseMs: number;
    now: Date;
  }): Promise<LocalEpisodeProgramRenderClaim | null>;
  renew(input: {
    claim: LocalEpisodeProgramRenderClaim;
    renderedChunkCount: number;
    chunkCount: number;
    leaseMs: number;
    now: Date;
  }): Promise<boolean>;
  complete(input: {
    claim: LocalEpisodeProgramRenderClaim;
    receipt: EpisodeProgramRenderResult;
    now: Date;
  }): Promise<boolean>;
  retry(input: {
    claim: LocalEpisodeProgramRenderClaim;
    code: string;
    message: string;
    now: Date;
  }): Promise<boolean>;
  fail(input: {
    claim: LocalEpisodeProgramRenderClaim;
    code: string;
    message: string;
    now: Date;
  }): Promise<boolean>;
}

export interface LocalEpisodeProgramRenderer {
  render(
    job: EpisodeProgramRenderJob,
    outputPath: string,
    afterChunk: (renderedChunkCount: number) => Promise<void>,
  ): Promise<EpisodeProgramRenderTechnical>;
}

export type LocalEpisodeProgramRenderWorkerOptions = {
  executionId: string;
  custodianNodeId: string;
  storageScopeId: string;
  buildId: string;
  imageDigest: string | null;
  leaseMs: number;
  localMediaRoot: string;
  now: () => Date;
};

export type LocalEpisodeProgramRenderWorkerResult =
  | { disposition: "idle" }
  | {
      disposition: "completed" | "claim-lost" | "retry" | "failed";
      jobId: string;
      code?: string;
      outputSha256?: string;
    };

class TerminalEpisodeProgramRenderError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "TerminalEpisodeProgramRenderError";
  }
}

export async function runOneLocalEpisodeProgramRenderJob(
  store: LocalEpisodeProgramRenderStore,
  renderer: LocalEpisodeProgramRenderer,
  options: LocalEpisodeProgramRenderWorkerOptions,
): Promise<LocalEpisodeProgramRenderWorkerResult> {
  const claim = await store.claim({
    executionId: options.executionId,
    custodianNodeId: options.custodianNodeId,
    storageScopeId: options.storageScopeId,
    leaseMs: options.leaseMs,
    now: options.now(),
  });
  if (!claim) return { disposition: "idle" };
  let job: EpisodeProgramRenderJob;
  try {
    job = parseEpisodeProgramRenderJob(claim.inputJson, claim.id);
    const manifestSha256 = createHash("sha256")
      .update(episodeProgramRenderManifestCanonicalJson(job))
      .digest("hex");
    if (manifestSha256 !== job.manifestSha256) throw new Error("manifest digest mismatch");
    if (
      job.executionTarget.custodianNodeId !== options.custodianNodeId
      || job.executionTarget.storageScopeId !== options.storageScopeId
    ) throw new Error("executor custody mismatch");
  } catch (error) {
    await store.fail({
      claim,
      code: "episode-program-render-manifest-invalid",
      message: message(error),
      now: options.now(),
    });
    return {
      disposition: "failed",
      jobId: claim.id,
      code: "episode-program-render-manifest-invalid",
    };
  }

  let partialPath = "";
  let outputPath = "";
  try {
    const root = await authorizedRoot(options.localMediaRoot);
    const resolvedSourcePaths = new Map<string, string>();
    for (const source of job.sources) {
      const sourcePath = await authorizedSource(root, source.locator);
      resolvedSourcePaths.set(source.laneId, sourcePath);
      const before = await inspect(sourcePath);
      if (
        before.sha256 !== source.sha256
        || before.sizeBytes !== source.sizeBytes
        || source.generation !== `sha256:${before.sha256}`
      ) {
        throw new TerminalEpisodeProgramRenderError(
          "episode-program-render-source-byte-mismatch",
          `${source.label} no longer matches the frozen source receipt.`,
        );
      }
    }
    outputPath = await authorizedTarget(root, job.target.locator);
    partialPath = outputPath.replace(/\.mp4$/, `.partial-${claim.executionId}.mp4`);
    await rm(partialPath, { force: true });
    await rm(outputPath, { force: true });
    const technical = await renderer.render(job, partialPath, async (renderedChunkCount) => {
      const retained = await store.renew({
        claim,
        renderedChunkCount,
        chunkCount: job.chunks.length,
        leaseMs: options.leaseMs,
        now: options.now(),
      });
      if (!retained) {
        throw new EpisodeProgramRenderFfmpegError(
          "episode-program-render-claim-lost",
          "The durable render lease changed before this chunk could be committed.",
          false,
        );
      }
    });
    await flush(partialPath);
    await rename(partialPath, outputPath);
    const output = await inspect(outputPath);
    for (const source of job.sources) {
      const current = await inspect(resolvedSourcePaths.get(source.laneId)!);
      if (current.sha256 !== source.sha256 || current.sizeBytes !== source.sizeBytes) {
        await rm(outputPath, { force: true });
        throw new TerminalEpisodeProgramRenderError(
          "episode-program-render-source-drift",
          `${source.label} changed while the program review was rendering.`,
        );
      }
    }
    const receipt = newEpisodeProgramRenderResult({
      jobId: job.jobId,
      completedAt: options.now().toISOString(),
      manifestSha256: job.manifestSha256,
      output: {
        provider: "local",
        ...job.executionTarget,
        locator: job.target.locator,
        generation: `sha256:${output.sha256}`,
        sha256: output.sha256,
        sizeBytes: output.sizeBytes,
        contentType: "video/mp4",
        durationSeconds: technical.durationSeconds,
        width: 1280,
        height: 720,
        fps: technical.fps,
        videoCodec: technical.videoCodec,
        audioCodec: technical.audioCodec,
        completeDecode: true,
        fastStart: true,
        variantKind: "episode-program-review",
      },
      worker: {
        ...job.executionTarget,
        executionId: claim.executionId,
        buildId: options.buildId,
        imageDigest: options.imageDigest,
        attempt: claim.attempt,
        ffmpegVersion: technical.ffmpegVersion,
        renderedChunkCount: technical.renderedChunkCount,
      },
    }, job);
    const committed = await store.complete({ claim, receipt, now: options.now() });
    return committed
      ? { disposition: "completed", jobId: job.jobId, outputSha256: output.sha256 }
      : { disposition: "claim-lost", jobId: job.jobId };
  } catch (error) {
    if (partialPath) await rm(partialPath, { force: true }).catch(() => undefined);
    if (
      error instanceof EpisodeProgramRenderFfmpegError
      && error.code === "episode-program-render-claim-lost"
    ) return { disposition: "claim-lost", jobId: job.jobId, code: error.code };
    const terminal = error instanceof TerminalEpisodeProgramRenderError
      || (error instanceof EpisodeProgramRenderFfmpegError && !error.retryable);
    const code = error instanceof TerminalEpisodeProgramRenderError
      || error instanceof EpisodeProgramRenderFfmpegError
      ? error.code
      : "episode-program-render-worker-retry";
    await (terminal ? store.fail.bind(store) : store.retry.bind(store))({
      claim,
      code,
      message: message(error),
      now: options.now(),
    });
    return { disposition: terminal ? "failed" : "retry", jobId: job.jobId, code };
  }
}

export class PostgresLocalEpisodeProgramRenderStore
implements LocalEpisodeProgramRenderStore {
  constructor(private readonly pool: InstanceType<typeof Pool>) {}

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
        text: `SELECT "id", "inputJson", "resultJson" FROM "StudioWorkflowJob" WHERE "type"=$1 AND "source"=$2 AND "inputJson"->'target'->>'provider'='local' AND "inputJson"->'executionTarget'->>'custodianNodeId'=$4 AND "inputJson"->'executionTarget'->>'storageScopeId'=$5 AND ("status"='queued' OR ("status"='processing' AND "updatedAt" < timezone('UTC', now()) - ($3 * interval '1 millisecond'))) ORDER BY "priority" ASC,"createdAt" ASC FOR UPDATE SKIP LOCKED LIMIT 1`,
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
        values: [row.id, JSON.stringify({
          state: "processing",
          lease: {
            executionId: input.executionId,
            attempt,
            claimedAt: input.now.toISOString(),
            expiresAt: new Date(input.now.getTime() + input.leaseMs).toISOString(),
          },
          progress: { renderedChunkCount: 0 },
          sourceMediaRemainsImmutable: true,
        })],
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

  async renew(input: {
    claim: LocalEpisodeProgramRenderClaim;
    renderedChunkCount: number;
    chunkCount: number;
    leaseMs: number;
    now: Date;
  }) {
    return (await this.pool.query({
      text: `UPDATE "StudioWorkflowJob" SET "updatedAt"=timezone('UTC', now()),"resultJson"=jsonb_set(jsonb_set("resultJson",'{lease,expiresAt}',to_jsonb($3::text),true),'{progress}',$4::jsonb,true) WHERE "id"=$1 AND "status"='processing' AND "resultJson"->'lease'->>'executionId'=$2`,
      values: [
        input.claim.id,
        input.claim.executionId,
        new Date(input.now.getTime() + input.leaseMs).toISOString(),
        JSON.stringify({
          renderedChunkCount: input.renderedChunkCount,
          chunkCount: input.chunkCount,
          fraction: input.chunkCount > 0
            ? input.renderedChunkCount / input.chunkCount
            : 0,
          updatedAt: input.now.toISOString(),
        }),
      ],
    })).rowCount === 1;
  }

  async complete(input: {
    claim: LocalEpisodeProgramRenderClaim;
    receipt: EpisodeProgramRenderResult;
    now: Date;
  }) {
    return (await this.pool.query({
      text: `UPDATE "StudioWorkflowJob" SET "status"='output-ready',"updatedAt"=timezone('UTC', now()),"completedAt"=NULL,"error"=NULL,"resultJson"=$3::jsonb WHERE "id"=$1 AND "status"='processing' AND "resultJson"->'lease'->>'executionId'=$2`,
      values: [input.claim.id, input.claim.executionId, JSON.stringify({ state: "output-ready", receipt: input.receipt })],
    })).rowCount === 1;
  }

  retry(input: {
    claim: LocalEpisodeProgramRenderClaim;
    code: string;
    message: string;
    now: Date;
  }) { return this.release(input, "queued"); }

  fail(input: {
    claim: LocalEpisodeProgramRenderClaim;
    code: string;
    message: string;
    now: Date;
  }) { return this.release(input, "failed"); }

  private async release(
    input: {
      claim: LocalEpisodeProgramRenderClaim;
      code: string;
      message: string;
      now: Date;
    },
    status: "queued" | "failed",
  ) {
    return (await this.pool.query({
      text: `UPDATE "StudioWorkflowJob" SET "status"=$3,"updatedAt"=timezone('UTC', now()),"completedAt"=CASE WHEN $3='failed' THEN timezone('UTC', now()) ELSE NULL END,"error"=$4,"resultJson"=$5::jsonb WHERE "id"=$1 AND "status"='processing' AND "resultJson"->'lease'->>'executionId'=$2`,
      values: [
        input.claim.id,
        input.claim.executionId,
        status,
        `${input.code}: ${input.message}`.slice(0, 4_000),
        JSON.stringify({
          state: status,
          failure: { code: input.code, message: input.message },
          lease: {
            executionId: input.claim.executionId,
            attempt: input.claim.attempt,
          },
          sourceMediaRemainsImmutable: true,
        }),
      ],
    })).rowCount === 1;
  }
}

export function newLocalEpisodeProgramRenderRuntime(input: {
  pool: InstanceType<typeof Pool>;
  executionId?: string;
  custodianNodeId: string;
  storageScopeId: string;
  localMediaRoot: string;
  leaseMs: number;
  buildId: string;
}) {
  return {
    store: new PostgresLocalEpisodeProgramRenderStore(input.pool),
    renderer: new FfmpegEpisodeProgramRenderer(),
    options: {
      executionId: input.executionId ?? randomUUID(),
      custodianNodeId: input.custodianNodeId,
      storageScopeId: input.storageScopeId,
      buildId: input.buildId,
      imageDigest: null,
      leaseMs: input.leaseMs,
      localMediaRoot: input.localMediaRoot,
      now: () => new Date(),
    } satisfies LocalEpisodeProgramRenderWorkerOptions,
  };
}

async function authorizedRoot(configuredRoot: string) {
  const temporaryRoot = await realpath(tmpdir());
  const resolved = path.resolve(configuredRoot);
  await mkdir(resolved, { recursive: true, mode: 0o700 });
  const root = await realpath(resolved);
  if (root === temporaryRoot || !inside(temporaryRoot, root)) {
    throw new TerminalEpisodeProgramRenderError(
      "episode-program-render-root-rejected",
      "Local program render root must be a dedicated directory below the operating-system temporary directory.",
    );
  }
  return root;
}

async function authorizedSource(root: string, locator: string) {
  const source = await realpath(locator).catch(() => "");
  if (!source || !inside(root, source)) {
    throw new TerminalEpisodeProgramRenderError(
      "episode-program-render-source-path-rejected",
      "A program render source escaped the authorized local media root.",
    );
  }
  return source;
}

async function authorizedTarget(root: string, locator: string) {
  const requested = path.resolve(root, locator);
  if (!requested.endsWith(".mp4") || !inside(root, requested)) {
    throw new TerminalEpisodeProgramRenderError(
      "episode-program-render-target-path-rejected",
      "The program render target escaped the authorized local media root.",
    );
  }
  await mkdir(path.dirname(requested), { recursive: true, mode: 0o700 });
  return path.join(await realpath(path.dirname(requested)), path.basename(requested));
}

async function inspect(filePath: string) {
  const details = await stat(filePath);
  if (!details.isFile() || details.size <= 0) {
    throw new TerminalEpisodeProgramRenderError(
      "episode-program-render-file-unavailable",
      "An exact program render file is empty or unavailable.",
    );
  }
  return { sizeBytes: details.size, sha256: await sha256File(filePath) };
}

async function flush(filePath: string) {
  const handle = await open(filePath, "r+");
  try {
    await handle.sync();
    await handle.chmod(0o600);
  } finally {
    await handle.close();
  }
}

function inside(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
function record(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function message(error: unknown) { return error instanceof Error && error.message.trim() ? error.message : String(error); }
