"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Plus, Tag, MessageSquare, Mic, List, PlayCircle } from "lucide-react";
import { DocumentBoundary, ViewDefinition } from "./types";
import {
  mergeBlockWithPrevious,
  restoreBlockState,
  saveBlockContent,
  splitBlockAtOffset,
  toggleBlockTag,
} from "./actions";
import ClipCueCard, { hasYouTubeClipCue } from "./ClipCueCard";

type Block = {
  id: string;
  text: string;
  tags: string[];
  spans?: TaggedSpan[];
};

type TaggedSpan = {
  id?: string;
  tagSlug: string;
  label?: string;
  category?: string;
  startOffset: number;
  endOffset: number;
  selectedText: string;
};

type TagDefinition = {
  id: string;
  label: string;
  category: string;
  icon: typeof Tag;
  color: string;
  mark: string;
};

const AVAILABLE_TAGS: TagDefinition[] = [
  { id: "quote", label: "Quote", category: "quote", icon: MessageSquare, color: "bg-blue-100 text-blue-800 border-blue-200", mark: "bg-blue-100 text-blue-950 ring-blue-200" },
  { id: "social-clip", label: "Social Clip", category: "media", icon: Mic, color: "bg-purple-100 text-purple-800 border-purple-200", mark: "bg-purple-100 text-purple-950 ring-purple-200" },
  { id: "educational", label: "Educational", category: "educational", icon: List, color: "bg-green-100 text-green-800 border-green-200", mark: "bg-green-100 text-green-950 ring-green-200" },
  { id: "internal_note", label: "Internal Note", category: "internal_note", icon: Tag, color: "bg-gray-100 text-gray-800 border-gray-200", mark: "bg-gray-100 text-gray-950 ring-gray-200" },
  { id: "chapter", label: "Chapter", category: "structure", icon: PlayCircle, color: "bg-cyan-100 text-cyan-900 border-cyan-200", mark: "bg-cyan-100 text-cyan-950 ring-cyan-200" },
  { id: "episode", label: "Episode", category: "structure", icon: PlayCircle, color: "bg-rose-100 text-rose-900 border-rose-200", mark: "bg-rose-100 text-rose-950 ring-rose-200" },
  { id: "media", label: "Media", category: "media", icon: PlayCircle, color: "bg-orange-100 text-orange-900 border-orange-200", mark: "bg-orange-100 text-orange-950 ring-orange-200" },
  { id: "episode-1", label: "Episode 1", category: "episode", icon: PlayCircle, color: "bg-red-100 text-red-800 border-red-200", mark: "bg-red-100 text-red-950 ring-red-200" },
  { id: "episode-4", label: "Episode 4", category: "episode", icon: PlayCircle, color: "bg-red-100 text-red-800 border-red-200", mark: "bg-red-100 text-red-950 ring-red-200" },
  { id: "episode-8", label: "Episode 8", category: "episode", icon: PlayCircle, color: "bg-red-100 text-red-800 border-red-200", mark: "bg-red-100 text-red-950 ring-red-200" },
  { id: "episode-9", label: "Episode 9", category: "episode", icon: PlayCircle, color: "bg-red-100 text-red-800 border-red-200", mark: "bg-red-100 text-red-950 ring-red-200" },
  { id: "voice-homer", label: "Homer", category: "content_role", icon: Mic, color: "bg-emerald-100 text-emerald-900 border-emerald-200", mark: "bg-emerald-100 text-emerald-950 ring-emerald-200" },
  { id: "voice-charlie", label: "Charlie", category: "content_role", icon: MessageSquare, color: "bg-sky-100 text-sky-900 border-sky-200", mark: "bg-sky-100 text-sky-950 ring-sky-200" },
  { id: "show-note", label: "Show Note", category: "workflow_status", icon: List, color: "bg-yellow-100 text-yellow-900 border-yellow-200", mark: "bg-yellow-100 text-yellow-950 ring-yellow-200" },
  { id: "clip-cue", label: "Clip Cue", category: "media", icon: PlayCircle, color: "bg-orange-100 text-orange-900 border-orange-200", mark: "bg-orange-100 text-orange-950 ring-orange-200" },
  { id: "published-episode", label: "Published Episode", category: "media", icon: PlayCircle, color: "bg-indigo-100 text-indigo-900 border-indigo-200", mark: "bg-indigo-100 text-indigo-950 ring-indigo-200" },
  { id: "youtube-clip", label: "YouTube Clip", category: "media", icon: PlayCircle, color: "bg-rose-100 text-rose-900 border-rose-200", mark: "bg-rose-100 text-rose-950 ring-rose-200" }
];

function tagDef(tagId: string, extraTagDefs: TagDefinition[] = []) {
  return [...AVAILABLE_TAGS, ...extraTagDefs].find(tag => tag.id === tagId);
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

function extractLinks(text: string) {
  return Array.from(text.matchAll(/https?:\/\/[^\s<>"')]+/gi))
    .map((match) => match[0].replace(/[.,;:!?]+$/, ""));
}

function isYouTubeLink(url: string) {
  return /(^https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i.test(url);
}

function youtubeVideoId(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) return parsed.pathname.replace(/^\//, "") || null;
    if (parsed.hostname.includes("youtube.com")) return parsed.searchParams.get("v");
  } catch {
    return null;
  }
  return null;
}

function episodeTagLabels(block: Block) {
  return uniqueTagIds(block)
    .filter((tagId) => /^episode-[a-z0-9-]+$/i.test(tagId))
    .map((tagId) => tagDef(tagId)?.label ?? tagId);
}

function publishedEpisodeLinks(block: Block) {
  return extractLinks(block.text).filter(isYouTubeLink);
}

function shouldShowPublishedEpisodeCard(block: Block) {
  const tagIds = uniqueTagIds(block);
  return tagIds.includes("published-episode") && publishedEpisodeLinks(block).length > 0;
}

const UNDO_GROUP_WINDOW_MS = 1400;
const MAX_UNDO_HISTORY = 40;

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

function PublishedEpisodeCard({ block }: { block: Block }) {
  const links = publishedEpisodeLinks(block);
  const labels = episodeTagLabels(block);

  if (links.length === 0) return null;

  return (
    <div className="mb-3 rounded-2xl border border-indigo-200 bg-indigo-50/80 p-3 text-sm text-indigo-950 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-indigo-800">
            <PlayCircle size={14} />
            Published episode link
          </div>
          <div className="mt-1 font-bold leading-5">
            Existing public artifact. Keep it represented here until we re-import and re-edit it inside Quipsly.
          </div>
        </div>
        {labels.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {labels.map((label) => (
              <span key={label} className="rounded-full border border-indigo-200 bg-white px-2 py-1 text-[11px] font-black text-indigo-800">
                {label}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <div className="mt-3 grid gap-2">
        {links.map((url) => {
          const videoId = youtubeVideoId(url);
          return (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-indigo-200 bg-white px-3 py-2 font-mono text-xs font-bold text-indigo-900 shadow-sm transition-colors hover:bg-indigo-100"
            >
              {videoId ? `YouTube ${videoId}` : url}
            </a>
          );
        })}
      </div>
    </div>
  );
}

export default function Tagger({ 
  activeView, 
  activeBoundaryId,
  documentBoundaries,
  adHocTags,
  initialBlocks,
  projectId,
  documentId,
  scrollContainerRef,
  availableEpisodeTags = [],
  onBlocksChange
}: { 
  activeView: ViewDefinition, 
  activeBoundaryId?: string | null,
  documentBoundaries?: DocumentBoundary[],
  adHocTags: string[],
  initialBlocks: Block[],
  projectId: string,
  documentId: string,
  scrollContainerRef?: RefObject<HTMLDivElement | null>,
  availableEpisodeTags?: { id: string; label: string }[],
  onBlocksChange?: (blocks: Block[]) => void
}) {
  const customTagDefs = useMemo<TagDefinition[]>(() => {
    const map = new Map<string, TagDefinition>(AVAILABLE_TAGS.map((tag) => [tag.id, tag]));
    for (const tag of availableEpisodeTags) {
      if (map.has(tag.id)) continue;
      map.set(tag.id, {
        id: tag.id,
        label: tag.label,
        category: "episode",
        icon: PlayCircle,
        color: "bg-red-100 text-red-800 border-red-200",
        mark: "bg-red-100 text-red-950 ring-red-200"
      });
    }
    return [...map.values()];
  }, [availableEpisodeTags]);

  const getTagDef = (tagId: string) => tagDef(tagId, customTagDefs);
  const taggingTagOptions = useMemo(() => [...customTagDefs], [customTagDefs]);

  const [blocks, setBlocks] = useState<Block[]>(initialBlocks);
  const [activeMenuBlock, setActiveMenuBlock] = useState<string | null>(null);
  const [selectedRanges, setSelectedRanges] = useState<Record<string, { startOffset: number; endOffset: number; selectedText: string }>>({});
  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const blocksRef = useRef<Block[]>(initialBlocks);
  const committedSnapshotsRef = useRef<Record<string, BlockSnapshot>>({});
  const lastUndoActionTimeRef = useRef<number>(0);
  const undoGroupIdRef = useRef<string>(`undo-group-${Date.now()}`);
  
  // Track save status per block
  const [savingBlocks, setSavingBlocks] = useState<Record<string, boolean>>({});
  const [dirtyBlocks, setDirtyBlocks] = useState<Record<string, boolean>>({});
  const [undoStack, setUndoStack] = useState<UndoAction[]>([]);
  const [showUndoHistory, setShowUndoHistory] = useState(false);

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

  // Sync state if initialBlocks changes (e.g. Server Action revalidation)
  useEffect(() => {
    blocksRef.current = initialBlocks;
    for (const block of initialBlocks) {
      ensureCommittedSnapshot(block);
    }
    setBlocks(initialBlocks);
  }, [initialBlocks]);

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
    const selection = selectedRanges[blockId];
    
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
      } else {
        return { ...b, tags: [...b.tags, tagId] };
      }
    }));

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

  const handleTextChange = (blockId: string, newText: string) => {
    // Optimistic UI update
    setBlocks((currentBlocks) => currentBlocks.map(b => {
      if (b.id !== blockId) return b;
      return { ...b, text: newText };
    }));
    setDirtyBlocks(prev => ({ ...prev, [blockId]: true }));
  };

  const handleTextBlur = async (blockId: string, newText: string) => {
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
    }
  };

  const handleNormalizeHeading = async (block: Block) => {
    const suggestion = canonicalBoundarySuggestion(block.text);
    if (!suggestion) return;

    const lines = block.text.split("\n");
    const nextText = [suggestion, ...lines.slice(1)].join("\n");
    if (nextText === block.text) return;

    handleTextChange(block.id, nextText);
    await handleTextBlur(block.id, nextText);
  };

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

    window.setTimeout(() => textareaRefs.current[pendingId]?.focus(), 0);

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

    window.setTimeout(() => {
      restoreScrollState(previousScroll);
      textareaRefs.current[result.newBlock.id]?.focus();
    }, 0);
  };

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

  return (
    <div className="space-y-3">
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

      {visibleBlocks.map(block => (
        <div 
          key={block.id} 
          className={`relative group px-4 py-3 -mx-4 rounded-lg hover:bg-[#fdfaf6] transition-colors ${blockAccentClass(block)}`}
        >
          {/* Render applied tags above the block */}
          {uniqueTagIds(block).length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {uniqueTagIds(block).map(t => {
                const definition = getTagDef(t);
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

          {(block.spans ?? []).length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2 rounded-xl border border-[#eadfca] bg-[#fffaf0] px-3 py-2 text-xs text-[#5e4b33]">
              {(block.spans ?? []).slice(0, 6).map((span) => {
                const definition = getTagDef(span.tagSlug);
                const Icon = definition?.icon ?? Tag;
                const selectedText = (span.selectedText || block.text.slice(span.startOffset, span.endOffset)).trim();
                return (
                  <span
                    key={span.id ?? `${block.id}-${span.startOffset}-${span.endOffset}-${span.tagSlug}`}
                    className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-1 font-bold ${definition?.color ?? "border-[#d4c1a0] bg-white text-[#5e4b33]"}`}
                    title={selectedText}
                  >
                    <Icon size={11} />
                    <span className="shrink-0">{definition?.label ?? span.tagSlug}</span>
                    {selectedText ? (
                      <span className="min-w-0 max-w-[18rem] truncate font-medium normal-case tracking-normal opacity-80">
                        {selectedText}
                      </span>
                    ) : null}
                  </span>
                );
              })}
              {(block.spans ?? []).length > 6 && (
                <span className="rounded-full border border-[#d4c1a0] bg-white px-2 py-1 font-bold text-[#8c6b4a]">
                  +{(block.spans ?? []).length - 6} more marks
                </span>
              )}
            </div>
          )}

          {shouldShowPublishedEpisodeCard(block) ? (
            <PublishedEpisodeCard block={block} />
          ) : null}

          {shouldShowClipCueCard(block) ? (
            <ClipCueCard
              text={block.text}
              onChange={(nextText) => handleTextChange(block.id, nextText)}
              onCommit={(nextText) => handleTextBlur(block.id, nextText)}
            />
          ) : null}

          {canonicalBoundarySuggestion(block.text) ? (
            <button
              type="button"
              onClick={() => void handleNormalizeHeading(block)}
              className="mb-2 inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-900 transition-colors hover:bg-emerald-100"
            >
              Normalize heading: {canonicalBoundarySuggestion(block.text)}
            </button>
          ) : null}

          {/* Auto-resizing textarea for editing text */}
          <textarea
            className="w-full resize-none overflow-hidden rounded-xl border border-[#eadfca] bg-white/80 px-4 py-3 font-serif text-xl leading-relaxed text-[#3d3122] shadow-inner outline-none transition-colors focus:border-[#d8b777] focus:bg-white focus:ring-2 focus:ring-amber-100"
            value={block.text}
            onChange={(e) => {
              e.target.style.height = 'auto';
              e.target.style.height = e.target.scrollHeight + 'px';
              handleTextChange(block.id, e.target.value);
            }}
            onBlur={(e) => handleTextBlur(block.id, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Backspace" && e.currentTarget.selectionStart === 0 && e.currentTarget.selectionEnd === 0) {
                e.preventDefault();
                void handleMergeWithPrevious(block.id);
                return;
              }

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
              {taggingTagOptions.map(tag => {
                const Icon = tag.icon;
                return (
                <button
                  key={tag.id}
                  onClick={() => handleToggleTag(block.id, tag.id)}
                    onMouseDown={(event) => event.preventDefault()}
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
          <div className="flex justify-end mt-2 md:mt-0 relative">
            <button 
              onClick={() => setActiveMenuBlock(activeMenuBlock === block.id ? null : block.id)}
              onMouseDown={(event) => event.preventDefault()}
              className="md:absolute md:right-3 md:top-3 p-2 md:p-2 py-1.5 px-3 rounded-full md:bg-white shadow-sm border border-[#e8dcc4] text-[#8c6b4a] hover:text-[#3d3122] md:hover:bg-amber-50 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex items-center gap-2 bg-[#f8f1e3] hover:bg-[#ebdcc8]"
            >
              <Plus size={16} /> <span className="md:hidden text-[10px] uppercase font-bold tracking-wider text-[#5e4b33]">Tag</span>
            </button>

            {/* Floating Tag Menu */}
            {activeMenuBlock === block.id && (
              <div className="absolute bottom-12 right-0 md:top-12 md:bottom-auto md:right-3 w-48 md:w-56 bg-white rounded-xl shadow-xl border border-[#e8dcc4] p-2 z-20 flex flex-col gap-1">
                <div className="text-[10px] uppercase tracking-wider font-bold text-[#8c6b4a] px-2 py-1 mb-1 border-b border-[#e8dcc4]">
                  Apply Tags
                </div>
                {taggingTagOptions.map(tag => {
                  const isSelected = block.tags.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      onClick={() => handleToggleTag(block.id, tag.id)}
                      onMouseDown={(event) => event.preventDefault()}
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
        </div>
      ))}
    </div>
  );
}
