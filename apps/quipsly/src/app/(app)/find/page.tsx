import Link from "next/link";
import { BookOpen, CalendarDays, FileText, Film, Highlighter, ListChecks, Search, StickyNote, Tags, Target } from "lucide-react";

import { auth } from "@/auth";
import { documentWorkspaceHref } from "@/lib/document-destination";
import { tagFocusHref } from "@/components/tag-search-chips";
import { tagChipColors } from "@/lib/tag-color";
import { getPrismaClient } from "@/lib/prisma";
import { listProjectsVisibleToEmail } from "@/lib/server/home-nest";
import { normalizeWorkspaceSearchQuery, searchWorkspace } from "@/lib/server/workspace-search";

import { StudioAccessShell } from "../studio-access-shell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Search - Quipsly", description: "Find your notes, tasks, sessions, sources, and shared work." };

type FindPageProps = {
  searchParams?: Promise<{
    q?: string | string[];
    tag?: string | string[];
  }>;
};

function ResultSection({ title, count, icon: Icon, children }: { title: string; count: number; icon: typeof Search; children: React.ReactNode }) {
  if (!count) return null;
  return <section className="rounded-2xl border border-border bg-card p-5 shadow-sm"><h2 className="inline-flex items-center gap-2 font-serif text-2xl font-black"><Icon size={20} className="text-muted-foreground" aria-hidden="true" />{title}</h2><div className="mt-4">{children}</div></section>;
}

function researchHref(value: string) {
  return `/research?query=${encodeURIComponent(value.trim().replace(/\s+/g, " ").slice(0, 160))}`;
}

function documentHref(item: { id: string; sourceLabel: string | null; project: { slug: string }; blocks: Array<{ id: string }> }) {
  return documentWorkspaceHref({ documentId: item.id, projectSlug: item.project.slug, sourceLabel: item.sourceLabel, blockId: item.blocks[0]?.id });
}

function documentKind(sourceLabel: string | null) {
  return sourceLabel?.toLowerCase().includes("document-kind:note") ? "note" : "document";
}

function mediaClipHref(item: { id: string; mediaAsset: { id: string } }, tagId: string) {
  const params = new URLSearchParams({
    source: "find",
    tag: tagId,
    clip: item.id,
  });
  return `/media/${encodeURIComponent(item.mediaAsset.id)}?${params.toString()}#clip-${encodeURIComponent(item.id)}`;
}

function AssignedTags({ links = [] }: { links?: Array<{ tag: { id: string; label: string; hexColor?: string | null; isActive: boolean } }> }) {
  if (!links.length) return null;
  const labels = links.map(({ tag }) => `${tag.label}${tag.isActive ? "" : " (archived)"}`);
  return <span className="mt-2 flex flex-wrap gap-1.5" aria-label={`Tags: ${labels.join(", ")}`}>
    {links.map(({ tag }) => <span key={tag.id} style={tagChipColors(tag.hexColor)} className="rounded-full border border-border bg-muted px-2 py-0.5 text-[0.68rem] font-black text-foreground">#{tag.label}{tag.isActive ? "" : " · archived"}</span>)}
  </span>;
}

export default async function FindPage({ searchParams }: FindPageProps) {
  const session = await auth();
  if (!session?.user?.id) return <StudioAccessShell mode="signed-out" redirectTo="/find" />;
  const params = await (searchParams ?? Promise.resolve<{ q?: string | string[]; tag?: string | string[] }>({}));
  const query = normalizeWorkspaceSearchQuery(typeof params.q === "string" ? params.q : "");
  const exactTagId = typeof params.tag === "string" ? params.tag : "";
  const actorEmail = String(session.user.primaryEmail || session.user.email || "").trim().toLowerCase().slice(0, 320);
  try {
    const prisma = getPrismaClient();
    const shouldSearch = query.length >= 2 || Boolean(exactTagId.trim());
    const visibleProjects = shouldSearch ? await listProjectsVisibleToEmail(actorEmail, prisma) : [];
    const result = await searchWorkspace(prisma, {
      actorUserId: session.user.id,
      actorEmail,
      query,
      exactTagId,
      visibleProjects,
    });
    const resultCount = result.tasks.length + result.goals.length + result.sessions.length + result.notes.length + result.sources.length + result.documents.length + result.annotations.length + result.mediaClips.length + result.tags.length;
    const focusedTag = result.tagFocus?.status === "resolved" ? result.tagFocus : null;
    return <main className="mx-auto max-w-7xl space-y-6 px-1 py-4 text-foreground">
      <header className="rounded-[2rem] border border-border bg-card p-6 shadow-sm md:p-8">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-muted-foreground">{focusedTag ? "Tagged work" : "Search"}</p>
        <h1 className="mt-2 font-serif text-4xl font-black text-foreground md:text-5xl">{focusedTag ? `#${focusedTag.resolvedLabel}` : "Search all of Quipsly"}</h1>
        <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-muted-foreground">{focusedTag ? `Work tagged #${focusedTag.resolvedLabel}${focusedTag.project ? ` in ${focusedTag.project.name}` : " in your shared work"}.` : "Find your notes, tasks, sessions, sources, and shared work."}</p>
        {focusedTag?.redirected ? <p className="mt-3 rounded-xl border border-border bg-muted px-4 py-3 text-sm font-bold text-foreground" role="note">#{focusedTag.requestedLabel} was merged into #{focusedTag.resolvedLabel}.</p> : null}
        <form action="/find" method="get" className="mt-6 flex flex-col gap-2 sm:flex-row">
          <label className="sr-only" htmlFor="workspace-search">Search Quipsly</label>
          <input id="workspace-search" name="q" type="search" minLength={2} maxLength={120} defaultValue={focusedTag ? "" : query} placeholder="Try a task, client, episode, note, tag, or exact phrase" className="min-h-12 flex-1 rounded-xl border border-border bg-background px-4 text-base font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          <button type="submit" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground"><Search size={17} aria-hidden="true" />Search</button>
        </form>
        <p className="mt-3 text-xs font-bold text-muted-foreground" role="status">{!shouldSearch ? "Enter at least two characters to search." : exactTagId && !focusedTag ? "This tag isn't available. Try another search." : `Showing ${resultCount} result${resultCount === 1 ? "" : "s"}${focusedTag ? "" : ` across ${result.projectCount} Nest${result.projectCount === 1 ? "" : "s"}`}.`}</p>
      </header>
      {shouldSearch && (!exactTagId || focusedTag) ? <div className="grid gap-4 lg:grid-cols-2">
        <ResultSection title="Tasks" count={result.tasks.length} icon={ListChecks}>{result.tasks.length ? <ul className="space-y-2">{result.tasks.map((item) => <li key={item.id}><Link href={`/work?task=${encodeURIComponent(item.id)}`} className="block rounded-xl border border-border bg-card p-3 hover:border-primary"><strong>{item.title}</strong><span className="mt-1 block text-xs font-bold text-muted-foreground">{[item.status.toLowerCase(), item.project?.name, item.room?.title].filter(Boolean).join(" · ")}</span><AssignedTags links={item.tagLinks} /></Link></li>)}</ul> : null}</ResultSection>
        <ResultSection title="Goals" count={result.goals.length} icon={Target}>{result.goals.length ? <ul className="space-y-2">{result.goals.map((item) => <li key={item.id}><Link href={`/work?goal=${encodeURIComponent(item.id)}`} className="block rounded-xl border border-border bg-card p-3 hover:border-primary"><strong>{item.title}</strong><span className="mt-1 block text-xs font-bold text-muted-foreground">{[item.status.toLowerCase(), item.project?.name || item.room?.title].filter(Boolean).join(" · ")}</span><AssignedTags links={item.tagLinks} /></Link></li>)}</ul> : null}</ResultSection>
        <ResultSection title="Sessions" count={result.sessions.length} icon={CalendarDays}>{result.sessions.length ? <ul className="space-y-2">{result.sessions.map((item) => <li key={item.id}><Link href={`/sessions/${encodeURIComponent(item.id)}`} className="block rounded-xl border border-border bg-card p-3 hover:border-primary"><strong>{item.title || "Untitled Session"}</strong><span className="mt-1 block text-xs font-bold text-muted-foreground">{String(item.purpose).toLowerCase()} · {String(item.status).toLowerCase()}{item.project?.name ? ` · ${item.project.name}` : ""}</span><AssignedTags links={item.tagLinks} /></Link></li>)}</ul> : null}</ResultSection>
        <ResultSection title="Notes" count={result.notes.length} icon={StickyNote}>{result.notes.length ? <ul className="space-y-2">{result.notes.map((item) => <li key={item.id}><Link href={`/sessions/${encodeURIComponent(item.room.id)}?mode=notes#session-note-${encodeURIComponent(item.id)}`} className="block rounded-xl border border-border bg-card p-3 hover:border-primary"><strong>{item.title || "Session note"}</strong><span className="mt-1 line-clamp-2 block text-sm font-semibold text-muted-foreground">{item.body}</span><span className="mt-1 block text-xs font-bold text-muted-foreground">{item.room.title || "Untitled Session"} · {String(item.kind).replaceAll("_", " ").toLowerCase()} · {String(item.visibility).replaceAll("_", " ").toLowerCase()}</span><AssignedTags links={item.tagLinks} /></Link></li>)}</ul> : null}</ResultSection>
        <ResultSection title="Documents & writing notes" count={result.documents.length} icon={FileText}>{result.documents.length ? <ul className="space-y-2">{result.documents.map((item) => <li key={item.id}><Link href={documentHref(item)} className="block rounded-xl border border-border bg-card p-3 hover:border-primary"><strong>{item.title}</strong>{item.blocks[0]?.body ? <span className="mt-1 line-clamp-2 block text-sm font-semibold text-muted-foreground">{item.blocks[0].body}</span> : null}<span className="mt-1 block text-xs font-bold text-muted-foreground">{item.project.name} · {documentKind(item.sourceLabel)} · {String(item.projectionStatus).replaceAll("_", " ")}</span><AssignedTags links={item.tagLinks} /></Link></li>)}</ul> : null}</ResultSection>
        <ResultSection title="Sources" count={result.sources.length} icon={BookOpen}>{result.sources.length ? <ul className="space-y-2">{result.sources.map((item) => <li key={item.id}><Link href={researchHref(item.title)} className="block rounded-xl border border-border bg-card p-3 hover:border-primary"><strong>{item.title}</strong><span className="mt-1 block text-xs font-bold text-muted-foreground">{item.project.name} · {item.kind}{item.author ? ` · ${item.author}` : ""}</span></Link></li>)}</ul> : null}</ResultSection>
        <ResultSection title="Annotations" count={result.annotations.length} icon={Highlighter}>{result.annotations.length ? <ul className="space-y-2">{result.annotations.map((item) => <li key={item.id}><Link href={researchHref(item.exactText || item.body)} className="block rounded-xl border border-border bg-card p-3 hover:border-primary"><strong className="line-clamp-2">{item.exactText || item.body}</strong><span className="mt-1 block text-xs font-bold text-muted-foreground">{item.sourceUnit.title} · {item.project.name} · {item.visibility}</span></Link></li>)}</ul> : null}</ResultSection>
        <ResultSection title="Media clips" count={result.mediaClips.length} icon={Film}>{result.mediaClips.length && focusedTag ? <ul className="space-y-2">{result.mediaClips.map((item) => <li key={item.id}><Link href={mediaClipHref(item, focusedTag.resolvedTagId)} className="block rounded-xl border border-border bg-card p-3 hover:border-primary"><strong>{item.title}</strong>{item.description ? <span className="mt-1 line-clamp-2 block text-sm font-semibold text-muted-foreground">{item.description}</span> : null}<span className="mt-1 block text-xs font-bold text-muted-foreground">{item.mediaAsset.filename} · {item.inTimecode.toFixed(2)}s–{item.outTimecode.toFixed(2)}s{item.mediaAsset.isGlobal ? " · shared reference" : ""}</span></Link></li>)}</ul> : null}</ResultSection>
        <ResultSection title="Tags" count={result.tags.length} icon={Tags}>{result.tags.length ? <ul className="space-y-2">{result.tags.map((item) => <li key={item.id}><Link href={tagFocusHref(item.id)} className="block rounded-xl border border-border bg-card p-3 hover:border-primary"><strong style={tagChipColors(item.hexColor)} className="inline-block rounded-full border border-border bg-muted px-2 py-1 text-sm text-foreground">{item.label}</strong><span className="mt-1 block text-xs font-bold text-muted-foreground">{item.project?.name || "Shared work"} · Tag</span>{item.aliases.length ? <span className="mt-1 block text-xs font-semibold text-muted-foreground">Former names: {item.aliases.map((alias) => alias.label).join(", ")}</span> : null}{item.description ? <span className="mt-1 line-clamp-2 block text-xs font-semibold text-muted-foreground">{item.description}</span> : null}</Link></li>)}</ul> : null}</ResultSection>
      </div> : null}
      {shouldSearch && resultCount === 0 && !exactTagId && <section className="rounded-2xl border border-border bg-card p-6 text-foreground"><h2 className="font-serif text-2xl font-bold">No results found</h2><p className="mt-2 text-muted-foreground">Try a different name, tag, or phrase.</p></section>}
      {shouldSearch && resultCount > 0 && <p className="text-xs font-semibold leading-5 text-muted-foreground">Showing up to 10 results per category. Use a more specific search to narrow the results.</p>}
    </main>;
  } catch (error) {
    console.error("[workspace-search] failed", error);
    const retryHref = `/find?${new URLSearchParams(exactTagId ? { tag: exactTagId } : { q: query })}`;
    return <main className="mx-auto max-w-3xl p-6"><section role="status" className="rounded-2xl border border-border bg-card p-6 text-foreground"><h1 className="font-serif text-3xl font-black">Search is unavailable</h1><p className="mt-3 text-sm">We couldn't load your results. Please try again.</p><a href={retryHref} className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-primary px-4 font-semibold text-primary-foreground">Try again</a></section></main>;
  }
}
