/** @jest-environment node */
jest.mock("@/auth", () => ({ auth: jest.fn() }));
import { randomUUID } from "node:crypto";
import { getPrismaClient } from "@/lib/prisma";
import { createAndAssignWorkEntityTag, replaceWorkEntityTags } from "./work-tags";

const enabled = process.env.QUIPSLY_LOCAL_DB_SMOKE === "1";
if (enabled) {
  const url = new URL(process.env.QUIPSLY_LOCAL_DATABASE_URL || "invalid:");
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) throw new Error("Shared goal tests require a loopback database.");
  process.env.DATABASE_URL = url.toString();
}

(enabled ? describe : describe.skip)("shared goal tag editing", () => {
  const prisma = getPrismaClient();
  const nonce = randomUUID();
  const id = (name: string) => `goal-tags-${nonce}-${name}`;
  const email = (name: string) => `${id(name)}@example.test`;
  const users = ["coach", "client", "observer", "outsider"];
  beforeAll(async () => {
    await prisma.user.createMany({ data: users.map(name => ({ id: id(name), primaryEmail: email(name) })) });
    await prisma.studioWorkspace.create({ data: { id: id("workspace"), slug: id("workspace"), name: "Tag collaboration QA" } });
    await prisma.studioProject.create({ data: { id: id("project"), workspaceId: id("workspace"), slug: id("project"), name: "Tag collaboration QA" } });
    // Everyone can edit the Nest vocabulary. That must not grant access to
    // other people's personal goals or a private client relationship.
    await prisma.studioProjectAccessGrant.createMany({ data: users.map(name => ({ projectId: id("project"),
      email: email(name), memberUserId: id(name), role: "EDITOR" })) });
    await prisma.coachingEngagement.create({ data: { id: id("engagement"), projectId: id("project"), title: "Shared coaching",
      primaryCoachUserId: id("coach"), primaryClientUserId: id("client"),
      members: { create: [{ userId: id("coach"), role: "COACH" }, { userId: id("client"), role: "CLIENT" }, { userId: id("observer"), role: "OBSERVER" }] } } });
    await prisma.coachingBooking.create({ data: { id: id("booking"), engagementId: id("engagement"),
      coachUserId: id("coach"), clientUserId: id("client"),
      scheduledStart: new Date("2026-09-12T10:00:00Z"), scheduledEnd: new Date("2026-09-12T11:00:00Z") } });
    await prisma.studioTag.create({ data: { id: id("tag"), projectId: id("project"), slug: "research", label: "Research", hexColor: "#506b46" } });
  });
  afterAll(async () => {
    await prisma.goal.deleteMany({ where: { projectId: id("project") } });
    await prisma.coachingBooking.deleteMany({ where: { id: id("booking") } });
    await prisma.coachingEngagement.deleteMany({ where: { id: id("engagement") } });
    await prisma.studioProject.deleteMany({ where: { id: id("project") } });
    await prisma.studioWorkspace.deleteMany({ where: { id: id("workspace") } });
    await prisma.user.deleteMany({ where: { id: { in: users.map(id) } } });
    await prisma.$disconnect();
  });
  it.each(["engagement", "booking"])("allows collaborators to tag %s goals, with current membership, retries, and private isolation", async scope => {
    const context = scope === "engagement" ? { engagementId: id("engagement") } : { bookingId: id("booking") };
    const goal = await prisma.goal.create({ data: { ...context, projectId: id("project"), ownerUserId: id("coach"),
      title: "Prepare together", sourceJson: { visibility: "SESSION_SHARED" } } });
    const privateGoal = await prisma.goal.create({ data: { ...context, projectId: id("project"), ownerUserId: id("coach"),
      title: "Private preparation", sourceJson: { visibility: "AUTHOR_PRIVATE" } } });
    const command = { prisma, actorUserId: id("client"), actorEmail: email("client"), entityKind: "goal" as const,
      entityId: goal.id, expectedUpdatedAt: goal.updatedAt, tagIds: [id("tag")], clientRequestId: randomUUID() };
    for (const actor of ["observer", "outsider"]) {
      expect(await replaceWorkEntityTags({ ...command, actorUserId: id(actor), actorEmail: email(actor) }))
        .toMatchObject({ ok: false, code: "NOT_FOUND" });
    }
    expect(await replaceWorkEntityTags({ ...command, entityId: privateGoal.id, expectedUpdatedAt: privateGoal.updatedAt }))
      .toMatchObject({ ok: false, code: "NOT_FOUND" });
    const saved = await replaceWorkEntityTags(command);
    expect(saved).toMatchObject({ ok: true, tagIds: [id("tag")], idempotentReplay: false });
    expect(await replaceWorkEntityTags(command)).toMatchObject({ ok: true, tagIds: [id("tag")], idempotentReplay: true });
    const readback = await prisma.goal.findUniqueOrThrow({ where: { id: goal.id }, include: { tagLinks: { include: { tag: true } } } });
    expect(readback.ownerUserId).toBe(id("coach"));
    expect(readback.sourceJson).toMatchObject({ visibility: "SESSION_SHARED" });
    expect(readback.tagLinks[0]?.tag.hexColor).toBe("#506b46");
    expect(await replaceWorkEntityTags({ ...command, clientRequestId: randomUUID(), tagIds: [] })).toMatchObject({ ok: false, code: "CONFLICT" });
    const created = await createAndAssignWorkEntityTag({ ...command, expectedUpdatedAt: readback.updatedAt, label: `Next steps ${scope}` });
    expect(created).toMatchObject({ ok: true, assignmentChanged: true });
    await prisma.coachingEngagementMember.update({ where: { engagementId_userId: { engagementId: id("engagement"), userId: id("client") } }, data: { status: "REMOVED" } });
    try {
      expect(await replaceWorkEntityTags(command)).toMatchObject({ ok: false, code: "NOT_FOUND" });
      expect(await createAndAssignWorkEntityTag({ ...command, expectedUpdatedAt: readback.updatedAt, label: "Must not create" }))
        .toMatchObject({ ok: false, code: "NOT_FOUND" });
      expect(await prisma.studioTag.count({ where: { projectId: id("project"), label: "Must not create" } })).toBe(0);
      expect(await prisma.goalTagLink.count({ where: { goalId: privateGoal.id } })).toBe(0);
    } finally {
      await prisma.coachingEngagementMember.update({ where: { engagementId_userId: { engagementId: id("engagement"), userId: id("client") } }, data: { status: "ACTIVE" } });
    }
  });
});
