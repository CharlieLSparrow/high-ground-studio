import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  EPISODE_MASTER_4K_H264_PROFILE,
  EPISODE_PROGRAM_REVIEW_PROFILE,
  buildEpisodeMasterConformTargetLocator,
  buildEpisodeProgramRenderTargetLocator,
  episodeMasterConformManifestCanonicalJson,
  episodeProgramRenderManifestCanonicalJson,
  newEpisodeMasterConformJob,
  newEpisodeProgramRenderJob,
  parseEpisodeMasterConformJob,
  parseEpisodeMasterConformResult,
  type EpisodeMasterConformJob,
  type EpisodeMasterConformResult,
} from "@high-ground/quipsly-media-processing";

import {
  runOneLocalEpisodeMasterConformJob,
  type LocalEpisodeMasterConformClaim,
  type LocalEpisodeMasterConformStore,
} from "./local-episode-master-conform-worker.js";

const authority = {
  portability: "executor-local" as const,
  custodianNodeId: "execution_worker_master_test",
  storageScopeId: "storage_scope_master_test",
};

function program(sourcePath: string, sourceSha256: string, sourceSizeBytes: number) {
  const base = {
    jobId: "program_render_master_input",
    projectId: "project_master_test",
    episodeProductionId: "episode_master_test",
    branchId: "branch_master_test",
    branchRevision: 4,
    requestedByEmail: "editor@example.com",
    clientRequestId: "program_request_master_test",
    queuedAt: "2026-08-08T12:00:00.000Z",
    timelineFingerprintSha256: "a".repeat(64),
    sourceProjectionFingerprintSha256: "b".repeat(64),
    editStateFingerprintSha256: "c".repeat(64),
    manifestSha256: "0".repeat(64),
    renderProfile: EPISODE_PROGRAM_REVIEW_PROFILE,
    executionTarget: authority,
    program: { sequenceDurationSeconds: 1, outputDurationSeconds: 1, skippedDurationSeconds: 0, chunkCount: 1 },
    sources: [{
      ...authority,
      laneId: "lane_master_test",
      mediaAssetId: "media_asset_master_test",
      sourceId: "source_master_test",
      recordingAssetId: "recording_master_test",
      label: "Original 4K camera",
      kind: "video" as const,
      role: "primary" as const,
      provider: "local" as const,
      locator: sourcePath,
      generation: `sha256:${sourceSha256}`,
      sha256: sourceSha256,
      sizeBytes: sourceSizeBytes,
      contentType: "video/mp4",
      sequenceOffsetSeconds: 0,
      sourceStartSeconds: 0,
      sourceDurationSeconds: 1,
    }],
    chunks: [{ id: "program_chunk_master_0001", outputStartSeconds: 0, sequenceStartSeconds: 0, sequenceEndSeconds: 1, decisionId: "decision_master_0001", decisionKind: "primary", visualLaneIds: ["lane_master_test"], clipLaneId: null, audioLaneIds: ["lane_master_test"] }],
    target: {
      provider: "local" as const,
      ...authority,
      locator: buildEpisodeProgramRenderTargetLocator({ episodeProductionId: "episode_master_test", branchId: "branch_master_test", branchRevision: 4, jobId: "program_render_master_input" }),
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
  return newEpisodeProgramRenderJob({ ...base, manifestSha256: createHash("sha256").update(episodeProgramRenderManifestCanonicalJson(placeholder)).digest("hex") });
}

function master(sourcePath = "/tmp/quipsly-master-test/original.mp4", sourceSha256 = "d".repeat(64), sourceSizeBytes = 100) {
  const approvedProgram = program(sourcePath, sourceSha256, sourceSizeBytes);
  const base = {
    jobId: "master_conform_job_test",
    projectId: approvedProgram.projectId,
    episodeProductionId: approvedProgram.episodeProductionId,
    requestedByEmail: "editor@example.com",
    clientRequestId: "master_request_test",
    queuedAt: "2026-08-08T13:00:00.000Z",
    manifestSha256: "0".repeat(64),
    renderProfile: EPISODE_MASTER_4K_H264_PROFILE,
    approval: {
      receiptId: "program_approval_receipt_test",
      reviewJobId: approvedProgram.jobId,
      approvedByEmail: "reviewer@example.com",
      approvedAt: "2026-08-08T12:30:00.000Z",
      branchId: approvedProgram.branchId,
      branchRevision: approvedProgram.branchRevision,
      timelineFingerprintSha256: approvedProgram.timelineFingerprintSha256,
      sourceProjectionFingerprintSha256: approvedProgram.sourceProjectionFingerprintSha256,
      editStateFingerprintSha256: approvedProgram.editStateFingerprintSha256,
      reviewManifestSha256: approvedProgram.manifestSha256,
      reviewedOutputSha256: "e".repeat(64),
      reviewedOutputGeneration: `sha256:${"e".repeat(64)}`,
      reviewedOutputSizeBytes: 50,
    },
    approvedProgram,
    executionTarget: authority,
    target: {
      provider: "local" as const,
      ...authority,
      locator: buildEpisodeMasterConformTargetLocator({ episodeProductionId: approvedProgram.episodeProductionId, branchId: approvedProgram.branchId, branchRevision: approvedProgram.branchRevision, jobId: "master_conform_job_test" }),
      contentType: "video/mp4" as const,
      container: "mp4" as const,
      videoCodec: "h264" as const,
      audioCodec: "aac" as const,
      width: 3840 as const,
      height: 2160 as const,
      fps: 24 as const,
      sampleRateHz: 48_000 as const,
      videoCrf: 17 as const,
      videoPreset: "medium" as const,
      audioBitrate: "320k" as const,
      variantKind: "episode-master-candidate" as const,
    },
  };
  const placeholder = newEpisodeMasterConformJob(base);
  return newEpisodeMasterConformJob({ ...base, manifestSha256: createHash("sha256").update(episodeMasterConformManifestCanonicalJson(placeholder)).digest("hex") });
}

test("master manifest binds the approval, exact original program, executor, and 4K profile", () => {
  const value = master();
  assert.equal(parseEpisodeMasterConformJob(value).approval.reviewManifestSha256, value.approvedProgram.manifestSha256);
  assert.equal(value.target.width, 3840);
  assert.equal(value.boundaries.reviewCandidateIsNotMasterInput, true);
  assert.throws(() => parseEpisodeMasterConformJob({ ...value, approval: { ...value.approval, branchRevision: 5 } }), /approval/);
});

test("master result rejects a review-sized output", () => {
  const expected = master();
  assert.throws(() => parseEpisodeMasterConformResult({
    kind: "quipsly-episode-master-conform-result-v1",
    version: 1,
    jobId: expected.jobId,
    completedAt: "2026-08-08T13:05:00.000Z",
    manifestSha256: expected.manifestSha256,
    approvalReceiptId: expected.approval.receiptId,
    output: { provider: "local", ...authority, locator: expected.target.locator, generation: `sha256:${"f".repeat(64)}`, sha256: "f".repeat(64), sizeBytes: 10, contentType: "video/mp4", durationSeconds: 1, width: 1280, height: 720, fps: 24, videoCodec: "h264", audioCodec: "aac", completeDecode: true, fastStart: true, variantKind: "episode-master-candidate" },
    worker: { ...authority, executionId: "master_execution_test", buildId: "build_test", imageDigest: null, attempt: 1, ffmpegVersion: "ffmpeg", renderedChunkCount: 1 },
    boundaries: expected.boundaries,
  }, expected), /approval-bound manifest/);
});

class Store implements LocalEpisodeMasterConformStore {
  completed: EpisodeMasterConformResult[] = [];
  failed: Array<{ code: string }> = [];
  constructor(readonly claimValue: LocalEpisodeMasterConformClaim) {}
  async claim() { return this.claimValue; }
  async renew() { return true; }
  async complete(input: { receipt: EpisodeMasterConformResult }) { this.completed.push(input.receipt); return true; }
  async retry() { return true; }
  async fail(input: { code: string }) { this.failed.push(input); return true; }
}

test("local master worker hashes originals before and after rendering and commits a 4K receipt", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "quipsly-master-contract-"));
  try {
    const sourcePath = path.join(root, "original.mp4");
    const sourceBytes = Buffer.from("immutable-original-video");
    await writeFile(sourcePath, sourceBytes);
    const sourceSha = createHash("sha256").update(sourceBytes).digest("hex");
    const job = master(sourcePath, sourceSha, sourceBytes.byteLength);
    const store = new Store({ id: job.jobId, inputJson: job, attempt: 1, executionId: "master_execution_test" });
    const result = await runOneLocalEpisodeMasterConformJob(store, {
      async render(_job, outputPath, afterChunk) {
        assert.equal(_job.approvedProgram.sources[0]?.locator, sourcePath);
        await writeFile(outputPath, Buffer.from("four-k-master-candidate"));
        await afterChunk(1);
        return { durationSeconds: 1, width: 3840, height: 2160, fps: 24, videoCodec: "h264", audioCodec: "aac", completeDecode: true, fastStart: true, ffmpegVersion: "ffmpeg test", renderedChunkCount: 1 };
      },
    }, { executionId: "master_execution_test", ...authority, buildId: "build_test", imageDigest: null, leaseMs: 60_000, localMediaRoot: root, now: () => new Date("2026-08-08T13:05:00.000Z") });
    assert.equal(result.disposition, "completed");
    assert.equal(store.completed[0]?.output.width, 3840);
    assert.equal(store.completed[0]?.approvalReceiptId, job.approval.receiptId);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
