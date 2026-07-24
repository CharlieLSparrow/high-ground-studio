import type { TaskReminderOperation, TaskReminderStatus } from "@prisma/client";

type ReminderRow = {
  id: string;
  actionItemId: string;
  ownerUserId: string;
  remindAt: Date;
  status: TaskReminderStatus;
  sourceJson: unknown;
  updatedAt: Date;
};

export type SetTaskReminderResult =
  | {
      kind: "saved";
      reminder: ReminderRow;
      operation: TaskReminderOperation;
      revisionId: string;
      idempotentReplay: boolean;
    }
  | { kind: "unchanged"; reminder: ReminderRow }
  | { kind: "not-found" | "recurring" | "closed" | "conflict" | "identity-conflict" };

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function sameInstant(left: Date | null | undefined, right: Date | null | undefined) {
  return left?.getTime() === right?.getTime();
}

export async function setTaskReminderInTransaction(input: {
  tx: any;
  taskId: string;
  actorUserId: string;
  remindAt: Date | null;
  expectedTaskUpdatedAt: Date;
  expectedReminderUpdatedAt: Date | null;
  clientRequestId: string;
  reminderId: string;
  revisionId: string;
  now: Date;
  surface: "nest-work" | "ios-capture-today";
  timezone: string;
  requestedLocalDateTime: string | null;
}): Promise<SetTaskReminderResult> {
  const {
    tx,
    taskId,
    actorUserId,
    remindAt,
    expectedTaskUpdatedAt,
    expectedReminderUpdatedAt,
    clientRequestId,
    reminderId,
    revisionId,
    now,
    surface,
    timezone,
    requestedLocalDateTime,
  } = input;

  const priorRevision = await tx.taskReminderRevision.findUnique({
    where: { id: revisionId },
    select: {
      actorUserId: true,
      remindAt: true,
      status: true,
      operation: true,
      sourceJson: true,
      reminder: { select: {
        id: true,
        actionItemId: true,
        ownerUserId: true,
        remindAt: true,
        status: true,
        sourceJson: true,
        updatedAt: true,
      } },
    },
  });
  if (priorRevision) {
    const source = record(priorRevision.sourceJson);
    const requestedRemindAt = typeof source.requestedRemindAt === "string"
      ? new Date(source.requestedRemindAt)
      : null;
    const sameRequest = priorRevision.actorUserId === actorUserId
      && priorRevision.reminder.actionItemId === taskId
      && source.clientRequestId === clientRequestId
      && source.timezone === timezone
      && source.requestedLocalDateTime === requestedLocalDateTime
      && (remindAt
        ? priorRevision.status === "ACTIVE" && sameInstant(requestedRemindAt, remindAt)
        : priorRevision.status === "CANCELED" && source.requestedRemindAt === null);
    if (!sameRequest) return { kind: "identity-conflict" };
    return {
      kind: "saved",
      reminder: priorRevision.reminder,
      operation: priorRevision.operation,
      revisionId,
      idempotentReplay: true,
    };
  }

  const task = await tx.actionItem.findFirst({
    where: { id: taskId, assignedUserId: actorUserId },
    select: {
      id: true,
      status: true,
      updatedAt: true,
      recurrenceOccurrence: { select: { id: true } },
      reminder: { select: {
        id: true,
        actionItemId: true,
        ownerUserId: true,
        remindAt: true,
        status: true,
        sourceJson: true,
        updatedAt: true,
      } },
    },
  });
  if (!task) return { kind: "not-found" };
  if (task.recurrenceOccurrence) return { kind: "recurring" };
  if (task.status !== "OPEN") return { kind: "closed" };
  if (!sameInstant(task.updatedAt, expectedTaskUpdatedAt)) return { kind: "conflict" };

  const current = task.reminder as ReminderRow | null;
  if (current?.ownerUserId !== undefined && current.ownerUserId !== actorUserId) {
    return { kind: "not-found" };
  }
  if (current) {
    if (!expectedReminderUpdatedAt || !sameInstant(current.updatedAt, expectedReminderUpdatedAt)) {
      return { kind: "conflict" };
    }
  } else if (expectedReminderUpdatedAt) {
    return { kind: "conflict" };
  }

  if (!current && !remindAt) return { kind: "not-found" };
  if (current
      && ((current.status === "CANCELED" && !remindAt)
        || (current.status === "ACTIVE" && remindAt && sameInstant(current.remindAt, remindAt)))) {
    return { kind: "unchanged", reminder: current };
  }

  const operation: TaskReminderOperation = !current
    ? "CREATED"
    : !remindAt
      ? "CANCELED"
      : current.status === "CANCELED"
        ? "REACTIVATED"
        : "RESCHEDULED";
  const nextStatus: TaskReminderStatus = remindAt ? "ACTIVE" : "CANCELED";
  const revisionSource = {
    schema: "quipsly-task-reminder-revision-v1",
    surface,
    clientRequestId,
    requestedRemindAt: remindAt?.toISOString() ?? null,
    requestedLocalDateTime,
    timezone,
    decidedAt: now.toISOString(),
    externalSideEffects: false,
    deviceNotificationsReconciled: false,
    deliveryClaimed: false,
  };

  let saved: ReminderRow;
  if (!current) {
    saved = await tx.taskReminder.create({
      data: {
        id: reminderId,
        actionItemId: taskId,
        ownerUserId: actorUserId,
        remindAt: remindAt!,
        status: "ACTIVE",
        sourceJson: {
          schema: "quipsly-task-reminder-intent-v1",
          surface,
          explicitHumanIntent: true,
          timezone,
          requestedLocalDateTime,
          devicePermissionObserved: false,
          deviceNotificationScheduled: false,
          deliveryClaimed: false,
          externalSideEffects: false,
          lastRevisionId: revisionId,
        },
      },
    });
  } else {
    const updated = await tx.taskReminder.updateMany({
      where: {
        id: current.id,
        ownerUserId: actorUserId,
        updatedAt: expectedReminderUpdatedAt!,
      },
      data: {
        ...(remindAt ? { remindAt } : {}),
        status: nextStatus,
        sourceJson: {
          ...record(current.sourceJson),
          lastSurface: surface,
          lastRevisionId: revisionId,
          lastTimezone: timezone,
          lastRequestedLocalDateTime: requestedLocalDateTime,
          deviceNotificationScheduled: false,
          deliveryClaimed: false,
          externalSideEffects: false,
        },
      },
    });
    if (updated.count !== 1) return { kind: "conflict" };
    saved = await tx.taskReminder.findUniqueOrThrow({ where: { id: current.id } });
  }

  await tx.taskReminderRevision.create({
    data: {
      id: revisionId,
      reminderId: saved.id,
      actorUserId,
      operation,
      previousRemindAt: current?.remindAt ?? null,
      remindAt,
      previousStatus: current?.status ?? null,
      status: nextStatus,
      sourceJson: revisionSource,
      createdAt: now,
    },
  });

  return {
    kind: "saved",
    reminder: saved,
    operation,
    revisionId,
    idempotentReplay: false,
  };
}
