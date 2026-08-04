import {
  coachingEngagementActorAccessWhere,
  ensureCoachingEngagement,
} from "./coaching-engagement";

describe("coaching engagement boundary", () => {
  it("lets an active client read without granting project access", () => {
    expect(coachingEngagementActorAccessWhere({ id: "client-1", primaryEmail: "client@example.test" }, "read")).toEqual({
      OR: expect.arrayContaining([
        { members: { some: { userId: "client-1", status: "ACTIVE" } } },
      ]),
    });
  });

  it("reserves membership management for coaches and support collaborators", () => {
    expect(coachingEngagementActorAccessWhere({ id: "client-1" }, "manage")).toEqual({
      OR: [{ members: { some: { userId: "client-1", status: "ACTIVE", role: { in: ["COACH", "SUPPORT"] } } } }],
    });
  });

  it("does not let an observer write", () => {
    expect(coachingEngagementActorAccessWhere({ id: "observer-1" }, "write")).toEqual({
      OR: expect.arrayContaining([
        { members: { some: { userId: "observer-1", status: "ACTIVE", role: { in: ["CLIENT", "COACH", "SUPPORT"] } } } },
      ]),
    });
  });

  it("refuses to guess between duplicate active engagements", async () => {
    const prisma = {
      coachingEngagement: {
        findMany: jest.fn().mockResolvedValue([{ id: "one" }, { id: "two" }]),
      },
    } as never;
    await expect(ensureCoachingEngagement({
      prisma,
      projectId: "project-1",
      actorUserId: "coach-1",
      clientUserId: "client-1",
      coachUserId: "coach-1",
    })).rejects.toMatchObject({ code: "AMBIGUOUS", status: 409 });
  });

  it("creates the canonical boundary and activates both people", async () => {
    const prisma = {
      coachingEngagement: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: "engagement-1", projectId: "project-1", title: "Client coaching" }),
      },
      coachingEngagementMember: { upsert: jest.fn().mockResolvedValue({}) },
    } as never;
    const result = await ensureCoachingEngagement({
      prisma,
      projectId: "project-1",
      actorUserId: "coach-1",
      clientUserId: "client-1",
      coachUserId: "coach-1",
      clientLabel: "Client",
    });
    expect(result.id).toBe("engagement-1");
    expect((prisma as any).coachingEngagementMember.upsert).toHaveBeenCalledTimes(2);
  });
});
