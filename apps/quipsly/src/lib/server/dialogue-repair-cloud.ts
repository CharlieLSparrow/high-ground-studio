import "server-only";

import {
  DIALOGUE_REPAIR_CLOUD_QUEUE_KIND,
  buildDialogueRepairCloudManifestObjectName,
  buildDialogueRepairCloudQueueObjectName,
  buildDialogueRepairCloudResultObjectName,
  newDialogueRepairCloudManifest,
  parseDialogueRepairCloudManifest,
  parseDialogueRepairCloudQueueReceipt,
  parseDialogueRepairJob,
  type DialogueRepairCloudManifest,
  type DialogueRepairCloudQueueReceipt,
} from "@high-ground/quipsly-media-processing";

import { getMediaBucket } from "@/lib/server/gcs";
import {
  mediaProcessorEnabled,
  mediaProcessorExecutionRequestIsRecent,
  requestMediaProcessorExecution,
} from "@/lib/server/media-processor-control";

export type DialogueRepairCloudQueueStatus = {
  status: "queued" | "processing" | "completed" | "configuration-required" | "failed";
  jobId: string;
  bucketName: string;
  manifestObjectName: string;
  queueObjectName: string;
  resultObjectName: string;
  executionRequested: boolean;
};

export async function ensureDialogueRepairCloudQueued(input: {
  prisma: any;
  processingJob: any;
}): Promise<DialogueRepairCloudQueueStatus> {
  const job = parseDialogueRepairJob(input.processingJob.inputJson, input.processingJob.id);
  if (job.source.provider !== "gcs" || job.target.provider !== "gcs") {
    throw new Error("Dialogue Repair cloud outbox requires an exact GCS source.");
  }
  if (
    input.processingJob.type !== "dialogue-repair"
    || input.processingJob.projectId !== job.projectId
    || input.processingJob.assetId !== job.source.assetId
  ) {
    throw new Error("Dialogue Repair cloud outbox no longer matches its processing job.");
  }

  const source = exactGcsLocation(job.source.locator, job.source.generation);
  const bucket = getMediaBucket(source.bucketName);
  const manifestObjectName = buildDialogueRepairCloudManifestObjectName(job.jobId);
  const queueObjectName = buildDialogueRepairCloudQueueObjectName(job.jobId);
  const resultObjectName = buildDialogueRepairCloudResultObjectName(job.jobId);
  const desired = newDialogueRepairCloudManifest(job);
  const storedManifest = await saveManifestIfAbsent(bucket, manifestObjectName, desired);
  const manifest = parseDialogueRepairCloudManifest(storedManifest.value, job.jobId);
  if (JSON.stringify(manifest.job) !== JSON.stringify(desired.job)) {
    throw new Error("Existing Dialogue Repair manifest has a different immutable job binding.");
  }
  if (manifest.status === "failed-terminal") {
    const failed = await input.prisma.studioAssetProcessingJob.update({
      where: { id: job.jobId },
      data: {
        status: "failed",
        error: `${manifest.failure?.code || "dialogue-repair-worker-failed"}: ${manifest.failure?.message || "Cloud Dialogue Repair failed terminal."}`.slice(0, 4_000),
        completedAt: new Date(manifest.failure?.failedAt || manifest.updatedAt),
      },
    });
    return queueStatus("failed", failed.id, source.bucketName, manifestObjectName, queueObjectName, resultObjectName, false);
  }
  if (manifest.status !== "completed") {
    await saveQueueIfAbsent(bucket, queueObjectName, {
      kind: DIALOGUE_REPAIR_CLOUD_QUEUE_KIND,
      version: 1,
      jobId: job.jobId,
      manifestObjectName,
      manifestGeneration: storedManifest.generation,
      enqueuedAt: manifest.queuedAt,
    }, desired);
  }

  const inputJson = object(input.processingJob.inputJson);
  const previousControl = object(inputJson.processingControl);
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
    executionRequestedAt: text(previousControl.executionRequestedAt) || null,
    originalRemainsSourceTruth: true,
    outputIsUnpromotedExperiment: true,
    matchedAuditionRequired: true,
    promotionRequiresSeparateApproval: true,
  };
  await input.prisma.studioAssetProcessingJob.update({
    where: { id: job.jobId },
    data: {
      status: manifest.status === "queued" ? "queued" : manifest.status === "completed" ? "output-ready" : "processing",
      error: null,
      inputJson: { ...inputJson, processingControl },
    },
  });
  if (manifest.status === "completed") {
    return queueStatus("completed", job.jobId, source.bucketName, manifestObjectName, queueObjectName, resultObjectName, false);
  }
  if (!mediaProcessorEnabled()) {
    return queueStatus("configuration-required", job.jobId, source.bucketName, manifestObjectName, queueObjectName, resultObjectName, false);
  }
  if (mediaProcessorExecutionRequestIsRecent(processingControl.executionRequestedAt)) {
    return queueStatus(manifest.status === "processing" ? "processing" : "queued", job.jobId, source.bucketName, manifestObjectName, queueObjectName, resultObjectName, false);
  }
  await requestMediaProcessorExecution();
  const executionRequestedAt = new Date().toISOString();
  await input.prisma.studioAssetProcessingJob.update({
    where: { id: job.jobId },
    data: { inputJson: { ...inputJson, processingControl: { ...processingControl, executionRequestedAt } } },
  });
  return queueStatus(manifest.status === "processing" ? "processing" : "queued", job.jobId, source.bucketName, manifestObjectName, queueObjectName, resultObjectName, true);
}

function queueStatus(
  status: DialogueRepairCloudQueueStatus["status"],
  jobId: string,
  bucketName: string,
  manifestObjectName: string,
  queueObjectName: string,
  resultObjectName: string,
  executionRequested: boolean,
): DialogueRepairCloudQueueStatus {
  return { status, jobId, bucketName, manifestObjectName, queueObjectName, resultObjectName, executionRequested };
}

async function saveManifestIfAbsent(bucket: any, objectName: string, manifest: DialogueRepairCloudManifest) {
  try {
    await bucket.file(objectName).save(JSON.stringify(manifest), {
      resumable: false,
      validation: "crc32c",
      contentType: "application/json; charset=utf-8",
      metadata: {
        cacheControl: "private, no-store",
        metadata: {
          quipslyKind: manifest.kind,
          quipslyDialogueRepairJobId: manifest.job.jobId,
          quipslyAssetId: manifest.job.source.assetId,
        },
      },
      preconditionOpts: { ifGenerationMatch: 0 },
    });
  } catch (error) {
    if (!precondition(error)) throw error;
  }
  return loadJson(bucket, objectName);
}

async function saveQueueIfAbsent(
  bucket: any,
  objectName: string,
  receipt: DialogueRepairCloudQueueReceipt,
  desired: DialogueRepairCloudManifest,
) {
  try {
    await bucket.file(objectName).save(JSON.stringify(receipt), {
      resumable: false,
      validation: "crc32c",
      contentType: "application/json; charset=utf-8",
      metadata: {
        cacheControl: "private, no-store",
        metadata: { quipslyKind: receipt.kind, quipslyDialogueRepairJobId: receipt.jobId },
      },
      preconditionOpts: { ifGenerationMatch: 0 },
    });
  } catch (error) {
    if (!precondition(error)) throw error;
  }
  const canonical = parseDialogueRepairCloudQueueReceipt((await loadJson(bucket, objectName)).value);
  const historical = parseDialogueRepairCloudManifest(
    (await loadJson(bucket, canonical.manifestObjectName, canonical.manifestGeneration)).value,
    canonical.jobId,
  );
  if (JSON.stringify(historical.job) !== JSON.stringify(desired.job)) {
    throw new Error("Existing Dialogue Repair queue receipt points at a different immutable job.");
  }
}

async function loadJson(bucket: any, objectName: string, generation?: string) {
  const file = bucket.file(objectName, generation ? { generation } : undefined);
  const [metadata] = await file.getMetadata();
  const resolved = requiredGeneration(metadata.generation);
  const [raw] = await bucket.file(objectName, { generation: resolved }).download({ validation: "crc32c" });
  return { value: JSON.parse(raw.toString("utf8")) as unknown, generation: resolved };
}

function exactGcsLocation(locator: string, generation: string) {
  const match = /^gcs:\/\/([a-z0-9][a-z0-9._-]{1,221}[a-z0-9])\/(media-vault\/.+)\?generation=([1-9][0-9]*)$/.exec(locator);
  if (!match || match[3] !== generation || match[2].split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("Dialogue Repair cloud source must be one generation-bound media-vault object.");
  }
  return { bucketName: match[1], objectName: match[2], generation: match[3] };
}

function requiredGeneration(value: unknown) {
  const generation = String(value ?? "");
  if (!/^[1-9][0-9]*$/.test(generation)) throw new Error("Dialogue Repair control object lacks an immutable generation.");
  return generation;
}
function precondition(error: unknown) { const row = error as { code?: unknown; status?: unknown }; return [409, 412].includes(Number(row.code ?? row.status)); }
function object(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
