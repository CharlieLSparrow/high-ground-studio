'use client';

import React from 'react';
import { ScrollPanel } from '../types';

export function PhotographyAdapter({ panel }: { panel: ScrollPanel }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-100 dark:bg-zinc-950 p-2 md:p-6">
      <div className="relative w-full max-w-4xl h-full flex items-center justify-center bg-white dark:bg-black rounded shadow-lg overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img 
          src={panel.content.imageUrl} 
          alt={panel.content.caption || 'Client photo'} 
          className="max-w-full max-h-full object-cover transition-transform duration-700 hover:scale-105"
        />
        
        {/* Subtle Watermark/Overlay for photography review */}
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/20 via-transparent to-black/5" />
        <div className="absolute bottom-4 left-4 text-white/50 text-xs font-mono drop-shadow-md">
          {panel.id} - DRAFT
        </div>
      </div>
    </div>
  );
}
