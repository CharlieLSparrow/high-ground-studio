import "server-only";

import {
  readTranscriptDerivedGoalSource,
  readTranscriptDerivedTaskSource,
} from "@high-ground/quipsly-domain/transcript-derived-task";

import {
  CLIENT_FOLLOW_UP_MANIFEST_SCHEMA,
  CLIENT_FOLLOW_UP_SCHEMA,
  clientFollowUpRecordSha256Matches,
  clientFollowUpSha256,
} from "./session-client-follow-up";
import { sessionActorAccessWhere, type SessionAccessActor } from "./session-access";
import {
  SESSION_FOLLOW_THROUGH_SCHEMA,
  type PriorSessionFollowThrough,
} from "@/app/(app)/sessions/[roomId]/session-continuity-model";

type FollowThroughClient = any;

function sourceAnchorForRoom<T extends { roomId: string }>(anchor: T | null, roomId: string): T | null {
  return anchor?.roomId === roomId ? anchor : null;
}

export type FollowThroughRoomIdentity = {
  id: string;
  title: string | null;
  purpose: string;
  projectId: string | null;
  scheduledStart: Date | null;
  endedAt: Date | null;
  createdAt: Date;
  booking: {
    clientUserId: string;
    coachUserId: string | null;
  } | null;
};

function record(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

function array(value: unknown): Record<string, any>[] {
  return Array.isArray(value) ? value.map(record) : [];
}

function text(value: unknown, max = 4_000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function iso(value: unknown) {
  return value && typeof (value as Date).toISOString === "function"
    ? (value as Date).toISOString()
    : null;
}

function chronology(room: Pick<FollowThroughRoomIdentity, "id" | "scheduledStart" | "createdAt">) {
  return [(room.scheduledStart ?? room.createdAt).getTime(), room.createdAt.getTime(), room.id] as const;
}

function isBefore(candidate: FollowThroughRoomIdentity, target: FollowThroughRoomIdentity) {
  const left = chronology(candidate);
  const right = chronology(target);
  if (left[0] !== right[0]) return left[0] < right[0];
  if (left[1] !== right[1]) return left[1] < right[1];
  return left[2] < right[2];
}

function uniqueRecordIds(rows: Record<string, any>[]) {
  const ids = rows.map((row) => text(row.id, 240)).filter(Boolean);
  return ids.length === new Set(ids).size ? ids : [];
}

function matchingIds(left: string[], right: string[]) {
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.length === sortedRight.length
    && sortedLeft.every((id, index) => id === sortedRight[index]);
}

function validatedReleasedOutput(output: any, room: FollowThroughRoomIdentity) {
  const body = record(output?.bodyJson);
  const manifest = record(output?.sourceManifestJson);
  const bodyTasks = array(body.tasks);
  const bodyGoals = array(body.goals);
  const manifestRecords = record(manifest.records);
  const manifestTasks = array(manifestRecords.tasks);
  const manifestGoals = array(manifestRecords.goals);
  const taskIds = uniqueRecordIds(bodyTasks);
  const goalIds = uniqueRecordIds(bodyGoals);
  const manifestTaskIds = uniqueRecordIds(manifestTasks);
  const manifestGoalIds = uniqueRecordIds(manifestGoals);
  const session = record(body.session);

  if (
    output?.kind !== "CLIENT_FOLLOW_UP"
    || output?.status !== "RELEASED"
    || body.schema !== CLIENT_FOLLOW_UP_SCHEMA
    || manifest.schema !== CLIENT_FOLLOW_UP_MANIFEST_SCHEMA
    || session.id !== room.id
    || manifest.roomId !== room.id
    || manifest.recipientUserId !== output.recipientUserId
    || output.contentSha256 !== clientFollowUpSha256(body)
    || taskIds.length !== bodyTasks.length
    || goalIds.length !== bodyGoals.length
    || manifestTaskIds.length !== manifestTasks.length
    || manifestGoalIds.length !== manifestGoals.length
    || !matchingIds(taskIds, manifestTaskIds)
    || !matchingIds(goalIds, manifestGoalIds)
  ) return null;

  const taskManifest = new Map(manifestTasks.map((row) => [text(row.id, 240), row]));
  const goalManifest = new Map(manifestGoals.map((row) => [text(row.id, 240), row]));
  const tasks = bodyTasks.flatMap((row) => {
    const id = text(row.id, 240);
    const source = taskManifest.get(id);
    const released = {
      title: text(row.title, 500),
      detail: text(row.detail, 4_000) || null,
      status: text(row.status, 80),
      dueAt: text(row.dueAt, 80) || null,
    };
    if (
      !id
      || !source
      || !clientFollowUpRecordSha256Matches(
        { ...released, sourceAnchor: row.sourceAnchor ?? null },
        text(source.contentSha256, 64),
      )
    ) return [];
    return [{ id, ...released, contentSha256: source.contentSha256 as string }];
  });
  const goals = bodyGoals.flatMap((row) => {
    const id = text(row.id, 240);
    const source = goalManifest.get(id);
    const released = {
      title: text(row.title, 500),
      description: text(row.description, 4_000) || null,
      status: text(row.status, 80),
      targetAt: text(row.targetAt, 80) || null,
    };
    if (
      !id
      || !source
      || !clientFollowUpRecordSha256Matches(
        { ...released, sourceAnchor: row.sourceAnchor ?? null },
        text(source.contentSha256, 64),
      )
    ) return [];
    return [{ id, ...released, contentSha256: source.contentSha256 as string }];
  });
  if (tasks.length !== bodyTasks.length || goals.length !== bodyGoals.length) return null;
  return { body, tasks, goals };
}

export async function loadPriorSessionFollowThroughByRoomId(input: {
  prisma: FollowThroughClient;
  actor: SessionAccessActor;
  rooms: FollowThroughRoomIdentity[];
}): Promise<Record<string, PriorSessionFollowThrough>> {
  const targets = input.rooms.filter((room) => room.projectId && room.booking?.clientUserId);
  const projectIds = [...new Set(targets.flatMap((room) => room.projectId ? [room.projectId] : []))];
  if (!input.actor.id || projectIds.length === 0) return {};

  const candidates: Array<FollowThroughRoomIdentity & { outputs: any[] }> = await input.prisma.callRoom.findMany({
    where: {
      projectId: { in: projectIds },
      ...sessionActorAccessWhere(input.actor),
      outputs: { some: { kind: "CLIENT_FOLLOW_UP", status: "RELEASED" } },
    },
    select: {
      id: true,
      title: true,
      purpose: true,
      projectId: true,
      scheduledStart: true,
      endedAt: true,
      createdAt: true,
      booking: { select: { clientUserId: true, coachUserId: true } },
      outputs: {
        where: { kind: "CLIENT_FOLLOW_UP", status: "RELEASED" },
        orderBy: [{ releasedAt: "desc" }, { updatedAt: "desc" }],
        take: 10,
        select: {
          id: true,
          kind: true,
          status: true,
          createdByUserId: true,
          recipientUserId: true,
          title: true,
          intro: true,
          nextSessionFocus: true,
          bodyJson: true,
          sourceManifestJson: true,
          contentSha256: true,
          revision: true,
          releasedAt: true,
          recipient: { select: { name: true, primaryEmail: true } },
        },
      },
    },
  });

  const selections = targets.flatMap((target) => {
    const booking = target.booking;
    if (!booking?.coachUserId) return [];
    const viewerRole = input.actor.id === booking.clientUserId
      ? "CLIENT" as const
      : input.actor.id === booking.coachUserId
        ? "COACH" as const
        : null;
    if (!viewerRole) return [];

    const selected = candidates
      .filter((candidate) => (
        candidate.id !== target.id
        && candidate.projectId === target.projectId
        && String(candidate.purpose) === String(target.purpose)
        && candidate.booking?.clientUserId === booking.clientUserId
        && candidate.booking?.coachUserId === booking.coachUserId
        && isBefore(candidate, target)
      ))
      .flatMap((candidate) => candidate.outputs.flatMap((output: any) => {
        if (
          output.recipientUserId !== booking.clientUserId
          || output.createdByUserId !== booking.coachUserId
          || !output.releasedAt
        ) return [];
        const validated = validatedReleasedOutput(output, candidate);
        return validated ? [{ candidate, output, validated }] : [];
      }))
      .sort((left, right) => (
        right.output.releasedAt.getTime() - left.output.releasedAt.getTime()
        || right.output.revision - left.output.revision
        || right.output.id.localeCompare(left.output.id)
      ))[0];
    return selected ? [{ target, viewerRole, ...selected }] : [];
  });
  if (!selections.length) return {};

  const taskIds = [...new Set(selections.flatMap((selection) => selection.validated.tasks.map((row: any) => row.id)))];
  const goalIds = [...new Set(selections.flatMap((selection) => selection.validated.goals.map((row: any) => row.id)))];
  const clientIds = [...new Set(selections.map((selection) => selection.target.booking!.clientUserId))];
  const currentTasks = taskIds.length ? await input.prisma.actionItem.findMany({
    where: {
      id: { in: taskIds },
      assignedUserId: { in: clientIds },
      projectId: { in: projectIds },
    },
    select: {
      id: true,
      assignedUserId: true,
      projectId: true,
      title: true,
      detail: true,
      status: true,
      dueAt: true,
      completedAt: true,
      updatedAt: true,
      sourceJson: true,
    },
  }) : [];
  const currentGoals = goalIds.length ? await input.prisma.goal.findMany({
    where: {
      id: { in: goalIds },
      ownerUserId: { in: clientIds },
      projectId: { in: projectIds },
    },
    select: {
      id: true,
      ownerUserId: true,
      projectId: true,
      title: true,
      description: true,
      status: true,
      targetAt: true,
      achievedAt: true,
      updatedAt: true,
      sourceJson: true,
      progressReceipts: {
        orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
        take: 1,
        select: { id: true, kind: true, progressPercent: true, note: true, occurredAt: true },
      },
    },
  }) : [];

  const result: Record<string, PriorSessionFollowThrough> = {};
  for (const selection of selections) {
    const clientUserId = selection.target.booking!.clientUserId;
    const currentTaskById = new Map(currentTasks
      .filter((row: any) => (
        row.assignedUserId === clientUserId
        && row.projectId === selection.target.projectId
      ))
      .map((row: any) => [row.id, row]));
    const currentGoalById = new Map(currentGoals
      .filter((row: any) => (
        row.ownerUserId === clientUserId
        && row.projectId === selection.target.projectId
      ))
      .map((row: any) => [row.id, row]));
    const tasks: PriorSessionFollowThrough["tasks"] = selection.validated.tasks.map((released: any) => {
      const current: any = currentTaskById.get(released.id);
      if (!current) return {
        id: released.id,
        title: released.title,
        detail: released.detail,
        status: "UNAVAILABLE",
        dueAt: released.dueAt,
        completedAt: null,
        updatedAt: null,
        availability: "UNAVAILABLE" as const,
        changedSinceRelease: true,
        releasedStatus: released.status,
        releasedContentSha256: released.contentSha256,
      };
      const currentContent = {
        title: current.title,
        detail: current.detail,
        status: String(current.status),
        dueAt: iso(current.dueAt),
        sourceAnchor: sourceAnchorForRoom(
          readTranscriptDerivedTaskSource(current.sourceJson),
          selection.candidate.id,
        ),
      };
      return {
        id: current.id,
        title: current.title,
        detail: current.detail,
        status: String(current.status),
        dueAt: iso(current.dueAt),
        completedAt: iso(current.completedAt),
        updatedAt: iso(current.updatedAt),
        availability: "CURRENT" as const,
        changedSinceRelease: !clientFollowUpRecordSha256Matches(
          currentContent,
          released.contentSha256,
        ),
        releasedStatus: released.status,
        releasedContentSha256: released.contentSha256,
      };
    });
    const goals: PriorSessionFollowThrough["goals"] = selection.validated.goals.map((released: any) => {
      const current: any = currentGoalById.get(released.id);
      if (!current) return {
        id: released.id,
        title: released.title,
        description: released.description,
        status: "UNAVAILABLE",
        targetAt: released.targetAt,
        achievedAt: null,
        updatedAt: null,
        availability: "UNAVAILABLE" as const,
        changedSinceRelease: true,
        progressedSinceRelease: false,
        releasedStatus: released.status,
        releasedContentSha256: released.contentSha256,
        latestProgress: null,
      };
      const currentContent = {
        title: current.title,
        description: current.description,
        status: String(current.status),
        targetAt: iso(current.targetAt),
        sourceAnchor: sourceAnchorForRoom(
          readTranscriptDerivedGoalSource(current.sourceJson),
          selection.candidate.id,
        ),
      };
      const progress = current.progressReceipts?.[0] || null;
      const progressedSinceRelease = Boolean(
        progress?.occurredAt
        && progress.occurredAt.getTime() > selection.output.releasedAt.getTime()
      );
      return {
        id: current.id,
        title: current.title,
        description: current.description,
        status: String(current.status),
        targetAt: iso(current.targetAt),
        achievedAt: iso(current.achievedAt),
        updatedAt: iso(current.updatedAt),
        availability: "CURRENT" as const,
        changedSinceRelease: !clientFollowUpRecordSha256Matches(
          currentContent,
          released.contentSha256,
        ),
        progressedSinceRelease,
        releasedStatus: released.status,
        releasedContentSha256: released.contentSha256,
        latestProgress: progress ? {
          id: progress.id,
          kind: progress.kind,
          progressPercent: progress.progressPercent,
          note: progress.note,
          occurredAt: progress.occurredAt.toISOString(),
        } : null,
      };
    });
    const unavailableCount = [...tasks, ...goals].filter((row) => row.availability === "UNAVAILABLE").length;
    const changedSinceReleaseCount = [
      ...tasks.map((row) => row.changedSinceRelease),
      ...goals.map((row) => row.changedSinceRelease || row.progressedSinceRelease),
    ].filter(Boolean).length;
    result[selection.target.id] = {
      schema: SESSION_FOLLOW_THROUGH_SCHEMA,
      viewerRole: selection.viewerRole,
      sourceRoom: {
        id: selection.candidate.id,
        title: selection.candidate.title || "Previous coaching Session",
        projectId: selection.candidate.projectId!,
        scheduledStart: iso(selection.candidate.scheduledStart),
      },
      output: {
        id: selection.output.id,
        title: text(selection.validated.body.title, 500),
        intro: text(selection.validated.body.intro, 4_000) || null,
        nextSessionFocus: text(selection.validated.body.nextSessionFocus, 4_000) || null,
        contentSha256: selection.output.contentSha256,
        revision: selection.output.revision,
        releasedAt: selection.output.releasedAt.toISOString(),
        recipientLabel: selection.output.recipient?.name
          || selection.output.recipient?.primaryEmail
          || "Client",
      },
      tasks,
      goals,
      summary: {
        openTaskCount: tasks.filter((row) => row.status === "OPEN").length,
        completedTaskCount: tasks.filter((row) => row.status === "DONE").length,
        activeGoalCount: goals.filter((row) => row.status === "ACTIVE").length,
        achievedGoalCount: goals.filter((row) => row.status === "ACHIEVED").length,
        changedSinceReleaseCount,
        unavailableCount,
      },
      relationship: "same-project-purpose-client-and-coach",
      canOpenWork: selection.viewerRole === "CLIENT",
      canonicalRecordsMutated: false,
      currentSessionMutated: false,
      externalSideEffects: false,
    };
  }
  return result;
}
