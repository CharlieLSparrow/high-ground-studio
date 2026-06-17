'use client';

import React from 'react';
import { ScrollPanel } from '../types';
import { useInteractionState } from '../InteractionStateContext';

export function PhotographyAdapter({ panel }: { panel: ScrollPanel }) {
  const { localInteractions } = useInteractionState();
  
  const interactions = localInteractions[panel.id] || panel.interactions;
  const isSelected = interactions.some(i => i.interactionType === 'SELECTION' && i.userId === 'user_current');

  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-100 dark:bg-zinc-950 p-2 md:p-6 transition-colors duration-500">
      <div className={`relative w-full max-w-4xl h-full flex items-center justify-center bg-white dark:bg-black rounded shadow-lg overflow-hidden transition-all duration-300 ${
        isSelected ? 'ring-4 ring-emerald-500 ring-offset-4 ring-offset-zinc-100 dark:ring-offset-zinc-950 scale-[0.98]' : 'ring-1 ring-black/5 dark:ring-white/5'
      }`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img 
          src={panel.content.imageUrl} 
          alt={panel.content.caption || 'Client photo'} 
          className="max-w-full max-h-full object-contain transition-transform duration-700 hover:scale-[1.02]"
        />
        
        {/* Selection Checkmark Overlay */}
        {isSelected && (
          <div className="absolute top-4 right-4 bg-emerald-500 text-white p-2 rounded-full shadow-lg z-10 animate-in fade-in zoom-in">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )}

        {/* Subtle Watermark/Overlay for photography review */}
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/30 via-transparent to-black/5" />
        <div className="absolute bottom-4 left-4 flex flex-col">
          <span className="text-white/70 text-xs font-mono drop-shadow-md">
            {panel.id}
          </span>
          <span className="text-white/40 text-[10px] uppercase tracking-widest font-bold">
            Quipsly Gallery Proof
          </span>
        </div>
      </div>
    </div>
  );
}
