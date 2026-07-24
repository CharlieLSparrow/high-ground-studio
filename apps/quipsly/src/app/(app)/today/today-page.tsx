import Link from "next/link";
import { CalendarClock, CheckCircle2, CircleAlert, Inbox, ListChecks, Radio, Target } from "lucide-react";

import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";
import { listProjectsVisibleToEmail } from "@/lib/server/home-nest";

import { StudioAccessShell } from "../studio-access-shell";
import { buildTodayView, type TodayTag } from "./today-model";

// Kept outside page.tsx so integration tests can import the actor-scoped loader.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Today - Quipsly",
  description: "A bounded plan of the next session, chosen focus, committed follow-through, and active goals.",
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
      { participants: { some: { userId } } },
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
  const [sessions, tasks, goals, planBlocks] = await Promise.all([
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
        project: { select: { id: true, name: true, slug: true } },
      },
    }),
    prisma.actionItem.findMany({
      where: {
        status: "OPEN",
        OR: [
          { assignedUserId: userId },
          { room: access },
          { booking: { OR: [{ clientUserId: userId }, { coachUserId: userId }] } },
        ],
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
          select: { tag: { select: { id: true, slug: true, label: true } } },
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
          select: { tag: { select: { id: true, slug: true, label: true } } },
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
              select: { tag: { select: { id: true, slug: true, label: true } } },
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
              select: { tag: { select: { id: true, slug: true, label: true } } },
            },
          },
        },
      },
    }),
  ]);

  return buildTodayView({
    now,
    sessions: sessions.map((item: any) => ({
      ...item,
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
  return <div className="rounded-2xl border border-dashed border-[#d8c7a7] bg-white/55 p-5 text-sm font-semibold leading-6 text-[#765f40]">{children}</div>;
}

function TagPills({ tags }: { tags: TodayTag[] }) {
  if (!tags.length) return null;
  return (
    <ul aria-label="Tags" className="mt-2 flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <li key={tag.id} className="rounded-full border border-[#d8c7a7] bg-white px-2.5 py-1 text-[10px] font-black text-[#6f542f]">
          {tag.label}
        </li>
      ))}
    </ul>
  );
}

export default async function TodayPage() {
  const session = await auth();
  if (!session?.user?.id) return <StudioAccessShell mode="signed-out" redirectTo="/today" />;

  try {
    const actorEmail = (session.user.primaryEmail || session.user.email || "").trim().toLowerCase();
    const today = await loadToday(session.user.id, actorEmail);
    return (
      <main className="mx-auto max-w-[1320px] space-y-7 px-2 py-2 text-[#3d3122]">
        <header className="overflow-hidden rounded-[2rem] border border-[#dfcba6] bg-[radial-gradient(circle_at_top_right,_#f4d799,_transparent_42%),linear-gradient(135deg,#fffaf0,#f8edda)] p-6 shadow-sm md:p-8">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-[#9a6b2f]">Today</p>
          <h1 className="mt-2 max-w-4xl font-serif text-4xl font-black tracking-tight md:text-5xl">Do the next useful thing. Keep the rest quiet.</h1>
          <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-[#715a3e]">This is a bounded continuation surface: one upcoming Session, work you deliberately planned, at most three evidence-backed attention items, and two active goals. It is not an accumulated guilt list.</p>
          <nav aria-label="Today actions" className="mt-6 flex flex-wrap gap-2">
            <Link href="/schedule" className="rounded-full bg-[#3e2f21] px-4 py-2.5 text-xs font-black uppercase tracking-wide text-white">Plan in Calendar</Link>
            <Link href="/inbox" className="rounded-full border border-[#d9c7a5] bg-white px-4 py-2.5 text-xs font-black uppercase tracking-wide text-[#5b472f]">Review Inbox</Link>
            <Link href="/work" className="rounded-full border border-[#d9c7a5] bg-white px-4 py-2.5 text-xs font-black uppercase tracking-wide text-[#5b472f]">Open all Work</Link>
          </nav>
        </header>

        <section aria-labelledby="today-session" className="rounded-3xl border border-sky-200 bg-sky-50/55 p-5 shadow-sm md:p-6">
          <div className="flex items-start gap-3"><Radio className="mt-1 text-sky-700" aria-hidden="true" /><div className="min-w-0"><p className="text-xs font-black uppercase tracking-[0.18em] text-sky-800">Up next</p><h2 id="today-session" className="mt-1 font-serif text-3xl font-black">Session</h2></div></div>
          {today.nextSession ? <article className="mt-4 rounded-2xl border border-sky-200 bg-white p-5"><h3 className="text-xl font-black">{today.nextSession.title}</h3><p className="mt-2 text-sm font-bold text-[#765f40]">{formatDateTime(today.nextSession.scheduledStart)}</p>{today.nextSession.project && <p className="mt-1 text-xs font-bold text-sky-800">Nest: {today.nextSession.project.name}</p>}<Link href={`/sessions/${encodeURIComponent(today.nextSession.id)}`} className="mt-4 inline-flex rounded-full bg-sky-800 px-4 py-2.5 text-xs font-black uppercase tracking-wide text-white">Open Session</Link></article> : <Empty>No accessible upcoming Session is scheduled. Quipsly has not invented one to fill the card.</Empty>}
        </section>

        <div className="grid gap-7 xl:grid-cols-2">
          <section aria-labelledby="today-plan" className="rounded-3xl border border-emerald-200 bg-white p-5 shadow-sm md:p-6">
            <div className="flex items-start gap-3"><CalendarClock className="mt-1 text-emerald-700" aria-hidden="true" /><div><p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-800">Chosen focus</p><h2 id="today-plan" className="mt-1 font-serif text-3xl font-black">Your plan</h2></div></div>
            {today.planBlocks.length ? <ol className="mt-4 space-y-3">{today.planBlocks.map((block) => <li key={block.id} className="rounded-2xl border border-emerald-100 bg-emerald-50/45 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wide text-emerald-800">{formatTime(block.startsAt, block.timezone)}–{formatTime(block.endsAt, block.timezone)} · {block.targetType}</p><Link href={`/work?${block.targetType === "task" ? "task" : "goal"}=${encodeURIComponent(block.targetId)}`} className="mt-1 block text-base font-black hover:underline">{block.title}</Link><TagPills tags={block.tags} /></div>{block.status === "COMPLETED" && <CheckCircle2 className="text-emerald-700" aria-label="Completed" />}</div></li>)}</ol> : <Empty>Nothing has been deliberately placed on Today yet. Use Calendar to choose a small, honest plan.</Empty>}
          </section>

          <section aria-labelledby="today-attention" className="rounded-3xl border border-amber-200 bg-white p-5 shadow-sm md:p-6">
            <div className="flex items-start gap-3"><ListChecks className="mt-1 text-amber-700" aria-hidden="true" /><div><p className="text-xs font-black uppercase tracking-[0.18em] text-amber-800">Needs a decision</p><h2 id="today-attention" className="mt-1 font-serif text-3xl font-black">Committed work</h2></div></div>
            {today.tasks.length ? <ul className="mt-4 space-y-3">{today.tasks.map((task) => <li key={task.id} className="rounded-2xl border border-amber-100 bg-amber-50/45 p-4"><p className="text-[10px] font-black uppercase tracking-wide text-amber-800">{task.reason}</p><Link href={`/work?task=${encodeURIComponent(task.id)}`} className="mt-1 block text-base font-black hover:underline">{task.title}</Link>{task.reminderAt && <p className="mt-1 text-xs font-black text-violet-800">Reminder {formatDateTime(task.reminderAt)}</p>}<TagPills tags={task.tags} />{task.project && <p className="mt-1 text-xs font-bold text-[#806a4d]">Nest: {task.project.name}</p>}{task.sessionTitle && <p className="mt-1 text-xs font-bold text-[#806a4d]">Session: {task.sessionTitle}</p>}</li>)}</ul> : <Empty>No committed work currently meets the bounded attention rules. Ordinary open tasks remain in Work.</Empty>}
          </section>
        </div>

        <section aria-labelledby="today-goals" className="rounded-3xl border border-violet-200 bg-white p-5 shadow-sm md:p-6">
          <div className="flex items-start gap-3"><Target className="mt-1 text-violet-700" aria-hidden="true" /><div><p className="text-xs font-black uppercase tracking-[0.18em] text-violet-800">Direction, not decoration</p><h2 id="today-goals" className="mt-1 font-serif text-3xl font-black">Active goals</h2></div></div>
          {today.goals.length ? <div className="mt-4 grid gap-3 md:grid-cols-2">{today.goals.map((goal) => <article key={goal.id} className="rounded-2xl border border-violet-100 bg-violet-50/45 p-4"><Link href={`/work?goal=${encodeURIComponent(goal.id)}`} className="text-lg font-black hover:underline">{goal.title}</Link><TagPills tags={goal.tags ?? []} /><p className="mt-2 text-xs font-bold text-violet-800">{goal.targetAt ? `Target ${formatDateTime(goal.targetAt)}` : "No target date inferred"}</p>{goal.project && <p className="mt-1 text-xs font-bold text-[#806a4d]">Nest: {goal.project.name}</p>}</article>)}</div> : <Empty>No actor-owned active goals are available.</Empty>}
        </section>

        <footer className="rounded-2xl border border-[#e4d3b3] bg-[#fffaf0] p-5 text-xs font-semibold leading-5 text-[#765f40]">Today is read-only planning context. It excludes unreviewed transcript proposals and never schedules, messages, assigns, completes, delivers, or publishes anything by being opened.</footer>
      </main>
    );
  } catch (error) {
    console.error("[today] failed to load actor-scoped continuation", error);
    return <main className="mx-auto grid min-h-[70vh] max-w-3xl place-items-center px-4 py-10 text-[#3d3122]"><section role="status" aria-label="Today unavailable" className="w-full rounded-3xl border border-amber-200 bg-amber-50 p-7"><CircleAlert className="h-8 w-8 text-amber-700" aria-hidden="true" /><p className="mt-5 text-xs font-black uppercase tracking-wide text-amber-800">Private read unavailable</p><h1 className="mt-2 font-serif text-3xl font-black">Today could not be verified</h1><p className="mt-3 font-semibold text-[#765f40]">No sample work is standing in, and no saved record was changed.</p><Link href="/today" className="mt-5 inline-flex rounded-full border border-amber-300 bg-white px-5 py-2.5 text-xs font-black uppercase tracking-wide text-amber-900">Retry read</Link></section></main>;
  }
}
