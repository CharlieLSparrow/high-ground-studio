'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { updateStoryboardFrame } from '../actions';
import { useDebouncedCallback } from './hooks';
import { Columns, LayoutList } from 'lucide-react';

export function ComicRenderer({ frames }: { frames: any[] }) {
  const [layoutMode, setLayoutMode] = useState<'GRID' | 'WEBTOON'>('GRID');

  const debouncedUpdateFrame = useDebouncedCallback((id: string, data: any) => {
    updateStoryboardFrame(id, data);
  }, 500);

  return (
    <div className="max-w-5xl mx-auto bg-zinc-950 p-6 sm:p-10 shadow-2xl rounded-xl border border-zinc-800">

      {/* Comic Builder Toolbar */}
      <div className="flex justify-between items-center mb-8 border-b border-zinc-800 pb-4">
        <div>
          <h3 className="text-xl font-black tracking-widest text-zinc-100 uppercase">Comic Builder</h3>
          <p className="text-xs text-zinc-500 mt-1">Author dialogue and preview comic flow interactively.</p>
        </div>
        <div className="flex gap-2 bg-zinc-900 p-1 rounded-lg border border-zinc-800">
          <button
            onClick={() => setLayoutMode('GRID')}
            className={`flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded transition-colors ${layoutMode === 'GRID' ? 'bg-indigo-600 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            <Columns className="w-4 h-4" /> Graphic Novel
          </button>
          <button
            onClick={() => setLayoutMode('WEBTOON')}
            className={`flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded transition-colors ${layoutMode === 'WEBTOON' ? 'bg-indigo-600 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            <LayoutList className="w-4 h-4" /> Webtoon
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className={layoutMode === 'GRID'
        ? "grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-5 auto-rows-[280px]"
        : "flex flex-col gap-0 w-full max-w-lg mx-auto"}>

        {frames?.map((frame: any, index: number) => {
          // Add some dynamic masonry feel for Grid mode
          const isHeroPanel = layoutMode === 'GRID' && index % 5 === 0;

          return (
            <div
              key={frame.id}
              className={`relative border-[5px] border-zinc-100 bg-zinc-900 overflow-hidden group focus-within:ring-4 focus-within:ring-indigo-500 transition-all ${isHeroPanel ? 'col-span-2 row-span-2' : ''} ${layoutMode === 'WEBTOON' ? 'aspect-[4/5] border-t-0 first:border-t-[5px]' : ''}`}
            >
              {frame.imageUrl ? (
                <Image src={frame.imageUrl} alt={`Comic Panel ${frame.frameNumber}`} fill className="object-cover transition-transform duration-1000 group-hover:scale-105" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-zinc-800">
                  <span className="text-zinc-700 font-bold uppercase rotate-[-15deg] tracking-widest">Sketch</span>
                </div>
              )}

              {/* Interactive Dialogue Bubble Authoring */}
              <div className="absolute top-4 left-4 right-4 z-10 opacity-70 focus-within:opacity-100 hover:opacity-100 transition-opacity">
                <textarea
                  defaultValue={frame.dialogue || ''}
                  placeholder="Type dialogue..."
                  onChange={(e) => debouncedUpdateFrame(frame.id, { dialogue: e.target.value })}
                  className="w-full max-w-[85%] bg-white/95 backdrop-blur-sm border-4 border-black rounded-3xl rounded-bl-sm p-3 shadow-[4px_4px_0px_rgba(0,0,0,1)] text-black font-semibold text-sm md:text-base leading-tight resize-none focus:outline-none focus:ring-0 placeholder:text-zinc-400 font-comic-sans"
                  rows={3}
                />
              </div>

              {/* Panel Number Badge */}
              <div className="absolute bottom-2 right-2 bg-black/80 backdrop-blur px-2 py-1 rounded text-[10px] font-black text-white uppercase tracking-widest z-10 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                {frame.frameNumber}
              </div>
            </div>
          );
        })}

        {(!frames || frames.length === 0) && (
          <div className="col-span-full flex flex-col items-center justify-center py-20 text-zinc-500 border-2 border-dashed border-zinc-800 rounded-xl">
            <LayoutList className="w-12 h-12 mb-4 opacity-50" />
            <p className="font-bold text-sm">No comic panels yet</p>
            <p className="text-xs">Add frames from the Grid mode first.</p>
          </div>
        )}
      </div>
    </div>
  );
}
