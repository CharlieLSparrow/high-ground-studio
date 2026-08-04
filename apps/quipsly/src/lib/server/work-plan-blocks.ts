import { isUnreviewedTranscriptActionItem } from "@/lib/server/coaching-packets";
import { parseRecurrenceStart } from "@/lib/task-recurrence";

const MOBILE_REQUEST_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type WorkPlanTargetType = "task" | "goal";

export type CreateWorkPlanBlockInput = {
  targetType: WorkPlanTargetType;
  targetId: string;
  startsAt: string;
  durationMinutes: number;
  timezone: string;
  actorUserId: string;
  surface: "nest-schedule" | "ios-capture-today";
  expectedTargetUpdatedAt?: Date | null;
  clientRequestId?: string | null;
  now?: Date;
  receiptId: string;
};

export type CreateWorkPlanBlockTransactionResult =
  | { kind: "saved"; planBlockId: string; updatedAt: Date; receiptId: string; idempotentReplay: boolean; startsAt: Date; endsAt: Date }
  | { kind: "invalid" }
  | { kind: "not-found" }
  | { kind: "conflict" }
  | { kind: "identity-conflict" };

function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function workPlanTaskAccessWhere(userId: string) {
  return [
    { assignedUserId: userId },
    { room: { OR: [
      { createdByUserId: userId },
      { participants: { some: { userId, accessStatus: "ACTIVE" } } },
      { booking: { clientUserId: userId } },
      { booking: { coachUserId: userId } },
    ] } },
    { booking: { OR: [{ clientUserId: userId }, { coachUserId: userId }] } },
  ];
}

export function parseWorkPlanWindow(
  startsAtValue: unknown,
  durationValue: unknown,
  timezoneValue: unknown,
  now = new Date(),
) {
  const startsAtText = cleanText(startsAtValue, 80);
  const timezone = cleanText(timezoneValue, 100);
  const parsedStart = parseRecurrenceStart(startsAtText, timezone);
  const durationMinutes = Number(durationValue);
  if (!parsedStart
      || !Number.isInteger(durationMinutes)
      || durationMinutes < 15
      || durationMinutes > 720) return null;
  const startsAt = parsedStart.dueAt;
  if (Math.abs(startsAt.getTime() - now.getTime()) > 5 * 365 * 86_400_000) return null;
  return {
    startsAt,
    endsAt: new Date(startsAt.getTime() + durationMinutes * 60_000),
    durationMinutes,
    timezone,
    requestedLocalDateTime: parsedStart.requestedLocalDateTime,
    resolvedLocalDateTime: parsedStart.resolvedLocalDateTime,
    dstResolution: parsedStart.dstResolution,
  };
}

export async function createWorkPlanBlockInTransaction(
  tx: any,
  input: CreateWorkPlanBlockInput,
): Promise<CreateWorkPlanBlockTransactionResult> {
  const now = input.now ?? new Date();
  const actorUserId = cleanText(input.actorUserId, 200);
  const targetId = cleanText(input.targetId, 200);
  const clientRequestId = cleanText(input.clientRequestId, 80).toLowerCase() || null;
  const window = parseWorkPlanWindow(input.startsAt, input.durationMinutes, input.timezone, now);
  if (!actorUserId
      || !targetId
      || !window
      || !["task", "goal"].includes(input.targetType)
      || (clientRequestId !== null && !MOBILE_REQUEST_PATTERN.test(clientRequestId))) {
    return { kind: "invalid" };
  }

  const planBlockId = clientRequestId ? `mobile-focus-create-${clientRequestId}` : null;
  if (planBlockId) {
    const existing = await tx.workPlanBlock.findUnique({
      where: { id: planBlockId },
      select: {
        id: true,
        ownerUserId: true,
        actionItemId: true,
        goalId: true,
        startsAt: true,
        endsAt: true,
        timezone: true,
        sourceJson: true,
        updatedAt: true,
      },
    });
    if (existing) {
      if (existing.ownerUserId !== actorUserId) return { kind: "not-found" };
      const receipt = record(record(existing.sourceJson).creationReceipt);
      const sameIntent = existing.actionItemId === (input.targetType === "task" ? targetId : null)
        && existing.goalId === (input.targetType === "goal" ? targetId : null)
        && existing.startsAt.getTime() === window.startsAt.getTime()
        && existing.endsAt.getTime() === window.endsAt.getTime()
        && existing.timezone === window.timezone
        && receipt.id === planBlockId
        && receipt.kind === "quipsly-work-plan-block-create-v1"
        && receipt.surface === input.surface
        && receipt.clientRequestId === clientRequestId
        && receipt.expectedTargetUpdatedAt === (input.expectedTargetUpdatedAt?.toISOString() ?? null);
      return sameIntent
        ? { kind: "saved", planBlockId: existing.id, updatedAt: existing.updatedAt, receiptId: String(receipt.id), idempotentReplay: true, startsAt: existing.startsAt, endsAt: existing.endsAt }
        : { kind: "identity-conflict" };
    }
  }

  const target = input.targetType === "task"
    ? await tx.actionItem.findFirst({
        where: { id: targetId, status: "OPEN", OR: workPlanTaskAccessWhere(actorUserId) },
        select: { id: true, sourceJson: true, updatedAt: true },
      })
    : await tx.goal.findFirst({
        where: { id: targetId, ownerUserId: actorUserId, status: "ACTIVE" },
        select: { id: true, updatedAt: true },
      });
  if (!target || (input.targetType === "task" && isUnreviewedTranscriptActionItem(target))) {
    return { kind: "not-found" };
  }
  if (input.expectedTargetUpdatedAt
      && target.updatedAt.getTime() !== input.expectedTargetUpdatedAt.getTime()) {
    return { kind: "conflict" };
  }

  const receipt = {
    id: input.receiptId,
    kind: "quipsly-work-plan-block-create-v1",
    surface: input.surface,
    clientRequestId,
    targetType: input.targetType,
    targetId,
    expectedTargetUpdatedAt: input.expectedTargetUpdatedAt?.toISOString() ?? null,
    startsAt: window.startsAt.toISOString(),
    endsAt: window.endsAt.toISOString(),
    timezone: window.timezone,
    requestedLocalDateTime: window.requestedLocalDateTime,
    resolvedLocalDateTime: window.resolvedLocalDateTime,
    dstResolution: window.dstResolution,
    createdAt: now.toISOString(),
    createdByUserId: actorUserId,
    externalCalendarMutated: false,
    providerMutated: false,
    appointmentCreated: false,
    targetStatusMutated: false,
    targetDeadlineMutated: false,
    reminderScheduled: false,
  };
  const block = await tx.workPlanBlock.create({
    data: {
      ...(planBlockId ? { id: planBlockId } : {}),
      ownerUserId: actorUserId,
      actionItemId: input.targetType === "task" ? targetId : null,
      goalId: input.targetType === "goal" ? targetId : null,
      startsAt: window.startsAt,
      endsAt: window.endsAt,
      timezone: window.timezone,
      sourceJson: {
        source: "quipsly-personal-work-plan-v1",
        creationReceipt: receipt,
        planReceipts: [receipt],
      },
    },
    select: { id: true, updatedAt: true },
  });
  return {
    kind: "saved",
    planBlockId: block.id,
    updatedAt: block.updatedAt,
    receiptId: input.receiptId,
    idempotentReplay: false,
    startsAt: window.startsAt,
    endsAt: window.endsAt,
  };
}
