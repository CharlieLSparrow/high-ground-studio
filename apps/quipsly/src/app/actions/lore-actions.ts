"use server";

import { getPrismaClient } from "@/lib/prisma";
import { requireProjectAccess } from "../../lib/studio-authz";
import { revalidatePath } from "next/cache";
import { GoogleGenAI, Type } from "@google/genai";

/**
 * Saves a new semantic quote directly into the QuipLore knowledge base.
 * Automatically runs a background LLM task to classify and tag the quote.
 */
export async function saveQuoteToLore(
  projectId: string,
  text: string,
  context?: string,
  sourceTitle?: string
) {
  await requireProjectAccess(projectId, "write");

  const prisma = getPrismaClient();

  // If a source title is provided, try to find or create a generic QuipLoreSource
  let sourceId: string | undefined = undefined;
  if (sourceTitle) {
    let source = await prisma.quipLoreSource.findFirst({
      where: { projectId, title: sourceTitle }
    });
    if (!source) {
      source = await prisma.quipLoreSource.create({
        data: {
          projectId,
          title: sourceTitle,
          description: "Auto-generated source from Quipsly extraction"
        }
      });
    }
    sourceId = source.id;
  }

  const quote = await prisma.quipLoreQuote.create({
    data: {
      projectId,
      text,
      context,
      sourceId,
    }
  });

  // FIRE AND FORGET: ML Auto-Curation Task
  // We don't await this so the UI doesn't hang. In production, this would be a Cloud Task.
  simulateCloudTaskAutoCurate(projectId, quote.id, text, context).catch(console.error);

  // Invalidate any paths that might display lore
  revalidatePath(`/app/nests/${projectId}`);
  return quote;
}

async function simulateCloudTaskAutoCurate(projectId: string, quoteId: string, text: string, context?: string) {
  try {
    console.log(`[ML-Task] Starting auto-curation for quote ${quoteId}...`);
    const prisma = getPrismaClient();
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      console.warn(`[ML-Task] No API key found. Skipping auto-curation for quote ${quoteId}`);
      return;
    }
    const ai = new GoogleGenAI({ apiKey });
    
    // Fetch existing tags to use as vocabulary
    const existingTags = await prisma.quipLoreTag.findMany({
      where: { projectId },
      select: { name: true },
      take: 20
    });
    const vocab = existingTags.map((t: any) => t.name).join(", ");

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `You are a QuipLore archivist. Your job is to extract 1-3 concise tags (single words or hyphenated concepts) from the following quote. 
      Prefer existing tags if applicable: [${vocab}].
      
      Quote: "${text}"
      Context: ${context || "None"}
      `,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            tags: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          required: ["tags"]
        }
      }
    });

    const parsed = JSON.parse(response.text || "{\"tags\": []}");
    const tagsToApply: string[] = parsed.tags || [];

    for (const tagName of tagsToApply) {
      const cleanName = tagName.toLowerCase().replace(/[^a-z0-9-]/g, "");
      if (!cleanName) continue;

      // Upsert the tag
      let tag = await prisma.quipLoreTag.findFirst({
        where: { projectId, name: cleanName }
      });
      if (!tag) {
        tag = await prisma.quipLoreTag.create({
          data: { projectId, name: cleanName }
        });
      }
      
      // We use raw queries or nested connects if we had the many-to-many defined,
      // but schema says QuipLoreTag has 'quotes QuipLoreQuote[] @relation("QuoteTags")'.
      await prisma.quipLoreQuote.update({
        where: { id: quoteId },
        data: {
          tags: {
            connect: { id: tag.id }
          }
        }
      });
    }

    console.log(`[ML-Task] Finished auto-curation for quote ${quoteId}. Tags: ${tagsToApply.join(", ")}`);

    // --- Generate and store Semantic Vector Embedding ---
    try {
      console.log(`[ML-Task] Generating semantic embedding for quote ${quoteId}...`);
      const embedResponse = await ai.models.embedContent({
        model: "text-embedding-004",
        contents: text
      });
      
      const embedding = embedResponse.embeddings?.[0]?.values;
      if (embedding && embedding.length > 0) {
        const embeddingString = `[${embedding.join(',')}]`;
        await prisma.$executeRaw`
          UPDATE "QuipLoreQuote" 
          SET embedding = ${embeddingString}::vector 
          WHERE id = ${quoteId}
        `;
        console.log(`[ML-Task] Stored 768-dimensional embedding for quote ${quoteId}`);
      }
    } catch (embedErr) {
      console.error(`[ML-Task] Failed to generate or store embedding for quote ${quoteId}:`, embedErr);
    }
  } catch (err) {
    console.error(`[ML-Task] Failed auto-curation:`, err);
  }
}

/**
 * Performs a semantic nearest-neighbor search for quotes in a project.
 */
export async function searchSemanticQuotes(projectId: string, query: string, limit: number = 10) {
  await requireProjectAccess(projectId, "read");

  const prisma = getPrismaClient();
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("No API key available for semantic search.");
  }
  
  const ai = new GoogleGenAI({ apiKey });
  const embedResponse = await ai.models.embedContent({
    model: "text-embedding-004",
    contents: query
  });
  
  const queryEmbedding = embedResponse.embeddings?.[0]?.values;
  if (!queryEmbedding || queryEmbedding.length === 0) {
    throw new Error("Failed to generate embedding for query.");
  }

  const embeddingString = `[${queryEmbedding.join(',')}]`;

  // Prisma $queryRaw safely parameterizes the string.
  // The <=> operator computes cosine distance in pgvector.
  const quotes = await prisma.$queryRaw`
    SELECT id, text, context, "sourceId", "authorId", "workId", "projectId", "createdAt", "updatedAt"
    FROM "QuipLoreQuote"
    WHERE "projectId" = ${projectId}
      AND embedding IS NOT NULL
    ORDER BY embedding <=> ${embeddingString}::vector
    LIMIT ${limit}
  `;

  return quotes;
}

