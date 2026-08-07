import { spawn } from "node:child_process";
import { mkdir, open, realpath, rename, rm, stat } from "node:fs/promises";
import path from "node:path";

import {
  SOURCE_VISUAL_OVERVIEW_DERIVATIVE_KIND,
  SOURCE_VISUAL_OVERVIEW_JOB_KIND,
  newSourceVisualOverviewResult,
  parseSourceVisualOverviewJob,
  sourceVisualOverviewSampleTimes,
  type SourceVisualOverviewJob,
  type SourceVisualOverviewResult,
} from "@high-ground/quipsly-media-processing";
import type pg from "pg";

import { sha256File } from "./transcoder.js";

const JOB_TYPE = "source-visual-overview";
const JOB_SOURCE = "source-story.visual-overview";

type Pool = InstanceType<typeof pg.Pool>;

export type LocalSourceVisualOverviewClaim = {
  id: string;
  inputJson: unknown;
  attempt: number;
  executionId: string;
};

export type ResolvedVisualOverviewInput = {
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

export type SourceVisualOverviewOutput = {
  sha256: string;
  sizeBytes: number;
  widthPixels: number;
  heightPixels: number;
};

export interface SourceVisualOverviewRenderer {
  render(
    inputPath: string,
    outputPath: string,
    durationSeconds: number,
  ): Promise<SourceVisualOverviewOutput>;
  inspect(outputPath: string): Promise<SourceVisualOverviewOutput>;
}

export interface LocalSourceVisualOverviewStore {
  claim(input: {
    executionId: string;
    leaseMs: number;
    now: Date;
  }): Promise<LocalSourceVisualOverviewClaim | null>;
  resolve(
    claim: LocalSourceVisualOverviewClaim,
    job: SourceVisualOverviewJob,
  ): Promise<ResolvedVisualOverviewInput>;
  complete(input: {
    claim: LocalSourceVisualOverviewClaim;
    job: SourceVisualOverviewJob;
    receipt: SourceVisualOverviewResult;
    now: Date;
  }): Promise<boolean>;
  retry(input: {
    claim: LocalSourceVisualOverviewClaim;
    code: string;
    message: string;
    now: Date;
  }): Promise<boolean>;
  fail(input: {
    claim: LocalSourceVisualOverviewClaim;
    code: string;
    message: string;
    now: Date;
  }): Promise<boolean>;
}

export type LocalSourceVisualOverviewOptions = {
  executionId: string;
  buildId: string;
  leaseMs: number;
  localMediaRoot: string;
  now: () => Date;
};

export type LocalSourceVisualOverviewResult =
  | { disposition: "idle" }
  | {
      disposition: "completed";
      jobId: string;
      outputPath: string;
      recoveredExistingOutput: boolean;
    }
  | { disposition: "claim-lost"; jobId: string }
  | { disposition: "retry"; jobId: string; code: string }
  | { disposition: "failed"; jobId: string; code: string };

class VisualOverviewTerminalError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "VisualOverviewTerminalError";
  }
}

class VisualOverviewRenderError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "VisualOverviewRenderError";
  }
}

export async function runOneLocalSourceVisualOverviewJob(
  store: LocalSourceVisualOverviewStore,
  renderer: SourceVisualOverviewRenderer,
  options: LocalSourceVisualOverviewOptions,
): Promise<LocalSourceVisualOverviewResult> {
  const claim = await store.claim({
    executionId: options.executionId,
    leaseMs: options.leaseMs,
    now: options.now(),
  });
  if (!claim) return { disposition: "idle" };
  let job: SourceVisualOverviewJob;
  try {
    job = parseSourceVisualOverviewJob(claim.inputJson, claim.id);
  } catch (error) {
    await store.fail({
      claim,
      code: "source-visual-job-invalid",
      message: message(error, "The visual-map job is invalid."),
      now: options.now(),
    });
    return {
      disposition: "failed",
      jobId: claim.id,
      code: "source-visual-job-invalid",
    };
  }
  let outputPath = "";
  let partialPath = "";
  let createdOutput = false;
  try {
    const resolved = await store.resolve(claim, job);
    assertResolved(job, resolved);
    const root = await authorizedRoot(options.localMediaRoot);
    const inputPath = await authorizedExistingPath(root, resolved.locator);
    outputPath = authorizedTargetPath(root, job.target.locator);
    partialPath = `${outputPath.slice(0, -4)}.partial-${claim.executionId.replace(/[^A-Za-z0-9_-]+/g, "-")}.jpg`;
    await mkdir(path.dirname(outputPath), { recursive: true, mode: 0o700 });
    const outputParent = await realpath(path.dirname(outputPath));
    if (!pathIsInside(root, outputParent)) {
      throw new VisualOverviewTerminalError(
        "source-visual-target-path-rejected",
        "The visual-map output parent escaped the worker's authorized media root.",
      );
    }
    const inputBefore = await inspectInput(inputPath);
    assertInputBytes(job, inputBefore);
    let output: SourceVisualOverviewOutput;
    let recoveredExistingOutput = false;
    const existing = await stat(outputPath).catch(() => null);
    if (existing) {
      if (!existing.isFile())
        throw new VisualOverviewTerminalError(
          "source-visual-existing-output-invalid",
          "The retained visual map is not a regular file.",
        );
      output = await renderer.inspect(outputPath);
      recoveredExistingOutput = true;
    } else {
      await rm(partialPath, { force: true });
      output = await renderer.render(
        inputPath,
        partialPath,
        job.input.durationSeconds,
      );
      await flushFile(partialPath);
      await rename(partialPath, outputPath);
      createdOutput = true;
    }
    const inputAfter = await inspectInput(inputPath);
    assertInputBytes(job, inputAfter);
    if (
      inputBefore.sha256 !== inputAfter.sha256 ||
      inputBefore.sizeBytes !== inputAfter.sizeBytes
    ) {
      throw new VisualOverviewTerminalError(
        "source-visual-input-drift",
        "The collaboration proxy changed while its visual map was generated.",
      );
    }
    const receipt = newSourceVisualOverviewResult({
      jobId: job.jobId,
      derivativeId: job.derivativeId,
      completedAt: options.now().toISOString(),
      source: job.source,
      input: {
        ...job.input,
        observedContentSha256: inputAfter.sha256,
        observedSizeBytes: inputAfter.sizeBytes,
      },
      output: {
        provider: "local",
        locator: outputPath,
        generation: `sha256:${output.sha256}`,
        contentType: "image/jpeg",
        derivativeKind: job.target.derivativeKind,
        profile: job.target.profile,
        sha256: output.sha256,
        sizeBytes: output.sizeBytes,
        widthPixels: output.widthPixels,
        heightPixels: output.heightPixels,
        columns: job.target.columns,
        rows: job.target.rows,
        sampleTimesSeconds: sourceVisualOverviewSampleTimes(
          job.input.durationSeconds,
          job.target.sampleCount,
        ),
      },
      worker: {
        executionId: claim.executionId,
        buildId: options.buildId,
        attempt: claim.attempt,
      },
    });
    const committed = await store.complete({
      claim,
      job,
      receipt,
      now: options.now(),
    });
    return committed
      ? {
          disposition: "completed",
          jobId: job.jobId,
          outputPath,
          recoveredExistingOutput,
        }
      : { disposition: "claim-lost", jobId: job.jobId };
  } catch (error) {
    await rm(partialPath, { force: true }).catch(() => undefined);
    if (
      error instanceof VisualOverviewTerminalError ||
      (error instanceof VisualOverviewRenderError && !error.retryable)
    ) {
      if (createdOutput && outputPath)
        await rm(outputPath, { force: true }).catch(() => undefined);
      await store.fail({
        claim,
        code: error.code,
        message: error.message,
        now: options.now(),
      });
      return { disposition: "failed", jobId: job.jobId, code: error.code };
    }
    const code =
      error instanceof VisualOverviewRenderError
        ? error.code
        : "source-visual-worker-retry";
    await store.retry({
      claim,
      code,
      message: message(error, "The visual-map worker needs retry."),
      now: options.now(),
    });
    return { disposition: "retry", jobId: job.jobId, code };
  }
}

export class FfmpegSourceVisualOverviewRenderer implements SourceVisualOverviewRenderer {
  constructor(
    private readonly ffmpegPath = process.env.FFMPEG_PATH || "ffmpeg",
    private readonly ffprobePath = process.env.FFPROBE_PATH || "ffprobe",
  ) {}

  async render(inputPath: string, outputPath: string, durationSeconds: number) {
    const fps = 8 / durationSeconds;
    const filter = [
      `fps=${fps.toFixed(9)}`,
      "scale=280:158:force_original_aspect_ratio=decrease",
      "pad=280:158:(ow-iw)/2:(oh-ih)/2:color=0x15120f",
      "tile=4x2:padding=4:margin=4",
    ].join(",");
    await runProcess(
      this.ffmpegPath,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        "-y",
        "-i",
        inputPath,
        "-vf",
        filter,
        "-frames:v",
        "1",
        "-q:v",
        "3",
        outputPath,
      ],
      "source-visual-ffmpeg-failed",
    );
    return this.inspect(outputPath);
  }

  async inspect(outputPath: string) {
    const probe = await runProcess(
      this.ffprobePath,
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height,codec_name",
        "-of",
        "json",
        outputPath,
      ],
      "source-visual-ffprobe-failed",
    );
    let parsed: {
      streams?: Array<{ width?: number; height?: number; codec_name?: string }>;
    };
    try {
      parsed = JSON.parse(probe.stdout) as typeof parsed;
    } catch {
      throw new VisualOverviewRenderError(
        "source-visual-probe-invalid",
        "FFprobe returned invalid visual-map metadata.",
        false,
      );
    }
    const stream = parsed.streams?.[0];
    const details = await stat(outputPath);
    const sha256 = await sha256File(outputPath);
    const widthPixels = Number(stream?.width);
    const heightPixels = Number(stream?.height);
    if (
      stream?.codec_name !== "mjpeg" ||
      !Number.isSafeInteger(widthPixels) ||
      widthPixels <= 0 ||
      !Number.isSafeInteger(heightPixels) ||
      heightPixels <= 0 ||
      !details.isFile() ||
      details.size <= 0
    ) {
      throw new VisualOverviewRenderError(
        "source-visual-output-invalid",
        "The generated visual map failed JPEG and geometry verification.",
        false,
      );
    }
    return { sha256, sizeBytes: details.size, widthPixels, heightPixels };
  }
}

export class PostgresLocalSourceVisualOverviewStore implements LocalSourceVisualOverviewStore {
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
      const previous = asRecord(row.resultJson);
      const previousLease = asRecord(previous.lease);
      const attempt = Math.max(0, Number(previousLease.attempt) || 0) + 1;
      const resultJson = {
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
      };
      const updated = await client.query({
        text: `UPDATE "StudioWorkflowJob" SET "status"='processing', "startedAt"=COALESCE("startedAt",timezone('UTC',$2::timestamptz)), "updatedAt"=timezone('UTC',$2::timestamptz), "error"=NULL, "resultJson"=$3::jsonb WHERE "id"=$1 RETURNING "id","inputJson"`,
        values: [row.id, input.now, JSON.stringify(resultJson)],
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

  async resolve(
    _claim: LocalSourceVisualOverviewClaim,
    job: SourceVisualOverviewJob,
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
    if (!row)
      throw new VisualOverviewTerminalError(
        "source-visual-input-missing",
        "The exact collaboration proxy no longer exists.",
      );
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
    claim: LocalSourceVisualOverviewClaim;
    job: SourceVisualOverviewJob;
    receipt: SourceVisualOverviewResult;
    now: Date;
  }) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const updated = await client.query({
        text: `UPDATE "StudioWorkflowJob" SET "status"='output-ready', "updatedAt"=timezone('UTC',$3::timestamptz), "completedAt"=timezone('UTC',$3::timestamptz), "error"=NULL, "resultJson"=$4::jsonb WHERE "id"=$1 AND "status"='processing' AND "resultJson"->'lease'->>'executionId'=$2`,
        values: [
          input.claim.id,
          input.claim.executionId,
          input.now,
          JSON.stringify({
            state: "output-ready",
            receipt: input.receipt,
            originalRemainsSourceTruth: true,
            inputDerivativeRemainsUnchanged: true,
          }),
        ],
      });
      if (updated.rowCount !== 1) {
        await client.query("ROLLBACK");
        return false;
      }
      await client.query({
        text: `
          INSERT INTO "StudioMediaDerivative" (
            "id","projectId","sourceRevisionId","workflowJobId","kind","profile","storageProvider","locator","generation",
            "contentSha256","sizeBytes","mimeType","widthPixels","heightPixels","status","verificationJson","provenanceJson","createdByUserId","createdAt"
          ) VALUES ($1,$2,$3,$4,$5,$6,'local',$7,$8,$9,$10,'image/jpeg',$11,$12,'ready',$13::jsonb,$14::jsonb,$15,$16)
          ON CONFLICT ("id") DO NOTHING
        `,
        values: [
          input.job.derivativeId,
          input.job.projectId,
          input.job.source.sourceRevisionId,
          input.job.jobId,
          SOURCE_VISUAL_OVERVIEW_DERIVATIVE_KIND,
          input.job.target.profile,
          input.receipt.output.locator,
          input.receipt.output.generation,
          input.receipt.output.sha256,
          input.receipt.output.sizeBytes,
          input.receipt.output.widthPixels,
          input.receipt.output.heightPixels,
          JSON.stringify({
            schema: "quipsly-source-visual-overview-verification-v1",
            source: input.receipt.source,
            input: input.receipt.input,
            output: input.receipt.output,
            originalRemainsSourceTruth: true,
            inputDerivativeRemainsUnchanged: true,
          }),
          JSON.stringify({
            schema: "quipsly-source-visual-overview-provenance-v1",
            jobId: input.job.jobId,
            inputDerivativeId: input.job.input.derivativeId,
            inputGeneration: input.job.input.generation,
            worker: input.receipt.worker,
          }),
          input.job.actorUserId,
          input.now,
        ],
      });
      await client.query({
        text: `UPDATE "StudioMediaDerivative" SET "status"='superseded' WHERE "projectId"=$1 AND "sourceRevisionId"=$2 AND "kind"=$3 AND "profile"=$4 AND "status"='ready' AND "id"<>$5`,
        values: [
          input.job.projectId,
          input.job.source.sourceRevisionId,
          SOURCE_VISUAL_OVERVIEW_DERIVATIVE_KIND,
          input.job.target.profile,
          input.job.derivativeId,
        ],
      });
      const retained = await client.query({
        text: `SELECT "sourceRevisionId","workflowJobId","generation","contentSha256","sizeBytes" FROM "StudioMediaDerivative" WHERE "id"=$1`,
        values: [input.job.derivativeId],
      });
      const row = retained.rows[0];
      if (
        !row ||
        row.sourceRevisionId !== input.job.source.sourceRevisionId ||
        row.workflowJobId !== input.job.jobId ||
        row.generation !== input.receipt.output.generation ||
        row.contentSha256 !== input.receipt.output.sha256 ||
        Number(row.sizeBytes) !== input.receipt.output.sizeBytes
      ) {
        throw new VisualOverviewTerminalError(
          "source-visual-derivative-conflict",
          "The visual derivative identity is bound to different output evidence.",
        );
      }
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async retry(input: {
    claim: LocalSourceVisualOverviewClaim;
    code: string;
    message: string;
    now: Date;
  }) {
    return this.release(input, "queued");
  }

  async fail(input: {
    claim: LocalSourceVisualOverviewClaim;
    code: string;
    message: string;
    now: Date;
  }) {
    return this.release(input, "failed");
  }

  private async release(
    input: {
      claim: LocalSourceVisualOverviewClaim;
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
    const previous = asRecord(current.rows[0]?.resultJson);
    const result = await this.pool.query({
      text: `UPDATE "StudioWorkflowJob" SET "status"=$3, "updatedAt"=timezone('UTC',$4::timestamptz), "completedAt"=CASE WHEN $3='failed' THEN timezone('UTC',$4::timestamptz) ELSE NULL END, "error"=$5, "resultJson"=$6::jsonb WHERE "id"=$1 AND "status"='processing' AND "resultJson"->'lease'->>'executionId'=$2`,
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
        }),
      ],
    });
    return result.rowCount === 1;
  }
}

export function newLocalSourceVisualOverviewRuntime(input: {
  pool: Pool;
  executionId: string;
  localMediaRoot: string;
  leaseMs: number;
  buildId: string;
}) {
  return {
    store: new PostgresLocalSourceVisualOverviewStore(input.pool),
    renderer: new FfmpegSourceVisualOverviewRenderer(),
    options: {
      executionId: input.executionId,
      buildId: input.buildId,
      leaseMs: input.leaseMs,
      localMediaRoot: input.localMediaRoot,
      now: () => new Date(),
    } satisfies LocalSourceVisualOverviewOptions,
  };
}

function assertResolved(
  job: SourceVisualOverviewJob,
  resolved: ResolvedVisualOverviewInput,
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
    throw new VisualOverviewTerminalError(
      "source-visual-input-mismatch",
      "The visual-map input no longer matches its exact retained derivative receipt.",
    );
  }
}

function assertInputBytes(
  job: SourceVisualOverviewJob,
  inspected: { sha256: string; sizeBytes: number },
) {
  if (
    inspected.sha256 !== job.input.contentSha256 ||
    inspected.sizeBytes !== job.input.sizeBytes
  ) {
    throw new VisualOverviewTerminalError(
      "source-visual-input-bytes-mismatch",
      "The collaboration proxy bytes do not match the queued visual-map receipt.",
    );
  }
}

async function inspectInput(candidate: string) {
  const details = await stat(candidate);
  if (!details.isFile() || details.size <= 0)
    throw new VisualOverviewTerminalError(
      "source-visual-input-unavailable",
      "The retained collaboration proxy is unavailable.",
    );
  return { sizeBytes: details.size, sha256: await sha256File(candidate) };
}

async function authorizedRoot(configuredRoot: string) {
  const resolved = path.resolve(configuredRoot);
  await mkdir(resolved, { recursive: true, mode: 0o700 });
  return realpath(resolved);
}

async function authorizedExistingPath(root: string, candidate: string) {
  const canonical = await realpath(candidate).catch(() => "");
  if (!canonical || !pathIsInside(root, canonical)) {
    throw new VisualOverviewTerminalError(
      "source-visual-input-path-rejected",
      "The collaboration proxy escaped the worker's authorized media root.",
    );
  }
  return canonical;
}

function authorizedTargetPath(root: string, locator: string) {
  const target = path.resolve(root, locator);
  if (!pathIsInside(root, target) || !target.endsWith(".jpg")) {
    throw new VisualOverviewTerminalError(
      "source-visual-target-path-rejected",
      "The visual-map output escaped the worker's authorized media root.",
    );
  }
  return target;
}

function pathIsInside(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return (
    relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative)
  );
}

async function flushFile(candidate: string) {
  const handle = await open(candidate, "r+");
  try {
    await handle.sync();
    await handle.chmod(0o600);
  } finally {
    await handle.close();
  }
}

function runProcess(executable: string, args: string[], code: string) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(executable, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) =>
      reject(
        new VisualOverviewRenderError(
          code,
          message(error, `${executable} could not start.`),
          true,
        ),
      ),
    );
    child.on("close", (status) => {
      if (status === 0) resolve({ stdout, stderr });
      else
        reject(
          new VisualOverviewRenderError(
            code,
            `${executable} exited ${status}: ${stderr.slice(-2_000)}`,
            false,
          ),
        );
    });
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function message(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export const LOCAL_SOURCE_VISUAL_OVERVIEW_JOB_KIND =
  SOURCE_VISUAL_OVERVIEW_JOB_KIND;
