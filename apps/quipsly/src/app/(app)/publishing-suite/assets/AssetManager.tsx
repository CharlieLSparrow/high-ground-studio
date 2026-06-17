"use client";

import React, { useState, useEffect, useRef } from "react";
import { fetchStudioAssets } from "../../../../lib/publishing/assetActions";



interface AssetManagerProps {
  onSelectAsset?: (url: string) => void;
  isModal?: boolean;
}

export function AssetManager({ onSelectAsset, isModal = false }: AssetManagerProps) {
  const [assets, setAssets] = useState<any[]>([]);
  const [filter, setFilter] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadAssets = async () => {
    try {
      const data = await fetchStudioAssets();
      setAssets(data);
    } catch (e) {
      console.error("Failed to load assets", e);
    }
  };

  useEffect(() => {
    loadAssets();
  }, []);

  const filteredAssets = assets.filter(a => {
    const filenameMatch = a.filename.toLowerCase().includes(filter.toLowerCase());
    const tagsMatch = Array.isArray(a.tagsJson) ? a.tagsJson.some((t: string) => t.toLowerCase().includes(filter.toLowerCase())) : false;
    return filenameMatch || tagsMatch;
  });

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/assets/upload", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        await loadAssets(); // Refresh list
      } else {
        alert("Upload failed");
      }
    } catch (error) {
      console.error(error);
      alert("Upload failed");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className={`flex flex-col bg-white ${isModal ? "h-[500px]" : "h-full min-h-[500px]"} w-full rounded-xl overflow-hidden shadow-sm border border-gray-200`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50 shrink-0">
        <h2 className="text-lg font-bold text-gray-900">Asset Library</h2>
        <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} accept="image/*,video/*" />
        <button 
          onClick={handleUploadClick}
          disabled={isUploading}
          className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {isUploading ? "Uploading..." : "Upload Asset"}
        </button>
      </div>

      {/* Toolbar */}
      <div className="p-4 border-b border-gray-100 flex items-center space-x-4 shrink-0">
        <input 
          type="text" 
          placeholder="Search by name or tag..." 
          className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <select className="px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-700">
          <option>All Types</option>
          <option>Images</option>
          <option>Videos</option>
        </select>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredAssets.map(asset => (
            <div 
              key={asset.id} 
              className="group relative bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => onSelectAsset?.(asset.url)}
            >
              <div className="aspect-square bg-gray-100 flex items-center justify-center p-4">
                <img src={asset.url} alt={asset.filename} className="max-w-full max-h-full object-contain mix-blend-multiply" />
              </div>
              <div className="p-3 border-t border-gray-100">
                <div className="text-sm font-semibold text-gray-900 truncate">{asset.filename}</div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {Array.isArray(asset.tagsJson) && asset.tagsJson.map((t: string) => (
                    <span key={t} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{t}</span>
                  ))}
                </div>
              </div>
              
              {/* Hover Overlay */}
              {onSelectAsset && (
                <div className="absolute inset-0 bg-blue-600/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[1px]">
                  <span className="bg-white text-blue-600 font-bold px-3 py-1.5 rounded-full shadow-sm text-sm transform scale-95 group-hover:scale-100 transition-transform">
                    Select
                  </span>
                </div>
              )}
            </div>
          ))}
          {filteredAssets.length === 0 && (
            <div className="col-span-full py-12 text-center text-gray-500">
              No assets found matching "{filter}"
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
