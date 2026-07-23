/** @jest-environment node */

import { randomUUID } from "node:crypto";

import { getPrismaClient } from "@/lib/prisma";

import { createAndAssignWorkEntityTag, replaceWorkEntityTags } from "./work-tags";

jest.mock("@/auth", () => ({ auth: jest.fn() }));

const runLocalDatabaseSmoke = process.env.QUIPSLY_LOCAL_DB_SMOKE === "1" ? describe : describe.skip;
if (process.env.QUIPSLY_LOCAL_DB_SMOKE === "1") {
  if (!process.env.QUIPSLY_LOCAL_DATABASE_URL) throw new Error("QUIPSLY_LOCAL_DATABASE_URL is required for the work tag smoke.");
  process.env.DATABASE_URL = process.env.QUIPSLY_LOCAL_DATABASE_URL;
}

runLocalDatabaseSmoke("canonical work and session tags local database smoke", () => {
  const prisma = getPrismaClient();
  const nonce = randomUUID().slice(0, 8);
  const actorEmail = `work-tags-${nonce}@example.test`;
  let actorUserId = "";
  let otherUserId = "";
  let workspaceId = "";
  let projectId = "";
  let otherProjectId = "";
  let taskId = "";
  let goalId = "";
  let roomId = "";
  let taskUpdatedAt = new Date(0);
  let goalUpdatedAt = new Date(0);
  let roomUpdatedAt = new Date(0);
  let tagId = "";
  let otherTagId = "";

  beforeAll(async () => {
    const [actor, other] = await Promise.all([
      prisma.user.create({ data: { primaryEmail: actorEmail, name: "Work tag actor" } }),
      prisma.user.create({ data: { primaryEmail: `work-tags-other-${nonce}@example.test`, name: "Other actor" } }),
    ]);
    actorUserId = actor.id;
    otherUserId = other.id;
    const workspace = await prisma.studioWorkspace.create({ data: { slug: `work-tags-${nonce}`, name: "Work tags smoke" } });
    workspaceId = workspace.id;
    const [project, otherProject] = await Promise.all([
      prisma.studioProject.create({ data: { workspaceId, slug: `work-tags-main-${nonce}`, name: "High Ground Odyssey" } }),
      prisma.studioProject.create({ data: { workspaceId, slug: `work-tags-other-${nonce}`, name: "Other private Nest" } }),
    ]);
    projectId = project.id;
    otherProjectId = otherProject.id;
    await prisma.studioProjectAccessGrant.create({ data: { projectId, email: actorEmail, role: "EDITOR", status: "ACTIVE", createdByUserId: actorUserId, createdByEmail: actorEmail } });
    const [tag, otherTag] = await Promise.all([
      prisma.studioTag.create({ data: { projectId, slug: `proof-listen-${nonce}`, label: "Proof listen" } }),
      prisma.studioTag.create({ data: { projectId: otherProjectId, slug: `private-${nonce}`, label: "Other private tag" } }),
    ]);
    tagId = tag.id;
    otherTagId = otherTag.id;
    const [task, goal, room] = await Promise.all([
      prisma.actionItem.create({ data: { assignedUserId: actorUserId, projectId, title: "Proof-listen episode" } }),
      prisma.goal.create({ data: { ownerUserId: actorUserId, projectId, title: "Publish a trustworthy episode" } }),
      prisma.callRoom.create({ data: { createdByUserId: actorUserId, projectId, title: "Episode production session" } }),
    ]);
    taskId = task.id;
    goalId = goal.id;
    roomId = room.id;
    taskUpdatedAt = task.updatedAt;
    goalUpdatedAt = goal.updatedAt;
    roomUpdatedAt = room.updatedAt;
  });

  afterAll(async () => {
    try {
      if (taskId) await prisma.actionItem.deleteMany({ where: { id: taskId } });
      if (goalId) await prisma.goal.deleteMany({ where: { id: goalId } });
      if (roomId) await prisma.callRoom.deleteMany({ where: { id: roomId } });
      if (workspaceId) await prisma.studioWorkspace.deleteMany({ where: { id: workspaceId } });
      if (actorUserId || otherUserId) await prisma.user.deleteMany({ where: { id: { in: [actorUserId, otherUserId].filter(Boolean) } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it("persists explicit same-Nest joins for an owned task, goal, and session", async () => {
    const taskResult = await replaceWorkEntityTags({ prisma, actorUserId, actorEmail, entityKind: "task", entityId: taskId, tagIds: [tagId], expectedUpdatedAt: taskUpdatedAt });
    const goalResult = await replaceWorkEntityTags({ prisma, actorUserId, actorEmail, entityKind: "goal", entityId: goalId, tagIds: [tagId], expectedUpdatedAt: goalUpdatedAt });
    const roomResult = await replaceWorkEntityTags({ prisma, actorUserId, actorEmail, entityKind: "session", entityId: roomId, tagIds: [tagId], expectedUpdatedAt: roomUpdatedAt });
    expect(taskResult).toMatchObject({ ok: true, projectId, tagIds: [tagId], receiptId: expect.any(String) });
    expect(goalResult).toMatchObject({ ok: true, projectId, tagIds: [tagId], receiptId: expect.any(String) });
    expect(roomResult).toMatchObject({ ok: true, projectId, tagIds: [tagId], receiptId: expect.any(String) });
    const [task, goal, room] = await Promise.all([
      prisma.actionItem.findUnique({ where: { id: taskId }, include: { tagLinks: { include: { tag: true } } } }),
      prisma.goal.findUnique({ where: { id: goalId }, include: { tagLinks: { include: { tag: true } } } }),
      prisma.callRoom.findUnique({ where: { id: roomId }, include: { tagLinks: { include: { tag: true } } } }),
    ]);
    expect(task?.tagLinks.map((link) => link.tag.label)).toEqual(["Proof listen"]);
    expect(goal?.tagLinks.map((link) => link.tag.label)).toEqual(["Proof listen"]);
    expect(room?.tagLinks.map((link) => link.tag.label)).toEqual(["Proof listen"]);
    expect(task?.sourceJson).toMatchObject({ lastTagReceipt: { externalSideEffects: false, projectId, tagIds: [tagId] } });
  });

  it("rejects cross-Nest tags, a different actor, and stale revisions without writes", async () => {
    const currentTask = await prisma.actionItem.findUniqueOrThrow({ where: { id: taskId } });
    const crossProject = await replaceWorkEntityTags({ prisma, actorUserId, actorEmail, entityKind: "task", entityId: taskId, tagIds: [otherTagId], expectedUpdatedAt: currentTask.updatedAt });
    const otherActor = await replaceWorkEntityTags({ prisma, actorUserId: otherUserId, actorEmail, entityKind: "task", entityId: taskId, tagIds: [], expectedUpdatedAt: currentTask.updatedAt });
    const stale = await replaceWorkEntityTags({ prisma, actorUserId, actorEmail, entityKind: "task", entityId: taskId, tagIds: [], expectedUpdatedAt: taskUpdatedAt });
    await prisma.studioProjectAccessGrant.update({ where: { projectId_email: { projectId, email: actorEmail } }, data: { role: "VIEWER" } });
    const viewer = await replaceWorkEntityTags({ prisma, actorUserId, actorEmail, entityKind: "task", entityId: taskId, tagIds: [], expectedUpdatedAt: currentTask.updatedAt });
    await prisma.studioProjectAccessGrant.update({ where: { projectId_email: { projectId, email: actorEmail } }, data: { role: "EDITOR" } });
    expect(crossProject).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(otherActor).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(stale).toMatchObject({ ok: false, code: "CONFLICT" });
    expect(viewer).toMatchObject({ ok: false, code: "FORBIDDEN" });
    await expect(prisma.actionItemTagLink.findMany({ where: { actionItemId: taskId }, select: { tagId: true } })).resolves.toEqual([{ tagId }]);
  });

  it("creates one reusable Nest tag and reuses it across canonical work", async () => {
    const [task, goal] = await Promise.all([
      prisma.actionItem.findUniqueOrThrow({ where: { id: taskId } }),
      prisma.goal.findUniqueOrThrow({ where: { id: goalId } }),
    ]);
    const created = await createAndAssignWorkEntityTag({
      prisma,
      actorUserId,
      actorEmail,
      entityKind: "task",
      entityId: taskId,
      label: "Product development",
      expectedUpdatedAt: task.updatedAt,
    });
    const reused = await createAndAssignWorkEntityTag({
      prisma,
      actorUserId,
      actorEmail,
      entityKind: "goal",
      entityId: goalId,
      label: "Product development",
      expectedUpdatedAt: goal.updatedAt,
    });
    expect(created).toMatchObject({ ok: true, created: true, tag: { label: "Product development", slug: "product-development", projectId } });
    expect(reused).toMatchObject({ ok: true, created: false, tag: { id: created.ok ? created.tag.id : "unreachable" } });
    await expect(prisma.studioTag.count({ where: { projectId, slug: "product-development" } })).resolves.toBe(1);
    await expect(prisma.actionItemTagLink.findUnique({ where: { actionItemId_tagId: { actionItemId: taskId, tagId: created.ok ? created.tag.id : "unreachable" } } })).resolves.toBeTruthy();
    await expect(prisma.goalTagLink.findUnique({ where: { goalId_tagId: { goalId, tagId: reused.ok ? reused.tag.id : "unreachable" } } })).resolves.toBeTruthy();
  });

  it("fails closed on ambiguous slugs, archived vocabulary, and ownership loss", async () => {
    const task = await prisma.actionItem.findUniqueOrThrow({ where: { id: taskId } });
    const collision = await createAndAssignWorkEntityTag({
      prisma,
      actorUserId,
      actorEmail,
      entityKind: "task",
      entityId: taskId,
      label: "Product-development",
      expectedUpdatedAt: task.updatedAt,
    });
    expect(collision).toMatchObject({ ok: false, code: "SLUG_CONFLICT" });

    const archived = await prisma.studioTag.create({ data: { projectId, slug: "archived-vocabulary", label: "Archived vocabulary", isActive: false } });
    const afterCollision = await prisma.actionItem.findUniqueOrThrow({ where: { id: taskId } });
    const archivedResult = await createAndAssignWorkEntityTag({
      prisma,
      actorUserId,
      actorEmail,
      entityKind: "task",
      entityId: taskId,
      label: "Archived vocabulary",
      expectedUpdatedAt: afterCollision.updatedAt,
    });
    expect(archivedResult).toMatchObject({ ok: false, code: "ARCHIVED" });

    const otherActor = await createAndAssignWorkEntityTag({
      prisma,
      actorUserId: otherUserId,
      actorEmail,
      entityKind: "task",
      entityId: taskId,
      label: "Private attempt",
      expectedUpdatedAt: afterCollision.updatedAt,
    });
    expect(otherActor).toMatchObject({ ok: false, code: "NOT_FOUND" });
    await expect(prisma.actionItemTagLink.findMany({ where: { actionItemId: taskId, tagId: archived.id } })).resolves.toEqual([]);
  });
});
