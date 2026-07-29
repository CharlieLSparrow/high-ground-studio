import { NextResponse } from "next/server";
import { readTranscriptDerivedGoalSource, readTranscriptDerivedTaskSource } from "@high-ground/quipsly-domain/transcript-derived-task";

import { getPrismaClient } from "@/lib/prisma";
import { isUnreviewedTranscriptActionItemSource } from "@high-ground/quipsly-domain/coaching-packet";
import { listProjectsVisibleToEmail } from "@/lib/server/home-nest";
import { nestProjectGoalWhere, nestProjectTaskWhere } from "@/lib/server/nest-project-follow-through";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { sourceLabelForNestKind } from "@/lib/studio/project-registry";

export const dynamic = "force-dynamic";

function cleanText(value: unknown, max = 320) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function excerpt(value: string, max = 240) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max - 1).trimEnd()}…` : normalized;
}

function projectShape(project: {
  id: string;
  slug: string;
  name: string;
  sourceLabel: string | null;
  updatedAt: Date;
  role: string;
}) {
  return {
    id: project.id,
    slug: project.slug,
    name: project.name,
    role: project.role,
    canWrite: project.role === "OWNER" || project.role === "EDITOR",
    isHomeNest: project.sourceLabel === sourceLabelForNestKind("home"),
    updatedAt: project.updatedAt.toISOString(),
  };
}

export async function GET(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user) {
    return NextResponse.json(
      { ok: false, error: "Sign in before loading private project work." },
      { status: 401 },
    );
  }

  const actorEmail = cleanText(session.user.primaryEmail || session.user.email).toLowerCase();
  const actorUserId = session.user.id;
  const prisma = getPrismaClient();
  const visibleProjects = actorEmail ? await listProjectsVisibleToEmail(actorEmail, prisma) : [];
  const requestedProjectId = cleanText(new URL(request.url).searchParams.get("projectId"), 160);
  const selectedProject = requestedProjectId
    ? visibleProjects.find((project) => project.id === requestedProjectId)
    : visibleProjects[0];

  if (requestedProjectId && !selectedProject) {
    return NextResponse.json(
      { ok: false, code: "WORK_PROJECT_FORBIDDEN", error: "That project is not available to this account." },
      { status: 404 },
    );
  }

  const projects = visibleProjects.map(projectShape);
  if (!selectedProject) {
    return NextResponse.json({
      ok: true,
      workspaceKind: "quipsly-mobile-work-v1",
      generatedAt: new Date().toISOString(),
      projects,
      selectedProjectId: null,
      workspace: null,
      boundaries: {
        actorScoped: true,
        explicitProjectGrantRequired: true,
        protectedOfflineSnapshotSupported: true,
        canonicalProjectRecords: true,
        unreviewedTranscriptCandidatesExcluded: true,
        externalSideEffects: false,
      },
    });
  }

  const project = projectShape(selectedProject);
  const [taskRows, goalRows, noteRows, tagRows] = await Promise.all([
    prisma.actionItem.findMany({
      where: nestProjectTaskWhere(selectedProject.id, selectedProject.slug, actorUserId),
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }, { dueAt: "asc" }],
      take: 100,
      select: {
        id: true,
        title: true,
        detail: true,
        status: true,
        dueAt: true,
        updatedAt: true,
        sourceJson: true,
        project: { select: { id: true, name: true, slug: true } },
        room: { select: { id: true, title: true } },
        reminder: { select: { id: true, remindAt: true, status: true, updatedAt: true } },
        recurrenceOccurrence: {
          select: {
            occurrenceKey: true,
            scheduledLocalDate: true,
            series: {
              select: {
                id: true,
                ownerUserId: true,
                cadence: true,
                frequency: true,
                interval: true,
                timezone: true,
                localTimeMinutes: true,
                status: true,
                updatedAt: true,
              },
            },
          },
        },
        tagLinks: {
          where: { tag: { projectId: selectedProject.id } },
          orderBy: { createdAt: "asc" },
          select: { tag: { select: { id: true, label: true } } },
        },
      },
    }),
    prisma.goal.findMany({
      where: nestProjectGoalWhere(selectedProject.id, actorUserId),
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }, { targetAt: "asc" }],
      take: 60,
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        targetAt: true,
        updatedAt: true,
        sourceJson: true,
        project: { select: { id: true, name: true, slug: true } },
        room: { select: { id: true, title: true } },
        progressReceipts: {
          orderBy: { occurredAt: "desc" },
          take: 1,
          select: { progressPercent: true, note: true },
        },
        tagLinks: {
          where: { tag: { projectId: selectedProject.id } },
          orderBy: { createdAt: "asc" },
          select: { tag: { select: { id: true, label: true } } },
        },
      },
    }),
    prisma.studioDocument.findMany({
      where: {
        projectId: selectedProject.id,
        sourceLabel: { contains: "document-kind:note", mode: "insensitive" },
      },
      orderBy: { updatedAt: "desc" },
      take: 60,
      select: {
        id: true,
        stableId: true,
        title: true,
        tagRevision: true,
        updatedAt: true,
        blocks: {
          where: { archivedAt: null },
          orderBy: { order: "asc" },
          take: 4,
          select: { id: true, order: true, title: true, body: true },
        },
        tagLinks: {
          where: { tag: { projectId: selectedProject.id } },
          orderBy: { createdAt: "asc" },
          select: { tag: { select: { id: true, label: true } } },
        },
      },
    }),
    prisma.studioTag.findMany({
      where: { projectId: selectedProject.id },
      orderBy: [{ isActive: "desc" }, { label: "asc" }, { id: "asc" }],
      take: 500,
      select: {
        id: true,
        projectId: true,
        slug: true,
        label: true,
        isActive: true,
      },
    }),
  ]);

  const tasks = taskRows
    .filter((task) => !isUnreviewedTranscriptActionItemSource(task.sourceJson))
    .map((task) => {
      const parsedSource = readTranscriptDerivedTaskSource(task.sourceJson);
      const sourceAnchor = parsedSource?.roomId === task.room?.id ? parsedSource : null;
      return {
        id: task.id,
        title: task.title,
        detail: task.detail,
        status: task.status,
        isOverdue: task.status === "OPEN" && Boolean(task.dueAt && task.dueAt < new Date()),
        dueAt: task.dueAt?.toISOString() ?? null,
        updatedAt: task.updatedAt.toISOString(),
        roomId: task.room?.id ?? null,
        sessionTitle: task.room?.title ?? null,
        project: task.project?.id === selectedProject.id
          ? task.project
          : { id: selectedProject.id, name: selectedProject.name, slug: selectedProject.slug },
        canEditTags: project.canWrite,
        tagIds: task.tagLinks.map((link) => link.tag.id),
        tagLabels: task.tagLinks.map((link) => link.tag.label),
        sourceAnchor,
        todayReason: null,
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
          ownerCanManage: task.recurrenceOccurrence.series.ownerUserId === actorUserId,
        } : null,
        reminder: task.reminder ? {
          id: task.reminder.id,
          actionItemId: task.id,
          remindAt: task.reminder.remindAt.toISOString(),
          status: task.reminder.status,
          updatedAt: task.reminder.updatedAt.toISOString(),
        } : null,
      };
    });

  const goals = goalRows.map((goal) => {
    const parsedSource = readTranscriptDerivedGoalSource(goal.sourceJson);
    const sourceAnchor = parsedSource?.roomId === goal.room?.id ? parsedSource : null;
    return {
      id: goal.id,
      title: goal.title,
      description: goal.description,
      status: goal.status,
      targetAt: goal.targetAt?.toISOString() ?? null,
      progressPercent: goal.progressReceipts[0]?.progressPercent ?? null,
      progressNote: goal.progressReceipts[0]?.note ?? null,
      updatedAt: goal.updatedAt.toISOString(),
      roomId: goal.room?.id ?? null,
      sessionTitle: goal.room?.title ?? null,
      project: goal.project ?? { id: selectedProject.id, name: selectedProject.name, slug: selectedProject.slug },
      canEditTags: project.canWrite,
      tagIds: goal.tagLinks.map((link) => link.tag.id),
      tagLabels: goal.tagLinks.map((link) => link.tag.label),
      sourceAnchor,
    };
  });

  const notes = noteRows.map((note) => {
    const bodyBlocks = note.blocks.filter((block) => block.order > 0 || block.title !== "Note Title");
    const noteText = bodyBlocks.map((block) => block.body).join("\n\n") || note.blocks.map((block) => block.body).join("\n\n");
    const tags = note.tagLinks.map((link) => link.tag);
    return {
      id: note.id,
      stableId: note.stableId,
      title: note.title,
      excerpt: excerpt(noteText),
      tagRevision: note.tagRevision,
      updatedAt: note.updatedAt.toISOString(),
      canEditTags: project.canWrite,
      tagIds: tags.map((tag) => tag.id),
      tagLabels: tags.map((tag) => tag.label),
      webPath: `/create?project=${encodeURIComponent(selectedProject.slug)}&document=${encodeURIComponent(note.id)}`,
    };
  });

  const usageCounts = new Map<string, number>();
  for (const entity of [...tasks, ...goals, ...notes]) {
    for (const tagId of entity.tagIds) {
      usageCounts.set(tagId, (usageCounts.get(tagId) ?? 0) + 1);
    }
  }
  const tags = tagRows.map((tag) => ({
    id: tag.id,
    projectId: tag.projectId,
    slug: tag.slug,
    label: tag.label,
    isActive: tag.isActive,
    usageCount: usageCounts.get(tag.id) ?? 0,
  }));

  return NextResponse.json({
    ok: true,
    workspaceKind: "quipsly-mobile-work-v1",
    generatedAt: new Date().toISOString(),
    projects,
    selectedProjectId: selectedProject.id,
    workspace: { project, tasks, goals, notes, tags },
    boundaries: {
      actorScoped: true,
      ownedGoalsOnly: true,
      explicitProjectGrantRequired: true,
      protectedOfflineSnapshotSupported: true,
      canonicalProjectRecords: true,
      canonicalProjectTags: true,
      unreviewedTranscriptCandidatesExcluded: true,
      mutationsUseExistingProtectedOutboxes: true,
      sourceMutated: false,
      externalSideEffects: false,
    },
  });
}
