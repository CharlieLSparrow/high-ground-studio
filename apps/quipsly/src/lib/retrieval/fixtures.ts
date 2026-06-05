import {
  ManuscriptResearchPacket,
  createEmptyPacket,
  createPacketId,
  createRetrievalResultId,
} from "@high-ground/quipsly-domain/retrieval";

/**
 * Safe test queries to verify the retrieval runtime without relying on deep database data.
 * These are designed to be run against the 'active-manuscript' library.
 */
export const RETRIEVAL_TEST_QUERIES = [
  "magical artifact",
  "core character motivation",
  "the incident at the docks",
  "historical context of the old war",
];

/**
 * Returns a mock successful packet for testing UI rendering or assistant ingestion
 * when the database is completely empty. 
 * Provides fake provenance to verify citation links.
 */
export function getMockRetrievalPacket(query: string, projectId: string): ManuscriptResearchPacket {
  const startTime = Date.now();

  return {
    packetId: createPacketId(),
    query,
    intent: "example-search",
    librarySlug: "active-manuscript",
    results: [
      {
        resultId: createRetrievalResultId(),
        title: "Block from Chapter 1",
        content: `This is a mock result for "${query}". In the early drafts, the author noted that this concept was central to the thematic arc of the story.`,
        relevanceScore: 1.0,
        citation: "Active Document",
        verificationStatus: "needs-review",
        provenance: {
          origin: "studio-span",
          projectId,
          documentId: "mock-doc-123",
          documentStableId: "mock-doc-stable-123",
          documentTitle: "Chapter 1: The Beginning",
          blockId: "mock-block-456",
          blockStableId: "mock-block-stable-456",
        },
      },
    ],
    meta: {
      retrievedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime + 42,
      resultCount: 1,
      sourcesCovered: 1,
      truncated: false,
    },
  };
}

/**
 * Returns a guaranteed empty packet for testing empty state behavior.
 */
export function getMockEmptyPacket(query: string): ManuscriptResearchPacket {
  return createEmptyPacket({
    query,
    intent: "example-search",
    librarySlug: "active-manuscript",
    startTime: Date.now() - 15,
  });
}
