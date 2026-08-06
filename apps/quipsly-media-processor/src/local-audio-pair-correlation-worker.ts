import { randomUUID } from "node:crypto";
import { mkdir, realpath, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  AUDIO_PAIR_CORRELATION_CONTRACT_VERSION,
  AUDIO_PAIR_CORRELATION_RESULT_KIND,
  parseAudioPairCorrelationJob,
  parseAudioPairCorrelationResult,
  type AudioPairCorrelationJob,
  type AudioPairCorrelationResult,
} from "@high-ground/quipsly-media-processing";
import pg from "pg";

import { AudioPairCorrelationDecodeError, FfmpegAudioPairCorrelationAnalyzer } from "./audio-pair-correlation-ffmpeg.js";
import { sha256File } from "./transcoder.js";

const { Pool } = pg;
const JOB_TYPE = "audio-pair-correlation";

export type LocalAudioPairCorrelationClaim = { id: string; inputJson: unknown; attempt: number; executionId: string };

export interface LocalAudioPairCorrelationStore {
  claim(input: { executionId: string; leaseMs: number; now: Date }): Promise<LocalAudioPairCorrelationClaim | null>;
  complete(input: { claim: LocalAudioPairCorrelationClaim; receipt: AudioPairCorrelationResult; now: Date }): Promise<boolean>;
  retry(input: { claim: LocalAudioPairCorrelationClaim; code: string; message: string; now: Date }): Promise<boolean>;
  fail(input: { claim: LocalAudioPairCorrelationClaim; code: string; message: string; now: Date }): Promise<boolean>;
}

export interface LocalAudioPairCorrelationAnalyzer {
  analyze: FfmpegAudioPairCorrelationAnalyzer["analyze"];
}

export type LocalAudioPairCorrelationWorkerOptions = { executionId: string; buildId: string; imageDigest: string | null; leaseMs: number; localMediaRoot: string; now: () => Date };

export type LocalAudioPairCorrelationWorkerResult =
  | { disposition: "idle" }
  | { disposition: "completed"; jobId: string; bestLagMilliseconds: number; peakAbsolutePowerCorrelation: number }
  | { disposition: "claim-lost"; jobId: string }
  | { disposition: "retry"; jobId: string; code: string }
  | { disposition: "failed"; jobId: string; code: string };

class TerminalAudioPairCorrelationError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = "TerminalAudioPairCorrelationError"; }
}

export async function runOneLocalAudioPairCorrelationJob(
  store: LocalAudioPairCorrelationStore,
  analyzer: LocalAudioPairCorrelationAnalyzer,
  options: LocalAudioPairCorrelationWorkerOptions,
): Promise<LocalAudioPairCorrelationWorkerResult> {
  const claim = await store.claim({ executionId: options.executionId, leaseMs: options.leaseMs, now: options.now() });
  if (!claim) return { disposition: "idle" };
  let job: AudioPairCorrelationJob;
  try {
    job = parseAudioPairCorrelationJob(claim.inputJson, claim.id);
  } catch (error) {
    await store.fail({ claim, code: "audio-pair-job-invalid", message: errorMessage(error), now: options.now() });
    return { disposition: "failed", jobId: claim.id, code: "audio-pair-job-invalid" };
  }
  if (job.reference.source.provider !== "local" || job.observation.source.provider !== "local") {
    await store.fail({ claim, code: "audio-pair-provider-unsupported", message: "The local pair worker accepts local retained sources only.", now: options.now() });
    return { disposition: "failed", jobId: job.jobId, code: "audio-pair-provider-unsupported" };
  }
  try {
    const root = await authorizedRoot(options.localMediaRoot);
    const referencePath = await authorizedSource(root, job.reference.source.locator);
    const observationPath = await authorizedSource(root, job.observation.source.locator);
    const [referenceBefore, observationBefore] = await Promise.all([inspectSource(referencePath), inspectSource(observationPath)]);
    assertSource(job.reference.source, referenceBefore);
    assertSource(job.observation.source, observationBefore);
    const analysis = await analyzer.analyze({ referencePath, referenceRange: job.reference.range, observationPath, observationRange: job.observation.range });
    const [referenceAfter, observationAfter] = await Promise.all([inspectSource(referencePath), inspectSource(observationPath)]);
    assertSource(job.reference.source, referenceAfter);
    assertSource(job.observation.source, observationAfter);
    if (referenceBefore.sha256 !== referenceAfter.sha256 || referenceBefore.sizeBytes !== referenceAfter.sizeBytes || observationBefore.sha256 !== observationAfter.sha256 || observationBefore.sizeBytes !== observationAfter.sizeBytes) {
      throw new TerminalAudioPairCorrelationError("audio-pair-source-drift", "A retained source changed during pair analysis.");
    }
    const receipt = parseAudioPairCorrelationResult({
      kind: AUDIO_PAIR_CORRELATION_RESULT_KIND,
      version: AUDIO_PAIR_CORRELATION_CONTRACT_VERSION,
      jobId: job.jobId,
      completedAt: options.now().toISOString(),
      programFingerprintSha256: job.programFingerprintSha256,
      activeDecisionReceiptIds: job.activeDecisionReceiptIds,
      reference: job.reference,
      observation: job.observation,
      measurement: analysis.measurement,
      segments: analysis.segments.map((segment) => ({
        programStartSeconds: job.reference.range.programStartSeconds + segment.startSeconds,
        programEndSeconds: job.reference.range.programStartSeconds + segment.endSeconds,
        measurement: segment.measurement,
      })),
      analyzer: { ...job.analyzer, ffmpegVersion: analysis.ffmpegVersion, completeRangeDecode: true },
      worker: { executionId: claim.executionId, buildId: options.buildId, imageDigest: options.imageDigest, attempt: claim.attempt },
      boundaries: { ...job.boundaries, exactSourcesVerifiedBeforeAndAfter: true, resultIsMeasurementNotMixAuthorization: true },
    }, job);
    const committed = await store.complete({ claim, receipt, now: options.now() });
    return committed
      ? { disposition: "completed", jobId: job.jobId, bestLagMilliseconds: receipt.measurement.bestLagMilliseconds, peakAbsolutePowerCorrelation: receipt.measurement.peakAbsolutePowerCorrelation }
      : { disposition: "claim-lost", jobId: job.jobId };
  } catch (error) {
    const terminal = error instanceof TerminalAudioPairCorrelationError || (error instanceof AudioPairCorrelationDecodeError && !error.retryable);
    const code = error instanceof TerminalAudioPairCorrelationError || error instanceof AudioPairCorrelationDecodeError ? error.code : "audio-pair-worker-retry";
    const operation = terminal ? store.fail.bind(store) : store.retry.bind(store);
    await operation({ claim, code, message: errorMessage(error), now: options.now() });
    return { disposition: terminal ? "failed" : "retry", jobId: job.jobId, code };
  }
}

export class PostgresLocalAudioPairCorrelationStore implements LocalAudioPairCorrelationStore {
  constructor(private readonly pool: InstanceType<typeof Pool>) {}

  async claim(input: { executionId: string; leaseMs: number; now: Date }) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const selected = await client.query({
        text: `
          SELECT "id", "inputJson", "resultJson"
          FROM "StudioAssetProcessingJob"
          WHERE "type" = $1
            AND "inputJson"->'reference'->'source'->>'provider' = 'local'
            AND "inputJson"->'observation'->'source'->>'provider' = 'local'
            AND ("status" = 'queued' OR ("status" = 'processing' AND "updatedAt" < $2))
          ORDER BY "createdAt" ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        `,
        values: [JOB_TYPE, new Date(input.now.getTime() - input.leaseMs)],
      });
      const row = selected.rows[0];
      if (!row) { await client.query("COMMIT"); return null; }
      const previousLease = record(record(row.resultJson).lease);
      const attempt = Math.max(0, Number(previousLease.attempt) || 0) + 1;
      const updated = await client.query({
        text: `
          UPDATE "StudioAssetProcessingJob"
          SET "status" = 'processing', "startedAt" = COALESCE("startedAt", $2), "updatedAt" = $2,
              "error" = NULL, "resultJson" = $3::jsonb
          WHERE "id" = $1
          RETURNING "id", "inputJson"
        `,
        values: [row.id, input.now, JSON.stringify({ state: "processing", lease: { executionId: input.executionId, attempt, claimedAt: input.now.toISOString(), expiresAt: new Date(input.now.getTime() + input.leaseMs).toISOString() }, originalSourcesRemainTruth: true })],
      });
      await client.query("COMMIT");
      return { id: updated.rows[0].id, inputJson: updated.rows[0].inputJson, attempt, executionId: input.executionId };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }

  async complete(input: { claim: LocalAudioPairCorrelationClaim; receipt: AudioPairCorrelationResult; now: Date }) {
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

  retry(input: { claim: LocalAudioPairCorrelationClaim; code: string; message: string; now: Date }) { return this.release(input, "queued"); }
  fail(input: { claim: LocalAudioPairCorrelationClaim; code: string; message: string; now: Date }) { return this.release(input, "failed"); }

  private async release(input: { claim: LocalAudioPairCorrelationClaim; code: string; message: string; now: Date }, status: "queued" | "failed") {
    const result = await this.pool.query({
      text: `
        UPDATE "StudioAssetProcessingJob"
        SET "status" = $3::text, "updatedAt" = $4::timestamp(3),
            "completedAt" = CASE WHEN $3::text = 'failed' THEN $4::timestamp(3) ELSE NULL::timestamp END,
            "error" = $5, "resultJson" = $6::jsonb
        WHERE "id" = $1 AND "status" = 'processing' AND "resultJson"->'lease'->>'executionId' = $2
      `,
      values: [input.claim.id, input.claim.executionId, status, input.now, `${input.code}: ${input.message}`.slice(0, 4_000), JSON.stringify({ state: status, failure: { code: input.code, message: input.message }, lease: { executionId: input.claim.executionId, attempt: input.claim.attempt }, originalSourcesRemainTruth: true })],
    });
    return result.rowCount === 1;
  }
}

export function newLocalAudioPairCorrelationRuntime(input: { pool: InstanceType<typeof Pool>; localMediaRoot: string; leaseMs: number; buildId: string }) {
  return { store: new PostgresLocalAudioPairCorrelationStore(input.pool), analyzer: new FfmpegAudioPairCorrelationAnalyzer(), options: { executionId: randomUUID(), buildId: input.buildId, imageDigest: null, leaseMs: input.leaseMs, localMediaRoot: input.localMediaRoot, now: () => new Date() } satisfies LocalAudioPairCorrelationWorkerOptions };
}

async function authorizedRoot(configuredRoot: string) { const temporaryRoot = await realpath(tmpdir()); const resolved = path.resolve(configuredRoot); await mkdir(resolved, { recursive: true, mode: 0o700 }); const root = await realpath(resolved); if (root === temporaryRoot || !pathIsInside(temporaryRoot, root)) throw new TerminalAudioPairCorrelationError("audio-pair-root-rejected", "Local pair root must be a dedicated directory below the operating-system temporary directory."); return root; }
async function authorizedSource(root: string, locator: string) { const source = await realpath(locator).catch(() => ""); if (!source || !pathIsInside(root, source)) throw new TerminalAudioPairCorrelationError("audio-pair-source-path-rejected", "Local pair source escaped the authorized media root."); return source; }
async function inspectSource(sourcePath: string) { const file = await stat(sourcePath); if (!file.isFile() || file.size <= 0) throw new TerminalAudioPairCorrelationError("audio-pair-source-unavailable", "A retained pair source is empty or unavailable."); return { sizeBytes: file.size, sha256: await sha256File(sourcePath) }; }
function assertSource(source: AudioPairCorrelationJob["reference"]["source"], evidence: { sizeBytes: number; sha256: string }) { if (source.sizeBytes !== evidence.sizeBytes || source.sha256 !== evidence.sha256 || source.generation !== `sha256:${evidence.sha256}`) throw new TerminalAudioPairCorrelationError("audio-pair-source-byte-mismatch", "A local pair source no longer matches its queued immutable byte receipt."); }
function pathIsInside(root: string, candidate: string) { const relative = path.relative(root, candidate); return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative)); }
function record(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function errorMessage(error: unknown) { return error instanceof Error && error.message.trim() ? error.message : String(error); }
