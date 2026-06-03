"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import PublisherModePanel from "./PublisherModePanel";
import Tagger from "./Tagger";
import ViewFilter from "./ViewFilter";
import { DocumentBoundary, ViewDefinition } from "./types";
import { bulkNormalizeHeadings, createEpisodeView, saveBlockContent } from "./actions";

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

function episodeTagFromView(view: ViewDefinition): string | null {
  const tagSlug = view.filters.tagSlugs.find((slug) => /^episode-[a-z0-9-]+$/i.test(slug));
  if (tagSlug) return tagSlug;

  const episodeMatch = view.name.match(/\bepisode\s+([a-z0-9]+(?:[-\s][a-z0-9]+)*)/i);
  if (!episodeMatch) return null;

  const episodePart = episodeMatch[1].toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return episodePart ? `episode-${episodePart}` : null;
}

function labelFromEpisodeTag(tag: string) {
  return tag
    .replace(/^episode-/i, "Episode ")
    .replace(/-/g, " ")
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function titleFromBlockText(text: string) {
  const firstLine = text.split("\n")[0].trim();
  if (firstLine) return firstLine;
  return "Untitled section";
}

type BulkNormalizeResult = {
  ok: boolean;
  updatedCount: number;
  attemptedCount: number;
  skippedCount: number;
  source: "local" | "gemini" | "hybrid";
  updatedBlocks: { blockId: string; nextText: string; }[];
  skippedBlockIds: string[];
  message: string;
};

function boundaryKindFromTagIds(tagIds: string[]): DocumentBoundary["kind"] | null {
  const normalized = tagIds.map((tagId) => tagId.toLowerCase());
  const hasEpisodeTag = normalized.some((tagId) => tagId === "episode" || /^episode-[a-z0-9-]+$/i.test(tagId));
  const hasChapterTag = normalized.some((tagId) => tagId === "chapter" || /^chapter-[a-z0-9-]+$/i.test(tagId));

  if (hasEpisodeTag) return "episode";
  if (hasChapterTag) return "chapter";
  return null;
}

function normalizeBoundaryLine(text: string) {
  const firstLine = text.split("\n")[0].trim();
  if (!firstLine) return "";

  return firstLine
    .replace(/^#{1,6}\s*/, "")
    .replace(/^\s*[\-\*]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function inferBoundaryFromText(text: string): { kind: DocumentBoundary["kind"]; label: string } | null {
  const heading = normalizeBoundaryLine(text);
  if (!heading || heading.length > 140) return null;

  if (/^(preface|introduction|prologue|epilogue|afterword|foreword)$/i.test(heading)) {
    return { kind: "chapter", label: heading };
  }

  const episodeMatch = heading.match(/^ep(?:isode)?\s*[-:\s]*(.+)$/i);
  if (episodeMatch) {
    const rest = episodeMatch[1]?.trim() || "Episode";
    if (rest.length <= 80) {
      return { kind: "episode", label: `Episode ${rest}` };
    }
  }

  const chapterMatch = heading.match(/^chapter\s*[-:\s]*(.+)$/i);
  if (chapterMatch) {
    const rest = chapterMatch[1]?.trim() || "Chapter";
    if (rest.length <= 120) {
      return { kind: "chapter", label: `Chapter ${rest}` };
    }
  }

  return null;
}

function deriveBoundaryFromTags(block: { text: string; tags?: string[]; spans?: { tagSlug: string }[] }) {
  const blockTags = Array.from(new Set([
    ...(block.tags ?? []),
    ...((block.spans ?? []).map((span) => span.tagSlug))
  ]));

  const textBoundary = inferBoundaryFromText(block.text);
  const kind = boundaryKindFromTagIds(blockTags) ?? textBoundary?.kind;
  if (!kind) return null;

  const label = textBoundary?.kind === kind
    ? textBoundary.label
    : titleFromBlockText(block.text) || (kind === "episode" ? "Episode" : "Chapter");
  return {
    label,
    kind
  };
}

function classifyBoundary(text: string): DocumentBoundary["kind"] | null {
  const inferred = inferBoundaryFromText(text);
  return inferred?.kind ?? null;
}

function deriveDocumentBoundaries(blocks: Array<{ id: string; text: string }>): DocumentBoundary[] {
  const starts = blocks
    .map((block, index) => {
      const taggedBoundary = deriveBoundaryFromTags(block as { text: string; tags?: string[]; spans?: { tagSlug: string }[] });
      const kind = taggedBoundary?.kind ?? classifyBoundary(block.text);
      if (!kind) return null;

      const label = taggedBoundary?.label ?? titleFromBlockText(block.text);
      return {
        id: `boundary-${block.id}`,
        blockId: block.id,
        label,
        kind,
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
  availableProjects = []
}: { 
  initialBlocks: any[], 
  initialViews: ViewDefinition[],
  projectId: string, 
  projectSlug?: string,
  projectName?: string,
  documentId: string,
  documentTitle?: string,
  persistenceMode?: "database" | "offline",
  availableProjects?: { slug: string; name: string }[]
}) {
  const [activeView, setActiveView] = useState<ViewDefinition>(DEFAULT_VIEW);
  const [documentBlocks, setDocumentBlocks] = useState(initialBlocks);
  const documentBoundaries = useMemo(() => deriveDocumentBoundaries(documentBlocks), [documentBlocks]);
  const [activeBoundaryId, setActiveBoundaryId] = useState<string | null>(null);
  const activeBoundary = documentBoundaries.find((boundary) => boundary.id === activeBoundaryId) ?? null;
  const activeEpisodeSlug = activeBoundary?.kind === "episode" ? boundarySlug(activeBoundary) : episodeSlugFromView(activeView);
  const activeEpisodeLabel = activeBoundary?.kind === "episode" ? activeBoundary.label : episodeLabelFromView(activeView);
  const activeEpisodeQuery = activeEpisodeSlug ? `&episode=${encodeURIComponent(activeEpisodeSlug)}` : "";
  const [publisherMode, setPublisherMode] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "unsaved">("saved");
  // Optional ad-hoc tag filters applied on top of the active view
  const [adHocTags, setAdHocTags] = useState<string[]>([]);
  const [views, setViews] = useState<ViewDefinition[]>(initialViews);
  const [creatingEpisodeError, setCreatingEpisodeError] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const activeProjectSlug = projectSlug ?? "quipsly-dev-lab";
  const manuscriptHref = `/create?project=${encodeURIComponent(activeProjectSlug)}${publisherMode ? "&publisher=1" : ""}`;
  const episodeTagOptions = useMemo(() => {
    const tagMap = new Map<string, { id: string; label: string }>();
    for (const view of views) {
      const tag = episodeTagFromView(view);
      if (!tag) continue;
      tagMap.set(tag, { id: tag, label: episodeLabelFromView(view) ?? labelFromEpisodeTag(tag) });
    }
    return [...tagMap.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [views]);

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

  const handleEpisodeCreate = async (episodeLabel: string) => {
    const result = await createEpisodeView(projectId, episodeLabel);
    if (!result.ok) {
      setCreatingEpisodeError(result.error ?? "Could not create episode.");
      return false;
    }

    const nextView = result.view;
    if (!nextView) {
      setCreatingEpisodeError("Could not create the episode view.");
      return false;
    }

    setViews((prev) => {
      const exists = prev.some((view) => view.id === nextView.id || view.name === nextView.name);
      if (exists) return prev;
      return [...prev, nextView];
    });
    setCreatingEpisodeError(null);
    handleActiveViewChange(nextView);
    setActiveBoundaryId(null);
    return true;
  };

  const handleDocumentBlocksChange = (nextBlocks: any[]) => {
    setDocumentBlocks(nextBlocks);
  };

  const handleBulkNormalizeHeadings = async (): Promise<{ updatedCount: number; source: "local" | "gemini" | "hybrid"; message: string; skippedCount?: number }> => {
    if (persistenceMode === "offline") {
      return {
        updatedCount: 0,
        source: "local",
        message: "Offline mode is not safe for cleanup. Connect database-backed mode first."
      };
    }

    window.dispatchEvent(new CustomEvent("quipsly:save-state", {
      detail: { state: "saving" }
    }));
    const result = (await bulkNormalizeHeadings(documentId)) as BulkNormalizeResult;
    if (!result.ok) {
      window.dispatchEvent(new CustomEvent("quipsly:save-state", {
        detail: { state: "unsaved" }
      }));
      return {
        updatedCount: 0,
        source: "local",
        message: result.message
      };
    }

    if (result.updatedBlocks.length === 0) {
      return {
        updatedCount: 0,
        source: "local",
        message: result.message
      };
    }

    setDocumentBlocks((current) => {
      const updates = new Map(result.updatedBlocks.map((item) => [item.blockId, item.nextText]));
      return current.map((block) => {
        const nextText = updates.get(block.id);
        return nextText ? { ...block, text: nextText } : block;
      });
    });
    window.dispatchEvent(new CustomEvent("quipsly:save-state", {
      detail: { state: "saved" }
    }));
    const sourceLabel = {
      local: "deterministic",
      gemini: "AI (Gemini only)",
      hybrid: "AI-assisted (Gemini)"
    }[result.source];
    return {
      updatedCount: result.updatedCount,
      source: result.source,
      message: `${result.message} ${sourceLabel ? `(${sourceLabel})` : ""}`.trim(),
      skippedCount: result.skippedCount
    };
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
         adHocTags={adHocTags}
         setAdHocTags={setAdHocTags}
         views={views}
         documentBoundaries={documentBoundaries}
         activeBoundaryId={activeBoundaryId}
         setActiveBoundaryId={handleActiveBoundaryChange}
         onCreateEpisode={handleEpisodeCreate}
         onCreateEpisodeError={creatingEpisodeError}
         onBulkNormalizeBoundaries={handleBulkNormalizeHeadings}
      />
      {/* Main editor area */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 md:p-8 relative">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6 md:mb-8 rounded-2xl border border-[#e8dcc4] bg-white/80 p-4 md:p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.22em] text-[#a36f2e]">
                  {projectName ?? "Quipsly Live"} / Living Document
                </div>
                <h1 className="mt-1 text-2xl md:text-3xl font-bold font-serif text-[#342618]">
                  {documentTitle ?? "High Ground Odyssey Tonight Pack"}
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6b5b45]">
                  Write in one continuous living document. Everything is visible by default; use lenses only when you want to hide production scaffolding or focus down to a chapter, episode, quote, clip, or note.
                </p>
              </div>
              <div className="bg-amber-100 text-amber-800 px-3 py-1 rounded-full text-xs font-bold border border-amber-200 shadow-sm flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                View: {activeBoundary?.label ?? activeView.name}
              </div>
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
                href={manuscriptHref}
                className="shrink-0 rounded-full border border-[#c8a66b] bg-[#3d3122] px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-[#59442d]"
              >
                Manuscript
              </Link>
              <Link
                href="/notebooks"
                className="shrink-0 rounded-full border border-[#d9c7a5] bg-white px-4 py-2 text-xs font-bold text-[#5e4b33] shadow-sm transition-colors hover:bg-[#f8f3e6]"
              >
                Notebooks
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
                  Production target: {activeEpisodeLabel}
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
            <PublisherModePanel activeView={activeView} documentTitle={documentTitle} />
          ) : null}

          {persistenceMode === "offline" ? (
            <div className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-900 shadow-sm">
              <strong className="font-bold">Offline browser lab:</strong> DATABASE_URL is not set, so this workbench is running from starter state. Text and tag clicks are safe to test, but they will not persist until the database environment is wired.
            </div>
          ) : null}
          
          <div className="bg-white p-4 md:p-12 rounded-2xl shadow-sm border border-[#e8dcc4] min-h-[800px]">
            <Tagger 
              activeView={activeView} 
              activeBoundaryId={activeBoundaryId}
              documentBoundaries={documentBoundaries}
              adHocTags={adHocTags} 
              initialBlocks={initialBlocks}
              projectId={projectId}
              documentId={documentId}
              availableEpisodeTags={episodeTagOptions}
              scrollContainerRef={scrollContainerRef}
              onBlocksChange={handleDocumentBlocksChange}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
