"use client";

import React, { useState } from "react";
import { PlatformPreviewer } from "./PlatformPreviewer";
import { AssetManager } from "../assets/AssetManager";

export function ComposerClient({ isEmbedded = false }: { isEmbedded?: boolean }) {
  const [globalContent, setGlobalContent] = useState("");
  const [activeTab, setActiveTab] = useState<"global" | "x_twitter" | "youtube_v3" | "patreon_v2">("global");
  const [platformOverrides, setPlatformOverrides] = useState<Record<string, string>>({});
  const [selectedAssets, setSelectedAssets] = useState<string[]>([]);
  const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);
  const [userRole, setUserRole] = useState<"admin" | "editor">("admin");
  const [scheduledAt, setScheduledAt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const activeContent = activeTab === "global" 
    ? globalContent 
    : (platformOverrides[activeTab] ?? globalContent);

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    if (activeTab === "global") {
      setGlobalContent(val);
    } else {
      setPlatformOverrides(prev => ({ ...prev, [activeTab]: val }));
    }
  };

  const handleSchedule = async () => {
    setIsSubmitting(true);
    try {
      // In a real app, this would dispatch a server action to `enqueuePublishJobs`
      // with the populated `scheduledAt` date.
      console.log("Scheduling Payload:", {
        globalContent,
        platformOverrides,
        assets: selectedAssets,
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      });
      await new Promise(r => setTimeout(r, 1000));
      alert("Posts scheduled successfully!");
    } catch (e) {
      alert("Failed to schedule.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const tabs = [
    { id: "global", label: "Global" },
    { id: "x_twitter", label: "X / Twitter" },
    { id: "youtube_v3", label: "YouTube" },
    { id: "patreon_v2", label: "Patreon" },
  ] as const;

  return (
    <div className={`flex w-full overflow-hidden bg-gray-50 ${isEmbedded ? "h-full" : "h-[calc(100vh-64px)]"}`}>
      {/* Left Pane: Composer */}
      <div className="flex-1 flex flex-col border-r border-gray-200 bg-white">
        
        {/* User Role Toggle (For Demo Purposes) */}
        <div className="px-6 py-2 bg-yellow-50 border-b border-yellow-100 flex items-center justify-between">
          <span className="text-xs font-semibold text-yellow-800">Demo Role:</span>
          <select 
            className="text-xs border-none bg-transparent font-bold text-yellow-900 focus:ring-0 cursor-pointer"
            value={userRole}
            onChange={(e) => setUserRole(e.target.value as "admin" | "editor")}
          >
            <option value="admin">Admin (Can Schedule)</option>
            <option value="editor">Editor (Requires Approval)</option>
          </select>
        </div>

        {/* Action Bar */}
        <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-between items-center shrink-0">
          <h2 className="text-lg font-bold text-gray-900">Composer</h2>
          <div className="flex items-center space-x-2">
            <input 
              type="datetime-local" 
              className="px-3 py-1.5 border border-gray-300 rounded-md text-sm text-gray-700"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
            <button 
            onClick={handleSchedule}
            disabled={isSubmitting || !globalContent}
            className={`px-6 py-2 rounded-md text-sm font-semibold text-white transition-colors flex items-center space-x-2 ${
              isSubmitting || !globalContent ? "bg-blue-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {isSubmitting ? (
              <span>Processing...</span>
            ) : (
              <span>{userRole === "editor" ? "Submit for Review" : scheduledAt ? "Schedule Post" : "Publish Now"}</span>
            )}
          </button>
          </div>
        </div>

        {/* Tab Bar */}
        <div className="flex border-b border-gray-200 px-4 bg-gray-50 space-x-4">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-3 px-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id 
                  ? "border-blue-600 text-blue-600" 
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {tab.label}
              {tab.id !== "global" && platformOverrides[tab.id] !== undefined && (
                <span className="ml-1.5 inline-flex items-center justify-center w-2 h-2 rounded-full bg-blue-500" title="Customized" />
              )}
            </button>
          ))}
        </div>

        {/* Editor Area */}
        <div className="flex-1 p-6 flex flex-col bg-white">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {activeTab === "global" ? "Write for all channels..." : `Customize for ${tabs.find(t => t.id === activeTab)?.label}...`}
          </label>
          <textarea
            value={activeContent}
            onChange={handleContentChange}
            className="flex-1 w-full p-4 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none text-gray-900 shadow-inner"
            placeholder="What do you want to share?"
          />
          
          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <button 
                onClick={() => setIsAssetModalOpen(true)}
                className="text-gray-500 hover:text-blue-600 p-2 rounded-md hover:bg-blue-50 transition-colors flex items-center space-x-1"
                title="Add Asset"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                </svg>
                <span className="text-sm font-medium">Add Media</span>
              </button>
            </div>
            
            {activeTab === "x_twitter" && (
              <span className={`text-xs font-semibold ${activeContent.length > 280 ? 'text-red-500' : 'text-gray-500'}`}>
                {activeContent.length} / 280
              </span>
            )}
          </div>

          {/* Asset Previews in Composer */}
          {selectedAssets.length > 0 && (
            <div className="mt-4 flex gap-2 overflow-x-auto py-2">
              {selectedAssets.map((url, i) => (
                <div key={i} className="relative group shrink-0 w-24 h-24 rounded-lg overflow-hidden border border-gray-200">
                  <img src={url} alt="Attached" className="w-full h-full object-cover" />
                  <button 
                    onClick={() => setSelectedAssets(prev => prev.filter((_, idx) => idx !== i))}
                    className="absolute top-1 right-1 bg-black/50 hover:bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right Pane: Live Preview */}
      <div className={`p-6 bg-gray-100 overflow-y-auto flex flex-col items-center border-l border-gray-200 ${isEmbedded ? "w-1/3" : "w-[450px]"}`}>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-6 w-full text-left">Live Preview</h3>
        <PlatformPreviewer 
          platform={activeTab} 
          content={activeContent}
          mediaUrls={selectedAssets}
        />
      </div>

      {/* Asset Manager Modal */}
      {isAssetModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-xl max-w-4xl w-full flex flex-col overflow-hidden relative shadow-2xl">
            <button 
              onClick={() => setIsAssetModalOpen(false)}
              className="absolute top-4 right-4 z-10 bg-white/80 rounded-full p-2 hover:bg-gray-100"
            >
              ✕
            </button>
            <AssetManager 
              isModal={true} 
              onSelectAsset={(url) => {
                setSelectedAssets(prev => [...prev, url]);
                setIsAssetModalOpen(false);
              }} 
            />
          </div>
        </div>
      )}

    </div>
  );
}
