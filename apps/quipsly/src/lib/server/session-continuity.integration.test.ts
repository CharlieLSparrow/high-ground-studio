/** @jest-environment node */

import { randomUUID } from "node:crypto";

import { getPrismaClient } from "@/lib/prisma";

import {
  loadSessionContinuityState,
  saveSessionContinuityBrief,
} from "./session-continuity";

const runLocalDatabaseSmoke = process.env.QUIPSLY_SESSION_CONTINUITY_DB_SMOKE === "1"
  ? describe
  : describe.skip;
if (process.env.QUIPSLY_SESSION_CONTINUITY_DB_SMOKE === "1") {
  if (!process.env.QUIPSLY_LOCAL_DATABASE_URL) {
    throw new Error("QUIPSLY_LOCAL_DATABASE_URL is required for the Session continuity smoke.");
  }
  process.env.DATABASE_URL = process.env.QUIPSLY_LOCAL_DATABASE_URL;
}

runLocalDatabaseSmoke("Session continuity local database smoke", () => {
  const prisma = getPrismaClient();
  const nonce = randomUUID().slice(0, 8);
  const actorEmail = `session-continuity-${nonce}@example.test`;
  let actorUserId = "";
  let outsiderUserId = "";
  let workspaceId = "";
  let projectId = "";
  let roomId = "";
  let taskId = "";
  let goalId = "";

  beforeAll(async () => {
    const [actor, outsider] = await Promise.all([
      prisma.user.create({
        data: { primaryEmail: actorEmail, name: "Session continuity actor" },
      }),
      prisma.user.create({
        data: {
          primaryEmail: `session-continuity-outsider-${nonce}@example.test`,
          name: "Session continuity outsider",
        },
      }),
    ]);
    actorUserId = actor.id;
    outsiderUserId = outsider.id;
    const workspace = await prisma.studioWorkspace.create({
      data: { slug: `session-continuity-${nonce}`, name: "Session continuity smoke" },
    });
    workspaceId = workspace.id;
    const project = await prisma.studioProject.create({
      data: {
        workspaceId,
        slug: `session-continuity-${nonce}`,
        name: "Private coaching engagement",
      },
    });
    projectId = project.id;
    const room = await prisma.callRoom.create({
      data: {
        createdByUserId: actorUserId,
        projectId,
        title: "Private coaching continuity smoke",
        purpose: "COACHING",
        status: "ENDED",
      },
    });
    roomId = room.id;
    await prisma.coachingNote.create({
      data: {
        roomId,
        authorUserId: actorUserId,
        kind: "SESSION_NOTE",
        title: "Bring this forward",
        body: "Name the next concrete rehearsal.",
      },
    });
    const [task, goal] = await Promise.all([
      prisma.actionItem.create({
        data: {
          roomId,
          projectId,
          assignedUserId: actorUserId,
          title: "Complete one protected rehearsal",
          detail: "Bring honest evidence to the next Session.",
        },
      }),
      prisma.goal.create({
        data: {
          roomId,
          projectId,
          ownerUserId: actorUserId,
          title: "Build a sustainable follow-through habit",
        },
      }),
    ]);
    taskId = task.id;
    goalId = goal.id;
    await Promise.all([
      prisma.goalTaskLink.create({
        data: {
          goalId,
          actionItemId: taskId,
          createdByUserId: actorUserId,
          relationship: "CONTRIBUTES",
        },
      }),
      prisma.goalProgressReceipt.create({
        data: {
          goalId,
          actorUserId,
          kind: "CHECK_IN",
          progressPercent: 25,
          note: "The workflow exists; the habit remains unproven.",
          occurredAt: new Date("2026-07-20T16:00:00.000Z"),
        },
      }),
      prisma.workPlanBlock.create({
        data: {
          ownerUserId: actorUserId,
          actionItemId: taskId,
          goalId,
          startsAt: new Date("2026-07-20T16:00:00.000Z"),
          endsAt: new Date("2026-07-20T16:50:00.000Z"),
          timezone: "America/Denver",
          status: "PLANNED",
        },
      }),
    ]);
  });

  afterAll(async () => {
    try {
      if (roomId) await prisma.callRoom.deleteMany({ where: { id: roomId } });
      if (goalId) await prisma.goal.deleteMany({ where: { id: goalId } });
      if (taskId) await prisma.actionItem.deleteMany({ where: { id: taskId } });
      if (workspaceId) await prisma.studioWorkspace.deleteMany({ where: { id: workspaceId } });
      if (actorUserId || outsiderUserId) {
        await prisma.user.deleteMany({
          where: { id: { in: [actorUserId, outsiderUserId].filter(Boolean) } },
        });
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  it("persists one source-bound brief, reuses the exact retry, and denies another actor", async () => {
    const actor = {
      id: actorUserId,
      email: actorEmail,
      primaryEmail: actorEmail,
      isStaff: false,
    };
    const state = await loadSessionContinuityState({
      prisma: prisma as never,
      actor,
      roomId,
      now: new Date("2026-07-24T18:00:00.000Z"),
    });
    expect(state).toMatchObject({
      canSave: true,
      current: {
        summary: {
          noteCount: 1,
          openTaskCount: 1,
          activeGoalCount: 1,
          plannedBlockCount: 1,
          unresolvedPastBlockCount: 1,
        },
        snapshot: {
          externalSideEffects: false,
          aiGenerated: false,
          tasks: [{ id: taskId }],
          goals: [{ id: goalId }],
        },
      },
    });

    const clientRequestId = randomUUID();
    const input = {
      prisma,
      actor,
      roomId,
      clientRequestId,
      expectedSnapshotSha256: state!.current.snapshotSha256,
      now: new Date("2026-07-24T18:00:00.000Z"),
    };
    const first = await saveSessionContinuityBrief(input);
    const replay = await saveSessionContinuityBrief(input);

    expect(first).toMatchObject({ idempotentReplay: false });
    expect(replay).toMatchObject({
      idempotentReplay: true,
      brief: { id: first.brief.id },
    });
    await expect(prisma.coachingNote.count({
      where: {
        roomId,
        authorUserId: actorUserId,
        kind: "FOLLOW_UP",
      },
    })).resolves.toBe(1);
    const persisted = await prisma.coachingNote.findUniqueOrThrow({
      where: { id: first.brief.id },
    });
    expect(persisted.sourceJson).toMatchObject({
      schema: "quipsly-session-continuity-brief-v1",
      actorUserId,
      roomId,
      visibility: "actor-private",
      aiGenerated: false,
      sourceMutated: false,
      externalSideEffects: false,
      integrity: {
        snapshotSha256: state!.current.snapshotSha256,
        bodySha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        noteCount: 1,
        taskCount: 1,
        goalCount: 1,
        planBlockCount: 1,
      },
    });

    await expect(loadSessionContinuityState({
      prisma: prisma as never,
      actor: {
        id: outsiderUserId,
        email: `session-continuity-outsider-${nonce}@example.test`,
        primaryEmail: `session-continuity-outsider-${nonce}@example.test`,
        isStaff: false,
      },
      roomId,
    })).resolves.toBeNull();
  });
});
