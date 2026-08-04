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
const PROJECT_SLUG = "high-ground-odyssey";
const EPISODE_SLUG = "deterministic-edit-evidence-20260803";
const RECORDING_ASSET_ID = "qa-edit-signal-recording-20260803";
const SOURCE_SHA256 = "d".repeat(64);
const SIGNAL_PROFILE_SHA256 = "23f507037896474069896dcf1a93b95980844d27c73a3c99758def3207e25b98";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const baseURL = requireLoopbackOrigin(
    process.env.QUIPSLY_RETAINED_PRODUCT_BASE_URL || "http://127.0.0.1:3012",
    "QUIPSLY_RETAINED_PRODUCT_BASE_URL",
  );
  const password = readRetainedQAPassword({ service: KEYCHAIN_SERVICE, account: OPERATOR_EMAIL });
  assert(password, "The retained media operator has no Keychain password.");

  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: "dark", locale: "en-US", reducedMotion: "reduce" });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  try {
    const callbackPath = `/editor?project=${encodeURIComponent(PROJECT_SLUG)}&episode=${encodeURIComponent(EPISODE_SLUG)}`;
    await signInThroughRenderedLogin({ page, baseURL, identity: { role: "automated-edit-evidence-operator", email: OPERATOR_EMAIL }, password, callbackPath });
    await page.getByText(/Loaded .* from saved timeline/, { exact: true }).waitFor({ timeout: 20_000 });
    const main = page.getByRole("main").last();

    const responsePromise = page.waitForResponse((response) => response.url().includes("/api/ai-edit") && response.request().method() === "POST");
    await main.getByRole("button", { name: "Analyze locally", exact: true }).click();
    const response = await responsePromise;
    const body = await response.json().catch(() => ({}));
    assert(response.ok(), `Deterministic edit analysis failed (${response.status()}): ${JSON.stringify(body)}`);
    assert(body?.proposalSet?.binding?.signalEvidence?.recordingAssetId === RECORDING_ASSET_ID, "Proposal set did not bind the retained RecordingAsset.");
    assert(body?.proposalSet?.binding?.signalEvidence?.sourceSha256 === SOURCE_SHA256, "Proposal set did not bind the immutable source hash.");
    assert(body?.signalVisualization?.signalProfileSha256 === SIGNAL_PROFILE_SHA256, "Visualization did not bind the retained signal-profile hash.");
    assert(body?.signalVisualization?.waveform?.length === 3, "Visualization did not return the three retained decoded signal windows.");

    const map = main.getByRole("region", { name: "Automated edit evidence map", exact: true });
    await map.waitFor({ timeout: 20_000 });
    await map.getByRole("img", { name: "Decoded waveform with automated edit evidence over the source clock", exact: true }).waitFor();
    const svgTitles = await map.locator("svg title").allTextContents();
    assert(svgTitles.some((title) => title.includes("decoded RMS -78.0 dBFS")), `Rendered map did not expose the retained low-energy window: ${svgTitles.join(" | ")}`);
    assert((await map.innerText()).includes("RMS is not LUFS"), "Rendered map lost its measurement boundary.");

    await map.getByRole("button", { name: /0:04\.0 · Measured range-skip proposal/i }).click();
    const selected = map.getByLabel("Selected automated edit evidence", { exact: true });
    await selected.getByText(/100% decoded coverage · strongest RMS -78\.0 dBFS/i).waitFor();
    await main.getByText(/Selected untouched source at 00:04\./).waitFor();

    const sourceClock = map.getByRole("button", { name: /Edit evidence source clock from .* Select an exact playback position/i });
    const bounds = await sourceClock.boundingBox();
    assert(bounds?.width > 100, "Rendered source clock has no operable width.");
    await sourceClock.click({ position: { x: bounds.width * 0.66, y: bounds.height * 0.5 } });
    await main.getByText(/Selected untouched source at 00:08\./).waitFor();

    await assertNoHorizontalOverflow(main, "retained automated edit evidence map");
    assert(pageErrors.length === 0, `Rendered automated edit evidence raised page errors: ${pageErrors.join(" | ")}`);

    process.stdout.write(`${JSON.stringify({
      ok: true,
      localOnly: true,
      retained: true,
      projectSlug: PROJECT_SLUG,
      episodeSlug: EPISODE_SLUG,
      recordingAssetId: RECORDING_ASSET_ID,
      signalProfileSha256: SIGNAL_PROFILE_SHA256,
      decodedWaveformWindows: 3,
      measuredLowEnergyWindowVisible: true,
      reversibleRangeProposalVisible: true,
      selectedEvidenceMovedSharedPlayhead: true,
      sourceClockScrubbed: true,
      proposalApplied: false,
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

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
