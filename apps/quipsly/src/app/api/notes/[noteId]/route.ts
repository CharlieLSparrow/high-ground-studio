import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { captureRoomAccessWhere } from "@/lib/server/mobile-capture-room-join-diagnostics";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

export const runtime = "nodejs";

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

export async function PATCH(request: Request, context: { params: Promise<{ noteId: string }> }) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, code: "AUTH_REQUIRED", error: "Sign in before editing a private note." }, { status: 401 });
  }

  const { noteId: rawNoteId } = await context.params;
  const noteId = text(rawNoteId, 200);
  const input = await body(request);
  const title = text(input.title, 500);
  const noteBody = text(input.body, 20_000, true);
  const expectedUpdatedAt = new Date(text(input.expectedUpdatedAt, 80));
  if (!noteId || !noteBody || !Number.isFinite(expectedUpdatedAt.getTime())) {
    return NextResponse.json({ ok: false, code: "INVALID_INPUT", error: "Keep some note text and refresh before saving an invalid or stale draft." }, { status: 400 });
  }

  const prisma = getPrismaClient() as any;
  const note = await prisma.coachingNote.findFirst({
    where: { id: noteId, authorUserId: session.user.id, kind: "SESSION_NOTE" },
    select: { id: true, roomId: true, title: true, body: true, sourceJson: true, updatedAt: true },
  });
  if (!note?.roomId) {
    return NextResponse.json({ ok: false, code: "NOT_FOUND", error: "This actor-owned Session note is no longer available." }, { status: 404 });
  }
  const room = await prisma.callRoom.findFirst({
    where: captureRoomAccessWhere(note.roomId, session.user),
    select: { id: true },
  });
  if (!room) {
    return NextResponse.json({ ok: false, code: "NOT_FOUND", error: "You no longer have access to this note's Session." }, { status: 404 });
  }
  if (note.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
    return NextResponse.json({
      ok: false,
      code: "CONFLICT",
      error: "This note changed elsewhere. Nest kept the newer version; refresh before applying your draft.",
      current: { title: note.title, body: note.body, updatedAt: note.updatedAt.toISOString() },
    }, { status: 409 });
  }

  const receiptId = randomUUID();
  const now = new Date();
  const receipt = {
    id: receiptId,
    kind: "quipsly-session-note-edit-v1",
    changedAt: now.toISOString(),
    changedByUserId: session.user.id,
    previousContentRetainedInReceipt: true,
    externalSideEffects: false,
  };
  const result = await prisma.$transaction(async (tx: any) => {
    const stillAccessible = await tx.callRoom.findFirst({
      where: captureRoomAccessWhere(note.roomId, session.user),
      select: { id: true },
    });
    if (!stillAccessible) return { kind: "not-found" as const };
    const updated = await tx.coachingNote.updateMany({
      where: { id: noteId, roomId: note.roomId, authorUserId: session.user.id, kind: "SESSION_NOTE", updatedAt: expectedUpdatedAt },
      data: {
        title: title || null,
        body: noteBody,
        sourceJson: {
          ...record(note.sourceJson),
          lastEditReceipt: {
            ...receipt,
            previous: { title: note.title, body: note.body },
          },
        },
      },
    });
    if (updated.count !== 1) return { kind: "conflict" as const };
    const saved = await tx.coachingNote.findUnique({
      where: { id: noteId },
      select: {
        id: true, title: true, body: true, updatedAt: true,
        tagLinks: { orderBy: { createdAt: "asc" }, select: { tag: { select: { id: true, label: true, slug: true } } } },
      },
    });
    return { kind: "saved" as const, saved };
  }, { isolationLevel: "Serializable" });

  if (result.kind === "not-found") {
    return NextResponse.json({ ok: false, code: "NOT_FOUND", error: "You no longer have access to this note's Session." }, { status: 404 });
  }
  if (result.kind === "conflict" || !result.saved) {
    return NextResponse.json({ ok: false, code: "CONFLICT", error: "This note changed elsewhere. Refresh before applying your draft." }, { status: 409 });
  }
  return NextResponse.json({
    ok: true,
    note: {
      ...result.saved,
      updatedAt: result.saved.updatedAt.toISOString(),
      tags: result.saved.tagLinks.map((link: any) => link.tag),
      tagLinks: undefined,
    },
    receiptId,
    boundaries: { actorOwned: true, sessionAccessRechecked: true, externalSideEffects: false },
  });
}
