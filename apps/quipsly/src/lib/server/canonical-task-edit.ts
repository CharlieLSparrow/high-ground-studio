import "server-only";

import { randomUUID } from "node:crypto";

import { isUnreviewedTranscriptActionItemSource } from "@high-ground/quipsly-domain/coaching-packet";

const EDIT_RECEIPT_LIMIT = 24;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function priorEditReceipts(source: Record<string, unknown>) {
  return Array.isArray(source.editReceipts)
    ? source.editReceipts
        .filter((value) => value && typeof value === "object" && !Array.isArray(value))
        .slice(-EDIT_RECEIPT_LIMIT + 1)
    : [];
}

export async function editCanonicalTaskInTransaction(input: {
  tx: any;
  taskId: string;
  actorUserId: string;
  expectedUpdatedAt: Date;
  title: string;
  detail: string | null;
  dueAt: Date | null;
  dueIntent: {
    requestedLocalDateTime: string;
    resolvedLocalDateTime: string;
    dstResolution: string;
    timezone: string;
  } | null;
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
    },
    select: {
      id: true,
      roomId: true,
      status: true,
      title: true,
      detail: true,
      dueAt: true,
      sourceJson: true,
      updatedAt: true,
      recurrenceOccurrence: { select: { id: true } },
    },
  });

  if (!current || isUnreviewedTranscriptActionItemSource(current.sourceJson)) {
    return { kind: "not-found" as const };
  }
  if (current.status !== "OPEN") return { kind: "closed" as const };
  if (current.recurrenceOccurrence) return { kind: "recurring" as const };
  const source = record(current.sourceJson);
  if (Object.keys(record(source.supersessionReceipt)).length) {
    return { kind: "immutable-history" as const };
  }
  if (current.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) {
    return { kind: "conflict" as const };
  }

  const receipt = {
    id: receiptId,
    kind: "quipsly-work-item-edit-v1",
    surface: input.surface,
    changedAt: now.toISOString(),
    changedByUserId: input.actorUserId,
    previous: {
      title: current.title,
      detail: current.detail,
      dueAt: current.dueAt?.toISOString() ?? null,
    },
    next: {
      title: input.title,
      detail: input.detail,
      dueAt: input.dueAt?.toISOString() ?? null,
    },
    dueIntent: input.dueIntent,
    reminderChanged: false,
    recurrenceChanged: false,
    statusChanged: false,
    tagsChanged: false,
    goalLinksChanged: false,
    providerCalendarEventChanged: false,
    externalSideEffects: false,
  };
  const updated = await input.tx.actionItem.updateMany({
    where: {
      id: input.taskId,
      assignedUserId: input.actorUserId,
      status: "OPEN",
      updatedAt: input.expectedUpdatedAt,
    },
    data: {
      title: input.title,
      detail: input.detail,
      dueAt: input.dueAt,
      sourceJson: {
        ...source,
        editReceipts: [...priorEditReceipts(source), receipt],
      },
    },
  });
  if (updated.count !== 1) return { kind: "conflict" as const };

  const persisted = await input.tx.actionItem.findUnique({
    where: { id: input.taskId },
    select: {
      id: true,
      roomId: true,
      title: true,
      detail: true,
      dueAt: true,
      updatedAt: true,
    },
  });
  if (!persisted) return { kind: "conflict" as const };
  return { kind: "saved" as const, record: persisted, receiptId };
}
