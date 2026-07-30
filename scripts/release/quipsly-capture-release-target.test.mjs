import assert from "node:assert/strict";
import test from "node:test";

import { QUIPSLY_CAPTURE_RELEASE_TARGET } from "./quipsly-capture-release-target.mjs";

test("identifies one exact non-secret external TestFlight release", () => {
  assert.deepEqual(QUIPSLY_CAPTURE_RELEASE_TARGET, {
    appId: "6780995957",
    appName: "Quipsly Capture",
    bundleId: "com.highgroundodyssey.HighGroundCapture",
    marketingVersion: "1.0",
    buildNumber: "13",
    buildId: "37410843-bb8c-4785-8127-137e25d29fb8",
    sourceRevision: "a554b8cbcc768b012fbfe5440eb83090ba178a61",
    externalGroupName: "Quipsly Capture Rehearsal",
    distributionMode: "public-link-only",
    publicLink: "https://testflight.apple.com/join/XwRRcYUm",
  });
});
