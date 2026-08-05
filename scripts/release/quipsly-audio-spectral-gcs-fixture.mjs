#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { Storage } from "@google-cloud/storage";
import {
  AUDIO_SPECTRAL_CLOUD_QUEUE_KIND,
  AUDIO_SPECTRAL_TILE_BYTES,
  buildAudioSpectralCloudManifestObjectName,
  buildAudioSpectralCloudQueueObjectName,
  buildAudioSpectralCloudResultObjectName,
  buildAudioSpectralPackObjectName,
  newAudioSpectralCloudManifest,
  newAudioSpectralEvidenceJob,
  parseAudioSpectralCloudManifest,
  parseAudioSpectralEvidenceResult,
} from "../../packages/quipsly-media-processing/src/index.ts";
import { FfmpegAudioSpectralAnalyzer } from "../../apps/quipsly-media-processor/src/audio-spectral-evidence-ffmpeg.ts";
import { processAudioSpectralCloudQueueObject } from "../../apps/quipsly-media-processor/src/audio-spectral-cloud-worker.ts";
import { GcsCaptureProxyWorkerStorage } from "../../apps/quipsly-media-processor/src/gcs-storage.ts";

const execute = promisify(execFile);
if (process.env.ALLOW_GCS_FIXTURE !== "1") throw new Error("Set ALLOW_GCS_FIXTURE=1 to create one isolated audio-spectral GCS fixture.");
const projectId = requiredEnvironment("PROJECT_ID", /^[a-z][a-z0-9-]{4,62}$/);
const bucketName = requiredEnvironment("QUIPSLY_MEDIA_BUCKET", /^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/);
const expectedBuildId = requiredEnvironment("EXPECTED_BUILD_ID", /^[0-9a-f]{40}$/);
const preserve = process.env.PRESERVE === "1";
const suffix = `${utcCompact()}-${randomBytes(6).toString("hex")}`;
const jobId = `audio-spectral-gcs-fixture-${suffix}`;
const assetId = `fixture-spectral-${suffix}`;
const sourceObjectName = `media-vault/raw/processor-fixtures/${jobId}/source.wav`;
const scratch = await mkdtemp(path.join(tmpdir(), "quipsly-audio-spectral-gcs-fixture-"));
const marker = path.join(scratch, ".quipsly-audio-spectral-gcs-fixture");
await writeFile(marker, jobId, { mode: 0o600 });
const storageClient = new Storage({ projectId });
const bucket = storageClient.bucket(bucketName);
const workerStorage = new GcsCaptureProxyWorkerStorage(bucketName, storageClient);
const createdObjectNames = [];

try {
  const sourcePath = path.join(scratch, "source.wav");
  await execute("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=180:duration=5:sample_rate=48000", "-f", "lavfi", "-i", "sine=frequency=4200:duration=6:sample_rate=48000", "-filter_complex", "[0:a]volume=0.20[a0];[1:a]volume=0.12[a1];[a0][a1]concat=n=2:v=0:a=1[out]", "-map", "[out]", "-c:a", "pcm_s24le", sourcePath]);
  const sourceBytes = await readFile(sourcePath);
  const sourceSha256 = digest(sourceBytes);
  await bucket.upload(sourcePath, { destination: sourceObjectName, resumable: false, validation: "crc32c", metadata: { contentType: "audio/wav", cacheControl: "private, no-store", metadata: { quipslyKind: "audio-spectral-gcs-fixture-v1", quipslyFixtureJobId: jobId, quipslyExpectedSha256: sourceSha256 } }, preconditionOpts: { ifGenerationMatch: 0 } });
  createdObjectNames.push(sourceObjectName);
  const sourceMetadata = await metadata(sourceObjectName);
  const source = { assetId, provider: "gcs", locator: `gcs://${bucketName}/${sourceObjectName}?generation=${sourceMetadata.generation}`, generation: sourceMetadata.generation, sha256: sourceSha256, sizeBytes: sourceMetadata.sizeBytes, contentType: "audio/wav" };
  const queuedAt = new Date().toISOString();
  const job = newAudioSpectralEvidenceJob({ jobId, projectId: `project-${suffix}`, requestedByEmail: "processor-fixture@highgroundodyssey.com", queuedAt, source });
  const manifestObjectName = buildAudioSpectralCloudManifestObjectName(jobId);
  const queueObjectName = buildAudioSpectralCloudQueueObjectName(jobId);
  const resultObjectName = buildAudioSpectralCloudResultObjectName(jobId);
  const packObjectName = buildAudioSpectralPackObjectName({ assetId, sourceSha256 });
  createdObjectNames.push(manifestObjectName, queueObjectName, resultObjectName, packObjectName);
  const storedManifest = await saveJsonIfAbsent(manifestObjectName, newAudioSpectralCloudManifest(job));
  const storedQueue = await saveJsonIfAbsent(queueObjectName, { kind: AUDIO_SPECTRAL_CLOUD_QUEUE_KIND, version: 1, jobId, manifestObjectName, manifestGeneration: storedManifest.generation, enqueuedAt: queuedAt });
  const options = { executionId: `local-gcs-fixture-${suffix}`, buildId: expectedBuildId, imageDigest: null, leaseDurationMs: 15 * 60 * 1_000, now: () => new Date() };
  const first = await processAudioSpectralCloudQueueObject(workerStorage, new FfmpegAudioSpectralAnalyzer(), options, { name: queueObjectName, generation: storedQueue.generation });
  assert.equal(first.disposition, "completed");
  assert.equal(first.tileCount, 5);
  assert.equal(first.packSizeBytes, 5 * AUDIO_SPECTRAL_TILE_BYTES);
  const completedStored = await loadJson(manifestObjectName);
  assert.equal(parseAudioSpectralCloudManifest(completedStored.value, jobId).status, "completed");
  const resultStored = await loadJson(resultObjectName);
  const result = parseAudioSpectralEvidenceResult(resultStored.value, job);
  assert.equal(result.pyramid.pack.provider, "gcs");
  assert.equal(result.analyzer.completeDecode, true);
  const packMetadata = await metadata(packObjectName, result.pyramid.pack.generation);
  const [packBytes] = await bucket.file(packObjectName, { generation: result.pyramid.pack.generation }).download({ validation: "crc32c" });
  assert.equal(packMetadata.sizeBytes, result.pyramid.pack.sizeBytes);
  assert.equal(digest(packBytes), result.pyramid.pack.sha256);
  const detail = result.pyramid.levels.find((level) => level.id === "detail");
  const [detailTile] = await bucket.file(packObjectName, { generation: result.pyramid.pack.generation }).download({ start: detail.byteOffset, end: detail.byteOffset + AUDIO_SPECTRAL_TILE_BYTES - 1 });
  assert.equal(detailTile.length, AUDIO_SPECTRAL_TILE_BYTES);
  assert.ok(detailTile.some((value) => value > 0));
  const [sourceReadback] = await bucket.file(sourceObjectName, { generation: source.generation }).download({ validation: "crc32c" });
  assert.equal(digest(sourceReadback), sourceSha256);
  const replayQueue = await saveJsonIfAbsent(queueObjectName, { kind: AUDIO_SPECTRAL_CLOUD_QUEUE_KIND, version: 1, jobId, manifestObjectName, manifestGeneration: completedStored.generation, enqueuedAt: queuedAt });
  const replay = await processAudioSpectralCloudQueueObject(workerStorage, new FfmpegAudioSpectralAnalyzer(), options, { name: queueObjectName, generation: replayQueue.generation });
  assert.equal(replay.disposition, "already-complete");
  assert.equal((await loadJson(resultObjectName)).generation, resultStored.generation);
  process.stdout.write(`${JSON.stringify({ kind: "quipsly-audio-spectral-gcs-fixture-report-v1", passed: true, projectId, bucketName, jobId, buildId: expectedBuildId, source: { ...source, unchangedAfterWorker: true }, pyramid: { durationSeconds: result.media.durationSeconds, levels: result.pyramid.levels.map(({ id, tileCount, tileSpanSeconds }) => ({ id, tileCount, tileSpanSeconds })), packGeneration: result.pyramid.pack.generation, packSha256: result.pyramid.pack.sha256, packSizeBytes: result.pyramid.pack.sizeBytes, exactRangeReadPassed: true }, boundaries: result.boundaries, replayWasCreateOnceNoOp: true, providerRecordingRequired: false, preserved: preserve, completedAt: new Date().toISOString() }, null, 2)}\n`);
} finally {
  if (!preserve) for (const objectName of [...new Set(createdObjectNames)]) { await deleteAllExactNameVersions(objectName); assert.equal((await exactNameVersions(objectName)).length, 0, `Fixture cleanup retained ${objectName}.`); }
  if ((await readFile(marker, "utf8").catch(() => "")) === jobId) await rm(scratch, { recursive: true, force: true });
}

async function saveJsonIfAbsent(objectName, value) { try { await bucket.file(objectName).save(JSON.stringify(value), { resumable: false, validation: "crc32c", contentType: "application/json; charset=utf-8", metadata: { cacheControl: "private, no-store" }, preconditionOpts: { ifGenerationMatch: 0 } }); } catch (error) { if (![409, 412].includes(Number(error?.code ?? error?.status))) throw error; } return loadJson(objectName); }
async function loadJson(objectName) { const current = await metadata(objectName); const [raw] = await bucket.file(objectName, { generation: current.generation }).download({ validation: "crc32c" }); return { value: JSON.parse(raw.toString("utf8")), generation: current.generation }; }
async function metadata(objectName, generation) { const [value] = await bucket.file(objectName, generation ? { generation } : undefined).getMetadata(); return { generation: requiredGeneration(value.generation), sizeBytes: Number(value.size), contentType: String(value.contentType || "") }; }
async function exactNameVersions(objectName) { const [files] = await bucket.getFiles({ prefix: objectName, versions: true }); return files.filter((file) => file.name === objectName); }
async function deleteAllExactNameVersions(objectName) { for (const file of await exactNameVersions(objectName)) { const [value] = await file.getMetadata(); const generation = requiredGeneration(value.generation); await bucket.file(objectName, { generation }).delete({ ifGenerationMatch: generation }); } }
function requiredEnvironment(name, pattern) { const value = String(process.env[name] || "").trim(); if (!pattern.test(value)) throw new Error(`${name} is missing or invalid.`); return value; }
function requiredGeneration(value) { const generation = String(value || ""); if (!/^[1-9][0-9]*$/.test(generation)) throw new Error("GCS generation is invalid."); return generation; }
function digest(value) { return createHash("sha256").update(value).digest("hex"); }
function utcCompact() { return new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14); }
