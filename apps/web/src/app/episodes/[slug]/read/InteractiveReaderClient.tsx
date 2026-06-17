"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useState, useEffect, useRef } from "react";
import { Sparkles, Bookmark, Lock, ArrowRight, Check } from "lucide-react";

interface PopoverPosition {
  x: number;
  y: number;
}

// Helper to clear highlights by replacing span elements with text nodes and normalizing
const clearHighlights = (container: HTMLElement) => {
  const highlighted = container.querySelectorAll(".hgo-highlight");
  highlighted.forEach((el) => {
    const textNode = document.createTextNode(el.textContent || "");
    el.replaceWith(textNode);
  });
  container.normalize();
};

// Helper to highlight passages in the DOM
const highlightDOMText = (container: HTMLElement, passages: string[]) => {
  if (!container) return;
  clearHighlights(container);
  if (!passages || passages.length === 0) return;

  passages.forEach((passage) => {
    if (!passage.trim()) return;

    // Create a TreeWalker to find all text nodes
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const textNodes: Node[] = [];
    let currentNode = walker.nextNode();
    while (currentNode) {
      textNodes.push(currentNode);
      currentNode = walker.nextNode();
    }

    textNodes.forEach((node) => {
      const parent = node.parentNode as HTMLElement | null;
      if (!parent) return;

      // Skip text nodes already inside a highlight span or inside script/style tags
      if (
        parent.classList.contains("hgo-highlight") ||
        parent.tagName === "SCRIPT" ||
        parent.tagName === "STYLE"
      ) {
        return;
      }

      const text = node.textContent || "";
      let index = text.indexOf(passage);
      if (index === -1) return;

      const fragment = document.createDocumentFragment();
      let lastIndex = 0;

      while (index !== -1) {
        const beforeText = text.substring(lastIndex, index);
        if (beforeText) {
          fragment.appendChild(document.createTextNode(beforeText));
        }

        const matchText = text.substring(index, index + passage.length);
        const span = document.createElement("span");
        span.className = "hgo-highlight";
        span.textContent = matchText;
        fragment.appendChild(span);

        lastIndex = index + passage.length;
        index = text.indexOf(passage, lastIndex);
      }

      const remainingText = text.substring(lastIndex);
      if (remainingText) {
        fragment.appendChild(document.createTextNode(remainingText));
      }

      parent.replaceChild(fragment, node);
    });
  });
};

export interface HighlightSnippet {
  id: string;
  highlightedText: string;
  note?: string | null;
  createdAt: string;
}

function HighlightCard({
  highlight,
  onDelete,
  onUpdateNote,
}: {
  highlight: HighlightSnippet;
  onDelete: (id: string) => Promise<void>;
  onUpdateNote: (id: string, note: string) => Promise<void>;
}) {
  const [note, setNote] = useState(highlight.note || "");
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleBlur = async () => {
    setIsEditing(false);
    if (note === (highlight.note || "")) return;
    
    setIsSaving(true);
    try {
      await onUpdateNote(highlight.id, note);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isEditing]);

  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4 text-left transition hover:border-white/10 flex flex-col gap-3 relative">
      <blockquote className="border-l-2 border-[var(--color-flare)] pl-3 text-[13px] italic text-zinc-200 line-clamp-3">
        "{highlight.highlightedText}"
      </blockquote>
      
      {/* Note Area */}
      <div className="text-xs">
        {isEditing ? (
          <textarea
            ref={textareaRef}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={handleBlur}
            className="w-full bg-void border border-white/10 rounded-xl p-2.5 text-xs text-zinc-200 outline-none resize-none focus:border-[var(--color-flare)] animate-fade-in"
            rows={2}
            placeholder="Write a personal study note..."
          />
        ) : (
          <div 
            onClick={() => setIsEditing(true)}
            className="cursor-pointer group flex items-center justify-between bg-black/10 hover:bg-black/20 px-3 py-2 rounded-xl text-zinc-400 min-h-[32px] transition"
          >
            <span className="truncate max-w-[200px]">
              {note ? note : <span className="italic text-zinc-500">Add personal notes...</span>}
            </span>
            <span className="text-[10px] opacity-0 group-hover:opacity-100 text-[var(--color-flare)] transition">
              Edit
            </span>
          </div>
        )}
      </div>

      {/* Card Footer */}
      <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono border-t border-white/5 pt-2.5">
        <span>
          {highlight.createdAt ? new Date(highlight.createdAt).toLocaleDateString() : ""}
        </span>
        
        <div className="flex items-center gap-2">
          {isSaving && <span className="text-zinc-500 animate-pulse">Saving...</span>}
          <button
            onClick={() => onDelete(highlight.id)}
            className="text-red-400/70 hover:text-red-400 uppercase font-black tracking-wider transition cursor-pointer"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export default function InteractiveReaderClient({
  content,
  isPatreonMember,
  episodeSlug,
  savedHighlights = [],
}: {
  content: string;
  isPatreonMember: boolean;
  episodeSlug: string;
  savedHighlights?: HighlightSnippet[];
}) {
  const [selectedText, setSelectedText] = useState("");
  const [popoverPos, setPopoverPos] = useState<PopoverPosition | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [localHighlights, setLocalHighlights] = useState<HighlightSnippet[]>(savedHighlights);
  
  const containerRef = useRef<HTMLDivElement>(null);

  // Gated content for non-members: show a 3-paragraph preview to entice them
  let visibleContent = content;
  if (!isPatreonMember) {
    const paragraphs = content.split("</p>").map((p) => p.trim()).filter(Boolean);
    if (paragraphs.length > 3) {
      visibleContent = paragraphs.slice(0, 3).map((p) => p + "</p>").join("") + '<p class="opacity-40">...</p>';
    } else {
      visibleContent = paragraphs.map((p) => p + "</p>").join("");
    }
  }

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

  // Apply highlights when editor is ready and localHighlights changes
  useEffect(() => {
    if (!editor || !containerRef.current) return;

    const timer = setTimeout(() => {
      const editorElement = containerRef.current?.querySelector(".ProseMirror") as HTMLElement | null;
      if (editorElement) {
        highlightDOMText(editorElement, localHighlights.map((h) => h.highlightedText));
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [editor, localHighlights]);

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
        
        const newSnippet: HighlightSnippet = {
          id: data.snippet.id,
          highlightedText: data.snippet.highlightedText,
          note: data.snippet.note,
          createdAt: data.snippet.createdAt,
        };
        setLocalHighlights((prev) => [newSnippet, ...prev]);
        
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

  const handleDeleteHighlight = async (id: string) => {
    if (!confirm("Are you sure you want to delete this highlight?")) return;
    
    try {
      const response = await fetch("/api/snippets", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ snippetId: id }),
      });
      
      if (response.ok) {
        setLocalHighlights((prev) => prev.filter((h) => h.id !== id));
      } else {
        alert("Failed to delete highlight.");
      }
    } catch (err) {
      console.error(err);
      alert("Error occurred while deleting highlight.");
    }
  };

  const handleUpdateNote = async (id: string, newNote: string) => {
    try {
      const response = await fetch("/api/snippets", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ snippetId: id, note: newNote }),
      });
      
      if (response.ok) {
        const data = await response.json();
        setLocalHighlights((prev) => 
          prev.map((h) => h.id === id ? { ...h, note: data.snippet.note } : h)
        );
      } else {
        throw new Error("Failed to save note.");
      }
    } catch (err) {
      console.error(err);
      throw err;
    }
  };

  if (!editor) {
    return null;
  }

  return (
    <div className={`grid grid-cols-1 ${isPatreonMember ? "lg:grid-cols-[1fr_320px]" : ""} gap-8 w-full`}>
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
              className="flex items-center gap-1.5 text-[12px] font-bold text-white hover:text-[var(--color-flare-glow)] transition-colors cursor-pointer"
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
          <div className="absolute inset-x-0 bottom-0 top-[30%] flex flex-col justify-end items-center bg-gradient-to-t from-void via-void/95 to-transparent pt-32 pb-4">
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

      {/* Highlights Side Panel (Only for Patreon Members) */}
      {isPatreonMember && (
        <aside className="border-t lg:border-t-0 lg:border-l border-white/10 pt-8 lg:pt-0 lg:pl-8 flex flex-col h-full">
          <h3 className="text-lg font-black text-white mb-6 flex items-center gap-2 border-b border-white/5 pb-3">
            <Bookmark size={18} className="text-[var(--color-flare)]" />
            <span>Episode Notes</span>
            <span className="text-xs px-2 py-0.5 bg-white/10 rounded-full font-bold text-zinc-400">
              {localHighlights.length}
            </span>
          </h3>

          <div className="space-y-4 overflow-y-auto max-h-[600px] pr-2 custom-scrollbar flex flex-col">
            {localHighlights.length === 0 ? (
              <div className="text-xs text-zinc-400 border border-dashed border-white/5 rounded-2xl p-6 text-center leading-relaxed">
                Select any text in the transcript and click <strong>"Highlight"</strong> to save passages and write custom study notes here.
              </div>
            ) : (
              localHighlights.map((highlight) => (
                <HighlightCard
                  key={highlight.id}
                  highlight={highlight}
                  onDelete={handleDeleteHighlight}
                  onUpdateNote={handleUpdateNote}
                />
              ))
            )}
          </div>
        </aside>
      )}
    </div>
  );
}
