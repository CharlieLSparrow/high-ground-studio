import { randomUUID } from "node:crypto";
import { mkdir, realpath, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  AUDIO_SIGNAL_PROFILE_CONTRACT_VERSION,
  AUDIO_SIGNAL_PROFILE_RESULT_KIND,
  parseAudioSignalProfileJob,
  parseAudioSignalProfileResult,
  type AudioSignalProfileJob,
  type AudioSignalProfileResult,
} from "@high-ground/quipsly-media-processing";
import pg from "pg";

import { AudioSignalProfileDecodeError, FfmpegAudioSignalProfiler } from "./audio-signal-profile-ffmpeg.js";
import { sha256File } from "./transcoder.js";

const { Pool } = pg;
const JOB_TYPE = "audio-signal-profile";
const MAXIMUM_RETRY_ATTEMPTS = 5;

export type LocalAudioSignalProfileClaim = { id: string; inputJson: unknown; attempt: number; executionId: string };

export interface LocalAudioSignalProfileStore {
  claim(input: { executionId: string; leaseMs: number; now: Date }): Promise<LocalAudioSignalProfileClaim | null>;
  complete(input: { claim: LocalAudioSignalProfileClaim; receipt: AudioSignalProfileResult; now: Date }): Promise<boolean>;
  retry(input: { claim: LocalAudioSignalProfileClaim; code: string; message: string; now: Date }): Promise<boolean>;
  fail(input: { claim: LocalAudioSignalProfileClaim; code: string; message: string; now: Date }): Promise<boolean>;
}

export interface LocalAudioSignalProfiler {
  analyze(inputPath: string, options?: { frequencyAnalysis?: boolean }): Promise<Awaited<ReturnType<FfmpegAudioSignalProfiler["analyze"]>>>;
}

export type LocalAudioSignalProfileWorkerOptions = {
  executionId: string;
  buildId: string;
  imageDigest: string | null;
  leaseMs: number;
  localMediaRoot: string;
  now: () => Date;
};

export type LocalAudioSignalProfileWorkerResult =
  | { disposition: "idle" }
  | { disposition: "completed"; jobId: string; windowCount: number }
  | { disposition: "claim-lost"; jobId: string }
  | { disposition: "retry"; jobId: string; code: string }
  | { disposition: "failed"; jobId: string; code: string };

class TerminalAudioSignalProfileError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "TerminalAudioSignalProfileError";
    this.code = code;
  }
}

export async function runOneLocalAudioSignalProfileJob(
  store: LocalAudioSignalProfileStore,
  profiler: LocalAudioSignalProfiler,
  options: LocalAudioSignalProfileWorkerOptions,
): Promise<LocalAudioSignalProfileWorkerResult> {
  const claim = await store.claim({ executionId: options.executionId, leaseMs: options.leaseMs, now: options.now() });
  if (!claim) return { disposition: "idle" };
  let job: AudioSignalProfileJob;
  try {
    job = parseAudioSignalProfileJob(claim.inputJson, claim.id);
  } catch (error) {
    await store.fail({ claim, code: "audio-signal-job-invalid", message: errorMessage(error), now: options.now() });
    return { disposition: "failed", jobId: claim.id, code: "audio-signal-job-invalid" };
  }
  if (job.source.provider !== "local") {
    await store.fail({ claim, code: "audio-signal-provider-unsupported", message: "The local signal worker accepts local media only.", now: options.now() });
    return { disposition: "failed", jobId: job.jobId, code: "audio-signal-provider-unsupported" };
  }
  try {
    const root = await authorizedRoot(options.localMediaRoot);
    const sourcePath = await authorizedSource(root, job.source.locator);
    const before = await inspectSource(sourcePath);
    assertSource(job, before);
    const profile = await profiler.analyze(sourcePath, { frequencyAnalysis: Boolean(job.analyzer.frequencyAnalysis) });
    const after = await inspectSource(sourcePath);
    assertSource(job, after);
    if (before.sha256 !== after.sha256 || before.sizeBytes !== after.sizeBytes) {
      throw new TerminalAudioSignalProfileError("audio-signal-source-drift", "The immutable source changed during complete-decode signal analysis.");
    }
    const receipt = parseAudioSignalProfileResult({
      kind: AUDIO_SIGNAL_PROFILE_RESULT_KIND,
      version: AUDIO_SIGNAL_PROFILE_CONTRACT_VERSION,
      jobId: job.jobId,
      completedAt: options.now().toISOString(),
      source: job.source,
      media: profile.media,
      audioSignal: profile.audioSignal,
      analyzer: {
        algorithm: "quipsly-audio-signal-window-v1",
        ffmpegVersion: profile.ffmpegVersion,
        completeDecode: true,
        maximumWindows: 1_200,
        frequencyAnalysis: job.analyzer.frequencyAnalysis ? {
          algorithm: job.analyzer.frequencyAnalysis.algorithm,
          maximumBands: 6,
          maximumWindows: 1_200,
          completeDecode: true,
        } : null,
      },
      worker: {
        executionId: claim.executionId,
        buildId: options.buildId,
        imageDigest: options.imageDigest,
        attempt: claim.attempt,
      },
      boundaries: {
        originalRemainsSourceTruth: true,
        analysisDoesNotChangeMedia: true,
        observationsRequireHumanInterpretation: true,
      },
    }, job);
    const committed = await store.complete({ claim, receipt, now: options.now() });
    return committed
      ? { disposition: "completed", jobId: job.jobId, windowCount: receipt.audioSignal.waveform.length }
      : { disposition: "claim-lost", jobId: job.jobId };
  } catch (error) {
    const terminal = error instanceof TerminalAudioSignalProfileError
      || (error instanceof AudioSignalProfileDecodeError && !error.retryable);
    const code = error instanceof TerminalAudioSignalProfileError || error instanceof AudioSignalProfileDecodeError
      ? error.code
      : "audio-signal-worker-retry";
    if (terminal) {
      await store.fail({ claim, code, message: errorMessage(error), now: options.now() });
      return { disposition: "failed", jobId: job.jobId, code };
    }
    if (claim.attempt >= MAXIMUM_RETRY_ATTEMPTS) {
      const exhaustedCode = "audio-signal-retry-exhausted";
      await store.fail({
        claim,
        code: exhaustedCode,
        message: errorMessage(error),
        now: options.now(),
      });
      return { disposition: "failed", jobId: job.jobId, code: exhaustedCode };
    }
    await store.retry({ claim, code, message: errorMessage(error), now: options.now() });
    return { disposition: "retry", jobId: job.jobId, code };
  }
}

export class PostgresLocalAudioSignalProfileStore implements LocalAudioSignalProfileStore {
  private readonly pool: InstanceType<typeof Pool>;

  constructor(pool: InstanceType<typeof Pool>) { this.pool = pool; }

  async claim(input: { executionId: string; leaseMs: number; now: Date }) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const selected = await client.query({
        text: `
          SELECT "id", "inputJson", "resultJson"
          FROM "StudioAssetProcessingJob"
          WHERE "type" = $1
            AND "inputJson"->'source'->>'provider' = 'local'
            AND ("status" = 'queued' OR ("status" = 'processing' AND "updatedAt" < $2))
          ORDER BY "createdAt" ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        `,
        values: [JOB_TYPE, new Date(input.now.getTime() - input.leaseMs)],
      });
      const row = selected.rows[0];
      if (!row) { await client.query("COMMIT"); return null; }
      const previous = record(row.resultJson);
      const previousLease = record(previous.lease);
      const attempt = Math.max(0, Number(previousLease.attempt) || 0) + 1;
      const updated = await client.query({
        text: `
          UPDATE "StudioAssetProcessingJob"
          SET "status" = 'processing', "startedAt" = COALESCE("startedAt", $2),
              "updatedAt" = $2, "error" = NULL, "resultJson" = $3::jsonb
          WHERE "id" = $1
          RETURNING "id", "inputJson"
        `,
        values: [row.id, input.now, JSON.stringify({
          state: "processing",
          lease: { executionId: input.executionId, attempt, claimedAt: input.now.toISOString(), expiresAt: new Date(input.now.getTime() + input.leaseMs).toISOString() },
          originalRemainsSourceTruth: true,
        })],
      });
      await client.query("COMMIT");
      return { id: updated.rows[0].id, inputJson: updated.rows[0].inputJson, attempt, executionId: input.executionId };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }

  async complete(input: { claim: LocalAudioSignalProfileClaim; receipt: AudioSignalProfileResult; now: Date }) {
    const result = await this.pool.query({
      text: `
        UPDATE "StudioAssetProcessingJob"
        SET "status" = 'output-ready', "updatedAt" = $3, "completedAt" = NULL,
            "error" = NULL, "resultJson" = $4::jsonb
        WHERE "id" = $1 AND "status" = 'processing'
          AND "resultJson"->'lease'->>'executionId' = $2
      `,
      values: [input.claim.id, input.claim.executionId, input.now, JSON.stringify({ state: "output-ready", receipt: input.receipt })],
    });
    return result.rowCount === 1;
  }

  retry(input: { claim: LocalAudioSignalProfileClaim; code: string; message: string; now: Date }) { return this.release(input, "queued"); }
  fail(input: { claim: LocalAudioSignalProfileClaim; code: string; message: string; now: Date }) { return this.release(input, "failed"); }

  private async release(input: { claim: LocalAudioSignalProfileClaim; code: string; message: string; now: Date }, status: "queued" | "failed") {
    const result = await this.pool.query({
      text: `
        UPDATE "StudioAssetProcessingJob"
        SET "status" = $3::text, "updatedAt" = $4::timestamp(3),
            "completedAt" = CASE WHEN $3::text = 'failed' THEN $4::timestamp(3) ELSE NULL::timestamp END,
            "error" = $5, "resultJson" = $6::jsonb
        WHERE "id" = $1 AND "status" = 'processing'
          AND "resultJson"->'lease'->>'executionId' = $2
      `,
      values: [
        input.claim.id,
        input.claim.executionId,
        status,
        input.now,
        `${input.code}: ${input.message}`.slice(0, 4_000),
        JSON.stringify({ state: status, failure: { code: input.code, message: input.message }, lease: { executionId: input.claim.executionId, attempt: input.claim.attempt }, originalRemainsSourceTruth: true }),
      ],
    });
    return result.rowCount === 1;
  }
}

export function newLocalAudioSignalProfileRuntime(input: { pool: InstanceType<typeof Pool>; localMediaRoot: string; leaseMs: number; buildId: string }) {
  return {
    store: new PostgresLocalAudioSignalProfileStore(input.pool),
    profiler: new FfmpegAudioSignalProfiler(),
    options: {
      executionId: randomUUID(),
      buildId: input.buildId,
      imageDigest: null,
      leaseMs: input.leaseMs,
      localMediaRoot: input.localMediaRoot,
      now: () => new Date(),
    } satisfies LocalAudioSignalProfileWorkerOptions,
  };
}

async function authorizedRoot(configuredRoot: string) {
  const temporaryRoot = await realpath(tmpdir());
  const resolved = path.resolve(configuredRoot);
  await mkdir(resolved, { recursive: true, mode: 0o700 });
  const root = await realpath(resolved);
  if (root === temporaryRoot || !pathIsInside(temporaryRoot, root)) throw new TerminalAudioSignalProfileError("audio-signal-root-rejected", "Local signal root must be a dedicated directory below the operating-system temporary directory.");
  return root;
}

async function authorizedSource(root: string, locator: string) {
  const source = await realpath(locator).catch(() => "");
  if (!source || !pathIsInside(root, source)) throw new TerminalAudioSignalProfileError("audio-signal-source-path-rejected", "Local signal source escaped the authorized media root.");
  return source;
}

async function inspectSource(sourcePath: string) {
  const source = await stat(sourcePath);
  if (!source.isFile() || source.size <= 0) throw new TerminalAudioSignalProfileError("audio-signal-source-unavailable", "Local signal source is empty or unavailable.");
  return { sizeBytes: source.size, sha256: await sha256File(sourcePath) };
}

function assertSource(job: AudioSignalProfileJob, evidence: { sizeBytes: number; sha256: string }) {
  if (evidence.sizeBytes !== job.source.sizeBytes || evidence.sha256 !== job.source.sha256 || job.source.generation !== `sha256:${evidence.sha256}`) {
    throw new TerminalAudioSignalProfileError("audio-signal-source-byte-mismatch", "Local source no longer matches the queued immutable byte receipt.");
  }
}

function pathIsInside(root: string, candidate: string) { const relative = path.relative(root, candidate); return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative)); }
function errorMessage(error: unknown) { return error instanceof Error && error.message.trim() ? error.message : "Audio signal profile worker failed."; }
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
