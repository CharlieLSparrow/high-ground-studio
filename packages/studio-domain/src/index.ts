export type ProjectionStatus =
  | "private"
  | "draft"
  | "review"
  | "approved"
  | "published"
  | "not_public"
  | "projection_not_approved";

export type AgentRunStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "canceled";

export type KnowledgeNodeType =
  | "principle"
  | "story"
  | "quote"
  | "question"
  | "projection_candidate"
  | "source_note";

export type KnowledgeEdgeType =
  | "supports"
  | "contrasts"
  | "develops"
  | "cites"
  | "belongs_to"
  | "inspires";

export type StudioDocument = {
  id: string;
  title: string;
  sourceLabel?: string;
  sourcePath?: string;
  workspaceId?: string;
  projectId?: string;
  projectionStatus: ProjectionStatus;
  blocks: StudioBlock[];
  createdAt: string;
  updatedAt: string;
};

export type StudioBlock = {
  id: string;
  documentId: string;
  order: number;
  title?: string;
  body: string;
  sourceLabel?: string;
  sourcePath?: string;
  externalId?: string;
  projectionStatus?: ProjectionStatus;
};

export type StudioSpan = {
  id?: string;
  documentId: string;
  blockId: string;
  startOffset: number;
  endOffset: number;
  text: string;
};

export type StudioTag = {
  id: string;
  label: string;
  description?: string;
  category?: "meaning" | "structure" | "source" | "projection" | "review";
  nodeType?: KnowledgeNodeType;
};

export type ProvenanceRef = {
  documentId: string;
  documentTitle: string;
  blockId: string;
  blockTitle?: string;
  sourceLabel?: string;
  sourcePath?: string;
  spanStartOffset: number;
  spanEndOffset: number;
  selectedText: string;
  tagId: string;
  tagLabel: string;
  createdAt: string;
};

export type StudioTagApplication = {
  id: string;
  documentId: string;
  blockId: string;
  span: StudioSpan;
  tag: StudioTag;
  provenance: ProvenanceRef;
  projectionStatus: ProjectionStatus;
  createdAt: string;
  createdByLabel?: string;
};

export type KnowledgeNode = {
  id: string;
  title: string;
  body: string;
  nodeType: KnowledgeNodeType;
  sourceTagApplicationId: string;
  sourceText: string;
  tagId: string;
  tagLabel: string;
  projectionStatus: ProjectionStatus;
  provenance: ProvenanceRef;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeEdge = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  edgeType: KnowledgeEdgeType;
  label?: string;
  provenance?: ProvenanceRef;
  createdAt: string;
};

export type SpanValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

export type CreateSpanSnapshotInput = {
  documentId: string;
  block: Pick<StudioBlock, "id" | "body">;
  startOffset: number;
  endOffset: number;
  id?: string;
};

export type CreateTagApplicationInput = {
  id: string;
  document: Pick<StudioDocument, "id" | "title" | "sourceLabel" | "sourcePath">;
  block: Pick<StudioBlock, "id" | "title" | "sourceLabel" | "sourcePath">;
  span: StudioSpan;
  tag: StudioTag;
  createdAt: string;
  createdByLabel?: string;
  projectionStatus?: ProjectionStatus;
};

export type CreateKnowledgeNodeInput = {
  id: string;
  application: StudioTagApplication;
  title?: string;
  body?: string;
  nodeType?: KnowledgeNodeType;
  createdAt?: string;
  projectionStatus?: ProjectionStatus;
};

export function validateSpanOffsets(
  blockText: string,
  startOffset: number,
  endOffset: number,
): SpanValidationResult {
  if (!Number.isInteger(startOffset) || !Number.isInteger(endOffset)) {
    return { ok: false, reason: "Span offsets must be whole numbers." };
  }

  if (startOffset < 0) {
    return { ok: false, reason: "Span start must be zero or greater." };
  }

  if (endOffset <= startOffset) {
    return { ok: false, reason: "Span end must be greater than span start." };
  }

  if (endOffset > blockText.length) {
    return { ok: false, reason: "Span end is outside the block text." };
  }

  return { ok: true };
}

export function createSpanSnapshot({
  documentId,
  block,
  startOffset,
  endOffset,
  id,
}: CreateSpanSnapshotInput): StudioSpan {
  const validation = validateSpanOffsets(block.body, startOffset, endOffset);

  if (!validation.ok) {
    throw new RangeError(validation.reason);
  }

  return {
    id,
    documentId,
    blockId: block.id,
    startOffset,
    endOffset,
    text: block.body.slice(startOffset, endOffset),
  };
}

export function createTagApplication({
  id,
  document,
  block,
  span,
  tag,
  createdAt,
  createdByLabel,
  projectionStatus = "private",
}: CreateTagApplicationInput): StudioTagApplication {
  const provenance: ProvenanceRef = {
    documentId: document.id,
    documentTitle: document.title,
    blockId: block.id,
    blockTitle: block.title,
    sourceLabel: block.sourceLabel ?? document.sourceLabel,
    sourcePath: block.sourcePath ?? document.sourcePath,
    spanStartOffset: span.startOffset,
    spanEndOffset: span.endOffset,
    selectedText: span.text,
    tagId: tag.id,
    tagLabel: tag.label,
    createdAt,
  };

  return {
    id,
    documentId: document.id,
    blockId: block.id,
    span,
    tag,
    provenance,
    projectionStatus,
    createdAt,
    createdByLabel,
  };
}

export function createKnowledgeNodeFromTaggedSpan({
  id,
  application,
  title,
  body,
  nodeType,
  createdAt = application.createdAt,
  projectionStatus = "projection_not_approved",
}: CreateKnowledgeNodeInput): KnowledgeNode {
  const resolvedNodeType = nodeType ?? application.tag.nodeType ?? "source_note";
  const resolvedTitle =
    title ?? `${application.tag.label}: ${truncateText(application.span.text, 54)}`;

  return {
    id,
    title: resolvedTitle,
    body: body ?? application.span.text,
    nodeType: resolvedNodeType,
    sourceTagApplicationId: application.id,
    sourceText: application.span.text,
    tagId: application.tag.id,
    tagLabel: application.tag.label,
    projectionStatus,
    provenance: application.provenance,
    createdAt,
    updatedAt: createdAt,
  };
}

export function formatProvenanceLabel(ref: ProvenanceRef): string {
  return `${ref.documentTitle} / ${ref.blockId} / ${ref.spanStartOffset}-${ref.spanEndOffset}`;
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}
