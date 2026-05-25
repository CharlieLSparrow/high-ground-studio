import { Prisma } from "@prisma/client";

import {
  getWorldHubProviderDefinition,
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
  recentSyncJobs: WorldHubSyncJobDto[];
  recentProviderEvents: WorldHubProviderEventDto[];
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

export type WorldHubSyncJobDto = {
  id: string;
  providerKey: string;
  jobType: string;
  subjectType: string;
  subjectId: string | null;
  status: string;
  errorMessage: string | null;
  requestedByEmail: string | null;
  requestedAt: string;
  completedAt: string | null;
};

export type WorldHubProviderEventDto = {
  id: string;
  providerKey: string;
  eventType: string;
  externalEventId: string | null;
  verificationStatus: string;
  processingStatus: string;
  errorMessage: string | null;
  receivedAt: string;
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

export async function ensureWorldHubProviderConnection(providerKey: string) {
  const definition = getWorldHubProviderDefinition(providerKey);

  if (!definition) {
    throw new Error(`Unknown WorldHub provider: ${providerKey}`);
  }

  return prisma.worldHubProviderConnection.upsert({
    where: {
      providerKey,
    },
    create: {
      providerKey,
      ...buildConnectionData(definition),
    },
    update: buildConnectionData(definition),
  });
}

function syncJobToDto(
  job: Awaited<ReturnType<typeof prisma.worldHubProviderSyncJob.findFirst>>,
): WorldHubSyncJobDto {
  if (!job) {
    throw new Error("Missing sync job.");
  }

  return {
    id: job.id,
    providerKey: job.providerKey,
    jobType: job.jobType,
    subjectType: job.subjectType,
    subjectId: job.subjectId,
    status: job.status,
    errorMessage: job.errorMessage,
    requestedByEmail: job.requestedByEmail,
    requestedAt: job.requestedAt.toISOString(),
    completedAt: job.completedAt?.toISOString() ?? null,
  };
}

function providerEventToDto(
  event: Awaited<ReturnType<typeof prisma.worldHubProviderEvent.findFirst>> & {
    connection: {
      providerKey: string;
    };
  },
): WorldHubProviderEventDto {
  return {
    id: event.id,
    providerKey: event.connection.providerKey,
    eventType: event.eventType,
    externalEventId: event.externalEventId,
    verificationStatus: event.verificationStatus,
    processingStatus: event.processingStatus,
    errorMessage: event.errorMessage,
    receivedAt: event.receivedAt.toISOString(),
  };
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
    recentSyncJobs,
    recentProviderEvents,
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
    prisma.worldHubProviderSyncJob.findMany({
      orderBy: [{ requestedAt: "desc" }],
      take: 8,
    }),
    prisma.worldHubProviderEvent.findMany({
      include: {
        connection: {
          select: {
            providerKey: true,
          },
        },
      },
      orderBy: [{ receivedAt: "desc" }],
      take: 8,
    }),
  ]);

  return {
    providerConnections: providerConnections.map(toDto),
    providerDefinitions: WORLDHUB_PROVIDER_DEFINITIONS,
    readiness: WORLDHUB_PROVIDER_DEFINITIONS.map((definition) =>
      getWorldHubProviderReadiness(definition),
    ),
    recentSyncJobs: recentSyncJobs.map(syncJobToDto),
    recentProviderEvents: recentProviderEvents.map(providerEventToDto),
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
