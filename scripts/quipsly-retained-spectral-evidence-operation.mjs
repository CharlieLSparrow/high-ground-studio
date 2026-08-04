#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { newAudioSpectralEvidenceJob, parseAudioSpectralEvidenceResult } from "../packages/quipsly-media-processing/src/index.ts";
import { newLocalAudioSpectralRuntime, runOneLocalAudioSpectralEvidenceJob } from "../apps/quipsly-media-processor/src/local-audio-spectral-evidence-worker.ts";
import { sha256File } from "../apps/quipsly-media-processor/src/transcoder.ts";
import pg from "pg";

if (process.env.QUIPSLY_RETAINED_SPECTRAL_EVIDENCE_OPERATION !== "1") throw new Error("Set QUIPSLY_RETAINED_SPECTRAL_EVIDENCE_OPERATION=1 to retain spectral evidence in local Quipsly.");
const databaseUrl = process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio";
const parsed = new URL(databaseUrl);
assert.ok(["127.0.0.1", "localhost", "::1"].includes(parsed.hostname), "Retained spectral operation requires loopback PostgreSQL.");
const localMediaRoot = path.resolve(process.env.QUIPSLY_LOCAL_MEDIA_UPLOAD_ROOT || path.join(tmpdir(), "quipsly-media-ingest"));
const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });

function inside(root, candidate) { const relative = path.relative(root, candidate); return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative); }

async function sources() {
  const result = await pool.query({
    text: `
      SELECT DISTINCT ON ("journey") * FROM (
        SELECT 'podcast' AS "journey", p.id AS "projectId", p.slug AS "projectSlug", a.id AS "assetId", a.filename, a."mimeType", a."sizeBytes", a."createdAt", s.id AS "sourceId", s."providerSourceId"
        FROM "StudioMediaAsset" a JOIN "StudioAssetAttachment" aa ON aa."assetId"=a.id JOIN "StudioProject" p ON p.id=aa."projectId" JOIN "StudioVideoSource" s ON s.id=COALESCE(aa."metadataJson"->>'sourceId','')
        WHERE p.slug='high-ground-odyssey' AND a.filename='Ted Lasso Be Curious.mp4' AND a."isProxy"=false
        UNION ALL
        SELECT 'coaching', p.id, p.slug, a.id, a.filename, a."mimeType", a."sizeBytes", a."createdAt", s.id, s."providerSourceId"
        FROM "StudioMediaAsset" a JOIN "StudioAssetAttachment" aa ON aa."assetId"=a.id JOIN "StudioProject" p ON p.id=aa."projectId" JOIN "StudioVideoSource" s ON s.id='retained-coaching-continuity-source-20260803'
        WHERE a.id='retained-coaching-continuity-media-20260803' AND a."isProxy"=false
      ) selected ORDER BY "journey", "createdAt" DESC`,
  });
  assert.deepEqual(result.rows.map((row) => row.journey).sort(), ["coaching", "podcast"]);
  return result.rows;
}

async function operate(source) {
  const sourcePath = path.resolve(source.providerSourceId);
  assert.ok(inside(localMediaRoot, sourcePath), `${source.journey} source escaped the authorized local media root.`);
  const before = await stat(sourcePath);
  assert.ok(before.isFile() && before.size > 0);
  assert.equal(before.size, Number(source.sizeBytes));
  const sourceSha256 = await sha256File(sourcePath);
  const reusable = await pool.query({ text: `SELECT id,status,"inputJson","resultJson" FROM "StudioAssetProcessingJob" WHERE "projectId"=$1 AND "assetId"=$2 AND type='audio-spectral-evidence' AND status='completed' ORDER BY "createdAt" DESC LIMIT 1`, values: [source.projectId, source.assetId] });
  if (reusable.rows[0]) {
    try {
      const receipt = parseAudioSpectralEvidenceResult(reusable.rows[0].resultJson.receipt, reusable.rows[0].inputJson);
      if (receipt.source.sha256 === sourceSha256 && receipt.source.sizeBytes === before.size) return resultSummary(source, reusable.rows[0].id, receipt, sourceSha256, true);
    } catch { /* create a fresh source-bound receipt */ }
  }
  const job = newAudioSpectralEvidenceJob({
    jobId: `audio_spectral_retained_${randomUUID().replaceAll("-", "")}`,
    projectId: source.projectId,
    requestedByEmail: "quipsly-audio-qa@local.test",
    queuedAt: new Date().toISOString(),
    source: { assetId: source.assetId, provider: "local", locator: sourcePath, generation: `sha256:${sourceSha256}`, sha256: sourceSha256, sizeBytes: before.size, contentType: source.mimeType },
  });
  await pool.query({ text: `INSERT INTO "StudioAssetProcessingJob" (id,"projectId","assetId",type,status,"requestedByEmail","inputJson","createdAt","updatedAt") VALUES ($1,$2,$3,'audio-spectral-evidence','queued',$4,$5::jsonb,NOW(),NOW())`, values: [job.jobId, job.projectId, job.source.assetId, job.requestedByEmail, JSON.stringify(job)] });
  const runtime = newLocalAudioSpectralRuntime({ pool, localMediaRoot, leaseMs: 15 * 60 * 1_000, buildId: "retained-spectral-operation-2026-08-04" });
  const worker = await runOneLocalAudioSpectralEvidenceJob(runtime.store, runtime.analyzer, runtime.options);
  assert.equal(worker.disposition, "completed");
  assert.equal(worker.jobId, job.jobId);
  const row = await pool.query({ text: `SELECT status,"resultJson",error FROM "StudioAssetProcessingJob" WHERE id=$1`, values: [job.jobId] });
  assert.equal(row.rows[0]?.status, "output-ready", row.rows[0]?.error);
  const receipt = parseAudioSpectralEvidenceResult(row.rows[0].resultJson.receipt, job);
  assert.equal(await sha256File(sourcePath), sourceSha256, "Immutable source changed during spectral analysis.");
  const pack = await stat(receipt.pyramid.pack.locator);
  assert.equal(pack.size, receipt.pyramid.pack.sizeBytes);
  assert.equal(await sha256File(receipt.pyramid.pack.locator), receipt.pyramid.pack.sha256);
  await pool.query({ text: `UPDATE "StudioAssetProcessingJob" SET status='completed',"completedAt"=$2,"updatedAt"=NOW(),"resultJson"=$3::jsonb WHERE id=$1 AND status='output-ready'`, values: [job.jobId, new Date(receipt.completedAt), JSON.stringify({ state: "completed", receipt, registration: { packVerified: true, originalRemainsSourceTruth: true, analysisDoesNotChangeMedia: true } })] });
  return resultSummary(source, job.jobId, receipt, sourceSha256, false);
}

function resultSummary(source, jobId, receipt, sourceSha256, reused) {
  return {
    journey: source.journey,
    projectSlug: source.projectSlug,
    assetId: source.assetId,
    sourceId: source.sourceId,
    filename: source.filename,
    jobId,
    reused,
    source: { sha256: sourceSha256, sizeBytes: Number(source.sizeBytes), unchanged: true },
    media: receipt.media,
    levels: receipt.pyramid.levels.map(({ id, tileSpanSeconds, tileCount }) => ({ id, tileSpanSeconds, tileCount })),
    pack: { sha256: receipt.pyramid.pack.sha256, sizeBytes: receipt.pyramid.pack.sizeBytes },
    boundaries: receipt.boundaries,
  };
}

try {
  const operated = [];
  for (const source of await sources()) operated.push(await operate(source));
  process.stdout.write(`${JSON.stringify({ ok: true, operation: "retained-spectral-evidence", localOnly: true, externalSideEffects: false, journeys: operated }, null, 2)}\n`);
} finally { await pool.end(); }
