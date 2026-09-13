/** @jest-environment node */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { GET, POST, PATCH, DELETE } from "./session-conversation";

jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));
const enabled = process.env.QUIPSLY_LOCAL_DB_SMOKE === "1";
if (enabled) {
  const url = new URL(process.env.QUIPSLY_LOCAL_DATABASE_URL || "invalid:");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("Conversation tests require an explicit local database.");
  process.env.DATABASE_URL = url.toString();
}

(enabled ? describe : describe.skip)("Canonical session conversation persistence", () => {
  const prisma = getPrismaClient();
  const nonce = randomUUID();
  let users: { id: string; primaryEmail: string | null }[] = [];
  let roomId = "";
  let otherRoomId = "";
  function as(index: number) {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user: { ...users[index], isStaff: false } } as any);
  }
  function context() { return { params: Promise.resolve({ roomId }) }; }
  function request(method: string, body?: object, query = "") {
    return new Request(`http://localhost/api/sessions/${roomId}/conversation${query}`, { method, ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}) });
  }
  beforeAll(async () => {
    users = await Promise.all(["coach", "client", "outsider"].map(name => prisma.user.create({ data: { name, primaryEmail: `conversation-${name}-${nonce}@example.test` } })));
    roomId = (await prisma.callRoom.create({ data: { title: "Conversation integration", createdByUserId: users[0].id } })).id;
    otherRoomId = (await prisma.callRoom.create({ data: { title: "Private other conversation", createdByUserId: users[2].id } })).id;
    await prisma.callParticipant.create({ data: { roomId, userId: users[1].id, role: "CLIENT", displayName: "Client" } });
  });
  afterAll(async () => {
    try {
      await prisma.callRoom.deleteMany({ where: { id: { in: [roomId, otherRoomId].filter(Boolean) } } });
      await prisma.user.deleteMany({ where: { id: { in: users.map(user => user.id) } } });
    } finally { await prisma.$disconnect(); }
  });

  it("shares native/web messages, replies, corrections and tombstones in a projectless session", async () => {
    as(0);
    const input = { body: "Meet here from either device", clientRequestId: randomUUID() };
    const sent = await POST(request("POST", input), context());
    expect(sent.status).toBe(201);
    const first = (await sent.json()).message;
    const retry = await POST(request("POST", input), context());
    expect((await retry.json()).message.id).toBe(first.id);
    as(1);
    const read = await GET(request("GET"), context());
    expect(await read.json()).toMatchObject({ capabilities: { canWrite: true }, messages: [expect.objectContaining({ id: first.id, author: expect.objectContaining({ id: users[0].id }), canEdit: false })] });
    const denied = await PATCH(request("PATCH", { messageId: first.id, expectedRevision: 1, body: "Not mine" }), context());
    expect(denied.status).toBe(404);
    const reply = await POST(request("POST", { body: "Reply from browser", replyToId: first.id, clientRequestId: randomUUID() }), context());
    expect((await reply.json()).message.replyTo).toMatchObject({ id: first.id, body: input.body });
    as(0);
    const edit = await PATCH(request("PATCH", { messageId: first.id, expectedRevision: 1, body: "Corrected on phone" }), context());
    expect((await edit.json()).message).toMatchObject({ revision: 2, body: "Corrected on phone" });
    expect((await PATCH(request("PATCH", { messageId: first.id, expectedRevision: 1, body: "Stale" }), context())).status).toBe(409);
    const removed = await DELETE(request("DELETE", { messageId: first.id, expectedRevision: 2 }), context());
    expect((await removed.json()).message).toMatchObject({ body: "", revision: 3, deletedAt: expect.any(String) });
    expect(await prisma.sessionConversationMessage.findUnique({ where: { id: first.id } })).toMatchObject({ body: "Corrected on phone" });
    expect(await prisma.sessionConversationMessageRevision.count({ where: { messageId: first.id } })).toBe(3);
    as(1);
    const after = await GET(request("GET"), context());
    expect((await after.json()).messages.find((m: any) => m.replyTo)?.replyTo.body).toBe("Message removed");
    as(2);
    expect((await GET(request("GET"), context())).status).toBe(404);
    expect((await POST(request("POST", { body: "Intrusion", clientRequestId: randomUUID() }), context())).status).toBe(404);
  });

  it("shares unread state across devices without treating activity checks as reading", async () => {
    as(0);
    const first = (await (await POST(request("POST", {body: "First unread thought", clientRequestId: randomUUID()}), context())).json()).message;
    const second = (await (await POST(request("POST", {body: "Second unread thought", clientRequestId: randomUUID()}), context())).json()).message;
    as(1);
    const activity = await GET(request("GET", undefined, "?view=activity"), context());
    const before = await activity.json();
    expect(before.unreadCount).toBeGreaterThanOrEqual(2);
    expect(before.messages).toBeUndefined();
    const seenFirst = await POST(request("POST", {action: "MARK_READ", lastReadMessageId: first.id}), context());
    expect((await seenFirst.json()).unreadCount).toBe(1);
    expect((await (await GET(request("GET", undefined, "?view=activity"), context())).json()).unreadCount).toBe(1);
    await POST(request("POST", {action: "MARK_READ", lastReadMessageId: second.id}), context());
    expect((await (await GET(request("GET", undefined, "?view=activity"), context())).json()).unreadCount).toBe(0);
    await Promise.all([first, second, first].map(message => POST(request("POST", {action: "MARK_READ", lastReadMessageId: message.id}), context())));
    expect(await prisma.sessionConversationReadCursor.findUnique({where: {roomId_userId: {roomId, userId: users[1].id}}})).toMatchObject({lastReadMessageId: second.id});
    as(2);
    expect((await GET(request("GET", undefined, "?view=activity"), context())).status).toBe(404);
  });

  it("paginates stable same-time IDs and never leaks another room through anchors or cursors", async () => {
    const stamp = new Date("2026-01-01T00:00:00Z");
    await prisma.sessionConversationMessage.createMany({ data: ["a", "b", "c"].map(suffix => ({ id: `${nonce}-${suffix}`, roomId, clientRequestId: `${nonce}-${suffix}`, body: suffix, createdAt: stamp, authorNameSnapshot: "Former participant", gifUrl: "https://example.test/retained.gif" })) });
    const foreign = await prisma.sessionConversationMessage.create({ data: { id: `${nonce}-foreign`, roomId: otherRoomId, clientRequestId: `${nonce}-foreign`, body: "Private" } });
    as(1);
    const first = await GET(request("GET", undefined, "?limit=2"), context());
    const page = await first.json();
    expect(page.messages).toHaveLength(2);
    expect(page.nextCursor).toEqual(expect.any(String));
    const older = await GET(request("GET", undefined, `?limit=2&cursor=${nonce}-c`), context());
    const history = await older.json();
    expect(history.messages.map((m: any) => m.id)).toEqual([`${nonce}-a`, `${nonce}-b`]);
    expect(history.messages[0]).toMatchObject({ author: { id: null, label: "Former participant", isCurrentActor: false }, canEdit: false, gifUrl: "https://example.test/retained.gif" });
    const anchor = await GET(request("GET", undefined, `?limit=1&message=${foreign.id}`), context());
    expect(JSON.stringify(await anchor.json())).not.toContain("Private");
    expect((await GET(request("GET", undefined, `?cursor=${foreign.id}`), context())).status).toBe(400);
    expect((await POST(request("POST", { body: "Cross-room reply", replyToId: foreign.id, clientRequestId: randomUUID() }), context())).status).not.toBe(200);
  });

  it("backfills browser history without changing identities, losing GIFs, or crossing project boundaries", async () => {
    const workspace = await prisma.studioWorkspace.create({ data: { slug: `conversation-${nonce}`, name: "Conversation migration QA" } });
    const projects = await Promise.all(["matched", "other"].map(suffix => prisma.studioProject.create({ data: { workspaceId: workspace.id, slug: `conversation-${nonce}-${suffix}`, name: suffix } })));
    try {
      await prisma.callRoom.update({ where: { id: roomId }, data: { projectId: projects[0].id } });
      const threads = await Promise.all(projects.map(project => prisma.studioNestChatThread.create({ data: { projectId: project.id, key: `session:${roomId}`, title: "Session" } })));
      const stamp = new Date("2025-08-04T12:00:00Z");
      const known = await prisma.studioNestChatMessage.create({ data: { projectId: projects[0].id, threadId: threads[0].id, body: "Browser history", authorEmail: users[0].primaryEmail, authorName: "Original name", createdAt: stamp } });
      const unknown = await prisma.studioNestChatMessage.create({ data: { projectId: projects[0].id, threadId: threads[0].id, body: "Original GIF", gifUrl: "https://example.test/original.gif", authorEmail: `former-${nonce}@example.test`, authorName: "Former member", createdAt: stamp } });
      const foreign = await prisma.studioNestChatMessage.create({ data: { projectId: projects[1].id, threadId: threads[1].id, body: "Wrong project" } });
      const migration = readFileSync(path.resolve(process.cwd(), "../../prisma/migrations/20260913043000_unify_session_conversations/migration.sql"), "utf8");
      const backfill = migration.slice(migration.indexOf('INSERT INTO "SessionConversationMessage"'));
      await prisma.$executeRawUnsafe(backfill);
      await prisma.$executeRawUnsafe(backfill);
      expect(await prisma.sessionConversationMessage.findUnique({ where: { id: known.id } })).toMatchObject({ roomId, authorUserId: users[0].id, body: known.body, createdAt: stamp, revision: 1 });
      expect(await prisma.sessionConversationMessage.findUnique({ where: { id: unknown.id } })).toMatchObject({ authorUserId: null, authorNameSnapshot: "Former member", body: unknown.body, gifUrl: unknown.gifUrl, createdAt: stamp });
      expect(await prisma.sessionConversationMessage.findUnique({ where: { id: foreign.id } })).toBeNull();
      expect(await prisma.studioNestChatMessage.count({ where: { id: { in: [known.id, unknown.id, foreign.id] } } })).toBe(3);
      as(1);
      const read = await GET(request("GET"), context());
      expect((await read.json()).messages.find((message: any) => message.id === unknown.id)).toMatchObject({ author: { id: null, label: "Former member" }, canEdit: false });
    } finally {
      await prisma.callRoom.update({ where: { id: roomId }, data: { projectId: null } });
      await prisma.studioProject.deleteMany({ where: { id: { in: projects.map(project => project.id) } } });
      await prisma.studioWorkspace.delete({ where: { id: workspace.id } });
    }
  });
});
