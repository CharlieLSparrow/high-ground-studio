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
