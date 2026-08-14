"use client";

import { Folder, Film, Image as ImageIcon, Music, FileText, PlayCircle } from "lucide-react";
import { AssetItem, FolderItem } from "./asset-types";

type AssetBinGridProps = {
  assets: AssetItem[];
  folders: FolderItem[];
  onFolderClick: (folderId: string) => void;
};

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getAssetIcon(type: AssetItem["type"]) {
  switch (type) {
    case "video": return <Film size={24} className="text-blue-500" />;
    case "image": return <ImageIcon size={24} className="text-amber-500" />;
    case "audio": return <Music size={24} className="text-purple-500" />;
    case "document": return <FileText size={24} className="text-gray-500" />;
  }
}

export function AssetBinGrid({ assets, folders, onFolderClick }: AssetBinGridProps) {
  const hasContent = folders.length > 0 || assets.length > 0;

  if (!hasContent) {
    return (
      <div className="flex h-64 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 text-center">
        <Folder size={48} className="text-gray-300 mb-4" />
        <h3 className="text-sm font-semibold text-gray-700">This folder is empty</h3>
        <p className="mt-1 text-xs text-gray-500">Upload media to get started.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {/* Folders first */}
      {folders.map((folder) => (
        <button
          key={folder.id}
          onClick={() => onFolderClick(folder.id)}
          className="group relative flex flex-col items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white p-4 transition-all hover:border-amber-400 hover:shadow-md hover:ring-1 hover:ring-amber-400"
        >
          <Folder size={42} fill="currentColor" className="text-amber-200 transition-transform group-hover:scale-105" />
          <div className="text-center w-full">
            <h4 className="truncate text-xs font-semibold text-gray-900" title={folder.name}>{folder.name}</h4>
            <p className="mt-0.5 text-[10px] text-gray-500">{folder.itemCount} items</p>
          </div>
        </button>
      ))}

      {/* Then assets */}
      {assets.map((asset) => (
        <div
          key={asset.id}
          className="group relative flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white transition-all hover:border-blue-400 hover:shadow-md"
        >
          {/* Thumbnail Area */}
          <div className="relative aspect-square w-full bg-gray-50 flex items-center justify-center border-b border-gray-100">
            {asset.thumbnailUrl ? (
              <img src={asset.thumbnailUrl} alt={asset.name} className="h-full w-full object-cover" />
            ) : (
              getAssetIcon(asset.type)
            )}
            
            {/* Hover overlay */}
            <div className="absolute inset-0 bg-black/40 opacity-0 transition-opacity group-hover:opacity-100 flex items-center justify-center backdrop-blur-[1px]">
              <button className="rounded-full bg-white/20 p-3 text-white backdrop-blur-md transition hover:bg-white/40 hover:scale-110">
                <PlayCircle size={28} />
              </button>
            </div>

            {/* Duration badge */}
            {asset.duration && (
              <div className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur-md">
                {asset.duration}
              </div>
            )}
          </div>

          {/* Details Area */}
          <div className="p-3">
            <h4 className="truncate text-xs font-semibold text-gray-900" title={asset.name}>{asset.name}</h4>
            <div className="mt-1 flex items-center justify-between text-[10px] text-gray-500">
              <span className="uppercase">{asset.type}</span>
              <span>{formatBytes(asset.sizeBytes)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
