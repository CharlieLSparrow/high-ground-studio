import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { resolveCalendarPublicOrigin } from "@/lib/server/calendar-public-origin";
import {
  cancelGoogleCalendarProjectionOperation,
  GoogleCalendarProjectionOperationError,
  synchronizeGoogleCalendarProjection,
} from "@/lib/server/google-calendar-projection-operation";
import {
  buildProductionMilestoneCalendarProjectionPreview,
  buildProductionMilestoneCalendarSnapshot,
  SessionCalendarProjectionError,
} from "@/lib/server/google-calendar-session-projection";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { resolveStudioProjectAccess } from "@/lib/server/studio-project-access";

export const runtime = "nodejs";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Authorization, Cookie",
};
const PROJECTION_SCHEMA = "quipsly-production-milestone-calendar-projection-v1";
const RECEIPT_SCHEMA = "quipsly-production-milestone-calendar-sync-receipt-v1";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
}

async function projectionContext(input: {
  request: Request;
  milestoneId: string;
  collectionId: string;
  actor: { id: string; primaryEmail: string };
  action: "read" | "write";
  prisma: any;
}) {
  const milestone = await input.prisma.studioEpisodeMilestone.findUnique({
    where: { id: input.milestoneId },
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
  });
  if (!milestone) {
    throw new SessionCalendarProjectionError(
      "That production milestone is unavailable.",
      "milestone-not-found",
      404,
    );
  }
  const project = milestone.episodeProduction.project;
  const access = await resolveStudioProjectAccess({
    projectSlug: project.slug,
    email: input.actor.primaryEmail,
    action: input.action,
    prisma: input.prisma,
  });
  if (!access.allowed || access.projectId !== project.id) {
    throw new SessionCalendarProjectionError(
      "That production milestone is unavailable.",
      "milestone-not-found",
      404,
    );
  }
  const collection = await input.prisma.calendarCollection.findFirst({
    where: {
      id: input.collectionId,
      purpose: "PODCAST_PRODUCTION",
      nestId: project.id,
      status: "ACTIVE",
      connection: {
        userId: input.actor.id,
        provider: "GOOGLE",
        connectionKind: "USER_OAUTH",
        status: "VERIFIED",
      },
    },
    include: { connection: { include: { oauthCredential: true } } },
  });
  if (!collection?.providerCalendarId) {
    throw new SessionCalendarProjectionError(
      "Choose an owned Google calendar for this episode Nest first.",
      "calendar-selection-not-found",
      409,
    );
  }
  const snapshot = buildProductionMilestoneCalendarSnapshot({
    milestoneId: milestone.id,
    title: milestone.title,
    episodeTitle: milestone.episodeProduction.title,
    kind: milestone.kind,
    milestoneStatus: milestone.status,
    startsAt: milestone.startsAt,
    endsAt: milestone.endsAt,
    timezone: milestone.timezone || collection.timezone || "UTC",
    url: new URL(
      `/nests/${encodeURIComponent(project.slug)}/episodes/${encodeURIComponent(milestone.episodeProduction.slug)}`,
      resolveCalendarPublicOrigin(input.request.url),
    ).toString(),
    providerVisibility: collection.visibility === "TEAM" ? "default" : "private",
  });
  const existing = await input.prisma.calendarProjection.findUnique({
    where: {
      collectionId_sourceType_sourceId: {
        collectionId: collection.id,
        sourceType: "StudioEpisodeMilestone",
        sourceId: milestone.id,
      },
    },
  });
  return {
    source: { id: milestone.id },
    milestone,
    collection,
    preview: buildProductionMilestoneCalendarProjectionPreview({ snapshot, existing }),
  };
}

function operationError(error: unknown, fallback: string) {
  if (error instanceof GoogleCalendarProjectionOperationError) {
    return json({
      ok: false,
      error: error.message,
      code: error.code,
      providerWriteAttempted: error.providerWriteAttempted,
      externalSideEffects: error.externalSideEffects,
      nextAction: error.nextAction,
      projectionId: error.projectionId,
      receiptId: error.receiptId,
    }, error.status);
  }
  if (error instanceof SessionCalendarProjectionError) {
    return json({ ok: false, error: error.message, code: error.code, externalSideEffects: false }, error.status);
  }
  console.error("[calendar-milestone-projection] Operation failed", error);
  return json({ ok: false, error: fallback, code: "milestone-calendar-failed", externalSideEffects: false }, 503);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ milestoneId: string }> },
) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id) return json({ ok: false, error: "Authentication required." }, 401);
  const collectionId = new URL(request.url).searchParams.get("collectionId")?.trim() || "";
  if (!collectionId) return json({ ok: false, error: "Choose a Google calendar selection first." }, 400);
  try {
    const { milestoneId } = await context.params;
    const result = await projectionContext({
      request,
      milestoneId,
      collectionId,
      actor: session.user,
      action: "read",
      prisma: getPrismaClient() as any,
    });
    return json({
      ok: true,
      collection: { id: result.collection.id, displayName: result.collection.displayName, purpose: result.collection.purpose },
      preview: result.preview,
      externalSideEffects: false,
    });
  } catch (error) {
    return operationError(error, "The production milestone calendar preview is temporarily unavailable.");
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ milestoneId: string }> },
) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id) return json({ ok: false, error: "Authentication required." }, 401);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const collectionId = typeof body?.collectionId === "string" ? body.collectionId.trim() : "";
  const expectedSourceRevision = typeof body?.expectedSourceRevision === "string" ? body.expectedSourceRevision.trim() : "";
  if (!collectionId || !expectedSourceRevision) {
    return json({ ok: false, error: "Preview this exact production milestone before confirming the Google write.", externalSideEffects: false }, 400);
  }
  const prisma = getPrismaClient() as any;
  try {
    const { milestoneId } = await context.params;
    const load = () => projectionContext({ request, milestoneId, collectionId, actor: session.user, action: "write", prisma });
    const current = await load();
    if (current.preview.sourceRevision !== expectedSourceRevision) {
      return json({ ok: false, error: "The production milestone changed after preview. Review the current event before confirming.", code: "stale-milestone-preview", externalSideEffects: false }, 409);
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
    return operationError(error, "The production milestone could not be synchronized safely.");
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ milestoneId: string }> },
) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id) return json({ ok: false, error: "Authentication required." }, 401);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const collectionId = typeof body?.collectionId === "string" ? body.collectionId.trim() : "";
  const expectedSourceRevision = typeof body?.expectedSourceRevision === "string" ? body.expectedSourceRevision.trim() : "";
  if (!collectionId || !expectedSourceRevision || body?.confirmCancellation !== true) {
    return json({ ok: false, error: "Preview this exact canceled milestone and explicitly confirm Google Calendar removal.", externalSideEffects: false }, 400);
  }
  const prisma = getPrismaClient() as any;
  try {
    const { milestoneId } = await context.params;
    const load = () => projectionContext({ request, milestoneId, collectionId, actor: session.user, action: "write", prisma });
    const current = await load();
    if (current.preview.sourceRevision !== expectedSourceRevision) {
      return json({ ok: false, error: "The production milestone changed after preview. Review the current cancellation before confirming.", code: "stale-milestone-preview", externalSideEffects: false }, 409);
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
    return operationError(error, "The production milestone could not be removed safely.");
  }
}
