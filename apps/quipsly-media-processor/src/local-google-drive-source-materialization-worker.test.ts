import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  newGoogleDriveSourceMaterializationJob,
  newGoogleDriveSourceMaterializationResult,
  parseGoogleDriveSourceMaterializationResult,
} from "@high-ground/quipsly-media-processing";

import {
  runOneLocalGoogleDriveMaterializationJob,
  type GoogleDriveMaterializationProvider,
  type LocalGoogleDriveMaterializationClaim,
  type LocalGoogleDriveMaterializationStore,
  type ResolvedGoogleDriveMaterialization,
} from "./local-google-drive-source-materialization-worker.js";

const CUSTODIAN_NODE_ID = "execution_worker_12345678";
const STORAGE_SCOPE_ID = "storage_scope_12345678";

function digest(algorithm: "md5" | "sha256", bytes: Uint8Array) {
  return createHash(algorithm).update(bytes).digest("hex");
}

function fixture(bytes: Buffer, options: { original?: boolean } = {}) {
  const original = options.original === true;
  const job = newGoogleDriveSourceMaterializationJob({
    jobId: "gdmjob_12345678",
    replicaId: "gdmreplica_12345678",
    projectId: "project_12345678",
    projectSlug: "homer-source-room",
    actorUserId: "user_12345678",
    actorEmail: "homer@example.com",
    queuedAt: "2026-08-07T19:00:00.000Z",
    source: {
      provider: "google-drive",
      connectionId: "connection_12345678",
      externalReferenceId: "reference_12345678",
      sourceRevisionId: "revision_12345678",
      externalFileId: "drive-file-12345678",
      resourceKey: "resource-key-12345678",
      headRevisionKey: "head-revision-12345678",
      identitySha256: "a".repeat(64),
      expectedMd5: digest("md5", bytes),
      expectedSizeBytes: bytes.length,
      contentType: "video/mp4",
      memberRole: original ? "primary-original" : "browse-proxy",
    },
    target: {
      provider: "local-cache",
      locator: original
        ? "source-cache/google-drive/homer-source-room/revision_12345678/exact-provider-original-replica-v1-aaaaaaaa.insv"
        : "source-cache/google-drive/homer-source-room/revision_12345678/exact-provider-replica-v1-aaaaaaaa.lrv",
      profile: original
        ? "exact-provider-original-replica-v1"
        : "exact-provider-replica-v1",
      custodianNodeId: CUSTODIAN_NODE_ID,
      storageScopeId: STORAGE_SCOPE_ID,
    },
  });
  const claim: LocalGoogleDriveMaterializationClaim = {
    id: job.jobId,
    inputJson: job,
    attempt: 1,
    executionId: "worker_12345678",
  };
  const resolved: ResolvedGoogleDriveMaterialization = {
    projectId: job.projectId,
    projectSlug: job.projectSlug,
    referenceId: job.source.externalReferenceId,
    sourceRevisionId: job.source.sourceRevisionId,
    revisionKey: job.source.headRevisionKey,
    identitySha256: job.source.identitySha256,
    sizeBytes: job.source.expectedSizeBytes,
    accessState: "available",
    capabilityState: "downloadable",
    provider: "google-drive",
    connectionId: job.source.connectionId,
    connectionStatus: "verified",
    encryptedCredential: "encrypted-test-credential",
  };
  return { job, claim, resolved };
}

test("Drive materializer resumes a partial LRV, verifies exact bytes, and retains an immutable replica receipt", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "quipsly-drive-materialize-"));
  try {
    const bytes = Buffer.from(
      "A deliberately small retained LRV fixture that proves range-resume and two-checksum verification.",
    );
    const { job, claim, resolved } = fixture(bytes);
    const outputPath = path.join(await realpath(root), job.target.locator);
    const partialPath = `${outputPath}.partial`;
    const split = 29;
    await mkdir(path.dirname(partialPath), { recursive: true });
    await writeFile(partialPath, bytes.subarray(0, split), { mode: 0o600 });
    const receipts: Array<
      Parameters<LocalGoogleDriveMaterializationStore["complete"]>[0]["receipt"]
    > = [];
    const progress: number[] = [];
    const store: LocalGoogleDriveMaterializationStore = {
      claim: async () => claim,
      resolve: async () => resolved,
      progress: async (input) => {
        progress.push(input.transferredBytes);
        return true;
      },
      complete: async (input) => {
        receipts.push(input.receipt);
        return true;
      },
      retry: async () => true,
      fail: async () => true,
    };
    const provider: GoogleDriveMaterializationProvider = {
      inspect: async () => ({
        externalFileId: job.source.externalFileId,
        headRevisionKey: job.source.headRevisionKey,
        md5: job.source.expectedMd5,
        sizeBytes: bytes.length,
        canDownload: true,
      }),
      download: async (input) => {
        assert.equal(input.resumeFromBytes, split);
        await writeFile(input.destinationPath, bytes.subarray(split), {
          flag: "a",
        });
        await input.onProgress(bytes.length);
        return {
          resumedFromBytes: split,
          downloadedBytes: bytes.length - split,
          providerRequestCount: 1,
        };
      },
    };
    const result = await runOneLocalGoogleDriveMaterializationJob(
      store,
      provider,
      {
        executionId: claim.executionId,
        custodianNodeId: CUSTODIAN_NODE_ID,
        storageScopeId: STORAGE_SCOPE_ID,
        buildId: "build-1",
        leaseMs: 60_000,
        localMediaRoot: root,
        minFreeBytes: 0,
        now: () => new Date("2026-08-07T19:00:10.000Z"),
      },
    );
    assert.deepEqual(result, {
      disposition: "completed",
      jobId: job.jobId,
      outputPath,
      resumedFromBytes: split,
      recoveredExistingOutput: false,
    });
    assert.deepEqual(await readFile(outputPath), bytes);
    assert.deepEqual(progress, [bytes.length]);
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0]?.output.sha256, digest("sha256", bytes));
    assert.equal(receipts[0]?.output.md5, digest("md5", bytes));
    assert.equal(receipts[0]?.transfer.resumedFromBytes, split);
    assert.equal(receipts[0]?.boundaries.originalRemainsInDrive, true);
    assert.equal(
      receipts[0]?.boundaries.collaborationProxyQueuedFromVerifiedBytes,
      true,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Drive materializer retains an exact INSV original without promising a collaboration proxy", async () => {
  const root = await mkdtemp(
    path.join(tmpdir(), "quipsly-drive-materialize-original-"),
  );
  try {
    const bytes = Buffer.from("retained exact INSV original fixture");
    const { job, claim, resolved } = fixture(bytes, { original: true });
    const receipts: Array<
      Parameters<LocalGoogleDriveMaterializationStore["complete"]>[0]["receipt"]
    > = [];
    const store: LocalGoogleDriveMaterializationStore = {
      claim: async () => claim,
      resolve: async () => resolved,
      progress: async () => true,
      complete: async (input) => {
        receipts.push(input.receipt);
        return true;
      },
      retry: async () => true,
      fail: async () => true,
    };
    const provider: GoogleDriveMaterializationProvider = {
      inspect: async () => ({
        externalFileId: job.source.externalFileId,
        headRevisionKey: job.source.headRevisionKey,
        md5: job.source.expectedMd5,
        sizeBytes: bytes.length,
        canDownload: true,
      }),
      download: async (input) => {
        await writeFile(input.destinationPath, bytes);
        await input.onProgress(bytes.length);
        return {
          resumedFromBytes: 0,
          downloadedBytes: bytes.length,
          providerRequestCount: 1,
        };
      },
    };
    const result = await runOneLocalGoogleDriveMaterializationJob(
      store,
      provider,
      {
        executionId: claim.executionId,
        custodianNodeId: CUSTODIAN_NODE_ID,
        storageScopeId: STORAGE_SCOPE_ID,
        buildId: "build-1",
        leaseMs: 60_000,
        localMediaRoot: root,
        minFreeBytes: 0,
        now: () => new Date("2026-08-07T19:00:10.000Z"),
      },
    );
    assert.equal(result.disposition, "completed", JSON.stringify(result));
    assert.equal(receipts[0]?.source.memberRole, "primary-original");
    assert.equal(
      receipts[0]?.boundaries.collaborationProxyQueuedFromVerifiedBytes,
      false,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Drive materializer preserves partial bytes and releases its lease when shutdown aborts a transfer", async () => {
  const root = await mkdtemp(
    path.join(tmpdir(), "quipsly-drive-materialize-stop-"),
  );
  try {
    const bytes = Buffer.from(
      "partial bytes retained across a cooperative worker restart",
    );
    const { job, claim, resolved } = fixture(bytes);
    const outputPath = path.join(await realpath(root), job.target.locator);
    const partialPath = `${outputPath}.partial`;
    const controller = new AbortController();
    let retryCode = "";
    const store: LocalGoogleDriveMaterializationStore = {
      claim: async () => claim,
      resolve: async () => resolved,
      progress: async () => true,
      complete: async () => assert.fail("aborted transfer must not complete"),
      retry: async (input) => {
        retryCode = input.code;
        return true;
      },
      fail: async () =>
        assert.fail("cooperative shutdown must not fail the source"),
    };
    const provider: GoogleDriveMaterializationProvider = {
      inspect: async () => ({
        externalFileId: job.source.externalFileId,
        headRevisionKey: job.source.headRevisionKey,
        md5: job.source.expectedMd5,
        sizeBytes: bytes.length,
        canDownload: true,
      }),
      download: async (input) => {
        await writeFile(input.destinationPath, bytes.subarray(0, 17));
        controller.abort();
        throw new DOMException("worker stopping", "AbortError");
      },
    };
    const result = await runOneLocalGoogleDriveMaterializationJob(
      store,
      provider,
      {
        executionId: claim.executionId,
        custodianNodeId: CUSTODIAN_NODE_ID,
        storageScopeId: STORAGE_SCOPE_ID,
        buildId: "build-1",
        leaseMs: 60_000,
        localMediaRoot: root,
        minFreeBytes: 0,
        signal: controller.signal,
        now: () => new Date("2026-08-07T19:00:10.000Z"),
      },
    );
    assert.deepEqual(result, {
      disposition: "retry",
      jobId: job.jobId,
      code: "drive-materialization-worker-stopping",
    });
    assert.equal(retryCode, "drive-materialization-worker-stopping");
    assert.equal((await stat(partialPath)).size, 17);
    await assert.rejects(stat(outputPath));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Drive materializer rejects provider drift and does not retain changed output", async () => {
  const root = await mkdtemp(
    path.join(tmpdir(), "quipsly-drive-materialize-drift-"),
  );
  try {
    const bytes = Buffer.from("provider revision drift fixture");
    const { job, claim, resolved } = fixture(bytes);
    let inspections = 0;
    let failure = "";
    let completed = false;
    const store: LocalGoogleDriveMaterializationStore = {
      claim: async () => claim,
      resolve: async () => resolved,
      progress: async () => true,
      complete: async () => {
        completed = true;
        return true;
      },
      retry: async () => true,
      fail: async (input) => {
        failure = input.code;
        return true;
      },
    };
    const provider: GoogleDriveMaterializationProvider = {
      inspect: async () => {
        inspections += 1;
        return {
          externalFileId: job.source.externalFileId,
          headRevisionKey:
            inspections === 1 ? job.source.headRevisionKey : "changed-revision",
          md5: job.source.expectedMd5,
          sizeBytes: bytes.length,
          canDownload: true,
        };
      },
      download: async (input) => {
        await writeFile(input.destinationPath, bytes);
        await input.onProgress(bytes.length);
        return {
          resumedFromBytes: 0,
          downloadedBytes: bytes.length,
          providerRequestCount: 1,
        };
      },
    };
    const result = await runOneLocalGoogleDriveMaterializationJob(
      store,
      provider,
      {
        executionId: claim.executionId,
        custodianNodeId: CUSTODIAN_NODE_ID,
        storageScopeId: STORAGE_SCOPE_ID,
        buildId: "build-1",
        leaseMs: 60_000,
        localMediaRoot: root,
        minFreeBytes: 0,
        now: () => new Date("2026-08-07T19:00:10.000Z"),
      },
    );
    assert.deepEqual(result, {
      disposition: "failed",
      jobId: job.jobId,
      code: "drive-materialization-provider-drift",
    });
    assert.equal(failure, "drive-materialization-provider-drift");
    assert.equal(completed, false);
    await assert.rejects(stat(path.join(root, job.target.locator)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Drive materialization receipts cannot rewrite their queued provider revision", () => {
  const bytes = Buffer.from("immutable receipt binding fixture");
  const { job } = fixture(bytes);
  const sha256 = digest("sha256", bytes);
  const receipt = newGoogleDriveSourceMaterializationResult({
    jobId: job.jobId,
    replicaId: job.replicaId,
    completedAt: "2026-08-07T19:00:10.000Z",
    source: {
      ...job.source,
      observedHeadRevisionKey: job.source.headRevisionKey,
      observedMd5: job.source.expectedMd5,
      observedSizeBytes: bytes.length,
      observedSha256: sha256,
    },
    output: {
      provider: "local-cache",
      locator: `/private/cache/${job.target.locator}`,
      generation: `sha256:${sha256}`,
      profile: job.target.profile,
      contentType: job.source.contentType,
      sha256,
      md5: job.source.expectedMd5,
      sizeBytes: bytes.length,
    },
    transfer: {
      resumedFromBytes: 0,
      downloadedBytes: bytes.length,
      providerRequestCount: 1,
    },
    worker: {
      executionId: "worker_12345678",
      buildId: "build-1",
      attempt: 1,
      custodianNodeId: CUSTODIAN_NODE_ID,
      storageScopeId: STORAGE_SCOPE_ID,
    },
  });
  expectBoundReceipt(receipt, job);

  const tampered = structuredClone(receipt);
  tampered.source.headRevisionKey = "rewritten-provider-revision";
  tampered.source.observedHeadRevisionKey = "rewritten-provider-revision";
  assert.throws(
    () => parseGoogleDriveSourceMaterializationResult(tampered, job),
    /result is invalid/,
  );
});

function expectBoundReceipt(
  receipt: ReturnType<typeof newGoogleDriveSourceMaterializationResult>,
  job: ReturnType<typeof newGoogleDriveSourceMaterializationJob>,
) {
  assert.deepEqual(
    parseGoogleDriveSourceMaterializationResult(receipt, job),
    receipt,
  );
}
