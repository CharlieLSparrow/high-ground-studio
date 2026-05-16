"use client";

import { useMemo, useState } from "react";
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

const DOCUMENT_ID = "studio-doc-learning-to-lead-seed";
const FIXTURE_CREATED_AT = "2026-05-16T00:00:00.000Z";

const sourceBlocks: StudioBlock[] = [
  {
    id: "l2l-seed-001",
    documentId: DOCUMENT_ID,
    order: 1,
    title: "Leadership starts in the named moment",
    body: "Leadership starts to become visible when a young person can name what is happening, decide what is theirs to carry, and practice the next responsible action.",
    sourceLabel: "Studio seed fixture",
    sourcePath:
      "apps/web/content/books/learning-to-lead/manuscript/learning-to-lead.living.mdx",
    externalId: "seed:l2l:001",
    projectionStatus: "private",
  },
  {
    id: "l2l-seed-002",
    documentId: DOCUMENT_ID,
    order: 2,
    title: "Stories become structure when the source trail stays attached",
    body: "A story candidate should keep the original wording close enough that later editors can see the source, test the meaning, and decide whether it belongs in a chapter, episode, or exercise.",
    sourceLabel: "Studio seed fixture",
    sourcePath:
      "apps/web/content/books/learning-to-lead/manuscript/learning-to-lead.living.mdx",
    externalId: "seed:l2l:002",
    projectionStatus: "private",
  },
  {
    id: "l2l-seed-003",
    documentId: DOCUMENT_ID,
    order: 3,
    title: "Projection is an approval path, not a shortcut",
    body: "A public projection should only happen after the private span, tag, node, and review state are clear enough that no rough note accidentally becomes public truth.",
    sourceLabel: "Studio seed fixture",
    sourcePath:
      "apps/web/content/books/learning-to-lead/manuscript/learning-to-lead.living.mdx",
    externalId: "seed:l2l:003",
    projectionStatus: "private",
  },
];

const sampleDocument: StudioDocument = {
  id: DOCUMENT_ID,
  title: "Learning to Lead - Studio tagging seed",
  sourceLabel: "Non-canonical fixture based on the Learning to Lead workflow",
  sourcePath:
    "apps/web/content/books/learning-to-lead/manuscript/learning-to-lead.living.mdx",
  workspaceId: "high-ground-private",
  projectId: "learning-to-lead",
  projectionStatus: "private",
  blocks: sourceBlocks,
  createdAt: FIXTURE_CREATED_AT,
  updatedAt: FIXTURE_CREATED_AT,
};

const tagPalette: StudioTag[] = [
  {
    id: "leadership-principle",
    label: "leadership-principle",
    description: "Reusable leadership idea that can become teaching structure.",
    category: "meaning",
    nodeType: "principle",
  },
  {
    id: "story-candidate",
    label: "story-candidate",
    description: "Narrative material that may become a chapter or episode story.",
    category: "structure",
    nodeType: "story",
  },
  {
    id: "requires-review",
    label: "requires-review",
    description: "Span needs human judgment before projection or citation.",
    category: "review",
    nodeType: "question",
  },
  {
    id: "projection-candidate",
    label: "projection-candidate",
    description: "Material that may later feed a public projection.",
    category: "projection",
    nodeType: "projection_candidate",
  },
];

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

function findBlock(blockId: string) {
  return sourceBlocks.find((block) => block.id === blockId) ?? sourceBlocks[0];
}

function getPresetOffsets(preset: ExcerptPreset) {
  const block = findBlock(preset.blockId);
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

export function StudioWorkbenchClient() {
  const initialPreset = excerptPresets[0];
  const initialOffsets = getPresetOffsets(initialPreset);
  const [selectedBlockId, setSelectedBlockId] = useState(initialPreset.blockId);
  const [selectedExcerptId, setSelectedExcerptId] = useState(initialPreset.id);
  const [startOffset, setStartOffset] = useState(initialOffsets.startOffset);
  const [endOffset, setEndOffset] = useState(initialOffsets.endOffset);
  const [selectedTagId, setSelectedTagId] = useState(tagPalette[0].id);
  const [tagApplications, setTagApplications] = useState<
    StudioTagApplication[]
  >([]);
  const [knowledgeNodes, setKnowledgeNodes] = useState<KnowledgeNode[]>([]);

  const selectedBlock = findBlock(selectedBlockId);
  const selectedTag =
    tagPalette.find((tag) => tag.id === selectedTagId) ?? tagPalette[0];
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
    if (!spanValidation.ok) {
      return null;
    }

    const span = createSpanSnapshot({
      id: "span-preview",
      documentId: sampleDocument.id,
      block: selectedBlock,
      startOffset,
      endOffset,
    });

    return createTagApplication({
      id: "tag-app-preview",
      document: sampleDocument,
      block: selectedBlock,
      span,
      tag: selectedTag,
      createdAt: "local-preview",
      createdByLabel: "local prototype",
      projectionStatus: "private",
    });
  }, [endOffset, selectedBlock, selectedTag, spanValidation.ok, startOffset]);

  const previewNode = previewApplication
    ? createKnowledgeNodeFromTaggedSpan({
        id: "node-preview",
        application: previewApplication,
      })
    : null;

  function chooseBlock(blockId: string) {
    const preset = getDefaultPresetForBlock(blockId);
    const offsets = getPresetOffsets(preset);

    setSelectedBlockId(blockId);
    setSelectedExcerptId(preset.id);
    setStartOffset(offsets.startOffset);
    setEndOffset(offsets.endOffset);
  }

  function chooseExcerpt(presetId: string) {
    const preset =
      excerptPresets.find((excerpt) => excerpt.id === presetId) ??
      getDefaultPresetForBlock(selectedBlock.id);
    const offsets = getPresetOffsets(preset);

    setSelectedBlockId(preset.blockId);
    setSelectedExcerptId(preset.id);
    setStartOffset(offsets.startOffset);
    setEndOffset(offsets.endOffset);
  }

  function applyTag() {
    if (!spanValidation.ok) {
      return;
    }

    const createdAt = new Date().toISOString();
    const sequence = tagApplications.length + 1;
    const span = createSpanSnapshot({
      id: `span-local-${sequence}`,
      documentId: sampleDocument.id,
      block: selectedBlock,
      startOffset,
      endOffset,
    });
    const application = createTagApplication({
      id: `tag-app-local-${sequence}`,
      document: sampleDocument,
      block: selectedBlock,
      span,
      tag: selectedTag,
      createdAt,
      createdByLabel: "local prototype",
      projectionStatus: "private",
    });
    const node = createKnowledgeNodeFromTaggedSpan({
      id: `knowledge-node-local-${sequence}`,
      application,
      createdAt,
      projectionStatus: "projection_not_approved",
    });

    setTagApplications((current) => [application, ...current]);
    setKnowledgeNodes((current) => [node, ...current]);
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
              Draft
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
                {sampleDocument.projectionStatus}
              </span>
            </div>

            <h2>{sampleDocument.title}</h2>
            <p className="studio-panel-copy">{sampleDocument.sourceLabel}</p>

            <dl className="studio-meta-grid">
              <div>
                <dt>Document ID</dt>
                <dd>{sampleDocument.id}</dd>
              </div>
              <div>
                <dt>Source path</dt>
                <dd>{sampleDocument.sourcePath}</dd>
              </div>
            </dl>

            <div className="studio-block-list">
              {sampleDocument.blocks.map((block) => (
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
                Client-only
              </span>
            </div>

            <h2>Block to span to semantic tag</h2>
            <p className="studio-panel-copy">
              Choose a stable block, select an excerpt or offset range, then
              apply a meaning tag. Applying a tag creates a provenance-aware
              knowledge node in local state.
            </p>

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
              {tagPalette.map((tag) => (
                <button
                  className="studio-tag-button"
                  data-active={tag.id === selectedTag.id}
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
              disabled={!spanValidation.ok}
              onClick={applyTag}
            >
              Apply semantic tag
            </button>
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
              Each created node carries the selected text, tag, block ID, span
              offsets, document identity, and projection status.
            </p>

            <div className="studio-node-list">
              {knowledgeNodes.length === 0 ? (
                <div className="studio-empty-state">
                  Apply a tag to create the first local knowledge node.
                </div>
              ) : (
                knowledgeNodes.map((node) => (
                  <article className="studio-node-card" key={node.id}>
                    <div className="studio-node-card-header">
                      <h3>{node.title}</h3>
                      <span className="studio-chip" data-tone="review">
                        {node.projectionStatus.replaceAll("_", " ")}
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
          <p className="studio-label">Local tag applications</p>
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
