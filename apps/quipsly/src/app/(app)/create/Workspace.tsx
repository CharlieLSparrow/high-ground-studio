"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import PublisherModePanel from "./PublisherModePanel";
import Tagger from "./Tagger";
import { EditorExtensionProvider } from "./registry/EditorExtensionRegistry";
import { coreBlockCards } from "./registry/coreBlockCards";
import ViewFilter from "./ViewFilter";
import { DocumentBoundary, ViewDefinition } from "./types";
import { QuipslyAssistantSidebar } from "@/components/QuipslyAssistantSidebar";

export const DEFAULT_VIEW: ViewDefinition = {
  id: "default",
  name: "Everything Mode",
  type: "default",
  filters: { tagSlugs: [], includeCategories: [] },
  display: { mode: "standard", showContext: true, collapseUnmatched: false }
};



function viewSlug(view: ViewDefinition) {
  return view.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function boundarySlug(boundary: DocumentBoundary) {
  return boundary.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function episodeSlugFromView(view: ViewDefinition): string | null {
  const tagSlug = view.filters.tagSlugs.find((slug) => /^episode-[a-z0-9-]+$/i.test(slug));
  if (tagSlug) return tagSlug.toLowerCase();

  const episodeMatch = view.name.match(/\bepisode\s+([a-z0-9]+(?:[-\s][a-z0-9]+)*)/i);
  if (!episodeMatch) return null;

  const episodePart = episodeMatch[1].toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return episodePart ? `episode-${episodePart}` : null;
}

function episodeLabelFromView(view: ViewDefinition): string | null {
  const tagSlug = view.filters.tagSlugs.find((slug) => /^episode-[a-z0-9-]+$/i.test(slug));
  if (tagSlug) {
    return tagSlug
      .replace(/^episode-/i, "Episode ")
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  const episodeMatch = view.name.replace(/\s+view$/i, "").match(/\bepisode\s+([a-z0-9]+(?:[-\s][a-z0-9]+)*)/i);
  if (!episodeMatch) return null;
  return `Episode ${episodeMatch[1].replace(/[-_]+/g, " ")}`;
}

function titleFromBlockText(text: string) {
  const firstLine = text.split("\n")[0].trim();
  if (firstLine) return firstLine;
  return "Untitled section";
}

function boundaryKindFromTagIds(tagIds: string[]): DocumentBoundary["kind"] | null {
  const normalized = tagIds.map((tagId) => tagId.toLowerCase());
  const hasEpisodeTag = normalized.includes("episode");
  const hasChapterTag = normalized.includes("chapter");

  if (hasEpisodeTag) return "episode";
  if (hasChapterTag) return "chapter";
  return null;
}

function deriveBoundaryFromTags(block: { text: string; tags?: string[]; spans?: { tagSlug: string }[] }) {
  const blockTags = Array.from(new Set([
    ...(block.tags ?? []),
    ...((block.spans ?? []).map((span) => span.tagSlug))
  ]));

  const kind = boundaryKindFromTagIds(blockTags);
  if (!kind) return null;

  const label = titleFromBlockText(block.text) || (kind === "episode" ? "Episode" : "Chapter");
  return {
    label,
    kind
  };
}

function deriveDocumentBoundaries(blocks: Array<{ id: string; text: string; tags?: string[]; spans?: { tagSlug: string }[] }>): DocumentBoundary[] {
  const starts = blocks
    .map((block, index) => {
      const taggedBoundary = deriveBoundaryFromTags(block);
      if (!taggedBoundary) return null;

      return {
        id: `boundary-${block.id}`,
        blockId: block.id,
        label: taggedBoundary.label,
        kind: taggedBoundary.kind,
        startIndex: index,
        endIndex: blocks.length - 1
      } satisfies DocumentBoundary;
    })
    .filter((boundary): boundary is DocumentBoundary => Boolean(boundary));

  return starts.map((boundary, index) => ({
    ...boundary,
    endIndex: (starts[index + 1]?.startIndex ?? blocks.length) - 1
  }));
}

export default function Workspace({ 
  initialBlocks, 
  initialViews,
  projectId, 
  projectSlug,
  projectName,
  documentId,
  documentTitle,
  persistenceMode = "database",
  availableProjects = [],
  isDefaultFallback = false
}: { 
  initialBlocks: any[], 
  initialViews: ViewDefinition[],
  projectId: string, 
  projectSlug?: string,
  projectName?: string,
  documentId: string,
  documentTitle?: string,
  persistenceMode?: "database" | "offline",
  availableProjects?: { slug: string; name: string; nestKind?: string }[],
  isDefaultFallback?: boolean
}) {
  const [activeView, setActiveView] = useState<ViewDefinition>(DEFAULT_VIEW);
  const [documentBlocks, setDocumentBlocks] = useState(initialBlocks);
  const documentBoundaries = useMemo(() => deriveDocumentBoundaries(documentBlocks), [documentBlocks]);
  const [activeBoundaryId, setActiveBoundaryId] = useState<string | null>(null);
  const [scrolledBoundaryId, setScrolledBoundaryId] = useState<string | null>(null);
  const activeBoundary = documentBoundaries.find((boundary) => boundary.id === activeBoundaryId) ?? null;
  const activeEpisodeSlug = activeBoundary?.kind === "episode" ? boundarySlug(activeBoundary) : episodeSlugFromView(activeView);
  const activeEpisodeLabel = activeBoundary?.kind === "episode" ? activeBoundary.label : episodeLabelFromView(activeView);
  const activeEpisodeQuery = activeEpisodeSlug ? `&episode=${encodeURIComponent(activeEpisodeSlug)}` : "";
  const visibleAssistantBlocks = useMemo(() => {
    return documentBlocks
      .filter((block, index) => !activeBoundary || (index >= activeBoundary.startIndex && index <= activeBoundary.endIndex))
      .slice(0, 18)
      .map((block) => ({
        id: block.id,
        text: block.text,
        tags: Array.from(new Set([
          ...(block.tags ?? []),
          ...((block.spans ?? []).map((span: { tagSlug: string }) => span.tagSlug))
        ]))
      }));
  }, [activeBoundary, documentBlocks]);
  const [publisherMode, setPublisherMode] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "unsaved">("saved");
  // Optional ad-hoc tag filters still exist as data plumbing, but the author-facing
  // sidebar now treats Chapter/Episode heading tags as the primary navigation model.
  const [adHocTags] = useState<string[]>([]);
  const [views, setViews] = useState<ViewDefinition[]>(initialViews);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const activeProjectSlug = projectSlug ?? "";
  const manuscriptHref = `/create?project=${encodeURIComponent(activeProjectSlug)}${publisherMode ? "&publisher=1" : ""}`;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const publisherParam = params.get("publisher");
    const storedPublisherMode = window.localStorage.getItem("quipsly.publisherMode") === "1";
    if (publisherParam === "1" || storedPublisherMode) {
      setPublisherMode(true);
      window.localStorage.setItem("quipsly.publisherMode", "1");
    }

    const slug = params.get("view");
    const boundary = params.get("boundary");
    if (boundary) {
      const nextBoundary = documentBoundaries.find((item) => boundarySlug(item) === boundary);
      if (nextBoundary) {
        setActiveBoundaryId(nextBoundary.id);
        setActiveView(DEFAULT_VIEW);
        return;
      }
    }

    if (!slug) return;

    const nextView = [DEFAULT_VIEW, ...views].find((view) => viewSlug(view) === slug);
    if (nextView) setActiveView(nextView);
  }, [documentBoundaries, views]);

  useEffect(() => {
    setViews(initialViews);
    setDocumentBlocks(initialBlocks);
  }, [initialViews, initialBlocks]);

  const handleDocumentBlocksChange = (nextBlocks: any[]) => {
    setDocumentBlocks(nextBlocks);
  };

  useEffect(() => {
    if (!activeBoundaryId) return;
    const stillExists = documentBoundaries.some((boundary) => boundary.id === activeBoundaryId);
    if (!stillExists) setActiveBoundaryId(null);
  }, [activeBoundaryId, documentBoundaries]);

  useEffect(() => {
    const handleSaveState = (event: Event) => {
      const detail = (event as CustomEvent<{ state?: "saved" | "saving" | "unsaved" }>).detail;
      if (detail?.state) setSaveState(detail.state);
    };

    window.addEventListener("quipsly:save-state", handleSaveState);
    return () => window.removeEventListener("quipsly:save-state", handleSaveState);
  }, []);

  const handleActiveViewChange = (view: ViewDefinition) => {
    setActiveBoundaryId(null);
    setActiveView(view);
    const url = new URL(window.location.href);
    url.searchParams.delete("boundary");
    if (view.id === DEFAULT_VIEW.id) {
      url.searchParams.delete("view");
    } else {
      url.searchParams.set("view", viewSlug(view));
    }
    window.history.replaceState(null, "", url);
  };

  const handleActiveBoundaryChange = (boundaryId: string | null) => {
    setActiveBoundaryId(boundaryId);
    setActiveView(DEFAULT_VIEW);
    const url = new URL(window.location.href);
    url.searchParams.delete("view");
    const boundary = documentBoundaries.find((item) => item.id === boundaryId);
    if (boundary) {
      url.searchParams.set("boundary", boundarySlug(boundary));
    } else {
      url.searchParams.delete("boundary");
    }
    window.history.replaceState(null, "", url);

    if (boundary) {
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent("quipsly:focus-block", {
          detail: { blockId: boundary.blockId }
        }));
      }, 0);
    }
  };

  const togglePublisherMode = () => {
    const nextValue = !publisherMode;
    setPublisherMode(nextValue);
    if (nextValue) {
      window.localStorage.setItem("quipsly.publisherMode", "1");
    } else {
      window.localStorage.removeItem("quipsly.publisherMode");
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-4rem)] bg-[#fdfaf6] text-[#3d3122]">
      {/* Left sidebar - ViewFilter */}
      <ViewFilter 
         activeView={activeView} 
         setActiveView={handleActiveViewChange}
         views={views}
         documentBoundaries={documentBoundaries}
         activeBoundaryId={activeBoundaryId}
         setActiveBoundaryId={handleActiveBoundaryChange}
         scrolledBoundaryId={scrolledBoundaryId}
      />
      {/* Main editor area */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 md:p-8 relative">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6 md:mb-8 rounded-2xl border border-[#e8dcc4] bg-white/80 p-4 md:p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.22em] text-[#a36f2e] flex items-center gap-2">
                  <span title="This workspace is private to your organization" className="flex items-center gap-1"><span className="text-[10px]">🔒</span> Private</span>
                  <span className="opacity-50">•</span>
                  <span>{projectName ?? "Quipsly Live"} / Living Document Nest</span>
                </div>
                <h1 className="mt-1 text-2xl md:text-3xl font-bold font-serif text-[#342618]">
                  {documentTitle ?? "High Ground Odyssey Tonight Pack"}
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6b5b45]">
                Write in one continuous original content document. Make a heading block, tag it Chapter or Episode, and the outline becomes your navigation from that point until the next heading.
                  <br />
                  <span className="font-medium text-[#8c6b4a] opacity-90 mt-1 inline-block">💡 <strong>Pro tip:</strong> Press Enter to split blocks. Backspace at the start of a block merges it up.</span>
                </p>
              </div>
              <div className="bg-amber-100 text-amber-800 px-3 py-1 rounded-full text-xs font-bold border border-amber-200 shadow-sm flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                View: {activeBoundary?.label ?? activeView.name}
              </div>
              {activeBoundary ? (
                <button
                  type="button"
                  onClick={() => handleActiveBoundaryChange(null)}
                  className="rounded-full border border-[#d9c7a5] bg-white px-3 py-1 text-xs font-bold text-[#6b5b45] shadow-sm transition-colors hover:bg-[#f8f1e3]"
                >
                  Show full document
                </button>
              ) : null}
              <div className={`px-3 py-1 rounded-full text-xs font-bold border shadow-sm flex items-center gap-2 ${
                saveState === "saving"
                  ? "border-blue-200 bg-blue-50 text-blue-800"
                  : saveState === "unsaved"
                    ? "border-orange-200 bg-orange-50 text-orange-800"
                    : "border-emerald-200 bg-emerald-50 text-emerald-800"
              }`}>
                <span className={`w-2 h-2 rounded-full ${
                  saveState === "saving"
                    ? "bg-blue-500 animate-pulse"
                    : saveState === "unsaved"
                      ? "bg-orange-500"
                      : "bg-emerald-500"
                }`}></span>
                {saveState === "saving" ? "Saving" : saveState === "unsaved" ? "Unsaved edits" : "Saved"}
              </div>
              {publisherMode ? (
                <button
                  type="button"
                  onClick={togglePublisherMode}
                  className="rounded-full border border-[#d3a24f] bg-[#fff5df] px-3 py-1 text-xs font-bold text-[#9a5f13] shadow-sm transition-colors hover:bg-[#ffeac0]"
                >
                  Publisher Mode On
                </button>
              ) : null}
            </div>
            <div className="flex flex-nowrap overflow-x-auto hide-scrollbar items-center gap-2 pb-1">
              <div className="mr-2 shrink-0 flex flex-nowrap items-center gap-1 rounded-full border border-[#e6d7bc] bg-[#f8f1e3] p-1">
                <span className="pl-3 pr-1 text-[10px] font-bold uppercase tracking-wider text-[#a36f2e]">Nest:</span>
                {(availableProjects || []).map((project) => (
                  <Link
                    key={project.slug}
                    href={`/create?project=${encodeURIComponent(project.slug)}${publisherMode ? "&publisher=1" : ""}`}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                      activeProjectSlug === project.slug
                        ? "bg-[#3d3122] text-white shadow-sm"
                        : "text-[#6b5b45] hover:bg-white"
                    }`}
                  >
                    {project.name}
                  </Link>
                ))}
              </div>
              <Link
                href="/projects"
                className="shrink-0 rounded-full border border-[#d9c7a5] bg-white px-4 py-2 text-xs font-bold text-[#5e4b33] shadow-sm transition-colors hover:bg-[#f8f3e6]"
              >
                Manage Nests
              </Link>
              <Link
                href={manuscriptHref}
                className="shrink-0 rounded-full border border-[#c8a66b] bg-[#3d3122] px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-[#59442d]"
              >
                Manuscript
              </Link>
              <Link
                href={`/recorder?project=${encodeURIComponent(activeProjectSlug)}${activeEpisodeQuery}`}
                className="shrink-0 rounded-full border border-[#d3a24f] bg-[#fff5df] px-4 py-2 text-xs font-bold text-[#9a5f13] shadow-sm transition-colors hover:bg-[#ffeac0]"
              >
                {activeEpisodeLabel ? `Record ${activeEpisodeLabel}` : "Record Room"}
              </Link>
              <Link
                href={`/editor?project=${encodeURIComponent(activeProjectSlug)}${activeEpisodeQuery}`}
                className="shrink-0 rounded-full border border-[#d9c7a5] bg-white px-4 py-2 text-xs font-bold text-[#5e4b33] shadow-sm transition-colors hover:bg-[#f8f3e6]"
              >
                {activeEpisodeLabel ? `Edit ${activeEpisodeLabel}` : "Video Editor"}
              </Link>
              {activeEpisodeLabel ? (
                <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-800">
                  Producing: {activeEpisodeLabel}
                </span>
              ) : null}
              {publisherMode ? (
                <Link
                  href="/kernel-lab"
                  className="shrink-0 rounded-full border border-[#d3a24f] bg-[#fff5df] px-4 py-2 text-xs font-bold text-[#9a5f13] shadow-sm transition-colors hover:bg-[#ffeac0]"
                >
                  Kernel Lab
                </Link>
              ) : null}
              <Link
                href="/files"
                className="shrink-0 rounded-full border border-[#d9c7a5] bg-white px-4 py-2 text-xs font-bold text-[#5e4b33] shadow-sm transition-colors hover:bg-[#f8f3e6]"
              >
                Media Files
              </Link>
              <Link
                href="/study"
                className="shrink-0 rounded-full border border-[#d9c7a5] bg-white px-4 py-2 text-xs font-bold text-[#5e4b33] shadow-sm transition-colors hover:bg-[#f8f3e6]"
              >
                Study Notes
              </Link>
            </div>
          </div>

          {publisherMode ? (
            <PublisherModePanel activeView={activeView} documentTitle={documentTitle} projectSlug={activeProjectSlug} projectId={projectId} />
          ) : null}

          {persistenceMode === "offline" ? (
            <div className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-900 shadow-sm">
              <strong className="font-bold">Offline browser lab:</strong> DATABASE_URL is not set, so this workbench is running from starter state. Text and tag clicks are safe to test, but they will not persist until the database environment is wired.
            </div>
          ) : null}

          {isDefaultFallback ? (
            <div className="mb-6 rounded-2xl border border-[#d3a24f] bg-[#fff5df] px-5 py-4 text-sm leading-6 text-[#9a5f13] shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <strong className="font-bold uppercase tracking-wider text-[11px] block mb-1">Implicit Project Scope</strong>
                No explicit Nest was selected, so you have been routed to the default High Ground Odyssey manuscript.
              </div>
              <Link href="/projects" className="shrink-0 rounded-full border border-[#c8a66b] bg-[#3d3122] px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-[#59442d]">
                Choose a Nest
              </Link>
            </div>
          ) : null}
          
          <div className="bg-white p-4 md:p-12 rounded-2xl shadow-sm border border-[#e8dcc4] min-h-[800px]">
            <EditorExtensionProvider customCards={coreBlockCards}>
              <Tagger 
                key={`${activeProjectSlug}:${documentId}`}
                activeView={activeView} 
                activeBoundaryId={activeBoundaryId}
                documentBoundaries={documentBoundaries}
                adHocTags={adHocTags} 
                initialBlocks={initialBlocks}
                projectId={projectId}
                documentId={documentId}
                scrollContainerRef={scrollContainerRef}
                onBlocksChange={handleDocumentBlocksChange}
                onActiveScrollBoundaryChange={setScrolledBoundaryId}
              />
            </EditorExtensionProvider>
          </div>
        </div>
      </div>
      <QuipslyAssistantSidebar
        projectId={projectId}
        projectSlug={activeProjectSlug}
        documentId={documentId}
        documentTitle={documentTitle}
        activeBoundary={activeBoundary}
        activeView={activeView}
        visibleBlocks={visibleAssistantBlocks}
        patreonHref={process.env.NEXT_PUBLIC_PATREON_URL}
      />
    </div>
  );
}
