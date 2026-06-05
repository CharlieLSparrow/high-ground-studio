import React, { useRef, useState, useEffect } from "react";
import type { TimelineClip } from "../useTimelineState";
import { timeToPixels, pixelsToTime, clampTime, calculateSnapPoint } from "./timelineMath";

interface TimelineClipViewProps {
  clip: TimelineClip;
  pixelsPerSecond: number;
  trackIndex: number;
  trackHeight: number;
  isSelected: boolean;
  snapPoints: number[];
  onSelect: (clipId: string) => void;
  onMove: (clipId: string, startIn: number, trackId?: string) => void;
  onTrim: (clipId: string, edge: "start" | "end", deltaSeconds: number) => void;
}

export function TimelineClipView({
  clip,
  pixelsPerSecond,
  trackIndex,
  trackHeight,
  isSelected,
  snapPoints,
  onSelect,
  onMove,
  onTrim
}: TimelineClipViewProps) {
  const [dragState, setDragState] = useState<{
    type: "move" | "trim-start" | "trim-end";
    startX: number;
    initialStartIn: number;
    initialDuration: number;
    currentStartIn: number;
    currentDuration: number;
  } | null>(null);

  const left = timeToPixels(dragState ? dragState.currentStartIn : clip.startIn, pixelsPerSecond);
  const width = timeToPixels(dragState ? dragState.currentDuration : clip.duration, pixelsPerSecond);
  const top = trackIndex * (trackHeight + 8); // 8px gap between tracks

  useEffect(() => {
    if (!dragState) return;

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      const deltaX = e.clientX - dragState.startX;
      const deltaSeconds = pixelsToTime(deltaX, pixelsPerSecond);

      if (dragState.type === "move") {
        let newStartIn = Math.max(0, dragState.initialStartIn + deltaSeconds);
        // Calculate snap
        const snap = calculateSnapPoint(newStartIn, snapPoints, pixelsPerSecond);
        if (snap !== null) {
          newStartIn = snap;
        } else {
          const endSnap = calculateSnapPoint(newStartIn + dragState.initialDuration, snapPoints, pixelsPerSecond);
          if (endSnap !== null) {
            newStartIn = endSnap - dragState.initialDuration;
          }
        }
        
        setDragState(s => s ? { ...s, currentStartIn: newStartIn } : null);
      } else if (dragState.type === "trim-start") {
        const requestedStart = dragState.initialStartIn + deltaSeconds;
        const clipEnd = dragState.initialStartIn + dragState.initialDuration;
        const newStartIn = clampTime(requestedStart, 0, clipEnd - 0.05);
        
        // Snap trim
        let snappedStart = newStartIn;
        const snap = calculateSnapPoint(newStartIn, snapPoints, pixelsPerSecond);
        if (snap !== null && snap < clipEnd - 0.05) {
          snappedStart = snap;
        }

        setDragState(s => s ? { 
          ...s, 
          currentStartIn: snappedStart, 
          currentDuration: clipEnd - snappedStart 
        } : null);
      } else if (dragState.type === "trim-end") {
        const requestedDuration = dragState.initialDuration + deltaSeconds;
        const newDuration = Math.max(0.05, requestedDuration);
        
        // Snap trim end
        let snappedDuration = newDuration;
        const snap = calculateSnapPoint(dragState.initialStartIn + newDuration, snapPoints, pixelsPerSecond);
        if (snap !== null && snap > dragState.initialStartIn) {
          snappedDuration = snap - dragState.initialStartIn;
        }

        setDragState(s => s ? { ...s, currentDuration: snappedDuration } : null);
      }
    };

    const handleMouseUp = () => {
      if (dragState.type === "move") {
        if (dragState.currentStartIn !== clip.startIn) {
          onMove(clip.id, dragState.currentStartIn);
        }
      } else if (dragState.type === "trim-start") {
        const delta = dragState.currentStartIn - clip.startIn;
        if (delta !== 0) {
          onTrim(clip.id, "start", delta);
        }
      } else if (dragState.type === "trim-end") {
        const delta = dragState.currentDuration - clip.duration;
        if (delta !== 0) {
          onTrim(clip.id, "end", delta);
        }
      }
      setDragState(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragState, clip, pixelsPerSecond, snapPoints, onMove, onTrim]);

  return (
    <div
      className={`absolute h-[80px] rounded-md shadow-sm border transition-shadow cursor-grab active:cursor-grabbing overflow-hidden group
        ${isSelected ? "border-amber-400 z-20 shadow-amber-900/20" : "border-slate-700/50 z-10 hover:border-slate-500"}
      `}
      style={{
        left: `${left}px`,
        width: `${width}px`,
        top: `${top}px`,
        backgroundColor: clip.color || (clip.kind === "video" ? "#1e3a8a" : "#064e3b"),
      }}
      onMouseDown={(e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        onSelect(clip.id);
        setDragState({
          type: "move",
          startX: e.clientX,
          initialStartIn: clip.startIn,
          initialDuration: clip.duration,
          currentStartIn: clip.startIn,
          currentDuration: clip.duration,
        });
      }}
    >
      <div className="absolute inset-0 p-2 pointer-events-none flex flex-col justify-between">
        <div className="text-[10px] font-bold text-white truncate drop-shadow-md">
          {clip.name}
        </div>
        <div className="text-[9px] font-mono text-white/70 truncate">
          {clip.startIn.toFixed(2)}s - {(clip.startIn + clip.duration).toFixed(2)}s
        </div>
      </div>

      {/* Trim Start Handle */}
      <div 
        className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100 bg-white/20 hover:bg-amber-400 transition-colors z-10"
        onMouseDown={(e) => {
          e.stopPropagation();
          onSelect(clip.id);
          setDragState({
            type: "trim-start",
            startX: e.clientX,
            initialStartIn: clip.startIn,
            initialDuration: clip.duration,
            currentStartIn: clip.startIn,
            currentDuration: clip.duration,
          });
        }}
      />

      {/* Trim End Handle */}
      <div 
        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100 bg-white/20 hover:bg-amber-400 transition-colors z-10"
        onMouseDown={(e) => {
          e.stopPropagation();
          onSelect(clip.id);
          setDragState({
            type: "trim-end",
            startX: e.clientX,
            initialStartIn: clip.startIn,
            initialDuration: clip.duration,
            currentStartIn: clip.startIn,
            currentDuration: clip.duration,
          });
        }}
      />
    </div>
  );
}
