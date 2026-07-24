/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";

import { GET } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));

const mockedPrisma = jest.mocked(getPrismaClient);

function request(slug = "high-ground-odyssey") {
  return GET(new Request(`https://quipsly.example/api/public/podcast/rss/${slug}`), {
    params: Promise.resolve({ projectSlug: slug }),
  });
}

describe("project podcast feed publication boundary", () => {
  const projectFindMany = jest.fn();
  const candidateFindMany = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    mockedPrisma.mockReturnValue({
      studioProject: { findMany: projectFindMany },
      hgoEpisodePublishCandidate: { findMany: candidateFindMany },
    } as never);
  });

  afterEach(() => jest.restoreAllMocks());

  it("does not expose a private, missing, or ambiguous project by slug", async () => {
    projectFindMany.mockResolvedValueOnce([]);
    const missing = await request();
    expect(missing.status).toBe(404);
    expect(candidateFindMany).not.toHaveBeenCalled();

    projectFindMany.mockResolvedValueOnce([
      { id: "one", name: "One", description: null, sourceLabel: null },
      { id: "two", name: "Two", description: null, sourceLabel: null },
    ]);
    const ambiguous = await request();
    expect(ambiguous.status).toBe(409);
    expect(candidateFindMany).not.toHaveBeenCalled();
    expect(projectFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { slug: "high-ground-odyssey", isPrivate: false },
      take: 2,
    }));
  });

  it("reads only explicitly approved real-content candidates scoped to the project JSON", async () => {
    projectFindMany.mockResolvedValue([
      { id: "project-1", name: "High Ground Odyssey", description: "The real show", sourceLabel: "High Ground" },
    ]);
    candidateFindMany.mockResolvedValue([]);

    const response = await request();
    const xml = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/rss+xml");
    expect(candidateFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        candidateStatus: "published",
        archivedAt: null,
        approvedAt: { not: null },
        approvedByEmail: { not: null },
        containsRealContent: "true",
        blockerCount: 0,
        draftPacketJson: { path: ["projectId"], equals: "project-1" },
      },
      take: 250,
    }));
    expect(xml).toContain("High Ground Odyssey");
    expect(xml).not.toContain("hgo-public-media/mock");
    expect(xml).not.toContain("<item>");
  });

  it("omits candidates without real HTTPS audio and safely serializes approved media", async () => {
    projectFindMany.mockResolvedValue([
      { id: "project-1", name: "High Ground Odyssey", description: "The real show", sourceLabel: "High Ground" },
    ]);
    candidateFindMany.mockResolvedValue([
      {
        id: "missing-audio",
        projectionSlug: "missing-audio",
        proposedRoute: "/episodes/missing-audio",
        approvedAt: new Date("2026-07-18T10:00:00.000Z"),
        createdAt: new Date("2026-07-18T09:00:00.000Z"),
        draftPacketJson: { projectId: "project-1", title: "No audio", media: {} },
      },
      {
        id: "episode-4",
        projectionSlug: "episode-4",
        proposedRoute: "//evil.example/episode-4",
        approvedAt: new Date("2026-07-18T12:00:00.000Z"),
        createdAt: new Date("2026-07-18T11:00:00.000Z"),
        draftPacketJson: {
          id: "episode-4-guid",
          projectId: "project-1",
          slug: "episode-4",
          title: "Episode ]]> Four",
          summary: "Charlie & Homer",
          body: "Proof, not promises.",
          media: {
            audioUrl: "https://storage.example/episode-4.mp3?a=1&b=2",
            thumbnailUrl: "http://localhost/private.jpg",
          },
          metadata: { publishedAt: "2026-07-18T12:00:00.000Z" },
        },
      },
    ]);

    const response = await request();
    const xml = await response.text();

    expect((xml.match(/<item>/g) || [])).toHaveLength(1);
    expect(xml).not.toContain("No audio");
    expect(xml).toContain("Episode ]]]]><![CDATA[> Four");
    expect(xml).toContain("episode-4.mp3?a=1&amp;b=2");
    expect(xml).toContain("https://highgroundodyssey.com/episodes/episode-4");
    expect(xml).not.toContain("evil.example");
    expect(xml).not.toContain("localhost/private.jpg");
  });

  it("returns a no-store outage instead of a sample feed", async () => {
    projectFindMany.mockRejectedValue(new Error("Prisma failure at /private/schema.prisma"));

    const response = await request();
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(body).toBe("Feed unavailable");
    expect(body).not.toContain("schema.prisma");
    expect(body).not.toContain("The Fall of the Republic");
  });
});
