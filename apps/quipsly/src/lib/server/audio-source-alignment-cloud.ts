import "server-only";

import {
  AUDIO_ALIGNMENT_CLOUD_QUEUE_KIND,
  buildAudioAlignmentCloudManifestObjectName,
  buildAudioAlignmentCloudQueueObjectName,
  buildAudioAlignmentCloudResultObjectName,
  newAudioAlignmentCloudManifest,
  parseAudioAlignmentCloudManifest,
  parseAudioAlignmentCloudQueueReceipt,
  parseAudioAlignmentJob,
  type AudioAlignmentCloudManifest,
  type AudioAlignmentCloudQueueReceipt,
} from "@high-ground/quipsly-media-processing";

import { getMediaBucket } from "@/lib/server/gcs";
import {
  mediaProcessorEnabled,
  mediaProcessorExecutionRequestIsRecent,
  requestMediaProcessorExecution,
} from "@/lib/server/media-processor-control";

export type AudioAlignmentCloudQueueStatus = {
  status: "queued" | "processing" | "completed" | "configuration-required" | "failed";
  jobId: string;
  bucketName: string;
  manifestObjectName: string;
  queueObjectName: string;
  resultObjectName: string;
  executionRequested: boolean;
};

export async function ensureAudioSourceAlignmentCloudQueued(input: { prisma: any; processingJob: any }): Promise<AudioAlignmentCloudQueueStatus> {
  const job = parseAudioAlignmentJob(input.processingJob.inputJson, input.processingJob.id);
  if (job.spine.provider !== "gcs" || job.target.provider !== "gcs") throw new Error("Audio alignment cloud outbox requires two exact GCS sources.");
  if (input.processingJob.type !== "audio-alignment" || input.processingJob.projectId !== job.projectId || input.processingJob.assetId !== job.target.assetId) {
    throw new Error("Audio alignment cloud outbox no longer matches its processing job.");
  }
  const spine = gcsLocation(job.spine.locator, job.spine.generation);
  const target = gcsLocation(job.target.locator, job.target.generation);
  if (spine.bucketName !== target.bucketName) throw new Error("Audio alignment cloud sources must use one processor control bucket.");
  const bucket = getMediaBucket(spine.bucketName);
  const manifestObjectName = buildAudioAlignmentCloudManifestObjectName(job.jobId);
  const queueObjectName = buildAudioAlignmentCloudQueueObjectName(job.jobId);
  const resultObjectName = buildAudioAlignmentCloudResultObjectName(job.jobId);
  const desired = newAudioAlignmentCloudManifest(job);
  const storedManifest = await saveManifestIfAbsent(bucket, manifestObjectName, desired);
  const manifest = parseAudioAlignmentCloudManifest(storedManifest.value, job.jobId);
  if (JSON.stringify(manifest.job) !== JSON.stringify(desired.job)) throw new Error("Existing alignment manifest has a different immutable job binding.");
  if (manifest.status === "failed-terminal") {
    const failed = await input.prisma.studioAssetProcessingJob.update({
      where: { id: job.jobId },
      data: {
        status: "failed",
        error: `${manifest.failure?.code || "audio-alignment-worker-failed"}: ${manifest.failure?.message || "Cloud alignment failed terminal."}`.slice(0, 4_000),
        completedAt: new Date(manifest.failure?.failedAt || manifest.updatedAt),
      },
    });
    return status("failed", failed.id, spine.bucketName, manifestObjectName, queueObjectName, resultObjectName, false);
  }
  if (manifest.status !== "completed") {
    const receipt: AudioAlignmentCloudQueueReceipt = {
      kind: AUDIO_ALIGNMENT_CLOUD_QUEUE_KIND,
      version: 1,
      jobId: job.jobId,
      manifestObjectName,
      manifestGeneration: storedManifest.generation,
      enqueuedAt: manifest.queuedAt,
    };
    await saveQueueIfAbsent(bucket, queueObjectName, receipt, desired);
  }
  const inputJson = object(input.processingJob.inputJson);
  const previousControl = object(inputJson.processingControl);
  const processingControl = {
    version: 1,
    provider: "gcs",
    bucketName: spine.bucketName,
    spineObjectName: spine.objectName,
    spineGeneration: spine.generation,
    spineSha256: job.spine.sha256,
    targetObjectName: target.objectName,
    targetGeneration: target.generation,
    targetSha256: job.target.sha256,
    manifestObjectName,
    manifestGeneration: storedManifest.generation,
    queueObjectName,
    resultObjectName,
    executionRequestedAt: text(previousControl.executionRequestedAt) || null,
    sourceBytesImmutable: true,
    outputIsEvidenceOnly: true,
  };
  await input.prisma.studioAssetProcessingJob.update({
    where: { id: job.jobId },
    data: {
      status: manifest.status === "queued" ? "queued" : "processing",
      error: null,
      inputJson: { ...inputJson, processingControl },
    },
  });
  if (manifest.status === "completed") return status("completed", job.jobId, spine.bucketName, manifestObjectName, queueObjectName, resultObjectName, false);
  if (!mediaProcessorEnabled()) return status("configuration-required", job.jobId, spine.bucketName, manifestObjectName, queueObjectName, resultObjectName, false);
  if (mediaProcessorExecutionRequestIsRecent(processingControl.executionRequestedAt)) {
    return status(manifest.status === "processing" ? "processing" : "queued", job.jobId, spine.bucketName, manifestObjectName, queueObjectName, resultObjectName, false);
  }
  await requestMediaProcessorExecution();
  const executionRequestedAt = new Date().toISOString();
  await input.prisma.studioAssetProcessingJob.update({
    where: { id: job.jobId },
    data: { inputJson: { ...inputJson, processingControl: { ...processingControl, executionRequestedAt } } },
  });
  return status(manifest.status === "processing" ? "processing" : "queued", job.jobId, spine.bucketName, manifestObjectName, queueObjectName, resultObjectName, true);
}

function status(
  state: AudioAlignmentCloudQueueStatus["status"],
  jobId: string,
  bucketName: string,
  manifestObjectName: string,
  queueObjectName: string,
  resultObjectName: string,
  executionRequested: boolean,
): AudioAlignmentCloudQueueStatus {
  return { status: state, jobId, bucketName, manifestObjectName, queueObjectName, resultObjectName, executionRequested };
}
async function saveManifestIfAbsent(bucket: any, objectName: string, manifest: AudioAlignmentCloudManifest) {
  try {
    await bucket.file(objectName).save(JSON.stringify(manifest), {
      resumable: false,
      validation: "crc32c",
      contentType: "application/json; charset=utf-8",
      metadata: { cacheControl: "private, no-store", metadata: { quipslyKind: manifest.kind, quipslyAlignmentJobId: manifest.job.jobId, quipslyTargetAssetId: manifest.job.target.assetId } },
      preconditionOpts: { ifGenerationMatch: 0 },
    });
  } catch (error) { if (!precondition(error)) throw error; }
  return loadJson(bucket, objectName);
}
async function saveQueueIfAbsent(bucket: any, objectName: string, receipt: AudioAlignmentCloudQueueReceipt, desired: AudioAlignmentCloudManifest) {
  try {
    await bucket.file(objectName).save(JSON.stringify(receipt), {
      resumable: false,
      validation: "crc32c",
      contentType: "application/json; charset=utf-8",
      metadata: { cacheControl: "private, no-store", metadata: { quipslyKind: receipt.kind, quipslyAlignmentJobId: receipt.jobId } },
      preconditionOpts: { ifGenerationMatch: 0 },
    });
  } catch (error) { if (!precondition(error)) throw error; }
  const canonical = parseAudioAlignmentCloudQueueReceipt((await loadJson(bucket, objectName)).value);
  const historical = parseAudioAlignmentCloudManifest((await loadJson(bucket, canonical.manifestObjectName, canonical.manifestGeneration)).value, canonical.jobId);
  if (JSON.stringify(historical.job) !== JSON.stringify(desired.job)) throw new Error("Existing alignment queue receipt points at a different immutable job.");
}
async function loadJson(bucket: any, objectName: string, generation?: string) {
  const file = bucket.file(objectName, generation ? { generation } : undefined);
  const [metadata] = await file.getMetadata();
  const resolved = requiredGeneration(metadata.generation);
  const [raw] = await bucket.file(objectName, { generation: resolved }).download({ validation: "crc32c" });
  return { value: JSON.parse(raw.toString("utf8")) as unknown, generation: resolved };
}
function gcsLocation(locator: string, generation: string) {
  const match = /^gcs:\/\/([a-z0-9][a-z0-9._-]{1,221}[a-z0-9])\/(media-vault\/.+)\?generation=([1-9][0-9]*)$/.exec(locator);
  if (!match || match[3] !== generation || match[2].split("/").some((part) => !part || part === "." || part === "..")) throw new Error("Audio alignment cloud source must be one generation-bound media-vault object.");
  return { bucketName: match[1], objectName: match[2], generation: match[3] };
}
function requiredGeneration(value: unknown) { const generation = String(value ?? ""); if (!/^[1-9][0-9]*$/.test(generation)) throw new Error("Alignment control object lacks an immutable generation."); return generation; }
function precondition(error: unknown) { const row = error as { code?: unknown; status?: unknown }; return [409, 412].includes(Number(row.code ?? row.status)); }
function object(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
