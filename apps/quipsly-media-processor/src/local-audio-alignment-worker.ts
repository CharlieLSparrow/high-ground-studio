import { randomUUID } from "node:crypto";
import { mkdir, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  newAudioAlignmentResult,
  parseAudioAlignmentJob,
  type AudioAlignmentJob,
  type AudioAlignmentResult,
} from "@high-ground/quipsly-media-processing";
import pg from "pg";

import { FfmpegAudioAlignmentAnalyzer } from "./audio-alignment-ffmpeg.js";

const { Pool } = pg;
const JOB_TYPE = "audio-alignment";

export type LocalAudioAlignmentClaim = {
  id: string;
  inputJson: unknown;
  attempt: number;
  executionId: string;
};

export interface LocalAudioAlignmentStore {
  claim(input: { executionId: string; leaseMs: number; now: Date }): Promise<LocalAudioAlignmentClaim | null>;
  complete(input: { claim: LocalAudioAlignmentClaim; receipt: AudioAlignmentResult; now: Date }): Promise<boolean>;
  retry(input: { claim: LocalAudioAlignmentClaim; code: string; message: string; now: Date }): Promise<boolean>;
  fail(input: { claim: LocalAudioAlignmentClaim; code: string; message: string; now: Date }): Promise<boolean>;
}

export type LocalAudioAlignmentWorkerOptions = {
  executionId: string;
  buildId: string;
  imageDigest: string | null;
  leaseMs: number;
  localMediaRoot: string;
  now: () => Date;
};

export type LocalAudioAlignmentWorkerResult =
  | { disposition: "idle" }
  | { disposition: "completed"; jobId: string; qualified: boolean }
  | { disposition: "claim-lost"; jobId: string }
  | { disposition: "retry"; jobId: string; code: string }
  | { disposition: "failed"; jobId: string; code: string };

class TerminalAudioAlignmentError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "TerminalAudioAlignmentError";
    this.code = code;
  }
}

export async function runOneLocalAudioAlignmentJob(
  store: LocalAudioAlignmentStore,
  analyzer: FfmpegAudioAlignmentAnalyzer,
  options: LocalAudioAlignmentWorkerOptions,
): Promise<LocalAudioAlignmentWorkerResult> {
  const claim = await store.claim({ executionId: options.executionId, leaseMs: options.leaseMs, now: options.now() });
  if (!claim) return { disposition: "idle" };
  let job: AudioAlignmentJob;
  try {
    job = parseAudioAlignmentJob(claim.inputJson, claim.id);
  } catch (error) {
    await store.fail({ claim, code: "audio-alignment-job-invalid", message: message(error), now: options.now() });
    return { disposition: "failed", jobId: claim.id, code: "audio-alignment-job-invalid" };
  }
  if (job.spine.provider !== "local" || job.target.provider !== "local") {
    await store.fail({
      claim,
      code: "audio-alignment-provider-unsupported",
      message: "The local alignment worker accepts two local sources only.",
      now: options.now(),
    });
    return { disposition: "failed", jobId: job.jobId, code: "audio-alignment-provider-unsupported" };
  }
  try {
    const root = await authorizedRoot(options.localMediaRoot);
    const [spinePath, targetPath] = await Promise.all([
      authorizedSource(root, job.spine.locator),
      authorizedSource(root, job.target.locator),
    ]);
    const evidence = await analyzer.analyze({
      spinePath,
      targetPath,
      spine: job.spine,
      target: job.target,
      options: job.proposal,
      createdAt: options.now().toISOString(),
    });
    const receipt = newAudioAlignmentResult({
      jobId: job.jobId,
      completedAt: options.now().toISOString(),
      evidence,
      worker: {
        executionId: claim.executionId,
        buildId: options.buildId,
        imageDigest: options.imageDigest,
        attempt: claim.attempt,
      },
    });
    const committed = await store.complete({ claim, receipt, now: options.now() });
    return committed
      ? { disposition: "completed", jobId: job.jobId, qualified: evidence.qualification.qualifiedForAuthorizedAgentReview }
      : { disposition: "claim-lost", jobId: job.jobId };
  } catch (error) {
    const terminal = classifyTerminal(error);
    if (terminal) {
      await store.fail({ claim, code: terminal.code, message: terminal.message, now: options.now() });
      return { disposition: "failed", jobId: job.jobId, code: terminal.code };
    }
    await store.retry({ claim, code: "audio-alignment-worker-retry", message: message(error), now: options.now() });
    return { disposition: "retry", jobId: job.jobId, code: "audio-alignment-worker-retry" };
  }
}

export class PostgresLocalAudioAlignmentStore implements LocalAudioAlignmentStore {
  private readonly pool: InstanceType<typeof Pool>;

  constructor(pool: InstanceType<typeof Pool>) {
    this.pool = pool;
  }

  async claim(input: { executionId: string; leaseMs: number; now: Date }) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const selected = await client.query({
        text: `
          SELECT "id", "inputJson", "resultJson"
          FROM "StudioAssetProcessingJob"
          WHERE "type" = $1
            AND "inputJson"->'spine'->>'provider' = 'local'
            AND "inputJson"->'target'->>'provider' = 'local'
            AND ("status" = 'queued' OR ("status" = 'processing' AND "updatedAt" < $2))
          ORDER BY "createdAt" ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        `,
        values: [JOB_TYPE, new Date(input.now.getTime() - input.leaseMs)],
      });
      const row = selected.rows[0];
      if (!row) { await client.query("COMMIT"); return null; }
      const previousLease = object(object(row.resultJson).lease);
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
          lease: {
            executionId: input.executionId,
            attempt,
            claimedAt: input.now.toISOString(),
            expiresAt: new Date(input.now.getTime() + input.leaseMs).toISOString(),
          },
          sourceBytesImmutable: true,
        })],
      });
      await client.query("COMMIT");
      return { id: updated.rows[0].id, inputJson: updated.rows[0].inputJson, attempt, executionId: input.executionId };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async complete(input: { claim: LocalAudioAlignmentClaim; receipt: AudioAlignmentResult; now: Date }) {
    const result = await this.pool.query({
      text: `
        UPDATE "StudioAssetProcessingJob"
        SET "status" = 'output-ready', "updatedAt" = $3, "error" = NULL,
            "resultJson" = $4::jsonb
        WHERE "id" = $1 AND "status" = 'processing'
          AND "resultJson"->'lease'->>'executionId' = $2
      `,
      values: [input.claim.id, input.claim.executionId, input.now, JSON.stringify({ state: "output-ready", receipt: input.receipt })],
    });
    return result.rowCount === 1;
  }

  retry(input: { claim: LocalAudioAlignmentClaim; code: string; message: string; now: Date }) {
    return this.release(input, "queued");
  }
  fail(input: { claim: LocalAudioAlignmentClaim; code: string; message: string; now: Date }) {
    return this.release(input, "failed");
  }

  private async release(
    input: { claim: LocalAudioAlignmentClaim; code: string; message: string; now: Date },
    status: "queued" | "failed",
  ) {
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
        JSON.stringify({
          state: status,
          failure: { code: input.code, message: input.message },
          lease: { executionId: input.claim.executionId, attempt: input.claim.attempt },
          sourceBytesImmutable: true,
        }),
      ],
    });
    return result.rowCount === 1;
  }
}

export function newLocalAudioAlignmentRuntime(input: {
  pool: InstanceType<typeof Pool>;
  localMediaRoot: string;
  leaseMs: number;
  buildId: string;
}) {
  return {
    store: new PostgresLocalAudioAlignmentStore(input.pool),
    analyzer: new FfmpegAudioAlignmentAnalyzer(),
    options: {
      executionId: randomUUID(),
      buildId: input.buildId,
      imageDigest: null,
      leaseMs: input.leaseMs,
      localMediaRoot: input.localMediaRoot,
      now: () => new Date(),
    } satisfies LocalAudioAlignmentWorkerOptions,
  };
}

async function authorizedRoot(configuredRoot: string) {
  const temporaryRoot = await realpath(tmpdir());
  const resolved = path.resolve(configuredRoot);
  await mkdir(resolved, { recursive: true, mode: 0o700 });
  const canonical = await realpath(resolved);
  if (canonical === temporaryRoot || !inside(temporaryRoot, canonical)) {
    throw new TerminalAudioAlignmentError("audio-alignment-root-rejected", "Alignment media root must be a dedicated directory below the operating-system temporary directory.");
  }
  return canonical;
}

async function authorizedSource(root: string, candidate: string) {
  const canonical = await realpath(candidate).catch(() => "");
  if (!canonical || !inside(root, canonical)) {
    throw new TerminalAudioAlignmentError("audio-alignment-source-path-rejected", "Alignment source escaped the authorized local media root.");
  }
  return canonical;
}

function inside(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function classifyTerminal(error: unknown) {
  if (error instanceof TerminalAudioAlignmentError) return error;
  const detail = message(error);
  if (/exceeds|effectively silent|does not match|requires|invalid|non-empty|no complete float|must be|outside/i.test(detail)) {
    return new TerminalAudioAlignmentError("audio-alignment-evidence-unavailable", detail);
  }
  return null;
}
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function message(error: unknown) {
  return error instanceof Error && error.message.trim() ? error.message : "Audio alignment failed without a diagnostic.";
}
