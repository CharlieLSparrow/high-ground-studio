import { randomUUID } from "node:crypto";
import { mkdir, open, realpath, rename, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  AUDIO_DELIVERY_CONTRACT_VERSION,
  AUDIO_DELIVERY_RESULT_KIND,
  assessAudioMastery,
  parseAudioDeliveryJob,
  parseAudioDeliveryResult,
  type AudioDeliveryJob,
  type AudioDeliveryResult,
  type AudioMasteryMeasurement,
  type AudioMasterySourceBinding,
} from "@high-ground/quipsly-media-processing";
import pg from "pg";

import { FfmpegAudioDeliveryEncoder, type EncodedAudioDelivery } from "./audio-delivery-ffmpeg.js";
import { FfmpegAudioMasteringEngine } from "./audio-mastering-ffmpeg.js";
import { ProxyTranscodeError, sha256File } from "./transcoder.js";

const { Pool } = pg;
const JOB_TYPE = "audio-delivery";

export type LocalAudioDeliveryClaim = { id: string; inputJson: unknown; attempt: number; executionId: string };
export interface LocalAudioDeliveryStore {
  claim(input: { executionId: string; leaseMs: number; now: Date }): Promise<LocalAudioDeliveryClaim | null>;
  complete(input: { claim: LocalAudioDeliveryClaim; receipt: AudioDeliveryResult; now: Date }): Promise<boolean>;
  retry(input: { claim: LocalAudioDeliveryClaim; code: string; message: string; now: Date }): Promise<boolean>;
  fail(input: { claim: LocalAudioDeliveryClaim; code: string; message: string; now: Date }): Promise<boolean>;
}
export interface LocalAudioDeliveryEncoder {
  encode(inputPath: string, outputPath: string, job: AudioDeliveryJob): Promise<EncodedAudioDelivery>;
  inspect(outputPath: string): Promise<EncodedAudioDelivery>;
}
export interface LocalAudioDeliveryMeasurer {
  measure(inputPath: string, input: { source: AudioMasterySourceBinding; profileId: AudioDeliveryJob["masteryProfileId"]; measurementId?: string; measuredAt?: string }): Promise<AudioMasteryMeasurement>;
}
export type LocalAudioDeliveryWorkerOptions = { executionId: string; buildId: string; imageDigest: string | null; leaseMs: number; localMediaRoot: string; now: () => Date };
export type LocalAudioDeliveryWorkerResult =
  | { disposition: "idle" }
  | { disposition: "completed"; jobId: string; outputPath: string; recoveredExistingOutput: boolean }
  | { disposition: "claim-lost"; jobId: string }
  | { disposition: "retry"; jobId: string; code: string }
  | { disposition: "failed"; jobId: string; code: string };

class TerminalAudioDeliveryError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = "TerminalAudioDeliveryError"; }
}

export async function runOneLocalAudioDeliveryJob(store: LocalAudioDeliveryStore, encoder: LocalAudioDeliveryEncoder, measurer: LocalAudioDeliveryMeasurer, options: LocalAudioDeliveryWorkerOptions): Promise<LocalAudioDeliveryWorkerResult> {
  const claim = await store.claim({ executionId: options.executionId, leaseMs: options.leaseMs, now: options.now() });
  if (!claim) return { disposition: "idle" };
  let job: AudioDeliveryJob;
  try { job = parseAudioDeliveryJob(claim.inputJson, claim.id); }
  catch (error) {
    await store.fail({ claim, code: "audio-delivery-job-invalid", message: message(error), now: options.now() });
    return { disposition: "failed", jobId: claim.id, code: "audio-delivery-job-invalid" };
  }
  if (job.source.provider !== "local" || job.target.provider !== "local") {
    await store.fail({ claim, code: "audio-delivery-provider-unsupported", message: "The local delivery worker accepts local media only.", now: options.now() });
    return { disposition: "failed", jobId: job.jobId, code: "audio-delivery-provider-unsupported" };
  }
  let partialPath = "";
  let outputPath = "";
  let createdOutput = false;
  try {
    const root = await authorizedRoot(options.localMediaRoot);
    const sourcePath = await authorizedSource(root, job.source.locator);
    await assertSource(job, sourcePath);
    outputPath = authorizedTarget(root, job.target.locator);
    partialPath = outputPath.replace(/\.m4a$/, `.partial-${claim.executionId.replace(/[^A-Za-z0-9_-]/g, "-")}.m4a`);
    await mkdir(path.dirname(outputPath), { recursive: true, mode: 0o700 });
    let encoded: EncodedAudioDelivery;
    let recoveredExistingOutput = false;
    const existing = await stat(outputPath).catch(() => null);
    if (existing?.isFile() && existing.size > 0) {
      encoded = await encoder.inspect(outputPath);
      recoveredExistingOutput = true;
    } else {
      await rm(partialPath, { force: true });
      encoded = await encoder.encode(sourcePath, partialPath, job);
      await flushFile(partialPath);
      await rename(partialPath, outputPath);
      encoded = { ...encoded, outputPath };
      createdOutput = true;
    }
    if (Math.abs(encoded.durationSeconds - job.source.durationSeconds) > 0.1) {
      throw new TerminalAudioDeliveryError("audio-delivery-duration-drift", "The encoded artifact duration drifted from the promoted master.");
    }
    await assertSource(job, sourcePath);
    const outputSource: AudioMasterySourceBinding = {
      assetId: job.source.assetId, provider: "local", locator: job.target.locator,
      generation: `sha256:${encoded.sha256}`, sha256: encoded.sha256,
      sizeBytes: encoded.sizeBytes, contentType: "audio/mp4",
    };
    const verificationMeasurement = await measurer.measure(outputPath, {
      source: outputSource, profileId: job.masteryProfileId,
      measurementId: `measurement_${randomUUID().replaceAll("-", "")}`,
      measuredAt: options.now().toISOString(),
    });
    const outputAfterMeasurement = await stat(outputPath);
    if (!outputAfterMeasurement.isFile() || outputAfterMeasurement.size !== encoded.sizeBytes || await sha256File(outputPath) !== encoded.sha256) {
      throw new TerminalAudioDeliveryError("audio-delivery-output-drift", "The encoded artifact changed during post-encode measurement.");
    }
    const verification = assessAudioMastery(verificationMeasurement, job.masteryProfileId);
    if (!verification.passes) throw new TerminalAudioDeliveryError("audio-delivery-loudness-verification-failed", "Lossy delivery encoding drifted outside the approved loudness and true-peak profile.");
    const receipt = parseAudioDeliveryResult({
      kind: AUDIO_DELIVERY_RESULT_KIND, version: AUDIO_DELIVERY_CONTRACT_VERSION,
      jobId: job.jobId, completedAt: options.now().toISOString(), source: job.source,
      masteryProfileId: job.masteryProfileId, profile: { ...job.target, id: job.profileId, label: "Apple Podcasts AAC-LC stereo", container: encoded.container },
      output: { ...encoded, outputPath: undefined, provider: "local", locator: job.target.locator, generation: `sha256:${encoded.sha256}`, variantKind: "audio-delivery-artifact", verificationMeasurement, verification },
      worker: { executionId: claim.executionId, buildId: options.buildId, imageDigest: options.imageDigest, attempt: claim.attempt, ffmpegVersion: encoded.ffmpegVersion },
      boundaries: { originalRemainsSourceTruth: true, promotedMasterRemainsCandidateTruth: true, outputIsUnapprovedDeliveryArtifact: true, proofListenRequiredBeforeOutputPacket: true, uploadNotStarted: true, publicationNotStarted: true },
    }, job);
    const committed = await store.complete({ claim, receipt, now: options.now() });
    return committed ? { disposition: "completed", jobId: job.jobId, outputPath, recoveredExistingOutput } : { disposition: "claim-lost", jobId: job.jobId };
  } catch (error) {
    await rm(partialPath, { force: true }).catch(() => undefined);
    const terminal = error instanceof TerminalAudioDeliveryError || (error instanceof ProxyTranscodeError && !error.retryable);
    const code = error instanceof TerminalAudioDeliveryError || error instanceof ProxyTranscodeError ? error.code : "audio-delivery-worker-retry";
    if (terminal) {
      if (createdOutput && outputPath) await rm(outputPath, { force: true }).catch(() => undefined);
      await store.fail({ claim, code, message: message(error), now: options.now() });
      return { disposition: "failed", jobId: job.jobId, code };
    }
    await store.retry({ claim, code, message: message(error), now: options.now() });
    return { disposition: "retry", jobId: job.jobId, code };
  }
}

export class PostgresLocalAudioDeliveryStore implements LocalAudioDeliveryStore {
  constructor(private readonly pool: InstanceType<typeof Pool>) {}
  async claim(input: { executionId: string; leaseMs: number; now: Date }) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const selected = await client.query({ text: `SELECT "id", "inputJson", "resultJson" FROM "StudioAssetProcessingJob" WHERE "type"=$1 AND "inputJson"->'source'->>'provider'='local' AND ("status"='queued' OR ("status"='processing' AND "updatedAt"<$2)) ORDER BY "createdAt" ASC FOR UPDATE SKIP LOCKED LIMIT 1`, values: [JOB_TYPE, new Date(input.now.getTime() - input.leaseMs)] });
      const row = selected.rows[0];
      if (!row) { await client.query("COMMIT"); return null; }
      const attempt = Math.max(0, Number(object(object(row.resultJson).lease).attempt) || 0) + 1;
      const updated = await client.query({ text: `UPDATE "StudioAssetProcessingJob" SET "status"='processing', "startedAt"=COALESCE("startedAt",$2), "updatedAt"=$2, "error"=NULL, "resultJson"=$3::jsonb WHERE "id"=$1 RETURNING "id", "inputJson"`, values: [row.id, input.now, JSON.stringify({ state: "processing", lease: { executionId: input.executionId, attempt, claimedAt: input.now.toISOString(), expiresAt: new Date(input.now.getTime() + input.leaseMs).toISOString() }, originalRemainsSourceTruth: true })] });
      await client.query("COMMIT");
      return { id: updated.rows[0].id, inputJson: updated.rows[0].inputJson, attempt, executionId: input.executionId };
    } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; } finally { client.release(); }
  }
  async complete(input: { claim: LocalAudioDeliveryClaim; receipt: AudioDeliveryResult; now: Date }) { return (await this.pool.query({ text: `UPDATE "StudioAssetProcessingJob" SET "status"='output-ready', "updatedAt"=$3, "completedAt"=NULL, "error"=NULL, "resultJson"=$4::jsonb WHERE "id"=$1 AND "status"='processing' AND "resultJson"->'lease'->>'executionId'=$2`, values: [input.claim.id, input.claim.executionId, input.now, JSON.stringify({ state: "output-ready", receipt: input.receipt })] })).rowCount === 1; }
  retry(input: { claim: LocalAudioDeliveryClaim; code: string; message: string; now: Date }) { return this.release(input, "queued"); }
  fail(input: { claim: LocalAudioDeliveryClaim; code: string; message: string; now: Date }) { return this.release(input, "failed"); }
  private async release(input: { claim: LocalAudioDeliveryClaim; code: string; message: string; now: Date }, status: "queued" | "failed") { return (await this.pool.query({ text: `UPDATE "StudioAssetProcessingJob" SET "status"=$3, "updatedAt"=$4, "completedAt"=CASE WHEN $3='failed' THEN $4 ELSE NULL END, "error"=$5, "resultJson"=$6::jsonb WHERE "id"=$1 AND "status"='processing' AND "resultJson"->'lease'->>'executionId'=$2`, values: [input.claim.id, input.claim.executionId, status, input.now, `${input.code}: ${input.message}`.slice(0, 4_000), JSON.stringify({ state: status, failure: { code: input.code, message: input.message }, lease: { executionId: input.claim.executionId, attempt: input.claim.attempt } })] })).rowCount === 1; }
}

export function newLocalAudioDeliveryRuntime(input: { pool: InstanceType<typeof Pool>; localMediaRoot: string; leaseMs: number; buildId: string }) {
  return { store: new PostgresLocalAudioDeliveryStore(input.pool), encoder: new FfmpegAudioDeliveryEncoder(), measurer: new FfmpegAudioMasteringEngine(), options: { executionId: randomUUID(), buildId: input.buildId, imageDigest: null, leaseMs: input.leaseMs, localMediaRoot: input.localMediaRoot, now: () => new Date() } satisfies LocalAudioDeliveryWorkerOptions };
}

async function authorizedRoot(configuredRoot: string) { const temp = await realpath(tmpdir()); const resolved = path.resolve(configuredRoot); await mkdir(resolved, { recursive: true, mode: 0o700 }); const root = await realpath(resolved); if (root === temp || !inside(temp, root)) throw new TerminalAudioDeliveryError("audio-delivery-root-rejected", "Local delivery root must be a dedicated directory below the operating-system temporary directory."); return root; }
async function authorizedSource(root: string, locator: string) { const source = await realpath(locator).catch(() => ""); if (!source || !inside(root, source)) throw new TerminalAudioDeliveryError("audio-delivery-source-path-rejected", "Promoted master escaped the authorized media root."); return source; }
function authorizedTarget(root: string, locator: string) { const output = path.resolve(root, locator); if (!inside(root, output) || !output.endsWith(".m4a")) throw new TerminalAudioDeliveryError("audio-delivery-target-path-rejected", "Delivery target escaped the authorized media root."); return output; }
async function assertSource(job: AudioDeliveryJob, sourcePath: string) { const sourceStat = await stat(sourcePath); if (!sourceStat.isFile() || sourceStat.size !== job.source.sizeBytes || await sha256File(sourcePath) !== job.source.sha256) throw new TerminalAudioDeliveryError("audio-delivery-source-byte-mismatch", "Promoted candidate no longer matches its immutable byte receipt."); }
async function flushFile(filePath: string) { const handle = await open(filePath, "r+"); try { await handle.sync(); await handle.chmod(0o600); } finally { await handle.close(); } }
function inside(root: string, candidate: string) { const relative = path.relative(root, candidate); return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative)); }
function object(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function message(error: unknown) { return error instanceof Error && error.message.trim() ? error.message : "Audio delivery worker failed."; }
