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
const ROOM_ID = "cmsfpfwrt000db9xld8ppuon4";

async function main() {
  const baseURL = requireLoopbackOrigin(
    process.env.QUIPSLY_RETAINED_PRODUCT_BASE_URL || "http://127.0.0.1:3012",
    "QUIPSLY_RETAINED_PRODUCT_BASE_URL",
  );
  const password = readRetainedQAPassword({ service: KEYCHAIN_SERVICE, account: OPERATOR_EMAIL });
  assert.ok(password, "The retained media operator has no Keychain password.");
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1_100 }, colorScheme: "dark", locale: "en-US", reducedMotion: "reduce" });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const identity = { role: "retained-recording-health-operator", email: OPERATOR_EMAIL };
  const screenshotPath = process.env.QUIPSLY_RECORDING_HEALTH_SCREENSHOT || "";
  assert.ok(!screenshotPath || screenshotPath.startsWith("/tmp/"), "Recording-health QA screenshots must stay under /tmp.");

  try {
    const callbackPath = `/sessions/${ROOM_ID}?mode=recordings`;
    await signInThroughRenderedLogin({ page, baseURL, identity, password, callbackPath });
    const flightDeck = page.locator("section[data-session-recording-health]");
    await flightDeck.waitFor({ timeout: 20_000 });
    const projectedState = await flightDeck.getAttribute("data-session-recording-health");
    assert.ok(["READY", "REVIEW", "BLOCKED", "UNKNOWN"].includes(projectedState || ""), `The Flight Deck emitted an invalid state: ${projectedState}`);
    await flightDeck.getByText("Audio Flight Deck", { exact: true }).waitFor();
    await flightDeck.getByText(/No mystery score:/).waitFor();
    for (const gate of ["Source plan", "Exact bytes", "Decoded media", "Useful signal", "Processing release", "Transcript release"]) {
      assert.ok(await flightDeck.getByText(gate, { exact: true }).count() >= 1, `The rendered Flight Deck lost the ${gate} gate.`);
    }
    const sourceCards = flightDeck.locator("li[data-recording-health-source]");
    const sourceCount = await sourceCards.count();
    assert.ok(sourceCount >= 4, `Expected retained current and historical source cards, observed ${sourceCount}.`);
    const gateCount = await flightDeck.locator("li[data-recording-health-gate]").count();
    assert.equal(gateCount, sourceCount * 6, "A rendered retained source lost an independently inspectable health gate.");
    assert.ok(await flightDeck.getByRole("link", { name: /Open source plan|Inspect source evidence|Open transcript evidence/ }).count() >= 1, "No evidence-specific next action is reachable from the Flight Deck.");
    const recoveryBoundaries = page.getByText("Audited recovery-replica boundary", { exact: true });
    await recoveryBoundaries.first().waitFor();
    assert.equal(await recoveryBoundaries.count(), 2, "The retained source ledger did not render both audited recovery-replica boundaries.");
    assert.equal(await page.getByText(/Immutable original preserved · replica independently verified/).count(), 2, "The retained source ledger lost the recovery lineage outcome.");
    await assertNoHorizontalOverflow(flightDeck, "desktop Audio Flight Deck");

    await page.setViewportSize({ width: 390, height: 844 });
    await assertNoHorizontalOverflow(flightDeck, "phone-width Audio Flight Deck");
    for (let index = 0; index < await recoveryBoundaries.count(); index += 1) {
      await assertNoHorizontalOverflow(recoveryBoundaries.nth(index).locator(".."), `phone-width recovery lineage ${index + 1}`);
    }
    if (screenshotPath) {
      await flightDeck.scrollIntoViewIfNeeded();
      await page.screenshot({ path: screenshotPath, fullPage: false });
    }
    assert.equal(pageErrors.length, 0, `The rendered Flight Deck raised browser exceptions: ${JSON.stringify(pageErrors)}`);
    await clearRenderedSession(page, baseURL, identity.role);

    console.log(JSON.stringify({
      ok: true,
      localOnly: true,
      retained: true,
      readOnly: true,
      renderedProduct: true,
      route: callbackPath,
      projectedState,
      retainedSourceCards: sourceCount,
      independentlyRenderedGates: gateCount,
      auditedRecoveryBoundaries: 2,
      desktopOverflow: false,
      phoneWidthOverflow: false,
      viewport: "390x844",
      browserExceptions: 0,
      credentialStore: "macOS Keychain",
      screenshotsCaptured: Boolean(screenshotPath),
      secretsPrinted: false,
      externalSideEffects: false,
    }, null, 2));
  } finally {
    await context.close();
    await browser.close();
  }
}

await main();
