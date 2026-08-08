import "server-only";

import type { PrismaClient } from "@prisma/client";

export type PublicLocalExecutorStorage = {
  status: "measured" | "unavailable";
  safeAvailableBytes: string | null;
  availableBytes: string | null;
  reserveBytes: string | null;
  measuredAt: string | null;
  workspaceMode: "durable" | "temporary" | "unknown";
  localPathWithheld: true;
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
  const nodes = await prisma.agentNode.findMany({
    where: {
      status: "online",
      lastHeartbeatAt: { gte: new Date(Date.now() - 30_000) },
    },
    select: { capabilities: true, lastHeartbeatAt: true },
    orderBy: { lastHeartbeatAt: "desc" },
  });
  for (const node of nodes) {
    const storage = publicLocalExecutorStorage(node);
    if (storage) return storage;
  }
  return { ...UNAVAILABLE_LOCAL_EXECUTOR_STORAGE };
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
