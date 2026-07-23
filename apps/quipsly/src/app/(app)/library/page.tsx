import Link from "next/link";
import { BookOpenText, CircleAlert, FileAudio, FilePlus2, FileText, Film, Highlighter, Library, MessageSquareText, Search } from "lucide-react";

import { getPrismaClient } from "@/lib/prisma";
import { homeNestSlugForEmail, listProjectsVisibleToEmail } from "@/lib/server/home-nest";
import { getQuipslySession } from "@/lib/server/quipsly-session";

import { createDocumentAction } from "../nests/[slug]/actions";
import { StudioAccessShell } from "../studio-access-shell";
import { buildLibraryEntries, filterLibraryEntries, type LibraryEntry, type LibraryKind } from "./library-model";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Library - Quipsly",
  description: "Continue from canonical Sessions, recordings, transcripts, preserved sources, annotations, manuscripts, and reusable media.",
};

function roomAccess(userId: string, isStaff: boolean) {
  return isStaff ? {} : {
    OR: [
      { createdByUserId: userId },
      { participants: { some: { userId } } },
      { booking: { clientUserId: userId } },
      { booking: { coachUserId: userId } },
    ],
  };
}

export async function loadLibrary(userId: string, actorEmail: string, isStaff: boolean) {
  const prisma = getPrismaClient() as any;
  const projects = actorEmail ? await listProjectsVisibleToEmail(actorEmail, prisma) : [];
  const projectIds = projects.map((project) => project.id);
  const visibleProjectIds = new Set(projectIds);

  const [sessions, notes, sources, documents, media, savedCounts, latestSnippet, latestBookmark] = await Promise.all([
    prisma.callRoom.findMany({
      where: {
        AND: [
          roomAccess(userId, isStaff),
          { OR: [{ recordingAssets: { some: {} } }, { transcriptJobs: { some: {} } }] },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: {
        id: true,
        title: true,
        purpose: true,
        status: true,
        updatedAt: true,
        project: { select: { id: true, name: true, slug: true } },
        recordingAssets: {
          orderBy: { createdAt: "desc" },
          take: 30,
          select: { id: true, fileName: true, kind: true, status: true, durationSeconds: true, localManifestJson: true },
        },
        transcriptJobs: {
          orderBy: [{ createdAt: "desc" }, { updatedAt: "desc" }],
          take: 5,
          select: { id: true, status: true, provider: true, updatedAt: true, _count: { select: { segments: true } } },
        },
      },
    }),
    prisma.coachingNote.findMany({
      where: {
        authorUserId: userId,
        kind: "SESSION_NOTE",
        room: roomAccess(userId, isStaff),
      },
      orderBy: { updatedAt: "desc" },
      take: 300,
      select: {
        id: true,
        title: true,
        body: true,
        sourceJson: true,
        createdAt: true,
        updatedAt: true,
        room: {
          select: {
            id: true,
            title: true,
            project: { select: { id: true, name: true, slug: true } },
          },
        },
        tagLinks: {
          orderBy: { createdAt: "asc" },
          select: { tag: { select: { id: true, label: true, slug: true, projectId: true, isActive: true } } },
        },
      },
    }),
    projectIds.length ? prisma.studioSourceUnit.findMany({
      where: { projectId: { in: projectIds }, immutableText: { not: null } },
      orderBy: { updatedAt: "desc" },
      take: 200,
      select: {
        id: true,
        title: true,
        kind: true,
        author: true,
        updatedAt: true,
        project: { select: { name: true, slug: true } },
        annotations: {
          where: {
            archivedAt: null,
            status: { in: ["active", "resolved"] },
            OR: [{ visibility: "project" }, { createdByUserId: userId }],
          },
          orderBy: { updatedAt: "desc" },
          take: 100,
          select: { id: true, kind: true, body: true, exactText: true, visibility: true },
        },
      },
    }) : Promise.resolve([]),
    projectIds.length ? prisma.studioDocument.findMany({
      where: { projectId: { in: projectIds } },
      orderBy: { updatedAt: "desc" },
      take: 200,
      select: {
        id: true,
        title: true,
        sourceLabel: true,
        projectionStatus: true,
        updatedAt: true,
        project: { select: { name: true, slug: true } },
        blocks: {
          where: { archivedAt: null },
          orderBy: { order: "asc" },
          take: 4,
          select: { id: true, title: true, body: true },
        },
        episodeProductions: { orderBy: { updatedAt: "desc" }, take: 1, select: { slug: true, title: true, status: true } },
        _count: { select: { blocks: { where: { archivedAt: null } } } },
      },
    }) : Promise.resolve([]),
    projectIds.length ? prisma.studioMediaAsset.findMany({
      where: { projects: { some: { id: { in: projectIds } } } },
      orderBy: { updatedAt: "desc" },
      take: 200,
      select: {
        id: true,
        filename: true,
        mimeType: true,
        duration: true,
        isProxy: true,
        updatedAt: true,
        projects: { where: { id: { in: projectIds } }, select: { id: true, name: true, slug: true } },
        _count: { select: { sourceUnits: true, clips: true } },
      },
    }) : Promise.resolve([]),
    Promise.all([
      prisma.collection.count({ where: { userId } }),
      prisma.snippet.count({ where: { userId } }),
      prisma.bookmark.count({ where: { userId } }),
    ]),
    prisma.snippet.findFirst({ where: { userId }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    prisma.bookmark.findFirst({ where: { userId }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
  ]);

  const [collectionCount, snippetCount, bookmarkCount] = savedCounts;
  const savedUpdatedAt = [latestSnippet?.updatedAt, latestBookmark?.updatedAt]
    .filter(Boolean)
    .sort((left: Date, right: Date) => right.getTime() - left.getTime())[0] ?? null;

  const library = buildLibraryEntries({
    sessions: sessions.map((session: any) => ({
      ...session,
      project: session.project && visibleProjectIds.has(session.project.id) ? session.project : null,
    })),
    notes: notes.map((note: any) => ({
      ...note,
      room: {
        ...note.room,
        project: note.room.project && visibleProjectIds.has(note.room.project.id) ? note.room.project : null,
      },
      tags: (note.tagLinks || [])
        .map((link: any) => link.tag)
        .filter((tag: any) => tag.isActive && visibleProjectIds.has(tag.projectId)),
    })),
    sources,
    documents,
    media,
    saved: { collectionCount, snippetCount, bookmarkCount, updatedAt: savedUpdatedAt },
  });
  const expectedHomeSlug = homeNestSlugForEmail(actorEmail);
  const homeNest = projects.find((project) =>
    project.slug === expectedHomeSlug && (project.role === "OWNER" || project.role === "EDITOR"),
  ) ?? null;
  return {
    ...library,
    homeNest: homeNest ? { id: homeNest.id, slug: homeNest.slug, name: homeNest.name } : null,
  };
}

function formatDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.getTime() === 0) return "Date not recorded";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

const kindDetails: Record<LibraryKind, { label: string; icon: typeof Library; tone: string }> = {
  SESSION: { label: "Session source", icon: FileAudio, tone: "border-sky-200 bg-sky-50 text-sky-800" },
  NOTE: { label: "Note", icon: MessageSquareText, tone: "border-teal-200 bg-teal-50 text-teal-800" },
  SOURCE: { label: "Research source", icon: Highlighter, tone: "border-amber-200 bg-amber-50 text-amber-800" },
  DOCUMENT: { label: "Document", icon: BookOpenText, tone: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  MEDIA: { label: "Studio media", icon: Film, tone: "border-violet-200 bg-violet-50 text-violet-800" },
  SAVED: { label: "Saved capture", icon: FileText, tone: "border-stone-200 bg-stone-50 text-stone-700" },
};

function LibraryCard({ entry }: { entry: LibraryEntry }) {
  const detail = kindDetails[entry.kind];
  const Icon = detail.icon;
  return <article className="flex h-full flex-col rounded-2xl border border-[#e5d5b7] bg-white p-5 shadow-sm">
    <div className="flex items-start justify-between gap-3"><span className={`rounded-xl border p-2 ${detail.tone}`}><Icon className="h-5 w-5" aria-hidden="true" /></span><span className="rounded-full border border-[#e8dcc4] bg-[#fffaf3] px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-[#765f40]">{entry.stateLabel}</span></div>
    <p className="mt-4 text-[10px] font-black uppercase tracking-[0.16em] text-[#987443]">{detail.label}{entry.projectName ? ` · ${entry.projectName}` : ""}</p>
    <h2 className="mt-1 font-serif text-xl font-black leading-snug text-[#3d3122]">{entry.title}</h2>
    <p className="mt-2 text-sm font-semibold leading-6 text-[#765f40]">{entry.detail}</p>
    <div className="mt-4 flex flex-wrap gap-2">{entry.badges.map((badge) => <span key={badge} className="rounded-full border border-[#ead8b4] bg-[#fffaf3] px-2.5 py-1 text-[10px] font-bold text-[#806a4d]">{badge}</span>)}</div>
    <div className="mt-auto pt-5"><p className="text-[10px] font-bold uppercase tracking-wide text-[#927b5b]">Updated {formatDate(entry.updatedAt)}</p><Link href={entry.href} className="mt-3 inline-flex min-h-11 items-center rounded-full bg-[#3e2f21] px-4 py-2.5 text-xs font-black uppercase tracking-wide text-white">Continue with source</Link></div>
  </article>;
}

function filterHref(kind: string, query: string) {
  const params = new URLSearchParams();
  if (kind && kind !== "ALL") params.set("kind", kind);
  if (query) params.set("q", query);
  const search = params.toString();
  return `/library${search ? `?${search}` : ""}`;
}

export default async function LibraryPage({ searchParams }: { searchParams?: Promise<{ q?: string | string[]; kind?: string | string[] }> } = {}) {
  const session = await getQuipslySession();
  if (!session?.user) return <StudioAccessShell mode="signed-out" redirectTo="/library" />;
  const params = await (searchParams ?? Promise.resolve<{ q?: string | string[]; kind?: string | string[] }>({}));
  const query = typeof params.q === "string" ? params.q.trim().slice(0, 200) : "";
  const requestedKind = typeof params.kind === "string" ? params.kind.trim().toUpperCase() : "ALL";
  const kind = (["ALL", "SESSION", "NOTE", "SOURCE", "DOCUMENT", "MEDIA", "SAVED"] as const).includes(requestedKind as any) ? requestedKind : "ALL";

  try {
    const actorEmail = (session.user.primaryEmail || session.user.email || "").trim().toLowerCase();
    const library = await loadLibrary(session.user.id, actorEmail, session.user.isStaff);
    const entries = filterLibraryEntries(library.entries, { query, kind });
    return <main className="mx-auto max-w-[1420px] space-y-7 px-2 py-2 text-[#3d3122]">
      <header className="overflow-hidden rounded-[2rem] border border-[#dfcba6] bg-[radial-gradient(circle_at_top_right,_#d7eadf,_transparent_42%),linear-gradient(135deg,#fffaf0,#f8edda)] p-6 shadow-sm md:p-8">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-[#76522c]">Library</p>
        <h1 className="mt-2 max-w-4xl font-serif text-4xl font-black tracking-tight md:text-5xl">Every source keeps its identity. One place to continue.</h1>
        <p className="mt-3 max-w-4xl text-sm font-semibold leading-6 text-[#715a3e]">Library indexes canonical records without flattening them: Session owns capture evidence, Research owns immutable text and annotation anchors, Documents own writing revisions, and Studio owns reusable media references. The iPhone keeps unsynced originals locally until verified upload.</p>
        {library.homeNest ? <form action={createDocumentAction.bind(null, library.homeNest.slug, "note")} className="mt-5">
          <button type="submit" className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[#3e2f21] px-5 py-3 text-xs font-black uppercase tracking-wide text-white shadow-sm"><FilePlus2 size={17} aria-hidden="true" />Quick note in {library.homeNest.name}</button>
          <p className="mt-2 text-xs font-semibold text-[#715a3e]">Creates one private document-kernel note, then opens it for writing. Nothing is sent, scheduled, or published.</p>
        </form> : null}
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-6" aria-label="Library counts">{[
          ["Sessions", library.counts.sessions], ["Notes", library.counts.notes], ["Sources", library.counts.sources], ["Documents", library.counts.documents], ["Media", library.counts.media], ["Saved", library.counts.saved],
        ].map(([label, value]) => <div key={label} className="rounded-2xl border border-white/80 bg-white/75 p-4"><p className="text-3xl font-black">{value}</p><p className="text-[10px] font-black uppercase tracking-wide text-[#806a4d]">{label}</p></div>)}</div>
      </header>

      <section aria-label="Library filters" className="rounded-3xl border border-[#e5d5b7] bg-white p-4 shadow-sm md:p-5">
        <form method="GET" action="/library" className="flex flex-col gap-3 md:flex-row md:items-center"><label className="relative flex-1"><span className="sr-only">Search Library</span><Search className="absolute left-3 top-3 h-5 w-5 text-[#927b5b]" aria-hidden="true" /><input name="q" defaultValue={query} maxLength={200} placeholder="Search titles, transcript filenames, annotations, manuscripts…" className="w-full rounded-xl border border-[#d9c7a5] bg-[#fffdf8] py-2.5 pl-10 pr-3 text-sm font-semibold" /></label>{kind !== "ALL" && <input type="hidden" name="kind" value={kind} />}<button type="submit" className="rounded-xl bg-[#3e2f21] px-5 py-3 text-xs font-black uppercase tracking-wide text-white">Search</button></form>
        <nav aria-label="Library kinds" className="mt-4 flex flex-wrap gap-2">{(["ALL", "SESSION", "NOTE", "SOURCE", "DOCUMENT", "MEDIA", "SAVED"] as const).map((value) => <Link key={value} href={filterHref(value, query)} aria-current={kind === value ? "page" : undefined} className={`rounded-full border px-3 py-2 text-[10px] font-black uppercase tracking-wide ${kind === value ? "border-[#3e2f21] bg-[#3e2f21] text-white" : "border-[#d9c7a5] bg-[#fffaf3] text-[#765f40]"}`}>{value === "ALL" ? "Everything" : value.toLowerCase()}</Link>)}</nav>
      </section>

      <section aria-labelledby="library-results"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-[#987443]">Permission-filtered continuation</p><h2 id="library-results" className="mt-1 font-serif text-3xl font-black">{entries.length} source{entries.length === 1 ? "" : "s"}</h2></div><div className="flex flex-wrap gap-2"><Link href="/research" className="rounded-full border border-[#d9c7a5] bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-[#5b472f]">Research workbench</Link><Link href="/media" className="rounded-full border border-[#d9c7a5] bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-[#5b472f]">Media Vault</Link></div></div>
        {entries.length ? <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{entries.map((entry) => <LibraryCard key={entry.id} entry={entry} />)}</div> : <div className="mt-4 rounded-2xl border border-dashed border-[#d8c7a7] bg-white/55 p-8 text-sm font-semibold text-[#765f40]">No accessible canonical source matches this filter. Library does not insert sample books, recordings, transcripts, or media.</div>}
      </section>

      <footer className="rounded-2xl border border-[#e4d3b3] bg-[#fffaf0] p-5 text-xs font-semibold leading-5 text-[#765f40]">Library results are a read-only index. The explicit Quick note control creates one private Home Nest document; browsing and filtering do not copy bytes, merge identities, rewrite source text, expose private annotations, run transcription, or publish anything. Capture-promoted Studio media is deduplicated here under its owning Session while standalone reusable media remains visible.</footer>
    </main>;
  } catch (error) {
    console.error("[library] failed to load permission-filtered sources", error);
    return <main className="mx-auto grid min-h-[70vh] max-w-3xl place-items-center px-4 py-10 text-[#3d3122]"><section role="status" aria-label="Library unavailable" className="w-full rounded-3xl border border-amber-200 bg-amber-50 p-7"><CircleAlert className="h-8 w-8 text-amber-700" aria-hidden="true" /><p className="mt-5 text-xs font-black uppercase tracking-wide text-amber-800">Private read unavailable</p><h1 className="mt-2 font-serif text-3xl font-black">Library could not be verified</h1><p className="mt-3 font-semibold text-[#765f40]">No sample source is standing in, and no saved record was changed.</p><Link href="/library" className="mt-5 inline-flex rounded-full border border-amber-300 bg-white px-5 py-2.5 text-xs font-black uppercase tracking-wide text-amber-900">Retry read</Link></section></main>;
  }
}
