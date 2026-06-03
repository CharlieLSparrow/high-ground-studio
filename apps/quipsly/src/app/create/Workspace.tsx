"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PublisherModePanel from "./PublisherModePanel";
import Tagger from "./Tagger";
import ViewFilter from "./ViewFilter";
import { DocumentBoundary, ViewDefinition } from "./types";

export const DEFAULT_VIEW: ViewDefinition = {
  id: "default",
  name: "Everything Mode",
  type: "default",
  filters: { tagSlugs: [], includeCategories: [] },
  display: { mode: "standard", showContext: true, collapseUnmatched: false }
};

const PROJECT_LINKS = [
  { slug: "quipsly-dev-lab", label: "Dev Lab" },
  { slug: "quipsly-starter-demo", label: "Starter Demo" },
  { slug: "high-ground-odyssey-manuscript", label: "HGO Manuscript" },
  { slug: "quipsly-live", label: "Legacy Live" }
];

function viewSlug(view: ViewDefinition) {
  return view.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function boundarySlug(boundary: DocumentBoundary) {
  return boundary.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function classifyBoundary(text: string): DocumentBoundary["kind"] | null {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 90 || trimmed.includes("\n")) return null;
  if (/^episode\b/i.test(trimmed)) return "episode";
  if (/^chapter\b/i.test(trimmed)) return "chapter";
  if (/^(preface|introduction|prologue|epilogue|afterword|foreword)$/i.test(trimmed)) return "chapter";
  return null;
}

function deriveDocumentBoundaries(blocks: Array<{ id: string; text: string }>): DocumentBoundary[] {
  const starts = blocks
    .map((block, index) => {
      const kind = classifyBoundary(block.text);
      if (!kind) return null;
      return {
        id: `boundary-${block.id}`,
        blockId: block.id,
        label: block.text.trim(),
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
  persistenceMode = "database"
}: { 
  initialBlocks: any[], 
  initialViews: ViewDefinition[],
  projectId: string, 
  projectSlug?: string,
  projectName?: string,
  documentId: string,
  documentTitle?: string,
  persistenceMode?: "database" | "offline"
}) {
  const [activeView, setActiveView] = useState<ViewDefinition>(DEFAULT_VIEW);
  const documentBoundaries = useMemo(() => deriveDocumentBoundaries(initialBlocks), [initialBlocks]);
  const [activeBoundaryId, setActiveBoundaryId] = useState<string | null>(null);
  const activeBoundary = documentBoundaries.find((boundary) => boundary.id === activeBoundaryId) ?? null;
  const activeBoundaryQuery = activeBoundary ? `&episode=${encodeURIComponent(boundarySlug(activeBoundary))}` : "";
  const manuscriptHref = projectSlug ? `/?project=${encodeURIComponent(projectSlug)}` : "/";
  const [publisherMode, setPublisherMode] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "unsaved">("saved");
  // Optional ad-hoc tag filters applied on top of the active view
  const [adHocTags, setAdHocTags] = useState<string[]>([]);
  const activeProjectSlug = projectSlug ?? "quipsly-dev-lab";

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

    const nextView = [DEFAULT_VIEW, ...initialViews].find((view) => viewSlug(view) === slug);
    if (nextView) setActiveView(nextView);
  }, [documentBoundaries, initialViews]);

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
    <div className="flex h-[calc(100vh-4rem)] bg-[#fdfaf6] text-[#3d3122]">
      {/* Left sidebar - ViewFilter */}
      <ViewFilter 
         activeView={activeView} 
         setActiveView={handleActiveViewChange}
         adHocTags={adHocTags}
         setAdHocTags={setAdHocTags}
         views={initialViews}
         documentBoundaries={documentBoundaries}
         activeBoundaryId={activeBoundaryId}
         setActiveBoundaryId={handleActiveBoundaryChange}
      />
      {/* Main editor area */}
      <div className="flex-1 overflow-y-auto p-8 relative">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8 rounded-2xl border border-[#e8dcc4] bg-white/80 p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.22em] text-[#a36f2e]">
                  {projectName ?? "Quipsly Live"} / Living Document
                </div>
                <h1 className="mt-1 text-3xl font-bold font-serif text-[#342618]">
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
            <div className="flex flex-wrap items-center gap-2">
              <div className="mr-2 flex flex-wrap items-center gap-1 rounded-full border border-[#e6d7bc] bg-[#f8f1e3] p-1">
                {PROJECT_LINKS.map((project) => (
                  <Link
                    key={project.slug}
                    href={`/create?project=${encodeURIComponent(project.slug)}${publisherMode ? "&publisher=1" : ""}`}
                    className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                      activeProjectSlug === project.slug
                        ? "bg-[#3d3122] text-white shadow-sm"
                        : "text-[#6b5b45] hover:bg-white"
                    }`}
                  >
                    {project.label}
                  </Link>
                ))}
              </div>
              <Link
                href={manuscriptHref}
                className="rounded-full border border-[#c8a66b] bg-[#3d3122] px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-[#59442d]"
              >
                Manuscript
              </Link>
              <Link
                href="/notebooks"
                className="rounded-full border border-[#d9c7a5] bg-white px-4 py-2 text-xs font-bold text-[#5e4b33] shadow-sm transition-colors hover:bg-[#f8f3e6]"
              >
                Notebooks
              </Link>
              <Link
                href={`/recorder?project=${encodeURIComponent(activeProjectSlug)}${activeBoundaryQuery}`}
                className="rounded-full border border-[#d3a24f] bg-[#fff5df] px-4 py-2 text-xs font-bold text-[#9a5f13] shadow-sm transition-colors hover:bg-[#ffeac0]"
              >
                Record Room
              </Link>
              <Link
                href={`/editor?project=${encodeURIComponent(activeProjectSlug)}${activeBoundaryQuery}`}
                className="rounded-full border border-[#d9c7a5] bg-white px-4 py-2 text-xs font-bold text-[#5e4b33] shadow-sm transition-colors hover:bg-[#f8f3e6]"
              >
                Video Editor
              </Link>
              {publisherMode ? (
                <Link
                  href="/kernel-lab"
                  className="rounded-full border border-[#d3a24f] bg-[#fff5df] px-4 py-2 text-xs font-bold text-[#9a5f13] shadow-sm transition-colors hover:bg-[#ffeac0]"
                >
                  Kernel Lab
                </Link>
              ) : null}
              <Link
                href="/editor"
                className="rounded-full border border-[#d9c7a5] bg-white px-4 py-2 text-xs font-bold text-[#5e4b33] shadow-sm transition-colors hover:bg-[#f8f3e6]"
              >
                Video Editor
              </Link>
              <Link
                href="/files"
                className="rounded-full border border-[#d9c7a5] bg-white px-4 py-2 text-xs font-bold text-[#5e4b33] shadow-sm transition-colors hover:bg-[#f8f3e6]"
              >
                Media Files
              </Link>
              <Link
                href="/study"
                className="rounded-full border border-[#d9c7a5] bg-white px-4 py-2 text-xs font-bold text-[#5e4b33] shadow-sm transition-colors hover:bg-[#f8f3e6]"
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
          
          <div className="bg-white p-12 rounded-2xl shadow-sm border border-[#e8dcc4] min-h-[800px]">
            <Tagger 
              activeView={activeView} 
              activeBoundaryId={activeBoundaryId}
              documentBoundaries={documentBoundaries}
              adHocTags={adHocTags} 
              initialBlocks={initialBlocks}
              projectId={projectId}
              documentId={documentId}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
