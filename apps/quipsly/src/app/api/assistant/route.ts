import { executeExampleSearchAction, executeQuoteSearchAction } from "../../actions/research-actions";
import type { ManuscriptResearchPacket, RetrievalResult } from "@high-ground/quipsly-domain/retrieval";

export const maxDuration = 30;

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
  const citation = result.citation ? ` (${result.citation})` : "";
  const content = result.content.replace(/\s+/g, " ").trim();
  return `${index + 1}. ${result.title}: ${content}${citation}`;
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
  const query = getLatestUserMessage(body.messages);

  if (!projectId) {
    return new Response("Missing projectId context.", { status: 400 });
  }

  if (!query) {
    return new Response("Ask Quipsly what to find in the manuscript or source library.", { status: 400 });
  }

  const [examplesResult, quotesResult] = await Promise.allSettled([
    executeExampleSearchAction(query, projectId),
    executeQuoteSearchAction(query, projectId),
  ]);

  const sections = [
    "I searched the available source-backed Quipsly retrieval tools. I did not edit the manuscript.",
    "",
    examplesResult.status === "fulfilled"
      ? packetSection("Examples", examplesResult.value)
      : errorSection("Examples", examplesResult.reason),
    "",
    quotesResult.status === "fulfilled"
      ? packetSection("Quotes", quotesResult.value)
      : errorSection("Quotes", quotesResult.reason),
  ];

  return new Response(sections.join("\n"), {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
