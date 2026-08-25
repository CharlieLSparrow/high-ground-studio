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
    edit: {
      startSeconds: 2.25,
      endSeconds: 42.5,
      keptRanges: [
        { id: "kept_range_0001", startSeconds: 2.25, endSeconds: 20 },
        { id: "kept_range_0002", startSeconds: 24, endSeconds: 42.5 },
      ],
      transcriptExclusions: [{
        transcriptJobId: "transcript_job_0001",
        segmentId: "transcript_segment_0001",
        sourceRecordingAssetId: "recording_asset_0001",
        providerTextSha256: "d".repeat(64),
        timingFingerprint: "e".repeat(64),
        timingBasis: "provider-words",
        cutSafety: "safe",
        startSeconds: 20,
        endSeconds: 24,
      }],
      joinCrossfadeSeconds: 0.01,
    },
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
  assert.equal(value.kind, "quipsly-session-recording-share-job-v3");
  assert.equal(value.edit.keptRanges.length, 2);
  assert.equal(value.edit.transcriptExclusions[0]?.segmentId, "transcript_segment_0001");
  assert.equal(value.edit.transcriptExclusions[0]?.timingFingerprint, "e".repeat(64));
  assert.equal(value.edit.transcriptExclusions[0]?.timingBasis, "provider-words");
  assert.equal(value.sources[0]?.recordingAssetId, "recording_asset_0001");
  assert.equal(value.sources[0]?.programOffsetSeconds, 0.125);
  assert.equal(value.target.mediaKind, "audio");
  assert.deepEqual(
    { contentType: value.target.contentType, codec: value.target.mediaKind === "audio" ? value.target.codec : null, sampleRateHz: value.target.sampleRateHz, channels: value.target.channels },
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
      edit: { ...value.edit, startSeconds: 9, endSeconds: 8 },
    }), /edit range is invalid/i);
});

test("Session recording share contract binds a video output to one selected exact camera", () => {
  const audio = job();
  const video = newSessionRecordingShareJob({
    ...audio,
    jobId: "session_share_video_0001",
    outputId: "session_output_video_0001",
    sources: [
      { ...audio.sources[0]!, recordingAssetId: "recording_video_0001", contentType: "video/mp4", includeInAudioMix: false },
      { ...audio.sources[0]!, recordingAssetId: "recording_audio_0001", includeInAudioMix: true },
    ],
    target: {
      provider: "local",
      bucketName: "local-media",
      objectName: "session-exports/session_room_0001/session_share_video_0001.mp4",
      locator: "/tmp/quipsly/session_share_video_0001.mp4",
      mediaKind: "video",
      contentType: "video/mp4",
      videoCodec: "h264",
      audioCodec: "aac-lc",
      widthPixels: 1920,
      heightPixels: 1080,
      frameRate: 24,
      sampleRateHz: 48_000,
      channels: 2,
      primaryVideoRecordingAssetId: "recording_video_0001",
    },
  });
  assert.equal(video.target.mediaKind, "video");
  assert.equal(video.sources.filter((source) => source.includeInAudioMix).length, 1);
  assert.throws(() => parseSessionRecordingShareJob({
    ...video,
    target: { ...video.target, primaryVideoRecordingAssetId: "recording_audio_0001" },
  }), /primary video/i);
});

test("Session recording share contract rejects overlapping edits and stale transcript hashes", () => {
  const value = job();
  assert.throws(() => parseSessionRecordingShareJob({
    ...value,
    edit: {
      ...value.edit,
      keptRanges: [
        { id: "kept_range_0001", startSeconds: 2.25, endSeconds: 20 },
        { id: "kept_range_0002", startSeconds: 19, endSeconds: 42.5 },
      ],
    },
  }), /overlaps/i);
  assert.throws(() => parseSessionRecordingShareJob({
    ...value,
    edit: {
      ...value.edit,
      transcriptExclusions: [{ ...value.edit.transcriptExclusions[0], providerTextSha256: "not-current" }],
    },
  }), /SHA-256/i);
  assert.throws(() => parseSessionRecordingShareJob({
    ...value,
    edit: {
      ...value.edit,
      transcriptExclusions: [{ ...value.edit.transcriptExclusions[0], cutSafety: "overlapping-speech" }],
    },
  }), /not safe to render/i);
});

test("Session recording share parser upgrades queued v1 jobs without changing their trim", () => {
  const value = job();
  const upgraded = parseSessionRecordingShareJob({
    ...value,
    kind: "quipsly-session-recording-share-job-v1",
    version: 1,
    edit: { startSeconds: 2.25, endSeconds: 42.5 },
  });
  assert.equal(upgraded.kind, "quipsly-session-recording-share-job-v3");
  assert.deepEqual(upgraded.edit.keptRanges, [{ id: "legacy_full_range", startSeconds: 2.25, endSeconds: 42.5 }]);
  assert.equal(upgraded.edit.joinCrossfadeSeconds, 0);
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
    output: { ...value.target, generation: "2", sha256: "c".repeat(64), sizeBytes: 80_000, durationSeconds: 36.24, completeDecode: true },
    worker: { executionId: "execution_0001", buildId: "test", imageDigest: null, ffmpegVersion: "ffmpeg test" },
    completedAt: "2026-08-19T23:46:00.000Z",
  });
  assert.equal(parseSessionRecordingShareResult(result).boundaries.outputRemainsPrivateUntilRelease, true);
  assert.throws(() => parseSessionRecordingShareResult({ ...result, output: { ...result.output, completeDecode: false } }), /result is invalid/i);
});

test("Session recording share video result binds its primary camera to an exact source", () => {
  const audio = job();
  const video = newSessionRecordingShareJob({
    ...audio,
    jobId: "session_share_video_result_0001",
    outputId: "session_output_video_result_0001",
    sources: [
      { ...audio.sources[0]!, recordingAssetId: "recording_video_result_0001", contentType: "video/mp4", includeInAudioMix: false },
      { ...audio.sources[0]!, recordingAssetId: "recording_audio_result_0001", includeInAudioMix: true },
    ],
    target: {
      provider: "local",
      bucketName: "local-media",
      objectName: "session-exports/session_room_0001/session_share_video_result_0001.mp4",
      locator: "/tmp/quipsly/session_share_video_result_0001.mp4",
      mediaKind: "video",
      contentType: "video/mp4",
      videoCodec: "h264",
      audioCodec: "aac-lc",
      widthPixels: 1920,
      heightPixels: 1080,
      frameRate: 24,
      sampleRateHz: 48_000,
      channels: 2,
      primaryVideoRecordingAssetId: "recording_video_result_0001",
    },
  });
  const result = newSessionRecordingShareResult({
    jobId: video.jobId,
    roomId: video.roomId,
    outputId: video.outputId,
    outputRevision: video.outputRevision,
    sourceSetSha256: video.sourceSetSha256,
    edit: video.edit,
    sourceRecordingAssetIds: video.sources.map((source) => source.recordingAssetId),
    output: { ...video.target, generation: "3", sha256: "f".repeat(64), sizeBytes: 180_000, durationSeconds: 36.24, completeDecode: true },
    worker: { executionId: "execution_video_0001", buildId: "test", imageDigest: null, ffmpegVersion: "ffmpeg test" },
    completedAt: "2026-08-19T23:47:00.000Z",
  });

  assert.equal(parseSessionRecordingShareResult(result).output.mediaKind, "video");
  assert.throws(() => parseSessionRecordingShareResult({
    ...result,
    sourceRecordingAssetIds: ["recording_audio_result_0001"],
  }), /primary video must be one of its exact sources/i);
});
