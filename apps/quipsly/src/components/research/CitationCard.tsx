/**
 * @file CitationCard.tsx
 * @description 
 * The visual component representing a verified `RetrievalResult`.
 * Used uniformly across the manual `ResearchContextPane` and the
 * `AssistantSidebar` to display source snippets, match confidence,
 * and provenance tags in a highly polished glassmorphism style.
 */

import React from "react";
import { RetrievalResult } from "@high-ground/quipsly-domain/retrieval";

interface CitationCardProps {
  result: RetrievalResult;
  onNavigate?: (result: RetrievalResult) => void;
}

export function CitationCard({ result, onNavigate }: CitationCardProps) {
  const isLore = result.provenance.origin === "quipsly-lore";
  const statusColor = result.verificationStatus === "verified" ? "bg-green-500" : "bg-amber-500";

  return (
    <div className="relative overflow-hidden rounded-xl bg-white/5 border border-white/10 p-4 shadow-sm backdrop-blur-sm transition-all hover:bg-white/10 group">
      {/* Accent strip based on origin */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${isLore ? "bg-purple-500" : "bg-blue-500"}`} />
      
      <div className="flex justify-between items-start mb-2">
        <div>
          <h4 className="text-sm font-semibold text-white/90">
            {result.title}
          </h4>
          <p className="text-xs text-white/50 mt-0.5">
            {result.citation}
          </p>
        </div>
        
        {/* Verification Badge */}
        <div className="flex items-center space-x-1.5 px-2 py-1 rounded-full bg-black/20 border border-white/5">
          <div className={`w-1.5 h-1.5 rounded-full ${statusColor}`} />
          <span className="text-[10px] uppercase tracking-wider font-medium text-white/70">
            {result.verificationStatus.replace("-", " ")}
          </span>
        </div>
      </div>

      <div className="mt-3 text-sm text-white/80 leading-relaxed italic border-l-2 border-white/10 pl-3 py-1">
        "{result.content}"
      </div>

      {/* Footer Navigation */}
      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <span className="text-xs px-2 py-0.5 rounded-md bg-white/5 text-white/60 border border-white/5">
            Score: {Math.round(result.relevanceScore * 100)}%
          </span>
          <span className="text-xs px-2 py-0.5 rounded-md bg-white/5 text-white/60 border border-white/5">
            {isLore ? "Lore Bible" : "Manuscript"}
          </span>
        </div>

        {onNavigate && (
          <button 
            onClick={() => onNavigate(result)}
            className="text-xs font-medium text-blue-400 hover:text-blue-300 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            Jump to Source &rarr;
          </button>
        )}
      </div>
    </div>
  );
}
