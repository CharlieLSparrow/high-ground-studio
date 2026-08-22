import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  INTERRUPTION_REPAIR_QUEUE_PREFIX,
  INTERRUPTION_REPAIR_RESULT_KIND,
  buildInterruptionRepairDeadLetterObjectName,
  buildInterruptionRepairManifestObjectName,
  buildInterruptionRepairQueueObjectName,
  buildInterruptionRepairResultObjectName,
  claimInterruptionRepairManifest,
  completeInterruptionRepairManifest,
  failInterruptionRepairManifest,
  normalizeInterruptionRepairJobId,
  parseInterruptionRepairManifest,
  parseInterruptionRepairQueueReceipt,
  parseInterruptionRepairResult,
  releaseInterruptionRepairLease,
  type InterruptionRepairManifest,
  type InterruptionRepairResult,
} from "@high-ground/quipsly-media-processing";

import {
  InterruptionRepairError,
  type InterruptionRepairEngine,
} from "./interruption-repair-ffmpeg.js";
import type {
  CaptureProxyWorkerOptions,
  CaptureProxyWorkerStorage,
  ObjectEvidence,
  QueueObject,
  StoredJson,
} from "./worker.js";

export type InterruptionRepairWorkerResult =
  | { disposition: "completed"; jobId: string; outputGeneration: string }
  | { disposition: "already-complete"; jobId: string }
  | { disposition: "terminal"; jobId: string; code: string }
  | { disposition: "busy"; jobId: string }
  | { disposition: "claim-lost"; jobId: string };

class TerminalRepairError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "TerminalRepairError";
    this.code = code;
  }
}

export async function runInterruptionRepairWorker(
  storage: CaptureProxyWorkerStorage,
  engine: InterruptionRepairEngine,
  options: CaptureProxyWorkerOptions,
  limit: number,
) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) {
    throw new Error("Interruption repair worker limit must be between 1 and 20.");
  }
  const queue = await storage.listQueueObjectsUnder(
    `${INTERRUPTION_REPAIR_QUEUE_PREFIX}/`,
    limit,
  );
  const results: InterruptionRepairWorkerResult[] = [];
  const transient: Error[] = [];
  for (const object of queue) {
    try {
      results.push(await processInterruptionRepairQueueObject(
        storage,
        engine,
        options,
        object,
      ));
    } catch (error) {
      transient.push(error instanceof Error ? error : new Error("Unknown interruption repair failure."));
    }
  }
  if (transient.length > 0) {
    throw new AggregateError(transient, `${transient.length} interruption repair job(s) need retry.`);
  }
  return results;
}

export async function processInterruptionRepairQueueObject(
  storage: CaptureProxyWorkerStorage,
  engine: InterruptionRepairEngine,
  options: CaptureProxyWorkerOptions,
  queueObject: QueueObject,
): Promise<InterruptionRepairWorkerResult> {
  let receipt;
  try {
    const storedQueue = await storage.loadJson(queueObject.name, queueObject.generation);
    receipt = parseInterruptionRepairQueueReceipt(storedQueue.value);
  } catch (error) {
    const suffix = queueObject.name.startsWith(`${INTERRUPTION_REPAIR_QUEUE_PREFIX}/`)
      ? queueObject.name.slice(INTERRUPTION_REPAIR_QUEUE_PREFIX.length + 1).replace(/\.json$/, "")
      : "";
    const quarantineId = normalizeInterruptionRepairJobId(suffix)
      || `invalid-${createHash("sha256").update(queueObject.name).digest("hex").slice(0, 24)}`;
    return quarantineQueue(storage, queueObject, quarantineId, "queue-receipt-invalid",
      error instanceof Error ? error.message : "Invalid repair queue receipt.", options.now());
  }
  if (queueObject.name !== buildInterruptionRepairQueueObjectName(receipt.jobId)) {
    return quarantineQueue(storage, queueObject, receipt.jobId, "queue-path-mismatch",
      "Queue object path does not match the repair job.", options.now());
  }

  let storedManifest: StoredJson;
  let manifest: InterruptionRepairManifest;
  try {
    storedManifest = await storage.loadJson(receipt.manifestObjectName);
    manifest = parseInterruptionRepairManifest(storedManifest.value, receipt.jobId);
    if (manifest.status === "queued" && storedManifest.generation !== receipt.manifestGeneration) {
      throw new Error("Queued repair manifest generation no longer matches its receipt.");
    }
  } catch (error) {
    return quarantineQueue(storage, queueObject, receipt.jobId, "manifest-invalid",
      error instanceof Error ? error.message : "Invalid repair manifest.", options.now());
  }

  if (manifest.status === "completed") {
    const stored = await storage.loadJson(buildInterruptionRepairResultObjectName(manifest.jobId));
    parseInterruptionRepairResult(stored.value, manifest);
    await storage.deleteObject(queueObject.name, queueObject.generation);
    return { disposition: "already-complete", jobId: manifest.jobId };
  }
  if (manifest.status === "failed-terminal") {
    await deadLetterAndDelete(storage, queueObject, manifest);
    return { disposition: "terminal", jobId: manifest.jobId, code: manifest.failure!.code };
  }

  const leaseId = randomUUID();
  const claimed = claimInterruptionRepairManifest({
    manifest,
    leaseId,
    executionId: options.executionId,
    now: options.now(),
    leaseDurationMs: options.leaseDurationMs,
  });
  if (!claimed) return { disposition: "busy", jobId: manifest.jobId };
  try {
    storedManifest = await storage.saveJson(receipt.manifestObjectName, claimed, storedManifest.generation);
    manifest = parseInterruptionRepairManifest(storedManifest.value, receipt.jobId);
  } catch (error) {
    if (isPreconditionFailure(error)) return { disposition: "claim-lost", jobId: manifest.jobId };
    throw error;
  }

  const scratch = await mkdtemp(join(tmpdir(), "quipsly-interruption-repair-"));
  try {
    const inputPath = join(scratch, "interrupted.webm");
    const outputPath = join(scratch, "repaired.webm");
    assertSourceEvidence(manifest, await storage.objectEvidence(
      manifest.source.objectName,
      manifest.source.generation,
    ));
    const materialized = await storage.materializeObject(
      manifest.source.objectName,
      manifest.source.generation,
      inputPath,
    );
    if (materialized.sizeBytes !== manifest.source.sizeBytes || materialized.sha256 !== manifest.source.sha256) {
      throw new TerminalRepairError(
        "source-byte-mismatch",
        "Materialized repair source does not match the verified original generation.",
      );
    }
    let repaired;
    try {
      repaired = await engine.repair(inputPath, outputPath);
    } catch (error) {
      if (error instanceof InterruptionRepairError && !error.retryable) {
        throw new TerminalRepairError(error.code, error.message);
      }
      throw error;
    }
    const storedOutput = await storage.uploadProxy(
      outputPath,
      manifest.target.objectName,
      manifest.target.contentType,
      outputMetadata(manifest, repaired),
    );
    assertOutputEvidence(manifest, repaired, storedOutput);
    const result: InterruptionRepairResult = {
      kind: INTERRUPTION_REPAIR_RESULT_KIND,
      version: 1,
      jobId: manifest.jobId,
      manifestObjectName: buildInterruptionRepairManifestObjectName(manifest.jobId),
      source: manifest.source,
      output: {
        ...manifest.target,
        generation: storedOutput.generation,
        sizeBytes: storedOutput.sizeBytes,
        sha256: repaired.sha256,
        crc32c: storedOutput.crc32c!,
        metadata: repaired.technical,
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
    const storedResult = await storage.saveJsonIfAbsent(
      buildInterruptionRepairResultObjectName(manifest.jobId),
      result,
    );
    const canonicalResult = parseInterruptionRepairResult(storedResult.value, manifest);
    const latest = await storage.loadJson(receipt.manifestObjectName);
    const latestManifest = parseInterruptionRepairManifest(latest.value, manifest.jobId);
    const completed = completeInterruptionRepairManifest({
      manifest: latestManifest,
      leaseId,
      result: canonicalResult,
      now: options.now(),
    });
    await storage.saveJson(receipt.manifestObjectName, completed, latest.generation);
    await storage.deleteObject(queueObject.name, queueObject.generation);
    return {
      disposition: "completed",
      jobId: manifest.jobId,
      outputGeneration: canonicalResult.output.generation,
    };
  } catch (error) {
    if (error instanceof TerminalRepairError) {
      const latest = await storage.loadJson(receipt.manifestObjectName);
      const latestManifest = parseInterruptionRepairManifest(latest.value, manifest.jobId);
      const failed = failInterruptionRepairManifest({
        manifest: latestManifest,
        leaseId,
        code: error.code,
        message: error.message,
        now: options.now(),
      });
      await storage.saveJson(receipt.manifestObjectName, failed, latest.generation);
      await deadLetterAndDelete(storage, queueObject, failed);
      return { disposition: "terminal", jobId: manifest.jobId, code: error.code };
    }
    try {
      const latest = await storage.loadJson(receipt.manifestObjectName);
      const latestManifest = parseInterruptionRepairManifest(latest.value, manifest.jobId);
      if (latestManifest.status === "processing" && latestManifest.lease?.id === leaseId) {
        const released = releaseInterruptionRepairLease({
          manifest: latestManifest,
          leaseId,
          now: options.now(),
        });
        await storage.saveJson(receipt.manifestObjectName, released, latest.generation);
      }
    } catch {
      // Lease expiry makes this independently recoverable on the next worker.
    }
    throw error;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

function assertSourceEvidence(manifest: InterruptionRepairManifest, evidence: ObjectEvidence | null) {
  if (
    !evidence
    || evidence.bucketName !== manifest.source.bucketName
    || evidence.objectName !== manifest.source.objectName
    || evidence.generation !== manifest.source.generation
    || evidence.sizeBytes !== manifest.source.sizeBytes
    || evidence.contentType.toLowerCase() !== manifest.source.contentType
  ) throw new TerminalRepairError("source-evidence-mismatch", "Repair source object no longer matches its immutable binding.");
}

function outputMetadata(
  manifest: InterruptionRepairManifest,
  repaired: Awaited<ReturnType<InterruptionRepairEngine["repair"]>>,
) {
  return {
    quipslyKind: INTERRUPTION_REPAIR_RESULT_KIND,
    repairJobId: manifest.jobId,
    sourceObjectName: manifest.source.objectName,
    sourceGeneration: manifest.source.generation,
    sourceSha256: manifest.source.sha256,
    outputSha256: repaired.sha256,
    repairProfile: manifest.target.profile,
    technicalEvidence: JSON.stringify(repaired.technical),
    originalRemainsSourceTruth: "true",
  };
}

function assertOutputEvidence(
  manifest: InterruptionRepairManifest,
  repaired: Awaited<ReturnType<InterruptionRepairEngine["repair"]>>,
  output: ObjectEvidence,
) {
  if (
    output.bucketName !== manifest.target.bucketName
    || output.objectName !== manifest.target.objectName
    || output.contentType.toLowerCase() !== manifest.target.contentType
    || output.sizeBytes !== repaired.sizeBytes
    || !output.crc32c
    || output.customMetadata.outputSha256 !== repaired.sha256
    || output.customMetadata.sourceGeneration !== manifest.source.generation
    || output.customMetadata.sourceSha256 !== manifest.source.sha256
    || output.customMetadata.originalRemainsSourceTruth !== "true"
  ) throw new TerminalRepairError("repair-output-evidence-mismatch", "Stored repair derivative does not match worker evidence.");
}

async function quarantineQueue(
  storage: CaptureProxyWorkerStorage,
  queue: QueueObject,
  jobId: string,
  code: string,
  message: string,
  now: Date,
): Promise<InterruptionRepairWorkerResult> {
  await storage.writeDeadLetter(buildInterruptionRepairDeadLetterObjectName(jobId), {
    kind: "quipsly-interruption-repair-dead-letter-v1",
    jobId,
    code,
    message,
    queueObjectName: queue.name,
    queueGeneration: queue.generation,
    failedAt: now.toISOString(),
  }, queue.generation);
  await storage.deleteObject(queue.name, queue.generation);
  return { disposition: "terminal", jobId, code };
}

async function deadLetterAndDelete(
  storage: CaptureProxyWorkerStorage,
  queue: QueueObject,
  manifest: InterruptionRepairManifest,
) {
  await storage.writeDeadLetter(buildInterruptionRepairDeadLetterObjectName(manifest.jobId), {
    kind: "quipsly-interruption-repair-dead-letter-v1",
    jobId: manifest.jobId,
    failure: manifest.failure,
    manifestObjectName: buildInterruptionRepairManifestObjectName(manifest.jobId),
    queueObjectName: queue.name,
  }, queue.generation);
  await storage.deleteObject(queue.name, queue.generation);
}

function isPreconditionFailure(error: unknown) {
  const row = error as { code?: unknown; status?: unknown };
  const code = Number(row?.code ?? row?.status);
  return code === 409 || code === 412;
}
