import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import {
  decryptGoogleRefreshToken,
  getGoogleCalendarOAuthConfig,
  GoogleCalendarOAuthError,
  listOwnedGoogleCalendars,
  refreshGoogleCalendarAccess,
  revokeGoogleCalendarToken,
} from "@/lib/server/google-calendar-oauth";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { resolveStudioProjectAccess } from "@/lib/server/studio-project-access";

export const runtime = "nodejs";

const PURPOSES = new Set([
  "COACHING",
  "PODCAST_PRODUCTION",
  "PERSONAL_COMMITMENTS",
]);

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Authorization, Cookie",
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
}

function metadataRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function actorConnection(prisma: any, userId: string) {
  return prisma.calendarConnection.findFirst({
    where: {
      userId,
      provider: "GOOGLE",
      connectionKind: "USER_OAUTH",
      status: { not: "REVOKED" },
    },
    orderBy: { updatedAt: "desc" },
    include: {
      oauthCredential: true,
      collections: {
        where: { status: "ACTIVE" },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          purpose: true,
          displayName: true,
          providerCalendarId: true,
          nestId: true,
          timezone: true,
        },
      },
    },
  });
}

async function providerCalendars(input: {
  connection: any;
  requestUrl: string;
  prisma: any;
}) {
  if (!input.connection.oauthCredential?.encryptedPayload) {
    throw new GoogleCalendarOAuthError(
      "The Google Calendar connection has no usable credential. Connect it again.",
      "missing-encrypted-credential",
      409,
    );
  }
  const config = getGoogleCalendarOAuthConfig(input.requestUrl);
  const refreshToken = decryptGoogleRefreshToken(
    input.connection.oauthCredential.encryptedPayload,
    config.encryptionKey,
  );
  try {
    const accessToken = await refreshGoogleCalendarAccess({
      refreshToken,
      config,
    });
    const calendars = await listOwnedGoogleCalendars(accessToken);
    await input.prisma.calendarConnection.update({
      where: { id: input.connection.id },
      data: { status: "VERIFIED", lastCheckedAt: new Date() },
    });
    return { calendars, refreshToken };
  } catch (error) {
    if (
      error instanceof GoogleCalendarOAuthError &&
      error.code === "invalid_grant"
    ) {
      await input.prisma.calendarConnection.update({
        where: { id: input.connection.id },
        data: { status: "DEGRADED", lastCheckedAt: new Date() },
      });
    }
    throw error;
  }
}

export async function GET(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id) return json({ ok: false, error: "Authentication required." }, 401);
  const prisma = getPrismaClient() as any;
  try {
    const connection = await actorConnection(prisma, session.user.id);
    if (!connection) return json({ ok: true, connection: null, calendars: [], selections: [] });
    const provider = await providerCalendars({ connection, requestUrl: request.url, prisma });
    const metadata = metadataRecord(connection.metadataJson);
    return json({
      ok: true,
      connection: {
        id: connection.id,
        status: connection.status,
        accountLabel:
          typeof metadata.accountLabel === "string"
            ? metadata.accountLabel
            : "Google Calendar",
        verifiedAt: connection.verifiedAt?.toISOString() ?? null,
      },
      calendars: provider.calendars,
      selections: connection.collections,
    });
  } catch (error) {
    const known = error instanceof GoogleCalendarOAuthError;
    return json(
      {
        ok: false,
        error: known ? error.message : "Google Calendar is temporarily unavailable.",
        code: known ? error.code : "calendar-provider-unavailable",
      },
      known ? error.status : 503,
    );
  }
}

export async function POST(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id) return json({ ok: false, error: "Authentication required." }, 401);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const purpose = typeof body?.purpose === "string" ? body.purpose : "";
  const calendarId = typeof body?.calendarId === "string" ? body.calendarId.trim() : "";
  const projectId = typeof body?.projectId === "string" ? body.projectId.trim() : "";
  if (!PURPOSES.has(purpose) || !calendarId) {
    return json({ ok: false, error: "Choose a calendar and a Quipsly calendar lane." }, 400);
  }
  if (purpose === "PODCAST_PRODUCTION" && !projectId) {
    return json({ ok: false, error: "Choose the episode Nest for this production calendar." }, 400);
  }

  const prisma = getPrismaClient() as any;
  try {
    let nestId: string | null = null;
    if (purpose === "PODCAST_PRODUCTION") {
      const project = await prisma.studioProject.findUnique({
        where: { id: projectId },
        select: { slug: true },
      });
      const access = project
        ? await resolveStudioProjectAccess({
            projectSlug: project.slug,
            email: session.user.primaryEmail || session.user.email,
            action: "write",
            prisma,
          })
        : null;
      if (!access?.allowed || access.projectId !== projectId) {
        return json({ ok: false, error: "You need edit access to select a team calendar for that episode Nest." }, 403);
      }
      nestId = projectId;
    }

    const connection = await actorConnection(prisma, session.user.id);
    if (!connection) return json({ ok: false, error: "Connect Google Calendar first." }, 409);
    const provider = await providerCalendars({ connection, requestUrl: request.url, prisma });
    const selected = provider.calendars.find((calendar) => calendar.id === calendarId);
    if (!selected) return json({ ok: false, error: "That owned Google calendar is no longer available." }, 409);

    const existing = await prisma.calendarCollection.findUnique({
      where: {
        connectionId_providerCalendarId: {
          connectionId: connection.id,
          providerCalendarId: selected.id,
        },
      },
      select: { id: true },
    });
    const scope = nestId
      ? { nestId, ownerUserId: null, workspaceId: null }
      : { ownerUserId: session.user.id, nestId: null, workspaceId: null };
    const collection = existing
      ? await prisma.calendarCollection.update({
          where: { id: existing.id },
          data: {
            ...scope,
            purpose,
            displayName: selected.summary,
            timezone: selected.timeZone || "UTC",
            visibility: nestId ? "TEAM" : "PRIVATE",
            status: "ACTIVE",
            metadataJson: {
              schema: "quipsly-google-calendar-selection-v1",
              selectedByUserId: session.user.id,
            },
          },
        })
      : await prisma.calendarCollection.create({
          data: {
            connectionId: connection.id,
            ...scope,
            purpose,
            displayName: selected.summary,
            timezone: selected.timeZone || "UTC",
            providerCalendarId: selected.id,
            visibility: nestId ? "TEAM" : "PRIVATE",
            isDefault: selected.primary,
            status: "ACTIVE",
            metadataJson: {
              schema: "quipsly-google-calendar-selection-v1",
              selectedByUserId: session.user.id,
            },
          },
        });
    await prisma.calendarSyncReceipt.create({
      data: {
        connectionId: connection.id,
        collectionId: collection.id,
        actorUserId: session.user.id,
        operation: "VERIFY",
        outcome: "SUCCEEDED",
        externalMutated: false,
        requestDigest: createHash("sha256")
          .update(`${purpose}:${calendarId}:${projectId}`)
          .digest("hex"),
        providerStatus: "owned-calendar-selected",
        metadataJson: {
          schema: "quipsly-calendar-selection-receipt-v1",
          providerAccessRole: selected.accessRole,
        },
      },
    });
    return json({ ok: true, selection: {
      id: collection.id,
      purpose: collection.purpose,
      displayName: collection.displayName,
      projectId: collection.nestId,
    } });
  } catch (error) {
    const known = error instanceof GoogleCalendarOAuthError;
    return json(
      { ok: false, error: known ? error.message : "The calendar selection could not be saved." },
      known ? error.status : 503,
    );
  }
}

export async function DELETE(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id) return json({ ok: false, error: "Authentication required." }, 401);
  const prisma = getPrismaClient() as any;
  try {
    const connection = await actorConnection(prisma, session.user.id);
    if (!connection) return json({ ok: true, disconnected: false });
    if (!connection.oauthCredential?.encryptedPayload) {
      throw new GoogleCalendarOAuthError(
        "The saved Google Calendar credential is missing.",
        "missing-encrypted-credential",
        409,
      );
    }
    const config = getGoogleCalendarOAuthConfig(request.url);
    const refreshToken = decryptGoogleRefreshToken(
      connection.oauthCredential.encryptedPayload,
      config.encryptionKey,
    );
    const providerResult = await revokeGoogleCalendarToken(refreshToken);
    await prisma.$transaction(async (transaction: any) => {
      await transaction.calendarCollection.updateMany({
        where: { connectionId: connection.id },
        data: { status: "REVOKED" },
      });
      await transaction.calendarOAuthCredential.deleteMany({
        where: { connectionId: connection.id },
      });
      await transaction.calendarConnection.update({
        where: { id: connection.id },
        data: {
          credentialRef: null,
          status: "REVOKED",
          revokedAt: new Date(),
          lastCheckedAt: new Date(),
        },
      });
      await transaction.calendarSyncReceipt.create({
        data: {
          connectionId: connection.id,
          actorUserId: session.user.id,
          operation: "VERIFY",
          outcome: "SUCCEEDED",
          externalMutated: providerResult === "revoked",
          providerStatus: providerResult,
          metadataJson: { schema: "quipsly-calendar-disconnect-receipt-v1" },
        },
      });
    });
    return json({ ok: true, disconnected: true });
  } catch (error) {
    const known = error instanceof GoogleCalendarOAuthError;
    return json(
      { ok: false, error: known ? error.message : "Google Calendar could not be disconnected safely." },
      known ? error.status : 503,
    );
  }
}
