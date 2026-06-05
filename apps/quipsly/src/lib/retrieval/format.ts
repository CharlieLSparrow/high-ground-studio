import { ManuscriptResearchPacket } from "@high-ground/quipsly-domain/retrieval";

/**
 * Formats a ManuscriptResearchPacket into a clean, legible string 
 * suitable for direct injection into an LLM context window.
 */
export function formatPacketForAssistant(packet: ManuscriptResearchPacket): string {
  if (packet.results.length === 0) {
    return `[System] Search for "${packet.query}" in library "${packet.librarySlug}" returned no results. Try searching for a broader term or a different concept.`;
  }

  let out = `[System] Search for "${packet.query}" returned ${packet.results.length} result(s):\n\n`;
  for (const r of packet.results) {
    out += `--- ${r.title} ---\n`;
    out += `Citation: ${r.citation}\n`;
    if (r.provenance.origin === "studio-span" || r.provenance.origin === "studio-knowledge") {
      out += `Document: ${r.provenance.documentTitle}\n`;
    }
    out += `Content: ${r.content}\n\n`;
  }
  return out.trim();
}
