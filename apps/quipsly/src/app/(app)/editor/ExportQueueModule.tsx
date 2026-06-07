"use client";

import { useState } from "react";
import { CloudRain, CheckCircle2, Server, PlayCircle, Loader2, ArrowRight } from "lucide-react";
import Link from "next/link";

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

export function ExportQueueModule({ isOpen, onClose, timelineDurationSeconds, totalClips, projectSlug, episodeSlug, timelineState }: ExportQueueProps) {
  const [exportState, setExportState] = useState<"idle" | "packaging" | "rendering" | "done">("idle");
  const [progress, setProgress] = useState(0);

  if (!isOpen) return null;

  const handleStartExport = async () => {
    setExportState("packaging");
    setProgress(20);

    try {
      const res = await fetch("/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timelineState, projectSlug, episodeSlug })
      });

      setProgress(60);

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Render failed");
      }

      setExportState("rendering");
      setProgress(100);

      // Since it's a simulated or async lambda processing queue, we show done after a brief moment
      setTimeout(() => setExportState("done"), 1000);

    } catch (e) {
      console.error(e);
      alert("Failed to start cloud render pipeline.");
      setExportState("idle");
      setProgress(0);
    }
  };

  const minutes = Math.floor(timelineDurationSeconds / 60);
  const seconds = Math.floor(timelineDurationSeconds % 60);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white border border-[#e8dcc4] rounded-3xl p-8 w-full max-w-xl shadow-2xl relative overflow-hidden">

        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-800 font-bold text-xl leading-none">&times;</button>

        {exportState === "idle" && (
          <div className="flex flex-col items-center text-center">
            <div className="w-20 h-20 bg-amber-50 rounded-2xl flex items-center justify-center mb-6">
              <CloudRain className="w-10 h-10 text-amber-600" />
            </div>
            <h2 className="text-3xl font-black text-[#3d3122] mb-2">Prepare Render Package</h2>
            <p className="text-[#8c6b4a] mb-8 max-w-sm">
              Quipsly will package the timeline and source references so the real render worker can pick it up. This beta control does not publish or overwrite anything.
            </p>

            <div className="w-full bg-[#fdfaf6] border border-[#e8dcc4] rounded-xl p-4 mb-8 text-left grid grid-cols-2 gap-4">
              <div>
                <div className="text-[10px] font-bold text-[#8c6b4a] uppercase tracking-wider">Duration</div>
                <div className="text-lg font-black text-[#3d3122]">{minutes}:{seconds.toString().padStart(2, '0')}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-[#8c6b4a] uppercase tracking-wider">Total Clips</div>
                <div className="text-lg font-black text-[#3d3122]">{totalClips}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-[#8c6b4a] uppercase tracking-wider">Output Specs</div>
                <div className="text-sm font-bold text-[#3d3122]">1080p • 30fps • MP4</div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-[#8c6b4a] uppercase tracking-wider">Est. Render Time</div>
                <div className="text-sm font-bold text-[#3d3122]">Worker-gated</div>
              </div>
            </div>

            <button
              onClick={handleStartExport}
              className="w-full py-4 bg-amber-600 hover:bg-amber-700 text-white font-black rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2 text-lg"
            >
              <Server className="w-5 h-5" />
              Stage Render Package
            </button>
          </div>
        )}

        {(exportState === "packaging" || exportState === "rendering") && (
          <div className="flex flex-col items-center text-center py-8">
            <Loader2 className="w-16 h-16 text-amber-600 animate-spin mb-6" />
            <h2 className="text-2xl font-black text-[#3d3122] mb-2">
              {exportState === "packaging" ? "Packaging Assets..." : "Checking Render Readiness..."}
            </h2>
            <p className="text-[#8c6b4a] mb-8 max-w-sm">
              {exportState === "packaging"
                ? "Bundling timeline state and preparing asset references."
                : "Confirming the package has enough information for the render worker. Final MP4 rendering is still worker-gated."}
            </p>

            <div className="w-full bg-gray-100 rounded-full h-3 mb-2 overflow-hidden">
              <div className="bg-amber-600 h-3 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
            </div>
            <div className="text-sm font-bold text-amber-600">{progress}%</div>
          </div>
        )}

        {exportState === "done" && (
          <div className="flex flex-col items-center text-center py-4">
            <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mb-6">
              <CheckCircle2 className="w-12 h-12 text-green-500" />
            </div>
            <h2 className="text-3xl font-black text-[#3d3122] mb-2">Render Package Ready</h2>
            <p className="text-[#8c6b4a] mb-8 max-w-sm">
              Your timeline package is staged for the render worker. The final MP4 is not created until the render service confirms it.
            </p>

            <div className="flex flex-col gap-3 w-full">
              <button
                className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-[#3d3122] font-black rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <PlayCircle className="w-5 h-5" />
                Preview Timeline
              </button>
              <Link
                href={`/publishing-suite/youtube?project=${projectSlug}`}
                className="w-full py-4 bg-red-600 hover:bg-red-700 text-white font-black rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2 text-lg"
              >
                Proceed to YouTube Draft Desk <ArrowRight className="w-5 h-5" />
              </Link>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
