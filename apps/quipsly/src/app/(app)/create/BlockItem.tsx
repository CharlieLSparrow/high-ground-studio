import React, { Fragment, useRef, useState, memo, useLayoutEffect } from "react";
import { Trash2, X, Tag, Sparkles } from "lucide-react";
import { Block, uniqueTagIds, canonicalBoundarySuggestion } from "./Tagger";
import { useEditorExtensions } from "./registry/EditorExtensionRegistry";
import CommandPalette from "./CommandPalette";
import { EditorMargin } from "@/components/EditorMargin";

const STRUCTURE_TAG_IDS = new Set(["chapter", "episode"]);

interface BlockItemProps {
  block: Block;
  blockIndex: number;
  boundaryId?: string;
  isOutlineFocused: boolean;
  isSaving: boolean;
  onTextChange: (id: string, text: string) => void;
  onTextBlur: (id: string, text: string) => void;
  onToggleTag: (id: string, tagId: string) => void;
  onSplitBlock: (block: Block, start: number, end: number) => void;
  onMergeWithPrevious: (id: string) => void;
  onPasteBlocks: (id: string, chunks: string[], selectionStart: number, selectionEnd: number) => void;
  onNavigatePrevious?: (id: string) => void;
  onNavigateNext?: (id: string) => void;
  onClearTags: (block: Block) => void;
  onDeleteBlock: (block: Block) => void;
  onNormalizeHeading: (block: Block) => void;
  onAddComment: (blockId: string, start: number, end: number, text: string, body: string) => void;
  onFindSupportingQuote: (blockId: string, text: string) => void;
  onSelectionChange: (id: string, el: HTMLTextAreaElement) => void;
  registerTextareaRef: (id: string, el: HTMLTextAreaElement | null) => void;
  registerWrapperRef: (id: string, el: HTMLDivElement | null) => void;
}

/**
 * Represents a single editable rich-text block in the manuscript.
 * Handles local keystrokes, markdown shortcuts, smart pasting, and structural tag toggling.
 */
function BlockItemComponent({
  block,
  blockIndex,
  boundaryId,
  isOutlineFocused,
  isSaving,
  onTextChange,
  onTextBlur,
  onToggleTag,
  onSplitBlock,
  onMergeWithPrevious,
  onPasteBlocks,
  onNavigatePrevious,
  onNavigateNext,
  onClearTags,
  onDeleteBlock,
  onNormalizeHeading,
  onAddComment,
  onFindSupportingQuote,
  onSelectionChange,
  registerTextareaRef,
  registerWrapperRef
}: BlockItemProps) {
  const { tagDefinitions, blockAccents, blockCards } = useEditorExtensions();
  const findTagDef = (identifier: string) => tagDefinitions.find((t) => (t as any).slug === identifier || t.id === identifier);

  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const internalTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    const el = internalTextareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = el.scrollHeight + 'px';
    }
  }, [block.text]);
  
  const isPlaceholder = block.id.startsWith("offline-");
  const isPending = block.id.startsWith("pending-");

  const [selection, setSelection] = useState<{ start: number; end: number; text: string } | null>(null);
  const [draftComment, setDraftComment] = useState<string | null>(null);

  const applyTagOptions = tagDefinitions.filter(t => t.category === "structure");

  const blockTagIds = uniqueTagIds(block);
  const activeStructureTag = blockTagIds.find((tagId) => STRUCTURE_TAG_IDS.has(tagId));
  const isFullBlockSpan = (span: { startOffset: number; endOffset: number }) => {
    return span.startOffset <= 0 && span.endOffset >= block.text.length;
  };
  const displayedBlockTagIds = blockTagIds.filter((tagId) => {
    if (STRUCTURE_TAG_IDS.has(tagId)) return true;
    const spansForTag = (block.spans ?? []).filter((span) => span.tagSlug === tagId);
    if (spansForTag.length === 0) return true;
    return spansForTag.some(isFullBlockSpan);
  });
  const displayedRangeSpans = (block.spans ?? []).filter((span) => {
    if (STRUCTURE_TAG_IDS.has(span.tagSlug)) return false;
    return !isFullBlockSpan(span);
  });
  
  const structureGlow = activeStructureTag === "chapter"
    ? "ring-1 ring-cyan-200 bg-cyan-50/20"
    : activeStructureTag === "episode"
      ? "ring-1 ring-rose-200 bg-rose-50/20"
      : "";
  const outlineGlow = isOutlineFocused ? "ring-2 ring-amber-300 bg-amber-50/50" : "";
  
  const blockAccent = blockAccents.find(a => a.shouldApply(block, blockTagIds))?.className || "border-l-4 border-l-transparent";

  return (
    <div 
      ref={(el) => registerWrapperRef(block.id, el)}
      data-is-boundary={activeStructureTag && boundaryId ? "true" : "false"}
      data-boundary-id={boundaryId ?? ""}
      className={`relative group px-4 py-3 -mx-4 rounded-lg hover:bg-[#fdfaf6] transition-colors ${blockAccent} ${structureGlow} ${outlineGlow}`}
    >
      {/* AI Assistant Margin */}
      <EditorMargin blockId={block.id} blockText={block.text} onTextChange={(text) => onTextChange(block.id, text)} />

      {/* Render applied tags above the block */}
      {(displayedBlockTagIds.length > 0 || displayedRangeSpans.length > 0) && (
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          {displayedBlockTagIds.map(t => {
            const definition = findTagDef(t);
            if (!definition) return null;
            const Icon = definition.icon;
            return (
              <button
                key={t}
                type="button"
                onClick={() => onToggleTag(block.id, t)}
                onMouseDown={(event) => event.preventDefault()}
                className={`flex items-center gap-1 px-1.5 py-0.5 text-[10px] uppercase tracking-wider font-bold rounded-md border transition-colors hover:brightness-95 ${definition.color}`}
                title={`Remove ${definition.label}`}
              >
                <Icon size={10} />
                {definition.label}
                <X size={10} />
              </button>
            )
          })}
          {displayedRangeSpans.slice(0, 6).map((span) => {
            const definition = findTagDef(span.tagSlug);
            const Icon = definition?.icon ?? Tag;
            const selectedText = (span.selectedText || block.text.slice(span.startOffset, span.endOffset)).trim();
            return (
              <button
                key={span.id ?? `${block.id}-${span.startOffset}-${span.endOffset}-${span.tagSlug}`}
                type="button"
                onClick={() => onToggleTag(block.id, span.tagSlug)}
                onMouseDown={(event) => event.preventDefault()}
                className={`flex max-w-full items-center gap-1 px-1.5 py-0.5 text-[10px] uppercase tracking-wider font-bold rounded-md border transition-colors hover:brightness-95 ${definition?.color ?? "border-[#d4c1a0] bg-white text-[#5e4b33]"}`}
                title={`Remove ${definition?.label ?? span.tagSlug}: ${selectedText}`}
              >
                <Icon size={10} />
                <span className="shrink-0">{definition?.label ?? span.tagSlug}</span>
                {selectedText ? (
                  <span className="min-w-0 max-w-[18rem] truncate normal-case tracking-normal opacity-80 border-l border-current pl-1 ml-0.5">
                    {selectedText}
                  </span>
                ) : null}
                <X size={10} className="shrink-0 opacity-70 ml-0.5" />
              </button>
            );
          })}
          {displayedRangeSpans.length > 6 && (
            <span className="px-1.5 py-0.5 text-[10px] uppercase tracking-wider font-bold rounded-md border border-[#d4c1a0] bg-white text-[#8c6b4a]">
              +{displayedRangeSpans.length - 6} more
            </span>
          )}
        </div>
      )}

      {blockCards.map(card => {
        if (!card.shouldRender(block, blockTagIds)) return null;
        return (
          <Fragment key={card.id}>
            {card.render({ block, onTextChange, onTextCommit: onTextBlur })}
          </Fragment>
        );
      })}

      <textarea
        aria-label={`Editor block ${blockIndex + 1}`}
        className="w-full resize-none overflow-hidden rounded-xl border border-transparent bg-transparent px-4 py-3 font-serif text-xl leading-relaxed text-[#3d3122] outline-none transition-colors hover:border-[#eadfca] hover:bg-white/55 focus:border-[#d8b777] focus:bg-white focus:shadow-inner focus:ring-2 focus:ring-amber-100 placeholder:text-[#d3c2a8] placeholder:opacity-70"
        value={block.text}
        placeholder="Type # for Chapter, Ep for Episode, or just write..."
        onChange={(e) => {
          let nextValue = e.target.value;
          const trimmed = nextValue.toLowerCase();
          
          if (nextValue === "/") {
            setCommandPaletteOpen(true);
          } else if (commandPaletteOpen && !nextValue.startsWith("/")) {
            setCommandPaletteOpen(false);
          }

          // Safe markdown/keyboard transformations
          if (nextValue === '# ' || trimmed === 'chapter ') {
            nextValue = '';
            if (!blockTagIds.includes('chapter')) onToggleTag(block.id, 'chapter');
          } else if (trimmed === 'episode ' || trimmed === 'ep ') {
            nextValue = '';
            if (!blockTagIds.includes('episode')) onToggleTag(block.id, 'episode');
          }
          
          onTextChange(block.id, nextValue);
        }}
        onBlur={(e) => onTextBlur(block.id, e.target.value)}
        onPaste={(e) => {
          const pastedText = e.clipboardData.getData('text/plain');
          if (pastedText && pastedText.includes('\n')) {
            // Check if there are actual multiple non-empty lines
            const chunks = pastedText.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
            if (chunks.length > 1) {
              e.preventDefault();
              onPasteBlocks(block.id, chunks, e.currentTarget.selectionStart, e.currentTarget.selectionEnd);
            }
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Backspace" && e.currentTarget.selectionStart === 0 && e.currentTarget.selectionEnd === 0) {
            e.preventDefault();
            onMergeWithPrevious(block.id);
            return;
          }

          if (e.key === "ArrowUp" && e.currentTarget.selectionStart === 0) {
            e.preventDefault();
            if (onNavigatePrevious) onNavigatePrevious(block.id);
            return;
          }

          if (e.key === "ArrowDown" && e.currentTarget.selectionEnd === block.text.length) {
            e.preventDefault();
            if (onNavigateNext) onNavigateNext(block.id);
            return;
          }

          if (e.key !== "Enter" || e.shiftKey) return;
          e.preventDefault();
          onSplitBlock(block, e.currentTarget.selectionStart, e.currentTarget.selectionEnd);
        }}
        onSelect={(e) => {
          onSelectionChange(block.id, e.currentTarget);
          if (e.currentTarget.selectionStart !== e.currentTarget.selectionEnd) {
            setSelection({
              start: e.currentTarget.selectionStart,
              end: e.currentTarget.selectionEnd,
              text: e.currentTarget.value.substring(e.currentTarget.selectionStart, e.currentTarget.selectionEnd)
            });
          } else {
            setSelection(null);
          }
        }}
        rows={1}
        ref={(el) => {
          internalTextareaRef.current = el;
          registerTextareaRef(block.id, el);
        }}
      />
      
      {commandPaletteOpen && (
        <CommandPalette
          isOpen={true}
          position={{ top: 20, left: 16 }}
          onClose={() => setCommandPaletteOpen(false)}
          onSelectStructure={(tagId) => {
            onTextChange(block.id, "");
            onToggleTag(block.id, tagId);
          }}
        />
      )}
      
      {isSaving && <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-amber-600 shadow-sm animate-pulse">Saving</span>}

      <div 
        role="toolbar" 
        aria-label="Block controls" 
        className="mt-1 min-h-7 flex flex-wrap items-start justify-start gap-1.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100 focus-within:opacity-100 sm:justify-end"
      >
        {canonicalBoundarySuggestion(block.text) ? (
          <button
            type="button"
            onClick={() => onNormalizeHeading(block)}
            className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-900 transition-colors hover:bg-emerald-100"
          >
            Format heading: {canonicalBoundarySuggestion(block.text)}
          </button>
        ) : null}

        {selection && selection.start !== selection.end && !draftComment && (
          <>
            <button
              type="button"
              onClick={() => onFindSupportingQuote(block.id, selection.text)}
              className="inline-flex items-center gap-1 rounded-full border border-purple-200 bg-purple-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-purple-900 transition-colors hover:bg-purple-100"
            >
              <Sparkles size={10} /> Find Quote
            </button>
            <button
              type="button"
              onClick={() => setDraftComment("")}
              className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-blue-900 transition-colors hover:bg-blue-100"
            >
              <Tag size={10} /> Add Note
            </button>
          </>
        )}

        {applyTagOptions.map(tag => {
          const isSelected = activeStructureTag === tag.id;
          const Icon = tag.icon;
          return (
            <button
              key={tag.id}
              type="button"
              onClick={() => onToggleTag(block.id, tag.id)}
              onMouseDown={(event) => event.preventDefault()}
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                isSelected
                  ? 'border-[#d3a24f] bg-amber-100 text-amber-900'
                  : 'border-[#e8dcc4] bg-[#f8f1e3] text-[#8c6b4a] hover:bg-[#ebdcc8] hover:text-[#3d3122]'
              }`}
              title={isSelected ? `Remove ${tag.label} from outline` : `Add ${tag.label} to outline`}
              aria-label={isSelected ? `Remove ${tag.label} from outline` : `Add ${tag.label} to outline`}
            >
              <Icon size={10} />
              {isSelected ? `${tag.label} (In outline)` : `Make ${tag.label}`}
            </button>
          );
        })}

        {blockIndex > 0 ? (
          <button
            type="button"
            onClick={() => onMergeWithPrevious(block.id)}
            onMouseDown={(event) => event.preventDefault()}
            aria-label="Merge block with previous block"
            className="inline-flex items-center gap-1 rounded-full border border-[#e8dcc4] bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#8c6b4a] transition-colors hover:bg-[#f8f1e3] hover:text-[#3d3122]"
          >
            Merge up
          </button>
        ) : null}

        {blockTagIds.length > 0 ? (
          <button
            type="button"
            onClick={() => onClearTags(block)}
            onMouseDown={(event) => event.preventDefault()}
            aria-label="Clear all tags from this block"
            className="inline-flex items-center gap-1 rounded-full border border-[#e8dcc4] bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#8c6b4a] transition-colors hover:bg-[#f8f1e3] hover:text-[#3d3122]"
          >
            Clear tags
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => onDeleteBlock(block)}
          onMouseDown={(event) => event.preventDefault()}
          aria-label="Delete this block"
          title="Deletes this block from the manuscript. Undo is available immediately."
          className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-rose-800 transition-colors hover:bg-rose-100"
        >
          <Trash2 size={10} />
          Delete block
        </button>
      </div>

      {/* Margin Annotations / Right Column */}
      <div className="absolute -right-64 top-0 w-56 flex flex-col gap-2">
        {draftComment !== null && selection && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 shadow-sm relative z-20">
            <div className="text-[10px] font-bold text-amber-600 mb-1 line-clamp-2 italic">
              "{selection.text}"
            </div>
            <textarea
              autoFocus
              className="w-full text-sm bg-white border border-amber-200 rounded p-1.5 focus:outline-none focus:ring-1 focus:ring-amber-400"
              placeholder="Add your note..."
              value={draftComment}
              onChange={(e) => setDraftComment(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (draftComment.trim()) {
                    onAddComment(block.id, selection.start, selection.end, selection.text, draftComment);
                    setDraftComment(null);
                    setSelection(null);
                  }
                } else if (e.key === "Escape") {
                  setDraftComment(null);
                }
              }}
            />
            <div className="flex gap-2 mt-1">
              <button
                className="text-[10px] font-bold bg-amber-600 text-white px-2 py-0.5 rounded hover:bg-amber-700"
                onClick={() => {
                  if (draftComment.trim()) {
                    onAddComment(block.id, selection.start, selection.end, selection.text, draftComment);
                    setDraftComment(null);
                    setSelection(null);
                  }
                }}
              >
                Save
              </button>
              <button
                className="text-[10px] font-bold text-amber-600 hover:underline"
                onClick={() => setDraftComment(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {block.spans?.filter(span => span.tagSlug === "comment").map((span, idx) => (
          <div key={span.id || idx} className="bg-white border border-amber-200 rounded-lg p-2 shadow-sm group hover:border-amber-400 transition-colors">
            <div className="text-[10px] text-amber-600/70 mb-1 line-clamp-1 italic truncate">
              "{span.selectedText}"
            </div>
            <div className="text-sm text-amber-950 whitespace-pre-wrap">
              {span.noteBody}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Memoized block component. This is the primary scale performance optimization
 * for the editor. By providing a strict equality check, only blocks that explicitly
 * receive new text, tags, or focus states will re-render during typing, preventing
 * the entire manuscript from re-rendering on every keystroke.
 */
export const BlockItem = memo(BlockItemComponent, (prev, next) => {
  return (
    prev.block.id === next.block.id &&
    prev.block.text === next.block.text &&
    prev.block.tags === next.block.tags &&
    prev.block.spans === next.block.spans &&
    prev.blockIndex === next.blockIndex &&
    prev.boundaryId === next.boundaryId &&
    prev.isOutlineFocused === next.isOutlineFocused &&
    prev.isSaving === next.isSaving
  );
});
