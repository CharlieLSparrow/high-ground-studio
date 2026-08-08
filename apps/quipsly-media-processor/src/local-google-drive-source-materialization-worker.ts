import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  mkdir,
  open,
  realpath,
  rename,
  rm,
  stat,
  statfs,
} from "node:fs/promises";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

import {
  EXTERNAL_SOURCE_PROXY_PROFILE,
  newExternalSourceProxyJob,
  newGoogleDriveSourceMaterializationResult,
  parseExternalSourceProxyJob,
  parseGoogleDriveSourceMaterializationJob,
  type GoogleDriveSourceMaterializationJob,
  type GoogleDriveSourceMaterializationResult,
} from "@high-ground/quipsly-media-processing";
import {
  buildExternalSourceProxyTargetLocator,
  externalSourceProxyDerivativeId,
  externalSourceProxyIdentity,
  externalSourceProxyJobId,
} from "@high-ground/quipsly-media-processing/external-source-proxy-identity";
import {
  decryptGoogleDriveRefreshCredential,
  refreshGoogleDriveWorkerAccessToken,
} from "@high-ground/quipsly-media-processing/google-drive-provider-credential";
import type pg from "pg";

const JOB_TYPE = "google-drive-source-materialization";
const JOB_SOURCE = "source-story.google-drive-materialization";
const PROXY_JOB_TYPE = "external-source-proxy";
const PROXY_JOB_SOURCE = "source-story.external-proxy";
const DEFAULT_MIN_FREE_BYTES = 5 * 1024 * 1024 * 1024;

type Pool = InstanceType<typeof pg.Pool>;

export type LocalGoogleDriveMaterializationClaim = {
  id: string;
  inputJson: unknown;
  attempt: number;
  executionId: string;
};

export type ResolvedGoogleDriveMaterialization = {
  projectId: string;
  projectSlug: string;
  referenceId: string;
  sourceRevisionId: string;
  revisionKey: string;
  identitySha256: string;
  sizeBytes: number;
  accessState: string;
  capabilityState: string;
  provider: string;
  connectionId: string;
  connectionStatus: string;
  encryptedCredential: string;
};

export type GoogleDriveProviderMetadata = {
  externalFileId: string;
  headRevisionKey: string;
  md5: string;
  sizeBytes: number;
  canDownload: boolean;
};

export type GoogleDriveDownloadReceipt = {
  resumedFromBytes: number;
  downloadedBytes: number;
  providerRequestCount: number;
};

export interface GoogleDriveMaterializationProvider {
  inspect(input: {
    resolved: ResolvedGoogleDriveMaterialization;
    job: GoogleDriveSourceMaterializationJob;
  }): Promise<GoogleDriveProviderMetadata>;
  download(input: {
    resolved: ResolvedGoogleDriveMaterialization;
    job: GoogleDriveSourceMaterializationJob;
    destinationPath: string;
    resumeFromBytes: number;
    signal?: AbortSignal;
    onProgress: (transferredBytes: number) => Promise<void>;
  }): Promise<GoogleDriveDownloadReceipt>;
}

export interface LocalGoogleDriveMaterializationStore {
  claim(input: {
    executionId: string;
    custodianNodeId: string;
    storageScopeId: string;
    leaseMs: number;
    now: Date;
  }): Promise<LocalGoogleDriveMaterializationClaim | null>;
  resolve(
    claim: LocalGoogleDriveMaterializationClaim,
    job: GoogleDriveSourceMaterializationJob,
  ): Promise<ResolvedGoogleDriveMaterialization>;
  progress(input: {
    claim: LocalGoogleDriveMaterializationClaim;
    transferredBytes: number;
    totalBytes: number;
    now: Date;
  }): Promise<boolean>;
  complete(input: {
    claim: LocalGoogleDriveMaterializationClaim;
    job: GoogleDriveSourceMaterializationJob;
    receipt: GoogleDriveSourceMaterializationResult;
    now: Date;
  }): Promise<boolean>;
  retry(input: {
    claim: LocalGoogleDriveMaterializationClaim;
    code: string;
    message: string;
    now: Date;
  }): Promise<boolean>;
  fail(input: {
    claim: LocalGoogleDriveMaterializationClaim;
    code: string;
    message: string;
    now: Date;
  }): Promise<boolean>;
}

export type LocalGoogleDriveMaterializationOptions = {
  executionId: string;
  custodianNodeId: string;
  storageScopeId: string;
  buildId: string;
  leaseMs: number;
  localMediaRoot: string;
  minFreeBytes: number;
  signal?: AbortSignal;
  now: () => Date;
};

export type LocalGoogleDriveMaterializationWorkerResult =
  | { disposition: "idle" }
  | {
      disposition: "completed";
      jobId: string;
      outputPath: string;
      resumedFromBytes: number;
      recoveredExistingOutput: boolean;
    }
  | { disposition: "claim-lost"; jobId: string }
  | { disposition: "retry"; jobId: string; code: string }
  | { disposition: "failed"; jobId: string; code: string };

class GoogleDriveMaterializationTerminalError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "GoogleDriveMaterializationTerminalError";
  }
}

class GoogleDriveMaterializationRetryError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "GoogleDriveMaterializationRetryError";
  }
}

export async function runOneLocalGoogleDriveMaterializationJob(
  store: LocalGoogleDriveMaterializationStore,
  provider: GoogleDriveMaterializationProvider,
  options: LocalGoogleDriveMaterializationOptions,
): Promise<LocalGoogleDriveMaterializationWorkerResult> {
  const claim = await store.claim({
    executionId: options.executionId,
    custodianNodeId: options.custodianNodeId,
    storageScopeId: options.storageScopeId,
    leaseMs: options.leaseMs,
    now: options.now(),
  });
  if (!claim) return { disposition: "idle" };

  let job: GoogleDriveSourceMaterializationJob;
  try {
    job = parseGoogleDriveSourceMaterializationJob(claim.inputJson, claim.id);
  } catch (error) {
    await store.fail({
      claim,
      code: "drive-materialization-job-invalid",
      message: detail(error, "The Drive materialization job is invalid."),
      now: options.now(),
    });
    return {
      disposition: "failed",
      jobId: claim.id,
      code: "drive-materialization-job-invalid",
    };
  }

  let partialPath = "";
  let outputPath = "";
  let createdOutput = false;
  try {
    const resolved = await store.resolve(claim, job);
    assertResolved(job, resolved);
    const root = await authorizedCacheRoot(options.localMediaRoot);
    outputPath = authorizedTargetPath(root, job.target.locator);
    partialPath = `${outputPath}.partial`;
    await mkdir(path.dirname(outputPath), { recursive: true, mode: 0o700 });

    const before = await provider.inspect({ resolved, job });
    assertProviderMetadata(job, before);
    const existingOutput = await stat(outputPath).catch(() => null);
    let recoveredExistingOutput = false;
    let transfer: GoogleDriveDownloadReceipt;
    if (existingOutput) {
      if (
        !existingOutput.isFile() ||
        existingOutput.size !== job.source.expectedSizeBytes
      ) {
        await rm(outputPath, { force: true }).catch(() => undefined);
        throw new GoogleDriveMaterializationTerminalError(
          "drive-materialization-existing-output-invalid",
          "An existing cache output does not match the exact provider byte count.",
        );
      }
      recoveredExistingOutput = true;
      transfer = {
        resumedFromBytes: existingOutput.size,
        downloadedBytes: 0,
        providerRequestCount: 1,
      };
    } else {
      const partial = await stat(partialPath).catch(() => null);
      if (
        partial &&
        (!partial.isFile() || partial.size > job.source.expectedSizeBytes)
      ) {
        await rm(partialPath, { force: true });
      }
      const resumeFromBytes =
        (await stat(partialPath).catch(() => null))?.size ?? 0;
      await assertCapacity(
        root,
        job.source.expectedSizeBytes - resumeFromBytes,
        options.minFreeBytes,
      );
      transfer = await provider.download({
        resolved,
        job,
        destinationPath: partialPath,
        resumeFromBytes,
        signal: options.signal,
        onProgress: async (transferredBytes) => {
          const retained = await store.progress({
            claim,
            transferredBytes,
            totalBytes: job.source.expectedSizeBytes,
            now: options.now(),
          });
          if (!retained) {
            throw new GoogleDriveMaterializationRetryError(
              "drive-materialization-claim-lost",
              "The Drive transfer lease changed while bytes were downloading.",
            );
          }
        },
      });
      await flushFile(partialPath);
      const downloaded = await stat(partialPath);
      if (downloaded.size !== job.source.expectedSizeBytes) {
        throw new GoogleDriveMaterializationRetryError(
          "drive-materialization-incomplete-transfer",
          `Drive returned ${downloaded.size} of ${job.source.expectedSizeBytes} expected bytes.`,
        );
      }
      await rename(partialPath, outputPath);
      createdOutput = true;
    }

    const [hashes, after] = await Promise.all([
      hashFile(outputPath),
      provider.inspect({ resolved, job }),
    ]);
    if (
      before.headRevisionKey !== after.headRevisionKey ||
      before.md5 !== after.md5 ||
      before.sizeBytes !== after.sizeBytes
    ) {
      await rm(outputPath, { force: true }).catch(() => undefined);
      throw new GoogleDriveMaterializationTerminalError(
        "drive-materialization-provider-drift",
        "The Drive revision changed while Quipsly downloaded it. The replica was not retained.",
      );
    }
    assertProviderMetadata(job, after);
    if (
      hashes.sizeBytes !== job.source.expectedSizeBytes ||
      hashes.md5 !== job.source.expectedMd5
    ) {
      await rm(outputPath, { force: true }).catch(() => undefined);
      throw new GoogleDriveMaterializationTerminalError(
        "drive-materialization-byte-mismatch",
        "The downloaded camera-package member does not match Drive's exact size and MD5 receipt.",
      );
    }
    const receipt = newGoogleDriveSourceMaterializationResult({
      jobId: job.jobId,
      replicaId: job.replicaId,
      completedAt: options.now().toISOString(),
      source: {
        ...job.source,
        observedHeadRevisionKey: after.headRevisionKey,
        observedMd5: hashes.md5,
        observedSizeBytes: hashes.sizeBytes,
        observedSha256: hashes.sha256,
      },
      output: {
        provider: "local-cache",
        locator: outputPath,
        generation: `sha256:${hashes.sha256}`,
        profile: job.target.profile,
        contentType: job.source.contentType,
        sha256: hashes.sha256,
        md5: hashes.md5,
        sizeBytes: hashes.sizeBytes,
      },
      transfer,
      worker: {
        executionId: claim.executionId,
        buildId: options.buildId,
        attempt: claim.attempt,
        custodianNodeId: options.custodianNodeId,
        storageScopeId: options.storageScopeId,
      },
    });
    const committed = await store.complete({
      claim,
      job,
      receipt,
      now: options.now(),
    });
    return committed
      ? {
          disposition: "completed",
          jobId: job.jobId,
          outputPath,
          resumedFromBytes: transfer.resumedFromBytes,
          recoveredExistingOutput,
        }
      : { disposition: "claim-lost", jobId: job.jobId };
  } catch (error) {
    if (error instanceof GoogleDriveMaterializationTerminalError) {
      if (partialPath) {
        await rm(partialPath, { force: true }).catch(() => undefined);
      }
      if (createdOutput && outputPath) {
        await rm(outputPath, { force: true }).catch(() => undefined);
      }
      await store.fail({
        claim,
        code: error.code,
        message: error.message,
        now: options.now(),
      });
      return { disposition: "failed", jobId: job.jobId, code: error.code };
    }
    const code = options.signal?.aborted
      ? "drive-materialization-worker-stopping"
      : error instanceof GoogleDriveMaterializationRetryError
        ? error.code
        : "drive-materialization-worker-retry";
    await store.retry({
      claim,
      code,
      message: detail(error, "The Drive materializer needs retry."),
      now: options.now(),
    });
    return { disposition: "retry", jobId: job.jobId, code };
  }
}

export class PostgresLocalGoogleDriveMaterializationStore implements LocalGoogleDriveMaterializationStore {
  constructor(private readonly pool: Pool) {}

  async claim(input: {
    executionId: string;
    custodianNodeId: string;
    storageScopeId: string;
    leaseMs: number;
    now: Date;
  }) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const staleBefore = new Date(input.now.getTime() - input.leaseMs);
      const selected = await client.query({
        text: `
          SELECT "id", "inputJson", "resultJson"
          FROM "StudioWorkflowJob"
          WHERE "type"=$1 AND "source"=$2
            AND "inputJson"->'target'->>'custodianNodeId'=$4
            AND "inputJson"->'target'->>'storageScopeId'=$5
            AND ("status"='queued' OR ("status"='processing' AND "updatedAt" < timezone('UTC',$3::timestamptz)))
          ORDER BY "priority" ASC, "createdAt" ASC
          FOR UPDATE SKIP LOCKED LIMIT 1
        `,
        values: [
          JOB_TYPE,
          JOB_SOURCE,
          staleBefore,
          input.custodianNodeId,
          input.storageScopeId,
        ],
      });
      const row = selected.rows[0];
      if (!row) {
        await client.query("COMMIT");
        return null;
      }
      const previous = asRecord(row.resultJson);
      const previousLease = asRecord(previous.lease);
      const attempt = Math.max(0, Number(previousLease.attempt) || 0) + 1;
      const resultJson = {
        ...previous,
        state: "processing",
        lease: {
          executionId: input.executionId,
          attempt,
          claimedAt: input.now.toISOString(),
          expiresAt: new Date(
            input.now.getTime() + input.leaseMs,
          ).toISOString(),
        },
        originalRemainsInDrive: true,
      };
      const updated = await client.query({
        text: `UPDATE "StudioWorkflowJob" SET "status"='processing', "startedAt"=COALESCE("startedAt",timezone('UTC',$2::timestamptz)), "updatedAt"=timezone('UTC',$2::timestamptz), "error"=NULL, "resultJson"=$3::jsonb WHERE "id"=$1 RETURNING "id","inputJson"`,
        values: [row.id, input.now, JSON.stringify(resultJson)],
      });
      await client.query("COMMIT");
      return {
        id: updated.rows[0].id,
        inputJson: updated.rows[0].inputJson,
        attempt,
        executionId: input.executionId,
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async resolve(
    _claim: LocalGoogleDriveMaterializationClaim,
    job: GoogleDriveSourceMaterializationJob,
  ) {
    const result = await this.pool.query({
      text: `
        SELECT p."id" AS "projectId", p."slug" AS "projectSlug",
               r."id" AS "referenceId", r."provider", r."accessState", r."capabilityState", r."connectionId",
               s."id" AS "sourceRevisionId", s."revisionKey", s."identitySha256", s."sizeBytes",
               c."status" AS "connectionStatus", k."encryptedPayload" AS "encryptedCredential"
        FROM "StudioMediaSourceRevision" s
        JOIN "StudioExternalMediaReference" r ON r."id"=s."externalReferenceId"
        JOIN "StudioProject" p ON p."id"=s."projectId"
        JOIN "StudioMediaProviderConnection" c ON c."id"=r."connectionId"
        JOIN "StudioMediaProviderCredential" k ON k."connectionId"=c."id"
        WHERE s."id"=$1 AND r."id"=$2 AND p."id"=$3 AND c."id"=$4
      `,
      values: [
        job.source.sourceRevisionId,
        job.source.externalReferenceId,
        job.projectId,
        job.source.connectionId,
      ],
    });
    const row = result.rows[0];
    if (!row) {
      throw new GoogleDriveMaterializationTerminalError(
        "drive-materialization-source-missing",
        "The exact source revision or its Drive credential is unavailable.",
      );
    }
    return {
      projectId: row.projectId,
      projectSlug: row.projectSlug,
      referenceId: row.referenceId,
      sourceRevisionId: row.sourceRevisionId,
      revisionKey: row.revisionKey,
      identitySha256: row.identitySha256,
      sizeBytes: Number(row.sizeBytes),
      accessState: row.accessState,
      capabilityState: row.capabilityState,
      provider: row.provider,
      connectionId: row.connectionId,
      connectionStatus: row.connectionStatus,
      encryptedCredential: row.encryptedCredential,
    };
  }

  async progress(input: {
    claim: LocalGoogleDriveMaterializationClaim;
    transferredBytes: number;
    totalBytes: number;
    now: Date;
  }) {
    const current = await this.pool.query({
      text: `SELECT "resultJson" FROM "StudioWorkflowJob" WHERE "id"=$1`,
      values: [input.claim.id],
    });
    const previous = asRecord(current.rows[0]?.resultJson);
    const result = await this.pool.query({
      text: `UPDATE "StudioWorkflowJob" SET "updatedAt"=timezone('UTC',$3::timestamptz), "resultJson"=$4::jsonb WHERE "id"=$1 AND "status"='processing' AND "resultJson"->'lease'->>'executionId'=$2`,
      values: [
        input.claim.id,
        input.claim.executionId,
        input.now,
        JSON.stringify({
          ...previous,
          state: "processing",
          progress: {
            transferredBytes: input.transferredBytes,
            totalBytes: input.totalBytes,
            updatedAt: input.now.toISOString(),
          },
          originalRemainsInDrive: true,
        }),
      ],
    });
    return result.rowCount === 1;
  }

  async complete(input: {
    claim: LocalGoogleDriveMaterializationClaim;
    job: GoogleDriveSourceMaterializationJob;
    receipt: GoogleDriveSourceMaterializationResult;
    now: Date;
  }) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const source = await client.query({
        text: `SELECT "contentSha256", "verificationJson" FROM "StudioMediaSourceRevision" WHERE "id"=$1 FOR UPDATE`,
        values: [input.job.source.sourceRevisionId],
      });
      const sourceRow = source.rows[0];
      if (
        !sourceRow ||
        (sourceRow.contentSha256 &&
          sourceRow.contentSha256 !== input.receipt.output.sha256)
      ) {
        throw new GoogleDriveMaterializationTerminalError(
          "drive-materialization-source-checksum-conflict",
          "The source revision is already bound to different exact bytes.",
        );
      }
      const updated = await client.query({
        text: `UPDATE "StudioWorkflowJob" SET "status"='output-ready', "updatedAt"=timezone('UTC',$3::timestamptz), "completedAt"=timezone('UTC',$3::timestamptz), "error"=NULL, "resultJson"=$4::jsonb WHERE "id"=$1 AND "status"='processing' AND "resultJson"->'lease'->>'executionId'=$2`,
        values: [
          input.claim.id,
          input.claim.executionId,
          input.now,
          JSON.stringify({
            state: "output-ready",
            receipt: input.receipt,
            progress: {
              transferredBytes: input.receipt.output.sizeBytes,
              totalBytes: input.receipt.output.sizeBytes,
              updatedAt: input.now.toISOString(),
            },
            originalRemainsInDrive: true,
          }),
        ],
      });
      if (updated.rowCount !== 1) {
        await client.query("ROLLBACK");
        return false;
      }
      await client.query({
        text: `
          INSERT INTO "StudioMediaSourceReplica" (
            "id","projectId","sourceRevisionId","workflowJobId","storageProvider","custodianNodeId","storageScopeId","locator","generation",
            "contentSha256","checksumMd5","sizeBytes","mimeType","status","verificationJson","provenanceJson",
            "availabilityCheckedAt","contentVerifiedAt","unavailableAt","createdByUserId","createdAt"
          ) VALUES ($1,$2,$3,$4,'local-cache',$5,$6,$7,$8,$9,$10,$11,$12,'ready',$13::jsonb,$14::jsonb,$16,$16,NULL,$15,$16)
          ON CONFLICT ("id") DO UPDATE SET
            "status"='ready',
            "availabilityCheckedAt"=EXCLUDED."availabilityCheckedAt",
            "contentVerifiedAt"=EXCLUDED."contentVerifiedAt",
            "unavailableAt"=NULL,
            "verificationJson"=EXCLUDED."verificationJson",
            "provenanceJson"=EXCLUDED."provenanceJson"
          WHERE "StudioMediaSourceReplica"."projectId"=EXCLUDED."projectId"
            AND "StudioMediaSourceReplica"."sourceRevisionId"=EXCLUDED."sourceRevisionId"
            AND "StudioMediaSourceReplica"."workflowJobId"=EXCLUDED."workflowJobId"
            AND "StudioMediaSourceReplica"."storageProvider"=EXCLUDED."storageProvider"
            AND "StudioMediaSourceReplica"."custodianNodeId"=EXCLUDED."custodianNodeId"
            AND "StudioMediaSourceReplica"."storageScopeId"=EXCLUDED."storageScopeId"
            AND "StudioMediaSourceReplica"."locator"=EXCLUDED."locator"
            AND "StudioMediaSourceReplica"."generation"=EXCLUDED."generation"
            AND "StudioMediaSourceReplica"."contentSha256"=EXCLUDED."contentSha256"
            AND "StudioMediaSourceReplica"."sizeBytes"=EXCLUDED."sizeBytes"
        `,
        values: [
          input.job.replicaId,
          input.job.projectId,
          input.job.source.sourceRevisionId,
          input.job.jobId,
          input.job.target.custodianNodeId,
          input.job.target.storageScopeId,
          input.receipt.output.locator,
          input.receipt.output.generation,
          input.receipt.output.sha256,
          input.receipt.output.md5,
          input.receipt.output.sizeBytes,
          input.receipt.output.contentType,
          JSON.stringify({
            schema: "quipsly-media-source-replica-verification-v1",
            source: input.receipt.source,
            output: input.receipt.output,
            transfer: input.receipt.transfer,
            custodianNodeId: input.receipt.worker.custodianNodeId,
            storageScopeId: input.receipt.worker.storageScopeId,
            originalRemainsInDrive: true,
          }),
          JSON.stringify({
            schema: "quipsly-media-source-replica-provenance-v1",
            jobId: input.job.jobId,
            worker: input.receipt.worker,
          }),
          input.job.actorUserId,
          input.now,
        ],
      });
      const retainedReplica = await client.query({
        text: `
          SELECT "projectId","sourceRevisionId","workflowJobId","storageProvider","locator","generation",
                 "custodianNodeId","storageScopeId","contentSha256","checksumMd5","sizeBytes","mimeType","status","createdByUserId"
          FROM "StudioMediaSourceReplica" WHERE "id"=$1
        `,
        values: [input.job.replicaId],
      });
      const replicaRow = retainedReplica.rows[0];
      if (
        !replicaRow ||
        replicaRow.projectId !== input.job.projectId ||
        replicaRow.sourceRevisionId !== input.job.source.sourceRevisionId ||
        replicaRow.workflowJobId !== input.job.jobId ||
        replicaRow.storageProvider !== "local-cache" ||
        replicaRow.custodianNodeId !== input.job.target.custodianNodeId ||
        replicaRow.storageScopeId !== input.job.target.storageScopeId ||
        replicaRow.locator !== input.receipt.output.locator ||
        replicaRow.generation !== input.receipt.output.generation ||
        replicaRow.contentSha256 !== input.receipt.output.sha256 ||
        replicaRow.checksumMd5 !== input.receipt.output.md5 ||
        Number(replicaRow.sizeBytes) !== input.receipt.output.sizeBytes ||
        replicaRow.mimeType !== input.receipt.output.contentType ||
        replicaRow.status !== "ready" ||
        replicaRow.createdByUserId !== input.job.actorUserId
      ) {
        throw new GoogleDriveMaterializationTerminalError(
          "drive-materialization-replica-conflict",
          "A retained replica with this stable identity does not match the verified provider bytes.",
        );
      }
      const priorVerification = asRecord(sourceRow.verificationJson);
      await client.query({
        text: `UPDATE "StudioMediaSourceRevision" SET "contentSha256"=$2, "sourceState"='checksum-bound', "verifiedAt"=timezone('UTC',$3::timestamptz), "verificationJson"=$4::jsonb WHERE "id"=$1`,
        values: [
          input.job.source.sourceRevisionId,
          input.receipt.output.sha256,
          input.now,
          JSON.stringify({
            ...priorVerification,
            state: "checksum-bound",
            sha256Bound: true,
            exactReplica: {
              replicaId: input.job.replicaId,
              storageProvider: "local-cache",
              generation: input.receipt.output.generation,
              verifiedAt: input.now.toISOString(),
            },
          }),
        ],
      });

      if (input.job.source.memberRole === "browse-proxy") {
        const proxyIdentity = externalSourceProxyIdentity({
          projectId: input.job.projectId,
          sourceRevisionId: input.job.source.sourceRevisionId,
          identitySha256: input.job.source.identitySha256,
          custodianNodeId: input.job.target.custodianNodeId,
          storageScopeId: input.job.target.storageScopeId,
        });
        const proxyJobId = externalSourceProxyJobId(proxyIdentity);
        const proxyDerivativeId =
          externalSourceProxyDerivativeId(proxyIdentity);
        const proxyManifest = newExternalSourceProxyJob({
          jobId: proxyJobId,
          derivativeId: proxyDerivativeId,
          projectId: input.job.projectId,
          projectSlug: input.job.projectSlug,
          actorUserId: input.job.actorUserId,
          actorEmail: input.job.actorEmail,
          queuedAt: input.now.toISOString(),
          source: {
            provider: "google-drive",
            externalReferenceId: input.job.source.externalReferenceId,
            sourceRevisionId: input.job.source.sourceRevisionId,
            revisionKey: input.job.source.headRevisionKey,
            identitySha256: input.job.source.identitySha256,
            expectedContentSha256: input.receipt.output.sha256,
            expectedSizeBytes: input.receipt.output.sizeBytes,
            contentType: input.job.source.contentType,
          },
          target: {
            provider: "local",
            locator: buildExternalSourceProxyTargetLocator({
              projectSlug: input.job.projectSlug,
              sourceRevisionId: input.job.source.sourceRevisionId,
              identitySha256: input.job.source.identitySha256,
            }),
            contentType: "video/mp4",
            profile: EXTERNAL_SOURCE_PROXY_PROFILE,
          },
        });
        await client.query({
          text: `
            INSERT INTO "StudioWorkflowJob" (
              "id","projectId","type","status","source","priority","inputJson","resultJson","requestedByEmail","createdAt","updatedAt"
            ) VALUES ($1,$2,$3,'queued',$4,70,$5::jsonb,$6::jsonb,$7,$8,$8)
            ON CONFLICT ("id") DO NOTHING
          `,
          values: [
            proxyJobId,
            input.job.projectId,
            PROXY_JOB_TYPE,
            PROXY_JOB_SOURCE,
            JSON.stringify(proxyManifest),
            JSON.stringify({
              state: "queued",
              executionTarget: {
                custodianNodeId: input.job.target.custodianNodeId,
                storageScopeId: input.job.target.storageScopeId,
              },
              requestedBy: {
                actorUserId: input.job.actorUserId,
                actorEmail: input.job.actorEmail,
                materializationJobId: input.job.jobId,
              },
              originalRemainsSourceTruth: true,
            }),
            input.job.actorEmail,
            input.now,
          ],
        });
        const retainedProxy = await client.query({
          text: `SELECT "inputJson" FROM "StudioWorkflowJob" WHERE "id"=$1`,
          values: [proxyJobId],
        });
        const retainedProxyManifest = parseExternalSourceProxyJob(
          retainedProxy.rows[0]?.inputJson,
          proxyJobId,
        );
        assertRetainedProxyMatches(proxyManifest, retainedProxyManifest);
      }
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async retry(input: {
    claim: LocalGoogleDriveMaterializationClaim;
    code: string;
    message: string;
    now: Date;
  }) {
    return this.release(input, "queued");
  }

  async fail(input: {
    claim: LocalGoogleDriveMaterializationClaim;
    code: string;
    message: string;
    now: Date;
  }) {
    return this.release(input, "failed");
  }

  private async release(
    input: {
      claim: LocalGoogleDriveMaterializationClaim;
      code: string;
      message: string;
      now: Date;
    },
    status: "queued" | "failed",
  ) {
    const current = await this.pool.query({
      text: `SELECT "resultJson" FROM "StudioWorkflowJob" WHERE "id"=$1`,
      values: [input.claim.id],
    });
    const previous = asRecord(current.rows[0]?.resultJson);
    const result = await this.pool.query({
      text: `UPDATE "StudioWorkflowJob" SET "status"=$3, "updatedAt"=timezone('UTC',$4::timestamptz), "completedAt"=CASE WHEN $3='failed' THEN timezone('UTC',$4::timestamptz) ELSE NULL END, "error"=$5, "resultJson"=$6::jsonb WHERE "id"=$1 AND "status"='processing' AND "resultJson"->'lease'->>'executionId'=$2`,
      values: [
        input.claim.id,
        input.claim.executionId,
        status,
        input.now,
        `${input.code}: ${input.message}`.slice(0, 4_000),
        JSON.stringify({
          ...previous,
          state: status,
          failure: {
            code: input.code,
            message: input.message,
            failedAt: input.now.toISOString(),
            attempt: input.claim.attempt,
          },
          lease: {
            executionId: input.claim.executionId,
            attempt: input.claim.attempt,
          },
          originalRemainsInDrive: true,
        }),
      ],
    });
    return result.rowCount === 1;
  }
}

export class GoogleDriveApiMaterializationProvider implements GoogleDriveMaterializationProvider {
  private readonly encryptionKey: Buffer | null;
  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor(
    environment: NodeJS.ProcessEnv = process.env,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    const encodedKey =
      environment.GOOGLE_DRIVE_OAUTH_TOKEN_ENCRYPTION_KEY?.trim() || "";
    const decodedKey = encodedKey
      ? Buffer.from(encodedKey, "base64url")
      : Buffer.alloc(0);
    this.encryptionKey = decodedKey.length === 32 ? decodedKey : null;
    this.clientId = environment.GOOGLE_DRIVE_OAUTH_CLIENT_ID?.trim() || "";
    this.clientSecret =
      environment.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET?.trim() || "";
  }

  async inspect(input: {
    resolved: ResolvedGoogleDriveMaterialization;
    job: GoogleDriveSourceMaterializationJob;
  }) {
    const accessToken = await this.accessToken(input.resolved);
    const url = new URL(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(input.job.source.externalFileId)}`,
    );
    url.searchParams.set("supportsAllDrives", "true");
    url.searchParams.set(
      "fields",
      "id,size,headRevisionId,md5Checksum,capabilities(canDownload)",
    );
    const response = await this.fetchImpl(url, {
      headers: driveHeaders(input.job, accessToken),
    });
    const body = (await response.json().catch(() => null)) as {
      id?: unknown;
      size?: unknown;
      headRevisionId?: unknown;
      md5Checksum?: unknown;
      capabilities?: { canDownload?: unknown };
    } | null;
    if (!response.ok || !body) throw providerHttpError(response.status);
    const md5 = typeof body.md5Checksum === "string" ? body.md5Checksum : "";
    return {
      externalFileId: typeof body.id === "string" ? body.id : "",
      headRevisionKey:
        typeof body.headRevisionId === "string"
          ? body.headRevisionId
          : md5
            ? `md5:${md5}`
            : "",
      md5: md5.toLowerCase(),
      sizeBytes: Number(body.size),
      canDownload: body.capabilities?.canDownload === true,
    };
  }

  async download(input: {
    resolved: ResolvedGoogleDriveMaterialization;
    job: GoogleDriveSourceMaterializationJob;
    destinationPath: string;
    resumeFromBytes: number;
    signal?: AbortSignal;
    onProgress: (transferredBytes: number) => Promise<void>;
  }) {
    const accessToken = await this.accessToken(input.resolved);
    const url = new URL(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(input.job.source.externalFileId)}`,
    );
    url.searchParams.set("alt", "media");
    url.searchParams.set("supportsAllDrives", "true");
    const response = await this.fetchImpl(url, {
      signal: input.signal,
      headers: {
        ...driveHeaders(input.job, accessToken),
        ...(input.resumeFromBytes > 0
          ? { Range: `bytes=${input.resumeFromBytes}-` }
          : {}),
      },
    });
    if (!response.ok || !response.body)
      throw providerHttpError(response.status);
    let resumedFromBytes = 0;
    if (input.resumeFromBytes > 0 && response.status === 206) {
      const contentRange = response.headers.get("content-range") || "";
      if (
        !contentRange.startsWith(`bytes ${input.resumeFromBytes}-`) ||
        !contentRange.endsWith(`/${input.job.source.expectedSizeBytes}`)
      ) {
        throw new GoogleDriveMaterializationRetryError(
          "drive-materialization-range-mismatch",
          "Drive returned a resume range that does not match the retained byte count.",
        );
      }
      resumedFromBytes = input.resumeFromBytes;
    } else if (response.status !== 200) {
      throw new GoogleDriveMaterializationRetryError(
        "drive-materialization-http-status",
        `Drive returned HTTP ${response.status} for the byte transfer.`,
      );
    }
    const output = createWriteStream(input.destinationPath, {
      flags: resumedFromBytes ? "a" : "w",
      mode: 0o600,
    });
    let downloadedBytes = 0;
    let lastProgressAt = 0;
    const progress = new Transform({
      transform(chunk, _encoding, callback) {
        downloadedBytes += chunk.length;
        const now = Date.now();
        if (
          now - lastProgressAt >= 1_500 ||
          resumedFromBytes + downloadedBytes ===
            input.job.source.expectedSizeBytes
        ) {
          lastProgressAt = now;
          void input
            .onProgress(resumedFromBytes + downloadedBytes)
            .then(() => callback(null, chunk))
            .catch((error) => callback(error));
        } else {
          callback(null, chunk);
        }
      },
    });
    await pipeline(response.body, progress, output);
    return {
      resumedFromBytes,
      downloadedBytes,
      providerRequestCount: 1,
    };
  }

  private async accessToken(resolved: ResolvedGoogleDriveMaterialization) {
    if (!this.encryptionKey || !this.clientId || !this.clientSecret) {
      throw new GoogleDriveMaterializationTerminalError(
        "drive-materialization-worker-unconfigured",
        "The local media worker needs its Drive OAuth client and encryption key before it can download attached sources.",
      );
    }
    let refreshToken: string;
    try {
      refreshToken = decryptGoogleDriveRefreshCredential(
        resolved.encryptedCredential,
        this.encryptionKey,
      );
    } catch {
      throw new GoogleDriveMaterializationTerminalError(
        "drive-materialization-credential-invalid",
        "The encrypted Drive credential could not be read by the worker.",
      );
    }
    try {
      return (
        await refreshGoogleDriveWorkerAccessToken({
          refreshToken,
          clientId: this.clientId,
          clientSecret: this.clientSecret,
          fetchImpl: this.fetchImpl,
        })
      ).accessToken;
    } catch (error) {
      const message = detail(error, "Drive token refresh failed.");
      if (message.includes("invalid_grant")) {
        throw new GoogleDriveMaterializationTerminalError(
          "drive-materialization-needs-reauth",
          "Google Drive access expired or was revoked. Reconnect it before retrying.",
        );
      }
      throw new GoogleDriveMaterializationRetryError(
        "drive-materialization-token-refresh",
        message,
      );
    }
  }
}

export function newLocalGoogleDriveMaterializationRuntime(input: {
  pool: Pool;
  executionId: string;
  custodianNodeId: string;
  storageScopeId: string;
  localMediaRoot: string;
  leaseMs: number;
  buildId: string;
  signal?: AbortSignal;
  environment?: NodeJS.ProcessEnv;
  provider?: GoogleDriveMaterializationProvider;
}) {
  const environment = input.environment ?? process.env;
  const configuredMinFree = Number(
    environment.QUIPSLY_DRIVE_CACHE_MIN_FREE_BYTES,
  );
  return {
    store: new PostgresLocalGoogleDriveMaterializationStore(input.pool),
    provider:
      input.provider ?? new GoogleDriveApiMaterializationProvider(environment),
    options: {
      executionId: input.executionId,
      custodianNodeId: input.custodianNodeId,
      storageScopeId: input.storageScopeId,
      buildId: input.buildId,
      leaseMs: input.leaseMs,
      localMediaRoot: input.localMediaRoot,
      minFreeBytes:
        Number.isSafeInteger(configuredMinFree) && configuredMinFree >= 0
          ? configuredMinFree
          : DEFAULT_MIN_FREE_BYTES,
      signal: input.signal,
      now: () => new Date(),
    } satisfies LocalGoogleDriveMaterializationOptions,
  };
}

function assertResolved(
  job: GoogleDriveSourceMaterializationJob,
  resolved: ResolvedGoogleDriveMaterialization,
) {
  if (
    resolved.projectId !== job.projectId ||
    resolved.projectSlug !== job.projectSlug ||
    resolved.referenceId !== job.source.externalReferenceId ||
    resolved.sourceRevisionId !== job.source.sourceRevisionId ||
    resolved.revisionKey !== job.source.headRevisionKey ||
    resolved.identitySha256 !== job.source.identitySha256 ||
    resolved.sizeBytes !== job.source.expectedSizeBytes ||
    resolved.provider !== "google-drive" ||
    resolved.connectionId !== job.source.connectionId ||
    resolved.connectionStatus !== "verified" ||
    resolved.accessState !== "available" ||
    resolved.capabilityState !== "downloadable" ||
    !resolved.encryptedCredential
  ) {
    throw new GoogleDriveMaterializationTerminalError(
      "drive-materialization-source-binding-changed",
      "The attached Drive source no longer matches the queued exact-revision contract.",
    );
  }
}

function assertProviderMetadata(
  job: GoogleDriveSourceMaterializationJob,
  metadata: GoogleDriveProviderMetadata,
) {
  if (
    metadata.externalFileId !== job.source.externalFileId ||
    metadata.headRevisionKey !== job.source.headRevisionKey ||
    metadata.md5 !== job.source.expectedMd5 ||
    metadata.sizeBytes !== job.source.expectedSizeBytes ||
    !metadata.canDownload
  ) {
    throw new GoogleDriveMaterializationTerminalError(
      "drive-materialization-provider-revision-changed",
      "Drive no longer reports the exact revision, checksum, size, and download capability that Quipsly attached.",
    );
  }
}

function assertRetainedProxyMatches(
  expected: ReturnType<typeof newExternalSourceProxyJob>,
  retained: ReturnType<typeof parseExternalSourceProxyJob>,
) {
  if (
    retained.jobId !== expected.jobId ||
    retained.derivativeId !== expected.derivativeId ||
    retained.projectId !== expected.projectId ||
    retained.projectSlug !== expected.projectSlug ||
    retained.source.provider !== expected.source.provider ||
    retained.source.externalReferenceId !==
      expected.source.externalReferenceId ||
    retained.source.sourceRevisionId !== expected.source.sourceRevisionId ||
    retained.source.revisionKey !== expected.source.revisionKey ||
    retained.source.identitySha256 !== expected.source.identitySha256 ||
    retained.source.expectedContentSha256 !==
      expected.source.expectedContentSha256 ||
    retained.source.expectedSizeBytes !== expected.source.expectedSizeBytes ||
    retained.source.contentType !== expected.source.contentType ||
    retained.target.provider !== expected.target.provider ||
    retained.target.locator !== expected.target.locator ||
    retained.target.contentType !== expected.target.contentType ||
    retained.target.profile !== expected.target.profile
  ) {
    throw new GoogleDriveMaterializationTerminalError(
      "drive-materialization-proxy-conflict",
      "The stable collaboration-proxy job already exists with a different source contract.",
    );
  }
}

async function authorizedCacheRoot(configuredRoot: string) {
  const root = path.resolve(configuredRoot);
  await mkdir(root, { recursive: true, mode: 0o700 });
  return realpath(root);
}

function authorizedTargetPath(root: string, locator: string) {
  const output = path.resolve(root, locator);
  const relative = path.relative(root, output);
  if (
    !relative ||
    relative.startsWith("..") ||
    path.isAbsolute(relative) ||
    !/\.(?:insv|lrv|mp4)$/i.test(output)
  ) {
    throw new GoogleDriveMaterializationTerminalError(
      "drive-materialization-target-path-rejected",
      "The provider-cache target escaped its dedicated media root or used an unsupported camera-package extension.",
    );
  }
  return output;
}

async function assertCapacity(
  root: string,
  remainingBytes: number,
  reserve: number,
) {
  const details = await statfs(root);
  const freeBytes = details.bavail * details.bsize;
  if (freeBytes < remainingBytes + reserve) {
    throw new GoogleDriveMaterializationTerminalError(
      "drive-materialization-storage-pressure",
      `The local media cache needs ${remainingBytes + reserve} free bytes before starting this transfer.`,
    );
  }
}

async function flushFile(filePath: string) {
  const handle = await open(filePath, "r+");
  try {
    await handle.sync();
    await handle.chmod(0o600);
  } finally {
    await handle.close();
  }
}

async function hashFile(filePath: string) {
  const sha256 = createHash("sha256");
  const md5 = createHash("md5");
  let sizeBytes = 0;
  for await (const chunk of createReadStream(filePath)) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    sizeBytes += bytes.length;
    sha256.update(bytes);
    md5.update(bytes);
  }
  return {
    sizeBytes,
    sha256: sha256.digest("hex"),
    md5: md5.digest("hex"),
  };
}

function driveHeaders(
  job: GoogleDriveSourceMaterializationJob,
  accessToken: string,
) {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
    ...(job.source.resourceKey
      ? {
          "X-Goog-Drive-Resource-Keys": `${job.source.externalFileId}/${job.source.resourceKey}`,
        }
      : {}),
  };
}

function providerHttpError(status: number) {
  if (status === 401 || status === 403 || status === 404) {
    return new GoogleDriveMaterializationTerminalError(
      `drive-materialization-provider-http-${status}`,
      status === 401
        ? "Google Drive access expired before the source could be downloaded."
        : status === 403
          ? "Google Drive refused download access for the attached source."
          : "The attached Drive source is no longer available.",
    );
  }
  return new GoogleDriveMaterializationRetryError(
    `drive-materialization-provider-http-${status}`,
    `Google Drive returned HTTP ${status}.`,
  );
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function detail(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : fallback;
}
