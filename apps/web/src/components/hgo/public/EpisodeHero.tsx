import React from "react";
import type { HgoPublicEpisodePacket } from "@/lib/hgo/public-episode-packet";

export function EpisodeHero({ packet }: { packet: HgoPublicEpisodePacket }) {
  return (
    <section className="relative w-full overflow-hidden bg-zinc-950 text-white pt-32 pb-24 px-6 lg:px-8">
      {packet.media.heroImageUrl && (
        <div 
          className="absolute inset-0 opacity-20 bg-cover bg-center blur-sm" 
          style={{ backgroundImage: `url(${packet.media.heroImageUrl})` }} 
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/80 to-transparent" />
      
      <div className="relative z-10 max-w-4xl mx-auto flex flex-col items-center text-center space-y-6">
        <div className="flex items-center space-x-3">
          <span className="text-amber-500 font-mono text-sm tracking-widest uppercase">
            {packet.hero.eyebrow || "High Ground Odyssey"}
          </span>
          <span className="text-zinc-500">•</span>
          <span className="text-zinc-400 font-mono text-sm tracking-widest uppercase">
            Episode {packet.episodeNumber}
          </span>
        </div>
        
        <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-white max-w-3xl">
          {packet.title}
        </h1>
        
        {packet.subtitle && (
          <p className="text-xl md:text-2xl text-zinc-300 font-light max-w-2xl">
            {packet.subtitle}
          </p>
        )}

        {packet.provenance && (
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-xs text-zinc-500 font-mono">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-900 border border-zinc-800 px-3 py-1 font-sans font-bold text-zinc-400">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
              Published from Quipsly/Nest
            </span>
            <span className="truncate max-w-[200px]" title={`Source Artifact Hash: ${packet.provenance.sourceArtifactHash}`}>
              Artifact {packet.provenance.sourceArtifactHash.slice(0, 8)}
            </span>
            {packet.provenance.publishedAt && (
              <>
                <span>•</span>
                <span>{new Date(packet.provenance.publishedAt).toLocaleDateString("en-US", { dateStyle: "medium" })}</span>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
