/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";

import { searchWorkspace } from "./workspace-search";
import { createWorkTagTaxonomy } from "./work-tags";

jest.mock("@/auth", () => ({ auth: jest.fn() }));

const runDurableQa = process.env.QUIPSLY_DURABLE_TAG_QA === "1"
  ? describe
  : describe.skip;

if (process.env.QUIPSLY_DURABLE_TAG_QA === "1") {
  if (!process.env.QUIPSLY_LOCAL_DATABASE_URL) {
    throw new Error(
      "QUIPSLY_LOCAL_DATABASE_URL is required for durable tag QA.",
    );
  }
  process.env.DATABASE_URL = process.env.QUIPSLY_LOCAL_DATABASE_URL;
}

runDurableQa("durable canonical tag vocabulary dogfood", () => {
  const prisma = getPrismaClient();
  const actorEmail = (
    process.env.QUIPSLY_DURABLE_TAG_QA_EMAIL
      || "quipsly.qa@local.test"
  ).trim().toLowerCase();
  const projectName = (
    process.env.QUIPSLY_DURABLE_TAG_QA_PROJECT
      || "High Ground real-work dogfood"
  ).trim();
  const label = (
    process.env.QUIPSLY_DURABLE_TAG_QA_LABEL
      || "Capture vocabulary dogfood"
  ).trim();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates or reuses one searchable artifact without changing assignments", async () => {
    const actor = await prisma.user.findFirst({
      where: {
        primaryEmail: {
          equals: actorEmail,
          mode: "insensitive",
        },
      },
      select: { id: true },
    });
    if (!actor) {
      throw new Error(
        `Create the dedicated local QA actor ${actorEmail} before running durable tag QA.`,
      );
    }

    const grant = await prisma.studioProjectAccessGrant.findFirst({
      where: {
        email: {
          equals: actorEmail,
          mode: "insensitive",
        },
        status: "ACTIVE",
        role: { in: ["OWNER", "EDITOR"] },
        project: { name: projectName },
      },
      select: {
        project: {
          select: {
            id: true,
            slug: true,
            name: true,
          },
        },
      },
    });
    if (!grant) {
      throw new Error(
        `Grant ${actorEmail} Owner or Editor access to the durable QA Nest ${projectName}.`,
      );
    }

    const existing = await prisma.studioTag.findFirst({
      where: {
        projectId: grant.project.id,
        label: {
          equals: label,
          mode: "insensitive",
        },
      },
      select: { id: true },
    });
    const beforeCounts = existing
      ? await assignmentCounts(prisma, existing.id)
      : emptyAssignmentCounts();

    const result = await createWorkTagTaxonomy({
      prisma,
      actorUserId: actor.id,
      actorEmail,
      projectId: grant.project.id,
      label,
    });
    expect(result).toMatchObject({
      ok: true,
      projectId: grant.project.id,
      tag: {
        label,
        isActive: true,
      },
    });
    if (!result.ok) throw new Error(result.error);

    const [afterCounts, search, createRevision] = await Promise.all([
      assignmentCounts(prisma, result.tag.id),
      searchWorkspace(prisma, {
        actorUserId: actor.id,
        query: label,
        visibleProjects: [{
          id: grant.project.id,
          slug: grant.project.slug,
          name: grant.project.name,
          role: "OWNER",
        }],
      }),
      prisma.studioTagRevision.findUnique({
        where: {
          tagId_revision: {
            tagId: result.tag.id,
            revision: 1,
          },
        },
      }),
    ]);

    expect(afterCounts).toEqual(beforeCounts);
    expect(search.tags).toContainEqual(
      expect.objectContaining({
        id: result.tag.id,
        label,
      }),
    );
    expect(createRevision).toMatchObject({
      operation: "create",
      actorUserId: actor.id,
      snapshotJson: {
        kind: "quipsly-tag-taxonomy-v1",
        projectId: grant.project.id,
        assignmentChanged: false,
        externalSideEffects: false,
      },
    });

    console.info(JSON.stringify({
      kind: "quipsly-durable-tag-qa-v1",
      actorEmail,
      projectId: grant.project.id,
      projectName: grant.project.name,
      tagId: result.tag.id,
      label: result.tag.label,
      created: result.created,
      revision: result.revision,
      assignmentCounts: afterCounts,
      retained: true,
    }));
  });
});

function emptyAssignmentCounts() {
  return {
    tasks: 0,
    goals: 0,
    sessions: 0,
    notes: 0,
    documents: 0,
  };
}

async function assignmentCounts(
  prisma: ReturnType<typeof getPrismaClient>,
  tagId: string,
) {
  const [tasks, goals, sessions, notes, documents] = await Promise.all([
    prisma.actionItemTagLink.count({ where: { tagId } }),
    prisma.goalTagLink.count({ where: { tagId } }),
    prisma.callRoomTagLink.count({ where: { tagId } }),
    prisma.coachingNoteTagLink.count({ where: { tagId } }),
    prisma.studioDocumentTagLink.count({ where: { tagId } }),
  ]);
  return { tasks, goals, sessions, notes, documents };
}
