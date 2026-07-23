import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";

import { isUnreviewedTranscriptActionItemSource } from "@high-ground/quipsly-domain/coaching-packet";
import { materializeFollowingOccurrence, type PersistedTaskRecurrenceSeries } from "@/lib/server/task-recurrence";

export type CanonicalTaskStatus = "OPEN" | "DONE" | "CANCELED";
export type CanonicalTaskDecisionReason = "MISSED_OCCURRENCE_SKIPPED";

const STATUS_RECEIPT_LIMIT = 24;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function priorStatusReceipts(source: Record<string, unknown>) {
  return Array.isArray(source.statusReceipts)
    ? source.statusReceipts
        .filter((value) => value && typeof value === "object" && !Array.isArray(value))
        .slice(-STATUS_RECEIPT_LIMIT + 1)
    : [];
}

export async function updateCanonicalTaskStatusInTransaction(input: {
  tx: any;
  taskId: string;
  actorUserId: string;
  accessOr: any[];
  expectedUpdatedAt: Date;
  nextStatus: CanonicalTaskStatus;
  decisionReason?: CanonicalTaskDecisionReason;
  surface: "nest-work" | "ios-capture-today";
  now?: Date;
  receiptId?: string;
}) {
  const now = input.now ?? new Date();
  const receiptId = input.receiptId ?? randomUUID();
  const current = await input.tx.actionItem.findFirst({
    where: { id: input.taskId, OR: input.accessOr },
    select: {
      id: true,
      roomId: true,
      status: true,
      dueAt: true,
      sourceJson: true,
      updatedAt: true,
      recurrenceOccurrence: {
        select: {
          id: true,
          occurrenceKey: true,
          sourceJson: true,
          series: {
            select: {
              id: true, ownerUserId: true, projectId: true, title: true, detail: true,
              cadence: true, frequency: true, interval: true, timezone: true,
              localTimeMinutes: true, anchorLocalDate: true, anchorDayOfMonth: true, status: true, sourceJson: true,
            },
          },
        },
      },
    },
  });
  if (!current || isUnreviewedTranscriptActionItemSource(current.sourceJson)) return { kind: "not-found" as const };
  if (current.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) return { kind: "conflict" as const };

  const currentSource = record(current.sourceJson);
  if (input.nextStatus === "OPEN" && Object.keys(record(currentSource.supersessionReceipt)).length) {
    return { kind: "immutable-history" as const };
  }
  const recurrenceSeries = current.recurrenceOccurrence?.series as PersistedTaskRecurrenceSeries | undefined;
  if (input.decisionReason === "MISSED_OCCURRENCE_SKIPPED") {
    if (input.nextStatus !== "CANCELED" || current.status !== "OPEN" || !current.dueAt
        || current.dueAt.getTime() >= now.getTime() || recurrenceSeries?.ownerUserId !== input.actorUserId) {
      return { kind: "not-missed" as const };
    }
    await input.tx.$queryRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtextextended(${`recurrence-revision:${recurrenceSeries.id}`}, 0)) IS NULL AS "lockAcquired"
    `);
    const firstOpen = await input.tx.taskOccurrence.findFirst({
      where: {
        seriesId: recurrenceSeries.id,
        actionItem: { is: { assignedUserId: input.actorUserId, status: "OPEN" } },
      },
      orderBy: [{ scheduledFor: "asc" }, { createdAt: "asc" }],
      select: { actionItemId: true },
    });
    if (firstOpen?.actionItemId !== input.taskId) return { kind: "not-next-open" as const };
  }
  const receipt = {
    id: receiptId,
    kind: "quipsly-work-item-status-v1",
    surface: input.surface,
    previousStatus: current.status,
    nextStatus: input.nextStatus,
    changedAt: now.toISOString(),
    changedByUserId: input.actorUserId,
    externalSideEffects: false,
    ...(input.decisionReason ? {
      decisionReason: input.decisionReason,
      missedDueAt: current.dueAt?.toISOString() ?? null,
      historicalRecordPreserved: true,
    } : {}),
  };
  const updated = await input.tx.actionItem.updateMany({
    where: { id: input.taskId, updatedAt: input.expectedUpdatedAt },
    data: {
      status: input.nextStatus,
      completedAt: input.nextStatus === "DONE" ? now : null,
      sourceJson: {
        ...currentSource,
        statusReceipts: [...priorStatusReceipts(currentSource), receipt],
      },
    },
  });
  if (updated.count !== 1) return { kind: "conflict" as const };

  let nextOccurrenceTaskId: string | null = null;
  let occurrenceSource = record(current.recurrenceOccurrence?.sourceJson);
  if (current.recurrenceOccurrence) {
    const priorResolutionReceipts = Array.isArray(occurrenceSource.resolutionReceipts)
      ? occurrenceSource.resolutionReceipts.filter((value) => value && typeof value === "object" && !Array.isArray(value)).slice(-STATUS_RECEIPT_LIMIT + 1)
      : [];
    occurrenceSource = {
      ...occurrenceSource,
      resolutionReceipts: [...priorResolutionReceipts, {
        ...receipt,
        kind: "quipsly-task-occurrence-resolution-v1",
        occurrenceKey: current.recurrenceOccurrence.occurrenceKey,
      }],
    };
  }
  if (recurrenceSeries && (input.nextStatus === "DONE" || input.nextStatus === "CANCELED")) {
    const existingFollowUp = record(occurrenceSource.followingOccurrenceReceipt);
    if (typeof existingFollowUp.nextActionItemId === "string" && existingFollowUp.nextActionItemId) {
      nextOccurrenceTaskId = existingFollowUp.nextActionItemId;
    } else {
      const materialized = await materializeFollowingOccurrence({
        tx: input.tx,
        series: recurrenceSeries,
        completedAt: now,
        actorUserId: input.actorUserId,
        reason: input.nextStatus === "CANCELED" && recurrenceSeries.cadence === "COMPLETION"
          ? "completion-skip-follow-up"
          : undefined,
      });
      nextOccurrenceTaskId = materialized?.actionItemId ?? null;
      if (materialized?.occurrenceId && current.recurrenceOccurrence?.id) {
        occurrenceSource = {
          ...occurrenceSource,
          followingOccurrenceReceipt: {
            id: randomUUID(),
            kind: "quipsly-task-occurrence-follow-up-v1",
            nextOccurrenceId: materialized.occurrenceId,
            nextActionItemId: materialized.actionItemId,
            linkedAt: now.toISOString(),
            linkedByUserId: input.actorUserId,
            surface: input.surface,
            externalSideEffects: false,
          },
        };
      }
    }
  }
  if (current.recurrenceOccurrence?.id) {
    await input.tx.taskOccurrence.update({
      where: { id: current.recurrenceOccurrence.id },
      data: {
        ...(input.nextStatus === "CANCELED"
          ? { status: "SKIPPED" }
          : input.nextStatus === "OPEN" ? { status: "MATERIALIZED" } : {}),
        sourceJson: occurrenceSource,
      },
    });
  }

  const persisted = await input.tx.actionItem.findUnique({
    where: { id: input.taskId },
    select: { roomId: true, status: true, updatedAt: true },
  });
  return persisted
    ? { kind: "saved" as const, record: persisted, receiptId, nextOccurrenceTaskId }
    : { kind: "conflict" as const };
}
