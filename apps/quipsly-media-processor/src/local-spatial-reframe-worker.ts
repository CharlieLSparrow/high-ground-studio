import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, realpath, rename, rm, stat } from "node:fs/promises";
import path from "node:path";

import {
  newSpatialRenderResult,
  parseSpatialRenderJob,
  spatialRecipeCanonicalJson,
  spatialRenderManifestCanonicalJson,
  type SpatialRenderJob,
  type SpatialRenderResult,
} from "@high-ground/quipsly-media-processing";
import pg from "pg";

import { FfmpegSpatialReframeRenderer, SpatialReframeFfmpegError, type SpatialReframeTechnical } from "./spatial-reframe-ffmpeg.js";
import { sha256File } from "./transcoder.js";

const { Pool } = pg;
const JOB_TYPE = "spatial-reframe";
const JOB_SOURCE = "source-story.spatial-reframe";

export type LocalSpatialReframeClaim = { id: string; inputJson: unknown; attempt: number; executionId: string };
export interface LocalSpatialReframeStore {
  claim(input: { executionId: string; leaseMs: number; now: Date }): Promise<LocalSpatialReframeClaim | null>;
  complete(input: { claim: LocalSpatialReframeClaim; receipt: SpatialRenderResult; now: Date }): Promise<boolean>;
  retry(input: { claim: LocalSpatialReframeClaim; code: string; message: string; now: Date }): Promise<boolean>;
  fail(input: { claim: LocalSpatialReframeClaim; code: string; message: string; now: Date }): Promise<boolean>;
}
export interface LocalSpatialReframeRenderer { render(job: SpatialRenderJob, stitchedInputPath: string, outputPath: string): Promise<SpatialReframeTechnical>; }
export type LocalSpatialReframeWorkerOptions = { executionId: string; buildId: string; imageDigest: string | null; leaseMs: number; outputRoot: string; authorizedSourceRoots: string[]; now: () => Date };
export type LocalSpatialReframeWorkerResult = { disposition: "idle" } | { disposition: "completed" | "claim-lost" | "retry" | "failed"; jobId: string; code?: string; outputSha256?: string };

class TerminalSpatialReframeError extends Error { constructor(readonly code: string, message: string) { super(message); this.name = "TerminalSpatialReframeError"; } }

export async function runOneLocalSpatialReframeJob(store: LocalSpatialReframeStore, renderer: LocalSpatialReframeRenderer, options: LocalSpatialReframeWorkerOptions): Promise<LocalSpatialReframeWorkerResult> {
  const claim = await store.claim({ executionId: options.executionId, leaseMs: options.leaseMs, now: options.now() });
  if (!claim) return { disposition: "idle" };
  let job: SpatialRenderJob;
  try {
    job = parseSpatialRenderJob(claim.inputJson);
    if (job.jobId !== claim.id || digest(spatialRenderManifestCanonicalJson(job)) !== job.manifestSha256 || digest(spatialRecipeCanonicalJson(job)) !== job.recipeSha256) throw new Error("manifest digest mismatch");
    if (job.stitch.adapter !== "insta360-studio-reviewed-export" || !job.stitch.reviewedMaster) throw new Error("reviewed master binding missing");
  } catch (error) {
    await store.fail({ claim, code: "spatial-reframe-manifest-invalid", message: message(error), now: options.now() });
    return { disposition: "failed", jobId: claim.id, code: "spatial-reframe-manifest-invalid" };
  }
  let partialPath = "";
  let outputPath = "";
  try {
    const roots = await authorizedRoots(options.authorizedSourceRoots);
    const outputRoot = await authorizedOutputRoot(options.outputRoot);
    const masterPath = await authorizedSource(roots, job.stitch.target.locator);
    const masterBefore = await inspect(masterPath);
    const binding = job.stitch.reviewedMaster!;
    if (masterBefore.sha256 !== binding.sha256 || masterBefore.sizeBytes !== binding.sizeBytes || binding.generation !== `sha256:${masterBefore.sha256}`) throw new TerminalSpatialReframeError("spatial-reframe-master-byte-mismatch", "The reviewed 5.7K master no longer matches its registration receipt.");
    const originalsBefore = await Promise.all(job.sourcePackage.members.map(async (member) => {
      const locator = await authorizedSource(roots, member.locator);
      const evidence = await inspect(locator);
      if (evidence.sha256 !== member.sha256 || evidence.sizeBytes !== member.sizeBytes || member.generation !== `sha256:${evidence.sha256}`) throw new TerminalSpatialReframeError("spatial-reframe-source-byte-mismatch", `${member.fileName} no longer matches the frozen source package.`);
      return { member, locator, evidence };
    }));
    outputPath = await authorizedTarget(outputRoot, job.reframe.target.locator);
    partialPath = outputPath.replace(/\.mp4$/, `.partial-${claim.executionId}.mp4`);
    await rm(partialPath, { force: true });
    await rm(outputPath, { force: true });
    const technical = await renderer.render(job, masterPath, partialPath);
    await flush(partialPath);
    await rename(partialPath, outputPath);
    const output = await inspect(outputPath);
    const masterAfter = await inspect(masterPath);
    if (masterAfter.sha256 !== masterBefore.sha256 || masterAfter.sizeBytes !== masterBefore.sizeBytes) throw new TerminalSpatialReframeError("spatial-reframe-master-drift", "The reviewed stitch master changed during rendering.");
    for (const original of originalsBefore) {
      const after = await inspect(original.locator);
      if (after.sha256 !== original.evidence.sha256 || after.sizeBytes !== original.evidence.sizeBytes) throw new TerminalSpatialReframeError("spatial-reframe-source-drift", `${original.member.fileName} changed during rendering.`);
    }
    const receipt = newSpatialRenderResult({
      jobId: job.jobId,
      completedAt: options.now().toISOString(),
      manifestSha256: job.manifestSha256,
      stitch: {
        profile: job.stitch.profile,
        adapter: "insta360-studio-reviewed-export",
        adapterVersion: binding.adapterVersion,
        sourceSetIdentitySha256: job.sourcePackage.sourceSetIdentitySha256,
        output: { provider: "local", locator: job.stitch.target.locator, contentType: "video/mp4", generation: binding.generation, sha256: binding.sha256, sizeBytes: binding.sizeBytes, durationSeconds: binding.durationSeconds, completeDecode: true, width: 5760, height: 2880, fps: binding.fps, videoCodec: binding.videoCodec, projection: "equirectangular" },
      },
      reframe: {
        adapter: "ffmpeg-v360",
        ffmpegVersion: technical.ffmpegVersion,
        recipeSha256: job.recipeSha256,
        output: { provider: "local", locator: job.reframe.target.locator, contentType: "video/mp4", generation: `sha256:${output.sha256}`, sha256: output.sha256, sizeBytes: output.sizeBytes, durationSeconds: technical.durationSeconds, completeDecode: true, width: technical.width, height: technical.height, fps: technical.fps, videoCodec: technical.videoCodec, variantKind: job.reframe.profile === "spatial-flat-4k24" ? "spatial-reframe-edit-source" : "spatial-reframe-proof" },
      },
      worker: { executionId: claim.executionId, buildId: options.buildId, imageDigest: options.imageDigest, attempt: claim.attempt },
    }, job);
    const committed = await store.complete({ claim, receipt, now: options.now() });
    return committed ? { disposition: "completed", jobId: job.jobId, outputSha256: output.sha256 } : { disposition: "claim-lost", jobId: job.jobId };
  } catch (error) {
    if (partialPath) await rm(partialPath, { force: true }).catch(() => undefined);
    if (outputPath && error instanceof TerminalSpatialReframeError && ["spatial-reframe-source-drift", "spatial-reframe-master-drift"].includes(error.code)) await rm(outputPath, { force: true }).catch(() => undefined);
    const terminal = error instanceof TerminalSpatialReframeError || (error instanceof SpatialReframeFfmpegError && !error.retryable);
    const code = error instanceof TerminalSpatialReframeError || error instanceof SpatialReframeFfmpegError ? error.code : "spatial-reframe-worker-retry";
    await (terminal ? store.fail.bind(store) : store.retry.bind(store))({ claim, code, message: message(error), now: options.now() });
    return { disposition: terminal ? "failed" : "retry", jobId: job.jobId, code };
  }
}

export class PostgresLocalSpatialReframeStore implements LocalSpatialReframeStore {
  constructor(private readonly pool: InstanceType<typeof Pool>) {}
  async claim(input: { executionId: string; leaseMs: number; now: Date }) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const selected = await client.query({ text: `SELECT "id","inputJson","resultJson" FROM "StudioWorkflowJob" WHERE "type"=$1 AND "source"=$2 AND ("status"='queued' OR ("status"='processing' AND "updatedAt" < timezone('UTC',now()) - ($3 * interval '1 millisecond'))) ORDER BY "priority" ASC,"createdAt" ASC FOR UPDATE SKIP LOCKED LIMIT 1`, values: [JOB_TYPE, JOB_SOURCE, input.leaseMs] });
      const row = selected.rows[0];
      if (!row) { await client.query("COMMIT"); return null; }
      const attempt = Math.max(0, Number(record(record(row.resultJson).lease).attempt) || 0) + 1;
      const result = await client.query({ text: `UPDATE "StudioWorkflowJob" SET "status"='processing',"startedAt"=COALESCE("startedAt",timezone('UTC',now())),"updatedAt"=timezone('UTC',now()),"error"=NULL,"resultJson"=$2::jsonb WHERE "id"=$1 RETURNING "id","inputJson"`, values: [row.id, JSON.stringify({ state: "processing", lease: { executionId: input.executionId, attempt, claimedAt: input.now.toISOString(), expiresAt: new Date(input.now.getTime() + input.leaseMs).toISOString() }, sourceMediaRemainsImmutable: true })] });
      await client.query("COMMIT");
      return { id: result.rows[0].id, inputJson: result.rows[0].inputJson, attempt, executionId: input.executionId };
    } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; } finally { client.release(); }
  }
  async complete(input: { claim: LocalSpatialReframeClaim; receipt: SpatialRenderResult; now: Date }) { return (await this.pool.query({ text: `UPDATE "StudioWorkflowJob" SET "status"='output-ready',"updatedAt"=timezone('UTC',now()),"completedAt"=NULL,"error"=NULL,"resultJson"=$3::jsonb WHERE "id"=$1 AND "status"='processing' AND "resultJson"->'lease'->>'executionId'=$2`, values: [input.claim.id, input.claim.executionId, JSON.stringify({ state: "output-ready", receipt: input.receipt })] })).rowCount === 1; }
  retry(input: { claim: LocalSpatialReframeClaim; code: string; message: string; now: Date }) { return this.release(input, "queued"); }
  fail(input: { claim: LocalSpatialReframeClaim; code: string; message: string; now: Date }) { return this.release(input, "failed"); }
  private async release(input: { claim: LocalSpatialReframeClaim; code: string; message: string; now: Date }, status: "queued" | "failed") { return (await this.pool.query({ text: `UPDATE "StudioWorkflowJob" SET "status"=$3,"updatedAt"=timezone('UTC',now()),"completedAt"=CASE WHEN $3='failed' THEN timezone('UTC',now()) ELSE NULL END,"error"=$4,"resultJson"=$5::jsonb WHERE "id"=$1 AND "status"='processing' AND "resultJson"->'lease'->>'executionId'=$2`, values: [input.claim.id, input.claim.executionId, status, `${input.code}: ${input.message}`.slice(0, 4_000), JSON.stringify({ state: status, failure: { code: input.code, message: input.message }, lease: { executionId: input.claim.executionId, attempt: input.claim.attempt } })] })).rowCount === 1; }
}

export function newLocalSpatialReframeRuntime(input: { pool: InstanceType<typeof Pool>; outputRoot: string; authorizedSourceRoots: string[]; executionId?: string; leaseMs: number; buildId: string }) { return { store: new PostgresLocalSpatialReframeStore(input.pool), renderer: new FfmpegSpatialReframeRenderer(), options: { executionId: input.executionId ?? randomUUID(), buildId: input.buildId, imageDigest: null, leaseMs: input.leaseMs, outputRoot: input.outputRoot, authorizedSourceRoots: input.authorizedSourceRoots, now: () => new Date() } satisfies LocalSpatialReframeWorkerOptions }; }

async function authorizedRoots(configured: string[]) { if (!configured.length) throw new TerminalSpatialReframeError("spatial-reframe-source-roots-missing", "No local source roots were configured."); return Promise.all(configured.map(async (root) => { const resolved = await realpath(root).catch(() => ""); if (!resolved || resolved === path.parse(resolved).root || resolved === path.resolve(process.env.HOME || "/nonexistent")) throw new TerminalSpatialReframeError("spatial-reframe-source-root-rejected", "A spatial source root is missing or too broad."); return resolved; })); }
async function authorizedOutputRoot(configured: string) { const resolved = path.resolve(configured); await mkdir(resolved, { recursive: true, mode: 0o700 }); const root = await realpath(resolved); if (root === path.parse(root).root || root === path.resolve(process.env.HOME || "/nonexistent")) throw new TerminalSpatialReframeError("spatial-reframe-output-root-rejected", "The spatial output root is too broad."); return root; }
async function authorizedSource(roots: string[], locator: string) { const source = await realpath(locator).catch(() => ""); if (!source || !roots.some((root) => inside(root, source))) throw new TerminalSpatialReframeError("spatial-reframe-source-path-rejected", "A spatial source escaped the authorized media vaults."); return source; }
async function authorizedTarget(root: string, locator: string) { const requested = path.resolve(locator); if (!requested.toLowerCase().endsWith(".mp4")) throw new TerminalSpatialReframeError("spatial-reframe-target-path-rejected", "The spatial output escaped its authorized media vault."); await mkdir(path.dirname(requested), { recursive: true, mode: 0o700 }); const canonical = path.join(await realpath(path.dirname(requested)), path.basename(requested)); if (!inside(root, canonical)) throw new TerminalSpatialReframeError("spatial-reframe-target-path-rejected", "The spatial output escaped its authorized media vault."); return canonical; }
async function inspect(filePath: string) { const file = await stat(filePath); if (!file.isFile() || file.size <= 0) throw new TerminalSpatialReframeError("spatial-reframe-file-unavailable", "A spatial source or result is unavailable."); return { sizeBytes: file.size, sha256: await sha256File(filePath) }; }
async function flush(filePath: string) { const handle = await open(filePath, "r+"); try { await handle.sync(); await handle.chmod(0o600); } finally { await handle.close(); } }
function inside(root: string, candidate: string) { const relative = path.relative(root, candidate); return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative)); }
function digest(value: string) { return createHash("sha256").update(value).digest("hex"); }
function record(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function message(error: unknown) { return error instanceof Error && error.message.trim() ? error.message : String(error); }
