"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import PublisherModePanel from "./PublisherModePanel";
import Tagger from "./Tagger";
import { EditorExtensionProvider } from "./registry/EditorExtensionRegistry";
import { coreBlockCards } from "./registry/coreBlockCards";
import ViewFilter from "./ViewFilter";
import { DocumentBoundary, ViewDefinition, WorkbenchScopeProjectSummary } from "./types";
import { QuipslyAssistantSidebar } from "@/components/QuipslyAssistantSidebar";
import { useQuipslyAssistant } from "@/components/useQuipslyAssistant";
import { AssistantProvider } from "@/components/AssistantContext";
import {
  WORKFLOW_SYSTEM_DESCRIPTIONS,
  WORKFLOW_SYSTEM_LABELS,
  normalizeNestKind,
  workflowSystemForNestKind,
} from "@/lib/studio/project-registry";
import { createHgoEpisodeDraftShellAction, type HgoSourceKey } from "../nests/[slug]/actions";
import DocumentSafetyPanel from "./DocumentSafetyPanel";

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

function documentKindFromSourceLabel(sourceLabel?: string | null, title?: string | null) {
  const normalizedSource = String(sourceLabel ?? "").toLowerCase();
  const normalizedTitle = String(title ?? "").toLowerCase();

  if (normalizedSource.includes("document-kind:fixed-source")) return "Study Source";
  if (normalizedSource.includes("document-kind:note")) return "Note";
  if (normalizedSource.includes("document-kind:draft")) return "Draft";
  if (normalizedSource.includes("document-kind:manuscript")) return "Manuscript";
  if (normalizedTitle.includes("manuscript") || normalizedTitle.includes("book")) return "Manuscript";
  return "Document";
}

function documentKindBadgeClasses(kind: string) {
  if (kind === "Study Source") return "border-cyan-200 bg-cyan-50 text-cyan-800";
  if (kind === "Note") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (kind === "Draft") return "border-amber-200 bg-amber-50 text-amber-800";
  if (kind === "Manuscript") return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-stone-200 bg-stone-50 text-stone-700";
}

function documentKindGuidance(kind: string) {
  if (kind === "Study Source") {
    return "This is a fixed source surface. Tag, highlight, annotate, and cite over it; do not silently rewrite the original text.";
  }
  if (kind === "Note") {
    return "This is a quick capture surface. Use it for ideas, research hunches, reminders, connective tissue, and rough thinking.";
  }
  if (kind === "Draft") {
    return "This is a working draft. Experiment freely, branch ideas, and promote the good parts when they become manuscript material.";
  }
  if (kind === "Manuscript") {
    return "This is the living manuscript spine. Rewrite intentionally; structure tags, snapshots, and recovery exports keep the trail visible.";
  }
  return "This document is editable. If the role is unclear, use notes or drafts for experiments and keep the manuscript spine deliberate.";
}

const HGO_SOURCE_KEYS: HgoSourceKey[] = [
  "episode-1",
  "episode-2",
  "episode-3",
  "episode-4",
  "episode-5",
  "episode-6",
  "episode-7",
  "episode-8",
  "episode-9",
];

function hgoSourceKeyFromLabel(sourceLabel?: string | null): HgoSourceKey | null {
  const normalized = String(sourceLabel ?? "").toLowerCase();
  return HGO_SOURCE_KEYS.find((key) => normalized.includes(`hgo-source:${key}`)) ?? null;
}

function hgoEpisodeLabel(sourceKey: HgoSourceKey) {
  return sourceKey.replace("episode-", "Episode ");
}

export default function Workspace({
  initialBlocks,
  initialViews,
  projectId,
  projectSlug,
  projectName,
  projectNestKind,
  workflowSystem,
  documentId,
  documentTitle,
  notebookSectionLabel,
  projectDocuments = [],
  persistenceMode = "database",
  linkedProjects = [],
  availableProjects = [],
  isDefaultFallback = false,
  initialFocusBlockId,
}: {
  initialBlocks: any[],
  initialViews: ViewDefinition[],
  projectId: string,
  projectSlug?: string,
  projectName?: string,
  projectNestKind?: string,
  workflowSystem?: "data-ingestion" | "knowledge-processing" | "content-creation" | "content-publishing",
  documentId: string,
  documentTitle?: string,
  notebookSectionLabel?: string,
  projectDocuments?: { id: string; title: string; sourceLabel: string | null; updatedAt: string | Date }[],
  persistenceMode?: "database" | "unavailable",
  linkedProjects?: WorkbenchScopeProjectSummary[],
  availableProjects?: { slug: string; name: string; nestKind?: string }[],
  isDefaultFallback?: boolean,
  initialFocusBlockId?: string,
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
  const [recoveryExportState, setRecoveryExportState] = useState<"idle" | "exporting" | "copied" | "failed">("idle");
  const [isDraftShellPending, startDraftShellTransition] = useTransition();
  const activeProjectDocument = useMemo(
    () => projectDocuments.find((doc) => doc.id === documentId) ?? null,
    [documentId, projectDocuments]
  );
  const activeDocumentKind = documentKindFromSourceLabel(activeProjectDocument?.sourceLabel, documentTitle);
  const activeDocumentKindGuidance = documentKindGuidance(activeDocumentKind);
  const activeHgoSourceKey = hgoSourceKeyFromLabel(activeProjectDocument?.sourceLabel);
  const handlePanicExport = async () => {
    setRecoveryExportState("exporting");
    const generatedAt = new Date().toISOString();
    const safeSlug = (activeProjectSlug || "quipsly-draft").replace(/[^a-z0-9-]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
    const activeScope = activeBoundary
      ? `${activeBoundary.kind}: ${activeBoundary.label}`
      : activeView.name;
    const exportScopeLabel = activeBoundary
      ? `Current ${activeBoundary.kind} section`
      : "Current notebook page / document";
    const exportBlocks = activeBoundary
      ? documentBlocks.slice(activeBoundary.startIndex, activeBoundary.endIndex + 1)
      : documentBlocks;
    const markdownBlocks = exportBlocks.map((block) => {
      const tags = Array.from(new Set([
        ...(block.tags ?? []),
        ...((block.spans ?? []).map((span: { tagSlug: string }) => span.tagSlug))
      ]));
      const text = String(block.text ?? "").trimEnd();
      const headingPrefix = tags.includes("chapter")
        ? "## "
        : tags.includes("episode")
          ? "### "
          : "";
      const tagComment = tags.length > 0 ? `\n\n<!-- quipsly-tags: ${tags.join(", ")} -->` : "";
      return `${headingPrefix}${text}${tagComment}`.trim();
    }).filter(Boolean);
    const markdown = [
      `# ${documentTitle ?? projectName ?? "Quipsly Writing Draft"}`,
      "",
      "> Recovery export from Quipsly Nest.",
      `> Nest: ${projectName ?? activeProjectSlug}`,
      `> Document: ${documentTitle ?? documentId}`,
      `> View: ${activeScope}`,
      `> Export scope: ${exportScopeLabel}`,
      `> Blocks exported: ${exportBlocks.length} of ${documentBlocks.length}`,
      `> Save state when exported: ${saveState}`,
      `> Generated: ${generatedAt}`,
      "",
      "---",
      "",
      ...markdownBlocks,
      ""
    ].join("\n\n");

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(markdown);
      }
      const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${safeSlug}-${generatedAt.slice(0, 10)}-recovery-draft.md`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      setRecoveryExportState("copied");
      window.setTimeout(() => setRecoveryExportState("idle"), 2400);
    } catch (error) {
      console.error("Panic export failed.", error);
      setRecoveryExportState("failed");
    }
  };

  const handleShowRecentChanges = () => {
    window.dispatchEvent(new CustomEvent("quipsly:show-recent-changes"));
  };

  const handleDocumentBlocksChange = useCallback((blocks: any[]) => {
    setDocumentBlocks(blocks);
    setSaveState("unsaved");
  }, []);

  const assistant = useQuipslyAssistant({
    projectSlug: activeProjectSlug,
    documentId,
    documentTitle,
    projectDocuments,
    activeBoundary,
    activeView,
    visibleBlocks: visibleAssistantBlocks,
  });
  const resolvedNestKind = normalizeNestKind(projectNestKind);
  const resolvedWorkflowSystem = workflowSystem ?? workflowSystemForNestKind(resolvedNestKind);
  const linkedProjectSlugs = linkedProjects.map((project) => project.projectSlug).filter(Boolean);
  const encodedScope = linkedProjectSlugs.length > 0 ? `&scope=${encodeURIComponent(linkedProjectSlugs.join(","))}` : "";
  const manuscriptHref = `/create?project=${encodeURIComponent(activeProjectSlug)}${publisherMode ? "&publisher=1" : ""}${encodedScope}`;
  const scopeCandidates = useMemo(
    () => (availableProjects || [])
      .filter((project) =>
        project.slug !== activeProjectSlug && !linkedProjectSlugs.includes(project.slug)
      )
      .slice(0, 6),
    [availableProjects, activeProjectSlug, linkedProjectSlugs],
  );

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

  const recoveryExportLabel = activeBoundary ? "Copy/export section" : "Copy/export page";
  const recoveryExportScopeHelp = activeBoundary
    ? "Copies and downloads Markdown for the focused Chapter/Episode section."
    : "Copies and downloads Markdown for the current notebook page/document.";

  if (persistenceMode === "unavailable") {
    return (
      <main className="min-h-[calc(100vh-4rem)] bg-[#fdfaf6] px-4 py-10 text-[#3d3122] md:px-8" aria-labelledby="writing-unavailable-title">
        <section className="mx-auto max-w-2xl rounded-3xl border border-rose-300 bg-white p-6 shadow-sm md:p-10" role="alert">
          <div className="text-xs font-black uppercase tracking-[0.22em] text-rose-700">Canonical database unavailable</div>
          <h1 id="writing-unavailable-title" className="mt-3 text-3xl font-bold font-serif text-[#342618]">
            Your writing was not loaded
          </h1>
          <p className="mt-4 text-sm leading-7 text-[#6b5b45]">
            Quipsly could not open the persisted document for <strong>{projectName ?? activeProjectSlug}</strong>. No starter manuscript, episode text, or editable fallback has been substituted, because it could be mistaken for saved work.
          </p>
          <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-900">
            <strong>No document is open.</strong> Typing is disabled, nothing on this screen is saved locally, and this outage view is not evidence that the Nest is empty.
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-full border border-[#3d3122] bg-[#3d3122] px-5 py-2.5 text-xs font-black uppercase tracking-[0.12em] text-white hover:bg-[#59442d]"
            >
              Retry persisted document
            </button>
            <Link
              href="/projects"
              className="rounded-full border border-[#d9c7a5] bg-white px-5 py-2.5 text-xs font-black uppercase tracking-[0.12em] text-[#5e4b33] hover:bg-[#f8f3e6]"
            >
              Back to Nests
            </Link>
          </div>
        </section>
      </main>
    );
  }

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
         workflowSystem={resolvedWorkflowSystem}
         projectDocuments={projectDocuments}
         activeDocumentId={documentId}
         projectSlug={activeProjectSlug}
      />
      {/* Main editor area */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-3 md:p-6 relative">
        <div className="max-w-5xl mx-auto">
          <div className="mb-3 rounded-2xl border border-[#e8dcc4] bg-white/80 p-3 md:p-4 shadow-sm">
            <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
              <div>
                <nav className="mb-3 flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#8c6b4a]">
                  <Link href="/notebooks" className="rounded-full border border-[#eadfca] bg-[#fffaf3] px-2.5 py-1 transition hover:bg-[#fff4df]">
                    Writing Desk
                  </Link>
                  {activeProjectSlug ? (
                    <>
                      <span className="text-[#c1a57d]">/</span>
                      <Link
                        href={`/notebooks/${encodeURIComponent(activeProjectSlug)}`}
                        className="rounded-full border border-[#eadfca] bg-[#fffaf3] px-2.5 py-1 transition hover:bg-[#fff4df]"
                      >
                        Notebook
                      </Link>
                    </>
                  ) : null}
                  {notebookSectionLabel ? (
                    <>
                      <span className="text-[#c1a57d]">/</span>
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-900">
                        {notebookSectionLabel}
                      </span>
                    </>
                  ) : null}
                </nav>
                <div className="text-xs font-bold uppercase tracking-[0.22em] text-[#a36f2e] flex items-center gap-2">
                  <span title="This workspace is private to your organization" className="flex items-center gap-1"><span className="text-[10px]">🔒</span> Private</span>
                  <span className="opacity-50">•</span>
                  <span>{projectName ?? "Quipsly Live"} / Living Document Nest</span>
                </div>
                <h1 className="mt-1 text-2xl md:text-3xl font-bold font-serif text-[#342618]">
                  {documentTitle ?? "High Ground Odyssey Tonight Pack"}
                </h1>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${documentKindBadgeClasses(activeDocumentKind)}`}>
                    {activeDocumentKind}
                  </span>
                  <span className="rounded-full border border-[#e8dcc4] bg-[#fffaf3] px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#8c6b4a]">
                    {projectDocuments.length} Nest docs
                  </span>
                </div>
                <p className="mt-1 max-w-2xl text-xs leading-5 text-[#6b5b45]">
                  {activeDocumentKindGuidance}
                </p>
              </div>
              <span
                title={WORKFLOW_SYSTEM_DESCRIPTIONS[resolvedWorkflowSystem]}
                className="rounded-full border border-amber-300 bg-amber-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-amber-900"
              >
                {WORKFLOW_SYSTEM_LABELS[resolvedWorkflowSystem]}
              </span>
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
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2">
              <p className="text-[11px] leading-5 text-[#526b43]">
                Canonical page · source-safe history · no silent rewrite
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handlePanicExport()}
                  title={recoveryExportScopeHelp}
                  className="rounded-full border border-[#3d3122] bg-[#3d3122] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-white transition hover:bg-[#59442d]"
                >
                  {recoveryExportState === "exporting"
                    ? "Preparing..."
                    : recoveryExportState === "copied"
                      ? "Copied + Downloaded"
                      : recoveryExportState === "failed"
                        ? "Try Export Again"
                        : recoveryExportLabel}
                </button>
                <button
                  type="button"
                  onClick={handleShowRecentChanges}
                  className="rounded-full border border-[#d9c7a5] bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-[#5e4b33] transition hover:bg-[#f8f3e6]"
                >
                  Recent Changes
                </button>
              </div>
            </div>
            <DocumentSafetyPanel
              documentId={documentId}
              documentTitle={documentTitle ?? "Quipsly Writing Draft"}
              projectSlug={activeProjectSlug}
              saveState={saveState}
            />
            {activeHgoSourceKey ? (
              <div className="mb-4 rounded-2xl border border-cyan-200 bg-cyan-50/80 px-4 py-3 shadow-sm">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-800">
                      HGO source document
                    </div>
                    <p className="mt-1 text-xs leading-5 text-[#4f6470]">
                      This is preserved source material for <strong>{hgoEpisodeLabel(activeHgoSourceKey)}</strong>. Tag and annotate here, then draft in a separate source-linked episode page so the source stays trustworthy.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      startDraftShellTransition(() => {
                        createHgoEpisodeDraftShellAction(activeProjectSlug, activeHgoSourceKey);
                      });
                    }}
                    className="rounded-full border border-cyan-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-cyan-800 shadow-sm transition hover:-translate-y-0.5 hover:bg-cyan-100 disabled:opacity-50"
                    disabled={isDraftShellPending}
                  >
                    {isDraftShellPending ? "Opening Draft..." : `Open ${hgoEpisodeLabel(activeHgoSourceKey)} Draft`}
                  </button>
                </div>
              </div>
            ) : null}
            <details className="mb-1 rounded-xl border border-[#eadfca] bg-[#fffaf3] px-3 py-2">
              <summary className="cursor-pointer text-[10px] font-black uppercase tracking-[0.14em] text-[#6b5b45]">
                Nest and production tools
              </summary>
              <div className="mt-3 flex flex-nowrap overflow-x-auto hide-scrollbar items-center gap-2 pb-1">
              <div className="mr-2 shrink-0 flex flex-nowrap items-center gap-1 rounded-full border border-[#e6d7bc] bg-[#f8f1e3] p-1">
                <span className="pl-3 pr-1 text-[10px] font-bold uppercase tracking-wider text-[#a36f2e]">Nest:</span>
                {(availableProjects || []).map((project) => (
                  <Link
                    key={project.slug}
                    href={(() => {
                      const scope = linkedProjectSlugs.filter((scopeSlug) => scopeSlug !== project.slug);
                      const scopeParam = scope.length > 0 ? `&scope=${encodeURIComponent(scope.join(","))}` : "";
                      return `/create?project=${encodeURIComponent(project.slug)}${publisherMode ? "&publisher=1" : ""}${scopeParam}`;
                    })()}
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
              <div className="mr-2 shrink-0 flex flex-nowrap items-center gap-1 rounded-full border border-[#e6d7bc] bg-[#f4e8d2] p-1">
                <span className="pl-2 pr-1 text-[10px] font-bold uppercase tracking-wider text-[#a36f2e]">Scope:</span>
                {linkedProjectSlugs.length === 0 ? (
                  <span className="shrink-0 rounded-full border border-[#edd6a8] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#8c6b4a]">
                    Central manuscript only
                  </span>
                ) : null}
                {linkedProjects.map((linkedProject) => {
                  const scopeStyle = linkedProject.status === "connected"
                    ? "bg-[#3d3122] text-white border-[#3d3122]"
                    : linkedProject.status === "missing"
                      ? "bg-[#ffdcb3] text-[#8a4f0b] border-[#f0bd79]"
                      : linkedProject.status === "denied"
                        ? "bg-[#f8d7da] text-[#9b2b42] border-[#f3b0b8]"
                        : "bg-[#ece6df] text-[#6b5b45] border-[#d4c8b7]";
                  const statusLabel = linkedProject.status === "connected"
                    ? "Connected"
                    : linkedProject.status === "missing"
                      ? "Missing"
                      : linkedProject.status === "denied"
                        ? "Denied"
                        : "Unavailable";

                  const nextScope = linkedProjectSlugs.filter((slug) => slug !== linkedProject.projectSlug);
                  const scopeLink = `/create?project=${encodeURIComponent(activeProjectSlug)}${publisherMode ? "&publisher=1" : ""}${nextScope.length > 0 ? `&scope=${encodeURIComponent(nextScope.join(","))}` : ""}`;
                  return (
                    <Link
                      key={linkedProject.projectId || linkedProject.projectSlug}
                      href={scopeLink}
                      title={linkedProject.reason ?? `Nested nest status: ${linkedProject.status}`}
                      className={`shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-bold transition-colors ${scopeStyle}`}
                    >
                      {linkedProject.projectName}
                      <span className="ml-1.5 rounded-full border px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] bg-white/20 border-current">
                        {statusLabel}
                      </span>
                    </Link>
                  );
                })}
                {scopeCandidates.map((project) => {
                  const addScope = [...new Set([...linkedProjectSlugs, project.slug])];
                  return (
                    <Link
                      key={project.slug}
                      href={`/create?project=${encodeURIComponent(activeProjectSlug)}${publisherMode ? "&publisher=1" : ""}&scope=${encodeURIComponent(addScope.join(","))}`}
                      className="shrink-0 rounded-full border border-[#b9c58b] bg-[#f4f8e6] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#5a6549] transition-colors hover:bg-[#eef4d7]"
                    >
                      + {project.name}
                    </Link>
                  );
                })}
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
            </details>
          </div>

          {publisherMode ? (
            <PublisherModePanel activeView={activeView} documentTitle={documentTitle} projectSlug={activeProjectSlug} projectId={projectId} />
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

          <div className="bg-white p-4 md:p-8 rounded-2xl shadow-sm border border-[#e8dcc4] min-h-[800px]">
            <AssistantProvider value={assistant}>
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
                  initialFocusBlockId={initialFocusBlockId}
                />
              </EditorExtensionProvider>
            </AssistantProvider>
          </div>
        </div>
      </div>
      <QuipslyAssistantSidebar
        projectId={projectId}
        projectSlug={activeProjectSlug}
        documentId={documentId}
        documentTitle={documentTitle}
        projectDocuments={projectDocuments}
        activeBoundary={activeBoundary}
        activeView={activeView}
        visibleBlocks={visibleAssistantBlocks}
        patreonHref={process.env.NEXT_PUBLIC_PATREON_URL}
        assistant={assistant}
      />
    </div>
  );
}
