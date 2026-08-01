/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import { loadCalendarOverviewForActor } from "@/lib/server/calendar-overview";
import { listProjectsVisibleToEmail } from "@/lib/server/home-nest";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

import { GET } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/calendar-overview", () => ({ loadCalendarOverviewForActor: jest.fn() }));
jest.mock("@/lib/server/home-nest", () => ({ listProjectsVisibleToEmail: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));

describe("GET /api/calendar/overview", () => {
  beforeEach(() => jest.clearAllMocks());

  it("rejects unauthenticated reads before touching calendar data", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null);

    const response = await GET(new Request("https://nest.quipsly.com/api/calendar/overview"));

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(getPrismaClient).not.toHaveBeenCalled();
    expect(loadCalendarOverviewForActor).not.toHaveBeenCalled();
  });

  it("returns only the authorized actor overview and forbids shared caching", async () => {
    const prisma = {} as never;
    const overview = { providerSecretsExposed: false, externalWritesEnabled: false } as never;
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: { id: "user-1", primaryEmail: "person@example.com" },
    } as never);
    jest.mocked(getPrismaClient).mockReturnValue(prisma);
    jest.mocked(listProjectsVisibleToEmail).mockResolvedValue([
      { id: "project-1" },
    ] as never);
    jest.mocked(loadCalendarOverviewForActor).mockResolvedValue(overview);

    const response = await GET(new Request("https://nest.quipsly.com/api/calendar/overview"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toBe("Authorization, Cookie");
    expect(loadCalendarOverviewForActor).toHaveBeenCalledWith({
      actor: { id: "user-1" },
      visibleProjectIds: ["project-1"],
      prisma,
    });
    expect(payload).toEqual({ ok: true, overview });
  });

  it("fails closed without returning provider or database error details", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: { id: "user-1", primaryEmail: "person@example.com" },
    } as never);
    jest.mocked(getPrismaClient).mockReturnValue({} as never);
    jest.mocked(listProjectsVisibleToEmail).mockRejectedValue(new Error("secret provider failure"));

    const response = await GET(new Request("https://nest.quipsly.com/api/calendar/overview"));
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toEqual({ ok: false, error: "Calendar readiness is temporarily unavailable." });
    expect(JSON.stringify(payload)).not.toContain("secret provider failure");
  });
});
