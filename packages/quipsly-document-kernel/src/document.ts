export const QUIPSLY_DOCUMENT_SCHEMA_VERSION = 1 as const;

export type QuipslyDocumentSchemaVersion =
  typeof QUIPSLY_DOCUMENT_SCHEMA_VERSION;

export type JsonPrimitive = string | number | boolean | null;

export type JsonValue =
  | JsonPrimitive
  | { [key: string]: JsonValue }
  | JsonValue[];

export type KernelMetadata = Record<string, JsonValue>;

export type DocumentNodeType =
  | "paragraph"
  | "heading"
  | "quoteBlock"
  | "note"
  | "transcriptSegment"
  | "mediaReference";

export type DocumentNode = {
  id: string;
  type: DocumentNodeType;
  text: string;
  attrs?: KernelMetadata;
};

export type BoundaryKind = "chapter" | "episode" | string;

export type BoundaryMarker = {
  id: string;
  kind: BoundaryKind;
  nodeId: string;
  title: string;
  metadata?: KernelMetadata;
};

export type RegionKind = "story" | "section" | "scene" | "arc" | string;

export type Region = {
  id: string;
  kind: RegionKind;
  startNodeId: string;
  endNodeId: string;
  title: string;
  metadata?: KernelMetadata;
};

export type TextAnchor = {
  type: "text";
  nodeId: string;
  startOffset: number;
  endOffset: number;
  exact: string;
  prefix: string;
  suffix: string;
};

export type NodeAnchor = {
  type: "node";
  nodeId: string;
};

export type BoundaryAnchor = {
  type: "boundary";
  boundaryId: string;
};

export type RegionAnchor = {
  type: "region";
  regionId: string;
};

export type MediaTimeAnchor = {
  type: "mediaTime";
  assetId: string;
  startTimeMs: number;
  endTimeMs: number;
};

export type TimelineAnchor = {
  type: "timeline";
  timelineId: string;
  trackId: string;
  startFrame: number;
  endFrame: number;
};

export type Anchor =
  | TextAnchor
  | NodeAnchor
  | BoundaryAnchor
  | RegionAnchor
  | MediaTimeAnchor
  | TimelineAnchor;

export type InlineAnnotationKind =
  | "quote"
  | "clip"
  | "research"
  | "question"
  | "needs-review"
  | "source-needed"
  | "show-notes"
  | "social-candidate"
  | string;

export type InlineAnnotation = {
  id: string;
  kind: InlineAnnotationKind;
  label?: string;
  anchors: Anchor[];
  metadata?: KernelMetadata;
  createdAt?: string;
  updatedAt?: string;
};

export type EntityReferenceKind =
  | "verifiedQuote"
  | "source"
  | "sourcePassage"
  | "character"
  | "location"
  | "mediaAsset"
  | "marketComp"
  | string;

export type EntityReference = {
  id: string;
  kind: EntityReferenceKind;
  entityId: string;
  anchors: Anchor[];
  metadata?: KernelMetadata;
  createdAt?: string;
  updatedAt?: string;
};

export type QuipslyDocument = {
  schemaVersion: QuipslyDocumentSchemaVersion;
  id: string;
  title: string;
  nodes: DocumentNode[];
  boundaries: BoundaryMarker[];
  regions: Region[];
  annotations: InlineAnnotation[];
  entityReferences: EntityReference[];
  metadata?: KernelMetadata;
  createdAt?: string;
  updatedAt?: string;
};

export type CreateDocumentInput = {
  id: string;
  title: string;
  nodes?: DocumentNode[];
  metadata?: KernelMetadata;
  now?: string;
};

export function createQuipslyDocument(
  input: CreateDocumentInput,
): QuipslyDocument {
  const now = input.now ?? new Date().toISOString();

  return {
    schemaVersion: QUIPSLY_DOCUMENT_SCHEMA_VERSION,
    id: input.id,
    title: input.title,
    nodes: input.nodes ?? [],
    boundaries: [],
    regions: [],
    annotations: [],
    entityReferences: [],
    metadata: input.metadata,
    createdAt: now,
    updatedAt: now,
  };
}

export function cloneDocument(document: QuipslyDocument): QuipslyDocument {
  return JSON.parse(JSON.stringify(document)) as QuipslyDocument;
}

export function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

export function getNodeIndex(document: QuipslyDocument, nodeId: string) {
  return document.nodes.findIndex((node) => node.id === nodeId);
}

export function getNodeOrThrow(document: QuipslyDocument, nodeId: string) {
  const node = document.nodes.find((candidate) => candidate.id === nodeId);

  if (!node) {
    throw new Error(`Document node not found: ${nodeId}`);
  }

  return node;
}
