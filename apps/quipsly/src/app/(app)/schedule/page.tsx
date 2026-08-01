import Link from "next/link";
import {
  CalendarDays,
  ChevronRight,
  CircleAlert,
  Clock3,
  ListTodo,
  Radio,
  Play,
} from "lucide-react";
import { readTranscriptDerivedGoalSource, readTranscriptDerivedTaskSource } from "@high-ground/quipsly-domain/transcript-derived-task";

import { TagSearchChips } from "@/components/tag-search-chips";
import { getPrismaClient } from "@/lib/prisma";
import {
  loadCalendarOverviewForActor,
  type CalendarOverview,
  type CalendarPurposeOverview,
} from "@/lib/server/calendar-overview";
import { listProjectsVisibleToEmail } from "@/lib/server/home-nest";
import { isUnreviewedTranscriptActionItem } from "@/lib/server/coaching-packets";
import { mobileSessionScheduledTimezone } from "@/lib/server/mobile-capture-session-schedule";
import { getQuipslySession } from "@/lib/server/quipsly-session";
import { normalizeAccessEmail } from "@/lib/server/studio-project-access";

import {
  collapseTaskRecurrenceForCalendar,
  formatScheduleDateTime,
  formatScheduleMediaTime,
  humanizeScheduleValue,
  type SchedulePlanBlock,
  type SchedulePlanTarget,
  type ScheduleSession,
  type ScheduleSnapshot,
  type ScheduleTag,
  type ScheduleTask,
} from "./schedule-model";
import { SchedulePlanner } from "./schedule-planner";
import { CalendarSubscriptionManager } from "./calendar-subscription-manager";
import { GoogleCalendarConnectionManager } from "./google-calendar-connection-manager";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Calendar - Quipsly",
  description: "Plan private focus blocks beside upcoming Sessions with explicit provider-calendar receipt truth.",
};

function safeDatabaseMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const code = typeof error === "object" && error && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
  if (code === "ECONNREFUSED" || message.includes("ECONNREFUSED")) {
    return "The workspace database connection is unavailable.";
  }
  return "Quipsly could not read the private Calendar.";
}

function accessibleRoomWhere(userId: string) {
  return {
    OR: [
      { createdByUserId: userId },
      { participants: { some: { userId } } },
      { booking: { clientUserId: userId } },
      { booking: { coachUserId: userId } },
    ],
  };
}

function scheduleTags(tagLinks: Array<{ tag: ScheduleTag }> | undefined): ScheduleTag[] {
  return (tagLinks ?? []).map(({ tag }) => tag);
}

function CalendarTags({ tags }: { tags: ScheduleTag[] }) {
  return <TagSearchChips tags={tags} />;
}

async function loadSchedule(): Promise<ScheduleSnapshot> {
  const session = await getQuipslySession();
  const signedInEmail = normalizeAccessEmail(
    session?.user?.primaryEmail || session?.user?.email,
  );
  if (!session?.user?.id) {
    return {
      state: "signed-out",
      message: "Sign in to see private Sessions, accepted work, and personal focus plans.",
    };
  }

  const prisma = getPrismaClient() as any;

  try {
    const projects = signedInEmail ? await listProjectsVisibleToEmail(signedInEmail, prisma) : [];
    const projectIds = projects.map((project) => project.id);
    const workspaceIds = [...new Set(projects.map((project) => project.workspaceId).filter(Boolean))];
    const userId = session.user.id;
    const roomAccess = accessibleRoomWhere(userId);
    const visibleTagLinks = {
      where: { tag: { projectId: { in: projectIds } } },
      orderBy: { createdAt: "asc" },
      take: 12,
      select: { tag: { select: { id: true, label: true, isActive: true } } },
    };

    const [roomRows, taskRows, goalRows, planBlockRows, calendarOverview, calendarFeedRows] = await Promise.all([
      prisma.callRoom.findMany({
            where: {
              ...roomAccess,
              scheduledStart: { not: null },
              // Keep canceled Sessions visible long enough to reconcile a
              // previously projected provider event. Failed Sessions have no
              // valid calendar representation.
              status: { not: "FAILED" },
            },
            orderBy: [{ scheduledStart: "asc" }, { updatedAt: "desc" }],
            take: 30,
            select: {
              id: true,
              title: true,
              purpose: true,
              projectId: true,
              status: true,
              scheduledStart: true,
              scheduledEnd: true,
              metadataJson: true,
              booking: {
                select: {
                  timezone: true,
                  clientUser: { select: { name: true, primaryEmail: true } },
                  coachUser: { select: { name: true, primaryEmail: true } },
                },
              },
              calendarLinks: {
                orderBy: { createdAt: "desc" },
                take: 1,
                select: { status: true, provider: true, providerEventId: true },
              },
              tagLinks: visibleTagLinks,
            },
          }),
      prisma.actionItem.findMany({
            where: {
              status: "OPEN",
              OR: [
                { assignedUserId: userId },
                { room: roomAccess },
                {
                  booking: {
                    OR: [{ clientUserId: userId }, { coachUserId: userId }],
                  },
                },
              ],
            },
            orderBy: [{ status: "asc" }, { dueAt: "asc" }, { updatedAt: "desc" }],
            take: 100,
            select: {
              id: true,
              title: true,
              detail: true,
              status: true,
              dueAt: true,
              reminder: { select: { remindAt: true, status: true } },
              sourceJson: true,
              recurrenceOccurrence: { select: { seriesId: true } },
              room: { select: { id: true, title: true } },
              booking: { select: { callRoom: { select: { title: true } } } },
              tagLinks: visibleTagLinks,
            },
          }),
      prisma.goal.findMany({
        where: { ownerUserId: userId, status: "ACTIVE" },
        orderBy: [{ targetAt: "asc" }, { updatedAt: "desc" }],
        take: 200,
        select: { id: true, title: true, status: true, targetAt: true, sourceJson: true, room: { select: { id: true } }, tagLinks: visibleTagLinks },
      }),
      prisma.workPlanBlock.findMany({
        where: { ownerUserId: userId, startsAt: { gte: new Date(Date.now() - 14 * 86_400_000) } },
        orderBy: [{ startsAt: "asc" }, { updatedAt: "desc" }],
        take: 300,
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          timezone: true,
          status: true,
          completedAt: true,
          updatedAt: true,
          actionItem: { select: { id: true, title: true, status: true, sourceJson: true, room: { select: { id: true } }, tagLinks: visibleTagLinks } },
          goal: { select: { id: true, title: true, status: true, sourceJson: true, room: { select: { id: true } }, tagLinks: visibleTagLinks } },
        },
      }),
      loadCalendarOverviewForActor({
        actor: { id: userId },
        visibleProjectIds: projectIds,
        visibleWorkspaceIds: workspaceIds,
        prisma,
      }),
      prisma.calendarFeed.findMany({
        where: { ownerUserId: userId },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          status: true,
          createdAt: true,
          lastGeneratedAt: true,
          collection: { select: { purpose: true, displayName: true, nestId: true } },
        },
      }),
    ]);

    const canonicalSessionProjectionRows = roomRows.length > 0
      ? await prisma.calendarProjection.findMany({
          where: {
            sourceType: "CallRoom",
            sourceId: { in: roomRows.map((room: any) => room.id) },
            collection: {
              OR: [
                { ownerUserId: userId },
                ...(projectIds.length > 0 ? [{ nestId: { in: projectIds } }] : []),
                ...(workspaceIds.length > 0 ? [{ workspaceId: { in: workspaceIds } }] : []),
              ],
            },
          },
          orderBy: { updatedAt: "desc" },
          select: {
            sourceId: true,
            providerEventId: true,
            status: true,
            conflictState: true,
            collection: { select: { connection: { select: { provider: true } } } },
          },
        })
      : [];
    const canonicalSessionProjectionByRoom = new Map<string, any>();
    for (const projection of canonicalSessionProjectionRows) {
      if (!canonicalSessionProjectionByRoom.has(projection.sourceId)) {
        canonicalSessionProjectionByRoom.set(projection.sourceId, projection);
      }
    }

    const now = Date.now();
    const sessions: ScheduleSession[] = roomRows
      .filter((room: any) => room.scheduledStart && room.scheduledStart.getTime() >= now - 86_400_000)
      .map((room: any) => {
        const calendar = room.calendarLinks[0] ?? null;
        const canonicalProjection = canonicalSessionProjectionByRoom.get(room.id) ?? null;
        const participant = room.booking?.clientUser || room.booking?.coachUser || null;
        return {
          id: room.id,
          title: room.title || `${humanizeScheduleValue(room.purpose)} session`,
          purpose: room.purpose,
          projectId: room.projectId,
          status: room.status,
          scheduledStart: room.scheduledStart!.toISOString(),
          scheduledEnd: room.scheduledEnd?.toISOString() ?? null,
          scheduledTimezone: mobileSessionScheduledTimezone(
            room.metadataJson,
            room.booking?.timezone,
          ),
          calendarStatus: canonicalProjection
            ? `${humanizeScheduleValue(canonicalProjection.collection.connection?.provider || "provider")} · ${canonicalProjection.conflictState !== "NONE" ? "Conflict needs review" : humanizeScheduleValue(canonicalProjection.status)}`
            : calendar
            ? `${humanizeScheduleValue(calendar.provider)} · ${humanizeScheduleValue(calendar.status)}`
            : "Quipsly schedule only",
          calendarLinked: Boolean(canonicalProjection?.providerEventId || calendar?.providerEventId),
          participantLabel: participant?.name || participant?.primaryEmail || null,
          tags: scheduleTags(room.tagLinks),
        };
      });

    const actionableTaskRows = collapseTaskRecurrenceForCalendar(
      taskRows.filter((task: any) => !isUnreviewedTranscriptActionItem(task)),
    );

    const tasks: ScheduleTask[] = actionableTaskRows
      .map((task: any) => {
        const source =
          task.sourceJson &&
          typeof task.sourceJson === "object" &&
          !Array.isArray(task.sourceJson)
            ? (task.sourceJson as Record<string, unknown>)
            : {};
        const parsedSourceAnchor = readTranscriptDerivedTaskSource(task.sourceJson);
        const sourceAnchor = parsedSourceAnchor?.roomId === task.room?.id ? parsedSourceAnchor : null;
        return {
          id: task.id,
          title: task.title,
          detail: task.detail,
          status: task.status,
          dueAt: task.dueAt?.toISOString() ?? null,
          reminderAt: task.reminder?.status === "ACTIVE"
            ? task.reminder.remindAt.toISOString()
            : null,
          sessionTitle: task.room?.title || task.booking?.callRoom?.title || null,
          provenance: sourceAnchor
            ? "Reviewed transcript timestamp"
            : source.schema === "quipsly-mobile-quick-entry-v1"
              && source.surface === "ios-capture"
            ? "iPhone capture"
            : source.source === "quipsly-task-recurrence-v1"
            ? "Recurring task"
            : typeof source.source === "string"
            ? humanizeScheduleValue(source.source)
            : "Quipsly action item",
          roomId: task.room?.id ?? null,
          sourceAnchor,
          tags: scheduleTags(task.tagLinks),
        };
      });

    const planBlocks: SchedulePlanBlock[] = planBlockRows.flatMap((block: any) => {
      const target = block.actionItem || block.goal;
      const targetType = block.actionItem ? "task" as const : block.goal ? "goal" as const : null;
      if (!target || !targetType) return [];
      const parsedSourceAnchor = block.actionItem
        ? readTranscriptDerivedTaskSource(block.actionItem.sourceJson)
        : readTranscriptDerivedGoalSource(block.goal?.sourceJson);
      const targetRoomId = block.actionItem?.room?.id ?? block.goal?.room?.id ?? null;
      const sourceAnchor = parsedSourceAnchor?.roomId === targetRoomId ? parsedSourceAnchor : null;
      return [{
        id: block.id,
        targetType,
        targetId: target.id,
        title: target.title,
        targetStatus: target.status,
        startsAt: block.startsAt.toISOString(),
        endsAt: block.endsAt.toISOString(),
        timezone: block.timezone,
        status: block.status,
        completedAt: block.completedAt?.toISOString() ?? null,
        updatedAt: block.updatedAt.toISOString(),
        roomId: targetRoomId,
        sourceAnchor,
        tags: scheduleTags(target.tagLinks),
      }];
    });

    const planTargets: SchedulePlanTarget[] = [
      ...actionableTaskRows
        .map((task: any) => {
          const parsedSourceAnchor = readTranscriptDerivedTaskSource(task.sourceJson);
          const sourceAnchor = parsedSourceAnchor?.roomId === task.room?.id ? parsedSourceAnchor : null;
          return {
            id: task.id,
            type: "task" as const,
            title: task.title,
            context: sourceAnchor
              ? `reviewed transcript ${formatScheduleMediaTime(sourceAnchor.startSeconds)}–${formatScheduleMediaTime(sourceAnchor.endSeconds)}`
              : task.room?.title || task.booking?.callRoom?.title || (task.dueAt ? `due ${formatDateTime(task.dueAt.toISOString())}` : "no deadline"),
            roomId: task.room?.id ?? null,
            sourceAnchor,
          };
        }),
      ...goalRows.map((goal: any) => {
        const parsedSourceAnchor = readTranscriptDerivedGoalSource(goal.sourceJson);
        const sourceAnchor = parsedSourceAnchor?.roomId === goal.room?.id ? parsedSourceAnchor : null;
        return {
          id: goal.id,
          type: "goal" as const,
          title: goal.title,
          context: sourceAnchor
            ? `reviewed transcript ${formatScheduleMediaTime(sourceAnchor.startSeconds)}–${formatScheduleMediaTime(sourceAnchor.endSeconds)}`
            : goal.targetAt ? `target ${goal.targetAt.toISOString().slice(0, 10)}` : "no target date",
          roomId: goal.room?.id ?? null,
          sourceAnchor,
        };
      }),
    ];

    return {
      state: "ready",
      authState: "signed-in",
      accessibleNestCount: projects.length,
      calendarOverview,
      calendarProjects: projects.map((project) => ({
        id: project.id,
        name: project.name,
        canWrite: project.role === "OWNER" || project.role === "EDITOR",
      })),
      calendarFeeds: calendarFeedRows.map((feed: any) => ({
        id: feed.id,
        purpose: feed.collection.purpose,
        displayName: feed.collection.displayName,
        projectId: feed.collection.nestId,
        status: feed.status,
        createdAt: feed.createdAt.toISOString(),
        lastGeneratedAt: feed.lastGeneratedAt?.toISOString() ?? null,
      })),
      sessions,
      tasks,
      planBlocks,
      planTargets,
    };
  } catch (error) {
    console.error("[schedule] Failed to load the work runway", error);
    return {
      state: "unavailable",
      authState: "signed-in",
      message: safeDatabaseMessage(error),
    };
  }
}

function formatDateTime(value: string | null) {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date needs review";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function EmptyCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-[#d8c7a7] bg-white/55 p-5 text-sm font-semibold leading-relaxed text-[#7a6548]">
      {children}
    </div>
  );
}

function purposeDestination(purpose: CalendarPurposeOverview["purpose"]) {
  if (purpose === "COACHING") return { href: "/coaching/sessions", label: "Open coaching sessions" };
  if (purpose === "PODCAST_PRODUCTION") return { href: "/projects", label: "Open episode Nests" };
  return { href: "#personal-planning", label: "Plan private time" };
}

function calendarStateClasses(state: CalendarPurposeOverview["state"]) {
  if (state === "connected") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (state === "attention") return "border-amber-200 bg-amber-50 text-amber-900";
  if (state === "setup-needed") return "border-sky-200 bg-sky-50 text-sky-800";
  return "border-[#decfb4] bg-[#f8f1e4] text-[#725938]";
}

function CalendarSystemOverview({ overview }: { overview: CalendarOverview }) {
  return (
    <section aria-labelledby="calendar-system-heading" className="rounded-3xl border border-[#ddc9a5] bg-[#fffaf0] p-5 shadow-sm lg:p-7">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#987443]">Calendar system</p>
          <h2 id="calendar-system-heading" className="mt-1 font-serif text-3xl font-black text-[#3d3122]">One schedule, three clear boundaries.</h2>
          <p className="mt-2 max-w-4xl text-sm font-semibold leading-relaxed text-[#765f40]">{overview.sourceOfTruth}</p>
        </div>
        <span className={`w-fit rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-wide ${overview.externalWritesEnabled ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
          {overview.externalWritesEnabled ? "Verified writes available" : "External writes held"}
        </span>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        {overview.purposes.map((purpose) => {
          const destination = purposeDestination(purpose.purpose);
          return (
            <article key={purpose.purpose} className="flex h-full flex-col rounded-2xl border border-[#e5d5b7] bg-white p-5">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-serif text-2xl font-black text-[#3d3122]">{purpose.title}</h3>
                <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wide ${calendarStateClasses(purpose.state)}`}>{purpose.stateLabel}</span>
              </div>
              <p className="mt-2 text-sm font-semibold leading-relaxed text-[#765f40]">{purpose.description}</p>
              <dl className="mt-4 space-y-3 text-xs leading-relaxed">
                <div><dt className="font-black uppercase tracking-wide text-[#987443]">Includes</dt><dd className="mt-1 font-semibold text-[#5f4b32]">{purpose.includes.join(" · ")}</dd></div>
                <div><dt className="font-black uppercase tracking-wide text-[#987443]">Never copied</dt><dd className="mt-1 font-semibold text-[#5f4b32]">{purpose.excludes.join(" · ")}</dd></div>
                <div><dt className="font-black uppercase tracking-wide text-[#987443]">Recommended</dt><dd className="mt-1 font-semibold text-[#5f4b32]">{purpose.recommendedProvider}</dd></div>
              </dl>
              <p className="mt-4 rounded-xl bg-[#f8f3e9] p-3 text-xs font-semibold leading-relaxed text-[#725938]">{purpose.fallback}</p>
              {purpose.latestReceipt && (
                <p className="mt-3 text-[11px] font-bold text-[#80694a]">
                  Latest receipt: {humanizeScheduleValue(purpose.latestReceipt.operation)} · {humanizeScheduleValue(purpose.latestReceipt.outcome)}
                  {purpose.latestReceipt.externalMutated ? " · provider changed" : " · no provider change"}
                </p>
              )}
              <Link href={destination.href} className="mt-auto pt-5 text-xs font-black text-[#76522c] hover:underline">{destination.label} <span aria-hidden="true">→</span></Link>
            </article>
          );
        })}
      </div>

      <div className={`mt-4 rounded-2xl border p-4 ${overview.managedCoaching.state === "ready" ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`} role="status">
        <p className="text-xs font-black uppercase tracking-wide text-[#5f4b32]">Managed Google Calendar</p>
        <p className="mt-1 text-sm font-semibold leading-relaxed text-[#765f40]">{overview.managedCoaching.message}</p>
        <p className="mt-1 text-xs font-bold text-[#80694a]">No provider credentials, calendar identifiers, attendee lists, or sync tokens are exposed here.</p>
      </div>
    </section>
  );
}

export default async function SchedulePage() {
  const snapshot = await loadSchedule();

  return (
    <main className="min-h-full bg-transparent px-6 py-8 lg:px-10">
      <header className="mx-auto max-w-[1500px]">
        <p className="text-xs font-black uppercase tracking-[0.24em] text-[#987443]">Calendar</p>
        <div className="mt-3 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="font-serif text-4xl font-black tracking-tight text-[#3d3122] lg:text-5xl">
              Time for the work you actually chose.
            </h1>
            <p className="mt-3 max-w-3xl text-base font-semibold leading-relaxed text-[#765f40]">
              Plan private focus blocks beside upcoming Sessions. Quipsly distinguishes your plan, a Session appointment, and an external provider event; Calendar links appear only when a receipt exists.
            </p>
          </div>
          <nav aria-label="Calendar destinations" className="flex flex-wrap gap-2">
            <Link href="/today" className="rounded-full border border-[#d9c7a5] bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-[#5b472f] shadow-sm hover:bg-[#fffaf0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700">
              Back to Today
            </Link>
            <Link href="/coaching/sessions" className="rounded-full border border-[#d9c7a5] bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-[#5b472f] shadow-sm hover:bg-[#fffaf0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700">
              Session rooms
            </Link>
            <Link href="/projects" className="rounded-full bg-[#3e2f21] px-4 py-2 text-xs font-black uppercase tracking-wide text-white shadow-sm hover:bg-[#231a12] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700">
              Open Nests
            </Link>
          </nav>
        </div>
      </header>

      {snapshot.state === "signed-out" ? (
        <section className="mx-auto mt-10 max-w-3xl rounded-3xl border border-[#ead8b4] bg-[#fffaf0] p-8" role="status">
          <CircleAlert className="h-8 w-8 text-amber-700" aria-hidden="true" />
          <h2 className="mt-4 font-serif text-3xl font-black text-[#3d3122]">The private Calendar is locked.</h2>
          <p className="mt-2 font-semibold text-[#765f40]">{snapshot.message}</p>
          <Link href="/login?callbackUrl=%2Fschedule" className="mt-5 inline-flex rounded-full bg-[#3e2f21] px-5 py-2.5 text-xs font-black uppercase tracking-wide text-white">Sign in</Link>
        </section>
      ) : snapshot.state === "unavailable" ? (
        <section className="mx-auto mt-10 max-w-3xl rounded-3xl border border-amber-200 bg-amber-50/75 p-8" role="status" aria-label="Calendar unavailable">
          <CircleAlert className="h-8 w-8 text-amber-700" aria-hidden="true" />
          <p className="mt-4 text-xs font-black uppercase tracking-[0.2em] text-amber-800">Calendar data unavailable</p>
          <h2 className="mt-2 font-serif text-3xl font-black text-[#3d3122]">No sample calendar or fake project board is standing in.</h2>
          <p className="mt-3 font-semibold leading-relaxed text-[#765f40]">{snapshot.message} Your saved work has not been changed.</p>
          <p className="mt-2 text-sm font-semibold text-[#8a7354]">Auth state: signed in. Persistence state: unavailable.</p>
          <Link href="/schedule" className="mt-5 inline-flex rounded-full border border-amber-300 bg-white px-5 py-2.5 text-xs font-black uppercase tracking-wide text-amber-900">Retry read</Link>
        </section>
      ) : (
        <div className="mx-auto mt-9 max-w-[1500px] space-y-9">
          <div className="flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-wide text-[#765f40]" aria-label="Calendar source state">
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-emerald-800">Live Quipsly data</span>
            <span className="rounded-full border border-[#e2d2b4] bg-white px-3 py-1.5">{snapshot.accessibleNestCount} accessible Nest{snapshot.accessibleNestCount === 1 ? "" : "s"}</span>
            <span className="rounded-full border border-[#e2d2b4] bg-white px-3 py-1.5">Signed in</span>
          </div>

          <CalendarSystemOverview overview={snapshot.calendarOverview} />

          <GoogleCalendarConnectionManager projects={snapshot.calendarProjects.filter((project) => project.canWrite)} sessions={snapshot.sessions} />

          <CalendarSubscriptionManager projects={snapshot.calendarProjects} initialFeeds={snapshot.calendarFeeds} />

          <div id="personal-planning">
            <SchedulePlanner initialBlocks={snapshot.planBlocks} targets={snapshot.planTargets} />
          </div>

          <section aria-labelledby="agenda-heading">
            <div className="mb-4 flex items-center gap-3">
              <span className="rounded-xl bg-sky-50 p-2 text-sky-700"><CalendarDays aria-hidden="true" /></span>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#987443]">Agenda</p>
                <h2 id="agenda-heading" className="font-serif text-3xl font-black text-[#3d3122]">Upcoming sessions</h2>
              </div>
            </div>
            {snapshot.sessions.length === 0 ? (
              <EmptyCard>No accessible upcoming capture or coaching sessions are scheduled in Quipsly.</EmptyCard>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {snapshot.sessions.map((session) => (
                  <article key={session.id} className="rounded-2xl border border-[#e5d5b7] bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-black uppercase tracking-wide text-sky-700">{humanizeScheduleValue(session.purpose)}</p>
                        <h3 className="mt-1 text-lg font-black text-[#3d3122]">{session.title}</h3>
                      </div>
                      <span className="rounded-full bg-[#f6efdf] px-2.5 py-1 text-[10px] font-black uppercase text-[#725938]">{humanizeScheduleValue(session.status)}</span>
                    </div>
                    <p className="mt-4 flex items-center gap-2 text-sm font-bold text-[#5f4b32]"><Clock3 size={16} aria-hidden="true" />{formatScheduleDateTime(session.scheduledStart, session.scheduledTimezone)}</p>
                    {session.participantLabel && <p className="mt-2 text-sm font-semibold text-[#80694a]">With {session.participantLabel}</p>}
                    <CalendarTags tags={session.tags} />
                    <p className={`mt-3 text-xs font-black ${session.calendarLinked ? "text-emerald-700" : "text-[#8a7354]"}`}>{session.calendarStatus}{session.calendarLinked ? " · receipt linked" : ""}</p>
                    <Link href={`/sessions/${session.id}`} className="mt-4 inline-flex items-center gap-1 text-xs font-black text-[#76522c] hover:underline">Open review desk <ChevronRight size={14} aria-hidden="true" /></Link>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section aria-labelledby="tasks-heading">
            <div className="mb-4 flex items-center gap-3">
              <span className="rounded-xl bg-emerald-50 p-2 text-emerald-700"><ListTodo aria-hidden="true" /></span>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#987443]">Available to plan</p>
                <h2 id="tasks-heading" className="font-serif text-3xl font-black text-[#3d3122]">Accepted tasks</h2>
              </div>
            </div>
            {snapshot.tasks.length === 0 ? (
              <EmptyCard>No committed action items are visible here. Transcript suggestions stay out until a human accepts them.</EmptyCard>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {snapshot.tasks.map((task) => (
                  <article key={task.id} className="flex gap-4 rounded-2xl border border-[#e5d5b7] bg-white p-5 shadow-sm">
                    <Radio className="mt-0.5 shrink-0 text-amber-700" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <h3 className="font-black text-[#3d3122]"><Link href={`/work?task=${encodeURIComponent(task.id)}`} className="rounded-sm hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700">{task.title}</Link></h3>
                        <span className="text-[10px] font-black uppercase tracking-wide text-[#80694a]">{humanizeScheduleValue(task.status)}</span>
                      </div>
                      {task.detail && <p className="mt-1 text-sm font-semibold leading-relaxed text-[#765f40]">{task.detail}</p>}
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold text-[#8a7354]">
                        <span>{task.dueAt ? `Due ${formatDateTime(task.dueAt)}` : "No due date"}</span>
                        {task.reminderAt && <span>Reminder {formatDateTime(task.reminderAt)}</span>}
                        {task.sessionTitle && <span>Session: {task.sessionTitle}</span>}
                        <span>Source: {task.provenance}</span>
                      </div>
                      <CalendarTags tags={task.tags} />
                      {task.sourceAnchor && task.roomId ? (
                        <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50/70 p-3">
                          <p className="text-[10px] font-black uppercase tracking-wide text-sky-800">Reviewed transcript source</p>
                          <p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-sky-950">{task.sourceAnchor.effectiveSpeakerLabelSnapshot ? `${task.sourceAnchor.effectiveSpeakerLabelSnapshot}: ` : ""}{task.sourceAnchor.effectiveTextSnapshot}</p>
                          <Link href={`/sessions/${encodeURIComponent(task.roomId)}#transcript-segment-${encodeURIComponent(task.sourceAnchor.segmentId)}`} className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-full border border-sky-300 bg-white px-3 py-2 text-xs font-black text-sky-900 hover:underline">
                            <Play size={14} aria-hidden="true" />Return to {formatScheduleMediaTime(task.sourceAnchor.startSeconds)}–{formatScheduleMediaTime(task.sourceAnchor.endSeconds)}
                          </Link>
                        </div>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <footer className="rounded-2xl border border-[#e4d3b3] bg-white p-5 text-xs font-semibold leading-5 text-[#765f40]">Calendar is Quipsly planning truth, not provider truth. It shows only the next open occurrence of each repeating series; Work retains the complete series history. A focus block never changes a task deadline or goal target. A Session shows an external provider only when its receipt is linked, and planning never sends an invitation or mutates Google Calendar.</footer>
        </div>
      )}
    </main>
  );
}
