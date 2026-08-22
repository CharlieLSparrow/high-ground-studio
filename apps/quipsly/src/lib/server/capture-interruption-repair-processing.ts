import "server-only";

import { getMediaBucket } from "@/lib/server/gcs";
import {
  mediaProcessorEnabled,
  mediaProcessorExecutionRequestIsRecent,
  requestMediaProcessorExecution,
} from "@/lib/server/media-processor-control";
import {
  INTERRUPTION_REPAIR_QUEUE_KIND,
  buildInterruptionRepairManifestObjectName,
  buildInterruptionRepairQueueObjectName,
  buildInterruptionRepairTargetObjectName,
  newInterruptionRepairManifest,
  parseInterruptionRepairManifest,
  parseInterruptionRepairQueueReceipt,
  type InterruptionRepairManifest,
  type InterruptionRepairQueueReceipt,
} from "@high-ground/quipsly-media-processing";

export type InterruptionRepairQueueStatus = {
  status: "local-execution-required" | "queued" | "processing" | "completed" | "configuration-required";
  jobId: string;
  executionRequested: boolean;
};

export class InterruptionRepairOutboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InterruptionRepairOutboxError";
  }
}

export async function ensureInterruptionRepairProcessingQueued(input: {
  prisma: any;
  recordingAssetId: string;
}): Promise<InterruptionRepairQueueStatus> {
  const jobs = await input.prisma.studioWorkflowJob.findMany({
    where: {
      type: "capture-interruption-repair",
      source: "mobile-capture-finalization",
      status: { in: ["queued", "processing", "blocked", "completed"] },
    },
    orderBy: { createdAt: "asc" },
  });
  const workflow = jobs.find(
    (job: any) => object(job.inputJson).recordingAssetId === input.recordingAssetId,
  );
  if (!workflow) throw new InterruptionRepairOutboxError("Interrupted recording has no durable repair workflow.");
  return ensureInterruptionRepairWorkflowQueued({ prisma: input.prisma, workflow });
}

export async function ensureInterruptionRepairWorkflowQueued(input: {
  prisma: any;
  workflow: any;
}): Promise<InterruptionRepairQueueStatus> {
  const source = workflowSource(input.workflow);
  if (input.workflow.status === "completed") {
    return { status: "completed", jobId: input.workflow.id, executionRequested: false };
  }
  if (source.storageBackend === "local-development") {
    return { status: "local-execution-required", jobId: input.workflow.id, executionRequested: false };
  }

  const manifestObjectName = buildInterruptionRepairManifestObjectName(input.workflow.id);
  const queueObjectName = buildInterruptionRepairQueueObjectName(input.workflow.id);
  const targetObjectName = buildInterruptionRepairTargetObjectName({
    projectSlug: source.projectSlug,
    recordingAssetId: source.recordingAssetId,
    jobId: input.workflow.id,
  });
  const now = new Date().toISOString();
  const expected = newInterruptionRepairManifest({
    jobId: input.workflow.id,
    projectId: source.projectId,
    projectSlug: source.projectSlug,
    actorUserId: source.actorUserId,
    actorEmail: source.actorEmail,
    captureId: source.captureId,
    captureGroupId: source.captureGroupId,
    source: {
      bucketName: source.bucketName,
      objectName: source.objectName,
      generation: source.generation,
      sizeBytes: source.sizeBytes,
      sha256: source.sha256,
      contentType: source.contentType,
      recordingAssetId: source.recordingAssetId,
      uploadSessionId: source.uploadSessionId,
    },
    target: {
      bucketName: source.bucketName,
      objectName: targetObjectName,
      contentType: source.contentType as "audio/webm" | "video/webm",
      profile: "lossless-container-remux-v1",
    },
    queuedAt: now,
    updatedAt: now,
  });
  const bucket = getMediaBucket(source.bucketName);
  const storedManifest = await saveJsonIfAbsent(bucket, manifestObjectName, expected);
  const canonical = parseInterruptionRepairManifest(storedManifest.value, input.workflow.id);
  assertImmutableBinding(canonical, expected);
  if (canonical.status === "failed-terminal") {
    await input.prisma.studioWorkflowJob.update({
      where: { id: input.workflow.id },
      data: {
        status: "failed",
        error: `${canonical.failure?.code}: ${canonical.failure?.message}`,
        completedAt: new Date(canonical.failure!.failedAt),
      },
    });
    throw new InterruptionRepairOutboxError("Interruption repair worker failed terminal.");
  }
  if (canonical.status !== "completed") {
    const receipt: InterruptionRepairQueueReceipt = {
      kind: INTERRUPTION_REPAIR_QUEUE_KIND,
      version: 1,
      jobId: input.workflow.id,
      manifestObjectName,
      manifestGeneration: storedManifest.generation,
      enqueuedAt: canonical.queuedAt,
    };
    await saveQueueIfAbsent(bucket, queueObjectName, receipt);
  }

  const workflowInput = object(input.workflow.inputJson);
  const priorControl = object(workflowInput.processingControl);
  const processingControl = {
    version: 1,
    bucketName: source.bucketName,
    manifestObjectName,
    manifestGeneration: storedManifest.generation,
    queueObjectName,
    targetObjectName,
    sourceGeneration: source.generation,
    sourceSha256: source.sha256,
    profile: canonical.target.profile,
    executionRequestedAt: string(priorControl.executionRequestedAt) || null,
    originalRemainsSourceTruth: true,
  };
  await input.prisma.studioWorkflowJob.update({
    where: { id: input.workflow.id },
    data: {
      status: canonical.status === "queued" ? "queued" : "processing",
      error: null,
      inputJson: { ...workflowInput, processingControl },
    },
  });
  if (canonical.status === "completed") {
    return { status: "processing", jobId: input.workflow.id, executionRequested: false };
  }
  if (!mediaProcessorEnabled()) {
    return { status: "configuration-required", jobId: input.workflow.id, executionRequested: false };
  }
  if (mediaProcessorExecutionRequestIsRecent(processingControl.executionRequestedAt)) {
    return {
      status: canonical.status === "processing" ? "processing" : "queued",
      jobId: input.workflow.id,
      executionRequested: false,
    };
  }
  await requestMediaProcessorExecution();
  const executionRequestedAt = new Date().toISOString();
  await input.prisma.studioWorkflowJob.update({
    where: { id: input.workflow.id },
    data: {
      inputJson: {
        ...workflowInput,
        processingControl: { ...processingControl, executionRequestedAt },
      },
    },
  });
  return {
    status: canonical.status === "processing" ? "processing" : "queued",
    jobId: input.workflow.id,
    executionRequested: true,
  };
}

function workflowSource(workflow: any) {
  const row = object(workflow.inputJson);
  const source = object(row.source);
  if (workflow.type !== "capture-interruption-repair" || workflow.source !== "mobile-capture-finalization") {
    throw new InterruptionRepairOutboxError("Workflow is not a Capture interruption repair outbox.");
  }
  const result = {
    storageBackend: required(source.storageBackend, "storage backend"),
    projectId: required(workflow.projectId || row.projectId, "project"),
    projectSlug: required(row.projectSlug, "project slug"),
    actorUserId: required(row.actorUserId, "actor user"),
    actorEmail: required(row.actorEmail || workflow.requestedByEmail, "actor email").toLowerCase(),
    captureId: required(row.captureId, "capture"),
    captureGroupId: required(row.captureGroupId, "capture group"),
    recordingAssetId: required(row.recordingAssetId, "recording asset"),
    uploadSessionId: required(row.uploadSessionId, "upload session"),
    bucketName: required(source.bucketName, "source bucket"),
    objectName: required(source.objectName, "source object"),
    generation: required(source.generation, "source generation"),
    sizeBytes: positiveInteger(source.sizeBytes, "source bytes"),
    sha256: required(source.sha256, "source SHA-256").toLowerCase(),
    contentType: required(source.contentType, "source content type").toLowerCase(),
  };
  if (
    !["gcs", "local-development"].includes(result.storageBackend)
    || !/^[0-9a-f]{64}$/.test(result.sha256)
    || !["audio/webm", "video/webm"].includes(result.contentType)
    || (result.storageBackend === "gcs" && !/^[1-9][0-9]*$/.test(result.generation))
  ) throw new InterruptionRepairOutboxError("Repair outbox source binding is invalid.");
  return result;
}

async function saveJsonIfAbsent(bucket: any, objectName: string, value: unknown) {
  const file = bucket.file(objectName);
  try {
    await file.save(JSON.stringify(value), {
      resumable: false,
      validation: "crc32c",
      contentType: "application/json; charset=utf-8",
      metadata: { cacheControl: "private, no-store" },
      preconditionOpts: { ifGenerationMatch: 0 },
    });
  } catch (error) {
    if (!isPreconditionFailure(error)) throw error;
  }
  const [metadata] = await file.getMetadata();
  const [raw] = await bucket.file(objectName, { generation: metadata.generation }).download({ validation: "crc32c" });
  return { value: JSON.parse(raw.toString("utf8")), generation: String(metadata.generation) };
}

async function saveQueueIfAbsent(bucket: any, objectName: string, value: InterruptionRepairQueueReceipt) {
  try {
    await bucket.file(objectName).save(JSON.stringify(value), {
      resumable: false,
      validation: "crc32c",
      contentType: "application/json; charset=utf-8",
      metadata: { cacheControl: "private, no-store" },
      preconditionOpts: { ifGenerationMatch: 0 },
    });
  } catch (error) {
    if (!isPreconditionFailure(error)) throw error;
  }
  const [raw] = await bucket.file(objectName).download({ validation: "crc32c" });
  parseInterruptionRepairQueueReceipt(JSON.parse(raw.toString("utf8")));
}

function assertImmutableBinding(actual: InterruptionRepairManifest, expected: InterruptionRepairManifest) {
  if (
    JSON.stringify(actual.source) !== JSON.stringify(expected.source)
    || JSON.stringify(actual.target) !== JSON.stringify(expected.target)
    || actual.projectId !== expected.projectId
    || actual.actorUserId !== expected.actorUserId
    || actual.captureId !== expected.captureId
    || actual.captureGroupId !== expected.captureGroupId
  ) throw new InterruptionRepairOutboxError("Stored repair manifest conflicts with its immutable database outbox.");
}

function object(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function string(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function required(value: unknown, label: string) {
  const result = string(value);
  if (!result) throw new InterruptionRepairOutboxError(`Repair outbox is missing ${label}.`);
  return result;
}

function positiveInteger(value: unknown, label: string) {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result <= 0) throw new InterruptionRepairOutboxError(`Repair outbox has invalid ${label}.`);
  return result;
}

function isPreconditionFailure(error: unknown) {
  const row = error as { code?: unknown; status?: unknown };
  const code = Number(row?.code ?? row?.status);
  return code === 409 || code === 412;
}

