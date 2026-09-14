/** @jest-environment node */
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { getPrismaClient } from "@/lib/prisma";
import { searchWorkspace } from "./workspace-search";

const enabled = process.env.QUIPSLY_LOCAL_DB_SMOKE === "1";
if (enabled) {
  const url = process.env.QUIPSLY_LOCAL_DATABASE_URL;
  if (!url || !["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname)) throw new Error("Search integration tests require a loopback database.");
  process.env.DATABASE_URL = url;
}

async function withSearchFixture(check: (fixture: Awaited<ReturnType<typeof seed>>) => Promise<void>) {
  const rollback = new Error("rollback disposable search fixture");
  try {
    await getPrismaClient().$transaction(async tx => {
      await check(await seed(tx));
      throw rollback;
    }, { timeout: 30_000 });
  } catch (error) { if (error !== rollback) throw error; }
}

async function seed(tx: Prisma.TransactionClient) {
  const nonce = randomUUID();
  const names = ["coach", "client", "observer", "nestOwner", "nestEditor", "nestViewer", "guest", "outsider"] as const;
  const users = Object.fromEntries(await Promise.all(names.map(async name => [name,
    await tx.user.create({ data: { name, primaryEmail: `search-${name.toLowerCase()}-${nonce}@example.test` } }),
  ]))) as Record<typeof names[number], { id: string; primaryEmail: string }>;
  const project = await tx.studioProject.create({ data: { slug: `search-${nonce}`, name: "Search privacy fixture",
    workspace: { create: { slug: `search-${nonce}`, name: "Search fixture" } } } });
  for (const [name, role] of [["coach", "OWNER"], ["nestOwner", "OWNER"], ["nestEditor", "EDITOR"], ["nestViewer", "VIEWER"]] as const) {
    await tx.studioProjectAccessGrant.create({ data: { projectId: project.id, memberUserId: users[name].id,
      email: users[name].primaryEmail, role } });
  }
  const engagement = await tx.coachingEngagement.create({ data: { projectId: project.id, title: "Private client space",
    primaryCoachUserId: users.coach.id, primaryClientUserId: users.client.id,
    members: { create: [{ userId: users.coach.id, role: "COACH" }, { userId: users.client.id, role: "CLIENT" }, { userId: users.observer.id, role: "OBSERVER" }] } } });
  const booking = await tx.coachingBooking.create({ data: { engagementId: engagement.id,
    clientUserId: users.client.id, coachUserId: users.coach.id,
    scheduledStart: new Date("2026-09-10T10:00:00Z"), scheduledEnd: new Date("2026-09-10T11:00:00Z") } });
  const room = await tx.callRoom.create({ data: { projectId: project.id, coachingEngagementId: engagement.id,
    bookingId: booking.id, createdByUserId: users.coach.id, title: "Privacy fixture private session",
    participants: { create: [{ userId: users.client.id, role: "CLIENT" }, { userId: users.guest.id, role: "GUEST" }] } } });
  const nextRoom = await tx.callRoom.create({ data: { projectId: project.id, coachingEngagementId: engagement.id,
    createdByUserId: users.coach.id, title: "Privacy fixture next private session" } });
  const publicRoom = await tx.callRoom.create({ data: { projectId: project.id, createdByUserId: users.coach.id, title: "Privacy fixture team session" } });
  const sharedNote = await tx.coachingNote.create({ data: { roomId: room.id, engagementId: engagement.id, authorUserId: users.coach.id,
    title: "Privacy fixture shared note", body: "Client reflection", visibility: "SESSION_SHARED" } });
  const privateNote = await tx.coachingNote.create({ data: { roomId: room.id, engagementId: engagement.id, authorUserId: users.coach.id,
    title: "Privacy fixture private note", body: "Coach only", visibility: "AUTHOR_PRIVATE" } });
  const sharedGoal = await tx.goal.create({ data: { projectId: project.id, roomId: room.id, engagementId: engagement.id,
    ownerUserId: users.coach.id, title: "Privacy fixture shared goal", sourceJson: { visibility: "engagement-shared" } } });
  const privateGoal = await tx.goal.create({ data: { projectId: project.id, roomId: room.id, engagementId: engagement.id,
    ownerUserId: users.coach.id, title: "Privacy fixture private goal", sourceJson: { visibility: "AUTHOR_PRIVATE" } } });
  const sessionGoal = await tx.goal.create({ data: { projectId: project.id, roomId: room.id, ownerUserId: users.coach.id,
    title: "Privacy fixture session goal", sourceJson: { visibility: "SESSION_SHARED" } } });
  const tag = await tx.studioTag.create({ data: { projectId: project.id, slug: "reflection", label: "Reflection", hexColor: "#506b46" } });
  await tx.callRoomTagLink.createMany({ data: [room, nextRoom, publicRoom].map(row => ({ roomId: row.id, tagId: tag.id })) });
  await tx.coachingNoteTagLink.createMany({ data: [sharedNote, privateNote].map(row => ({ noteId: row.id, tagId: tag.id })) });
  await tx.goalTagLink.createMany({ data: [sharedGoal, privateGoal, sessionGoal].map(row => ({ goalId: row.id, tagId: tag.id })) });
  const read = (name: typeof names[number], exactTagId?: string) => searchWorkspace(tx, {
    actorUserId: users[name].id, actorEmail: users[name].primaryEmail, query: "Privacy fixture", exactTagId,
    visibleProjects: ["coach", "nestOwner", "nestEditor", "nestViewer"].includes(name)
      ? [{ id: project.id, name: project.name, slug: project.slug,
          role: name === "nestViewer" ? "VIEWER" : name === "nestEditor" ? "EDITOR" : "OWNER" }] : [],
  });
  return { tx, users, project, engagement, room, nextRoom, publicRoom, sharedNote, privateNote, sharedGoal, privateGoal, sessionGoal, tag, read };
}

(enabled ? describe : describe.skip)("search respects private coaching spaces", () => {
  afterAll(async () => { await getPrismaClient().$disconnect(); });
  it("lets Nest teammates find team sessions without revealing private client sessions, goals, or notes", async () => withSearchFixture(async f => {
    for (const name of ["nestOwner", "nestEditor", "nestViewer"] as const) {
      const found = await f.read(name);
      expect(found.sessions.map(row => row.id)).toEqual([f.publicRoom.id]);
      expect(found.goals).toEqual([]);
      expect(found.notes).toEqual([]);
    }
    const outsider = await f.read("outsider");
    expect(outsider.sessions).toEqual([]);
    expect(outsider.goals).toEqual([]);
    expect(outsider.notes).toEqual([]);
  }));
  it("finds a member's shared work without Nest membership and preserves private goals and notes", async () => withSearchFixture(async f => {
    for (const name of ["client", "observer"] as const) {
      const found = await f.read(name);
      expect(found.sessions.map(row => row.id).sort()).toEqual([f.room.id, f.nextRoom.id].sort());
      expect(found.goals.map(row => row.id).sort()).toEqual([f.sharedGoal.id, f.sessionGoal.id].sort());
      expect(found.notes.map(row => row.id)).toEqual([f.sharedNote.id]);
    }
    const own = await f.read("coach");
    expect(own.goals.map(row => row.id)).toContain(f.privateGoal.id);
    expect(own.notes.map(row => row.id)).toContain(f.privateNote.id);
    const guest = await f.read("guest");
    expect(guest.sessions.map(row => row.id)).toEqual([f.room.id]);
    expect(guest.goals.map(row => row.id)).toEqual([f.sessionGoal.id]);
    expect(guest.notes.map(row => row.id)).toEqual([f.sharedNote.id]);
  }));
  it("honors removal over old booking and participant records, then restores the same shared work", async () => withSearchFixture(async f => {
    const where = { engagementId_userId: { engagementId: f.engagement.id, userId: f.users.client.id } };
    await f.tx.coachingEngagementMember.update({ where, data: { status: "REMOVED" } });
    const removed = await f.read("client");
    expect(removed.sessions).toEqual([]);
    expect(removed.goals).toEqual([]);
    expect(removed.notes).toEqual([]);
    await f.tx.coachingEngagementMember.update({ where, data: { status: "ACTIVE" } });
    expect((await f.read("client")).sessions.map(row => row.id).sort()).toEqual([f.room.id, f.nextRoom.id].sort());
  }));
  it("keeps the same private-space boundary when following a shared colored tag", async () => withSearchFixture(async f => {
    for (const name of ["nestOwner", "nestEditor", "nestViewer"] as const) {
      const found = await f.read(name, f.tag.id);
      expect(found.sessions.map(row => row.id)).toEqual([f.publicRoom.id]);
      expect(found.sessions[0].tagLinks[0].tag.hexColor).toBe("#506b46");
      expect(found.goals).toEqual([]);
      expect(found.notes).toEqual([]);
    }
    const own = await f.read("coach", f.tag.id);
    expect(own.goals.map(row => row.id)).toContain(f.privateGoal.id);
    expect(own.notes.map(row => row.id)).toContain(f.privateNote.id);
    const outsider = await f.read("outsider", f.tag.id);
    expect(outsider.sessions).toEqual([]);
    expect(outsider.goals).toEqual([]);
    expect(outsider.notes).toEqual([]);
    expect(outsider.tags).toEqual([]);
  }));
  it("lets clients follow and search shared colors without disclosing the Nest or its private catalog", async () => withSearchFixture(async f => {
    await f.tx.studioTag.update({ where: { id: f.tag.id }, data: { description: "PRIVATE catalog administration" } });
    const privateTag = await f.tx.studioTag.create({ data: { projectId: f.project.id, label: "Coach strategy", slug: "coach-strategy",
      goals: { create: { goalId: f.privateGoal.id } } } });
    for (const actor of ["client", "observer"] as const) {
      const result = await f.read(actor, f.tag.id);
      expect(result.tagFocus).toMatchObject({ status: "resolved", resolvedLabel: "Reflection", project: null });
      expect(result.goals.map(goal => goal.id).sort()).toEqual([f.sharedGoal.id, f.sessionGoal.id].sort());
      expect(result.goals.every(goal => goal.project === null)).toBe(true);
      expect(result.goals[0].tagLinks[0].tag).toMatchObject({ id: f.tag.id, hexColor: "#506b46" });
      expect(result.tags).toEqual([expect.objectContaining({ id: f.tag.id, project: null, description: null, aliases: [] })]);
      expect(result.mediaClips).toEqual([]);
      expect(JSON.stringify(result)).not.toContain(f.project.name);
      expect((await f.read(actor, privateTag.id)).tagFocus?.status).toBe("not-found");
      const byName = await searchWorkspace(f.tx, { actorUserId: f.users[actor].id, query: "Reflection", visibleProjects: [] });
      expect(byName.goals.map(goal => goal.id).sort()).toEqual([f.sharedGoal.id, f.sessionGoal.id].sort());
      expect(byName.tags.map(tag => tag.id)).toEqual([f.tag.id]);
      const byPrivateMetadata = await searchWorkspace(f.tx, { actorUserId: f.users[actor].id, query: "catalog administration", visibleProjects: [] });
      expect(byPrivateMetadata.tags).toEqual([]);
      expect(byPrivateMetadata.goals).toEqual([]);
    }
    await f.tx.coachingEngagementMember.update({ where: { engagementId_userId: { engagementId: f.engagement.id, userId: f.users.client.id } }, data: { status: "REMOVED" } });
    expect((await f.read("client", f.tag.id)).tagFocus?.status).toBe("not-found");
  }));

  it("finds shared tasks by their colors without exposing private tasks or tag administration", async () => withSearchFixture(async f => {
    await f.tx.studioTag.update({ where: { id: f.tag.id }, data: { description: "Private catalog metadata" } });
    const sharedTask = await f.tx.actionItem.create({ data: { projectId: f.project.id, engagementId: f.engagement.id,
      assignedUserId: f.users.coach.id, title: "Collect three ideas", sourceJson: { visibility: "engagement-shared" },
      tagLinks: { create: { tagId: f.tag.id } } } });
    await f.tx.actionItem.create({ data: { projectId: f.project.id, engagementId: f.engagement.id,
      assignedUserId: f.users.coach.id, title: "Private planning", sourceJson: { visibility: "AUTHOR_PRIVATE" },
      tagLinks: { create: { tagId: f.tag.id } } } });
    const read = (actor: keyof typeof f.users, query: string) => searchWorkspace(f.tx, {
      actorUserId: f.users[actor].id, query, visibleProjects: [],
    });
    for (const actor of ["client", "observer"] as const) {
      const result = await read(actor, "Reflection");
      expect(result.tasks.map(task => task.id)).toEqual([sharedTask.id]);
      expect(result.tasks[0]).toMatchObject({ project: null, tagLinks: [{ tag: { id: f.tag.id, hexColor: "#506b46" } }] });
      expect(JSON.stringify(result)).not.toContain("Private catalog metadata");
      expect((await read(actor, "catalog metadata")).tasks).toEqual([]);
    }
    for (const actor of ["nestOwner", "guest", "outsider"] as const) {
      expect((await read(actor, "Reflection")).tasks).toEqual([]);
    }
    await f.tx.coachingEngagementMember.update({ where: { engagementId_userId: { engagementId: f.engagement.id, userId: f.users.client.id } }, data: { status: "REMOVED" } });
    expect((await read("client", "Reflection")).tasks).toEqual([]);
  }));

  it("still finds attached work beyond the bounded tag lookup", async () => withSearchFixture(async f => {
    const data = Array.from({ length: 501 }, (_, index) => ({ id: `${f.tag.id}-bulk-${index}`, projectId: f.project.id,
      slug: `overflow-${index}`, label: `Overflow label ${index}` }));
    await f.tx.studioTag.createMany({ data });
    await f.tx.callRoomTagLink.create({ data: { roomId: f.publicRoom.id, tagId: data[500].id } });
    const result = await searchWorkspace(f.tx, { actorUserId: f.users.coach.id, query: "Overflow label",
      visibleProjects: [{ id: f.project.id, slug: f.project.slug, name: f.project.name, role: "OWNER" }] });
    expect(result.sessions.map(room => room.id)).toEqual([f.publicRoom.id]);
    expect(result.tags).toHaveLength(10);
  }));
});
