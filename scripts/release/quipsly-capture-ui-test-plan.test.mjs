import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  CRITICAL_TESTS,
  TEST_TARGET,
  buildFullShards,
  createPlan,
  discoverDeterministicTests,
  parseArguments,
} from "./quipsly-capture-ui-test-plan.mjs";

const SOURCE_URL = new URL(
  "../../apps/mobile-capture/HighGroundCapture/HighGroundCaptureUITests/CaptureExperienceUITests.swift",
  import.meta.url,
);

test("discovers only shipping deterministic test classes", () => {
  const fixture = `
final class CaptureExperienceUITests: XCTestCase {
    func testOne() {}
}
final class CaptureAppStoreScreenshotUITests: XCTestCase {
    func testScreenshot() {}
}
final class CaptureLoginExperienceUITests: XCTestCase {
    func testLogin() {}
}
final class ShareCaptureExtensionUITests: XCTestCase {
    func testShare() {}
}`;
  assert.deepEqual(discoverDeterministicTests(fixture), [
    "CaptureExperienceUITests/testOne",
    "CaptureLoginExperienceUITests/testLogin",
    "ShareCaptureExtensionUITests/testShare",
  ]);
});

test("accepts the conventional pnpm argument separator", () => {
  assert.deepEqual(
    parseArguments(["--", "--suite=full", "--shard=2", "--shards=4", "--format=lines"]),
    {
      suite: "full",
      shard: 2,
      shards: 4,
      format: "lines",
      source: new URL(
        "../../apps/mobile-capture/HighGroundCapture/HighGroundCaptureUITests/CaptureExperienceUITests.swift",
        import.meta.url,
      ).pathname,
    },
  );
});

test("full shards cover each current deterministic UI test exactly once", async () => {
  const tests = discoverDeterministicTests(await readFile(SOURCE_URL, "utf8"));
  const shards = buildFullShards(tests, 4);
  const flattened = shards.flatMap((shard) => shard.tests);

  assert.ok(tests.length > CRITICAL_TESTS.length);
  assert.equal(flattened.length, tests.length);
  assert.deepEqual([...new Set(flattened)].sort(), tests);
  assert.ok(Math.max(...shards.map((shard) => shard.estimatedWeight)) - Math.min(...shards.map((shard) => shard.estimatedWeight)) <= 1);
});

test("critical lane is explicit, valid, and much smaller than the complete suite", async () => {
  const tests = discoverDeterministicTests(await readFile(SOURCE_URL, "utf8"));
  const plan = createPlan(tests, { suite: "critical" });

  assert.equal(plan.selectedTestCount, CRITICAL_TESTS.length);
  assert.ok(plan.selectedTestCount >= 10);
  assert.ok(plan.selectedTestCount < tests.length / 3);
  assert.deepEqual(
    plan.selectors,
    CRITICAL_TESTS.map((entry) => `${TEST_TARGET}/${entry}`),
  );
});

test("each full plan identifies its shard and publishes target-qualified selectors", async () => {
  const tests = discoverDeterministicTests(await readFile(SOURCE_URL, "utf8"));
  const plans = Array.from({ length: 4 }, (_, index) => createPlan(tests, {
    suite: "full",
    shard: index + 1,
    shards: 4,
  }));

  assert.deepEqual(plans.map((plan) => plan.shard), [1, 2, 3, 4]);
  assert.equal(plans.reduce((sum, plan) => sum + plan.selectedTestCount, 0), tests.length);
  assert.ok(plans.every((plan) => plan.selectors.every((selector) => selector.startsWith(`${TEST_TARGET}/`))));
});
