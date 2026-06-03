"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Filter, Layers, LayoutTemplate, Tag, X } from "lucide-react";
import { DocumentBoundary, ViewDefinition } from "./types";
import { DEFAULT_VIEW } from "./Workspace";

const AVAILABLE_TAGS = [
  { id: "quote", label: "Quote" },
  { id: "social-clip", label: "Social Clip" },
  { id: "educational", label: "Educational" },
  { id: "internal_note", label: "Internal Note" },
  { id: "episode-1", label: "Episode 1" },
  { id: "episode-4", label: "Episode 4" },
  { id: "episode-8", label: "Episode 8" },
  { id: "episode-9", label: "Episode 9" },
  { id: "voice-homer", label: "Homer" },
  { id: "voice-charlie", label: "Charlie" },
  { id: "show-note", label: "Show Note" },
  { id: "clip-cue", label: "Clip Cue" },
  { id: "published-episode", label: "Published Episode" },
  { id: "youtube-clip", label: "YouTube Clip" }
];

const FALLBACK_EPISODE_LABELS: Record<string, string> = {
  "episode-1": "Episode 1",
  "episode-4": "Episode 4",
  "episode-8": "Episode 8",
  "episode-9": "Episode 9"
};

function labelFromEpisodeTagId(tagSlug: string) {
  return tagSlug
    .replace(/^episode-/i, "Episode ")
    .replace(/[-_]+/g, " ")
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

export default function ViewFilter({ 
  activeView, 
  setActiveView,
  adHocTags,
  setAdHocTags,
  views,
  documentBoundaries,
  activeBoundaryId,
  setActiveBoundaryId,
  onCreateEpisode,
  onCreateEpisodeError,
  onBulkNormalizeBoundaries
}: { 
  activeView: ViewDefinition, 
  setActiveView: (view: ViewDefinition) => void,
  adHocTags: string[],
  setAdHocTags: (tags: string[]) => void,
  views: ViewDefinition[],
  documentBoundaries: DocumentBoundary[],
  activeBoundaryId: string | null,
  setActiveBoundaryId: (boundaryId: string | null) => void,
  onCreateEpisode: (episodeLabel: string) => Promise<boolean>,
  onCreateEpisodeError?: string | null,
  onBulkNormalizeBoundaries: () => Promise<{ updatedCount: number; source: "local" | "gemini" | "hybrid"; message: string; skippedCount?: number }>
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isAddingEpisode, setIsAddingEpisode] = useState(false);
  const [newEpisodeLabel, setNewEpisodeLabel] = useState("");
  const [isSubmittingEpisode, setIsSubmittingEpisode] = useState(false);
  const [isBulkCleaning, setIsBulkCleaning] = useState(false);
  const [cleanupNotice, setCleanupNotice] = useState("");

  const episodeViews = views.filter((view) => view.type === "episode");
  const episodeTagFilters = useMemo(() => {
    const tagMap = new Map<string, string>();
    for (const view of episodeViews) {
      const tagId = view.filters.tagSlugs.find((slug) => /^episode-[a-z0-9-]+$/i.test(slug));
      if (!tagId) continue;
      tagMap.set(tagId, labelFromEpisodeTagId(tagId));
    }

    for (const [tagId, fallbackLabel] of Object.entries(FALLBACK_EPISODE_LABELS)) {
      if (!tagMap.has(tagId)) tagMap.set(tagId, fallbackLabel);
    }

    return [...tagMap.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([id, label]) => ({
      id,
      label
    }));
  }, [episodeViews]);

  const toggleFilterTag = (tagId: string) => {
    if (adHocTags.includes(tagId)) {
      setAdHocTags(adHocTags.filter(t => t !== tagId));
    } else {
      setAdHocTags([...adHocTags, tagId]);
    }
  };

  const handleAddEpisodeSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const episode = newEpisodeLabel.trim();
    if (!episode) return;

    setIsSubmittingEpisode(true);
    const created = await onCreateEpisode(episode);
    setIsSubmittingEpisode(false);
    if (created) {
      setNewEpisodeLabel("");
      setIsAddingEpisode(false);
      return;
    }

    setNewEpisodeLabel(episode);
  };

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
          isNested: !!lastChapterBoundaryId
        });
        continue;
      }

      rows.push({ boundary, isNested: false });
    }

    return rows;
  }, [documentBoundaries]);

  const handleBulkCleanup = async () => {
    setIsBulkCleaning(true);
    setCleanupNotice("");
    try {
      const result = await onBulkNormalizeBoundaries();
      const updatedCount = result.updatedCount ?? 0;
      setCleanupNotice(
        updatedCount > 0
          ? `${result.message || `${updatedCount} heading block${updatedCount === 1 ? "" : "s"} updated for chapter/episode consistency.`}`
          : result.message || "No heading blocks needed cleanup."
      );
    } catch (error) {
      console.error("Bulk heading cleanup failed.", error);
      setCleanupNotice("Heading cleanup failed. Please try again.");
    } finally {
      setIsBulkCleaning(false);
    }
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-[#3d3122]/40 backdrop-blur-sm z-40 transition-opacity" 
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* FAB to open Drawer on Mobile */}
      <button 
        onClick={() => setIsOpen(true)}
        className="md:hidden fixed bottom-20 right-4 z-30 bg-[#3d3122] text-white p-3 rounded-full shadow-xl flex items-center justify-center hover:bg-[#59442d] transition-all border border-[#8c6b4a]"
      >
        <Filter size={20} />
      </button>

      <aside className={`fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-[#e8dcc4] h-full flex flex-col p-6 overflow-y-auto transform transition-transform duration-300 md:relative md:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-2">
            <div className="bg-[#3d3122] text-white p-2 rounded-lg shadow-sm">
              <Layers size={18} />
            </div>
            <h2 className="text-lg font-black text-[#3d3122] tracking-tight">Views & Filters</h2>
          </div>
          <button className="md:hidden p-1.5 text-[#8c6b4a] hover:bg-[#ebdcc8] hover:text-[#3d3122] rounded-full transition-colors" onClick={() => setIsOpen(false)}>
            <X size={20} />
          </button>
        </div>

      <div className="mb-8">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h3 className="text-xs font-bold text-[#8c6b4a] uppercase tracking-wider flex items-center gap-1">
            <LayoutTemplate size={12} />
            Chapter & Episode Hygiene
          </h3>
          <button
            onClick={handleBulkCleanup}
            disabled={isBulkCleaning}
            className="rounded-full border border-[#d3a24f] bg-[#fff5df] px-2 py-1 text-[10px] font-bold text-[#9a5f13] hover:bg-[#ffeac0] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isBulkCleaning ? "Cleaning..." : "Bulk clean headings"}
          </button>
        </div>
        {cleanupNotice ? (
          <p className="mb-3 rounded-lg border border-[#eadfca] bg-white px-3 py-2 text-xs text-[#6b5b45]">
            {cleanupNotice}
          </p>
        ) : null}
        <h3 className="text-xs font-bold text-[#8c6b4a] uppercase tracking-wider mb-3 flex items-center gap-1">
          <LayoutTemplate size={12} />
          Lenses
        </h3>
        <div className="space-y-1">
          <button
            onClick={() => setActiveView(DEFAULT_VIEW)}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeView.id === "default" && !activeBoundaryId ? 'bg-amber-100 text-amber-900 shadow-sm' : 'text-[#5e4b33] hover:bg-amber-50'}`}
          >
            Everything Mode
          </button>
          {views.filter((view) => view.type !== "episode").map(view => (
            <button
              key={view.id}
              onClick={() => setActiveView(view)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeView.id === view.id ? 'bg-amber-100 text-amber-900 shadow-sm' : 'text-[#5e4b33] hover:bg-amber-50'}`}
            >
              {view.name}
            {view.name === "Book Mode" && <span className="text-[10px] uppercase bg-green-200/60 text-green-800 px-1.5 py-0.5 rounded">BOOK</span>}
            {view.type === "review" && view.name !== "Book Mode" && <span className="text-[10px] uppercase bg-blue-200/60 text-blue-800 px-1.5 py-0.5 rounded">SHOW</span>}
          </button>
          ))}
        </div>
      </div>

      <div className="mb-8">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-xs font-bold text-[#8c6b4a] uppercase tracking-wider flex items-center gap-1">
            <Tag size={12} />
            Episodes
          </h3>
          <button
            onClick={() => {
              setIsAddingEpisode((prev) => !prev);
              setNewEpisodeLabel("");
            }}
            className="rounded-full border border-[#d3a24f] bg-[#fff5df] px-2 py-1 text-[10px] font-bold text-[#9a5f13] hover:bg-[#ffeac0]"
          >
            {isAddingEpisode ? "Cancel" : "Add Episode"}
          </button>
        </div>
        <p className="text-[10px] text-[#8c6b4a] mb-2 leading-tight">
          Create a new episode lens and it will persist to this project.
        </p>
        <div className="space-y-1">
          {episodeViews.length === 0 ? (
            <div className="px-3 py-2 rounded-lg text-xs text-[#8c6b4a] border border-dashed border-[#d9c7a5] bg-[#fffaf0]">
              No episode lenses yet for this project.
            </div>
          ) : (
            episodeViews.map((view) => (
              <button
                key={view.id}
                onClick={() => setActiveView(view)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeView.id === view.id ? 'bg-amber-100 text-amber-900 shadow-sm' : 'text-[#5e4b33] hover:bg-amber-50'}`}
              >
                {view.name}
                <span className="text-[10px] uppercase bg-amber-200/50 text-amber-700 px-1.5 py-0.5 rounded">EP</span>
              </button>
            ))
          )}
        </div>

        {isAddingEpisode ? (
          <form onSubmit={handleAddEpisodeSubmit} className="mt-3 flex flex-col gap-2">
            <input
              value={newEpisodeLabel}
              onChange={(event) => setNewEpisodeLabel(event.target.value)}
              placeholder="Episode 10 or Final Cut"
              className="w-full rounded-lg border border-[#d3a24f] bg-white px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={isSubmittingEpisode || !newEpisodeLabel.trim()}
              className="rounded-lg bg-[#3d3122] px-3 py-2 text-xs font-black text-white disabled:opacity-60"
            >
              {isSubmittingEpisode ? "Saving..." : "Create episode lens"}
            </button>
            {onCreateEpisodeError ? (
              <p className="text-xs text-red-700">Oops: {onCreateEpisodeError}</p>
            ) : null}
          </form>
        ) : null}
      </div>

      {documentBoundaries.length > 0 ? (
        <div className="mb-8">
          <h3 className="text-xs font-bold text-[#8c6b4a] uppercase tracking-wider mb-3 flex items-center gap-1">
            <Layers size={12} />
            Document Outline
          </h3>
          <p className="text-[10px] text-[#8c6b4a] mb-3 leading-tight">
            Click a heading to focus from that heading until the next heading.
          </p>
          <div className="space-y-1">
            {hierarchicalOutline.map(({ boundary, isNested }) => (
              <button
                key={boundary.id}
                onClick={() => setActiveBoundaryId(boundary.id)}
                className={`w-full flex items-start justify-between gap-2 px-3 py-2 rounded-lg text-left text-sm font-medium transition-colors ${activeBoundaryId === boundary.id ? 'bg-[#3d3122] text-white shadow-sm' : 'text-[#5e4b33] hover:bg-amber-50'} ${isNested ? "pl-6" : ""}`}
              >
                <span className="min-w-0 flex-1 leading-snug">
                  {isNested ? (
                    <span className="inline-block text-[#8c6b4a] mr-1 select-none">↳</span>
                  ) : null}
                  <span className="font-medium">{boundary.label}</span>
                </span>
                <span className={`shrink-0 text-[10px] uppercase px-1.5 py-0.5 rounded ${activeBoundaryId === boundary.id ? 'bg-white/15 text-white' : boundary.kind === "chapter" ? 'bg-emerald-200/60 text-emerald-800' : 'bg-amber-200/50 text-amber-700'}`}>
                  {boundary.kind === "episode" ? "EP" : "CH"}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mb-8">
        <h3 className="text-xs font-bold text-[#8c6b4a] uppercase tracking-wider mb-3 flex items-center gap-1">
          <Filter size={12} />
          Ad-Hoc Tag Filters
        </h3>
        <p className="text-[10px] text-[#8c6b4a] mb-3 leading-tight">
          Temporarily narrow the living document without creating a second document.
        </p>
        <div className="flex flex-wrap gap-2">
          {episodeTagFilters.map(tag => (
             <button
               key={tag.id}
               onClick={() => toggleFilterTag(tag.id)}
               className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-all ${
                 adHocTags.includes(tag.id) 
                   ? 'bg-[#3d3122] text-white border-[#3d3122] shadow-sm' 
                   : 'bg-white text-[#5e4b33] border-[#d4c1a0] hover:bg-amber-50 hover:border-[#8c6b4a]'
               }`}
             >
               <div className="flex items-center gap-1">
                 <Tag size={10} />
                 {tag.label}
               </div>
             </button>
          ))}
        </div>
      </div>
    </aside>
    </>
  );
}
