"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bookmark,
  CircleAlert,
  FileInput,
  Folder,
  Inbox,
  Quote,
  Search,
} from "lucide-react";

import { filePersonalSourceIntoResearchAction } from "./actions";

import {
  filterCollectionItems,
  type CollectionsSnapshot,
  type CollectionItem,
  type WritableResearchProject,
} from "./collections-model";

function formatUpdated(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Updated date needs review";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  }).format(date);
}

function formatCaptureTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Capture time needs review";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function ResearchFilingControl({ item, projects }: { item: CollectionItem; projects: WritableResearchProject[] }) {
  const router = useRouter();
  const availableProjects = projects.filter((project) => !item.researchFilings.some((filing) => filing.projectId === project.id));
  const [projectSlug, setProjectSlug] = useState(availableProjects[0]?.slug ?? "");
  const [notice, setNotice] = useState<string | null>(null);
  const requestIdRef = useRef<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function fileSource() {
    if (!projectSlug) return;
    startTransition(async () => {
      requestIdRef.current ??= crypto.randomUUID();
      try {
        const result = await filePersonalSourceIntoResearchAction({
          captureId: item.id,
          captureType: item.itemType.toUpperCase(),
          projectSlug,
          clientRequestId: requestIdRef.current,
        });
        if (!result.ok) {
          setNotice(result.message);
          return;
        }
        requestIdRef.current = null;
        router.push(result.href);
      } catch {
        setNotice("Nest did not confirm the filing. Retry will reuse the same filing identity.");
      }
    });
  }

  return (
    <div className="mt-4 rounded-xl border border-cyan-200 bg-cyan-50/70 p-3">
      <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-cyan-900"><FileInput size={13} aria-hidden="true" /> Research filing</p>
      {item.researchFilings.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {item.researchFilings.map((filing) => (
            <Link key={filing.id} href={`/research?source=${encodeURIComponent(filing.sourceUnitId)}`} className="rounded-full border border-cyan-300 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-cyan-950">
              Open in {filing.projectName}
            </Link>
          ))}
        </div>
      ) : <p className="mt-1 text-xs font-semibold text-cyan-950">Not in a shared Research Nest yet.</p>}

      {availableProjects.length > 0 ? (
        <div className="mt-3">
          <label className="block text-[10px] font-black uppercase tracking-wide text-cyan-950">
            Destination Nest
            <select value={projectSlug} onChange={(event) => { setProjectSlug(event.target.value); setNotice(null); }} className="mt-1.5 w-full rounded-lg border border-cyan-300 bg-white px-3 py-2 text-xs font-bold normal-case tracking-normal text-[#3d3122]">
              {availableProjects.map((project) => <option key={project.id} value={project.slug}>{project.name}</option>)}
            </select>
          </label>
          <button type="button" onClick={fileSource} disabled={isPending || !projectSlug} className="mt-2 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-cyan-950 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-white disabled:cursor-not-allowed disabled:opacity-50">
            {isPending ? "Filing…" : "File into Research"}
          </button>
          <p className="mt-2 text-[11px] font-semibold leading-5 text-cyan-950">This creates preserved evidence visible to that Nest. Your private capture stays unchanged; it does not create work or publish anything.</p>
        </div>
      ) : item.researchFilings.length === 0 ? (
        <p className="mt-2 text-[11px] font-semibold leading-5 text-cyan-950">Editor access to a Nest is required before this source can be shared into Research.</p>
      ) : null}
      {notice ? <p role="status" className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-[11px] font-semibold leading-5 text-red-900">{notice}</p> : null}
    </div>
  );
}

export function CollectionsClient({ snapshot, initialCaptureId = null }: { snapshot: CollectionsSnapshot; initialCaptureId?: string | null }) {
  const [activeCollection, setActiveCollection] = useState("all");
  const [query, setQuery] = useState("");
  const [focusedCaptureId, setFocusedCaptureId] = useState(initialCaptureId);
  const filteredItems = useMemo(
    () => {
      if (snapshot.state !== "ready") return [];
      const items = filterCollectionItems(snapshot.items, activeCollection, query);
      return focusedCaptureId && !query.trim() && activeCollection === "all"
        ? items.filter((item) => item.id === focusedCaptureId)
        : items;
    },
    [activeCollection, focusedCaptureId, query, snapshot],
  );

  return (
    <main className="min-h-full bg-transparent px-6 py-8 lg:px-10">
      <header className="mx-auto max-w-[1400px]">
        <p className="text-xs font-black uppercase tracking-[0.24em] text-[#987443]">Saved sources</p>
        <h1 className="mt-3 font-serif text-4xl font-black tracking-tight text-[#3d3122] lg:text-5xl">
          Collections keep the trail attached.
        </h1>
        <p className="mt-3 max-w-3xl text-base font-semibold leading-relaxed text-[#765f40]">
          Quotes and bookmarks stay connected to their source, note, collection, and owner. This view shows persisted clippings only—never decorative examples.
        </p>
      </header>

      {snapshot.state === "signed-out" ? (
        <section className="mx-auto mt-10 max-w-3xl rounded-3xl border border-[#ead8b4] bg-[#fffaf0] p-8" role="status">
          <CircleAlert className="h-8 w-8 text-amber-700" aria-hidden="true" />
          <h2 className="mt-4 font-serif text-3xl font-black text-[#3d3122]">Private clippings are locked.</h2>
          <p className="mt-2 font-semibold text-[#765f40]">{snapshot.message}</p>
          <Link href="/login?callbackUrl=%2Fcollections" className="mt-5 inline-flex rounded-full bg-[#3e2f21] px-5 py-2.5 text-xs font-black uppercase tracking-wide text-white">Sign in</Link>
        </section>
      ) : snapshot.state === "unavailable" ? (
        <section className="mx-auto mt-10 max-w-3xl rounded-3xl border border-amber-200 bg-amber-50/75 p-8" role="status" aria-label="Collections unavailable">
          <CircleAlert className="h-8 w-8 text-amber-700" aria-hidden="true" />
          <p className="mt-4 text-xs font-black uppercase tracking-[0.2em] text-amber-800">Collections unavailable</p>
          <h2 className="mt-2 font-serif text-3xl font-black text-[#3d3122]">No famous quotes or sample folders are standing in.</h2>
          <p className="mt-3 font-semibold leading-relaxed text-[#765f40]">{snapshot.message} Your saved clippings have not been changed.</p>
          <p className="mt-2 text-sm font-semibold text-[#8a7354]">Auth state: {snapshot.authState === "signed-in" ? "signed in" : "local preview access"}. Persistence state: unavailable.</p>
          <Link href="/collections" className="mt-5 inline-flex rounded-full border border-amber-300 bg-white px-5 py-2.5 text-xs font-black uppercase tracking-wide text-amber-900">Retry read</Link>
        </section>
      ) : (
        <div className="mx-auto mt-9 grid max-w-[1400px] gap-6 lg:grid-cols-[270px_minmax(0,1fr)]">
          <aside className="rounded-3xl border border-[#e5d5b7] bg-[#fffaf1]/80 p-4 shadow-sm" aria-label="Collection filters">
            <div className="px-2 pb-3">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#987443]">Views</p>
              <p className="mt-1 text-sm font-semibold text-[#80694a]">{snapshot.collections.length} collection{snapshot.collections.length === 1 ? "" : "s"} · {snapshot.items.length} saved item{snapshot.items.length === 1 ? "" : "s"}</p>
            </div>
            <div className="space-y-1">
              <button type="button" onClick={() => { setActiveCollection("all"); setFocusedCaptureId(null); }} aria-pressed={activeCollection === "all"} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-black ${activeCollection === "all" ? "bg-[#3e2f21] text-white" : "text-[#5f4b32] hover:bg-white"}`}>
                <Bookmark size={17} aria-hidden="true" /> All saved items
              </button>
              <button type="button" onClick={() => { setActiveCollection("inbox"); setFocusedCaptureId(null); }} aria-pressed={activeCollection === "inbox"} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-black ${activeCollection === "inbox" ? "bg-[#3e2f21] text-white" : "text-[#5f4b32] hover:bg-white"}`}>
                <Inbox size={17} aria-hidden="true" /> Unfiled
              </button>
              {snapshot.collections.map((collection) => (
                <button key={collection.id} type="button" onClick={() => { setActiveCollection(collection.id); setFocusedCaptureId(null); }} aria-pressed={activeCollection === collection.id} className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left ${activeCollection === collection.id ? "bg-[#3e2f21] text-white" : "text-[#5f4b32] hover:bg-white"}`}>
                  <Folder size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-black">{collection.name}</span>
                    <span className={`mt-0.5 block text-[11px] font-bold ${activeCollection === collection.id ? "text-white/70" : "text-[#9a8465]"}`}>{collection.snippetCount} quote{collection.snippetCount === 1 ? "" : "s"} · {collection.bookmarkCount} bookmark{collection.bookmarkCount === 1 ? "" : "s"}</span>
                  </span>
                </button>
              ))}
            </div>
            <Link href="/research" className="mt-5 inline-flex w-full items-center justify-center rounded-full border border-[#d9c7a5] bg-white px-4 py-2.5 text-xs font-black uppercase tracking-wide text-[#5b472f]">Open source research</Link>
          </aside>

          <section aria-labelledby="saved-items-heading">
            <div className="flex flex-col gap-4 rounded-2xl border border-[#e5d5b7] bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#987443]">Persisted library</p>
                <h2 id="saved-items-heading" className="font-serif text-2xl font-black text-[#3d3122]">Quotes and bookmarks</h2>
              </div>
              <label className="relative block sm:w-80">
                <span className="sr-only">Search saved items</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a7354]" aria-hidden="true" />
                <input value={query} onChange={(event) => { setQuery(event.target.value); setFocusedCaptureId(null); }} placeholder="Search source text, notes, titles…" className="w-full rounded-full border border-[#d9c7a5] bg-[#fffaf1] py-2.5 pl-10 pr-4 text-sm font-semibold text-[#3d3122] outline-none focus:border-amber-700 focus:ring-2 focus:ring-amber-200" />
              </label>
            </div>

            {focusedCaptureId && !query.trim() && activeCollection === "all" ? <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-950"><span>Opened the exact personal source selected in Inbox.</span><button type="button" onClick={() => setFocusedCaptureId(null)} className="rounded-full border border-sky-300 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wide">Show all saved sources</button></div> : null}

            <p className="mt-4 text-sm font-bold text-[#80694a]" aria-live="polite">{filteredItems.length} saved item{filteredItems.length === 1 ? "" : "s"} shown</p>
            {filteredItems.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed border-[#d8c7a7] bg-white/55 p-8 text-center">
                <h3 className="font-serif text-2xl font-black text-[#3d3122]">Nothing persisted in this view.</h3>
                <p className="mt-2 text-sm font-semibold text-[#7a6548]">Change the filter or search. Quipsly will not fabricate clippings to make the library feel busy.</p>
              </div>
            ) : (
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {filteredItems.map((item) => (
                  <article id={`saved-source-${item.id}`} key={`${item.itemType}-${item.id}`} className="flex min-h-64 scroll-mt-24 flex-col rounded-2xl border border-[#e5d5b7] bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <span className={`rounded-xl p-2 ${item.itemType === "snippet" ? "bg-violet-50 text-violet-700" : "bg-emerald-50 text-emerald-700"}`}>
                        {item.itemType === "snippet" ? <Quote size={19} aria-hidden="true" /> : <Bookmark size={19} aria-hidden="true" />}
                      </span>
                      <span className="text-right text-[10px] font-black uppercase tracking-wide text-[#9a8465]">Latest capture<br />{formatUpdated(item.lastCapturedAt)}</span>
                    </div>
                    <h3 className="mt-4 text-sm font-black text-[#3d3122]">{item.title}</h3>
                    <p className={`mt-2 text-sm leading-relaxed text-[#5f4b32] ${item.itemType === "snippet" ? "font-serif text-base" : "font-semibold"}`}>{item.excerpt}</p>
                    {item.note && <p className="mt-3 rounded-xl bg-[#fff8eb] p-3 text-xs font-semibold leading-relaxed text-[#765f40]">Note: {item.note}</p>}
                    <details className="mt-3 rounded-xl border border-[#e8dcc6] bg-[#fffdf8] p-3">
                      <summary className="cursor-pointer text-xs font-black text-[#5f4b32]">{item.captureCount === 1 ? "Captured once" : `Captured ${item.captureCount} times`}</summary>
                      <div className="mt-2 space-y-2 text-[11px] font-semibold leading-5 text-[#80694a]">
                        {item.captureHistory.length ? item.captureHistory.map((receipt, index) => (
                          <p key={receipt.id}><span className="font-black">{index === 0 ? "Latest" : `Earlier ${index}`}: </span>{formatCaptureTime(receipt.capturedAt)}{receipt.title && receipt.title !== item.title ? ` · ${receipt.title}` : ""}</p>
                        )) : <p>Legacy saved source · exact capture receipt predates history tracking.</p>}
                        {item.captureCount > item.captureHistory.length ? <p>{item.captureCount - item.captureHistory.length} older capture{item.captureCount - item.captureHistory.length === 1 ? "" : "s"} retained in the receipt ledger.</p> : null}
                      </div>
                    </details>
                    {snapshot.authState === "signed-in" ? <ResearchFilingControl item={item} projects={snapshot.writableResearchProjects} /> : null}
                    <div className="mt-auto border-t border-[#f0e8d9] pt-4 text-xs font-bold text-[#80694a]">
                      <p>{item.collectionName || "Unfiled"}</p>
                      {item.sourceUrl ? <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 block truncate text-[#76522c] underline decoration-[#d1b98d] underline-offset-2">{item.sourceLabel}</a> : <p className="mt-1">{item.sourceLabel}</p>}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
