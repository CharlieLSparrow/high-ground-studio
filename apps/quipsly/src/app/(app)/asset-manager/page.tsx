"use client";

import { useState, useEffect } from "react";
import { fetchCloudAssets, CloudAsset } from "./actions";
import { fetchExternalAssets } from "./external";
import { runComfyWorkflow, ComfyWorkflow } from "@/lib/comfy/comfyClient";

const BUCKETS = ["Insta360_Raw", "Final_Renders", "Audio_Stems"];
const EXTERNAL_SOURCES = ["Google_Photos", "Google_Drive"];

export default function AssetManager() {
  const [activeBucket, setActiveBucket] = useState(BUCKETS[0]);
  const [activeSourceType, setActiveSourceType] = useState<"gcs" | "external">("gcs");
  const [assets, setAssets] = useState<CloudAsset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedAsset, setSelectedAsset] = useState<CloudAsset | null>(null);
  const [isProcessingAI, setIsProcessingAI] = useState(false);

  useEffect(() => {
    const loadAssets = async () => {
      setIsLoading(true);
      const data = activeSourceType === "gcs" 
        ? await fetchCloudAssets(activeBucket)
        : await fetchExternalAssets(activeBucket);
      setAssets(data);
      setIsLoading(false);
      setSelectedAsset(null);
    };
    loadAssets();
  }, [activeBucket, activeSourceType]);

  return (
    <div className="flex h-screen bg-zinc-950 text-white overflow-hidden">
      
      {/* Sidebar: Buckets */}
      <div className="w-64 bg-zinc-900 border-r border-zinc-800 flex flex-col">
        <div className="p-6 border-b border-zinc-800">
          <h1 className="text-xl font-bold text-blue-500">Cloud Assets</h1>
          <p className="text-xs text-zinc-400 mt-1">Google Cloud Storage</p>
        </div>
        <nav className="flex-1 overflow-y-auto p-4 space-y-6">
          
          <div>
            <div className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2 px-2">GCS Buckets</div>
            {BUCKETS.map(bucket => (
              <button
                key={bucket}
                onClick={() => { setActiveBucket(bucket); setActiveSourceType("gcs"); }}
                className={`w-full text-left px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeBucket === bucket && activeSourceType === "gcs" ? "bg-blue-600 text-white" : "text-zinc-300 hover:bg-zinc-800"
                }`}
              >
                {bucket.replace("_", " ")}
              </button>
            ))}
          </div>

          <div>
            <div className="text-xs font-bold text-emerald-500 uppercase tracking-wider mb-2 px-2">External Sources</div>
            {EXTERNAL_SOURCES.map(source => (
              <button
                key={source}
                onClick={() => { setActiveBucket(source); setActiveSourceType("external"); }}
                className={`w-full text-left px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeBucket === source && activeSourceType === "external" ? "bg-emerald-600 text-white" : "text-zinc-300 hover:bg-zinc-800"
                }`}
              >
                {source.replace("_", " ")}
              </button>
            ))}
          </div>

        </nav>
      </div>

      {/* Main Content: File Grid */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-zinc-800 flex items-center px-8 bg-zinc-950/50 backdrop-blur shrink-0">
          <h2 className="text-lg font-bold">{activeBucket.replace("_", " ")}</h2>
        </header>

        <main className="flex-1 overflow-y-auto p-8">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
          ) : assets.length === 0 ? (
            <div className="flex items-center justify-center h-full text-zinc-500 border-2 border-dashed border-zinc-800 rounded-xl">
              This bucket is empty.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {assets.map(asset => (
                <div 
                  key={asset.id}
                  onClick={() => setSelectedAsset(asset)}
                  className={`bg-zinc-900 border rounded-xl overflow-hidden cursor-pointer transition-all hover:scale-[1.02] hover:shadow-xl ${
                    selectedAsset?.id === asset.id ? "border-blue-500 ring-2 ring-blue-500/20" : "border-zinc-800"
                  }`}
                >
                  {/* Thumbnail Placeholder */}
                  <div className="h-32 bg-zinc-800 flex items-center justify-center relative">
                    {asset.metadata.spatial && (
                      <span className="absolute top-2 right-2 bg-blue-600 text-white text-[10px] font-bold px-2 py-1 rounded">360°</span>
                    )}
                    <svg className="w-10 h-10 text-zinc-700" fill="currentColor" viewBox="0 0 24 24"><path d="M4 6h16v12H4z" opacity=".2"/><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V6h16v12zM8 15l2.5-3.2 1.5 1.9 2.5-3.2L16 15H8z"/></svg>
                  </div>
                  <div className="p-4">
                    <h3 className="font-bold text-sm truncate" title={asset.name}>{asset.name}</h3>
                    <p className="text-xs text-zinc-500 mt-1">{asset.size} • {asset.uploadDate}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Right Sidebar: Metadata Pane */}
      {selectedAsset && (
        <div className="w-80 bg-zinc-900 border-l border-zinc-800 flex flex-col">
          <div className="p-6 border-b border-zinc-800 flex justify-between items-center">
            <h3 className="font-bold">File Details</h3>
            <button onClick={() => setSelectedAsset(null)} className="text-zinc-500 hover:text-white">&times;</button>
          </div>
          
          <div className="p-6 space-y-6 flex-1 overflow-y-auto">
            {/* Large Thumbnail */}
            <div className="w-full aspect-video bg-black rounded-lg border border-zinc-800 flex items-center justify-center relative">
              <svg className="w-12 h-12 text-zinc-800" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>
            </div>

            <div>
              <div className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Information</div>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between border-b border-zinc-800 pb-2">
                  <span className="text-zinc-400">Name</span>
                  <span className="truncate ml-4 max-w-[150px]" title={selectedAsset.name}>{selectedAsset.name}</span>
                </div>
                <div className="flex justify-between border-b border-zinc-800 pb-2">
                  <span className="text-zinc-400">Size</span>
                  <span>{selectedAsset.size}</span>
                </div>
                <div className="flex justify-between border-b border-zinc-800 pb-2">
                  <span className="text-zinc-400">Uploaded</span>
                  <span>{selectedAsset.uploadDate}</span>
                </div>
                <div className="flex justify-between border-b border-zinc-800 pb-2">
                  <span className="text-zinc-400">Duration</span>
                  <span>{selectedAsset.metadata.duration}</span>
                </div>
                {selectedAsset.metadata.resolution && (
                  <div className="flex justify-between border-b border-zinc-800 pb-2">
                    <span className="text-zinc-400">Resolution</span>
                    <span>{selectedAsset.metadata.resolution}</span>
                  </div>
                )}
                {selectedAsset.metadata.camera && (
                  <div className="flex justify-between border-b border-zinc-800 pb-2">
                    <span className="text-zinc-400">Camera</span>
                    <span>{selectedAsset.metadata.camera}</span>
                  </div>
                )}
              </div>
            </div>

            {selectedAsset.metadata.spatial && (
              <div className="bg-blue-900/20 border border-blue-900 rounded-lg p-4">
                <div className="flex items-center gap-2 text-blue-400 font-bold text-sm mb-1">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/></svg>
                  Spatial Video Detected
                </div>
                <p className="text-xs text-blue-300/70">This .insv file contains spherical metadata and gyro telemetry required for reframing.</p>
              </div>
            )}

            {/* ComfyUI AI Automations */}
            <div className="pt-4 border-t border-zinc-800">
              <div className="text-xs font-bold text-purple-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                <span>✨ {activeSourceType === "external" ? "Ingest & Run ComfyUI" : "ComfyUI Automations"}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={async () => {
                    setIsProcessingAI(true);
                    await runComfyWorkflow(selectedAsset.id, "upscale_4x");
                    setIsProcessingAI(false);
                  }}
                  disabled={isProcessingAI}
                  className={`bg-zinc-800 hover:bg-purple-900/50 hover:border-purple-500 border border-zinc-700 text-xs font-medium py-2 px-3 rounded transition-all disabled:opacity-50 ${activeSourceType === 'external' ? 'ring-1 ring-emerald-500/50' : ''}`}
                >
                  {isProcessingAI ? "Processing..." : "4x Upscale"}
                </button>
                <button 
                  onClick={async () => {
                    setIsProcessingAI(true);
                    await runComfyWorkflow(selectedAsset.id, "remove_background");
                    setIsProcessingAI(false);
                  }}
                  disabled={isProcessingAI}
                  className={`bg-zinc-800 hover:bg-purple-900/50 hover:border-purple-500 border border-zinc-700 text-xs font-medium py-2 px-3 rounded transition-all disabled:opacity-50 ${activeSourceType === 'external' ? 'ring-1 ring-emerald-500/50' : ''}`}
                >
                  {isProcessingAI ? "Processing..." : "Remove BG"}
                </button>
              </div>
              {activeSourceType === "external" && (
                <p className="text-[10px] text-zinc-500 mt-2 text-center">
                  Will pull from {activeBucket.replace("_", " ")} and upload the final render to GCS.
                </p>
              )}
            </div>

            <button className={`w-full text-white font-bold py-2 rounded transition-colors shadow-lg mt-4 ${
              activeSourceType === 'external' ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/20' : 'bg-blue-600 hover:bg-blue-500 shadow-blue-500/20'
            }`}>
              {activeSourceType === 'external' ? 'Ingest to GCS Bucket' : 'Download Proxy to Editor'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
