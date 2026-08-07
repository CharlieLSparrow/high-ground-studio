import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  evaluateSpatialExecutorReadiness,
  newSpatialRenderJob,
  parseSpatialRenderJob,
  spatialRecipeCanonicalJson,
  spatialRenderManifestCanonicalJson,
  type SpatialRenderJob,
} from "@high-ground/quipsly-media-processing";

function fixture(overrides: Partial<SpatialRenderJob> = {}) {
  const raw = {
    jobId: "spatial-job-1",
    projectId: "project-1",
    episodeProductionId: "episode-1",
    timelinePlacementId: "placement-1",
    timelineFingerprintSha256: "1".repeat(64),
    requestedByUserId: "user-1",
    requestedByEmail: "editor@quipsly.test",
    clientRequestId: "request-1",
    queuedAt: "2026-08-08T00:00:00.000Z",
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
      target: { provider: "local" as const, locator: "spatial/intermediate/source-set-1.mp4", contentType: "video/mp4" as const },
    },
    reframe: {
      adapter: "ffmpeg-v360" as const,
      profile: "spatial-proof-720p24" as const,
      commandResolution: "output-frame" as const,
      target: { provider: "local" as const, locator: "spatial/output/spatial-job-1.mp4", contentType: "video/mp4" as const },
    },
    manifestSha256: "0".repeat(64),
    ...overrides,
  };
  const unsealed = newSpatialRenderJob(raw);
  return newSpatialRenderJob({ ...raw, manifestSha256: createHash("sha256").update(spatialRenderManifestCanonicalJson(unsealed)).digest("hex") });
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
