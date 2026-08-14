"use client";

import { LayoutGrid, List, ChevronRight, UploadCloud, Search, FolderUp } from "lucide-react";
import { FolderItem, ViewMode } from "./asset-types";
import { cn } from "@/app/(app)/studio-ui";

type AssetBinNavProps = {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  currentFolder?: FolderItem;
  onNavigateUp: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
};

export function AssetBinNav({
  viewMode,
  onViewModeChange,
  currentFolder,
  onNavigateUp,
  searchQuery,
  onSearchChange,
}: AssetBinNavProps) {
  return (
    <div className="flex flex-col gap-4 border-b border-gray-200 bg-white px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {currentFolder?.parentId && (
            <button 
              onClick={onNavigateUp}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition"
              title="Up one level"
            >
              <FolderUp size={18} />
            </button>
          )}
          <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-800">
            <span className="text-gray-400">Media Bins</span>
            <ChevronRight size={14} className="text-gray-300" />
            <span className="text-gray-900">{currentFolder?.name || "All Media"}</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center rounded-lg bg-gray-100 p-1">
            <button
              onClick={() => onViewModeChange("grid")}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-md transition",
                viewMode === "grid" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              )}
              title="Grid View"
            >
              <LayoutGrid size={14} />
            </button>
            <button
              onClick={() => onViewModeChange("list")}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-md transition",
                viewMode === "list" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              )}
              title="List View"
            >
              <List size={14} />
            </button>
          </div>

          <button className="flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-amber-700 focus:ring-2 focus:ring-amber-500 focus:ring-offset-1">
            <UploadCloud size={16} />
            <span>Upload</span>
          </button>
        </div>
      </div>

      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
          <Search size={14} className="text-gray-400" />
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search media, documents, or tags..."
          className="w-full rounded-xl border border-gray-300 bg-white py-2 pl-9 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
        />
      </div>
    </div>
  );
}
