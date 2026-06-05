import React from "react";
import type { HgoPublicEpisodePacket } from "@/lib/hgo/public-episode-packet";

export function EpisodeEssay({ packet }: { packet: HgoPublicEpisodePacket }) {
  if (!packet.essayVersion) {
    return null;
  }

  return (
    <section className="py-16 px-6 lg:px-8 max-w-3xl mx-auto">
      <div className="flex items-center space-x-4 mb-10 border-b border-zinc-800 pb-4">
        <h2 className="text-3xl font-semibold text-zinc-100 tracking-tight">
          Read the Episode
        </h2>
        <span className="text-xs font-mono uppercase tracking-widest text-zinc-500 bg-zinc-900 px-2 py-1 rounded">
          Transcript Excerpt
        </span>
      </div>

      {/* Since we don't have a full MDX renderer configured for raw string parsing here without Fumadocs setup, 
          we will render it inside a prose container. If it's pure MDX we might need next-mdx-remote,
          but for the sake of this component we will assume it's pre-rendered HTML or plain text fallback. */}
      <article className="prose prose-invert prose-zinc max-w-none leading-relaxed text-zinc-300">
        <div style={{ whiteSpace: "pre-wrap" }}>
          {packet.essayVersion}
        </div>
      </article>
    </section>
  );
}
