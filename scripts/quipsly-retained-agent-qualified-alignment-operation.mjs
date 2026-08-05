#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createRequire } from "node:module";

import { FfmpegAudioAlignmentAnalyzer } from "../apps/quipsly-media-processor/src/audio-alignment-ffmpeg.ts";
import {
  assertNoHorizontalOverflow,
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
const CAPTURE_GROUP_ID = "77777777-7777-4777-8777-777777777777";
const SPINE_ASSET_ID = "cmsff8thh009l6qxllz23j4yb";
const TARGET_ASSET_ID = "cmsfosrd300004axlkh5a9wpe";
const SPINE_NAME = "QA protected microphone master";
const TARGET_NAME = "QA protected iPhone camera master";
const SPINE_PATH = "/var/folders/n8/75lt2yw16752qxw_l6j0khl00000gn/T/quipsly-media-ingest/media-vault/raw/high-ground-odyssey-manuscript/episode-9/ed424d2c-f7eb-4169-96b9-5358516fc4fb/Ted-Lasso-Be-Curious.mp4";
const TARGET_PATH = "/private/var/folders/n8/75lt2yw16752qxw_l6j0khl00000gn/T/quipsly-media-ingest/media-vault/proxy/episode-collaboration/high-ground-odyssey-manuscript/episode-9/cmsff8thh009l6qxllz23j4yb/collaboration-1080p-h264-aac-v1-acddc14133f11580d602.mp4";
const AGENT_ID = "codex-quipsly-media-review";
const DELEGATION_SCOPE = "Exact-source reversible alignment for the retained Capture rendezvous QA take only; no source mutation, render, provider recording, or publication.";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  assert(process.env.QUIPSLY_RETAINED_AGENT_ALIGNMENT_OPERATION === "1", "Set QUIPSLY_RETAINED_AGENT_ALIGNMENT_OPERATION=1 to retain this local QA review.");
  const baseURL = requireLoopbackOrigin(process.env.QUIPSLY_RETAINED_PRODUCT_BASE_URL || "http://127.0.0.1:3012", "QUIPSLY_RETAINED_PRODUCT_BASE_URL");
  const databaseURL = localDatabase(process.env.QUIPSLY_LOCAL_DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio");
  const password = readRetainedQAPassword({ service: KEYCHAIN_SERVICE, account: OPERATOR_EMAIL });
  assert(password, "The retained media operator has no Keychain password.");

  const [spine, target] = await Promise.all([
    binding(SPINE_ASSET_ID, SPINE_PATH, "video/mp4"),
    binding(TARGET_ASSET_ID, TARGET_PATH, "video/mp4"),
  ]);
  const evidence = await new FfmpegAudioAlignmentAnalyzer().analyze({
    spinePath: SPINE_PATH,
    targetPath: TARGET_PATH,
    spine,
    target,
    options: {
      initialOffsetSeconds: 0,
      openingTargetSeconds: 20,
      laterTargetSeconds: 200,
      windowSeconds: 6,
      searchRadiusSeconds: 1,
      sampleRate: 12_000,
      minimumCorrelation: 0.78,
      minimumPeakMargin: 0.04,
    },
  });
  assert(evidence.qualification.qualifiedForAuthorizedAgentReview, `Alignment evidence remained ambiguous: ${JSON.stringify(evidence.qualification)}`);
  assert(evidence.opening.measuredOffsetSeconds >= 0, "The retained target must not require a negative timeline anchor.");

  const pool = new pg.Pool({ connectionString: databaseURL, max: 2 });
  await bindFixtureSources(pool, { spine, target });

  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--autoplay-policy=no-user-gesture-required"] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: "dark", locale: "en-US", reducedMotion: "reduce" });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  try {
    await signInThroughRenderedLogin({ page, baseURL, identity: { role: "agent-alignment-delegator", email: OPERATOR_EMAIL }, password, callbackPath: "/projects" });
    const ensured = await post(page, "/api/episode-production", { action: "ensure", projectSlug: PROJECT_SLUG, episodeSlug: EPISODE_SLUG, title: "Capture Sync Rendezvous QA", boundaryLabel: "Capture Sync Rendezvous QA" });
    assert(ensured.status === 200 && ensured.body?.mode === "database", `Episode readback failed: ${JSON.stringify(ensured)}`);
    const currentTarget = media(ensured.body).find((asset) => asset.id === TARGET_ASSET_ID);
    const existingReview = currentTarget?.sync?.alignmentReview;
    if (!existingReview) {
      const approved = await request(page, "/api/episode-production/import-media", "PATCH", {
        action: "approve-alignment",
        projectSlug: PROJECT_SLUG,
        episodeSlug: EPISODE_SLUG,
        expectedUpdatedAt: ensured.body.updatedAt,
        assetId: TARGET_ASSET_ID,
        spineAssetId: SPINE_ASSET_ID,
        status: "synced",
        anchorTimelineSeconds: evidence.opening.measuredOffsetSeconds,
        alignmentReview: {
          waveformCorrelationConfirmed: true,
          driftReviewConfirmed: true,
          humanApprovalConfirmed: false,
          authorizedAgentQualificationConfirmed: true,
          driftObservationIntervalSeconds: evidence.drift.observationIntervalSeconds,
          residualDriftMilliseconds: evidence.drift.residualDriftMilliseconds,
          notes: `Authorized deterministic qualification. Opening r=${evidence.opening.normalizedCorrelation.toFixed(6)} at ${evidence.opening.targetStartSeconds}s; later r=${evidence.later.normalizedCorrelation.toFixed(6)} at ${evidence.later.targetStartSeconds}s. The source and registered collaboration proxy were decoded independently; originals remain unchanged.`,
          approvalAuthority: {
            kind: "authorized-agent",
            agentId: AGENT_ID,
            delegationScope: DELEGATION_SCOPE,
            qualificationMethod: evidence.analyzer.algorithm,
            evidence,
          },
        },
      });
      assert(approved.status === 200 && approved.body?.ok === true, `Agent-qualified alignment save failed: ${JSON.stringify(approved)}`);
    } else {
      assert(existingReview.schema === "quipsly-reviewed-source-alignment-v2", "A different protected alignment already owns the retained target.");
      assert(existingReview.approvalAuthority?.agentId === AGENT_ID, "The existing retained review belongs to a different authority.");
    }

    await page.goto(`${baseURL}/editor?project=${encodeURIComponent(PROJECT_SLUG)}&episode=${encodeURIComponent(EPISODE_SLUG)}&captureGroup=${CAPTURE_GROUP_ID}`, { waitUntil: "load" });
    await page.waitForTimeout(1_000);
    const advanced = page.getByRole("button", { name: /Advanced Tools (OFF|ON)/i });
    if ((await advanced.textContent())?.includes("OFF")) await advanced.click();
    const wizard = page.locator("#guided-sync-wizard");
    await wizard.getByText("Guided sync wizard", { exact: true }).waitFor({ timeout: 20_000 });
    const sourceSet = wizard.getByRole("region", { name: "Capture take source set" });
    const spineCard = sourceSet.locator("article").filter({ hasText: SPINE_NAME });
    await spineCard.getByRole("button", { name: "Use as spine" }).click();
    const targetSelect = wizard.locator("label").filter({ hasText: "2. Pick target media" }).locator("select");
    await targetSelect.selectOption(TARGET_ASSET_ID);
    const agentPanel = wizard.getByTestId("authorized-agent-alignment-evidence");
    await agentPanel.waitFor({ timeout: 20_000 });
    await wizard.getByText(AGENT_ID, { exact: false }).waitFor();
    await agentPanel.getByText(DELEGATION_SCOPE, { exact: false }).waitFor();
    await agentPanel.getByText(/source bytes unchanged · not sample-accurate/i).waitFor();

    await wizard.getByRole("button", { name: "Preview from anchor" }).click();
    await wizard.getByText(/Previewing spine at/i).waitFor();
    await page.waitForTimeout(1_100);
    const previewTimes = await wizard.locator("audio,video").evaluateAll((nodes) => nodes.map((node) => ({ currentTime: node.currentTime, paused: node.paused })));
    assert(previewTimes.length === 2, `Expected two sync-preview players, observed ${previewTimes.length}.`);
    assert(previewTimes.every((state) => state.currentTime > 0.5 && state.paused === false), `Sync preview did not operate both players: ${JSON.stringify(previewTimes)}`);
    await wizard.getByRole("button", { name: "Pause both" }).click();
    const paused = await wizard.locator("audio,video").evaluateAll((nodes) => nodes.map((node) => node.paused));
    assert(paused.every(Boolean), "Pause both did not stop every sync-preview player.");

    const refreshed = await post(page, "/api/episode-production", { action: "ensure", projectSlug: PROJECT_SLUG, episodeSlug: EPISODE_SLUG });
    const existingClips = Array.isArray(refreshed.body?.timelineJson?.timelineClips)
      ? refreshed.body.timelineJson.timelineClips
      : Array.isArray(refreshed.body?.timelineJson?.clips)
        ? refreshed.body.timelineJson.clips
        : [];
    if (existingClips.length < 2) {
      for (const [id, name] of [[TARGET_ASSET_ID, TARGET_NAME], [SPINE_ASSET_ID, SPINE_NAME]]) {
        const card = page.getByTestId(`imported-media-card-${id}`);
        await card.getByText(name, { exact: true }).waitFor();
        await card.getByRole("button", { name: "Add to timeline here" }).click();
      }
      await page.getByRole("button", { name: /Save Episode Timeline|Timeline Saved/ }).click();
      await page.getByRole("button", { name: "Timeline Saved" }).waitFor({ timeout: 20_000 });
    }
    const cockpit = page.getByText("Review sources, then play the cut").locator("..").locator("..");
    await cockpit.getByRole("button", { name: "Play active edit" }).click();
    await page.getByText(/Playing at/).waitFor();
    await page.waitForTimeout(800);
    const assembledMediaStates = await page.locator(
      'video[src*="cmsffdp3q009o6qxlu3lq6pg4"], audio[src*="cmsff8thb009k6qxlcflvhh5x"]',
    ).evaluateAll((nodes) => nodes.map((node) => ({ currentTime: node.currentTime, paused: node.paused, readyState: node.readyState })));
    assert(
      assembledMediaStates.some((state) => state.currentTime > 0.25 && state.paused === false && state.readyState >= 2),
      `Assembled playback did not operate a decoded source element: ${JSON.stringify(assembledMediaStates)}`,
    );
    await cockpit.getByRole("button", { name: "Pause" }).click();
    await page.getByText(/Paused at/).waitFor();
    await assertNoHorizontalOverflow(page.locator("body"), "agent-qualified alignment and assembled playback");
    assert(pageErrors.length === 0, `Alignment operation raised browser exceptions: ${pageErrors.join(" | ")}`);

    const readback = await productionReadback(pool);
    assert(readback.review?.schema === "quipsly-reviewed-source-alignment-v2", "Database readback lost the agent-qualified alignment receipt.");
    assert(readback.review?.checks?.humanApprovalConfirmed === false, "Database readback manufactured a human approval claim.");
    assert(readback.review?.approvalAuthority?.evidence?.target?.sha256 === target.sha256, "Database readback lost the exact target hash.");
    assert(readback.timelineClipCount >= 2, "Database readback did not preserve the assembled two-source timeline.");

    process.stdout.write(`${JSON.stringify({
      ok: true,
      localOnly: true,
      retained: true,
      projectSlug: PROJECT_SLUG,
      episodeSlug: EPISODE_SLUG,
      captureGroupId: CAPTURE_GROUP_ID,
      authority: "authorized-agent",
      agentId: AGENT_ID,
      humanApprovalClaimed: false,
      openingCorrelation: evidence.opening.normalizedCorrelation,
      laterCorrelation: evidence.later.normalizedCorrelation,
      residualDriftMilliseconds: evidence.drift.residualDriftMilliseconds,
      observedPartsPerMillion: evidence.drift.observedPartsPerMillion,
      dualSourcePreviewOperated: true,
      pauseBothOperated: true,
      assembledTimelineClipCount: readback.timelineClipCount,
      assembledPlaybackOperated: true,
      sourceBytesMutated: false,
      providerRecordingRequired: false,
      browserExceptions: 0,
      horizontalOverflow: false,
    }, null, 2)}\n`);
  } finally {
    await clearRenderedSession(page, baseURL, "agent-alignment-delegator").catch(() => undefined);
    await context.close();
    await browser.close();
    await pool.end();
  }
}

function localDatabase(value) {
  const url = new URL(value);
  assert(["127.0.0.1", "localhost", "::1"].includes(url.hostname), "Agent alignment operation refuses a non-local database.");
  return value;
}

async function post(page, url, body) {
  return request(page, url, "POST", body);
}

async function request(page, url, method, body) {
  return page.evaluate(async ({ target, payload }) => {
    const response = await fetch(target, { method: payload.method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload.body) });
    return { status: response.status, body: await response.json() };
  }, { target: url, payload: { method, body } });
}

function media(value) {
  return Array.isArray(value?.productionJson?.importedMedia) ? value.productionJson.importedMedia : [];
}

async function binding(assetId, filePath, contentType) {
  const file = await stat(filePath);
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  const sha256 = hash.digest("hex");
  return { assetId, provider: "local", locator: filePath, generation: `sha256:${sha256}`, sha256, sizeBytes: file.size, contentType };
}

async function bindFixtureSources(pool, bindings) {
  const selected = await pool.query({
    text: `SELECT e.id, e."updatedAt", e."productionJson", e."timelineJson" FROM "StudioEpisodeProduction" e JOIN "StudioProject" p ON p.id=e."projectId" WHERE p.slug=$1 AND e.slug=$2`,
    values: [PROJECT_SLUG, EPISODE_SLUG],
  });
  const row = selected.rows[0];
  assert(row, "The retained Capture rendezvous episode fixture is missing.");
  const productionJson = row.productionJson && typeof row.productionJson === "object" ? row.productionJson : {};
  const importedMedia = Array.isArray(productionJson.importedMedia) ? productionJson.importedMedia : [];
  const nextMedia = importedMedia.map((asset) => {
    const binding = asset.id === SPINE_ASSET_ID ? bindings.spine : asset.id === TARGET_ASSET_ID ? bindings.target : null;
    return binding ? { ...asset, sha256: binding.sha256, size: binding.sizeBytes, storageGeneration: binding.generation } : asset;
  });
  assert(nextMedia.some((asset) => asset.id === SPINE_ASSET_ID) && nextMedia.some((asset) => asset.id === TARGET_ASSET_ID), "The retained exact source pair is missing.");
  const timelineJson = row.timelineJson && typeof row.timelineJson === "object" ? row.timelineJson : null;
  const timelineClips = Array.isArray(timelineJson?.timelineClips) ? timelineJson.timelineClips : [];
  const retainedSourceUrls = new Set([
    "/api/ingest/media/cmsff8thb009k6qxlcflvhh5x",
    "/api/ingest/media/cmsffdp3q009o6qxlu3lq6pg4",
  ]);
  const seenRetainedUrls = new Set();
  const normalizedTimelineClips = timelineClips.filter((clip) => {
    if (!retainedSourceUrls.has(clip?.assetId)) return true;
    if (seenRetainedUrls.has(clip.assetId)) return false;
    seenRetainedUrls.add(clip.assetId);
    return true;
  });
  const nextTimelineJson = timelineJson ? { ...timelineJson, timelineClips: normalizedTimelineClips } : null;
  const identity = await pool.query({ text: `SELECT id FROM "User" WHERE "primaryEmail"=$1 LIMIT 1`, values: [OPERATOR_EMAIL] });
  assert(identity.rows[0]?.id, "The retained media operator identity is missing.");
  const project = await pool.query({ text: `SELECT id FROM "StudioProject" WHERE slug=$1 ORDER BY "updatedAt" DESC LIMIT 1`, values: [PROJECT_SLUG] });
  assert(project.rows[0]?.id, "The retained Capture rendezvous project is missing.");
  await pool.query({
    text: `INSERT INTO "StudioProjectAccessGrant" (id, "projectId", email, role, status, "createdByUserId", "createdByEmail", note, "createdAt", "updatedAt") VALUES ($1,$2,$3,'EDITOR','ACTIVE',$4,$3,$5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT ("projectId",email) DO UPDATE SET role='EDITOR', status='ACTIVE', "updatedAt"=CURRENT_TIMESTAMP, note=EXCLUDED.note`,
    values: [randomUUID(), project.rows[0].id, OPERATOR_EMAIL, identity.rows[0].id, "Retained local agent-qualified audio alignment operation access."],
  });
  await pool.query({
    text: `UPDATE "StudioEpisodeProduction" SET "productionJson"=$1::jsonb, "timelineJson"=$2::jsonb, "updatedAt"=CURRENT_TIMESTAMP WHERE id=$3`,
    values: [JSON.stringify({ ...productionJson, importedMedia: nextMedia }), nextTimelineJson ? JSON.stringify(nextTimelineJson) : null, row.id],
  });
}

async function productionReadback(pool) {
  const selected = await pool.query({
    text: `SELECT e."productionJson", e."timelineJson" FROM "StudioEpisodeProduction" e JOIN "StudioProject" p ON p.id=e."projectId" WHERE p.slug=$1 AND e.slug=$2`,
    values: [PROJECT_SLUG, EPISODE_SLUG],
  });
  const row = selected.rows[0];
  const target = Array.isArray(row?.productionJson?.importedMedia) ? row.productionJson.importedMedia.find((asset) => asset.id === TARGET_ASSET_ID) : null;
  const clips = Array.isArray(row?.timelineJson?.timelineClips)
    ? row.timelineJson.timelineClips
    : Array.isArray(row?.timelineJson?.clips)
      ? row.timelineJson.clips
      : [];
  return { review: target?.sync?.alignmentReview ?? null, timelineClipCount: clips.length };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
