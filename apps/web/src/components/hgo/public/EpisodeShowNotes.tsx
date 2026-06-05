import React from "react";
import type { HgoPublicEpisodePacket } from "@/lib/hgo/public-episode-packet";

export function EpisodeShowNotes({ packet }: { packet: HgoPublicEpisodePacket }) {
  if (!packet.showNotes.beats.length && !packet.showNotes.voiceCards.length) {
    return null;
  }

  return (
    <section className="py-16 px-6 lg:px-8 max-w-4xl mx-auto">
      <h2 className="text-3xl font-semibold text-zinc-100 mb-8 tracking-tight border-b border-zinc-800 pb-4">
        Show Notes
      </h2>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
        <div className="md:col-span-2 space-y-8">
          {packet.showNotes.beats.length > 0 && (
            <div>
              <h3 className="text-lg font-medium text-zinc-400 uppercase tracking-widest mb-6">
                Episode Beats
              </h3>
              <div className="space-y-6">
                {packet.showNotes.beats.map((beat, idx) => (
                  <div key={idx} className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800/50">
                    <div className="flex items-baseline justify-between mb-2">
                      <h4 className="text-xl font-medium text-zinc-200">{beat.title}</h4>
                      {beat.timingHint && (
                        <span className="text-sm font-mono text-zinc-500 bg-zinc-800/50 px-2 py-1 rounded">
                          {beat.timingHint}
                        </span>
                      )}
                    </div>
                    <p className="text-zinc-400 leading-relaxed">{beat.summary}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="md:col-span-1">
          {packet.showNotes.voiceCards.length > 0 && (
            <div className="sticky top-8">
              <h3 className="text-lg font-medium text-zinc-400 uppercase tracking-widest mb-6">
                Voices
              </h3>
              <div className="space-y-4">
                {packet.showNotes.voiceCards.map((vc, idx) => (
                  <div key={idx} className="bg-zinc-900 p-5 rounded-2xl border border-zinc-800">
                    <div className="flex items-center space-x-3 mb-3">
                      <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-sm font-bold text-zinc-300">
                        {vc.speaker.charAt(0)}
                      </div>
                      <h4 className="text-zinc-200 font-medium">{vc.speaker}</h4>
                    </div>
                    <p className="text-sm text-zinc-400 leading-relaxed">{vc.summary}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
