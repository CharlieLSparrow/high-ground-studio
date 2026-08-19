import assert from "node:assert/strict";
import test from "node:test";

import {
  newSessionRecordingShareJob,
  newSessionRecordingShareResult,
  parseSessionRecordingShareJob,
  parseSessionRecordingShareResult,
} from "./session-recording-share.js";

function job() {
  return newSessionRecordingShareJob({
    jobId: "share_job_0001",
    roomId: "session_room_0001",
    outputId: "session_output_0001",
    outputRevision: 1,
    requestedAt: "2026-08-19T23:45:00.000Z",
    sourceSetSha256: "a".repeat(64),
    edit: { startSeconds: 2.25, endSeconds: 42.5 },
    sources: [{
      recordingAssetId: "recording_asset_0001",
      participantId: "participant_0001",
      participantLabel: "Coach",
      provider: "local",
      bucketName: "quipsly-local-development-vault",
      objectName: "mobile/session/source.webm",
      locator: "/tmp/quipsly-media-ingest/capture-vault/objects/mobile/session/source.webm",
      generation: "1787180000000",
      sha256: "b".repeat(64),
      sizeBytes: 120_000,
      contentType: "audio/webm",
      programOffsetSeconds: 0.125,
    }],
    target: {
      provider: "local",
      bucketName: "quipsly-local-development-vault",
      objectName: "session-exports/session_room_0001/share_job_0001.m4a",
      locator: "/tmp/quipsly-media-ingest/capture-vault/objects/session-exports/session_room_0001/share_job_0001.m4a",
      contentType: "audio/mp4",
      codec: "aac-lc",
      sampleRateHz: 48_000,
      channels: 2,
    },
  });
}

test("Session recording share contract preserves exact source, edit, and target bindings", () => {
  const value = job();
  assert.equal(value.kind, "quipsly-session-recording-share-job-v1");
  assert.deepEqual(value.edit, { startSeconds: 2.25, endSeconds: 42.5 });
  assert.equal(value.sources[0]?.recordingAssetId, "recording_asset_0001");
  assert.equal(value.sources[0]?.programOffsetSeconds, 0.125);
  assert.deepEqual(
    { contentType: value.target.contentType, codec: value.target.codec, sampleRateHz: value.target.sampleRateHz, channels: value.target.channels },
    { contentType: "audio/mp4", codec: "aac-lc", sampleRateHz: 48_000, channels: 2 },
  );
});

test("Session recording share contract rejects duplicate sources and unsafe time ranges", () => {
  const value = job();
  assert.throws(() => parseSessionRecordingShareJob({
      ...value,
      sources: [value.sources[0], value.sources[0]],
    }), /sources must be unique/i);
  assert.throws(() => parseSessionRecordingShareJob({
      ...value,
      edit: { startSeconds: 9, endSeconds: 8 },
    }), /edit range is invalid/i);
});

test("Session recording share result parser requires complete-decode and privacy boundaries", () => {
  const value = job();
  const result = newSessionRecordingShareResult({
    jobId: value.jobId,
    roomId: value.roomId,
    outputId: value.outputId,
    outputRevision: value.outputRevision,
    sourceSetSha256: value.sourceSetSha256,
    edit: value.edit,
    sourceRecordingAssetIds: value.sources.map((source) => source.recordingAssetId),
    output: { ...value.target, generation: "2", sha256: "c".repeat(64), sizeBytes: 80_000, durationSeconds: 40.25, completeDecode: true },
    worker: { executionId: "execution_0001", buildId: "test", imageDigest: null, ffmpegVersion: "ffmpeg test" },
    completedAt: "2026-08-19T23:46:00.000Z",
  });
  assert.equal(parseSessionRecordingShareResult(result).boundaries.outputRemainsPrivateUntilRelease, true);
  assert.throws(() => parseSessionRecordingShareResult({ ...result, output: { ...result.output, completeDecode: false } }), /result is invalid/i);
});
