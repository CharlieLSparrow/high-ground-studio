import { updateCanonicalTaskStatusInTransaction } from "./canonical-task-status";

const expected = new Date("2026-07-19T15:00:00.000Z");
const persisted = new Date("2026-07-19T15:00:01.000Z");
const now = new Date("2026-07-19T16:00:00.000Z");

const series = {
  id: "series-1",
  ownerUserId: "user-1",
  projectId: null,
  title: "Daily production reset",
  detail: null,
  cadence: "FIXED" as const,
  frequency: "DAILY" as const,
  interval: 1,
  timezone: "America/Denver",
  localTimeMinutes: 540,
  anchorLocalDate: "2026-07-18",
  anchorDayOfMonth: 18,
  status: "ACTIVE" as const,
  sourceJson: {},
};

describe("canonical recurring-task status truth", () => {
  it("preserves an explicitly missed next occurrence as skipped and continues the series", async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ lockAcquired: false }]),
      actionItem: {
        findFirst: jest.fn().mockResolvedValue({
          id: "task-1",
          roomId: null,
          status: "OPEN",
          dueAt: new Date("2026-07-18T15:00:00.000Z"),
          sourceJson: {},
          updatedAt: expected,
          recurrenceOccurrence: {
            id: "occurrence-1",
            occurrenceKey: "2026-07-18T09:00[America/Denver]",
            sourceJson: { materializationReceipt: { id: "materialized-1" } },
            series,
          },
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue({ roomId: null, status: "CANCELED", updatedAt: persisted }),
      },
      taskOccurrence: {
        findFirst: jest.fn()
          .mockResolvedValueOnce({ actionItemId: "task-1" })
          .mockResolvedValueOnce({ scheduledLocalDate: "2026-07-20" }),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    const result = await updateCanonicalTaskStatusInTransaction({
      tx,
      taskId: "task-1",
      actorUserId: "user-1",
      accessOr: [{ assignedUserId: "user-1" }],
      expectedUpdatedAt: expected,
      nextStatus: "CANCELED",
      decisionReason: "MISSED_OCCURRENCE_SKIPPED",
      surface: "ios-capture-today",
      now,
      receiptId: "missed-receipt-1",
    });

    expect(result).toMatchObject({ kind: "saved", nextOccurrenceTaskId: expect.any(String) });
    expect(tx.actionItem.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: "CANCELED",
        sourceJson: expect.objectContaining({
          statusReceipts: [expect.objectContaining({
            decisionReason: "MISSED_OCCURRENCE_SKIPPED",
            missedDueAt: "2026-07-18T15:00:00.000Z",
            historicalRecordPreserved: true,
            externalSideEffects: false,
          })],
        }),
      }),
    }));
    expect(tx.taskOccurrence.update).toHaveBeenCalledWith({
      where: { id: "occurrence-1" },
      data: {
        status: "SKIPPED",
        sourceJson: expect.objectContaining({
          resolutionReceipts: [expect.objectContaining({
            kind: "quipsly-task-occurrence-resolution-v1",
            decisionReason: "MISSED_OCCURRENCE_SKIPPED",
            occurrenceKey: "2026-07-18T09:00[America/Denver]",
          })],
          followingOccurrenceReceipt: expect.objectContaining({
            nextActionItemId: result.kind === "saved" ? result.nextOccurrenceTaskId : null,
            externalSideEffects: false,
          }),
        }),
      },
    });
  });

  it("does not reopen a superseded historical occurrence", async () => {
    const tx = {
      actionItem: {
        findFirst: jest.fn().mockResolvedValue({
          id: "task-history",
          roomId: null,
          status: "CANCELED",
          dueAt: new Date("2026-07-18T15:00:00.000Z"),
          sourceJson: { supersessionReceipt: { nextSeriesId: "series-next" } },
          updatedAt: expected,
          recurrenceOccurrence: null,
        }),
        updateMany: jest.fn(),
      },
    };
    const result = await updateCanonicalTaskStatusInTransaction({
      tx,
      taskId: "task-history",
      actorUserId: "user-1",
      accessOr: [{ assignedUserId: "user-1" }],
      expectedUpdatedAt: expected,
      nextStatus: "OPEN",
      surface: "nest-work",
      now,
    });
    expect(result).toEqual({ kind: "immutable-history" });
    expect(tx.actionItem.updateMany).not.toHaveBeenCalled();
  });

  it("rejects missed-occurrence semantics for work that is not overdue", async () => {
    const tx = {
      actionItem: {
        findFirst: jest.fn().mockResolvedValue({
          id: "task-future",
          roomId: null,
          status: "OPEN",
          dueAt: new Date("2026-07-20T15:00:00.000Z"),
          sourceJson: {},
          updatedAt: expected,
          recurrenceOccurrence: { id: "occurrence-future", occurrenceKey: "future", sourceJson: {}, series },
        }),
        updateMany: jest.fn(),
      },
    };
    const result = await updateCanonicalTaskStatusInTransaction({
      tx,
      taskId: "task-future",
      actorUserId: "user-1",
      accessOr: [{ assignedUserId: "user-1" }],
      expectedUpdatedAt: expected,
      nextStatus: "CANCELED",
      decisionReason: "MISSED_OCCURRENCE_SKIPPED",
      surface: "nest-work",
      now,
    });
    expect(result).toEqual({ kind: "not-missed" });
    expect(tx.actionItem.updateMany).not.toHaveBeenCalled();
  });
});
