export const NEST_DOCUMENT_KINDS = [
  "original-content",
  "study-source",
  "research-packet",
  "production-room",
  "publish-packet",
] as const;

export type NestDocumentKind = (typeof NEST_DOCUMENT_KINDS)[number];

export type NestDocumentSummary = {
  id: string;
  nestSlug: string;
  slug: string;
  title: string;
  kind: NestDocumentKind;
  sourceUrl?: string;
  sourceLabel?: string;
  status?: "draft" | "active" | "ready" | "published" | "archived";
  updatedAt?: string;
};

export const NEST_DOCUMENT_KIND_LABELS: Record<NestDocumentKind, string> = {
  "original-content": "Original writing",
  "study-source": "Study source",
  "research-packet": "Research packet",
  "production-room": "Production room",
  "publish-packet": "Publish packet",
};

export const NEST_DOCUMENT_KIND_DESCRIPTIONS: Record<NestDocumentKind, string> = {
  "original-content": "A living manuscript, article, script, book, or other work authored inside Quipsly.",
  "study-source": "Imported source material kept stable underneath highlights, notes, tags, and research overlays.",
  "research-packet": "A curated bundle of sources, quotes, examples, notes, and Quipsly assistant findings.",
  "production-room": "The episode, recording, timeline, transcript, and media-sync workspace for a specific production.",
  "publish-packet": "A public-safe projection package prepared for websites, feeds, social posts, Patreon, or exports.",
};

export function getNestDocumentKindLabel(kind: string | null | undefined) {
  if (kind && NEST_DOCUMENT_KINDS.includes(kind as NestDocumentKind)) {
    return NEST_DOCUMENT_KIND_LABELS[kind as NestDocumentKind];
  }
  return "Document";
}

export function getNestDocumentKindDescription(kind: string | null | undefined) {
  if (kind && NEST_DOCUMENT_KINDS.includes(kind as NestDocumentKind)) {
    return NEST_DOCUMENT_KIND_DESCRIPTIONS[kind as NestDocumentKind];
  }
  return "A Quipsly document inside a Nest.";
}
