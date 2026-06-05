"use client";

import React, { useState, useCallback } from "react";
import { Search, Book, FileText, Maximize2, Minimize2, Check, ExternalLink, X } from "lucide-react";

export function SourceMaterialViewer() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedHighlight, setSelectedHighlight] = useState<number | null>(2);
  const [leftPaneWidth, setLeftPaneWidth] = useState(280); // px
  const [rightPaneWidth, setRightPaneWidth] = useState(320); // px

  const textBlocks = [
    { id: 1, text: "I have always believed that the most profound acts of defiance are silent.", highlight: false },
    { id: 2, text: "The only way to deal with an unfree world is to become so absolutely free that your very existence is an act of rebellion.", highlight: true, note: "Core Quote Extraction Candidate. Verified against 1951 Gallimard edition." },
    { id: 3, text: "It is not the violent overthrow of systems that guarantees liberty, but the quiet refusal to participate in their cruelty.", highlight: false },
    { id: 4, text: "When we look back at the arc of human history, it bends toward those who stood firm in their individuality.", highlight: false },
    { id: 5, text: "They may bind the body, but the mind remains a fortress that only the self can surrender.", highlight: true, note: "Secondary variant - check copyright against English translation." },
  ];

  // Simple drag-to-resize handlers
  const handleLeftDrag = useCallback((e: React.MouseEvent) => {
    const startX = e.clientX;
    const startWidth = leftPaneWidth;
    
    const onMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = Math.max(200, Math.min(500, startWidth + (moveEvent.clientX - startX)));
      setLeftPaneWidth(newWidth);
    };
    
    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
    
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [leftPaneWidth]);

  return (
    <div className={`flex flex-col ${isFullscreen ? 'fixed inset-4 z-50 bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden' : 'h-full space-y-6'}`}>
      
      {/* Header section (hidden in fullscreen to maximize reading space) */}
      {!isFullscreen && (
        <header>
          <h2 className="text-3xl font-bold text-zinc-100 tracking-tight">Source Material Engine</h2>
          <p className="text-zinc-400 mt-1">Cross-reference manuscript ingestion with quote extraction targets.</p>
        </header>
      )}

      <div className={`flex-1 flex overflow-hidden border border-zinc-800 rounded-xl bg-zinc-900 ${isFullscreen ? '' : 'h-[600px]'}`}>
        
        {/* Left Pane: Library Navigation */}
        <aside 
          style={{ width: leftPaneWidth }} 
          className="flex flex-col bg-zinc-950 border-r border-zinc-800 shrink-0"
          aria-label="Library Navigation"
        >
          <div className="p-4 border-b border-zinc-800">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 text-zinc-500" size={16} aria-hidden="true" />
              <input 
                type="search" 
                placeholder="Search manuscripts..." 
                className="w-full bg-zinc-900 border border-zinc-800 rounded-md pl-9 pr-4 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-shadow"
                aria-label="Search manuscripts"
              />
            </div>
          </div>
          <nav className="flex-1 overflow-y-auto p-4 space-y-6">
            <section>
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">Active Works</h3>
              <div className="space-y-2">
                <LibraryItem title="The Rebel" author="Albert Camus" active />
                <LibraryItem title="Meditations" author="Marcus Aurelius" />
                <LibraryItem title="Letters from a Stoic" author="Seneca" />
              </div>
            </section>
            <section>
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">Chapters (The Rebel)</h3>
              <div className="space-y-1">
                <ChapterItem title="Part 1: The Rebel" progress={100} />
                <ChapterItem title="Part 2: Metaphysical Rebellion" progress={45} active />
                <ChapterItem title="Part 3: Historical Rebellion" progress={0} />
              </div>
            </section>
          </nav>
        </aside>

        {/* Drag Handle (Left) */}
        <div 
          className="w-1 cursor-col-resize hover:bg-amber-500/50 active:bg-amber-500 transition-colors z-10 shrink-0"
          onMouseDown={handleLeftDrag}
          role="separator"
          aria-label="Resize library panel"
        />

        {/* Middle Pane: Manuscript Viewer */}
        <main className="flex-1 flex flex-col bg-[#FCFBF7] text-zinc-900 min-w-0">
          <header className="h-14 bg-white border-b border-zinc-200 flex items-center justify-between px-6 shrink-0 shadow-sm z-10">
            <h1 className="flex items-center gap-2 font-serif font-semibold text-zinc-800">
              <Book size={18} className="text-amber-700" aria-hidden="true" />
              The Rebel — Chapter 2
            </h1>
            <div className="flex items-center gap-4">
              <button 
                className="text-sm font-medium text-amber-700 hover:text-amber-800 focus:outline-none focus:ring-2 focus:ring-amber-500 rounded px-2 py-1"
                aria-label="View manuscript metadata"
              >
                Metadata
              </button>
              <button 
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="text-zinc-500 hover:text-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 rounded p-1"
                aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                aria-pressed={isFullscreen}
              >
                {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
              </button>
            </div>
          </header>
          
          <article className="flex-1 overflow-y-auto px-12 py-16 scroll-smooth">
            <div className="max-w-2xl mx-auto space-y-8 font-serif text-[1.15rem] leading-[1.8] text-[#2c2825]">
              {textBlocks.map((block) => {
                const isSelected = selectedHighlight === block.id;
                return (
                  <p 
                    key={block.id}
                    onClick={() => block.highlight && setSelectedHighlight(block.id)}
                    onKeyDown={(e) => {
                      if (block.highlight && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        setSelectedHighlight(block.id);
                      }
                    }}
                    tabIndex={block.highlight ? 0 : -1}
                    role={block.highlight ? "button" : "paragraph"}
                    aria-pressed={isSelected}
                    className={`transition-all duration-200 rounded px-2 -mx-2 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 ${
                      block.highlight 
                        ? isSelected 
                          ? 'bg-[#ffedcc] shadow-[0_0_0_1px_#f59e0b] cursor-pointer' 
                          : 'bg-[#fff7e6] hover:bg-[#ffedcc] cursor-pointer'
                        : ''
                    }`}
                  >
                    {block.text}
                  </p>
                );
              })}
            </div>
          </article>
        </main>

        {/* Right Pane: Inspector */}
        <aside 
          style={{ width: rightPaneWidth }} 
          className="flex flex-col bg-zinc-950 border-l border-zinc-800 shrink-0 shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.3)] z-20"
          aria-label="Quote Inspector"
        >
          <div className="p-5 border-b border-zinc-800 flex items-center justify-between">
            <h2 className="font-bold text-white flex items-center gap-2">
              Inspector
            </h2>
            {selectedHighlight && (
              <button 
                onClick={() => setSelectedHighlight(null)}
                className="text-zinc-500 hover:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-500 rounded p-1"
                aria-label="Close inspector"
              >
                <X size={16} />
              </button>
            )}
          </div>
          
          <div className="flex-1 overflow-y-auto p-5">
            {selectedHighlight ? (
              <div className="flex flex-col h-full space-y-6">
                <section>
                  <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2" id="extracted-text-label">Extracted Text</h3>
                  <blockquote 
                    className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg text-sm font-serif italic text-zinc-300 leading-relaxed"
                    aria-labelledby="extracted-text-label"
                  >
                    "{textBlocks.find(b => b.id === selectedHighlight)?.text}"
                  </blockquote>
                </section>
                
                <section>
                  <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Editorial Context</h3>
                  <div className="p-3 bg-zinc-900/50 border border-zinc-800/50 rounded-lg">
                    <p className="text-sm text-amber-500/90 leading-normal">
                      {textBlocks.find(b => b.id === selectedHighlight)?.note}
                    </p>
                  </div>
                </section>

                <section>
                  <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Provenance Links</h3>
                  <ul className="space-y-2">
                    <li>
                      <a href="#" className="flex items-center justify-between text-sm text-zinc-300 hover:text-amber-500 p-2 rounded hover:bg-zinc-900 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500">
                        <span>Gallimard Source Scan</span>
                        <ExternalLink size={14} />
                      </a>
                    </li>
                  </ul>
                </section>

                <div className="mt-auto pt-6">
                  <div className="space-y-3">
                    <button className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-zinc-950 flex items-center justify-center gap-2">
                      <Check size={16} aria-hidden="true" /> Verify Extraction
                    </button>
                    <button className="w-full py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500">
                      Flag Issue
                    </button>
                    <p className="text-center text-xs text-zinc-600 font-mono">
                      Keyboard shortcut: <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded border border-zinc-700 text-zinc-300">Cmd</kbd> + <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded border border-zinc-700 text-zinc-300">Enter</kbd>
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-3 opacity-50">
                <FileText size={48} className="text-zinc-700" />
                <p className="text-sm text-zinc-400 max-w-[200px]">
                  Select a highlighted passage in the manuscript to inspect provenance.
                </p>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function LibraryItem({ title, author, active = false }: { title: string; author: string; active?: boolean }) {
  return (
    <button 
      className={`w-full text-left p-3 rounded-lg border flex items-start gap-3 transition-all focus:outline-none focus:ring-2 focus:ring-amber-500 ${
        active ? 'bg-amber-500/10 border-amber-500/30' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/50'
      }`}
      aria-current={active ? 'page' : undefined}
    >
      <Book size={16} className={`mt-0.5 shrink-0 ${active ? 'text-amber-500' : 'text-zinc-600'}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className={`font-semibold text-sm truncate ${active ? 'text-amber-500' : 'text-zinc-200'}`}>{title}</div>
        <div className="text-xs text-zinc-500 truncate mt-0.5">{author}</div>
      </div>
    </button>
  );
}

function ChapterItem({ title, progress, active = false }: { title: string; progress: number; active?: boolean }) {
  return (
    <button 
      className={`w-full text-left px-3 py-2 rounded-md flex items-center justify-between transition-all focus:outline-none focus:ring-2 focus:ring-amber-500 ${
        active ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
      }`}
      aria-current={active ? 'step' : undefined}
    >
      <div className="flex items-center gap-2 min-w-0">
        <FileText size={14} className={`shrink-0 ${active ? 'text-amber-500' : 'text-zinc-600'}`} aria-hidden="true" />
        <span className="text-sm font-medium truncate">{title}</span>
      </div>
      {progress > 0 && progress < 100 && (
        <span className="text-xs font-mono text-amber-500 shrink-0 ml-2" aria-label={`${progress}% reviewed`}>{progress}%</span>
      )}
      {progress === 100 && (
        <Check size={14} className="text-emerald-500 shrink-0 ml-2" aria-label="Fully reviewed" />
      )}
    </button>
  );
}
