import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";

import {
  initialOccurrencePlan,
  nextCompletionOccurrence,
  nextRecurrenceLocalDate,
  occurrenceForLocalDate,
  type TaskOccurrencePlan,
  type TaskRecurrenceRule,
} from "@/lib/task-recurrence";

export type PersistedTaskRecurrenceSeries = TaskRecurrenceRule & {
  id: string;
  ownerUserId: string;
  projectId: string | null;
  title: string;
  detail: string | null;
  status: "ACTIVE" | "PAUSED" | "ENDED";
  sourceJson?: unknown;
};

export type TaskRecurrenceSeriesStatus = PersistedTaskRecurrenceSeries["status"];

type TaskOccurrenceMaterializationReason =
  | "series-created"
  | "series-replaced"
  | "fixed-top-up"
  | "completion-follow-up"
  | "completion-skip-follow-up"
  | "series-resumed";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function recurrenceRuleMatchesReceipt(value: unknown, expected: TaskRecurrenceRule) {
  const candidate = record(value);
  return candidate.cadence === expected.cadence
    && candidate.frequency === expected.frequency
    && candidate.interval === expected.interval
    && candidate.timezone === expected.timezone
    && candidate.localTimeMinutes === expected.localTimeMinutes
    && candidate.anchorLocalDate === expected.anchorLocalDate
    && candidate.anchorDayOfMonth === expected.anchorDayOfMonth;
}

export async function materializeTaskOccurrence(input: {
  tx: any;
  series: PersistedTaskRecurrenceSeries;
  occurrence: TaskOccurrencePlan;
  actorUserId: string;
  reason: TaskOccurrenceMaterializationReason;
}) {
  // Serialize only this series/occurrence identity. A second transaction waits,
  // then reads the receipt committed by the first instead of surfacing a unique
  // constraint failure to the person who retried.
  await input.tx.$queryRaw(Prisma.sql`
    SELECT pg_advisory_xact_lock(
      hashtextextended(${`${input.series.id}:${input.occurrence.occurrenceKey}`}, 0)
    ) IS NULL AS "lockAcquired"
  `);
  const existing = await input.tx.taskOccurrence.findUnique({
    where: { seriesId_occurrenceKey: { seriesId: input.series.id, occurrenceKey: input.occurrence.occurrenceKey } },
    select: { id: true, actionItemId: true },
  });
  if (existing) return { created: false as const, occurrenceId: existing.id, actionItemId: existing.actionItemId };

  const actionItemId = randomUUID();
  const occurrenceId = randomUUID();
  const receiptId = randomUUID();
  const receipt = {
    id: receiptId,
    kind: "quipsly-task-occurrence-materialize-v1",
    seriesId: input.series.id,
    occurrenceKey: input.occurrence.occurrenceKey,
    scheduledLocalDate: input.occurrence.scheduledLocalDate,
    requestedLocalDateTime: input.occurrence.requestedLocalDateTime,
    resolvedLocalDateTime: input.occurrence.resolvedLocalDateTime,
    dstResolution: input.occurrence.dstResolution,
    timezone: input.series.timezone,
    reason: input.reason,
    materializedByUserId: input.actorUserId,
    externalSideEffects: false,
    notificationScheduled: false,
    providerCalendarEventCreated: false,
  };
  const seriesSource = record(input.series.sourceJson);
  const recurrenceRoomId = typeof seriesSource.recurrenceRoomId === "string" && seriesSource.recurrenceRoomId
    ? seriesSource.recurrenceRoomId
    : null;
  await input.tx.actionItem.create({
    data: {
      id: actionItemId,
      assignedUserId: input.series.ownerUserId,
      roomId: recurrenceRoomId,
      projectId: input.series.projectId,
      title: input.series.title,
      detail: input.series.detail,
      dueAt: input.occurrence.scheduledFor,
      sourceJson: {
        source: "quipsly-task-recurrence-v1",
        recurrenceSeriesId: input.series.id,
        occurrenceKey: input.occurrence.occurrenceKey,
        materializationReceipt: receipt,
      },
    },
  });
  await input.tx.taskOccurrence.create({
    data: {
      id: occurrenceId,
      seriesId: input.series.id,
      actionItemId,
      occurrenceKey: input.occurrence.occurrenceKey,
      scheduledLocalDate: input.occurrence.scheduledLocalDate,
      scheduledFor: input.occurrence.scheduledFor,
      sourceJson: receipt,
    },
  });
  return { created: true as const, occurrenceId, actionItemId };
}

export async function materializeFollowingOccurrence(input: {
  tx: any;
  series: PersistedTaskRecurrenceSeries;
  completedAt: Date;
  actorUserId: string;
  reason?: TaskOccurrenceMaterializationReason;
}) {
  if (input.series.status !== "ACTIVE") return null;
  if (input.series.cadence === "COMPLETION") {
    return materializeTaskOccurrence({
      ...input,
      occurrence: nextCompletionOccurrence(input.completedAt, input.series),
      reason: input.reason ?? "completion-follow-up",
    });
  }
  const latest = await input.tx.taskOccurrence.findFirst({
    where: { seriesId: input.series.id },
    orderBy: [{ scheduledFor: "desc" }, { createdAt: "desc" }],
    select: { scheduledLocalDate: true },
  });
  const latestLocalDate = latest?.scheduledLocalDate || input.series.anchorLocalDate;
  const nextLocalDate = nextRecurrenceLocalDate(latestLocalDate, input.series);
  return materializeTaskOccurrence({
    ...input,
    occurrence: occurrenceForLocalDate(nextLocalDate, input.series),
    reason: input.reason ?? "fixed-top-up",
  });
}

export async function ensureActiveSeriesHorizon(input: {
  tx: any;
  series: PersistedTaskRecurrenceSeries;
  basisAt: Date;
  actorUserId: string;
}) {
  if (input.series.status !== "ACTIVE") return [];
  const targetOpenCount = input.series.cadence === "FIXED" ? 3 : 1;
  const existingOpenCount = await input.tx.taskOccurrence.count({
    where: {
      seriesId: input.series.id,
      actionItem: { is: { status: "OPEN" } },
    },
  });
  const materialized = [];
  for (let index = existingOpenCount; index < targetOpenCount; index += 1) {
    const result = await materializeFollowingOccurrence({
      tx: input.tx,
      series: input.series,
      completedAt: input.basisAt,
      actorUserId: input.actorUserId,
      reason: "series-resumed",
    });
    if (!result) break;
    materialized.push(result);
  }
  return materialized;
}

export async function updateTaskRecurrenceStatusInTransaction(input: {
  tx: any;
  seriesId: string;
  actorUserId: string;
  expectedUpdatedAt: Date;
  nextStatus: TaskRecurrenceSeriesStatus;
  surface: "nest-work" | "ios-capture-today";
  now?: Date;
  receiptId?: string;
}) {
  const now = input.now ?? new Date();
  const receiptId = input.receiptId ?? randomUUID();
  const series = await input.tx.taskRecurrenceSeries.findFirst({
    where: { id: input.seriesId, ownerUserId: input.actorUserId },
    select: {
      id: true, ownerUserId: true, projectId: true, title: true, detail: true,
      cadence: true, frequency: true, interval: true, timezone: true,
      localTimeMinutes: true, anchorLocalDate: true, anchorDayOfMonth: true,
      status: true, sourceJson: true, updatedAt: true,
    },
  });
  if (!series) return { kind: "not-found" as const };
  if (series.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) return { kind: "conflict" as const };
  if (series.status === "ENDED" && input.nextStatus !== "ENDED") return { kind: "ended" as const };

  const source = record(series.sourceJson);
  const priorStatusReceipts = Array.isArray(source.statusReceipts)
    ? source.statusReceipts.filter((item) => item && typeof item === "object" && !Array.isArray(item)).slice(-23)
    : [];
  const receipt = {
    id: receiptId,
    kind: "quipsly-task-recurrence-status-v1",
    surface: input.surface,
    previousStatus: series.status,
    nextStatus: input.nextStatus,
    changedAt: now.toISOString(),
    changedByUserId: input.actorUserId,
    externalSideEffects: false,
    notificationsChanged: false,
    providerCalendarChanged: false,
  };
  const nextSource = {
    ...source,
    statusReceipts: [...priorStatusReceipts, receipt],
    lastStatusReceipt: receipt,
  };
  const updated = await input.tx.taskRecurrenceSeries.updateMany({
    where: { id: input.seriesId, ownerUserId: input.actorUserId, updatedAt: input.expectedUpdatedAt },
    data: {
      status: input.nextStatus,
      endedAt: input.nextStatus === "ENDED" ? now : null,
      sourceJson: nextSource,
    },
  });
  if (updated.count !== 1) return { kind: "conflict" as const };

  const resumed = series.status === "PAUSED" && input.nextStatus === "ACTIVE"
    ? await ensureActiveSeriesHorizon({
        tx: input.tx,
        series: { ...series, status: "ACTIVE" } as PersistedTaskRecurrenceSeries,
        basisAt: now,
        actorUserId: input.actorUserId,
      })
    : [];
  if (resumed.length) {
    await input.tx.taskRecurrenceSeries.update({
      where: { id: input.seriesId },
      data: {
        sourceJson: {
          ...nextSource,
          lastStatusReceipt: {
            ...receipt,
            materializedActionItemIds: resumed.map((item) => item.actionItemId).filter(Boolean),
          },
        },
      },
    });
  }
  const persisted = await input.tx.taskRecurrenceSeries.findUnique({
    where: { id: input.seriesId },
    select: { status: true, updatedAt: true },
  });
  return persisted
    ? { kind: "saved" as const, persisted, receiptId, materializedCount: resumed.length }
    : { kind: "conflict" as const };
}

export async function editTaskRecurrenceOccurrenceInTransaction(input: {
  tx: any;
  taskId: string;
  actorUserId: string;
  expectedTaskUpdatedAt: Date;
  clientRequestId: string;
  title: string;
  detail: string | null;
  surface: "nest-work" | "ios-capture-today";
  now?: Date;
  receiptId?: string;
}) {
  const now = input.now ?? new Date();
  const receiptId = input.receiptId ?? randomUUID();
  const current = await input.tx.actionItem.findFirst({
    where: {
      id: input.taskId,
      assignedUserId: input.actorUserId,
      recurrenceOccurrence: { isNot: null },
    },
    select: {
      id: true,
      title: true,
      detail: true,
      dueAt: true,
      status: true,
      sourceJson: true,
      updatedAt: true,
      recurrenceOccurrence: { select: { id: true, seriesId: true, occurrenceKey: true } },
    },
  });
  if (!current?.recurrenceOccurrence) return { kind: "not-found" as const };
  if (current.status !== "OPEN") return { kind: "closed" as const };

  const source = record(current.sourceJson);
  const priorLastReceipt = record(source.lastEditReceipt);
  if (priorLastReceipt.clientRequestId === input.clientRequestId) {
    const sameRequest = priorLastReceipt.nextTitle === input.title
      && (priorLastReceipt.nextDetail ?? null) === input.detail;
    return sameRequest
      ? {
          kind: "saved" as const,
          reused: true,
          persisted: {
            id: current.id,
            title: current.title,
            detail: current.detail,
            dueAt: current.dueAt,
            updatedAt: current.updatedAt,
          },
          receiptId: typeof priorLastReceipt.id === "string" ? priorLastReceipt.id : receiptId,
        }
      : { kind: "identity-conflict" as const };
  }
  if (current.updatedAt.getTime() !== input.expectedTaskUpdatedAt.getTime()) return { kind: "conflict" as const };
  const priorReceipts = Array.isArray(source.editReceipts)
    ? source.editReceipts.filter((item) => item && typeof item === "object" && !Array.isArray(item)).slice(-23)
    : [];
  const receipt = {
    id: receiptId,
    kind: "quipsly-task-occurrence-edit-v1",
    scope: "THIS_OCCURRENCE",
    surface: input.surface,
    clientRequestId: input.clientRequestId,
    seriesId: current.recurrenceOccurrence.seriesId,
    occurrenceKey: current.recurrenceOccurrence.occurrenceKey,
    priorTitle: current.title,
    priorDetail: current.detail,
    nextTitle: input.title,
    nextDetail: input.detail,
    dueAtPreserved: current.dueAt?.toISOString() ?? null,
    changedAt: now.toISOString(),
    changedByUserId: input.actorUserId,
    externalSideEffects: false,
    notificationChanged: false,
    providerCalendarChanged: false,
  };
  const updated = await input.tx.actionItem.updateMany({
    where: {
      id: input.taskId,
      assignedUserId: input.actorUserId,
      status: "OPEN",
      updatedAt: input.expectedTaskUpdatedAt,
    },
    data: {
      title: input.title,
      detail: input.detail,
      sourceJson: {
        ...source,
        editReceipts: [...priorReceipts, receipt],
        lastEditReceipt: receipt,
      },
    },
  });
  if (updated.count !== 1) return { kind: "conflict" as const };
  const persisted = await input.tx.actionItem.findUnique({
    where: { id: input.taskId },
    select: { id: true, title: true, detail: true, dueAt: true, updatedAt: true },
  });
  return persisted
    ? { kind: "saved" as const, reused: false, persisted, receiptId }
    : { kind: "conflict" as const };
}

export async function replaceTaskRecurrenceFromOccurrenceInTransaction(input: {
  tx: any;
  priorSeriesId: string;
  anchorTaskId: string;
  actorUserId: string;
  expectedSeriesUpdatedAt: Date;
  expectedTaskUpdatedAt: Date;
  nextSeriesId: string;
  clientRequestId: string;
  title: string;
  detail: string | null;
  nextRule: TaskRecurrenceRule;
  surface: "nest-work" | "ios-capture-today";
  now?: Date;
  receiptId?: string;
}) {
  const now = input.now ?? new Date();
  const receiptId = input.receiptId ?? randomUUID();

  // A lost response can be retried with the same client UUID. Resolve the new
  // identity first so retry never depends on mutating the now-ended predecessor.
  // Serialize that client-selected identity before the read so two simultaneous
  // retries converge on one result rather than racing into the unique key.
  await input.tx.$queryRaw(Prisma.sql`
    SELECT pg_advisory_xact_lock(hashtextextended(${`recurrence-revision-request:${input.nextSeriesId}`}, 0)) IS NULL AS "lockAcquired"
  `);
  const existingNext = await input.tx.taskRecurrenceSeries.findFirst({
    where: { id: input.nextSeriesId, ownerUserId: input.actorUserId },
    select: {
      id: true,
      sourceJson: true,
      occurrences: {
        orderBy: { scheduledFor: "asc" },
        select: { actionItemId: true },
      },
    },
  });
  if (existingNext) {
    const revision = record(record(existingNext.sourceJson).revisionReceipt);
    const sameRequest = revision.clientRequestId === input.clientRequestId
      && revision.priorSeriesId === input.priorSeriesId
      && revision.anchorTaskId === input.anchorTaskId
      && revision.nextTitle === input.title
      && revision.nextDetail === input.detail
      && recurrenceRuleMatchesReceipt(revision.nextRule, input.nextRule);
    return sameRequest
      ? {
          kind: "saved" as const,
          reused: true,
          priorSeriesId: input.priorSeriesId,
          nextSeriesId: existingNext.id,
          firstTaskId: existingNext.occurrences[0]?.actionItemId ?? null,
          materializedCount: existingNext.occurrences.length,
          supersededTaskCount: Number(revision.supersededTaskCount) || 0,
          receiptId: typeof revision.id === "string" ? revision.id : receiptId,
        }
      : { kind: "identity-conflict" as const };
  }

  await input.tx.$queryRaw(Prisma.sql`
    SELECT pg_advisory_xact_lock(hashtextextended(${`recurrence-revision:${input.priorSeriesId}`}, 0)) IS NULL AS "lockAcquired"
  `);
  const series = await input.tx.taskRecurrenceSeries.findFirst({
    where: { id: input.priorSeriesId, ownerUserId: input.actorUserId },
    select: {
      id: true, ownerUserId: true, projectId: true, title: true, detail: true,
      cadence: true, frequency: true, interval: true, timezone: true,
      localTimeMinutes: true, anchorLocalDate: true, anchorDayOfMonth: true,
      status: true, sourceJson: true, updatedAt: true,
    },
  });
  if (!series) return { kind: "not-found" as const };
  if (series.status === "ENDED") return { kind: "ended" as const };
  if (series.updatedAt.getTime() !== input.expectedSeriesUpdatedAt.getTime()) return { kind: "conflict" as const };

  const anchor = await input.tx.taskOccurrence.findFirst({
    where: {
      seriesId: input.priorSeriesId,
      actionItemId: input.anchorTaskId,
      actionItem: { is: { assignedUserId: input.actorUserId, status: "OPEN" } },
    },
    select: {
      id: true,
      occurrenceKey: true,
      scheduledFor: true,
      actionItem: { select: { id: true, updatedAt: true } },
    },
  });
  if (!anchor?.actionItem) return { kind: "not-found" as const };
  if (anchor.actionItem.updatedAt.getTime() !== input.expectedTaskUpdatedAt.getTime()) return { kind: "conflict" as const };
  const firstOpen = await input.tx.taskOccurrence.findFirst({
    where: {
      seriesId: input.priorSeriesId,
      actionItem: { is: { assignedUserId: input.actorUserId, status: "OPEN" } },
    },
    orderBy: [{ scheduledFor: "asc" }, { createdAt: "asc" }],
    select: { actionItemId: true },
  });
  if (firstOpen?.actionItemId !== input.anchorTaskId) return { kind: "not-next-open" as const };

  const superseded = await input.tx.taskOccurrence.findMany({
    where: {
      seriesId: input.priorSeriesId,
      scheduledFor: { gte: anchor.scheduledFor },
      actionItem: { is: { assignedUserId: input.actorUserId, status: "OPEN" } },
    },
    orderBy: [{ scheduledFor: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      occurrenceKey: true,
      actionItem: { select: { id: true, sourceJson: true, updatedAt: true } },
    },
  });
  const seriesSource = record(series.sourceJson);
  const revisionReceipt = {
    id: receiptId,
    kind: "quipsly-task-recurrence-revision-v1",
    scope: "THIS_AND_FUTURE",
    surface: input.surface,
    clientRequestId: input.clientRequestId,
    priorSeriesId: input.priorSeriesId,
    nextSeriesId: input.nextSeriesId,
    anchorTaskId: input.anchorTaskId,
    anchorOccurrenceKey: anchor.occurrenceKey,
    priorRule: {
      cadence: series.cadence,
      frequency: series.frequency,
      interval: series.interval,
      timezone: series.timezone,
      localTimeMinutes: series.localTimeMinutes,
      anchorLocalDate: series.anchorLocalDate,
    },
    nextRule: input.nextRule,
    priorTitle: series.title,
    priorDetail: series.detail,
    nextTitle: input.title,
    nextDetail: input.detail,
    supersededTaskCount: superseded.length,
    changedAt: now.toISOString(),
    changedByUserId: input.actorUserId,
    historicalOccurrencesPreserved: true,
    externalSideEffects: false,
    notificationChanged: false,
    providerCalendarChanged: false,
  };
  const priorRevisionReceipts = Array.isArray(seriesSource.revisionReceipts)
    ? seriesSource.revisionReceipts.filter((item) => item && typeof item === "object" && !Array.isArray(item)).slice(-23)
    : [];
  const ended = await input.tx.taskRecurrenceSeries.updateMany({
    where: {
      id: input.priorSeriesId,
      ownerUserId: input.actorUserId,
      updatedAt: input.expectedSeriesUpdatedAt,
      status: series.status,
    },
    data: {
      status: "ENDED",
      endedAt: now,
      sourceJson: {
        ...seriesSource,
        revisionReceipts: [...priorRevisionReceipts, revisionReceipt],
        lastRevisionReceipt: revisionReceipt,
      },
    },
  });
  if (ended.count !== 1) return { kind: "conflict" as const };

  for (const occurrence of superseded) {
    if (!occurrence.actionItem) continue;
    const actionSource = record(occurrence.actionItem.sourceJson);
    const supersessionReceipt = {
      id: randomUUID(),
      kind: "quipsly-task-occurrence-superseded-v1",
      revisionReceiptId: receiptId,
      priorSeriesId: input.priorSeriesId,
      nextSeriesId: input.nextSeriesId,
      occurrenceKey: occurrence.occurrenceKey,
      supersededAt: now.toISOString(),
      supersededByUserId: input.actorUserId,
      historicalRecordPreserved: true,
      externalSideEffects: false,
    };
    const canceled = await input.tx.actionItem.updateMany({
      where: {
        id: occurrence.actionItem.id,
        assignedUserId: input.actorUserId,
        status: "OPEN",
        updatedAt: occurrence.actionItem.updatedAt,
      },
      data: {
        status: "CANCELED",
        completedAt: null,
        sourceJson: { ...actionSource, supersessionReceipt },
      },
    });
    // An occurrence may be completed or edited while this revision is being
    // prepared. Never overwrite that newer evidence; abort and roll back the
    // entire revision so the person can review the now-current horizon.
    if (canceled.count !== 1) return { kind: "conflict" as const };
    await input.tx.taskOccurrence.update({
      where: { id: occurrence.id },
      data: { status: "SKIPPED", sourceJson: supersessionReceipt },
    });
  }

  const recurrenceRoomId = typeof seriesSource.recurrenceRoomId === "string" && seriesSource.recurrenceRoomId
    ? seriesSource.recurrenceRoomId
    : null;
  const nextSeries = await input.tx.taskRecurrenceSeries.create({
    data: {
      id: input.nextSeriesId,
      ownerUserId: input.actorUserId,
      projectId: series.projectId,
      title: input.title,
      detail: input.detail,
      cadence: input.nextRule.cadence,
      frequency: input.nextRule.frequency,
      interval: input.nextRule.interval,
      timezone: input.nextRule.timezone,
      localTimeMinutes: input.nextRule.localTimeMinutes,
      anchorLocalDate: input.nextRule.anchorLocalDate,
      anchorDayOfMonth: input.nextRule.anchorDayOfMonth,
      status: series.status,
      sourceJson: {
        source: "quipsly-task-recurrence-v1",
        recurrenceRoomId,
        revisionReceipt,
      },
    },
  });
  const persistedSeries: PersistedTaskRecurrenceSeries = {
    ...nextSeries,
    projectId: nextSeries.projectId ?? null,
    detail: nextSeries.detail ?? null,
  };
  const materialized = [];
  for (const occurrence of initialOccurrencePlan(persistedSeries)) {
    materialized.push(await materializeTaskOccurrence({
      tx: input.tx,
      series: persistedSeries,
      occurrence,
      actorUserId: input.actorUserId,
      reason: "series-replaced",
    }));
  }
  return {
    kind: "saved" as const,
    reused: false,
    priorSeriesId: input.priorSeriesId,
    nextSeriesId: input.nextSeriesId,
    firstTaskId: materialized[0]?.actionItemId ?? null,
    materializedCount: materialized.length,
    supersededTaskCount: superseded.length,
    receiptId,
  };
}
