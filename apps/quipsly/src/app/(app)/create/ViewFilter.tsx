"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, CopyPlus, FilePlus2, Filter, Layers, LayoutTemplate, NotebookPen, PenLine, Search, X } from "lucide-react";
import { DocumentBoundary, ViewDefinition, WorkbenchProjectDocumentSummary } from "./types";
import { DEFAULT_VIEW } from "./Workspace";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  WORKFLOW_SYSTEM_DESCRIPTIONS,
  WORKFLOW_SYSTEM_LABELS,
  WORKFLOW_SYSTEM_SEQUENCE,
} from "@/lib/studio/project-registry";
import { createDocumentAction, duplicateDocumentAsDraftAction, promoteNoteToWritingPageAction, renameDocumentAction } from "../nests/[slug]/actions";

function SortableOutlineItem({ boundary, isActive, isScrolled, isNested, onClick }: { boundary: DocumentBoundary, isActive: boolean, isScrolled: boolean, isNested: boolean, onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: boundary.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className={`flex w-full items-center gap-1 ${isNested ? "pl-6" : ""}`}>
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab hover:text-[#3d3122] text-[#8c6b4a] opacity-50 hover:opacity-100 transition-opacity p-1"
        title="Drag to reorder"
      >
        <Layers size={14} />
      </button>
      <button
        onClick={onClick}
        aria-current={isActive ? "true" : undefined}
        title={`${boundary.kind} outline`}
        className={`flex min-w-0 flex-1 items-start justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${isActive ? "bg-[#3d3122] text-white shadow-sm" : isScrolled ? "bg-[#fff5df] text-[#5e4b33]" : "text-[#5e4b33] hover:bg-amber-50"}`}
      >
        <span className="min-w-0 flex-1 leading-snug flex items-center">
          {isNested ? (
            <span className={`mr-1 inline-block select-none ${isActive ? "text-white/75" : "text-[#8c6b4a]"}`}>-&gt;</span>
          ) : null}
          <span className="block truncate font-medium">{boundary.label}</span>
        </span>
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase ${isActive ? "bg-white/15 text-white" : boundary.kind === "chapter" ? "bg-cyan-100 text-cyan-800" : "bg-rose-100 text-rose-800"}`}>
          {boundary.kind === "episode" ? "EP" : "CH"}
        </span>
      </button>
    </div>
  );
}

function documentKind(doc: WorkbenchProjectDocumentSummary) {
  const sourceLabel = String(doc.sourceLabel ?? "").toLowerCase();
  const title = doc.title.toLowerCase();

  if (sourceLabel.includes("document-kind:fixed-source")) return "Study Source";
  if (sourceLabel.includes("document-kind:note")) return "Note";
  if (sourceLabel.includes("document-kind:draft")) return "Draft";
  if (sourceLabel.includes("document-kind:manuscript")) return "Manuscript";
  if (title.includes("manuscript") || title.includes("book")) return "Manuscript";
  return "Document";
}

function documentKindClasses(kind: string, isActive: boolean) {
  if (isActive) return "bg-white/15 text-white";
  if (kind === "Study Source") return "bg-cyan-100 text-cyan-800";
  if (kind === "Note") return "bg-emerald-100 text-emerald-800";
  if (kind === "Draft") return "bg-amber-100 text-amber-800";
  if (kind === "Manuscript") return "bg-rose-100 text-rose-800";
  return "bg-stone-100 text-stone-700";
}

function formatNotebookUpdatedAt(value: string | Date) {
  const updatedAt = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(updatedAt.getTime())) return "Updated recently";

  const now = new Date();
  const diffMs = now.getTime() - updatedAt.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return updatedAt.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: updatedAt.getFullYear() === now.getFullYear() ? undefined : "numeric"
  });
}

type NotebookPageFilter = "all" | "writing" | "notes" | "sources";

export default function ViewFilter({
  activeView,
  setActiveView,
  views,
  documentBoundaries,
  activeBoundaryId,
  setActiveBoundaryId,
  scrolledBoundaryId,
  workflowSystem,
  projectDocuments,
  activeDocumentId,
  projectSlug,
}: {
  activeView: ViewDefinition;
  setActiveView: (view: ViewDefinition) => void;
  views: ViewDefinition[];
  documentBoundaries: DocumentBoundary[];
  activeBoundaryId: string | null;
  setActiveBoundaryId: (boundaryId: string | null) => void;
  scrolledBoundaryId?: string | null;
  workflowSystem: "data-ingestion" | "knowledge-processing" | "content-creation" | "content-publishing";
  projectDocuments?: WorkbenchProjectDocumentSummary[];
  activeDocumentId?: string;
  projectSlug?: string;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isCreatingDocument, startCreateDocumentTransition] = useTransition();
  const [isRenamingDocument, startRenameDocumentTransition] = useTransition();
  const [isDuplicatingDocument, startDuplicateDocumentTransition] = useTransition();
  const [isPromotingNote, startPromoteNoteTransition] = useTransition();
  const [notebookQuery, setNotebookQuery] = useState("");
  const [notebookPanel, setNotebookPanel] = useState<"pages" | "structure" | "tools">("pages");
  const [recentDocumentIds, setRecentDocumentIds] = useState<string[]>([]);
  const [pageFilter, setPageFilter] = useState<NotebookPageFilter>("all");
  const [pageTitleDraft, setPageTitleDraft] = useState("");
  const [pageRenameError, setPageRenameError] = useState<string | null>(null);
  const [pageDuplicateError, setPageDuplicateError] = useState<string | null>(null);
  const [pagePromoteError, setPagePromoteError] = useState<string | null>(null);
  const notebookSearchRef = useRef<HTMLInputElement | null>(null);
  const activeBoundary = documentBoundaries.find((boundary) => boundary.id === activeBoundaryId) ?? null;
  const chapterCount = documentBoundaries.filter((boundary) => boundary.kind === "chapter").length;
  const episodeCount = documentBoundaries.filter((boundary) => boundary.kind === "episode").length;

  const libraryDocs = (projectDocuments || []).filter(d => {
    const sourceLabel = String(d.sourceLabel ?? "").toLowerCase();
    const title = d.title.toLowerCase();
    return sourceLabel.includes("nest-kind:study")
      || sourceLabel.includes("nest-kind:research")
      || sourceLabel.includes("document-kind:fixed-source")
      || sourceLabel.includes("document-kind:source")
      || title.includes("study")
      || title.includes("research")
      || title.includes("source")
      || title.includes("library");
  });
  const draftDocs = (projectDocuments || []).filter(d => !libraryDocs.includes(d));
  const normalizedNotebookQuery = notebookQuery.trim().toLowerCase();
  const matchesNotebookQuery = (value: string | null | undefined) => {
    if (!normalizedNotebookQuery) return true;
    return String(value ?? "").toLowerCase().includes(normalizedNotebookQuery);
  };
  const matchesPageFilter = (doc: WorkbenchProjectDocumentSummary) => {
    if (pageFilter === "all") return true;

    const kind = documentKind(doc);
    if (pageFilter === "sources") return kind === "Study Source";
    if (pageFilter === "notes") return kind === "Note";
    if (pageFilter === "writing") return kind !== "Study Source" && kind !== "Note";
    return true;
  };
  const filteredDraftDocs = draftDocs.filter((doc) => (
    matchesPageFilter(doc) && (
      matchesNotebookQuery(doc.title)
      || matchesNotebookQuery(doc.sourceLabel)
      || matchesNotebookQuery(documentKind(doc))
    )
  ));
  const filteredLibraryDocs = libraryDocs.filter((doc) => (
    matchesPageFilter(doc) && (
      matchesNotebookQuery(doc.title)
      || matchesNotebookQuery(doc.sourceLabel)
      || matchesNotebookQuery(documentKind(doc))
    )
  ));
  const activeDocument = (projectDocuments || []).find((doc) => doc.id === activeDocumentId) ?? null;
  const activeDocumentKind = activeDocument ? documentKind(activeDocument) : "Document";
  const totalDocumentCount = projectDocuments?.length ?? 0;
  const visibleDocumentCount = filteredDraftDocs.length + filteredLibraryDocs.length;
  const sourceDocumentCount = libraryDocs.length;
  const noteDocumentCount = (projectDocuments || []).filter((doc) => documentKind(doc) === "Note").length;
  const writingDocumentCount = Math.max(0, totalDocumentCount - sourceDocumentCount - noteDocumentCount);
  const recentDocuments = recentDocumentIds
    .map((documentId) => (projectDocuments || []).find((doc) => doc.id === documentId) ?? null)
    .filter((doc): doc is WorkbenchProjectDocumentSummary => Boolean(doc))
    .filter((doc) => doc.id !== activeDocumentId)
    .slice(0, 4);
  const activeDocumentVisible = activeDocument
    ? filteredDraftDocs.some((doc) => doc.id === activeDocument.id)
      || filteredLibraryDocs.some((doc) => doc.id === activeDocument.id)
    : true;

  const [localBoundaries, setLocalBoundaries] = useState(documentBoundaries);

  // Sync with upstream boundaries when the manuscript structure changes.
  useEffect(() => {
    setLocalBoundaries(documentBoundaries);
  }, [documentBoundaries]);

  useEffect(() => {
    if (!projectSlug) return;

    const storedPanel = window.localStorage.getItem(`quipsly.notebookPanel.${projectSlug}`);
    if (storedPanel === "pages" || storedPanel === "structure" || storedPanel === "tools") {
      setNotebookPanel(storedPanel);
    }

    const storedPageFilter = window.localStorage.getItem(`quipsly.pageShelf.${projectSlug}`);
    if (storedPageFilter === "all" || storedPageFilter === "writing" || storedPageFilter === "notes" || storedPageFilter === "sources") {
      setPageFilter(storedPageFilter);
    }

    const rawRecentDocuments = window.localStorage.getItem(`quipsly.recentDocuments.${projectSlug}`);
    if (!rawRecentDocuments) return;

    try {
      const parsed = JSON.parse(rawRecentDocuments);
      if (Array.isArray(parsed)) {
        setRecentDocumentIds(parsed.filter((value): value is string => typeof value === "string").slice(0, 8));
      }
    } catch {
      window.localStorage.removeItem(`quipsly.recentDocuments.${projectSlug}`);
    }
  }, [projectSlug]);

  useEffect(() => {
    if (!projectSlug) return;
    window.localStorage.setItem(`quipsly.notebookPanel.${projectSlug}`, notebookPanel);
  }, [notebookPanel, projectSlug]);

  useEffect(() => {
    if (!projectSlug) return;
    window.localStorage.setItem(`quipsly.pageShelf.${projectSlug}`, pageFilter);
  }, [pageFilter, projectSlug]);

  useEffect(() => {
    if (!projectSlug || !activeDocumentId) return;

    setRecentDocumentIds((current) => {
      const next = [activeDocumentId, ...current.filter((documentId) => documentId !== activeDocumentId)].slice(0, 8);
      window.localStorage.setItem(`quipsly.recentDocuments.${projectSlug}`, JSON.stringify(next));
      return next;
    });
  }, [activeDocumentId, projectSlug]);

  useEffect(() => {
    setPageTitleDraft(activeDocument?.title ?? "");
  }, [activeDocument?.title]);

  const submitPageRename = () => {
    if (!projectSlug || !activeDocumentId) return;
    const nextTitle = pageTitleDraft.trim().replace(/\s+/g, " ");
    if (!nextTitle || nextTitle === activeDocument?.title) return;

    setPageRenameError(null);
    startRenameDocumentTransition(() => {
      void renameDocumentAction(projectSlug, activeDocumentId, nextTitle)
        .then(() => router.refresh())
        .catch((error) => {
          const message = error instanceof Error ? error.message : "Rename failed. Try again.";
          setPageRenameError(message);
        });
    });
  };

  const duplicatePageAsDraft = () => {
    if (!projectSlug || !activeDocumentId) return;

    setPageDuplicateError(null);
    startDuplicateDocumentTransition(() => {
      void duplicateDocumentAsDraftAction(projectSlug, activeDocumentId)
        .then((result) => {
          if (result?.href) {
            router.push(result.href);
            router.refresh();
          }
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : "Duplicate failed. Try again.";
          setPageDuplicateError(message);
        });
    });
  };

  const promoteNoteToWritingPage = () => {
    if (!projectSlug || !activeDocumentId) return;

    setPagePromoteError(null);
    startPromoteNoteTransition(() => {
      void promoteNoteToWritingPageAction(projectSlug, activeDocumentId)
        .then((result) => {
          if (result?.href) {
            router.push(result.href);
            router.refresh();
          }
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : "Promote note failed. Try again.";
          setPagePromoteError(message);
        });
    });
  };

  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => {
      return target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || (target instanceof HTMLElement && target.isContentEditable);
    };

    const handleNotebookShortcut = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;

      const key = event.key.toLowerCase();

      if ((event.metaKey || event.ctrlKey) && key === "k") {
        event.preventDefault();
        setNotebookPanel("pages");
        window.setTimeout(() => notebookSearchRef.current?.focus(), 0);
        return;
      }

      if (event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
        if (projectSlug && key === "p" && !isCreatingDocument) {
          event.preventDefault();
          setNotebookPanel("pages");
          setPageFilter("writing");
          startCreateDocumentTransition(() => createDocumentAction(projectSlug, "draft"));
          return;
        }

        if (projectSlug && key === "q" && !isCreatingDocument) {
          event.preventDefault();
          setNotebookPanel("pages");
          setPageFilter("notes");
          startCreateDocumentTransition(() => createDocumentAction(projectSlug, "note"));
          return;
        }

        if (projectSlug && key === "r" && !isCreatingDocument) {
          event.preventDefault();
          setNotebookPanel("pages");
          setPageFilter("sources");
          startCreateDocumentTransition(() => createDocumentAction(projectSlug, "study-source"));
          return;
        }

        const nextShelf: Record<string, NotebookPageFilter> = {
          a: "all",
          w: "writing",
          n: "notes",
          s: "sources"
        };
        const shelf = nextShelf[key];
        if (!shelf) return;

        event.preventDefault();
        setNotebookPanel("pages");
        setPageFilter(shelf);
      }
    };

    window.addEventListener("keydown", handleNotebookShortcut);
    return () => window.removeEventListener("keydown", handleNotebookShortcut);
  }, [isCreatingDocument, projectSlug, startCreateDocumentTransition]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setLocalBoundaries((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        const next = arrayMove(items, oldIndex, newIndex);
        
        // Fire mock event so the user knows it worked
        window.dispatchEvent(new CustomEvent("quipsly:reorder-boundary", { 
          detail: { 
            activeId: active.id, 
            overId: over.id,
            oldIndex,
            newIndex
          } 
        }));
        
        return next;
      });
    }
  };

  const hierarchicalOutline = useMemo(() => {
    const rows: Array<{
      boundary: DocumentBoundary;
      isNested: boolean;
    }> = [];

    let lastChapterBoundaryId: string | null = null;

    for (const boundary of localBoundaries) {
      if (boundary.kind === "chapter") {
        lastChapterBoundaryId = boundary.id;
        rows.push({ boundary, isNested: false });
        continue;
      }

      if (boundary.kind === "episode") {
        rows.push({
          boundary,
          isNested: !!lastChapterBoundaryId,
        });
        continue;
      }

      rows.push({ boundary, isNested: false });
    }

    return rows;
  }, [localBoundaries]);
  const filteredOutlineRows = hierarchicalOutline.filter(({ boundary }) => (
    matchesNotebookQuery(boundary.label)
      || matchesNotebookQuery(boundary.kind)
  ));
  const notebookPanelItems: Array<{
    id: "pages" | "structure" | "tools";
    label: string;
    hint: string;
  }> = [
    {
      id: "pages",
      label: "Pages",
      hint: `${visibleDocumentCount} visible`
    },
    {
      id: "structure",
      label: "Structure",
      hint: `${chapterCount} chapters / ${episodeCount} episodes`
    },
    {
      id: "tools",
      label: "Tools",
      hint: "lenses + lanes"
    }
  ];
  const pageFilterItems: Array<{
    id: NotebookPageFilter;
    label: string;
    count: number;
    description: string;
    shortcut: string;
  }> = [
    {
      id: "all",
      label: "All",
      count: totalDocumentCount,
      description: "Everything in this Nest",
      shortcut: "Alt+A"
    },
    {
      id: "writing",
      label: "Writing",
      count: writingDocumentCount,
      description: "Manuscripts, drafts, and pages",
      shortcut: "Alt+W"
    },
    {
      id: "notes",
      label: "Notes",
      count: noteDocumentCount,
      description: "Quick captures and scraps",
      shortcut: "Alt+N"
    },
    {
      id: "sources",
      label: "Sources",
      count: sourceDocumentCount,
      description: "Fixed study/reference material",
      shortcut: "Alt+S"
    }
  ];
  const activeShelf = pageFilterItems.find((item) => item.id === pageFilter) ?? pageFilterItems[0];
  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-[#3d3122]/40 backdrop-blur-sm transition-opacity md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-20 right-4 z-30 flex items-center justify-center rounded-full border border-[#8c6b4a] bg-[#3d3122] p-3 text-white shadow-xl transition-all hover:bg-[#59442d] md:hidden"
      >
        <Filter size={20} />
      </button>

      <aside className={`fixed inset-y-0 left-0 z-50 flex h-full w-80 flex-col overflow-y-auto border-r border-[#e8dcc4] bg-white p-4 transition-transform duration-300 md:relative md:w-72 md:translate-x-0 ${isOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-[#3d3122] p-2 text-white shadow-sm">
              <Layers size={18} />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight text-[#3d3122]">Nest Notebook</h2>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#8c6b4a]">Documents - Sections - Pages</p>
            </div>
          </div>
          <button className="rounded-full p-1.5 text-[#8c6b4a] transition-colors hover:bg-[#ebdcc8] hover:text-[#3d3122] md:hidden" onClick={() => setIsOpen(false)}>
            <X size={20} />
          </button>
        </div>

        <div className="mb-6 rounded-2xl border border-[#eadfca] bg-[#fffaf3] p-3">
          <h3 className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-[#8c6b4a]">You are here</h3>
          <div className="space-y-2 text-xs leading-5 text-[#6b5b45]">
            <div>
              <span className="font-black text-[#3d3122]">Nest</span>
              <span className="mx-1 text-[#b69b73]">-&gt;</span>
              <span>{projectSlug || "Current workspace"}</span>
            </div>
            <div>
              <span className="font-black text-[#3d3122]">Notebook section</span>
              <span className="mx-1 text-[#b69b73]">-&gt;</span>
              <span>{activeShelf.label}</span>
              <span className="ml-2 rounded bg-[#fff1d8] px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-[#8c6b4a]">
                {activeShelf.shortcut}
              </span>
            </div>
            <div>
              <span className="font-black text-[#3d3122]">Document</span>
              <span className="mx-1 text-[#b69b73]">-&gt;</span>
              <span className="break-words">{activeDocument?.title || "Current page"}</span>
              {activeDocument ? (
                <span className={`ml-2 inline-flex rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] ${documentKindClasses(activeDocumentKind, false)}`}>
                  {activeDocumentKind}
                </span>
              ) : null}
            </div>
            {activeDocument ? (
              <div>
                <span className="font-black text-[#3d3122]">Touched</span>
                <span className="mx-1 text-[#b69b73]">-&gt;</span>
                <span>{formatNotebookUpdatedAt(activeDocument.updatedAt)}</span>
              </div>
            ) : null}
            {activeDocument ? (
              <div className="rounded-xl border border-[#eadfca] bg-white px-3 py-3">
                <label className="block text-[9px] font-black uppercase tracking-[0.14em] text-[#8c6b4a]" htmlFor="notebook-page-title">
                  Page title
                </label>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    id="notebook-page-title"
                    type="text"
                    value={pageTitleDraft}
                    onChange={(event) => setPageTitleDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        submitPageRename();
                      }
                    }}
                    className="min-w-0 flex-1 rounded-lg border border-[#e1d1b4] bg-[#fffaf3] px-2 py-1.5 text-xs font-semibold text-[#3d3122] outline-none transition focus:border-[#8c6b4a] focus:bg-white"
                    placeholder="Name this page"
                    maxLength={160}
                  />
                  <button
                    type="button"
                    disabled={isRenamingDocument || !pageTitleDraft.trim() || pageTitleDraft.trim() === activeDocument.title}
                    onClick={submitPageRename}
                    className="rounded-lg border border-[#d4c1a0] bg-[#3d3122] px-2.5 py-1.5 text-[9px] font-black uppercase tracking-[0.12em] text-white transition hover:bg-[#59442d] disabled:cursor-not-allowed disabled:bg-[#d8c9ae] disabled:text-white/80"
                  >
                    {isRenamingDocument ? "Saving" : "Rename"}
                  </button>
                </div>
                <p className="mt-2 text-[10px] leading-4 text-[#8c6b4a]">
                  Renames the notebook page. It does not rewrite the body or fixed source text.
                </p>
                {pageRenameError ? (
                  <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-[10px] leading-4 text-rose-800">
                    {pageRenameError}
                  </p>
                ) : null}
                <div className="mt-3 border-t border-[#eadfca] pt-3">
                  {activeDocumentKind === "Note" ? (
                    <>
                      <button
                        type="button"
                        disabled={isPromotingNote}
                        onClick={promoteNoteToWritingPage}
                        className="mb-2 flex w-full items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-left text-[10px] font-black uppercase tracking-[0.12em] text-emerald-900 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <PenLine size={14} />
                        {isPromotingNote ? "Creating writing page..." : "Promote note to writing page"}
                      </button>
                      <p className="mb-2 text-[10px] leading-4 text-[#61806d]">
                        Keeps this note intact and opens a new draft page seeded from it.
                      </p>
                      {pagePromoteError ? (
                        <p className="mb-2 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-[10px] leading-4 text-rose-800">
                          {pagePromoteError}
                        </p>
                      ) : null}
                    </>
                  ) : null}
                  <button
                    type="button"
                    disabled={isDuplicatingDocument}
                    onClick={duplicatePageAsDraft}
                    className="flex w-full items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-left text-[10px] font-black uppercase tracking-[0.12em] text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <CopyPlus size={14} />
                    {isDuplicatingDocument ? "Branching draft..." : "Duplicate as draft"}
                  </button>
                  <p className="mt-2 text-[10px] leading-4 text-[#8c6b4a]">
                    Makes a safe editable copy. The original page or fixed source stays untouched.
                  </p>
                  {pageDuplicateError ? (
                    <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-[10px] leading-4 text-rose-800">
                      {pageDuplicateError}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}
            <div>
              <span className="font-black text-[#3d3122]">Section</span>
              <span className="mx-1 text-[#b69b73]">-&gt;</span>
              <span>{activeBoundary ? activeBoundary.label : "Full document"}</span>
            </div>
          </div>
          {(activeBoundary || notebookQuery) ? (
            <div className="mt-3 grid gap-2">
              {activeBoundary ? (
                <button
                  type="button"
                  onClick={() => setActiveBoundaryId(null)}
                  className="rounded-xl border border-[#d4c1a0] bg-white px-3 py-2 text-left text-[10px] font-black uppercase tracking-[0.14em] text-[#5e4b33] transition-colors hover:bg-[#f8f1e3]"
                >
                  Return to full document
                </button>
              ) : null}
              {notebookQuery ? (
                <button
                  type="button"
                  onClick={() => setNotebookQuery("")}
                  className="rounded-xl border border-[#d4c1a0] bg-white px-3 py-2 text-left text-[10px] font-black uppercase tracking-[0.14em] text-[#5e4b33] transition-colors hover:bg-[#f8f1e3]"
                >
                  Clear notebook search
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="mb-6">
          <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.16em] text-[#8c6b4a]" htmlFor="notebook-search">
            Find in notebook
          </label>
          <div className="flex items-center gap-2 rounded-2xl border border-[#eadfca] bg-[#fffaf3] px-3 py-2 shadow-inner">
            <Search size={14} className="shrink-0 text-[#8c6b4a]" />
            <input
              ref={notebookSearchRef}
              id="notebook-search"
              type="search"
              value={notebookQuery}
              onChange={(event) => setNotebookQuery(event.target.value)}
              placeholder="Search pages, sources, chapters..."
              className="min-w-0 flex-1 bg-transparent text-sm font-medium text-[#3d3122] placeholder:text-[#a58a69] focus:outline-none"
            />
            {notebookQuery ? (
              <button
                type="button"
                onClick={() => setNotebookQuery("")}
                className="rounded-full p-1 text-[#8c6b4a] transition hover:bg-[#eadfca] hover:text-[#3d3122]"
                aria-label="Clear notebook search"
              >
                <X size={14} />
              </button>
            ) : null}
          </div>
        </div>

        <div className="mb-6 rounded-2xl border border-[#eadfca] bg-[#fffaf3] p-2">
          <div className="grid grid-cols-3 gap-1">
            {notebookPanelItems.map((item) => {
              const isSelected = notebookPanel === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setNotebookPanel(item.id)}
                  className={`rounded-xl px-2 py-2 text-left transition ${
                    isSelected
                      ? "bg-[#3d3122] text-white shadow-sm"
                      : "text-[#6b5b45] hover:bg-white"
                  }`}
                >
                  <span className="block text-[11px] font-black uppercase tracking-[0.14em]">
                    {item.label}
                  </span>
                  <span className={`mt-1 block truncate text-[9px] font-bold ${isSelected ? "text-white/70" : "text-[#9a815f]"}`}>
                    {item.hint}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 px-1 text-[10px] leading-4 text-[#8c6b4a]">
            Pages first keeps the desk calm. Structure and tools stay one click away instead of crowding the writing room.
          </p>
        </div>

        {notebookPanel === "pages" ? (
          <>
        <div className="mb-7 rounded-2xl border border-[#eadfca] bg-[#fffaf3] p-3">
          <h3 className="mb-2 flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-[#8c6b4a]">
            <BookOpen size={12} />
            Notebook Sections
          </h3>
          <p className="mb-3 text-[10px] leading-4 text-[#8c6b4a]">
            OneNote floor: sections help you find pages fast. This changes the view only; it does not move, rewrite, or publish anything.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {pageFilterItems.map((item) => {
              const isSelected = pageFilter === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setPageFilter(item.id)}
                  title={`${item.description} - ${item.shortcut}`}
                  className={`rounded-xl border px-3 py-2 text-left transition ${
                    isSelected
                      ? "border-[#3d3122] bg-[#3d3122] text-white shadow-sm"
                      : "border-[#eadfca] bg-white text-[#5e4b33] hover:bg-amber-50"
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black uppercase tracking-[0.14em]">{item.label}</span>
                    <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-black ${isSelected ? "bg-white/15 text-white" : "bg-[#fff1d8] text-[#8c6b4a]"}`}>
                      {item.count}
                    </span>
                  </span>
                  <span className={`mt-1 block text-[9px] leading-3 ${isSelected ? "text-white/70" : "text-[#9a815f]"}`}>
                    {item.description}
                  </span>
                  <span className={`mt-2 inline-flex rounded px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.12em] ${isSelected ? "bg-white/15 text-white/80" : "bg-[#f8f1e3] text-[#9a815f]"}`}>
                    {item.shortcut}
                  </span>
                </button>
              );
            })}
          </div>
          {!activeDocumentVisible && activeDocument ? (
            <div className="mt-3 rounded-xl border border-amber-200 bg-white px-3 py-3 text-[10px] leading-4 text-[#8c6b4a]">
              <p>
                Current page is open but hidden by this section/search. The editor is still safe; only the sidebar list changed.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setPageFilter("all")}
                  className="rounded-lg border border-[#d4c1a0] bg-[#3d3122] px-2.5 py-1.5 text-[9px] font-black uppercase tracking-[0.12em] text-white transition hover:bg-[#59442d]"
                >
                  Show all sections
                </button>
                <button
                  type="button"
                  onClick={() => setNotebookQuery("")}
                  className="rounded-lg border border-[#d4c1a0] bg-white px-2.5 py-1.5 text-[9px] font-black uppercase tracking-[0.12em] text-[#5e4b33] transition hover:bg-[#f8f1e3]"
                >
                  Clear search
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {recentDocuments.length > 0 ? (
          <div className="mb-7 rounded-2xl border border-[#eadfca] bg-white p-3 shadow-sm">
            <h3 className="mb-2 flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-[#8c6b4a]">
              <BookOpen size={12} />
              Recent Pages
            </h3>
            <p className="mb-3 text-[10px] leading-4 text-[#8c6b4a]">
              Fast context recovery for the spots you were just working in.
            </p>
            <div className="space-y-1">
              {recentDocuments.map((doc) => (
                <a
                  key={doc.id}
                  href={`/create?project=${encodeURIComponent(projectSlug || "")}&document=${encodeURIComponent(doc.id)}`}
                  className="block rounded-lg border border-transparent px-3 py-2 text-sm font-medium text-[#5e4b33] transition hover:border-[#eadfca] hover:bg-amber-50"
                >
                  <span className="block truncate">{doc.title}</span>
                  <span className="mt-1 flex items-center justify-between gap-2">
                    <span className={`inline-flex rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] ${documentKindClasses(documentKind(doc), false)}`}>
                      {documentKind(doc)}
                    </span>
                    <span className="truncate text-[9px] font-bold uppercase tracking-[0.12em] text-[#a58a69]">
                      {formatNotebookUpdatedAt(doc.updatedAt)}
                    </span>
                  </span>
                </a>
              ))}
            </div>
          </div>
        ) : null}

        {projectSlug ? (
          <div className="mb-7 rounded-2xl border border-[#eadfca] bg-[#fffaf3] p-3">
            <h3 className="mb-3 flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-[#8c6b4a]">
              <NotebookPen size={12} />
              Quick Capture
            </h3>
            <p className="mb-3 text-xs leading-5 text-[#6b5b45]">
              Make the new page first, organize it later. The notebook should catch ideas faster than anxiety can argue.
            </p>
            <div className="grid gap-2">
              <button
                type="button"
                disabled={isCreatingDocument}
                onClick={() => startCreateDocumentTransition(() => createDocumentAction(projectSlug, "draft"))}
                title="Create a new writing page - Alt+P"
                className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-left shadow-sm transition hover:-translate-y-0.5 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="flex items-center gap-2 text-xs font-black text-[#3d3122]">
                  <FilePlus2 size={14} />
                  {isCreatingDocument ? "Creating..." : "New writing page"}
                  <span className="ml-auto rounded bg-amber-100 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.12em] text-amber-800">Alt+P</span>
                </span>
                <span className="mt-1 block text-[10px] leading-4 text-[#8c6b4a]">
                  Draft, article pass, chapter fragment, or episode page.
                </span>
              </button>
              <button
                type="button"
                disabled={isCreatingDocument}
                onClick={() => startCreateDocumentTransition(() => createDocumentAction(projectSlug, "note"))}
                title="Create a quick note - Alt+Q"
                className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-left shadow-sm transition hover:-translate-y-0.5 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="flex items-center gap-2 text-xs font-black text-[#244536]">
                  <FilePlus2 size={14} />
                  {isCreatingDocument ? "Creating..." : "Quick note"}
                  <span className="ml-auto rounded bg-emerald-100 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.12em] text-emerald-800">Alt+Q</span>
                </span>
                <span className="mt-1 block text-[10px] leading-4 text-[#61806d]">
                  Idea capture, research hunch, meeting note, or connective tissue.
                </span>
              </button>
              <button
                type="button"
                disabled={isCreatingDocument}
                onClick={() => startCreateDocumentTransition(() => createDocumentAction(projectSlug, "study-source"))}
                title="Create a fixed study source - Alt+R"
                className="rounded-xl border border-cyan-200 bg-white px-3 py-2 text-left shadow-sm transition hover:-translate-y-0.5 hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="flex items-center gap-2 text-xs font-black text-cyan-900">
                  <FilePlus2 size={14} />
                  {isCreatingDocument ? "Creating..." : "New study source"}
                  <span className="ml-auto rounded bg-cyan-100 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.12em] text-cyan-800">Alt+R</span>
                </span>
                <span className="mt-1 block text-[10px] leading-4 text-cyan-800">
                  Fixed reference text for annotation, tagging, citation, and research.
                </span>
              </button>
            </div>
          </div>
        ) : null}

        {(projectDocuments && projectDocuments.length > 0) && (
          <div className="mb-8">
            <h3 className="mb-3 flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-[#8c6b4a]">
              <BookOpen size={12} />
              Pages in {activeShelf.label}
            </h3>
            <div className="mb-3 grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-[#eadfca] bg-[#fffaf3] px-2 py-2">
                <div className="text-base font-black text-[#3d3122]">{visibleDocumentCount}</div>
                <div className="text-[9px] font-black uppercase tracking-[0.14em] text-[#8c6b4a]">Visible</div>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-2 py-2">
                <div className="text-base font-black text-amber-900">{draftDocs.length}</div>
                <div className="text-[9px] font-black uppercase tracking-[0.14em] text-amber-700">Pages</div>
              </div>
              <div className="rounded-xl border border-cyan-200 bg-cyan-50 px-2 py-2">
                <div className="text-base font-black text-cyan-900">{libraryDocs.length}</div>
                <div className="text-[9px] font-black uppercase tracking-[0.14em] text-cyan-700">Sources</div>
              </div>
            </div>
            {notebookQuery && visibleDocumentCount < totalDocumentCount ? (
              <p className="mb-3 rounded-xl border border-[#eadfca] bg-white px-3 py-2 text-[10px] leading-4 text-[#8c6b4a]">
                Showing {visibleDocumentCount} of {totalDocumentCount} documents for "{notebookQuery}" in the {pageFilter} shelf. Search and shelf filters only change what is visible here.
              </p>
            ) : null}
            <div className="space-y-4">
              {draftDocs.length > 0 && (
                <div>
                  <h4 className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[#8c6b4a] opacity-70">Writing pages, drafts, and notes</h4>
                  <p className="mb-2 text-[10px] leading-4 text-[#8c6b4a]">
                    The daily desk: manuscript pages, alternate passes, quick captures, and scraps before they belong in the polished spine.
                  </p>
                  <div className="space-y-1">
                    {filteredDraftDocs.map(doc => (
                      <a
                        key={doc.id}
                        href={`/create?project=${encodeURIComponent(projectSlug || "")}&document=${encodeURIComponent(doc.id)}`}
                        className={`block w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${activeDocumentId === doc.id ? "bg-[#3d3122] text-white shadow-sm" : "text-[#5e4b33] hover:bg-amber-50"}`}
                      >
                        <span className="block truncate">{doc.title}</span>
                        <span className="mt-1 flex items-center justify-between gap-2">
                          <span className={`inline-flex rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] ${documentKindClasses(documentKind(doc), activeDocumentId === doc.id)}`}>
                            {documentKind(doc)}
                          </span>
                          <span className={`truncate text-[9px] font-bold uppercase tracking-[0.12em] ${activeDocumentId === doc.id ? "text-white/65" : "text-[#a58a69]"}`}>
                            {formatNotebookUpdatedAt(doc.updatedAt)}
                          </span>
                        </span>
                      </a>
                    ))}
                    {filteredDraftDocs.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-[#d9c7a5] bg-[#fffaf0] px-3 py-3 text-xs leading-5 text-[#8c6b4a]">
                        No writing pages match this search. Clear search or make a quick note before the idea wanders off.
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
              
              {libraryDocs.length > 0 && (
                <div>
                  <h4 className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[#8c6b4a] opacity-70">Study library and fixed sources</h4>
                  <p className="mb-2 text-[10px] leading-4 text-[#8c6b4a]">
                    Fixed references live here. Annotate and tag over them; do not silently rewrite the source.
                  </p>
                  <div className="space-y-1">
                    {filteredLibraryDocs.map(doc => (
                      <a
                        key={doc.id}
                        href={`/create?project=${encodeURIComponent(projectSlug || "")}&document=${encodeURIComponent(doc.id)}`}
                        className={`block w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${activeDocumentId === doc.id ? "bg-[#3d3122] text-white shadow-sm" : "text-[#5e4b33] hover:bg-amber-50"}`}
                      >
                        <span className="block truncate">{doc.title}</span>
                        <span className="mt-1 flex items-center justify-between gap-2">
                          <span className={`inline-flex rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] ${documentKindClasses(documentKind(doc), activeDocumentId === doc.id)}`}>
                            {documentKind(doc)}
                          </span>
                          <span className={`truncate text-[9px] font-bold uppercase tracking-[0.12em] ${activeDocumentId === doc.id ? "text-white/65" : "text-[#a58a69]"}`}>
                            {formatNotebookUpdatedAt(doc.updatedAt)}
                          </span>
                        </span>
                      </a>
                    ))}
                    {filteredLibraryDocs.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-[#d9c7a5] bg-[#fffaf0] px-3 py-3 text-xs leading-5 text-[#8c6b4a]">
                        No study sources match this search. Fixed sources stay available; the search is only hiding them.
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
          </>
        ) : null}

        {notebookPanel === "tools" ? (
          <>
        <div className="mb-7 rounded-2xl border border-[#eadfca] bg-[#fffaf3] p-3">
          <h3 className="mb-3 flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-[#8c6b4a]">
            <Layers size={12} />
            Workflow System
          </h3>
          <p className="text-xs leading-5 text-[#6b5b45]">
            Current lane: <span className="font-black text-[#3d3122]">{WORKFLOW_SYSTEM_LABELS[workflowSystem]}</span>
          </p>
          <p className="mt-2 text-[10px] leading-5 text-[#6b5b45]">
            This is an informational map of available lanes. A Nest can stay in any lane; there is no right or wrong place to work.
          </p>
          <div className="mt-3 grid gap-1 text-[10px]">
            {WORKFLOW_SYSTEM_SEQUENCE.map((system, index) => (
              <div
                key={system}
                className={`rounded-lg border px-2 py-2 ${
                  system === workflowSystem
                    ? "border-amber-300 bg-amber-50 text-amber-900"
                    : index < WORKFLOW_SYSTEM_SEQUENCE.indexOf(workflowSystem)
                      ? "border-[#e8dcc4] bg-[#fff3dd] text-[#8a6943]"
                      : "border-[#ece6df] bg-white text-[#8f7d63]"
                }`}
              >
                <div className="font-black uppercase tracking-[0.14em]">
                  {index + 1}. {WORKFLOW_SYSTEM_LABELS[system]}
                </div>
                <div className="text-[10px] leading-5 text-[#6f5a3e]">
                  {WORKFLOW_SYSTEM_DESCRIPTIONS[system]}
                </div>
              </div>
            ))}
          </div>
        </div>
          </>
        ) : null}

        {notebookPanel === "structure" ? (
          <>
        <div className="mb-7 rounded-2xl border border-[#eadfca] bg-[#fffaf3] p-3">
          <h3 className="mb-3 flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-[#8c6b4a]">
            <BookOpen size={12} />
            Notebook Structure
          </h3>
          <p className="text-xs leading-5 text-[#6b5b45]">
            Create sections inside the page: make a heading block, then click its
            <span className="font-black text-[#3d3122]"> Chapter</span> or
            <span className="font-black text-[#3d3122]"> Episode</span> tag. The outline below is generated from the document itself.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2">
              <div className="text-lg font-black text-cyan-900">{chapterCount}</div>
              <div className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-700">Chapters</div>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2">
              <div className="text-lg font-black text-rose-900">{episodeCount}</div>
              <div className="text-[10px] font-black uppercase tracking-[0.16em] text-rose-700">Episodes</div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                window.dispatchEvent(new CustomEvent("quipsly:create-structure-block", {
                  detail: { kind: "chapter", label: "New Chapter" }
                }));
              }}
              className="rounded-xl border border-cyan-200 bg-white px-3 py-2 text-left text-[10px] font-black uppercase tracking-[0.14em] text-cyan-900 transition hover:bg-cyan-50"
            >
              + Chapter
            </button>
            <button
              type="button"
              onClick={() => {
                window.dispatchEvent(new CustomEvent("quipsly:create-structure-block", {
                  detail: { kind: "episode", label: "New Episode" }
                }));
              }}
              className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-left text-[10px] font-black uppercase tracking-[0.14em] text-rose-900 transition hover:bg-rose-50"
            >
              + Episode
            </button>
          </div>
          {activeBoundary ? (
            <button
              type="button"
              onClick={() => setActiveBoundaryId(null)}
              className="mt-3 w-full rounded-xl border border-[#d4c1a0] bg-white px-3 py-2 text-xs font-black text-[#5e4b33] transition-colors hover:bg-[#f8f1e3]"
            >
              Show full manuscript
            </button>
          ) : null}
        </div>

          </>
        ) : null}

        {notebookPanel === "tools" ? (
          <>
        <div className="mb-8">
          <h3 className="mb-3 flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-[#8c6b4a]">
            <LayoutTemplate size={12} />
            Focus Lenses
          </h3>
          <div className="space-y-1">
            <button
              onClick={() => setActiveView(DEFAULT_VIEW)}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${activeView.id === "default" && !activeBoundaryId ? "bg-amber-100 text-amber-900 shadow-sm" : "text-[#5e4b33] hover:bg-amber-50"}`}
            >
              Everything Mode
            </button>
            {views.filter((view) => view.type !== "episode").map((view) => (
              <button
                key={view.id}
                onClick={() => setActiveView(view)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors ${activeView.id === view.id ? "bg-amber-100 text-amber-900 shadow-sm" : "text-[#5e4b33] hover:bg-amber-50"}`}
              >
                {view.name}
                {view.name === "Book Mode" && <span className="rounded bg-green-200/60 px-1.5 py-0.5 text-[10px] uppercase text-green-800">BOOK</span>}
                {view.type === "review" && view.name !== "Book Mode" && <span className="rounded bg-blue-200/60 px-1.5 py-0.5 text-[10px] uppercase text-blue-800">SHOW</span>}
              </button>
            ))}
          </div>
        </div>
          </>
        ) : null}

        {notebookPanel === "structure" ? (
          <>
        <div className="mb-8">
          <h3 className="mb-3 flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-[#8c6b4a]">
            <Layers size={12} />
            Page Outline
          </h3>
          <p className="mb-3 text-[10px] leading-tight text-[#8c6b4a]">
            Click a heading to focus from that heading until the next heading. Drag handles are planning-only until persistent reorder is promoted.
          </p>
          {documentBoundaries.length > 0 ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={localBoundaries.map(b => b.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-1">
                  {filteredOutlineRows.map(({ boundary, isNested }) => {
                    const isActive = activeBoundaryId === boundary.id;
                    const isScrolled = scrolledBoundaryId === boundary.id;

                    return (
                      <SortableOutlineItem
                        key={boundary.id}
                        boundary={boundary}
                        isActive={isActive}
                        isScrolled={isScrolled}
                        isNested={isNested}
                        onClick={() => {
                          setActiveBoundaryId(boundary.id);
                          window.dispatchEvent(new CustomEvent("quipsly:focus-block", { detail: { blockId: boundary.id } }));
                        }}
                      />
                    );
                  })}
                  {filteredOutlineRows.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[#d9c7a5] bg-[#fffaf0] px-3 py-3 text-xs leading-5 text-[#8c6b4a]">
                      No chapter or episode headings match this search. Clear search to see the whole page outline.
                    </div>
                  ) : null}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <div className="rounded-xl border border-dashed border-[#d9c7a5] bg-[#fffaf0] px-3 py-3 text-xs leading-5 text-[#8c6b4a]">
              No outline yet. Make a block titled something like <strong>Chapter 1</strong> or <strong>Episode 4</strong>, then tag that block as Chapter or Episode.
            </div>
          )}
        </div>
          </>
        ) : null}
      </aside>
    </>
  );
}
