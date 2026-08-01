import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import {
  decryptGoogleCalendarSyncToken,
  decryptGoogleRefreshToken,
  encryptGoogleCalendarSyncToken,
  getGoogleCalendarOAuthConfig,
  GoogleCalendarOAuthError,
  refreshGoogleCalendarAccess,
} from "@/lib/server/google-calendar-oauth";
import {
  GoogleCalendarReconciliationError,
  persistGoogleCalendarReconciliation,
  readGoogleCalendarReconciliation,
} from "@/lib/server/google-calendar-reconciliation";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { resolveStudioProjectAccess } from "@/lib/server/studio-project-access";

export const runtime = "nodejs";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Authorization, Cookie",
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
}

export async function POST(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id)
    return json({ ok: false, error: "Authentication required." }, 401);
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const collectionId =
    typeof body?.collectionId === "string" ? body.collectionId.trim() : "";
  if (!collectionId)
    return json(
      { ok: false, error: "Choose a verified Google calendar lane." },
      400,
    );

  const prisma = getPrismaClient() as any;
  try {
    const collection = await prisma.calendarCollection.findFirst({
      where: {
        id: collectionId,
        status: "ACTIVE",
        connection: {
          userId: session.user.id,
          provider: "GOOGLE",
          connectionKind: "USER_OAUTH",
          status: "VERIFIED",
        },
        OR: [{ ownerUserId: session.user.id }, { nestId: { not: null } }],
      },
      include: {
        nest: { select: { id: true, slug: true } },
        cursor: true,
        connection: { include: { oauthCredential: true } },
      },
    });
    if (!collection?.providerCalendarId) {
      return json(
        { ok: false, error: "That Google calendar selection is unavailable." },
        404,
      );
    }
    if (collection.nest) {
      const access = await resolveStudioProjectAccess({
        projectSlug: collection.nest.slug,
        email: session.user.primaryEmail || session.user.email,
        action: "write",
        prisma,
      });
      if (!access.allowed || access.projectId !== collection.nest.id) {
        return json(
          {
            ok: false,
            error: "You need edit access to reconcile that team calendar.",
          },
          403,
        );
      }
    }
    const credential = collection.connection.oauthCredential;
    if (!credential?.encryptedPayload) {
      return json(
        {
          ok: false,
          error: "Reconnect Google Calendar before checking provider changes.",
        },
        409,
      );
    }
    const config = getGoogleCalendarOAuthConfig(request.url);
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
    });
    let resetFromExpiredToken = false;
    if (providerRead.status === "RESET_REQUIRED") {
      resetFromExpiredToken = true;
      providerRead = await readGoogleCalendarReconciliation({
        accessToken,
        calendarId: collection.providerCalendarId,
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
    const persisted = await persistGoogleCalendarReconciliation({
      prisma,
      actorUserId: session.user.id,
      actorEmail: session.user.primaryEmail || session.user.email,
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

    if (persisted.superseded) {
      return json(
        {
          ok: false,
          error:
            "A newer Google Calendar check finished first. Refresh to see its result.",
          code: "calendar-reconciliation-superseded",
          externalSideEffects: false,
        },
        409,
      );
    }
    return json({ ok: true, result: { ...persisted, externalMutated: false } });
  } catch (error) {
    const known =
      error instanceof GoogleCalendarOAuthError ||
      error instanceof GoogleCalendarReconciliationError;
    return json(
      {
        ok: false,
        error: known
          ? error.message
          : "Google Calendar reconciliation could not complete safely.",
        code: known ? error.code : "calendar-reconciliation-failed",
        externalSideEffects: false,
      },
      known ? error.status : 503,
    );
  }
}
