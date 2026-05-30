"use client";

import { useState, useRef, useEffect } from "react";
import { Play, Pause, Volume2, FastForward, RotateCcw, Download, Disc } from "lucide-react";

interface AudioDeckProps {
  title: string;
  episodeNumber?: number;
  season?: number;
  audioUrl: string;
  durationSeconds: number;
}

export default function AudioDeck({ title, episodeNumber, season, audioUrl, durationSeconds }: AudioDeckProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationSeconds);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [volume, setVolume] = useState(0.8);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(e => console.log("Play failed", e));
      setIsPlaying(true);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const skipTime = (amount: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(0, Math.min(duration, audioRef.current.currentTime + amount));
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = Math.floor(secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-6 md:p-8 backdrop-blur-md shadow-2xl relative overflow-hidden mb-12">
      
      {/* Dynamic Background Glow */}
      <div className="absolute top-0 right-10 w-48 h-32 bg-amber-500/10 blur-[60px] pointer-events-none" />
      
      <audio 
        ref={audioRef}
        src={audioUrl}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => setIsPlaying(false)}
      />

      <div className="flex flex-col md:flex-row items-center justify-between gap-6">
        
        {/* Episode branding */}
        <div className="flex items-center gap-4 min-w-0 w-full md:w-auto">
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shrink-0 shadow-lg ring-4 ring-white/5 animate-pulse">
            <Disc className="h-8 w-8 text-white" />
          </div>
          <div className="min-w-0">
            <span className="text-xs font-mono tracking-widest text-amber-500 uppercase font-bold">
              {season ? `Season ${season}` : ""} {episodeNumber ? `• Episode ${episodeNumber}` : ""}
            </span>
            <h3 className="font-bold text-xl md:text-2xl text-white truncate mt-1">{title}</h3>
          </div>
        </div>

        {/* Action button */}
        <a 
          href={audioUrl}
          download
          className="flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 transition-all px-4 py-2 text-xs font-bold text-zinc-300 hover:text-white shrink-0 self-end md:self-center"
        >
          <Download className="h-3.5 w-3.5" />
          Download Episode
        </a>

      </div>

      {/* Progress Timeline Seeking Bar */}
      <div className="mt-8">
        <div className="relative h-2 bg-zinc-800 rounded-full overflow-hidden cursor-pointer" onClick={(e) => {
          if (audioRef.current) {
            const rect = e.currentTarget.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const width = rect.width;
            audioRef.current.currentTime = (clickX / width) * duration;
          }
        }}>
          <div 
            className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full transition-all duration-75 relative" 
            style={{ width: `${progressPercent}%` }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full shadow-lg ring-2 ring-amber-500 scale-0 hover:scale-100 transition-all pointer-events-none" />
          </div>
        </div>
        <div className="flex justify-between text-xs text-zinc-500 font-mono mt-2 select-none">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Playback Controls & Audio adjustments */}
      <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-6 border-t border-white/5 pt-6">
        
        {/* Play Skip Section */}
        <div className="flex items-center gap-6">
          <button 
            onClick={() => skipTime(-15)}
            className="text-zinc-400 hover:text-white p-2 rounded-full hover:bg-white/5 transition-all"
            title="Rewind 15s"
          >
            <RotateCcw className="h-5 w-5" />
          </button>
          
          <button 
            onClick={togglePlay}
            className="h-14 w-14 rounded-full bg-white text-black hover:scale-105 transition-all flex items-center justify-center shadow-xl shadow-amber-500/10 active:scale-95"
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <Pause className="h-6 w-6 text-black fill-black" /> : <Play className="h-6 w-6 text-black fill-black ml-1" />}
          </button>

          <button 
            onClick={() => skipTime(15)}
            className="text-zinc-400 hover:text-white p-2 rounded-full hover:bg-white/5 transition-all"
            title="Forward 15s"
          >
            <FastForward className="h-5 w-5" />
          </button>
        </div>

        {/* Speed Adjustment & Volume */}
        <div className="flex items-center gap-8 w-full sm:w-auto justify-end">
          
          {/* Speed Toggle */}
          <div className="flex items-center gap-1.5 bg-black/35 p-1 rounded-full border border-white/5">
            {[1, 1.25, 1.5, 2].map((rate) => (
              <button
                key={rate}
                onClick={() => setPlaybackRate(rate)}
                className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
                  playbackRate === rate ? "bg-amber-500 text-black shadow-md" : "text-zinc-400 hover:text-white"
                }`}
              >
                {rate}x
              </button>
            ))}
          </div>

          {/* Volume Control */}
          <div className="flex items-center gap-3 shrink-0 select-none">
            <Volume2 className="h-4 w-4 text-zinc-400" />
            <input 
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="w-20 accent-amber-500 bg-zinc-800 rounded-lg cursor-pointer h-1"
            />
          </div>

        </div>

      </div>

    </div>
  );
}
