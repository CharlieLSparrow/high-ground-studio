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
const PROJECT_SLUG = "high-ground-odyssey-manuscript";
const EPISODE_SLUG = "capture-sync-rendezvous-qa-20260805";
const CAPTURE_GROUP_ID = "967f72b2-f762-4535-a337-e69b5676cad1";
const SPINE_MEDIA_ASSET_ID = "cmsi2ifcm000clqxl8r15z75f";
const SPINE_LABEL = "mv7i-backup.mp3";
const EXPECTED_PLAYBACK_URLS = [
  "/api/ingest/media/cmsi2ifcf000blqxl6ho1zsaa",
  "/api/ingest/media/cmsi2v3tf000llqxljw2v8xc0",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function captureClips(timelineJson) {
  const clips = Array.isArray(timelineJson?.timelineClips)
    ? timelineJson.timelineClips
    : Array.isArray(timelineJson?.clips)
      ? timelineJson.clips
      : [];
  return clips.filter((clip) => clip?.captureTakeSource?.captureGroupId === CAPTURE_GROUP_ID);
}

export function assertProtectedPlaybackBindings(timelineJson) {
  const clips = captureClips(timelineJson);
  assert(clips.length === EXPECTED_PLAYBACK_URLS.length, `Expected ${EXPECTED_PLAYBACK_URLS.length} retained Capture clips, observed ${clips.length}.`);
  const actual = clips.map((clip) => String(clip.assetId || "")).sort();
  const expected = [...EXPECTED_PLAYBACK_URLS].sort();
  assert(JSON.stringify(actual) === JSON.stringify(expected), `Materialized clips did not bind protected playback URLs: ${JSON.stringify(actual)}`);
  for (const clip of clips) {
    assert(typeof clip.captureTakeSource.recordingAssetId === "string" && clip.captureTakeSource.recordingAssetId, "Capture clip lost its recording-asset provenance.");
    assert(typeof clip.captureTakeSource.mediaAssetId === "string" && clip.captureTakeSource.mediaAssetId, "Capture clip lost its media-asset provenance.");
    assert(typeof clip.captureTakeSource.sourceId === "string" && clip.captureTakeSource.sourceId, "Capture clip lost its imported-source provenance.");
  }
  return clips;
}

async function inspectTake(page) {
  return page.evaluate(async ({ projectSlug, episodeSlug, captureGroupId }) => {
    const query = new URLSearchParams({ projectSlug, episodeSlug, captureGroupId });
    const response = await fetch(`/api/episode-production/capture-takes?${query}`, { cache: "no-store" });
    return { status: response.status, body: await response.json() };
  }, { projectSlug: PROJECT_SLUG, episodeSlug: EPISODE_SLUG, captureGroupId: CAPTURE_GROUP_ID });
}

async function loadCanonicalEpisode(page) {
  return page.evaluate(async ({ projectSlug, episodeSlug }) => {
    const response = await fetch("/api/episode-production", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ensure", projectSlug, episodeSlug }),
    });
    return { status: response.status, body: await response.json() };
  }, { projectSlug: PROJECT_SLUG, episodeSlug: EPISODE_SLUG });
}

async function main() {
  assert(process.env.QUIPSLY_RETAINED_CAPTURE_PLAYBACK_OPERATION === "1", "Set QUIPSLY_RETAINED_CAPTURE_PLAYBACK_OPERATION=1 to operate the retained local episode.");
  const baseURL = requireLoopbackOrigin(
    process.env.QUIPSLY_RETAINED_PRODUCT_BASE_URL || "http://127.0.0.1:3012",
    "QUIPSLY_RETAINED_PRODUCT_BASE_URL",
  );
  const password = readRetainedQAPassword({ service: KEYCHAIN_SERVICE, account: OPERATOR_EMAIL });
  assert(password, "The retained media operator has no Keychain password.");

  const callbackPath = `/editor?project=${encodeURIComponent(PROJECT_SLUG)}&episode=${encodeURIComponent(EPISODE_SLUG)}&captureGroup=${encodeURIComponent(CAPTURE_GROUP_ID)}`;
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({
    headless: true,
    channel: "chrome",
    args: ["--autoplay-policy=no-user-gesture-required"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: "dark",
    locale: "en-US",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const pageErrors = [];
  const browserWarnings = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) browserWarnings.push(message.text());
  });

  let signedIn = false;
  let sessionCleared = false;
  try {
    await signInThroughRenderedLogin({
      page,
      baseURL,
      identity: { role: "retained-capture-playback-operator", email: OPERATOR_EMAIL },
      password,
      callbackPath,
    });
    signedIn = true;
    await page.getByRole("heading", { name: /Episode Editor/i }).waitFor({ timeout: 30_000 });
    const panel = page.getByTestId("capture-take-materialization");
    await panel.waitFor({ timeout: 30_000 });

    let before = await inspectTake(page);
    assert(before.status === 200 && before.body?.ok === true, `Capture take inspection failed: ${JSON.stringify(before)}`);
    assert(before.body.sourceCount === EXPECTED_PLAYBACK_URLS.length, `Capture take source count changed: ${before.body.sourceCount}`);

    let spineSelection = "already current";
    const issueCodes = Array.isArray(before.body.plan?.issues) ? before.body.plan.issues.map((issue) => issue.code) : [];
    if (before.body.plan?.ok !== true && issueCodes.length === 1 && issueCodes[0] === "spine-source-ambiguous") {
      const card = page.getByTestId(`imported-media-card-${SPINE_MEDIA_ASSET_ID}`);
      await card.getByText(SPINE_LABEL, { exact: true }).waitFor({ timeout: 20_000 });
      const spineButton = card.getByRole("button", { name: "Make this the main spine audio", exact: true });
      await spineButton.waitFor({ timeout: 20_000 });
      page.once("dialog", (dialog) => dialog.accept());
      await spineButton.click();
      await page.getByText(`Spine audio set: ${SPINE_LABEL}.`, { exact: true }).waitFor({ timeout: 20_000 });
      before = await inspectTake(page);
      await panel.getByRole("button", { name: "Recheck evidence", exact: true }).click();
      await panel.getByText("Assembly ready", { exact: true }).waitFor({ timeout: 20_000 });
      spineSelection = "performed through rendered editor";
    }
    assert(before.body.plan?.ok === true, `Capture take remained blocked: ${JSON.stringify(before.body.plan?.issues)}`);

    let materialization = "already current";
    if (before.body.plan.changed) {
      const readyButton = panel.getByRole("button", { name: "Materialize ready take", exact: true });
      await readyButton.waitFor({ timeout: 20_000 });
      assert(await readyButton.isEnabled(), "The rendered materialization action was not enabled for a changed ready take.");
      const [materializeResponse] = await Promise.all([
        page.waitForResponse((response) => new URL(response.url()).pathname === "/api/episode-production/capture-takes" && response.request().method() === "POST"),
        readyButton.click(),
      ]);
      const materializeBody = await materializeResponse.json().catch(() => null);
      assert(
        materializeResponse.status() === 200 && materializeBody?.ok === true,
        `Rendered materialization returned HTTP ${materializeResponse.status()}: ${JSON.stringify({ body: materializeBody, request: materializeResponse.request().postDataJSON() })}`,
      );
      await panel.getByRole("button", { name: "Take already materialized", exact: true }).waitFor({ timeout: 30_000 });
      materialization = "performed through rendered editor";
    } else {
      await panel.getByRole("button", { name: "Take already materialized", exact: true }).waitFor({ timeout: 20_000 });
    }

    const after = await inspectTake(page);
    assert(after.status === 200 && after.body?.ok === true, `Post-materialization inspection failed: ${JSON.stringify(after)}`);
    assert(after.body.plan?.changed === false, "The canonical episode did not converge after materialization.");
    const canonical = await loadCanonicalEpisode(page);
    assert(canonical.status === 200 && canonical.body?.mode === "database", `Canonical episode readback failed: ${JSON.stringify(canonical)}`);
    const clips = assertProtectedPlaybackBindings(canonical.body.timelineJson);

    for (const playbackUrl of EXPECTED_PLAYBACK_URLS) {
      const response = await page.request.get(`${baseURL}${playbackUrl}`, { headers: { Range: "bytes=0-4095" } });
      assert([200, 206].includes(response.status()), `Protected media ${playbackUrl} returned HTTP ${response.status()}.`);
      const body = await response.body();
      assert(body.byteLength > 0, `Protected media ${playbackUrl} returned no bytes.`);
    }

    const player = page.locator(".quipsly-remotion-player");
    await player.waitFor({ timeout: 20_000 });
    const playButton = player.getByRole("button", { name: "Play video", exact: true });
    await playButton.waitFor({ timeout: 20_000 });
    await playButton.click();
    const pauseButton = player.getByRole("button", { name: "Pause video", exact: true });
    await pauseButton.waitFor({ timeout: 10_000 });
    try {
      await page.waitForFunction((expected) => expected.every(({ path, minimumTime }) => Array.from(document.querySelectorAll(".quipsly-remotion-player audio"))
        .some((node) => new URL(node.currentSrc || node.src, window.location.origin).pathname === path && node.currentTime > minimumTime)), [
        { path: EXPECTED_PLAYBACK_URLS[0], minimumTime: 0.25 },
        { path: EXPECTED_PLAYBACK_URLS[1], minimumTime: 1.5 },
      ], { timeout: 15_000 });
    } catch {
      const diagnostics = await page.locator("audio").evaluateAll((nodes) => nodes.map((node) => ({
        path: new URL(node.currentSrc || node.src, window.location.origin).pathname,
        currentTime: node.currentTime,
        duration: node.duration,
        paused: node.paused,
        muted: node.muted,
        volume: node.volume,
        readyState: node.readyState,
        networkState: node.networkState,
        errorCode: node.error?.code ?? null,
        errorMessage: node.error?.message ?? null,
      })));
      throw new Error(`Remotion stayed buffered or silent: ${JSON.stringify({ playerText: await player.innerText(), diagnostics, browserWarnings })}`);
    }

    const playbackStates = await player.locator("audio").evaluateAll((nodes, expectedPaths) => nodes
      .map((node) => ({
        path: new URL(node.currentSrc || node.src, window.location.origin).pathname,
        currentTime: node.currentTime,
        paused: node.paused,
        readyState: node.readyState,
      }))
      .filter((state) => expectedPaths.includes(state.path) && state.currentTime > (state.path === expectedPaths[0] ? 0.25 : 1.5)), EXPECTED_PLAYBACK_URLS);
    assert(new Set(playbackStates.map((state) => state.path)).size === EXPECTED_PLAYBACK_URLS.length, `Remotion did not advance both protected Capture sources: ${JSON.stringify(playbackStates)}`);
    assert(
      playbackStates.every((state) => state.paused === false && state.readyState >= 2),
      `Remotion did not advance both decoded Capture sources: ${JSON.stringify(playbackStates)}`,
    );

    await pauseButton.click();
    await player.getByRole("button", { name: "Play video", exact: true }).waitFor({ timeout: 5_000 });
    await page.waitForTimeout(150);
    const pausedStates = await player.locator("audio").evaluateAll((nodes, expectedPaths) => nodes
      .filter((node) => expectedPaths.includes(new URL(node.currentSrc || node.src, window.location.origin).pathname))
      .map((node) => node.paused), EXPECTED_PLAYBACK_URLS);
    assert(pausedStates.length === EXPECTED_PLAYBACK_URLS.length && pausedStates.every(Boolean), "Pause did not stop both protected Capture sources.");

    await assertNoHorizontalOverflow(page.locator("body"), "materialized Capture playback editor");
    assert(pageErrors.length === 0, `Materialized playback raised browser exceptions: ${pageErrors.join(" | ")}`);
    await clearRenderedSession(page, baseURL, "retained-capture-playback-operator");
    sessionCleared = true;

    process.stdout.write(`${JSON.stringify({
      ok: true,
      localOnly: true,
      retained: true,
      renderedProduct: true,
      spineSelection,
      materialization,
      captureClipCount: clips.length,
      protectedPlaybackUrls: EXPECTED_PLAYBACK_URLS,
      protectedRangeRead: "passed",
      remotionPlayback: playbackStates,
      pause: "passed",
      provenance: "recording asset + media asset + imported source retained",
      sourceMediaMutated: false,
      publicationStarted: false,
      browserExceptions: 0,
      sessionClear: "passed",
      secretsPrinted: false,
    }, null, 2)}\n`);
  } finally {
    if (signedIn && !sessionCleared) {
      await clearRenderedSession(page, baseURL, "retained-capture-playback-operator").catch(() => {});
    }
    await context.close();
    await browser.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
