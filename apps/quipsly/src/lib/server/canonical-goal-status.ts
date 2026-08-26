import "server-only";

import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";

export type CanonicalGoalStatus = "ACTIVE" | "PAUSED" | "ACHIEVED" | "ARCHIVED";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function updateCanonicalGoalStatusInTransaction(input: {
  tx: any;
  goalId: string;
  actorUserId: string;
  accessOr?: Prisma.GoalWhereInput[];
  expectedUpdatedAt: Date;
  nextStatus: CanonicalGoalStatus;
  surface: "nest-work" | "ios-capture-work";
  now?: Date;
  receiptId?: string;
}) {
  const now = input.now ?? new Date();
  const receiptId = input.receiptId ?? randomUUID();
  const accessWhere: Prisma.GoalWhereInput = input.accessOr?.length
    ? { OR: input.accessOr }
    : { ownerUserId: input.actorUserId };
  const current = await input.tx.goal.findFirst({
    where: { id: input.goalId, ...accessWhere },
    select: { id: true, status: true, sourceJson: true, updatedAt: true },
  });
  if (!current) return { kind: "not-found" as const };
  if (current.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) {
    return { kind: "conflict" as const };
  }

  const receipt = {
    id: receiptId,
    kind: "quipsly-goal-status-v1",
    surface: input.surface,
    previousStatus: current.status,
    nextStatus: input.nextStatus,
    changedAt: now.toISOString(),
    changedByUserId: input.actorUserId,
    externalSideEffects: false,
  };
  const source = record(current.sourceJson);
  const updated = await input.tx.goal.updateMany({
    where: {
      id: input.goalId,
      ...accessWhere,
      updatedAt: input.expectedUpdatedAt,
    },
    data: {
      status: input.nextStatus,
      achievedAt: input.nextStatus === "ACHIEVED" ? now : null,
      sourceJson: { ...source, lastStatusReceipt: receipt },
    },
  });
  if (updated.count !== 1) return { kind: "conflict" as const };

  await input.tx.goalProgressReceipt.create({
    data: {
      goalId: input.goalId,
      actorUserId: input.actorUserId,
      kind: "STATUS_CHANGED",
      progressPercent: input.nextStatus === "ACHIEVED" ? 100 : null,
      note: null,
      evidenceJson: receipt,
      occurredAt: now,
    },
  });
  const persisted = await input.tx.goal.findUnique({
    where: { id: input.goalId },
    select: { id: true, status: true, updatedAt: true },
  });
  return persisted
    ? { kind: "saved" as const, record: persisted, receiptId }
    : { kind: "conflict" as const };
}
