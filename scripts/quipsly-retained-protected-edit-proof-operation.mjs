#!/usr/bin/env node

import {
  assertNoHorizontalOverflow,
  clearRenderedSession,
  loadPlaywright,
  requireLoopbackOrigin,
  signInThroughRenderedLogin,
} from "./lib/retained-qa-browser.mjs";
import { readRetainedQAPassword } from "./lib/retained-qa-keychain.mjs";

const KEYCHAIN_SERVICE = "com.quipsly.qa.retained-product";
const OPERATOR_EMAIL = "quipsly-media-ms8ct81g@example.test";
const PROJECT_SLUG = "quipsly-local-dogfood";
const EPISODE_SLUG = "protected-edit-proof-episode-4-20260804";
const RECORDING_ASSET_ID = "local-transcript-asset-episode-4";
const SOURCE_ID = "local-transcript-source-episode-4";
const PLAYBACK_URL = `/api/ingest/media/${SOURCE_ID}`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function post(page, url, body) {
  return page.evaluate(async ({ target, payload }) => {
    const response = await fetch(target, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    return { status: response.status, body: await response.json() };
  }, { target: url, payload: body });
}

function timelineArtifact() {
  const timestamp = new Date().toISOString();
  return {
    payloadVersion: 4,
    projectSlug: PROJECT_SLUG,
    episodeSlug: EPISODE_SLUG,
    source: "quipsly-editor",
    timelineClips: [{ id: "episode-4-protected-audio", assetId: PLAYBACK_URL, sourceId: SOURCE_ID, kind: "audio", trackId: "A1", startIn: 0, duration: 60, sourceStart: 0, sourceEnd: 60, name: "Episode 4 protected source", color: "#0f766e" }],
    transcript: [
      { id: "episode-4-proof-1", time: 3.66, duration: 1.18, text: "Welcome, everybody.", speaker: "Speaker", deleted: false, deactivated: false, alert: null },
      { id: "episode-4-proof-2", time: 10.24, duration: 1.02, text: "Me too.", speaker: "Speaker", deleted: false, deactivated: false, alert: null },
      { id: "episode-4-proof-3", time: 14.76, duration: 1.44, text: "Why are you excited?", speaker: "Speaker", deleted: false, deactivated: false, alert: null },
      { id: "episode-4-proof-4", time: 26.14, duration: 1.12, text: "Hi, everybody.", speaker: "Speaker", deleted: false, deactivated: false, alert: null },
      { id: "episode-4-proof-5", time: 37.02, duration: 7.7, text: "Hi, everybody.", speaker: "Speaker", deleted: false, deactivated: false, alert: null },
    ],
    deactivatedRanges: [],
    speakerCameraMappings: [],
    cameraSwitchDecisions: [],
    generatedFrom: "retained-protected-edit-proof",
    savedAt: timestamp,
    generatedAt: timestamp,
  };
}

async function main() {
  const baseURL = requireLoopbackOrigin(process.env.QUIPSLY_RETAINED_PRODUCT_BASE_URL || "http://127.0.0.1:3012", "QUIPSLY_RETAINED_PRODUCT_BASE_URL");
  const password = readRetainedQAPassword({ service: KEYCHAIN_SERVICE, account: OPERATOR_EMAIL });
  assert(password, "The retained media operator has no Keychain password.");
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: "dark", locale: "en-US", reducedMotion: "reduce" });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  try {
    await signInThroughRenderedLogin({ page, baseURL, identity: { role: "protected-edit-proof-operator", email: OPERATOR_EMAIL }, password, callbackPath: "/projects" });
    const ensured = await post(page, "/api/episode-production", { action: "ensure", projectSlug: PROJECT_SLUG, episodeSlug: EPISODE_SLUG, title: "Episode 4 protected edit proof", boundaryLabel: "Episode 4 protected edit proof" });
    assert(ensured.status === 200 && ensured.body?.mode === "database", `Episode ensure failed: ${JSON.stringify(ensured)}`);
    const promoted = await post(page, "/api/mobile/capture/recordings/promote", { recordingAssetId: RECORDING_ASSET_ID, nestSlug: PROJECT_SLUG, episodeSlug: EPISODE_SLUG });
    assert(promoted.status === 200 && promoted.body?.ok === true && promoted.body?.playbackUrl === PLAYBACK_URL, `Recording attachment failed: ${JSON.stringify(promoted)}`);
    const artifact = timelineArtifact();
    const saved = await post(page, "/api/episode-production", { action: "save-timeline", projectSlug: PROJECT_SLUG, episodeSlug: EPISODE_SLUG, timelineJson: artifact, transcriptJson: artifact });
    assert(saved.status === 200 && saved.body?.mode === "database", `Timeline seed failed: ${JSON.stringify(saved)}`);

    const editorPath = `/editor?project=${encodeURIComponent(PROJECT_SLUG)}&episode=${encodeURIComponent(EPISODE_SLUG)}`;
    await page.goto(`${baseURL}${editorPath}`, { waitUntil: "load" });
    await page.getByText(/Loaded .* from saved timeline/, { exact: true }).waitFor({ timeout: 20_000 });
    const main = page.getByRole("main").last();
    const analysisResponse = page.waitForResponse((response) => response.url().includes("/api/ai-edit") && response.request().method() === "POST");
    await main.getByRole("button", { name: "Analyze locally", exact: true }).click();
    const analysis = await analysisResponse;
    const analysisBody = await analysis.json().catch(() => ({}));
    assert(analysis.ok(), `Protected edit analysis failed (${analysis.status()}): ${JSON.stringify(analysisBody)}`);
    const visualization = analysisBody?.signalVisualization;
    assert(visualization?.mediaAssetKind === "capture-recording" && visualization?.mediaAssetId === RECORDING_ASSET_ID, "Analysis did not bind the Episode 4 Capture recording.");
    assert(visualization?.protectedPlayback?.sourceId === SOURCE_ID && visualization?.protectedPlayback?.url === PLAYBACK_URL, "Analysis did not bind the protected Episode 4 playback route.");
    assert(analysisBody?.proposalSet?.binding?.signalEvidence?.protectedPlaybackSourceId === SOURCE_ID, "Proposal set did not preserve the protected playback source identity.");

    const map = main.getByRole("region", { name: "Automated edit evidence map", exact: true });
    await map.getByText(/Exact protected source · episode-4-charlie-680-740\.wav/i).waitFor({ timeout: 20_000 });
    const audio = map.getByLabel("Protected automated edit source", { exact: true });
    await page.waitForFunction(() => document.querySelector('audio[aria-label="Protected automated edit source"]')?.readyState >= 1, undefined, { timeout: 20_000 });
    assert(await audio.evaluate((element) => element.duration) === 60, "Protected editor audio did not expose the exact 60-second source.");

    await map.getByRole("button", { name: /0:04\.8 · transcript gap with signal/i }).click();
    const selected = map.getByLabel("Selected automated edit evidence", { exact: true });
    await selected.getByText(/measured signal present/i).waitFor();
    const playButton = selected.getByRole("button", { name: "Play bound source", exact: true });
    await playButton.click();
    await page.waitForFunction(() => {
      const element = document.querySelector('audio[aria-label="Protected automated edit source"]');
      return element instanceof HTMLAudioElement && element.currentTime >= 4.84 && !element.paused;
    }, undefined, { timeout: 20_000 });
    const playbackPosition = await audio.evaluate((element) => element.currentTime);
    const confirmation = selected.getByRole("checkbox", { name: /I listened inside this exact source range/i });
    assert(await confirmation.isEnabled(), "Protected playback did not unlock explicit proof confirmation.");
    await confirmation.check();

    const receiptResponse = page.waitForResponse((response) => {
      if (!response.url().includes("/api/editor/edit-review") || response.request().method() !== "POST") return false;
      try { return response.request().postDataJSON()?.action === "PROOF_LISTENED"; } catch { return false; }
    });
    await selected.getByRole("button", { name: "Record proof-listen", exact: true }).click();
    const receipt = await receiptResponse;
    const receiptBody = await receipt.json().catch(() => ({}));
    assert(receipt.ok() && receiptBody?.receipt?.action === "PROOF_LISTENED", `Protected proof receipt failed (${receipt.status()}): ${JSON.stringify(receiptBody)}`);
    assert(receiptBody.receipt.sourceSha256 === visualization.sourceSha256, "Receipt source hash drifted from protected playback analysis.");
    assert(receiptBody.receipt.signalProfileSha256 === visualization.signalProfileSha256, "Receipt signal profile drifted from protected playback analysis.");
    assert(receiptBody.receipt.evidence?.mediaAssetKind === "capture-recording" && receiptBody.receipt.evidence?.mediaAssetId === RECORDING_ASSET_ID && receiptBody.receipt.evidence?.protectedPlaybackSourceId === SOURCE_ID, "Receipt lost its exact protected source identity.");
    await main.getByText(/Proof-listened through the exact protected RecordingAsset/).waitFor();

    await audio.evaluate((element) => element.pause());
    await assertNoHorizontalOverflow(main, "retained protected edit proof");
    assert(pageErrors.length === 0, `Protected edit proof raised browser exceptions: ${pageErrors.join(" | ")}`);
    process.stdout.write(`${JSON.stringify({ ok: true, localOnly: true, retained: true, projectSlug: PROJECT_SLUG, episodeSlug: EPISODE_SLUG, recordingAssetId: RECORDING_ASSET_ID, protectedPlaybackSourceId: SOURCE_ID, playbackReadyState: await audio.evaluate((element) => element.readyState), playbackPositionSeconds: playbackPosition, exactSourceReceiptSaved: true, proposalApplied: false, sourceMediaUnchanged: true, browserExceptions: 0, horizontalOverflow: false }, null, 2)}\n`);
  } finally {
    await clearRenderedSession(page, baseURL).catch(() => undefined);
    await context.close();
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
