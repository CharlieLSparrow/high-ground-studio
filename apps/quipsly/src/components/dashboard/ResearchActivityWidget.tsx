"use client";

import React from "react";
import { BookOpen, FileText, ChevronRight } from "lucide-react";
import { WidgetCard } from "./WidgetCard";

export const ResearchActivityWidget = React.memo(() => {
  return (
    <WidgetCard noPadding className="bg-[#3d3122] text-white border-0 transition-transform duration-300 group">
      <div className="p-8 h-full flex flex-col">
        <div className="absolute -right-8 -bottom-8 opacity-10 pointer-events-none transition-transform duration-700 group-hover:scale-110" aria-hidden="true">
          <BookOpen size={150} />
        </div>
        <div className="absolute inset-0 bg-gradient-to-tr from-amber-600/20 to-transparent pointer-events-none" aria-hidden="true" />
        
        <div className="relative z-10 flex flex-col h-full">
          <div className="flex justify-between items-start mb-6">
            <h3 className="text-2xl font-black text-[#ebdcc8] flex items-center gap-3">
              <BookOpen className="text-amber-400" size={28} aria-hidden="true" />
              Research Packets
            </h3>
            <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider backdrop-blur-sm">
              3 Active
            </span>
          </div>

          <p className="text-[#a89680] text-sm mb-6 max-w-sm">
            Your Quipsly has prepared context packets based on recent manuscript queries. Ready for review.
          </p>

          <nav aria-label="Recent research packets" className="flex flex-col gap-3 flex-1 mb-6">
            {['Medieval Siege Tactics', '19th Century Naval Terminology', 'Psychology of Betrayal'].map((topic, i) => (
              <a 
                key={i} 
                href="#"
                className="bg-white/10 border border-white/10 p-3 rounded-xl flex items-center justify-between hover:bg-white/20 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                aria-label={`View research packet: ${topic}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-400" aria-hidden="true">
                    <FileText size={16} />
                  </div>
                  <span className="text-sm font-bold text-[#ebdcc8]">{topic}</span>
                </div>
                <ChevronRight size={16} className="text-[#a89680]" aria-hidden="true" />
              </a>
            ))}
          </nav>

          <button className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-[#3d3122] font-black text-sm rounded-xl transition-colors shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#3d3122]">
            Explore All Packets
          </button>
        </div>
      </div>
    </WidgetCard>
  );
});
