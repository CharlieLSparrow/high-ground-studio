import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  evaluateSpatialExecutorReadiness,
  newReviewedSpatialStitchMasterReceipt,
  newSpatialRenderJob,
  newSpatialRenderResult,
  parseReviewedSpatialStitchMasterReceipt,
  parseSpatialRenderJob,
  reviewedSpatialStitchMasterCanonicalJson,
  spatialRecipeCanonicalJson,
  spatialRenderManifestCanonicalJson,
  type SpatialRenderJob,
} from "@high-ground/quipsly-media-processing";

const EXECUTION_TARGET = {
  portability: "executor-local" as const,
  custodianNodeId: "execution_worker_spatial_test",
  storageScopeId: "storage_scope_spatial_test",
};

function fixture(overrides: Partial<SpatialRenderJob> = {}) {
  const raw: Omit<SpatialRenderJob, "kind" | "version" | "boundaries"> = {
    jobId: "spatial-job-1",
    projectId: "project-1",
    episodeProductionId: "episode-1",
    timelinePlacementId: "placement-1",
    timelineFingerprintSha256: "1".repeat(64),
    requestedByUserId: "user-1",
    requestedByEmail: "editor@quipsly.test",
    clientRequestId: "request-1",
    queuedAt: "2026-08-08T00:00:00.000Z",
    executionTarget: EXECUTION_TARGET,
    sourcePackage: {
      sourceSetId: "source-set-1",
      sourceSetIdentitySha256: "2".repeat(64),
      sourceClockRevisionId: "revision-1",
      sourceContentSha256: "3".repeat(64),
      members: [{
        sourceRevisionId: "revision-1",
        role: "primary-original" as const,
        fileName: "VID_20250711_222639_00_037.insv",
        provider: "local" as const,
        ...EXECUTION_TARGET,
        locator: "/authorized/source.insv",
        generation: `sha256:${"3".repeat(64)}`,
        sha256: "3".repeat(64),
        sizeBytes: 21_549_387,
        contentType: "video/mp4",
        requiredForRender: true as const,
      }],
    },
    selection: { sourceRangeId: "range-1", selectorSha256: "4".repeat(64), startSeconds: 0.05, endSeconds: 0.35 },
    recipe: {
      schema: "quipsly-360-reframe-v1" as const,
      projection: "equirectangular" as const,
      aspectRatio: "16:9" as const,
      stabilization: "flowstate" as const,
      horizonLock: true,
      keyframes: [
        { sourceSeconds: 0.05, panDegrees: -25, tiltDegrees: 2, rollDegrees: 0, fieldOfViewDegrees: 88, interpolation: "ease" as const },
        { sourceSeconds: 0.35, panDegrees: 22, tiltDegrees: -3, rollDegrees: 1, fieldOfViewDegrees: 72, interpolation: "ease" as const },
      ],
    },
    recipeSha256: "5".repeat(64),
    stitch: {
      profile: "insta360-flowstate-equirectangular-master-v1" as const,
      adapter: "insta360-mediasdk" as const,
      minimumMajorVersion: 3 as const,
      scope: "complete-source" as const,
      stitchType: "ai-flow" as const,
      outputProjection: "equirectangular" as const,
      width: 5760 as const,
      height: 2880 as const,
      videoCodec: "h265" as const,
      target: { provider: "local" as const, ...EXECUTION_TARGET, locator: "spatial/intermediate/source-set-1.mp4", contentType: "video/mp4" as const },
      reviewedMaster: null,
    },
    reframe: {
      adapter: "ffmpeg-v360" as const,
      profile: "spatial-proof-720p24" as const,
      commandResolution: "output-frame" as const,
      target: { provider: "local" as const, ...EXECUTION_TARGET, locator: "spatial/output/spatial-job-1.mp4", contentType: "video/mp4" as const },
    },
    manifestSha256: "0".repeat(64),
    ...overrides,
  };
  const recipeUnsealed = newSpatialRenderJob(raw);
  const recipeSealed = { ...raw, recipeSha256: createHash("sha256").update(spatialRecipeCanonicalJson(recipeUnsealed)).digest("hex") };
  const unsealed = newSpatialRenderJob(recipeSealed);
  return newSpatialRenderJob({ ...recipeSealed, manifestSha256: createHash("sha256").update(spatialRenderManifestCanonicalJson(unsealed)).digest("hex") });
}

test("spatial render freezes the exact INSV package and reversible two-stage intent", () => {
  const job = fixture();
  assert.deepEqual(parseSpatialRenderJob(job), job);
  assert.equal(job.boundaries.browseProxyNeverAcceptedAsRenderSource, true);
  assert.equal(job.boundaries.officialStitchStageRequiredForRawInsv, true);
  assert.equal(job.boundaries.resultIsNotPublished, true);
  assert.equal(createHash("sha256").update(spatialRenderManifestCanonicalJson(job)).digest("hex"), job.manifestSha256);
  assert.match(createHash("sha256").update(spatialRecipeCanonicalJson(job)).digest("hex"), /^[0-9a-f]{64}$/);
});

test("spatial render refuses an LRV proxy or checksum-unbound source as final input", () => {
  const job = fixture();
  assert.throws(() => parseSpatialRenderJob({ ...job, sourcePackage: { ...job.sourcePackage, members: [{ ...job.sourcePackage.members[0]!, fileName: "LRV_20250711_222639_01_037.lrv" }] } }), /exactly one primary INSV/);
  assert.throws(() => parseSpatialRenderJob({ ...job, sourcePackage: { ...job.sourcePackage, members: [{ ...job.sourcePackage.members[0]!, generation: "1" }] } }), /generation must bind/);
});

test("executor-local spatial bytes cannot cross a Mac storage scope", () => {
  const job = fixture();
  assert.throws(
    () =>
      parseSpatialRenderJob({
        ...job,
        reframe: {
          ...job.reframe,
          target: {
            ...job.reframe.target,
            custodianNodeId: "execution_worker_other_test",
            storageScopeId: "storage_scope_other_test",
          },
        },
      }),
    /execution boundary is invalid/,
  );
});

test("reviewed Studio master jobs freeze the registered derivative receipt", () => {
  const base = fixture();
  const raw = {
    ...base,
    stitch: {
      ...base.stitch,
      adapter: "insta360-studio-reviewed-export" as const,
      target: { provider: "local" as const, ...EXECUTION_TARGET, locator: "/authorized/reviewed-master.mp4", contentType: "video/mp4" as const },
      reviewedMaster: { derivativeId: "derivative-1", workflowJobId: "review-job-1", receiptSha256: "6".repeat(64), adapterVersion: "5.9.9", generation: `sha256:${"7".repeat(64)}`, sha256: "7".repeat(64), sizeBytes: 30_000_000, durationSeconds: 10, fps: 24, videoCodec: "hevc" },
    },
    manifestSha256: "0".repeat(64),
  };
  const unsealed = newSpatialRenderJob(raw);
  const reviewed = newSpatialRenderJob({ ...raw, manifestSha256: createHash("sha256").update(spatialRenderManifestCanonicalJson(unsealed)).digest("hex") });
  assert.equal(reviewed.stitch.reviewedMaster?.receiptSha256, "6".repeat(64));
  assert.throws(() => parseSpatialRenderJob({ ...reviewed, stitch: { ...reviewed.stitch, reviewedMaster: { ...reviewed.stitch.reviewedMaster, generation: "sha256:bad" } } }), /generation/);
});

test("spatial result is bound to the frozen recipe, reviewed master, and output profile", () => {
  const job = fixture();
  const stitchSha = "8".repeat(64);
  const outputSha = "9".repeat(64);
  const result = newSpatialRenderResult({
    jobId: job.jobId,
    completedAt: "2026-08-08T02:00:00.000Z",
    manifestSha256: job.manifestSha256,
    stitch: { profile: "insta360-flowstate-equirectangular-master-v1", adapter: "insta360-mediasdk", adapterVersion: "3.1.0", sourceSetIdentitySha256: job.sourcePackage.sourceSetIdentitySha256, output: { provider: "local", ...EXECUTION_TARGET, locator: job.stitch.target.locator, contentType: "video/mp4", generation: `sha256:${stitchSha}`, sha256: stitchSha, sizeBytes: 30_000_000, durationSeconds: 10, completeDecode: true, width: 5760, height: 2880, fps: 24, videoCodec: "hevc", projection: "equirectangular" } },
    reframe: { adapter: "ffmpeg-v360", ffmpegVersion: "ffmpeg 8.1.1", recipeSha256: job.recipeSha256, output: { provider: "local", ...EXECUTION_TARGET, locator: job.reframe.target.locator, contentType: "video/mp4", generation: `sha256:${outputSha}`, sha256: outputSha, sizeBytes: 2_000_000, durationSeconds: 0.3, completeDecode: true, width: 1280, height: 720, fps: 24, videoCodec: "h264", variantKind: "spatial-reframe-proof" } },
    worker: { ...EXECUTION_TARGET, executionId: "execution-1", buildId: "test-build", imageDigest: null, attempt: 1 },
  }, job);
  assert.equal(result.reframe.recipeSha256, job.recipeSha256);
  assert.throws(() => newSpatialRenderResult({ ...result, reframe: { ...result.reframe, recipeSha256: "a".repeat(64) } }, job), /frozen job contract/);
  assert.throws(
    () =>
      newSpatialRenderResult(
        {
          ...result,
          worker: {
            ...result.worker,
            custodianNodeId: "execution_worker_other_test",
            storageScopeId: "storage_scope_other_test",
          },
        },
        job,
      ),
    /frozen job contract/,
  );
});

test("the current Mac is a truthful manual stitch handoff, not an automatic executor", () => {
  const readiness = evaluateSpatialExecutorReadiness({
    platform: "darwin",
    architecture: "arm64",
    insta360Studio: { available: true, version: "5.9.9" },
    mediaSdk: { available: false, version: null, licenseConfigured: false, modelsConfigured: false },
    ffmpeg: { available: true, version: "8.1.1", v360Available: true, runtimeViewCommands: true },
  });
  assert.equal(readiness.status, "manual-stitch-handoff");
  assert.equal(readiness.automaticStitchReady, false);
  assert.equal(readiness.automaticReframeReady, true);
  assert.equal(readiness.manualStudioHandoffReady, true);
});

test("an approved Linux x64 MediaSDK runner is ready only with every engine boundary", () => {
  const readiness = evaluateSpatialExecutorReadiness({
    platform: "linux",
    architecture: "x64",
    insta360Studio: { available: false, version: null },
    mediaSdk: { available: true, version: "3.1.0", licenseConfigured: true, modelsConfigured: true },
    ffmpeg: { available: true, version: "8.1.1", v360Available: true, runtimeViewCommands: true },
  });
  assert.equal(readiness.status, "ready");
  assert.deepEqual(readiness.blockers, []);
});

test("reviewed Studio handoff binds a full-resolution master to the exact INSV package", () => {
  const raw = {
    receiptId: "reviewed-stitch-1",
    clientRequestId: "review-request-1",
    projectId: "project-1",
    sourceSetId: "source-set-1",
    sourceSetIdentitySha256: "1".repeat(64),
    sourceClockRevisionId: "clock-revision-1",
    executionTarget: EXECUTION_TARGET,
    exactMembers: [{ sourceRevisionId: "source-revision-1", role: "primary-original" as const, fileName: "VID_take.insv", generation: `sha256:${"2".repeat(64)}`, sha256: "2".repeat(64), sizeBytes: 20_000_000 }],
    output: { provider: "local" as const, ...EXECUTION_TARGET, locator: "/authorized/stitched-master.mp4", contentType: "video/mp4" as const, generation: `sha256:${"3".repeat(64)}`, sha256: "3".repeat(64), sizeBytes: 30_000_000, durationSeconds: 10, completeDecode: true as const, width: 5760 as const, height: 2880 as const, fps: 24, videoCodec: "hevc", projection: "equirectangular" as const },
    review: { reviewedAt: "2026-08-08T01:00:00.000Z", reviewedByUserId: "reviewer-1", reviewedByEmail: "reviewer@quipsly.test", application: "Insta360 Studio" as const, applicationVersion: "5.9.9", flowStateEnabled: true, horizonLockEnabled: true, stitchMode: "ai-flow" as const, visualPlaybackReviewed: true as const },
    receiptSha256: "0".repeat(64),
  };
  const unsealed = newReviewedSpatialStitchMasterReceipt(raw);
  const receipt = newReviewedSpatialStitchMasterReceipt({ ...raw, receiptSha256: createHash("sha256").update(reviewedSpatialStitchMasterCanonicalJson(unsealed)).digest("hex") });
  assert.deepEqual(parseReviewedSpatialStitchMasterReceipt(receipt), receipt);
  assert.equal(createHash("sha256").update(reviewedSpatialStitchMasterCanonicalJson(receipt)).digest("hex"), receipt.receiptSha256);
  assert.equal(receipt.boundaries.lrvWasNotUsedAsStitchSource, true);
  assert.equal(receipt.boundaries.derivativeIsNotPublicationMedia, true);
});

test("reviewed Studio handoff refuses low-resolution or proxy-shaped claims", () => {
  const base = {
    kind: "quipsly-reviewed-spatial-stitch-master-v2",
    version: 2,
    receiptId: "reviewed-stitch-1",
    clientRequestId: "review-request-1",
    projectId: "project-1",
    sourceSetId: "source-set-1",
    sourceSetIdentitySha256: "1".repeat(64),
    sourceClockRevisionId: "clock-revision-1",
    executionTarget: EXECUTION_TARGET,
    exactMembers: [{ sourceRevisionId: "source-revision-1", role: "primary-original", fileName: "LRV_take.lrv", generation: `sha256:${"2".repeat(64)}`, sha256: "2".repeat(64), sizeBytes: 20_000_000 }],
    output: { provider: "local", ...EXECUTION_TARGET, locator: "/authorized/proxy.mp4", contentType: "video/mp4", generation: `sha256:${"3".repeat(64)}`, sha256: "3".repeat(64), sizeBytes: 30_000_000, durationSeconds: 10, completeDecode: true, width: 960, height: 480, fps: 24, videoCodec: "h264", projection: "equirectangular" },
    review: { reviewedAt: "2026-08-08T01:00:00.000Z", reviewedByUserId: "reviewer-1", reviewedByEmail: "reviewer@quipsly.test", application: "Insta360 Studio", applicationVersion: "5.9.9", flowStateEnabled: true, horizonLockEnabled: true, stitchMode: "ai-flow", visualPlaybackReviewed: true },
    receiptSha256: "4".repeat(64),
    boundaries: { exactPackageVerifiedBeforeAndAfter: true, completeOutputDecode: true, manualExportIsNotAutomaticSdkExecution: true, lrvWasNotUsedAsStitchSource: true, sourceMediaRemainsImmutable: true, derivativeIsNotPublicationMedia: true },
  };
  assert.throws(() => parseReviewedSpatialStitchMasterReceipt(base), /only bind exact INSV/);
  assert.throws(() => parseReviewedSpatialStitchMasterReceipt({ ...base, exactMembers: [{ ...base.exactMembers[0]!, fileName: "VID_take.insv" }] }), /contract is invalid/);
});
