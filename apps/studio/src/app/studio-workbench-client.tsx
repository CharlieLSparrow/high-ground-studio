"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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

  const selectedBlock = findBlock(document.blocks, selectedBlockId);
  const selectedTag = tags.find((tag) => tag.id === selectedTagId) ?? tags[0];
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
                High Ground Studio
              </h1>
              <p className="mt-1.5 mb-0 max-w-[760px] text-[0.94rem] leading-relaxed text-studio-muted">
                Private semantic workbench for source blocks, spans, tags,
                knowledge nodes, and provenance.
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
          className="grid gap-[18px] xl:grid-cols-[minmax(310px,0.95fr)_minmax(330px,0.95fr)_minmax(310px,0.82fr)]"
          aria-label="Studio tagging workbench"
        >
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
              <p className={labelClassName}>Tagging Controls</p>
              <StudioChip tone="tag">
                {persistence.mode === "database" ? "Durable" : "Fixture"}
              </StudioChip>
            </div>

            <h2 className={panelTitleClassName}>
              Block to span to semantic tag
            </h2>
            <p className={panelCopyClassName}>
              Choose a stable block, select an excerpt or offset range, then
              apply a meaning tag. Applying a tag writes a provenance-aware
              tagged span and knowledge node when local persistence is enabled.
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
              {tags.map((tag) => (
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
              disabled={!spanValidation.ok || !persistence.canWrite || isPending}
              onClick={applyTag}
            >
              {isPending ? "Persisting..." : "Apply semantic tag"}
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
        </section>

        <section
          className="grid gap-3.5 xl:grid-cols-3"
          aria-label="Future Studio lanes"
        >
          {[
            {
              title: "Structures",
              detail: "Outline, chapter, episode, and curriculum structures.",
            },
            {
              title: "Projections",
              detail:
                "Approved public outputs for web, books, public talks, and Quiplore.",
            },
            {
              title: "Agents",
              detail: "Future source-aware agent runs with status and review.",
            },
          ].map((lane) => (
            <div
              className={cn(
                panelClassName,
                "flex min-w-0 flex-col items-stretch justify-between gap-3.5 p-4 opacity-75 sm:flex-row sm:items-start",
              )}
              aria-disabled="true"
              key={lane.title}
            >
              <div>
                <p className={labelClassName}>Future lane</p>
                <h2 className={panelTitleClassName}>{lane.title}</h2>
                <p className="mt-2 mb-0 text-[0.88rem] leading-relaxed text-studio-muted">
                  {lane.detail}
                </p>
              </div>
              <StudioChip tone="review">Not wired</StudioChip>
            </div>
          ))}
        </section>

        <section
          className={cn(panelClassName, "grid gap-2 px-4 py-3.5")}
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
