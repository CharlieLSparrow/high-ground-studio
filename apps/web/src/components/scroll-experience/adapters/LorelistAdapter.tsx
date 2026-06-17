'use client';

import React from 'react';
import { ScrollPanel } from '../types';

export function LorelistAdapter({ panel }: { panel: ScrollPanel }) {
  const payload = panel.content.nodePayload || {};
  const tags = payload.tags || [];
  const author = payload.author;
  const source = payload.source;

  return (
    <div className="w-full h-full flex items-center justify-center bg-[#0a0a0c] p-6 md:p-12 relative overflow-hidden">
      {/* Cinematic subtle background gradients */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-amber-900/10 via-[#0a0a0c] to-black" />
      <div className="absolute inset-0 bg-[url('https://placehold.co/1000x1000/111/111')] bg-cover bg-center opacity-5 mix-blend-overlay" />
      
      <div className="relative max-w-4xl w-full z-10 flex flex-col">
        <div className="mb-8 flex gap-2 flex-wrap">
          {tags.map((tag: string) => (
            <span key={tag} className="px-3 py-1 bg-amber-900/20 text-amber-600/80 border border-amber-500/20 rounded font-mono text-[10px] tracking-widest uppercase">
              {tag}
            </span>
          ))}
        </div>
        
        <blockquote className="text-2xl md:text-5xl font-serif text-zinc-200 leading-relaxed md:leading-[1.4] mb-8 relative">
          <span className="absolute -left-6 md:-left-10 top-0 text-amber-500/30 text-4xl md:text-7xl font-serif leading-none select-none">"</span>
          {panel.content.text}
        </blockquote>
        
        <div className="h-px w-16 bg-amber-500/40 mb-6" />
        
        <div className="flex flex-col gap-1">
          {author && (
            <div className="text-zinc-300 font-medium text-lg tracking-wide uppercase">
              {author}
            </div>
          )}
          {source && (
            <div className="text-zinc-500 font-serif italic text-sm md:text-base">
              {source}
            </div>
          )}
        </div>

        {/* Minimal node ID reference */}
        <div className="absolute bottom-[-40px] left-0 text-zinc-800 font-mono text-[10px] tracking-widest uppercase">
          QuipLore ID: {panel.sourceId}
        </div>
      </div>
    </div>
  );
}
