'use client';

import React, { useState, useEffect } from 'react';
import ScrollExperienceEngine from '@/components/scroll-experience/ScrollExperienceEngine';
import { generateMockExperience } from '@/components/scroll-experience/mockDataGenerator';
import { ExperienceType } from '@/components/scroll-experience/types';

export default function MockReviewPage() {
  const [mounted, setMounted] = useState(false);
  const [experienceType, setExperienceType] = useState<ExperienceType>('STORYBOARD');
  const [experience, setExperience] = useState(() => generateMockExperience('STORYBOARD', 5, 8));

  // Avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  const handleModeSwitch = (type: ExperienceType) => {
    setExperienceType(type);
    setExperience(generateMockExperience(type, 5, 8));
  };

  if (!mounted) return <div className="min-h-screen bg-black" />;

  return (
    <div className="relative w-full h-screen bg-black">
      {/* Dev Tool Switcher (Hidden in prod) */}
      <div className="absolute top-16 right-4 z-50 flex flex-col gap-2 bg-black/80 backdrop-blur-md p-4 rounded-xl border border-white/10 shadow-2xl">
        <h3 className="text-white text-xs font-bold uppercase tracking-wider mb-2 opacity-50">Simulator Mode</h3>
        {(['STORYBOARD', 'COURSE', 'PHOTOGRAPHY', 'LORELIST'] as ExperienceType[]).map(type => (
          <button
            key={type}
            onClick={() => handleModeSwitch(type)}
            className={`px-4 py-2 text-xs font-bold rounded text-left transition-colors ${
              experienceType === type ? 'bg-indigo-600 text-white' : 'bg-white/5 text-zinc-400 hover:bg-white/10'
            }`}
          >
            {type}
          </button>
        ))}
      </div>

      <ScrollExperienceEngine experience={experience} mode="preview" />
    </div>
  );
}
