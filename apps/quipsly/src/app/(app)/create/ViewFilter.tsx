"use client";

import { useMemo, useState } from "react";
import { BookOpen, Filter, Layers, LayoutTemplate, X } from "lucide-react";
import { DocumentBoundary, ViewDefinition } from "./types";
import { DEFAULT_VIEW } from "./Workspace";
import {
  WORKFLOW_SYSTEM_DESCRIPTIONS,
  WORKFLOW_SYSTEM_LABELS,
  WORKFLOW_SYSTEM_SEQUENCE,
} from "@/lib/studio/project-registry";

export default function ViewFilter({
  activeView,
  setActiveView,
  views,
  documentBoundaries,
  activeBoundaryId,
  setActiveBoundaryId,
  scrolledBoundaryId,
  workflowSystem,
}: {
  activeView: ViewDefinition;
  setActiveView: (view: ViewDefinition) => void;
  views: ViewDefinition[];
  documentBoundaries: DocumentBoundary[];
  activeBoundaryId: string | null;
  setActiveBoundaryId: (boundaryId: string | null) => void;
  scrolledBoundaryId?: string | null;
  workflowSystem: "data-ingestion" | "knowledge-processing" | "content-creation" | "content-publishing";
}) {
  const [isOpen, setIsOpen] = useState(false);
  const activeBoundary = documentBoundaries.find((boundary) => boundary.id === activeBoundaryId) ?? null;
  const chapterCount = documentBoundaries.filter((boundary) => boundary.kind === "chapter").length;
  const episodeCount = documentBoundaries.filter((boundary) => boundary.kind === "episode").length;

  const hierarchicalOutline = useMemo(() => {
    const rows: Array<{
      boundary: DocumentBoundary;
      isNested: boolean;
    }> = [];

    let lastChapterBoundaryId: string | null = null;

    for (const boundary of documentBoundaries) {
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
  }, [documentBoundaries]);

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

      <aside className={`fixed inset-y-0 left-0 z-50 flex h-full w-72 flex-col overflow-y-auto border-r border-[#e8dcc4] bg-white p-6 transition-transform duration-300 md:relative md:translate-x-0 ${isOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-[#3d3122] p-2 text-white shadow-sm">
              <Layers size={18} />
            </div>
            <h2 className="text-lg font-black tracking-tight text-[#3d3122]">Views & Filters</h2>
          </div>
          <button className="rounded-full p-1.5 text-[#8c6b4a] transition-colors hover:bg-[#ebdcc8] hover:text-[#3d3122] md:hidden" onClick={() => setIsOpen(false)}>
            <X size={20} />
          </button>
        </div>

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
            Structure Spine
          </h3>
          <p className="text-xs leading-5 text-[#6b5b45]">
            Create chapters and episodes inside the manuscript: make a heading block, then click its
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
            Lenses
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
            Document Outline
          </h3>
          <p className="mb-3 text-[10px] leading-tight text-[#8c6b4a]">
            Click a heading to focus from that heading until the next heading.
          </p>
          {documentBoundaries.length > 0 ? (
            <div className="space-y-1">
              {hierarchicalOutline.map(({ boundary, isNested }) => {
                const isActive = activeBoundaryId === boundary.id;
                const isScrolled = scrolledBoundaryId === boundary.id;
                const spanLabel = `${boundary.startIndex + 1}-${boundary.endIndex + 1}`;

                return (
                  <button
                    key={boundary.id}
                    onClick={() => {
                      setActiveBoundaryId(boundary.id);
                      window.dispatchEvent(new CustomEvent("quipsly:focus-block", { detail: { blockId: boundary.id } }));
                    }}
                    aria-current={isActive ? "true" : undefined}
                    title={`${boundary.kind} outline`}
                    className={`flex w-full items-start justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${isActive ? "bg-[#3d3122] text-white shadow-sm" : isScrolled ? "bg-[#fff5df] text-[#5e4b33]" : "text-[#5e4b33] hover:bg-amber-50"} ${isNested ? "pl-6" : ""}`}
                  >
                    <span className="min-w-0 flex-1 leading-snug">
                      {isNested ? (
                        <span className={`mr-1 inline-block select-none ${isActive ? "text-white/75" : "text-[#8c6b4a]"}`}>-&gt;</span>
                      ) : null}
                      <span className="block truncate font-medium">{boundary.label}</span>
                    </span>
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase ${isActive ? "bg-white/15 text-white" : boundary.kind === "chapter" ? "bg-cyan-100 text-cyan-800" : "bg-rose-100 text-rose-800"}`}>
                      {boundary.kind === "episode" ? "EP" : "CH"}
                    </span>
                  </button>
                );
              })}
            </div>
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
