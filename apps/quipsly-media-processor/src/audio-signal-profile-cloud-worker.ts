import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  AUDIO_SIGNAL_PROFILE_CLOUD_QUEUE_PREFIX,
  AUDIO_SIGNAL_PROFILE_CONTRACT_VERSION,
  AUDIO_SIGNAL_PROFILE_RESULT_KIND,
  buildAudioSignalProfileCloudDeadLetterObjectName,
  buildAudioSignalProfileCloudManifestObjectName,
  buildAudioSignalProfileCloudQueueObjectName,
  buildAudioSignalProfileCloudResultObjectName,
  claimAudioSignalProfileCloudManifest,
  completeAudioSignalProfileCloudManifest,
  failAudioSignalProfileCloudManifest,
  parseAudioSignalProfileCloudManifest,
  parseAudioSignalProfileCloudQueueReceipt,
  parseAudioSignalProfileResult,
  releaseAudioSignalProfileCloudLease,
  type AudioSignalProfileCloudManifest,
} from "@high-ground/quipsly-media-processing";

import { AudioSignalProfileDecodeError, FfmpegAudioSignalProfiler } from "./audio-signal-profile-ffmpeg.js";
import type { CaptureProxyWorkerOptions, CaptureProxyWorkerStorage, ObjectEvidence, QueueObject, StoredJson } from "./worker.js";

export type AudioSignalProfileCloudWorkerResult =
  | { disposition: "completed"; jobId: string; windowCount: number }
  | { disposition: "already-complete"; jobId: string }
  | { disposition: "terminal"; jobId: string; code: string }
  | { disposition: "busy"; jobId: string }
  | { disposition: "claim-lost"; jobId: string };

class TerminalCloudSignalError extends Error {
  readonly code: string;
  constructor(code: string, message: string) { super(message); this.name = "TerminalCloudSignalError"; this.code = code; }
}

export async function runAudioSignalProfileCloudWorker(storage: CaptureProxyWorkerStorage, profiler: FfmpegAudioSignalProfiler, options: CaptureProxyWorkerOptions, limit: number) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) throw new Error("Audio signal profile cloud worker limit must be between 1 and 20.");
  const queue = await storage.listQueueObjectsUnder(`${AUDIO_SIGNAL_PROFILE_CLOUD_QUEUE_PREFIX}/`, limit);
  const results: AudioSignalProfileCloudWorkerResult[] = [];
  const retries: Error[] = [];
  for (const object of queue) {
    try { results.push(await processAudioSignalProfileCloudQueueObject(storage, profiler, options, object)); }
    catch (error) { retries.push(error instanceof Error ? error : new Error("Unknown cloud signal profiling failure.")); }
  }
  if (retries.length) throw new AggregateError(retries, `${retries.length} audio signal profile cloud job(s) need retry.`);
  return results;
}

export async function processAudioSignalProfileCloudQueueObject(
  storage: CaptureProxyWorkerStorage,
  profiler: FfmpegAudioSignalProfiler,
  options: CaptureProxyWorkerOptions,
  queueObject: QueueObject,
): Promise<AudioSignalProfileCloudWorkerResult> {
  let receipt;
  try { receipt = parseAudioSignalProfileCloudQueueReceipt((await storage.loadJson(queueObject.name, queueObject.generation)).value); }
  catch (error) { return quarantine(storage, queueObject, fallbackJobId(queueObject.name), "audio-signal-queue-invalid", detail(error), options.now()); }
  if (queueObject.name !== buildAudioSignalProfileCloudQueueObjectName(receipt.jobId)) return quarantine(storage, queueObject, receipt.jobId, "audio-signal-queue-path-mismatch", "Signal profile queue path does not match its job.", options.now());
  let storedManifest: StoredJson;
  let manifest: AudioSignalProfileCloudManifest;
  try {
    storedManifest = await storage.loadJson(receipt.manifestObjectName);
    manifest = parseAudioSignalProfileCloudManifest(storedManifest.value, receipt.jobId);
    if (manifest.status === "queued" && storedManifest.generation !== receipt.manifestGeneration) throw new Error("Queued signal profile manifest generation no longer matches its receipt.");
  } catch (error) { return quarantine(storage, queueObject, receipt.jobId, "audio-signal-manifest-invalid", detail(error), options.now()); }
  if (manifest.status === "completed") {
    parseAudioSignalProfileResult((await storage.loadJson(buildAudioSignalProfileCloudResultObjectName(manifest.job.jobId))).value, manifest.job);
    await storage.deleteObject(queueObject.name, queueObject.generation);
    return { disposition: "already-complete", jobId: manifest.job.jobId };
  }
  if (manifest.status === "failed-terminal") {
    await deadLetter(storage, queueObject, manifest);
    return { disposition: "terminal", jobId: manifest.job.jobId, code: manifest.failure!.code };
  }
  const leaseId = randomUUID();
  const claimed = claimAudioSignalProfileCloudManifest({ manifest, leaseId, executionId: options.executionId, now: options.now(), leaseDurationMs: options.leaseDurationMs });
  if (!claimed) return { disposition: "busy", jobId: manifest.job.jobId };
  try {
    storedManifest = await storage.saveJson(receipt.manifestObjectName, claimed, storedManifest.generation);
    manifest = parseAudioSignalProfileCloudManifest(storedManifest.value, receipt.jobId);
  } catch (error) {
    if (precondition(error)) return { disposition: "claim-lost", jobId: manifest.job.jobId };
    throw error;
  }
  const scratch = await mkdtemp(path.join(tmpdir(), "quipsly-audio-signal-cloud-"));
  try {
    const location = gcsLocation(manifest.job.source.locator, manifest.job.source.generation);
    const sourcePath = path.join(scratch, "source");
    assertSource(manifest, location.bucketName, await storage.objectEvidence(location.objectName, location.generation));
    const materialized = await storage.materializeObject(location.objectName, location.generation, sourcePath);
    if (materialized.sha256 !== manifest.job.source.sha256 || materialized.sizeBytes !== manifest.job.source.sizeBytes) throw new TerminalCloudSignalError("audio-signal-source-byte-mismatch", "Materialized signal source failed its immutable byte receipt.");
    const profile = await profiler.analyze(sourcePath, { frequencyAnalysis: Boolean(manifest.job.analyzer.frequencyAnalysis) });
    const result = parseAudioSignalProfileResult({
      kind: AUDIO_SIGNAL_PROFILE_RESULT_KIND,
      version: AUDIO_SIGNAL_PROFILE_CONTRACT_VERSION,
      jobId: manifest.job.jobId,
      completedAt: options.now().toISOString(),
      source: manifest.job.source,
      media: profile.media,
      audioSignal: profile.audioSignal,
      analyzer: {
        algorithm: "quipsly-audio-signal-window-v1",
        ffmpegVersion: profile.ffmpegVersion,
        completeDecode: true,
        maximumWindows: 1_200,
        frequencyAnalysis: manifest.job.analyzer.frequencyAnalysis ? { algorithm: manifest.job.analyzer.frequencyAnalysis.algorithm, maximumBands: 6, maximumWindows: 1_200, completeDecode: true } : null,
      },
      worker: { executionId: options.executionId, buildId: options.buildId, imageDigest: options.imageDigest, attempt: manifest.lease!.attempt },
      boundaries: { originalRemainsSourceTruth: true, analysisDoesNotChangeMedia: true, observationsRequireHumanInterpretation: true },
    }, manifest.job);
    const storedResult = await storage.saveJsonIfAbsent(buildAudioSignalProfileCloudResultObjectName(manifest.job.jobId), result);
    const canonical = parseAudioSignalProfileResult(storedResult.value, manifest.job);
    const latest = await storage.loadJson(receipt.manifestObjectName);
    const completed = completeAudioSignalProfileCloudManifest({ manifest: parseAudioSignalProfileCloudManifest(latest.value, manifest.job.jobId), leaseId, result: canonical, now: options.now() });
    await storage.saveJson(receipt.manifestObjectName, completed, latest.generation);
    await storage.deleteObject(queueObject.name, queueObject.generation);
    return { disposition: "completed", jobId: manifest.job.jobId, windowCount: canonical.audioSignal.waveform.length };
  } catch (error) {
    const terminal = error instanceof TerminalCloudSignalError || (error instanceof AudioSignalProfileDecodeError && !error.retryable);
    if (terminal) {
      const normalized = error instanceof TerminalCloudSignalError ? error : new TerminalCloudSignalError(error.code, error.message);
      const failed = await terminalFailure(storage, receipt.manifestObjectName, manifest.job.jobId, leaseId, normalized, options.now());
      await deadLetter(storage, queueObject, failed);
      return { disposition: "terminal", jobId: manifest.job.jobId, code: normalized.code };
    }
    await releaseLease(storage, receipt.manifestObjectName, manifest.job.jobId, leaseId, options.now());
    throw error;
  } finally { await rm(scratch, { recursive: true, force: true }); }
}

function assertSource(manifest: AudioSignalProfileCloudManifest, bucketName: string, evidence: ObjectEvidence | null) {
  if (!evidence || evidence.bucketName !== bucketName || evidence.generation !== manifest.job.source.generation || evidence.sizeBytes !== manifest.job.source.sizeBytes || evidence.contentType !== manifest.job.source.contentType) throw new TerminalCloudSignalError("audio-signal-source-generation-mismatch", "Cloud source generation evidence no longer matches its signal profile binding.");
}
async function terminalFailure(storage: CaptureProxyWorkerStorage, objectName: string, jobId: string, leaseId: string, error: TerminalCloudSignalError, now: Date) { const latest = await storage.loadJson(objectName); const failed = failAudioSignalProfileCloudManifest({ manifest: parseAudioSignalProfileCloudManifest(latest.value, jobId), leaseId, code: error.code, message: error.message, now }); const stored = await storage.saveJson(objectName, failed, latest.generation); return parseAudioSignalProfileCloudManifest(stored.value, jobId); }
async function releaseLease(storage: CaptureProxyWorkerStorage, objectName: string, jobId: string, leaseId: string, now: Date) { try { const latest = await storage.loadJson(objectName); const manifest = parseAudioSignalProfileCloudManifest(latest.value, jobId); if (manifest.status !== "processing" || manifest.lease?.id !== leaseId) return; await storage.saveJson(objectName, releaseAudioSignalProfileCloudLease({ manifest, leaseId, now }), latest.generation); } catch { /* another generation owns retry */ } }
async function quarantine(storage: CaptureProxyWorkerStorage, queue: QueueObject, jobId: string, code: string, message: string, now: Date): Promise<AudioSignalProfileCloudWorkerResult> { await storage.writeDeadLetter(buildAudioSignalProfileCloudDeadLetterObjectName(jobId), { kind: "quipsly-audio-signal-profile-cloud-dead-letter-v1", version: 1, jobId, code, message, failedAt: now.toISOString() }, queue.generation); await storage.deleteObject(queue.name, queue.generation); return { disposition: "terminal", jobId, code }; }
async function deadLetter(storage: CaptureProxyWorkerStorage, queue: QueueObject, manifest: AudioSignalProfileCloudManifest) { await storage.writeDeadLetter(buildAudioSignalProfileCloudDeadLetterObjectName(manifest.job.jobId), { kind: "quipsly-audio-signal-profile-cloud-dead-letter-v1", version: 1, jobId: manifest.job.jobId, manifestObjectName: buildAudioSignalProfileCloudManifestObjectName(manifest.job.jobId), failure: manifest.failure }, queue.generation); await storage.deleteObject(queue.name, queue.generation); }
function gcsLocation(locator: string, generation: string) { const match = /^gcs:\/\/([a-z0-9][a-z0-9._-]{1,221}[a-z0-9])\/(media-vault\/.+)\?generation=([1-9][0-9]*)$/.exec(locator); if (!match || match[3] !== generation || match[2].split("/").some((part) => !part || part === "." || part === "..")) throw new TerminalCloudSignalError("audio-signal-gcs-locator-invalid", "Cloud signal profiling requires a generation-bound media-vault source."); return { bucketName: match[1], objectName: match[2], generation: match[3] }; }
function fallbackJobId(name: string) { const tail = name.split("/").pop()?.replace(/\.json$/, "") || ""; return /^[A-Za-z0-9_-]{8,160}$/.test(tail) ? tail : `invalid_${Buffer.from(name).toString("hex").slice(0, 24)}`; }
function detail(error: unknown) { return error instanceof Error && error.message.trim() ? error.message : "Audio signal profile cloud processing failed."; }
function precondition(error: unknown) { const row = error as { code?: unknown; status?: unknown }; return [409, 412].includes(Number(row.code ?? row.status)); }
