import assert from "node:assert/strict";
import test from "node:test";

import { QUIPSLY_CAPTURE_RELEASE_TARGET } from "./quipsly-capture-release-target.mjs";

test("identifies one exact non-secret external TestFlight release", () => {
  assert.deepEqual(QUIPSLY_CAPTURE_RELEASE_TARGET, {
    appId: "6780995957",
    appName: "Quipsly Capture",
    bundleId: "com.highgroundodyssey.HighGroundCapture",
    marketingVersion: "1.0",
    buildNumber: "59",
    buildId: "eb9271bb-542c-4330-8596-3104022fbd8e",
    sourceRevision: "5ae9c74d898ee4672855b737c36d15b74b65de00",
    externalGroupName: "Quipsly Capture Rehearsal",
    distributionMode: "public-link-only",
    publicLink: "https://testflight.apple.com/join/XwRRcYUm",
  });
});
