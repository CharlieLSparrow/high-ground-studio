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
import { resolveStudioProjectAccess } from "@/lib/server/studio-project-access";

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
        sourceType: { in: ["CallRoom", "StudioEpisodeMilestone"] },
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
        sourceType: true,
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

    const roomProjections = projections.filter((projection: any) => projection.sourceType !== "StudioEpisodeMilestone");
    const milestoneProjections = projections.filter((projection: any) => projection.sourceType === "StudioEpisodeMilestone");
    const readableRooms = roomProjections.length > 0 ? await prisma.callRoom.findMany({
      where: {
        OR: roomProjections.map((projection: any) =>
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
    }) : [];
    const writableRooms = roomProjections.length > 0 ? await prisma.callRoom.findMany({
      where: {
        OR: roomProjections.map((projection: any) =>
          sessionMutationAccessWhere(projection.sourceId, session.user)
        ),
      },
      select: { id: true },
    }) : [];
    const milestoneRows = milestoneProjections.length > 0
      ? await prisma.studioEpisodeMilestone.findMany({
          where: { id: { in: milestoneProjections.map((projection: any) => projection.sourceId) } },
          select: {
            id: true,
            title: true,
            kind: true,
            status: true,
            startsAt: true,
            endsAt: true,
            timezone: true,
            episodeProduction: {
              select: {
                title: true,
                slug: true,
                project: { select: { id: true, slug: true } },
              },
            },
          },
        })
      : [];
    const projectAccessById = new Map<string, { read: boolean; write: boolean }>();
    for (const milestone of milestoneRows) {
      const project = milestone.episodeProduction.project;
      if (projectAccessById.has(project.id)) continue;
      const [read, write] = await Promise.all([
        resolveStudioProjectAccess({ projectSlug: project.slug, email: session.user.primaryEmail, action: "read", prisma }),
        resolveStudioProjectAccess({ projectSlug: project.slug, email: session.user.primaryEmail, action: "write", prisma }),
      ]);
      projectAccessById.set(project.id, {
        read: read.allowed && read.projectId === project.id,
        write: write.allowed && write.projectId === project.id,
      });
    }
    const roomById = new Map(readableRooms.map((room: any) => [room.id, room]));
    const writableIds = new Set(writableRooms.map((room: any) => room.id));
    const milestoneById = new Map(milestoneRows.map((milestone: any) => [milestone.id, milestone]));
    const conflicts = projections.flatMap((projection: any) => {
      const latestReceipt = projection.receipts[0] || null;
      const reason = googleCalendarConflictReason({
        metadataJson: projection.metadataJson,
        latestReceiptProviderStatus: latestReceipt?.providerStatus,
      });
      const room = projection.sourceType !== "StudioEpisodeMilestone"
        ? roomById.get(projection.sourceId) as any
        : null;
      const milestone = projection.sourceType === "StudioEpisodeMilestone"
        ? milestoneById.get(projection.sourceId) as any
        : null;
      if (!room && !milestone) return [];
      const projectId = room?.projectId || milestone?.episodeProduction.project.id || null;
      const access = milestone ? projectAccessById.get(projectId) : null;
      if (milestone && !access?.read) return [];
      const source = room ? {
        type: "SESSION" as const,
        id: room.id,
        title: room.title || (room.purpose === "PODCAST" ? "Podcast Session" : "Coaching Session"),
        purpose: room.purpose,
        projectId: room.projectId,
        status: room.status,
        startsAt: room.scheduledStart?.toISOString() || null,
        endsAt: room.scheduledEnd?.toISOString() || null,
        timezone: mobileSessionScheduledTimezone(room.metadataJson, room.booking?.timezone),
        href: `/sessions/${encodeURIComponent(room.id)}`,
      } : {
        type: "PRODUCTION_MILESTONE" as const,
        id: milestone.id,
        title: milestone.title,
        purpose: "PODCAST_PRODUCTION",
        projectId,
        status: milestone.status,
        startsAt: milestone.startsAt.toISOString(),
        endsAt: milestone.endsAt?.toISOString() || null,
        timezone: milestone.timezone,
        href: `/nests/${encodeURIComponent(milestone.episodeProduction.project.slug)}/episodes/${encodeURIComponent(milestone.episodeProduction.slug)}`,
      };
      const canWrite = (room ? writableIds.has(room.id) : access?.write === true)
        && (!projection.collection.nestId || projection.collection.nestId === projectId);
      return [{
        projectionId: projection.id,
        collection: {
          id: projection.collection.id,
          displayName: projection.collection.displayName,
          purpose: projection.collection.purpose,
        },
        source,
        session: room ? {
          id: room.id,
          title: room.title || (room.purpose === "PODCAST" ? "Podcast Session" : "Coaching Session"),
          purpose: room.purpose,
          projectId: room.projectId,
          status: room.status,
          scheduledStart: room.scheduledStart?.toISOString() || null,
          scheduledEnd: room.scheduledEnd?.toISOString() || null,
          timezone: mobileSessionScheduledTimezone(room.metadataJson, room.booking?.timezone),
        } : null,
        milestone: milestone ? {
          id: milestone.id,
          title: milestone.title,
          kind: milestone.kind,
          projectId,
          status: milestone.status,
          startsAt: milestone.startsAt.toISOString(),
          endsAt: milestone.endsAt?.toISOString() || null,
          timezone: milestone.timezone,
          episodeTitle: milestone.episodeProduction.title,
          episodeSlug: milestone.episodeProduction.slug,
          projectSlug: milestone.episodeProduction.project.slug,
        } : null,
        reason,
        observedAt: latestReceipt?.occurredAt?.toISOString() || projection.updatedAt.toISOString(),
        conflictVersion: googleCalendarConflictVersion({ ...projection, reason }),
        allowedIntents: canWrite
          ? [
              ...(canPrepareQuipslyCalendarUpdate({
                reason,
                providerEventId: projection.providerEventId,
                providerEtag: projection.providerEtag,
                roomStatus: source.status,
                roomScheduledStart: source.startsAt,
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
