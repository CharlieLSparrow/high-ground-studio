'use client';

import React, { useState } from 'react';
import { ScrollPanel } from '../types';

export function CourseAdapter({ panel }: { panel: ScrollPanel }) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

  if (panel.type === 'QUIZ' && panel.content.quizData) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-indigo-950 p-6">
        <div className="max-w-xl w-full bg-indigo-900/50 p-8 rounded-2xl border border-indigo-500/30 backdrop-blur-sm shadow-2xl">
          <div className="inline-block px-3 py-1 bg-indigo-500/20 text-indigo-300 text-xs font-bold rounded-full mb-6 uppercase tracking-wider">
            Knowledge Check
          </div>
          <h2 className="text-2xl font-semibold text-white mb-8 leading-relaxed">
            {panel.content.quizData.question}
          </h2>
          <div className="flex flex-col gap-3">
            {panel.content.quizData.options.map((opt: string) => (
              <button 
                key={opt}
                onClick={() => setSelectedOption(opt)}
                className={`w-full text-left px-6 py-4 rounded-xl border transition-all ${
                  selectedOption === opt 
                    ? 'bg-indigo-600 border-indigo-400 text-white shadow-inner' 
                    : 'bg-zinc-900/50 border-zinc-700 text-zinc-300 hover:bg-zinc-800'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (panel.type === 'TEXT') {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-50 p-6 dark:bg-zinc-900">
        <div className="max-w-2xl w-full p-8 md:p-12 bg-white dark:bg-zinc-950 rounded-2xl shadow-xl prose prose-lg dark:prose-invert">
          <p className="text-xl leading-loose">{panel.content.text}</p>
        </div>
      </div>
    );
  }

  // Fallback for MEDIA inside Course
  return (
    <div className="w-full h-full flex items-center justify-center bg-black p-4">
      <div className="relative w-full max-w-5xl aspect-video bg-zinc-900 rounded-xl overflow-hidden shadow-2xl ring-1 ring-zinc-800 flex items-center justify-center">
        {panel.content.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={panel.content.imageUrl} alt="Video poster" className="w-full h-full object-cover opacity-80" />
        ) : null}
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
           <button className="w-20 h-20 bg-indigo-600/90 rounded-full flex items-center justify-center hover:scale-110 transition-transform shadow-lg shadow-indigo-500/50">
             <svg className="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 20 20"><path d="M4 4l12 6-12 6z" /></svg>
           </button>
        </div>
      </div>
    </div>
  );
}
