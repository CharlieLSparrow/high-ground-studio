import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import {
  canPrepareQuipslyCalendarUpdate,
  googleCalendarConflictReason,
  googleCalendarConflictVersion,
  GOOGLE_CALENDAR_CONFLICT_INTENTS,
  GoogleCalendarConflictReviewError,
  resolveGoogleCalendarProjectionConflict,
  type GoogleCalendarConflictIntent,
} from "@/lib/server/google-calendar-conflict-review";
import { mobileSessionScheduledTimezone } from "@/lib/server/mobile-capture-session-schedule";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { sessionAccessWhere, sessionMutationAccessWhere } from "@/lib/server/session-access";

export const runtime = "nodejs";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Authorization, Cookie",
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
}

export async function GET(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id) return json({ ok: false, error: "Authentication required." }, 401);
  const prisma = getPrismaClient() as any;
  try {
    const projections = await prisma.calendarProjection.findMany({
      where: {
        sourceType: "CallRoom",
        conflictState: { not: "NONE" },
        collection: {
          status: "ACTIVE",
          connection: {
            userId: session.user.id,
            provider: "GOOGLE",
            connectionKind: "USER_OAUTH",
            status: "VERIFIED",
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: {
        id: true,
        sourceId: true,
        sourceRevision: true,
        providerEventId: true,
        providerEtag: true,
        status: true,
        conflictState: true,
        metadataJson: true,
        updatedAt: true,
        collection: {
          select: { id: true, displayName: true, purpose: true, nestId: true },
        },
        receipts: {
          where: { outcome: "CONFLICT" },
          orderBy: { occurredAt: "desc" },
          take: 1,
          select: { providerStatus: true, occurredAt: true },
        },
      },
    });
    if (projections.length === 0) return json({ ok: true, conflicts: [] });

    const readableRooms = await prisma.callRoom.findMany({
      where: {
        OR: projections.map((projection: any) =>
          sessionAccessWhere(projection.sourceId, session.user)
        ),
      },
      select: {
        id: true,
        title: true,
        purpose: true,
        projectId: true,
        status: true,
        scheduledStart: true,
        scheduledEnd: true,
        metadataJson: true,
        booking: { select: { timezone: true } },
      },
    });
    const writableRooms = await prisma.callRoom.findMany({
      where: {
        OR: projections.map((projection: any) =>
          sessionMutationAccessWhere(projection.sourceId, session.user)
        ),
      },
      select: { id: true },
    });
    const roomById = new Map(readableRooms.map((room: any) => [room.id, room]));
    const writableIds = new Set(writableRooms.map((room: any) => room.id));
    const conflicts = projections.flatMap((projection: any) => {
      const room = roomById.get(projection.sourceId) as any;
      if (!room) return [];
      const latestReceipt = projection.receipts[0] || null;
      const reason = googleCalendarConflictReason({
        metadataJson: projection.metadataJson,
        latestReceiptProviderStatus: latestReceipt?.providerStatus,
      });
      const canWrite = writableIds.has(room.id)
        && (!projection.collection.nestId || projection.collection.nestId === room.projectId);
      return [{
        projectionId: projection.id,
        collection: {
          id: projection.collection.id,
          displayName: projection.collection.displayName,
          purpose: projection.collection.purpose,
        },
        session: {
          id: room.id,
          title: room.title || (room.purpose === "PODCAST" ? "Podcast Session" : "Coaching Session"),
          purpose: room.purpose,
          projectId: room.projectId,
          status: room.status,
          scheduledStart: room.scheduledStart?.toISOString() || null,
          scheduledEnd: room.scheduledEnd?.toISOString() || null,
          timezone: mobileSessionScheduledTimezone(room.metadataJson, room.booking?.timezone),
        },
        reason,
        observedAt: latestReceipt?.occurredAt?.toISOString() || projection.updatedAt.toISOString(),
        conflictVersion: googleCalendarConflictVersion({ ...projection, reason }),
        allowedIntents: canWrite
          ? [
              ...(canPrepareQuipslyCalendarUpdate({
                reason,
                providerEventId: projection.providerEventId,
                providerEtag: projection.providerEtag,
                roomStatus: room.status,
                roomScheduledStart: room.scheduledStart,
              }) ? ["PREPARE_QUIPSLY_UPDATE"] : []),
              "STOP_PROJECTING",
            ]
          : [],
        providerContentImported: false,
      }];
    });
    return json({ ok: true, conflicts });
  } catch {
    return json({ ok: false, error: "Calendar conflicts could not be loaded safely." }, 503);
  }
}

export async function POST(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id) return json({ ok: false, error: "Authentication required." }, 401);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const projectionId = typeof body?.projectionId === "string" ? body.projectionId.trim() : "";
  const expectedConflictVersion = typeof body?.expectedConflictVersion === "string"
    ? body.expectedConflictVersion.trim()
    : "";
  const intent = typeof body?.intent === "string" ? body.intent.trim() : "";
  if (
    !projectionId
    || !expectedConflictVersion
    || !GOOGLE_CALENDAR_CONFLICT_INTENTS.includes(intent as GoogleCalendarConflictIntent)
  ) {
    return json({ ok: false, error: "Review the current conflict and choose one explicit decision." }, 400);
  }
  try {
    const result = await resolveGoogleCalendarProjectionConflict({
      prisma: getPrismaClient() as any,
      actor: session.user,
      projectionId,
      expectedConflictVersion,
      intent: intent as GoogleCalendarConflictIntent,
    });
    return json({ ok: true, result });
  } catch (error) {
    const known = error instanceof GoogleCalendarConflictReviewError;
    return json({
      ok: false,
      error: known ? error.message : "The conflict decision could not be recorded safely.",
      code: known ? error.code : "calendar-conflict-review-failed",
      externalSideEffects: false,
    }, known ? error.status : 503);
  }
}
