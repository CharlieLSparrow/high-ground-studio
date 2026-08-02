import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  EPISODE_COLLABORATION_PROXY_CLOUD_QUEUE_PREFIX,
  buildEpisodeCollaborationProxyCloudDeadLetterObjectName,
  buildEpisodeCollaborationProxyCloudManifestObjectName,
  buildEpisodeCollaborationProxyCloudQueueObjectName,
  buildEpisodeCollaborationProxyCloudResultObjectName,
  claimEpisodeCollaborationProxyCloudManifest,
  completeEpisodeCollaborationProxyCloudManifest,
  failEpisodeCollaborationProxyCloudManifest,
  newEpisodeCollaborationProxyResult,
  normalizeCaptureProxyJobId,
  parseEpisodeCollaborationProxyCloudManifest,
  parseEpisodeCollaborationProxyCloudQueueReceipt,
  parseEpisodeCollaborationProxyResult,
  releaseEpisodeCollaborationProxyCloudLease,
  type CaptureProxyTechnicalEvidence,
  type EpisodeCollaborationProxyCloudManifest,
  type EpisodeCollaborationProxyResult,
} from "@high-ground/quipsly-media-processing";

import {
  type CaptureProxyWorkerOptions,
  type CaptureProxyWorkerStorage,
  type ObjectEvidence,
  type QueueObject,
  type StoredJson,
} from "./worker.js";
import {
  ProxyTranscodeError,
  type CaptureProxyTranscoder,
} from "./transcoder.js";

export type EpisodeCloudProxyWorkerResult =
  | { disposition: "completed"; jobId: string; outputGeneration: string }
  | { disposition: "already-complete"; jobId: string }
  | { disposition: "terminal"; jobId: string; code: string }
  | { disposition: "busy"; jobId: string }
  | { disposition: "claim-lost"; jobId: string };

class TerminalEpisodeCloudProxyError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "TerminalEpisodeCloudProxyError";
    this.code = code;
  }
}

export async function runEpisodeCloudProxyWorker(
  storage: CaptureProxyWorkerStorage,
  transcoder: CaptureProxyTranscoder,
  options: CaptureProxyWorkerOptions,
  limit: number,
) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) {
    throw new Error("Episode collaboration proxy worker limit must be between 1 and 20.");
  }
  const queueObjects = await storage.listQueueObjectsUnder(
    `${EPISODE_COLLABORATION_PROXY_CLOUD_QUEUE_PREFIX}/`,
    limit,
  );
  const results: EpisodeCloudProxyWorkerResult[] = [];
  const transientFailures: Error[] = [];
  for (const queueObject of queueObjects) {
    try {
      results.push(await processEpisodeCloudProxyQueueObject(
        storage,
        transcoder,
        options,
        queueObject,
      ));
    } catch (error) {
      transientFailures.push(
        error instanceof Error
          ? error
          : new Error("Unknown episode collaboration proxy failure."),
      );
    }
  }
  if (transientFailures.length > 0) {
    throw new AggregateError(
      transientFailures,
      `${transientFailures.length} episode collaboration proxy job(s) need retry.`,
    );
  }
  return results;
}

export async function processEpisodeCloudProxyQueueObject(
  storage: CaptureProxyWorkerStorage,
  transcoder: CaptureProxyTranscoder,
  options: CaptureProxyWorkerOptions,
  queueObject: QueueObject,
): Promise<EpisodeCloudProxyWorkerResult> {
  let receipt;
  try {
    const storedQueue = await storage.loadJson(queueObject.name, queueObject.generation);
    receipt = parseEpisodeCollaborationProxyCloudQueueReceipt(storedQueue.value);
  } catch (error) {
    return quarantineQueue(
      storage,
      queueObject,
      quarantineJobId(queueObject.name),
      "episode-proxy-queue-invalid",
      errorMessage(error, "Episode proxy queue receipt is invalid."),
      options.now(),
    );
  }
  if (queueObject.name !== buildEpisodeCollaborationProxyCloudQueueObjectName(receipt.jobId)) {
    return quarantineQueue(
      storage,
      queueObject,
      receipt.jobId,
      "episode-proxy-queue-path-mismatch",
      "Episode proxy queue object path does not match its job.",
      options.now(),
    );
  }

  let storedManifest: StoredJson;
  let manifest: EpisodeCollaborationProxyCloudManifest;
  try {
    storedManifest = await storage.loadJson(receipt.manifestObjectName);
    manifest = parseEpisodeCollaborationProxyCloudManifest(
      storedManifest.value,
      receipt.jobId,
    );
    if (
      manifest.status === "queued"
      && storedManifest.generation !== receipt.manifestGeneration
    ) {
      throw new Error("Queued episode proxy manifest generation no longer matches its receipt.");
    }
  } catch (error) {
    return quarantineQueue(
      storage,
      queueObject,
      receipt.jobId,
      "episode-proxy-manifest-invalid",
      errorMessage(error, "Episode proxy manifest is invalid."),
      options.now(),
    );
  }

  if (manifest.status === "completed") {
    const result = await storage.loadJson(
      buildEpisodeCollaborationProxyCloudResultObjectName(manifest.job.jobId),
    );
    parseEpisodeCollaborationProxyResult(result.value, manifest.job);
    await storage.deleteObject(queueObject.name, queueObject.generation);
    return { disposition: "already-complete", jobId: manifest.job.jobId };
  }
  if (manifest.status === "failed-terminal") {
    await deadLetterAndDelete(storage, queueObject, manifest);
    return {
      disposition: "terminal",
      jobId: manifest.job.jobId,
      code: manifest.failure!.code,
    };
  }

  const leaseId = randomUUID();
  const claimed = claimEpisodeCollaborationProxyCloudManifest({
    manifest,
    leaseId,
    executionId: options.executionId,
    now: options.now(),
    leaseDurationMs: options.leaseDurationMs,
  });
  if (!claimed) return { disposition: "busy", jobId: manifest.job.jobId };
  try {
    storedManifest = await storage.saveJson(
      receipt.manifestObjectName,
      claimed,
      storedManifest.generation,
    );
    manifest = parseEpisodeCollaborationProxyCloudManifest(
      storedManifest.value,
      receipt.jobId,
    );
  } catch (error) {
    if (isPreconditionFailure(error)) {
      return { disposition: "claim-lost", jobId: manifest.job.jobId };
    }
    throw error;
  }

  const scratch = await mkdtemp(join(tmpdir(), "quipsly-episode-cloud-proxy-"));
  try {
    const sourceLocation = parseGenerationBoundGcsLocator(
      manifest.job.source.locator,
      manifest.job.source.generation,
    );
    const inputPath = join(scratch, "source");
    const outputPath = join(scratch, "proxy.mp4");
    assertSourceEvidence(
      manifest,
      await storage.objectEvidence(
        sourceLocation.objectName,
        sourceLocation.generation,
      ),
      sourceLocation.bucketName,
    );
    const materialized = await storage.materializeObject(
      sourceLocation.objectName,
      sourceLocation.generation,
      inputPath,
    );
    if (
      materialized.sizeBytes !== manifest.job.source.sizeBytes
      || materialized.sha256 !== manifest.job.source.sha256
    ) {
      throw new TerminalEpisodeCloudProxyError(
        "episode-proxy-source-byte-mismatch",
        "Materialized episode source does not match its immutable generation receipt.",
      );
    }

    let transcoded;
    try {
      transcoded = await transcoder.transcode(inputPath, outputPath);
    } catch (error) {
      if (error instanceof ProxyTranscodeError && !error.retryable) {
        throw new TerminalEpisodeCloudProxyError(error.code, error.message);
      }
      throw error;
    }
    const customMetadata = outputMetadata(manifest, transcoded.technical, {
      sizeBytes: transcoded.sizeBytes,
      sha256: transcoded.sha256,
    });
    const outputEvidence = await storage.uploadProxy(
      outputPath,
      manifest.job.target.locator,
      manifest.job.target.contentType,
      customMetadata,
    );
    const storedOutput = assertOutputEvidence(
      manifest,
      outputEvidence,
      sourceLocation.bucketName,
    );
    const result = newEpisodeCollaborationProxyResult({
      jobId: manifest.job.jobId,
      completedAt: options.now().toISOString(),
      source: manifest.job.source,
      output: {
        provider: "gcs",
        locator: gcsLocator(
          outputEvidence.bucketName,
          outputEvidence.objectName,
          outputEvidence.generation,
        ),
        generation: outputEvidence.generation,
        sizeBytes: outputEvidence.sizeBytes,
        sha256: storedOutput.sha256,
        crc32c: outputEvidence.crc32c,
        contentType: "video/mp4",
        profile: manifest.job.target.profile,
        metadata: storedOutput.technical,
      },
      worker: {
        executionId: options.executionId,
        buildId: options.buildId,
        imageDigest: options.imageDigest,
        attempt: manifest.lease!.attempt,
      },
    });
    const storedResult = await storage.saveJsonIfAbsent(
      buildEpisodeCollaborationProxyCloudResultObjectName(manifest.job.jobId),
      result,
    );
    const canonicalResult = parseEpisodeCollaborationProxyResult(
      storedResult.value,
      manifest.job,
    );
    const latest = await storage.loadJson(receipt.manifestObjectName);
    const latestManifest = parseEpisodeCollaborationProxyCloudManifest(
      latest.value,
      manifest.job.jobId,
    );
    const completed = completeEpisodeCollaborationProxyCloudManifest({
      manifest: latestManifest,
      leaseId,
      result: canonicalResult,
      now: options.now(),
    });
    await storage.saveJson(
      receipt.manifestObjectName,
      completed,
      latest.generation,
    );
    await storage.deleteObject(queueObject.name, queueObject.generation);
    return {
      disposition: "completed",
      jobId: manifest.job.jobId,
      outputGeneration: canonicalResult.output.generation,
    };
  } catch (error) {
    if (error instanceof TerminalEpisodeCloudProxyError) {
      const terminal = await commitTerminalFailure(
        storage,
        receipt.manifestObjectName,
        manifest.job.jobId,
        leaseId,
        error,
        options.now(),
      );
      await deadLetterAndDelete(storage, queueObject, terminal);
      return {
        disposition: "terminal",
        jobId: manifest.job.jobId,
        code: error.code,
      };
    }
    await releaseTransientLease(
      storage,
      receipt.manifestObjectName,
      manifest.job.jobId,
      leaseId,
      options.now(),
    );
    throw error;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

async function commitTerminalFailure(
  storage: CaptureProxyWorkerStorage,
  manifestObjectName: string,
  jobId: string,
  leaseId: string,
  error: TerminalEpisodeCloudProxyError,
  now: Date,
) {
  const latest = await storage.loadJson(manifestObjectName);
  const manifest = parseEpisodeCollaborationProxyCloudManifest(latest.value, jobId);
  const failed = failEpisodeCollaborationProxyCloudManifest({
    manifest,
    leaseId,
    code: error.code,
    message: error.message,
    now,
  });
  const stored = await storage.saveJson(
    manifestObjectName,
    failed,
    latest.generation,
  );
  return parseEpisodeCollaborationProxyCloudManifest(stored.value, jobId);
}

async function releaseTransientLease(
  storage: CaptureProxyWorkerStorage,
  manifestObjectName: string,
  jobId: string,
  leaseId: string,
  now: Date,
) {
  try {
    const latest = await storage.loadJson(manifestObjectName);
    const manifest = parseEpisodeCollaborationProxyCloudManifest(latest.value, jobId);
    if (manifest.status !== "processing" || manifest.lease?.id !== leaseId) return;
    await storage.saveJson(
      manifestObjectName,
      releaseEpisodeCollaborationProxyCloudLease({ manifest, leaseId, now }),
      latest.generation,
    );
  } catch {
    // Another generation owns the retry decision after a lost claim.
  }
}

async function quarantineQueue(
  storage: CaptureProxyWorkerStorage,
  queueObject: QueueObject,
  jobId: string,
  code: string,
  message: string,
  now: Date,
): Promise<EpisodeCloudProxyWorkerResult> {
  await storage.writeDeadLetter(
    buildEpisodeCollaborationProxyCloudDeadLetterObjectName(jobId),
    {
      kind: "quipsly-episode-collaboration-proxy-cloud-dead-letter-v1",
      version: 1,
      jobId,
      code,
      message,
      failedAt: now.toISOString(),
    },
    queueObject.generation,
  );
  await storage.deleteObject(queueObject.name, queueObject.generation);
  return { disposition: "terminal", jobId, code };
}

async function deadLetterAndDelete(
  storage: CaptureProxyWorkerStorage,
  queueObject: QueueObject,
  manifest: EpisodeCollaborationProxyCloudManifest,
) {
  await storage.writeDeadLetter(
    buildEpisodeCollaborationProxyCloudDeadLetterObjectName(manifest.job.jobId),
    {
      kind: "quipsly-episode-collaboration-proxy-cloud-dead-letter-v1",
      version: 1,
      jobId: manifest.job.jobId,
      manifestObjectName: buildEpisodeCollaborationProxyCloudManifestObjectName(
        manifest.job.jobId,
      ),
      failure: manifest.failure,
    },
    queueObject.generation,
  );
  await storage.deleteObject(queueObject.name, queueObject.generation);
}

function assertSourceEvidence(
  manifest: EpisodeCollaborationProxyCloudManifest,
  evidence: ObjectEvidence | null,
  bucketName: string,
) {
  if (
    !evidence
    || evidence.bucketName !== bucketName
    || evidence.generation !== manifest.job.source.generation
    || evidence.sizeBytes !== manifest.job.source.sizeBytes
    || evidence.contentType !== manifest.job.source.contentType
  ) {
    throw new TerminalEpisodeCloudProxyError(
      "episode-proxy-source-generation-mismatch",
      "Episode source object evidence no longer matches its immutable binding.",
    );
  }
}

function outputMetadata(
  manifest: EpisodeCollaborationProxyCloudManifest,
  technical: CaptureProxyTechnicalEvidence,
  output: { sizeBytes: number; sha256: string },
) {
  return {
    quipslyKind: "episode-collaboration-proxy-v1",
    quipslyProxyJobId: manifest.job.jobId,
    quipslyProjectId: manifest.job.projectId,
    quipslyEpisodeProductionId: manifest.job.episodeProductionId,
    quipslyRawAssetId: manifest.job.source.rawAssetId,
    quipslySourceId: manifest.job.source.sourceId,
    quipslySourceLocator: manifest.job.source.locator,
    quipslySourceGeneration: manifest.job.source.generation,
    quipslySourceSha256: manifest.job.source.sha256,
    quipslyOutputSha256: output.sha256,
    quipslyOutputSizeBytes: String(output.sizeBytes),
    quipslyProfile: manifest.job.target.profile,
    quipslyDurationSeconds: String(technical.durationSeconds),
    quipslyWidth: String(technical.width),
    quipslyHeight: String(technical.height),
    quipslyFps: String(technical.fps),
    quipslyHasAudio: String(technical.hasAudio),
    quipslyVideoCodec: technical.videoCodec,
    quipslyAudioCodec: technical.audioCodec ?? "none",
    quipslyPixelFormat: technical.pixelFormat,
    quipslyFastStart: String(technical.fastStart),
    quipslyOriginalRemainsSourceTruth: "true",
  };
}

function assertOutputEvidence(
  manifest: EpisodeCollaborationProxyCloudManifest,
  evidence: ObjectEvidence,
  bucketName: string,
) {
  const metadata = evidence.customMetadata;
  const outputSizeBytes = positiveInteger(metadata.quipslyOutputSizeBytes);
  const outputSha256 = metadata.quipslyOutputSha256 ?? "";
  const technical = technicalEvidenceFromMetadata(metadata);
  if (
    evidence.bucketName !== bucketName
    || evidence.objectName !== manifest.job.target.locator
    || evidence.contentType !== manifest.job.target.contentType
    || evidence.sizeBytes !== outputSizeBytes
    || !evidence.crc32c
    || metadata.quipslyKind !== "episode-collaboration-proxy-v1"
    || metadata.quipslyProxyJobId !== manifest.job.jobId
    || metadata.quipslyProjectId !== manifest.job.projectId
    || metadata.quipslyEpisodeProductionId !== manifest.job.episodeProductionId
    || metadata.quipslyRawAssetId !== manifest.job.source.rawAssetId
    || metadata.quipslySourceId !== manifest.job.source.sourceId
    || metadata.quipslySourceLocator !== manifest.job.source.locator
    || metadata.quipslySourceGeneration !== manifest.job.source.generation
    || metadata.quipslySourceSha256 !== manifest.job.source.sha256
    || metadata.quipslyProfile !== manifest.job.target.profile
    || metadata.quipslyOriginalRemainsSourceTruth !== "true"
    || !/^[0-9a-f]{64}$/.test(outputSha256)
  ) {
    throw new TerminalEpisodeCloudProxyError(
      "episode-proxy-output-verification-failed",
      "Stored episode proxy does not match its immutable source and output evidence.",
    );
  }
  return { sha256: outputSha256, technical };
}

function technicalEvidenceFromMetadata(
  metadata: Record<string, string>,
): CaptureProxyTechnicalEvidence {
  const hasAudio = metadata.quipslyHasAudio === "true";
  const audioCodec = metadata.quipslyAudioCodec;
  if (
    !["true", "false"].includes(metadata.quipslyHasAudio ?? "")
    || metadata.quipslyVideoCodec !== "h264"
    || !["aac", "none"].includes(audioCodec ?? "")
    || (hasAudio ? audioCodec !== "aac" : audioCodec !== "none")
    || metadata.quipslyPixelFormat !== "yuv420p"
    || metadata.quipslyFastStart !== "true"
  ) {
    throw new TerminalEpisodeCloudProxyError(
      "episode-proxy-output-metadata-invalid",
      "Stored episode proxy technical metadata is invalid.",
    );
  }
  return {
    durationSeconds: positiveNumber(metadata.quipslyDurationSeconds),
    width: positiveInteger(metadata.quipslyWidth),
    height: positiveInteger(metadata.quipslyHeight),
    fps: positiveNumber(metadata.quipslyFps),
    hasAudio,
    videoCodec: "h264",
    audioCodec: hasAudio ? "aac" : null,
    pixelFormat: "yuv420p",
    fastStart: true,
  };
}

function parseGenerationBoundGcsLocator(locator: string, expectedGeneration: string) {
  const match = /^gcs:\/\/([a-z0-9][a-z0-9._-]{1,221}[a-z0-9])\/(.+)\?generation=([1-9][0-9]*)$/.exec(locator);
  if (
    !match
    || match[3] !== expectedGeneration
    || !match[2].startsWith("media-vault/")
    || match[2].split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new TerminalEpisodeCloudProxyError(
      "episode-proxy-source-locator-invalid",
      "Episode source must name one generation-bound object in the media vault.",
    );
  }
  return { bucketName: match[1], objectName: match[2], generation: match[3] };
}

function gcsLocator(bucketName: string, objectName: string, generation: string) {
  return `gcs://${bucketName}/${objectName}?generation=${generation}`;
}

function quarantineJobId(objectName: string) {
  const pathId = objectName.startsWith(`${EPISODE_COLLABORATION_PROXY_CLOUD_QUEUE_PREFIX}/`)
    ? objectName.slice(EPISODE_COLLABORATION_PROXY_CLOUD_QUEUE_PREFIX.length + 1).replace(/\.json$/, "")
    : "";
  return normalizeCaptureProxyJobId(pathId)
    || `invalid-${createHash("sha256").update(objectName).digest("hex").slice(0, 24)}`;
}

function positiveNumber(value: string | undefined) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new TerminalEpisodeCloudProxyError(
      "episode-proxy-output-metadata-invalid",
      "Episode proxy technical value must be positive.",
    );
  }
  return parsed;
}

function positiveInteger(value: string | undefined) {
  const parsed = positiveNumber(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new TerminalEpisodeCloudProxyError(
      "episode-proxy-output-metadata-invalid",
      "Episode proxy technical value must be a safe integer.",
    );
  }
  return parsed;
}

function isPreconditionFailure(error: unknown) {
  const row = error as { code?: unknown; status?: unknown };
  const code = Number(row?.code ?? row?.status);
  return code === 409 || code === 412;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}
