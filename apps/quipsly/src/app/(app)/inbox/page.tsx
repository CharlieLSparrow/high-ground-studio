import Link from "next/link";
import { CircleAlert, Clock3, Inbox, ListChecks, RefreshCcw, Target } from "lucide-react";

import { getQuipslySession } from "@/lib/server/quipsly-session";

import { StudioAccessShell } from "../studio-access-shell";
import { loadInbox } from "./inbox-loader";
import { type InboxReviewItem } from "./inbox-model";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Inbox - Quipsly",
  description: "Return to private captures and optional transcript ideas whenever they are useful.",
};

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
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${tone}`}>{item.state === "REVISE" ? "Changed" : item.kind === "SOURCE" ? "Saved" : "Optional"}</span>
      </div>
      <p className="mt-4 text-[10px] font-black uppercase tracking-[0.16em] text-[#987443]">{item.sourceLabel}</p>
      {item.kind === "SOURCE" && item.captureCount ? <p className="mt-1 text-[11px] font-bold text-[#806a4d]">{item.captureCount === 1 ? "Captured once" : `Captured ${item.captureCount} times`} · latest capture first</p> : null}
      <h3 className="mt-1 text-lg font-black leading-snug text-[#3d3122]">{item.title}</h3>
      {item.detail && <p className="mt-2 line-clamp-3 text-sm font-semibold leading-6 text-[#765f40]">{item.detail}</p>}
      {item.roomTitle && <div className="mt-4 space-y-1 text-xs font-bold text-[#806a4d]"><p>Session: {item.roomTitle}</p>{item.project && <p>Nest: {item.project.name}</p>}</div>}
      <Link href={href} className="mt-4 inline-flex min-h-11 items-center rounded-full bg-[#3e2f21] px-4 py-2.5 text-xs font-black uppercase tracking-wide text-white">{item.kind === "SOURCE" ? "Open capture" : "Open Session"}</Link>
      <p className="mt-3 text-[11px] font-semibold leading-5 text-[#927b5b]">{item.kind === "SOURCE" ? "This stays private until you add it to a Nest." : "Use, change, dismiss, or ignore this suggestion whenever you like."}</p>
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
          <h1 className="mt-2 max-w-4xl font-serif text-4xl font-black tracking-tight md:text-5xl">Things you saved for later.</h1>
          <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-[#715a3e]">Return to private iPhone captures and optional ideas from older Session transcripts. Nothing here demands a process: open what helps and ignore the rest.</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="Inbox review counts">
            {[
              ["Saved", inbox.counts.ready],
              ["Changed", inbox.counts.revise],
              ["Later", inbox.counts.deferred],
              ["Captures", inbox.counts.sources],
              ["Sessions", inbox.counts.sessions],
            ].map(([label, value]) => <div key={label} className="rounded-2xl border border-white/80 bg-white/75 p-4"><p className="text-3xl font-black">{value}</p><p className="text-[10px] font-black uppercase tracking-wide text-[#806a4d]">{label}</p></div>)}
          </div>
        </header>

        <section aria-labelledby="inbox-ready">
          <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-[#987443]">Ready when you are</p><h2 id="inbox-ready" className="mt-1 font-serif text-3xl font-black">Saved items</h2></div><Link href="/coaching/sessions" className="rounded-full border border-[#d9c7a5] bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-[#5b472f]">All Sessions</Link></div>
          {inbox.ready.length ? <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">{inbox.ready.map((item) => <ReviewCard key={item.id} item={item} />)}</div> : <div className="mt-4 rounded-2xl border border-dashed border-[#d8c7a7] bg-white/55 p-8 text-sm font-semibold text-[#765f40]">Nothing is waiting here.</div>}
        </section>

        <section aria-labelledby="inbox-later" className="rounded-3xl border border-[#e5d5b7] bg-[#fffaf0] p-5 md:p-6">
          <div className="flex items-start gap-3"><Clock3 className="mt-1 text-[#8a6a3e]" aria-hidden="true" /><div><p className="text-xs font-black uppercase tracking-[0.18em] text-[#987443]">Whenever it helps</p><h2 id="inbox-later" className="mt-1 font-serif text-2xl font-black">Later</h2></div></div>
          {inbox.deferred.length ? <ul className="mt-4 space-y-2">{inbox.deferred.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#ead8b4] bg-white p-4"><div><p className="font-black">{item.title}</p><p className="mt-1 text-xs font-bold text-[#806a4d]">{item.roomTitle} · {item.sourceLabel}</p></div><Link href={inboxItemHref(item)} className="text-xs font-black uppercase tracking-wide text-[#76522c] hover:underline">Reopen evidence</Link></li>)}</ul> : <p className="mt-4 text-sm font-semibold text-[#765f40]">Nothing is intentionally deferred.</p>}
        </section>

        <footer className="rounded-2xl border border-[#e4d3b3] bg-white p-5 text-xs font-semibold leading-5 text-[#765f40]">Personal captures stay private until you add them to a Nest. Opening an item here never sends or publishes it.</footer>
      </main>
    );
  } catch (error) {
    console.error("[inbox] failed to load saved items", error);
    return <main className="mx-auto grid min-h-[70vh] max-w-3xl place-items-center px-4 py-10 text-[#3d3122]"><section role="status" aria-label="Inbox unavailable" className="w-full rounded-3xl border border-amber-200 bg-amber-50 p-7"><CircleAlert className="h-8 w-8 text-amber-700" aria-hidden="true" /><p className="mt-5 text-xs font-black uppercase tracking-wide text-amber-800">Could not refresh</p><h1 className="mt-2 font-serif text-3xl font-black">Saved items are temporarily unavailable</h1><p className="mt-3 font-semibold text-[#765f40]">Nothing was changed. Try again when you are ready.</p><Link href="/inbox" className="mt-5 inline-flex rounded-full border border-amber-300 bg-white px-5 py-2.5 text-xs font-black uppercase tracking-wide text-amber-900">Try again</Link></section></main>;
  }
}
