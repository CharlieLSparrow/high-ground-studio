import assert from "node:assert/strict";
import test from "node:test";

import {
  buildInterruptionRepairManifestObjectName,
  buildInterruptionRepairTargetObjectName,
  claimInterruptionRepairManifest,
  completeInterruptionRepairManifest,
  newInterruptionRepairManifest,
  parseInterruptionRepairManifest,
  type InterruptionRepairResult,
} from "./interruption-repair.js";

const queuedAt = "2026-08-22T21:00:00.000Z";
const manifest = newInterruptionRepairManifest({
  jobId: "repair-job-12345678",
  projectId: "project-12345678",
  projectSlug: "coaching",
  actorUserId: "user-12345678",
  actorEmail: "coach@example.com",
  captureId: "capture-12345678",
  captureGroupId: "take-12345678",
  source: {
    bucketName: "quipsly-media.example",
    objectName: "media-vault/recordings/coaching/source.webm",
    generation: "1001",
    sizeBytes: 12345,
    sha256: "a".repeat(64),
    contentType: "audio/webm",
    recordingAssetId: "recording-12345678",
    uploadSessionId: "upload-12345678",
  },
  target: {
    bucketName: "quipsly-media.example",
    objectName: buildInterruptionRepairTargetObjectName({
      projectSlug: "coaching",
      recordingAssetId: "recording-12345678",
      jobId: "repair-job-12345678",
    }),
    contentType: "audio/webm",
    profile: "lossless-container-remux-v1",
  },
  queuedAt,
  updatedAt: queuedAt,
});

test("interruption repair contract binds immutable source and separate derivative", () => {
  assert.equal(manifest.originalRemainsSourceTruth, true);
  assert.equal(manifest.source.objectName, "media-vault/recordings/coaching/source.webm");
  assert.equal(manifest.target.objectName, "media-vault/repair/coaching/recording-12345678/repair-job-12345678.webm");
  assert.notEqual(manifest.source.objectName, manifest.target.objectName);
});

test("interruption repair manifest rejects a changed source generation", () => {
  assert.throws(() => parseInterruptionRepairManifest({
    ...manifest,
    source: { ...manifest.source, generation: "latest" },
  }), /invalid/i);
});

test("interruption repair completion requires an exact result and active lease", () => {
  const processing = claimInterruptionRepairManifest({
    manifest,
    leaseId: "lease-12345678",
    executionId: "worker-1",
    now: new Date("2026-08-22T21:01:00.000Z"),
    leaseDurationMs: 60_000,
  });
  assert.ok(processing);
  const result: InterruptionRepairResult = {
    kind: "quipsly-interruption-repair-result-v1",
    version: 1,
    jobId: manifest.jobId,
    manifestObjectName: buildInterruptionRepairManifestObjectName(manifest.jobId),
    source: manifest.source,
    output: {
      ...manifest.target,
      generation: "1002",
      sizeBytes: 12000,
      sha256: "b".repeat(64),
      crc32c: "crc32c-value",
      metadata: {
        durationSeconds: 4.02,
        streamCount: 1,
        hasAudio: true,
        hasVideo: false,
        audioCodec: "opus",
        videoCodec: null,
        decodedToEnd: true,
        packetPayloadReencoded: false,
      },
    },
    worker: {
      executionId: "worker-1",
      buildId: "build-1",
      imageDigest: null,
      attempt: 1,
    },
    completedAt: "2026-08-22T21:01:10.000Z",
    originalRemainsSourceTruth: true,
  };
  const completed = completeInterruptionRepairManifest({
    manifest: processing,
    leaseId: "lease-12345678",
    result,
    now: new Date(result.completedAt),
  });
  assert.equal(completed.status, "completed");
});

