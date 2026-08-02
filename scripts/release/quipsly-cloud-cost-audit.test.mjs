import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
      metadata: { name: "studio" },
      status: { traffic: [{ revisionName: "studio-001", percent: 100 }] },
      spec: {
        template: {
          metadata: {
            annotations: { "autoscaling.knative.dev/minScale": "0" },
          },
        },
      },
    },
    services: [
      {
        metadata: { name: "studio" },
        status: { traffic: [{ revisionName: "studio-001", percent: 100 }] },
        spec: {
          template: {
            metadata: {
              annotations: { "autoscaling.knative.dev/minScale": "0" },
            },
          },
        },
      },
      {
        metadata: { name: "studio-collab" },
        status: {
          latestReadyRevisionName: "studio-collab-001",
          traffic: [{ revisionName: "studio-collab-001", percent: 100 }],
        },
        spec: {
          template: {
            metadata: {
              annotations: { "autoscaling.knative.dev/minScale": "1" },
            },
          },
        },
      },
    ],
    revisions: [
      {
        metadata: { name: "studio-001" },
        status: { imageDigest: digest("1") },
      },
      {
        metadata: { name: "studio-collab-001" },
        status: { imageDigest: digest("2") },
      },
    ],
    cleanupPolicies: [],
  });

  assert.equal(receipt.builds.buildCount, 3);
  assert.equal(receipt.builds.repeatedCommittedSourceBuildCount, 1);
  assert.equal(receipt.builds.estimatedComputeUsd, 1.248);
  assert.equal(receipt.artifacts.olderThan30DaysCount, 1);
  assert.equal(receipt.artifacts.trafficServingProtectedVersionCount, 2);
  assert.equal(
    receipt.artifacts.trafficServingRetentionProtectedVersionCount,
    2,
  );
  assert.equal(receipt.cloudRun.minimumInstanceCount, 0);
  assert.equal(receipt.cloudRun.serviceCount, 2);
  assert.equal(receipt.cloudRun.totalMinimumInstanceCount, 1);
  assert.equal(receipt.cloudRun.alwaysWarmServiceCount, 1);
  assert.equal(receipt.cloudRun.trafficServingDigestCount, 2);
  assert.deepEqual(
    receipt.recommendations.map((entry) => entry.code),
    [
      "reuse-exact-source-image",
      "benchmark-smaller-build-worker",
      "dry-run-artifact-cleanup",
      "review-always-warm-cloud-run-services",
    ],
  );
  assert.equal(receipt.boundaries.artifactDeletionPerformed, false);
});

test("distinguishes a resolved traffic digest from one protected by retention", () => {
  const oldLiveDigest = digest("f");
  const images = Array.from({ length: 11 }, (_, index) => ({
    package: "studio",
    version: index === 10 ? oldLiveDigest : digest(String(index)),
    tags: [`source-${index}`],
    createTime: index === 10
      ? "2026-05-01T00:00:00.000Z"
      : `2026-07-${String(index + 10).padStart(2, "0")}T00:00:00.000Z`,
    imageSizeBytes: "1000",
  }));
  const receipt = summarizeQuipslyCloudCost({
    auditedAt: "2026-08-01T18:00:00.000Z",
    windowStartedAt: "2026-07-02T18:00:00.000Z",
    projectId: "high-ground-odyssey",
    region: "us-central1",
    repository: "high-ground-studio",
    serviceName: "studio",
    builds: [],
    images,
    service: {
      metadata: { name: "studio" },
      status: { traffic: [{ revisionName: "studio-old", percent: 100 }] },
    },
    services: [],
    revisions: [
      {
        metadata: { name: "studio-old" },
        status: { imageDigest: oldLiveDigest },
      },
    ],
    cleanupPolicies: [],
  });

  assert.equal(receipt.artifacts.trafficServingProtectedVersionCount, 1);
  assert.equal(
    receipt.artifacts.trafficServingRetentionProtectedVersionCount,
    0,
  );
  assert.equal(receipt.artifacts.retentionCandidateVersionCount, 1);
});

test("the collab deploy default cannot silently restore idle compute", () => {
  const deploySource = readFileSync(
    "scripts/studio-collab-cloud-run-deploy.mjs",
    "utf8",
  );
  assert.match(deploySource, /const DEFAULT_MIN_INSTANCES = "0";/);
  assert.match(deploySource, /"--min-instances",\s*minInstances/);
  assert.match(
    deploySource,
    /templateAnnotations\["autoscaling\.knative\.dev\/minScale"\] \|\| "0"/,
  );
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
