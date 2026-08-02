/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import {
  ProductionMilestoneOperationError,
  reviseProductionMilestone,
} from "@/lib/server/production-milestone-operation";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

import { PATCH } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));
jest.mock("@/lib/server/production-milestone-operation", () => ({
  ...jest.requireActual("@/lib/server/production-milestone-operation"),
  reviseProductionMilestone: jest.fn(),
}));

function request(body: Record<string, unknown>) {
  return new Request("https://nest.quipsly.com/api/calendar/milestones/milestone-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Production milestone lifecycle route", () => {
  beforeEach(() => jest.clearAllMocks());

  it("rejects signed-out lifecycle changes before database access", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null);
    const response = await PATCH(request({ expectedRevision: 1, status: "COMPLETED" }), {
      params: Promise.resolve({ milestoneId: "milestone-1" }),
    });
    expect(response.status).toBe(401);
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it("returns a revision-bound local lifecycle result", async () => {
    const actor = { user: { id: "user-1", primaryEmail: "producer@example.test" } };
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(actor as never);
    jest.mocked(getPrismaClient).mockReturnValue({ marker: "prisma" } as never);
    jest.mocked(reviseProductionMilestone).mockResolvedValue({
      milestone: { id: "milestone-1", status: "COMPLETED", revision: 2 },
      externalSideEffects: false,
    } as never);
    const body = { expectedRevision: 1, status: "COMPLETED" };

    const response = await PATCH(request(body), {
      params: Promise.resolve({ milestoneId: "milestone-1" }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      result: { milestone: { status: "COMPLETED", revision: 2 }, externalSideEffects: false },
    });
    expect(reviseProductionMilestone).toHaveBeenCalledWith({
      prisma: { marker: "prisma" },
      actor: actor.user,
      milestoneId: "milestone-1",
      body,
    });
  });

  it("surfaces stale revisions without any external side-effect claim", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user: { id: "user-1", primaryEmail: "producer@example.test" } } as never);
    jest.mocked(getPrismaClient).mockReturnValue({} as never);
    jest.mocked(reviseProductionMilestone).mockRejectedValue(new ProductionMilestoneOperationError(
      "The production milestone changed while you were reviewing it.",
      "production-milestone-revision-conflict",
      409,
    ));

    const response = await PATCH(request({ expectedRevision: 1, status: "COMPLETED" }), {
      params: Promise.resolve({ milestoneId: "milestone-1" }),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "production-milestone-revision-conflict",
      externalSideEffects: false,
    });
  });
});
