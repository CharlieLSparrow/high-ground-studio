import assert from "node:assert/strict";
import test from "node:test";

import { QUIPSLY_CAPTURE_RELEASE_TARGET } from "./quipsly-capture-release-target.mjs";

test("identifies one exact non-secret external TestFlight release", () => {
  assert.deepEqual(QUIPSLY_CAPTURE_RELEASE_TARGET, {
    appId: "6780995957",
    appName: "Quipsly Capture",
    bundleId: "com.highgroundodyssey.HighGroundCapture",
    marketingVersion: "1.0",
    buildNumber: "28",
    buildId: "ed68117d-5604-45c3-b9f7-239e7cd2af4f",
    sourceRevision: "ab1b167a39749909797177e1304bd9283c558484",
    externalGroupName: "Quipsly Capture Rehearsal",
    distributionMode: "public-link-only",
    publicLink: "https://testflight.apple.com/join/XwRRcYUm",
  });
});
