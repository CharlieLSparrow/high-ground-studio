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
  reorderDocumentBlocksAction,
  addBlockComment,
  createAndApplyPassageTag,
  pastePlainTextBlocksAction,
  type AssistantDocumentApplyReceipt,
} from "./actions";
import { useEditorExtensions } from "./registry/EditorExtensionRegistry";
import { BlockItem } from "./BlockItem";

export type Block = {
  id: string;
  text: string;
  tags: string[];
  spans?: TaggedSpan[];
  sourceEvidence?: {
    annotationId: string;
    citationLabel: string;
    sourcePath?: string;
    immutable?: boolean;
  };
};

export type TaggedSpan = {
  id?: string;
  tagSlug: string;
  label?: string;
  category?: string;
  startOffset: number;
  endOffset: number;
  selectedText: string;
  noteBody?: string;
};

export function uniqueTagIds(block: Block) {
  return Array.from(new Set([
    ...block.tags,
    ...(block.spans ?? []).map(span => span.tagSlug)
  ]));
}

const UNDO_GROUP_WINDOW_MS = 1400;
const MAX_UNDO_HISTORY = 40;
const BLOCK_AUTOSAVE_DELAY_MS = 600;
const STRUCTURE_TAG_IDS = new Set(["chapter", "episode"]);

type PersistedTagSpan = {
  id?: string;
  tagSlug: string;
  startOffset: number;
  endOffset: number;
  selectedText: string;
  noteBody?: string;
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
  onActiveScrollBoundaryChange,
  initialFocusBlockId,
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
  initialFocusBlockId?: string,
}) {
  const {
    tagDefinitions,
    blockAccents,
    blockCards,
    registerProjectTag,
  } = useEditorExtensions();
  const applyTagOptions = tagDefinitions.filter(t => t.category === "structure");
  const getTagDef = (tagId: string) => tagDefinitions.find(t => t.id === tagId);

  const [blocks, setBlocks] = useState<Block[]>(initialBlocks);
  const [selectedRanges, setSelectedRanges] = useState<Record<string, { startOffset: number; endOffset: number; selectedText: string }>>({});
  
  const [commandPaletteOpen, setCommandPaletteOpen] = useState<string | null>(null);
  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const blockWrapperRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const blocksRef = useRef<Block[]>(initialBlocks);
  const suppressNextBlocksChangeRef = useRef(true);
  const committedSnapshotsRef = useRef<Record<string, BlockSnapshot>>({});
  const lastUndoActionTimeRef = useRef<number>(0);
  const undoGroupIdRef = useRef<string>(`undo-group-${Date.now()}`);
  
  // Track save status per block
  const [savingBlocks, setSavingBlocks] = useState<Record<string, boolean>>({});
  const [dirtyBlocks, setDirtyBlocks] = useState<Record<string, boolean>>({});
  const [undoStack, setUndoStack] = useState<UndoAction[]>([]);
  const [showUndoHistory, setShowUndoHistory] = useState(false);
  const [outlineFocusedBlockId, setOutlineFocusedBlockId] = useState<string | null>(null);
  const [isReordering, setIsReordering] = useState(false);
  const [persistenceError, setPersistenceError] = useState<string | null>(null);
  const reorderInFlightRef = useRef(false);
  const saveInFlightRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const handleShowRecentChanges = () => {
      setShowUndoHistory(true);
    };

    window.addEventListener("quipsly:show-recent-changes", handleShowRecentChanges);
    return () => window.removeEventListener("quipsly:show-recent-changes", handleShowRecentChanges);
  }, []);

  useEffect(() => {
    if (!initialFocusBlockId || !initialBlocks.some((block) => block.id === initialFocusBlockId)) return;
    let clearHighlightTimer: number | undefined;
    const timer = window.setTimeout(() => {
      const textarea = textareaRefs.current[initialFocusBlockId];
      textarea?.scrollIntoView({ behavior: "smooth", block: "center" });
      setOutlineFocusedBlockId(initialFocusBlockId);
      clearHighlightTimer = window.setTimeout(() => {
        setOutlineFocusedBlockId((current) => current === initialFocusBlockId ? null : current);
      }, 2400);
    }, 120);
    return () => {
      window.clearTimeout(timer);
      if (clearHighlightTimer !== undefined) window.clearTimeout(clearHighlightTimer);
    };
  }, [documentId, initialBlocks, initialFocusBlockId]);

  const normalizeTaggedSpansForSnapshot = (spans: TaggedSpan[] | undefined): PersistedTagSpan[] => {
    return spans
      ? spans.map((span) => ({
          id: span.id,
          tagSlug: span.tagSlug,
          startOffset: Math.max(0, Math.min(span.startOffset, 0xffffffff)),
          endOffset: Math.max(0, Math.max(span.endOffset, span.startOffset)),
          selectedText: span.selectedText,
          noteBody: span.noteBody,
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
      selectedText: span.selectedText,
      noteBody: span.noteBody,
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
            selectedText: span.selectedText,
            noteBody: span.noteBody,
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
      // A server refresh, document switch, or view switch is canonical input,
      // not a local edit. Do not bounce it back to Workspace as "unsaved".
      suppressNextBlocksChangeRef.current = true;
      setBlocks(initialBlocks);
      prevViewKeyRef.current = currentViewKey;
    }
  }, [initialBlocks, documentId, activeView?.id, adHocTags]);

  useEffect(() => {
    blocksRef.current = blocks;
  }, [blocks]);

  useEffect(() => {
    if (suppressNextBlocksChangeRef.current) {
      suppressNextBlocksChangeRef.current = false;
      return;
    }
    onBlocksChange?.(blocks);
  }, [blocks, onBlocksChange]);

  useEffect(() => {
    const hasSavingBlocks = isReordering || Object.values(savingBlocks).some(Boolean);
    const hasDirtyBlocks = Object.values(dirtyBlocks).some(Boolean);

    window.dispatchEvent(new CustomEvent("quipsly:save-state", {
      detail: {
        state: hasSavingBlocks ? "saving" : hasDirtyBlocks ? "unsaved" : "saved"
      }
    }));
  }, [dirtyBlocks, isReordering, savingBlocks]);

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
    const handleReorderBoundary = (event: Event) => {
      void (async () => {
        const detail = (event as CustomEvent<{ activeId?: string; newIndex?: number }>).detail;
        if (!detail?.activeId || !Number.isInteger(detail.newIndex)) return;

        if (reorderInFlightRef.current) {
          setPersistenceError("A document reorder is already being saved. Wait for it to finish before moving another section.");
          return;
        }

        const current = blocksRef.current;
        const activeBoundary = documentBoundaries.find((boundary) => boundary.id === detail.activeId);
        if (!activeBoundary) return;

        const boundariesWithoutActive = documentBoundaries.filter((boundary) => boundary.id !== detail.activeId);
        const targetIndex = Math.max(0, Math.min(detail.newIndex ?? 0, boundariesWithoutActive.length));
        boundariesWithoutActive.splice(targetIndex, 0, activeBoundary);

        const nextBlocks: Block[] = [];
        const firstBoundary = documentBoundaries[0];
        const lastBoundary = documentBoundaries[documentBoundaries.length - 1];
        if (firstBoundary) nextBlocks.push(...current.slice(0, firstBoundary.startIndex));
        for (const boundary of boundariesWithoutActive) {
          nextBlocks.push(...current.slice(boundary.startIndex, boundary.endIndex + 1));
        }
        if (lastBoundary && lastBoundary.endIndex < current.length - 1) {
          nextBlocks.push(...current.slice(lastBoundary.endIndex + 1));
        }

        reorderInFlightRef.current = true;
        setIsReordering(true);
        setPersistenceError(null);
        blocksRef.current = nextBlocks;
        setBlocks(nextBlocks);

        try {
          const result = await reorderDocumentBlocksAction(documentId, nextBlocks.map((block) => block.id));
          if (!result.ok) {
            blocksRef.current = current;
            setBlocks(current);
            setPersistenceError(result.error);
          }
        } catch (error) {
          blocksRef.current = current;
          setBlocks(current);
          setPersistenceError(error instanceof Error
            ? `The document order was not saved: ${error.message}`
            : "The document order was not saved. The previous order was restored.");
        } finally {
          reorderInFlightRef.current = false;
          setIsReordering(false);
        }
      })();
    };

    window.addEventListener("quipsly:reorder-boundary", handleReorderBoundary);
    return () => window.removeEventListener("quipsly:reorder-boundary", handleReorderBoundary);
  }, [documentBoundaries, documentId]);

  useEffect(() => {
    const insertBlockAtActiveBoundaryEnd = (newBlock: Block) => {
      const activeBoundary = activeBoundaryId ? documentBoundaries.find(b => b.id === activeBoundaryId) : null;
      const insertIndex = activeBoundary ? activeBoundary.endIndex + 1 : blocksRef.current.length;

      setBlocks(current => {
        const next = [...current];
        next.splice(insertIndex, 0, newBlock);
        return next;
      });

      window.setTimeout(() => {
        void handleTextBlur(newBlock.id, newBlock.text);
        const el = textareaRefs.current[newBlock.id];
        if (el) {
          el.focus();
          el.selectionStart = 0;
          el.selectionEnd = newBlock.text.length;
        }
      }, 100);
    };

    const handleAssistantEditApplied = (event: Event) => {
      const receipt = (event as CustomEvent<AssistantDocumentApplyReceipt>).detail;
      if (!receipt || receipt.documentId !== documentId) return;

      setBlocks((current) => {
        if (receipt.kind === "rewrite") {
          const next = current.map((block) => block.id === receipt.blockId
            ? { ...block, text: receipt.text }
            : block);
          const committed = next.find((block) => block.id === receipt.blockId);
          if (committed) committedSnapshotsRef.current[committed.id] = snapshotFromBlock(committed);
          return next;
        }

        if (current.some((block) => block.id === receipt.blockId)) return current;
        const created: Block = { id: receipt.blockId, text: receipt.text, tags: [], spans: [] };
        committedSnapshotsRef.current[created.id] = snapshotFromBlock(created);
        const next = [...current];
        const targetIndex = receipt.insertAfterBlockId
          ? next.findIndex((block) => block.id === receipt.insertAfterBlockId)
          : -1;
        next.splice(targetIndex >= 0 ? targetIndex + 1 : next.length, 0, created);
        return next;
      });
      setDirtyBlocks((current) => {
        const next = { ...current };
        delete next[receipt.blockId];
        return next;
      });
    };

    const handleAssistantEditUndone = (event: Event) => {
      const detail = (event as CustomEvent<AssistantDocumentApplyReceipt & { restoredText: string | null }>).detail;
      if (!detail || detail.documentId !== documentId) return;

      setBlocks((current) => {
        if (detail.kind === "draft") {
          const next = current.filter((block) => block.id !== detail.blockId);
          delete committedSnapshotsRef.current[detail.blockId];
          return next;
        }
        if (detail.restoredText === null) return current;
        const restoredText = detail.restoredText;
        const next = current.map((block) => block.id === detail.blockId
          ? { ...block, text: restoredText }
          : block);
        const restored = next.find((block) => block.id === detail.blockId);
        if (restored) committedSnapshotsRef.current[restored.id] = snapshotFromBlock(restored);
        return next;
      });
      setDirtyBlocks((current) => {
        const next = { ...current };
        delete next[detail.blockId];
        return next;
      });
    };

    const handleCreateStructureBlock = (event: Event) => {
      const detail = (event as CustomEvent<{ kind?: "chapter" | "episode"; label?: string }>).detail;
      const kind = detail?.kind === "episode" ? "episode" : "chapter";
      const fallbackLabel = kind === "episode" ? "New Episode" : "New Chapter";
      const label = String(detail?.label || fallbackLabel).trim() || fallbackLabel;

      insertBlockAtActiveBoundaryEnd({
        id: `pending-${kind}-${Date.now()}`,
        text: label,
        tags: [kind],
        spans: []
      });
    };

    window.addEventListener("quipsly:assistant-edit-applied", handleAssistantEditApplied);
    window.addEventListener("quipsly:assistant-edit-undone", handleAssistantEditUndone);
    window.addEventListener("quipsly:create-structure-block", handleCreateStructureBlock);
    return () => {
      window.removeEventListener("quipsly:assistant-edit-applied", handleAssistantEditApplied);
      window.removeEventListener("quipsly:assistant-edit-undone", handleAssistantEditUndone);
      window.removeEventListener("quipsly:create-structure-block", handleCreateStructureBlock);
    };
  }, [activeBoundaryId, documentBoundaries, documentId]);

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

  const handleToggleTag = async (
    blockId: string,
    tagId: string,
    selectionOverride?: { startOffset: number; endOffset: number; selectedText: string } | null,
  ): Promise<
    | { ok: true; operation: "added" | "removed" }
    | { ok: false; error: string }
  > => {
    const previousScroll = captureScrollState();
    setPersistenceError(null);
    // Optimistic UI update
    const block = getCurrentBlock(blockId);
    if (!block) return { ok: false, error: "The writing block is no longer available." };
    const beforeSnapshot = snapshotFromBlock(block);
    const isStructureTag = STRUCTURE_TAG_IDS.has(tagId);
    const fullBlockSelection = {
      startOffset: 0,
      endOffset: block.text.length,
      selectedText: block.text,
    };
    const selection = isStructureTag
      ? undefined
      : selectionOverride === undefined
        ? selectedRanges[blockId] ?? fullBlockSelection
        : selectionOverride ?? fullBlockSelection;
    
    setBlocks((currentBlocks) => {
      const nextBlocks = currentBlocks.map(b => {
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
        const nextSpans = exists
          ? spans.filter(span => !(span.tagSlug === tagId && span.startOffset === selectedSpan.startOffset && span.endOffset === selectedSpan.endOffset))
          : [...spans, selectedSpan];
        return {
          ...b,
          tags: nextSpans.some((span) => span.tagSlug === tagId)
            ? (b.tags.includes(tagId) ? b.tags : [...b.tags, tagId])
            : b.tags.filter((existingTagId) => existingTagId !== tagId),
          spans: nextSpans,
        };
      }

      const hasTagLocally = b.tags.includes(tagId) || (b.spans ?? []).some(s => s.tagSlug === tagId);
      if (hasTagLocally) {
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
      });
      blocksRef.current = nextBlocks;
      return nextBlocks;
    });

    let savedOperation: "added" | "removed";
    try {
      const result = await toggleBlockTag(blockId, documentId, projectId, tagId, block.text, selection);
      if (!result.ok) {
        restoreBlockLocally(beforeSnapshot);
        restoreScrollState(previousScroll);
        setPersistenceError(result.error);
        return { ok: false, error: result.error };
      }
      savedOperation = result.operation;
      if (result.operation === "added") {
        const persistedSelection = selection ?? fullBlockSelection;
        setBlocks((currentBlocks) => {
          const nextBlocks = currentBlocks.map((currentBlock) => {
            if (currentBlock.id !== blockId) return currentBlock;
            const spans = (currentBlock.spans ?? []).filter((span) =>
              !(
                span.tagSlug === tagId
                && span.startOffset === persistedSelection.startOffset
                && span.endOffset === persistedSelection.endOffset
              )
            );
            return {
              ...currentBlock,
              tags: currentBlock.tags.includes(tagId)
                ? currentBlock.tags
                : [...currentBlock.tags, tagId],
              spans: [...spans, {
                id: result.spanId,
                tagSlug: tagId,
                label: getTagDef(tagId)?.label ?? tagId,
                category: getTagDef(tagId)?.category,
                startOffset: persistedSelection.startOffset,
                endOffset: persistedSelection.endOffset,
                selectedText: persistedSelection.selectedText,
              }],
            };
          });
          blocksRef.current = nextBlocks;
          return nextBlocks;
        });
      }
    } catch (error) {
      restoreBlockLocally(beforeSnapshot);
      restoreScrollState(previousScroll);
      const message = error instanceof Error
        ? `The tag was not saved: ${error.message}`
        : "The tag was not saved.";
      setPersistenceError(message);
      return { ok: false, error: message };
    }

    const restoredSnapshot = beforeSnapshot;
    const tagLabel = getTagDef(tagId)?.label ?? tagId;
    pushUndo({
      label: savedOperation === "added"
        ? `Remove ${tagLabel} from ${labelForBlock(beforeSnapshot)}`
        : `Restore ${tagLabel} on ${labelForBlock(beforeSnapshot)}`,
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

    const latest = getCurrentBlock(blockId);
    if (latest) {
      ensureCommittedSnapshot(latest);
    }
    restoreScrollState(previousScroll);
    return { ok: true, operation: savedOperation };
  };

  const handleAddComment = useCallback(async (
    blockId: string,
    startOffset: number,
    endOffset: number,
    selectedText: string,
    noteBody: string,
  ) => {
    setPersistenceError(null);
    try {
      const result = await addBlockComment(blockId, startOffset, endOffset, selectedText, noteBody);
      if (!result.ok) {
        setPersistenceError(result.error);
        return false;
      }

      setBlocks((currentBlocks) => currentBlocks.map((block) => block.id === blockId
        ? {
            ...block,
            spans: [...(block.spans || []), {
              id: result.commentId,
              tagSlug: "comment",
              label: "Comment",
              startOffset,
              endOffset,
              selectedText,
              noteBody,
            }],
          }
        : block));
      return true;
    } catch (error) {
      setPersistenceError(error instanceof Error
        ? `The comment was not saved: ${error.message}`
        : "The comment was not saved.");
      return false;
    }
  }, []);

  const handleCreatePassageTag = async (
    blockId: string,
    startOffset: number,
    endOffset: number,
    selectedText: string,
    label: string,
  ) => {
    setPersistenceError(null);
    const beforeBlock = getCurrentBlock(blockId);
    if (!beforeBlock) {
      return { ok: false as const, error: "The selected writing block is no longer available." };
    }
    const beforeSnapshot = snapshotFromBlock(beforeBlock);

    try {
      const result = await createAndApplyPassageTag({
        blockId,
        startOffset,
        endOffset,
        selectedText,
        label,
      });
      if (!result.ok) {
        setPersistenceError(result.error);
        return { ok: false as const, error: result.error };
      }

      registerProjectTag({
        id: result.tag.id,
        slug: result.tag.slug,
        label: result.tag.label,
        category: result.tag.category,
      });
      setBlocks((currentBlocks) => currentBlocks.map((block) => {
        if (block.id !== blockId) return block;
        const spans = block.spans ?? [];
        const alreadyPresent = spans.some((span) =>
          span.tagSlug === result.tag.slug
          && span.startOffset === startOffset
          && span.endOffset === endOffset
        );
        return {
          ...block,
          tags: block.tags.includes(result.tag.slug)
            ? block.tags
            : [...block.tags, result.tag.slug],
          spans: alreadyPresent
            ? spans
            : [...spans, {
                id: result.spanId,
                tagSlug: result.tag.slug,
                label: result.tag.label,
                category: result.tag.category,
                startOffset,
                endOffset,
                selectedText,
              }],
        };
      }));
      pushUndo({
        label: `Remove ${result.tag.label} from ${labelForBlock(beforeSnapshot)}`,
        createdAtLabel: "tag",
        undo: async () => {
          restoreBlockLocally(beforeSnapshot);
          await restoreBlockState(blockId, beforeSnapshot.text, beforeSnapshot.spans);
          const currentBlock = getCurrentBlock(blockId);
          if (currentBlock) ensureCommittedSnapshot(currentBlock);
        },
      });
      return {
        ok: true as const,
        created: result.createdTag,
        tagLabel: result.tag.label,
      };
    } catch (error) {
      const message = error instanceof Error
        ? `The tag was not created: ${error.message}`
        : "The tag was not created.";
      setPersistenceError(message);
      return { ok: false as const, error: message };
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

    await restoreBlockState(block.id, block.text, []);
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
    }
  };

  const handleTextChange = (blockId: string, newText: string) => {
    // Optimistic UI update
    setBlocks((currentBlocks) => currentBlocks.map(b => {
      if (b.id !== blockId) return b;
      return { ...b, text: newText };
    }));
    setDirtyBlocks(prev => ({ ...prev, [blockId]: true }));
    setPersistenceError(null);
  };

  const handleTextBlur = async (blockId: string, newText: string) => {
    if (saveInFlightRef.current.has(blockId)) return;
    saveInFlightRef.current.add(blockId);
    setPersistenceError(null);
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
      const latestBlock = getCurrentBlock(blockId);
      if (latestBlock) {
        ensureCommittedSnapshot({ ...latestBlock, text: newText });
      }
      setDirtyBlocks(prev => {
        if (getCurrentBlock(blockId)?.text !== newText) {
          return { ...prev, [blockId]: true };
        }
        const next = { ...prev };
        delete next[blockId];
        return next;
      });
    } catch (error) {
      console.error("Block save failed.", error);
      setDirtyBlocks(prev => ({ ...prev, [blockId]: true }));
      setPersistenceError("This block could not be saved. Your edit is still on this screen; change it or leave and return to the field to retry.");
    } finally {
      saveInFlightRef.current.delete(blockId);
      setSavingBlocks(prev => ({ ...prev, [blockId]: false }));
    }
  };

  useEffect(() => {
    if (persistenceError) return;

    const timers: number[] = [];
    for (const [blockId, isDirty] of Object.entries(dirtyBlocks)) {
      if (!isDirty || savingBlocks[blockId] || saveInFlightRef.current.has(blockId)) continue;
      const block = blocks.find((candidate) => candidate.id === blockId);
      if (!block) continue;

      timers.push(window.setTimeout(() => {
        const latestBlock = blocksRef.current.find((candidate) => candidate.id === blockId);
        if (latestBlock) void handleTextBlur(blockId, latestBlock.text);
      }, BLOCK_AUTOSAVE_DELAY_MS));
    }

    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [blocks, dirtyBlocks, persistenceError, savingBlocks]);

  useEffect(() => {
    const hasPendingSave = isReordering
      || Object.values(dirtyBlocks).some(Boolean)
      || Object.values(savingBlocks).some(Boolean);
    if (!hasPendingSave) return;

    const protectUnsavedWork = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protectUnsavedWork);
    return () => window.removeEventListener("beforeunload", protectUnsavedWork);
  }, [dirtyBlocks, isReordering, savingBlocks]);

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

  const handleFindSupportingQuote = useCallback(async (blockId: string, query: string) => {
    try {
      const { searchSemanticQuotes } = await import("../../actions/lore-actions");
      const rawResults = await searchSemanticQuotes(projectId, query, 1);
      const results = rawResults as any[];
      
      if (results && results.length > 0) {
        const topQuote = results[0];
        const insertedText = `"${topQuote.text}" - QuipLore ID: ${topQuote.id}`;
        
        const newId = `pending-quote-${Date.now()}`;
        
        // Optimistically insert block
        setBlocks(current => {
          const next = [...current];
          const idx = next.findIndex(b => b.id === blockId);
          if (idx !== -1) {
            next.splice(idx + 1, 0, {
              id: newId,
              text: insertedText,
              tags: ["quote-attribution"],
              spans: []
            });
          }
          return next;
        });

        // Background save
        const { saveBlockContent } = await import("./actions");
        await saveBlockContent(newId, insertedText);
      }
    } catch (err) {
      console.error("Failed to find supporting quote:", err);
    }
  }, [projectId, documentId]);

  const handlePasteBlocks = useCallback(async (blockId: string, chunks: string[], selectionStart: number, selectionEnd: number) => {
    if (chunks.length <= 1) return;
    setSavingBlocks((current) => ({ ...current, [blockId]: true }));
    setPersistenceError(null);
    try {
      const result = await pastePlainTextBlocksAction(blockId, chunks, selectionStart, selectionEnd);
      if (!result.ok) {
        setPersistenceError(result.error);
        return;
      }
      setBlocks((current) => {
        const index = current.findIndex((block) => block.id === blockId);
        if (index === -1) return current;
        const next = [...current];
        next[index] = result.currentBlock;
        next.splice(index + 1, 0, ...result.newBlocks);
        return next;
      });
      ensureCommittedSnapshot(result.currentBlock);
      for (const block of result.newBlocks) ensureCommittedSnapshot(block);
      setDirtyBlocks((current) => {
        const next = { ...current };
        delete next[blockId];
        return next;
      });
      window.setTimeout(() => {
        const lastBlock = result.newBlocks.at(-1);
        if (!lastBlock) return;
        const textarea = textareaRefs.current[lastBlock.id];
        if (!textarea) return;
        textarea.focus();
        textarea.selectionStart = lastBlock.text.length;
        textarea.selectionEnd = lastBlock.text.length;
      }, 0);
    } catch (error) {
      console.error("Atomic paste failed.", error);
      setPersistenceError("The pasted blocks were not saved. The canonical document was left unchanged.");
    } finally {
      setSavingBlocks((current) => ({ ...current, [blockId]: false }));
    }
  }, []);

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
                selectedText: span.selectedText,
                noteBody: span.noteBody,
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
                  selectedText: span.selectedText,
                  noteBody: span.noteBody,
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
      {persistenceError ? (
        <div className="mb-5 flex items-start justify-between gap-4 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-900" role="alert">
          <div>
            <strong className="block font-black">Not saved</strong>
            {persistenceError}
          </div>
          <button
            type="button"
            onClick={() => setPersistenceError(null)}
            className="shrink-0 rounded-md border border-rose-300 px-2 py-1 text-xs font-black hover:bg-rose-100"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {undoStack.length > 0 ? (
        <div className="fixed bottom-6 right-6 z-50 w-full max-w-sm rounded-xl border border-[#eadfca] bg-white/95 p-3 text-sm text-[#5e4b33] shadow-lg backdrop-blur-sm">
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
          previousBlockIsImmutable={Boolean(
            blocks[(blockIndexById.get(block.id) ?? index) - 1]?.sourceEvidence?.immutable
          )}
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
          onAddComment={handleAddComment}
          onCreatePassageTag={handleCreatePassageTag}
          onFindSupportingQuote={handleFindSupportingQuote}
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
