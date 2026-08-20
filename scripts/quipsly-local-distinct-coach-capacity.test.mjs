import assert from "node:assert/strict";
import test from "node:test";

import {
  boundedDistinctCoachCount,
  loopbackOrigin,
} from "./quipsly-local-distinct-coach-capacity.mjs";

test("distinct coach capacity has an explicit staged ceiling", () => {
  assert.equal(boundedDistinctCoachCount(undefined), 2);
  assert.equal(boundedDistinctCoachCount("10"), 10);
  assert.equal(boundedDistinctCoachCount("50"), 50);
  assert.throws(() => boundedDistinctCoachCount("0"));
  assert.throws(() => boundedDistinctCoachCount("51"));
});

test("distinct coach capacity cannot target production", () => {
  assert.equal(loopbackOrigin("127.0.0.1:3012", "test"), "http://127.0.0.1:3012");
  assert.throws(() => loopbackOrigin("https://nest.quipsly.com", "test"));
  assert.throws(() => loopbackOrigin("http://example.com", "test"));
});
