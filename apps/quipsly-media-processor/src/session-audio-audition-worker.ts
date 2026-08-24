import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  SESSION_AUDIO_AUDITION_QUEUE_PREFIX,
  SESSION_AUDIO_AUDITION_RESULT_KIND,
  buildSessionAudioAuditionDeadLetterObjectName,
  buildSessionAudioAuditionManifestObjectName,
  buildSessionAudioAuditionQueueObjectName,
  buildSessionAudioAuditionResultObjectName,
  claimSessionAudioAuditionManifest,
  completeSessionAudioAuditionManifest,
  failSessionAudioAuditionManifest,
  normalizeSessionAudioAuditionJobId,
  parseSessionAudioAuditionManifest,
  parseSessionAudioAuditionQueueReceipt,
  parseSessionAudioAuditionResult,
  releaseSessionAudioAuditionLease,
  type SessionAudioAuditionManifest,
  type SessionAudioAuditionResult,
} from "@high-ground/quipsly-media-processing";

import {
  SessionAudioAuditionError,
  type SessionAudioAuditionEngine,
} from "./session-audio-audition-ffmpeg.js";
import type {
  CaptureProxyWorkerOptions,
  CaptureProxyWorkerStorage,
  ObjectEvidence,
  QueueObject,
  StoredJson,
} from "./worker.js";

export type SessionAudioAuditionWorkerResult =
  | { disposition: "completed"; jobId: string; outputGeneration: string }
  | { disposition: "already-complete"; jobId: string }
  | { disposition: "terminal"; jobId: string; code: string }
  | { disposition: "busy" | "claim-lost"; jobId: string };

class TerminalAuditionError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "TerminalAuditionError";
  }
}

export async function runSessionAudioAuditionWorker(
  storage: CaptureProxyWorkerStorage,
  engine: SessionAudioAuditionEngine,
  options: CaptureProxyWorkerOptions,
  limit: number,
) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20)
    throw new Error(
      "Session audio audition worker limit must be between 1 and 20.",
    );
  const queue = await storage.listQueueObjectsUnder(
    `${SESSION_AUDIO_AUDITION_QUEUE_PREFIX}/`,
    limit,
  );
  const results: SessionAudioAuditionWorkerResult[] = [];
  const transient: Error[] = [];
  for (const object of queue) {
    try {
      results.push(
        await processSessionAudioAuditionQueueObject(
          storage,
          engine,
          options,
          object,
        ),
      );
    } catch (error) {
      transient.push(
        error instanceof Error
          ? error
          : new Error("Unknown Session audio audition failure."),
      );
    }
  }
  if (transient.length)
    throw new AggregateError(
      transient,
      `${transient.length} Session audio audition job(s) need retry.`,
    );
  return results;
}

export async function processSessionAudioAuditionQueueObject(
  storage: CaptureProxyWorkerStorage,
  engine: SessionAudioAuditionEngine,
  options: CaptureProxyWorkerOptions,
  queueObject: QueueObject,
): Promise<SessionAudioAuditionWorkerResult> {
  let receipt;
  try {
    receipt = parseSessionAudioAuditionQueueReceipt(
      (await storage.loadJson(queueObject.name, queueObject.generation)).value,
    );
  } catch (error) {
    const suffix = queueObject.name.startsWith(
      `${SESSION_AUDIO_AUDITION_QUEUE_PREFIX}/`,
    )
      ? queueObject.name
          .slice(SESSION_AUDIO_AUDITION_QUEUE_PREFIX.length + 1)
          .replace(/\.json$/, "")
      : "";
    const id =
      normalizeSessionAudioAuditionJobId(suffix) ||
      `invalid-${createHash("sha256").update(queueObject.name).digest("hex").slice(0, 24)}`;
    return quarantine(
      storage,
      queueObject,
      id,
      "queue-receipt-invalid",
      message(error),
      options.now(),
    );
  }
  if (
    queueObject.name !== buildSessionAudioAuditionQueueObjectName(receipt.jobId)
  ) {
    return quarantine(
      storage,
      queueObject,
      receipt.jobId,
      "queue-path-mismatch",
      "Queue path does not match its Session audition job.",
      options.now(),
    );
  }

  let storedManifest: StoredJson;
  let manifest: SessionAudioAuditionManifest;
  try {
    storedManifest = await storage.loadJson(receipt.manifestObjectName);
    manifest = parseSessionAudioAuditionManifest(
      storedManifest.value,
      receipt.jobId,
    );
    if (
      manifest.status === "queued" &&
      storedManifest.generation !== receipt.manifestGeneration
    )
      throw new Error("Queued manifest generation drifted from its receipt.");
  } catch (error) {
    return quarantine(
      storage,
      queueObject,
      receipt.jobId,
      "manifest-invalid",
      message(error),
      options.now(),
    );
  }
  if (manifest.status === "completed") {
    parseSessionAudioAuditionResult(
      (
        await storage.loadJson(
          buildSessionAudioAuditionResultObjectName(manifest.jobId),
        )
      ).value,
      manifest,
    );
    await storage.deleteObject(queueObject.name, queueObject.generation);
    return { disposition: "already-complete", jobId: manifest.jobId };
  }
  if (manifest.status === "failed-terminal") {
    await deadLetter(storage, queueObject, manifest);
    return {
      disposition: "terminal",
      jobId: manifest.jobId,
      code: manifest.failure!.code,
    };
  }

  const leaseId = randomUUID();
  const claimed = claimSessionAudioAuditionManifest({
    manifest,
    leaseId,
    executionId: options.executionId,
    now: options.now(),
    leaseDurationMs: options.leaseDurationMs,
  });
  if (!claimed) return { disposition: "busy", jobId: manifest.jobId };
  try {
    storedManifest = await storage.saveJson(
      receipt.manifestObjectName,
      claimed,
      storedManifest.generation,
    );
    manifest = parseSessionAudioAuditionManifest(
      storedManifest.value,
      receipt.jobId,
    );
  } catch (error) {
    if (isPrecondition(error))
      return { disposition: "claim-lost", jobId: manifest.jobId };
    throw error;
  }

  const scratch = await mkdtemp(join(tmpdir(), "quipsly-session-audition-"));
  try {
    const inputPath = join(scratch, "source-media");
    const outputPath = join(scratch, "audition.m4a");
    assertSource(
      manifest,
      await storage.objectEvidence(
        manifest.source.objectName,
        manifest.source.generation,
      ),
    );
    const local = await storage.materializeObject(
      manifest.source.objectName,
      manifest.source.generation,
      inputPath,
    );
    if (
      local.sizeBytes !== manifest.source.sizeBytes ||
      local.sha256 !== manifest.source.sha256
    )
      throw new TerminalAuditionError(
        "source-byte-mismatch",
        "Materialized Session source no longer matches its verified generation.",
      );
    let encoded;
    try {
      encoded = await engine.extract(inputPath, outputPath);
    } catch (error) {
      if (error instanceof SessionAudioAuditionError && !error.retryable)
        throw new TerminalAuditionError(error.code, error.message);
      throw error;
    }
    if (
      Math.abs(
        encoded.technical.sourceDurationSeconds -
          manifest.source.durationSeconds,
      ) > 0.25
    ) {
      throw new TerminalAuditionError(
        "source-duration-mismatch",
        "Decoded source duration no longer matches the canonical RecordingAsset evidence.",
      );
    }
    const storedOutput = await storage.uploadProxy(
      outputPath,
      manifest.target.objectName,
      manifest.target.contentType,
      outputMetadata(manifest, encoded),
    );
    if (
      storedOutput.sizeBytes !== encoded.sizeBytes ||
      storedOutput.contentType !== manifest.target.contentType ||
      storedOutput.bucketName !== manifest.target.bucketName ||
      !storedOutput.crc32c
    )
      throw new TerminalAuditionError(
        "output-evidence-mismatch",
        "Stored Session audition bytes do not match the encoder receipt.",
      );
    const result: SessionAudioAuditionResult = {
      kind: SESSION_AUDIO_AUDITION_RESULT_KIND,
      version: 1,
      jobId: manifest.jobId,
      manifestObjectName: buildSessionAudioAuditionManifestObjectName(
        manifest.jobId,
      ),
      source: manifest.source,
      output: {
        ...manifest.target,
        generation: storedOutput.generation,
        sizeBytes: encoded.sizeBytes,
        sha256: encoded.sha256,
        crc32c: storedOutput.crc32c,
        metadata: encoded.technical,
      },
      worker: {
        executionId: options.executionId,
        buildId: options.buildId,
        imageDigest: options.imageDigest,
        attempt: manifest.lease!.attempt,
      },
      completedAt: options.now().toISOString(),
      originalRemainsSourceTruth: true,
    };
    const canonical = parseSessionAudioAuditionResult(
      (
        await storage.saveJsonIfAbsent(
          buildSessionAudioAuditionResultObjectName(manifest.jobId),
          result,
        )
      ).value,
      manifest,
    );
    const latest = await storage.loadJson(receipt.manifestObjectName);
    const completed = completeSessionAudioAuditionManifest({
      manifest: parseSessionAudioAuditionManifest(latest.value, manifest.jobId),
      leaseId,
      result: canonical,
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
      outputGeneration: canonical.output.generation,
    };
  } catch (error) {
    if (error instanceof TerminalAuditionError) {
      const latest = await storage.loadJson(receipt.manifestObjectName);
      const failed = failSessionAudioAuditionManifest({
        manifest: parseSessionAudioAuditionManifest(
          latest.value,
          manifest.jobId,
        ),
        leaseId,
        code: error.code,
        message: error.message,
        now: options.now(),
      });
      await storage.saveJson(
        receipt.manifestObjectName,
        failed,
        latest.generation,
      );
      await deadLetter(storage, queueObject, failed);
      return {
        disposition: "terminal",
        jobId: manifest.jobId,
        code: error.code,
      };
    }
    try {
      const latest = await storage.loadJson(receipt.manifestObjectName);
      const current = parseSessionAudioAuditionManifest(
        latest.value,
        manifest.jobId,
      );
      if (current.status === "processing" && current.lease?.id === leaseId) {
        await storage.saveJson(
          receipt.manifestObjectName,
          releaseSessionAudioAuditionLease({
            manifest: current,
            leaseId,
            now: options.now(),
          }),
          latest.generation,
        );
      }
    } catch {
      /* Lease expiry provides retry recovery. */
    }
    throw error;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

function assertSource(
  manifest: SessionAudioAuditionManifest,
  evidence: ObjectEvidence | null,
) {
  if (
    !evidence ||
    evidence.bucketName !== manifest.source.bucketName ||
    evidence.objectName !== manifest.source.objectName ||
    evidence.generation !== manifest.source.generation ||
    evidence.sizeBytes !== manifest.source.sizeBytes ||
    evidence.contentType !== manifest.source.contentType
  ) {
    throw new TerminalAuditionError(
      "source-object-mismatch",
      "Session source object no longer matches the immutable audition manifest.",
    );
  }
}

function outputMetadata(
  manifest: SessionAudioAuditionManifest,
  output: { sha256: string; technical: { durationSeconds: number } },
) {
  return {
    quipslyKind: SESSION_AUDIO_AUDITION_RESULT_KIND,
    quipslyJobId: manifest.jobId,
    quipslyRoomId: manifest.roomId,
    quipslyRecordingAssetId: manifest.source.recordingAssetId,
    quipslySourceGeneration: manifest.source.generation,
    quipslySourceSha256: manifest.source.sha256,
    quipslyOutputSha256: output.sha256,
    quipslyDurationSeconds: String(output.technical.durationSeconds),
    originalRemainsSourceTruth: "true",
  };
}

async function deadLetter(
  storage: CaptureProxyWorkerStorage,
  queue: QueueObject,
  manifest: SessionAudioAuditionManifest,
) {
  await storage.writeDeadLetter(
    buildSessionAudioAuditionDeadLetterObjectName(manifest.jobId),
    {
      kind: "quipsly-session-audio-audition-dead-letter-v1",
      jobId: manifest.jobId,
      failure: manifest.failure,
      manifest,
    },
    queue.generation,
  );
  await storage.deleteObject(queue.name, queue.generation);
}

async function quarantine(
  storage: CaptureProxyWorkerStorage,
  queue: QueueObject,
  jobId: string,
  code: string,
  detail: string,
  now: Date,
): Promise<SessionAudioAuditionWorkerResult> {
  await storage.writeDeadLetter(
    buildSessionAudioAuditionDeadLetterObjectName(jobId),
    {
      kind: "quipsly-session-audio-audition-quarantine-v1",
      jobId,
      failure: { code, message: detail, failedAt: now.toISOString() },
      queueObjectName: queue.name,
    },
    queue.generation,
  );
  await storage.deleteObject(queue.name, queue.generation);
  return { disposition: "terminal", jobId, code };
}

function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Invalid Session audio audition evidence.";
}
function isPrecondition(error: unknown) {
  return Number((error as { code?: unknown })?.code) === 412;
}
