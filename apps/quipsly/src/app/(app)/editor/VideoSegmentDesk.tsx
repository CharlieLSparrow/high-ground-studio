"use client";

import { useState, useEffect, useRef } from "react";
import { ingestVideoSource, createVideoSegment, getSegmentsForSource, createSegmentList, addSegmentToList } from "./segment-actions";
import { cn, panelClassName, labelClassName, panelTitleClassName, primaryButtonClassName, cardClassName } from "../studio-ui";
import { Play, Camera, Compass } from "lucide-react";
import { Viewer360 } from "../mobile-segmenter/Viewer360";
import * as THREE from 'three';

export function VideoSegmentDesk() {
  const [url, setUrl] = useState("");
  const [source, setSource] = useState<any>(null);
  const [segments, setSegments] = useState<any[]>([]);
  const [selectedSegment, setSelectedSegment] = useState<any>(null);
  
  // List state
  const [listId, setListId] = useState<string | null>(null);
  const [previewList, setPreviewList] = useState<any[]>([]);
  
  // Segment authoring state
  const [startMs, setStartMs] = useState<number>(0);
  const [endMs, setEndMs] = useState<number>(0);
  const [title, setTitle] = useState("");
  const [concept, setConcept] = useState("");
  const [difficulty, setDifficulty] = useState("beginner");
  
  // 360 Camera framing state
  const [camX, setCamX] = useState<number>(0);
  const [camY, setCamY] = useState<number>(0);
  const [camZ, setCamZ] = useState<number>(0);
  
  const [isIngesting, setIsIngesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Video/Player references
  const playerRef = useRef<any>(null);
  const internalVidRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (source?.id && source.provider === "youtube") {
      loadSegments();
      
      // Initialize YouTube API
      if (!(window as any).YT) {
        const tag = document.createElement('script');
        tag.src = "https://www.youtube.com/iframe_api";
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
        
        (window as any).onYouTubeIframeAPIReady = initPlayer;
      } else {
        initPlayer();
      }
    } else if (source?.id && source.provider === "internal") {
      loadSegments();
    }
    
    function initPlayer() {
      // Need a slight delay to ensure DOM is ready
      setTimeout(() => {
        if (playerRef.current) {
          playerRef.current.destroy();
        }
        playerRef.current = new (window as any).YT.Player('yt-player-container', {
          videoId: source.providerSourceId,
          playerVars: { 'playsinline': 1 },
        });
      }, 100);
    }
  }, [source?.id]);

  const loadSegments = async () => {
    if (!source) return;
    const loaded = await getSegmentsForSource(source.id);
    setSegments(loaded);
  };

  const handleIngest = async () => {
    if (!url) return;
    setIsIngesting(true);
    try {
      const src = await ingestVideoSource(url);
      setSource(src);
      await loadSegments(); 
    } catch (err) {
      console.error(err);
      alert("Failed to ingest source.");
    } finally {
      setIsIngesting(false);
    }
  };

  const handleSyncStart = () => {
    if (source?.provider === "youtube" && playerRef.current?.getCurrentTime) {
      setStartMs(Math.floor(playerRef.current.getCurrentTime() * 1000));
    } else if (source?.provider === "internal" && internalVidRef.current) {
      setStartMs(Math.floor(internalVidRef.current.currentTime * 1000));
    }
  };

  const handleSyncEnd = () => {
    if (source?.provider === "youtube" && playerRef.current?.getCurrentTime) {
      setEndMs(Math.floor(playerRef.current.getCurrentTime() * 1000));
    } else if (source?.provider === "internal" && internalVidRef.current) {
      setEndMs(Math.floor(internalVidRef.current.currentTime * 1000));
    }
  };

  const handleSaveSegment = async () => {
    if (!source) return;
    setIsSaving(true);
    try {
      await createVideoSegment({
        sourceId: source.id,
        startMs,
        endMs,
        title,
        concept,
        difficulty,
        cameraAngles: { x: camX, y: camY, z: camZ }
      });
      // Reset form
      setTitle("");
      setStartMs(endMs); 
      setEndMs(endMs + 10000);
      setCamX(0);
      setCamY(0);
      setCamZ(0);
      
      const loaded = await getSegmentsForSource(source.id);
      setSegments(loaded);
    } catch (err) {
      console.error(err);
      alert("Failed to save segment.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateList = async () => {
    try {
      const list = await createSegmentList("My Curated Learning Path");
      setListId(list.id);
      alert("List created!");
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddToList = async (segment: any) => {
    if (!listId) return;
    try {
      await addSegmentToList(listId, segment.id);
      setPreviewList([...previewList, segment]);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <section className={cn("bg-white border border-[#e8dcc4] rounded-2xl shadow-sm overflow-hidden flex flex-col gap-4 p-6")} aria-label="Video Segment Desk">
      <div>
        <p className="text-xs font-bold text-[#8c6b4a] uppercase tracking-widest">Video Segment Desk</p>
        <h2 className="text-xl font-black text-[#3d3122] mt-1">Create Learning Moments</h2>
        <p className="mt-2 text-sm leading-relaxed text-[#8c6b4a]">
          Ingest a source, mark a range, define your 360° virtual camera angles, and build knowledge nodes.
        </p>
      </div>

      {!source ? (
        <div className="grid gap-3 bg-[#fdfaf6] p-6 rounded-xl border border-[#e8dcc4]">
          <label className="text-[0.7rem] font-bold text-[#8c6b4a] uppercase tracking-wider">YouTube or .mp4 URL</label>
          <input
            type="text"
            className="text-sm bg-white border border-[#e8dcc4] rounded-lg px-4 py-2.5 text-[#3d3122] focus:outline-none focus:border-amber-500 shadow-sm transition-all"
            placeholder="https://youtube.com/watch?v=..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button
            onClick={handleIngest}
            disabled={isIngesting || !url}
            className="mt-2 w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg transition-colors shadow-sm disabled:opacity-50"
          >
            {isIngesting ? "Ingesting..." : "Ingest Source"}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="bg-black rounded-xl overflow-hidden shadow-xl ring-1 ring-[#e8dcc4] relative group">
            {source.provider === "internal" ? (
              <div className="w-full aspect-video relative">
                <Viewer360 
                  videoUrl={source.url} 
                  videoRef={internalVidRef}
                  initialCameraAngles={selectedSegment?.cameraJson}
                  onCameraMove={(cam) => {
                     setCamX(cam.rotation.x);
                     setCamY(cam.rotation.y);
                     setCamZ(cam.rotation.z);
                  }}
                />
                {/* Simulated 360 overlay */}
                <div className="absolute top-4 left-4 bg-black/60 text-white/90 px-3 py-1.5 rounded-lg text-xs font-mono flex items-center gap-2 backdrop-blur-md pointer-events-none">
                   <Compass className="w-4 h-4 text-amber-400" />
                   X: {camX.toFixed(2)} | Y: {camY.toFixed(2)} | Z: {camZ.toFixed(2)}
                </div>
                {/* Play/Pause controls overlay */}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-md text-white rounded-full flex gap-2 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                   <button onClick={() => internalVidRef.current?.play()} className="hover:bg-white/20 p-2 rounded-full"><Play size={16} fill="white" /></button>
                   <button onClick={() => internalVidRef.current?.pause()} className="hover:bg-white/20 p-2 rounded-full px-3 text-xs font-bold">PAUSE</button>
                </div>
              </div>
            ) : (
              <div className="w-full aspect-video" id="yt-player-container">
              </div>
            )}
          </div>
          
          <div className="flex justify-between items-center text-sm px-1 border-b border-[#e8dcc4] pb-4">
            <span className="font-bold text-[#3d3122] flex items-center gap-2">
               <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
               {source.title}
            </span>
            <button onClick={() => setSource(null)} className="text-xs font-bold text-[#8c6b4a] hover:text-[#3d3122] transition-colors">Change Source</button>
          </div>

          <div className="bg-[#fdfaf6] border border-[#e8dcc4] rounded-xl p-5 flex flex-col gap-5 shadow-sm">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 bg-white p-3 rounded-lg border border-[#e8dcc4] shadow-sm">
                <div className="flex justify-between items-center mb-2">
                  <label className="text-[0.65rem] font-bold text-[#8c6b4a] uppercase tracking-wider">Start (ms)</label>
                  <button onClick={handleSyncStart} className="text-[0.65rem] text-amber-600 hover:text-amber-700 font-bold uppercase tracking-wider bg-amber-100 px-2 py-0.5 rounded">Sync</button>
                </div>
                <input type="number" value={startMs} onChange={(e) => setStartMs(parseInt(e.target.value))} className="w-full text-sm font-mono bg-transparent border-b border-[#e8dcc4] focus:border-amber-500 outline-none py-1 text-[#3d3122]" />
              </div>
              <div className="flex-1 bg-white p-3 rounded-lg border border-[#e8dcc4] shadow-sm">
                 <div className="flex justify-between items-center mb-2">
                  <label className="text-[0.65rem] font-bold text-[#8c6b4a] uppercase tracking-wider">End (ms)</label>
                  <button onClick={handleSyncEnd} className="text-[0.65rem] text-amber-600 hover:text-amber-700 font-bold uppercase tracking-wider bg-amber-100 px-2 py-0.5 rounded">Sync</button>
                </div>
                <input type="number" value={endMs} onChange={(e) => setEndMs(parseInt(e.target.value))} className="w-full text-sm font-mono bg-transparent border-b border-[#e8dcc4] focus:border-amber-500 outline-none py-1 text-[#3d3122]" />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 items-end bg-blue-50/50 p-4 rounded-lg border border-blue-100">
               <div className="flex-1 w-full">
                 <label className="text-[0.65rem] font-bold text-blue-600 uppercase tracking-wider mb-2 flex gap-2 items-center"><Camera size={14} /> Virtual Camera Framing (360°)</label>
                 <div className="flex flex-col sm:flex-row gap-3">
                   <div className="flex-1">
                     <span className="text-[10px] text-blue-500 font-mono">TILT (X)</span>
                     <input type="number" step="0.01" value={camX} onChange={(e) => setCamX(parseFloat(e.target.value))} className="w-full text-sm font-mono bg-white border border-blue-200 rounded px-2 py-1 text-blue-900" />
                   </div>
                   <div className="flex-1">
                     <span className="text-[10px] text-blue-500 font-mono">PAN (Y)</span>
                     <input type="number" step="0.01" value={camY} onChange={(e) => setCamY(parseFloat(e.target.value))} className="w-full text-sm font-mono bg-white border border-blue-200 rounded px-2 py-1 text-blue-900" />
                   </div>
                   <div className="flex-1">
                     <span className="text-[10px] text-blue-500 font-mono">ROLL (Z)</span>
                     <input type="number" step="0.01" value={camZ} onChange={(e) => setCamZ(parseFloat(e.target.value))} className="w-full text-sm font-mono bg-white border border-blue-200 rounded px-2 py-1 text-blue-900" />
                   </div>
                 </div>
                 <p className="text-[10px] text-blue-400 mt-2 italic">Drag the 360° video viewer above to set these angles in real-time!</p>
               </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[0.7rem] font-bold text-[#8c6b4a] uppercase tracking-wider">Title</label>
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full text-sm bg-white border border-[#e8dcc4] rounded-lg px-3 py-2 text-[#3d3122] shadow-sm focus:outline-none focus:border-amber-500" placeholder="Segment Title" />
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 flex flex-col gap-1.5">
                <label className="text-[0.7rem] font-bold text-[#8c6b4a] uppercase tracking-wider">Concept</label>
                <input type="text" value={concept} onChange={(e) => setConcept(e.target.value)} className="w-full text-sm bg-white border border-[#e8dcc4] rounded-lg px-3 py-2 text-[#3d3122] shadow-sm focus:outline-none focus:border-amber-500" placeholder="e.g. gradient descent" />
              </div>
              <div className="flex-1 flex flex-col gap-1.5">
                <label className="text-[0.7rem] font-bold text-[#8c6b4a] uppercase tracking-wider">Difficulty</label>
                <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="w-full text-sm bg-white border border-[#e8dcc4] rounded-lg px-3 py-2 text-[#3d3122] shadow-sm focus:outline-none focus:border-amber-500">
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
              </div>
            </div>

            <button
              onClick={handleSaveSegment}
              disabled={isSaving || endMs <= startMs}
              className="mt-2 w-full py-3 bg-[#8c6b4a] hover:bg-[#5e4b33] text-white font-bold rounded-xl shadow-md transition-all disabled:opacity-50"
            >
              {isSaving ? "Saving..." : "Save Learning Segment"}
            </button>
          </div>

          <div className="flex flex-col gap-3 mt-2">
            <h3 className="text-sm font-bold text-[#3d3122] border-b border-[#e8dcc4] pb-2 flex justify-between items-end">
              <span>Knowledge Nodes ({segments.length})</span>
              <span className="text-[10px] text-[#8c6b4a] font-normal tracking-wider uppercase">Saved to database</span>
            </h3>
            {segments.map(seg => (
              <div key={seg.id} className={`bg-white p-4 rounded-xl border shadow-sm transition-all flex flex-col gap-3 ${selectedSegment?.id === seg.id ? "border-amber-500 ring-1 ring-amber-500/20" : "border-[#e8dcc4] hover:border-[#d4c1a0]"}`}>
                <div className="flex justify-between items-start">
                  <div className="flex flex-col gap-1">
                    <span className="font-bold text-sm text-[#3d3122] flex items-center gap-2">
                      {seg.title || "Untitled Segment"}
                    </span>
                    <div className="flex gap-2 items-center">
                       <span className="text-[10px] font-bold uppercase tracking-wider bg-[#f8f3e6] text-[#8c6b4a] px-2 py-0.5 rounded-full border border-[#e8dcc4]">{seg.concept || "no concept"}</span>
                       <span className="text-[10px] font-bold uppercase tracking-wider bg-[#f8f3e6] text-[#8c6b4a] px-2 py-0.5 rounded-full border border-[#e8dcc4]">{seg.difficulty}</span>
                       {seg.cameraJson && <span className="text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200 flex items-center gap-1"><Compass size={10} /> 360° Cam</span>}
                    </div>
                  </div>
                  <span className="text-xs text-[#8c6b4a] font-mono font-medium bg-[#fdfaf6] px-2 py-1 rounded-md border border-[#e8dcc4]">
                    {seg.startSeconds?.toFixed(1)}s - {seg.endSeconds?.toFixed(1)}s
                  </span>
                </div>
                
                <div className="flex gap-3 mt-1 pt-3 border-t border-[#fdfaf6]">
                  <button 
                    onClick={() => {
                      setSelectedSegment(seg);
                      setStartMs(seg.startSeconds * 1000);
                      setEndMs(seg.endSeconds * 1000);
                      if (seg.cameraJson) {
                         setCamX(seg.cameraJson.x || 0);
                         setCamY(seg.cameraJson.y || 0);
                         setCamZ(seg.cameraJson.z || 0);
                      }
                      if (source.provider === 'youtube' && playerRef.current?.seekTo) {
                        playerRef.current.seekTo(seg.startSeconds, true);
                      } else if (source.provider === 'internal' && internalVidRef.current) {
                        internalVidRef.current.currentTime = seg.startSeconds;
                      }
                    }} 
                    className="text-xs font-bold text-amber-600 hover:text-amber-700 transition-colors"
                  >
                    Preview Range
                  </button>
                  {listId && (
                    <button onClick={() => handleAddToList(seg)} className="text-xs font-bold text-blue-600 hover:underline">Add to List</button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-4 mt-6 pt-6 border-t border-[#e8dcc4]">
            <div>
              <h3 className="text-sm font-bold text-[#3d3122]">Curated Playlist</h3>
              <p className="text-xs text-[#8c6b4a]">Assemble an ordered path from your segments.</p>
            </div>
            
            {!listId ? (
              <button onClick={handleCreateList} className="py-2.5 bg-[#f8f3e6] hover:bg-[#ebdcc8] text-[#8c6b4a] hover:text-[#3d3122] font-bold rounded-xl border border-[#e8dcc4] transition-colors w-fit px-6 shadow-sm">
                 Create New List
              </button>
            ) : (
              <div className="flex flex-col gap-3">
                <span className="text-xs font-bold text-emerald-600 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  List Active • {previewList.length} items
                </span>
                {previewList.length > 0 && (
                  <div className="flex overflow-x-auto gap-3 pb-2">
                    {previewList.map((item, idx) => (
                      <div key={idx} className="shrink-0 w-40 h-24 bg-white rounded-xl border border-[#e8dcc4] shadow-sm flex flex-col justify-end p-3 relative overflow-hidden group cursor-pointer hover:border-amber-400">
                        <div className="absolute inset-0 bg-black/5 group-hover:bg-black/10 transition flex items-center justify-center">
                           <Play className="text-amber-600 opacity-0 group-hover:opacity-100 transition-opacity" size={24} fill="currentColor" />
                        </div>
                        <span className="text-xs font-bold text-[#3d3122] z-10 truncate">{item.title}</span>
                        <span className="text-[10px] text-[#8c6b4a] z-10 uppercase tracking-wider">{item.concept}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      )}
    </section>
  );
}
