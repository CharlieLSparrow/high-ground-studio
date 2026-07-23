/** @jest-environment node */

import { randomUUID } from "node:crypto";

import { getPrismaClient } from "@/lib/prisma";

import { setTaskReminderInTransaction } from "./task-reminders";

jest.mock("@/auth", () => ({ auth: jest.fn() }));

const runLocalDatabaseSmoke = process.env.QUIPSLY_LOCAL_DB_SMOKE === "1" ? describe : describe.skip;
if (process.env.QUIPSLY_LOCAL_DB_SMOKE === "1") {
  if (!process.env.QUIPSLY_LOCAL_DATABASE_URL) {
    throw new Error("QUIPSLY_LOCAL_DATABASE_URL is required for the task reminder smoke.");
  }
  process.env.DATABASE_URL = process.env.QUIPSLY_LOCAL_DATABASE_URL;
}

runLocalDatabaseSmoke("canonical task reminders local database smoke", () => {
  const prisma = getPrismaClient();
  const nonce = randomUUID().slice(0, 8);
  let ownerUserId = "";
  let otherUserId = "";
  let taskId = "";
  let taskUpdatedAt = new Date(0);

  beforeAll(async () => {
    const [owner, other] = await Promise.all([
      prisma.user.create({
        data: {
          primaryEmail: `task-reminder-owner-${nonce}@example.test`,
          name: "Task reminder owner",
        },
      }),
      prisma.user.create({
        data: {
          primaryEmail: `task-reminder-other-${nonce}@example.test`,
          name: "Other reminder account",
        },
      }),
    ]);
    ownerUserId = owner.id;
    otherUserId = other.id;
    const task = await prisma.actionItem.create({
      data: {
        assignedUserId: ownerUserId,
        title: "Prepare the next High Ground Odyssey session",
      },
    });
    taskId = task.id;
    taskUpdatedAt = task.updatedAt;
  });

  afterAll(async () => {
    try {
      if (taskId) await prisma.actionItem.deleteMany({ where: { id: taskId } });
      if (ownerUserId || otherUserId) {
        await prisma.user.deleteMany({
          where: { id: { in: [ownerUserId, otherUserId].filter(Boolean) } },
        });
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  it("creates, moves, cancels, and reactivates one reminder with immutable revisions", async () => {
    const createRequestId = randomUUID();
    const created = await prisma.$transaction((tx) => setTaskReminderInTransaction({
      tx,
      taskId,
      actorUserId: ownerUserId,
      remindAt: new Date("2026-07-24T15:00:00.000Z"),
      expectedTaskUpdatedAt: taskUpdatedAt,
      expectedReminderUpdatedAt: null,
      clientRequestId: createRequestId,
      reminderId: `task-reminder-${randomUUID()}`,
      revisionId: `task-reminder-revision-${createRequestId}`,
      now: new Date("2026-07-23T13:00:00.000Z"),
      surface: "nest-work",
      timezone: "America/Denver",
      requestedLocalDateTime: "2026-07-24T09:00",
    }));
    expect(created).toMatchObject({
      kind: "saved",
      operation: "CREATED",
      idempotentReplay: false,
    });
    if (created.kind !== "saved") throw new Error("Expected the reminder to be created.");

    const replay = await prisma.$transaction((tx) => setTaskReminderInTransaction({
      tx,
      taskId,
      actorUserId: ownerUserId,
      remindAt: new Date("2026-07-24T15:00:00.000Z"),
      expectedTaskUpdatedAt: taskUpdatedAt,
      expectedReminderUpdatedAt: null,
      clientRequestId: createRequestId,
      reminderId: `unused-${randomUUID()}`,
      revisionId: `task-reminder-revision-${createRequestId}`,
      now: new Date("2026-07-23T13:00:01.000Z"),
      surface: "nest-work",
      timezone: "America/Denver",
      requestedLocalDateTime: "2026-07-24T09:00",
    }));
    expect(replay).toMatchObject({
      kind: "saved",
      operation: "CREATED",
      idempotentReplay: true,
      reminder: { id: created.reminder.id },
    });

    const moveRequestId = randomUUID();
    const moved = await prisma.$transaction((tx) => setTaskReminderInTransaction({
      tx,
      taskId,
      actorUserId: ownerUserId,
      remindAt: new Date("2026-07-24T17:30:00.000Z"),
      expectedTaskUpdatedAt: taskUpdatedAt,
      expectedReminderUpdatedAt: created.reminder.updatedAt,
      clientRequestId: moveRequestId,
      reminderId: `unused-${randomUUID()}`,
      revisionId: `task-reminder-revision-${moveRequestId}`,
      now: new Date("2026-07-23T13:05:00.000Z"),
      surface: "nest-work",
      timezone: "America/Denver",
      requestedLocalDateTime: "2026-07-24T11:30",
    }));
    expect(moved).toMatchObject({ kind: "saved", operation: "RESCHEDULED" });
    if (moved.kind !== "saved") throw new Error("Expected the reminder to be moved.");

    const cancelRequestId = randomUUID();
    const canceled = await prisma.$transaction((tx) => setTaskReminderInTransaction({
      tx,
      taskId,
      actorUserId: ownerUserId,
      remindAt: null,
      expectedTaskUpdatedAt: taskUpdatedAt,
      expectedReminderUpdatedAt: moved.reminder.updatedAt,
      clientRequestId: cancelRequestId,
      reminderId: `unused-${randomUUID()}`,
      revisionId: `task-reminder-revision-${cancelRequestId}`,
      now: new Date("2026-07-23T13:10:00.000Z"),
      surface: "nest-work",
      timezone: "America/Denver",
      requestedLocalDateTime: null,
    }));
    expect(canceled).toMatchObject({
      kind: "saved",
      operation: "CANCELED",
      reminder: {
        id: created.reminder.id,
        status: "CANCELED",
        remindAt: new Date("2026-07-24T17:30:00.000Z"),
      },
    });
    if (canceled.kind !== "saved") throw new Error("Expected the reminder to be canceled.");

    const reactivateRequestId = randomUUID();
    const reactivated = await prisma.$transaction((tx) => setTaskReminderInTransaction({
      tx,
      taskId,
      actorUserId: ownerUserId,
      remindAt: new Date("2026-07-25T14:00:00.000Z"),
      expectedTaskUpdatedAt: taskUpdatedAt,
      expectedReminderUpdatedAt: canceled.reminder.updatedAt,
      clientRequestId: reactivateRequestId,
      reminderId: `unused-${randomUUID()}`,
      revisionId: `task-reminder-revision-${reactivateRequestId}`,
      now: new Date("2026-07-23T13:15:00.000Z"),
      surface: "nest-work",
      timezone: "America/Denver",
      requestedLocalDateTime: "2026-07-25T08:00",
    }));
    expect(reactivated).toMatchObject({
      kind: "saved",
      operation: "REACTIVATED",
      reminder: {
        id: created.reminder.id,
        status: "ACTIVE",
        remindAt: new Date("2026-07-25T14:00:00.000Z"),
      },
    });

    const revisions = await prisma.taskReminderRevision.findMany({
      where: { reminderId: created.reminder.id },
      orderBy: { createdAt: "asc" },
    });
    expect(revisions.map((revision) => revision.operation)).toEqual([
      "CREATED",
      "RESCHEDULED",
      "CANCELED",
      "REACTIVATED",
    ]);
    expect(revisions.every((revision) => {
      const source = revision.sourceJson as Record<string, unknown>;
      return source.externalSideEffects === false
        && source.deviceNotificationsReconciled === false
        && source.deliveryClaimed === false
        && source.timezone === "America/Denver";
    })).toBe(true);
  });

  it("does not reveal or mutate another account's task", async () => {
    const task = await prisma.actionItem.findUniqueOrThrow({ where: { id: taskId } });
    const requestId = randomUUID();
    const result = await prisma.$transaction((tx) => setTaskReminderInTransaction({
      tx,
      taskId,
      actorUserId: otherUserId,
      remindAt: new Date("2026-07-26T15:00:00.000Z"),
      expectedTaskUpdatedAt: task.updatedAt,
      expectedReminderUpdatedAt: null,
      clientRequestId: requestId,
      reminderId: `task-reminder-${randomUUID()}`,
      revisionId: `task-reminder-revision-${requestId}`,
      now: new Date("2026-07-23T13:20:00.000Z"),
      surface: "nest-work",
      timezone: "America/Denver",
      requestedLocalDateTime: "2026-07-26T09:00",
    }));
    expect(result).toEqual({ kind: "not-found" });
    await expect(prisma.taskReminder.count({
      where: { actionItemId: taskId, ownerUserId: otherUserId },
    })).resolves.toBe(0);
  });
});
