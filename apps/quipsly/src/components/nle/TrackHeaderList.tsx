'use client';

import React from 'react';
import { Volume2, VolumeX, Eye, EyeOff, Lock, Unlock } from 'lucide-react';

// Hardcoded for now. In reality, we'd fetch these from Prisma/Zustand store.
const MOCK_TRACKS = [
  { id: 't1', name: 'V1', type: 'VIDEO', muted: false, solo: false, locked: false },
  { id: 't2', name: 'V2', type: 'VIDEO', muted: true, solo: false, locked: true },
  { id: 't3', name: 'A1', type: 'AUDIO', muted: false, solo: false, locked: false },
];

export function TrackHeaderList({ projectId }: { projectId: string }) {
  return (
    <div className="flex flex-col">
      {/* Time ruler placeholder header */}
      <div className="h-8 border-b border-[#333333] bg-[#1e1e1e] flex items-center px-4 sticky top-0 z-10 shadow-sm">
        <span className="text-[10px] text-neutral-500 font-medium">TRACKS</span>
      </div>

      <div className="flex flex-col py-2 gap-1 px-1">
        {MOCK_TRACKS.map(track => (
          <div 
            key={track.id} 
            className="h-24 bg-[#2a2a2b] border border-[#3c3c3c] rounded-md flex flex-col p-2 gap-2 text-neutral-300 relative group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold truncate pr-2">{track.name}</span>
              
              <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                {track.type === 'VIDEO' ? (
                  <button className="p-1 hover:bg-neutral-600 rounded">
                    {track.muted ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                ) : (
                  <button className="p-1 hover:bg-neutral-600 rounded">
                    {track.muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
                  </button>
                )}
                <button className="p-1 hover:bg-neutral-600 rounded">
                  {track.locked ? <Lock size={12} className="text-rose-400" /> : <Unlock size={12} />}
                </button>
              </div>
            </div>
            
            <div className="flex gap-1 mt-auto">
              {track.type === 'AUDIO' && (
                <div className="w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden flex relative">
                  <div className="h-full bg-emerald-500" style={{ width: '60%' }} />
                  <div className="h-full bg-yellow-400" style={{ width: '20%' }} />
                  <div className="h-full bg-rose-500" style={{ width: '5%' }} />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
