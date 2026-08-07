import "server-only";

import { createHash } from "node:crypto";

import {
  GOOGLE_DRIVE_SOURCE_MATERIALIZATION_PROFILE,
  googleDriveSourceMaterializationIdentity,
  newGoogleDriveSourceMaterializationJob,
  parseGoogleDriveSourceMaterializationJob,
} from "@high-ground/quipsly-media-processing";
import type { PrismaClient } from "@prisma/client";

export const GOOGLE_DRIVE_SOURCE_MATERIALIZATION_JOB_TYPE =
  "google-drive-source-materialization";
export const GOOGLE_DRIVE_SOURCE_MATERIALIZATION_JOB_SOURCE =
  "source-story.google-drive-materialization";

const DEFAULT_MAX_FILE_BYTES = 64 * 1024 * 1024 * 1024;

export class GoogleDriveSourceMaterializationRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "GoogleDriveSourceMaterializationRequestError";
  }
}

function cleanId(value: unknown, field: string) {
  const result = typeof value === "string" ? value.trim() : "";
  if (!/^[A-Za-z0-9:_-]{8,200}$/.test(result)) {
    throw new GoogleDriveSourceMaterializationRequestError(
      "invalid-id",
      `${field} is malformed.`,
    );
  }
  return result;
}

function requestId(value: unknown) {
  const result = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      result,
    )
  ) {
    throw new GoogleDriveSourceMaterializationRequestError(
      "invalid-request-id",
      "The request identity must be a UUID.",
    );
  }
  return result;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function deterministicId(prefix: string, identity: string) {
  return `${prefix}_${createHash("sha256").update(identity).digest("hex").slice(0, 48)}`;
}

function safeBytes(value: bigint | null) {
  if (!value || value <= BigInt(0) || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    return 0;
  }
  return Number(value);
}

function configuredMaxBytes(environment: NodeJS.ProcessEnv) {
  const configured = Number(environment.QUIPSLY_DRIVE_CACHE_MAX_FILE_BYTES);
  return Number.isSafeInteger(configured) && configured >= 1024 * 1024
    ? configured
    : DEFAULT_MAX_FILE_BYTES;
}

export function publicGoogleDriveSourceMaterializationJob(job: {
  id: string;
  status: string;
  resultJson: unknown;
  error: string | null;
  updatedAt: Date;
}) {
  const result = object(job.resultJson);
  const failure = object(result.failure);
  const progress = object(result.progress);
  return {
    id: job.id,
    status: job.status,
    failureCode:
      typeof failure.code === "string" ? failure.code : null,
    transferredBytes:
      typeof progress.transferredBytes === "number"
        ? progress.transferredBytes
        : null,
    totalBytes:
      typeof progress.totalBytes === "number" ? progress.totalBytes : null,
    updatedAt: job.updatedAt.toISOString(),
  };
}

export async function requestGoogleDriveSourceMaterialization(input: {
  prisma: PrismaClient;
  projectId: string;
  referenceId: string;
  sourceRevisionId: string;
  actorUserId: string;
  actorEmail: string;
  clientRequestId: string;
  retryFailed?: boolean;
  environment?: NodeJS.ProcessEnv;
}) {
  const projectId = cleanId(input.projectId, "projectId");
  const referenceId = cleanId(input.referenceId, "referenceId");
  const sourceRevisionId = cleanId(
    input.sourceRevisionId,
    "sourceRevisionId",
  );
  const actorUserId = cleanId(input.actorUserId, "actorUserId");
  const clientRequestId = requestId(input.clientRequestId);
  const actorEmail = input.actorEmail.trim().toLowerCase();
  const source = await input.prisma.studioMediaSourceRevision.findFirst({
    where: {
      id: sourceRevisionId,
      projectId,
      externalReferenceId: referenceId,
    },
    include: {
      project: { select: { slug: true } },
      externalReference: {
        include: {
          connection: {
            select: { id: true, userId: true, provider: true, status: true },
          },
        },
      },
      replicas: {
        where: { storageProvider: "local-cache", status: "ready" },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
  if (!source?.externalReference) {
    throw new GoogleDriveSourceMaterializationRequestError(
      "source-not-found",
      "That exact Drive source revision is unavailable in this Nest.",
      404,
    );
  }
  if (source.replicas[0]) {
    return {
      replica: source.replicas[0],
      job: null,
      replayed: true,
      state: "ready" as const,
    };
  }
  const reference = source.externalReference;
  const connection = reference.connection;
  if (
    reference.provider !== "google-drive" ||
    !connection ||
    connection.provider !== "google-drive" ||
    connection.userId !== actorUserId
  ) {
    throw new GoogleDriveSourceMaterializationRequestError(
      "drive-connection-mismatch",
      "The attached Drive source is not owned by this signed-in connection.",
      403,
    );
  }
  if (connection.status !== "verified") {
    throw new GoogleDriveSourceMaterializationRequestError(
      "drive-needs-reauth",
      "Reconnect Google Drive before preparing this source.",
      409,
    );
  }
  if (
    reference.accessState !== "available" ||
    reference.capabilityState !== "downloadable"
  ) {
    throw new GoogleDriveSourceMaterializationRequestError(
      "source-access-held",
      "Google Drive no longer reports download access for this source.",
      409,
    );
  }
  const projection = object(source.projectionJson);
  if (
    projection.memberRole !== "browse-proxy" ||
    source.mediaProjection !== "equirectangular"
  ) {
    throw new GoogleDriveSourceMaterializationRequestError(
      "browse-proxy-required",
      "Prepare the lightweight Insta360 LRV member for browsing. Full-resolution originals remain deferred until conform or export.",
      409,
    );
  }
  const verification = object(source.verificationJson);
  const providerChecksum = object(verification.providerChecksum);
  const expectedMd5 =
    providerChecksum.algorithm === "md5" &&
    typeof providerChecksum.value === "string"
      ? providerChecksum.value.toLowerCase()
      : "";
  const locator = object(reference.providerLocatorJson);
  const externalFileId =
    typeof locator.externalFileId === "string" ? locator.externalFileId : "";
  const resourceKey =
    typeof locator.resourceKey === "string" && locator.resourceKey.trim()
      ? locator.resourceKey.trim()
      : null;
  const sizeBytes = safeBytes(source.sizeBytes);
  if (
    !source.revisionKey ||
    !/^[0-9a-f]{32}$/.test(expectedMd5) ||
    !/^[A-Za-z0-9._-]{1,512}$/.test(externalFileId) ||
    (resourceKey !== null &&
      !/^[A-Za-z0-9._-]{1,512}$/.test(resourceKey)) ||
    !sizeBytes
  ) {
    throw new GoogleDriveSourceMaterializationRequestError(
      "provider-revision-insufficient",
      "Drive must provide an exact revision, byte count, and MD5 before Quipsly downloads a browsing replica.",
      409,
    );
  }
  if (sizeBytes > configuredMaxBytes(input.environment ?? process.env)) {
    throw new GoogleDriveSourceMaterializationRequestError(
      "source-exceeds-cache-limit",
      "This LRV exceeds the configured local-cache file limit. Increase the reviewed limit or choose a smaller browsing member.",
      409,
    );
  }
  if (!reference.mimeType?.startsWith("video/")) {
    throw new GoogleDriveSourceMaterializationRequestError(
      "video-required",
      "The current Drive materializer accepts video browsing members only.",
      409,
    );
  }

  const identity = googleDriveSourceMaterializationIdentity({
    projectId,
    sourceRevisionId,
    identitySha256: source.identitySha256,
  });
  const jobId = deterministicId("gdmjob", identity);
  const replicaId = deterministicId("gdmreplica", identity);
  const targetLocator = [
    "source-cache",
    "google-drive",
    source.project.slug,
    sourceRevisionId,
    `${GOOGLE_DRIVE_SOURCE_MATERIALIZATION_PROFILE}-${source.identitySha256.slice(0, 20)}.lrv`,
  ].join("/");
  const manifest = newGoogleDriveSourceMaterializationJob({
    jobId,
    replicaId,
    projectId,
    projectSlug: source.project.slug,
    actorUserId,
    actorEmail,
    queuedAt: new Date().toISOString(),
    source: {
      provider: "google-drive",
      connectionId: connection.id,
      externalReferenceId: reference.id,
      sourceRevisionId: source.id,
      externalFileId,
      resourceKey,
      headRevisionKey: source.revisionKey,
      identitySha256: source.identitySha256,
      expectedMd5,
      expectedSizeBytes: sizeBytes,
      contentType: reference.mimeType,
      memberRole: "browse-proxy",
    },
    target: {
      provider: "local-cache",
      locator: targetLocator,
      profile: GOOGLE_DRIVE_SOURCE_MATERIALIZATION_PROFILE,
    },
  });
  const existing = await input.prisma.studioWorkflowJob.findUnique({
    where: { id: jobId },
  });
  if (existing) {
    let retainedManifest;
    try {
      retainedManifest = parseGoogleDriveSourceMaterializationJob(
        existing.inputJson,
        jobId,
      );
    } catch {
      throw new GoogleDriveSourceMaterializationRequestError(
        "job-identity-conflict",
        "The durable Drive materialization identity is bound to different source intent.",
        409,
      );
    }
    if (
      retainedManifest.replicaId !== manifest.replicaId ||
      retainedManifest.projectId !== manifest.projectId ||
      retainedManifest.projectSlug !== manifest.projectSlug ||
      retainedManifest.source.connectionId !== manifest.source.connectionId ||
      retainedManifest.source.externalReferenceId !==
        manifest.source.externalReferenceId ||
      retainedManifest.source.sourceRevisionId !==
        manifest.source.sourceRevisionId ||
      retainedManifest.source.externalFileId !== manifest.source.externalFileId ||
      retainedManifest.source.resourceKey !== manifest.source.resourceKey ||
      retainedManifest.source.headRevisionKey !== manifest.source.headRevisionKey ||
      retainedManifest.source.identitySha256 !== manifest.source.identitySha256 ||
      retainedManifest.source.expectedMd5 !== manifest.source.expectedMd5 ||
      retainedManifest.source.expectedSizeBytes !==
        manifest.source.expectedSizeBytes ||
      retainedManifest.source.contentType !== manifest.source.contentType ||
      retainedManifest.target.provider !== manifest.target.provider ||
      retainedManifest.target.locator !== manifest.target.locator ||
      retainedManifest.target.profile !== manifest.target.profile
    ) {
      throw new GoogleDriveSourceMaterializationRequestError(
        "job-identity-conflict",
        "The durable Drive materialization identity is bound to different source intent.",
        409,
      );
    }
    if (existing.status === "failed" && input.retryFailed) {
      const prior = object(existing.resultJson);
      const failureHistory = Array.isArray(prior.failureHistory)
        ? prior.failureHistory
        : [];
      const priorFailure = object(prior.failure);
      const retried = await input.prisma.studioWorkflowJob.update({
        where: { id: jobId },
        data: {
          status: "queued",
          error: null,
          completedAt: null,
          resultJson: {
            state: "queued",
            requestedBy: { actorUserId, actorEmail, clientRequestId },
            failureHistory: Object.keys(priorFailure).length
              ? [...failureHistory, priorFailure]
              : failureHistory,
            originalRemainsInDrive: true,
          },
        },
      });
      return {
        replica: null,
        job: retried,
        replayed: false,
        state: "queued" as const,
      };
    }
    return {
      replica: null,
      job: existing,
      replayed: true,
      state: existing.status,
    };
  }
  const job = await input.prisma.studioWorkflowJob.create({
    data: {
      id: jobId,
      projectId,
      type: GOOGLE_DRIVE_SOURCE_MATERIALIZATION_JOB_TYPE,
      source: GOOGLE_DRIVE_SOURCE_MATERIALIZATION_JOB_SOURCE,
      status: "queued",
      priority: 60,
      inputJson: manifest,
      resultJson: {
        state: "queued",
        requestedBy: { actorUserId, actorEmail, clientRequestId },
        originalRemainsInDrive: true,
      },
      requestedByEmail: actorEmail,
    },
  });
  return {
    replica: null,
    job,
    replayed: false,
    state: "queued" as const,
  };
}
