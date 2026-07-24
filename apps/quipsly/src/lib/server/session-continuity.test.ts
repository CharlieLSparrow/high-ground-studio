import type { PrismaClient } from "@prisma/client";

import {
  loadSessionContinuityState,
  renderSessionContinuityBrief,
  saveSessionContinuityBrief,
  SessionContinuityError,
} from "./session-continuity";

const ACTOR = {
  id: "actor-1",
  email: "actor@example.com",
  primaryEmail: "actor@example.com",
  isStaff: false,
};
const NOW = new Date("2026-07-24T18:00:00.000Z");
const REQUEST_ID = "41b1e8d2-9c4c-430d-af2e-8c912c127193";

function roomFixture() {
  return {
    id: "room-1",
    title: "Homer coaching workflow rehearsal",
    purpose: "COACHING",
    status: "ENDED",
    projectId: "project-1",
    updatedAt: new Date("2026-07-20T16:00:00.000Z"),
    notes: [{
      id: "note-1",
      kind: "SESSION_NOTE",
      title: "Bring forward",
      body: "Name the next concrete rehearsal.",
      sourceJson: { schema: "quipsly-mobile-capture-quick-entry-v1" },
      createdAt: new Date("2026-07-20T16:00:00.000Z"),
      updatedAt: new Date("2026-07-20T16:00:00.000Z"),
      tagLinks: [{ tag: { id: "tag-1", label: "Follow through", slug: "follow-through", isActive: true } }],
    }],
    actionItems: [
      {
        id: "task-1",
        title: "Rehearse the follow-through",
        detail: "Use the canonical goal and focus block.",
        status: "OPEN",
        dueAt: null,
        completedAt: null,
        sourceJson: { schema: "quipsly-mobile-capture-quick-entry-v1" },
        updatedAt: new Date("2026-07-20T16:01:00.000Z"),
        tagLinks: [],
        goalLinks: [{ goalId: "goal-1" }],
        planBlocks: [{
          id: "block-1",
          actionItemId: "task-1",
          goalId: "goal-1",
          startsAt: new Date("2026-07-20T16:00:00.000Z"),
          endsAt: new Date("2026-07-20T16:50:00.000Z"),
          timezone: "America/Denver",
          status: "PLANNED",
          completedAt: null,
          updatedAt: new Date("2026-07-20T16:01:00.000Z"),
        }],
      },
      {
        id: "candidate-1",
        title: "Unreviewed transcript inference",
        detail: null,
        status: "OPEN",
        dueAt: null,
        completedAt: null,
        sourceJson: { source: "transcript-packet-builder", candidate: true },
        updatedAt: new Date("2026-07-20T16:02:00.000Z"),
        tagLinks: [],
        goalLinks: [],
        planBlocks: [],
      },
    ],
    goals: [{
      id: "goal-1",
      title: "Build an obvious coaching follow-through habit",
      description: "Carry one real commitment into the next Session.",
      status: "ACTIVE",
      targetAt: null,
      achievedAt: null,
      updatedAt: new Date("2026-07-20T16:03:00.000Z"),
      tagLinks: [],
      taskLinks: [{ actionItemId: "task-1" }],
      planBlocks: [{
        id: "block-1",
        actionItemId: "task-1",
        goalId: "goal-1",
        startsAt: new Date("2026-07-20T16:00:00.000Z"),
        endsAt: new Date("2026-07-20T16:50:00.000Z"),
        timezone: "America/Denver",
        status: "PLANNED",
        completedAt: null,
        updatedAt: new Date("2026-07-20T16:01:00.000Z"),
      }],
      progressReceipts: [{
        id: "progress-1",
        kind: "CHECK_IN",
        progressPercent: 25,
        note: "The workflow exists; the live habit is still unproven.",
        occurredAt: new Date("2026-07-20T16:03:00.000Z"),
      }],
    }],
  };
}

function prismaHarness(options: { accessible?: boolean } = {}) {
  const room = roomFixture();
  const notes = new Map(room.notes.map((note) => [note.id, note as Record<string, unknown>]));
  const tx = {
    callRoom: {
      findFirst: jest.fn(async () => {
        if (options.accessible === false) return null;
        return {
          ...room,
          notes: Array.from(notes.values()),
        };
      }),
    },
    coachingNote: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => notes.get(where.id) ?? null),
      findMany: jest.fn(async () => Array.from(notes.values()).filter((note) => note.kind === "FOLLOW_UP")),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const created = {
          ...data,
          createdAt: NOW,
          updatedAt: NOW,
          tagLinks: [],
        };
        notes.set(String(data.id), created);
        return created;
      }),
    },
  };
  const prisma = {
    ...tx,
    $transaction: jest.fn(async (operation: (client: typeof tx) => unknown) => operation(tx)),
  } as unknown as PrismaClient;
  return { prisma, tx, notes };
}

describe("Session continuity", () => {
  it("builds a stable actor-scoped snapshot and quarantines transcript candidates", async () => {
    const { prisma, tx } = prismaHarness();
    const first = await loadSessionContinuityState({
      prisma: prisma as never,
      actor: ACTOR,
      roomId: "room-1",
      now: NOW,
    });
    const second = await loadSessionContinuityState({
      prisma: prisma as never,
      actor: ACTOR,
      roomId: "room-1",
      now: NOW,
    });

    expect(first).not.toBeNull();
    expect(second?.current.snapshotSha256).toBe(first?.current.snapshotSha256);
    expect(first?.current.summary).toEqual({
      noteCount: 1,
      openTaskCount: 1,
      completedTaskCount: 0,
      activeGoalCount: 1,
      achievedGoalCount: 0,
      plannedBlockCount: 1,
      completedBlockCount: 0,
      unresolvedPastBlockCount: 1,
    });
    expect(first?.current.snapshot.tasks.map((task) => task.id)).toEqual(["task-1"]);
    expect(first?.current.snapshot.planBlocks.map((block) => block.id)).toEqual(["block-1"]);
    expect(first?.current.snapshot).toMatchObject({ externalSideEffects: false, aiGenerated: false });
    expect(tx.callRoom.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "room-1" }),
    }));
  });

  it("renders exact canonical identities and makes evidence boundaries explicit", async () => {
    const { prisma } = prismaHarness();
    const state = await loadSessionContinuityState({
      prisma: prisma as never,
      actor: ACTOR,
      roomId: "room-1",
      now: NOW,
    });
    const body = renderSessionContinuityBrief(state!.current.snapshot, NOW);

    expect(body).toContain("[note-1]");
    expect(body).toContain("[task-1]");
    expect(body).toContain("[goal-1]");
    expect(body).toContain("[block-1]");
    expect(body).toContain("planned time passed; completion or skip decision still missing");
    expect(body).toContain("not an AI summary");
    expect(body).toContain(`Snapshot SHA-256 ${state!.current.snapshotSha256}`);
  });

  it("saves one private source envelope and reuses the exact retry without duplication", async () => {
    const { prisma, tx } = prismaHarness();
    const state = await loadSessionContinuityState({
      prisma: prisma as never,
      actor: ACTOR,
      roomId: "room-1",
      now: NOW,
    });
    const input = {
      prisma,
      actor: ACTOR,
      roomId: "room-1",
      clientRequestId: REQUEST_ID,
      expectedSnapshotSha256: state!.current.snapshotSha256,
      now: NOW,
    };

    const saved = await saveSessionContinuityBrief(input);
    const replay = await saveSessionContinuityBrief(input);

    expect(saved.idempotentReplay).toBe(false);
    expect(replay.idempotentReplay).toBe(true);
    expect(replay.brief.id).toBe(saved.brief.id);
    expect(tx.coachingNote.create).toHaveBeenCalledTimes(1);
    expect(tx.coachingNote.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        roomId: "room-1",
        authorUserId: "actor-1",
        kind: "FOLLOW_UP",
        sourceJson: expect.objectContaining({
          visibility: "actor-private",
          aiGenerated: false,
          sourceMutated: false,
          externalSideEffects: false,
          integrity: expect.objectContaining({
            snapshotSha256: state!.current.snapshotSha256,
            bodySha256: expect.stringMatching(/^[a-f0-9]{64}$/),
            noteCount: 1,
            taskCount: 1,
            goalCount: 1,
            planBlockCount: 1,
          }),
        }),
      }),
    }));
    await expect(saveSessionContinuityBrief({
      ...input,
      expectedSnapshotSha256: "f".repeat(64),
    })).rejects.toMatchObject<Partial<SessionContinuityError>>({
      code: "REQUEST_ID_CONFLICT",
      status: 409,
    });
  });

  it("recovers a concurrent uniqueness race by reading the matching receipt", async () => {
    const { prisma, tx } = prismaHarness();
    const state = await loadSessionContinuityState({
      prisma: prisma as never,
      actor: ACTOR,
      roomId: "room-1",
      now: NOW,
    });
    const transaction = prisma.$transaction as unknown as jest.Mock;
    transaction.mockImplementationOnce(async (
      operation: (client: typeof tx) => Promise<unknown>,
    ) => {
      await operation(tx);
      throw { code: "P2002" };
    });

    const result = await saveSessionContinuityBrief({
      prisma,
      actor: ACTOR,
      roomId: "room-1",
      clientRequestId: REQUEST_ID,
      expectedSnapshotSha256: state!.current.snapshotSha256,
      now: NOW,
    });

    expect(result.idempotentReplay).toBe(true);
    expect(tx.coachingNote.create).toHaveBeenCalledTimes(1);
    expect(result.state.saved).toHaveLength(1);
  });

  it("rejects stale snapshots and inaccessible sessions without writing", async () => {
    const accessible = prismaHarness();
    await expect(saveSessionContinuityBrief({
      prisma: accessible.prisma,
      actor: ACTOR,
      roomId: "room-1",
      clientRequestId: REQUEST_ID,
      expectedSnapshotSha256: "f".repeat(64),
      now: NOW,
    })).rejects.toMatchObject<Partial<SessionContinuityError>>({
      code: "STALE_SNAPSHOT",
      status: 409,
    });
    expect(accessible.tx.coachingNote.create).not.toHaveBeenCalled();

    const inaccessible = prismaHarness({ accessible: false });
    await expect(saveSessionContinuityBrief({
      prisma: inaccessible.prisma,
      actor: ACTOR,
      roomId: "room-1",
      clientRequestId: REQUEST_ID,
      expectedSnapshotSha256: "f".repeat(64),
      now: NOW,
    })).rejects.toMatchObject<Partial<SessionContinuityError>>({
      code: "SESSION_NOT_FOUND",
      status: 404,
    });
    expect(inaccessible.tx.coachingNote.create).not.toHaveBeenCalled();
  });
});
