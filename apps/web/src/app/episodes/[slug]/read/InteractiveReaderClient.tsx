"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useState, useEffect, useRef } from "react";
import { Sparkles, Bookmark, Lock, ArrowRight, Check } from "lucide-react";

interface PopoverPosition {
  x: number;
  y: number;
}

export default function InteractiveReaderClient({
  content,
  isPatreonMember,
  episodeSlug,
}: {
  content: string;
  isPatreonMember: boolean;
  episodeSlug: string;
}) {
  const [selectedText, setSelectedText] = useState("");
  const [popoverPos, setPopoverPos] = useState<PopoverPosition | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);

  // Gated content for non-members: truncate to the first paragraph
  const visibleContent = isPatreonMember
    ? content
    : content.split("</p>")[0] + "</p>";

  const editor = useEditor({
    extensions: [StarterKit],
    content: visibleContent,
    editable: false,
    editorProps: {
      attributes: {
        class: "prose prose-invert prose-lg max-w-none focus:outline-none select-text",
      },
    },
  });

  // Track browser text selection changes
  useEffect(() => {
    const handleSelectionChange = () => {
      if (!isPatreonMember) return; // Non-members cannot highlight/save snippets

      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        setSelectedText("");
        setPopoverPos(null);
        setIsSaved(false);
        return;
      }

      const text = selection.toString().trim();
      if (!text) {
        setSelectedText("");
        setPopoverPos(null);
        setIsSaved(false);
        return;
      }

      // Calculate bounding rect of the selection
      try {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        
        if (containerRef.current) {
          const containerRect = containerRef.current.getBoundingClientRect();
          
          // Position popover centered above selection, relative to container
          setPopoverPos({
            x: rect.left - containerRect.left + rect.width / 2,
            y: rect.top - containerRect.top - 50 + window.scrollY - window.scrollY, // Keep it precise
          });
          setSelectedText(text);
        }
      } catch (err) {
        console.warn("Could not calculate selection range rect:", err);
      }
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, [isPatreonMember]);

  const handleSaveSnippet = async () => {
    if (!selectedText || isSaving) return;
    
    setIsSaving(true);
    try {
      const response = await fetch("/api/snippets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          highlightedText: selectedText,
          sourceUrl: `/episodes/${episodeSlug}/read`,
          sourceTitle: `Episode: ${episodeSlug.replace(/-/g, " ")}`,
          note: "Highlighted via HGO Interactive Reader",
        }),
      });

      const data = await response.json();
      if (response.ok) {
        setIsSaved(true);
        setToastMessage("Saved to 'Patreon Highlights' Collection!");
        
        // Auto-dismiss toast
        setTimeout(() => setToastMessage(null), 3000);
        // Clear selection popover after a brief delay
        setTimeout(() => {
          window.getSelection()?.removeAllRanges();
          setPopoverPos(null);
          setIsSaved(false);
        }, 1500);
      } else {
        alert(data.error || "Failed to save snippet.");
      }
    } catch (err) {
      console.error("Failed to save snippet:", err);
      alert("An error occurred while saving the snippet.");
    } finally {
      setIsSaving(false);
    }
  };

  if (!editor) {
    return null;
  }

  return (
    <div ref={containerRef} className="relative w-full text-left">
      {/* Interactive Editor Canvas */}
      <div className={`transition-all duration-300 ${!isPatreonMember ? "blur-[2px] select-none" : ""}`}>
        <EditorContent editor={editor} />
      </div>

      {/* Floating Selection Tooltip Popover */}
      {popoverPos && (
        <div
          className="absolute z-50 transform -translate-x-1/2 flex items-center gap-2 bg-[#0A1A20]/90 border border-white/10 px-4 py-2 rounded-full shadow-[var(--shadow-glass-glow)] backdrop-blur-md transition-all duration-150 animate-breathe"
          style={{
            left: `${popoverPos.x}px`,
            top: `${popoverPos.y}px`,
          }}
        >
          <span className="text-[12px] text-white/60 font-semibold truncate max-w-[120px]">
            "{selectedText}"
          </span>
          <div className="h-4 w-[1px] bg-white/10 mx-1" />
          <button
            onClick={handleSaveSnippet}
            disabled={isSaving}
            className="flex items-center gap-1.5 text-[12px] font-bold text-white hover:text-[var(--color-flare-glow)] transition-colors"
          >
            {isSaved ? (
              <>
                <Check size={14} className="text-emerald-400 animate-pulse" />
                <span className="text-emerald-400">Saved</span>
              </>
            ) : (
              <>
                <Sparkles size={14} className="text-[var(--color-flare)]" />
                <span>Highlight</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Dynamic Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-50 bg-[#051014] border border-[var(--color-flare)]/30 px-6 py-3 rounded-xl shadow-[var(--shadow-glass-glow)] flex items-center gap-3 animate-fade-in">
          <Bookmark size={16} className="text-[var(--color-flare)] animate-bounce" />
          <span className="text-[14px] font-bold text-[var(--color-subject)]">{toastMessage}</span>
        </div>
      )}

      {/* Locked Gating Screen Overlay */}
      {!isPatreonMember && (
        <div className="absolute inset-x-0 bottom-0 top-[60%] flex flex-col justify-end items-center bg-gradient-to-t from-void via-void/95 to-transparent pt-32 pb-4">
          <div className="max-w-md w-full p-8 border border-white/10 bg-white/5 rounded-2xl shadow-[var(--shadow-glass)] backdrop-blur-md text-center flex flex-col items-center">
            <div className="w-12 h-12 bg-[var(--color-flare)]/10 border border-[var(--color-flare)]/20 rounded-full flex items-center justify-center mb-4">
              <Lock className="text-[var(--color-flare)]" size={20} />
            </div>
            <h3 className="text-xl font-black mb-2 text-white">Unlock Interactive Reader</h3>
            <p className="text-[14px] text-white/60 mb-6 leading-relaxed">
              Read complete transcripts, highlight key takeaways, and curate custom personal collections. Available exclusively for HGO Patreon members.
            </p>
            <a
              href="/support"
              className="w-full py-3.5 bg-[var(--color-flare)] hover:bg-[var(--color-flare-glow)] rounded-xl font-bold text-white transition-all flex items-center justify-center gap-2 group shadow-[var(--shadow-glass-glow)]"
            >
              <span>Join Patreon Community</span>
              <ArrowRight size={16} className="transform group-hover:translate-x-1 transition-transform" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
