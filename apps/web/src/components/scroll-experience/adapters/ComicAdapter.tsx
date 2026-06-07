'use client';

import React, { useEffect, useState } from 'react';
import { ScrollPanel } from '../types';

export function ComicAdapter({ panel }: { panel: ScrollPanel }) {
  const [isAnimating, setIsAnimating] = useState(false);

  // Trigger entrance animation on mount or panel change
  useEffect(() => {
    setIsAnimating(false);
    // Slight delay to allow DOM to reset animation state
    const timer = setTimeout(() => setIsAnimating(true), 50);
    return () => clearTimeout(timer);
  }, [panel.id]);

  // Determine a subtle pan/zoom effect based on panel order to give variation
  const getPanDirection = (order: number) => {
    const mods = order % 4;
    switch (mods) {
      case 0: return 'animate-pan-right-zoom';
      case 1: return 'animate-pan-left-zoom';
      case 2: return 'animate-pan-up-zoom';
      case 3: return 'animate-pan-down-zoom';
      default: return 'animate-slow-zoom';
    }
  };

  return (
    <div className="w-full h-full relative bg-black overflow-hidden flex flex-col justify-end">
      {/* Background Graphic with Dynamic Pan/Zoom */}
      {panel.content.imageUrl && (
        <div className="absolute inset-0 z-0">
          <div
            className={`w-full h-full bg-center bg-cover bg-no-repeat transition-transform duration-[15000ms] ease-linear ${isAnimating ? getPanDirection(panel.order) : 'scale-100'}`}
            style={{ backgroundImage: `url(${panel.content.imageUrl})` }}
          />
        </div>
      )}

      {/* Dark gradient overlay to ensure text legibility at the bottom */}
      <div className="absolute inset-0 z-10 bg-gradient-to-t from-black via-black/40 to-transparent opacity-80 pointer-events-none" />

      {/* Comic Dialogue / Caption Overlay */}
      <div className="relative z-20 w-full p-6 md:p-12 mb-12 flex flex-col items-center text-center">
        {/* Caption/Narration Box */}
        {panel.content.caption && (
          <div className="bg-yellow-400/90 backdrop-blur-md text-black border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] px-4 py-2 mb-4 max-w-sm transform -rotate-1">
            <p className="text-xs uppercase tracking-widest font-black">
              {panel.content.caption}
            </p>
          </div>
        )}

        {/* Dialogue Bubble Style */}
        {panel.content.text && (
          <div className="bg-white/95 backdrop-blur-sm text-black border-2 border-black rounded-3xl rounded-br-sm shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] p-5 max-w-lg relative">
            <p className="text-lg md:text-xl leading-relaxed font-semibold font-comic-sans">
              {panel.content.text}
            </p>
          </div>
        )}
      </div>

      {/* Fallback for global CSS animations if Tailwind config doesn't have them yet */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes panRightZoom {
          0% { transform: scale(1.0) translate(0, 0); }
          100% { transform: scale(1.15) translate(2%, 0); }
        }
        @keyframes panLeftZoom {
          0% { transform: scale(1.0) translate(0, 0); }
          100% { transform: scale(1.15) translate(-2%, 0); }
        }
        @keyframes panUpZoom {
          0% { transform: scale(1.0) translate(0, 0); }
          100% { transform: scale(1.15) translate(0, -2%); }
        }
        @keyframes panDownZoom {
          0% { transform: scale(1.0) translate(0, 0); }
          100% { transform: scale(1.15) translate(0, 2%); }
        }
        @keyframes slowZoom {
          0% { transform: scale(1.0); }
          100% { transform: scale(1.15); }
        }

        .animate-pan-right-zoom { animation: panRightZoom 15s linear forwards; }
        .animate-pan-left-zoom { animation: panLeftZoom 15s linear forwards; }
        .animate-pan-up-zoom { animation: panUpZoom 15s linear forwards; }
        .animate-pan-down-zoom { animation: panDownZoom 15s linear forwards; }
        .animate-slow-zoom { animation: slowZoom 15s linear forwards; }
      `}} />
    </div>
  );
}
