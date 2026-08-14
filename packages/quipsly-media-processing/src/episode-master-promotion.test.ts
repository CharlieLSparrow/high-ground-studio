import assert from "node:assert/strict";
import test from "node:test";

import {
  EPISODE_MASTER_PROMOTION_JOB_KIND,
  EPISODE_MASTER_PROMOTION_RESULT_KIND,
  buildEpisodeMasterPromotionGcsObjectName,
  parseEpisodeMasterPromotionJob,
  parseEpisodeMasterPromotionResult,
  type EpisodeMasterPromotionJob,
} from "./episode-master-promotion.js";

const sampleJob: EpisodeMasterPromotionJob = {
  kind: EPISODE_MASTER_PROMOTION_JOB_KIND,
  version: 1,
  jobId: "master-promo-job-12345678",
  projectId: "proj-101",
  episodeProductionId: "ep-202",
  requestedByEmail: "creator@example.com",
  clientRequestId: "req-9999",
  queuedAt: "2026-08-12T16:00:00.000Z",
  reviewApproval: {
    receiptId: "master-review-rcpt-001",
    masterJobId: "master-job-77777777",
    approvedByEmail: "reviewer@example.com",
    approvedAt: "2026-08-12T15:00:00.000Z",
    masterSha256: "a".repeat(64),
    masterSizeBytes: 1500000000,
    masterGeneration: "1001",
    masterLocator: "/var/quipsly/workspace/master-777.mp4",
  },
  executionTarget: {
    portability: "executor-local",
    custodianNodeId: "mac-studio-01",
    storageScopeId: "local-ssd-root",
  },
  sourceLocalMaster: {
    portability: "executor-local",
    custodianNodeId: "mac-studio-01",
    storageScopeId: "local-ssd-root",
    locator: "/var/quipsly/workspace/master-777.mp4",
    sha256: "a".repeat(64),
    sizeBytes: 1500000000,
  },
  target: {
    provider: "gcs",
    bucketName: "high-ground-masters-vault",
    objectName: "media-vault/masters/proj-slug/ep-slug/master-promoted-master-promo-job-12345678.mp4",
    contentType: "video/mp4",
  },
  boundaries: {
    requiresExplicitMasterApproval: true,
    localSourceMustMatchExactReviewHash: true,
    promotionIsPortableObjectCopy: true,
    originalSourceMediaRemainsImmutable: true,
    serverMustVerifyGcsUploadBeforeCustodyUpdate: true,
  },
};

test("buildEpisodeMasterPromotionGcsObjectName formats clean object path", () => {
  const obj = buildEpisodeMasterPromotionGcsObjectName({
    projectSlug: "my project",
    episodeSlug: "ep 01",
    jobId: "job-12345678",
  });
  assert.equal(
    obj,
    "media-vault/masters/my-project/ep-01/master-promoted-job-12345678.mp4",
  );
});

test("parseEpisodeMasterPromotionJob validates valid job and enforces SHA-256 match", () => {
  const parsed = parseEpisodeMasterPromotionJob(sampleJob);
  assert.equal(parsed.jobId, "master-promo-job-12345678");

  const invalid = {
    ...sampleJob,
    sourceLocalMaster: {
      ...sampleJob.sourceLocalMaster,
      sha256: "b".repeat(64),
    },
  };
  assert.throws(
    () => parseEpisodeMasterPromotionJob(invalid),
    /Source master SHA-256 does not match reviewed master SHA-256/,
  );
});

test("parseEpisodeMasterPromotionResult validates valid result and checks target", () => {
  const result = {
    kind: EPISODE_MASTER_PROMOTION_RESULT_KIND,
    version: 1,
    jobId: "master-promo-job-12345678",
    completedAt: "2026-08-12T16:05:00.000Z",
    masterReviewReceiptId: "master-review-rcpt-001",
    output: {
      provider: "gcs",
      bucketName: "high-ground-masters-vault",
      objectName: "media-vault/masters/proj-slug/ep-slug/master-promoted-master-promo-job-12345678.mp4",
      generation: "2001",
      sha256: "a".repeat(64),
      sizeBytes: 1500000000,
      contentType: "video/mp4",
      custodyState: "portable-gcs",
    },
    worker: {
      executionId: "exec-99",
      buildId: "build-abc",
      imageDigest: null,
    },
    boundaries: {
      portableMasterIsVerifiedGcsObject: true,
      localMasterRemainsAvailable: true,
    },
  };

  const parsed = parseEpisodeMasterPromotionResult(result, sampleJob);
  assert.equal(parsed.output.custodyState, "portable-gcs");
});
