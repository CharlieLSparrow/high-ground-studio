import { isUnreviewedTranscriptActionItemSource } from "@high-ground/quipsly-domain/coaching-packet";
import { readTranscriptDerivedGoalSource, readTranscriptDerivedTaskSource, type TranscriptDerivedGoalSourceAnchor, type TranscriptDerivedTaskSourceAnchor } from "@high-ground/quipsly-domain/transcript-derived-task";

export const SESSION_CONTEXT_SOURCE = "quipsly-capture-session-context-v2";

export type WorkTaskStatus = "OPEN" | "DONE" | "CANCELED";
export type WorkGoalStatus = "ACTIVE" | "PAUSED" | "ACHIEVED" | "ARCHIVED";

export type WorkProject = { id: string; name: string; slug: string };
export type WorkTag = {
  id: string;
  label: string;
  slug: string;
  category: string;
  projectId: string;
  isActive?: boolean;
  archivedAt?: string | null;
  updatedAt?: string;
  aliases?: Array<{ id: string; label: string; slug: string }>;
  mergedInto?: { id: string; label: string } | null;
};
export type WorkTagCandidate = {
  id: string;
  label: string;
  slug: string;
  status: "PENDING" | "PROMOTED" | "REJECTED";
  promotedTag: { id: string; label: string; slug: string } | null;
  evidenceCount: number;
  evidence: Array<{ id: string; sourceKind: string; sourceIdentity: string; labelSnapshot: string; importedAt: string }>;
  reviewedAt: string | null;
  updatedAt: string;
};
export type WorkProjectOption = WorkProject & {
  role: string;
  canWrite: boolean;
  tags: WorkTag[];
  tagCandidates?: WorkTagCandidate[];
};

export type RawWorkTask = {
  id: string;
  title: string;
  detail?: string | null;
  status: WorkTaskStatus;
  dueAt?: Date | string | null;
  reminder?: { remindAt: Date | string; status: string } | null;
  completedAt?: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  assignedUserId?: string | null;
  sourceJson?: unknown;
  project?: WorkProject | null;
  tagLinks?: Array<{ tag: WorkTag }>;
  room?: { id: string; title?: string | null; status?: string | null; nestSlug?: string | null; projectSlug?: string | null } | null;
  booking?: {
    id: string;
    scheduledStart?: Date | string | null;
    clientUser?: { name?: string | null; primaryEmail?: string | null } | null;
    coachUser?: { name?: string | null; primaryEmail?: string | null } | null;
    callRoom?: { id: string; title?: string | null } | null;
  } | null;
  assignedUser?: { name?: string | null; primaryEmail?: string | null } | null;
  recurrenceOccurrence?: {
    occurrenceKey: string;
    scheduledLocalDate: string;
    series: {
      id: string;
      cadence: "FIXED" | "COMPLETION";
      frequency: "DAILY" | "WEEKLY" | "MONTHLY";
      interval: number;
      timezone: string;
      localTimeMinutes: number;
      status: "ACTIVE" | "PAUSED" | "ENDED";
      updatedAt: Date | string;
    };
  } | null;
};

export type RawWorkGoal = {
  id: string;
  title?: string | null;
  body: string;
  sourceJson?: unknown;
  createdAt: Date | string;
  updatedAt: Date | string;
  room?: { id: string; title?: string | null } | null;
  booking?: { id: string; scheduledStart?: Date | string | null; callRoom?: { id: string; title?: string | null } | null } | null;
};

export type RawCanonicalGoal = {
  id: string;
  ownerUserId?: string;
  title: string;
  description?: string | null;
  status: WorkGoalStatus;
  targetAt?: Date | string | null;
  achievedAt?: Date | string | null;
  sourceJson?: unknown;
  createdAt: Date | string;
  updatedAt: Date | string;
  room?: { id: string; title?: string | null } | null;
  booking?: { id: string; scheduledStart?: Date | string | null; callRoom?: { id: string; title?: string | null } | null } | null;
  project?: { id: string; name: string; slug: string } | null;
  tagLinks?: Array<{ tag: WorkTag }>;
  parent?: { id: string; title: string } | null;
  progressReceipts?: Array<{ progressPercent?: number | null; note?: string | null; occurredAt: Date | string }>;
  taskLinks?: Array<{ relationship: "CONTRIBUTES" | "BLOCKS" | "OUTCOME"; actionItem: { id: string; title: string; status: WorkTaskStatus } }>;
  _count?: { children: number };
};

export type RawWeeklyCommitment = {
  id: string;
  clientUserId: string;
  weekStartsAt: Date | string;
  commitmentOne: string;
  commitmentTwo?: string | null;
  commitmentThree?: string | null;
  supportNeeded?: string | null;
  progressNotes?: string | null;
  clientReviewedAt?: Date | string | null;
  coachNotes?: string | null;
  status: "ACTIVE" | "REVIEWED" | "ARCHIVED";
  reviewedAt?: Date | string | null;
  updatedAt: Date | string;
  clientUser?: { name?: string | null; primaryEmail?: string | null } | null;
  reviewedByUser?: { name?: string | null; primaryEmail?: string | null } | null;
};

export type WorkTask = {
  id: string;
  title: string;
  detail: string | null;
  status: WorkTaskStatus;
  dueAt: string | null;
  reminderAt?: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  isOverdue: boolean;
  historicalLocked?: boolean;
  attentionReason: "Overdue commitment" | "Due within 24 hours" | "Reviewed transcript follow-through" | null;
  assigneeLabel: string | null;
  provenance: string;
  roomId: string | null;
  sessionTitle: string | null;
  sessionStatus: string | null;
  workspaceSlug: string | null;
  project: WorkProject | null;
  tags: WorkTag[];
  canManageTags: boolean;
  bookingStart: string | null;
  sourceAnchor: TranscriptDerivedTaskSourceAnchor | null;
  recurrence?: {
    seriesId: string;
    occurrenceKey: string;
    scheduledLocalDate: string;
    cadence: "FIXED" | "COMPLETION";
    frequency: "DAILY" | "WEEKLY" | "MONTHLY";
    interval: number;
    timezone: string;
    localTimeMinutes: number;
    status: "ACTIVE" | "PAUSED" | "ENDED";
    updatedAt: string;
    label: string;
  } | null;
};

export type WorkGoal = {
  id: string;
  title: string;
  description: string | null;
  status: WorkGoalStatus;
  targetAt: string | null;
  achievedAt: string | null;
  progressPercent: number | null;
  progressNote: string | null;
  provenance: "Canonical goal" | "Legacy Session Plan projection";
  updatedAt: string;
  roomId: string | null;
  sessionTitle: string | null;
  sessionStart: string | null;
  project: { id: string; name: string; slug: string } | null;
  tags: WorkTag[];
  canManageTags: boolean;
  parent: { id: string; title: string } | null;
  childCount: number;
  linkedTasks: Array<{ relationship: "CONTRIBUTES" | "BLOCKS" | "OUTCOME"; task: { id: string; title: string; status: WorkTaskStatus } }>;
  sourceAnchor: TranscriptDerivedGoalSourceAnchor | null;
};

export type WorkCommitment = {
  id: string;
  weekStartsAt: string;
  commitments: string[];
  supportNeeded: string | null;
  progressNotes: string | null;
  clientReviewedAt: string | null;
  coachNotes: string | null;
  status: "ACTIVE" | "REVIEWED" | "ARCHIVED";
  updatedAt: string;
  clientLabel: string | null;
  reviewerLabel: string | null;
  isOwnedByActor: boolean;
};

export type WorkSnapshot = {
  tasks: WorkTask[];
  goals: WorkGoal[];
  commitments: WorkCommitment[];
  counts: {
    openTasks: number;
    attentionTasks: number;
    overdueTasks: number;
    completedTasks: number;
    activeGoals: number;
    activeCommitments: number;
  };
  boundaries: {
    taskLimit: number;
    canonicalGoalModel: true;
    legacySessionGoalCompatibility: true;
    externalSideEffects: false;
  };
};

export function safeRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function iso(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function clean(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function personLabel(person: { name?: string | null; primaryEmail?: string | null } | null | undefined) {
  return clean(person?.name) || clean(person?.primaryEmail) || null;
}

export function taskProvenance(sourceValue: unknown) {
  const source = safeRecord(sourceValue);
  if (source.source === "quipsly-task-recurrence-v1") {
    return "Recurring task";
  }
  if (readTranscriptDerivedTaskSource(sourceValue)) {
    return "Reviewed transcript timestamp";
  }
  if (source.source === SESSION_CONTEXT_SOURCE && source.contextKind === "task") {
    return "Session context";
  }
  if (source.humanAccepted === true || source.materializationSource === "transcript-action-candidate-acceptance") {
    return "Accepted transcript proposal";
  }
  return "Manual or legacy task";
}

export function isActiveSessionGoal(goal: Pick<RawWorkGoal, "sourceJson">) {
  const source = safeRecord(goal.sourceJson);
  return source.source === SESSION_CONTEXT_SOURCE
    && source.contextKind === "goal"
    && source.active !== false
    && Boolean(clean(source.contextEntryId));
}

function sessionTitle(item: {
  room?: { id: string; title?: string | null } | null;
  booking?: { callRoom?: { id: string; title?: string | null } | null } | null;
}) {
  return clean(item.room?.title)
    || clean(item.booking?.callRoom?.title)
    || (item.room?.id || item.booking?.callRoom?.id ? "Capture session" : null);
}

export function buildWorkSnapshot(input: {
  tasks: RawWorkTask[];
  goals: RawWorkGoal[];
  canonicalGoals?: RawCanonicalGoal[];
  commitments: RawWeeklyCommitment[];
  now?: Date | string;
  taskLimit?: number;
  actorUserId?: string;
}): WorkSnapshot {
  const now = iso(input.now ?? new Date()) ?? new Date().toISOString();
  const nowMs = new Date(now).getTime();
  const taskLimit = Math.max(1, Math.min(500, input.taskLimit ?? 500));

  const tasks: WorkTask[] = input.tasks
    .filter((task) => !isUnreviewedTranscriptActionItemSource(task.sourceJson))
    .slice(0, taskLimit)
    .map((task) => {
      const dueAt = iso(task.dueAt);
      const createdAt = iso(task.createdAt) || now;
      const room = task.room || task.booking?.callRoom || null;
      const parsedSourceAnchor = readTranscriptDerivedTaskSource(task.sourceJson);
      const sourceAnchor = parsedSourceAnchor?.roomId === room?.id ? parsedSourceAnchor : null;
      const provenance = taskProvenance(task.sourceJson);
      const historicalLocked = Object.keys(safeRecord(safeRecord(task.sourceJson).supersessionReceipt)).length > 0;
      const dueAtMs = dueAt ? new Date(dueAt).getTime() : null;
      const isOverdue = task.status === "OPEN" && dueAtMs !== null && dueAtMs < nowMs;
      const attentionReason = task.status !== "OPEN"
        ? null
        : isOverdue
          ? "Overdue commitment" as const
          : dueAtMs !== null && dueAtMs <= nowMs + 24 * 60 * 60 * 1000
            ? "Due within 24 hours" as const
            : provenance === "Reviewed transcript timestamp" && new Date(createdAt).getTime() >= nowMs - 7 * 24 * 60 * 60 * 1000
              ? "Reviewed transcript follow-through" as const
              : null;
      const recurrenceSeries = task.recurrenceOccurrence?.series;
      const recurrenceUnit = recurrenceSeries?.frequency === "DAILY" ? "day" : recurrenceSeries?.frequency === "WEEKLY" ? "week" : "month";
      const recurrence = recurrenceSeries && task.recurrenceOccurrence ? {
        seriesId: recurrenceSeries.id,
        occurrenceKey: task.recurrenceOccurrence.occurrenceKey,
        scheduledLocalDate: task.recurrenceOccurrence.scheduledLocalDate,
        cadence: recurrenceSeries.cadence,
        frequency: recurrenceSeries.frequency,
        interval: recurrenceSeries.interval,
        timezone: recurrenceSeries.timezone,
        localTimeMinutes: recurrenceSeries.localTimeMinutes,
        status: recurrenceSeries.status,
        updatedAt: iso(recurrenceSeries.updatedAt) || now,
        label: `${recurrenceSeries.interval === 1 ? `Every ${recurrenceUnit}` : `Every ${recurrenceSeries.interval} ${recurrenceUnit}s`} · ${recurrenceSeries.cadence === "FIXED" ? "fixed schedule" : "after completion"} · ${recurrenceSeries.timezone}`,
      } : null;
      return {
        id: task.id,
        title: clean(task.title) || "Untitled task",
        detail: clean(task.detail) || null,
        status: task.status,
        dueAt,
        reminderAt: task.reminder?.status === "ACTIVE" ? iso(task.reminder.remindAt) : null,
        completedAt: iso(task.completedAt),
        createdAt,
        updatedAt: iso(task.updatedAt) || now,
        isOverdue,
        historicalLocked,
        attentionReason,
        assigneeLabel: personLabel(task.assignedUser),
        provenance,
        roomId: room?.id ?? null,
        sessionTitle: sessionTitle(task),
        sessionStatus: task.room?.status ?? null,
        workspaceSlug: clean(task.room?.nestSlug) || clean(task.room?.projectSlug) || null,
        project: task.project ? { id: task.project.id, name: task.project.name, slug: task.project.slug } : null,
        tags: (task.tagLinks ?? []).map((link) => link.tag),
        canManageTags: Boolean(input.actorUserId) && task.assignedUserId === input.actorUserId,
        bookingStart: iso(task.booking?.scheduledStart),
        sourceAnchor,
        recurrence,
      };
    })
    .sort((left, right) => {
      const statusRank = { OPEN: 0, DONE: 1, CANCELED: 2 } as const;
      const statusDelta = statusRank[left.status] - statusRank[right.status];
      if (statusDelta) return statusDelta;
      if (left.isOverdue !== right.isOverdue) return left.isOverdue ? -1 : 1;
      if (left.dueAt && right.dueAt) return left.dueAt.localeCompare(right.dueAt);
      if (left.dueAt) return -1;
      if (right.dueAt) return 1;
      return right.updatedAt.localeCompare(left.updatedAt);
    });

  const canonicalGoals: WorkGoal[] = (input.canonicalGoals ?? [])
    .map((goal) => {
      const room = goal.room || goal.booking?.callRoom || null;
      const progress = goal.progressReceipts?.[0] ?? null;
      const parsedSourceAnchor = readTranscriptDerivedGoalSource(goal.sourceJson);
      const sourceAnchor = parsedSourceAnchor?.roomId === room?.id ? parsedSourceAnchor : null;
      return {
        id: goal.id,
        title: clean(goal.title) || "Untitled goal",
        description: clean(goal.description) || null,
        status: goal.status,
        targetAt: iso(goal.targetAt),
        achievedAt: iso(goal.achievedAt),
        progressPercent: typeof progress?.progressPercent === "number" ? Math.max(0, Math.min(100, progress.progressPercent)) : goal.status === "ACHIEVED" ? 100 : null,
        progressNote: clean(progress?.note) || null,
        provenance: "Canonical goal" as const,
        updatedAt: iso(goal.updatedAt) || now,
        roomId: room?.id ?? null,
        sessionTitle: sessionTitle(goal),
        sessionStart: iso(goal.booking?.scheduledStart),
        project: goal.project ? { id: goal.project.id, name: goal.project.name, slug: goal.project.slug } : null,
        tags: (goal.tagLinks ?? []).map((link) => link.tag),
        canManageTags: Boolean(input.actorUserId) && goal.ownerUserId === input.actorUserId,
        parent: goal.parent ? { id: goal.parent.id, title: goal.parent.title } : null,
        childCount: goal._count?.children ?? 0,
        linkedTasks: (goal.taskLinks ?? []).map((link) => ({ relationship: link.relationship, task: link.actionItem })),
        sourceAnchor,
      };
    });
  const canonicalContextIds = new Set((input.canonicalGoals ?? []).map((goal) => clean(safeRecord(goal.sourceJson).contextEntryId)).filter(Boolean));
  const legacyGoals: WorkGoal[] = input.goals
    .filter(isActiveSessionGoal)
    .filter((goal) => !canonicalContextIds.has(clean(safeRecord(goal.sourceJson).contextEntryId)))
    .map((goal) => {
      const room = goal.room || goal.booking?.callRoom || null;
      return {
        id: goal.id,
        title: clean(goal.body) || clean(goal.title) || "Session goal",
        description: null,
        status: "ACTIVE" as const,
        targetAt: null,
        achievedAt: null,
        progressPercent: null,
        progressNote: null,
        provenance: "Legacy Session Plan projection" as const,
        updatedAt: iso(goal.updatedAt) || now,
        roomId: room?.id ?? null,
        sessionTitle: sessionTitle(goal),
        sessionStart: iso(goal.booking?.scheduledStart),
        project: null,
        tags: [],
        canManageTags: false,
        parent: null,
        childCount: 0,
        linkedTasks: [],
        sourceAnchor: null,
      };
    })
    .filter((goal) => Boolean(goal.title));
  const goals = [...canonicalGoals, ...legacyGoals]
    .sort((left, right) => {
      const rank = { ACTIVE: 0, PAUSED: 1, ACHIEVED: 2, ARCHIVED: 3 } as const;
      return rank[left.status] - rank[right.status] || right.updatedAt.localeCompare(left.updatedAt);
    });

  const commitments: WorkCommitment[] = input.commitments
    .map((commitment) => ({
      id: commitment.id,
      weekStartsAt: iso(commitment.weekStartsAt) || now,
      commitments: [commitment.commitmentOne, commitment.commitmentTwo, commitment.commitmentThree]
        .map(clean)
        .filter(Boolean),
      supportNeeded: clean(commitment.supportNeeded) || null,
      progressNotes: clean(commitment.progressNotes) || null,
      clientReviewedAt: iso(commitment.clientReviewedAt),
      coachNotes: clean(commitment.coachNotes) || null,
      status: commitment.status,
      updatedAt: iso(commitment.updatedAt) || now,
      clientLabel: personLabel(commitment.clientUser),
      reviewerLabel: personLabel(commitment.reviewedByUser),
      isOwnedByActor: Boolean(input.actorUserId) && commitment.clientUserId === input.actorUserId,
    }))
    .filter((commitment) => commitment.commitments.length > 0)
    .sort((left, right) => right.weekStartsAt.localeCompare(left.weekStartsAt));

  return {
    tasks,
    goals,
    commitments,
    counts: {
      openTasks: tasks.filter((task) => task.status === "OPEN").length,
      attentionTasks: tasks.filter((task) => task.attentionReason !== null).length,
      overdueTasks: tasks.filter((task) => task.isOverdue).length,
      completedTasks: tasks.filter((task) => task.status === "DONE").length,
      activeGoals: goals.filter((goal) => goal.status === "ACTIVE").length,
      activeCommitments: commitments.filter((commitment) => commitment.status === "ACTIVE").length,
    },
    boundaries: {
      taskLimit,
      canonicalGoalModel: true,
      legacySessionGoalCompatibility: true,
      externalSideEffects: false,
    },
  };
}
