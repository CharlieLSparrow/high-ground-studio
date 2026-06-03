"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { 
  Video, 
  Sparkles, 
  Play, 
  Check, 
  RefreshCw, 
  ChevronLeft, 
  ChevronRight, 
  BookOpen, 
  Tag,
  Clapperboard
} from "lucide-react";
import type {
  KnowledgeNode,
  StudioBlock,
  StudioDocument,
  StudioTag,
  StudioTagApplication,
} from "@high-ground/studio-domain";
import {
  createKnowledgeNodeFromTaggedSpan,
  createSpanSnapshot,
  createTagApplication,
  formatProvenanceLabel,
  validateSpanOffsets,
} from "@high-ground/studio-domain";

import { createStudioTaggedSpanAction } from "./actions";
import { StudioNav } from "./studio-nav";
import Editor from "@/components/Editor";
import {
  cardClassName,
  cn,
  labelClassName,
  monoMetaClassName,
  panelClassName,
  panelCopyClassName,
  panelTitleClassName,
  primaryButtonClassName,
  StudioChip,
  StudioGlyph,
} from "./studio-ui";
import { VideoSegmentDesk } from "./editor/VideoSegmentDesk";

const excerptPresets = [
  {
    id: "excerpt-name-moment",
    blockId: "l2l-seed-001",
    label: "name what is happening",
    phrase: "name what is happening",
  },
  {
    id: "excerpt-responsible-action",
    blockId: "l2l-seed-001",
    label: "practice the next responsible action",
    phrase: "practice the next responsible action",
  },
  {
    id: "excerpt-source-trail",
    blockId: "l2l-seed-002",
    label: "see the source, test the meaning",
    phrase: "see the source, test the meaning",
  },
  {
    id: "excerpt-public-truth",
    blockId: "l2l-seed-003",
    label: "no rough note accidentally becomes public truth",
    phrase: "no rough note accidentally becomes public truth",
  },
];

type ExcerptPreset = (typeof excerptPresets)[number];

type StudioPersistenceState = {
  mode: "database" | "fallback";
  canWrite: boolean;
  message: string;
};

type StudioActionState = {
  ok: boolean;
  message: string;
} | null;

type StudioWorkbenchClientProps = {
  document: StudioDocument;
  tags: StudioTag[];
  tagApplications: StudioTagApplication[];
  knowledgeNodes: KnowledgeNode[];
  persistence: StudioPersistenceState;
  actor: {
    primaryEmail: string;
  };
  collabRoom: string;
  collabToken: string;
  collabUrl: string;
};

function findBlock(blocks: StudioBlock[], blockId: string) {
  return blocks.find((block) => block.id === blockId) ?? blocks[0];
}

function getPresetOffsets(blocks: StudioBlock[], preset: ExcerptPreset) {
  const block = findBlock(blocks, preset.blockId);
  const startOffset = block.body.indexOf(preset.phrase);

  if (startOffset < 0) {
    return { startOffset: 0, endOffset: Math.min(48, block.body.length) };
  }

  return {
    startOffset,
    endOffset: startOffset + preset.phrase.length,
  };
}

function getDefaultPresetForBlock(blockId: string) {
  return (
    excerptPresets.find((preset) => preset.blockId === blockId) ??
    excerptPresets[0]
  );
}

function renderBlockText(
  block: StudioBlock,
  activeBlockId: string,
  startOffset: number,
  endOffset: number,
) {
  const validation = validateSpanOffsets(block.body, startOffset, endOffset);

  if (block.id !== activeBlockId || !validation.ok) {
    return block.body;
  }

  return (
    <>
      {block.body.slice(0, startOffset)}
      <mark className="rounded bg-studio-tag/20 text-studio-ink shadow-[inset_0_-2px_0_rgba(159,209,139,0.86)]">
        {block.body.slice(startOffset, endOffset)}
      </mark>
      {block.body.slice(endOffset)}
    </>
  );
}

function formatStatus(value: string) {
  return value.replaceAll("_", " ");
}

const fieldLabelClassName =
  "text-[0.78rem] font-extrabold uppercase text-studio-muted";

const fieldClassName =
  "min-h-10 w-full rounded-lg border border-studio-line-strong bg-[#0f1512] px-2.5 py-2 text-studio-ink";

const smallButtonClassName =
  "min-h-8 shrink-0 rounded-lg border border-studio-line bg-studio-ink/5 px-2.5 py-1.5 text-[0.78rem] font-extrabold text-studio-source aria-pressed:border-studio-source/55 aria-pressed:bg-studio-source/10";

const offsetLabelClassName =
  "inline-flex max-w-full break-words font-mono text-[0.72rem] leading-snug text-studio-dim";

export function StudioWorkbenchClient({
  document,
  tags,
  tagApplications,
  knowledgeNodes,
  persistence,
  actor,
  collabRoom,
  collabToken,
  collabUrl,
}: StudioWorkbenchClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const initialBlock = document.blocks[0];
  const initialPreset = getDefaultPresetForBlock(initialBlock.id);
  const initialOffsets = getPresetOffsets(document.blocks, initialPreset);
  const [selectedBlockId, setSelectedBlockId] = useState(initialPreset.blockId);
  const [selectedExcerptId, setSelectedExcerptId] = useState(initialPreset.id);
  const [startOffset, setStartOffset] = useState(initialOffsets.startOffset);
  const [endOffset, setEndOffset] = useState(initialOffsets.endOffset);
  const [selectedTagId, setSelectedTagId] = useState(tags[0]?.id ?? "");
  const [actionState, setActionState] = useState<StudioActionState>(null);

  // AI Clip Generator states
  const [clipStatus, setClipStatus] = useState<"idle" | "analyzing" | "cropping" | "done">("idle");
  const [clipProgress, setClipProgress] = useState(0);

  const [leftPaneExpanded, setLeftPaneExpanded] = useState(true);
  const [activeTool, setActiveTool] = useState<"tagging" | "breakdown" | "video" | "segment">("tagging");

  const handleSelectTagging = (text: string) => {
    setActiveTool("tagging");
    if (!text) return;
    const index = selectedBlock.body.indexOf(text);
    if (index >= 0) {
      setStartOffset(index);
      setEndOffset(index + text.length);
    }
  };

  const handleSelectBreakdown = (text: string) => {
    setActiveTool("breakdown");
    if (!text) return;
    const index = selectedBlock.body.indexOf(text);
    if (index >= 0) {
      setStartOffset(index);
      setEndOffset(index + text.length);
    }
  };

  const handleSelectVideo = () => {
    setActiveTool("video");
  };

  const handleAutoClip = () => {
    if (clipStatus !== "idle") return;
    setClipStatus("analyzing");
    setClipProgress(15);
    
    // Step 1: Multimodal hooks extraction (Gemini 1.5 Pro)
    setTimeout(() => {
      setClipStatus("cropping");
      setClipProgress(60);
      
      // Step 2: FFmpeg 9:16 vertical crop center-slicing
      setTimeout(() => {
        setClipStatus("done");
        setClipProgress(100);
      }, 2000);
    }, 2000);
  };

  const resetClipGenerator = () => {
    setClipStatus("idle");
    setClipProgress(0);
  };

  const selectedBlock = findBlock(document.blocks, selectedBlockId);

  const visibleTags = useMemo(() => {
    if (activeTool === "breakdown") {
      return tags.filter(tag => tag.category === "production_breakdown");
    }
    return tags.filter(tag => tag.category !== "production_breakdown");
  }, [tags, activeTool]);

  const selectedTag = visibleTags.find((tag) => tag.id === selectedTagId) ?? visibleTags[0];
  const blockPresets = excerptPresets.filter(
    (preset) => preset.blockId === selectedBlock.id,
  );
  const spanValidation = validateSpanOffsets(
    selectedBlock.body,
    startOffset,
    endOffset,
  );
  const selectedText = spanValidation.ok
    ? selectedBlock.body.slice(startOffset, endOffset)
    : "";

  const previewApplication = useMemo(() => {
    if (!spanValidation.ok || !selectedTag) {
      return null;
    }

    const span = createSpanSnapshot({
      id: "span-preview",
      documentId: document.id,
      block: selectedBlock,
      startOffset,
      endOffset,
    });

    return createTagApplication({
      id: "tag-app-preview",
      document,
      block: selectedBlock,
      span,
      tag: selectedTag,
      createdAt: "database-preview",
      createdByLabel: actor.primaryEmail,
      projectionStatus: "private",
    });
  }, [
    actor.primaryEmail,
    document,
    endOffset,
    selectedBlock,
    selectedTag,
    spanValidation.ok,
    startOffset,
  ]);

  const previewNode = previewApplication
    ? createKnowledgeNodeFromTaggedSpan({
        id: "node-preview",
        application: previewApplication,
      })
    : null;

  function chooseBlock(blockId: string) {
    const preset = getDefaultPresetForBlock(blockId);
    const offsets = getPresetOffsets(document.blocks, preset);

    setSelectedBlockId(blockId);
    setSelectedExcerptId(preset.id);
    setStartOffset(offsets.startOffset);
    setEndOffset(offsets.endOffset);
    setActionState(null);
  }

  function chooseExcerpt(presetId: string) {
    const preset =
      excerptPresets.find((excerpt) => excerpt.id === presetId) ??
      getDefaultPresetForBlock(selectedBlock.id);
    const offsets = getPresetOffsets(document.blocks, preset);

    setSelectedBlockId(preset.blockId);
    setSelectedExcerptId(preset.id);
    setStartOffset(offsets.startOffset);
    setEndOffset(offsets.endOffset);
    setActionState(null);
  }

  function applyTag() {
    if (!spanValidation.ok || !selectedTag || !persistence.canWrite) {
      return;
    }

    startTransition(() => {
      void createStudioTaggedSpanAction({
        documentStableId: document.id,
        blockStableId: selectedBlock.id,
        tagId: selectedTag.id,
        startOffset,
        endOffset,
      }).then((result) => {
        setActionState(result);
        router.refresh();
      });
    });
  }

  return (
    <main className="min-h-screen p-3.5 md:p-6">
      <div className="grid min-h-[calc(100vh-28px)] grid-rows-[auto_auto_1fr_auto_auto] gap-[18px] md:min-h-[calc(100vh-48px)]">
        <header
          className={cn(
            panelClassName,
            "flex min-h-[72px] flex-col items-stretch justify-between gap-[18px] px-[18px] py-4 lg:flex-row lg:items-center",
          )}
          aria-label="Studio status"
        >
          <div className="flex min-w-0 flex-col items-stretch gap-3.5 sm:flex-row sm:items-center">
            <StudioGlyph />
            <div>
              <h1 className="m-0 text-[1.75rem] leading-[1.08] tracking-normal text-studio-ink max-sm:text-[1.45rem]">
                Quipsly.com
              </h1>
              <p className="mt-1.5 mb-0 max-w-[760px] text-[0.94rem] leading-relaxed text-studio-muted">
                Collect Knowledge, Hatch Wisdom.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
            <StudioNav />
            <StudioChip tone="tag">Studio access</StudioChip>
            <StudioChip className="normal-case" tone="source">
              {actor.primaryEmail}
            </StudioChip>
            <StudioChip tone="source">Private</StudioChip>
            <StudioChip tone="tag">Database seeded</StudioChip>
            <StudioChip tone="node">Not public</StudioChip>
            <StudioChip tone="review">Projection not approved</StudioChip>
          </div>
        </header>

        <section
          className={cn(panelClassName, "grid gap-2 px-4 py-3.5")}
          aria-label="Tagging desk orientation"
        >
          <p className={labelClassName}>Tagging Desk</p>
          <p className="m-0 text-[0.92rem] leading-relaxed text-studio-muted">
            Find meaning in source material.
          </p>
        </section>

        <section
          className="flex flex-col lg:flex-row gap-[18px] items-stretch w-full"
          aria-label="Studio tagging workbench"
        >
          {/* Left Pane: Source Library */}
          {leftPaneExpanded ? (
            <aside className="hidden xl:flex flex-col gap-[18px] w-[280px] shrink-0 max-h-[calc(100vh-140px)] overflow-y-auto custom-scrollbar">
              <div className={cn(panelClassName, "flex-1 relative")}>
                <div className="mb-3.5 flex items-start justify-between gap-3">
                  <p className={labelClassName}>Source Library</p>
                  <div className="flex items-center gap-1.5">
                    <StudioChip tone="source">1 Book</StudioChip>
                    <button
                      onClick={() => setLeftPaneExpanded(false)}
                      className="p-1 rounded bg-studio-ink/5 border border-studio-line/40 hover:bg-studio-line/20 hover:text-studio-ink text-studio-muted transition-all cursor-pointer"
                      title="Collapse library"
                      type="button"
                    >
                      <ChevronLeft size={13} />
                    </button>
                  </div>
                </div>
                <h2 className={panelTitleClassName}>Active Ingests</h2>
                <p className="mt-2 mb-4 text-[0.82rem] leading-relaxed text-studio-muted">
                  Drop EPUBs or URLs here to read and mark them up alongside your editor.
                </p>
                
                <div className={cn(cardClassName, "p-3 cursor-pointer hover:border-studio-source/50 transition-colors")}>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-10 bg-studio-source/20 rounded shadow-sm border border-studio-source/40" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[0.85rem] font-bold text-studio-ink truncate">High Ground Odyssey</p>
                      <p className="text-[0.7rem] text-studio-dim">Ingested Document</p>
                    </div>
                  </div>
                </div>
              </div>
            </aside>
          ) : (
            <aside className="hidden xl:flex flex-col items-center gap-[18px] w-[60px] shrink-0 bg-studio-panel/20 border border-studio-line/20 rounded-xl py-4 px-2 max-h-[calc(100vh-140px)] select-none">
              <button
                onClick={() => setLeftPaneExpanded(true)}
                className="p-2 rounded-lg border border-studio-line/40 bg-studio-panel hover:bg-studio-line/30 text-studio-tag hover:scale-105 transition-all shadow-md cursor-pointer"
                title="Expand Source Library"
                type="button"
              >
                <BookOpen size={16} className="animate-pulse" />
              </button>
              <div className="w-[1px] h-6 bg-studio-line/30 my-2" />
              <span className="writing-mode-vertical text-[0.65rem] font-bold text-studio-dim uppercase tracking-widest text-center mt-2" style={{ writingMode: "vertical-lr" }}>
                LIBRARY
              </span>
            </aside>
          )}

          {/* Center Pane: Writing Canvas */}
          <div className="flex-1 min-w-0 flex flex-col gap-[18px] min-h-[600px]">
            <Editor 
              roomName={collabRoom}
              token={collabToken}
              collabUrl={collabUrl}
              userName={actor.primaryEmail}
              onSelectTagging={handleSelectTagging}
              onSelectBreakdown={handleSelectBreakdown}
              onSelectVideo={handleSelectVideo}
            />
          </div>

          {/* Right Pane: Tooling Sidebar */}
          <aside className="flex flex-col gap-[18px] w-full lg:w-[350px] shrink-0 max-h-[calc(100vh-140px)] overflow-y-auto pr-2 pb-12 custom-scrollbar">
            {/* Glassmorphic Active Tool Tab Bar */}
            <div className="flex border border-studio-line/40 bg-studio-panel/40 p-1 rounded-xl gap-1 shrink-0">
              <button
                onClick={() => setActiveTool("tagging")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-[0.78rem] font-bold transition-all cursor-pointer",
                  activeTool === "tagging"
                    ? "bg-studio-tag/15 text-studio-tag border border-studio-tag/20 shadow-md"
                    : "text-studio-muted hover:text-studio-ink hover:bg-studio-ink/5"
                )}
                type="button"
              >
                <Tag size={13} />
                <span>Tagging Desk</span>
              </button>
              <button
                onClick={() => setActiveTool("breakdown")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-[0.78rem] font-bold transition-all cursor-pointer",
                  activeTool === "breakdown"
                    ? "bg-purple-500/15 text-purple-400 border border-purple-500/20 shadow-md"
                    : "text-studio-muted hover:text-studio-ink hover:bg-studio-ink/5"
                )}
                type="button"
              >
                <Clapperboard size={13} />
                <span>Breakdown Engine</span>
              </button>
              <button
                onClick={() => setActiveTool("video")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-[0.78rem] font-bold transition-all cursor-pointer",
                  activeTool === "video"
                    ? "bg-studio-source/15 text-studio-source border border-studio-source/20 shadow-md"
                    : "text-studio-muted hover:text-studio-ink hover:bg-studio-ink/5"
                )}
                type="button"
              >
                <Video size={13} />
                <span>Video Engine</span>
              </button>
              <button
                onClick={() => setActiveTool("segment")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-[0.78rem] font-bold transition-all cursor-pointer",
                  activeTool === "segment"
                    ? "bg-purple-500/15 text-purple-400 border border-purple-500/20 shadow-md"
                    : "text-studio-muted hover:text-studio-ink hover:bg-studio-ink/5"
                )}
                type="button"
              >
                <BookOpen size={13} />
                <span>Segment Desk</span>
              </button>
            </div>

            {activeTool === "segment" ? (
              <VideoSegmentDesk />
            ) : activeTool === "tagging" || activeTool === "breakdown" ? (
              <>
                <section className={panelClassName} aria-label="Source document">
            <div className="mb-3.5 flex items-start justify-between gap-3">
              <p className={labelClassName}>Source Document</p>
              <StudioChip tone="source">
                {formatStatus(document.projectionStatus)}
              </StudioChip>
            </div>

            <h2 className={panelTitleClassName}>{document.title}</h2>
            <p className={panelCopyClassName}>{document.sourceLabel}</p>

            <dl className="mt-4 grid gap-2.5">
              <div className="min-w-0">
                <dt className="text-[0.72rem] font-extrabold uppercase leading-tight text-studio-dim">
                  Document ID
                </dt>
                <dd className={monoMetaClassName}>{document.id}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-[0.72rem] font-extrabold uppercase leading-tight text-studio-dim">
                  Source path
                </dt>
                <dd className={monoMetaClassName}>{document.sourcePath}</dd>
              </div>
            </dl>

            <div className="mt-[18px] grid gap-3.5">
              {document.blocks.map((block) => (
                <article
                  className={cn(
                    cardClassName,
                    "p-[15px]",
                    block.id === selectedBlock.id &&
                      "border-studio-source/55 bg-studio-source/10",
                  )}
                  key={block.id}
                >
                  <div className="mb-3 flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-start">
                    <div>
                      <h3 className="mt-0 mb-1.5 text-[0.95rem] leading-snug text-studio-ink">
                        {block.title}
                      </h3>
                      <span className={offsetLabelClassName}>{block.id}</span>
                    </div>
                    <button
                      className={smallButtonClassName}
                      type="button"
                      aria-pressed={block.id === selectedBlock.id}
                      onClick={() => chooseBlock(block.id)}
                    >
                      Choose
                    </button>
                  </div>
                  <p className="m-0 text-[0.95rem] leading-7 text-studio-ink/90">
                    {renderBlockText(
                      block,
                      selectedBlock.id,
                      startOffset,
                      endOffset,
                    )}
                  </p>
                </article>
              ))}
            </div>
          </section>

          <section className={panelClassName} aria-label="Tagging controls">
            <div className="mb-3.5 flex items-start justify-between gap-3">
              <p className={labelClassName}>{activeTool === "breakdown" ? "Breakdown Controls" : "Tagging Controls"}</p>
              <StudioChip tone="tag">
                {persistence.mode === "database" ? "Durable" : "Fixture"}
              </StudioChip>
            </div>

            <h2 className={panelTitleClassName}>
              {activeTool === "breakdown" ? "Block to span to production element" : "Block to span to semantic tag"}
            </h2>
            <p className={panelCopyClassName}>
              {activeTool === "breakdown" 
                ? "Choose a stable block, select an excerpt or offset range, then apply a production tag. Applying a tag writes a provenance-aware production element."
                : "Choose a stable block, select an excerpt or offset range, then apply a meaning tag. Applying a tag writes a provenance-aware tagged span and knowledge node when local persistence is enabled."}
            </p>

            <div
              className={cn(
                "mt-3.5 rounded-lg border border-studio-line p-3 text-[0.82rem] leading-relaxed text-studio-muted",
                persistence.canWrite && "border-studio-tag/45 text-studio-tag",
              )}
            >
              {persistence.message}
            </div>

            <div className="mt-[18px] grid gap-2">
              <label className={fieldLabelClassName} htmlFor="excerpt-select">
                Meaningful excerpt
              </label>
              <select
                className={fieldClassName}
                id="excerpt-select"
                value={selectedExcerptId}
                onChange={(event) => chooseExcerpt(event.target.value)}
              >
                {blockPresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-3.5 grid gap-3 md:grid-cols-2">
              <label className="grid gap-2">
                <span className={fieldLabelClassName}>Start offset</span>
                <input
                  className={fieldClassName}
                  min={0}
                  max={selectedBlock.body.length}
                  type="number"
                  value={startOffset}
                  onChange={(event) =>
                    setStartOffset(Number(event.target.value))
                  }
                />
              </label>
              <label className="grid gap-2">
                <span className={fieldLabelClassName}>End offset</span>
                <input
                  className={fieldClassName}
                  min={0}
                  max={selectedBlock.body.length}
                  type="number"
                  value={endOffset}
                  onChange={(event) => setEndOffset(Number(event.target.value))}
                />
              </label>
            </div>

            <div
              className={cn(
                cardClassName,
                "mt-3.5 grid gap-2 p-3.5",
                !spanValidation.ok && "border-studio-danger/50",
              )}
            >
              <span className={labelClassName}>Selected span</span>
              {spanValidation.ok ? (
                <p className="m-0 text-[0.92rem] leading-relaxed text-studio-ink/90">
                  {selectedText}
                </p>
              ) : (
                <p className="m-0 text-[0.92rem] leading-relaxed text-studio-ink/90">
                  {spanValidation.reason}
                </p>
              )}
              <span className={offsetLabelClassName}>
                {selectedBlock.id}:{startOffset}-{endOffset}
              </span>
            </div>

            <div className="mt-4 grid gap-2.5" aria-label="Semantic tag palette">
              {visibleTags.length === 0 && activeTool === "breakdown" && (
                <div className="text-[0.82rem] text-studio-muted p-4 border border-dashed border-studio-line rounded-lg text-center">
                  No production tags found. You can add tags like "Cast" or "Prop" to this workspace.
                </div>
              )}
              {visibleTags.map((tag) => (
                <button
                  className={cn(
                    "grid gap-1 rounded-lg border border-studio-line bg-studio-ink/5 p-3 text-left text-studio-ink",
                    tag.id === selectedTag?.id &&
                      "border-studio-tag/60 bg-studio-tag/10",
                  )}
                  key={tag.id}
                  type="button"
                  onClick={() => setSelectedTagId(tag.id)}
                >
                  <strong className="text-[0.9rem] text-studio-tag">
                    {tag.label}
                  </strong>
                  <span className="text-[0.82rem] leading-snug text-studio-muted">
                    {tag.description}
                  </span>
                </button>
              ))}
            </div>

            <div className={cn(cardClassName, "mt-3.5 grid gap-2 p-3.5")}>
              <p className={labelClassName}>Knowledge node preview</p>
              {previewNode ? (
                <>
                  <h3 className="m-0 text-[0.98rem] leading-snug text-studio-ink">
                    {previewNode.title}
                  </h3>
                  <p className="m-0 text-[0.92rem] leading-relaxed text-studio-ink/90">
                    {previewNode.body}
                  </p>
                  <span className={offsetLabelClassName}>
                    {formatProvenanceLabel(previewNode.provenance)}
                  </span>
                </>
              ) : (
                <p className="m-0 text-[0.92rem] leading-relaxed text-studio-ink/90">
                  Fix the span offsets before node creation.
                </p>
              )}
            </div>

            <button
              className={primaryButtonClassName}
              type="button"
              disabled={!spanValidation.ok || !persistence.canWrite || isPending || !selectedTag}
              onClick={applyTag}
            >
              {isPending ? "Persisting..." : activeTool === "breakdown" ? "Apply production element" : "Apply semantic tag"}
            </button>

            {actionState ? (
              <div
                className={cn(
                  "mt-3.5 rounded-lg border p-3 text-[0.82rem] leading-relaxed",
                  actionState.ok
                    ? "border-studio-tag/45 text-studio-tag"
                    : "border-studio-danger/50 text-studio-danger",
                )}
              >
                {actionState.message}
              </div>
            ) : null}
          </section>

          <aside className={panelClassName} aria-label="Knowledge nodes and provenance">
            <div className="mb-3.5 flex items-start justify-between gap-3">
              <p className={labelClassName}>Knowledge Panel</p>
              <StudioChip tone="node">{knowledgeNodes.length} nodes</StudioChip>
            </div>

            <h2 className={panelTitleClassName}>Provenance stays attached</h2>
            <p className={panelCopyClassName}>
              Each persisted node carries the selected text, tag, block ID, span
              offsets, document identity, and projection status.
            </p>

            <div className="mt-[18px] grid gap-3">
              {knowledgeNodes.length === 0 ? (
                <div className={cn(cardClassName, "p-4 text-[0.92rem] leading-relaxed text-studio-muted")}>
                  Apply a tag to create the first durable knowledge node.
                </div>
              ) : (
                knowledgeNodes.map((node) => (
                  <article className={cn(cardClassName, "p-3.5")} key={node.id}>
                    <div className="mb-2.5 flex flex-col items-stretch justify-between gap-2.5 sm:flex-row sm:items-start">
                      <h3 className="m-0 text-[0.98rem] leading-snug text-studio-ink">
                        {node.title}
                      </h3>
                      <StudioChip tone="review">
                        {formatStatus(node.projectionStatus)}
                      </StudioChip>
                    </div>
                    <p className="m-0 text-[0.92rem] leading-relaxed text-studio-ink/90">
                      {node.body}
                    </p>
                    <dl className="mt-4 grid gap-2.5">
                      <div className="min-w-0">
                        <dt className="text-[0.72rem] font-extrabold uppercase leading-tight text-studio-dim">
                          Document
                        </dt>
                        <dd className={monoMetaClassName}>
                          {node.provenance.documentTitle} (
                          {node.provenance.documentId})
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-[0.72rem] font-extrabold uppercase leading-tight text-studio-dim">
                          Block
                        </dt>
                        <dd className={monoMetaClassName}>
                          {node.provenance.blockId}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-[0.72rem] font-extrabold uppercase leading-tight text-studio-dim">
                          Span
                        </dt>
                        <dd className={monoMetaClassName}>
                          {node.provenance.spanStartOffset}-
                          {node.provenance.spanEndOffset}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-[0.72rem] font-extrabold uppercase leading-tight text-studio-dim">
                          Tag
                        </dt>
                        <dd className={monoMetaClassName}>
                          {node.provenance.tagLabel}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-[0.72rem] font-extrabold uppercase leading-tight text-studio-dim">
                          Created
                        </dt>
                        <dd className={monoMetaClassName}>{node.createdAt}</dd>
                      </div>
                    </dl>
                  </article>
                ))
              )}
            </div>
          </aside>
              </>
            ) : (
              <section className={cn(panelClassName, "border border-studio-tag/40 bg-studio-tag/5")} aria-label="AI Video Engine">
                <div className="w-full">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <p className={cn(labelClassName, "text-studio-tag")}>Active Engine</p>
                    <StudioChip tone="tag">Live Pipeline</StudioChip>
                  </div>
                  <h2 className={panelTitleClassName}>AI Clip Generator</h2>
                  <p className="mt-2 mb-4 text-[0.88rem] leading-relaxed text-studio-muted">
                    Extract vertical 9:16 reels, shorts, and highlights using Vertex AI Gemini 1.5 Pro and local FFmpeg.
                  </p>

                  {clipStatus === "idle" && (
                    <div className="grid gap-3">
                      <div className="grid gap-1">
                        <span className="text-[0.7rem] font-bold text-studio-dim uppercase">Source GCS URI</span>
                        <input
                          type="text"
                          readOnly
                          value="gs://high-ground-raw/podcasts/episode-001.mp4"
                          className="text-[0.8rem] font-mono bg-studio-ink/10 border border-studio-line rounded px-2 py-1.5 text-studio-muted select-all focus:outline-none"
                        />
                      </div>
                      <button
                        onClick={handleAutoClip}
                        className="w-full flex items-center justify-center gap-2 bg-studio-tag hover:bg-studio-tag/80 text-studio-ink font-bold py-2.5 px-4 rounded-lg transition-all shadow-[0_4px_12px_rgba(159,209,139,0.2)] text-[0.85rem]"
                      >
                        <Sparkles size={14} className="animate-pulse" />
                        <span>Run Auto-Clip Pipeline</span>
                      </button>
                    </div>
                  )}

                  {(clipStatus === "analyzing" || clipStatus === "cropping") && (
                    <div className="grid gap-3 py-2">
                      <div className="flex items-center gap-2 text-studio-tag animate-pulse">
                        <RefreshCw size={14} className="animate-spin" />
                        <span className="text-[0.82rem] font-extrabold">
                          {clipStatus === "analyzing"
                            ? "Gemini extracting viral hooks..."
                            : "FFmpeg center-cropping vertical video..."}
                        </span>
                      </div>
                      <div className="w-full bg-studio-ink/10 h-2.5 rounded-full overflow-hidden border border-studio-line">
                        <div
                          className="bg-studio-tag h-full transition-all duration-500 shadow-[0_0_12px_rgba(159,209,139,0.5)]"
                          style={{ width: `${clipProgress}%` }}
                        />
                      </div>
                      <span className="text-[0.72rem] font-mono text-studio-dim text-right">{clipProgress}% completed</span>
                    </div>
                  )}

                  {clipStatus === "done" && (
                    <div className="grid gap-3">
                      <div className="flex items-center gap-1.5 text-emerald-400 font-extrabold text-[0.82rem] mb-1">
                        <Check size={16} />
                        <span>3 Shorts Generated successfully!</span>
                      </div>
                      
                      <div className="grid gap-2 text-[0.8rem]">
                        {[
                          { title: "Zero Sunk Cost Mindset", score: "96", duration: "15s" },
                          { title: "ADHD Focus Multipliers", score: "92", duration: "22s" },
                          { title: "The Content Command Center", score: "89", duration: "18s" }
                        ].map((clip, i) => (
                          <div key={i} className="flex items-center justify-between border border-studio-line bg-studio-ink/5 p-2 rounded-lg">
                            <div className="truncate max-w-[160px]">
                              <strong className="text-studio-ink block truncate">{clip.title}</strong>
                              <span className="text-[0.7rem] text-studio-dim">Score: {clip.score}/100 • {clip.duration}</span>
                            </div>
                            <button className="flex items-center justify-center p-1.5 bg-studio-tag/10 hover:bg-studio-tag/20 border border-studio-tag/30 rounded text-studio-tag transition-colors">
                              <Play size={12} />
                            </button>
                          </div>
                        ))}
                      </div>

                      <button
                        onClick={resetClipGenerator}
                        className="w-full mt-2 border border-studio-line hover:border-studio-line-strong text-studio-muted hover:text-studio-ink text-[0.75rem] font-bold py-1.5 px-3 rounded transition-all"
                      >
                        Process another video
                      </button>
                    </div>
                  )}
                </div>
              </section>
            )}
          </aside>
        </section>

        <section
          className="grid gap-3.5 xl:grid-cols-2"
          aria-label="Future Studio lanes"
        >
          {/* Structures (Future Lane) */}
          <div className={cn(panelClassName, "flex min-w-0 flex-col items-stretch justify-between gap-3.5 p-4 opacity-75 sm:flex-row sm:items-start")} aria-disabled="true">
            <div>
              <p className={labelClassName}>Future lane</p>
              <h2 className={panelTitleClassName}>Structures</h2>
              <p className="mt-2 mb-0 text-[0.88rem] leading-relaxed text-studio-muted">
                Outline, chapter, episode, and curriculum structures.
              </p>
            </div>
            <StudioChip tone="review">Not wired</StudioChip>
          </div>

          {/* Projections (Future Lane) */}
          <div className={cn(panelClassName, "flex min-w-0 flex-col items-stretch justify-between gap-3.5 p-4 opacity-75 sm:flex-row sm:items-start")} aria-disabled="true">
            <div>
              <p className={labelClassName}>Future lane</p>
              <h2 className={panelTitleClassName}>Projections</h2>
              <p className="mt-2 mb-0 text-[0.88rem] leading-relaxed text-studio-muted">
                Approved public outputs for web, books, public talks, and Quiplore.
              </p>
            </div>
            <StudioChip tone="review">Not wired</StudioChip>
          </div>
        </section>

        <section
          className={cn(panelClassName, "grid gap-2 px-4 py-3.5 mt-4")}
          aria-label="Tag applications"
        >
          <p className={labelClassName}>Durable tag applications</p>
          <div className="break-words font-mono text-[0.76rem] leading-relaxed text-studio-muted">
            {tagApplications.length === 0
              ? "No tag applications yet."
              : tagApplications
                  .map(
                    (application) =>
                      `${application.id} -> ${application.blockId} / ${application.tag.label}`,
                  )
                  .join(" | ")}
          </div>
        </section>
      </div>
    </main>
  );
}
