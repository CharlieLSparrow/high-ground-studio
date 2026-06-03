"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { ChevronUp, ChevronDown, Heart, MessageCircle, Share2, Bookmark } from "lucide-react";
import { getConsumerVideoFeed, getConsumerLorelist } from "../app/actions/feed-actions";
import { ConsumerViewer360 } from "./ConsumerViewer360";

export function VideoSwipeFeed({ listId }: { listId?: string }) {
  const [segments, setSegments] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);

  useEffect(() => {
    async function loadFeed() {
      try {
        const data = listId ? await getConsumerLorelist(listId) : await getConsumerVideoFeed();
        setSegments(data);
      } catch (err) {
        console.error("Failed to load feed", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadFeed();
  }, []);

  const handleNext = useCallback(() => {
    if (currentIndex < segments.length - 1) {
      setCurrentIndex(prev => prev + 1);
    }
  }, [currentIndex, segments.length]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  }, [currentIndex]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") handleNext();
      if (e.key === "ArrowUp") handlePrev();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleNext, handlePrev]);

  // Handle video looping and auto-play
  useEffect(() => {
    segments.forEach((seg, idx) => {
      const video = videoRefs.current[idx];
      if (!video) return;

      if (idx === currentIndex) {
        video.currentTime = seg.startSeconds;
        video.play().catch(e => console.log("Autoplay prevented:", e));
        
        const handleTimeUpdate = () => {
          if (video.currentTime >= seg.endSeconds) {
            video.currentTime = seg.startSeconds;
            video.play();
          }
        };
        video.addEventListener('timeupdate', handleTimeUpdate);
        return () => video.removeEventListener('timeupdate', handleTimeUpdate);
      } else {
        video.pause();
      }
    });
  }, [currentIndex, segments]);

  if (isLoading) {
    return <div className="h-screen w-full flex items-center justify-center bg-black text-white font-mono">Loading Feed...</div>;
  }

  if (segments.length === 0) {
    return <div className="h-screen w-full flex items-center justify-center bg-black text-white font-mono">No segments found. Curate some in the Studio!</div>;
  }

  return (
    <div className="h-screen w-full bg-black overflow-hidden relative touch-none">
      {/* Feed Container */}
      <div 
        className="h-full w-full transition-transform duration-500 ease-out flex flex-col"
        style={{ transform: `translateY(-${currentIndex * 100}vh)` }}
      >
        {segments.map((seg, idx) => {
          const isYouTube = seg.source.provider === "youtube";
          const is360 = seg.source.provider === "internal" && seg.cameraJson;
          const isActive = idx === currentIndex;
          
          return (
            <div key={seg.id} className="h-screen w-full flex-shrink-0 relative">
              {/* Video Player layer */}
              <div className="absolute inset-0 bg-black flex items-center justify-center z-0">
                {isYouTube ? (
                   // MVP YouTube Player
                   <iframe 
                      className="w-full h-full scale-[1.3] pointer-events-none"
                      src={`https://www.youtube.com/embed/${seg.source.providerSourceId}?autoplay=${isActive ? 1 : 0}&start=${Math.floor(seg.startSeconds)}&end=${Math.floor(seg.endSeconds)}&controls=0&mute=0&loop=1&playsinline=1`} 
                      frameBorder="0" 
                      allow="autoplay"
                   ></iframe>
                ) : is360 ? (
                  isActive && (
                    <ConsumerViewer360 
                      videoUrl={seg.source.url}
                      startSeconds={seg.startSeconds}
                      endSeconds={seg.endSeconds}
                      initialCameraAngles={seg.cameraJson}
                    />
                  )
                ) : (
                  // Native HTML5 Player (Fallback for 2D internal)
                  <video 
                    ref={el => { videoRefs.current[idx] = el; }}
                    src={seg.source.url} 
                    className="w-full h-full object-cover"
                    playsInline
                    loop
                    muted={false}
                  />
                )}
                {/* Dark gradient overlay for text legibility */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none z-10" />
              </div>

              {/* UI Overlay Layer */}
              <div className="absolute inset-0 z-20 flex flex-col justify-end p-6 pb-12 pointer-events-none">
                
                <div className="flex justify-between items-end">
                  {/* Left info column */}
                  <div className="flex flex-col gap-2 max-w-[80%] pointer-events-auto">
                    <span className="bg-emerald-500/20 text-emerald-400 text-xs px-2 py-1 rounded w-fit font-bold uppercase tracking-wider backdrop-blur-md">
                      {seg.concept || "Concept"}
                    </span>
                    <h2 className="text-white text-2xl font-bold leading-tight">{seg.title}</h2>
                    <span className="text-white/50 text-xs flex items-center gap-2 mt-1">
                      {seg.difficulty} • {Math.floor(seg.endSeconds - seg.startSeconds)}s
                    </span>
                  </div>

                  {/* Right action column */}
                  <div className="flex flex-col gap-6 items-center pointer-events-auto">
                    <button className="bg-black/40 backdrop-blur-md p-3 rounded-full hover:bg-white/20 transition-colors">
                      <Heart className="text-white" fill="white" size={24} />
                    </button>
                    <button className="bg-black/40 backdrop-blur-md p-3 rounded-full hover:bg-white/20 transition-colors">
                      <MessageCircle className="text-white" size={24} />
                    </button>
                    <button className="bg-black/40 backdrop-blur-md p-3 rounded-full hover:bg-white/20 transition-colors">
                      <Bookmark className="text-white" size={24} />
                    </button>
                    <button className="bg-black/40 backdrop-blur-md p-3 rounded-full hover:bg-white/20 transition-colors">
                      <Share2 className="text-white" size={24} />
                    </button>
                  </div>
                </div>

              </div>
            </div>
          );
        })}
      </div>

      {/* Navigation Controls Overlay */}
      <div className="absolute right-6 top-1/2 -translate-y-1/2 flex flex-col gap-4 z-50">
        <button 
          onClick={handlePrev}
          disabled={currentIndex === 0}
          className="bg-black/40 backdrop-blur-md p-3 rounded-full disabled:opacity-30 hover:bg-white/20 transition-colors text-white"
        >
          <ChevronUp size={24} />
        </button>
        <button 
          onClick={handleNext}
          disabled={currentIndex === segments.length - 1}
          className="bg-black/40 backdrop-blur-md p-3 rounded-full disabled:opacity-30 hover:bg-white/20 transition-colors text-white"
        >
          <ChevronDown size={24} />
        </button>
      </div>

    </div>
  );
}
