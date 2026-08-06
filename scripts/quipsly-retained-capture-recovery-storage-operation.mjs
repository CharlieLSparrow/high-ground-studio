#!/usr/bin/env node

import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

import {
  clearRenderedSession,
  loadPlaywright,
  requireLoopbackOrigin,
  signInThroughRenderedLogin,
} from "./lib/retained-qa-browser.mjs";
import { readRetainedQAPassword } from "./lib/retained-qa-keychain.mjs";

const requireFromQuipsly = createRequire(new URL("../apps/quipsly/package.json", import.meta.url));
const pg = requireFromQuipsly("pg");
const KEYCHAIN_SERVICE = "com.quipsly.qa.retained-product";
const OPERATOR_EMAIL = "quipsly-media-ms8ct81g@example.test";
const PROJECT_SLUG = "high-ground-odyssey-manuscript";
const EPISODE_SLUG = "capture-sync-rendezvous-qa-20260805";
const ROOM_ID = "cmsfpfwrt000db9xld8ppuon4";
const SPINE_RECORDING_ASSET_ID = "cmsi2ig7h000hlqxlwxtdmuq5";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function localDatabase(value) {
  const url = new URL(value);
  assert(["127.0.0.1", "localhost", "::1"].includes(url.hostname), "Recovery storage operation refuses a non-local database.");
  return value;
}

async function recoveryRequests(pool) {
  const selected = await pool.query({
    text: `SELECT r.id, r."localManifestJson" FROM "CallExpectedSource" e JOIN "RecordingAsset" r ON r.id=e."recordingAssetId" WHERE e."roomId"=$1 AND e.status='ACTIVE' ORDER BY e."createdAt" ASC`,
    values: [ROOM_ID],
  });
  return selected.rows.map((row) => {
    const manifest = object(row.localManifestJson);
    const recovery = object(manifest.captureSourceRecovery);
    assert(recovery.requestId && recovery.originalRecordingAssetId && recovery.replacementMediaAssetId && recovery.replacementSourceId, `Active source ${row.id} is not a complete retained recovery decision.`);
    return {
      recordingAssetId: row.id,
      body: {
        projectSlug: PROJECT_SLUG,
        episodeSlug: EPISODE_SLUG,
        captureGroupId: manifest.captureGroupId,
        originalRecordingAssetId: recovery.originalRecordingAssetId,
        importedMediaAssetId: recovery.replacementMediaAssetId,
        sourceId: recovery.replacementSourceId,
        reason: recovery.reason,
        requestId: recovery.requestId,
        authorityConfirmed: true,
      },
    };
  });
}

async function post(page, route, body) {
  return page.evaluate(async ({ route, body }) => {
    const response = await fetch(route, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  }, { route, body });
}

async function replayRecovery(page, body) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const result = await post(page, "/api/episode-production/capture-source-recovery", body);
    if (result.status !== 409 || result.body?.code !== "RECOVERY_EPISODE_CHANGED") return result;
    await page.waitForTimeout(150 * (attempt + 1));
  }
  return post(page, "/api/episode-production/capture-source-recovery", body);
}

async function storageReadback(pool, recordingAssetIds) {
  const selected = await pool.query({
    text: `SELECT r.id, r."storageBucket", r."storageObjectPath", r.checksum, r."byteSize", f."metadataJson" FROM "RecordingAsset" r JOIN "MobileCaptureFinalizationReceipt" f ON f."recordingAssetId"=r.id WHERE r.id = ANY($1::text[]) ORDER BY r.id`,
    values: [recordingAssetIds],
  });
  assert(selected.rows.length === recordingAssetIds.length, "A promoted recovery lost its finalization receipt.");
  return selected.rows.map((row) => {
    const binding = object(object(row.metadataJson).immutableUploadBinding);
    assert(row.storageBucket === "quipsly-local-development-vault", `Recovery ${row.id} did not enter the local Capture vault.`);
    assert(String(row.storageObjectPath).startsWith("media-vault/recordings/recovery/"), `Recovery ${row.id} is outside the recovery recording namespace.`);
    assert(binding.bucketName === row.storageBucket && binding.objectName === row.storageObjectPath, `Recovery ${row.id} receipt does not match its promoted object.`);
    assert(String(binding.sha256).toLowerCase() === String(row.checksum).toLowerCase(), `Recovery ${row.id} receipt lost its SHA-256 binding.`);
    assert(Number(binding.sizeBytes) === Number(row.byteSize), `Recovery ${row.id} receipt lost its exact-size binding.`);
    return { recordingAssetId: row.id, bucketName: row.storageBucket, objectName: row.storageObjectPath, sha256: row.checksum, sizeBytes: Number(row.byteSize) };
  });
}

async function completedSpineTranscript(pool) {
  const selected = await pool.query({
    text: `SELECT id,status FROM "TranscriptJob" WHERE "assetId"=$1 AND status='COMPLETED' ORDER BY "createdAt" DESC LIMIT 1`,
    values: [SPINE_RECORDING_ASSET_ID],
  });
  return selected.rows[0] || null;
}

async function main() {
  assert(process.env.QUIPSLY_RETAINED_CAPTURE_RECOVERY_STORAGE_OPERATION === "1", "Set QUIPSLY_RETAINED_CAPTURE_RECOVERY_STORAGE_OPERATION=1 to promote the retained recovery sources.");
  const baseURL = requireLoopbackOrigin(process.env.QUIPSLY_RETAINED_PRODUCT_BASE_URL || "http://127.0.0.1:3012", "QUIPSLY_RETAINED_PRODUCT_BASE_URL");
  const databaseURL = localDatabase(process.env.QUIPSLY_LOCAL_DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio");
  const password = readRetainedQAPassword({ service: KEYCHAIN_SERVICE, account: OPERATOR_EMAIL });
  assert(password, "The retained media operator has no Keychain password.");
  const pool = new pg.Pool({ connectionString: databaseURL, max: 2 });
  const requests = await recoveryRequests(pool);
  assert(requests.length === 2, `Expected two active retained recovery sources, found ${requests.length}.`);

  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 }, colorScheme: "dark" });
  const page = await context.newPage();
  try {
    await signInThroughRenderedLogin({ page, baseURL, identity: { role: "capture-recovery-storage-operator", email: OPERATOR_EMAIL }, password, callbackPath: "/projects" });
    const responses = [];
    for (const request of requests) {
      const result = await replayRecovery(page, request.body);
      assert(result.status === 200 && result.body?.ok === true && result.body?.idempotentReplay === true, `Recovery replay failed for ${request.recordingAssetId}: ${JSON.stringify(result)}`);
      responses.push({ recordingAssetId: request.recordingAssetId, status: result.status, storageGeneration: result.body?.replacement?.storageGeneration });
    }
    const storage = await storageReadback(pool, requests.map((request) => request.recordingAssetId));
    const completedTranscript = await completedSpineTranscript(pool);
    const transcript = completedTranscript
      ? { status: 200, body: { ok: true, transcriptJobId: completedTranscript.id, processingStatus: "completed" } }
      : await post(page, "/api/mobile/capture/transcripts/run", { recordingAssetId: SPINE_RECORDING_ASSET_ID });
    assert([200, 202].includes(transcript.status) && transcript.body?.ok === true, `Recovered spine transcription did not queue: ${JSON.stringify(transcript)}`);
    process.stdout.write(`${JSON.stringify({
      ok: true,
      retained: true,
      localOnly: true,
      roomId: ROOM_ID,
      responses,
      storage,
      transcript: { status: transcript.status, jobId: transcript.body?.transcriptJobId, processingStatus: transcript.body?.processingStatus },
      importedSourceMediaMutated: false,
    }, null, 2)}\n`);
  } finally {
    await clearRenderedSession(page, baseURL, "capture-recovery-storage-operator").catch(() => undefined);
    await context.close();
    await browser.close();
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`FAIL retained capture recovery storage: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
