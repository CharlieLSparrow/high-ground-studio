'use client';

import React from 'react';
import { ScrollPanel } from '../types';

export function LorelistAdapter({ panel }: { panel: ScrollPanel }) {
  const tags = panel.content.nodePayload?.tags || [];

  return (
    <div className="w-full h-full flex items-center justify-center bg-[url('https://placehold.co/1000x1000/111/111')] bg-cover bg-center p-6 md:p-12">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      
      <div className="relative max-w-3xl w-full z-10 flex flex-col">
        <div className="mb-8 flex gap-2 flex-wrap">
          {tags.map((tag: string) => (
            <span key={tag} className="px-3 py-1 bg-amber-900/30 text-amber-500 border border-amber-500/20 rounded font-mono text-xs tracking-widest uppercase shadow-[0_0_15px_rgba(245,158,11,0.15)]">
              {tag}
            </span>
          ))}
        </div>
        
        <blockquote className="text-3xl md:text-5xl font-serif text-zinc-100 leading-tight md:leading-tight mb-8">
          {panel.content.text}
        </blockquote>
        
        <div className="h-px w-24 bg-amber-500/50 mb-6" />
        
        <div className="text-zinc-500 font-mono text-sm tracking-widest uppercase">
          Quipsly Node ID: {panel.sourceId}
        </div>
      </div>
    </div>
  );
}
