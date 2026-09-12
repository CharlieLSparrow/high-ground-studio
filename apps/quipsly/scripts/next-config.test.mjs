import assert from "node:assert/strict";
import test from "node:test";
import config from "../next.config.mjs";
import { startupRoutes } from "../../mobile-capture/HighGroundCapture/scripts/warm-local-runtime.mjs";

test("development retains the native startup working set through serial compilation", () => {
  // Each cold route has a bounded 90-second warm-up. The first login route
  // must still be compiled when the app begins its one-minute sign-in check.
  assert.ok(config.onDemandEntries.maxInactiveAge >= startupRoutes.length * 90_000 + 60_000);
  assert.ok(config.onDemandEntries.pagesBufferLength >= startupRoutes.length);
  assert.ok(config.onDemandEntries.maxInactiveAge <= 45 * 60_000);
  assert.ok(config.onDemandEntries.pagesBufferLength <= 64);
  assert.equal(config.output, "standalone");
  assert.equal(config.typescript.ignoreBuildErrors, false);
});
