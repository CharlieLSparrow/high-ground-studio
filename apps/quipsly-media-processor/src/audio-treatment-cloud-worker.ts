import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  AUDIO_TREATMENT_CLOUD_QUEUE_PREFIX,
  AUDIO_TREATMENT_RESULT_KIND,
  AUDIO_TREATMENT_VERSION,
  buildAudioTreatmentCloudDeadLetterObjectName,
  buildAudioTreatmentCloudManifestObjectName,
  buildAudioTreatmentCloudQueueObjectName,
  buildAudioTreatmentCloudResultObjectName,
  claimAudioTreatmentCloudManifest,
  completeAudioTreatmentCloudManifest,
  failAudioTreatmentCloudManifest,
  newAudioTreatmentProposal,
  parseAudioTreatmentCloudManifest,
  parseAudioTreatmentCloudQueueReceipt,
  parseAudioTreatmentResult,
  releaseAudioTreatmentCloudLease,
  type AudioMasterySourceBinding,
  type AudioTreatmentCloudManifest,
  type AudioTreatmentResult,
} from "@high-ground/quipsly-media-processing";

import { FfmpegAudioMasteringEngine } from "./audio-mastering-ffmpeg.js";
import { ProxyTranscodeError } from "./transcoder.js";
import type { CaptureProxyWorkerOptions, CaptureProxyWorkerStorage, ObjectEvidence, QueueObject, StoredJson } from "./worker.js";

type AudioTreatmentCloudEngine = Pick<FfmpegAudioMasteringEngine, "measure" | "diagnose" | "renderTreatmentExperiment">;
export type AudioTreatmentCloudWorkerResult =
  | { disposition: "completed"; jobId: string; outputGeneration: string }
  | { disposition: "already-complete"; jobId: string }
  | { disposition: "terminal"; jobId: string; code: string }
  | { disposition: "busy"; jobId: string }
  | { disposition: "claim-lost"; jobId: string };

class TerminalCloudAudioTreatmentError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = "TerminalCloudAudioTreatmentError"; }
}

export async function runAudioTreatmentCloudWorker(
  storage: CaptureProxyWorkerStorage,
  engine: AudioTreatmentCloudEngine,
  options: CaptureProxyWorkerOptions,
  limit: number,
) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) throw new Error("Audio treatment cloud worker limit must be between 1 and 20.");
  const queue = await storage.listQueueObjectsUnder(`${AUDIO_TREATMENT_CLOUD_QUEUE_PREFIX}/`, limit);
  const results: AudioTreatmentCloudWorkerResult[] = [];
  const retries: Error[] = [];
  for (const object of queue) {
    try { results.push(await processAudioTreatmentCloudQueueObject(storage, engine, options, object)); }
    catch (error) { retries.push(error instanceof Error ? error : new Error("Unknown cloud audio treatment failure.")); }
  }
  if (retries.length) throw new AggregateError(retries, `${retries.length} audio treatment cloud job(s) need retry.`);
  return results;
}

export async function processAudioTreatmentCloudQueueObject(
  storage: CaptureProxyWorkerStorage,
  engine: AudioTreatmentCloudEngine,
  options: CaptureProxyWorkerOptions,
  queueObject: QueueObject,
): Promise<AudioTreatmentCloudWorkerResult> {
  let receipt;
  try { receipt = parseAudioTreatmentCloudQueueReceipt((await storage.loadJson(queueObject.name, queueObject.generation)).value); }
  catch (error) { return quarantine(storage, queueObject, fallbackJobId(queueObject.name), "audio-treatment-queue-invalid", detail(error), options.now()); }
  if (queueObject.name !== buildAudioTreatmentCloudQueueObjectName(receipt.jobId)) {
    return quarantine(storage, queueObject, receipt.jobId, "audio-treatment-queue-path-mismatch", "Audio treatment queue path does not match its job.", options.now());
  }

  let storedManifest: StoredJson;
  let manifest: AudioTreatmentCloudManifest;
  try {
    storedManifest = await storage.loadJson(receipt.manifestObjectName);
    manifest = parseAudioTreatmentCloudManifest(storedManifest.value, receipt.jobId);
    if (manifest.status === "queued" && storedManifest.generation !== receipt.manifestGeneration) throw new Error("Queued audio treatment manifest generation no longer matches its receipt.");
  } catch (error) {
    return quarantine(storage, queueObject, receipt.jobId, "audio-treatment-manifest-invalid", detail(error), options.now());
  }
  if (manifest.status === "completed") {
    parseAudioTreatmentResult((await storage.loadJson(buildAudioTreatmentCloudResultObjectName(manifest.job.jobId))).value, manifest.job);
    await storage.deleteObject(queueObject.name, queueObject.generation);
    return { disposition: "already-complete", jobId: manifest.job.jobId };
  }
  if (manifest.status === "failed-terminal") {
    await deadLetter(storage, queueObject, manifest);
    return { disposition: "terminal", jobId: manifest.job.jobId, code: manifest.failure!.code };
  }

  const leaseId = randomUUID();
  const claimed = claimAudioTreatmentCloudManifest({ manifest, leaseId, executionId: options.executionId, now: options.now(), leaseDurationMs: options.leaseDurationMs });
  if (!claimed) return { disposition: "busy", jobId: manifest.job.jobId };
  try {
    storedManifest = await storage.saveJson(receipt.manifestObjectName, claimed, storedManifest.generation);
    manifest = parseAudioTreatmentCloudManifest(storedManifest.value, receipt.jobId);
  } catch (error) {
    if (precondition(error)) return { disposition: "claim-lost", jobId: manifest.job.jobId };
    throw error;
  }

  const scratch = await mkdtemp(path.join(tmpdir(), "quipsly-audio-treatment-cloud-"));
  try {
    const sourceLocation = exactGcsLocation(manifest.job.source.locator, manifest.job.source.generation);
    const sourcePath = path.join(scratch, "source");
    const outputPath = path.join(scratch, "treatment.wav");
    const storedOutputPath = path.join(scratch, "stored-treatment.wav");
    assertSource(manifest, sourceLocation.bucketName, await storage.objectEvidence(sourceLocation.objectName, sourceLocation.generation));
    const materialized = await storage.materializeObject(sourceLocation.objectName, sourceLocation.generation, sourcePath);
    if (materialized.sha256 !== manifest.job.source.sha256 || materialized.sizeBytes !== manifest.job.source.sizeBytes) {
      throw new TerminalCloudAudioTreatmentError("audio-treatment-source-byte-mismatch", "Materialized treatment source failed its immutable byte receipt.");
    }
    const sourceMeasurement = await engine.measure(sourcePath, {
      source: manifest.job.source,
      profileId: "apple-podcasts-dialogue-v1",
      measurementId: `measurement_${randomUUID().replaceAll("-", "")}`,
      measuredAt: options.now().toISOString(),
    });
    const sourceDiagnosis = await engine.diagnose(sourcePath, {
      source: manifest.job.source,
      diagnosisId: manifest.job.triggerDiagnosisId,
      analyzedAt: options.now().toISOString(),
    });
    const proposal = newAudioTreatmentProposal({
      proposalId: `proposal_${randomUUID().replaceAll("-", "")}`,
      createdAt: options.now().toISOString(),
      diagnosis: sourceDiagnosis,
    });
    const rendered = await engine.renderTreatmentExperiment(sourcePath, outputPath, { proposal, diagnosis: sourceDiagnosis });
    const outputEvidence = await storage.uploadProxy(outputPath, manifest.job.target.locator, "audio/wav", outputMetadata(manifest, rendered.sha256, rendered.sizeBytes));
    const outputSha256 = assertOutput(manifest, outputEvidence, sourceLocation.bucketName);
    const materializedOutput = await storage.materializeObject(outputEvidence.objectName, outputEvidence.generation, storedOutputPath);
    if (
      materializedOutput.sha256 !== outputSha256
      || materializedOutput.sizeBytes !== outputEvidence.sizeBytes
      || materializedOutput.sha256 !== rendered.sha256
      || materializedOutput.sizeBytes !== rendered.sizeBytes
    ) throw new TerminalCloudAudioTreatmentError("audio-treatment-output-byte-mismatch", "Stored audio treatment preview failed exact-generation readback.");

    const outputSource: AudioMasterySourceBinding = {
      assetId: manifest.job.source.assetId,
      provider: "gcs",
      locator: `gcs://${outputEvidence.bucketName}/${outputEvidence.objectName}?generation=${outputEvidence.generation}`,
      generation: outputEvidence.generation,
      sha256: outputSha256,
      sizeBytes: outputEvidence.sizeBytes,
      contentType: "audio/wav",
    };
    const outputMeasurement = await engine.measure(storedOutputPath, {
      source: outputSource,
      profileId: "apple-podcasts-dialogue-v1",
      measurementId: `measurement_${randomUUID().replaceAll("-", "")}`,
      measuredAt: options.now().toISOString(),
    });
    const outputDiagnosis = await engine.diagnose(storedOutputPath, {
      source: outputSource,
      diagnosisId: `diagnosis_${randomUUID().replaceAll("-", "")}`,
      analyzedAt: options.now().toISOString(),
    });
    const before = maximumAbsoluteDc(sourceDiagnosis);
    const after = maximumAbsoluteDc(outputDiagnosis);
    const durationDeltaSeconds = round(Math.abs(sourceDiagnosis.durationSeconds - outputDiagnosis.durationSeconds), 6);
    const relativeReduction = before > 0 ? 1 - after / before : 0;
    if (
      after > 0.005
      || relativeReduction < 0.75
      || durationDeltaSeconds > 0.05
      || !outputDiagnosis.analyzer.completeDecode
      || outputDiagnosis.channelCount !== sourceDiagnosis.channelCount
    ) throw new TerminalCloudAudioTreatmentError("audio-treatment-verification-failed", "Cloud audio treatment failed DC reduction, duration, channel, or complete-decode verification.");

    const result = parseAudioTreatmentResult({
      kind: AUDIO_TREATMENT_RESULT_KIND,
      version: AUDIO_TREATMENT_VERSION,
      jobId: manifest.job.jobId,
      completedAt: options.now().toISOString(),
      source: manifest.job.source,
      sourceMeasurement,
      sourceDiagnosis,
      proposal,
      derivative: {
        provider: "gcs",
        locator: outputSource.locator,
        generation: outputSource.generation,
        sha256: outputSource.sha256,
        sizeBytes: outputSource.sizeBytes,
        contentType: "audio/wav",
        codec: "pcm_s24le",
        sampleRateHz: 48_000,
        variantKind: "audio-treatment-preview",
        measurement: outputMeasurement,
        diagnosis: outputDiagnosis,
      },
      verification: {
        maximumAbsoluteDcBefore: before,
        maximumAbsoluteDcAfter: after,
        requiredMaximumAbsoluteDcAfter: 0.005,
        requiredRelativeReduction: 0.75,
        durationDeltaSeconds,
        sourceBytesPreserved: true,
        completeOutputDecode: true,
        passes: true,
      },
      worker: { executionId: options.executionId, buildId: options.buildId, imageDigest: options.imageDigest, attempt: manifest.lease!.attempt },
      boundaries: { originalRemainsSourceTruth: true, outputIsUnpromotedExperiment: true, outputIsNotAMasteredDeliveryFile: true, promotionRequiresExplicitApproval: true },
    }, manifest.job);
    const storedResult = await storage.saveJsonIfAbsent(buildAudioTreatmentCloudResultObjectName(manifest.job.jobId), result);
    const canonical = parseAudioTreatmentResult(storedResult.value, manifest.job);
    const latest = await storage.loadJson(receipt.manifestObjectName);
    const completed = completeAudioTreatmentCloudManifest({ manifest: parseAudioTreatmentCloudManifest(latest.value, manifest.job.jobId), leaseId, result: canonical, now: options.now() });
    await storage.saveJson(receipt.manifestObjectName, completed, latest.generation);
    await storage.deleteObject(queueObject.name, queueObject.generation);
    return { disposition: "completed", jobId: manifest.job.jobId, outputGeneration: outputEvidence.generation };
  } catch (error) {
    const terminal = error instanceof TerminalCloudAudioTreatmentError || (error instanceof ProxyTranscodeError && !error.retryable);
    if (terminal) {
      const normalized = error instanceof TerminalCloudAudioTreatmentError ? error : new TerminalCloudAudioTreatmentError(error.code, error.message);
      const failed = await terminalFailure(storage, receipt.manifestObjectName, manifest.job.jobId, leaseId, normalized, options.now());
      await deadLetter(storage, queueObject, failed);
      return { disposition: "terminal", jobId: manifest.job.jobId, code: normalized.code };
    }
    await releaseLease(storage, receipt.manifestObjectName, manifest.job.jobId, leaseId, options.now());
    throw error;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

function assertSource(manifest: AudioTreatmentCloudManifest, bucketName: string, evidence: ObjectEvidence | null) {
  if (!evidence || evidence.bucketName !== bucketName || evidence.generation !== manifest.job.source.generation || evidence.sizeBytes !== manifest.job.source.sizeBytes || evidence.contentType !== manifest.job.source.contentType) {
    throw new TerminalCloudAudioTreatmentError("audio-treatment-source-generation-mismatch", "Cloud source generation evidence no longer matches its treatment binding.");
  }
}
function assertOutput(manifest: AudioTreatmentCloudManifest, evidence: ObjectEvidence, bucketName: string) {
  const metadata = evidence.customMetadata;
  if (
    evidence.bucketName !== bucketName
    || evidence.objectName !== manifest.job.target.locator
    || evidence.contentType !== "audio/wav"
    || metadata.quipslyKind !== "audio-treatment-preview-v1"
    || metadata.quipslyTreatmentJobId !== manifest.job.jobId
    || metadata.quipslySourceGeneration !== manifest.job.source.generation
    || metadata.quipslySourceSha256 !== manifest.job.source.sha256
    || metadata.quipslyTriggerDiagnosisId !== manifest.job.triggerDiagnosisId
    || metadata.quipslyOutputSizeBytes !== String(evidence.sizeBytes)
    || !/^[0-9a-f]{64}$/.test(metadata.quipslyOutputSha256 || "")
    || metadata.quipslyOriginalRemainsSourceTruth !== "true"
    || metadata.quipslyPromotionRequiresExplicitApproval !== "true"
  ) throw new TerminalCloudAudioTreatmentError("audio-treatment-output-receipt-invalid", "Cloud audio treatment preview no longer matches its create-once object receipt.");
  return metadata.quipslyOutputSha256;
}
function outputMetadata(manifest: AudioTreatmentCloudManifest, sha256: string, sizeBytes: number) {
  return {
    quipslyKind: "audio-treatment-preview-v1",
    quipslyTreatmentJobId: manifest.job.jobId,
    quipslyProjectId: manifest.job.projectId,
    quipslyAssetId: manifest.job.source.assetId,
    quipslySourceGeneration: manifest.job.source.generation,
    quipslySourceSha256: manifest.job.source.sha256,
    quipslyTriggerDiagnosisId: manifest.job.triggerDiagnosisId,
    quipslyOutputSha256: sha256,
    quipslyOutputSizeBytes: String(sizeBytes),
    quipslyOriginalRemainsSourceTruth: "true",
    quipslyOutputIsUnpromotedExperiment: "true",
    quipslyPromotionRequiresExplicitApproval: "true",
  };
}
async function terminalFailure(storage: CaptureProxyWorkerStorage, objectName: string, jobId: string, leaseId: string, error: TerminalCloudAudioTreatmentError, now: Date) {
  const latest = await storage.loadJson(objectName);
  const failed = failAudioTreatmentCloudManifest({ manifest: parseAudioTreatmentCloudManifest(latest.value, jobId), leaseId, code: error.code, message: error.message, now });
  return parseAudioTreatmentCloudManifest((await storage.saveJson(objectName, failed, latest.generation)).value, jobId);
}
async function releaseLease(storage: CaptureProxyWorkerStorage, objectName: string, jobId: string, leaseId: string, now: Date) {
  try {
    const latest = await storage.loadJson(objectName);
    const manifest = parseAudioTreatmentCloudManifest(latest.value, jobId);
    if (manifest.status !== "processing" || manifest.lease?.id !== leaseId) return;
    await storage.saveJson(objectName, releaseAudioTreatmentCloudLease({ manifest, leaseId, now }), latest.generation);
  } catch { /* A different generation owns retry. */ }
}
async function quarantine(storage: CaptureProxyWorkerStorage, queue: QueueObject, jobId: string, code: string, message: string, now: Date): Promise<AudioTreatmentCloudWorkerResult> {
  await storage.writeDeadLetter(buildAudioTreatmentCloudDeadLetterObjectName(jobId), { kind: "quipsly-audio-treatment-cloud-dead-letter-v1", version: 1, jobId, code, message, failedAt: now.toISOString() }, queue.generation);
  await storage.deleteObject(queue.name, queue.generation);
  return { disposition: "terminal", jobId, code };
}
async function deadLetter(storage: CaptureProxyWorkerStorage, queue: QueueObject, manifest: AudioTreatmentCloudManifest) {
  await storage.writeDeadLetter(buildAudioTreatmentCloudDeadLetterObjectName(manifest.job.jobId), { kind: "quipsly-audio-treatment-cloud-dead-letter-v1", version: 1, jobId: manifest.job.jobId, manifestObjectName: buildAudioTreatmentCloudManifestObjectName(manifest.job.jobId), failure: manifest.failure }, queue.generation);
  await storage.deleteObject(queue.name, queue.generation);
}
function exactGcsLocation(locator: string, generation: string) {
  const match = /^gcs:\/\/([a-z0-9][a-z0-9._-]{1,221}[a-z0-9])\/(media-vault\/.+)\?generation=([1-9][0-9]*)$/.exec(locator);
  if (!match || match[3] !== generation || match[2].split("/").some((part) => !part || part === "." || part === "..")) throw new TerminalCloudAudioTreatmentError("audio-treatment-gcs-locator-invalid", "Cloud audio treatment requires a generation-bound media-vault source.");
  return { bucketName: match[1], objectName: match[2], generation: match[3] };
}
function maximumAbsoluteDc(diagnosis: { channels: Array<{ dcOffset: number }> }) { return Math.max(...diagnosis.channels.map((channel) => Math.abs(channel.dcOffset))); }
function fallbackJobId(objectName: string) { const candidate = objectName.split("/").at(-1)?.replace(/\.json$/, "") || "audio_treatment_invalid"; return /^[A-Za-z0-9_-]{8,160}$/.test(candidate) ? candidate : "audio_treatment_invalid"; }
function precondition(error: unknown) { const row = error as { code?: unknown; status?: unknown }; return [409, 412].includes(Number(row.code ?? row.status)); }
function detail(error: unknown) { return error instanceof Error && error.message.trim() ? error.message.slice(0, 4_000) : "Audio treatment control evidence is invalid."; }
function round(value: number, digits: number) { const multiplier = 10 ** digits; return Math.round(value * multiplier) / multiplier; }
