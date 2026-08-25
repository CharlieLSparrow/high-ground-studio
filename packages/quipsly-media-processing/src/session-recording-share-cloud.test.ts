import assert from "node:assert/strict";
import test from "node:test";

import {
  assertSessionRecordingShareCloudResult,
  claimSessionRecordingShareCloudManifest,
  completeSessionRecordingShareCloudManifest,
  newSessionRecordingShareCloudManifest,
  newSessionRecordingShareJob,
  newSessionRecordingShareResult,
  parseSessionRecordingShareCloudManifest,
  releaseSessionRecordingShareCloudLease,
} from "./index.js";

const bucket = "quipsly-private-media";
const job = newSessionRecordingShareJob({
  jobId: "session_share_12345678",
  roomId: "room_12345678",
  outputId: "output_12345678",
  outputRevision: 1,
  requestedAt: "2026-08-25T02:00:00.000Z",
  sourceSetSha256: "a".repeat(64),
  edit: {
    startSeconds: 0,
    endSeconds: 10,
    keptRanges: [{ id: "range_12345678", startSeconds: 0, endSeconds: 10 }],
    transcriptExclusions: [],
    joinCrossfadeSeconds: 0,
  },
  sources: [
    {
      recordingAssetId: "recording_12345678",
      participantId: "participant_12345678",
      participantLabel: "Coach",
      provider: "gcs",
      bucketName: bucket,
      objectName: "media-vault/recordings/room/source.m4a",
      locator: `gcs://${bucket}/media-vault/recordings/room/source.m4a?generation=101`,
      generation: "101",
      sha256: "b".repeat(64),
      sizeBytes: 1_000,
      contentType: "audio/mp4",
      programOffsetSeconds: 0,
    },
  ],
  target: {
    provider: "gcs",
    bucketName: bucket,
    objectName:
      "media-vault/derived/session-recording-share/room_12345678/session_share_12345678.m4a",
    locator:
      "media-vault/derived/session-recording-share/room_12345678/session_share_12345678.m4a",
    contentType: "audio/mp4",
    codec: "aac-lc",
    sampleRateHz: 48_000,
    channels: 2,
  },
});

function result(generation = "202") {
  return newSessionRecordingShareResult({
    jobId: job.jobId,
    roomId: job.roomId,
    outputId: job.outputId,
    outputRevision: 1,
    sourceSetSha256: job.sourceSetSha256,
    edit: job.edit,
    sourceRecordingAssetIds: [job.sources[0]!.recordingAssetId],
    output: {
      ...job.target,
      locator: `gcs://${bucket}/${job.target.objectName}?generation=${generation}`,
      generation,
      sha256: "c".repeat(64),
      sizeBytes: 20_000,
      durationSeconds: 10,
      completeDecode: true,
    },
    worker: {
      executionId: "execution_12345678",
      buildId: "build-1",
      imageDigest: null,
      ffmpegVersion: "ffmpeg 8",
    },
    completedAt: "2026-08-25T02:01:00.000Z",
  });
}

test("cloud manifest binds a generation-pinned source and private output", () => {
  const queued = newSessionRecordingShareCloudManifest(job);
  const processing = claimSessionRecordingShareCloudManifest({
    manifest: queued,
    leaseId: "lease",
    executionId: "worker",
    now: new Date("2026-08-25T02:00:10.000Z"),
    leaseDurationMs: 60_000,
  })!;
  const canonical = assertSessionRecordingShareCloudResult(result(), job);
  const completed = completeSessionRecordingShareCloudManifest({
    manifest: processing,
    leaseId: "lease",
    result: canonical,
    now: new Date("2026-08-25T02:01:00.000Z"),
  });
  assert.equal(completed.status, "completed");
  assert.equal(canonical.output.generation, "202");
});

test("cloud result refuses a locator that is not bound to its output generation", () => {
  const mismatched = {
    ...result(),
    output: {
      ...result().output,
      locator: `gcs://${bucket}/${job.target.objectName}?generation=999`,
    },
  };
  assert.throws(() => assertSessionRecordingShareCloudResult(mismatched, job));
});

test("cloud manifest retains its attempt count after a transient lease release", () => {
  const queued = newSessionRecordingShareCloudManifest(job);
  const first = claimSessionRecordingShareCloudManifest({
    manifest: queued,
    leaseId: "lease-one",
    executionId: "worker-one",
    now: new Date("2026-08-25T02:00:10.000Z"),
    leaseDurationMs: 60_000,
  })!;
  const released = releaseSessionRecordingShareCloudLease({
    manifest: first,
    leaseId: "lease-one",
    now: new Date("2026-08-25T02:00:20.000Z"),
  });
  const second = claimSessionRecordingShareCloudManifest({
    manifest: released,
    leaseId: "lease-two",
    executionId: "worker-two",
    now: new Date("2026-08-25T02:00:30.000Z"),
    leaseDurationMs: 60_000,
  })!;

  assert.equal(first.attemptCount, 1);
  assert.equal(released.attemptCount, 1);
  assert.equal(second.attemptCount, 2);
  assert.equal(second.lease?.attempt, 2);
});

test("cloud manifest upgrades queued manifests written before durable attempt counts", () => {
  const current = newSessionRecordingShareCloudManifest(job);
  const { attemptCount: _attemptCount, ...legacy } = current;

  assert.equal(
    parseSessionRecordingShareCloudManifest(legacy, job.jobId).attemptCount,
    0,
  );
});
