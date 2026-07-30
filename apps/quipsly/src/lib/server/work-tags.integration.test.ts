/** @jest-environment node */

import { randomUUID } from "node:crypto";

import { getPrismaClient } from "@/lib/prisma";

import { createAndAssignWorkEntityTag, mutateWorkTagTaxonomy, replaceWorkEntityTags } from "./work-tags";

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
  let noteId = "";
  let documentId = "";
  let taskUpdatedAt = new Date(0);
  let goalUpdatedAt = new Date(0);
  let roomUpdatedAt = new Date(0);
  let noteUpdatedAt = new Date(0);
  let documentUpdatedAt = new Date(0);
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
    const note = await prisma.coachingNote.create({ data: { roomId, authorUserId: actorUserId, kind: "SESSION_NOTE", title: "Opening note", body: "Let the first question breathe." } });
    noteId = note.id;
    const document = await prisma.studioDocument.create({
      data: {
        projectId,
        stableId: `work-tags-document-${nonce}`,
        title: "Episode acceptance notes",
        sourceLabel: "document-kind:note;origin:work-tags-smoke",
      },
    });
    documentId = document.id;
    taskUpdatedAt = task.updatedAt;
    goalUpdatedAt = goal.updatedAt;
    roomUpdatedAt = room.updatedAt;
    noteUpdatedAt = note.updatedAt;
    documentUpdatedAt = document.updatedAt;
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

  it("persists explicit same-Nest joins for a document, task, goal, session, and note", async () => {
    const documentResult = await replaceWorkEntityTags({ prisma, actorUserId, actorEmail, entityKind: "document", entityId: documentId, tagIds: [tagId], expectedUpdatedAt: documentUpdatedAt, expectedTagRevision: 0 });
    const taskResult = await replaceWorkEntityTags({ prisma, actorUserId, actorEmail, entityKind: "task", entityId: taskId, tagIds: [tagId], expectedUpdatedAt: taskUpdatedAt });
    const goalResult = await replaceWorkEntityTags({ prisma, actorUserId, actorEmail, entityKind: "goal", entityId: goalId, tagIds: [tagId], expectedUpdatedAt: goalUpdatedAt });
    const roomResult = await replaceWorkEntityTags({ prisma, actorUserId, actorEmail, entityKind: "session", entityId: roomId, tagIds: [tagId], expectedUpdatedAt: roomUpdatedAt });
    const noteResult = await replaceWorkEntityTags({ prisma, actorUserId, actorEmail, entityKind: "note", entityId: noteId, tagIds: [tagId], expectedUpdatedAt: noteUpdatedAt });
    expect(documentResult).toMatchObject({ ok: true, projectId, tagIds: [tagId], tagRevision: 1, receiptId: expect.any(String) });
    expect(taskResult).toMatchObject({ ok: true, projectId, tagIds: [tagId], receiptId: expect.any(String) });
    expect(goalResult).toMatchObject({ ok: true, projectId, tagIds: [tagId], receiptId: expect.any(String) });
    expect(roomResult).toMatchObject({ ok: true, projectId, tagIds: [tagId], receiptId: expect.any(String) });
    expect(noteResult).toMatchObject({ ok: true, projectId, tagIds: [tagId], receiptId: expect.any(String) });
    const [document, task, goal, room, note] = await Promise.all([
      prisma.studioDocument.findUnique({ where: { id: documentId }, include: { tagLinks: { include: { tag: true } }, documentOperations: true } }),
      prisma.actionItem.findUnique({ where: { id: taskId }, include: { tagLinks: { include: { tag: true } } } }),
      prisma.goal.findUnique({ where: { id: goalId }, include: { tagLinks: { include: { tag: true } } } }),
      prisma.callRoom.findUnique({ where: { id: roomId }, include: { tagLinks: { include: { tag: true } } } }),
      prisma.coachingNote.findUnique({ where: { id: noteId }, include: { tagLinks: { include: { tag: true } } } }),
    ]);
    expect(document?.tagLinks.map((link) => link.tag.label)).toEqual(["Proof listen"]);
    expect(document?.tagRevision).toBe(1);
    expect(document?.documentOperations.at(-1)?.afterJson).toMatchObject({
      entityKind: "document",
      externalSideEffects: false,
      sourceMutated: false,
      projectId,
      tagIds: [tagId],
    });
    expect(task?.tagLinks.map((link) => link.tag.label)).toEqual(["Proof listen"]);
    expect(goal?.tagLinks.map((link) => link.tag.label)).toEqual(["Proof listen"]);
    expect(room?.tagLinks.map((link) => link.tag.label)).toEqual(["Proof listen"]);
    expect(note?.tagLinks.map((link) => link.tag.label)).toEqual(["Proof listen"]);
    expect(note?.sourceJson).toMatchObject({ lastTagReceipt: { externalSideEffects: false, projectId, tagIds: [tagId] } });
    expect(task?.sourceJson).toMatchObject({ lastTagReceipt: { externalSideEffects: false, projectId, tagIds: [tagId] } });
  });

  it("locks document classification on its own revision and rejects a superseded replay", async () => {
    const document = await prisma.studioDocument.create({
      data: {
        projectId,
        stableId: `work-tags-revision-${nonce}`,
        title: "Revision-isolated document",
      },
    });
    const originalUpdatedAt = document.updatedAt;
    await prisma.studioDocument.update({
      where: { id: document.id },
      data: {
        title: "Revision-isolated document with unrelated prose metadata",
        updatedAt: new Date(originalUpdatedAt.getTime() + 1_000),
      },
    });
    const clientRequestId = randomUUID();
    const first = await replaceWorkEntityTags({
      prisma,
      actorUserId,
      actorEmail,
      entityKind: "document",
      entityId: document.id,
      tagIds: [tagId],
      expectedUpdatedAt: originalUpdatedAt,
      expectedTagRevision: 0,
      clientRequestId,
      surface: "nest-writing",
    });
    expect(first).toMatchObject({
      ok: true,
      tagIds: [tagId],
      tagRevision: 1,
      idempotentReplay: false,
    });

    const replay = await replaceWorkEntityTags({
      prisma,
      actorUserId,
      actorEmail,
      entityKind: "document",
      entityId: document.id,
      tagIds: [tagId],
      expectedUpdatedAt: originalUpdatedAt,
      expectedTagRevision: 0,
      clientRequestId,
      surface: "nest-writing",
    });
    expect(replay).toMatchObject({
      ok: true,
      tagRevision: 1,
      idempotentReplay: true,
    });

    const changed = await replaceWorkEntityTags({
      prisma,
      actorUserId,
      actorEmail,
      entityKind: "document",
      entityId: document.id,
      tagIds: [],
      expectedUpdatedAt: first.ok ? first.updatedAt : originalUpdatedAt,
      expectedTagRevision: 1,
      clientRequestId: randomUUID(),
      surface: "nest-writing",
    });
    expect(changed).toMatchObject({ ok: true, tagIds: [], tagRevision: 2 });

    const supersededReplay = await replaceWorkEntityTags({
      prisma,
      actorUserId,
      actorEmail,
      entityKind: "document",
      entityId: document.id,
      tagIds: [tagId],
      expectedUpdatedAt: originalUpdatedAt,
      expectedTagRevision: 0,
      clientRequestId,
      surface: "nest-writing",
    });
    expect(supersededReplay).toMatchObject({
      ok: false,
      code: "CONFLICT",
      error: expect.stringContaining("superseded"),
    });
  });

  it("replays one iPhone tag decision exactly and rejects identity reuse for different tags", async () => {
    const task = await prisma.actionItem.findUniqueOrThrow({ where: { id: taskId } });
    const clientRequestId = randomUUID();
    const first = await replaceWorkEntityTags({
      prisma,
      actorUserId,
      actorEmail,
      entityKind: "task",
      entityId: taskId,
      tagIds: [tagId],
      expectedUpdatedAt: task.updatedAt,
      clientRequestId,
      surface: "ios-capture-today",
    });
    const replay = await replaceWorkEntityTags({
      prisma,
      actorUserId,
      actorEmail,
      entityKind: "task",
      entityId: taskId,
      tagIds: [tagId],
      expectedUpdatedAt: task.updatedAt,
      clientRequestId,
      surface: "ios-capture-today",
    });
    const conflictingReuse = await replaceWorkEntityTags({
      prisma,
      actorUserId,
      actorEmail,
      entityKind: "task",
      entityId: taskId,
      tagIds: [],
      expectedUpdatedAt: task.updatedAt,
      clientRequestId,
      surface: "ios-capture-today",
    });
    expect(first).toMatchObject({
      ok: true,
      receiptId: `work-tags-${clientRequestId}`,
      idempotentReplay: false,
    });
    expect(replay).toMatchObject({
      ok: true,
      receiptId: `work-tags-${clientRequestId}`,
      idempotentReplay: true,
    });
    expect(conflictingReuse).toMatchObject({ ok: false, code: "CONFLICT" });
    const persisted = await prisma.actionItem.findUniqueOrThrow({ where: { id: taskId } });
    expect(persisted.sourceJson).toMatchObject({
      lastTagReceipt: {
        id: `work-tags-${clientRequestId}`,
        clientRequestId,
        surface: "ios-capture-today",
        tagIds: [tagId],
        externalSideEffects: false,
      },
    });
    await expect(prisma.actionItemTagLink.findMany({
      where: { actionItemId: taskId },
      select: { tagId: true },
    })).resolves.toEqual([{ tagId }]);
  });

  it("creates or reuses vocabulary inside one replay-safe complete iPhone tag decision", async () => {
    const task = await prisma.actionItem.findUniqueOrThrow({ where: { id: taskId } });
    const clientRequestId = randomUUID();
    const first = await replaceWorkEntityTags({
      prisma,
      actorUserId,
      actorEmail,
      entityKind: "task",
      entityId: taskId,
      tagIds: [tagId],
      newTagLabels: ["Recording day"],
      expectedUpdatedAt: task.updatedAt,
      clientRequestId,
      surface: "ios-capture-today",
    });
    expect(first).toMatchObject({
      ok: true,
      requestedTagIds: [tagId],
      newTagLabels: ["Recording day"],
      resolvedTags: [{ requestedLabel: "Recording day", label: "Recording day", slug: "recording-day", created: true }],
      idempotentReplay: false,
    });
    if (!first.ok) throw new Error("atomic tag setup failed");
    expect(first.tagIds).toHaveLength(2);

    const replay = await replaceWorkEntityTags({
      prisma,
      actorUserId,
      actorEmail,
      entityKind: "task",
      entityId: taskId,
      tagIds: [tagId],
      newTagLabels: ["Recording day"],
      expectedUpdatedAt: task.updatedAt,
      clientRequestId,
      surface: "ios-capture-today",
    });
    expect(replay).toMatchObject({
      ok: true,
      tagIds: first.tagIds,
      requestedTagIds: [tagId],
      newTagLabels: ["Recording day"],
      idempotentReplay: true,
    });

    const conflictingReuse = await replaceWorkEntityTags({
      prisma,
      actorUserId,
      actorEmail,
      entityKind: "task",
      entityId: taskId,
      tagIds: [tagId],
      newTagLabels: ["Editing day"],
      expectedUpdatedAt: task.updatedAt,
      clientRequestId,
      surface: "ios-capture-today",
    });
    expect(conflictingReuse).toMatchObject({ ok: false, code: "CONFLICT" });
    await expect(prisma.studioTag.findMany({
      where: { projectId, slug: "recording-day" },
      select: { id: true, label: true },
    })).resolves.toHaveLength(1);
    await expect(prisma.actionItemTagLink.findMany({
      where: { actionItemId: taskId },
      orderBy: { tagId: "asc" },
      select: { tagId: true },
    })).resolves.toEqual(first.tagIds.map((resolvedTagId) => ({ tagId: resolvedTagId })));
  });

  it("creates reusable vocabulary from an owned Session note and rejects another actor", async () => {
    const note = await prisma.coachingNote.findUniqueOrThrow({ where: { id: noteId } });
    const created = await createAndAssignWorkEntityTag({
      prisma,
      actorUserId,
      actorEmail,
      entityKind: "note",
      entityId: noteId,
      label: `Opening craft ${nonce}`,
      expectedUpdatedAt: note.updatedAt,
    });
    expect(created).toMatchObject({ ok: true, entityKind: "note", projectId, created: true, tag: { label: `Opening craft ${nonce}` } });
    const fresh = await prisma.coachingNote.findUniqueOrThrow({ where: { id: noteId } });
    const denied = await replaceWorkEntityTags({
      prisma,
      actorUserId: otherUserId,
      actorEmail,
      entityKind: "note",
      entityId: noteId,
      tagIds: [],
      expectedUpdatedAt: fresh.updatedAt,
    });
    expect(denied).toMatchObject({ ok: false, code: "NOT_FOUND" });
    await expect(prisma.coachingNoteTagLink.findUnique({
      where: { noteId_tagId: { noteId, tagId: created.ok ? created.tag.id : "unreachable" } },
    })).resolves.toBeTruthy();
  });

  it("creates reusable vocabulary on a document and rejects a non-member without writes", async () => {
    const document = await prisma.studioDocument.findUniqueOrThrow({ where: { id: documentId } });
    const created = await createAndAssignWorkEntityTag({
      prisma,
      actorUserId,
      actorEmail,
      entityKind: "document",
      entityId: documentId,
      label: `Recording day ${nonce}`,
      expectedUpdatedAt: document.updatedAt,
      expectedTagRevision: document.tagRevision,
    });
    expect(created).toMatchObject({
      ok: true,
      entityKind: "document",
      projectId,
      created: true,
      tag: { label: `Recording day ${nonce}` },
    });
    const fresh = await prisma.studioDocument.findUniqueOrThrow({ where: { id: documentId } });
    const denied = await replaceWorkEntityTags({
      prisma,
      actorUserId: otherUserId,
      actorEmail: `work-tags-other-${nonce}@example.test`,
      entityKind: "document",
      entityId: documentId,
      tagIds: [],
      expectedUpdatedAt: fresh.updatedAt,
      expectedTagRevision: fresh.tagRevision,
    });
    expect(denied).toMatchObject({ ok: false, code: "FORBIDDEN" });
    await expect(prisma.studioDocumentTagLink.findUnique({
      where: { documentId_tagId: { documentId, tagId: created.ok ? created.tag.id : "unreachable" } },
    })).resolves.toBeTruthy();
  });

  it("rejects cross-Nest tags, a different actor, and stale revisions without writes", async () => {
    const currentTask = await prisma.actionItem.findUniqueOrThrow({ where: { id: taskId } });
    const originalTagLinks = await prisma.actionItemTagLink.findMany({
      where: { actionItemId: taskId },
      orderBy: { tagId: "asc" },
      select: { tagId: true },
    });
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
    await expect(prisma.actionItemTagLink.findMany({
      where: { actionItemId: taskId },
      orderBy: { tagId: "asc" },
      select: { tagId: true },
    })).resolves.toEqual(originalTagLinks);
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

  it("retains old names as aliases across rename, archive, restore, and Capture-style reuse", async () => {
    const originalLabel = `Editorial focus ${nonce}`;
    const renamedLabel = `Episode craft ${nonce}`;
    const tag = await prisma.studioTag.create({
      data: { projectId, slug: `editorial-focus-${nonce}`, label: originalLabel },
    });

    const renamed = await mutateWorkTagTaxonomy({
      prisma,
      actorUserId,
      actorEmail,
      tagId: tag.id,
      operation: "RENAME",
      label: renamedLabel,
      expectedUpdatedAt: tag.updatedAt,
    });
    expect(renamed).toMatchObject({
      ok: true,
      operation: "RENAME",
      tag: { id: tag.id, label: renamedLabel, isActive: true },
      aliases: [{ label: originalLabel, slug: `editorial-focus-${nonce}` }],
      revision: 1,
    });

    const task = await prisma.actionItem.findUniqueOrThrow({ where: { id: taskId } });
    const reusedFromOldName = await createAndAssignWorkEntityTag({
      prisma,
      actorUserId,
      actorEmail,
      entityKind: "task",
      entityId: taskId,
      label: originalLabel,
      expectedUpdatedAt: task.updatedAt,
    });
    expect(reusedFromOldName).toMatchObject({ ok: true, created: false, tag: { id: tag.id, label: renamedLabel } });

    if (!renamed.ok) throw new Error("rename setup failed");
    const archived = await mutateWorkTagTaxonomy({
      prisma,
      actorUserId,
      actorEmail,
      tagId: tag.id,
      operation: "ARCHIVE",
      expectedUpdatedAt: renamed.tag.updatedAt,
    });
    expect(archived).toMatchObject({ ok: true, operation: "ARCHIVE", tag: { isActive: false }, revision: 2 });

    const goal = await prisma.goal.findUniqueOrThrow({ where: { id: goalId } });
    const archivedAliasAttempt = await createAndAssignWorkEntityTag({
      prisma,
      actorUserId,
      actorEmail,
      entityKind: "goal",
      entityId: goalId,
      label: originalLabel,
      expectedUpdatedAt: goal.updatedAt,
    });
    expect(archivedAliasAttempt).toMatchObject({ ok: false, code: "ARCHIVED" });

    if (!archived.ok) throw new Error("archive setup failed");
    const restored = await mutateWorkTagTaxonomy({
      prisma,
      actorUserId,
      actorEmail,
      tagId: tag.id,
      operation: "RESTORE",
      expectedUpdatedAt: archived.tag.updatedAt,
    });
    expect(restored).toMatchObject({ ok: true, operation: "RESTORE", tag: { isActive: true }, revision: 3 });

    const room = await prisma.callRoom.findUniqueOrThrow({ where: { id: roomId } });
    const reusedAfterRestore = await createAndAssignWorkEntityTag({
      prisma,
      actorUserId,
      actorEmail,
      entityKind: "session",
      entityId: roomId,
      label: originalLabel,
      expectedUpdatedAt: room.updatedAt,
    });
    expect(reusedAfterRestore).toMatchObject({ ok: true, created: false, tag: { id: tag.id, label: renamedLabel } });
    await expect(prisma.studioTagRevision.findMany({ where: { tagId: tag.id }, orderBy: { revision: "asc" }, select: { revision: true, operation: true } }))
      .resolves.toEqual([
        { revision: 1, operation: "rename" },
        { revision: 2, operation: "archive" },
        { revision: 3, operation: "restore" },
      ]);
  });
});
