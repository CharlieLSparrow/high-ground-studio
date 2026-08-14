"use client";

import React, { useState } from "react";
import {
  Film,
  Grid,
  Layers,
  List,
  Maximize2,
  Move,
  Play,
  RotateCcw,
  Sliders,
  Tag,
  Video,
} from "lucide-react";

export type StoryCard = {
  id: string;
  driveFileId?: string;
  title: string;
  synopsis: string;
  notes: string;
  tags: string[];
  inTimeSeconds: number;
  outTimeSeconds: number;
  durationSeconds: number;
  cameraName: string;
  is360: boolean;
  reframeKeyframes?: Array<{
    time: number;
    pan: number;
    tilt: number;
    fov: number;
  }>;
  transcriptExcerpt?: string;
  status: "draft" | "selected" | "assembly" | "master";
};

const initialSampleCards: StoryCard[] = [
  {
    id: "card-001",
    driveFileId: "1A2B3C4D5E6F",
    title: "Opening 360 Horizon Sweep",
    synopsis: "Panoramic establishing view over the studio floor before rehearsal begins.",
    notes: "Use smooth pan keyframe interpolation across the first 12 seconds.",
    tags: ["establishing", "360-reframed", "scene-1"],
    inTimeSeconds: 0,
    outTimeSeconds: 24,
    durationSeconds: 24,
    cameraName: "Insta360 X4 (Cam A)",
    is360: true,
    reframeKeyframes: [
      { time: 0, pan: 0, tilt: 0, fov: 90 },
      { time: 12, pan: 180, tilt: -10, fov: 75 },
    ],
    transcriptExcerpt: "Welcome everyone to Episode 10 of the High Ground Odyssey session...",
    status: "selected",
  },
  {
    id: "card-002",
    driveFileId: "7G8H9I0J1K2L",
    title: "Host Keynote & Architecture Review",
    synopsis: "Direct address detailing the local-first media executor pipeline.",
    notes: "Keep original audio mix; sync verified with shared clock.",
    tags: ["keynote", "a-roll", "scene-2"],
    inTimeSeconds: 15,
    outTimeSeconds: 185,
    durationSeconds: 170,
    cameraName: "Sony FX3 (Cam B)",
    is360: false,
    transcriptExcerpt: "Drive remains our source of truth, while Quipsly Mac manages local execution...",
    status: "assembly",
  },
  {
    id: "card-003",
    driveFileId: "3M4N5O6P7Q8R",
    title: "Interactive 360 Audience Cutaway",
    synopsis: "Dynamic reframed reaction shot during live demonstration.",
    notes: "Reframing preset: Wide FOV (110deg) with slow tilt up.",
    tags: ["b-roll", "360-reframed", "reaction"],
    inTimeSeconds: 45,
    outTimeSeconds: 75,
    durationSeconds: 30,
    cameraName: "Insta360 X4 (Cam C)",
    is360: true,
    reframeKeyframes: [
      { time: 0, pan: -45, tilt: 15, fov: 110 },
      { time: 15, pan: 45, tilt: 0, fov: 95 },
    ],
    transcriptExcerpt: "Look at the real-time proxy generation updating in Nest...",
    status: "selected",
  },
];

export function StoryBinderView() {
  const [viewMode, setViewMode] = useState<"cards" | "library" | "outline">("cards");
  const [cards, setCards] = useState<StoryCard[]>(initialSampleCards);
  const [selectedCardId, setSelectedCardId] = useState<string | null>("card-001");
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const selectedCard = cards.find((c) => c.id === selectedCardId) || cards[0];

  const filteredCards = activeTag
    ? cards.filter((c) => c.tags.includes(activeTag))
    : cards;

  const allTags = Array.from(new Set(cards.flatMap((c) => c.tags)));

  return (
    <div className="flex h-full w-full flex-col bg-slate-950 text-slate-100 font-sans">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between border-b border-white/10 bg-slate-900/80 px-6 py-4 backdrop-blur-md">
        <div>
          <h2 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
            <Film className="h-5 w-5 text-sky-400" />
            Story Binder & Source Cards
          </h2>
          <p className="text-xs text-slate-400">
            Scrivener & StudioBinder style index cards for Drive & 360 media
          </p>
        </div>

        {/* View Switcher Controls */}
        <div className="flex items-center gap-2 rounded-xl bg-slate-800/80 p-1 border border-white/10">
          <button
            type="button"
            onClick={() => setViewMode("cards")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              viewMode === "cards"
                ? "bg-sky-500 text-white shadow-md shadow-sky-500/20"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Grid className="h-3.5 w-3.5" />
            Index Cards
          </button>
          <button
            type="button"
            onClick={() => setViewMode("library")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              viewMode === "library"
                ? "bg-sky-500 text-white shadow-md shadow-sky-500/20"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <List className="h-3.5 w-3.5" />
            Source Library
          </button>
          <button
            type="button"
            onClick={() => setViewMode("outline")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              viewMode === "outline"
                ? "bg-sky-500 text-white shadow-md shadow-sky-500/20"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            Story Beats
          </button>
        </div>
      </div>

      {/* Main Workspace Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left/Middle Content Area */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Tag Filter Pills */}
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-400">Filter by Tag:</span>
            <button
              type="button"
              onClick={() => setActiveTag(null)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                activeTag === null
                  ? "bg-white/20 text-white"
                  : "bg-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              All Cards ({cards.length})
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setActiveTag(tag === activeTag ? null : tag)}
                className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition ${
                  activeTag === tag
                    ? "bg-sky-500 text-white"
                    : "bg-slate-800 text-slate-400 hover:text-white"
                }`}
              >
                <Tag className="h-3 w-3" />
                {tag}
              </button>
            ))}
          </div>

          {/* Cards Grid View */}
          {viewMode === "cards" && (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {filteredCards.map((card) => (
                <div
                  key={card.id}
                  onClick={() => setSelectedCardId(card.id)}
                  className={`group relative flex cursor-pointer flex-col justify-between rounded-2xl border p-5 transition-all duration-200 ${
                    selectedCardId === card.id
                      ? "border-sky-400 bg-slate-900 shadow-xl shadow-sky-500/10 ring-1 ring-sky-400"
                      : "border-white/10 bg-slate-900/60 hover:border-white/20 hover:bg-slate-900/90"
                  }`}
                >
                  <div>
                    {/* Card Header & Badge */}
                    <div className="flex items-center justify-between mb-3">
                      <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-slate-400">
                        {card.cameraName}
                      </span>
                      {card.is360 && (
                        <span className="flex items-center gap-1 rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-bold text-indigo-300 border border-indigo-500/30">
                          <Maximize2 className="h-2.5 w-2.5" />
                          360 Reframed
                        </span>
                      )}
                    </div>

                    <h3 className="text-base font-bold text-white group-hover:text-sky-300">
                      {card.title}
                    </h3>
                    <p className="mt-2 text-xs leading-relaxed text-slate-300 line-clamp-3">
                      {card.synopsis}
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-white/5">
                    <p className="text-[11px] font-mono text-slate-400">
                      In: {card.inTimeSeconds}s · Out: {card.outTimeSeconds}s ({card.durationSeconds}s)
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {card.tags.map((t) => (
                        <span
                          key={t}
                          className="rounded bg-slate-800/80 px-1.5 py-0.5 text-[10px] text-slate-400"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Library List View */}
          {viewMode === "library" && (
            <div className="rounded-2xl border border-white/10 bg-slate-900/80 overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-800/60 text-slate-400 uppercase tracking-wider font-bold">
                  <tr>
                    <th className="px-4 py-3">Card Title</th>
                    <th className="px-4 py-3">Camera</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Duration</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredCards.map((card) => (
                    <tr
                      key={card.id}
                      onClick={() => setSelectedCardId(card.id)}
                      className={`cursor-pointer hover:bg-white/5 ${
                        selectedCardId === card.id ? "bg-sky-500/10 font-bold" : ""
                      }`}
                    >
                      <td className="px-4 py-3 text-white">{card.title}</td>
                      <td className="px-4 py-3 text-slate-400">{card.cameraName}</td>
                      <td className="px-4 py-3">
                        {card.is360 ? "Insta360 2:1" : "Standard 16:9"}
                      </td>
                      <td className="px-4 py-3 font-mono">{card.durationSeconds}s</td>
                      <td className="px-4 py-3">
                        <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                          {card.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Story Outline Beats View */}
          {viewMode === "outline" && (
            <div className="space-y-4">
              {filteredCards.map((card, idx) => (
                <div
                  key={card.id}
                  className="flex items-center gap-4 rounded-2xl border border-white/10 bg-slate-900/80 p-4"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-500/20 font-black text-sky-400">
                    {idx + 1}
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm font-bold text-white">{card.title}</h4>
                    <p className="text-xs text-slate-400">{card.synopsis}</p>
                  </div>
                  <span className="font-mono text-xs text-slate-400">{card.durationSeconds}s</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Detail & Reframing Inspector Panel */}
        {selectedCard && (
          <div className="w-80 border-l border-white/10 bg-slate-900/90 p-5 overflow-y-auto backdrop-blur-md">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="font-bold text-white text-sm">Card Inspector</h3>
              <span className="rounded bg-sky-500/20 px-2 py-0.5 text-[10px] font-bold text-sky-300">
                {selectedCard.id}
              </span>
            </div>

            <div className="mt-4 space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-400">Title</label>
                <p className="mt-1 font-semibold text-white">{selectedCard.title}</p>
              </div>

              <div>
                <label className="font-bold text-slate-400">Synopsis</label>
                <p className="mt-1 leading-relaxed text-slate-300">{selectedCard.synopsis}</p>
              </div>

              <div>
                <label className="font-bold text-slate-400">Notes</label>
                <p className="mt-1 leading-relaxed text-slate-300">{selectedCard.notes}</p>
              </div>

              {selectedCard.is360 && (
                <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-3">
                  <div className="flex items-center gap-1.5 font-bold text-indigo-300 mb-2">
                    <Sliders className="h-4 w-4" />
                    360 Reframe Keyframes
                  </div>
                  {selectedCard.reframeKeyframes?.map((kf, i) => (
                    <div key={i} className="mt-1 text-[11px] font-mono text-indigo-200">
                      t={kf.time}s: Pan {kf.pan}°, Tilt {kf.tilt}°, FOV {kf.fov}°
                    </div>
                  ))}
                </div>
              )}

              {selectedCard.transcriptExcerpt && (
                <div>
                  <label className="font-bold text-slate-400">Transcript Excerpt</label>
                  <p className="mt-1 rounded-lg bg-slate-950 p-2.5 italic text-slate-300">
                    "{selectedCard.transcriptExcerpt}"
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
