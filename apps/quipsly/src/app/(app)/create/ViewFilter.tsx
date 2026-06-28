"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { BookOpen, FilePlus2, Filter, Layers, LayoutTemplate, NotebookPen, Search, X } from "lucide-react";
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
import { createDocumentAction } from "../nests/[slug]/actions";

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
  const [isOpen, setIsOpen] = useState(false);
  const [isCreatingDocument, startCreateDocumentTransition] = useTransition();
  const [notebookQuery, setNotebookQuery] = useState("");
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
  const filteredDraftDocs = draftDocs.filter((doc) => (
    matchesNotebookQuery(doc.title)
      || matchesNotebookQuery(doc.sourceLabel)
      || matchesNotebookQuery(documentKind(doc))
  ));
  const filteredLibraryDocs = libraryDocs.filter((doc) => (
    matchesNotebookQuery(doc.title)
      || matchesNotebookQuery(doc.sourceLabel)
      || matchesNotebookQuery(documentKind(doc))
  ));
  const activeDocument = (projectDocuments || []).find((doc) => doc.id === activeDocumentId) ?? null;
  const activeDocumentKind = activeDocument ? documentKind(activeDocument) : "Document";
  const totalDocumentCount = projectDocuments?.length ?? 0;
  const visibleDocumentCount = filteredDraftDocs.length + filteredLibraryDocs.length;

  const [localBoundaries, setLocalBoundaries] = useState(documentBoundaries);

  // Sync with upstream boundaries when the manuscript structure changes.
  useEffect(() => {
    setLocalBoundaries(documentBoundaries);
  }, [documentBoundaries]);

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

      <aside className={`fixed inset-y-0 left-0 z-50 flex h-full w-80 flex-col overflow-y-auto border-r border-[#e8dcc4] bg-white p-6 transition-transform duration-300 md:relative md:translate-x-0 ${isOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="mb-8 flex items-center justify-between">
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

        <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-3 text-[#244536]">
          <h3 className="text-xs font-black uppercase tracking-[0.16em] text-emerald-900">Writing-first rule</h3>
          <p className="mt-2 text-xs leading-5 text-emerald-900/80">
            Organize like a notebook first. Quipsly tags, research, and publishing tools should help after the page is easy to find.
          </p>
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
              <span className="font-black text-[#3d3122]">Document</span>
              <span className="mx-1 text-[#b69b73]">-&gt;</span>
              <span className="break-words">{activeDocument?.title || "Current page"}</span>
              {activeDocument ? (
                <span className={`ml-2 inline-flex rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] ${documentKindClasses(activeDocumentKind, false)}`}>
                  {activeDocumentKind}
                </span>
              ) : null}
            </div>
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

        {projectSlug ? (
          <div className="mb-7 rounded-2xl border border-[#eadfca] bg-[#fffaf3] p-3">
            <h3 className="mb-3 flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-[#8c6b4a]">
              <NotebookPen size={12} />
              Quick Capture
            </h3>
            <p className="mb-3 text-xs leading-5 text-[#6b5b45]">
              OneNote floor: make it fast to create a page before the idea escapes into the vents.
            </p>
            <div className="grid gap-2">
              <button
                type="button"
                disabled={isCreatingDocument}
                onClick={() => startCreateDocumentTransition(() => createDocumentAction(projectSlug, "draft"))}
                className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-left shadow-sm transition hover:-translate-y-0.5 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="flex items-center gap-2 text-xs font-black text-[#3d3122]">
                  <FilePlus2 size={14} />
                  {isCreatingDocument ? "Creating..." : "New writing page"}
                </span>
                <span className="mt-1 block text-[10px] leading-4 text-[#8c6b4a]">
                  Draft, article pass, chapter fragment, or episode page.
                </span>
              </button>
              <button
                type="button"
                disabled={isCreatingDocument}
                onClick={() => startCreateDocumentTransition(() => createDocumentAction(projectSlug, "note"))}
                className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-left shadow-sm transition hover:-translate-y-0.5 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="flex items-center gap-2 text-xs font-black text-[#244536]">
                  <FilePlus2 size={14} />
                  {isCreatingDocument ? "Creating..." : "Quick note"}
                </span>
                <span className="mt-1 block text-[10px] leading-4 text-[#61806d]">
                  Idea capture, research hunch, meeting note, or connective tissue.
                </span>
              </button>
              <button
                type="button"
                disabled={isCreatingDocument}
                onClick={() => startCreateDocumentTransition(() => createDocumentAction(projectSlug, "study-source"))}
                className="rounded-xl border border-cyan-200 bg-white px-3 py-2 text-left shadow-sm transition hover:-translate-y-0.5 hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="flex items-center gap-2 text-xs font-black text-cyan-900">
                  <FilePlus2 size={14} />
                  {isCreatingDocument ? "Creating..." : "New study source"}
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
              Notebook / Documents
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
                Showing {visibleDocumentCount} of {totalDocumentCount} documents for "{notebookQuery}". Search only changes what is visible here.
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
                        <span className={`mt-1 inline-flex rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] ${documentKindClasses(documentKind(doc), activeDocumentId === doc.id)}`}>
                          {documentKind(doc)}
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
                        <span className={`mt-1 inline-flex rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] ${documentKindClasses(documentKind(doc), activeDocumentId === doc.id)}`}>
                          {documentKind(doc)}
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
      </aside>
    </>
  );
}
