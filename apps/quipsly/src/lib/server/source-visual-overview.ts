import "server-only";

import {
  SOURCE_VISUAL_OVERVIEW_COLUMNS,
  SOURCE_VISUAL_OVERVIEW_DERIVATIVE_KIND,
  SOURCE_VISUAL_OVERVIEW_PROFILE,
  SOURCE_VISUAL_OVERVIEW_ROWS,
  SOURCE_VISUAL_OVERVIEW_SAMPLE_COUNT,
  newSourceVisualOverviewJob,
  parseSourceVisualOverviewJob,
  sourceVisualOverviewIdentity,
} from "@high-ground/quipsly-media-processing";
import {
  buildSourceVisualOverviewTargetLocator,
  sourceVisualOverviewDerivativeId,
  sourceVisualOverviewJobId,
} from "@high-ground/quipsly-media-processing/source-navigation-identity";
import type { PrismaClient } from "@prisma/client";

import { readLocalExecutorTarget } from "@/lib/server/local-executor-storage";

export const SOURCE_VISUAL_OVERVIEW_JOB_TYPE = "source-visual-overview";
export const SOURCE_VISUAL_OVERVIEW_JOB_SOURCE = "source-story.visual-overview";

export type PublicSourceVisualNavigationFrames = {
  columns: number;
  rows: number;
  sampleTimesSeconds: number[];
};

export function publicSourceVisualNavigationFrames(
  verificationJson: unknown,
): PublicSourceVisualNavigationFrames | null {
  const verification =
    verificationJson &&
    typeof verificationJson === "object" &&
    !Array.isArray(verificationJson)
      ? (verificationJson as Record<string, unknown>)
      : {};
  const output =
    verification.output &&
    typeof verification.output === "object" &&
    !Array.isArray(verification.output)
      ? (verification.output as Record<string, unknown>)
      : {};
  const columns = Number(output.columns);
  const rows = Number(output.rows);
  const sampleTimesSeconds = Array.isArray(output.sampleTimesSeconds)
    ? output.sampleTimesSeconds.map(Number)
    : [];
  if (
    !Number.isSafeInteger(columns) ||
    columns < 1 ||
    columns > 12 ||
    !Number.isSafeInteger(rows) ||
    rows < 1 ||
    rows > 12 ||
    sampleTimesSeconds.length !== columns * rows ||
    sampleTimesSeconds.some(
      (value, index) =>
        !Number.isFinite(value) ||
        value < 0 ||
        (index > 0 && value <= sampleTimesSeconds[index - 1]!),
    )
  ) {
    return null;
  }
  return { columns, rows, sampleTimesSeconds };
}

export class SourceVisualOverviewRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "SourceVisualOverviewRequestError";
  }
}

function cleanId(value: unknown, field: string) {
  const result = typeof value === "string" ? value.trim() : "";
  if (!/^[A-Za-z0-9:_-]{8,200}$/.test(result)) {
    throw new SourceVisualOverviewRequestError(
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
    throw new SourceVisualOverviewRequestError(
      "invalid-request-id",
      "The request identity must be a UUID.",
    );
  }
  return result;
}

function safeNumber(value: bigint | null) {
  if (!value || value <= 0n || value > BigInt(Number.MAX_SAFE_INTEGER))
    return 0;
  return Number(value);
}

export async function requestSourceVisualOverview(input: {
  prisma: PrismaClient;
  projectId: string;
  sourceRevisionId: string;
  actorUserId: string;
  actorEmail: string;
  clientRequestId: string;
  executorNodeId?: string | null;
  retryFailed?: boolean;
}) {
  const projectId = cleanId(input.projectId, "projectId");
  const sourceRevisionId = cleanId(input.sourceRevisionId, "sourceRevisionId");
  const actorUserId = cleanId(input.actorUserId, "actorUserId");
  const clientRequestId = requestId(input.clientRequestId);
  const actorEmail = input.actorEmail.trim().toLowerCase();
  const selectedExecutor = await readLocalExecutorTarget(
    input.prisma,
    input.executorNodeId,
  );
  const source = await input.prisma.studioMediaSourceRevision.findFirst({
    where: { id: sourceRevisionId, projectId },
    include: {
      project: { select: { slug: true } },
      derivatives: {
        where: {
          status: "ready",
          OR: [
            {
              kind: SOURCE_VISUAL_OVERVIEW_DERIVATIVE_KIND,
              profile: SOURCE_VISUAL_OVERVIEW_PROFILE,
            },
            { kind: "collaboration-proxy" },
          ],
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!source) {
    throw new SourceVisualOverviewRequestError(
      "source-not-found",
      "That exact source revision is unavailable in this Nest.",
      404,
    );
  }
  if (!source.contentSha256 || !/^[0-9a-f]{64}$/.test(source.contentSha256)) {
    throw new SourceVisualOverviewRequestError(
      "source-bytes-unverified",
      "The exact source bytes must be checksum-bound before a visual map can be retained.",
      409,
    );
  }
  const proxyCandidates = source.derivatives.filter(
    (derivative) => derivative.kind === "collaboration-proxy",
  );
  const proxy =
    (selectedExecutor
      ? proxyCandidates.find(
          (derivative) =>
            derivative.custodianNodeId === selectedExecutor.nodeId &&
            derivative.storageScopeId === selectedExecutor.storageScopeId,
        )
      : null) ??
    proxyCandidates.find(
      (derivative) =>
        derivative.custodianNodeId === null &&
        derivative.storageScopeId === null,
    );
  if (
    !proxy ||
    proxy.storageProvider !== "local" ||
    proxy.mimeType !== "video/mp4"
  ) {
    throw new SourceVisualOverviewRequestError(
      "visual-input-unavailable",
      "Create or restore the verified collaboration proxy before building this visual map.",
      409,
    );
  }
  const executionTarget =
    proxy.custodianNodeId && proxy.storageScopeId
      ? {
          custodianNodeId: proxy.custodianNodeId,
          storageScopeId: proxy.storageScopeId,
        }
      : selectedExecutor
        ? {
            custodianNodeId: selectedExecutor.nodeId,
            storageScopeId: selectedExecutor.storageScopeId,
          }
        : null;
  if (!executionTarget) {
    throw new SourceVisualOverviewRequestError(
      "visual-executor-unavailable",
      "Start or select the local media computer that owns this proxy before building its visual map.",
      409,
    );
  }
  const durationSeconds = proxy.durationSeconds ?? source.durationSeconds ?? 0;
  if (
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0 ||
    !safeNumber(proxy.sizeBytes)
  ) {
    throw new SourceVisualOverviewRequestError(
      "visual-input-unverified",
      "The proxy needs verified duration and byte evidence before a visual map can be retained.",
      409,
    );
  }
  const identity = sourceVisualOverviewIdentity({
    projectId,
    sourceRevisionId,
    sourceIdentitySha256: source.identitySha256,
    inputGeneration: proxy.generation,
    inputDerivativeId: proxy.id,
    executionScopeId:
      proxy.storageScopeId === null
        ? executionTarget.storageScopeId
        : undefined,
  });
  const existingDerivative = source.derivatives.find(
    (derivative) =>
      derivative.kind === SOURCE_VISUAL_OVERVIEW_DERIVATIVE_KIND &&
      derivative.profile === SOURCE_VISUAL_OVERVIEW_PROFILE &&
      ((derivative.custodianNodeId === executionTarget.custodianNodeId &&
        derivative.storageScopeId === executionTarget.storageScopeId) ||
        (derivative.custodianNodeId === null &&
          derivative.storageScopeId === null)) &&
      derivative.provenanceJson &&
      typeof derivative.provenanceJson === "object" &&
      !Array.isArray(derivative.provenanceJson) &&
      (derivative.provenanceJson as Record<string, unknown>).inputGeneration ===
        proxy.generation,
  );
  if (existingDerivative) {
    return {
      derivative: existingDerivative,
      job: null,
      replayed: true,
      state: "ready" as const,
    };
  }

  const jobId = sourceVisualOverviewJobId(identity);
  const derivativeId = sourceVisualOverviewDerivativeId(identity);
  const locator = buildSourceVisualOverviewTargetLocator({
    projectSlug: source.project.slug,
    sourceRevisionId,
    inputContentSha256: proxy.contentSha256,
  });
  const manifest = newSourceVisualOverviewJob({
    jobId,
    derivativeId,
    projectId,
    projectSlug: source.project.slug,
    actorUserId,
    actorEmail,
    queuedAt: new Date().toISOString(),
    source: {
      sourceRevisionId,
      identitySha256: source.identitySha256,
      expectedContentSha256: source.contentSha256,
    },
    input: {
      derivativeId: proxy.id,
      provider: "local",
      locator: proxy.locator,
      generation: proxy.generation,
      contentSha256: proxy.contentSha256,
      sizeBytes: Number(proxy.sizeBytes),
      contentType: proxy.mimeType,
      durationSeconds,
    },
    target: {
      provider: "local",
      locator,
      contentType: "image/jpeg",
      derivativeKind: SOURCE_VISUAL_OVERVIEW_DERIVATIVE_KIND,
      profile: SOURCE_VISUAL_OVERVIEW_PROFILE,
      columns: SOURCE_VISUAL_OVERVIEW_COLUMNS,
      rows: SOURCE_VISUAL_OVERVIEW_ROWS,
      sampleCount: SOURCE_VISUAL_OVERVIEW_SAMPLE_COUNT,
    },
  });
  const existingJob = await input.prisma.studioWorkflowJob.findUnique({
    where: { id: jobId },
  });
  if (existingJob) {
    try {
      parseSourceVisualOverviewJob(existingJob.inputJson, jobId);
    } catch {
      throw new SourceVisualOverviewRequestError(
        "job-identity-conflict",
        "The visual-map job identity is bound to different source intent.",
        409,
      );
    }
    if (existingJob.status === "failed" && input.retryFailed) {
      const previous =
        existingJob.resultJson &&
        typeof existingJob.resultJson === "object" &&
        !Array.isArray(existingJob.resultJson)
          ? (existingJob.resultJson as Record<string, unknown>)
          : {};
      const failureHistory = Array.isArray(previous.failureHistory)
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
            executionTarget,
            requestedBy: { actorUserId, actorEmail, clientRequestId },
            failureHistory: failure
              ? [...failureHistory, failure]
              : failureHistory,
            originalRemainsSourceTruth: true,
            inputDerivativeRemainsUnchanged: true,
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
    if (["output-ready", "completed"].includes(existingJob.status)) {
      const previous =
        existingJob.resultJson &&
        typeof existingJob.resultJson === "object" &&
        !Array.isArray(existingJob.resultJson)
          ? (existingJob.resultJson as Record<string, unknown>)
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
            executionTarget,
            requestedBy: { actorUserId, actorEmail, clientRequestId },
            recoveryReason: "local-derivative-unavailable",
            recoveryHistory: [
              ...recoveryHistory,
              {
                priorStatus: existingJob.status,
                priorResult: previous,
                requestedAt: new Date().toISOString(),
              },
            ],
            originalRemainsSourceTruth: true,
            inputDerivativeRemainsUnchanged: true,
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
      job: existingJob,
      replayed: true,
      state: existingJob.status,
    };
  }
  const job = await input.prisma.studioWorkflowJob.create({
    data: {
      id: jobId,
      projectId,
      type: SOURCE_VISUAL_OVERVIEW_JOB_TYPE,
      source: SOURCE_VISUAL_OVERVIEW_JOB_SOURCE,
      status: "queued",
      priority: 72,
      inputJson: manifest,
      resultJson: {
        state: "queued",
        executionTarget,
        requestedBy: { actorUserId, actorEmail, clientRequestId },
        originalRemainsSourceTruth: true,
        inputDerivativeRemainsUnchanged: true,
      },
      requestedByEmail: actorEmail,
    },
  });
  return { derivative: null, job, replayed: false, state: "queued" as const };
}
