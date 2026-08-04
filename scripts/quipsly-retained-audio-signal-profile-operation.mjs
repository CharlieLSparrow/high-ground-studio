import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  newAudioSignalProfileJob,
  parseAudioSignalProfileResult,
} from "../packages/quipsly-media-processing/src/index.ts";
import {
  newLocalAudioSignalProfileRuntime,
  runOneLocalAudioSignalProfileJob,
} from "../apps/quipsly-media-processor/src/local-audio-signal-profile-worker.ts";
import { sha256File } from "../apps/quipsly-media-processor/src/transcoder.ts";
import pg from "pg";

const SOURCE_FILENAME = process.env.QUIPSLY_RETAINED_AUDIO_SIGNAL_FILENAME || "quipsly-audio-mastery-dogfood.wav";

if (process.env.QUIPSLY_RETAINED_AUDIO_SIGNAL_PROFILE_OPERATION !== "1") {
  throw new Error("Set QUIPSLY_RETAINED_AUDIO_SIGNAL_PROFILE_OPERATION=1 to retain an analysis receipt in local Quipsly.");
}

const databaseUrl = process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio";
const parsedDatabase = new URL(databaseUrl);
assert.ok(["127.0.0.1", "localhost", "::1"].includes(parsedDatabase.hostname), "Retained signal operation requires loopback PostgreSQL.");
const localMediaRoot = path.resolve(process.env.QUIPSLY_LOCAL_MEDIA_UPLOAD_ROOT || path.join(tmpdir(), "quipsly-media-ingest"));
const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });

try {
  const selected = await pool.query({
    text: `
      SELECT a.id AS "assetId", a.filename, a."mimeType", a."sizeBytes",
             s.id AS "sourceId", s."providerSourceId", p.id AS "projectId", p.slug AS "projectSlug"
      FROM "StudioMediaAsset" a
      JOIN "StudioAssetAttachment" aa ON aa."assetId" = a.id
      JOIN "StudioProject" p ON p.id = aa."projectId"
      JOIN "StudioVideoSource" s ON s.id = COALESCE(aa."metadataJson"->>'sourceId', '')
      WHERE p.slug = 'high-ground-odyssey'
        AND a.filename = $1
        AND a."isProxy" = false
      ORDER BY a."createdAt" DESC
      LIMIT 1
    `,
    values: [SOURCE_FILENAME],
  });
  const source = selected.rows[0];
  assert.ok(source, "Retained High Ground Odyssey clip source is missing.");
  const sourcePath = path.resolve(source.providerSourceId);
  const file = await stat(sourcePath);
  assert.ok(file.isFile() && file.size > 0, "Retained source is not a non-empty local file.");
  assert.equal(file.size, Number(source.sizeBytes), "Database size no longer matches retained source bytes.");
  const sha256 = await sha256File(sourcePath);
  const job = newAudioSignalProfileJob({
    jobId: `audio_signal_retained_${randomUUID().replaceAll("-", "")}`,
    projectId: source.projectId,
    requestedByEmail: "quipsly-audio-qa@local.test",
    queuedAt: new Date().toISOString(),
    source: {
      assetId: source.assetId,
      provider: "local",
      locator: sourcePath,
      generation: `sha256:${sha256}`,
      sha256,
      sizeBytes: file.size,
      contentType: source.mimeType,
    },
  });
  await pool.query({
    text: `
      INSERT INTO "StudioAssetProcessingJob"
        (id, "projectId", "assetId", type, status, "requestedByEmail", "inputJson", "createdAt", "updatedAt")
      VALUES ($1, $2, $3, 'audio-signal-profile', 'queued', $4, $5::jsonb, NOW(), NOW())
    `,
    values: [job.jobId, job.projectId, job.source.assetId, job.requestedByEmail, JSON.stringify(job)],
  });
  let workerOwner = "operation-owned";
  if (process.env.QUIPSLY_RETAINED_AUDIO_SIGNAL_PROFILE_EXTERNAL_WORKER === "1") {
    workerOwner = "durable-launchd-worker";
  } else {
    const runtime = newLocalAudioSignalProfileRuntime({
      pool,
      localMediaRoot,
      leaseMs: 15 * 60 * 1_000,
      buildId: "retained-operation-2026-08-04",
    });
    const workerResult = await runOneLocalAudioSignalProfileJob(runtime.store, runtime.profiler, runtime.options);
    assert.equal(workerResult.disposition, "completed", "Durable worker did not complete the retained signal profile.");
    assert.equal(workerResult.jobId, job.jobId, "Durable worker claimed an unexpected job.");
  }
  let processed = await pool.query({ text: `SELECT status, "resultJson", error FROM "StudioAssetProcessingJob" WHERE id = $1`, values: [job.jobId] });
  for (let attempt = 0; workerOwner === "durable-launchd-worker" && attempt < 60 && processed.rows[0]?.status !== "output-ready"; attempt += 1) {
    if (processed.rows[0]?.status === "failed") throw new Error(processed.rows[0].error || "Durable launchd worker failed signal analysis.");
    await new Promise((resolve) => setTimeout(resolve, 500));
    processed = await pool.query({ text: `SELECT status, "resultJson", error FROM "StudioAssetProcessingJob" WHERE id = $1`, values: [job.jobId] });
  }
  assert.equal(processed.rows[0]?.status, "output-ready");
  const receipt = parseAudioSignalProfileResult(processed.rows[0].resultJson.receipt, job);
  assert.ok(receipt.audioSignal.frequencyProfile, "The retained profile did not produce complete-decode broad-band frequency evidence.");
  const sourceAfter = await stat(sourcePath);
  assert.equal(sourceAfter.size, file.size, "Retained source size changed during analysis.");
  assert.equal(await sha256File(sourcePath), sha256, "Retained source hash changed during analysis.");
  await pool.query({
    text: `UPDATE "StudioAssetProcessingJob" SET status='completed', "completedAt"=$2, "updatedAt"=NOW(), "resultJson"=$3::jsonb WHERE id=$1 AND status='output-ready'`,
    values: [job.jobId, new Date(receipt.completedAt), JSON.stringify({ state: "completed", receipt, registration: { originalRemainsSourceTruth: true, analysisDoesNotChangeMedia: true } })],
  });
  process.stdout.write(`${JSON.stringify({
    ok: true,
    operation: "retained-audio-signal-profile",
    workerOwner,
    jobId: job.jobId,
    projectSlug: source.projectSlug,
    source: { assetId: source.assetId, filename: source.filename, contentType: source.mimeType, sizeBytes: file.size, sha256 },
    evidence: {
      completeDecode: receipt.analyzer.completeDecode,
      durationSeconds: receipt.audioSignal.durationSeconds,
      sampleRate: receipt.audioSignal.sampleRate,
      channelCount: receipt.audioSignal.channelCount,
      windowCount: receipt.audioSignal.waveform.length,
      frequencyBandCount: receipt.audioSignal.frequencyProfile.bands.length,
      frequencyWindowCount: receipt.audioSignal.frequencyProfile.windows.length,
      frequencyAlgorithm: receipt.audioSignal.frequencyProfile.algorithm,
      signalStatus: receipt.audioSignal.signalStatus,
      observationKinds: receipt.audioSignal.observations.map((item) => item.kind),
    },
    boundaries: receipt.boundaries,
    finalRowStatus: "completed",
  }, null, 2)}\n`);
} finally {
  await pool.end();
}
