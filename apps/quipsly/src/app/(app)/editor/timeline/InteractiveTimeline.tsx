import React, { useRef, useState, useMemo, useEffect } from "react";
import type { TimelineState } from "../useTimelineState";
import { TimelineClipView } from "./TimelineClipView";
import { TimelineTrackHeader } from "./TimelineTrackHeader";
import { 
  DEFAULT_PIXELS_PER_SECOND, 
  MIN_PIXELS_PER_SECOND, 
  MAX_PIXELS_PER_SECOND, 
  timeToPixels, 
  pixelsToTime, 
  generateSnapPoints 
} from "./timelineMath";

interface InteractiveTimelineProps {
  timelineState: TimelineState;
  currentTime: number;
  onSeek: (time: number) => void;
  onMoveClip: (clipId: string, startIn: number, trackId?: string) => void;
  onTrimClip: (clipId: string, edge: "start" | "end", deltaSeconds: number) => void;
  onSelectClip: (clipId: string) => void;
  selectedClipId?: string;
}

export function InteractiveTimeline({
  timelineState,
  currentTime,
  onSeek,
  onMoveClip,
  onTrimClip,
  onSelectClip,
  selectedClipId
}: InteractiveTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [pixelsPerSecond, setPixelsPerSecond] = useState(DEFAULT_PIXELS_PER_SECOND);
  const [scrollX, setScrollX] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  
  // Track layout extraction
  const tracks = useMemo(() => {
    const trackSet = new Set<string>();
    timelineState.clips.forEach(c => trackSet.add(c.trackId));
    
    // Ensure default tracks exist
    trackSet.add("V1");
    trackSet.add("V2");
    trackSet.add("A1");
    trackSet.add("A2");
    
    return Array.from(trackSet).sort((a, b) => {
      // Sort V tracks above A tracks, descending V, ascending A
      const isA_Video = a.startsWith("V");
      const isB_Video = b.startsWith("V");
      if (isA_Video && !isB_Video) return -1;
      if (!isA_Video && isB_Video) return 1;
      if (isA_Video && isB_Video) return b.localeCompare(a); // V2 above V1
      return a.localeCompare(b); // A1 above A2
    });
  }, [timelineState.clips]);

  const TRACK_HEIGHT = 80;
  const TRACK_GAP = 8;
  const HEADER_WIDTH = 120;
  
  const totalDuration = useMemo(() => {
    return timelineState.clips.reduce((max, clip) => Math.max(max, clip.startIn + clip.duration), 60);
  }, [timelineState.clips]);
  
  const contentWidth = Math.max(timeToPixels(totalDuration + 30, pixelsPerSecond), 2000);
  const contentHeight = tracks.length * (TRACK_HEIGHT + TRACK_GAP) + 32; // +32 for ruler

  const snapPoints = useMemo(() => generateSnapPoints(timelineState.clips), [timelineState.clips]);

  // Horizontal DOM Virtualization
  // We only render clips that overlap the visible view window
  const visibleViewportWidth = containerRef.current?.clientWidth || 1000;
  const viewportStartPx = scrollX;
  const viewportEndPx = scrollX + visibleViewportWidth;
  const bufferPx = 500; // Render 500px offscreen to prevent flickering during fast scroll
  
  const visibleClips = useMemo(() => {
    return timelineState.clips.filter(clip => {
      const clipStartPx = timeToPixels(clip.startIn, pixelsPerSecond);
      const clipEndPx = timeToPixels(clip.startIn + clip.duration, pixelsPerSecond);
      return clipEndPx >= (viewportStartPx - bufferPx) && clipStartPx <= (viewportEndPx + bufferPx);
    });
  }, [timelineState.clips, pixelsPerSecond, viewportStartPx, viewportEndPx]);

  // Sync scroll state from the native scroll container
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollX(e.currentTarget.scrollLeft);
    setScrollY(e.currentTarget.scrollTop);
  };

  // Zoom handling (Cmd+Wheel on the container itself)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault(); // Prevent browser zoom
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
        const newPPS = Math.max(MIN_PIXELS_PER_SECOND, Math.min(MAX_PIXELS_PER_SECOND, pixelsPerSecond * zoomFactor));
        
        // Try to keep playhead in view
        const playheadPx = timeToPixels(currentTime, newPPS);
        const viewCenter = el.clientWidth / 2;
        const targetScrollLeft = Math.max(0, playheadPx - viewCenter);
        
        setPixelsPerSecond(newPPS);
        el.scrollLeft = targetScrollLeft;
      }
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [pixelsPerSecond, currentTime]);

  const rulerRef = useRef<HTMLDivElement>(null);
  const handleRulerClick = (e: React.MouseEvent) => {
    if (!rulerRef.current) return;
    const rect = rulerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + scrollX;
    const time = Math.max(0, pixelsToTime(x, pixelsPerSecond));
    onSeek(time);
  };

  const playheadPx = timeToPixels(currentTime, pixelsPerSecond);

  return (
    <div className="flex w-full h-full bg-[#1a1c23] border border-slate-700 rounded-lg overflow-hidden select-none">
      
      {/* Track Headers (Sticky Left) */}
      <div className="w-[120px] shrink-0 bg-[#21242d] border-r border-slate-700 z-30 flex flex-col relative overflow-hidden">
        <div className="h-8 bg-[#1a1c23] border-b border-slate-700 shrink-0 sticky top-0 z-40" />
        <div style={{ transform: `translateY(-${scrollY}px)` }}>
          {tracks.map(trackId => (
            <TimelineTrackHeader
              key={trackId}
              trackId={trackId}
              kind={trackId.startsWith("V") ? "video" : "audio"}
            />
          ))}
        </div>
      </div>

      {/* Hardware Accelerated Scrolling Container */}
      <div 
        ref={containerRef}
        className="flex-1 relative bg-[#16181d] overflow-auto scroll-smooth"
        onScroll={handleScroll}
        style={{ willChange: 'scroll-position' }}
      >
        {/* The Massive Spacer Div to force native scrolling bounds */}
        <div style={{ width: contentWidth, height: contentHeight, position: 'relative' }}>
          
          {/* Ruler (Sticky Top) */}
          <div 
            ref={rulerRef}
            className="sticky top-0 left-0 right-0 h-8 bg-[#1e2129] border-b border-slate-700 z-20 cursor-text overflow-hidden"
            onMouseDown={handleRulerClick}
          >
            <div 
              className="absolute top-0 bottom-0 pointer-events-none"
              style={{ width: contentWidth }}
            >
              {/* Virtualized Ruler Ticks (only draw those near scrollX) */}
              {Array.from({ length: Math.ceil(totalDuration + 30) }).map((_, i) => {
                if (pixelsPerSecond < 30 && i % 10 !== 0) return null;
                const px = timeToPixels(i, pixelsPerSecond);
                if (px < scrollX - 200 || px > scrollX + visibleViewportWidth + 200) return null;

                return (
                  <div 
                    key={i} 
                    className="absolute top-0 bottom-0 border-l border-slate-600/50 flex flex-col justify-end pb-1 px-1 text-[9px] text-slate-500"
                    style={{ left: px }}
                  >
                    {i}s
                  </div>
                );
              })}
            </div>
          </div>

          {/* Tracks Area */}
          <div 
            className="absolute left-0 right-0"
            style={{ top: 32, height: contentHeight - 32 }}
            onMouseDown={() => onSelectClip("")}
          >
            {/* Track Backgrounds */}
            {tracks.map((trackId, idx) => (
              <div 
                key={trackId}
                className="absolute w-full border-b border-slate-800/50 bg-[#1a1c23]/30"
                style={{
                  top: idx * (TRACK_HEIGHT + TRACK_GAP),
                  height: TRACK_HEIGHT
                }}
              />
            ))}

            {/* DOM Virtualized Clips */}
            {visibleClips.map(clip => (
              <TimelineClipView
                key={clip.id}
                clip={clip}
                pixelsPerSecond={pixelsPerSecond}
                trackIndex={tracks.indexOf(clip.trackId)}
                trackHeight={TRACK_HEIGHT}
                isSelected={clip.id === selectedClipId}
                snapPoints={snapPoints}
                onSelect={onSelectClip}
                onMove={onMoveClip}
                onTrim={onTrimClip}
              />
            ))}

            {/* Decoupled Playhead Line */}
            <div 
              className="absolute top-0 bottom-0 w-px bg-red-500 z-50 pointer-events-none drop-shadow-[0_0_2px_rgba(239,68,68,0.8)]"
              style={{ left: playheadPx }}
            >
              <div className="absolute top-[-32px] left-[-6px] w-0 h-0 border-l-[6px] border-r-[6px] border-t-[10px] border-transparent border-t-red-500" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
