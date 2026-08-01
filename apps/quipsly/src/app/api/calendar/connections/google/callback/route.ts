import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import {
  encryptGoogleRefreshToken,
  exchangeGoogleCalendarCode,
  googleProviderAccountKey,
  GOOGLE_CALENDAR_OAUTH_COOKIE,
  GoogleCalendarOAuthError,
  listOwnedGoogleCalendars,
  validateGoogleCalendarOAuthCallback,
} from "@/lib/server/google-calendar-oauth";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

export const runtime = "nodejs";

function scheduleRedirect(request: Request, state: string) {
  const target = new URL("/schedule", request.url);
  target.searchParams.set("calendar", state);
  const response = NextResponse.redirect(target, { status: 303 });
  response.cookies.set(GOOGLE_CALENDAR_OAUTH_COOKIE, "", {
    httpOnly: true,
    secure:
      process.env.NODE_ENV === "production" ||
      new URL(request.url).protocol === "https:",
    sameSite: "lax",
    path: "/api/calendar/connections/google/callback",
    maxAge: 0,
  });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function GET(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id) return scheduleRedirect(request, "signed-out");

  const url = new URL(request.url);
  if (url.searchParams.get("error")) {
    return scheduleRedirect(request, "permission-denied");
  }
  const code = url.searchParams.get("code")?.trim();
  const state = url.searchParams.get("state")?.trim();
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookieValue = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${GOOGLE_CALENDAR_OAUTH_COOKIE}=`))
    ?.slice(GOOGLE_CALENDAR_OAUTH_COOKIE.length + 1);
  if (!code || !state || !cookieValue) {
    return scheduleRedirect(request, "expired");
  }

  try {
    const callback = validateGoogleCalendarOAuthCallback({
      state,
      cookieValue,
      userId: session.user.id,
      requestUrl: request.url,
    });
    const token = await exchangeGoogleCalendarCode({
      code,
      verifier: callback.verifier,
      config: callback.config,
    });
    const calendars = await listOwnedGoogleCalendars(token.accessToken);
    const primary = calendars.find((calendar) => calendar.primary);
    if (!primary) {
      throw new GoogleCalendarOAuthError(
        "Google Calendar did not return an owned primary calendar.",
        "no-owned-calendar",
        409,
      );
    }
    const providerAccountKey = googleProviderAccountKey(primary.id);
    const encryptedPayload = encryptGoogleRefreshToken(
      token.refreshToken,
      callback.config.encryptionKey,
    );
    const prisma = getPrismaClient() as any;

    await prisma.$transaction(async (transaction: any) => {
      const existing = await transaction.calendarConnection.findUnique({
        where: {
          provider_providerAccountKey: {
            provider: "GOOGLE",
            providerAccountKey,
          },
        },
        select: { id: true, userId: true },
      });
      if (existing && existing.userId !== session.user.id) {
        throw new GoogleCalendarOAuthError(
          "That Google Calendar account is already connected to another Quipsly account.",
          "provider-account-already-connected",
          409,
        );
      }
      const connection = existing
        ? await transaction.calendarConnection.update({
            where: { id: existing.id },
            data: {
              grantedScopes: token.grantedScopes,
              status: "VERIFIED",
              verifiedAt: new Date(),
              lastCheckedAt: new Date(),
              revokedAt: null,
              metadataJson: {
                schema: "quipsly-google-calendar-user-oauth-v1",
                accountLabel: primary.summary,
                primaryTimeZone: primary.timeZone,
              },
            },
          })
        : await transaction.calendarConnection.create({
            data: {
              userId: session.user.id,
              provider: "GOOGLE",
              connectionKind: "USER_OAUTH",
              providerAccountKey,
              grantedScopes: token.grantedScopes,
              status: "VERIFIED",
              verifiedAt: new Date(),
              lastCheckedAt: new Date(),
              metadataJson: {
                schema: "quipsly-google-calendar-user-oauth-v1",
                accountLabel: primary.summary,
                primaryTimeZone: primary.timeZone,
              },
            },
          });
      const credential = await transaction.calendarOAuthCredential.upsert({
        where: { connectionId: connection.id },
        create: { connectionId: connection.id, encryptedPayload },
        update: { encryptedPayload, encryptionVersion: "aes-256-gcm-v1" },
      });
      await transaction.calendarConnection.update({
        where: { id: connection.id },
        data: { credentialRef: `database:calendar-oauth-credential:${credential.id}` },
      });
      await transaction.calendarSyncReceipt.create({
        data: {
          connectionId: connection.id,
          actorUserId: session.user.id,
          operation: "VERIFY",
          outcome: "SUCCEEDED",
          externalMutated: false,
          requestDigest: createHash("sha256").update(state).digest("hex"),
          providerStatus: "verified",
          metadataJson: {
            schema: "quipsly-calendar-connection-receipt-v1",
            ownedCalendarCount: calendars.length,
            credentialStoredEncrypted: true,
          },
        },
      });
    });

    return scheduleRedirect(request, "connected");
  } catch (error) {
    console.error("[google-calendar-oauth] Callback failed", {
      code:
        error instanceof GoogleCalendarOAuthError
          ? error.code
          : "callback-failed",
    });
    return scheduleRedirect(
      request,
      error instanceof GoogleCalendarOAuthError
        ? error.code
        : "callback-failed",
    );
  }
}
