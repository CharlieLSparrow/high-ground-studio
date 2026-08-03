import { isUnreviewedTranscriptActionItemSource } from "@high-ground/quipsly-domain/coaching-packet";

import type { ClientFollowUpAttention } from "@/lib/server/client-follow-up-attention";

export type TodaySession = {
  id: string;
  title: string | null;
  purpose: string;
  scheduledStart: Date | string;
  scheduledEnd?: Date | string | null;
  scheduledTimezone?: string | null;
  project?: { name: string; slug: string } | null;
};

export type TodayTag = {
  id: string;
  slug: string;
  label: string;
};

export type TodayTask = {
  id: string;
  title: string;
  detail?: string | null;
  dueAt?: Date | string | null;
  reminder?: { remindAt: Date | string; status: string } | null;
  createdAt: Date | string;
  sourceJson?: unknown;
  room?: { id: string; title?: string | null } | null;
  project?: { name: string; slug: string } | null;
  tags?: TodayTag[];
};

export type TodayGoal = {
  id: string;
  title: string;
  targetAt?: Date | string | null;
  updatedAt: Date | string;
  project?: { name: string; slug: string } | null;
  tags?: TodayTag[];
};

export type TodayPlanBlock = {
  id: string;
  startsAt: Date | string;
  endsAt: Date | string;
  timezone: string;
  status: string;
  actionItem?: { id: string; title: string; status: string; tags?: TodayTag[] } | null;
  goal?: { id: string; title: string; status: string; tags?: TodayTag[] } | null;
};

function time(value: Date | string | null | undefined) {
  if (!value) return Number.NaN;
  const date = value instanceof Date ? value : new Date(value);
  return date.getTime();
}

function iso(value: Date | string | null | undefined) {
  const timestamp = time(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function localDay(value: Date | string, timezone: string) {
  const timestamp = time(value);
  if (!Number.isFinite(timestamp)) return null;
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(timestamp));
  } catch {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(timestamp));
  }
}

function sourceRecord(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function isReviewedTranscriptTask(task: TodayTask) {
  const source = sourceRecord(task.sourceJson);
  return source.schema === "quipsly-transcript-derived-task-v1"
    || source.materializationSource === "transcript-action-candidate-acceptance"
    || source.humanAccepted === true;
}

export function buildTodayView(input: {
  now?: Date | string;
  clientFollowUpAttention?: ClientFollowUpAttention | null;
  sessions: TodaySession[];
  tasks: TodayTask[];
  goals: TodayGoal[];
  planBlocks: TodayPlanBlock[];
}) {
  const now = time(input.now ?? new Date());
  const dayAhead = now + 24 * 60 * 60 * 1000;
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

  const nextSession = input.sessions
    .filter((session) => time(session.scheduledStart) >= now - 15 * 60 * 1000)
    .sort((left, right) => time(left.scheduledStart) - time(right.scheduledStart))[0] ?? null;

  const planBlocks = input.planBlocks
    .filter((block) => {
      if (!["PLANNED", "COMPLETED"].includes(block.status)) return false;
      const target = block.actionItem ?? block.goal;
      if (!target || target.status === "CANCELED" || target.status === "ARCHIVED") return false;
      return localDay(block.startsAt, block.timezone) === localDay(new Date(now), block.timezone);
    })
    .sort((left, right) => time(left.startsAt) - time(right.startsAt))
    .slice(0, 4)
    .map((block) => ({
      id: block.id,
      targetType: block.actionItem ? "task" as const : "goal" as const,
      targetId: (block.actionItem ?? block.goal)!.id,
      title: (block.actionItem ?? block.goal)!.title,
      startsAt: iso(block.startsAt)!,
      endsAt: iso(block.endsAt)!,
      timezone: block.timezone,
      status: block.status,
      tags: (block.actionItem ?? block.goal)!.tags ?? [],
    }));

  const plannedTaskIds = new Set(planBlocks.filter((block) => block.targetType === "task").map((block) => block.targetId));
  const tasks = input.tasks
    .filter((task) => !isUnreviewedTranscriptActionItemSource(task.sourceJson))
    .filter((task) => !plannedTaskIds.has(task.id))
    .map((task) => {
      const dueAt = time(task.dueAt);
      const reminderAt = task.reminder?.status === "ACTIVE"
        ? time(task.reminder.remindAt)
        : Number.NaN;
      const createdAt = time(task.createdAt);
      const reason = Number.isFinite(dueAt) && dueAt < now
        ? "Overdue commitment" as const
        : Number.isFinite(dueAt) && dueAt <= dayAhead
          ? "Due within 24 hours" as const
          : Number.isFinite(reminderAt) && reminderAt <= now
            ? "Reminder time reached" as const
            : Number.isFinite(reminderAt) && reminderAt <= dayAhead
              ? "Reminder within 24 hours" as const
          : isReviewedTranscriptTask(task) && createdAt >= weekAgo
            ? "Reviewed transcript follow-through" as const
            : null;
      const rank = reason === "Overdue commitment"
        ? 0
        : reason === "Due within 24 hours" || reason === "Reminder time reached"
          ? 1
          : reason === "Reminder within 24 hours"
            ? 2
            : reason === "Reviewed transcript follow-through"
              ? 3
              : 4;
      return {
        id: task.id,
        title: task.title,
        detail: task.detail ?? null,
        dueAt: iso(task.dueAt),
        reminderAt: Number.isFinite(reminderAt) ? new Date(reminderAt).toISOString() : null,
        roomId: task.room?.id ?? null,
        sessionTitle: task.room?.title ?? null,
        project: task.project ?? null,
        tags: task.tags ?? [],
        reason,
        rank,
        createdAt: Number.isFinite(createdAt) ? createdAt : 0,
      };
    })
    .filter((task) => task.reason !== null)
    .sort((left, right) => left.rank - right.rank || (time(left.dueAt) || Number.POSITIVE_INFINITY) - (time(right.dueAt) || Number.POSITIVE_INFINITY) || right.createdAt - left.createdAt)
    .slice(0, 3)
    .map(({ rank: _rank, createdAt: _createdAt, ...task }) => task);

  const goals = [...input.goals]
    .sort((left, right) => {
      const leftTarget = time(left.targetAt);
      const rightTarget = time(right.targetAt);
      if (Number.isFinite(leftTarget) || Number.isFinite(rightTarget)) {
        return (Number.isFinite(leftTarget) ? leftTarget : Number.POSITIVE_INFINITY)
          - (Number.isFinite(rightTarget) ? rightTarget : Number.POSITIVE_INFINITY);
      }
      return time(right.updatedAt) - time(left.updatedAt);
    })
    .slice(0, 2)
    .map((goal) => ({ ...goal, targetAt: iso(goal.targetAt), updatedAt: iso(goal.updatedAt)! }));

  return {
    clientFollowUpAttention: input.clientFollowUpAttention ?? null,
    nextSession: nextSession ? {
      ...nextSession,
      title: nextSession.title?.trim() || "Capture session",
      scheduledStart: iso(nextSession.scheduledStart)!,
      scheduledEnd: iso(nextSession.scheduledEnd),
    } : null,
    planBlocks,
    tasks,
    goals,
    boundaries: {
      deliberatePlanLimit: 4,
      attentionTaskLimit: 3,
      activeGoalLimit: 2,
      proposedTranscriptWorkExcluded: true,
      externalSideEffects: false,
    },
  };
}
