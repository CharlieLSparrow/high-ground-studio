import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  DIALOGUE_REPAIR_CLOUD_QUEUE_PREFIX,
  DIALOGUE_REPAIR_CONTRACT_VERSION,
  DIALOGUE_REPAIR_RESULT_KIND,
  buildDialogueRepairCloudDeadLetterObjectName,
  buildDialogueRepairCloudManifestObjectName,
  buildDialogueRepairCloudQueueObjectName,
  buildDialogueRepairCloudResultObjectName,
  claimDialogueRepairCloudManifest,
  completeDialogueRepairCloudManifest,
  failDialogueRepairCloudManifest,
  parseDialogueRepairCloudManifest,
  parseDialogueRepairCloudQueueReceipt,
  parseDialogueRepairResult,
  releaseDialogueRepairCloudLease,
  type AudioMasterySourceBinding,
  type DialogueRepairCloudManifest,
  type DialogueRepairProposal,
  type DialogueRepairResult,
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

export type DialogueRepairCloudWorkerResult =
  | { disposition: "completed"; jobId: string; outputGeneration: string }
  | { disposition: "already-complete"; jobId: string }
  | { disposition: "terminal"; jobId: string; code: string }
  | { disposition: "busy"; jobId: string }
  | { disposition: "claim-lost"; jobId: string };

type DialogueRepairCloudEngine = Pick<
  FfmpegAudioMasteringEngine,
  "measure" | "diagnose" | "renderDialogueRepairExperiment"
>;

class TerminalCloudDialogueRepairError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "TerminalCloudDialogueRepairError";
  }
}

export async function runDialogueRepairCloudWorker(
  storage: CaptureProxyWorkerStorage,
  engine: DialogueRepairCloudEngine,
  options: CaptureProxyWorkerOptions,
  limit: number,
) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) {
    throw new Error("Dialogue Repair cloud worker limit must be between 1 and 20.");
  }
  const queue = await storage.listQueueObjectsUnder(`${DIALOGUE_REPAIR_CLOUD_QUEUE_PREFIX}/`, limit);
  const results: DialogueRepairCloudWorkerResult[] = [];
  const retries: Error[] = [];
  for (const object of queue) {
    try {
      results.push(await processDialogueRepairCloudQueueObject(storage, engine, options, object));
    } catch (error) {
      retries.push(error instanceof Error ? error : new Error("Unknown cloud Dialogue Repair failure."));
    }
  }
  if (retries.length) throw new AggregateError(retries, `${retries.length} Dialogue Repair cloud job(s) need retry.`);
  return results;
}

export async function processDialogueRepairCloudQueueObject(
  storage: CaptureProxyWorkerStorage,
  engine: DialogueRepairCloudEngine,
  options: CaptureProxyWorkerOptions,
  queueObject: QueueObject,
): Promise<DialogueRepairCloudWorkerResult> {
  let receipt;
  try {
    receipt = parseDialogueRepairCloudQueueReceipt(
      (await storage.loadJson(queueObject.name, queueObject.generation)).value,
    );
  } catch (error) {
    return quarantine(
      storage,
      queueObject,
      fallbackJobId(queueObject.name),
      "dialogue-repair-queue-invalid",
      detail(error),
      options.now(),
    );
  }
  if (queueObject.name !== buildDialogueRepairCloudQueueObjectName(receipt.jobId)) {
    return quarantine(
      storage,
      queueObject,
      receipt.jobId,
      "dialogue-repair-queue-path-mismatch",
      "Dialogue Repair queue path does not match its job.",
      options.now(),
    );
  }

  let storedManifest: StoredJson;
  let manifest: DialogueRepairCloudManifest;
  try {
    storedManifest = await storage.loadJson(receipt.manifestObjectName);
    manifest = parseDialogueRepairCloudManifest(storedManifest.value, receipt.jobId);
    if (manifest.status === "queued" && storedManifest.generation !== receipt.manifestGeneration) {
      throw new Error("Queued Dialogue Repair manifest generation no longer matches its receipt.");
    }
  } catch (error) {
    return quarantine(
      storage,
      queueObject,
      receipt.jobId,
      "dialogue-repair-manifest-invalid",
      detail(error),
      options.now(),
    );
  }
  if (manifest.status === "completed") {
    parseDialogueRepairResult(
      (await storage.loadJson(buildDialogueRepairCloudResultObjectName(manifest.job.jobId))).value,
      manifest.job,
    );
    await storage.deleteObject(queueObject.name, queueObject.generation);
    return { disposition: "already-complete", jobId: manifest.job.jobId };
  }
  if (manifest.status === "failed-terminal") {
    await deadLetter(storage, queueObject, manifest);
    return { disposition: "terminal", jobId: manifest.job.jobId, code: manifest.failure!.code };
  }

  const leaseId = randomUUID();
  const claimed = claimDialogueRepairCloudManifest({
    manifest,
    leaseId,
    executionId: options.executionId,
    now: options.now(),
    leaseDurationMs: options.leaseDurationMs,
  });
  if (!claimed) return { disposition: "busy", jobId: manifest.job.jobId };
  try {
    storedManifest = await storage.saveJson(receipt.manifestObjectName, claimed, storedManifest.generation);
    manifest = parseDialogueRepairCloudManifest(storedManifest.value, receipt.jobId);
  } catch (error) {
    if (precondition(error)) return { disposition: "claim-lost", jobId: manifest.job.jobId };
    throw error;
  }

  const scratch = await mkdtemp(path.join(tmpdir(), "quipsly-dialogue-repair-cloud-"));
  try {
    const location = gcsLocation(manifest.job.source.locator, manifest.job.source.generation);
    const sourcePath = path.join(scratch, "source");
    const outputPath = path.join(scratch, "repair.wav");
    const storedOutputPath = path.join(scratch, "stored-repair.wav");
    assertSource(manifest, location.bucketName, await storage.objectEvidence(location.objectName, location.generation));
    const materialized = await storage.materializeObject(location.objectName, location.generation, sourcePath);
    if (
      materialized.sha256 !== manifest.job.source.sha256
      || materialized.sizeBytes !== manifest.job.source.sizeBytes
    ) {
      throw new TerminalCloudDialogueRepairError(
        "dialogue-repair-source-byte-mismatch",
        "Materialized dialogue source failed its immutable byte receipt.",
      );
    }

    const sourceMeasurement = await engine.measure(sourcePath, {
      source: manifest.job.source,
      profileId: "apple-podcasts-dialogue-v1",
      measurementId: `measurement_${randomUUID().replaceAll("-", "")}`,
      measuredAt: options.now().toISOString(),
    });
    const sourceDiagnosis = await engine.diagnose(sourcePath, {
      source: manifest.job.source,
      diagnosisId: `diagnosis_${randomUUID().replaceAll("-", "")}`,
      analyzedAt: options.now().toISOString(),
    });
    const rendered = await engine.renderDialogueRepairExperiment(sourcePath, outputPath, {
      proposal: manifest.job.proposal,
    });
    if (
      rendered.authorizingReviewReceiptId !== manifest.job.proposal.authorizingReviewReceiptId
      || rendered.treatmentRange.startSeconds !== manifest.job.proposal.treatmentRange.startSeconds
      || rendered.treatmentRange.endSeconds !== manifest.job.proposal.treatmentRange.endSeconds
    ) {
      throw new TerminalCloudDialogueRepairError(
        "dialogue-repair-render-authority-mismatch",
        "Rendered cloud repair range does not match the confirmed listening review.",
      );
    }
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
    ) {
      throw new TerminalCloudDialogueRepairError(
        "dialogue-repair-output-byte-mismatch",
        "Stored Dialogue Repair preview failed exact-generation readback.",
      );
    }

    const outputSource: AudioMasterySourceBinding = {
      assetId: manifest.job.source.assetId,
      provider: "gcs",
      locator: gcsLocator(outputEvidence.bucketName, outputEvidence.objectName, outputEvidence.generation),
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
    const durationDeltaSeconds = round(
      Math.abs(sourceMeasurement.durationSeconds - outputMeasurement.durationSeconds),
      6,
    );
    if (
      durationDeltaSeconds > 0.05
      || sourceMeasurement.channels !== outputMeasurement.channels
      || sourceDiagnosis.channelCount !== outputDiagnosis.channelCount
      || !outputMeasurement.analyzer.completeDecode
      || !outputDiagnosis.analyzer.completeDecode
    ) {
      throw new TerminalCloudDialogueRepairError(
        "dialogue-repair-verification-failed",
        "Cloud Dialogue Repair failed duration, channel, or complete-decode verification.",
      );
    }

    const result = parseDialogueRepairResult({
      kind: DIALOGUE_REPAIR_RESULT_KIND,
      version: DIALOGUE_REPAIR_CONTRACT_VERSION,
      jobId: manifest.job.jobId,
      completedAt: options.now().toISOString(),
      source: manifest.job.source,
      proposal: manifest.job.proposal,
      sourceMeasurement,
      sourceDiagnosis,
      derivative: {
        provider: "gcs",
        locator: outputSource.locator,
        generation: outputSource.generation,
        sha256: outputSource.sha256,
        sizeBytes: outputSource.sizeBytes,
        contentType: "audio/wav",
        codec: "pcm_s24le",
        sampleRateHz: 48_000,
        variantKind: "dialogue-repair-preview",
        measurement: outputMeasurement,
        diagnosis: outputDiagnosis,
      },
      verification: {
        sourceDurationSeconds: round(sourceMeasurement.durationSeconds, 6),
        outputDurationSeconds: round(outputMeasurement.durationSeconds, 6),
        durationDeltaSeconds,
        maximumDurationDeltaSeconds: 0.05,
        sourceChannelCount: sourceMeasurement.channels,
        outputChannelCount: outputMeasurement.channels,
        sourceBytesPreserved: true,
        completeOutputDecode: true,
        passes: true,
      },
      worker: {
        executionId: options.executionId,
        buildId: options.buildId,
        imageDigest: options.imageDigest,
        attempt: manifest.lease!.attempt,
      },
      boundaries: {
        originalRemainsSourceTruth: true,
        outputIsUnpromotedExperiment: true,
        outputIsNotAMasteredDeliveryFile: true,
        matchedAuditionRequired: true,
        promotionRequiresSeparateApproval: true,
      },
    }, manifest.job);
    const storedResult = await storage.saveJsonIfAbsent(
      buildDialogueRepairCloudResultObjectName(manifest.job.jobId),
      result,
    );
    const canonical = parseDialogueRepairResult(storedResult.value, manifest.job);
    const latest = await storage.loadJson(receipt.manifestObjectName);
    const completed = completeDialogueRepairCloudManifest({
      manifest: parseDialogueRepairCloudManifest(latest.value, manifest.job.jobId),
      leaseId,
      result: canonical,
      now: options.now(),
    });
    await storage.saveJson(receipt.manifestObjectName, completed, latest.generation);
    await storage.deleteObject(queueObject.name, queueObject.generation);
    return {
      disposition: "completed",
      jobId: manifest.job.jobId,
      outputGeneration: outputEvidence.generation,
    };
  } catch (error) {
    const terminal = error instanceof TerminalCloudDialogueRepairError
      || (error instanceof ProxyTranscodeError && !error.retryable);
    if (terminal) {
      const normalized = error instanceof TerminalCloudDialogueRepairError
        ? error
        : new TerminalCloudDialogueRepairError(error.code, error.message);
      const failed = await terminalFailure(
        storage,
        receipt.manifestObjectName,
        manifest.job.jobId,
        leaseId,
        normalized,
        options.now(),
      );
      await deadLetter(storage, queueObject, failed);
      return { disposition: "terminal", jobId: manifest.job.jobId, code: normalized.code };
    }
    await releaseLease(
      storage,
      receipt.manifestObjectName,
      manifest.job.jobId,
      leaseId,
      options.now(),
    );
    throw error;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

function assertSource(
  manifest: DialogueRepairCloudManifest,
  bucketName: string,
  evidence: ObjectEvidence | null,
) {
  if (
    !evidence
    || evidence.bucketName !== bucketName
    || evidence.generation !== manifest.job.source.generation
    || evidence.sizeBytes !== manifest.job.source.sizeBytes
    || evidence.contentType !== manifest.job.source.contentType
  ) {
    throw new TerminalCloudDialogueRepairError(
      "dialogue-repair-source-generation-mismatch",
      "Cloud source generation evidence no longer matches its Dialogue Repair binding.",
    );
  }
}

function assertOutput(
  manifest: DialogueRepairCloudManifest,
  evidence: ObjectEvidence,
  bucketName: string,
) {
  const metadata = evidence.customMetadata;
  if (
    evidence.bucketName !== bucketName
    || evidence.objectName !== manifest.job.target.locator
    || evidence.contentType !== "audio/wav"
    || metadata.quipslyKind !== "dialogue-repair-preview-v1"
    || metadata.quipslyDialogueRepairJobId !== manifest.job.jobId
    || metadata.quipslyCandidateId !== manifest.job.proposal.candidate.candidateId
    || metadata.quipslyReviewReceiptId !== manifest.job.proposal.authorizingReviewReceiptId
    || metadata.quipslySourceGeneration !== manifest.job.source.generation
    || metadata.quipslySourceSha256 !== manifest.job.source.sha256
    || metadata.quipslyOutputSizeBytes !== String(evidence.sizeBytes)
    || !/^[0-9a-f]{64}$/.test(metadata.quipslyOutputSha256 || "")
    || metadata.quipslyOriginalRemainsSourceTruth !== "true"
    || metadata.quipslyMatchedAuditionRequired !== "true"
    || metadata.quipslyPromotionRequiresSeparateApproval !== "true"
  ) {
    throw new TerminalCloudDialogueRepairError(
      "dialogue-repair-output-receipt-invalid",
      "Cloud Dialogue Repair preview no longer matches its create-once object receipt.",
    );
  }
  return metadata.quipslyOutputSha256;
}

function outputMetadata(
  manifest: DialogueRepairCloudManifest,
  sha256: string,
  sizeBytes: number,
) {
  return {
    quipslyKind: "dialogue-repair-preview-v1",
    quipslyDialogueRepairJobId: manifest.job.jobId,
    quipslyProjectId: manifest.job.projectId,
    quipslyAssetId: manifest.job.source.assetId,
    quipslyCandidateId: manifest.job.proposal.candidate.candidateId,
    quipslyReviewReceiptId: manifest.job.proposal.authorizingReviewReceiptId,
    quipslySourceGeneration: manifest.job.source.generation,
    quipslySourceSha256: manifest.job.source.sha256,
    quipslyOutputSha256: sha256,
    quipslyOutputSizeBytes: String(sizeBytes),
    quipslyOriginalRemainsSourceTruth: "true",
    quipslyOutputIsUnpromotedExperiment: "true",
    quipslyMatchedAuditionRequired: "true",
    quipslyPromotionRequiresSeparateApproval: "true",
  };
}

async function terminalFailure(
  storage: CaptureProxyWorkerStorage,
  objectName: string,
  jobId: string,
  leaseId: string,
  error: TerminalCloudDialogueRepairError,
  now: Date,
) {
  const latest = await storage.loadJson(objectName);
  const failed = failDialogueRepairCloudManifest({
    manifest: parseDialogueRepairCloudManifest(latest.value, jobId),
    leaseId,
    code: error.code,
    message: error.message,
    now,
  });
  const stored = await storage.saveJson(objectName, failed, latest.generation);
  return parseDialogueRepairCloudManifest(stored.value, jobId);
}

async function releaseLease(
  storage: CaptureProxyWorkerStorage,
  objectName: string,
  jobId: string,
  leaseId: string,
  now: Date,
) {
  try {
    const latest = await storage.loadJson(objectName);
    const manifest = parseDialogueRepairCloudManifest(latest.value, jobId);
    if (manifest.status !== "processing" || manifest.lease?.id !== leaseId) return;
    await storage.saveJson(
      objectName,
      releaseDialogueRepairCloudLease({ manifest, leaseId, now }),
      latest.generation,
    );
  } catch {
    // A different generation owns retry.
  }
}

async function quarantine(
  storage: CaptureProxyWorkerStorage,
  queue: QueueObject,
  jobId: string,
  code: string,
  message: string,
  now: Date,
): Promise<DialogueRepairCloudWorkerResult> {
  await storage.writeDeadLetter(
    buildDialogueRepairCloudDeadLetterObjectName(jobId),
    {
      kind: "quipsly-dialogue-repair-cloud-dead-letter-v1",
      version: 1,
      jobId,
      code,
      message,
      failedAt: now.toISOString(),
    },
    queue.generation,
  );
  await storage.deleteObject(queue.name, queue.generation);
  return { disposition: "terminal", jobId, code };
}

async function deadLetter(
  storage: CaptureProxyWorkerStorage,
  queue: QueueObject,
  manifest: DialogueRepairCloudManifest,
) {
  await storage.writeDeadLetter(
    buildDialogueRepairCloudDeadLetterObjectName(manifest.job.jobId),
    {
      kind: "quipsly-dialogue-repair-cloud-dead-letter-v1",
      version: 1,
      jobId: manifest.job.jobId,
      manifestObjectName: buildDialogueRepairCloudManifestObjectName(manifest.job.jobId),
      failure: manifest.failure,
    },
    queue.generation,
  );
  await storage.deleteObject(queue.name, queue.generation);
}

function gcsLocation(locator: string, generation: string) {
  const match = /^gcs:\/\/([a-z0-9][a-z0-9._-]{1,221}[a-z0-9])\/(media-vault\/.+)\?generation=([1-9][0-9]*)$/.exec(locator);
  if (
    !match
    || match[3] !== generation
    || match[2].split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new TerminalCloudDialogueRepairError(
      "dialogue-repair-gcs-locator-invalid",
      "Cloud Dialogue Repair requires a generation-bound media-vault source.",
    );
  }
  return { bucketName: match[1], objectName: match[2], generation: match[3] };
}

function gcsLocator(bucketName: string, objectName: string, generation: string) {
  return `gcs://${bucketName}/${objectName}?generation=${generation}`;
}

function fallbackJobId(objectName: string) {
  const candidate = objectName.split("/").at(-1)?.replace(/\.json$/, "") || "dialogue_repair_invalid";
  return /^[A-Za-z0-9_-]{8,160}$/.test(candidate) ? candidate : "dialogue_repair_invalid";
}

function precondition(error: unknown) {
  const row = error as { code?: unknown; status?: unknown };
  return [409, 412].includes(Number(row.code ?? row.status));
}

function detail(error: unknown) {
  return error instanceof Error && error.message.trim()
    ? error.message.slice(0, 4_000)
    : "Dialogue Repair control evidence is invalid.";
}

function round(value: number, digits: number) {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}
