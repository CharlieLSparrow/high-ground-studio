import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";

import { externalMediaMemberRole } from "@/lib/external-media-contract";
import { publicSourceAudioNavigationStatus } from "@/lib/server/source-audio-navigation";
import { publicGoogleDriveSourceMaterializationJob } from "@/lib/server/google-drive-source-materialization";
import {
  readLocalExecutorTargets,
  type LocalExecutorTarget,
} from "@/lib/server/local-executor-storage";
import { publicSourceVisualNavigationFrames } from "@/lib/server/source-visual-overview";

const CURSOR_SCHEMA = "quipsly-source-library-cursor-v1" as const;
const DEFAULT_PAGE_SIZE = 60;
const MAX_PAGE_SIZE = 120;

type SourceKind = "source-set" | "external" | "asset";
type CursorPoint = { createdAt: string; id: string };
type SourceLibraryCursor = {
  schema: typeof CURSOR_SCHEMA;
  sourceSet: CursorPoint | null;
  external: CursorPoint | null;
  asset: CursorPoint | null;
};

const derivativeSelect = {
  id: true,
  kind: true,
  profile: true,
  sizeBytes: true,
  mimeType: true,
  durationSeconds: true,
  widthPixels: true,
  heightPixels: true,
  framesPerSecond: true,
  custodianNodeId: true,
  storageScopeId: true,
  verificationJson: true,
  createdAt: true,
} satisfies Prisma.StudioMediaDerivativeSelect;

const sourceSetSelect = {
  id: true,
  kind: true,
  captureKey: true,
  displayName: true,
  identitySha256: true,
  completeness: true,
  createdAt: true,
  sourceClockRevision: {
    select: {
      id: true,
      durationSeconds: true,
      widthPixels: true,
      heightPixels: true,
      framesPerSecond: true,
      mediaProjection: true,
      projectionJson: true,
      externalReference: {
        select: { id: true, fileName: true, provider: true },
      },
      derivatives: {
        where: {
          kind: {
            in: [
              "collaboration-proxy",
              "spatial-stitch-master",
              "source-contact-sheet",
            ],
          },
          status: "ready",
        },
        orderBy: { createdAt: "desc" },
        take: 12,
        select: derivativeSelect,
      },
      replicas: {
        where: { storageProvider: "local-cache" },
        orderBy: { createdAt: "desc" },
        take: 12,
        select: {
          id: true,
          custodianNodeId: true,
          storageScopeId: true,
          status: true,
          availabilityCheckedAt: true,
          contentVerifiedAt: true,
          unavailableAt: true,
        },
      },
    },
  },
  members: {
    orderBy: [{ role: "asc" }, { ordinal: "asc" }],
    select: {
      id: true,
      role: true,
      ordinal: true,
      requiredForRender: true,
      memberIdentitySha256: true,
      sourceRevision: {
        select: {
          id: true,
          contentSha256: true,
          sizeBytes: true,
          durationSeconds: true,
          sourceState: true,
          externalReference: {
            select: {
              id: true,
              provider: true,
              fileName: true,
              mimeType: true,
              accessState: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.StudioMediaSourceSetSelect;

const externalSelect = {
  id: true,
  sourceUnit: {
    select: {
      id: true,
      kind: true,
      title: true,
      capturedAt: true,
      metadataJson: true,
    },
  },
  provider: true,
  fileName: true,
  mimeType: true,
  sizeBytes: true,
  headRevisionKey: true,
  providerCreatedAt: true,
  providerModifiedAt: true,
  accessState: true,
  capabilityState: true,
  lastVerifiedAt: true,
  revision: true,
  createdAt: true,
  revisions: {
    orderBy: { createdAt: "desc" },
    take: 1,
    select: {
      id: true,
      revisionKey: true,
      identitySha256: true,
      contentSha256: true,
      sizeBytes: true,
      sourceState: true,
      projectionJson: true,
      verifiedAt: true,
      durationSeconds: true,
      widthPixels: true,
      heightPixels: true,
      framesPerSecond: true,
      replicas: {
        where: { storageProvider: "local-cache" },
        orderBy: { createdAt: "desc" },
        take: 12,
        select: {
          id: true,
          custodianNodeId: true,
          storageScopeId: true,
          status: true,
          contentSha256: true,
          sizeBytes: true,
          mimeType: true,
          availabilityCheckedAt: true,
          contentVerifiedAt: true,
          unavailableAt: true,
          createdAt: true,
        },
      },
      derivatives: {
        where: {
          kind: { in: ["collaboration-proxy", "source-contact-sheet"] },
          status: "ready",
        },
        orderBy: { createdAt: "desc" },
        take: 12,
        select: derivativeSelect,
      },
    },
  },
} satisfies Prisma.StudioExternalMediaReferenceSelect;

const assetSelect = {
  id: true,
  filename: true,
  url: true,
  mimeType: true,
  sizeBytes: true,
  duration: true,
  resolution: true,
  fps: true,
  thumbnailUrl: true,
  isProxy: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { clips: true, variants: true } },
} satisfies Prisma.StudioMediaAssetSelect;

function publicDerivative(
  derivative:
    | {
        id: string;
        kind: string;
        profile: string;
        sizeBytes: bigint;
        mimeType: string;
        durationSeconds: number | null;
        widthPixels: number | null;
        heightPixels: number | null;
        framesPerSecond: number | null;
        custodianNodeId: string | null;
        storageScopeId: string | null;
        verificationJson: unknown;
        createdAt: Date;
      }
    | undefined,
) {
  return derivative
    ? {
        id: derivative.id,
        kind: derivative.kind,
        profile: derivative.profile,
        sizeBytes: derivative.sizeBytes.toString(),
        mimeType: derivative.mimeType,
        durationSeconds: derivative.durationSeconds,
        widthPixels: derivative.widthPixels,
        heightPixels: derivative.heightPixels,
        framesPerSecond: derivative.framesPerSecond,
        createdAt: derivative.createdAt.toISOString(),
        executorCustody:
          derivative.custodianNodeId && derivative.storageScopeId
            ? {
                nodeId: derivative.custodianNodeId,
                storageScopeId: derivative.storageScopeId,
              }
            : null,
        playbackUrl: `/api/media/derivatives/${encodeURIComponent(derivative.id)}`,
        navigationFrames:
          derivative.kind === "source-contact-sheet"
            ? publicSourceVisualNavigationFrames(derivative.verificationJson)
            : null,
      }
    : null;
}

type ExecutorScopedArtifact = {
  custodianNodeId: string | null;
  storageScopeId: string | null;
};

function artifactForExecutor<T extends ExecutorScopedArtifact>(
  artifacts: T[],
  executor: LocalExecutorTarget | null,
) {
  const exact = executor
    ? artifacts.find(
        (artifact) =>
          artifact.custodianNodeId === executor.nodeId &&
          artifact.storageScopeId === executor.storageScopeId,
      )
    : null;
  return (
    exact ??
    artifacts.find(
      (artifact) =>
        artifact.custodianNodeId === null && artifact.storageScopeId === null,
    )
  );
}

function derivativeForExecutor<
  T extends ExecutorScopedArtifact & { kind: string },
>(derivatives: T[], kind: string, executor: LocalExecutorTarget | null) {
  return artifactForExecutor(
    derivatives.filter((derivative) => derivative.kind === kind),
    executor,
  );
}

function executorLabel(hostName: string) {
  return hostName.replace(/^quipsly-media-worker:/, "").trim() || "Local Mac";
}

function jobProjectionRank(
  resultJson: unknown,
  executor: LocalExecutorTarget | null,
) {
  const target = jsonRecord(jsonRecord(resultJson)?.executionTarget);
  const nodeId =
    typeof target?.custodianNodeId === "string" ? target.custodianNodeId : null;
  const storageScopeId =
    typeof target?.storageScopeId === "string" ? target.storageScopeId : null;
  if (!nodeId && !storageScopeId) return executor ? 1 : 0;
  return executor &&
    nodeId === executor.nodeId &&
    storageScopeId === executor.storageScopeId
    ? 0
    : 2;
}

function cursorPoint(value: unknown): CursorPoint | null {
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("invalid-source-library-cursor");
  const point = value as Record<string, unknown>;
  if (
    typeof point.createdAt !== "string" ||
    !Number.isFinite(Date.parse(point.createdAt)) ||
    typeof point.id !== "string" ||
    !point.id
  ) {
    throw new Error("invalid-source-library-cursor");
  }
  return { createdAt: new Date(point.createdAt).toISOString(), id: point.id };
}

export function decodeSourceLibraryCursor(
  value: string | null | undefined,
): SourceLibraryCursor {
  if (!value)
    return {
      schema: CURSOR_SCHEMA,
      sourceSet: null,
      external: null,
      asset: null,
    };
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Record<string, unknown>;
    if (parsed.schema !== CURSOR_SCHEMA)
      throw new Error("invalid-source-library-cursor");
    return {
      schema: CURSOR_SCHEMA,
      sourceSet: cursorPoint(parsed.sourceSet),
      external: cursorPoint(parsed.external),
      asset: cursorPoint(parsed.asset),
    };
  } catch {
    throw Object.assign(
      new Error(
        "The source-library cursor is malformed or from an unsupported version.",
      ),
      {
        code: "invalid-source-library-cursor",
        status: 400,
      },
    );
  }
}

function encodeSourceLibraryCursor(cursor: SourceLibraryCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function afterCursor(point: CursorPoint | null) {
  if (!point) return undefined;
  const createdAt = new Date(point.createdAt);
  return {
    OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: point.id } }],
  };
}

function cleanQuery(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ").slice(0, 160);
}

function pageSize(value: number | null | undefined) {
  if (!Number.isFinite(value)) return DEFAULT_PAGE_SIZE;
  return Math.max(1, Math.min(MAX_PAGE_SIZE, Math.trunc(value!)));
}

function externalWhere(
  projectId: string,
  query: string,
  cursor: CursorPoint | null,
): Prisma.StudioExternalMediaReferenceWhereInput {
  return {
    AND: [
      { projectId },
      // A connected file that participates in a logical camera package is
      // represented by that package, not duplicated as a loose source.
      { revisions: { none: { sourceSetMembers: { some: {} } } } },
      query
        ? {
            OR: [
              { id: query },
              { fileName: { contains: query, mode: "insensitive" } },
              { provider: { contains: query, mode: "insensitive" } },
              { mimeType: { contains: query, mode: "insensitive" } },
            ],
          }
        : {},
      afterCursor(cursor) ?? {},
    ],
  };
}

function sourceSetWhere(
  projectId: string,
  query: string,
  cursor: CursorPoint | null,
): Prisma.StudioMediaSourceSetWhereInput {
  return {
    AND: [
      { projectId },
      query
        ? {
            OR: [
              { id: query },
              { displayName: { contains: query, mode: "insensitive" } },
              { captureKey: { contains: query, mode: "insensitive" } },
              { kind: { contains: query, mode: "insensitive" } },
              {
                members: {
                  some: {
                    sourceRevision: {
                      externalReference: {
                        fileName: { contains: query, mode: "insensitive" },
                      },
                    },
                  },
                },
              },
            ],
          }
        : {},
      afterCursor(cursor) ?? {},
    ],
  };
}

function assetProjectScope(
  projectId: string,
): Prisma.StudioMediaAssetWhereInput {
  return {
    OR: [
      { projects: { some: { id: projectId } } },
      { mediaBin: { projectId } },
      { assetAttachments: { some: { projectId } } },
    ],
  };
}

function assetWhere(
  projectId: string,
  query: string,
  cursor: CursorPoint | null,
): Prisma.StudioMediaAssetWhereInput {
  return {
    AND: [
      assetProjectScope(projectId),
      { mediaSourceRevisions: { none: { sourceSetMembers: { some: {} } } } },
      query
        ? {
            OR: [
              { id: query },
              { filename: { contains: query, mode: "insensitive" } },
              { mimeType: { contains: query, mode: "insensitive" } },
              { cloudProvider: { contains: query, mode: "insensitive" } },
            ],
          }
        : {},
      afterCursor(cursor) ?? {},
    ],
  };
}

function jsonRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export async function readSourceLibraryPage(input: {
  prisma: PrismaClient;
  projectId: string;
  executorNodeId?: string | null;
  cursor?: string | null;
  limit?: number | null;
  query?: string | null;
}) {
  const cursor = decodeSourceLibraryCursor(input.cursor);
  const limit = pageSize(input.limit);
  const query = cleanQuery(input.query);
  const executorTargets = await readLocalExecutorTargets(input.prisma);
  const selectedExecutor = input.executorNodeId
    ? (executorTargets.find(
        (target) => target.nodeId === input.executorNodeId,
      ) ?? null)
    : (executorTargets[0] ?? null);
  const setWhere = sourceSetWhere(input.projectId, query, cursor.sourceSet);
  const connectedWhere = externalWhere(input.projectId, query, cursor.external);
  const mediaWhere = assetWhere(input.projectId, query, cursor.asset);
  const [
    sourceSets,
    externalSources,
    assets,
    sourceSetTotal,
    externalTotal,
    assetTotal,
  ] = await Promise.all([
    input.prisma.studioMediaSourceSet.findMany({
      where: setWhere,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      select: sourceSetSelect,
    }),
    input.prisma.studioExternalMediaReference.findMany({
      where: connectedWhere,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      select: externalSelect,
    }),
    input.prisma.studioMediaAsset.findMany({
      where: mediaWhere,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      select: assetSelect,
    }),
    input.prisma.studioMediaSourceSet.count({
      where: sourceSetWhere(input.projectId, query, null),
    }),
    input.prisma.studioExternalMediaReference.count({
      where: externalWhere(input.projectId, query, null),
    }),
    input.prisma.studioMediaAsset.count({
      where: assetWhere(input.projectId, query, null),
    }),
  ]);

  const candidates: Array<{ kind: SourceKind; id: string; createdAt: Date }> = [
    ...sourceSets.map((row) => ({
      kind: "source-set" as const,
      id: row.id,
      createdAt: row.createdAt,
    })),
    ...externalSources.map((row) => ({
      kind: "external" as const,
      id: row.id,
      createdAt: row.createdAt,
    })),
    ...assets.map((row) => ({
      kind: "asset" as const,
      id: row.id,
      createdAt: row.createdAt,
    })),
  ].sort((left, right) => {
    const time = right.createdAt.getTime() - left.createdAt.getTime();
    if (time) return time;
    const rank: Record<SourceKind, number> = {
      "source-set": 0,
      external: 1,
      asset: 2,
    };
    return (
      rank[left.kind] - rank[right.kind] || right.id.localeCompare(left.id)
    );
  });
  const emitted = candidates.slice(0, limit);
  const emittedKeys = new Set(emitted.map((row) => `${row.kind}:${row.id}`));
  const nextCursor: SourceLibraryCursor = { ...cursor };
  for (const row of emitted) {
    const point = { createdAt: row.createdAt.toISOString(), id: row.id };
    if (row.kind === "source-set") nextCursor.sourceSet = point;
    else if (row.kind === "external") nextCursor.external = point;
    else nextCursor.asset = point;
  }
  const complete = candidates.length <= limit;

  const emittedSets = sourceSets.filter((row) =>
    emittedKeys.has(`source-set:${row.id}`),
  );
  const emittedExternal = externalSources.filter((row) =>
    emittedKeys.has(`external:${row.id}`),
  );
  const emittedExternalIds = new Set(emittedExternal.map((row) => row.id));
  const missingPackageReferenceIds = [
    ...new Set(
      emittedSets.flatMap((sourceSet) =>
        sourceSet.members.flatMap((member) => {
          const id = member.sourceRevision.externalReference?.id;
          return id && !emittedExternalIds.has(id) ? [id] : [];
        }),
      ),
    ),
  ];
  const packageExternalSources = missingPackageReferenceIds.length
    ? await input.prisma.studioExternalMediaReference.findMany({
        where: {
          projectId: input.projectId,
          id: { in: missingPackageReferenceIds },
        },
        select: externalSelect,
      })
    : [];
  const projectedExternal = [...emittedExternal, ...packageExternalSources];
  const emittedAssets = assets.filter((row) =>
    emittedKeys.has(`asset:${row.id}`),
  );
  const revisionIds = [
    ...emittedSets.map((sourceSet) => sourceSet.sourceClockRevision.id),
    ...projectedExternal.flatMap((source) =>
      source.revisions[0]?.id ? [source.revisions[0].id] : [],
    ),
  ];
  const sourceJobs = revisionIds.length
    ? await input.prisma.studioWorkflowJob.findMany({
        where: {
          projectId: input.projectId,
          OR: [
            {
              type: "external-source-proxy",
              source: "source-story.external-proxy",
            },
            {
              type: "source-visual-overview",
              source: "source-story.visual-overview",
            },
            {
              type: "source-audio-navigation",
              source: "source-story.audio-navigation",
            },
            {
              type: "google-drive-source-materialization",
              source: "source-story.google-drive-materialization",
            },
          ],
        },
        orderBy: { updatedAt: "desc" },
        take: Math.min(500, Math.max(50, revisionIds.length * 8)),
        select: {
          id: true,
          type: true,
          status: true,
          inputJson: true,
          resultJson: true,
          error: true,
          updatedAt: true,
        },
      })
    : [];
  const proxyJobBySourceRevisionId = new Map<
    string,
    {
      id: string;
      status: string;
      failureCode: string | null;
      updatedAt: string;
    }
  >();
  const visualJobBySourceRevisionId = new Map<
    string,
    {
      id: string;
      status: string;
      failureCode: string | null;
      updatedAt: string;
    }
  >();
  const audioNavigationBySourceRevisionId = new Map<
    string,
    ReturnType<typeof publicSourceAudioNavigationStatus>
  >();
  const driveMaterializationBySourceRevisionId = new Map<
    string,
    ReturnType<typeof publicGoogleDriveSourceMaterializationJob>
  >();
  const projectedSourceJobs = sourceJobs
    .map((job) => ({
      job,
      rank: jobProjectionRank(job.resultJson, selectedExecutor),
    }))
    .filter((entry) => entry.rank < 2)
    .sort(
      (left, right) =>
        left.rank - right.rank ||
        right.job.updatedAt.getTime() - left.job.updatedAt.getTime(),
    )
    .map((entry) => entry.job);
  for (const job of projectedSourceJobs) {
    const source = jsonRecord(jsonRecord(job.inputJson)?.source);
    const sourceRevisionId =
      typeof source?.sourceRevisionId === "string"
        ? source.sourceRevisionId
        : "";
    if (job.type === "source-audio-navigation") {
      if (
        !revisionIds.includes(sourceRevisionId) ||
        audioNavigationBySourceRevisionId.has(sourceRevisionId)
      )
        continue;
      audioNavigationBySourceRevisionId.set(
        sourceRevisionId,
        publicSourceAudioNavigationStatus(job),
      );
      continue;
    }
    if (job.type === "google-drive-source-materialization") {
      if (
        !revisionIds.includes(sourceRevisionId) ||
        driveMaterializationBySourceRevisionId.has(sourceRevisionId)
      )
        continue;
      driveMaterializationBySourceRevisionId.set(
        sourceRevisionId,
        publicGoogleDriveSourceMaterializationJob(job),
      );
      continue;
    }
    const target =
      job.type === "source-visual-overview"
        ? visualJobBySourceRevisionId
        : proxyJobBySourceRevisionId;
    if (!revisionIds.includes(sourceRevisionId) || target.has(sourceRevisionId))
      continue;
    const failure = jsonRecord(jsonRecord(job.resultJson)?.failure);
    target.set(sourceRevisionId, {
      id: job.id,
      status: job.status,
      failureCode: typeof failure?.code === "string" ? failure.code : null,
      updatedAt: job.updatedAt.toISOString(),
    });
  }

  return {
    schema: "quipsly-source-library-page-v1" as const,
    executorProjection: {
      requestedNodeId: input.executorNodeId ?? null,
      selected: selectedExecutor
        ? {
            nodeId: selectedExecutor.nodeId,
            storageScopeId: selectedExecutor.storageScopeId,
            label: executorLabel(selectedExecutor.hostName),
            storage: selectedExecutor.storage,
          }
        : null,
      options: executorTargets.map((target) => ({
        nodeId: target.nodeId,
        storageScopeId: target.storageScopeId,
        label: executorLabel(target.hostName),
        storage: target.storage,
      })),
    },
    query,
    orderedKeys: emitted.map((row) => `${row.kind}:${row.id}`),
    sourceSets: emittedSets.map((sourceSet) => {
      const sourceClockRevision = sourceSet.sourceClockRevision;
      const localReplica = artifactForExecutor(
        sourceClockRevision.replicas,
        selectedExecutor,
      );
      return {
        ...sourceSet,
        createdAt: sourceSet.createdAt.toISOString(),
        sourceClockRevision: {
          ...sourceClockRevision,
          projectionMetadata: sourceSet.sourceClockRevision.projectionJson,
          projectionJson: undefined,
          collaborationProxy: publicDerivative(
            derivativeForExecutor(
              sourceClockRevision.derivatives,
              "collaboration-proxy",
              selectedExecutor,
            ),
          ),
          spatialStitchMaster: publicDerivative(
            derivativeForExecutor(
              sourceClockRevision.derivatives,
              "spatial-stitch-master",
              selectedExecutor,
            ),
          ),
          visualOverview: publicDerivative(
            derivativeForExecutor(
              sourceClockRevision.derivatives,
              "source-contact-sheet",
              selectedExecutor,
            ),
          ),
          localReplicaAvailability: localReplica
            ? {
                id: localReplica.id,
                status: localReplica.status,
                availabilityCheckedAt:
                  localReplica.availabilityCheckedAt?.toISOString() ?? null,
                contentVerifiedAt:
                  localReplica.contentVerifiedAt?.toISOString() ?? null,
                unavailableAt:
                  localReplica.unavailableAt?.toISOString() ?? null,
                pathWithheld: true as const,
              }
            : null,
          replicas: undefined,
          visualOverviewJob:
            visualJobBySourceRevisionId.get(sourceSet.sourceClockRevision.id) ??
            null,
          audioNavigation:
            audioNavigationBySourceRevisionId.get(
              sourceSet.sourceClockRevision.id,
            ) ?? null,
          derivatives: undefined,
        },
        members: sourceSet.members.map((member) => ({
          ...member,
          sourceRevision: {
            ...member.sourceRevision,
            sizeBytes: member.sourceRevision.sizeBytes?.toString() ?? null,
          },
        })),
      };
    }),
    externalSources: projectedExternal.map(({ revisions, ...source }) => {
      const latestRevision = revisions[0];
      const exactReplica = latestRevision
        ? artifactForExecutor(latestRevision.replicas, selectedExecutor)
        : undefined;
      return {
        ...source,
        sizeBytes: source.sizeBytes?.toString() ?? null,
        providerCreatedAt: source.providerCreatedAt?.toISOString() ?? null,
        providerModifiedAt: source.providerModifiedAt?.toISOString() ?? null,
        lastVerifiedAt: source.lastVerifiedAt?.toISOString() ?? null,
        createdAt: source.createdAt.toISOString(),
        latestSourceRevision: latestRevision
          ? {
              ...latestRevision,
              derivatives: undefined,
              replicas: undefined,
              projectionJson: undefined,
              memberRole: externalMediaMemberRole(
                jsonRecord(latestRevision.projectionJson)?.memberRole,
              ),
              sizeBytes: latestRevision.sizeBytes?.toString() ?? null,
              verifiedAt: latestRevision.verifiedAt?.toISOString() ?? null,
              collaborationProxy: publicDerivative(
                derivativeForExecutor(
                  latestRevision.derivatives,
                  "collaboration-proxy",
                  selectedExecutor,
                ),
              ),
              visualOverview: publicDerivative(
                derivativeForExecutor(
                  latestRevision.derivatives,
                  "source-contact-sheet",
                  selectedExecutor,
                ),
              ),
              proxyJob:
                proxyJobBySourceRevisionId.get(latestRevision.id) ?? null,
              exactReplica:
                exactReplica?.status === "ready"
                  ? {
                      id: exactReplica.id,
                      contentSha256: exactReplica.contentSha256,
                      sizeBytes: exactReplica.sizeBytes.toString(),
                      mimeType: exactReplica.mimeType,
                      createdAt: exactReplica.createdAt.toISOString(),
                    }
                  : null,
              localReplicaAvailability: exactReplica
                ? {
                    id: exactReplica.id,
                    status: exactReplica.status,
                    sizeBytes: exactReplica.sizeBytes.toString(),
                    availabilityCheckedAt:
                      exactReplica.availabilityCheckedAt?.toISOString() ?? null,
                    contentVerifiedAt:
                      exactReplica.contentVerifiedAt?.toISOString() ?? null,
                    unavailableAt:
                      exactReplica.unavailableAt?.toISOString() ?? null,
                    pathWithheld: true as const,
                  }
                : null,
              materializationJob:
                driveMaterializationBySourceRevisionId.get(latestRevision.id) ??
                null,
              visualOverviewJob:
                visualJobBySourceRevisionId.get(latestRevision.id) ?? null,
              audioNavigation:
                audioNavigationBySourceRevisionId.get(latestRevision.id) ??
                null,
            }
          : null,
      };
    }),
    assets: emittedAssets.map((asset) => ({
      ...asset,
      sizeBytes: asset.sizeBytes?.toString() ?? null,
      createdAt: asset.createdAt.toISOString(),
      updatedAt: asset.updatedAt.toISOString(),
    })),
    pageInfo: {
      limit,
      returned: emitted.length,
      complete,
      nextCursor: complete ? null : encodeSourceLibraryCursor(nextCursor),
      totals: {
        sourceSets: sourceSetTotal,
        externalSources: externalTotal,
        assets: assetTotal,
        all: sourceSetTotal + externalTotal + assetTotal,
      },
    },
  };
}

export type SourceLibraryPage = Awaited<
  ReturnType<typeof readSourceLibraryPage>
>;
