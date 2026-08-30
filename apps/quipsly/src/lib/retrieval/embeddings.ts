/**
 * @file embeddings.ts
 * @module lib/retrieval/embeddings
 * @description 
 * Semantic Search and Embeddings pipeline for the Quipsly Document Kernel.
 * Provides an explicit `MockEmbeddingProvider` for tests and the
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

export const QUIPSLY_EMBEDDING_MODEL = "gemini-embedding-2";
export const QUIPSLY_EMBEDDING_DIMENSIONS = 768;
export const MAX_PROJECT_EMBEDDING_ITEMS = 500;
const MAX_EMBEDDING_INPUT_CHARACTERS = 24_000;
const MANAGED_SOURCE_ORIGINS = ["studio-document-block", "quipsly-lore-quote"] as const;

export function prepareRetrievalDocument(content: string, title?: string | null) {
  const cleanContent = content.trim().slice(0, MAX_EMBEDDING_INPUT_CHARACTERS);
  const cleanTitle = title?.replace(/\s+/g, " ").trim().slice(0, 500) || "none";
  return `title: ${cleanTitle} | text: ${cleanContent}`;
}

export function prepareRetrievalQuery(query: string) {
  return `task: search result | query: ${query.trim().slice(0, MAX_EMBEDDING_INPUT_CHARACTERS)}`;
}

function requireValidVector(vector: number[]) {
  if (
    vector.length !== QUIPSLY_EMBEDDING_DIMENSIONS
    || vector.some((value) => !Number.isFinite(value))
    || vector.every((value) => value === 0)
  ) {
    throw new Error(`Embedding provider returned an invalid ${QUIPSLY_EMBEDDING_DIMENSIONS}-dimension vector.`);
  }
  return vector;
}

export class GeminiEmbeddingProvider implements EmbeddingProvider {
  async generateEmbedding(text: string): Promise<number[]> {
    if (process.env.QUIPSLY_DISABLE_AI_PROVIDER === "true") {
      throw new Error("AI provider access is disabled; the existing research index was not changed.");
    }
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured; the existing research index was not changed.");
    }
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.embedContent({
      model: QUIPSLY_EMBEDDING_MODEL,
      contents: text,
      config: { outputDimensionality: QUIPSLY_EMBEDDING_DIMENSIONS },
    });
    return requireValidVector(response.embeddings?.[0]?.values ?? []);
  }
}

/**
 * A mock embedding provider for local development. 
 * In production, this would call OpenAI or Google Vertex API.
 */
export class MockEmbeddingProvider implements EmbeddingProvider {
  async generateEmbedding(text: string): Promise<number[]> {
    // Generate a deterministic same-shape vector for isolated tests only.
    // to allow for basic distance testing.
    const vector = new Array(QUIPSLY_EMBEDDING_DIMENSIONS).fill(0).map((_, i) => {
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
  const block = await prisma.studioDocumentBlock.findUnique({
    where: { id: blockId },
    select: {
      document: { select: { personalOwnerUserId: true, isPrivate: true } },
    },
  });
  if (!block) {
    throw new Error("Writing block not found; no content was sent to the embedding provider.");
  }
  if (block.document.personalOwnerUserId && block.document.isPrivate) {
    await prisma.retrievalEmbedding.deleteMany({
      where: {
        projectId,
        sourceOrigin: "studio-document-block",
        sourceId: blockId,
      },
    });
    return;
  }
  const embeddedContent = content.trim().slice(0, MAX_EMBEDDING_INPUT_CHARACTERS);
  const vector = requireValidVector(await provider.generateEmbedding(prepareRetrievalDocument(embeddedContent)));
  const vectorString = `[${vector.join(",")}]`;

  await prisma.$transaction(async (tx) => {
    await tx.retrievalEmbedding.deleteMany({
      where: { projectId, sourceOrigin: "studio-document-block", sourceId: blockId },
    });
    await tx.$executeRaw`
      INSERT INTO "RetrievalEmbedding" ("id", "sourceOrigin", "sourceId", "projectId", "contentSnapshot", "embedding")
      VALUES (${randomUUID()}, 'studio-document-block', ${blockId}, ${projectId}, ${embeddedContent}, ${vectorString}::vector)
    `;
  });
}

export async function syncProjectEmbeddings(projectId: string, provider: EmbeddingProvider = new GeminiEmbeddingProvider()) {
  const prisma = getPrismaClient();

  const documents = await prisma.studioDocument.findMany({
    where: {
      projectId,
      OR: [{ personalOwnerUserId: null }, { isPrivate: false }],
    },
    select: {
      title: true,
      blocks: {
        where: { archivedAt: null },
        select: { id: true, title: true, body: true },
      },
    },
  });
  const quotes = await prisma.quipLoreQuote.findMany({
    where: { projectId },
    select: { id: true, text: true },
  });

  const blockUnits = documents.flatMap((document) => document.blocks
    .filter((block) => block.body.trim().length > 10)
    .map((block) => ({
      sourceOrigin: "studio-document-block" as const,
      sourceId: block.id,
      title: block.title || document.title,
      contentSnapshot: block.body.trim().slice(0, MAX_EMBEDDING_INPUT_CHARACTERS),
    })));
  const quoteUnits = quotes
    .filter((quote) => quote.text.trim().length > 10)
    .map((quote) => ({
      sourceOrigin: "quipsly-lore-quote" as const,
      sourceId: quote.id,
      title: "Quipsly Lore quote",
      contentSnapshot: quote.text.trim().slice(0, MAX_EMBEDDING_INPUT_CHARACTERS),
    }));
  const units = [...blockUnits, ...quoteUnits];

  if (units.length > MAX_PROJECT_EMBEDDING_ITEMS) {
    throw new Error(`This Nest has ${units.length} eligible items; narrow the index below ${MAX_PROJECT_EMBEDDING_ITEMS + 1} items before refreshing.`);
  }

  // Finish every provider call before opening the replacement transaction. A
  // missing credential, quota error, or malformed vector therefore leaves the
  // last-known-good index intact.
  const prepared = [] as Array<(typeof units)[number] & { vectorString: string }>;
  for (const unit of units) {
    const vector = requireValidVector(await provider.generateEmbedding(
      prepareRetrievalDocument(unit.contentSnapshot, unit.title),
    ));
    prepared.push({ ...unit, vectorString: `[${vector.join(",")}]` });
  }

  await prisma.$transaction(async (tx) => {
    await tx.retrievalEmbedding.deleteMany({
      where: { projectId, sourceOrigin: { in: [...MANAGED_SOURCE_ORIGINS] } },
    });
    for (const unit of prepared) {
      await tx.$executeRaw`
        INSERT INTO "RetrievalEmbedding" ("id", "sourceOrigin", "sourceId", "projectId", "contentSnapshot", "embedding")
        VALUES (${randomUUID()}, ${unit.sourceOrigin}, ${unit.sourceId}, ${projectId}, ${unit.contentSnapshot}, ${unit.vectorString}::vector)
      `;
    }
  });

  return { syncedBlocks: blockUnits.length, syncedQuotes: quoteUnits.length };
}

/**
 * Perform a hybrid search (keyword + semantic) against the sidecar embeddings table.
 */
export async function hybridSearchExamples(
  query: string,
  projectId: string,
  limit: number = 20,
  provider: EmbeddingProvider = new GeminiEmbeddingProvider()
): Promise<{ sourceId: string; score: number }[]> {
  const prisma = getPrismaClient();

  // 1. Keyword search baseline
  const stopWords = new Set([
    "about", "after", "examples", "find", "from", "into", "nest", "related",
    "that", "this", "what", "when", "where", "which", "with",
  ]);
  const queryTerms = Array.from(new Set(
    query
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((term) => term.length > 3 && !stopWords.has(term)),
  )).slice(0, 10);
  const keywordHits = queryTerms.length > 0 ? await prisma.studioDocumentBlock.findMany({
    where: {
      document: {
        projectId,
        OR: [{ personalOwnerUserId: null }, { isPrivate: false }],
      },
      OR: queryTerms.map((term) => ({ body: { contains: term, mode: "insensitive" as const } })),
    },
    take: limit * 2,
    select: { id: true, body: true },
  }) : [];
  const rankedKeywordHits = keywordHits
    .map((hit) => ({
      id: hit.id,
      matches: queryTerms.reduce(
        (total, term) => total + (hit.body.toLowerCase().includes(term) ? 1 : 0),
        0,
      ),
    }))
    .sort((left, right) => right.matches - left.matches || left.id.localeCompare(right.id));
  
  // 2. Vector semantic search
  let vectorHits: { sourceId: string; distance: number }[] = [];
  try {
    const queryVector = requireValidVector(await provider.generateEmbedding(prepareRetrievalQuery(query)));
    if (queryVector.length > 0) {
      const vectorString = `[${queryVector.join(",")}]`;
      vectorHits = await prisma.$queryRaw<Array<{ sourceId: string; distance: number }>>`
        SELECT embedding."sourceId", embedding.embedding <=> ${vectorString}::vector as distance
        FROM "RetrievalEmbedding" embedding
        JOIN "StudioDocumentBlock" block ON block."id" = embedding."sourceId"
        JOIN "StudioDocument" document ON document."id" = block."documentId"
        WHERE embedding."projectId" = ${projectId}
          AND embedding."sourceOrigin" = 'studio-document-block'
          AND embedding.embedding IS NOT NULL
          AND (document."personalOwnerUserId" IS NULL OR document."isPrivate" = false)
        ORDER BY distance ASC
        LIMIT ${limit * 2};
      `;
    }
  } catch (error) {
    console.error("[embeddings] Vector search failed, falling back to keyword only.", error);
  }

  // 3. Reciprocal Rank Fusion (RRF) blending
  const scores = new Map<string, number>();
  
  rankedKeywordHits.forEach((hit, index) => {
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
    const queryVector = requireValidVector(await provider.generateEmbedding(prepareRetrievalQuery(query)));
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
