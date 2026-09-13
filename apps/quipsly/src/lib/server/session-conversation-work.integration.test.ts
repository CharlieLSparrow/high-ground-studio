/** @jest-environment node */
import { randomUUID } from "node:crypto";
import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "./quipsly-session";
import { GET as conversation } from "./session-conversation";
import { POST as createWork } from "@/app/api/sessions/[roomId]/work/route";
import { loadSessionWork } from "./session-work";

jest.mock("./quipsly-session", () => ({getQuipslySessionFromRequest: jest.fn()}));
const enabled = process.env.QUIPSLY_LOCAL_DB_SMOKE === "1";
if (enabled) {
  const url = new URL(process.env.QUIPSLY_LOCAL_DATABASE_URL || "invalid:");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("Conversation work tests require a local database.");
  process.env.DATABASE_URL = url.toString();
}

(enabled ? describe : describe.skip)("Session conversation to canonical work", () => {
  const prisma = getPrismaClient();
  const nonce = randomUUID();
  let users: {id: string; primaryEmail: string | null}[] = [];
  let roomId = "";
  let foreignRoomId = "";
  let messageId = "";
  let foreignMessageId = "";
  const requestId = randomUUID();
  const title = "Read the first chapter";
  const originalBody = "I will read the first chapter before our next session.";
  function as(index: number) {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({user: {...users[index], isStaff: false}} as any);
  }
  const context = () => ({params: Promise.resolve({roomId})});
  const input = (extra = {}) => new Request(`http://localhost/api/sessions/${roomId}/work`, {
    method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({kind: "TASK", title,
      sourceMessageId: messageId, body: "Untrusted browser snapshot", visibility: "SESSION_SHARED", clientRequestId: requestId, ...extra}),
  });
  const read = () => conversation(new Request(`http://localhost/api/sessions/${roomId}/conversation`), context());
  beforeAll(async () => {
    users = await Promise.all(["coach", "client", "outsider"].map(name => prisma.user.create({data: {name,
      primaryEmail: `chat-work-${name}-${nonce}@example.test`}})));
    roomId = (await prisma.callRoom.create({data: {title: "Conversation tasks", createdByUserId: users[0].id}})).id;
    foreignRoomId = (await prisma.callRoom.create({data: {title: "Private conversation", createdByUserId: users[2].id}})).id;
    await prisma.callParticipant.create({data: {roomId, userId: users[1].id, role: "CLIENT"}});
    messageId = (await prisma.sessionConversationMessage.create({data: {id: randomUUID(), roomId, authorUserId: users[1].id,
      body: originalBody, clientRequestId: randomUUID()}})).id;
    foreignMessageId = (await prisma.sessionConversationMessage.create({data: {id: randomUUID(), roomId: foreignRoomId,
      authorUserId: users[2].id, body: "Private material", clientRequestId: randomUUID()}})).id;
  });
  afterAll(async () => {
    try {
      await prisma.actionItem.deleteMany({where: {roomId: {in: [roomId, foreignRoomId].filter(Boolean)}}});
      await prisma.callRoom.deleteMany({where: {id: {in: [roomId, foreignRoomId].filter(Boolean)}}});
      await prisma.user.deleteMany({where: {id: {in: users.map(user => user.id)}}});
    } finally {await prisma.$disconnect();}
  });

  it("creates once, preserves edits, and gives both participants the same task and message links", async () => {
    as(1);
    const response = await createWork(input(), context());
    expect(response.status).toBe(200);
    const task = (await response.json()).entry;
    const row = await prisma.actionItem.findUniqueOrThrow({where: {id: task.id}});
    expect(row).toMatchObject({roomId, assignedUserId: users[1].id, detail: originalBody,
      sourceJson: expect.objectContaining({sourceMessageId: messageId, sourceMessageRevision: 1,
        sourceMessageExcerpt: originalBody, visibility: "SESSION_SHARED"})});
    await prisma.actionItem.update({where: {id: task.id}, data: {title: "Read chapter one and highlight questions"}});
    const retry = await createWork(input(), context());
    expect(await retry.json()).toMatchObject({idempotentReplay: true, entry: {id: task.id, title: "Read chapter one and highlight questions"}});
    expect(await prisma.actionItem.count({where: {roomId}})).toBe(1);
    for (const index of [0, 1]) {
      as(index);
      const payload = await (await read()).json();
      expect(payload.messages.find((message: any) => message.id === messageId).linkedTasks)
        .toEqual([{id: task.id, title: "Read chapter one and highlight questions", status: "OPEN"}]);
      const work = await loadSessionWork({prisma, roomId, actor: users[index]});
      expect(work.find(entry => entry.id === task.id)).toMatchObject({fromConversation: true, fromTranscript: false,
        sourceHref: `/sessions/${roomId}?mode=conversation&message=${messageId}#conversation-message-${messageId}`});
    }
  });

  it("never leaks private tasks, accepts foreign message IDs, or widens Session discussion to a client space", async () => {
    as(0);
    await prisma.actionItem.create({data: {roomId, title: "Private task must not leak", assignedUserId: users[0].id,
      sourceJson: {schema: "quipsly-session-work-entry-v1", roomId, sourceMessageId: messageId, visibility: "AUTHOR_PRIVATE"}}});
    as(1);
    expect(JSON.stringify(await (await read()).json())).not.toContain("Private task must not leak");
    expect((await createWork(input({sourceMessageId: foreignMessageId, clientRequestId: randomUUID()}), context())).status).toBe(404);
    expect((await createWork(input({visibility: "ENGAGEMENT_SHARED", clientRequestId: randomUUID()}), context())).status).toBe(400);
    as(2);
    expect((await read()).status).toBe(404);
    expect((await createWork(input({clientRequestId: randomUUID()}), context())).status).toBe(404);
  });

  it("retains the task when its source message is removed but does not create new work from the tombstone", async () => {
    await prisma.sessionConversationMessage.update({where: {id: messageId}, data: {deletedAt: new Date()}});
    as(1);
    expect((await createWork(input({clientRequestId: randomUUID()}), context())).status).toBe(404);
    expect(await prisma.actionItem.findUnique({where: {id: `session-task-${requestId}`}})).toMatchObject({detail: originalBody});
    const payload = await (await read()).json();
    expect(payload.messages.find((message: any) => message.id === messageId)).toMatchObject({body: "", linkedTasks: []});
  });
});
