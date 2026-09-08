/** @jest-environment node */
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { GET as readChat } from "@/app/api/nest-chat/route";
import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { loadSessionWork } from "@/lib/server/session-work";
import { DELETE, GET, PATCH, POST, PUT } from "./route";

jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));

const enabled = process.env.QUIPSLY_LOCAL_DB_SMOKE === "1";
if (enabled) {
  const target = process.env.QUIPSLY_LOCAL_DATABASE_URL;
  if (!target || !["localhost", "127.0.0.1", "[::1]"].includes(new URL(target).hostname)) {
    throw new Error("Client-space endpoint tests require an explicit local database.");
  }
  process.env.DATABASE_URL = target;
}

(enabled ? describe : describe.skip)("client-space work through the real web and Capture endpoint", () => {
  const prisma = getPrismaClient();
  const nonce = randomUUID();
  const people = ["coach", "client", "observer", "guest", "outsider"].map((name) => ({
    id: `space-work-${name}-${nonce}`, name, primaryEmail: `space-work-${name}-${nonce}@example.test`,
  }));
  const [coach, client, observer, guest, outsider] = people;
  const workspaceId = `space-work-${nonce}`;
  const projectId = `space-project-${nonce}`;
  const engagementId = `space-relationship-${nonce}`;
  const roomId = `space-session-${nonce}`;
  const handlers = {GET, PATCH, POST, DELETE, PUT};

  async function act(method: keyof typeof handlers, body: Record<string, unknown> = {}, actor = client!, query = "") {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({user: actor} as never);
    const response = await handlers[method](new Request(`http://localhost/api/coaching/engagements/${engagementId}/work${query ? `?${query}` : ""}`, {
      method, ...(method === "GET" ? {} : {headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)}),
    }), {params: Promise.resolve({engagementId})});
    return {status: response.status, body: await response.json()};
  }

  async function seed(kind: "TASK" | "GOAL", visibility = "engagement-shared", removed = false) {
    const sourceJson = {origin: "quipsly-session-follow-through", visibility, roomId,
      recordingAssetId: "retained-source-fixture", sourceStartSeconds: 12,
      ...(removed ? {relationshipWorkRemoval: {active: true, previousStatus: kind === "TASK" ? "OPEN" : "ACTIVE"}} : {}),
    };
    return kind === "TASK"
      ? prisma.actionItem.create({data: {engagementId, roomId, title: "Original task", assignedUserId: coach!.id,
          status: removed ? "CANCELED" : "OPEN", dueAt: new Date("2026-09-20T15:30:00Z"), sourceJson}})
      : prisma.goal.create({data: {engagementId, roomId, title: "Original goal", ownerUserId: coach!.id,
          status: removed ? "ARCHIVED" : "ACTIVE", sourceJson}});
  }

  async function row(kind: "TASK" | "GOAL", id: string) {
    return kind === "TASK" ? prisma.actionItem.findUniqueOrThrow({where: {id}}) : prisma.goal.findUniqueOrThrow({where: {id}});
  }

  beforeAll(async () => {
    await prisma.user.createMany({data: people});
    await prisma.studioWorkspace.create({data: {id: workspaceId, slug: workspaceId, name: "Client-space endpoint QA"}});
    await prisma.studioProject.create({data: {id: projectId, workspaceId, slug: projectId, name: "QA"}});
    await prisma.coachingEngagement.create({data: {id: engagementId, projectId, title: "Client space",
      primaryCoachUserId: coach!.id, primaryClientUserId: client!.id, members: {create: [
        {userId: coach!.id, role: "COACH"}, {userId: client!.id, role: "CLIENT"}, {userId: observer!.id, role: "OBSERVER"},
      ]}}});
    await prisma.callRoom.create({data: {id: roomId, projectId, coachingEngagementId: engagementId, createdByUserId: coach!.id,
      participants: {create: {userId: guest!.id, role: "GUEST"}}}});
  });

  afterAll(async () => {
    try {
      await prisma.coachingNote.deleteMany({where: {engagementId}});
      await prisma.actionItem.deleteMany({where: {engagementId}});
      await prisma.goal.deleteMany({where: {engagementId}});
      await prisma.callRoom.deleteMany({where: {id: roomId}});
      await prisma.coachingEngagement.deleteMany({where: {id: engagementId}});
      await prisma.studioProject.deleteMany({where: {id: projectId}});
      await prisma.studioWorkspace.deleteMany({where: {id: workspaceId}});
      await prisma.user.deleteMany({where: {id: {in: people.map((person) => person.id)}}});
    } finally { await prisma.$disconnect(); }
  });

  it.each(["NOTE", "TASK", "GOAL"] as const)("replays a saved %s after a lost response without creating duplicate work", async (kind) => {
    const command = {kind, clientRequestId: randomUUID(), title: `A retryable ${kind.toLowerCase()}`,
      body: "Useful work should only appear once", ownerUserId: client!.id, visibility: "SHARED", targetAt: ""};
    const first = await act("POST", command);
    expect(first).toMatchObject({status: 200, body: {ok: true, idempotentReplay: false, entry: {kind, title: command.title}}});
    const retry = await act("POST", command);
    expect(retry).toMatchObject({status: 200, body: {ok: true, idempotentReplay: true, entry: first.body.entry}});
    const read = await act("GET");
    expect(read.body.engagement.entries.filter((entry: {title: string}) => entry.title === command.title))
      .toHaveLength(1);
    expect((await act("POST", {...command, title: "Different content with the same key"})).status).toBe(409);
    expect((await act("GET")).body.engagement.entries.find((entry: {id: string}) => entry.id === first.body.entry.id))
      .toMatchObject({title: command.title, body: command.body});
    for (const actor of [observer!, guest!, outsider!]) {
      expect((await act("POST", command, actor)).status).toBe(404);
    }
  });

  it("turns a scoped conversation into shared editable work, retains its source, and reads it back in older chat history", async () => {
    const thread = await prisma.studioNestChatThread.create({ data: { projectId, key: `engagement:${engagementId}`, title: "Shared conversation" } });
    const message = await prisma.studioNestChatMessage.create({ data: { projectId, threadId: thread.id, body: "Practice the introduction before our next call." } });
    const foreignThread = await prisma.studioNestChatThread.create({ data: { projectId, key: "engagement:another-private-client", title: "Other client" } });
    const foreignMessage = await prisma.studioNestChatMessage.create({ data: { projectId, threadId: foreignThread.id, body: "Private other conversation" } });
    const command = { kind: "TASK", title: "Practice my introduction", body: message.body, sourceMessageId: message.id, clientRequestId: randomUUID() };
    const first = await act("POST", command);
    expect(first).toMatchObject({ status: 200, body: { ok: true, entry: { kind: "TASK", visibility: "SHARED",
      sourceHref: `/coaching/engagements/${engagementId}?message=${message.id}#relationship-conversation` } } });
    const retry = await act("POST", command);
    expect(retry.body.entry.id).toBe(first.body.entry.id);
    const persisted = await prisma.actionItem.findUniqueOrThrow({ where: { id: first.body.entry.id } });
    expect(persisted.sourceJson).toMatchObject({ conversationSource: { messageId: message.id, threadId: thread.id, engagementId, excerpt: message.body } });
    const coachRead = await act("GET", {}, coach!);
    expect(coachRead.body.engagement.entries.find((entry: {id: string}) => entry.id === persisted.id)).toMatchObject({ canEdit: true, title: command.title });
    expect((await act("POST", { ...command, sourceMessageId: foreignMessage.id, clientRequestId: randomUUID() })).status).toBe(404);
    for (const actor of [observer!, guest!, outsider!]) expect((await act("POST", { ...command, clientRequestId: randomUUID() }, actor)).status).toBe(404);
    await prisma.studioNestChatMessage.createMany({ data: Array.from({ length: 52 }, (_, index) => ({ projectId, threadId: thread.id, body: `Later message ${index}`, createdAt: new Date(Date.now() + 1000 + index) })) });
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user: client! } as never);
    const chatResponse = await readChat(new NextRequest(`http://localhost/api/nest-chat?projectSlug=${projectId}&threadKey=engagement:${engagementId}&message=${message.id}`));
    const chat = await chatResponse.json();
    expect(chatResponse.status).toBe(200);
    expect(chat.messages.find((entry: {id: string}) => entry.id === message.id)).toMatchObject({ linkedTasks: [{ id: persisted.id, title: command.title, status: "OPEN" }] });
    expect(chat.nextCursor).toBeTruthy();
    const foreignRead = await readChat(new NextRequest(`http://localhost/api/nest-chat?projectSlug=${projectId}&threadKey=engagement:${engagementId}&message=${foreignMessage.id}`));
    expect((await foreignRead.json()).messages.some((entry: {id: string}) => entry.id === foreignMessage.id)).toBe(false);
    const edited = await act("PATCH", { kind: "TASK", id: persisted.id, expectedUpdatedAt: persisted.updatedAt.toISOString(), title: "Introduction practiced together", body: message.body, ownerUserId: client!.id, status: "DONE" }, coach!);
    expect(edited.status).toBe(200);
    expect((await act("GET")).body.engagement.entries.find((entry: {id: string}) => entry.id === persisted.id)).toMatchObject({ status: "DONE", title: "Introduction practiced together" });
  });

  it.each(["TASK", "GOAL"] as const)("cannot change, remove, or restore a known private %s ID", async (kind) => {
    for (const method of ["PATCH", "DELETE", "PUT"] as const) {
      const original = await seed(kind, "AUTHOR_PRIVATE", method === "PUT");
      const read = await act("GET");
      expect(read.body.engagement.entries.some((entry: {id: string}) => entry.id === original.id)).toBe(false);
      const response = await act(method, {kind, id: original.id, expectedUpdatedAt: original.updatedAt.toISOString(),
        title: "Unwanted change", body: "Must not be written", ownerUserId: client!.id,
        status: kind === "TASK" ? "OPEN" : "ACTIVE"});
      expect({method, status: response.status}).toEqual({method, status: 409});
      expect(await row(kind, original.id)).toEqual(original);
    }
  });

  it("saves a burst of independent collaboration work and deduplicates concurrent retries", async () => {
    const commands = Array.from({length: 6}, (_, index) => ({
      kind: ["NOTE", "TASK", "GOAL"][index % 3], clientRequestId: randomUUID(),
      title: `Simultaneous collaboration ${index}`, body: "No manual retry needed", ownerUserId: client!.id,
      visibility: "SHARED", targetAt: "",
    }));
    const responses = await Promise.all(commands.map(command => act("POST", command)));
    expect(responses.map(result => result.status)).toEqual(Array(6).fill(200));
    const command = {...commands[0]!, clientRequestId: randomUUID(), title: "One shared command"};
    const retries = await Promise.all(Array.from({length: 5}, () => act("POST", command)));
    expect(retries.map(result => result.status)).toEqual(Array(5).fill(200));
    expect(new Set(retries.map(result => result.body.entry.id)).size).toBe(1);
    expect(await prisma.coachingNote.count({where: {engagementId, title: command.title}})).toBe(1);
  });

  it.each(["TASK", "GOAL"] as const)("edits, removes, and restores shared %s without losing its recording source", async (kind) => {
    const original = await seed(kind);
    const sourceHref = `/sessions/${roomId}?mode=transcript&source=retained-source-fixture&at=12`;
    expect((await act("GET")).body.engagement.entries.find((entry: {id: string}) => entry.id === original.id))
      .toMatchObject({sourceHref});
    const saved = await act("PATCH", {kind, id: original.id, expectedUpdatedAt: original.updatedAt.toISOString(),
      title: "Clarified together", body: "Same work in the client space and session", ownerUserId: coach!.id,
      status: kind === "TASK" ? "DONE" : "ACHIEVED", targetAt: "2026-09-20T15:30:00.000Z"});
    expect(saved).toMatchObject({status: 200, body: {ok: true, entry: {id: original.id, title: "Clarified together", sourceHref}}});
    const updated = await row(kind, original.id);
    expect(updated.sourceJson).toMatchObject(original.sourceJson as object);
    const sessionWork = await loadSessionWork({prisma, roomId, actor: coach!});
    expect(sessionWork.find((entry) => entry.id === original.id)).toMatchObject({title: "Clarified together", status: kind === "TASK" ? "DONE" : "ACHIEVED", sourceHref});
    expect((await act("PATCH", {kind, id: original.id, expectedUpdatedAt: original.updatedAt.toISOString(),
      title: "Stale edit", ownerUserId: coach!.id, status: kind === "TASK" ? "OPEN" : "ACTIVE"})).status).toBe(409);
    const removed = await act("DELETE", {kind, id: original.id, expectedUpdatedAt: updated.updatedAt.toISOString()});
    expect(removed).toMatchObject({status: 200, body: {ok: true, undoAvailable: true}});
    expect((await act("GET")).body.engagement.entries.some((entry: {id: string}) => entry.id === original.id)).toBe(false);
    const restored = await act("PUT", {kind, id: original.id, expectedUpdatedAt: removed.body.removal.updatedAt});
    expect(restored).toMatchObject({status: 200, body: {entry: {id: original.id, title: "Clarified together", status: kind === "TASK" ? "DONE" : "ACHIEVED", sourceHref}}});
    expect((await act("GET")).body.engagement.entries.find((entry: {id: string}) => entry.id === original.id))
      .toMatchObject({sourceHref});
    expect((await row(kind, original.id)).sourceJson).toMatchObject(original.sourceJson as object);
  });

  it("rejects observers, single-session guests, outsiders, and removed members for all mutations", async () => {
    for (const actor of [observer!, guest!, outsider!]) {
      for (const method of ["PATCH", "DELETE", "PUT"] as const) {
        const original = await seed("TASK", "engagement-shared", method === "PUT");
        expect((await act(method, {kind: "TASK", id: original.id, expectedUpdatedAt: original.updatedAt.toISOString(),
          title: "Not allowed", ownerUserId: client!.id, status: "OPEN"}, actor)).status).toBe(404);
        expect(await row("TASK", original.id)).toEqual(original);
      }
    }
    await prisma.coachingEngagementMember.update({where: {engagementId_userId: {engagementId, userId: client!.id}}, data: {status: "REMOVED"}});
    try {
      expect((await act("GET")).status).toBe(404);
      for (const method of ["PATCH", "DELETE", "PUT"] as const) {
        const original = await seed("TASK", "engagement-shared", method === "PUT");
        expect((await act(method, {kind: "TASK", id: original.id, expectedUpdatedAt: original.updatedAt.toISOString(),
          title: "Removed member cannot change this", ownerUserId: coach!.id, status: "OPEN"})).status).toBe(404);
        expect(await row("TASK", original.id)).toEqual(original);
      }
    }
    finally { await prisma.coachingEngagementMember.update({where: {engagementId_userId: {engagementId, userId: client!.id}}, data: {status: "ACTIVE"}}); }
  });

  it("searches beyond the first hundred records and excludes removed and private matches before paging", async () => {
    const at = new Date("2026-01-01T00:00:00Z");
    const records = Array.from({length: 125}, (_, index) => ({
      id: `history-${nonce}-${String(index).padStart(3, "0")}`, engagementId, authorUserId: coach!.id,
      title: `History example ${index}`, body: "An enduring reflection about listening", visibility: "SESSION_SHARED" as const,
      updatedAt: at, sourceJson: {},
    }));
    await prisma.coachingNote.createMany({data: records});
    await prisma.coachingNote.createMany({data: Array.from({length: 110}, (_, index) => ({
      engagementId, authorUserId: coach!.id, title: "History example removed", body: "An enduring reflection about listening",
      visibility: "SESSION_SHARED" as const, sourceJson: {relationshipWorkRemoval: {active: true}},
    }))});
    const privateNote = await prisma.coachingNote.create({data: {engagementId, authorUserId: coach!.id, title: "History example secret",
      body: "An enduring reflection about listening", visibility: "AUTHOR_PRIVATE"}});
    const seen: string[] = [];
    let cursor: string | null = null;
    let requests = 0;
    do {
      const query = new URLSearchParams({q: "enduring listening", pageSize: "20", kind: "NOTE"});
      if (cursor) query.set("cursor", cursor);
      const page = await act("GET", {}, client!, query.toString());
      expect(page.status).toBe(200);
      seen.push(...page.body.engagement.entries.map((entry: {id: string}) => entry.id));
      cursor = page.body.engagement.page.nextCursor;
      expect(++requests).toBeLessThan(10);
    } while (cursor);
    expect(seen).toEqual(records.map((entry) => entry.id).reverse());
    expect(new Set(seen).size).toBe(125);
    const exact = await act("GET", {}, client!, new URLSearchParams({item: records[0]!.id}).toString());
    expect(exact.body.engagement.entries.map((entry: {id: string}) => entry.id)).toEqual([records[0]!.id]);
    expect((await act("GET", {}, client!, new URLSearchParams({item: privateNote.id}).toString())).body.engagement.entries).toEqual([]);
    expect((await act("GET", {}, coach!, new URLSearchParams({item: privateNote.id}).toString())).body.engagement.entries).toHaveLength(1);
    const outsiderRead = await act("GET", {}, outsider!, "q=enduring");
    expect(outsiderRead.status).toBe(404);
    const first = await act("GET", {}, client!, "q=enduring&pageSize=20");
    expect((await act("GET", {}, client!, new URLSearchParams({q: "different", cursor: first.body.engagement.page.nextCursor}).toString())).status).toBe(400);
  });

  it("pages one mixed history across model and timestamp boundaries without omissions or repeats", async () => {
    const stamp = new Date("2026-02-01T00:00:00Z");
    const tasks = await Promise.all(Array.from({length: 11}, (_, i) => prisma.actionItem.create({data: {
      engagementId, title: `Mixed-history specimen ${i}`, assignedUserId: client!.id, updatedAt: stamp, sourceJson: {},
    }})));
    const goals = await Promise.all(Array.from({length: 9}, (_, i) => prisma.goal.create({data: {
      engagementId, title: `Mixed-history specimen ${i}`, ownerUserId: client!.id, updatedAt: stamp, sourceJson: {},
    }})));
    const notes = await Promise.all(Array.from({length: 13}, (_, i) => prisma.coachingNote.create({data: {
      engagementId, title: `Mixed-history specimen ${i}`, body: "Same-time example", authorUserId: client!.id,
      visibility: "SESSION_SHARED", updatedAt: stamp, sourceJson: {},
    }})));
    const seen: Array<{id: string; kind: string}> = [];
    let cursor: string | null = null;
    let iterations = 0;
    do {
      const query = new URLSearchParams({q: "mixed-history specimen", pageSize: "7"});
      if (cursor) query.set("cursor", cursor);
      const page = await act("GET", {}, client!, query.toString());
      expect(page.status).toBe(200);
      expect(page.body.engagement.entries.length).toBeLessThanOrEqual(7);
      seen.push(...page.body.engagement.entries);
      cursor = page.body.engagement.page.nextCursor;
      if (iterations === 0) {
        expect((await act("GET", {}, coach!, new URLSearchParams({q: "mixed-history specimen", cursor: cursor!}).toString())).status).toBe(400);
      }
      expect(++iterations).toBeLessThan(10);
    } while (cursor);
    const ids = [...tasks, ...goals, ...notes].map((entry) => entry.id);
    expect(seen.map((entry) => entry.id).sort()).toEqual(ids.sort());
    expect(seen.map((entry) => entry.kind)).toEqual([...Array(11).fill("TASK"), ...Array(13).fill("NOTE"), ...Array(9).fill("GOAL")]);
  });

  it("retains a shared note's source through edits, removal, restore, and a fresh read", async () => {
    const original = await prisma.coachingNote.create({data: {engagementId, roomId, authorUserId: coach!.id,
      title: "Shared recording note", body: "Original words", visibility: "SESSION_SHARED",
      sourceJson: {origin: "quipsly-session-follow-through", roomId, recordingAssetId: "note-source", sourceStartSeconds: 7.25},
    }});
    const sourceHref = `/sessions/${roomId}?mode=transcript&source=note-source&at=7.25`;
    const saved = await act("PATCH", {kind: "NOTE", id: original.id, expectedUpdatedAt: original.updatedAt.toISOString(),
      title: "Our clearer wording", body: "Written together", visibility: "SHARED"});
    expect(saved).toMatchObject({status: 200, body: {entry: {id: original.id, sourceHref}}});
    const removed = await act("DELETE", {kind: "NOTE", id: original.id, expectedUpdatedAt: saved.body.entry.updatedAt});
    expect(removed.status).toBe(200);
    const restored = await act("PUT", {kind: "NOTE", id: original.id, expectedUpdatedAt: removed.body.removal.updatedAt});
    expect(restored).toMatchObject({status: 200, body: {entry: {id: original.id, sourceHref}}});
    expect((await act("GET")).body.engagement.entries.find((entry: {id: string}) => entry.id === original.id))
      .toMatchObject({title: "Our clearer wording", body: "Written together", sourceHref});
    expect((await prisma.coachingNote.findUniqueOrThrow({where: {id: original.id}})).sourceJson).toMatchObject(original.sourceJson as object);
  });
});
