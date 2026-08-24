import assert from "node:assert/strict";
import test from "node:test";

import {
  SESSION_AUDIO_AUDITION_RESULT_KIND,
  buildSessionAudioAuditionManifestObjectName,
  buildSessionAudioAuditionTargetObjectName,
  claimSessionAudioAuditionManifest,
  completeSessionAudioAuditionManifest,
  newSessionAudioAuditionManifest,
  parseSessionAudioAuditionManifest,
  parseSessionAudioAuditionResult,
} from "./session-audio-audition.js";

const jobId = "session_audition_1234567890abcdef";
const base = () =>
  newSessionAudioAuditionManifest({
    jobId,
    roomId: "room-12345678",
    requestedByUserId: "user-12345678",
    requestedByEmail: "coach@example.com",
    source: {
      bucketName: "quipsly-media.example",
      objectName: "media-vault/recordings/coaching/camera.mp4",
      generation: "101",
      sizeBytes: 1_000_000,
      sha256: "a".repeat(64),
      contentType: "video/mp4",
      durationSeconds: 60,
      roomId: "room-12345678",
      recordingAssetId: "recording-12345678",
      finalizationUploadSessionId: "123e4567-e89b-12d3-a456-426614174000",
    },
    target: {
      bucketName: "quipsly-media.example",
      objectName: buildSessionAudioAuditionTargetObjectName({
        roomId: "room-12345678",
        recordingAssetId: "recording-12345678",
        jobId,
      }),
      contentType: "audio/mp4",
      profile: "transcript-audition-aac-lc-128k-v1",
    },
    queuedAt: "2026-08-25T01:00:00.000Z",
    updatedAt: "2026-08-25T01:00:00.000Z",
  });

test("contract completes only an exact-source-bound AAC result", () => {
  const manifest = base();
  const processing = claimSessionAudioAuditionManifest({
    manifest,
    leaseId: "lease-1",
    executionId: "worker-1",
    now: new Date("2026-08-25T01:01:00.000Z"),
    leaseDurationMs: 60_000,
  })!;
  const result = parseSessionAudioAuditionResult(
    {
      kind: SESSION_AUDIO_AUDITION_RESULT_KIND,
      version: 1,
      jobId,
      manifestObjectName: buildSessionAudioAuditionManifestObjectName(jobId),
      source: processing.source,
      output: {
        ...processing.target,
        generation: "202",
        sizeBytes: 200_000,
        sha256: "b".repeat(64),
        crc32c: "crc",
        metadata: {
          sourceDurationSeconds: 60,
          durationSeconds: 60,
          durationDeltaSeconds: 0,
          sourceAudioOrdinal: 0,
          audioCodec: "aac",
          sampleRateHz: 48_000,
          channelCount: 2,
          bitRate: 128_000,
          hasVideo: false,
          decodedToEnd: true,
        },
      },
      worker: {
        executionId: "worker-1",
        buildId: "build-1",
        imageDigest: null,
        attempt: 1,
      },
      completedAt: "2026-08-25T01:02:00.000Z",
      originalRemainsSourceTruth: true,
    },
    processing,
  );
  const completed = completeSessionAudioAuditionManifest({
    manifest: processing,
    leaseId: "lease-1",
    result,
    now: new Date("2026-08-25T01:02:00.000Z"),
  });
  assert.equal(completed.status, "completed");
  assert.equal(result.source.sha256, "a".repeat(64));
  assert.equal(result.output.hasOwnProperty("video"), false);
});

test("contract rejects a derivative that drifts to another source generation", () => {
  const manifest = base();
  assert.throws(() =>
    parseSessionAudioAuditionResult(
      {
        kind: SESSION_AUDIO_AUDITION_RESULT_KIND,
        version: 1,
        jobId,
        manifestObjectName: buildSessionAudioAuditionManifestObjectName(jobId),
        source: { ...manifest.source, generation: "102" },
        output: {
          ...manifest.target,
          generation: "202",
          sizeBytes: 200_000,
          sha256: "b".repeat(64),
          crc32c: "crc",
          metadata: {
            sourceDurationSeconds: 60,
            durationSeconds: 60,
            durationDeltaSeconds: 0,
            sourceAudioOrdinal: 0,
            audioCodec: "aac",
            sampleRateHz: 48_000,
            channelCount: 2,
            bitRate: 128_000,
            hasVideo: false,
            decodedToEnd: true,
          },
        },
        worker: {
          executionId: "worker-1",
          buildId: "build-1",
          imageDigest: null,
          attempt: 1,
        },
        completedAt: "2026-08-25T01:02:00.000Z",
        originalRemainsSourceTruth: true,
      },
      manifest,
    ),
  );
});

test("contract rejects an audition derivative with unsafe timeline drift", () => {
  const manifest = base();
  assert.throws(() =>
    parseSessionAudioAuditionResult(
      {
        kind: SESSION_AUDIO_AUDITION_RESULT_KIND,
        version: 1,
        jobId,
        manifestObjectName: buildSessionAudioAuditionManifestObjectName(jobId),
        source: manifest.source,
        output: {
          ...manifest.target,
          generation: "202",
          sizeBytes: 200_000,
          sha256: "b".repeat(64),
          crc32c: "crc",
          metadata: {
            sourceDurationSeconds: 60,
            durationSeconds: 59.5,
            durationDeltaSeconds: 0.5,
            sourceAudioOrdinal: 0,
            audioCodec: "aac",
            sampleRateHz: 48_000,
            channelCount: 2,
            bitRate: 128_000,
            hasVideo: false,
            decodedToEnd: true,
          },
        },
        worker: {
          executionId: "worker-1",
          buildId: "build-1",
          imageDigest: null,
          attempt: 1,
        },
        completedAt: "2026-08-25T01:02:00.000Z",
        originalRemainsSourceTruth: true,
      },
      manifest,
    ),
  );
});

test("contract rejects duration evidence from a different source clock", () => {
  const manifest = base();
  assert.throws(() =>
    parseSessionAudioAuditionResult(
      {
        kind: SESSION_AUDIO_AUDITION_RESULT_KIND,
        version: 1,
        jobId,
        manifestObjectName: buildSessionAudioAuditionManifestObjectName(jobId),
        source: manifest.source,
        output: {
          ...manifest.target,
          generation: "202",
          sizeBytes: 200_000,
          sha256: "b".repeat(64),
          crc32c: "crc",
          metadata: {
            sourceDurationSeconds: 61,
            durationSeconds: 61,
            durationDeltaSeconds: 0,
            sourceAudioOrdinal: 0,
            audioCodec: "aac",
            sampleRateHz: 48_000,
            channelCount: 2,
            bitRate: 128_000,
            hasVideo: false,
            decodedToEnd: true,
          },
        },
        worker: {
          executionId: "worker-1",
          buildId: "build-1",
          imageDigest: null,
          attempt: 1,
        },
        completedAt: "2026-08-25T01:02:00.000Z",
        originalRemainsSourceTruth: true,
      },
      manifest,
    ),
  );
});
