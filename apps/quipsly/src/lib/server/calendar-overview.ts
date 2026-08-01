import "server-only";

import type { PrismaClient } from "@prisma/client";

import { getCoachingCalendarReadiness } from "@/lib/server/coaching-google-calendar";

export type CalendarPurpose = "COACHING" | "PODCAST_PRODUCTION" | "PERSONAL_COMMITMENTS";
export type CalendarPurposeState = "connected" | "attention" | "setup-needed" | "quipsly-only";

export type CalendarPurposeOverview = {
  purpose: CalendarPurpose;
  title: string;
  description: string;
  includes: string[];
  excludes: string[];
  sourceOfTruth: string;
  recommendedProvider: string;
  externalAccess: string;
  fallback: string;
  state: CalendarPurposeState;
  stateLabel: string;
  collectionCount: number;
  verifiedConnectionCount: number;
  latestReceipt: {
    operation: string;
    outcome: string;
    externalMutated: boolean;
    occurredAt: string;
  } | null;
};

export type CalendarOverview = {
  generatedAt: string;
  sourceOfTruth: string;
  providerSecretsExposed: false;
  externalWritesEnabled: boolean;
  purposes: CalendarPurposeOverview[];
  managedCoaching: {
    provider: "google-calendar";
    configured: boolean;
    configurationStatus: string;
    verificationRecommended: boolean;
    externallyVerified: boolean;
    state: "ready" | "attention" | "not-configured";
    message: string;
  };
};

type SafeConnectionRow = {
  id: string;
  provider: string;
  status: string;
};

type SafeCollectionRow = {
  id: string;
  purpose: CalendarPurpose;
  status: string;
  connectionId: string | null;
  connection: SafeConnectionRow | null;
};

type SafeReceiptRow = {
  collectionId: string | null;
  operation: string;
  outcome: string;
  externalMutated: boolean;
  occurredAt: Date;
};

export const CALENDAR_PURPOSE_BLUEPRINTS: Record<CalendarPurpose, Omit<CalendarPurposeOverview,
  "state" | "stateLabel" | "collectionCount" | "verifiedConnectionCount" | "latestReceipt"
>> = {
  COACHING: {
    purpose: "COACHING",
    title: "Coaching calendar",
    description: "Appointments shared by coaches and clients, with a direct path into the right private Session room.",
    includes: ["Confirmed coaching appointments", "Reschedules and cancellations", "Session-room link"],
    excludes: ["Private notes", "Transcript text", "Goals and action-item details"],
    sourceOfTruth: "Quipsly owns booking, room, consent, recording, transcript, notes, goals, and follow-up truth.",
    recommendedProvider: "Managed Google Calendar",
    externalAccess: "Quipsly-created appointments only; attendee updates remain disabled until provider verification passes.",
    fallback: "Each confirmed booking can be downloaded as a stable iCalendar event.",
  },
  PODCAST_PRODUCTION: {
    purpose: "PODCAST_PRODUCTION",
    title: "Podcast production",
    description: "A shared runway from research and recording through edit, review, and publication.",
    includes: ["Recording sessions", "Editorial milestones", "Review and publish dates"],
    excludes: ["Manuscript text", "Chat messages", "Unaccepted transcript suggestions"],
    sourceOfTruth: "Episode production and accepted work stay canonical in Quipsly; calendars receive projections.",
    recommendedProvider: "Shared Google Calendar",
    externalAccess: "Only explicit episode milestones should project externally, with a receipt for every write.",
    fallback: "A revocable iCalendar subscription is planned after projection reconciliation is proven.",
  },
  PERSONAL_COMMITMENTS: {
    purpose: "PERSONAL_COMMITMENTS",
    title: "My calendar",
    description: "Private focus blocks and commitments beside the team work they support.",
    includes: ["Accepted tasks", "Goals with target dates", "Private focus blocks"],
    excludes: ["Private provider event titles", "Attendee lists", "Calendar descriptions"],
    sourceOfTruth: "Quipsly owns work plans. Personal calendars may contribute busy-time boundaries without importing private content.",
    recommendedProvider: "iCalendar or device calendar",
    externalAccess: "Busy-time import should be read-only; focus-block export should be opt-in and revocable.",
    fallback: "Quipsly planning remains fully usable without connecting an external calendar.",
  },
};

function stateLabel(state: CalendarPurposeState) {
  if (state === "connected") return "Connected and verified";
  if (state === "attention") return "Provider attention needed";
  if (state === "setup-needed") return "Finish setup";
  return "Quipsly only";
}

export function buildCalendarOverview(input: {
  connections: SafeConnectionRow[];
  collections: SafeCollectionRow[];
  receipts: SafeReceiptRow[];
  now?: Date;
}): CalendarOverview {
  const coachingReadiness = getCoachingCalendarReadiness();
  const purposes = (Object.keys(CALENDAR_PURPOSE_BLUEPRINTS) as CalendarPurpose[]).map((purpose) => {
    const collections = input.collections.filter((collection) => collection.purpose === purpose);
    const collectionIds = new Set(collections.map((collection) => collection.id));
    const connections = new Map(
      collections.flatMap((collection) => collection.connection ? [[collection.connection.id, collection.connection] as const] : []),
    );
    const verifiedConnectionCount = [...connections.values()].filter(
      (connection) => connection.status === "VERIFIED",
    ).length;
    const hasDegradedState = collections.some(
      (collection) => collection.status !== "ACTIVE" || Boolean(collection.connection && ["DEGRADED", "REVOKED"].includes(collection.connection.status)),
    );
    const hasPendingState = collections.some(
      (collection) => collection.status === "ACTIVE" && collection.connection?.status === "PENDING",
    );
    const latestReceipt = input.receipts.find(
      (receipt) => Boolean(receipt.collectionId && collectionIds.has(receipt.collectionId)),
    ) ?? null;
    const receiptNeedsAttention = Boolean(latestReceipt && ["FAILED", "CONFLICT"].includes(latestReceipt.outcome));

    let state: CalendarPurposeState = "quipsly-only";
    if (hasDegradedState || receiptNeedsAttention) state = "attention";
    else if (verifiedConnectionCount > 0) state = "connected";
    else if (hasPendingState) state = "setup-needed";
    else if (purpose === "COACHING" && coachingReadiness.configured) state = "attention";

    return {
      ...CALENDAR_PURPOSE_BLUEPRINTS[purpose],
      state,
      stateLabel: stateLabel(state),
      collectionCount: collections.length,
      verifiedConnectionCount,
      latestReceipt: latestReceipt ? {
        operation: latestReceipt.operation,
        outcome: latestReceipt.outcome,
        externalMutated: latestReceipt.externalMutated,
        occurredAt: latestReceipt.occurredAt.toISOString(),
      } : null,
    };
  });

  const anyVerifiedExternalConnection = input.connections.some(
    (connection) => connection.provider !== "QUIPSLY" && connection.status === "VERIFIED",
  );
  const coachingGoogleVerified = input.collections.some(
    (collection) => collection.purpose === "COACHING"
      && collection.status === "ACTIVE"
      && collection.connection?.provider === "GOOGLE"
      && collection.connection.status === "VERIFIED",
  );
  const managedState = coachingGoogleVerified
    ? "ready" as const
    : coachingReadiness.configured
      ? "attention" as const
      : "not-configured" as const;

  return {
    generatedAt: (input.now ?? new Date()).toISOString(),
    sourceOfTruth: "Quipsly owns appointments, work, and production milestones. Provider calendars are reversible projections with append-only effect receipts.",
    providerSecretsExposed: false,
    externalWritesEnabled: anyVerifiedExternalConnection,
    purposes,
    managedCoaching: {
      provider: "google-calendar",
      configured: coachingReadiness.configured,
      configurationStatus: coachingReadiness.configurationStatus,
      verificationRecommended: coachingReadiness.verificationRecommended,
      externallyVerified: coachingGoogleVerified,
      state: managedState,
      message: coachingGoogleVerified
        ? "A verified Google Calendar connection is available for explicit, receipted projections."
        : coachingReadiness.configured
          ? "Google Calendar configuration is present, but provider access still needs verification before writes are enabled."
          : "Google Calendar is not configured. Quipsly scheduling and one-event iCalendar downloads remain available.",
    },
  };
}

export async function loadCalendarOverviewForActor(input: {
  actor: { id: string };
  visibleProjectIds: string[];
  visibleWorkspaceIds: string[];
  prisma: PrismaClient;
}): Promise<CalendarOverview> {
  const access = [
    { userId: input.actor.id },
    ...(input.visibleWorkspaceIds.length > 0 ? [{ workspaceId: { in: input.visibleWorkspaceIds } }] : []),
    ...(input.visibleProjectIds.length > 0 ? [{ nestId: { in: input.visibleProjectIds } }] : []),
  ];
  const collectionAccess = [
    { ownerUserId: input.actor.id },
    ...(input.visibleWorkspaceIds.length > 0 ? [{ workspaceId: { in: input.visibleWorkspaceIds } }] : []),
    ...(input.visibleProjectIds.length > 0 ? [{ nestId: { in: input.visibleProjectIds } }] : []),
  ];

  const [connections, collections, receipts] = await Promise.all([
    input.prisma.calendarConnection.findMany({
      where: { OR: access },
      select: {
        id: true,
        provider: true,
        status: true,
      },
    }),
    input.prisma.calendarCollection.findMany({
      where: { OR: collectionAccess },
      select: {
        id: true,
        purpose: true,
        status: true,
        connectionId: true,
        connection: {
          select: {
            id: true,
            provider: true,
            status: true,
          },
        },
      },
    }),
    input.prisma.calendarSyncReceipt.findMany({
      where: {
        OR: [
          { actorUserId: input.actor.id },
          { collection: { OR: collectionAccess } },
        ],
      },
      orderBy: { occurredAt: "desc" },
      take: 50,
      select: {
        collectionId: true,
        operation: true,
        outcome: true,
        externalMutated: true,
        occurredAt: true,
      },
    }),
  ]);

  return buildCalendarOverview({
    connections: connections as SafeConnectionRow[],
    collections: collections as SafeCollectionRow[],
    receipts: receipts as SafeReceiptRow[],
  });
}
