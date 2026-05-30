"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Player } from "@remotion/player";
import { submitRenderJob } from "../render-queue/actions";
import { VisualTimeline } from "./VisualTimeline";
import { useTimelineState } from "./useTimelineState";
import { RemotionComposition } from "./RemotionComposition";

// Mock Media Pool Assets
const MOCK_ASSETS = [
  {
    id: "v1",
    type: "video",
    name: "A-Roll_Take_1.mp4",
    duration: "10.5s",
    thumbnail:
      "https://storage.googleapis.com/gtv-videos-bucket/sample/images/ForBiggerBlazes.jpg",
  },
  {
    id: "v2",
    type: "video",
    name: "B-Roll_City.mp4",
    duration: "5.2s",
    thumbnail:
      "https://storage.googleapis.com/gtv-videos-bucket/sample/images/ForBiggerEscapes.jpg",
  },
];

const INITIAL_STATE = {
  clips: [
    { id: "t1", assetId: "v1", startIn: 0, duration: 10.5, sourceStart: 0, name: "A-Roll_Take_1", color: "#2563eb" },
    { id: "t2", assetId: "v2", startIn: 10.5, duration: 5.2, sourceStart: 0, name: "B-Roll_City", color: "#059669" },
  ],
  transcript: [
    { id: "p1", time: 0, duration: 5, text: "Welcome back to the podcast. Today we are talking about the AI revolution.", deleted: false, alert: null },
    { id: "p2", time: 5, duration: 7, text: "And honestly, it's pretty crazy. I don't know what to think about it.", deleted: false, alert: "Retention Drop Detected" },
    { id: "p3", time: 12, duration: 3.7, text: "Let's dive right into the code and see how we can build an autonomous studio.", deleted: false, alert: null },
  ]
};

export default function CloudEditor() {
  const [currentTime, setCurrentTime] = useState(0);
  const [viewMode, setViewMode] = useState<"timeline" | "transcript" | "reframe">("timeline");
  const [isExporting, setIsExporting] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId");

  // The new NLE timeline reducer
  const { state: timelineState, toggleDeleteBlock } = useTimelineState(INITIAL_STATE);

  const handleExportToQueue = async () => {
    setIsExporting(true);
    await submitRenderJob("The AI Revolution (Final Cut)", timelineState);
    setIsExporting(false);
    router.push("/render-queue");
  };

  // Calculate total duration in frames (30fps)
  const totalDuration = timelineState.clips.reduce((acc, clip) => Math.max(acc, clip.startIn + clip.duration), 1);
  const durationInFrames = Math.max(1, Math.round(totalDuration * 30));

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-white overflow-hidden">
      <header className="flex justify-between items-center p-4 bg-zinc-900 border-b border-zinc-800">
        <h1 className="text-xl font-black uppercase tracking-widest text-emerald-500">
          NLE // Editor {projectId && <span className="text-zinc-500 text-sm ml-2">Project: {projectId}</span>}
        </h1>
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode("timeline")}
            className={`px-4 py-1.5 text-xs font-bold rounded ${viewMode === 'timeline' ? 'bg-zinc-700' : 'bg-zinc-800 hover:bg-zinc-700'}`}
          >
            TIMELINE
          </button>
          <button
            onClick={() => setViewMode("transcript")}
            className={`px-4 py-1.5 text-xs font-bold rounded ${viewMode === 'transcript' ? 'bg-zinc-700' : 'bg-zinc-800 hover:bg-zinc-700'}`}
          >
            TRANSCRIPT
          </button>
          <button
            onClick={() => setViewMode("reframe")}
            className={`px-4 py-1.5 text-xs font-bold rounded ${viewMode === 'reframe' ? 'bg-zinc-700' : 'bg-zinc-800 hover:bg-zinc-700'}`}
          >
            REMOTION PLAYER
          </button>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExportToQueue}
            disabled={isExporting}
            className="px-4 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 rounded transition-colors disabled:opacity-50"
          >
            {isExporting ? "Sending..." : "Export to Queue"}
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Media Pool Panel */}
        <aside className="w-64 bg-zinc-900 border-r border-zinc-800 p-4 flex flex-col gap-2 overflow-y-auto">
          <h2 className="text-xs font-bold text-zinc-500 uppercase mb-2">
            Media Pool
          </h2>
          {projectId && (
            <div className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-1 rounded text-xs font-bold mb-2">
               Scoped to tags: {projectId}
            </div>
          )}
          {MOCK_ASSETS.map((asset) => (
            <div key={asset.id} className="bg-zinc-800 p-2 rounded border border-zinc-700 text-sm flex justify-between">
              <span className="truncate pr-2">{asset.name}</span>
              <span className="text-zinc-500 text-xs">{asset.duration}</span>
            </div>
          ))}
        </aside>

        {/* Main Editor Area */}
        <main className="flex-1 flex flex-col relative overflow-hidden bg-zinc-950 p-8">
          
          <div className="w-full flex justify-center mb-8">
             <div className="w-full max-w-2xl bg-black rounded-lg border-2 border-zinc-800 overflow-hidden shadow-2xl">
                {/* REMOTION PLAYER INTEGRATION */}
                <Player
                  component={RemotionComposition}
                  inputProps={{ timeline: timelineState }}
                  durationInFrames={durationInFrames}
                  compositionWidth={1920}
                  compositionHeight={1080}
                  fps={30}
                  style={{ width: "100%", aspectRatio: "16/9" }}
                  controls
                />
             </div>
          </div>

          {viewMode === "transcript" && (
            <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden flex flex-col">
              <div className="p-4 bg-zinc-800 border-b border-zinc-700">
                <h2 className="font-bold text-lg">Paper Edit</h2>
                <p className="text-xs text-zinc-400">
                  Select text to delete. Deleting text automatically slices the clips and ripples the timeline left!
                </p>
              </div>
              <div className="p-8 overflow-y-auto flex-1 space-y-6 text-xl leading-loose font-serif">
                {timelineState.transcript.map((block) => (
                  <span
                    key={block.id}
                    onClick={() => toggleDeleteBlock(block.id)}
                    className={`
                      inline-block mr-2 px-1 cursor-pointer transition-all rounded relative
                      ${block.deleted ? 'line-through text-zinc-600 decoration-red-500/50 decoration-2' : 'text-zinc-200 hover:bg-zinc-800'}
                    `}
                  >
                    {block.alert && !block.deleted && (
                      <span className="absolute -top-6 left-0 bg-red-600 text-white text-[10px] font-sans font-bold px-2 py-0.5 rounded shadow-lg whitespace-nowrap z-10">
                        {block.alert}
                      </span>
                    )}
                    {block.text}
                  </span>
                ))}
              </div>
            </div>
          )}

          {viewMode === "timeline" && (
            <div className="w-full flex-1 flex flex-col justify-end mt-auto border border-zinc-800 bg-zinc-900 rounded-xl overflow-hidden shadow-2xl p-4">
              <h2 className="text-xs font-bold text-zinc-500 uppercase mb-4">EDL Visualizer</h2>
              <VisualTimeline
                clips={timelineState.clips.map((c) => ({
                  id: c.id,
                  type: "video" as const,
                  src: "",
                  startIn: c.startIn,
                  duration: c.duration,
                  track: 1,
                  label: c.name,
                  color: c.color,
                }))}
                currentTime={currentTime}
                onTimeScrub={setCurrentTime}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
