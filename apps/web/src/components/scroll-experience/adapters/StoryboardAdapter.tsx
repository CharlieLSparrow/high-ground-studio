'use client';

import React from 'react';
import { ScrollPanel } from '../types';

export function StoryboardAdapter({ panel }: { panel: ScrollPanel }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-black p-4 md:p-8 overflow-y-auto">
      {panel.content.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img 
          src={panel.content.imageUrl} 
          alt={panel.content.caption || 'Storyboard frame'} 
          className="max-w-full max-h-[60vh] object-contain shadow-2xl rounded-sm ring-1 ring-zinc-800 shrink-0"
        />
      )}
      <div className="mt-6 w-full max-w-2xl flex flex-col items-center text-center px-4 shrink-0">
        {panel.content.caption && (
          <p className="text-zinc-500 text-xs uppercase tracking-widest font-semibold mb-2">
            {panel.content.caption}
          </p>
        )}
        {panel.content.text && (
          <p className="text-zinc-300 text-sm md:text-base leading-relaxed">
            {panel.content.text}
          </p>
        )}
      </div>
    </div>
  );
}
