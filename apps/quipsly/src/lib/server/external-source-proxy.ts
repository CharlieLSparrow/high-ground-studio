import "server-only";

import { createHash } from "node:crypto";

import {
  EXTERNAL_SOURCE_PROXY_PROFILE,
  externalSourceProxyIdentity,
  newExternalSourceProxyJob,
  parseExternalSourceProxyJob,
} from "@high-ground/quipsly-media-processing";
import type { PrismaClient } from "@prisma/client";

export const EXTERNAL_SOURCE_PROXY_JOB_TYPE = "external-source-proxy";
export const EXTERNAL_SOURCE_PROXY_JOB_SOURCE = "source-story.external-proxy";

export class ExternalSourceProxyRequestError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) {
    super(message);
    this.name = "ExternalSourceProxyRequestError";
  }
}

function cleanId(value: unknown, field: string) {
  const result = typeof value === "string" ? value.trim() : "";
  if (!/^[A-Za-z0-9:_-]{8,200}$/.test(result)) {
    throw new ExternalSourceProxyRequestError("invalid-id", `${field} is malformed.`);
  }
  return result;
}

function requestId(value: unknown) {
  const result = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(result)) {
    throw new ExternalSourceProxyRequestError("invalid-request-id", "The request identity must be a UUID.");
  }
  return result;
}

function deterministicId(prefix: string, identity: string) {
  return `${prefix}_${createHash("sha256").update(identity).digest("hex").slice(0, 48)}`;
}

function safeNumber(value: bigint | null) {
  if (!value || value <= BigInt(0) || value > BigInt(Number.MAX_SAFE_INTEGER)) return 0;
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
  retryFailed?: boolean;
}) {
  const projectId = cleanId(input.projectId, "projectId");
  const referenceId = cleanId(input.referenceId, "referenceId");
  const sourceRevisionId = cleanId(input.sourceRevisionId, "sourceRevisionId");
  const actorUserId = cleanId(input.actorUserId, "actorUserId");
  const clientRequestId = requestId(input.clientRequestId);
  const actorEmail = input.actorEmail.trim().toLowerCase();
  const source = await input.prisma.studioMediaSourceRevision.findFirst({
    where: { id: sourceRevisionId, projectId, externalReferenceId: referenceId },
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
        where: { kind: "collaboration-proxy", profile: EXTERNAL_SOURCE_PROXY_PROFILE, status: "ready" },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
  if (!source?.externalReference) {
    throw new ExternalSourceProxyRequestError("source-not-found", "That exact external source revision is unavailable in this Nest.", 404);
  }
  const reference = source.externalReference;
  if (!reference.mimeType?.startsWith("video/")) {
    throw new ExternalSourceProxyRequestError("video-required", "This proxy profile currently requires a video source.");
  }
  if (reference.accessState !== "available" || reference.capabilityState !== "downloadable") {
    throw new ExternalSourceProxyRequestError("source-access-held", "Reconnect or restore download access before creating a new proxy.", 409);
  }
  if (!source.contentSha256 || !/^[0-9a-f]{64}$/.test(source.contentSha256) || !safeNumber(source.sizeBytes)) {
    throw new ExternalSourceProxyRequestError("source-bytes-unverified", "The exact source bytes must be checksum-bound before local proxy generation.", 409);
  }
  if (source.derivatives[0]) {
    return { derivative: source.derivatives[0], job: null, replayed: true, state: "ready" as const };
  }
  if (reference.provider !== "local-file-vault") {
    throw new ExternalSourceProxyRequestError(
      "provider-executor-unavailable",
      "This source is attached, but its verified proxy executor is not active yet. The original and source identity remain safe.",
      409,
    );
  }

  const identity = externalSourceProxyIdentity({
    projectId,
    sourceRevisionId,
    identitySha256: source.identitySha256,
  });
  const jobId = deterministicId("xspjob", identity);
  const derivativeId = deterministicId("xspderivative", identity);
  const locator = [
    "source-story",
    source.project.slug,
    sourceRevisionId,
    `${EXTERNAL_SOURCE_PROXY_PROFILE}-${source.identitySha256.slice(0, 20)}.mp4`,
  ].join("/");
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

  const existing = await input.prisma.studioWorkflowJob.findUnique({ where: { id: jobId } });
  if (existing) {
    try {
      parseExternalSourceProxyJob(existing.inputJson, jobId);
    } catch {
      throw new ExternalSourceProxyRequestError("job-identity-conflict", "The durable proxy job identity is bound to different source intent.", 409);
    }
    if (existing.status === "failed" && input.retryFailed) {
      const previous = existing.resultJson && typeof existing.resultJson === "object" && !Array.isArray(existing.resultJson)
        ? existing.resultJson as Record<string, unknown>
        : {};
      const failures = Array.isArray(previous.failureHistory) ? previous.failureHistory : [];
      const failure = previous.failure && typeof previous.failure === "object" ? previous.failure : null;
      const retried = await input.prisma.studioWorkflowJob.update({
        where: { id: jobId },
        data: {
          status: "queued",
          error: null,
          completedAt: null,
          resultJson: {
            state: "queued",
            requestedBy: { actorUserId, actorEmail, clientRequestId },
            failureHistory: failure ? [...failures, failure] : failures,
            originalRemainsSourceTruth: true,
          },
        },
      });
      return { derivative: null, job: retried, replayed: false, state: "queued" as const };
    }
    return { derivative: null, job: existing, replayed: true, state: existing.status };
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
        requestedBy: { actorUserId, actorEmail, clientRequestId },
        originalRemainsSourceTruth: true,
      },
      requestedByEmail: actorEmail,
    },
  });
  return { derivative: null, job, replayed: false, state: "queued" as const };
}
