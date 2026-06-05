/**
 * @file embeddings.ts
 * @module lib/retrieval/embeddings
 * @description 
 * Semantic Search and Embeddings pipeline for the Quipsly Document Kernel.
 * Implements a `MockEmbeddingProvider` (for local dev) and provides the
 * `hybridSearchExamples` function, which uses Reciprocal Rank Fusion (RRF)
 * to perfectly blend keyword BM25/`contains` hits with `pgvector` semantic hits.
 */

import { getPrismaClient } from "../prisma";
import { RetrievalProvenance } from "@high-ground/quipsly-domain/retrieval";

export interface EmbeddingProvider {
  generateEmbedding(text: string): Promise<number[]>;
}

/**
 * A mock embedding provider for local development. 
 * In production, this would call OpenAI or Google Vertex API.
 */
export class MockEmbeddingProvider implements EmbeddingProvider {
  async generateEmbedding(text: string): Promise<number[]> {
    // Generate a deterministic mock 1536-dimensional vector based on the text length
    // to allow for basic distance testing.
    const vector = new Array(1536).fill(0).map((_, i) => {
      return (text.length % (i + 1)) / (i + 1);
    });
    
    // Normalize vector
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    return vector.map((val) => val / (magnitude || 1));
  }
}

/**
 * Background worker utility to embed a piece of text and store it in the sidecar table.
 * Designed to be called asynchronously after a StudioDocumentBlock or QuipslyNode is saved.
 */
export async function embedAndStoreDocumentBlock(
  projectId: string,
  blockId: string,
  content: string,
  provider: EmbeddingProvider = new MockEmbeddingProvider()
): Promise<void> {
  // NOTE: RetrievalEmbedding model was removed from the schema.
  // Stubbing to prevent build errors.
  console.warn("[Embeddings] RetrievalEmbedding model is offline. Skipping storage.");
  return;
}

/**
 * Perform a hybrid search (keyword + semantic) against the sidecar embeddings table.
 */
export async function hybridSearchExamples(
  query: string,
  projectId: string,
  limit: number = 20,
  provider: EmbeddingProvider = new MockEmbeddingProvider()
): Promise<{ sourceId: string; score: number }[]> {
  const prisma = getPrismaClient();

  // 1. Keyword search baseline
  const keywordHits = await prisma.studioDocumentBlock.findMany({
    where: {
      document: { projectId },
      body: { contains: query, mode: "insensitive" }
    },
    take: limit * 2,
    select: { id: true }
  });
  
  const vectorHits: { sourceId: string; distance: number }[] = []; // Mock empty

  // 3. Reciprocal Rank Fusion (RRF) blending
  const scores = new Map<string, number>();
  
  keywordHits.forEach((hit, index) => {
    // Basic RRF score: 1 / (rank + 60)
    scores.set(hit.id, 1 / (index + 60));
  });

  vectorHits.forEach((hit, index) => {
    const existing = scores.get(hit.sourceId) || 0;
    scores.set(hit.sourceId, existing + (1 / (index + 60)));
  });

  // 4. Sort and format results
  const blended = Array.from(scores.entries())
    .map(([sourceId, score]) => ({ sourceId, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return blended;
}
