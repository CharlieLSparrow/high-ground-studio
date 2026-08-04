#!/usr/bin/env node

import assert from "node:assert/strict";

import pg from "pg";

import {
  assertNoHorizontalOverflow,
  clearRenderedSession,
  loadPlaywright,
  requireLoopbackOrigin,
  signInThroughRenderedLogin,
} from "./lib/retained-qa-browser.mjs";
import { readRetainedQAPassword } from "./lib/retained-qa-keychain.mjs";

const KEYCHAIN_SERVICE = "com.quipsly.qa.retained-coaching";
const COACH_EMAIL = "quipsly-coach-retained-20260731@example.test";

function requireLocalDatabase(value) {
  const url = new URL(value);
  assert.ok(["127.0.0.1", "localhost", "::1"].includes(url.hostname), "Measured transcript operation refuses non-local PostgreSQL.");
  return value;
}

async function retainedReviewedRoom(pool) {
  const result = await pool.query({
    text: `SELECT r.id
           FROM "CallRoom" r
           JOIN "CallParticipant" participant
             ON participant."roomId"=r.id AND lower(participant.email)=lower($1)
           WHERE r.id LIKE 'qa-reviewed-packet-%'
             AND EXISTS (SELECT 1 FROM "RecordingAsset" asset WHERE asset."roomId"=r.id AND asset."verifiedAt" IS NOT NULL)
             AND (
               EXISTS (SELECT 1 FROM "TranscriptSegmentVerification" verification WHERE verification."roomId"=r.id)
               OR EXISTS (SELECT 1 FROM "TranscriptCorrection" correction WHERE correction."roomId"=r.id AND correction.status='accepted')
             )
           ORDER BY r."createdAt" DESC
           LIMIT 1`,
    values: [COACH_EMAIL],
  });
  assert.ok(result.rows[0]?.id, "No retained playback-reviewed coaching packet is available.");
  return String(result.rows[0].id);
}

async function main() {
  const baseURL = requireLoopbackOrigin(
    process.env.QUIPSLY_RETAINED_COACHING_BASE_URL || "http://127.0.0.1:3012",
    "QUIPSLY_RETAINED_COACHING_BASE_URL",
  );
  const databaseURL = requireLocalDatabase(process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio");
  const password = readRetainedQAPassword({ service: KEYCHAIN_SERVICE, account: COACH_EMAIL });
  assert.ok(password, "The retained coach Keychain credential is unavailable.");
  const pool = new pg.Pool({ connectionString: databaseURL, max: 1 });
  const roomId = await retainedReviewedRoom(pool);
  await pool.end();

  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1_000 }, colorScheme: "dark", locale: "en-US", reducedMotion: "reduce" });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const identity = { role: "retained-measured-transcript-coach", email: COACH_EMAIL };

  try {
    const callbackPath = `/sessions/${encodeURIComponent(roomId)}?mode=transcript`;
    await signInThroughRenderedLogin({ page, baseURL, identity, password, callbackPath });
    const contributors = page.getByRole("region", { name: "Measured transcript error contributors", exact: true });
    await contributors.waitFor({ timeout: 20_000 });
    await contributors.getByText(/aggregate WER above includes every reviewed segment/i).waitFor();
    const contributorButtons = contributors.getByRole("button", { name: /Play measured transcript segment from/i });
    const contributorCount = await contributorButtons.count();
    assert.ok(contributorCount > 0, "The measured transcript contributor list is empty.");
    const firstContributor = contributorButtons.first();
    await firstContributor.waitFor();
    const audio = page.getByLabel("Protected session recording", { exact: true });
    const unavailableAlert = page.getByRole("alert").filter({ hasText: /Protected source bytes are unavailable/i });
    await Promise.race([
      page.waitForFunction(() => document.querySelector('audio[aria-label="Protected session recording"]')?.readyState >= 1, undefined, { timeout: 20_000 }),
      unavailableAlert.waitFor({ timeout: 20_000 }),
    ]);
    const sourceUnavailable = await unavailableAlert.isVisible().catch(() => false);
    let playback = { currentTime: 0, readyState: 0 };
    if (sourceUnavailable) {
      assert.equal(await firstContributor.isDisabled(), true, "Missing protected source bytes left measured-review navigation enabled.");
      assert.match(await unavailableAlert.innerText(), /no new playback, correction, note, task, goal, draft, or accuracy claim/i);
    } else {
      assert.equal(await firstContributor.isEnabled(), true, "Protected playback was not ready for measured transcript navigation.");
      await firstContributor.click();
      playback = await audio.evaluate((element) => ({ currentTime: element.currentTime, readyState: element.readyState }));
      assert.ok(Number.isFinite(playback.currentTime), "Measured contributor navigation lost the source-clock position.");
      assert.ok(playback.readyState >= 1, "Protected measured transcript source did not load metadata.");
    }
    await assertNoHorizontalOverflow(contributors, "measured transcript error contributors");
    assert.equal(pageErrors.length, 0, `Measured transcript contributor journey raised browser errors: ${pageErrors.join(" | ")}`);
    await clearRenderedSession(page, baseURL, identity.role);

    process.stdout.write(`${JSON.stringify({
      ok: true,
      localOnly: true,
      retained: true,
      renderedProduct: true,
      roomId,
      measuredContributorCount: contributorCount,
      protectedPlaybackReadyState: playback.readyState,
      contributorNavigationOperated: !sourceUnavailable,
      missingSourceAuthorityHeld: sourceUnavailable,
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
