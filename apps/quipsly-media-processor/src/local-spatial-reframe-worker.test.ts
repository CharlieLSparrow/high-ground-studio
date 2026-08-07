import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { newSpatialRenderJob, spatialRecipeCanonicalJson, spatialRenderManifestCanonicalJson, type SpatialRenderJob, type SpatialRenderResult } from "@high-ground/quipsly-media-processing";

import { runOneLocalSpatialReframeJob, type LocalSpatialReframeClaim, type LocalSpatialReframeStore } from "./local-spatial-reframe-worker.js";

test("renders a reviewed master into a checksum-bound spatial proof without mutating source bytes", async () => {
  const fixture = await files();
  try {
    const job = await manifest(fixture);
    const store = new MemoryStore(job);
    const result = await runOneLocalSpatialReframeJob(store, { render: async (_job, stitchedInputPath, outputPath) => {
      assert.equal(path.basename(stitchedInputPath), "reviewed-master.mp4");
      await writeFile(outputPath, "flat-spatial-proof");
      return { durationSeconds: 0.3, width: 1280, height: 720, fps: 24, videoCodec: "h264", audioCodec: "aac", completeDecode: true, fastStart: true, ffmpegVersion: "ffmpeg 8.1.1", commandCount: 32 };
    } }, options(fixture));
    assert.equal(result.disposition, "completed", JSON.stringify({ result, failure: store.failure }));
    assert.equal(store.receipt?.stitch.adapter, "insta360-studio-reviewed-export");
    assert.equal(store.receipt?.reframe.recipeSha256, job.recipeSha256);
    assert.equal(store.receipt?.reframe.output.variantKind, "spatial-reframe-proof");
    assert.equal(await readFile(fixture.sourcePath, "utf8"), "exact-insv-original");
    assert.equal(await readFile(fixture.masterPath, "utf8"), "reviewed-5.7k-master");
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
});

test("fails closed and removes output when an exact source changes during rendering", async () => {
  const fixture = await files();
  try {
    const job = await manifest(fixture);
    const store = new MemoryStore(job);
    const result = await runOneLocalSpatialReframeJob(store, { render: async (_job, _stitchedInputPath, outputPath) => {
      await writeFile(outputPath, "flat-spatial-proof");
      await writeFile(fixture.sourcePath, "changed-insv-origin");
      return { durationSeconds: 0.3, width: 1280, height: 720, fps: 24, videoCodec: "h264", audioCodec: null, completeDecode: true, fastStart: true, ffmpegVersion: "ffmpeg 8.1.1", commandCount: 32 };
    } }, options(fixture));
    assert.deepEqual(result, { disposition: "failed", jobId: job.jobId, code: "spatial-reframe-source-drift" });
    assert.equal(store.failure?.code, "spatial-reframe-source-drift");
    await assert.rejects(stat(job.reframe.target.locator));
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
});

class MemoryStore implements LocalSpatialReframeStore {
  receipt: SpatialRenderResult | null = null;
  failure: { code: string; message: string } | null = null;
  constructor(private readonly job: SpatialRenderJob) {}
  async claim(input: { executionId: string }): Promise<LocalSpatialReframeClaim> { return { id: this.job.jobId, inputJson: this.job, attempt: 1, executionId: input.executionId }; }
  async complete(input: { receipt: SpatialRenderResult }) { this.receipt = input.receipt; return true; }
  async retry(input: { code: string; message: string }) { this.failure = input; return true; }
  async fail(input: { code: string; message: string }) { this.failure = input; return true; }
}

async function files() {
  const root = await mkdtemp(path.join(os.tmpdir(), "quipsly-spatial-worker-"));
  const sourcePath = path.join(root, "VID_take.insv");
  const masterPath = path.join(root, "reviewed-master.mp4");
  await writeFile(sourcePath, "exact-insv-original");
  await writeFile(masterPath, "reviewed-5.7k-master");
  return { root, sourcePath, masterPath };
}

async function manifest(fixture: Awaited<ReturnType<typeof files>>) {
  const source = await inspect(fixture.sourcePath);
  const master = await inspect(fixture.masterPath);
  const raw = {
    jobId: "spatialrender_test0001",
    projectId: "project_test0001",
    episodeProductionId: "episode_test0001",
    timelinePlacementId: "placement_test0001",
    timelineFingerprintSha256: "1".repeat(64),
    requestedByUserId: "user_test0001",
    requestedByEmail: "editor@quipsly.test",
    clientRequestId: "request_test0001",
    queuedAt: "2026-08-08T00:00:00.000Z",
    sourcePackage: { sourceSetId: "sourceset_test0001", sourceSetIdentitySha256: "2".repeat(64), sourceClockRevisionId: "revision_test0001", sourceContentSha256: "2".repeat(64), members: [{ sourceRevisionId: "revision_test0001", role: "primary-original" as const, fileName: "VID_take.insv", provider: "local" as const, locator: fixture.sourcePath, generation: `sha256:${source.sha256}`, sha256: source.sha256, sizeBytes: source.sizeBytes, contentType: "video/mp4", requiredForRender: true as const }] },
    selection: { sourceRangeId: "range_test0001", selectorSha256: "3".repeat(64), startSeconds: 0.05, endSeconds: 0.35 },
    recipe: { schema: "quipsly-360-reframe-v1" as const, projection: "equirectangular" as const, aspectRatio: "16:9" as const, stabilization: "flowstate" as const, horizonLock: true, keyframes: [{ sourceSeconds: 0.05, panDegrees: 0, tiltDegrees: 0, rollDegrees: 0, fieldOfViewDegrees: 80, interpolation: "ease" as const }, { sourceSeconds: 0.35, panDegrees: 20, tiltDegrees: 0, rollDegrees: 0, fieldOfViewDegrees: 70, interpolation: "ease" as const }] },
    recipeSha256: "0".repeat(64),
    stitch: { profile: "insta360-flowstate-equirectangular-master-v1" as const, adapter: "insta360-studio-reviewed-export" as const, minimumMajorVersion: 3 as const, scope: "complete-source" as const, stitchType: "ai-flow" as const, outputProjection: "equirectangular" as const, width: 5760 as const, height: 2880 as const, videoCodec: "h265" as const, target: { provider: "local" as const, locator: fixture.masterPath, contentType: "video/mp4" as const }, reviewedMaster: { derivativeId: "derivative_test0001", workflowJobId: "reviewjob_test0001", receiptSha256: "4".repeat(64), adapterVersion: "5.9.9", generation: `sha256:${master.sha256}`, sha256: master.sha256, sizeBytes: master.sizeBytes, durationSeconds: 0.416667, fps: 24, videoCodec: "hevc" } },
    reframe: { adapter: "ffmpeg-v360" as const, profile: "spatial-proof-720p24" as const, commandResolution: "output-frame" as const, target: { provider: "local" as const, locator: path.join(fixture.root, "output", "proof.mp4"), contentType: "video/mp4" as const } },
    manifestSha256: "0".repeat(64),
  };
  const recipeUnsealed = newSpatialRenderJob(raw);
  const recipeSealed = { ...raw, recipeSha256: digest(spatialRecipeCanonicalJson(recipeUnsealed)) };
  const unsealed = newSpatialRenderJob(recipeSealed);
  return newSpatialRenderJob({ ...recipeSealed, manifestSha256: digest(spatialRenderManifestCanonicalJson(unsealed)) });
}

function options(fixture: Awaited<ReturnType<typeof files>>) { return { executionId: "execution_test0001", buildId: "test-build", imageDigest: null, leaseMs: 60_000, outputRoot: fixture.root, authorizedSourceRoots: [fixture.root], now: () => new Date("2026-08-08T02:00:00.000Z") }; }
async function inspect(filePath: string) { const file = await stat(filePath); return { sizeBytes: file.size, sha256: createHash("sha256").update(await readFile(filePath)).digest("hex") }; }
function digest(value: string) { return createHash("sha256").update(value).digest("hex"); }
