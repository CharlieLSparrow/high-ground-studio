import { jsonError, jsonOk } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import type { PersonProjection, ThemeProjection, QuoteProjection, QuipCardProjection, SourceWorkProjection } from "@high-ground/quipsly-domain";

export async function GET(
  _request: Request,
  { params }: { readonly params: Promise<{ readonly slug: string }> },
) {
  const { slug } = await params;

  // 1. Fetch Person Node and relations
  const personNode = await prisma.quipslyNode.findFirst({
    where: { slug, nodeType: "PERSON", status: "published" },
    include: {
      outgoingEdges: {
        include: { targetNode: true }
      },
      incomingEdges: {
        include: { sourceNode: true }
      }
    }
  });

  if (!personNode) {
    return jsonError("Person not found.", 404);
  }

  const person = personNode.payloadJson as unknown as PersonProjection;

  // 2. Extract Themes
  const themes = personNode.outgoingEdges
    .filter(e => e.edgeType === "HAS_THEME")
    .map(e => e.targetNode.payloadJson as unknown as ThemeProjection);

  // 3. Extract Quotes (incoming QUOTED_BY edges)
  const quotes = personNode.incomingEdges
    .filter(e => e.edgeType === "QUOTED_BY" && e.sourceNode.status === "published")
    .map(e => e.sourceNode.payloadJson as unknown as QuoteProjection);

  // 4. Extract Related People
  const relatedPeople = personNode.outgoingEdges
    .filter(e => e.edgeType === "RELATED_TO" && e.targetNode.status === "published")
    .map(e => e.targetNode.payloadJson as unknown as PersonProjection);

  return jsonOk({
    person,
    themes,
    quotes,
    relatedPeople,
  });
}
