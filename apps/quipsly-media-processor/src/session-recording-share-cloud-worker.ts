import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  SESSION_RECORDING_SHARE_CLOUD_QUEUE_PREFIX,
  SESSION_RECORDING_SHARE_CLOUD_MAX_ATTEMPTS,
  assertSessionRecordingShareCloudResult,
  buildSessionRecordingShareCloudDeadLetterObjectName,
  buildSessionRecordingShareCloudManifestObjectName,
  buildSessionRecordingShareCloudQueueObjectName,
  buildSessionRecordingShareCloudResultObjectName,
  claimSessionRecordingShareCloudManifest,
  completeSessionRecordingShareCloudManifest,
  failSessionRecordingShareCloudManifest,
  newSessionRecordingShareResult,
  parseSessionRecordingShareCloudManifest,
  parseSessionRecordingShareCloudQueueReceipt,
  releaseSessionRecordingShareCloudLease,
  type SessionRecordingShareCloudManifest,
} from "@high-ground/quipsly-media-processing";

import { FfmpegSessionRecordingShareRenderer } from "./session-recording-share-ffmpeg.js";
import type {
  CaptureProxyWorkerOptions,
  CaptureProxyWorkerStorage,
  ObjectEvidence,
  QueueObject,
  StoredJson,
} from "./worker.js";

class TerminalShareError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "TerminalShareError";
  }
}

export async function runSessionRecordingShareCloudWorker(
  storage: CaptureProxyWorkerStorage,
  renderer: FfmpegSessionRecordingShareRenderer,
  options: CaptureProxyWorkerOptions,
  limit: number,
) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20)
    throw new Error(
      "Session recording share cloud worker limit must be between 1 and 20.",
    );
  const queue = await storage.listQueueObjectsUnder(
    `${SESSION_RECORDING_SHARE_CLOUD_QUEUE_PREFIX}/`,
    limit,
  );
  const results: unknown[] = [];
  const retries: Error[] = [];
  for (const object of queue) {
    try {
      results.push(
        await processSessionRecordingShareCloudQueueObject(
          storage,
          renderer,
          options,
          object,
        ),
      );
    } catch (error) {
      retries.push(
        error instanceof Error
          ? error
          : new Error("Unknown Session recording share cloud failure."),
      );
    }
  }
  if (retries.length)
    throw new AggregateError(
      retries,
      `${retries.length} Session recording share cloud job(s) need retry.`,
    );
  return results;
}

export async function processSessionRecordingShareCloudQueueObject(
  storage: CaptureProxyWorkerStorage,
  renderer: FfmpegSessionRecordingShareRenderer,
  options: CaptureProxyWorkerOptions,
  queueObject: QueueObject,
) {
  let receipt;
  try {
    receipt = parseSessionRecordingShareCloudQueueReceipt(
      (await storage.loadJson(queueObject.name, queueObject.generation)).value,
    );
  } catch (error) {
    return quarantine(
      storage,
      queueObject,
      fallbackId(queueObject.name),
      "session-share-queue-invalid",
      detail(error),
      options.now(),
    );
  }
  if (
    queueObject.name !==
    buildSessionRecordingShareCloudQueueObjectName(receipt.jobId)
  ) {
    return quarantine(
      storage,
      queueObject,
      receipt.jobId,
      "session-share-queue-path-mismatch",
      "Queue path does not match its Session share job.",
      options.now(),
    );
  }
  let storedManifest: StoredJson;
  let manifest: SessionRecordingShareCloudManifest;
  try {
    storedManifest = await storage.loadJson(receipt.manifestObjectName);
    manifest = parseSessionRecordingShareCloudManifest(
      storedManifest.value,
      receipt.jobId,
    );
    if (
      manifest.status === "queued" &&
      storedManifest.generation !== receipt.manifestGeneration
    )
      throw new Error(
        "Queued Session share manifest generation drifted from its receipt.",
      );
  } catch (error) {
    return quarantine(
      storage,
      queueObject,
      receipt.jobId,
      "session-share-manifest-invalid",
      detail(error),
      options.now(),
    );
  }
  if (manifest.status === "completed") {
    assertSessionRecordingShareCloudResult(
      (
        await storage.loadJson(
          buildSessionRecordingShareCloudResultObjectName(manifest.job.jobId),
        )
      ).value,
      manifest.job,
    );
    await storage.deleteObject(queueObject.name, queueObject.generation);
    return {
      disposition: "already-complete" as const,
      jobId: manifest.job.jobId,
    };
  }
  if (manifest.status === "failed-terminal") {
    await deadLetter(storage, queueObject, manifest);
    return {
      disposition: "terminal" as const,
      jobId: manifest.job.jobId,
      code: manifest.failure!.code,
    };
  }
  const leaseId = randomUUID();
  const claimed = claimSessionRecordingShareCloudManifest({
    manifest,
    leaseId,
    executionId: options.executionId,
    now: options.now(),
    leaseDurationMs: options.leaseDurationMs,
  });
  if (!claimed)
    return { disposition: "busy" as const, jobId: manifest.job.jobId };
  try {
    storedManifest = await storage.saveJson(
      receipt.manifestObjectName,
      claimed,
      storedManifest.generation,
    );
    manifest = parseSessionRecordingShareCloudManifest(
      storedManifest.value,
      receipt.jobId,
    );
  } catch (error) {
    if (Number((error as { code?: unknown })?.code) === 412)
      return { disposition: "claim-lost" as const, jobId: manifest.job.jobId };
    throw error;
  }

  if (manifest.attemptCount > SESSION_RECORDING_SHARE_CLOUD_MAX_ATTEMPTS) {
    const failed = failSessionRecordingShareCloudManifest({
      manifest,
      leaseId,
      code: "session-share-retry-exhausted",
      message: `Private preview preparation stopped after ${SESSION_RECORDING_SHARE_CLOUD_MAX_ATTEMPTS} unsuccessful attempts. The immutable participant sources and edit decision remain available for a fresh retry.`,
      now: options.now(),
    });
    const stored = await storage.saveJson(
      receipt.manifestObjectName,
      failed,
      storedManifest.generation,
    );
    const canonical = parseSessionRecordingShareCloudManifest(
      stored.value,
      manifest.job.jobId,
    );
    await deadLetter(storage, queueObject, canonical);
    return {
      disposition: "terminal" as const,
      jobId: manifest.job.jobId,
      code: "session-share-retry-exhausted",
    };
  }

  const scratch = await mkdtemp(
    path.join(tmpdir(), "quipsly-session-share-cloud-"),
  );
  try {
    const localSources = [];
    for (const [index, source] of manifest.job.sources.entries()) {
      const localPath = path.join(scratch, `source-${index}`);
      assertSource(
        source,
        await storage.objectEvidence(source.objectName, source.generation),
      );
      const copied = await storage.materializeObject(
        source.objectName,
        source.generation,
        localPath,
      );
      if (
        copied.sizeBytes !== source.sizeBytes ||
        copied.sha256 !== source.sha256
      )
        throw new TerminalShareError(
          "session-share-source-byte-mismatch",
          "A materialized participant source failed its immutable byte receipt.",
        );
      localSources.push({ ...source, locator: localPath });
    }
    const extension = manifest.job.target.mediaKind === "video" ? "mp4" : "m4a";
    const outputPath = path.join(scratch, `share.${extension}`);
    let rendered;
    try {
      rendered = await renderer.render(
        { ...manifest.job, sources: localSources },
        outputPath,
      );
    } catch (error) {
      throw new TerminalShareError(code(error), detail(error));
    }
    const uploaded = await storage.uploadProxy(
      outputPath,
      manifest.job.target.objectName,
      manifest.job.target.contentType,
      outputMetadata(manifest, rendered.sha256, rendered.sizeBytes),
    );
    assertOutput(manifest, uploaded, rendered.sha256, rendered.sizeBytes);
    const readback = await storage.materializeObject(
      uploaded.objectName,
      uploaded.generation,
      path.join(scratch, `share-readback.${extension}`),
    );
    if (
      readback.sha256 !== rendered.sha256 ||
      readback.sizeBytes !== rendered.sizeBytes
    )
      throw new TerminalShareError(
        "session-share-output-readback-mismatch",
        "Stored recording share failed exact-generation byte readback.",
      );
    const result = newSessionRecordingShareResult({
      jobId: manifest.job.jobId,
      roomId: manifest.job.roomId,
      outputId: manifest.job.outputId,
      outputRevision: manifest.job.outputRevision,
      sourceSetSha256: manifest.job.sourceSetSha256,
      edit: manifest.job.edit,
      sourceRecordingAssetIds: manifest.job.sources.map(
        (source) => source.recordingAssetId,
      ),
      output: {
        ...manifest.job.target,
        locator: `gcs://${uploaded.bucketName}/${uploaded.objectName}?generation=${uploaded.generation}`,
        generation: uploaded.generation,
        sha256: rendered.sha256,
        sizeBytes: rendered.sizeBytes,
        durationSeconds: rendered.technical.durationSeconds,
        completeDecode: true,
      },
      worker: {
        executionId: options.executionId,
        buildId: options.buildId,
        imageDigest: options.imageDigest,
        ffmpegVersion: rendered.technical.ffmpegVersion,
      },
      completedAt: options.now().toISOString(),
    });
    const canonical = assertSessionRecordingShareCloudResult(
      (
        await storage.saveJsonIfAbsent(
          buildSessionRecordingShareCloudResultObjectName(manifest.job.jobId),
          result,
        )
      ).value,
      manifest.job,
    );
    const latest = await storage.loadJson(receipt.manifestObjectName);
    const completed = completeSessionRecordingShareCloudManifest({
      manifest: parseSessionRecordingShareCloudManifest(
        latest.value,
        manifest.job.jobId,
      ),
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
      disposition: "completed" as const,
      jobId: manifest.job.jobId,
      outputGeneration: uploaded.generation,
    };
  } catch (error) {
    if (error instanceof TerminalShareError) {
      const latest = await storage.loadJson(receipt.manifestObjectName);
      const failed = failSessionRecordingShareCloudManifest({
        manifest: parseSessionRecordingShareCloudManifest(
          latest.value,
          manifest.job.jobId,
        ),
        leaseId,
        code: error.code,
        message: error.message,
        now: options.now(),
      });
      const stored = await storage.saveJson(
        receipt.manifestObjectName,
        failed,
        latest.generation,
      );
      const canonical = parseSessionRecordingShareCloudManifest(
        stored.value,
        manifest.job.jobId,
      );
      await deadLetter(storage, queueObject, canonical);
      return {
        disposition: "terminal" as const,
        jobId: manifest.job.jobId,
        code: error.code,
      };
    }
    try {
      const latest = await storage.loadJson(receipt.manifestObjectName);
      const current = parseSessionRecordingShareCloudManifest(
        latest.value,
        manifest.job.jobId,
      );
      if (current.status === "processing" && current.lease?.id === leaseId)
        await storage.saveJson(
          receipt.manifestObjectName,
          releaseSessionRecordingShareCloudLease({
            manifest: current,
            leaseId,
            now: options.now(),
          }),
          latest.generation,
        );
    } catch {
      /* lease expiry preserves retry */
    }
    throw error;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

function assertSource(
  source: SessionRecordingShareCloudManifest["job"]["sources"][number],
  evidence: ObjectEvidence | null,
) {
  if (
    !evidence ||
    evidence.bucketName !== source.bucketName ||
    evidence.objectName !== source.objectName ||
    evidence.generation !== source.generation ||
    evidence.sizeBytes !== source.sizeBytes ||
    evidence.contentType !== source.contentType
  )
    throw new TerminalShareError(
      "session-share-source-object-mismatch",
      "A participant source no longer matches its generation-bound job receipt.",
    );
}
function outputMetadata(
  manifest: SessionRecordingShareCloudManifest,
  sha256: string,
  sizeBytes: number,
) {
  return {
    quipslyKind: "session-recording-share-v3",
    quipslyMediaKind: manifest.job.target.mediaKind,
    quipslyJobId: manifest.job.jobId,
    quipslyRoomId: manifest.job.roomId,
    quipslyOutputId: manifest.job.outputId,
    quipslyOutputRevision: String(manifest.job.outputRevision),
    quipslySourceSetSha256: manifest.job.sourceSetSha256,
    quipslyEditSha256: createHash("sha256")
      .update(JSON.stringify(manifest.job.edit))
      .digest("hex"),
    quipslyExpectedSha256: sha256,
    quipslyExpectedSizeBytes: String(sizeBytes),
    quipslyOriginalSourcesRemainImmutable: "true",
    quipslyOutputPrivateUntilRelease: "true",
  };
}
function assertOutput(
  manifest: SessionRecordingShareCloudManifest,
  evidence: ObjectEvidence,
  sha256: string,
  sizeBytes: number,
) {
  const metadata = evidence.customMetadata;
  if (
    evidence.bucketName !== manifest.job.target.bucketName ||
    evidence.objectName !== manifest.job.target.objectName ||
    evidence.contentType !== manifest.job.target.contentType ||
    evidence.sizeBytes !== sizeBytes ||
    !evidence.crc32c ||
    metadata.quipslyJobId !== manifest.job.jobId ||
    metadata.quipslySourceSetSha256 !== manifest.job.sourceSetSha256 ||
    metadata.quipslyExpectedSha256 !== sha256 ||
    metadata.quipslyExpectedSizeBytes !== String(sizeBytes) ||
    metadata.quipslyMediaKind !== manifest.job.target.mediaKind ||
    metadata.quipslyOriginalSourcesRemainImmutable !== "true" ||
    metadata.quipslyOutputPrivateUntilRelease !== "true"
  )
    throw new TerminalShareError(
      "session-share-output-receipt-invalid",
      "Stored recording share does not match its immutable worker receipt.",
    );
}
async function deadLetter(
  storage: CaptureProxyWorkerStorage,
  queue: QueueObject,
  manifest: SessionRecordingShareCloudManifest,
) {
  await storage.writeDeadLetter(
    buildSessionRecordingShareCloudDeadLetterObjectName(manifest.job.jobId),
    {
      kind: "quipsly-session-recording-share-cloud-dead-letter-v1",
      jobId: manifest.job.jobId,
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
  failureCode: string,
  message: string,
  now: Date,
) {
  await storage.writeDeadLetter(
    buildSessionRecordingShareCloudDeadLetterObjectName(jobId),
    {
      kind: "quipsly-session-recording-share-cloud-quarantine-v1",
      jobId,
      failure: { code: failureCode, message, failedAt: now.toISOString() },
      queueObjectName: queue.name,
    },
    queue.generation,
  );
  await storage.deleteObject(queue.name, queue.generation);
  return { disposition: "terminal" as const, jobId, code: failureCode };
}
function fallbackId(name: string) {
  const suffix =
    name
      .split("/")
      .at(-1)
      ?.replace(/\.json$/, "") || "";
  return /^[A-Za-z0-9_-]{8,180}$/.test(suffix)
    ? suffix
    : `invalid_${createHash("sha256").update(name).digest("hex").slice(0, 24)}`;
}
function detail(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Invalid Session recording share cloud evidence.";
}
function code(error: unknown) {
  return typeof error === "object" && error && "code" in error
    ? String(error.code).slice(0, 120)
    : "session-share-render-failed";
}
