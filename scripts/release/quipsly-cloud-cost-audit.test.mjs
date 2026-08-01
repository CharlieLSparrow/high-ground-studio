import assert from "node:assert/strict";
import test from "node:test";

import { summarizeQuipslyCloudCost } from "./quipsly-cloud-cost-audit-core.mjs";

const digest = (character) => `sha256:${character.repeat(64)}`;

test("attributes repeated committed-source builds and protects traffic digests", () => {
  const receipt = summarizeQuipslyCloudCost({
    auditedAt: "2026-08-01T18:00:00.000Z",
    windowStartedAt: "2026-07-02T18:00:00.000Z",
    projectId: "high-ground-odyssey",
    region: "us-central1",
    repository: "high-ground-studio",
    serviceName: "studio",
    builds: [
      build(
        "SUCCESS",
        "E2_HIGHCPU_32",
        "2026-08-01T17:00:00.000Z",
        "2026-08-01T17:10:00.000Z",
        "a".repeat(40),
      ),
      build(
        "FAILURE",
        "E2_HIGHCPU_32",
        "2026-08-01T16:00:00.000Z",
        "2026-08-01T16:05:00.000Z",
        "a".repeat(40),
      ),
      build(
        "SUCCESS",
        "E2_HIGHCPU_8",
        "2026-08-01T15:00:00.000Z",
        "2026-08-01T15:20:00.000Z",
        "b".repeat(40),
      ),
    ],
    images: [
      {
        package: "studio",
        version: digest("1"),
        tags: ["source-a"],
        updateTime: "2026-08-01T17:10:00.000Z",
        imageSizeBytes: "1000",
      },
      {
        package: "studio",
        version: digest("2"),
        tags: [],
        updateTime: "2026-06-01T17:10:00.000Z",
        imageSizeBytes: "2000",
      },
    ],
    service: {
      status: { traffic: [{ revisionName: "studio-001", percent: 100 }] },
      spec: {
        template: {
          metadata: {
            annotations: { "autoscaling.knative.dev/minScale": "0" },
          },
        },
      },
    },
    revisions: [
      {
        metadata: { name: "studio-001" },
        status: { imageDigest: digest("1") },
      },
    ],
    cleanupPolicies: [],
  });

  assert.equal(receipt.builds.buildCount, 3);
  assert.equal(receipt.builds.repeatedCommittedSourceBuildCount, 1);
  assert.equal(receipt.builds.estimatedComputeUsd, 1.248);
  assert.equal(receipt.artifacts.olderThan30DaysCount, 1);
  assert.equal(receipt.artifacts.trafficServingProtectedVersionCount, 1);
  assert.equal(receipt.cloudRun.minimumInstanceCount, 0);
  assert.equal(receipt.cloudRun.trafficServingDigestCount, 1);
  assert.deepEqual(
    receipt.recommendations.map((entry) => entry.code),
    [
      "reuse-exact-source-image",
      "benchmark-smaller-build-worker",
      "dry-run-artifact-cleanup",
    ],
  );
  assert.equal(receipt.boundaries.artifactDeletionPerformed, false);
});

test("blocks cleanup recommendations from implying safety without a live digest", () => {
  const receipt = summarizeQuipslyCloudCost({
    auditedAt: "2026-08-01T18:00:00.000Z",
    windowStartedAt: "2026-07-02T18:00:00.000Z",
    projectId: "high-ground-odyssey",
    region: "us-central1",
    repository: "high-ground-studio",
    serviceName: "studio",
    builds: [],
    images: [],
    service: {},
    revisions: [],
    cleanupPolicies: [],
  });
  assert.equal(receipt.recommendations.at(-1).code, "live-digest-unresolved");
  assert.equal(receipt.recommendations.at(-1).priority, "blocker");
});

function build(status, machineType, startTime, finishTime, source) {
  return {
    status,
    startTime,
    finishTime,
    options: { machineType },
    substitutions: { _QUIPSLY_BUILD_ID: source },
  };
}
