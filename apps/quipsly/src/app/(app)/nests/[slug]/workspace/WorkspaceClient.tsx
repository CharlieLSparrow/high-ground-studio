"use client";

import { useState } from "react";
import { HybridStream } from "@/components/workspace/HybridStream";
import { PanelsTopLeft, MessageSquare, LayoutDashboard, Settings } from "lucide-react";
import { AssetBin } from "@/components/media/AssetBin";
import { DndContext, DragOverlay, DragStartEvent, DragEndEvent } from "@dnd-kit/core";
import { NLETimeline } from "@/components/nle/NLETimeline";
import { useTimelineStore } from "@/components/nle/useTimelineStore";
import { AssetItem } from "@/components/media/asset-types";

type WorkspaceClientProps = {
  projectId: string;
  projectSlug: string;
  projectName: string;
  actorUserId: string;
};

export function WorkspaceClient({ projectId, projectSlug, projectName, actorUserId }: WorkspaceClientProps) {
  const [activeTab, setActiveTab] = useState<"stream" | "storyboard">("stream");
  const [activeDragAsset, setActiveDragAsset] = useState<AssetItem | null>(null);
  const addClip = useTimelineStore((state) => state.addClip);

  const handleDragStart = (e: DragStartEvent) => {
    if (e.active.data.current?.type === "Asset") {
      setActiveDragAsset(e.active.data.current.asset as AssetItem);
    }
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveDragAsset(null);
    const { active, over } = e;
    
    if (over && over.data.current?.type === "Track" && active.data.current?.type === "Asset") {
      const trackId = over.data.current.trackId;
      const asset = active.data.current.asset as AssetItem;
      
      addClip({
        id: `clip-${Date.now()}`,
        trackId,
        name: asset.name,
        startFrame: useTimelineStore.getState().playheadFrame,
        durationFrames: 120, // Default duration
        color: 'bg-amber-600',
      });
    }
  };

  return (
    <div className="flex h-full w-full">
      {/* Sidebar Navigation */}
      <div className="flex w-16 flex-col items-center gap-4 border-r border-[#e3d4b9] bg-[#fffaf0] py-4">
        <button 
          onClick={() => setActiveTab("stream")}
          className={`flex h-10 w-10 items-center justify-center rounded-xl transition ${activeTab === "stream" ? "bg-amber-100 text-amber-900" : "text-[#765f40] hover:bg-amber-50"}`}
          title="Stream & Chat"
        >
          <MessageSquare size={20} />
        </button>
        <button 
          onClick={() => setActiveTab("storyboard")}
          className={`flex h-10 w-10 items-center justify-center rounded-xl transition ${activeTab === "storyboard" ? "bg-amber-100 text-amber-900" : "text-[#765f40] hover:bg-amber-50"}`}
          title="Storyboard"
        >
          <LayoutDashboard size={20} />
        </button>
        
        <div className="flex-1" />
        
        <button 
          className="flex h-10 w-10 items-center justify-center rounded-xl text-[#765f40] transition hover:bg-amber-50"
          title="Settings"
        >
          <Settings size={20} />
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden md:flex-row">
        
        {/* Stream Panel (Left) */}
        <div className={`flex h-full flex-col border-r border-[#e3d4b9] bg-white transition-all ${activeTab === "stream" ? "w-full md:w-1/2 lg:w-[400px]" : "hidden md:flex md:w-[350px]"}`}>
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <h2 className="font-semibold text-[#3d3122]">Capture & Collaboration</h2>
          </div>
          <div className="flex-1 overflow-hidden">
            <HybridStream 
              projectId={projectId} 
              actorUserId={actorUserId} 
            />
          </div>
        </div>

        {/* Studio Panel (Right) */}
        <div className={`flex flex-1 flex-col bg-slate-50 ${activeTab === "storyboard" ? "flex" : "hidden md:flex"}`}>
          <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="flex flex-1 overflow-hidden">
              
              {/* Asset Bin Sidebar */}
              <div className="flex flex-col border-r border-slate-200 w-80 flex-shrink-0 bg-white shadow-sm z-10 transition-all duration-300">
                <div className="flex items-center justify-between border-b border-slate-100 bg-white px-4 py-3">
                  <h2 className="font-semibold text-slate-800 text-sm">Asset Bin</h2>
                  <div className="flex gap-2 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500"></span> Connected</span>
                  </div>
                </div>
                
                <div className="flex-1 overflow-auto">
                  <AssetBin />
                </div>
              </div>
              
              {/* NLE Timeline */}
              <div className="flex-1 flex flex-col min-w-0">
                <NLETimeline projectId={projectId} />
              </div>
            </div>

            <DragOverlay dropAnimation={{
              duration: 200,
              easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)',
            }}>
              {activeDragAsset ? (
                <div className="p-3 bg-white border-2 border-blue-500 rounded-xl shadow-2xl opacity-100 scale-105 rotate-2 pointer-events-none flex items-center gap-3 w-64">
                  <div className="w-10 h-10 bg-slate-100 rounded flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-bold text-slate-900 truncate">{activeDragAsset.name}</h4>
                    <p className="text-xs text-slate-500 truncate uppercase tracking-widest">{activeDragAsset.type}</p>
                  </div>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>

      </div>
    </div>
  );
}
