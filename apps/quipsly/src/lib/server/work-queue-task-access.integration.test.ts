/** @jest-environment node */
import { randomUUID } from "node:crypto";
import { getPrismaClient } from "@/lib/prisma";
import { workQueueTaskWhere, readEditableWorkQueueTaskIds } from "./work-queue-task-access";
import { editCanonicalTaskInTransaction } from "./canonical-task-edit";
import { personalOrSharedSessionTaskAccessWhere, personalOrSharedWorkspaceTaskAccessWhere } from "./task-access";
import { personalOrSharedCoachingGoalAccessWhere, readEditableCoachingGoalIds } from "./coaching-work-access";
import { workQueueGoalRelations, workQueueGoalWhere } from "./work-queue-goal-access";

const enabled = process.env.QUIPSLY_LOCAL_DB_SMOKE === "1";
if (enabled) {
  const url = new URL(process.env.QUIPSLY_LOCAL_DATABASE_URL || "invalid:");
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) throw new Error("Queue tests require a loopback database.");
  process.env.DATABASE_URL = url.toString();
}

(enabled ? describe : describe.skip)("work queue task capabilities", () => {
  afterAll(async () => { if (enabled) await getPrismaClient().$disconnect(); });
  it.each(["engagement", "booking", "production"])("scopes linked work, parent goals, and child counts independently in %s collaboration", async scope => {
    const rollback = new Error("rollback linked goal privacy fixture");
    try {
      await getPrismaClient().$transaction(async tx => {
        const nonce = randomUUID();
        const [coach, client, outsider] = await Promise.all(["coach", "client", "outsider"].map(name =>
          tx.user.create({ data: { name, primaryEmail: `goal-links-${name}-${nonce}@example.test` } })));
        const project = await tx.studioProject.create({ data: { slug: `goal-links-${nonce}`, name: "Linked work QA",
          workspace: { create: { slug: `goal-links-${nonce}`, name: "Linked work QA" } } } });
        const engagement = await tx.coachingEngagement.create({ data: { projectId: project.id, title: "Client relationship",
          primaryCoachUserId: coach.id, primaryClientUserId: client.id,
          members: { create: [{ userId: coach.id, role: "COACH" }, { userId: client.id, role: "CLIENT" }] } } });
        const booking = await tx.coachingBooking.create({ data: { engagementId: engagement.id,
          coachUserId: coach.id, clientUserId: client.id,
          scheduledStart: new Date("2026-09-12T10:00:00Z"), scheduledEnd: new Date("2026-09-12T11:00:00Z") } });
        const room = await tx.callRoom.create({ data: { createdByUserId: coach.id,
          participants: { create: { userId: client.id, accessStatus: "ACTIVE", role: "GUEST" } } } });
        const context = scope === "engagement" ? { engagementId: engagement.id }
          : scope === "booking" ? { bookingId: booking.id } : { roomId: room.id };
        const shared = { visibility: "SESSION_SHARED" };
        const privateSource = { visibility: "AUTHOR_PRIVATE" };
        const parent = await tx.goal.create({ data: { ...context, ownerUserId: coach.id, title: "Private coach strategy", sourceJson: privateSource } });
        const goal = await tx.goal.create({ data: { ...context, ownerUserId: coach.id, parentGoalId: parent.id,
          title: "Our shared goal", sourceJson: shared } });
        const sharedChild = await tx.goal.create({ data: { ...context, ownerUserId: coach.id, parentGoalId: goal.id,
          title: "Our next milestone", sourceJson: shared } });
        const privateChild = await tx.goal.create({ data: { ...context, ownerUserId: coach.id, parentGoalId: goal.id,
          title: "Private coach milestone", sourceJson: privateSource } });
        const clientChild = await tx.goal.create({ data: { ...context, ownerUserId: client.id, parentGoalId: goal.id,
          title: "My personal milestone", sourceJson: privateSource } });
        const privateTask = await tx.actionItem.create({ data: { ...context, assignedUserId: coach.id,
          title: "Private coach preparation", sourceJson: privateSource } });
        const sharedTask = await tx.actionItem.create({ data: { ...context,
          assignedUserId: scope === "production" ? null : coach.id, title: "Prepare together", sourceJson: shared } });
        const ownTask = await tx.actionItem.create({ data: { assignedUserId: client.id, title: "Personal follow-up" } });
        const foreignTask = await tx.actionItem.create({ data: { assignedUserId: outsider.id, title: "Unrelated private work" } });
        await tx.goalTaskLink.createMany({ data: [privateTask, sharedTask, ownTask, foreignTask].map(task => ({ goalId: goal.id, actionItemId: task.id })) });
        await tx.goalTaskLink.create({ data: { goalId: clientChild.id, actionItemId: sharedTask.id } });
        const read = (actorId: string, goalId = goal.id) => tx.goal.findFirst({
          where: { id: goalId, AND: [workQueueGoalWhere(actorId)] },
          select: { id: true, title: true, ...workQueueGoalRelations(actorId) },
        });
        const clientView = await read(client.id);
        expect(clientView?.parent).toBeNull();
        expect(clientView?._count.children).toBe(2);
        expect(clientView?.taskLinks.map(link => link.actionItem.id).sort()).toEqual([sharedTask.id, ownTask.id].sort());
        expect(JSON.stringify(clientView)).not.toContain(privateTask.title);
        expect(JSON.stringify(clientView)).not.toContain(foreignTask.id);
        const coachView = await read(coach.id);
        expect(coachView?.parent).toEqual({ id: parent.id, title: parent.title });
        expect(coachView?._count.children).toBe(2);
        expect(coachView?.taskLinks.map(link => link.actionItem.id).sort()).toEqual([privateTask.id, sharedTask.id].sort());
        expect(await read(outsider.id)).toBeNull();
        expect(await read(client.id, privateChild.id)).toBeNull();
        expect(await read(client.id, sharedChild.id)).not.toBeNull();
        // Sharing the parent later makes it visible without copying or changing
        // the link. The relationship itself never changes its audience.
        await tx.goal.update({ where: { id: parent.id }, data: { sourceJson: shared } });
        expect((await read(client.id))?.parent?.id).toBe(parent.id);
        if (scope === "production") {
          await tx.callParticipant.updateMany({ where: { roomId: room.id, userId: client.id }, data: { accessStatus: "REMOVED" } });
        } else {
          await tx.coachingEngagementMember.update({ where: { engagementId_userId: { engagementId: engagement.id, userId: client.id } }, data: { status: "REMOVED" } });
        }
        expect(await read(client.id)).toBeNull();
        // The client's own goal survives removal, but no longer brings its
        // former shared parent or linked task along with it.
        expect(await read(client.id, clientChild.id)).toMatchObject({ id: clientChild.id, parent: null, taskLinks: [], _count: { children: 0 } });
        expect((await read(coach.id))?.taskLinks).toHaveLength(2);
        throw rollback;
      }, { timeout: 30_000 });
    } catch (error) { if (error !== rollback) throw error; }
  });
  it("keeps production-session assignments private and exposes editable shared tasks using the mutation policy", async () => {
    const prisma = getPrismaClient();
    const rollback = new Error("rollback synthetic queue fixture");
    try {
      await prisma.$transaction(async tx => {
        const nonce = randomUUID();
        const [host, member, outsider] = await Promise.all(["host", "member", "outsider"].map(name =>
          tx.user.create({ data: { name, primaryEmail: `queue-${name}-${nonce}@example.test` } })));
        const room = await tx.callRoom.create({ data: { title: "Production queue QA", createdByUserId: host.id,
          participants: { create: { userId: member.id, role: "GUEST", accessStatus: "ACTIVE" } } } });
        const personal = await tx.actionItem.create({ data: { roomId: room.id, assignedUserId: host.id,
          title: "Private preparation", sourceJson: { visibility: "AUTHOR_PRIVATE" } } });
        const shared = await tx.actionItem.create({ data: { roomId: room.id, title: "Prepare the shared script" } });
        const memberTask = await tx.actionItem.create({ data: { roomId: room.id, assignedUserId: member.id, title: "My preparation" } });
        const ids = [personal.id, shared.id, memberTask.id];
        const read = (userId: string) => tx.actionItem.findMany({
          where: { AND: [{ id: { in: ids } }, workQueueTaskWhere(userId)] }, select: { id: true },
        }).then(rows => rows.map(row => row.id).sort());
        // These all belong to the same room. Room membership alone must not
        // broaden the queue's canonical private/shared distinction.
        expect(await read(member.id)).toEqual([shared.id, memberTask.id].sort());
        expect(await read(host.id)).toEqual([personal.id, shared.id].sort());
        expect(await read(outsider.id)).toEqual([]);
        expect(await readEditableWorkQueueTaskIds(tx, member.id, ids)).toEqual(new Set([shared.id, memberTask.id]));
        expect(await readEditableWorkQueueTaskIds(tx, outsider.id, ids)).toEqual(new Set());
        const edit = (taskId: string, expectedUpdatedAt: Date) => editCanonicalTaskInTransaction({
          tx, taskId, actorUserId: member.id, accessOr: personalOrSharedSessionTaskAccessWhere(member.id, "write"),
          expectedUpdatedAt, title: "Prepared together", detail: null, dueAt: null, dueIntent: null, surface: "nest-work",
        });
        expect((await edit(personal.id, personal.updatedAt)).kind).toBe("not-found");
        expect((await edit(shared.id, shared.updatedAt)).kind).toBe("saved");
        expect((await tx.actionItem.findUniqueOrThrow({ where: { id: shared.id } })).title).toBe("Prepared together");
        await tx.callParticipant.updateMany({ where: { roomId: room.id, userId: member.id }, data: { accessStatus: "REMOVED" } });
        expect(await read(member.id)).toEqual([memberTask.id]);
        expect(await readEditableWorkQueueTaskIds(tx, member.id, [shared.id])).toEqual(new Set());
        throw rollback;
      }, { timeout: 30_000 });
    } catch (error) { if (error !== rollback) throw error; }
  });
  it("inherits private client-space membership through sessions and bookings, including revocation and observer roles", async () => {
    const rollback = new Error("rollback inherited task scope fixture");
    try {
      await getPrismaClient().$transaction(async tx => {
        const nonce = randomUUID();
        const [coach, client, observer, teammate, guest, outsider] = await Promise.all(
          ["coach", "client", "observer", "teammate", "guest", "outsider"].map(name =>
            tx.user.create({ data: { name, primaryEmail: `inherited-${name}-${nonce}@example.test` } })));
        const project = await tx.studioProject.create({ data: { slug: `inherited-${nonce}`, name: "Inherited scope QA",
          workspace: { create: { slug: `inherited-${nonce}`, name: "Inherited scope QA" } } } });
        await tx.studioProjectAccessGrant.create({ data: { projectId: project.id, memberUserId: teammate!.id,
          email: teammate!.primaryEmail!, role: "OWNER" } });
        const engagement = await tx.coachingEngagement.create({ data: { projectId: project.id, title: "Private client work",
          primaryCoachUserId: coach!.id, primaryClientUserId: client!.id,
          members: { create: [{ userId: coach!.id, role: "COACH" }, { userId: client!.id, role: "CLIENT" },
            { userId: observer!.id, role: "OBSERVER" }] } } });
        const booking = await tx.coachingBooking.create({ data: { engagementId: engagement.id,
          coachUserId: coach!.id, clientUserId: client!.id,
          scheduledStart: new Date("2026-09-12T10:00:00Z"), scheduledEnd: new Date("2026-09-12T11:00:00Z") } });
        const room = await tx.callRoom.create({ data: { projectId: project.id, coachingEngagementId: engagement.id,
          bookingId: booking.id, createdByUserId: coach!.id,
          participants: { create: [{ userId: client!.id, role: "CLIENT" }, { userId: guest!.id, role: "GUEST" },
            { userId: observer!.id, role: "OBSERVER" }] } } });
        const sourceJson = { visibility: "SESSION_SHARED" };
        const roomTask = await tx.actionItem.create({ data: { projectId: project.id, roomId: room.id,
          title: "Shared session preparation", sourceJson } });
        const bookingTask = await tx.actionItem.create({ data: { projectId: project.id, bookingId: booking.id,
          title: "Shared appointment preparation", sourceJson } });
        const teamTask = await tx.actionItem.create({ data: { projectId: project.id, title: "Ordinary team task" } });
        const goal = await tx.goal.create({ data: { projectId: project.id, bookingId: booking.id, ownerUserId: coach!.id,
          title: "Shared appointment goal", sourceJson } });
        const taskIds = [roomTask.id, bookingTask.id, teamTask.id];
        const read = async (userId: string, workspace = false) => (await tx.actionItem.findMany({ where: {
          id: { in: taskIds }, OR: workspace
            ? personalOrSharedWorkspaceTaskAccessWhere(userId, userId === teammate!.id ? [project.id] : [])
            : personalOrSharedSessionTaskAccessWhere(userId),
        }, select: { id: true } })).map(row => row.id).sort();
        expect(await read(teammate!.id, true)).toEqual([teamTask.id]);
        expect(await read(outsider!.id, true)).toEqual([]);
        for (const member of [coach!, client!, observer!]) {
          expect(await read(member.id)).toEqual([roomTask.id, bookingTask.id].sort());
          expect(await read(member.id, true)).toEqual([roomTask.id, bookingTask.id].sort());
          expect(await tx.goal.count({ where: { id: goal.id, OR: personalOrSharedCoachingGoalAccessWhere(member.id) } })).toBe(1);
        }
        expect(await read(guest!.id)).toEqual([roomTask.id]);
        for (const denied of [observer!, teammate!, guest!, outsider!]) {
          expect(await readEditableWorkQueueTaskIds(tx, denied.id, [roomTask.id, bookingTask.id])).toEqual(new Set());
          expect(await tx.goal.count({ where: { id: goal.id, OR: personalOrSharedCoachingGoalAccessWhere(denied.id, "write") } })).toBe(0);
          expect(await readEditableCoachingGoalIds(tx, denied.id, [goal.id])).toEqual(new Set());
        }
        expect(await readEditableWorkQueueTaskIds(tx, client!.id, taskIds)).toEqual(new Set([roomTask.id, bookingTask.id]));
        expect(await readEditableCoachingGoalIds(tx, client!.id, [goal.id])).toEqual(new Set([goal.id]));
        await tx.coachingEngagementMember.update({ where: { engagementId_userId: { engagementId: engagement.id, userId: client!.id } },
          data: { status: "REMOVED" } });
        expect(await read(client!.id)).toEqual([]);
        expect(await read(client!.id, true)).toEqual([]);
        expect(await readEditableWorkQueueTaskIds(tx, client!.id, taskIds)).toEqual(new Set());
        expect(await tx.goal.count({ where: { id: goal.id, OR: personalOrSharedCoachingGoalAccessWhere(client!.id) } })).toBe(0);
        expect(await readEditableCoachingGoalIds(tx, client!.id, [goal.id])).toEqual(new Set());
        const rejected = await editCanonicalTaskInTransaction({ tx, taskId: roomTask.id, actorUserId: client!.id,
          accessOr: personalOrSharedSessionTaskAccessWhere(client!.id, "write"), expectedUpdatedAt: roomTask.updatedAt,
          title: "Must not change after removal", detail: null, dueAt: null, dueIntent: null, surface: "nest-work" });
        expect(rejected.kind).toBe("not-found");
        expect((await tx.actionItem.findUniqueOrThrow({ where: { id: roomTask.id } })).title).toBe(roomTask.title);
        await tx.coachingEngagementMember.update({ where: { engagementId_userId: { engagementId: engagement.id, userId: client!.id } },
          data: { status: "ACTIVE" } });
        const restored = await editCanonicalTaskInTransaction({ tx, taskId: roomTask.id, actorUserId: client!.id,
          accessOr: personalOrSharedSessionTaskAccessWhere(client!.id, "write"), expectedUpdatedAt: roomTask.updatedAt,
          title: "Prepared together after rejoining", detail: null, dueAt: null, dueIntent: null, surface: "nest-work" });
        expect(restored.kind).toBe("saved");
        expect((await tx.actionItem.findUniqueOrThrow({ where: { id: roomTask.id } })).title).toBe("Prepared together after rejoining");
        const standaloneBooking = await tx.coachingBooking.create({ data: { coachUserId: coach!.id, clientUserId: client!.id,
          scheduledStart: new Date("2026-09-13T10:00:00Z"), scheduledEnd: new Date("2026-09-13T11:00:00Z") } });
        const standaloneTask = await tx.actionItem.create({ data: { bookingId: standaloneBooking.id,
          assignedUserId: coach!.id, title: "Standalone appointment task", sourceJson } });
        for (const user of [coach!, client!]) {
          expect(await readEditableWorkQueueTaskIds(tx, user.id, [standaloneTask.id])).toEqual(new Set([standaloneTask.id]));
        }
        for (const denied of [observer!, guest!, teammate!, outsider!]) {
          expect(await tx.actionItem.count({ where: { id: standaloneTask.id, OR: personalOrSharedSessionTaskAccessWhere(denied.id) } })).toBe(0);
        }
        throw rollback;
      }, { timeout: 30_000 });
    } catch (error) { if (error !== rollback) throw error; }
  });
});
