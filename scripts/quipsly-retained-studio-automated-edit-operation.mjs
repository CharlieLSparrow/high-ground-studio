#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

import pg from "pg";

import { readRetainedQAPassword } from "./lib/retained-qa-keychain.mjs";

const PRODUCT_KEYCHAIN_SERVICE = "com.quipsly.qa.retained-product";
const COACHING_KEYCHAIN_SERVICE = "com.quipsly.qa.retained-coaching";
const OPERATOR_EMAIL = "quipsly-media-ms8ct81g@example.test";
const OUTSIDER_EMAIL = "quipsly-coach-retained-20260731@example.test";
const PROJECT_SLUG = process.env.QUIPSLY_RETAINED_STUDIO_EDIT_PROJECT_SLUG || "high-ground-odyssey";
const EPISODE_SLUG = process.env.QUIPSLY_RETAINED_STUDIO_EDIT_EPISODE_SLUG || "episode-8-i-wasnt-born-a-leader";
const ASSET_ID = process.env.QUIPSLY_RETAINED_STUDIO_EDIT_ASSET_ID || "cmsek11ae0005q8xl59k1zucr";
const SOURCE_ID = process.env.QUIPSLY_RETAINED_STUDIO_EDIT_SOURCE_ID || "cmsek11a50004q8xl5vjb1756";
const EXPECTED_SOURCE_SHA256 = "acddc14133f11580d602fa744f4b448a8e16061b81aebe9597e832df3b8175e3";

if (process.env.QUIPSLY_RETAINED_STUDIO_EDIT_OPERATION !== "1") {
  throw new Error("Set QUIPSLY_RETAINED_STUDIO_EDIT_OPERATION=1 to retain source-bound Studio edit proposals.");
}

const baseURL = requireLoopbackOrigin(process.env.QUIPSLY_RETAINED_BASE_URL || "http://127.0.0.1:3012");
const authOrigin = requireLoopbackOrigin(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099"}`);
const databaseURL = process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio";
requireLoopbackDatabase(databaseURL);
const pool = new pg.Pool({ connectionString: databaseURL, max: 2 });

try {
  const sourceBefore = await canonicalSource();
  assert.ok(sourceBefore, "The retained Episode 8 Studio source, transcript, or signal profile is missing.");
  assert.equal(sourceBefore.sourceSha256, EXPECTED_SOURCE_SHA256, "The retained Episode 8 transcript is not bound to the expected immutable source.");
  assert.equal(sourceBefore.segmentCount, 84, "The retained Episode 8 transcript segment count changed unexpectedly.");
  assert.equal(sourceBefore.wordCount, 597, "The retained Episode 8 transcript word count changed unexpectedly.");
  const beforeStat = await stat(sourceBefore.providerSourceId);
  const beforeFileSha256 = await sha256File(sourceBefore.providerSourceId);
  assert.equal(beforeFileSha256, EXPECTED_SOURCE_SHA256, "The current Episode 8 file no longer matches canonical transcript evidence.");

  const segments = await pool.query({
    text: `
      SELECT ts.id, ts."startSeconds", ts."endSeconds", ts.text, ts."speakerLabel"
      FROM "TranscriptSegment" ts
      WHERE ts."transcriptJobId"=$1
      ORDER BY ts."startSeconds", ts.id
    `,
    values: [sourceBefore.transcriptJobId],
  });
  const transcriptBlocks = segments.rows.map((segment) => ({
    id: segment.id,
    time: Number(segment.startSeconds),
    duration: Number(segment.endSeconds) - Number(segment.startSeconds),
    text: segment.text,
    speaker: segment.speakerLabel,
  }));
  assert.equal(transcriptBlocks.length, sourceBefore.segmentCount);
  assert.ok(transcriptBlocks.every((block) => block.duration > 0 && block.text.trim()), "Canonical transcript blocks are not valid edit evidence.");

  const requestBody = {
    analysisMode: "deterministic",
    projectSlug: PROJECT_SLUG,
    episodeSlug: EPISODE_SLUG,
    selectedMediaAssetId: ASSET_ID,
    timelineFingerprintSha256: createHash("sha256").update(`retained-studio-edit:${PROJECT_SLUG}:${EPISODE_SLUG}:${sourceBefore.sourceSha256}`).digest("hex"),
    transcriptBlocks,
  };
  const proposalCountBefore = await proposalCount();
  const signedOut = await request("/api/ai-edit", { method: "POST", body: requestBody });
  assert.equal(signedOut.status, 401, "Signed-out Studio edit analysis did not fail closed.");

  const outsiderToken = await authenticate(OUTSIDER_EMAIL, readRetainedQAPassword({ service: COACHING_KEYCHAIN_SERVICE, account: OUTSIDER_EMAIL }));
  const outsider = await request("/api/ai-edit", { token: outsiderToken, method: "POST", body: requestBody });
  assert.equal(outsider.status, 403, "An ungranted retained account could generate Episode 8 edit proposals.");

  const operatorToken = await authenticate(OPERATOR_EMAIL, readRetainedQAPassword({ service: PRODUCT_KEYCHAIN_SERVICE, account: OPERATOR_EMAIL }));
  const analysis = await request("/api/ai-edit", { token: operatorToken, method: "POST", body: requestBody });
  assert.equal(analysis.status, 200, analysis.body?.error || "Studio edit analysis failed.");
  assert.equal(analysis.body?.ok, true);
  assert.equal(analysis.body?.applied, false);
  assert.equal(analysis.body?.proposalSet?.kind, "quipsly-ai-edit-proposal-set-v2");
  assert.equal(analysis.body?.proposalSet?.binding?.signalEvidence?.mediaAssetKind, "studio-media");
  assert.equal(analysis.body?.proposalSet?.binding?.signalEvidence?.mediaAssetId, ASSET_ID);
  assert.equal(analysis.body?.proposalSet?.binding?.signalEvidence?.sourceSha256, EXPECTED_SOURCE_SHA256);
  assert.equal(analysis.body?.proposalSet?.binding?.signalEvidence?.protectedPlaybackSourceId, SOURCE_ID);
  assert.equal(analysis.body?.signalEvidence?.boundMediaAssetKind, "studio-media");
  assert.equal(analysis.body?.signalEvidence?.boundMediaAssetId, ASSET_ID);
  assert.equal(analysis.body?.signalVisualization?.mediaAssetKind, "studio-media");
  assert.equal(analysis.body?.signalVisualization?.mediaAssetId, ASSET_ID);
  assert.equal(analysis.body?.signalVisualization?.protectedPlayback?.url, `/api/ingest/media/${SOURCE_ID}`);
  assert.equal(analysis.body?.signalVisualization?.protectedPlayback?.kind, "video");
  assert.ok(analysis.body?.signalVisualization?.waveform?.length > 0 && analysis.body.signalVisualization.waveform.length <= 180, "The Studio edit evidence map is empty or unbounded.");
  assert.ok(analysis.body.signalVisualization.durationSeconds + 0.02 >= transcriptBlocks.at(-1).time + transcriptBlocks.at(-1).duration, "Transcript timing extends beyond bound Studio signal evidence.");
  assert.deepEqual(analysis.body?.proposalSet?.boundaries, {
    sourceMediaUnchanged: true,
    proposalsOnly: true,
    proofWatchBeforeApply: true,
    staleBindingRejectsApply: true,
    noAutomaticSaveRenderOrPublish: true,
  });

  const protectedPlayback = await fetch(new URL(`/api/ingest/media/${SOURCE_ID}`, baseURL), {
    headers: { authorization: `Bearer ${operatorToken}`, range: "bytes=0-1023", "cache-control": "no-cache" },
  });
  assert.ok([200, 206].includes(protectedPlayback.status), `Protected Studio playback failed (${protectedPlayback.status}).`);
  assert.ok((await protectedPlayback.arrayBuffer()).byteLength > 0, "Protected Studio playback returned no media bytes.");

  const persisted = await pool.query({
    text: `
      SELECT "mediaAssetKind", "mediaAssetId", "sourceSha256", "signalProfileSha256", "proposalJson"
      FROM "StudioEpisodeEditProposalSet"
      WHERE id=$1
    `,
    values: [analysis.body.proposalSet.proposalSetId],
  });
  assert.equal(persisted.rows.length, 1, "The Studio edit proposal ledger did not retain exactly one proposal set.");
  assert.equal(persisted.rows[0].mediaAssetKind, "studio-media");
  assert.equal(persisted.rows[0].mediaAssetId, ASSET_ID);
  assert.equal(persisted.rows[0].sourceSha256, EXPECTED_SOURCE_SHA256);
  assert.equal((await proposalCount()), proposalCountBefore + 1, "The retained operation wrote an unexpected number of proposal sets.");

  const sourceAfter = await canonicalSource();
  const afterStat = await stat(sourceAfter.providerSourceId);
  assert.equal(afterStat.size, beforeStat.size, "Source size changed during automated edit analysis.");
  assert.equal(await sha256File(sourceAfter.providerSourceId), beforeFileSha256, "Source hash changed during automated edit analysis.");
  assert.equal(sourceAfter.productionJsonSha256, sourceBefore.productionJsonSha256, "Episode production changed while generating review-only proposals.");
  assert.equal(sourceAfter.timelineJsonSha256, sourceBefore.timelineJsonSha256, "Episode timeline changed while generating review-only proposals.");

  process.stdout.write(`${JSON.stringify({
    ok: true,
    operation: "retained-studio-automated-edit",
    projectSlug: PROJECT_SLUG,
    episodeSlug: EPISODE_SLUG,
    source: { assetId: ASSET_ID, sourceId: SOURCE_ID, sha256: beforeFileSha256, sizeBytes: beforeStat.size },
    transcript: { jobId: sourceBefore.transcriptJobId, segmentCount: sourceBefore.segmentCount, wordCount: sourceBefore.wordCount },
    signal: { jobId: sourceBefore.signalJobId, waveformWindowsDisplayed: analysis.body.signalVisualization.waveform.length, protectedVideoPlaybackStatus: protectedPlayback.status },
    proposals: { proposalSetId: analysis.body.proposalSet.proposalSetId, proposalCount: analysis.body.suggestionCount, reviewCandidateCount: analysis.body.reviewCandidateCount, retained: true, applied: false },
    privacy: { signedOutStatus: signedOut.status, outsiderStatus: outsider.status },
    boundaries: { sourceMediaUnchanged: true, episodeProductionUnchanged: true, timelineUnchanged: true, noRenderOrPublish: true },
  }, null, 2)}\n`);
} finally {
  await pool.end();
}

async function canonicalSource() {
  const result = await pool.query({
    text: `
      SELECT a.filename, s."providerSourceId", tj.id AS "transcriptJobId", tj."sourceSha256",
             count(DISTINCT ts.id)::integer AS "segmentCount", count(DISTINCT tw.id)::integer AS "wordCount",
             signal.id AS "signalJobId", ep."productionJson", ep."timelineJson"
      FROM "StudioMediaAsset" a
      JOIN "StudioAssetAttachment" aa ON aa."assetId"=a.id
      JOIN "StudioProject" p ON p.id=aa."projectId"
      JOIN "StudioVideoSource" s ON s.id=aa."metadataJson"->>'sourceId'
      JOIN "StudioEpisodeProduction" ep ON ep."projectId"=p.id AND ep.slug=$2
      JOIN "TranscriptJob" tj ON tj."studioMediaAssetId"=a.id AND tj."episodeProductionId"=ep.id AND tj.status='COMPLETED'
      JOIN "TranscriptSegment" ts ON ts."transcriptJobId"=tj.id
      JOIN "TranscriptWord" tw ON tw."transcriptJobId"=tj.id
      JOIN "StudioAssetProcessingJob" signal ON signal."assetId"=a.id AND signal."projectId"=p.id AND signal.type='audio-signal-profile' AND signal.status='completed'
      WHERE p.slug=$1 AND a.id=$3 AND s.id=$4
      GROUP BY a.filename, s."providerSourceId", tj.id, signal.id, ep."productionJson", ep."timelineJson"
      ORDER BY signal."createdAt" DESC
      LIMIT 1
    `,
    values: [PROJECT_SLUG, EPISODE_SLUG, ASSET_ID, SOURCE_ID],
  });
  const row = result.rows[0];
  if (!row) return null;
  const productionJsonSha256 = createHash("sha256").update(JSON.stringify(row.productionJson)).digest("hex");
  const timelineJsonSha256 = createHash("sha256").update(JSON.stringify(row.timelineJson)).digest("hex");
  delete row.productionJson;
  delete row.timelineJson;
  return { ...row, productionJsonSha256, timelineJsonSha256 };
}

async function proposalCount() {
  const result = await pool.query({ text: `SELECT count(*)::integer AS count FROM "StudioEpisodeEditProposalSet"`, values: [] });
  return result.rows[0].count;
}

async function authenticate(email, password) {
  assert.ok(password, `No retained Keychain password is available for ${email}.`);
  const response = await fetch(`${authOrigin}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const body = await response.json().catch(() => null);
  assert.equal(response.status, 200, `Firebase emulator sign-in failed for ${email}.`);
  assert.equal(typeof body?.idToken, "string");
  return body.idToken;
}

async function request(pathname, { token = "", method = "GET", body } = {}) {
  const response = await fetch(new URL(pathname, baseURL), {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { "content-type": "application/json" } : {}), "cache-control": "no-cache" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

function requireLoopbackOrigin(value) {
  const url = new URL(value);
  assert.ok(url.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname) && !url.username && !url.password, "Retained Studio edit operation requires a credential-free loopback origin.");
  return url.origin;
}

function requireLoopbackDatabase(value) {
  const url = new URL(value);
  assert.ok(["localhost", "127.0.0.1", "::1"].includes(url.hostname), "Retained Studio edit operation refuses a non-local database.");
}

async function sha256File(pathname) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => createReadStream(pathname).on("data", (chunk) => hash.update(chunk)).on("error", reject).on("end", resolve));
  return hash.digest("hex");
}
