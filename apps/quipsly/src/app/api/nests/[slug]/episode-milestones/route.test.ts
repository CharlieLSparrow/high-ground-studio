/** @jest-environment node */

import { NextRequest } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import {
  createEpisodeMilestone,
  listEpisodeMilestoneAssignees,
  listEpisodeMilestones,
  updateEpisodeMilestone,
} from "@/lib/server/episode-production-milestones";
import { resolveEpisodeProductionAccess } from "@/lib/server/episode-production-access";

import { GET, PATCH, POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/episode-production-access", () => ({
  resolveEpisodeProductionAccess: jest.fn(),
}));
jest.mock("@/lib/server/episode-production-milestones", () => {
  class EpisodeMilestoneError extends Error {
    constructor(
      message: string,
      readonly code: string,
      readonly status = 400,
    ) {
      super(message);
    }
  }
  return {
    EPISODE_MILESTONE_KINDS: ["RESEARCH_LOCK", "ROUGH_CUT"],
    EPISODE_MILESTONE_STATUSES: ["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELED"],
    EpisodeMilestoneError,
    createEpisodeMilestone: jest.fn(),
    listEpisodeMilestoneAssignees: jest.fn(),
    listEpisodeMilestones: jest.fn(),
    updateEpisodeMilestone: jest.fn(),
  };
});

const params = { params: Promise.resolve({ slug: "high-ground-odyssey" }) };

function request(method: "POST" | "PATCH", body: unknown) {
  return new NextRequest(
    "http://localhost/api/nests/high-ground-odyssey/episode-milestones",
    {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

function allow(action: "read" | "write" = "write") {
  jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue({
    allowed: true,
    actor: {
      id: "user-editor",
      email: "editor@example.test",
      name: "Episode Editor",
      isStaff: false,
      source: "embedded-cookie",
    },
    access: { allowed: true, projectId: "project-1", role: "EDITOR", action },
  } as never);
}

describe("episode milestone route", () => {
  const prisma = {
    studioEpisodeProduction: {
      findFirst: jest.fn().mockResolvedValue({
        id: "episode-production-1",
        projectId: "project-1",
      }),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.studioEpisodeProduction.findFirst.mockResolvedValue({
      id: "episode-production-1",
      projectId: "project-1",
    });
    jest.mocked(getPrismaClient).mockReturnValue(prisma as never);
  });

  it("checks write access before parsing or persisting a mutation", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue({
      allowed: false,
      status: 403,
      code: "episode-production-access-denied",
      error: "No write access.",
      actor: { id: "", email: "", name: "", isStaff: false, source: "none" },
      access: null,
    } as never);

    const response = await POST(request("POST", ["not", "an", "object"]), params);

    expect(response.status).toBe(403);
    expect(createEpisodeMilestone).not.toHaveBeenCalled();
    expect(prisma.studioEpisodeProduction.findFirst).not.toHaveBeenCalled();
  });

  it("creates one actor-bound canonical milestone with bounded inputs", async () => {
    allow();
    jest.mocked(createEpisodeMilestone).mockResolvedValue({
      milestone: { id: "milestone-1", revision: 1 },
      replayed: false,
    } as never);

    const response = await POST(request("POST", {
      episodeSlug: "the-swear-jar",
      clientRequestId: "request-create-1",
      kind: "ROUGH_CUT",
      title: "  Rough cut ready  ",
      detail: "Review picture and sync.",
      startsAt: "2026-08-10T18:00:00.000Z",
      endsAt: null,
      timezone: "America/Denver",
      assigneeUserId: "user-editor",
      dependsOnMilestoneId: null,
    }), params);

    expect(response.status).toBe(201);
    expect(createEpisodeMilestone).toHaveBeenCalledWith(expect.objectContaining({
      prisma,
      projectId: "project-1",
      episodeProductionId: "episode-production-1",
      actor: { id: "user-editor", email: "editor@example.test" },
      clientRequestId: "request-create-1",
      milestone: expect.objectContaining({
        kind: "ROUGH_CUT",
        title: "Rough cut ready",
        timezone: "America/Denver",
      }),
    }));
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("requires optimistic revision identity before applying a patch", async () => {
    allow();

    const response = await PATCH(request("PATCH", {
      episodeSlug: "the-swear-jar",
      milestoneId: "milestone-1",
      clientRequestId: "request-update-1",
      expectedRevision: 0,
      status: "COMPLETED",
    }), params);

    expect(response.status).toBe(400);
    expect(updateEpisodeMilestone).not.toHaveBeenCalled();
  });

  it("lists only after read access and resolves the exact episode production", async () => {
    allow("read");
    jest.mocked(listEpisodeMilestones).mockResolvedValue([{ id: "milestone-1" }] as never);
    jest.mocked(listEpisodeMilestoneAssignees).mockResolvedValue([{ id: "user-editor" }] as never);

    const response = await GET(new NextRequest(
      "http://localhost/api/nests/high-ground-odyssey/episode-milestones?episode=the-swear-jar",
    ), params);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(expect.objectContaining({ ok: true }));
    expect(listEpisodeMilestones).toHaveBeenCalledWith(prisma, "episode-production-1");
    expect(listEpisodeMilestoneAssignees).toHaveBeenCalledWith(
      prisma,
      "project-1",
      "user-editor",
    );
  });
});
