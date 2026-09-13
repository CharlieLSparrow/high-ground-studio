import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { sessionAccessWhere, sessionMutationAccessWhere } from "@/lib/server/session-access";
import { loadSessionWorkAssignmentContext } from "@/lib/server/session-work-assignment";
import { retryCoachingWorkTransaction } from "@/lib/server/coaching-work-transaction";
import { loadSessionWork } from "@/lib/server/session-work";

export const runtime = "nodejs";

/** Both the call panel and direct links use the same Session-scoped projection. */
export async function GET(request: Request, context: { params: Promise<{ roomId: string }> }) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user) return NextResponse.json({ ok: false, error: "Sign in to open this task." }, { status: 401 });
  const requestedEntry = new URL(request.url).searchParams.get("entryId");
  const entryId = requestedEntry?.trim();
  if (requestedEntry !== null && (!entryId || entryId.length > 240)) return NextResponse.json({ ok: false, error: "Choose a task to open." }, { status: 400 });
  const { roomId } = await context.params;
  const prisma = getPrismaClient();
  if (requestedEntry === null) {
    const room = await prisma.callRoom.findFirst({where: sessionAccessWhere(roomId, session.user), select: {id: true}});
    if (!room) return NextResponse.json({ok: false, error: "This session isn't available to this account."}, {status: 404});
    const [entries, writable, assignmentContext] = await Promise.all([
      loadSessionWork({prisma, roomId, actor: session.user}),
      prisma.callRoom.findFirst({where: sessionMutationAccessWhere(roomId, session.user), select: {id: true}}),
      loadSessionWorkAssignmentContext({prisma, roomId, actor: session.user}),
    ]);
    return NextResponse.json({ok: true, roomId, actorUserId: session.user.id, entries,
      canCreate: Boolean(writable), assignmentContext}, {headers: {"Cache-Control": "private, no-store"}});
  }
  const entries = await loadSessionWork({ prisma, roomId, actor: session.user, entryId });
  const entry = entries.find(row => row.id === entryId);
  if (!entry) return NextResponse.json({ ok: false, error: "This task is no longer available to this account." }, { status: 404 });
  return NextResponse.json({ ok: true, roomId, entry }, { headers: { "Cache-Control": "private, no-store" } });
}

const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SCHEMA = "quipsly-session-work-entry-v1";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function optionalDate(value: unknown) {
  const raw = text(value, 100);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed : "invalid" as const;
}

type SessionWorkRow = {
  id: string; title: string; status: string; createdAt: Date; updatedAt: Date;
  detail?: string | null; description?: string | null; dueAt?: Date | null; targetAt?: Date | null;
  assignedUserId?: string | null; ownerUserId?: string; engagementId?: string | null;
};

function publicEntry(kind: "TASK" | "GOAL", row: SessionWorkRow, visibility: string, actorId: string, ownerId: string, ownerLabel: string) {
  const currentOwnerId = (kind === "TASK" ? row.assignedUserId : row.ownerUserId) || ownerId;
  return {
    id: row.id,
    kind,
    title: row.title,
    body: kind === "TASK" ? row.detail : row.description,
    status: String(row.status),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    dueAt: (kind === "TASK" ? row.dueAt : row.targetAt)?.toISOString() ?? null,
    tags: [],
    visibility,
    ownedByCurrentActor: currentOwnerId === actorId,
    ownerUserId: currentOwnerId,
    ownerLabel,
    engagementId: row.engagementId ?? null,
    canEdit: true,
  };
}

export async function POST(request: Request, context: { params: Promise<{ roomId: string }> }) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "Sign in before creating Session work." }, { status: 401 });
  }

  const { roomId } = await context.params;
  const body = object(await request.json().catch(() => ({})));
  const clientRequestId = text(body.clientRequestId, 80).toLowerCase();
  const kind = text(body.kind, 20).toUpperCase() as "TASK" | "GOAL";
  const title = text(body.title, 500);
  const detail = text(body.body, 5_000);
  const sourceMessageId = text(body.sourceMessageId, 240);
  const visibility = text(body.visibility, 40).toUpperCase() as "AUTHOR_PRIVATE" | "SESSION_SHARED" | "ENGAGEMENT_SHARED";
  const ownerUserId = text(body.ownerUserId, 240) || session.user.id;
  const targetAt = optionalDate(body.targetAt);

  if (!REQUEST_ID.test(clientRequestId)) {
    return NextResponse.json({ ok: false, error: "A stable request identity is required so retry cannot create a duplicate." }, { status: 400 });
  }
  if (!(["TASK", "GOAL"] as const).includes(kind)) {
    return NextResponse.json({ ok: false, error: "Choose Task or Goal." }, { status: 400 });
  }
  if (!title) {
    return NextResponse.json({ ok: false, error: `Name the ${kind.toLowerCase()} before saving it.` }, { status: 400 });
  }
  if (!(["AUTHOR_PRIVATE", "SESSION_SHARED", "ENGAGEMENT_SHARED"] as const).includes(visibility)) {
    return NextResponse.json({ ok: false, error: "Choose Only me or Everyone in this Session." }, { status: 400 });
  }
  if (visibility !== "ENGAGEMENT_SHARED" && ownerUserId !== session.user.id) {
    return NextResponse.json({ok: false, error: "To assign work to a collaborator, share it with your client space."}, {status: 400});
  }
  if (targetAt === "invalid") {
    return NextResponse.json({ ok: false, error: "Review the optional target date before saving." }, { status: 400 });
  }

  const prisma = getPrismaClient();
  const id = `session-${kind.toLowerCase()}-${clientRequestId}`;
  const requestFingerprint = createHash("sha256").update(JSON.stringify({
    kind,
    title,
    detail,
    visibility,
    targetAt: targetAt?.toISOString() || null,
    ...(body.ownerUserId ? {ownerUserId} : {}),
    ...(sourceMessageId ? {sourceMessageId} : {}),
  })).digest("hex");

  try {
    const result = await retryCoachingWorkTransaction(() => prisma.$transaction(async (tx) => {
      const room = await tx.callRoom.findFirst({
        where: sessionMutationAccessWhere(roomId, session.user),
        select: { id: true, projectId: true },
      });
      if (!room) return { kind: "unavailable" as const };
      // A conversation ID is not permission, and Session discussion must not
      // be copied into a wider client-space scope by a supplied visibility.
      if (sourceMessageId && visibility !== "SESSION_SHARED") return {kind: "invalid-source-scope" as const};
      const sourceMessage = sourceMessageId ? await tx.sessionConversationMessage.findFirst({
        where: {id: sourceMessageId, roomId: room.id, deletedAt: null},
        select: {id: true, body: true, revision: true, authorUserId: true},
      }) : null;
      if (sourceMessageId && (!sourceMessage || !sourceMessage.body.trim())) return {kind: "source-unavailable" as const};
      const assignment = visibility === "ENGAGEMENT_SHARED"
        ? await loadSessionWorkAssignmentContext({prisma: tx, roomId, actor: session.user}) : null;
      const owner = assignment?.members.find(member => member.id === ownerUserId);
      if (visibility === "ENGAGEMENT_SHARED" && (!assignment || !owner)) return {kind: "invalid-owner" as const};
      const ownerLabel = owner?.label || session.user.name || session.user.primaryEmail || "Me";
      const sourceJson = {
        schema: SCHEMA,
        surface: "web-session",
        origin: "explicit-human-capture",
        clientRequestId,
        requestFingerprint,
        roomId: room.id,
        ...(sourceMessage ? {sourceMessageId: sourceMessage.id, sourceMessageRevision: sourceMessage.revision,
          sourceMessageExcerpt: sourceMessage.body.slice(0, 5_000), sourceMessageAuthorUserId: sourceMessage.authorUserId} : {}),
        actorUserId: session.user.id,
        visibility: visibility === "ENGAGEMENT_SHARED" ? "engagement-shared" : visibility,
        humanCommitted: true,
        offlineRetrySafe: true,
        externalSideEffects: false,
        calendarMutated: false,
        reminderScheduled: false,
        messageSent: false,
        delivered: false,
        published: false,
      };
      const existing = kind === "TASK"
        ? await tx.actionItem.findUnique({ where: { id } })
        : await tx.goal.findUnique({ where: { id } });
      if (existing) {
        const source = object(existing.sourceJson);
        if (
          source.schema !== SCHEMA ||
          source.clientRequestId !== clientRequestId ||
          source.requestFingerprint !== requestFingerprint ||
          source.roomId !== room.id ||
          source.actorUserId !== session.user.id
        ) {
          return { kind: "conflict" as const };
        }
        const currentOwnerId = "assignedUserId" in existing ? existing.assignedUserId : existing.ownerUserId;
        const currentOwnerLabel = !currentOwnerId || currentOwnerId === ownerUserId ? ownerLabel
          : assignment?.members.find(member => member.id === currentOwnerId)?.label || "Collaborator";
        return { kind: "saved" as const, row: existing, ownerLabel: currentOwnerLabel, idempotentReplay: true };
      }

      const row = kind === "TASK"
        ? await tx.actionItem.create({
            data: {
              id,
              roomId: room.id,
              projectId: room.projectId,
              assignedUserId: ownerUserId,
              ...(assignment ? {engagementId: assignment.engagementId} : {}),
              title,
              detail: sourceMessage ? sourceMessage.body.slice(0, 5_000) : detail || null,
              status: "OPEN",
              dueAt: targetAt,
              sourceJson,
            },
          })
        : await tx.goal.create({
            data: {
              id,
              roomId: room.id,
              projectId: room.projectId,
              ownerUserId,
              ...(assignment ? {engagementId: assignment.engagementId} : {}),
              title,
              description: sourceMessage ? sourceMessage.body.slice(0, 5_000) : detail || null,
              status: "ACTIVE",
              targetAt,
              sourceJson,
            },
          });
      return { kind: "saved" as const, row, ownerLabel, idempotentReplay: false };
    }, {isolationLevel: "Serializable"}));

    if (result.kind === "unavailable") {
      return NextResponse.json({ ok: false, error: "This Session is unavailable or read-only for this account." }, { status: 404 });
    }
    if (result.kind === "conflict") {
      return NextResponse.json({ ok: false, error: "That retry identity belongs to different Session work. Nothing changed." }, { status: 409 });
    }
    if (result.kind === "source-unavailable") {
      return NextResponse.json({ok: false, error: "That message is no longer available. Refresh the conversation."}, {status: 404});
    }
    if (result.kind === "invalid-source-scope") {
      return NextResponse.json({ok: false, error: "Tasks from this conversation stay shared with this Session."}, {status: 400});
    }
    if (result.kind === "invalid-owner") {
      return NextResponse.json({ok: false, error: "Choose a current collaborator in this client space."}, {status: 403});
    }
    return NextResponse.json({
      ok: true,
      idempotentReplay: result.idempotentReplay,
      entry: publicEntry(kind, result.row, visibility, session.user.id, ownerUserId, result.ownerLabel),
      boundaries: {
        explicitHumanCapture: true,
        canonicalRecordCommitted: true,
        visibility,
        externalSideEffects: false,
        calendarMutated: false,
        reminderScheduled: false,
        messageSent: false,
        delivered: false,
        published: false,
      },
      nextAction: visibility === "ENGAGEMENT_SHARED"
        ? "Saved in this session and shared client space."
        : visibility === "SESSION_SHARED"
        ? `The ${kind.toLowerCase()} is visible to permitted Session participants. No message, reminder, calendar event, or delivery occurred.`
        : `The ${kind.toLowerCase()} is private to you. No message, reminder, calendar event, or delivery occurred.`,
    });
  } catch (error) {
    console.error("Session work creation failed", error);
    return NextResponse.json({ ok: false, error: "Quipsly could not save this Session work. Nothing external changed." }, { status: 503 });
  }
}
