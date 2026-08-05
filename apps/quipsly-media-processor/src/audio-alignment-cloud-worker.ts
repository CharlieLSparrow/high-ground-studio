import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  AUDIO_ALIGNMENT_CLOUD_QUEUE_PREFIX,
  buildAudioAlignmentCloudDeadLetterObjectName,
  buildAudioAlignmentCloudManifestObjectName,
  buildAudioAlignmentCloudQueueObjectName,
  buildAudioAlignmentCloudResultObjectName,
  claimAudioAlignmentCloudManifest,
  completeAudioAlignmentCloudManifest,
  failAudioAlignmentCloudManifest,
  newAudioAlignmentResult,
  parseAudioAlignmentCloudManifest,
  parseAudioAlignmentCloudQueueReceipt,
  parseAudioAlignmentResult,
  releaseAudioAlignmentCloudLease,
  type AudioAlignmentCloudManifest,
} from "@high-ground/quipsly-media-processing";

import { FfmpegAudioAlignmentAnalyzer } from "./audio-alignment-ffmpeg.js";
import type {
  CaptureProxyWorkerOptions,
  CaptureProxyWorkerStorage,
  ObjectEvidence,
  QueueObject,
  StoredJson,
} from "./worker.js";

export type AudioAlignmentCloudWorkerResult =
  | { disposition: "completed"; jobId: string; qualified: boolean }
  | { disposition: "already-complete"; jobId: string }
  | { disposition: "terminal"; jobId: string; code: string }
  | { disposition: "busy"; jobId: string }
  | { disposition: "claim-lost"; jobId: string };

class TerminalCloudAlignmentError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "TerminalCloudAlignmentError";
    this.code = code;
  }
}

export async function runAudioAlignmentCloudWorker(
  storage: CaptureProxyWorkerStorage,
  analyzer: FfmpegAudioAlignmentAnalyzer,
  options: CaptureProxyWorkerOptions,
  limit: number,
) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) throw new Error("Audio alignment cloud worker limit must be between 1 and 20.");
  const queue = await storage.listQueueObjectsUnder(`${AUDIO_ALIGNMENT_CLOUD_QUEUE_PREFIX}/`, limit);
  const results: AudioAlignmentCloudWorkerResult[] = [];
  const retries: Error[] = [];
  for (const object of queue) {
    try { results.push(await processAudioAlignmentCloudQueueObject(storage, analyzer, options, object)); }
    catch (error) { retries.push(error instanceof Error ? error : new Error("Unknown cloud alignment failure.")); }
  }
  if (retries.length) throw new AggregateError(retries, `${retries.length} audio alignment cloud job(s) need retry.`);
  return results;
}

export async function processAudioAlignmentCloudQueueObject(
  storage: CaptureProxyWorkerStorage,
  analyzer: FfmpegAudioAlignmentAnalyzer,
  options: CaptureProxyWorkerOptions,
  queueObject: QueueObject,
): Promise<AudioAlignmentCloudWorkerResult> {
  let receipt;
  try {
    receipt = parseAudioAlignmentCloudQueueReceipt((await storage.loadJson(queueObject.name, queueObject.generation)).value);
  } catch (error) {
    return quarantine(storage, queueObject, fallbackJobId(queueObject.name), "audio-alignment-queue-invalid", detail(error), options.now());
  }
  if (queueObject.name !== buildAudioAlignmentCloudQueueObjectName(receipt.jobId)) {
    return quarantine(storage, queueObject, receipt.jobId, "audio-alignment-queue-path-mismatch", "Alignment queue path does not match its job.", options.now());
  }
  let storedManifest: StoredJson;
  let manifest: AudioAlignmentCloudManifest;
  try {
    storedManifest = await storage.loadJson(receipt.manifestObjectName);
    manifest = parseAudioAlignmentCloudManifest(storedManifest.value, receipt.jobId);
    if (manifest.status === "queued" && storedManifest.generation !== receipt.manifestGeneration) throw new Error("Queued alignment manifest generation no longer matches its receipt.");
  } catch (error) {
    return quarantine(storage, queueObject, receipt.jobId, "audio-alignment-manifest-invalid", detail(error), options.now());
  }
  if (manifest.status === "completed") {
    parseAudioAlignmentResult((await storage.loadJson(buildAudioAlignmentCloudResultObjectName(manifest.job.jobId))).value, manifest.job);
    await storage.deleteObject(queueObject.name, queueObject.generation);
    return { disposition: "already-complete", jobId: manifest.job.jobId };
  }
  if (manifest.status === "failed-terminal") {
    await deadLetter(storage, queueObject, manifest);
    return { disposition: "terminal", jobId: manifest.job.jobId, code: manifest.failure!.code };
  }
  const leaseId = randomUUID();
  const claimed = claimAudioAlignmentCloudManifest({ manifest, leaseId, executionId: options.executionId, now: options.now(), leaseDurationMs: options.leaseDurationMs });
  if (!claimed) return { disposition: "busy", jobId: manifest.job.jobId };
  try {
    storedManifest = await storage.saveJson(receipt.manifestObjectName, claimed, storedManifest.generation);
    manifest = parseAudioAlignmentCloudManifest(storedManifest.value, receipt.jobId);
  } catch (error) {
    if (precondition(error)) return { disposition: "claim-lost", jobId: manifest.job.jobId };
    throw error;
  }
  const scratch = await mkdtemp(path.join(tmpdir(), "quipsly-audio-alignment-cloud-"));
  try {
    const spineLocation = gcsLocation(manifest.job.spine.locator, manifest.job.spine.generation);
    const targetLocation = gcsLocation(manifest.job.target.locator, manifest.job.target.generation);
    if (spineLocation.bucketName !== targetLocation.bucketName) throw new TerminalCloudAlignmentError("audio-alignment-bucket-mismatch", "Both alignment sources must use the processor control bucket.");
    const spinePath = path.join(scratch, "spine");
    const targetPath = path.join(scratch, "target");
    const [spineMaterialized, targetMaterialized] = await Promise.all([
      materialize(storage, manifest.job.spine, spineLocation, spinePath),
      materialize(storage, manifest.job.target, targetLocation, targetPath),
    ]);
    if (!spineMaterialized || !targetMaterialized) throw new TerminalCloudAlignmentError("audio-alignment-source-byte-mismatch", "A materialized alignment source failed its immutable byte receipt.");
    let evidence;
    try {
      evidence = await analyzer.analyze({ spinePath, targetPath, spine: manifest.job.spine, target: manifest.job.target, options: manifest.job.proposal, createdAt: options.now().toISOString() });
    } catch (error) {
      if (terminalAnalysis(error)) throw new TerminalCloudAlignmentError("audio-alignment-evidence-unavailable", detail(error));
      throw error;
    }
    const result = newAudioAlignmentResult({
      jobId: manifest.job.jobId,
      completedAt: options.now().toISOString(),
      evidence,
      worker: {
        executionId: options.executionId,
        buildId: options.buildId,
        imageDigest: options.imageDigest,
        attempt: manifest.lease!.attempt,
      },
    });
    const storedResult = await storage.saveJsonIfAbsent(buildAudioAlignmentCloudResultObjectName(manifest.job.jobId), result);
    const canonical = parseAudioAlignmentResult(storedResult.value, manifest.job);
    const latest = await storage.loadJson(receipt.manifestObjectName);
    const completed = completeAudioAlignmentCloudManifest({
      manifest: parseAudioAlignmentCloudManifest(latest.value, manifest.job.jobId),
      leaseId,
      result: canonical,
      now: options.now(),
    });
    await storage.saveJson(receipt.manifestObjectName, completed, latest.generation);
    await storage.deleteObject(queueObject.name, queueObject.generation);
    return { disposition: "completed", jobId: manifest.job.jobId, qualified: canonical.evidence.qualification.qualifiedForAuthorizedAgentReview };
  } catch (error) {
    if (error instanceof TerminalCloudAlignmentError) {
      const failed = await terminalFailure(storage, receipt.manifestObjectName, manifest.job.jobId, leaseId, error, options.now());
      await deadLetter(storage, queueObject, failed);
      return { disposition: "terminal", jobId: manifest.job.jobId, code: error.code };
    }
    await releaseLease(storage, receipt.manifestObjectName, manifest.job.jobId, leaseId, options.now());
    throw error;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

async function materialize(
  storage: CaptureProxyWorkerStorage,
  source: AudioAlignmentCloudManifest["job"]["spine"],
  location: { bucketName: string; objectName: string; generation: string },
  destination: string,
) {
  assertObject(source, location.bucketName, await storage.objectEvidence(location.objectName, location.generation));
  const copied = await storage.materializeObject(location.objectName, location.generation, destination);
  return copied.sha256 === source.sha256 && copied.sizeBytes === source.sizeBytes;
}
function assertObject(source: AudioAlignmentCloudManifest["job"]["spine"], bucketName: string, evidence: ObjectEvidence | null) {
  if (!evidence || evidence.bucketName !== bucketName || evidence.generation !== source.generation || evidence.sizeBytes !== source.sizeBytes || evidence.contentType !== source.contentType) {
    throw new TerminalCloudAlignmentError("audio-alignment-source-generation-mismatch", "Cloud source generation evidence no longer matches its alignment binding.");
  }
}
async function terminalFailure(storage: CaptureProxyWorkerStorage, objectName: string, jobId: string, leaseId: string, error: TerminalCloudAlignmentError, now: Date) {
  const latest = await storage.loadJson(objectName);
  const failed = failAudioAlignmentCloudManifest({ manifest: parseAudioAlignmentCloudManifest(latest.value, jobId), leaseId, code: error.code, message: error.message, now });
  const stored = await storage.saveJson(objectName, failed, latest.generation);
  return parseAudioAlignmentCloudManifest(stored.value, jobId);
}
async function releaseLease(storage: CaptureProxyWorkerStorage, objectName: string, jobId: string, leaseId: string, now: Date) {
  try {
    const latest = await storage.loadJson(objectName);
    const manifest = parseAudioAlignmentCloudManifest(latest.value, jobId);
    if (manifest.status !== "processing" || manifest.lease?.id !== leaseId) return;
    await storage.saveJson(objectName, releaseAudioAlignmentCloudLease({ manifest, leaseId, now }), latest.generation);
  } catch { /* another generation owns retry */ }
}
async function quarantine(storage: CaptureProxyWorkerStorage, queue: QueueObject, jobId: string, code: string, message: string, now: Date): Promise<AudioAlignmentCloudWorkerResult> {
  await storage.writeDeadLetter(buildAudioAlignmentCloudDeadLetterObjectName(jobId), { kind: "quipsly-audio-alignment-cloud-dead-letter-v1", version: 1, jobId, code, message, failedAt: now.toISOString() }, queue.generation);
  await storage.deleteObject(queue.name, queue.generation);
  return { disposition: "terminal", jobId, code };
}
async function deadLetter(storage: CaptureProxyWorkerStorage, queue: QueueObject, manifest: AudioAlignmentCloudManifest) {
  await storage.writeDeadLetter(buildAudioAlignmentCloudDeadLetterObjectName(manifest.job.jobId), { kind: "quipsly-audio-alignment-cloud-dead-letter-v1", version: 1, jobId: manifest.job.jobId, manifestObjectName: buildAudioAlignmentCloudManifestObjectName(manifest.job.jobId), failure: manifest.failure }, queue.generation);
  await storage.deleteObject(queue.name, queue.generation);
}
function gcsLocation(locator: string, generation: string) {
  const match = /^gcs:\/\/([a-z0-9][a-z0-9._-]{1,221}[a-z0-9])\/(media-vault\/.+)\?generation=([1-9][0-9]*)$/.exec(locator);
  if (!match || match[3] !== generation || match[2].split("/").some((part) => !part || part === "." || part === "..")) throw new TerminalCloudAlignmentError("audio-alignment-gcs-locator-invalid", "Cloud alignment requires a generation-bound media-vault source.");
  return { bucketName: match[1], objectName: match[2], generation: match[3] };
}
function fallbackJobId(name: string) {
  const tail = name.split("/").pop()?.replace(/\.json$/, "") || "";
  return /^[A-Za-z0-9_-]{8,180}$/.test(tail) ? tail : `invalid-${createHash("sha256").update(name).digest("hex").slice(0, 24)}`;
}
function terminalAnalysis(error: unknown) { return /exceeds|effectively silent|does not match|requires|invalid|non-empty|no complete float|must be|outside/i.test(detail(error)); }
function detail(error: unknown) { return error instanceof Error && error.message.trim() ? error.message : "Audio alignment cloud processing failed."; }
function precondition(error: unknown) { const row = error as { code?: unknown; status?: unknown }; return [409, 412].includes(Number(row.code ?? row.status)); }
