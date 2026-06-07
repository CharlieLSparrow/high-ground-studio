import { useState } from "react";
import type { TimelineClip, TransformKeyframe } from "./useTimelineState";
import { Camera, Plus, Trash2, Key } from "lucide-react";

type KeyframeControlsProps = {
  clip: TimelineClip;
  currentTime: number; // in seconds, relative to timeline
  onUpdateTransforms: (clipId: string, transforms: TransformKeyframe[]) => void;
};

export function KeyframeControls({ clip, currentTime, onUpdateTransforms }: KeyframeControlsProps) {
  // If the playhead is not over this clip, show a warning or disable controls
  const isPlayheadOverClip = currentTime >= clip.startIn && currentTime <= clip.startIn + clip.duration;

  // The local time within the clip is:
  const localTime = isPlayheadOverClip ? currentTime - clip.startIn : 0;

  const transforms = clip.transforms || [];

  const handleAddKeyframe = (property: "x" | "y" | "scale" | "rotation", value: number) => {
    let newTransforms = [...transforms];
    const existingIndex = newTransforms.findIndex(k => Math.abs(k.timeOffset - localTime) < 0.1);

    if (existingIndex >= 0) {
      newTransforms[existingIndex] = {
        ...newTransforms[existingIndex],
        [property]: value
      };
    } else {
      newTransforms.push({
        id: `kf-${Date.now()}`,
        timeOffset: localTime,
        [property]: value,
        easing: "ease-in-out"
      });
    }

    // Sort chronologically
    newTransforms.sort((a, b) => a.timeOffset - b.timeOffset);
    onUpdateTransforms(clip.id, newTransforms);
  };

  const handleClearKeyframes = () => {
    onUpdateTransforms(clip.id, []);
  };

  // Find current active keyframe if one exists near the playhead
  const currentKf = transforms.find(k => Math.abs(k.timeOffset - localTime) < 0.1);

  // Default values or current keyframe values
  const currentX = currentKf?.x ?? 0;
  const currentY = currentKf?.y ?? 0;
  const currentScale = currentKf?.scale ?? 90; // Default 90 FOV for 360, 1 for 2D. We'll assume FOV semantics for now

  return (
    <div className="bg-white rounded-xl border border-[#e8dcc4] p-4 shadow-sm flex flex-col gap-4 mt-4">
      <div className="flex items-center justify-between border-b border-[#e8dcc4] pb-2">
        <h3 className="text-sm font-black text-[#3d3122] flex items-center gap-2">
          <Camera size={16} className="text-amber-600" />
          Keyframe Controls
        </h3>
        <span className="text-[10px] font-bold text-[#8c6b4a] uppercase bg-[#f8f3e6] px-2 py-1 rounded-md flex items-center gap-1">
          {transforms.length} Keyframes
          {transforms.some(t => t.aiSuggested) && <span title="Contains AI suggestions">✨</span>}
        </span>
      </div>

      {!isPlayheadOverClip && (
        <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded-md font-bold">
          Move the playhead over this clip to add keyframes at the current time.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Pan X / Yaw */}
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <label className="text-[10px] font-bold text-[#8c6b4a] uppercase">Yaw / Pan X</label>
            <span className="text-xs font-mono">{currentX.toFixed(1)}°</span>
          </div>
          <div className="flex gap-2">
            <input
              type="range"
              min="-180"
              max="180"
              value={currentX}
              onChange={(e) => handleAddKeyframe("x", parseFloat(e.target.value))}
              disabled={!isPlayheadOverClip}
              className="flex-1"
            />
            <button
              disabled={!isPlayheadOverClip}
              onClick={() => handleAddKeyframe("x", currentX)}
              className="p-1 bg-[#f8f3e6] text-amber-700 rounded hover:bg-amber-100 transition-colors disabled:opacity-50"
              title="Add Keyframe"
            >
              <Key size={14} />
            </button>
          </div>
        </div>

        {/* Pan Y / Pitch */}
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <label className="text-[10px] font-bold text-[#8c6b4a] uppercase">Pitch / Pan Y</label>
            <span className="text-xs font-mono">{currentY.toFixed(1)}°</span>
          </div>
          <div className="flex gap-2">
            <input
              type="range"
              min="-90"
              max="90"
              value={currentY}
              onChange={(e) => handleAddKeyframe("y", parseFloat(e.target.value))}
              disabled={!isPlayheadOverClip}
              className="flex-1"
            />
            <button
              disabled={!isPlayheadOverClip}
              onClick={() => handleAddKeyframe("y", currentY)}
              className="p-1 bg-[#f8f3e6] text-amber-700 rounded hover:bg-amber-100 transition-colors disabled:opacity-50"
              title="Add Keyframe"
            >
              <Key size={14} />
            </button>
          </div>
        </div>

        {/* Scale / FOV */}
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <label className="text-[10px] font-bold text-[#8c6b4a] uppercase">FOV / Zoom</label>
            <span className="text-xs font-mono">{currentScale.toFixed(1)}°</span>
          </div>
          <div className="flex gap-2">
            <input
              type="range"
              min="10"
              max="150"
              value={currentScale}
              onChange={(e) => handleAddKeyframe("scale", parseFloat(e.target.value))}
              disabled={!isPlayheadOverClip}
              className="flex-1"
            />
            <button
              disabled={!isPlayheadOverClip}
              onClick={() => handleAddKeyframe("scale", currentScale)}
              className="p-1 bg-[#f8f3e6] text-amber-700 rounded hover:bg-amber-100 transition-colors disabled:opacity-50"
              title="Add Keyframe"
            >
              <Key size={14} />
            </button>
          </div>
        </div>
      </div>

      {transforms.length > 0 && (
        <div className="flex justify-end pt-2 border-t border-[#fdfaf6]">
          <button
            onClick={handleClearKeyframes}
            className="text-[10px] font-bold uppercase tracking-wider text-red-600 hover:text-red-700 flex items-center gap-1"
          >
            <Trash2 size={12} /> Clear All
          </button>
        </div>
      )}
    </div>
  );
}
