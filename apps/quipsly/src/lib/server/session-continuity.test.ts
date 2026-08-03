import { createHash } from "node:crypto";

import type { PrismaClient } from "@prisma/client";

import {
  loadPriorSessionContinuityByRoomId,
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

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function mergedTaskEvidence(roomId = "room-1") {
  return {
    schema: "quipsly-transcript-task-evidence-merge-v1",
    receiptId: "task-evidence-receipt-1",
    actionCandidateId: "packet-action-build-1-segment-1",
    mergedAt: "2026-07-20T16:04:00.000Z",
    candidateSource: {
      schema: "quipsly-transcript-derived-task-v1",
      roomId,
      transcriptJobId: "job-1",
      segmentId: "segment-1",
      startSeconds: 63.2,
      endSeconds: 71.8,
      providerTextSha256: "a".repeat(64),
      providerSpeakerLabel: "Speaker",
      effectiveTextSnapshot: "I will run the protected rehearsal before we meet again.",
      effectiveSpeakerLabelSnapshot: "Client",
      acceptedCorrectionId: "correction-1",
      recordingAssetId: "asset-1",
      playbackSourceId: "source-1",
    },
  };
}

function roomFixture() {
  return {
    id: "room-1",
    title: "Homer coaching workflow rehearsal",
    purpose: "COACHING",
    status: "ENDED",
    projectId: "project-1",
    scheduledStart: new Date("2026-07-20T15:00:00.000Z"),
    endedAt: new Date("2026-07-20T17:00:00.000Z"),
    createdAt: new Date("2026-07-19T16:00:00.000Z"),
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
        evidenceReceipts: [{ evidenceJson: mergedTaskEvidence() }],
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
        evidenceReceipts: [],
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

function prismaHarness(options: { accessible?: boolean; evidenceRoomId?: string } = {}) {
  const room = roomFixture();
  if (options.evidenceRoomId) {
    room.actionItems[0]!.evidenceReceipts = [{ evidenceJson: mergedTaskEvidence(options.evidenceRoomId) }];
  }
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
      findMany: jest.fn(async () => []),
    },
    coachingNote: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => notes.get(where.id) ?? null),
      findMany: jest.fn(async () => Array.from(notes.values()).filter((note) => note.kind === "FOLLOW_UP")),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const created = {
          ...data,
          sourceJson: JSON.parse(JSON.stringify(data.sourceJson)),
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
    expect(first?.current.snapshot.tasks[0]?.lastMergedTranscriptEvidence).toMatchObject({
      receiptId: "task-evidence-receipt-1",
      sourceAnchor: { roomId: "room-1", segmentId: "segment-1" },
    });
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
    expect(body).toContain("Reviewed task evidence");
    expect(body).toContain("receipt task-evidence-receipt-1 · segment segment-1");
    expect(body).toContain("planned time passed; completion or skip decision still missing");
    expect(body).toContain("not an AI summary");
    expect(body).toContain(`Snapshot SHA-256 ${state!.current.snapshotSha256}`);
  });

  it("fails closed when a task evidence receipt points to a Session the actor cannot access", async () => {
    const { prisma, tx } = prismaHarness({ evidenceRoomId: "room-private-other" });
    const state = await loadSessionContinuityState({
      prisma: prisma as never,
      actor: ACTOR,
      roomId: "room-1",
      now: NOW,
    });

    expect(state?.current.snapshot.tasks[0]?.lastMergedTranscriptEvidence).toBeNull();
    expect(tx.callRoom.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: { in: ["room-private-other"] } }),
      select: { id: true },
    }));
    expect(JSON.stringify(state)).not.toContain("I will run the protected rehearsal");
  });

  it("selects only the latest actor-private brief from an earlier accessible Session in the same Nest and purpose", async () => {
    const priorSource = {
      schema: "quipsly-session-continuity-brief-v1",
      actorUserId: ACTOR.id,
      roomId: "room-previous",
      visibility: "actor-private",
      aiGenerated: false,
      sourceMutated: false,
      externalSideEffects: false,
      integrity: {
        snapshotSha256: "e".repeat(64),
        bodySha256: sha256("Carry exact work forward."),
      },
    };
    const findMany = jest.fn(async () => [
      {
        id: "room-previous",
        title: "Previous coaching Session",
        purpose: "COACHING",
        projectId: "project-1",
        scheduledStart: new Date("2026-07-18T16:00:00.000Z"),
        endedAt: new Date("2026-07-18T17:00:00.000Z"),
        createdAt: new Date("2026-07-17T16:00:00.000Z"),
        notes: [{
          id: "brief-previous",
          title: "Next-session brief — Previous coaching Session",
          body: "Carry exact work forward.",
          sourceJson: priorSource,
          createdAt: new Date("2026-07-18T18:00:00.000Z"),
        }],
      },
      {
        id: "room-tampered-body",
        title: "Tampered coaching Session",
        purpose: "COACHING",
        projectId: "project-1",
        scheduledStart: new Date("2026-07-19T16:00:00.000Z"),
        endedAt: null,
        createdAt: new Date("2026-07-19T15:00:00.000Z"),
        notes: [{
          id: "brief-tampered-body",
          title: "Tampered body",
          body: "This body does not match its integrity receipt.",
          sourceJson: { ...priorSource, roomId: "room-tampered-body" },
          createdAt: new Date("2026-07-19T18:00:00.000Z"),
        }],
      },
      {
        id: "room-wrong-purpose",
        title: "Previous podcast Session",
        purpose: "PODCAST",
        projectId: "project-1",
        scheduledStart: new Date("2026-07-19T16:00:00.000Z"),
        endedAt: null,
        createdAt: new Date("2026-07-19T15:00:00.000Z"),
        notes: [{
          id: "brief-wrong-purpose",
          title: "Wrong purpose",
          body: "Do not carry this.",
          sourceJson: { ...priorSource, roomId: "room-wrong-purpose" },
          createdAt: new Date("2026-07-19T18:00:00.000Z"),
        }],
      },
    ]);
    const target = roomFixture();

    const result = await loadPriorSessionContinuityByRoomId({
      prisma: { callRoom: { findMany } } as never,
      actor: ACTOR,
      rooms: [target],
    });

    expect(result["room-1"]).toMatchObject({
      sourceRoom: { id: "room-previous", projectId: "project-1" },
      brief: { id: "brief-previous", snapshotSha256: "e".repeat(64) },
      relationship: "same-project-and-purpose",
      currentSessionMutated: false,
      externalSideEffects: false,
    });
    expect(JSON.stringify(result)).not.toContain("wrong-purpose");
    expect(JSON.stringify(result)).not.toContain("tampered-body");
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        projectId: { in: ["project-1"] },
        OR: expect.any(Array),
        notes: expect.objectContaining({ some: expect.any(Object) }),
      }),
    }));
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
    const semanticReplay = await saveSessionContinuityBrief({
      ...input,
      clientRequestId: "293267fc-10e0-4216-952f-b60a5eed047f",
    });

    expect(saved.idempotentReplay).toBe(false);
    expect(saved.brief.taskEvidence).toEqual([expect.objectContaining({
      taskId: "task-1",
      evidence: expect.objectContaining({ receiptId: "task-evidence-receipt-1" }),
    })]);
    expect(replay.idempotentReplay).toBe(true);
    expect(semanticReplay.idempotentReplay).toBe(true);
    expect(semanticReplay.brief.id).toBe(saved.brief.id);
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
