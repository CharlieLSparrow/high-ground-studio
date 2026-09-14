import Link from "next/link";
import { CalendarClock, CheckCircle2, CircleAlert, ClipboardCheck, ListChecks, Radio, Target } from "lucide-react";
import { tagChipColors } from "@/lib/tag-color";

import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";
import { listProjectsVisibleToEmail } from "@/lib/server/home-nest";
import { loadClientFollowUpAttention } from "@/lib/server/client-follow-up-attention";
import { mobileSessionScheduledTimezone } from "@/lib/server/mobile-capture-session-schedule";
import { personalOrSharedSessionTaskAccessWhere } from "@/lib/server/task-access";

import { StudioAccessShell } from "../studio-access-shell";
import { formatScheduleDateTime } from "../schedule/schedule-model";
import { buildTodayView, type TodayTag } from "./today-model";

// Kept outside page.tsx so integration tests can import the actor-scoped loader.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Today - Quipsly",
  description: "Your upcoming session, daily plan, tasks, and goals in one place.",
};

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time needs review";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatTime(value: string, timezone: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time needs review";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  } catch {
    return formatDateTime(value);
  }
}

function roomAccess(userId: string) {
  return {
    OR: [
      { createdByUserId: userId },
      { participants: { some: { userId, accessStatus: "ACTIVE" } } },
      { booking: { clientUserId: userId } },
      { booking: { coachUserId: userId } },
    ],
  };
}

export async function loadToday(userId: string, actorEmail: string) {
  const prisma = getPrismaClient() as any;
  const now = new Date();
  const access = roomAccess(userId);
  const visibleProjects = actorEmail ? await listProjectsVisibleToEmail(actorEmail, prisma) : [];
  const visibleProjectIds = new Set(visibleProjects.map((project) => project.id));
  const [clientFollowUpAttention, sessions, tasks, goals, planBlocks] = await Promise.all([
    loadClientFollowUpAttention(prisma, userId),
    prisma.callRoom.findMany({
      where: {
        ...access,
        scheduledStart: { gte: new Date(now.getTime() - 15 * 60 * 1000) },
        status: { notIn: ["CANCELED", "FAILED"] },
      },
      orderBy: [{ scheduledStart: "asc" }, { updatedAt: "desc" }],
      take: 10,
      select: {
        id: true,
        title: true,
        purpose: true,
        scheduledStart: true,
        scheduledEnd: true,
        metadataJson: true,
        booking: { select: { timezone: true } },
        project: { select: { id: true, name: true, slug: true } },
      },
    }),
    prisma.actionItem.findMany({
      where: {
        status: "OPEN",
        OR: personalOrSharedSessionTaskAccessWhere(userId),
      },
      orderBy: [{ dueAt: "asc" }, { updatedAt: "desc" }],
      take: 100,
      select: {
        id: true,
        title: true,
        detail: true,
        dueAt: true,
        reminder: { select: { remindAt: true, status: true } },
        createdAt: true,
        sourceJson: true,
        room: { select: { id: true, title: true } },
        project: { select: { id: true, name: true, slug: true } },
        tagLinks: {
          orderBy: { tag: { label: "asc" } },
          select: { tag: { select: { id: true, slug: true, label: true, hexColor: true } } },
        },
      },
    }),
    prisma.goal.findMany({
      where: { ownerUserId: userId, status: "ACTIVE" },
      orderBy: [{ targetAt: "asc" }, { updatedAt: "desc" }],
      take: 20,
      select: {
        id: true,
        title: true,
        targetAt: true,
        updatedAt: true,
        project: { select: { id: true, name: true, slug: true } },
        tagLinks: {
          orderBy: { tag: { label: "asc" } },
          select: { tag: { select: { id: true, slug: true, label: true, hexColor: true } } },
        },
      },
    }),
    prisma.workPlanBlock.findMany({
      where: {
        ownerUserId: userId,
        startsAt: { gte: new Date(now.getTime() - 36 * 60 * 60 * 1000), lte: new Date(now.getTime() + 36 * 60 * 60 * 1000) },
      },
      orderBy: [{ startsAt: "asc" }, { updatedAt: "desc" }],
      take: 30,
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        timezone: true,
        status: true,
        actionItem: {
          select: {
            id: true,
            title: true,
            status: true,
            projectId: true,
            tagLinks: {
              orderBy: { tag: { label: "asc" } },
              select: { tag: { select: { id: true, slug: true, label: true, hexColor: true } } },
            },
          },
        },
        goal: {
          select: {
            id: true,
            title: true,
            status: true,
            projectId: true,
            tagLinks: {
              orderBy: { tag: { label: "asc" } },
              select: { tag: { select: { id: true, slug: true, label: true, hexColor: true } } },
            },
          },
        },
      },
    }),
  ]);

  return buildTodayView({
    now,
    clientFollowUpAttention,
    sessions: sessions.map((item: any) => ({
      ...item,
      scheduledTimezone: mobileSessionScheduledTimezone(
        item.metadataJson,
        item.booking?.timezone,
      ),
      project: item.project && visibleProjectIds.has(item.project.id) ? item.project : null,
    })),
    tasks: tasks.map((item: any) => ({
      ...item,
      project: item.project && visibleProjectIds.has(item.project.id) ? item.project : null,
      tags: item.project && visibleProjectIds.has(item.project.id)
        ? item.tagLinks.map((link: any) => link.tag)
        : [],
    })),
    goals: goals.map((item: any) => ({
      ...item,
      project: item.project && visibleProjectIds.has(item.project.id) ? item.project : null,
      tags: item.project && visibleProjectIds.has(item.project.id)
        ? item.tagLinks.map((link: any) => link.tag)
        : [],
    })),
    planBlocks: planBlocks.map((block: any) => ({
      ...block,
      actionItem: block.actionItem ? {
        ...block.actionItem,
        tags: visibleProjectIds.has(block.actionItem.projectId)
          ? block.actionItem.tagLinks.map((link: any) => link.tag)
          : [],
      } : null,
      goal: block.goal ? {
        ...block.goal,
        tags: visibleProjectIds.has(block.goal.projectId)
          ? block.goal.tagLinks.map((link: any) => link.tag)
          : [],
      } : null,
    })),
  });
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-border bg-card p-5 text-sm font-semibold leading-6 text-foreground">{children}</div>;
}

export function TagPills({ tags }: { tags: TodayTag[] }) {
  if (!tags.length) return null;
  return (
    <ul aria-label="Tags" className="mt-2 flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <li key={tag.id}>
          <Link href={`/find?tag=${encodeURIComponent(tag.id)}`} style={tagChipColors(tag.hexColor)}
            className="inline-flex min-h-8 max-w-full items-center rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-semibold text-foreground [overflow-wrap:anywhere] hover:underline"
            aria-label={`Find work tagged ${tag.label}`}>{tag.label}</Link>
        </li>
      ))}
    </ul>
  );
}

export function TodayContent({ today }: { today: ReturnType<typeof buildTodayView> }) {
    return (
      <main className="mx-auto max-w-[1320px] space-y-7 px-2 py-2 text-foreground">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-border bg-card p-5 shadow-sm md:p-6">
          <div className="min-w-0">
            <h1 className="font-serif text-3xl font-semibold tracking-tight">Today</h1>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">Your sessions and next steps, in one place.</p>
          </div>
          <nav aria-label="Today actions" className="flex flex-wrap gap-2">
            <Link href="/schedule" className="inline-flex min-h-11 items-center rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">Calendar</Link>
            <Link href="/inbox" className="inline-flex min-h-11 items-center rounded-full border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground">Inbox</Link>
            <Link href="/work" className="inline-flex min-h-11 items-center rounded-full border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground">All tasks & goals</Link>
          </nav>
        </header>

        {today.clientFollowUpAttention ? (
          <section aria-labelledby="today-follow-up" className="rounded-3xl border border-border bg-muted/50 p-5 shadow-sm md:p-6" data-testid="today-client-follow-up-attention">
            <div className="flex items-start gap-3">
              <ClipboardCheck className="mt-1 text-primary" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">New from {today.clientFollowUpAttention.coachLabel}</p>
                <h2 id="today-follow-up" className="mt-1 font-serif text-3xl font-black">Coaching follow-up</h2>
              </div>
            </div>
            <article className="mt-4 rounded-2xl border border-border bg-card p-5">
              <p className="text-xs font-black uppercase tracking-wide text-primary">{today.clientFollowUpAttention.sessionTitle}</p>
              <h3 className="mt-2 text-xl font-black">{today.clientFollowUpAttention.title}</h3>
              <p className="mt-2 text-sm font-semibold text-foreground">Shared {formatDateTime(today.clientFollowUpAttention.releasedAt)} · {today.clientFollowUpAttention.selectedCount} item{today.clientFollowUpAttention.selectedCount === 1 ? "" : "s"}</p>
              <Link href={today.clientFollowUpAttention.href} className="mt-4 inline-flex min-h-11 items-center rounded-full bg-primary px-4 py-2.5 text-xs font-black uppercase tracking-wide text-primary-foreground">Open follow-up</Link>
              <p className="mt-3 text-xs font-semibold leading-5 text-primary">Your session notes and next steps are together in the shared space.</p>
            </article>
          </section>
        ) : null}

        <section aria-labelledby="today-session" className="rounded-3xl border border-border bg-muted/50 p-5 shadow-sm md:p-6">
          <div className="flex items-start gap-3"><Radio className="mt-1 text-primary" aria-hidden="true" /><div className="min-w-0"><p className="text-xs font-black uppercase tracking-[0.18em] text-primary">Up next</p><h2 id="today-session" className="mt-1 font-serif text-3xl font-black">Session</h2></div></div>
          {today.nextSession ? <article className="mt-4 rounded-2xl border border-border bg-card p-5"><h3 className="text-xl font-black">{today.nextSession.title}</h3><p className="mt-2 text-sm font-bold text-foreground">{formatScheduleDateTime(today.nextSession.scheduledStart, today.nextSession.scheduledTimezone)}</p>{today.nextSession.project && <p className="mt-1 text-xs font-bold text-primary">Nest: {today.nextSession.project.name}</p>}<Link href={`/sessions/${encodeURIComponent(today.nextSession.id)}`} className="mt-4 inline-flex rounded-full bg-primary px-4 py-2.5 text-xs font-black uppercase tracking-wide text-primary-foreground">Open Session</Link></article> : <Empty>No upcoming sessions. Schedule one from your calendar.</Empty>}
        </section>

        <div className="grid gap-7 md:grid-cols-2">
          <section aria-labelledby="today-plan" className="rounded-3xl border border-border bg-card p-5 shadow-sm md:p-6">
            <div className="flex items-start gap-3"><CalendarClock className="mt-1 text-primary" aria-hidden="true" /><div><p className="text-xs font-black uppercase tracking-[0.18em] text-primary">On your calendar</p><h2 id="today-plan" className="mt-1 font-serif text-3xl font-black">Your plan</h2></div></div>
            {today.planBlocks.length ? <ol className="mt-4 space-y-3">{today.planBlocks.map((block) => <li key={block.id} className="rounded-2xl border border-border bg-muted/50 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wide text-primary">{formatTime(block.startsAt, block.timezone)}–{formatTime(block.endsAt, block.timezone)} · {block.targetType}</p><Link href={`/work?${block.targetType === "task" ? "task" : "goal"}=${encodeURIComponent(block.targetId)}`} className="mt-1 block text-base font-black hover:underline">{block.title}</Link><TagPills tags={block.tags} /></div>{block.status === "COMPLETED" && <CheckCircle2 className="text-primary" aria-label="Completed" />}</div></li>)}</ol> : <Empty>Your day is open. Add time for a task or goal in Calendar.</Empty>}
          </section>

          <section aria-labelledby="today-attention" className="rounded-3xl border border-border bg-card p-5 shadow-sm md:p-6">
            <div className="flex items-start gap-3"><ListChecks className="mt-1 text-primary" aria-hidden="true" /><div><p className="text-xs font-black uppercase tracking-[0.18em] text-primary">Next steps</p><h2 id="today-attention" className="mt-1 font-serif text-3xl font-black">Tasks</h2></div></div>
            {today.tasks.length ? <ul className="mt-4 space-y-3">{today.tasks.map((task) => <li key={task.id} className="rounded-2xl border border-border bg-muted/50 p-4"><p className="text-[10px] font-black uppercase tracking-wide text-primary">{task.reason}</p><Link href={`/work?task=${encodeURIComponent(task.id)}`} className="mt-1 block text-base font-black hover:underline">{task.title}</Link>{task.reminderAt && <p className="mt-1 text-xs font-black text-primary">Reminder {formatDateTime(task.reminderAt)}</p>}<TagPills tags={task.tags} />{task.project && <p className="mt-1 text-xs font-bold text-foreground">Nest: {task.project.name}</p>}{task.sessionTitle && <p className="mt-1 text-xs font-bold text-foreground">Session: {task.sessionTitle}</p>}</li>)}</ul> : <Empty>No tasks due soon. You can browse all your tasks or add a new one.</Empty>}
          </section>
        </div>

        <section aria-labelledby="today-goals" className="rounded-3xl border border-border bg-card p-5 shadow-sm md:p-6">
          <div className="flex items-start gap-3"><Target className="mt-1 text-primary" aria-hidden="true" /><div><p className="text-xs font-black uppercase tracking-[0.18em] text-primary">Keep going</p><h2 id="today-goals" className="mt-1 font-serif text-3xl font-black">Active goals</h2></div></div>
          {today.goals.length ? <div className="mt-4 grid gap-3 md:grid-cols-2">{today.goals.map((goal) => <article key={goal.id} className="rounded-2xl border border-border bg-muted/50 p-4"><Link href={`/work?goal=${encodeURIComponent(goal.id)}`} className="text-lg font-black hover:underline">{goal.title}</Link><TagPills tags={goal.tags ?? []} /><p className="mt-2 text-xs font-bold text-primary">{goal.targetAt ? `Target ${formatDateTime(goal.targetAt)}` : "No target date"}</p>{goal.project && <p className="mt-1 text-xs font-bold text-foreground">Nest: {goal.project.name}</p>}</article>)}</div> : <Empty>What would you like to work toward? Add a goal to get started.</Empty>}
        </section>

      </main>
    );
}

export default async function TodayPage() {
  const session = await auth();
  if (!session?.user?.id) return <StudioAccessShell mode="signed-out" redirectTo="/today" />;
  try {
    const actorEmail = (session.user.primaryEmail || session.user.email || "").trim().toLowerCase();
    return <TodayContent today={await loadToday(session.user.id, actorEmail)} />;
  } catch (error) {
    console.error("[today] failed to load actor-scoped continuation", error);
    return <main className="mx-auto grid min-h-[70vh] max-w-3xl place-items-center px-4 py-10 text-foreground"><section role="status" aria-label="Today unavailable" className="w-full rounded-3xl border border-border bg-muted/50 p-7"><CircleAlert className="h-8 w-8 text-primary" aria-hidden="true" /><p className="mt-5 text-xs font-black uppercase tracking-wide text-primary">Connection problem</p><h1 className="mt-2 font-serif text-3xl font-black">Couldn’t load your day</h1><p className="mt-3 font-semibold text-foreground">Your work is still saved. Please try again.</p><Link href="/today" className="mt-5 inline-flex rounded-full border border-border bg-card px-5 py-2.5 text-xs font-black uppercase tracking-wide text-primary">Try again</Link></section></main>;
  }
}
