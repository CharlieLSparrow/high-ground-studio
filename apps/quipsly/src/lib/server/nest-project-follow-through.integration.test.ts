/** @jest-environment node */

import { randomUUID } from "node:crypto";

import { getPrismaClient } from "@/lib/prisma";
import { readNestProjectFollowThrough } from "./nest-project-follow-through";
import { searchWorkspace } from "./workspace-search";

const runLocalDatabaseSmoke = process.env.QUIPSLY_LOCAL_DB_SMOKE === "1" ? describe : describe.skip;
if (process.env.QUIPSLY_LOCAL_DB_SMOKE === "1") {
  if (!process.env.QUIPSLY_LOCAL_DATABASE_URL) throw new Error("QUIPSLY_LOCAL_DATABASE_URL is required for the Nest follow-through smoke.");
  process.env.DATABASE_URL = process.env.QUIPSLY_LOCAL_DATABASE_URL;
}

runLocalDatabaseSmoke("Nest project follow-through local database smoke", () => {
  const prisma = getPrismaClient();
  const nonce = randomUUID().slice(0, 8);
  const taskIds: string[] = [];
  const roomIds: string[] = [];
  const userIds: string[] = [];
  let workspaceId = "";
  let projectId = "";
  let projectSlug = "";
  let actorUserId = "";
  let otherUserId = "";
  const actorEmail = `nest-follow-${nonce}@example.test`;

  beforeAll(async () => {
    const [actor, other] = await Promise.all([
      prisma.user.create({ data: { primaryEmail: actorEmail, name: "Nest follow-through actor" } }),
      prisma.user.create({ data: { primaryEmail: `nest-follow-other-${nonce}@example.test`, name: "Nest follow-through other" } }),
    ]);
    actorUserId = actor.id;
    otherUserId = other.id;
    userIds.push(actor.id, other.id);
    const workspace = await prisma.studioWorkspace.create({ data: { slug: `nest-follow-${nonce}`, name: "Nest follow-through smoke" } });
    workspaceId = workspace.id;
    projectSlug = `project-${nonce}`;
    const project = await prisma.studioProject.create({ data: { workspaceId, slug: projectSlug, name: "Project follow-through smoke" } });
    projectId = project.id;
    await prisma.studioTag.create({ data: { projectId, slug: `episode-workflow-${nonce}`, label: "Episode workflow", description: "Private project taxonomy smoke", isPrivate: true } });
    await prisma.studioProjectAccessGrant.create({ data: { projectId, email: actorEmail, role: "EDITOR", status: "ACTIVE", createdByUserId: actorUserId, createdByEmail: actorEmail } });

    const [actorRoom, otherRoom] = await Promise.all([
      prisma.callRoom.create({ data: { title: "Actor episode room", projectSlug, createdByUserId: actorUserId } }),
      prisma.callRoom.create({ data: { title: "Other private room", projectSlug, createdByUserId: otherUserId } }),
    ]);
    roomIds.push(actorRoom.id, otherRoom.id);
    const actorGoal = await prisma.goal.create({ data: { ownerUserId: actorUserId, projectId, title: "Actor project goal" } });
    await prisma.goal.create({ data: { ownerUserId: otherUserId, projectId, title: "Other project goal" } });

    const exactSource = {
      schema: "quipsly-transcript-derived-task-v1",
      roomId: actorRoom.id,
      transcriptJobId: "job-smoke",
      segmentId: "segment-smoke",
      startSeconds: 3.66,
      endSeconds: 4.84,
      providerTextSha256: "a".repeat(64),
      providerSpeakerLabel: "Speaker",
      effectiveTextSnapshot: "One reviewed next action.",
      effectiveSpeakerLabelSnapshot: "Charlie",
      acceptedCorrectionId: null,
      recordingAssetId: "asset-smoke",
      playbackSourceId: "source-smoke",
    };
    const [actorRoomTask, goalTask, candidate, otherTask, otherAssignedInActorRoom, sharedActorRoomTask] = await Promise.all([
      prisma.actionItem.create({ data: { roomId: actorRoom.id, assignedUserId: actorUserId, title: "Actor exact-source task", sourceJson: exactSource } }),
      prisma.actionItem.create({ data: { assignedUserId: actorUserId, title: "Actor goal-linked task" } }),
      prisma.actionItem.create({ data: { roomId: actorRoom.id, assignedUserId: actorUserId, title: "Unreviewed candidate", sourceJson: { source: "transcript-packet-builder", candidate: true } } }),
      prisma.actionItem.create({ data: { roomId: otherRoom.id, assignedUserId: otherUserId, title: "Other private task" } }),
      prisma.actionItem.create({ data: { roomId: actorRoom.id, assignedUserId: otherUserId, title: "Other assignee in actor room" } }),
      prisma.actionItem.create({ data: { roomId: actorRoom.id, assignedUserId: null, title: "Shared unassigned session task" } }),
    ]);
    taskIds.push(actorRoomTask.id, goalTask.id, candidate.id, otherTask.id, otherAssignedInActorRoom.id, sharedActorRoomTask.id);
    await prisma.goalTaskLink.create({ data: { goalId: actorGoal.id, actionItemId: goalTask.id, createdByUserId: actorUserId } });
  });

  afterAll(async () => {
    try {
      if (taskIds.length) await prisma.actionItem.deleteMany({ where: { id: { in: taskIds } } });
      if (projectId) await prisma.goal.deleteMany({ where: { projectId } });
      if (roomIds.length) await prisma.callRoom.deleteMany({ where: { id: { in: roomIds } } });
      if (projectId) await prisma.studioProject.deleteMany({ where: { id: projectId } });
      if (workspaceId) await prisma.studioWorkspace.deleteMany({ where: { id: workspaceId } });
      if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it("returns only the actor's owned goals and accepted actor-visible project tasks", async () => {
    const result = await readNestProjectFollowThrough(prisma, { projectId, projectSlug, actorUserId });
    expect(result.goals.map((goal) => goal.title)).toEqual(["Actor project goal"]);
    expect(result.tasks.map((task) => task.title).sort()).toEqual(["Actor exact-source task", "Actor goal-linked task", "Shared unassigned session task"]);
    expect(result.tasks.find((task) => task.title === "Actor exact-source task")?.sourceAnchor).toMatchObject({ roomId: roomIds[0], segmentId: "segment-smoke", startSeconds: 3.66 });
    expect(result.boundaries).toEqual({ actorScoped: true, assignedTasksOwnerOnly: true, unassignedSessionTasksShared: true, ownedGoalsOnly: true, unreviewedTranscriptCandidatesExcluded: true, sourceMutated: false, canonicalProjectPreferredWithLegacySlugFallback: true, externalSideEffects: false });
    await expect(prisma.actionItem.count({ where: { title: "Other private task", assignedUserId: otherUserId } })).resolves.toBe(1);
    expect(result.tasks.some((task) => task.title === "Other assignee in actor room")).toBe(false);
    const search = await searchWorkspace(prisma, { actorUserId, query: "Actor exact-source", visibleProjects: [{ id: projectId, slug: projectSlug, name: "Project follow-through smoke" }] });
    expect(search.tasks.map((task) => task.title)).toEqual(["Actor exact-source task"]);
    expect(search.goals).toEqual([]);
    expect(search.projectCount).toBe(1);
    const privateAssignmentSearch = await searchWorkspace(prisma, { actorUserId, query: "Other assignee", visibleProjects: [{ id: projectId, slug: projectSlug, name: "Project follow-through smoke" }] });
    expect(privateAssignmentSearch.tasks).toEqual([]);
    const tagSearch = await searchWorkspace(prisma, { actorUserId, query: "Episode workflow", visibleProjects: [{ id: projectId, slug: projectSlug, name: "Project follow-through smoke" }] });
    expect(tagSearch.tags).toEqual([expect.objectContaining({ label: "Episode workflow", isPrivate: true, project: expect.objectContaining({ slug: projectSlug }) })]);
  });
});
