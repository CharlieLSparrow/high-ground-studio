import "server-only";

import { createHash } from "node:crypto";

import {
  GOOGLE_DRIVE_SOURCE_MATERIALIZATION_PROFILE,
  GOOGLE_DRIVE_SOURCE_ORIGINAL_MATERIALIZATION_PROFILE,
  googleDriveSourceMaterializationIdentity,
} from "@high-ground/quipsly-media-processing";
import type { PrismaClient } from "@prisma/client";

import {
  externalMediaMemberRole,
  type ExternalMediaMemberRole,
} from "@/lib/external-media-contract";
import {
  publicGoogleDriveSourceMaterializationJob,
  requestGoogleDriveSourceMaterialization,
} from "@/lib/server/google-drive-source-materialization";
import { createMediaSourceSet } from "@/lib/server/source-story";

export const GOOGLE_DRIVE_SOURCE_CONFORM_PLAN_SCHEMA =
  "quipsly-google-drive-source-conform-plan-v1" as const;

export class GoogleDriveSourceConformError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "GoogleDriveSourceConformError";
  }
}

type CurrentMember = {
  referenceId: string;
  sourceRevisionId: string;
  identitySha256: string;
  name: string;
  role: ExternalMediaMemberRole;
  channel: string | null;
  sizeBytes: number;
  durationSeconds: number | null;
  sourceState: string;
  connectionId: string | null;
  connectionOwnerUserId: string | null;
  connectionStatus: string | null;
  accessState: string;
  capabilityState: string;
  exactReplicaReady: boolean;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanId(value: unknown, field: string) {
  const result = text(value);
  if (!/^[A-Za-z0-9:_-]{8,200}$/.test(result)) {
    throw new GoogleDriveSourceConformError(
      "invalid-id",
      `${field} is malformed.`,
    );
  }
  return result;
}

function requestId(value: unknown) {
  const result = text(value).toLowerCase();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      result,
    )
  ) {
    throw new GoogleDriveSourceConformError(
      "invalid-request-id",
      "The conform request identity must be a UUID.",
    );
  }
  return result;
}

function stableUuid(value: string) {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
}

function safeBytes(value: bigint | null) {
  if (!value || value <= 0n || value > BigInt(Number.MAX_SAFE_INTEGER))
    return 0;
  return Number(value);
}

function captureMetadata(value: unknown) {
  const metadata = record(value);
  return {
    captureKey: text(metadata.captureKey),
    packageStatus: text(metadata.packageStatus),
    reasons: Array.isArray(metadata.reasons)
      ? metadata.reasons.filter(
          (reason): reason is string => typeof reason === "string",
        )
      : [],
  };
}

function sameMembers(
  sourceSet: { members: Array<{ sourceRevisionId: string }> },
  members: CurrentMember[],
) {
  return (
    sourceSet.members.length === members.length &&
    sourceSet.members
      .map((member) => member.sourceRevisionId)
      .sort()
      .join(":") ===
      members
        .map((member) => member.sourceRevisionId)
        .sort()
        .join(":")
  );
}

async function readLocalExecutorStorage(prisma: PrismaClient) {
  const freshAfter = new Date(Date.now() - 30_000);
  const nodes = await prisma.agentNode.findMany({
    where: {
      status: "online",
      lastHeartbeatAt: { gte: freshAfter },
    },
    select: { capabilities: true, lastHeartbeatAt: true },
    orderBy: { lastHeartbeatAt: "desc" },
  });
  for (const node of nodes) {
    const capabilities = record(node.capabilities);
    if (capabilities.executorKind !== "local-mac") continue;
    const storage = record(capabilities.storage);
    const safeAvailableBytes = Number(storage.safeAvailableBytes);
    const availableBytes = Number(storage.availableBytes);
    const reserveBytes = Number(storage.reserveBytes);
    if (
      storage.schema === "quipsly-local-media-storage-v1" &&
      storage.status === "measured" &&
      Number.isSafeInteger(safeAvailableBytes) &&
      safeAvailableBytes >= 0 &&
      Number.isSafeInteger(availableBytes) &&
      availableBytes >= 0 &&
      Number.isSafeInteger(reserveBytes) &&
      reserveBytes >= 0
    ) {
      return {
        status: "measured" as const,
        safeAvailableBytes: String(safeAvailableBytes),
        availableBytes: String(availableBytes),
        reserveBytes: String(reserveBytes),
        measuredAt:
          text(storage.measuredAt) ||
          node.lastHeartbeatAt?.toISOString() ||
          null,
        localPathWithheld: true as const,
      };
    }
  }
  return {
    status: "unavailable" as const,
    safeAvailableBytes: null,
    availableBytes: null,
    reserveBytes: null,
    measuredAt: null,
    localPathWithheld: true as const,
  };
}

async function loadConformState(input: {
  prisma: PrismaClient;
  projectId: string;
  sourceUnitId: string;
}) {
  const sourceUnit = await input.prisma.studioSourceUnit.findFirst({
    where: {
      id: input.sourceUnitId,
      projectId: input.projectId,
      kind: "insta360-drive-segment",
    },
    include: {
      externalMediaReferences: {
        where: { provider: "google-drive" },
        include: {
          connection: {
            select: { id: true, userId: true, status: true },
          },
          revisions: {
            orderBy: { createdAt: "desc" },
            include: {
              replicas: {
                where: { storageProvider: "local-cache", status: "ready" },
                select: { id: true },
                take: 1,
              },
            },
          },
        },
      },
    },
  });
  if (!sourceUnit) {
    throw new GoogleDriveSourceConformError(
      "source-package-not-found",
      "That Drive camera package is unavailable in this Nest.",
      404,
    );
  }
  const members: CurrentMember[] = [];
  for (const reference of sourceUnit.externalMediaReferences) {
    const revision =
      reference.revisions.find(
        (candidate) => candidate.revisionKey === reference.headRevisionKey,
      ) ?? reference.revisions[0];
    if (!revision) continue;
    const projection = record(revision.projectionJson);
    const role = externalMediaMemberRole(projection.memberRole);
    if (!role) continue;
    members.push({
      referenceId: reference.id,
      sourceRevisionId: revision.id,
      identitySha256: revision.identitySha256,
      name: reference.fileName,
      role,
      channel: text(projection.channel) || null,
      sizeBytes: safeBytes(revision.sizeBytes),
      durationSeconds: revision.durationSeconds,
      sourceState: revision.sourceState,
      connectionId: reference.connection?.id ?? null,
      connectionOwnerUserId: reference.connection?.userId ?? null,
      connectionStatus: reference.connection?.status ?? null,
      accessState: reference.accessState,
      capabilityState: reference.capabilityState,
      exactReplicaReady: revision.replicas.length > 0,
    });
  }
  members.sort(
    (left, right) =>
      left.role.localeCompare(right.role) ||
      (left.channel ?? "").localeCompare(right.channel ?? "") ||
      left.name.localeCompare(right.name),
  );
  return { sourceUnit, members };
}

export async function planGoogleDriveSourceUnitConform(input: {
  prisma: PrismaClient;
  projectId: string;
  sourceUnitId: string;
  actorUserId?: string;
}) {
  const projectId = cleanId(input.projectId, "projectId");
  const sourceUnitId = cleanId(input.sourceUnitId, "sourceUnitId");
  const actorUserId = input.actorUserId
    ? cleanId(input.actorUserId, "actorUserId")
    : null;
  const { sourceUnit, members } = await loadConformState({
    prisma: input.prisma,
    projectId,
    sourceUnitId,
  });
  const metadata = captureMetadata(sourceUnit.metadataJson);
  const browse = members.filter((member) => member.role === "browse-proxy");
  const originals = members.filter((member) => member.role !== "browse-proxy");
  const holds = [...metadata.reasons];
  if (!metadata.captureKey)
    holds.push("The camera package has no capture key.");
  if (browse.length !== 1)
    holds.push("Final conform requires exactly one browsing clock member.");
  if (!originals.some((member) => member.role === "primary-original"))
    holds.push("Final conform requires a primary exact original.");
  if (members.some((member) => member.sizeBytes <= 0))
    holds.push("At least one package member has no verified byte count.");
  if (
    members.some(
      (member) =>
        member.accessState !== "available" ||
        member.capabilityState !== "downloadable",
    )
  )
    holds.push("At least one package member is no longer downloadable.");
  if (
    actorUserId &&
    members.some((member) => member.connectionOwnerUserId !== actorUserId)
  )
    holds.push(
      "Reconnect this Drive package as the signed-in user before preparing originals.",
    );
  // The materializer identity includes the real project. Rebuild its IDs here
  // instead of exposing any provider locator or local path.
  const memberJobIds = new Map(
    members.map((member) => {
      const profile =
        member.role === "browse-proxy"
          ? GOOGLE_DRIVE_SOURCE_MATERIALIZATION_PROFILE
          : GOOGLE_DRIVE_SOURCE_ORIGINAL_MATERIALIZATION_PROFILE;
      const identity = googleDriveSourceMaterializationIdentity({
        projectId,
        sourceRevisionId: member.sourceRevisionId,
        identitySha256: member.identitySha256,
        profile,
      });
      return [
        member.sourceRevisionId,
        `gdmjob_${createHash("sha256").update(identity).digest("hex").slice(0, 48)}`,
      ];
    }),
  );
  const [jobs, executorStorage] = await Promise.all([
    input.prisma.studioWorkflowJob.findMany({
      where: { id: { in: [...memberJobIds.values()] } },
      select: {
        id: true,
        status: true,
        resultJson: true,
        error: true,
        updatedAt: true,
      },
    }),
    readLocalExecutorStorage(input.prisma),
  ]);
  const jobById = new Map(jobs.map((job) => [job.id, job]));
  const totalBytes = members.reduce(
    (total, member) => total + member.sizeBytes,
    0,
  );
  const originalBytes = originals.reduce(
    (total, member) => total + member.sizeBytes,
    0,
  );
  const cachedBytes = members
    .filter((member) => member.exactReplicaReady)
    .reduce((total, member) => total + member.sizeBytes, 0);
  const remainingBytes = totalBytes - cachedBytes;
  const storageShortfallBytes =
    executorStorage.status === "measured"
      ? Math.max(0, remainingBytes - Number(executorStorage.safeAvailableBytes))
      : 0;
  if (storageShortfallBytes > 0) {
    holds.push(
      "This Mac does not have enough safe storage for the complete exact package.",
    );
  }
  const allExact =
    members.length > 0 && members.every((member) => member.exactReplicaReady);
  if (
    allExact &&
    (!browse[0]?.durationSeconds || browse[0].durationSeconds <= 0)
  )
    holds.push(
      "The browsing clock is exact but its duration is still being measured.",
    );
  const sourceSets = metadata.captureKey
    ? await input.prisma.studioMediaSourceSet.findMany({
        where: { projectId, captureKey: metadata.captureKey },
        include: { members: { select: { sourceRevisionId: true } } },
        orderBy: { createdAt: "desc" },
      })
    : [];
  const sourceSet = sourceSets.find((candidate) =>
    sameMembers(candidate, members),
  );
  const activeJobs = jobs.some((job) =>
    ["queued", "processing"].includes(job.status),
  );
  const status =
    sourceSet && allExact
      ? "render-ready"
      : holds.length > 0
        ? "held"
        : allExact
          ? "ready-to-bind"
          : activeJobs
            ? "preparing"
            : "needs-preparation";
  return {
    schema: GOOGLE_DRIVE_SOURCE_CONFORM_PLAN_SCHEMA,
    sourceUnit: {
      id: sourceUnit.id,
      title: sourceUnit.title,
      captureKey: metadata.captureKey || null,
    },
    status,
    holds: [...new Set(holds)],
    storage: {
      totalBytes: String(totalBytes),
      originalBytes: String(originalBytes),
      cachedBytes: String(cachedBytes),
      remainingBytes: String(remainingBytes),
      shortfallBytes: String(storageShortfallBytes),
      executor: executorStorage,
    },
    members: members.map((member) => {
      const job = jobById.get(memberJobIds.get(member.sourceRevisionId) ?? "");
      return {
        referenceId: member.referenceId,
        sourceRevisionId: member.sourceRevisionId,
        name: member.name,
        role: member.role,
        channel: member.channel,
        sizeBytes: String(member.sizeBytes),
        durationSeconds: member.durationSeconds,
        sourceState: member.sourceState,
        exactReplicaReady: member.exactReplicaReady,
        materializationJob: job
          ? publicGoogleDriveSourceMaterializationJob(job)
          : null,
      };
    }),
    sourceSet: sourceSet
      ? {
          id: sourceSet.id,
          identitySha256: sourceSet.identitySha256,
          completeness: sourceSet.completeness,
        }
      : null,
  };
}

export async function requestGoogleDriveSourceUnitConform(input: {
  prisma: PrismaClient;
  projectId: string;
  sourceUnitId: string;
  actorUserId: string;
  actorEmail: string;
  clientRequestId: string;
  expectedRemainingBytes: string;
  retryFailed?: boolean;
  environment?: NodeJS.ProcessEnv;
}) {
  const actorUserId = cleanId(input.actorUserId, "actorUserId");
  const clientRequestId = requestId(input.clientRequestId);
  const initial = await planGoogleDriveSourceUnitConform({
    prisma: input.prisma,
    projectId: input.projectId,
    sourceUnitId: input.sourceUnitId,
    actorUserId,
  });
  if (initial.storage.remainingBytes !== input.expectedRemainingBytes) {
    throw new GoogleDriveSourceConformError(
      "stale-storage-plan",
      "This camera package changed after its storage estimate was shown. Review the updated byte total before continuing.",
      409,
    );
  }
  if (initial.status === "render-ready") return initial;
  const structuralHolds = initial.holds.filter(
    (hold) =>
      hold !==
      "The browsing clock is exact but its duration is still being measured.",
  );
  if (structuralHolds.length > 0) {
    throw new GoogleDriveSourceConformError(
      "source-package-held",
      structuralHolds.join(" "),
      409,
    );
  }
  for (const member of initial.members.filter(
    (candidate) => !candidate.exactReplicaReady,
  )) {
    await requestGoogleDriveSourceMaterialization({
      prisma: input.prisma,
      projectId: input.projectId,
      referenceId: member.referenceId,
      sourceRevisionId: member.sourceRevisionId,
      actorUserId,
      actorEmail: input.actorEmail,
      clientRequestId: stableUuid(
        `${clientRequestId}:${member.sourceRevisionId}`,
      ),
      retryFailed: input.retryFailed,
      purpose: member.role === "browse-proxy" ? "browse" : "conform",
      environment: input.environment,
    });
  }
  let current = await planGoogleDriveSourceUnitConform({
    prisma: input.prisma,
    projectId: input.projectId,
    sourceUnitId: input.sourceUnitId,
    actorUserId,
  });
  if (current.status !== "ready-to-bind") return current;
  const browse = current.members.find(
    (member) => member.role === "browse-proxy",
  )!;
  await createMediaSourceSet({
    prisma: input.prisma,
    actorUserId,
    value: {
      projectId: input.projectId,
      clientRequestId: stableUuid(
        `drive-source-set:${input.sourceUnitId}:${current.members
          .map((member) => member.sourceRevisionId)
          .sort()
          .join(":")}`,
      ),
      kind: "insta360-360",
      captureKey: current.sourceUnit.captureKey!,
      displayName: current.sourceUnit.title,
      sourceClockRevisionId: browse.sourceRevisionId,
      members: current.members.map((member, ordinal) => ({
        sourceRevisionId: member.sourceRevisionId,
        role: member.role,
        ordinal,
        requiredForRender: member.role !== "browse-proxy",
      })),
      metadata: {
        schema: "quipsly-google-drive-source-set-v1",
        provider: "google-drive",
        sourceUnitId: input.sourceUnitId,
        exactMembersVerifiedLocally: true,
        originalRemainsInDrive: true,
      },
    },
  });
  current = await planGoogleDriveSourceUnitConform({
    prisma: input.prisma,
    projectId: input.projectId,
    sourceUnitId: input.sourceUnitId,
    actorUserId,
  });
  return current;
}
