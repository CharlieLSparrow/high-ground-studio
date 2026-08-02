/** @jest-environment node */

import { NextRequest } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { resolveEpisodeProductionAccess } from "@/lib/server/episode-production-access";
import { createEpisodeRoomFromManuscript } from "@/lib/server/episode-room-creation";
import { resolveStudioProjectAccess } from "@/lib/server/studio-project-access";

import { POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/episode-production-access", () => ({ resolveEpisodeProductionAccess: jest.fn() }));
jest.mock("@/lib/server/studio-project-access", () => ({ resolveStudioProjectAccess: jest.fn() }));
jest.mock("@/lib/server/episode-room-creation", () => {
  class EpisodeRoomCreationError extends Error {
    constructor(message: string, readonly code: string, readonly status = 400) {
      super(message);
    }
  }
  return { EpisodeRoomCreationError, createEpisodeRoomFromManuscript: jest.fn() };
});

const params = { params: Promise.resolve({ slug: "high-ground-odyssey" }) };
const prisma = {};

function request(body: unknown) {
  return new NextRequest("http://localhost/api/nests/high-ground-odyssey/episode-rooms", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function allowTarget() {
  jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue({
    allowed: true,
    actor: { id: "owner-1", email: "owner@example.test", name: "Owner", isStaff: false, source: "embedded-cookie" },
    access: { allowed: true, projectId: "target-project", role: "OWNER", source: "grant", projectSlug: "high-ground-odyssey" },
  } as never);
}

describe("Episode Room source import route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getPrismaClient).mockReturnValue(prisma as never);
  });

  it("requires target manage access before parsing private source intent", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue({
      allowed: false,
      status: 403,
      code: "episode-production-access-denied",
      error: "Owner access required.",
      actor: { id: "", email: "", name: "", isStaff: false, source: "none" },
      access: null,
    } as never);

    const response = await POST(request(["private", "source"]), params);

    expect(response.status).toBe(403);
    expect(resolveEpisodeProductionAccess).toHaveBeenCalledWith(expect.objectContaining({ action: "manage" }));
    expect(resolveStudioProjectAccess).not.toHaveBeenCalled();
    expect(createEpisodeRoomFromManuscript).not.toHaveBeenCalled();
  });

  it("fails closed when the actor cannot read the source manuscript project", async () => {
    allowTarget();
    jest.mocked(resolveStudioProjectAccess).mockResolvedValue({
      allowed: false,
      projectId: "private-source-project",
      role: null,
      source: "none",
      projectSlug: "high-ground-odyssey-manuscript",
    });

    const response = await POST(request({
      sourceProjectSlug: "high-ground-odyssey-manuscript",
      sourceDocumentId: "episode-8-source",
      title: "Episode 8: I wasn't born a leader",
      episodeSlug: "episode-8-i-wasnt-born-a-leader",
      clientRequestId: "request-1",
    }), params);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual(expect.objectContaining({ code: "episode-source-access-denied" }));
    expect(createEpisodeRoomFromManuscript).not.toHaveBeenCalled();
  });

  it("creates one provenance-bound room only after both access checks", async () => {
    allowTarget();
    jest.mocked(resolveStudioProjectAccess).mockResolvedValue({
      allowed: true,
      projectId: "source-project",
      role: "VIEWER",
      source: "grant",
      projectSlug: "high-ground-odyssey-manuscript",
    });
    jest.mocked(createEpisodeRoomFromManuscript).mockResolvedValue({
      episode: { id: "episode-production-8", slug: "episode-8-i-wasnt-born-a-leader" },
      replayed: false,
    } as never);

    const response = await POST(request({
      sourceProjectSlug: "high-ground-odyssey-manuscript",
      sourceDocumentId: "episode-8-source",
      title: "Episode 8: I wasn't born a leader",
      episodeSlug: "episode-8-i-wasnt-born-a-leader",
      clientRequestId: "request-1",
    }), params);

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(createEpisodeRoomFromManuscript).toHaveBeenCalledWith(expect.objectContaining({
      prisma,
      targetProjectId: "target-project",
      sourceProjectId: "source-project",
      sourceDocumentId: "episode-8-source",
      actor: { id: "owner-1", email: "owner@example.test" },
      clientRequestId: "request-1",
    }));
  });
});
