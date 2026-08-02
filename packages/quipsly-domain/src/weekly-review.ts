export type WeeklyReviewTaskStatus = "OPEN" | "DONE" | "CANCELED";
export type WeeklyReviewGoalStatus = "ACTIVE" | "PAUSED" | "ACHIEVED" | "ARCHIVED";
export type WeeklyReviewHealth = "moving" | "needs-attention" | "no-recent-evidence" | "achieved";

export type WeeklyReviewTaskInput = {
  id: string;
  title: string;
  status: WeeklyReviewTaskStatus;
  dueAt?: string | null;
  completedAt?: string | null;
  roomId?: string | null;
  sessionTitle?: string | null;
};

export type WeeklyReviewGoalInput = {
  id: string;
  title: string;
  status: WeeklyReviewGoalStatus;
  targetAt?: string | null;
  roomId?: string | null;
  sessionTitle?: string | null;
  progressReceipts?: Array<{
    progressPercent?: number | null;
    note?: string | null;
    occurredAt: string;
  }>;
  taskLinks?: Array<{
    taskId: string;
    relationship: "CONTRIBUTES" | "BLOCKS" | "OUTCOME";
  }>;
};

export type WeeklyReviewPlanBlockInput = {
  id: string;
  taskId?: string | null;
  goalId?: string | null;
  startsAt: string;
  endsAt: string;
  status: "PLANNED" | "COMPLETED" | "SKIPPED" | "CANCELED";
  actualMinutes?: number | null;
};

export type WeeklyReviewPlanInput = {
  id: string;
  commitments: string[];
  supportNeeded?: string | null;
  progressNotes?: string | null;
  clientReviewedAt?: string | null;
};

export type WeeklyReviewGoal = {
  id: string;
  title: string;
  status: WeeklyReviewGoalStatus;
  health: WeeklyReviewHealth;
  healthLabel: string;
  progressPercent: number | null;
  latestEvidence: string | null;
  latestEvidenceAt: string | null;
  plannedMinutes: number;
  actualMinutes: number;
  completedBlocksWithoutActualMinutes: number;
  linkedTaskCount: number;
  completedTaskCount: number;
  openTaskCount: number;
  overdueTaskCount: number;
  blockers: string[];
  nextTask: { id: string; title: string; dueAt: string | null } | null;
};

export type WeeklyReview = {
  schema: "quipsly-weekly-review-v1";
  subjectUserId: string;
  subjectLabel: string | null;
  relationship: "self" | "coach-review";
  weekStartsAt: string;
  weekEndsAt: string;
  generatedAt: string;
  reviewState: "not-started" | "draft" | "reviewed";
  plannedMinutes: number;
  actualMinutes: number;
  completedBlocksWithoutActualMinutes: number;
  goals: WeeklyReviewGoal[];
  blockers: string[];
  nextCommitments: Array<{ kind: "weekly-plan" | "task"; id: string; title: string; dueAt: string | null }>;
  sessionContributions: Array<{ roomId: string; title: string; evidenceCount: number }>;
  reflection: string | null;
  boundaries: {
    deterministicProjection: true;
    actualTimeExplicitOnly: true;
    missingActualTimeInferred: false;
    targetStatusMutated: false;
    externalSideEffects: false;
  };
};

function validDate(value: string | null | undefined) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function clean(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function within(timestamp: number | null, start: number, end: number) {
  return timestamp !== null && timestamp >= start && timestamp < end;
}

function plannedMinutes(block: WeeklyReviewPlanBlockInput) {
  const start = validDate(block.startsAt);
  const end = validDate(block.endsAt);
  if (start === null || end === null || end <= start) return 0;
  return Math.min(1_440, Math.round((end - start) / 60_000));
}

function explicitActualMinutes(block: WeeklyReviewPlanBlockInput) {
  return Number.isInteger(block.actualMinutes) && Number(block.actualMinutes) >= 1 && Number(block.actualMinutes) <= 1_440
    ? Number(block.actualMinutes)
    : 0;
}

function nextOpenTask(tasks: WeeklyReviewTaskInput[]) {
  return [...tasks]
    .filter((task) => task.status === "OPEN")
    .sort((left, right) => {
      const leftDue = validDate(left.dueAt) ?? Number.POSITIVE_INFINITY;
      const rightDue = validDate(right.dueAt) ?? Number.POSITIVE_INFINITY;
      return leftDue - rightDue || left.title.localeCompare(right.title) || left.id.localeCompare(right.id);
    })[0] ?? null;
}

export function buildWeeklyReview(input: {
  subjectUserId: string;
  subjectLabel?: string | null;
  relationship: "self" | "coach-review";
  weekStartsAt: string;
  generatedAt: string;
  tasks: WeeklyReviewTaskInput[];
  goals: WeeklyReviewGoalInput[];
  planBlocks: WeeklyReviewPlanBlockInput[];
  weeklyPlan?: WeeklyReviewPlanInput | null;
}): WeeklyReview {
  const generatedAt = new Date(input.generatedAt).toISOString();
  const weekIdentity = validDate(input.weekStartsAt);
  if (weekIdentity === null) throw new Error("Weekly review requires a valid week start.");
  // WeeklyCommitment stores a noon-UTC identity so a local calendar date is
  // stable through serialization. That noon marker is not the evidence window:
  // use its calendar date from midnight so Monday morning cannot disappear.
  const weekIdentityDate = new Date(weekIdentity);
  const weekStart = Date.UTC(
    weekIdentityDate.getUTCFullYear(),
    weekIdentityDate.getUTCMonth(),
    weekIdentityDate.getUTCDate(),
  );
  const weekEnd = weekStart + 7 * 86_400_000;
  const taskById = new Map(input.tasks.map((task) => [task.id, task]));
  const blocksThisWeek = input.planBlocks.filter((block) => (
    block.status !== "CANCELED" && within(validDate(block.startsAt), weekStart, weekEnd)
  ));
  const sessionEvidence = new Map<string, { title: string; evidence: Set<string> }>();
  const addSessionEvidence = (roomId: string | null | undefined, title: string | null | undefined, evidence: string) => {
    const id = clean(roomId);
    if (!id) return;
    const current = sessionEvidence.get(id) ?? { title: clean(title) || "Capture session", evidence: new Set<string>() };
    current.evidence.add(evidence);
    sessionEvidence.set(id, current);
  };

  const goals = input.goals
    .filter((goal) => goal.status !== "ARCHIVED")
    .map((goal): WeeklyReviewGoal => {
      const linkedTasks = (goal.taskLinks ?? []).flatMap((link) => {
        const task = taskById.get(link.taskId);
        return task ? [{ ...link, task }] : [];
      });
      const linkedTaskIds = new Set(linkedTasks.map((link) => link.taskId));
      const goalBlocks = blocksThisWeek.filter((block) => block.goalId === goal.id || (block.taskId ? linkedTaskIds.has(block.taskId) : false));
      const completedBlocks = goalBlocks.filter((block) => block.status === "COMPLETED");
      const latestReceipt = [...(goal.progressReceipts ?? [])]
        .filter((receipt) => validDate(receipt.occurredAt) !== null)
        .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))[0] ?? null;
      const latestEvidenceAt = latestReceipt ? new Date(latestReceipt.occurredAt).toISOString() : null;
      const recentProgress = within(validDate(latestEvidenceAt), weekStart, weekEnd);
      const completedThisWeek = linkedTasks.filter((link) => within(validDate(link.task.completedAt), weekStart, weekEnd));
      const blockingTasks = linkedTasks.filter((link) => link.relationship === "BLOCKS" && link.task.status === "OPEN");
      const overdueTasks = linkedTasks.filter((link) => link.task.status === "OPEN" && (validDate(link.task.dueAt) ?? Number.POSITIVE_INFINITY) < Date.parse(generatedAt));
      const evidenceExists = recentProgress || completedThisWeek.length > 0 || completedBlocks.some((block) => explicitActualMinutes(block) > 0);
      const targetNeedsAttention = goal.status === "ACTIVE" && (validDate(goal.targetAt) ?? Number.POSITIVE_INFINITY) < Date.parse(generatedAt);
      const health: WeeklyReviewHealth = goal.status === "ACHIEVED"
        ? "achieved"
        : blockingTasks.length > 0 || overdueTasks.length > 0 || targetNeedsAttention
          ? "needs-attention"
          : evidenceExists
            ? "moving"
            : "no-recent-evidence";
      const blockers = [...blockingTasks, ...overdueTasks]
        .map((link) => link.task.title)
        .filter((title, index, all) => all.indexOf(title) === index);
      if (recentProgress) addSessionEvidence(goal.roomId, goal.sessionTitle, `goal:${goal.id}:progress`);
      for (const link of completedThisWeek) addSessionEvidence(link.task.roomId, link.task.sessionTitle, `task:${link.task.id}:done`);
      for (const block of goalBlocks) {
        const linkedTask = block.taskId ? taskById.get(block.taskId) : null;
        addSessionEvidence(linkedTask?.roomId ?? goal.roomId, linkedTask?.sessionTitle ?? goal.sessionTitle, `block:${block.id}`);
      }
      const nextTask = nextOpenTask(linkedTasks.map((link) => link.task));
      return {
        id: goal.id,
        title: clean(goal.title) || "Untitled goal",
        status: goal.status,
        health,
        healthLabel: health === "moving" ? "Moving with evidence" : health === "needs-attention" ? "Needs attention" : health === "achieved" ? "Achieved" : "No recent evidence",
        progressPercent: typeof latestReceipt?.progressPercent === "number" ? Math.max(0, Math.min(100, latestReceipt.progressPercent)) : goal.status === "ACHIEVED" ? 100 : null,
        latestEvidence: clean(latestReceipt?.note) || (completedThisWeek.length ? `${completedThisWeek.length} linked task${completedThisWeek.length === 1 ? "" : "s"} completed this week` : null),
        latestEvidenceAt,
        plannedMinutes: goalBlocks.reduce((total, block) => total + plannedMinutes(block), 0),
        actualMinutes: completedBlocks.reduce((total, block) => total + explicitActualMinutes(block), 0),
        completedBlocksWithoutActualMinutes: completedBlocks.filter((block) => explicitActualMinutes(block) === 0).length,
        linkedTaskCount: linkedTasks.length,
        completedTaskCount: linkedTasks.filter((link) => link.task.status === "DONE").length,
        openTaskCount: linkedTasks.filter((link) => link.task.status === "OPEN").length,
        overdueTaskCount: overdueTasks.length,
        blockers,
        nextTask: nextTask ? { id: nextTask.id, title: nextTask.title, dueAt: nextTask.dueAt ?? null } : null,
      };
    })
    .sort((left, right) => {
      const rank: Record<WeeklyReviewHealth, number> = { "needs-attention": 0, "no-recent-evidence": 1, moving: 2, achieved: 3 };
      return rank[left.health] - rank[right.health] || left.title.localeCompare(right.title) || left.id.localeCompare(right.id);
    });

  const nextCommitments: WeeklyReview["nextCommitments"] = [];
  const seenCommitments = new Set<string>();
  for (const [index, commitment] of (input.weeklyPlan?.commitments ?? []).entries()) {
    const title = clean(commitment);
    const key = title.toLocaleLowerCase();
    if (!title || seenCommitments.has(key)) continue;
    seenCommitments.add(key);
    nextCommitments.push({ kind: "weekly-plan", id: `${input.weeklyPlan?.id ?? "week"}:${index + 1}`, title, dueAt: null });
  }
  for (const goal of goals) {
    if (!goal.nextTask || nextCommitments.length >= 5) continue;
    const key = goal.nextTask.title.toLocaleLowerCase();
    if (seenCommitments.has(key)) continue;
    seenCommitments.add(key);
    nextCommitments.push({ kind: "task", ...goal.nextTask });
  }

  const completedBlocks = blocksThisWeek.filter((block) => block.status === "COMPLETED");
  const supportNeeded = clean(input.weeklyPlan?.supportNeeded);
  const goalBlockers = goals.flatMap((goal) => goal.blockers);
  const blockers = [supportNeeded, ...goalBlockers].filter(Boolean).filter((value, index, all) => all.indexOf(value) === index);
  return {
    schema: "quipsly-weekly-review-v1",
    subjectUserId: input.subjectUserId,
    subjectLabel: clean(input.subjectLabel) || null,
    relationship: input.relationship,
    weekStartsAt: new Date(weekIdentity).toISOString(),
    weekEndsAt: new Date(weekEnd).toISOString(),
    generatedAt,
    reviewState: input.weeklyPlan?.clientReviewedAt ? "reviewed" : input.weeklyPlan ? "draft" : "not-started",
    plannedMinutes: blocksThisWeek.reduce((total, block) => total + plannedMinutes(block), 0),
    actualMinutes: completedBlocks.reduce((total, block) => total + explicitActualMinutes(block), 0),
    completedBlocksWithoutActualMinutes: completedBlocks.filter((block) => explicitActualMinutes(block) === 0).length,
    goals,
    blockers,
    nextCommitments,
    sessionContributions: [...sessionEvidence.entries()]
      .map(([roomId, value]) => ({ roomId, title: value.title, evidenceCount: value.evidence.size }))
      .sort((left, right) => right.evidenceCount - left.evidenceCount || left.title.localeCompare(right.title) || left.roomId.localeCompare(right.roomId)),
    reflection: clean(input.weeklyPlan?.progressNotes) || null,
    boundaries: {
      deterministicProjection: true,
      actualTimeExplicitOnly: true,
      missingActualTimeInferred: false,
      targetStatusMutated: false,
      externalSideEffects: false,
    },
  };
}
