/** @jest-environment node */

import {
  createEpisodeMilestone,
  EpisodeMilestoneError,
  updateEpisodeMilestone,
} from "@/lib/server/episode-production-milestones";
import { resolveStudioProjectAccess } from "@/lib/server/studio-project-access";

import {
  createProductionMilestone,
  reviseProductionMilestone,
} from "./production-milestone-operation";

jest.mock("@/lib/server/episode-production-milestones", () => {
  const actual = jest.requireActual("@/lib/server/episode-production-milestones");
  return {
    ...actual,
    createEpisodeMilestone: jest.fn(),
    updateEpisodeMilestone: jest.fn(),
  };
});
jest.mock("@/lib/server/studio-project-access", () => ({
  resolveStudioProjectAccess: jest.fn(),
}));

const actor = {
  id: "producer-1",
  primaryEmail: "producer@example.test",
};

const episode = {
  id: "episode-1",
  title: "The Swear Jar",
  slug: "the-swear-jar",
  project: { id: "project-1", slug: "high-ground-odyssey" },
};

function projectedMilestone(overrides: Record<string, unknown> = {}) {
  return {
    id: "milestone-1",
    stableId: "episode-milestone-stable",
    episodeProductionId: "episode-1",
    kind: "ROUGH_CUT",
    title: "Rough cut ready",
    detail: null,
    startsAt: "2026-08-10T18:00:00.000Z",
    endsAt: null,
    timezone: "America/Denver",
    status: "PLANNED",
    revision: 1,
    assignee: null,
    dependsOn: null,
    blocked: false,
    completedAt: null,
    canceledAt: null,
    createdAt: "2026-08-02T20:00:00.000Z",
    updatedAt: "2026-08-02T20:00:00.000Z",
    ...overrides,
  };
}

function createBody(overrides: Record<string, unknown> = {}) {
  return {
    episodeProductionId: "episode-1",
    requestId: "request-1234",
    kind: "ROUGH_CUT",
    title: "Rough cut ready",
    startsAt: "2026-08-10T18:00:00.000Z",
    endsAt: null,
    timezone: "America/Denver",
    ...overrides,
  };
}

describe("Production milestone Calendar operations", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(resolveStudioProjectAccess).mockResolvedValue({
      allowed: true,
      role: "EDITOR",
      source: "grant",
      projectId: "project-1",
      projectSlug: "high-ground-odyssey",
    });
  });

  it("delegates creation to the canonical Episode Room milestone service", async () => {
    const prisma = {
      studioEpisodeProduction: { findUnique: jest.fn().mockResolvedValue(episode) },
    };
    jest.mocked(createEpisodeMilestone).mockResolvedValue({
      milestone: projectedMilestone() as never,
      replayed: false,
    });

    const result = await createProductionMilestone({ prisma, actor, body: createBody() });

    expect(result).toMatchObject({
      milestone: { title: "Rough cut ready", endsAt: null, revision: 1 },
      idempotentReplay: false,
      externalSideEffects: false,
    });
    expect(createEpisodeMilestone).toHaveBeenCalledWith({
      prisma,
      projectId: "project-1",
      episodeProductionId: "episode-1",
      actor: { id: "producer-1", email: "producer@example.test" },
      clientRequestId: expect.stringMatching(/^calendar-create-[a-f0-9]{64}$/),
      milestone: {
        kind: "ROUGH_CUT",
        title: "Rough cut ready",
        detail: null,
        startsAt: new Date("2026-08-10T18:00:00.000Z"),
        endsAt: null,
        timezone: "America/Denver",
      },
    });
  });

  it("preserves the canonical service's exact replay result", async () => {
    const prisma = {
      studioEpisodeProduction: { findUnique: jest.fn().mockResolvedValue(episode) },
    };
    jest.mocked(createEpisodeMilestone).mockResolvedValue({
      milestone: projectedMilestone() as never,
      replayed: true,
    });

    const result = await createProductionMilestone({ prisma, actor, body: createBody() });

    expect(result.idempotentReplay).toBe(true);
    expect(createEpisodeMilestone).toHaveBeenCalledTimes(1);
  });

  it("requires current episode edit authority before calling the canonical writer", async () => {
    jest.mocked(resolveStudioProjectAccess).mockResolvedValue({
      allowed: false,
      role: "VIEWER",
      source: "grant",
      projectId: "project-1",
      projectSlug: "high-ground-odyssey",
    });
    const prisma = {
      studioEpisodeProduction: { findUnique: jest.fn().mockResolvedValue(episode) },
    };

    await expect(createProductionMilestone({ prisma, actor, body: createBody() }))
      .rejects.toMatchObject({ code: "episode-not-found", status: 404 });
    expect(createEpisodeMilestone).not.toHaveBeenCalled();
  });

  it("delegates lifecycle to the same canonical optimistic revision service", async () => {
    const prisma = {
      studioEpisodeMilestone: {
        findUnique: jest.fn().mockResolvedValue({ episodeProductionId: "episode-1" }),
      },
      studioEpisodeProduction: { findUnique: jest.fn().mockResolvedValue(episode) },
    };
    jest.mocked(updateEpisodeMilestone).mockResolvedValue({
      milestone: projectedMilestone({ status: "CANCELED", revision: 2 }) as never,
      replayed: false,
    });

    const result = await reviseProductionMilestone({
      prisma,
      actor,
      milestoneId: "milestone-1",
      body: { expectedRevision: 1, status: "CANCELED" },
    });

    expect(result).toMatchObject({
      milestone: { status: "CANCELED", revision: 2 },
      idempotentReplay: false,
      externalSideEffects: false,
    });
    expect(updateEpisodeMilestone).toHaveBeenCalledWith(expect.objectContaining({
      prisma,
      projectId: "project-1",
      episodeProductionId: "episode-1",
      milestoneId: "milestone-1",
      actor: { id: "producer-1", email: "producer@example.test" },
      clientRequestId: expect.stringMatching(/^calendar-revision-[a-f0-9]{64}$/),
      expectedRevision: 1,
      patch: { status: "CANCELED" },
    }));
  });

  it("maps the canonical stale-revision error without writing through another path", async () => {
    const prisma = {
      studioEpisodeMilestone: {
        findUnique: jest.fn().mockResolvedValue({ episodeProductionId: "episode-1" }),
      },
      studioEpisodeProduction: { findUnique: jest.fn().mockResolvedValue(episode) },
    };
    jest.mocked(updateEpisodeMilestone).mockRejectedValue(new EpisodeMilestoneError(
      "Milestone changed. Refresh before saving.",
      "revision-conflict",
      409,
    ));

    await expect(reviseProductionMilestone({
      prisma,
      actor,
      milestoneId: "milestone-1",
      body: { expectedRevision: 1, status: "IN_PROGRESS" },
    })).rejects.toMatchObject({
      code: "production-milestone-revision-conflict",
      status: 409,
    });
    expect(updateEpisodeMilestone).toHaveBeenCalledTimes(1);
  });
});
