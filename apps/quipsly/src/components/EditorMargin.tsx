"use client";

import { useAssistant } from "./AssistantContext";
import { Sparkles, ImagePlus, Loader2 } from "lucide-react";
import { useState } from "react";
import { QuipslyAssistantPopover } from "./QuipslyAssistantPopover";

export function EditorMargin({ blockId, blockText, onTextChange }: { blockId: string; blockText: string, onTextChange?: (text: string) => void }) {
  const { actions, approveAction, rejectAction } = useAssistant();
  const [isOpen, setIsOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Find proposed actions that might be relevant to this block
  // If the action explicitly targets this blockId, or if it's a general structural suggestion
  // matching the block's text. For now, we'll just check if there are *any* proposed actions
  // and we'll show the spark on the first block that has a relevant suggestion, or just show
  // it generically if it's a block-specific payload.
  
  // A heuristic for beta:
  const relevantActions = actions.filter((a) => {
    if (a.status !== "proposed") return false;
    
    const p = a.payload || {};
    if (p.blockId === blockId) return true;
    if (p.originalText && typeof p.originalText === "string" && blockText.includes(p.originalText)) return true;
    
    // Fallback: If it's a general suggestion, maybe show it?
    // Let's just bind to explicit payloads for the margin.
    return false;
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/assets/upload", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        if (data.url && onTextChange) {
          const newText = blockText + (blockText ? `\n\n![${file.name}](${data.url})` : `![${file.name}](${data.url})`);
          onTextChange(newText);
        }
      }
    } catch (err) {
      console.error("Upload failed", err);
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  if (relevantActions.length === 0 && !onTextChange) {
    // Return an invisible placeholder to keep the margin space consistent, or nothing if absolute.
    // We'll return null to let the parent handle layout.
    return null;
  }

  return (
    <div className="absolute -left-12 top-3 z-10 flex flex-col items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
      {relevantActions.length > 0 && (
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="group/btn relative flex h-8 w-8 items-center justify-center rounded-full bg-amber-50 text-amber-600 hover:bg-amber-100 ring-1 ring-amber-200 shadow-sm transition-all hover:scale-110"
          title="Quipsly has a suggestion"
        >
          <Sparkles size={16} className="animate-pulse" />
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white shadow-sm">
            {relevantActions.length}
          </span>
        </button>
      )}

      {onTextChange && (
        <label
          className="group/btn relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-slate-50 text-slate-500 hover:bg-slate-100 ring-1 ring-slate-200 shadow-sm transition-all hover:scale-110"
          title="Upload Asset"
        >
          {isUploading ? (
            <Loader2 size={16} className="animate-spin text-indigo-500" />
          ) : (
            <ImagePlus size={16} />
          )}
          <input type="file" className="hidden" accept="image/*" onChange={handleUpload} disabled={isUploading} />
        </label>
      )}

      {isOpen && relevantActions.length > 0 && (
        <div className="absolute top-full left-0 mt-2">
          <QuipslyAssistantPopover
            actions={relevantActions}
            onClose={() => setIsOpen(false)}
            onApprove={(action) => approveAction(action)}
            onReject={(action) => rejectAction(action)}
          />
        </div>
      )}
    </div>
  );
}
