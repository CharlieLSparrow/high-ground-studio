import "server-only";

import { createHash } from "node:crypto";

import { Prisma, type PrismaClient } from "@prisma/client";
import { isUnreviewedTranscriptActionItemSource } from "@high-ground/quipsly-domain/coaching-packet";
import {
  readTranscriptDerivedTaskSource,
  readTranscriptMergedTaskSource,
  type TranscriptMergedTaskSource,
} from "@high-ground/quipsly-domain/transcript-derived-task";

import {
  SESSION_CONTINUITY_SCHEMA,
  type PriorSessionContinuity,
  type SavedSessionContinuityBrief,
  type SavedSessionContinuityTaskEvidence,
  type SessionContinuityPlanBlock,
  type SessionContinuitySnapshot,
  type SessionContinuityState,
  type SessionContinuitySummary,
} from "@/app/(app)/sessions/[roomId]/session-continuity-model";
import {
  sessionActorAccessWhere,
  sessionAccessWhere,
  type SessionAccessActor,
} from "@/lib/server/session-access";
import { loadPriorSessionFollowThroughByRoomId } from "@/lib/server/session-follow-through";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EXCERPT_LIMIT = 600;

type ContinuityPrisma = Prisma.TransactionClient;

export type SaveSessionContinuityBriefInput = {
  prisma: PrismaClient;
  actor: SessionAccessActor;
  roomId: string;
  clientRequestId: string;
  expectedSnapshotSha256: string;
  now?: Date;
};

export type SaveSessionContinuityBriefResult = {
  brief: SavedSessionContinuityBrief;
  idempotentReplay: boolean;
  state: SessionContinuityState;
};

export class SessionContinuityError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code:
      | "INVALID_REQUEST"
      | "SESSION_NOT_FOUND"
      | "STALE_SNAPSHOT"
      | "REQUEST_ID_CONFLICT"
      | "NO_CONTINUITY_SOURCES"
      | "CONCURRENT_WRITE",
    readonly state?: SessionContinuityState,
  ) {
    super(message);
    this.name = "SessionContinuityError";
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown, max = EXCERPT_LIMIT) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function excerptAndHash(value: unknown) {
  const full = typeof value === "string" ? value.trim() : "";
  return {
    excerpt: full.slice(0, EXCERPT_LIMIT),
    sha256: full ? createHash("sha256").update(full, "utf8").digest("hex") : null,
  };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function snapshotSha256(snapshot: SessionContinuitySnapshot) {
  // Prisma JSON omits object properties whose value is undefined. Hash the
  // exact JSON-serializable envelope so a valid optional sourceSpan cannot
  // become a false integrity failure after persistence and readback.
  const persistedShape = JSON.parse(JSON.stringify(snapshot)) as SessionContinuitySnapshot;
  return sha256(stableJson(persistedShape));
}

function sortByUpdatedAt<T extends { id: string; updatedAt: string }>(items: T[]) {
  return items.sort((left, right) => (
    right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id)
  ));
}

function summaryForSnapshot(snapshot: SessionContinuitySnapshot, now: Date): SessionContinuitySummary {
  return {
    noteCount: snapshot.notes.length,
    openTaskCount: snapshot.tasks.filter((task) => task.status === "OPEN").length,
    completedTaskCount: snapshot.tasks.filter((task) => task.status === "DONE").length,
    activeGoalCount: snapshot.goals.filter((goal) => goal.status === "ACTIVE").length,
    achievedGoalCount: snapshot.goals.filter((goal) => goal.status === "ACHIEVED").length,
    plannedBlockCount: snapshot.planBlocks.filter((block) => block.status === "PLANNED").length,
    completedBlockCount: snapshot.planBlocks.filter((block) => block.status === "COMPLETED").length,
    unresolvedPastBlockCount: snapshot.planBlocks.filter((block) => (
      block.status === "PLANNED" && new Date(block.endsAt).getTime() < now.getTime()
    )).length,
  };
}

function savedBrief(row: {
  id: string;
  title: string | null;
  body: string;
  sourceJson: unknown;
  createdAt: Date;
}, expected?: { actorUserId: string; roomId: string }): SavedSessionContinuityBrief | null {
  const source = record(row.sourceJson);
  if (
    source.schema !== SESSION_CONTINUITY_SCHEMA
    || (expected && source.actorUserId !== expected.actorUserId)
    || (expected && source.roomId !== expected.roomId)
    || source.visibility !== "actor-private"
    || source.aiGenerated !== false
    || source.sourceMutated !== false
    || source.externalSideEffects !== false
  ) return null;
  const integrity = record(source.integrity);
  const fingerprint = text(integrity.snapshotSha256, 64);
  const bodyFingerprint = text(integrity.bodySha256, 64);
  if (
    !/^[a-f0-9]{64}$/.test(fingerprint)
    || !/^[a-f0-9]{64}$/.test(bodyFingerprint)
    || sha256(row.body) !== bodyFingerprint
  ) return null;
  const taskEvidence = taskEvidenceFromSavedSnapshot(source, fingerprint, expected);
  return {
    id: row.id,
    title: row.title || "Next-session continuity brief",
    body: row.body,
    snapshotSha256: fingerprint,
    createdAt: row.createdAt.toISOString(),
    taskEvidence,
  };
}

function taskEvidenceFromSavedSnapshot(
  source: Record<string, unknown>,
  expectedSnapshotSha256: string,
  expected?: { actorUserId: string; roomId: string },
): SavedSessionContinuityTaskEvidence[] {
  const rawSnapshot = source.snapshot;
  const snapshot = record(rawSnapshot);
  if (
    snapshot.schema !== SESSION_CONTINUITY_SCHEMA
    || (expected && snapshot.actorUserId !== expected.actorUserId)
    || record(snapshot.room).id !== (expected?.roomId ?? source.roomId)
    || snapshot.externalSideEffects !== false
    || snapshot.aiGenerated !== false
    || snapshotSha256(rawSnapshot as SessionContinuitySnapshot) !== expectedSnapshotSha256
    || !Array.isArray(snapshot.tasks)
  ) return [];

  return snapshot.tasks.slice(0, 50).flatMap((value): SavedSessionContinuityTaskEvidence[] => {
    const task = record(value);
    const taskId = text(task.id, 240);
    const taskTitle = text(task.title, 500);
    const evidence = readSavedTranscriptTaskEvidence(task.lastMergedTranscriptEvidence);
    return taskId && taskTitle && evidence ? [{ taskId, taskTitle, evidence }] : [];
  });
}

function readSavedTranscriptTaskEvidence(value: unknown): TranscriptMergedTaskSource | null {
  const evidence = record(value);
  const receiptId = text(evidence.receiptId, 200);
  const actionCandidateId = text(evidence.actionCandidateId, 700);
  const mergedAt = text(evidence.mergedAt, 80);
  const sourceAnchor = readTranscriptDerivedTaskSource(evidence.sourceAnchor);
  return receiptId && actionCandidateId && mergedAt && sourceAnchor
    ? { receiptId, actionCandidateId, mergedAt, sourceAnchor }
    : null;
}

function keepAccessibleTaskEvidence(
  brief: SavedSessionContinuityBrief,
  accessibleRoomIds: Set<string>,
): SavedSessionContinuityBrief {
  return {
    ...brief,
    taskEvidence: (brief.taskEvidence ?? []).filter((item) => (
      accessibleRoomIds.has(item.evidence.sourceAnchor.roomId)
    )),
  };
}

type ContinuityRoomIdentity = {
  id: string;
  title: string | null;
  purpose: string;
  projectId: string | null;
  coachingEngagementId?: string | null;
  scheduledStart: Date | null;
  endedAt: Date | null;
  createdAt: Date;
};

function chronology(room: ContinuityRoomIdentity) {
  return [
    (room.scheduledStart ?? room.createdAt).getTime(),
    room.createdAt.getTime(),
    room.id,
  ] as const;
}

function isBefore(
  candidate: ContinuityRoomIdentity,
  target: ContinuityRoomIdentity,
) {
  const left = chronology(candidate);
  const right = chronology(target);
  if (left[0] !== right[0]) return left[0] < right[0];
  if (left[1] !== right[1]) return left[1] < right[1];
  return left[2] < right[2];
}

export async function loadPriorSessionContinuityByRoomId(input: {
  prisma: ContinuityPrisma;
  actor: SessionAccessActor;
  rooms: ContinuityRoomIdentity[];
}): Promise<Record<string, PriorSessionContinuity>> {
  const targets = input.rooms.filter((room) => Boolean(room.projectId));
  const projectIds = [...new Set(targets.flatMap((room) => room.projectId ? [room.projectId] : []))];
  if (!input.actor.id || projectIds.length === 0) return {};

  const candidates = await input.prisma.callRoom.findMany({
    where: {
      projectId: { in: projectIds },
      ...sessionActorAccessWhere(input.actor),
      notes: {
        some: {
          authorUserId: input.actor.id,
          kind: "FOLLOW_UP",
          visibility: "AUTHOR_PRIVATE",
        },
      },
    },
    select: {
      id: true,
      title: true,
      purpose: true,
      projectId: true,
      coachingEngagementId: true,
      scheduledStart: true,
      endedAt: true,
      createdAt: true,
      notes: {
        where: {
          authorUserId: input.actor.id,
          kind: "FOLLOW_UP",
          visibility: "AUTHOR_PRIVATE",
        },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          title: true,
          body: true,
          sourceJson: true,
          createdAt: true,
        },
      },
    },
  });

  const parsedCandidates = candidates.flatMap((candidate) => {
    const brief = candidate.notes
      .map((note) => savedBrief(note, {
        actorUserId: input.actor.id,
        roomId: candidate.id,
      }))
      .find((item): item is SavedSessionContinuityBrief => Boolean(item));
    return brief ? [{ candidate, brief }] : [];
  });
  const accessibleEvidenceRoomIds = new Set([
    ...targets.map((room) => room.id),
    ...candidates.map((room) => room.id),
  ]);
  const unresolvedEvidenceRoomIds = [...new Set(parsedCandidates.flatMap(({ brief }) => (
    (brief.taskEvidence ?? []).map((item) => item.evidence.sourceAnchor.roomId)
  )))].filter((roomId) => !accessibleEvidenceRoomIds.has(roomId));
  if (unresolvedEvidenceRoomIds.length > 0) {
    const accessibleEvidenceRooms = await input.prisma.callRoom.findMany({
      where: {
        id: { in: unresolvedEvidenceRoomIds },
        ...sessionActorAccessWhere(input.actor),
      },
      select: { id: true },
    });
    accessibleEvidenceRooms.forEach((room) => accessibleEvidenceRoomIds.add(room.id));
  }

  const result: Record<string, PriorSessionContinuity> = {};
  for (const target of targets) {
    const prior = parsedCandidates
      .filter(({ candidate }) => (
        candidate.id !== target.id
        && (target.coachingEngagementId
          ? candidate.coachingEngagementId === target.coachingEngagementId
          : candidate.projectId === target.projectId
            && !candidate.coachingEngagementId
            && String(candidate.purpose) === String(target.purpose))
        && isBefore(candidate, target)
      ))
      .sort((left, right) => {
        const leftChronology = chronology(left.candidate);
        const rightChronology = chronology(right.candidate);
        return rightChronology[0] - leftChronology[0]
          || rightChronology[1] - leftChronology[1]
          || right.candidate.id.localeCompare(left.candidate.id);
      })[0];
    if (!prior || !prior.candidate.projectId) continue;
    result[target.id] = {
      sourceRoom: {
        id: prior.candidate.id,
        title: prior.candidate.title || "Untitled Session",
        purpose: String(prior.candidate.purpose),
        projectId: prior.candidate.projectId,
        scheduledStart: prior.candidate.scheduledStart?.toISOString() ?? null,
        endedAt: prior.candidate.endedAt?.toISOString() ?? null,
      },
      brief: keepAccessibleTaskEvidence(prior.brief, accessibleEvidenceRoomIds),
      relationship: target.coachingEngagementId
        ? "same-coaching-engagement"
        : "legacy-same-project-and-purpose",
      currentSessionMutated: false,
      externalSideEffects: false,
    };
  }
  return result;
}

function continuityNoteIdentity(actorUserId: string, clientRequestId: string) {
  return `session-continuity-${sha256(`${actorUserId}|${clientRequestId}`).slice(0, 32)}`;
}

function sourceMatchesRequest(
  sourceJson: unknown,
  input: {
    actorUserId: string;
    roomId: string;
    clientRequestId: string;
    expectedSnapshotSha256: string;
  },
) {
  const source = record(sourceJson);
  const integrity = record(source.integrity);
  return source.schema === SESSION_CONTINUITY_SCHEMA
    && source.actorUserId === input.actorUserId
    && source.roomId === input.roomId
    && source.clientRequestId === input.clientRequestId
    && integrity.snapshotSha256 === input.expectedSnapshotSha256;
}

function planBlockLine(block: SessionContinuityPlanBlock, now: Date) {
  const start = new Date(block.startsAt);
  const end = new Date(block.endsAt);
  const unresolvedPast = block.status === "PLANNED" && end.getTime() < now.getTime();
  const boundary = unresolvedPast
    ? "planned time passed; completion or skip decision still missing"
    : block.status.toLowerCase();
  return `- [${block.id}] ${start.toISOString()}–${end.toISOString()} (${block.timezone}) — ${boundary}`;
}

export function renderSessionContinuityBrief(
  snapshot: SessionContinuitySnapshot,
  savedAt: Date,
) {
  const summary = summaryForSnapshot(snapshot, savedAt);
  const taskEvidenceLines = snapshot.tasks.flatMap((task) => {
    const evidence = task.lastMergedTranscriptEvidence;
    return evidence ? [
      `- [${task.id}] receipt ${evidence.receiptId} · segment ${evidence.sourceAnchor.segmentId} · “${evidence.sourceAnchor.effectiveTextSnapshot}”`,
    ] : [];
  });
  const lines = [
    `Next-session continuity — ${snapshot.room.title}`,
    "",
    `Saved ${savedAt.toISOString()} from actor-owned canonical Quipsly records.`,
    "This is a private human-requested snapshot, not an AI summary or evidence that work, delivery, messaging, scheduling, or publication occurred.",
    "",
    "Current truth",
    `- Notes: ${summary.noteCount}`,
    `- Tasks: ${summary.openTaskCount} open, ${summary.completedTaskCount} done`,
    `- Goals: ${summary.activeGoalCount} active, ${summary.achievedGoalCount} achieved`,
    `- Focus blocks: ${summary.plannedBlockCount} planned, ${summary.completedBlockCount} completed, ${summary.unresolvedPastBlockCount} past without a recorded decision`,
    "",
    "Notes to bring forward",
    ...(snapshot.notes.length
      ? snapshot.notes.map((note) => `- [${note.id}] ${note.title || "Quick note"}: ${note.bodyExcerpt}`)
      : ["- None recorded."]),
    "",
    "Committed tasks",
    ...(snapshot.tasks.length
      ? snapshot.tasks.map((task) => {
          const evidence = task.lastMergedTranscriptEvidence;
          const evidenceLabel = evidence
            ? ` · reviewed transcript evidence ${evidence.sourceAnchor.startSeconds.toFixed(2)}–${evidence.sourceAnchor.endSeconds.toFixed(2)}s in Session ${evidence.sourceAnchor.roomId}`
            : "";
          return `- [${task.id}] ${task.status}: ${task.title}${task.detailExcerpt ? ` — ${task.detailExcerpt}` : ""}${evidenceLabel}`;
        })
      : ["- None recorded."]),
    "",
    "Reviewed task evidence",
    ...(taskEvidenceLines.length ? taskEvidenceLines : ["- None recorded."]),
    "",
    "Goals",
    ...(snapshot.goals.length
      ? snapshot.goals.map((goal) => {
          const progress = goal.latestProgress?.progressPercent !== null
            && goal.latestProgress?.progressPercent !== undefined
            ? ` · latest recorded progress ${goal.latestProgress.progressPercent}%`
            : "";
          return `- [${goal.id}] ${goal.status}: ${goal.title}${progress}`;
        })
      : ["- None recorded."]),
    "",
    "Focus-block evidence",
    ...(snapshot.planBlocks.length
      ? snapshot.planBlocks.map((block) => planBlockLine(block, savedAt))
      : ["- None recorded."]),
    "",
    "Source receipt",
    `- Session ${snapshot.room.id}`,
    `- Snapshot SHA-256 ${snapshotSha256(snapshot)}`,
    "- Exact note, task, goal, and focus-block identities remain in the saved source envelope.",
  ];
  return lines.join("\n");
}

export async function loadSessionContinuityState(input: {
  prisma: ContinuityPrisma;
  actor: SessionAccessActor;
  roomId: string;
  now?: Date;
}): Promise<SessionContinuityState | null> {
  const roomId = text(input.roomId, 240);
  if (!roomId || !input.actor.id) return null;

  const room = await input.prisma.callRoom.findFirst({
    where: sessionAccessWhere(roomId, input.actor),
    select: {
      id: true,
      title: true,
      purpose: true,
      status: true,
      projectId: true,
      coachingEngagementId: true,
      scheduledStart: true,
      endedAt: true,
      createdAt: true,
      updatedAt: true,
      booking: { select: { clientUserId: true, coachUserId: true } },
      notes: {
        where: { authorUserId: input.actor.id, kind: "SESSION_NOTE" },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          kind: true,
          title: true,
          body: true,
          sourceJson: true,
          createdAt: true,
          updatedAt: true,
          tagLinks: {
            orderBy: { createdAt: "asc" },
            select: { tag: { select: { id: true, label: true, slug: true, isActive: true } } },
          },
        },
      },
      actionItems: {
        where: { assignedUserId: input.actor.id },
        orderBy: { updatedAt: "desc" },
        take: 50,
        select: {
          id: true,
          title: true,
          detail: true,
          status: true,
          dueAt: true,
          completedAt: true,
          sourceJson: true,
          updatedAt: true,
          evidenceReceipts: {
            where: { kind: "TRANSCRIPT_CANDIDATE_MERGED" },
            orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
            take: 1,
            select: { evidenceJson: true },
          },
          tagLinks: {
            orderBy: { createdAt: "asc" },
            select: { tag: { select: { id: true, isActive: true } } },
          },
          goalLinks: {
            where: { goal: { ownerUserId: input.actor.id } },
            select: { goalId: true },
          },
          planBlocks: {
            where: { ownerUserId: input.actor.id },
            orderBy: { startsAt: "desc" },
            select: {
              id: true,
              actionItemId: true,
              goalId: true,
              startsAt: true,
              endsAt: true,
              timezone: true,
              status: true,
              completedAt: true,
              updatedAt: true,
            },
          },
        },
      },
      goals: {
        where: { ownerUserId: input.actor.id },
        orderBy: { updatedAt: "desc" },
        take: 50,
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          targetAt: true,
          achievedAt: true,
          updatedAt: true,
          tagLinks: {
            orderBy: { createdAt: "asc" },
            select: { tag: { select: { id: true, isActive: true } } },
          },
          taskLinks: {
            where: { actionItem: { assignedUserId: input.actor.id } },
            select: { actionItemId: true },
          },
          planBlocks: {
            where: { ownerUserId: input.actor.id },
            orderBy: { startsAt: "desc" },
            select: {
              id: true,
              actionItemId: true,
              goalId: true,
              startsAt: true,
              endsAt: true,
              timezone: true,
              status: true,
              completedAt: true,
              updatedAt: true,
            },
          },
          progressReceipts: {
            orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
            take: 1,
            select: {
              id: true,
              kind: true,
              progressPercent: true,
              note: true,
              occurredAt: true,
            },
          },
        },
      },
    },
  });
  if (!room) return null;
  const parsedTaskEvidence = new Map(room.actionItems.flatMap((task) => {
    const evidence = readTranscriptMergedTaskSource(task.evidenceReceipts?.[0]?.evidenceJson);
    return evidence ? [[task.id, evidence] as const] : [];
  }));
  const accessibleEvidenceRoomIds = new Set([room.id]);
  const unresolvedEvidenceRoomIds = [...new Set([...parsedTaskEvidence.values()]
    .map((evidence) => evidence.sourceAnchor.roomId))]
    .filter((evidenceRoomId) => !accessibleEvidenceRoomIds.has(evidenceRoomId));
  if (unresolvedEvidenceRoomIds.length > 0) {
    const accessibleEvidenceRooms = await input.prisma.callRoom.findMany({
      where: {
        id: { in: unresolvedEvidenceRoomIds },
        ...sessionActorAccessWhere(input.actor),
      },
      select: { id: true },
    });
    accessibleEvidenceRooms.forEach((evidenceRoom) => accessibleEvidenceRoomIds.add(evidenceRoom.id));
  }
  // Interactive transactions use one driver connection. Keep these reads
  // sequential so the pg adapter never dispatches concurrent queries on that
  // connection (pg 9 will reject the legacy concurrent behavior).
  const savedRows = await input.prisma.coachingNote.findMany({
    where: {
      roomId: room.id,
      authorUserId: input.actor.id,
      kind: "FOLLOW_UP",
    },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      title: true,
      body: true,
      sourceJson: true,
      createdAt: true,
    },
  });
  const priorByRoomId = await loadPriorSessionContinuityByRoomId({
    prisma: input.prisma,
    actor: input.actor,
    rooms: [room],
  });
  const priorFollowThroughByRoomId = await loadPriorSessionFollowThroughByRoomId({
    prisma: input.prisma,
    actor: input.actor,
    rooms: [room],
  });

  const sourceNotes = room.notes
    .filter((note) => note.kind === "SESSION_NOTE")
    .map((note) => {
      const body = excerptAndHash(note.body);
      return {
        id: note.id,
        title: note.title,
        bodyExcerpt: body.excerpt,
        bodySha256: body.sha256 || sha256(""),
        updatedAt: note.updatedAt.toISOString(),
        tags: note.tagLinks
          .map((link) => link.tag)
          .filter((tag) => tag.isActive)
          .map(({ id, label, slug }) => ({ id, label, slug })),
      };
    });

  const planBlocks = new Map<string, SessionContinuityPlanBlock>();
  const includePlanBlock = (block: {
    id: string;
    actionItemId: string | null;
    goalId: string | null;
    startsAt: Date;
    endsAt: Date;
    timezone: string;
    status: string;
    completedAt: Date | null;
    updatedAt: Date;
  }) => {
    planBlocks.set(block.id, {
      id: block.id,
      actionItemId: block.actionItemId,
      goalId: block.goalId,
      startsAt: block.startsAt.toISOString(),
      endsAt: block.endsAt.toISOString(),
      timezone: block.timezone,
      status: String(block.status),
      completedAt: block.completedAt?.toISOString() ?? null,
      updatedAt: block.updatedAt.toISOString(),
    });
  };

  const tasks = room.actionItems
    .filter((task) => !isUnreviewedTranscriptActionItemSource(record(task.sourceJson)))
    .map((task) => {
      task.planBlocks.forEach(includePlanBlock);
      const detail = excerptAndHash(task.detail);
      return {
        id: task.id,
        title: task.title,
        detailExcerpt: detail.excerpt || null,
        detailSha256: detail.sha256,
        status: String(task.status),
        dueAt: task.dueAt?.toISOString() ?? null,
        completedAt: task.completedAt?.toISOString() ?? null,
        updatedAt: task.updatedAt.toISOString(),
        tagIds: task.tagLinks
          .map((link) => link.tag)
          .filter((tag) => tag.isActive)
          .map((tag) => tag.id)
          .sort(),
        goalIds: task.goalLinks.map((link) => link.goalId).sort(),
        planBlockIds: task.planBlocks.map((block) => block.id).sort(),
        lastMergedTranscriptEvidence: (() => {
          const evidence = parsedTaskEvidence.get(task.id) ?? null;
          return evidence && accessibleEvidenceRoomIds.has(evidence.sourceAnchor.roomId)
            ? evidence
            : null;
        })(),
      };
    });

  const goals = room.goals.map((goal) => {
    goal.planBlocks.forEach(includePlanBlock);
    const description = excerptAndHash(goal.description);
    const progress = goal.progressReceipts[0];
    const progressNote = excerptAndHash(progress?.note);
    return {
      id: goal.id,
      title: goal.title,
      descriptionExcerpt: description.excerpt || null,
      descriptionSha256: description.sha256,
      status: String(goal.status),
      targetAt: goal.targetAt?.toISOString() ?? null,
      achievedAt: goal.achievedAt?.toISOString() ?? null,
      updatedAt: goal.updatedAt.toISOString(),
      tagIds: goal.tagLinks
        .map((link) => link.tag)
        .filter((tag) => tag.isActive)
        .map((tag) => tag.id)
        .sort(),
      taskIds: goal.taskLinks.map((link) => link.actionItemId).sort(),
      planBlockIds: goal.planBlocks.map((block) => block.id).sort(),
      latestProgress: progress ? {
        id: progress.id,
        kind: progress.kind,
        progressPercent: progress.progressPercent,
        noteExcerpt: progressNote.excerpt || null,
        noteSha256: progressNote.sha256,
        occurredAt: progress.occurredAt.toISOString(),
      } : null,
    };
  });

  const snapshot: SessionContinuitySnapshot = {
    schema: SESSION_CONTINUITY_SCHEMA,
    actorUserId: input.actor.id,
    room: {
      id: room.id,
      title: room.title || "Untitled Session",
      purpose: String(room.purpose),
      status: String(room.status),
      projectId: room.projectId,
      updatedAt: room.updatedAt.toISOString(),
    },
    notes: sortByUpdatedAt(sourceNotes),
    tasks: sortByUpdatedAt(tasks),
    goals: sortByUpdatedAt(goals),
    planBlocks: sortByUpdatedAt(Array.from(planBlocks.values())),
    externalSideEffects: false,
    aiGenerated: false,
  };
  const now = input.now ?? new Date();
  const saved = savedRows
    .map((row) => savedBrief(row, {
      actorUserId: input.actor.id,
      roomId: room.id,
    }))
    .filter((brief): brief is SavedSessionContinuityBrief => Boolean(brief));

  return {
    current: {
      snapshot,
      snapshotSha256: snapshotSha256(snapshot),
      summary: summaryForSnapshot(snapshot, now),
    },
    saved,
    prior: priorByRoomId[room.id] ?? null,
    priorFollowThrough: priorFollowThroughByRoomId[room.id] ?? null,
    canSave: snapshot.notes.length + snapshot.tasks.length + snapshot.goals.length > 0,
  };
}

function validateSaveInput(input: SaveSessionContinuityBriefInput) {
  const roomId = text(input.roomId, 240);
  const clientRequestId = text(input.clientRequestId, 80).toLowerCase();
  const expectedSnapshotSha256 = text(input.expectedSnapshotSha256, 64).toLowerCase();
  if (
    !input.actor.id
    || !roomId
    || !UUID_PATTERN.test(clientRequestId)
    || !/^[a-f0-9]{64}$/.test(expectedSnapshotSha256)
  ) {
    throw new SessionContinuityError(
      "A Session, stable request identity, and current continuity receipt are required.",
      400,
      "INVALID_REQUEST",
    );
  }
  return { roomId, clientRequestId, expectedSnapshotSha256 };
}

export async function saveSessionContinuityBrief(
  input: SaveSessionContinuityBriefInput,
): Promise<SaveSessionContinuityBriefResult> {
  const normalized = validateSaveInput(input);
  const id = continuityNoteIdentity(input.actor.id, normalized.clientRequestId);
  const now = input.now ?? new Date();

  try {
    return await input.prisma.$transaction(async (tx) => {
      const state = await loadSessionContinuityState({
        prisma: tx,
        actor: input.actor,
        roomId: normalized.roomId,
        now,
      });
      if (!state) {
        throw new SessionContinuityError(
          "This Session was not found or is not accessible to this account.",
          404,
          "SESSION_NOT_FOUND",
        );
      }

      const existing = await tx.coachingNote.findUnique({
        where: { id },
        select: {
          id: true,
          roomId: true,
          authorUserId: true,
          title: true,
          body: true,
          sourceJson: true,
          createdAt: true,
        },
      });
      if (existing) {
        if (
          existing.authorUserId !== input.actor.id
          || existing.roomId !== normalized.roomId
          || !sourceMatchesRequest(existing.sourceJson, {
            actorUserId: input.actor.id,
            roomId: normalized.roomId,
            clientRequestId: normalized.clientRequestId,
            expectedSnapshotSha256: normalized.expectedSnapshotSha256,
          })
        ) {
          throw new SessionContinuityError(
            "This retry identity already belongs to a different continuity snapshot.",
            409,
            "REQUEST_ID_CONFLICT",
            state,
          );
        }
        const brief = savedBrief(existing, {
          actorUserId: input.actor.id,
          roomId: normalized.roomId,
        });
        if (!brief) {
          throw new SessionContinuityError(
            "The saved continuity receipt is malformed and was not reused.",
            409,
            "REQUEST_ID_CONFLICT",
            state,
          );
        }
        return { brief, idempotentReplay: true, state };
      }

      if (!state.canSave) {
        throw new SessionContinuityError(
          "Capture at least one deliberate Session note, task, or goal before saving a continuity brief.",
          409,
          "NO_CONTINUITY_SOURCES",
          state,
        );
      }
      if (state.current.snapshotSha256 !== normalized.expectedSnapshotSha256) {
        throw new SessionContinuityError(
          "The Session changed after this continuity preview loaded. Refresh the current truth before saving.",
          409,
          "STALE_SNAPSHOT",
          state,
        );
      }
      const matchingSnapshot = state.saved.find(
        (brief) => brief.snapshotSha256 === normalized.expectedSnapshotSha256,
      );
      if (matchingSnapshot) {
        return {
          brief: matchingSnapshot,
          idempotentReplay: true,
          state,
        };
      }

      const body = renderSessionContinuityBrief(state.current.snapshot, now);
      const bodySha256 = sha256(body);
      const created = await tx.coachingNote.create({
        data: {
          id,
          roomId: normalized.roomId,
          authorUserId: input.actor.id,
          kind: "FOLLOW_UP",
          visibility: "AUTHOR_PRIVATE",
          title: `Next-session brief — ${state.current.snapshot.room.title}`.slice(0, 500),
          body,
          sourceJson: {
            schema: SESSION_CONTINUITY_SCHEMA,
            clientRequestId: normalized.clientRequestId,
            actorUserId: input.actor.id,
            roomId: normalized.roomId,
            savedAt: now.toISOString(),
            visibility: "actor-private",
            aiGenerated: false,
            sourceMutated: false,
            externalSideEffects: false,
            snapshot: state.current.snapshot,
            integrity: {
              algorithm: "sha256",
              snapshotSha256: state.current.snapshotSha256,
              bodySha256,
              noteCount: state.current.snapshot.notes.length,
              taskCount: state.current.snapshot.tasks.length,
              goalCount: state.current.snapshot.goals.length,
              planBlockCount: state.current.snapshot.planBlocks.length,
            },
          },
        },
        select: {
          id: true,
          title: true,
          body: true,
          sourceJson: true,
          createdAt: true,
        },
      });
      const brief = savedBrief(created, {
        actorUserId: input.actor.id,
        roomId: normalized.roomId,
      });
      if (!brief) {
        throw new SessionContinuityError(
          "The continuity brief was saved but its integrity receipt could not be read back.",
          409,
          "CONCURRENT_WRITE",
          state,
        );
      }
      return {
        brief,
        idempotentReplay: false,
        state: { ...state, saved: [brief, ...state.saved.filter((item) => item.id !== brief.id)] },
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof SessionContinuityError) throw error;
    if (record(error).code === "P2002") {
      const [state, existing] = await Promise.all([
        loadSessionContinuityState({
          prisma: input.prisma as unknown as ContinuityPrisma,
          actor: input.actor,
          roomId: normalized.roomId,
          now,
        }),
        input.prisma.coachingNote.findUnique({
          where: { id },
          select: {
            id: true,
            roomId: true,
            authorUserId: true,
            title: true,
            body: true,
            sourceJson: true,
            createdAt: true,
          },
        }),
      ]);
      const brief = existing
        && existing.authorUserId === input.actor.id
        && existing.roomId === normalized.roomId
        && sourceMatchesRequest(existing.sourceJson, {
          actorUserId: input.actor.id,
          roomId: normalized.roomId,
          clientRequestId: normalized.clientRequestId,
          expectedSnapshotSha256: normalized.expectedSnapshotSha256,
        })
        ? savedBrief(existing, {
            actorUserId: input.actor.id,
            roomId: normalized.roomId,
          })
        : null;
      if (state && brief) {
        return {
          brief,
          idempotentReplay: true,
          state: {
            ...state,
            saved: [brief, ...state.saved.filter((item) => item.id !== brief.id)],
          },
        };
      }
      throw new SessionContinuityError(
        "This retry identity collided with a different continuity receipt.",
        409,
        "REQUEST_ID_CONFLICT",
        state ?? undefined,
      );
    }
    if (record(error).code === "P2034") {
      throw new SessionContinuityError(
        "The Session changed during save. Refresh the current truth and try again.",
        409,
        "CONCURRENT_WRITE",
      );
    }
    throw error;
  }
}
