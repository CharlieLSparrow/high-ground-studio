/** @jest-environment node */
jest.mock("server-only", () => ({}));
jest.mock("@/auth", () => ({ auth: jest.fn() }));
import { randomUUID } from "node:crypto";
import { getPrismaClient } from "@/lib/prisma";
import { createNestConversationTask } from "./nest-conversation-task";
import { personalOrSharedSessionTaskAccessWhere } from "./task-access";
import { conversationWorkSourceHref } from "../conversation-work-source";
import { createWorkTagTaxonomy, readNewNestTaskTagContext, readTaskTagContext, replaceWorkEntityTags } from "./work-tags";
import { editCanonicalTaskInTransaction } from "./canonical-task-edit";
import { ensureStudioProjectOwnerGrant } from "./studio-project-access";
import { readNestProjectFollowThrough } from "./nest-project-follow-through";

const enabled = process.env.QUIPSLY_LOCAL_DB_SMOKE === "1";
if (enabled) {
  const url = process.env.QUIPSLY_LOCAL_DATABASE_URL;
  if (!url || !["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname)) throw new Error("A local test database is required.");
  process.env.DATABASE_URL = url;
}
(enabled ? describe : describe.skip)("Nest conversation to shared work", () => {
  const prisma = getPrismaClient();
  const nonce = randomUUID();
  const id = (name: string) => `nest-chat-task-${name}-${nonce}`;
  const email = (name: string) => `${id(name)}@example.test`;
  const users = ["owner", "editor", "viewer", "outsider"];
  const command = (overrides = {}) => ({ prisma, actorUserId: id("owner"), projectSlug: id("project"),
    messageId: id("message"), title: "Gather chapter ideas", clientRequestId: randomUUID(), tagIds: [id("tag")], ...overrides });
  const read = (taskId: string, actor: string, access: "read" | "write" = "read") => prisma.actionItem.findFirst({
    where: { id: taskId, OR: personalOrSharedSessionTaskAccessWhere(id(actor), access) },
  });
  beforeAll(async () => {
    await prisma.user.createMany({ data: users.map(name => ({ id: id(name), primaryEmail: email(name) })) });
    await prisma.studioWorkspace.create({ data: { id: id("workspace"), slug: id("workspace"), name: "Shared work test" } });
    await prisma.studioProject.create({ data: { id: id("project"), slug: id("project"), name: "Book together", workspaceId: id("workspace") } });
    await prisma.studioProjectAccessGrant.createMany({ data: (["owner", "editor", "viewer"] as const).map(role => ({
      projectId: id("project"), email: email(role), memberUserId: id(role), role: role.toUpperCase() as "OWNER" | "EDITOR" | "VIEWER",
    })) });
    for (const key of ["default", "engagement:private-space"]) {
      const thread = await prisma.studioNestChatThread.create({ data: { projectId: id("project"), key, title: key } });
      await prisma.studioNestChatMessage.create({ data: { id: id(key === "default" ? "message" : "private-message"),
        projectId: id("project"), threadId: thread.id, body: "Let's gather the chapter ideas and supporting research." } });
    }
    await prisma.studioTag.create({ data: { id: id("tag"), projectId: id("project"), slug: "research", label: "Research", hexColor: "#506b46" } });
  });
  afterAll(async () => {
    await prisma.actionItem.deleteMany({ where: { projectId: id("project") } });
    await prisma.studioProject.deleteMany({ where: { workspaceId: id("workspace") } });
    await prisma.studioWorkspace.deleteMany({ where: { id: id("workspace") } });
    await prisma.user.deleteMany({ where: { id: { in: users.map(id) } } });
    await prisma.$disconnect();
  });
  it("creates one durable tagged task under concurrent retry and links back to its real conversation", async () => {
    const input = command();
    const results = await Promise.all([createNestConversationTask(input), createNestConversationTask(input)]);
    expect(results[0].entry.id).toBe(results[1].entry.id);
    expect(results.map(result => result.idempotentReplay).sort()).toEqual([false, true]);
    expect(results[0].entry.tags).toEqual([expect.objectContaining({ id: id("tag"), label: "Research", hexColor: "#506b46" })]);
    const task = await read(results[0].entry.id, "editor");
    expect(task).toMatchObject({ isNestShared: true, assignedUserId: null, detail: "Let's gather the chapter ideas and supporting research." });
    expect(conversationWorkSourceHref(null, task?.sourceJson, { id: id("project"), slug: id("project") }))
      .toBe(`/nests/${id("project")}/workspace?message=${id("message")}`);
    await expect(createNestConversationTask({ ...input, title: "Different task" })).rejects.toMatchObject({ status: 409 });
  });
  it("binds normal owner creation to the stable user instead of requiring another membership record", async () => {
    const before = await prisma.studioProjectAccessGrant.count({ where: { projectId: id("project") } });
    const owner = await ensureStudioProjectOwnerGrant({ prisma, projectId: id("project"), ownerEmail: email("owner") });
    expect(owner?.memberUserId).toBe(id("owner"));
    expect(await prisma.studioProjectAccessGrant.count({ where: { projectId: id("project") } })).toBe(before);
  });
  it("projects shared tasks, color, sources, and current edit capability into the Nest work view", async () => {
    const { entry } = await createNestConversationTask(command());
    for (const actor of ["owner", "editor", "viewer", "outsider"]) {
      const result = await readNestProjectFollowThrough(prisma, { projectId: id("project"), projectSlug: id("project"), actorUserId: id(actor) });
      const task = result.tasks.find(row => row.id === entry.id);
      if (actor === "outsider") { expect(task).toBeUndefined(); continue; }
      expect(task).toMatchObject({ canEdit: actor !== "viewer", tags: [expect.objectContaining({ id: id("tag"), hexColor: "#506b46" })],
        conversationSourceHref: `/nests/${id("project")}/workspace?message=${id("message")}` });
    }
  });
  it("creates colored shared vocabulary inline and reuses it without recoloring on retry", async () => {
    const input = { prisma, actorUserId: id("owner"), actorEmail: email("owner"), projectId: id("project"), label: "Chapter ideas", hexColor: "#ABC" };
    const created = await createWorkTagTaxonomy(input);
    expect(created).toMatchObject({ ok: true, created: true, tag: { label: "Chapter ideas", hexColor: "#aabbcc" } });
    if (!created.ok) throw new Error("Expected shared tag creation");
    const reused = await createWorkTagTaxonomy({ ...input, hexColor: "#506b46" });
    expect(reused).toMatchObject({ ok: true, created: false, tag: { id: created.tag.id, hexColor: "#aabbcc" } });
    const revisions = await prisma.studioTagRevision.findMany({ where: { tagId: created.tag.id } });
    expect(revisions).toHaveLength(1);
    expect(revisions[0].snapshotJson).toMatchObject({ after: { hexColor: "#aabbcc" } });
    const result = await createNestConversationTask(command({ tagIds: [created.tag.id] }));
    expect(result.entry.tags).toEqual([expect.objectContaining({ id: created.tag.id, hexColor: "#aabbcc" })]);
    expect(await readNewNestTaskTagContext({ prisma, actorUserId: id("editor"), projectSlug: id("project") }))
      .toMatchObject({ canCreateTags: true, tags: expect.arrayContaining([expect.objectContaining({ id: created.tag.id, hexColor: "#aabbcc" })]) });
    expect(await createWorkTagTaxonomy({ ...input, actorUserId: id("viewer"), actorEmail: email("viewer"), label: "Forbidden tag" }))
      .toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await createWorkTagTaxonomy({ ...input, hexColor: "url(https://example.test/track)" }))
      .toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(await prisma.studioTag.count({ where: { projectId: id("project"), label: "Forbidden tag" } })).toBe(0);
  });
  it("lets an editor change a teammate's task and tags while viewers can only read", async () => {
    const { entry } = await createNestConversationTask(command());
    const task = (await read(entry.id, "editor"))!;
    const edited = await prisma.$transaction(tx => editCanonicalTaskInTransaction({ tx, taskId: task.id,
      actorUserId: id("editor"), accessOr: personalOrSharedSessionTaskAccessWhere(id("editor"), "write"),
      expectedUpdatedAt: task.updatedAt, title: "Organize the chapter ideas", detail: task.detail, dueAt: null,
      dueIntent: null, surface: "nest-work", now: new Date() }));
    expect(edited.kind).toBe("saved");
    const current = (await read(entry.id, "editor"))!;
    const context = await readTaskTagContext({ prisma, actorUserId: id("editor"), actorEmail: email("editor"), entityId: entry.id });
    expect(context?.selectedTagIds).toEqual([id("tag")]);
    expect((await replaceWorkEntityTags({ prisma, actorUserId: id("editor"), actorEmail: email("editor"), entityKind: "task",
      entityId: entry.id, expectedUpdatedAt: current.updatedAt, tagIds: [] })).ok).toBe(true);
    expect(await read(entry.id, "viewer")).not.toBeNull();
    expect(await read(entry.id, "viewer", "write")).toBeNull();
    expect(await read(entry.id, "outsider")).toBeNull();
  });
  it.each(["viewer", "outsider"])("does not let %s create tasks or read the editing tag catalog", async actor => {
    await expect(createNestConversationTask(command({ actorUserId: id(actor) }))).rejects.toMatchObject({ status: 404 });
    expect(await readNewNestTaskTagContext({ prisma, actorUserId: id(actor), projectSlug: id("project") })).toBeNull();
  });
  it("does not promote a private client-space message to the whole Nest", async () => {
    await expect(createNestConversationTask(command({ messageId: id("private-message") }))).rejects.toMatchObject({ status: 404 });
  });
  it("rejects foreign/archived tags atomically without leaving an untagged task", async () => {
    const before = await prisma.actionItem.count({ where: { projectId: id("project") } });
    await expect(createNestConversationTask(command({ tagIds: [id("missing-tag")] }))).rejects.toMatchObject({ status: 409 });
    expect(await prisma.actionItem.count({ where: { projectId: id("project") } })).toBe(before);
  });
  it("keeps personal assignments private", async () => {
    const task = await prisma.actionItem.create({ data: { projectId: id("project"), assignedUserId: id("owner"), title: "Personal thought" } });
    expect(await read(task.id, "owner")).not.toBeNull();
    expect(await read(task.id, "editor")).toBeNull();
  });
  it("removes even the assignee's access and retry when their membership is revoked", async () => {
    const input = command({ actorUserId: id("editor") });
    const { entry } = await createNestConversationTask(input);
    await prisma.actionItem.update({ where: { id: entry.id }, data: { assignedUserId: id("editor") } });
    await prisma.studioProjectAccessGrant.updateMany({ where: { projectId: id("project"), memberUserId: id("editor") }, data: { status: "REVOKED" } });
    expect(await read(entry.id, "editor")).toBeNull();
    expect(await read(entry.id, "editor", "write")).toBeNull();
    await expect(createNestConversationTask(input)).rejects.toMatchObject({ status: 404 });
    expect(await read(entry.id, "owner")).not.toBeNull();
  });
});
