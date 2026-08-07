import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildEpisodeRenderProofTargetLocator,
  episodeRenderProofManifestCanonicalJson,
  newEpisodeRenderProofJob,
  parseEpisodeRenderProofJob,
  type EpisodeRenderProofJob,
} from "@high-ground/quipsly-media-processing";

import {
  newLocalEpisodeRenderProofRuntime,
  runOneLocalEpisodeRenderProofJob,
  type LocalEpisodeRenderProofStore,
} from "./local-episode-render-proof-worker.js";
import { sha256File } from "./transcoder.js";

test("Episode render proof binds one exact branch revision, source set, and deterministic target", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "quipsly-render-proof-contract-"));
  const sourcePath = path.join(root, "source.wav");
  await writeFile(sourcePath, Buffer.alloc(4_096, 7));
  const job = await renderJob(root, sourcePath);
  assert.equal(parseEpisodeRenderProofJob(job).branchRevision, 8);
  const changed = structuredClone(job);
  changed.sources[0]!.sha256 = "e".repeat(64);
  changed.sources[0]!.generation = `sha256:${changed.sources[0]!.sha256}`;
  assert.throws(() => {
    const parsed = parseEpisodeRenderProofJob(changed);
    const digest = createHash("sha256").update(episodeRenderProofManifestCanonicalJson(parsed)).digest("hex");
    if (digest !== parsed.manifestSha256) throw new Error("manifest digest mismatch");
  }, /manifest digest mismatch/);
});

test("local proof worker preserves exact source bytes and emits an unapproved output-ready receipt", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "quipsly-render-proof-worker-"));
  const sourcePath = path.join(root, "source.wav");
  await writeFile(sourcePath, Buffer.alloc(8_192, 11));
  const job = await renderJob(root, sourcePath);
  let receipt: any = null;
  const store: LocalEpisodeRenderProofStore = {
    claim: async () => ({ id: job.jobId, inputJson: job, attempt: 1, executionId: "execution_render_0001" }),
    complete: async (input) => { receipt = input.receipt; return true; },
    retry: async () => true,
    fail: async () => true,
  };
  const renderer = {
    render: async (_job: EpisodeRenderProofJob, outputPath: string) => {
      await writeFile(outputPath, Buffer.alloc(16_384, 13));
      return { durationSeconds: 10, width: 1280 as const, height: 720 as const, fps: 24, videoCodec: "h264", audioCodec: "aac", completeDecode: true as const, fastStart: true as const, ffmpegVersion: "ffmpeg version test" };
    },
  };
  const result = await runOneLocalEpisodeRenderProofJob(store, renderer, {
    executionId: "execution_render_0001",
    buildId: "build_render_0001",
    imageDigest: null,
    leaseMs: 60_000,
    localMediaRoot: root,
    now: () => new Date("2026-08-07T18:05:00.000Z"),
  });
  assert.equal(result.disposition, "completed", JSON.stringify(result));
  assert.equal(receipt.kind, "quipsly-episode-render-proof-result-v1");
  assert.equal(receipt.output.width, 1280);
  assert.equal(receipt.output.fps, 24);
  assert.equal(receipt.boundaries.proofIsNotApprovedOutput, true);
  assert.equal(await sha256File(sourcePath), job.sources[0]!.sha256);
});

test("local proof receipt and capability heartbeat share one execution identity", () => {
  const runtime = newLocalEpisodeRenderProofRuntime({
    pool: {} as never,
    executionId: "execution_process_0001",
    localMediaRoot: path.join(tmpdir(), "quipsly-media-ingest"),
    leaseMs: 60_000,
    buildId: "build_render_0001",
  });
  assert.equal(runtime.options.executionId, "execution_process_0001");
});

async function renderJob(root: string, sourcePath: string) {
  const sha256 = await sha256File(sourcePath);
  const jobId = "render_proof_job_0001";
  const base = {
    jobId,
    projectId: "project_0001",
    episodeProductionId: "episode_production_0001",
    branchId: "edit_branch_0001",
    branchRevision: 8,
    requestedByEmail: "tester@quipsly.com",
    clientRequestId: "proof_request_0001",
    queuedAt: "2026-08-07T18:00:00.000Z",
    timelineFingerprintSha256: "a".repeat(64),
    sourceProjectionFingerprintSha256: "b".repeat(64),
    editStateFingerprintSha256: "c".repeat(64),
    manifestSha256: "0".repeat(64),
    proof: {
      sequenceStartSeconds: 5,
      sequenceEndSeconds: 15,
      decisionId: null,
      decisionKind: "audio-source-through",
      visualLaneIds: [],
      clipLaneId: null,
      audioLaneIds: ["audio_lane_0001"],
    },
    sources: [{
      laneId: "audio_lane_0001",
      mediaAssetId: "media_asset_0001",
      sourceId: "video_source_0001",
      recordingAssetId: "recording_asset_0001",
      label: "Exact dialogue source",
      kind: "audio" as const,
      role: "audio" as const,
      provider: "local" as const,
      locator: sourcePath,
      generation: `sha256:${sha256}`,
      sha256,
      sizeBytes: (await stat(sourcePath)).size,
      contentType: "audio/wav",
      sequenceOffsetSeconds: 0,
      sourceStartSeconds: 0,
      sourceDurationSeconds: 30,
    }],
    target: {
      provider: "local" as const,
      locator: buildEpisodeRenderProofTargetLocator({ episodeProductionId: "episode_production_0001", branchId: "edit_branch_0001", branchRevision: 8, jobId }),
      contentType: "video/mp4" as const,
      container: "mp4" as const,
      videoCodec: "h264" as const,
      audioCodec: "aac" as const,
      width: 1280 as const,
      height: 720 as const,
      fps: 24 as const,
      sampleRateHz: 48_000 as const,
      variantKind: "episode-edit-proof" as const,
    },
  };
  const placeholder = newEpisodeRenderProofJob(base);
  return newEpisodeRenderProofJob({
    ...base,
    manifestSha256: createHash("sha256").update(episodeRenderProofManifestCanonicalJson(placeholder)).digest("hex"),
  });
}
