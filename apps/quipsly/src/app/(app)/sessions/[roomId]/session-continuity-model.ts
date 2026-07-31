export const SESSION_CONTINUITY_SCHEMA = "quipsly-session-continuity-brief-v1" as const;

export type SessionContinuityTag = {
  id: string;
  label: string;
  slug: string;
};

export type SessionContinuityNote = {
  id: string;
  title: string | null;
  bodyExcerpt: string;
  bodySha256: string;
  updatedAt: string;
  tags: SessionContinuityTag[];
};

export type SessionContinuityTask = {
  id: string;
  title: string;
  detailExcerpt: string | null;
  detailSha256: string | null;
  status: string;
  dueAt: string | null;
  completedAt: string | null;
  updatedAt: string;
  tagIds: string[];
  goalIds: string[];
  planBlockIds: string[];
};

export type SessionContinuityGoal = {
  id: string;
  title: string;
  descriptionExcerpt: string | null;
  descriptionSha256: string | null;
  status: string;
  targetAt: string | null;
  achievedAt: string | null;
  updatedAt: string;
  tagIds: string[];
  taskIds: string[];
  planBlockIds: string[];
  latestProgress: {
    id: string;
    kind: string;
    progressPercent: number | null;
    noteExcerpt: string | null;
    noteSha256: string | null;
    occurredAt: string;
  } | null;
};

export type SessionContinuityPlanBlock = {
  id: string;
  actionItemId: string | null;
  goalId: string | null;
  startsAt: string;
  endsAt: string;
  timezone: string;
  status: string;
  completedAt: string | null;
  updatedAt: string;
};

export type SessionContinuitySnapshot = {
  schema: typeof SESSION_CONTINUITY_SCHEMA;
  actorUserId: string;
  room: {
    id: string;
    title: string;
    purpose: string;
    status: string;
    projectId: string | null;
    updatedAt: string;
  };
  notes: SessionContinuityNote[];
  tasks: SessionContinuityTask[];
  goals: SessionContinuityGoal[];
  planBlocks: SessionContinuityPlanBlock[];
  externalSideEffects: false;
  aiGenerated: false;
};

export type SessionContinuitySummary = {
  noteCount: number;
  openTaskCount: number;
  completedTaskCount: number;
  activeGoalCount: number;
  achievedGoalCount: number;
  plannedBlockCount: number;
  completedBlockCount: number;
  unresolvedPastBlockCount: number;
};

export type SavedSessionContinuityBrief = {
  id: string;
  title: string;
  body: string;
  snapshotSha256: string;
  createdAt: string;
};

export type PriorSessionContinuity = {
  sourceRoom: {
    id: string;
    title: string;
    purpose: string;
    projectId: string;
    scheduledStart: string | null;
    endedAt: string | null;
  };
  brief: SavedSessionContinuityBrief;
  relationship: "same-project-and-purpose";
  currentSessionMutated: false;
  externalSideEffects: false;
};

export type SessionContinuityState = {
  current: {
    snapshot: SessionContinuitySnapshot;
    snapshotSha256: string;
    summary: SessionContinuitySummary;
  };
  saved: SavedSessionContinuityBrief[];
  prior: PriorSessionContinuity | null;
  canSave: boolean;
};
