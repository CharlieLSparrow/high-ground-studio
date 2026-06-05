import React from "react";
import type { HgoPublicEpisodePacket } from "@/lib/hgo/public-episode-packet";

export function EpisodeQuotes({ packet }: { packet: HgoPublicEpisodePacket }) {
  if (!packet.quotes.length) {
    return null;
  }

  return (
    <section className="py-16 px-6 lg:px-8 max-w-4xl mx-auto bg-zinc-950">
      <h2 className="text-3xl font-semibold text-zinc-100 mb-8 tracking-tight border-b border-zinc-800 pb-4">
        Featured Quotes
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {packet.quotes.map((quote, idx) => (
          <figure key={idx} className="flex flex-col justify-between bg-zinc-900/80 p-8 rounded-2xl border border-zinc-800/80 hover:border-amber-500/30 transition-colors">
            <blockquote className="text-lg text-zinc-300 italic leading-relaxed mb-6">
              "{quote.text}"
            </blockquote>
            <figcaption className="text-sm font-medium text-amber-500 flex items-center space-x-2">
              <span className="w-4 h-[1px] bg-amber-500/50 inline-block"></span>
              <span>{quote.attribution}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
