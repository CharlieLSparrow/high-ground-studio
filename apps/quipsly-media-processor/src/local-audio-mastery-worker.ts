import { randomUUID } from "node:crypto";
import { mkdir, open, realpath, rename, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  AUDIO_MASTERY_CONTRACT_VERSION,
  AUDIO_MASTERY_RESULT_KIND,
  assessAudioMastery,
  newAudioMasteryProposal,
  parseAudioMasteryJob,
  parseAudioMasteryResult,
  type AudioMasteryJob,
  type AudioMasteryMeasurement,
  type AudioMasteryResult,
  type AudioMasterySourceBinding,
  type AudioSignalDiagnosis,
} from "@high-ground/quipsly-media-processing";
import pg from "pg";

import { FfmpegAudioMasteringEngine } from "./audio-mastering-ffmpeg.js";
import { ProxyTranscodeError, sha256File } from "./transcoder.js";

const { Pool } = pg;
const JOB_TYPE = "audio-mastery";

export type LocalAudioMasteryClaim = {
  id: string;
  inputJson: unknown;
  attempt: number;
  executionId: string;
};

export interface LocalAudioMasteryStore {
  claim(input: { executionId: string; leaseMs: number; now: Date }): Promise<LocalAudioMasteryClaim | null>;
  complete(input: { claim: LocalAudioMasteryClaim; receipt: AudioMasteryResult; now: Date }): Promise<boolean>;
  retry(input: { claim: LocalAudioMasteryClaim; code: string; message: string; now: Date }): Promise<boolean>;
  fail(input: { claim: LocalAudioMasteryClaim; code: string; message: string; now: Date }): Promise<boolean>;
}

export interface LocalAudioMasteringEngine {
  measure(inputPath: string, input: {
    source: AudioMasterySourceBinding;
    profileId: AudioMasteryJob["profileId"];
    measurementId?: string;
    measuredAt?: string;
  }): Promise<AudioMasteryMeasurement>;
  diagnose?(inputPath: string, input: {
    source: AudioMasterySourceBinding;
    diagnosisId?: string;
    analyzedAt?: string;
  }): Promise<AudioSignalDiagnosis>;
  renderLoudnessMaster(inputPath: string, outputPath: string, input: {
    proposal: ReturnType<typeof newAudioMasteryProposal>;
    measurement: AudioMasteryMeasurement;
  }): Promise<{
    outputPath: string;
    sizeBytes: number;
    sha256: string;
    contentType: "audio/wav";
    sampleRateHz: 48_000;
    codec: "pcm_s24le";
    originalRemainsSourceTruth: true;
  }>;
}

export type LocalAudioMasteryWorkerOptions = {
  executionId: string;
  buildId: string;
  imageDigest: string | null;
  leaseMs: number;
  localMediaRoot: string;
  now: () => Date;
};

export type LocalAudioMasteryWorkerResult =
  | { disposition: "idle" }
  | { disposition: "completed"; jobId: string; outputPath: string | null; recoveredExistingOutput: boolean }
  | { disposition: "claim-lost"; jobId: string }
  | { disposition: "retry"; jobId: string; code: string }
  | { disposition: "failed"; jobId: string; code: string };

class TerminalAudioMasteryError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "TerminalAudioMasteryError";
    this.code = code;
  }
}

export async function runOneLocalAudioMasteryJob(
  store: LocalAudioMasteryStore,
  engine: LocalAudioMasteringEngine,
  options: LocalAudioMasteryWorkerOptions,
): Promise<LocalAudioMasteryWorkerResult> {
  const claim = await store.claim({ executionId: options.executionId, leaseMs: options.leaseMs, now: options.now() });
  if (!claim) return { disposition: "idle" };
  let job: AudioMasteryJob;
  try {
    job = parseAudioMasteryJob(claim.inputJson, claim.id);
  } catch (error) {
    await store.fail({ claim, code: "audio-mastery-job-invalid", message: errorMessage(error), now: options.now() });
    return { disposition: "failed", jobId: claim.id, code: "audio-mastery-job-invalid" };
  }
  if (job.source.provider !== "local" || job.target.provider !== "local") {
    await store.fail({ claim, code: "audio-mastery-provider-unsupported", message: "The local mastering worker accepts local media only.", now: options.now() });
    return { disposition: "failed", jobId: job.jobId, code: "audio-mastery-provider-unsupported" };
  }

  let partialPath = "";
  let outputPath = "";
  let createdOutput = false;
  try {
    const root = await authorizedRoot(options.localMediaRoot);
    const sourcePath = await authorizedSource(root, job.source.locator);
    outputPath = authorizedTarget(root, job.target.locator);
    partialPath = outputPath.replace(/\.wav$/, `.partial-${claim.executionId.replace(/[^A-Za-z0-9_-]/g, "-")}.wav`);
    await mkdir(path.dirname(outputPath), { recursive: true, mode: 0o700 });
    const sourceMeasurement = await engine.measure(sourcePath, {
      source: job.source,
      profileId: job.profileId,
      measurementId: `measurement_${randomUUID().replaceAll("-", "")}`,
      measuredAt: options.now().toISOString(),
    });
    const signalDiagnosis = engine.diagnose
      ? await engine.diagnose(sourcePath, {
        source: job.source,
        diagnosisId: `diagnosis_${randomUUID().replaceAll("-", "")}`,
        analyzedAt: options.now().toISOString(),
      })
      : null;
    const proposal = newAudioMasteryProposal({
      proposalId: `proposal_${randomUUID().replaceAll("-", "")}`,
      createdAt: options.now().toISOString(),
      measurement: sourceMeasurement,
      profileId: job.profileId,
    });
    let derivative: AudioMasteryResult["derivative"] = null;
    let recoveredExistingOutput = false;
    if (proposal.action === "render-loudness-master") {
      let rendered;
      const existing = await stat(outputPath).catch(() => null);
      if (existing?.isFile() && existing.size > 0) {
        const sha256 = await sha256File(outputPath);
        rendered = {
          outputPath,
          sizeBytes: existing.size,
          sha256,
          contentType: "audio/wav" as const,
          sampleRateHz: 48_000 as const,
          codec: "pcm_s24le" as const,
          originalRemainsSourceTruth: true as const,
        };
        recoveredExistingOutput = true;
      } else {
        await rm(partialPath, { force: true });
        rendered = await engine.renderLoudnessMaster(sourcePath, partialPath, { proposal, measurement: sourceMeasurement });
        await flushFile(partialPath);
        await rename(partialPath, outputPath);
        createdOutput = true;
      }
      const outputSource: AudioMasterySourceBinding = {
        assetId: job.source.assetId,
        provider: "local",
        // Receipts use the canonical root-relative locator; the authorized
        // absolute path is an execution detail and is never persisted publicly.
        locator: job.target.locator,
        generation: `sha256:${rendered.sha256}`,
        sha256: rendered.sha256,
        sizeBytes: rendered.sizeBytes,
        contentType: "audio/wav",
      };
      const verificationMeasurement = await engine.measure(outputPath, {
        source: outputSource,
        profileId: job.profileId,
        measurementId: `measurement_${randomUUID().replaceAll("-", "")}`,
        measuredAt: options.now().toISOString(),
      });
      const verification = assessAudioMastery(verificationMeasurement, job.profileId);
      if (!verification.passes) {
        throw new TerminalAudioMasteryError(
          "audio-mastery-verification-failed",
          "The rendered preview failed its independent profile measurement and cannot be registered.",
        );
      }
      derivative = {
        provider: "local",
        locator: job.target.locator,
        generation: `sha256:${rendered.sha256}`,
        sha256: rendered.sha256,
        sizeBytes: rendered.sizeBytes,
        contentType: "audio/wav",
        codec: "pcm_s24le",
        sampleRateHz: 48_000,
        variantKind: "audio-master-preview",
        verificationMeasurement,
        verification,
      };
    }
    const receipt = parseAudioMasteryResult({
      kind: AUDIO_MASTERY_RESULT_KIND,
      version: AUDIO_MASTERY_CONTRACT_VERSION,
      jobId: job.jobId,
      completedAt: options.now().toISOString(),
      source: job.source,
      sourceMeasurement,
      signalDiagnosis,
      proposal,
      derivative,
      worker: {
        executionId: claim.executionId,
        buildId: options.buildId,
        imageDigest: options.imageDigest,
        attempt: claim.attempt,
      },
      boundaries: {
        originalRemainsSourceTruth: true,
        outputIsUnpromotedPreview: true,
        promotionRequiresExplicitApproval: true,
      },
    }, job);
    const committed = await store.complete({ claim, receipt, now: options.now() });
    return committed
      ? { disposition: "completed", jobId: job.jobId, outputPath: derivative ? outputPath : null, recoveredExistingOutput }
      : { disposition: "claim-lost", jobId: job.jobId };
  } catch (error) {
    await rm(partialPath, { force: true }).catch(() => undefined);
    const terminal = error instanceof TerminalAudioMasteryError
      || (error instanceof ProxyTranscodeError && !error.retryable);
    const code = error instanceof TerminalAudioMasteryError || error instanceof ProxyTranscodeError
      ? error.code
      : "audio-mastery-worker-retry";
    if (terminal) {
      if (createdOutput && outputPath) await rm(outputPath, { force: true }).catch(() => undefined);
      await store.fail({ claim, code, message: errorMessage(error), now: options.now() });
      return { disposition: "failed", jobId: job.jobId, code };
    }
    await store.retry({ claim, code, message: errorMessage(error), now: options.now() });
    return { disposition: "retry", jobId: job.jobId, code };
  }
}

export class PostgresLocalAudioMasteryStore implements LocalAudioMasteryStore {
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
            AND "inputJson"->'source'->>'provider' = 'local'
            AND ("status" = 'queued' OR ("status" = 'processing' AND "updatedAt" < $2))
          ORDER BY "createdAt" ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        `,
        values: [JOB_TYPE, new Date(input.now.getTime() - input.leaseMs)],
      });
      const row = selected.rows[0];
      if (!row) {
        await client.query("COMMIT");
        return null;
      }
      const previous = record(row.resultJson);
      const lease = record(previous.lease);
      const attempt = Math.max(0, Number(lease.attempt) || 0) + 1;
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
    } finally {
      client.release();
    }
  }

  async complete(input: { claim: LocalAudioMasteryClaim; receipt: AudioMasteryResult; now: Date }) {
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

  retry(input: { claim: LocalAudioMasteryClaim; code: string; message: string; now: Date }) {
    return this.release(input, "queued");
  }

  fail(input: { claim: LocalAudioMasteryClaim; code: string; message: string; now: Date }) {
    return this.release(input, "failed");
  }

  private async release(input: { claim: LocalAudioMasteryClaim; code: string; message: string; now: Date }, status: "queued" | "failed") {
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
        JSON.stringify({ state: status, failure: { code: input.code, message: input.message }, lease: { executionId: input.claim.executionId, attempt: input.claim.attempt } }),
      ],
    });
    return result.rowCount === 1;
  }
}

export function newLocalAudioMasteryRuntime(input: { pool: InstanceType<typeof Pool>; localMediaRoot: string; leaseMs: number; buildId: string }) {
  return {
    store: new PostgresLocalAudioMasteryStore(input.pool),
    engine: new FfmpegAudioMasteringEngine(),
    options: {
      executionId: randomUUID(),
      buildId: input.buildId,
      imageDigest: null,
      leaseMs: input.leaseMs,
      localMediaRoot: input.localMediaRoot,
      now: () => new Date(),
    } satisfies LocalAudioMasteryWorkerOptions,
  };
}

async function authorizedRoot(configuredRoot: string) {
  const tempRoot = await realpath(tmpdir());
  const resolved = path.resolve(configuredRoot);
  await mkdir(resolved, { recursive: true, mode: 0o700 });
  const root = await realpath(resolved);
  if (root === tempRoot || !pathIsInside(tempRoot, root)) throw new TerminalAudioMasteryError("audio-mastery-root-rejected", "Local mastering root must be a dedicated directory below the operating-system temporary directory.");
  return root;
}

async function authorizedSource(root: string, locator: string) {
  const source = await realpath(locator).catch(() => "");
  if (!source || !pathIsInside(root, source)) throw new TerminalAudioMasteryError("audio-mastery-source-path-rejected", "Local mastering source escaped the authorized media root.");
  return source;
}

function authorizedTarget(root: string, locator: string) {
  const output = path.resolve(root, locator);
  if (!pathIsInside(root, output) || !output.endsWith(".wav")) throw new TerminalAudioMasteryError("audio-mastery-target-path-rejected", "Local mastering target escaped the authorized media root.");
  return output;
}

async function flushFile(filePath: string) {
  const handle = await open(filePath, "r+");
  try {
    await handle.sync();
    await handle.chmod(0o600);
  } finally {
    await handle.close();
  }
}

function pathIsInside(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function errorMessage(error: unknown) {
  return error instanceof Error && error.message.trim() ? error.message : "Audio mastery worker failed.";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
