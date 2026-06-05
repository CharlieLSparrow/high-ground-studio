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
    <div className="flex flex-col gap-2 max-h-80 overflow-y-auto rounded-lg border border-[#e8dcc4] bg-[#fffaf0] p-2">
      {assets.map((asset) => {
        const isSelected = asset.isSelected || selectedId === asset.id;
        const isSpine = asset.isSpine || spineAssetId === asset.id;
        const displayName = asset.name || (asset as any).originalName || asset.id;
        const healthLabel = getAssetHealthLabel?.(asset);
        const healthTone = getAssetHealthTone?.(asset);

        return (
          <button
            key={asset.id}
            type="button"
            onClick={() => onSelect(asset.id)}
            className={`flex flex-col items-start gap-1 rounded-md border p-2 text-left transition-colors ${
              isSelected
                ? "border-emerald-400 bg-emerald-50 shadow-sm"
                : "border-white bg-white hover:border-[#e8dcc4] hover:bg-[#fffdf7]"
            }`}
          >
            <div className="flex w-full items-start justify-between gap-2">
              <span className="truncate font-black text-[#3d3122]">{displayName}</span>
              {isSpine && (
                <span className="shrink-0 rounded-full bg-emerald-500 shadow-sm px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-white">
                  ★ Spine Audio
                </span>
              )}
            </div>
            
            <div className="flex flex-wrap gap-1 font-mono text-[10px] uppercase tracking-[0.12em]">
              <span className="rounded-full bg-[#f5ead6] px-2 py-0.5 text-[#8c6b4a]">{asset.kind}</span>
              
              {asset.tags?.map((tag, idx) => (
                <span key={idx} className={`rounded-full border px-2 py-0.5 ${tag.tone}`}>
                  {tag.label}
                </span>
              ))}
              {healthLabel ? (
                <span className={`rounded-full border px-2 py-0.5 ${
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
          </button>
        );
      })}
    </div>
  );
}
