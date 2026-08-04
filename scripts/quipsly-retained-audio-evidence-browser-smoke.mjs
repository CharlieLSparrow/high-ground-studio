#!/usr/bin/env node

import { readRetainedQAPassword } from "./lib/retained-qa-keychain.mjs";
import {
  assertNoHorizontalOverflow,
  clearRenderedSession,
  loadPlaywright,
  requireLoopbackOrigin,
  signInThroughRenderedLogin,
} from "./lib/retained-qa-browser.mjs";

const KEYCHAIN_SERVICE = "com.quipsly.qa.retained-coaching";
const ROOM_ID = "retained-coaching-follow-up-20260731";
const IDENTITY = {
  role: "coach",
  email: "quipsly-coach-retained-20260731@example.test",
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const baseURL = requireLoopbackOrigin(
    process.env.QUIPSLY_RETAINED_COACHING_BASE_URL || "http://127.0.0.1:3012",
    "QUIPSLY_RETAINED_COACHING_BASE_URL",
  );
  const password = readRetainedQAPassword({
    service: KEYCHAIN_SERVICE,
    account: IDENTITY.email,
  });
  assert(password, "The retained coach has no Keychain password. Run the retained coaching Keychain seed first.");

  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1_100 },
    colorScheme: "dark",
    locale: "en-US",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  try {
    const callbackPath = `/sessions/${ROOM_ID}?mode=transcript`;
    await signInThroughRenderedLogin({ page, baseURL, identity: IDENTITY, password, callbackPath });

    const evidenceMap = page.getByRole("region", { name: "Audio evidence map", exact: true });
    try {
      await evidenceMap.waitFor({ timeout: 20_000 });
    } catch (error) {
      const status = await page.getByText(/Decoded signal scan unavailable|Decoded audio evidence status|Build decoded audio map/).allInnerTexts().catch(() => []);
      throw new Error(`Retained Session has no rendered decoded-audio map. Status: ${JSON.stringify(status)}`, { cause: error });
    }

    const navigator = evidenceMap.getByRole("region", { name: "Audio evidence review navigator", exact: true });
    await navigator.waitFor();
    const navigatorText = await navigator.innerText();
    assert(navigatorText.includes("source-clock review point"), "Audio evidence navigator lost its source-clock review count.");
    assert(navigatorText.includes("measured flags"), "Audio evidence navigator no longer explains its evidence categories.");

    await evidenceMap.getByText("Window RMS dBFS", { exact: true }).waitFor();
    await evidenceMap.getByText("Sample peak dBFS", { exact: true }).waitFor();
    await evidenceMap.getByText(/Near-silent · \d+ windows/).waitFor();
    await evidenceMap.getByText(/Clipping span · \d+ windows/).waitFor();
    await evidenceMap.getByText(/not a sample-level waveform/i).waitFor();
    const frequencyEvidence = evidenceMap.getByRole("region", { name: "Broad-band frequency evidence", exact: true });
    await frequencyEvidence.waitFor();
    await frequencyEvidence.getByText(/not an RX-style repair spectrogram/i).waitFor();
    const frequencyToggle = evidenceMap.getByRole("button", { name: "Frequency", exact: true });
    await frequencyToggle.click();
    assert(await frequencyToggle.getAttribute("aria-pressed") === "true", "Broad-band frequency view did not become active.");
    await evidenceMap.getByRole("img", { name: /Complete-decode broad-band frequency energy/i }).waitFor();
    await evidenceMap.getByRole("button", { name: /Broad-band frequency evidence map from/i }).waitFor();

    const nextEvidence = navigator.getByRole("button", { name: /Next evidence/ });
    const hasNavigableEvidence = await nextEvidence.isEnabled();
    if (hasNavigableEvidence) {
      await nextEvidence.click();
      const detailZoom = evidenceMap.getByRole("button", { name: "15 sec", exact: true });
      assert(await detailZoom.getAttribute("aria-pressed") === "true", "Evidence navigation did not focus the 15-second listening view.");
    }

    await assertNoHorizontalOverflow(evidenceMap, "audio evidence map");
    assert(pageErrors.length === 0, `Audio evidence journey raised browser exceptions: ${JSON.stringify(pageErrors)}`);
    await clearRenderedSession(page, baseURL, IDENTITY.role);

    console.log(JSON.stringify({
      ok: true,
      localOnly: true,
      retained: true,
      renderedProduct: true,
      route: `/sessions/${ROOM_ID}?mode=transcript`,
      evidenceNavigator: "passed",
      decodedSignalLabels: "passed",
      broadBandFrequencyEvidence: "passed",
      detailNavigation: hasNavigableEvidence ? "passed" : "not-applicable-no-review-points",
      horizontalOverflow: false,
      browserExceptions: 0,
      credentialStore: "macOS Keychain",
      screenshotsCaptured: false,
      secretsPrinted: false,
      externalSideEffects: false,
    }, null, 2));
  } finally {
    await context.close();
    await browser.close();
  }
}

await main();
