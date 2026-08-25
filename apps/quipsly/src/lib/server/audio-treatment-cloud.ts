import "server-only";

import {
  AUDIO_TREATMENT_CLOUD_QUEUE_KIND,
  buildAudioTreatmentCloudManifestObjectName,
  buildAudioTreatmentCloudQueueObjectName,
  buildAudioTreatmentCloudResultObjectName,
  newAudioTreatmentCloudManifest,
  parseAudioTreatmentCloudManifest,
  parseAudioTreatmentCloudQueueReceipt,
  parseAudioTreatmentJob,
  type AudioTreatmentCloudManifest,
  type AudioTreatmentCloudQueueReceipt,
} from "@high-ground/quipsly-media-processing";

import { getMediaBucket } from "@/lib/server/gcs";
import { mediaProcessorEnabled, mediaProcessorExecutionRequestIsRecent, requestMediaProcessorExecution } from "@/lib/server/media-processor-control";

export type AudioTreatmentCloudQueueStatus = {
  status: "queued" | "processing" | "completed" | "configuration-required" | "failed";
  jobId: string;
  bucketName: string;
  manifestObjectName: string;
  queueObjectName: string;
  resultObjectName: string;
  executionRequested: boolean;
};

export async function ensureAudioTreatmentCloudQueued(input: { prisma: any; processingJob: any }): Promise<AudioTreatmentCloudQueueStatus> {
  const job = parseAudioTreatmentJob(input.processingJob.inputJson, input.processingJob.id);
  if (job.source.provider !== "gcs" || job.target.provider !== "gcs") throw new Error("Audio treatment cloud outbox requires an exact GCS source.");
  if (input.processingJob.type !== "audio-treatment" || input.processingJob.projectId !== job.projectId || input.processingJob.assetId !== job.source.assetId) throw new Error("Audio treatment cloud outbox no longer matches its processing job.");
  const source = exactGcsLocation(job.source.locator, job.source.generation);
  const bucket = getMediaBucket(source.bucketName);
  const manifestObjectName = buildAudioTreatmentCloudManifestObjectName(job.jobId);
  const queueObjectName = buildAudioTreatmentCloudQueueObjectName(job.jobId);
  const resultObjectName = buildAudioTreatmentCloudResultObjectName(job.jobId);
  const desired = newAudioTreatmentCloudManifest(job);
  const storedManifest = await saveManifestIfAbsent(bucket, manifestObjectName, desired);
  const manifest = parseAudioTreatmentCloudManifest(storedManifest.value, job.jobId);
  if (JSON.stringify(manifest.job) !== JSON.stringify(desired.job)) throw new Error("Existing audio treatment manifest has a different immutable job binding.");
  if (manifest.status === "failed-terminal") {
    const failed = await input.prisma.studioAssetProcessingJob.update({ where: { id: job.jobId }, data: { status: "failed", error: `${manifest.failure?.code || "audio-treatment-worker-failed"}: ${manifest.failure?.message || "Cloud audio treatment failed terminal."}`.slice(0, 4_000), completedAt: new Date(manifest.failure?.failedAt || manifest.updatedAt) } });
    return status("failed", failed.id, source.bucketName, manifestObjectName, queueObjectName, resultObjectName, false);
  }
  if (manifest.status !== "completed") {
    await saveQueueIfAbsent(bucket, queueObjectName, { kind: AUDIO_TREATMENT_CLOUD_QUEUE_KIND, version: 1, jobId: job.jobId, manifestObjectName, manifestGeneration: storedManifest.generation, enqueuedAt: manifest.queuedAt }, desired);
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
    promotionRequiresExplicitApproval: true,
  };
  await input.prisma.studioAssetProcessingJob.update({ where: { id: job.jobId }, data: { status: manifest.status === "completed" ? "output-ready" : manifest.status === "queued" ? "queued" : "processing", error: null, inputJson: { ...inputJson, processingControl } } });
  if (manifest.status === "completed") return status("completed", job.jobId, source.bucketName, manifestObjectName, queueObjectName, resultObjectName, false);
  if (!mediaProcessorEnabled()) return status("configuration-required", job.jobId, source.bucketName, manifestObjectName, queueObjectName, resultObjectName, false);
  if (mediaProcessorExecutionRequestIsRecent(processingControl.executionRequestedAt)) return status(manifest.status === "processing" ? "processing" : "queued", job.jobId, source.bucketName, manifestObjectName, queueObjectName, resultObjectName, false);
  await requestMediaProcessorExecution();
  const executionRequestedAt = new Date().toISOString();
  await input.prisma.studioAssetProcessingJob.update({ where: { id: job.jobId }, data: { inputJson: { ...inputJson, processingControl: { ...processingControl, executionRequestedAt } } } });
  return status(manifest.status === "processing" ? "processing" : "queued", job.jobId, source.bucketName, manifestObjectName, queueObjectName, resultObjectName, true);
}

function status(state: AudioTreatmentCloudQueueStatus["status"], jobId: string, bucketName: string, manifestObjectName: string, queueObjectName: string, resultObjectName: string, executionRequested: boolean): AudioTreatmentCloudQueueStatus {
  return { status: state, jobId, bucketName, manifestObjectName, queueObjectName, resultObjectName, executionRequested };
}
async function saveManifestIfAbsent(bucket: any, objectName: string, manifest: AudioTreatmentCloudManifest) {
  try { await bucket.file(objectName).save(JSON.stringify(manifest), { resumable: false, validation: "crc32c", contentType: "application/json; charset=utf-8", metadata: { cacheControl: "private, no-store", metadata: { quipslyKind: manifest.kind, quipslyTreatmentJobId: manifest.job.jobId, quipslyAssetId: manifest.job.source.assetId } }, preconditionOpts: { ifGenerationMatch: 0 } }); }
  catch (error) { if (!precondition(error)) throw error; }
  return loadJson(bucket, objectName);
}
async function saveQueueIfAbsent(bucket: any, objectName: string, receipt: AudioTreatmentCloudQueueReceipt, desired: AudioTreatmentCloudManifest) {
  try { await bucket.file(objectName).save(JSON.stringify(receipt), { resumable: false, validation: "crc32c", contentType: "application/json; charset=utf-8", metadata: { cacheControl: "private, no-store", metadata: { quipslyKind: receipt.kind, quipslyTreatmentJobId: receipt.jobId } }, preconditionOpts: { ifGenerationMatch: 0 } }); }
  catch (error) { if (!precondition(error)) throw error; }
  const canonical = parseAudioTreatmentCloudQueueReceipt((await loadJson(bucket, objectName)).value);
  const historical = parseAudioTreatmentCloudManifest((await loadJson(bucket, canonical.manifestObjectName, canonical.manifestGeneration)).value, canonical.jobId);
  if (JSON.stringify(historical.job) !== JSON.stringify(desired.job)) throw new Error("Existing audio treatment queue receipt points at a different immutable job.");
}
async function loadJson(bucket: any, objectName: string, generation?: string) {
  const file = bucket.file(objectName, generation ? { generation } : undefined);
  const [metadata] = await file.getMetadata();
  const resolved = String(metadata.generation ?? "");
  if (!/^[1-9][0-9]*$/.test(resolved)) throw new Error("Audio treatment control object lacks an immutable generation.");
  const [raw] = await bucket.file(objectName, { generation: resolved }).download({ validation: "crc32c" });
  return { value: JSON.parse(raw.toString("utf8")) as unknown, generation: resolved };
}
function exactGcsLocation(locator: string, generation: string) {
  const match = /^gcs:\/\/([a-z0-9][a-z0-9._-]{1,221}[a-z0-9])\/(media-vault\/.+)\?generation=([1-9][0-9]*)$/.exec(locator);
  if (!match || match[3] !== generation || match[2].split("/").some((part) => !part || part === "." || part === "..")) throw new Error("Audio treatment cloud source must be one generation-bound media-vault object.");
  return { bucketName: match[1], objectName: match[2], generation: match[3] };
}
function precondition(error: unknown) { const row = error as { code?: unknown; status?: unknown }; return [409, 412].includes(Number(row.code ?? row.status)); }
function object(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
