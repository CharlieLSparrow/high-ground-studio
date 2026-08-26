import Link from "next/link";
import { CircleAlert, RotateCcw } from "lucide-react";

import { getPrismaClient } from "@/lib/prisma";
import { isUnreviewedTranscriptActionItemSource } from "@high-ground/quipsly-domain/coaching-packet";
import { listProjectsVisibleToEmail } from "@/lib/server/home-nest";
import { loadLatestGoalReceiptProjection } from "@/lib/server/goal-receipt-projection";
import { personalOrSharedCoachingGoalAccessWhere } from "@/lib/server/coaching-work-access";
import { getQuipslySession } from "@/lib/server/quipsly-session";
import { personalOrSharedSessionTaskAccessWhere } from "@/lib/server/task-access";

import { StudioAccessShell } from "../studio-access-shell";
import { WorkClient } from "./work-client";
import { buildWorkSnapshot, sharedWorkRoomIds, type WorkProjectOption } from "./work-model";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Work Queue - Quipsly",
  description: "Review actor-scoped tasks, session goals, and weekly commitments with honest provenance.",
};

function safeDatabaseMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  return code === "ECONNREFUSED" || message.includes("ECONNREFUSED")
    ? "The workspace database connection is unavailable."
    : "Quipsly could not verify your private work records.";
}

function WorkUnavailableState({ message }: { message: string }) {
  return <main className="mx-auto grid min-h-[70vh] max-w-3xl place-items-center px-4 py-10 text-[#3d3122]"><section role="status" aria-label="Work queue unavailable" className="w-full rounded-3xl border border-amber-200 bg-amber-50 p-7 shadow-sm"><CircleAlert className="h-8 w-8 text-amber-700" aria-hidden="true" /><p className="mt-5 text-[10px] font-black uppercase tracking-[0.2em] text-amber-800">Persistence unavailable</p><h1 className="mt-2 font-serif text-3xl font-black">Work Queue could not be verified</h1><p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-[#765f40]">{message} No sample tasks, goals, or commitments are standing in for saved work, and nothing was changed.</p><Link href="/work" className="mt-6 inline-flex items-center gap-2 rounded-full border border-amber-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-amber-900"><RotateCcw size={15} aria-hidden="true" />Try again</Link></section></main>;
}

async function loadWork(userId: string, visibleProjectIds: string[] = []) {
  const prisma = getPrismaClient() as any;
  const bookingRows = await prisma.coachingBooking.findMany({
    where: { OR: [{ clientUserId: userId }, { coachUserId: userId }] },
    select: { id: true },
    take: 500,
  });
  const bookingIds = bookingRows.map((booking: { id: string }) => booking.id);
  const roomOr: any[] = [
    { createdByUserId: userId },
    { participants: { some: { userId, accessStatus: "ACTIVE" } } },
  ];
  if (bookingIds.length) roomOr.push({ bookingId: { in: bookingIds } });
  const roomRows = await prisma.callRoom.findMany({ where: { OR: roomOr }, select: { id: true, bookingId: true }, take: 500 });
  // Booking-backed coaching work follows the explicit client/coach relationship,
  // not generic room participation. Unbooked production rooms remain shared with
  // their participants so episode collaboration still works as expected.
  const sharedProductionRoomIds = sharedWorkRoomIds(roomRows);

  const taskOr: any[] = personalOrSharedSessionTaskAccessWhere(userId);
  const goalOr: any[] = [{ authorUserId: userId }];
  if (sharedProductionRoomIds.length) {
    taskOr.push({ roomId: { in: sharedProductionRoomIds } });
    goalOr.push({ roomId: { in: sharedProductionRoomIds } });
  }
  if (bookingIds.length) {
    goalOr.push({ bookingId: { in: bookingIds } });
  }

  const [taskRows, legacyGoalRows, canonicalGoalRows, commitmentRows] = await Promise.all([
    prisma.actionItem.findMany({
      where: { OR: taskOr },
      orderBy: [{ status: "asc" }, { dueAt: "asc" }, { updatedAt: "desc" }],
      take: 500,
      select: {
        id: true, title: true, detail: true, status: true, dueAt: true, completedAt: true, createdAt: true, updatedAt: true, assignedUserId: true, sourceJson: true,
        evidenceReceipts: { where: { kind: "TRANSCRIPT_CANDIDATE_MERGED" }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }], take: 1, select: { evidenceJson: true, occurredAt: true } },
        reminder: { select: { id: true, remindAt: true, status: true, updatedAt: true } },
        project: { select: { id: true, name: true, slug: true } },
        tagLinks: { orderBy: { createdAt: "asc" }, select: { tag: { select: { id: true, label: true, slug: true, category: true, projectId: true } } } },
        room: { select: { id: true, title: true, status: true, nestSlug: true, projectSlug: true } },
        booking: { select: { id: true, scheduledStart: true, clientUser: { select: { name: true, primaryEmail: true } }, coachUser: { select: { name: true, primaryEmail: true } }, callRoom: { select: { id: true, title: true } } } },
        engagement: { select: {
          id: true,
          members: {
            where: { userId, status: "ACTIVE", role: { in: ["CLIENT", "COACH", "SUPPORT"] } },
            take: 1,
            select: { id: true },
          },
        } },
        assignedUser: { select: { name: true, primaryEmail: true } },
        recurrenceOccurrence: { select: {
          occurrenceKey: true,
          scheduledLocalDate: true,
          series: { select: { id: true, cadence: true, frequency: true, interval: true, timezone: true, localTimeMinutes: true, status: true, updatedAt: true } },
        } },
      },
    }),
    prisma.coachingNote.findMany({
      where: { OR: goalOr },
      orderBy: { updatedAt: "desc" },
      take: 500,
      select: { id: true, title: true, body: true, sourceJson: true, createdAt: true, updatedAt: true, room: { select: { id: true, title: true } }, booking: { select: { id: true, scheduledStart: true, callRoom: { select: { id: true, title: true } } } } },
    }),
    prisma.goal.findMany({
      where: { OR: [
        ...personalOrSharedCoachingGoalAccessWhere(userId),
        ...(sharedProductionRoomIds.length ? [{ roomId: { in: sharedProductionRoomIds } }] : []),
      ] },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      take: 500,
      select: {
        id: true, ownerUserId: true, title: true, description: true, status: true, targetAt: true, achievedAt: true, sourceJson: true, createdAt: true, updatedAt: true,
        room: { select: { id: true, title: true } },
        booking: { select: { id: true, scheduledStart: true, callRoom: { select: { id: true, title: true } } } },
        engagement: { select: {
          id: true,
          members: {
            where: { userId, status: "ACTIVE", role: { in: ["CLIENT", "COACH", "SUPPORT"] } },
            take: 1,
            select: { id: true },
          },
        } },
        project: { select: { id: true, name: true, slug: true } },
        tagLinks: { orderBy: { createdAt: "asc" }, select: { tag: { select: { id: true, label: true, slug: true, category: true, projectId: true } } } },
        parent: { select: { id: true, title: true } },
        taskLinks: { take: 100, select: { relationship: true, actionItem: { select: { id: true, title: true, status: true } } } },
        _count: { select: { children: true } },
      },
    }),
    prisma.weeklyCommitment.findMany({
      where: { OR: [{ clientUserId: userId }, { reviewedByUserId: userId }] },
      orderBy: { weekStartsAt: "desc" },
      take: 104,
      select: { id: true, clientUserId: true, reviewedByUserId: true, weekStartsAt: true, commitmentOne: true, commitmentTwo: true, commitmentThree: true, supportNeeded: true, progressNotes: true, clientReviewedAt: true, coachNotes: true, status: true, reviewedAt: true, updatedAt: true, clientUser: { select: { name: true, primaryEmail: true } }, reviewedByUser: { select: { name: true, primaryEmail: true } } },
    }),
  ]);
  const goalReceiptProjection = await loadLatestGoalReceiptProjection(prisma, canonicalGoalRows.map((goal: any) => goal.id));
  const reviewSubjectIds = [...new Set([
    userId,
    ...commitmentRows
      .filter((commitment: any) => commitment.reviewedByUserId === userId || commitment.clientUserId === userId)
      .map((commitment: any) => commitment.clientUserId),
  ])];
  const reviewWindowStart = new Date(Date.now() - 8 * 86_400_000);
  const reviewWindowEnd = new Date(Date.now() + 8 * 86_400_000);
  const planBlockRows = await prisma.workPlanBlock.findMany({
    where: {
      ownerUserId: { in: reviewSubjectIds },
      startsAt: { gte: reviewWindowStart, lt: reviewWindowEnd },
    },
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    take: 1_000,
    select: {
      id: true,
      ownerUserId: true,
      actionItemId: true,
      goalId: true,
      startsAt: true,
      endsAt: true,
      status: true,
      actualMinutes: true,
    },
  });

  const visibleProjects = new Set(visibleProjectIds);
  return buildWorkSnapshot({
    tasks: taskRows.filter((task: any) => !isUnreviewedTranscriptActionItemSource(task.sourceJson)).map((task: any) => ({
      ...task,
      canEditByActor: task.assignedUserId === userId
        || Boolean(!task.engagement && task.booking?.id)
        || Boolean(task.engagement?.members?.length),
      project: task.project && visibleProjects.has(task.project.id) ? task.project : null,
      tagLinks: (task.tagLinks || []).filter((link: any) => visibleProjects.has(link.tag.projectId)),
    })),
    goals: legacyGoalRows,
    canonicalGoals: canonicalGoalRows.map((goal: any) => ({
      ...goal,
      canEditByActor: goal.ownerUserId === userId
        || Boolean(!goal.engagement && goal.booking?.id)
        || Boolean(goal.engagement?.members?.length),
      progressReceipts: [
        goalReceiptProjection.get(goal.id)?.transcriptEvidence,
        goalReceiptProjection.get(goal.id)?.progress,
      ].filter(Boolean),
      project: goal.project && visibleProjects.has(goal.project.id) ? goal.project : null,
      tagLinks: (goal.tagLinks || []).filter((link: any) => visibleProjects.has(link.tag.projectId)),
    })),
    commitments: commitmentRows,
    planBlocks: planBlockRows,
    taskLimit: 500,
    actorUserId: userId,
  });
}

async function loadProjectOptions(actorEmail: string): Promise<WorkProjectOption[]> {
  const prisma = getPrismaClient();
  const projects = await listProjectsVisibleToEmail(actorEmail, prisma);
  if (!projects.length) return [];
  const projectIds = projects.map((project) => project.id);
  const [tags, tagCandidates] = await Promise.all([
    prisma.studioTag.findMany({
      where: { projectId: { in: projectIds } },
      orderBy: [{ isActive: "desc" }, { category: "asc" }, { label: "asc" }],
      select: {
        id: true, label: true, slug: true, category: true, projectId: true, isActive: true, archivedAt: true, updatedAt: true,
        aliases: { orderBy: { createdAt: "asc" }, select: { id: true, label: true, slug: true } },
        mergedInto: { select: { id: true, label: true } },
      },
    }),
    prisma.studioTagCandidate.findMany({
      where: { projectId: { in: projectIds } },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      select: {
        id: true, projectId: true, label: true, slug: true, status: true, reviewedAt: true, updatedAt: true,
        promotedTag: { select: { id: true, label: true, slug: true } },
        evidence: {
          orderBy: { importedAt: "desc" },
          take: 3,
          select: { id: true, sourceKind: true, sourceIdentity: true, labelSnapshot: true, importedAt: true },
        },
        _count: { select: { evidence: true } },
      },
    }),
  ]);
  return projects.map((project) => ({
    id: project.id,
    name: project.name,
    slug: project.slug,
    role: project.role,
    canWrite: project.role === "OWNER" || project.role === "EDITOR",
    tags: tags.map((tag) => ({
      ...tag,
      category: String(tag.category),
      archivedAt: tag.archivedAt?.toISOString() ?? null,
      updatedAt: tag.updatedAt.toISOString(),
    })).filter((tag) => tag.projectId === project.id),
    tagCandidates: tagCandidates.filter((candidate) => candidate.projectId === project.id).map((candidate) => ({
      id: candidate.id,
      label: candidate.label,
      slug: candidate.slug,
      status: candidate.status,
      promotedTag: candidate.promotedTag,
      evidenceCount: candidate._count.evidence,
      evidence: candidate.evidence.map((evidence) => ({
        ...evidence,
        importedAt: evidence.importedAt.toISOString(),
      })),
      reviewedAt: candidate.reviewedAt?.toISOString() ?? null,
      updatedAt: candidate.updatedAt.toISOString(),
    })),
  }));
}

type WorkPageProps = {
  searchParams?: Promise<{ task?: string | string[]; goal?: string | string[]; view?: string | string[]; manage?: string | string[]; project?: string | string[] }>;
};

function focusId(value: string | string[] | undefined) {
  return typeof value === "string" && value.length <= 200 ? value.trim() : "";
}

export default async function WorkPage({ searchParams }: WorkPageProps) {
  const requestedFocus = await (searchParams ?? Promise.resolve<NonNullable<Awaited<WorkPageProps["searchParams"]>>>({}));
  const attentionRequested = requestedFocus.view === "attention";
  const manageTags = requestedFocus.manage === "tags";
  const session = await getQuipslySession();
  if (!session?.user?.id) return <StudioAccessShell mode="signed-out" redirectTo={attentionRequested ? "/work?view=attention" : manageTags ? "/work?manage=tags" : "/work"} />;
  try {
    const actorEmail = (session.user.primaryEmail || session.user.email || "").trim().toLowerCase();
    const projectOptions = actorEmail ? await loadProjectOptions(actorEmail) : [];
    const initialSnapshot = await loadWork(session.user.id, projectOptions.map((project) => project.id));
    const requestedTaskId = focusId(requestedFocus.task);
    const requestedGoalId = focusId(requestedFocus.goal);
    const requestedProjectId = focusId(requestedFocus.project);
    const requestedTaskIsAvailable = initialSnapshot.tasks.some((task) => task.id === requestedTaskId);
    const requestedGoalIsAvailable = initialSnapshot.goals.some((goal) => goal.id === requestedGoalId);
    return <WorkClient
      initialSnapshot={initialSnapshot}
      projectOptions={projectOptions}
      initialFilter={attentionRequested ? "ATTENTION" : "OPEN"}
      focusTaskId={requestedTaskIsAvailable ? requestedTaskId : null}
      focusGoalId={requestedGoalIsAvailable ? requestedGoalId : null}
      unavailableFocusKind={requestedTaskId && !requestedTaskIsAvailable
        ? "task"
        : requestedGoalId && !requestedGoalIsAvailable
          ? "goal"
          : null}
      manageTags={manageTags}
      initialProjectId={projectOptions.some((project) => project.id === requestedProjectId) ? requestedProjectId : null}
    />;
  } catch (error) {
    console.error("[work] failed to load actor-scoped work", error);
    return <WorkUnavailableState message={safeDatabaseMessage(error)} />;
  }
}
