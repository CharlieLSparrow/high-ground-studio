import { randomUUID } from "node:crypto";
import {
  mkdir,
  open,
  realpath,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  newEpisodeCollaborationProxyResult,
  parseEpisodeCollaborationProxyJob,
  type EpisodeCollaborationProxyJob,
  type EpisodeCollaborationProxyResult,
} from "@high-ground/quipsly-media-processing";
import pg from "pg";

import {
  FfmpegCaptureProxyTranscoder,
  ProxyTranscodeError,
  sha256File,
  type CaptureProxyTranscoder,
} from "./transcoder.js";
import {
  newLocalAudioMasteryRuntime,
  runOneLocalAudioMasteryJob,
} from "./local-audio-mastery-worker.js";
import {
  newLocalAudioDeliveryRuntime,
  runOneLocalAudioDeliveryJob,
} from "./local-audio-delivery-worker.js";
import {
  newLocalAudioTreatmentRuntime,
  runOneLocalAudioTreatmentJob,
} from "./local-audio-treatment-worker.js";
import {
  newLocalDialogueRepairRuntime,
  runOneLocalDialogueRepairJob,
} from "./local-dialogue-repair-worker.js";
import {
  newLocalAudioSignalProfileRuntime,
  runOneLocalAudioSignalProfileJob,
} from "./local-audio-signal-profile-worker.js";
import {
  newLocalAudioSpectralRuntime,
  runOneLocalAudioSpectralEvidenceJob,
} from "./local-audio-spectral-evidence-worker.js";
import {
  newLocalStudioTranscriptRuntime,
  runOneLocalStudioTranscriptJob,
} from "./local-studio-transcript-worker.js";
import {
  newLocalAudioAlignmentRuntime,
  runOneLocalAudioAlignmentJob,
} from "./local-audio-alignment-worker.js";
import {
  newLocalAudioPairCorrelationRuntime,
  runOneLocalAudioPairCorrelationJob,
} from "./local-audio-pair-correlation-worker.js";
import {
  newLocalEpisodeAudioMixRuntime,
  runOneLocalEpisodeAudioMixJob,
} from "./local-episode-audio-mix-worker.js";
import {
  newLocalEpisodeRenderProofRuntime,
  runOneLocalEpisodeRenderProofJob,
} from "./local-episode-render-proof-worker.js";
import {
  newLocalSpatialReframeRuntime,
  runOneLocalSpatialReframeJob,
} from "./local-spatial-reframe-worker.js";
import { LocalExecutionPresence } from "./local-execution-presence.js";
import {
  newLocalExternalSourceProxyRuntime,
  runOneLocalExternalSourceProxyJob,
} from "./local-external-source-proxy-worker.js";

const { Pool } = pg;
const JOB_TYPE = "asset-proxy";
const JOB_SOURCE = "episode-import-media.upload";
const DEFAULT_LEASE_MS = 15 * 60 * 1_000;
const DEFAULT_POLL_MS = 2_000;

export type LocalEpisodeProxyClaim = {
  id: string;
  inputJson: unknown;
  attempt: number;
  executionId: string;
};

export interface LocalEpisodeProxyStore {
  claim(input: { executionId: string; leaseMs: number; now: Date }): Promise<LocalEpisodeProxyClaim | null>;
  complete(input: { claim: LocalEpisodeProxyClaim; receipt: EpisodeCollaborationProxyResult; now: Date }): Promise<boolean>;
  retry(input: { claim: LocalEpisodeProxyClaim; code: string; message: string; now: Date }): Promise<boolean>;
  fail(input: { claim: LocalEpisodeProxyClaim; code: string; message: string; now: Date }): Promise<boolean>;
}

export type LocalEpisodeProxyWorkerOptions = {
  executionId: string;
  buildId: string;
  imageDigest: string | null;
  leaseMs: number;
  localMediaRoot: string;
  now: () => Date;
};

export type LocalEpisodeProxyWorkerResult =
  | { disposition: "idle" }
  | { disposition: "completed"; jobId: string; outputPath: string; recoveredExistingOutput: boolean }
  | { disposition: "claim-lost"; jobId: string }
  | { disposition: "retry"; jobId: string; code: string }
  | { disposition: "failed"; jobId: string; code: string };

class TerminalLocalEpisodeProxyError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "TerminalLocalEpisodeProxyError";
  }
}

export async function runOneLocalEpisodeProxyJob(
  store: LocalEpisodeProxyStore,
  transcoder: CaptureProxyTranscoder,
  options: LocalEpisodeProxyWorkerOptions,
): Promise<LocalEpisodeProxyWorkerResult> {
  const claim = await store.claim({
    executionId: options.executionId,
    leaseMs: options.leaseMs,
    now: options.now(),
  });
  if (!claim) return { disposition: "idle" };

  let job: EpisodeCollaborationProxyJob;
  try {
    job = parseEpisodeCollaborationProxyJob(claim.inputJson, claim.id);
  } catch (error) {
    const message = errorMessage(error, "Episode proxy job contract is invalid.");
    await store.fail({ claim, code: "episode-proxy-job-invalid", message, now: options.now() });
    return { disposition: "failed", jobId: claim.id, code: "episode-proxy-job-invalid" };
  }

  if (job.source.provider !== "local" || job.target.provider !== "local") {
    await store.fail({
      claim,
      code: "episode-proxy-provider-unsupported",
      message: "The local worker accepts local ingest sources only. GCS sources belong to the cloud media processor.",
      now: options.now(),
    });
    return { disposition: "failed", jobId: claim.id, code: "episode-proxy-provider-unsupported" };
  }

  let partialPath = "";
  let outputPath = "";
  let createdOutput = false;
  try {
    const root = await authorizedLocalRoot(options.localMediaRoot);
    const sourcePath = await authorizedExistingPath(root, job.source.locator);
    outputPath = authorizedTargetPath(root, job.target.locator);
    partialPath = `${outputPath.slice(0, -4)}.partial-${claim.executionId.replace(/[^A-Za-z0-9_-]+/g, "-")}.mp4`;
    await mkdir(path.dirname(outputPath), { recursive: true, mode: 0o700 });

    const sourceBefore = await inspectSource(sourcePath);
    assertSource(job, sourceBefore);
    let proxy;
    let recoveredExistingOutput = false;
    const existingOutput = await stat(outputPath).catch(() => null);
    if (existingOutput) {
      if (!existingOutput.isFile() || !transcoder.inspect) {
        throw new TerminalLocalEpisodeProxyError(
          "episode-proxy-existing-output-invalid",
          "A prior proxy output exists but cannot be independently inspected.",
        );
      }
      proxy = await transcoder.inspect(outputPath);
      recoveredExistingOutput = true;
    } else {
      await rm(partialPath, { force: true });
      proxy = await transcoder.transcode(sourcePath, partialPath);
      await flushFile(partialPath);
      await rename(partialPath, outputPath);
      createdOutput = true;
    }
    const sourceAfter = await inspectSource(sourcePath);
    assertSource(job, sourceAfter);
    if (
      sourceBefore.sha256 !== sourceAfter.sha256
      || sourceBefore.sizeBytes !== sourceAfter.sizeBytes
    ) {
      throw new TerminalLocalEpisodeProxyError(
        "episode-proxy-source-drift",
        "The immutable original changed while its collaboration proxy was generated.",
      );
    }
    const receipt = newEpisodeCollaborationProxyResult({
      jobId: job.jobId,
      completedAt: options.now().toISOString(),
      source: job.source,
      output: {
        provider: "local",
        locator: outputPath,
        generation: `sha256:${proxy.sha256}`,
        sizeBytes: proxy.sizeBytes,
        sha256: proxy.sha256,
        crc32c: null,
        contentType: "video/mp4",
        profile: job.target.profile,
        metadata: proxy.technical,
      },
      worker: {
        executionId: claim.executionId,
        buildId: options.buildId,
        imageDigest: options.imageDigest,
        attempt: claim.attempt,
      },
    });
    const committed = await store.complete({ claim, receipt, now: options.now() });
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
    if (error instanceof TerminalLocalEpisodeProxyError) {
      if (createdOutput && outputPath) await rm(outputPath, { force: true }).catch(() => undefined);
      await store.fail({
        claim,
        code: error.code,
        message: error.message,
        now: options.now(),
      });
      return { disposition: "failed", jobId: job.jobId, code: error.code };
    }
    const code = error instanceof ProxyTranscodeError
      ? error.code
      : "episode-proxy-worker-retry";
    const message = errorMessage(error, "Local collaboration proxy worker needs retry.");
    if (error instanceof ProxyTranscodeError && !error.retryable) {
      await store.fail({ claim, code, message, now: options.now() });
      return { disposition: "failed", jobId: job.jobId, code };
    }
    await store.retry({ claim, code, message, now: options.now() });
    return { disposition: "retry", jobId: job.jobId, code };
  }
}

export class PostgresLocalEpisodeProxyStore implements LocalEpisodeProxyStore {
  private readonly pool: InstanceType<typeof Pool>;

  constructor(pool: InstanceType<typeof Pool>) {
    this.pool = pool;
  }

  async claim(input: { executionId: string; leaseMs: number; now: Date }) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const staleBefore = new Date(input.now.getTime() - input.leaseMs);
      const selected = await client.query({
        text: `
          SELECT "id", "inputJson", "resultJson"
          FROM "StudioWorkflowJob"
          WHERE "type" = $1
            AND "source" = $2
            AND "inputJson"->'source'->>'provider' = 'local'
            AND (
              "status" = 'queued'
              OR ("status" = 'processing' AND "updatedAt" < timezone('UTC', $3::timestamptz))
            )
          ORDER BY "priority" ASC, "createdAt" ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
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
      const lease = {
        executionId: input.executionId,
        attempt,
        claimedAt: input.now.toISOString(),
        expiresAt: new Date(input.now.getTime() + input.leaseMs).toISOString(),
      };
      const updated = await client.query({
        text: `
          UPDATE "StudioWorkflowJob"
          SET "status" = 'processing',
              "startedAt" = COALESCE("startedAt", timezone('UTC', $2::timestamptz)),
              "updatedAt" = timezone('UTC', $2::timestamptz),
              "error" = NULL,
              "resultJson" = $3::jsonb
          WHERE "id" = $1
          RETURNING "id", "inputJson"
        `,
        values: [row.id, input.now, JSON.stringify({ state: "processing", lease, originalRemainsSourceTruth: true })],
      });
      await client.query("COMMIT");
      return {
        id: updated.rows[0].id,
        inputJson: updated.rows[0].inputJson,
        attempt,
        executionId: input.executionId,
      } satisfies LocalEpisodeProxyClaim;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async complete(input: { claim: LocalEpisodeProxyClaim; receipt: EpisodeCollaborationProxyResult; now: Date }) {
    const result = await this.pool.query({
      text: `
        UPDATE "StudioWorkflowJob"
        SET "status" = 'output-ready',
            "updatedAt" = timezone('UTC', $3::timestamptz),
            "error" = NULL,
            "resultJson" = $4::jsonb
        WHERE "id" = $1
          AND "status" = 'processing'
          AND "resultJson"->'lease'->>'executionId' = $2
      `,
      values: [
        input.claim.id,
        input.claim.executionId,
        input.now,
        JSON.stringify({ state: "output-ready", receipt: input.receipt, originalRemainsSourceTruth: true }),
      ],
    });
    return result.rowCount === 1;
  }

  async retry(input: { claim: LocalEpisodeProxyClaim; code: string; message: string; now: Date }) {
    return this.release(input, "queued");
  }

  async fail(input: { claim: LocalEpisodeProxyClaim; code: string; message: string; now: Date }) {
    return this.release(input, "failed");
  }

  private async release(
    input: { claim: LocalEpisodeProxyClaim; code: string; message: string; now: Date },
    status: "queued" | "failed",
  ) {
    const result = await this.pool.query({
      text: `
        UPDATE "StudioWorkflowJob"
        SET "status" = $3,
            "updatedAt" = timezone('UTC', $4::timestamptz),
            "completedAt" = CASE WHEN $3 = 'failed' THEN timezone('UTC', $4::timestamptz) ELSE NULL END,
            "error" = $5,
            "resultJson" = $6::jsonb
        WHERE "id" = $1
          AND "status" = 'processing'
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
          originalRemainsSourceTruth: true,
        }),
      ],
    });
    return result.rowCount === 1;
  }
}

async function authorizedLocalRoot(configuredRoot: string) {
  const temporaryRoot = await realpath(tmpdir());
  const resolved = path.resolve(configuredRoot);
  await mkdir(resolved, { recursive: true, mode: 0o700 });
  const canonical = await realpath(resolved);
  if (!pathIsInside(temporaryRoot, canonical) || canonical === temporaryRoot) {
    throw new TerminalLocalEpisodeProxyError(
      "episode-proxy-root-rejected",
      "Local media worker root must be a dedicated directory below the operating-system temporary directory.",
    );
  }
  return canonical;
}

async function authorizedExistingPath(root: string, candidate: string) {
  const canonical = await realpath(candidate).catch(() => "");
  if (!canonical || !pathIsInside(root, canonical)) {
    throw new TerminalLocalEpisodeProxyError(
      "episode-proxy-source-path-rejected",
      "Local source escaped the worker's authorized ingest root.",
    );
  }
  return canonical;
}

function authorizedTargetPath(root: string, targetLocator: string) {
  const resolved = path.resolve(root, targetLocator);
  if (!pathIsInside(root, resolved) || !resolved.endsWith(".mp4")) {
    throw new TerminalLocalEpisodeProxyError(
      "episode-proxy-target-path-rejected",
      "Local proxy target escaped the worker's authorized ingest root.",
    );
  }
  return resolved;
}

async function inspectSource(sourcePath: string) {
  const fileStat = await stat(sourcePath);
  if (!fileStat.isFile() || fileStat.size <= 0) {
    throw new TerminalLocalEpisodeProxyError(
      "episode-proxy-source-unavailable",
      "Local proxy source is empty or unavailable.",
    );
  }
  return { sizeBytes: fileStat.size, sha256: await sha256File(sourcePath) };
}

function assertSource(
  job: EpisodeCollaborationProxyJob,
  evidence: { sizeBytes: number; sha256: string },
) {
  if (
    evidence.sizeBytes !== job.source.sizeBytes
    || evidence.sha256 !== job.source.sha256
    || job.source.generation !== `sha256:${evidence.sha256}`
  ) {
    throw new TerminalLocalEpisodeProxyError(
      "episode-proxy-source-byte-mismatch",
      "Local source no longer matches the queued immutable byte receipt.",
    );
  }
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function loopbackDatabaseUrl(value: string) {
  const parsed = new URL(value);
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:")
    || !["127.0.0.1", "localhost", "::1"].includes(hostname)
  ) {
    throw new Error("Local episode proxy worker requires a loopback PostgreSQL DATABASE_URL.");
  }
  return value;
}

async function main() {
  const databaseUrl = loopbackDatabaseUrl(String(process.env.DATABASE_URL || ""));
  const localMediaRoot = path.resolve(
    process.env.QUIPSLY_LOCAL_MEDIA_UPLOAD_ROOT
      || path.join(tmpdir(), "quipsly-media-ingest"),
  );
  const once = process.argv.includes("--once");
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  const store = new PostgresLocalEpisodeProxyStore(pool);
  const transcoder = new FfmpegCaptureProxyTranscoder();
  const executionId = randomUUID();
  const options: LocalEpisodeProxyWorkerOptions = {
    executionId,
    buildId: process.env.QUIPSLY_LOCAL_MEDIA_WORKER_BUILD_ID?.trim() || "local-development",
    imageDigest: null,
    leaseMs: Number(process.env.QUIPSLY_LOCAL_MEDIA_WORKER_LEASE_MS) || DEFAULT_LEASE_MS,
    localMediaRoot,
    now: () => new Date(),
  };
  const audioMastery = newLocalAudioMasteryRuntime({
    pool,
    localMediaRoot,
    leaseMs: options.leaseMs,
    buildId: options.buildId,
  });
  const audioDelivery = newLocalAudioDeliveryRuntime({
    pool,
    localMediaRoot,
    leaseMs: options.leaseMs,
    buildId: options.buildId,
  });
  const audioTreatment = newLocalAudioTreatmentRuntime({
    pool,
    localMediaRoot,
    leaseMs: options.leaseMs,
    buildId: options.buildId,
  });
  const dialogueRepair = newLocalDialogueRepairRuntime({
    pool,
    localMediaRoot,
    leaseMs: options.leaseMs,
    buildId: options.buildId,
  });
  const audioSignalProfile = newLocalAudioSignalProfileRuntime({
    pool,
    localMediaRoot,
    leaseMs: options.leaseMs,
    buildId: options.buildId,
  });
  const audioSpectral = newLocalAudioSpectralRuntime({
    pool,
    localMediaRoot,
    leaseMs: options.leaseMs,
    buildId: options.buildId,
  });
  const studioTranscript = newLocalStudioTranscriptRuntime({
    pool,
    localMediaRoot,
    leaseMs: options.leaseMs,
    buildId: options.buildId,
    executable: process.env.QUIPSLY_LOCAL_WHISPER_EXECUTABLE?.trim() || "/opt/homebrew/Caskroom/miniconda/base/bin/whisper",
    device: process.env.QUIPSLY_LOCAL_WHISPER_DEVICE?.trim() || "cpu",
  });
  const audioAlignment = newLocalAudioAlignmentRuntime({
    pool,
    localMediaRoot,
    leaseMs: options.leaseMs,
    buildId: options.buildId,
  });
  const audioPairCorrelation = newLocalAudioPairCorrelationRuntime({
    pool,
    localMediaRoot,
    leaseMs: options.leaseMs,
    buildId: options.buildId,
  });
  const episodeAudioMix = newLocalEpisodeAudioMixRuntime({
    pool,
    localMediaRoot,
    leaseMs: options.leaseMs,
    buildId: options.buildId,
  });
  const episodeRenderProof = newLocalEpisodeRenderProofRuntime({
    pool,
    executionId,
    localMediaRoot,
    leaseMs: options.leaseMs,
    buildId: options.buildId,
  });
  const spatialVaultRoot = path.resolve(process.env.QUIPSLY_LOCAL_SPATIAL_VAULT_ROOT || path.join(homedir(), "Movies", "Quipsly Media Vault"));
  const spatialReframe = newLocalSpatialReframeRuntime({
    pool,
    executionId,
    outputRoot: spatialVaultRoot,
    authorizedSourceRoots: [localMediaRoot, spatialVaultRoot],
    leaseMs: options.leaseMs,
    buildId: options.buildId,
  });
  const presence = new LocalExecutionPresence(pool, {
    executionId,
    buildId: options.buildId,
  });
  const externalSourceProxy = newLocalExternalSourceProxyRuntime({
    pool,
    executionId,
    localMediaRoot,
    leaseMs: options.leaseMs,
    buildId: options.buildId,
  });
  let stopping = false;
  process.once("SIGTERM", () => { stopping = true; });
  process.once("SIGINT", () => { stopping = true; });
  try {
    await presence.heartbeat(new Date(), true);
    do {
      await presence.heartbeat();
      const externalProxyResult = await runOneLocalExternalSourceProxyJob(
        externalSourceProxy.store,
        externalSourceProxy.transcoder,
        externalSourceProxy.options,
      );
      const proxyResult = externalProxyResult.disposition === "idle"
        ? await runOneLocalEpisodeProxyJob(store, transcoder, options)
        : externalProxyResult;
      const masteryResult = proxyResult.disposition === "idle"
        ? await runOneLocalAudioMasteryJob(audioMastery.store, audioMastery.engine, audioMastery.options)
        : proxyResult;
      const deliveryResult = masteryResult.disposition === "idle"
        ? await runOneLocalAudioDeliveryJob(audioDelivery.store, audioDelivery.encoder, audioDelivery.measurer, audioDelivery.options)
        : masteryResult;
      const treatmentResult = deliveryResult.disposition === "idle"
        ? await runOneLocalAudioTreatmentJob(audioTreatment.store, audioTreatment.engine, audioTreatment.options)
        : deliveryResult;
      const dialogueRepairResult = treatmentResult.disposition === "idle"
        ? await runOneLocalDialogueRepairJob(dialogueRepair.store, dialogueRepair.engine, dialogueRepair.options)
        : treatmentResult;
      const signalResult = dialogueRepairResult.disposition === "idle"
        ? await runOneLocalAudioSignalProfileJob(audioSignalProfile.store, audioSignalProfile.profiler, audioSignalProfile.options)
        : dialogueRepairResult;
      const spectralResult = signalResult.disposition === "idle"
        ? await runOneLocalAudioSpectralEvidenceJob(audioSpectral.store, audioSpectral.analyzer, audioSpectral.options)
        : signalResult;
      const transcriptResult = spectralResult.disposition === "idle"
        ? await runOneLocalStudioTranscriptJob(studioTranscript.store, studioTranscript.transcriber, studioTranscript.options)
        : spectralResult;
      const alignmentResult = transcriptResult.disposition === "idle"
        ? await runOneLocalAudioAlignmentJob(audioAlignment.store, audioAlignment.analyzer, audioAlignment.options)
        : transcriptResult;
      const pairResult = alignmentResult.disposition === "idle"
        ? await runOneLocalAudioPairCorrelationJob(audioPairCorrelation.store, audioPairCorrelation.analyzer, audioPairCorrelation.options)
        : alignmentResult;
      const mixResult = pairResult.disposition === "idle"
        ? await runOneLocalEpisodeAudioMixJob(episodeAudioMix.store, episodeAudioMix.renderer, episodeAudioMix.mastery, episodeAudioMix.options)
        : pairResult;
      const episodeProofResult = mixResult.disposition === "idle"
        ? await runOneLocalEpisodeRenderProofJob(episodeRenderProof.store, episodeRenderProof.renderer, episodeRenderProof.options)
        : mixResult;
      const result = episodeProofResult.disposition === "idle"
        ? await runOneLocalSpatialReframeJob(spatialReframe.store, spatialReframe.renderer, spatialReframe.options)
        : episodeProofResult;
      if (result.disposition !== "idle") {
        process.stdout.write(`${JSON.stringify({ at: new Date().toISOString(), ...result })}\n`);
      }
      if (once) break;
      if (result.disposition === "idle") {
        await new Promise((resolve) => setTimeout(resolve, Number(process.env.QUIPSLY_LOCAL_MEDIA_WORKER_POLL_MS) || DEFAULT_POLL_MS));
      }
    } while (!stopping);
  } finally {
    await presence.offline().catch(() => undefined);
    await pool.end();
  }
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error("[local episode proxy worker] failed", error);
    process.exitCode = 1;
  });
}
