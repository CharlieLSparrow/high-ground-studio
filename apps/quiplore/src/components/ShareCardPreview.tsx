"use client";

import { useState } from "react";
import { Download, Image as ImageIcon, CheckCircle2 } from "lucide-react";
import type { QuotePassportProjection } from "@high-ground/quipsly-domain";

export function ShareCardPreview({ passport }: { readonly passport: QuotePassportProjection }) {
  const [format, setFormat] = useState<"square" | "wide">("square");
  const [isDownloading, setIsDownloading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleDownload = () => {
    setIsDownloading(true);
    // Mock the HTML-to-Image download process
    setTimeout(() => {
      setIsDownloading(false);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    }, 1200);
  };

  const isSquare = format === "square";
  const aspectStyle = isSquare ? { aspectRatio: "1/1" } : { aspectRatio: "16/9" };

  return (
    <section className="panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <span className="section-label" style={{ marginBottom: 0 }}>
          <ImageIcon size={14} aria-hidden="true" />
          Social Share Card
        </span>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button 
            className={`button ${isSquare ? "primary" : ""}`} 
            style={{ padding: "4px 8px", fontSize: "12px", minHeight: "28px" }}
            onClick={() => setFormat("square")}
          >
            Square
          </button>
          <button 
            className={`button ${!isSquare ? "primary" : ""}`} 
            style={{ padding: "4px 8px", fontSize: "12px", minHeight: "28px" }}
            onClick={() => setFormat("wide")}
          >
            Wide
          </button>
        </div>
      </div>

      {/* The "Canvas" - This is what would be converted to an image via html-to-image */}
      <div 
        id="share-card-canvas"
        style={{
          width: "100%",
          ...aspectStyle,
          backgroundColor: "#f8d9b0",
          borderRadius: "12px",
          padding: isSquare ? "2rem" : "3rem",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          boxShadow: "inset 0 0 40px rgba(173, 107, 53, 0.15)",
          position: "relative",
          overflow: "hidden",
          border: "2px solid #e2b17b"
        }}
      >
        {/* Decorative elements */}
        <div style={{ position: "absolute", top: "-20%", left: "-10%", width: "50%", height: "50%", borderRadius: "50%", background: "radial-gradient(circle, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0) 70%)", opacity: 0.5 }} />
        <div style={{ position: "absolute", bottom: "-20%", right: "-10%", width: "60%", height: "60%", borderRadius: "50%", background: "radial-gradient(circle, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0) 70%)", opacity: 0.5 }} />

        <div style={{ zIndex: 1 }}>
          <div style={{ 
            display: "inline-flex", alignItems: "center", gap: "6px", 
            backgroundColor: "rgba(255,255,255,0.7)", padding: "4px 10px", 
            borderRadius: "20px", fontSize: "12px", fontWeight: "bold",
            color: passport.quote.verificationStatus === "verified" ? "#166534" : "#92400e",
            marginBottom: "1rem"
          }}>
            <div style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: passport.quote.verificationStatus === "verified" ? "#22c55e" : "#f59e0b" }} />
            {passport.quote.verificationStatus === "verified" ? "Verified Quote" : "Unverified Quote"}
          </div>

          <blockquote style={{ 
            fontSize: isSquare ? "1.5rem" : "1.8rem", 
            fontWeight: "bold", 
            color: "#4c331b",
            lineHeight: 1.3,
            margin: 0
          }}>
            "{passport.quote.text}"
          </blockquote>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", zIndex: 1 }}>
          <div>
            <div style={{ fontSize: "1.2rem", fontWeight: "bold", color: "#8d5a2b", marginBottom: "4px" }}>
              {passport.person.displayName}
            </div>
            {passport.sourceWork && (
              <div style={{ fontSize: "0.9rem", color: "#ad6b35", fontStyle: "italic" }}>
                {passport.sourceWork.title}
              </div>
            )}
          </div>
          <div style={{ fontSize: "1.2rem", fontWeight: "900", color: "#e2b17b", opacity: 0.8 }}>
            <span style={{ color: "#ad6b35" }}>Quip</span>Lore
          </div>
        </div>
      </div>

      <div style={{ marginTop: "1rem" }}>
        <button 
          className="button primary" 
          style={{ width: "100%", justifyContent: "center" }}
          onClick={handleDownload}
          disabled={isDownloading}
        >
          {showSuccess ? (
            <><CheckCircle2 size={16} /> Image Downloaded</>
          ) : isDownloading ? (
            "Generating image..."
          ) : (
            <><Download size={16} /> Download {isSquare ? "Square" : "Wide"} Image</>
          )}
        </button>
      </div>
    </section>
  );
}
