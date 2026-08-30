import { getPrismaClient } from "../prisma";
import { hybridSearchExamples, searchSemanticLoreQuotes } from "./embeddings";
import {
  SearchQuotesInput,
  SearchExamplesInput,
  ManuscriptResearchPacket,
  RetrievalResult,
  createEmptyPacket,
  createPacketId,
  createRetrievalResultId,
} from "@high-ground/quipsly-domain/retrieval";
import { resolveSourceLibrary } from "./resolveSourceLibrary";
import { Prisma } from "@prisma/client";
import { personalWritingDocumentVisibilityWhere } from "@/lib/server/personal-writing-documents";

/**
 * Searches for quotes matching a natural-language query using Prisma `contains`.
 * Queries QuipslyNode (QUOTE, EVIDENCE) and StudioKnowledgeNode (quote).
 */
export async function searchQuotes(
  input: SearchQuotesInput,
  context: { activeProjectId: string }
): Promise<ManuscriptResearchPacket> {
  const startTime = Date.now();
  const prisma = getPrismaClient();

  const librarySlug = input.library || "active-manuscript";
  const library = resolveSourceLibrary(librarySlug, context);
  const limit = input.limit || 20;

  // Track results
  const results: RetrievalResult[] = [];

  for (const backend of library.backends) {
    if (backend.type === "studio-project") {
      // Search StudioKnowledgeNode for quotes
      const knQuery: Prisma.StudioKnowledgeNodeWhereInput = {
        projectId: backend.projectId,
        nodeType: "quote",
        sourceText: { contains: input.query, mode: "insensitive" },
        // Project-wide retrieval includes shared Nest writing while personal
        // writing remains absent until the index itself is actor-partitioned.
        document: {
          OR: [{ personalOwnerUserId: null }, { isPrivate: false }],
        },
      };

      if (backend.nodeTypes && backend.nodeTypes.length > 0 && !backend.nodeTypes.includes("quote")) {
         // Skip if the backend filters out quotes
         continue;
      }

      const knResults = await prisma.studioKnowledgeNode.findMany({
        where: knQuery,
        take: limit,
      });

      for (const kn of knResults) {
        results.push({
          resultId: createRetrievalResultId(),
          content: kn.sourceText,
          title: kn.title || `Note from ${kn.documentTitleSnapshot || "Untitled Document"}`,
          relevanceScore: 1.0, // Keyword search doesn't rank well, default to 1
          citation: kn.tagLabel,
          verificationStatus: "needs-review", // Default for knowledge nodes unless mapped from tag
          provenance: {
            origin: "studio-knowledge",
            projectId: kn.projectId,
            knowledgeNodeId: kn.id,
            nodeType: kn.nodeType,
            reviewStatus: kn.reviewStatus,
            tagLabel: kn.tagLabel,
            documentStableId: kn.documentStableId,
            documentTitle: kn.documentTitleSnapshot,
            blockStableId: kn.blockStableId,
          },
        });
      }
    } else if (backend.type === "quipsly-lore") {
      // Safely extract text from payloadJson using standard Prisma if possible.
      // Since payload is unstructured in Prisma's eyes, we will fetch the nodes 
      // and do a lightweight text search in memory for this initial pass to 
      // prove out the `quiplore-archive` capability without raw SQL JSONB indexing.
      const loreQuery = backend.nodeTypes 
        ? { nodeType: { in: backend.nodeTypes as any } }
        : { nodeType: "QUOTE" as any };

      const loreNodes = await prisma.quipslyNode.findMany({
        where: loreQuery,
        take: limit * 5, // Fetch more to filter in memory
      });

      const matchedLore = loreNodes.filter((node) => {
        const payloadString = JSON.stringify(node.payloadJson).toLowerCase();
        return payloadString.includes(input.query.toLowerCase());
      }).slice(0, limit);

      for (const lore of matchedLore) {
        // Attempt to extract a decent title/content snippet
        const payload = lore.payloadJson as any;
        const snippet = payload.text || payload.content || payload.description || JSON.stringify(payload).slice(0, 150);
        const title = payload.title || payload.name || `Lore Node (${lore.slug})`;

        results.push({
          resultId: createRetrievalResultId(),
          content: snippet,
          title,
          relevanceScore: 1.0,
          citation: `Lore: ${lore.slug}`,
          verificationStatus: "needs-review",
          provenance: {
            origin: "quipsly-lore",
            nodeId: lore.id,
            nodeSlug: lore.slug,
            nodeType: lore.nodeType,
            nodeStatus: lore.status,
          },
        });
      }
    } else if (backend.type === "source-aware") {
      // Find matches in StudioSourceUnit
      const units = await prisma.studioSourceUnit.findMany({
        where: {
          projectId: backend.projectId,
          OR: [
            { title: { contains: input.query, mode: "insensitive" } },
            { immutableText: { contains: input.query, mode: "insensitive" } },
          ],
        },
        take: limit,
      });

      for (const unit of units) {
        results.push({
          resultId: createRetrievalResultId(),
          content: unit.immutableText || "",
          title: unit.title,
          relevanceScore: 1.0,
          citation: unit.kind,
          verificationStatus: "needs-review",
          provenance: {
            origin: "source-aware",
            projectId: backend.projectId,
            sourceDocumentId: unit.id,
            documentKind: unit.kind as any,
            selector: {
              kind: "whole-document",
              sourceDocumentId: unit.id,
            },
          },
        });
      }
    } else if (backend.type === "semantic-lore") {
      const vectorHits = await searchSemanticLoreQuotes(input.query, backend.projectId, limit);
      let quotes: any[] = [];
      
      if (vectorHits.length > 0) {
        // Fetch full objects with relations
        const fullQuotes = await prisma.quipLoreQuote.findMany({
          where: { id: { in: vectorHits.map(h => h.id) } },
          include: { work: true, source: true, author: true }
        });
        // Sort back to vector distance order
        quotes = vectorHits.map(h => fullQuotes.find(q => q.id === h.id)).filter(q => q !== undefined);
      } else {
        // Fallback to keyword search if vector returns nothing (e.g. no API key or no embeddings yet)
        quotes = await prisma.quipLoreQuote.findMany({
          where: {
            projectId: backend.projectId,
            OR: [
              { text: { contains: input.query, mode: "insensitive" } },
              { context: { contains: input.query, mode: "insensitive" } },
            ],
          },
          include: {
            work: true,
            source: true,
            author: true,
          },
          take: limit,
        });
      }

      for (const quote of quotes) {
        const titleParts = [];
        if (quote.work) titleParts.push(quote.work.title);
        if (quote.source) titleParts.push(quote.source.title);
        if (quote.author) titleParts.push(quote.author.name);
        
        const title = titleParts.length > 0 ? titleParts.join(" - ") : "Untitled Semantic Lore";

        results.push({
          resultId: createRetrievalResultId(),
          content: quote.text + (quote.context ? `\n\nContext: ${quote.context}` : ""),
          title: title,
          relevanceScore: 1.0,
          citation: "Semantic Lore Match",
          verificationStatus: "needs-review",
          provenance: {
            origin: "semantic-lore",
            quoteId: quote.id,
            workId: quote.workId || undefined,
            sourceId: quote.sourceId || undefined,
          },
        });
      }
    }
  }

  // If verification filters apply, filter results
  let filteredResults = results;
  if (input.verificationFilter && input.verificationFilter.length > 0) {
    filteredResults = results.filter((r) =>
      input.verificationFilter!.includes(r.verificationStatus)
    );
  }

  // Sort by resultId just to be deterministic for now
  filteredResults = filteredResults.slice(0, limit);

  if (filteredResults.length === 0) {
    return createEmptyPacket({
      query: input.query,
      intent: "quote-search",
      librarySlug: library.slug,
      startTime,
    });
  }

  // Distinct sources covered
  const sourcesCovered = new Set(
    filteredResults.map((r) => {
      if (r.provenance.origin === "studio-knowledge") return r.provenance.knowledgeNodeId;
      if (r.provenance.origin === "quipsly-lore") return r.provenance.nodeId;
      if (r.provenance.origin === "studio-span") return r.provenance.blockStableId;
      return r.resultId;
    })
  ).size;

  return {
    packetId: createPacketId(),
    query: input.query,
    intent: "quote-search",
    librarySlug: library.slug,
    results: filteredResults,
    meta: {
      retrievedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      resultCount: filteredResults.length,
      sourcesCovered,
      truncated: filteredResults.length === limit,
    },
  };
}

/**
 * Searches for examples and passages using Prisma `contains`.
 * Queries StudioDocumentBlock.
 */
export async function searchExamples(
  input: SearchExamplesInput,
  context: { activeProjectId: string }
): Promise<ManuscriptResearchPacket> {
  const startTime = Date.now();
  const prisma = getPrismaClient();

  const librarySlug = input.library || "active-manuscript";
  const library = resolveSourceLibrary(librarySlug, context);
  const limit = input.limit || 20;

  const results: RetrievalResult[] = [];

  for (const backend of library.backends) {
    if (backend.type === "studio-project") {
      // Use the hybrid search (keyword + mock pgvector RRF blending)
      const blendedHits = await hybridSearchExamples(input.query, backend.projectId, limit);

      if (blendedHits.length === 0) continue;

      const blockResults = await prisma.studioDocumentBlock.findMany({
        where: {
          id: { in: blendedHits.map(h => h.sourceId) },
          // Keep the read boundary explicit even if a stale or malformed
          // embedding row points at a personal document.
          document: {
            OR: [{ personalOwnerUserId: null }, { isPrivate: false }],
          },
        },
        include: {
          document: {
            select: {
              stableId: true,
              title: true,
            }
          }
        }
      });

      // Map back to the blended order
      const orderedBlocks = blendedHits
        .map(hit => blockResults.find(b => b.id === hit.sourceId))
        .filter((b): b is NonNullable<typeof b> => b !== undefined);

      for (const block of orderedBlocks) {
        results.push({
          resultId: createRetrievalResultId(),
          content: block.body,
          title: block.title || `Block from ${block.document.title || 'Untitled Document'}`,
          relevanceScore: 1.0,
          citation: block.sourceLabel || "Active Document",
          verificationStatus: "needs-review",
          provenance: {
            origin: "studio-span",
            projectId: backend.projectId,
            documentId: block.documentId,
            documentStableId: block.document.stableId,
            documentTitle: block.document.title || "Untitled Document",
            blockId: block.id,
            blockStableId: block.stableId,
            sourceLabel: block.sourceLabel || undefined,
            sourcePath: block.sourcePath || undefined,
          },
        });
      }
    } else if (backend.type === "quipsly-lore") {
       // For examples, we also perform an in-memory search on the JSON payload
       const loreNodes = await prisma.quipslyNode.findMany({ take: limit * 5 });
       const matchedLore = loreNodes.filter((node) => {
         const payloadString = JSON.stringify(node.payloadJson).toLowerCase();
         return payloadString.includes(input.query.toLowerCase());
       }).slice(0, limit);
 
       for (const lore of matchedLore) {
         const payload = lore.payloadJson as any;
         const snippet = payload.text || payload.content || payload.description || JSON.stringify(payload).slice(0, 150);
         const title = payload.title || payload.name || `Lore Node (${lore.slug})`;
 
         results.push({
           resultId: createRetrievalResultId(),
           content: snippet,
           title,
           relevanceScore: 1.0,
           citation: `Lore: ${lore.slug}`,
           verificationStatus: "needs-review",
           provenance: {
             origin: "quipsly-lore",
             nodeId: lore.id,
             nodeSlug: lore.slug,
             nodeType: lore.nodeType,
             nodeStatus: lore.status,
           },
         });
       }
    } else if (backend.type === "source-aware") {
      // Find matches in StudioSourceUnit
      const units = await prisma.studioSourceUnit.findMany({
        where: {
          projectId: backend.projectId,
          OR: [
            { title: { contains: input.query, mode: "insensitive" } },
            { immutableText: { contains: input.query, mode: "insensitive" } },
            { editableNotes: { contains: input.query, mode: "insensitive" } },
          ],
        },
        take: limit,
      });

      for (const unit of units) {
        results.push({
          resultId: createRetrievalResultId(),
          content: unit.immutableText || unit.editableNotes || "",
          title: unit.title,
          relevanceScore: 1.0,
          citation: unit.kind,
          verificationStatus: "needs-review",
          provenance: {
            origin: "source-aware",
            projectId: backend.projectId,
            sourceDocumentId: unit.id,
            documentKind: unit.kind as any,
            selector: {
              kind: "whole-document",
              sourceDocumentId: unit.id,
            },
          },
        });
      }
    } else if (backend.type === "semantic-lore") {
      const vectorHits = await searchSemanticLoreQuotes(input.query, backend.projectId, limit);
      let quotes: any[] = [];
      
      if (vectorHits.length > 0) {
        // Fetch full objects with relations
        const fullQuotes = await prisma.quipLoreQuote.findMany({
          where: { id: { in: vectorHits.map(h => h.id) } },
          include: { work: true, source: true, author: true }
        });
        // Sort back to vector distance order
        quotes = vectorHits.map(h => fullQuotes.find(q => q.id === h.id)).filter(q => q !== undefined);
      } else {
        // Fallback to keyword search if vector returns nothing
        quotes = await prisma.quipLoreQuote.findMany({
          where: {
            projectId: backend.projectId,
            OR: [
              { text: { contains: input.query, mode: "insensitive" } },
              { context: { contains: input.query, mode: "insensitive" } },
            ],
          },
          include: {
            work: true,
            source: true,
            author: true,
          },
          take: limit,
        });
      }

      for (const quote of quotes) {
        const titleParts = [];
        if (quote.work) titleParts.push(quote.work.title);
        if (quote.source) titleParts.push(quote.source.title);
        if (quote.author) titleParts.push(quote.author.name);
        
        const title = titleParts.length > 0 ? titleParts.join(" - ") : "Untitled Semantic Lore";

        results.push({
          resultId: createRetrievalResultId(),
          content: quote.text + (quote.context ? `\n\nContext: ${quote.context}` : ""),
          title: title,
          relevanceScore: 1.0,
          citation: "Semantic Lore Match",
          verificationStatus: "needs-review",
          provenance: {
            origin: "semantic-lore",
            quoteId: quote.id,
            workId: quote.workId || undefined,
            sourceId: quote.sourceId || undefined,
          },
        });
      }
    }
  }

  const limitedResults = results.slice(0, limit);

  if (limitedResults.length === 0) {
    return createEmptyPacket({
      query: input.query,
      intent: "example-search",
      librarySlug: library.slug,
      startTime,
    });
  }

  const sourcesCovered = new Set(
    limitedResults.map((r) => {
      if (r.provenance.origin === "studio-span") return r.provenance.documentStableId;
      return r.resultId;
    })
  ).size;

  return {
    packetId: createPacketId(),
    query: input.query,
    intent: "example-search",
    librarySlug: library.slug,
    results: limitedResults,
    meta: {
      retrievedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      resultCount: limitedResults.length,
      sourcesCovered,
      truncated: limitedResults.length === limit,
    },
  };
}

/**
 * Builds a contextual research packet based on the active document and cursor position.
 * Queries `StudioDocumentBlock` and `StudioTaggedSpan` for related content.
 */
export async function buildContextPacket(
  input: {
    readonly documentId: string;
    readonly cursorNodeId: string;
    readonly cursorOffset?: number;
    readonly additionalQuery?: string;
    readonly library?: string;
    readonly limit?: number;
  },
  context: { activeProjectId: string; actorUserId?: string | null }
): Promise<ManuscriptResearchPacket> {
  const startTime = Date.now();
  const prisma = getPrismaClient();

  const limit = input.limit || 15;
  const librarySlug = input.library || "active-manuscript";

  const results: RetrievalResult[] = [];

  // 1. Fetch nearby blocks for structural context
  const targetBlock = await prisma.studioDocumentBlock.findFirst({
    where: {
      documentId: input.documentId,
      document: {
        projectId: context.activeProjectId,
        ...personalWritingDocumentVisibilityWhere(context.actorUserId),
      },
      stableId: input.cursorNodeId,
    },
  });

  if (targetBlock) {
    // Get surround blocks (a crude chunking context)
    const contextBlocks = await prisma.studioDocumentBlock.findMany({
      where: {
        documentId: input.documentId,
        order: {
          gte: targetBlock.order - 2,
          lte: targetBlock.order + 2,
        },
      },
      orderBy: { order: 'asc' },
    });

    const combinedText = contextBlocks.map(b => b.body).join('\n\n');
    
    results.push({
      resultId: createRetrievalResultId(),
      content: combinedText,
      title: `Surrounding Context (Block ${targetBlock.stableId})`,
      relevanceScore: 1.0,
      citation: targetBlock.sourceLabel || "Active Document",
      verificationStatus: "verified",
      provenance: {
        origin: "studio-span",
        projectId: context.activeProjectId,
        documentId: targetBlock.documentId,
        documentStableId: input.documentId, // Fallback, would prefer true stableId
        documentTitle: "Active Document Context",
        blockId: targetBlock.id,
        blockStableId: targetBlock.stableId,
      },
    });
  }

  // 2. Fetch specific tagged spans or highlighted notes in this document
  // Prioritize if an additionalQuery is provided
  const whereClause: any = {
    documentId: input.documentId,
    document: {
      projectId: context.activeProjectId,
      ...personalWritingDocumentVisibilityWhere(context.actorUserId),
    },
  };
  
  if (input.additionalQuery) {
    whereClause.body = { contains: input.additionalQuery, mode: "insensitive" };
  }

  const relatedBlocks = await prisma.studioDocumentBlock.findMany({
    where: whereClause,
    take: limit,
    include: {
      document: { select: { stableId: true, title: true } },
    },
  });

  for (const block of relatedBlocks) {
    // Avoid duplicating the target block context
    if (targetBlock && block.id === targetBlock.id) continue;

    results.push({
      resultId: createRetrievalResultId(),
      content: block.body,
      title: block.title || `Block from ${block.document.title || 'Untitled'}`,
      relevanceScore: 0.8,
      citation: block.sourceLabel || "Active Document",
      verificationStatus: "needs-review",
      provenance: {
        origin: "studio-span",
        projectId: context.activeProjectId,
        documentId: block.documentId,
        documentStableId: block.document.stableId,
        documentTitle: block.document.title || "Untitled Document",
        blockId: block.id,
        blockStableId: block.stableId,
      },
    });
  }

  // 3. Fetch Semantic Lore context
  const searchQuery = input.additionalQuery || (targetBlock ? targetBlock.body.split(/\s+/).filter(w => w.length > 5).slice(0, 2).join(" ") : "");
  
  if (searchQuery) {
    const vectorHits = await searchSemanticLoreQuotes(searchQuery, context.activeProjectId, 3);
    let loreQuotes: any[] = [];
    
    if (vectorHits.length > 0) {
      // Fetch full objects with relations
      const fullQuotes = await prisma.quipLoreQuote.findMany({
        where: { id: { in: vectorHits.map(h => h.id) } },
        include: { work: true, source: true, author: true }
      });
      // Sort back to vector distance order
      loreQuotes = vectorHits.map(h => fullQuotes.find(q => q.id === h.id)).filter(q => q !== undefined);
    } else {
      // Fallback
      loreQuotes = await prisma.quipLoreQuote.findMany({
        where: {
          projectId: context.activeProjectId,
          OR: [
            { text: { contains: searchQuery, mode: "insensitive" } },
            { context: { contains: searchQuery, mode: "insensitive" } },
          ],
        },
        include: {
          work: true,
          source: true,
          author: true,
        },
        take: 3,
      });
    }

    for (const quote of loreQuotes) {
      const titleParts = [];
      if (quote.work) titleParts.push(quote.work.title);
      if (quote.source) titleParts.push(quote.source.title);
      if (quote.author) titleParts.push(quote.author.name);
      
      const title = titleParts.length > 0 ? titleParts.join(" - ") : "Untitled Semantic Lore";

      results.push({
        resultId: createRetrievalResultId(),
        content: quote.text + (quote.context ? `\n\nContext: ${quote.context}` : ""),
        title: title,
        relevanceScore: 0.85,
        citation: "Contextual Lore Match",
        verificationStatus: "needs-review",
        provenance: {
          origin: "semantic-lore",
          quoteId: quote.id,
          workId: quote.workId || undefined,
          sourceId: quote.sourceId || undefined,
        },
      });
    }
  }

  const limitedResults = results.slice(0, limit);

  if (limitedResults.length === 0) {
    return createEmptyPacket({
      query: input.additionalQuery || `Cursor Context: ${input.cursorNodeId}`,
      intent: "thematic-context",
      librarySlug,
      startTime,
    });
  }

  const sourcesCovered = new Set(
    limitedResults.map((r) => {
      if (r.provenance.origin === "studio-span") return r.provenance.documentStableId;
      return r.resultId;
    })
  ).size;

  return {
    packetId: createPacketId(),
    query: input.additionalQuery || `Cursor Context: ${input.cursorNodeId}`,
    intent: "thematic-context",
    librarySlug,
    results: limitedResults,
    meta: {
      retrievedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      resultCount: limitedResults.length,
      sourcesCovered,
      truncated: results.length > limit,
    },
  };
}
