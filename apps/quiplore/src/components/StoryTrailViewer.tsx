"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, AlertTriangle, Feather } from "lucide-react";
import type { QuoteStoryProjection } from "@high-ground/quipsly-domain";

export function StoryTrailViewer({ story }: { readonly story: QuoteStoryProjection }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  if (!story || !story.beats || story.beats.length === 0) {
    return null;
  }

  const beat = story.beats[currentIndex];
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === story.beats.length - 1;

  const handleNext = () => {
    if (!isLast) setCurrentIndex(curr => curr + 1);
  };

  const handlePrev = () => {
    if (!isFirst) setCurrentIndex(curr => curr - 1);
  };

  return (
    <section className="story-trail-block">
      <span className="section-label">
        <Feather size={14} aria-hidden="true" />
        Story trail
      </span>
      <div style={{ marginBottom: "1rem" }}>
        <h2 className="panel-title" style={{ fontSize: "1.3rem", color: "#4c331b" }}>{story.title}</h2>
        <p className="panel-copy" style={{ fontStyle: "italic", color: "#ad6b35" }}>{story.deck}</p>
      </div>

      <div className="panel" style={{ padding: "1.5rem", position: "relative" }}>
        {/* Progress Bars */}
        <div style={{ display: "flex", gap: "4px", marginBottom: "1.5rem" }}>
          {story.beats.map((_, i) => (
            <div 
              key={i} 
              style={{ 
                height: "4px", 
                flexGrow: 1, 
                backgroundColor: i <= currentIndex ? "#ad6b35" : "#e2b17b",
                borderRadius: "2px",
                opacity: i <= currentIndex ? 1 : 0.4,
                transition: "all 0.3s ease"
              }} 
            />
          ))}
        </div>

        {/* Current Beat Content */}
        <div style={{ minHeight: "200px", display: "flex", flexDirection: "column" }}>
          <h3 style={{ fontSize: "1.2rem", fontWeight: "bold", color: "#4c331b", marginBottom: "1rem" }}>
            {beat.title}
          </h3>
          <p style={{ fontSize: "15px", lineHeight: 1.6, color: "#4c331b", flexGrow: 1 }}>
            {beat.body}
          </p>

          {beat.caution && (
            <div style={{ 
              marginTop: "1.5rem", padding: "1rem", backgroundColor: "#fffbeb", 
              borderLeft: "4px solid #f59e0b", borderRadius: "0 8px 8px 0",
              display: "flex", gap: "0.5rem"
            }}>
              <AlertTriangle size={16} color="#d97706" style={{ flexShrink: 0, marginTop: "2px" }} />
              <p style={{ fontSize: "13px", color: "#92400e", margin: 0 }}>
                <strong>AI Caution:</strong> {beat.caution}
              </p>
            </div>
          )}
        </div>

        {/* Controls */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "2rem", alignItems: "center" }}>
          <button 
            className="button" 
            onClick={handlePrev} 
            disabled={isFirst}
            style={{ opacity: isFirst ? 0.5 : 1 }}
          >
            <ChevronLeft size={16} /> Previous
          </button>
          
          <span style={{ fontSize: "12px", color: "#ad6b35", fontWeight: "bold" }}>
            Part {currentIndex + 1} of {story.beats.length}
          </span>
          
          <button 
            className="button primary" 
            onClick={handleNext} 
            disabled={isLast}
            style={{ opacity: isLast ? 0.5 : 1 }}
          >
            {isLast ? "Finish" : "Next Part"} <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="meta-item" style={{ marginTop: "1rem" }}>
        <span>Video seed</span>
        <strong>{story.recommendedRuntimeSeconds}s QuipLore short</strong>
        <p>{story.videoSeed}</p>
      </div>
    </section>
  );
}
