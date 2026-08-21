import assert from "node:assert/strict";
import test from "node:test";

import {
  parseArguments,
  summarizeDiagnostics,
} from "./quipsly-app-store-connect-diagnostics-readback.mjs";

test("diagnostics arguments preserve the exact requested build", () => {
  const options = parseArguments(["--version", "1.0", "--build", "32", "--output", "/tmp/readback.json"]);
  assert.equal(options.marketingVersion, "1.0");
  assert.equal(options.buildNumber, "32");
  assert.equal(options.outputPath, "/tmp/readback.json");
});

test("diagnostics summary binds crash feedback to the exact build and redacts private feedback", () => {
  const receipt = summarizeDiagnostics({
    auditedAt: "2026-08-21T00:00:00.000Z",
    options: { appId: "app-1", marketingVersion: "1.0", buildNumber: "32" },
    buildDocument: {
      data: [{
        id: "build-32",
        attributes: { version: "32", uploadedDate: "2026-08-20T00:00:00Z", processingState: "VALID" },
        relationships: { preReleaseVersion: { data: { id: "pre-1" } } },
      }],
      included: [{ id: "pre-1", type: "preReleaseVersions", attributes: { version: "1.0" } }],
    },
    crashDocument: {
      data: [{
        id: "old-crash",
        attributes: { createdDate: "2026-08-19T00:00:00Z", email: "must-not-appear@example.com", comment: "private" },
        relationships: { build: { data: { id: "build-30" } } },
      }],
      included: [{ id: "build-30", type: "builds", attributes: { version: "30" } }],
    },
    diagnosticDocument: { unavailable: true, body: { errors: [{ code: "NOT_FOUND" }] } },
  });

  assert.equal(receipt.passed, true);
  assert.equal(receipt.testerSubmittedCrashes.count, 0);
  assert.deepEqual(receipt.testerSubmittedCrashes.representedBuildNumbers, ["30"]);
  assert.equal(receipt.aggregateDiagnostics.available, false);
  assert.equal(receipt.redaction.testerEmailRequested, false);
  assert.doesNotMatch(JSON.stringify(receipt), /must-not-appear|private/);
});

test("diagnostics summary fails the release signal when the exact build has submitted crashes", () => {
  const receipt = summarizeDiagnostics({
    options: { appId: "app-1", marketingVersion: "1.0", buildNumber: "32" },
    buildDocument: {
      data: [{
        id: "build-32",
        attributes: { version: "32" },
        relationships: { preReleaseVersion: { data: { id: "pre-1" } } },
      }],
      included: [{ id: "pre-1", type: "preReleaseVersions", attributes: { version: "1.0" } }],
    },
    crashDocument: {
      data: [{
        id: "crash-32",
        attributes: { createdDate: "2026-08-21T00:00:00Z", deviceModel: "iPhone17,1", osVersion: "26.6" },
        relationships: { build: { data: { id: "build-32" } } },
      }],
      included: [{ id: "build-32", type: "builds", attributes: { version: "32" } }],
    },
    diagnosticDocument: {
      unavailable: false,
      body: { data: [{ id: "signature-1", attributes: { diagnosticType: "HANGS", signature: "main", weight: 0.7 } }] },
    },
  });

  assert.equal(receipt.passed, false);
  assert.equal(receipt.testerSubmittedCrashes.count, 1);
  assert.equal(receipt.aggregateDiagnostics.count, 1);
});
