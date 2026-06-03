// @ts-nocheck
"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Viewer360 } from "./Viewer360";
import { AccessibleControls } from "./AccessibleControls";
import * as THREE from 'three';
import { ingestVideoSource, createVideoSegment } from "../editor/segment-actions";

// A simple interface for the segments we are building
interface DraftSegment {
  id: string;
  startMs: number;
  endMs?: number;
  cameraAngles?: {
    x: number;
    y: number;
    z: number;
  };
}

export default function MobileSegmenterPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  
  const [source, setSource] = useState<any>(null);
  const [ingestUrl, setIngestUrl] = useState("https://www.w3schools.com/html/mov_bbb.mp4");
  const [isIngesting, setIsIngesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  
  const [segments, setSegments] = useState<DraftSegment[]>([]);
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
  
  const [camera, setCamera] = useState<THREE.Camera | null>(null);

  // For MVP, we use a placeholder standard video if a 360 one isn't provided. 
  // It will render weirdly on the sphere, but proves the UI works.
  const videoUrl = "https://www.w3schools.com/html/mov_bbb.mp4"; 

  const handleTogglePlay = useCallback(() => {
    if (!videoRef.current) return;
    
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      // Need user interaction to play video in most browsers
      videoRef.current.play().catch(e => console.error("Playback failed", e));
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const handleTimeUpdate = useCallback((time: number) => {
    setCurrentTime(time);
  }, []);

  const handleDurationUpdate = useCallback((dur: number) => {
    setDuration(dur);
  }, []);

  const handleSeek = useCallback((time: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = time;
    setCurrentTime(time);
  }, []);

  const handleCameraMove = useCallback((cam: THREE.Camera) => {
    setCamera(cam);
  }, []);

  const handleMarkIn = useCallback(() => {
    if (!videoRef.current) return;
    const timeMs = Math.floor(videoRef.current.currentTime * 1000);
    
    const newSeg: DraftSegment = {
      id: Math.random().toString(36).substring(7),
      startMs: timeMs,
      // Capture the looking direction if we have the camera
      cameraAngles: camera ? { x: camera.rotation.x, y: camera.rotation.y, z: camera.rotation.z } : undefined
    };
    
    setSegments(prev => [...prev, newSeg]);
    setActiveSegmentId(newSeg.id);
  }, [camera]);

  const handleMarkOut = useCallback(async () => {
    if (!videoRef.current || !activeSegmentId || !source) return;
    const timeMs = Math.floor(videoRef.current.currentTime * 1000);
    
    // Find the segment we are ending
    const activeSeg = segments.find(s => s.id === activeSegmentId);
    if (!activeSeg) return;

    const endMs = Math.max(activeSeg.startMs + 100, timeMs);
    
    // Update local state for immediate feedback
    setSegments(prev => prev.map(seg => {
      if (seg.id === activeSegmentId) {
        return { ...seg, endMs };
      }
      return seg;
    }));
    
    setActiveSegmentId(null);
    setIsSaving(true);
    
    try {
      // Save directly to the database!
      await createVideoSegment({
        sourceId: source.id,
        startMs: activeSeg.startMs,
        endMs: endMs,
        title: `360 Moment at ${Math.floor(activeSeg.startMs / 1000)}s`,
        concept: "360 Look",
        difficulty: "beginner",
        cameraAngles: activeSeg.cameraAngles
      });
    } catch (err) {
      console.error("Failed to save segment to DB", err);
    } finally {
      setIsSaving(false);
    }
    
  }, [activeSegmentId, segments, source]);

  const handleUndo = useCallback(() => {
    setSegments(prev => {
      if (prev.length === 0) return prev;
      const newSegs = [...prev];
      const last = newSegs.pop();
      if (last?.id === activeSegmentId) {
        setActiveSegmentId(null);
      }
      return newSegs;
    });
  }, [activeSegmentId]);

  const handleIngest = async () => {
    if (!ingestUrl) return;
    setIsIngesting(true);
    try {
      const src = await ingestVideoSource(ingestUrl);
      setSource(src);
    } catch (err) {
      console.error(err);
      alert("Failed to ingest source. Make sure it is a valid YouTube URL for this MVP.");
    } finally {
      setIsIngesting(false);
    }
  };

  if (!source) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center p-4">
        <div className="bg-zinc-900 p-6 rounded-3xl w-full max-w-md flex flex-col gap-4 shadow-2xl">
          <h1 className="text-white text-2xl font-black">Load 360 Video</h1>
          <p className="text-white/60">Paste a YouTube URL to start marking 360 moments.</p>
          <input 
            type="text" 
            value={ingestUrl}
            onChange={(e) => setIngestUrl(e.target.value)}
            className="w-full bg-black border border-white/20 rounded-xl p-4 text-white font-mono text-sm focus:outline-none focus:border-emerald-500"
          />
          <button 
            onClick={handleIngest}
            disabled={isIngesting || !ingestUrl}
            className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white font-black text-xl py-4 rounded-xl shadow-[0_0_20px_rgba(16,185,129,0.2)]"
          >
            {isIngesting ? "LOADING..." : "START SEGMENTING"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 w-screen h-screen bg-black overflow-hidden flex flex-col touch-none select-none">
      
      {/* 360 Viewer Background Layer */}
      <div className="absolute inset-0 z-0">
         <Viewer360 
           videoUrl={source.url || source.providerSourceId} 
           videoRef={videoRef}  
           onTimeUpdate={handleTimeUpdate}
           onDurationUpdate={handleDurationUpdate}
           onCameraMove={handleCameraMove}
         />
      </div>

      {/* Top HUD (Heads up display) */}
      <div className="absolute top-0 left-0 right-0 p-4 z-10 flex justify-between items-start pointer-events-none">
        <div className="bg-black/50 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10 pointer-events-auto">
          <h1 className="text-white font-bold tracking-wide">360 Segmenter</h1>
          <p className="text-white/60 text-xs">{segments.length} clips marked</p>
        </div>
        
        {/* Current Active Segment Indicator */}
        {activeSegmentId && (
          <div className="bg-rose-500/80 animate-pulse text-white px-3 py-1 rounded-full text-xs font-bold shadow-lg">
            RECORDING CLIP...
          </div>
        )}
      </div>

      {/* Bottom Controls Layer */}
      <div className="z-10">
        <AccessibleControls 
          isPlaying={isPlaying}
          onTogglePlay={handleTogglePlay}
          onMarkIn={handleMarkIn}
          onMarkOut={handleMarkOut}
          onUndo={handleUndo}
          currentTime={currentTime}
          duration={duration}
          onSeek={handleSeek}
        />
      </div>
      
    </div>
  );
}
