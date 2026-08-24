import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import {
  sessionConversationAccessWhere,
  sessionMutationAccessWhere,
} from "@/lib/server/session-access";

export const runtime = "nodejs";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
async function requestBody(request: Request) {
  try {
    return record(await request.json());
  } catch {
    return {};
  }
}
function messageId(userId: string, clientRequestId: string) {
  return `session-message-${createHash("sha256").update(`${userId}|${clientRequestId}`).digest("hex").slice(0, 36)}`;
}
const SELECT = {
  id: true,
  roomId: true,
  authorUserId: true,
  clientRequestId: true,
  replyToId: true,
  body: true,
  revision: true,
  editedAt: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { id: true, name: true, primaryEmail: true, image: true } },
  replyTo: {
    select: {
      id: true,
      body: true,
      deletedAt: true,
      author: { select: { name: true, primaryEmail: true } },
    },
  },
} as const;

function serialize(row: any, actorUserId: string) {
  return {
    id: row.id,
    body: row.deletedAt ? "" : row.body,
    revision: row.revision,
    editedAt: row.editedAt?.toISOString?.() ?? row.editedAt ?? null,
    deletedAt: row.deletedAt?.toISOString?.() ?? row.deletedAt ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    author: {
      id: row.author.id,
      label:
        row.author.name || row.author.primaryEmail || "Session participant",
      image: row.author.image || null,
      isCurrentActor: row.authorUserId === actorUserId,
    },
    replyTo: row.replyTo
      ? {
          id: row.replyTo.id,
          body: row.replyTo.deletedAt
            ? "Message removed"
            : row.replyTo.body.slice(0, 240),
          authorLabel:
            row.replyTo.author.name ||
            row.replyTo.author.primaryEmail ||
            "Participant",
        }
      : null,
    canEdit: row.authorUserId === actorUserId && !row.deletedAt,
  };
}

async function authority(request: Request, roomId: string, mutation: boolean) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id)
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          code: "AUTH_REQUIRED",
          error: "Sign in to use the Session conversation.",
        },
        { status: 401 },
      ),
    };
  const prisma = getPrismaClient() as any;
  const room = await prisma.callRoom.findFirst({
    where: mutation
      ? sessionMutationAccessWhere(roomId, session.user)
      : sessionConversationAccessWhere(roomId, session.user),
    select: { id: true, title: true },
  });
  if (!room)
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          code: "NOT_FOUND",
          error: "This Session is not available to this account.",
        },
        { status: 404 },
      ),
    };
  return { ok: true as const, session, prisma, room };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ roomId: string }> },
) {
  const roomId = text((await context.params).roomId, 240);
  const access = await authority(request, roomId, false);
  if (!access.ok) return access.response;
  const [latestMessages, cursor] = await Promise.all([
    access.prisma.sessionConversationMessage.findMany({
      where: { roomId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 200,
      select: SELECT,
    }),
    access.prisma.sessionConversationReadCursor.findUnique({
      where: { roomId_userId: { roomId, userId: access.session.user.id } },
      select: { lastReadAt: true, lastReadMessageId: true },
    }),
  ]);
  const messages = latestMessages.reverse();
  const unreadCount = await access.prisma.sessionConversationMessage.count({
    where: {
      roomId,
      deletedAt: null,
      authorUserId: { not: access.session.user.id },
      ...(cursor?.lastReadAt
        ? {
            OR: [
              { createdAt: { gt: cursor.lastReadAt } },
              ...(cursor.lastReadMessageId
                ? [
                    {
                      createdAt: cursor.lastReadAt,
                      id: { gt: cursor.lastReadMessageId },
                    },
                  ]
                : []),
            ],
          }
        : {}),
    },
  });
  return NextResponse.json({
    ok: true,
    room: access.room,
    messages: messages.map((row: any) =>
      serialize(row, access.session.user.id),
    ),
    unreadCount,
    boundaries: {
      sessionAccessOnly: true,
      privateNotesExcluded: true,
      noExternalDelivery: true,
    },
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ roomId: string }> },
) {
  const roomId = text((await context.params).roomId, 240);
  const input = await requestBody(request);
  const action = text(input.action, 24).toUpperCase() || "SEND";
  const access = await authority(request, roomId, action !== "MARK_READ");
  if (!access.ok) return access.response;
  if (action === "MARK_READ") {
    const lastReadMessageId = text(input.lastReadMessageId, 240) || null;
    if (!lastReadMessageId)
      return NextResponse.json(
        {
          ok: false,
          code: "MESSAGE_NOT_FOUND",
          error: "Refresh the Session conversation.",
        },
        { status: 409 },
      );
    const marked = await access.prisma.$transaction(async (tx: any) => {
      const currentRoom = await tx.callRoom.findFirst({
        where: sessionConversationAccessWhere(roomId, access.session.user),
        select: { id: true },
      });
      if (!currentRoom) return { kind: "access-changed" as const };
      const target = await tx.sessionConversationMessage.findFirst({
        where: { id: lastReadMessageId, roomId },
        select: { id: true, createdAt: true },
      });
      if (!target) return { kind: "missing" as const };
      const current = await tx.sessionConversationReadCursor.findUnique({
        where: { roomId_userId: { roomId, userId: access.session.user.id } },
        select: { lastReadAt: true, lastReadMessageId: true },
      });
      const alreadyLater =
        current &&
        (current.lastReadAt > target.createdAt ||
          (current.lastReadAt.getTime() === target.createdAt.getTime() &&
            String(current.lastReadMessageId || "") >= target.id));
      if (alreadyLater) return { kind: "unchanged" as const };
      await tx.sessionConversationReadCursor.upsert({
        where: { roomId_userId: { roomId, userId: access.session.user.id } },
        create: {
          roomId,
          userId: access.session.user.id,
          lastReadMessageId: target.id,
          lastReadAt: target.createdAt,
        },
        update: {
          lastReadMessageId: target.id,
          lastReadAt: target.createdAt,
        },
      });
      return { kind: "advanced" as const };
    });
    if (marked.kind === "access-changed")
      return NextResponse.json(
        {
          ok: false,
          code: "ACCESS_CHANGED",
          error: "Session access changed before read position was saved.",
        },
        { status: 409 },
      );
    if (marked.kind === "missing")
      return NextResponse.json(
        {
          ok: false,
          code: "MESSAGE_NOT_FOUND",
          error: "Refresh the Session conversation.",
        },
        { status: 409 },
      );
    return NextResponse.json({
      ok: true,
      unreadCount: 0,
      boundaries: {
        monotonic: true,
        noMessageCreated: true,
        noExternalDelivery: true,
      },
    });
  }
  const clientRequestId = text(input.clientRequestId, 80).toLowerCase();
  const body = text(input.body, 6_000);
  const replyToId = text(input.replyToId, 240) || null;
  if (!UUID.test(clientRequestId) || !body)
    return NextResponse.json(
      {
        ok: false,
        code: "INVALID_INPUT",
        error: "Write a message before sending.",
      },
      { status: 400 },
    );
  if (replyToId) {
    const reply = await access.prisma.sessionConversationMessage.findFirst({
      where: { id: replyToId, roomId },
      select: { id: true },
    });
    if (!reply)
      return NextResponse.json(
        {
          ok: false,
          code: "REPLY_NOT_FOUND",
          error: "The message you replied to is no longer in this Session.",
        },
        { status: 409 },
      );
  }
  const id = messageId(access.session.user.id, clientRequestId);
  const existing = await access.prisma.sessionConversationMessage.findUnique({
    where: { id },
    select: SELECT,
  });
  if (existing) {
    if (
      existing.roomId !== roomId ||
      existing.body !== body ||
      existing.replyToId !== replyToId
    )
      return NextResponse.json(
        {
          ok: false,
          code: "REQUEST_ID_CONFLICT",
          error: "This send identity already belongs to different content.",
        },
        { status: 409 },
      );
    return NextResponse.json({
      ok: true,
      idempotentReplay: true,
      message: serialize(existing, access.session.user.id),
    });
  }
  const created = await access.prisma.$transaction(async (tx: any) => {
    const currentRoom = await tx.callRoom.findFirst({
      where: sessionMutationAccessWhere(roomId, access.session.user),
      select: { id: true },
    });
    if (!currentRoom) return null;
    const row = await tx.sessionConversationMessage.create({
      data: {
        id,
        roomId,
        authorUserId: access.session.user.id,
        clientRequestId,
        replyToId,
        body,
      },
      select: SELECT,
    });
    await tx.sessionConversationMessageRevision.create({
      data: {
        messageId: id,
        revision: 1,
        operation: "CREATED",
        actorUserId: access.session.user.id,
        bodyAfter: body,
      },
    });
    return row;
  });
  if (!created)
    return NextResponse.json(
      {
        ok: false,
        code: "ACCESS_CHANGED",
        error: "Session access changed before the message was saved.",
      },
      { status: 409 },
    );
  return NextResponse.json(
    {
      ok: true,
      idempotentReplay: false,
      message: serialize(created, access.session.user.id),
      boundaries: { sessionAccessRechecked: true, noExternalDelivery: true },
    },
    { status: 201 },
  );
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ roomId: string }> },
) {
  const roomId = text((await context.params).roomId, 240);
  const access = await authority(request, roomId, true);
  if (!access.ok) return access.response;
  const input = await requestBody(request);
  const messageIdValue = text(input.messageId, 240);
  const body = text(input.body, 6_000);
  const expectedRevision = Number(input.expectedRevision);
  if (
    !messageIdValue ||
    !body ||
    !Number.isSafeInteger(expectedRevision) ||
    expectedRevision < 1
  )
    return NextResponse.json(
      {
        ok: false,
        code: "INVALID_INPUT",
        error: "Refresh before editing this message.",
      },
      { status: 400 },
    );
  const result = await access.prisma.$transaction(async (tx: any) => {
    const currentRoom = await tx.callRoom.findFirst({
      where: sessionMutationAccessWhere(roomId, access.session.user),
      select: { id: true },
    });
    if (!currentRoom) return { kind: "access-changed" as const };
    const current = await tx.sessionConversationMessage.findFirst({
      where: {
        id: messageIdValue,
        roomId,
        authorUserId: access.session.user.id,
        deletedAt: null,
      },
      select: { id: true, body: true, revision: true },
    });
    if (!current) return { kind: "missing" as const };
    if (current.revision !== expectedRevision)
      return { kind: "stale" as const };
    if (current.body === body) return { kind: "unchanged" as const };
    const revision = current.revision + 1;
    const changed = await tx.sessionConversationMessage.updateMany({
      where: { id: current.id, revision: current.revision },
      data: { body, revision, editedAt: new Date() },
    });
    if (changed.count !== 1) return { kind: "stale" as const };
    await tx.sessionConversationMessageRevision.create({
      data: {
        messageId: current.id,
        revision,
        operation: "EDITED",
        actorUserId: access.session.user.id,
        bodyBefore: current.body,
        bodyAfter: body,
      },
    });
    return {
      kind: "updated" as const,
      row: await tx.sessionConversationMessage.findUnique({
        where: { id: current.id },
        select: SELECT,
      }),
    };
  });
  if (result.kind === "access-changed")
    return NextResponse.json(
      {
        ok: false,
        code: "ACCESS_CHANGED",
        error: "Session access changed before the message was saved.",
      },
      { status: 409 },
    );
  if (result.kind === "missing")
    return NextResponse.json(
      {
        ok: false,
        code: "NOT_FOUND",
        error: "Only the author can edit this Session message.",
      },
      { status: 404 },
    );
  if (result.kind === "stale")
    return NextResponse.json(
      {
        ok: false,
        code: "STALE_REVISION",
        error: "This message changed. Refresh before editing again.",
      },
      { status: 409 },
    );
  if (result.kind === "unchanged")
    return NextResponse.json({ ok: true, unchanged: true });
  return NextResponse.json({
    ok: true,
    message: serialize(result.row, access.session.user.id),
    boundaries: { revisionAppended: true, noExternalDelivery: true },
  });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ roomId: string }> },
) {
  const roomId = text((await context.params).roomId, 240);
  const access = await authority(request, roomId, true);
  if (!access.ok) return access.response;
  const input = await requestBody(request);
  const messageIdValue = text(input.messageId, 240);
  const expectedRevision = Number(input.expectedRevision);
  if (
    !messageIdValue ||
    !Number.isSafeInteger(expectedRevision) ||
    expectedRevision < 1
  )
    return NextResponse.json(
      {
        ok: false,
        code: "INVALID_INPUT",
        error: "Refresh before removing this message.",
      },
      { status: 400 },
    );
  const result = await access.prisma.$transaction(async (tx: any) => {
    const currentRoom = await tx.callRoom.findFirst({
      where: sessionMutationAccessWhere(roomId, access.session.user),
      select: { id: true },
    });
    if (!currentRoom) return { kind: "access-changed" as const };
    const current = await tx.sessionConversationMessage.findFirst({
      where: {
        id: messageIdValue,
        roomId,
        authorUserId: access.session.user.id,
        deletedAt: null,
      },
      select: { id: true, body: true, revision: true },
    });
    if (!current) return { kind: "missing" as const };
    if (current.revision !== expectedRevision)
      return { kind: "stale" as const };
    const revision = current.revision + 1;
    const removedAt = new Date();
    const changed = await tx.sessionConversationMessage.updateMany({
      where: { id: current.id, revision: current.revision, deletedAt: null },
      data: { revision, deletedAt: removedAt, editedAt: removedAt },
    });
    if (changed.count !== 1) return { kind: "stale" as const };
    await tx.sessionConversationMessageRevision.create({
      data: {
        messageId: current.id,
        revision,
        operation: "DELETED",
        actorUserId: access.session.user.id,
        bodyBefore: current.body,
      },
    });
    return {
      kind: "removed" as const,
      row: await tx.sessionConversationMessage.findUnique({
        where: { id: current.id },
        select: SELECT,
      }),
    };
  });
  if (result.kind === "access-changed")
    return NextResponse.json(
      {
        ok: false,
        code: "ACCESS_CHANGED",
        error: "Session access changed before the message was removed.",
      },
      { status: 409 },
    );
  if (result.kind === "missing")
    return NextResponse.json(
      {
        ok: false,
        code: "NOT_FOUND",
        error: "Only the author can remove this Session message.",
      },
      { status: 404 },
    );
  if (result.kind === "stale")
    return NextResponse.json(
      {
        ok: false,
        code: "STALE_REVISION",
        error: "This message changed. Refresh before removing it.",
      },
      { status: 409 },
    );
  return NextResponse.json({
    ok: true,
    message: serialize(result.row, access.session.user.id),
    boundaries: {
      revisionAppended: true,
      tombstoneRetained: true,
      noExternalDelivery: true,
    },
  });
}
