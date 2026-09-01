import assert from "node:assert/strict";
import test from "node:test";

import {
  inspectDeviceReadback,
  parseArguments,
  summarizeAttentionLedger,
  supportCategory,
} from "./quipsly-capture-device-diagnostics-readback.mjs";
import { QUIPSLY_CAPTURE_RELEASE_TARGET } from "./quipsly-capture-release-target.mjs";

function appsPayload({ version = "1.0", build = "59" } = {}) {
  return {
    result: {
      deviceIdentifier: "private-device-id",
      apps: [
        {
          bundleIdentifier: QUIPSLY_CAPTURE_RELEASE_TARGET.bundleId,
          bundleVersion: build,
          name: "Quipsly Capture",
          url: "file:///private/app/path/HighGroundCapture.app/",
          version,
        },
      ],
    },
  };
}

test("requires an explicit paired device and accepts the pnpm separator", () => {
  assert.deepEqual(parseArguments(["--", "--device", "Morbo"]), {
    device: "Morbo",
    outputPath: "",
    help: false,
  });
  assert.throws(() => parseArguments([]), /--device is required/);
});

test("matches the native privacy-safe attention categories", () => {
  assert.equal(
    supportCategory("No microphone route is available"),
    "microphone-or-audio-route",
  );
  assert.equal(
    supportCategory("The selected Session is offline"),
    "connection",
  );
  assert.equal(
    supportCategory("That Space is unavailable"),
    "session-or-workspace",
  );
  assert.equal(supportCategory("Recording could not start"), "recording");
});

test("summarizes the latest transition without retaining its message or identifiers", () => {
  const summary = summarizeAttentionLedger({
    schemaVersion: 1,
    events: [
      {
        occurredAt: "2026-08-31T23:00:00Z",
        message: "Recording could not start for private Session abc123",
        selectedSessionID: "abc123",
        selectedSessionIsLocal: false,
        canonicalSessionCount: 4,
        localDraftSessionCount: 1,
        isRefreshing: false,
        isCreatingSession: false,
        isChangingCapture: true,
        isChangingRoom: false,
      },
    ],
  });
  assert.deepEqual(summary, {
    schemaSupported: true,
    eventCount: 1,
    latestOccurredAt: "2026-08-31T23:00:00.000Z",
    latestCategory: "session-or-workspace",
    latestTransitionState: "changing-capture",
    latestSelectedSessionWasLocal: false,
    latestCanonicalSessionCount: 4,
    latestLocalDraftSessionCount: 1,
  });
  assert.doesNotMatch(
    JSON.stringify(summary),
    /abc123|Recording could not start/,
  );
});

test("proves the exact release while omitting devicectl paths and device identity", () => {
  const receipt = inspectDeviceReadback({
    appsPayload: appsPayload({
      version: QUIPSLY_CAPTURE_RELEASE_TARGET.marketingVersion,
      build: QUIPSLY_CAPTURE_RELEASE_TARGET.buildNumber,
    }),
    attentionLedger: { schemaVersion: 1, events: [] },
    checkedAt: new Date("2026-08-31T23:05:00Z"),
  });
  assert.equal(receipt.ok, true);
  assert.equal(receipt.checks.diagnosticLedgerReadable, true);
  assert.equal(receipt.diagnostics.eventCount, 0);
  assert.equal(receipt.rawAttentionMessageRetained, false);
  assert.doesNotMatch(
    JSON.stringify(receipt),
    /private-device-id|private\/app\/path/,
  );
});

test("reports an old installed build without inventing unavailable diagnostics", () => {
  const receipt = inspectDeviceReadback({
    appsPayload: appsPayload({ build: "58" }),
    checkedAt: new Date("2026-08-31T23:05:00Z"),
  });
  assert.equal(receipt.ok, false);
  assert.equal(receipt.installed.build, "58");
  assert.equal(receipt.checks.exactRelease, false);
  assert.equal(receipt.checks.diagnosticLedgerReadable, false);
  assert.equal(receipt.diagnostics.schemaSupported, null);
});

test("fails closed when Quipsly Capture is not installed", () => {
  assert.throws(
    () => inspectDeviceReadback({ appsPayload: { result: { apps: [] } } }),
    /not installed/,
  );
});
