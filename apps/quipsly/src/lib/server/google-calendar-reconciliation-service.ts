import "server-only";

import {
  decryptGoogleCalendarSyncToken,
  decryptGoogleRefreshToken,
  encryptGoogleCalendarSyncToken,
  getGoogleCalendarOAuthConfig,
  refreshGoogleCalendarAccess,
} from "@/lib/server/google-calendar-oauth";
import {
  GoogleCalendarReconciliationError,
  persistGoogleCalendarReconciliation,
  readGoogleCalendarReconciliation,
} from "@/lib/server/google-calendar-reconciliation";
import { resolveStudioProjectAccess } from "@/lib/server/studio-project-access";

export async function reconcileGoogleCalendarCollection(input: {
  prisma: any;
  collectionId: string;
  actorUserId: string;
  actorEmail?: string | null;
  requestUrl: string;
  fetchImpl?: typeof fetch;
}) {
  const collection = await input.prisma.calendarCollection.findFirst({
    where: {
      id: input.collectionId,
      status: "ACTIVE",
      connection: {
        userId: input.actorUserId,
        provider: "GOOGLE",
        connectionKind: "USER_OAUTH",
        status: "VERIFIED",
      },
      OR: [{ ownerUserId: input.actorUserId }, { nestId: { not: null } }],
    },
    include: {
      nest: { select: { id: true, slug: true } },
      cursor: true,
      connection: { include: { oauthCredential: true } },
    },
  });
  if (!collection?.providerCalendarId) {
    throw new GoogleCalendarReconciliationError(
      "That Google calendar selection is unavailable.",
      "calendar-selection-unavailable",
      404,
    );
  }
  if (collection.nest) {
    const access = await resolveStudioProjectAccess({
      projectSlug: collection.nest.slug,
      email: input.actorEmail,
      action: "write",
      prisma: input.prisma,
    });
    if (!access.allowed || access.projectId !== collection.nest.id) {
      throw new GoogleCalendarReconciliationError(
        "You need edit access to reconcile that team calendar.",
        "calendar-reconciliation-access-denied",
        403,
      );
    }
  }
  const credential = collection.connection.oauthCredential;
  if (!credential?.encryptedPayload) {
    throw new GoogleCalendarReconciliationError(
      "Reconnect Google Calendar before checking provider changes.",
      "calendar-reconnect-required",
      409,
    );
  }
  const config = getGoogleCalendarOAuthConfig(input.requestUrl);
  const refreshToken = decryptGoogleRefreshToken(
    credential.encryptedPayload,
    config.encryptionKey,
  );
  const priorCursorRef = collection.cursor?.syncTokenRef || null;
  const priorSyncToken = priorCursorRef
    ? decryptGoogleCalendarSyncToken(priorCursorRef, config.encryptionKey)
    : null;
  const accessToken = await refreshGoogleCalendarAccess({
    refreshToken,
    config,
  });
  let providerRead = await readGoogleCalendarReconciliation({
    accessToken,
    calendarId: collection.providerCalendarId,
    syncToken: priorSyncToken,
    fetchImpl: input.fetchImpl,
  });
  let resetFromExpiredToken = false;
  if (providerRead.status === "RESET_REQUIRED") {
    resetFromExpiredToken = true;
    providerRead = await readGoogleCalendarReconciliation({
      accessToken,
      calendarId: collection.providerCalendarId,
      fetchImpl: input.fetchImpl,
    });
  }
  if (providerRead.status !== "SYNCED") {
    throw new GoogleCalendarReconciliationError(
      "Google Calendar did not return a complete reconciliation.",
      "calendar-reconciliation-incomplete",
    );
  }
  const nextCursorRef = encryptGoogleCalendarSyncToken(
    providerRead.nextSyncToken,
    config.encryptionKey,
  );
  return persistGoogleCalendarReconciliation({
    prisma: input.prisma,
    actorUserId: input.actorUserId,
    actorEmail: input.actorEmail,
    revalidateTeamWriteAccess: async ({
      prisma: transaction,
      projectSlug,
      actorEmail,
    }) =>
      resolveStudioProjectAccess({
        projectSlug,
        email: actorEmail,
        action: "write",
        prisma: transaction,
      }),
    connectionId: collection.connectionId,
    collectionId: collection.id,
    providerCalendarId: collection.providerCalendarId,
    priorCursorRef,
    priorSyncToken,
    nextCursorRef,
    providerRead,
    resetFromExpiredToken,
  });
}
