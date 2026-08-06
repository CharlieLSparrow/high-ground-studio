import { randomUUID } from "node:crypto";
import { mkdir, open, realpath, rename, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  AUDIO_TREATMENT_RESULT_KIND,
  AUDIO_TREATMENT_VERSION,
  newAudioTreatmentProposal,
  parseAudioTreatmentJob,
  parseAudioTreatmentResult,
  type AudioMasteryMeasurement,
  type AudioMasterySourceBinding,
  type AudioSignalDiagnosis,
  type AudioTreatmentJob,
  type AudioTreatmentProposal,
  type AudioTreatmentResult,
} from "@high-ground/quipsly-media-processing";
import pg from "pg";

import { FfmpegAudioMasteringEngine } from "./audio-mastering-ffmpeg.js";
import { ProxyTranscodeError, sha256File } from "./transcoder.js";

const { Pool } = pg;
const JOB_TYPE = "audio-treatment";

export type LocalAudioTreatmentClaim = {
  id: string;
  inputJson: unknown;
  attempt: number;
  executionId: string;
};

export interface LocalAudioTreatmentStore {
  claim(input: { executionId: string; leaseMs: number; now: Date }): Promise<LocalAudioTreatmentClaim | null>;
  complete(input: { claim: LocalAudioTreatmentClaim; receipt: AudioTreatmentResult; now: Date }): Promise<boolean>;
  retry(input: { claim: LocalAudioTreatmentClaim; code: string; message: string; now: Date }): Promise<boolean>;
  fail(input: { claim: LocalAudioTreatmentClaim; code: string; message: string; now: Date }): Promise<boolean>;
}

export interface LocalAudioTreatmentEngine {
  measure(inputPath: string, input: {
    source: AudioMasterySourceBinding;
    profileId: "apple-podcasts-dialogue-v1";
    measurementId?: string;
    measuredAt?: string;
  }): Promise<AudioMasteryMeasurement>;
  diagnose(inputPath: string, input: {
    source: AudioMasterySourceBinding;
    diagnosisId?: string;
    analyzedAt?: string;
  }): Promise<AudioSignalDiagnosis>;
  renderTreatmentExperiment(inputPath: string, outputPath: string, input: {
    proposal: AudioTreatmentProposal;
    diagnosis: AudioSignalDiagnosis;
  }): Promise<{
    outputPath: string;
    sizeBytes: number;
    sha256: string;
    contentType: "audio/wav";
    sampleRateHz: 48_000;
    codec: "pcm_s24le";
    originalRemainsSourceTruth: true;
    outputIsUnpromotedExperiment: true;
  }>;
}

export type LocalAudioTreatmentWorkerOptions = {
  executionId: string;
  buildId: string;
  imageDigest: string | null;
  leaseMs: number;
  localMediaRoot: string;
  now: () => Date;
};

export type LocalAudioTreatmentWorkerResult =
  | { disposition: "idle" }
  | { disposition: "completed"; jobId: string; outputPath: string; recoveredExistingOutput: boolean }
  | { disposition: "claim-lost"; jobId: string }
  | { disposition: "retry"; jobId: string; code: string }
  | { disposition: "failed"; jobId: string; code: string };

class TerminalAudioTreatmentError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "TerminalAudioTreatmentError";
    this.code = code;
  }
}

export async function runOneLocalAudioTreatmentJob(
  store: LocalAudioTreatmentStore,
  engine: LocalAudioTreatmentEngine,
  options: LocalAudioTreatmentWorkerOptions,
): Promise<LocalAudioTreatmentWorkerResult> {
  const claim = await store.claim({ executionId: options.executionId, leaseMs: options.leaseMs, now: options.now() });
  if (!claim) return { disposition: "idle" };
  let job: AudioTreatmentJob;
  try {
    job = parseAudioTreatmentJob(claim.inputJson, claim.id);
  } catch (error) {
    await store.fail({ claim, code: "audio-treatment-job-invalid", message: errorMessage(error), now: options.now() });
    return { disposition: "failed", jobId: claim.id, code: "audio-treatment-job-invalid" };
  }
  if (job.source.provider !== "local" || job.target.provider !== "local") {
    await store.fail({ claim, code: "audio-treatment-provider-unsupported", message: "The local treatment worker accepts local media only.", now: options.now() });
    return { disposition: "failed", jobId: job.jobId, code: "audio-treatment-provider-unsupported" };
  }

  let partialPath = "";
  let outputPath = "";
  try {
    const root = await authorizedRoot(options.localMediaRoot);
    const sourcePath = await authorizedSource(root, job.source.locator);
    outputPath = authorizedTarget(root, job.target.locator);
    partialPath = outputPath.replace(/\.wav$/, `.partial-${claim.executionId.replace(/[^A-Za-z0-9_-]/g, "-")}.wav`);
    await mkdir(path.dirname(outputPath), { recursive: true, mode: 0o700 });

    const sourceMeasurement = await engine.measure(sourcePath, {
      source: job.source,
      profileId: "apple-podcasts-dialogue-v1",
      measurementId: `measurement_${randomUUID().replaceAll("-", "")}`,
      measuredAt: options.now().toISOString(),
    });
    const sourceDiagnosis = await engine.diagnose(sourcePath, {
      source: job.source,
      diagnosisId: job.triggerDiagnosisId,
      analyzedAt: options.now().toISOString(),
    });
    const proposal = newAudioTreatmentProposal({
      proposalId: `proposal_${randomUUID().replaceAll("-", "")}`,
      createdAt: options.now().toISOString(),
      diagnosis: sourceDiagnosis,
    });

    let rendered;
    let recoveredExistingOutput = false;
    const existing = await stat(outputPath).catch(() => null);
    if (existing?.isFile() && existing.size > 0) {
      rendered = {
        outputPath,
        sizeBytes: existing.size,
        sha256: await sha256File(outputPath),
        contentType: "audio/wav" as const,
        sampleRateHz: 48_000 as const,
        codec: "pcm_s24le" as const,
        originalRemainsSourceTruth: true as const,
        outputIsUnpromotedExperiment: true as const,
      };
      recoveredExistingOutput = true;
    } else {
      await rm(partialPath, { force: true });
      rendered = await engine.renderTreatmentExperiment(sourcePath, partialPath, { proposal, diagnosis: sourceDiagnosis });
      await flushFile(partialPath);
      await rename(partialPath, outputPath);
    }

    const outputSource: AudioMasterySourceBinding = {
      assetId: job.source.assetId,
      provider: "local",
      locator: job.target.locator,
      generation: `sha256:${rendered.sha256}`,
      sha256: rendered.sha256,
      sizeBytes: rendered.sizeBytes,
      contentType: "audio/wav",
    };
    const outputMeasurement = await engine.measure(outputPath, {
      source: outputSource,
      profileId: "apple-podcasts-dialogue-v1",
      measurementId: `measurement_${randomUUID().replaceAll("-", "")}`,
      measuredAt: options.now().toISOString(),
    });
    const outputDiagnosis = await engine.diagnose(outputPath, {
      source: outputSource,
      diagnosisId: `diagnosis_${randomUUID().replaceAll("-", "")}`,
      analyzedAt: options.now().toISOString(),
    });
    const before = maximumAbsoluteDc(sourceDiagnosis);
    const after = maximumAbsoluteDc(outputDiagnosis);
    const durationDeltaSeconds = round(Math.abs(sourceDiagnosis.durationSeconds - outputDiagnosis.durationSeconds), 6);
    const relativeReduction = before > 0 ? 1 - after / before : 0;
    if (
      after > 0.005
      || relativeReduction < 0.75
      || durationDeltaSeconds > 0.05
      || !outputDiagnosis.analyzer.completeDecode
      || outputDiagnosis.channelCount !== sourceDiagnosis.channelCount
    ) {
      throw new TerminalAudioTreatmentError(
        "audio-treatment-verification-failed",
        "The rendered experiment failed its independent signal, duration, channel, or complete-decode gate and cannot be registered.",
      );
    }

    let receipt: AudioTreatmentResult;
    try {
      receipt = parseAudioTreatmentResult({
        kind: AUDIO_TREATMENT_RESULT_KIND,
        version: AUDIO_TREATMENT_VERSION,
        jobId: job.jobId,
        completedAt: options.now().toISOString(),
        source: job.source,
        sourceMeasurement,
        sourceDiagnosis,
        proposal,
        derivative: {
          provider: "local",
          locator: job.target.locator,
          generation: outputSource.generation,
          sha256: outputSource.sha256,
          sizeBytes: outputSource.sizeBytes,
          contentType: "audio/wav",
          codec: "pcm_s24le",
          sampleRateHz: 48_000,
          variantKind: "audio-treatment-preview",
          measurement: outputMeasurement,
          diagnosis: outputDiagnosis,
        },
        verification: {
          maximumAbsoluteDcBefore: before,
          maximumAbsoluteDcAfter: after,
          requiredMaximumAbsoluteDcAfter: 0.005,
          requiredRelativeReduction: 0.75,
          durationDeltaSeconds,
          sourceBytesPreserved: true,
          completeOutputDecode: true,
          passes: true,
        },
        worker: { executionId: claim.executionId, buildId: options.buildId, imageDigest: options.imageDigest, attempt: claim.attempt },
        boundaries: { originalRemainsSourceTruth: true, outputIsUnpromotedExperiment: true, outputIsNotAMasteredDeliveryFile: true, promotionRequiresExplicitApproval: true },
      }, job);
    } catch (error) {
      throw new TerminalAudioTreatmentError("audio-treatment-receipt-invalid", errorMessage(error));
    }
    const committed = await store.complete({ claim, receipt, now: options.now() });
    return committed
      ? { disposition: "completed", jobId: job.jobId, outputPath, recoveredExistingOutput }
      : { disposition: "claim-lost", jobId: job.jobId };
  } catch (error) {
    await rm(partialPath, { force: true }).catch(() => undefined);
    const terminal = error instanceof TerminalAudioTreatmentError || (error instanceof ProxyTranscodeError && !error.retryable);
    const code = error instanceof TerminalAudioTreatmentError || error instanceof ProxyTranscodeError ? error.code : "audio-treatment-worker-retry";
    if (terminal) {
      if (outputPath) await rm(outputPath, { force: true }).catch(() => undefined);
      await store.fail({ claim, code, message: errorMessage(error), now: options.now() });
      return { disposition: "failed", jobId: job.jobId, code };
    }
    await store.retry({ claim, code, message: errorMessage(error), now: options.now() });
    return { disposition: "retry", jobId: job.jobId, code };
  }
}

export class PostgresLocalAudioTreatmentStore implements LocalAudioTreatmentStore {
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
        values: [row.id, input.now, JSON.stringify({ state: "processing", lease: { executionId: input.executionId, attempt, claimedAt: input.now.toISOString(), expiresAt: new Date(input.now.getTime() + input.leaseMs).toISOString() }, originalRemainsSourceTruth: true })],
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

  async complete(input: { claim: LocalAudioTreatmentClaim; receipt: AudioTreatmentResult; now: Date }) {
    const result = await this.pool.query({
      text: `
        UPDATE "StudioAssetProcessingJob"
        SET "status" = 'output-ready', "updatedAt" = $3, "completedAt" = NULL, "error" = NULL, "resultJson" = $4::jsonb
        WHERE "id" = $1 AND "status" = 'processing' AND "resultJson"->'lease'->>'executionId' = $2
      `,
      values: [input.claim.id, input.claim.executionId, input.now, JSON.stringify({ state: "output-ready", receipt: input.receipt })],
    });
    return result.rowCount === 1;
  }

  retry(input: { claim: LocalAudioTreatmentClaim; code: string; message: string; now: Date }) { return this.release(input, "queued"); }
  fail(input: { claim: LocalAudioTreatmentClaim; code: string; message: string; now: Date }) { return this.release(input, "failed"); }

  private async release(input: { claim: LocalAudioTreatmentClaim; code: string; message: string; now: Date }, status: "queued" | "failed") {
    const result = await this.pool.query({
      text: `
        UPDATE "StudioAssetProcessingJob"
        SET "status" = $3::text, "updatedAt" = $4::timestamp(3), "completedAt" = CASE WHEN $3::text = 'failed' THEN $4::timestamp(3) ELSE NULL::timestamp END,
            "error" = $5, "resultJson" = $6::jsonb
        WHERE "id" = $1 AND "status" = 'processing' AND "resultJson"->'lease'->>'executionId' = $2
      `,
      values: [input.claim.id, input.claim.executionId, status, input.now, `${input.code}: ${input.message}`.slice(0, 4_000), JSON.stringify({ state: status, failure: { code: input.code, message: input.message }, lease: { executionId: input.claim.executionId, attempt: input.claim.attempt } })],
    });
    return result.rowCount === 1;
  }
}

export function newLocalAudioTreatmentRuntime(input: { pool: InstanceType<typeof Pool>; localMediaRoot: string; leaseMs: number; buildId: string }) {
  return {
    store: new PostgresLocalAudioTreatmentStore(input.pool),
    engine: new FfmpegAudioMasteringEngine(),
    options: { executionId: randomUUID(), buildId: input.buildId, imageDigest: null, leaseMs: input.leaseMs, localMediaRoot: input.localMediaRoot, now: () => new Date() } satisfies LocalAudioTreatmentWorkerOptions,
  };
}

async function authorizedRoot(configuredRoot: string) {
  const tempRoot = await realpath(tmpdir());
  const resolved = path.resolve(configuredRoot);
  await mkdir(resolved, { recursive: true, mode: 0o700 });
  const root = await realpath(resolved);
  if (root === tempRoot || !pathIsInside(tempRoot, root)) throw new TerminalAudioTreatmentError("audio-treatment-root-rejected", "Local treatment root must be a dedicated directory below the operating-system temporary directory.");
  return root;
}

async function authorizedSource(root: string, locator: string) {
  const source = await realpath(locator).catch(() => "");
  if (!source || !pathIsInside(root, source)) throw new TerminalAudioTreatmentError("audio-treatment-source-path-rejected", "Local treatment source escaped the authorized media root.");
  return source;
}

function authorizedTarget(root: string, locator: string) {
  const output = path.resolve(root, locator);
  if (!pathIsInside(root, output) || !output.endsWith(".wav")) throw new TerminalAudioTreatmentError("audio-treatment-target-path-rejected", "Local treatment target escaped the authorized media root.");
  return output;
}

async function flushFile(filePath: string) {
  const handle = await open(filePath, "r+");
  try { await handle.sync(); await handle.chmod(0o600); } finally { await handle.close(); }
}

function maximumAbsoluteDc(diagnosis: AudioSignalDiagnosis) { return Math.max(...diagnosis.channels.map((channel) => Math.abs(channel.dcOffset))); }
function round(value: number, digits: number) { const multiplier = 10 ** digits; return Math.round(value * multiplier) / multiplier; }
function pathIsInside(root: string, candidate: string) { const relative = path.relative(root, candidate); return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative)); }
function errorMessage(error: unknown) { return error instanceof Error && error.message.trim() ? error.message : "Audio treatment worker failed."; }
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
