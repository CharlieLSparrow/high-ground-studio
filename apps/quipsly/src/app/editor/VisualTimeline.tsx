import React from "react";

export type EdlClip = {
  id: string;
  type: "video" | "audio" | "graphic";
  src: string;
  startIn: number;
  duration: number;
  track: string; // Changed from number to string to support "V1", "A1", etc.
  label?: string;
  color?: string;
};

export type VisualTimelineProps = {
  clips: EdlClip[];
  currentTime: number;
  onTimeScrub?: (time: number) => void;
};

const PIXELS_PER_SECOND = 10;
const TRACK_HEIGHT = 48;

export function VisualTimeline({ clips, currentTime, onTimeScrub }: VisualTimelineProps) {
  // Organize clips by track
  const tracks: Record<string, EdlClip[]> = {};
  let maxTime = 60; // minimum 60 seconds

  clips.forEach((clip) => {
    if (!tracks[clip.track]) tracks[clip.track] = [];
    tracks[clip.track].push(clip);
    if (clip.startIn + clip.duration > maxTime) {
      maxTime = clip.startIn + clip.duration;
    }
  });

  // Custom sort to put V tracks on top, then A tracks
  const trackIds = Object.keys(tracks).sort((a, b) => {
    if (a.startsWith("V") && b.startsWith("A")) return -1;
    if (a.startsWith("A") && b.startsWith("V")) return 1;
    return a.localeCompare(b);
  });

  return (
    <div className="w-full h-full bg-zinc-950 flex flex-col select-none relative overflow-x-auto overflow-y-hidden border-t border-zinc-800">
      {/* Time ruler */}
      <div 
        className="h-8 bg-zinc-900 border-b border-zinc-800 sticky top-0 z-20 flex"
        style={{ width: `${maxTime * PIXELS_PER_SECOND}px` }}
        onPointerDown={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left;
          onTimeScrub?.(x / PIXELS_PER_SECOND);
        }}
      >
        {Array.from({ length: Math.ceil(maxTime / 10) }).map((_, i) => (
          <div key={i} className="flex-none h-full border-l border-zinc-700 text-[10px] text-zinc-500 pl-1" style={{ width: `${10 * PIXELS_PER_SECOND}px` }}>
            {i * 10}s
          </div>
        ))}
      </div>

      {/* Tracks */}
      <div className="flex-1 relative" style={{ width: `${maxTime * PIXELS_PER_SECOND}px` }}>
        
        {/* Playhead */}
        <div 
          className="absolute top-0 bottom-0 w-[1px] bg-red-500 z-30 pointer-events-none"
          style={{ left: `${currentTime * PIXELS_PER_SECOND}px` }}
        >
          <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-red-500 -ml-[5px] -mt-[8px]" />
        </div>

        {trackIds.length === 0 && (
          <div className="h-full flex items-center justify-center text-zinc-600 text-sm italic font-mono">
            Timeline is empty. Drop clips here.
          </div>
        )}

        {trackIds.map((trackId) => (
          <div key={trackId} className="flex relative border-b border-zinc-900 bg-zinc-900/20" style={{ height: `${TRACK_HEIGHT}px` }}>
            {/* Track Header (fixed left) */}
            <div className="w-16 h-full bg-zinc-900 border-r border-zinc-800 sticky left-0 z-10 flex items-center justify-center font-bold text-xs text-zinc-500 shrink-0">
              {trackId}
            </div>

            {/* Track Content */}
            <div className="flex-1 relative">
              {tracks[trackId].map((clip) => {
                const isAudio = trackId.startsWith("A");
                return (
                  <div
                    key={clip.id}
                    className={`absolute top-1 bottom-1 rounded-sm border border-black/50 shadow-sm flex items-center px-2 overflow-hidden text-[10px] font-bold text-white/90 truncate cursor-pointer hover:brightness-110 transition-all ${
                      clip.color ? `bg-[${clip.color}]` : (isAudio ? 'bg-emerald-700' : 'bg-blue-600')
                    }`}
                    style={{
                      left: `${clip.startIn * PIXELS_PER_SECOND}px`,
                      width: `${clip.duration * PIXELS_PER_SECOND}px`,
                      backgroundColor: clip.color || (isAudio ? '#047857' : '#2563eb'),
                    }}
                  >
                    {isAudio && <span className="mr-1 opacity-50">🔉</span>}
                    {clip.label || clip.id}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* Empty placeholder tracks to fill space */}
        {Array.from({ length: Math.max(0, 4 - trackIds.length) }).map((_, i) => (
           <div key={`empty-${i}`} className="flex relative border-b border-zinc-900 bg-zinc-950" style={{ height: `${TRACK_HEIGHT}px` }}>
              <div className="w-16 h-full bg-zinc-900 border-r border-zinc-800 sticky left-0 z-10 flex items-center justify-center font-bold text-xs text-zinc-700 shrink-0">
                -
              </div>
           </div>
        ))}
      </div>
    </div>
  );
}
