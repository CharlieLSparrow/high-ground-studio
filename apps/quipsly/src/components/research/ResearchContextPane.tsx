/**
 * @file ResearchContextPane.tsx
 * @description 
 * A gorgeous manual RAG query dashboard that slides out alongside the manuscript editor.
 * Allows authors to manually execute keyword or semantic hybrid searches across the 
 * active project and the global QuipLore archive, bypassing the AI assistant.
 * 
 * Renders verified and unverified citations with interactive jump-links to the source block.
 */

"use client";

import React, { useState, useTransition } from "react";
import { executeExampleSearchAction, executeQuoteSearchAction } from "@/app/actions/research-actions";
import { ManuscriptResearchPacket, RetrievalResult } from "@high-ground/quipsly-domain/retrieval";
import { CitationCard } from "./CitationCard";

interface ResearchContextPaneProps {
  projectId: string;
  onNavigateToBlock?: (blockStableId: string) => void;
}

export function ResearchContextPane({ projectId, onNavigateToBlock }: ResearchContextPaneProps) {
  const [query, setQuery] = useState("");
  const [searchMode, setSearchMode] = useState<"examples" | "quotes">("examples");
  const [isPending, startTransition] = useTransition();
  const [packet, setPacket] = useState<ManuscriptResearchPacket | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    startTransition(async () => {
      setError(null);
      try {
        let resultPacket: ManuscriptResearchPacket;
        if (searchMode === "examples") {
          resultPacket = await executeExampleSearchAction(query, projectId);
        } else {
          resultPacket = await executeQuoteSearchAction(query, projectId);
        }
        setPacket(resultPacket);
      } catch (err: any) {
        setError(err.message || "An error occurred during search.");
      }
    });
  };

  const handleNavigate = (result: RetrievalResult) => {
    if (onNavigateToBlock && result.provenance.origin === "studio-span" && result.provenance.blockStableId) {
      onNavigateToBlock(result.provenance.blockStableId);
    }
  };

  return (
    <div className="flex flex-col h-full bg-black/40 backdrop-blur-md border-l border-white/10 w-80 lg:w-96">
      {/* Header */}
      <div className="p-4 border-b border-white/10">
        <h2 className="text-lg font-semibold text-white/90">Deep Research</h2>
        <p className="text-xs text-white/50">Search manuscript & lore globally</p>
      </div>

      {/* Search Form */}
      <div className="p-4 border-b border-white/10 bg-white/5">
        <form onSubmit={handleSearch} className="flex flex-col gap-3">
          <div className="flex gap-2 p-1 bg-black/20 rounded-lg">
            <button
              type="button"
              onClick={() => setSearchMode("examples")}
              className={`flex-1 text-xs py-1.5 rounded-md transition-colors ${
                searchMode === "examples" ? "bg-white/10 text-white" : "text-white/50 hover:text-white/70"
              }`}
            >
              Examples
            </button>
            <button
              type="button"
              onClick={() => setSearchMode("quotes")}
              className={`flex-1 text-xs py-1.5 rounded-md transition-colors ${
                searchMode === "quotes" ? "bg-white/10 text-white" : "text-white/50 hover:text-white/70"
              }`}
            >
              Quotes
            </button>
          </div>

          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search concepts, characters, artifacts..."
              className="w-full bg-black/40 border border-white/10 rounded-lg py-2 pl-3 pr-10 text-sm text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50"
            />
            <button 
              type="submit"
              disabled={isPending || !query.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-white/50 hover:text-white disabled:opacity-50"
            >
              {isPending ? "..." : "→"}
            </button>
          </div>
        </form>
      </div>

      {/* Results Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        {isPending && !packet && (
          <div className="flex justify-center py-8">
            <div className="w-5 h-5 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
          </div>
        )}

        {!isPending && packet && packet.results.length === 0 && (
          <div className="text-center py-8 text-white/40 text-sm">
            No results found for "{packet.query}".
          </div>
        )}

        {!isPending && packet && packet.results.map((result) => (
          <CitationCard 
            key={result.resultId} 
            result={result} 
            onNavigate={handleNavigate}
          />
        ))}
      </div>

      {/* Footer Meta */}
      {packet && packet.results.length > 0 && (
        <div className="p-3 border-t border-white/10 bg-black/20 text-[10px] text-white/40 text-center flex justify-between">
          <span>{packet.results.length} result(s)</span>
          <span>{packet.meta.durationMs}ms</span>
        </div>
      )}
    </div>
  );
}
