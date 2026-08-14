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
        <div className={`flex flex-1 flex-col bg-gray-50 ${activeTab === "storyboard" ? "flex" : "hidden md:flex"}`}>
          <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="flex h-1/2 flex-col border-b border-gray-200">
              <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3 shadow-sm">
                <h2 className="font-semibold text-gray-800">Studio & Media</h2>
                <div className="flex gap-2 text-sm text-gray-500">
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500"></span> Media Connected</span>
                </div>
              </div>
              
              <div className="flex-1 overflow-auto">
                <AssetBin />
              </div>
            </div>
            
            <div className="flex h-1/2 flex-col">
              <NLETimeline projectId={projectId} />
            </div>

            <DragOverlay>
              {activeDragAsset ? (
                <div className="p-3 bg-white border border-blue-400 rounded-xl shadow-2xl opacity-90 scale-105 pointer-events-none">
                  <span className="text-xs font-semibold text-gray-900">{activeDragAsset.name}</span>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>

      </div>
    </div>
  );
}
