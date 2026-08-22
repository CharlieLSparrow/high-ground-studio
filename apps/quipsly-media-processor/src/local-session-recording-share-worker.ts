import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { copyFile, mkdir, readFile, realpath, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  newSessionRecordingShareResult,
  parseSessionRecordingShareJob,
  type SessionRecordingShareJob,
  type SessionRecordingShareResult,
} from "@high-ground/quipsly-media-processing";
import type { Pool } from "pg";

import { sha256File } from "./transcoder.js";
import { FfmpegSessionRecordingShareRenderer } from "./session-recording-share-ffmpeg.js";

const JOB_TYPE = "session-recording-share";

export type LocalSessionRecordingShareClaim = {
  id: string;
  inputJson: unknown;
  resultJson: unknown;
};

export interface LocalSessionRecordingShareStore {
  claim(input: { now: Date; leaseMs: number }): Promise<LocalSessionRecordingShareClaim | null>;
  complete(input: { claim: LocalSessionRecordingShareClaim; result: SessionRecordingShareResult; now: Date }): Promise<boolean>;
  fail(input: { claim: LocalSessionRecordingShareClaim; code: string; message: string; now: Date }): Promise<boolean>;
}

export type LocalSessionRecordingShareOptions = {
  executionId: string;
  buildId: string;
  imageDigest: string | null;
  localMediaRoot: string;
  leaseMs: number;
  now: () => Date;
};

type LocalSessionRecordingShareReceipt = {
  generation: string;
  sizeBytes: number;
  contentType: "audio/mp4";
  customMetadata: Record<string, string>;
  technical: {
    durationSeconds: number;
    codec: "aac";
    sampleRateHz: 48_000;
    channels: 2;
    completeDecode: true;
    ffmpegVersion: string;
  };
  createdAt: string;
};

function inside(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function authorizedSource(root: string, locator: string) {
  const source = await realpath(locator).catch(() => "");
  if (!source || !inside(root, source)) throw Object.assign(new Error("Session share source escaped the authorized local media root."), { code: "session-recording-share-source-path-rejected" });
  return source;
}

function authorizedTarget(root: string, configuredRoot: string, locator: string) {
  const configured = path.resolve(configuredRoot);
  const requested = path.resolve(locator);
  if (!inside(configured, requested)) {
    throw Object.assign(new Error("Session share target escaped the configured local media root."), { code: "session-recording-share-target-path-rejected" });
  }
  const target = path.resolve(root, path.relative(configured, requested));
  if (!inside(root, target) || path.extname(target).toLowerCase() !== ".m4a") {
    throw Object.assign(new Error("Session share target escaped the authorized local media root."), { code: "session-recording-share-target-path-rejected" });
  }
  return target;
}

async function verifySource(source: SessionRecordingShareJob["sources"][number], resolved: string) {
  const sourceStat = await stat(resolved);
  const sha256 = await sha256File(resolved);
  if (!sourceStat.isFile() || sourceStat.size !== source.sizeBytes || sha256 !== source.sha256) {
    throw Object.assign(new Error("Session share source changed after its immutable edit binding."), { code: "session-recording-share-source-byte-mismatch" });
  }
}

function receiptMatchesJob(receipt: LocalSessionRecordingShareReceipt, job: SessionRecordingShareJob) {
  const metadata = receipt.customMetadata;
  const editSha256 = createHash("sha256").update(JSON.stringify(job.edit)).digest("hex");
  const legacyFullRange = job.edit.keptRanges.length === 1
    && job.edit.keptRanges[0]?.startSeconds === job.edit.startSeconds
    && job.edit.keptRanges[0]?.endSeconds === job.edit.endSeconds
    && job.edit.transcriptExclusions.length === 0
    && job.edit.joinCrossfadeSeconds === 0;
  return receipt.contentType === job.target.contentType
    && (
      (metadata.quipslyKind === "session-recording-share-v2" && metadata.quipslyEditSha256 === editSha256)
      || (metadata.quipslyKind === "session-recording-share-v1" && legacyFullRange)
    )
    && metadata.quipslyJobId === job.jobId
    && metadata.quipslyRoomId === job.roomId
    && metadata.quipslyOutputId === job.outputId
    && metadata.quipslyOutputRevision === String(job.outputRevision)
    && metadata.quipslySourceSetSha256 === job.sourceSetSha256
    && metadata.quipslyOriginalSourcesRemainImmutable === "true";
}

async function loadReusableRender(target: string, job: SessionRecordingShareJob) {
  try {
    const [receipt, targetStat, sha256] = await Promise.all([
      readFile(`${target}.quipsly.json`, "utf8").then((value) => JSON.parse(value) as LocalSessionRecordingShareReceipt),
      stat(target),
      sha256File(target),
    ]);
    if (
      !targetStat.isFile()
      || targetStat.size !== receipt.sizeBytes
      || sha256 !== receipt.customMetadata.quipslyExpectedSha256
      || receipt.customMetadata.quipslyExpectedSizeBytes !== String(receipt.sizeBytes)
      || !receiptMatchesJob(receipt, job)
      || receipt.technical.codec !== "aac"
      || receipt.technical.sampleRateHz !== 48_000
      || receipt.technical.channels !== 2
      || receipt.technical.completeDecode !== true
    ) {
      throw Object.assign(new Error("Existing Session share does not match its immutable render receipt."), { code: "session-recording-share-existing-target-mismatch" });
    }
    return { receipt, sha256 };
  } catch (error: any) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function resultFromReceipt(job: SessionRecordingShareJob, receipt: LocalSessionRecordingShareReceipt, sha256: string, options: LocalSessionRecordingShareOptions) {
  return newSessionRecordingShareResult({
    jobId: job.jobId,
    roomId: job.roomId,
    outputId: job.outputId,
    outputRevision: job.outputRevision,
    sourceSetSha256: job.sourceSetSha256,
    edit: job.edit,
    sourceRecordingAssetIds: job.sources.map((source) => source.recordingAssetId),
    output: {
      ...job.target,
      generation: receipt.generation,
      sha256,
      sizeBytes: receipt.sizeBytes,
      durationSeconds: receipt.technical.durationSeconds,
      completeDecode: true,
    },
    worker: {
      executionId: options.executionId,
      buildId: options.buildId,
      imageDigest: options.imageDigest,
      ffmpegVersion: receipt.technical.ffmpegVersion,
    },
    completedAt: options.now().toISOString(),
  });
}

export async function runOneLocalSessionRecordingShareJob(
  store: LocalSessionRecordingShareStore,
  renderer: FfmpegSessionRecordingShareRenderer,
  options: LocalSessionRecordingShareOptions,
) {
  const claim = await store.claim({ now: options.now(), leaseMs: options.leaseMs });
  if (!claim) return { disposition: "idle" as const };
  const progress = (phase: string) => process.stdout.write(`${JSON.stringify({ at: options.now().toISOString(), lane: JOB_TYPE, jobId: claim.id, phase })}\n`);
  progress("claimed");
  let job: SessionRecordingShareJob;
  try {
    job = parseSessionRecordingShareJob(claim.inputJson);
  } catch (error) {
    await store.fail({ claim, code: "session-recording-share-job-invalid", message: error instanceof Error ? error.message : "Invalid Session recording share job.", now: options.now() });
    return { disposition: "failed" as const, jobId: claim.id, code: "session-recording-share-job-invalid" };
  }
  if (job.target.provider !== "local" || job.sources.some((source) => source.provider !== "local")) {
    await store.fail({ claim, code: "session-recording-share-provider-unsupported", message: "The local Session share worker accepts local media only.", now: options.now() });
    return { disposition: "failed" as const, jobId: claim.id, code: "session-recording-share-provider-unsupported" };
  }
  try {
    progress("verifying-sources");
    const root = await realpath(options.localMediaRoot);
    const sources = await Promise.all(job.sources.map(async (source) => {
      const locator = await authorizedSource(root, source.locator);
      await verifySource(source, locator);
      return { ...source, locator };
    }));
    progress("sources-verified");
    const target = authorizedTarget(root, options.localMediaRoot, job.target.locator);
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    const reusable = await loadReusableRender(target, job);
    if (reusable) {
      const result = resultFromReceipt(job, reusable.receipt, reusable.sha256, options);
      const completed = await store.complete({ claim, result, now: options.now() });
      return completed
        ? { disposition: "completed" as const, jobId: claim.id, outputPath: target, outputSha256: reusable.sha256, recovered: true }
        : { disposition: "claim-lost" as const, jobId: claim.id };
    }
    const temporary = `${target}.${randomUUID()}.tmp.m4a`;
    let rendered: Awaited<ReturnType<FfmpegSessionRecordingShareRenderer["render"]>>;
    try {
      progress("rendering");
      rendered = await renderer.render({ ...job, sources }, temporary);
      progress("render-verified");
      await copyFile(temporary, target, fsConstants.COPYFILE_EXCL).catch(async (error: any) => {
        if (error?.code !== "EEXIST") throw error;
        const existing = await loadReusableRender(target, job);
        if (!existing || existing.sha256 !== rendered.sha256) {
          throw Object.assign(new Error("A different immutable Session share already occupies this target."), { code: "session-recording-share-existing-target-mismatch" });
        }
      });
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
    const generation = Date.now().toString();
    const receipt: LocalSessionRecordingShareReceipt = {
      generation,
      sizeBytes: rendered.bytes.length,
      contentType: job.target.contentType,
      customMetadata: {
        quipslyKind: "session-recording-share-v2",
        quipslyJobId: job.jobId,
        quipslyRoomId: job.roomId,
        quipslyOutputId: job.outputId,
        quipslyOutputRevision: String(job.outputRevision),
        quipslyExpectedSha256: rendered.sha256,
        quipslyExpectedSizeBytes: String(rendered.bytes.length),
        quipslySourceSetSha256: job.sourceSetSha256,
        quipslyEditSha256: createHash("sha256").update(JSON.stringify(job.edit)).digest("hex"),
        quipslyOriginalSourcesRemainImmutable: "true",
      },
      technical: rendered.technical,
      createdAt: options.now().toISOString(),
    };
    try {
      await writeFile(`${target}.quipsly.json`, JSON.stringify(receipt), { mode: 0o600, flag: "wx" });
    } catch (error: any) {
      if (error?.code !== "EEXIST") throw error;
      const existing = await loadReusableRender(target, job);
      if (!existing || existing.sha256 !== rendered.sha256) throw error;
    }
    const durable = await loadReusableRender(target, job);
    if (!durable) throw new Error("Session share render receipt was not durable after installation.");
    progress("receipt-verified");
    const result = resultFromReceipt(job, durable.receipt, durable.sha256, options);
    const completed = await store.complete({ claim, result, now: options.now() });
    return completed
      ? { disposition: "completed" as const, jobId: claim.id, outputPath: target, outputSha256: rendered.sha256 }
      : { disposition: "claim-lost" as const, jobId: claim.id };
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "session-recording-share-worker-failed";
    await store.fail({ claim, code, message: error instanceof Error ? error.message : "Session recording share worker failed.", now: options.now() });
    return { disposition: "failed" as const, jobId: claim.id, code };
  }
}

class PostgresLocalSessionRecordingShareStore implements LocalSessionRecordingShareStore {
  constructor(private readonly pool: Pool) {}

  async claim(input: { now: Date; leaseMs: number }) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query({
        text: `SELECT "id", "inputJson", "resultJson" FROM "StudioWorkflowJob" WHERE "type"=$1 AND "source"='session-recording-share' AND "inputJson"->'target'->>'provider'='local' AND ("status"='queued' OR ("status"='processing' AND "updatedAt"<$2)) ORDER BY "createdAt" ASC FOR UPDATE SKIP LOCKED LIMIT 1`,
        values: [JOB_TYPE, new Date(input.now.getTime() - input.leaseMs)],
      });
      const row = result.rows[0] as LocalSessionRecordingShareClaim | undefined;
      if (!row) { await client.query("COMMIT"); return null; }
      await client.query({
        text: `UPDATE "StudioWorkflowJob" SET "status"='processing', "startedAt"=COALESCE("startedAt",$2::timestamptz), "updatedAt"=$2::timestamptz, "resultJson"=COALESCE("resultJson",'{}'::jsonb)||jsonb_build_object('localLease',jsonb_build_object('claimedAt',$2::timestamptz,'leaseMs',$3::integer)) WHERE "id"=$1`,
        values: [row.id, input.now, input.leaseMs],
      });
      await client.query("COMMIT");
      return row;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async complete(input: { claim: LocalSessionRecordingShareClaim; result: SessionRecordingShareResult; now: Date }) {
    const result = await this.pool.query({
      text: `UPDATE "StudioWorkflowJob" SET "status"='completed', "resultJson"=$2::jsonb, "error"=NULL, "completedAt"=$3::timestamptz, "updatedAt"=$3::timestamptz WHERE "id"=$1 AND "status"='processing'`,
      values: [input.claim.id, JSON.stringify(input.result), input.now],
    });
    return result.rowCount === 1;
  }

  async fail(input: { claim: LocalSessionRecordingShareClaim; code: string; message: string; now: Date }) {
    const result = await this.pool.query({
      text: `UPDATE "StudioWorkflowJob" SET "status"='failed', "error"=$2::text, "resultJson"=COALESCE("resultJson",'{}'::jsonb)||jsonb_build_object('failure',jsonb_build_object('code',$3::text,'message',$2::text,'failedAt',$4::timestamptz)), "completedAt"=$4::timestamptz, "updatedAt"=$4::timestamptz WHERE "id"=$1 AND "status"='processing'`,
      values: [input.claim.id, input.message.slice(0, 4_000), input.code, input.now],
    });
    return result.rowCount === 1;
  }
}

export function newLocalSessionRecordingShareRuntime(input: {
  pool: Pool;
  executionId: string;
  localMediaRoot: string;
  leaseMs: number;
  buildId: string;
}) {
  return {
    store: new PostgresLocalSessionRecordingShareStore(input.pool),
    renderer: new FfmpegSessionRecordingShareRenderer(),
    options: {
      executionId: input.executionId,
      buildId: input.buildId,
      imageDigest: null,
      localMediaRoot: input.localMediaRoot,
      leaseMs: input.leaseMs,
      now: () => new Date(),
    } satisfies LocalSessionRecordingShareOptions,
  };
}
