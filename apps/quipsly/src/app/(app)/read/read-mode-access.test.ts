/** @jest-environment node */

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/home-nest", () => ({
  getCurrentHomeNestActorEmail: jest.fn(),
}));
jest.mock("@/lib/server/studio-project-access", () => ({
  resolveStudioProjectAccess: jest.fn(),
}));

import { getPrismaClient } from "@/lib/prisma";
import { getCurrentHomeNestActorEmail } from "@/lib/server/home-nest";
import { resolveStudioProjectAccess } from "@/lib/server/studio-project-access";

import { fetchEpisodeContext } from "./read-page";

describe("authorized Read mode loading", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getCurrentHomeNestActorEmail).mockResolvedValue("reader@example.com");
  });

  it("does not query an episode when the actor lacks Nest access", async () => {
    const findFirst = jest.fn();
    jest.mocked(getPrismaClient).mockReturnValue({
      studioEpisodeProduction: { findFirst },
    } as never);
    jest.mocked(resolveStudioProjectAccess).mockResolvedValue({
      allowed: false,
      role: null,
      source: "none",
      projectId: "private-project",
      projectSlug: "private-nest",
    });

    await expect(fetchEpisodeContext("private-nest", "episode-1")).resolves.toEqual({
      state: "not-found",
    });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("scopes the episode query to the authorized project and returns persisted blocks only", async () => {
    const findFirst = jest.fn().mockResolvedValue({
      title: "Episode 5",
      project: { name: "High Ground Odyssey" },
      document: {
        blocks: [
          { stableId: "heading-1", title: "Opening", body: "" },
          { stableId: "body-1", title: null, body: "Real manuscript text." },
        ],
      },
    });
    jest.mocked(getPrismaClient).mockReturnValue({
      studioEpisodeProduction: { findFirst },
    } as never);
    jest.mocked(resolveStudioProjectAccess).mockResolvedValue({
      allowed: true,
      role: "VIEWER",
      source: "grant",
      projectId: "authorized-project",
      projectSlug: "high-ground-odyssey",
    });

    const result = await fetchEpisodeContext("high-ground-odyssey", "episode-5");

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          projectId: "authorized-project",
          slug: "episode-5",
        },
      }),
    );
    expect(result).toMatchObject({
      state: "ready",
      accessRole: "VIEWER",
      blocks: [
        { id: "heading-1", type: "heading", content: "Opening" },
        { id: "body-1", type: "paragraph", content: "Real manuscript text." },
      ],
    });
    expect(result).not.toEqual(
      expect.objectContaining({
        blocks: expect.arrayContaining([
          expect.objectContaining({ type: "inline_clip" }),
        ]),
      }),
    );
  });
});
