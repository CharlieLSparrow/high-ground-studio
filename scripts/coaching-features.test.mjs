import assert from "node:assert/strict";
import test from "node:test";

import {
  COACHING_FEATURE_CATALOG,
  isClientVisibleCoachingFeatureGrant,
} from "../apps/web/src/lib/coaching/features.ts";

test("defines a stable manual coaching feature catalog", () => {
  const keys = COACHING_FEATURE_CATALOG.map((feature) => feature.featureKey);

  assert.ok(keys.includes("session_prep"));
  assert.ok(keys.includes("weekly_commitments"));
  assert.ok(keys.includes("reflection_journal"));
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(COACHING_FEATURE_CATALOG.every((feature) => feature.title));
  assert.ok(COACHING_FEATURE_CATALOG.every((feature) => feature.clientSummary));
});

test("only exposes enabled client-visible feature grants", () => {
  const now = new Date("2026-05-25T12:00:00.000Z");

  assert.equal(
    isClientVisibleCoachingFeatureGrant({
      status: "enabled",
      visibility: "client_and_coach",
      startsAt: new Date("2026-05-24T12:00:00.000Z"),
      endsAt: new Date("2026-05-26T12:00:00.000Z"),
      now,
    }),
    true,
  );
  assert.equal(
    isClientVisibleCoachingFeatureGrant({
      status: "paused",
      visibility: "client_and_coach",
      now,
    }),
    false,
  );
  assert.equal(
    isClientVisibleCoachingFeatureGrant({
      status: "enabled",
      visibility: "coach_only",
      now,
    }),
    false,
  );
  assert.equal(
    isClientVisibleCoachingFeatureGrant({
      status: "enabled",
      visibility: "client_and_coach",
      startsAt: new Date("2026-05-26T12:00:00.000Z"),
      now,
    }),
    false,
  );
});

