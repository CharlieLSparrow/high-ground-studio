/** @jest-environment node */

import type { Prisma } from "@prisma/client";

import { editCanonicalTaskInTransaction } from "./canonical-task-edit";

const expectedUpdatedAt = new Date("2026-07-24T18:00:00.000Z");
const persistedUpdatedAt = new Date("2026-07-24T18:01:00.000Z");

function transaction(overrides: Record<string, unknown> = {}) {
  const current = {
    id: "task-1",
    roomId: null,
    status: "OPEN",
    title: "Old title",
    detail: "Old detail",
    dueAt: null,
    sourceJson: { source: "quipsly-work-manual-v1" },
    updatedAt: expectedUpdatedAt,
    recurrenceOccurrence: null,
    ...overrides,
  };
  return {
    actionItem: {
      findFirst: jest.fn().mockResolvedValue(current),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn().mockResolvedValue({
        id: "task-1",
        roomId: null,
        title: "Choose the opening story",
        detail: "Compare the two candidates.",
        dueAt: new Date("2026-07-25T15:00:00.000Z"),
        updatedAt: persistedUpdatedAt,
      }),
    },
  };
}

describe("canonical one-time task editing", () => {
  it("updates the assigned open task with an append-only, no-side-effect receipt", async () => {
    const tx = transaction();
    const result = await editCanonicalTaskInTransaction({
      tx,
      taskId: "task-1",
      actorUserId: "user-1",
      expectedUpdatedAt,
      title: "Choose the opening story",
      detail: "Compare the two candidates.",
      dueAt: new Date("2026-07-25T15:00:00.000Z"),
      dueIntent: {
        requestedLocalDateTime: "2026-07-25T09:00",
        resolvedLocalDateTime: "2026-07-25T09:00",
        dstResolution: "exact",
        timezone: "America/Denver",
      },
      surface: "nest-work",
      receiptId: "receipt-1",
    });

    expect(result).toMatchObject({
      kind: "saved",
      receiptId: "receipt-1",
      record: { id: "task-1", updatedAt: persistedUpdatedAt },
    });
    expect(tx.actionItem.updateMany).toHaveBeenCalledWith({
      where: {
        id: "task-1",
        assignedUserId: "user-1",
        status: "OPEN",
        updatedAt: expectedUpdatedAt,
      },
      data: expect.objectContaining({
        title: "Choose the opening story",
        detail: "Compare the two candidates.",
        dueAt: new Date("2026-07-25T15:00:00.000Z"),
        sourceJson: expect.objectContaining({
          editReceipts: [expect.objectContaining({
            id: "receipt-1",
            kind: "quipsly-work-item-edit-v1",
            reminderChanged: false,
            recurrenceChanged: false,
            statusChanged: false,
            tagsChanged: false,
            goalLinksChanged: false,
            providerCalendarEventChanged: false,
            externalSideEffects: false,
          })],
        }),
      }),
    });
  });

  it("records a coaching collaborator as the editor without changing assignment", async () => {
    const tx = transaction();
    const accessOr: Prisma.ActionItemWhereInput[] = [
      { assignedUserId: "coach-1" },
      { engagement: { is: { status: "ACTIVE", members: { some: { userId: "coach-1", status: "ACTIVE", role: "COACH" } } } } },
    ];

    const result = await editCanonicalTaskInTransaction({
      tx,
      taskId: "task-1",
      actorUserId: "coach-1",
      accessOr,
      expectedUpdatedAt,
      title: "Practice the reflected question",
      detail: "Try it once before the next Session.",
      dueAt: null,
      dueIntent: null,
      surface: "ios-capture-today",
      receiptId: "coach-edit-receipt",
    });

    expect(result.kind).toBe("saved");
    expect(tx.actionItem.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "task-1", OR: accessOr },
    }));
    expect(tx.actionItem.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "task-1", OR: accessOr }),
      data: expect.objectContaining({
        sourceJson: expect.objectContaining({
          editReceipts: [expect.objectContaining({
            id: "coach-edit-receipt",
            changedByUserId: "coach-1",
          })],
        }),
      }),
    }));
    expect(tx.actionItem.updateMany.mock.calls[0][0].data).not.toHaveProperty("assignedUserId");
  });

  it.each([
    [{ status: "DONE" }, "closed"],
    [{ recurrenceOccurrence: { id: "occurrence-1" } }, "recurring"],
    [{ sourceJson: { supersessionReceipt: { id: "superseded" } } }, "immutable-history"],
    [{ updatedAt: new Date("2026-07-24T19:00:00.000Z") }, "conflict"],
  ])("refuses unsafe task edit state %#", async (overrides, expectedKind) => {
    const tx = transaction(overrides);
    const result = await editCanonicalTaskInTransaction({
      tx,
      taskId: "task-1",
      actorUserId: "user-1",
      expectedUpdatedAt,
      title: "New title",
      detail: null,
      dueAt: null,
      dueIntent: null,
      surface: "nest-work",
    });
    expect(result.kind).toBe(expectedKind);
    expect(tx.actionItem.updateMany).not.toHaveBeenCalled();
  });
});
