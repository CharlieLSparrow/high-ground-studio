import assert from "node:assert/strict";
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  EPISODE_MASTER_PROMOTION_JOB_KIND,
  parseEpisodeMasterPromotionJob,
  type EpisodeMasterPromotionJob,
} from "@high-ground/quipsly-media-processing";

import {
  runOneLocalEpisodeMasterPromotionJob,
  type LocalEpisodeMasterPromotionClaim,
  type LocalEpisodeMasterPromotionStore,
} from "./local-episode-master-promotion-worker.js";
import { sha256File } from "./transcoder.js";

test("runOneLocalEpisodeMasterPromotionJob verifies master file and completes promotion", async () => {
  const tmpDir = path.join(process.cwd(), "tmp-test-promo-" + Date.now());
  await mkdir(tmpDir, { recursive: true });

  const masterFile = path.join(tmpDir, "master-test.mp4");
  const masterContent = "4K Master Content " + "x".repeat(100);
  await writeFile(masterFile, masterContent, "utf-8");

  const sha256 = await sha256File(masterFile);
  const sizeBytes = Buffer.byteLength(masterContent);

  const job: EpisodeMasterPromotionJob = {
    kind: EPISODE_MASTER_PROMOTION_JOB_KIND,
    version: 1,
    jobId: "promo-job-88888888",
    projectId: "proj-10000000",
    episodeProductionId: "ep-10000000",
    requestedByEmail: "test@example.com",
    clientRequestId: "req-1",
    queuedAt: new Date().toISOString(),
    reviewApproval: {
      receiptId: "rev-rcpt-1",
      masterJobId: "master-job-1",
      approvedByEmail: "rev@example.com",
      approvedAt: new Date().toISOString(),
      masterSha256: sha256,
      masterSizeBytes: sizeBytes,
      masterGeneration: "1",
      masterLocator: masterFile,
    },
    executionTarget: {
      portability: "executor-local",
      custodianNodeId: "mac-studio-01",
      storageScopeId: "scope-01",
    },
    sourceLocalMaster: {
      portability: "executor-local",
      custodianNodeId: "mac-studio-01",
      storageScopeId: "scope-01",
      locator: masterFile,
      sha256,
      sizeBytes,
    },
    target: {
      provider: "gcs",
      bucketName: "test-masters-bucket",
      objectName: "media-vault/masters/proj-10000000/ep-10000000/master-promoted-promo-job-88888888.mp4",
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

  let completedReceipt: any = null;
  const store: LocalEpisodeMasterPromotionStore = {
    async claim() {
      return {
        id: job.jobId,
        inputJson: job,
        attempt: 1,
        executionId: "exec-1",
      };
    },
    async complete(input) {
      completedReceipt = input.receipt;
      return true;
    },
    async fail() {
      return true;
    },
  };

  try {
    const result = await runOneLocalEpisodeMasterPromotionJob(store, {
      executionId: "exec-1",
      custodianNodeId: "mac-studio-01",
      storageScopeId: "scope-01",
      buildId: "build-test",
      imageDigest: null,
      leaseMs: 60000,
      localMediaRoot: tmpDir,
      now: () => new Date("2026-08-12T16:40:00Z"),
      mockGcsUploader: async () => ({ generation: "9999" }),
    });

    assert.equal(result.disposition, "completed");
    assert.equal(completedReceipt?.output?.custodyState, "portable-gcs");
    assert.equal(completedReceipt?.output?.generation, "9999");
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});
