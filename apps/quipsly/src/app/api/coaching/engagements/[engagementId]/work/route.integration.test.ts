/** @jest-environment node */
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { GET as readChat } from "@/app/api/nest-chat/route";
import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { loadSessionWork } from "@/lib/server/session-work";
import { createAndAssignWorkEntityTag, replaceWorkEntityTags, readTaskTagContext, readNewCoachingTaskTagContext, workTagSlug } from "@/lib/server/work-tags";
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

  it("lets space members tag shared tasks without Nest grants and keeps unrelated vocabulary private", async () => {
    const made = await act("POST", {kind: "TASK", clientRequestId: randomUUID(), title: "Organize the conversation", ownerUserId: coach!.id});
    expect(made.status).toBe(200);
    const task = made.body.entry;
    const hidden = await prisma.studioTag.create({data: {projectId, slug: `hidden-${nonce}`, label: "Unrelated private material"}});
    const privateTask = await prisma.actionItem.create({data: {engagementId, projectId, assignedUserId: coach!.id,
      title: "Private thought", sourceJson: {visibility: "author-private"}, tagLinks: {create: {tagId: hidden.id}}}});
    const privateContext = await readTaskTagContext({prisma, actorUserId: coach!.id, actorEmail: coach!.primaryEmail, entityId: privateTask.id});
    expect(privateContext?.selectedTagIds).toEqual([hidden.id]);
    expect(privateContext?.tags.some(tag => tag.id === hidden.id)).toBe(true);
    expect(await readTaskTagContext({prisma, actorUserId: client!.id, actorEmail: client!.primaryEmail, entityId: privateTask.id})).toBeNull();
    expect(await replaceWorkEntityTags({prisma, actorUserId: coach!.id, actorEmail: coach!.primaryEmail,
      entityKind: "task", entityId: privateTask.id, expectedUpdatedAt: privateTask.updatedAt, tagIds: [hidden.id]})).toMatchObject({ok: true});
    const context = (actor = client!) => readTaskTagContext({prisma, actorUserId: actor.id, actorEmail: actor.primaryEmail, entityId: task.id});
    const initial = await context();
    expect(initial).not.toBeNull();
    expect(initial!.tags.some(tag => tag.id === hidden.id)).toBe(false);
    const base = {prisma, actorUserId: client!.id, actorEmail: client!.primaryEmail, entityKind: "task" as const,
      entityId: task.id, expectedUpdatedAt: new Date(task.updatedAt)};
    expect(await replaceWorkEntityTags({...base, tagIds: [hidden.id]})).toMatchObject({ok: false, code: "FORBIDDEN"});
    const command = {...base, tagIds: [], newTagLabels: [`Shared research ${nonce}`], clientRequestId: randomUUID()};
    const saved = await replaceWorkEntityTags(command);
    expect(saved.ok).toBe(true);
    if (!saved.ok) throw new Error(saved.error);
    expect(await replaceWorkEntityTags(command)).toMatchObject({ok: true, idempotentReplay: true, tagIds: saved.tagIds});
    await prisma.studioTag.update({where: {id: saved.tagIds[0]!}, data: {hexColor: "#23543a"}});
    for (const actor of [client!, coach!]) {
      const read = await context(actor);
      expect(read?.selectedTagIds).toEqual(saved.tagIds);
      expect(read?.tags.find(tag => tag.id === saved.tagIds[0])).toMatchObject({hexColor: "#23543a"});
      expect(read?.tags.some(tag => tag.id === hidden.id)).toBe(false);
    }
    for (const actor of [observer!, guest!, outsider!]) {
      expect(await context(actor)).toBeNull();
      expect(await replaceWorkEntityTags({...base, actorUserId: actor.id, actorEmail: actor.primaryEmail,
        expectedUpdatedAt: saved.updatedAt, tagIds: []})).toMatchObject({ok: false, code: "NOT_FOUND"});
    }
    // Being the assignee is not a back door after leaving the private space.
    await prisma.coachingEngagementMember.updateMany({where: {engagementId, userId: coach!.id}, data: {status: "REMOVED"}});
    try {
      expect(await context(coach!)).toBeNull();
      expect(await replaceWorkEntityTags({...base, actorUserId: coach!.id, actorEmail: coach!.primaryEmail,
        expectedUpdatedAt: saved.updatedAt, tagIds: []})).toMatchObject({ok: false, code: "NOT_FOUND"});
    } finally {
      await prisma.coachingEngagementMember.updateMany({where: {engagementId, userId: coach!.id}, data: {status: "ACTIVE"}});
    }
    const cleared = await replaceWorkEntityTags({...base, expectedUpdatedAt: saved.updatedAt, tagIds: []});
    expect(cleared).toMatchObject({ok: true, tagIds: []});
    if (!cleared.ok) throw new Error(cleared.error);
    const archivedLabel = `Archived shared tag ${nonce}`;
    await prisma.studioTag.create({data: {projectId, slug: workTagSlug(archivedLabel), label: archivedLabel, isActive: false}});
    const uncommittedLabel = `Should roll back ${nonce}`;
    expect(await replaceWorkEntityTags({...base, expectedUpdatedAt: cleared.updatedAt, tagIds: [],
      newTagLabels: [uncommittedLabel, archivedLabel]})).toMatchObject({ok: false});
    expect(await prisma.studioTag.count({where: {projectId, label: uncommittedLabel}})).toBe(0);
    expect((await prisma.actionItem.findUniqueOrThrow({where: {id: task.id}})).updatedAt).toEqual(cleared.updatedAt);
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
    const tag = await prisma.studioTag.create({data: {projectId, slug: `conversation-${nonce}`, label: "Preparation", hexColor: "#23543a"}});
    await prisma.actionItem.update({where: {id: persisted.id}, data: {tagLinks: {create: {tagId: tag.id}}}});
    const coachRead = await act("GET", {}, coach!);
    expect(coachRead.body.engagement.entries.find((entry: {id: string}) => entry.id === persisted.id)).toMatchObject({ canEdit: true, title: command.title });
    // Native chat opens by canonical item ID, not by scanning the latest work page.
    await prisma.actionItem.update({where: {id: persisted.id}, data: {updatedAt: new Date("2000-01-01T00:00:00Z")}});
    expect((await act("GET", {}, coach!, "pageSize=1")).body.engagement.entries.some((entry: {id: string}) => entry.id === persisted.id)).toBe(false);
    for (const actor of [coach!, client!, observer!]) {
      const focused = await act("GET", {}, actor, `item=${persisted.id}&kind=TASK`);
      expect(focused.status).toBe(200);
      expect(focused.body.engagement.entries).toHaveLength(1);
      expect(focused.body.engagement.entries[0]).toMatchObject({id: persisted.id,
        canEdit: actor !== observer, tags: [{id: tag.id, hexColor: "#23543a"}]});
    }
    for (const actor of [guest!, outsider!]) {
      expect((await act("GET", {}, actor, `item=${persisted.id}&kind=TASK`)).status).toBe(404);
    }
    expect((await act("POST", { ...command, sourceMessageId: foreignMessage.id, clientRequestId: randomUUID() })).status).toBe(404);
    for (const actor of [observer!, guest!, outsider!]) expect((await act("POST", { ...command, clientRequestId: randomUUID() }, actor)).status).toBe(404);
    await prisma.studioNestChatMessage.createMany({ data: Array.from({ length: 52 }, (_, index) => ({ projectId, threadId: thread.id, body: `Later message ${index}`, createdAt: new Date(Date.now() + 1000 + index) })) });
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user: client! } as never);
    const chatResponse = await readChat(new NextRequest(`http://localhost/api/nest-chat?projectSlug=${projectId}&threadKey=engagement:${engagementId}&message=${message.id}`));
    const chat = await chatResponse.json();
    expect(chatResponse.status).toBe(200);
    expect(chat.messages.find((entry: {id: string}) => entry.id === message.id)).toMatchObject({ linkedTasks: [{ id: persisted.id, title: command.title, status: "OPEN",
      tags: [{id: tag.id, label: "Preparation", hexColor: "#23543a", isActive: true}] }] });
    expect(chat.nextCursor).toBeTruthy();
    const foreignRead = await readChat(new NextRequest(`http://localhost/api/nest-chat?projectSlug=${projectId}&threadKey=engagement:${engagementId}&message=${foreignMessage.id}`));
    expect((await foreignRead.json()).messages.some((entry: {id: string}) => entry.id === foreignMessage.id)).toBe(false);
    await prisma.studioTag.update({where: {id: tag.id}, data: {label: "Opening practice", hexColor: "#f2e4c5"}});
    for (const actor of [coach!, client!, observer!]) {
      jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({user: actor} as never);
      const refreshed = await readChat(new NextRequest(`http://localhost/api/nest-chat?projectSlug=${projectId}&threadKey=engagement:${engagementId}&message=${message.id}`));
      expect(refreshed.status).toBe(200);
      expect((await refreshed.json()).messages.find((entry: {id: string}) => entry.id === message.id).linkedTasks[0].tags)
        .toEqual([{id: tag.id, label: "Opening practice", hexColor: "#f2e4c5", isActive: true}]);
    }
    for (const actor of [guest!, outsider!]) {
      jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({user: actor} as never);
      const denied = await readChat(new NextRequest(`http://localhost/api/nest-chat?projectSlug=${projectId}&threadKey=engagement:${engagementId}&message=${message.id}`));
      expect(denied.status).toBe(404);
      expect(JSON.stringify(await denied.json())).not.toContain("Opening practice");
    }
    const current = await prisma.actionItem.findUniqueOrThrow({where: {id: persisted.id}});
    const edited = await act("PATCH", { kind: "TASK", id: persisted.id, expectedUpdatedAt: current.updatedAt.toISOString(), title: "Introduction practiced together", body: message.body, ownerUserId: client!.id, status: "DONE" }, coach!);
    expect(edited.status).toBe(200);
    expect((await act("GET")).body.engagement.entries.find((entry: {id: string}) => entry.id === persisted.id)).toMatchObject({ status: "DONE", title: "Introduction practiced together" });
    const completed = edited.body.entry;
    const reopened = await act("PATCH", {kind: "TASK", id: completed.id, expectedUpdatedAt: completed.updatedAt,
      clientRequestId: randomUUID(), title: completed.title, body: completed.body, ownerUserId: completed.owner.id,
      status: "OPEN", targetAt: completed.dueAt}, client!);
    expect(reopened).toMatchObject({status: 200, body: {entry: {id: completed.id, status: "OPEN",
      title: completed.title, body: completed.body, owner: completed.owner, dueAt: completed.dueAt,
      sourceHref: completed.sourceHref, tags: completed.tags}}});
    expect(reopened.body.entry.tags).toEqual([{id: tag.id, label: "Opening practice", hexColor: "#f2e4c5", isActive: true}]);
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({user: coach!} as never);
    const reopenedChat = await readChat(new NextRequest(`http://localhost/api/nest-chat?projectSlug=${projectId}&threadKey=engagement:${engagementId}&message=${message.id}`));
    expect((await reopenedChat.json()).messages.find((entry: {id: string}) => entry.id === message.id).linkedTasks[0])
      .toMatchObject({id: completed.id, status: "OPEN", title: completed.title, tags: completed.tags});
  });

  it("saves a task draft and its canonical tags together, with retries and all-or-nothing failure", async () => {
    const command = {kind: "TASK", clientRequestId: randomUUID(), title: "Prepare together", ownerUserId: client!.id,
      tags: {tagIds: [], newTagLabels: [`Writing ${nonce}`]}};
    const created = await act("POST", command);
    expect(created).toMatchObject({status: 200, body: {entry: {title: command.title, tags: [{label: `Writing ${nonce}`} ]}}});
    expect((await act("POST", command)).body.entry).toEqual(created.body.entry);
    const task = created.body.entry;
    const tagId = task.tags[0].id;
    const hiddenTag = await prisma.studioTag.create({data: {projectId, slug: `hidden-draft-${nonce}`, label: "Another client's private work"}});
    await prisma.studioTag.update({where: {id: tagId}, data: {hexColor: "#23543a"}});
    const scoped = (actor: typeof client) => ({prisma, actorUserId: actor!.id, actorEmail: actor!.primaryEmail, engagementId});
    for (const actor of [coach, client]) {
      const catalog = await readNewCoachingTaskTagContext(scoped(actor));
      expect(catalog).toMatchObject({tags: expect.arrayContaining([
        {id: tagId, label: `Writing ${nonce}`, hexColor: "#23543a", isActive: true},
      ])});
      expect(catalog!.tags.some(tag => tag.id === hiddenTag.id)).toBe(false);
    }
    for (const actor of [observer, guest, outsider]) expect(await readNewCoachingTaskTagContext(scoped(actor))).toBeNull();
    const update = {kind: "TASK", id: task.id, clientRequestId: randomUUID(), expectedUpdatedAt: task.updatedAt,
      title: "Write the opening scene", ownerUserId: coach!.id, status: "OPEN", tags: {tagIds: [tagId], newTagLabels: ["Next chapter"]}};
    const saved = await act("PATCH", update);
    expect(saved).toMatchObject({status: 200, body: {entry: {title: update.title, tags: expect.arrayContaining([
      expect.objectContaining({id: tagId, hexColor: "#23543a"}), expect.objectContaining({label: "Next chapter"}),
    ])}}});
    expect((await act("PATCH", update)).body.entry).toEqual(saved.body.entry);
    expect((await act("PATCH", {...update, title: "Same key, different draft"})).status).toBe(409);
    expect((await act("PATCH", {...update, clientRequestId: randomUUID()})).status).toBe(409);
    expect((await act("PATCH", {...update, clientRequestId: randomUUID(), expectedUpdatedAt: saved.body.entry.updatedAt,
      tags: {tagIds: [hiddenTag.id]}, title: "Must not gain private vocabulary"})).status).toBe(400);
    const archivedLabel = `Archived atomic ${nonce}`;
    await prisma.studioTag.create({data: {projectId, slug: workTagSlug(archivedLabel), label: archivedLabel, isActive: false}});
    const tags = {tagIds: [], newTagLabels: [`Must roll back ${nonce}`, archivedLabel]};
    const rejected = await act("PATCH", {...update, clientRequestId: randomUUID(), expectedUpdatedAt: saved.body.entry.updatedAt, title: "Must not save", tags});
    expect(rejected.status).toBe(400);
    expect((await act("GET", {}, coach!, `kind=TASK&item=${task.id}`)).body.engagement.entries[0]).toEqual(saved.body.entry);
    expect(await prisma.studioTag.count({where: {projectId, label: `Must roll back ${nonce}`}})).toBe(0);
    const failedCreate = {...command, clientRequestId: randomUUID(), title: `Must not exist ${nonce}`, tags};
    expect((await act("POST", failedCreate)).status).toBe(400);
    expect(await prisma.actionItem.count({where: {engagementId, title: failedCreate.title}})).toBe(0);
    for (const actor of [observer!, guest!, outsider!]) expect((await act("PATCH", update, actor)).status).toBe(404);
  });

  it("retains an archived tag while saving other tags, but cannot assign it to new work or restore it after removal", async () => {
    const created = await act("POST", {kind: "TASK", clientRequestId: randomUUID(), title: "Keep useful context",
      tags: {tagIds: [], newTagLabels: [`Earlier theme ${nonce}`, `Current theme ${nonce}`]}});
    expect(created.status).toBe(200);
    const task = created.body.entry;
    const archived = task.tags.find((tag: {label: string}) => tag.label === `Earlier theme ${nonce}`);
    await prisma.studioTag.update({where: {id: archived.id}, data: {isActive: false, hexColor: "#23543a"}});
    const command = {kind: "TASK", id: task.id, clientRequestId: randomUUID(), expectedUpdatedAt: task.updatedAt,
      title: "Keep context and move forward", status: task.status, ownerUserId: client!.id,
      tags: {tagIds: [archived.id], newTagLabels: [`Next theme ${nonce}`]}};
    const saved = await act("PATCH", command);
    expect(saved).toMatchObject({status: 200, body: {entry: {title: command.title, tags: expect.arrayContaining([
      {id: archived.id, label: archived.label, isActive: false, hexColor: "#23543a"},
      expect.objectContaining({label: `Next theme ${nonce}`, isActive: true}),
    ])}}});
    expect(saved.body.entry.tags).toHaveLength(2);
    expect((await act("PATCH", command)).body.entry).toEqual(saved.body.entry);
    for (const actor of [coach!, client!]) {
      expect((await act("GET", {}, actor, `kind=TASK&item=${task.id}`)).body.engagement.entries[0].tags).toEqual(saved.body.entry.tags);
    }
    for (const actor of [observer!, guest!, outsider!]) expect((await act("PATCH", command, actor)).status).toBe(404);
    expect((await act("POST", {kind: "TASK", clientRequestId: randomUUID(), title: "Do not reuse a retired label",
      tags: {tagIds: [archived.id]}})).status).toBe(400);
    const removed = await act("PATCH", {...command, clientRequestId: randomUUID(), expectedUpdatedAt: saved.body.entry.updatedAt,
      tags: {tagIds: saved.body.entry.tags.filter((tag: {id: string}) => tag.id !== archived.id).map((tag: {id: string}) => tag.id)}});
    expect(removed.status).toBe(200);
    const rejected = await act("PATCH", {...command, clientRequestId: randomUUID(), expectedUpdatedAt: removed.body.entry.updatedAt,
      title: "This change must roll back", tags: {tagIds: [archived.id]}});
    expect(rejected.status).toBe(400);
    expect((await act("GET", {}, client!, `kind=TASK&item=${task.id}`)).body.engagement.entries[0]).toEqual(removed.body.entry);
  });

  it("converges concurrent tagged saves and refuses retries after membership removal", async () => {
    const created = await act("POST", {kind: "TASK", clientRequestId: randomUUID(), title: "One shared draft"});
    const command = {kind: "TASK", id: created.body.entry.id, clientRequestId: randomUUID(),
      expectedUpdatedAt: created.body.entry.updatedAt, title: "One saved result", ownerUserId: client!.id,
      status: "OPEN", tags: {tagIds: [], newTagLabels: [`Concurrent ${nonce}`]}};
    const saves = await Promise.all([act("PATCH", command), act("PATCH", command)]);
    expect(saves.map(result => result.status)).toEqual([200, 200]);
    expect(saves[0].body.entry).toEqual(saves[1].body.entry);
    expect(await prisma.studioTag.count({where: {projectId, label: `Concurrent ${nonce}`}})).toBe(1);
    await prisma.coachingEngagementMember.updateMany({where: {engagementId, userId: client!.id}, data: {status: "REMOVED"}});
    try {
      expect((await act("PATCH", command)).status).toBe(404);
      expect(await readNewCoachingTaskTagContext({prisma, actorUserId: client!.id, actorEmail: client!.primaryEmail, engagementId})).toBeNull();
    } finally {
      await prisma.coachingEngagementMember.updateMany({where: {engagementId, userId: client!.id}, data: {status: "ACTIVE"}});
    }
  });

  it("lets a shared task editor organize its tags while keeping private work and vocabulary scoped", async () => {
    // Nest access alone is not access to a private client task. The client can
    // read the tags on shared work without getting the whole Nest vocabulary.
    await prisma.studioProjectAccessGrant.createMany({ data: [coach!, observer!, guest!, outsider!].map(actor => ({
      projectId, email: actor.primaryEmail, role: "EDITOR", status: "ACTIVE", createdByUserId: coach!.id,
    })) });
    const created = await act("POST", { kind: "TASK", title: "Organize our opening", clientRequestId: randomUUID() });
    const taskId = created.body.entry.id;
    const command = { prisma, actorUserId: coach!.id, actorEmail: coach!.primaryEmail, entityKind: "task" as const,
      entityId: taskId, expectedUpdatedAt: new Date(created.body.entry.updatedAt), label: "Shared research" };
    const tagged = await createAndAssignWorkEntityTag(command);
    expect(tagged.ok).toBe(true);
    if (!tagged.ok) throw new Error(tagged.error);
    await prisma.studioTag.update({ where: {id: tagged.tag.id}, data: {hexColor: "#23543a"} });
    const privateTag = await prisma.studioTag.create({ data: {projectId, label: "Confidential reflection", slug: `private-${nonce}`, hexColor: "#aa1122"} });
    const privateNote = await prisma.coachingNote.create({ data: {engagementId, roomId, authorUserId: coach!.id, title: "Private preparation", body: "Only the coach", visibility: "AUTHOR_PRIVATE",
      tagLinks: {create: {tagId: privateTag.id, createdByUserId: coach!.id}}} });
    for (const actor of [coach!, client!, observer!]) {
      const read = await act("GET", {}, actor, "q=Shared%20research");
      expect(read.status).toBe(200);
      expect(read.body.engagement.entries.map((entry: {id: string}) => entry.id)).toEqual([taskId]);
      expect(read.body.engagement.entries[0].tags).toEqual([{id: tagged.tag.id, label: "Shared research", hexColor: "#23543a", isActive: true}]);
    }
    const clientRead = await act("GET");
    expect(JSON.stringify(clientRead.body)).not.toContain(privateTag.label);
    expect(clientRead.body.engagement.entries.some((entry: {id: string}) => entry.id === privateNote.id)).toBe(false);
    expect((await act("GET", {}, client!, "q=Confidential")).body.engagement.entries).toEqual([]);
    expect((await act("GET", {}, outsider!, "q=Shared")).status).toBe(404);
    for (const actor of [observer!, guest!, outsider!]) {
      expect(await replaceWorkEntityTags({...command, actorUserId: actor.id, actorEmail: actor.primaryEmail,
        tagIds: [], expectedUpdatedAt: tagged.updatedAt})).toMatchObject({ok: false, code: "NOT_FOUND"});
    }
    const replaced = await replaceWorkEntityTags({...command, tagIds: [tagged.tag.id], expectedUpdatedAt: tagged.updatedAt});
    expect(replaced.ok).toBe(true);
    if (!replaced.ok) throw new Error(replaced.error);
    await prisma.coachingEngagementMember.updateMany({where: {engagementId, userId: coach!.id}, data: {status: "REMOVED"}});
    try {
      expect(await replaceWorkEntityTags({...command, tagIds: [], expectedUpdatedAt: replaced.updatedAt})).toMatchObject({ok: false, code: "NOT_FOUND"});
    } finally {
      await prisma.coachingEngagementMember.updateMany({where: {engagementId, userId: coach!.id}, data: {status: "ACTIVE"}});
    }
    await prisma.actionItem.update({where: {id: taskId}, data: {sourceJson: {visibility: "engagement-shared", relationshipWorkRemoval: {active: true}}}});
    expect(await createAndAssignWorkEntityTag({...command, label: "Should not be created", expectedUpdatedAt: replaced.updatedAt})).toMatchObject({ok: false, code: "NOT_FOUND"});
    expect(await prisma.studioTag.count({where: {projectId, label: "Should not be created"}})).toBe(0);
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

  it("filters exact shared tags across history without exposing private or removed work", async () => {
    const tag = await prisma.studioTag.create({data: {projectId, slug: `filter-${nonce}`, label: "Our focus", hexColor: "#506b46"}});
    const other = await prisma.studioTag.create({data: {projectId, slug: `other-filter-${nonce}`, label: "Our focus"}});
    const first = await seed("TASK");
    const second = await seed("GOAL");
    const removed = await seed("TASK", "engagement-shared", true);
    await prisma.actionItemTagLink.createMany({data: [{actionItemId: first.id, tagId: tag.id}, {actionItemId: removed.id, tagId: tag.id}]});
    await prisma.goalTagLink.create({data: {goalId: second.id, tagId: tag.id}});
    const privateNote = await prisma.coachingNote.create({data: {engagementId, authorUserId: coach!.id,
      title: "A private focus", body: "Not shared", visibility: "AUTHOR_PRIVATE", tagLinks: {create: {tagId: tag.id}}}});
    await prisma.coachingNote.create({data: {engagementId, authorUserId: coach!.id, title: "Another focus", body: "Same label, different tag",
      visibility: "SESSION_SHARED", tagLinks: {create: {tagId: other.id}}}});
    const query = new URLSearchParams({tag: tag.id, pageSize: "1"});
    const seen: string[] = [];
    do {
      const read = await act("GET", {}, client!, query.toString());
      expect(read.status).toBe(200);
      expect(read.body.engagement.page.tag).toBe(tag.id);
      seen.push(...read.body.engagement.entries.map((entry: {id: string}) => entry.id));
      const cursor = read.body.engagement.page.nextCursor;
      if (!cursor) break;
      expect(seen.length).toBeLessThan(3);
      expect((await act("GET", {}, client!, new URLSearchParams({tag: other.id, cursor}).toString())).status).toBe(400);
      query.set("cursor", cursor);
    } while (true);
    expect(new Set(seen)).toEqual(new Set([first.id, second.id]));
    expect((await act("GET", {}, coach!, `tag=${tag.id}&kind=NOTE`)).body.engagement.entries.map((entry: {id: string}) => entry.id)).toEqual([privateNote.id]);
    expect((await act("GET", {}, client!, `tag=${tag.id}&kind=NOTE`)).body.engagement.entries).toEqual([]);
    expect((await act("GET", {}, client!, "tag=unknown-tag")).body.engagement.entries).toEqual([]);
    expect((await act("GET", {}, outsider!, `tag=${tag.id}`)).status).toBe(404);
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
