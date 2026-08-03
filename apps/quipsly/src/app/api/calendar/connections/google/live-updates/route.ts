import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { GoogleCalendarOAuthError } from "@/lib/server/google-calendar-oauth";
import {
  disableGoogleCalendarLiveUpdates,
  enableGoogleCalendarLiveUpdates,
  GoogleCalendarPushError,
} from "@/lib/server/google-calendar-push";
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
  if (!session?.user?.id) {
    return json({ ok: false, error: "Authentication required." }, 401);
  }
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const collectionId = typeof body?.collectionId === "string" ? body.collectionId.trim() : "";
  const enabled = body?.enabled;
  if (!collectionId || typeof enabled !== "boolean") {
    return json({ ok: false, error: "Choose a calendar lane and live-update state." }, 400);
  }
  const input = {
    prisma: getPrismaClient() as any,
    collectionId,
    actorUserId: session.user.id,
    actorEmail: session.user.primaryEmail || session.user.email,
    requestUrl: request.url,
  };
  try {
    const result = enabled
      ? await enableGoogleCalendarLiveUpdates(input)
      : await disableGoogleCalendarLiveUpdates(input);
    return json({ ok: true, enabled, result });
  } catch (error) {
    const known =
      error instanceof GoogleCalendarPushError ||
      error instanceof GoogleCalendarOAuthError;
    return json(
      {
        ok: false,
        error: known
          ? error.message
          : "Google Calendar live updates could not be changed safely.",
        code: known ? error.code : "calendar-live-updates-failed",
      },
      known ? error.status : 503,
    );
  }
}
