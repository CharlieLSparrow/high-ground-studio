import { executeExampleSearchAction, executeQuoteSearchAction, executeContextSearchAction } from "../../actions/research-actions";
import type { ManuscriptResearchPacket, RetrievalResult } from "@high-ground/quipsly-domain/retrieval";

export const maxDuration = 60;

type AssistantMessage = {
  role?: string;
  content?: string;
};

function getLatestUserMessage(messages: unknown): string {
  if (!Array.isArray(messages)) return "";
  const latest = [...messages]
    .reverse()
    .find((message): message is AssistantMessage => {
      return Boolean(message && typeof message === "object" && (message as AssistantMessage).role === "user");
    });
  return typeof latest?.content === "string" ? latest.content.trim() : "";
}

function resultLine(result: RetrievalResult, index: number) {
  const prov = result.provenance;
  let sourceMeta = "";
  if (prov.origin === "studio-span") {
    sourceMeta = `[Document: ${prov.documentTitle} | Block: ${prov.blockStableId}]`;
  } else if (prov.origin === "studio-knowledge") {
    sourceMeta = `[Knowledge Node: ${prov.nodeType}]`;
  } else if (prov.origin === "quipsly-lore") {
    sourceMeta = `[Lore: ${prov.nodeSlug}]`;
  } else if (prov.origin === "source-aware") {
    sourceMeta = `[Immutable Source: ${prov.documentKind} | Selector: ${prov.selector.kind}]`;
  }

  const citation = result.citation ? ` (Reasoning: ${result.citation})` : "";
  const content = result.content.replace(/\s+/g, " ").trim();
  return `${index + 1}. ${result.title} ${sourceMeta}: ${content}${citation}`;
}

function packetSection(label: string, packet: ManuscriptResearchPacket) {
  if (!packet.results.length) return `${label}: no matching source-backed results found.`;
  return [
    `${label}: ${packet.results.length} source-backed result${packet.results.length === 1 ? "" : "s"}.`,
    ...packet.results.slice(0, 4).map(resultLine),
  ].join("\n");
}

function errorSection(label: string, error: unknown) {
  const message = error instanceof Error ? error.message : "Search failed.";
  return `${label}: search unavailable right now (${message}).`;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const projectId = typeof body.projectId === "string" && body.projectId.trim() ? body.projectId.trim() : "";
  const documentId = typeof body.documentId === "string" && body.documentId.trim() ? body.documentId.trim() : "";
  const cursorNodeId = typeof body.cursorNodeId === "string" && body.cursorNodeId.trim() ? body.cursorNodeId.trim() : "";
  const query = getLatestUserMessage(body.messages);

  if (!projectId) {
    return new Response(JSON.stringify({ message: "Missing projectId context." }), { 
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  if (!query) {
    return new Response(JSON.stringify({ message: "Ask Quipsly what to find in the manuscript or source library." }), { 
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const contextSearchPromise = (documentId && cursorNodeId)
    ? executeContextSearchAction(documentId, cursorNodeId, projectId, query)
    : Promise.resolve(null);

  const [examplesResult, quotesResult, contextResult] = await Promise.allSettled([
    executeExampleSearchAction(query, projectId),
    executeQuoteSearchAction(query, projectId),
    contextSearchPromise,
  ]);

  const packets: ManuscriptResearchPacket[] = [];
  
  if (examplesResult.status === "fulfilled" && examplesResult.value.results.length > 0) {
    packets.push(examplesResult.value);
  }
  
  if (contextResult.status === "fulfilled" && contextResult.value && contextResult.value.results.length > 0) {
    packets.push(contextResult.value);
  }
  
  if (quotesResult.status === "fulfilled" && quotesResult.value.results.length > 0) {
    packets.push(quotesResult.value);
  }

  const message = packets.length > 0 
    ? "I searched the available source-backed Quipsly retrieval tools to help you draft, rewrite, and organize."
    : "I searched the available source libraries but did not find any matching results.";

  return new Response(JSON.stringify({ message, packets }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
