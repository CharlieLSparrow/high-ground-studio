"use client";

import { Play, Pause, SquareAsterisk, ArrowLeftToLine, ArrowRightToLine, Undo2 } from "lucide-react";
import { useState, useCallback } from "react";
import { cn } from "../studio-ui";

interface AccessibleControlsProps {
  isPlaying: boolean;
  onTogglePlay: () => void;
  onMarkIn: () => void;
  onMarkOut: () => void;
  onUndo: () => void;
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
}

export function AccessibleControls({
  isPlaying,
  onTogglePlay,
  onMarkIn,
  onMarkOut,
  onUndo,
  currentTime,
  duration,
  onSeek
}: AccessibleControlsProps) {
  
  // Debounce logic to prevent accidental double taps from tremors
  const [lastTapTime, setLastTapTime] = useState(0);

  const handleAction = useCallback((action: () => void) => {
    const now = Date.now();
    if (now - lastTapTime > 600) { // 600ms debounce
      action();
      setLastTapTime(now);
      // Try to trigger haptic feedback if the device supports it
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(50);
      }
    }
  }, [lastTapTime]);

  const formatTime = (secs: number) => {
    if (!secs || isNaN(secs)) return "0:00";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="absolute bottom-0 left-0 right-0 h-[45vh] bg-gradient-to-t from-black via-black/90 to-transparent flex flex-col justify-end pb-8 px-4 pointer-events-auto gap-4">
      
      {/* Thick Accessible Scrubber Layer */}
      <div className="w-full flex flex-col gap-2 mb-2">
        <div className="flex justify-between items-center px-1">
           <span className="text-white/80 font-mono text-sm font-bold">{formatTime(currentTime)}</span>
           <span className="text-white/50 font-mono text-sm">{formatTime(duration)}</span>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={() => handleAction(() => onSeek(Math.max(0, currentTime - 10)))}
            className="bg-white/10 text-white rounded-xl p-3 active:scale-95 transition-transform"
            aria-label="Rewind 10 seconds"
          >
            <span className="font-bold">-10s</span>
          </button>

          <div 
            className="flex-1 h-12 bg-white/20 rounded-full overflow-hidden relative cursor-pointer"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              onSeek(percent * duration);
            }}
          >
            <div 
              className="absolute top-0 left-0 bottom-0 bg-blue-500 rounded-full transition-all duration-100 ease-linear pointer-events-none"
              style={{ width: `${progress}%` }}
            />
          </div>

          <button 
            onClick={() => handleAction(() => onSeek(Math.min(duration, currentTime + 10)))}
            className="bg-white/10 text-white rounded-xl p-3 active:scale-95 transition-transform"
            aria-label="Skip forward 10 seconds"
          >
            <span className="font-bold">+10s</span>
          </button>
        </div>
      </div>

      {/* Undo Button (moved from time display) */}
      <div className="absolute top-4 right-4 pointer-events-auto z-50">
        <button 
          onClick={() => handleAction(onUndo)}
          className="bg-black/60 backdrop-blur text-white rounded-full p-4 flex items-center justify-center active:scale-95 transition-transform border border-white/20 shadow-xl"
          aria-label="Undo last action"
        >
          <Undo2 size={24} />
        </button>
      </div>

      {/* Main Controls Row: IN - PLAY/PAUSE - OUT */}
      <div className="flex justify-between items-center gap-4">
        
        {/* Mark IN (Giant button on the left edge for thumb) */}
        <button
          onClick={() => handleAction(onMarkIn)}
          className="flex-1 aspect-square max-w-[120px] bg-emerald-500 hover:bg-emerald-400 text-white rounded-3xl flex flex-col items-center justify-center gap-2 active:scale-95 transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] border-b-4 border-emerald-700"
        >
          <ArrowLeftToLine size={40} strokeWidth={2.5} />
          <span className="font-black text-xl tracking-wide uppercase">In</span>
        </button>

        {/* Play/Pause (Central circular button) */}
        <button
          onClick={() => handleAction(onTogglePlay)}
          className="flex-1 aspect-square max-w-[100px] bg-white text-black rounded-full flex items-center justify-center active:scale-95 transition-all shadow-xl"
        >
          {isPlaying ? (
            <Pause size={48} className="fill-current" />
          ) : (
            <Play size={48} className="fill-current ml-2" />
          )}
        </button>

        {/* Mark OUT (Giant button on the right edge for thumb) */}
        <button
          onClick={() => handleAction(onMarkOut)}
          className="flex-1 aspect-square max-w-[120px] bg-rose-500 hover:bg-rose-400 text-white rounded-3xl flex flex-col items-center justify-center gap-2 active:scale-95 transition-all shadow-[0_0_20px_rgba(244,63,94,0.3)] border-b-4 border-rose-700"
        >
          <ArrowRightToLine size={40} strokeWidth={2.5} />
          <span className="font-black text-xl tracking-wide uppercase">Out</span>
        </button>
        
      </div>
    </div>
  );
}
