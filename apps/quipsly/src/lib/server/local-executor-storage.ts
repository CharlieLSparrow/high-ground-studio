import "server-only";

import type { PrismaClient } from "@prisma/client";

import type { LocalExecutorStorageProjection } from "@/lib/external-media-library-contract";

export type PublicLocalExecutorStorage = LocalExecutorStorageProjection;
export type LocalExecutorTarget = {
  nodeId: string;
  hostName: string;
  storageScopeId: string;
  storage: PublicLocalExecutorStorage;
};

const UNAVAILABLE_LOCAL_EXECUTOR_STORAGE: PublicLocalExecutorStorage = {
  status: "unavailable",
  safeAvailableBytes: null,
  availableBytes: null,
  reserveBytes: null,
  measuredAt: null,
  workspaceMode: "unknown",
  localPathWithheld: true,
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function safeId(value: unknown) {
  const result = text(value);
  return /^[A-Za-z0-9:_-]{8,200}$/.test(result) ? result : null;
}

function safeNonNegativeInteger(value: unknown) {
  const result = Number(value);
  return Number.isSafeInteger(result) && result >= 0 ? result : null;
}

export function publicLocalExecutorStorage(input: {
  capabilities: unknown;
  lastHeartbeatAt: Date | null;
}): PublicLocalExecutorStorage | null {
  const capabilities = record(input.capabilities);
  if (capabilities.executorKind !== "local-mac") return null;
  const storage = record(capabilities.storage);
  const safeAvailableBytes = safeNonNegativeInteger(storage.safeAvailableBytes);
  const availableBytes = safeNonNegativeInteger(storage.availableBytes);
  const reserveBytes = safeNonNegativeInteger(storage.reserveBytes);
  if (
    storage.schema !== "quipsly-local-media-storage-v1" ||
    storage.status !== "measured" ||
    safeAvailableBytes === null ||
    availableBytes === null ||
    reserveBytes === null
  ) {
    return { ...UNAVAILABLE_LOCAL_EXECUTOR_STORAGE };
  }
  const workspaceMode =
    storage.workspaceMode === "durable" || storage.workspaceMode === "temporary"
      ? storage.workspaceMode
      : "unknown";
  return {
    status: "measured",
    safeAvailableBytes: String(safeAvailableBytes),
    availableBytes: String(availableBytes),
    reserveBytes: String(reserveBytes),
    measuredAt:
      text(storage.measuredAt) || input.lastHeartbeatAt?.toISOString() || null,
    workspaceMode,
    localPathWithheld: true,
  };
}

export async function readLocalExecutorStorage(
  prisma: PrismaClient,
): Promise<PublicLocalExecutorStorage> {
  return (
    (await readLocalExecutorTarget(prisma))?.storage ?? {
      ...UNAVAILABLE_LOCAL_EXECUTOR_STORAGE,
    }
  );
}

export async function readLocalExecutorTarget(
  prisma: PrismaClient,
  preferredNodeId?: string | null,
): Promise<LocalExecutorTarget | null> {
  const targets = await readLocalExecutorTargets(prisma);
  if (preferredNodeId) {
    return (
      targets.find((target) => target.nodeId === preferredNodeId) ?? null
    );
  }
  return targets[0] ?? null;
}

export async function readLocalExecutorTargets(
  prisma: PrismaClient,
): Promise<LocalExecutorTarget[]> {
  const nodes = await prisma.agentNode.findMany({
    where: {
      status: "online",
      lastHeartbeatAt: { gte: new Date(Date.now() - 30_000) },
    },
    select: {
      id: true,
      hostName: true,
      capabilities: true,
      lastHeartbeatAt: true,
    },
    orderBy: { lastHeartbeatAt: "desc" },
  });
  const targets: LocalExecutorTarget[] = [];
  for (const node of nodes) {
    const storage = publicLocalExecutorStorage(node);
    const capabilities = record(node.capabilities);
    const storageCapability = record(capabilities.storage);
    const storageScopeId = safeId(storageCapability.scopeId);
    if (storage && storageScopeId) {
      targets.push({
        nodeId: node.id,
        hostName: node.hostName,
        storageScopeId,
        storage,
      });
    }
  }
  return targets.sort((left, right) => {
    const rank = (target: LocalExecutorTarget) =>
      target.storage.status === "measured" &&
      target.storage.workspaceMode === "durable"
        ? 0
        : target.storage.status === "measured"
          ? 1
          : 2;
    return rank(left) - rank(right);
  });
}

export function localExecutorStorageShortfall(
  storage: PublicLocalExecutorStorage,
  requiredBytes: bigint,
) {
  if (
    storage.status !== "measured" ||
    storage.safeAvailableBytes === null ||
    !/^\d+$/.test(storage.safeAvailableBytes)
  ) {
    return null;
  }
  const safeAvailableBytes = BigInt(storage.safeAvailableBytes);
  return requiredBytes > safeAvailableBytes
    ? requiredBytes - safeAvailableBytes
    : 0n;
}
