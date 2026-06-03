"use client";

import { useState, useEffect, useRef } from "react";
import { Plus, Tag, MessageSquare, Mic, List, PlayCircle } from "lucide-react";
import { DocumentBoundary, ViewDefinition } from "./types";
import { saveBlockContent, splitBlockAtOffset, toggleBlockTag } from "./actions";
import ClipCueCard, { hasYouTubeClipCue } from "./ClipCueCard";

type Block = {
  id: string;
  text: string;
  tags: string[];
  spans?: TaggedSpan[];
};

type TaggedSpan = {
  id: string;
  tagSlug: string;
  label?: string;
  category?: string;
  startOffset: number;
  endOffset: number;
  selectedText: string;
};

const AVAILABLE_TAGS = [
  { id: "quote", label: "Quote", category: "quote", icon: MessageSquare, color: "bg-blue-100 text-blue-800 border-blue-200", mark: "bg-blue-100 text-blue-950 ring-blue-200" },
  { id: "social-clip", label: "Social Clip", category: "media", icon: Mic, color: "bg-purple-100 text-purple-800 border-purple-200", mark: "bg-purple-100 text-purple-950 ring-purple-200" },
  { id: "educational", label: "Educational", category: "educational", icon: List, color: "bg-green-100 text-green-800 border-green-200", mark: "bg-green-100 text-green-950 ring-green-200" },
  { id: "internal_note", label: "Internal Note", category: "internal_note", icon: Tag, color: "bg-gray-100 text-gray-800 border-gray-200", mark: "bg-gray-100 text-gray-950 ring-gray-200" },
  { id: "media", label: "Media", category: "media", icon: PlayCircle, color: "bg-orange-100 text-orange-900 border-orange-200", mark: "bg-orange-100 text-orange-950 ring-orange-200" },
  { id: "episode-4", label: "Episode 4", category: "episode", icon: PlayCircle, color: "bg-red-100 text-red-800 border-red-200", mark: "bg-red-100 text-red-950 ring-red-200" },
  { id: "episode-8", label: "Episode 8", category: "episode", icon: PlayCircle, color: "bg-red-100 text-red-800 border-red-200", mark: "bg-red-100 text-red-950 ring-red-200" },
  { id: "episode-9", label: "Episode 9", category: "episode", icon: PlayCircle, color: "bg-red-100 text-red-800 border-red-200", mark: "bg-red-100 text-red-950 ring-red-200" },
  { id: "voice-homer", label: "Homer", category: "content_role", icon: Mic, color: "bg-emerald-100 text-emerald-900 border-emerald-200", mark: "bg-emerald-100 text-emerald-950 ring-emerald-200" },
  { id: "voice-charlie", label: "Charlie", category: "content_role", icon: MessageSquare, color: "bg-sky-100 text-sky-900 border-sky-200", mark: "bg-sky-100 text-sky-950 ring-sky-200" },
  { id: "show-note", label: "Show Note", category: "workflow_status", icon: List, color: "bg-yellow-100 text-yellow-900 border-yellow-200", mark: "bg-yellow-100 text-yellow-950 ring-yellow-200" },
  { id: "clip-cue", label: "Clip Cue", category: "media", icon: PlayCircle, color: "bg-orange-100 text-orange-900 border-orange-200", mark: "bg-orange-100 text-orange-950 ring-orange-200" },
  { id: "youtube-clip", label: "YouTube Clip", category: "media", icon: PlayCircle, color: "bg-rose-100 text-rose-900 border-rose-200", mark: "bg-rose-100 text-rose-950 ring-rose-200" }
];

function tagDef(tagId: string) {
  return AVAILABLE_TAGS.find(tag => tag.id === tagId);
}

function uniqueTagIds(block: Block) {
  return Array.from(new Set([
    ...block.tags,
    ...(block.spans ?? []).map(span => span.tagSlug)
  ]));
}

function blockAccentClass(block: Block) {
  const tagIds = uniqueTagIds(block);
  if (tagIds.includes("voice-homer")) return "border-l-4 border-l-emerald-400 bg-emerald-50/30";
  if (tagIds.includes("voice-charlie")) return "border-l-4 border-l-sky-400 bg-sky-50/30";
  if (tagIds.includes("show-note")) return "border-l-4 border-l-yellow-400 bg-yellow-50/40";
  if (tagIds.includes("clip-cue") || tagIds.includes("youtube-clip")) return "border-l-4 border-l-orange-400 bg-orange-50/40";
  return "border-l-4 border-l-transparent";
}

function shouldShowClipCueCard(block: Block) {
  const tagIds = uniqueTagIds(block);
  return tagIds.includes("clip-cue") || tagIds.includes("youtube-clip") || hasYouTubeClipCue(block.text);
}

function markedSegments(block: Block) {
  const spans = (block.spans ?? [])
    .filter(span => span.endOffset > span.startOffset)
    .filter(span => span.startOffset >= 0 && span.endOffset <= block.text.length)
    .sort((a, b) => a.startOffset - b.startOffset || b.endOffset - a.endOffset);
  const segments: Array<{ text: string; tagSlug?: string; label?: string }> = [];
  let cursor = 0;

  for (const span of spans) {
    if (span.startOffset < cursor) continue;
    if (span.startOffset > cursor) {
      segments.push({ text: block.text.slice(cursor, span.startOffset) });
    }
    segments.push({
      text: block.text.slice(span.startOffset, span.endOffset),
      tagSlug: span.tagSlug,
      label: span.label
    });
    cursor = span.endOffset;
  }

  if (cursor < block.text.length) {
    segments.push({ text: block.text.slice(cursor) });
  }

  return segments.length > 0 ? segments : [{ text: block.text }];
}

export default function Tagger({ 
  activeView, 
  activeBoundaryId,
  documentBoundaries,
  adHocTags,
  initialBlocks,
  projectId,
  documentId
}: { 
  activeView: ViewDefinition, 
  activeBoundaryId?: string | null,
  documentBoundaries?: DocumentBoundary[],
  adHocTags: string[],
  initialBlocks: Block[],
  projectId: string,
  documentId: string
}) {
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks);
  const [activeMenuBlock, setActiveMenuBlock] = useState<string | null>(null);
  const [selectedRanges, setSelectedRanges] = useState<Record<string, { startOffset: number; endOffset: number; selectedText: string }>>({});
  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  
  // Track save status per block
  const [savingBlocks, setSavingBlocks] = useState<Record<string, boolean>>({});
  const [dirtyBlocks, setDirtyBlocks] = useState<Record<string, boolean>>({});

  // Sync state if initialBlocks changes (e.g. Server Action revalidation)
  useEffect(() => {
    setBlocks(initialBlocks);
  }, [initialBlocks]);

  useEffect(() => {
    const hasSavingBlocks = Object.values(savingBlocks).some(Boolean);
    const hasDirtyBlocks = Object.values(dirtyBlocks).some(Boolean);

    window.dispatchEvent(new CustomEvent("quipsly:save-state", {
      detail: {
        state: hasSavingBlocks ? "saving" : hasDirtyBlocks ? "unsaved" : "saved"
      }
    }));
  }, [dirtyBlocks, savingBlocks]);

  const handleToggleTag = async (blockId: string, tagId: string) => {
    // Optimistic UI update
    const block = blocks.find(b => b.id === blockId);
    if (!block) return;
    const selection = selectedRanges[blockId];
    
    setBlocks(blocks.map(b => {
      if (b.id !== blockId) return b;
      const selectedSpan = selection && selection.startOffset !== selection.endOffset
        ? {
            id: `pending-${blockId}-${tagId}-${selection.startOffset}-${selection.endOffset}`,
            tagSlug: tagId,
            label: tagDef(tagId)?.label ?? tagId,
            startOffset: selection.startOffset,
            endOffset: selection.endOffset,
            selectedText: selection.selectedText
          }
        : null;

      if (selectedSpan) {
        const spans = b.spans ?? [];
        const exists = spans.some(span =>
          span.tagSlug === tagId &&
          span.startOffset === selectedSpan.startOffset &&
          span.endOffset === selectedSpan.endOffset
        );
        return {
          ...b,
          tags: b.tags.includes(tagId) ? b.tags : [...b.tags, tagId],
          spans: exists
            ? spans.filter(span => !(span.tagSlug === tagId && span.startOffset === selectedSpan.startOffset && span.endOffset === selectedSpan.endOffset))
            : [...spans, selectedSpan]
        };
      }

      if (b.tags.includes(tagId)) {
        return {
          ...b,
          tags: b.tags.filter(t => t !== tagId),
          spans: (b.spans ?? []).filter(span => span.tagSlug !== tagId)
        };
      } else {
        return { ...b, tags: [...b.tags, tagId] };
      }
    }));

    // Server Action
    await toggleBlockTag(blockId, documentId, projectId, tagId, block.text, selection);
  };

  const handleTextChange = (blockId: string, newText: string) => {
    // Optimistic UI update
    setBlocks(blocks.map(b => {
      if (b.id !== blockId) return b;
      return { ...b, text: newText };
    }));
    setDirtyBlocks(prev => ({ ...prev, [blockId]: true }));
  };

  const handleTextBlur = async (blockId: string, newText: string) => {
    setSavingBlocks(prev => ({ ...prev, [blockId]: true }));
    try {
      await saveBlockContent(blockId, newText);
      setDirtyBlocks(prev => {
        const next = { ...prev };
        delete next[blockId];
        return next;
      });
    } catch (error) {
      console.error("Block save failed.", error);
      setDirtyBlocks(prev => ({ ...prev, [blockId]: true }));
    } finally {
      setSavingBlocks(prev => ({ ...prev, [blockId]: false }));
    }
  };

  const handleSplitBlock = async (
    block: Block,
    startOffset: number,
    endOffset: number
  ) => {
    const before = block.text.slice(0, startOffset);
    const after = block.text.slice(endOffset);
    const pendingId = `pending-${Date.now()}`;

    setBlocks(current => {
      const index = current.findIndex(item => item.id === block.id);
      if (index === -1) return current;
      const next = [...current];
      next[index] = { ...block, text: before };
      next.splice(index + 1, 0, { id: pendingId, text: after, tags: [...block.tags] });
      return next;
    });

    window.setTimeout(() => textareaRefs.current[pendingId]?.focus(), 0);

    const result = await splitBlockAtOffset(block.id, startOffset, endOffset);
    if (!result) return;

    setBlocks(current => current.map(item => {
      if (item.id === block.id) return result.currentBlock;
      if (item.id === pendingId) return result.newBlock;
      return item;
    }));
    window.setTimeout(() => textareaRefs.current[result.newBlock.id]?.focus(), 0);
  };

  const handleSelectionChange = (blockId: string, textarea: HTMLTextAreaElement) => {
    const startOffset = textarea.selectionStart;
    const endOffset = textarea.selectionEnd;
    const selectedText = textarea.value.slice(startOffset, endOffset);

    if (selectedText.trim().length === 0 || startOffset === endOffset) {
      setSelectedRanges(prev => {
        const next = { ...prev };
        delete next[blockId];
        return next;
      });
      return;
    }

    setSelectedRanges(prev => ({
      ...prev,
      [blockId]: { startOffset, endOffset, selectedText }
    }));
  };

  // Filter blocks based on ViewDefinition and Ad-Hoc tags
  const activeBoundary = documentBoundaries?.find((boundary) => boundary.id === activeBoundaryId) ?? null;
  const visibleBlocks = blocks.filter((b, index) => {
    if (activeBoundary && (index < activeBoundary.startIndex || index > activeBoundary.endIndex)) {
      return false;
    }

    const tagIds = uniqueTagIds(b);
    const excludedTagSlugs = activeView.filters.excludeTagSlugs ?? [];
    if (excludedTagSlugs.some(tag => tagIds.includes(tag))) {
      return false;
    }

    const excludedCategories = activeView.filters.excludeCategories ?? [];
    if (excludedCategories.some(category => tagIds.some(tag => tagDef(tag)?.category === category))) {
      return false;
    }

    let isVisibleInView = true;

    // 1. Check ViewDefinition filters
    if (activeView.filters.tagSlugs.length > 0) {
      // Must contain at least one of the view's tag slugs
      isVisibleInView = activeView.filters.tagSlugs.some(tag => tagIds.includes(tag));
    }

    // 2. Check Ad-Hoc Tag filters
    if (isVisibleInView && adHocTags.length > 0) {
       // Must contain ALL ad-hoc tags (or some, depending on preference. Let's do ALL for drill-down)
       const hasAllAdHocTags = adHocTags.every(tag => tagIds.includes(tag));
       isVisibleInView = hasAllAdHocTags;
    }

    return isVisibleInView;
  });

  return (
    <div className="space-y-3">
      {visibleBlocks.length === 0 && (
        <div className="text-center py-12 text-[#8c6b4a] italic">
          No content matches the current view filters.
        </div>
      )}

      {visibleBlocks.map(block => (
        <div 
          key={block.id} 
          className={`relative group px-4 py-3 -mx-4 rounded-lg hover:bg-[#fdfaf6] transition-colors ${blockAccentClass(block)}`}
        >
          {/* Render applied tags above the block */}
          {uniqueTagIds(block).length > 0 && (
            <div className="flex gap-2 mb-2">
              {uniqueTagIds(block).map(t => {
                const definition = tagDef(t);
                if (!definition) return null;
                const Icon = definition.icon;
                return (
                  <span key={t} className={`flex items-center gap-1 px-2 py-0.5 text-[10px] uppercase tracking-wider font-bold rounded-md border ${definition.color}`}>
                    <Icon size={10} />
                    {definition.label}
                  </span>
                )
              })}
            </div>
          )}

          <div className="mb-2 rounded-xl border border-[#eadfca] bg-white/70 px-4 py-3 text-xl leading-relaxed font-serif text-[#3d3122] shadow-inner whitespace-pre-wrap">
            {markedSegments(block).map((segment, index) => {
              const definition = segment.tagSlug ? tagDef(segment.tagSlug) : null;
              if (!definition) return <span key={index}>{segment.text}</span>;
              return (
                <span
                  key={index}
                  className={`rounded px-1 ring-1 ${definition.mark}`}
                  title={definition.label}
                >
                  {segment.text}
                </span>
              );
            })}
          </div>

          {shouldShowClipCueCard(block) ? (
            <ClipCueCard
              text={block.text}
              onChange={(nextText) => handleTextChange(block.id, nextText)}
              onCommit={(nextText) => handleTextBlur(block.id, nextText)}
            />
          ) : null}

          {/* Auto-resizing textarea for editing text */}
          <textarea
            className="w-full text-base leading-relaxed font-serif text-[#3d3122] bg-transparent resize-none outline-none overflow-hidden"
            value={block.text}
            onChange={(e) => {
              e.target.style.height = 'auto';
              e.target.style.height = e.target.scrollHeight + 'px';
              handleTextChange(block.id, e.target.value);
            }}
            onBlur={(e) => handleTextBlur(block.id, e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || e.shiftKey) return;
              e.preventDefault();
              handleSplitBlock(block, e.currentTarget.selectionStart, e.currentTarget.selectionEnd);
            }}
            onSelect={(e) => handleSelectionChange(block.id, e.currentTarget)}
            rows={1}
            ref={(el) => {
              textareaRefs.current[block.id] = el;
              if (el) {
                el.style.height = 'auto';
                el.style.height = el.scrollHeight + 'px';
              }
            }}
          />
          {savingBlocks[block.id] && <span className="absolute top-2 right-2 text-[10px] text-amber-500 animate-pulse">Saving...</span>}

          {selectedRanges[block.id] && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-[#e8dcc4] bg-white/95 p-2 shadow-sm">
              <span className="px-2 text-[10px] font-bold uppercase tracking-wider text-[#8c6b4a]">
                Tag selection
              </span>
              {AVAILABLE_TAGS.map(tag => {
                const Icon = tag.icon;
                return (
                  <button
                    key={tag.id}
                    onClick={() => handleToggleTag(block.id, tag.id)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-[#d4c1a0] bg-[#fdfaf6] px-2 py-1 text-xs font-bold text-[#5e4b33] transition-colors hover:bg-amber-100"
                  >
                    <Icon size={12} />
                    {tag.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Tagging Menu Button (appears on hover) */}
          <button 
            onClick={() => setActiveMenuBlock(activeMenuBlock === block.id ? null : block.id)}
            className="absolute top-4 -left-12 p-2 rounded-full bg-white shadow-sm border border-[#e8dcc4] text-[#8c6b4a] hover:text-[#3d3122] hover:bg-amber-50 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Plus size={16} />
          </button>

          {/* Floating Tag Menu */}
          {activeMenuBlock === block.id && (
            <div className="absolute top-0 -left-64 w-56 bg-white rounded-xl shadow-xl border border-[#e8dcc4] p-2 z-10 flex flex-col gap-1">
              <div className="text-[10px] uppercase tracking-wider font-bold text-[#8c6b4a] px-2 py-1 mb-1 border-b border-[#e8dcc4]">
                Apply Tags
              </div>
              {AVAILABLE_TAGS.map(tag => {
                const isSelected = block.tags.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    onClick={() => handleToggleTag(block.id, tag.id)}
                    className={`flex items-center justify-between px-2 py-1.5 rounded-lg text-sm transition-colors ${isSelected ? 'bg-amber-100 text-amber-900 font-medium' : 'hover:bg-gray-50 text-gray-700'}`}
                  >
                    <span className="flex items-center gap-2">
                      <tag.icon size={14} className={isSelected ? 'text-amber-600' : 'text-gray-400'} />
                      {tag.label}
                    </span>
                    {isSelected && <div className="w-2 h-2 rounded-full bg-amber-500" />}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
