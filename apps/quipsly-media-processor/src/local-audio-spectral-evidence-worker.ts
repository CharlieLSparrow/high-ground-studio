import { randomUUID } from "node:crypto";
import { mkdir, realpath, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  AUDIO_SPECTRAL_EVIDENCE_CONTRACT_VERSION,
  AUDIO_SPECTRAL_EVIDENCE_RESULT_KIND,
  parseAudioSpectralEvidenceJob,
  parseAudioSpectralEvidenceResult,
  type AudioSpectralEvidenceJob,
  type AudioSpectralEvidenceResult,
} from "@high-ground/quipsly-media-processing";
import pg from "pg";

import { AudioSpectralDecodeError, FfmpegAudioSpectralAnalyzer } from "./audio-spectral-evidence-ffmpeg.js";
import { sha256File } from "./transcoder.js";

const { Pool } = pg;
const JOB_TYPE = "audio-spectral-evidence";

export type LocalAudioSpectralClaim = { id: string; inputJson: unknown; attempt: number; executionId: string };
export interface LocalAudioSpectralStore {
  claim(input: { executionId: string; leaseMs: number; now: Date }): Promise<LocalAudioSpectralClaim | null>;
  complete(input: { claim: LocalAudioSpectralClaim; receipt: AudioSpectralEvidenceResult; now: Date }): Promise<boolean>;
  retry(input: { claim: LocalAudioSpectralClaim; code: string; message: string; now: Date }): Promise<boolean>;
  fail(input: { claim: LocalAudioSpectralClaim; code: string; message: string; now: Date }): Promise<boolean>;
}

export interface LocalAudioSpectralAnalyzer {
  analyze(inputPath: string, outputPath: string): ReturnType<FfmpegAudioSpectralAnalyzer["analyze"]>;
}

export type LocalAudioSpectralWorkerOptions = {
  executionId: string;
  buildId: string;
  imageDigest: string | null;
  leaseMs: number;
  localMediaRoot: string;
  now: () => Date;
};

export type LocalAudioSpectralWorkerResult =
  | { disposition: "idle" }
  | { disposition: "completed"; jobId: string; tileCount: number; packSizeBytes: number }
  | { disposition: "claim-lost"; jobId: string }
  | { disposition: "retry"; jobId: string; code: string }
  | { disposition: "failed"; jobId: string; code: string };

class TerminalAudioSpectralError extends Error {
  readonly code: string;
  constructor(code: string, message: string) { super(message); this.code = code; this.name = "TerminalAudioSpectralError"; }
}

export async function runOneLocalAudioSpectralEvidenceJob(
  store: LocalAudioSpectralStore,
  analyzer: LocalAudioSpectralAnalyzer,
  options: LocalAudioSpectralWorkerOptions,
): Promise<LocalAudioSpectralWorkerResult> {
  const claim = await store.claim({ executionId: options.executionId, leaseMs: options.leaseMs, now: options.now() });
  if (!claim) return { disposition: "idle" };
  let job: AudioSpectralEvidenceJob;
  try {
    job = parseAudioSpectralEvidenceJob(claim.inputJson, claim.id);
  } catch (error) {
    await store.fail({ claim, code: "audio-spectral-job-invalid", message: errorMessage(error), now: options.now() });
    return { disposition: "failed", jobId: claim.id, code: "audio-spectral-job-invalid" };
  }
  if (job.source.provider !== "local") {
    await store.fail({ claim, code: "audio-spectral-provider-unsupported", message: "The local spectral worker accepts local media only.", now: options.now() });
    return { disposition: "failed", jobId: job.jobId, code: "audio-spectral-provider-unsupported" };
  }
  try {
    const root = await authorizedRoot(options.localMediaRoot);
    const sourcePath = await authorizedSource(root, job.source.locator);
    const before = await inspectSource(sourcePath);
    assertSource(job, before);
    const outputPath = path.join(root, "analysis", "spectral", job.source.sha256.slice(0, 16), `${job.jobId}.qspx`);
    await mkdir(path.dirname(outputPath), { recursive: true, mode: 0o700 });
    const artifact = await analyzer.analyze(sourcePath, outputPath);
    const after = await inspectSource(sourcePath);
    assertSource(job, after);
    if (before.sha256 !== after.sha256 || before.sizeBytes !== after.sizeBytes) throw new TerminalAudioSpectralError("audio-spectral-source-drift", "The immutable source changed during spectral analysis.");
    const pack = await stat(outputPath);
    if (!pack.isFile() || pack.size !== artifact.pyramid.pack.sizeBytes || await sha256File(outputPath) !== artifact.pyramid.pack.sha256) {
      throw new TerminalAudioSpectralError("audio-spectral-pack-integrity", "The completed spectral pack failed independent byte verification.");
    }
    const receipt = parseAudioSpectralEvidenceResult({
      kind: AUDIO_SPECTRAL_EVIDENCE_RESULT_KIND,
      version: AUDIO_SPECTRAL_EVIDENCE_CONTRACT_VERSION,
      jobId: job.jobId,
      completedAt: options.now().toISOString(),
      source: job.source,
      media: artifact.media,
      pyramid: artifact.pyramid,
      analyzer: { ffmpegVersion: artifact.ffmpegVersion, completeDecode: true, detailFrameCount: artifact.detailFrameCount },
      worker: { executionId: claim.executionId, buildId: options.buildId, imageDigest: options.imageDigest, attempt: claim.attempt },
      boundaries: {
        originalRemainsSourceTruth: true,
        analysisDoesNotChangeMedia: true,
        visualEvidenceIsNotAnEqDecision: true,
        repairCandidatesRequirePlaybackReview: true,
      },
    }, job);
    const committed = await store.complete({ claim, receipt, now: options.now() });
    return committed
      ? { disposition: "completed", jobId: job.jobId, tileCount: receipt.pyramid.levels.reduce((total, level) => total + level.tileCount, 0), packSizeBytes: receipt.pyramid.pack.sizeBytes }
      : { disposition: "claim-lost", jobId: job.jobId };
  } catch (error) {
    const terminal = error instanceof TerminalAudioSpectralError || (error instanceof AudioSpectralDecodeError && !error.retryable);
    const code = error instanceof TerminalAudioSpectralError || error instanceof AudioSpectralDecodeError ? error.code : "audio-spectral-worker-retry";
    if (terminal) {
      await store.fail({ claim, code, message: errorMessage(error), now: options.now() });
      return { disposition: "failed", jobId: job.jobId, code };
    }
    await store.retry({ claim, code, message: errorMessage(error), now: options.now() });
    return { disposition: "retry", jobId: job.jobId, code };
  }
}

export class PostgresLocalAudioSpectralStore implements LocalAudioSpectralStore {
  private readonly pool: InstanceType<typeof Pool>;

  constructor(pool: InstanceType<typeof Pool>) { this.pool = pool; }

  async claim(input: { executionId: string; leaseMs: number; now: Date }) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const selected = await client.query({
        text: `SELECT "id", "inputJson", "resultJson" FROM "StudioAssetProcessingJob"
               WHERE "type"=$1 AND "inputJson"->'source'->>'provider'='local'
                 AND ("status"='queued' OR ("status"='processing' AND "updatedAt" < $2))
               ORDER BY "createdAt" ASC FOR UPDATE SKIP LOCKED LIMIT 1`,
        values: [JOB_TYPE, new Date(input.now.getTime() - input.leaseMs)],
      });
      const row = selected.rows[0];
      if (!row) { await client.query("COMMIT"); return null; }
      const previous = record(row.resultJson);
      const attempt = Math.max(0, Number(record(previous.lease).attempt) || 0) + 1;
      const updated = await client.query({
        text: `UPDATE "StudioAssetProcessingJob"
               SET "status"='processing', "startedAt"=COALESCE("startedAt",$2), "updatedAt"=$2,
                   "error"=NULL, "resultJson"=$3::jsonb WHERE "id"=$1 RETURNING "id", "inputJson"`,
        values: [row.id, input.now, JSON.stringify({ state: "processing", lease: { executionId: input.executionId, attempt, claimedAt: input.now.toISOString(), expiresAt: new Date(input.now.getTime() + input.leaseMs).toISOString() }, originalRemainsSourceTruth: true })],
      });
      await client.query("COMMIT");
      return { id: updated.rows[0].id, inputJson: updated.rows[0].inputJson, attempt, executionId: input.executionId };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }

  async complete(input: { claim: LocalAudioSpectralClaim; receipt: AudioSpectralEvidenceResult; now: Date }) {
    const result = await this.pool.query({
      text: `UPDATE "StudioAssetProcessingJob" SET "status"='output-ready', "updatedAt"=$3, "completedAt"=NULL,
             "error"=NULL, "resultJson"=$4::jsonb WHERE "id"=$1 AND "status"='processing'
             AND "resultJson"->'lease'->>'executionId'=$2`,
      values: [input.claim.id, input.claim.executionId, input.now, JSON.stringify({ state: "output-ready", receipt: input.receipt })],
    });
    return result.rowCount === 1;
  }

  retry(input: { claim: LocalAudioSpectralClaim; code: string; message: string; now: Date }) { return this.release(input, "queued"); }
  fail(input: { claim: LocalAudioSpectralClaim; code: string; message: string; now: Date }) { return this.release(input, "failed"); }

  private async release(input: { claim: LocalAudioSpectralClaim; code: string; message: string; now: Date }, status: "queued" | "failed") {
    const result = await this.pool.query({
      text: `UPDATE "StudioAssetProcessingJob" SET "status"=$3, "updatedAt"=$4::timestamp,
             "completedAt"=CASE WHEN $3::text='failed' THEN $4::timestamp ELSE NULL::timestamp END, "error"=$5, "resultJson"=$6::jsonb
             WHERE "id"=$1 AND "status"='processing' AND "resultJson"->'lease'->>'executionId'=$2`,
      values: [input.claim.id, input.claim.executionId, status, input.now, `${input.code}: ${input.message}`.slice(0, 4_000), JSON.stringify({ state: status, failure: { code: input.code, message: input.message }, lease: { executionId: input.claim.executionId, attempt: input.claim.attempt }, originalRemainsSourceTruth: true })],
    });
    return result.rowCount === 1;
  }
}

export function newLocalAudioSpectralRuntime(input: { pool: InstanceType<typeof Pool>; localMediaRoot: string; leaseMs: number; buildId: string }) {
  return {
    store: new PostgresLocalAudioSpectralStore(input.pool),
    analyzer: new FfmpegAudioSpectralAnalyzer(),
    options: { executionId: randomUUID(), buildId: input.buildId, imageDigest: null, leaseMs: input.leaseMs, localMediaRoot: input.localMediaRoot, now: () => new Date() } satisfies LocalAudioSpectralWorkerOptions,
  };
}

async function authorizedRoot(configuredRoot: string) {
  const temporaryRoot = await realpath(tmpdir());
  const resolved = path.resolve(configuredRoot);
  await mkdir(resolved, { recursive: true, mode: 0o700 });
  const root = await realpath(resolved);
  if (root === temporaryRoot || !pathIsInside(temporaryRoot, root)) throw new TerminalAudioSpectralError("audio-spectral-root-rejected", "Local spectral root must be a dedicated directory below the operating-system temporary directory.");
  return root;
}
async function authorizedSource(root: string, locator: string) {
  const source = await realpath(locator).catch(() => "");
  if (!source || !pathIsInside(root, source)) throw new TerminalAudioSpectralError("audio-spectral-source-path-rejected", "Local spectral source escaped the authorized media root.");
  return source;
}
async function inspectSource(sourcePath: string) {
  const source = await stat(sourcePath);
  if (!source.isFile() || source.size <= 0) throw new TerminalAudioSpectralError("audio-spectral-source-unavailable", "Local spectral source is empty or unavailable.");
  return { sizeBytes: source.size, sha256: await sha256File(sourcePath) };
}
function assertSource(job: AudioSpectralEvidenceJob, evidence: { sizeBytes: number; sha256: string }) {
  if (evidence.sizeBytes !== job.source.sizeBytes || evidence.sha256 !== job.source.sha256 || job.source.generation !== `sha256:${evidence.sha256}`) throw new TerminalAudioSpectralError("audio-spectral-source-byte-mismatch", "Local source no longer matches the queued immutable byte receipt.");
}
function pathIsInside(root: string, candidate: string) { const relative = path.relative(root, candidate); return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative)); }
function errorMessage(error: unknown) { return error instanceof Error && error.message.trim() ? error.message : "Audio spectral worker failed."; }
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
