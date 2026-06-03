"use client";

import React, { useState } from 'react';
import { User, Briefcase, Heart, Flame, ShieldAlert } from 'lucide-react';

export interface PersonaData {
  id: string;
  name: string;
  avatarImageUrl?: string;
  ageRange: string;
  occupation: string;
  incomeLevel: string;
  painPointsJson: string[];
  desiresJson: string[];
  objectionsJson: string[];
}

export function PersonaCard({ persona }: { persona: PersonaData }) {
  const [isFlipped, setIsFlipped] = useState(false);

  return (
    <div 
      className="relative w-full max-w-sm h-[420px] cursor-pointer group"
      style={{ perspective: '1000px' }}
      onClick={() => setIsFlipped(!isFlipped)}
    >
      <div 
        className="w-full h-full transition-transform duration-500"
        style={{ 
          transformStyle: 'preserve-3d', 
          transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)' 
        }}
      >
        
        {/* Front of Card: Demographics */}
        <div 
          className="absolute inset-0 bg-white dark:bg-zinc-900 border-2 border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm flex flex-col items-center text-center"
          style={{ backfaceVisibility: 'hidden' }}
        >
          {persona.avatarImageUrl ? (
            <div className="w-32 h-32 mb-4 relative rounded-full overflow-hidden shadow-md border-4 border-indigo-100 dark:border-indigo-900/30">
              <img src={persona.avatarImageUrl} alt={persona.name} className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="w-24 h-24 bg-indigo-100 dark:bg-indigo-900/50 rounded-full flex items-center justify-center mb-4 border-4 border-indigo-50 dark:border-indigo-900/20">
              <User className="w-10 h-10 text-indigo-500" />
            </div>
          )}
          <h3 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{persona.name}</h3>
          
          <div className="mt-6 w-full space-y-4">
            <div className="flex items-center justify-between text-sm bg-zinc-50 dark:bg-zinc-800/50 p-3 rounded-lg">
              <div className="flex items-center text-zinc-500"><User className="w-4 h-4 mr-2"/> Age</div>
              <div className="font-medium text-zinc-900 dark:text-zinc-200">{persona.ageRange}</div>
            </div>
            <div className="flex items-center justify-between text-sm bg-zinc-50 dark:bg-zinc-800/50 p-3 rounded-lg">
              <div className="flex items-center text-zinc-500"><Briefcase className="w-4 h-4 mr-2"/> Occupation</div>
              <div className="font-medium text-zinc-900 dark:text-zinc-200">{persona.occupation}</div>
            </div>
            <div className="flex items-center justify-between text-sm bg-zinc-50 dark:bg-zinc-800/50 p-3 rounded-lg">
              <div className="flex items-center text-zinc-500"><Heart className="w-4 h-4 mr-2"/> Income</div>
              <div className="font-medium text-zinc-900 dark:text-zinc-200">{persona.incomeLevel}</div>
            </div>
          </div>
          <div className="mt-auto text-xs font-semibold text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 px-3 py-1 rounded-full uppercase tracking-wider hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors">
            Click to view Psyche
          </div>
        </div>

        {/* Back of Card: Psychographics */}
        <div 
          className="absolute inset-0 bg-zinc-900 dark:bg-zinc-950 border-2 border-indigo-500 rounded-2xl p-6 shadow-lg flex flex-col text-left overflow-hidden"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
          <div className="flex justify-between items-center mb-4 pb-3 border-b border-zinc-800">
            <h3 className="text-lg font-bold text-white">{persona.name}</h3>
            <span className="text-xs font-mono text-indigo-400 bg-indigo-900/30 px-2 py-1 rounded">AI PROFILE</span>
          </div>

          <div className="flex-1 overflow-y-auto pr-2 space-y-4">
            <div>
              <div className="flex items-center text-red-400 text-xs font-bold mb-2 uppercase tracking-wider">
                <Flame className="w-3 h-3 mr-1" /> Pain Points
              </div>
              <ul className="text-sm text-zinc-300 space-y-1 pl-4 list-disc marker:text-red-500/50">
                {persona.painPointsJson.map((p, i) => <li key={i}>{p}</li>)}
              </ul>
            </div>

            <div>
              <div className="flex items-center text-emerald-400 text-xs font-bold mb-2 uppercase tracking-wider">
                <Heart className="w-3 h-3 mr-1" /> Core Desires
              </div>
              <ul className="text-sm text-zinc-300 space-y-1 pl-4 list-disc marker:text-emerald-500/50">
                {persona.desiresJson.map((d, i) => <li key={i}>{d}</li>)}
              </ul>
            </div>

            <div>
              <div className="flex items-center text-amber-400 text-xs font-bold mb-2 uppercase tracking-wider">
                <ShieldAlert className="w-3 h-3 mr-1" /> Buying Objections
              </div>
              <ul className="text-sm text-zinc-300 space-y-1 pl-4 list-disc marker:text-amber-500/50">
                {persona.objectionsJson.map((o, i) => <li key={i}>{o}</li>)}
              </ul>
            </div>
          </div>
          
          <div className="mt-4 pt-3 border-t border-zinc-800 text-xs text-center text-zinc-500 font-medium hover:text-zinc-300 transition-colors">
            Tap to return
          </div>
        </div>
      </div>
    </div>
  );
}
