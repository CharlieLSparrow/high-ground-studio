import "server-only";

import {
  EPISODE_COLLABORATION_PROXY_CLOUD_QUEUE_KIND,
  buildEpisodeCollaborationProxyCloudManifestObjectName,
  buildEpisodeCollaborationProxyCloudQueueObjectName,
  buildEpisodeCollaborationProxyCloudResultObjectName,
  newEpisodeCollaborationProxyCloudManifest,
  parseEpisodeCollaborationProxyCloudManifest,
  parseEpisodeCollaborationProxyCloudQueueReceipt,
  parseEpisodeCollaborationProxyJob,
  type EpisodeCollaborationProxyCloudManifest,
  type EpisodeCollaborationProxyCloudQueueReceipt,
} from "@high-ground/quipsly-media-processing";

import { getMediaBucket } from "@/lib/server/gcs";
import {
  mediaProcessorEnabled,
  mediaProcessorExecutionRequestIsRecent,
  requestMediaProcessorExecution,
} from "@/lib/server/media-processor-control";

export type EpisodeCollaborationProxyCloudQueueStatus = {
  status: "queued" | "processing" | "completed" | "configuration-required" | "failed";
  jobId: string;
  bucketName: string;
  manifestObjectName: string;
  queueObjectName: string;
  resultObjectName: string;
  targetObjectName: string;
  executionRequested: boolean;
};

export class EpisodeCollaborationProxyCloudOutboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EpisodeCollaborationProxyCloudOutboxError";
  }
}

export async function ensureEpisodeCollaborationProxyCloudQueued(input: {
  prisma: any;
  workflow: any;
}): Promise<EpisodeCollaborationProxyCloudQueueStatus> {
  const job = parseEpisodeCollaborationProxyJob(
    input.workflow.inputJson,
    input.workflow.id,
  );
  if (job.source.provider !== "gcs" || job.target.provider !== "gcs") {
    throw new EpisodeCollaborationProxyCloudOutboxError(
      "Episode cloud outbox requires an exact GCS collaboration-proxy job.",
    );
  }
  if (
    input.workflow.type !== "asset-proxy"
    || input.workflow.source !== "episode-import-media.upload"
    || input.workflow.projectId !== job.projectId
    || input.workflow.assetId !== job.source.rawAssetId
  ) {
    throw new EpisodeCollaborationProxyCloudOutboxError(
      "Episode cloud outbox no longer matches its workflow and raw asset.",
    );
  }
  const source = parseGenerationBoundGcsLocator(
    job.source.locator,
    job.source.generation,
  );
  const manifestObjectName = buildEpisodeCollaborationProxyCloudManifestObjectName(job.jobId);
  const queueObjectName = buildEpisodeCollaborationProxyCloudQueueObjectName(job.jobId);
  const resultObjectName = buildEpisodeCollaborationProxyCloudResultObjectName(job.jobId);
  const workerManifest = newEpisodeCollaborationProxyCloudManifest(job);
  const bucket = getMediaBucket(source.bucketName);
  const storedManifest = await saveManifestIfAbsent(
    bucket,
    manifestObjectName,
    workerManifest,
  );
  const canonicalManifest = parseEpisodeCollaborationProxyCloudManifest(
    storedManifest.value,
    job.jobId,
  );
  assertImmutableManifestBinding(canonicalManifest, workerManifest);

  if (canonicalManifest.status === "failed-terminal") {
    const error = [
      canonicalManifest.failure?.code || "episode-proxy-worker-failed",
      canonicalManifest.failure?.message || "Episode collaboration proxy failed terminal.",
    ].join(": ");
    await input.prisma.studioWorkflowJob.update({
      where: { id: job.jobId },
      data: {
        status: "failed",
        error,
        completedAt: new Date(
          canonicalManifest.failure?.failedAt || canonicalManifest.updatedAt,
        ),
      },
    });
    return statusFor({
      status: "failed",
      jobId: job.jobId,
      bucketName: source.bucketName,
      manifestObjectName,
      queueObjectName,
      resultObjectName,
      targetObjectName: job.target.locator,
      executionRequested: false,
    });
  }

  if (canonicalManifest.status !== "completed") {
    const queueReceipt: EpisodeCollaborationProxyCloudQueueReceipt = {
      kind: EPISODE_COLLABORATION_PROXY_CLOUD_QUEUE_KIND,
      version: 1,
      jobId: job.jobId,
      manifestObjectName,
      manifestGeneration: storedManifest.generation,
      enqueuedAt: canonicalManifest.queuedAt,
    };
    await saveQueueIfAbsent(bucket, queueObjectName, queueReceipt);
  }

  const existingInput = jsonObject(input.workflow.inputJson);
  const priorControl = jsonObject(existingInput.processingControl);
  const processingControl = {
    version: 1,
    provider: "gcs",
    bucketName: source.bucketName,
    sourceObjectName: source.objectName,
    sourceGeneration: source.generation,
    sourceSha256: job.source.sha256,
    targetObjectName: job.target.locator,
    manifestObjectName,
    manifestGeneration: storedManifest.generation,
    queueObjectName,
    resultObjectName,
    executionRequestedAt: text(priorControl.executionRequestedAt) || null,
    originalRemainsSourceTruth: true,
  };
  await input.prisma.studioWorkflowJob.update({
    where: { id: job.jobId },
    data: {
      status: canonicalManifest.status === "queued" ? "queued" : "processing",
      error: null,
      inputJson: {
        ...existingInput,
        processingControl,
      },
    },
  });

  if (canonicalManifest.status === "completed") {
    return statusFor({
      status: "completed",
      jobId: job.jobId,
      bucketName: source.bucketName,
      manifestObjectName,
      queueObjectName,
      resultObjectName,
      targetObjectName: job.target.locator,
      executionRequested: false,
    });
  }
  if (!mediaProcessorEnabled()) {
    return statusFor({
      status: "configuration-required",
      jobId: job.jobId,
      bucketName: source.bucketName,
      manifestObjectName,
      queueObjectName,
      resultObjectName,
      targetObjectName: job.target.locator,
      executionRequested: false,
    });
  }
  if (mediaProcessorExecutionRequestIsRecent(processingControl.executionRequestedAt)) {
    return statusFor({
      status: canonicalManifest.status === "processing" ? "processing" : "queued",
      jobId: job.jobId,
      bucketName: source.bucketName,
      manifestObjectName,
      queueObjectName,
      resultObjectName,
      targetObjectName: job.target.locator,
      executionRequested: false,
    });
  }

  await requestMediaProcessorExecution();
  const executionRequestedAt = new Date().toISOString();
  await input.prisma.studioWorkflowJob.update({
    where: { id: job.jobId },
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
  return statusFor({
    status: canonicalManifest.status === "processing" ? "processing" : "queued",
    jobId: job.jobId,
    bucketName: source.bucketName,
    manifestObjectName,
    queueObjectName,
    resultObjectName,
    targetObjectName: job.target.locator,
    executionRequested: true,
  });
}

function statusFor(
  value: EpisodeCollaborationProxyCloudQueueStatus,
): EpisodeCollaborationProxyCloudQueueStatus {
  return value;
}

async function saveManifestIfAbsent(
  bucket: any,
  objectName: string,
  manifest: EpisodeCollaborationProxyCloudManifest,
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
          quipslyProxyJobId: manifest.job.jobId,
          quipslyRawAssetId: manifest.job.source.rawAssetId,
        },
      },
      preconditionOpts: { ifGenerationMatch: 0 },
    });
  } catch (error) {
    if (!isPreconditionFailure(error)) throw error;
  }
  return loadJson(bucket, objectName);
}

async function saveQueueIfAbsent(
  bucket: any,
  objectName: string,
  receipt: EpisodeCollaborationProxyCloudQueueReceipt,
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
  }
  const stored = await loadJson(bucket, objectName);
  const canonical = parseEpisodeCollaborationProxyCloudQueueReceipt(stored.value);
  if (JSON.stringify(canonical) !== JSON.stringify(receipt)) {
    throw new Error("Existing episode collaboration proxy queue receipt has drifted.");
  }
}

async function loadJson(bucket: any, objectName: string) {
  const file = bucket.file(objectName);
  const [metadata] = await file.getMetadata();
  const generation = requiredGeneration(metadata.generation);
  const [raw] = await bucket.file(objectName, { generation }).download({
    validation: "crc32c",
  });
  return {
    value: JSON.parse(raw.toString("utf8")) as unknown,
    generation,
  };
}

function assertImmutableManifestBinding(
  left: EpisodeCollaborationProxyCloudManifest,
  right: EpisodeCollaborationProxyCloudManifest,
) {
  if (JSON.stringify(left.job) !== JSON.stringify(right.job)) {
    throw new Error(
      "Existing episode collaboration proxy cloud manifest has a different immutable job binding.",
    );
  }
}

function parseGenerationBoundGcsLocator(locator: string, generation: string) {
  const match = /^gcs:\/\/([a-z0-9][a-z0-9._-]{1,221}[a-z0-9])\/(.+)\?generation=([1-9][0-9]*)$/.exec(locator);
  if (
    !match
    || match[3] !== generation
    || !match[2].startsWith("media-vault/")
    || match[2].split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new EpisodeCollaborationProxyCloudOutboxError(
      "Episode cloud outbox source must be one generation-bound media-vault object.",
    );
  }
  return { bucketName: match[1], objectName: match[2], generation: match[3] };
}

function requiredGeneration(value: unknown) {
  const generation = String(value ?? "");
  if (!/^[1-9][0-9]*$/.test(generation)) {
    throw new Error("Episode proxy control object lacks an immutable generation.");
  }
  return generation;
}

function isPreconditionFailure(error: unknown) {
  const row = error as { code?: unknown; status?: unknown };
  const code = Number(row?.code ?? row?.status);
  return code === 409 || code === 412;
}

function jsonObject(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
