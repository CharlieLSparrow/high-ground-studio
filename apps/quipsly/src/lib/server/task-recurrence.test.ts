import {
  editTaskRecurrenceOccurrenceInTransaction,
  ensureActiveSeriesHorizon,
  materializeFollowingOccurrence,
  materializeTaskOccurrence,
  replaceTaskRecurrenceFromOccurrenceInTransaction,
  type PersistedTaskRecurrenceSeries,
} from "./task-recurrence";

const series: PersistedTaskRecurrenceSeries = {
  id: "series-1", ownerUserId: "user-1", projectId: null, title: "Review coaching goals", detail: "Use the session notes",
  cadence: "FIXED", frequency: "DAILY", interval: 1, timezone: "America/Denver", localTimeMinutes: 540,
  anchorLocalDate: "2026-03-07", anchorDayOfMonth: 7, status: "ACTIVE",
};

describe("task recurrence materialization", () => {
  it("creates one canonical task and one identity receipt without external effects", async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ pg_advisory_xact_lock: null }]),
      taskOccurrence: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}) },
      actionItem: { create: jest.fn().mockResolvedValue({}) },
    };
    const result = await materializeTaskOccurrence({
      tx,
      series,
      actorUserId: "user-1",
      reason: "series-created",
      occurrence: {
        occurrenceKey: "2026-03-07T09:00[America/Denver]", scheduledLocalDate: "2026-03-07",
        scheduledFor: new Date("2026-03-07T16:00:00.000Z"), requestedLocalDateTime: "2026-03-07T09:00",
        resolvedLocalDateTime: "2026-03-07T09:00", dstResolution: "exact",
      },
    });
    expect(result).toMatchObject({ created: true, actionItemId: expect.any(String) });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.actionItem.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      assignedUserId: "user-1", dueAt: new Date("2026-03-07T16:00:00.000Z"),
      sourceJson: expect.objectContaining({ materializationReceipt: expect.objectContaining({ externalSideEffects: false, notificationScheduled: false, providerCalendarEventCreated: false }) }),
    }) });
    expect(tx.taskOccurrence.create).toHaveBeenCalledWith({ data: expect.objectContaining({ actionItemId: result.actionItemId, occurrenceKey: "2026-03-07T09:00[America/Denver]" }) });
  });

  it("returns the existing identity on retry instead of creating a duplicate", async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ pg_advisory_xact_lock: null }]),
      taskOccurrence: { findUnique: jest.fn().mockResolvedValue({ id: "occurrence-existing", actionItemId: "task-existing" }), create: jest.fn() },
      actionItem: { create: jest.fn() },
    };
    const result = await materializeTaskOccurrence({
      tx, series, actorUserId: "user-1", reason: "series-created",
      occurrence: { occurrenceKey: "same", scheduledLocalDate: "2026-03-07", scheduledFor: new Date(), requestedLocalDateTime: "2026-03-07T09:00", resolvedLocalDateTime: "2026-03-07T09:00", dstResolution: "exact" },
    });
    expect(result).toEqual({ created: false, occurrenceId: "occurrence-existing", actionItemId: "task-existing" });
    expect(tx.actionItem.create).not.toHaveBeenCalled();
  });

  it("tops up a fixed series after its latest persisted local date", async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ pg_advisory_xact_lock: null }]),
      taskOccurrence: {
        findFirst: jest.fn().mockResolvedValue({ scheduledLocalDate: "2026-03-09" }),
        findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}),
      },
      actionItem: { create: jest.fn().mockResolvedValue({}) },
    };
    await materializeFollowingOccurrence({ tx, series, completedAt: new Date("2026-03-07T17:00:00.000Z"), actorUserId: "user-1" });
    expect(tx.taskOccurrence.create).toHaveBeenCalledWith({ data: expect.objectContaining({ scheduledLocalDate: "2026-03-10" }) });
  });

  it("restores a fixed series to three open occurrences when it resumes", async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ lockAcquired: false }]),
      taskOccurrence: {
        count: jest.fn().mockResolvedValue(1),
        findFirst: jest.fn()
          .mockResolvedValueOnce({ scheduledLocalDate: "2026-03-09" })
          .mockResolvedValueOnce({ scheduledLocalDate: "2026-03-10" }),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      actionItem: { create: jest.fn().mockResolvedValue({}) },
    };
    const restored = await ensureActiveSeriesHorizon({
      tx,
      series,
      basisAt: new Date("2026-03-09T18:00:00.000Z"),
      actorUserId: "user-1",
    });
    expect(restored).toHaveLength(2);
    expect(tx.taskOccurrence.create.mock.calls.map(([call]) => call.data.scheduledLocalDate)).toEqual([
      "2026-03-10",
      "2026-03-11",
    ]);
  });

  it("edits one open occurrence without changing its due time or series", async () => {
    const expected = new Date("2026-07-19T20:00:00.000Z");
    const persisted = new Date("2026-07-19T20:00:01.000Z");
    const tx = {
      actionItem: {
        findFirst: jest.fn().mockResolvedValue({
          id: "task-1",
          title: "Review the draft",
          detail: null,
          dueAt: new Date("2026-07-20T15:00:00.000Z"),
          status: "OPEN",
          sourceJson: { source: "quipsly-task-recurrence-v1" },
          updatedAt: expected,
          recurrenceOccurrence: { id: "occurrence-1", seriesId: "series-1", occurrenceKey: "2026-07-20T09:00[America/Denver]" },
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue({
          id: "task-1",
          title: "Proof-listen the draft",
          detail: "Use the immutable source",
          dueAt: new Date("2026-07-20T15:00:00.000Z"),
          updatedAt: persisted,
        }),
      },
    };
    const result = await editTaskRecurrenceOccurrenceInTransaction({
      tx,
      taskId: "task-1",
      actorUserId: "user-1",
      expectedTaskUpdatedAt: expected,
      clientRequestId: "97767053-f2c1-47fc-a21d-6bd32ed30a0e",
      title: "Proof-listen the draft",
      detail: "Use the immutable source",
      surface: "ios-capture-today",
    });
    expect(result).toMatchObject({ kind: "saved", reused: false, persisted: { dueAt: new Date("2026-07-20T15:00:00.000Z") } });
    expect(tx.actionItem.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        title: "Proof-listen the draft",
        detail: "Use the immutable source",
        sourceJson: expect.objectContaining({
          lastEditReceipt: expect.objectContaining({
            scope: "THIS_OCCURRENCE",
            dueAtPreserved: "2026-07-20T15:00:00.000Z",
            externalSideEffects: false,
          }),
        }),
      }),
    }));
    expect(tx).not.toHaveProperty("taskRecurrenceSeries");
  });

  it("replaces only the next open horizon while preserving prior recurrence history", async () => {
    const expectedSeries = new Date("2026-07-19T20:00:00.000Z");
    const expectedTask = new Date("2026-07-19T19:00:00.000Z");
    const priorSeries = {
      ...series,
      id: "series-prior",
      title: "Weekly production review",
      detail: null,
      frequency: "WEEKLY" as const,
      anchorLocalDate: "2026-07-20",
      anchorDayOfMonth: 20,
      sourceJson: { recurrenceRoomId: "room-1" },
      updatedAt: expectedSeries,
    };
    const superseded = ["task-next", "task-later"].map((id, index) => ({
      id: `occurrence-${index + 1}`,
      occurrenceKey: `2026-0${index + 7}-20T09:00[America/Denver]`,
      actionItem: { id, sourceJson: { source: "quipsly-task-recurrence-v1" }, updatedAt: expectedTask },
    }));
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ lockAcquired: false }]),
      taskRecurrenceSeries: {
        findFirst: jest.fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(priorSeries),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockImplementation(async ({ data }) => ({ ...data, endedAt: null })),
      },
      taskOccurrence: {
        findFirst: jest.fn()
          .mockResolvedValueOnce({
            id: "occurrence-1",
            occurrenceKey: "2026-07-20T09:00[America/Denver]",
            scheduledFor: new Date("2026-07-20T15:00:00.000Z"),
            actionItem: { id: "task-next", updatedAt: expectedTask },
          })
          .mockResolvedValueOnce({ actionItemId: "task-next" }),
        findMany: jest.fn().mockResolvedValue(superseded),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({}),
      },
      actionItem: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const result = await replaceTaskRecurrenceFromOccurrenceInTransaction({
      tx,
      priorSeriesId: "series-prior",
      anchorTaskId: "task-next",
      actorUserId: "user-1",
      expectedSeriesUpdatedAt: expectedSeries,
      expectedTaskUpdatedAt: expectedTask,
      nextSeriesId: "series-next",
      clientRequestId: "fd80c8b1-12c2-47e8-8658-d0f07b2e5c7f",
      title: "Biweekly production review",
      detail: "Use the producer checklist",
      nextRule: {
        cadence: "FIXED",
        frequency: "WEEKLY",
        interval: 2,
        timezone: "America/New_York",
        localTimeMinutes: 600,
        anchorLocalDate: "2026-07-21",
        anchorDayOfMonth: 21,
      },
      surface: "ios-capture-today",
    });
    expect(result).toMatchObject({
      kind: "saved",
      reused: false,
      priorSeriesId: "series-prior",
      nextSeriesId: "series-next",
      supersededTaskCount: 2,
      materializedCount: 3,
    });
    expect(tx.taskRecurrenceSeries.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: "ENDED",
        sourceJson: expect.objectContaining({
          lastRevisionReceipt: expect.objectContaining({
            scope: "THIS_AND_FUTURE",
            historicalOccurrencesPreserved: true,
            externalSideEffects: false,
          }),
        }),
      }),
    }));
    expect(tx.actionItem.updateMany).toHaveBeenCalledTimes(2);
    expect(tx.actionItem.updateMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: expect.objectContaining({
        id: "task-next",
        assignedUserId: "user-1",
        status: "OPEN",
        updatedAt: expectedTask,
      }),
    }));
    expect(tx.taskOccurrence.update).toHaveBeenCalledTimes(2);
    expect(tx.actionItem.create).toHaveBeenCalledTimes(3);
    expect(tx.taskRecurrenceSeries.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      id: "series-next",
      ownerUserId: "user-1",
      projectId: null,
      cadence: "FIXED",
      frequency: "WEEKLY",
      interval: 2,
      timezone: "America/New_York",
      sourceJson: expect.objectContaining({ recurrenceRoomId: "room-1" }),
    }) });
  });
});
