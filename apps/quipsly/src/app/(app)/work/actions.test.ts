import { revalidatePath } from "next/cache";

import { getPrismaClient } from "@/lib/prisma";
import { listProjectsVisibleToEmail } from "@/lib/server/home-nest";
import { getQuipslySession } from "@/lib/server/quipsly-session";

import { createWorkGoal, createWorkTask, editWorkTask, linkWorkGoalTask, recordWorkGoalProgress, saveWeeklyCommitment, setWorkTaskReminder, updateTaskRecurrenceStatus, updateWorkGoalStatus, updateWorkTaskStatus } from "./actions";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/home-nest", () => ({ listProjectsVisibleToEmail: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySession: jest.fn() }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));

const expected = new Date("2026-07-18T18:00:00.000Z");
const persisted = new Date("2026-07-18T18:00:01.000Z");

function signedIn() {
  jest.mocked(getQuipslySession).mockResolvedValue({ user: { id: "user-1", primaryEmail: "person@example.test" } } as any);
}

describe("Work Queue task decisions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(listProjectsVisibleToEmail).mockResolvedValue([] as any);
  });
  afterEach(() => jest.useRealTimers());

  it("fails before database access when signed out", async () => {
    jest.mocked(getQuipslySession).mockResolvedValue(null as any);
    const result = await updateWorkTaskStatus({ taskId: "task-1", nextStatus: "DONE", expectedUpdatedAt: expected.toISOString() });
    expect(result).toMatchObject({ ok: false, code: "AUTH_REQUIRED" });
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it("creates an explicitly self-assigned personal task with no external side effects", async () => {
    signedIn();
    const prisma = { actionItem: { create: jest.fn().mockResolvedValue({ id: "task-new", updatedAt: persisted }) } };
    jest.mocked(getPrismaClient).mockReturnValue(prisma as any);
    const result = await createWorkTask({ title: " Draft the next episode ", detail: "Use source notes", dueAt: "2026-07-20T18:00:00.000Z" });
    expect(result).toMatchObject({ ok: true, taskId: "task-new", updatedAt: persisted.toISOString(), receiptId: expect.any(String) });
    expect(prisma.actionItem.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        assignedUserId: "user-1",
        title: "Draft the next episode",
        detail: "Use source notes",
        dueAt: new Date("2026-07-20T18:00:00.000Z"),
        sourceJson: expect.objectContaining({
          source: "quipsly-work-manual-v1",
          creationReceipt: expect.objectContaining({ assignedToCreator: true, externalSideEffects: false }),
        }),
      }),
    }));
  });

  it("edits an assigned one-time task with optimistic concurrency and local due-time intent", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-07-24T12:00:00.000Z"));
    signedIn();
    const tx = {
      actionItem: {
        findFirst: jest.fn().mockResolvedValue({
          id: "task-1",
          roomId: null,
          status: "OPEN",
          title: "Old title",
          detail: null,
          dueAt: null,
          sourceJson: { source: "quipsly-work-manual-v1" },
          updatedAt: expected,
          recurrenceOccurrence: null,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue({
          id: "task-1",
          roomId: null,
          title: "Choose the cold-open story",
          detail: "Compare the strongest candidates.",
          dueAt: new Date("2026-07-25T15:00:00.000Z"),
          updatedAt: persisted,
        }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    jest.mocked(getPrismaClient).mockReturnValue(prisma as any);

    const result = await editWorkTask({
      taskId: "task-1",
      title: " Choose the cold-open story ",
      detail: " Compare the strongest candidates. ",
      dueLocal: "2026-07-25T09:00",
      timezone: "America/Denver",
      expectedUpdatedAt: expected.toISOString(),
    });

    expect(result).toMatchObject({
      ok: true,
      taskId: "task-1",
      title: "Choose the cold-open story",
      detail: "Compare the strongest candidates.",
      dueAt: "2026-07-25T15:00:00.000Z",
      updatedAt: persisted.toISOString(),
      receiptId: expect.any(String),
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
    expect(tx.actionItem.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: "task-1",
        assignedUserId: "user-1",
        status: "OPEN",
        updatedAt: expected,
      }),
      data: expect.objectContaining({
        title: "Choose the cold-open story",
        detail: "Compare the strongest candidates.",
        dueAt: new Date("2026-07-25T15:00:00.000Z"),
        sourceJson: expect.objectContaining({
          editReceipts: [expect.objectContaining({
            dueIntent: expect.objectContaining({
              requestedLocalDateTime: "2026-07-25T09:00",
              timezone: "America/Denver",
            }),
            externalSideEffects: false,
          })],
        }),
      }),
    }));
    expect(revalidatePath).toHaveBeenCalledWith("/schedule");
    expect(revalidatePath).toHaveBeenCalledWith("/today");
  });

  it("creates canonical reminder intent with an append-only revision and no delivery claim", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-07-24T12:00:00.000Z"));
    signedIn();
    const reminderUpdatedAt = new Date("2026-07-18T18:00:02.000Z");
    const tx = {
      taskReminderRevision: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: "revision" }),
      },
      actionItem: {
        findFirst: jest.fn().mockResolvedValue({
          id: "task-1",
          status: "OPEN",
          updatedAt: expected,
          recurrenceOccurrence: null,
          reminder: null,
        }),
      },
      taskReminder: {
        create: jest.fn().mockImplementation(async ({ data }) => ({
          ...data,
          updatedAt: reminderUpdatedAt,
        })),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    jest.mocked(getPrismaClient).mockReturnValue(prisma as any);
    const result = await setWorkTaskReminder({
      taskId: "task-1",
      remindAtLocal: "2026-07-24T08:30",
      timezone: "America/Denver",
      expectedTaskUpdatedAt: expected.toISOString(),
      expectedReminderUpdatedAt: null,
      clientRequestId: "4dc5a283-4f32-4f40-b6ff-d15bb938f782",
    });
    expect(result).toMatchObject({
      ok: true,
      taskId: "task-1",
      remindAt: "2026-07-24T14:30:00.000Z",
      status: "ACTIVE",
      operation: "CREATED",
      idempotentReplay: false,
      deviceNotificationsReconciled: false,
      delivered: false,
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
    expect(tx.taskReminder.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      actionItemId: "task-1",
      ownerUserId: "user-1",
      remindAt: new Date("2026-07-24T14:30:00.000Z"),
      sourceJson: expect.objectContaining({
        explicitHumanIntent: true,
        deviceNotificationScheduled: false,
        deliveryClaimed: false,
      }),
    }) });
    expect(tx.taskReminderRevision.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      actorUserId: "user-1",
      operation: "CREATED",
      status: "ACTIVE",
      sourceJson: expect.objectContaining({
        surface: "nest-work",
        deviceNotificationsReconciled: false,
        deliveryClaimed: false,
      }),
    }) });
    expect(revalidatePath).toHaveBeenCalledWith("/today");
    expect(revalidatePath).toHaveBeenCalledWith("/schedule");
  });

  it("cancels an owned reminder while preserving its task, time, and revision history", async () => {
    signedIn();
    const reminderUpdatedAt = new Date("2026-07-18T18:00:02.000Z");
    const canceledAt = new Date("2026-07-18T18:00:03.000Z");
    const currentReminder = {
      id: "reminder-1",
      actionItemId: "task-1",
      ownerUserId: "user-1",
      remindAt: new Date("2026-07-24T14:30:00.000Z"),
      status: "ACTIVE",
      sourceJson: { schema: "quipsly-task-reminder-intent-v1" },
      updatedAt: reminderUpdatedAt,
    };
    const tx = {
      taskReminderRevision: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: "revision" }),
      },
      actionItem: {
        findFirst: jest.fn().mockResolvedValue({
          id: "task-1",
          status: "OPEN",
          updatedAt: expected,
          recurrenceOccurrence: null,
          reminder: currentReminder,
        }),
      },
      taskReminder: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          ...currentReminder,
          status: "CANCELED",
          updatedAt: canceledAt,
        }),
      },
    };
    jest.mocked(getPrismaClient).mockReturnValue({
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    } as any);
    const result = await setWorkTaskReminder({
      taskId: "task-1",
      remindAtLocal: null,
      timezone: "America/Denver",
      expectedTaskUpdatedAt: expected.toISOString(),
      expectedReminderUpdatedAt: reminderUpdatedAt.toISOString(),
      clientRequestId: "0507e39a-4760-4894-8d58-ec61d1309189",
    });
    expect(result).toMatchObject({
      ok: true,
      reminderId: "reminder-1",
      remindAt: null,
      status: "CANCELED",
      operation: "CANCELED",
      delivered: false,
    });
    expect(tx.taskReminder.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "CANCELED" }),
    }));
    expect(tx.taskReminderRevision.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      operation: "CANCELED",
      previousRemindAt: currentReminder.remindAt,
      remindAt: null,
      previousStatus: "ACTIVE",
      status: "CANCELED",
    }) });
    expect(tx.actionItem.findFirst).toHaveBeenCalledTimes(1);
  });

  it("does not attach a one-time reminder to recurring work", async () => {
    signedIn();
    const tx = {
      taskReminderRevision: { findUnique: jest.fn().mockResolvedValue(null) },
      actionItem: {
        findFirst: jest.fn().mockResolvedValue({
          id: "task-1",
          status: "OPEN",
          updatedAt: expected,
          recurrenceOccurrence: { id: "occurrence-1" },
          reminder: null,
        }),
      },
    };
    jest.mocked(getPrismaClient).mockReturnValue({
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    } as any);
    const result = await setWorkTaskReminder({
      taskId: "task-1",
      remindAtLocal: "2026-07-24T08:30",
      timezone: "America/Denver",
      expectedTaskUpdatedAt: expected.toISOString(),
      expectedReminderUpdatedAt: null,
      clientRequestId: "7dd3da60-988a-4515-8ebf-785c4dc12828",
    });
    expect(result).toMatchObject({ ok: false, code: "INVALID_INPUT" });
  });

  it("creates an atomic fixed series with three idempotent canonical occurrences", async () => {
    signedIn();
    const createdActionIds: string[] = [];
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ lockAcquired: false }]),
      taskRecurrenceSeries: { create: jest.fn().mockImplementation(async ({ data }) => ({ ...data, status: "ACTIVE" })) },
      taskOccurrence: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      actionItem: {
        create: jest.fn().mockImplementation(async ({ data }) => { createdActionIds.push(data.id); return data; }),
        findUnique: jest.fn().mockImplementation(async ({ where }) => ({ id: where.id, updatedAt: persisted })),
      },
    };
    const prisma = { $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) };
    jest.mocked(getPrismaClient).mockReturnValue(prisma as any);
    const result = await createWorkTask({
      title: "Review coaching goals",
      dueLocal: "2026-03-07T09:00",
      timezone: "America/Denver",
      recurrence: { cadence: "FIXED", frequency: "DAILY", interval: 1 },
    });
    expect(result).toMatchObject({ ok: true, recurrenceSeriesId: expect.any(String), occurrenceCount: 3, taskId: createdActionIds[0] });
    expect(tx.taskRecurrenceSeries.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      ownerUserId: "user-1", cadence: "FIXED", frequency: "DAILY", timezone: "America/Denver", localTimeMinutes: 540,
      sourceJson: expect.objectContaining({ creationReceipt: expect.objectContaining({ notificationScheduled: false, providerCalendarEventCreated: false }) }),
    }) });
    expect(tx.actionItem.create).toHaveBeenCalledTimes(3);
    expect(tx.taskOccurrence.create).toHaveBeenCalledTimes(3);
    expect(tx.actionItem.create.mock.calls.map(([call]) => call.data.dueAt.toISOString())).toEqual([
      "2026-03-07T16:00:00.000Z",
      "2026-03-08T15:00:00.000Z",
      "2026-03-09T15:00:00.000Z",
    ]);
  });

  it("rejects recurring local time without a valid IANA timezone before mutation", async () => {
    signedIn();
    const prisma = { $transaction: jest.fn() };
    jest.mocked(getPrismaClient).mockReturnValue(prisma as any);
    const result = await createWorkTask({ title: "Never materialized", dueLocal: "2026-03-07T09:00", timezone: "Mountain-ish", recurrence: { cadence: "FIXED", frequency: "DAILY" } });
    expect(result).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("restores the bounded fixed horizon when an owned paused series resumes", async () => {
    signedIn();
    const sourceJson = { source: "quipsly-task-recurrence-v1" };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ lockAcquired: false }]),
      taskRecurrenceSeries: {
        findFirst: jest.fn().mockResolvedValue({
          id: "series-paused", ownerUserId: "user-1", projectId: null, title: "Weekly production review", detail: null,
          cadence: "FIXED", frequency: "WEEKLY", interval: 1, timezone: "America/Denver", localTimeMinutes: 540,
          anchorLocalDate: "2026-07-20", anchorDayOfMonth: 20, status: "PAUSED", sourceJson, updatedAt: expected,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue({ updatedAt: persisted }),
      },
      taskOccurrence: {
        count: jest.fn().mockResolvedValue(2),
        findFirst: jest.fn().mockResolvedValue({ scheduledLocalDate: "2026-07-27" }),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      actionItem: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = { $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) };
    jest.mocked(getPrismaClient).mockReturnValue(prisma as any);
    const result = await updateTaskRecurrenceStatus({
      seriesId: "series-paused",
      nextStatus: "ACTIVE",
      expectedUpdatedAt: expected.toISOString(),
    });
    expect(result).toMatchObject({ ok: true, status: "ACTIVE", materializedCount: 1, updatedAt: persisted.toISOString() });
    expect(tx.actionItem.create).toHaveBeenCalledTimes(1);
    expect(tx.taskRecurrenceSeries.update).toHaveBeenCalledWith({
      where: { id: "series-paused" },
      data: { sourceJson: expect.objectContaining({ lastStatusReceipt: expect.objectContaining({ materializedActionItemIds: [expect.any(String)] }) }) },
    });
  });

  it("creates an owned canonical goal without inventing tasks or calendar work", async () => {
    signedIn();
    const prisma = { goal: { create: jest.fn().mockResolvedValue({ id: "goal-new", updatedAt: persisted }) } };
    jest.mocked(getPrismaClient).mockReturnValue(prisma as any);
    const result = await createWorkGoal({ title: "Publish a trustworthy episode", description: "Proof-listen the final artifact", targetAt: "2026-08-01T12:00:00.000Z" });
    expect(result).toMatchObject({ ok: true, goalId: "goal-new", receiptId: expect.any(String) });
    expect(prisma.goal.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      ownerUserId: "user-1",
      title: "Publish a trustworthy episode",
      description: "Proof-listen the final artifact",
      sourceJson: expect.objectContaining({ creationReceipt: expect.objectContaining({ externalSideEffects: false }) }),
    }) }));
  });

  it("files new work only into a Nest where the actor can write", async () => {
    signedIn();
    const prisma = { actionItem: { create: jest.fn().mockResolvedValue({ id: "task-project", updatedAt: persisted }) } };
    jest.mocked(getPrismaClient).mockReturnValue(prisma as any);
    jest.mocked(listProjectsVisibleToEmail).mockResolvedValue([{ id: "project-1", role: "EDITOR" }] as any);
    const result = await createWorkTask({ title: "Proof-listen the episode", projectId: "project-1" });
    expect(result).toMatchObject({ ok: true, taskId: "task-project" });
    expect(prisma.actionItem.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ projectId: "project-1" }) }));

    jest.mocked(listProjectsVisibleToEmail).mockResolvedValue([{ id: "project-viewer", role: "VIEWER" }] as any);
    const viewerResult = await createWorkTask({ title: "Should remain uncreated", projectId: "project-viewer" });
    expect(viewerResult).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(prisma.actionItem.create).toHaveBeenCalledTimes(1);
  });

  it("changes an owned goal status with optimistic concurrency and progress evidence", async () => {
    signedIn();
    const tx = { goal: {
      findFirst: jest.fn().mockResolvedValue({ id: "goal-1", status: "ACTIVE", sourceJson: {}, updatedAt: expected }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn().mockResolvedValue({ updatedAt: persisted }),
    }, goalProgressReceipt: { create: jest.fn().mockResolvedValue({ id: "progress-1" }) } };
    const prisma = {
      goal: { findFirst: jest.fn().mockResolvedValue({ id: "goal-1", status: "ACTIVE", sourceJson: {}, updatedAt: expected }) },
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    jest.mocked(getPrismaClient).mockReturnValue(prisma as any);
    const result = await updateWorkGoalStatus({ goalId: "goal-1", nextStatus: "ACHIEVED", expectedUpdatedAt: expected.toISOString() });
    expect(result).toMatchObject({ ok: true, goalId: "goal-1", status: "ACHIEVED", updatedAt: persisted.toISOString() });
    expect(tx.goal.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "ACHIEVED", achievedAt: expect.any(Date) }) }));
    expect(tx.goalProgressReceipt.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ kind: "STATUS_CHANGED", progressPercent: 100, actorUserId: "user-1" }) }));
  });

  it("records bounded goal progress without silently marking the goal achieved", async () => {
    signedIn();
    const tx = { goal: {
      findFirst: jest.fn().mockResolvedValue({ id: "goal-1", status: "ACTIVE", sourceJson: {}, updatedAt: expected }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn().mockResolvedValue({ status: "ACTIVE", updatedAt: persisted }),
    }, goalProgressReceipt: { create: jest.fn().mockResolvedValue({ id: "progress-1" }) } };
    const prisma = { $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) };
    jest.mocked(getPrismaClient).mockReturnValue(prisma as any);
    const result = await recordWorkGoalProgress({ goalId: "goal-1", progressPercent: 75, note: "Transcript corrected against playback", expectedUpdatedAt: expected.toISOString() });
    expect(result).toMatchObject({ ok: true, status: "ACTIVE" });
    expect(tx.goalProgressReceipt.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ progressPercent: 75, note: "Transcript corrected against playback" }) }));
    expect(tx.goal.updateMany.mock.calls[0][0].data).not.toHaveProperty("status");
  });

  it("links only an accessible committed task after winning the goal revision", async () => {
    signedIn();
    const tx = {
      goal: {
        findFirst: jest.fn().mockResolvedValue({ id: "goal-1", status: "ACTIVE", sourceJson: {}, updatedAt: expected }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue({ status: "ACTIVE", updatedAt: persisted }),
      },
      actionItem: { findFirst: jest.fn().mockResolvedValue({ id: "task-1", sourceJson: { source: "quipsly-work-manual-v1" } }) },
      goalTaskLink: { upsert: jest.fn().mockResolvedValue({ goalId: "goal-1", actionItemId: "task-1" }) },
    };
    const prisma = { $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) };
    jest.mocked(getPrismaClient).mockReturnValue(prisma as any);
    const result = await linkWorkGoalTask({ goalId: "goal-1", taskId: "task-1", relationship: "CONTRIBUTES", expectedUpdatedAt: expected.toISOString() });
    expect(result).toMatchObject({ ok: true, status: "ACTIVE" });
    expect(tx.goal.updateMany.mock.invocationCallOrder[0]).toBeLessThan(tx.goalTaskLink.upsert.mock.invocationCallOrder[0]);
    expect(tx.goalTaskLink.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ createdByUserId: "user-1", relationship: "CONTRIBUTES", sourceJson: expect.objectContaining({ externalSideEffects: false }) }) }));
  });

  it("creates the actor's weekly plan with separate client-review evidence and no external effects", async () => {
    signedIn();
    const tx = { weeklyCommitment: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: "week-1", updatedAt: persisted }),
    } };
    const prisma = { $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) };
    jest.mocked(getPrismaClient).mockReturnValue(prisma as any);
    const result = await saveWeeklyCommitment({
      weekStartsOn: "2026-07-13",
      commitmentOne: "Proof-listen the episode",
      supportNeeded: "A real second listener",
      progressNotes: "The transcript is source-linked",
      clientReviewed: true,
    });
    expect(result).toMatchObject({ ok: true, commitmentId: "week-1", receiptId: expect.any(String) });
    expect(tx.weeklyCommitment.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      clientUserId: "user-1",
      weekStartsAt: new Date("2026-07-13T12:00:00.000Z"),
      commitmentOne: "Proof-listen the episode",
      clientReviewedAt: expect.any(Date),
      sourceJson: expect.objectContaining({ clientPlanReceipts: [expect.objectContaining({ externalSideEffects: false, clientReviewed: true })] }),
    }) }));
  });

  it("rejects inaccessible or quarantined tasks without mutation", async () => {
    signedIn();
    const tx = { actionItem: { findFirst: jest.fn().mockResolvedValue(null) } };
    const prisma = { $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) };
    jest.mocked(getPrismaClient).mockReturnValue(prisma as any);
    const result = await updateWorkTaskStatus({ taskId: "task-1", nextStatus: "DONE", expectedUpdatedAt: expected.toISOString() });
    expect(result).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("returns a conflict when the expected revision is stale", async () => {
    signedIn();
    const tx = { actionItem: { findFirst: jest.fn().mockResolvedValue({ id: "task-1", roomId: null, status: "OPEN", sourceJson: {}, updatedAt: persisted }) } };
    const prisma = { $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) };
    jest.mocked(getPrismaClient).mockReturnValue(prisma as any);
    const result = await updateWorkTaskStatus({ taskId: "task-1", nextStatus: "DONE", expectedUpdatedAt: expected.toISOString() });
    expect(result).toMatchObject({ ok: false, code: "CONFLICT" });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("rechecks access and revision, then saves a bounded internal receipt", async () => {
    signedIn();
    const tx = {
      actionItem: {
        findFirst: jest.fn().mockResolvedValue({ id: "task-1", roomId: "room-1", status: "OPEN", sourceJson: { statusReceipts: Array.from({ length: 30 }, (_, index) => ({ id: `old-${index}` })) }, updatedAt: expected, recurrenceOccurrence: null }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue({ roomId: "room-1", status: "DONE", updatedAt: persisted }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    jest.mocked(getPrismaClient).mockReturnValue(prisma as any);

    const result = await updateWorkTaskStatus({ taskId: "task-1", nextStatus: "DONE", expectedUpdatedAt: expected.toISOString() });
    expect(result).toMatchObject({ ok: true, taskId: "task-1", status: "DONE", updatedAt: persisted.toISOString(), receiptId: expect.any(String) });
    expect(tx.actionItem.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "task-1", updatedAt: expected },
      data: expect.objectContaining({ status: "DONE", completedAt: expect.any(Date) }),
    }));
    const data = tx.actionItem.updateMany.mock.calls[0][0].data;
    expect(data.sourceJson.statusReceipts).toHaveLength(24);
    expect(data.sourceJson.statusReceipts.at(-1)).toMatchObject({
      kind: "quipsly-work-item-status-v1",
      previousStatus: "OPEN",
      nextStatus: "DONE",
      changedByUserId: "user-1",
      externalSideEffects: false,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/work");
    expect(revalidatePath).toHaveBeenCalledWith("/schedule");
    expect(revalidatePath).toHaveBeenCalledWith("/sessions/room-1");
  });

  it("materializes the next completion-based task in the same transaction as completion", async () => {
    signedIn();
    const recurrenceSeries = {
      id: "series-completion", ownerUserId: "user-1", projectId: null, title: "Write coaching reflection", detail: null,
      cadence: "COMPLETION", frequency: "WEEKLY", interval: 1, timezone: "America/Denver", localTimeMinutes: 540,
      anchorLocalDate: "2026-07-18", anchorDayOfMonth: 18, status: "ACTIVE",
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ lockAcquired: false }]),
      actionItem: {
        findFirst: jest.fn().mockResolvedValue({ id: "task-1", roomId: null, status: "OPEN", sourceJson: {}, updatedAt: expected, recurrenceOccurrence: { id: "occurrence-1", sourceJson: {}, series: recurrenceSeries } }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue({ roomId: null, status: "DONE", updatedAt: persisted }),
      },
      taskOccurrence: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}), update: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    jest.mocked(getPrismaClient).mockReturnValue(prisma as any);
    const result = await updateWorkTaskStatus({ taskId: "task-1", nextStatus: "DONE", expectedUpdatedAt: expected.toISOString() });
    expect(result).toMatchObject({ ok: true, nextOccurrenceTaskId: expect.any(String) });
    expect(tx.actionItem.create).toHaveBeenCalledWith({ data: expect.objectContaining({ title: "Write coaching reflection", assignedUserId: "user-1" }) });
    expect(tx.taskOccurrence.create).toHaveBeenCalledWith({ data: expect.objectContaining({ seriesId: "series-completion", actionItemId: result.ok ? result.nextOccurrenceTaskId : undefined }) });
    expect(tx.taskOccurrence.update).toHaveBeenCalledWith({ where: { id: "occurrence-1" }, data: { sourceJson: expect.objectContaining({ followingOccurrenceReceipt: expect.objectContaining({ nextActionItemId: result.ok ? result.nextOccurrenceTaskId : undefined, externalSideEffects: false }) }) } });
  });
});
