/** @jest-environment node */
import { randomUUID } from "node:crypto";
import { getPrismaClient } from "@/lib/prisma";
import { loadSessionWork } from "./session-work";
import { editCanonicalTaskInTransaction } from "./canonical-task-edit";
import { personalOrSharedSessionTaskAccessWhere } from "./task-access";
import { editCanonicalGoalInTransaction } from "./canonical-goal-edit";
import { personalOrSharedCoachingGoalAccessWhere, coachingTaskCollaborationAccessWhere } from "./coaching-work-access";

const enabled = process.env.QUIPSLY_LOCAL_DB_SMOKE === "1";
if (enabled) {
  const url = new URL(process.env.QUIPSLY_LOCAL_DATABASE_URL || "invalid:");
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) throw new Error("Session work tests require a loopback database.");
  process.env.DATABASE_URL = url.toString();
}

(enabled ? describe : describe.skip)("shared session work with real database authorization", () => {
  afterAll(async () => { if (enabled) await getPrismaClient().$disconnect(); });
  it("unifies generated and manual work, preserves privacy, and supports collaborative edits", async () => {
    const prisma = getPrismaClient();
    const rollback = new Error("rollback synthetic session work fixture");
    try {
      await prisma.$transaction(async (tx) => {
        const nonce = randomUUID();
        const users = await Promise.all(["coach", "client", "observer", "guest", "outsider"].map((name) =>
          tx.user.create({data: {name, primaryEmail: `session-work-${name}-${nonce}@example.test`}})));
        const [coach, client, observer, guest, outsider] = users;
        const project = await tx.studioProject.create({data: {
          slug: `session-work-${nonce}`, name: "Session work test",
          workspace: {create: {slug: `session-work-${nonce}`, name: "Test"}},
        }});
        const engagement = await tx.coachingEngagement.create({data: {
          projectId: project.id, title: "Private client space", primaryCoachUserId: coach!.id, primaryClientUserId: client!.id,
          members: {create: [
            {userId: coach!.id, role: "COACH"}, {userId: client!.id, role: "CLIENT"}, {userId: observer!.id, role: "OBSERVER"},
          ]},
        }});
        const room = await tx.callRoom.create({data: {projectId: project.id, coachingEngagementId: engagement.id,
          createdByUserId: coach!.id, title: "Session work fixture", participants: {create: {userId: guest!.id, role: "GUEST"}},
        }});
        const sharedSource = {origin: "quipsly-session-follow-through", visibility: "engagement-shared", roomId: room.id,
          recordingAssetId: "synthetic-recording", sourceStartSeconds: 12, programStartSeconds: 312};
        const generated = await tx.actionItem.create({data: {roomId: room.id, engagementId: engagement.id, assignedUserId: coach!.id,
          title: "Generated commitment", sourceJson: sharedSource}});
        const generatedGoal = await tx.goal.create({data: {roomId: room.id, engagementId: engagement.id, ownerUserId: coach!.id,
          title: "Generated goal", sourceJson: sharedSource}});
        const tag = await tx.studioTag.create({data: {projectId: project.id, slug: "research", label: "Research", hexColor: "#23543a"}});
        await tx.actionItemTagLink.create({data: {actionItemId: generated.id, tagId: tag.id}});
        await tx.goalTagLink.create({data: {goalId: generatedGoal.id, tagId: tag.id}});
        await tx.actionItem.create({data: {roomId: room.id, assignedUserId: coach!.id,
          title: "Manual shared task", sourceJson: {schema: "quipsly-session-work-entry-v1", visibility: "SESSION_SHARED"}}});
        const privateTask = await tx.actionItem.create({data: {roomId: room.id, engagementId: engagement.id, assignedUserId: coach!.id,
          title: "Coach private task", sourceJson: {visibility: "AUTHOR_PRIVATE"}}});
        const privateGoal = await tx.goal.create({data: {roomId: room.id, engagementId: engagement.id, ownerUserId: coach!.id,
          title: "Coach private goal", sourceJson: {visibility: "AUTHOR_PRIVATE"}}});
        await tx.actionItem.create({data: {roomId: room.id, engagementId: engagement.id, assignedUserId: coach!.id,
          title: "Removed work", sourceJson: {...sharedSource, relationshipWorkRemoval: {active: true}}}});
        const otherRoom = await tx.callRoom.create({data: {coachingEngagementId: engagement.id, createdByUserId: coach!.id}});
        await tx.actionItem.create({data: {roomId: otherRoom.id, engagementId: engagement.id, assignedUserId: coach!.id,
          title: "Other session task", sourceJson: {...sharedSource, roomId: otherRoom.id}}});
        const read = (user: typeof users[number]) => loadSessionWork({prisma: tx, roomId: room.id, actor: {id: user.id, primaryEmail: user.primaryEmail}});
        const clientWork = await read(client!);
        expect(clientWork.map((entry) => entry.title).sort()).toEqual(["Generated commitment", "Generated goal", "Manual shared task"]);
        expect(clientWork.find((entry) => entry.id === generated.id)).toMatchObject({canEdit: true, ownerLabel: "coach", fromTranscript: true});
        for (const id of [generated.id, generatedGoal.id]) {
          expect(clientWork.find((entry) => entry.id === id)?.tags)
            .toEqual([{id: tag.id, label: "Research", slug: "research", hexColor: "#23543a"}]);
        }
        expect(clientWork.find((entry) => entry.id === generated.id)?.sourceHref).toBe(`/sessions/${room.id}?mode=transcript&source=synthetic-recording&at=12`);
        expect((await read(observer!)).every((entry) => !entry.canEdit)).toBe(true);
        expect((await read(guest!)).map((entry) => entry.title)).toEqual(["Manual shared task"]);
        expect(await read(outsider!)).toEqual([]);
        expect((await read(coach!)).some((entry) => entry.title === "Coach private task")).toBe(true);
        const privateWrite = await editCanonicalTaskInTransaction({tx, taskId: privateTask.id, actorUserId: client!.id,
          accessOr: personalOrSharedSessionTaskAccessWhere(client!.id, "write"), expectedUpdatedAt: privateTask.updatedAt,
          title: "Client must not change coach-private work", detail: null, dueAt: null, dueIntent: null, surface: "nest-work"});
        expect(privateWrite.kind).toBe("not-found");
        const privateGoalWrite = await editCanonicalGoalInTransaction({tx, goalId: privateGoal.id, actorUserId: client!.id,
          accessOr: personalOrSharedCoachingGoalAccessWhere(client!.id, "write"), expectedUpdatedAt: privateGoal.updatedAt,
          title: "Client must not change coach-private goal", description: null, targetDecision: {kind: "KEEP"}, surface: "nest-work"});
        expect(privateGoalWrite.kind).toBe("not-found");
        // Test the canonical policy directly, not just the narrower UI projection.
        for (const access of ["read", "write"] as const) {
          expect(await tx.actionItem.count({where: {id: privateTask.id, OR: personalOrSharedSessionTaskAccessWhere(client!.id, access)}})).toBe(0);
          expect(await tx.goal.count({where: {id: privateGoal.id, OR: personalOrSharedCoachingGoalAccessWhere(client!.id, access)}})).toBe(0);
          expect(await tx.actionItem.count({where: {id: privateTask.id, OR: personalOrSharedSessionTaskAccessWhere(coach!.id, access)}})).toBe(1);
          expect(await tx.goal.count({where: {id: privateGoal.id, OR: personalOrSharedCoachingGoalAccessWhere(coach!.id, access)}})).toBe(1);
        }
        const goalEdit = await editCanonicalGoalInTransaction({tx, goalId: generatedGoal.id, actorUserId: client!.id,
          accessOr: personalOrSharedCoachingGoalAccessWhere(client!.id, "write"), expectedUpdatedAt: generatedGoal.updatedAt,
          title: "Together we clarified this goal", description: "Shared goal remains editable", targetDecision: {kind: "KEEP"}, surface: "nest-work"});
        expect(goalEdit.kind).toBe("saved");
        expect((await read(coach!)).find((entry) => entry.id === generatedGoal.id)?.title).toBe("Together we clarified this goal");
        const edited = await editCanonicalTaskInTransaction({tx, taskId: generated.id, actorUserId: client!.id,
          accessOr: personalOrSharedSessionTaskAccessWhere(client!.id, "write"), expectedUpdatedAt: generated.updatedAt,
          title: "Together we clarified this task", detail: "Same canonical record", dueAt: null, dueIntent: null, surface: "nest-work"});
        expect(edited.kind).toBe("saved");
        expect((await read(coach!)).find((entry) => entry.id === generated.id)?.title).toBe("Together we clarified this task");
        for (const denied of [observer!, guest!, outsider!]) {
          const rejected = await editCanonicalTaskInTransaction({tx, taskId: generated.id, actorUserId: denied.id,
            accessOr: personalOrSharedSessionTaskAccessWhere(denied.id, "write"), expectedUpdatedAt: generated.updatedAt,
            title: "Unauthorized change", detail: null, dueAt: null, dueIntent: null, surface: "nest-work"});
          expect(rejected.kind).toBe("not-found");
        }
        for (const visibility of [undefined, "engagement-shared", "SESSION_SHARED", "SHARED", "AUTHOR_PRIVATE", "author-private", "PRIVATE", "private", "unknown"]) {
          const task = await tx.actionItem.create({data: {engagementId: engagement.id, assignedUserId: coach!.id,
            title: "Visibility policy fixture", sourceJson: visibility ? {visibility} : {}}});
          const readable = await tx.actionItem.count({where: {id: task.id, OR: coachingTaskCollaborationAccessWhere(client!.id)}});
          expect({visibility, readable}).toEqual({visibility, readable: !visibility || ["engagement-shared", "SESSION_SHARED", "SHARED"].includes(visibility) ? 1 : 0});
        }
        await tx.coachingEngagementMember.update({where: {engagementId_userId: {engagementId: engagement.id, userId: client!.id}}, data: {status: "REMOVED"}});
        expect(await read(client!)).toEqual([]);
        throw rollback;
      }, {timeout: 30_000});
    } catch (error) { if (error !== rollback) throw error; }
  });
});
