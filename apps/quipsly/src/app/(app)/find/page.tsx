import Link from "next/link";
import { BookOpen, CalendarDays, FileText, Highlighter, ListChecks, Search, StickyNote, Tags, Target } from "lucide-react";

import { auth } from "@/auth";
import { tagSearchHref } from "@/components/tag-search-chips";
import { getPrismaClient } from "@/lib/prisma";
import { listProjectsVisibleToEmail } from "@/lib/server/home-nest";
import { normalizeWorkspaceSearchQuery, searchWorkspace } from "@/lib/server/workspace-search";

import { StudioAccessShell } from "../studio-access-shell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Search All - Quipsly", description: "Permission-filtered search across canonical Quipsly work and evidence." };

type FindPageProps = { searchParams?: Promise<{ q?: string | string[] }> };

function ResultSection({ title, icon: Icon, children }: { title: string; icon: typeof Search; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-[#e4d3b3] bg-white p-5 shadow-sm"><h2 className="inline-flex items-center gap-2 font-serif text-2xl font-black"><Icon size={20} className="text-[#987443]" aria-hidden="true" />{title}</h2><div className="mt-4">{children}</div></section>;
}

function Empty() { return <p className="text-sm font-semibold text-[#806a4d]">No accessible matches in this category.</p>; }

function researchHref(value: string) {
  return `/research?query=${encodeURIComponent(value.trim().replace(/\s+/g, " ").slice(0, 160))}`;
}

function documentHref(item: { id: string; project: { slug: string }; blocks: Array<{ id: string }> }) {
  const params = new URLSearchParams({ project: item.project.slug, document: item.id });
  if (item.blocks[0]?.id) params.set("block", item.blocks[0].id);
  return `/create?${params.toString()}`;
}

function documentKind(sourceLabel: string | null) {
  return sourceLabel?.toLowerCase().includes("document-kind:note") ? "note" : "document";
}

function AssignedTags({ links }: { links: Array<{ tag: { id: string; label: string; isActive: boolean } }> }) {
  if (!links.length) return null;
  const labels = links.map(({ tag }) => `${tag.label}${tag.isActive ? "" : " (archived)"}`);
  return <span className="mt-2 flex flex-wrap gap-1.5" aria-label={`Tags: ${labels.join(", ")}`}>
    {links.map(({ tag }) => <span key={tag.id} className={`rounded-full border px-2 py-0.5 text-[0.68rem] font-black ${tag.isActive ? "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-950" : "border-stone-300 bg-stone-100 text-stone-700"}`}>#{tag.label}{tag.isActive ? "" : " · archived"}</span>)}
  </span>;
}

export default async function FindPage({ searchParams }: FindPageProps) {
  const session = await auth();
  if (!session?.user?.id) return <StudioAccessShell mode="signed-out" redirectTo="/find" />;
  const params = await (searchParams ?? Promise.resolve<{ q?: string | string[] }>({}));
  const query = normalizeWorkspaceSearchQuery(typeof params.q === "string" ? params.q : "");
  const actorEmail = String(session.user.primaryEmail || session.user.email || "").trim().toLowerCase().slice(0, 320);
  try {
    const prisma = getPrismaClient();
    const visibleProjects = query.length >= 2 ? await listProjectsVisibleToEmail(actorEmail, prisma) : [];
    const result = await searchWorkspace(prisma, { actorUserId: session.user.id, query, visibleProjects });
    const resultCount = result.tasks.length + result.goals.length + result.sessions.length + result.notes.length + result.sources.length + result.documents.length + result.annotations.length + result.tags.length;
    return <main className="mx-auto max-w-7xl space-y-6 px-1 py-4 text-[#3d3122]">
      <header className="rounded-[2rem] border border-[#dfcba6] bg-[radial-gradient(circle_at_top_right,_#dff5ff,_transparent_42%),linear-gradient(135deg,#fffaf0,#f8edda)] p-6 shadow-sm md:p-8"><p className="text-xs font-black uppercase tracking-[0.22em] text-[#8a653d]">Permission-filtered workspace search</p><h1 className="mt-2 font-serif text-4xl font-black md:text-5xl">Search all of Quipsly</h1><p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-[#715a3e]">Find the same task, goal, Session, note, source, annotation, document, or project tag—then open its canonical record. Results never broaden your existing access.</p><form action="/find" method="get" className="mt-6 flex flex-col gap-2 sm:flex-row"><label className="sr-only" htmlFor="workspace-search">Search all accessible Quipsly records</label><input id="workspace-search" name="q" type="search" minLength={2} maxLength={120} defaultValue={query} placeholder="Try a task, client, episode, note, tag, or exact phrase" className="min-h-12 flex-1 rounded-xl border-2 border-[#d9c7a5] bg-white px-4 text-base font-semibold outline-none focus:border-sky-600 focus:ring-4 focus:ring-sky-100" /><button type="submit" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#3e2f21] px-6 text-xs font-black uppercase tracking-wide text-white"><Search size={17} aria-hidden="true" />Search</button></form><p className="mt-3 text-xs font-bold text-[#806a4d]" role="status">{query.length < 2 ? "Enter at least two characters. Nothing has been searched yet." : `${resultCount} accessible result${resultCount === 1 ? "" : "s"} across ${result.projectCount} Nest${result.projectCount === 1 ? "" : "s"}.`}</p></header>
      {query.length >= 2 ? <div className="grid gap-4 lg:grid-cols-2">
        <ResultSection title="Tasks" icon={ListChecks}>{result.tasks.length ? <ul className="space-y-2">{result.tasks.map((item) => <li key={item.id}><Link href={`/work?task=${encodeURIComponent(item.id)}`} className="block rounded-xl border border-emerald-100 bg-emerald-50/40 p-3 hover:border-emerald-300"><strong>{item.title}</strong><span className="mt-1 block text-xs font-bold text-[#806a4d]">{item.status.toLowerCase()} · {[item.project?.name, item.room?.title].filter(Boolean).join(" · ") || "personal work"}</span><AssignedTags links={item.tagLinks} /></Link></li>)}</ul> : <Empty />}</ResultSection>
        <ResultSection title="Goals" icon={Target}>{result.goals.length ? <ul className="space-y-2">{result.goals.map((item) => <li key={item.id}><Link href={`/work?goal=${encodeURIComponent(item.id)}`} className="block rounded-xl border border-violet-100 bg-violet-50/40 p-3 hover:border-violet-300"><strong>{item.title}</strong><span className="mt-1 block text-xs font-bold text-[#806a4d]">{item.status.toLowerCase()} · {item.project?.name || item.room?.title || "personal goal"}</span><AssignedTags links={item.tagLinks} /></Link></li>)}</ul> : <Empty />}</ResultSection>
        <ResultSection title="Sessions" icon={CalendarDays}>{result.sessions.length ? <ul className="space-y-2">{result.sessions.map((item) => <li key={item.id}><Link href={`/sessions/${encodeURIComponent(item.id)}`} className="block rounded-xl border border-amber-100 bg-amber-50/40 p-3 hover:border-amber-300"><strong>{item.title || "Untitled Session"}</strong><span className="mt-1 block text-xs font-bold text-[#806a4d]">{String(item.purpose).toLowerCase()} · {String(item.status).toLowerCase()}{item.project?.name ? ` · ${item.project.name}` : ""}</span><AssignedTags links={item.tagLinks} /></Link></li>)}</ul> : <Empty />}</ResultSection>
        <ResultSection title="Notes" icon={StickyNote}>{result.notes.length ? <ul className="space-y-2">{result.notes.map((item) => <li key={item.id}><Link href={`/sessions/${encodeURIComponent(item.room.id)}?mode=notes#session-note-${encodeURIComponent(item.id)}`} className="block rounded-xl border border-orange-100 bg-orange-50/40 p-3 hover:border-orange-300"><strong>{item.title || "Session note"}</strong><span className="mt-1 line-clamp-2 block text-sm font-semibold text-[#5e4a32]">{item.body}</span><span className="mt-1 block text-xs font-bold text-[#806a4d]">{item.room.title || "Untitled Session"} · {String(item.kind).replaceAll("_", " ").toLowerCase()} · {String(item.visibility).replaceAll("_", " ").toLowerCase()}</span><AssignedTags links={item.tagLinks} /></Link></li>)}</ul> : <Empty />}</ResultSection>
        <ResultSection title="Documents & writing notes" icon={FileText}>{result.documents.length ? <ul className="space-y-2">{result.documents.map((item) => <li key={item.id}><Link href={documentHref(item)} className="block rounded-xl border border-sky-100 bg-sky-50/40 p-3 hover:border-sky-300"><strong>{item.title}</strong>{item.blocks[0]?.body ? <span className="mt-1 line-clamp-2 block text-sm font-semibold text-[#5e4a32]">{item.blocks[0].body}</span> : null}<span className="mt-1 block text-xs font-bold text-[#806a4d]">{item.project.name} · {documentKind(item.sourceLabel)} · {String(item.projectionStatus).replaceAll("_", " ")}</span></Link></li>)}</ul> : <Empty />}</ResultSection>
        <ResultSection title="Sources" icon={BookOpen}>{result.sources.length ? <ul className="space-y-2">{result.sources.map((item) => <li key={item.id}><Link href={researchHref(item.title)} className="block rounded-xl border border-cyan-100 bg-cyan-50/40 p-3 hover:border-cyan-300"><strong>{item.title}</strong><span className="mt-1 block text-xs font-bold text-[#806a4d]">{item.project.name} · {item.kind}{item.author ? ` · ${item.author}` : ""}</span></Link></li>)}</ul> : <Empty />}</ResultSection>
        <ResultSection title="Annotations" icon={Highlighter}>{result.annotations.length ? <ul className="space-y-2">{result.annotations.map((item) => <li key={item.id}><Link href={researchHref(item.exactText || item.body)} className="block rounded-xl border border-rose-100 bg-rose-50/40 p-3 hover:border-rose-300"><strong className="line-clamp-2">{item.exactText || item.body}</strong><span className="mt-1 block text-xs font-bold text-[#806a4d]">{item.sourceUnit.title} · {item.project.name} · {item.visibility}</span></Link></li>)}</ul> : <Empty />}</ResultSection>
        <ResultSection title="Tags" icon={Tags}>{result.tags.length ? <ul className="space-y-2">{result.tags.map((item) => <li key={item.id}><Link href={tagSearchHref(item.label)} className="block rounded-xl border border-fuchsia-100 bg-fuchsia-50/40 p-3 hover:border-fuchsia-300"><strong>{item.label}</strong><span className="mt-1 block text-xs font-bold text-[#806a4d]">{item.project.name} · {String(item.category).replaceAll("_", " ")}{item.isPrivate ? " · private taxonomy" : ""}</span>{item.aliases.length ? <span className="mt-1 block text-xs font-semibold text-fuchsia-900">Former names: {item.aliases.map((alias) => alias.label).join(", ")}</span> : null}{item.description ? <span className="mt-1 line-clamp-2 block text-xs font-semibold text-[#765f40]">{item.description}</span> : null}</Link></li>)}</ul> : <Empty />}</ResultSection>
      </div> : null}
      <p className="text-xs font-semibold leading-5 text-[#806a4d]">Search is read-only and bounded to 10 results per category. It creates no records, messages, provider calls, calendar events, or publication actions.</p>
    </main>;
  } catch (error) {
    console.error("[workspace-search] failed", error);
    return <main className="mx-auto max-w-3xl p-6"><section role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-6"><h1 className="font-serif text-3xl font-black">Search could not verify private records</h1><p className="mt-3 text-sm font-semibold">No sample results are standing in for unavailable persistence, and nothing was changed.</p></section></main>;
  }
}
