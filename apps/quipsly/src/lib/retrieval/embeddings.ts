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

import { GoogleGenAI } from "@google/genai";
import { randomUUID } from "crypto";

export interface EmbeddingProvider {
  generateEmbedding(text: string): Promise<number[]>;
}

export class GeminiEmbeddingProvider implements EmbeddingProvider {
  async generateEmbedding(text: string): Promise<number[]> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("GEMINI_API_KEY missing, using zero-vector fallback");
      return new Array(768).fill(0);
    }
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.embedContent({
      model: "text-embedding-004",
      contents: text,
    });
    return response.embeddings?.[0]?.values || new Array(768).fill(0);
  }
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
  provider: EmbeddingProvider = new GeminiEmbeddingProvider()
): Promise<void> {
  const prisma = getPrismaClient();
  const vector = await provider.generateEmbedding(content);
  const vectorString = `[${vector.join(",")}]`;

  // Upsert pattern using raw SQL for pgvector
  await prisma.$executeRaw`
    INSERT INTO "RetrievalEmbedding" ("id", "sourceType", "sourceId", "projectId", "contentSnapshot", "embedding")
    VALUES (${randomUUID()}, 'DOCUMENT_BLOCK', ${blockId}, ${projectId}, ${content}, ${vectorString}::vector)
    ON CONFLICT ("id") DO NOTHING;
  `;
}

export async function syncProjectEmbeddings(projectId: string, provider: EmbeddingProvider = new GeminiEmbeddingProvider()) {
  const prisma = getPrismaClient();
  
  // 1. Clear old embeddings for this project to avoid duplicates on re-sync (simple strategy)
  await prisma.$executeRaw`DELETE FROM "RetrievalEmbedding" WHERE "projectId" = ${projectId};`;

  // 2. Fetch all blocks
  const documents = await prisma.studioDocument.findMany({
    where: { projectId },
    include: { blocks: { where: { archivedAt: null } } }
  });

  const blocksToEmbed = documents.flatMap(d => d.blocks).filter(b => b.body.trim().length > 10);

  // 3. Embed and store
  for (const block of blocksToEmbed) {
    const vector = await provider.generateEmbedding(block.body);
    const vectorString = `[${vector.join(",")}]`;
    await prisma.$executeRaw`
      INSERT INTO "RetrievalEmbedding" ("id", "sourceType", "sourceId", "projectId", "contentSnapshot", "embedding")
      VALUES (${randomUUID()}, 'DOCUMENT_BLOCK', ${block.id}, ${projectId}, ${block.body}, ${vectorString}::vector);
    `;
  }

  // 4. Do the same for QuipLoreQuotes
  const quotes = await prisma.quipLoreQuote.findMany({
    where: { projectId }
  });

  for (const quote of quotes) {
    const vector = await provider.generateEmbedding(quote.text);
    const vectorString = `[${vector.join(",")}]`;
    await prisma.$executeRaw`
      INSERT INTO "RetrievalEmbedding" ("id", "sourceType", "sourceId", "projectId", "contentSnapshot", "embedding")
      VALUES (${randomUUID()}, 'QUIPLORE_QUOTE', ${quote.id}, ${projectId}, ${quote.text}, ${vectorString}::vector);
    `;
  }

  return { syncedBlocks: blocksToEmbed.length, syncedQuotes: quotes.length };
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
  
  // 2. Vector semantic search
  let vectorHits: { sourceId: string; distance: number }[] = [];
  try {
    const queryVector = await provider.generateEmbedding(query);
    if (queryVector.length > 0) {
      const vectorString = `[${queryVector.join(",")}]`;
      vectorHits = await prisma.$queryRaw<Array<{ sourceId: string; distance: number }>>`
        SELECT "sourceId", embedding <=> ${vectorString}::vector as distance
        FROM "RetrievalEmbedding"
        WHERE "projectId" = ${projectId} AND embedding IS NOT NULL
        ORDER BY distance ASC
        LIMIT ${limit * 2};
      `;
    }
  } catch (error) {
    console.error("[embeddings] Vector search failed, falling back to keyword only.", error);
  }

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

/**
 * Perform a semantic search directly against QuipLoreQuote pgvector embeddings.
 */
export async function searchSemanticLoreQuotes(
  query: string,
  projectId: string,
  limit: number = 10,
  provider: EmbeddingProvider = new GeminiEmbeddingProvider()
) {
  const prisma = getPrismaClient();

  try {
    const queryVector = await provider.generateEmbedding(query);
    if (queryVector.length > 0) {
      const vectorString = `[${queryVector.join(",")}]`;
      
      const quotes = await prisma.$queryRaw<Array<{ id: string; distance: number }>>`
        SELECT id, embedding <=> ${vectorString}::vector as distance
        FROM "QuipLoreQuote"
        WHERE "projectId" = ${projectId} AND embedding IS NOT NULL
        ORDER BY distance ASC
        LIMIT ${limit};
      `;
      
      return quotes;
    }
  } catch (error) {
    console.error("[embeddings] Semantic Lore vector search failed.", error);
  }

  // Fallback to empty array if vector search fails
  return [];
}
