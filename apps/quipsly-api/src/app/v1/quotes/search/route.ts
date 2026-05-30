import { coerceLimit, coerceVerificationStatus, jsonOk } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import type { QuipCardProjection, QuoteProjection, PersonProjection, SourceWorkProjection, ThemeProjection } from "@high-ground/quipsly-domain";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim().toLowerCase();
  const status = coerceVerificationStatus(url.searchParams.get("status"));
  const themeSlug = url.searchParams.get("theme");
  const limit = coerceLimit(url.searchParams.get("limit"));

  // First, find theme if specified
  let themeNodeId: string | undefined;
  if (themeSlug) {
    const themeNode = await prisma.quipslyNode.findUnique({
      where: { slug: themeSlug },
    });
    if (themeNode && themeNode.nodeType === "THEME") {
      themeNodeId = themeNode.id;
    }
  }

  // Find Quote Nodes
  const quoteNodes = await prisma.quipslyNode.findMany({
    where: {
      nodeType: "QUOTE",
      ...(status ? { status: status === "needs-review" ? "draft" : "published" } : {}),
      // If we only want quotes for a specific theme, filter by edge
      ...(themeNodeId ? {
        outgoingEdges: {
          some: {
            targetNodeId: themeNodeId,
            edgeType: "HAS_THEME",
          }
        }
      } : {})
    },
    include: {
      outgoingEdges: {
        include: { targetNode: true }
      }
    }
  });

  let cards: QuipCardProjection[] = [];

  for (const qNode of quoteNodes) {
    const quote = qNode.payloadJson as unknown as QuoteProjection;
    
    // Status filter fallback (since DB status is just draft/published but quote.verificationStatus is granular)
    if (status && quote.verificationStatus !== status) {
      continue;
    }

    const personNode = qNode.outgoingEdges.find(e => e.edgeType === "QUOTED_BY")?.targetNode;
    const sourceNode = qNode.outgoingEdges.find(e => e.edgeType === "APPEARS_IN")?.targetNode;
    const themeNodes = qNode.outgoingEdges.filter(e => e.edgeType === "HAS_THEME").map(e => e.targetNode);

    const card: QuipCardProjection = {
      quote,
      person: personNode ? (personNode.payloadJson as unknown as PersonProjection) : null as any,
      sourceWork: sourceNode ? (sourceNode.payloadJson as unknown as SourceWorkProjection) : null as any,
      themes: themeNodes.map(n => n.payloadJson as unknown as ThemeProjection),
    };

    if (query) {
      const haystack = [
        card.quote.text,
        card.person?.displayName,
        card.sourceWork?.title,
        ...card.themes.map(t => t.label)
      ].join(" ").toLowerCase();

      if (!haystack.includes(query)) {
        continue;
      }
    }

    cards.push(card);
  }

  cards = cards.slice(0, limit);

  return jsonOk({
    results: cards,
    count: cards.length,
    query: query ?? null,
    status: status ?? null,
    theme: themeSlug ?? null,
  });
}
