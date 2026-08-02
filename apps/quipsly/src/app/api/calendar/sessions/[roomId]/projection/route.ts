import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { resolveCalendarPublicOrigin } from "@/lib/server/calendar-public-origin";
import {
  cancelGoogleCalendarProjectionOperation,
  GoogleCalendarProjectionOperationError,
  synchronizeGoogleCalendarProjection,
} from "@/lib/server/google-calendar-projection-operation";
import {
  buildSessionCalendarProjectionPreview,
  buildSessionCalendarSnapshot,
  SessionCalendarProjectionError,
} from "@/lib/server/google-calendar-session-projection";
import { mobileSessionScheduledTimezone } from "@/lib/server/mobile-capture-session-schedule";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { sessionAccessWhere, sessionMutationAccessWhere } from "@/lib/server/session-access";

export const runtime = "nodejs";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Authorization, Cookie",
};
const PROJECTION_SCHEMA = "quipsly-session-calendar-projection-v1";
const RECEIPT_SCHEMA = "quipsly-session-calendar-sync-receipt-v1";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
}

function purposeForRoom(purpose: string) {
  if (purpose === "PODCAST") return "PODCAST_PRODUCTION";
  if (purpose === "COACHING") return "COACHING";
  return null;
}

async function projectionContext(input: {
  request: Request;
  roomId: string;
  collectionId: string;
  actor: { id: string; email: string; primaryEmail: string; isStaff: boolean };
  action?: "read" | "write";
  prisma: any;
}) {
  const room = await input.prisma.callRoom.findFirst({
    where: input.action === "write"
      ? sessionMutationAccessWhere(input.roomId, input.actor)
      : sessionAccessWhere(input.roomId, input.actor),
    select: {
      id: true,
      title: true,
      purpose: true,
      status: true,
      scheduledStart: true,
      scheduledEnd: true,
      metadataJson: true,
      projectId: true,
      booking: { select: { timezone: true } },
    },
  });
  if (!room) {
    throw new SessionCalendarProjectionError(
      "That Session is unavailable.",
      "session-not-found",
      404,
    );
  }
  if (!room.scheduledStart || !room.scheduledEnd) {
    throw new SessionCalendarProjectionError(
      "Schedule the Session in Quipsly before previewing a provider event.",
      "session-not-scheduled",
      409,
    );
  }
  const collectionPurpose = purposeForRoom(room.purpose);
  if (!collectionPurpose) {
    throw new SessionCalendarProjectionError(
      "Google projection is currently available for podcast and coaching Sessions.",
      "unsupported-session-purpose",
      409,
    );
  }
  const collection = await input.prisma.calendarCollection.findFirst({
    where: {
      id: input.collectionId,
      purpose: collectionPurpose,
      status: "ACTIVE",
      connection: {
        userId: input.actor.id,
        provider: "GOOGLE",
        connectionKind: "USER_OAUTH",
        status: "VERIFIED",
      },
      OR: [
        { ownerUserId: input.actor.id },
        ...(room.projectId ? [{ nestId: room.projectId }] : []),
      ],
    },
    include: { connection: { include: { oauthCredential: true } } },
  });
  if (!collection?.providerCalendarId) {
    throw new SessionCalendarProjectionError(
      "Choose an owned Google calendar for this Quipsly lane first.",
      "calendar-selection-not-found",
      409,
    );
  }
  const snapshot = buildSessionCalendarSnapshot({
    roomId: room.id,
    title: room.title,
    purpose: room.purpose,
    roomStatus: room.status,
    scheduledStart: room.scheduledStart,
    scheduledEnd: room.scheduledEnd,
    timezone: mobileSessionScheduledTimezone(room.metadataJson, room.booking?.timezone)
      || collection.timezone
      || "UTC",
    url: new URL(
      `/sessions/${encodeURIComponent(room.id)}`,
      resolveCalendarPublicOrigin(input.request.url),
    ).toString(),
    providerVisibility: collection.visibility === "TEAM" ? "default" : "private",
  });
  const existing = await input.prisma.calendarProjection.findUnique({
    where: {
      collectionId_sourceType_sourceId: {
        collectionId: collection.id,
        sourceType: "CallRoom",
        sourceId: room.id,
      },
    },
  });
  return {
    source: { id: room.id },
    room,
    collection,
    preview: buildSessionCalendarProjectionPreview({ snapshot, existing }),
  };
}

function operationError(error: unknown, fallback: string) {
  if (error instanceof GoogleCalendarProjectionOperationError) {
    const code = error.code === "source-not-cancelled"
      ? "session-not-cancelled"
      : error.code;
    return json({
      ok: false,
      error: error.message,
      code,
      providerWriteAttempted: error.providerWriteAttempted,
      externalSideEffects: error.externalSideEffects,
      nextAction: error.nextAction,
      projectionId: error.projectionId,
      receiptId: error.receiptId,
    }, error.status);
  }
  if (error instanceof SessionCalendarProjectionError) {
    return json({
      ok: false,
      error: error.message,
      code: error.code,
      externalSideEffects: false,
    }, error.status);
  }
  console.error("[calendar-session-projection] Operation failed", error);
  return json({
    ok: false,
    error: fallback,
    code: "session-calendar-failed",
    externalSideEffects: false,
  }, 503);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ roomId: string }> },
) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id) {
    return json({ ok: false, error: "Authentication required." }, 401);
  }
  const collectionId = new URL(request.url).searchParams.get("collectionId")?.trim() || "";
  if (!collectionId) {
    return json({ ok: false, error: "Choose a Google calendar selection first." }, 400);
  }
  try {
    const { roomId } = await context.params;
    const result = await projectionContext({
      request,
      roomId,
      collectionId,
      actor: session.user,
      prisma: getPrismaClient() as any,
    });
    return json({
      ok: true,
      collection: {
        id: result.collection.id,
        displayName: result.collection.displayName,
        purpose: result.collection.purpose,
      },
      preview: result.preview,
      externalSideEffects: false,
    });
  } catch (error) {
    return operationError(error, "The Session calendar preview is temporarily unavailable.");
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ roomId: string }> },
) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id) {
    return json({ ok: false, error: "Authentication required." }, 401);
  }
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const collectionId = typeof body?.collectionId === "string" ? body.collectionId.trim() : "";
  const expectedSourceRevision = typeof body?.expectedSourceRevision === "string"
    ? body.expectedSourceRevision.trim()
    : "";
  if (!collectionId || !expectedSourceRevision) {
    return json({
      ok: false,
      error: "Preview this exact Session revision before confirming the Google write.",
      externalSideEffects: false,
    }, 400);
  }
  const prisma = getPrismaClient() as any;
  try {
    const { roomId } = await context.params;
    const load = () => projectionContext({
      request,
      roomId,
      collectionId,
      actor: session.user,
      action: "write",
      prisma,
    });
    const current = await load();
    if (current.preview.sourceRevision !== expectedSourceRevision) {
      return json({
        ok: false,
        error: "The Session changed after preview. Review the current event before confirming.",
        code: "stale-session-preview",
        externalSideEffects: false,
      }, 409);
    }
    const result = await synchronizeGoogleCalendarProjection({
      prisma,
      requestUrl: request.url,
      actorUserId: session.user.id,
      current,
      reload: load,
      projectionSchema: PROJECTION_SCHEMA,
      receiptSchema: RECEIPT_SCHEMA,
    });
    return json({ ok: true, result });
  } catch (error) {
    return operationError(error, "The Google Calendar event could not be synchronized safely.");
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ roomId: string }> },
) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id) {
    return json({ ok: false, error: "Authentication required." }, 401);
  }
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const collectionId = typeof body?.collectionId === "string" ? body.collectionId.trim() : "";
  const expectedSourceRevision = typeof body?.expectedSourceRevision === "string"
    ? body.expectedSourceRevision.trim()
    : "";
  if (!collectionId || !expectedSourceRevision || body?.confirmCancellation !== true) {
    return json({
      ok: false,
      error: "Preview this exact canceled Session and explicitly confirm Google Calendar removal.",
      externalSideEffects: false,
    }, 400);
  }
  const prisma = getPrismaClient() as any;
  try {
    const { roomId } = await context.params;
    const load = () => projectionContext({
      request,
      roomId,
      collectionId,
      actor: session.user,
      action: "write",
      prisma,
    });
    const current = await load();
    if (current.preview.sourceRevision !== expectedSourceRevision) {
      return json({
        ok: false,
        error: "The Session changed after preview. Review the current cancellation before confirming.",
        code: "stale-session-preview",
        externalSideEffects: false,
      }, 409);
    }
    const result = await cancelGoogleCalendarProjectionOperation({
      prisma,
      requestUrl: request.url,
      actorUserId: session.user.id,
      current,
      reload: load,
      projectionSchema: PROJECTION_SCHEMA,
      receiptSchema: RECEIPT_SCHEMA,
    });
    return json({ ok: true, result });
  } catch (error) {
    return operationError(error, "The Google Calendar event could not be removed safely.");
  }
}
