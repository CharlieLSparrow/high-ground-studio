import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CAPTURE_PROXY_QUEUE_PREFIX,
  buildCaptureProxyDeadLetterObjectName,
  buildCaptureProxyManifestObjectName,
  buildCaptureProxyQueueObjectName,
  buildCaptureProxyResultObjectName,
  claimCaptureProxyManifest,
  completeCaptureProxyManifest,
  failCaptureProxyManifest,
  parseCaptureProxyManifest,
  parseCaptureProxyQueueReceipt,
  parseCaptureProxyResult,
  releaseCaptureProxyLease,
  normalizeCaptureProxyJobId,
  type CaptureProxyManifest,
  type CaptureProxyResult,
  type CaptureProxyTechnicalEvidence,
} from "@high-ground/quipsly-media-processing";

import type {
  CaptureProxyTranscoder,
} from "./transcoder.js";

export type StoredJson = {
  value: unknown;
  generation: string;
};

export type QueueObject = {
  name: string;
  generation: string;
};

export type ObjectEvidence = {
  bucketName: string;
  objectName: string;
  generation: string;
  sizeBytes: number;
  contentType: string;
  crc32c: string | null;
  customMetadata: Record<string, string>;
};

export interface CaptureProxyWorkerStorage {
  listQueueObjects(limit: number): Promise<QueueObject[]>;
  loadJson(objectName: string, generation?: string): Promise<StoredJson>;
  saveJson(
    objectName: string,
    value: unknown,
    ifGenerationMatch: string,
  ): Promise<StoredJson>;
  saveJsonIfAbsent(objectName: string, value: unknown): Promise<StoredJson>;
  objectEvidence(
    objectName: string,
    generation: string,
  ): Promise<ObjectEvidence | null>;
  materializeObject(
    objectName: string,
    generation: string,
    destinationPath: string,
  ): Promise<{ sizeBytes: number; sha256: string }>;
  uploadProxy(
    sourcePath: string,
    objectName: string,
    contentType: string,
    customMetadata: Record<string, string>,
  ): Promise<ObjectEvidence>;
  deleteObject(
    objectName: string,
    ifGenerationMatch: string,
  ): Promise<void>;
  writeDeadLetter(
    objectName: string,
    value: unknown,
    sourceQueueGeneration: string,
  ): Promise<void>;
}

export type CaptureProxyWorkerOptions = {
  executionId: string;
  buildId: string;
  imageDigest: string | null;
  leaseDurationMs: number;
  now: () => Date;
};

export type CaptureProxyWorkerResult =
  | { disposition: "completed"; jobId: string; outputGeneration: string }
  | { disposition: "already-complete"; jobId: string }
  | { disposition: "terminal"; jobId: string; code: string }
  | { disposition: "busy"; jobId: string }
  | { disposition: "claim-lost"; jobId: string };

class TerminalProxyError extends Error {
  readonly code: string;

  constructor(
    code: string,
    message: string,
  ) {
    super(message);
    this.name = "TerminalProxyError";
    this.code = code;
  }
}

export async function runCaptureProxyWorker(
  storage: CaptureProxyWorkerStorage,
  transcoder: CaptureProxyTranscoder,
  options: CaptureProxyWorkerOptions,
  limit: number,
) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) {
    throw new Error("Capture proxy worker limit must be between 1 and 20.");
  }
  const queueObjects = await storage.listQueueObjects(limit);
  const results: CaptureProxyWorkerResult[] = [];
  const transientFailures: Error[] = [];
  for (const queueObject of queueObjects) {
    try {
      results.push(
        await processCaptureProxyQueueObject(
          storage,
          transcoder,
          options,
          queueObject,
        ),
      );
    } catch (error) {
      transientFailures.push(
        error instanceof Error
          ? error
          : new Error("Unknown capture proxy worker failure."),
      );
    }
  }
  if (transientFailures.length > 0) {
    throw new AggregateError(
      transientFailures,
      `${transientFailures.length} capture proxy job(s) need retry.`,
    );
  }
  return results;
}

export async function processCaptureProxyQueueObject(
  storage: CaptureProxyWorkerStorage,
  transcoder: CaptureProxyTranscoder,
  options: CaptureProxyWorkerOptions,
  queueObject: QueueObject,
): Promise<CaptureProxyWorkerResult> {
  let receipt;
  try {
    const storedQueue = await storage.loadJson(
      queueObject.name,
      queueObject.generation,
    );
    receipt = parseCaptureProxyQueueReceipt(storedQueue.value);
  } catch (error) {
    const pathJobId = queueObject.name.startsWith(captureProxyQueuePrefix())
      ? queueObject.name
          .slice(captureProxyQueuePrefix().length)
          .replace(/\.json$/, "")
      : "";
    const quarantineId = normalizeCaptureProxyJobId(pathJobId)
      || `invalid-${createHash("sha256")
        .update(queueObject.name)
        .digest("hex")
        .slice(0, 24)}`;
    return quarantineQueue(
      storage,
      queueObject,
      quarantineId,
      "queue-receipt-invalid",
      error instanceof Error ? error.message : "Invalid queue receipt.",
      options.now(),
    );
  }
  if (queueObject.name !== buildCaptureProxyQueueObjectName(receipt.jobId)) {
    return quarantineQueue(
      storage,
      queueObject,
      receipt.jobId,
      "queue-path-mismatch",
      "Queue object path does not match the proxy job.",
      options.now(),
    );
  }

  let storedManifest: StoredJson;
  let manifest: CaptureProxyManifest;
  try {
    storedManifest = await storage.loadJson(receipt.manifestObjectName);
    manifest = parseCaptureProxyManifest(
      storedManifest.value,
      receipt.jobId,
    );
    if (
      manifest.status === "queued"
      && storedManifest.generation !== receipt.manifestGeneration
    ) {
      throw new Error(
        "Queued proxy manifest generation no longer matches its receipt.",
      );
    }
  } catch (error) {
    return quarantineQueue(
      storage,
      queueObject,
      receipt.jobId,
      "manifest-invalid",
      error instanceof Error ? error.message : "Invalid proxy manifest.",
      options.now(),
    );
  }

  if (manifest.status === "completed") {
    const result = await storage.loadJson(
      buildCaptureProxyResultObjectName(manifest.jobId),
    );
    parseCaptureProxyResult(result.value, manifest);
    await storage.deleteObject(queueObject.name, queueObject.generation);
    return { disposition: "already-complete", jobId: manifest.jobId };
  }
  if (manifest.status === "failed-terminal") {
    await deadLetterAndDelete(storage, queueObject, manifest);
    return {
      disposition: "terminal",
      jobId: manifest.jobId,
      code: manifest.failure!.code,
    };
  }

  const leaseId = randomUUID();
  const claimed = claimCaptureProxyManifest({
    manifest,
    leaseId,
    executionId: options.executionId,
    now: options.now(),
    leaseDurationMs: options.leaseDurationMs,
  });
  if (!claimed) {
    return { disposition: "busy", jobId: manifest.jobId };
  }
  try {
    storedManifest = await storage.saveJson(
      receipt.manifestObjectName,
      claimed,
      storedManifest.generation,
    );
    manifest = parseCaptureProxyManifest(
      storedManifest.value,
      receipt.jobId,
    );
  } catch (error) {
    if (isPreconditionFailure(error)) {
      return { disposition: "claim-lost", jobId: manifest.jobId };
    }
    throw error;
  }

  const scratch = await mkdtemp(join(tmpdir(), "quipsly-proxy-"));
  try {
    const inputPath = join(scratch, "source");
    const outputPath = join(scratch, "proxy.mp4");
    assertSourceEvidence(
      manifest,
      await storage.objectEvidence(
        manifest.source.objectName,
        manifest.source.generation,
      ),
    );
    const materialized = await storage.materializeObject(
      manifest.source.objectName,
      manifest.source.generation,
      inputPath,
    );
    if (
      materialized.sizeBytes !== manifest.source.sizeBytes
      || materialized.sha256 !== manifest.source.sha256
    ) {
      throw new TerminalProxyError(
        "source-byte-mismatch",
        "Materialized source does not match the verified original generation.",
      );
    }

    let transcoded;
    try {
      transcoded = await transcoder.transcode(inputPath, outputPath);
    } catch (error) {
      if (isProxyTranscodeError(error) && !error.retryable) {
        throw new TerminalProxyError(error.code, error.message);
      }
      throw error;
    }
    const customMetadata = outputMetadata(manifest, transcoded.technical, {
      sizeBytes: transcoded.sizeBytes,
      sha256: transcoded.sha256,
    });
    const outputEvidence = await storage.uploadProxy(
      outputPath,
      manifest.target.objectName,
      manifest.target.contentType,
      customMetadata,
    );
    const storedOutput = assertOutputEvidence(manifest, outputEvidence);
    const result = resultFor({
      manifest,
      outputEvidence,
      technical: storedOutput.technical,
      sha256: storedOutput.sha256,
      options,
    });
    const storedResult = await storage.saveJsonIfAbsent(
      buildCaptureProxyResultObjectName(manifest.jobId),
      result,
    );
    const canonicalResult = parseCaptureProxyResult(
      storedResult.value,
      manifest,
    );
    const latest = await storage.loadJson(receipt.manifestObjectName);
    const latestManifest = parseCaptureProxyManifest(
      latest.value,
      manifest.jobId,
    );
    const completed = completeCaptureProxyManifest({
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
      jobId: manifest.jobId,
      outputGeneration: canonicalResult.output.generation,
    };
  } catch (error) {
    if (error instanceof TerminalProxyError) {
      const terminal = await commitTerminalFailure(
        storage,
        receipt.manifestObjectName,
        manifest.jobId,
        leaseId,
        error,
        options.now(),
      );
      await deadLetterAndDelete(storage, queueObject, terminal);
      return {
        disposition: "terminal",
        jobId: manifest.jobId,
        code: error.code,
      };
    }
    await releaseTransientLease(
      storage,
      receipt.manifestObjectName,
      manifest.jobId,
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
  error: TerminalProxyError,
  now: Date,
) {
  const latest = await storage.loadJson(manifestObjectName);
  const manifest = parseCaptureProxyManifest(latest.value, jobId);
  const failed = failCaptureProxyManifest({
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
  return parseCaptureProxyManifest(stored.value, jobId);
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
    const manifest = parseCaptureProxyManifest(latest.value, jobId);
    if (manifest.status !== "processing" || manifest.lease?.id !== leaseId) {
      return;
    }
    await storage.saveJson(
      manifestObjectName,
      releaseCaptureProxyLease({ manifest, leaseId, now }),
      latest.generation,
    );
  } catch {
    // A lost claim is safe: another generation now owns the retry decision.
  }
}

async function quarantineQueue(
  storage: CaptureProxyWorkerStorage,
  queueObject: QueueObject,
  jobId: string,
  code: string,
  message: string,
  now: Date,
): Promise<CaptureProxyWorkerResult> {
  await storage.writeDeadLetter(
    buildCaptureProxyDeadLetterObjectName(jobId),
    {
      kind: "quipsly-capture-proxy-dead-letter-v1",
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
  manifest: CaptureProxyManifest,
) {
  await storage.writeDeadLetter(
    buildCaptureProxyDeadLetterObjectName(manifest.jobId),
    {
      kind: "quipsly-capture-proxy-dead-letter-v1",
      version: 1,
      jobId: manifest.jobId,
      manifestObjectName: buildCaptureProxyManifestObjectName(manifest.jobId),
      failure: manifest.failure,
    },
    queueObject.generation,
  );
  await storage.deleteObject(queueObject.name, queueObject.generation);
}

function assertSourceEvidence(
  manifest: CaptureProxyManifest,
  evidence: ObjectEvidence | null,
) {
  if (
    !evidence
    || evidence.bucketName !== manifest.source.bucketName
    || evidence.objectName !== manifest.source.objectName
    || evidence.generation !== manifest.source.generation
    || evidence.sizeBytes !== manifest.source.sizeBytes
    || evidence.contentType !== manifest.source.contentType
  ) {
    throw new TerminalProxyError(
      "source-generation-mismatch",
      "Source object evidence no longer matches the verified capture binding.",
    );
  }
}

function outputMetadata(
  manifest: CaptureProxyManifest,
  technical: CaptureProxyTechnicalEvidence,
  output: { sizeBytes: number; sha256: string },
) {
  return {
    quipslyKind: "capture-collaboration-proxy-v1",
    quipslyProxyJobId: manifest.jobId,
    quipslyRawAssetId: manifest.source.rawAssetId,
    quipslySourceObject: manifest.source.objectName,
    quipslySourceGeneration: manifest.source.generation,
    quipslySourceSha256: manifest.source.sha256,
    quipslyOutputSha256: output.sha256,
    quipslyOutputSizeBytes: String(output.sizeBytes),
    quipslyProfile: manifest.target.profile,
    quipslyDurationSeconds: String(technical.durationSeconds),
    quipslyWidth: String(technical.width),
    quipslyHeight: String(technical.height),
    quipslyFps: String(technical.fps),
    quipslyHasAudio: String(technical.hasAudio),
    quipslyVideoCodec: technical.videoCodec,
    quipslyAudioCodec: technical.audioCodec ?? "none",
    quipslyPixelFormat: technical.pixelFormat,
    quipslyFastStart: String(technical.fastStart),
  };
}

function assertOutputEvidence(
  manifest: CaptureProxyManifest,
  evidence: ObjectEvidence,
) {
  const metadata = evidence.customMetadata;
  const outputSizeBytes = positiveInteger(
    metadata.quipslyOutputSizeBytes,
    "proxy output size",
  );
  const outputSha256 = metadata.quipslyOutputSha256 ?? "";
  const technical = technicalEvidenceFromMetadata(metadata);
  if (
    evidence.bucketName !== manifest.target.bucketName
    || evidence.objectName !== manifest.target.objectName
    || evidence.contentType !== manifest.target.contentType
    || evidence.sizeBytes !== outputSizeBytes
    || !evidence.crc32c
    || metadata.quipslyProxyJobId !== manifest.jobId
    || metadata.quipslyRawAssetId !== manifest.source.rawAssetId
    || metadata.quipslySourceGeneration !== manifest.source.generation
    || metadata.quipslySourceSha256 !== manifest.source.sha256
    || metadata.quipslyProfile !== manifest.target.profile
    || !/^[0-9a-f]{64}$/.test(outputSha256)
  ) {
    throw new TerminalProxyError(
      "proxy-object-verification-failed",
      "Stored proxy does not match its immutable source and output evidence.",
    );
  }
  return {
    sha256: outputSha256,
    technical,
  };
}

function technicalEvidenceFromMetadata(
  metadata: Record<string, string>,
): CaptureProxyTechnicalEvidence {
  const audioCodec = metadata.quipslyAudioCodec;
  const hasAudio = metadata.quipslyHasAudio === "true";
  if (
    !["true", "false"].includes(metadata.quipslyHasAudio ?? "")
    || metadata.quipslyVideoCodec !== "h264"
    || !["aac", "none"].includes(audioCodec ?? "")
    || (hasAudio ? audioCodec !== "aac" : audioCodec !== "none")
    || metadata.quipslyPixelFormat !== "yuv420p"
    || metadata.quipslyFastStart !== "true"
  ) {
    throw new TerminalProxyError(
      "proxy-object-metadata-invalid",
      "Stored proxy technical metadata is invalid.",
    );
  }
  return {
    durationSeconds: positiveNumber(
      metadata.quipslyDurationSeconds,
      "proxy duration",
    ),
    width: positiveInteger(metadata.quipslyWidth, "proxy width"),
    height: positiveInteger(metadata.quipslyHeight, "proxy height"),
    fps: positiveNumber(metadata.quipslyFps, "proxy frame rate"),
    hasAudio,
    videoCodec: "h264",
    audioCodec: hasAudio ? "aac" : null,
    pixelFormat: "yuv420p",
    fastStart: true,
  };
}

function positiveNumber(value: string | undefined, label: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new TerminalProxyError(
      "proxy-object-metadata-invalid",
      `${label} must be a positive number.`,
    );
  }
  return parsed;
}

function positiveInteger(value: string | undefined, label: string) {
  const parsed = positiveNumber(value, label);
  if (!Number.isSafeInteger(parsed)) {
    throw new TerminalProxyError(
      "proxy-object-metadata-invalid",
      `${label} must be a safe integer.`,
    );
  }
  return parsed;
}

function resultFor(input: {
  manifest: CaptureProxyManifest;
  outputEvidence: ObjectEvidence;
  technical: CaptureProxyTechnicalEvidence;
  sha256: string;
  options: CaptureProxyWorkerOptions;
}): CaptureProxyResult {
  return {
    kind: "quipsly-capture-proxy-result-v1",
    version: 1,
    jobId: input.manifest.jobId,
    manifestObjectName: buildCaptureProxyManifestObjectName(
      input.manifest.jobId,
    ),
    source: input.manifest.source,
    output: {
      ...input.manifest.target,
      generation: input.outputEvidence.generation,
      sizeBytes: input.outputEvidence.sizeBytes,
      sha256: input.sha256,
      crc32c: input.outputEvidence.crc32c!,
      metadata: input.technical,
    },
    worker: {
      executionId: input.options.executionId,
      buildId: input.options.buildId,
      imageDigest: input.options.imageDigest,
    },
    completedAt: input.options.now().toISOString(),
  };
}

function isPreconditionFailure(error: unknown) {
  const candidate = error as {
    code?: unknown;
    status?: unknown;
    response?: { status?: unknown };
  };
  const code = Number(
    candidate?.code ?? candidate?.status ?? candidate?.response?.status,
  );
  return code === 409 || code === 412;
}

function isProxyTranscodeError(
  error: unknown,
): error is Error & { code: string; retryable: boolean } {
  return error instanceof Error
    && error.name === "ProxyTranscodeError"
    && typeof (error as { code?: unknown }).code === "string"
    && typeof (error as { retryable?: unknown }).retryable === "boolean";
}

export function captureProxyQueuePrefix() {
  return `${CAPTURE_PROXY_QUEUE_PREFIX}/`;
}

export async function sha256LocalFile(filePath: string) {
  const hash = createHash("sha256");
  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(1024 * 1024);
    let position = 0;
    while (true) {
      const { bytesRead } = await handle.read(
        buffer,
        0,
        buffer.length,
        position,
      );
      if (!bytesRead) break;
      hash.update(buffer.subarray(0, bytesRead));
      position += bytesRead;
    }
  } finally {
    await handle.close();
  }
  return hash.digest("hex");
}
