import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { saveGoogleDriveConnection } from "@/lib/server/google-drive-connection";
import {
  encryptGoogleDriveRefreshToken,
  exchangeGoogleDriveCode,
  fetchGoogleDriveIdentity,
  googleDriveProviderAccountKey,
  GOOGLE_DRIVE_OAUTH_COOKIE,
  GoogleDriveOAuthError,
  normalizeGoogleDriveReturnTo,
  validateGoogleDriveOAuthCallback,
} from "@/lib/server/google-drive-oauth";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

export const runtime = "nodejs";

function redirectResult(request: Request, returnTo: string, state: string) {
  const target = new URL(normalizeGoogleDriveReturnTo(returnTo), request.url);
  target.searchParams.set("drive", state);
  const response = NextResponse.redirect(target, { status: 303 });
  response.cookies.set(GOOGLE_DRIVE_OAUTH_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" || new URL(request.url).protocol === "https:",
    sameSite: "lax",
    path: "/api/media/connections/google-drive/callback",
    maxAge: 0,
  });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function GET(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id) return redirectResult(request, "/projects", "signed-out");
  const url = new URL(request.url);
  if (url.searchParams.get("error")) return redirectResult(request, "/projects", "permission-denied");
  const code = url.searchParams.get("code")?.trim();
  const state = url.searchParams.get("state")?.trim();
  const cookieValue = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${GOOGLE_DRIVE_OAUTH_COOKIE}=`))
    ?.slice(GOOGLE_DRIVE_OAUTH_COOKIE.length + 1);
  if (!code || !state || !cookieValue) return redirectResult(request, "/projects", "expired");

  let returnTo = "/projects";
  try {
    const callback = validateGoogleDriveOAuthCallback({
      state,
      cookieValue,
      userId: session.user.id,
      requestUrl: request.url,
    });
    returnTo = callback.returnTo;
    const token = await exchangeGoogleDriveCode({ code, verifier: callback.verifier, config: callback.config });
    const identity = await fetchGoogleDriveIdentity(token.accessToken);
    await saveGoogleDriveConnection({
      prisma: getPrismaClient(),
      userId: session.user.id,
      providerAccountKey: googleDriveProviderAccountKey(identity.subject),
      accountEmail: identity.email,
      displayName: identity.displayName,
      grantedScopes: token.grantedScopes,
      encryptedRefreshToken: encryptGoogleDriveRefreshToken(token.refreshToken, callback.config.encryptionKey),
      clientRequestId: createHash("sha256").update(state).digest("hex"),
    });
    return redirectResult(request, returnTo, "connected");
  } catch (error) {
    console.error("[google-drive-oauth] callback failed", {
      code: error instanceof GoogleDriveOAuthError ? error.code : "callback-failed",
    });
    return redirectResult(request, returnTo, error instanceof GoogleDriveOAuthError ? error.code : "callback-failed");
  }
}
