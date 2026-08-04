#!/usr/bin/env node

import assert from "node:assert/strict";
import { stat } from "node:fs/promises";

import pg from "pg";

import { sha256File } from "../apps/quipsly-media-processor/src/transcoder.ts";
import { readRetainedQAPassword } from "./lib/retained-qa-keychain.mjs";

const PRODUCT_KEYCHAIN_SERVICE = "com.quipsly.qa.retained-product";
const OPERATOR_EMAIL = "quipsly-media-ms8ct81g@example.test";
const COACHING_KEYCHAIN_SERVICE = "com.quipsly.qa.retained-coaching";
const OUTSIDER_EMAIL = "quipsly-coach-retained-20260731@example.test";
const PROJECT_SLUG = process.env.QUIPSLY_RETAINED_TRANSCRIPT_PROJECT_SLUG || "high-ground-odyssey";
const EPISODE_SLUG = process.env.QUIPSLY_RETAINED_TRANSCRIPT_EPISODE_SLUG || "episode-4-part-2";
const ASSET_ID = process.env.QUIPSLY_RETAINED_TRANSCRIPT_ASSET_ID || "cmse192a8000e8jxldysq5b1u";
const SOURCE_ID = process.env.QUIPSLY_RETAINED_TRANSCRIPT_SOURCE_ID || "cmse1929v000d8jxlwao4837y";
const AUTHORIZATION_KIND = process.env.QUIPSLY_RETAINED_TRANSCRIPT_AUTHORIZATION_KIND || "participant-consent-confirmed";
assert.ok(["participant-consent-confirmed", "licensed-or-permitted-source"].includes(AUTHORIZATION_KIND), "Retained transcript authorization kind is invalid.");

if (process.env.QUIPSLY_RETAINED_STUDIO_TRANSCRIPT_OPERATION !== "1") {
  throw new Error("Set QUIPSLY_RETAINED_STUDIO_TRANSCRIPT_OPERATION=1 to retain a canonical Studio source transcript.");
}

const baseURL = requireLoopbackOrigin(process.env.QUIPSLY_RETAINED_BASE_URL || "http://127.0.0.1:3012");
const authOrigin = requireLoopbackOrigin(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099"}`);
const databaseURL = process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio";
requireLoopbackDatabase(databaseURL);
const pool = new pg.Pool({ connectionString: databaseURL, max: 2 });

try {
  const operatorToken = await authenticate(OPERATOR_EMAIL, readRetainedQAPassword({ service: PRODUCT_KEYCHAIN_SERVICE, account: OPERATOR_EMAIL }));
  const outsiderToken = await authenticate(OUTSIDER_EMAIL, readRetainedQAPassword({ service: COACHING_KEYCHAIN_SERVICE, account: OUTSIDER_EMAIL }));
  const query = new URLSearchParams({ projectSlug: PROJECT_SLUG, episodeSlug: EPISODE_SLUG, assetId: ASSET_ID });
  const signedOut = await request(`/api/media-vault/source-transcript?${query}`);
  assert.equal(signedOut.status, 401, "Signed-out source transcript status did not fail closed.");
  const outsider = await request(`/api/media-vault/source-transcript?${query}`, { token: outsiderToken });
  assert.equal(outsider.status, 403, "A separate ungranted account could read source transcript status.");

  const sourceRow = await pool.query({
    text: `
      SELECT a.filename, a."sizeBytes", s."providerSourceId"
      FROM "StudioMediaAsset" a
      JOIN "StudioAssetAttachment" aa ON aa."assetId"=a.id
      JOIN "StudioProject" p ON p.id=aa."projectId"
      JOIN "StudioVideoSource" s ON s.id=aa."metadataJson"->>'sourceId'
      WHERE a.id=$1 AND s.id=$2 AND p.slug=$3 AND aa."metadataJson"->>'episodeSlug'=$4
    `,
    values: [ASSET_ID, SOURCE_ID, PROJECT_SLUG, EPISODE_SLUG],
  });
  const source = sourceRow.rows[0];
  assert.ok(source, "Retained source binding is missing.");
  const beforeStat = await stat(source.providerSourceId);
  const beforeSha256 = await sha256File(source.providerSourceId);
  assert.equal(beforeStat.size, Number(source.sizeBytes), "Retained source size no longer matches the database.");

  let response = await request("/api/media-vault/source-transcript", {
    token: operatorToken,
    method: "POST",
    body: {
      action: "queue",
      projectSlug: PROJECT_SLUG,
      episodeSlug: EPISODE_SLUG,
      assetId: ASSET_ID,
      sourceId: SOURCE_ID,
      authorizationKind: AUTHORIZATION_KIND,
      authorizationAccepted: true,
      language: "en",
    },
  });
  assert.ok([200, 202].includes(response.status) && response.body?.ok, `Queue failed: ${response.status} ${response.body?.error || ""}`);
  for (let attempt = 0; attempt < 900 && response.body?.status !== "completed"; attempt += 1) {
    assert.notEqual(response.body?.status, "failed", response.body?.error || "Source transcription failed.");
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    response = await request("/api/media-vault/source-transcript", {
      token: operatorToken,
      method: "POST",
      body: { action: "reconcile", projectSlug: PROJECT_SLUG, episodeSlug: EPISODE_SLUG, assetId: ASSET_ID, sourceId: SOURCE_ID },
    });
    assert.ok([200, 202].includes(response.status) && response.body?.ok, `Reconcile failed: ${response.status} ${response.body?.error || ""}`);
  }
  assert.equal(response.body?.status, "completed", "Source transcript did not reach canonical completion.");

  const readback = await request(`/api/media-vault/source-transcript?${query}`, { token: operatorToken });
  assert.equal(readback.status, 200);
  assert.equal(readback.body?.status, "completed");
  assert.ok(readback.body?.coverage?.segmentCount > 0 && readback.body?.coverage?.wordCount > 0, "Canonical transcript coverage is empty.");
  assert.equal(readback.body?.coverage?.speakerLabeledWordCount, 0, "Local Whisper invented speaker labels.");
  assert.equal(readback.body?.capabilities?.speakerDiarization, "unavailable");
  assert.equal(readback.body?.boundaries?.confidenceIsNotMeasuredAccuracy, true);

  const canonical = await pool.query({
    text: `
      SELECT tj.id, tj.status, tj.provider, tj."studioMediaAssetId", tj."studioProjectId", tj."episodeProductionId",
             count(DISTINCT ts.id)::integer AS "segmentCount", count(DISTINCT tw.id)::integer AS "wordCount"
      FROM "TranscriptJob" tj
      LEFT JOIN "TranscriptSegment" ts ON ts."transcriptJobId"=tj.id
      LEFT JOIN "TranscriptWord" tw ON tw."transcriptJobId"=tj.id
      WHERE tj.id=$1
      GROUP BY tj.id
    `,
    values: [readback.body.transcriptJobId],
  });
  const canonicalRow = canonical.rows[0];
  assert.equal(canonicalRow?.status, "COMPLETED");
  assert.equal(canonicalRow?.studioMediaAssetId, ASSET_ID);
  assert.equal(canonicalRow?.segmentCount, readback.body.coverage.segmentCount);
  assert.equal(canonicalRow?.wordCount, readback.body.coverage.wordCount);
  const afterStat = await stat(source.providerSourceId);
  assert.equal(afterStat.size, beforeStat.size, "Source size changed during transcription.");
  assert.equal(await sha256File(source.providerSourceId), beforeSha256, "Source hash changed during transcription.");

  process.stdout.write(`${JSON.stringify({
    ok: true,
    operation: "retained-studio-source-transcript",
    projectSlug: PROJECT_SLUG,
    episodeSlug: EPISODE_SLUG,
    source: { assetId: ASSET_ID, sourceId: SOURCE_ID, filename: source.filename, sizeBytes: beforeStat.size, sha256: beforeSha256 },
    transcript: {
      processingJobId: readback.body.jobId,
      transcriptJobId: readback.body.transcriptJobId,
      provider: readback.body.provider,
      language: readback.body.language,
      coverage: readback.body.coverage,
      capabilities: readback.body.capabilities,
      firstSegment: readback.body.segments[0],
    },
    privacy: { signedOutStatus: signedOut.status, outsiderStatus: outsider.status },
    boundaries: readback.body.boundaries,
  }, null, 2)}\n`);
} finally {
  await pool.end();
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
function requireLoopbackOrigin(value) { const url = new URL(value); assert.equal(url.protocol, "http:"); assert.ok(["localhost", "127.0.0.1", "::1"].includes(url.hostname)); assert.equal(url.username, ""); assert.equal(url.password, ""); return url.origin; }
function requireLoopbackDatabase(value) { const url = new URL(value); assert.ok(["localhost", "127.0.0.1", "::1"].includes(url.hostname)); }
