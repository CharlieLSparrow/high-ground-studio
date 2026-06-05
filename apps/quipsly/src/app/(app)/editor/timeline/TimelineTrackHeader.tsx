import React from "react";
import type { TimelineTrackKind } from "../useTimelineState";

interface TimelineTrackHeaderProps {
  trackId: string;
  kind: TimelineTrackKind;
  isMuted?: boolean;
  isSolo?: boolean;
  isLocked?: boolean;
  onToggleMute?: () => void;
  onToggleSolo?: () => void;
  onToggleLock?: () => void;
}

export function TimelineTrackHeader({
  trackId,
  kind,
  isMuted = false,
  isSolo = false,
  isLocked = false,
  onToggleMute,
  onToggleSolo,
  onToggleLock,
}: TimelineTrackHeaderProps) {
  const isVideo = kind === "video";
  const bgColor = isVideo ? "bg-slate-800" : "bg-slate-700";
  const iconColor = isVideo ? "text-blue-400" : "text-emerald-400";

  return (
    <div className={`flex flex-col justify-between p-2 h-[80px] w-full border-b border-slate-900 ${bgColor} text-slate-300 select-none`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold ${iconColor}`}>{isVideo ? "🎬" : "🎵"}</span>
          <span className="text-xs font-black uppercase tracking-wider">{trackId}</span>
        </div>
        
        {isLocked && (
          <span className="text-[10px] bg-red-900/50 text-red-300 px-1.5 py-0.5 rounded font-bold">
            LOCKED
          </span>
        )}
      </div>

      <div className="flex items-center gap-1 mt-auto">
        <button 
          onClick={onToggleMute}
          className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold transition-colors
            ${isMuted ? "bg-red-500/20 text-red-400 border border-red-500/30" : "bg-black/20 hover:bg-black/40 border border-transparent"}
          `}
          title="Mute Track"
        >
          M
        </button>
        <button 
          onClick={onToggleSolo}
          className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold transition-colors
            ${isSolo ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30" : "bg-black/20 hover:bg-black/40 border border-transparent"}
          `}
          title="Solo Track"
        >
          S
        </button>
      </div>
    </div>
  );
}
