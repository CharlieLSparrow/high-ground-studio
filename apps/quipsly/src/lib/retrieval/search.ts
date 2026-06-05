import { getPrismaClient } from "../prisma";
import { hybridSearchExamples } from "./embeddings";
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
          id: { in: blendedHits.map(h => h.sourceId) }
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
