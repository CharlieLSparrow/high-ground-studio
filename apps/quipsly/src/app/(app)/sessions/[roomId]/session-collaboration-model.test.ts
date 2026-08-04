import {
  buildSessionCollaborationContext,
  episodeRoomHref,
  episodeSlugFromSessionMetadata,
} from "./session-collaboration-model";

describe("Session collaboration context", () => {
  it("accepts the existing episode binding only for podcast Sessions", () => {
    expect(episodeSlugFromSessionMetadata("PODCAST", { episodeSlug: " episode-4 " })).toBe("episode-4");
    expect(episodeSlugFromSessionMetadata("COACHING", { episodeSlug: "episode-4" })).toBeNull();
    expect(episodeSlugFromSessionMetadata("PODCAST", { episodeSlug: "" })).toBeNull();
  });

  it("opens the exact canonical Episode Room only after the server validates it", () => {
    const context = buildSessionCollaborationContext({
      project: { id: "project-1", name: "High Ground Odyssey", slug: "high-ground" },
      episode: { id: "episode-1", title: "The Swear Jar", slug: "episode-4" },
    });
    expect(context.binding).toBe("EPISODE");
    expect(episodeRoomHref(context)).toBe("/nests/high-ground/episodes/episode-4");
  });

  it("never exposes an orphan episode as a valid collaboration destination", () => {
    const context = buildSessionCollaborationContext({
      episode: { id: "episode-1", title: "Orphan", slug: "episode-4" },
    });
    expect(context).toEqual({ project: null, episode: null, engagement: null, binding: "STANDALONE", episodeRepair: null, episodeBindingHistory: [] });
    expect(episodeRoomHref(context)).toBeNull();
  });
});
