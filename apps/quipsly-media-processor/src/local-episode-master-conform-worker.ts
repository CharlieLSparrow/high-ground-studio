import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, realpath, rename, rm, stat } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";

import {
  episodeMasterConformManifestCanonicalJson,
  newEpisodeMasterConformResult,
  parseEpisodeMasterConformJob,
  type EpisodeMasterConformJob,
  type EpisodeMasterConformResult,
} from "@high-ground/quipsly-media-processing";
import pg from "pg";

import {
  EpisodeProgramRenderFfmpegError,
  FfmpegEpisodeProgramRenderer,
  type EpisodeProgramRenderTechnical,
} from "./episode-program-render-ffmpeg.js";
import { FfmpegEpisodeRenderProofRenderer } from "./episode-render-proof-ffmpeg.js";
import { sha256File } from "./transcoder.js";

const { Pool } = pg;
const JOB_TYPE = "episode-master-conform";
const JOB_SOURCE = "episode-editor.local-approved-master";
const MASTER_PROFILE = {
  width: 3840,
  height: 2160,
  fps: 24,
  videoPreset: "medium" as const,
  videoCrf: 17,
  audioBitrate: "320k" as const,
  audioSampleRateHz: 48_000 as const,
};

export type LocalEpisodeMasterConformClaim = {
  id: string;
  inputJson: unknown;
  attempt: number;
  executionId: string;
};

export interface LocalEpisodeMasterConformStore {
  claim(input: { executionId: string; custodianNodeId: string; storageScopeId: string; leaseMs: number; now: Date }): Promise<LocalEpisodeMasterConformClaim | null>;
  renew(input: { claim: LocalEpisodeMasterConformClaim; renderedChunkCount: number; chunkCount: number; leaseMs: number; now: Date }): Promise<boolean>;
  complete(input: { claim: LocalEpisodeMasterConformClaim; receipt: EpisodeMasterConformResult; now: Date }): Promise<boolean>;
  retry(input: { claim: LocalEpisodeMasterConformClaim; code: string; message: string; now: Date }): Promise<boolean>;
  fail(input: { claim: LocalEpisodeMasterConformClaim; code: string; message: string; now: Date }): Promise<boolean>;
}

export interface LocalEpisodeMasterRenderer {
  render(job: EpisodeMasterConformJob, outputPath: string, afterChunk: (count: number) => Promise<void>): Promise<EpisodeProgramRenderTechnical>;
}

export type LocalEpisodeMasterConformWorkerOptions = {
  executionId: string;
  custodianNodeId: string;
  storageScopeId: string;
  buildId: string;
  imageDigest: string | null;
  leaseMs: number;
  localMediaRoot: string;
  now: () => Date;
};

export async function runOneLocalEpisodeMasterConformJob(
  store: LocalEpisodeMasterConformStore,
  renderer: LocalEpisodeMasterRenderer,
  options: LocalEpisodeMasterConformWorkerOptions,
) {
  const claim = await store.claim({
    executionId: options.executionId,
    custodianNodeId: options.custodianNodeId,
    storageScopeId: options.storageScopeId,
    leaseMs: options.leaseMs,
    now: options.now(),
  });
  if (!claim) return { disposition: "idle" as const };
  let job: EpisodeMasterConformJob;
  try {
    job = parseEpisodeMasterConformJob(claim.inputJson, claim.id);
    const digest = createHash("sha256")
      .update(episodeMasterConformManifestCanonicalJson(job))
      .digest("hex");
    if (digest !== job.manifestSha256) throw new Error("manifest digest mismatch");
    if (
      job.executionTarget.custodianNodeId !== options.custodianNodeId
      || job.executionTarget.storageScopeId !== options.storageScopeId
    ) throw new Error("executor custody mismatch");
  } catch (error) {
    await store.fail({ claim, code: "episode-master-conform-manifest-invalid", message: message(error), now: options.now() });
    return { disposition: "failed" as const, jobId: claim.id, code: "episode-master-conform-manifest-invalid" };
  }
  let partialPath = "";
  let outputPath = "";
  try {
    const root = await authorizedRoot(options.localMediaRoot);
    const sources = new Map<string, string>();
    for (const source of job.approvedProgram.sources) {
      const sourcePath = await authorizedSource(root, source.locator);
      sources.set(source.laneId, sourcePath);
      const before = await inspect(sourcePath);
      if (before.sha256 !== source.sha256 || before.sizeBytes !== source.sizeBytes || source.generation !== `sha256:${before.sha256}`) {
        throw new TerminalMasterError("episode-master-conform-source-byte-mismatch", `${source.label} no longer matches the approval-bound source generation.`);
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
        chunkCount: job.approvedProgram.chunks.length,
        leaseMs: options.leaseMs,
        now: options.now(),
      });
      if (!retained) throw new EpisodeProgramRenderFfmpegError(
        "episode-master-conform-claim-lost",
        "The durable master lease changed before this chunk could be committed.",
        false,
      );
    });
    await flush(partialPath);
    await rename(partialPath, outputPath);
    const output = await inspect(outputPath);
    for (const source of job.approvedProgram.sources) {
      const current = await inspect(sources.get(source.laneId)!);
      if (current.sha256 !== source.sha256 || current.sizeBytes !== source.sizeBytes) {
        await rm(outputPath, { force: true });
        throw new TerminalMasterError("episode-master-conform-source-drift", `${source.label} changed while the master was rendering.`);
      }
    }
    const receipt = newEpisodeMasterConformResult({
      jobId: job.jobId,
      completedAt: options.now().toISOString(),
      manifestSha256: job.manifestSha256,
      approvalReceiptId: job.approval.receiptId,
      output: {
        provider: "local",
        ...job.executionTarget,
        locator: job.target.locator,
        generation: `sha256:${output.sha256}`,
        sha256: output.sha256,
        sizeBytes: output.sizeBytes,
        contentType: "video/mp4",
        durationSeconds: technical.durationSeconds,
        width: 3840,
        height: 2160,
        fps: technical.fps,
        videoCodec: technical.videoCodec,
        audioCodec: technical.audioCodec,
        completeDecode: true,
        fastStart: true,
        variantKind: "episode-master-candidate",
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
      ? { disposition: "completed" as const, jobId: job.jobId, outputSha256: output.sha256 }
      : { disposition: "claim-lost" as const, jobId: job.jobId };
  } catch (error) {
    if (partialPath) await rm(partialPath, { force: true }).catch(() => undefined);
    if (error instanceof EpisodeProgramRenderFfmpegError && error.code === "episode-master-conform-claim-lost") {
      return { disposition: "claim-lost" as const, jobId: job.jobId, code: error.code };
    }
    const terminal = error instanceof TerminalMasterError
      || (error instanceof EpisodeProgramRenderFfmpegError && !error.retryable);
    const code = error instanceof TerminalMasterError || error instanceof EpisodeProgramRenderFfmpegError
      ? error.code
      : "episode-master-conform-worker-retry";
    await (terminal ? store.fail.bind(store) : store.retry.bind(store))({ claim, code, message: message(error), now: options.now() });
    return { disposition: terminal ? "failed" as const : "retry" as const, jobId: job.jobId, code };
  }
}

export class PostgresLocalEpisodeMasterConformStore implements LocalEpisodeMasterConformStore {
  constructor(private readonly pool: InstanceType<typeof Pool>) {}

  async claim(input: { executionId: string; custodianNodeId: string; storageScopeId: string; leaseMs: number; now: Date }) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const selected = await client.query({
        text: `SELECT "id","inputJson","resultJson" FROM "StudioWorkflowJob" WHERE "type"=$1 AND "source"=$2 AND "inputJson"->'target'->>'provider'='local' AND "inputJson"->'executionTarget'->>'custodianNodeId'=$4 AND "inputJson"->'executionTarget'->>'storageScopeId'=$5 AND ("status"='queued' OR ("status"='processing' AND "updatedAt" < timezone('UTC', now()) - ($3 * interval '1 millisecond'))) ORDER BY "priority" ASC,"createdAt" ASC FOR UPDATE SKIP LOCKED LIMIT 1`,
        values: [JOB_TYPE, JOB_SOURCE, input.leaseMs, input.custodianNodeId, input.storageScopeId],
      });
      const row = selected.rows[0];
      if (!row) { await client.query("COMMIT"); return null; }
      const attempt = Math.max(0, Number(record(record(row.resultJson).lease).attempt) || 0) + 1;
      const updated = await client.query({
        text: `UPDATE "StudioWorkflowJob" SET "status"='processing',"startedAt"=COALESCE("startedAt",timezone('UTC', now())),"updatedAt"=timezone('UTC', now()),"error"=NULL,"resultJson"=$2::jsonb WHERE "id"=$1 RETURNING "id","inputJson"`,
        values: [row.id, JSON.stringify({ state: "processing", lease: { executionId: input.executionId, attempt, claimedAt: input.now.toISOString(), expiresAt: new Date(input.now.getTime() + input.leaseMs).toISOString() }, progress: { renderedChunkCount: 0 }, sourceMediaRemainsImmutable: true, reviewCandidateIsNotMasterInput: true })],
      });
      await client.query("COMMIT");
      return { id: updated.rows[0].id, inputJson: updated.rows[0].inputJson, attempt, executionId: input.executionId };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }

  async renew(input: { claim: LocalEpisodeMasterConformClaim; renderedChunkCount: number; chunkCount: number; leaseMs: number; now: Date }) {
    return (await this.pool.query({
      text: `UPDATE "StudioWorkflowJob" SET "updatedAt"=timezone('UTC', now()),"resultJson"=jsonb_set(jsonb_set("resultJson",'{lease,expiresAt}',to_jsonb($3::text),true),'{progress}',$4::jsonb,true) WHERE "id"=$1 AND "status"='processing' AND "resultJson"->'lease'->>'executionId'=$2`,
      values: [input.claim.id, input.claim.executionId, new Date(input.now.getTime() + input.leaseMs).toISOString(), JSON.stringify({ renderedChunkCount: input.renderedChunkCount, chunkCount: input.chunkCount, fraction: input.chunkCount ? input.renderedChunkCount / input.chunkCount : 0, updatedAt: input.now.toISOString() })],
    })).rowCount === 1;
  }

  async complete(input: { claim: LocalEpisodeMasterConformClaim; receipt: EpisodeMasterConformResult; now: Date }) {
    return (await this.pool.query({
      text: `UPDATE "StudioWorkflowJob" SET "status"='output-ready',"updatedAt"=timezone('UTC', now()),"completedAt"=NULL,"error"=NULL,"resultJson"=$3::jsonb WHERE "id"=$1 AND "status"='processing' AND "resultJson"->'lease'->>'executionId'=$2`,
      values: [input.claim.id, input.claim.executionId, JSON.stringify({ state: "output-ready", receipt: input.receipt })],
    })).rowCount === 1;
  }

  retry(input: { claim: LocalEpisodeMasterConformClaim; code: string; message: string; now: Date }) { return this.release(input, "queued"); }
  fail(input: { claim: LocalEpisodeMasterConformClaim; code: string; message: string; now: Date }) { return this.release(input, "failed"); }
  private async release(input: { claim: LocalEpisodeMasterConformClaim; code: string; message: string; now: Date }, status: "queued" | "failed") {
    return (await this.pool.query({
      text: `UPDATE "StudioWorkflowJob" SET "status"=$3,"updatedAt"=timezone('UTC', now()),"completedAt"=CASE WHEN $3='failed' THEN timezone('UTC', now()) ELSE NULL END,"error"=$4,"resultJson"=$5::jsonb WHERE "id"=$1 AND "status"='processing' AND "resultJson"->'lease'->>'executionId'=$2`,
      values: [input.claim.id, input.claim.executionId, status, `${input.code}: ${input.message}`.slice(0, 4_000), JSON.stringify({ state: status, failure: { code: input.code, message: input.message }, lease: { executionId: input.claim.executionId, attempt: input.claim.attempt }, sourceMediaRemainsImmutable: true, reviewCandidateIsNotMasterInput: true })],
    })).rowCount === 1;
  }
}

export function newLocalEpisodeMasterConformRuntime(input: { pool: InstanceType<typeof Pool>; executionId?: string; custodianNodeId: string; storageScopeId: string; localMediaRoot: string; leaseMs: number; buildId: string }) {
  const chunkRenderer = new FfmpegEpisodeRenderProofRenderer("ffmpeg", "ffprobe", MASTER_PROFILE);
  const programRenderer = new FfmpegEpisodeProgramRenderer(chunkRenderer, "ffmpeg", "ffprobe", MASTER_PROFILE);
  return {
    store: new PostgresLocalEpisodeMasterConformStore(input.pool),
    renderer: {
      render: (job: EpisodeMasterConformJob, outputPath: string, afterChunk: (count: number) => Promise<void>) => programRenderer.render(job.approvedProgram, outputPath, afterChunk),
    } satisfies LocalEpisodeMasterRenderer,
    options: { executionId: input.executionId ?? randomUUID(), custodianNodeId: input.custodianNodeId, storageScopeId: input.storageScopeId, buildId: input.buildId, imageDigest: null, leaseMs: input.leaseMs, localMediaRoot: input.localMediaRoot, now: () => new Date() } satisfies LocalEpisodeMasterConformWorkerOptions,
  };
}

class TerminalMasterError extends Error { constructor(readonly code: string, message: string) { super(message); this.name = "TerminalMasterError"; } }
async function authorizedRoot(configuredRoot: string) { const resolved = path.resolve(configuredRoot); await mkdir(resolved, { recursive: true, mode: 0o700 }); const root = await realpath(resolved); const forbidden = new Set([path.parse(root).root, await realpath(tmpdir()), await realpath(homedir())]); if (forbidden.has(root)) throw new TerminalMasterError("episode-master-conform-root-rejected", "Local master root must be a dedicated workspace, not a filesystem, home, or temporary root."); return root; }
async function authorizedSource(root: string, locator: string) { const source = await realpath(locator).catch(() => ""); if (!source || !inside(root, source)) throw new TerminalMasterError("episode-master-conform-source-path-rejected", "A master source escaped the authorized local media root."); return source; }
async function authorizedTarget(root: string, locator: string) { const requested = path.resolve(root, locator); if (!requested.endsWith(".mp4") || !inside(root, requested)) throw new TerminalMasterError("episode-master-conform-target-path-rejected", "The master target escaped the authorized local media root."); await mkdir(path.dirname(requested), { recursive: true, mode: 0o700 }); return path.join(await realpath(path.dirname(requested)), path.basename(requested)); }
async function inspect(filePath: string) { const details = await stat(filePath); if (!details.isFile() || details.size <= 0) throw new TerminalMasterError("episode-master-conform-file-unavailable", "An exact master file is empty or unavailable."); return { sizeBytes: details.size, sha256: await sha256File(filePath) }; }
async function flush(filePath: string) { const handle = await open(filePath, "r+"); try { await handle.sync(); await handle.chmod(0o600); } finally { await handle.close(); } }
function inside(root: string, candidate: string) { const relative = path.relative(root, candidate); return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative)); }
function record(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function message(error: unknown) { return error instanceof Error && error.message.trim() ? error.message : String(error); }
