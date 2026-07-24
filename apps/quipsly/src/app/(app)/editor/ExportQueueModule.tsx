"use client";

import { CircleOff, MonitorPlay, X } from "lucide-react";

import type { TimelineState } from "./useTimelineState";

export type ExportQueueProps = {
  isOpen: boolean;
  onClose: () => void;
  timelineDurationSeconds: number;
  totalClips: number;
  projectSlug: string;
  episodeSlug: string;
  timelineState: TimelineState;
};

export function ExportQueueModule({
  isOpen,
  onClose,
  timelineDurationSeconds,
  totalClips,
  projectSlug,
  episodeSlug,
  timelineState,
}: ExportQueueProps) {
  if (!isOpen) return null;
  void timelineState;

  const minutes = Math.floor(timelineDurationSeconds / 60);
  const seconds = Math.floor(timelineDurationSeconds % 60);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <section role="dialog" aria-modal="true" aria-labelledby="render-boundary-title" className="relative w-full max-w-xl rounded-3xl border border-[#e8dcc4] bg-white p-8 text-[#3d3122] shadow-2xl">
        <button onClick={onClose} aria-label="Close render readiness" className="absolute right-4 top-4 rounded-lg p-2 text-[#8c6b4a] hover:bg-[#f8f3e6]">
          <X size={18} />
        </button>

        <CircleOff className="h-12 w-12 text-amber-600" />
        <p className="mt-5 text-[10px] font-black uppercase tracking-[0.2em] text-amber-700">No job queued</p>
        <h2 id="render-boundary-title" className="mt-2 text-3xl font-black">Web rendering is not connected yet</h2>
        <p className="mt-3 text-sm leading-6 text-[#7a674c]">
          Quipsly will not pretend this timeline was packaged or rendered. A real handoff needs an actor-scoped worker, a source manifest, durable progress, and an output receipt.
        </p>

        <dl className="mt-6 grid grid-cols-2 gap-3 rounded-2xl border border-[#e8dcc4] bg-[#fdfaf6] p-4 text-sm">
          <div><dt className="text-[10px] font-black uppercase tracking-wider text-[#8c6b4a]">Timeline</dt><dd className="mt-1 font-black">{minutes}:{seconds.toString().padStart(2, "0")} · {totalClips} clips</dd></div>
          <div><dt className="text-[10px] font-black uppercase tracking-wider text-[#8c6b4a]">Context</dt><dd className="mt-1 break-words font-black">{projectSlug} / {episodeSlug}</dd></div>
        </dl>

        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <MonitorPlay className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          <p className="text-sm leading-6 text-[#6f5a3d]">
            Save the web timeline, then open Quipsly Studio on the production Mac for source-aware playback and rendering. No external destination is contacted from here.
          </p>
        </div>

        <button onClick={onClose} className="mt-7 w-full rounded-xl bg-[#3d3122] py-3 text-sm font-black text-white hover:bg-[#2c2419]">
          Keep editing
        </button>
      </section>
    </div>
  );
}
