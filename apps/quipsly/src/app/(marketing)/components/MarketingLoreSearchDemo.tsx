"use client";

import React, { useState, useEffect } from "react";
import { Search, Sparkles, BookOpen, Clock, Zap } from "lucide-react";

type SearchResult = {
  id: string;
  source: string;
  text: string;
  score: number;
};

const RESULTS: SearchResult[] = [
  {
    id: "1",
    source: "Dune PDF • Chapter 4",
    text: "The storms on Arrakis are not just weather; they are a geological force, stripping flesh from bone and reshaping the dunes overnight.",
    score: 98
  },
  {
    id: "2",
    source: "My Notes • Desert Ecology",
    text: "Idea: The protagonist needs to get trapped in a Coriolis storm to realize how small they really are against the desert.",
    score: 92
  },
  {
    id: "3",
    source: "Worldbuilding Wiki • Weather",
    text: "Coriolis storms can reach speeds of 800 kilometers per hour, carrying dust that creates a massive static charge.",
    score: 85
  }
];

export function MarketingLoreSearchDemo() {
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isFocused, setIsFocused] = useState(false);

  // Auto-typing simulation
  useEffect(() => {
    const textToType = "How dangerous are the desert storms?";
    let currentIndex = 0;
    
    const startTyping = setTimeout(() => {
      setIsFocused(true);
      const typingInterval = setInterval(() => {
        if (currentIndex <= textToType.length) {
          setQuery(textToType.slice(0, currentIndex));
          currentIndex++;
        } else {
          clearInterval(typingInterval);
          setIsSearching(true);
          
          setTimeout(() => {
            setIsSearching(false);
            setResults(RESULTS);
          }, 1500);
        }
      }, 80);
      
      return () => clearInterval(typingInterval);
    }, 2000);

    return () => clearTimeout(startTyping);
  }, []);

  return (
    <div className="w-full max-w-xl mx-auto rounded-[2rem] border border-[#e8d0b5] bg-[#fdfaf6] shadow-xl overflow-hidden font-sans my-16">
      <div className="bg-[#fffaf1] border-b border-[#e8d0b5] p-5 flex items-center justify-between">
        <div>
          <h3 className="font-bold text-[#3d2618] flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#dc982f]" />
            Semantic Lore Search
          </h3>
          <p className="text-xs text-[#8c552e] mt-1">Instant recall across your entire Nest</p>
        </div>
        <div className="px-3 py-1 bg-blue-50 border border-blue-200 text-blue-800 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 shadow-sm">
          <Zap size={12} /> Vector DB
        </div>
      </div>
      
      <div className="p-6">
        <div className={`flex items-center gap-3 bg-white border-2 rounded-xl p-3 shadow-inner transition-colors ${isFocused ? 'border-[#a96735]' : 'border-[#e8d0b5]'}`}>
          <Search className={`w-5 h-5 ${isFocused ? 'text-[#a96735]' : 'text-[#d8b98e]'}`} />
          <input 
            type="text" 
            value={query}
            readOnly
            placeholder="Ask your manuscript a question..."
            className="w-full bg-transparent border-none outline-none text-[#3d2618] font-medium placeholder:text-[#d8b98e]"
          />
        </div>

        <div className="mt-6 min-h-[280px]">
          {isSearching && (
            <div className="flex flex-col items-center justify-center h-[200px] text-[#8c552e] space-y-4 animate-in fade-in">
              <Sparkles className="w-8 h-8 animate-spin-slow text-[#dc982f]" />
              <p className="text-sm font-bold animate-pulse">Scanning 14,205 blocks in your Nest...</p>
            </div>
          )}

          {results.length > 0 && !isSearching && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-[#a96735] mb-2 animate-in fade-in">
                <span>Top Matches</span>
                <span>{results.length} results (0.04s)</span>
              </div>
              
              {results.map((result, index) => (
                <div 
                  key={result.id} 
                  className="bg-white border border-[#e8d0b5] rounded-xl p-4 shadow-sm hover:shadow-md transition-all animate-in slide-in-from-bottom-2 fade-in"
                  style={{ animationDelay: `${index * 150}ms`, animationFillMode: 'both' }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#617c4d] bg-[#f0fdf4] px-2 py-0.5 rounded border border-[#bbf7d0]">
                      <BookOpen size={10} />
                      {result.source}
                    </div>
                    <div className="text-[10px] font-bold text-[#8c552e] bg-[#fdf5eb] px-2 py-0.5 rounded-full">
                      {result.score}% Match
                    </div>
                  </div>
                  <p className="text-sm text-[#3d2618] leading-relaxed">
                    {result.text.split(' ').map((word, i) => {
                      // Highlight keywords artificially for the demo
                      const isHighlight = ['storms', 'storm', 'Coriolis', 'weather', 'desert'].includes(word.replace(/[^a-zA-Z]/g, ''));
                      return isHighlight ? (
                        <span key={i} className="bg-yellow-200/60 font-medium text-[#8c552e] rounded px-0.5 mx-0.5">{word}</span>
                      ) : (
                        <span key={i}> {word}</span>
                      );
                    })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
