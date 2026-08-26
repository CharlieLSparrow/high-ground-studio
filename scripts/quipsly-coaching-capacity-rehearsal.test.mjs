import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const source = readFileSync(
  fileURLToPath(new URL("./quipsly-coaching-capacity-rehearsal.mjs", import.meta.url)),
  "utf8",
);

test("coaching capacity rehearsal remains local, adversarial, and non-credentialed", () => {
  assert.match(source, /QUIPSLY_COACHING_CAPACITY_REHEARSAL/);
  assert.match(source, /QUIPSLY_COACHING_CAPACITY_COUNT \|\| 50/);
  assert.match(source, /requestedCount >= 2 && requestedCount <= 100/);
  assert.match(source, /requireLoopbackOrigin/);
  assert.match(source, /requires loopback PostgreSQL/);
  assert.match(source, /requires the loopback Firebase Auth emulator/);
  assert.match(source, /create-booking-room/);
  assert.match(source, /create-booking-series/);
  assert.match(source, /idempotentReplay/);
  assert.match(source, /finiteSeriesCreatedAtomically/);
  assert.match(source, /create-session-invitation/);
  assert.match(source, /foreign-engagement-refusal/);
  assert.match(source, /productApiWritesOnly: true/);
  assert.match(source, /directDatabaseWrites: false/);
  assert.match(source, /renderedNoviceExperienceProven: false/);
  assert.match(source, /productionScaleProven: false/);
  assert.match(source, /\(\?:__Secure-\)\?session=/);
  assert.match(source, /failedRequestCount/);
  assert.match(source, /statusCounts/);
  assert.match(source, /mode: 0o600/);
  assert.doesNotMatch(source, /console\.log\([^\n]*(?:cookie|idToken|customToken)/i);
});
