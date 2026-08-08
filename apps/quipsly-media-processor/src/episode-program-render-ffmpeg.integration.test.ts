import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import {
  newEpisodeProgramRenderJob,
} from "@high-ground/quipsly-media-processing";

import { FfmpegEpisodeProgramRenderer } from "./episode-program-render-ffmpeg.js";
import { FfmpegEpisodeRenderProofRenderer } from "./episode-render-proof-ffmpeg.js";

const run = promisify(execFile);
const sha = "a".repeat(64);
const authority = {
  portability: "executor-local" as const,
  custodianNodeId: "execution_worker_ffmpeg_test",
  storageScopeId: "storage_scope_ffmpeg_test",
};

test("real FFmpeg renders noncontiguous Episode ranges onto one contiguous review clock", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "quipsly-program-ffmpeg-"));
  try {
    const sourcePath = path.join(root, "source.mp4");
    const outputPath = path.join(root, "program.mp4");
    await run("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=24:duration=3",
      "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=3",
      "-shortest", "-c:v", "libx264", "-preset", "ultrafast",
      "-pix_fmt", "yuv420p", "-c:a", "aac", sourcePath,
    ], { timeout: 120_000 });
    const job = newEpisodeProgramRenderJob({
      jobId: "episode_program_ffmpeg_test",
      projectId: "project_ffmpeg_test",
      episodeProductionId: "episode_ffmpeg_test",
      branchId: "branch_ffmpeg_test",
      branchRevision: 2,
      requestedByEmail: "tester@quipsly.test",
      clientRequestId: "request_ffmpeg_test",
      queuedAt: "2026-08-08T12:00:00.000Z",
      timelineFingerprintSha256: sha,
      sourceProjectionFingerprintSha256: sha,
      editStateFingerprintSha256: sha,
      manifestSha256: sha,
      renderProfile: "episode-program-review-1280x720-24fps-v1",
      executionTarget: authority,
      program: {
        sequenceDurationSeconds: 3,
        outputDurationSeconds: 2,
        skippedDurationSeconds: 1,
        chunkCount: 2,
      },
      sources: [{
        ...authority,
        laneId: "camera_lane_ffmpeg_test",
        mediaAssetId: "media_asset_ffmpeg_test",
        sourceId: "source_ffmpeg_test",
        recordingAssetId: null,
        label: "Synthetic camera and microphone",
        kind: "video",
        role: "primary",
        provider: "local",
        locator: sourcePath,
        generation: `sha256:${sha}`,
        sha256: sha,
        sizeBytes: 1,
        contentType: "video/mp4",
        sequenceOffsetSeconds: 0,
        sourceStartSeconds: 0,
        sourceDurationSeconds: 3,
      }],
      chunks: [{
        id: "program_chunk_ffmpeg_0001",
        outputStartSeconds: 0,
        sequenceStartSeconds: 0,
        sequenceEndSeconds: 1,
        decisionId: "decision_ffmpeg_0001",
        decisionKind: "primary",
        visualLaneIds: ["camera_lane_ffmpeg_test"],
        clipLaneId: null,
        audioLaneIds: ["camera_lane_ffmpeg_test"],
      }, {
        id: "program_chunk_ffmpeg_0002",
        outputStartSeconds: 1,
        sequenceStartSeconds: 2,
        sequenceEndSeconds: 3,
        decisionId: "decision_ffmpeg_0002",
        decisionKind: "primary",
        visualLaneIds: ["camera_lane_ffmpeg_test"],
        clipLaneId: null,
        audioLaneIds: ["camera_lane_ffmpeg_test"],
      }],
      target: {
        provider: "local",
        ...authority,
        locator: "media-vault/episode-program-renders/episode_ffmpeg_test/branch_ffmpeg_test/revision-2/episode_program_ffmpeg_test.mp4",
        contentType: "video/mp4",
        container: "mp4",
        videoCodec: "h264",
        audioCodec: "aac",
        width: 1280,
        height: 720,
        fps: 24,
        sampleRateHz: 48_000,
        variantKind: "episode-program-review",
      },
    });

    const progress: number[] = [];
    const result = await new FfmpegEpisodeProgramRenderer().render(
      job,
      outputPath,
      async (count) => { progress.push(count); },
    );

    assert.deepEqual(progress, [1, 2]);
    assert.equal(result.width, 1280);
    assert.equal(result.height, 720);
    assert.equal(result.renderedChunkCount, 2);
    assert.equal(result.completeDecode, true);
    assert.ok(Math.abs(result.durationSeconds - 2) <= 0.25);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("real FFmpeg applies the production 4K profile to an original-source composition", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "quipsly-master-ffmpeg-"));
  try {
    const sourcePath = path.join(root, "source.mp4");
    const outputPath = path.join(root, "master.mp4");
    await run("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=24:duration=0.25",
      "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=0.25",
      "-shortest", "-c:v", "libx264", "-preset", "ultrafast",
      "-pix_fmt", "yuv420p", "-c:a", "aac", sourcePath,
    ], { timeout: 120_000 });
    const profile = {
      width: 3840,
      height: 2160,
      fps: 24,
      videoPreset: "medium" as const,
      videoCrf: 17,
      audioBitrate: "320k" as const,
      audioSampleRateHz: 48_000 as const,
    };
    const renderer = new FfmpegEpisodeProgramRenderer(
      new FfmpegEpisodeRenderProofRenderer("ffmpeg", "ffprobe", profile),
      "ffmpeg",
      "ffprobe",
      profile,
    );
    const result = await renderer.render({
      program: { sequenceDurationSeconds: 0.25, outputDurationSeconds: 0.25, skippedDurationSeconds: 0, chunkCount: 1 },
      sources: [{
        ...authority,
        laneId: "camera_lane_master_ffmpeg",
        mediaAssetId: "media_asset_master_ffmpeg",
        sourceId: "source_master_ffmpeg",
        recordingAssetId: null,
        label: "Synthetic original",
        kind: "video",
        role: "primary",
        provider: "local",
        locator: sourcePath,
        generation: `sha256:${sha}`,
        sha256: sha,
        sizeBytes: 1,
        contentType: "video/mp4",
        sequenceOffsetSeconds: 0,
        sourceStartSeconds: 0,
        sourceDurationSeconds: 0.25,
      }],
      chunks: [{
        id: "master_chunk_ffmpeg_0001",
        outputStartSeconds: 0,
        sequenceStartSeconds: 0,
        sequenceEndSeconds: 0.25,
        decisionId: "master_decision_ffmpeg_0001",
        decisionKind: "primary",
        visualLaneIds: ["camera_lane_master_ffmpeg"],
        clipLaneId: null,
        audioLaneIds: ["camera_lane_master_ffmpeg"],
      }],
    }, outputPath);
    assert.equal(result.width, 3840);
    assert.equal(result.height, 2160);
    assert.equal(result.fps, 24);
    assert.equal(result.completeDecode, true);
    assert.equal(result.renderedChunkCount, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
