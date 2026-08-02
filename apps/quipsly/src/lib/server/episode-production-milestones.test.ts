/** @jest-environment node */

jest.mock("server-only", () => ({}));
jest.mock("@/lib/server/prisma-advisory-lock", () => ({
  acquirePrismaAdvisoryTransactionLock: jest.fn(),
}));
jest.mock("@/lib/server/studio-project-access", () => ({
  normalizeAccessEmail: (value: unknown) =>
    typeof value === "string" ? value.trim().toLowerCase() : "",
}));

import { acquirePrismaAdvisoryTransactionLock } from "@/lib/server/prisma-advisory-lock";

import {
  EpisodeMilestoneError,
  createEpisodeMilestone,
  updateEpisodeMilestone,
} from "./episode-production-milestones";

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "milestone-a",
    stableId: "episode-milestone-stable-a",
    episodeProductionId: "episode-production-1",
    kind: "ROUGH_CUT",
    title: "Rough cut ready",
    detail: null,
    startsAt: new Date("2026-08-10T18:00:00.000Z"),
    endsAt: null,
    timezone: "America/Denver",
    status: "PLANNED",
    assigneeUserId: null,
    dependsOnMilestoneId: null,
    revision: 1,
    completedAt: null,
    canceledAt: null,
    createdAt: new Date("2026-08-02T12:00:00.000Z"),
    updatedAt: new Date("2026-08-02T12:00:00.000Z"),
    assignee: null,
    dependsOn: null,
    ...overrides,
  };
}

function prismaWithTransaction(transaction: Record<string, unknown>) {
  return {
    $transaction: jest.fn(async (operation: (tx: typeof transaction) => Promise<unknown>) =>
      operation(transaction)),
  };
}

describe("canonical episode production milestones", () => {
  beforeEach(() => jest.clearAllMocks());

  it("replays one deterministic create request without a duplicate milestone or revision", async () => {
    let stored: ReturnType<typeof row> | null = null;
    let firstSnapshot: Record<string, unknown> | null = null;
    const transaction = {
      studioEpisodeMilestone: {
        findUnique: jest.fn().mockImplementation(async (query: any) =>
          query.where.stableId ? stored : null),
        create: jest.fn().mockImplementation(async () => {
          stored = row();
          return stored;
        }),
      },
      studioEpisodeProduction: {
        findUnique: jest.fn().mockResolvedValue({ id: "episode-production-1", projectId: "project-1" }),
      },
      studioEpisodeMilestoneRevision: {
        findUnique: jest.fn().mockImplementation(async () =>
          firstSnapshot ? { snapshotJson: firstSnapshot } : null),
        create: jest.fn().mockImplementation(async (query: any) => {
          firstSnapshot = query.data.snapshotJson;
          return { id: "revision-1" };
        }),
      },
    };
    const prisma = prismaWithTransaction(transaction);
    const input = {
      prisma: prisma as never,
      projectId: "project-1",
      episodeProductionId: "episode-production-1",
      actor: { id: "user-editor", email: "EDITOR@example.test" },
      clientRequestId: "create-request-1",
      milestone: {
        kind: "ROUGH_CUT" as const,
        title: "  Rough cut ready  ",
        startsAt: new Date("2026-08-10T18:00:00.000Z"),
        endsAt: null,
        timezone: "America/Denver",
      },
    };

    const first = await createEpisodeMilestone(input);
    const replay = await createEpisodeMilestone(input);

    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(transaction.studioEpisodeMilestone.create).toHaveBeenCalledTimes(1);
    expect(transaction.studioEpisodeMilestoneRevision.create).toHaveBeenCalledTimes(1);
    expect(firstSnapshot).toEqual(expect.objectContaining({
      schema: "quipsly-episode-milestone-revision-v1",
      externalCalendarMutated: false,
      clientRequestId: "create-request-1",
    }));
    expect(acquirePrismaAdvisoryTransactionLock).toHaveBeenCalledWith(
      transaction,
      "quipsly:episode-milestone:episode-production-1",
    );
  });

  it("serializes the whole episode and rejects a dependency cycle", async () => {
    const milestoneA = row();
    const milestoneB = row({
      id: "milestone-b",
      stableId: "episode-milestone-stable-b",
      title: "Editorial review",
      dependsOnMilestoneId: "milestone-a",
    });
    const transaction = {
      studioEpisodeMilestoneRevision: { findFirst: jest.fn().mockResolvedValue(null) },
      studioEpisodeMilestone: {
        findUnique: jest.fn().mockImplementation(async (query: any) => {
          if (query.where.id === "milestone-a") return milestoneA;
          if (query.where.id === "milestone-b") return milestoneB;
          return null;
        }),
        update: jest.fn(),
      },
      studioEpisodeProduction: {
        findUnique: jest.fn().mockResolvedValue({ projectId: "project-1" }),
      },
    };
    const prisma = prismaWithTransaction(transaction);

    await expect(updateEpisodeMilestone({
      prisma: prisma as never,
      projectId: "project-1",
      episodeProductionId: "episode-production-1",
      milestoneId: "milestone-a",
      actor: { id: "user-editor", email: "editor@example.test" },
      clientRequestId: "cycle-request-1",
      expectedRevision: 1,
      patch: { dependsOnMilestoneId: "milestone-b" },
    })).rejects.toMatchObject<Partial<EpisodeMilestoneError>>({
      code: "invalid-dependency",
      status: 400,
    });

    expect(transaction.studioEpisodeMilestone.update).not.toHaveBeenCalled();
    expect(acquirePrismaAdvisoryTransactionLock).toHaveBeenCalledWith(
      transaction,
      "quipsly:episode-milestone:episode-production-1",
    );
  });

  it("refuses completion until the direct prerequisite is complete", async () => {
    const milestoneA = row();
    const milestoneB = row({
      id: "milestone-b",
      stableId: "episode-milestone-stable-b",
      title: "Source upload verified",
      status: "IN_PROGRESS",
    });
    const transaction = {
      studioEpisodeMilestoneRevision: { findFirst: jest.fn().mockResolvedValue(null) },
      studioEpisodeMilestone: {
        findUnique: jest.fn().mockImplementation(async (query: any) =>
          query.where.id === "milestone-b" ? milestoneB : milestoneA),
        update: jest.fn(),
      },
      studioEpisodeProduction: {
        findUnique: jest.fn().mockResolvedValue({ projectId: "project-1" }),
      },
    };
    const prisma = prismaWithTransaction(transaction);

    await expect(updateEpisodeMilestone({
      prisma: prisma as never,
      projectId: "project-1",
      episodeProductionId: "episode-production-1",
      milestoneId: "milestone-a",
      actor: { id: "user-editor", email: "editor@example.test" },
      clientRequestId: "complete-request-1",
      expectedRevision: 1,
      patch: {
        dependsOnMilestoneId: "milestone-b",
        status: "COMPLETED",
      },
    })).rejects.toMatchObject<Partial<EpisodeMilestoneError>>({
      code: "dependency-incomplete",
      status: 409,
    });
    expect(transaction.studioEpisodeMilestone.update).not.toHaveBeenCalled();
  });
});
