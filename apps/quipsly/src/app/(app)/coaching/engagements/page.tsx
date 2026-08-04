import Link from "next/link";
import { ArrowRight, LockKeyhole, UsersRound } from "lucide-react";

import { getPrismaClient } from "@/lib/prisma";
import { coachingEngagementActorAccessWhere } from "@/lib/server/coaching-engagement";
import { getQuipslySession } from "@/lib/server/quipsly-session";

export const dynamic = "force-dynamic";

export default async function CoachingEngagementsPage() {
  const session = await getQuipslySession();
  if (!session?.user) {
    return <main className="min-h-full px-6 py-12"><section className="mx-auto max-w-3xl rounded-3xl border border-[#ead8b4] bg-[#fffaf0] p-8"><LockKeyhole className="text-violet-800" /><h1 className="mt-4 font-serif text-4xl font-black text-[#3d3122]">Your coaching work is private.</h1><p className="mt-3 text-[#765f40]">Sign in to open the engagements where sessions, shared follow-through, and conversation continue together.</p><Link href="/login?callbackUrl=%2Fcoaching%2Fengagements" className="mt-6 inline-flex rounded-full bg-violet-800 px-5 py-3 font-black text-white">Sign in</Link></section></main>;
  }
  const prisma = getPrismaClient();
  const engagements = await prisma.coachingEngagement.findMany({
    where: coachingEngagementActorAccessWhere(session.user, "read"),
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    take: 100,
    select: {
      id: true,
      title: true,
      status: true,
      updatedAt: true,
      members: { where: { status: "ACTIVE" }, select: { id: true, role: true, user: { select: { name: true, primaryEmail: true } } } },
      callRooms: { orderBy: [{ scheduledStart: "desc" }, { createdAt: "desc" }], take: 1, select: { id: true, title: true, status: true, scheduledStart: true } },
    },
  });

  return <main className="min-h-full bg-[#f5efe4] px-6 py-10 lg:px-10"><div className="mx-auto max-w-6xl"><p className="text-xs font-black uppercase tracking-[0.22em] text-violet-800">Coaching</p><div className="mt-2 flex flex-wrap items-end justify-between gap-4"><div><h1 className="font-serif text-5xl font-black text-[#34291d]">Engagements</h1><p className="mt-3 max-w-3xl font-semibold leading-7 text-[#765f40]">A private, durable home for the relationship—not just a list of disconnected calls.</p></div><Link href="/coaching" className="rounded-full border border-[#cdbb9e] bg-white px-5 py-3 text-sm font-black text-[#4c3b29]">Coaching runway</Link></div>
    {engagements.length ? <div className="mt-8 grid gap-4 md:grid-cols-2">{engagements.map((engagement) => <Link key={engagement.id} href={`/coaching/engagements/${encodeURIComponent(engagement.id)}`} className="group rounded-[1.75rem] border border-[#dfcfb4] bg-[#fffdf8] p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-800">{engagement.status.toLowerCase()}</p><h2 className="mt-2 font-serif text-2xl font-black text-[#3d3122]">{engagement.title}</h2></div><ArrowRight className="text-[#9b8463] transition group-hover:translate-x-1" /></div><p className="mt-4 flex items-center gap-2 text-sm font-bold text-[#765f40]"><UsersRound size={16} /> {engagement.members.map((member) => member.user.name || member.user.primaryEmail).join(" · ")}</p><p className="mt-4 text-sm text-[#765f40]">{engagement.callRooms[0]?.scheduledStart ? `Latest session ${new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(engagement.callRooms[0].scheduledStart)}` : "No Session has been attached yet."}</p></Link>)}</div> : <section className="mt-8 rounded-[1.75rem] border border-dashed border-[#cdbb9e] bg-[#fffaf0] p-8"><UsersRound className="text-violet-800" /><h2 className="mt-4 font-serif text-2xl font-black text-[#3d3122]">No engagement has been created yet.</h2><p className="mt-2 max-w-2xl text-[#765f40]">The next coaching booking will create or attach the exact private engagement after its Nest, coach, and client are known. Historical sessions stay ungrouped until reviewed; Quipsly will not guess.</p></section>}
  </div></main>;
}
