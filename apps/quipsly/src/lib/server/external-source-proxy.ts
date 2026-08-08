import "server-only";

import {
  EXTERNAL_SOURCE_PROXY_PROFILE,
  newExternalSourceProxyJob,
  parseExternalSourceProxyJob,
} from "@high-ground/quipsly-media-processing";
import {
  buildExternalSourceProxyTargetLocator,
  externalSourceProxyDerivativeId,
  externalSourceProxyIdentity,
  externalSourceProxyJobId,
} from "@high-ground/quipsly-media-processing/external-source-proxy-identity";
import type { PrismaClient } from "@prisma/client";

import { readLocalExecutorTarget } from "@/lib/server/local-executor-storage";

export const EXTERNAL_SOURCE_PROXY_JOB_TYPE = "external-source-proxy";
export const EXTERNAL_SOURCE_PROXY_JOB_SOURCE = "source-story.external-proxy";

export class ExternalSourceProxyRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "ExternalSourceProxyRequestError";
  }
}

function cleanId(value: unknown, field: string) {
  const result = typeof value === "string" ? value.trim() : "";
  if (!/^[A-Za-z0-9:_-]{8,200}$/.test(result)) {
    throw new ExternalSourceProxyRequestError(
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
    throw new ExternalSourceProxyRequestError(
      "invalid-request-id",
      "The request identity must be a UUID.",
    );
  }
  return result;
}

function safeNumber(value: bigint | null) {
  if (!value || value <= BigInt(0) || value > BigInt(Number.MAX_SAFE_INTEGER))
    return 0;
  return Number(value);
}

export async function requestExternalSourceProxy(input: {
  prisma: PrismaClient;
  projectId: string;
  referenceId: string;
  sourceRevisionId: string;
  actorUserId: string;
  actorEmail: string;
  clientRequestId: string;
  executorNodeId?: string | null;
  retryFailed?: boolean;
}) {
  const projectId = cleanId(input.projectId, "projectId");
  const referenceId = cleanId(input.referenceId, "referenceId");
  const sourceRevisionId = cleanId(input.sourceRevisionId, "sourceRevisionId");
  const actorUserId = cleanId(input.actorUserId, "actorUserId");
  const clientRequestId = requestId(input.clientRequestId);
  const actorEmail = input.actorEmail.trim().toLowerCase();
  const selectedExecutor = await readLocalExecutorTarget(
    input.prisma,
    input.executorNodeId,
  );
  const source = await input.prisma.studioMediaSourceRevision.findFirst({
    where: {
      id: sourceRevisionId,
      projectId,
      externalReferenceId: referenceId,
    },
    include: {
      project: { select: { slug: true } },
      externalReference: {
        select: {
          id: true,
          provider: true,
          fileName: true,
          mimeType: true,
          accessState: true,
          capabilityState: true,
        },
      },
      derivatives: {
        where: {
          kind: "collaboration-proxy",
          profile: EXTERNAL_SOURCE_PROXY_PROFILE,
          status: "ready",
        },
        orderBy: { createdAt: "desc" },
        take: 12,
      },
      replicas: {
        where: { storageProvider: "local-cache", status: "ready" },
        orderBy: { createdAt: "desc" },
        take: 12,
      },
    },
  });
  if (!source?.externalReference) {
    throw new ExternalSourceProxyRequestError(
      "source-not-found",
      "That exact external source revision is unavailable in this Nest.",
      404,
    );
  }
  const reference = source.externalReference;
  const localReplica = ["google-drive", "quipsly-device-folder"].includes(
    reference.provider,
  )
    ? (source.replicas.find(
        (replica) =>
          selectedExecutor &&
          replica.custodianNodeId === selectedExecutor.nodeId &&
          replica.storageScopeId === selectedExecutor.storageScopeId,
      ) ?? null)
    : (source.replicas[0] ?? null);
  const executionTarget =
    localReplica?.custodianNodeId && localReplica.storageScopeId
      ? {
          custodianNodeId: localReplica.custodianNodeId,
          storageScopeId: localReplica.storageScopeId,
        }
      : null;
  if (!reference.mimeType?.startsWith("video/")) {
    throw new ExternalSourceProxyRequestError(
      "video-required",
      "This proxy profile currently requires a video source.",
    );
  }
  const exactLocalReplicaAvailable = Boolean(localReplica);
  const deviceReplicaBacked =
    reference.provider === "quipsly-device-folder" &&
    exactLocalReplicaAvailable;
  if (
    reference.accessState !== "available" ||
    (reference.capabilityState !== "downloadable" && !deviceReplicaBacked)
  ) {
    throw new ExternalSourceProxyRequestError(
      "source-access-held",
      "Reconnect or restore download access before creating a new proxy.",
      409,
    );
  }
  if (
    !source.contentSha256 ||
    !/^[0-9a-f]{64}$/.test(source.contentSha256) ||
    !safeNumber(source.sizeBytes)
  ) {
    throw new ExternalSourceProxyRequestError(
      "source-bytes-unverified",
      "The exact source bytes must be checksum-bound before local proxy generation.",
      409,
    );
  }
  const readyDerivative = ["google-drive", "quipsly-device-folder"].includes(
    reference.provider,
  )
    ? source.derivatives.find(
        (derivative) =>
          executionTarget &&
          derivative.custodianNodeId === executionTarget.custodianNodeId &&
          derivative.storageScopeId === executionTarget.storageScopeId,
      )
    : source.derivatives[0];
  if (readyDerivative) {
    return {
      derivative: readyDerivative,
      job: null,
      replayed: true,
      state: "ready" as const,
    };
  }
  if (
    reference.provider !== "local-file-vault" &&
    !(
      ["google-drive", "quipsly-device-folder"].includes(reference.provider) &&
      exactLocalReplicaAvailable
    )
  ) {
    throw new ExternalSourceProxyRequestError(
      "provider-executor-unavailable",
      "This source is attached, but its verified proxy executor is not active yet. The original and source identity remain safe.",
      409,
    );
  }
  if (
    ["google-drive", "quipsly-device-folder"].includes(reference.provider) &&
    !executionTarget
  ) {
    throw new ExternalSourceProxyRequestError(
      "provider-executor-unavailable",
      "The exact source replica has no verified local executor custody. Prepare it again on an active Mac before creating a proxy.",
      409,
    );
  }

  const identity = externalSourceProxyIdentity({
    projectId,
    sourceRevisionId,
    identitySha256: source.identitySha256,
    custodianNodeId: executionTarget?.custodianNodeId,
    storageScopeId: executionTarget?.storageScopeId,
  });
  const jobId = externalSourceProxyJobId(identity);
  const derivativeId = externalSourceProxyDerivativeId(identity);
  const locator = buildExternalSourceProxyTargetLocator({
    projectSlug: source.project.slug,
    sourceRevisionId,
    identitySha256: source.identitySha256,
  });
  const manifest = newExternalSourceProxyJob({
    jobId,
    derivativeId,
    projectId,
    projectSlug: source.project.slug,
    actorUserId,
    actorEmail,
    queuedAt: new Date().toISOString(),
    source: {
      provider: reference.provider,
      externalReferenceId: reference.id,
      sourceRevisionId: source.id,
      revisionKey: source.revisionKey,
      identitySha256: source.identitySha256,
      expectedContentSha256: source.contentSha256,
      expectedSizeBytes: Number(source.sizeBytes),
      contentType: reference.mimeType,
    },
    target: {
      provider: "local",
      locator,
      contentType: "video/mp4",
      profile: EXTERNAL_SOURCE_PROXY_PROFILE,
    },
  });

  const existing = await input.prisma.studioWorkflowJob.findUnique({
    where: { id: jobId },
  });
  if (existing) {
    try {
      parseExternalSourceProxyJob(existing.inputJson, jobId);
    } catch {
      throw new ExternalSourceProxyRequestError(
        "job-identity-conflict",
        "The durable proxy job identity is bound to different source intent.",
        409,
      );
    }
    if (existing.status === "failed" && input.retryFailed) {
      const previous =
        existing.resultJson &&
        typeof existing.resultJson === "object" &&
        !Array.isArray(existing.resultJson)
          ? (existing.resultJson as Record<string, unknown>)
          : {};
      const failures = Array.isArray(previous.failureHistory)
        ? previous.failureHistory
        : [];
      const failure =
        previous.failure && typeof previous.failure === "object"
          ? previous.failure
          : null;
      const retried = await input.prisma.studioWorkflowJob.update({
        where: { id: jobId },
        data: {
          status: "queued",
          error: null,
          completedAt: null,
          resultJson: {
            state: "queued",
            ...(executionTarget ? { executionTarget } : {}),
            requestedBy: { actorUserId, actorEmail, clientRequestId },
            failureHistory: failure ? [...failures, failure] : failures,
            originalRemainsSourceTruth: true,
          },
        },
      });
      return {
        derivative: null,
        job: retried,
        replayed: false,
        state: "queued" as const,
      };
    }
    if (["output-ready", "completed"].includes(existing.status)) {
      const previous =
        existing.resultJson &&
        typeof existing.resultJson === "object" &&
        !Array.isArray(existing.resultJson)
          ? (existing.resultJson as Record<string, unknown>)
          : {};
      const recoveryHistory = Array.isArray(previous.recoveryHistory)
        ? previous.recoveryHistory.slice(-9)
        : [];
      const recovered = await input.prisma.studioWorkflowJob.update({
        where: { id: jobId },
        data: {
          status: "queued",
          error: null,
          completedAt: null,
          resultJson: {
            state: "queued",
            ...(executionTarget ? { executionTarget } : {}),
            requestedBy: { actorUserId, actorEmail, clientRequestId },
            recoveryReason: "local-derivative-unavailable",
            recoveryHistory: [
              ...recoveryHistory,
              {
                priorStatus: existing.status,
                priorResult: previous,
                requestedAt: new Date().toISOString(),
              },
            ],
            originalRemainsSourceTruth: true,
          },
        },
      });
      return {
        derivative: null,
        job: recovered,
        replayed: false,
        state: "queued" as const,
      };
    }
    return {
      derivative: null,
      job: existing,
      replayed: true,
      state: existing.status,
    };
  }

  const job = await input.prisma.studioWorkflowJob.create({
    data: {
      id: jobId,
      projectId,
      type: EXTERNAL_SOURCE_PROXY_JOB_TYPE,
      source: EXTERNAL_SOURCE_PROXY_JOB_SOURCE,
      status: "queued",
      priority: 70,
      inputJson: manifest,
      resultJson: {
        state: "queued",
        ...(executionTarget ? { executionTarget } : {}),
        requestedBy: { actorUserId, actorEmail, clientRequestId },
        originalRemainsSourceTruth: true,
      },
      requestedByEmail: actorEmail,
    },
  });
  return { derivative: null, job, replayed: false, state: "queued" as const };
}
