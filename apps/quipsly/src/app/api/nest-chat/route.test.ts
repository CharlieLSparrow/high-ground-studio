/** @jest-environment node */

import { NextRequest } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import {
  findStudioProjectForAccess,
  resolveStudioProjectAccess,
} from "@/lib/server/studio-project-access";

import { GET, POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({
  getQuipslySessionFromRequest: jest.fn(),
}));
jest.mock("@/lib/server/studio-project-access", () => ({
  findStudioProjectForAccess: jest.fn(),
  normalizeAccessEmail: (value: unknown) =>
    typeof value === "string" ? value.trim().toLowerCase() : "",
  resolveStudioProjectAccess: jest.fn(),
}));

function request(body: unknown) {
  return new NextRequest("http://localhost/api/nest-chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const createdAt = new Date("2026-07-26T21:51:34.993Z");
const prisma = {
  coachingEngagement: {
    findFirst: jest.fn(),
  },
  callRoom: {
    findFirst: jest.fn(),
  },
  studioEpisodeProduction: {
    findUnique: jest.fn(),
  },
  studioStoryCard: {
    findFirst: jest.fn(),
  },
  studioNestChatThread: {
    upsert: jest.fn(),
  },
  studioNestChatMessage: {
    updateMany: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
  },
};

describe("scoped Nest chat threads", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: {
        id: "user-1",
        primaryEmail: "Editor@Example.Test",
        name: "Episode Editor",
      },
    } as never);
    jest.mocked(getPrismaClient).mockReturnValue(prisma as never);
    jest.mocked(findStudioProjectForAccess).mockResolvedValue({
      id: "project-1",
      slug: "high-ground-odyssey",
      name: "High Ground Odyssey",
    } as never);
    prisma.studioNestChatThread.upsert.mockResolvedValue({
      id: "thread-1",
      key: "episode:episode-4-part-2",
      title: "Episode 4 Part 2 Chat",
      projectId: "project-1",
      createdAt,
      updatedAt: createdAt,
    });
    prisma.studioNestChatMessage.updateMany.mockResolvedValue({ count: 0 });
    prisma.studioNestChatMessage.findFirst.mockResolvedValue({ id: "seed-1" });
    prisma.studioNestChatMessage.findUnique.mockResolvedValue(null);
    prisma.studioNestChatMessage.findMany.mockResolvedValue([]);
    prisma.callRoom.findFirst.mockResolvedValue(null);
    prisma.coachingEngagement.findFirst.mockResolvedValue(null);
    prisma.studioEpisodeProduction.findUnique.mockResolvedValue({
      id: "episode-production-1",
      slug: "episode-4-part-2",
      title: "Episode 4 Part 2",
      status: "READY_TO_RECORD",
    });
    prisma.studioStoryCard.findFirst.mockResolvedValue({ id: "card-1", stableId: "stable-card-1", title: "Lake reveal", revision: 3, sourceRangeId: "range-1" });
    prisma.studioNestChatMessage.create.mockResolvedValue({
      id: "message-1",
      projectId: "project-1",
      threadId: "thread-1",
      authorEmail: "editor@example.test",
      authorName: "Episode Editor",
      body: "The clip is ready for rehearsal.",
      gifUrl: null,
      metadataJson: {
        source: "nest-chat-panel",
        pastedGif: false,
        threadKey: "episode:episode-4-part-2",
        episodeSlug: "episode-4-part-2",
      },
      createdAt,
      updatedAt: createdAt,
    });
  });

  it("persists an episode message only after project write access", async () => {
    jest.mocked(resolveStudioProjectAccess).mockResolvedValue({
      allowed: true,
      projectId: "project-1",
      role: "EDITOR",
    } as never);

    const response = await POST(request({
      projectSlug: "high-ground-odyssey",
      episodeSlug: "episode-4-part-2",
      body: "The clip is ready for rehearsal.",
      clientMessageId: "018f97c6-b7bf-7b2e-8f76-0b482e9f5e93",
      clientSurface: "capture-ios",
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      message: {
        id: "message-1",
        body: "The clip is ready for rehearsal.",
      },
    });
    expect(resolveStudioProjectAccess).toHaveBeenCalledWith(expect.objectContaining({
      projectSlug: "high-ground-odyssey",
      email: "editor@example.test",
      action: "write",
    }));
    expect(prisma.studioNestChatThread.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          projectId_key: {
            projectId: "project-1",
            key: "episode:episode-4-part-2",
          },
        },
      }),
    );
    expect(prisma.studioNestChatMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: "project-1",
        threadId: "thread-1",
        authorEmail: "editor@example.test",
        metadataJson: expect.objectContaining({
          threadKey: "episode:episode-4-part-2",
          episodeSlug: "episode-4-part-2",
          episodeId: "episode-production-1",
          source: "capture-ios",
          clientMessageId: "018f97c6-b7bf-7b2e-8f76-0b482e9f5e93",
        }),
      }),
    });
  });

  it("does not create an invented episode thread inside an accessible Nest", async () => {
    jest.mocked(resolveStudioProjectAccess).mockResolvedValue({
      allowed: true,
      projectId: "project-1",
      role: "EDITOR",
    } as never);
    prisma.studioEpisodeProduction.findUnique.mockResolvedValue(null);

    const response = await POST(request({
      projectSlug: "high-ground-odyssey",
      episodeSlug: "invented-episode",
      body: "This must not create a shadow episode thread.",
    }));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "Episode chat is not available.",
    });
    expect(prisma.studioNestChatThread.upsert).not.toHaveBeenCalled();
    expect(prisma.studioNestChatMessage.create).not.toHaveBeenCalled();
  });

  it("returns the exact episode identity with the authorized thread", async () => {
    jest.mocked(resolveStudioProjectAccess).mockResolvedValue({
      allowed: true,
      projectId: "project-1",
      role: "VIEWER",
    } as never);

    const response = await GET(new NextRequest(
      "http://localhost/api/nest-chat?projectSlug=high-ground-odyssey&episodeSlug=episode-4-part-2",
    ));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      episode: {
        id: "episode-production-1",
        slug: "episode-4-part-2",
      },
      actor: { role: "VIEWER" },
      thread: { key: "episode:episode-4-part-2" },
    });
  });

  it("binds a card discussion to an existing project source card", async () => {
    jest.mocked(resolveStudioProjectAccess).mockResolvedValue({ allowed: true, projectId: "project-1", role: "EDITOR" } as never);
    prisma.studioNestChatThread.upsert.mockResolvedValue({ id: "thread-card-1", key: "story-card:card-1", title: "Lake reveal · source card", projectId: "project-1", createdAt, updatedAt: createdAt });

    const response = await POST(request({
      projectSlug: "high-ground-odyssey",
      threadKey: "story-card:card-1",
      body: "Use the path-light moment under the cold open.",
      clientMessageId: "018f97c6-b7bf-7b2e-8f76-0b482e9f5e94",
    }));

    expect(response.status).toBe(200);
    expect(prisma.studioStoryCard.findFirst).toHaveBeenCalledWith({
      where: { id: "card-1", projectId: "project-1", archivedAt: null },
      select: { id: true, stableId: true, title: true, revision: true, sourceRangeId: true },
    });
    expect(prisma.studioNestChatThread.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { projectId_key: { projectId: "project-1", key: "story-card:card-1" } },
      create: expect.objectContaining({ title: "Lake reveal · source card" }),
    }));
    expect(prisma.studioNestChatMessage.create).toHaveBeenCalledWith({ data: expect.objectContaining({ metadataJson: expect.objectContaining({
      sourceCardId: "card-1",
      sourceCardStableId: "stable-card-1",
      sourceRangeId: "range-1",
      sourceCardRevision: 3,
    }) }) });
  });

  it("refuses an invented or archived source-card thread", async () => {
    jest.mocked(resolveStudioProjectAccess).mockResolvedValue({ allowed: true, projectId: "project-1", role: "EDITOR" } as never);
    prisma.studioStoryCard.findFirst.mockResolvedValue(null);

    const response = await POST(request({
      projectSlug: "high-ground-odyssey",
      threadKey: "story-card:invented-card",
      body: "This must not create an orphan discussion.",
    }));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: "Source-card thread is not available." });
    expect(prisma.studioNestChatThread.upsert).not.toHaveBeenCalled();
    expect(prisma.studioNestChatMessage.create).not.toHaveBeenCalled();
  });

  it("authorizes a Session-only participant without granting the surrounding Nest", async () => {
    jest.mocked(resolveStudioProjectAccess).mockResolvedValue({
      allowed: true,
      projectId: "project-1",
      role: "EDITOR",
    } as never);
    prisma.callRoom.findFirst.mockResolvedValue({
      id: "room-1",
      title: "Private coaching follow-up",
      purpose: "COACHING",
      status: "PLANNED",
      createdByUserId: "host-1",
      participants: [{ role: "CLIENT" }],
      project: {
        id: "project-1",
        slug: "high-ground-odyssey",
        name: "High Ground Odyssey",
      },
    });
    prisma.studioNestChatThread.upsert.mockResolvedValue({
      id: "thread-session-1",
      key: "session:room-1",
      title: "High Ground Odyssey · session room 1",
      projectId: "project-1",
      createdAt,
      updatedAt: createdAt,
    });

    const response = await GET(new NextRequest(
      "http://localhost/api/nest-chat?projectSlug=high-ground-odyssey&threadKey=session%3Aroom-1",
    ));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      session: { id: "room-1", purpose: "COACHING" },
      thread: { key: "session:room-1" },
    });
    expect(prisma.callRoom.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: "room-1",
        project: { is: { slug: "high-ground-odyssey" } },
        OR: expect.any(Array),
      }),
      select: {
        id: true,
        title: true,
        purpose: true,
        status: true,
        createdByUserId: true,
        participants: {
          where: { userId: "user-1", accessStatus: "ACTIVE" },
          take: 1,
          select: { role: true },
        },
        project: { select: { id: true, slug: true, name: true } },
      },
    });
    expect(resolveStudioProjectAccess).not.toHaveBeenCalled();
  });

  it("does not create a Session thread for a project viewer outside the meeting", async () => {
    jest.mocked(resolveStudioProjectAccess).mockResolvedValue({
      allowed: true,
      projectId: "project-1",
      role: "VIEWER",
    } as never);
    prisma.callRoom.findFirst.mockResolvedValue(null);

    const response = await GET(new NextRequest(
      "http://localhost/api/nest-chat?projectSlug=high-ground-odyssey&threadKey=session%3Aprivate-room",
    ));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "Session thread is not available.",
    });
    expect(prisma.studioNestChatThread.upsert).not.toHaveBeenCalled();
  });

  it("authorizes an engagement member without granting the surrounding Nest", async () => {
    prisma.coachingEngagement.findFirst.mockResolvedValue({
      id: "engagement-1",
      title: "Scott coaching",
      status: "ACTIVE",
      primaryClientUserId: "user-1",
      primaryCoachUserId: "coach-1",
      members: [{ role: "CLIENT" }],
      project: { id: "project-1", slug: "coaching-home", name: "Coaching home" },
    });
    prisma.studioNestChatThread.upsert.mockResolvedValue({
      id: "thread-engagement-1",
      key: "engagement:engagement-1",
      title: "Scott coaching · shared thread",
      projectId: "project-1",
      createdAt,
      updatedAt: createdAt,
    });

    const response = await GET(new NextRequest(
      "http://localhost/api/nest-chat?projectSlug=coaching-home&threadKey=engagement%3Aengagement-1",
    ));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      engagement: { id: "engagement-1", title: "Scott coaching" },
      actor: { role: "CLIENT" },
      thread: { key: "engagement:engagement-1" },
    });
    expect(resolveStudioProjectAccess).not.toHaveBeenCalled();
    expect(prisma.coachingEngagement.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: "engagement-1",
        project: { is: { slug: "coaching-home" } },
        OR: expect.any(Array),
      }),
      select: expect.any(Object),
    });
  });

  it("never falls an invalid private scope through to project chat", async () => {
    const response = await GET(new NextRequest(
      "http://localhost/api/nest-chat?projectSlug=coaching-home&threadKey=engagement%3A%2Fnot-valid",
    ));
    expect(response.status).toBe(400);
    expect(resolveStudioProjectAccess).not.toHaveBeenCalled();
    expect(prisma.studioNestChatThread.upsert).not.toHaveBeenCalled();
  });

  it("uses the shared Firebase bearer-or-cookie session boundary for native chat", async () => {
    jest.mocked(resolveStudioProjectAccess).mockResolvedValue({
      allowed: true,
      projectId: "project-1",
      role: "EDITOR",
    } as never);
    const nativeRequest = new NextRequest(
      "http://localhost/api/nest-chat?projectSlug=high-ground-odyssey&episodeSlug=episode-4-part-2",
      { headers: { authorization: "Bearer retained-native-token" } },
    );

    const response = await GET(nativeRequest);

    expect(response.status).toBe(200);
    expect(getQuipslySessionFromRequest).toHaveBeenCalledWith(nativeRequest);
  });

  it("replays the same client message identity without a duplicate insert", async () => {
    jest.mocked(resolveStudioProjectAccess).mockResolvedValue({
      allowed: true,
      projectId: "project-1",
      role: "EDITOR",
    } as never);
    prisma.studioNestChatMessage.findUnique.mockResolvedValue({
      id: "chat_018f97c6b7bf7b2e8f760b482e9f5e93",
      projectId: "project-1",
      threadId: "thread-1",
      authorEmail: "editor@example.test",
      authorName: "Episode Editor",
      body: "The clip is ready for rehearsal.",
      gifUrl: null,
      metadataJson: {},
      createdAt,
      updatedAt: createdAt,
    });

    const response = await POST(request({
      projectSlug: "high-ground-odyssey",
      episodeSlug: "episode-4-part-2",
      body: "The clip is ready for rehearsal.",
      clientMessageId: "018f97c6-b7bf-7b2e-8f76-0b482e9f5e93",
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      idempotentReplay: true,
      message: { id: "chat_018f97c6b7bf7b2e8f760b482e9f5e93" },
    });
    expect(prisma.studioNestChatMessage.create).not.toHaveBeenCalled();
  });

  it("rejects reuse of a client message identity for different evidence", async () => {
    jest.mocked(resolveStudioProjectAccess).mockResolvedValue({
      allowed: true,
      projectId: "project-1",
      role: "EDITOR",
    } as never);
    prisma.studioNestChatMessage.findUnique.mockResolvedValue({
      id: "chat_018f97c6b7bf7b2e8f760b482e9f5e93",
      projectId: "project-1",
      threadId: "thread-1",
      authorEmail: "editor@example.test",
      authorName: "Episode Editor",
      body: "The original episode decision.",
      gifUrl: null,
      metadataJson: {},
      createdAt,
      updatedAt: createdAt,
    });

    const response = await POST(request({
      projectSlug: "high-ground-odyssey",
      episodeSlug: "episode-4-part-2",
      body: "A different episode decision.",
      clientMessageId: "018f97c6-b7bf-7b2e-8f76-0b482e9f5e93",
    }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "This message retry identity is already in use.",
    });
    expect(prisma.studioNestChatMessage.create).not.toHaveBeenCalled();
  });

  it("converges an exact concurrent insert race onto the persisted message", async () => {
    jest.mocked(resolveStudioProjectAccess).mockResolvedValue({
      allowed: true,
      projectId: "project-1",
      role: "EDITOR",
    } as never);
    const persisted = {
      id: "chat_018f97c6b7bf7b2e8f760b482e9f5e93",
      projectId: "project-1",
      threadId: "thread-1",
      authorEmail: "editor@example.test",
      authorName: "Episode Editor",
      body: "The clip is ready for rehearsal.",
      gifUrl: null,
      metadataJson: {},
      createdAt,
      updatedAt: createdAt,
    };
    prisma.studioNestChatMessage.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(persisted);
    prisma.studioNestChatMessage.create.mockRejectedValue({ code: "P2002" });

    const response = await POST(request({
      projectSlug: "high-ground-odyssey",
      episodeSlug: "episode-4-part-2",
      body: "The clip is ready for rehearsal.",
      clientMessageId: "018f97c6-b7bf-7b2e-8f76-0b482e9f5e93",
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      idempotentReplay: true,
      message: { id: persisted.id },
    });
  });

  it("does not let a read-only collaborator author the episode thread", async () => {
    jest.mocked(resolveStudioProjectAccess).mockResolvedValue({
      allowed: false,
      projectId: "project-1",
      role: "VIEWER",
    } as never);

    const response = await POST(request({
      projectSlug: "high-ground-odyssey",
      threadKey: "episode:episode-4-part-2",
      body: "This must not be written.",
    }));

    expect(response.status).toBe(404);
    expect(prisma.studioNestChatThread.upsert).not.toHaveBeenCalled();
    expect(prisma.studioNestChatMessage.create).not.toHaveBeenCalled();
  });
});
