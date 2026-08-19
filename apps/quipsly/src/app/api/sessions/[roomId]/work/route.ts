import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { sessionMutationAccessWhere } from "@/lib/server/session-access";

export const runtime = "nodejs";

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

function publicEntry(kind: "TASK" | "GOAL", row: any, visibility: "AUTHOR_PRIVATE" | "SESSION_SHARED") {
  return {
    id: row.id,
    kind,
    title: row.title,
    body: kind === "TASK" ? row.detail : row.description,
    status: String(row.status),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    tags: [],
    visibility,
    ownedByCurrentActor: true,
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
  const visibility = text(body.visibility, 40).toUpperCase() as "AUTHOR_PRIVATE" | "SESSION_SHARED";
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
  if (!(["AUTHOR_PRIVATE", "SESSION_SHARED"] as const).includes(visibility)) {
    return NextResponse.json({ ok: false, error: "Choose Only me or Everyone in this Session." }, { status: 400 });
  }
  if (targetAt === "invalid") {
    return NextResponse.json({ ok: false, error: "Review the optional target date before saving." }, { status: 400 });
  }

  const prisma = getPrismaClient() as any;
  const id = `session-${kind.toLowerCase()}-${clientRequestId}`;
  const requestFingerprint = createHash("sha256").update(JSON.stringify({
    kind,
    title,
    detail,
    visibility,
    targetAt: targetAt?.toISOString() || null,
  })).digest("hex");

  try {
    const result = await prisma.$transaction(async (tx: any) => {
      const room = await tx.callRoom.findFirst({
        where: sessionMutationAccessWhere(roomId, session.user),
        select: { id: true, projectId: true },
      });
      if (!room) return { kind: "unavailable" as const };
      const sourceJson = {
        schema: SCHEMA,
        surface: "web-session",
        origin: "explicit-human-capture",
        clientRequestId,
        requestFingerprint,
        roomId: room.id,
        actorUserId: session.user.id,
        visibility,
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
        return { kind: "saved" as const, row: existing, idempotentReplay: true };
      }

      const row = kind === "TASK"
        ? await tx.actionItem.create({
            data: {
              id,
              roomId: room.id,
              projectId: room.projectId,
              assignedUserId: session.user.id,
              title,
              detail: detail || null,
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
              ownerUserId: session.user.id,
              title,
              description: detail || null,
              status: "ACTIVE",
              targetAt,
              sourceJson,
            },
          });
      return { kind: "saved" as const, row, idempotentReplay: false };
    });

    if (result.kind === "unavailable") {
      return NextResponse.json({ ok: false, error: "This Session is unavailable or read-only for this account." }, { status: 404 });
    }
    if (result.kind === "conflict") {
      return NextResponse.json({ ok: false, error: "That retry identity belongs to different Session work. Nothing changed." }, { status: 409 });
    }
    return NextResponse.json({
      ok: true,
      idempotentReplay: result.idempotentReplay,
      entry: publicEntry(kind, result.row, visibility),
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
      nextAction: visibility === "SESSION_SHARED"
        ? `The ${kind.toLowerCase()} is visible to permitted Session participants. No message, reminder, calendar event, or delivery occurred.`
        : `The ${kind.toLowerCase()} is private to you. No message, reminder, calendar event, or delivery occurred.`,
    });
  } catch (error) {
    console.error("Session work creation failed", error);
    return NextResponse.json({ ok: false, error: "Quipsly could not save this Session work. Nothing external changed." }, { status: 503 });
  }
}
