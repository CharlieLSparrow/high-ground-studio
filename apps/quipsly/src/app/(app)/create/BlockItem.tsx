import React, { Fragment, useRef, useState, memo, useLayoutEffect } from "react";
import { BookOpenCheck, Check, Plus, Sparkles, Tag, Tags, Trash2, X } from "lucide-react";
import { Block, uniqueTagIds, canonicalBoundarySuggestion } from "./Tagger";
import { useEditorExtensions } from "./registry/EditorExtensionRegistry";
import CommandPalette from "./CommandPalette";
import { EditorMargin } from "@/components/EditorMargin";

const STRUCTURE_TAG_IDS = new Set(["chapter", "episode"]);

interface BlockItemProps {
  block: Block;
  blockIndex: number;
  previousBlockIsImmutable: boolean;
  boundaryId?: string;
  isOutlineFocused: boolean;
  isSaving: boolean;
  onTextChange: (id: string, text: string) => void;
  onTextBlur: (id: string, text: string) => void;
  onToggleTag: (
    id: string,
    tagId: string,
    selection?: { startOffset: number; endOffset: number; selectedText: string } | null,
  ) => Promise<
    | { ok: true; operation: "added" | "removed" }
    | { ok: false; error: string }
  >;
  onSplitBlock: (block: Block, start: number, end: number) => void;
  onMergeWithPrevious: (id: string) => void;
  onPasteBlocks: (id: string, chunks: string[], selectionStart: number, selectionEnd: number) => void;
  onNavigatePrevious?: (id: string) => void;
  onNavigateNext?: (id: string) => void;
  onClearTags: (block: Block) => void;
  onDeleteBlock: (block: Block) => void;
  onNormalizeHeading: (block: Block) => void;
  onAddComment: (blockId: string, start: number, end: number, text: string, body: string) => Promise<boolean>;
  onCreatePassageTag: (
    blockId: string,
    start: number,
    end: number,
    text: string,
    label: string,
  ) => Promise<
    | { ok: true; created: boolean; tagLabel: string }
    | { ok: false; error: string }
  >;
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
  previousBlockIsImmutable,
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
  onCreatePassageTag,
  onFindSupportingQuote,
  onSelectionChange,
  registerTextareaRef,
  registerWrapperRef
}: BlockItemProps) {
  const { tagDefinitions, blockAccents, blockCards } = useEditorExtensions();
  const findTagDef = (identifier: string) => tagDefinitions.find((tag) => tag.id === identifier);

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
  const isImmutableSource = block.sourceEvidence?.immutable === true;

  const [selection, setSelection] = useState<{ start: number; end: number; text: string } | null>(null);
  const [draftComment, setDraftComment] = useState<string | null>(null);
  const [isSavingComment, setIsSavingComment] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [tagQuery, setTagQuery] = useState("");
  const [newTagLabel, setNewTagLabel] = useState("");
  const [isCreatingTag, setIsCreatingTag] = useState(false);
  const [tagMessage, setTagMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const submitDraftComment = async () => {
    if (!selection || !draftComment?.trim() || isSavingComment) return;
    setIsSavingComment(true);
    setCommentError(null);
    try {
      const saved = await onAddComment(
        block.id,
        selection.start,
        selection.end,
        selection.text,
        draftComment,
      );
      if (saved) {
        setDraftComment(null);
        setSelection(null);
        setTagPickerOpen(false);
      } else {
        setCommentError("Comment not saved. Your draft remains here so you can copy it.");
      }
    } finally {
      setIsSavingComment(false);
    }
  };

  const createSelectedPassageTag = async () => {
    if (!selection || !newTagLabel.trim() || isCreatingTag) return;
    setIsCreatingTag(true);
    setTagMessage(null);
    try {
      const result = await onCreatePassageTag(
        block.id,
        selection.start,
        selection.end,
        selection.text,
        newTagLabel,
      );
      if (!result.ok) {
        setTagMessage({ tone: "error", text: result.error });
        return;
      }
      setNewTagLabel("");
      setTagQuery(result.tagLabel);
      setTagMessage({
        tone: "success",
        text: result.created
          ? `Created #${result.tagLabel} for this Nest and applied it here.`
          : `Applied the existing #${result.tagLabel}; no duplicate tag was created.`,
      });
    } finally {
      setIsCreatingTag(false);
    }
  };

  const applyTagOptions = tagDefinitions.filter(t => t.category === "structure");
  const passageTagOptions = tagDefinitions
    .filter((tag) => tag.isProjectTag && tag.category !== "structure" && tag.id !== "comment")
    .filter((tag) => {
      const query = tagQuery.trim().toLocaleLowerCase();
      return !query || `${tag.label} ${tag.id} ${tag.category}`.toLocaleLowerCase().includes(query);
    })
    .sort((left, right) => left.label.localeCompare(right.label))
    .slice(0, 24);

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
      {!isImmutableSource ? (
        <EditorMargin blockId={block.id} blockText={block.text} onTextChange={(text) => onTextChange(block.id, text)} />
      ) : null}

      {block.sourceEvidence ? (
        <div className="mb-3 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2.5 text-xs leading-5 text-cyan-950" aria-label="Source evidence provenance">
          <div className="flex flex-wrap items-center gap-2">
            <BookOpenCheck size={15} aria-hidden="true" />
            <span className="font-black uppercase tracking-[0.1em]">{isImmutableSource ? "Pinned transcript evidence" : "Source-linked draft"}</span>
            <span className="text-cyan-800">{isImmutableSource ? "Read-only source snapshot" : "Immutable source unchanged"}</span>
          </div>
          <p className="mt-1.5 font-semibold">{block.sourceEvidence.citationLabel}</p>
          <div className="mt-1 flex flex-wrap gap-3">
            <a href="/research" className="font-black underline decoration-cyan-300 underline-offset-4">Open Research</a>
            {block.sourceEvidence.sourcePath ? (
              <a
                href={block.sourceEvidence.sourcePath}
                target={block.sourceEvidence.sourcePath.startsWith("http") ? "_blank" : undefined}
                rel={block.sourceEvidence.sourcePath.startsWith("http") ? "noreferrer" : undefined}
                className="font-black underline decoration-cyan-300 underline-offset-4"
              >Open exact source</a>
            ) : null}
          </div>
        </div>
      ) : null}

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
                onClick={() => onToggleTag(block.id, t, null)}
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
                onClick={() => onToggleTag(block.id, span.tagSlug, {
                  startOffset: span.startOffset,
                  endOffset: span.endOffset,
                  selectedText: span.selectedText,
                })}
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

      {!isImmutableSource ? blockCards.map(card => {
        if (!card.shouldRender(block, blockTagIds)) return null;
        return (
          <Fragment key={card.id}>
            {card.render({ block, onTextChange, onTextCommit: onTextBlur })}
          </Fragment>
        );
      }) : null}

      <textarea
        aria-label={isImmutableSource ? `Source evidence block ${blockIndex + 1}` : `Editor block ${blockIndex + 1}`}
        readOnly={isImmutableSource}
        className={`w-full resize-none overflow-hidden rounded-xl px-4 py-3 font-serif text-xl leading-relaxed text-[#3d3122] outline-none transition-colors placeholder:text-[#d3c2a8] placeholder:opacity-70 ${isImmutableSource ? "cursor-text border border-cyan-200 bg-cyan-50/60" : "border border-transparent bg-transparent hover:border-[#eadfca] hover:bg-white/55 focus:border-[#d8b777] focus:bg-white focus:shadow-inner focus:ring-2 focus:ring-amber-100"}`}
        value={block.text}
        placeholder="Type # for Chapter, Ep for Episode, or just write..."
        onChange={(e) => {
          if (isImmutableSource) return;
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
        onBlur={(e) => {
          if (!isImmutableSource) onTextBlur(block.id, e.target.value);
        }}
        onPaste={(e) => {
          if (isImmutableSource) {
            e.preventDefault();
            return;
          }
          const pastedText = e.clipboardData.getData('text/plain');
          const canSplitIntoCanonicalBlocks = !block.sourceEvidence && (block.spans?.length ?? 0) === 0;
          if (canSplitIntoCanonicalBlocks && pastedText && pastedText.includes('\n')) {
            // Check if there are actual multiple non-empty lines
            const chunks = pastedText.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
            if (chunks.length > 1) {
              e.preventDefault();
              onPasteBlocks(block.id, chunks, e.currentTarget.selectionStart, e.currentTarget.selectionEnd);
            }
          }
        }}
        onKeyDown={(e) => {
          if (isImmutableSource) {
            if (e.key === "ArrowUp" && e.currentTarget.selectionStart === 0) {
              e.preventDefault();
              onNavigatePrevious?.(block.id);
            } else if (e.key === "ArrowDown" && e.currentTarget.selectionEnd === block.text.length) {
              e.preventDefault();
              onNavigateNext?.(block.id);
            }
            return;
          }
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
            setTagMessage(null);
          } else {
            setSelection(null);
            setTagPickerOpen(false);
            setTagMessage(null);
          }
        }}
        rows={1}
        ref={(el) => {
          internalTextareaRef.current = el;
          registerTextareaRef(block.id, el);
        }}
      />
      
      {commandPaletteOpen && !isImmutableSource && (
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
        {!isImmutableSource && canonicalBoundarySuggestion(block.text) ? (
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
              data-testid="passage-tag-open"
              aria-expanded={tagPickerOpen}
              aria-controls={`passage-tag-picker-${block.id}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setTagPickerOpen((open) => !open);
                setTagMessage(null);
              }}
              className="inline-flex min-h-9 items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-sky-900 transition-colors hover:bg-sky-100"
            >
              <Tags size={12} /> Tag passage
            </button>
            <button
              type="button"
              onClick={() => onFindSupportingQuote(block.id, selection.text)}
              className="inline-flex items-center gap-1 rounded-full border border-purple-200 bg-purple-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-purple-900 transition-colors hover:bg-purple-100"
            >
              <Sparkles size={10} /> Find Quote
            </button>
            <button
              type="button"
              onClick={() => {
                setCommentError(null);
                setDraftComment("");
              }}
              className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-blue-900 transition-colors hover:bg-blue-100"
            >
              <Tag size={10} /> Add Note
            </button>
          </>
        )}

        {!isImmutableSource ? applyTagOptions.map(tag => {
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
        }) : null}

        {blockIndex > 0 && !isImmutableSource && !previousBlockIsImmutable ? (
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

        {!isImmutableSource ? <button
          type="button"
          onClick={() => onDeleteBlock(block)}
          onMouseDown={(event) => event.preventDefault()}
          aria-label="Delete this block"
          title="Deletes this block from the manuscript. Undo is available immediately."
          className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-rose-800 transition-colors hover:bg-rose-100"
        >
          <Trash2 size={10} />
          Delete block
        </button> : null}
      </div>

      {selection && tagPickerOpen ? (
        <section
          id={`passage-tag-picker-${block.id}`}
          data-testid="passage-tag-picker"
          aria-label="Tag selected passage"
          className="relative z-20 mt-3 rounded-2xl border border-sky-200 bg-white p-4 shadow-lg"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-[0.16em] text-sky-800">Reusable Nest tags</div>
              <p className="mt-1 truncate text-sm font-semibold text-sky-950">“{selection.text}”</p>
            </div>
            <button
              type="button"
              aria-label="Close passage tag picker"
              onClick={() => setTagPickerOpen(false)}
              className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-full border border-sky-200 text-sky-800 hover:bg-sky-50"
            >
              <X size={15} />
            </button>
          </div>

          <label className="mt-4 block text-[10px] font-black uppercase tracking-wide text-sky-900">
            Find a tag
            <input
              type="search"
              value={tagQuery}
              onChange={(event) => {
                setTagQuery(event.target.value);
                setTagMessage(null);
              }}
              placeholder="Search this Nest’s vocabulary"
              className="mt-1 min-h-11 w-full rounded-xl border border-sky-200 bg-sky-50/40 px-3 text-sm font-semibold normal-case tracking-normal text-sky-950 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />
          </label>

          <div className="mt-3 flex max-h-52 flex-wrap gap-2 overflow-y-auto pr-1">
            {passageTagOptions.map((tag) => {
              const applied = (block.spans ?? []).some((span) =>
                span.tagSlug === tag.id
                && span.startOffset === selection.start
                && span.endOffset === selection.end
              );
              const Icon = tag.icon;
              return (
                <button
                  key={tag.id}
                  type="button"
                  aria-pressed={applied}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    void onToggleTag(block.id, tag.id, {
                      startOffset: selection.start,
                      endOffset: selection.end,
                      selectedText: selection.text,
                    }).then((result) => {
                      setTagMessage(result.ok
                        ? {
                            tone: "success",
                            text: result.operation === "removed"
                              ? `Removed #${tag.label} from this passage.`
                              : `Applied #${tag.label} to this passage.`,
                          }
                        : { tone: "error", text: result.error });
                    });
                  }}
                  className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-bold transition-colors ${tag.color}`}
                  title={tag.description}
                >
                  {applied ? <Check size={13} /> : <Icon size={13} />}
                  {tag.label}
                </button>
              );
            })}
            {passageTagOptions.length === 0 ? (
              <p className="py-2 text-xs font-semibold text-sky-800">No existing tags match. Create a clear reusable name below.</p>
            ) : null}
          </div>

          <form
            className="mt-4 border-t border-sky-100 pt-4"
            onSubmit={(event) => {
              event.preventDefault();
              void createSelectedPassageTag();
            }}
          >
            <label className="block text-[10px] font-black uppercase tracking-wide text-sky-900">
              New reusable tag
              <input
                value={newTagLabel}
                onChange={(event) => {
                  setNewTagLabel(event.target.value);
                  setTagMessage(null);
                }}
                maxLength={80}
                required
                placeholder="e.g. Episode seed"
                className="mt-1 min-h-11 w-full rounded-xl border border-sky-200 px-3 text-sm font-semibold normal-case tracking-normal text-sky-950 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              />
            </label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[11px] font-semibold leading-5 text-sky-800">
                Shared inside this Nest with notes, tasks, goals, sessions, and writing. Exact names reuse the canonical tag.
              </p>
              <button
                type="submit"
                disabled={isCreatingTag || !newTagLabel.trim()}
                className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-full bg-sky-800 px-4 py-2 text-[10px] font-black uppercase tracking-wide text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus size={13} />
                {isCreatingTag ? "Creating…" : "Create & apply"}
              </button>
            </div>
          </form>
          {tagMessage ? (
            <p
              role="status"
              className={`mt-3 text-xs font-bold ${tagMessage.tone === "error" ? "text-rose-700" : "text-sky-950"}`}
            >
              {tagMessage.text}
            </p>
          ) : null}
        </section>
      ) : null}

      {/* Margin Annotations / Right Column */}
      <div className="mt-3 flex flex-col gap-2 xl:absolute xl:-right-64 xl:top-0 xl:mt-0 xl:w-56">
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
                    void submitDraftComment();
                  }
                } else if (e.key === "Escape") {
                  setDraftComment(null);
                  setCommentError(null);
                }
              }}
            />
            {commentError ? (
              <p className="mt-1 text-[10px] font-bold leading-4 text-rose-700" role="alert">{commentError}</p>
            ) : null}
            <div className="flex gap-2 mt-1">
              <button
                className="text-[10px] font-bold bg-amber-600 text-white px-2 py-0.5 rounded hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isSavingComment}
                onClick={() => {
                  if (draftComment.trim()) {
                    void submitDraftComment();
                  }
                }}
              >
                {isSavingComment ? "Saving..." : "Save"}
              </button>
              <button
                className="text-[10px] font-bold text-amber-600 hover:underline"
                disabled={isSavingComment}
                onClick={() => {
                  setDraftComment(null);
                  setCommentError(null);
                }}
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
    prev.block.sourceEvidence === next.block.sourceEvidence &&
    prev.blockIndex === next.blockIndex &&
    prev.previousBlockIsImmutable === next.previousBlockIsImmutable &&
    prev.boundaryId === next.boundaryId &&
    prev.isOutlineFocused === next.isOutlineFocused &&
    prev.isSaving === next.isSaving
  );
});
