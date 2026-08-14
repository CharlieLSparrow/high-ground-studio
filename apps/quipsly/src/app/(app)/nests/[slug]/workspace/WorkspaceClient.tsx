"use client";

import { useState } from "react";
import { HybridStream } from "@/components/workspace/HybridStream";
import { PanelsTopLeft, MessageSquare, LayoutDashboard, Settings } from "lucide-react";

type WorkspaceClientProps = {
  projectId: string;
  projectSlug: string;
  projectName: string;
  actorUserId: string;
};

export function WorkspaceClient({ projectId, projectSlug, projectName, actorUserId }: WorkspaceClientProps) {
  const [activeTab, setActiveTab] = useState<"stream" | "storyboard">("stream");

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
          <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3 shadow-sm">
            <h2 className="font-semibold text-gray-800">Studio & Media</h2>
            <div className="flex gap-2 text-sm text-gray-500">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500"></span> Media Connected</span>
            </div>
          </div>
          
          <div className="flex-1 overflow-auto p-6">
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {/* Stub for Media Bins / Storyboard */}
              <div className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center text-gray-500">
                <PanelsTopLeft className="mx-auto mb-2 h-8 w-8 text-gray-400" />
                <h3 className="font-medium text-gray-700">Storyboard (Coming Soon)</h3>
                <p className="mt-1 text-xs">Drag and drop verified media here.</p>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
