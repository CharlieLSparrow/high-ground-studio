"use client";

import React, { useState, useRef, useEffect } from "react";
import { X, Download, AlignLeft, AlignCenter, AlignRight, Check, Sparkles } from "lucide-react";

interface Snippet {
  id: string;
  highlightedText: string;
  note: string | null;
  sourceTitle: string | null;
  createdAt: any;
}

interface QuoteCardModalProps {
  snippet: Snippet;
  onClose: () => void;
}

type AspectRatio = "square" | "landscape";
type ThemeId = "void-ember" | "solar-flare" | "deep-neon" | "odyssey-light";

interface ThemePreset {
  id: ThemeId;
  name: string;
  background: string;
  textColor: string;
  borderColor: string;
  badgeBg: string;
  badgeText: string;
  noteBg: string;
  noteText: string;
}

const THEME_PRESETS: Record<ThemeId, ThemePreset> = {
  "void-ember": {
    id: "void-ember",
    name: "Void & Ember",
    background: "radial-gradient(circle at 50% 50%, #2e1005 0%, #061014 100%)",
    textColor: "#fef3c7", // amber-100
    borderColor: "rgba(245, 158, 11, 0.25)",
    badgeBg: "rgba(245, 158, 11, 0.15)",
    badgeText: "#fbbf24", // amber-400
    noteBg: "rgba(0, 0, 0, 0.3)",
    noteText: "#d97706", // amber-600
  },
  "solar-flare": {
    id: "solar-flare",
    name: "Solar Flare",
    background: "linear-gradient(135deg, #581c0c 0%, #1a0505 100%)",
    textColor: "#ffedd5", // orange-100
    borderColor: "rgba(248, 113, 113, 0.25)",
    badgeBg: "rgba(239, 68, 68, 0.15)",
    badgeText: "#f87171", // red-400
    noteBg: "rgba(0, 0, 0, 0.4)",
    noteText: "#f97316", // orange-500
  },
  "deep-neon": {
    id: "deep-neon",
    name: "Deep Neon",
    background: "linear-gradient(135deg, #061e24 0%, #060c14 100%)",
    textColor: "#e0f2fe", // sky-100
    borderColor: "rgba(14, 165, 233, 0.25)",
    badgeBg: "rgba(14, 165, 233, 0.15)",
    badgeText: "#38bdf8", // sky-400
    noteBg: "rgba(0, 0, 0, 0.3)",
    noteText: "#0ea5e9", // sky-500
  },
  "odyssey-light": {
    id: "odyssey-light",
    name: "Odyssey Light",
    background: "#fdfaf6",
    textColor: "#1c1917", // stone-900
    borderColor: "#e7e5e4", // stone-200
    badgeBg: "#f5f5f4", // stone-100
    badgeText: "#78716c", // stone-500
    noteBg: "#f5f5f4",
    noteText: "#78716c",
  },
};

export default function QuoteCardModal({ snippet, onClose }: QuoteCardModalProps) {
  const [aspect, setAspect] = useState<AspectRatio>("square");
  const [themeId, setThemeId] = useState<ThemeId>("void-ember");
  const [showSpeaker, setShowSpeaker] = useState(true);
  const [showSource, setShowSource] = useState(true);
  const [align, setAlign] = useState<"left" | "center" | "right">("center");
  const [fontSize, setFontSize] = useState(28);
  const [isExporting, setIsExporting] = useState(false);

  const previewRef = useRef<HTMLDivElement>(null);
  const activeTheme = THEME_PRESETS[themeId];

  // Lock scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "unset";
    };
  }, []);

  // Determine speaker name from first brackets if present, otherwise default to "Supporter"
  const extractSpeaker = (text: string): { speaker: string; quote: string } => {
    const match = text.match(/^\[([^\]]+)\]\s*(.*)/);
    if (match) {
      return { speaker: match[1], quote: match[2] };
    }
    return { speaker: "High Ground Odyssey", quote: text };
  };

  const { speaker, quote } = extractSpeaker(snippet.highlightedText);
  const textToShow = showSpeaker ? quote : snippet.highlightedText;

  const handleDownload = () => {
    setIsExporting(true);

    const width = 800;
    const height = aspect === "square" ? 800 : 450;

    // Create the SVG string representation of the quote card
    // We use inline styles to guarantee it maps perfectly when compiled by browser canvas
    const svgContent = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <foreignObject width="100%" height="100%">
          <div xmlns="http://www.w3.org/1999/xhtml" style="
            width: 100%;
            height: 100%;
            background: ${activeTheme.background};
            color: ${activeTheme.textColor};
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            box-sizing: border-box;
            padding: ${aspect === "square" ? "64px" : "48px"};
            font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          ">
            <!-- Top brand header -->
            <div style="
              display: flex;
              align-items: center;
              justify-content: space-between;
              border-bottom: 1px solid ${activeTheme.borderColor};
              padding-bottom: 16px;
            ">
              <span style="
                font-size: 14px;
                font-weight: 900;
                text-transform: uppercase;
                letter-spacing: 0.15em;
                color: ${activeTheme.badgeText};
              ">
                HIGH GROUND ODYSSEY
              </span>
              ${
                showSource && snippet.sourceTitle
                  ? `<span style="
                      font-size: 12px;
                      font-weight: 500;
                      opacity: 0.8;
                    ">
                      ${snippet.sourceTitle}
                    </span>`
                  : ""
              }
            </div>

            <!-- Quote Canvas Body -->
            <div style="
              flex-grow: 1;
              display: flex;
              flex-direction: column;
              justify-content: center;
              margin: 24px 0;
            ">
              <span style="
                font-size: 48px;
                line-height: 1;
                font-family: Georgia, serif;
                color: ${activeTheme.badgeText};
                opacity: 0.3;
                margin-bottom: -16px;
                text-align: ${align};
              ">
                “
              </span>
              <p style="
                font-size: ${fontSize}px;
                line-height: 1.5;
                font-weight: 500;
                margin: 0;
                text-align: ${align};
                word-wrap: break-word;
              ">
                ${textToShow.replace(/"/g, "&quot;")}
              </p>
              <span style="
                font-size: 48px;
                line-height: 1;
                font-family: Georgia, serif;
                color: ${activeTheme.badgeText};
                opacity: 0.3;
                margin-top: -8px;
                text-align: ${align};
              ">
                ”
              </span>
            </div>

            <!-- Bottom metadata footer -->
            <div style="
              display: flex;
              align-items: flex-end;
              justify-content: space-between;
              border-top: 1px solid ${activeTheme.borderColor};
              padding-top: 16px;
            ">
              <div>
                ${
                  showSpeaker && speaker !== "High Ground Odyssey"
                    ? `<div style="
                        font-size: 16px;
                        font-weight: 800;
                        margin-bottom: 4px;
                        color: ${activeTheme.badgeText};
                      ">
                        — ${speaker}
                      </div>`
                    : ""
                }
                <div style="
                  font-size: 12px;
                  opacity: 0.5;
                  font-family: monospace;
                ">
                  SAVED STUDY ARTIFACT
                </div>
              </div>
              
              <div style="
                font-size: 10px;
                opacity: 0.4;
                letter-spacing: 0.1em;
                text-align: right;
              ">
                PUBLISHED FROM QUIPSLY
              </div>
            </div>
          </div>
        </foreignObject>
      </svg>
    `;

    const svgBlob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      
      // Configure 2x scale for high-DPI crisp export
      const scale = 2;
      canvas.width = width * scale;
      canvas.height = height * scale;

      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0);

        try {
          const pngUrl = canvas.toDataURL("image/png");
          const a = document.createElement("a");
          a.download = `hgo-quote-${snippet.id}.png`;
          a.href = pngUrl;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        } catch (err) {
          console.error("Canvas export failed:", err);
        }
      }

      URL.revokeObjectURL(url);
      setIsExporting(false);
    };

    img.onerror = (err) => {
      console.error("Failed to load SVG into image object:", err);
      setIsExporting(false);
    };

    img.src = url;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 p-4 backdrop-blur-md">
      <div className="flex h-full max-h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-zinc-900 shadow-2xl md:flex-row">
        
        {/* Left Side: Live Preview Canvas */}
        <div className="flex flex-1 items-center justify-center border-b border-white/5 bg-zinc-950 p-6 md:border-b-0 md:border-r">
          <div className="flex w-full flex-col items-center justify-center gap-4">
            <div className="text-xs font-bold uppercase tracking-widest text-zinc-500">Live Card Preview</div>
            
            {/* The Preview container */}
            <div
              ref={previewRef}
              style={{
                background: activeTheme.background,
                color: activeTheme.textColor,
                border: `1px solid ${activeTheme.borderColor}`,
              }}
              className={`relative flex w-full flex-col justify-between p-8 transition-all duration-300 shadow-lg rounded-2xl ${
                aspect === "square" 
                  ? "aspect-square max-w-[340px] md:max-w-[420px]" 
                  : "aspect-[16/9] max-w-[480px] md:max-w-[580px]"
              }`}
            >
              {/* Header */}
              <div 
                style={{ borderColor: activeTheme.borderColor }}
                className="flex items-center justify-between border-b pb-3 text-[10px] md:text-xs"
              >
                <span style={{ color: activeTheme.badgeText }} className="font-black tracking-wider">
                  HIGH GROUND ODYSSEY
                </span>
                {showSource && snippet.sourceTitle && (
                  <span className="opacity-80 font-medium">
                    {snippet.sourceTitle}
                  </span>
                )}
              </div>

              {/* Quote Body */}
              <div className="flex-grow flex flex-col justify-center py-4">
                <span style={{ color: activeTheme.badgeText, textAlign: align }} className="text-3xl font-serif opacity-30 select-none mb-[-8px]">
                  “
                </span>
                <p 
                  style={{ fontSize: `${fontSize - 6}px`, textAlign: align }}
                  className="font-medium leading-relaxed break-words"
                >
                  {textToShow}
                </p>
                <span style={{ color: activeTheme.badgeText, textAlign: align }} className="text-3xl font-serif opacity-30 select-none mt-[-8px]">
                  ”
                </span>
              </div>

              {/* Footer */}
              <div 
                style={{ borderColor: activeTheme.borderColor }}
                className="flex items-end justify-between border-t pt-3 text-[10px] md:text-xs"
              >
                <div>
                  {showSpeaker && speaker !== "High Ground Odyssey" && (
                    <div style={{ color: activeTheme.badgeText }} className="font-extrabold mb-0.5">
                      — {speaker}
                    </div>
                  )}
                  <div className="opacity-50 font-mono text-[9px]">SAVED STUDY ARTIFACT</div>
                </div>
                <div className="opacity-40 text-[9px] font-semibold tracking-wider">
                  PUBLISHED FROM QUIPSLY
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Visual controls */}
        <div className="flex w-full flex-col justify-between overflow-y-auto bg-zinc-900 p-6 md:w-[380px]">
          <div>
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-400" />
                <h2 className="text-lg font-bold text-white">Quote Card Designer</h2>
              </div>
              <button 
                onClick={onClose}
                className="rounded-full bg-white/5 p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Layout controls */}
            <div className="mt-6 space-y-6">
              {/* Aspect Ratio */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Card Layout</label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setAspect("square")}
                    className={`rounded-lg border px-3 py-2 text-xs font-bold transition ${
                      aspect === "square"
                        ? "border-amber-500/50 bg-amber-500/10 text-amber-300"
                        : "border-white/5 bg-white/5 text-zinc-400 hover:bg-white/10"
                    }`}
                  >
                    1:1 Square (Instagram)
                  </button>
                  <button
                    onClick={() => setAspect("landscape")}
                    className={`rounded-lg border px-3 py-2 text-xs font-bold transition ${
                      aspect === "landscape"
                        ? "border-amber-500/50 bg-amber-500/10 text-amber-300"
                        : "border-white/5 bg-white/5 text-zinc-400 hover:bg-white/10"
                    }`}
                  >
                    16:9 Landscape (Twitter/LinkedIn)
                  </button>
                </div>
              </div>

              {/* Theme Selector */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Theme Background</label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {Object.values(THEME_PRESETS).map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => setThemeId(preset.id)}
                      className={`relative flex items-center justify-between rounded-lg border px-3 py-2.5 text-left transition ${
                        themeId === preset.id
                          ? "border-amber-500/50 bg-amber-500/5"
                          : "border-white/5 bg-white/5 hover:bg-white/10"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span 
                          style={{ background: preset.background }}
                          className="h-4.5 w-4.5 rounded-full border border-white/10"
                        />
                        <span className="text-xs font-semibold text-zinc-300">{preset.name}</span>
                      </div>
                      {themeId === preset.id && (
                        <Check className="h-3 w-3 text-amber-400" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Text Alignment */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Text Alignment</label>
                <div className="mt-2 flex gap-1">
                  {(["left", "center", "right"] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setAlign(mode)}
                      className={`flex-1 flex justify-center py-2 rounded-lg border transition ${
                        align === mode
                          ? "border-amber-500/50 bg-amber-500/10 text-amber-300"
                          : "border-white/5 bg-white/5 text-zinc-400 hover:bg-white/10"
                      }`}
                    >
                      {mode === "left" && <AlignLeft className="h-4 w-4" />}
                      {mode === "center" && <AlignCenter className="h-4 w-4" />}
                      {mode === "right" && <AlignRight className="h-4 w-4" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Font Size */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Font Size</label>
                  <span className="text-xs font-mono text-zinc-500">{fontSize}px</span>
                </div>
                <input
                  type="range"
                  min="18"
                  max="38"
                  value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                  className="mt-2 w-full accent-amber-500"
                />
              </div>

              {/* Content Toggles */}
              <div className="space-y-3 border-t border-white/5 pt-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showSpeaker}
                    onChange={(e) => setShowSpeaker(e.target.checked)}
                    className="h-4 w-4 rounded border-white/10 bg-zinc-950 text-amber-500 accent-amber-500"
                  />
                  <span className="text-xs font-semibold text-zinc-300">Show Speaker Label</span>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showSource}
                    onChange={(e) => setShowSource(e.target.checked)}
                    className="h-4 w-4 rounded border-white/10 bg-zinc-950 text-amber-500 accent-amber-500"
                  />
                  <span className="text-xs font-semibold text-zinc-300">Show Source Episode</span>
                </label>
              </div>
            </div>
          </div>

          {/* Export Action */}
          <div className="mt-8 border-t border-white/5 pt-4">
            <button
              onClick={handleDownload}
              disabled={isExporting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-3 text-sm font-bold uppercase tracking-wider text-zinc-950 transition hover:bg-amber-400 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              {isExporting ? "Exporting..." : "Download PNG Image"}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
