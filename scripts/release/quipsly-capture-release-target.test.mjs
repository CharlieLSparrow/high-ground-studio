import assert from "node:assert/strict";
import test from "node:test";

import { QUIPSLY_CAPTURE_RELEASE_TARGET } from "./quipsly-capture-release-target.mjs";

test("identifies one exact non-secret external TestFlight release", () => {
  assert.deepEqual(QUIPSLY_CAPTURE_RELEASE_TARGET, {
    appId: "6780995957",
    appName: "Quipsly Capture",
    bundleId: "com.highgroundodyssey.HighGroundCapture",
    marketingVersion: "1.0",
    buildNumber: "69",
    buildId: "d0754c77-011a-41a5-98a7-2df59531eb77",
    sourceRevision: "7f0c14663bfe21cc925028fcc797232e7228a970",
    externalGroupName: "Quipsly Capture Rehearsal",
    distributionMode: "public-link-only",
    publicLink: "https://testflight.apple.com/join/XwRRcYUm",
  });
});
