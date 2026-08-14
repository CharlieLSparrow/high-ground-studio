"use client";

import { useState } from "react";
import { AssetBinNav } from "./AssetBinNav";
import { AssetBinGrid } from "./AssetBinGrid";
import { AssetBinList } from "./AssetBinList";
import { MOCK_ASSETS, MOCK_FOLDERS, ViewMode } from "./asset-types";

export function AssetBin() {
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [currentFolderId, setCurrentFolderId] = useState<string>("root");
  const [searchQuery, setSearchQuery] = useState("");

  const currentFolder = MOCK_FOLDERS.find((f) => f.id === currentFolderId);
  
  // In a real app, this would filter by folder. For mock, just return all if root, or subset.
  const displayedAssets = MOCK_ASSETS.filter(a => 
    a.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  const childFolders = MOCK_FOLDERS.filter(f => f.parentId === currentFolderId);

  return (
    <div className="flex h-full flex-col bg-white">
      <AssetBinNav 
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        currentFolder={currentFolder}
        onNavigateUp={() => setCurrentFolderId(currentFolder?.parentId || "root")}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />
      
      <div className="flex-1 overflow-y-auto p-6">
        {viewMode === "grid" ? (
          <AssetBinGrid 
            assets={displayedAssets} 
            folders={childFolders}
            onFolderClick={setCurrentFolderId}
          />
        ) : (
          <AssetBinList 
            assets={displayedAssets} 
            folders={childFolders}
            onFolderClick={setCurrentFolderId}
          />
        )}
      </div>
    </div>
  );
}
