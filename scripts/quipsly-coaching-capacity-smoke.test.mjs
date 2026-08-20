import assert from "node:assert/strict";
import test from "node:test";

import {
  allowedCapacityOrigin,
  boundedVirtualCoachCount,
  percentile,
} from "./quipsly-coaching-capacity-smoke.mjs";

test("capacity smoke keeps the default and upper bound explicit", () => {
  assert.equal(boundedVirtualCoachCount(undefined), 50);
  assert.equal(boundedVirtualCoachCount("100"), 100);
  assert.throws(() => boundedVirtualCoachCount("0"));
  assert.throws(() => boundedVirtualCoachCount("101"));
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
});

test("capacity percentiles are deterministic", () => {
  assert.equal(percentile([40, 10, 30, 20], 0.5), 20);
  assert.equal(percentile([40, 10, 30, 20], 0.95), 40);
});
