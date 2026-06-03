import {
  createQuipslyDocument,
  type BoundaryKind,
  type InlineAnnotationKind,
  type QuipslyDocument,
} from "./document";
import { createTextAnchor } from "./anchors";
import { projectDocument } from "./projections";

export type StudioBlockProjectionInput = {
  id: string;
  text: string;
  tags?: string[];
  order?: number;
  type?: string;
};

export type StudioTaggedSpanProjectionInput = {
  id: string;
  blockId: string;
  tagSlug: string;
  label?: string;
  startOffset: number;
  endOffset: number;
  selectedText?: string;
};

export type StudioBoundaryTagMapping = {
  kind: BoundaryKind;
  title?: string;
};

export type CreateDocumentFromStudioProjectionInput = {
  documentId: string;
  title: string;
  blocks: StudioBlockProjectionInput[];
  spans?: StudioTaggedSpanProjectionInput[];
  boundaryTags?: Record<string, StudioBoundaryTagMapping>;
  now?: string;
};

export type StudioDocumentBlockOutput = {
  stableId: string;
  order: number;
  body: string;
  type: string;
};

export type StudioTaggedSpanOutput = {
  stableId: string;
  blockStableId: string;
  tagSlug: string;
  label: string;
  startOffset: number;
  endOffset: number;
  selectedText: string;
};

export type StudioProjectionOutput = {
  blocks: StudioDocumentBlockOutput[];
  taggedSpans: StudioTaggedSpanOutput[];
};

function sortedBlocks(blocks: StudioBlockProjectionInput[]) {
  return [...blocks].sort((left, right) => {
    const leftOrder = left.order ?? 0;
    const rightOrder = right.order ?? 0;
    return leftOrder - rightOrder || left.id.localeCompare(right.id);
  });
}

function createFallbackSpanId(blockId: string, tagSlug: string, index: number) {
  return `span-${blockId}-${tagSlug}-${index}`;
}

export function createDocumentFromStudioProjection(
  input: CreateDocumentFromStudioProjectionInput,
): QuipslyDocument {
  const blocks = sortedBlocks(input.blocks);
  const document = createQuipslyDocument({
    id: input.documentId,
    title: input.title,
    now: input.now,
    nodes: blocks.map((block) => ({
      id: block.id,
      type: block.type === "heading" ? "heading" : "paragraph",
      text: block.text,
      attrs: {
        studioOrder: block.order ?? 0,
      },
    })),
  });

  for (const block of blocks) {
    for (const tag of block.tags ?? []) {
      const boundaryMapping = input.boundaryTags?.[tag];
      if (boundaryMapping) {
        document.boundaries.push({
          id: `boundary-${block.id}-${tag}`,
          kind: boundaryMapping.kind,
          nodeId: block.id,
          title: boundaryMapping.title ?? tag,
        });
        continue;
      }

      if (block.text.length === 0) continue;

      document.annotations.push({
        id: createFallbackSpanId(block.id, tag, 0),
        kind: tag as InlineAnnotationKind,
        label: tag,
        anchors: [
          createTextAnchor({
            document,
            nodeId: block.id,
            startOffset: 0,
            endOffset: block.text.length,
          }),
        ],
        createdAt: input.now,
        updatedAt: input.now,
      });
    }
  }

  for (const span of input.spans ?? []) {
    const node = document.nodes.find((candidate) => candidate.id === span.blockId);
    if (!node || node.text.length === 0) continue;

    document.annotations.push({
      id: span.id,
      kind: span.tagSlug as InlineAnnotationKind,
      label: span.label ?? span.tagSlug,
      anchors: [
        createTextAnchor({
          document,
          nodeId: span.blockId,
          startOffset: span.startOffset,
          endOffset: span.endOffset,
        }),
      ],
      metadata: span.selectedText
        ? {
            importedSelectedText: span.selectedText,
          }
        : undefined,
      createdAt: input.now,
      updatedAt: input.now,
    });
  }

  return document;
}

export function projectDocumentToStudioProjection(
  document: QuipslyDocument,
): StudioProjectionOutput {
  const projection = projectDocument(document);

  return {
    blocks: projection.blocks.map((block) => ({
      stableId: block.stableId,
      order: block.order,
      body: block.body,
      type: block.type,
    })),
    taggedSpans: projection.taggedSpans.map((span) => ({
      stableId: span.id,
      blockStableId: span.blockStableId,
      tagSlug: span.tagSlug,
      label: span.label,
      startOffset: span.startOffset,
      endOffset: span.endOffset,
      selectedText: span.selectedText,
    })),
  };
}
