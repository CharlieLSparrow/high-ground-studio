/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import {
  createProductionMilestone,
  ProductionMilestoneOperationError,
} from "@/lib/server/production-milestone-operation";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

import { POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));
jest.mock("@/lib/server/production-milestone-operation", () => ({
  ...jest.requireActual("@/lib/server/production-milestone-operation"),
  createProductionMilestone: jest.fn(),
}));

function request(body: Record<string, unknown>) {
  return new Request("https://nest.quipsly.com/api/calendar/milestones", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Production milestone create route", () => {
  beforeEach(() => jest.clearAllMocks());

  it("rejects signed-out creation before database access", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null);
    const response = await POST(request({}));
    expect(response.status).toBe(401);
    expect(getPrismaClient).not.toHaveBeenCalled();
    expect(createProductionMilestone).not.toHaveBeenCalled();
  });

  it("returns the retained canonical milestone without claiming an external effect", async () => {
    const actor = { user: { id: "user-1", primaryEmail: "producer@example.test" } };
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(actor as never);
    jest.mocked(getPrismaClient).mockReturnValue({ marker: "prisma" } as never);
    jest.mocked(createProductionMilestone).mockResolvedValue({
      milestone: { id: "milestone-1", revision: 1 },
      episode: { id: "episode-1", title: "The Swear Jar", slug: "the-swear-jar" },
      idempotentReplay: false,
      externalSideEffects: false,
    } as never);
    const body = { episodeProductionId: "episode-1", requestId: "request-1234" };

    const response = await POST(request(body));

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      ok: true,
      result: { milestone: { id: "milestone-1", revision: 1 }, externalSideEffects: false },
    });
    expect(createProductionMilestone).toHaveBeenCalledWith({
      prisma: { marker: "prisma" },
      actor: actor.user,
      body,
    });
  });

  it("fails closed when episode edit authority is absent", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user: { id: "user-1", primaryEmail: "viewer@example.test" } } as never);
    jest.mocked(getPrismaClient).mockReturnValue({} as never);
    jest.mocked(createProductionMilestone).mockRejectedValue(new ProductionMilestoneOperationError(
      "That episode is unavailable.",
      "episode-not-found",
      404,
    ));

    const response = await POST(request({ episodeProductionId: "episode-1", requestId: "request-1234" }));

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      code: "episode-not-found",
      externalSideEffects: false,
    });
  });
});
