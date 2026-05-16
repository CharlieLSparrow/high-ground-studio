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
      <mark className="studio-selected-span">
        {block.body.slice(startOffset, endOffset)}
      </mark>
      {block.body.slice(endOffset)}
    </>
  );
}

function formatStatus(value: string) {
  return value.replaceAll("_", " ");
}

export function StudioWorkbenchClient({
  document,
  tags,
  tagApplications,
  knowledgeNodes,
  persistence,
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
      createdByLabel: "local development seed",
      projectionStatus: "private",
    });
  }, [document, endOffset, selectedBlock, selectedTag, spanValidation.ok, startOffset]);

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
    <main className="studio-shell">
      <div className="studio-frame">
        <header className="studio-topbar" aria-label="Studio status">
          <div className="studio-mark">
            <div className="studio-glyph" aria-hidden="true">
              S
            </div>
            <div>
              <h1 className="studio-title">High Ground Studio</h1>
              <p className="studio-subtitle">
                Private semantic workbench for source blocks, spans, tags,
                knowledge nodes, and provenance.
              </p>
            </div>
          </div>

          <div className="studio-status">
            <span className="studio-chip" data-tone="source">
              Private
            </span>
            <span className="studio-chip" data-tone="tag">
              Database seeded
            </span>
            <span className="studio-chip" data-tone="node">
              Not public
            </span>
            <span className="studio-chip" data-tone="review">
              Projection not approved
            </span>
          </div>
        </header>

        <section className="studio-workbench" aria-label="Studio tagging workbench">
          <section className="studio-panel" aria-label="Source document">
            <div className="studio-panel-heading">
              <p className="studio-label">Source Document</p>
              <span className="studio-chip" data-tone="source">
                {formatStatus(document.projectionStatus)}
              </span>
            </div>

            <h2>{document.title}</h2>
            <p className="studio-panel-copy">{document.sourceLabel}</p>

            <dl className="studio-meta-grid">
              <div>
                <dt>Document ID</dt>
                <dd>{document.id}</dd>
              </div>
              <div>
                <dt>Source path</dt>
                <dd>{document.sourcePath}</dd>
              </div>
            </dl>

            <div className="studio-block-list">
              {document.blocks.map((block) => (
                <article
                  className="studio-block"
                  data-active={block.id === selectedBlock.id}
                  key={block.id}
                >
                  <div className="studio-block-header">
                    <div>
                      <h3 className="studio-block-title">{block.title}</h3>
                      <span className="studio-block-id">{block.id}</span>
                    </div>
                    <button
                      className="studio-small-button"
                      type="button"
                      aria-pressed={block.id === selectedBlock.id}
                      onClick={() => chooseBlock(block.id)}
                    >
                      Choose
                    </button>
                  </div>
                  <p className="studio-block-body">
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

          <section className="studio-panel" aria-label="Tagging controls">
            <div className="studio-panel-heading">
              <p className="studio-label">Tagging Controls</p>
              <span className="studio-chip" data-tone="tag">
                {persistence.mode === "database" ? "Durable" : "Fixture"}
              </span>
            </div>

            <h2>Block to span to semantic tag</h2>
            <p className="studio-panel-copy">
              Choose a stable block, select an excerpt or offset range, then
              apply a meaning tag. Applying a tag writes a provenance-aware
              tagged span and knowledge node when local persistence is enabled.
            </p>

            <div className="studio-persistence-note" data-active={persistence.canWrite}>
              {persistence.message}
            </div>

            <div className="studio-control-group">
              <label htmlFor="excerpt-select">Meaningful excerpt</label>
              <select
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

            <div className="studio-offset-grid">
              <label>
                <span>Start offset</span>
                <input
                  min={0}
                  max={selectedBlock.body.length}
                  type="number"
                  value={startOffset}
                  onChange={(event) =>
                    setStartOffset(Number(event.target.value))
                  }
                />
              </label>
              <label>
                <span>End offset</span>
                <input
                  min={0}
                  max={selectedBlock.body.length}
                  type="number"
                  value={endOffset}
                  onChange={(event) => setEndOffset(Number(event.target.value))}
                />
              </label>
            </div>

            <div className="studio-preview-box" data-valid={spanValidation.ok}>
              <span className="studio-preview-kicker">Selected span</span>
              {spanValidation.ok ? (
                <p>{selectedText}</p>
              ) : (
                <p>{spanValidation.reason}</p>
              )}
              <span className="studio-offset-label">
                {selectedBlock.id}:{startOffset}-{endOffset}
              </span>
            </div>

            <div className="studio-tag-palette" aria-label="Semantic tag palette">
              {tags.map((tag) => (
                <button
                  className="studio-tag-button"
                  data-active={tag.id === selectedTag?.id}
                  key={tag.id}
                  type="button"
                  onClick={() => setSelectedTagId(tag.id)}
                >
                  <strong>{tag.label}</strong>
                  <span>{tag.description}</span>
                </button>
              ))}
            </div>

            <div className="studio-node-preview">
              <p className="studio-label">Knowledge node preview</p>
              {previewNode ? (
                <>
                  <h3>{previewNode.title}</h3>
                  <p>{previewNode.body}</p>
                  <span className="studio-offset-label">
                    {formatProvenanceLabel(previewNode.provenance)}
                  </span>
                </>
              ) : (
                <p>Fix the span offsets before node creation.</p>
              )}
            </div>

            <button
              className="studio-primary-button"
              type="button"
              disabled={!spanValidation.ok || !persistence.canWrite || isPending}
              onClick={applyTag}
            >
              {isPending ? "Persisting..." : "Apply semantic tag"}
            </button>

            {actionState ? (
              <div className="studio-action-message" data-ok={actionState.ok}>
                {actionState.message}
              </div>
            ) : null}
          </section>

          <aside className="studio-panel" aria-label="Knowledge nodes and provenance">
            <div className="studio-panel-heading">
              <p className="studio-label">Knowledge Panel</p>
              <span className="studio-chip" data-tone="node">
                {knowledgeNodes.length} nodes
              </span>
            </div>

            <h2>Provenance stays attached</h2>
            <p className="studio-panel-copy">
              Each persisted node carries the selected text, tag, block ID, span
              offsets, document identity, and projection status.
            </p>

            <div className="studio-node-list">
              {knowledgeNodes.length === 0 ? (
                <div className="studio-empty-state">
                  Apply a tag to create the first durable knowledge node.
                </div>
              ) : (
                knowledgeNodes.map((node) => (
                  <article className="studio-node-card" key={node.id}>
                    <div className="studio-node-card-header">
                      <h3>{node.title}</h3>
                      <span className="studio-chip" data-tone="review">
                        {formatStatus(node.projectionStatus)}
                      </span>
                    </div>
                    <p>{node.body}</p>
                    <dl className="studio-provenance-list">
                      <div>
                        <dt>Document</dt>
                        <dd>
                          {node.provenance.documentTitle} (
                          {node.provenance.documentId})
                        </dd>
                      </div>
                      <div>
                        <dt>Block</dt>
                        <dd>{node.provenance.blockId}</dd>
                      </div>
                      <div>
                        <dt>Span</dt>
                        <dd>
                          {node.provenance.spanStartOffset}-
                          {node.provenance.spanEndOffset}
                        </dd>
                      </div>
                      <div>
                        <dt>Tag</dt>
                        <dd>{node.provenance.tagLabel}</dd>
                      </div>
                      <div>
                        <dt>Created</dt>
                        <dd>{node.createdAt}</dd>
                      </div>
                    </dl>
                  </article>
                ))
              )}
            </div>
          </aside>
        </section>

        <section className="studio-future-lanes" aria-label="Future Studio lanes">
          {[
            {
              title: "Structures",
              detail: "Outline, chapter, episode, and curriculum structures.",
            },
            {
              title: "Projections",
              detail: "Approved public outputs for web, books, and Quiplore.",
            },
            {
              title: "Agents",
              detail: "Future source-aware agent runs with status and review.",
            },
          ].map((lane) => (
            <div className="studio-future-lane" aria-disabled="true" key={lane.title}>
              <div>
                <p className="studio-label">Future lane</p>
                <h2>{lane.title}</h2>
                <p>{lane.detail}</p>
              </div>
              <span className="studio-chip" data-tone="review">
                Not wired
              </span>
            </div>
          ))}
        </section>

        <section className="studio-activity-strip" aria-label="Tag applications">
          <p className="studio-label">Durable tag applications</p>
          <div>
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
