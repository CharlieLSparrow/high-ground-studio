/** @jest-environment node */

jest.mock("server-only", () => ({}));
jest.mock("@/lib/server/studio-project-access", () => ({
  normalizeAccessEmail: (value: unknown) =>
    typeof value === "string" ? value.trim().toLowerCase() : "",
}));

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import {
  createEpisodeMilestone,
  listEpisodeMilestones,
  updateEpisodeMilestone,
} from "./episode-production-milestones";

const runDatabaseOperation = process.env.QUIPSLY_EPISODE_MILESTONE_DB_OPERATION === "1";
const describeDatabase = runDatabaseOperation ? describe : describe.skip;

describeDatabase("episode milestone isolated PostgreSQL operation", () => {
  let prisma: PrismaClient;
  const actor = { id: "milestone-operation-user", email: "producer@example.test" };

  beforeAll(async () => {
    const connectionString = process.env.QUIPSLY_EPISODE_MILESTONE_DATABASE_URL || "";
    const parsed = new URL(connectionString);
    if (
      !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname)
      || !parsed.pathname.startsWith("/quipsly_milestone_acceptance_")
    ) {
      throw new Error("Milestone database operation requires an isolated loopback quipsly_milestone_acceptance_* database.");
    }
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString, max: 2 }),
    });
    await prisma.$connect();
    await prisma.user.create({
      data: {
        id: actor.id,
        primaryEmail: actor.email,
        name: "Episode Producer",
        emailVerified: new Date("2026-08-02T12:00:00.000Z"),
      },
    });
    await prisma.studioWorkspace.create({
      data: {
        id: "milestone-operation-workspace",
        slug: "milestone-operation-workspace",
        name: "Milestone operation workspace",
      },
    });
    await prisma.studioProject.create({
      data: {
        id: "milestone-operation-project",
        workspaceId: "milestone-operation-workspace",
        slug: "milestone-operation-project",
        name: "Milestone operation project",
      },
    });
    await prisma.studioProjectAccessGrant.create({
      data: {
        projectId: "milestone-operation-project",
        email: actor.email,
        role: "OWNER",
        createdByUserId: actor.id,
        createdByEmail: actor.email,
      },
    });
    await prisma.studioDocument.create({
      data: {
        id: "milestone-operation-document",
        projectId: "milestone-operation-project",
        stableId: "milestone-operation-document",
        title: "The Swear Jar run of show",
      },
    });
    await prisma.studioEpisodeProduction.create({
      data: {
        id: "milestone-operation-episode",
        projectId: "milestone-operation-project",
        documentId: "milestone-operation-document",
        slug: "the-swear-jar",
        title: "The Swear Jar",
        boundaryLabel: "The Swear Jar",
      },
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("persists idempotent creation, dependency gates, revisions, and conflict detection", async () => {
    const prerequisiteInput = {
      prisma,
      projectId: "milestone-operation-project",
      episodeProductionId: "milestone-operation-episode",
      actor,
      clientRequestId: "operation-create-source-upload",
      milestone: {
        kind: "SOURCE_UPLOAD_VERIFIED" as const,
        title: "Source upload verified",
        startsAt: new Date("2026-08-10T18:00:00.000Z"),
        timezone: "America/Denver",
        assigneeUserId: actor.id,
      },
    };
    const prerequisite = await createEpisodeMilestone(prerequisiteInput);
    const replay = await createEpisodeMilestone(prerequisiteInput);
    expect(prerequisite.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.milestone.id).toBe(prerequisite.milestone.id);

    const dependent = await createEpisodeMilestone({
      prisma,
      projectId: "milestone-operation-project",
      episodeProductionId: "milestone-operation-episode",
      actor,
      clientRequestId: "operation-create-rough-cut",
      milestone: {
        kind: "ROUGH_CUT",
        title: "Rough cut ready for review",
        startsAt: new Date("2026-08-12T18:00:00.000Z"),
        timezone: "America/Denver",
        dependsOnMilestoneId: prerequisite.milestone.id,
      },
    });
    expect(dependent.milestone.blocked).toBe(true);

    await expect(updateEpisodeMilestone({
      prisma,
      projectId: "milestone-operation-project",
      episodeProductionId: "milestone-operation-episode",
      milestoneId: dependent.milestone.id,
      actor,
      clientRequestId: "operation-premature-complete",
      expectedRevision: 1,
      patch: { status: "COMPLETED" },
    })).rejects.toMatchObject({ code: "dependency-incomplete", status: 409 });

    const completedPrerequisite = await updateEpisodeMilestone({
      prisma,
      projectId: "milestone-operation-project",
      episodeProductionId: "milestone-operation-episode",
      milestoneId: prerequisite.milestone.id,
      actor,
      clientRequestId: "operation-complete-source-upload",
      expectedRevision: 1,
      patch: { status: "COMPLETED" },
    });
    expect(completedPrerequisite.milestone.revision).toBe(2);
    expect(completedPrerequisite.milestone.completedAt).not.toBeNull();

    const completedDependent = await updateEpisodeMilestone({
      prisma,
      projectId: "milestone-operation-project",
      episodeProductionId: "milestone-operation-episode",
      milestoneId: dependent.milestone.id,
      actor,
      clientRequestId: "operation-complete-rough-cut",
      expectedRevision: 1,
      patch: { status: "COMPLETED" },
    });
    expect(completedDependent.milestone.revision).toBe(2);

    await expect(updateEpisodeMilestone({
      prisma,
      projectId: "milestone-operation-project",
      episodeProductionId: "milestone-operation-episode",
      milestoneId: dependent.milestone.id,
      actor,
      clientRequestId: "operation-stale-revision",
      expectedRevision: 1,
      patch: { title: "Stale title must not win" },
    })).rejects.toMatchObject({ code: "revision-conflict", status: 409 });

    const projected = await listEpisodeMilestones(prisma, "milestone-operation-episode");
    expect(projected).toHaveLength(2);
    expect(projected.every((milestone) => milestone.status === "COMPLETED")).toBe(true);
    expect(projected.find((milestone) => milestone.id === dependent.milestone.id)?.blocked).toBe(false);

    const revisions = await prisma.studioEpisodeMilestoneRevision.findMany({
      orderBy: [{ milestoneId: "asc" }, { revision: "asc" }],
    });
    expect(revisions).toHaveLength(4);
    expect(revisions.every((revision) =>
      (revision.snapshotJson as Record<string, unknown>).externalCalendarMutated === false,
    )).toBe(true);
  });
});
