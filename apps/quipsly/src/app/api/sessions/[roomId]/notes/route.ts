import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import {
  EDITABLE_SESSION_NOTE_KINDS,
  SESSION_NOTE_VISIBILITIES,
  type EditableSessionNoteKind,
  type SessionNoteVisibility,
} from "@/app/(app)/sessions/[roomId]/session-notes-model";
import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { sessionAccessWhere } from "@/lib/server/session-access";
import { canUseProjectTeamNotes } from "@/lib/server/session-note-access";

export const runtime = "nodejs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SESSION_NOTE_SCHEMA = "quipsly-session-note-v1";

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown, max: number, preserveLineBreaks = false) {
  if (typeof value !== "string") return "";
  const normalized = preserveLineBreaks ? value.trim() : value.replace(/\s+/g, " ").trim();
  return normalized.slice(0, max);
}

async function body(request: Request) {
  try { return record(await request.json()); } catch { return {}; }
}

function noteId(actorUserId: string, clientRequestId: string) {
  const digest = createHash("sha256")
    .update(`${actorUserId}|${clientRequestId}`, "utf8")
    .digest("hex")
    .slice(0, 32);
  return `session-note-${digest}`;
}

function editableKind(value: unknown): EditableSessionNoteKind | null {
  return EDITABLE_SESSION_NOTE_KINDS.includes(value as EditableSessionNoteKind)
    ? value as EditableSessionNoteKind
    : null;
}

function visibility(value: unknown): SessionNoteVisibility | null {
  return SESSION_NOTE_VISIBILITIES.includes(value as SessionNoteVisibility)
    ? value as SessionNoteVisibility
    : null;
}

function sourceMatches(sourceJson: unknown, input: {
  actorUserId: string;
  roomId: string;
  clientRequestId: string;
  title: string;
  body: string;
  kind: EditableSessionNoteKind;
  visibility: SessionNoteVisibility;
}) {
  const source = record(sourceJson);
  return source.schema === SESSION_NOTE_SCHEMA
    && source.actorUserId === input.actorUserId
    && source.roomId === input.roomId
    && source.clientRequestId === input.clientRequestId
    && source.initialTitle === input.title
    && source.initialBody === input.body
    && source.initialKind === input.kind
    && source.initialVisibility === input.visibility;
}

function serializedNote(row: any, actorUserId: string) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    kind: String(row.kind),
    visibility: String(row.visibility),
    author: {
      id: row.authorUserId,
      label: row.authorUser?.name || row.authorUser?.primaryEmail || "Note author",
      isCurrentActor: row.authorUserId === actorUserId,
    },
    originLabel: "Nest Session note",
    canEdit: row.authorUserId === actorUserId,
    revisionCount: row._count?.revisions ?? 0,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    tags: (row.tagLinks || []).map((link: any) => link.tag),
  };
}

const NOTE_SELECT = {
  id: true,
  roomId: true,
  authorUserId: true,
  title: true,
  body: true,
  kind: true,
  visibility: true,
  sourceJson: true,
  createdAt: true,
  updatedAt: true,
  authorUser: { select: { name: true, primaryEmail: true } },
  tagLinks: {
    orderBy: { createdAt: "asc" as const },
    select: { tag: { select: { id: true, label: true, slug: true } } },
  },
  _count: { select: { revisions: true } },
};

export async function POST(request: Request, context: { params: Promise<{ roomId: string }> }) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, code: "AUTH_REQUIRED", error: "Sign in before adding a Session note." },
      { status: 401 },
    );
  }

  const { roomId: rawRoomId } = await context.params;
  const roomId = text(rawRoomId, 240);
  const input = await body(request);
  const clientRequestId = text(input.clientRequestId, 80).toLowerCase();
  const title = text(input.title, 500);
  const noteBody = text(input.body, 20_000, true);
  const kind = editableKind(input.kind);
  const noteVisibility = visibility(input.visibility);
  if (!roomId || !UUID_PATTERN.test(clientRequestId) || !noteBody || !kind || !noteVisibility) {
    return NextResponse.json(
      { ok: false, code: "INVALID_INPUT", error: "A stable request, note text, note type, and visibility are required." },
      { status: 400 },
    );
  }

  const prisma = getPrismaClient() as any;
  const actorEmail = text(session.user.primaryEmail || session.user.email, 320).toLowerCase();
  const room = await prisma.callRoom.findFirst({
    where: sessionAccessWhere(roomId, session.user),
    select: {
      id: true,
      bookingId: true,
      project: {
        select: {
          accessGrants: actorEmail ? {
            where: { email: actorEmail, status: "ACTIVE" },
            take: 1,
            select: { role: true },
          } : undefined,
        },
      },
    },
  });
  if (!room) {
    return NextResponse.json(
      { ok: false, code: "NOT_FOUND", error: "This Session is not available to this account." },
      { status: 404 },
    );
  }

  const canUseProjectTeam = canUseProjectTeamNotes(
    room.project?.accessGrants?.[0]?.role,
    session.user.isStaff === true,
  );
  if ((noteVisibility === "PROJECT_TEAM" || kind === "PRODUCTION") && !canUseProjectTeam) {
    return NextResponse.json(
      { ok: false, code: "PROJECT_ROLE_REQUIRED", error: "Only a Nest owner or editor can create production-team notes." },
      { status: 403 },
    );
  }

  const id = noteId(session.user.id, clientRequestId);
  const sourceJson = {
    schema: SESSION_NOTE_SCHEMA,
    clientRequestId,
    actorUserId: session.user.id,
    roomId: room.id,
    origin: "nest-session-notes",
    initialTitle: title,
    initialBody: noteBody,
    initialKind: kind,
    initialVisibility: noteVisibility,
    aiGenerated: false,
    externalSideEffects: false,
  };

  const existing = await prisma.coachingNote.findUnique({ where: { id }, select: NOTE_SELECT });
  if (existing) {
    if (!sourceMatches(existing.sourceJson, {
      actorUserId: session.user.id,
      roomId: room.id,
      clientRequestId,
      title,
      body: noteBody,
      kind,
      visibility: noteVisibility,
    })) {
      return NextResponse.json(
        { ok: false, code: "REQUEST_ID_CONFLICT", error: "This request identity already belongs to different note content." },
        { status: 409 },
      );
    }
    return NextResponse.json({
      ok: true,
      idempotentReplay: true,
      note: serializedNote(existing, session.user.id),
      boundaries: { canonicalIdentity: true, explicitVisibility: true, externalSideEffects: false },
    });
  }

  try {
    const result = await prisma.$transaction(async (tx: any) => {
      const currentRoom = await tx.callRoom.findFirst({
        where: sessionAccessWhere(room.id, session.user),
        select: {
          id: true,
          bookingId: true,
          project: {
            select: {
              accessGrants: actorEmail ? {
                where: { email: actorEmail, status: "ACTIVE" },
                take: 1,
                select: { role: true },
              } : undefined,
            },
          },
        },
      });
      if (!currentRoom) return { kind: "not-found" as const };
      const stillCanUseProjectTeam = canUseProjectTeamNotes(
        currentRoom.project?.accessGrants?.[0]?.role,
        session.user.isStaff === true,
      );
      if ((noteVisibility === "PROJECT_TEAM" || kind === "PRODUCTION") && !stillCanUseProjectTeam) {
        return { kind: "project-role-required" as const };
      }
      const created = await tx.coachingNote.create({
        data: {
          id,
          roomId: currentRoom.id,
          bookingId: currentRoom.bookingId || null,
          authorUserId: session.user.id,
          kind,
          visibility: noteVisibility,
          title: title || null,
          body: noteBody,
          sourceJson,
          revisions: {
            create: {
              id: randomUUID(),
              revision: 1,
              operation: "created",
              actorUserId: session.user.id,
              snapshotJson: {
                title: title || null,
                body: noteBody,
                kind,
                visibility: noteVisibility,
                sourceJson,
              },
            },
          },
        },
        select: NOTE_SELECT,
      });
      return { kind: "created" as const, created };
    }, { isolationLevel: "Serializable" });
    if (result.kind === "not-found") {
      return NextResponse.json(
        { ok: false, code: "NOT_FOUND", error: "This Session is no longer available to this account." },
        { status: 404 },
      );
    }
    if (result.kind === "project-role-required") {
      return NextResponse.json(
        { ok: false, code: "PROJECT_ROLE_REQUIRED", error: "Only a Nest owner or editor can create production-team notes." },
        { status: 403 },
      );
    }
    return NextResponse.json({
      ok: true,
      idempotentReplay: false,
      note: serializedNote(result.created, session.user.id),
      boundaries: {
        canonicalIdentity: true,
        sessionAccessRechecked: true,
        explicitVisibility: true,
        externalSideEffects: false,
      },
    });
  } catch (error) {
    if (record(error).code !== "P2002") throw error;
    const raced = await prisma.coachingNote.findUnique({ where: { id }, select: NOTE_SELECT });
    if (!raced || !sourceMatches(raced.sourceJson, {
      actorUserId: session.user.id,
      roomId: room.id,
      clientRequestId,
      title,
      body: noteBody,
      kind,
      visibility: noteVisibility,
    })) {
      return NextResponse.json(
        { ok: false, code: "REQUEST_ID_CONFLICT", error: "A concurrent request used this identity for different note content." },
        { status: 409 },
      );
    }
    return NextResponse.json({
      ok: true,
      idempotentReplay: true,
      note: serializedNote(raced, session.user.id),
      boundaries: { canonicalIdentity: true, explicitVisibility: true, externalSideEffects: false },
    });
  }
}
