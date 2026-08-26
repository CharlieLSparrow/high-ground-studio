jest.mock("server-only", () => ({}));

import type { Prisma } from "@prisma/client";

import { editCanonicalGoalInTransaction } from "./canonical-goal-edit";

const expected = new Date("2026-07-30T06:00:00.000Z");
const persistedAt = new Date("2026-07-30T06:00:01.000Z");

function txWith(sourceJson: Record<string, unknown> = { source: "quipsly-work-manual-goal-v1" }) {
  return {
    goal: {
      findFirst: jest.fn().mockResolvedValue({
        id: "goal-1",
        roomId: "room-1",
        status: "ACTIVE",
        title: "Old direction",
        description: null,
        targetAt: null,
        sourceJson,
        updatedAt: expected,
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn().mockResolvedValue({
        id: "goal-1",
        roomId: "room-1",
        status: "ACTIVE",
        title: "Publish a proof-listened episode",
        description: "The final timeline has been reviewed by both hosts.",
        targetAt: new Date("2026-08-15T18:00:00.000Z"),
        updatedAt: persistedAt,
      }),
    },
  };
}

describe("canonical goal editing", () => {
  it("preserves source evidence while appending a bounded no-side-effect receipt", async () => {
    const tx = txWith({
      schema: "quipsly-transcript-derived-goal-v1",
      immutableSourceAnchor: { segmentId: "segment-1" },
      editReceipts: Array.from({ length: 30 }, (_, index) => ({ id: `old-${index}` })),
    });
    const result = await editCanonicalGoalInTransaction({
      tx,
      goalId: "goal-1",
      actorUserId: "user-1",
      expectedUpdatedAt: expected,
      title: "Publish a proof-listened episode",
      description: "The final timeline has been reviewed by both hosts.",
      targetDecision: {
        kind: "SET",
        targetAt: new Date("2026-08-15T18:00:00.000Z"),
        requestedLocalDate: "2026-08-15",
        resolvedLocalDateTime: "2026-08-15T12:00",
        timezone: "America/Denver",
      },
      surface: "ios-capture-work",
      now: new Date("2026-07-30T06:00:00.500Z"),
      receiptId: "goal-edit-receipt",
    });

    expect(result).toMatchObject({
      kind: "saved",
      receiptId: "goal-edit-receipt",
      record: {
        id: "goal-1",
        title: "Publish a proof-listened episode",
        targetAt: new Date("2026-08-15T18:00:00.000Z"),
      },
    });
    expect(tx.goal.updateMany).toHaveBeenCalledWith({
      where: {
        id: "goal-1",
        ownerUserId: "user-1",
        status: { in: ["ACTIVE", "PAUSED"] },
        updatedAt: expected,
      },
      data: {
        title: "Publish a proof-listened episode",
        description: "The final timeline has been reviewed by both hosts.",
        targetAt: new Date("2026-08-15T18:00:00.000Z"),
        sourceJson: expect.objectContaining({
          immutableSourceAnchor: { segmentId: "segment-1" },
          editReceipts: expect.arrayContaining([
            expect.objectContaining({
              id: "goal-edit-receipt",
              kind: "quipsly-goal-edit-v1",
              surface: "ios-capture-work",
              targetDecision: "SET",
              statusChanged: false,
              progressChanged: false,
              taskLinksChanged: false,
              tagsChanged: false,
              hierarchyChanged: false,
              sourceAnchorChanged: false,
              providerCalendarEventChanged: false,
              externalSideEffects: false,
            }),
          ]),
        }),
      },
    });
    const savedSource = tx.goal.updateMany.mock.calls[0][0].data.sourceJson;
    expect(savedSource.editReceipts).toHaveLength(24);
    expect(savedSource.editReceipts[0]).toEqual({ id: "old-7" });
  });

  it("lets an active coaching collaborator refine the goal without taking ownership", async () => {
    const tx = txWith();
    const accessOr: Prisma.GoalWhereInput[] = [
      { ownerUserId: "coach-1" },
      { engagement: { is: { status: "ACTIVE", members: { some: { userId: "coach-1", status: "ACTIVE", role: "COACH" } } } } },
    ];
    const result = await editCanonicalGoalInTransaction({
      tx,
      goalId: "goal-1",
      actorUserId: "coach-1",
      accessOr,
      expectedUpdatedAt: expected,
      title: "Practice a grounded pause",
      description: "Use the pause once before the next Session.",
      targetDecision: { kind: "KEEP" },
      surface: "nest-work",
      receiptId: "coach-goal-edit",
    });

    expect(result.kind).toBe("saved");
    expect(tx.goal.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "goal-1", OR: accessOr },
    }));
    expect(tx.goal.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "goal-1", OR: accessOr }),
      data: expect.objectContaining({
        sourceJson: expect.objectContaining({
          editReceipts: expect.arrayContaining([
            expect.objectContaining({ id: "coach-goal-edit", changedByUserId: "coach-1" }),
          ]),
        }),
      }),
    }));
    expect(tx.goal.updateMany.mock.calls[0][0].data).not.toHaveProperty("ownerUserId");
  });

  it("keeps the exact stored target instant when only the goal definition changes", async () => {
    const exactTarget = new Date("2026-08-15T18:17:23.456Z");
    const tx = txWith();
    tx.goal.findFirst.mockResolvedValue({
      ...(await txWith().goal.findFirst()),
      targetAt: exactTarget,
    });
    tx.goal.findUnique.mockResolvedValue({
      ...(await txWith().goal.findUnique()),
      targetAt: exactTarget,
    });

    const result = await editCanonicalGoalInTransaction({
      tx,
      goalId: "goal-1",
      actorUserId: "user-1",
      expectedUpdatedAt: expected,
      title: "A clearer definition",
      description: "Keep the original target decision.",
      targetDecision: { kind: "KEEP" },
      surface: "nest-work",
      receiptId: "keep-target-receipt",
    });

    expect(result).toMatchObject({
      kind: "saved",
      record: { targetAt: exactTarget },
    });
    expect(tx.goal.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        targetAt: exactTarget,
        sourceJson: expect.objectContaining({
          editReceipts: [expect.objectContaining({
            id: "keep-target-receipt",
            targetDecision: "KEEP",
            targetIntent: null,
            previous: expect.objectContaining({ targetAt: exactTarget.toISOString() }),
            next: expect.objectContaining({ targetAt: exactTarget.toISOString() }),
          })],
        }),
      }),
    }));
  });

  it("clears a target only through an explicit clear decision", async () => {
    const exactTarget = new Date("2026-08-15T18:17:23.456Z");
    const tx = txWith();
    tx.goal.findFirst.mockResolvedValue({
      ...(await txWith().goal.findFirst()),
      targetAt: exactTarget,
    });
    tx.goal.findUnique.mockResolvedValue({
      ...(await txWith().goal.findUnique()),
      targetAt: null,
    });

    await editCanonicalGoalInTransaction({
      tx,
      goalId: "goal-1",
      actorUserId: "user-1",
      expectedUpdatedAt: expected,
      title: "An open-ended direction",
      description: null,
      targetDecision: { kind: "CLEAR" },
      surface: "nest-work",
      receiptId: "clear-target-receipt",
    });

    expect(tx.goal.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        targetAt: null,
        sourceJson: expect.objectContaining({
          editReceipts: [expect.objectContaining({
            id: "clear-target-receipt",
            targetDecision: "CLEAR",
            targetIntent: null,
            previous: expect.objectContaining({ targetAt: exactTarget.toISOString() }),
            next: expect.objectContaining({ targetAt: null }),
          })],
        }),
      }),
    }));
  });

  it.each([
    [null, "not-found"],
    [{ status: "ACHIEVED" }, "closed"],
    [{ status: "ARCHIVED" }, "closed"],
    [{ updatedAt: new Date("2026-07-30T06:00:02.000Z") }, "conflict"],
  ])("fails closed for inaccessible, historical, or stale goals", async (override, expectedKind) => {
    const tx = txWith();
    tx.goal.findFirst.mockResolvedValue(
      override === null
        ? null
        : {
          ...(await txWith().goal.findFirst()),
          ...override,
        },
    );

    const result = await editCanonicalGoalInTransaction({
      tx,
      goalId: "goal-1",
      actorUserId: "user-1",
      expectedUpdatedAt: expected,
      title: "New direction",
      description: null,
      targetDecision: { kind: "KEEP" },
      surface: "nest-work",
    });

    expect(result.kind).toBe(expectedKind);
    expect(tx.goal.updateMany).not.toHaveBeenCalled();
  });
});
