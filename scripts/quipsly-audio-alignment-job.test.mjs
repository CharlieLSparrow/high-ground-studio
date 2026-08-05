import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  newAudioAlignmentJob,
  newAudioAlignmentResult,
  parseAudioAlignmentJob,
  parseAudioAlignmentResult,
} from "../packages/quipsly-media-processing/src/audio-alignment-job.ts";
import { parseAudioAlignmentEvidence } from "../packages/quipsly-media-processing/src/audio-alignment-evidence.ts";
import { runOneLocalAudioAlignmentJob } from "../apps/quipsly-media-processor/src/local-audio-alignment-worker.ts";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const source = (assetId, locator, bytes) => ({
  assetId,
  provider: "local",
  locator,
  generation: `sha256:${sha(bytes)}`,
  sha256: sha(bytes),
  sizeBytes: Buffer.byteLength(bytes),
  contentType: "audio/wav",
});
const proposal = {
  initialOffsetSeconds: 0.35,
  openingTargetSeconds: 10,
  laterTargetSeconds: 70,
  windowSeconds: 6,
  searchRadiusSeconds: 1,
  sampleRate: 12_000,
  minimumCorrelation: 0.78,
  minimumPeakMargin: 0.04,
};

function evidence(job) {
  return parseAudioAlignmentEvidence({
    kind: "quipsly-audio-alignment-evidence-v1",
    createdAt: "2026-08-05T12:00:01.000Z",
    spine: job.spine,
    target: job.target,
    analyzer: {
      algorithm: "normalized-fft-cross-correlation-v1",
      sampleRate: 12_000,
      windowSeconds: 6,
      searchRadiusSeconds: 1,
      ffmpegVersion: "ffmpeg test",
    },
    opening: {
      targetStartSeconds: 10,
      expectedSpineStartSeconds: 10.35,
      measuredSpineStartSeconds: 10.351,
      measuredOffsetSeconds: 0.351,
      normalizedCorrelation: 0.97,
      secondBestCorrelation: 0.2,
      peakMargin: 0.77,
    },
    later: {
      targetStartSeconds: 70,
      expectedSpineStartSeconds: 70.35,
      measuredSpineStartSeconds: 70.352,
      measuredOffsetSeconds: 0.352,
      normalizedCorrelation: 0.96,
      secondBestCorrelation: 0.18,
      peakMargin: 0.78,
    },
    drift: {
      observationIntervalSeconds: 60,
      residualDriftMilliseconds: 1,
      observedPartsPerMillion: 16.666667,
    },
    qualification: {
      minimumCorrelation: 0.78,
      minimumPeakMargin: 0.04,
      qualifiedForAuthorizedAgentReview: true,
      reason: "Two distinct exact-source peaks qualify for explicit review.",
    },
    boundaries: {
      sampleAccurateClaimed: false,
      sourceBytesMutated: false,
      timelinePlacementApplied: false,
      personOrDelegatedApprovalStillRequired: true,
    },
  });
}

test("job and result preserve two exact source bindings and evidence-only boundaries", () => {
  const job = newAudioAlignmentJob({
    jobId: "audio_alignment_12345678",
    projectId: "project_12345678",
    projectSlug: "high-ground-odyssey",
    episodeProductionId: "production_12345678",
    episodeSlug: "episode-9",
    requestedByUserId: "user_12345678",
    requestedByEmail: "tester@example.test",
    queuedAt: "2026-08-05T12:00:00.000Z",
    spine: source("asset_spine_1234", "/tmp/spine.wav", "spine"),
    target: source("asset_target_123", "/tmp/target.wav", "target"),
    proposal,
  });
  const result = newAudioAlignmentResult({
    jobId: job.jobId,
    completedAt: "2026-08-05T12:00:02.000Z",
    evidence: evidence(job),
    worker: { executionId: "execution_123456", buildId: "test-build", imageDigest: null, attempt: 1 },
  });
  assert.equal(parseAudioAlignmentJob(job, job.jobId).target.sha256, job.target.sha256);
  assert.equal(parseAudioAlignmentResult(result, job).boundaries.placementApplied, false);
  const reordered = JSON.parse(JSON.stringify(result));
  reordered.evidence.spine = Object.fromEntries(Object.entries(reordered.evidence.spine).reverse());
  reordered.evidence.target = Object.fromEntries(Object.entries(reordered.evidence.target).reverse());
  assert.equal(parseAudioAlignmentResult(reordered, job).evidence.target.sha256, job.target.sha256);
  assert.throws(() => parseAudioAlignmentResult({ ...result, evidence: { ...result.evidence, target: { ...result.evidence.target, sha256: "0".repeat(64) } } }, job));
});

test("local worker leases, analyzes, and commits a resumable evidence receipt", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "quipsly-alignment-worker-test-"));
  try {
    const spinePath = path.join(root, "spine.wav");
    const targetPath = path.join(root, "target.wav");
    await writeFile(spinePath, "spine");
    await writeFile(targetPath, "target");
    const job = newAudioAlignmentJob({
      jobId: "audio_alignment_worker123",
      projectId: "project_worker123",
      projectSlug: "high-ground-odyssey",
      episodeProductionId: "production_worker123",
      episodeSlug: "episode-9",
      requestedByUserId: null,
      requestedByEmail: "worker@example.test",
      queuedAt: "2026-08-05T12:00:00.000Z",
      spine: source("asset_spine_worker", spinePath, "spine"),
      target: source("asset_target_worker", targetPath, "target"),
      proposal,
    });
    let saved = null;
    const store = {
      claim: async ({ executionId }) => ({ id: job.jobId, inputJson: job, attempt: 1, executionId }),
      complete: async ({ receipt }) => { saved = receipt; return true; },
      retry: async () => { throw new Error("unexpected retry"); },
      fail: async () => { throw new Error("unexpected failure"); },
    };
    const analyzer = { analyze: async () => evidence(job) };
    const result = await runOneLocalAudioAlignmentJob(store, analyzer, {
      executionId: "execution_worker123",
      buildId: "test-build",
      imageDigest: null,
      leaseMs: 60_000,
      localMediaRoot: root,
      now: () => new Date("2026-08-05T12:00:02.000Z"),
    });
    assert.deepEqual(result, { disposition: "completed", jobId: job.jobId, qualified: true });
    assert.equal(parseAudioAlignmentResult(saved, job).evidence.drift.residualDriftMilliseconds, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
