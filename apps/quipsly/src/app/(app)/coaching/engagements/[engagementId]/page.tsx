import Link from "next/link";
import { ArrowLeft, CalendarDays, CheckCircle2, CircleDot, LockKeyhole, ShieldCheck, Target, UsersRound } from "lucide-react";
import { notFound } from "next/navigation";

import { CollaborationThread } from "@/components/session-thread";
import { getPrismaClient } from "@/lib/prisma";
import { coachingEngagementAccessWhere } from "@/lib/server/coaching-engagement";
import { getQuipslySession } from "@/lib/server/quipsly-session";

export const dynamic = "force-dynamic";

function personLabel(person: { name: string | null; primaryEmail: string }) {
  return person.name || person.primaryEmail;
}

export default async function CoachingEngagementPage({ params }: { params: Promise<{ engagementId: string }> }) {
  const { engagementId } = await params;
  const session = await getQuipslySession();
  if (!session?.user) {
    return <main className="min-h-full px-6 py-12"><section className="mx-auto max-w-3xl rounded-3xl border border-[#ead8b4] bg-[#fffaf0] p-8"><LockKeyhole className="text-violet-800" /><h1 className="mt-4 font-serif text-4xl font-black text-[#3d3122]">This coaching engagement is private.</h1><Link href={`/login?callbackUrl=${encodeURIComponent(`/coaching/engagements/${engagementId}`)}`} className="mt-6 inline-flex rounded-full bg-violet-800 px-5 py-3 font-black text-white">Sign in</Link></section></main>;
  }
  const prisma = getPrismaClient();
  const engagement = await prisma.coachingEngagement.findFirst({
    where: coachingEngagementAccessWhere(engagementId, session.user, "read"),
    select: {
      id: true, title: true, status: true, primaryClientUserId: true, primaryCoachUserId: true,
      project: { select: { id: true, slug: true, name: true } },
      members: { where: { status: "ACTIVE" }, orderBy: { joinedAt: "asc" }, select: { role: true, userId: true, user: { select: { name: true, primaryEmail: true } } } },
      callRooms: { orderBy: [{ scheduledStart: "desc" }, { createdAt: "desc" }], take: 100, select: { id: true, title: true, purpose: true, status: true, scheduledStart: true, scheduledEnd: true } },
      actionItems: { where: { sourceJson: { path: ["visibility"], equals: "engagement-shared" } }, orderBy: [{ status: "asc" }, { dueAt: "asc" }], take: 50, select: { id: true, title: true, status: true, dueAt: true } },
      goals: { where: { sourceJson: { path: ["visibility"], equals: "engagement-shared" } }, orderBy: [{ status: "asc" }, { updatedAt: "desc" }], take: 50, select: { id: true, title: true, status: true, targetAt: true } },
    },
  });
  if (!engagement) notFound();
  const ownMembership = engagement.members.find((member) => member.userId === session.user.id);
  const canPost = session.user.isStaff || ownMembership?.role !== "OBSERVER";

  return <main className="min-h-full bg-[#f5efe4] px-5 py-8 lg:px-10"><div className="mx-auto max-w-[92rem]"><Link href="/coaching/engagements" className="inline-flex items-center gap-2 text-sm font-black text-[#765f40]"><ArrowLeft size={16} /> All engagements</Link><header className="mt-5 rounded-[2rem] border border-[#dfcfb4] bg-[#fffdf8] p-7 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-6"><div><p className="text-xs font-black uppercase tracking-[0.22em] text-violet-800">Private coaching engagement · {engagement.status.toLowerCase()}</p><h1 className="mt-2 font-serif text-5xl font-black text-[#34291d]">{engagement.title}</h1><p className="mt-4 flex flex-wrap items-center gap-3 text-sm font-bold text-[#765f40]"><UsersRound size={17} /> {engagement.members.map((member) => `${personLabel(member.user)} · ${member.role.toLowerCase()}`).join("  /  ")}</p></div><div className="max-w-md rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold leading-6 text-emerald-900"><p className="flex items-center gap-2 font-black"><ShieldCheck size={18} /> Engagement-scoped privacy</p><p className="mt-1">Members can use this shared coaching home without receiving access to {engagement.project.name} or anyone else’s work.</p></div></div></header>
    <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(22rem,0.8fr)]"><div className="space-y-6"><section className="rounded-[1.75rem] border border-[#dfcfb4] bg-[#fffdf8] p-6"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-800">Continuity</p><h2 className="mt-2 flex items-center gap-2 font-serif text-3xl font-black text-[#3d3122]"><CalendarDays size={22} /> Sessions</h2>{engagement.callRooms.length ? <div className="mt-5 grid gap-3">{engagement.callRooms.map((room) => <Link key={room.id} href={`/sessions/${encodeURIComponent(room.id)}`} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#eadfc9] bg-white p-4 transition hover:border-violet-300"><div><p className="font-black text-[#3d3122]">{room.title || "Coaching Session"}</p><p className="mt-1 text-xs font-semibold uppercase tracking-wide text-[#8a7354]">{room.scheduledStart ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(room.scheduledStart) : "Time not set"}</p></div><span className="rounded-full bg-[#f0e7d8] px-3 py-1 text-[10px] font-black uppercase tracking-wide text-[#765f40]">{room.status.toLowerCase()}</span></Link>)}</div> : <p className="mt-4 text-[#765f40]">No Session has been attached yet.</p>}</section>
      <section className="grid gap-4 md:grid-cols-2"><div className="rounded-[1.75rem] border border-[#dfcfb4] bg-[#fffdf8] p-6"><h2 className="flex items-center gap-2 font-serif text-2xl font-black text-[#3d3122]"><Target size={20} /> Shared goals</h2>{engagement.goals.length ? <ul className="mt-4 space-y-3">{engagement.goals.map((goal) => <li key={goal.id} className="rounded-xl bg-white p-3"><p className="font-bold text-[#3d3122]">{goal.title}</p><p className="mt-1 text-xs uppercase text-[#8a7354]">{goal.status.toLowerCase()}</p></li>)}</ul> : <p className="mt-3 text-sm leading-6 text-[#765f40]">Reviewed, explicitly shared goals will stay visible across Sessions. Private coach notes never appear here.</p>}</div><div className="rounded-[1.75rem] border border-[#dfcfb4] bg-[#fffdf8] p-6"><h2 className="flex items-center gap-2 font-serif text-2xl font-black text-[#3d3122]"><CheckCircle2 size={20} /> Shared commitments</h2>{engagement.actionItems.length ? <ul className="mt-4 space-y-3">{engagement.actionItems.map((task) => <li key={task.id} className="rounded-xl bg-white p-3"><p className="flex items-start gap-2 font-bold text-[#3d3122]"><CircleDot size={16} className="mt-1 shrink-0" /> {task.title}</p><p className="mt-1 text-xs uppercase text-[#8a7354]">{task.status.toLowerCase()}</p></li>)}</ul> : <p className="mt-3 text-sm leading-6 text-[#765f40]">Reviewed commitments can follow the client between calls, reminders, calendar, and next-session preparation.</p>}</div></section></div>
      <CollaborationThread projectSlug={engagement.project.slug} threadKey={`engagement:${engagement.id}`} collaborationTitle={engagement.title} heading="Engagement thread" clientSurface="engagement-room-web" canPost={canPost} scopeLabel="Across this coaching engagement" scopeDescription="Coordinate between calls without exposing private coach notes or the surrounding Nest. Session-specific conversation remains attached to each individual call." />
    </div></div></main>;
}
