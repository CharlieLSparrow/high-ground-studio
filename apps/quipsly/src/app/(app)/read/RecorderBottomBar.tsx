'use client';

import { useNativeRecorderBridge } from './useNativeRecorderBridge';
import { Mic, Square, Pause, Play, Flag, UploadCloud, RefreshCw, CheckCircle2 } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';

export function RecorderBottomBar({ projectSlug, episodeSlug }: { projectSlug: string, episodeSlug: string }) {
  const bridge = useNativeRecorderBridge(projectSlug, episodeSlug);
  
  // Use a ref for the UI duration so we don't trigger React renders 60 times a second
  const displayDurationRef = useRef(bridge.durationMs);
  const timeLabelRef = useRef<HTMLSpanElement>(null);
  const requestRef = useRef<number | undefined>(undefined);
  const lastUpdateRef = useRef<number | undefined>(undefined);

  // Sync with bridge duration when it pauses/stops/starts
  useEffect(() => {
    displayDurationRef.current = bridge.durationMs;
    updateTimeDisplay(bridge.durationMs);
    
    if (bridge.recorderState === 'RECORDING') {
      lastUpdateRef.current = performance.now();
      
      const animate = (time: number) => {
        if (lastUpdateRef.current) {
          const delta = time - lastUpdateRef.current;
          displayDurationRef.current += delta;
          updateTimeDisplay(displayDurationRef.current);
        }
        lastUpdateRef.current = time;
        requestRef.current = requestAnimationFrame(animate);
      };
      
      requestRef.current = requestAnimationFrame(animate);
    }
    
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [bridge.recorderState, bridge.durationMs]);

  const updateTimeDisplay = (ms: number) => {
    if (!timeLabelRef.current) return;
    const totalSeconds = Math.floor(ms / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    timeLabelRef.current.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div 
      className="fixed bottom-0 left-0 right-0 bg-zinc-900 border-t border-zinc-800 pb-safe flex flex-col shadow-2xl z-50"
      role="region"
      aria-label="Recording Controls"
    >
      {!bridge.hasNativeBridge && (
        <div className="bg-yellow-900/40 text-yellow-500/90 text-[10px] uppercase tracking-wider text-center py-1.5 px-4 font-semibold border-b border-yellow-900/30">
          ⚠️ Beta: Keep screen awake. Do not lock phone. Use Wi-Fi for long takes.
        </div>
      )}
      
      <div className="p-4 flex flex-col gap-4">
        {/* Time & Status display */}
        <div className="flex justify-between items-center px-4">
        <div className="flex items-center gap-2">
          <div 
            className={`w-3 h-3 rounded-full ${bridge.recorderState === 'RECORDING' ? 'bg-red-500 animate-pulse' : 'bg-zinc-600'}`} 
            aria-hidden="true"
          />
          <span 
            ref={timeLabelRef}
            className="text-zinc-300 font-mono text-lg tracking-wider tabular-nums"
            aria-live="polite"
            aria-atomic="true"
          >
            00:00
          </span>
        </div>
        <div 
          className="text-zinc-500 text-sm font-medium uppercase tracking-widest flex items-center gap-2"
          aria-live="polite"
        >
          {bridge.uploadState !== 'IDLE' ? (
            <span className={
              bridge.uploadState === 'FAILED' ? 'text-red-400' :
              bridge.uploadState === 'UPLOADED' ? 'text-green-400' :
              'text-blue-400 animate-pulse'
            }>
              {bridge.uploadState.replace('_', ' ')}
            </span>
          ) : (
            bridge.recorderState
          )}
        </div>
      </div>

      {/* Main Controls */}
      <div className="flex justify-center items-center gap-6 relative">
        
        {bridge.recorderState === 'RECORDING' && (
          <button 
            onClick={bridge.pause}
            className="w-14 h-14 rounded-full bg-zinc-800 text-white flex items-center justify-center hover:bg-zinc-700 focus:outline-none focus:ring-4 focus:ring-zinc-500 active:scale-95 transition-all"
            aria-label="Pause Recording"
            title="Pause"
          >
            <Pause className="w-6 h-6" aria-hidden="true" />
          </button>
        )}

        {(bridge.recorderState === 'PAUSED' || bridge.recorderState === 'READY' || bridge.recorderState === 'STOPPED') && (
          <button 
            onClick={bridge.recorderState === 'PAUSED' ? bridge.resume : bridge.start}
            className="w-20 h-20 rounded-full bg-red-600 text-white flex items-center justify-center hover:bg-red-500 focus:outline-none focus:ring-4 focus:ring-red-400 active:scale-95 transition-all shadow-lg shadow-red-900/50"
            aria-label={bridge.recorderState === 'PAUSED' ? "Resume Recording" : "Start Recording"}
            title={bridge.recorderState === 'PAUSED' ? "Resume" : "Record"}
          >
            {bridge.recorderState === 'PAUSED' ? <Play className="w-8 h-8 ml-1" aria-hidden="true" /> : <Mic className="w-8 h-8" aria-hidden="true" />}
          </button>
        )}

        {(bridge.recorderState === 'RECORDING' || bridge.recorderState === 'PAUSED') && (
          <>
            <button 
              onClick={bridge.markBreak}
              className="w-14 h-14 rounded-full bg-zinc-800 text-zinc-300 flex items-center justify-center hover:bg-zinc-700 focus:outline-none focus:ring-4 focus:ring-zinc-500 active:scale-95 transition-all"
              aria-label="Mark Break"
              title="Mark Break"
            >
              <Flag className="w-5 h-5" aria-hidden="true" />
            </button>

            <button 
              onClick={bridge.stop}
              className="w-14 h-14 rounded-full bg-zinc-800 text-zinc-300 flex items-center justify-center hover:bg-zinc-700 focus:outline-none focus:ring-4 focus:ring-zinc-500 active:scale-95 transition-all"
              aria-label="Stop Recording"
              title="Stop"
            >
              <Square className="w-5 h-5 fill-current" aria-hidden="true" />
            </button>
          </>
        )}

        {bridge.uploadState === 'FAILED' && bridge.recorderState === 'STOPPED' && (
          <button
            onClick={bridge.retryUpload}
            className="absolute right-4 w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center hover:bg-blue-500 active:scale-95 transition-all shadow-lg"
            aria-label="Retry Upload"
            title="Retry Upload"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        )}
      </div>
      
      {bridge.error && (
        <div 
          className="text-red-400 text-xs text-center font-medium px-4"
          role="alert"
        >
          {bridge.error}
        </div>
      )}
      </div>
    </div>
  );
}
