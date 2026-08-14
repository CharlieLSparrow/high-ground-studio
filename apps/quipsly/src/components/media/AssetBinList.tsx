"use client";

import { Folder, Film, Image as ImageIcon, Music, FileText, MoreHorizontal } from "lucide-react";
import { useDraggable } from "@dnd-kit/core";
import { AssetItem, FolderItem } from "./asset-types";

type AssetBinListProps = {
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
    case "video": return <Film size={18} className="text-blue-500" />;
    case "image": return <ImageIcon size={18} className="text-amber-500" />;
    case "audio": return <Music size={18} className="text-purple-500" />;
    case "document": return <FileText size={18} className="text-gray-500" />;
  }
}

export function AssetBinList({ assets, folders, onFolderClick }: AssetBinListProps) {
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
    <div className="w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-500">
          <tr>
            <th className="px-6 py-3">Name</th>
            <th className="px-6 py-3 w-32">Type</th>
            <th className="px-6 py-3 w-32 text-right">Size</th>
            <th className="px-6 py-3 w-40 text-right">Date Added</th>
            <th className="px-6 py-3 w-16"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {/* Folders first */}
          {folders.map((folder) => (
            <tr key={folder.id} className="group transition-colors hover:bg-amber-50">
              <td className="px-6 py-3">
                <button
                  onClick={() => onFolderClick(folder.id)}
                  className="flex items-center gap-3 font-semibold text-gray-900 outline-none focus:underline"
                >
                  <Folder size={18} fill="currentColor" className="text-amber-200" />
                  {folder.name}
                </button>
              </td>
              <td className="px-6 py-3 text-gray-500 capitalize">Folder</td>
              <td className="px-6 py-3 text-right text-gray-500">{folder.itemCount} items</td>
              <td className="px-6 py-3 text-right text-gray-500">-</td>
              <td className="px-6 py-3 text-right">
                <button className="text-gray-400 opacity-0 transition-opacity hover:text-gray-700 group-hover:opacity-100">
                  <MoreHorizontal size={16} />
                </button>
              </td>
            </tr>
          ))}

          {/* Then assets */}
          {assets.map((asset) => (
            <DraggableListAsset key={asset.id} asset={asset} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DraggableListAsset({ asset }: { asset: AssetItem }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `asset-${asset.id}`,
    data: {
      type: "Asset",
      asset,
    },
  });

  return (
    <tr
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`group transition-colors hover:bg-blue-50 cursor-grab active:cursor-grabbing ${isDragging ? "bg-blue-100 opacity-50" : ""}`}
    >
      <td className="px-6 py-3">
        <div className="flex items-center gap-3 font-medium text-gray-900">
          {getAssetIcon(asset.type)}
          <span className="truncate max-w-[200px] md:max-w-sm lg:max-w-md xl:max-w-lg pointer-events-none" title={asset.name}>
            {asset.name}
          </span>
        </div>
      </td>
      <td className="px-6 py-3 text-gray-500 capitalize">{asset.type}</td>
      <td className="px-6 py-3 text-right text-gray-500">{formatBytes(asset.sizeBytes)}</td>
      <td className="px-6 py-3 text-right text-gray-500">
        {new Date(asset.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
      </td>
      <td className="px-6 py-3 text-right">
        <button className="text-gray-400 opacity-0 transition-opacity hover:text-gray-700 group-hover:opacity-100">
          <MoreHorizontal size={16} />
        </button>
      </td>
    </tr>
  );
}
