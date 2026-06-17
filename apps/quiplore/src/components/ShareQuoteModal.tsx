"use client";

import { X, Download, Copy, Instagram, Twitter } from "lucide-react";
import { useState } from "react";
import type { QuotePassportProjection } from "@high-ground/quipsly-domain";

export function ShareQuoteModal({
  passport,
  isOpen,
  onClose,
}: {
  readonly passport: QuotePassportProjection;
  readonly isOpen: boolean;
  readonly onClose: () => void;
}) {
  const [format, setFormat] = useState<"wide" | "square">("wide");
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const imageUrl = `/api/og/quote/${passport.quote.slug}?format=${format}`;
  const quoteText = `"${passport.quote.text}" - ${passport.person.displayName}`;

  const handleCopyText = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(quoteText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = async () => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      a.download = `quiplore-${passport.quote.slug}-${format}.png`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Failed to download image", e);
    }
  };

  return (
    <div className="share-modal-overlay" onClick={onClose} style={overlayStyle}>
      <div className="share-modal-content" onClick={(e) => e.stopPropagation()} style={contentStyle}>
        <div className="share-modal-header" style={headerStyle}>
          <h2>Share Quote</h2>
          <button onClick={onClose} className="button-icon" title="Close"><X size={20} /></button>
        </div>

        <div className="share-modal-body" style={bodyStyle}>
          <div className="format-toggle" style={toggleStyle}>
            <button 
              className={`button ${format === "wide" ? "active" : ""}`} 
              onClick={() => setFormat("wide")}
              style={{...btnStyle, ...(format === "wide" ? activeBtnStyle : {})}}
            >
              <Twitter size={16} style={{marginRight: "8px"}} />
              X / Landscape
            </button>
            <button 
              className={`button ${format === "square" ? "active" : ""}`} 
              onClick={() => setFormat("square")}
              style={{...btnStyle, ...(format === "square" ? activeBtnStyle : {})}}
            >
              <Instagram size={16} style={{marginRight: "8px"}} />
              Instagram Square
            </button>
          </div>

          <div className="preview-container" style={previewContainerStyle}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img 
              src={imageUrl} 
              alt="Quote Share Preview" 
              style={{
                width: "100%", 
                height: "auto", 
                maxHeight: "300px", 
                objectFit: "contain",
                border: "1px solid #ddd",
                borderRadius: "8px"
              }} 
            />
          </div>
        </div>

        <div className="share-modal-footer" style={footerStyle}>
          <button className="button" onClick={handleCopyText}>
            <Copy size={16} style={{marginRight: "8px"}} />
            {copied ? "Copied Text!" : "Copy Text"}
          </button>
          <button className="button primary" onClick={handleDownload} style={downloadBtnStyle}>
            <Download size={16} style={{marginRight: "8px"}} />
            Download Image
          </button>
        </div>
      </div>
    </div>
  );
}

// Inline styles for speed since I am inserting a new UI component without seeing global CSS
const overlayStyle: React.CSSProperties = {
  position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
  backgroundColor: "rgba(0,0,0,0.6)",
  display: "flex", justifyContent: "center", alignItems: "center",
  zIndex: 1000,
};
const contentStyle: React.CSSProperties = {
  backgroundColor: "#fffaf1",
  padding: "24px",
  borderRadius: "16px",
  width: "90%",
  maxWidth: "600px",
  boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
};
const headerStyle: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px"
};
const bodyStyle: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: "20px"
};
const toggleStyle: React.CSSProperties = {
  display: "flex", gap: "10px", justifyContent: "center"
};
const btnStyle: React.CSSProperties = {
  flex: 1, padding: "10px", borderRadius: "8px", border: "1px solid #ccc", backgroundColor: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center"
};
const activeBtnStyle: React.CSSProperties = {
  backgroundColor: "#fef3c7", borderColor: "#b7733c", color: "#b7733c", fontWeight: "bold"
};
const previewContainerStyle: React.CSSProperties = {
  display: "flex", justifyContent: "center", backgroundColor: "#eee", padding: "16px", borderRadius: "8px"
};
const footerStyle: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", marginTop: "24px", paddingTop: "16px", borderTop: "1px solid #ddd"
};
const downloadBtnStyle: React.CSSProperties = {
  backgroundColor: "#b7733c", color: "#fff", border: "none", padding: "10px 20px", borderRadius: "8px", cursor: "pointer", display: "flex", alignItems: "center"
};
