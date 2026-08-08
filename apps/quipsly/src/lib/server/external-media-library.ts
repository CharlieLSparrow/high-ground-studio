import "server-only";

import { createHash } from "node:crypto";

import type { Prisma, PrismaClient } from "@prisma/client";
import { sourceAudioNavigationIdentity } from "@high-ground/quipsly-media-processing";
import { sourceAudioNavigationJobId } from "@high-ground/quipsly-media-processing/source-navigation-identity";

import { externalMediaMemberRole } from "@/lib/external-media-contract";
import { preferPreparedByteEquivalentRevision } from "@/lib/server/external-media-byte-identity";
import { selectGoogleDriveBrowsePreparationBatch } from "@/lib/server/google-drive-navigation-batch";
import {
  localExecutorStorageShortfall,
  readLocalExecutorStorage,
  type PublicLocalExecutorStorage,
} from "@/lib/server/local-executor-storage";
import type { GoogleDriveMediaLibraryPlan } from "@/lib/google-drive-media-package";

type LibraryAttachment = {
  externalFileId: string;
  externalReferenceId: string;
  sourceUnitId: string;
};

type InventoryRow = {
  externalFileId: string;
  fileName: string;
  observedRevisionKey: string | null;
  sizeBytes: bigint | null;
};

const MAX_PUBLIC_HELD_SEGMENTS = 100;

type PublicHeldSegment = {
  batchName: string;
  displayName: string;
  segment: string;
  status: string;
  reasons: string[];
  observedMemberCount: number;
};

type PublicLibraryNavigationHealth = {
  eligibleSourceCount: number;
  retainedBrowseCount: number;
  proxyReadyCount: number;
  visualReadyCount: number;
  audioReadyCount: number;
  browseReadyCount: number;
  remainingCount: number;
  nextBatchCount: number;
  nextBatchTransferBytes: string;
  nextBatchFits: boolean | null;
  nextBatchShortfallBytes: string;
  pendingTransferBytes: string;
  executorStorage: PublicLocalExecutorStorage;
  inventoryTruncated: boolean;
  captureDays: Array<{
    date: string | null;
    eligibleSourceCount: number;
    browseReadyCount: number;
    pendingTransferBytes: string;
  }>;
};

type LibraryNavigationRevision = {
  id: string;
  identitySha256: string;
  sizeBytes: bigint | null;
  projectionJson: unknown;
  provenanceJson: unknown;
  replicas: Array<{ id: string }>;
  derivatives: Array<{
    kind: string;
    generation: string;
    provenanceJson: unknown;
  }>;
};

const EMPTY_LIBRARY_NAVIGATION_HEALTH: PublicLibraryNavigationHealth = {
  eligibleSourceCount: 0,
  retainedBrowseCount: 0,
  proxyReadyCount: 0,
  visualReadyCount: 0,
  audioReadyCount: 0,
  browseReadyCount: 0,
  remainingCount: 0,
  nextBatchCount: 0,
  nextBatchTransferBytes: "0",
  nextBatchFits: null,
  nextBatchShortfallBytes: "0",
  pendingTransferBytes: "0",
  executorStorage: {
    status: "unavailable",
    safeAvailableBytes: null,
    availableBytes: null,
    reserveBytes: null,
    measuredAt: null,
    workspaceMode: "unknown",
    localPathWithheld: true,
  },
  inventoryTruncated: false,
  captureDays: [],
};

export class ExternalMediaLibraryError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ExternalMediaLibraryError";
  }
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

function sha256(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function requestId(value: string) {
  const normalized = value.trim().toLowerCase();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      normalized,
    )
  ) {
    throw new ExternalMediaLibraryError(
      "The library refresh request identity is malformed.",
      "invalid-library-request-id",
      400,
    );
  }
  return normalized;
}

function byteCount(value: string | null) {
  if (value === null || !/^\d+$/.test(value)) return null;
  return BigInt(value);
}

function revisionKey(value: {
  headRevisionId: string | null;
  md5Checksum: string | null;
  modifiedTime: string | null;
}) {
  return (
    value.headRevisionId ??
    (value.md5Checksum ? `md5:${value.md5Checksum}` : null) ??
    (value.modifiedTime ? `modified:${value.modifiedTime}` : null)
  );
}

function libraryInventory(plan: GoogleDriveMediaLibraryPlan) {
  const rows = new Map<string, InventoryRow>();
  const observe = (value: {
    id: string;
    name: string;
    headRevisionId: string | null;
    md5Checksum: string | null;
    modifiedTime: string | null;
    sizeBytes: string | null;
  }) => {
    const row = {
      externalFileId: value.id,
      fileName: value.name,
      observedRevisionKey: revisionKey(value),
      sizeBytes: byteCount(value.sizeBytes),
    };
    const current = rows.get(value.id);
    if (
      current &&
      (current.fileName !== row.fileName ||
        current.observedRevisionKey !== row.observedRevisionKey ||
        current.sizeBytes !== row.sizeBytes)
    ) {
      throw new ExternalMediaLibraryError(
        "The provider returned conflicting observations for one library file.",
        "conflicting-library-observation",
        502,
      );
    }
    rows.set(value.id, row);
  };
  for (const batch of plan.batches) {
    for (const segment of batch.segments) {
      for (const member of segment.members) observe(member);
    }
    for (const file of batch.unrecognizedFiles) observe(file);
  }
  return [...rows.values()].sort((left, right) =>
    left.externalFileId.localeCompare(right.externalFileId),
  );
}

function heldSegmentHealth(plan: GoogleDriveMediaLibraryPlan) {
  const all = plan.batches.flatMap((batch) =>
    batch.segments
      .filter((segment) => segment.status !== "ready-to-attach")
      .map(
        (segment): PublicHeldSegment => ({
          batchName: batch.folder.name.slice(0, 240),
          displayName: segment.displayName.slice(0, 240),
          segment: segment.segment.slice(0, 16),
          status: segment.status,
          reasons: segment.reasons
            .slice(0, 8)
            .map((reason) => reason.slice(0, 500)),
          observedMemberCount: segment.members.length,
        }),
      ),
  );
  return {
    heldSegments: all.slice(0, MAX_PUBLIC_HELD_SEGMENTS),
    heldSegmentsOmittedCount: Math.max(
      0,
      all.length - MAX_PUBLIC_HELD_SEGMENTS,
    ),
  };
}

function publicHeldSegmentHealth(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return {
      heldSegments: [] as PublicHeldSegment[],
      heldSegmentsOmittedCount: 0,
    };
  const record = value as Record<string, unknown>;
  const heldSegments = Array.isArray(record.heldSegments)
    ? record.heldSegments
        .slice(0, MAX_PUBLIC_HELD_SEGMENTS)
        .flatMap((candidate): PublicHeldSegment[] => {
          if (
            !candidate ||
            typeof candidate !== "object" ||
            Array.isArray(candidate)
          )
            return [];
          const item = candidate as Record<string, unknown>;
          if (
            typeof item.batchName !== "string" ||
            typeof item.displayName !== "string" ||
            typeof item.segment !== "string" ||
            typeof item.status !== "string" ||
            !Array.isArray(item.reasons) ||
            typeof item.observedMemberCount !== "number"
          )
            return [];
          return [
            {
              batchName: item.batchName,
              displayName: item.displayName,
              segment: item.segment,
              status: item.status,
              reasons: item.reasons.filter(
                (reason): reason is string => typeof reason === "string",
              ),
              observedMemberCount: item.observedMemberCount,
            },
          ];
        })
    : [];
  return {
    heldSegments,
    heldSegmentsOmittedCount:
      typeof record.heldSegmentsOmittedCount === "number" &&
      Number.isInteger(record.heldSegmentsOmittedCount) &&
      record.heldSegmentsOmittedCount > 0
        ? record.heldSegmentsOmittedCount
        : 0,
  };
}

function publicLibrary(
  library: {
    id: string;
    name: string;
    status: string;
    revision: number;
    totalFileCount: number;
    totalSizeBytes: bigint;
    readySegmentCount: number;
    heldSegmentCount: number;
    lastCheckedAt: Date;
    lastSuccessfulRefreshAt: Date;
    createdByUserId: string;
    connectionId: string | null;
    providerLocatorJson: unknown;
    healthJson: unknown;
    connection: { userId: string; status: string } | null;
    items?: Array<{ state: string }>;
    _count?: { items: number };
  },
  actorUserId: string,
  navigationHealth: PublicLibraryNavigationHealth = EMPTY_LIBRARY_NAVIGATION_HEALTH,
) {
  const notObservedCount =
    library._count?.items ??
    library.items?.filter((item) => item.state === "not-observed").length ??
    0;
  const locator =
    library.providerLocatorJson &&
    typeof library.providerLocatorJson === "object" &&
    !Array.isArray(library.providerLocatorJson)
      ? (library.providerLocatorJson as Record<string, unknown>)
      : {};
  const heldHealth = publicHeldSegmentHealth(library.healthJson);
  return {
    id: library.id,
    name: library.name,
    provider: "google-drive" as const,
    status: library.status,
    revision: library.revision,
    totalFileCount: library.totalFileCount,
    totalSizeBytes: library.totalSizeBytes.toString(),
    readySegmentCount: library.readySegmentCount,
    heldSegmentCount: library.heldSegmentCount,
    ...heldHealth,
    notObservedCount,
    lastCheckedAt: library.lastCheckedAt.toISOString(),
    lastSuccessfulRefreshAt: library.lastSuccessfulRefreshAt.toISOString(),
    canRefresh:
      library.connection?.userId === actorUserId &&
      library.connection.status === "verified",
    connectionId:
      library.connection?.userId === actorUserId &&
      library.connection.status === "verified"
        ? library.connectionId
        : null,
    connectionState: library.connection?.status ?? "unavailable",
    connectedByCurrentUser: library.createdByUserId === actorUserId,
    discoveryMode:
      locator.mode === "selection-manifest"
        ? ("selected-files" as const)
        : ("folder-scan" as const),
    navigationHealth,
  };
}

function jsonRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function listExternalMediaLibraries(input: {
  prisma: PrismaClient;
  projectId: string;
  actorUserId: string;
}) {
  const [libraries, executorStorage] = await Promise.all([
    input.prisma.studioExternalMediaLibrary.findMany({
      where: { projectId: input.projectId },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      include: {
        connection: { select: { userId: true, status: true } },
        _count: {
          select: { items: { where: { state: "not-observed" } } },
        },
        items: {
          where: { state: "present", externalReferenceId: { not: null } },
          orderBy: [{ lastObservedAt: "asc" }, { id: "asc" }],
          take: 500,
          select: {
            state: true,
            sourceUnit: { select: { capturedAt: true } },
            externalReference: {
              select: {
                connectionId: true,
                revisions: {
                  orderBy: { createdAt: "desc" },
                  take: 12,
                  select: {
                    id: true,
                    identitySha256: true,
                    sizeBytes: true,
                    projectionJson: true,
                    provenanceJson: true,
                    replicas: {
                      where: {
                        storageProvider: "local-cache",
                        status: "ready",
                      },
                      take: 1,
                      select: { id: true },
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
                      select: {
                        kind: true,
                        generation: true,
                        provenanceJson: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }),
    readLocalExecutorStorage(input.prisma),
  ]);
  const candidatesByLibrary = new Map<
    string,
    Array<{
      revision: LibraryNavigationRevision;
      proxy: {
        kind: string;
        generation: string;
        provenanceJson: unknown;
      } | null;
      capturedAt: Date | null;
    }>
  >();
  const expectedAudioJobs = new Map<string, string>();
  for (const library of libraries) {
    const seenRevisionIds = new Set<string>();
    const candidates = library.items.flatMap((item) => {
      const reference = item.externalReference;
      const currentRevision = reference?.revisions[0];
      const revision = currentRevision
        ? preferPreparedByteEquivalentRevision(
            currentRevision,
            reference.revisions,
          )
        : null;
      if (
        !reference ||
        !revision ||
        reference.connectionId !== library.connectionId ||
        seenRevisionIds.has(revision.id) ||
        externalMediaMemberRole(
          jsonRecord(revision.projectionJson).memberRole,
        ) !== "browse-proxy"
      ) {
        return [];
      }
      seenRevisionIds.add(revision.id);
      const proxy =
        revision.derivatives.find(
          (derivative) => derivative.kind === "collaboration-proxy",
        ) ?? null;
      if (proxy) {
        const jobId = sourceAudioNavigationJobId(
          sourceAudioNavigationIdentity({
            projectId: input.projectId,
            sourceRevisionId: revision.id,
            sourceIdentitySha256: revision.identitySha256,
            inputGeneration: proxy.generation,
          }),
        );
        expectedAudioJobs.set(revision.id, jobId);
      }
      return [
        { revision, proxy, capturedAt: item.sourceUnit?.capturedAt ?? null },
      ];
    });
    candidatesByLibrary.set(library.id, candidates);
  }
  const expectedAudioJobIds = [...expectedAudioJobs.values()];
  const readyAudioJobIds = new Set(
    expectedAudioJobIds.length
      ? (
          await input.prisma.studioWorkflowJob.findMany({
            where: {
              projectId: input.projectId,
              id: { in: expectedAudioJobIds },
              status: { in: ["output-ready", "completed"] },
            },
            select: { id: true },
          })
        ).map((job) => job.id)
      : [],
  );
  return libraries.map((library) => {
    const candidates = candidatesByLibrary.get(library.id) ?? [];
    const states = candidates.map(({ revision, proxy, capturedAt }) => {
      const retained = revision.replicas.length > 0;
      const visualReady = proxy
        ? revision.derivatives.some(
            (derivative) =>
              derivative.kind === "source-contact-sheet" &&
              jsonRecord(derivative.provenanceJson).inputGeneration ===
                proxy.generation,
          )
        : false;
      const audioJobId = expectedAudioJobs.get(revision.id);
      const audioReady = Boolean(
        audioJobId && readyAudioJobIds.has(audioJobId),
      );
      return {
        revision,
        capturedAt,
        retained,
        proxyReady: Boolean(proxy),
        visualReady,
        audioReady,
        browseReady: Boolean(proxy && visualReady && audioReady),
      };
    });
    const retainedBrowseCount = states.filter((state) => state.retained).length;
    const proxyReadyCount = states.filter((state) => state.proxyReady).length;
    const visualReadyCount = states.filter((state) => state.visualReady).length;
    const audioReadyCount = states.filter((state) => state.audioReady).length;
    const browseReadyCount = states.filter((state) => state.browseReady).length;
    const remainingCount = Math.max(0, candidates.length - browseReadyCount);
    const nextBatch = selectGoogleDriveBrowsePreparationBatch({
      candidates: states.filter((state) => !state.browseReady),
      countLimit: 12,
    });
    const nextBatchShortfall = localExecutorStorageShortfall(
      executorStorage,
      nextBatch.selectedTransferBytes,
    );
    const navigationHealth: PublicLibraryNavigationHealth = {
      eligibleSourceCount: candidates.length,
      retainedBrowseCount,
      proxyReadyCount,
      visualReadyCount,
      audioReadyCount,
      browseReadyCount,
      remainingCount,
      nextBatchCount: nextBatch.selected.length,
      nextBatchTransferBytes: nextBatch.selectedTransferBytes.toString(),
      nextBatchFits:
        nextBatchShortfall === null ? null : nextBatchShortfall === 0n,
      nextBatchShortfallBytes: (nextBatchShortfall ?? 0n).toString(),
      pendingTransferBytes: states
        .filter((state) => !state.retained)
        .reduce((total, state) => total + (state.revision.sizeBytes ?? 0n), 0n)
        .toString(),
      inventoryTruncated: library.totalFileCount > 500,
      executorStorage,
      captureDays: [
        ...states
          .reduce(
            (days, state) => {
              const date = state.capturedAt
                ? state.capturedAt.toISOString().slice(0, 10)
                : null;
              const key = date ?? "unknown";
              const day = days.get(key) ?? {
                date,
                eligibleSourceCount: 0,
                browseReadyCount: 0,
                pendingTransferBytes: 0n,
              };
              day.eligibleSourceCount += 1;
              if (state.browseReady) day.browseReadyCount += 1;
              if (!state.retained)
                day.pendingTransferBytes += state.revision.sizeBytes ?? 0n;
              days.set(key, day);
              return days;
            },
            new Map<
              string,
              {
                date: string | null;
                eligibleSourceCount: number;
                browseReadyCount: number;
                pendingTransferBytes: bigint;
              }
            >(),
          )
          .values(),
      ]
        .sort((left, right) =>
          left.date === null
            ? 1
            : right.date === null
              ? -1
              : right.date.localeCompare(left.date),
        )
        .map((day) => ({
          ...day,
          pendingTransferBytes: day.pendingTransferBytes.toString(),
        })),
    };
    return publicLibrary(library, input.actorUserId, navigationHealth);
  });
}

export async function recordGoogleDriveLibraryObservation(input: {
  prisma: PrismaClient;
  projectId: string;
  actorUserId: string;
  actorEmail: string;
  connectionId: string;
  externalRootId: string;
  sharedDriveId: string | null;
  resourceKey: string | null;
  selectionManifest?: Array<{
    externalFileId: string;
    resourceKey: string | null;
  }>;
  clientRequestId: string;
  plan: GoogleDriveMediaLibraryPlan;
  attachments: LibraryAttachment[];
}) {
  const normalizedRequestId = requestId(input.clientRequestId);
  const selectionManifest = input.selectionManifest
    ? [...input.selectionManifest]
        .map((item) => ({
          externalFileId: item.externalFileId,
          resourceKey: item.resourceKey,
        }))
        .sort((left, right) =>
          left.externalFileId.localeCompare(right.externalFileId),
        )
    : null;
  const providerLocatorJson = selectionManifest
    ? ({
        schema: "quipsly-google-drive-library-locator-v2",
        mode: "selection-manifest",
        resourceKey: input.resourceKey,
        selections: selectionManifest,
      } satisfies Prisma.InputJsonValue)
    : ({
        schema: "quipsly-google-drive-library-locator-v1",
        mode: "folder-scan",
        resourceKey: input.resourceKey,
      } satisfies Prisma.InputJsonValue);
  const inventory = libraryInventory(input.plan);
  const fingerprint = sha256(
    inventory.map((item) => ({
      externalFileId: item.externalFileId,
      fileName: item.fileName,
      observedRevisionKey: item.observedRevisionKey,
      sizeBytes: item.sizeBytes?.toString() ?? null,
    })),
  );
  const requestSha256 = sha256({
    schema: "quipsly-external-media-library-observation-request-v1",
    projectId: input.projectId,
    actorUserId: input.actorUserId,
    connectionId: input.connectionId,
    externalRootId: input.externalRootId,
    inventoryFingerprintSha256: fingerprint,
    providerLocatorSha256: sha256(providerLocatorJson),
  });
  const attachmentByFile = new Map(
    input.attachments.map((item) => [item.externalFileId, item]),
  );
  const now = new Date();

  return input.prisma.$transaction(
    async (tx) => {
      const actorConnection = await tx.studioMediaProviderConnection.findFirst({
        where: {
          id: input.connectionId,
          userId: input.actorUserId,
          provider: "google-drive",
          status: "verified",
        },
        select: { id: true },
      });
      if (!actorConnection) {
        throw new ExternalMediaLibraryError(
          "The current user does not own a verified Drive connection for this library operation.",
          "library-connection-owner-required",
          403,
        );
      }
      const existing = await tx.studioExternalMediaLibrary.findUnique({
        where: {
          projectId_provider_externalRootId: {
            projectId: input.projectId,
            provider: "google-drive",
            externalRootId: input.externalRootId,
          },
        },
        include: {
          connection: { select: { userId: true, status: true } },
          items: true,
          operations: {
            where: {
              actorUserId: input.actorUserId,
              clientRequestId: normalizedRequestId,
            },
            take: 1,
          },
        },
      });
      const replay = existing?.operations[0];
      if (existing && replay) {
        if (replay.requestSha256 !== requestSha256) {
          throw new ExternalMediaLibraryError(
            "That library request identity was reused with different provider evidence.",
            "library-request-conflict",
            409,
          );
        }
        return {
          library: publicLibrary(existing, input.actorUserId),
          replayed: true,
        };
      }
      if (existing && existing.connectionId !== input.connectionId) {
        throw new ExternalMediaLibraryError(
          "That folder is already followed through another collaborator's Drive connection. Quipsly will not silently transfer refresh authority.",
          "library-connection-conflict",
          409,
        );
      }

      const previous = new Map(
        existing?.items.map((item) => [item.externalFileId, item]) ?? [],
      );
      const observedIds = new Set(inventory.map((item) => item.externalFileId));
      const addedCount = inventory.filter(
        (item) => !previous.has(item.externalFileId),
      ).length;
      const restoredCount = inventory.filter(
        (item) => previous.get(item.externalFileId)?.state === "not-observed",
      ).length;
      const changedCount = inventory.filter((item) => {
        const prior = previous.get(item.externalFileId);
        return Boolean(
          prior &&
          (prior.fileName !== item.fileName ||
            prior.observedRevisionKey !== item.observedRevisionKey ||
            prior.sizeBytes !== item.sizeBytes),
        );
      }).length;
      const notObserved = [...previous.values()].filter(
        (item) => !observedIds.has(item.externalFileId),
      );
      const unchangedCount = Math.max(
        0,
        inventory.length - addedCount - restoredCount - changedCount,
      );
      const status =
        notObserved.length > 0 || input.plan.heldSegmentCount > 0
          ? "attention"
          : "ready";
      const nextRevision = existing ? existing.revision + 1 : 1;
      const heldHealth = heldSegmentHealth(input.plan);
      const healthJson = {
        schema: "quipsly-external-media-library-health-v2",
        addedCount,
        changedCount,
        restoredCount,
        unchangedCount,
        notObservedCount: notObserved.length,
        noAutomaticDeletion: true,
        discoveryMode: selectionManifest ? "selected-files" : "folder-scan",
        ...heldHealth,
      } satisfies Prisma.InputJsonValue;

      const library = existing
        ? await tx.studioExternalMediaLibrary.update({
            where: { id: existing.id },
            data: {
              connectionId: input.connectionId,
              sharedDriveId: input.sharedDriveId,
              name: input.plan.root.name,
              status,
              revision: nextRevision,
              inventoryFingerprintSha256: fingerprint,
              totalFileCount: input.plan.totalFiles,
              totalSizeBytes: BigInt(input.plan.totalSizeBytes),
              readySegmentCount: input.plan.readySegmentCount,
              heldSegmentCount: input.plan.heldSegmentCount,
              providerLocatorJson,
              healthJson,
              lastCheckedAt: now,
              lastSuccessfulRefreshAt: now,
            },
          })
        : await tx.studioExternalMediaLibrary.create({
            data: {
              projectId: input.projectId,
              connectionId: input.connectionId,
              provider: "google-drive",
              externalRootId: input.externalRootId,
              sharedDriveId: input.sharedDriveId,
              name: input.plan.root.name,
              status,
              revision: 1,
              inventoryFingerprintSha256: fingerprint,
              totalFileCount: input.plan.totalFiles,
              totalSizeBytes: BigInt(input.plan.totalSizeBytes),
              readySegmentCount: input.plan.readySegmentCount,
              heldSegmentCount: input.plan.heldSegmentCount,
              providerLocatorJson,
              healthJson,
              lastCheckedAt: now,
              lastSuccessfulRefreshAt: now,
              clientRequestId: normalizedRequestId,
              createdByUserId: input.actorUserId,
              createdByEmail: input.actorEmail,
            },
          });

      for (const item of inventory) {
        const attachment = attachmentByFile.get(item.externalFileId);
        await tx.studioExternalMediaLibraryItem.upsert({
          where: {
            libraryId_externalFileId: {
              libraryId: library.id,
              externalFileId: item.externalFileId,
            },
          },
          create: {
            libraryId: library.id,
            externalFileId: item.externalFileId,
            sourceUnitId: attachment?.sourceUnitId,
            externalReferenceId: attachment?.externalReferenceId,
            fileName: item.fileName,
            observedRevisionKey: item.observedRevisionKey,
            sizeBytes: item.sizeBytes,
            state: "present",
            lastObservedAt: now,
          },
          update: {
            sourceUnitId: attachment?.sourceUnitId,
            externalReferenceId: attachment?.externalReferenceId,
            fileName: item.fileName,
            observedRevisionKey: item.observedRevisionKey,
            sizeBytes: item.sizeBytes,
            state: "present",
            missingObservationCount: 0,
            lastObservedAt: now,
          },
        });
      }
      for (const item of notObserved) {
        await tx.studioExternalMediaLibraryItem.update({
          where: { id: item.id },
          data: {
            state: "not-observed",
            missingObservationCount: { increment: 1 },
          },
        });
      }
      await tx.studioExternalMediaLibraryOperation.create({
        data: {
          libraryId: library.id,
          revision: nextRevision,
          previousRevision: nextRevision - 1,
          operation: existing ? "refresh-library" : "attach-library",
          outcome: status === "ready" ? "succeeded" : "needs-attention",
          actorUserId: input.actorUserId,
          clientRequestId: normalizedRequestId,
          requestSha256,
          inventoryFingerprintSha256: fingerprint,
          snapshotJson: {
            schema: "quipsly-external-media-library-receipt-v1",
            libraryId: library.id,
            revision: nextRevision,
            name: input.plan.root.name,
            status,
            totalFileCount: input.plan.totalFiles,
            totalSizeBytes: input.plan.totalSizeBytes,
            readySegmentCount: input.plan.readySegmentCount,
            heldSegmentCount: input.plan.heldSegmentCount,
            discoveryMode: selectionManifest ? "selected-files" : "folder-scan",
            health: healthJson,
          },
        },
      });
      const complete = await tx.studioExternalMediaLibrary.findUniqueOrThrow({
        where: { id: library.id },
        include: {
          connection: { select: { userId: true, status: true } },
          items: { select: { state: true } },
        },
      });
      return {
        library: publicLibrary(complete, input.actorUserId),
        replayed: false,
      };
    },
    { isolationLevel: "Serializable" },
  );
}
