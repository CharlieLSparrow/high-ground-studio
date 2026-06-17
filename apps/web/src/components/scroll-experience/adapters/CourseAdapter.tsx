'use client';

import React, { useState } from 'react';
import { ScrollPanel } from '../types';

export function CourseAdapter({ panel }: { panel: ScrollPanel }) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

  if (panel.type === 'QUIZ' && panel.content.quizData) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-indigo-950 p-6 relative overflow-hidden">
        {/* Subtle Background Pattern */}
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-300 via-indigo-900 to-black pointer-events-none" />
        
        <div className="max-w-xl w-full bg-indigo-900/40 p-8 rounded-3xl border border-indigo-500/20 backdrop-blur-md shadow-2xl z-10 relative">
          <div className="absolute -top-4 -right-4 w-24 h-24 bg-indigo-500/20 rounded-full blur-2xl" />
          
          <div className="inline-block px-4 py-1.5 bg-indigo-500/20 text-indigo-300 text-xs font-bold rounded-full mb-8 uppercase tracking-widest border border-indigo-500/30">
            Knowledge Check
          </div>
          
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-10 leading-snug tracking-tight">
            {panel.content.quizData.question}
          </h2>
          
          <div className="flex flex-col gap-4">
            {panel.content.quizData.options.map((opt: string) => (
              <button 
                key={opt}
                onClick={() => setSelectedOption(opt)}
                className={`w-full text-left px-6 py-5 rounded-2xl border-2 transition-all duration-300 relative overflow-hidden group ${
                  selectedOption === opt 
                    ? 'bg-indigo-600 border-indigo-400 text-white shadow-[0_0_30px_rgba(99,102,241,0.3)]' 
                    : 'bg-zinc-900/50 border-zinc-700 text-zinc-300 hover:border-indigo-500/50 hover:bg-zinc-800'
                }`}
              >
                {selectedOption === opt && (
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] animate-[shimmer_1.5s_infinite]" />
                )}
                <span className="relative z-10 font-medium text-lg">{opt}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (panel.type === 'TEXT') {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-[#F9F9FB] dark:bg-[#09090B] p-6 relative">
        <div className="max-w-3xl w-full h-full md:h-auto overflow-y-auto p-8 md:p-14 bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 prose prose-lg md:prose-xl dark:prose-invert">
          <p className="font-serif leading-loose tracking-wide text-zinc-800 dark:text-zinc-200">
            {panel.content.text}
          </p>
        </div>
      </div>
    );
  }

  // Fallback for MEDIA inside Course
  return (
    <div className="w-full h-full flex items-center justify-center bg-black p-4">
      <div className="relative w-full max-w-5xl aspect-video bg-zinc-900 rounded-2xl overflow-hidden shadow-2xl ring-1 ring-zinc-800 flex items-center justify-center group cursor-pointer">
        {panel.content.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={panel.content.imageUrl} alt="Video poster" className="w-full h-full object-cover opacity-80 group-hover:scale-105 transition-transform duration-700" />
        ) : null}
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 group-hover:bg-black/20 transition-colors">
           <button className="w-24 h-24 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center group-hover:scale-110 group-hover:bg-indigo-600 transition-all shadow-2xl border border-white/20">
             <svg className="w-10 h-10 text-white ml-2" fill="currentColor" viewBox="0 0 20 20"><path d="M4 4l12 6-12 6z" /></svg>
           </button>
        </div>
      </div>
    </div>
  );
}
