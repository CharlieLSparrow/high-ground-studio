import { updateCanonicalGoalStatusInTransaction } from "./canonical-goal-status";
import type { Prisma } from "@prisma/client";

const expected = new Date("2026-07-19T15:00:00.000Z");
const persisted = new Date("2026-07-19T15:00:01.000Z");
const now = new Date("2026-07-19T16:00:00.000Z");

describe("canonical goal status truth", () => {
  it("archives active work without erasing its transcript source", async () => {
    const tx = {
      goal: {
        findFirst: jest.fn().mockResolvedValue({
          id: "goal-1",
          status: "ACTIVE",
          sourceJson: {
            schema: "quipsly-transcript-derived-goal-v1",
            immutableSourceAnchor: { segmentId: "segment-1" },
          },
          updatedAt: expected,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue({ id: "goal-1", status: "ARCHIVED", updatedAt: persisted }),
      },
      goalProgressReceipt: { create: jest.fn().mockResolvedValue({ id: "progress-1" }) },
    };

    const result = await updateCanonicalGoalStatusInTransaction({
      tx,
      goalId: "goal-1",
      actorUserId: "user-1",
      expectedUpdatedAt: expected,
      nextStatus: "ARCHIVED",
      surface: "ios-capture-work",
      now,
      receiptId: "status-receipt-1",
    });

    expect(result).toEqual({
      kind: "saved",
      record: { id: "goal-1", status: "ARCHIVED", updatedAt: persisted },
      receiptId: "status-receipt-1",
    });
    expect(tx.goal.updateMany).toHaveBeenCalledWith({
      where: { id: "goal-1", ownerUserId: "user-1", updatedAt: expected },
      data: {
        status: "ARCHIVED",
        achievedAt: null,
        sourceJson: {
          schema: "quipsly-transcript-derived-goal-v1",
          immutableSourceAnchor: { segmentId: "segment-1" },
          lastStatusReceipt: {
            id: "status-receipt-1",
            kind: "quipsly-goal-status-v1",
            surface: "ios-capture-work",
            previousStatus: "ACTIVE",
            nextStatus: "ARCHIVED",
            changedAt: now.toISOString(),
            changedByUserId: "user-1",
            externalSideEffects: false,
          },
        },
      },
    });
    expect(tx.goalProgressReceipt.create).toHaveBeenCalledWith({
      data: {
        goalId: "goal-1",
        actorUserId: "user-1",
        kind: "STATUS_CHANGED",
        progressPercent: null,
        note: null,
        evidenceJson: expect.objectContaining({ id: "status-receipt-1", nextStatus: "ARCHIVED" }),
        occurredAt: now,
      },
    });
  });

  it("fails closed when another device changed the goal first", async () => {
    const tx = {
      goal: {
        findFirst: jest.fn().mockResolvedValue({
          id: "goal-1",
          status: "ACTIVE",
          sourceJson: {},
          updatedAt: persisted,
        }),
        updateMany: jest.fn(),
      },
      goalProgressReceipt: { create: jest.fn() },
    };

    const result = await updateCanonicalGoalStatusInTransaction({
      tx,
      goalId: "goal-1",
      actorUserId: "user-1",
      expectedUpdatedAt: expected,
      nextStatus: "ARCHIVED",
      surface: "nest-work",
      now,
    });

    expect(result).toEqual({ kind: "conflict" });
    expect(tx.goal.updateMany).not.toHaveBeenCalled();
    expect(tx.goalProgressReceipt.create).not.toHaveBeenCalled();
  });

  it("attributes a shared coaching status change to the collaborator", async () => {
    const tx = {
      goal: {
        findFirst: jest.fn().mockResolvedValue({ id: "goal-1", status: "ACTIVE", sourceJson: {}, updatedAt: expected }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue({ id: "goal-1", status: "PAUSED", updatedAt: persisted }),
      },
      goalProgressReceipt: { create: jest.fn().mockResolvedValue({ id: "progress-1" }) },
    };
    const accessOr: Prisma.GoalWhereInput[] = [
      { ownerUserId: "coach-1" },
      { engagement: { is: { status: "ACTIVE", members: { some: { userId: "coach-1", status: "ACTIVE", role: "COACH" } } } } },
    ];

    const result = await updateCanonicalGoalStatusInTransaction({
      tx,
      goalId: "goal-1",
      actorUserId: "coach-1",
      accessOr,
      expectedUpdatedAt: expected,
      nextStatus: "PAUSED",
      surface: "ios-capture-work",
      now,
      receiptId: "coach-status-receipt",
    });

    expect(result.kind).toBe("saved");
    expect(tx.goal.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "goal-1", OR: accessOr, updatedAt: expected },
      data: expect.objectContaining({
        sourceJson: expect.objectContaining({
          lastStatusReceipt: expect.objectContaining({
            changedByUserId: "coach-1",
            nextStatus: "PAUSED",
          }),
        }),
      }),
    }));
    expect(tx.goalProgressReceipt.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      actorUserId: "coach-1",
      kind: "STATUS_CHANGED",
    }) });
  });
});
