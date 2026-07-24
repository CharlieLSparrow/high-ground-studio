/** @jest-environment node */

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/native-session-context", () => ({
  buildNativeSessionContext: jest.fn(),
}));

import { getPrismaClient } from "@/lib/prisma";
import { buildNativeSessionContext } from "@/lib/server/native-session-context";

import { GET } from "./route";

const mockedPrisma = jest.mocked(getPrismaClient);
const mockedNativeContext = jest.mocked(buildNativeSessionContext);

describe("native mobile context", () => {
  const findMany = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockedPrisma.mockReturnValue({
      studioProjectAccessGrant: { findMany },
    } as never);
    mockedNativeContext.mockResolvedValue({
      user: {
        id: "user-1",
        name: "Quipsly Tester",
        primaryEmail: "tester@example.test",
      },
      homeNest: {
        id: "home-project",
        slug: "home-tester-at-example-test",
        name: "Quipsly Tester Home",
      },
      projects: [
        {
          id: "home-project",
          slug: "home-tester-at-example-test",
          name: "Quipsly Tester Home",
          sourceLabel: "nest-kind:home",
          role: "OWNER",
          updatedAt: "2026-07-24T00:00:00.000Z",
        },
      ],
    } as never);
  });

  it("returns the same canonical Home Nest and projects as session-check", async () => {
    findMany.mockResolvedValue([
      {
        role: "OWNER",
        project: {
          id: "home-project",
          slug: "home-tester-at-example-test",
          name: "Quipsly Tester Home",
          sourceLabel: "nest-kind:home",
          workspace: {
            id: "workspace-1",
            slug: "personal",
            name: "Personal",
          },
          episodeProductions: [],
        },
      },
    ]);

    const response = await GET(
      new Request("http://localhost/api/mac/mobile-context") as never,
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      user: {
        id: "user-1",
        email: "tester@example.test",
      },
      homeNest: {
        id: "home-project",
        slug: "home-tester-at-example-test",
      },
      projects: [
        {
          id: "home-project",
          slug: "home-tester-at-example-test",
          role: "OWNER",
        },
      ],
      workspaces: [
        {
          id: "workspace-1",
          projects: [
            {
              id: "home-project",
              role: "OWNER",
              sourceLabel: "nest-kind:home",
            },
          ],
        },
      ],
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          email: "tester@example.test",
          status: "ACTIVE",
        },
      }),
    );
  });

  it("rejects a missing or invalid bearer session before database access", async () => {
    mockedNativeContext.mockRejectedValue(new Error("Unauthorized"));

    const response = await GET(
      new Request("http://localhost/api/mac/mobile-context") as never,
    );

    expect(response.status).toBe(401);
    expect(mockedPrisma).not.toHaveBeenCalled();
  });
});
