import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import {
  GoogleCalendarOAuthError,
} from "@/lib/server/google-calendar-oauth";
import {
  GoogleCalendarReconciliationError,
} from "@/lib/server/google-calendar-reconciliation";
import { reconcileGoogleCalendarCollection } from "@/lib/server/google-calendar-reconciliation-service";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

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
    const persisted = await reconcileGoogleCalendarCollection({
      prisma,
      actorUserId: session.user.id,
      actorEmail: session.user.primaryEmail || session.user.email,
      collectionId,
      requestUrl: request.url,
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
