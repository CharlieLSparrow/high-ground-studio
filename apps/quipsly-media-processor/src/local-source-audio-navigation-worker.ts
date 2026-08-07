import { mkdir, realpath, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  newSourceAudioNavigationResult,
  parseSourceAudioNavigationJob,
  type SourceAudioNavigationJob,
  type SourceAudioNavigationResult,
} from "@high-ground/quipsly-media-processing";
import type pg from "pg";

import {
  AudioSignalProfileDecodeError,
  FfmpegAudioSignalProfiler,
  type FfmpegAudioSignalProfile,
} from "./audio-signal-profile-ffmpeg.js";
import { sha256File } from "./transcoder.js";

const JOB_TYPE = "source-audio-navigation";
const JOB_SOURCE = "source-story.audio-navigation";

type Pool = InstanceType<typeof pg.Pool>;

export type LocalSourceAudioNavigationClaim = {
  id: string;
  inputJson: unknown;
  attempt: number;
  executionId: string;
};

export type ResolvedSourceAudioNavigationInput = {
  projectId: string;
  sourceRevisionId: string;
  sourceIdentitySha256: string;
  sourceContentSha256: string;
  derivativeId: string;
  locator: string;
  generation: string;
  contentSha256: string;
  sizeBytes: number;
  mimeType: string;
  durationSeconds: number;
  status: string;
  storageProvider: string;
};

export interface SourceAudioNavigationAnalyzer {
  analyze(
    inputPath: string,
    options: { frequencyAnalysis: true },
  ): Promise<FfmpegAudioSignalProfile>;
}

export interface LocalSourceAudioNavigationStore {
  claim(input: {
    executionId: string;
    leaseMs: number;
    now: Date;
  }): Promise<LocalSourceAudioNavigationClaim | null>;
  resolve(
    claim: LocalSourceAudioNavigationClaim,
    job: SourceAudioNavigationJob,
  ): Promise<ResolvedSourceAudioNavigationInput>;
  complete(input: {
    claim: LocalSourceAudioNavigationClaim;
    receipt: SourceAudioNavigationResult;
    now: Date;
  }): Promise<boolean>;
  retry(input: {
    claim: LocalSourceAudioNavigationClaim;
    code: string;
    message: string;
    now: Date;
  }): Promise<boolean>;
  fail(input: {
    claim: LocalSourceAudioNavigationClaim;
    code: string;
    message: string;
    now: Date;
  }): Promise<boolean>;
}

export type LocalSourceAudioNavigationOptions = {
  executionId: string;
  buildId: string;
  leaseMs: number;
  localMediaRoot: string;
  now: () => Date;
};

export type LocalSourceAudioNavigationResult =
  | { disposition: "idle" }
  | { disposition: "completed"; jobId: string; windowCount: number }
  | { disposition: "claim-lost"; jobId: string }
  | { disposition: "retry"; jobId: string; code: string }
  | { disposition: "failed"; jobId: string; code: string };

class SourceAudioNavigationTerminalError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "SourceAudioNavigationTerminalError";
  }
}

export async function runOneLocalSourceAudioNavigationJob(
  store: LocalSourceAudioNavigationStore,
  analyzer: SourceAudioNavigationAnalyzer,
  options: LocalSourceAudioNavigationOptions,
): Promise<LocalSourceAudioNavigationResult> {
  const claim = await store.claim({
    executionId: options.executionId,
    leaseMs: options.leaseMs,
    now: options.now(),
  });
  if (!claim) return { disposition: "idle" };
  let job: SourceAudioNavigationJob;
  try {
    job = parseSourceAudioNavigationJob(claim.inputJson, claim.id);
  } catch (error) {
    await store.fail({
      claim,
      code: "source-audio-navigation-job-invalid",
      message: errorMessage(error, "The audio-navigation job is invalid."),
      now: options.now(),
    });
    return {
      disposition: "failed",
      jobId: claim.id,
      code: "source-audio-navigation-job-invalid",
    };
  }
  try {
    const resolved = await store.resolve(claim, job);
    assertResolved(job, resolved);
    const root = await authorizedRoot(options.localMediaRoot);
    const inputPath = await authorizedExistingPath(root, resolved.locator);
    const before = await inspectInput(inputPath);
    assertInputBytes(job, before);
    const profile = await analyzer.analyze(inputPath, {
      frequencyAnalysis: true,
    });
    const after = await inspectInput(inputPath);
    assertInputBytes(job, after);
    if (
      before.sha256 !== after.sha256 ||
      before.sizeBytes !== after.sizeBytes
    ) {
      throw new SourceAudioNavigationTerminalError(
        "source-audio-navigation-input-drift",
        "The collaboration proxy changed during complete-decode audio analysis.",
      );
    }
    const receipt = newSourceAudioNavigationResult({
      jobId: job.jobId,
      completedAt: options.now().toISOString(),
      source: job.source,
      input: {
        ...job.input,
        observedContentSha256: after.sha256,
        observedSizeBytes: after.sizeBytes,
      },
      media: profile.media,
      audioSignal: profile.audioSignal,
      analyzer: {
        profile: job.analyzer.profile,
        algorithm: job.analyzer.algorithm,
        ffmpegVersion: profile.ffmpegVersion,
        completeDecode: true,
        maximumWindows: job.analyzer.maximumWindows,
        frequencyAnalysis: {
          algorithm: job.analyzer.frequencyAnalysis.algorithm,
          maximumBands: job.analyzer.frequencyAnalysis.maximumBands,
          maximumWindows: job.analyzer.frequencyAnalysis.maximumWindows,
          completeDecode: true,
        },
      },
      worker: {
        executionId: claim.executionId,
        buildId: options.buildId,
        attempt: claim.attempt,
      },
    });
    const committed = await store.complete({
      claim,
      receipt,
      now: options.now(),
    });
    return committed
      ? {
          disposition: "completed",
          jobId: job.jobId,
          windowCount: receipt.audioSignal.waveform.length,
        }
      : { disposition: "claim-lost", jobId: job.jobId };
  } catch (error) {
    const terminal =
      error instanceof SourceAudioNavigationTerminalError ||
      (error instanceof AudioSignalProfileDecodeError && !error.retryable);
    const code =
      error instanceof SourceAudioNavigationTerminalError ||
      error instanceof AudioSignalProfileDecodeError
        ? error.code
        : "source-audio-navigation-worker-retry";
    if (terminal) {
      await store.fail({
        claim,
        code,
        message: errorMessage(error, "Audio navigation failed."),
        now: options.now(),
      });
      return { disposition: "failed", jobId: job.jobId, code };
    }
    await store.retry({
      claim,
      code,
      message: errorMessage(error, "Audio navigation needs retry."),
      now: options.now(),
    });
    return { disposition: "retry", jobId: job.jobId, code };
  }
}

export class PostgresLocalSourceAudioNavigationStore implements LocalSourceAudioNavigationStore {
  constructor(private readonly pool: Pool) {}

  async claim(input: { executionId: string; leaseMs: number; now: Date }) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const staleBefore = new Date(input.now.getTime() - input.leaseMs);
      const selected = await client.query({
        text: `
          SELECT "id", "inputJson", "resultJson"
          FROM "StudioWorkflowJob"
          WHERE "type"=$1 AND "source"=$2
            AND "inputJson"->'input'->>'provider'='local'
            AND ("status"='queued' OR ("status"='processing' AND "updatedAt" < timezone('UTC',$3::timestamptz)))
          ORDER BY "priority" ASC, "createdAt" ASC
          FOR UPDATE SKIP LOCKED LIMIT 1
        `,
        values: [JOB_TYPE, JOB_SOURCE, staleBefore],
      });
      const row = selected.rows[0];
      if (!row) {
        await client.query("COMMIT");
        return null;
      }
      const previous = record(row.resultJson);
      const previousLease = record(previous.lease);
      const attempt = Math.max(0, Number(previousLease.attempt) || 0) + 1;
      const updated = await client.query({
        text: `
          UPDATE "StudioWorkflowJob"
          SET "status"='processing', "startedAt"=COALESCE("startedAt",timezone('UTC',$2::timestamptz)),
              "updatedAt"=timezone('UTC',$2::timestamptz), "error"=NULL, "resultJson"=$3::jsonb
          WHERE "id"=$1 RETURNING "id","inputJson"
        `,
        values: [
          row.id,
          input.now,
          JSON.stringify({
            ...previous,
            state: "processing",
            lease: {
              executionId: input.executionId,
              attempt,
              claimedAt: input.now.toISOString(),
              expiresAt: new Date(
                input.now.getTime() + input.leaseMs,
              ).toISOString(),
            },
            originalRemainsSourceTruth: true,
            inputDerivativeRemainsUnchanged: true,
            analysisDoesNotChangeMedia: true,
          }),
        ],
      });
      await client.query("COMMIT");
      return {
        id: updated.rows[0].id,
        inputJson: updated.rows[0].inputJson,
        attempt,
        executionId: input.executionId,
      } satisfies LocalSourceAudioNavigationClaim;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async resolve(
    _claim: LocalSourceAudioNavigationClaim,
    job: SourceAudioNavigationJob,
  ) {
    const result = await this.pool.query({
      text: `
        SELECT d."projectId", d."sourceRevisionId", d."id" AS "derivativeId", d."locator", d."generation",
               d."contentSha256", d."sizeBytes", d."mimeType", d."durationSeconds", d."status", d."storageProvider",
               s."identitySha256" AS "sourceIdentitySha256", s."contentSha256" AS "sourceContentSha256"
        FROM "StudioMediaDerivative" d
        JOIN "StudioMediaSourceRevision" s ON s."id"=d."sourceRevisionId"
        WHERE d."id"=$1 AND d."sourceRevisionId"=$2 AND d."projectId"=$3
      `,
      values: [
        job.input.derivativeId,
        job.source.sourceRevisionId,
        job.projectId,
      ],
    });
    const row = result.rows[0];
    if (!row) {
      throw new SourceAudioNavigationTerminalError(
        "source-audio-navigation-input-missing",
        "The exact collaboration proxy no longer exists.",
      );
    }
    return {
      projectId: row.projectId,
      sourceRevisionId: row.sourceRevisionId,
      sourceIdentitySha256: row.sourceIdentitySha256,
      sourceContentSha256: row.sourceContentSha256,
      derivativeId: row.derivativeId,
      locator: row.locator,
      generation: row.generation,
      contentSha256: row.contentSha256,
      sizeBytes: Number(row.sizeBytes),
      mimeType: row.mimeType,
      durationSeconds: Number(row.durationSeconds),
      status: row.status,
      storageProvider: row.storageProvider,
    };
  }

  async complete(input: {
    claim: LocalSourceAudioNavigationClaim;
    receipt: SourceAudioNavigationResult;
    now: Date;
  }) {
    const result = await this.pool.query({
      text: `
        UPDATE "StudioWorkflowJob"
        SET "status"='output-ready', "updatedAt"=timezone('UTC',$3::timestamptz),
            "completedAt"=timezone('UTC',$3::timestamptz), "error"=NULL, "resultJson"=$4::jsonb
        WHERE "id"=$1 AND "status"='processing'
          AND "resultJson"->'lease'->>'executionId'=$2
      `,
      values: [
        input.claim.id,
        input.claim.executionId,
        input.now,
        JSON.stringify({
          state: "output-ready",
          receipt: input.receipt,
          originalRemainsSourceTruth: true,
          inputDerivativeRemainsUnchanged: true,
          analysisDoesNotChangeMedia: true,
        }),
      ],
    });
    return result.rowCount === 1;
  }

  retry(input: {
    claim: LocalSourceAudioNavigationClaim;
    code: string;
    message: string;
    now: Date;
  }) {
    return this.release(input, "queued");
  }

  fail(input: {
    claim: LocalSourceAudioNavigationClaim;
    code: string;
    message: string;
    now: Date;
  }) {
    return this.release(input, "failed");
  }

  private async release(
    input: {
      claim: LocalSourceAudioNavigationClaim;
      code: string;
      message: string;
      now: Date;
    },
    status: "queued" | "failed",
  ) {
    const current = await this.pool.query({
      text: `SELECT "resultJson" FROM "StudioWorkflowJob" WHERE "id"=$1`,
      values: [input.claim.id],
    });
    const previous = record(current.rows[0]?.resultJson);
    const result = await this.pool.query({
      text: `
        UPDATE "StudioWorkflowJob"
        SET "status"=$3, "updatedAt"=timezone('UTC',$4::timestamptz),
            "completedAt"=CASE WHEN $3='failed' THEN timezone('UTC',$4::timestamptz) ELSE NULL END,
            "error"=$5, "resultJson"=$6::jsonb
        WHERE "id"=$1 AND "status"='processing'
          AND "resultJson"->'lease'->>'executionId'=$2
      `,
      values: [
        input.claim.id,
        input.claim.executionId,
        status,
        input.now,
        `${input.code}: ${input.message}`.slice(0, 4_000),
        JSON.stringify({
          ...previous,
          state: status,
          failure: {
            code: input.code,
            message: input.message,
            failedAt: input.now.toISOString(),
            attempt: input.claim.attempt,
          },
          lease: {
            executionId: input.claim.executionId,
            attempt: input.claim.attempt,
          },
          originalRemainsSourceTruth: true,
          inputDerivativeRemainsUnchanged: true,
          analysisDoesNotChangeMedia: true,
        }),
      ],
    });
    return result.rowCount === 1;
  }
}

export function newLocalSourceAudioNavigationRuntime(input: {
  pool: Pool;
  executionId: string;
  localMediaRoot: string;
  leaseMs: number;
  buildId: string;
}) {
  return {
    store: new PostgresLocalSourceAudioNavigationStore(input.pool),
    analyzer: new FfmpegAudioSignalProfiler(),
    options: {
      executionId: input.executionId,
      buildId: input.buildId,
      leaseMs: input.leaseMs,
      localMediaRoot: input.localMediaRoot,
      now: () => new Date(),
    } satisfies LocalSourceAudioNavigationOptions,
  };
}

function assertResolved(
  job: SourceAudioNavigationJob,
  resolved: ResolvedSourceAudioNavigationInput,
) {
  if (
    resolved.projectId !== job.projectId ||
    resolved.sourceRevisionId !== job.source.sourceRevisionId ||
    resolved.sourceIdentitySha256 !== job.source.identitySha256 ||
    resolved.sourceContentSha256 !== job.source.expectedContentSha256 ||
    resolved.derivativeId !== job.input.derivativeId ||
    resolved.generation !== job.input.generation ||
    resolved.contentSha256 !== job.input.contentSha256 ||
    resolved.sizeBytes !== job.input.sizeBytes ||
    resolved.mimeType !== job.input.contentType ||
    resolved.durationSeconds !== job.input.durationSeconds ||
    resolved.status !== "ready" ||
    resolved.storageProvider !== "local"
  ) {
    throw new SourceAudioNavigationTerminalError(
      "source-audio-navigation-input-mismatch",
      "The audio-navigation input no longer matches its exact retained proxy receipt.",
    );
  }
}

async function authorizedRoot(configuredRoot: string) {
  const temporaryRoot = await realpath(tmpdir());
  const resolved = path.resolve(configuredRoot);
  await mkdir(resolved, { recursive: true, mode: 0o700 });
  const canonical = await realpath(resolved);
  if (!pathIsInside(temporaryRoot, canonical) || canonical === temporaryRoot) {
    throw new SourceAudioNavigationTerminalError(
      "source-audio-navigation-root-rejected",
      "The local media root must be a dedicated directory below the operating-system temporary directory.",
    );
  }
  return canonical;
}

async function authorizedExistingPath(root: string, candidate: string) {
  const canonical = await realpath(candidate).catch(() => "");
  if (!canonical || !pathIsInside(root, canonical)) {
    throw new SourceAudioNavigationTerminalError(
      "source-audio-navigation-path-rejected",
      "The audio-navigation source escaped the worker's authorized media root.",
    );
  }
  return canonical;
}

async function inspectInput(candidate: string) {
  const details = await stat(candidate);
  if (!details.isFile() || details.size <= 0) {
    throw new SourceAudioNavigationTerminalError(
      "source-audio-navigation-input-unavailable",
      "The collaboration proxy is empty or unavailable.",
    );
  }
  return { sizeBytes: details.size, sha256: await sha256File(candidate) };
}

function assertInputBytes(
  job: SourceAudioNavigationJob,
  evidence: { sizeBytes: number; sha256: string },
) {
  if (
    evidence.sizeBytes !== job.input.sizeBytes ||
    evidence.sha256 !== job.input.contentSha256 ||
    job.input.generation !== `sha256:${evidence.sha256}`
  ) {
    throw new SourceAudioNavigationTerminalError(
      "source-audio-navigation-byte-mismatch",
      "The collaboration proxy no longer matches the queued byte receipt.",
    );
  }
}

function pathIsInside(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : fallback;
}
