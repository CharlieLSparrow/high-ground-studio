/** @jest-environment node */

import { NextRequest } from "next/server";

import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";
import {
  findStudioProjectForAccess,
  resolveStudioProjectAccess,
} from "@/lib/server/studio-project-access";

import { POST } from "./route";

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
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
  studioNestChatThread: {
    upsert: jest.fn(),
  },
  studioNestChatMessage: {
    updateMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
  },
};

describe("scoped Nest chat threads", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(auth).mockResolvedValue({
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
      threadKey: "episode:episode-4-part-2",
      body: "The clip is ready for rehearsal.",
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
        }),
      }),
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
