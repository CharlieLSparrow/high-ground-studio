import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  AUDIO_SPECTRAL_CLOUD_QUEUE_PREFIX,
  AUDIO_SPECTRAL_EVIDENCE_CONTRACT_VERSION,
  AUDIO_SPECTRAL_EVIDENCE_RESULT_KIND,
  buildAudioSpectralCloudDeadLetterObjectName,
  buildAudioSpectralCloudManifestObjectName,
  buildAudioSpectralCloudQueueObjectName,
  buildAudioSpectralCloudResultObjectName,
  buildAudioSpectralPackObjectName,
  claimAudioSpectralCloudManifest,
  completeAudioSpectralCloudManifest,
  failAudioSpectralCloudManifest,
  parseAudioSpectralCloudManifest,
  parseAudioSpectralCloudQueueReceipt,
  parseAudioSpectralEvidenceResult,
  releaseAudioSpectralCloudLease,
  type AudioSpectralCloudManifest,
} from "@high-ground/quipsly-media-processing";

import { AudioSpectralDecodeError, FfmpegAudioSpectralAnalyzer } from "./audio-spectral-evidence-ffmpeg.js";
import type { CaptureProxyWorkerOptions, CaptureProxyWorkerStorage, ObjectEvidence, QueueObject, StoredJson } from "./worker.js";

export type AudioSpectralCloudWorkerResult =
  | { disposition: "completed"; jobId: string; tileCount: number; packSizeBytes: number }
  | { disposition: "already-complete"; jobId: string }
  | { disposition: "terminal"; jobId: string; code: string }
  | { disposition: "busy"; jobId: string }
  | { disposition: "claim-lost"; jobId: string };

class TerminalCloudSpectralError extends Error {
  readonly code: string;
  constructor(code: string, message: string) { super(message); this.name = "TerminalCloudSpectralError"; this.code = code; }
}

export async function runAudioSpectralCloudWorker(storage: CaptureProxyWorkerStorage, analyzer: FfmpegAudioSpectralAnalyzer, options: CaptureProxyWorkerOptions, limit: number) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) throw new Error("Audio spectral cloud worker limit must be between 1 and 20.");
  const queue = await storage.listQueueObjectsUnder(`${AUDIO_SPECTRAL_CLOUD_QUEUE_PREFIX}/`, limit);
  const results: AudioSpectralCloudWorkerResult[] = [];
  const retries: Error[] = [];
  for (const object of queue) {
    try { results.push(await processAudioSpectralCloudQueueObject(storage, analyzer, options, object)); }
    catch (error) { retries.push(error instanceof Error ? error : new Error("Unknown cloud spectral failure.")); }
  }
  if (retries.length) throw new AggregateError(retries, `${retries.length} audio spectral cloud job(s) need retry.`);
  return results;
}

export async function processAudioSpectralCloudQueueObject(
  storage: CaptureProxyWorkerStorage,
  analyzer: FfmpegAudioSpectralAnalyzer,
  options: CaptureProxyWorkerOptions,
  queueObject: QueueObject,
): Promise<AudioSpectralCloudWorkerResult> {
  let receipt;
  try { receipt = parseAudioSpectralCloudQueueReceipt((await storage.loadJson(queueObject.name, queueObject.generation)).value); }
  catch (error) { return quarantine(storage, queueObject, fallbackJobId(queueObject.name), "audio-spectral-queue-invalid", detail(error), options.now()); }
  if (queueObject.name !== buildAudioSpectralCloudQueueObjectName(receipt.jobId)) return quarantine(storage, queueObject, receipt.jobId, "audio-spectral-queue-path-mismatch", "Spectral queue path does not match its job.", options.now());
  let storedManifest: StoredJson;
  let manifest: AudioSpectralCloudManifest;
  try {
    storedManifest = await storage.loadJson(receipt.manifestObjectName);
    manifest = parseAudioSpectralCloudManifest(storedManifest.value, receipt.jobId);
    if (manifest.status === "queued" && storedManifest.generation !== receipt.manifestGeneration) throw new Error("Queued spectral manifest generation no longer matches its receipt.");
  } catch (error) { return quarantine(storage, queueObject, receipt.jobId, "audio-spectral-manifest-invalid", detail(error), options.now()); }
  if (manifest.status === "completed") {
    parseAudioSpectralEvidenceResult((await storage.loadJson(buildAudioSpectralCloudResultObjectName(manifest.job.jobId))).value, manifest.job);
    await storage.deleteObject(queueObject.name, queueObject.generation);
    return { disposition: "already-complete", jobId: manifest.job.jobId };
  }
  if (manifest.status === "failed-terminal") { await deadLetter(storage, queueObject, manifest); return { disposition: "terminal", jobId: manifest.job.jobId, code: manifest.failure!.code }; }
  const leaseId = randomUUID();
  const claimed = claimAudioSpectralCloudManifest({ manifest, leaseId, executionId: options.executionId, now: options.now(), leaseDurationMs: options.leaseDurationMs });
  if (!claimed) return { disposition: "busy", jobId: manifest.job.jobId };
  try {
    storedManifest = await storage.saveJson(receipt.manifestObjectName, claimed, storedManifest.generation);
    manifest = parseAudioSpectralCloudManifest(storedManifest.value, receipt.jobId);
  } catch (error) { if (precondition(error)) return { disposition: "claim-lost", jobId: manifest.job.jobId }; throw error; }

  const scratch = await mkdtemp(path.join(tmpdir(), "quipsly-audio-spectral-cloud-"));
  try {
    const sourceLocation = gcsLocation(manifest.job.source.locator, manifest.job.source.generation, "media-vault/");
    const sourcePath = path.join(scratch, "source");
    assertSource(manifest, sourceLocation.bucketName, await storage.objectEvidence(sourceLocation.objectName, sourceLocation.generation));
    const materialized = await storage.materializeObject(sourceLocation.objectName, sourceLocation.generation, sourcePath);
    if (materialized.sha256 !== manifest.job.source.sha256 || materialized.sizeBytes !== manifest.job.source.sizeBytes) throw new TerminalCloudSpectralError("audio-spectral-source-byte-mismatch", "Materialized spectral source failed its immutable byte receipt.");

    const localPackPath = path.join(scratch, "pyramid.qspx");
    const artifact = await analyzer.analyze(sourcePath, localPackPath);
    if (artifact.pyramid.pack.provider !== "local") throw new TerminalCloudSpectralError("audio-spectral-analyzer-pack-invalid", "Spectral analyzer did not produce a local verified pack.");
    const targetObjectName = buildAudioSpectralPackObjectName({ assetId: manifest.job.source.assetId, sourceSha256: manifest.job.source.sha256 });
    const uploaded = await storage.uploadProxy(localPackPath, targetObjectName, artifact.pyramid.pack.contentType, {
      quipslyKind: "audio-spectral-pack-v1",
      quipslyAssetId: manifest.job.source.assetId,
      quipslySourceGeneration: manifest.job.source.generation,
      quipslySourceSha256: manifest.job.source.sha256,
      quipslyAlgorithm: artifact.pyramid.algorithm,
      quipslyPackSha256: artifact.pyramid.pack.sha256,
      quipslyPackSizeBytes: String(artifact.pyramid.pack.sizeBytes),
      quipslyOriginalRemainsSourceTruth: "true",
    });
    assertPack(uploaded, targetObjectName, manifest, artifact.pyramid.pack.sha256, artifact.pyramid.pack.sizeBytes);
    const storedPackPath = path.join(scratch, "stored-pyramid.qspx");
    const storedPack = await storage.materializeObject(targetObjectName, uploaded.generation, storedPackPath);
    if (storedPack.sha256 !== artifact.pyramid.pack.sha256 || storedPack.sizeBytes !== artifact.pyramid.pack.sizeBytes) throw new TerminalCloudSpectralError("audio-spectral-pack-readback-mismatch", "Stored spectral pack failed exact-generation hash readback.");
    const currentSource = await storage.materializeObject(sourceLocation.objectName, sourceLocation.generation, path.join(scratch, "source-readback"));
    if (currentSource.sha256 !== manifest.job.source.sha256 || currentSource.sizeBytes !== manifest.job.source.sizeBytes) throw new TerminalCloudSpectralError("audio-spectral-source-drift", "The immutable source changed during spectral analysis.");

    const result = parseAudioSpectralEvidenceResult({
      kind: AUDIO_SPECTRAL_EVIDENCE_RESULT_KIND,
      version: AUDIO_SPECTRAL_EVIDENCE_CONTRACT_VERSION,
      jobId: manifest.job.jobId,
      completedAt: options.now().toISOString(),
      source: manifest.job.source,
      media: artifact.media,
      pyramid: { ...artifact.pyramid, pack: { provider: "gcs", locator: `gcs://${sourceLocation.bucketName}/${targetObjectName}?generation=${uploaded.generation}`, generation: uploaded.generation, sha256: artifact.pyramid.pack.sha256, sizeBytes: artifact.pyramid.pack.sizeBytes, contentType: artifact.pyramid.pack.contentType } },
      analyzer: { ffmpegVersion: artifact.ffmpegVersion, completeDecode: true, detailFrameCount: artifact.detailFrameCount },
      worker: { executionId: options.executionId, buildId: options.buildId, imageDigest: options.imageDigest, attempt: manifest.lease!.attempt },
      boundaries: { originalRemainsSourceTruth: true, analysisDoesNotChangeMedia: true, visualEvidenceIsNotAnEqDecision: true, repairCandidatesRequirePlaybackReview: true },
    }, manifest.job);
    const storedResult = await storage.saveJsonIfAbsent(buildAudioSpectralCloudResultObjectName(manifest.job.jobId), result);
    const canonical = parseAudioSpectralEvidenceResult(storedResult.value, manifest.job);
    const latest = await storage.loadJson(receipt.manifestObjectName);
    const completed = completeAudioSpectralCloudManifest({ manifest: parseAudioSpectralCloudManifest(latest.value, manifest.job.jobId), leaseId, result: canonical, now: options.now() });
    await storage.saveJson(receipt.manifestObjectName, completed, latest.generation);
    await storage.deleteObject(queueObject.name, queueObject.generation);
    return { disposition: "completed", jobId: manifest.job.jobId, tileCount: canonical.pyramid.levels.reduce((total, level) => total + level.tileCount, 0), packSizeBytes: canonical.pyramid.pack.sizeBytes };
  } catch (error) {
    const terminal = error instanceof TerminalCloudSpectralError || (error instanceof AudioSpectralDecodeError && !error.retryable);
    if (terminal) {
      const normalized = error instanceof TerminalCloudSpectralError ? error : new TerminalCloudSpectralError(error.code, error.message);
      const failed = await terminalFailure(storage, receipt.manifestObjectName, manifest.job.jobId, leaseId, normalized, options.now());
      await deadLetter(storage, queueObject, failed);
      return { disposition: "terminal", jobId: manifest.job.jobId, code: normalized.code };
    }
    await releaseLease(storage, receipt.manifestObjectName, manifest.job.jobId, leaseId, options.now());
    throw error;
  } finally { await rm(scratch, { recursive: true, force: true }); }
}

function assertSource(manifest: AudioSpectralCloudManifest, bucketName: string, evidence: ObjectEvidence | null) { if (!evidence || evidence.bucketName !== bucketName || evidence.generation !== manifest.job.source.generation || evidence.sizeBytes !== manifest.job.source.sizeBytes || evidence.contentType !== manifest.job.source.contentType) throw new TerminalCloudSpectralError("audio-spectral-source-generation-mismatch", "Cloud source generation evidence no longer matches its spectral binding."); }
function assertPack(evidence: ObjectEvidence, objectName: string, manifest: AudioSpectralCloudManifest, sha256: string, sizeBytes: number) { const metadata = evidence.customMetadata; if (evidence.objectName !== objectName || evidence.sizeBytes !== sizeBytes || evidence.contentType !== "application/vnd.quipsly.spectral-tile-pack" || metadata.quipslyKind !== "audio-spectral-pack-v1" || metadata.quipslyAssetId !== manifest.job.source.assetId || metadata.quipslySourceGeneration !== manifest.job.source.generation || metadata.quipslySourceSha256 !== manifest.job.source.sha256 || metadata.quipslyAlgorithm !== manifest.job.analyzer.algorithm || metadata.quipslyPackSha256 !== sha256 || metadata.quipslyPackSizeBytes !== String(sizeBytes) || metadata.quipslyOriginalRemainsSourceTruth !== "true") throw new TerminalCloudSpectralError("audio-spectral-pack-object-mismatch", "Stored spectral pack failed its immutable metadata receipt."); }
async function terminalFailure(storage: CaptureProxyWorkerStorage, objectName: string, jobId: string, leaseId: string, error: TerminalCloudSpectralError, now: Date) { const latest = await storage.loadJson(objectName); const failed = failAudioSpectralCloudManifest({ manifest: parseAudioSpectralCloudManifest(latest.value, jobId), leaseId, code: error.code, message: error.message, now }); const stored = await storage.saveJson(objectName, failed, latest.generation); return parseAudioSpectralCloudManifest(stored.value, jobId); }
async function releaseLease(storage: CaptureProxyWorkerStorage, objectName: string, jobId: string, leaseId: string, now: Date) { try { const latest = await storage.loadJson(objectName); const manifest = parseAudioSpectralCloudManifest(latest.value, jobId); if (manifest.status !== "processing" || manifest.lease?.id !== leaseId) return; await storage.saveJson(objectName, releaseAudioSpectralCloudLease({ manifest, leaseId, now }), latest.generation); } catch { /* another generation owns retry */ } }
async function quarantine(storage: CaptureProxyWorkerStorage, queue: QueueObject, jobId: string, code: string, message: string, now: Date): Promise<AudioSpectralCloudWorkerResult> { await storage.writeDeadLetter(buildAudioSpectralCloudDeadLetterObjectName(jobId), { kind: "quipsly-audio-spectral-cloud-dead-letter-v1", version: 1, jobId, code, message, failedAt: now.toISOString() }, queue.generation); await storage.deleteObject(queue.name, queue.generation); return { disposition: "terminal", jobId, code }; }
async function deadLetter(storage: CaptureProxyWorkerStorage, queue: QueueObject, manifest: AudioSpectralCloudManifest) { await storage.writeDeadLetter(buildAudioSpectralCloudDeadLetterObjectName(manifest.job.jobId), { kind: "quipsly-audio-spectral-cloud-dead-letter-v1", version: 1, jobId: manifest.job.jobId, manifestObjectName: buildAudioSpectralCloudManifestObjectName(manifest.job.jobId), failure: manifest.failure }, queue.generation); await storage.deleteObject(queue.name, queue.generation); }
function gcsLocation(locator: string, generation: string, requiredPrefix: string) { const match = /^gcs:\/\/([a-z0-9][a-z0-9._-]{1,221}[a-z0-9])\/(media-vault\/.+)\?generation=([1-9][0-9]*)$/.exec(locator); if (!match || match[3] !== generation || !match[2].startsWith(requiredPrefix) || match[2].split("/").some((part) => !part || part === "." || part === "..")) throw new TerminalCloudSpectralError("audio-spectral-gcs-locator-invalid", "Cloud spectral evidence requires a generation-bound media-vault source."); return { bucketName: match[1], objectName: match[2], generation: match[3] }; }
function fallbackJobId(name: string) { const tail = name.split("/").pop()?.replace(/\.json$/, "") || ""; return /^[A-Za-z0-9_-]{8,160}$/.test(tail) ? tail : `invalid_${Buffer.from(name).toString("hex").slice(0, 24)}`; }
function detail(error: unknown) { return error instanceof Error && error.message.trim() ? error.message : "Audio spectral cloud processing failed."; }
function precondition(error: unknown) { const row = error as { code?: unknown; status?: unknown }; return [409, 412].includes(Number(row.code ?? row.status)); }
