"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { DocumentBoundary, ViewDefinition } from "./types";
import {
  archiveBlock,
  mergeBlockWithPrevious,
  restoreBlockState,
  saveBlockContent,
  splitBlockAtOffset,
  toggleBlockTag,
  unarchiveBlock,
} from "./actions";
import { useEditorExtensions } from "./registry/EditorExtensionRegistry";
import { BlockItem } from "./BlockItem";

export type Block = {
  id: string;
  text: string;
  tags: string[];
  spans?: TaggedSpan[];
};

export type TaggedSpan = {
  id?: string;
  tagSlug: string;
  label?: string;
  category?: string;
  startOffset: number;
  endOffset: number;
  selectedText: string;
};

export function uniqueTagIds(block: Block) {
  return Array.from(new Set([
    ...block.tags,
    ...(block.spans ?? []).map(span => span.tagSlug)
  ]));
}

const UNDO_GROUP_WINDOW_MS = 1400;
const MAX_UNDO_HISTORY = 40;
const STRUCTURE_TAG_IDS = new Set(["chapter", "episode"]);

type PersistedTagSpan = {
  id?: string;
  tagSlug: string;
  startOffset: number;
  endOffset: number;
  selectedText: string;
};

type BlockSnapshot = {
  id: string;
  text: string;
  tags: string[];
  spans: PersistedTagSpan[];
};

type UndoAction = {
  id: string;
  groupId: string;
  createdAt: number;
  label: string;
  createdAtLabel: string;
  undo: () => Promise<void>;
};

function normalizeBoundaryLine(raw: string) {
  return raw
    .replace(/^#{1,6}\s*/, "")
    .replace(/^\s*[\-\*]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeBoundarySlugValue(value: string) {
  return value
    .replace(/[\-_]+/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalizeTitleCase(input: string) {
  return normalizeBoundarySlugValue(input)
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
}

export function inferBoundarySuggestion(blockText: string): string | null {
  const firstLine = normalizeBoundaryLine(blockText.split("\n")[0] ?? "");
  if (!firstLine) return null;

  const episodeMatch = firstLine.match(/^ep(?:isode)?\s*[-:\s]*(.*)$/i);
  if (episodeMatch) {
    const rest = canonicalizeTitleCase(episodeMatch[1] || "Episode");
    return `Episode ${rest || "Episode"}`.trim();
  }

  const chapterMatch = firstLine.match(/^chapter\s*[-:\s]*(.*)$/i);
  if (chapterMatch) {
    const rest = canonicalizeTitleCase(chapterMatch[1] || "Chapter");
    return `Chapter ${rest || "Chapter"}`.trim();
  }

  return null;
}

export function canonicalBoundarySuggestion(blockText: string): string | null {
  const suggestion = inferBoundarySuggestion(blockText);
  if (!suggestion) return null;

  const firstLine = blockText.split("\n")[0] ?? "";
  if (!firstLine) return null;

  const normalizedCurrent = normalizeBoundaryLine(firstLine).toLowerCase();
  const normalizedSuggestion = normalizeBoundaryLine(suggestion).toLowerCase();

  if (normalizedCurrent === normalizedSuggestion) return null;
  return suggestion;
}

/**
 * The core rich-text orchestrator of Quipsly.
 * It strictly manages the text blocks array, tracking active focus, 
 * pushing undo/redo states, and orchestrating interactions with 
 * downstream tools via EditorExtensions. 
 *
 * Performance guarantee: Modifying text localized to a block will NOT re-render 
 * siblings thanks to stable refs and strict `BlockItem` memoization.
 */
export default function Tagger({ 
  activeView, 
  activeBoundaryId,
  documentBoundaries,
  adHocTags = [],
  initialBlocks,
  projectId,
  documentId,
  scrollContainerRef,
  onBlocksChange,
  onActiveScrollBoundaryChange
}: { 
  activeView: ViewDefinition, 
  activeBoundaryId: string | null,
  documentBoundaries: DocumentBoundary[],
  adHocTags?: string[],
  initialBlocks: Block[],
  projectId: string,
  documentId: string,
  scrollContainerRef?: RefObject<HTMLDivElement | null>,
  onBlocksChange?: (blocks: Block[]) => void,
  onActiveScrollBoundaryChange?: (boundaryId: string | null) => void,
}) {
  const { tagDefinitions, blockAccents, blockCards } = useEditorExtensions();
  const applyTagOptions = tagDefinitions.filter(t => t.category === "structure");
  const getTagDef = (tagId: string) => tagDefinitions.find(t => t.id === tagId);

  const [blocks, setBlocks] = useState<Block[]>(initialBlocks);
  const [selectedRanges, setSelectedRanges] = useState<Record<string, { startOffset: number; endOffset: number; selectedText: string }>>({});
  
  const [commandPaletteOpen, setCommandPaletteOpen] = useState<string | null>(null);
  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const blockWrapperRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const blocksRef = useRef<Block[]>(initialBlocks);
  const committedSnapshotsRef = useRef<Record<string, BlockSnapshot>>({});
  const lastUndoActionTimeRef = useRef<number>(0);
  const undoGroupIdRef = useRef<string>(`undo-group-${Date.now()}`);
  
  // Track save status per block
  const [savingBlocks, setSavingBlocks] = useState<Record<string, boolean>>({});
  const [dirtyBlocks, setDirtyBlocks] = useState<Record<string, boolean>>({});
  const [undoStack, setUndoStack] = useState<UndoAction[]>([]);
  const [showUndoHistory, setShowUndoHistory] = useState(false);
  const [outlineFocusedBlockId, setOutlineFocusedBlockId] = useState<string | null>(null);

  const normalizeTaggedSpansForSnapshot = (spans: TaggedSpan[] | undefined): PersistedTagSpan[] => {
    return spans
      ? spans.map((span) => ({
          id: span.id,
          tagSlug: span.tagSlug,
          startOffset: Math.max(0, Math.min(span.startOffset, 0xffffffff)),
          endOffset: Math.max(0, Math.max(span.endOffset, span.startOffset)),
          selectedText: span.selectedText
        }))
      : [];
  };

  const snapshotFromBlock = (block: Block): BlockSnapshot => ({
    id: block.id,
    text: block.text,
    tags: Array.from(new Set(block.tags)),
    spans: normalizeTaggedSpansForSnapshot(block.spans)
  });

  const blockFromSnapshot = (snapshot: BlockSnapshot): Block => ({
    id: snapshot.id,
    text: snapshot.text,
    tags: [...snapshot.tags],
    spans: snapshot.spans.map((span, index) => ({
      id: span.id ?? `${snapshot.id}-restore-${index}`,
      tagSlug: span.tagSlug,
      startOffset: span.startOffset,
      endOffset: span.endOffset,
      selectedText: span.selectedText
    }))
  });

  const getCurrentBlock = (blockId: string) => blocksRef.current.find((block) => block.id === blockId);

  const ensureCommittedSnapshot = (block: Block) => {
    committedSnapshotsRef.current[block.id] = snapshotFromBlock(block);
  };

  const currentUndoGroupId = () => {
    const now = Date.now();
    if (now - lastUndoActionTimeRef.current > UNDO_GROUP_WINDOW_MS) {
      undoGroupIdRef.current = `undo-group-${now}-${Math.random().toString(16).slice(2, 8)}`;
    }

    lastUndoActionTimeRef.current = now;
    return undoGroupIdRef.current;
  };

  const pushUndo = (entry: Omit<UndoAction, "id" | "groupId" | "createdAt">) => {
    setUndoStack((prev) => {
      const next = [...prev, {
        ...entry,
        id: `undo-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        groupId: currentUndoGroupId(),
        createdAt: Date.now()
      }];
      return next.slice(-MAX_UNDO_HISTORY);
    });
  };

  const restoreBlockLocally = (snapshot: BlockSnapshot) => {
    setBlocks((current) => {
      let didChange = false;
      const next = current.map((block) => {
        if (block.id !== snapshot.id) return block;

        didChange = true;

        return {
          ...block,
          text: snapshot.text,
          tags: [...snapshot.tags],
          spans: snapshot.spans.map((span, index) => ({
            id: span.id ?? `${snapshot.id}-undo-${index}`,
            tagSlug: span.tagSlug,
            startOffset: span.startOffset,
            endOffset: span.endOffset,
            selectedText: span.selectedText
          }))
        };
      });

      if (!didChange) return current;

      return next;
    });
    setDirtyBlocks((prev) => {
      const next = { ...prev };
      delete next[snapshot.id];
      return next;
    });
    setSavingBlocks((prev) => {
      const next = { ...prev };
      delete next[snapshot.id];
      return next;
    });
  };

  const restoreDeletedBlockLocally = (snapshot: BlockSnapshot, preferredIndex: number) => {
    setBlocks((current) => {
      if (current.some((block) => block.id === snapshot.id)) {
        return current.map((block) => block.id === snapshot.id ? blockFromSnapshot(snapshot) : block);
      }

      const next = [...current];
      const insertIndex = Math.max(0, Math.min(preferredIndex, next.length));
      next.splice(insertIndex, 0, blockFromSnapshot(snapshot));
      return next;
    });
    setDirtyBlocks((prev) => {
      const next = { ...prev };
      delete next[snapshot.id];
      return next;
    });
    setSavingBlocks((prev) => {
      const next = { ...prev };
      delete next[snapshot.id];
      return next;
    });
  };

  const runUndoActions = async (actions: UndoAction[]) => {
    for (let index = actions.length - 1; index >= 0; index -= 1) {
      await actions[index].undo();
    }
  };

  const captureHistoryLabel = (verb: string, snapshot: BlockSnapshot) => {
    const preview = snapshot.text.trim().replace(/\s+/g, " ").slice(0, 40);
    return `${verb}: ${preview || "untitled block"}`;
  };

  const undoLatest = async () => {
    const target = undoStack.at(-1) ?? null;
    setUndoStack((prev) => prev.slice(0, -1));
    if (target) {
      await target.undo();
    }
  };

  const undoToIndex = async (index: number) => {
    let toUndo: UndoAction[] = [];
    setUndoStack((prev) => {
      if (index < 0 || index >= prev.length) {
        toUndo = [];
        return prev;
      }

      toUndo = prev.slice(index);
      return prev.slice(0, index);
    });

    await runUndoActions(toUndo);
  };

  const undoLatestGroup = async () => {
    const current = undoStack;
    const last = current.at(-1);
    if (!last) return;

    let index = current.length - 1;
    while (index - 1 >= 0 && current[index - 1].groupId === last.groupId) {
      index -= 1;
    }

    await undoToIndex(index);
  };

  const labelForBlock = (snapshot: BlockSnapshot) => {
    const firstLine = snapshot.text.split("\n")[0].trim();
    const trimmed = firstLine.length > 0 ? firstLine : "Untitled block";
    return trimmed.length <= 42 ? trimmed : `${trimmed.slice(0, 42)}...`;
  };

  const firstLineForBlock = (block: Block) => {
    const firstLine = block.text.split("\n")[0].trim();
    return firstLine.length <= 52 ? firstLine : `${firstLine.slice(0, 52)}...`;
  };

  /**
   * Prevents UI layout shifting during React state transitions.
   * By capturing the exact scroll container offsets before a block 
   * splits, merges, or toggles height-altering tags, we can seamlessly
   * restore it on the next repaint via `requestAnimationFrame`.
   */
  const captureScrollState = () => {
    if (scrollContainerRef?.current) {
      return { y: scrollContainerRef.current.scrollTop };
    }
    return { y: window.scrollY };
  };

  const restoreScrollState = (state: { y: number }) => {
    if (scrollContainerRef?.current) {
      scrollContainerRef.current.scrollTo({ top: state.y });
      return;
    }
    window.scrollTo({ top: state.y });
  };

  const prevViewKeyRef = useRef<string | null>(null);

  // Sync state ONLY when the document or view filter actually changes.
  // We explicitly ignore `initialBlocks` updates caused by Next.js Server Action revalidations 
  // because the server's state is always stale relative to the user's active un-saved keystrokes.
  useEffect(() => {
    const currentViewKey = `${documentId}-${activeView?.id}-${adHocTags?.join(',')}`;
    if (prevViewKeyRef.current !== currentViewKey) {
      blocksRef.current = initialBlocks;
      for (const block of initialBlocks) {
        ensureCommittedSnapshot(block);
      }
      setBlocks(initialBlocks);
      prevViewKeyRef.current = currentViewKey;
    }
  }, [initialBlocks, documentId, activeView?.id, adHocTags]);

  useEffect(() => {
    blocksRef.current = blocks;
  }, [blocks]);

  useEffect(() => {
    onBlocksChange?.(blocks);
  }, [blocks, onBlocksChange]);

  useEffect(() => {
    const hasSavingBlocks = Object.values(savingBlocks).some(Boolean);
    const hasDirtyBlocks = Object.values(dirtyBlocks).some(Boolean);

    window.dispatchEvent(new CustomEvent("quipsly:save-state", {
      detail: {
        state: hasSavingBlocks ? "saving" : hasDirtyBlocks ? "unsaved" : "saved"
      }
    }));
  }, [dirtyBlocks, savingBlocks]);

  useEffect(() => {
    const handleFocusBlock = (event: Event) => {
      const blockId = (event as CustomEvent<{ blockId?: string }>).detail?.blockId;
      if (!blockId) return;

      window.setTimeout(() => {
        const textarea = textareaRefs.current[blockId];
        textarea?.scrollIntoView({ behavior: "smooth", block: "start" });
        setOutlineFocusedBlockId(blockId);
        window.setTimeout(() => {
          setOutlineFocusedBlockId((current) => current === blockId ? null : current);
        }, 1800);
      }, 80);
    };

    window.addEventListener("quipsly:focus-block", handleFocusBlock);
    return () => window.removeEventListener("quipsly:focus-block", handleFocusBlock);
  }, []);

  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => {
      return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable);
    };

    const handleUndoShortcut = (event: KeyboardEvent) => {
      if (!((event.ctrlKey || event.metaKey) && (event.key === "z" || event.key === "Z"))) return;
      if (isTypingTarget(event.target)) return;
      if (event.repeat) return;

      event.preventDefault();
      if (event.shiftKey) {
        void undoLatestGroup();
      } else {
        void undoLatest();
      }
    };

    window.addEventListener("keydown", handleUndoShortcut);
    return () => window.removeEventListener("keydown", handleUndoShortcut);
  }, [undoLatest, undoLatestGroup]);

  const handleToggleTag = async (blockId: string, tagId: string) => {
    const previousScroll = captureScrollState();
    // Optimistic UI update
    const block = blocks.find(b => b.id === blockId);
    if (!block) return;
    const beforeSnapshot = snapshotFromBlock(block);
    const isStructureTag = STRUCTURE_TAG_IDS.has(tagId);
    const selection = isStructureTag ? undefined : selectedRanges[blockId];
    
    setBlocks((currentBlocks) => currentBlocks.map(b => {
      if (b.id !== blockId) return b;
      const selectedSpan = selection && selection.startOffset !== selection.endOffset
        ? {
            id: `pending-${blockId}-${tagId}-${selection.startOffset}-${selection.endOffset}`,
            tagSlug: tagId,
            label: getTagDef(tagId)?.label ?? tagId,
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
      }

      if (isStructureTag) {
        return {
          ...b,
          tags: [...b.tags.filter(t => !STRUCTURE_TAG_IDS.has(t)), tagId],
          spans: (b.spans ?? []).filter(span => !STRUCTURE_TAG_IDS.has(span.tagSlug))
        };
      }

      return { ...b, tags: [...b.tags, tagId] };
    }));

    requestAnimationFrame(() => restoreScrollState(previousScroll));

    // Server Action
    await toggleBlockTag(blockId, documentId, projectId, tagId, block.text, selection);

    const restoredSnapshot = beforeSnapshot;
    const tagLabel = getTagDef(tagId)?.label ?? tagId;
    pushUndo({
      label: `Tag ${tagLabel} on ${labelForBlock(beforeSnapshot)}`,
      createdAtLabel: "tag",
      undo: async () => {
        restoreBlockLocally(restoredSnapshot);
        await restoreBlockState(
          blockId,
          restoredSnapshot.text,
          restoredSnapshot.spans
        );
        const currentBlock = getCurrentBlock(blockId);
        if (currentBlock) {
          ensureCommittedSnapshot(currentBlock);
        }
      }
    });

    requestAnimationFrame(() => restoreScrollState(previousScroll));
    const latest = getCurrentBlock(blockId);
    if (latest) {
      ensureCommittedSnapshot(latest);
    }
  };

  const handleClearBlockTags = async (block: Block) => {
    if (uniqueTagIds(block).length === 0) return;

    const previousScroll = captureScrollState();
    const beforeSnapshot = snapshotFromBlock(block);

    setBlocks((current) => current.map((item) => {
      if (item.id !== block.id) return item;
      return {
        ...item,
        tags: [],
        spans: []
      };
    }));

    pushUndo({
      label: `Restore tags on ${labelForBlock(beforeSnapshot)}`,
      createdAtLabel: "tags",
      undo: async () => {
        restoreBlockLocally(beforeSnapshot);
        await restoreBlockState(block.id, beforeSnapshot.text, beforeSnapshot.spans);
        const currentBlock = getCurrentBlock(block.id);
        if (currentBlock) ensureCommittedSnapshot(currentBlock);
      }
    });

    requestAnimationFrame(() => restoreScrollState(previousScroll));
    await restoreBlockState(block.id, block.text, []);
    requestAnimationFrame(() => restoreScrollState(previousScroll));
    const latest = getCurrentBlock(block.id);
    if (latest) ensureCommittedSnapshot(latest);
  };

  const handleDeleteBlock = async (block: Block) => {
    if (blocksRef.current.length <= 1) return;

    const previousScroll = captureScrollState();
    const blockIndex = blocksRef.current.findIndex((item) => item.id === block.id);
    if (blockIndex === -1) return;

    const beforeSnapshot = snapshotFromBlock(block);
    const nextFocusId = blocksRef.current[blockIndex + 1]?.id ?? blocksRef.current[blockIndex - 1]?.id ?? null;

    setBlocks((current) => current.filter((item) => item.id !== block.id));
    setDirtyBlocks((prev) => {
      const next = { ...prev };
      delete next[block.id];
      return next;
    });

    pushUndo({
      label: `Restore deleted block: ${labelForBlock(beforeSnapshot)}`,
      createdAtLabel: "delete",
      undo: async () => {
        restoreDeletedBlockLocally(beforeSnapshot, blockIndex);
        await unarchiveBlock(beforeSnapshot.id);
        ensureCommittedSnapshot(beforeSnapshot);
        window.setTimeout(() => {
          const textarea = textareaRefs.current[beforeSnapshot.id];
          if (textarea) {
            textarea.focus();
            textarea.selectionStart = 0;
            textarea.selectionEnd = 0;
          }
        }, 0);
      }
    });

    requestAnimationFrame(() => restoreScrollState(previousScroll));
    window.setTimeout(() => {
      if (!nextFocusId) return;
      const nextTextarea = textareaRefs.current[nextFocusId];
      if (nextTextarea) {
        nextTextarea.focus();
        nextTextarea.selectionStart = 0;
        nextTextarea.selectionEnd = 0;
      }
    }, 0);

    try {
      await archiveBlock(block.id);
    } catch (error) {
      console.error("Block delete failed.", error);
      restoreDeletedBlockLocally(beforeSnapshot, blockIndex);
      requestAnimationFrame(() => restoreScrollState(previousScroll));
    }
  };

  const handleTextChange = (blockId: string, newText: string) => {
    // Optimistic UI update
    setBlocks((currentBlocks) => currentBlocks.map(b => {
      if (b.id !== blockId) return b;
      return { ...b, text: newText };
    }));
    setDirtyBlocks(prev => ({ ...prev, [blockId]: true }));
  };

  const handleTextBlur = async (blockId: string, newText: string) => {
    const previousScroll = captureScrollState();
    const currentBlock = getCurrentBlock(blockId);
    const committed = committedSnapshotsRef.current[blockId] ?? (currentBlock ? snapshotFromBlock(currentBlock) : null);
    const beforeText = committed?.text ?? currentBlock?.text ?? newText;

    if (currentBlock && beforeText !== newText) {
      const beforeSnapshot = { ...committed, id: currentBlock.id, text: beforeText } as BlockSnapshot;
      pushUndo({
        label: `Revert text on ${labelForBlock(beforeSnapshot)}`,
        createdAtLabel: "text",
        undo: async () => {
          restoreBlockLocally(beforeSnapshot);
          const current = getCurrentBlock(blockId);
          if (!current) return;

          setSavingBlocks((prev) => ({ ...prev, [blockId]: true }));
          try {
            await restoreBlockState(blockId, beforeSnapshot.text, beforeSnapshot.spans);
            ensureCommittedSnapshot(beforeSnapshot);
          } finally {
            setSavingBlocks((prev) => ({ ...prev, [blockId]: false }));
          }
        }
      });
    }

    setSavingBlocks(prev => ({ ...prev, [blockId]: true }));
    try {
      await saveBlockContent(blockId, newText);
      const committedAfter = getCurrentBlock(blockId);
      if (committedAfter) {
        ensureCommittedSnapshot(committedAfter);
      }
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
      requestAnimationFrame(() => restoreScrollState(previousScroll));
    }
  };

  const handleNavigatePrevious = useCallback((blockId: string) => {
    const index = blocksRef.current.findIndex(b => b.id === blockId);
    if (index > 0) {
      const previousBlock = blocksRef.current[index - 1];
      const previous = textareaRefs.current[previousBlock.id];
      if (previous) {
        previous.focus();
        const length = previous.value.length;
        previous.selectionStart = length;
        previous.selectionEnd = length;
      }
    }
  }, []);

  const handleNavigateNext = useCallback((blockId: string) => {
    const index = blocksRef.current.findIndex(b => b.id === blockId);
    if (index !== -1 && index < blocksRef.current.length - 1) {
      const nextBlock = blocksRef.current[index + 1];
      const next = textareaRefs.current[nextBlock.id];
      if (next) {
        next.focus();
        next.selectionStart = 0;
        next.selectionEnd = 0;
      }
    }
  }, []);

  const handlePasteBlocks = useCallback(async (blockId: string, chunks: string[], selectionStart: number, selectionEnd: number) => {
    if (chunks.length <= 1) return;
    
    const index = blocksRef.current.findIndex(b => b.id === blockId);
    if (index === -1) return;
    
    const currentBlock = blocksRef.current[index];
    const firstChunk = chunks[0];
    const remainingChunks = chunks.slice(1);
    
    const beforeText = currentBlock.text.slice(0, selectionStart);
    const afterText = currentBlock.text.slice(selectionEnd);
    const newCurrentText = `${beforeText}${firstChunk}`;
    
    const newBlocks: Block[] = remainingChunks.map((chunk, i) => {
      const isLast = i === remainingChunks.length - 1;
      return {
        id: `pending-paste-${Date.now()}-${i}`,
        text: isLast ? `${chunk}${afterText}` : chunk,
        tags: [],
        spans: []
      };
    });
    
    setBlocks(current => {
      const next = [...current];
      const idx = next.findIndex(b => b.id === blockId);
      if (idx !== -1) {
        next[idx] = { ...next[idx], text: newCurrentText };
        next.splice(idx + 1, 0, ...newBlocks);
      }
      return next;
    });
    
    window.setTimeout(() => {
      const lastBlockId = newBlocks[newBlocks.length - 1].id;
      const el = textareaRefs.current[lastBlockId];
      if (el) {
        el.focus();
        const endPos = remainingChunks[remainingChunks.length - 1].length;
        el.selectionStart = endPos;
        el.selectionEnd = endPos;
      }
    }, 0);
    
    try {
      if (onBlocksChange) {
        onBlocksChange(blocksRef.current);
      }
    } catch (e) {
      console.error("Failed to save pasted blocks", e);
    }
  }, [onBlocksChange]);

  const handleNormalizeHeading = async (block: Block) => {
    const suggestion = canonicalBoundarySuggestion(block.text);
    if (!suggestion) return;

    const lines = block.text.split("\n");
    const nextText = [suggestion, ...lines.slice(1)].join("\n");
    if (nextText === block.text) return;

    handleTextChange(block.id, nextText);
    await handleTextBlur(block.id, nextText);
  };

  /**
   * Safely splits a block at the given offsets, preserving the original text in the 
   * first block and spinning up a new sibling block for the remainder.
   * Pushes a deep undo state allowing instantaneous reversal of the split.
   */
  const handleSplitBlock = async (
    block: Block,
    startOffset: number,
    endOffset: number
  ) => {
    const beforeSnapshot = snapshotFromBlock(block);
    const before = block.text.slice(0, startOffset);
    const after = block.text.slice(endOffset);
    const pendingId = `pending-${Date.now()}`;
    const previousScroll = captureScrollState();

    setBlocks(current => {
      const index = current.findIndex(item => item.id === block.id);
      if (index === -1) return current;
      const next = [...current];
      next[index] = { ...block, text: before };
      next.splice(index + 1, 0, { id: pendingId, text: after, tags: [...block.tags] });
      return next;
    });

    window.setTimeout(() => {
      const el = textareaRefs.current[pendingId];
      if (el) {
        el.focus();
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 0);

    const result = await splitBlockAtOffset(block.id, startOffset, endOffset);
    if (!result) {
      setBlocks((current) => current.map((item) => {
        if (item.id !== block.id) return item;
        return beforeSnapshot;
      }).filter((item) => item.id !== pendingId));
      setSavingBlocks((prev) => ({ ...prev, [block.id]: false }));
      setDirtyBlocks((prev) => ({ ...prev, [block.id]: false }));
      return;
    }

    setBlocks(current => current.map(item => {
      if (item.id === block.id) return result.currentBlock;
      if (item.id === pendingId) return result.newBlock;
      return item;
    }));

    pushUndo({
      label: `Split ${captureHistoryLabel("split", beforeSnapshot)}`,
      createdAtLabel: "split",
      undo: async () => {
        setBlocks((current) => {
          const next = current
            .filter((item) => item.id !== result.newBlock.id)
            .filter((item) => item.id !== pendingId);

          const merged = next.map((item) => {
            if (item.id !== beforeSnapshot.id) return item;
            return {
              ...item,
              text: beforeSnapshot.text,
              tags: [...beforeSnapshot.tags],
              spans: beforeSnapshot.spans.map((span, spanIndex) => ({
                id: span.id ?? `${beforeSnapshot.id}-undo-${spanIndex}`,
                tagSlug: span.tagSlug,
                startOffset: span.startOffset,
                endOffset: span.endOffset,
                selectedText: span.selectedText
              }))
            };
          });

          if (!merged.some((item) => item.id === beforeSnapshot.id)) {
            return [
              ...merged,
              {
                ...beforeSnapshot,
                spans: beforeSnapshot.spans.map((span, spanIndex) => ({
                  id: span.id ?? `${beforeSnapshot.id}-undo-${spanIndex}`,
                  tagSlug: span.tagSlug,
                  startOffset: span.startOffset,
                  endOffset: span.endOffset,
                  selectedText: span.selectedText
                }))
              }
            ];
          }

          return merged;
        });

        try {
          await mergeBlockWithPrevious(result.newBlock.id);
          await restoreBlockState(beforeSnapshot.id, beforeSnapshot.text, beforeSnapshot.spans);
        } finally {
          const currentBlockAfterUndo = getCurrentBlock(beforeSnapshot.id);
          if (currentBlockAfterUndo) {
            ensureCommittedSnapshot(currentBlockAfterUndo);
          }
          setDirtyBlocks((prev) => {
            const next = { ...prev };
            delete next[beforeSnapshot.id];
            return next;
          });
          setSavingBlocks((prev) => {
            const next = { ...prev };
            delete next[beforeSnapshot.id];
            return next;
          });
        }
      }
    });

    // Focus immediately before server action
    window.setTimeout(() => {
      textareaRefs.current[result.newBlock.id]?.focus();
    }, 0);
    
  };

  /**
   * Merges the current block into the block immediately preceding it, snapping the
   * cursor focus strictly to the exact "stitch point" where the texts combine.
   */
  const handleMergeWithPrevious = async (blockId: string) => {
    const index = blocks.findIndex((b) => b.id === blockId);
    if (index <= 0) return;

    const previousBlock = blocks[index - 1];
    const currentBlock = blocks[index];
    if (!previousBlock || !currentBlock) return;

    const mergedText = `${previousBlock.text}${currentBlock.text}`;
    const previousLength = previousBlock.text.length;

    const existingSpanKeys = new Set(
      (previousBlock.spans ?? []).map((span) => `${span.tagSlug}|${span.startOffset}|${span.endOffset}`)
    );

    const mergedSpans = [
      ...(previousBlock.spans ?? []),
      ...(currentBlock.spans ?? []).reduce((acc: TaggedSpan[], span) => {
        const nextSpan = {
          ...span,
          id: `pending-${blockId}-${span.id}`,
          startOffset: span.startOffset + previousLength,
          endOffset: span.endOffset + previousLength,
          selectedText: currentBlock.text.slice(span.startOffset, span.endOffset)
        };
        const key = `${nextSpan.tagSlug}|${nextSpan.startOffset}|${nextSpan.endOffset}`;
        if (nextSpan.startOffset >= mergedText.length || nextSpan.endOffset <= previousLength || existingSpanKeys.has(key)) {
          return acc;
        }

        existingSpanKeys.add(key);
        acc.push(nextSpan);
        return acc;
      }, [])
    ];

    const cursorOffset = previousLength + (currentBlock.text.length > 0 ? 0 : 0);
    const previousSnapshot = snapshotFromBlock(previousBlock);
    const currentSnapshot = snapshotFromBlock(currentBlock);

    setBlocks((current) => {
      const next = [...current];
      if (index - 1 < 0 || index >= current.length || current[index].id !== blockId) return current;

      next[index - 1] = {
        ...previousBlock,
        text: mergedText,
        spans: mergedSpans,
        tags: Array.from(new Set([...previousBlock.tags, ...currentBlock.tags]))
      };
      next.splice(index, 1);
      return next;
    });

    // Focus immediately before server action
    window.setTimeout(() => {
      const previous = textareaRefs.current[previousBlock.id];
      if (previous) {
        previous.focus();
        previous.selectionStart = cursorOffset;
        previous.selectionEnd = cursorOffset;
      }
    }, 0);

    const previousScroll = captureScrollState();
    const mergeResult = await mergeBlockWithPrevious(blockId);
    if (!mergeResult) {
      setBlocks((current) => {
        const next = [...current];
        const currentMergeIndex = next.findIndex((item) => item.id === blockId);
        if (currentMergeIndex === -1) return current;
        if (currentMergeIndex - 1 < 0) return current;

        next[currentMergeIndex - 1] = {
          ...previousBlock,
          text: mergedText,
          spans: mergedSpans,
          tags: Array.from(new Set([...previousBlock.tags, ...currentBlock.tags]))
        };
        return next;
      });

      return;
    }

    pushUndo({
      label: `Undo merge ${captureHistoryLabel("merge", currentSnapshot)}`,
      createdAtLabel: "merge",
      undo: async () => {
        const split = await splitBlockAtOffset(mergeResult.mergedBlockId, previousSnapshot.text.length, previousSnapshot.text.length);
        if (!split) {
          restoreBlockLocally(previousSnapshot);
          return;
        }

        const restoreCurrent = {
          ...currentSnapshot,
          id: split.newBlock.id
        };

        setBlocks((current) => {
          const next = current.map((item) => {
            if (item.id === split.currentBlock.id) return {
              ...previousSnapshot,
              id: split.currentBlock.id
            };
            return item;
          });

          const hasCurrent = next.some((item) => item.id === split.newBlock.id);
          const mergedBlockIndex = next.findIndex((item) => item.id === split.currentBlock.id);
          if (!hasCurrent && mergedBlockIndex >= 0) {
            next.splice(mergedBlockIndex + 1, 0, restoreCurrent);
          } else if (!hasCurrent) {
            next.push(restoreCurrent);
          }
          return next;
        });

        await restoreBlockState(split.currentBlock.id, previousSnapshot.text, previousSnapshot.spans);
        await restoreBlockState(split.newBlock.id, currentSnapshot.text, currentSnapshot.spans);

        setDirtyBlocks((prev) => {
          const next = { ...prev };
          delete next[split.currentBlock.id];
          delete next[split.newBlock.id];
          return next;
        });
        setSavingBlocks((prev) => {
          const next = { ...prev };
          delete next[split.currentBlock.id];
          delete next[split.newBlock.id];
          return next;
        });
        ensureCommittedSnapshot({
          id: split.currentBlock.id,
          text: previousSnapshot.text,
          tags: [...previousSnapshot.tags],
          spans: [...previousSnapshot.spans]
        });
        ensureCommittedSnapshot({
          id: split.newBlock.id,
          text: currentSnapshot.text,
          tags: [...currentSnapshot.tags],
          spans: [...currentSnapshot.spans]
        });
      }
    });
    window.setTimeout(() => {
      const previous = textareaRefs.current[previousBlock.id];
      if (previous) {
        previous.focus();
        const nextCursor = Math.min(cursorOffset, mergedText.length);
        previous.selectionStart = nextCursor;
        previous.selectionEnd = nextCursor;
      }
      restoreScrollState(previousScroll);
    }, 0);
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
  const boundaryIdByBlockId = useMemo(() => {
    return new Map(documentBoundaries.map((boundary) => [boundary.blockId, boundary.id]));
  }, [documentBoundaries]);
  const blockIndexById = useMemo(() => {
    return new Map(blocks.map((block, index) => [block.id, index]));
  }, [blocks]);
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
    if (excludedCategories.some(category => tagIds.some(tag => getTagDef(tag)?.category === category))) {
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

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        let bestBoundaryId: string | null = null;
        let bestRatio = 0;
        
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > bestRatio) {
            bestRatio = entry.intersectionRatio;
            bestBoundaryId = entry.target.getAttribute("data-boundary-id");
          }
        });
        
        if (bestBoundaryId && onActiveScrollBoundaryChange) {
          onActiveScrollBoundaryChange(bestBoundaryId);
        }
      },
      {
        root: scrollContainerRef?.current ?? null,
        rootMargin: "-20% 0px -60% 0px", // focus on top-middle
        threshold: [0, 0.25, 0.5, 0.75, 1],
      }
    );

    Object.values(blockWrapperRefs.current).forEach((el) => {
      if (el && el.getAttribute("data-is-boundary") === "true") {
        observer.observe(el);
      }
    });

    return () => observer.disconnect();
  }, [visibleBlocks, onActiveScrollBoundaryChange]);

  return (
    <div className="mx-auto w-full max-w-[680px] pb-96">
      {undoStack.length > 0 ? (
        <div className="rounded-xl border border-[#eadfca] bg-white/90 p-2 text-sm text-[#5e4b33] shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-black uppercase tracking-wider text-[#8c6b4a]">Undo</span>
            <button
              type="button"
              onClick={() => void undoLatest()}
              className="rounded-md border border-[#d4c1a0] px-2 py-1 text-xs font-black hover:bg-amber-50"
            >
              Undo
            </button>
            <button
              type="button"
              onClick={() => void undoLatestGroup()}
              className="rounded-md border border-[#d4c1a0] px-2 py-1 text-xs font-black hover:bg-amber-50"
            >
              Undo grouped
            </button>
            <button
              type="button"
              onClick={() => setShowUndoHistory((current) => !current)}
              className="rounded-md border border-[#d4c1a0] px-2 py-1 text-xs font-black hover:bg-amber-50"
            >
              {showUndoHistory ? "Hide recent changes" : "Show recent changes"}
            </button>
          </div>

          {showUndoHistory ? (
            <div className="mt-2 space-y-1">
              {[...undoStack].slice(-8).reverse().map((entry, reverseIndex) => {
                const originalIndex = undoStack.length - 1 - reverseIndex;
                const createdAt = new Date(entry.createdAt).toLocaleTimeString([], {
                  hour: "numeric",
                  minute: "2-digit",
                  second: "2-digit"
                });

                return (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-[#eadfca] bg-[#fffaf3] px-2 py-1"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-black text-xs">
                        {entry.label}
                      </div>
                      <div className="text-[10px] uppercase tracking-[0.2em] text-[#8c6b4a]">
                        {entry.createdAtLabel} • {createdAt}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="rounded-md border border-[#d4c1a0] px-2 py-1 text-[11px] font-black hover:bg-amber-100"
                      onClick={() => void undoToIndex(originalIndex)}
                    >
                      Undo to here
                    </button>
                  </div>
                );
              })}
              {undoStack.length === 0 ? (
                <div className="text-[11px] text-[#8c6b4a]">No recent changes yet.</div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {visibleBlocks.length === 0 && (
        <div className="text-center py-12 text-[#8c6b4a] italic">
          No content matches the current view filters.
        </div>
      )}
      {visibleBlocks.map((block, index) => (
        <BlockItem
          key={block.id}
          block={block}
          blockIndex={blockIndexById.get(block.id) ?? index}
          boundaryId={boundaryIdByBlockId.get(block.id)}
          isOutlineFocused={outlineFocusedBlockId === block.id}
          isSaving={!!savingBlocks[block.id]}
          onTextChange={handleTextChange}
          onTextBlur={handleTextBlur}
          onToggleTag={handleToggleTag}
          onSplitBlock={handleSplitBlock}
          onMergeWithPrevious={handleMergeWithPrevious}
          onPasteBlocks={handlePasteBlocks}
          onNavigatePrevious={handleNavigatePrevious}
          onNavigateNext={handleNavigateNext}
          onClearTags={handleClearBlockTags}
          onDeleteBlock={handleDeleteBlock}
          onNormalizeHeading={handleNormalizeHeading}
          onSelectionChange={handleSelectionChange}
          registerTextareaRef={(id, el) => {
            textareaRefs.current[id] = el;
          }}
          registerWrapperRef={(id, el) => {
            blockWrapperRefs.current[id] = el;
          }}
        />
      ))}
    </div>
  );
}
