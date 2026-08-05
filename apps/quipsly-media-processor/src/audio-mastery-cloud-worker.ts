import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  AUDIO_MASTERY_CLOUD_QUEUE_PREFIX,
  AUDIO_MASTERY_CONTRACT_VERSION,
  AUDIO_MASTERY_RESULT_KIND,
  assessAudioMastery,
  buildAudioMasteryCloudDeadLetterObjectName,
  buildAudioMasteryCloudManifestObjectName,
  buildAudioMasteryCloudQueueObjectName,
  buildAudioMasteryCloudResultObjectName,
  claimAudioMasteryCloudManifest,
  completeAudioMasteryCloudManifest,
  failAudioMasteryCloudManifest,
  newAudioMasteryProposal,
  parseAudioMasteryCloudManifest,
  parseAudioMasteryCloudQueueReceipt,
  parseAudioMasteryResult,
  releaseAudioMasteryCloudLease,
  type AudioMasteryCloudManifest,
  type AudioMasteryResult,
  type AudioMasterySourceBinding,
} from "@high-ground/quipsly-media-processing";

import { FfmpegAudioMasteringEngine } from "./audio-mastering-ffmpeg.js";
import { ProxyTranscodeError } from "./transcoder.js";
import type {
  CaptureProxyWorkerOptions,
  CaptureProxyWorkerStorage,
  ObjectEvidence,
  QueueObject,
  StoredJson,
} from "./worker.js";

export type AudioMasteryCloudWorkerResult =
  | { disposition: "completed"; jobId: string; rendered: boolean; outputGeneration: string | null }
  | { disposition: "already-complete"; jobId: string }
  | { disposition: "terminal"; jobId: string; code: string }
  | { disposition: "busy"; jobId: string }
  | { disposition: "claim-lost"; jobId: string };

class TerminalCloudMasteryError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "TerminalCloudMasteryError";
    this.code = code;
  }
}

export async function runAudioMasteryCloudWorker(
  storage: CaptureProxyWorkerStorage,
  engine: FfmpegAudioMasteringEngine,
  options: CaptureProxyWorkerOptions,
  limit: number,
) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) throw new Error("Audio mastery cloud worker limit must be between 1 and 20.");
  const queue = await storage.listQueueObjectsUnder(`${AUDIO_MASTERY_CLOUD_QUEUE_PREFIX}/`, limit);
  const results: AudioMasteryCloudWorkerResult[] = [];
  const retries: Error[] = [];
  for (const object of queue) {
    try {
      results.push(await processAudioMasteryCloudQueueObject(storage, engine, options, object));
    } catch (error) {
      retries.push(error instanceof Error ? error : new Error("Unknown cloud audio mastery failure."));
    }
  }
  if (retries.length) throw new AggregateError(retries, `${retries.length} audio mastery cloud job(s) need retry.`);
  return results;
}

export async function processAudioMasteryCloudQueueObject(
  storage: CaptureProxyWorkerStorage,
  engine: FfmpegAudioMasteringEngine,
  options: CaptureProxyWorkerOptions,
  queueObject: QueueObject,
): Promise<AudioMasteryCloudWorkerResult> {
  let receipt;
  try {
    receipt = parseAudioMasteryCloudQueueReceipt((await storage.loadJson(queueObject.name, queueObject.generation)).value);
  } catch (error) {
    return quarantine(storage, queueObject, fallbackJobId(queueObject.name), "audio-mastery-queue-invalid", detail(error), options.now());
  }
  if (queueObject.name !== buildAudioMasteryCloudQueueObjectName(receipt.jobId)) {
    return quarantine(storage, queueObject, receipt.jobId, "audio-mastery-queue-path-mismatch", "Audio mastery queue path does not match its job.", options.now());
  }

  let storedManifest: StoredJson;
  let manifest: AudioMasteryCloudManifest;
  try {
    storedManifest = await storage.loadJson(receipt.manifestObjectName);
    manifest = parseAudioMasteryCloudManifest(storedManifest.value, receipt.jobId);
    if (manifest.status === "queued" && storedManifest.generation !== receipt.manifestGeneration) throw new Error("Queued audio mastery manifest generation no longer matches its receipt.");
  } catch (error) {
    return quarantine(storage, queueObject, receipt.jobId, "audio-mastery-manifest-invalid", detail(error), options.now());
  }
  if (manifest.status === "completed") {
    parseAudioMasteryResult((await storage.loadJson(buildAudioMasteryCloudResultObjectName(manifest.job.jobId))).value, manifest.job);
    await storage.deleteObject(queueObject.name, queueObject.generation);
    return { disposition: "already-complete", jobId: manifest.job.jobId };
  }
  if (manifest.status === "failed-terminal") {
    await deadLetter(storage, queueObject, manifest);
    return { disposition: "terminal", jobId: manifest.job.jobId, code: manifest.failure!.code };
  }

  const leaseId = randomUUID();
  const claimed = claimAudioMasteryCloudManifest({
    manifest,
    leaseId,
    executionId: options.executionId,
    now: options.now(),
    leaseDurationMs: options.leaseDurationMs,
  });
  if (!claimed) return { disposition: "busy", jobId: manifest.job.jobId };
  try {
    storedManifest = await storage.saveJson(receipt.manifestObjectName, claimed, storedManifest.generation);
    manifest = parseAudioMasteryCloudManifest(storedManifest.value, receipt.jobId);
  } catch (error) {
    if (precondition(error)) return { disposition: "claim-lost", jobId: manifest.job.jobId };
    throw error;
  }

  const scratch = await mkdtemp(path.join(tmpdir(), "quipsly-audio-mastery-cloud-"));
  try {
    const location = gcsLocation(manifest.job.source.locator, manifest.job.source.generation);
    const sourcePath = path.join(scratch, "source");
    const outputPath = path.join(scratch, "master.wav");
    const storedOutputPath = path.join(scratch, "stored-master.wav");
    assertSource(manifest, location.bucketName, await storage.objectEvidence(location.objectName, location.generation));
    const materialized = await storage.materializeObject(location.objectName, location.generation, sourcePath);
    if (materialized.sha256 !== manifest.job.source.sha256 || materialized.sizeBytes !== manifest.job.source.sizeBytes) {
      throw new TerminalCloudMasteryError("audio-mastery-source-byte-mismatch", "Materialized audio source failed its immutable byte receipt.");
    }
    const sourceMeasurement = await engine.measure(sourcePath, {
      source: manifest.job.source,
      profileId: manifest.job.profileId,
      measurementId: `measurement_${randomUUID().replaceAll("-", "")}`,
      measuredAt: options.now().toISOString(),
    });
    const signalDiagnosis = await engine.diagnose(sourcePath, {
      source: manifest.job.source,
      diagnosisId: `diagnosis_${randomUUID().replaceAll("-", "")}`,
      analyzedAt: options.now().toISOString(),
    });
    const proposal = newAudioMasteryProposal({
      proposalId: `proposal_${randomUUID().replaceAll("-", "")}`,
      createdAt: options.now().toISOString(),
      measurement: sourceMeasurement,
      profileId: manifest.job.profileId,
    });
    let derivative: AudioMasteryResult["derivative"] = null;
    let outputGeneration: string | null = null;
    if (proposal.action === "render-loudness-master") {
      const rendered = await engine.renderLoudnessMaster(sourcePath, outputPath, { proposal, measurement: sourceMeasurement });
      const outputEvidence = await storage.uploadProxy(
        outputPath,
        manifest.job.target.locator,
        "audio/wav",
        outputMetadata(manifest, rendered.sha256, rendered.sizeBytes),
      );
      const outputSha256 = assertOutput(manifest, outputEvidence, location.bucketName);
      const storedOutput = await storage.materializeObject(
        outputEvidence.objectName,
        outputEvidence.generation,
        storedOutputPath,
      );
      if (
        storedOutput.sha256 !== outputSha256
        || storedOutput.sizeBytes !== outputEvidence.sizeBytes
        || storedOutput.sha256 !== rendered.sha256
        || storedOutput.sizeBytes !== rendered.sizeBytes
      ) throw new TerminalCloudMasteryError("audio-mastery-output-byte-mismatch", "Stored mastering preview failed exact-generation readback before independent verification.");
      outputGeneration = outputEvidence.generation;
      const outputSource: AudioMasterySourceBinding = {
        assetId: manifest.job.source.assetId,
        provider: "gcs",
        locator: gcsLocator(outputEvidence.bucketName, outputEvidence.objectName, outputEvidence.generation),
        generation: outputEvidence.generation,
        sha256: outputSha256,
        sizeBytes: outputEvidence.sizeBytes,
        contentType: "audio/wav",
      };
      const verificationMeasurement = await engine.measure(storedOutputPath, {
        source: outputSource,
        profileId: manifest.job.profileId,
        measurementId: `measurement_${randomUUID().replaceAll("-", "")}`,
        measuredAt: options.now().toISOString(),
      });
      const verification = assessAudioMastery(verificationMeasurement, manifest.job.profileId);
      if (!verification.passes) throw new TerminalCloudMasteryError("audio-mastery-verification-failed", "Rendered cloud mastering preview failed independent complete-decode verification.");
      derivative = {
        provider: "gcs",
        locator: outputSource.locator,
        generation: outputSource.generation,
        sha256: outputSource.sha256,
        sizeBytes: outputSource.sizeBytes,
        contentType: "audio/wav",
        codec: "pcm_s24le",
        sampleRateHz: 48_000,
        variantKind: "audio-master-preview",
        verificationMeasurement,
        verification,
      };
    }
    const result = parseAudioMasteryResult({
      kind: AUDIO_MASTERY_RESULT_KIND,
      version: AUDIO_MASTERY_CONTRACT_VERSION,
      jobId: manifest.job.jobId,
      completedAt: options.now().toISOString(),
      source: manifest.job.source,
      sourceMeasurement,
      signalDiagnosis,
      proposal,
      derivative,
      worker: {
        executionId: options.executionId,
        buildId: options.buildId,
        imageDigest: options.imageDigest,
        attempt: manifest.lease!.attempt,
      },
      boundaries: {
        originalRemainsSourceTruth: true,
        outputIsUnpromotedPreview: true,
        promotionRequiresExplicitApproval: true,
      },
    }, manifest.job);
    const storedResult = await storage.saveJsonIfAbsent(buildAudioMasteryCloudResultObjectName(manifest.job.jobId), result);
    const canonical = parseAudioMasteryResult(storedResult.value, manifest.job);
    const latest = await storage.loadJson(receipt.manifestObjectName);
    const completed = completeAudioMasteryCloudManifest({
      manifest: parseAudioMasteryCloudManifest(latest.value, manifest.job.jobId),
      leaseId,
      result: canonical,
      now: options.now(),
    });
    await storage.saveJson(receipt.manifestObjectName, completed, latest.generation);
    await storage.deleteObject(queueObject.name, queueObject.generation);
    return { disposition: "completed", jobId: manifest.job.jobId, rendered: derivative !== null, outputGeneration };
  } catch (error) {
    const terminal = error instanceof TerminalCloudMasteryError || (error instanceof ProxyTranscodeError && !error.retryable);
    if (terminal) {
      const normalized = error instanceof TerminalCloudMasteryError
        ? error
        : new TerminalCloudMasteryError(error.code, error.message);
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

function assertSource(manifest: AudioMasteryCloudManifest, bucketName: string, evidence: ObjectEvidence | null) {
  if (
    !evidence
    || evidence.bucketName !== bucketName
    || evidence.generation !== manifest.job.source.generation
    || evidence.sizeBytes !== manifest.job.source.sizeBytes
    || evidence.contentType !== manifest.job.source.contentType
  ) throw new TerminalCloudMasteryError("audio-mastery-source-generation-mismatch", "Cloud source generation evidence no longer matches its mastery binding.");
}

function assertOutput(manifest: AudioMasteryCloudManifest, evidence: ObjectEvidence, bucketName: string) {
  const metadata = evidence.customMetadata;
  if (
    evidence.bucketName !== bucketName
    || evidence.objectName !== manifest.job.target.locator
    || evidence.contentType !== "audio/wav"
    || metadata.quipslyKind !== "audio-mastery-preview-v1"
    || metadata.quipslyMasteryJobId !== manifest.job.jobId
    || metadata.quipslySourceGeneration !== manifest.job.source.generation
    || metadata.quipslySourceSha256 !== manifest.job.source.sha256
    || metadata.quipslyOutputSizeBytes !== String(evidence.sizeBytes)
    || !/^[0-9a-f]{64}$/.test(metadata.quipslyOutputSha256 || "")
    || metadata.quipslyOriginalRemainsSourceTruth !== "true"
    || metadata.quipslyPromotionRequiresExplicitApproval !== "true"
  ) throw new TerminalCloudMasteryError("audio-mastery-output-receipt-invalid", "Cloud mastering preview no longer matches its create-once object receipt.");
  return metadata.quipslyOutputSha256;
}

function outputMetadata(manifest: AudioMasteryCloudManifest, sha256: string, sizeBytes: number) {
  return {
    quipslyKind: "audio-mastery-preview-v1",
    quipslyMasteryJobId: manifest.job.jobId,
    quipslyProjectId: manifest.job.projectId,
    quipslyAssetId: manifest.job.source.assetId,
    quipslyProfileId: manifest.job.profileId,
    quipslySourceLocator: manifest.job.source.locator,
    quipslySourceGeneration: manifest.job.source.generation,
    quipslySourceSha256: manifest.job.source.sha256,
    quipslyOutputSha256: sha256,
    quipslyOutputSizeBytes: String(sizeBytes),
    quipslyOriginalRemainsSourceTruth: "true",
    quipslyOutputIsUnpromotedPreview: "true",
    quipslyPromotionRequiresExplicitApproval: "true",
  };
}

async function terminalFailure(storage: CaptureProxyWorkerStorage, objectName: string, jobId: string, leaseId: string, error: TerminalCloudMasteryError, now: Date) {
  const latest = await storage.loadJson(objectName);
  const failed = failAudioMasteryCloudManifest({ manifest: parseAudioMasteryCloudManifest(latest.value, jobId), leaseId, code: error.code, message: error.message, now });
  const stored = await storage.saveJson(objectName, failed, latest.generation);
  return parseAudioMasteryCloudManifest(stored.value, jobId);
}

async function releaseLease(storage: CaptureProxyWorkerStorage, objectName: string, jobId: string, leaseId: string, now: Date) {
  try {
    const latest = await storage.loadJson(objectName);
    const manifest = parseAudioMasteryCloudManifest(latest.value, jobId);
    if (manifest.status !== "processing" || manifest.lease?.id !== leaseId) return;
    await storage.saveJson(objectName, releaseAudioMasteryCloudLease({ manifest, leaseId, now }), latest.generation);
  } catch { /* another generation owns retry */ }
}

async function quarantine(storage: CaptureProxyWorkerStorage, queue: QueueObject, jobId: string, code: string, message: string, now: Date): Promise<AudioMasteryCloudWorkerResult> {
  await storage.writeDeadLetter(buildAudioMasteryCloudDeadLetterObjectName(jobId), { kind: "quipsly-audio-mastery-cloud-dead-letter-v1", version: 1, jobId, code, message, failedAt: now.toISOString() }, queue.generation);
  await storage.deleteObject(queue.name, queue.generation);
  return { disposition: "terminal", jobId, code };
}

async function deadLetter(storage: CaptureProxyWorkerStorage, queue: QueueObject, manifest: AudioMasteryCloudManifest) {
  await storage.writeDeadLetter(buildAudioMasteryCloudDeadLetterObjectName(manifest.job.jobId), { kind: "quipsly-audio-mastery-cloud-dead-letter-v1", version: 1, jobId: manifest.job.jobId, manifestObjectName: buildAudioMasteryCloudManifestObjectName(manifest.job.jobId), failure: manifest.failure }, queue.generation);
  await storage.deleteObject(queue.name, queue.generation);
}

function gcsLocation(locator: string, generation: string) {
  const match = /^gcs:\/\/([a-z0-9][a-z0-9._-]{1,221}[a-z0-9])\/(media-vault\/.+)\?generation=([1-9][0-9]*)$/.exec(locator);
  if (!match || match[3] !== generation || match[2].split("/").some((part) => !part || part === "." || part === "..")) throw new TerminalCloudMasteryError("audio-mastery-gcs-locator-invalid", "Cloud audio mastery requires a generation-bound media-vault source.");
  return { bucketName: match[1], objectName: match[2], generation: match[3] };
}

function gcsLocator(bucketName: string, objectName: string, generation: string) {
  return `gcs://${bucketName}/${objectName}?generation=${generation}`;
}

function fallbackJobId(name: string) {
  const tail = name.split("/").pop()?.replace(/\.json$/, "") || "";
  return /^[A-Za-z0-9_-]{8,160}$/.test(tail) ? tail : `invalid_${Buffer.from(name).toString("hex").slice(0, 24)}`;
}

function detail(error: unknown) { return error instanceof Error && error.message.trim() ? error.message : "Audio mastery cloud processing failed."; }
function precondition(error: unknown) { const row = error as { code?: unknown; status?: unknown }; return [409, 412].includes(Number(row.code ?? row.status)); }
