const IMMUTABLE_TRANSCRIPT_SOURCE_PREFIX = "transcript:";
const IMMUTABLE_ANNOTATION_EVIDENCE_PREFIX = "annotation-evidence:";

export function isImmutableTranscriptSourceExternalId(externalId: unknown): boolean {
  return typeof externalId === "string" && externalId.startsWith(IMMUTABLE_TRANSCRIPT_SOURCE_PREFIX);
}

export function isImmutableAnnotationEvidenceExternalId(externalId: unknown): boolean {
  return typeof externalId === "string" && externalId.startsWith(IMMUTABLE_ANNOTATION_EVIDENCE_PREFIX);
}

export function isImmutableSourceEvidenceExternalId(externalId: unknown): boolean {
  return isImmutableTranscriptSourceExternalId(externalId)
    || isImmutableAnnotationEvidenceExternalId(externalId);
}

export function assertMutableWritingBlock(externalId: unknown): void {
  if (isImmutableTranscriptSourceExternalId(externalId)) {
    throw new Error(
      "Transcript source evidence is immutable. Write in the linked draft block or create a reviewed transcript correction instead.",
    );
  }
  if (isImmutableAnnotationEvidenceExternalId(externalId)) {
    throw new Error(
      "Research source evidence is immutable. Write in the linked response block or revise the canonical annotation instead.",
    );
  }
}
