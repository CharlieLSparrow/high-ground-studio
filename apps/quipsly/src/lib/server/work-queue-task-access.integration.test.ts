/** @jest-environment node */
import { randomUUID } from "node:crypto";
import { getPrismaClient } from "@/lib/prisma";
import { workQueueTaskWhere, readEditableWorkQueueTaskIds } from "./work-queue-task-access";
import { editCanonicalTaskInTransaction } from "./canonical-task-edit";
import { personalOrSharedSessionTaskAccessWhere } from "./task-access";

const enabled = process.env.QUIPSLY_LOCAL_DB_SMOKE === "1";
if (enabled) {
  const url = new URL(process.env.QUIPSLY_LOCAL_DATABASE_URL || "invalid:");
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) throw new Error("Queue tests require a loopback database.");
  process.env.DATABASE_URL = url.toString();
}

(enabled ? describe : describe.skip)("work queue task capabilities", () => {
  afterAll(async () => { if (enabled) await getPrismaClient().$disconnect(); });
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
});
