"use client";

import React from "react";
import { Layers, RotateCcw, Sparkles } from "lucide-react";
import { WidgetCard, classNames } from "./WidgetCard";

export type Hotspot = { id: string; location: string; issue: string; severity: 'high' | 'medium' | 'low'; recommendation: string };

export const StructuralHotspotsWidget = React.memo(({ hotspots }: { hotspots: Hotspot[] }) => {
  return (
    <WidgetCard variant="glass">
      <div className="absolute -right-12 -top-12 opacity-5 pointer-events-none" aria-hidden="true">
        <Layers size={200} />
      </div>
      
      <div className="relative z-10 flex justify-between items-start mb-6">
        <div>
          <h3 className="text-2xl font-black text-[#3d3122] flex items-center gap-3">
            <Layers className="text-indigo-500" size={28} aria-hidden="true" />
            Structural Hotspots
          </h3>
          <p className="text-[#8c6b4a] font-medium mt-1">AI-detected areas needing cleanup</p>
        </div>
        <button 
          className="p-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-full transition-colors shadow-sm border border-indigo-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          aria-label="Refresh structural scan"
        >
          <RotateCcw size={18} aria-hidden="true" />
        </button>
      </div>

      <ul className="flex-1 flex flex-col gap-4 relative z-10 overflow-y-auto pr-2 custom-scrollbar focus:outline-none">
        {hotspots.map(hotspot => (
          <li 
            key={hotspot.id} 
            className="p-5 bg-white border border-[#e8dcc4] rounded-2xl shadow-sm hover:shadow-md transition-all group border-l-4 focus-within:ring-2 focus-within:ring-indigo-500" 
            style={{ borderLeftColor: hotspot.severity === 'high' ? '#ef4444' : hotspot.severity === 'medium' ? '#f59e0b' : '#3b82f6' }}
          >
            <div className="flex justify-between items-start mb-2">
              <span className="text-sm font-bold text-[#3d3122]">{hotspot.location}</span>
              <span className={classNames(
                "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border",
                hotspot.severity === 'high' ? "bg-red-50 text-red-800 border-red-200" :
                hotspot.severity === 'medium' ? "bg-amber-50 text-amber-800 border-amber-200" :
                "bg-blue-50 text-blue-800 border-blue-200"
              )}>
                {hotspot.severity} Priority
              </span>
            </div>
            <p className="text-sm text-[#8c6b4a] mb-3">{hotspot.issue}</p>
            <div className="bg-[#fdfaf6] p-4 rounded-xl border border-[#e8dcc4] border-dashed">
              <p className="text-xs text-[#5e4b33] flex items-start gap-2 font-medium">
                <Sparkles size={14} className="text-indigo-600 mt-0.5 flex-shrink-0" aria-hidden="true" />
                <span className="sr-only">Recommendation:</span>
                {hotspot.recommendation}
              </p>
            </div>
            <div className="mt-4 flex gap-3">
              <button className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2">
                Apply Cleanup
              </button>
              <button className="px-4 py-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 text-xs font-bold rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2">
                Ignore
              </button>
            </div>
          </li>
        ))}
      </ul>
    </WidgetCard>
  );
});
