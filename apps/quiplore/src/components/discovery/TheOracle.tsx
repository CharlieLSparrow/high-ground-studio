"use client";

import React, { useState, useEffect } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { getAllQuipCards } from "@high-ground/quipsly-domain/seed";
import { QuipCard } from "../QuipCard";

export function TheOracle() {
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<any[]>([]);

  const allCards = getAllQuipCards();

  useEffect(() => {
    if (query.length < 3) {
      setResults([]);
      return;
    }

    setIsSearching(true);
    const delay = setTimeout(() => {
      const q = query.toLowerCase();
      // Mocking semantic search by just fuzzy matching keywords in the quote and notes
      const filtered = allCards.filter(
        (c) =>
          c.quote.text.toLowerCase().includes(q) ||
          c.quote.contextNote?.toLowerCase().includes(q) ||
          c.person.displayName.toLowerCase().includes(q)
      );
      setResults(filtered.slice(0, 5));
      setIsSearching(false);
    }, 800);

    return () => clearTimeout(delay);
  }, [query]);

  return (
    <div className="relative min-h-[80vh] flex flex-col items-center pt-24 px-6 overflow-hidden">
      {/* Vibe background effect */}
      <div
        className="absolute inset-0 pointer-events-none transition-colors duration-1000"
        style={{
          background: query.length > 5
            ? "radial-gradient(circle at 50% 30%, rgba(173,107,53,0.15), transparent 70%)"
            : "transparent"
        }}
      />

      <div className="text-center space-y-6 z-10 w-full max-w-2xl">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#f8d9b0]/50 text-[#ad6b35] text-xs font-bold uppercase tracking-widest border border-[#e2b17b]/50">
          <Sparkles className="w-4 h-4" />
          The Oracle
        </div>

        <h1 className="text-4xl md:text-5xl font-serif font-bold text-[#4c331b]">
          What do you need to hear today?
        </h1>

        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. I need a quote about losing gracefully..."
            className="w-full text-lg md:text-xl p-6 rounded-2xl border-2 border-[#e2b17b] bg-white/80 backdrop-blur-md shadow-xl focus:outline-none focus:border-[#ad6b35] focus:ring-4 focus:ring-[#ad6b35]/20 transition-all text-[#4c331b] placeholder:text-[#ad6b35]/50 font-serif"
          />
          {isSearching && (
            <div className="absolute right-6 top-1/2 -translate-y-1/2">
              <Loader2 className="w-6 h-6 text-[#ad6b35] animate-spin" />
            </div>
          )}
        </div>
      </div>

      <div className="mt-16 w-full max-w-2xl space-y-8 z-10">
        {results.map((card, idx) => (
          <div
            key={card.quote.id}
            className="animate-in fade-in slide-in-from-bottom-8"
            style={{ animationDelay: `${idx * 150}ms`, animationFillMode: "both" }}
          >
            <QuipCard card={card} />
          </div>
        ))}
        {query.length >= 3 && !isSearching && results.length === 0 && (
          <div className="text-center text-[#ad6b35] font-serif text-lg animate-in fade-in">
            The Oracle is quiet. Try another vibe.
          </div>
        )}
      </div>
    </div>
  );
}
