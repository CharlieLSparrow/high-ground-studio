"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { getPrismaClient } from "@/lib/prisma";
import { isUnreviewedTranscriptActionItem } from "@/lib/server/coaching-packets";
import { getQuipslySession } from "@/lib/server/quipsly-session";
import { parseRecurrenceStart } from "@/lib/task-recurrence";

import type { SchedulePlanBlockStatus } from "./schedule-model";

const RECEIPT_LIMIT = 24;

type PlanFailure = {
  ok: false;
  code: "AUTH_REQUIRED" | "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "UNAVAILABLE";
  error: string;
};

export type CreateWorkPlanBlockResult =
  | { ok: true; planBlockId: string; updatedAt: string; receiptId: string }
  | PlanFailure;

export type UpdateWorkPlanBlockResult =
  | { ok: true; planBlockId: string; status: SchedulePlanBlockStatus; updatedAt: string; receiptId: string }
  | PlanFailure;

function cleanId(value: unknown, max = 200) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function safeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function expectedRevision(value: unknown) {
  const text = cleanId(value, 80);
  const date = new Date(text);
  return text && Number.isFinite(date.getTime()) ? date : null;
}

function parseWindow(startsAtValue: unknown, durationValue: unknown, timezone: string) {
  const startsText = cleanId(startsAtValue, 80);
  const parsedStart = parseRecurrenceStart(startsText, timezone);
  const durationMinutes = Number(durationValue);
  const now = Date.now();
  if (!parsedStart || !Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 720) return null;
  const startsAt = parsedStart.dueAt;
  if (Math.abs(startsAt.getTime() - now) > 5 * 365 * 86_400_000) return null;
  return {
    startsAt,
    endsAt: new Date(startsAt.getTime() + durationMinutes * 60_000),
    durationMinutes,
    requestedLocalDateTime: parsedStart.requestedLocalDateTime,
    resolvedLocalDateTime: parsedStart.resolvedLocalDateTime,
    dstResolution: parsedStart.dstResolution,
  };
}

function revalidatePlanningSurfaces() {
  revalidatePath("/schedule");
  revalidatePath("/today");
}

function taskAccessWhere(userId: string) {
  return [
    { assignedUserId: userId },
    { room: { OR: [
      { createdByUserId: userId },
      { participants: { some: { userId } } },
      { booking: { clientUserId: userId } },
      { booking: { coachUserId: userId } },
    ] } },
    { booking: { OR: [{ clientUserId: userId }, { coachUserId: userId }] } },
  ];
}

function existingReceipts(source: Record<string, unknown>) {
  return Array.isArray(source.planReceipts)
    ? source.planReceipts.filter((receipt) => receipt && typeof receipt === "object" && !Array.isArray(receipt)).slice(-RECEIPT_LIMIT + 1)
    : [];
}

export async function createWorkPlanBlock(input: {
  targetType: "task" | "goal";
  targetId: string;
  startsAt: string;
  durationMinutes: number;
  timezone: string;
}): Promise<CreateWorkPlanBlockResult> {
  const session = await getQuipslySession();
  if (!session?.user?.id) return { ok: false, code: "AUTH_REQUIRED", error: "Sign in before planning private work." };
  const targetId = cleanId(input?.targetId);
  const timezone = cleanId(input?.timezone, 100);
  const window = parseWindow(input?.startsAt, input?.durationMinutes, timezone);
  if (!targetId || !window || (input?.targetType !== "task" && input?.targetType !== "goal")) {
    return { ok: false, code: "INVALID_INPUT", error: "Choose an accessible task or goal, a valid start time, timezone, and a duration from 15 minutes to 12 hours." };
  }

  const userId = session.user.id;
  const prisma = getPrismaClient() as any;
  try {
    const target = input.targetType === "task"
      ? await prisma.actionItem.findFirst({ where: { id: targetId, status: "OPEN", OR: taskAccessWhere(userId) }, select: { id: true, sourceJson: true } })
      : await prisma.goal.findFirst({ where: { id: targetId, ownerUserId: userId, status: "ACTIVE" }, select: { id: true } });
    if (!target || (input.targetType === "task" && isUnreviewedTranscriptActionItem(target))) {
      return { ok: false, code: "NOT_FOUND", error: "Only an accessible open task or an active goal you own can be planned." };
    }

    const receiptId = randomUUID();
    const now = new Date();
    const receipt = {
      id: receiptId,
      kind: "quipsly-work-plan-block-create-v1",
      targetType: input.targetType,
      targetId,
      startsAt: window.startsAt.toISOString(),
      endsAt: window.endsAt.toISOString(),
      timezone,
      requestedLocalDateTime: window.requestedLocalDateTime,
      resolvedLocalDateTime: window.resolvedLocalDateTime,
      dstResolution: window.dstResolution,
      createdAt: now.toISOString(),
      createdByUserId: userId,
      externalCalendarMutated: false,
      targetStatusMutated: false,
    };
    const block = await prisma.workPlanBlock.create({
      data: {
        ownerUserId: userId,
        actionItemId: input.targetType === "task" ? targetId : null,
        goalId: input.targetType === "goal" ? targetId : null,
        startsAt: window.startsAt,
        endsAt: window.endsAt,
        timezone,
        sourceJson: { source: "quipsly-personal-work-plan-v1", creationReceipt: receipt, planReceipts: [receipt] },
      },
      select: { id: true, updatedAt: true },
    });
    revalidatePlanningSurfaces();
    return { ok: true, planBlockId: block.id, updatedAt: block.updatedAt.toISOString(), receiptId };
  } catch (error) {
    console.error("[schedule] failed to create personal focus block", error);
    return { ok: false, code: "UNAVAILABLE", error: "Quipsly could not save this focus block. No task, goal, appointment, or external calendar was changed." };
  }
}

export async function updateWorkPlanBlockStatus(input: {
  planBlockId: string;
  nextStatus: SchedulePlanBlockStatus;
  expectedUpdatedAt: string;
}): Promise<UpdateWorkPlanBlockResult> {
  const session = await getQuipslySession();
  if (!session?.user?.id) return { ok: false, code: "AUTH_REQUIRED", error: "Sign in before changing private planning." };
  const planBlockId = cleanId(input?.planBlockId);
  const expected = expectedRevision(input?.expectedUpdatedAt);
  if (!planBlockId || !expected || !["PLANNED", "COMPLETED", "SKIPPED", "CANCELED"].includes(input?.nextStatus)) {
    return { ok: false, code: "INVALID_INPUT", error: "The focus-block decision is incomplete or invalid." };
  }

  const userId = session.user.id;
  const prisma = getPrismaClient() as any;
  try {
    const receiptId = randomUUID();
    const now = new Date();
    const result = await prisma.$transaction(async (tx: any) => {
      const current = await tx.workPlanBlock.findFirst({ where: { id: planBlockId, ownerUserId: userId }, select: { status: true, sourceJson: true, updatedAt: true } });
      if (!current) return { kind: "not-found" as const };
      if (current.updatedAt.getTime() !== expected.getTime()) return { kind: "conflict" as const };
      const source = safeRecord(current.sourceJson);
      const receipt = {
        id: receiptId,
        kind: "quipsly-work-plan-block-status-v1",
        previousStatus: current.status,
        nextStatus: input.nextStatus,
        changedAt: now.toISOString(),
        changedByUserId: userId,
        externalCalendarMutated: false,
        targetStatusMutated: false,
      };
      const updated = await tx.workPlanBlock.updateMany({
        where: { id: planBlockId, ownerUserId: userId, updatedAt: expected },
        data: {
          status: input.nextStatus,
          completedAt: input.nextStatus === "COMPLETED" ? now : null,
          sourceJson: { ...source, planReceipts: [...existingReceipts(source), receipt] },
        },
      });
      if (updated.count !== 1) return { kind: "conflict" as const };
      const persisted = await tx.workPlanBlock.findUnique({ where: { id: planBlockId }, select: { updatedAt: true } });
      return { kind: "saved" as const, persisted };
    });
    if (result.kind === "not-found") return { ok: false, code: "NOT_FOUND", error: "Only the focus-block owner can change this plan." };
    if (result.kind === "conflict" || !result.persisted) return { ok: false, code: "CONFLICT", error: "This focus block changed elsewhere. Refresh before deciding again." };
    revalidatePlanningSurfaces();
    return { ok: true, planBlockId, status: input.nextStatus, updatedAt: result.persisted.updatedAt.toISOString(), receiptId };
  } catch (error) {
    console.error("[schedule] failed to update focus-block status", error);
    return { ok: false, code: "UNAVAILABLE", error: "Quipsly could not save this planning decision. No task, goal, appointment, or external calendar was changed." };
  }
}

export async function rescheduleWorkPlanBlock(input: {
  planBlockId: string;
  startsAt: string;
  durationMinutes: number;
  timezone: string;
  expectedUpdatedAt: string;
}): Promise<UpdateWorkPlanBlockResult> {
  const session = await getQuipslySession();
  if (!session?.user?.id) return { ok: false, code: "AUTH_REQUIRED", error: "Sign in before rescheduling private work." };
  const planBlockId = cleanId(input?.planBlockId);
  const expected = expectedRevision(input?.expectedUpdatedAt);
  const timezone = cleanId(input?.timezone, 100);
  const window = parseWindow(input?.startsAt, input?.durationMinutes, timezone);
  if (!planBlockId || !expected || !window) {
    return { ok: false, code: "INVALID_INPUT", error: "Choose a valid start time, timezone, and a duration from 15 minutes to 12 hours." };
  }

  const userId = session.user.id;
  const prisma = getPrismaClient() as any;
  try {
    const receiptId = randomUUID();
    const now = new Date();
    const result = await prisma.$transaction(async (tx: any) => {
      const current = await tx.workPlanBlock.findFirst({ where: { id: planBlockId, ownerUserId: userId }, select: { status: true, sourceJson: true, updatedAt: true } });
      if (!current) return { kind: "not-found" as const };
      if (current.updatedAt.getTime() !== expected.getTime()) return { kind: "conflict" as const };
      const source = safeRecord(current.sourceJson);
      const receipt = {
        id: receiptId,
        kind: "quipsly-work-plan-block-reschedule-v1",
        startsAt: window.startsAt.toISOString(),
        endsAt: window.endsAt.toISOString(),
        timezone,
        requestedLocalDateTime: window.requestedLocalDateTime,
        resolvedLocalDateTime: window.resolvedLocalDateTime,
        dstResolution: window.dstResolution,
        changedAt: now.toISOString(),
        changedByUserId: userId,
        externalCalendarMutated: false,
      };
      const updated = await tx.workPlanBlock.updateMany({
        where: { id: planBlockId, ownerUserId: userId, updatedAt: expected },
        data: {
          startsAt: window.startsAt,
          endsAt: window.endsAt,
          timezone,
          status: "PLANNED",
          completedAt: null,
          sourceJson: { ...source, planReceipts: [...existingReceipts(source), receipt] },
        },
      });
      if (updated.count !== 1) return { kind: "conflict" as const };
      const persisted = await tx.workPlanBlock.findUnique({ where: { id: planBlockId }, select: { status: true, updatedAt: true } });
      return { kind: "saved" as const, persisted };
    });
    if (result.kind === "not-found") return { ok: false, code: "NOT_FOUND", error: "Only the focus-block owner can reschedule this plan." };
    if (result.kind === "conflict" || !result.persisted) return { ok: false, code: "CONFLICT", error: "This focus block changed elsewhere. Refresh before rescheduling." };
    revalidatePlanningSurfaces();
    return { ok: true, planBlockId, status: result.persisted.status, updatedAt: result.persisted.updatedAt.toISOString(), receiptId };
  } catch (error) {
    console.error("[schedule] failed to reschedule focus block", error);
    return { ok: false, code: "UNAVAILABLE", error: "Quipsly could not move this focus block. No external calendar was changed." };
  }
}
