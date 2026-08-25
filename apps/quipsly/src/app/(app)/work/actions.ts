"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { getPrismaClient } from "@/lib/prisma";
import { editCanonicalGoalInTransaction } from "@/lib/server/canonical-goal-edit";
import { editCanonicalTaskInTransaction } from "@/lib/server/canonical-task-edit";
import { updateCanonicalTaskStatusInTransaction } from "@/lib/server/canonical-task-status";
import { isUnreviewedTranscriptActionItemSource } from "@high-ground/quipsly-domain/coaching-packet";
import { listProjectsVisibleToEmail } from "@/lib/server/home-nest";
import { applyWorkTagMerge, previewWorkTagMerge, type WorkTagMergePreview } from "@/lib/server/work-tag-merge";
import { applyWorkTagMergeRollback, previewWorkTagMergeRollback, type WorkTagMergeRollbackPreview } from "@/lib/server/work-tag-merge-rollback";
import { mutateWorkTagCandidate, type WorkTagCandidateOperation } from "@/lib/server/work-tag-candidates";
import { createAndAssignWorkEntityTag, createWorkTagTaxonomy, mutateWorkTagTaxonomy, replaceWorkEntityTags, type WorkTagEntityKind, type WorkTagTaxonomyOperation } from "@/lib/server/work-tags";
import { getQuipslySession } from "@/lib/server/quipsly-session";
import { setTaskReminderInTransaction } from "@/lib/server/task-reminders";
import { personalOrSharedSessionTaskAccessWhere } from "@/lib/server/task-access";
import {
  normalizeWeeklyCommitmentIntent,
  parseWeeklyCommitmentWeekStart,
  saveWeeklyCommitmentInTransaction,
} from "@/lib/server/weekly-commitment";
import {
  editTaskRecurrenceOccurrenceInTransaction,
  materializeTaskOccurrence,
  replaceTaskRecurrenceFromOccurrenceInTransaction,
  updateTaskRecurrenceStatusInTransaction,
  type PersistedTaskRecurrenceSeries,
} from "@/lib/server/task-recurrence";
import { initialOccurrencePlan, isIanaTimeZone, parseRecurrenceStart, type TaskRecurrenceCadence, type TaskRecurrenceFrequency } from "@/lib/task-recurrence";

import { safeRecord, type WorkGoalStatus, type WorkTaskStatus } from "./work-model";

export type UpdateWorkTaskStatusResult =
  | { ok: true; taskId: string; status: WorkTaskStatus; updatedAt: string; receiptId: string; nextOccurrenceTaskId?: string | null }
  | { ok: false; code: "AUTH_REQUIRED" | "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "UNAVAILABLE"; error: string };

export type CreateWorkTaskResult =
  | { ok: true; taskId: string; updatedAt: string; receiptId: string; recurrenceSeriesId?: string; occurrenceCount?: number }
  | { ok: false; code: "AUTH_REQUIRED" | "INVALID_INPUT" | "UNAVAILABLE"; error: string };

export type EditWorkTaskResult =
  | { ok: true; taskId: string; title: string; detail: string | null; dueAt: string | null; updatedAt: string; receiptId: string }
  | { ok: false; code: "AUTH_REQUIRED" | "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "UNAVAILABLE"; error: string };

export type WorkGoalMutationResult =
  | { ok: true; goalId: string; status: WorkGoalStatus; updatedAt: string; receiptId: string }
  | { ok: false; code: "AUTH_REQUIRED" | "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "UNAVAILABLE"; error: string };

export type CreateWorkGoalResult =
  | { ok: true; goalId: string; updatedAt: string; receiptId: string }
  | { ok: false; code: "AUTH_REQUIRED" | "INVALID_INPUT" | "UNAVAILABLE"; error: string };

export type EditWorkGoalResult =
  | { ok: true; goalId: string; title: string; description: string | null; targetAt: string | null; updatedAt: string; receiptId: string }
  | { ok: false; code: "AUTH_REQUIRED" | "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "UNAVAILABLE"; error: string };

export type SaveWeeklyCommitmentResult =
  | { ok: true; commitmentId: string; updatedAt: string; receiptId: string }
  | { ok: false; code: "AUTH_REQUIRED" | "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "UNAVAILABLE"; error: string };

export type ReplaceWorkTagsActionResult =
  | { ok: true; entityKind: WorkTagEntityKind; entityId: string; projectId: string; tagIds: string[]; updatedAt: string; receiptId: string }
  | { ok: false; code: "AUTH_REQUIRED" | "INVALID_INPUT" | "NOT_FOUND" | "PROJECT_REQUIRED" | "FORBIDDEN" | "CONFLICT" | "UNAVAILABLE"; error: string };

export type CreateAndAssignWorkTagActionResult =
  | {
      ok: true;
      entityKind: WorkTagEntityKind;
      entityId: string;
      projectId: string;
      tag: { id: string; label: string; slug: string; category: string; projectId: string };
      created: boolean;
      updatedAt: string;
      receiptId: string;
    }
  | { ok: false; code: "AUTH_REQUIRED" | "INVALID_INPUT" | "NOT_FOUND" | "PROJECT_REQUIRED" | "FORBIDDEN" | "CONFLICT" | "SLUG_CONFLICT" | "ARCHIVED" | "UNAVAILABLE"; error: string };

export type CreateWorkTagTaxonomyActionResult =
  | {
      ok: true;
      projectId: string;
      tag: { id: string; label: string; slug: string; isActive: boolean; archivedAt: string | null; updatedAt: string };
      aliases: Array<{ id: string; label: string; slug: string }>;
      created: boolean;
      revision: number;
      receiptId: string | null;
    }
  | { ok: false; code: "AUTH_REQUIRED" | "INVALID_INPUT" | "NOT_FOUND" | "FORBIDDEN" | "ARCHIVED" | "SLUG_CONFLICT" | "UNAVAILABLE"; error: string };

export type MutateWorkTagTaxonomyActionResult =
  | {
      ok: true;
      operation: WorkTagTaxonomyOperation;
      projectId: string;
      tag: { id: string; label: string; slug: string; isActive: boolean; archivedAt: string | null; updatedAt: string };
      aliases: Array<{ id: string; label: string; slug: string }>;
      revision: number;
      receiptId: string;
    }
  | { ok: false; code: "AUTH_REQUIRED" | "INVALID_INPUT" | "NOT_FOUND" | "FORBIDDEN" | "CONFLICT" | "SLUG_CONFLICT" | "ALREADY_ACTIVE" | "ALREADY_ARCHIVED" | "MERGED" | "UNAVAILABLE"; error: string };

export type MutateWorkTagCandidateActionResult =
  | {
      ok: true;
      operation: WorkTagCandidateOperation;
      projectId: string;
      candidate: {
        id: string;
        label: string;
        slug: string;
        status: "PENDING" | "PROMOTED" | "REJECTED";
        promotedTagId: string | null;
        reviewedAt: string | null;
        updatedAt: string;
      };
      tag: { id: string; label: string; slug: string; isActive: boolean } | null;
      revision: number;
      receiptId: string;
    }
  | { ok: false; code: "AUTH_REQUIRED" | "INVALID_INPUT" | "NOT_FOUND" | "FORBIDDEN" | "CONFLICT" | "INVALID_STATE" | "SLUG_CONFLICT" | "ARCHIVED" | "UNAVAILABLE"; error: string };

export type SerializedWorkTagMergePreview = Omit<WorkTagMergePreview, "source" | "target"> & {
  source: Omit<WorkTagMergePreview["source"], "updatedAt"> & { updatedAt: string };
  target: Omit<WorkTagMergePreview["target"], "updatedAt"> & { updatedAt: string };
};

export type PreviewWorkTagMergeActionResult =
  | { ok: true; preview: SerializedWorkTagMergePreview }
  | { ok: false; code: "AUTH_REQUIRED" | "INVALID_INPUT" | "NOT_FOUND" | "FORBIDDEN" | "CONFLICT" | "MERGED" | "UNAVAILABLE"; error: string };

export type ApplyWorkTagMergeActionResult =
  | {
      ok: true;
      projectId: string;
      sourceTag: { id: string; label: string; slug: string; isActive: boolean; mergedIntoTagId: string; mergedAt: string; updatedAt: string };
      targetTag: { id: string; label: string; slug: string; updatedAt: string };
      receiptId: string;
      impactHash: string;
      counts: WorkTagMergePreview["counts"];
      deduplicated: WorkTagMergePreview["deduplicated"];
    }
  | { ok: false; code: "AUTH_REQUIRED" | "INVALID_INPUT" | "NOT_FOUND" | "FORBIDDEN" | "CONFLICT" | "MERGED" | "BLOCKED" | "UNAVAILABLE"; error: string; preview?: SerializedWorkTagMergePreview };

export type SerializedWorkTagMergeRollbackPreview = Omit<WorkTagMergeRollbackPreview, "source" | "target"> & {
  source: Omit<WorkTagMergeRollbackPreview["source"], "updatedAt"> & { updatedAt: string };
  target: Omit<WorkTagMergeRollbackPreview["target"], "updatedAt"> & { updatedAt: string };
};

export type PreviewWorkTagMergeRollbackActionResult =
  | { ok: true; preview: SerializedWorkTagMergeRollbackPreview }
  | { ok: false; code: "AUTH_REQUIRED" | "INVALID_INPUT" | "NOT_FOUND" | "FORBIDDEN" | "UNSUPPORTED" | "UNAVAILABLE"; error: string };

export type ApplyWorkTagMergeRollbackActionResult =
  | {
      ok: true;
      projectId: string;
      sourceTag: { id: string; label: string; slug: string; isActive: boolean; mergedIntoTagId: null; mergedAt: null; updatedAt: string };
      targetTag: { id: string; label: string; slug: string; updatedAt: string };
      mergeReceiptId: string;
      rollbackReceiptId: string;
      previewHash: string;
      counts: WorkTagMergeRollbackPreview["counts"];
    }
  | { ok: false; code: "AUTH_REQUIRED" | "INVALID_INPUT" | "NOT_FOUND" | "FORBIDDEN" | "UNSUPPORTED" | "CONFLICT" | "BLOCKED" | "UNAVAILABLE"; error: string; preview?: SerializedWorkTagMergeRollbackPreview };

export type UpdateTaskRecurrenceStatusResult =
  | { ok: true; seriesId: string; status: "ACTIVE" | "PAUSED" | "ENDED"; updatedAt: string; receiptId: string; materializedCount: number }
  | { ok: false; code: "AUTH_REQUIRED" | "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "UNAVAILABLE"; error: string };

export type EditTaskRecurrenceResult =
  | {
      ok: true;
      scope: "THIS_OCCURRENCE" | "THIS_AND_FUTURE";
      taskId: string;
      receiptId: string;
      updatedAt?: string;
      priorSeriesId?: string;
      nextSeriesId?: string;
      firstTaskId?: string | null;
      supersededTaskCount?: number;
      materializedCount?: number;
      reused: boolean;
    }
  | { ok: false; code: "AUTH_REQUIRED" | "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "UNAVAILABLE"; error: string };

export type SetWorkTaskReminderResult =
  | {
      ok: true;
      taskId: string;
      reminderId: string;
      remindAt: string | null;
      status: "ACTIVE" | "CANCELED";
      updatedAt: string;
      operation: "CREATED" | "RESCHEDULED" | "CANCELED" | "REACTIVATED" | "UNCHANGED";
      revisionId: string | null;
      idempotentReplay: boolean;
      deviceNotificationsReconciled: false;
      delivered: false;
    }
  | { ok: false; code: "AUTH_REQUIRED" | "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "UNAVAILABLE"; error: string };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanId(value: unknown, max = 200) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function allowedStatus(value: unknown): value is WorkTaskStatus {
  return value === "OPEN" || value === "DONE" || value === "CANCELED";
}

function allowedGoalStatus(value: unknown): value is WorkGoalStatus {
  return value === "ACTIVE" || value === "PAUSED" || value === "ACHIEVED" || value === "ARCHIVED";
}

function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function normalizedText(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function expectedRevision(value: unknown) {
  const text = cleanId(value, 80);
  const date = new Date(text);
  return text && Number.isFinite(date.getTime()) ? date : null;
}

async function visibleProjectId(input: { projectId?: string | null; actorEmail: string; prisma: any }) {
  const projectId = cleanId(input.projectId);
  if (!projectId) return { ok: true as const, projectId: null };
  if (!input.actorEmail) return { ok: false as const };
  const projects = await listProjectsVisibleToEmail(input.actorEmail, input.prisma);
  return projects.some((project) => project.id === projectId && (project.role === "OWNER" || project.role === "EDITOR"))
    ? { ok: true as const, projectId }
    : { ok: false as const };
}

export async function createWorkGoal(input: {
  title: string;
  description?: string;
  targetAt?: string | null;
  projectId?: string | null;
}): Promise<CreateWorkGoalResult> {
  const session = await getQuipslySession();
  if (!session?.user?.id) return { ok: false, code: "AUTH_REQUIRED", error: "Sign in before creating a private goal." };
  const title = cleanText(input?.title, 500);
  const description = cleanText(input?.description, 5000);
  const targetText = cleanId(input?.targetAt, 80);
  const targetAt = targetText ? new Date(targetText) : null;
  const now = new Date();
  if (!title || (targetAt && !Number.isFinite(targetAt.getTime())) || (targetAt && Math.abs(targetAt.getTime() - now.getTime()) > 20 * 365 * 86_400_000)) {
    return { ok: false, code: "INVALID_INPUT", error: "Add a goal title and, if used, a valid target date within twenty years." };
  }
  const receiptId = randomUUID();
  try {
    const prisma = getPrismaClient() as any;
    const project = await visibleProjectId({ projectId: input?.projectId, actorEmail: cleanText(session.user.primaryEmail || session.user.email, 320).toLowerCase(), prisma });
    if (!project.ok) return { ok: false, code: "INVALID_INPUT", error: "Choose a Nest that is available to your account." };
    const goal = await prisma.goal.create({
      data: {
        ownerUserId: session.user.id,
        projectId: project.projectId,
        title,
        description: description || null,
        targetAt,
        sourceJson: {
          source: "quipsly-work-manual-goal-v1",
          creationReceipt: {
            id: receiptId,
            kind: "quipsly-goal-create-v1",
            createdAt: now.toISOString(),
            createdByUserId: session.user.id,
            externalSideEffects: false,
          },
        },
      },
      select: { id: true, updatedAt: true },
    });
    revalidatePath("/work");
    return { ok: true, goalId: goal.id, updatedAt: goal.updatedAt.toISOString(), receiptId };
  } catch (error) {
    console.error("[work] failed to create private goal", error);
    return { ok: false, code: "UNAVAILABLE", error: "Quipsly could not create this goal. No task, message, or calendar event was created." };
  }
}

export async function editWorkGoal(input: {
  goalId: string;
  title: string;
  description?: string | null;
  targetDecision: "KEEP" | "SET" | "CLEAR";
  targetLocalDate: string | null;
  timezone: string;
  expectedUpdatedAt: string;
}): Promise<EditWorkGoalResult> {
  const session = await getQuipslySession();
  if (!session?.user?.id) {
    return { ok: false, code: "AUTH_REQUIRED", error: "Sign in before editing a private goal." };
  }

  const goalId = cleanId(input?.goalId);
  const title = normalizedText(input?.title);
  const normalizedDescription = normalizedText(input?.description);
  const description = normalizedDescription || null;
  const expectedUpdatedAt = expectedRevision(input?.expectedUpdatedAt);
  const targetDecision = input?.targetDecision;
  const timezone = typeof input?.timezone === "string" ? input.timezone.trim() : "";
  const hasTargetDecision = Boolean(input)
    && Object.prototype.hasOwnProperty.call(input, "targetLocalDate");
  const targetDecisionHasValidType = input?.targetLocalDate === null
    || typeof input?.targetLocalDate === "string";
  const targetLocalDate = typeof input?.targetLocalDate === "string"
    ? input.targetLocalDate.trim()
    : "";
  const targetFormatValid = !targetLocalDate || /^\d{4}-\d{2}-\d{2}$/.test(targetLocalDate);
  const parsedTarget = targetLocalDate && targetFormatValid
    ? parseRecurrenceStart(`${targetLocalDate}T12:00`, timezone)
    : null;
  const targetAt = parsedTarget?.dueAt ?? null;
  const targetDecisionValid = targetDecision === "KEEP"
    || targetDecision === "SET"
    || targetDecision === "CLEAR";
  const targetPayloadMatchesDecision = targetDecision === "SET"
    ? Boolean(targetLocalDate && parsedTarget)
    : !targetLocalDate;
  const now = new Date();

  if (!goalId
      || !title
      || title.length > 500
      || normalizedDescription.length > 5_000
      || !expectedUpdatedAt
      || !hasTargetDecision
      || !targetDecisionHasValidType
      || !targetDecisionValid
      || !targetPayloadMatchesDecision
      || timezone.length > 100
      || (targetDecision === "SET" && !isIanaTimeZone(timezone))
      || !targetFormatValid
      || (targetLocalDate && !parsedTarget)) {
    return {
      ok: false,
      code: "INVALID_INPUT",
      error: "Use a title under 500 characters, description under 5,000 characters, and a valid target date.",
    };
  }
  if (targetAt && Math.abs(targetAt.getTime() - now.getTime()) > 20 * 365 * 86_400_000) {
    return { ok: false, code: "INVALID_INPUT", error: "Choose a target date within twenty years." };
  }

  try {
    const prisma = getPrismaClient() as any;
    const result = await prisma.$transaction(
      (tx: any) => editCanonicalGoalInTransaction({
        tx,
        goalId,
        actorUserId: session.user.id,
        expectedUpdatedAt,
        title,
        description,
        targetDecision: targetDecision === "SET" && parsedTarget && targetAt ? {
          kind: "SET" as const,
          targetAt,
          requestedLocalDate: targetLocalDate,
          resolvedLocalDateTime: parsedTarget.resolvedLocalDateTime,
          timezone: parsedTarget.timezone,
        } : targetDecision === "CLEAR"
          ? { kind: "CLEAR" as const }
          : { kind: "KEEP" as const },
        surface: "nest-work",
        now,
      }),
      { isolationLevel: "Serializable" },
    );

    if (result.kind === "not-found") {
      return { ok: false, code: "NOT_FOUND", error: "Only the goal owner can edit this goal." };
    }
    if (result.kind === "closed") {
      return { ok: false, code: "INVALID_INPUT", error: "Make this goal active or paused before editing its definition or target." };
    }
    if (result.kind === "conflict") {
      return { ok: false, code: "CONFLICT", error: "This goal changed elsewhere. Refresh before editing again." };
    }

    revalidatePath("/work");
    revalidatePath("/schedule");
    revalidatePath("/today");
    if (result.record.roomId) revalidatePath(`/sessions/${result.record.roomId}`);
    return {
      ok: true,
      goalId,
      title: result.record.title,
      description: result.record.description,
      targetAt: result.record.targetAt?.toISOString() ?? null,
      updatedAt: result.record.updatedAt.toISOString(),
      receiptId: result.receiptId,
    };
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";
    if (code === "P2034") {
      return { ok: false, code: "CONFLICT", error: "This goal changed elsewhere. Refresh before editing again." };
    }
    console.error("[work] failed to edit private goal", error);
    return { ok: false, code: "UNAVAILABLE", error: "Quipsly could not save this goal edit. No task, progress, calendar event, message, or provider action changed." };
  }
}

export async function updateWorkGoalStatus(input: {
  goalId: string;
  nextStatus: WorkGoalStatus;
  expectedUpdatedAt: string;
}): Promise<WorkGoalMutationResult> {
  const session = await getQuipslySession();
  if (!session?.user?.id) return { ok: false, code: "AUTH_REQUIRED", error: "Sign in before changing a private goal." };
  const goalId = cleanId(input?.goalId);
  const expected = expectedRevision(input?.expectedUpdatedAt);
  if (!goalId || !expected || !allowedGoalStatus(input?.nextStatus)) {
    return { ok: false, code: "INVALID_INPUT", error: "The goal decision is incomplete or invalid." };
  }
  const prisma = getPrismaClient() as any;
  const userId = session.user.id;
  try {
    const goal = await prisma.goal.findFirst({ where: { id: goalId, ownerUserId: userId }, select: { id: true, status: true, sourceJson: true, updatedAt: true } });
    if (!goal) return { ok: false, code: "NOT_FOUND", error: "Only the goal owner can change this goal." };
    if (goal.updatedAt.getTime() !== expected.getTime()) return { ok: false, code: "CONFLICT", error: "This goal changed elsewhere. The current goal is being refreshed." };
    const now = new Date();
    const receiptId = randomUUID();
    const result = await prisma.$transaction(async (tx: any) => {
      const current = await tx.goal.findFirst({ where: { id: goalId, ownerUserId: userId }, select: { id: true, status: true, sourceJson: true, updatedAt: true } });
      if (!current || current.updatedAt.getTime() !== expected.getTime()) return null;
      const source = safeRecord(current.sourceJson);
      const receipt = {
        id: receiptId,
        kind: "quipsly-goal-status-v1",
        previousStatus: current.status,
        nextStatus: input.nextStatus,
        changedAt: now.toISOString(),
        changedByUserId: userId,
        externalSideEffects: false,
      };
      const updated = await tx.goal.updateMany({
        where: { id: goalId, ownerUserId: userId, updatedAt: expected },
        data: {
          status: input.nextStatus,
          achievedAt: input.nextStatus === "ACHIEVED" ? now : null,
          sourceJson: { ...source, lastStatusReceipt: receipt },
        },
      });
      if (updated.count !== 1) return null;
      await tx.goalProgressReceipt.create({
        data: {
          goalId,
          actorUserId: userId,
          kind: "STATUS_CHANGED",
          progressPercent: input.nextStatus === "ACHIEVED" ? 100 : null,
          note: null,
          evidenceJson: receipt,
          occurredAt: now,
        },
      });
      return tx.goal.findUnique({ where: { id: goalId }, select: { updatedAt: true } });
    });
    if (!result) return { ok: false, code: "CONFLICT", error: "This goal changed elsewhere. The current goal is being refreshed." };
    revalidatePath("/work");
    return { ok: true, goalId, status: input.nextStatus, updatedAt: result.updatedAt.toISOString(), receiptId };
  } catch (error) {
    console.error("[work] failed to update goal status", error);
    return { ok: false, code: "UNAVAILABLE", error: "Quipsly could not save this goal decision. No external action was taken." };
  }
}

export async function recordWorkGoalProgress(input: {
  goalId: string;
  progressPercent: number;
  note?: string;
  expectedUpdatedAt: string;
}): Promise<WorkGoalMutationResult> {
  const session = await getQuipslySession();
  if (!session?.user?.id) return { ok: false, code: "AUTH_REQUIRED", error: "Sign in before recording private goal progress." };
  const goalId = cleanId(input?.goalId);
  const expected = expectedRevision(input?.expectedUpdatedAt);
  const progressPercent = Number(input?.progressPercent);
  const note = cleanText(input?.note, 2000);
  if (!goalId || !expected || !Number.isInteger(progressPercent) || progressPercent < 0 || progressPercent > 100) {
    return { ok: false, code: "INVALID_INPUT", error: "Choose whole-number progress from 0 to 100." };
  }
  const prisma = getPrismaClient() as any;
  const userId = session.user.id;
  try {
    const now = new Date();
    const receiptId = randomUUID();
    const result = await prisma.$transaction(async (tx: any) => {
      const current = await tx.goal.findFirst({ where: { id: goalId, ownerUserId: userId }, select: { id: true, status: true, sourceJson: true, updatedAt: true } });
      if (!current) return { kind: "not-found" as const };
      if (current.updatedAt.getTime() !== expected.getTime()) return { kind: "conflict" as const };
      const receipt = {
        id: receiptId,
        kind: "quipsly-goal-progress-v1",
        progressPercent,
        note: note || null,
        recordedAt: now.toISOString(),
        recordedByUserId: userId,
        externalSideEffects: false,
      };
      const updated = await tx.goal.updateMany({
        where: { id: goalId, ownerUserId: userId, updatedAt: expected },
        data: { sourceJson: { ...safeRecord(current.sourceJson), lastProgressReceipt: receipt } },
      });
      if (updated.count !== 1) return { kind: "conflict" as const };
      await tx.goalProgressReceipt.create({ data: { goalId, actorUserId: userId, kind: "PROGRESS", progressPercent, note: note || null, evidenceJson: receipt, occurredAt: now } });
      const persisted = await tx.goal.findUnique({ where: { id: goalId }, select: { status: true, updatedAt: true } });
      return { kind: "saved" as const, persisted };
    });
    if (result?.kind === "not-found") return { ok: false, code: "NOT_FOUND", error: "Only the goal owner can record progress." };
    if (!result || result.kind === "conflict" || !result.persisted) return { ok: false, code: "CONFLICT", error: "This goal changed elsewhere. The current goal is being refreshed." };
    revalidatePath("/work");
    return { ok: true, goalId, status: result.persisted.status, updatedAt: result.persisted.updatedAt.toISOString(), receiptId };
  } catch (error) {
    console.error("[work] failed to record goal progress", error);
    return { ok: false, code: "UNAVAILABLE", error: "Quipsly could not record this progress. No external action was taken." };
  }
}

export async function linkWorkGoalTask(input: {
  goalId: string;
  taskId: string;
  relationship: "CONTRIBUTES" | "BLOCKS" | "OUTCOME";
  expectedUpdatedAt: string;
}): Promise<WorkGoalMutationResult> {
  const session = await getQuipslySession();
  if (!session?.user?.id) return { ok: false, code: "AUTH_REQUIRED", error: "Sign in before connecting private work." };
  const goalId = cleanId(input?.goalId);
  const taskId = cleanId(input?.taskId);
  const expected = expectedRevision(input?.expectedUpdatedAt);
  if (!goalId || !taskId || !expected || !["CONTRIBUTES", "BLOCKS", "OUTCOME"].includes(input?.relationship)) {
    return { ok: false, code: "INVALID_INPUT", error: "Choose a goal, committed task, and relationship." };
  }
  const prisma = getPrismaClient() as any;
  const userId = session.user.id;
  try {
    const receiptId = randomUUID();
    const now = new Date();
    const result = await prisma.$transaction(async (tx: any) => {
      const [goal, task] = await Promise.all([
        tx.goal.findFirst({ where: { id: goalId, ownerUserId: userId }, select: { id: true, status: true, sourceJson: true, updatedAt: true } }),
        tx.actionItem.findFirst({ where: { id: taskId, OR: personalOrSharedSessionTaskAccessWhere(userId) }, select: { id: true, sourceJson: true } }),
      ]);
      if (!goal || !task || isUnreviewedTranscriptActionItemSource(task.sourceJson)) return { kind: "not-found" as const };
      if (goal.updatedAt.getTime() !== expected.getTime()) return { kind: "conflict" as const };
      const receipt = { id: receiptId, kind: "quipsly-goal-task-link-v1", relationship: input.relationship, linkedAt: now.toISOString(), linkedByUserId: userId, externalSideEffects: false };
      const updated = await tx.goal.updateMany({ where: { id: goalId, ownerUserId: userId, updatedAt: expected }, data: { sourceJson: { ...safeRecord(goal.sourceJson), lastTaskLinkReceipt: receipt } } });
      if (updated.count !== 1) return { kind: "conflict" as const };
      await tx.goalTaskLink.upsert({
        where: { goalId_actionItemId: { goalId, actionItemId: taskId } },
        create: { goalId, actionItemId: taskId, relationship: input.relationship, createdByUserId: userId, sourceJson: receipt },
        update: { relationship: input.relationship, createdByUserId: userId, sourceJson: receipt },
      });
      const persisted = await tx.goal.findUnique({ where: { id: goalId }, select: { status: true, updatedAt: true } });
      return { kind: "saved" as const, persisted };
    });
    if (result?.kind === "not-found") return { ok: false, code: "NOT_FOUND", error: "The owned goal and committed task must both be available to this account." };
    if (!result || result.kind === "conflict" || !result.persisted) return { ok: false, code: "CONFLICT", error: "This goal changed elsewhere. The current goal is being refreshed." };
    revalidatePath("/work");
    return { ok: true, goalId, status: result.persisted.status, updatedAt: result.persisted.updatedAt.toISOString(), receiptId };
  } catch (error) {
    console.error("[work] failed to link goal and task", error);
    return { ok: false, code: "UNAVAILABLE", error: "Quipsly could not connect this task. Neither record was otherwise changed." };
  }
}

export async function unlinkWorkGoalTask(input: {
  goalId: string;
  taskId: string;
  expectedUpdatedAt: string;
}): Promise<WorkGoalMutationResult> {
  const session = await getQuipslySession();
  if (!session?.user?.id) return { ok: false, code: "AUTH_REQUIRED", error: "Sign in before disconnecting private work." };
  const goalId = cleanId(input?.goalId);
  const taskId = cleanId(input?.taskId);
  const expected = expectedRevision(input?.expectedUpdatedAt);
  if (!goalId || !taskId || !expected) return { ok: false, code: "INVALID_INPUT", error: "The goal-task unlink request is incomplete." };
  const prisma = getPrismaClient() as any;
  const userId = session.user.id;
  try {
    const receiptId = randomUUID();
    const now = new Date();
    const result = await prisma.$transaction(async (tx: any) => {
      const goal = await tx.goal.findFirst({ where: { id: goalId, ownerUserId: userId }, select: { id: true, status: true, sourceJson: true, updatedAt: true } });
      if (!goal) return { kind: "not-found" as const };
      if (goal.updatedAt.getTime() !== expected.getTime()) return { kind: "conflict" as const };
      const receipt = { id: receiptId, kind: "quipsly-goal-task-unlink-v1", taskId, unlinkedAt: now.toISOString(), unlinkedByUserId: userId, externalSideEffects: false };
      const updated = await tx.goal.updateMany({ where: { id: goalId, ownerUserId: userId, updatedAt: expected }, data: { sourceJson: { ...safeRecord(goal.sourceJson), lastTaskLinkReceipt: receipt } } });
      if (updated.count !== 1) return { kind: "conflict" as const };
      await tx.goalTaskLink.deleteMany({ where: { goalId, actionItemId: taskId } });
      const persisted = await tx.goal.findUnique({ where: { id: goalId }, select: { status: true, updatedAt: true } });
      return { kind: "saved" as const, persisted };
    });
    if (result?.kind === "not-found") return { ok: false, code: "NOT_FOUND", error: "Only the goal owner can disconnect linked work." };
    if (!result || result.kind === "conflict" || !result.persisted) return { ok: false, code: "CONFLICT", error: "This goal changed elsewhere. The current goal is being refreshed." };
    revalidatePath("/work");
    return { ok: true, goalId, status: result.persisted.status, updatedAt: result.persisted.updatedAt.toISOString(), receiptId };
  } catch (error) {
    console.error("[work] failed to unlink goal and task", error);
    return { ok: false, code: "UNAVAILABLE", error: "Quipsly could not disconnect this task. Neither record was otherwise changed." };
  }
}

export async function saveWeeklyCommitment(input: {
  weekStartsOn: string;
  commitmentOne: string;
  commitmentTwo?: string;
  commitmentThree?: string;
  supportNeeded?: string;
  progressNotes?: string;
  clientReviewed?: boolean;
  expectedUpdatedAt?: string | null;
}): Promise<SaveWeeklyCommitmentResult> {
  const session = await getQuipslySession();
  if (!session?.user?.id) return { ok: false, code: "AUTH_REQUIRED", error: "Sign in before saving a private weekly plan." };
  const now = new Date();
  const weekStartsAt = parseWeeklyCommitmentWeekStart(input?.weekStartsOn, now);
  const normalized = normalizeWeeklyCommitmentIntent(input);
  const expectedText = cleanId(input?.expectedUpdatedAt, 80);
  const expected = expectedText ? expectedRevision(expectedText) : null;
  if (!weekStartsAt || !normalized.commitments[0] || (expectedText && !expected)) {
    return { ok: false, code: "INVALID_INPUT", error: "Choose a valid Monday and add at least one concrete weekly commitment." };
  }

  const prisma = getPrismaClient() as any;
  const userId = session.user.id;
  const clientRequestId = randomUUID();
  const receiptId = `web-weekly-plan-${clientRequestId}`;
  try {
    const result = await prisma.$transaction(
      (tx: any) => saveWeeklyCommitmentInTransaction(tx, {
        clientUserId: userId,
        weekStartsAt,
        commitments: normalized.commitments,
        supportNeeded: normalized.supportNeeded,
        progressNotes: normalized.progressNotes,
        clientReviewed: input.clientReviewed === true,
        expectedUpdatedAt: expected,
        clientRequestId,
        receiptId,
        surface: "nest-work",
        now,
      }),
      { isolationLevel: "Serializable" },
    );
    if (result.kind === "not-found") return { ok: false, code: "NOT_FOUND", error: "This weekly record is no longer active and cannot be rewritten." };
    if (result.kind === "conflict" || result.kind === "identity-conflict") return { ok: false, code: "CONFLICT", error: "This weekly plan changed elsewhere. Refresh before saving again." };
    revalidatePath("/work");
    revalidatePath("/schedule");
    return { ok: true, commitmentId: result.commitment.id, updatedAt: result.commitment.updatedAt.toISOString(), receiptId };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && String((error as { code?: unknown }).code) === "P2002") {
      return { ok: false, code: "CONFLICT", error: "This weekly plan was created elsewhere. Refresh before saving again." };
    }
    console.error("[work] failed to save weekly commitment", error);
    return { ok: false, code: "UNAVAILABLE", error: "Quipsly could not save this weekly plan. No messages, calendar events, or provider actions occurred." };
  }
}

export async function createWorkTask(input: {
  title: string;
  detail?: string;
  dueAt?: string | null;
  dueLocal?: string | null;
  timezone?: string | null;
  projectId?: string | null;
  recurrence?: {
    cadence: TaskRecurrenceCadence;
    frequency: TaskRecurrenceFrequency;
    interval?: number;
  } | null;
}): Promise<CreateWorkTaskResult> {
  const session = await getQuipslySession();
  if (!session?.user?.id) {
    return { ok: false, code: "AUTH_REQUIRED", error: "Sign in before creating private work." };
  }
  const title = cleanText(input?.title, 500);
  const detail = cleanText(input?.detail, 5000);
  const dueText = cleanId(input?.dueAt, 80);
  const dueLocal = cleanId(input?.dueLocal, 40);
  const timezone = cleanId(input?.timezone, 100);
  const parsedLocal = dueLocal ? parseRecurrenceStart(dueLocal, timezone) : null;
  const dueAt = parsedLocal?.dueAt ?? (dueText ? new Date(dueText) : null);
  const recurrence = input?.recurrence;
  const recurrenceInterval = Number(recurrence?.interval ?? 1);
  const recurrenceValid = !recurrence || (
    (recurrence.cadence === "FIXED" || recurrence.cadence === "COMPLETION")
    && (recurrence.frequency === "DAILY" || recurrence.frequency === "WEEKLY" || recurrence.frequency === "MONTHLY")
    && Number.isInteger(recurrenceInterval)
    && recurrenceInterval >= 1
    && recurrenceInterval <= 365
    && Boolean(parsedLocal)
  );
  if (!title || (dueAt && !Number.isFinite(dueAt.getTime()))) {
    return { ok: false, code: "INVALID_INPUT", error: "Add a task title and, if used, a valid due date." };
  }
  if ((dueLocal && !parsedLocal) || !recurrenceValid) {
    return { ok: false, code: "INVALID_INPUT", error: "Choose a valid local due time, timezone, and repeat interval." };
  }
  const now = new Date();
  if (dueAt && Math.abs(dueAt.getTime() - now.getTime()) > 10 * 365 * 86_400_000) {
    return { ok: false, code: "INVALID_INPUT", error: "Choose a due date within ten years." };
  }
  const receiptId = randomUUID();
  try {
    const prisma = getPrismaClient() as any;
    const project = await visibleProjectId({ projectId: input?.projectId, actorEmail: cleanText(session.user.primaryEmail || session.user.email, 320).toLowerCase(), prisma });
    if (!project.ok) return { ok: false, code: "INVALID_INPUT", error: "Choose a Nest that is available to your account." };
    if (recurrence && parsedLocal) {
      const seriesId = randomUUID();
      const seriesReceipt = {
        id: receiptId,
        kind: "quipsly-task-recurrence-create-v1",
        createdAt: now.toISOString(),
        createdByUserId: session.user.id,
        requestedLocalDateTime: parsedLocal.requestedLocalDateTime,
        resolvedLocalDateTime: parsedLocal.resolvedLocalDateTime,
        dstResolution: parsedLocal.dstResolution,
        timezone: parsedLocal.timezone,
        initialMaterializationCount: recurrence.cadence === "FIXED" ? 3 : 1,
        externalSideEffects: false,
        notificationScheduled: false,
        providerCalendarEventCreated: false,
      };
      const saved = await prisma.$transaction(async (tx: any) => {
        const series = await tx.taskRecurrenceSeries.create({
          data: {
            id: seriesId,
            ownerUserId: session.user.id,
            projectId: project.projectId,
            title,
            detail: detail || null,
            cadence: recurrence.cadence,
            frequency: recurrence.frequency,
            interval: recurrenceInterval,
            timezone: parsedLocal.timezone,
            localTimeMinutes: parsedLocal.localTimeMinutes,
            anchorLocalDate: parsedLocal.anchorLocalDate,
            anchorDayOfMonth: parsedLocal.anchorDayOfMonth,
            sourceJson: { source: "quipsly-task-recurrence-v1", creationReceipt: seriesReceipt },
          },
        });
        const persistedSeries: PersistedTaskRecurrenceSeries = {
          ...series,
          projectId: series.projectId ?? null,
          detail: series.detail ?? null,
        };
        const plans = initialOccurrencePlan(persistedSeries);
        const materialized = [];
        for (const occurrence of plans) {
          materialized.push(await materializeTaskOccurrence({
            tx,
            series: persistedSeries,
            occurrence,
            actorUserId: session.user.id,
            reason: "series-created",
          }));
        }
        const firstTaskId = materialized[0]?.actionItemId;
        const firstTask = firstTaskId ? await tx.actionItem.findUnique({ where: { id: firstTaskId }, select: { id: true, updatedAt: true } }) : null;
        return { firstTask, occurrenceCount: materialized.length };
      });
      if (!saved.firstTask) throw new Error("Recurring task series did not produce its first canonical task.");
      revalidatePath("/work");
      revalidatePath("/schedule");
      revalidatePath("/today");
      return { ok: true, taskId: saved.firstTask.id, updatedAt: saved.firstTask.updatedAt.toISOString(), receiptId, recurrenceSeriesId: seriesId, occurrenceCount: saved.occurrenceCount };
    }
    const task = await prisma.actionItem.create({
      data: {
        assignedUserId: session.user.id,
        projectId: project.projectId,
        title,
        detail: detail || null,
        dueAt,
        sourceJson: {
          source: "quipsly-work-manual-v1",
          createdByUserId: session.user.id,
          createdAt: now.toISOString(),
          dueIntent: parsedLocal ? {
            requestedLocalDateTime: parsedLocal.requestedLocalDateTime,
            resolvedLocalDateTime: parsedLocal.resolvedLocalDateTime,
            dstResolution: parsedLocal.dstResolution,
            timezone: parsedLocal.timezone,
          } : null,
          creationReceipt: {
            id: receiptId,
            kind: "quipsly-work-item-create-v1",
            assignedToCreator: true,
            externalSideEffects: false,
          },
        },
      },
      select: { id: true, updatedAt: true },
    });
    revalidatePath("/work");
    revalidatePath("/schedule");
    revalidatePath("/today");
    return { ok: true, taskId: task.id, updatedAt: task.updatedAt.toISOString(), receiptId };
  } catch (error) {
    console.error("[work] failed to create private task", error);
    return { ok: false, code: "UNAVAILABLE", error: "Quipsly could not create this task. Nothing was sent or scheduled elsewhere." };
  }
}

export async function editWorkTask(input: {
  taskId: string;
  title: string;
  detail?: string | null;
  dueLocal: string | null;
  timezone: string;
  expectedUpdatedAt: string;
}): Promise<EditWorkTaskResult> {
  const session = await getQuipslySession();
  if (!session?.user?.id) {
    return { ok: false, code: "AUTH_REQUIRED", error: "Sign in before editing private work." };
  }

  const taskId = cleanId(input?.taskId);
  const title = cleanText(input?.title, 500);
  const detail = cleanText(input?.detail, 5000) || null;
  const expectedUpdatedAt = expectedRevision(input?.expectedUpdatedAt);
  const timezone = cleanId(input?.timezone, 100);
  const hasDueDecision = Boolean(input)
    && Object.prototype.hasOwnProperty.call(input, "dueLocal");
  const dueLocal = cleanId(input?.dueLocal, 32);
  const parsedDue = dueLocal ? parseRecurrenceStart(dueLocal, timezone) : null;
  const dueAt = parsedDue?.dueAt ?? null;
  const now = new Date();

  if (!taskId
      || !title
      || !expectedUpdatedAt
      || !hasDueDecision
      || !isIanaTimeZone(timezone)
      || (dueLocal && !parsedDue)) {
    return { ok: false, code: "INVALID_INPUT", error: "Add a task title and, if used, a valid local due date." };
  }
  if (dueAt && Math.abs(dueAt.getTime() - now.getTime()) > 10 * 365 * 86_400_000) {
    return { ok: false, code: "INVALID_INPUT", error: "Choose a due date within ten years." };
  }

  try {
    const prisma = getPrismaClient() as any;
    const result = await prisma.$transaction(
      (tx: any) => editCanonicalTaskInTransaction({
        tx,
        taskId,
        actorUserId: session.user.id,
        expectedUpdatedAt,
        title,
        detail,
        dueAt,
        dueIntent: parsedDue ? {
          requestedLocalDateTime: parsedDue.requestedLocalDateTime,
          resolvedLocalDateTime: parsedDue.resolvedLocalDateTime,
          dstResolution: parsedDue.dstResolution,
          timezone: parsedDue.timezone,
        } : null,
        surface: "nest-work",
        now,
      }),
      { isolationLevel: "Serializable" },
    );

    if (result.kind === "not-found") {
      return { ok: false, code: "NOT_FOUND", error: "Only the assigned task owner can edit this task." };
    }
    if (result.kind === "closed") {
      return { ok: false, code: "INVALID_INPUT", error: "Reopen this task before editing its contents or due date." };
    }
    if (result.kind === "recurring") {
      return { ok: false, code: "INVALID_INPUT", error: "Use the repeating-task editor so Quipsly can preserve the series history." };
    }
    if (result.kind === "immutable-history") {
      return { ok: false, code: "INVALID_INPUT", error: "A superseded historical task cannot be rewritten. Use its replacement task instead." };
    }
    if (result.kind === "conflict") {
      return { ok: false, code: "CONFLICT", error: "This task changed elsewhere. Refresh before editing again." };
    }

    revalidatePath("/work");
    revalidatePath("/schedule");
    revalidatePath("/today");
    if (result.record.roomId) revalidatePath(`/sessions/${result.record.roomId}`);
    return {
      ok: true,
      taskId,
      title: result.record.title,
      detail: result.record.detail,
      dueAt: result.record.dueAt?.toISOString() ?? null,
      updatedAt: result.record.updatedAt.toISOString(),
      receiptId: result.receiptId,
    };
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";
    if (code === "P2034") {
      return { ok: false, code: "CONFLICT", error: "This task changed elsewhere. Refresh before editing again." };
    }
    console.error("[work] failed to edit private task", error);
    return { ok: false, code: "UNAVAILABLE", error: "Quipsly could not save this task edit. No reminder, calendar event, message, or provider action changed." };
  }
}

export async function setWorkTaskReminder(input: {
  taskId: string;
  remindAtLocal: string | null;
  timezone: string;
  expectedTaskUpdatedAt: string;
  expectedReminderUpdatedAt?: string | null;
  clientRequestId: string;
}): Promise<SetWorkTaskReminderResult> {
  const session = await getQuipslySession();
  if (!session?.user?.id) {
    return { ok: false, code: "AUTH_REQUIRED", error: "Sign in before changing a private reminder." };
  }

  const taskId = cleanId(input?.taskId);
  const expectedTaskUpdatedAt = expectedRevision(input?.expectedTaskUpdatedAt);
  const expectedReminderText = cleanId(input?.expectedReminderUpdatedAt, 80);
  const expectedReminderUpdatedAt = expectedReminderText
    ? expectedRevision(expectedReminderText)
    : null;
  const clientRequestId = cleanId(input?.clientRequestId, 80).toLowerCase();
  const timezone = cleanId(input?.timezone, 100);
  const hasReminderDecision = Boolean(input)
    && Object.prototype.hasOwnProperty.call(input, "remindAtLocal");
  const remindAtLocal = cleanId(input?.remindAtLocal, 32);
  const parsedReminder = remindAtLocal
    ? parseRecurrenceStart(remindAtLocal, timezone)
    : null;
  const remindAt = parsedReminder?.dueAt ?? null;
  const now = new Date();

  if (!taskId
      || !expectedTaskUpdatedAt
      || (expectedReminderText && !expectedReminderUpdatedAt)
      || !UUID_PATTERN.test(clientRequestId)
      || !hasReminderDecision
      || !isIanaTimeZone(timezone)
      || (remindAtLocal && !parsedReminder)) {
    return { ok: false, code: "INVALID_INPUT", error: "The reminder decision is incomplete or invalid." };
  }
  if (remindAt
      && (remindAt.getTime() <= now.getTime()
        || remindAt.getTime() - now.getTime() > 10 * 365 * 86_400_000)) {
    return { ok: false, code: "INVALID_INPUT", error: "Choose a future reminder within ten years." };
  }

  const reminderId = `task-reminder-${randomUUID()}`;
  const revisionId = `task-reminder-revision-${clientRequestId}`;
  try {
    const prisma = getPrismaClient() as any;
    const result = await prisma.$transaction(
      (tx: any) => setTaskReminderInTransaction({
        tx,
        taskId,
        actorUserId: session.user.id,
        remindAt,
        expectedTaskUpdatedAt,
        expectedReminderUpdatedAt,
        clientRequestId,
        reminderId,
        revisionId,
        now,
        surface: "nest-work",
        timezone,
        requestedLocalDateTime: parsedReminder?.requestedLocalDateTime ?? null,
      }),
      { isolationLevel: "Serializable" },
    );

    if (result.kind === "not-found") {
      return { ok: false, code: "NOT_FOUND", error: "Only the assigned task owner can change this reminder." };
    }
    if (result.kind === "recurring") {
      return { ok: false, code: "INVALID_INPUT", error: "Repeating work keeps its schedule separate. Add reminders to individual one-time tasks." };
    }
    if (result.kind === "closed") {
      return { ok: false, code: "INVALID_INPUT", error: "Reopen this task before changing its reminder." };
    }
    if (result.kind === "conflict" || result.kind === "identity-conflict") {
      return { ok: false, code: "CONFLICT", error: "This reminder changed elsewhere. Refresh before saving again." };
    }

    revalidatePath("/work");
    revalidatePath("/today");
    revalidatePath("/schedule");
    return {
      ok: true,
      taskId,
      reminderId: result.reminder.id,
      remindAt: result.reminder.status === "ACTIVE"
        ? result.reminder.remindAt.toISOString()
        : null,
      status: result.reminder.status,
      updatedAt: result.reminder.updatedAt.toISOString(),
      operation: result.kind === "unchanged" ? "UNCHANGED" : result.operation,
      revisionId: result.kind === "unchanged" ? null : result.revisionId,
      idempotentReplay: result.kind === "saved" && result.idempotentReplay,
      deviceNotificationsReconciled: false,
      delivered: false,
    };
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";
    if (code === "P2002" || code === "P2034") {
      return { ok: false, code: "CONFLICT", error: "This reminder changed elsewhere. Refresh before saving again." };
    }
    console.error("[work] failed to save task reminder", error);
    return { ok: false, code: "UNAVAILABLE", error: "Quipsly could not save this reminder. No device alert or external calendar event was changed." };
  }
}

export async function updateTaskRecurrenceStatus(input: {
  seriesId: string;
  nextStatus: "ACTIVE" | "PAUSED" | "ENDED";
  expectedUpdatedAt: string;
}): Promise<UpdateTaskRecurrenceStatusResult> {
  const session = await getQuipslySession();
  if (!session?.user?.id) return { ok: false, code: "AUTH_REQUIRED", error: "Sign in before changing a private repeat." };
  const seriesId = cleanId(input?.seriesId);
  const expected = expectedRevision(input?.expectedUpdatedAt);
  if (!seriesId || !expected || !["ACTIVE", "PAUSED", "ENDED"].includes(input?.nextStatus)) {
    return { ok: false, code: "INVALID_INPUT", error: "The repeat decision is incomplete or invalid." };
  }
  const receiptId = randomUUID();
  const now = new Date();
  try {
    const prisma = getPrismaClient() as any;
    const result = await prisma.$transaction((tx: any) => updateTaskRecurrenceStatusInTransaction({
      tx,
      seriesId,
      actorUserId: session.user.id,
      expectedUpdatedAt: expected,
      nextStatus: input.nextStatus,
      surface: "nest-work",
      now,
      receiptId,
    }));
    if (result.kind === "not-found") return { ok: false, code: "NOT_FOUND", error: "Only the repeat owner can change this series." };
    if (result.kind === "ended") return { ok: false, code: "INVALID_INPUT", error: "An ended repeat stays ended. Create a new series if the work should begin again." };
    if (result.kind === "conflict" || !result.persisted) return { ok: false, code: "CONFLICT", error: "This repeat changed elsewhere. Refresh before deciding again." };
    revalidatePath("/work");
    revalidatePath("/schedule");
    revalidatePath("/today");
    return { ok: true, seriesId, status: input.nextStatus, updatedAt: result.persisted.updatedAt.toISOString(), receiptId, materializedCount: result.materializedCount };
  } catch (error) {
    console.error("[work] failed to update task recurrence", error);
    return { ok: false, code: "UNAVAILABLE", error: "Quipsly could not change this repeat. No notification or external calendar action occurred." };
  }
}

export async function editTaskRecurrence(input: {
  taskId: string;
  seriesId: string;
  scope: "THIS_OCCURRENCE" | "THIS_AND_FUTURE";
  title: string;
  detail?: string;
  expectedTaskUpdatedAt: string;
  expectedSeriesUpdatedAt: string;
  clientRequestId: string;
  dueLocal?: string | null;
  timezone?: string | null;
  recurrence?: {
    cadence: TaskRecurrenceCadence;
    frequency: TaskRecurrenceFrequency;
    interval?: number;
  } | null;
}): Promise<EditTaskRecurrenceResult> {
  const session = await getQuipslySession();
  if (!session?.user?.id) return { ok: false, code: "AUTH_REQUIRED", error: "Sign in before editing private recurring work." };
  const taskId = cleanId(input?.taskId);
  const seriesId = cleanId(input?.seriesId);
  const scope = input?.scope;
  const title = cleanText(input?.title, 500);
  const detail = cleanText(input?.detail, 5_000) || null;
  const expectedTaskUpdatedAt = expectedRevision(input?.expectedTaskUpdatedAt);
  const expectedSeriesUpdatedAt = expectedRevision(input?.expectedSeriesUpdatedAt);
  const clientRequestId = cleanId(input?.clientRequestId, 80).toLowerCase();
  if (!taskId || !seriesId || !title || !expectedTaskUpdatedAt || !expectedSeriesUpdatedAt
      || !UUID_PATTERN.test(clientRequestId) || !["THIS_OCCURRENCE", "THIS_AND_FUTURE"].includes(scope)) {
    return { ok: false, code: "INVALID_INPUT", error: "Choose a safe edit scope and provide the current task and repeat revisions." };
  }
  const now = new Date();
  try {
    const prisma = getPrismaClient() as any;
    if (scope === "THIS_OCCURRENCE") {
      const result = await prisma.$transaction((tx: any) => editTaskRecurrenceOccurrenceInTransaction({
        tx,
        taskId,
        actorUserId: session.user.id,
        expectedTaskUpdatedAt,
        clientRequestId,
        title,
        detail,
        surface: "nest-work",
        now,
        receiptId: `work-task-occurrence-edit-${clientRequestId}`,
      }));
      if (result.kind === "not-found") return { ok: false, code: "NOT_FOUND", error: "Only the assigned owner can edit this recurring task." };
      if (result.kind === "closed") return { ok: false, code: "INVALID_INPUT", error: "Completed or skipped task history cannot be rewritten." };
      if (result.kind === "identity-conflict") return { ok: false, code: "CONFLICT", error: "This edit request already belongs to different wording." };
      if (result.kind === "conflict" || !result.persisted) return { ok: false, code: "CONFLICT", error: "This task changed elsewhere. Refresh Work before editing it." };
      revalidatePath("/work");
      revalidatePath("/today");
      return {
        ok: true,
        scope,
        taskId,
        receiptId: result.receiptId,
        updatedAt: result.persisted.updatedAt.toISOString(),
        reused: result.reused,
      };
    }

    const dueLocal = cleanId(input?.dueLocal, 40);
    const timezone = cleanId(input?.timezone, 100);
    const parsedLocal = dueLocal ? parseRecurrenceStart(dueLocal, timezone) : null;
    const recurrence = input?.recurrence;
    const interval = Number(recurrence?.interval ?? 1);
    if (!parsedLocal || !recurrence || !["FIXED", "COMPLETION"].includes(recurrence.cadence)
        || !["DAILY", "WEEKLY", "MONTHLY"].includes(recurrence.frequency)
        || !Number.isInteger(interval) || interval < 1 || interval > 365) {
      return { ok: false, code: "INVALID_INPUT", error: "Review the first future local due time, IANA timezone, cadence, frequency, and interval." };
    }
    const nextSeriesId = `work-task-series-revision-${clientRequestId}`;
    const result = await prisma.$transaction((tx: any) => replaceTaskRecurrenceFromOccurrenceInTransaction({
      tx,
      priorSeriesId: seriesId,
      anchorTaskId: taskId,
      actorUserId: session.user.id,
      expectedSeriesUpdatedAt,
      expectedTaskUpdatedAt,
      nextSeriesId,
      clientRequestId,
      title,
      detail,
      nextRule: {
        cadence: recurrence.cadence,
        frequency: recurrence.frequency,
        interval,
        timezone: parsedLocal.timezone,
        localTimeMinutes: parsedLocal.localTimeMinutes,
        anchorLocalDate: parsedLocal.anchorLocalDate,
        anchorDayOfMonth: parsedLocal.anchorDayOfMonth,
      },
      surface: "nest-work",
      now,
      receiptId: `work-task-recurrence-revision-${clientRequestId}`,
    }));
    if (result.kind === "not-found") return { ok: false, code: "NOT_FOUND", error: "Only the repeat owner can replace its next open horizon." };
    if (result.kind === "ended") return { ok: false, code: "INVALID_INPUT", error: "This repeat already ended. Refresh Work before editing." };
    if (result.kind === "not-next-open") return { ok: false, code: "INVALID_INPUT", error: "Edit this repeat from its next open occurrence so no earlier commitment is skipped." };
    if (result.kind === "identity-conflict") return { ok: false, code: "CONFLICT", error: "This edit request already belongs to a different series revision." };
    if (result.kind === "conflict") return { ok: false, code: "CONFLICT", error: "This repeat changed elsewhere. Refresh Work before editing it." };
    revalidatePath("/work");
    revalidatePath("/schedule");
    revalidatePath("/today");
    return {
      ok: true,
      scope,
      taskId,
      receiptId: result.receiptId,
      priorSeriesId: result.priorSeriesId,
      nextSeriesId: result.nextSeriesId,
      firstTaskId: result.firstTaskId,
      supersededTaskCount: result.supersededTaskCount,
      materializedCount: result.materializedCount,
      reused: result.reused,
    };
  } catch (error) {
    console.error("[work] failed to edit recurring task", error);
    return { ok: false, code: "UNAVAILABLE", error: "Quipsly could not edit this repeat. Historical work stayed preserved and no external action occurred." };
  }
}

export async function replaceWorkTags(input: {
  entityKind: WorkTagEntityKind;
  entityId: string;
  tagIds: string[];
  expectedUpdatedAt: string;
}): Promise<ReplaceWorkTagsActionResult> {
  const session = await getQuipslySession();
  const actorEmail = cleanText(session?.user?.primaryEmail || session?.user?.email, 320).toLowerCase();
  if (!session?.user?.id || !actorEmail) return { ok: false, code: "AUTH_REQUIRED", error: "Sign in before changing private tags." };
  const expectedUpdatedAt = expectedRevision(input?.expectedUpdatedAt);
  if (!expectedUpdatedAt || !["task", "goal", "session"].includes(input?.entityKind) || !Array.isArray(input?.tagIds)) {
    return { ok: false, code: "INVALID_INPUT", error: "The tag decision is incomplete or invalid." };
  }
  try {
    const result = await replaceWorkEntityTags({
      prisma: getPrismaClient(),
      actorUserId: session.user.id,
      actorEmail,
      entityKind: input.entityKind,
      entityId: input.entityId,
      tagIds: input.tagIds,
      expectedUpdatedAt,
    });
    if (!result.ok) return result;
    revalidatePath("/work");
    if (input.entityKind === "session") revalidatePath(`/sessions/${encodeURIComponent(result.entityId)}`);
    return { ...result, updatedAt: result.updatedAt.toISOString() };
  } catch (error) {
    console.error("[work] failed to replace private tags", error);
    return { ok: false, code: "UNAVAILABLE", error: "Quipsly could not save these tags. No external action was taken." };
  }
}

export async function createAndAssignWorkTag(input: {
  entityKind: WorkTagEntityKind;
  entityId: string;
  label: string;
  expectedUpdatedAt: string;
}): Promise<CreateAndAssignWorkTagActionResult> {
  const session = await getQuipslySession();
  const actorEmail = cleanText(session?.user?.primaryEmail || session?.user?.email, 320).toLowerCase();
  if (!session?.user?.id || !actorEmail) return { ok: false, code: "AUTH_REQUIRED", error: "Sign in before creating private tags." };
  const expectedUpdatedAt = expectedRevision(input?.expectedUpdatedAt);
  if (!expectedUpdatedAt || !["task", "goal", "session"].includes(input?.entityKind)) {
    return { ok: false, code: "INVALID_INPUT", error: "The tag request is incomplete or invalid." };
  }
  try {
    const result = await createAndAssignWorkEntityTag({
      prisma: getPrismaClient(),
      actorUserId: session.user.id,
      actorEmail,
      entityKind: input.entityKind,
      entityId: input.entityId,
      label: input.label,
      expectedUpdatedAt,
    });
    if (!result.ok) return result;
    revalidatePath("/work");
    revalidatePath("/today");
    revalidatePath("/find");
    if (input.entityKind === "session") revalidatePath(`/sessions/${encodeURIComponent(result.entityId)}`);
    return { ...result, updatedAt: result.updatedAt.toISOString() };
  } catch (error) {
    console.error("[work] failed to create and assign private tag", error);
    return { ok: false, code: "UNAVAILABLE", error: "Quipsly could not create this tag. No existing vocabulary or record was changed." };
  }
}

export async function createWorkVocabularyTag(input: {
  projectId: string;
  label: string;
}): Promise<CreateWorkTagTaxonomyActionResult> {
  const session = await getQuipslySession();
  const actorEmail = cleanText(session?.user?.primaryEmail || session?.user?.email, 320).toLowerCase();
  if (!session?.user?.id || !actorEmail) return { ok: false, code: "AUTH_REQUIRED", error: "Sign in before creating private vocabulary." };
  const projectId = cleanId(input?.projectId);
  const label = normalizedText(input?.label);
  if (!projectId || !label || label.length > 80) {
    return { ok: false, code: "INVALID_INPUT", error: "Enter a reusable tag name of 80 characters or fewer." };
  }
  try {
    const result = await createWorkTagTaxonomy({
      prisma: getPrismaClient(),
      actorUserId: session.user.id,
      actorEmail,
      projectId,
      label,
    });
    if (!result.ok) return result;
    revalidatePath("/work");
    revalidatePath("/today");
    revalidatePath("/find");
    revalidatePath("/research");
    revalidatePath("/media");
    return {
      ...result,
      tag: {
        ...result.tag,
        archivedAt: result.tag.archivedAt?.toISOString() ?? null,
        updatedAt: result.tag.updatedAt.toISOString(),
      },
    };
  } catch (error) {
    console.error("[work] failed to create Nest vocabulary", error);
    return { ok: false, code: "UNAVAILABLE", error: "Quipsly could not create this reusable tag. Existing vocabulary and records stayed unchanged." };
  }
}

export async function changeWorkTagTaxonomy(input: {
  tagId: string;
  operation: WorkTagTaxonomyOperation;
  label?: string;
  expectedUpdatedAt: string;
}): Promise<MutateWorkTagTaxonomyActionResult> {
  const session = await getQuipslySession();
  const actorEmail = cleanText(session?.user?.primaryEmail || session?.user?.email, 320).toLowerCase();
  if (!session?.user?.id || !actorEmail) return { ok: false, code: "AUTH_REQUIRED", error: "Sign in before managing private vocabulary." };
  const expectedUpdatedAt = expectedRevision(input?.expectedUpdatedAt);
  if (!expectedUpdatedAt || !["RENAME", "ARCHIVE", "RESTORE"].includes(input?.operation)) {
    return { ok: false, code: "INVALID_INPUT", error: "The vocabulary change is incomplete or invalid." };
  }
  try {
    const result = await mutateWorkTagTaxonomy({
      prisma: getPrismaClient(),
      actorUserId: session.user.id,
      actorEmail,
      tagId: input.tagId,
      operation: input.operation,
      label: input.label,
      expectedUpdatedAt,
    });
    if (!result.ok) return result;
    revalidatePath("/work");
    revalidatePath("/today");
    revalidatePath("/find");
    revalidatePath("/research");
    return {
      ...result,
      tag: {
        ...result.tag,
        archivedAt: result.tag.archivedAt?.toISOString() ?? null,
        updatedAt: result.tag.updatedAt.toISOString(),
      },
    };
  } catch (error) {
    console.error("[work] failed to change Nest vocabulary", error);
    return { ok: false, code: "UNAVAILABLE", error: "Quipsly could not change this vocabulary. Existing tags and records stayed preserved." };
  }
}

export async function reviewImportedWorkTag(input: {
  candidateId: string;
  operation: WorkTagCandidateOperation;
  expectedUpdatedAt: string;
}): Promise<MutateWorkTagCandidateActionResult> {
  const session = await getQuipslySession();
  const actorEmail = cleanText(session?.user?.primaryEmail || session?.user?.email, 320).toLowerCase();
  if (!session?.user?.id || !actorEmail) return { ok: false, code: "AUTH_REQUIRED", error: "Sign in before reviewing imported keywords." };
  const expectedUpdatedAt = expectedRevision(input?.expectedUpdatedAt);
  if (!expectedUpdatedAt || !["PROMOTE", "REJECT", "REOPEN"].includes(input?.operation)) {
    return { ok: false, code: "INVALID_INPUT", error: "The imported-keyword decision is incomplete or invalid." };
  }
  try {
    const result = await mutateWorkTagCandidate({
      prisma: getPrismaClient(),
      actorUserId: session.user.id,
      actorEmail,
      candidateId: input.candidateId,
      operation: input.operation,
      expectedUpdatedAt,
    });
    if (!result.ok) return result;
    revalidatePath("/work");
    revalidatePath("/today");
    revalidatePath("/find");
    revalidatePath("/research");
    revalidatePath("/create");
    return {
      ...result,
      candidate: {
        ...result.candidate,
        reviewedAt: result.candidate.reviewedAt?.toISOString() ?? null,
        updatedAt: result.candidate.updatedAt.toISOString(),
      },
    };
  } catch (error) {
    console.error("[work] failed to review imported keyword", error);
    return { ok: false, code: "UNAVAILABLE", error: "Quipsly could not save this review. Canonical vocabulary and imported evidence stayed unchanged." };
  }
}

function serializedMergePreview(preview: WorkTagMergePreview): SerializedWorkTagMergePreview {
  return {
    ...preview,
    source: { ...preview.source, updatedAt: preview.source.updatedAt.toISOString() },
    target: { ...preview.target, updatedAt: preview.target.updatedAt.toISOString() },
  };
}

function serializedMergeRollbackPreview(preview: WorkTagMergeRollbackPreview): SerializedWorkTagMergeRollbackPreview {
  return {
    ...preview,
    source: { ...preview.source, updatedAt: preview.source.updatedAt.toISOString() },
    target: { ...preview.target, updatedAt: preview.target.updatedAt.toISOString() },
  };
}

export async function previewTagMerge(input: {
  sourceTagId: string;
  targetTagId: string;
}): Promise<PreviewWorkTagMergeActionResult> {
  const session = await getQuipslySession();
  const actorEmail = cleanText(session?.user?.primaryEmail || session?.user?.email, 320).toLowerCase();
  if (!session?.user?.id || !actorEmail) return { ok: false, code: "AUTH_REQUIRED", error: "Sign in before previewing private vocabulary." };
  try {
    const result = await previewWorkTagMerge({
      prisma: getPrismaClient(),
      actorEmail,
      sourceTagId: input?.sourceTagId,
      targetTagId: input?.targetTagId,
    });
    return result.ok ? { ok: true, preview: serializedMergePreview(result.preview) } : result;
  } catch (error) {
    console.error("[work] failed to preview tag merge", error);
    return { ok: false, code: "UNAVAILABLE", error: "Quipsly could not verify this merge impact. Nothing changed." };
  }
}

export async function applyTagMerge(input: {
  sourceTagId: string;
  targetTagId: string;
  expectedImpactHash: string;
  expectedSourceUpdatedAt: string;
  expectedTargetUpdatedAt: string;
}): Promise<ApplyWorkTagMergeActionResult> {
  const session = await getQuipslySession();
  const actorEmail = cleanText(session?.user?.primaryEmail || session?.user?.email, 320).toLowerCase();
  if (!session?.user?.id || !actorEmail) return { ok: false, code: "AUTH_REQUIRED", error: "Sign in before merging private vocabulary." };
  const expectedSourceUpdatedAt = expectedRevision(input?.expectedSourceUpdatedAt);
  const expectedTargetUpdatedAt = expectedRevision(input?.expectedTargetUpdatedAt);
  if (!expectedSourceUpdatedAt || !expectedTargetUpdatedAt) return { ok: false, code: "INVALID_INPUT", error: "Preview this merge again before applying it." };
  try {
    const result = await applyWorkTagMerge({
      prisma: getPrismaClient(),
      actorUserId: session.user.id,
      actorEmail,
      sourceTagId: input.sourceTagId,
      targetTagId: input.targetTagId,
      expectedImpactHash: input.expectedImpactHash,
      expectedSourceUpdatedAt,
      expectedTargetUpdatedAt,
    });
    if (!result.ok) return { ...result, preview: result.preview ? serializedMergePreview(result.preview) : undefined };
    revalidatePath("/work");
    revalidatePath("/today");
    revalidatePath("/find");
    revalidatePath("/research");
    revalidatePath("/create");
    return {
      ...result,
      sourceTag: {
        ...result.sourceTag,
        mergedAt: result.sourceTag.mergedAt.toISOString(),
        updatedAt: result.sourceTag.updatedAt.toISOString(),
      },
      targetTag: { ...result.targetTag, updatedAt: result.targetTag.updatedAt.toISOString() },
    };
  } catch (error) {
    console.error("[work] failed to apply tag merge", error);
    return { ok: false, code: "UNAVAILABLE", error: "Quipsly could not apply this merge. The transaction rolled back and nothing external changed." };
  }
}

export async function previewTagMergeRollback(input: {
  sourceTagId: string;
}): Promise<PreviewWorkTagMergeRollbackActionResult> {
  const session = await getQuipslySession();
  const actorEmail = cleanText(session?.user?.primaryEmail || session?.user?.email, 320).toLowerCase();
  if (!session?.user?.id || !actorEmail) return { ok: false, code: "AUTH_REQUIRED", error: "Sign in before inspecting a private merge receipt." };
  try {
    const result = await previewWorkTagMergeRollback({
      prisma: getPrismaClient(),
      actorEmail,
      sourceTagId: input?.sourceTagId,
    });
    return result.ok ? { ok: true, preview: serializedMergeRollbackPreview(result.preview) } : result;
  } catch (error) {
    console.error("[work] failed to preview tag merge rollback", error);
    return { ok: false, code: "UNAVAILABLE", error: "Quipsly could not verify this rollback receipt. Nothing changed." };
  }
}

export async function applyTagMergeRollback(input: {
  sourceTagId: string;
  expectedPreviewHash: string;
  expectedSourceUpdatedAt: string;
  expectedTargetUpdatedAt: string;
}): Promise<ApplyWorkTagMergeRollbackActionResult> {
  const session = await getQuipslySession();
  const actorEmail = cleanText(session?.user?.primaryEmail || session?.user?.email, 320).toLowerCase();
  if (!session?.user?.id || !actorEmail) return { ok: false, code: "AUTH_REQUIRED", error: "Sign in before rolling back private vocabulary." };
  const expectedSourceUpdatedAt = expectedRevision(input?.expectedSourceUpdatedAt);
  const expectedTargetUpdatedAt = expectedRevision(input?.expectedTargetUpdatedAt);
  if (!expectedSourceUpdatedAt || !expectedTargetUpdatedAt) return { ok: false, code: "INVALID_INPUT", error: "Preview this rollback again before applying it." };
  try {
    const result = await applyWorkTagMergeRollback({
      prisma: getPrismaClient(),
      actorUserId: session.user.id,
      actorEmail,
      sourceTagId: input.sourceTagId,
      expectedPreviewHash: input.expectedPreviewHash,
      expectedSourceUpdatedAt,
      expectedTargetUpdatedAt,
    });
    if (!result.ok) return { ...result, preview: result.preview ? serializedMergeRollbackPreview(result.preview) : undefined };
    revalidatePath("/work");
    revalidatePath("/today");
    revalidatePath("/find");
    revalidatePath("/research");
    revalidatePath("/create");
    return {
      ...result,
      sourceTag: { ...result.sourceTag, updatedAt: result.sourceTag.updatedAt.toISOString() },
      targetTag: { ...result.targetTag, updatedAt: result.targetTag.updatedAt.toISOString() },
    };
  } catch (error) {
    console.error("[work] failed to apply tag merge rollback", error);
    return { ok: false, code: "UNAVAILABLE", error: "Quipsly could not apply this rollback. The transaction rolled back and nothing external changed." };
  }
}

export async function updateWorkTaskStatus(input: {
  taskId: string;
  nextStatus: WorkTaskStatus;
  expectedUpdatedAt: string;
  decisionReason?: "MISSED_OCCURRENCE_SKIPPED";
}): Promise<UpdateWorkTaskStatusResult> {
  const session = await getQuipslySession();
  if (!session?.user?.id) {
    return { ok: false, code: "AUTH_REQUIRED", error: "Sign in before changing private work." };
  }

  const taskId = cleanId(input?.taskId);
  const expectedUpdatedAt = cleanId(input?.expectedUpdatedAt, 80);
  const expectedDate = new Date(expectedUpdatedAt);
  if (!taskId || !allowedStatus(input?.nextStatus) || !expectedUpdatedAt || !Number.isFinite(expectedDate.getTime())
      || (input?.decisionReason && input.decisionReason !== "MISSED_OCCURRENCE_SKIPPED")) {
    return { ok: false, code: "INVALID_INPUT", error: "The task status request is incomplete or invalid." };
  }

  const prisma = getPrismaClient() as any;
  const userId = session.user.id;
  const accessOr = personalOrSharedSessionTaskAccessWhere(userId);
  try {
    const result = await prisma.$transaction((tx: any) => updateCanonicalTaskStatusInTransaction({
      tx,
      taskId,
      actorUserId: userId,
      accessOr,
      expectedUpdatedAt: expectedDate,
      nextStatus: input.nextStatus,
      decisionReason: input.decisionReason,
      surface: "nest-work",
    }));

    if (result.kind === "not-found") {
      return { ok: false, code: "NOT_FOUND", error: "This committed task is not available in your work queue." };
    }
    if (result.kind === "immutable-history") {
      return { ok: false, code: "INVALID_INPUT", error: "A superseded historical occurrence cannot be reopened. Use its replacement task instead." };
    }
    if (result.kind === "not-missed") {
      return { ok: false, code: "INVALID_INPUT", error: "Only the owner can skip an overdue open recurring occurrence as missed." };
    }
    if (result.kind === "not-next-open") {
      return { ok: false, code: "INVALID_INPUT", error: "Resolve the repeat's oldest open occurrence first so no earlier commitment is hidden." };
    }
    if (result.kind === "conflict") {
      return { ok: false, code: "CONFLICT", error: "This task changed elsewhere. Refresh before deciding again." };
    }

    revalidatePath("/work");
    revalidatePath("/schedule");
    revalidatePath("/today");
    if (result.record.roomId) revalidatePath(`/sessions/${result.record.roomId}`);
    return { ok: true, taskId, status: input.nextStatus, updatedAt: result.record.updatedAt.toISOString(), receiptId: result.receiptId, nextOccurrenceTaskId: result.nextOccurrenceTaskId };
  } catch (error) {
    console.error("[work] failed to update scoped task status", error);
    return { ok: false, code: "UNAVAILABLE", error: "Quipsly could not save this task decision. No external action was taken." };
  }
}
