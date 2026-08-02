import "server-only";

import { getMediaBucket } from "@/lib/server/gcs";
import {
  mediaProcessorEnabled,
  mediaProcessorExecutionRequestIsRecent,
  requestMediaProcessorExecution,
} from "@/lib/server/media-processor-control";
import type {
  MobileCaptureObjectEvidence,
  MobileCaptureResumableManifest,
} from "@/lib/server/mobile-capture-resumable-store";
import {
  CAPTURE_PROXY_QUEUE_KIND,
  buildCaptureProxyManifestObjectName,
  buildCaptureProxyQueueObjectName,
  buildCaptureProxyTargetObjectName,
  newCaptureProxyManifest,
  parseCaptureProxyManifest,
  parseCaptureProxyQueueReceipt,
  type CaptureProxyManifest,
  type CaptureProxyQueueReceipt,
} from "@high-ground/quipsly-media-processing";

export type CaptureProxyQueueStatus = {
  status:
    | "not-required"
    | "held"
    | "queued"
    | "processing"
    | "completed"
    | "configuration-required";
  jobId: string | null;
  queueObjectName: string | null;
  manifestObjectName: string | null;
  targetObjectName: string | null;
  executionRequested: boolean;
};

export class CaptureProxyOutboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CaptureProxyOutboxError";
  }
}

export async function ensureCaptureProxyProcessingQueued(input: {
  prisma: any;
  manifest: MobileCaptureResumableManifest;
  object: MobileCaptureObjectEvidence;
  finalization: {
    sourceId: string | null;
    mediaAssetId: string | null;
    recordingAssetId: string;
    processingDisposition: "HELD" | "RELEASED";
  };
}): Promise<CaptureProxyQueueStatus> {
  const { manifest, object, finalization } = input;
  const isVideo =
    manifest.sourceType === "video"
    || manifest.contentType.toLowerCase().startsWith("video/");
  if (!isVideo) {
    return emptyStatus("not-required");
  }
  if (finalization.processingDisposition !== "RELEASED") {
    return emptyStatus("held");
  }
  if (
    !finalization.sourceId
    || !finalization.mediaAssetId
    || !finalization.recordingAssetId
    || !manifest.episodeSlug
  ) {
    throw new Error(
      "Released video is missing canonical episode/source identities for proxy processing.",
    );
  }
  if (
    object.generation !== manifest.verification?.generation
    && manifest.verification
  ) {
    throw new Error(
      "Capture proxy queue source generation does not match the verified manifest.",
    );
  }

  const workflow = await input.prisma.studioWorkflowJob.findFirst({
    where: {
      projectId: manifest.projectId,
      assetId: finalization.mediaAssetId,
      type: "asset-proxy",
      source: "mobile-capture-finalization",
    },
    orderBy: { createdAt: "asc" },
  });
  if (!workflow) {
    throw new Error("Released video has no canonical asset-proxy workflow job.");
  }
  return ensureCaptureProxyWorkflowQueued({
    prisma: input.prisma,
    workflow,
  });
}

/**
 * Dispatches the database workflow row as a transactional outbox. This is
 * intentionally callable after a process crash between database commit and
 * GCS queue creation.
 */
export async function ensureCaptureProxyWorkflowQueued(input: {
  prisma: any;
  workflow: any;
}): Promise<CaptureProxyQueueStatus> {
  const { workflow } = input;
  if (workflow.status === "completed") {
    return {
      status: "completed",
      jobId: workflow.id,
      queueObjectName: null,
      manifestObjectName: null,
      targetObjectName: null,
      executionRequested: false,
    };
  }
  const source = captureProxyWorkflowSource(workflow);

  const manifestObjectName = buildCaptureProxyManifestObjectName(workflow.id);
  const queueObjectName = buildCaptureProxyQueueObjectName(workflow.id);
  const targetObjectName = buildCaptureProxyTargetObjectName({
    projectSlug: source.projectSlug,
    episodeSlug: source.episodeSlug,
    rawAssetId: source.rawAssetId,
    jobId: workflow.id,
  });
  const queuedAt = new Date().toISOString();
  const workerManifest = newCaptureProxyManifest({
    jobId: workflow.id,
    projectId: source.projectId,
    projectSlug: source.projectSlug,
    episodeSlug: source.episodeSlug,
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
      rawAssetId: source.rawAssetId,
      sourceId: source.sourceId,
      recordingAssetId: source.recordingAssetId,
      uploadSessionId: source.uploadSessionId,
    },
    target: {
      bucketName: source.bucketName,
      objectName: targetObjectName,
      contentType: "video/mp4",
      profile: "collaboration-1080p-h264-aac-v1",
    },
    queuedAt,
    updatedAt: queuedAt,
  });
  const bucket = getMediaBucket(source.bucketName);
  const storedManifest = await saveManifestIfAbsent(
    bucket,
    manifestObjectName,
    workerManifest,
  );
  const canonicalManifest = parseCaptureProxyManifest(
    storedManifest.value,
    workflow.id,
  );
  assertImmutableManifestBinding(canonicalManifest, workerManifest);

  if (canonicalManifest.status === "failed-terminal") {
    await input.prisma.studioWorkflowJob.update({
      where: { id: workflow.id },
      data: {
        status: "failed",
        error: [
          canonicalManifest.failure?.code || "proxy-worker-failed",
          canonicalManifest.failure?.message || "Proxy worker failed terminal.",
        ].join(": "),
        completedAt: new Date(
          canonicalManifest.failure?.failedAt || canonicalManifest.updatedAt,
        ),
      },
    });
    throw new Error("Capture proxy worker has failed terminal.");
  }

  if (canonicalManifest.status !== "completed") {
    const queueReceipt: CaptureProxyQueueReceipt = {
      kind: CAPTURE_PROXY_QUEUE_KIND,
      version: 1,
      jobId: workflow.id,
      manifestObjectName,
      manifestGeneration: storedManifest.generation,
      enqueuedAt: canonicalManifest.queuedAt,
    };
    await saveQueueIfAbsent(bucket, queueObjectName, queueReceipt);
  }

  const existingInput = jsonObject(workflow.inputJson);
  const priorControl = jsonObject(existingInput.processingControl);
  const processingControl = {
    version: 1,
    queueObjectName,
    manifestObjectName,
    manifestGeneration: storedManifest.generation,
    bucketName: source.bucketName,
    targetObjectName,
    sourceGeneration: source.generation,
    sourceSha256: source.sha256,
    profile: canonicalManifest.target.profile,
    executionRequestedAt: text(priorControl.executionRequestedAt) || null,
    originalRemainsSourceTruth: true,
  };
  await input.prisma.studioWorkflowJob.update({
    where: { id: workflow.id },
    data: {
      status: canonicalManifest.status === "queued"
        ? "queued"
        : "processing",
      error: null,
      inputJson: {
        ...existingInput,
        processingControl,
      },
    },
  });

  if (canonicalManifest.status === "completed") {
    return {
      status: "processing",
      jobId: workflow.id,
      queueObjectName,
      manifestObjectName,
      targetObjectName,
      executionRequested: false,
    };
  }

  if (!captureProxyProcessorEnabled()) {
    return {
      status: "configuration-required",
      jobId: workflow.id,
      queueObjectName,
      manifestObjectName,
      targetObjectName,
      executionRequested: false,
    };
  }

  if (mediaProcessorExecutionRequestIsRecent(processingControl.executionRequestedAt)) {
    return {
      status: canonicalManifest.status === "processing"
        ? "processing"
        : "queued",
      jobId: workflow.id,
      queueObjectName,
      manifestObjectName,
      targetObjectName,
      executionRequested: false,
    };
  }

  await requestMediaProcessorExecution();
  const executionRequestedAt = new Date().toISOString();
  await input.prisma.studioWorkflowJob.update({
    where: { id: workflow.id },
    data: {
      inputJson: {
        ...existingInput,
        processingControl: {
          ...processingControl,
          executionRequestedAt,
        },
      },
    },
  });
  return {
    status: canonicalManifest.status === "processing"
      ? "processing"
      : "queued",
    jobId: workflow.id,
    queueObjectName,
    manifestObjectName,
    targetObjectName,
    executionRequested: true,
  };
}

function captureProxyWorkflowSource(workflow: any) {
  const row = jsonObject(workflow.inputJson);
  if (
    workflow.type !== "asset-proxy"
    || workflow.source !== "mobile-capture-finalization"
    || text(row.mediaKind) !== "video"
  ) {
    throw new CaptureProxyOutboxError(
      "Workflow is not a mobile Capture video proxy outbox.",
    );
  }
  const source = {
    projectId: requiredText(workflow.projectId, "workflow project"),
    projectSlug: requiredText(row.projectSlug, "project slug"),
    episodeSlug: requiredText(row.episodeSlug, "episode slug"),
    actorUserId: requiredText(row.actorUserId, "actor user"),
    actorEmail: requiredText(
      row.actorEmail || workflow.requestedByEmail,
      "actor email",
    ).toLowerCase(),
    captureId: requiredText(row.captureId, "capture"),
    captureGroupId: requiredText(row.captureGroupId, "capture group"),
    bucketName: requiredText(row.bucketName, "source bucket"),
    objectName: requiredText(row.objectName, "source object"),
    generation: requiredText(row.objectGeneration, "source generation"),
    sizeBytes: positiveSafeInteger(row.sourceSizeBytes, "source byte count"),
    sha256: requiredText(row.sourceSha256, "source SHA-256").toLowerCase(),
    contentType: requiredText(row.sourceContentType, "source content type"),
    rawAssetId: requiredText(workflow.assetId, "raw asset"),
    sourceId: requiredText(row.sourceId, "source"),
    recordingAssetId: requiredText(row.recordingAssetId, "recording asset"),
    uploadSessionId: requiredText(row.uploadSessionId, "upload session"),
  };
  if (
    !/^[1-9][0-9]*$/.test(source.generation)
    || !/^[0-9a-f]{64}$/.test(source.sha256)
    || !source.contentType.toLowerCase().startsWith("video/")
  ) {
    throw new CaptureProxyOutboxError(
      "Capture proxy outbox has invalid generation, digest, or video type.",
    );
  }
  return source;
}

export function captureProxyProcessorEnabled() {
  return mediaProcessorEnabled();
}

async function saveManifestIfAbsent(
  bucket: any,
  objectName: string,
  manifest: CaptureProxyManifest,
) {
  const file = bucket.file(objectName);
  try {
    await file.save(JSON.stringify(manifest), {
      resumable: false,
      validation: "crc32c",
      contentType: "application/json; charset=utf-8",
      metadata: {
        cacheControl: "private, no-store",
        metadata: {
          quipslyKind: manifest.kind,
          quipslyProxyJobId: manifest.jobId,
          quipslyRawAssetId: manifest.source.rawAssetId,
        },
      },
      preconditionOpts: { ifGenerationMatch: 0 },
    });
  } catch (error) {
    if (!isPreconditionFailure(error)) throw error;
  }
  const [metadata] = await file.getMetadata();
  const generation = requiredGeneration(metadata.generation);
  const [raw] = await bucket.file(
    objectName,
    { generation },
  ).download({ validation: "crc32c" });
  return {
    value: JSON.parse(raw.toString("utf8")) as unknown,
    generation,
  };
}

async function saveQueueIfAbsent(
  bucket: any,
  objectName: string,
  receipt: CaptureProxyQueueReceipt,
) {
  const file = bucket.file(objectName);
  try {
    await file.save(JSON.stringify(receipt), {
      resumable: false,
      validation: "crc32c",
      contentType: "application/json; charset=utf-8",
      metadata: {
        cacheControl: "private, no-store",
        metadata: {
          quipslyKind: receipt.kind,
          quipslyProxyJobId: receipt.jobId,
        },
      },
      preconditionOpts: { ifGenerationMatch: 0 },
    });
  } catch (error) {
    if (!isPreconditionFailure(error)) throw error;
    const [raw] = await file.download({ validation: "crc32c" });
    const existing = parseCaptureProxyQueueReceipt(
      JSON.parse(raw.toString("utf8")) as unknown,
    );
    if (
      existing.jobId !== receipt.jobId
      || existing.manifestObjectName !== receipt.manifestObjectName
      || existing.enqueuedAt !== receipt.enqueuedAt
    ) {
      throw new Error(
        "Existing capture proxy queue receipt has a different immutable binding.",
      );
    }
  }
}

function assertImmutableManifestBinding(
  left: CaptureProxyManifest,
  right: CaptureProxyManifest,
) {
  if (
    left.jobId !== right.jobId
    || left.projectId !== right.projectId
    || left.projectSlug !== right.projectSlug
    || left.episodeSlug !== right.episodeSlug
    || left.actorUserId !== right.actorUserId
    || left.actorEmail !== right.actorEmail
    || left.captureId !== right.captureId
    || left.captureGroupId !== right.captureGroupId
    || JSON.stringify(left.source) !== JSON.stringify(right.source)
    || JSON.stringify(left.target) !== JSON.stringify(right.target)
  ) {
    throw new Error(
      "Existing capture proxy manifest has a different immutable binding.",
    );
  }
}

function emptyStatus(
  status: "not-required" | "held",
): CaptureProxyQueueStatus {
  return {
    status,
    jobId: null,
    queueObjectName: null,
    manifestObjectName: null,
    targetObjectName: null,
    executionRequested: false,
  };
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function requiredText(value: unknown, label: string) {
  const normalized = text(value);
  if (!normalized) {
    throw new CaptureProxyOutboxError(
      `Capture proxy outbox is missing ${label}.`,
    );
  }
  return normalized;
}

function positiveSafeInteger(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new CaptureProxyOutboxError(
      `Capture proxy outbox ${label} must be a positive integer.`,
    );
  }
  return number;
}

function requiredGeneration(value: unknown) {
  const generation = String(value ?? "");
  if (!/^[1-9][0-9]*$/.test(generation)) {
    throw new Error("Capture proxy manifest is missing its GCS generation.");
  }
  return generation;
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

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
