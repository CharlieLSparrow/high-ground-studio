import "server-only";

import {
  AUDIO_SPECTRAL_CLOUD_QUEUE_KIND,
  buildAudioSpectralCloudManifestObjectName,
  buildAudioSpectralCloudQueueObjectName,
  buildAudioSpectralCloudResultObjectName,
  buildAudioSpectralPackObjectName,
  newAudioSpectralCloudManifest,
  parseAudioSpectralCloudManifest,
  parseAudioSpectralCloudQueueReceipt,
  parseAudioSpectralEvidenceJob,
  type AudioSpectralCloudManifest,
  type AudioSpectralCloudQueueReceipt,
} from "@high-ground/quipsly-media-processing";

import { getMediaBucket } from "@/lib/server/gcs";
import { mediaProcessorEnabled, mediaProcessorExecutionRequestIsRecent, requestMediaProcessorExecution } from "@/lib/server/media-processor-control";

export type AudioSpectralCloudQueueStatus = {
  status: "queued" | "processing" | "completed" | "configuration-required" | "failed";
  jobId: string;
  bucketName: string;
  manifestObjectName: string;
  queueObjectName: string;
  resultObjectName: string;
  packObjectName: string;
  executionRequested: boolean;
};

export async function ensureAudioSpectralCloudQueued(input: { prisma: any; processingJob: any }): Promise<AudioSpectralCloudQueueStatus> {
  const job = parseAudioSpectralEvidenceJob(input.processingJob.inputJson, input.processingJob.id);
  if (job.source.provider !== "gcs") throw new Error("Audio spectral cloud outbox requires an exact GCS source.");
  if (input.processingJob.type !== "audio-spectral-evidence" || input.processingJob.projectId !== job.projectId || input.processingJob.assetId !== job.source.assetId) throw new Error("Audio spectral cloud outbox no longer matches its processing job.");
  const source = gcsLocation(job.source.locator, job.source.generation);
  const bucket = getMediaBucket(source.bucketName);
  const manifestObjectName = buildAudioSpectralCloudManifestObjectName(job.jobId);
  const queueObjectName = buildAudioSpectralCloudQueueObjectName(job.jobId);
  const resultObjectName = buildAudioSpectralCloudResultObjectName(job.jobId);
  const packObjectName = buildAudioSpectralPackObjectName({ assetId: job.source.assetId, sourceSha256: job.source.sha256 });
  const desired = newAudioSpectralCloudManifest(job);
  const storedManifest = await saveManifestIfAbsent(bucket, manifestObjectName, desired);
  const manifest = parseAudioSpectralCloudManifest(storedManifest.value, job.jobId);
  if (JSON.stringify(manifest.job) !== JSON.stringify(desired.job)) throw new Error("Existing audio spectral manifest has a different immutable job binding.");
  if (manifest.status === "failed-terminal") {
    await input.prisma.studioAssetProcessingJob.update({ where: { id: job.jobId }, data: { status: "failed", error: `${manifest.failure?.code || "audio-spectral-worker-failed"}: ${manifest.failure?.message || "Cloud audio spectral analysis failed terminal."}`.slice(0, 4_000), completedAt: new Date(manifest.failure?.failedAt || manifest.updatedAt) } });
    return status("failed", job.jobId, source.bucketName, manifestObjectName, queueObjectName, resultObjectName, packObjectName, false);
  }
  if (manifest.status !== "completed") await saveQueueIfAbsent(bucket, queueObjectName, { kind: AUDIO_SPECTRAL_CLOUD_QUEUE_KIND, version: 1, jobId: job.jobId, manifestObjectName, manifestGeneration: storedManifest.generation, enqueuedAt: manifest.queuedAt }, desired);
  const inputJson = object(input.processingJob.inputJson);
  const previousControl = object(inputJson.processingControl);
  const processingControl = {
    version: 1,
    provider: "gcs",
    bucketName: source.bucketName,
    sourceObjectName: source.objectName,
    sourceGeneration: source.generation,
    sourceSha256: job.source.sha256,
    manifestObjectName,
    manifestGeneration: storedManifest.generation,
    queueObjectName,
    resultObjectName,
    packObjectName,
    executionRequestedAt: text(previousControl.executionRequestedAt) || null,
    originalRemainsSourceTruth: true,
    analysisDoesNotChangeMedia: true,
  };
  await input.prisma.studioAssetProcessingJob.update({ where: { id: job.jobId }, data: { status: manifest.status === "completed" ? "output-ready" : manifest.status === "queued" ? "queued" : "processing", error: null, inputJson: { ...inputJson, processingControl } } });
  if (manifest.status === "completed") return status("completed", job.jobId, source.bucketName, manifestObjectName, queueObjectName, resultObjectName, packObjectName, false);
  if (!mediaProcessorEnabled()) return status("configuration-required", job.jobId, source.bucketName, manifestObjectName, queueObjectName, resultObjectName, packObjectName, false);
  if (mediaProcessorExecutionRequestIsRecent(processingControl.executionRequestedAt)) return status(manifest.status === "processing" ? "processing" : "queued", job.jobId, source.bucketName, manifestObjectName, queueObjectName, resultObjectName, packObjectName, false);
  await requestMediaProcessorExecution();
  const executionRequestedAt = new Date().toISOString();
  await input.prisma.studioAssetProcessingJob.update({ where: { id: job.jobId }, data: { inputJson: { ...inputJson, processingControl: { ...processingControl, executionRequestedAt } } } });
  return status(manifest.status === "processing" ? "processing" : "queued", job.jobId, source.bucketName, manifestObjectName, queueObjectName, resultObjectName, packObjectName, true);
}

function status(state: AudioSpectralCloudQueueStatus["status"], jobId: string, bucketName: string, manifestObjectName: string, queueObjectName: string, resultObjectName: string, packObjectName: string, executionRequested: boolean): AudioSpectralCloudQueueStatus { return { status: state, jobId, bucketName, manifestObjectName, queueObjectName, resultObjectName, packObjectName, executionRequested }; }
async function saveManifestIfAbsent(bucket: any, objectName: string, manifest: AudioSpectralCloudManifest) { try { await bucket.file(objectName).save(JSON.stringify(manifest), { resumable: false, validation: "crc32c", contentType: "application/json; charset=utf-8", metadata: { cacheControl: "private, no-store", metadata: { quipslyKind: manifest.kind, quipslySpectralJobId: manifest.job.jobId, quipslyAssetId: manifest.job.source.assetId } }, preconditionOpts: { ifGenerationMatch: 0 } }); } catch (error) { if (!precondition(error)) throw error; } return loadJson(bucket, objectName); }
async function saveQueueIfAbsent(bucket: any, objectName: string, receipt: AudioSpectralCloudQueueReceipt, desired: AudioSpectralCloudManifest) { try { await bucket.file(objectName).save(JSON.stringify(receipt), { resumable: false, validation: "crc32c", contentType: "application/json; charset=utf-8", metadata: { cacheControl: "private, no-store", metadata: { quipslyKind: receipt.kind, quipslySpectralJobId: receipt.jobId } }, preconditionOpts: { ifGenerationMatch: 0 } }); } catch (error) { if (!precondition(error)) throw error; } const canonical = parseAudioSpectralCloudQueueReceipt((await loadJson(bucket, objectName)).value); const historical = parseAudioSpectralCloudManifest((await loadJson(bucket, canonical.manifestObjectName, canonical.manifestGeneration)).value, canonical.jobId); if (JSON.stringify(historical.job) !== JSON.stringify(desired.job)) throw new Error("Existing audio spectral queue receipt points at a different immutable job."); }
export async function loadAudioSpectralCloudJsonIfPresent(bucket: any, objectName: string) { try { return await loadJson(bucket, objectName); } catch (error) { if (Number((error as { code?: unknown }).code) === 404) return null; throw error; } }
async function loadJson(bucket: any, objectName: string, generation?: string) { const file = bucket.file(objectName, generation ? { generation } : undefined); const [metadata] = await file.getMetadata(); const resolved = requiredGeneration(metadata.generation); const [raw] = await bucket.file(objectName, { generation: resolved }).download({ validation: "crc32c" }); return { value: JSON.parse(raw.toString("utf8")) as unknown, generation: resolved }; }
function gcsLocation(locator: string, generation: string) { const match = /^gcs:\/\/([a-z0-9][a-z0-9._-]{1,221}[a-z0-9])\/(media-vault\/.+)\?generation=([1-9][0-9]*)$/.exec(locator); if (!match || match[3] !== generation || match[2].split("/").some((part) => !part || part === "." || part === "..")) throw new Error("Audio spectral source must be one generation-bound media-vault object."); return { bucketName: match[1], objectName: match[2], generation: match[3] }; }
function requiredGeneration(value: unknown) { const generation = String(value ?? ""); if (!/^[1-9][0-9]*$/.test(generation)) throw new Error("Audio spectral control object lacks an immutable generation."); return generation; }
function precondition(error: unknown) { const row = error as { code?: unknown; status?: unknown }; return [409, 412].includes(Number(row.code ?? row.status)); }
function object(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
