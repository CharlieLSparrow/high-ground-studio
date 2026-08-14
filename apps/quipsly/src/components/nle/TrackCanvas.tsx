'use client';

import React, { useRef, MouseEvent, useState, useCallback } from 'react';
import { useTimelineStore, Clip } from './useTimelineStore';
import { useDroppable } from '@dnd-kit/core';
import { calculateSnap } from './snapping';

export function TrackCanvas({ projectId }: { projectId: string }) {
  const { playheadFrame, zoom, setPlayheadFrame, clips, clearSelection } = useTimelineStore();
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
    let targetFrame = pxToFrame(x);
    
    // Snap playhead (pass targetFrame as playhead to ignore itself)
    targetFrame = calculateSnap(targetFrame, clips, targetFrame, undefined, 10, zoom);
    
    setPlayheadFrame(targetFrame);
  }, [isScrubbing, zoom, setPlayheadFrame, clips]);

  const handlePointerUp = () => {
    setIsScrubbing(false);
  };

  // Generate grid background based on zoom
  const gridBackground = {
    backgroundImage: `linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)`,
    backgroundSize: `${zoom * 10}px 100%`, // Vertical line every 10 frames
  };

  const formatTimecode = (frames: number) => {
    const totalSeconds = Math.floor(frames / 60);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div 
      className="relative min-w-[5000px] h-full"
      ref={canvasRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onClick={() => clearSelection()}
      style={{ touchAction: 'none' }}
    >
      {/* Time Ruler */}
      <div className="h-8 border-b border-[#333333] bg-[#1a1a1a] sticky top-0 z-10 w-full" style={gridBackground}>
        {/* Render time ticks */}
        <div className="absolute top-0 bottom-0 pointer-events-none w-full">
          {Array.from({ length: 100 }).map((_, i) => {
            const frame = i * 60;
            return (
              <div 
                key={i} 
                className="absolute flex flex-col h-full"
                style={{ left: frameToPx(frame) }}
              >
                <div className="flex-1 border-l border-neutral-700/50 pl-1 pt-0.5">
                  <span className="text-[10px] font-mono text-neutral-400 select-none">{formatTimecode(frame)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Grid Canvas */}
      <div className="absolute top-8 bottom-0 w-full" style={gridBackground}>
        {/* Tracks Container */}
        <div className="flex flex-col py-2 gap-1 px-2 relative z-0 pointer-events-none">
          {['t1', 't2', 't3'].map((trackId) => (
            <TrackRow key={trackId} trackId={trackId}>
              {clips.filter((c) => c.trackId === trackId).map((clip) => (
                <ClipNode key={clip.id} clip={clip} zoom={zoom} />
              ))}
            </TrackRow>
          ))}
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

function TrackRow({ trackId, children }: { trackId: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `track-${trackId}`,
    data: {
      type: 'Track',
      trackId,
    },
  });

  return (
    <div
      ref={setNodeRef}
      className={`h-24 relative pointer-events-auto transition-colors ${isOver ? 'bg-amber-500/10 border-dashed border-amber-500/50 border' : ''}`}
    >
      {children}
    </div>
  );
}

function ClipNode({ clip, zoom }: { clip: Clip, zoom: number }) {
  const { updateClip, selectedClipIds, toggleClipSelection, clips, playheadFrame } = useTimelineStore();
  const isSelected = selectedClipIds.includes(clip.id);

  // Left Trim
  const handleLeftTrimDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    const startX = e.clientX;
    const initialStart = clip.startFrame;
    const initialDuration = clip.durationFrames;

    const onMove = (moveEvent: PointerEvent) => {
      const deltaPx = moveEvent.clientX - startX;
      let deltaFrames = Math.floor(deltaPx / zoom);
      
      let newStart = initialStart + deltaFrames;
      let newDuration = initialDuration - deltaFrames;
      
      if (newDuration < 1) {
        newStart = initialStart + initialDuration - 1;
        newDuration = 1;
      }
      
      // Snapping
      const snappedStart = calculateSnap(newStart, clips, playheadFrame, clip.id, 10, zoom);
      newDuration += (newStart - snappedStart);
      newStart = snappedStart;

      updateClip(clip.id, { startFrame: Math.max(0, newStart), durationFrames: Math.max(1, newDuration) });
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // Right Trim
  const handleRightTrimDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    const startX = e.clientX;
    const initialDuration = clip.durationFrames;

    const onMove = (moveEvent: PointerEvent) => {
      const deltaPx = moveEvent.clientX - startX;
      let deltaFrames = Math.floor(deltaPx / zoom);
      
      let newDuration = Math.max(1, initialDuration + deltaFrames);
      
      // Snapping right edge
      const targetEnd = clip.startFrame + newDuration;
      const snappedEnd = calculateSnap(targetEnd, clips, playheadFrame, clip.id, 10, zoom);
      newDuration = snappedEnd - clip.startFrame;

      updateClip(clip.id, { durationFrames: Math.max(1, newDuration) });
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div 
      onClick={(e) => { e.stopPropagation(); toggleClipSelection(clip.id, e.metaKey || e.ctrlKey || e.shiftKey); }}
      className={`absolute top-0 bottom-0 rounded-md border shadow-sm overflow-hidden flex items-center px-2 cursor-grab active:cursor-grabbing transition-all duration-200 ease-out ${clip.color} ${isSelected ? 'ring-2 ring-white border-transparent z-10' : 'border-white/20'}`}
      style={{
        left: clip.startFrame * zoom,
        width: clip.durationFrames * zoom,
      }}
    >
      <span className="text-[10px] font-medium text-white truncate pointer-events-none">
        {clip.name}
      </span>

      {/* Left Trim Handle */}
      <div 
        onPointerDown={handleLeftTrimDown}
        className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-white/40 transition-colors"
      />

      {/* Right Trim Handle */}
      <div 
        onPointerDown={handleRightTrimDown}
        className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-white/40 transition-colors"
      />
    </div>
  );
}
