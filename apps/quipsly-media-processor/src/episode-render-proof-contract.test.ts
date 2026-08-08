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
  PostgresLocalEpisodeRenderProofStore,
  runOneLocalEpisodeRenderProofJob,
  type LocalEpisodeRenderProofStore,
} from "./local-episode-render-proof-worker.js";
import { sha256File } from "./transcoder.js";

const EXECUTION_TARGET = {
  portability: "executor-local" as const,
  custodianNodeId: "execution_worker_render_test",
  storageScopeId: "storage_scope_render_test",
};

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

test("section review profile accepts thirty seconds and rejects longer manifests", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "quipsly-section-review-contract-"));
  const sourcePath = path.join(root, "source.wav");
  await writeFile(sourcePath, Buffer.alloc(4_096, 9));
  const job = await renderJob(root, sourcePath, "section-review-30s");
  assert.equal(job.renderProfile, "section-review-30s");
  assert.equal(job.target.variantKind, "episode-section-review");
  assert.equal(job.proof.sequenceEndSeconds - job.proof.sequenceStartSeconds, 30);
  const tooLong = structuredClone(job);
  tooLong.proof.sequenceEndSeconds += 0.01;
  assert.throws(() => parseEpisodeRenderProofJob(tooLong), /contract or target authority is invalid/);
});

test("Episode proof rejects a source assigned to a different executor", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "quipsly-render-proof-authority-"));
  const sourcePath = path.join(root, "source.wav");
  await writeFile(sourcePath, Buffer.alloc(4_096, 10));
  const job = await renderJob(root, sourcePath);
  const changed = structuredClone(job);
  changed.sources[0]!.custodianNodeId = "execution_worker_other_test";
  assert.throws(
    () => parseEpisodeRenderProofJob(changed),
    /sources must belong to the selected executor/,
  );
});

test("local proof worker refuses a job addressed to another executor", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "quipsly-render-proof-wrong-worker-"));
  const sourcePath = path.join(root, "source.wav");
  await writeFile(sourcePath, Buffer.alloc(4_096, 12));
  const job = await renderJob(root, sourcePath);
  let failureCode = "";
  let renderCalled = false;
  const store: LocalEpisodeRenderProofStore = {
    claim: async () => ({ id: job.jobId, inputJson: job, attempt: 1, executionId: "execution_wrong_worker_0001" }),
    complete: async () => true,
    retry: async () => true,
    fail: async (input) => { failureCode = input.code; return true; },
  };
  const result = await runOneLocalEpisodeRenderProofJob(store, {
    render: async () => {
      renderCalled = true;
      throw new Error("renderer must not run");
    },
  }, {
    executionId: "execution_wrong_worker_0001",
    custodianNodeId: "execution_worker_other_test",
    storageScopeId: EXECUTION_TARGET.storageScopeId,
    buildId: "build_render_0001",
    imageDigest: null,
    leaseMs: 60_000,
    localMediaRoot: root,
    now: () => new Date("2026-08-07T18:05:00.000Z"),
  });
  assert.equal(result.disposition, "failed");
  assert.equal(failureCode, "episode-render-proof-manifest-invalid");
  assert.equal(renderCalled, false);
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
    custodianNodeId: EXECUTION_TARGET.custodianNodeId,
    storageScopeId: EXECUTION_TARGET.storageScopeId,
    buildId: "build_render_0001",
    imageDigest: null,
    leaseMs: 60_000,
    localMediaRoot: root,
    now: () => new Date("2026-08-07T18:05:00.000Z"),
  });
  assert.equal(result.disposition, "completed", JSON.stringify(result));
  assert.equal(receipt.kind, "quipsly-episode-render-proof-result-v2");
  assert.equal(receipt.output.width, 1280);
  assert.equal(receipt.output.fps, 24);
  assert.equal(receipt.boundaries.proofIsNotApprovedOutput, true);
  assert.equal(await sha256File(sourcePath), job.sources[0]!.sha256);
});

test("local worker receipt preserves the section review variant", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "quipsly-section-review-worker-"));
  const sourcePath = path.join(root, "source.wav");
  await writeFile(sourcePath, Buffer.alloc(8_192, 17));
  const job = await renderJob(root, sourcePath, "section-review-30s");
  let receipt: any = null;
  const store: LocalEpisodeRenderProofStore = {
    claim: async () => ({ id: job.jobId, inputJson: job, attempt: 1, executionId: "execution_section_0001" }),
    complete: async (input) => { receipt = input.receipt; return true; },
    retry: async () => true,
    fail: async () => true,
  };
  const result = await runOneLocalEpisodeRenderProofJob(store, {
    render: async (_job, outputPath) => {
      await writeFile(outputPath, Buffer.alloc(16_384, 19));
      return { durationSeconds: 30, width: 1280, height: 720, fps: 24, videoCodec: "h264", audioCodec: "aac", completeDecode: true, fastStart: true, ffmpegVersion: "ffmpeg version test" };
    },
  }, {
    executionId: "execution_section_0001",
    custodianNodeId: EXECUTION_TARGET.custodianNodeId,
    storageScopeId: EXECUTION_TARGET.storageScopeId,
    buildId: "build_section_0001",
    imageDigest: null,
    leaseMs: 60_000,
    localMediaRoot: root,
    now: () => new Date("2026-08-07T18:05:00.000Z"),
  });
  assert.equal(result.disposition, "completed", JSON.stringify(result));
  assert.equal(receipt.output.variantKind, "episode-section-review");
});

test("local proof receipt and capability heartbeat share one execution identity", () => {
  const runtime = newLocalEpisodeRenderProofRuntime({
    pool: {} as never,
    executionId: "execution_process_0001",
    custodianNodeId: EXECUTION_TARGET.custodianNodeId,
    storageScopeId: EXECUTION_TARGET.storageScopeId,
    localMediaRoot: path.join(tmpdir(), "quipsly-media-ingest"),
    leaseMs: 60_000,
    buildId: "build_render_0001",
  });
  assert.equal(runtime.options.executionId, "execution_process_0001");
});

test("Postgres claim selects only work owned by the current executor scope", async () => {
  const queries: Array<{ text: string; values?: unknown[] }> = [];
  const client = {
    query: async (query: string | { text: string; values?: unknown[] }) => {
      const normalized = typeof query === "string" ? { text: query } : query;
      queries.push(normalized);
      if (normalized.text.startsWith("SELECT")) return { rows: [] };
      return { rows: [], rowCount: 0 };
    },
    release: () => undefined,
  };
  const store = new PostgresLocalEpisodeRenderProofStore({
    connect: async () => client,
  } as never);
  const claim = await store.claim({
    executionId: "execution_claim_test_0001",
    custodianNodeId: EXECUTION_TARGET.custodianNodeId,
    storageScopeId: EXECUTION_TARGET.storageScopeId,
    leaseMs: 60_000,
    now: new Date("2026-08-07T18:05:00.000Z"),
  });
  assert.equal(claim, null);
  const select = queries.find((query) => query.text.startsWith("SELECT"));
  assert.ok(select);
  assert.match(select.text, /executionTarget'->>'custodianNodeId'=\$4/);
  assert.match(select.text, /executionTarget'->>'storageScopeId'=\$5/);
  assert.deepEqual(select.values?.slice(3), [
    EXECUTION_TARGET.custodianNodeId,
    EXECUTION_TARGET.storageScopeId,
  ]);
});

async function renderJob(root: string, sourcePath: string, renderProfile: "proof-10s" | "section-review-30s" = "proof-10s") {
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
    renderProfile,
    executionTarget: EXECUTION_TARGET,
    proof: {
      sequenceStartSeconds: 5,
      sequenceEndSeconds: renderProfile === "proof-10s" ? 15 : 35,
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
      ...EXECUTION_TARGET,
      locator: sourcePath,
      generation: `sha256:${sha256}`,
      sha256,
      sizeBytes: (await stat(sourcePath)).size,
      contentType: "audio/wav",
      sequenceOffsetSeconds: 0,
      sourceStartSeconds: 0,
      sourceDurationSeconds: renderProfile === "proof-10s" ? 30 : 40,
    }],
    target: {
      provider: "local" as const,
      ...EXECUTION_TARGET,
      locator: buildEpisodeRenderProofTargetLocator({ episodeProductionId: "episode_production_0001", branchId: "edit_branch_0001", branchRevision: 8, jobId }),
      contentType: "video/mp4" as const,
      container: "mp4" as const,
      videoCodec: "h264" as const,
      audioCodec: "aac" as const,
      width: 1280 as const,
      height: 720 as const,
      fps: 24 as const,
      sampleRateHz: 48_000 as const,
      variantKind: renderProfile === "proof-10s" ? "episode-edit-proof" as const : "episode-section-review" as const,
    },
  };
  const placeholder = newEpisodeRenderProofJob(base);
  return newEpisodeRenderProofJob({
    ...base,
    manifestSha256: createHash("sha256").update(episodeRenderProofManifestCanonicalJson(placeholder)).digest("hex"),
  });
}
