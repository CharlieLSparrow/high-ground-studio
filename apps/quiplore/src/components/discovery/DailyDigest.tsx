// @ts-nocheck
"use client";

import React from "react";
import { BookOpen, Calendar } from "lucide-react";
import { getAllQuipCards } from "@high-ground/quipsly-domain/seed";
import { QuipCard } from "../QuipCard";
import { StoryTrailViewer } from "../StoryTrailViewer";

export function DailyDigest() {
  const allCards = getAllQuipCards();
  // Grab a curated slice of 3 quotes for the daily digest
  const digestCards = allCards.slice(0, 3);

  const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="max-w-4xl mx-auto px-6 py-12 font-serif text-[#4c331b]">
      {/* Newspaper Header */}
      <header className="border-b-4 border-double border-[#4c331b] pb-6 mb-12 text-center space-y-4">
        <div className="flex items-center justify-center gap-4 text-[#ad6b35] text-sm uppercase tracking-[0.3em] font-bold">
          <Calendar className="w-4 h-4" />
          {dateStr}
        </div>
        <h1 className="text-6xl md:text-7xl font-black tracking-tight uppercase">
          The Sunday Digest
        </h1>
        <p className="text-xl italic text-[#ad6b35]">
          A slow-reading curation of historical resonance and wit.
        </p>
      </header>

      {/* Grid Layout */}
      <div className="space-y-24">
        {digestCards.map((card, idx) => (
          <section key={card.quote.id} className="grid md:grid-cols-[1fr_1.5fr] gap-12 items-start">
            {/* The Quote Card */}
            <div className="sticky top-24">
              <div className="text-8xl text-[#e2b17b] leading-none mb-4 font-black">"</div>
              <QuipCard card={card} />
            </div>

            {/* The Deep Reading StoryTrail */}
            <div className="prose prose-[#4c331b] max-w-none">
              <div className="flex items-center gap-2 text-[#ad6b35] uppercase tracking-widest text-xs font-bold mb-4">
                <BookOpen className="w-4 h-4" />
                The Story Behind the Quip
              </div>
              <h2 className="text-3xl font-bold mb-6 font-serif">
                {card.storyTrail?.title || "Historical Context"}
              </h2>
              {card.storyTrail?.deck && (
                <p className="text-xl italic text-[#8d5a2b] mb-8 border-l-4 border-[#e2b17b] pl-4">
                  {card.storyTrail.deck}
                </p>
              )}

              {/* If we have beats, render them beautifully */}
              {card.storyTrail?.beats ? (
                <div className="space-y-8">
                  {card.storyTrail.beats.map((beat, i) => (
                    <div key={i}>
                      {beat.title && <h3 className="text-xl font-bold text-[#4c331b] mb-3">{beat.title}</h3>}
                      <p className="text-lg leading-relaxed text-[#4c331b]/90">{beat.body}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-lg leading-relaxed">{card.quote.contextNote}</p>
              )}

              <div className="mt-8 pt-8 border-t border-[#e2b17b]/30 flex gap-4">
                <button className="text-sm font-bold text-[#ad6b35] hover:text-[#4c331b] uppercase tracking-wider">
                  Clip to Scrapbook
                </button>
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
