import React from "react";
import type { HgoPublicEpisodePacket } from "@/lib/hgo/public-episode-packet";

export function EpisodeAudioPlayer({ packet }: { packet: HgoPublicEpisodePacket }) {
  if (!packet.media.audioUrl) {
    return null;
  }

  return (
    <section 
      className="w-full bg-zinc-900 border-t border-b border-zinc-800 py-6 px-6 lg:px-8 sticky top-0 z-50 shadow-2xl transition-all duration-300 hover:shadow-amber-500/10"
      aria-label="Episode Audio Player"
    >
      <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between space-y-4 md:space-y-0 md:space-x-8">
        <div className="flex flex-col">
          <span className="text-xs text-amber-500 font-mono uppercase tracking-widest mb-1">
            Now Playing
          </span>
          <span className="text-zinc-200 font-medium truncate max-w-xs md:max-w-md">
            {packet.title}
          </span>
        </div>
        
        <div className="flex-1 w-full flex items-center justify-end">
          <audio 
            controls 
            className="w-full max-w-md bg-zinc-800 rounded-full" 
            src={packet.media.audioUrl}
            preload="metadata"
            aria-label={`Audio player for episode: ${packet.title}`}
          />
        </div>
      </div>
    </section>
  );
}
