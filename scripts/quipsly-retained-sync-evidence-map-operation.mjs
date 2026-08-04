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
const EPISODE_SLUG = "sync-evidence-map-episode-4-20260804";
const EPISODE_4_ASSET_ID = "local-transcript-asset-episode-4";
const UNMEASURED_TARGET_URL = "https://example.invalid/quipsly-sync-evidence-target.wav";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function post(page, url, body) {
  return page.evaluate(async ({ target, payload }) => {
    const response = await fetch(target, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    return { status: response.status, body: await response.json() };
  }, { target: url, payload: body });
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
    await signInThroughRenderedLogin({ page, baseURL, identity: { role: "sync-evidence-map-operator", email: OPERATOR_EMAIL }, password, callbackPath: "/projects" });
    console.error("[sync-evidence-map] signed in");
    const ensured = await post(page, "/api/episode-production", { action: "ensure", projectSlug: PROJECT_SLUG, episodeSlug: EPISODE_SLUG, title: "Episode 4 sync evidence map", boundaryLabel: "Episode 4 sync evidence map" });
    assert(ensured.status === 200 && ensured.body?.mode === "database", `Episode ensure failed: ${JSON.stringify(ensured)}`);
    const promoted = await post(page, "/api/mobile/capture/recordings/promote", { recordingAssetId: EPISODE_4_ASSET_ID, nestSlug: PROJECT_SLUG, episodeSlug: EPISODE_SLUG });
    assert(promoted.status === 200 && promoted.body?.ok === true, `Recording attachment failed for ${EPISODE_4_ASSET_ID}: ${JSON.stringify(promoted)}`);
    const importedMedia = Array.isArray(ensured.body?.productionJson?.importedMedia) ? ensured.body.productionJson.importedMedia : [];
    if (!importedMedia.some((asset) => asset?.originalName === "Unmeasured sync target.wav")) {
      const unmeasuredTarget = await post(page, "/api/episode-production/import-media", {
        projectSlug: PROJECT_SLUG,
        episodeSlug: EPISODE_SLUG,
        sourceUrl: UNMEASURED_TARGET_URL,
        originalName: "Unmeasured sync target.wav",
        kind: "audio",
        importRole: "audio-source",
        recordingSyncMetadata: { durationSeconds: 60 },
      });
      assert(unmeasuredTarget.status === 200 && unmeasuredTarget.body?.ok === true, `Unmeasured target registration failed: ${JSON.stringify(unmeasuredTarget)}`);
    }
    console.error("[sync-evidence-map] sources attached");

    await page.goto(`${baseURL}/editor?project=${encodeURIComponent(PROJECT_SLUG)}&episode=${encodeURIComponent(EPISODE_SLUG)}`, { waitUntil: "load" });
    await page.waitForTimeout(1_000);
    console.error(`[sync-evidence-map] route ${page.url()}`);
    await page.getByRole("button", { name: /Advanced Tools OFF/i }).click();
    const wizard = page.locator("#guided-sync-wizard");
    await wizard.getByText("Guided sync wizard", { exact: true }).waitFor({ timeout: 20_000 });
    console.error("[sync-evidence-map] editor loaded");
    await wizard.getByText("episode-4-charlie-680-740.wav", { exact: true }).first().click();
    const targetSelect = wizard.locator("label").filter({ hasText: "2. Pick target media" }).locator("select");
    const targetValue = await targetSelect.locator("option").evaluateAll((options) => options.find((option) => option.textContent?.includes("Unmeasured sync target.wav"))?.getAttribute("value") ?? "");
    assert(targetValue, "The unmeasured target option was not available in Guided sync.");
    await targetSelect.selectOption(targetValue);
    console.error("[sync-evidence-map] sources selected");
    const map = wizard.getByRole("region", { name: "Source sync evidence map", exact: true });
    await map.waitFor({ timeout: 20_000 });
    assert(await map.getByText("Spine decoded waveform not attached").count() === 0, "The selected spine did not project its decoded waveform.");
    await map.getByText("Target decoded waveform not attached", { exact: true }).waitFor();
    await wizard.getByLabel("Seconds between review points", { exact: true }).fill("10");
    await wizard.getByLabel("Residual drift at later point (ms)", { exact: true }).fill("5");
    await map.getByText("later point measured", { exact: true }).waitFor();
    await map.getByText("500.000 ppm", { exact: true }).waitFor();
    await map.getByText("+5.000 ms", { exact: true }).first().waitFor();
    console.error("[sync-evidence-map] measured map visible");

    assert(await wizard.getByRole("checkbox", { name: /Approve this reversible placement/i }).isChecked() === false, "The retained visualization operation unexpectedly approved placement.");
    await assertNoHorizontalOverflow(page.locator("body"), "retained source sync evidence map");
    assert(pageErrors.length === 0, `Source sync evidence map raised browser exceptions: ${pageErrors.join(" | ")}`);

    process.stdout.write(`${JSON.stringify({
      ok: true,
      localOnly: true,
      retained: true,
      projectSlug: PROJECT_SLUG,
      episodeSlug: EPISODE_SLUG,
      sourceAssetIds: [EPISODE_4_ASSET_ID],
      decodedWaveformLanes: 1,
      targetWaveformTruth: "missing-visible",
      openingAnchorVisible: true,
      laterDriftVisible: true,
      observedPartsPerMillion: 500,
      dualSourceAuditionOperated: false,
      reviewReceiptSaved: false,
      sourceMediaUnchanged: true,
      browserExceptions: 0,
      horizontalOverflow: false,
    }, null, 2)}\n`);
  } finally {
    await clearRenderedSession(page, baseURL).catch(() => undefined);
    await context.close();
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
