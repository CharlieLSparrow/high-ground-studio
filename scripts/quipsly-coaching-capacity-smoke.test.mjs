import assert from "node:assert/strict";
import test from "node:test";

import {
  allowedCapacityOrigin,
  boundedArrivalWindowMilliseconds,
  boundedVirtualCoachCount,
  coachStartDelayMilliseconds,
  percentile,
} from "./quipsly-coaching-capacity-smoke.mjs";

test("capacity smoke keeps the default and upper bound explicit", () => {
  assert.equal(boundedVirtualCoachCount(undefined), 50);
  assert.equal(boundedVirtualCoachCount("100"), 100);
  assert.throws(() => boundedVirtualCoachCount("0"));
  assert.throws(() => boundedVirtualCoachCount("101"));
});

test("capacity smoke can model a bounded coach arrival window", () => {
  assert.equal(boundedArrivalWindowMilliseconds(undefined), 0);
  assert.equal(boundedArrivalWindowMilliseconds("10000"), 10_000);
  assert.throws(() => boundedArrivalWindowMilliseconds("-1"));
  assert.throws(() => boundedArrivalWindowMilliseconds("60001"));
  assert.equal(coachStartDelayMilliseconds(0, 50, 10_000), 0);
  assert.equal(coachStartDelayMilliseconds(49, 50, 10_000), 10_000);
  assert.equal(coachStartDelayMilliseconds(24, 50, 10_000), 4_898);
});

test("capacity smoke refuses accidental third-party targets", () => {
  assert.equal(
    allowedCapacityOrigin("https://nest.quipsly.com/path"),
    "https://nest.quipsly.com",
  );
  assert.equal(
    allowedCapacityOrigin("http://127.0.0.1:3012"),
    "http://127.0.0.1:3012",
  );
  assert.throws(() => allowedCapacityOrigin("https://example.com"));
  assert.throws(() =>
    allowedCapacityOrigin(
      "https://quipsly-capacity---studio-hm2odnvjga-uc.a.run.app",
    ),
  );
  assert.equal(
    allowedCapacityOrigin(
      "https://quipsly-capacity---studio-hm2odnvjga-uc.a.run.app",
      true,
    ),
    "https://quipsly-capacity---studio-hm2odnvjga-uc.a.run.app",
  );
  assert.throws(() =>
    allowedCapacityOrigin("https://attacker-example-uc.a.run.app", true),
  );
});

test("capacity percentiles are deterministic", () => {
  assert.equal(percentile([40, 10, 30, 20], 0.5), 20);
  assert.equal(percentile([40, 10, 30, 20], 0.95), 40);
});
