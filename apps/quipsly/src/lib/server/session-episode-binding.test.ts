jest.mock("server-only", () => ({}));

import {
  callRoomEpisodeBindingWhere,
  resolveSessionEpisodeBinding,
  sessionRelationMatchesProject,
  SessionEpisodeBindingError,
} from "./session-episode-binding";

describe("first-class Session episode binding", () => {
  it("resolves an exact same-project production and returns both compatibility identities", async () => {
    const findUnique = jest.fn().mockResolvedValue({
      id: "production-4",
      projectId: "project-1",
      slug: "episode-4",
      title: "The Swear Jar",
    });
    await expect(resolveSessionEpisodeBinding({
      prisma: { studioEpisodeProduction: { findUnique } },
      projectId: "project-1",
      purpose: "PODCAST",
      episodeSlug: " episode-4 ",
    })).resolves.toMatchObject({
      episodeProductionId: "production-4",
      episodeSlug: "episode-4",
    });
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { projectId_slug: { projectId: "project-1", slug: "episode-4" } },
    }));
  });

  it("refuses cross-purpose and missing same-project episode bindings", async () => {
    await expect(resolveSessionEpisodeBinding({
      prisma: { studioEpisodeProduction: { findUnique: jest.fn() } },
      projectId: "project-1",
      purpose: "COACHING",
      episodeSlug: "episode-4",
    })).rejects.toBeInstanceOf(SessionEpisodeBindingError);
    await expect(resolveSessionEpisodeBinding({
      prisma: { studioEpisodeProduction: { findUnique: jest.fn().mockResolvedValue(null) } },
      projectId: "project-1",
      purpose: "PODCAST",
      episodeSlug: "episode-other-project",
    })).rejects.toThrow(/does not exist in the selected Nest/i);
  });

  it("uses metadata only for unbackfilled rows and never overrides a conflicting relation", () => {
    expect(callRoomEpisodeBindingWhere({
      episodeProductionId: "production-4",
      episodeSlug: "episode-4",
    })).toEqual({
      OR: [
        { episodeProductionId: "production-4" },
        {
          episodeProductionId: null,
          metadataJson: { path: ["episodeSlug"], equals: "episode-4" },
        },
      ],
    });
  });

  it("fails a relation that crosses project ownership", () => {
    expect(sessionRelationMatchesProject({
      roomProjectId: "project-1",
      purpose: "PODCAST",
      episode: { projectId: "project-2" },
    })).toBe(false);
    expect(sessionRelationMatchesProject({
      roomProjectId: "project-1",
      purpose: "PODCAST",
      episode: { projectId: "project-1" },
    })).toBe(true);
    expect(sessionRelationMatchesProject({
      roomProjectId: "project-1",
      purpose: "COACHING",
      episode: { projectId: "project-1" },
    })).toBe(false);
  });
});
