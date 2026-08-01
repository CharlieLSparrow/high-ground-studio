import "server-only";

import { createHash } from "node:crypto";

import { acquirePrismaAdvisoryTransactionLock } from "@/lib/server/prisma-advisory-lock";

export const GOOGLE_CALENDAR_RECONCILIATION_FIELDS =
  "items(id,etag,status,updated,extendedProperties/private),nextPageToken,nextSyncToken";
export const GOOGLE_CALENDAR_RECONCILIATION_MAX_PAGES = 100;

export type GoogleCalendarReconciliationEvent = {
  id: string;
  etag: string | null;
  status: string;
  updatedAt: string | null;
  quipslySourceType: string | null;
  quipslySourceId: string | null;
  quipslySourceRevision: string | null;
  quipslySchema: string | null;
};

export type GoogleCalendarReconciliationRead =
  | {
      status: "SYNCED";
      mode: "FULL" | "INCREMENTAL";
      events: GoogleCalendarReconciliationEvent[];
      nextSyncToken: string;
      pageCount: number;
    }
  | {
      status: "RESET_REQUIRED";
      mode: "INCREMENTAL";
      events: [];
      nextSyncToken: null;
      pageCount: number;
    };

export type CalendarProjectionReconciliationInput = {
  id: string;
  providerEventId: string | null;
  providerEtag: string | null;
  providerUpdatedAt: Date | null;
  sourceType: string;
  sourceId: string;
  sourceRevision: string;
  status: string;
  conflictState: string;
  metadataJson?: unknown;
};

export type CalendarProjectionReconciliationDecision = {
  projectionId: string;
  providerEventId: string;
  providerEtag: string | null;
  providerUpdatedAt: Date | null;
  status: "CONFLICT" | "MISSING" | "CANCELED";
  conflictState: "EXTERNAL_CHANGED" | "NONE";
  providerStatus:
    | "provider-version-changed"
    | "provider-event-cancelled"
    | "provider-event-restored"
    | "provider-identity-mismatch"
    | "provider-event-missing"
    | "provider-cancellation-verified";
  outcome: "CONFLICT" | "SUCCEEDED";
};

export class GoogleCalendarReconciliationError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 502,
  ) {
    super(message);
  }
}

function safeText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function safeProviderEvent(
  value: unknown,
): GoogleCalendarReconciliationEvent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const event = value as Record<string, unknown>;
  const id = safeText(event.id);
  if (!id) return null;
  const extended =
    event.extendedProperties && typeof event.extendedProperties === "object"
      ? (event.extendedProperties as Record<string, unknown>)
      : {};
  const privateFields =
    extended.private && typeof extended.private === "object"
      ? (extended.private as Record<string, unknown>)
      : {};
  return {
    id,
    etag: safeText(event.etag),
    status: safeText(event.status) || "unknown",
    updatedAt: safeText(event.updated),
    quipslySourceType: safeText(privateFields.quipslySourceType),
    quipslySourceId: safeText(privateFields.quipslySourceId),
    quipslySourceRevision: safeText(privateFields.quipslySourceRevision),
    quipslySchema: safeText(privateFields.quipslySchema),
  };
}

function providerUpdatedAt(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function readGoogleCalendarReconciliation(input: {
  accessToken: string;
  calendarId: string;
  syncToken?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<GoogleCalendarReconciliationRead> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const mode = input.syncToken ? ("INCREMENTAL" as const) : ("FULL" as const);
  const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(input.calendarId)}/events`;
  const eventsById = new Map<string, GoogleCalendarReconciliationEvent>();
  let pageToken: string | null = null;
  let pageCount = 0;

  while (pageCount < GOOGLE_CALENDAR_RECONCILIATION_MAX_PAGES) {
    pageCount += 1;
    const params = new URLSearchParams({
      showDeleted: "true",
      singleEvents: "false",
      maxResults: "2500",
      fields: GOOGLE_CALENDAR_RECONCILIATION_FIELDS,
    });
    if (input.syncToken) params.set("syncToken", input.syncToken);
    if (pageToken) params.set("pageToken", pageToken);
    const response = await fetchImpl(`${base}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${input.accessToken}` },
    });
    if (response.status === 410 && mode === "INCREMENTAL") {
      return {
        status: "RESET_REQUIRED",
        mode,
        events: [],
        nextSyncToken: null,
        pageCount,
      };
    }
    if (!response.ok) {
      throw new GoogleCalendarReconciliationError(
        response.status === 401 || response.status === 403
          ? "Google Calendar access is no longer sufficient. Reconnect before checking provider changes."
          : "Google Calendar could not return a complete reconciliation page.",
        response.status === 401 || response.status === 403
          ? "calendar-reconnect-required"
          : `calendar-reconciliation-${response.status || "failed"}`,
        response.status === 401 || response.status === 403 ? 409 : 502,
      );
    }
    const body = (await response.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body) {
      throw new GoogleCalendarReconciliationError(
        "Google Calendar returned an unreadable reconciliation page.",
        "calendar-reconciliation-invalid-json",
      );
    }
    const items = Array.isArray(body.items) ? body.items : [];
    for (const item of items) {
      const event = safeProviderEvent(item);
      if (event) eventsById.set(event.id, event);
    }
    pageToken = safeText(body.nextPageToken);
    if (pageToken) continue;
    const nextSyncToken = safeText(body.nextSyncToken);
    if (!nextSyncToken) {
      throw new GoogleCalendarReconciliationError(
        "Google Calendar did not finish the reconciliation with a durable cursor.",
        "calendar-reconciliation-missing-sync-token",
      );
    }
    return {
      status: "SYNCED",
      mode,
      events: [...eventsById.values()],
      nextSyncToken,
      pageCount,
    };
  }

  throw new GoogleCalendarReconciliationError(
    "Google Calendar reconciliation exceeded the bounded page limit.",
    "calendar-reconciliation-page-limit",
  );
}

export function reconcileGoogleCalendarProjectionStates(input: {
  mode: "FULL" | "INCREMENTAL";
  events: GoogleCalendarReconciliationEvent[];
  projections: CalendarProjectionReconciliationInput[];
}) {
  const projectionsByProviderId = new Map(
    input.projections.flatMap((projection) =>
      projection.providerEventId
        ? [[projection.providerEventId, projection] as const]
        : [],
    ),
  );
  const observedProviderIds = new Set<string>();
  const decisions: CalendarProjectionReconciliationDecision[] = [];
  let ignoredEventCount = 0;
  let unchangedProjectionCount = 0;

  for (const event of input.events) {
    const projection = projectionsByProviderId.get(event.id);
    if (!projection) {
      ignoredEventCount += 1;
      continue;
    }
    observedProviderIds.add(event.id);
    const identityMatches =
      event.quipslySourceType === projection.sourceType &&
      event.quipslySourceId === projection.sourceId;
    if (!identityMatches) {
      decisions.push({
        projectionId: projection.id,
        providerEventId: event.id,
        providerEtag: event.etag,
        providerUpdatedAt: providerUpdatedAt(event.updatedAt),
        status: "CONFLICT",
        conflictState: "EXTERNAL_CHANGED",
        providerStatus: "provider-identity-mismatch",
        outcome: "CONFLICT",
      });
      continue;
    }
    if (event.status === "cancelled") {
      if (projection.status === "CANCELED") {
        decisions.push({
          projectionId: projection.id,
          providerEventId: event.id,
          providerEtag: null,
          providerUpdatedAt: providerUpdatedAt(event.updatedAt),
          status: "CANCELED",
          conflictState: "NONE",
          providerStatus: "provider-cancellation-verified",
          outcome: "SUCCEEDED",
        });
      } else {
        decisions.push({
          projectionId: projection.id,
          providerEventId: event.id,
          providerEtag: event.etag,
          providerUpdatedAt: providerUpdatedAt(event.updatedAt),
          status: "MISSING",
          conflictState: "EXTERNAL_CHANGED",
          providerStatus: "provider-event-cancelled",
          outcome: "CONFLICT",
        });
      }
      continue;
    }
    if (projection.status === "CANCELED") {
      decisions.push({
        projectionId: projection.id,
        providerEventId: event.id,
        providerEtag: event.etag,
        providerUpdatedAt: providerUpdatedAt(event.updatedAt),
        status: "CONFLICT",
        conflictState: "EXTERNAL_CHANGED",
        providerStatus: "provider-event-restored",
        outcome: "CONFLICT",
      });
      continue;
    }
    if (event.etag !== projection.providerEtag) {
      decisions.push({
        projectionId: projection.id,
        providerEventId: event.id,
        providerEtag: event.etag,
        providerUpdatedAt: providerUpdatedAt(event.updatedAt),
        status: "CONFLICT",
        conflictState: "EXTERNAL_CHANGED",
        providerStatus: "provider-version-changed",
        outcome: "CONFLICT",
      });
      continue;
    }
    unchangedProjectionCount += 1;
  }

  if (input.mode === "FULL") {
    for (const projection of input.projections) {
      if (
        !projection.providerEventId ||
        observedProviderIds.has(projection.providerEventId) ||
        projection.status === "CANCELED"
      )
        continue;
      decisions.push({
        projectionId: projection.id,
        providerEventId: projection.providerEventId,
        providerEtag: projection.providerEtag,
        providerUpdatedAt: projection.providerUpdatedAt,
        status: "MISSING",
        conflictState: "EXTERNAL_CHANGED",
        providerStatus: "provider-event-missing",
        outcome: "CONFLICT",
      });
    }
  }

  return {
    decisions,
    ignoredEventCount,
    unchangedProjectionCount,
    observedEventCount: input.events.length,
  };
}

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function metadataRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function persistGoogleCalendarReconciliation(input: {
  prisma: any;
  actorUserId: string;
  actorEmail?: string | null;
  revalidateTeamWriteAccess?: (input: {
    prisma: any;
    projectSlug: string;
    actorEmail?: string | null;
  }) => Promise<{ allowed: boolean; projectId: string | null }>;
  connectionId: string;
  collectionId: string;
  providerCalendarId: string;
  priorCursorRef: string | null;
  priorSyncToken: string | null;
  nextCursorRef: string;
  providerRead: Extract<GoogleCalendarReconciliationRead, { status: "SYNCED" }>;
  resetFromExpiredToken: boolean;
  occurredAt?: Date;
}) {
  const occurredAt = input.occurredAt ?? new Date();
  const requestDigest = digest(
    JSON.stringify({
      collectionId: input.collectionId,
      mode: input.providerRead.mode,
      priorCursorDigest: input.priorSyncToken
        ? digest(input.priorSyncToken)
        : null,
      nextCursorDigest: digest(input.providerRead.nextSyncToken),
      events: input.providerRead.events.map((event) => [
        event.id,
        event.etag,
        event.status,
      ]),
      resetFromExpiredToken: input.resetFromExpiredToken,
    }),
  );
  return input.prisma.$transaction(
    async (transaction: any) => {
      await acquirePrismaAdvisoryTransactionLock(
        transaction,
        `google-calendar-reconciliation:${input.collectionId}`,
      );
      const currentCollection = await transaction.calendarCollection.findFirst({
        where: {
          id: input.collectionId,
          connectionId: input.connectionId,
          providerCalendarId: input.providerCalendarId,
          status: "ACTIVE",
          connection: { userId: input.actorUserId, status: "VERIFIED" },
        },
        select: { id: true, nestId: true },
      });
      if (!currentCollection)
        throw new GoogleCalendarReconciliationError(
          "The Google calendar selection changed while it was being checked.",
          "calendar-selection-changed",
          409,
        );
      const nest = currentCollection.nestId
        ? await transaction.studioProject.findUnique({
            where: { id: currentCollection.nestId },
            select: { id: true, slug: true },
          })
        : null;
      if (currentCollection.nestId && !nest) {
        throw new GoogleCalendarReconciliationError(
          "The team calendar identity changed while it was being checked.",
          "calendar-team-selection-changed",
          409,
        );
      }
      if (nest) {
        if (!input.revalidateTeamWriteAccess) {
          throw new GoogleCalendarReconciliationError(
            "The team calendar authority check was unavailable. No Quipsly calendar state was changed.",
            "calendar-reconciliation-authority-unavailable",
            503,
          );
        }
        const access = await input.revalidateTeamWriteAccess({
          prisma: transaction,
          projectSlug: nest.slug,
          actorEmail: input.actorEmail,
        });
        if (!access.allowed || access.projectId !== nest.id) {
          throw new GoogleCalendarReconciliationError(
            "Your edit access changed while Google Calendar was being checked. No Quipsly calendar state was changed.",
            "calendar-reconciliation-access-revoked",
            403,
          );
        }
      }
      const cursor = await transaction.calendarSyncCursor.findUnique({
        where: { collectionId: currentCollection.id },
      });
      if ((cursor?.syncTokenRef || null) !== input.priorCursorRef) {
        return { superseded: true as const };
      }
      const projections = await transaction.calendarProjection.findMany({
        where: {
          collectionId: currentCollection.id,
          status: { not: "REVOKED" },
        },
        select: {
          id: true,
          providerEventId: true,
          providerEtag: true,
          providerUpdatedAt: true,
          sourceType: true,
          sourceId: true,
          sourceRevision: true,
          status: true,
          conflictState: true,
          metadataJson: true,
        },
      });
      const reconciliation = reconcileGoogleCalendarProjectionStates({
        mode: input.providerRead.mode,
        events: input.providerRead.events,
        projections,
      });
      for (const decision of reconciliation.decisions) {
        const priorProjection = projections.find(
          (projection: CalendarProjectionReconciliationInput) => projection.id === decision.projectionId,
        );
        await transaction.calendarProjection.update({
          where: { id: decision.projectionId },
          data: {
            providerEtag: decision.providerEtag,
            providerUpdatedAt: decision.providerUpdatedAt,
            status: decision.status,
            conflictState: decision.conflictState,
            lastSyncedAt: occurredAt,
            metadataJson: {
              ...metadataRecord(priorProjection?.metadataJson),
              reconciliation: {
                schema: "quipsly-google-calendar-reconciliation-observation-v1",
                reason: decision.providerStatus,
                observedAt: occurredAt.toISOString(),
                providerContentImported: false,
              },
            },
          },
        });
        await transaction.calendarSyncReceipt.create({
          data: {
            connectionId: input.connectionId,
            collectionId: currentCollection.id,
            projectionId: decision.projectionId,
            actorUserId: input.actorUserId,
            operation: "READ_EVENT",
            outcome: decision.outcome,
            requestDigest,
            responseDigest: digest(
              `${decision.providerEventId}:${decision.providerEtag || "none"}`,
            ),
            providerStatus: decision.providerStatus,
            externalMutated: false,
            occurredAt,
            metadataJson: {
              schema: "quipsly-google-calendar-reconciliation-receipt-v1",
              importedProviderContent: false,
              providerEventIdentityExposed: false,
            },
          },
        });
      }
      await transaction.calendarSyncCursor.upsert({
        where: { collectionId: currentCollection.id },
        create: {
          collectionId: currentCollection.id,
          syncTokenRef: input.nextCursorRef,
          ...(input.providerRead.mode === "FULL"
            ? { lastFullSyncAt: occurredAt }
            : { lastIncrementalSyncAt: occurredAt }),
          metadataJson: {
            schema: "quipsly-google-calendar-sync-cursor-v1",
            tokenEncrypted: true,
            queryContract: "identity-etag-status-updated-private-linkage-only",
            resetFromExpiredToken: input.resetFromExpiredToken,
          },
        },
        update: {
          syncTokenRef: input.nextCursorRef,
          ...(input.providerRead.mode === "FULL"
            ? { lastFullSyncAt: occurredAt }
            : { lastIncrementalSyncAt: occurredAt }),
          metadataJson: {
            schema: "quipsly-google-calendar-sync-cursor-v1",
            tokenEncrypted: true,
            queryContract: "identity-etag-status-updated-private-linkage-only",
            resetFromExpiredToken: input.resetFromExpiredToken,
          },
        },
      });
      const conflictCount = reconciliation.decisions.filter(
        (decision) => decision.outcome === "CONFLICT",
      ).length;
      const receipt = await transaction.calendarSyncReceipt.create({
        data: {
          connectionId: input.connectionId,
          collectionId: currentCollection.id,
          actorUserId: input.actorUserId,
          operation:
            input.providerRead.mode === "FULL"
              ? "FULL_SYNC"
              : "INCREMENTAL_SYNC",
          outcome: conflictCount > 0 ? "CONFLICT" : "SUCCEEDED",
          requestDigest,
          responseDigest: digest(input.providerRead.nextSyncToken),
          providerStatus: input.resetFromExpiredToken
            ? "expired-token-full-sync"
            : input.providerRead.mode === "FULL"
              ? "full-sync-complete"
              : "incremental-sync-complete",
          externalMutated: false,
          occurredAt,
          metadataJson: {
            schema: "quipsly-google-calendar-reconciliation-receipt-v1",
            observedEventCount: reconciliation.observedEventCount,
            ignoredEventCount: reconciliation.ignoredEventCount,
            unchangedProjectionCount: reconciliation.unchangedProjectionCount,
            changedProjectionCount: reconciliation.decisions.length,
            conflictCount,
            pageCount: input.providerRead.pageCount,
            importedProviderContent: false,
            resetFromExpiredToken: input.resetFromExpiredToken,
          },
        },
      });
      return {
        superseded: false as const,
        receiptId: receipt.id,
        mode: input.providerRead.mode,
        resetFromExpiredToken: input.resetFromExpiredToken,
        observedEventCount: reconciliation.observedEventCount,
        changedProjectionCount: reconciliation.decisions.length,
        conflictCount,
      };
    },
    { maxWait: 10_000, timeout: 20_000, isolationLevel: "Serializable" },
  );
}
