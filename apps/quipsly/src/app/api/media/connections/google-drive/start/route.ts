import { NextResponse } from "next/server";

import {
  beginGoogleDriveOAuth,
  GOOGLE_DRIVE_OAUTH_COOKIE,
  GOOGLE_DRIVE_OAUTH_MAX_AGE_SECONDS,
  GoogleDriveOAuthError,
  normalizeGoogleDriveReturnTo,
} from "@/lib/server/google-drive-oauth";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  let returnTo = "/projects";
  try {
    returnTo = normalizeGoogleDriveReturnTo(url.searchParams.get("returnTo"));
  } catch {
    return NextResponse.json({ error: "The Drive return destination is invalid.", errorCode: "invalid-return-to" }, { status: 400 });
  }
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id) {
    const login = new URL("/login", request.url);
    login.searchParams.set("callbackUrl", returnTo);
    return NextResponse.redirect(login, { status: 303 });
  }
  try {
    const started = beginGoogleDriveOAuth({ userId: session.user.id, requestUrl: request.url, returnTo });
    const response = NextResponse.redirect(started.authorizationUrl, { status: 303 });
    response.cookies.set(GOOGLE_DRIVE_OAUTH_COOKIE, started.cookieValue, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production" || url.protocol === "https:",
      sameSite: "lax",
      path: "/api/media/connections/google-drive/callback",
      maxAge: GOOGLE_DRIVE_OAUTH_MAX_AGE_SECONDS,
    });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    return NextResponse.json({
      error: error instanceof GoogleDriveOAuthError ? error.message : "Google Drive connection could not start.",
      errorCode: error instanceof GoogleDriveOAuthError ? error.code : "drive-setup-failed",
    }, { status: error instanceof GoogleDriveOAuthError ? error.status : 500 });
  }
}
