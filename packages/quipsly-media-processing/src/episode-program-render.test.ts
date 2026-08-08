import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  EPISODE_PROGRAM_REVIEW_PROFILE,
  buildEpisodeProgramRenderTargetLocator,
  episodeProgramRenderManifestCanonicalJson,
  newEpisodeProgramRenderJob,
  newEpisodeProgramRenderResult,
  parseEpisodeProgramRenderJob,
  parseEpisodeProgramRenderResult,
  type EpisodeProgramRenderJob,
} from "./episode-program-render.js";

const authority = {
  portability: "executor-local" as const,
  custodianNodeId: "execution_worker_program_test",
  storageScopeId: "storage_scope_program_test",
};

function job(): EpisodeProgramRenderJob {
  const base = {
    jobId: "program_render_job_test",
    projectId: "project_test",
    episodeProductionId: "episode_production_test",
    branchId: "branch_test",
    branchRevision: 8,
    requestedByEmail: "editor@example.com",
    clientRequestId: "program_request_test",
    queuedAt: "2026-08-08T12:00:00.000Z",
    timelineFingerprintSha256: "a".repeat(64),
    sourceProjectionFingerprintSha256: "b".repeat(64),
    editStateFingerprintSha256: "c".repeat(64),
    manifestSha256: "0".repeat(64),
    renderProfile: EPISODE_PROGRAM_REVIEW_PROFILE,
    executionTarget: authority,
    program: {
      sequenceDurationSeconds: 60,
      outputDurationSeconds: 50,
      skippedDurationSeconds: 10,
      chunkCount: 2,
    },
    sources: [{
      ...authority,
      laneId: "lane_charlie_test",
      mediaAssetId: "media_asset_charlie_test",
      sourceId: "source_charlie_test",
      recordingAssetId: "recording_charlie_test",
      label: "Charlie camera",
      kind: "video" as const,
      role: "primary" as const,
      provider: "local" as const,
      locator: "/tmp/quipsly-media/source-charlie.mp4",
      generation: `sha256:${"d".repeat(64)}`,
      sha256: "d".repeat(64),
      sizeBytes: 10_000,
      contentType: "video/mp4",
      sequenceOffsetSeconds: 0,
      sourceStartSeconds: 0,
      sourceDurationSeconds: 60,
    }],
    chunks: [{
      id: "program_chunk_0001",
      outputStartSeconds: 0,
      sequenceStartSeconds: 0,
      sequenceEndSeconds: 30,
      decisionId: "decision_charlie_0001",
      decisionKind: "primary",
      visualLaneIds: ["lane_charlie_test"],
      clipLaneId: null,
      audioLaneIds: ["lane_charlie_test"],
    }, {
      id: "program_chunk_0002",
      outputStartSeconds: 30,
      sequenceStartSeconds: 40,
      sequenceEndSeconds: 60,
      decisionId: "decision_charlie_0002",
      decisionKind: "primary",
      visualLaneIds: ["lane_charlie_test"],
      clipLaneId: null,
      audioLaneIds: ["lane_charlie_test"],
    }],
    target: {
      provider: "local" as const,
      ...authority,
      locator: buildEpisodeProgramRenderTargetLocator({
        episodeProductionId: "episode_production_test",
        branchId: "branch_test",
        branchRevision: 8,
        jobId: "program_render_job_test",
      }),
      contentType: "video/mp4" as const,
      container: "mp4" as const,
      videoCodec: "h264" as const,
      audioCodec: "aac" as const,
      width: 1280 as const,
      height: 720 as const,
      fps: 24 as const,
      sampleRateHz: 48_000 as const,
      variantKind: "episode-program-review" as const,
    },
  };
  const placeholder = newEpisodeProgramRenderJob(base);
  return newEpisodeProgramRenderJob({
    ...base,
    manifestSha256: createHash("sha256")
      .update(episodeProgramRenderManifestCanonicalJson(placeholder))
      .digest("hex"),
  });
}

function result(expected = job()) {
  return newEpisodeProgramRenderResult({
    jobId: expected.jobId,
    completedAt: "2026-08-08T12:10:00.000Z",
    manifestSha256: expected.manifestSha256,
    output: {
      provider: "local",
      ...authority,
      locator: expected.target.locator,
      generation: `sha256:${"e".repeat(64)}`,
      sha256: "e".repeat(64),
      sizeBytes: 500_000,
      contentType: "video/mp4",
      durationSeconds: 50,
      width: 1280,
      height: 720,
      fps: 24,
      videoCodec: "h264",
      audioCodec: "aac",
      completeDecode: true,
      fastStart: true,
      variantKind: "episode-program-review",
    },
    worker: {
      ...authority,
      executionId: "program_execution_test",
      buildId: "program_worker_build_test",
      imageDigest: null,
      attempt: 1,
      ffmpegVersion: "ffmpeg test",
      renderedChunkCount: 2,
    },
  }, expected);
}

test("program render freezes ordered Episode chunks onto a compressed output clock", () => {
  const value = job();
  assert.equal(parseEpisodeProgramRenderJob(value).program.outputDurationSeconds, 50);
  assert.equal(value.program.skippedDurationSeconds, 10);
  assert.deepEqual(value.chunks.map((chunk) => chunk.outputStartSeconds), [0, 30]);
  assert.match(value.target.locator, /episode-program-renders/);
  assert.equal(
    createHash("sha256").update(episodeProgramRenderManifestCanonicalJson(value)).digest("hex"),
    value.manifestSha256,
  );
});

test("program render rejects a source owned by another executor", () => {
  const value = structuredClone(job());
  value.sources[0]!.custodianNodeId = "execution_worker_foreign_test";
  assert.throws(() => parseEpisodeProgramRenderJob(value), /selected executor/);
});

test("program render rejects output-clock gaps and source coverage gaps", () => {
  const outputGap = structuredClone(job());
  outputGap.chunks[1]!.outputStartSeconds = 31;
  assert.throws(() => parseEpisodeProgramRenderJob(outputGap), /contiguous/);

  const coverageGap = structuredClone(job());
  coverageGap.sources[0]!.sourceDurationSeconds = 50;
  assert.throws(() => parseEpisodeProgramRenderJob(coverageGap), /complete chunk/);
});

test("program render contract cannot claim approval or publication", () => {
  const value = structuredClone(job()) as unknown as Record<string, any>;
  value.boundaries.outputIsNotApprovedMaster = false;
  assert.throws(() => parseEpisodeProgramRenderJob(value), /contract/);
});

test("program result is exact-executor, duration, chunk-count, and manifest bound", () => {
  const expected = job();
  const receipt = result(expected);
  assert.equal(parseEpisodeProgramRenderResult(receipt, expected).output.durationSeconds, 50);

  const wrongDuration = structuredClone(receipt);
  wrongDuration.output.durationSeconds = 49;
  assert.throws(() => parseEpisodeProgramRenderResult(wrongDuration, expected), /conform manifest/);

  const wrongChunkCount = structuredClone(receipt);
  wrongChunkCount.worker.renderedChunkCount = 1;
  assert.throws(() => parseEpisodeProgramRenderResult(wrongChunkCount, expected), /conform manifest/);
});
