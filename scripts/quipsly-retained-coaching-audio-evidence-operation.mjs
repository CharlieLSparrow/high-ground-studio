#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  newAudioSignalProfileJob,
  parseAudioSignalProfileJob,
  parseAudioSignalProfileResult,
} from "../packages/quipsly-media-processing/src/index.ts";
import { sha256File } from "../apps/quipsly-media-processor/src/transcoder.ts";
import pg from "pg";

const ROOM_ID = "retained-coaching-follow-up-20260731";
const RECORDING_ASSET_ID = "retained-coaching-continuity-asset-20260803";
const MEDIA_ASSET_ID = "retained-coaching-continuity-media-20260803";
const SOURCE_ID = "retained-coaching-continuity-source-20260803";

if (process.env.QUIPSLY_RETAINED_COACHING_AUDIO_EVIDENCE_OPERATION !== "1") {
  throw new Error("Set QUIPSLY_RETAINED_COACHING_AUDIO_EVIDENCE_OPERATION=1 to bind decoded evidence to the retained coaching source.");
}

const databaseUrl = process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio";
const parsedDatabase = new URL(databaseUrl);
assert.ok(["127.0.0.1", "localhost", "::1"].includes(parsedDatabase.hostname), "Retained coaching audio evidence requires loopback PostgreSQL.");
const localMediaRoot = path.resolve(process.env.QUIPSLY_LOCAL_MEDIA_UPLOAD_ROOT || path.join(tmpdir(), "quipsly-media-ingest"));
const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function readSource() {
  const result = await pool.query({
    text: `
      SELECT r.id AS "recordingAssetId", r."roomId", r."localManifestJson",
             a.id AS "mediaAssetId", a.filename, a."mimeType", a."sizeBytes",
             p.id AS "projectId", p.slug AS "projectSlug",
             s.id AS "sourceId", s."providerSourceId"
      FROM "RecordingAsset" r
      JOIN "TranscriptJob" t ON t."assetId" = r.id
      JOIN "StudioMediaAsset" a ON a.id = $3
      JOIN "StudioAssetAttachment" aa ON aa."assetId" = a.id
      JOIN "StudioProject" p ON p.id = aa."projectId"
      JOIN "StudioVideoSource" s ON s.id = $4
      WHERE r.id = $1 AND r."roomId" = $2
        AND t.id = 'retained-coaching-continuity-job-20260803'
        AND a.url = ('/api/ingest/media/' || s.id)
        AND s."providerSourceId" IS NOT NULL
      LIMIT 1
    `,
    values: [RECORDING_ASSET_ID, ROOM_ID, MEDIA_ASSET_ID, SOURCE_ID],
  });
  const source = result.rows[0];
  assert.ok(source, "The exact retained coaching recording-to-Studio source binding is missing.");
  assert.equal(source.mediaAssetId, MEDIA_ASSET_ID);
  assert.equal(source.sourceId, SOURCE_ID);
  return source;
}

async function latestReusableReceipt(source, binding) {
  const result = await pool.query({
    text: `SELECT id, status, "inputJson", "resultJson" FROM "StudioAssetProcessingJob"
           WHERE "projectId"=$1 AND "assetId"=$2 AND type='audio-signal-profile' AND status='completed'
           ORDER BY "createdAt" DESC LIMIT 1`,
    values: [source.projectId, source.mediaAssetId],
  });
  const row = result.rows[0];
  if (!row) return null;
  try {
    const job = parseAudioSignalProfileJob(row.inputJson, row.id);
    if (job.source.sha256 !== binding.sha256 || job.source.generation !== binding.generation || job.source.sizeBytes !== binding.sizeBytes) return null;
    const receipt = parseAudioSignalProfileResult(record(row.resultJson).receipt, job);
    if (!job.analyzer.frequencyAnalysis || !receipt.audioSignal.frequencyProfile) return null;
    return { job, receipt, reused: true };
  } catch {
    return null;
  }
}

async function runDurableProfile(source, binding) {
  const reusable = await latestReusableReceipt(source, binding);
  if (reusable) return reusable;
  const job = newAudioSignalProfileJob({
    jobId: `audio_signal_coaching_${randomUUID().replaceAll("-", "")}`,
    projectId: source.projectId,
    requestedByEmail: "quipsly-audio-qa@local.test",
    queuedAt: new Date().toISOString(),
    source: binding,
  });
  await pool.query({
    text: `INSERT INTO "StudioAssetProcessingJob"
      (id, "projectId", "assetId", type, status, "requestedByEmail", "inputJson", "createdAt", "updatedAt")
      VALUES ($1,$2,$3,'audio-signal-profile','queued',$4,$5::jsonb,NOW(),NOW())`,
    values: [job.jobId, job.projectId, job.source.assetId, job.requestedByEmail, JSON.stringify(job)],
  });
  let row = null;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const result = await pool.query({
      text: `SELECT status, "resultJson", error FROM "StudioAssetProcessingJob" WHERE id=$1`,
      values: [job.jobId],
    });
    row = result.rows[0];
    if (row?.status === "output-ready" || row?.status === "completed") break;
    if (row?.status === "failed") throw new Error(row.error || "The durable audio signal worker failed.");
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.ok(row && ["output-ready", "completed"].includes(row.status), "The durable audio signal worker did not finish within 30 seconds.");
  const receipt = parseAudioSignalProfileResult(record(row.resultJson).receipt, job);
  if (row.status === "output-ready") {
    await pool.query({
      text: `UPDATE "StudioAssetProcessingJob"
             SET status='completed', "completedAt"=$2, "updatedAt"=NOW(),
                 "resultJson"=$3::jsonb
             WHERE id=$1 AND status='output-ready'`,
      values: [job.jobId, new Date(receipt.completedAt), JSON.stringify({
        state: "completed",
        receipt,
        registration: { originalRemainsSourceTruth: true, analysisDoesNotChangeMedia: true },
      })],
    });
  }
  return { job, receipt, reused: false };
}

try {
  const source = await readSource();
  const sourcePath = path.resolve(source.providerSourceId);
  assert.ok(isInside(localMediaRoot, sourcePath), "The retained coaching source escaped the authorized local media root.");
  const sourceFile = await stat(sourcePath);
  assert.ok(sourceFile.isFile() && sourceFile.size > 0, "The retained coaching source is not a non-empty local file.");
  assert.equal(sourceFile.size, Number(source.sizeBytes), "The retained coaching source size drifted from its Studio asset.");
  const sourceSha256 = await sha256File(sourcePath);
  const binding = {
    assetId: source.mediaAssetId,
    provider: "local",
    locator: sourcePath,
    generation: `sha256:${sourceSha256}`,
    sha256: sourceSha256,
    sizeBytes: sourceFile.size,
    contentType: source.mimeType,
  };
  const analyzed = await runDurableProfile(source, binding);
  assert.equal(await sha256File(sourcePath), sourceSha256, "The immutable coaching source changed during complete decode.");
  const manifest = record(source.localManifestJson);
  const reportedSourceProfile = {
    kind: "quipsly-retained-coaching-source-profile-v1",
    source: "retained-coaching-complete-decode",
    originalPreserved: true,
    syntheticFixture: true,
    includesAudio: true,
    container: analyzed.receipt.media.container,
    codec: analyzed.receipt.media.codec,
    audioSampleRate: analyzed.receipt.media.sampleRate,
    audioChannelCount: analyzed.receipt.media.channelCount,
    audioRouteName: "QA retained immutable WAV",
    audioRoutePortType: "Local file",
    audioCapturePipeline: "durable-local-audio-signal-worker",
    pauseTimelinePolicy: "continuous-source-clock",
    sourceSha256,
    sourceGeneration: binding.generation,
    recordedMedia: {
      audioTrackCount: 1,
      audioSampleRate: analyzed.receipt.media.sampleRate,
      audioChannelCount: analyzed.receipt.media.channelCount,
      durationSeconds: analyzed.receipt.media.durationSeconds,
    },
    audioSignal: analyzed.receipt.audioSignal,
  };
  const projection = await pool.query({
    text: `UPDATE "RecordingAsset"
           SET "byteSize"=$2, checksum=$3, "durationSeconds"=$4,
               "localManifestJson"=$5::jsonb, "updatedAt"=NOW()
           WHERE id=$1 AND "roomId"=$6`,
    values: [
      RECORDING_ASSET_ID,
      sourceFile.size,
      sourceSha256,
      analyzed.receipt.media.durationSeconds,
      JSON.stringify({ ...manifest, reportedSourceProfile }),
      ROOM_ID,
    ],
  });
  assert.equal(projection.rowCount, 1, "The exact retained coaching recording disappeared before evidence projection.");

  process.stdout.write(`${JSON.stringify({
    ok: true,
    operation: "retained-coaching-audio-evidence",
    localOnly: true,
    retained: true,
    roomId: ROOM_ID,
    recordingAssetId: RECORDING_ASSET_ID,
    mediaAssetId: MEDIA_ASSET_ID,
    signalJobId: analyzed.job.jobId,
    reusedAnalysis: analyzed.reused,
    source: { filename: source.filename, sizeBytes: sourceFile.size, sha256: sourceSha256 },
    evidence: {
      completeDecode: analyzed.receipt.analyzer.completeDecode,
      durationSeconds: analyzed.receipt.audioSignal.durationSeconds,
      sampleRate: analyzed.receipt.audioSignal.sampleRate,
      channelCount: analyzed.receipt.audioSignal.channelCount,
      windowCount: analyzed.receipt.audioSignal.waveform.length,
      frequencyBandCount: analyzed.receipt.audioSignal.frequencyProfile?.bands.length ?? 0,
      frequencyWindowCount: analyzed.receipt.audioSignal.frequencyProfile?.windows.length ?? 0,
      signalStatus: analyzed.receipt.audioSignal.signalStatus,
      observationKinds: analyzed.receipt.audioSignal.observations.map((observation) => observation.kind),
    },
    originalUnchanged: true,
    transcriptSegmentsUnchanged: true,
    externalSideEffects: false,
  }, null, 2)}\n`);
} finally {
  await pool.end();
}
