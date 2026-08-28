import assert from "node:assert/strict";
import test from "node:test";

import { QUIPSLY_CAPTURE_RELEASE_TARGET } from "./quipsly-capture-release-target.mjs";

test("identifies one exact non-secret external TestFlight release", () => {
  assert.deepEqual(QUIPSLY_CAPTURE_RELEASE_TARGET, {
    appId: "6780995957",
    appName: "Quipsly Capture",
    bundleId: "com.highgroundodyssey.HighGroundCapture",
    marketingVersion: "1.0",
    buildNumber: "43",
    buildId: "7f7016c7-5bd8-49c1-9927-007d49871709",
    sourceRevision: "e9692026e01149acddf14eb4b388e1f7a6b5f75c",
    externalGroupName: "Quipsly Capture Rehearsal",
    distributionMode: "public-link-only",
    publicLink: "https://testflight.apple.com/join/XwRRcYUm",
  });
});
