/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

import { DELETE, GET, PATCH, POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({
  getQuipslySessionFromRequest: jest.fn(),
}));

const roomId = "room-coaching-1";
const actor = {
  id: "coach-1",
  primaryEmail: " Coach@Example.Test ",
  isStaff: false,
};
const clientRequestId = "18c70a70-521a-4d3f-9ec0-657ee72337d4";

function context() {
  return { params: Promise.resolve({ roomId }) };
}

function request(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  body?: Record<string, unknown>,
) {
  return new Request(`http://localhost/api/sessions/${roomId}/conversation`, {
    method,
    ...(body
      ? {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
}

function row(
  overrides: Partial<{
    id: string;
    roomId: string;
    authorUserId: string;
    clientRequestId: string;
    replyToId: string | null;
    body: string;
    revision: number;
    editedAt: Date | null;
    deletedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }> = {},
) {
  return {
    id: "message-1",
    roomId,
    authorUserId: actor.id,
    clientRequestId,
    replyToId: null,
    body: "Welcome to the Session.",
    revision: 1,
    editedAt: null,
    deletedAt: null,
    createdAt: new Date("2026-08-24T19:00:00.000Z"),
    updatedAt: new Date("2026-08-24T19:00:00.000Z"),
    author: {
      id: actor.id,
      name: "Coach",
      primaryEmail: actor.primaryEmail,
      image: null,
    },
    replyTo: null,
    ...overrides,
  };
}

function prismaBase() {
  const prisma: any = {
    callRoom: {
      findFirst: jest.fn().mockResolvedValue({ id: roomId, title: "Session" }),
    },
    sessionConversationMessage: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    sessionConversationMessageRevision: { create: jest.fn() },
    sessionConversationReadCursor: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn(),
    },
  };
  prisma.$transaction = jest.fn((callback: (tx: any) => Promise<unknown>) =>
    callback(prisma),
  );
  return prisma;
}

describe("Session conversation route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .mocked(getQuipslySessionFromRequest)
      .mockResolvedValue({ user: actor } as any);
  });

  it("rejects signed-out reads before querying Session data", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null as any);
    const prisma = prismaBase();
    jest.mocked(getPrismaClient).mockReturnValue(prisma);

    const response = await GET(request("GET"), context());

    expect(response.status).toBe(401);
    expect(prisma.callRoom.findFirst).not.toHaveBeenCalled();
    expect(prisma.sessionConversationMessage.findMany).not.toHaveBeenCalled();
  });

  it("does not expose messages when the actor cannot access the conversation", async () => {
    const prisma = prismaBase();
    prisma.callRoom.findFirst.mockResolvedValue(null);
    jest.mocked(getPrismaClient).mockReturnValue(prisma);

    const response = await GET(request("GET"), context());
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(prisma.sessionConversationMessage.findMany).not.toHaveBeenCalled();
    expect(prisma.callRoom.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: roomId,
          OR: expect.arrayContaining([
            {
              project: {
                accessGrants: {
                  some: {
                    email: "coach@example.test",
                    status: "ACTIVE",
                    role: { in: ["OWNER", "EDITOR"] },
                  },
                },
              },
            },
          ]),
        }),
      }),
    );
  });

  it("returns the latest page in chronological display order", async () => {
    const prisma = prismaBase();
    prisma.sessionConversationMessage.findMany.mockResolvedValue([
      row({ id: "newer", createdAt: new Date("2026-08-24T20:00:00.000Z") }),
      row({ id: "older", createdAt: new Date("2026-08-24T19:00:00.000Z") }),
    ]);
    prisma.sessionConversationMessage.count.mockResolvedValue(2);
    jest.mocked(getPrismaClient).mockReturnValue(prisma);

    const response = await GET(request("GET"), context());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(
      payload.messages.map((message: { id: string }) => message.id),
    ).toEqual(["older", "newer"]);
    expect(payload).toMatchObject({
      unreadCount: 2,
      capabilities: { canWrite: true, canEditOwnMessages: true },
      boundaries: {
        sessionAccessOnly: true,
        privateNotesExcluded: true,
        noExternalDelivery: true,
      },
    });
    expect(prisma.sessionConversationMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 200,
      }),
    );
  });

  it("projects a conventional read-only thread when the actor cannot mutate the Session", async () => {
    const prisma = prismaBase();
    prisma.callRoom.findFirst
      .mockResolvedValueOnce({ id: roomId, title: "Session" })
      .mockResolvedValueOnce(null);
    jest.mocked(getPrismaClient).mockReturnValue(prisma);

    const response = await GET(request("GET"), context());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.capabilities).toEqual({
      canWrite: false,
      canEditOwnMessages: false,
    });
  });

  it("counts unread messages after the exact stable cursor boundary", async () => {
    const prisma = prismaBase();
    const lastReadAt = new Date("2026-08-24T19:00:00.000Z");
    prisma.sessionConversationReadCursor.findUnique.mockResolvedValue({
      lastReadAt,
      lastReadMessageId: "message-b",
    });
    jest.mocked(getPrismaClient).mockReturnValue(prisma);

    const response = await GET(request("GET"), context());

    expect(response.status).toBe(200);
    expect(prisma.sessionConversationMessage.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        OR: [
          { createdAt: { gt: lastReadAt } },
          { createdAt: lastReadAt, id: { gt: "message-b" } },
        ],
      }),
    });
  });

  it("creates a retry-safe message and its first immutable revision", async () => {
    const prisma = prismaBase();
    const created = row();
    prisma.sessionConversationMessage.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(created);
    prisma.sessionConversationMessage.create.mockResolvedValue(created);
    jest.mocked(getPrismaClient).mockReturnValue(prisma);

    const response = await POST(
      request("POST", {
        clientRequestId,
        body: created.body,
      }),
      context(),
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload).toMatchObject({
      ok: true,
      idempotentReplay: false,
      message: { body: created.body },
      boundaries: { sessionAccessRechecked: true, noExternalDelivery: true },
    });
    expect(prisma.callRoom.findFirst).toHaveBeenCalledTimes(2);
    expect(prisma.sessionConversationMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          roomId,
          authorUserId: actor.id,
          clientRequestId,
          body: created.body,
        }),
      }),
    );
    expect(
      prisma.sessionConversationMessageRevision.create,
    ).toHaveBeenCalledWith({
      data: expect.objectContaining({
        revision: 1,
        operation: "CREATED",
        actorUserId: actor.id,
        bodyAfter: created.body,
      }),
    });
  });

  it("replays an identical send without writing a duplicate", async () => {
    const prisma = prismaBase();
    prisma.sessionConversationMessage.findUnique.mockResolvedValue(row());
    jest.mocked(getPrismaClient).mockReturnValue(prisma);

    const response = await POST(
      request("POST", {
        clientRequestId,
        body: "Welcome to the Session.",
      }),
      context(),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ ok: true, idempotentReplay: true });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.sessionConversationMessage.create).not.toHaveBeenCalled();
  });

  it("recovers an overlapping identical retry after the deterministic message wins the unique race", async () => {
    const prisma = prismaBase();
    const created = row();
    prisma.sessionConversationMessage.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(created);
    prisma.$transaction.mockRejectedValueOnce(
      Object.assign(new Error("Unique constraint"), { code: "P2002" }),
    );
    jest.mocked(getPrismaClient).mockReturnValue(prisma);

    const response = await POST(
      request("POST", {
        clientRequestId,
        body: created.body,
      }),
      context(),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      idempotentReplay: true,
      message: { id: created.id, body: created.body },
      boundaries: {
        concurrentRetryRecovered: true,
        noExternalDelivery: true,
      },
    });
  });

  it("rejects oversized message bodies instead of silently truncating them", async () => {
    const prisma = prismaBase();
    jest.mocked(getPrismaClient).mockReturnValue(prisma);

    const response = await POST(
      request("POST", {
        clientRequestId,
        body: "a".repeat(6_001),
      }),
      context(),
    );

    expect(response.status).toBe(400);
    expect(prisma.sessionConversationMessage.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a reply target from another Session", async () => {
    const prisma = prismaBase();
    prisma.sessionConversationMessage.findFirst.mockResolvedValue(null);
    jest.mocked(getPrismaClient).mockReturnValue(prisma);

    const response = await POST(
      request("POST", {
        clientRequestId,
        body: "Reply",
        replyToId: "message-from-another-room",
      }),
      context(),
    );
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload).toMatchObject({ ok: false, code: "REPLY_NOT_FOUND" });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("allows read-only participants to advance their own read cursor", async () => {
    const prisma = prismaBase();
    const createdAt = new Date("2026-08-24T19:00:00.000Z");
    prisma.sessionConversationMessage.findFirst.mockResolvedValue({
      id: "message-1",
      createdAt,
    });
    jest.mocked(getPrismaClient).mockReturnValue(prisma);

    const response = await POST(
      request("POST", {
        action: "MARK_READ",
        lastReadMessageId: "message-1",
      }),
      context(),
    );

    expect(response.status).toBe(200);
    expect(prisma.sessionConversationReadCursor.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { roomId_userId: { roomId, userId: actor.id } },
        create: expect.objectContaining({ lastReadAt: createdAt }),
        update: expect.objectContaining({ lastReadAt: createdAt }),
      }),
    );
    expect(prisma.callRoom.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            {
              participants: {
                some: { userId: actor.id, accessStatus: "ACTIVE" },
              },
            },
          ]),
        }),
      }),
    );
  });

  it("never moves a read cursor backward when an older tab reports later", async () => {
    const prisma = prismaBase();
    prisma.sessionConversationMessage.findFirst.mockResolvedValue({
      id: "message-1",
      createdAt: new Date("2026-08-24T19:00:00.000Z"),
    });
    prisma.sessionConversationReadCursor.findUnique.mockResolvedValue({
      lastReadAt: new Date("2026-08-24T20:00:00.000Z"),
      lastReadMessageId: "message-2",
    });
    jest.mocked(getPrismaClient).mockReturnValue(prisma);

    const response = await POST(
      request("POST", {
        action: "MARK_READ",
        lastReadMessageId: "message-1",
      }),
      context(),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ boundaries: { monotonic: true } });
    expect(prisma.sessionConversationReadCursor.upsert).not.toHaveBeenCalled();
  });

  it("rechecks edit authority inside the transaction", async () => {
    const prisma = prismaBase();
    prisma.callRoom.findFirst
      .mockResolvedValueOnce({ id: roomId, title: "Session" })
      .mockResolvedValueOnce(null);
    jest.mocked(getPrismaClient).mockReturnValue(prisma);

    const response = await PATCH(
      request("PATCH", {
        messageId: "message-1",
        body: "Edited",
        expectedRevision: 1,
      }),
      context(),
    );
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload).toMatchObject({ ok: false, code: "ACCESS_CHANGED" });
    expect(prisma.sessionConversationMessage.updateMany).not.toHaveBeenCalled();
  });

  it("removes only the author's expected revision and retains an audit tombstone", async () => {
    const prisma = prismaBase();
    const current = row();
    const removed = row({
      revision: 2,
      deletedAt: new Date("2026-08-24T20:00:00.000Z"),
      editedAt: new Date("2026-08-24T20:00:00.000Z"),
    });
    prisma.sessionConversationMessage.findFirst.mockResolvedValue(current);
    prisma.sessionConversationMessage.updateMany.mockResolvedValue({
      count: 1,
    });
    prisma.sessionConversationMessage.findUnique.mockResolvedValue(removed);
    jest.mocked(getPrismaClient).mockReturnValue(prisma);

    const response = await DELETE(
      request("DELETE", {
        messageId: current.id,
        expectedRevision: 1,
      }),
      context(),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      message: { body: "", deletedAt: "2026-08-24T20:00:00.000Z" },
      boundaries: {
        revisionAppended: true,
        tombstoneRetained: true,
        noExternalDelivery: true,
      },
    });
    expect(
      prisma.sessionConversationMessageRevision.create,
    ).toHaveBeenCalledWith({
      data: expect.objectContaining({
        revision: 2,
        operation: "DELETED",
        actorUserId: actor.id,
        bodyBefore: current.body,
      }),
    });
  });
});
