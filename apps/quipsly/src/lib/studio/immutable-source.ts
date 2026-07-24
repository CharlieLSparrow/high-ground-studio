const IMMUTABLE_TRANSCRIPT_SOURCE_PREFIX = "transcript:";

export function isImmutableTranscriptSourceExternalId(externalId: unknown): boolean {
  return typeof externalId === "string" && externalId.startsWith(IMMUTABLE_TRANSCRIPT_SOURCE_PREFIX);
}

export function assertMutableWritingBlock(externalId: unknown): void {
  if (isImmutableTranscriptSourceExternalId(externalId)) {
    throw new Error(
      "Transcript source evidence is immutable. Write in the linked draft block or create a reviewed transcript correction instead.",
    );
  }
}
