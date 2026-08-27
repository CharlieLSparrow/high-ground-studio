import assert from "node:assert/strict";
import test from "node:test";

import {
  parseArguments,
  summarizeCloudRunSourceReadiness,
} from "./quipsly-cloud-run-source-readiness.mjs";

const options = parseArguments([]);
const expectedSourceSha = "a".repeat(40);

function fixture(sourceSha = expectedSourceSha) {
  return {
    options,
    expectedSourceSha,
    serviceDocument: {
      status: { traffic: [{ revisionName: "studio-00042", percent: 100 }] },
    },
    revisionDocument: {
      metadata: { name: "studio-00042" },
      spec: { containers: [{ env: [
        { name: "QUIPSLY_SOURCE_SHA", value: sourceSha },
        { name: "QUIPSLY_RELEASE_CHANNEL", value: "preview" },
      ] }] },
    },
    auditedAt: "2026-08-27T17:00:00.000Z",
  };
}

test("exact promoted source is live", () => {
  const receipt = summarizeCloudRunSourceReadiness(fixture());
  assert.equal(receipt.ok, true);
  assert.equal(receipt.liveRevision, "studio-00042");
  assert.equal(receipt.externalMutation, false);
});

test("working public routes cannot hide stale live source", () => {
  const receipt = summarizeCloudRunSourceReadiness(fixture("b".repeat(40)));
  assert.equal(receipt.ok, false);
  assert.equal(receipt.checks.sourceIdentity, false);
  assert.equal(receipt.deployedSourceSha, "b".repeat(40));
});

test("split traffic is not exact release proof", () => {
  const current = fixture();
  current.serviceDocument.status.traffic = [
    { revisionName: "studio-00041", percent: 50 },
    { revisionName: "studio-00042", percent: 50 },
  ];
  current.revisionDocument = null;
  const receipt = summarizeCloudRunSourceReadiness(current);
  assert.equal(receipt.ok, false);
  assert.equal(receipt.checks.singleLiveRevision, false);
});
