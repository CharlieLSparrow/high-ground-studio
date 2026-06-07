import React from "react";

export type ReusableMediaAsset = {
  id: string;
  name: string;
  kind: "audio" | "video" | "image" | "unknown";
  tags?: { label: string; tone: string }[];
  isSpine?: boolean;
  isSelected?: boolean;
};

export type MediaAssetPickerProps = {
  assets: ReusableMediaAsset[];
  selectedId?: string | null;
  spineAssetId?: string | null;
  onSelect: (assetId: string) => void;
  getAssetHealthLabel?: (asset: ReusableMediaAsset) => string;
  getAssetHealthTone?: (asset: ReusableMediaAsset) => string;
};

/**
 * Reusable Media Asset Picker
 * Displays a rich list of imported assets or clips for selection.
 */
export function MediaAssetPicker({
  assets,
  selectedId,
  spineAssetId,
  onSelect,
  getAssetHealthLabel,
  getAssetHealthTone,
}: MediaAssetPickerProps) {
  if (assets.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[#e8dcc4] bg-[#fffaf0] p-4 text-center text-sm font-bold text-[#8c6b4a]">
        No media assets available.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 max-h-96 overflow-y-auto rounded-xl border border-[#e8dcc4] bg-[#f8f3e6] p-4 shadow-inner">
      {assets.map((asset) => {
        const isSelected = asset.isSelected || selectedId === asset.id;
        const isSpine = asset.isSpine || spineAssetId === asset.id;
        const displayName = asset.name || (asset as any).originalName || asset.id;
        const healthLabel = getAssetHealthLabel?.(asset);
        const healthTone = getAssetHealthTone?.(asset);

        // Icon based on kind
        const getIcon = () => {
          if (asset.kind === 'video') return "🎬";
          if (asset.kind === 'audio') return "🎵";
          if (asset.kind === 'image') return "🖼️";
          return "📄";
        };

        return (
          <div
            key={asset.id}
            onClick={() => onSelect(asset.id)}
            draggable
            className={`relative group flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-all cursor-grab active:cursor-grabbing ${
              isSelected
                ? "border-amber-400 bg-white shadow-md ring-2 ring-amber-400/20"
                : "border-[#e8dcc4] bg-white hover:border-amber-300 hover:shadow-md"
            }`}
          >
            {/* Hover Drag Hint */}
            <div className="absolute inset-0 bg-amber-50/80 backdrop-blur-[1px] opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-xl pointer-events-none z-10 border border-amber-300">
              <span className="text-xs font-black text-amber-700 uppercase tracking-widest bg-white/90 px-3 py-1 rounded-full shadow-sm">
                Drag to Timeline
              </span>
            </div>

            <div className="flex w-full items-start justify-between gap-2 relative z-0">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm shadow-inner ${
                  asset.kind === 'video' ? 'bg-blue-50 border border-blue-100' :
                  asset.kind === 'audio' ? 'bg-emerald-50 border border-emerald-100' : 'bg-gray-50 border border-gray-100'
                }`}>
                  {getIcon()}
                </div>
                <span className="truncate font-bold text-[#3d3122] text-sm leading-tight max-w-[120px]">{displayName}</span>
              </div>

              {isSpine && (
                <span className="shrink-0 rounded-full bg-emerald-500 shadow-sm px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-white absolute -top-1 -right-1">
                  ★ Spine
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-1 font-mono text-[9px] uppercase tracking-wider mt-1 relative z-0">
              <span className="rounded-md bg-[#f5ead6] px-1.5 py-0.5 text-[#8c6b4a] font-bold border border-[#e8dcc4]">{asset.kind}</span>

              {asset.tags?.map((tag, idx) => (
                <span key={idx} className={`rounded-md border px-1.5 py-0.5 ${tag.tone}`}>
                  {tag.label}
                </span>
              ))}
              {healthLabel ? (
                <span className={`rounded-md border px-1.5 py-0.5 font-bold ${
                  healthLabel.toLowerCase().includes("ready") || healthLabel.toLowerCase().includes("synced")
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                    : healthLabel.toLowerCase().includes("needs sync") || healthLabel.toLowerCase().includes("held")
                    ? "border-amber-300 bg-amber-50 text-amber-700"
                    : healthLabel.toLowerCase().includes("broken") || healthLabel.toLowerCase().includes("error")
                    ? "border-red-300 bg-red-50 text-red-700"
                    : healthTone ?? "border-slate-200 bg-slate-50 text-slate-700"
                }`}>
                  {healthLabel}
                </span>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
