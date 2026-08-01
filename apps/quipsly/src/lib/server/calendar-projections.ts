import "server-only";

import { createHash } from "node:crypto";

import { ensureStudioWorkspace } from "@/lib/studio/project-registry";

const GOOGLE_CALENDAR_EVENTS_SCOPE = "https://www.googleapis.com/auth/calendar.events";

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
}

export function calendarSourceRevision(value: unknown) {
  return sha256(stableJson(value));
}

export function calendarProjectionUid(sourceType: string, sourceId: string) {
  return `${sourceType.toLowerCase()}-${sha256(sourceId).slice(0, 40)}@calendar.quipsly.com`;
}

type ManagedCoachingProjectionInput = {
  tx: any;
  workspaceId?: string | null;
  calendarId: string;
  bookingId: string;
  roomId?: string | null;
  title: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  timezone: string;
  bookingStatus: string;
  providerEventId: string;
  providerEtag?: string | null;
  providerUpdatedAt?: Date | null;
  operation: "CREATE_EVENT" | "UPDATE_EVENT" | "CANCEL_EVENT";
  providerStatus: string;
  externalMutated: boolean;
  actorUserId: string;
  legacyCalendarLinkId: string;
  occurredAt: Date;
};

export async function recordManagedCoachingCalendarProjection(
  input: ManagedCoachingProjectionInput,
) {
  const workspace = input.workspaceId
    ? { id: input.workspaceId }
    : await ensureStudioWorkspace(input.tx);
  const calendarDigest = sha256(input.calendarId);
  const providerAccountKey = `workspace:${workspace.id}:managed-google:${calendarDigest}`;
  const connection = await input.tx.calendarConnection.upsert({
    where: {
      provider_providerAccountKey: {
        provider: "GOOGLE",
        providerAccountKey,
      },
    },
    update: {
      status: "VERIFIED",
      verifiedAt: input.occurredAt,
      lastCheckedAt: input.occurredAt,
      revokedAt: null,
    },
    create: {
      workspaceId: workspace.id,
      provider: "GOOGLE",
      connectionKind: "MANAGED_ORGANIZATION",
      providerAccountKey,
      credentialRef: "runtime:managed-google-calendar",
      grantedScopes: [GOOGLE_CALENDAR_EVENTS_SCOPE],
      status: "VERIFIED",
      verifiedAt: input.occurredAt,
      lastCheckedAt: input.occurredAt,
      metadataJson: {
        schema: "quipsly-managed-calendar-connection-v1",
        truthOwner: "quipsly-workspace",
        calendarIdSha256: calendarDigest,
      },
    },
    select: { id: true },
  });

  const collection = await input.tx.calendarCollection.upsert({
    where: {
      connectionId_providerCalendarId: {
        connectionId: connection.id,
        providerCalendarId: input.calendarId,
      },
    },
    update: {
      displayName: "Quipsly Coaching",
      timezone: input.timezone,
      status: "ACTIVE",
    },
    create: {
      connectionId: connection.id,
      workspaceId: workspace.id,
      purpose: "COACHING",
      displayName: "Quipsly Coaching",
      timezone: input.timezone,
      providerCalendarId: input.calendarId,
      visibility: "CLIENT_VISIBLE",
      isDefault: true,
      status: "ACTIVE",
      metadataJson: {
        schema: "quipsly-calendar-collection-v1",
        privateFieldsExcluded: true,
      },
    },
    select: { id: true },
  });

  const sourceRevision = calendarSourceRevision({
    bookingId: input.bookingId,
    roomId: input.roomId || null,
    title: input.title,
    scheduledStart: input.scheduledStart.toISOString(),
    scheduledEnd: input.scheduledEnd.toISOString(),
    timezone: input.timezone,
    bookingStatus: input.bookingStatus,
  });
  const projectionStatus = input.operation === "CANCEL_EVENT" ? "CANCELED" : "SYNCED";
  const projection = await input.tx.calendarProjection.upsert({
    where: {
      collectionId_sourceType_sourceId: {
        collectionId: collection.id,
        sourceType: "CoachingBooking",
        sourceId: input.bookingId,
      },
    },
    update: {
      sourceRevision,
      providerEventId: input.providerEventId,
      providerEtag: input.providerEtag || null,
      providerUpdatedAt: input.providerUpdatedAt || input.occurredAt,
      sequence: { increment: 1 },
      status: projectionStatus,
      conflictState: "NONE",
      lastSyncedAt: input.occurredAt,
      metadataJson: {
        schema: "quipsly-calendar-projection-v1",
        roomId: input.roomId || null,
        legacyCalendarLinkId: input.legacyCalendarLinkId,
      },
    },
    create: {
      collectionId: collection.id,
      sourceType: "CoachingBooking",
      sourceId: input.bookingId,
      sourceRevision,
      providerEventId: input.providerEventId,
      providerEtag: input.providerEtag || null,
      providerUpdatedAt: input.providerUpdatedAt || input.occurredAt,
      uid: calendarProjectionUid("coaching-booking", input.bookingId),
      sequence: 0,
      status: projectionStatus,
      conflictState: "NONE",
      lastSyncedAt: input.occurredAt,
      metadataJson: {
        schema: "quipsly-calendar-projection-v1",
        roomId: input.roomId || null,
        legacyCalendarLinkId: input.legacyCalendarLinkId,
      },
    },
    select: { id: true },
  });

  const receipt = await input.tx.calendarSyncReceipt.create({
    data: {
      connectionId: connection.id,
      collectionId: collection.id,
      projectionId: projection.id,
      actorUserId: input.actorUserId,
      operation: input.operation,
      outcome: "SUCCEEDED",
      requestDigest: sourceRevision,
      responseDigest: calendarSourceRevision({
        providerEventId: input.providerEventId,
        providerStatus: input.providerStatus,
        externalMutated: input.externalMutated,
      }),
      providerStatus: input.providerStatus,
      externalMutated: input.externalMutated,
      occurredAt: input.occurredAt,
      metadataJson: {
        schema: "quipsly-calendar-sync-receipt-v1",
        legacyCalendarLinkId: input.legacyCalendarLinkId,
        privateFieldsExcluded: true,
      },
    },
    select: { id: true },
  });

  return {
    connectionId: connection.id,
    collectionId: collection.id,
    projectionId: projection.id,
    receiptId: receipt.id,
  };
}
