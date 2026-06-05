'use client';

import React from 'react';
import { ScrollPanel } from '../types';

export function StoryboardAdapter({ panel }: { panel: ScrollPanel }) {
  return (
    <div className="w-full h-full flex items-center justify-center bg-black p-4 md:p-8">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img 
        src={panel.content.imageUrl} 
        alt={panel.content.caption || 'Storyboard frame'} 
        className="max-w-full max-h-[80vh] object-contain shadow-2xl rounded-sm ring-1 ring-zinc-800"
      />
    </div>
  );
}
