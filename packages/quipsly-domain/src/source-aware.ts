export type SourceDocumentKind =
  | "book"
  | "article"
  | "web-page"
  | "course-page"
  | "transcript"
  | "research-note"
  | "scripture"
  | "legal"
  | "unknown";

export type SourceIngestStatus =
  | "draft"
  | "imported"
  | "chunked"
  | "indexed"
  | "needs-review"
  | "failed";

export type SourceSelectorKind =
  | "whole-document"
  | "block"
  | "text-quote"
  | "character-range"
  | "time-range"
  | "media-segment";

export type SourceDocumentRef = {
  readonly sourceDocumentId: string;
  readonly title: string;
  readonly kind: SourceDocumentKind;
  readonly canonicalUrl?: string;
  readonly importedAt: string;
  readonly ingestStatus: SourceIngestStatus;
};

export type SourceSelector = {
  readonly kind: SourceSelectorKind;
  readonly sourceDocumentId: string;
  readonly blockId?: string;
  readonly exactText?: string;
  readonly prefixText?: string;
  readonly suffixText?: string;
  readonly startOffset?: number;
  readonly endOffset?: number;
  readonly startSeconds?: number;
  readonly endSeconds?: number;
};

export type SourceOverlayKind =
  | "highlight"
  | "tag"
  | "note"
  | "quote"
  | "question"
  | "example"
  | "counterexample"
  | "citation";

export type SourceOverlay = {
  readonly id: string;
  readonly kind: SourceOverlayKind;
  readonly selector: SourceSelector;
  readonly label?: string;
  readonly note?: string;
  readonly tagSlugs?: readonly string[];
  readonly createdByUserId?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type SourceCitation = {
  readonly id: string;
  readonly selector: SourceSelector;
  readonly displayLabel: string;
  readonly sourceUrl?: string;
  readonly verified: boolean;
  readonly reviewNote?: string;
};

export type SourceAwareResearchPacket = {
  readonly id: string;
  readonly title: string;
  readonly question: string;
  readonly sourceDocuments: readonly SourceDocumentRef[];
  readonly overlays: readonly SourceOverlay[];
  readonly citations: readonly SourceCitation[];
  readonly summary?: string;
  readonly humanReviewStatus: "draft" | "needs-review" | "approved" | "rejected";
  readonly createdAt: string;
  readonly savedAt: string;
};

export const SOURCE_INGEST_STATUS_LABELS: Record<SourceIngestStatus, string> = {
  draft: "Draft",
  imported: "Imported",
  chunked: "Chunked",
  indexed: "Indexed",
  "needs-review": "Needs review",
  failed: "Failed",
};

export const SOURCE_INGEST_STATUS_DESCRIPTIONS: Record<SourceIngestStatus, string> = {
  draft: "Source is planned but not imported yet.",
  imported: "Source content is available in the Nest.",
  chunked: "Source has been split into retrievable sections.",
  indexed: "Source is ready for search, comparison, and assistant retrieval.",
  "needs-review": "Source needs a human check before it should be trusted downstream.",
  failed: "Source import or indexing failed and needs repair.",
};

export const SOURCE_REVIEW_STATUS_LABELS: Record<SourceAwareResearchPacket["humanReviewStatus"], string> = {
  draft: "Draft",
  "needs-review": "Needs review",
  approved: "Approved",
  rejected: "Rejected",
};

export function getSourceIngestStatusLabel(status: SourceIngestStatus | string | null | undefined) {
  if (status && status in SOURCE_INGEST_STATUS_LABELS) {
    return SOURCE_INGEST_STATUS_LABELS[status as SourceIngestStatus];
  }
  return "Unknown";
}

export function getSourceIngestStatusDescription(status: SourceIngestStatus | string | null | undefined) {
  if (status && status in SOURCE_INGEST_STATUS_DESCRIPTIONS) {
    return SOURCE_INGEST_STATUS_DESCRIPTIONS[status as SourceIngestStatus];
  }
  return "Source status has not been classified yet.";
}

export function getSourceReviewStatusLabel(status: SourceAwareResearchPacket["humanReviewStatus"] | string | null | undefined) {
  if (status && status in SOURCE_REVIEW_STATUS_LABELS) {
    return SOURCE_REVIEW_STATUS_LABELS[status as SourceAwareResearchPacket["humanReviewStatus"]];
  }
  return "Needs review";
}

export function createWholeDocumentSelector(sourceDocumentId: string): SourceSelector {
  return {
    kind: "whole-document",
    sourceDocumentId,
  };
}

export function createBlockSelector(sourceDocumentId: string, blockId: string): SourceSelector {
  return {
    kind: "block",
    sourceDocumentId,
    blockId,
  };
}

export function createTextQuoteSelector(
  sourceDocumentId: string,
  exactText: string,
  context?: { prefixText?: string; suffixText?: string; blockId?: string },
): SourceSelector {
  return {
    kind: "text-quote",
    sourceDocumentId,
    blockId: context?.blockId,
    exactText,
    prefixText: context?.prefixText,
    suffixText: context?.suffixText,
  };
}

export function selectorHasEvidence(selector: SourceSelector) {
  if (selector.kind === "whole-document") return true;
  if (selector.kind === "block") return Boolean(selector.blockId);
  if (selector.kind === "text-quote") return Boolean(selector.exactText);
  if (selector.kind === "character-range") {
    return Number.isFinite(selector.startOffset) && Number.isFinite(selector.endOffset);
  }
  if (selector.kind === "time-range" || selector.kind === "media-segment") {
    return Number.isFinite(selector.startSeconds) && Number.isFinite(selector.endSeconds);
  }
  return false;
}
