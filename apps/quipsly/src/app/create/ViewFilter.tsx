"use client";

import { Filter, Layers, LayoutTemplate, Tag } from "lucide-react";
import { DocumentBoundary, ViewDefinition } from "./types";
import { DEFAULT_VIEW } from "./Workspace";

const AVAILABLE_TAGS = [
  { id: "quote", label: "Quote" },
  { id: "social-clip", label: "Social Clip" },
  { id: "educational", label: "Educational" },
  { id: "internal_note", label: "Internal Note" },
  { id: "episode-4", label: "Episode 4" },
  { id: "episode-8", label: "Episode 8" },
  { id: "episode-9", label: "Episode 9" },
  { id: "voice-homer", label: "Homer" },
  { id: "voice-charlie", label: "Charlie" },
  { id: "show-note", label: "Show Note" },
  { id: "clip-cue", label: "Clip Cue" },
  { id: "youtube-clip", label: "YouTube Clip" }
];

export default function ViewFilter({ 
  activeView, 
  setActiveView,
  adHocTags,
  setAdHocTags,
  views,
  documentBoundaries,
  activeBoundaryId,
  setActiveBoundaryId
}: { 
  activeView: ViewDefinition, 
  setActiveView: (view: ViewDefinition) => void,
  adHocTags: string[],
  setAdHocTags: (tags: string[]) => void,
  views: ViewDefinition[],
  documentBoundaries: DocumentBoundary[],
  activeBoundaryId: string | null,
  setActiveBoundaryId: (boundaryId: string | null) => void
}) {

  const toggleFilterTag = (tagId: string) => {
    if (adHocTags.includes(tagId)) {
      setAdHocTags(adHocTags.filter(t => t !== tagId));
    } else {
      setAdHocTags([...adHocTags, tagId]);
    }
  };

  return (
    <aside className="w-72 bg-white border-r border-[#e8dcc4] h-full flex flex-col p-6 overflow-y-auto">
      <div className="flex items-center gap-2 mb-8">
        <div className="bg-[#3d3122] text-white p-2 rounded-lg shadow-sm">
          <Layers size={18} />
        </div>
        <h2 className="text-lg font-black text-[#3d3122] tracking-tight">Views & Filters</h2>
      </div>

      <div className="mb-8">
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
          {views.map(view => (
            <button
              key={view.id}
              onClick={() => setActiveView(view)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeView.id === view.id ? 'bg-amber-100 text-amber-900 shadow-sm' : 'text-[#5e4b33] hover:bg-amber-50'}`}
            >
              {view.name}
              {view.type === "episode" && <span className="text-[10px] uppercase bg-amber-200/50 text-amber-700 px-1.5 py-0.5 rounded">EP</span>}
              {view.name === "Book Mode" && <span className="text-[10px] uppercase bg-green-200/60 text-green-800 px-1.5 py-0.5 rounded">BOOK</span>}
              {view.type === "review" && view.name !== "Book Mode" && <span className="text-[10px] uppercase bg-blue-200/60 text-blue-800 px-1.5 py-0.5 rounded">SHOW</span>}
            </button>
          ))}
        </div>
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
            {documentBoundaries.map((boundary) => (
              <button
                key={boundary.id}
                onClick={() => setActiveBoundaryId(boundary.id)}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-left text-sm font-medium transition-colors ${activeBoundaryId === boundary.id ? 'bg-[#3d3122] text-white shadow-sm' : 'text-[#5e4b33] hover:bg-amber-50'}`}
              >
                <span className="truncate">{boundary.label}</span>
                <span className={`shrink-0 text-[10px] uppercase px-1.5 py-0.5 rounded ${activeBoundaryId === boundary.id ? 'bg-white/15 text-white' : 'bg-amber-200/50 text-amber-700'}`}>
                  {boundary.kind === "episode" ? "EP" : "CH"}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mb-8 opacity-50 hover:opacity-100 transition-opacity duration-300">
        <h3 className="text-xs font-bold text-[#8c6b4a] uppercase tracking-wider mb-3 flex items-center gap-1">
          <Filter size={12} />
          Ad-Hoc Tag Filters
        </h3>
        <p className="text-[10px] text-[#8c6b4a] mb-3 leading-tight">
          Temporarily narrow the living document without creating a second document.
        </p>
        <div className="flex flex-wrap gap-2">
          {AVAILABLE_TAGS.map(tag => (
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
  );
}
