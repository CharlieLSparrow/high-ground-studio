import "server-only";

import { randomUUID } from "node:crypto";

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

export async function editCanonicalGoalInTransaction(input: {
  tx: any;
  goalId: string;
  actorUserId: string;
  expectedUpdatedAt: Date;
  title: string;
  description: string | null;
  targetDecision:
    | { kind: "KEEP" }
    | { kind: "CLEAR" }
    | {
      kind: "SET";
      targetAt: Date;
      requestedLocalDate: string;
      resolvedLocalDateTime: string;
      timezone: string;
    };
  surface: "nest-work" | "ios-capture-work";
  now?: Date;
  receiptId?: string;
}) {
  const now = input.now ?? new Date();
  const receiptId = input.receiptId ?? randomUUID();
  const current = await input.tx.goal.findFirst({
    where: {
      id: input.goalId,
      ownerUserId: input.actorUserId,
    },
    select: {
      id: true,
      roomId: true,
      status: true,
      title: true,
      description: true,
      targetAt: true,
      sourceJson: true,
      updatedAt: true,
    },
  });

  if (!current) return { kind: "not-found" as const };
  if (current.status !== "ACTIVE" && current.status !== "PAUSED") {
    return { kind: "closed" as const };
  }
  if (current.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) {
    return { kind: "conflict" as const };
  }

  const source = record(current.sourceJson);
  const nextTargetAt = input.targetDecision.kind === "KEEP"
    ? current.targetAt
    : input.targetDecision.kind === "CLEAR"
      ? null
      : input.targetDecision.targetAt;
  const receipt = {
    id: receiptId,
    kind: "quipsly-goal-edit-v1",
    surface: input.surface,
    changedAt: now.toISOString(),
    changedByUserId: input.actorUserId,
    previous: {
      title: current.title,
      description: current.description,
      targetAt: current.targetAt?.toISOString() ?? null,
    },
    next: {
      title: input.title,
      description: input.description,
      targetAt: nextTargetAt?.toISOString() ?? null,
    },
    targetDecision: input.targetDecision.kind,
    targetIntent: input.targetDecision.kind === "SET" ? {
      requestedLocalDate: input.targetDecision.requestedLocalDate,
      resolvedLocalDateTime: input.targetDecision.resolvedLocalDateTime,
      timezone: input.targetDecision.timezone,
    } : null,
    statusChanged: false,
    progressChanged: false,
    taskLinksChanged: false,
    tagsChanged: false,
    hierarchyChanged: false,
    sourceAnchorChanged: false,
    providerCalendarEventChanged: false,
    externalSideEffects: false,
  };
  const updated = await input.tx.goal.updateMany({
    where: {
      id: input.goalId,
      ownerUserId: input.actorUserId,
      status: { in: ["ACTIVE", "PAUSED"] },
      updatedAt: input.expectedUpdatedAt,
    },
    data: {
      title: input.title,
      description: input.description,
      targetAt: nextTargetAt,
      sourceJson: {
        ...source,
        editReceipts: [...priorEditReceipts(source), receipt],
      },
    },
  });
  if (updated.count !== 1) return { kind: "conflict" as const };

  const persisted = await input.tx.goal.findUnique({
    where: { id: input.goalId },
    select: {
      id: true,
      roomId: true,
      status: true,
      title: true,
      description: true,
      targetAt: true,
      updatedAt: true,
    },
  });
  if (!persisted) return { kind: "conflict" as const };
  return { kind: "saved" as const, record: persisted, receiptId };
}
