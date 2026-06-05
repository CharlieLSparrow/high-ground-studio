'use client';

import React, { useState } from 'react';

/**
 * MOCK DATA
 * Emulates a Storyboard / Media Bin presentation.
 */
const MOCK_EXPERIENCE = {
  id: 'exp_1',
  title: 'Episode 1: The Awakening - Storyboard Review',
  groups: [
    {
      id: 'grp_1',
      title: 'Scene 1: Introduction',
      panels: [
        { id: 'pnl_1', imageUrl: 'https://placehold.co/600x400/111/fff?text=Scene+1+Shot+1', caption: 'Wide shot of the city.' },
        { id: 'pnl_2', imageUrl: 'https://placehold.co/600x400/222/fff?text=Scene+1+Shot+2', caption: 'Pan down to the streets.' },
      ]
    },
    {
      id: 'grp_2',
      title: 'Scene 2: The Meeting',
      panels: [
        { id: 'pnl_3', imageUrl: 'https://placehold.co/600x400/333/fff?text=Scene+2+Shot+1', caption: 'Close up on protagonist.' },
        { id: 'pnl_4', imageUrl: 'https://placehold.co/600x400/444/fff?text=Scene+2+Shot+2', caption: 'Reverse shot of the antagonist.' },
        { id: 'pnl_5', imageUrl: 'https://placehold.co/600x400/555/fff?text=Scene+2+Shot+3', caption: 'Action beat.' },
      ]
    }
  ]
};

export function ScrollExperienceMVP() {
  const [activeGroupIndex, setActiveGroupIndex] = useState(0);

  // Vertical scroll handler (stub for gesture snap logic)
  const handleVerticalScroll = (e: React.UIEvent<HTMLDivElement>) => {
    // In a real implementation, we use IntersectionObserver or CSS scroll-snap
    // to detect the active group and update navigation indicators.
  };

  return (
    <div className="relative w-full h-screen bg-black text-white overflow-hidden flex flex-col font-sans">
      {/* Header */}
      <header className="absolute top-0 w-full p-4 bg-gradient-to-b from-black/80 to-transparent z-10">
        <h1 className="text-lg font-bold">{MOCK_EXPERIENCE.title}</h1>
        <p className="text-sm text-gray-300 opacity-80">Swipe up/down for scenes. Swipe left/right for shots.</p>
      </header>

      {/* Vertical Container (Groups) */}
      <div 
        className="flex-1 w-full overflow-y-auto snap-y snap-mandatory hide-scrollbar"
        onScroll={handleVerticalScroll}
      >
        {MOCK_EXPERIENCE.groups.map((group, gIdx) => (
          <ScrollGroup key={group.id} group={group} index={gIdx} />
        ))}
      </div>
    </div>
  );
}

function ScrollGroup({ group, index }: { group: any, index: number }) {
  return (
    <div className="w-full h-screen snap-start snap-always relative flex items-center justify-center">
      {/* Horizontal Container (Panels) */}
      <div className="w-full h-full overflow-x-auto snap-x snap-mandatory flex hide-scrollbar">
        {group.panels.map((panel: any) => (
          <ScrollPanel key={panel.id} panel={panel} groupTitle={group.title} />
        ))}
      </div>
      
      {/* Group Label Overlay (Optional) */}
      <div className="absolute top-16 left-4 bg-black/50 px-2 py-1 rounded text-xs text-gray-300 pointer-events-none">
        {group.title}
      </div>
    </div>
  );
}

function ScrollPanel({ panel, groupTitle }: { panel: any, groupTitle: string }) {
  const [isFavorited, setIsFavorited] = useState(false);
  const [showComments, setShowComments] = useState(false);

  return (
    <div className="min-w-full h-full snap-center snap-always flex flex-col relative bg-zinc-950">
      
      {/* Media Display */}
      <div className="flex-1 flex items-center justify-center p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img 
          src={panel.imageUrl} 
          alt={panel.caption} 
          className="max-w-full max-h-[70vh] object-contain rounded shadow-2xl" 
        />
      </div>

      {/* Caption & Interaction Bar Container */}
      <div className="w-full bg-zinc-900 p-4 pb-8 border-t border-zinc-800 flex flex-col gap-4">
        <div className="text-sm md:text-base text-gray-200">
          {panel.caption}
        </div>

        {/* Interaction Bar */}
        <div className="flex items-center justify-between mt-auto">
          <div className="flex gap-4">
            <button 
              onClick={() => setIsFavorited(!isFavorited)}
              className={`p-2 rounded-full transition-colors ${isFavorited ? 'bg-red-500/20 text-red-500' : 'bg-white/10 text-white'}`}
            >
              ♥ {isFavorited ? 'Saved' : 'Favorite'}
            </button>
            <button 
              onClick={() => setShowComments(!showComments)}
              className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors"
            >
              💬 Comment
            </button>
          </div>
          
          <button className="p-2 bg-green-500/20 text-green-400 rounded-full hover:bg-green-500/30 transition-colors">
            ✓ Approve Frame
          </button>
        </div>
      </div>

      {/* Mock Comment Drawer */}
      {showComments && (
        <div className="absolute inset-0 bg-black/90 z-20 flex flex-col p-4 animate-in fade-in slide-in-from-bottom-10">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold">Comments on {panel.id}</h3>
            <button onClick={() => setShowComments(false)} className="text-gray-400">Close ✕</button>
          </div>
          <div className="flex-1 flex items-center justify-center text-gray-500">
            No comments yet.
          </div>
          <input 
            type="text" 
            placeholder="Add a comment..." 
            className="w-full bg-zinc-800 rounded p-3 text-white border-none outline-none"
          />
        </div>
      )}
    </div>
  );
}
