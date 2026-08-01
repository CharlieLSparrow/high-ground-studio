import { NextResponse } from "next/server";

import {
  beginGoogleCalendarOAuth,
  GOOGLE_CALENDAR_OAUTH_COOKIE,
  GOOGLE_CALENDAR_OAUTH_MAX_AGE_SECONDS,
  GoogleCalendarOAuthError,
} from "@/lib/server/google-calendar-oauth";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id) {
    const login = new URL("/login", request.url);
    login.searchParams.set("callbackUrl", "/schedule");
    return NextResponse.redirect(login, { status: 303 });
  }

  try {
    const started = beginGoogleCalendarOAuth({
      userId: session.user.id,
      requestUrl: request.url,
    });
    const response = NextResponse.redirect(started.authorizationUrl, {
      status: 303,
    });
    response.cookies.set(GOOGLE_CALENDAR_OAUTH_COOKIE, started.cookieValue, {
      httpOnly: true,
      secure:
        process.env.NODE_ENV === "production" ||
        new URL(request.url).protocol === "https:",
      sameSite: "lax",
      path: "/api/calendar/connections/google/callback",
      maxAge: GOOGLE_CALENDAR_OAUTH_MAX_AGE_SECONDS,
    });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    const target = new URL("/schedule", request.url);
    target.searchParams.set(
      "calendar",
      error instanceof GoogleCalendarOAuthError ? error.code : "setup-failed",
    );
    return NextResponse.redirect(target, { status: 303 });
  }
}
