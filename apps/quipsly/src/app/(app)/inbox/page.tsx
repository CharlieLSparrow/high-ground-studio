import Link from "next/link";
import { CircleAlert, Clock3, Inbox, ListChecks, RefreshCcw, Target } from "lucide-react";

import { getPrismaClient } from "@/lib/prisma";
import { listProjectsVisibleToEmail } from "@/lib/server/home-nest";
import { getQuipslySession } from "@/lib/server/quipsly-session";

import { StudioAccessShell } from "../studio-access-shell";
import { buildInboxSnapshot, type InboxReviewItem } from "./inbox-model";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Inbox - Quipsly",
  description: "Review source-linked transcript packet proposals before they become committed work.",
};

function accessibleRooms(userId: string, isStaff: boolean) {
  return isStaff ? {} : {
    OR: [
      { createdByUserId: userId },
      { participants: { some: { userId } } },
      { booking: { clientUserId: userId } },
      { booking: { coachUserId: userId } },
    ],
  };
}

export async function loadInbox(userId: string, actorEmail: string, isStaff: boolean) {
  const prisma = getPrismaClient() as any;
  const visibleProjects = actorEmail ? await listProjectsVisibleToEmail(actorEmail, prisma) : [];
  const visibleProjectIds = new Set(visibleProjects.map((project) => project.id));
  const [rooms, snippets, bookmarks] = await Promise.all([prisma.callRoom.findMany({
    where: {
      ...accessibleRooms(userId, isStaff),
      notes: { some: { kind: "SUMMARY" } },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: {
      id: true,
      title: true,
      purpose: true,
      updatedAt: true,
      project: { select: { id: true, name: true, slug: true } },
      notes: {
        where: { kind: { in: ["SUMMARY", "HIGHLIGHT"] } },
        orderBy: [{ createdAt: "desc" }, { updatedAt: "desc" }],
        take: 100,
        select: { id: true, kind: true, title: true, body: true, sourceJson: true, createdAt: true, updatedAt: true },
      },
      actionItems: {
        where: { status: "OPEN" },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: { id: true, roomId: true, title: true, detail: true, sourceJson: true },
      },
    },
  }), prisma.snippet.findMany({
    where: { userId, collectionId: null, researchFilings: { none: {} } },
    orderBy: { updatedAt: "desc" },
    take: 200,
    select: {
      id: true,
      sourceTitle: true,
      highlightedText: true,
      updatedAt: true,
      _count: { select: { captureReceipts: true } },
      captureReceipts: { orderBy: { capturedAt: "desc" }, take: 1, select: { capturedAt: true } },
    },
  }), prisma.bookmark.findMany({
    where: { userId, collectionId: null, researchFilings: { none: {} } },
    orderBy: { updatedAt: "desc" },
    take: 200,
    select: {
      id: true,
      title: true,
      url: true,
      metadataJson: true,
      updatedAt: true,
      _count: { select: { captureReceipts: true } },
      captureReceipts: { orderBy: { capturedAt: "desc" }, take: 1, select: { capturedAt: true } },
    },
  })]);
  return buildInboxSnapshot(rooms.map((room: any) => ({
    ...room,
    project: room.project && visibleProjectIds.has(room.project.id) ? room.project : null,
  })), [
    ...snippets.map((snippet: any) => ({
      id: snippet.id,
      captureType: "SNIPPET" as const,
      title: snippet.sourceTitle || "Saved passage",
      excerpt: snippet.highlightedText,
      updatedAt: snippet.updatedAt,
      captureCount: snippet._count.captureReceipts || 1,
      lastCapturedAt: snippet.captureReceipts[0]?.capturedAt || snippet.updatedAt,
    })),
    ...bookmarks.map((bookmark: any) => ({
      id: bookmark.id,
      captureType: "BOOKMARK" as const,
      title: bookmark.title || "Saved link",
      excerpt: bookmark.url,
      updatedAt: bookmark.updatedAt,
      captureCount: bookmark._count.captureReceipts || 1,
      lastCapturedAt: bookmark.captureReceipts[0]?.capturedAt || bookmark.updatedAt,
    })),
  ]);
}

function ReviewCard({ item }: { item: InboxReviewItem }) {
  const Icon = item.kind === "SOURCE" ? Inbox : item.kind === "ACTION" ? ListChecks : item.kind === "GOAL" ? Target : RefreshCcw;
  const tone = item.state === "REVISE"
    ? "border-amber-200 bg-amber-50 text-amber-800"
    : "border-sky-200 bg-sky-50 text-sky-800";
  const href = inboxItemHref(item);
  return (
    <article className="rounded-2xl border border-[#e5d5b7] bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <span className="rounded-xl bg-[#fff7e8] p-2 text-[#8a6a3e]"><Icon className="h-5 w-5" aria-hidden="true" /></span>
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${tone}`}>{item.state === "REVISE" ? "Needs revision" : "Ready for review"}</span>
      </div>
      <p className="mt-4 text-[10px] font-black uppercase tracking-[0.16em] text-[#987443]">{item.sourceLabel}</p>
      {item.kind === "SOURCE" && item.captureCount ? <p className="mt-1 text-[11px] font-bold text-[#806a4d]">{item.captureCount === 1 ? "Captured once" : `Captured ${item.captureCount} times`} · latest capture first</p> : null}
      <h3 className="mt-1 text-lg font-black leading-snug text-[#3d3122]">{item.title}</h3>
      {item.detail && <p className="mt-2 line-clamp-3 text-sm font-semibold leading-6 text-[#765f40]">{item.detail}</p>}
      {item.roomTitle && <div className="mt-4 space-y-1 text-xs font-bold text-[#806a4d]"><p>Session: {item.roomTitle}</p>{item.project && <p>Nest: {item.project.name}</p>}</div>}
      <Link href={href} className="mt-4 inline-flex min-h-11 items-center rounded-full bg-[#3e2f21] px-4 py-2.5 text-xs font-black uppercase tracking-wide text-white">{item.kind === "SOURCE" ? "Review personal source" : "Review with source"}</Link>
      <p className="mt-3 text-[11px] font-semibold leading-5 text-[#927b5b]">{item.kind === "SOURCE" ? "Reviewing does not file this into a shared Nest. Choose that destination deliberately from the source workspace." : "Opening the evidence creates nothing. Accept, edit, defer, or reject deliberately in Session Review."}</p>
    </article>
  );
}

function inboxItemHref(item: InboxReviewItem) {
  if (item.kind === "SOURCE") return `/collections?capture=${encodeURIComponent(item.id)}`;
  if (!item.roomId) return "/inbox";
  return item.segmentId
    ? `/sessions/${encodeURIComponent(item.roomId)}#transcript-segment-${encodeURIComponent(item.segmentId)}`
    : `/sessions/${encodeURIComponent(item.roomId)}`;
}

export default async function InboxPage() {
  const session = await getQuipslySession();
  if (!session?.user) return <StudioAccessShell mode="signed-out" redirectTo="/inbox" />;

  try {
    const actorEmail = (session.user.primaryEmail || session.user.email || "").trim().toLowerCase();
    const inbox = await loadInbox(session.user.id, actorEmail, session.user.isStaff);
    return (
      <main className="mx-auto max-w-[1320px] space-y-7 px-2 py-2 text-[#3d3122]">
        <header className="overflow-hidden rounded-[2rem] border border-[#dfcba6] bg-[radial-gradient(circle_at_top_right,_#dcecf8,_transparent_42%),linear-gradient(135deg,#fffaf0,#f8edda)] p-6 shadow-sm md:p-8">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-[#76522c]">Inbox</p>
          <h1 className="mt-2 max-w-4xl font-serif text-4xl font-black tracking-tight md:text-5xl">Decide what becomes real work.</h1>
          <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-[#715a3e]">Inbox brings together personal source captures from iPhone and source-linked transcript proposals from Sessions you can access. Captures stay private and unfiled; proposals are not Tasks, Goals, promises, or delivered notes until a human decides.</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="Inbox review counts">
            {[
              ["Ready", inbox.counts.ready],
              ["Needs revision", inbox.counts.revise],
              ["Deferred", inbox.counts.deferred],
              ["Source captures", inbox.counts.sources],
              ["Sessions", inbox.counts.sessions],
            ].map(([label, value]) => <div key={label} className="rounded-2xl border border-white/80 bg-white/75 p-4"><p className="text-3xl font-black">{value}</p><p className="text-[10px] font-black uppercase tracking-wide text-[#806a4d]">{label}</p></div>)}
          </div>
        </header>

        <section aria-labelledby="inbox-ready">
          <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-[#987443]">Human decision required</p><h2 id="inbox-ready" className="mt-1 font-serif text-3xl font-black">Review now</h2></div><Link href="/coaching/sessions" className="rounded-full border border-[#d9c7a5] bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-[#5b472f]">All Sessions</Link></div>
          {inbox.ready.length ? <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">{inbox.ready.map((item) => <ReviewCard key={item.id} item={item} />)}</div> : <div className="mt-4 rounded-2xl border border-dashed border-[#d8c7a7] bg-white/55 p-8 text-sm font-semibold text-[#765f40]">No transcript packet proposal currently needs review. Quipsly has not invented an unread count or sample candidate.</div>}
        </section>

        <section aria-labelledby="inbox-later" className="rounded-3xl border border-[#e5d5b7] bg-[#fffaf0] p-5 md:p-6">
          <div className="flex items-start gap-3"><Clock3 className="mt-1 text-[#8a6a3e]" aria-hidden="true" /><div><p className="text-xs font-black uppercase tracking-[0.18em] text-[#987443]">Intentionally later</p><h2 id="inbox-later" className="mt-1 font-serif text-2xl font-black">Deferred</h2></div></div>
          {inbox.deferred.length ? <ul className="mt-4 space-y-2">{inbox.deferred.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#ead8b4] bg-white p-4"><div><p className="font-black">{item.title}</p><p className="mt-1 text-xs font-bold text-[#806a4d]">{item.roomTitle} · {item.sourceLabel}</p></div><Link href={inboxItemHref(item)} className="text-xs font-black uppercase tracking-wide text-[#76522c] hover:underline">Reopen evidence</Link></li>)}</ul> : <p className="mt-4 text-sm font-semibold text-[#765f40]">Nothing is intentionally deferred.</p>}
        </section>

        <footer className="rounded-2xl border border-[#e4d3b3] bg-white p-5 text-xs font-semibold leading-5 text-[#765f40]">Boundary: actor-owned sources stay here until an explicit Research filing receipt commits; pending phone outbox entries remain protected on that device. Filing creates preserved evidence in the chosen Nest while leaving the private capture unchanged. Opening Inbox does not assign, schedule, message, deliver, publish, or mutate a provider.</footer>
      </main>
    );
  } catch (error) {
    console.error("[inbox] failed to load actor-scoped review candidates", error);
    return <main className="mx-auto grid min-h-[70vh] max-w-3xl place-items-center px-4 py-10 text-[#3d3122]"><section role="status" aria-label="Inbox unavailable" className="w-full rounded-3xl border border-amber-200 bg-amber-50 p-7"><CircleAlert className="h-8 w-8 text-amber-700" aria-hidden="true" /><p className="mt-5 text-xs font-black uppercase tracking-wide text-amber-800">Private read unavailable</p><h1 className="mt-2 font-serif text-3xl font-black">Inbox could not be verified</h1><p className="mt-3 font-semibold text-[#765f40]">No sample proposals are standing in, and no saved record was changed.</p><Link href="/inbox" className="mt-5 inline-flex rounded-full border border-amber-300 bg-white px-5 py-2.5 text-xs font-black uppercase tracking-wide text-amber-900">Retry read</Link></section></main>;
  }
}
