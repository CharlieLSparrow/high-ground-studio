import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { readTranscriptDerivedGoalSource, readTranscriptDerivedTaskSource, readTranscriptMergedGoalSource, readTranscriptMergedTaskSource } from "@high-ground/quipsly-domain/transcript-derived-task";
import { buildWeeklyReview } from "@high-ground/quipsly-domain/weekly-review";

import { getPrismaClient } from "@/lib/prisma";
import { readGovernedActionSourceReference } from "@/lib/server/governed-action-runtime";
import { loadLatestGoalReceiptProjection } from "@/lib/server/goal-receipt-projection";
import { loadClientFollowUpAttention } from "@/lib/server/client-follow-up-attention";
import { editCanonicalGoalInTransaction } from "@/lib/server/canonical-goal-edit";
import { updateCanonicalTaskStatusInTransaction } from "@/lib/server/canonical-task-status";
import { editCanonicalTaskInTransaction } from "@/lib/server/canonical-task-edit";
import { isUnreviewedTranscriptActionItem } from "@/lib/server/coaching-packets";
import { listProjectsVisibleToEmail } from "@/lib/server/home-nest";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import {
  createWritingDraftFromSourceAnnotation,
  setSourceAnnotationStatus,
} from "@/lib/server/source-annotations";
import { resolveStudioProjectAccess } from "@/lib/server/studio-project-access";
import { setTaskReminderInTransaction } from "@/lib/server/task-reminders";
import {
  editTaskRecurrenceOccurrenceInTransaction,
  replaceTaskRecurrenceFromOccurrenceInTransaction,
  updateTaskRecurrenceStatusInTransaction,
} from "@/lib/server/task-recurrence";
import { isIanaTimeZone, parseRecurrenceStart, validateTaskRecurrenceRule, type TaskRecurrenceRule } from "@/lib/task-recurrence";
import { readTranscriptCorrectionDesk } from "@/lib/server/transcript-corrections";
import { createWorkPlanBlockInTransaction } from "@/lib/server/work-plan-blocks";
import {
  normalizeWeeklyCommitmentIntent,
  parseWeeklyCommitmentWeekStart,
  saveWeeklyCommitmentInTransaction,
} from "@/lib/server/weekly-commitment";

export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown, max = 200) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalizedText(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function cleanText(value: unknown, max: number) {
  return normalizedText(value).slice(0, max);
}

function revision(value: unknown) {
  const date = new Date(text(value, 80));
  return Number.isFinite(date.getTime()) ? date : null;
}

async function body(request: Request) {
  try { return record(await request.json()); } catch { return {}; }
}

function taskAccessWhere(userId: string) {
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

function roomAccessWhere(userId: string, isStaff: boolean) {
  if (isStaff) return {};
  return { OR: [
    { createdByUserId: userId },
    { participants: { some: { userId, accessStatus: "ACTIVE" } } },
    { booking: { clientUserId: userId } },
    { booking: { coachUserId: userId } },
  ] };
}

function receipts(source: Record<string, unknown>, key: string) {
  return Array.isArray(source[key])
    ? (source[key] as unknown[]).filter((item) => item && typeof item === "object" && !Array.isArray(item)).slice(-23)
    : [];
}

function responseBoundaries(taskReminderIntentProjectionComplete = false) {
  return {
    appOwnedRecords: true,
    transcriptCandidatesExcluded: true,
    externalCalendarMutated: false,
    providerMutated: false,
    recordingMutated: false,
    sourceMutated: false,
    immutableSourceAnchors: true,
    completingFocusBlockMutatesTarget: false,
    focusBlockActualTimeExplicitOnly: true,
    focusBlockPlanningAvailable: true,
    planningFocusBlockMutatesTarget: false,
    planningFocusBlockCreatesAppointment: false,
    planningFocusBlockSchedulesReminder: false,
    aiOutputRequiresHumanReview: true,
    transcriptReviewMutatesWork: false,
    transcriptReviewRequiresReleasedPlayback: true,
    tasksRankedForToday: true,
    recurrenceAppOwned: true,
    recurrenceNotificationsScheduled: false,
    canonicalReminderIntents: true,
    taskReminderIntentProjectionComplete,
    deviceNotificationsReconciled: false,
    reminderDeliveryClaimed: false,
    goalCheckInMutatesStatus: false,
    canonicalProjectTags: true,
    tagMutationExternalSideEffects: false,
    annotationResolveReopenAvailable: true,
    annotationReviewMutatesSource: false,
    annotationWritingDraftAvailable: true,
    writingDraftPrivate: true,
    writingDraftSourceMutated: false,
    writingDraftExternalSideEffects: false,
    clientFollowUpAttentionReadOnly: true,
    clientFollowUpAcknowledgementExplicit: true,
    weeklyPlanCanonical: true,
    weeklyPlanOfflineOutboxSupported: true,
    weeklyPlanMutatesTasksOrGoals: false,
    weeklyPlanExternalSideEffects: false,
  };
}

export async function GET(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user) return NextResponse.json({ ok: false, error: "Sign in before loading private Today work." }, { status: 401 });
  const prisma = getPrismaClient() as any;
  const userId = session.user.id;
  const actorEmail = text(session.user.primaryEmail || session.user.email, 320).toLowerCase();
  const now = new Date();
  try {
    const visibleProjects = actorEmail ? await listProjectsVisibleToEmail(actorEmail, prisma) : [];
    const visibleProjectIds = visibleProjects.map((project) => project.id);
    const writableProjectIds = new Set(visibleProjects
      .filter((project) => project.role === "OWNER" || project.role === "EDITOR")
      .map((project) => project.id));
    const mondayDelta = (now.getUTCDay() + 6) % 7;
    const weekStartsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - mondayDelta, 12));
    // WeeklyCommitment uses noon UTC as a stable date identity. Evidence and
    // actual-time windows still begin at midnight so Monday-morning work is not
    // silently omitted from the review.
    const reviewWindowStartsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - mondayDelta));
    const reviewWindowEndsAt = new Date(reviewWindowStartsAt.getTime() + 7 * 86_400_000);
    const [clientFollowUpAttention, taskRows, goalRows, blockRows, weeklyPlan, annotationRows, transcriptReviewRooms, reminderRows, tagRows, reviewTaskRows, reviewGoalRows] = await Promise.all([
      loadClientFollowUpAttention(prisma, userId),
      prisma.actionItem.findMany({
        where: { status: "OPEN", OR: taskAccessWhere(userId) },
        orderBy: [{ dueAt: "asc" }, { updatedAt: "desc" }],
        take: 200,
        select: {
          id: true, title: true, detail: true, status: true, dueAt: true, updatedAt: true, sourceJson: true,
          evidenceReceipts: { where: { kind: "TRANSCRIPT_CANDIDATE_MERGED" }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }], take: 1, select: { evidenceJson: true } },
          reminder: { select: { id: true, remindAt: true, status: true, updatedAt: true } },
          project: { select: { id: true, name: true, slug: true } },
          tagLinks: { orderBy: { createdAt: "asc" }, select: { tag: { select: { id: true, label: true, slug: true, projectId: true, isActive: true } } } },
          room: { select: { id: true, title: true } },
          recurrenceOccurrence: { select: {
            occurrenceKey: true,
            scheduledLocalDate: true,
            series: { select: {
              id: true, ownerUserId: true, cadence: true, frequency: true, interval: true,
              timezone: true, localTimeMinutes: true, status: true, updatedAt: true,
            } },
          } },
        },
      }),
      prisma.goal.findMany({
        where: { ownerUserId: userId, status: "ACTIVE" },
        orderBy: [{ targetAt: "asc" }, { updatedAt: "desc" }],
        take: 20,
        select: { id: true, title: true, description: true, status: true, targetAt: true, updatedAt: true, sourceJson: true, project: { select: { id: true, name: true, slug: true } }, tagLinks: { orderBy: { createdAt: "asc" }, select: { tag: { select: { id: true, label: true, slug: true, projectId: true, isActive: true } } } }, room: { select: { id: true, title: true } } },
      }),
      prisma.workPlanBlock.findMany({
        where: { ownerUserId: userId, startsAt: { gte: new Date(Math.min(reviewWindowStartsAt.getTime(), now.getTime() - 12 * 3_600_000)), lte: new Date(Math.max(reviewWindowEndsAt.getTime(), now.getTime() + 7 * 86_400_000)) }, status: { in: ["PLANNED", "COMPLETED", "SKIPPED"] } },
        orderBy: { startsAt: "asc" },
        take: 500,
        select: { id: true, actionItemId: true, goalId: true, startsAt: true, endsAt: true, timezone: true, status: true, completedAt: true, actualMinutes: true, updatedAt: true, actionItem: { select: { id: true, title: true, status: true } }, goal: { select: { id: true, title: true, status: true } } },
      }),
      prisma.weeklyCommitment.findFirst({
        where: { clientUserId: userId, status: "ACTIVE", weekStartsAt: { lte: now } },
        orderBy: { weekStartsAt: "desc" },
        select: { id: true, weekStartsAt: true, commitmentOne: true, commitmentTwo: true, commitmentThree: true, supportNeeded: true, progressNotes: true, clientReviewedAt: true, updatedAt: true },
      }),
      visibleProjectIds.length > 0 ? prisma.$queryRaw(Prisma.sql`
        SELECT annotation."id", annotation."projectId", annotation."kind", annotation."body", annotation."exactText",
               annotation."status", annotation."visibility", annotation."createdByUserId", annotation."updatedAt",
               source."title" AS "sourceTitle", project."name" AS "projectName", project."slug" AS "projectSlug",
               writing_use."documentId" AS "writingDraftDocumentId",
               writing_use."responseBlockId" AS "writingDraftResponseBlockId",
               COALESCE(array_agg(tag."label" ORDER BY tag."label") FILTER (WHERE tag."id" IS NOT NULL), ARRAY[]::text[]) AS "tagLabels"
        FROM "StudioSourceAnnotation" annotation
        JOIN "StudioSourceUnit" source ON source."id" = annotation."sourceUnitId"
        JOIN "StudioProject" project ON project."id" = annotation."projectId"
        LEFT JOIN LATERAL (
          SELECT annotation_use."documentId",
                 annotation_use."sourceJson"->>'responseBlockId' AS "responseBlockId"
          FROM "StudioSourceAnnotationUse" annotation_use
          WHERE annotation_use."annotationId" = annotation."id"
            AND annotation_use."createdByUserId" = ${userId}
            AND annotation_use."archivedAt" IS NULL
          ORDER BY annotation_use."createdAt" DESC, annotation_use."id" DESC
          LIMIT 1
        ) writing_use ON TRUE
        LEFT JOIN "StudioSourceAnnotationTag" annotation_tag ON annotation_tag."annotationId" = annotation."id"
        LEFT JOIN "StudioTag" tag ON tag."id" = annotation_tag."tagId"
        WHERE annotation."projectId" IN (${Prisma.join(visibleProjectIds)})
          AND (
            annotation."status" = 'active'
            OR (
              annotation."status" = 'resolved'
              AND annotation."createdByUserId" = ${userId}
            )
          )
          AND (annotation."visibility" = 'project' OR annotation."createdByUserId" = ${userId})
        GROUP BY annotation."id", source."title", project."name", project."slug",
                 writing_use."documentId", writing_use."responseBlockId"
        ORDER BY
          CASE WHEN annotation."status" = 'active' THEN 0 ELSE 1 END,
          annotation."updatedAt" DESC
        LIMIT 12
      `) : Promise.resolve([]),
      prisma.callRoom.findMany({
        where: {
          ...roomAccessWhere(userId, session.user.isStaff === true),
          transcriptCorrections: { some: { origin: "ai", status: "proposed" } },
        },
        orderBy: { updatedAt: "desc" },
        take: 8,
        select: { id: true, title: true },
      }),
      prisma.taskReminder.findMany({
        where: { ownerUserId: userId },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        take: 501,
        select: {
          id: true,
          actionItemId: true,
          remindAt: true,
          status: true,
          updatedAt: true,
        },
      }),
      visibleProjectIds.length > 0 ? prisma.studioTag.findMany({
        where: { projectId: { in: visibleProjectIds }, isActive: true },
        orderBy: [{ label: "asc" }, { id: "asc" }],
        take: 500,
        select: { id: true, projectId: true, slug: true, label: true, isActive: true },
      }) : Promise.resolve([]),
      prisma.actionItem.findMany({
        where: {
          assignedUserId: userId,
          OR: [
            { status: "OPEN" },
            { completedAt: { gte: reviewWindowStartsAt, lt: reviewWindowEndsAt } },
          ],
        },
        orderBy: [{ dueAt: "asc" }, { updatedAt: "desc" }],
        take: 500,
        select: { id: true, title: true, status: true, dueAt: true, completedAt: true, room: { select: { id: true, title: true } } },
      }),
      prisma.goal.findMany({
        where: { ownerUserId: userId, status: { not: "ARCHIVED" } },
        orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
        take: 200,
        select: {
          id: true, title: true, status: true, targetAt: true,
          room: { select: { id: true, title: true } },
          progressReceipts: { orderBy: { occurredAt: "desc" }, take: 20, select: { progressPercent: true, note: true, occurredAt: true } },
          taskLinks: { take: 200, select: { relationship: true, actionItemId: true } },
        },
      }),
    ]);
    const goalReceiptProjection = await loadLatestGoalReceiptProjection(prisma, goalRows.map((goal: any) => goal.id));
    const todayWindowEnd = new Date(now.getTime() + 24 * 3_600_000);
    const plannedTaskIds = new Set(blockRows
      .filter((block: any) => block.status === "PLANNED" && block.actionItem?.id && block.startsAt <= todayWindowEnd)
      .map((block: any) => block.actionItem.id));
    const tasks = taskRows.filter((task: any) => !isUnreviewedTranscriptActionItem(task)).map((task: any) => {
      const parsedSourceAnchor = readTranscriptDerivedTaskSource(task.sourceJson);
      const sourceAnchor = parsedSourceAnchor?.roomId === task.room?.id ? parsedSourceAnchor : null;
      const latestMergedEvidenceJson = task.evidenceReceipts?.[0]?.evidenceJson;
      const parsedMergedTranscriptEvidence = readTranscriptMergedTaskSource(latestMergedEvidenceJson);
      const lastMergedTranscriptEvidence = parsedMergedTranscriptEvidence ? {
        ...parsedMergedTranscriptEvidence,
        governance: readGovernedActionSourceReference(record(latestMergedEvidenceJson).governance),
      } : null;
      const dueAtMs = task.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;
      const updatedAtMs = task.updatedAt.getTime();
      const isPlanned = plannedTaskIds.has(task.id);
      const isDueSoon = dueAtMs <= now.getTime() + 24 * 3_600_000;
      const isRecentReviewedSource = Boolean(sourceAnchor) && updatedAtMs >= now.getTime() - 7 * 86_400_000;
      const projectVisible = task.project && visibleProjectIds.includes(task.project.id);
      return {
        id: task.id,
        title: task.title,
        detail: task.detail,
        status: task.status,
        isOverdue: task.status === "OPEN" && dueAtMs < now.getTime(),
        dueAt: task.dueAt?.toISOString() ?? null,
        reminder: task.reminder ? {
          id: task.reminder.id,
          actionItemId: task.id,
          remindAt: task.reminder.remindAt.toISOString(),
          status: task.reminder.status,
          updatedAt: task.reminder.updatedAt.toISOString(),
        } : null,
        updatedAt: task.updatedAt.toISOString(),
        roomId: task.room?.id ?? null,
        sessionTitle: task.room?.title ?? null,
        project: projectVisible ? task.project : null,
        canEditTags: projectVisible ? writableProjectIds.has(task.project.id) : false,
        tagIds: projectVisible ? task.tagLinks.filter((link: any) => link.tag.projectId === task.project.id).map((link: any) => link.tag.id) : [],
        tagLabels: projectVisible ? task.tagLinks.filter((link: any) => link.tag.projectId === task.project.id).map((link: any) => link.tag.label) : [],
        sourceAnchor,
        lastMergedTranscriptEvidence,
        recurrence: task.recurrenceOccurrence ? {
          seriesId: task.recurrenceOccurrence.series.id,
          occurrenceKey: task.recurrenceOccurrence.occurrenceKey,
          scheduledLocalDate: task.recurrenceOccurrence.scheduledLocalDate,
          cadence: task.recurrenceOccurrence.series.cadence,
          frequency: task.recurrenceOccurrence.series.frequency,
          interval: task.recurrenceOccurrence.series.interval,
          timezone: task.recurrenceOccurrence.series.timezone,
          localTimeMinutes: task.recurrenceOccurrence.series.localTimeMinutes,
          status: task.recurrenceOccurrence.series.status,
          updatedAt: task.recurrenceOccurrence.series.updatedAt.toISOString(),
          ownerCanManage: task.recurrenceOccurrence.series.ownerUserId === userId,
        } : null,
        todayReason: isPlanned
          ? sourceAnchor ? "Planned focus · reviewed transcript" : "Planned focus"
          : isDueSoon
            ? dueAtMs < now.getTime() ? "Overdue commitment" : "Due within 24 hours"
            : isRecentReviewedSource
              ? "Reviewed transcript follow-through"
              : null,
        _todayRank: isPlanned ? 0 : isDueSoon ? 1 : isRecentReviewedSource ? 2 : 3,
        _dueAtMs: dueAtMs,
        _updatedAtMs: updatedAtMs,
      };
    }).sort((left: any, right: any) => (
      left._todayRank - right._todayRank
      || left._dueAtMs - right._dueAtMs
      || right._updatedAtMs - left._updatedAtMs
      || left.id.localeCompare(right.id)
    )).slice(0, 20).map(({ _todayRank, _dueAtMs, _updatedAtMs, ...task }: any) => task);
    const goals = goalRows.map((goal: any) => {
      const parsedSourceAnchor = readTranscriptDerivedGoalSource(goal.sourceJson);
      const sourceAnchor = parsedSourceAnchor?.roomId === goal.room?.id ? parsedSourceAnchor : null;
      const receiptProjection = goalReceiptProjection.get(goal.id);
      const progress = receiptProjection?.progress ?? null;
      const latestMergedEvidenceJson = receiptProjection?.transcriptEvidence?.evidenceJson;
      const parsedMergedTranscriptEvidence = readTranscriptMergedGoalSource(latestMergedEvidenceJson);
      const lastMergedTranscriptEvidence = parsedMergedTranscriptEvidence ? {
        ...parsedMergedTranscriptEvidence,
        governance: readGovernedActionSourceReference(record(latestMergedEvidenceJson).governance),
      } : null;
      const projectVisible = goal.project && visibleProjectIds.includes(goal.project.id);
      return {
        id: goal.id,
        title: goal.title,
        description: goal.description,
        status: goal.status,
        targetAt: goal.targetAt?.toISOString() ?? null,
        progressPercent: progress?.progressPercent ?? null,
        progressNote: progress?.note ?? null,
        updatedAt: goal.updatedAt.toISOString(),
        roomId: goal.room?.id ?? null,
        sessionTitle: goal.room?.title ?? null,
        project: projectVisible ? goal.project : null,
        canEditTags: projectVisible ? writableProjectIds.has(goal.project.id) : false,
        tagIds: projectVisible ? goal.tagLinks.filter((link: any) => link.tag.projectId === goal.project.id).map((link: any) => link.tag.id) : [],
        tagLabels: projectVisible ? goal.tagLinks.filter((link: any) => link.tag.projectId === goal.project.id).map((link: any) => link.tag.label) : [],
        sourceAnchor,
        lastMergedTranscriptEvidence,
      };
    });
    const focusWindowStartsAt = new Date(now.getTime() - 12 * 60 * 60 * 1_000);
    const focusBlocks = blockRows.filter((block: any) => block.endsAt >= focusWindowStartsAt).slice(0, 60).flatMap((block: any) => {
      const target = block.actionItem || block.goal;
      const targetType = block.actionItem ? "task" : block.goal ? "goal" : null;
      if (!target || !targetType) return [];
      return [{ id: block.id, targetType, targetId: target.id, title: target.title, targetStatus: target.status, startsAt: block.startsAt.toISOString(), endsAt: block.endsAt.toISOString(), timezone: block.timezone, status: block.status, completedAt: block.completedAt?.toISOString() ?? null, actualMinutes: block.actualMinutes ?? null, updatedAt: block.updatedAt.toISOString() }];
    });
    const currentWeeklyPlan = weeklyPlan && weeklyPlan.weekStartsAt.toISOString().slice(0, 10) === weekStartsAt.toISOString().slice(0, 10)
      ? weeklyPlan
      : null;
    const weeklyReview = buildWeeklyReview({
      subjectUserId: userId,
      subjectLabel: session.user.name ?? actorEmail ?? null,
      relationship: "self",
      weekStartsAt: weekStartsAt.toISOString(),
      generatedAt: now.toISOString(),
      tasks: reviewTaskRows.map((task: any) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        dueAt: task.dueAt?.toISOString() ?? null,
        completedAt: task.completedAt?.toISOString() ?? null,
        roomId: task.room?.id ?? null,
        sessionTitle: task.room?.title ?? null,
      })),
      goals: reviewGoalRows.map((goal: any) => ({
        id: goal.id,
        title: goal.title,
        status: goal.status,
        targetAt: goal.targetAt?.toISOString() ?? null,
        roomId: goal.room?.id ?? null,
        sessionTitle: goal.room?.title ?? null,
        progressReceipts: (goal.progressReceipts ?? []).map((receipt: any) => ({ ...receipt, occurredAt: receipt.occurredAt.toISOString() })),
        taskLinks: (goal.taskLinks ?? []).map((link: any) => ({ taskId: link.actionItemId, relationship: link.relationship })),
      })),
      planBlocks: blockRows.map((block: any) => ({
        id: block.id,
        taskId: block.actionItemId,
        goalId: block.goalId,
        startsAt: block.startsAt.toISOString(),
        endsAt: block.endsAt.toISOString(),
        status: block.status,
        actualMinutes: block.actualMinutes ?? null,
      })),
      weeklyPlan: currentWeeklyPlan ? {
        id: currentWeeklyPlan.id,
        commitments: [currentWeeklyPlan.commitmentOne, currentWeeklyPlan.commitmentTwo, currentWeeklyPlan.commitmentThree].filter(Boolean),
        supportNeeded: currentWeeklyPlan.supportNeeded,
        progressNotes: currentWeeklyPlan.progressNotes,
        clientReviewedAt: currentWeeklyPlan.clientReviewedAt?.toISOString() ?? null,
      } : null,
    });
    const transcriptDeskResults = await Promise.allSettled(transcriptReviewRooms.map((room: any) =>
      readTranscriptCorrectionDesk({
        prisma,
        roomId: room.id,
        actor: { id: userId, email: actorEmail, isStaff: session.user.isStaff === true },
      }).then((desk) => ({ room, desk })),
    ));
    const transcriptReviews = transcriptDeskResults.flatMap((result) => {
      if (result.status !== "fulfilled" || !result.value.desk.gate.allowed) return [];
      const { room, desk } = result.value;
      return desk.segments.flatMap((segment: any) => segment.proposals.map((proposal: any) => ({
        id: proposal.id,
        roomId: room.id,
        sessionTitle: room.title || "Capture session",
        segmentId: segment.id,
        startSeconds: segment.startSeconds,
        endSeconds: segment.endSeconds,
        providerText: segment.providerText,
        providerSpeakerLabel: segment.providerSpeakerLabel,
        proposedText: proposal.correctedText,
        proposedSpeakerLabel: proposal.correctedSpeakerLabel,
        reason: proposal.reason,
        recordingAssetId: desk.playback?.recordingAssetId ?? null,
        playbackAvailable: Boolean(desk.playback),
        updatedAt: proposal.updatedAt,
      })));
    }).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, 8);
    const tagCatalogById = new Map<string, any>();
    const projectRoleById = new Map(
      visibleProjects.map((project: any) => [project.id, project.role]),
    );
    for (const tag of tagRows) tagCatalogById.set(tag.id, tag);
    for (const entity of [...taskRows, ...goalRows]) {
      if (!entity.project || !visibleProjectIds.includes(entity.project.id)) continue;
      for (const link of entity.tagLinks) tagCatalogById.set(link.tag.id, link.tag);
    }
    return NextResponse.json({
      ok: true,
      briefKind: "quipsly-mobile-today-v1",
      generatedAt: now.toISOString(),
      currentWeekStartsAt: weekStartsAt.toISOString().slice(0, 10),
      clientFollowUpAttention,
      tasks,
      goals,
      focusBlocks,
      weeklyReview,
      transcriptReviews,
      sourceAnnotations: annotationRows.map((annotation: any) => ({
        id: annotation.id,
        kind: annotation.kind,
        body: annotation.body,
        exactText: annotation.exactText,
        status: annotation.status,
        visibility: annotation.visibility,
        createdByMe: annotation.createdByUserId === userId,
        canChangeStatus:
          annotation.createdByUserId === userId
          && ["OWNER", "EDITOR"].includes(projectRoleById.get(annotation.projectId)),
        canStartWriting: ["OWNER", "EDITOR"].includes(projectRoleById.get(annotation.projectId)),
        sourceTitle: annotation.sourceTitle,
        projectName: annotation.projectName,
        projectSlug: annotation.projectSlug,
        writingDraftHref: annotation.writingDraftDocumentId
          ? `/create?project=${encodeURIComponent(annotation.projectSlug)}&document=${encodeURIComponent(annotation.writingDraftDocumentId)}${annotation.writingDraftResponseBlockId ? `&block=${encodeURIComponent(annotation.writingDraftResponseBlockId)}` : ""}`
          : null,
        tagLabels: annotation.tagLabels,
        updatedAt: annotation.updatedAt.toISOString(),
      })),
      weeklyPlan: currentWeeklyPlan ? { ...currentWeeklyPlan, weekStartsAt: currentWeeklyPlan.weekStartsAt.toISOString(), commitments: [currentWeeklyPlan.commitmentOne, currentWeeklyPlan.commitmentTwo, currentWeeklyPlan.commitmentThree].filter(Boolean), clientReviewedAt: currentWeeklyPlan.clientReviewedAt?.toISOString() ?? null, updatedAt: currentWeeklyPlan.updatedAt.toISOString(), commitmentOne: undefined, commitmentTwo: undefined, commitmentThree: undefined } : null,
      taskReminderIntents: reminderRows.slice(0, 500).map((reminder: any) => ({
        id: reminder.id,
        actionItemId: reminder.actionItemId,
        remindAt: reminder.remindAt.toISOString(),
        status: reminder.status,
        updatedAt: reminder.updatedAt.toISOString(),
      })),
      tagCatalog: [...tagCatalogById.values()]
        .sort((left: any, right: any) => left.label.localeCompare(right.label) || left.id.localeCompare(right.id))
        .map((tag: any) => ({
        id: tag.id,
        projectId: tag.projectId,
        slug: tag.slug,
        label: tag.label,
        isActive: tag.isActive,
      })),
      boundaries: responseBoundaries(reminderRows.length <= 500),
    });
  } catch (error) {
    console.error("[mobile-today] failed to load actor work", error);
    return NextResponse.json({ ok: false, error: "Quipsly could not verify private Today work." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user) return NextResponse.json({ ok: false, error: "Sign in before changing private Today work." }, { status: 401 });
  const input = await body(request);
  const action = text(input.action, 80);
  const prisma = getPrismaClient() as any;
  const userId = session.user.id;
  const now = new Date();
  if (action === "weekly-plan-save") {
    const clientRequestId = text(input.clientRequestId, 80).toLowerCase();
    const weekStartsAt = parseWeeklyCommitmentWeekStart(input.weekStartsOn, now);
    const normalized = normalizeWeeklyCommitmentIntent({
      commitmentOne: input.commitmentOne,
      commitmentTwo: input.commitmentTwo,
      commitmentThree: input.commitmentThree,
      supportNeeded: input.supportNeeded,
      progressNotes: input.progressNotes,
    });
    const expectedText = text(input.expectedUpdatedAt, 80);
    const expectedUpdatedAt = expectedText ? revision(expectedText) : null;
    const receiptId = `mobile-weekly-plan-${clientRequestId}`;
    if (
      !UUID_PATTERN.test(clientRequestId)
      || !weekStartsAt
      || !normalized.commitments[0]
      || (expectedText && !expectedUpdatedAt)
    ) {
      return NextResponse.json({
        ok: false,
        error: "Choose a valid Monday, at least one concrete commitment, and a stable phone request.",
      }, { status: 400 });
    }
    try {
      const result = await prisma.$transaction(
        (tx: any) => saveWeeklyCommitmentInTransaction(tx, {
          clientUserId: userId,
          weekStartsAt,
          commitments: normalized.commitments,
          supportNeeded: normalized.supportNeeded,
          progressNotes: normalized.progressNotes,
          clientReviewed: input.clientReviewed === true,
          expectedUpdatedAt,
          clientRequestId,
          receiptId,
          surface: "ios-capture-today",
          now,
        }),
        { isolationLevel: "Serializable" },
      );
      if (result.kind === "not-found") {
        return NextResponse.json({ ok: false, error: "This weekly record is no longer active and cannot be rewritten." }, { status: 404 });
      }
      if (result.kind === "conflict" || result.kind === "identity-conflict") {
        return NextResponse.json({ ok: false, code: "CONFLICT", error: "This weekly plan changed elsewhere. Refresh Today before saving again." }, { status: 409 });
      }
      return NextResponse.json({
        ok: true,
        action,
        id: result.commitment.id,
        weekStartsOn: weekStartsAt.toISOString().slice(0, 10),
        commitments: normalized.commitments.filter(Boolean),
        supportNeeded: normalized.supportNeeded,
        progressNotes: normalized.progressNotes,
        clientReviewed: input.clientReviewed === true,
        updatedAt: result.commitment.updatedAt.toISOString(),
        receiptId: result.receiptId,
        clientRequestId: result.clientRequestId,
        intentSha256: result.intentSha256,
        idempotentReplay: result.idempotentReplay,
        boundaries: responseBoundaries(),
      });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && String((error as { code?: unknown }).code) === "P2002") {
        return NextResponse.json({ ok: false, code: "CONFLICT", error: "This weekly plan was created elsewhere. Refresh Today before saving again." }, { status: 409 });
      }
      console.error("[mobile-today] failed to save weekly plan", error);
      return NextResponse.json({ ok: false, error: "Quipsly could not save this weekly plan. It remains protected on the phone and no external action occurred." }, { status: 503 });
    }
  }
  const id = text(input.id);
  const expected = revision(input.expectedUpdatedAt);
  if (!id || !expected) return NextResponse.json({ ok: false, error: "The Today decision is missing its record ID or revision." }, { status: 400 });
  const receiptId = randomUUID();
  try {
    if (action === "focus-create") {
      const clientRequestId = text(input.clientRequestId, 80).toLowerCase();
      const startsAtLocal = text(input.startsAtLocal, 80);
      const timezone = text(input.timezone, 100);
      const durationMinutes = Number(input.durationMinutes);
      if (!UUID_PATTERN.test(clientRequestId)
          || !startsAtLocal
          || !timezone
          || !Number.isInteger(durationMinutes)
          || durationMinutes < 15
          || durationMinutes > 720) {
        return NextResponse.json({
          ok: false,
          error: "Choose a valid local start, timezone, duration from 15 minutes to 12 hours, and stable phone request.",
        }, { status: 400 });
      }
      const focusReceiptId = `mobile-focus-create-${clientRequestId}`;
      const result = await prisma.$transaction(
        (tx: any) => createWorkPlanBlockInTransaction(tx, {
          targetType: "task",
          targetId: id,
          startsAt: startsAtLocal,
          durationMinutes,
          timezone,
          actorUserId: userId,
          surface: "ios-capture-today",
          expectedTargetUpdatedAt: expected,
          clientRequestId,
          now,
          receiptId: focusReceiptId,
        }),
        { isolationLevel: "Serializable" },
      );
      if (result.kind === "invalid") {
        return NextResponse.json({ ok: false, error: "This focus plan has an invalid time or request identity." }, { status: 400 });
      }
      if (result.kind === "not-found") {
        return NextResponse.json({ ok: false, error: "Only an accessible open committed task can be planned." }, { status: 404 });
      }
      if (result.kind === "conflict" || result.kind === "identity-conflict") {
        return NextResponse.json({ ok: false, code: "CONFLICT", error: "This task or phone request changed elsewhere. Refresh Today before planning it." }, { status: 409 });
      }
      return NextResponse.json({
        ok: true,
        action,
        id,
        planBlockId: result.planBlockId,
        startsAt: result.startsAt.toISOString(),
        endsAt: result.endsAt.toISOString(),
        updatedAt: result.updatedAt.toISOString(),
        receiptId: result.receiptId,
        clientRequestId,
        idempotentReplay: result.idempotentReplay,
        boundaries: responseBoundaries(),
      });
    }
    if (action === "task-edit") {
      const title = normalizedText(input.title);
      const normalizedDetail = normalizedText(input.detail);
      const detail = normalizedDetail || null;
      const timezone = typeof input.timezone === "string" ? input.timezone.trim() : "";
      const hasDueDecision = Object.prototype.hasOwnProperty.call(input, "dueLocal");
      const dueDecisionHasValidType = input.dueLocal === null || typeof input.dueLocal === "string";
      const dueLocal = typeof input.dueLocal === "string" ? input.dueLocal.trim() : "";
      const parsedDue = dueLocal ? parseRecurrenceStart(dueLocal, timezone) : null;
      const dueAt = parsedDue?.dueAt ?? null;
      if (!title
          || title.length > 500
          || normalizedDetail.length > 5_000
          || !hasDueDecision
          || !dueDecisionHasValidType
          || timezone.length > 100
          || dueLocal.length > 32
          || !isIanaTimeZone(timezone)
          || (dueLocal && !parsedDue)) {
        return NextResponse.json({
          ok: false,
          error: "Use a title under 500 characters, detail under 5,000 characters, and a valid local due date.",
        }, { status: 400 });
      }
      if (dueAt && Math.abs(dueAt.getTime() - now.getTime()) > 10 * 365 * 86_400_000) {
        return NextResponse.json({
          ok: false,
          error: "Choose a due date within ten years.",
        }, { status: 400 });
      }

      const result = await prisma.$transaction(
        (tx: any) => editCanonicalTaskInTransaction({
          tx,
          taskId: id,
          actorUserId: userId,
          expectedUpdatedAt: expected,
          title,
          detail,
          dueAt,
          dueIntent: parsedDue ? {
            requestedLocalDateTime: parsedDue.requestedLocalDateTime,
            resolvedLocalDateTime: parsedDue.resolvedLocalDateTime,
            dstResolution: parsedDue.dstResolution,
            timezone: parsedDue.timezone,
          } : null,
          surface: "ios-capture-today",
          now,
          receiptId,
        }),
        { isolationLevel: "Serializable" },
      );
      if (result.kind === "not-found") {
        return NextResponse.json({
          ok: false,
          error: "Only the assigned task owner can edit this task.",
        }, { status: 404 });
      }
      if (result.kind === "closed") {
        return NextResponse.json({
          ok: false,
          error: "Reopen this task before editing its contents or due date.",
        }, { status: 400 });
      }
      if (result.kind === "recurring") {
        return NextResponse.json({
          ok: false,
          error: "Use the repeating-task editor so Quipsly can preserve the series history.",
        }, { status: 400 });
      }
      if (result.kind === "immutable-history") {
        return NextResponse.json({
          ok: false,
          error: "A superseded historical task cannot be rewritten. Use its replacement task instead.",
        }, { status: 400 });
      }
      if (result.kind === "conflict") {
        return NextResponse.json({
          ok: false,
          code: "CONFLICT",
          error: "This task changed elsewhere. Refresh before editing again.",
        }, { status: 409 });
      }
      return NextResponse.json({
        ok: true,
        action,
        id,
        title: result.record.title,
        detail: result.record.detail,
        dueAt: result.record.dueAt?.toISOString() ?? null,
        updatedAt: result.record.updatedAt.toISOString(),
        receiptId: result.receiptId,
        boundaries: responseBoundaries(),
      });
    }
    if (action === "goal-edit") {
      const title = normalizedText(input.title);
      const normalizedDescription = normalizedText(input.description);
      const description = normalizedDescription || null;
      const targetDecision = text(input.targetDecision, 20);
      const timezone = typeof input.timezone === "string" ? input.timezone.trim() : "";
      const hasTargetDecision = Object.prototype.hasOwnProperty.call(input, "targetLocalDate");
      const targetDecisionHasValidType = input.targetLocalDate === null
        || typeof input.targetLocalDate === "string";
      const targetLocalDate = typeof input.targetLocalDate === "string"
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
      if (!title
          || title.length > 500
          || normalizedDescription.length > 5_000
          || !hasTargetDecision
          || !targetDecisionHasValidType
          || !targetDecisionValid
          || !targetPayloadMatchesDecision
          || timezone.length > 100
          || (targetDecision === "SET" && !isIanaTimeZone(timezone))
          || !targetFormatValid
          || (targetLocalDate && !parsedTarget)) {
        return NextResponse.json({
          ok: false,
          error: "Use a title under 500 characters, description under 5,000 characters, and a valid target date.",
        }, { status: 400 });
      }
      if (targetAt && Math.abs(targetAt.getTime() - now.getTime()) > 20 * 365 * 86_400_000) {
        return NextResponse.json({
          ok: false,
          error: "Choose a target date within twenty years.",
        }, { status: 400 });
      }

      const result = await prisma.$transaction(
        (tx: any) => editCanonicalGoalInTransaction({
          tx,
          goalId: id,
          actorUserId: userId,
          expectedUpdatedAt: expected,
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
          surface: "ios-capture-work",
          now,
          receiptId,
        }),
        { isolationLevel: "Serializable" },
      );
      if (result.kind === "not-found") {
        return NextResponse.json({
          ok: false,
          error: "Only the goal owner can edit this goal.",
        }, { status: 404 });
      }
      if (result.kind === "closed") {
        return NextResponse.json({
          ok: false,
          error: "Make this goal active or paused before editing its definition or target.",
        }, { status: 400 });
      }
      if (result.kind === "conflict") {
        return NextResponse.json({
          ok: false,
          code: "CONFLICT",
          error: "This goal changed elsewhere. Refresh before editing again.",
        }, { status: 409 });
      }
      return NextResponse.json({
        ok: true,
        action,
        id,
        title: result.record.title,
        description: result.record.description,
        targetAt: result.record.targetAt?.toISOString() ?? null,
        updatedAt: result.record.updatedAt.toISOString(),
        receiptId: result.receiptId,
        boundaries: responseBoundaries(),
      });
    }
    if (action === "task-reminder") {
      const clientRequestId = text(input.clientRequestId, 80).toLowerCase();
      const timezone = text(input.timezone, 100);
      const requestedLocalDateTime = text(input.remindAtLocal, 32);
      const hasReminderDecision = Object.prototype.hasOwnProperty.call(input, "remindAtLocal");
      const parsedReminder = requestedLocalDateTime
        ? parseRecurrenceStart(requestedLocalDateTime, timezone)
        : null;
      const expectedReminderText = text(input.expectedReminderUpdatedAt, 80);
      const expectedReminderUpdatedAt = expectedReminderText
        ? revision(expectedReminderText)
        : null;
      if (!UUID_PATTERN.test(clientRequestId)
          || !hasReminderDecision
          || !isIanaTimeZone(timezone)
          || (requestedLocalDateTime && !parsedReminder)
          || (expectedReminderText && !expectedReminderUpdatedAt)) {
        return NextResponse.json({
          ok: false,
          error: "Review the reminder time, timezone, and stable phone request.",
        }, { status: 400 });
      }
      if (parsedReminder
          && (parsedReminder.dueAt.getTime() <= now.getTime()
            || parsedReminder.dueAt.getTime() - now.getTime() > 10 * 365 * 86_400_000)) {
        return NextResponse.json({
          ok: false,
          error: "Choose a future reminder within ten years.",
        }, { status: 400 });
      }

      const result = await prisma.$transaction(
        (tx: any) => setTaskReminderInTransaction({
          tx,
          taskId: id,
          actorUserId: userId,
          remindAt: parsedReminder?.dueAt ?? null,
          expectedTaskUpdatedAt: expected,
          expectedReminderUpdatedAt,
          clientRequestId,
          reminderId: `mobile-task-reminder-decision-${clientRequestId}`,
          revisionId: `task-reminder-revision-${clientRequestId}`,
          now,
          surface: "ios-capture-today",
          timezone,
          requestedLocalDateTime: parsedReminder?.requestedLocalDateTime ?? null,
        }),
        { isolationLevel: "Serializable" },
      );
      if (result.kind === "not-found") {
        return NextResponse.json({
          ok: false,
          error: "Only the assigned task owner can change this reminder.",
        }, { status: 404 });
      }
      if (result.kind === "recurring") {
        return NextResponse.json({
          ok: false,
          error: "Repeating work keeps its schedule separate. Change a one-time task reminder instead.",
        }, { status: 400 });
      }
      if (result.kind === "closed") {
        return NextResponse.json({
          ok: false,
          error: "Reopen this task before changing its reminder.",
        }, { status: 400 });
      }
      if (result.kind === "conflict" || result.kind === "identity-conflict") {
        return NextResponse.json({
          ok: false,
          code: "CONFLICT",
          error: "This reminder changed elsewhere. Refresh Today before saving again.",
        }, { status: 409 });
      }
      return NextResponse.json({
        ok: true,
        action,
        id,
        status: result.reminder.status,
        updatedAt: result.reminder.updatedAt.toISOString(),
        receiptId: result.kind === "unchanged" ? null : result.revisionId,
        idempotentReplay: result.kind === "saved" && result.idempotentReplay,
        reminder: {
          id: result.reminder.id,
          actionItemId: result.reminder.actionItemId,
          remindAt: result.reminder.remindAt.toISOString(),
          status: result.reminder.status,
          updatedAt: result.reminder.updatedAt.toISOString(),
          deviceNotificationsReconciled: false,
          delivered: false,
        },
        boundaries: responseBoundaries(),
      });
    }
    if (action === "task-status") {
      const nextStatus = text(input.nextStatus, 20).toUpperCase();
      const decisionReason = text(input.decisionReason, 50).toUpperCase();
      if (!["OPEN", "DONE", "CANCELED"].includes(nextStatus)) return NextResponse.json({ ok: false, error: "Choose a valid task status." }, { status: 400 });
      if (decisionReason && decisionReason !== "MISSED_OCCURRENCE_SKIPPED") return NextResponse.json({ ok: false, error: "Choose a valid task decision reason." }, { status: 400 });
      const result = await prisma.$transaction((tx: any) => updateCanonicalTaskStatusInTransaction({
        tx,
        taskId: id,
        actorUserId: userId,
        accessOr: taskAccessWhere(userId),
        expectedUpdatedAt: expected,
        nextStatus: nextStatus as "OPEN" | "DONE" | "CANCELED",
        decisionReason: decisionReason === "MISSED_OCCURRENCE_SKIPPED" ? decisionReason : undefined,
        surface: "ios-capture-today",
        now,
        receiptId,
      }));
      if (result.kind === "not-found") return NextResponse.json({ ok: false, error: "This committed task is not available to this account." }, { status: 404 });
      if (result.kind === "immutable-history") return NextResponse.json({ ok: false, error: "A superseded historical occurrence cannot be reopened. Use its replacement task instead." }, { status: 400 });
      if (result.kind === "not-missed") return NextResponse.json({ ok: false, error: "Only the owner can skip an overdue open recurring occurrence as missed." }, { status: 400 });
      if (result.kind === "not-next-open") return NextResponse.json({ ok: false, error: "Resolve the repeat's oldest open occurrence first so no earlier commitment is hidden." }, { status: 400 });
      if (result.kind === "conflict" || !result.record) return NextResponse.json({ ok: false, error: "This task changed elsewhere. Refresh Today before deciding again.", code: "CONFLICT" }, { status: 409 });
      return NextResponse.json({ ok: true, action, id, status: result.record.status, updatedAt: result.record.updatedAt.toISOString(), receiptId, nextOccurrenceTaskId: result.nextOccurrenceTaskId, decisionReason: decisionReason || null, boundaries: responseBoundaries() });
    }
    if (action === "recurrence-edit") {
      const scope = text(input.scope, 40).toUpperCase();
      const clientRequestId = text(input.clientRequestId, 80).toLowerCase();
      const title = cleanText(input.title, 500);
      const detail = cleanText(input.detail, 5_000) || null;
      if (!UUID_PATTERN.test(clientRequestId) || !title || !["THIS_OCCURRENCE", "THIS_AND_FUTURE"].includes(scope)) {
        return NextResponse.json({ ok: false, error: "Choose this task or this-and-future, then provide a title and stable edit request." }, { status: 400 });
      }
      if (scope === "THIS_OCCURRENCE") {
        const result = await prisma.$transaction((tx: any) => editTaskRecurrenceOccurrenceInTransaction({
          tx,
          taskId: id,
          actorUserId: userId,
          expectedTaskUpdatedAt: expected,
          clientRequestId,
          title,
          detail,
          surface: "ios-capture-today",
          now,
          receiptId: `mobile-task-occurrence-edit-${clientRequestId}`,
        }));
        if (result.kind === "not-found") return NextResponse.json({ ok: false, error: "Only the assigned owner can edit this recurring task." }, { status: 404 });
        if (result.kind === "closed") return NextResponse.json({ ok: false, error: "Completed or skipped task history cannot be rewritten. Edit the next open occurrence instead." }, { status: 400 });
        if (result.kind === "identity-conflict") return NextResponse.json({ ok: false, error: "This edit request ID already belongs to different wording." }, { status: 409 });
        if (result.kind === "conflict" || !result.persisted) return NextResponse.json({ ok: false, error: "This task changed elsewhere. Refresh Today before editing it.", code: "CONFLICT" }, { status: 409 });
        return NextResponse.json({
          ok: true,
          action,
          id,
          scope,
          updatedAt: result.persisted.updatedAt.toISOString(),
          receiptId: result.receiptId,
          reused: result.reused,
          historicalOccurrencesPreserved: true,
          boundaries: responseBoundaries(),
        });
      }

      const seriesId = text(input.seriesId);
      const expectedSeriesUpdatedAt = revision(input.expectedSeriesUpdatedAt);
      const rawRule = record(input.recurrence);
      const nextRule: TaskRecurrenceRule = {
        cadence: text(rawRule.cadence, 20).toUpperCase() as TaskRecurrenceRule["cadence"],
        frequency: text(rawRule.frequency, 20).toUpperCase() as TaskRecurrenceRule["frequency"],
        interval: Number(rawRule.interval),
        timezone: text(rawRule.timezone, 100),
        localTimeMinutes: Number(rawRule.localTimeMinutes),
        anchorLocalDate: text(rawRule.anchorLocalDate, 20),
        anchorDayOfMonth: Number(text(rawRule.anchorLocalDate, 20).slice(8, 10)),
      };
      if (!seriesId || !expectedSeriesUpdatedAt || !["FIXED", "COMPLETION"].includes(nextRule.cadence)
          || !["DAILY", "WEEKLY", "MONTHLY"].includes(nextRule.frequency) || !validateTaskRecurrenceRule(nextRule)) {
        return NextResponse.json({ ok: false, error: "Review the future repeat rule, first local due time, interval, and timezone." }, { status: 400 });
      }
      const nextSeriesId = `mobile-task-series-revision-${clientRequestId}`;
      const result = await prisma.$transaction((tx: any) => replaceTaskRecurrenceFromOccurrenceInTransaction({
        tx,
        priorSeriesId: seriesId,
        anchorTaskId: id,
        actorUserId: userId,
        expectedSeriesUpdatedAt,
        expectedTaskUpdatedAt: expected,
        nextSeriesId,
        clientRequestId,
        title,
        detail,
        nextRule,
        surface: "ios-capture-today",
        now,
        receiptId: `mobile-task-recurrence-revision-${clientRequestId}`,
      }));
      if (result.kind === "not-found") return NextResponse.json({ ok: false, error: "Only the repeat owner can replace its next open horizon." }, { status: 404 });
      if (result.kind === "ended") return NextResponse.json({ ok: false, error: "This repeat already ended. Refresh Today before editing." }, { status: 400 });
      if (result.kind === "not-next-open") return NextResponse.json({ ok: false, error: "Edit this repeat from its next open occurrence so no earlier commitment is skipped." }, { status: 400 });
      if (result.kind === "identity-conflict") return NextResponse.json({ ok: false, error: "This edit request ID already belongs to a different series revision." }, { status: 409 });
      if (result.kind === "conflict") return NextResponse.json({ ok: false, error: "This repeat changed elsewhere. Refresh Today before editing it.", code: "CONFLICT" }, { status: 409 });
      return NextResponse.json({
        ok: true,
        action,
        id,
        scope,
        receiptId: result.receiptId,
        reused: result.reused,
        priorSeriesId: result.priorSeriesId,
        nextSeriesId: result.nextSeriesId,
        firstTaskId: result.firstTaskId,
        supersededTaskCount: result.supersededTaskCount,
        materializedCount: result.materializedCount,
        historicalOccurrencesPreserved: true,
        boundaries: responseBoundaries(),
      });
    }
    if (action === "recurrence-status") {
      const nextStatus = text(input.nextStatus, 20).toUpperCase();
      if (!["ACTIVE", "PAUSED", "ENDED"].includes(nextStatus)) {
        return NextResponse.json({ ok: false, error: "Choose active, paused, or ended for this repeat." }, { status: 400 });
      }
      const result = await prisma.$transaction((tx: any) => updateTaskRecurrenceStatusInTransaction({
        tx,
        seriesId: id,
        actorUserId: userId,
        expectedUpdatedAt: expected,
        nextStatus: nextStatus as "ACTIVE" | "PAUSED" | "ENDED",
        surface: "ios-capture-today",
        now,
        receiptId,
      }));
      if (result.kind === "not-found") return NextResponse.json({ ok: false, error: "Only the repeat owner can change this series." }, { status: 404 });
      if (result.kind === "ended") return NextResponse.json({ ok: false, error: "An ended repeat stays ended. Create a new series if the work should begin again." }, { status: 400 });
      if (result.kind === "conflict" || !result.persisted) return NextResponse.json({ ok: false, error: "This repeat changed elsewhere. Refresh Today before deciding again.", code: "CONFLICT" }, { status: 409 });
      return NextResponse.json({
        ok: true,
        action,
        id,
        status: result.persisted.status,
        updatedAt: result.persisted.updatedAt.toISOString(),
        receiptId,
        materializedCount: result.materializedCount,
        boundaries: responseBoundaries(),
      });
    }
    if (action === "goal-progress") {
      const progressPercent = Number(input.progressPercent);
      const note = cleanText(input.note, 2000);
      if (!Number.isInteger(progressPercent) || progressPercent < 0 || progressPercent > 100) {
        return NextResponse.json({ ok: false, error: "Choose whole-number goal progress from 0 to 100." }, { status: 400 });
      }
      const result = await prisma.$transaction(async (tx: any) => {
        const current = await tx.goal.findFirst({
          where: { id, ownerUserId: userId },
          select: { id: true, status: true, sourceJson: true, updatedAt: true },
        });
        if (!current) return { kind: "not-found" as const };
        if (current.updatedAt.getTime() !== expected.getTime()) return { kind: "conflict" as const };
        const source = record(current.sourceJson);
        const receipt = {
          id: receiptId,
          kind: "quipsly-goal-progress-v1",
          surface: "ios-capture-today",
          progressPercent,
          note: note || null,
          recordedAt: now.toISOString(),
          recordedByUserId: userId,
          externalSideEffects: false,
          goalStatusMutated: false,
        };
        const updated = await tx.goal.updateMany({
          where: { id, ownerUserId: userId, updatedAt: expected },
          data: { sourceJson: { ...source, lastProgressReceipt: receipt } },
        });
        if (updated.count !== 1) return { kind: "conflict" as const };
        await tx.goalProgressReceipt.create({
          data: {
            goalId: id,
            actorUserId: userId,
            kind: "PROGRESS",
            progressPercent,
            note: note || null,
            evidenceJson: receipt,
            occurredAt: now,
          },
        });
        return {
          kind: "saved" as const,
          record: await tx.goal.findUnique({ where: { id }, select: { status: true, updatedAt: true } }),
        };
      });
      if (result.kind === "not-found") return NextResponse.json({ ok: false, error: "Only the goal owner can record this check-in." }, { status: 404 });
      if (result.kind === "conflict" || !result.record) return NextResponse.json({ ok: false, error: "This goal changed elsewhere. Refresh Today before checking in again.", code: "CONFLICT" }, { status: 409 });
      return NextResponse.json({
        ok: true,
        action,
        id,
        status: result.record.status,
        progressPercent,
        note: note || null,
        updatedAt: result.record.updatedAt.toISOString(),
        receiptId,
        boundaries: responseBoundaries(),
      });
    }
    if (action === "focus-status") {
      const nextStatus = text(input.nextStatus, 20).toUpperCase();
      const clientRequestId = text(input.clientRequestId, 80).toLowerCase();
      const clientRequestIdWasProvided = Object.prototype.hasOwnProperty.call(input, "clientRequestId");
      const actualMinutes = Number(input.actualMinutes);
      const validActualMinutes = Number.isInteger(actualMinutes) && actualMinutes >= 1 && actualMinutes <= 1_440;
      const actualMinutesWasProvided = Object.prototype.hasOwnProperty.call(input, "actualMinutes");
      if (!["PLANNED", "COMPLETED", "SKIPPED", "CANCELED"].includes(nextStatus)
          || (clientRequestIdWasProvided && !UUID_PATTERN.test(clientRequestId))
          || (nextStatus === "COMPLETED" && actualMinutesWasProvided && !validActualMinutes)) {
        return NextResponse.json({ ok: false, error: "Choose a valid focus-block status, stable phone request, and actual minutes for completed work." }, { status: 400 });
      }
      // Build 25 predates explicit actual-time capture. Preserve that installed
      // client's ability to finish a block, but never infer actual time from the
      // plan. Current clients always send an explicit value.
      const recordedActualMinutes = nextStatus === "COMPLETED" && validActualMinutes ? actualMinutes : null;
      const focusReceiptId = clientRequestId
        ? `mobile-focus-status-${clientRequestId}`
        : receiptId;
      const result = await prisma.$transaction(async (tx: any) => {
        const current = await tx.workPlanBlock.findFirst({ where: { id, ownerUserId: userId }, select: { status: true, actualMinutes: true, sourceJson: true, updatedAt: true } });
        if (!current) return { kind: "not-found" as const };
        const source = record(current.sourceJson);
        const latestMobileFocusOperation = record(source.lastMobileFocusOperation);
        const priorReceipt = clientRequestId
          ? latestMobileFocusOperation.id === focusReceiptId
            ? latestMobileFocusOperation
            : receipts(source, "planReceipts")
              .map(record)
              .find((candidate) => candidate.id === focusReceiptId)
          : null;
        if (priorReceipt) {
          const sameIntent = priorReceipt.kind === "quipsly-work-plan-block-status-v1"
            && priorReceipt.surface === "ios-capture-today"
            && priorReceipt.clientRequestId === clientRequestId
            && priorReceipt.blockId === id
            && priorReceipt.expectedUpdatedAt === expected.toISOString()
            && priorReceipt.nextStatus === nextStatus
            && (priorReceipt.actualMinutes ?? null) === recordedActualMinutes;
          if (!sameIntent) return { kind: "identity-conflict" as const };
          if (current.status !== nextStatus || (current.actualMinutes ?? null) !== recordedActualMinutes) {
            return { kind: "conflict" as const };
          }
          return { kind: "saved" as const, idempotentReplay: true, record: current };
        }
        if (current.updatedAt.getTime() !== expected.getTime()) return { kind: "conflict" as const };
        const receipt = { id: focusReceiptId, clientRequestId: clientRequestId || null, blockId: id, expectedUpdatedAt: expected.toISOString(), kind: "quipsly-work-plan-block-status-v1", surface: "ios-capture-today", previousStatus: current.status, nextStatus, previousActualMinutes: current.actualMinutes, actualMinutes: recordedActualMinutes, actualTimeState: nextStatus !== "COMPLETED" ? "not-applicable" : recordedActualMinutes === null ? "not-recorded-legacy-client" : "recorded", changedAt: now.toISOString(), changedByUserId: userId, externalCalendarMutated: false, targetStatusMutated: false };
        const updated = await tx.workPlanBlock.updateMany({ where: { id, ownerUserId: userId, updatedAt: expected }, data: { status: nextStatus, completedAt: nextStatus === "COMPLETED" ? now : null, actualMinutes: recordedActualMinutes, sourceJson: { ...source, lastMobileFocusOperation: receipt, planReceipts: [...receipts(source, "planReceipts"), receipt] } } });
        if (updated.count !== 1) return { kind: "conflict" as const };
        return { kind: "saved" as const, idempotentReplay: false, record: await tx.workPlanBlock.findUnique({ where: { id }, select: { status: true, actualMinutes: true, updatedAt: true } }) };
      });
      if (result.kind === "not-found") return NextResponse.json({ ok: false, error: "Only the focus-block owner can change this plan." }, { status: 404 });
      if (result.kind === "conflict" || result.kind === "identity-conflict" || !result.record) return NextResponse.json({ ok: false, error: "This focus block changed elsewhere. Refresh Today before deciding again.", code: "CONFLICT" }, { status: 409 });
      return NextResponse.json({ ok: true, action, id, status: result.record.status, actualMinutes: result.record.actualMinutes, updatedAt: result.record.updatedAt.toISOString(), receiptId: focusReceiptId, clientRequestId: clientRequestId || null, idempotentReplay: result.idempotentReplay, boundaries: responseBoundaries() });
    }
    if (action === "source-annotation-draft") {
      const actorEmail = text(session.user.primaryEmail || session.user.email, 320).toLowerCase();
      const projectSlug = text(input.projectSlug, 200);
      const clientRequestId = text(input.clientRequestId, 80).toLowerCase();
      if (!actorEmail || !projectSlug || !UUID_PATTERN.test(clientRequestId)) {
        return NextResponse.json({
          ok: false,
          error: "Review the Research Nest and stable phone writing request.",
        }, { status: 400 });
      }
      const access = await resolveStudioProjectAccess({
        projectSlug,
        email: actorEmail,
        action: "write",
        prisma,
      });
      if (!access.allowed || !access.projectId) {
        return NextResponse.json({
          ok: false,
          error: "This annotation is not inside a writable Nest for this account.",
        }, { status: 404 });
      }
      const result = await createWritingDraftFromSourceAnnotation(prisma, {
        annotationId: id,
        projectId: access.projectId,
        projectSlug,
        actorUserId: userId,
        actorEmail,
        clientRequestId,
        expectedUpdatedAt: expected,
      });
      if (!result.ok) {
        const status = result.code === "CONFLICT" ? 409 : result.code === "INVALID" ? 400 : 404;
        return NextResponse.json({ ok: false, error: result.message, code: result.code }, { status });
      }
      return NextResponse.json({
        ok: true,
        action,
        id,
        clientRequestId,
        documentId: result.documentId,
        documentStableId: result.documentStableId,
        blockId: result.blockId,
        blockStableId: result.blockStableId,
        responseBlockId: result.responseBlockId,
        responseBlockStableId: result.responseBlockStableId,
        href: result.href,
        reused: result.reused,
        boundaries: responseBoundaries(),
      });
    }
    if (action === "source-annotation-status") {
      const nextStatus = text(input.nextStatus, 20).toLowerCase();
      if (!["active", "resolved", "archived"].includes(nextStatus)) return NextResponse.json({ ok: false, error: "Choose a valid annotation status." }, { status: 400 });
      const actorEmail = text(session.user.primaryEmail || session.user.email, 320).toLowerCase();
      const visibleProjects = actorEmail ? await listProjectsVisibleToEmail(actorEmail, prisma) : [];
      const writableProjectIds = visibleProjects
        .filter((project: any) => ["OWNER", "EDITOR"].includes(project.role))
        .map((project: any) => project.id);
      const available = writableProjectIds.length > 0 ? await prisma.$queryRaw(Prisma.sql`
        SELECT "id" FROM "StudioSourceAnnotation"
        WHERE "id" = ${id} AND "createdByUserId" = ${userId} AND "projectId" IN (${Prisma.join(writableProjectIds)})
        LIMIT 1
      `) : [];
      if (!Array.isArray(available) || available.length === 0) return NextResponse.json({ ok: false, error: "Only the annotation author can change an accessible source note." }, { status: 404 });
      const result = await setSourceAnnotationStatus(prisma, { annotationId: id, actorUserId: userId, expectedUpdatedAt: expected, nextStatus });
      if (!result.ok) {
        const status = result.code === "CONFLICT" ? 409 : result.code === "INVALID" ? 400 : 404;
        return NextResponse.json({ ok: false, error: result.message, code: result.code }, { status });
      }
      return NextResponse.json({ ok: true, action, id, status: nextStatus, updatedAt: result.updatedAt, boundaries: responseBoundaries() });
    }
    return NextResponse.json({ ok: false, error: "This Today action is not supported." }, { status: 400 });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";
    if (code === "P2034") {
      return NextResponse.json({
        ok: false,
        code: "CONFLICT",
        error: "This Today work changed elsewhere. Refresh before saving again.",
      }, { status: 409 });
    }
    console.error("[mobile-today] failed to save actor decision", error);
    return NextResponse.json({ ok: false, error: "Quipsly could not save this Today decision. No external action was taken." }, { status: 503 });
  }
}
