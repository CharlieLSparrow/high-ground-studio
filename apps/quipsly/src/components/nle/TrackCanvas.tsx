'use client';

import React, { useRef, MouseEvent, useState, useCallback } from 'react';
import { useTimelineStore } from './useTimelineStore';

const MOCK_CLIPS = [
  { id: 'c1', trackId: 't1', name: 'Intro_Shot_01.mp4', startFrame: 30, durationFrames: 120, color: 'bg-blue-600' },
  { id: 'c2', trackId: 't1', name: 'B_Roll_Park.mp4', startFrame: 160, durationFrames: 240, color: 'bg-blue-700' },
  { id: 'c3', trackId: 't2', name: 'Logo_Overlay.png', startFrame: 60, durationFrames: 60, color: 'bg-purple-600' },
  { id: 'c4', trackId: 't3', name: 'SFX_Whoosh.wav', startFrame: 55, durationFrames: 30, color: 'bg-emerald-600' },
  { id: 'c5', trackId: 't3', name: 'Background_Music.wav', startFrame: 0, durationFrames: 1000, color: 'bg-emerald-700' },
];

export function TrackCanvas({ projectId }: { projectId: string }) {
  const { playheadFrame, zoom, setPlayheadFrame } = useTimelineStore();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);

  // Frame to pixel conversion
  const frameToPx = (frame: number) => frame * zoom;
  const pxToFrame = (px: number) => Math.floor(px / zoom);

  const handlePointerDown = (e: MouseEvent) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + canvasRef.current.scrollLeft;
    
    setPlayheadFrame(pxToFrame(x));
    setIsScrubbing(true);
  };

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isScrubbing || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.max(0, e.clientX - rect.left + canvasRef.current.scrollLeft);
    setPlayheadFrame(pxToFrame(x));
  }, [isScrubbing, zoom, setPlayheadFrame]);

  const handlePointerUp = () => {
    setIsScrubbing(false);
  };

  // Generate grid background based on zoom
  const gridBackground = {
    backgroundImage: `linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)`,
    backgroundSize: `${zoom * 10}px 100%`, // Vertical line every 10 frames
  };

  return (
    <div 
      className="relative min-w-[5000px] h-full"
      ref={canvasRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      style={{ touchAction: 'none' }}
    >
      {/* Time Ruler */}
      <div className="h-8 border-b border-[#333333] bg-[#1e1e1e] sticky top-0 z-10 w-full" style={gridBackground}>
        {/* Render some time ticks */}
        <div className="absolute top-0 bottom-0 pointer-events-none w-full">
          {Array.from({ length: 50 }).map((_, i) => (
            <div 
              key={i} 
              className="absolute text-[9px] text-neutral-500 pl-1 border-l border-neutral-700/50 h-full"
              style={{ left: frameToPx(i * 60) }} // Tick every 60 frames (1 second at 60fps)
            >
              00:0{i}
            </div>
          ))}
        </div>
      </div>

      {/* Grid Canvas */}
      <div className="absolute top-8 bottom-0 w-full" style={gridBackground}>
        {/* Tracks Container */}
        <div className="flex flex-col py-2 gap-1 px-2 relative z-0 pointer-events-none">
          {/* T1 */}
          <div className="h-24 relative pointer-events-auto">
            {MOCK_CLIPS.filter(c => c.trackId === 't1').map(clip => (
              <ClipNode key={clip.id} clip={clip} zoom={zoom} />
            ))}
          </div>
          {/* T2 */}
          <div className="h-24 relative pointer-events-auto">
            {MOCK_CLIPS.filter(c => c.trackId === 't2').map(clip => (
              <ClipNode key={clip.id} clip={clip} zoom={zoom} />
            ))}
          </div>
          {/* T3 */}
          <div className="h-24 relative pointer-events-auto">
            {MOCK_CLIPS.filter(c => c.trackId === 't3').map(clip => (
              <ClipNode key={clip.id} clip={clip} zoom={zoom} />
            ))}
          </div>
        </div>
      </div>

      {/* Playhead Cursor */}
      <div 
        className="absolute top-0 bottom-0 w-px bg-red-500 z-50 pointer-events-none flex flex-col items-center shadow-[0_0_10px_rgba(239,68,68,0.5)]"
        style={{ left: frameToPx(playheadFrame) }}
      >
        <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] border-l-transparent border-r-transparent border-t-red-500 mt-0" />
      </div>
    </div>
  );
}

function ClipNode({ clip, zoom }: { clip: any, zoom: number }) {
  return (
    <div 
      className={`absolute top-0 bottom-0 rounded-md border border-white/20 shadow-sm overflow-hidden flex items-center px-2 cursor-grab hover:brightness-110 active:cursor-grabbing ${clip.color}`}
      style={{
        left: clip.startFrame * zoom,
        width: clip.durationFrames * zoom,
      }}
    >
      <span className="text-[10px] font-medium text-white truncate pointer-events-none">
        {clip.name}
      </span>
    </div>
  );
}
