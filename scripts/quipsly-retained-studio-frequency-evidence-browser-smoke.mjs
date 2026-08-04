#!/usr/bin/env node

import assert from "node:assert/strict";

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
const EPISODE_SLUG = "episode-8-i-wasnt-born-a-leader";
const ASSET_FILENAME = "Ted Lasso Be Curious.mp4";

async function main() {
  const baseURL = requireLoopbackOrigin(process.env.QUIPSLY_RETAINED_PRODUCT_BASE_URL || "http://127.0.0.1:3012", "QUIPSLY_RETAINED_PRODUCT_BASE_URL");
  const password = readRetainedQAPassword({ service: KEYCHAIN_SERVICE, account: OPERATOR_EMAIL });
  assert.ok(password, "The retained media operator has no Keychain password.");
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1_100 }, colorScheme: "dark", locale: "en-US", reducedMotion: "reduce" });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const identity = { role: "retained-studio-frequency-operator", email: OPERATOR_EMAIL };

  try {
    const callbackPath = `/editor?project=${encodeURIComponent(PROJECT_SLUG)}&episode=${encodeURIComponent(EPISODE_SLUG)}`;
    await signInThroughRenderedLogin({ page, baseURL, identity, password, callbackPath });
    await page.getByRole("heading", { name: /Episode Editor/i }).waitFor({ timeout: 20_000 });
    await page.getByText(ASSET_FILENAME, { exact: true }).first().waitFor({ timeout: 20_000 });
    let card = null;
    let openDesk = null;
    const openDeskButtons = page.getByRole("button", { name: "Open transcript and audio desk", exact: true });
    await openDeskButtons.first().waitFor({ timeout: 20_000 });
    for (let index = 0; index < await openDeskButtons.count(); index += 1) {
      const candidateButton = openDeskButtons.nth(index);
      const candidateCard = candidateButton.locator(`xpath=ancestor::div[contains(@class, 'shadow-sm') and .//*[normalize-space(text())='${ASSET_FILENAME}']][1]`);
      if (await candidateButton.isVisible() && await candidateCard.count() && await candidateCard.getByText(/6-band complete-decode frequency map ready/i).count()) {
        card = candidateCard;
        openDesk = candidateButton;
        break;
      }
    }
    assert.ok(card && openDesk, "No exact retained Episode 8 import owns both the canonical transcript and six-band decoded map.");
    await card.getByText("Canonical source transcript", { exact: true }).waitFor();
    await card.getByText("completed", { exact: true }).first().waitFor({ timeout: 20_000 });
    await openDesk.click();
    const dialog = page.getByRole("dialog", { name: "Transcript and audio evidence desk", exact: true });
    await dialog.waitFor();
    const evidenceMap = dialog.getByRole("region", { name: "Audio evidence map", exact: true });
    await evidenceMap.waitFor({ timeout: 20_000 });
    const frequencyEvidence = evidenceMap.getByRole("region", { name: "Broad-band frequency evidence", exact: true });
    await frequencyEvidence.waitFor();
    await frequencyEvidence.scrollIntoViewIfNeeded();
    for (const label of ["Rumble", "Warmth", "Body", "Speech", "Presence", "Air"]) {
      const labelNode = frequencyEvidence.getByText(label, { exact: true });
      await labelNode.scrollIntoViewIfNeeded();
      assert.equal(await labelNode.isVisible(), true, `Frequency label ${label} is not visible in the full-width desk.`);
    }
    await frequencyEvidence.getByText(/6 bands · source bound/i).waitFor();
    await frequencyEvidence.getByText(/not an RX-style repair spectrogram/i).waitFor();

    const frequencyToggle = evidenceMap.getByRole("button", { name: "Frequency", exact: true });
    await frequencyToggle.click();
    assert.equal(await frequencyToggle.getAttribute("aria-pressed"), "true", "Studio frequency view did not become active.");
    await evidenceMap.getByRole("img", { name: /Complete-decode broad-band frequency energy/i }).waitFor();
    const sourceClock = evidenceMap.getByRole("button", { name: /Broad-band frequency evidence map from/i });
    const bounds = await sourceClock.boundingBox();
    assert.ok(bounds?.width && bounds.width > 100, "Studio frequency map has no operable source-clock width.");
    await sourceClock.click({ position: { x: bounds.width * 0.62, y: bounds.height * 0.45 } });
    await evidenceMap.getByText("15 sec", { exact: true }).waitFor();
    await assertNoHorizontalOverflow(evidenceMap, "Studio broad-band frequency evidence map");
    assert.equal(pageErrors.length, 0, `Studio frequency journey raised browser errors: ${pageErrors.join(" | ")}`);
    await clearRenderedSession(page, baseURL, identity.role);

    process.stdout.write(`${JSON.stringify({
      ok: true,
      localOnly: true,
      retained: true,
      renderedProduct: true,
      projectSlug: PROJECT_SLUG,
      episodeSlug: EPISODE_SLUG,
      assetFilename: ASSET_FILENAME,
      frequencyBandCount: 6,
      frequencyViewOperated: true,
      sourceClockOperated: true,
      horizontalOverflow: false,
      browserExceptions: 0,
      credentialsPrinted: false,
      screenshotsCaptured: false,
      externalSideEffects: false,
    }, null, 2)}\n`);
  } finally {
    await context.close();
    await browser.close();
  }
}

await main();
