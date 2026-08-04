import type { TranscriptMergedTaskSource } from "@high-ground/quipsly-domain/transcript-derived-task";

export const SESSION_CONTINUITY_SCHEMA = "quipsly-session-continuity-brief-v1" as const;
export const SESSION_FOLLOW_THROUGH_SCHEMA = "quipsly-session-follow-through-v1" as const;

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
  lastMergedTranscriptEvidence?: TranscriptMergedTaskSource | null;
};

export type SavedSessionContinuityTaskEvidence = {
  taskId: string;
  taskTitle: string;
  evidence: TranscriptMergedTaskSource;
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
  taskEvidence?: SavedSessionContinuityTaskEvidence[];
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
  relationship: "same-coaching-engagement" | "legacy-same-project-and-purpose";
  currentSessionMutated: false;
  externalSideEffects: false;
};

export type SessionFollowThroughTask = {
  id: string;
  title: string;
  detail: string | null;
  status: string;
  dueAt: string | null;
  completedAt: string | null;
  updatedAt: string | null;
  availability: "CURRENT" | "UNAVAILABLE";
  changedSinceRelease: boolean;
  releasedStatus: string;
  releasedContentSha256: string;
};

export type SessionFollowThroughGoal = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  targetAt: string | null;
  achievedAt: string | null;
  updatedAt: string | null;
  availability: "CURRENT" | "UNAVAILABLE";
  changedSinceRelease: boolean;
  progressedSinceRelease: boolean;
  releasedStatus: string;
  releasedContentSha256: string;
  latestProgress: {
    id: string;
    kind: string;
    progressPercent: number | null;
    note: string | null;
    occurredAt: string;
  } | null;
};

export type PriorSessionFollowThrough = {
  schema: typeof SESSION_FOLLOW_THROUGH_SCHEMA;
  viewerRole: "COACH" | "CLIENT";
  sourceRoom: {
    id: string;
    title: string;
    projectId: string;
    scheduledStart: string | null;
  };
  output: {
    id: string;
    title: string;
    intro: string | null;
    nextSessionFocus: string | null;
    contentSha256: string;
    revision: number;
    releasedAt: string;
    recipientLabel: string;
  };
  tasks: SessionFollowThroughTask[];
  goals: SessionFollowThroughGoal[];
  summary: {
    openTaskCount: number;
    completedTaskCount: number;
    activeGoalCount: number;
    achievedGoalCount: number;
    changedSinceReleaseCount: number;
    unavailableCount: number;
  };
  relationship: "same-coaching-engagement" | "legacy-same-project-purpose-client-and-coach";
  canOpenWork: boolean;
  canonicalRecordsMutated: false;
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
  priorFollowThrough: PriorSessionFollowThrough | null;
  canSave: boolean;
};
