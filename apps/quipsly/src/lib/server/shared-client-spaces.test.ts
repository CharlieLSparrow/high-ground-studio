/** @jest-environment node */
jest.mock("server-only", () => ({}));
import { listSharedClientSpaces } from "./shared-client-spaces";

test("uses stable membership and does not query a missing actor", async () => {
  const prisma = { coachingEngagement: { findMany: jest.fn().mockResolvedValue([]) } };
  expect(await listSharedClientSpaces(prisma as never, " ")).toEqual({ spaces: [], hasMore: false });
  expect(prisma.coachingEngagement.findMany).not.toHaveBeenCalled();
  await listSharedClientSpaces(prisma as never, "client-id");
  expect(prisma.coachingEngagement.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { status: "ACTIVE", AND: [{ OR: [{ members: { some: { userId: "client-id", status: "ACTIVE" } } }] }] },
  }));
});

test("offers the full list beyond six spaces without disclosing the parent Nest or emails", async () => {
  const prisma = { coachingEngagement: { findMany: jest.fn().mockResolvedValue(Array.from({ length: 7 }, (_, index) => ({
    id: `space-${index}`, title: `Coaching ${index}`, members: [{ role: "COACH", user: { name: "Morgan" } }],
  }))) } };
  const result = await listSharedClientSpaces(prisma as never, "client-id");
  expect(result.spaces).toHaveLength(6);
  expect(result.hasMore).toBe(true);
  expect(result.spaces[0]).toEqual({ id: "space-0", title: "Coaching 0", people: ["Morgan"], href: "/coaching/engagements/space-0" });
  const selection = prisma.coachingEngagement.findMany.mock.calls[0][0].select;
  expect(selection.project).toBeUndefined();
  expect(selection.members.select.user.select).toEqual({ name: true });
});
