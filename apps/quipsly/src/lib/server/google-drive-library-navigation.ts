import "server-only";

import { createHash } from "node:crypto";

import type { PrismaClient } from "@prisma/client";
import {
  sourceAudioNavigationIdentity,
  sourceVisualOverviewIdentity,
} from "@high-ground/quipsly-media-processing";
import {
  sourceAudioNavigationJobId,
  sourceVisualOverviewJobId,
} from "@high-ground/quipsly-media-processing/source-navigation-identity";

import { externalMediaMemberRole } from "@/lib/external-media-contract";

import {
  ExternalSourceProxyRequestError,
  requestExternalSourceProxy,
} from "./external-source-proxy";
import {
  GoogleDriveSourceMaterializationRequestError,
  requestGoogleDriveSourceMaterialization,
} from "./google-drive-source-materialization";
import {
  SourceAudioNavigationRequestError,
  requestSourceAudioNavigation,
} from "./source-audio-navigation";
import {
  SourceVisualOverviewRequestError,
  requestSourceVisualOverview,
} from "./source-visual-overview";

const DEFAULT_BATCH_LIMIT = 12;
const MAX_BATCH_LIMIT = 25;
const MAX_LIBRARY_ITEMS = 500;

export class GoogleDriveLibraryNavigationError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "GoogleDriveLibraryNavigationError";
  }
}

function cleanId(value: unknown, field: string) {
  const result = typeof value === "string" ? value.trim() : "";
  if (!/^[A-Za-z0-9:_-]{8,200}$/.test(result)) {
    throw new GoogleDriveLibraryNavigationError(
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
    throw new GoogleDriveLibraryNavigationError(
      "invalid-request-id",
      "The library-preparation request identity must be a UUID.",
    );
  }
  return result;
}

function childRequestId(
  parent: string,
  sourceRevisionId: string,
  stage: string,
) {
  const hex = createHash("sha256")
    .update(`${parent}:${sourceRevisionId}:${stage}`)
    .digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function batchLimit(value: unknown) {
  if (value === undefined || value === null) return DEFAULT_BATCH_LIMIT;
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 1 || result > MAX_BATCH_LIMIT) {
    throw new GoogleDriveLibraryNavigationError(
      "invalid-batch-limit",
      `Prepare between 1 and ${MAX_BATCH_LIMIT} camera segments at a time.`,
    );
  }
  return result;
}

function knownPreparationError(error: unknown) {
  if (
    error instanceof GoogleDriveSourceMaterializationRequestError ||
    error instanceof ExternalSourceProxyRequestError ||
    error instanceof SourceVisualOverviewRequestError ||
    error instanceof SourceAudioNavigationRequestError
  ) {
    return { code: error.code, message: error.message };
  }
  return null;
}

export async function prepareGoogleDriveLibraryNavigation(input: {
  prisma: PrismaClient;
  projectId: string;
  libraryId: string;
  actorUserId: string;
  actorEmail: string;
  clientRequestId: string;
  limit?: number;
  retryFailed?: boolean;
}) {
  const projectId = cleanId(input.projectId, "projectId");
  const libraryId = cleanId(input.libraryId, "libraryId");
  const actorUserId = cleanId(input.actorUserId, "actorUserId");
  const clientRequestId = requestId(input.clientRequestId);
  const limit = batchLimit(input.limit);
  const actorEmail = input.actorEmail.trim().toLowerCase();
  const library = await input.prisma.studioExternalMediaLibrary.findFirst({
    where: { id: libraryId, projectId, provider: "google-drive" },
    include: {
      connection: { select: { id: true, userId: true, status: true } },
      items: {
        where: { state: "present", externalReferenceId: { not: null } },
        orderBy: [{ lastObservedAt: "asc" }, { id: "asc" }],
        take: MAX_LIBRARY_ITEMS,
        include: {
          externalReference: {
            include: {
              revisions: {
                orderBy: { createdAt: "desc" },
                take: 1,
                include: {
                  replicas: {
                    where: { storageProvider: "local-cache", status: "ready" },
                    orderBy: { createdAt: "desc" },
                    take: 1,
                  },
                  derivatives: {
                    where: {
                      status: "ready",
                      kind: {
                        in: ["collaboration-proxy", "source-contact-sheet"],
                      },
                    },
                    orderBy: { createdAt: "desc" },
                    take: 8,
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!library) {
    throw new GoogleDriveLibraryNavigationError(
      "library-not-found",
      "That followed Drive library is unavailable in this Nest.",
      404,
    );
  }
  if (
    !library.connection ||
    library.connection.userId !== actorUserId ||
    library.connection.status !== "verified"
  ) {
    throw new GoogleDriveLibraryNavigationError(
      "library-connection-owner-required",
      "The connected Drive account owner must prepare this library on their authenticated executor.",
      403,
    );
  }

  const candidates = library.items.flatMap((item) => {
    const reference = item.externalReference;
    const revision = reference?.revisions[0];
    if (
      !reference ||
      !revision ||
      reference.connectionId !== library.connection?.id ||
      externalMediaMemberRole(record(revision.projectionJson).memberRole) !==
        "browse-proxy"
    ) {
      return [];
    }
    return [{ item, reference, revision }];
  });
  const expectedNavigation = candidates.flatMap(({ revision }) => {
    const proxy = revision.derivatives.find(
      (derivative) => derivative.kind === "collaboration-proxy",
    );
    if (!proxy) return [];
    const identityInput = {
      projectId,
      sourceRevisionId: revision.id,
      sourceIdentitySha256: revision.identitySha256,
      inputGeneration: proxy.generation,
    };
    return [
      {
        sourceRevisionId: revision.id,
        proxyGeneration: proxy.generation,
        visualJobId: sourceVisualOverviewJobId(
          sourceVisualOverviewIdentity(identityInput),
        ),
        audioJobId: sourceAudioNavigationJobId(
          sourceAudioNavigationIdentity(identityInput),
        ),
      },
    ];
  });
  const expectedByRevision = new Map(
    expectedNavigation.map((navigation) => [
      navigation.sourceRevisionId,
      navigation,
    ]),
  );
  const readyNavigationJobs = await input.prisma.studioWorkflowJob.findMany({
    where: {
      projectId,
      id: {
        in: expectedNavigation.flatMap((navigation) => [
          navigation.visualJobId,
          navigation.audioJobId,
        ]),
      },
      status: { in: ["output-ready", "completed"] },
    },
    select: { id: true },
  });
  const readyNavigationJobIds = new Set(
    readyNavigationJobs.map((job) => job.id),
  );
  const incomplete = candidates.filter(({ revision }) => {
    const expected = expectedByRevision.get(revision.id);
    if (!expected) return true;
    const visualReady = revision.derivatives.some(
      (derivative) =>
        derivative.kind === "source-contact-sheet" &&
        record(derivative.provenanceJson).inputGeneration ===
          expected.proxyGeneration,
    );
    return (
      !visualReady ||
      !readyNavigationJobIds.has(expected.visualJobId) ||
      !readyNavigationJobIds.has(expected.audioJobId)
    );
  });
  const selected = incomplete.slice(0, limit);
  const items: Array<{
    sourceRevisionId: string;
    fileName: string;
    stage: "materialization" | "proxy" | "navigation" | "held";
    state: string;
    queuedVisual: boolean;
    queuedAudio: boolean;
    transferBytes: string;
    failureCode: string | null;
    failureMessage: string | null;
  }> = [];

  for (const candidate of selected) {
    const { reference, revision } = candidate;
    try {
      let replicaReady = Boolean(revision.replicas[0]);
      if (!replicaReady) {
        const prepared = await requestGoogleDriveSourceMaterialization({
          prisma: input.prisma,
          projectId,
          referenceId: reference.id,
          sourceRevisionId: revision.id,
          actorUserId,
          actorEmail,
          clientRequestId: childRequestId(
            clientRequestId,
            revision.id,
            "materialization",
          ),
          retryFailed: input.retryFailed,
        });
        replicaReady = prepared.state === "ready";
        if (!replicaReady) {
          items.push({
            sourceRevisionId: revision.id,
            fileName: reference.fileName,
            stage: "materialization",
            state: prepared.state,
            queuedVisual: false,
            queuedAudio: false,
            transferBytes: revision.sizeBytes?.toString() ?? "0",
            failureCode: null,
            failureMessage: null,
          });
          continue;
        }
      }

      let proxyReady = revision.derivatives.some(
        (derivative) => derivative.kind === "collaboration-proxy",
      );
      if (!proxyReady) {
        const proxied = await requestExternalSourceProxy({
          prisma: input.prisma,
          projectId,
          referenceId: reference.id,
          sourceRevisionId: revision.id,
          actorUserId,
          actorEmail,
          clientRequestId: childRequestId(
            clientRequestId,
            revision.id,
            "proxy",
          ),
          retryFailed: input.retryFailed,
        });
        proxyReady = proxied.state === "ready";
        if (!proxyReady) {
          items.push({
            sourceRevisionId: revision.id,
            fileName: reference.fileName,
            stage: "proxy",
            state: proxied.state,
            queuedVisual: false,
            queuedAudio: false,
            transferBytes: "0",
            failureCode: null,
            failureMessage: null,
          });
          continue;
        }
      }

      const [visual, audio] = await Promise.all([
        requestSourceVisualOverview({
          prisma: input.prisma,
          projectId,
          sourceRevisionId: revision.id,
          actorUserId,
          actorEmail,
          clientRequestId: childRequestId(
            clientRequestId,
            revision.id,
            "visual",
          ),
          retryFailed: input.retryFailed,
        }),
        requestSourceAudioNavigation({
          prisma: input.prisma,
          projectId,
          sourceRevisionId: revision.id,
          actorUserId,
          actorEmail,
          clientRequestId: childRequestId(
            clientRequestId,
            revision.id,
            "audio",
          ),
          retryFailed: input.retryFailed,
        }),
      ]);
      items.push({
        sourceRevisionId: revision.id,
        fileName: reference.fileName,
        stage: "navigation",
        state:
          visual.state === "ready" && audio.state === "ready"
            ? "ready"
            : "preparing",
        queuedVisual: !visual.replayed,
        queuedAudio: !audio.replayed,
        transferBytes: "0",
        failureCode: null,
        failureMessage: null,
      });
    } catch (error) {
      const known = knownPreparationError(error);
      if (!known) throw error;
      items.push({
        sourceRevisionId: revision.id,
        fileName: reference.fileName,
        stage: "held",
        state: "held",
        queuedVisual: false,
        queuedAudio: false,
        transferBytes: "0",
        failureCode: known.code,
        failureMessage: known.message,
      });
    }
  }

  return {
    schema: "quipsly-google-drive-library-navigation-batch-v1" as const,
    library: {
      id: library.id,
      name: library.name,
      revision: library.revision,
    },
    bounds: {
      requestedLimit: limit,
      maximumLimit: MAX_BATCH_LIMIT,
      inspectedItemLimit: MAX_LIBRARY_ITEMS,
      inventoryTruncated: library.totalFileCount > MAX_LIBRARY_ITEMS,
    },
    summary: {
      eligibleSourceCount: candidates.length,
      alreadyReadyCount: candidates.length - incomplete.length,
      selectedCount: selected.length,
      remainingCount: Math.max(0, incomplete.length - selected.length),
      materializationCount: items.filter(
        (item) => item.stage === "materialization",
      ).length,
      proxyCount: items.filter((item) => item.stage === "proxy").length,
      navigationCount: items.filter((item) => item.stage === "navigation")
        .length,
      heldCount: items.filter((item) => item.stage === "held").length,
      queuedVisualCount: items.filter((item) => item.queuedVisual).length,
      queuedAudioCount: items.filter((item) => item.queuedAudio).length,
      browseTransferBytes: items
        .reduce((total, item) => total + BigInt(item.transferBytes), 0n)
        .toString(),
    },
    items,
    boundaries: {
      originalsRemainInDrive: true,
      browseCompanionsOnly: true,
      finalConformNotStarted: true,
      localWorkerRequired: true,
      deterministicReplay: true,
    },
  };
}
