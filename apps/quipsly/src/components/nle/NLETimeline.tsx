'use client';

import React, { useCallback, useEffect } from 'react';
import { useTimelineStore } from './useTimelineStore';
import { TrackHeaderList } from './TrackHeaderList';
import { TrackCanvas } from './TrackCanvas';
import { Play, Pause, ZoomIn, ZoomOut } from 'lucide-react';

export function NLETimeline({ projectId }: { projectId: string }) {
  const { isPlaying, setIsPlaying, advanceFrame, zoom, setZoom } = useTimelineStore();

  // Playback loop
  useEffect(() => {
    let animationFrameId: number;
    
    // In a real NLE, we'd sync this to actual audio/video time, 
    // but for now we simulate a 60fps loop using requestAnimationFrame
    let lastTime = performance.now();
    
    const loop = (time: number) => {
      // 60fps = ~16.6ms per frame
      if (time - lastTime >= 16.6) {
        advanceFrame();
        lastTime = time;
      }
      animationFrameId = requestAnimationFrame(loop);
    };

    if (isPlaying) {
      animationFrameId = requestAnimationFrame(loop);
    }

    return () => cancelAnimationFrame(animationFrameId);
  }, [isPlaying, advanceFrame]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    // CMD/CTRL + Scroll to zoom
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      // Adjust zoom level (pixels per frame)
      const zoomDelta = e.deltaY * -0.05;
      setZoom(zoom + zoomDelta);
    }
  }, [zoom, setZoom]);

  return (
    <div 
      className="flex flex-col h-full w-full bg-[#1e1e1e] text-neutral-300 font-sans border-t border-neutral-800"
      onWheel={handleWheel}
    >
      {/* Toolbar */}
      <div className="h-12 bg-[#252526] border-b border-[#333333] flex items-center px-4 justify-between select-none">
        <div className="flex items-center gap-4">
          <span className="font-bold text-xs tracking-wider text-neutral-400">STORYBOARD NLE</span>
          
          <div className="h-6 w-px bg-neutral-700 mx-2" />
          
          {/* Playback Controls */}
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsPlaying(!isPlaying)}
              className="p-1.5 hover:bg-neutral-700 rounded transition-colors text-white"
            >
              {isPlaying ? <Pause size={16} /> : <Play size={16} fill="currentColor" />}
            </button>
          </div>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setZoom(zoom - 2)}
            className="p-1.5 hover:bg-neutral-700 rounded transition-colors"
          >
            <ZoomOut size={16} />
          </button>
          <span className="text-xs font-mono w-12 text-center">{Math.round(zoom)}px</span>
          <button 
            onClick={() => setZoom(zoom + 2)}
            className="p-1.5 hover:bg-neutral-700 rounded transition-colors"
          >
            <ZoomIn size={16} />
          </button>
        </div>
      </div>

      {/* Main Timeline Area */}
      <div className="flex-1 flex min-h-0 overflow-hidden bg-[#1e1e1e]">
        {/* Left Sidebar (Track Headers) */}
        <div className="w-64 flex-shrink-0 bg-[#252526] border-r border-[#333333] overflow-y-auto overflow-x-hidden z-20 shadow-xl">
          <TrackHeaderList projectId={projectId} />
        </div>
        
        {/* Right Canvas (Clips & Playhead) */}
        <div className="flex-1 relative overflow-auto">
          <TrackCanvas projectId={projectId} />
        </div>
      </div>
    </div>
  );
}
