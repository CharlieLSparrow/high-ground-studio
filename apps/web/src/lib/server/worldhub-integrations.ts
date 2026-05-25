import { Prisma } from "@prisma/client";

import {
  getWorldHubProviderReadiness,
  WORLDHUB_PROVIDER_DEFINITIONS,
  type WorldHubProviderDefinition,
  type WorldHubProviderReadiness,
} from "@/lib/worldhub/provider-definitions";
import { prisma } from "@/lib/prisma";

type ProviderConnectionRecord = Awaited<
  ReturnType<typeof prisma.worldHubProviderConnection.findFirst>
> extends infer T
  ? NonNullable<T>
  : never;

export type WorldHubProviderConnectionDto = {
  id: string;
  providerKey: string;
  providerKind: string;
  displayName: string;
  status: string;
  accountLabel: string | null;
  capabilities: string[];
  requiredEnv: unknown;
  configuredEnv: string[];
  missingEnv: string[];
  setupUrl: string | null;
  setupNotes: string | null;
  healthStatus: string;
  lastCheckedAt: string | null;
  updatedAt: string;
};

export type WorldHubIntegrationDashboard = {
  providerConnections: WorldHubProviderConnectionDto[];
  providerDefinitions: WorldHubProviderDefinition[];
  readiness: WorldHubProviderReadiness[];
  counts: {
    activeMemberships: number;
    futureAppointments: number;
    unsyncedFutureAppointments: number;
    catalogItems: number;
    offers: number;
    openCarts: number;
    openOrders: number;
    queuedFulfillmentJobs: number;
    queuedSyncJobs: number;
    receivedProviderEvents: number;
  };
};

function toJsonInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function asStringArray(value: Prisma.JsonValue): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function toDto(
  record: ProviderConnectionRecord,
): WorldHubProviderConnectionDto {
  return {
    id: record.id,
    providerKey: record.providerKey,
    providerKind: record.providerKind,
    displayName: record.displayName,
    status: record.status,
    accountLabel: record.accountLabel,
    capabilities: asStringArray(record.capabilitiesJson),
    requiredEnv: record.requiredEnvJson,
    configuredEnv: asStringArray(record.configuredEnvJson),
    missingEnv: asStringArray(record.missingEnvJson),
    setupUrl: record.setupUrl,
    setupNotes: record.setupNotes,
    healthStatus: record.healthStatus,
    lastCheckedAt: record.lastCheckedAt?.toISOString() ?? null,
    updatedAt: record.updatedAt.toISOString(),
  };
}

function statusFromReadiness(readiness: WorldHubProviderReadiness) {
  return readiness.status === "configured" ? "configured" : "planned";
}

function buildConnectionData(definition: WorldHubProviderDefinition) {
  const readiness = getWorldHubProviderReadiness(definition);

  return {
    providerKind: definition.providerKind,
    displayName: definition.displayName,
    status: statusFromReadiness(readiness),
    accountLabel: definition.accountLabel,
    capabilitiesJson: toJsonInput(definition.capabilities),
    requiredEnvJson: toJsonInput(definition.requiredEnv),
    configuredEnvJson: toJsonInput(readiness.configuredEnv),
    missingEnvJson: toJsonInput(readiness.missingEnv),
    setupUrl: definition.setupUrl,
    setupNotes: definition.setupNotes,
    healthStatus: readiness.missingEnv.length === 0 ? "ready" : "missing_env",
    lastCheckedAt: new Date(),
  };
}

export async function upsertWorldHubProviderConnections() {
  const records = await Promise.all(
    WORLDHUB_PROVIDER_DEFINITIONS.map((definition) =>
      prisma.worldHubProviderConnection.upsert({
        where: {
          providerKey: definition.providerKey,
        },
        create: {
          providerKey: definition.providerKey,
          ...buildConnectionData(definition),
        },
        update: buildConnectionData(definition),
      }),
    ),
  );

  return records.map(toDto);
}

export async function getWorldHubIntegrationDashboard(): Promise<WorldHubIntegrationDashboard> {
  const now = new Date();
  const [
    providerConnections,
    activeMemberships,
    futureAppointments,
    unsyncedFutureAppointments,
    catalogItems,
    offers,
    openCarts,
    openOrders,
    queuedFulfillmentJobs,
    queuedSyncJobs,
    receivedProviderEvents,
  ] = await Promise.all([
    prisma.worldHubProviderConnection.findMany({
      orderBy: [{ providerKind: "asc" }, { providerKey: "asc" }],
    }),
    prisma.membership.count({
      where: {
        status: "ACTIVE",
      },
    }),
    prisma.appointment.count({
      where: {
        scheduledEnd: {
          gte: now,
        },
        status: {
          in: ["SCHEDULED", "CONFIRMED"],
        },
      },
    }),
    prisma.appointment.count({
      where: {
        scheduledEnd: {
          gte: now,
        },
        status: {
          in: ["SCHEDULED", "CONFIRMED"],
        },
        googleEventId: null,
      },
    }),
    prisma.worldHubCatalogItem.count(),
    prisma.worldHubOffer.count(),
    prisma.worldHubCart.count({
      where: {
        status: {
          in: ["draft", "active"],
        },
      },
    }),
    prisma.worldHubOrder.count({
      where: {
        status: {
          in: ["pending", "placed"],
        },
      },
    }),
    prisma.worldHubFulfillmentJob.count({
      where: {
        status: {
          in: ["queued", "ready"],
        },
      },
    }),
    prisma.worldHubProviderSyncJob.count({
      where: {
        status: {
          in: ["queued", "ready"],
        },
      },
    }),
    prisma.worldHubProviderEvent.count({
      where: {
        processingStatus: {
          in: ["received", "queued", "failed"],
        },
      },
    }),
  ]);

  return {
    providerConnections: providerConnections.map(toDto),
    providerDefinitions: WORLDHUB_PROVIDER_DEFINITIONS,
    readiness: WORLDHUB_PROVIDER_DEFINITIONS.map((definition) =>
      getWorldHubProviderReadiness(definition),
    ),
    counts: {
      activeMemberships,
      futureAppointments,
      unsyncedFutureAppointments,
      catalogItems,
      offers,
      openCarts,
      openOrders,
      queuedFulfillmentJobs,
      queuedSyncJobs,
      receivedProviderEvents,
    },
  };
}
